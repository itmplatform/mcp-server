import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Clients } from '../clients/index.js';

export const ALLOWED_ENTITIES = [
  'projectstatuses', 'gettaskstatuses', 'gettasktypes', 'gettaskpriorities',
  'getprojecttypes', 'projectpriorities', 'riskstatuses', 'risktypes',
  'riskimpacts', 'riskprobabilities', 'risklevels',
  'issuestatuses', 'issuetypes', 'purchasestatuses', 'purchasetypes',
  'revenuestatuses', 'assessments', 'activitystatuses', 'servicetypes',
] as const;

// Entities whose REST path differs from the entity name.
export const ACTIVITY_STATUSES_PATH = 'gettaskstatuses?IsService=true';
export const SERVICE_TYPES_PATH = 'getprojecttypes?IsService=true';
const ENTITY_PATHS: Partial<Record<(typeof ALLOWED_ENTITIES)[number], string>> = {
  activitystatuses: ACTIVITY_STATUSES_PATH,
  servicetypes: SERVICE_TYPES_PATH,
};

export function registerReferenceDataTools(server: McpServer, clients: Clients) {
  server.registerTool(
    'get_reference_data',
    {
      description: 'Get reference IDs for statuses, types, priorities, risks, issues, purchases, revenues, and assessments. '
        + 'Use assessments for task progress; activitystatuses/servicetypes for service writes; and '
        + 'riskstatuses, risktypes, riskimpacts, riskprobabilities, or risklevels for risks. '
        + 'Where BaseId exists, write tools accept either localized Id or BaseId and normalize as needed.',
      inputSchema: {
        entity: z.enum(ALLOWED_ENTITIES).describe('The reference data entity to retrieve'),
      },
    },
    async (args) => {
      const data = await clients.rest.get(ENTITY_PATHS[args.entity] ?? args.entity);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    },
  );
}
