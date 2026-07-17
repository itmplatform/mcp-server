import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import {
  setupE2E,
  callTool,
  createProjectViaRest,
  deleteActivitiesViaRest,
  deleteIssueViaRest,
  deleteProjectsViaRest,
  deleteRiskViaRest,
  deleteServicesViaRest,
  deleteTasksViaRest,
  fetchJson,
  getReferenceItems,
} from './setup.js';

describe('P1 core CRUD tools', () => {
  setupE2E();
  const waitForRateLimitWindow = () => new Promise(resolve => setTimeout(resolve, 1100));

  let projectId: number;
  let taskId: number | undefined;
  let riskId: number | undefined;
  let issueId: number | undefined;
  let serviceId: number | undefined;
  let activityId: number | undefined;

  let taskStatusId: number | undefined;
  let riskRefs: Record<string, number | undefined> = {};
  let issueTypeId: number | undefined;
  let issueStatusId: number | undefined;
  let serviceTypeId: number | undefined;
  let activityStatusIds: number[] = [];
  let projectStatusIds: number[] = [];

  function parseWriteSuccess(result: any) {
    expect(result.error).toBeUndefined();
    expect(result.result).toBeDefined();
    expect(result.result.isError).toBeFalsy();
    expect(result.result.content).toHaveLength(2);
    expect(result.result.content[1].text).toContain('5-60 seconds');
    return JSON.parse(result.result.content[0].text);
  }

  function parseReadSuccess(result: any) {
    expect(result.error).toBeUndefined();
    expect(result.result).toBeDefined();
    expect(result.result.isError).toBeFalsy();
    return JSON.parse(result.result.content[0].text);
  }

  beforeAll(async () => {
    const projectTypeId = (await getReferenceItems('getprojecttypes'))[0]?.Id;
    if (!projectTypeId) throw new Error('No project types available');
    await waitForRateLimitWindow();
    projectId = await createProjectViaRest(`E2E P1 CRUD ${Date.now()}`, undefined, 1, projectTypeId);

    const referenceEntities = [
      'gettaskstatuses', 'risktypes', 'riskstatuses', 'riskimpacts', 'riskprobabilities',
      'risklevels', 'issuetypes', 'issuestatuses', 'getprojecttypes?IsService=true',
      'gettaskstatuses?IsService=true', 'projectstatuses',
    ];
    const references = [];
    for (const entity of referenceEntities) {
      await waitForRateLimitWindow();
      references.push(await getReferenceItems(entity));
    }
    const [taskStatuses, riskTypes, riskStatuses, riskImpacts, riskProbs, riskLevels,
      issueTypes, issueStatuses, serviceTypes, activityStatuses, projectStatuses] = references;
    taskStatusId = taskStatuses[0]?.Id;
    riskRefs = {
      TypeId: riskTypes[0]?.Id,
      StatusId: riskStatuses[0]?.Id,
      ImpactId: riskImpacts[0]?.Id,
      ProbabilityId: riskProbs[0]?.Id,
      LevelId: riskLevels[0]?.Id,
    };
    issueTypeId = issueTypes[0]?.Id;
    issueStatusId = issueStatuses[0]?.Id;
    serviceTypeId = serviceTypes[0]?.Id;
    activityStatusIds = activityStatuses.map(status => status.Id);
    projectStatusIds = projectStatuses.map(status => status.Id);

    await waitForRateLimitWindow();
    const task = await fetchJson('POST', `projects/${projectId}/tasks`, {
      Name: `E2E P1 Task ${Date.now()}`,
      StatusId: taskStatusId,
      StartDate: new Date().toISOString().slice(0, 10),
      EndDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    }) as { Id: number };
    taskId = task.Id;
  }, 120000);

  beforeEach(async () => {
    await waitForRateLimitWindow();
  });

  afterAll(async () => {
    if (riskId) await deleteRiskViaRest(projectId, riskId);
    await waitForRateLimitWindow();
    if (issueId) await deleteIssueViaRest(projectId, issueId);
    await waitForRateLimitWindow();
    if (taskId) await deleteTasksViaRest(projectId, [taskId]);
    await waitForRateLimitWindow();
    if (serviceId && activityId) await deleteActivitiesViaRest(serviceId, [activityId]);
    await waitForRateLimitWindow();
    if (serviceId) await deleteServicesViaRest([serviceId]);
    await waitForRateLimitWindow();
    await deleteProjectsViaRest([projectId].filter(Boolean));
  }, 180000);

  it('get_task returns the single task detail from v2 REST', async () => {
    expect(taskId).toBeDefined();
    const task = parseReadSuccess(await callTool('get_task', { projectId, taskId }));
    expect(task.Id).toBe(taskId);
    expect(task.Name).toContain('E2E P1 Task');
    expect(task).toHaveProperty('StartDate');
    expect(task).toHaveProperty('Status');
  });

  it('search_tasks returns a page of tasks with project context', async () => {
    const page = parseReadSuccess(await callTool('search_tasks', { limit: 5 }));
    expect(Array.isArray(page.items)).toBe(true);
    expect(page.total).toBeGreaterThanOrEqual(0);
    expect(page).toHaveProperty('hasMore');
    if (page.items.length > 0) {
      expect(page.items[0]).toHaveProperty('projectId');
      expect(page.items[0]).toHaveProperty('projectName');
      expect(page.items[0]).toHaveProperty('task');
    }
  });

  it('create_risk then get_risk round-trips including plans', async () => {
    for (const [field, value] of Object.entries(riskRefs)) {
      expect(value, `${field} reference id`).toBeDefined();
    }
    const created = parseWriteSuccess(await callTool('create_risk', {
      projectId,
      Name: `E2E P1 Risk ${Date.now()}`,
      ...riskRefs,
      MitigationPlan: 'Initial mitigation',
    }));
    riskId = created.Id;

    const risk = parseReadSuccess(await callTool('get_risk', { projectId, riskId }));
    expect(risk.Id).toBe(riskId);
    expect(risk.MitigationPlan).toBe('Initial mitigation');
  });

  it('update_risk changes plans and verifies the readback', async () => {
    expect(riskId).toBeDefined();
    const updated = parseWriteSuccess(await callTool('update_risk', {
      projectId,
      riskId,
      MitigationPlan: 'Updated mitigation',
      ContingencyPlan: 'Updated contingency',
    }));
    expect(updated.MitigationPlan).toBe('Updated mitigation');
    expect(updated.ContigencyPlan).toBe('Updated contingency');
  });

  it('create_issue then get_issue then update_issue round-trips', async () => {
    expect(issueTypeId).toBeDefined();
    expect(issueStatusId).toBeDefined();
    const created = parseWriteSuccess(await callTool('create_issue', {
      projectId,
      Name: `E2E P1 Issue ${Date.now()}`,
      TypeId: issueTypeId,
      StatusId: issueStatusId,
    }));
    issueId = created.Id;

    await waitForRateLimitWindow();
    const issue = parseReadSuccess(await callTool('get_issue', { projectId, issueId }));
    expect(issue.Id).toBe(issueId);
    expect(issue).toHaveProperty('Type');
    expect(issue).toHaveProperty('Status');

    await waitForRateLimitWindow();
    const updated = parseWriteSuccess(await callTool('update_issue', {
      projectId,
      issueId,
      Resolution: 'Resolved by E2E',
    }));
    expect(updated.FinalResolution).toBe('Resolved by E2E');
  });

  it('create_service creates a service with the account default status', async () => {
    expect(serviceTypeId).toBeDefined();
    const created = parseWriteSuccess(await callTool('create_service', {
      Name: `E2E P1 Service ${Date.now()}`,
      TypeId: serviceTypeId,
    }));
    serviceId = created.Id;
    expect(created.Name).toContain('E2E P1 Service');
    expect(created).toHaveProperty('Status');
  });

  it('create_service rejects StatusId with a pointer to update_service', async () => {
    const result = await callTool('create_service', {
      Name: `E2E P1 Service Rejected ${Date.now()}`,
      TypeId: serviceTypeId,
      StatusId: projectStatusIds[0],
    });
    expect(result.error ?? result.result.isError).toBeTruthy();
    const text = result.result?.content?.[0]?.text ?? JSON.stringify(result.error);
    expect(text).toContain('update_service');
  });

  it('update_service renames the service and verifies the readback', async () => {
    expect(serviceId).toBeDefined();
    const newName = `E2E P1 Service Renamed ${Date.now()}`;
    const updated = parseWriteSuccess(await callTool('update_service', {
      serviceId,
      Name: newName,
    }));
    expect(updated.Name).toBe(newName);
  });

  it('create_activity adds an activity to the service', async () => {
    expect(serviceId).toBeDefined();
    expect(activityStatusIds.length).toBeGreaterThan(0);
    const created = parseWriteSuccess(await callTool('create_activity', {
      serviceId,
      Name: `E2E P1 Activity ${Date.now()}`,
      StatusId: activityStatusIds[0],
      StartDate: new Date().toISOString().slice(0, 10),
      EndDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    }));
    activityId = created.Id;
    expect(created.Name).toContain('E2E P1 Activity');
  });

  it('update_activity changes the activity status and verifies the readback', async () => {
    expect(serviceId).toBeDefined();
    expect(activityId).toBeDefined();
    const targetStatusId = activityStatusIds[1] ?? activityStatusIds[0];
    const updated = parseWriteSuccess(await callTool('update_activity', {
      serviceId,
      activityId,
      StatusId: targetStatusId,
      Description: 'Updated by E2E',
    }));
    expect(updated.Details ?? updated.Description).toBe('Updated by E2E');
  });

  it('create_activity rejects hierarchy fields', async () => {
    const result = await callTool('create_activity', {
      serviceId,
      Name: 'Should fail',
      StatusId: activityStatusIds[0],
      StartDate: '2026-01-01',
      EndDate: '2026-02-01',
      KindId: 1,
    });
    const text = result.result?.content?.[0]?.text ?? JSON.stringify(result.error ?? result.result);
    expect(text).toContain('KindId');
  });
});
