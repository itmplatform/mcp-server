import { describe, it, expect } from 'vitest';
import { buildSearchProjectsVariables, buildGetProjectProjection, buildSubcomponentsSummary } from '../../../src/tools/projects.js';
import { buildSubcomponentCountPipeline } from '../../../src/tools/graphql-queries.js';

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

  it('does NOT include tasks when tasks is in include list', () => {
    const proj = buildGetProjectProjection(['tasks']);
    expect(proj.tasks).toBeUndefined();
  });

  it('does NOT include risks, issues, purchases, or revenues', () => {
    const proj = buildGetProjectProjection(['risks', 'issues', 'purchases', 'revenues']);
    expect(proj.risks).toBeUndefined();
    expect(proj.issues).toBeUndefined();
    expect(proj.purchases).toBeUndefined();
    expect(proj.revenues).toBeUndefined();
  });

  it('adds all four budget fields when budget included', () => {
    const proj = buildGetProjectProjection(['budget']);
    expect(proj.budgetTopDown).toBe(1);
    expect(proj.budgetBottomUp).toBe(1);
    expect(proj.budgetPeriodEndClose).toBe(1);
    expect(proj.budgetActual).toBe(1);
  });

  it('includes budget but not tasks when both requested', () => {
    const proj = buildGetProjectProjection(['tasks', 'budget']);
    expect(proj.tasks).toBeUndefined();
    expect(proj.budgetTopDown).toBe(1);
  });
});

describe('buildSubcomponentCountPipeline', () => {
  it('returns a valid aggregation pipeline', () => {
    const pipeline = buildSubcomponentCountPipeline(77934, ['tasks', 'risks', 'issues', 'purchases', 'revenues']);
    expect(Array.isArray(pipeline)).toBe(true);
    expect(pipeline.length).toBe(3);
  });

  it('matches the specific component ID', () => {
    const pipeline = buildSubcomponentCountPipeline(77934, ['tasks']);
    expect(pipeline[0]).toEqual({ $match: { id: { $eq: 77934 } } });
  });

  it('projects $size for each requested array field', () => {
    const pipeline = buildSubcomponentCountPipeline(100, ['tasks', 'risks']);
    const projectStage = pipeline[1]['$project'];
    expect(projectStage.taskCount).toEqual({ $size: { $ifNull: ['$tasks', []] } });
    expect(projectStage.riskCount).toEqual({ $size: { $ifNull: ['$risks', []] } });
  });

  it('ends with $limit: 1', () => {
    const pipeline = buildSubcomponentCountPipeline(1, ['tasks']);
    const last = pipeline[pipeline.length - 1];
    expect(last).toEqual({ $limit: 1 });
  });
});

describe('buildSubcomponentsSummary', () => {
  it('returns correct shape with tool names for projects', () => {
    const counts = { taskCount: 189, riskCount: 6, issueCount: 0, purchaseCount: 3, revenueCount: 1 };
    const summary = buildSubcomponentsSummary(counts);

    expect(summary.tasks).toEqual({ count: 189, tool: 'list_project_tasks' });
    expect(summary.risks).toEqual({ count: 6, tool: 'get_project_risks' });
    expect(summary.issues).toEqual({ count: 0, tool: 'get_project_issues' });
    expect(summary.purchases).toEqual({ count: 3, tool: 'get_project_purchases' });
    expect(summary.revenues).toEqual({ count: 1, tool: 'get_project_revenues' });
  });

  it('handles null counts gracefully', () => {
    const counts = { taskCount: null, riskCount: null, issueCount: null, purchaseCount: null, revenueCount: null };
    const summary = buildSubcomponentsSummary(counts as any);

    expect(summary.tasks.count).toBeNull();
    expect(summary.tasks.tool).toBe('list_project_tasks');
  });
});
