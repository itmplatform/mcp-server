import { describe, it, expect } from 'vitest';
import { setupE2E, callTool } from './setup.js';

describe('project tools', () => {
  setupE2E();

  it('search_projects returns results', async () => {
    const result = await callTool('search_projects', { limit: 5 });
    expect(result.result).toBeDefined();
    expect(result.result.isError).toBeFalsy();
    const content = JSON.parse(result.result.content[0].text);
    expect(content.items).toBeDefined();
    expect(content.total).toBeGreaterThanOrEqual(0);
  });

  it('search_projects with query filter', async () => {
    const result = await callTool('search_projects', { query: 'test', limit: 3 });
    expect(result.result).toBeDefined();
    expect(result.result.isError).toBeFalsy();
  });

  it('get_project returns project details', async () => {
    const searchResult = await callTool('search_projects', { limit: 1 });
    const items = JSON.parse(searchResult.result.content[0].text).items;
    if (items.length === 0) return;

    const projectId = items[0].id;
    const result = await callTool('get_project', { projectId, include: ['tasks', 'budget'] });
    expect(result.result).toBeDefined();
    expect(result.result.isError).toBeFalsy();
  });
});
