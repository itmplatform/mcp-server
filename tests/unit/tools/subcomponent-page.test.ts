import { describe, it, expect, vi } from 'vitest';
import { buildSubcomponentPagePipeline, buildSingleArrayCountPipeline, buildPageResult } from '../../../src/tools/subcomponent-page.js';

describe('buildSubcomponentPagePipeline', () => {
  it('builds $unwind pipeline for a given array field', () => {
    const pipeline = buildSubcomponentPagePipeline(100, 'tasks', 50, 0);

    expect(pipeline[0]).toEqual({ $match: { id: { $eq: 100 } } });
    expect(pipeline[1]).toEqual({ $unwind: '$tasks' });
    expect(pipeline[2]).toEqual({ $replaceRoot: { newRoot: '$tasks' } });
    expect(pipeline[3]).toEqual({ $skip: 0 });
    expect(pipeline[4]).toEqual({ $limit: 50 });
  });

  it('applies skip and limit correctly', () => {
    const pipeline = buildSubcomponentPagePipeline(200, 'risks', 10, 20);

    expect(pipeline[3]).toEqual({ $skip: 20 });
    expect(pipeline[4]).toEqual({ $limit: 10 });
  });
});

describe('buildSingleArrayCountPipeline', () => {
  it('counts a single array field using $size + $ifNull', () => {
    const pipeline = buildSingleArrayCountPipeline(100, 'tasks');

    expect(pipeline[0]).toEqual({ $match: { id: { $eq: 100 } } });
    expect(pipeline[1]).toEqual({ $project: { count: { $size: { $ifNull: ['$tasks', []] } } } });
    expect(pipeline[2]).toEqual({ $limit: 1 });
  });
});

describe('buildPageResult', () => {
  it('returns correct shape with hasMore=true when more items exist', () => {
    const items = Array.from({ length: 50 }, (_, i) => ({ id: i }));
    const result = buildPageResult(items, 189, 50, 0);

    expect(result.items).toBe(items);
    expect(result.total).toBe(189);
    expect(result.limit).toBe(50);
    expect(result.skip).toBe(0);
    expect(result.hasMore).toBe(true);
  });

  it('returns hasMore=false when at the end', () => {
    const items = Array.from({ length: 39 }, (_, i) => ({ id: i }));
    const result = buildPageResult(items, 189, 50, 150);

    expect(result.hasMore).toBe(false);
  });

  it('handles empty items gracefully', () => {
    const result = buildPageResult([], 0, 50, 0);

    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.hasMore).toBe(false);
  });
});
