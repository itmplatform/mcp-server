import { describe, it, expect, vi } from 'vitest';
import { buildSubcomponentPagePipeline, buildSingleArrayCountPipeline } from '../../../src/tools/subcomponent-page.js';
import {
  buildSearchTasksPipeline,
  buildSearchTasksCountPipeline,
  registerTaskTools,
} from '../../../src/tools/tasks.js';

function register(clients: { rest?: any; datamart?: any }) {
  const registrations = new Map<string, any>();
  const server = {
    registerTool: vi.fn((name: string, config: any, handler: any) => {
      registrations.set(name, { config, handler });
    }),
  };
  registerTaskTools(server as any, clients as any);
  return registrations;
}

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

describe('search_tasks pipeline', () => {
  it('unwinds tasks across all projects with default paging', () => {
    const pipeline = buildSearchTasksPipeline({});
    expect(pipeline[0]).toEqual({ $match: { componentType: { $eq: 'project' } } });
    expect(pipeline[1]).toEqual({ $unwind: '$tasks' });
    expect(pipeline[pipeline.length - 2]).toEqual({ $skip: 0 });
    expect(pipeline[pipeline.length - 1]).toEqual({ $limit: 50 });
  });

  it('projects task with project context', () => {
    const pipeline = buildSearchTasksPipeline({});
    const projectStage = pipeline.find(stage => '$project' in stage) as Record<string, any>;
    expect(projectStage.$project).toEqual({ _id: 0, projectId: '$id', projectName: '$name', task: '$tasks' });
  });

  it('filters by name query, status, assignee, and category', () => {
    const pipeline = buildSearchTasksPipeline({
      query: 'kickoff',
      status: 'In progress',
      assignee: 'Daniel',
      category: 'Milestone',
    });
    const taskMatch = (pipeline[2] as Record<string, any>).$match;
    expect(taskMatch['tasks.name']).toEqual({ $regex: 'kickoff', $options: 'i' });
    expect(taskMatch['tasks.statusLabel']).toEqual({ $regex: 'In progress', $options: 'i' });
    expect(taskMatch['tasks.teamMemberDisplayNames']).toEqual({ $regex: 'Daniel', $options: 'i' });
    expect(taskMatch['tasks.category']).toEqual({ $eq: 'Milestone' });
  });

  it('omits the task $match stage when no filters are supplied', () => {
    const pipeline = buildSearchTasksPipeline({ limit: 10 });
    const matchStages = pipeline.filter(stage => '$match' in stage);
    expect(matchStages).toHaveLength(1);
  });

  it('filters by date range on task dates', () => {
    const pipeline = buildSearchTasksPipeline({ dateFrom: '2026-01-01', dateTo: '2026-06-30' });
    const taskMatch = (pipeline[2] as Record<string, any>).$match;
    expect(taskMatch['tasks.startDate']).toEqual({ $gte: '2026-01-01' });
    expect(taskMatch['tasks.endDate']).toEqual({ $lte: '2026-06-30' });
  });

  it('narrows to a single project when projectId is supplied', () => {
    const pipeline = buildSearchTasksPipeline({ projectId: 42 });
    expect(pipeline[0]).toEqual({ $match: { componentType: { $eq: 'project' }, id: { $eq: 42 } } });
  });

  it('clamps limit and applies skip', () => {
    const pipeline = buildSearchTasksPipeline({ limit: 9999, skip: 25 });
    expect(pipeline[pipeline.length - 2]).toEqual({ $skip: 25 });
    expect(pipeline[pipeline.length - 1]).toEqual({ $limit: 200 });
  });

  it('builds a count pipeline sharing the same filters', () => {
    const pipeline = buildSearchTasksCountPipeline({ query: 'kickoff' });
    expect(pipeline[0]).toEqual({ $match: { componentType: { $eq: 'project' } } });
    expect(pipeline[1]).toEqual({ $unwind: '$tasks' });
    expect(pipeline[2]).toEqual({ $match: { 'tasks.name': { $regex: 'kickoff', $options: 'i' } } });
    expect(pipeline[3]).toEqual({ $group: { _id: null, count: { $sum: 1 } } });
    expect(pipeline[4]).toEqual({ $limit: 1 });
  });
});

describe('search_tasks handler', () => {
  it('returns a page result with project context', async () => {
    const datamart = {
      query: vi.fn(async ({ variables }: any) => {
        const isCount = JSON.stringify(variables.p).includes('$group');
        return {
          aggregateComponents: isCount
            ? [{ count: 3 }]
            : [
              { projectId: 1, projectName: 'P1', task: { id: 11, name: 'A' } },
              { projectId: 2, projectName: 'P2', task: { id: 22, name: 'B' } },
            ],
        };
      }),
    };
    const result = await register({ datamart }).get('search_tasks')!.handler({ query: 'a' });
    const page = JSON.parse(result.content[0].text);
    expect(page.total).toBe(3);
    expect(page.hasMore).toBe(true);
    expect(page.items[0]).toEqual({ projectId: 1, projectName: 'P1', task: { id: 11, name: 'A' } });
  });
});

describe('get_task handler', () => {
  it('fetches the single task from v2 REST', async () => {
    const rest = { get: vi.fn().mockResolvedValue({ Id: 55, Name: 'Task A', KindId: 3 }) };
    const result = await register({ rest }).get('get_task')!.handler({ projectId: 100, taskId: 55 });
    expect(rest.get).toHaveBeenCalledWith('projects/100/tasks/55');
    expect(JSON.parse(result.content[0].text)).toEqual({ Id: 55, Name: 'Task A', KindId: 3 });
  });
});
