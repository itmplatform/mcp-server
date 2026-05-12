import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { buildSearchProjectsVariables, buildGetProjectProjection } from './projects.js';

describe('buildSearchProjectsVariables', () => {
  it('builds variables with name regex filter', () => {
    const vars = buildSearchProjectsVariables({ query: 'growth', limit: 5 });
    expect(vars.w.componentType).toEqual({ $eq: 'project' });
    expect(vars.w.name).toEqual({ $regex: 'growth', $options: 'i' });
    expect(vars.limit).toBe(5);
  });

  it('adds status filter when provided', () => {
    const vars = buildSearchProjectsVariables({ status: 'In Progress' });
    expect(vars.w.statusLabel).toEqual({ $regex: 'In Progress', $options: 'i' });
  });

  it('adds date range filters', () => {
    const vars = buildSearchProjectsVariables({ dateFrom: '2025-01-01', dateTo: '2025-12-31' });
    expect(vars.w.startDate).toEqual({ $gte: '2025-01-01' });
    expect(vars.w.endDate).toEqual({ $lte: '2025-12-31' });
  });

  it('clamps limit to 200', () => {
    const vars = buildSearchProjectsVariables({ limit: 500 });
    expect(vars.limit).toBe(200);
  });

  it('defaults limit to 50 when not provided', () => {
    const vars = buildSearchProjectsVariables({});
    expect(vars.limit).toBe(50);
  });

  it('includes sort when provided', () => {
    const vars = buildSearchProjectsVariables({ sort: 'name' });
    expect(vars.sort).toEqual({ name: 1 });
  });

  it('passes skip through', () => {
    const vars = buildSearchProjectsVariables({ skip: 10 });
    expect(vars.skip).toBe(10);
  });
});

describe('buildGetProjectProjection', () => {
  it('includes base fields with no includes', () => {
    const proj = buildGetProjectProjection([]);
    expect(proj.id).toBe(1);
    expect(proj.name).toBe(1);
    expect(proj.tasks).toBeUndefined();
  });

  it('adds tasks when included', () => {
    const proj = buildGetProjectProjection(['tasks']);
    expect(proj.tasks).toBe(1);
  });

  it('adds all four budget fields when budget included', () => {
    const proj = buildGetProjectProjection(['budget']);
    expect(proj.budgetTopDown).toBe(1);
    expect(proj.budgetBottomUp).toBe(1);
    expect(proj.budgetPeriodEndClose).toBe(1);
    expect(proj.budgetActual).toBe(1);
  });

  it('adds multiple includes', () => {
    const proj = buildGetProjectProjection(['tasks', 'risks', 'issues']);
    expect(proj.tasks).toBe(1);
    expect(proj.risks).toBe(1);
    expect(proj.issues).toBe(1);
  });
});
