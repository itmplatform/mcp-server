import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Clients } from '../clients/index.js';
import { COMPONENTS_QUERY, COMPONENT_QUERY, DEFAULT_PROJECT_FIELDS, MAX_LIST_LIMIT, clampLimit } from './graphql-queries.js';

interface SearchProjectsArgs {
  query?: string;
  status?: string;
  type?: string;
  dateFrom?: string;
  dateTo?: string;
  sort?: string;
  limit?: number;
  skip?: number;
}

export function buildSearchProjectsVariables(args: SearchProjectsArgs) {
  const where: Record<string, unknown> = { componentType: { $eq: 'project' } };

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

const INCLUDE_MAP: Record<string, Record<string, number>> = {
  tasks: { tasks: 1 },
  risks: { risks: 1 },
  issues: { issues: 1 },
  purchases: { purchases: 1 },
  revenues: { revenues: 1 },
  budget: { budgetTopDown: 1, budgetBottomUp: 1, budgetPeriodEndClose: 1, budgetActual: 1 },
};

export function buildGetProjectProjection(include: string[]): Record<string, number> {
  const proj: Record<string, number> = { ...DEFAULT_PROJECT_FIELDS };
  for (const inc of include) {
    const fields = INCLUDE_MAP[inc];
    if (fields) Object.assign(proj, fields);
  }
  return proj;
}

export function registerProjectTools(server: McpServer, clients: Clients) {
  server.registerTool(
    'search_projects',
    {
      description: 'Find projects by name, status, type, or date range. Returns id, name, status, progress, dates, managers. Filterable fields: name, statusLabel, customTypeLabel, startDate, endDate.',
      inputSchema: {
        query: z.string().optional().describe('Search projects by name (case-insensitive regex)'),
        status: z.string().optional().describe('Filter by status label (e.g. "In Progress", "Closed")'),
        type: z.string().optional().describe('Filter by project type label'),
        dateFrom: z.string().optional().describe('Filter projects starting on or after this date (ISO 8601)'),
        dateTo: z.string().optional().describe('Filter projects ending on or before this date (ISO 8601)'),
        sort: z.string().optional().describe('Sort field (default: "name"). Use DataMart field names.'),
        limit: z.number().optional().describe('Max results (default 50, max 200)'),
        skip: z.number().optional().describe('Offset for pagination'),
      },
    },
    async (args) => {
      const variables = buildSearchProjectsVariables(args);
      const data = await clients.datamart.query({ query: COMPONENTS_QUERY, variables });
      return { content: [{ type: 'text' as const, text: JSON.stringify(data.components, null, 2) }] };
    },
  );

  server.registerTool(
    'get_project',
    {
      description: 'Get full project details by ID, optionally including subcomponents (tasks, risks, issues, budget, purchases, revenues). One query returns everything requested.',
      inputSchema: {
        projectId: z.number().describe('The project ID'),
        include: z.array(z.enum(['tasks', 'risks', 'issues', 'budget', 'purchases', 'revenues']))
          .optional()
          .describe('Subcomponents to include (default: none)'),
      },
    },
    async (args) => {
      const proj = buildGetProjectProjection(args.include ?? []);
      const variables = { id: args.projectId, proj };
      const data = await clients.datamart.query({ query: COMPONENT_QUERY, variables });
      return { content: [{ type: 'text' as const, text: JSON.stringify(data.component, null, 2) }] };
    },
  );
}
