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

const COMPONENT_QUERY = 'query($id: ID!, $proj: JSON) { component(id: $id, project: $proj) }';
const COMPONENTS_QUERY = 'query($w: JSON, $proj: JSON) { components(where: $w, project: $proj) { items } }';

describe('projection validation -- heavy array fields', () => {
  const heavyFields = ['tasks', 'purchases', 'revenues', 'risks', 'issues', 'activities'];

  for (const field of heavyFields) {
    it(`rejects proj with "${field}: 1" on component query`, () => {
      const result = validateDataMartQuery({
        query: COMPONENT_QUERY,
        variables: { id: 1, proj: { [field]: 1 } },
      });
      expect(result.ok).toBe(false);
      expect(result.error?.message).toContain(field);
      expect(result.error?.message).toContain('dot notation');
    });

    it(`rejects proj with "${field}: 1" on components query`, () => {
      const result = validateDataMartQuery({
        query: COMPONENTS_QUERY,
        variables: { w: {}, proj: { [field]: 1 } },
      });
      expect(result.ok).toBe(false);
      expect(result.error?.message).toContain(field);
    });
  }

  it('allows dot-notation projection like "tasks.name": 1', () => {
    const result = validateDataMartQuery({
      query: COMPONENT_QUERY,
      variables: { id: 1, proj: { 'tasks.name': 1, 'tasks.id': 1 } },
    });
    expect(result.ok).toBe(true);
  });

  it('allows $slice on heavy array fields', () => {
    const result = validateDataMartQuery({
      query: COMPONENT_QUERY,
      variables: { id: 1, proj: { tasks: { $slice: [0, 10] } } },
    });
    expect(result.ok).toBe(true);
  });

  it('allows projections with no heavy array fields', () => {
    const result = validateDataMartQuery({
      query: COMPONENT_QUERY,
      variables: { id: 1, proj: { id: 1, name: 1, statusLabel: 1 } },
    });
    expect(result.ok).toBe(true);
  });

  it('does not affect aggregate pipelines', () => {
    const result = validateDataMartQuery({
      query: 'query($p: JSON!) { aggregateComponents(pipeline: $p) }',
      variables: { p: [{ $match: { id: { $eq: 1 } } }, { $project: { tasks: 1 } }, { $limit: 1 }] },
    });
    expect(result.ok).toBe(true);
  });

  it('allows mixed safe and dot-notation fields', () => {
    const result = validateDataMartQuery({
      query: COMPONENT_QUERY,
      variables: { id: 1, proj: { id: 1, name: 1, 'tasks.name': 1, budgetTopDown: 1 } },
    });
    expect(result.ok).toBe(true);
  });

  it('rejects when heavy field is among safe fields', () => {
    const result = validateDataMartQuery({
      query: COMPONENT_QUERY,
      variables: { id: 1, proj: { id: 1, name: 1, tasks: 1 } },
    });
    expect(result.ok).toBe(false);
    expect(result.error?.message).toContain('tasks');
  });

  it('accepts query with no proj variable', () => {
    const result = validateDataMartQuery({
      query: COMPONENT_QUERY,
      variables: { id: 1 },
    });
    expect(result.ok).toBe(true);
  });
});
