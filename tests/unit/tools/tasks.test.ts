import { describe, it, expect, vi } from 'vitest';
import { buildSubcomponentPagePipeline, buildSingleArrayCountPipeline } from '../../../src/tools/subcomponent-page.js';

describe('list_project_tasks pagination', () => {
  it('builds $unwind pipeline for tasks', () => {
    const pipeline = buildSubcomponentPagePipeline(123, 'tasks', 50, 0);
    expect(pipeline[0]).toEqual({ $match: { id: { $eq: 123 } } });
    expect(pipeline[1]).toEqual({ $unwind: '$tasks' });
    expect(pipeline[4]).toEqual({ $limit: 50 });
  });

  it('applies custom skip and limit', () => {
    const pipeline = buildSubcomponentPagePipeline(123, 'tasks', 10, 20);
    expect(pipeline[3]).toEqual({ $skip: 20 });
    expect(pipeline[4]).toEqual({ $limit: 10 });
  });

  it('builds count pipeline for tasks', () => {
    const pipeline = buildSingleArrayCountPipeline(123, 'tasks');
    expect(pipeline[0]).toEqual({ $match: { id: { $eq: 123 } } });
    expect(pipeline[1]).toEqual({ $project: { count: { $size: { $ifNull: ['$tasks', []] } } } });
  });
});
