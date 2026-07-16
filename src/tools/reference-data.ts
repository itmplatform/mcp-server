import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Clients } from '../clients/index.js';

export const ALLOWED_ENTITIES = [
  'projectstatuses', 'gettaskstatuses', 'gettasktypes', 'gettaskpriorities',
  'getprojecttypes', 'projectpriorities', 'riskstatuses', 'risktypes',
  'riskimpacts', 'riskprobabilities',
  'issuestatuses', 'issuetypes', 'purchasestatuses', 'purchasetypes',
  'revenuestatuses', 'assessments', 'activitystatuses',
] as const;

// Entities whose REST path differs from the entity name.
export const ACTIVITY_STATUSES_PATH = 'gettaskstatuses?IsService=true';
const ENTITY_PATHS: Partial<Record<(typeof ALLOWED_ENTITIES)[number], string>> = {
  activitystatuses: ACTIVITY_STATUSES_PATH,
};

export function registerReferenceDataTools(server: McpServer, clients: Clients) {
  server.registerTool(
    'get_reference_data',
    {
      description: 'Get reference data lists (statuses, types, priorities, risk impact/probability, assessments) for any entity. Useful for understanding valid values when filtering or interpreting data. Available entities: projectstatuses, gettaskstatuses, gettasktypes, gettaskpriorities, getprojecttypes, projectpriorities, riskstatuses, risktypes, riskimpacts, riskprobabilities, issuestatuses, issuetypes, purchasestatuses, purchasetypes, revenuestatuses, assessments, activitystatuses. Use "assessments" to discover valid assessmentId values for create_task_progress. Use "activitystatuses" for service activity statuses (these differ from task statuses). Some risk/issue reference data includes BaseId; write tools accept either Id or BaseId and normalize when v2 REST requires BaseId.',
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
