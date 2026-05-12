import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRestClient } from './rest-client.js';

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
});
