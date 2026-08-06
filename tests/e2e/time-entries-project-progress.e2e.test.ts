import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  setupE2E,
  callTool,
  listTools,
  createProjectViaRest,
  deleteProjectViaRest,
  deleteTasksViaRest,
  fetchJson,
  getReferenceIds,
  querySqlNumber,
} from './setup.js';
import { querySqlScalar } from '../helpers/local-api.js';

const TODAY = new Date().toISOString().slice(0, 10);

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

describe('log_time_entry', () => {
  setupE2E();

  let projectId: number;
  let taskId: number | undefined;
  let unassignedTaskId: number | undefined;
  let assignedUserId: number | undefined;

  beforeAll(async () => {
    projectId = await createProjectViaRest(`E2E TimeEntry Test ${Date.now()}`);

    const nextMonth = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    const taskResponse = await fetchJson('POST', `projects/${projectId}/tasks`, {
      Name: `E2E TimeEntry Task ${Date.now()}`,
      StartDate: TODAY,
      EndDate: nextMonth,
    }) as { Id?: number; id?: number };
    taskId = taskResponse.Id ?? taskResponse.id;

    const unassignedResponse = await fetchJson('POST', `projects/${projectId}/tasks`, {
      Name: `E2E TimeEntry Unassigned ${Date.now()}`,
      StartDate: TODAY,
      EndDate: nextMonth,
    }) as { Id?: number; id?: number };
    unassignedTaskId = unassignedResponse.Id ?? unassignedResponse.id;

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
    const ids = [taskId, unassignedTaskId].filter((id): id is number => typeof id === 'number');
    if (ids.length) await deleteTasksViaRest(projectId, ids);
    if (projectId) await deleteProjectViaRest(projectId);
  }, 30000);

  function loggedMinutes(): number {
    return querySqlNumber(
      `SELECT ISNULL(SUM(intWorkHour * 60 + intWorkMin), 0) FROM dbo.tblTaskTime
        WHERE intTaskId = ${taskId} AND intUserId = ${assignedUserId}
          AND CONVERT(date, dtsWorkdate) = '${TODAY}' AND intTimeEntryType = 2;`,
    );
  }

  it('is listed as a tool', async () => {
    const tools = await listTools();
    const names = tools.result.tools.map((tool: { name: string }) => tool.name);
    expect(names).toContain('log_time_entry');
  });

  it('set mode writes the total to tblTaskTime and echoes both totals', async () => {
    const result = await callTool('log_time_entry', {
      projectId, taskId, userId: assignedUserId, date: TODAY, hours: 2, minutes: 30, mode: 'set', comment: 'E2E set',
    });
    const data = parseToolSuccess(result);
    expect(data.previousTotal).toBe('0:00');
    expect(data.newTotal).toBe('2:30');
    expect(data.userId).toBe(assignedUserId);
    expect(loggedMinutes()).toBe(150);
  });

  it('add mode adds to the existing total', async () => {
    const result = await callTool('log_time_entry', {
      projectId, taskId, userId: assignedUserId, date: TODAY, hours: 1, minutes: 15, mode: 'add',
    });
    const data = parseToolSuccess(result);
    expect(data.previousTotal).toBe('2:30');
    expect(data.newTotal).toBe('3:45');
    expect(loggedMinutes()).toBe(225);
  });

  it('set 0:00 clears the entry', async () => {
    const result = await callTool('log_time_entry', {
      projectId, taskId, userId: assignedUserId, date: TODAY, hours: 0, minutes: 0, mode: 'set',
    });
    const data = parseToolSuccess(result);
    expect(data.newTotal).toBe('0:00');
    expect(loggedMinutes()).toBe(0);
  });

  it('rejects an unassigned task with an assignment hint and writes nothing', async () => {
    const result = await callTool('log_time_entry', {
      projectId, taskId: unassignedTaskId, userId: assignedUserId, date: TODAY, hours: 1, minutes: 0, mode: 'set',
    });
    const text = toolErrorText(result);
    expect(text).toMatch(/not assigned/i);
    expect(text).toContain('update_task');
    expect(querySqlNumber(
      `SELECT COUNT(*) FROM dbo.tblTaskTime WHERE intTaskId = ${unassignedTaskId};`,
    )).toBe(0);
  });

  it('rejects future dates before any write', async () => {
    const result = await callTool('log_time_entry', {
      projectId, taskId, userId: assignedUserId, date: '2999-01-01', hours: 1, minutes: 0, mode: 'set',
    });
    expect(toolErrorText(result)).toMatch(/future/i);
  });
});

describe('project progress tools', () => {
  setupE2E();

  let projectId: number;
  let assessmentId: number | undefined;
  let progressId: number | undefined;

  beforeAll(async () => {
    projectId = await createProjectViaRest(`E2E ProjProgress Test ${Date.now()}`);
    const assessments = await getReferenceIds('assessments');
    assessmentId = assessments[0];
  }, 45000);

  afterAll(async () => {
    if (projectId) await deleteProjectViaRest(projectId);
  }, 30000);

  it('lists both project progress write tools', async () => {
    const tools = await listTools();
    const names = tools.result.tools.map((tool: { name: string }) => tool.name);
    expect(names).toContain('create_project_progress');
    expect(names).toContain('update_project_progress');
  });

  it('create_project_progress writes a tblProjectFollowUp row with the assessment', async () => {
    const result = await callTool('create_project_progress', {
      projectId,
      reportDate: TODAY,
      percentage: 30,
      assessmentId,
      shortDescription: 'E2E status report',
      description: 'Everything on track',
    });
    const data = parseToolSuccess(result);
    progressId = data.ProjectProgressId;
    expect(progressId).toBeGreaterThan(0);
    expect(data.Percentage).toBe(30);
    expect(data.AssessmentId).toBe(assessmentId);
    expect(data.ShortDescription).toBe('E2E status report');
    expect(data.Description).toBe('Everything on track');

    expect(querySqlNumber(
      `SELECT intPercentage FROM dbo.tblProjectFollowUp WHERE intProjectFollowUpId = ${progressId};`,
    )).toBe(30);
    expect(querySqlNumber(
      `SELECT intAssessment FROM dbo.tblProjectFollowUp WHERE intProjectFollowUpId = ${progressId};`,
    )).toBe(assessmentId);
  });

  it('get_project_progress includeEntries returns the created entry alongside the curves', async () => {
    const result = await callTool('get_project_progress', { projectId, includeEntries: true });
    const data = parseToolSuccess(result);
    expect(Array.isArray(data.entries)).toBe(true);
    const entry = data.entries.find((candidate: { ProjectProgressId: number }) => candidate.ProjectProgressId === progressId);
    expect(entry).toBeDefined();
    expect(entry.Percentage).toBe(30);
    expect(entry.AssessmentName).toBeTruthy();
  });

  it('update_project_progress changes only the sent fields', async () => {
    const result = await callTool('update_project_progress', {
      projectId, progressId, percentage: 55,
    });
    const data = parseToolSuccess(result);
    expect(data.Percentage).toBe(55);
    expect(data.ShortDescription).toBe('E2E status report');
    expect(querySqlNumber(
      `SELECT intPercentage FROM dbo.tblProjectFollowUp WHERE intProjectFollowUpId = ${progressId};`,
    )).toBe(55);
  });

  it('surfaces the REST message for an invalid assessment', async () => {
    const result = await callTool('create_project_progress', {
      projectId,
      reportDate: TODAY,
      percentage: 10,
      assessmentId: 99999999,
      shortDescription: 'bad assessment',
    });
    expect(toolErrorText(result)).toMatch(/assessment/i);
  });

  it('auto-closes the project when a 100% entry is created (sproc side effect)', async () => {
    const result = await callTool('create_project_progress', {
      projectId,
      reportDate: TODAY,
      percentage: 100,
      assessmentId,
      shortDescription: 'E2E complete',
    });
    parseToolSuccess(result);
    expect(querySqlNumber(
      `SELECT MAX(CAST(ps.blnCompleted AS int)) FROM dbo.tblProject p
         JOIN dbo.tblProjectStatus ps ON ps.intProjectStatusBaseId = p.intProjectStatuesId
          AND ps.intAccountId = p.intAccountId
        WHERE p.intProjectId = ${projectId};`,
    )).toBe(1);
    expect(querySqlNumber(
      `SELECT COUNT(*) FROM dbo.tblProjectStatusRequest
        WHERE intProjectId = ${projectId} AND strComment = 'Auto closed by 100% follow-up';`,
    )).toBe(1);
  });
});
