import { describe, it, expect } from 'vitest';
import { WRITE_TOOL_NAMES, hasScope, type EffectiveUserContext } from '../../../src/auth/effective-user-context.js';

describe('WRITE_TOOL_NAMES', () => {
  it('contains exactly the 10 write tool names', () => {
    expect(WRITE_TOOL_NAMES).toEqual(new Set([
      'create_project', 'create_task', 'update_task', 'create_risk', 'create_issue', 'update_project',
      'create_task_progress', 'update_task_progress',
      'bulk_update_task_status', 'bulk_update_activity_status',
    ]));
  });
});

describe('hasScope', () => {
  it('returns true when grantedScopes is undefined (api-key session)', () => {
    const ctx = { grantedScopes: undefined } as EffectiveUserContext;
    expect(hasScope(ctx, 'mcp:write')).toBe(true);
  });

  it('returns true when scope is granted', () => {
    const ctx = { grantedScopes: ['mcp:read', 'mcp:write'] } as EffectiveUserContext;
    expect(hasScope(ctx, 'mcp:write')).toBe(true);
  });

  it('returns false when scope is missing', () => {
    const ctx = { grantedScopes: ['mcp:read'] } as EffectiveUserContext;
    expect(hasScope(ctx, 'mcp:write')).toBe(false);
  });

  it('returns false for empty grantedScopes array', () => {
    const ctx = { grantedScopes: [] } as EffectiveUserContext;
    expect(hasScope(ctx, 'mcp:read')).toBe(false);
  });
});
