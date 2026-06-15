import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveIdentity } from '../../../src/auth/api-key-auth.js';

const VALID_IDENTITY_RESPONSE = {
  userId: 456,
  accountId: 123,
  email: 'user@acme.com',
  languageId: 2,
  licenseTypeIds: [1],
  dataMartAccess: 'full',
  pmScopeUserId: null,
};

describe('resolveIdentity', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.stubEnv('ITM_API_URL', 'http://localhost/ITM.API');
    vi.stubEnv('ITM_COMPANY', 'acme');
    vi.stubEnv('ITM_API_KEY', 'test-key-123');
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.unstubAllEnvs();
  });

  it('builds EffectiveUserContext from identity response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(VALID_IDENTITY_RESPONSE),
    });

    const ctx = await resolveIdentity();
    expect(ctx.source).toBe('api-key');
    expect(ctx.company).toBe('acme');
    expect(ctx.userId).toBe(456);
    expect(ctx.accountId).toBe(123);
    expect(ctx.email).toBe('user@acme.com');
    expect(ctx.languageId).toBe(2);
    expect(ctx.licenseTypeIds).toEqual([1]);
    expect(ctx.dataMartAccess).toBe('full');
    expect(ctx.pmScopeUserId).toBeUndefined();
    expect(ctx.authHeaders).toEqual({ 'Authorization': 'Bearer test-key-123' });
  });

  it('calls the correct endpoint with Bearer auth', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(VALID_IDENTITY_RESPONSE),
    });
    globalThis.fetch = mockFetch;

    await resolveIdentity();

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost/ITM.API/v2/acme/resolve/identity',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Authorization': 'Bearer test-key-123',
        }),
      }),
    );
  });

  it('throws when ITM_API_URL is missing', async () => {
    vi.stubEnv('ITM_API_URL', '');
    await expect(resolveIdentity()).rejects.toThrow('ITM_API_URL');
  });

  it('throws when ITM_COMPANY is missing', async () => {
    vi.stubEnv('ITM_COMPANY', '');
    await expect(resolveIdentity()).rejects.toThrow('ITM_COMPANY');
  });

  it('throws when neither ITM_API_KEY nor ITM_TOKEN is set', async () => {
    vi.stubEnv('ITM_API_KEY', '');
    await expect(resolveIdentity()).rejects.toThrow('ITM_API_KEY or ITM_TOKEN');
  });

  it('uses Token header when ITM_TOKEN is set', async () => {
    vi.stubEnv('ITM_API_KEY', '');
    vi.stubEnv('ITM_TOKEN', 'session-token-abc');
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(VALID_IDENTITY_RESPONSE),
    });
    globalThis.fetch = mockFetch;

    const ctx = await resolveIdentity();

    expect(ctx.source).toBe('token');
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost/ITM.API/v2/acme/resolve/identity',
      expect.objectContaining({
        headers: expect.objectContaining({ 'Token': 'session-token-abc' }),
      }),
    );
  });

  it('throws on non-200 response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    });
    await expect(resolveIdentity()).rejects.toThrow('401');
  });

  it('resolves PM-scoped users with pm-scoped access', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        ...VALID_IDENTITY_RESPONSE,
        licenseTypeIds: [2],
        dataMartAccess: 'pm-scoped',
        pmScopeUserId: 456,
      }),
    });
    const ctx = await resolveIdentity();
    expect(ctx.dataMartAccess).toBe('pm-scoped');
    expect(ctx.pmScopeUserId).toBe(456);
  });

  it('rejects Team Members', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        ...VALID_IDENTITY_RESPONSE,
        licenseTypeIds: [3],
        dataMartAccess: 'none',
      }),
    });
    await expect(resolveIdentity()).rejects.toThrow('Team Member');
  });
});
