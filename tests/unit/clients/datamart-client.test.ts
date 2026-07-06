import { describe, it, expect, vi, afterEach } from 'vitest';
import { createDataMartClient } from '../../../src/clients/datamart-client.js';

function mockLogger() {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any;
}

describe('DataMartClient', () => {
  const originalFetch = globalThis.fetch;
  const config = { apiUrl: 'http://localhost/ITM.API', company: 'acme', authHeaders: { 'Authorization': 'Bearer key-123' } };

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('sends POST to the correct gateway URL', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { components: { items: [] } } }),
    });
    globalThis.fetch = mockFetch;

    const client = createDataMartClient(config);
    await client.query({ query: 'query { components { items } }', variables: {} });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost/ITM.API/v2/acme/datamart/graphql',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Authorization': 'Bearer key-123',
          'Content-Type': 'application/json',
        }),
      }),
    );
  });

  it('includes X-Request-Id header', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: {} }),
    });
    globalThis.fetch = mockFetch;

    const client = createDataMartClient(config);
    await client.query({ query: 'query { components { items } }', variables: {} });

    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers['X-Request-Id']).toBeDefined();
    expect(headers['X-Request-Id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('sends the query body as JSON', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { components: { items: [{ id: 1 }] } } }),
    });
    globalThis.fetch = mockFetch;

    const client = createDataMartClient(config);
    const body = { query: 'query($w: JSON) { components(where: $w) { items } }', variables: { w: { componentType: { $eq: 'project' } } } };
    const result = await client.query(body);

    const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(sentBody.query).toBe(body.query);
    expect(sentBody.variables).toEqual(body.variables);
    expect(result).toEqual({ components: { items: [{ id: 1 }] } });
  });

  it('throws on non-200 response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    const client = createDataMartClient(config);
    await expect(client.query({ query: 'query { components { items } }', variables: {} }))
      .rejects.toThrow('500');
  });

  it('throws on GraphQL errors', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        errors: [{ message: 'Validation error' }],
        data: null,
      }),
    });

    const client = createDataMartClient(config);
    await expect(client.query({ query: 'query { components { items } }', variables: {} }))
      .rejects.toThrow('Validation error');
  });

  describe('401 retry with onUnauthorized', () => {
    it('calls onUnauthorized and retries on 401, succeeding with updated headers', async () => {
      const authHeaders: Record<string, string> = { Token: 'mcp_stale' };
      const onUnauthorized = vi.fn().mockImplementation(() => {
        authHeaders.Token = 'mcp_fresh';
        return Promise.resolve();
      });

      const mockFetch = vi.fn()
        .mockResolvedValueOnce({ ok: false, status: 401, statusText: 'Unauthorized' })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ data: { projects: [] } }),
        });
      globalThis.fetch = mockFetch;

      const client = createDataMartClient({ ...config, authHeaders, onUnauthorized });
      const result = await client.query({ query: 'query { projects }', variables: {} });

      expect(onUnauthorized).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch.mock.calls[1][1].headers.Token).toBe('mcp_fresh');
      expect(result).toEqual({ projects: [] });
    });

    it('throws immediately on 401 when onUnauthorized is not provided', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      });

      const client = createDataMartClient(config);
      await expect(client.query({ query: 'q', variables: {} }))
        .rejects.toThrow('401');
    });

    it('throws when retry also returns 401', async () => {
      const onUnauthorized = vi.fn().mockResolvedValue(undefined);
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      });
      globalThis.fetch = mockFetch;

      const client = createDataMartClient({ ...config, onUnauthorized });
      await expect(client.query({ query: 'q', variables: {} }))
        .rejects.toThrow('401');
      expect(onUnauthorized).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('does not retry non-401 errors even when onUnauthorized is provided', async () => {
      const onUnauthorized = vi.fn().mockResolvedValue(undefined);
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const client = createDataMartClient({ ...config, onUnauthorized });
      await expect(client.query({ query: 'q', variables: {} }))
        .rejects.toThrow('500');
      expect(onUnauthorized).not.toHaveBeenCalled();
    });

    it('reuses the same requestId on retry', async () => {
      const onUnauthorized = vi.fn().mockResolvedValue(undefined);
      const mockFetch = vi.fn()
        .mockResolvedValueOnce({ ok: false, status: 401, statusText: 'Unauthorized' })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ data: {} }),
        });
      globalThis.fetch = mockFetch;

      const client = createDataMartClient({ ...config, onUnauthorized });
      await client.query({ query: 'q', variables: {} });

      const firstRequestId = mockFetch.mock.calls[0][1].headers['X-Request-Id'];
      const retryRequestId = mockFetch.mock.calls[1][1].headers['X-Request-Id'];
      expect(firstRequestId).toBe(retryRequestId);
    });

    it('throws original 401 error when onUnauthorized rejects', async () => {
      const onUnauthorized = vi.fn().mockRejectedValue(new Error('exchange failed'));
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      });
      globalThis.fetch = mockFetch;

      const log = mockLogger();
      const client = createDataMartClient({ ...config, onUnauthorized, log });
      await expect(client.query({ query: 'q', variables: {} }))
        .rejects.toThrow('401');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('logging', () => {
    it('logs debug on successful request with requestId and duration', async () => {
      const log = mockLogger();
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: { components: [] } }),
      });

      const client = createDataMartClient({ ...config, log });
      await client.query({ query: 'query { components { items } }', variables: {} });

      expect(log.debug).toHaveBeenCalledWith(
        expect.objectContaining({ requestId: expect.stringMatching(/^[0-9a-f-]+$/), ms: expect.any(Number) }),
        expect.stringContaining('DataMart'),
      );
    });

    it('logs error on HTTP failure', async () => {
      const log = mockLogger();
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const client = createDataMartClient({ ...config, log });
      await expect(client.query({ query: 'q', variables: {} })).rejects.toThrow();

      expect(log.error).toHaveBeenCalledWith(
        expect.objectContaining({ status: 500 }),
        expect.stringContaining('DataMart'),
      );
    });

    it('logs error on GraphQL errors', async () => {
      const log = mockLogger();
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ errors: [{ message: 'Bad query' }], data: null }),
      });

      const client = createDataMartClient({ ...config, log });
      await expect(client.query({ query: 'q', variables: {} })).rejects.toThrow();

      expect(log.error).toHaveBeenCalledWith(
        expect.objectContaining({ graphqlError: 'Bad query' }),
        expect.stringContaining('DataMart'),
      );
    });

    it('works without a logger', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: { items: [] } }),
      });

      const client = createDataMartClient(config);
      const result = await client.query({ query: 'q', variables: {} });
      expect(result).toEqual({ items: [] });
    });
  });
});
