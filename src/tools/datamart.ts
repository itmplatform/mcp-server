import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Clients } from '../clients/index.js';
import { COMPONENTS_QUERY, COMPONENT_QUERY, AGGREGATE_QUERY, MAX_LIST_LIMIT, clampLimit } from './graphql-queries.js';
import { validateDataMartQuery } from '../validation/query-validator.js';

const QUERY_MAP: Record<string, string> = {
  component: COMPONENT_QUERY,
  components: COMPONENTS_QUERY,
  aggregateComponents: AGGREGATE_QUERY,
};

export function buildDataMartQueryBody(args: {
  operation: string;
  id?: number;
  where?: Record<string, unknown>;
  project?: Record<string, unknown>;
  sort?: Record<string, unknown>;
  limit?: number;
  skip?: number;
  pipeline?: Record<string, unknown>[];
}) {
  const query = QUERY_MAP[args.operation] ?? COMPONENTS_QUERY;
  const variables: Record<string, unknown> = {};

  if (args.operation === 'component') {
    variables.id = args.id;
    variables.proj = args.project;
  } else if (args.operation === 'aggregateComponents') {
    variables.p = args.pipeline;
  } else {
    if (args.where) variables.w = args.where;
    if (args.project) variables.proj = args.project;
    if (args.sort) variables.sort = args.sort;
    variables.limit = clampLimit(args.limit, MAX_LIST_LIMIT);
    variables.skip = args.skip ?? 0;
  }

  return { query, variables };
}

export function registerDataMartTool(server: McpServer, clients: Clients) {
  server.registerTool(
    'query_datamart',
    {
      description: `Run a custom query against ITM DataMart (MongoDB-backed). For advanced analysis beyond typed tools.

Operations:
- "components": list with filters. Params: where, project, sort, limit (max 200), skip
- "component": single by ID. Params: id, project
- "aggregateComponents": aggregation pipeline. Params: pipeline (must end with $limit, max 1000)

Allowed filter operators: $eq, $ne, $in, $nin, $gt, $gte, $lt, $lte, $regex, $options, $exists, $not, $and, $or, $nor
Allowed pipeline stages: $match, $project, $group, $sort, $limit, $skip, $unwind, $addFields, $set, $unset
Banned: $lookup, $merge, $out, $function, $accumulator, $where, $facet

Key fields: id, name, code, componentType, statusLabel, priorityLabel, percentComplete, startDate, endDate, methodology, managers, budgetTopDown, budgetActual.

Important: Projecting full embedded arrays (tasks: 1, risks: 1, issues: 1, purchases: 1, revenues: 1, activities: 1) is rejected because they can be too large. Use dot notation (e.g. "tasks.name": 1) or the dedicated subcomponent tools with limit/skip.`,
      inputSchema: {
        operation: z.enum(['component', 'components', 'aggregateComponents']).describe('The DataMart operation'),
        id: z.number().optional().describe('Component ID (for "component" operation)'),
        where: z.record(z.unknown()).optional().describe('MongoDB filter (for "components")'),
        project: z.record(z.unknown()).optional().describe('Field projection (1 = include)'),
        sort: z.record(z.unknown()).optional().describe('Sort spec (1 = ascending, -1 = descending)'),
        limit: z.number().optional().describe('Max results (default 50, max 200 for list, 1000 for agg)'),
        skip: z.number().optional().describe('Offset for pagination'),
        pipeline: z.array(z.record(z.unknown())).optional().describe('Aggregation pipeline stages (must end with $limit)'),
      },
    },
    async (args) => {
      const body = buildDataMartQueryBody(args);

      const validation = validateDataMartQuery({ query: body.query, variables: body.variables });
      if (!validation.ok) {
        return {
          content: [{ type: 'text' as const, text: `Validation error: ${validation.error?.message}` }],
          isError: true,
        };
      }

      const data = await clients.datamart.query(body);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    },
  );
}
