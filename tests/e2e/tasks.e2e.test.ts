import { describe, it, expect } from 'vitest';
import { setupE2E, callTool } from './setup.js';

describe('task tools', () => {
  setupE2E();

  it('list_project_tasks returns tasks array', async () => {
    const searchResult = await callTool('search_projects', { limit: 1 });
    const items = JSON.parse(searchResult.result.content[0].text).items;
    if (items.length === 0) return;

    const result = await callTool('list_project_tasks', { projectId: items[0].id });
    expect(result.result).toBeDefined();
    expect(result.result.isError).toBeFalsy();
    const tasks = JSON.parse(result.result.content[0].text);
    expect(Array.isArray(tasks)).toBe(true);
  });
});
