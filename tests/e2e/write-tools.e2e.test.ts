import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  setupE2E,
  callTool,
  createProjectViaRest,
  deleteIssueViaRest,
  deleteProjectViaRest,
  deleteRiskViaRest,
  deleteTasksViaRest,
  fetchJson,
  getReferenceItems,
  querySqlNumber,
} from './setup.js';

describe('write tools', () => {
  setupE2E();

  let testProjectId: number;
  let createdTaskId: number | undefined;
  let createdRiskId: number | undefined;
  let createdIssueId: number | undefined;

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
    testProjectId = await createProjectViaRest(`E2E Write Test ${Date.now()}`);

    const [projectStatuses, riskTypes, riskStatuses, riskImpacts, riskProbs, issueTypes, issueStatuses] = await Promise.all([
      getReferenceItems('projectstatuses'),
      getReferenceItems('risktypes'),
      getReferenceItems('riskstatuses'),
      getReferenceItems('riskimpacts'),
      getReferenceItems('riskprobabilities'),
      getReferenceItems('issuetypes'),
      getReferenceItems('issuestatuses'),
    ]);
    const currentStatusId = querySqlNumber(`SELECT intProjectStatuesId FROM dbo.tblProject WHERE intProjectId = ${testProjectId};`);
    projectTargetStatusId = projectStatuses.find(status => status.Id !== currentStatusId)?.Id;
    riskTypeId = riskTypes[0]?.Id;
    riskStatusId = riskStatuses[0]?.Id;
    riskImpactId = riskImpacts[0]?.Id;
    riskProbabilityId = riskProbs[0]?.Id;
    riskLevelId = querySqlNumber('SELECT TOP 1 intRiskLevalBaseId FROM dbo.tblRiskLeval WHERE intAccountId = 18137 ORDER BY intRiskLevalBaseId;');
    issueTypeId = issueTypes[0]?.Id;
    issueStatusId = issueStatuses[0]?.Id;
  }, 30000);

  afterAll(async () => {
    if (createdRiskId) await deleteRiskViaRest(testProjectId, createdRiskId);
    if (createdIssueId) await deleteIssueViaRest(testProjectId, createdIssueId);
    if (createdTaskId) await deleteTasksViaRest(testProjectId, [createdTaskId]);
    if (testProjectId) await deleteProjectViaRest(testProjectId);
  }, 30000);

  it('create_task creates a task and returns confirmed state', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const nextMonth = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    const result = await callTool('create_task', {
      projectId: testProjectId,
      Name: `E2E Task ${Date.now()}`,
      Description: 'Created by E2E test',
      StartDate: today,
      EndDate: nextMonth,
    });
    const data = parseToolSuccess(result);
    expect(data).toHaveProperty('Id');
    expect(data.Details).toBe('Created by E2E test');
    createdTaskId = data.Id ?? data.id ?? data.TaskId;
  });

  it('update_task updates the created task', async () => {
    expect(createdTaskId).toBeDefined();
    const result = await callTool('update_task', {
      projectId: testProjectId,
      taskId: createdTaskId,
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
      projectId: testProjectId,
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
      projectId: testProjectId,
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
      projectId: testProjectId,
      StatusId: projectTargetStatusId,
      Description: `Updated by E2E at ${new Date().toISOString()}`,
    });
    const data = parseToolSuccess(result);
    expect(data.Status.Id).toBe(projectTargetStatusId);

    const sqlStatusId = querySqlNumber(`SELECT intProjectStatuesId FROM dbo.tblProject WHERE intProjectId = ${testProjectId};`);
    expect(sqlStatusId).toBe(projectTargetStatusId);

    const sourceProject = await fetchJson('GET', `projects/${testProjectId}`) as { Status: { Id: number } };
    expect(sourceProject.Status.Id).toBe(projectTargetStatusId);
  });
});
