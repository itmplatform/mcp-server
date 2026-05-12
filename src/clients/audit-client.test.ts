import { describe, it, expect, vi, afterEach } from 'vitest';
import { createAuditClient, createNoOpAuditClient, hashParameters, type AuditEntry } from './audit-client.js';

function mockLogger() {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any;
}

function sampleEntry(): AuditEntry {
  return {
    timestamp: '2026-05-12T10:00:00.000Z',
    userId: 456,
    accountId: 123,
    toolName: 'create_task',
    parametersHash: 'abc123',
    success: true,
    aiClientId: 'claude-desktop',
    durationMs: 150,
  };
}

describe('hashParameters', () => {
  it('produces consistent SHA-256 hex for the same input', () => {
    const hash1 = hashParameters({ projectId: 100, Name: 'Test' });
    const hash2 = hashParameters({ projectId: 100, Name: 'Test' });
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[a-f0-9]{64}$/);
  });

  it('produces different hashes for different inputs', () => {
    const hash1 = hashParameters({ projectId: 100 });
    const hash2 = hashParameters({ projectId: 200 });
    expect(hash1).not.toBe(hash2);
  });
});

describe('createAuditClient', () => {
  const originalFetch = globalThis.fetch;
  const config = {
    apiUrl: 'http://localhost/ITM.API',
    company: 'acme',
    authHeaders: { 'Authorization': 'Bearer key-123' },
  };

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('sends POST with entry payload to audit endpoint', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    globalThis.fetch = mockFetch;

    const client = createAuditClient(config);
    const entry = sampleEntry();
    await client.log(entry);

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost/ITM.API/v2/acme/mcp/audit',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Authorization': 'Bearer key-123',
          'Content-Type': 'application/json',
        }),
      }),
    );
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.toolName).toBe('create_task');
    expect(body.userId).toBe(456);
  });

  it('does not throw on HTTP error (fire-and-forget)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    const log = mockLogger();
    const client = createAuditClient({ ...config, log });
    await expect(client.log(sampleEntry())).resolves.toBeUndefined();
    expect(log.warn).toHaveBeenCalled();
  });

  it('does not throw on network error', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    const log = mockLogger();
    const client = createAuditClient({ ...config, log });
    await expect(client.log(sampleEntry())).resolves.toBeUndefined();
    expect(log.warn).toHaveBeenCalled();
  });

  it('logs debug on successful audit post', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });

    const log = mockLogger();
    const client = createAuditClient({ ...config, log });
    await client.log(sampleEntry());

    expect(log.debug).toHaveBeenCalledWith(
      expect.objectContaining({ toolName: 'create_task' }),
      expect.any(String),
    );
  });
});

describe('createNoOpAuditClient', () => {
  it('log resolves without doing anything', async () => {
    const client = createNoOpAuditClient();
    await expect(client.log(sampleEntry())).resolves.toBeUndefined();
  });
});
