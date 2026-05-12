import { describe, it, expect } from 'vitest';
import { setupE2E, callTool } from './setup.js';

describe('risks and issues tools', () => {
  setupE2E();

  it('get_project_risks returns array', async () => {
    const searchResult = await callTool('search_projects', { limit: 1 });
    const items = JSON.parse(searchResult.result.content[0].text).items;
    if (items.length === 0) return;

    const result = await callTool('get_project_risks', { projectId: items[0].id });
    expect(result.result).toBeDefined();
    expect(result.result.isError).toBeFalsy();
    const risks = JSON.parse(result.result.content[0].text);
    expect(Array.isArray(risks)).toBe(true);
  });

  it('get_project_issues returns array', async () => {
    const searchResult = await callTool('search_projects', { limit: 1 });
    const items = JSON.parse(searchResult.result.content[0].text).items;
    if (items.length === 0) return;

    const result = await callTool('get_project_issues', { projectId: items[0].id });
    expect(result.result).toBeDefined();
    expect(result.result.isError).toBeFalsy();
    const issues = JSON.parse(result.result.content[0].text);
    expect(Array.isArray(issues)).toBe(true);
  });
});
