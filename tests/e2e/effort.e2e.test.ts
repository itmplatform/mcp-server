import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  setupE2E,
  callTool,
  listTools,
  createProjectViaRest,
  deleteProjectViaRest,
  deleteTasksViaRest,
  fetchJson,
  querySqlNumber,
} from './setup.js';
import { querySqlScalar } from '../helpers/local-api.js';

describe('task effort tools', () => {
  setupE2E();

  let projectId: number;
  let otherProjectId: number | undefined;
  let taskId: number | undefined;
  let milestoneId: number | undefined;
  let assignedUserId: number | undefined;

  function parseToolSuccess(result: any) {
    expect(result.error).toBeUndefined();
    expect(result.result).toBeDefined();
    expect(result.result.isError).toBeFalsy();
    return JSON.parse(result.result.content[0].text);
  }

  function toolErrorText(result: any): string {
    expect(result.result?.isError).toBe(true);
    return result.result.content[0].text as string;
  }

  beforeAll(async () => {
    projectId = await createProjectViaRest(`E2E Effort Test ${Date.now()}`);

    const today = new Date().toISOString().slice(0, 10);
    const nextMonth = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    const taskResponse = await fetchJson('POST', `projects/${projectId}/tasks`, {
      Name: `E2E Effort Task ${Date.now()}`,
      StartDate: today,
      EndDate: nextMonth,
    }) as { Id?: number; id?: number };
    taskId = taskResponse.Id ?? taskResponse.id;

    const milestoneResponse = await fetchJson('POST', `projects/${projectId}/tasks`, {
      Name: `E2E Effort Milestone ${Date.now()}`,
      KindId: 1,
      EndDate: nextMonth,
    }) as { Id?: number; id?: number };
    milestoneId = milestoneResponse.Id ?? milestoneResponse.id;

    // Assign a real account user to the task via the REST TaskMembers
    // username mechanism (the same path update_task exposes).
    const accountId = querySqlNumber(`SELECT intAccountId FROM dbo.tblProject WHERE intProjectId = ${projectId};`);
    const username = querySqlScalar(
      `SELECT TOP 1 strUserName FROM dbo.tblUser WHERE intAccountId = ${accountId} AND strUserName IS NOT NULL AND strUserName <> '' ORDER BY intUserId;`,
    );
    assignedUserId = querySqlNumber(
      `SELECT TOP 1 intUserId FROM dbo.tblUser WHERE intAccountId = ${accountId} AND strUserName IS NOT NULL AND strUserName <> '' ORDER BY intUserId;`,
    );
    await fetchJson('PATCH', `projects/${projectId}/tasks/${taskId}`, { TaskMembers: username });
  }, 45000);

  afterAll(async () => {
    const ids = [taskId, milestoneId].filter((id): id is number => typeof id === 'number');
    if (ids.length) await deleteTasksViaRest(projectId, ids);
    if (projectId) await deleteProjectViaRest(projectId);
    if (otherProjectId) await deleteProjectViaRest(otherProjectId);
  }, 30000);

  it('exposes both effort tools', async () => {
    const tools = await listTools();
    const names = tools.result.tools.map((tool: { name: string }) => tool.name);
    expect(names).toContain('get_task_effort');
    expect(names).toContain('update_task_effort');
  });

  it('get_task_effort returns the assignment as a teamMembers row with a TaskUserId', async () => {
    const result = await callTool('get_task_effort', { projectId, taskId });
    const data = parseToolSuccess(result);
    expect(Array.isArray(data.teamMembers)).toBe(true);
    expect(Array.isArray(data.categories)).toBe(true);
    const row = data.teamMembers.find((member: { UserId: number }) => member.UserId === assignedUserId);
    expect(row).toBeDefined();
    expect(row.TaskUserId).toBeGreaterThan(0);
  });

  it('update_task_effort sets the estimate and preserves accepted effort, billing, and the task total', async () => {
    const taskUserId = querySqlNumber(
      `SELECT tu.intTaskUserId FROM dbo.tblTaskUser tu
         JOIN dbo.tblProjectUser pu ON pu.intProjectUserId = tu.intProjectUserId
        WHERE tu.intTaskId = ${taskId} AND pu.intUserId = ${assignedUserId};`,
    );
    const before = {
      totalHours: querySqlNumber(`SELECT ISNULL(intTaskEstHour, 0) FROM dbo.tblTask WHERE intTaskId = ${taskId};`),
      totalMins: querySqlNumber(`SELECT ISNULL(intTaskEstmin, 0) FROM dbo.tblTask WHERE intTaskId = ${taskId};`),
      workTimeRows: querySqlNumber(`SELECT COUNT(*) FROM dbo.tblTaskWorkTime WHERE intTaskId = ${taskId};`),
      autoAccept: querySqlNumber(`SELECT CAST(IsAutomaticActualEffortAccepted AS int) FROM dbo.tblTaskUser WHERE intTaskUserId = ${taskUserId};`),
      billing: querySqlNumber(`SELECT ISNULL(BillingCategoryId, -1) FROM dbo.tblTaskUser WHERE intTaskUserId = ${taskUserId};`),
      acceptedHours: querySqlNumber(`SELECT ISNULL(intActualEffortAcceptedHours, 0) FROM dbo.tblTaskUser WHERE intTaskUserId = ${taskUserId};`),
    };

    const result = await callTool('update_task_effort', {
      projectId,
      taskId,
      userEstimates: [{ userId: assignedUserId, estimatedHours: 3, estimatedMinutes: 30 }],
    });
    const data = parseToolSuccess(result);
    expect(result.result.content[1].text).toContain('5-60 seconds');
    const row = data.teamMembers.find((member: { UserId: number }) => member.UserId === assignedUserId);
    expect(row.EstimatedEffortHours).toBe(3);
    expect(row.EstimatedEffortMins).toBe(30);

    expect(querySqlNumber(`SELECT intEstimatedHours FROM dbo.tblTaskUser WHERE intTaskUserId = ${taskUserId};`)).toBe(3);
    expect(querySqlNumber(`SELECT intEstimatedMins FROM dbo.tblTaskUser WHERE intTaskUserId = ${taskUserId};`)).toBe(30);
    expect(querySqlNumber(`SELECT CAST(IsAutomaticActualEffortAccepted AS int) FROM dbo.tblTaskUser WHERE intTaskUserId = ${taskUserId};`)).toBe(before.autoAccept);
    expect(querySqlNumber(`SELECT ISNULL(BillingCategoryId, -1) FROM dbo.tblTaskUser WHERE intTaskUserId = ${taskUserId};`)).toBe(before.billing);
    expect(querySqlNumber(`SELECT ISNULL(intActualEffortAcceptedHours, 0) FROM dbo.tblTaskUser WHERE intTaskUserId = ${taskUserId};`)).toBe(before.acceptedHours);
    expect(querySqlNumber(`SELECT ISNULL(intTaskEstHour, 0) FROM dbo.tblTask WHERE intTaskId = ${taskId};`)).toBe(before.totalHours);
    expect(querySqlNumber(`SELECT ISNULL(intTaskEstmin, 0) FROM dbo.tblTask WHERE intTaskId = ${taskId};`)).toBe(before.totalMins);
    expect(querySqlNumber(`SELECT COUNT(*) FROM dbo.tblTaskWorkTime WHERE intTaskId = ${taskId};`)).toBe(before.workTimeRows);
  });

  it('update_task_effort writes the task total when explicitly provided', async () => {
    const result = await callTool('update_task_effort', {
      projectId,
      taskId,
      userEstimates: [{ userId: assignedUserId, estimatedHours: 4, estimatedMinutes: 0 }],
      taskTotalEstimate: { hours: 20, minutes: 15 },
    });
    parseToolSuccess(result);
    expect(querySqlNumber(`SELECT intTaskEstHour FROM dbo.tblTask WHERE intTaskId = ${taskId};`)).toBe(20);
    expect(querySqlNumber(`SELECT intTaskEstmin FROM dbo.tblTask WHERE intTaskId = ${taskId};`)).toBe(15);
  });

  it('rejects an unassigned user without writing', async () => {
    const estimateBefore = querySqlNumber(
      `SELECT tu.intEstimatedHours FROM dbo.tblTaskUser tu
         JOIN dbo.tblProjectUser pu ON pu.intProjectUserId = tu.intProjectUserId
        WHERE tu.intTaskId = ${taskId} AND pu.intUserId = ${assignedUserId};`,
    );
    const result = await callTool('update_task_effort', {
      projectId,
      taskId,
      userEstimates: [{ userId: 99999999, estimatedHours: 1, estimatedMinutes: 0 }],
    });
    expect(toolErrorText(result)).toMatch(/not assigned/);
    expect(querySqlNumber(
      `SELECT tu.intEstimatedHours FROM dbo.tblTaskUser tu
         JOIN dbo.tblProjectUser pu ON pu.intProjectUserId = tu.intProjectUserId
        WHERE tu.intTaskId = ${taskId} AND pu.intUserId = ${assignedUserId};`,
    )).toBe(estimateBefore);
  });

  it('rejects a milestone', async () => {
    const result = await callTool('update_task_effort', {
      projectId,
      taskId: milestoneId,
      userEstimates: [{ userId: assignedUserId, estimatedHours: 1, estimatedMinutes: 0 }],
    });
    expect(toolErrorText(result)).toMatch(/milestone/i);
  });

  it('rejects a projectId the task does not belong to', async () => {
    otherProjectId = await createProjectViaRest(`E2E Effort Other ${Date.now()}`);
    const result = await callTool('update_task_effort', {
      projectId: otherProjectId,
      taskId,
      userEstimates: [{ userId: assignedUserId, estimatedHours: 1, estimatedMinutes: 0 }],
    });
    expect(toolErrorText(result)).toMatch(/does not belong/);
  });
});
