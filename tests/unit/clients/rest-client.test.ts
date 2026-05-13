import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRestClient } from '../../../src/clients/rest-client.js';

function mockLogger() {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any;
}

describe('RestClient', () => {
  const originalFetch = globalThis.fetch;
  const config = { apiUrl: 'http://localhost/ITM.API', company: 'acme', authHeaders: { 'Authorization': 'Bearer key-123' } };

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('GET sends to the correct URL with Bearer auth', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([{ id: 1, name: 'Active' }]),
    });
    globalThis.fetch = mockFetch;

    const client = createRestClient(config);
    const result = await client.get('projectstatuses');

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost/ITM.API/v2/acme/projectstatuses',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          'Authorization': 'Bearer key-123',
        }),
      }),
    );
    expect(result).toEqual([{ id: 1, name: 'Active' }]);
  });

  it('POST sends body as JSON', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [{ userId: 1 }], total: 1 }),
    });
    globalThis.fetch = mockFetch;

    const client = createRestClient(config);
    const body = { Filter: { Name: { $regex: 'daniel' } }, page: 1, pageSize: 10 };
    const result = await client.post('AllUsers', body);

    const call = mockFetch.mock.calls[0];
    expect(call[0]).toBe('http://localhost/ITM.API/v2/acme/AllUsers');
    expect(call[1].method).toBe('POST');
    expect(JSON.parse(call[1].body)).toEqual(body);
    expect(result).toEqual({ data: [{ userId: 1 }], total: 1 });
  });

  it('throws on non-200 response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    const client = createRestClient(config);
    await expect(client.get('nonexistent')).rejects.toThrow('404');
  });

  describe('logging', () => {
    it('logs debug on successful GET with path and duration', async () => {
      const log = mockLogger();
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([{ id: 1 }]),
      });

      const client = createRestClient({ ...config, log });
      await client.get('projectstatuses');

      expect(log.debug).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'GET', path: 'projectstatuses', ms: expect.any(Number) }),
        expect.stringContaining('REST'),
      );
    });

    it('logs debug on successful POST', async () => {
      const log = mockLogger();
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: [] }),
      });

      const client = createRestClient({ ...config, log });
      await client.post('AllUsers', { page: 1 });

      expect(log.debug).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'POST', path: 'AllUsers', ms: expect.any(Number) }),
        expect.stringContaining('REST'),
      );
    });

    it('logs error on HTTP failure', async () => {
      const log = mockLogger();
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const client = createRestClient({ ...config, log });
      await expect(client.get('bad')).rejects.toThrow();

      expect(log.error).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'GET', path: 'bad', status: 500 }),
        expect.stringContaining('REST'),
      );
    });

    it('works without a logger', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      });

      const client = createRestClient(config);
      const result = await client.get('test');
      expect(result).toEqual({ ok: true });
    });
  });

  it('PATCH sends body as JSON with PATCH method', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 42, Name: 'Updated Task' }),
    });
    globalThis.fetch = mockFetch;

    const client = createRestClient(config);
    const body = { Name: 'Updated Task' };
    const result = await client.patch('projects/100/tasks/42', body);

    const call = mockFetch.mock.calls[0];
    expect(call[0]).toBe('http://localhost/ITM.API/v2/acme/projects/100/tasks/42');
    expect(call[1].method).toBe('PATCH');
    expect(JSON.parse(call[1].body)).toEqual(body);
    expect(result).toEqual({ id: 42, Name: 'Updated Task' });
  });

  it('PATCH throws on non-200 response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
    });

    const client = createRestClient(config);
    await expect(client.patch('projects/100', { Name: 'x' })).rejects.toThrow('400');
  });
});
