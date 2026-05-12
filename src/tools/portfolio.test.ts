import { describe, it, expect } from 'vitest';
import { buildAggregationPipeline } from './portfolio.js';

describe('buildAggregationPipeline', () => {
  it('builds a pipeline with $match, $group, $sort, $limit', () => {
    const pipeline = buildAggregationPipeline({
      groupBy: 'statusLabel',
      metrics: ['count', 'avgProgress'],
    });

    expect(pipeline).toHaveLength(4);
    expect(pipeline[0]).toEqual({ $match: { componentType: { $eq: 'project' } } });
    expect(pipeline[1]).toEqual({
      $group: {
        _id: '$statusLabel',
        count: { $sum: 1 },
        avgProgress: { $avg: '$percentComplete' },
      },
    });
    expect(pipeline[2]).toEqual({ $sort: { count: -1 } });
    expect(pipeline[3]).toEqual({ $limit: 50 });
  });

  it('merges additional filter into $match', () => {
    const pipeline = buildAggregationPipeline({
      groupBy: 'methodology',
      metrics: ['count'],
      filter: { isClosed: { $eq: false } },
    });
    expect(pipeline[0]).toEqual({
      $match: {
        componentType: { $eq: 'project' },
        isClosed: { $eq: false },
      },
    });
  });

  it('clamps limit to 1000', () => {
    const pipeline = buildAggregationPipeline({
      groupBy: 'statusLabel',
      metrics: ['count'],
      limit: 5000,
    });
    const limitStage = pipeline.find(s => '$limit' in s) as Record<string, unknown>;
    expect(limitStage.$limit).toBe(1000);
  });

  it('uses custom limit when within bounds', () => {
    const pipeline = buildAggregationPipeline({
      groupBy: 'statusLabel',
      metrics: ['count'],
      limit: 10,
    });
    const limitStage = pipeline.find(s => '$limit' in s) as Record<string, unknown>;
    expect(limitStage.$limit).toBe(10);
  });

  it('includes totalBudget metric', () => {
    const pipeline = buildAggregationPipeline({
      groupBy: 'statusLabel',
      metrics: ['totalBudget'],
    });
    const groupStage = pipeline[1] as Record<string, unknown>;
    const group = groupStage.$group as Record<string, unknown>;
    expect(group.totalBudget).toEqual({ $sum: '$budgetTopDown.totalCost' });
  });
});
