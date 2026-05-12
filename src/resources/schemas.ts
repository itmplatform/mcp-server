import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Clients } from '../clients/index.js';

const SCHEMA_ENTITIES = ['component', 'task', 'purchase', 'risk', 'issue'] as const;

const SCHEMA_URI_MAP: Record<string, string> = {
  component: 'itm://schema/component',
  task: 'itm://schema/tasks',
  purchase: 'itm://schema/purchases',
  risk: 'itm://schema/risks',
  issue: 'itm://schema/issues',
};

const SCHEMA_DESCRIPTIONS: Record<string, string> = {
  component: 'DataMart component schema (projects/services) -- available fields, types, and enums',
  task: 'DataMart task schema -- fields available on task subcomponents',
  purchase: 'DataMart purchase schema -- fields available on purchase subcomponents',
  risk: 'DataMart risk schema -- fields available on risk subcomponents',
  issue: 'DataMart issue schema -- fields available on issue subcomponents',
};

export function registerSchemaResources(server: McpServer, clients: Clients) {
  for (const entity of SCHEMA_ENTITIES) {
    const uri = SCHEMA_URI_MAP[entity];
    server.registerResource(
      `schema-${entity}`,
      uri,
      {
        description: SCHEMA_DESCRIPTIONS[entity],
        mimeType: 'application/json',
      },
      async () => {
        const data = await clients.rest.get(`datamart/api/schema/${entity}`);
        return {
          contents: [{
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(data, null, 2),
          }],
        };
      },
    );
  }
}
