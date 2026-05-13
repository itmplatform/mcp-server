import { describe, it, expect } from 'vitest';

describe('risks-issues tools query composition', () => {
  it('extracts risks array from component', () => {
    const component = { risks: [{ name: 'Risk 1', statusLabel: 'Open' }] };
    const risks = component.risks ?? [];
    expect(risks).toHaveLength(1);
    expect(risks[0].name).toBe('Risk 1');
  });

  it('returns empty array when no risks', () => {
    const component: Record<string, unknown> = {};
    const risks = component.risks ?? [];
    expect(risks).toEqual([]);
  });

  it('extracts issues array from component', () => {
    const component = { issues: [{ name: 'Issue 1', statusLabel: 'Open' }] };
    const issues = component.issues ?? [];
    expect(issues).toHaveLength(1);
    expect(issues[0].name).toBe('Issue 1');
  });
});
