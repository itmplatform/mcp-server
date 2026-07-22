import { describe, it, expect } from 'vitest';
import { setupE2E, callTool, listTools } from './setup.js';

const MCP_PORT = process.env.MCP_E2E_PORT ?? '6170';
const MCP_URL = `http://localhost:${MCP_PORT}/`;

// The local testsmarter account defines project custom fields including
// "Lista" (List) and "NumberField" (Number); see Projects/CustomFields.
const KNOWN_PROJECT_FIELD = 'Lista';

function parseToolJson(result: any): any {
  expect(result.result?.content?.[0]?.text, JSON.stringify(result)).toBeDefined();
  return JSON.parse(result.result.content[0].text);
}

describe('custom fields discovery', () => {
  setupE2E();

  it('initialize returns per-account instructions naming real customFields keys', async () => {
    const response = await fetch(MCP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-11-25',
          capabilities: {},
          clientInfo: { name: 'cf-e2e-test', version: '1.0.0' },
        },
      }),
    });
    const body = await response.json();
    expect(body.result.instructions).toBeDefined();
    expect(body.result.instructions).toContain('customFields');
    expect(body.result.instructions).toContain(KNOWN_PROJECT_FIELD);
  });

  it('query_datamart description carries the per-account custom field block', async () => {
    const tools = await listTools(11);
    const datamart = tools.result.tools.find((t: { name: string }) => t.name === 'query_datamart');
    expect(datamart.description).toContain('customFields');
    expect(datamart.description).toContain(KNOWN_PROJECT_FIELD);
  });

  it('get_custom_fields returns project definitions', async () => {
    const data = parseToolJson(await callTool('get_custom_fields', { entity: 'project' }));
    expect(Array.isArray(data)).toBe(true);
    const lista = data.find((f: { Name: string }) => f.Name === KNOWN_PROJECT_FIELD);
    expect(lista).toBeDefined();
    expect(lista.TypeName).toBe('List');
    expect(lista.BaseId).toBeGreaterThan(0);
  });

  it('get_custom_fields supports every entity without erroring', async () => {
    for (const entity of ['task', 'risk', 'issue', 'service', 'activity', 'purchase', 'revenue']) {
      const result = await callTool('get_custom_fields', { entity });
      expect(result.result?.isError, `${entity}: ${JSON.stringify(result.result?.content?.[0])}`).toBeFalsy();
      expect(Array.isArray(parseToolJson(result))).toBe(true);
    }
  });

  it('get_custom_field_options lists the dropdown values for a List field', async () => {
    const fields = parseToolJson(await callTool('get_custom_fields', { entity: 'project' }));
    const lista = fields.find((f: { Name: string }) => f.Name === KNOWN_PROJECT_FIELD);

    const options = parseToolJson(await callTool('get_custom_field_options', { customFieldBaseId: lista.BaseId }));
    expect(Array.isArray(options)).toBe(true);
    expect(options.length).toBeGreaterThan(0);
    expect(options[0]).toHaveProperty('Text');
    expect(options[0]).toHaveProperty('SortOrder');
  });

  it('query_datamart returns the customFields map when projected', async () => {
    const data = parseToolJson(await callTool('query_datamart', {
      operation: 'components',
      where: { componentType: { $eq: 'project' } },
      project: { name: 1, customFields: 1 },
      limit: 1,
    }));
    const item = data.components.items[0];
    expect(item.customFields).toBeDefined();
    expect(typeof item.customFields).toBe('object');
    expect(Object.keys(item.customFields)).toContain(KNOWN_PROJECT_FIELD);
  });
});
