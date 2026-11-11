import { describe, it, expect, vi } from 'vitest';
import { buildSubcomponentPagePipeline, buildSingleArrayCountPipeline } from '../../../src/tools/subcomponent-page.js';
import {
  buildSearchTasksPipeline,
  buildSearchTasksCountPipeline,
  registerTaskTools,
  validateTaskFields,
  shrinkTaskProgressReports,
} from '../../../src/tools/tasks.js';
import { PAGE_BUDGET_BYTES } from '../../../src/validation/result-size-guard.js';

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

describe('search_tasks sort and fields', () => {
  it('sorts by end date with the task id as tie-breaker', () => {
    const pipeline = buildSearchTasksPipeline({});
    const sortStage = pipeline.find(stage => '$sort' in stage) as Record<string, any>;
    expect(sortStage.$sort).toEqual({ 'task.endDate': 1, 'task.id': 1 });
  });

  it('narrows the task to the requested fields plus id after paging', () => {
    const pipeline = buildSearchTasksPipeline({ fields: ['name', 'endDate'] });
    expect(pipeline[pipeline.length - 1]).toEqual({
      $project: { projectId: 1, projectName: 1, 'task.id': 1, 'task.name': 1, 'task.endDate': 1 },
    });
    expect(pipeline[pipeline.length - 2]).toEqual({ $limit: 50 });
  });
});

describe('validateTaskFields', () => {
  it('accepts plain and dotted field names', () => {
    expect(() => validateTaskFields(['name', 'assignments.displayName'])).not.toThrow();
  });

  it('rejects operators and malformed names with an actionable message', () => {
    expect(() => validateTaskFields(['$where'])).toThrow(/Invalid field name "\$where".*itm:\/\/schema\/tasks/);
    expect(() => validateTaskFields(['name.'])).toThrow(/Invalid field name/);
    expect(() => validateTaskFields(['a b'])).toThrow(/Invalid field name/);
  });
});

describe('shrinkTaskProgressReports', () => {
  const reports = Array.from({ length: 300 }, (_, i) => ({
    id: i,
    reportDate: new Date(Date.UTC(2025, 0, 1 + i)).toISOString(),
    shortDescription: 'y'.repeat(300),
  }));

  it('keeps the newest progress reports that fit and states the total', () => {
    const shuffled = [...reports.slice(150), ...reports.slice(0, 150)];
    const task = { id: 7, name: 'Heavy', progressReports: shuffled };
    const shrunk = shrinkTaskProgressReports(task, 20_000) as any;

    expect(Buffer.byteLength(JSON.stringify(shrunk))).toBeLessThanOrEqual(20_000);
    expect(shrunk.id).toBe(7);
    expect(shrunk.name).toBe('Heavy');
    expect(shrunk.progressReportsTotal).toBe(300);
    expect(shrunk.progressReportsTruncated).toBe(true);
    expect(shrunk.progressReports.length).toBeGreaterThan(0);
    expect(shrunk.progressReports[0].id).toBe(299);
    const dates = shrunk.progressReports.map((r: any) => r.reportDate);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it('shrinks the task inside a search_tasks item', () => {
    const item = { projectId: 1, projectName: 'P', task: { id: 7, progressReports: reports } };
    const shrunk = shrinkTaskProgressReports(item, 20_000) as any;
    expect(shrunk.projectId).toBe(1);
    expect(shrunk.task.progressReportsTotal).toBe(300);
    expect(Buffer.byteLength(JSON.stringify(shrunk))).toBeLessThanOrEqual(20_000);
  });

  it('returns a task without progress reports unchanged', () => {
    const task = { id: 1, name: 'x'.repeat(30_000) };
    expect(shrinkTaskProgressReports(task, 20_000)).toBe(task);
  });
});

describe('task tools return pages that fit the size budget', () => {
  const heavyTask = (id: number) => ({
    id,
    name: `Task ${id}`,
    progressReports: Array.from({ length: 20 }, (_, i) => ({ id: i, reportDate: '2026-01-01', shortDescription: 'z'.repeat(400) })),
  });

  it('list_project_tasks trims the page instead of failing and passes fields to DataMart', async () => {
    const datamart = {
      query: vi.fn(async ({ variables }: any) => {
        const isCount = JSON.stringify(variables.p).includes('$size');
        return { aggregateComponents: isCount ? [{ count: 200 }] : Array.from({ length: 50 }, (_, i) => ({ tasks: heavyTask(i) })) };
      }),
    };
    const tools = register({ datamart });
    const result = await tools.get('list_project_tasks')!.handler({ projectId: 9 });
    const text = result.content[0].text;
    const page = JSON.parse(text);

    expect(Buffer.byteLength(text)).toBeLessThanOrEqual(PAGE_BUDGET_BYTES);
    expect(page.trimmedForSize).toBe(true);
    expect(page.requestedLimit).toBe(50);
    expect(page.limit).toBe(page.items.length);
    expect(page.nextSkip).toBe(page.items.length);
    expect(page.hint).toMatch(/fields/);

    await tools.get('list_project_tasks')!.handler({ projectId: 9, fields: ['name'] });
    const pagePipelines = datamart.query.mock.calls
      .map((c: any) => c[0].variables.p)
      .filter((p: any) => JSON.stringify(p).includes('$unwind'));
    expect(pagePipelines[pagePipelines.length - 1][2]).toEqual({ $project: { _id: 0, 'tasks.id': 1, 'tasks.name': 1 } });
  });

  it('search_tasks trims the page instead of failing', async () => {
    const datamart = {
      query: vi.fn(async ({ variables }: any) => {
        const isCount = JSON.stringify(variables.p).includes('$group');
        return {
          aggregateComponents: isCount
            ? [{ count: 500 }]
            : Array.from({ length: 200 }, (_, i) => ({ projectId: 1, projectName: 'P', task: heavyTask(i) })),
        };
      }),
    };
    const result = await register({ datamart }).get('search_tasks')!.handler({ limit: 200 });
    const page = JSON.parse(result.content[0].text);
    expect(Buffer.byteLength(result.content[0].text)).toBeLessThanOrEqual(PAGE_BUDGET_BYTES);
    expect(page.trimmedForSize).toBe(true);
    expect(page.requestedLimit).toBe(200);
    expect(page.total).toBe(500);
  });

  it('rejects invalid field names before querying DataMart', async () => {
    const datamart = { query: vi.fn() };
    await expect(register({ datamart }).get('search_tasks')!.handler({ fields: ['$where'] })).rejects.toThrow(/Invalid field name/);
    expect(datamart.query).not.toHaveBeenCalled();
  });
});
