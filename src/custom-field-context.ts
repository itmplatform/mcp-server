import type { Logger } from 'pino';
import type { Clients } from './clients/index.js';
import { AGGREGATE_QUERY } from './tools/graphql-queries.js';

export interface CustomFieldKeyUsage {
  _id: { key: string; componentType: string };
  count: number;
}

export const MAX_KEYS_PER_TYPE = 40;
const CACHE_TTL_MS = 10 * 60 * 1000;
const FETCH_TIMEOUT_MS = 2500;

export function buildKeyDiscoveryPipeline(): Record<string, unknown>[] {
  return [
    { $project: { componentType: 1, kv: { $objectToArray: { $ifNull: ['$customFields', {}] } } } },
    { $unwind: '$kv' },
    { $group: { _id: { key: '$kv.k', componentType: '$componentType' }, count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 200 },
  ];
}

export function buildCustomFieldContextText(rows: CustomFieldKeyUsage[] | undefined): string | undefined {
  if (!rows?.length) return undefined;

  const byType = new Map<string, CustomFieldKeyUsage[]>();
  for (const row of rows) {
    const type = row._id.componentType;
    if (!byType.has(type)) byType.set(type, []);
    byType.get(type)!.push(row);
  }

  const typeLines: string[] = [];
  for (const type of [...byType.keys()].sort()) {
    const usages = byType.get(type)!.sort((a, b) => b.count - a.count);
    const listed = usages.slice(0, MAX_KEYS_PER_TYPE)
      .map((u) => `"${u._id.key}" (${u.count})`)
      .join(', ');
    const overflow = usages.length > MAX_KEYS_PER_TYPE
      ? ` ... and ${usages.length - MAX_KEYS_PER_TYPE} more`
      : '';
    typeLines.push(`- ${type}: ${listed}${overflow}`);
  }

  const dottedKeys = rows.filter((r) => r._id.key.includes('.')).map((r) => `"${r._id.key}"`);
  const dottedWarning = dottedKeys.length
    ? `\nWarning: ${[...new Set(dottedKeys)].join(', ')} contain a dot, so dot-notation paths cannot address them; read them by projecting the whole customFields object, or use $getField inside an aggregate $project/$addFields stage.`
    : '';

  return `This account defines custom fields. In DataMart documents they live under "customFields", an object keyed by the field's display name. Keys present (with component counts):
${typeLines.join('\n')}
Query them via query_datamart: project {"customFields": 1} to read all values, or where {"customFields.<Key>": ...} to filter. Keys are case- and accent-sensitive and may contain trailing spaces. Keys with lower counts than their siblings are usually language variants of the same field on multilingual accounts; cover both variants with $or when totals matter. Field types and dropdown values: get_custom_fields and get_custom_field_options.${dottedWarning}`;
}

export function buildServerInstructions(contextText: string): string {
  return `ITM Platform MCP server: projects, services, tasks, budgets, risks, issues, and portfolio analytics.

${contextText}`;
}

const cache = new Map<string, { value: string | undefined; expiresAt: number }>();
const inflight = new Map<string, Promise<string | undefined>>();

export function clearCustomFieldContextCache(): void {
  cache.clear();
  inflight.clear();
}

async function fetchContext(clients: Clients): Promise<string | undefined> {
  const data = await clients.datamart.query({
    query: AGGREGATE_QUERY,
    variables: { p: buildKeyDiscoveryPipeline() },
  });
  return buildCustomFieldContextText(data.aggregateComponents as CustomFieldKeyUsage[] | undefined);
}

export async function getCustomFieldContext(
  company: string,
  clients: Clients,
  log?: Logger,
): Promise<string | undefined> {
  if (process.env.ITM_CUSTOM_FIELD_CONTEXT === 'off') return undefined;

  const hit = cache.get(company);
  if (hit && Date.now() < hit.expiresAt) return hit.value;

  let pending = inflight.get(company);
  if (!pending) {
    pending = fetchContext(clients)
      .then((value) => {
        cache.set(company, { value, expiresAt: Date.now() + CACHE_TTL_MS });
        return value;
      })
      .catch((err) => {
        log?.warn({ err, company }, 'Custom field context fetch failed');
        cache.set(company, { value: undefined, expiresAt: Date.now() + CACHE_TTL_MS });
        return undefined;
      })
      .finally(() => inflight.delete(company));
    inflight.set(company, pending);
  }

  const timeout = new Promise<undefined>((resolve) => {
    const timer = setTimeout(() => resolve(undefined), FETCH_TIMEOUT_MS);
    (timer as { unref?: () => void }).unref?.();
  });
  return Promise.race([pending, timeout]);
}
