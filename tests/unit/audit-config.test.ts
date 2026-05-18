import { describe, expect, it } from 'vitest';
import { isAuditEnabled } from '../../src/audit-config.js';

describe('isAuditEnabled', () => {
  it('enables audit by default when the env var is unset', () => {
    expect(isAuditEnabled(undefined)).toBe(true);
  });

  it('enables audit for any value other than false', () => {
    expect(isAuditEnabled('true')).toBe(true);
    expect(isAuditEnabled('')).toBe(true);
  });

  it('disables audit when explicitly set to false, case-insensitively', () => {
    expect(isAuditEnabled('false')).toBe(false);
    expect(isAuditEnabled('FALSE')).toBe(false);
  });
});
