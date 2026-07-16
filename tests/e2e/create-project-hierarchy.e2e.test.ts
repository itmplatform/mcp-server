import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import {
  setupE2E,
  callTool,
  deleteProjectsViaRest,
  fetchJson,
  getReferenceItems,
} from './setup.js';

describe('create_project, task hierarchy, and milestones', () => {
  setupE2E();
  const waitForRateLimitWindow = () => new Promise(resolve => setTimeout(resolve, 1100));

  const createdProjectIds: number[] = [];
  let projectTypeId: number | undefined;
  let taskStatusId: number | undefined;
  let waterfallProjectId: number | undefined;
  let kanbanProjectId: number | undefined;
  let summaryTaskId: number | undefined;
  let plainParentTaskId: number | undefined;
  let childTaskId: number | undefined;

  const today = new Date().toISOString().slice(0, 10);
  const nextMonth = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

  function parseToolSuccess(result: any) {
    expect(result.error).toBeUndefined();
    expect(result.result).toBeDefined();
    expect(result.result.isError).toBeFalsy();
    return JSON.parse(result.result.content[0].text);
  }

  beforeAll(async () => {
    projectTypeId = (await getReferenceItems('getprojecttypes'))[0]?.Id;
    if (!projectTypeId) throw new Error('No project types available');
    await waitForRateLimitWindow();
    taskStatusId = (await getReferenceItems('gettaskstatuses'))[0]?.Id;
    if (!taskStatusId) throw new Error('No task statuses available');
  }, 60000);

  beforeEach(async () => {
    await waitForRateLimitWindow();
  });

  afterAll(async () => {
    // Deleting the projects cascades to their tasks.
    await deleteProjectsViaRest(createdProjectIds);
  }, 60000);

  it('create_project creates a Waterfall project with account defaults', async () => {
    const result = await callTool('create_project', {
      Name: `E2E Create Project ${Date.now()}`,
      TypeId: projectTypeId,
      Description: 'Created by create_project E2E test',
      StartDate: today,
      EndDate: nextMonth,
    });
    const data = parseToolSuccess(result);

    waterfallProjectId = data.Id ?? data.id;
    expect(waterfallProjectId).toBeDefined();
    createdProjectIds.push(waterfallProjectId!);

    expect(data.MethodTypeId).toBe(1);
    expect(data.Status?.Id).toBeGreaterThan(0);
    expect(data.No).toMatch(/^PR-/);
    expect(data.Description).toBe('Created by create_project E2E test');
  });

  it('create_project rejects StatusId with a pointer to update_project', async () => {
    const result = await callTool('create_project', {
      Name: `E2E Status Reject ${Date.now()}`,
      TypeId: projectTypeId,
      StatusId: 1,
    });

    expect(JSON.stringify(result)).toContain('update_project');
  });

  it('create_project surfaces the duplicate-name validation from REST', async () => {
    expect(waterfallProjectId).toBeDefined();
    const existing = await fetchJson('GET', `projects/${waterfallProjectId}`) as { Name: string };
    await waitForRateLimitWindow();
    const result = await callTool('create_project', {
      Name: existing.Name,
      TypeId: projectTypeId,
    });

    expect(JSON.stringify(result)).toContain('already exists');
  });

  it('create_project creates a Kanban project', async () => {
    const result = await callTool('create_project', {
      Name: `E2E Kanban Project ${Date.now()}`,
      TypeId: projectTypeId,
      ProjectMethodTypeId: 2,
    });
    const data = parseToolSuccess(result);

    kanbanProjectId = data.Id ?? data.id;
    expect(kanbanProjectId).toBeDefined();
    createdProjectIds.push(kanbanProjectId!);
    expect(data.MethodTypeId).toBe(2);
  });

  it('create_task creates a summary task with only StatusId', async () => {
    expect(waterfallProjectId).toBeDefined();
    const result = await callTool('create_task', {
      projectId: waterfallProjectId,
      Name: `1. Discovery ${Date.now()}`,
      KindId: 2,
      StatusId: taskStatusId,
    });
    const data = parseToolSuccess(result);

    summaryTaskId = data.Id ?? data.id;
    expect(data.KindId).toBe(2);
  });

  it('create_task places a child under the summary via ParentId', async () => {
    expect(summaryTaskId).toBeDefined();
    const result = await callTool('create_task', {
      projectId: waterfallProjectId,
      Name: `Child of summary ${Date.now()}`,
      ParentId: summaryTaskId,
      StatusId: taskStatusId,
      StartDate: today,
      EndDate: nextMonth,
    });
    const data = parseToolSuccess(result);

    childTaskId = data.Id ?? data.id;
    expect(data.ParentTask?.Id).toBe(summaryTaskId);
  });

  it('auto-converts a plain-task parent into a summary', async () => {
    const parentResult = await callTool('create_task', {
      projectId: waterfallProjectId,
      Name: `Future parent ${Date.now()}`,
      StatusId: taskStatusId,
      StartDate: today,
      EndDate: nextMonth,
    });
    plainParentTaskId = parseToolSuccess(parentResult).Id;
    expect(plainParentTaskId).toBeDefined();

    await waitForRateLimitWindow();
    const childResult = await callTool('create_task', {
      projectId: waterfallProjectId,
      Name: `Promoting child ${Date.now()}`,
      ParentId: plainParentTaskId,
      StatusId: taskStatusId,
      StartDate: today,
      EndDate: nextMonth,
    });
    parseToolSuccess(childResult);

    await waitForRateLimitWindow();
    const parent = await fetchJson('GET', `projects/${waterfallProjectId}/tasks/${plainParentTaskId}`) as { KindId: number };
    expect(parent.KindId).toBe(2);
  });

  it('create_task creates a milestone with EndDate only', async () => {
    const result = await callTool('create_task', {
      projectId: waterfallProjectId,
      Name: `Go-Live ${Date.now()}`,
      KindId: 1,
      EndDate: nextMonth,
    });
    const data = parseToolSuccess(result);

    expect(data.KindId).toBe(1);
    expect(data.EndDate).toContain(nextMonth);
  });

  it('create_task rejects a spanning milestone client-side', async () => {
    const result = await callTool('create_task', {
      projectId: waterfallProjectId,
      Name: `Bad milestone ${Date.now()}`,
      KindId: 1,
      StartDate: today,
      EndDate: nextMonth,
    });

    expect(result.result.isError).toBe(true);
    expect(result.result.content[0].text).toContain('StartDate');
  });

  it('create_task rejects milestones and hierarchy on Kanban projects', async () => {
    expect(kanbanProjectId).toBeDefined();
    const milestoneResult = await callTool('create_task', {
      projectId: kanbanProjectId,
      Name: `Kanban milestone ${Date.now()}`,
      KindId: 1,
      EndDate: nextMonth,
    });
    expect(milestoneResult.result.isError).toBe(true);
    expect(milestoneResult.result.content[0].text).toContain('Waterfall');

    await waitForRateLimitWindow();
    const parentResult = await callTool('create_task', {
      projectId: kanbanProjectId,
      Name: `Kanban child ${Date.now()}`,
      ParentId: 1,
    });
    expect(parentResult.result.isError).toBe(true);
    expect(parentResult.result.content[0].text).toContain('Waterfall');
  });

  it('update_task converts a task to a milestone with equal dates', async () => {
    const createResult = await callTool('create_task', {
      projectId: waterfallProjectId,
      Name: `To convert ${Date.now()}`,
      StatusId: taskStatusId,
      StartDate: today,
      EndDate: nextMonth,
    });
    const taskId = parseToolSuccess(createResult).Id;

    await waitForRateLimitWindow();
    const updateResult = await callTool('update_task', {
      projectId: waterfallProjectId,
      taskId,
      KindId: 1,
      StartDate: nextMonth,
      EndDate: nextMonth,
    });
    const data = parseToolSuccess(updateResult);
    expect(data.KindId).toBe(1);
  });

  it('update_task moves a task between parents via ParentId', async () => {
    expect(childTaskId).toBeDefined();
    expect(plainParentTaskId).toBeDefined();
    const result = await callTool('update_task', {
      projectId: waterfallProjectId,
      taskId: childTaskId,
      ParentId: plainParentTaskId,
    });
    const data = parseToolSuccess(result);
    expect(data.ParentTask?.Id).toBe(plainParentTaskId);
  });

  it('update_task detaches a task to root with ParentId 0', async () => {
    expect(childTaskId).toBeDefined();
    const result = await callTool('update_task', {
      projectId: waterfallProjectId,
      taskId: childTaskId,
      ParentId: 0,
    });
    const data = parseToolSuccess(result);
    expect(data.ParentTask?.Id ?? 0).toBe(0);
  });
});
