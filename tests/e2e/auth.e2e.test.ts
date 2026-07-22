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

  it('api-key session lists all 44 tools (read + write)', async () => {
    const result = await listTools(3);
    const toolNames = result.result.tools.map((t: { name: string }) => t.name);

    const expectedTools = [
      'search_projects', 'get_project',
      'search_services', 'get_service', 'list_service_activities',
      'get_service_purchases', 'get_service_revenues',
      'list_project_tasks', 'get_task', 'search_tasks',
      'get_project_budget', 'get_project_purchases', 'get_project_revenues',
      'get_project_risks', 'get_project_issues', 'get_risk', 'get_issue',
      'list_task_progress', 'get_project_progress', 'get_task_effort',
      'aggregate_portfolio',
      'search_users', 'get_user',
      'get_reference_data',
      'get_custom_fields', 'get_custom_field_options',
      'query_datamart',
      'create_project', 'create_task', 'update_task', 'create_risk', 'create_issue', 'update_project',
      'create_task_progress', 'update_task_progress', 'update_task_effort',
      'bulk_update_task_status', 'bulk_update_activity_status',
      'update_risk', 'update_issue',
      'create_service', 'update_service', 'create_activity', 'update_activity',
    ];

    for (const name of expectedTools) {
      expect(toolNames).toContain(name);
    }
    expect(toolNames).toHaveLength(44);
  });

  // OAuth scope enforcement E2E: verifies that OAuth sessions with mcp:read only
  // see 15 read tools (no write tools). Requires browser automation for the OAuth
  // login flow -- tested in UI-E2E-Testing/playwright/tests/oauth/mcp-scope-enforcement.spec.ts
});
