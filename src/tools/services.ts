import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Clients } from '../clients/index.js';
import { COMPONENTS_QUERY, COMPONENT_QUERY, DEFAULT_PROJECT_FIELDS, MAX_LIST_LIMIT, clampLimit } from './graphql-queries.js';

interface SearchServicesArgs {
  query?: string;
  status?: string;
  type?: string;
  dateFrom?: string;
  dateTo?: string;
  sort?: string;
  limit?: number;
  skip?: number;
}

export function buildSearchServicesVariables(args: SearchServicesArgs) {
  const where: Record<string, unknown> = { componentType: { $eq: 'service' } };

  if (args.query) where.name = { $regex: args.query, $options: 'i' };
  if (args.status) where.statusLabel = { $regex: args.status, $options: 'i' };
  if (args.type) where.customTypeLabel = { $regex: args.type, $options: 'i' };
  if (args.dateFrom) where.startDate = { $gte: args.dateFrom };
  if (args.dateTo) where.endDate = { $lte: args.dateTo };

  return {
    w: where,
    proj: DEFAULT_PROJECT_FIELDS,
    sort: args.sort ? { [args.sort]: 1 } : { name: 1 },
    limit: clampLimit(args.limit, MAX_LIST_LIMIT),
    skip: args.skip ?? 0,
  };
}

export function registerServiceTools(server: McpServer, clients: Clients) {
  server.registerTool(
    'search_services',
    {
      description: 'Find services by name, status, type, or date range. Same query shape as search_projects but for services.',
      inputSchema: {
        query: z.string().optional().describe('Search services by name (case-insensitive regex)'),
        status: z.string().optional().describe('Filter by status label'),
        type: z.string().optional().describe('Filter by service type label'),
        dateFrom: z.string().optional().describe('Filter services starting on or after this date (ISO 8601)'),
        dateTo: z.string().optional().describe('Filter services ending on or before this date (ISO 8601)'),
        sort: z.string().optional().describe('Sort field (default: "name")'),
        limit: z.number().optional().describe('Max results (default 50, max 200)'),
        skip: z.number().optional().describe('Offset for pagination'),
      },
    },
    async (args) => {
      const variables = buildSearchServicesVariables(args);
      const data = await clients.datamart.query({ query: COMPONENTS_QUERY, variables });
      return { content: [{ type: 'text' as const, text: JSON.stringify(data.components, null, 2) }] };
    },
  );

  server.registerTool(
    'get_service',
    {
      description: 'Get full service details by ID, optionally including subcomponents (activities, purchases, revenues). Note: services have activities instead of tasks, and do not have risks or issues.',
      inputSchema: {
        serviceId: z.number().describe('The service ID'),
        include: z.array(z.enum(['activities', 'purchases', 'revenues', 'budget']))
          .optional()
          .describe('Subcomponents to include (default: none)'),
      },
    },
    async (args) => {
      const proj: Record<string, number> = { ...DEFAULT_PROJECT_FIELDS };
      const includeMap: Record<string, Record<string, number>> = {
        activities: { activities: 1 },
        purchases: { purchases: 1 },
        revenues: { revenues: 1 },
        budget: { budgetTopDown: 1, budgetBottomUp: 1, budgetPeriodEndClose: 1, budgetActual: 1 },
      };
      for (const inc of args.include ?? []) {
        const fields = includeMap[inc];
        if (fields) Object.assign(proj, fields);
      }
      const variables = { id: args.serviceId, proj };
      const data = await clients.datamart.query({ query: COMPONENT_QUERY, variables });
      return { content: [{ type: 'text' as const, text: JSON.stringify(data.component, null, 2) }] };
    },
  );
}
