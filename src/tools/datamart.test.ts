import { describe, it, expect, vi } from 'vitest';
import { buildDataMartQueryBody } from './datamart.js';
import { validateDataMartQuery } from '../validation/query-validator.js';

describe('buildDataMartQueryBody', () => {
  it('builds components query with where and limit', () => {
    const body = buildDataMartQueryBody({
      operation: 'components',
      where: { componentType: { $eq: 'project' } },
      project: { id: 1, name: 1 },
      limit: 10,
    });
    expect(body.query).toContain('components');
    expect(body.variables.w).toEqual({ componentType: { $eq: 'project' } });
    expect(body.variables.limit).toBe(10);
  });

  it('builds component query with ID', () => {
    const body = buildDataMartQueryBody({
      operation: 'component',
      id: 123,
      project: { name: 1, tasks: 1 },
    });
    expect(body.query).toContain('component');
    expect(body.variables.id).toBe(123);
    expect(body.variables.proj).toEqual({ name: 1, tasks: 1 });
  });

  it('builds aggregateComponents query with pipeline', () => {
    const body = buildDataMartQueryBody({
      operation: 'aggregateComponents',
      pipeline: [
        { $match: { componentType: { $eq: 'project' } } },
        { $group: { _id: '$statusLabel', count: { $sum: 1 } } },
        { $limit: 10 },
      ],
    });
    expect(body.query).toContain('aggregateComponents');
    expect(body.variables.p).toHaveLength(3);
  });

  it('clamps components limit to 200', () => {
    const body = buildDataMartQueryBody({
      operation: 'components',
      limit: 999,
    });
    expect(body.variables.limit).toBe(200);
  });
});

describe('query_datamart validation integration', () => {
  it('rejects $lookup in pipeline', () => {
    const result = validateDataMartQuery({
      query: 'query($p: JSON!) { aggregateComponents(pipeline: $p) }',
      variables: {
        p: [{ $lookup: { from: 'x', localField: 'y', foreignField: 'z', as: 'a' } }],
      },
    });
    expect(result.ok).toBe(false);
    expect(result.error?.message).toContain('$lookup');
  });

  it('rejects $where in filter', () => {
    const result = validateDataMartQuery({
      query: 'query($w: JSON) { components(where: $w) { items } }',
      variables: { w: { $where: 'this.x > 1' } },
    });
    expect(result.ok).toBe(false);
    expect(result.error?.message).toContain('$where');
  });

  it('accepts valid operators', () => {
    const result = validateDataMartQuery({
      query: 'query($w: JSON) { components(where: $w) { items } }',
      variables: { w: { name: { $regex: 'test', $options: 'i' } } },
    });
    expect(result.ok).toBe(true);
  });
});
