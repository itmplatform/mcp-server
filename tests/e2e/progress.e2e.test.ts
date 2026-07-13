import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  setupE2E,
  callTool,
  listTools,
  createProjectViaRest,
  deleteProjectViaRest,
  deleteTasksViaRest,
  fetchJson,
  getReferenceItems,
  querySqlNumber,
} from './setup.js';

describe('progress tools', () => {
  setupE2E();

  let testProjectId: number;
  let testTaskId: number | undefined;
  let assessmentId: number | undefined;
  let createdProgressId: number | undefined;

  function parseToolSuccess(result: any) {
    expect(result.error).toBeUndefined();
    expect(result.result).toBeDefined();
    expect(result.result.isError).toBeFalsy();
    return JSON.parse(result.result.content[0].text);
  }

  beforeAll(async () => {
    testProjectId = await createProjectViaRest(`E2E Progress Test ${Date.now()}`);

    const today = new Date().toISOString().slice(0, 10);
    const nextMonth = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    const taskResponse = await fetchJson('POST', `projects/${testProjectId}/tasks`, {
      Name: `E2E Progress Task ${Date.now()}`,
      StartDate: today,
      EndDate: nextMonth,
    }) as { Id?: number; id?: number };
    testTaskId = taskResponse.Id ?? taskResponse.id;
  }, 30000);

  afterAll(async () => {
    if (testTaskId) await deleteTasksViaRest(testProjectId, [testTaskId]);
    if (testProjectId) await deleteProjectViaRest(testProjectId);
  }, 30000);

  it('exposes the four progress tools', async () => {
    const tools = await listTools();
    const names = tools.result.tools.map((tool: { name: string }) => tool.name);
    expect(names).toContain('list_task_progress');
    expect(names).toContain('get_project_progress');
    expect(names).toContain('create_task_progress');
    expect(names).toContain('update_task_progress');
  });

  it('get_reference_data returns assessments with usable IDs', async () => {
    const result = await callTool('get_reference_data', { entity: 'assessments' });
    const data = parseToolSuccess(result);
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    expect(data[0]).toHaveProperty('Id');
    expect(data[0]).toHaveProperty('Name');
    assessmentId = data[0].Id;

    const viaRest = await getReferenceItems('assessments');
    expect(viaRest.map(item => item.Id)).toContain(assessmentId);
  });

  it('create_task_progress creates an entry and returns the confirmed state', async () => {
    expect(testTaskId).toBeDefined();
    expect(assessmentId).toBeDefined();
    const today = new Date().toISOString().slice(0, 10);
    const result = await callTool('create_task_progress', {
      projectId: testProjectId,
      taskId: testTaskId,
      reportDate: today,
      percentage: 40,
      assessmentId,
      shortDescription: 'E2E progress entry',
      description: 'Created by progress E2E test',
    });
    const data = parseToolSuccess(result);
    expect(result.result.content[1].text).toContain('5-60 seconds');
    expect(data.TaskFollowUpId).toBeGreaterThan(0);
    expect(data.Percentage).toBe(40);
    expect(data.AssessmentId).toBe(assessmentId);
    expect(data.ShortDescription).toBe('E2E progress entry');
    createdProgressId = data.TaskFollowUpId;
  });

  it('list_task_progress returns the created entry', async () => {
    expect(createdProgressId).toBeDefined();
    const result = await callTool('list_task_progress', {
      projectId: testProjectId,
      taskId: testTaskId,
    });
    const data = parseToolSuccess(result);
    expect(Array.isArray(data)).toBe(true);
    const entry = data.find((row: { TaskFollowUpId: number }) => row.TaskFollowUpId === createdProgressId);
    expect(entry).toBeDefined();
    expect(entry.Percentage).toBe(40);
  });

  it('update_task_progress updates the entry and returns the confirmed state', async () => {
    expect(createdProgressId).toBeDefined();
    const result = await callTool('update_task_progress', {
      projectId: testProjectId,
      taskId: testTaskId,
      progressId: createdProgressId,
      percentage: 70,
      shortDescription: 'E2E progress entry updated',
    });
    const data = parseToolSuccess(result);
    expect(data.TaskFollowUpId).toBe(createdProgressId);
    expect(data.Percentage).toBe(70);
    expect(data.ShortDescription).toBe('E2E progress entry updated');

    const sqlPercentage = querySqlNumber(
      `SELECT intPercentage FROM dbo.tblTaskFollowUp WHERE intTaskFollowUpId = ${createdProgressId};`,
    );
    expect(sqlPercentage).toBe(70);
  });

  it('creating task progress cascades automatic project progress (side effect preserved)', async () => {
    const projectFollowUps = querySqlNumber(
      `SELECT COUNT(*) FROM dbo.tblProjectFollowUp WHERE intProjectId = ${testProjectId};`,
    );
    expect(projectFollowUps).toBeGreaterThan(0);
  });

  it('get_project_progress returns the progress report graph', async () => {
    const result = await callTool('get_project_progress', { projectId: testProjectId });
    const data = parseToolSuccess(result);
    expect(data).toHaveProperty('Expected');
    expect(data).toHaveProperty('FollowUps');
  });

  it('list_task_progress fails for a task outside the project (scoping enforced)', async () => {
    const result = await callTool('list_task_progress', {
      projectId: testProjectId,
      taskId: 99999999,
    });
    expect(result.result.isError).toBe(true);
  });
});
