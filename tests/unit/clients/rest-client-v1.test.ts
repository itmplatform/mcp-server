import { describe, it, expect, vi, afterEach } from 'vitest';
import { createV1RestClient } from '../../../src/clients/rest-client.js';

describe('V1 RestClient', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function jsonResponse(body: unknown, status = 200) {
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: 'OK',
      json: () => Promise.resolve(body),
      text: () => Promise.resolve(JSON.stringify(body)),
    };
  }

  describe('with a session token', () => {
    const config = { apiUrl: 'http://localhost/ITM.API', company: 'acme', authHeaders: { Token: 'session-token' } };

    it('GET builds the v1 URL without the /v2 prefix and sends the Token header', async () => {
      const mockFetch = vi.fn().mockResolvedValue(jsonResponse({ TimeReports: [] }));
      globalThis.fetch = mockFetch;

      const client = createV1RestClient(config);
      const result = await client.get('timehours?startdate=2026-08-06&enddate=2026-08-06');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch.mock.calls[0][0]).toBe('http://localhost/ITM.API/acme/timehours?startdate=2026-08-06&enddate=2026-08-06');
      expect(mockFetch.mock.calls[0][1].headers.Token).toBe('session-token');
      expect(result).toEqual({ TimeReports: [] });
    });

    it('POST sends the body as JSON to the v1 URL', async () => {
      const mockFetch = vi.fn().mockResolvedValue(jsonResponse({ StatusCode: 200 }));
      globalThis.fetch = mockFetch;

      const client = createV1RestClient(config);
      const body = { TimeReports: [{ EntityId: 1, WorkItemId: 2, Date: '2026-08-06', ReportedHours: '2:30' }] };
      await client.post('timehours', body);

      expect(mockFetch.mock.calls[0][0]).toBe('http://localhost/ITM.API/acme/timehours');
      expect(mockFetch.mock.calls[0][1].method).toBe('POST');
      expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual(body);
    });

    it('PUT sends the body as JSON with PUT method', async () => {
      const mockFetch = vi.fn().mockResolvedValue(jsonResponse({ StatusCode: 200 }));
      globalThis.fetch = mockFetch;

      const client = createV1RestClient(config);
      await client.put('project/100/progress/7', { PercentageCompleted: 50 });

      expect(mockFetch.mock.calls[0][0]).toBe('http://localhost/ITM.API/acme/project/100/progress/7');
      expect(mockFetch.mock.calls[0][1].method).toBe('PUT');
    });

    it('returns null on 204 No Content', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 204,
        statusText: 'No Content',
        text: () => Promise.resolve(''),
      });

      const client = createV1RestClient(config);
      const result = await client.get('timehours?startdate=2026-08-06&enddate=2026-08-06');
      expect(result).toBeNull();
    });

    it('returns null on an empty 200 body', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: () => Promise.resolve(''),
      });

      const client = createV1RestClient(config);
      const result = await client.get('timehours?startdate=2026-08-06&enddate=2026-08-06');
      expect(result).toBeNull();
    });

    it('retries once via onUnauthorized on 401', async () => {
      const authHeaders: Record<string, string> = { Token: 'stale' };
      const onUnauthorized = vi.fn().mockImplementation(() => {
        authHeaders.Token = 'fresh';
        return Promise.resolve();
      });
      const mockFetch = vi.fn()
        .mockResolvedValueOnce({ ok: false, status: 401, statusText: 'Unauthorized', text: () => Promise.resolve('') })
        .mockResolvedValueOnce(jsonResponse([{ ProjectProgressId: 1 }]));
      globalThis.fetch = mockFetch;

      const client = createV1RestClient({ apiUrl: 'http://localhost/ITM.API', company: 'acme', authHeaders, onUnauthorized });
      const result = await client.get('project/100/progress');

      expect(onUnauthorized).toHaveBeenCalledTimes(1);
      expect(mockFetch.mock.calls[1][1].headers.Token).toBe('fresh');
      expect(result).toEqual([{ ProjectProgressId: 1 }]);
    });

    it('surfaces a JSON StatusMessage on error responses', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: () => Promise.resolve(JSON.stringify({ StatusMessage: 'Please enter assessment' })),
      });

      const client = createV1RestClient(config);
      await expect(client.post('project/100/progress', {})).rejects.toThrow('Please enter assessment');
    });
  });

  describe('with an API key', () => {
    const config = { apiUrl: 'http://localhost/ITM.API', company: 'acme', authHeaders: { Authorization: 'Bearer key-123' } };

    it('logs in with the API key once, then sends the acquired token', async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce(jsonResponse({ Token: 'v1-token', UserID: '5', AccountID: '9' }))
        .mockResolvedValue(jsonResponse({ TimeReports: [] }));
      globalThis.fetch = mockFetch;

      const client = createV1RestClient(config);
      await client.get('timehours?startdate=2026-08-06&enddate=2026-08-06');
      await client.get('timehours?startdate=2026-08-07&enddate=2026-08-07');

      expect(mockFetch.mock.calls[0][0]).toBe('http://localhost/ITM.API/acme/Login/key-123');
      expect(mockFetch.mock.calls[1][1].headers.Token).toBe('v1-token');
      expect(mockFetch.mock.calls[2][1].headers.Token).toBe('v1-token');
      // Only one login for two requests.
      const loginCalls = mockFetch.mock.calls.filter(call => String(call[0]).includes('/Login/'));
      expect(loginCalls).toHaveLength(1);
    });

    it('re-logs in once and retries when the v1 token gets a 401', async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce(jsonResponse({ Token: 'old-v1' }))
        .mockResolvedValueOnce({ ok: false, status: 401, statusText: 'Unauthorized', text: () => Promise.resolve('') })
        .mockResolvedValueOnce(jsonResponse({ Token: 'new-v1' }))
        .mockResolvedValueOnce(jsonResponse({ ok: true }));
      globalThis.fetch = mockFetch;

      const client = createV1RestClient(config);
      const result = await client.get('project/100/progress');

      expect(result).toEqual({ ok: true });
      expect(mockFetch.mock.calls[3][1].headers.Token).toBe('new-v1');
    });

    it('throws a clear error when the login does not return a token', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse({ StatusMessage: 'Incorrect company or api key.' }, 400));

      const client = createV1RestClient(config);
      await expect(client.get('timehours?startdate=2026-08-06&enddate=2026-08-06')).rejects.toThrow(/login/i);
    });
  });

  it('throws when neither a token nor an API key is available', async () => {
    globalThis.fetch = vi.fn();
    const client = createV1RestClient({ apiUrl: 'http://localhost/ITM.API', company: 'acme', authHeaders: {} });
    await expect(client.get('timehours?startdate=2026-08-06&enddate=2026-08-06')).rejects.toThrow(/session token|API key/i);
  });
});
