import { describe, it, expect, vi } from 'vitest';
import {
  buildEffortUpdatePayload,
  registerEffortTools,
} from '../../../src/tools/effort.js';
import { STALE_AFTER_WRITE_NOTICE } from '../../../src/tools/write-tools.js';
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
      put: vi.fn(),
    },
  } as any;
}

const TEAM_ROW = {
  TaskUserId: 900,
  UserId: 501,
  DisplayName: 'Ana Lopez',
  EmailAddress: 'ana@example.com',
  EstimatedEffortHours: 2,
  EstimatedEffortMins: 0,
  ActualEffortAcceptedHours: 1,
  ActualEffortAcceptedMins: 15,
  IsAutomaticActualEffortAccepted: true,
  BillingCategoryId: 7,
};

const OTHER_TEAM_ROW = {
  TaskUserId: 901,
  UserId: 502,
  DisplayName: 'Ben Cruz',
  EmailAddress: 'ben@example.com',
  EstimatedEffortHours: 5,
  EstimatedEffortMins: 30,
  ActualEffortAcceptedHours: 0,
  ActualEffortAcceptedMins: 0,
  IsAutomaticActualEffortAccepted: false,
  BillingCategoryId: null,
};

const CATEGORY_ROW = {
  MasterCategoryId: 33,
  CategoryTypeId: 2,
  CategoryName: 'Development',
  NonAssignedEffortHours: 4,
  NonAssignedEffortMins: 45,
  ActualEffortAcceptedHours: 2,
  ActualEffortAcceptedMins: 30,
  IsAutomaticActualEffortAccepted: false,
  TotalEstimatedEffortHours: 12,
  TotalEstimatedEffortMins: 15,
};

describe('buildEffortUpdatePayload', () => {
  it('writes new estimates for requested users and echoes their accepted/auto/billing fields verbatim', () => {
    const payload = buildEffortUpdatePayload(
      [{ userId: 501, estimatedHours: 8, estimatedMinutes: 45 }],
      [TEAM_ROW, OTHER_TEAM_ROW],
      [CATEGORY_ROW],
    );
    expect(payload.UserEfforts).toEqual([{
      TaskUserId: 900,
      UserId: 501,
      EstimatedHours: 8,
      EstimatedMins: 45,
      ActualEffortAcceptedHours: 1,
      ActualEffortAcceptedMins: 15,
      IsAutomaticActualEffortAccepted: true,
      BillingCategoryId: 7,
    }]);
  });

  it('includes only requested users (unlisted assignees are preserved server-side)', () => {
    const payload = buildEffortUpdatePayload(
      [{ userId: 501, estimatedHours: 1, estimatedMinutes: 0 }],
      [TEAM_ROW, OTHER_TEAM_ROW],
      [],
    );
    expect((payload.UserEfforts as unknown[]).length).toBe(1);
  });

  it('echoes the current category rows so the server-side full replace is lossless', () => {
    const payload = buildEffortUpdatePayload(
      [{ userId: 501, estimatedHours: 1, estimatedMinutes: 0 }],
      [TEAM_ROW],
      [CATEGORY_ROW],
    );
    expect(payload.CategoryEfforts).toEqual([{
      CategoryId: 33,
      CategoryType: 2,
      NonAssignedEffortHours: 4,
      NonAssignedEffortMins: 45,
      ActualEffortAcceptedHours: 2,
      ActualEffortAcceptedMins: 30,
      IsAutomaticActualEffortAccepted: false,
    }]);
  });

  it('drops category rows that are pure projections of user assignments (all zero, auto-accept)', () => {
    const derivedRow = {
      MasterCategoryId: 44,
      CategoryTypeId: 2,
      CategoryName: 'QA',
      NonAssignedEffortHours: 0,
      NonAssignedEffortMins: 0,
      ActualEffortAcceptedHours: 0,
      ActualEffortAcceptedMins: 0,
      IsAutomaticActualEffortAccepted: true,
      TotalEstimatedEffortHours: 3,
      TotalEstimatedEffortMins: 0,
    };
    const payload = buildEffortUpdatePayload(
      [{ userId: 501, estimatedHours: 1, estimatedMinutes: 0 }],
      [TEAM_ROW],
      [derivedRow, CATEGORY_ROW],
    );
    expect(payload.CategoryEfforts).toEqual([{
      CategoryId: 33,
      CategoryType: 2,
      NonAssignedEffortHours: 4,
      NonAssignedEffortMins: 45,
      ActualEffortAcceptedHours: 2,
      ActualEffortAcceptedMins: 30,
      IsAutomaticActualEffortAccepted: false,
    }]);
  });

  it('keeps an all-zero category row whose auto-accept flag was manually turned off', () => {
    const manualZeroRow = {
      MasterCategoryId: 55,
      CategoryTypeId: 2,
      NonAssignedEffortHours: 0,
      NonAssignedEffortMins: 0,
      ActualEffortAcceptedHours: 0,
      ActualEffortAcceptedMins: 0,
      IsAutomaticActualEffortAccepted: false,
      TotalEstimatedEffortHours: 0,
      TotalEstimatedEffortMins: 0,
    };
    const payload = buildEffortUpdatePayload(
      [{ userId: 501, estimatedHours: 1, estimatedMinutes: 0 }],
      [TEAM_ROW],
      [manualZeroRow],
    );
    expect((payload.CategoryEfforts as unknown[]).length).toBe(1);
  });

  it('preserves the current task total estimate when no explicit total is given', () => {
    const payload = buildEffortUpdatePayload(
      [{ userId: 501, estimatedHours: 1, estimatedMinutes: 0 }],
      [TEAM_ROW],
      [CATEGORY_ROW],
    );
    expect(payload.TaskTotalEstimateHours).toBe(12);
    expect(payload.TaskTotalEstimateMins).toBe(15);
  });

  it('uses the explicit task total when provided', () => {
    const payload = buildEffortUpdatePayload(
      [{ userId: 501, estimatedHours: 1, estimatedMinutes: 0 }],
      [TEAM_ROW],
      [CATEGORY_ROW],
      { hours: 20, minutes: 0 },
    );
    expect(payload.TaskTotalEstimateHours).toBe(20);
    expect(payload.TaskTotalEstimateMins).toBe(0);
  });

  it('falls back to the post-change sum of user estimates when there are no category rows', () => {
    const payload = buildEffortUpdatePayload(
      [{ userId: 501, estimatedHours: 8, estimatedMinutes: 45 }],
      [TEAM_ROW, OTHER_TEAM_ROW],
      [],
    );
    // 8:45 (changed) + 5:30 (untouched other row) = 14:15
    expect(payload.TaskTotalEstimateHours).toBe(14);
    expect(payload.TaskTotalEstimateMins).toBe(15);
  });

  it('rejects a user that is not assigned to the task with an actionable message', () => {
    expect(() => buildEffortUpdatePayload(
      [{ userId: 999, estimatedHours: 1, estimatedMinutes: 0 }],
      [TEAM_ROW],
      [],
    )).toThrow(/not assigned.*update_task/s);
  });

  it('rejects duplicate userIds in the same call', () => {
    expect(() => buildEffortUpdatePayload(
      [
        { userId: 501, estimatedHours: 1, estimatedMinutes: 0 },
        { userId: 501, estimatedHours: 2, estimatedMinutes: 0 },
      ],
      [TEAM_ROW],
      [],
    )).toThrow(/duplicate/i);
  });

  it('defaults missing echo fields safely (auto-accept true, billing null, accepted zero)', () => {
    const bareRow = { TaskUserId: 910, UserId: 503, EstimatedEffortHours: 0, EstimatedEffortMins: 0 };
    const payload = buildEffortUpdatePayload(
      [{ userId: 503, estimatedHours: 2, estimatedMinutes: 30 }],
      [bareRow],
      [],
    );
    expect(payload.UserEfforts).toEqual([{
      TaskUserId: 910,
      UserId: 503,
      EstimatedHours: 2,
      EstimatedMins: 30,
      ActualEffortAcceptedHours: 0,
      ActualEffortAcceptedMins: 0,
      IsAutomaticActualEffortAccepted: true,
      BillingCategoryId: null,
    }]);
  });
});

describe('registerEffortTools', () => {
  it('registers both tools when no user context is provided (api-key session)', () => {
    const { server, tools } = createFakeServer();
    registerEffortTools(server, createFakeClients());
    expect([...tools.keys()].sort()).toEqual(['get_task_effort', 'update_task_effort']);
  });

  it('registers only the read tool when mcp:write scope is missing', () => {
    const { server, tools } = createFakeServer();
    const ctx = { grantedScopes: ['mcp:read'] } as EffectiveUserContext;
    registerEffortTools(server, createFakeClients(), ctx);
    expect([...tools.keys()].sort()).toEqual(['get_task_effort']);
  });

  it('get_task_effort GETs both effort endpoints and returns teamMembers + categories', async () => {
    const { server, tools } = createFakeServer();
    const clients = createFakeClients();
    clients.rest.get.mockImplementation(async (path: string) => {
      if (path.endsWith('effortbyteammember')) return [TEAM_ROW];
      if (path.endsWith('effortbycategory')) return [CATEGORY_ROW];
      throw new Error(`unexpected GET ${path}`);
    });
    registerEffortTools(server, clients);

    const result = await tools.get('get_task_effort')!.cb({ projectId: 100, taskId: 42 });

    expect(clients.rest.get).toHaveBeenCalledWith('projects/100/tasks/42/effortbyteammember');
    expect(clients.rest.get).toHaveBeenCalledWith('projects/100/tasks/42/effortbycategory');
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.teamMembers).toEqual([TEAM_ROW]);
    expect(parsed.categories).toEqual([CATEGORY_ROW]);
  });

  function mockHappyPath(clients: any, options?: { task?: Record<string, unknown> }) {
    const task = options?.task ?? { Id: 42, ProjectId: 100, KindId: 3, Name: 'Build' };
    const readbackRow = { ...TEAM_ROW, EstimatedEffortHours: 8, EstimatedEffortMins: 45 };
    let putDone = false;
    clients.rest.get.mockImplementation(async (path: string) => {
      if (path === 'projects/100/tasks/42') return task;
      if (path.endsWith('effortbyteammember')) return putDone ? [readbackRow, OTHER_TEAM_ROW] : [TEAM_ROW, OTHER_TEAM_ROW];
      if (path.endsWith('effortbycategory')) return [CATEGORY_ROW];
      throw new Error(`unexpected GET ${path}`);
    });
    clients.rest.put.mockImplementation(async () => {
      putDone = true;
      return { Id: 42, StatusCode: 200, StatusMessage: 'Updated Successfully' };
    });
    return { readbackRow };
  }

  it('update_task_effort reads current state, PUTs the merged payload, verifies the readback, and returns the stale notice', async () => {
    const { server, tools } = createFakeServer();
    const clients = createFakeClients();
    mockHappyPath(clients);
    registerEffortTools(server, clients);

    const result = await tools.get('update_task_effort')!.cb({
      projectId: 100, taskId: 42,
      userEstimates: [{ userId: 501, estimatedHours: 8, estimatedMinutes: 45 }],
    });

    expect(clients.rest.put).toHaveBeenCalledTimes(1);
    const [putPath, putBody] = clients.rest.put.mock.calls[0];
    expect(putPath).toBe('projects/100/tasks/42/effort');
    expect(putBody.UserEfforts).toEqual([{
      TaskUserId: 900, UserId: 501, EstimatedHours: 8, EstimatedMins: 45,
      ActualEffortAcceptedHours: 1, ActualEffortAcceptedMins: 15,
      IsAutomaticActualEffortAccepted: true, BillingCategoryId: 7,
    }]);
    expect(putBody.TaskTotalEstimateHours).toBe(12);
    expect(putBody.TaskTotalEstimateMins).toBe(15);
    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.teamMembers[0].EstimatedEffortHours).toBe(8);
    expect(result.content[1].text).toBe(STALE_AFTER_WRITE_NOTICE);
  });

  it('update_task_effort rejects a milestone task without writing', async () => {
    const { server, tools } = createFakeServer();
    const clients = createFakeClients();
    mockHappyPath(clients, { task: { Id: 42, ProjectId: 100, KindId: 1 } });
    registerEffortTools(server, clients);

    const result = await tools.get('update_task_effort')!.cb({
      projectId: 100, taskId: 42,
      userEstimates: [{ userId: 501, estimatedHours: 8, estimatedMinutes: 45 }],
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/milestone/i);
    expect(clients.rest.put).not.toHaveBeenCalled();
  });

  it('update_task_effort rejects a summary task without writing', async () => {
    const { server, tools } = createFakeServer();
    const clients = createFakeClients();
    mockHappyPath(clients, { task: { Id: 42, ProjectId: 100, KindId: 2 } });
    registerEffortTools(server, clients);

    const result = await tools.get('update_task_effort')!.cb({
      projectId: 100, taskId: 42,
      userEstimates: [{ userId: 501, estimatedHours: 8, estimatedMinutes: 45 }],
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/summary/i);
    expect(clients.rest.put).not.toHaveBeenCalled();
  });

  it('update_task_effort rejects when the task belongs to a different project', async () => {
    const { server, tools } = createFakeServer();
    const clients = createFakeClients();
    mockHappyPath(clients, { task: { Id: 42, ProjectId: 999, KindId: 3 } });
    registerEffortTools(server, clients);

    const result = await tools.get('update_task_effort')!.cb({
      projectId: 100, taskId: 42,
      userEstimates: [{ userId: 501, estimatedHours: 8, estimatedMinutes: 45 }],
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/does not belong to project 100/);
    expect(clients.rest.put).not.toHaveBeenCalled();
  });

  it('update_task_effort surfaces the not-assigned error without writing', async () => {
    const { server, tools } = createFakeServer();
    const clients = createFakeClients();
    mockHappyPath(clients);
    registerEffortTools(server, clients);

    const result = await tools.get('update_task_effort')!.cb({
      projectId: 100, taskId: 42,
      userEstimates: [{ userId: 999, estimatedHours: 1, estimatedMinutes: 0 }],
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/not assigned/);
    expect(clients.rest.put).not.toHaveBeenCalled();
  });

  it('update_task_effort fails when the readback does not show the new estimate', async () => {
    const { server, tools } = createFakeServer();
    const clients = createFakeClients();
    clients.rest.get.mockImplementation(async (path: string) => {
      if (path === 'projects/100/tasks/42') return { Id: 42, ProjectId: 100, KindId: 3 };
      if (path.endsWith('effortbyteammember')) return [TEAM_ROW, OTHER_TEAM_ROW];
      if (path.endsWith('effortbycategory')) return [CATEGORY_ROW];
      throw new Error(`unexpected GET ${path}`);
    });
    clients.rest.put.mockResolvedValue({ Id: 42, StatusCode: 200 });
    registerEffortTools(server, clients);

    await expect(tools.get('update_task_effort')!.cb({
      projectId: 100, taskId: 42,
      userEstimates: [{ userId: 501, estimatedHours: 8, estimatedMinutes: 45 }],
    })).rejects.toThrow(/write verification failed/);
  });

  it('update_task_effort returns the insufficient scope response when write scope is revoked mid-session', async () => {
    const { server, tools } = createFakeServer();
    const clients = createFakeClients();
    const ctx = { grantedScopes: ['mcp:read', 'mcp:write'] } as EffectiveUserContext;
    registerEffortTools(server, clients, ctx);
    ctx.grantedScopes = ['mcp:read'];

    const result = await tools.get('update_task_effort')!.cb({
      projectId: 100, taskId: 42,
      userEstimates: [{ userId: 501, estimatedHours: 1, estimatedMinutes: 0 }],
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('insufficient_scope');
    expect(clients.rest.put).not.toHaveBeenCalled();
  });
});
