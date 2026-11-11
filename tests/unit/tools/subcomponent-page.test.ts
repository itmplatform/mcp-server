import { describe, it, expect, vi } from 'vitest';
import {
  buildSubcomponentPagePipeline,
  buildSingleArrayCountPipeline,
  buildPageResult,
  fitPageToBudget,
  pageToolResult,
  serializePage,
} from '../../../src/tools/subcomponent-page.js';
import { isResultTrimmed } from '../../../src/validation/result-size-guard.js';

describe('buildSubcomponentPagePipeline', () => {
  it('builds $unwind pipeline for a given array field', () => {
    const pipeline = buildSubcomponentPagePipeline(100, 'tasks', 50, 0);

    expect(pipeline[0]).toEqual({ $match: { id: { $eq: 100 } } });
    expect(pipeline[1]).toEqual({ $unwind: '$tasks' });
    expect(pipeline[2]).toEqual({ $project: { _id: 0, tasks: 1 } });
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

describe('buildSubcomponentPagePipeline with fields', () => {
  it('projects only the requested fields plus id', () => {
    const pipeline = buildSubcomponentPagePipeline(100, 'tasks', 50, 0, ['name', 'statusLabel']);
    expect(pipeline[2]).toEqual({ $project: { _id: 0, 'tasks.id': 1, 'tasks.name': 1, 'tasks.statusLabel': 1 } });
  });

  it('projects the whole item when fields is empty or absent', () => {
    expect(buildSubcomponentPagePipeline(100, 'tasks', 50, 0, [])[2]).toEqual({ $project: { _id: 0, tasks: 1 } });
    expect(buildSubcomponentPagePipeline(100, 'tasks', 50, 0, undefined)[2]).toEqual({ $project: { _id: 0, tasks: 1 } });
  });
});

describe('fitPageToBudget', () => {
  const item = (id: number, size: number) => ({ id, pad: 'x'.repeat(size) });
  const bytes = (page: unknown) => Buffer.byteLength(serializePage(page), 'utf8');

  it('returns a page within the budget unchanged', () => {
    const page = buildPageResult([item(1, 10), item(2, 10)], 2, 50, 0);
    expect(fitPageToBudget(page, 10_000)).toBe(page);
  });

  it('drops whole items from the end and reports the effective limit', () => {
    const items = Array.from({ length: 50 }, (_, i) => item(i, 1_000));
    const page = buildPageResult(items, 120, 50, 10);
    const fitted = fitPageToBudget(page, 10_000, { hint: 'continue' });

    expect(fitted.items.length).toBeGreaterThan(0);
    expect(fitted.items.length).toBeLessThan(50);
    expect(fitted.items).toEqual(items.slice(0, fitted.items.length));
    expect(fitted.limit).toBe(fitted.items.length);
    expect(fitted.requestedLimit).toBe(50);
    expect(fitted.nextSkip).toBe(10 + fitted.items.length);
    expect(fitted.skip).toBe(10);
    expect(fitted.total).toBe(120);
    expect(fitted.hasMore).toBe(true);
    expect(fitted.trimmedForSize).toBe(true);
    expect(fitted.hint).toBe('continue');
    expect(bytes(fitted)).toBeLessThanOrEqual(10_000);
  });

  it('reports hasMore=false when the trimmed page reaches the end of the collection', () => {
    const page = buildPageResult([item(1, 50_000)], 1, 50, 0);
    const fitted = fitPageToBudget(page, 10_000, { shrinkItem: () => ({ id: 1 }) });
    expect(fitted.items).toEqual([{ id: 1 }]);
    expect(fitted.hasMore).toBe(false);
    expect(fitted.trimmedForSize).toBe(true);
  });

  it('shrinks a first item that exceeds the budget on its own', () => {
    const page = buildPageResult([item(1, 50_000), item(2, 10)], 2, 50, 0);
    const shrinkItem = vi.fn((it: any, maxBytes: number) => ({ id: it.id, maxBytes }));
    const fitted = fitPageToBudget(page, 10_000, { shrinkItem });

    expect(shrinkItem).toHaveBeenCalledTimes(1);
    expect(fitted.items).toHaveLength(1);
    expect((fitted.items[0] as any).id).toBe(1);
    expect((fitted.items[0] as any).maxBytes).toBeLessThan(10_000);
    expect(fitted.nextSkip).toBe(1);
  });

  it('returns an oversized first item unchanged when no shrinker is given', () => {
    const big = item(1, 50_000);
    const fitted = fitPageToBudget(buildPageResult([big], 1, 50, 0), 10_000);
    expect(fitted.items).toEqual([big]);
  });
});

describe('pageToolResult', () => {
  it('serializes the page as compact JSON', () => {
    const result = pageToolResult(buildPageResult([{ id: 1 }], 1, 50, 0));
    expect(result.content[0].text).not.toContain('\n');
    expect(JSON.parse(result.content[0].text).items).toEqual([{ id: 1 }]);
    expect(isResultTrimmed(result)).toBe(false);
  });

  it('marks the result as trimmed when the page was trimmed for size', () => {
    const items = Array.from({ length: 20 }, (_, i) => ({ id: i, pad: 'x'.repeat(1_000) }));
    const fitted = fitPageToBudget(buildPageResult(items, 20, 50, 0), 5_000);
    expect(isResultTrimmed(pageToolResult(fitted))).toBe(true);
  });
});
