import { describe, it, expect, vi } from 'vitest';
import {
  splitCreateTaskProgressArgs,
  splitUpdateTaskProgressArgs,
  registerProgressTools,
  TASK_PROGRESS_VERIFICATION_FIELDS,
} from '../../../src/tools/progress.js';
import { verifyRequestedFields, STALE_AFTER_WRITE_NOTICE } from '../../../src/tools/write-tools.js';
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
    rest: {
      get: vi.fn(),
      post: vi.fn(),
      patch: vi.fn(),
    },
  } as any;
}

describe('splitCreateTaskProgressArgs', () => {
  it('builds the v2 progress path and maps camelCase inputs to PascalCase payload', () => {
    const { path, body } = splitCreateTaskProgressArgs({
      projectId: 100,
      taskId: 42,
      reportDate: '2026-07-13',
      percentage: 60,
      assessmentId: 3,
      shortDescription: 'On track',
      description: 'Detailed notes',
    });
    expect(path).toBe('projects/100/tasks/42/progress');
    expect(body).toEqual({
      ReportDate: '2026-07-13',
      Percentage: 60,
      AssessmentId: 3,
      ShortDescription: 'On track',
      Description: 'Detailed notes',
      AutoProjectFollowUp: true,
    });
    expect(body).not.toHaveProperty('projectId');
    expect(body).not.toHaveProperty('taskId');
  });

  it('omits description when not supplied but still sends AutoProjectFollowUp', () => {
    const { body } = splitCreateTaskProgressArgs({
      projectId: 100,
      taskId: 42,
      reportDate: '2026-07-13',
      percentage: 25,
      assessmentId: 3,
      shortDescription: 'Started',
    });
    expect(body).not.toHaveProperty('Description');
    expect(body.AutoProjectFollowUp).toBe(true);
  });
});

describe('splitUpdateTaskProgressArgs', () => {
  it('builds the path with progressId and sends only supplied fields', () => {
    const { path, body } = splitUpdateTaskProgressArgs({
      projectId: 100,
      taskId: 42,
      progressId: 77,
      percentage: 80,
    });
    expect(path).toBe('projects/100/tasks/42/progress/77');
    expect(body).toEqual({ Percentage: 80, AutoProjectFollowUp: true });
  });

  it('throws when no updatable field is supplied', () => {
    expect(() => splitUpdateTaskProgressArgs({
      projectId: 100,
      taskId: 42,
      progressId: 77,
    })).toThrow('at least one field');
  });
});

describe('TASK_PROGRESS_VERIFICATION_FIELDS', () => {
  it('accepts a readback that matches the requested progress fields', () => {
    expect(() => verifyRequestedFields(
      { Percentage: 60, ShortDescription: 'On track', ReportDate: '2026-07-13' },
      { Percentage: 60, ShortDescription: 'On track', ReportDate: '2026-07-13T14:22:31' },
      TASK_PROGRESS_VERIFICATION_FIELDS,
      'create_task_progress',
    )).not.toThrow();
  });

  it('fails when the readback shows a different percentage', () => {
    expect(() => verifyRequestedFields(
      { Percentage: 60 },
      { Percentage: 55 },
      TASK_PROGRESS_VERIFICATION_FIELDS,
      'create_task_progress',
    )).toThrow('expected 60 but read back 55');
  });
});

describe('registerProgressTools', () => {
  it('registers all four tools when no user context is provided (api-key session)', () => {
    const { server, tools } = createFakeServer();
    registerProgressTools(server, createFakeClients());
    expect([...tools.keys()].sort()).toEqual([
      'create_task_progress', 'get_project_progress', 'list_task_progress', 'update_task_progress',
    ]);
  });

  it('registers only read tools when mcp:write scope is missing', () => {
    const { server, tools } = createFakeServer();
    const ctx = { grantedScopes: ['mcp:read'] } as EffectiveUserContext;
    registerProgressTools(server, createFakeClients(), ctx);
    expect([...tools.keys()].sort()).toEqual(['get_project_progress', 'list_task_progress']);
  });

  it('list_task_progress GETs the task progress path', async () => {
    const { server, tools } = createFakeServer();
    const clients = createFakeClients();
    clients.rest.get.mockResolvedValue([{ TaskFollowUpId: 9, Percentage: 50 }]);
    registerProgressTools(server, clients);

    const result = await tools.get('list_task_progress')!.cb({ projectId: 100, taskId: 42 });

    expect(clients.rest.get).toHaveBeenCalledWith('projects/100/tasks/42/progress');
    expect(JSON.parse(result.content[0].text)).toEqual([{ TaskFollowUpId: 9, Percentage: 50 }]);
  });

  it('get_project_progress GETs the progressreports path', async () => {
    const { server, tools } = createFakeServer();
    const clients = createFakeClients();
    clients.rest.get.mockResolvedValue({ Expected: [], FollowUps: [] });
    registerProgressTools(server, clients);

    const result = await tools.get('get_project_progress')!.cb({ projectId: 100 });

    expect(clients.rest.get).toHaveBeenCalledWith('projects/100/progressreports');
    expect(JSON.parse(result.content[0].text)).toEqual({ Expected: [], FollowUps: [] });
  });

  it('create_task_progress POSTs, reads back the created entry, and returns it with the stale notice', async () => {
    const { server, tools } = createFakeServer();
    const clients = createFakeClients();
    const readback = {
      TaskFollowUpId: 55, TaskId: 42, Percentage: 60,
      ShortDescription: 'On track', AssessmentId: 3, ReportDate: '2026-07-13T10:00:00',
    };
    clients.rest.post.mockResolvedValue({ Id: 55, StatusCode: 201 });
    clients.rest.get.mockResolvedValue(readback);
    registerProgressTools(server, clients);

    const result = await tools.get('create_task_progress')!.cb({
      projectId: 100, taskId: 42, reportDate: '2026-07-13', percentage: 60,
      assessmentId: 3, shortDescription: 'On track',
    });

    expect(clients.rest.post).toHaveBeenCalledWith('projects/100/tasks/42/progress', {
      ReportDate: '2026-07-13', Percentage: 60, AssessmentId: 3,
      ShortDescription: 'On track', AutoProjectFollowUp: true,
    });
    expect(clients.rest.get).toHaveBeenCalledWith('projects/100/tasks/42/progress/55');
    expect(JSON.parse(result.content[0].text)).toEqual(readback);
    expect(result.content[1].text).toBe(STALE_AFTER_WRITE_NOTICE);
  });

  it('create_task_progress rejects when the readback does not match the request', async () => {
    const { server, tools } = createFakeServer();
    const clients = createFakeClients();
    clients.rest.post.mockResolvedValue({ Id: 55 });
    clients.rest.get.mockResolvedValue({ TaskFollowUpId: 55, Percentage: 10 });
    registerProgressTools(server, clients);

    await expect(tools.get('create_task_progress')!.cb({
      projectId: 100, taskId: 42, reportDate: '2026-07-13', percentage: 60,
      assessmentId: 3, shortDescription: 'On track',
    })).rejects.toThrow('write verification failed');
  });

  it('update_task_progress PATCHes only supplied fields and reads back the same path', async () => {
    const { server, tools } = createFakeServer();
    const clients = createFakeClients();
    const readback = { TaskFollowUpId: 77, TaskId: 42, Percentage: 80 };
    clients.rest.patch.mockResolvedValue({ Id: 77 });
    clients.rest.get.mockResolvedValue(readback);
    registerProgressTools(server, clients);

    const result = await tools.get('update_task_progress')!.cb({
      projectId: 100, taskId: 42, progressId: 77, percentage: 80,
    });

    expect(clients.rest.patch).toHaveBeenCalledWith('projects/100/tasks/42/progress/77', {
      Percentage: 80, AutoProjectFollowUp: true,
    });
    expect(clients.rest.get).toHaveBeenCalledWith('projects/100/tasks/42/progress/77');
    expect(JSON.parse(result.content[0].text)).toEqual(readback);
  });
});
