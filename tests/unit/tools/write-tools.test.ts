import { describe, it, expect } from 'vitest';
import {
  buildWriteResponse, buildInsufficientScopeResponse, STALE_AFTER_WRITE_NOTICE,
  splitCreateTaskArgs, splitUpdateTaskArgs, splitCreateRiskArgs,
  splitCreateIssueArgs, splitUpdateProjectArgs, mapReferenceIdToBaseId,
  verifyRequestedFields,
} from '../../../src/tools/write-tools.js';

describe('buildInsufficientScopeResponse', () => {
  it('returns isError true with insufficient_scope message', () => {
    const response = buildInsufficientScopeResponse();
    expect(response.isError).toBe(true);
    expect(response.content).toHaveLength(1);
    expect(response.content[0].text).toContain('insufficient_scope');
    expect(response.content[0].text).toContain('mcp:write');
  });
});

describe('buildWriteResponse', () => {
  it('returns two content items (JSON data + stale notice)', () => {
    const response = buildWriteResponse({ Id: 42, Name: 'Test' });
    expect(response.content).toHaveLength(2);
    expect(response.content[0].type).toBe('text');
    expect(response.content[1].type).toBe('text');
  });

  it('first item is valid JSON of the data', () => {
    const data = { Id: 42, Name: 'Test' };
    const response = buildWriteResponse(data);
    expect(JSON.parse(response.content[0].text)).toEqual(data);
  });

  it('second item contains stale-after-write warning', () => {
    const response = buildWriteResponse({ Id: 1 });
    expect(response.content[1].text).toContain('DataMart');
    expect(response.content[1].text).toContain('5-60 seconds');
    expect(response.content[1].text).toBe(STALE_AFTER_WRITE_NOTICE);
  });
});

describe('splitCreateTaskArgs', () => {
  it('builds path and maps Description to Details', () => {
    const { path, body } = splitCreateTaskArgs({ projectId: 100, Name: 'New Task', Description: 'Desc' });
    expect(path).toBe('projects/100/tasks');
    expect(body).toEqual({ Name: 'New Task', Details: 'Desc' });
    expect(body).not.toHaveProperty('projectId');
  });

  it('rejects conflicting Description and Details values', () => {
    expect(() => splitCreateTaskArgs({
      projectId: 100,
      Name: 'New Task',
      Description: 'Desc A',
      Details: 'Desc B',
    })).toThrow('Description and Details cannot both be supplied');
  });

  it('rejects fields known to be ignored by task create', () => {
    expect(() => splitCreateTaskArgs({
      projectId: 100,
      Name: 'New Task',
      AssignedToUserId: 123,
    })).toThrow('AssignedToUserId is not supported');
  });
});

describe('splitUpdateTaskArgs', () => {
  it('builds path with taskId, separates IDs, and maps Description to Details', () => {
    const { path, body } = splitUpdateTaskArgs({ projectId: 100, taskId: 42, Name: 'Updated', Description: 'New details' });
    expect(path).toBe('projects/100/tasks/42');
    expect(body).toEqual({ Name: 'Updated', Details: 'New details' });
    expect(body).not.toHaveProperty('projectId');
    expect(body).not.toHaveProperty('taskId');
  });

  it('rejects PercentComplete because PATCH ignores it', () => {
    expect(() => splitUpdateTaskArgs({
      projectId: 100,
      taskId: 42,
      PercentComplete: 37,
    })).toThrow('PercentComplete is not supported');
  });
});

describe('splitCreateRiskArgs', () => {
  it('builds path, maps Impact/Probability aliases, and requires LevelId', () => {
    const { path, body } = splitCreateRiskArgs({
      projectId: 100,
      Name: 'Risk A',
      Impact: 10,
      Probability: 20,
      LevelId: 30,
    });
    expect(path).toBe('projects/100/risks');
    expect(body).toEqual({ Name: 'Risk A', ImpactId: 10, ProbabilityId: 20, LevelId: 30 });
  });

  it('rejects missing LevelId', () => {
    expect(() => splitCreateRiskArgs({ projectId: 100, Name: 'Risk A' })).toThrow('LevelId is required');
  });
});

describe('splitCreateIssueArgs', () => {
  it('builds path and maps issue aliases to v2 REST field names', () => {
    const { path, body } = splitCreateIssueArgs({
      projectId: 100,
      Name: 'Issue B',
      TypeId: 820,
      StatusId: 547,
      Resolution: 'Resolved',
    });
    expect(path).toBe('projects/100/issues');
    expect(body).toEqual({ Name: 'Issue B', Type: 820, Status: 547, FinalResolution: 'Resolved' });
  });

  it('rejects Severity because v2 issue create does not support it', () => {
    expect(() => splitCreateIssueArgs({
      projectId: 100,
      Name: 'Issue B',
      Severity: 2,
    })).toThrow('Severity is not supported');
  });
});

describe('splitUpdateProjectArgs', () => {
  it('builds path and maps StatusId to ProjectStatusId', () => {
    const { path, body } = splitUpdateProjectArgs({ projectId: 100, Name: 'Renamed', StatusId: 662751 });
    expect(path).toBe('projects/100');
    expect(body).toEqual({ Name: 'Renamed', ProjectStatusId: 662751 });
  });

  it('rejects conflicting StatusId and ProjectStatusId values', () => {
    expect(() => splitUpdateProjectArgs({
      projectId: 100,
      StatusId: 662751,
      ProjectStatusId: 662752,
    })).toThrow('StatusId and ProjectStatusId cannot both be supplied');
  });
});

describe('mapReferenceIdToBaseId', () => {
  const referenceData = [
    { Id: 814, BaseId: 820, Name: 'Change request' },
    { Id: 815, BaseId: 821, Name: 'Problem' },
  ];

  it('maps localized Id to BaseId when reference data provides one', () => {
    expect(mapReferenceIdToBaseId(814, referenceData)).toBe(820);
  });

  it('keeps a supplied BaseId unchanged', () => {
    expect(mapReferenceIdToBaseId(821, referenceData)).toBe(821);
  });

  it('keeps unknown values for REST validation/readback to catch', () => {
    expect(mapReferenceIdToBaseId(999, referenceData)).toBe(999);
  });
});

describe('verifyRequestedFields', () => {
  const fields = [
    { requestField: 'ProjectStatusId', readPaths: ['Status.Id'], label: 'StatusId' },
    { requestField: 'StartDate', readPaths: ['StartDate'] },
  ];

  it('accepts numeric and ISO date readback matches', () => {
    expect(() => verifyRequestedFields(
      { ProjectStatusId: 662751, StartDate: '2026-08-01' },
      { Status: { Id: 662751 }, StartDate: '2026-08-01T00:00:00Z' },
      fields,
      'update_project',
    )).not.toThrow();
  });

  it('fails when readback omits a requested field', () => {
    expect(() => verifyRequestedFields(
      { ProjectStatusId: 662751 },
      { Name: 'No status here' },
      fields,
      'update_project',
    )).toThrow('readback did not include Status.Id');
  });

  it('fails when readback shows the requested field was ignored', () => {
    expect(() => verifyRequestedFields(
      { ProjectStatusId: 662751 },
      { Status: { Id: 662750 } },
      fields,
      'update_project',
    )).toThrow('expected 662751 but read back 662750');
  });
});
