import { describe, it, expect, vi } from 'vitest';
import {
  buildWriteResponse, buildInsufficientScopeResponse, auditWrap, STALE_AFTER_WRITE_NOTICE,
  splitCreateTaskArgs, splitUpdateTaskArgs, splitCreateRiskArgs,
  splitCreateIssueArgs, splitUpdateProjectArgs,
} from '../../../src/tools/write-tools.js';
import type { Clients } from '../../../src/clients/index.js';

function createMockClients(overrides?: Partial<{ postResult: unknown; patchResult: unknown }>): Clients {
  return {
    datamart: { query: vi.fn() },
    rest: {
      get: vi.fn(),
      post: vi.fn().mockResolvedValue(overrides?.postResult ?? { Id: 1, Name: 'Created' }),
      patch: vi.fn().mockResolvedValue(overrides?.patchResult ?? { Id: 1, Name: 'Updated' }),
    },
    audit: { log: vi.fn().mockResolvedValue(undefined) },
  } as unknown as Clients;
}

const userContext = { userId: 456, accountId: 123, aiClientId: 'test-client' };

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

describe('auditWrap', () => {
  it('calls audit.log with success=true on successful operation', async () => {
    const clients = createMockClients();
    const result = await auditWrap(clients, 'create_task', { projectId: 1 }, userContext, async () => 'ok');

    expect(result).toBe('ok');
    expect(clients.audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        toolName: 'create_task',
        userId: 456,
        accountId: 123,
        success: true,
        aiClientId: 'test-client',
      }),
    );
  });

  it('calls audit.log with success=false on failure and re-throws', async () => {
    const clients = createMockClients();
    const error = new Error('REST failed');

    await expect(
      auditWrap(clients, 'update_task', { taskId: 1 }, userContext, async () => { throw error; }),
    ).rejects.toThrow('REST failed');

    expect(clients.audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        toolName: 'update_task',
        success: false,
        error: 'REST failed',
      }),
    );
  });

  it('measures durationMs', async () => {
    const clients = createMockClients();
    await auditWrap(clients, 'create_task', {}, userContext, async () => {
      await new Promise(r => setTimeout(r, 10));
      return 'done';
    });

    const entry = (clients.audit.log as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(entry.durationMs).toBeGreaterThanOrEqual(0);
    expect(typeof entry.durationMs).toBe('number');
  });

  it('does not throw when audit.log fails (fire-and-forget)', async () => {
    const clients = createMockClients();
    (clients.audit.log as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('audit down'));

    const result = await auditWrap(clients, 'create_task', {}, userContext, async () => 'ok');
    expect(result).toBe('ok');
  });

  it('includes parametersHash as SHA-256 hex', async () => {
    const clients = createMockClients();
    await auditWrap(clients, 'create_task', { projectId: 100 }, userContext, async () => 'ok');

    const entry = (clients.audit.log as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(entry.parametersHash).toMatch(/^[a-f0-9]{64}$/);
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
