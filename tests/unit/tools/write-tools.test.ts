import { describe, it, expect, vi } from 'vitest';
import {
  buildWriteResponse, buildInsufficientScopeResponse, STALE_AFTER_WRITE_NOTICE,
  splitCreateTaskArgs, splitUpdateTaskArgs, splitCreateRiskArgs,
  splitCreateIssueArgs, splitUpdateProjectArgs,
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
  it('builds path and separates projectId from body', () => {
    const { path, body } = splitCreateTaskArgs({ projectId: 100, Name: 'New Task', Description: 'Desc' });
    expect(path).toBe('projects/100/tasks');
    expect(body).toEqual({ Name: 'New Task', Description: 'Desc' });
    expect(body).not.toHaveProperty('projectId');
  });
});

describe('splitUpdateTaskArgs', () => {
  it('builds path with taskId and separates both IDs from body', () => {
    const { path, body } = splitUpdateTaskArgs({ projectId: 100, taskId: 42, Name: 'Updated' });
    expect(path).toBe('projects/100/tasks/42');
    expect(body).toEqual({ Name: 'Updated' });
    expect(body).not.toHaveProperty('projectId');
    expect(body).not.toHaveProperty('taskId');
  });
});

describe('splitCreateRiskArgs', () => {
  it('builds path and separates projectId from body', () => {
    const { path, body } = splitCreateRiskArgs({ projectId: 100, Name: 'Risk A' });
    expect(path).toBe('projects/100/risks');
    expect(body).toEqual({ Name: 'Risk A' });
  });
});

describe('splitCreateIssueArgs', () => {
  it('builds path and separates projectId from body', () => {
    const { path, body } = splitCreateIssueArgs({ projectId: 100, Name: 'Issue B' });
    expect(path).toBe('projects/100/issues');
    expect(body).toEqual({ Name: 'Issue B' });
  });
});

describe('splitUpdateProjectArgs', () => {
  it('builds path and separates projectId from body', () => {
    const { path, body } = splitUpdateProjectArgs({ projectId: 100, Name: 'Renamed' });
    expect(path).toBe('projects/100');
    expect(body).toEqual({ Name: 'Renamed' });
  });
});
