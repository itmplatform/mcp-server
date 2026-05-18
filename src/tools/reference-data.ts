import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Clients } from '../clients/index.js';

const ALLOWED_ENTITIES = [
  'projectstatuses', 'gettaskstatuses', 'gettasktypes', 'gettaskpriorities',
  'getprojecttypes', 'projectpriorities', 'riskstatuses', 'risktypes',
  'riskimpacts', 'riskprobabilities',
  'issuestatuses', 'issuetypes', 'purchasestatuses', 'purchasetypes',
  'revenuestatuses',
] as const;

export function registerReferenceDataTools(server: McpServer, clients: Clients) {
  server.registerTool(
    'get_reference_data',
    {
      description: 'Get reference data lists (statuses, types, priorities, risk impact/probability) for any entity. Useful for understanding valid values when filtering or interpreting data. Available entities: projectstatuses, gettaskstatuses, gettasktypes, gettaskpriorities, getprojecttypes, projectpriorities, riskstatuses, risktypes, riskimpacts, riskprobabilities, issuestatuses, issuetypes, purchasestatuses, purchasetypes, revenuestatuses. Some risk/issue reference data includes BaseId; write tools accept either Id or BaseId and normalize when v2 REST requires BaseId.',
      inputSchema: {
        entity: z.enum(ALLOWED_ENTITIES).describe('The reference data entity to retrieve'),
      },
    },
    async (args) => {
      const data = await clients.rest.get(args.entity);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    },
  );
}
