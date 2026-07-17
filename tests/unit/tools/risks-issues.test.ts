import { describe, it, expect, vi } from 'vitest';
import { buildSubcomponentPagePipeline, buildSingleArrayCountPipeline } from '../../../src/tools/subcomponent-page.js';
import { registerRisksIssuesTools } from '../../../src/tools/risks-issues.js';

function register(clients: { rest?: any; datamart?: any }) {
  const registrations = new Map<string, any>();
  const server = {
    registerTool: vi.fn((name: string, config: any, handler: any) => {
      registrations.set(name, { config, handler });
    }),
  };
  registerRisksIssuesTools(server as any, clients as any);
  return registrations;
}

describe('risks pagination', () => {
  it('builds $unwind pipeline for risks', () => {
    const pipeline = buildSubcomponentPagePipeline(100, 'risks', 50, 0);
    expect(pipeline[1]).toEqual({ $unwind: '$risks' });
    expect(pipeline[2]).toEqual({ $project: { _id: 0, risks: 1 } });
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

describe('get_risk handler', () => {
  it('fetches the single risk from v2 REST', async () => {
    const rest = { get: vi.fn().mockResolvedValue({ Id: 7, Name: 'Risk A', MitigationPlan: 'Plan' }) };
    const result = await register({ rest }).get('get_risk')!.handler({ projectId: 100, riskId: 7 });
    expect(rest.get).toHaveBeenCalledWith('projects/100/risks/7');
    expect(JSON.parse(result.content[0].text)).toEqual({ Id: 7, Name: 'Risk A', MitigationPlan: 'Plan' });
  });
});

describe('get_issue handler', () => {
  it('fetches the single issue from v2 REST', async () => {
    const rest = { get: vi.fn().mockResolvedValue({ Id: 9, Name: 'Issue A', FinalResolution: 'Fixed' }) };
    const result = await register({ rest }).get('get_issue')!.handler({ projectId: 100, issueId: 9 });
    expect(rest.get).toHaveBeenCalledWith('projects/100/issues/9');
    expect(JSON.parse(result.content[0].text)).toEqual({ Id: 9, Name: 'Issue A', FinalResolution: 'Fixed' });
  });
});
