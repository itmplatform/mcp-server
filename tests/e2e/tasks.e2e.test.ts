import { describe, it, expect } from 'vitest';
import { setupE2E, callTool } from './setup.js';

const RESULT_HARD_BYTES = 100_000;

function parse(result: any): any {
  expect(result.result).toBeDefined();
  expect(result.result.isError).toBeFalsy();
  return JSON.parse(result.result.content[0].text);
}

async function findProjectWithMostTasks(): Promise<{ id: number; taskCount: number } | undefined> {
  const result = await callTool('query_datamart', {
    operation: 'aggregateComponents',
    pipeline: [
      { $match: { componentType: 'project' } },
      { $project: { _id: 0, id: 1, taskCount: { $size: { $ifNull: ['$tasks', []] } } } },
      { $sort: { taskCount: -1 } },
      { $limit: 1 },
    ],
  });
  const rows = parse(result);
  const list = Array.isArray(rows) ? rows : rows.aggregateComponents ?? rows.items ?? [];
  return list[0];
}

describe('task tools', () => {
  setupE2E();

  it('list_project_tasks returns a paginated tasks page', async () => {
    const searchResult = await callTool('search_projects', { limit: 1 });
    const items = JSON.parse(searchResult.result.content[0].text).items;
    if (items.length === 0) return;

    const result = await callTool('list_project_tasks', { projectId: items[0].id });
    const page = parse(result);
    expect(Array.isArray(page.items)).toBe(true);
    expect(page.total).toBeGreaterThanOrEqual(0);
  });

  it('list_project_tasks with limit 200 pages to the end through skip + limit without repeating or skipping tasks', async () => {
    const project = await findProjectWithMostTasks();
    if (!project || project.taskCount === 0) return;

    const seen: number[] = [];
    let skip = 0;
    for (let call = 0; call < 50; call++) {
      const result = await callTool('list_project_tasks', { projectId: project.id, limit: 200, skip });
      expect(Buffer.byteLength(result.result.content[0].text)).toBeLessThan(RESULT_HARD_BYTES);
      const page = parse(result);
      if (page.trimmedForSize) expect(page.limit).toBe(page.items.length);
      seen.push(...page.items.map((task: any) => task.id));
      if (!page.hasMore) break;
      skip = page.trimmedForSize ? page.nextSkip : skip + page.limit;
    }

    expect(seen).toHaveLength(project.taskCount);
    expect(new Set(seen).size).toBe(project.taskCount);
  });

  it('list_project_tasks with fields returns only the requested fields plus id', async () => {
    const project = await findProjectWithMostTasks();
    if (!project || project.taskCount === 0) return;

    const page = parse(await callTool('list_project_tasks', { projectId: project.id, fields: ['name', 'statusLabel'] }));
    expect(page.items.length).toBeGreaterThan(0);
    for (const task of page.items) {
      expect(Object.keys(task).sort()).toEqual(expect.arrayContaining(['id']));
      expect(Object.keys(task).every(key => ['id', 'name', 'statusLabel'].includes(key))).toBe(true);
    }
  });

  it('search_tasks with limit 200 stays under the size limit and fields narrows the task', async () => {
    const full = await callTool('search_tasks', { limit: 200 });
    expect(Buffer.byteLength(full.result.content[0].text)).toBeLessThan(RESULT_HARD_BYTES);
    const fullPage = parse(full);
    if (fullPage.trimmedForSize) {
      expect(fullPage.limit).toBe(fullPage.items.length);
      expect(fullPage.nextSkip).toBe(fullPage.items.length);
    }

    const narrow = parse(await callTool('search_tasks', { limit: 20, fields: ['name', 'endDate'] }));
    for (const item of narrow.items) {
      expect(Object.keys(item).sort()).toEqual(['projectId', 'projectName', 'task']);
      expect(Object.keys(item.task).every((key: string) => ['id', 'name', 'endDate'].includes(key))).toBe(true);
    }
  });

  it('search_tasks rejects an invalid field name with an actionable error', async () => {
    const result = await callTool('search_tasks', { fields: ['$where'] });
    const failed = result.error !== undefined || result.result?.isError === true;
    expect(failed).toBe(true);
    expect(JSON.stringify(result)).toContain('Invalid field name');
  });
});
