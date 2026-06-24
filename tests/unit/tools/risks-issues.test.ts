import { describe, it, expect } from 'vitest';
import { buildSubcomponentPagePipeline, buildSingleArrayCountPipeline } from '../../../src/tools/subcomponent-page.js';

describe('risks pagination', () => {
  it('builds $unwind pipeline for risks', () => {
    const pipeline = buildSubcomponentPagePipeline(100, 'risks', 50, 0);
    expect(pipeline[1]).toEqual({ $unwind: '$risks' });
    expect(pipeline[2]).toEqual({ $replaceRoot: { newRoot: '$risks' } });
  });

  it('builds count pipeline for risks', () => {
    const pipeline = buildSingleArrayCountPipeline(100, 'risks');
    expect(pipeline[1]).toEqual({ $project: { count: { $size: { $ifNull: ['$risks', []] } } } });
  });
});

describe('issues pagination', () => {
  it('builds $unwind pipeline for issues', () => {
    const pipeline = buildSubcomponentPagePipeline(200, 'issues', 10, 5);
    expect(pipeline[1]).toEqual({ $unwind: '$issues' });
    expect(pipeline[3]).toEqual({ $skip: 5 });
    expect(pipeline[4]).toEqual({ $limit: 10 });
  });

  it('builds count pipeline for issues', () => {
    const pipeline = buildSingleArrayCountPipeline(200, 'issues');
    expect(pipeline[1]).toEqual({ $project: { count: { $size: { $ifNull: ['$issues', []] } } } });
  });
});
