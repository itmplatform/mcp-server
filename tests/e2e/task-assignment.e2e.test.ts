import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  setupE2E,
  callTool,
  createProjectViaRest,
  deleteProjectViaRest,
  deleteTasksViaRest,
  querySqlNumber,
} from './setup.js';
import { querySqlScalar } from '../helpers/local-api.js';

describe('task assignment via create_task/update_task', () => {
  setupE2E();

  let waterfallProjectId: number;
  let kanbanProjectId: number | undefined;
  const waterfallTaskIds: number[] = [];
  const kanbanTaskIds: number[] = [];
  let managerUsername: string;
  let memberUsername: string;
  let memberUserId: number;

  const today = new Date().toISOString().slice(0, 10);
  const nextMonth = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

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

  function teamRow(data: any, username: string) {
    expect(Array.isArray(data.team)).toBe(true);
    return data.team.find((row: { Username: string }) => row.Username.toLowerCase() === username.toLowerCase());
  }

  beforeAll(async () => {
    waterfallProjectId = await createProjectViaRest(`E2E Assign Test ${Date.now()}`);

    const accountId = querySqlNumber(`SELECT intAccountId FROM dbo.tblProject WHERE intProjectId = ${waterfallProjectId};`);
    const userFilter = `intAccountId = ${accountId} AND strUserName IS NOT NULL AND strUserName <> '' AND blnActive = 1`;
    managerUsername = querySqlScalar(`SELECT TOP 1 strUserName FROM dbo.tblUser WHERE ${userFilter} ORDER BY intUserId;`);
    memberUsername = querySqlScalar(
      `SELECT strUserName FROM dbo.tblUser WHERE ${userFilter} ORDER BY intUserId OFFSET 1 ROWS FETCH NEXT 1 ROWS ONLY;`,
    );
    memberUserId = querySqlNumber(
      `SELECT intUserId FROM dbo.tblUser WHERE ${userFilter} ORDER BY intUserId OFFSET 1 ROWS FETCH NEXT 1 ROWS ONLY;`,
    );
  }, 45000);

  afterAll(async () => {
    if (waterfallTaskIds.length) await deleteTasksViaRest(waterfallProjectId, waterfallTaskIds);
    if (kanbanProjectId && kanbanTaskIds.length) await deleteTasksViaRest(kanbanProjectId, kanbanTaskIds);
    if (waterfallProjectId) await deleteProjectViaRest(waterfallProjectId);
    if (kanbanProjectId) await deleteProjectViaRest(kanbanProjectId);
  }, 30000);

  it('create_task assigns managers and members with the right flags', async () => {
    const result = await callTool('create_task', {
      projectId: waterfallProjectId,
      Name: `E2E Assign Create ${Date.now()}`,
      StatusId: (await statusId()),
      StartDate: today,
      EndDate: nextMonth,
      TaskManagers: managerUsername,
      TaskMembers: memberUsername,
    });
    const data = parseToolSuccess(result);
    waterfallTaskIds.push(data.Id);

    const manager = teamRow(data, managerUsername);
    const member = teamRow(data, memberUsername);
    expect(manager).toBeDefined();
    expect(member).toBeDefined();
    expect(manager.IsTaskManager).toBe(true);
    expect(member.IsTaskManager).toBe(false);

    expect(querySqlNumber(
      `SELECT COUNT(*) FROM dbo.tblTaskUser tu
         JOIN dbo.tblProjectUser pu ON pu.intProjectUserId = tu.intProjectUserId
        WHERE tu.intTaskId = ${data.Id};`,
    )).toBe(2);
  });

  it('update_task adds an assignee without removing existing ones (add-only)', async () => {
    const created = parseToolSuccess(await callTool('create_task', {
      projectId: waterfallProjectId,
      Name: `E2E Assign Update ${Date.now()}`,
      StatusId: (await statusId()),
      StartDate: today,
      EndDate: nextMonth,
      TaskManagers: managerUsername,
    }));
    waterfallTaskIds.push(created.Id);

    const result = await callTool('update_task', {
      projectId: waterfallProjectId,
      taskId: created.Id,
      TaskMembers: memberUsername,
    });
    const data = parseToolSuccess(result);

    expect(teamRow(data, managerUsername)).toBeDefined();
    expect(teamRow(data, memberUsername)).toBeDefined();
    expect(teamRow(data, managerUsername).IsTaskManager).toBe(true);
  });

  it('assignment unblocks update_task_effort for the newly assigned user (HS 11710 flow)', async () => {
    const taskId = waterfallTaskIds[waterfallTaskIds.length - 1];
    const result = await callTool('update_task_effort', {
      projectId: waterfallProjectId,
      taskId,
      userEstimates: [{ userId: memberUserId, estimatedHours: 2, estimatedMinutes: 0 }],
    });
    const data = parseToolSuccess(result);
    const row = data.teamMembers.find((member: { UserId: number }) => member.UserId === memberUserId);
    expect(row.EstimatedEffortHours).toBe(2);
  });

  it('rejects invalid usernames with the REST validation message and writes nothing', async () => {
    const taskId = waterfallTaskIds[0];
    const before = querySqlNumber(`SELECT COUNT(*) FROM dbo.tblTaskUser WHERE intTaskId = ${taskId};`);
    const result = await callTool('update_task', {
      projectId: waterfallProjectId,
      taskId,
      TaskMembers: 'nonexistent@nowhere.example',
    });
    expect(toolErrorText(result)).toMatch(/not valid users/);
    expect(querySqlNumber(`SELECT COUNT(*) FROM dbo.tblTaskUser WHERE intTaskId = ${taskId};`)).toBe(before);
  });

  it('rejects a username listed in both fields before calling REST', async () => {
    const result = await callTool('update_task', {
      projectId: waterfallProjectId,
      taskId: waterfallTaskIds[0],
      TaskManagers: managerUsername,
      TaskMembers: managerUsername,
    });
    expect(toolErrorText(result)).toMatch(/both TaskManagers and TaskMembers/);
  });

  it('Kanban saves everyone as a regular member', async () => {
    kanbanProjectId = await createProjectViaRest(`E2E Assign Kanban ${Date.now()}`, undefined, 2);
    const result = await callTool('create_task', {
      projectId: kanbanProjectId,
      Name: `E2E Assign Kanban Task ${Date.now()}`,
      TaskManagers: managerUsername,
    });
    const data = parseToolSuccess(result);
    kanbanTaskIds.push(data.Id);
    const row = teamRow(data, managerUsername);
    expect(row).toBeDefined();
    expect(row.IsTaskManager).toBe(false);
  });

  let cachedStatusId: number | undefined;
  async function statusId(): Promise<number> {
    if (!cachedStatusId) {
      const statuses = await callTool('get_reference_data', { entity: 'gettaskstatuses' });
      cachedStatusId = JSON.parse(statuses.result.content[0].text)[0].Id;
    }
    return cachedStatusId!;
  }
});
