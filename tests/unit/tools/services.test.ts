import { describe, it, expect } from 'vitest';
import { buildSearchServicesVariables } from '../../../src/tools/services.js';

describe('buildSearchServicesVariables', () => {
  it('uses componentType service', () => {
    const vars = buildSearchServicesVariables({});
    expect(vars.w.componentType).toEqual({ $eq: 'service' });
  });

  it('builds name regex filter', () => {
    const vars = buildSearchServicesVariables({ query: 'support' });
    expect(vars.w.name).toEqual({ $regex: 'support', $options: 'i' });
  });

  it('clamps limit to 200', () => {
    const vars = buildSearchServicesVariables({ limit: 999 });
    expect(vars.limit).toBe(200);
  });
});
