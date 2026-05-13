import { describe, it, expect } from 'vitest';
import { validateDataMartQuery } from '../../../src/validation/query-validator.js';

describe('query-validator smoke test', () => {
  it('accepts a valid components query', () => {
    const result = validateDataMartQuery({
      query: 'query($w: JSON) { components(where: $w) { items } }',
      variables: { w: { componentType: { $eq: 'project' } } },
    });
    expect(result.ok).toBe(true);
  });

  it('rejects a disallowed operator', () => {
    const result = validateDataMartQuery({
      query: 'query($w: JSON) { components(where: $w) { items } }',
      variables: { w: { $where: 'this.x > 1' } },
    });
    expect(result.ok).toBe(false);
    expect(result.error?.message).toContain('$where');
  });
});
