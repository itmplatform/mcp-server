import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  buildWriteResponse, buildInsufficientScopeResponse, STALE_AFTER_WRITE_NOTICE,
  splitCreateTaskArgs, splitUpdateTaskArgs, splitCreateRiskArgs,
  splitCreateIssueArgs, splitUpdateProjectArgs, mapReferenceIdToBaseId,
  verifyRequestedFields, getCreateTaskValidationError, registerWriteTools,
  getBulkStatusValidationError, buildBulkStatusBody, summarizeBulkStatusResponse,
  BULK_STATUS_MAX_IDS, BULK_STATUS_TIMEOUT_MS,
  splitCreateProjectArgs, getCreateProjectValidationError,
  getUpdateTaskValidationError, buildProjectUiUrl, taskVerificationFieldsFor,
  splitUpdateRiskArgs, splitUpdateIssueArgs,
  splitCreateServiceArgs, splitUpdateServiceArgs,
  splitCreateActivityArgs, splitUpdateActivityArgs,
  buildTaskTeamSummary, verifyTaskTeamReadback,
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

describe('getCreateTaskValidationError for milestones and summary tasks', () => {
  const waterfall = { MethodTypeId: 1 };
  const kanban = { MethodTypeId: 2 };

  it('accepts a Waterfall milestone with EndDate only', () => {
    expect(getCreateTaskValidationError(
      { Name: 'Go-Live', KindId: 1, EndDate: '2026-09-30' },
      waterfall,
    )).toBeUndefined();
  });

  it('requires EndDate for a Waterfall milestone', () => {
    const error = getCreateTaskValidationError({ Name: 'Go-Live', KindId: 1 }, waterfall);
    expect(error).toContain('Milestone');
    expect(error).toContain('EndDate');
  });

  it('does not require StatusId, StartDate, TypeId for a milestone', () => {
    expect(getCreateTaskValidationError(
      { Name: 'Go-Live', KindId: 1, EndDate: '2026-09-30' },
      waterfall,
    )).toBeUndefined();
  });

  it('accepts a milestone StartDate equal to EndDate', () => {
    expect(getCreateTaskValidationError(
      { Name: 'Go-Live', KindId: 1, StartDate: '2026-09-30', EndDate: '2026-09-30' },
      waterfall,
    )).toBeUndefined();
  });

  it('rejects a milestone with a date span to prevent silent demotion to a task', () => {
    const error = getCreateTaskValidationError(
      { Name: 'Go-Live', KindId: 1, StartDate: '2026-09-01', EndDate: '2026-09-30' },
      waterfall,
    );
    expect(error).toContain('StartDate');
    expect(error).toContain('EndDate');
  });

  it('requires StatusId for a Waterfall summary task but no dates', () => {
    expect(getCreateTaskValidationError(
      { Name: '1. Discovery', KindId: 2 },
      waterfall,
    )).toContain('StatusId');
    expect(getCreateTaskValidationError(
      { Name: '1. Discovery', KindId: 2, StatusId: 10 },
      waterfall,
    )).toBeUndefined();
  });

  it('rejects TypeId on a Waterfall summary task instead of letting the backend silently ignore it', () => {
    const error = getCreateTaskValidationError(
      { Name: '1. Discovery', KindId: 2, StatusId: 10, TypeId: 612756 },
      waterfall,
    );
    expect(error).toContain('TypeId');
    expect(error).toContain('Summary');
  });

  it('accepts TypeId on a milestone', () => {
    expect(getCreateTaskValidationError(
      { Name: 'Go-Live', KindId: 1, EndDate: '2026-09-30', TypeId: 612756 },
      waterfall,
    )).toBeUndefined();
  });

  it('rejects an unknown KindId', () => {
    expect(getCreateTaskValidationError(
      { Name: 'X', KindId: 7, StatusId: 10, StartDate: '2026-09-01', EndDate: '2026-09-30' },
      waterfall,
    )).toContain('KindId');
  });

  it('treats KindId 3 exactly like the default task rules', () => {
    const error = getCreateTaskValidationError({ Name: 'X', KindId: 3 }, waterfall);
    expect(error).toContain('Waterfall');
    expect(error).toContain('StatusId');
  });

  it('rejects milestones and summary tasks on Kanban projects', () => {
    expect(getCreateTaskValidationError({ Name: 'X', KindId: 1, EndDate: '2026-09-30' }, kanban))
      .toContain('Waterfall');
    expect(getCreateTaskValidationError({ Name: 'X', KindId: 2 }, kanban))
      .toContain('Waterfall');
  });

  it('allows an explicit KindId 3 on Kanban', () => {
    expect(getCreateTaskValidationError({ Name: 'X', KindId: 3 }, kanban)).toBeUndefined();
  });

  it('rejects ParentId on Kanban projects', () => {
    expect(getCreateTaskValidationError({ Name: 'X', ParentId: 42 }, kanban))
      .toContain('Waterfall');
  });

  it('accepts ParentId on Waterfall task creation', () => {
    expect(getCreateTaskValidationError(
      { Name: 'X', ParentId: 42, StatusId: 10, StartDate: '2026-09-01', EndDate: '2026-09-30' },
      waterfall,
    )).toBeUndefined();
  });
});

describe('getUpdateTaskValidationError', () => {
  const waterfall = { MethodTypeId: 1 };
  const kanban = { MethodTypeId: 2 };

  it('rejects KindId and ParentId changes on Kanban projects', () => {
    expect(getUpdateTaskValidationError({ KindId: 1 }, kanban)).toContain('Waterfall');
    expect(getUpdateTaskValidationError({ ParentId: 42 }, kanban)).toContain('Waterfall');
  });

  it('requires equal StartDate and EndDate when converting a task to a milestone', () => {
    const error = getUpdateTaskValidationError({ KindId: 1 }, waterfall);
    expect(error).toContain('StartDate');
    expect(error).toContain('EndDate');

    expect(getUpdateTaskValidationError(
      { KindId: 1, StartDate: '2026-09-15', EndDate: '2026-09-30' },
      waterfall,
    )).toContain('equal');

    expect(getUpdateTaskValidationError(
      { KindId: 1, StartDate: '2026-09-30', EndDate: '2026-09-30' },
      waterfall,
    )).toBeUndefined();
  });

  it('accepts a ParentId move on Waterfall without extra requirements', () => {
    expect(getUpdateTaskValidationError({ ParentId: 42 }, waterfall)).toBeUndefined();
  });

  it('rejects an unknown KindId', () => {
    expect(getUpdateTaskValidationError({ KindId: 9 }, waterfall)).toContain('KindId');
  });

  it('rejects TypeId when converting a task to a summary', () => {
    const error = getUpdateTaskValidationError({ KindId: 2, TypeId: 612756 }, waterfall);
    expect(error).toContain('TypeId');
    expect(error).toContain('Summary');
  });

  it('accepts a summary conversion without TypeId', () => {
    expect(getUpdateTaskValidationError({ KindId: 2 }, waterfall)).toBeUndefined();
  });

  it('accepts TypeId alongside a ParentId move when the kind is not summary', () => {
    expect(getUpdateTaskValidationError({ ParentId: 42, TypeId: 612756 }, waterfall)).toBeUndefined();
  });

  it('fails safely when the project has no methodology', () => {
    expect(getUpdateTaskValidationError({ ParentId: 42 }, { Id: 1 })).toContain('methodology');
  });
});

describe('taskVerificationFieldsFor', () => {
  const fieldNames = (fields: Array<{ requestField: string }>) => fields.map(field => field.requestField);

  it('excludes TypeId from verification for summary tasks', () => {
    expect(fieldNames(taskVerificationFieldsFor({ KindId: 2, TypeId: 612756, StatusId: 10 })))
      .not.toContain('TypeId');
  });

  it('keeps TypeId for regular tasks and milestones', () => {
    expect(fieldNames(taskVerificationFieldsFor({ KindId: 3, TypeId: 612756 }))).toContain('TypeId');
    expect(fieldNames(taskVerificationFieldsFor({ KindId: 1, TypeId: 612756 }))).toContain('TypeId');
    expect(fieldNames(taskVerificationFieldsFor({ TypeId: 612756 }))).toContain('TypeId');
  });

  it('excludes TypeId when the readback shows a summary task even without KindId in the payload', () => {
    expect(fieldNames(taskVerificationFieldsFor({ TypeId: 612756 }, { Id: 42, KindId: 2 })))
      .not.toContain('TypeId');
  });

  it('keeps the milestone StartDate and detach ParentId exclusions', () => {
    expect(fieldNames(taskVerificationFieldsFor({ KindId: 1, StartDate: '2026-09-30' }))).not.toContain('StartDate');
    expect(fieldNames(taskVerificationFieldsFor({ ParentId: 0 }))).not.toContain('ParentId');
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

describe('task assignment fields', () => {
  it('passes TaskManagers and TaskMembers through with trimmed entries', () => {
    const { body } = splitCreateTaskArgs({
      projectId: 100,
      Name: 'T',
      TaskManagers: ' ana@x.com , bob@x.com ',
      TaskMembers: 'carla@x.com',
    });
    expect(body.TaskManagers).toBe('ana@x.com,bob@x.com');
    expect(body.TaskMembers).toBe('carla@x.com');
  });

  it('drops assignment fields that are empty after trimming', () => {
    const { body } = splitUpdateTaskArgs({ projectId: 100, taskId: 42, TaskMembers: ' , ' });
    expect(body).not.toHaveProperty('TaskMembers');
  });

  it('rejects a username listed in both TaskManagers and TaskMembers', () => {
    expect(() => splitCreateTaskArgs({
      projectId: 100,
      Name: 'T',
      TaskManagers: 'ana@x.com',
      TaskMembers: 'ANA@x.com',
    })).toThrow('both TaskManagers and TaskMembers');
  });

  it('points the AssignedToUserId rejection at TaskManagers/TaskMembers', () => {
    expect(() => splitCreateTaskArgs({ projectId: 100, Name: 'T', AssignedToUserId: 5 }))
      .toThrow('TaskManagers/TaskMembers');
    expect(() => splitUpdateTaskArgs({ projectId: 100, taskId: 42, AssignedToUserId: 5 }))
      .toThrow('TaskManagers/TaskMembers');
  });
});

describe('buildTaskTeamSummary', () => {
  const usersResponse = {
    canAddTeam: 'False',
    TaskUsers: {
      'ana@x.com': { UserId: 1, DisplayName: 'Ana A', IsTaskManager: true, TaskUserId: 11, Holidays: [{ HolidayId: 1 }] },
      'bob@x.com': { UserId: 2, DisplayName: 'Bob B', IsTaskManager: false, TaskUserId: 12 },
    },
  };

  it('builds a compact team array without the verbose per-user payload', () => {
    expect(buildTaskTeamSummary(usersResponse)).toEqual([
      { Username: 'ana@x.com', UserId: 1, DisplayName: 'Ana A', IsTaskManager: true },
      { Username: 'bob@x.com', UserId: 2, DisplayName: 'Bob B', IsTaskManager: false },
    ]);
  });

  it('returns an empty array for a malformed response', () => {
    expect(buildTaskTeamSummary(null)).toEqual([]);
    expect(buildTaskTeamSummary({})).toEqual([]);
  });
});

describe('verifyTaskTeamReadback', () => {
  const usersResponse = {
    TaskUsers: {
      'Ana@x.com': { UserId: 1, DisplayName: 'Ana A', IsTaskManager: true },
      'bob@x.com': { UserId: 2, DisplayName: 'Bob B', IsTaskManager: false },
    },
  };

  it('accepts matching assignments with case-insensitive usernames', () => {
    expect(() => verifyTaskTeamReadback(
      { TaskManagers: 'ana@x.com', TaskMembers: 'BOB@x.com' },
      usersResponse,
      true,
      'create_task',
    )).not.toThrow();
  });

  it('throws when a requested username is missing from the readback', () => {
    expect(() => verifyTaskTeamReadback(
      { TaskMembers: 'ghost@x.com' },
      usersResponse,
      true,
      'update_task',
    )).toThrow('Source-of-truth write verification failed for update_task');
  });

  it('throws on a Waterfall manager flag mismatch', () => {
    expect(() => verifyTaskTeamReadback(
      { TaskManagers: 'bob@x.com' },
      usersResponse,
      true,
      'update_task',
    )).toThrow('IsTaskManager');
  });

  it('skips the manager flag check on Kanban where everyone is saved as member', () => {
    expect(() => verifyTaskTeamReadback(
      { TaskManagers: 'bob@x.com' },
      usersResponse,
      false,
      'update_task',
    )).not.toThrow();
  });
});

describe('splitCreateRiskArgs', () => {
  const completeRiskArgs = {
    projectId: 100,
    Name: 'Risk A',
    TypeId: 1,
    StatusId: 2,
    ImpactId: 10,
    ProbabilityId: 20,
    LevelId: 30,
  };

  it('builds path and maps Impact/Probability aliases', () => {
    const { path, body } = splitCreateRiskArgs({
      projectId: 100,
      Name: 'Risk A',
      TypeId: 1,
      StatusId: 2,
      Impact: 10,
      Probability: 20,
      LevelId: 30,
    });
    expect(path).toBe('projects/100/risks');
    expect(body).toEqual({ Name: 'Risk A', TypeId: 1, StatusId: 2, ImpactId: 10, ProbabilityId: 20, LevelId: 30 });
  });

  it('rejects each missing required reference field with a pointer to its reference entity', () => {
    const expectedEntities: Record<string, string> = {
      TypeId: 'risktypes',
      StatusId: 'riskstatuses',
      ImpactId: 'riskimpacts',
      ProbabilityId: 'riskprobabilities',
      LevelId: 'risklevels',
    };
    for (const [field, entity] of Object.entries(expectedEntities)) {
      const args: Record<string, unknown> = { ...completeRiskArgs };
      delete args[field];
      expect(() => splitCreateRiskArgs(args as { projectId: number }))
        .toThrow(new RegExp(`${field} is required.*${entity}`));
    }
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

  it('publishes risk type, status, impact, probability, and level as required inputs', () => {
    const registrations = new Map<string, any>();
    const server = {
      registerTool: vi.fn((name: string, config: any, handler: any) => {
        registrations.set(name, { config, handler });
      }),
    };

    registerWriteTools(server as any, {} as any);

    const schema = registrations.get('create_risk').config.inputSchema;
    for (const field of ['TypeId', 'StatusId', 'ImpactId', 'ProbabilityId', 'LevelId']) {
      expect(schema[field].safeParse(undefined).success, `${field} should be required`).toBe(false);
    }
  });

  it('points each create_risk reference field at its get_reference_data entity', () => {
    const registrations = new Map<string, any>();
    const server = {
      registerTool: vi.fn((name: string, config: any, handler: any) => {
        registrations.set(name, { config, handler });
      }),
    };

    registerWriteTools(server as any, {} as any);

    const config = registrations.get('create_risk').config;
    const expectedEntities: Record<string, string> = {
      TypeId: 'risktypes',
      StatusId: 'riskstatuses',
      ImpactId: 'riskimpacts',
      ProbabilityId: 'riskprobabilities',
      LevelId: 'risklevels',
    };
    for (const [field, entity] of Object.entries(expectedEntities)) {
      expect(config.inputSchema[field].description, `${field} description`).toContain(entity);
    }
    expect(config.description).toContain('risklevels');
  });

  it('warns about automatic progress side effects in the task tool descriptions', () => {
    const registrations = new Map<string, any>();
    const server = {
      registerTool: vi.fn((name: string, config: any, handler: any) => {
        registrations.set(name, { config, handler });
      }),
    };

    registerWriteTools(server as any, {} as any);

    for (const tool of ['create_task', 'update_task']) {
      const description = registrations.get(tool).config.description;
      expect(description, `${tool} description`).toContain('AutomaticProgress');
      expect(description, `${tool} description`).toContain('ReportDate');
    }
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

describe('splitCreateProjectArgs', () => {
  it('builds the projects path and passes fields through', () => {
    const { path, body } = splitCreateProjectArgs({
      Name: 'MCP Playground',
      TypeId: 5,
      ProjectMethodTypeId: 1,
      Description: 'Demo',
      StartDate: '2026-07-01',
      EndDate: '2026-12-31',
    });
    expect(path).toBe('projects');
    expect(body).toEqual({
      Name: 'MCP Playground',
      TypeId: 5,
      ProjectMethodTypeId: 1,
      Description: 'Demo',
      StartDate: '2026-07-01',
      EndDate: '2026-12-31',
    });
  });

  it('rejects StatusId because the create route silently ignores status', () => {
    expect(() => splitCreateProjectArgs({ Name: 'P', TypeId: 5, StatusId: 662751 }))
      .toThrow('StatusId is not supported');
    expect(() => splitCreateProjectArgs({ Name: 'P', TypeId: 5, StatusId: 662751 }))
      .toThrow('update_project');
  });

  it('rejects ProjectStatusId the same way', () => {
    expect(() => splitCreateProjectArgs({ Name: 'P', TypeId: 5, ProjectStatusId: 662751 }))
      .toThrow('ProjectStatusId is not supported');
  });
});

describe('getCreateProjectValidationError', () => {
  it('accepts Waterfall and Kanban methodology ids', () => {
    expect(getCreateProjectValidationError({ Name: 'P', TypeId: 5, ProjectMethodTypeId: 1 })).toBeUndefined();
    expect(getCreateProjectValidationError({ Name: 'P', TypeId: 5, ProjectMethodTypeId: 2 })).toBeUndefined();
  });

  it('accepts an omitted methodology (backend defaults to Waterfall)', () => {
    expect(getCreateProjectValidationError({ Name: 'P', TypeId: 5 })).toBeUndefined();
  });

  it('rejects any other methodology because the backend stores it unvalidated', () => {
    const error = getCreateProjectValidationError({ Name: 'P', TypeId: 5, ProjectMethodTypeId: 3 });
    expect(error).toContain('ProjectMethodTypeId');
    expect(error).toContain('1');
    expect(error).toContain('2');
  });
});

describe('buildProjectUiUrl', () => {
  it('builds the ProjectGeneral deep link', () => {
    expect(buildProjectUiUrl('https://app.itmplatform.com', 'acme', 123))
      .toBe('https://app.itmplatform.com/acme/UserPages/ProjectGeneral.aspx?pid=123');
  });

  it('tolerates a trailing slash on the base URL', () => {
    expect(buildProjectUiUrl('https://app.itmplatform.com/', 'acme', 123))
      .toBe('https://app.itmplatform.com/acme/UserPages/ProjectGeneral.aspx?pid=123');
  });

  it('returns undefined without a base URL or company', () => {
    expect(buildProjectUiUrl(undefined, 'acme', 123)).toBeUndefined();
    expect(buildProjectUiUrl('', 'acme', 123)).toBeUndefined();
    expect(buildProjectUiUrl('https://app.itmplatform.com', undefined, 123)).toBeUndefined();
  });
});

describe('create_project tool', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function register(rest: any, ctx?: any) {
    const registrations = new Map<string, any>();
    const server = {
      registerTool: vi.fn((name: string, config: any, handler: any) => {
        registrations.set(name, { config, handler });
      }),
    };
    registerWriteTools(server as any, { rest } as any, ctx);
    return registrations;
  }

  it('publishes Name and TypeId as required inputs', () => {
    const registrations = register({});
    const schema = registrations.get('create_project').config.inputSchema;
    expect(schema.Name.safeParse(undefined).success).toBe(false);
    expect(schema.TypeId.safeParse(undefined).success).toBe(false);
    expect(schema.ProjectMethodTypeId.safeParse(undefined).success).toBe(true);
  });

  it('documents the default-status limitation and TypeId discovery', () => {
    const description = register({}).get('create_project').config.description;
    expect(description).toContain('default status');
    expect(description).toContain('update_project');
    expect(description).toContain('getprojecttypes');
  });

  it('refuses the call without the mcp:write scope', async () => {
    const registrations = register({}, { grantedScopes: ['mcp:read'] });
    const result = await registrations.get('create_project').handler({ Name: 'P', TypeId: 5 });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('insufficient_scope');
  });

  it('rejects an invalid methodology before POSTing', async () => {
    const rest = { post: vi.fn() };
    const result = await register(rest).get('create_project').handler({
      Name: 'P', TypeId: 5, ProjectMethodTypeId: 7,
    });
    expect(rest.post).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
  });

  it('publishes StatusId so the SDK does not strip it, then rejects it with guidance', async () => {
    const rest = { post: vi.fn() };
    const registrations = register(rest);
    const schema = registrations.get('create_project').config.inputSchema;
    expect(schema.StatusId.safeParse(662751).success).toBe(true);

    await expect(registrations.get('create_project').handler({ Name: 'P', TypeId: 5, StatusId: 662751 }))
      .rejects.toThrow('update_project');
    expect(rest.post).not.toHaveBeenCalled();
  });

  it('POSTs, reads the project back, and verifies the written fields', async () => {
    const readback = {
      Id: 900, Name: 'MCP Playground', MethodTypeId: 1,
      Type: { Id: 5 }, Status: { Id: 100, Name: 'Draft' },
      StartDate: '2026-07-01T00:00:00', EndDate: '2026-12-31T00:00:00',
    };
    const rest = {
      post: vi.fn().mockResolvedValue({ Id: 900, StatusMessage: 'Project inserted successfully.', StatusCode: 201 }),
      get: vi.fn().mockResolvedValue(readback),
    };
    const result = await register(rest).get('create_project').handler({
      Name: 'MCP Playground', TypeId: 5, ProjectMethodTypeId: 1,
      StartDate: '2026-07-01', EndDate: '2026-12-31',
    });

    expect(rest.post).toHaveBeenCalledWith('projects', {
      Name: 'MCP Playground', TypeId: 5, ProjectMethodTypeId: 1,
      StartDate: '2026-07-01', EndDate: '2026-12-31',
    });
    expect(rest.get).toHaveBeenCalledWith('projects/900');
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content[0].text)).toMatchObject({ Id: 900, Name: 'MCP Playground' });
    expect(result.content[1].text).toBe(STALE_AFTER_WRITE_NOTICE);
  });

  it('fails when the readback shows a field was not saved', async () => {
    const rest = {
      post: vi.fn().mockResolvedValue({ Id: 900 }),
      get: vi.fn().mockResolvedValue({ Id: 900, Name: 'Different name' }),
    };
    await expect(register(rest).get('create_project').handler({ Name: 'MCP Playground', TypeId: 5 }))
      .rejects.toThrow('verification failed');
  });

  it('includes uiUrl when ITM_UI_URL and the company are available', async () => {
    vi.stubEnv('ITM_UI_URL', 'https://app.itmplatform.com');
    const rest = {
      post: vi.fn().mockResolvedValue({ Id: 900 }),
      get: vi.fn().mockResolvedValue({ Id: 900, Name: 'P', Type: { Id: 5 } }),
    };
    const ctx = { grantedScopes: ['mcp:write'], company: 'acme' };
    const result = await register(rest, ctx).get('create_project').handler({ Name: 'P', TypeId: 5 });
    expect(JSON.parse(result.content[0].text).uiUrl)
      .toBe('https://app.itmplatform.com/acme/UserPages/ProjectGeneral.aspx?pid=900');
  });

  it('omits uiUrl when ITM_UI_URL is not configured', async () => {
    const rest = {
      post: vi.fn().mockResolvedValue({ Id: 900 }),
      get: vi.fn().mockResolvedValue({ Id: 900, Name: 'P', Type: { Id: 5 } }),
    };
    const ctx = { grantedScopes: ['mcp:write'], company: 'acme' };
    const result = await register(rest, ctx).get('create_project').handler({ Name: 'P', TypeId: 5 });
    expect(JSON.parse(result.content[0].text)).not.toHaveProperty('uiUrl');
  });
});

describe('task hierarchy and milestone handler wiring', () => {
  function register(rest: any) {
    const registrations = new Map<string, any>();
    const server = {
      registerTool: vi.fn((name: string, config: any, handler: any) => {
        registrations.set(name, { config, handler });
      }),
    };
    registerWriteTools(server as any, { rest } as any);
    return registrations;
  }

  it('publishes KindId and ParentId on create_task and update_task', () => {
    const registrations = register({});
    for (const tool of ['create_task', 'update_task']) {
      const schema = registrations.get(tool).config.inputSchema;
      expect(schema.KindId.safeParse(undefined).success).toBe(true);
      expect(schema.ParentId.safeParse(undefined).success).toBe(true);
    }
  });

  it('distinguishes task kind from task type in the create_task description', () => {
    const description = register({}).get('create_task').config.description;
    expect(description).toContain('KindId');
    expect(description).toContain('Milestone');
    expect(description.toLowerCase()).toContain('not the');
  });

  it('creates a milestone without verifying StartDate (backend clears it)', async () => {
    const rest = {
      get: vi.fn()
        .mockResolvedValueOnce({ Id: 100, MethodTypeId: 1 })
        .mockResolvedValueOnce({
          Id: 7001, Name: 'Go-Live', KindId: 1,
          StartDate: '0001-01-01T00:00:00', EndDate: '2026-09-30T00:00:00',
        }),
      post: vi.fn().mockResolvedValue({ Id: 7001 }),
    };
    const result = await register(rest).get('create_task').handler({
      projectId: 100, Name: 'Go-Live', KindId: 1,
      StartDate: '2026-09-30', EndDate: '2026-09-30',
    });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content[0].text).KindId).toBe(1);
  });

  it('verifies ParentId against the readback ParentTask.Id', async () => {
    const rest = {
      get: vi.fn()
        .mockResolvedValueOnce({ Id: 100, MethodTypeId: 1 })
        .mockResolvedValueOnce({
          Id: 7002, Name: 'Child', KindId: 3, ParentTask: { Id: 7000, Name: 'Parent' },
          Status: { Id: 10 }, StartDate: '2026-09-01T00:00:00', EndDate: '2026-09-10T00:00:00',
        }),
      post: vi.fn().mockResolvedValue({ Id: 7002 }),
    };
    const result = await register(rest).get('create_task').handler({
      projectId: 100, Name: 'Child', ParentId: 7000,
      StatusId: 10, StartDate: '2026-09-01', EndDate: '2026-09-10',
    });
    expect(result.isError).toBeFalsy();
  });

  it('update_task fetches the project only when KindId or ParentId is supplied', async () => {
    const rest = {
      get: vi.fn().mockResolvedValue({ Id: 42, Name: 'Renamed', ProjectMethodTypeId: 1 }),
      patch: vi.fn().mockResolvedValue({}),
    };
    await register(rest).get('update_task').handler({ projectId: 100, taskId: 42, Name: 'Renamed' });
    expect(rest.get).toHaveBeenCalledTimes(1);
    expect(rest.get).toHaveBeenCalledWith('projects/100/tasks/42');
  });

  it('update_task with ParentId 0 (detach) does not require ParentTask in the readback', async () => {
    const rest = {
      get: vi.fn()
        .mockResolvedValueOnce({ Id: 100, MethodTypeId: 1 })
        .mockResolvedValueOnce({ Id: 42, Name: 'Detached', KindId: 3 }),
      patch: vi.fn().mockResolvedValue({}),
    };
    const result = await register(rest).get('update_task').handler({
      projectId: 100, taskId: 42, ParentId: 0,
    });
    expect(result.isError).toBeFalsy();
  });

  it('update_task rejects ParentId on a Kanban project before PATCHing', async () => {
    const rest = {
      get: vi.fn().mockResolvedValue({ Id: 100, MethodTypeId: 2 }),
      patch: vi.fn(),
    };
    const result = await register(rest).get('update_task').handler({
      projectId: 100, taskId: 42, ParentId: 7,
    });
    expect(rest.get).toHaveBeenCalledWith('projects/100');
    expect(rest.patch).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Waterfall');
  });
});

describe('task team readback rights URL', () => {
  function register(rest: any) {
    const registrations = new Map<string, any>();
    const server = {
      registerTool: vi.fn((name: string, config: any, handler: any) => {
        registrations.set(name, { config, handler });
      }),
    };
    registerWriteTools(server as any, { rest } as any);
    return registrations;
  }

  const usersReadback = {
    canAddTeam: 'True',
    TaskUsers: { 'bob@x.com': { UserId: 5, DisplayName: 'Bob', IsTaskManager: 'False' } },
  };

  it('create_task readback sends the TaskTeam page URL for the rights check', async () => {
    const rest = {
      get: vi.fn()
        .mockResolvedValueOnce({ Id: 100, MethodTypeId: 2 })
        .mockResolvedValueOnce({ Id: 7001, Name: 'T', KindId: 3 })
        .mockResolvedValueOnce(usersReadback),
      post: vi.fn().mockResolvedValue({ Id: 7001 }),
    };
    const result = await register(rest).get('create_task').handler({
      projectId: 100, Name: 'T', TaskMembers: 'bob@x.com',
    });
    expect(result.isError).toBeFalsy();
    expect(rest.get).toHaveBeenLastCalledWith('projects/100/tasks/7001/users?URL=UserPages/TaskTeam.aspx');
  });

  it('update_task readback sends the TaskTeam page URL for the rights check', async () => {
    const rest = {
      get: vi.fn()
        .mockResolvedValueOnce({ Id: 100, MethodTypeId: 2 })
        .mockResolvedValueOnce({ Id: 42, Name: 'T' })
        .mockResolvedValueOnce(usersReadback),
      patch: vi.fn().mockResolvedValue({}),
    };
    const result = await register(rest).get('update_task').handler({
      projectId: 100, taskId: 42, TaskMembers: 'bob@x.com',
    });
    expect(result.isError).toBeFalsy();
    expect(rest.get).toHaveBeenLastCalledWith('projects/100/tasks/42/users?URL=UserPages/TaskTeam.aspx');
  });
});

describe('create_risk handler wiring', () => {
  function register(rest: any) {
    const registrations = new Map<string, any>();
    const server = {
      registerTool: vi.fn((name: string, config: any, handler: any) => {
        registrations.set(name, { config, handler });
      }),
    };
    registerWriteTools(server as any, { rest } as any);
    return registrations;
  }

  it('normalizes LevelId against the risklevels reference before POSTing', async () => {
    const rest = {
      get: vi.fn(async (path: string) => {
        if (path === 'risklevels') return [{ Id: 900, BaseId: 30, Level: 'High' }];
        if (path.startsWith('projects/100/risks/')) {
          return {
            Id: 55, Name: 'Risk A',
            Type: { BaseId: 1 }, Status: { BaseId: 2 },
            Impact: { BaseId: 10 }, Probability: { BaseId: 20 }, Level: { BaseId: 30 },
          };
        }
        return [];
      }),
      post: vi.fn().mockResolvedValue({ Id: 55 }),
    };

    const result = await register(rest).get('create_risk').handler({
      projectId: 100, Name: 'Risk A', TypeId: 1, StatusId: 2, ImpactId: 10, ProbabilityId: 20, LevelId: 900,
    });

    expect(rest.get).toHaveBeenCalledWith('risklevels');
    expect(rest.post).toHaveBeenCalledWith('projects/100/risks', expect.objectContaining({ LevelId: 30 }));
    expect(result.isError).toBeFalsy();
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

describe('getBulkStatusValidationError', () => {
  it('rejects a call with neither statusId nor statusName', () => {
    expect(getBulkStatusValidationError({})).toContain('statusId or statusName');
  });

  it('rejects a blank statusName without statusId', () => {
    expect(getBulkStatusValidationError({ statusName: '   ' })).toContain('statusId or statusName');
  });

  it('accepts statusId alone', () => {
    expect(getBulkStatusValidationError({ statusId: 5 })).toBeUndefined();
  });

  it('accepts statusName alone', () => {
    expect(getBulkStatusValidationError({ statusName: 'Completed' })).toBeUndefined();
  });
});

describe('buildBulkStatusBody', () => {
  it('joins IDs into the comma-separated TaskIds body key', () => {
    const body = buildBulkStatusBody([101, 102, 103], { statusId: 5 });
    expect(body.TaskIds).toBe('101,102,103');
  });

  it('sends statusId as SelectedStatus with empty SelectedStatusName', () => {
    const body = buildBulkStatusBody([101], { statusId: 5, projectMethodTypeId: 1 });
    expect(body).toEqual({ TaskIds: '101', SelectedStatus: 5, SelectedStatusName: '', ProjectMethodTypeId: 1 });
  });

  it('falls back to SelectedStatus 0 with SelectedStatusName for name resolution', () => {
    const body = buildBulkStatusBody([101], { statusName: 'Completed' });
    expect(body).toEqual({ TaskIds: '101', SelectedStatus: 0, SelectedStatusName: 'Completed', ProjectMethodTypeId: 0 });
  });
});

describe('summarizeBulkStatusResponse', () => {
  it('counts StatusCode 200 items as succeeded', () => {
    const summary = summarizeBulkStatusResponse([101, 102], [
      { Id: 101, StatusCode: 200, StatusMessage: 'Task status updated successfully.' },
      { Id: 102, StatusCode: 200, StatusMessage: 'Task status updated successfully.' },
    ], 'taskId');
    expect(summary).toEqual({ requested: 2, succeeded: 2, failed: [] });
  });

  it('collects non-200 items into failed with id and message', () => {
    const summary = summarizeBulkStatusResponse([101, 104], [
      { Id: 101, StatusCode: 200, StatusMessage: 'Task status updated successfully.' },
      { Id: 104, StatusCode: 400, StatusMessage: 'Task does not exist.' },
    ], 'taskId');
    expect(summary.requested).toBe(2);
    expect(summary.succeeded).toBe(1);
    expect(summary.failed).toEqual([{ taskId: 104, message: 'Task does not exist.' }]);
  });

  it('keys failed items as activityId for the activity tool', () => {
    const summary = summarizeBulkStatusResponse([55], [
      { Id: 55, StatusCode: 500, StatusMessage: 'Boom' },
    ], 'activityId');
    expect(summary.failed).toEqual([{ activityId: 55, message: 'Boom' }]);
  });

  it('defaults a missing failure message', () => {
    const summary = summarizeBulkStatusResponse([55], [{ Id: 55, StatusCode: 400 }], 'taskId');
    expect(summary.failed[0].message).toContain('status code 400');
  });

  it('throws on a non-array response so the agent sees the raw contract break', () => {
    expect(() => summarizeBulkStatusResponse([101], { StatusCode: 200 }, 'taskId'))
      .toThrow('array');
  });
});

describe('bulk status tools registration', () => {
  function register(rest: any = {}, ctx?: any) {
    const registrations = new Map<string, any>();
    const server = {
      registerTool: vi.fn((name: string, config: any, handler: any) => {
        registrations.set(name, { config, handler });
      }),
    };
    registerWriteTools(server as any, { rest } as any, ctx);
    return registrations;
  }

  it('registers both bulk status tools', () => {
    const registrations = register();
    expect(registrations.has('bulk_update_task_status')).toBe(true);
    expect(registrations.has('bulk_update_activity_status')).toBe(true);
  });

  it('caps taskIds at 100 and rejects empty arrays', () => {
    const schema = register().get('bulk_update_task_status').config.inputSchema;
    expect(schema.taskIds.safeParse([]).success).toBe(false);
    expect(schema.taskIds.safeParse(Array.from({ length: 100 }, (_, i) => i + 1)).success).toBe(true);
    expect(schema.taskIds.safeParse(Array.from({ length: 101 }, (_, i) => i + 1)).success).toBe(false);
    expect(BULK_STATUS_MAX_IDS).toBe(100);
  });

  it('caps activityIds at 100', () => {
    const schema = register().get('bulk_update_activity_status').config.inputSchema;
    expect(schema.activityIds.safeParse(Array.from({ length: 101 }, (_, i) => i + 1)).success).toBe(false);
  });

  it('tells the agent to chunk, resolve statuses, and check failures', () => {
    const description = register().get('bulk_update_task_status').config.description;
    expect(description).toContain('100');
    expect(description).toContain('list_project_tasks');
    expect(description).toContain('get_reference_data');
    expect(description).toContain('failed');
  });

  it('refuses the call without the mcp:write scope', async () => {
    const registrations = register({}, { grantedScopes: ['mcp:read'] });
    const result = await registrations.get('bulk_update_task_status').handler({
      projectId: 100, taskIds: [1], statusId: 5,
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('insufficient_scope');
  });

  it('rejects a call without statusId or statusName before POSTing', async () => {
    const rest = { post: vi.fn() };
    const registrations = register(rest);
    const result = await registrations.get('bulk_update_task_status').handler({
      projectId: 100, taskIds: [1, 2],
    });
    expect(rest.post).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('statusId or statusName');
  });

  it('POSTs UpdateTaskStatuses with the joined payload and a request timeout', async () => {
    const rest = {
      post: vi.fn().mockResolvedValue([
        { Id: 101, StatusCode: 200, StatusMessage: 'Task status updated successfully.' },
        { Id: 102, StatusCode: 400, StatusMessage: 'Task does not exist.' },
      ]),
    };
    const registrations = register(rest);
    const result = await registrations.get('bulk_update_task_status').handler({
      projectId: 100, taskIds: [101, 102], statusId: 5, projectMethodTypeId: 1,
    });

    expect(rest.post).toHaveBeenCalledWith(
      'projects/100/UpdateTaskStatuses',
      { TaskIds: '101,102', SelectedStatus: 5, SelectedStatusName: '', ProjectMethodTypeId: 1 },
      { timeoutMs: BULK_STATUS_TIMEOUT_MS },
    );
    expect(result.isError).toBeFalsy();
    const summary = JSON.parse(result.content[0].text);
    expect(summary).toEqual({
      requested: 2,
      succeeded: 1,
      failed: [{ taskId: 102, message: 'Task does not exist.' }],
    });
    expect(result.content[1].text).toBe(STALE_AFTER_WRITE_NOTICE);
  });

  it('POSTs UpdateActivityStatuses joining activityIds into the TaskIds body key', async () => {
    const rest = {
      post: vi.fn().mockResolvedValue([
        { Id: 55, StatusCode: 200, StatusMessage: 'Task status updated successfully.' },
      ]),
    };
    const registrations = register(rest);
    const result = await registrations.get('bulk_update_activity_status').handler({
      serviceId: 77, activityIds: [55], statusId: 544592,
    });

    expect(rest.post).toHaveBeenCalledWith(
      'services/77/UpdateActivityStatuses',
      { TaskIds: '55', SelectedStatus: 544592, SelectedStatusName: '', ProjectMethodTypeId: 0 },
      { timeoutMs: BULK_STATUS_TIMEOUT_MS },
    );
    const summary = JSON.parse(result.content[0].text);
    expect(summary).toEqual({ requested: 1, succeeded: 1, failed: [] });
  });

  it('resolves activity statusName client-side against activity statuses, never server-side', async () => {
    const rest = {
      get: vi.fn().mockResolvedValue([
        { Id: 544589, Name: 'Scheduled' },
        { Id: 544590, Name: 'In Progress' },
      ]),
      post: vi.fn().mockResolvedValue([
        { Id: 55, StatusCode: 200, StatusMessage: 'Task status updated successfully.' },
      ]),
    };
    const registrations = register(rest);
    const result = await registrations.get('bulk_update_activity_status').handler({
      serviceId: 77, activityIds: [55], statusName: 'in progress',
    });

    expect(rest.get).toHaveBeenCalledWith('gettaskstatuses?IsService=true');
    expect(rest.post).toHaveBeenCalledWith(
      'services/77/UpdateActivityStatuses',
      { TaskIds: '55', SelectedStatus: 544590, SelectedStatusName: '', ProjectMethodTypeId: 0 },
      { timeoutMs: BULK_STATUS_TIMEOUT_MS },
    );
    expect(result.isError).toBeFalsy();
  });

  it('rejects an unknown activity statusName without POSTing', async () => {
    const rest = {
      get: vi.fn().mockResolvedValue([{ Id: 544589, Name: 'Scheduled' }]),
      post: vi.fn(),
    };
    const registrations = register(rest);
    const result = await registrations.get('bulk_update_activity_status').handler({
      serviceId: 77, activityIds: [55], statusName: 'Nonexistent',
    });

    expect(rest.post).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Nonexistent');
    expect(result.content[0].text).toContain('activitystatuses');
  });

  it('propagates REST errors (full-rollback 500s) to the caller', async () => {
    const rest = { post: vi.fn().mockRejectedValue(new Error('REST request failed: 500 Internal Server Error')) };
    const registrations = register(rest);
    await expect(registrations.get('bulk_update_task_status').handler({
      projectId: 100, taskIds: [1], statusId: 5,
    })).rejects.toThrow('500');
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

describe('splitUpdateRiskArgs', () => {
  it('builds the risk path and keeps update fields', () => {
    const { path, body } = splitUpdateRiskArgs({ projectId: 100, riskId: 7, Name: 'Risk B', MitigationPlan: 'Plan' });
    expect(path).toBe('projects/100/risks/7');
    expect(body).toEqual({ Name: 'Risk B', MitigationPlan: 'Plan' });
  });

  it('aliases ContingencyPlan to the backend ContigencyPlan spelling', () => {
    const { body } = splitUpdateRiskArgs({ projectId: 100, riskId: 7, ContingencyPlan: 'Fallback' });
    expect(body).toEqual({ ContigencyPlan: 'Fallback' });
  });

  it('aliases Impact and Probability to their Id fields like create_risk', () => {
    const { body } = splitUpdateRiskArgs({ projectId: 100, riskId: 7, Impact: 10, Probability: 20 });
    expect(body).toEqual({ ImpactId: 10, ProbabilityId: 20 });
  });
});

describe('splitUpdateIssueArgs', () => {
  it('builds the issue path and maps TypeId/StatusId/Resolution to backend keys', () => {
    const { path, body } = splitUpdateIssueArgs({
      projectId: 100, issueId: 9, TypeId: 3, StatusId: 4, Resolution: 'Done', Name: 'Issue B',
    });
    expect(path).toBe('projects/100/issues/9');
    expect(body).toEqual({ Type: 3, Status: 4, FinalResolution: 'Done', Name: 'Issue B' });
  });
});

describe('splitCreateServiceArgs', () => {
  it('builds the services path and requires TypeId', () => {
    const { path, body } = splitCreateServiceArgs({ Name: 'Support', TypeId: 5 });
    expect(path).toBe('services');
    expect(body).toEqual({ Name: 'Support', TypeId: 5 });
  });

  it('throws when TypeId is missing, pointing at servicetypes', () => {
    expect(() => splitCreateServiceArgs({ Name: 'Support' })).toThrow('servicetypes');
  });

  it('rejects StatusId at creation like create_project', () => {
    expect(() => splitCreateServiceArgs({ Name: 'Support', TypeId: 5, StatusId: 1 }))
      .toThrow('update_service');
  });
});

describe('splitUpdateServiceArgs', () => {
  it('builds the service path and aliases StatusId to ProjectStatusId', () => {
    const { path, body } = splitUpdateServiceArgs({ serviceId: 77, StatusId: 4, Name: 'Support 2' });
    expect(path).toBe('services/77');
    expect(body).toEqual({ ProjectStatusId: 4, Name: 'Support 2' });
  });
});

describe('splitCreateActivityArgs', () => {
  it('builds the activities path and maps Description to Details', () => {
    const { path, body } = splitCreateActivityArgs({
      serviceId: 77, Name: 'Act', Description: 'Desc', StatusId: 1, StartDate: '2026-01-01', EndDate: '2026-02-01',
    });
    expect(path).toBe('services/77/activities');
    expect(body).toEqual({ Name: 'Act', Details: 'Desc', StatusId: 1, StartDate: '2026-01-01', EndDate: '2026-02-01' });
  });

  it('requires StatusId, StartDate, and EndDate', () => {
    expect(() => splitCreateActivityArgs({ serviceId: 77, Name: 'Act' })).toThrow('StatusId');
    expect(() => splitCreateActivityArgs({ serviceId: 77, Name: 'Act', StatusId: 1 })).toThrow('StartDate');
    expect(() => splitCreateActivityArgs({ serviceId: 77, Name: 'Act', StatusId: 1, StartDate: '2026-01-01' })).toThrow('EndDate');
  });

  it('rejects hierarchy and assignment fields', () => {
    const base = { serviceId: 77, Name: 'Act', StatusId: 1, StartDate: '2026-01-01', EndDate: '2026-02-01' };
    expect(() => splitCreateActivityArgs({ ...base, KindId: 1 })).toThrow('KindId is not supported');
    expect(() => splitCreateActivityArgs({ ...base, ParentId: 5 })).toThrow('ParentId is not supported');
    expect(() => splitCreateActivityArgs({ ...base, AssignedToUserId: 3 })).toThrow('AssignedToUserId is not supported');
  });
});

describe('splitUpdateActivityArgs', () => {
  it('builds the single-activity path and maps Description to Details', () => {
    const { path, body } = splitUpdateActivityArgs({ serviceId: 77, activityId: 55, Description: 'New' });
    expect(path).toBe('services/77/activities/55');
    expect(body).toEqual({ Details: 'New' });
  });

  it('rejects hierarchy fields', () => {
    expect(() => splitUpdateActivityArgs({ serviceId: 77, activityId: 55, ParentId: 5 }))
      .toThrow('ParentId is not supported');
  });
});

describe('P1 write tool handlers', () => {
  function register(rest: any, ctx?: any) {
    const registrations = new Map<string, any>();
    const server = {
      registerTool: vi.fn((name: string, config: any, handler: any) => {
        registrations.set(name, { config, handler });
      }),
    };
    registerWriteTools(server as any, { rest } as any, ctx);
    return registrations;
  }

  it('registers the six new write tools', () => {
    const registrations = register({});
    for (const name of ['update_risk', 'update_issue', 'create_service', 'update_service', 'create_activity', 'update_activity']) {
      expect(registrations.has(name)).toBe(true);
    }
  });

  it.each(['update_risk', 'update_issue', 'create_service', 'update_service', 'create_activity', 'update_activity'])(
    '%s refuses the call without the mcp:write scope',
    async (toolName) => {
      const result = await register({}, { grantedScopes: ['mcp:read'] }).get(toolName).handler({});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('insufficient_scope');
    },
  );

  it('update_risk PUTs normalized reference IDs and verifies the readback', async () => {
    const rest = {
      get: vi.fn(async (path: string) => {
        if (path === 'risklevels') return [{ Id: 900, BaseId: 30, Level: 'High' }];
        if (path === 'projects/100/risks/7') {
          return { Id: 7, Name: 'Risk B', Level: { BaseId: 30 }, MitigationPlan: 'Plan', ContigencyPlan: 'Fallback' };
        }
        return [];
      }),
      put: vi.fn().mockResolvedValue({ Id: 7, StatusCode: 201 }),
    };
    const result = await register(rest).get('update_risk').handler({
      projectId: 100, riskId: 7, Name: 'Risk B', LevelId: 900, MitigationPlan: 'Plan', ContingencyPlan: 'Fallback',
    });

    expect(rest.put).toHaveBeenCalledWith('projects/100/risks/7', {
      Name: 'Risk B', LevelId: 30, MitigationPlan: 'Plan', ContigencyPlan: 'Fallback',
    });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content[0].text).Id).toBe(7);
    expect(result.content[1].text).toBe(STALE_AFTER_WRITE_NOTICE);
  });

  it('update_risk fails verification when the readback ignores a field', async () => {
    const rest = {
      get: vi.fn(async (path: string) => {
        if (path === 'projects/100/risks/7') return { Id: 7, Name: 'Old Name' };
        return [];
      }),
      put: vi.fn().mockResolvedValue({ Id: 7 }),
    };
    await expect(register(rest).get('update_risk').handler({
      projectId: 100, riskId: 7, Name: 'New Name',
    })).rejects.toThrow('verification failed');
  });

  it('update_issue PATCHes bare Type/Status BaseId keys and verifies the readback', async () => {
    const rest = {
      get: vi.fn(async (path: string) => {
        if (path === 'issuetypes') return [{ Id: 800, BaseId: 3, Name: 'Bug' }];
        if (path === 'issuestatuses') return [{ Id: 810, BaseId: 4, Name: 'Closed' }];
        if (path === 'projects/100/issues/9') {
          return { Id: 9, Name: 'Issue B', Type: { BaseId: 3 }, Status: { BaseId: 4 }, FinalResolution: 'Done' };
        }
        return [];
      }),
      patch: vi.fn().mockResolvedValue({ Id: 9 }),
    };
    const result = await register(rest).get('update_issue').handler({
      projectId: 100, issueId: 9, Name: 'Issue B', TypeId: 800, StatusId: 810, Resolution: 'Done',
    });

    expect(rest.patch).toHaveBeenCalledWith('projects/100/issues/9', {
      Name: 'Issue B', Type: 3, Status: 4, FinalResolution: 'Done',
    });
    expect(result.isError).toBeFalsy();
  });

  it('create_service POSTs to services and reads back the created service', async () => {
    const rest = {
      post: vi.fn().mockResolvedValue({ Id: 501, StatusCode: 201 }),
      get: vi.fn().mockResolvedValue({ Id: 501, Name: 'Support', Type: { Id: 5 } }),
    };
    const result = await register(rest).get('create_service').handler({ Name: 'Support', TypeId: 5 });

    expect(rest.post).toHaveBeenCalledWith('services', { Name: 'Support', TypeId: 5 });
    expect(rest.get).toHaveBeenCalledWith('services/501');
    expect(JSON.parse(result.content[0].text).Id).toBe(501);
  });

  it('update_service PATCHes the service and verifies the readback', async () => {
    const rest = {
      patch: vi.fn().mockResolvedValue({ Id: 501 }),
      get: vi.fn().mockResolvedValue({ Id: 501, Name: 'Support 2', Status: { Id: 4 } }),
    };
    const result = await register(rest).get('update_service').handler({ serviceId: 501, Name: 'Support 2', StatusId: 4 });

    expect(rest.patch).toHaveBeenCalledWith('services/501', { Name: 'Support 2', ProjectStatusId: 4 });
    expect(rest.get).toHaveBeenCalledWith('services/501');
    expect(result.isError).toBeFalsy();
  });

  it('create_activity POSTs to the service activities route and reads back', async () => {
    const rest = {
      post: vi.fn().mockResolvedValue({ Id: 601 }),
      get: vi.fn().mockResolvedValue({ Id: 601, Name: 'Act', StartDate: '2026-01-01', EndDate: '2026-02-01', Status: { Id: 1 } }),
    };
    const result = await register(rest).get('create_activity').handler({
      serviceId: 77, Name: 'Act', StatusId: 1, StartDate: '2026-01-01', EndDate: '2026-02-01',
    });

    expect(rest.post).toHaveBeenCalledWith('services/77/activities', {
      Name: 'Act', StatusId: 1, StartDate: '2026-01-01', EndDate: '2026-02-01',
    });
    expect(rest.get).toHaveBeenCalledWith('services/77/activities/601');
    expect(JSON.parse(result.content[0].text).Id).toBe(601);
  });

  it('update_activity PATCHes the activity and verifies the readback', async () => {
    const rest = {
      patch: vi.fn().mockResolvedValue({ Id: 601 }),
      get: vi.fn().mockResolvedValue({ Id: 601, Name: 'Act 2', Status: { Id: 2 } }),
    };
    const result = await register(rest).get('update_activity').handler({
      serviceId: 77, activityId: 601, Name: 'Act 2', StatusId: 2,
    });

    expect(rest.patch).toHaveBeenCalledWith('services/77/activities/601', { Name: 'Act 2', StatusId: 2 });
    expect(rest.get).toHaveBeenCalledWith('services/77/activities/601');
    expect(result.isError).toBeFalsy();
  });
});
