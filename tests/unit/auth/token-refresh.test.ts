import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTokenRefreshCallback } from '../../../src/auth/token-refresh.js';

vi.mock('../../../src/auth/oauth-auth.js', () => ({
  exchangeToken: vi.fn(),
}));

import { exchangeToken } from '../../../src/auth/oauth-auth.js';
const mockExchangeToken = vi.mocked(exchangeToken);

function mockLogger() {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any;
}

function fakeExchangeResult(token = 'mcp_refreshed') {
  return {
    sessionToken: token,
    userId: 1,
    accountId: 100,
    company: 'acme',
    email: 'test@acme.com',
    languageId: 1,
    licenseTypeIds: [1],
    dataMartAccess: 'full' as const,
    expiresAt: '2026-12-31T00:00:00Z',
    scope: 'mcp:read mcp:write',
  };
}

const oauthConfig = { tokenExchangeUrl: 'http://auth/exchange', audience: 'itm' };

describe('createTokenRefreshCallback', () => {
  beforeEach(() => {
    mockExchangeToken.mockReset();
  });

  it('exchanges token and updates authHeaders', async () => {
    const authHeaders: Record<string, string> = { Token: 'mcp_old' };
    const setExpiresAt = vi.fn();
    mockExchangeToken.mockResolvedValue(fakeExchangeResult('mcp_new'));

    const refresh = createTokenRefreshCallback(
      () => 'oauth-bearer-123',
      oauthConfig,
      authHeaders,
      setExpiresAt,
    );

    await refresh();

    expect(mockExchangeToken).toHaveBeenCalledWith('oauth-bearer-123', oauthConfig, undefined);
    expect(authHeaders.Token).toBe('mcp_new');
  });

  it('calls setExpiresAt with parsed timestamp', async () => {
    const authHeaders: Record<string, string> = { Token: 'mcp_old' };
    const setExpiresAt = vi.fn();
    mockExchangeToken.mockResolvedValue(fakeExchangeResult());

    const refresh = createTokenRefreshCallback(
      () => 'oauth-bearer',
      oauthConfig,
      authHeaders,
      setExpiresAt,
    );

    await refresh();

    expect(setExpiresAt).toHaveBeenCalledWith(new Date('2026-12-31T00:00:00Z').getTime());
  });

  it('throws when getOAuthToken returns undefined', async () => {
    const authHeaders: Record<string, string> = { Token: 'mcp_old' };
    const refresh = createTokenRefreshCallback(
      () => undefined,
      oauthConfig,
      authHeaders,
      vi.fn(),
    );

    await expect(refresh()).rejects.toThrow();
    expect(mockExchangeToken).not.toHaveBeenCalled();
  });

  it('coalesces concurrent calls into a single exchangeToken call', async () => {
    const authHeaders: Record<string, string> = { Token: 'mcp_old' };
    mockExchangeToken.mockResolvedValue(fakeExchangeResult('mcp_coalesced'));

    const refresh = createTokenRefreshCallback(
      () => 'oauth-bearer',
      oauthConfig,
      authHeaders,
      vi.fn(),
    );

    await Promise.all([refresh(), refresh(), refresh()]);

    expect(mockExchangeToken).toHaveBeenCalledTimes(1);
    expect(authHeaders.Token).toBe('mcp_coalesced');
  });

  it('clears inflight after failure so next call retries', async () => {
    const authHeaders: Record<string, string> = { Token: 'mcp_old' };
    mockExchangeToken
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce(fakeExchangeResult('mcp_recovered'));

    const refresh = createTokenRefreshCallback(
      () => 'oauth-bearer',
      oauthConfig,
      authHeaders,
      vi.fn(),
    );

    await expect(refresh()).rejects.toThrow('network error');
    await refresh();

    expect(mockExchangeToken).toHaveBeenCalledTimes(2);
    expect(authHeaders.Token).toBe('mcp_recovered');
  });

  it('passes logger to exchangeToken', async () => {
    const log = mockLogger();
    const authHeaders: Record<string, string> = { Token: 'mcp_old' };
    mockExchangeToken.mockResolvedValue(fakeExchangeResult());

    const refresh = createTokenRefreshCallback(
      () => 'oauth-bearer',
      oauthConfig,
      authHeaders,
      vi.fn(),
      log,
    );

    await refresh();

    expect(mockExchangeToken).toHaveBeenCalledWith('oauth-bearer', oauthConfig, log);
  });

  it('logs info on successful refresh', async () => {
    const log = mockLogger();
    const authHeaders: Record<string, string> = { Token: 'mcp_old' };
    mockExchangeToken.mockResolvedValue(fakeExchangeResult());

    const refresh = createTokenRefreshCallback(
      () => 'oauth-bearer',
      oauthConfig,
      authHeaders,
      vi.fn(),
      log,
    );

    await refresh();

    expect(log.info).toHaveBeenCalled();
  });

  it('logs warning on failed refresh', async () => {
    const log = mockLogger();
    const authHeaders: Record<string, string> = { Token: 'mcp_old' };
    mockExchangeToken.mockRejectedValue(new Error('fail'));

    const refresh = createTokenRefreshCallback(
      () => 'oauth-bearer',
      oauthConfig,
      authHeaders,
      vi.fn(),
      log,
    );

    await expect(refresh()).rejects.toThrow('fail');
    expect(log.warn).toHaveBeenCalled();
  });
});
