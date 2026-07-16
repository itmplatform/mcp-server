import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import {
  setupE2E,
  callTool,
  createProjectViaRest,
  deleteProjectsViaRest,
  deleteTasksViaRest,
  fetchJson,
  getReferenceItems,
  listTools,
} from './setup.js';

interface StatusItem { Id: number; KanbanId?: number; Name?: string }
interface TaskReadback { Status?: { Id?: number; Name?: string } }

describe('bulk status tools', () => {
  setupE2E();
  const waitForRateLimitWindow = () => new Promise(resolve => setTimeout(resolve, 1100));

  let waterfallProjectId: number;
  let kanbanProjectId: number;
  let serviceId: number | undefined;
  const waterfallTaskIds: number[] = [];
  const kanbanTaskIds: number[] = [];
  const activityIds: number[] = [];

  let initialTaskStatus: StatusItem;
  let targetTaskStatus: StatusItem;
  let initialActivityStatus: StatusItem | undefined;
  let targetActivityStatus: StatusItem | undefined;

  function parseSummary(result: any) {
    expect(result.error).toBeUndefined();
    expect(result.result.isError).toBeFalsy();
    expect(result.result.content).toHaveLength(2);
    expect(result.result.content[1].text).toContain('5-60 seconds');
    return JSON.parse(result.result.content[0].text);
  }

  async function createTaskViaRest(projectId: number, body: Record<string, unknown>): Promise<number> {
    const created = await fetchJson('POST', `projects/${projectId}/tasks`, body) as { Id: number };
    return created.Id;
  }

  beforeAll(async () => {
    const projectTypeId = (await getReferenceItems('getprojecttypes'))[0]?.Id;
    if (!projectTypeId) throw new Error('No project types available');

    await waitForRateLimitWindow();
    waterfallProjectId = await createProjectViaRest(`E2E Bulk Status WF ${Date.now()}`, undefined, 1, projectTypeId);
    await waitForRateLimitWindow();
    kanbanProjectId = await createProjectViaRest(`E2E Bulk Status KB ${Date.now()}`, undefined, 2, projectTypeId);

    await waitForRateLimitWindow();
    const taskStatuses = await getReferenceItems('gettaskstatuses') as StatusItem[];
    if (taskStatuses.length < 2) throw new Error('Need at least two waterfall task statuses');
    initialTaskStatus = taskStatuses[0];
    targetTaskStatus = taskStatuses[1];

    for (let i = 0; i < 3; i++) {
      await waitForRateLimitWindow();
      waterfallTaskIds.push(await createTaskViaRest(waterfallProjectId, {
        Name: `E2E Bulk WF Task ${i} ${Date.now()}`,
        StatusId: initialTaskStatus.Id,
        StartDate: '2026-07-16',
        EndDate: '2026-07-20',
      }));
    }

    for (let i = 0; i < 2; i++) {
      await waitForRateLimitWindow();
      kanbanTaskIds.push(await createTaskViaRest(kanbanProjectId, {
        Name: `E2E Bulk KB Task ${i} ${Date.now()}`,
      }));
    }
  }, 120000);

  beforeEach(async () => {
    await waitForRateLimitWindow();
  });

  afterAll(async () => {
    if (waterfallTaskIds.length) {
      await deleteTasksViaRest(waterfallProjectId, waterfallTaskIds);
      await waitForRateLimitWindow();
    }
    if (kanbanTaskIds.length) {
      await deleteTasksViaRest(kanbanProjectId, kanbanTaskIds);
      await waitForRateLimitWindow();
    }
    if (serviceId && activityIds.length) {
      await fetchJson('DELETE', `services/${serviceId}/activities`, { Ids: activityIds.join(',') }).catch(() => undefined);
      await waitForRateLimitWindow();
    }
    const projectIds = [waterfallProjectId, kanbanProjectId].filter((id): id is number => Boolean(id));
    await deleteProjectsViaRest(projectIds);
    if (serviceId) {
      await waitForRateLimitWindow();
      await fetchJson('DELETE', 'services', { ServiceIds: `${serviceId}` }).catch(() => undefined);
    }
  }, 180000);

  it('publishes both bulk tools with the 100-ID cap', async () => {
    const result = await listTools();
    const taskTool = result.result.tools.find((tool: any) => tool.name === 'bulk_update_task_status');
    const activityTool = result.result.tools.find((tool: any) => tool.name === 'bulk_update_activity_status');

    expect(taskTool).toBeDefined();
    expect(activityTool).toBeDefined();
    expect(taskTool.inputSchema.properties.taskIds.maxItems).toBe(100);
    expect(activityTool.inputSchema.properties.activityIds.maxItems).toBe(100);
  });

  it('rejects a call without statusId or statusName', async () => {
    const result = await callTool('bulk_update_task_status', {
      projectId: waterfallProjectId,
      taskIds: waterfallTaskIds,
    });
    expect(result.result.isError).toBe(true);
    expect(result.result.content[0].text).toContain('statusId or statusName');
  });

  it('updates the status of many waterfall tasks in one call', async () => {
    const result = await callTool('bulk_update_task_status', {
      projectId: waterfallProjectId,
      taskIds: waterfallTaskIds,
      statusId: targetTaskStatus.Id,
      projectMethodTypeId: 1,
    });

    const summary = parseSummary(result);
    expect(summary).toEqual({ requested: 3, succeeded: 3, failed: [] });

    for (const taskId of waterfallTaskIds) {
      await waitForRateLimitWindow();
      const task = await fetchJson('GET', `projects/${waterfallProjectId}/tasks/${taskId}`) as TaskReadback;
      expect(task.Status?.Id).toBe(targetTaskStatus.Id);
    }
  }, 60000);

  it('updates Kanban tasks resolving statusId as the Kanban column ID', async () => {
    const columns = await fetchJson('GET', `projects/${kanbanProjectId}/GetKanbanTaskStatus`) as StatusItem[];
    expect(columns.length).toBeGreaterThan(1);

    await waitForRateLimitWindow();
    const currentTask = await fetchJson('GET', `projects/${kanbanProjectId}/tasks/${kanbanTaskIds[0]}`) as TaskReadback;
    const targetColumn = columns.find(column => column.Name !== currentTask.Status?.Name);
    if (!targetColumn?.KanbanId) throw new Error('No alternative Kanban column found');

    await waitForRateLimitWindow();
    const result = await callTool('bulk_update_task_status', {
      projectId: kanbanProjectId,
      taskIds: kanbanTaskIds,
      statusId: targetColumn.KanbanId,
      projectMethodTypeId: 2,
    });

    const summary = parseSummary(result);
    expect(summary).toEqual({ requested: 2, succeeded: 2, failed: [] });

    for (const taskId of kanbanTaskIds) {
      await waitForRateLimitWindow();
      const task = await fetchJson('GET', `projects/${kanbanProjectId}/tasks/${taskId}`) as TaskReadback;
      expect(task.Status?.Name).toBe(targetColumn.Name);
    }
  }, 60000);

  it('rolls back the whole chunk when a task ID does not exist', async () => {
    const result = await callTool('bulk_update_task_status', {
      projectId: waterfallProjectId,
      taskIds: [waterfallTaskIds[0], 999999999],
      statusId: initialTaskStatus.Id,
      projectMethodTypeId: 1,
    });

    const failedText = result.result?.isError
      ? result.result.content[0].text
      : JSON.stringify(result.error ?? result.result);
    expect(result.result?.isError ?? Boolean(result.error)).toBe(true);
    expect(failedText).toBeTruthy();

    await waitForRateLimitWindow();
    const task = await fetchJson('GET', `projects/${waterfallProjectId}/tasks/${waterfallTaskIds[0]}`) as TaskReadback;
    expect(task.Status?.Id).toBe(targetTaskStatus.Id);
  }, 60000);

  it('updates the status of service activities in one call', async () => {
    const serviceTypes = await fetchJson('GET', 'getprojecttypes?IsService=true') as StatusItem[];
    if (!serviceTypes.length) throw new Error('No service types available');

    await waitForRateLimitWindow();
    serviceId = ((await fetchJson('POST', 'services', {
      Name: `E2E Bulk Status Service ${Date.now()}`,
      TypeId: serviceTypes[0].Id,
    })) as { Id: number }).Id;

    await waitForRateLimitWindow();
    const activityStatuses = await fetchJson('GET', 'gettaskstatuses?IsService=true') as StatusItem[];
    if (activityStatuses.length < 2) throw new Error('Need at least two activity statuses');
    initialActivityStatus = activityStatuses[0];
    targetActivityStatus = activityStatuses[1];

    for (let i = 0; i < 2; i++) {
      await waitForRateLimitWindow();
      const created = await fetchJson('POST', `services/${serviceId}/activities`, {
        Name: `E2E Bulk Activity ${i} ${Date.now()}`,
        StatusId: initialActivityStatus.Id,
        StartDate: '2026-07-16',
        EndDate: '2026-07-20',
      }) as { Id: number };
      activityIds.push(created.Id);
    }

    await waitForRateLimitWindow();
    const result = await callTool('bulk_update_activity_status', {
      serviceId,
      activityIds,
      statusName: targetActivityStatus.Name,
      projectMethodTypeId: 1,
    });

    const summary = parseSummary(result);
    expect(summary).toEqual({ requested: 2, succeeded: 2, failed: [] });

    for (const activityId of activityIds) {
      await waitForRateLimitWindow();
      const activity = await fetchJson('GET', `services/${serviceId}/activities/${activityId}`) as TaskReadback;
      expect(activity.Status?.Id).toBe(targetActivityStatus.Id);
    }
  }, 120000);
});
