import { describe, it, expect, vi } from 'vitest';
import {
  buildWriteResponse, buildInsufficientScopeResponse, STALE_AFTER_WRITE_NOTICE,
  splitCreateTaskArgs, splitUpdateTaskArgs, splitCreateRiskArgs,
  splitCreateIssueArgs, splitUpdateProjectArgs, mapReferenceIdToBaseId,
  verifyRequestedFields, getCreateTaskValidationError, registerWriteTools,
} from '../../../src/tools/write-tools.js';

describe('buildInsufficientScopeResponse', () => {
  it('returns isError true with insufficient_scope message', () => {
    const response = buildInsufficientScopeResponse();
    expect(response.isError).toBe(true);
    expect(response.content).toHaveLength(1);
    expect(response.content[0].text).toContain('insufficient_scope');
    expect(response.content[0].text).toContain('mcp:write');
  });
});

describe('buildWriteResponse', () => {
  it('returns two content items (JSON data + stale notice)', () => {
    const response = buildWriteResponse({ Id: 42, Name: 'Test' });
    expect(response.content).toHaveLength(2);
    expect(response.content[0].type).toBe('text');
    expect(response.content[1].type).toBe('text');
  });

  it('first item is valid JSON of the data', () => {
    const data = { Id: 42, Name: 'Test' };
    const response = buildWriteResponse(data);
    expect(JSON.parse(response.content[0].text)).toEqual(data);
  });

  it('second item contains stale-after-write warning', () => {
    const response = buildWriteResponse({ Id: 1 });
    expect(response.content[1].text).toContain('DataMart');
    expect(response.content[1].text).toContain('5-60 seconds');
    expect(response.content[1].text).toBe(STALE_AFTER_WRITE_NOTICE);
  });
});

describe('splitCreateTaskArgs', () => {
  it('builds path and maps Description to Details', () => {
    const { path, body } = splitCreateTaskArgs({ projectId: 100, Name: 'New Task', Description: 'Desc' });
    expect(path).toBe('projects/100/tasks');
    expect(body).toEqual({ Name: 'New Task', Details: 'Desc' });
    expect(body).not.toHaveProperty('projectId');
  });

  it('rejects conflicting Description and Details values', () => {
    expect(() => splitCreateTaskArgs({
      projectId: 100,
      Name: 'New Task',
      Description: 'Desc A',
      Details: 'Desc B',
    })).toThrow('Description and Details cannot both be supplied');
  });

  it('rejects fields known to be ignored by task create', () => {
    expect(() => splitCreateTaskArgs({
      projectId: 100,
      Name: 'New Task',
      AssignedToUserId: 123,
    })).toThrow('AssignedToUserId is not supported');
  });
});

describe('getCreateTaskValidationError', () => {
  it('lists the fields required by Waterfall task creation', () => {
    const error = getCreateTaskValidationError(
      { Name: 'New Task' },
      { MethodTypeId: 1 },
    );

    expect(error).toContain('Waterfall');
    expect(error).toContain('StatusId');
    expect(error).toContain('StartDate');
    expect(error).toContain('EndDate');
  });

  it('accepts a Waterfall task with status and both dates', () => {
    expect(getCreateTaskValidationError(
      { Name: 'New Task', StatusId: 10, StartDate: '2026-07-13', EndDate: '2026-07-17' },
      { MethodTypeId: 1 },
    )).toBeUndefined();
  });

  it('allows Kanban task creation to use board defaults without dates', () => {
    expect(getCreateTaskValidationError(
      { Name: 'Backlog item' },
      { MethodTypeId: 2 },
    )).toBeUndefined();
  });

  it('fails safely when the project response has no methodology', () => {
    expect(getCreateTaskValidationError(
      { Name: 'New Task' },
      { Id: 100 },
    )).toContain('project methodology');
  });

  it('treats zero status and blank dates as missing Waterfall values', () => {
    const error = getCreateTaskValidationError(
      { Name: 'New Task', StatusId: 0, StartDate: '', EndDate: '   ' },
      { MethodTypeId: 1 },
    );

    expect(error).toContain('StatusId');
    expect(error).toContain('StartDate');
    expect(error).toContain('EndDate');
  });

  it('rejects an unknown project methodology instead of bypassing validation', () => {
    expect(getCreateTaskValidationError(
      { Name: 'New Task' },
      { MethodTypeId: 99 },
    )).toContain('Unsupported project methodology');
  });
});

describe('splitUpdateTaskArgs', () => {
  it('builds path with taskId, separates IDs, and maps Description to Details', () => {
    const { path, body } = splitUpdateTaskArgs({ projectId: 100, taskId: 42, Name: 'Updated', Description: 'New details' });
    expect(path).toBe('projects/100/tasks/42');
    expect(body).toEqual({ Name: 'Updated', Details: 'New details' });
    expect(body).not.toHaveProperty('projectId');
    expect(body).not.toHaveProperty('taskId');
  });

  it('rejects PercentComplete because PATCH ignores it', () => {
    expect(() => splitUpdateTaskArgs({
      projectId: 100,
      taskId: 42,
      PercentComplete: 37,
    })).toThrow('PercentComplete is not supported');
  });
});

describe('splitCreateRiskArgs', () => {
  it('builds path, maps Impact/Probability aliases, and requires LevelId', () => {
    const { path, body } = splitCreateRiskArgs({
      projectId: 100,
      Name: 'Risk A',
      Impact: 10,
      Probability: 20,
      LevelId: 30,
    });
    expect(path).toBe('projects/100/risks');
    expect(body).toEqual({ Name: 'Risk A', ImpactId: 10, ProbabilityId: 20, LevelId: 30 });
  });

  it('rejects missing LevelId', () => {
    expect(() => splitCreateRiskArgs({ projectId: 100, Name: 'Risk A' })).toThrow('LevelId is required');
  });
});

describe('splitCreateIssueArgs', () => {
  it('builds path and maps issue aliases to v2 REST field names', () => {
    const { path, body } = splitCreateIssueArgs({
      projectId: 100,
      Name: 'Issue B',
      TypeId: 820,
      StatusId: 547,
      Resolution: 'Resolved',
    });
    expect(path).toBe('projects/100/issues');
    expect(body).toEqual({ Name: 'Issue B', Type: 820, Status: 547, FinalResolution: 'Resolved' });
  });

  it('rejects Severity because v2 issue create does not support it', () => {
    expect(() => splitCreateIssueArgs({
      projectId: 100,
      Name: 'Issue B',
      TypeId: 820,
      StatusId: 547,
      Severity: 2,
    })).toThrow('Severity is not supported');
  });

  it('rejects a missing issue type', () => {
    expect(() => splitCreateIssueArgs({
      projectId: 100,
      Name: 'Issue B',
      StatusId: 547,
    })).toThrow('TypeId is required');
  });

  it('rejects a missing issue status', () => {
    expect(() => splitCreateIssueArgs({
      projectId: 100,
      Name: 'Issue B',
      TypeId: 820,
    })).toThrow('StatusId is required');
  });
});

describe('published write tool schemas', () => {
  it('publishes issue type and status as required inputs', () => {
    const registrations = new Map<string, any>();
    const server = {
      registerTool: vi.fn((name: string, config: any, handler: any) => {
        registrations.set(name, { config, handler });
      }),
    };

    registerWriteTools(server as any, {} as any);

    const schema = registrations.get('create_issue').config.inputSchema;
    expect(schema.TypeId.safeParse(undefined).success).toBe(false);
    expect(schema.StatusId.safeParse(undefined).success).toBe(false);
  });

  it('documents the methodology-dependent Waterfall task requirements', () => {
    const registrations = new Map<string, any>();
    const server = {
      registerTool: vi.fn((name: string, config: any, handler: any) => {
        registrations.set(name, { config, handler });
      }),
    };

    registerWriteTools(server as any, {} as any);

    const description = registrations.get('create_task').config.description;
    expect(description).toContain('Waterfall');
    expect(description).toContain('StatusId');
    expect(description).toContain('StartDate');
    expect(description).toContain('EndDate');
  });

  it('preflights Waterfall requirements before posting a task', async () => {
    const registrations = new Map<string, any>();
    const server = {
      registerTool: vi.fn((name: string, config: any, handler: any) => {
        registrations.set(name, { config, handler });
      }),
    };
    const rest = {
      get: vi.fn().mockResolvedValue({ Id: 100, MethodTypeId: 1 }),
      post: vi.fn(),
      patch: vi.fn(),
    };

    registerWriteTools(server as any, { rest } as any);
    const result = await registrations.get('create_task').handler({ projectId: 100, Name: 'Missing fields' });

    expect(rest.get).toHaveBeenCalledWith('projects/100');
    expect(rest.post).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('StatusId');
    expect(result.content[0].text).toContain('StartDate');
    expect(result.content[0].text).toContain('EndDate');
  });
});

describe('splitUpdateProjectArgs', () => {
  it('builds path and maps StatusId to ProjectStatusId', () => {
    const { path, body } = splitUpdateProjectArgs({ projectId: 100, Name: 'Renamed', StatusId: 662751 });
    expect(path).toBe('projects/100');
    expect(body).toEqual({ Name: 'Renamed', ProjectStatusId: 662751 });
  });

  it('rejects conflicting StatusId and ProjectStatusId values', () => {
    expect(() => splitUpdateProjectArgs({
      projectId: 100,
      StatusId: 662751,
      ProjectStatusId: 662752,
    })).toThrow('StatusId and ProjectStatusId cannot both be supplied');
  });
});

describe('mapReferenceIdToBaseId', () => {
  const referenceData = [
    { Id: 814, BaseId: 820, Name: 'Change request' },
    { Id: 815, BaseId: 821, Name: 'Problem' },
  ];

  it('maps localized Id to BaseId when reference data provides one', () => {
    expect(mapReferenceIdToBaseId(814, referenceData)).toBe(820);
  });

  it('keeps a supplied BaseId unchanged', () => {
    expect(mapReferenceIdToBaseId(821, referenceData)).toBe(821);
  });

  it('keeps unknown values for REST validation/readback to catch', () => {
    expect(mapReferenceIdToBaseId(999, referenceData)).toBe(999);
  });
});

describe('verifyRequestedFields', () => {
  const fields = [
    { requestField: 'ProjectStatusId', readPaths: ['Status.Id'], label: 'StatusId' },
    { requestField: 'StartDate', readPaths: ['StartDate'] },
  ];

  it('accepts numeric and ISO date readback matches', () => {
    expect(() => verifyRequestedFields(
      { ProjectStatusId: 662751, StartDate: '2026-08-01' },
      { Status: { Id: 662751 }, StartDate: '2026-08-01T00:00:00Z' },
      fields,
      'update_project',
    )).not.toThrow();
  });

  it('fails when readback omits a requested field', () => {
    expect(() => verifyRequestedFields(
      { ProjectStatusId: 662751 },
      { Name: 'No status here' },
      fields,
      'update_project',
    )).toThrow('readback did not include Status.Id');
  });

  it('fails when readback shows the requested field was ignored', () => {
    expect(() => verifyRequestedFields(
      { ProjectStatusId: 662751 },
      { Status: { Id: 662750 } },
      fields,
      'update_project',
    )).toThrow('expected 662751 but read back 662750');
  });
});
