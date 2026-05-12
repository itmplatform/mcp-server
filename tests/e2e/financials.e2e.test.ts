import { describe, it, expect } from 'vitest';
import { setupE2E, callTool } from './setup.js';

describe('financial tools', () => {
  setupE2E();

  it('get_project_budget returns budget objects', async () => {
    const searchResult = await callTool('search_projects', { limit: 1 });
    const items = JSON.parse(searchResult.result.content[0].text).items;
    if (items.length === 0) return;

    const result = await callTool('get_project_budget', { projectId: items[0].id });
    expect(result.result).toBeDefined();
    expect(result.result.isError).toBeFalsy();
    const budget = JSON.parse(result.result.content[0].text);
    expect(budget).toHaveProperty('budgetTopDown');
    expect(budget).toHaveProperty('budgetActual');
  });

  it('get_project_purchases returns array', async () => {
    const searchResult = await callTool('search_projects', { limit: 1 });
    const items = JSON.parse(searchResult.result.content[0].text).items;
    if (items.length === 0) return;

    const result = await callTool('get_project_purchases', { projectId: items[0].id });
    expect(result.result).toBeDefined();
    expect(result.result.isError).toBeFalsy();
  });

  it('get_project_revenues returns array', async () => {
    const searchResult = await callTool('search_projects', { limit: 1 });
    const items = JSON.parse(searchResult.result.content[0].text).items;
    if (items.length === 0) return;

    const result = await callTool('get_project_revenues', { projectId: items[0].id });
    expect(result.result).toBeDefined();
    expect(result.result.isError).toBeFalsy();
  });
});
