import { describe, it, expect, vi } from 'vitest';
import {
  mapProjectProgressFields,
  normalizeProjectProgressEntry,
  extractProjectProgressResult,
  registerProjectProgressTools,
} from '../../../src/tools/project-progress.js';
import type { EffectiveUserContext } from '../../../src/auth/effective-user-context.js';

function createFakeServer() {
  const tools = new Map<string, { config: unknown; cb: (args: Record<string, unknown>) => Promise<any> }>();
  const server = {
    registerTool: (name: string, config: unknown, cb: (args: Record<string, unknown>) => Promise<any>) => {
      tools.set(name, { config, cb });
    },
  };
  return { server: server as any, tools };
}

function createFakeClients() {
  return {
    restV1: {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
    },
  } as any;
}

function makeContext(overrides: Partial<EffectiveUserContext> = {}): EffectiveUserContext {
  return {
    source: 'token',
    company: 'acme',
    accountId: 1,
    userId: 42,
    languageId: 1,
    email: 'pmo@acme.com',
    licenseTypeIds: [1],
    dataMartAccess: 'full',
    authHeaders: { Token: 't' },
    grantedScopes: ['mcp:read', 'mcp:write'],
    ...overrides,
  };
}

const V1_ROW = {
  ProjectProgressId: 55,
  ProjectId: 100,
  Assessment: { AssessmentId: 3, AssessmentName: 'Bueno', AssessmentIcon: null },
  ShortDescription: 'On track',
  DetailDescription: 'All milestones green',
  PercentageCompleted: 60,
  ReportDate: '2026-08-06',
  ProjectProgressExpected: 65,
  ProgressBaselineExpected: 70,
  CreatedBy: { UserId: 42, EmailAddress: 'pmo@acme.com', DisplayName: 'PMO' },
  AllCustomFields: { Sponsor: 'CEO' },
};

describe('mapProjectProgressFields', () => {
  it('maps camelCase inputs to the v1 payload keys', () => {
    expect(mapProjectProgressFields({
      reportDate: '2026-08-06',
      percentage: 60,
      assessmentId: 3,
      shortDescription: 'On track',
      description: 'Details',
    })).toEqual({
      ReportDate: '2026-08-06',
      PercentageCompleted: 60,
      AssessmentId: 3,
      ShortDescription: 'On track',
      DetailDescription: 'Details',
    });
  });

  it('omits fields that were not supplied', () => {
    expect(mapProjectProgressFields({ percentage: 10 })).toEqual({ PercentageCompleted: 10 });
  });
});

describe('normalizeProjectProgressEntry', () => {
  it('flattens the v1 row to the task-progress-style shape', () => {
    expect(normalizeProjectProgressEntry(V1_ROW)).toEqual({
      ProjectProgressId: 55,
      ProjectId: 100,
      ReportDate: '2026-08-06',
      Percentage: 60,
      AssessmentId: 3,
      AssessmentName: 'Bueno',
      ShortDescription: 'On track',
      Description: 'All milestones green',
      CreatedBy: { UserId: 42, EmailAddress: 'pmo@acme.com', DisplayName: 'PMO' },
      CustomFields: { Sponsor: 'CEO' },
    });
  });

  it('tolerates a null assessment and missing custom fields', () => {
    const normalized = normalizeProjectProgressEntry({ ...V1_ROW, Assessment: null, AllCustomFields: undefined });
    expect(normalized.AssessmentId).toBeNull();
    expect(normalized.AssessmentName).toBeNull();
    expect(normalized).not.toHaveProperty('CustomFields');
  });
});

describe('extractProjectProgressResult', () => {
  it('returns the id on a 201 body', () => {
    expect(extractProjectProgressResult({ ProjectProgressId: 55, StatusCode: 201, StatusMessage: 'ok' }, 'create')).toBe(55);
  });

  it('throws the REST StatusMessage on a body-level failure', () => {
    expect(() => extractProjectProgressResult(
      { ProjectProgressId: 0, StatusCode: 400, StatusMessage: 'Please enter valid assessment' },
      'create',
    )).toThrow('Please enter valid assessment');
  });
});

describe('project progress tools', () => {
  function setup(ctx = makeContext()) {
    const { server, tools } = createFakeServer();
    const clients = createFakeClients();
    registerProjectProgressTools(server, clients, ctx);
    return { tools, clients };
  }

  it('registers nothing without the write scope', () => {
    const { server, tools } = createFakeServer();
    registerProjectProgressTools(server, createFakeClients(), makeContext({ grantedScopes: ['mcp:read'] }));
    expect(tools.size).toBe(0);
  });

  it('create posts the v1 payload and returns the normalized readback row', async () => {
    const { tools, clients } = setup();
    clients.restV1.post.mockResolvedValue({ ProjectProgressId: 55, StatusCode: 201, StatusMessage: 'ok' });
    clients.restV1.get.mockResolvedValue([V1_ROW, { ...V1_ROW, ProjectProgressId: 54, PercentageCompleted: 40 }]);

    const result = await tools.get('create_project_progress')!.cb({
      projectId: 100,
      reportDate: '2026-08-06',
      percentage: 60,
      assessmentId: 3,
      shortDescription: 'On track',
      description: 'All milestones green',
    });

    expect(clients.restV1.post).toHaveBeenCalledWith('project/100/progress', {
      ReportDate: '2026-08-06',
      PercentageCompleted: 60,
      AssessmentId: 3,
      ShortDescription: 'On track',
      DetailDescription: 'All milestones green',
    });
    expect(clients.restV1.get).toHaveBeenCalledWith('project/100/progress');
    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;
    expect(text).toContain('"ProjectProgressId": 55');
    expect(text).toContain('"Percentage": 60');
    expect(text).toContain('"AssessmentName": "Bueno"');
  });

  it('create surfaces body-level REST failures as tool errors', async () => {
    const { tools, clients } = setup();
    clients.restV1.post.mockResolvedValue({ ProjectProgressId: 0, StatusCode: 400, StatusMessage: 'Please enter valid assessment' });

    const result = await tools.get('create_project_progress')!.cb({
      projectId: 100, reportDate: '2026-08-06', percentage: 60, assessmentId: 999, shortDescription: 'x',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Please enter valid assessment');
    expect(clients.restV1.get).not.toHaveBeenCalled();
  });

  it('create throws when the readback does not match the request', async () => {
    const { tools, clients } = setup();
    clients.restV1.post.mockResolvedValue({ ProjectProgressId: 55, StatusCode: 201 });
    clients.restV1.get.mockResolvedValue([{ ...V1_ROW, PercentageCompleted: 10 }]);

    await expect(tools.get('create_project_progress')!.cb({
      projectId: 100, reportDate: '2026-08-06', percentage: 60, assessmentId: 3, shortDescription: 'On track',
    })).rejects.toThrow(/verification/i);
  });

  it('update PUTs the supplied fields and merges the stored assessment and percentage', async () => {
    const { tools, clients } = setup();
    clients.restV1.put.mockResolvedValue({ ProjectProgressId: 55, StatusCode: 200, StatusMessage: 'updated' });
    clients.restV1.get
      .mockResolvedValueOnce([V1_ROW])
      .mockResolvedValueOnce([{ ...V1_ROW, PercentageCompleted: 80 }]);

    const result = await tools.get('update_project_progress')!.cb({
      projectId: 100, progressId: 55, percentage: 80,
    });

    // AssessmentId rides along because the v1 PUT would otherwise receive 0.
    expect(clients.restV1.put).toHaveBeenCalledWith('project/100/progress/55', {
      PercentageCompleted: 80,
      AssessmentId: 3,
    });
    expect(result.content[0].text).toContain('"Percentage": 80');
  });

  it('update requires at least one field to change', async () => {
    const { tools, clients } = setup();

    const result = await tools.get('update_project_progress')!.cb({ projectId: 100, progressId: 55 });

    expect(result.isError).toBe(true);
    expect(clients.restV1.put).not.toHaveBeenCalled();
  });

  it('update fails clearly when the entry does not exist', async () => {
    const { tools, clients } = setup();
    clients.restV1.get.mockResolvedValue([V1_ROW]);

    const result = await tools.get('update_project_progress')!.cb({ projectId: 100, progressId: 999, percentage: 10 });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('not found');
    expect(clients.restV1.put).not.toHaveBeenCalled();
  });

  it('create fails clearly when the created row is missing from the readback', async () => {
    const { tools, clients } = setup();
    clients.restV1.post.mockResolvedValue({ ProjectProgressId: 999, StatusCode: 201 });
    clients.restV1.get.mockResolvedValue([V1_ROW]);

    await expect(tools.get('create_project_progress')!.cb({
      projectId: 100, reportDate: '2026-08-06', percentage: 60, assessmentId: 3, shortDescription: 'On track',
    })).rejects.toThrow(/readback/i);
  });
});
