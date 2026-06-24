import { describe, it, expect } from 'vitest';
import { buildSearchServicesVariables, buildGetServiceProjection, buildServiceSubcomponentsSummary } from '../../../src/tools/services.js';

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

describe('buildGetServiceProjection', () => {
  it('does NOT include activities, purchases, or revenues', () => {
    const proj = buildGetServiceProjection(['activities', 'purchases', 'revenues']);
    expect(proj.activities).toBeUndefined();
    expect(proj.purchases).toBeUndefined();
    expect(proj.revenues).toBeUndefined();
  });

  it('includes budget fields when budget is requested', () => {
    const proj = buildGetServiceProjection(['budget']);
    expect(proj.budgetTopDown).toBe(1);
    expect(proj.budgetBottomUp).toBe(1);
    expect(proj.budgetActual).toBe(1);
  });

  it('includes base fields with no includes', () => {
    const proj = buildGetServiceProjection([]);
    expect(proj.id).toBe(1);
    expect(proj.name).toBe(1);
  });
});

describe('buildServiceSubcomponentsSummary', () => {
  it('returns correct shape with tool names for services', () => {
    const counts = { activityCount: 42, purchaseCount: 5, revenueCount: 3 };
    const summary = buildServiceSubcomponentsSummary(counts);

    expect(summary.activities).toEqual({ count: 42, tool: 'list_service_activities' });
    expect(summary.purchases).toEqual({ count: 5, tool: 'get_service_purchases' });
    expect(summary.revenues).toEqual({ count: 3, tool: 'get_service_revenues' });
  });

  it('handles null counts gracefully', () => {
    const summary = buildServiceSubcomponentsSummary({} as any);
    expect(summary.activities.count).toBeNull();
    expect(summary.activities.tool).toBe('list_service_activities');
  });
});
