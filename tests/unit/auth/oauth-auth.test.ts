import { describe, it, expect, vi, afterEach } from 'vitest';
import { exchangeToken, buildEffectiveUserContextFromExchange, type TokenExchangeResult } from '../../../src/auth/oauth-auth.js';

function sampleExchangeResult(): TokenExchangeResult {
  return {
    sessionToken: 'session-abc-123',
    userId: 456,
    accountId: 123,
    company: 'acme',
    email: 'user@acme.com',
    languageId: 2,
    licenseTypeIds: [1],
    dataMartAccess: 'full',
    expiresAt: '2026-05-12T12:00:00.000Z',
    scope: 'mcp:read mcp:write',
  };
}

describe('exchangeToken', () => {
  const originalFetch = globalThis.fetch;
  const config = {
    tokenExchangeUrl: 'http://localhost/ITM.API/v2/acme/auth/exchange-token',
    audience: 'https://mcp.itmplatform.com',
  };

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('sends POST with OAuth Bearer token to exchange URL', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(sampleExchangeResult()),
    });
    globalThis.fetch = mockFetch;

    await exchangeToken('oauth-token-xyz', config);

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost/ITM.API/v2/acme/auth/exchange-token',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Authorization': 'Bearer oauth-token-xyz',
          'Content-Type': 'application/json',
        }),
      }),
    );
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.audience).toBe('https://mcp.itmplatform.com');
  });

  it('returns the exchange result', async () => {
    const expected = sampleExchangeResult();
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(expected),
    });

    const result = await exchangeToken('oauth-token-xyz', config);
    expect(result.userId).toBe(456);
    expect(result.sessionToken).toBe('session-abc-123');
  });

  it('throws on non-200 with descriptive error', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    });

    await expect(exchangeToken('bad-token', config)).rejects.toThrow('Token exchange failed: 401 Unauthorized');
  });
});

describe('buildEffectiveUserContextFromExchange', () => {
  it('maps exchange result to EffectiveUserContext', () => {
    const ctx = buildEffectiveUserContextFromExchange(sampleExchangeResult());
    expect(ctx.userId).toBe(456);
    expect(ctx.accountId).toBe(123);
    expect(ctx.company).toBe('acme');
    expect(ctx.email).toBe('user@acme.com');
    expect(ctx.languageId).toBe(2);
    expect(ctx.licenseTypeIds).toEqual([1]);
    expect(ctx.dataMartAccess).toBe('full');
  });

  it('sets source to token', () => {
    const ctx = buildEffectiveUserContextFromExchange(sampleExchangeResult());
    expect(ctx.source).toBe('token');
  });

  it('sets authHeaders with Token header for downstream gateway calls', () => {
    const ctx = buildEffectiveUserContextFromExchange(sampleExchangeResult());
    expect(ctx.authHeaders).toEqual({ 'Token': 'session-abc-123' });
  });

  it('parses space-separated scope into grantedScopes', () => {
    const result = { ...sampleExchangeResult(), scope: 'mcp:read mcp:write' };
    const ctx = buildEffectiveUserContextFromExchange(result);
    expect(ctx.grantedScopes).toEqual(['mcp:read', 'mcp:write']);
  });

  it('handles read-only scope', () => {
    const result = { ...sampleExchangeResult(), scope: 'mcp:read' };
    const ctx = buildEffectiveUserContextFromExchange(result);
    expect(ctx.grantedScopes).toEqual(['mcp:read']);
  });

  it('handles empty scope string', () => {
    const result = { ...sampleExchangeResult(), scope: '' };
    const ctx = buildEffectiveUserContextFromExchange(result);
    expect(ctx.grantedScopes).toEqual([]);
  });

  it('trims extra whitespace in scope string', () => {
    const result = { ...sampleExchangeResult(), scope: ' mcp:read  mcp:write ' };
    const ctx = buildEffectiveUserContextFromExchange(result);
    expect(ctx.grantedScopes).toEqual(['mcp:read', 'mcp:write']);
  });

  it('includes pmScopeUserId when present', () => {
    const result = { ...sampleExchangeResult(), dataMartAccess: 'pm-scoped' as const, pmScopeUserId: 789 };
    const ctx = buildEffectiveUserContextFromExchange(result);
    expect(ctx.pmScopeUserId).toBe(789);
    expect(ctx.dataMartAccess).toBe('pm-scoped');
  });
});
