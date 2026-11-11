import type { Clients } from '../clients/index.js';
import { AGGREGATE_QUERY, MAX_LIST_LIMIT, clampLimit } from './graphql-queries.js';
import { PAGE_BUDGET_BYTES, markResultTrimmed } from '../validation/result-size-guard.js';

export interface PageResult {
  items: unknown[];
  total: number;
  limit: number;
  skip: number;
  hasMore: boolean;
  /** Present only when the page was shortened to fit PAGE_BUDGET_BYTES. */
  trimmedForSize?: true;
  requestedLimit?: number;
  nextSkip?: number;
  hint?: string;
}

export interface FitPageOptions {
  /** Shortens one item that exceeds the budget on its own; it must return an item of at most maxBytes. */
  shrinkItem?: (item: unknown, maxBytes: number) => unknown;
  /** Sentence returned with a trimmed page so the agent knows how to continue. */
  hint?: string;
}

export interface FetchPageOptions extends FitPageOptions {
  /** Item fields to return; id is always added. Absent or empty returns the whole item. */
  fields?: string[];
}

export const TRIMMED_PAGE_HINT = 'Page trimmed to stay within the response size limit. Continue with skip=nextSkip.';

export function buildFieldProjection(prefix: string, fields: string[]): Record<string, 1> {
  const projection: Record<string, 1> = {};
  for (const field of ['id', ...fields]) projection[`${prefix}.${field}`] = 1;
  return projection;
}

export function buildSubcomponentPagePipeline(
  componentId: number,
  arrayField: string,
  limit: number,
  skip: number,
  fields?: string[],
): Record<string, unknown>[] {
  const projection = fields?.length
    ? { _id: 0, ...buildFieldProjection(arrayField, fields) }
    : { _id: 0, [arrayField]: 1 };
  return [
    { $match: { id: { $eq: componentId } } },
    { $unwind: `$${arrayField}` },
    { $project: projection },
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

/** Collection tools return compact JSON: indentation is about a fifth of a task's bytes and carries no information. */
export function serializePage(page: unknown): string {
  return JSON.stringify(page);
}

function byteLength(text: string): number {
  return Buffer.byteLength(text, 'utf8');
}

/**
 * Returns the page unchanged when it fits budgetBytes. Otherwise keeps the
 * leading items that fit, dropping whole items from the end, and reports the
 * number actually returned as `limit`, so an agent that pages with skip + limit
 * never skips items. A first item that is over the budget on its own is passed
 * to shrinkItem when one is given, or returned unchanged for the result-size
 * guard to reject.
 */
export function fitPageToBudget(
  page: PageResult,
  budgetBytes: number = PAGE_BUDGET_BYTES,
  options: FitPageOptions = {},
): PageResult {
  if (byteLength(serializePage(page)) <= budgetBytes) return page;

  const build = (items: unknown[]): PageResult => ({
    items,
    total: page.total,
    limit: items.length,
    skip: page.skip,
    hasMore: page.skip + items.length < page.total,
    trimmedForSize: true,
    requestedLimit: page.limit,
    nextSkip: page.skip + items.length,
    ...(options.hint ? { hint: options.hint } : {}),
  });

  // Envelope measured with the widest possible numbers so the final page cannot outgrow it.
  const envelope = byteLength(serializePage({ ...build([]), limit: page.items.length, nextSkip: page.skip + page.items.length }));
  const kept: unknown[] = [];
  let used = envelope;
  for (const item of page.items) {
    const itemBytes = byteLength(JSON.stringify(item)) + (kept.length ? 1 : 0);
    if (used + itemBytes > budgetBytes) break;
    kept.push(item);
    used += itemBytes;
  }

  if (!kept.length && page.items.length) {
    const first = page.items[0];
    kept.push(options.shrinkItem ? options.shrinkItem(first, budgetBytes - envelope) : first);
  }

  return build(kept);
}

export function pageToolResult(page: PageResult) {
  const result = { content: [{ type: 'text' as const, text: serializePage(page) }] };
  return page.trimmedForSize ? markResultTrimmed(result) : result;
}

export async function fetchSubcomponentPage(
  clients: Clients,
  componentId: number,
  arrayField: string,
  rawLimit?: number,
  rawSkip?: number,
  options: FetchPageOptions = {},
): Promise<PageResult> {
  const limit = clampLimit(rawLimit, MAX_LIST_LIMIT);
  const skip = rawSkip ?? 0;

  const [pageData, countData] = await Promise.all([
    clients.datamart.query({
      query: AGGREGATE_QUERY,
      variables: { p: buildSubcomponentPagePipeline(componentId, arrayField, limit, skip, options.fields) },
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

  return fitPageToBudget(buildPageResult(items, total, limit, skip), PAGE_BUDGET_BYTES, {
    hint: options.hint ?? TRIMMED_PAGE_HINT,
    shrinkItem: options.shrinkItem,
  });
}
