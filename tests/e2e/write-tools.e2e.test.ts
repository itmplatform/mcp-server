import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import {
  setupE2E,
  callTool,
  createProjectViaRest,
  deleteIssueViaRest,
  deleteProjectsViaRest,
  deleteRiskViaRest,
  deleteTasksViaRest,
  fetchJson,
  getReferenceItems,
  listTools,
  querySqlNumber,
} from './setup.js';

describe('write tools', () => {
  setupE2E();
  const waitForRateLimitWindow = () => new Promise(resolve => setTimeout(resolve, 1100));

  let waterfallProjectId: number;
  let kanbanProjectId: number;
  let createdWaterfallTaskId: number | undefined;
  let createdKanbanTaskId: number | undefined;
  let createdRiskId: number | undefined;
  let createdIssueId: number | undefined;

  let taskStatusId: number | undefined;
  let taskTypeId: number | undefined;
  let taskPriorityId: number | undefined;
  let riskTypeId: number | undefined;
  let riskStatusId: number | undefined;
  let riskImpactId: number | undefined;
  let riskProbabilityId: number | undefined;
  let riskLevelId: number | undefined;
  let issueTypeId: number | undefined;
  let issueStatusId: number | undefined;
  let projectTargetStatusId: number | undefined;

  function parseToolSuccess(result: any) {
    expect(result.error).toBeUndefined();
    expect(result.result).toBeDefined();
    expect(result.result.isError).toBeFalsy();
    expect(result.result.content).toHaveLength(2);
    expect(result.result.content[1].text).toContain('5-60 seconds');
    return JSON.parse(result.result.content[0].text);
  }

  beforeAll(async () => {
    const projectTypeId = (await getReferenceItems('getprojecttypes'))[0]?.Id;
    if (!projectTypeId) throw new Error('No project types available');
    await waitForRateLimitWindow();
    waterfallProjectId = await createProjectViaRest(`E2E Waterfall Write Test ${Date.now()}`, undefined, 1, projectTypeId);
    await waitForRateLimitWindow();
    kanbanProjectId = await createProjectViaRest(`E2E Kanban Write Test ${Date.now()}`, undefined, 2, projectTypeId);

    // Keep fixture setup below the deployed API's four-requests-per-second limit.
    const referenceEntities = [
      'projectstatuses',
      'gettaskstatuses',
      'gettasktypes',
      'gettaskpriorities',
      'risktypes',
      'riskstatuses',
      'riskimpacts',
      'riskprobabilities',
      'issuetypes',
      'issuestatuses',
    ];
    const references = [];
    for (const entity of referenceEntities) {
      await waitForRateLimitWindow();
      references.push(await getReferenceItems(entity));
    }
    const [projectStatuses, taskStatuses, taskTypes, taskPriorities, riskTypes, riskStatuses, riskImpacts, riskProbs, issueTypes, issueStatuses] = references;
    await waitForRateLimitWindow();
    const sourceProject = await fetchJson('GET', `projects/${waterfallProjectId}`) as { Status: { Id: number } };
    const currentStatusId = sourceProject.Status.Id;
    projectTargetStatusId = projectStatuses.find(status => status.Id !== currentStatusId)?.Id;
    taskStatusId = taskStatuses[0]?.Id;
    taskTypeId = taskTypes[0]?.Id;
    taskPriorityId = taskPriorities[0]?.Id;
    riskTypeId = riskTypes[0]?.Id;
    riskStatusId = riskStatuses[0]?.Id;
    riskImpactId = riskImpacts[0]?.Id;
    riskProbabilityId = riskProbs[0]?.Id;
    riskLevelId = querySqlNumber('SELECT TOP 1 intRiskLevalBaseId FROM dbo.tblRiskLeval WHERE intAccountId = 18137 ORDER BY intRiskLevalBaseId;');
    issueTypeId = issueTypes[0]?.Id;
    issueStatusId = issueStatuses[0]?.Id;
  }, 120000);

  beforeEach(async () => {
    await waitForRateLimitWindow();
  });

  afterAll(async () => {
    if (createdRiskId) await deleteRiskViaRest(waterfallProjectId, createdRiskId);
    await waitForRateLimitWindow();
    if (createdIssueId) await deleteIssueViaRest(waterfallProjectId, createdIssueId);
    await waitForRateLimitWindow();
    if (createdWaterfallTaskId) await deleteTasksViaRest(waterfallProjectId, [createdWaterfallTaskId]);
    await waitForRateLimitWindow();
    if (createdKanbanTaskId) await deleteTasksViaRest(kanbanProjectId, [createdKanbanTaskId]);
    await waitForRateLimitWindow();
    const projectIds = [waterfallProjectId, kanbanProjectId].filter((id): id is number => Boolean(id));
    await deleteProjectsViaRest(projectIds);
  }, 180000);

  it('publishes issue type and status as required MCP inputs', async () => {
    const result = await listTools();
    const issueTool = result.result.tools.find((tool: any) => tool.name === 'create_issue');

    expect(issueTool.inputSchema.required).toContain('TypeId');
    expect(issueTool.inputSchema.required).toContain('StatusId');
  });

  it('create_task rejects missing Waterfall fields before POST', async () => {
    const result = await callTool('create_task', {
      projectId: waterfallProjectId,
      Name: `Incomplete E2E Task ${Date.now()}`,
    });

    expect(result.error).toBeUndefined();
    expect(result.result.isError).toBe(true);
    expect(result.result.content[0].text).toContain('StatusId');
    expect(result.result.content[0].text).toContain('StartDate');
    expect(result.result.content[0].text).toContain('EndDate');
  });

  it('create_task creates a Waterfall task and returns confirmed state', async () => {
    expect(taskStatusId).toBeDefined();
    expect(taskTypeId).toBeDefined();
    expect(taskPriorityId).toBeDefined();
    const today = new Date().toISOString().slice(0, 10);
    const nextMonth = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    const result = await callTool('create_task', {
      projectId: waterfallProjectId,
      Name: `E2E Task ${Date.now()}`,
      Description: 'Created by E2E test',
      StatusId: taskStatusId,
      TypeId: taskTypeId,
      PriorityId: taskPriorityId,
      StartDate: today,
      EndDate: nextMonth,
    });
    const data = parseToolSuccess(result);
    expect(data).toHaveProperty('Id');
    expect(data.Details).toBe('Created by E2E test');
    createdWaterfallTaskId = data.Id ?? data.id ?? data.TaskId;
  });

  it('create_task keeps Kanban dates and status optional', async () => {
    const result = await callTool('create_task', {
      projectId: kanbanProjectId,
      Name: `E2E Kanban Task ${Date.now()}`,
      Description: 'Created without Waterfall-only fields',
    });
    const data = parseToolSuccess(result);

    createdKanbanTaskId = data.Id ?? data.id ?? data.TaskId;
    expect(data.Details).toBe('Created without Waterfall-only fields');
  });

  it('returns downstream task validation details instead of a generic 400', async () => {
    expect(taskStatusId).toBeDefined();
    expect(taskTypeId).toBeDefined();
    expect(taskPriorityId).toBeDefined();
    const result = await callTool('create_task', {
      projectId: waterfallProjectId,
      Name: `Invalid Date E2E Task ${Date.now()}`,
      StatusId: taskStatusId,
      TypeId: taskTypeId,
      PriorityId: taskPriorityId,
      StartDate: '2026-07-20',
      EndDate: '2026-07-19',
    });

    expect(JSON.stringify(result)).toContain('Task start date should be less than or equal to task end date');
  });

  it('update_task updates the created task', async () => {
    expect(createdWaterfallTaskId).toBeDefined();
    const result = await callTool('update_task', {
      projectId: waterfallProjectId,
      taskId: createdWaterfallTaskId,
      Description: 'Updated by E2E test',
    });
    const data = parseToolSuccess(result);
    expect(data.Details).toBe('Updated by E2E test');
  });

  it('create_risk creates a risk in the test project using normalized reference IDs', async () => {
    expect(riskTypeId).toBeDefined();
    expect(riskStatusId).toBeDefined();
    expect(riskImpactId).toBeDefined();
    expect(riskProbabilityId).toBeDefined();
    expect(riskLevelId).toBeDefined();
    const result = await callTool('create_risk', {
      projectId: waterfallProjectId,
      Name: `E2E Risk ${Date.now()}`,
      TypeId: riskTypeId,
      StatusId: riskStatusId,
      ImpactId: riskImpactId,
      ProbabilityId: riskProbabilityId,
      LevelId: riskLevelId,
      MitigationPlan: 'E2E mitigation plan',
    });
    const data = parseToolSuccess(result);
    createdRiskId = data.Id ?? data.id;
    expect(data.MitigationPlan).toBe('E2E mitigation plan');
    expect(data.Level.BaseId).toBe(riskLevelId);
  });

  it('create_issue creates an issue in the test project using issue aliases', async () => {
    expect(issueTypeId).toBeDefined();
    expect(issueStatusId).toBeDefined();
    const result = await callTool('create_issue', {
      projectId: waterfallProjectId,
      Name: `E2E Issue ${Date.now()}`,
      TypeId: issueTypeId,
      StatusId: issueStatusId,
      Resolution: 'E2E final resolution',
    });
    const data = parseToolSuccess(result);
    createdIssueId = data.Id ?? data.id;
    expect(data.FinalResolution).toBe('E2E final resolution');
  });

  it('update_project updates project fields and status through the MCP StatusId alias', async () => {
    expect(projectTargetStatusId).toBeDefined();
    const result = await callTool('update_project', {
      projectId: waterfallProjectId,
      StatusId: projectTargetStatusId,
      Description: `Updated by E2E at ${new Date().toISOString()}`,
    });
    const data = parseToolSuccess(result);
    expect(data.Status.Id).toBe(projectTargetStatusId);

    const sqlStatusId = querySqlNumber(`SELECT intProjectStatuesId FROM dbo.tblProject WHERE intProjectId = ${waterfallProjectId};`);
    expect(sqlStatusId).toBe(projectTargetStatusId);

    const sourceProject = await fetchJson('GET', `projects/${waterfallProjectId}`) as { Status: { Id: number } };
    expect(sourceProject.Status.Id).toBe(projectTargetStatusId);
  });
});
