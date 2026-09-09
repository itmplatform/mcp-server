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

// Non-login users (resources without a login) have an empty username, so they can only be
// addressed by their numeric UserId. Fixture: the e2e account needs one active non-login
// user created without a login name (Users > Create a new user, tick "No-login user",
// leave the login empty). Nothing is created or deleted on the user itself.
describe('task assignment of non-login users via numeric UserId', () => {
  setupE2E();

  let projectId: number;
  const taskIds: number[] = [];
  let nonLoginUserId: number;
  let nonLoginDisplayName: string;

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

  function taskUserRows(taskId: number): number {
    return querySqlNumber(
      `SELECT COUNT(*) FROM dbo.tblTaskUser tu
         JOIN dbo.tblProjectUser pu ON pu.intProjectUserId = tu.intProjectUserId
        WHERE tu.intTaskId = ${taskId} AND pu.intUserId = ${nonLoginUserId};`,
    );
  }

  beforeAll(async () => {
    projectId = await createProjectViaRest(`E2E NonLogin Assign ${Date.now()}`);
    const accountId = querySqlNumber(`SELECT intAccountId FROM dbo.tblProject WHERE intProjectId = ${projectId};`);
    const filter = `intAccountId = ${accountId} AND blnIsNonLoginUser = 1 AND (strUserName IS NULL OR strUserName = '') AND blnActive = 1`;
    if (!querySqlNumber(`SELECT COUNT(*) FROM dbo.tblUser WHERE ${filter};`)) {
      throw new Error(
        'Fixture missing: the e2e account has no active non-login user without a login name. '
        + 'Create one in the web UI (Users > Create a new user, tick "No-login user", leave the login empty).',
      );
    }
    nonLoginUserId = querySqlNumber(`SELECT TOP 1 intUserId FROM dbo.tblUser WHERE ${filter} ORDER BY intUserId DESC;`);
    nonLoginDisplayName = querySqlScalar(`SELECT TOP 1 strServiceAlias FROM dbo.tblUser WHERE ${filter} ORDER BY intUserId DESC;`);
  }, 45000);

  afterAll(async () => {
    if (taskIds.length) await deleteTasksViaRest(projectId, taskIds);
    if (projectId) await deleteProjectViaRest(projectId);
  }, 30000);

  it('search_users returns the non-login flag and an empty EmailAddress for the fixture', async () => {
    const result = await callTool('search_users', { query: nonLoginDisplayName, limit: 100 });
    const data = parseToolSuccess(result);
    const rows: any[] = Array.isArray(data) ? data : data.list ?? [];
    const row = rows.find(user => user.UserId === nonLoginUserId);
    expect(row, `user ${nonLoginUserId} in search_users`).toBeDefined();
    expect(row.IsNonLoginUser).toBe(true);
    expect(row.EmailAddress ?? '').toBe('');
  });

  it('rejects the display name with the REST validation message and creates nothing', async () => {
    const result = await callTool('create_task', {
      projectId,
      Name: `E2E NonLogin by name ${Date.now()}`,
      StatusId: await statusId(),
      StartDate: today,
      EndDate: nextMonth,
      TaskMembers: nonLoginDisplayName,
    });
    expect(toolErrorText(result)).toMatch(/not valid users/);
  });

  it('assigns the user by numeric UserId and reports the member without a username', async () => {
    const result = await callTool('create_task', {
      projectId,
      Name: `E2E NonLogin by id ${Date.now()}`,
      StatusId: await statusId(),
      StartDate: today,
      EndDate: nextMonth,
      TaskMembers: String(nonLoginUserId),
    });
    const data = parseToolSuccess(result);
    taskIds.push(data.Id);

    const row = data.team.find((member: { UserId: number }) => member.UserId === nonLoginUserId);
    expect(row).toBeDefined();
    expect(row.Username).toBeNull();
    expect(row.IsTaskManager).toBe(false);
    expect(taskUserRows(data.Id)).toBe(1);
  });

  it('update_task with the same UserId is idempotent and can promote the user to manager', async () => {
    const taskId = taskIds[0];
    const result = await callTool('update_task', {
      projectId,
      taskId,
      TaskManagers: String(nonLoginUserId),
    });
    const data = parseToolSuccess(result);
    const row = data.team.find((member: { UserId: number }) => member.UserId === nonLoginUserId);
    expect(row.IsTaskManager).toBe(true);
    expect(taskUserRows(taskId)).toBe(1);
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
