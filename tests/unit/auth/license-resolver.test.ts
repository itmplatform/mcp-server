import { describe, it, expect } from 'vitest';
import { resolveLicenseAccess } from '../../../src/auth/license-resolver.js';

describe('resolveLicenseAccess', () => {
  it('returns full access for CompanyAdmin (type 0)', () => {
    const result = resolveLicenseAccess([0], 100);
    expect(result.dataMartAccess).toBe('full');
    expect(result.pmScopeUserId).toBeUndefined();
  });

  it('returns full access for FullUser (type 1)', () => {
    const result = resolveLicenseAccess([1], 100);
    expect(result.dataMartAccess).toBe('full');
    expect(result.pmScopeUserId).toBeUndefined();
  });

  it('returns full when FullUser + PM dual license (FullUser wins)', () => {
    const result = resolveLicenseAccess([0, 2], 100);
    expect(result.dataMartAccess).toBe('full');
    expect(result.pmScopeUserId).toBeUndefined();
  });

  it('returns full when types [1, 2] (FullUser wins over PM)', () => {
    const result = resolveLicenseAccess([1, 2], 100);
    expect(result.dataMartAccess).toBe('full');
    expect(result.pmScopeUserId).toBeUndefined();
  });

  it('returns pm-scoped for PM-only user (type 2 alone)', () => {
    const result = resolveLicenseAccess([2], 456);
    expect(result.dataMartAccess).toBe('pm-scoped');
    expect(result.pmScopeUserId).toBe(456);
  });

  it('returns none for TeamMember (type 3)', () => {
    const result = resolveLicenseAccess([3], 100);
    expect(result.dataMartAccess).toBe('none');
    expect(result.pmScopeUserId).toBeUndefined();
  });

  it('returns none for empty license array', () => {
    const result = resolveLicenseAccess([], 100);
    expect(result.dataMartAccess).toBe('none');
    expect(result.pmScopeUserId).toBeUndefined();
  });

  it('returns none for unknown license types only', () => {
    const result = resolveLicenseAccess([5, 7], 100);
    expect(result.dataMartAccess).toBe('none');
    expect(result.pmScopeUserId).toBeUndefined();
  });
});
