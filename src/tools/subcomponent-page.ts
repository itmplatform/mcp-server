import type { Clients } from '../clients/index.js';
import { AGGREGATE_QUERY, MAX_LIST_LIMIT, clampLimit } from './graphql-queries.js';

export interface PageResult {
  items: unknown[];
  total: number;
  limit: number;
  skip: number;
  hasMore: boolean;
}

export function buildSubcomponentPagePipeline(
  componentId: number,
  arrayField: string,
  limit: number,
  skip: number,
): Record<string, unknown>[] {
  return [
    { $match: { id: { $eq: componentId } } },
    { $unwind: `$${arrayField}` },
    { $project: { _id: 0, [arrayField]: 1 } },
    { $skip: skip },
    { $limit: limit },
  ];
}

export function buildSingleArrayCountPipeline(
  componentId: number,
  arrayField: string,
): Record<string, unknown>[] {
  return [
    { $match: { id: { $eq: componentId } } },
    { $project: { count: { $size: { $ifNull: [`$${arrayField}`, []] } } } },
    { $limit: 1 },
  ];
}

export function buildPageResult(
  items: unknown[],
  total: number,
  limit: number,
  skip: number,
): PageResult {
  return {
    items,
    total,
    limit,
    skip,
    hasMore: skip + items.length < total,
  };
}

export async function fetchSubcomponentPage(
  clients: Clients,
  componentId: number,
  arrayField: string,
  rawLimit?: number,
  rawSkip?: number,
): Promise<PageResult> {
  const limit = clampLimit(rawLimit, MAX_LIST_LIMIT);
  const skip = rawSkip ?? 0;

  const [pageData, countData] = await Promise.all([
    clients.datamart.query({
      query: AGGREGATE_QUERY,
      variables: { p: buildSubcomponentPagePipeline(componentId, arrayField, limit, skip) },
    }),
    clients.datamart.query({
      query: AGGREGATE_QUERY,
      variables: { p: buildSingleArrayCountPipeline(componentId, arrayField) },
    }),
  ]);

  const rawItems = (pageData.aggregateComponents as Record<string, unknown>[]) ?? [];
  const items = rawItems.map(doc => doc[arrayField]);
  const countRow = ((countData.aggregateComponents as unknown[]) ?? [])[0] as { count?: number } | undefined;
  const total = countRow?.count ?? items.length;

  return buildPageResult(items, total, limit, skip);
}
