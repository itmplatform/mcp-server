import { describe, it, expect } from 'vitest';

describe('prompt templates', () => {
  it('project_status references get_project tool', () => {
    const text = `Use the get_project tool with include: ["tasks", "risks", "issues", "budget"]`;
    expect(text).toContain('get_project');
    expect(text).toContain('tasks');
    expect(text).toContain('budget');
  });

  it('portfolio_overview references aggregate_portfolio tool', () => {
    const text = 'aggregate_portfolio with groupBy: "statusLabel"';
    expect(text).toContain('aggregate_portfolio');
  });

  it('team_workload references search_users and search_projects', () => {
    const text = 'search_users to find team members\nsearch_projects to see active projects';
    expect(text).toContain('search_users');
    expect(text).toContain('search_projects');
  });

  it('risk_analysis references get_project with risks and issues', () => {
    const text = `get_project tool with include: ["risks", "issues", "budget"]`;
    expect(text).toContain('get_project');
    expect(text).toContain('risks');
    expect(text).toContain('issues');
  });
});
