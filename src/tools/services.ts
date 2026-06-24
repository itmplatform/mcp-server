import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Clients } from '../clients/index.js';
import { COMPONENTS_QUERY, COMPONENT_QUERY, AGGREGATE_QUERY, DEFAULT_PROJECT_FIELDS, MAX_LIST_LIMIT, clampLimit, buildSubcomponentCountPipeline } from './graphql-queries.js';
import { fetchSubcomponentPage } from './subcomponent-page.js';

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

const SERVICE_INCLUDE_MAP: Record<string, Record<string, number>> = {
  budget: { budgetTopDown: 1, budgetBottomUp: 1, budgetPeriodEndClose: 1, budgetActual: 1 },
};

const SERVICE_SUBCOMPONENT_ARRAYS = ['activities', 'purchases', 'revenues'];

export function buildGetServiceProjection(include: string[]): Record<string, number> {
  const proj: Record<string, number> = { ...DEFAULT_PROJECT_FIELDS };
  for (const inc of include) {
    const fields = SERVICE_INCLUDE_MAP[inc];
    if (fields) Object.assign(proj, fields);
  }
  return proj;
}

export function buildServiceSubcomponentsSummary(counts: Record<string, number | null>) {
  return {
    activities: { count: counts.activityCount ?? null, tool: 'list_service_activities' },
    purchases: { count: counts.purchaseCount ?? null, tool: 'get_service_purchases' },
    revenues: { count: counts.revenueCount ?? null, tool: 'get_service_revenues' },
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
      description: 'Get service details by ID with subcomponent counts. Budget can be included via include: ["budget"]. For activities, purchases, and revenues use the dedicated tools: list_service_activities, get_service_purchases, get_service_revenues.',
      inputSchema: {
        serviceId: z.number().describe('The service ID'),
        include: z.array(z.enum(['budget']))
          .optional()
          .describe('Optional data to include. Only "budget" is supported. Subcomponent arrays (activities, etc.) are accessed via dedicated tools.'),
      },
    },
    async (args) => {
      const proj = buildGetServiceProjection(args.include ?? []);

      const [detailData, countData] = await Promise.all([
        clients.datamart.query({ query: COMPONENT_QUERY, variables: { id: args.serviceId, proj } }),
        clients.datamart.query({
          query: AGGREGATE_QUERY,
          variables: { p: buildSubcomponentCountPipeline(args.serviceId, SERVICE_SUBCOMPONENT_ARRAYS) },
        }).catch(() => null),
      ]);

      const component = detailData.component as Record<string, unknown> | null;
      const counts = ((countData?.aggregateComponents as unknown[]) ?? [])[0] as Record<string, number> | undefined;
      const result = { ...component, subcomponents: buildServiceSubcomponentsSummary(counts ?? {}) };

      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    'list_service_activities',
    {
      description: 'List activities for a service with pagination. Returns { items, total, limit, skip, hasMore }. Default limit: 50, max: 200.',
      inputSchema: {
        serviceId: z.number().describe('The service ID'),
        limit: z.number().optional().describe('Max activities to return (default 50, max 200)'),
        skip: z.number().optional().describe('Number of activities to skip (for pagination)'),
      },
    },
    async (args) => {
      const page = await fetchSubcomponentPage(clients, args.serviceId, 'activities', args.limit, args.skip);
      return { content: [{ type: 'text' as const, text: JSON.stringify(page, null, 2) }] };
    },
  );

  server.registerTool(
    'get_service_purchases',
    {
      description: 'Get purchase orders for a service with pagination. Returns { items, total, limit, skip, hasMore }. Default limit: 50, max: 200.',
      inputSchema: {
        serviceId: z.number().describe('The service ID'),
        limit: z.number().optional().describe('Max purchases to return (default 50, max 200)'),
        skip: z.number().optional().describe('Number of purchases to skip (for pagination)'),
      },
    },
    async (args) => {
      const page = await fetchSubcomponentPage(clients, args.serviceId, 'purchases', args.limit, args.skip);
      return { content: [{ type: 'text' as const, text: JSON.stringify(page, null, 2) }] };
    },
  );

  server.registerTool(
    'get_service_revenues',
    {
      description: 'Get revenue items for a service with pagination. Returns { items, total, limit, skip, hasMore }. Default limit: 50, max: 200.',
      inputSchema: {
        serviceId: z.number().describe('The service ID'),
        limit: z.number().optional().describe('Max revenue items to return (default 50, max 200)'),
        skip: z.number().optional().describe('Number of revenue items to skip (for pagination)'),
      },
    },
    async (args) => {
      const page = await fetchSubcomponentPage(clients, args.serviceId, 'revenues', args.limit, args.skip);
      return { content: [{ type: 'text' as const, text: JSON.stringify(page, null, 2) }] };
    },
  );
}
