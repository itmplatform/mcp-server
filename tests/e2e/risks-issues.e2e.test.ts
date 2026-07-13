import { describe, it, expect } from 'vitest';
import { setupE2E, callTool } from './setup.js';

describe('risks and issues tools', () => {
  setupE2E();

  it('get_project_risks returns a paginated risks page', async () => {
    const searchResult = await callTool('search_projects', { limit: 1 });
    const items = JSON.parse(searchResult.result.content[0].text).items;
    if (items.length === 0) return;

    const result = await callTool('get_project_risks', { projectId: items[0].id });
    expect(result.result).toBeDefined();
    expect(result.result.isError).toBeFalsy();
    const page = JSON.parse(result.result.content[0].text);
    expect(Array.isArray(page.items)).toBe(true);
    expect(page.total).toBeGreaterThanOrEqual(0);
  });

  it('get_project_issues returns a paginated issues page', async () => {
    const searchResult = await callTool('search_projects', { limit: 1 });
    const items = JSON.parse(searchResult.result.content[0].text).items;
    if (items.length === 0) return;

    const result = await callTool('get_project_issues', { projectId: items[0].id });
    expect(result.result).toBeDefined();
    expect(result.result.isError).toBeFalsy();
    const page = JSON.parse(result.result.content[0].text);
    expect(Array.isArray(page.items)).toBe(true);
    expect(page.total).toBeGreaterThanOrEqual(0);
  });
});
