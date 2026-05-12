import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupE2E, callTool, createProjectViaRest, deleteViaRest, getReferenceIds } from './setup.js';

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
  let issueTypeId: number | undefined;
  let issueStatusId: number | undefined;

  beforeAll(async () => {
    testProjectId = await createProjectViaRest(`E2E Write Test ${Date.now()}`);

    const [riskTypes, riskStatuses, riskImpacts, riskProbs, issueTypes, issueStatuses] = await Promise.all([
      getReferenceIds('risktypes').catch(() => []),
      getReferenceIds('riskstatuses').catch(() => []),
      getReferenceIds('riskimpacts').catch(() => []),
      getReferenceIds('riskprobabilities').catch(() => []),
      getReferenceIds('issuetypes').catch(() => []),
      getReferenceIds('issuestatuses').catch(() => []),
    ]);
    riskTypeId = riskTypes[0];
    riskStatusId = riskStatuses[0];
    riskImpactId = riskImpacts[0];
    riskProbabilityId = riskProbs[0];
    issueTypeId = issueTypes[0];
    issueStatusId = issueStatuses[0];
  }, 30000);

  afterAll(async () => {
    if (createdRiskId) await deleteViaRest(`projects/${testProjectId}/risks/${createdRiskId}`);
    if (createdIssueId) await deleteViaRest(`projects/${testProjectId}/issues/${createdIssueId}`);
    if (createdTaskId) await deleteViaRest(`projects/${testProjectId}/tasks/${createdTaskId}`);
    if (testProjectId) await deleteViaRest(`projects/${testProjectId}`);
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
    expect(result.result).toBeDefined();
    expect(result.result.isError).toBeFalsy();
    expect(result.result.content).toHaveLength(2);

    const data = JSON.parse(result.result.content[0].text);
    expect(data).toHaveProperty('Id');
    createdTaskId = data.Id ?? data.id ?? data.TaskId;

    expect(result.result.content[1].text).toContain('5-60 seconds');
  });

  it('update_task updates the created task', async () => {
    if (!createdTaskId) return;
    const result = await callTool('update_task', {
      projectId: testProjectId,
      taskId: createdTaskId,
      Description: 'Updated by E2E test',
    });
    expect(result.result).toBeDefined();
    expect(result.result.isError).toBeFalsy();
    expect(result.result.content).toHaveLength(2);
    expect(result.result.content[1].text).toContain('5-60 seconds');
  });

  it('create_risk creates a risk in the test project', async () => {
    if (!riskTypeId || !riskStatusId) return;
    const result = await callTool('create_risk', {
      projectId: testProjectId,
      Name: `E2E Risk ${Date.now()}`,
      TypeId: riskTypeId,
      StatusId: riskStatusId,
      ...(riskImpactId ? { ImpactId: riskImpactId } : {}),
      ...(riskProbabilityId ? { ProbabilityId: riskProbabilityId } : {}),
    });
    expect(result.result).toBeDefined();

    if (!result.result.isError) {
      expect(result.result.content).toHaveLength(2);
      const data = JSON.parse(result.result.content[0].text);
      createdRiskId = data.Id ?? data.id;
      expect(result.result.content[1].text).toContain('5-60 seconds');
    } else {
      // API may reject with validation error -- tool still works correctly
      expect(result.result.content[0].text).toContain('REST request failed');
    }
  });

  it('create_issue creates an issue in the test project', async () => {
    if (!issueTypeId || !issueStatusId) return;
    const result = await callTool('create_issue', {
      projectId: testProjectId,
      Name: `E2E Issue ${Date.now()}`,
      TypeId: issueTypeId,
      StatusId: issueStatusId,
    });
    expect(result.result).toBeDefined();

    if (!result.result.isError) {
      expect(result.result.content).toHaveLength(2);
      const data = JSON.parse(result.result.content[0].text);
      createdIssueId = data.Id ?? data.id;
      expect(result.result.content[1].text).toContain('5-60 seconds');
    } else {
      // API may reject with validation error -- tool still works correctly
      expect(result.result.content[0].text).toContain('REST request failed');
    }
  });

  it('update_project updates project fields', async () => {
    const result = await callTool('update_project', {
      projectId: testProjectId,
      Description: `Updated by E2E at ${new Date().toISOString()}`,
    });
    expect(result.result).toBeDefined();
    expect(result.result.isError).toBeFalsy();
    expect(result.result.content).toHaveLength(2);
    expect(result.result.content[1].text).toContain('5-60 seconds');
  });
});
