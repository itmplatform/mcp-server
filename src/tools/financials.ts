import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Clients } from '../clients/index.js';
import { COMPONENT_QUERY } from './graphql-queries.js';

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
      description: 'Get purchase orders for a project. Returns an array of purchase items with amount, status, dates, and provider.',
      inputSchema: {
        projectId: z.number().describe('The project ID'),
      },
    },
    async (args) => {
      const data = await clients.datamart.query({
        query: COMPONENT_QUERY,
        variables: { id: args.projectId, proj: { purchases: 1 } },
      });
      const component = data.component as Record<string, unknown> | null;
      const purchases = component?.purchases ?? [];
      return { content: [{ type: 'text' as const, text: JSON.stringify(purchases, null, 2) }] };
    },
  );

  server.registerTool(
    'get_project_revenues',
    {
      description: 'Get revenue items for a project. Returns an array of revenue entries with amount, status, and dates.',
      inputSchema: {
        projectId: z.number().describe('The project ID'),
      },
    },
    async (args) => {
      const data = await clients.datamart.query({
        query: COMPONENT_QUERY,
        variables: { id: args.projectId, proj: { revenues: 1 } },
      });
      const component = data.component as Record<string, unknown> | null;
      const revenues = component?.revenues ?? [];
      return { content: [{ type: 'text' as const, text: JSON.stringify(revenues, null, 2) }] };
    },
  );
}
