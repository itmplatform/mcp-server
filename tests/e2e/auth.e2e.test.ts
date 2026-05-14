import { describe, it, expect } from 'vitest';
import { setupE2E, listTools } from './setup.js';

describe('auth and session', () => {
  setupE2E();

  it('initializes a session and lists tools', async () => {
    const result = await listTools();
    expect(result.result).toBeDefined();
    expect(result.result.tools).toBeDefined();
    expect(result.result.tools.length).toBeGreaterThan(0);
  });

  it('api-key session lists all 20 tools (read + write)', async () => {
    const result = await listTools(3);
    const toolNames = result.result.tools.map((t: { name: string }) => t.name);

    const expectedTools = [
      'search_projects', 'get_project',
      'search_services', 'get_service',
      'list_project_tasks',
      'get_project_budget', 'get_project_purchases', 'get_project_revenues',
      'get_project_risks', 'get_project_issues',
      'aggregate_portfolio',
      'search_users', 'get_user',
      'get_reference_data',
      'query_datamart',
      'create_task', 'update_task', 'create_risk', 'create_issue', 'update_project',
    ];

    for (const name of expectedTools) {
      expect(toolNames).toContain(name);
    }
    expect(toolNames).toHaveLength(20);
  });

  // OAuth scope enforcement E2E: verifies that OAuth sessions with mcp:read only
  // see 15 read tools (no write tools). Requires browser automation for the OAuth
  // login flow -- tested in UI-E2E-Testing/playwright/tests/oauth/mcp-scope-enforcement.spec.ts
});
