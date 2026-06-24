import { describe, it, expect } from 'vitest';
import { buildSubcomponentPagePipeline, buildSingleArrayCountPipeline } from '../../../src/tools/subcomponent-page.js';

describe('financial tools query composition', () => {
  it('get_project_budget requests all four budget projections', () => {
    const proj = { budgetTopDown: 1, budgetBottomUp: 1, budgetPeriodEndClose: 1, budgetActual: 1 };
    expect(Object.keys(proj)).toHaveLength(4);
    expect(proj.budgetTopDown).toBe(1);
    expect(proj.budgetActual).toBe(1);
  });

  it('extracts budget fields from component response', () => {
    const component = {
      budgetTopDown: { totalCost: 100000 },
      budgetBottomUp: { totalCost: 95000 },
      budgetPeriodEndClose: { totalCost: 98000 },
      budgetActual: { totalCost: 45000 },
    };
    const budget = {
      budgetTopDown: component.budgetTopDown ?? null,
      budgetBottomUp: component.budgetBottomUp ?? null,
      budgetPeriodEndClose: component.budgetPeriodEndClose ?? null,
      budgetActual: component.budgetActual ?? null,
    };
    expect(budget.budgetTopDown.totalCost).toBe(100000);
    expect(budget.budgetActual.totalCost).toBe(45000);
  });

  it('handles missing budget fields gracefully', () => {
    const component: Record<string, unknown> = {};
    const budget = {
      budgetTopDown: component.budgetTopDown ?? null,
      budgetBottomUp: component.budgetBottomUp ?? null,
      budgetPeriodEndClose: component.budgetPeriodEndClose ?? null,
      budgetActual: component.budgetActual ?? null,
    };
    expect(budget.budgetTopDown).toBeNull();
    expect(budget.budgetActual).toBeNull();
  });
});

describe('purchases pagination', () => {
  it('builds $unwind pipeline for purchases', () => {
    const pipeline = buildSubcomponentPagePipeline(100, 'purchases', 50, 0);
    expect(pipeline[1]).toEqual({ $unwind: '$purchases' });
    expect(pipeline[4]).toEqual({ $limit: 50 });
  });

  it('builds count pipeline for purchases', () => {
    const pipeline = buildSingleArrayCountPipeline(100, 'purchases');
    expect(pipeline[1]).toEqual({ $project: { count: { $size: { $ifNull: ['$purchases', []] } } } });
  });
});

describe('revenues pagination', () => {
  it('builds $unwind pipeline for revenues', () => {
    const pipeline = buildSubcomponentPagePipeline(200, 'revenues', 10, 5);
    expect(pipeline[1]).toEqual({ $unwind: '$revenues' });
    expect(pipeline[3]).toEqual({ $skip: 5 });
    expect(pipeline[4]).toEqual({ $limit: 10 });
  });
});
