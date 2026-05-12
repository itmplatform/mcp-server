import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Clients } from '../clients/index.js';
import { AGGREGATE_QUERY, MAX_AGG_LIMIT, clampLimit } from './graphql-queries.js';
import { validateDataMartQuery } from '../validation/query-validator.js';

const METRIC_MAP: Record<string, Record<string, unknown>> = {
  count: { count: { $sum: 1 } },
  avgProgress: { avgProgress: { $avg: '$percentComplete' } },
  totalBudget: { totalBudget: { $sum: '$budgetTopDown.totalCost' } },
  totalActual: { totalActual: { $sum: '$budgetActual.totalCost' } },
};

export function buildAggregationPipeline(args: {
  groupBy: string;
  metrics: string[];
  filter?: Record<string, unknown>;
  limit?: number;
}) {
  const pipeline: Record<string, unknown>[] = [];

  const matchStage: Record<string, unknown> = { componentType: { $eq: 'project' } };
  if (args.filter) Object.assign(matchStage, args.filter);
  pipeline.push({ $match: matchStage });

  const groupStage: Record<string, unknown> = { _id: `$${args.groupBy}` };
  for (const metric of args.metrics) {
    const mapping = METRIC_MAP[metric];
    if (mapping) Object.assign(groupStage, mapping);
  }
  pipeline.push({ $group: groupStage });

  pipeline.push({ $sort: { count: -1 } });
  pipeline.push({ $limit: clampLimit(args.limit, MAX_AGG_LIMIT) });

  return pipeline;
}

export function registerPortfolioTools(server: McpServer, clients: Clients) {
  server.registerTool(
    'aggregate_portfolio',
    {
      description: 'Portfolio-level analytics: group projects by any field and compute metrics (count, avgProgress, totalBudget, totalActual). Uses DataMart aggregation -- no REST equivalent. Available groupBy fields: statusLabel, priorityLabel, methodology, customTypeLabel, isClosed, managers.name.',
      inputSchema: {
        groupBy: z.string().describe('Field to group by (e.g. "statusLabel", "methodology", "customTypeLabel")'),
        metrics: z.array(z.enum(['count', 'avgProgress', 'totalBudget', 'totalActual']))
          .describe('Metrics to compute per group'),
        filter: z.record(z.unknown()).optional().describe('Additional MongoDB filter to narrow the portfolio (merged with componentType: project)'),
        limit: z.number().optional().describe('Max groups to return (default 50, max 1000)'),
      },
    },
    async (args) => {
      const pipeline = buildAggregationPipeline(args);

      const queryBody = {
        query: AGGREGATE_QUERY.replace('$p', 'pipeline'),
        variables: { p: pipeline },
      };
      const validation = validateDataMartQuery({ query: `query($p: JSON!) { aggregateComponents(pipeline: $p) }`, variables: { p: pipeline } });
      if (!validation.ok) {
        return {
          content: [{ type: 'text' as const, text: `Validation error: ${validation.error?.message}` }],
          isError: true,
        };
      }

      const data = await clients.datamart.query({ query: AGGREGATE_QUERY, variables: { p: pipeline } });
      return { content: [{ type: 'text' as const, text: JSON.stringify(data.aggregateComponents, null, 2) }] };
    },
  );
}
