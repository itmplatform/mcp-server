import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createLocalRestClient,
  createProjectViaRest,
  deleteIssueViaRest,
  deleteProjectViaRest,
  deleteRiskViaRest,
  deleteTasksViaRest,
  getReferenceBaseIds,
  getReferenceIds,
  querySqlNumber,
  querySqlScalar,
} from '../helpers/local-api.js';

describe('v2 REST write contracts used by MCP write tools', () => {
  const rest = createLocalRestClient();
  let projectId: number;
  const taskIds: number[] = [];
  const riskIds: number[] = [];
  const issueIds: number[] = [];

  beforeAll(async () => {
    projectId = await createProjectViaRest(`MCP Contract Integration ${Date.now()}`, rest);
  });

  afterAll(async () => {
    for (const riskId of riskIds) await deleteRiskViaRest(projectId, riskId);
    for (const issueId of issueIds) await deleteIssueViaRest(projectId, issueId);
    await deleteTasksViaRest(projectId, taskIds);
    if (projectId) await deleteProjectViaRest(projectId);
  });

  it('documents project StatusId being ignored and ProjectStatusId being persisted', async () => {
    const statuses = await getReferenceIds('projectstatuses', rest);
    expect(statuses.length).toBeGreaterThanOrEqual(2);

    const initialStatus = querySqlNumber(`SELECT intProjectStatuesId FROM dbo.tblProject WHERE intProjectId = ${projectId};`);
    const targetStatus = statuses.find(id => id !== initialStatus) ?? statuses[0];
    expect(targetStatus).not.toBe(initialStatus);

    await rest.patch(`projects/${projectId}`, { StatusId: targetStatus });
    const afterStatusIdPayload = querySqlNumber(`SELECT intProjectStatuesId FROM dbo.tblProject WHERE intProjectId = ${projectId};`);
    expect(afterStatusIdPayload).toBe(initialStatus);

    await rest.patch(`projects/${projectId}`, { ProjectStatusId: targetStatus });
    const afterProjectStatusIdPayload = querySqlNumber(`SELECT intProjectStatuesId FROM dbo.tblProject WHERE intProjectId = ${projectId};`);
    expect(afterProjectStatusIdPayload).toBe(targetStatus);
  });

  it('persists task Details, not Description, plus task reference fields', async () => {
    const [statusId] = await getReferenceIds('gettaskstatuses', rest);
    const [typeId] = await getReferenceIds('gettasktypes', rest);
    const [priorityId] = await getReferenceIds('gettaskpriorities', rest);
    const response = await rest.post(`projects/${projectId}/tasks`, {
      Name: `Integration Task ${Date.now()}`,
      Details: 'task details persisted by integration test',
      StatusId: statusId,
      TypeId: typeId,
      PriorityId: priorityId,
      StartDate: '2026-10-01',
      EndDate: '2026-10-03',
    }) as { Id: number };
    taskIds.push(response.Id);

    expect(querySqlScalar(`SELECT CAST(ntextDetail AS nvarchar(max)) FROM dbo.tblTask WHERE intTaskId = ${response.Id};`))
      .toBe('task details persisted by integration test');
    expect(querySqlNumber(`SELECT intTaskStatusId FROM dbo.tblTask WHERE intTaskId = ${response.Id};`)).toBe(statusId);
    expect(querySqlNumber(`SELECT intTaskTypeId FROM dbo.tblTask WHERE intTaskId = ${response.Id};`)).toBe(typeId);
    expect(querySqlNumber(`SELECT intTaskPriorityId FROM dbo.tblTask WHERE intTaskId = ${response.Id};`)).toBe(priorityId);
  });

  it('persists risk BaseId fields required by v2 REST', async () => {
    const [typeId] = await getReferenceBaseIds('risktypes', rest);
    const [statusId] = await getReferenceBaseIds('riskstatuses', rest);
    const [impactId] = await getReferenceBaseIds('riskimpacts', rest);
    const [probabilityId] = await getReferenceBaseIds('riskprobabilities', rest);
    const levelId = querySqlNumber('SELECT TOP 1 intRiskLevalBaseId FROM dbo.tblRiskLeval WHERE intAccountId = 18137 ORDER BY intRiskLevalBaseId;');

    const response = await rest.post(`projects/${projectId}/risks`, {
      Name: `Integration Risk ${Date.now()}`,
      Description: 'risk description persisted',
      TypeId: typeId,
      StatusId: statusId,
      ImpactId: impactId,
      ProbabilityId: probabilityId,
      LevelId: levelId,
      MitigationPlan: 'mitigation persisted',
    }) as { Id: number };
    riskIds.push(response.Id);

    expect(querySqlNumber(`SELECT intRiskKindId FROM dbo.tblRisk WHERE intRiskId = ${response.Id};`)).toBe(typeId);
    expect(querySqlNumber(`SELECT intRiskStatusId FROM dbo.tblRisk WHERE intRiskId = ${response.Id};`)).toBe(statusId);
    expect(querySqlNumber(`SELECT intRiskImpactId FROM dbo.tblRisk WHERE intRiskId = ${response.Id};`)).toBe(impactId);
    expect(querySqlNumber(`SELECT intRiskProbabilityId FROM dbo.tblRisk WHERE intRiskId = ${response.Id};`)).toBe(probabilityId);
    expect(querySqlNumber(`SELECT intRiskLevalId FROM dbo.tblRisk WHERE intRiskId = ${response.Id};`)).toBe(levelId);
    expect(querySqlScalar(`SELECT CAST(ntextMitigationPlan AS nvarchar(max)) FROM dbo.tblRisk WHERE intRiskId = ${response.Id};`))
      .toBe('mitigation persisted');
  });

  it('persists issue Type, Status, and FinalResolution fields required by v2 REST', async () => {
    const [typeId] = await getReferenceBaseIds('issuetypes', rest);
    const [statusId] = await getReferenceBaseIds('issuestatuses', rest);

    const response = await rest.post(`projects/${projectId}/issues`, {
      Name: `Integration Issue ${Date.now()}`,
      Description: 'issue description persisted',
      Type: typeId,
      Status: statusId,
      FinalResolution: 'final resolution persisted',
    }) as { Id: number };
    issueIds.push(response.Id);

    expect(querySqlNumber(`SELECT intIssueTypeId FROM dbo.tblIssue WHERE intIssueId = ${response.Id};`)).toBe(typeId);
    expect(querySqlNumber(`SELECT intIssueStatusId FROM dbo.tblIssue WHERE intIssueId = ${response.Id};`)).toBe(statusId);
    expect(querySqlScalar(`SELECT strIssueFinalResolution FROM dbo.tblIssue WHERE intIssueId = ${response.Id};`))
      .toBe('final resolution persisted');
  });
});
