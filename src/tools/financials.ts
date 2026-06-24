import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Clients } from '../clients/index.js';
import { COMPONENT_QUERY } from './graphql-queries.js';
import { fetchSubcomponentPage } from './subcomponent-page.js';

export function registerFinancialTools(server: McpServer, clients: Clients) {
  server.registerTool(
    'get_project_budget',
    {
      description: 'Get budget summary for a project. Returns four budget objects: budgetTopDown (planned), budgetBottomUp (estimated), budgetPeriodEndClose (forecast), budgetActual (spent).',
      inputSchema: {
        projectId: z.number().describe('The project ID'),
      },
    },
    async (args) => {
      const proj = { budgetTopDown: 1, budgetBottomUp: 1, budgetPeriodEndClose: 1, budgetActual: 1 };
      const data = await clients.datamart.query({ query: COMPONENT_QUERY, variables: { id: args.projectId, proj } });
      const component = data.component as Record<string, unknown> | null;
      const budget = {
        budgetTopDown: component?.budgetTopDown ?? null,
        budgetBottomUp: component?.budgetBottomUp ?? null,
        budgetPeriodEndClose: component?.budgetPeriodEndClose ?? null,
        budgetActual: component?.budgetActual ?? null,
      };
      return { content: [{ type: 'text' as const, text: JSON.stringify(budget, null, 2) }] };
    },
  );

  server.registerTool(
    'get_project_purchases',
    {
      description: 'Get purchase orders for a project with pagination. Returns { items, total, limit, skip, hasMore }. Default limit: 50, max: 200.',
      inputSchema: {
        projectId: z.number().describe('The project ID'),
        limit: z.number().optional().describe('Max purchases to return (default 50, max 200)'),
        skip: z.number().optional().describe('Number of purchases to skip (for pagination)'),
      },
    },
    async (args) => {
      const page = await fetchSubcomponentPage(clients, args.projectId, 'purchases', args.limit, args.skip);
      return { content: [{ type: 'text' as const, text: JSON.stringify(page, null, 2) }] };
    },
  );

  server.registerTool(
    'get_project_revenues',
    {
      description: 'Get revenue items for a project with pagination. Returns { items, total, limit, skip, hasMore }. Default limit: 50, max: 200.',
      inputSchema: {
        projectId: z.number().describe('The project ID'),
        limit: z.number().optional().describe('Max revenue items to return (default 50, max 200)'),
        skip: z.number().optional().describe('Number of revenue items to skip (for pagination)'),
      },
    },
    async (args) => {
      const page = await fetchSubcomponentPage(clients, args.projectId, 'revenues', args.limit, args.skip);
      return { content: [{ type: 'text' as const, text: JSON.stringify(page, null, 2) }] };
    },
  );
}
