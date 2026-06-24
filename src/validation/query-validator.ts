// SYNC: Ported from ITM.PMPilot (inference/datamart/validators.js).
//       If you change the allowed operators or aggregation stages here, update the PMPilot copy too.
//
// Differences from PMPilot's copy:
//   - TypeScript types
//   - Adds $not to ALLOWED_WHERE_OPERATORS (allowed by DataMart's validate.ts)

export interface ValidationResult {
  ok: boolean;
  error?: { code: string; message: string };
  warning?: string;
}

interface DataMartBody {
  query?: string;
  variables?: Record<string, unknown>;
}

export const HEAVY_ARRAY_FIELDS = new Set([
  'tasks', 'purchases', 'revenues', 'risks', 'issues', 'activities',
]);

const ALLOWED_WHERE_OPERATORS = new Set([
  '$eq', '$ne', '$in', '$nin', '$gt', '$gte', '$lt', '$lte',
  '$regex', '$options', '$exists', '$not', '$and', '$or', '$nor',
]);

const ALLOWED_AGG_STAGES = new Set([
  '$match', '$project', '$group', '$sort', '$limit', '$skip',
  '$unwind', '$addFields', '$set', '$unset',
]);

function isAggregateQuery(query: string): boolean {
  return /\baggregateComponents\s*\(/.test(query);
}

function isListQuery(query: string): boolean {
  return /\bcomponents\s*\(/.test(query) && !isAggregateQuery(query);
}

function selectsJsonSubfields(query: string): boolean {
  return /\bcomponent\s*\{/.test(query)
    || /\bcomponents\s*\{/.test(query)
    || /\baggregateComponents\s*\{/.test(query);
}

function pipelineHasFacet(p: unknown[]): boolean {
  return p.some(
    st => st && typeof st === 'object' && Object.prototype.hasOwnProperty.call(st, '$facet'),
  );
}

function validateWhereObject(whereObj: unknown, path = '$'): ValidationResult {
  if (whereObj == null || typeof whereObj !== 'object') return { ok: true };
  for (const [key, value] of Object.entries(whereObj as Record<string, unknown>)) {
    if (key.startsWith('$')) {
      if (!ALLOWED_WHERE_OPERATORS.has(key)) {
        return { ok: false, error: { code: 'CLIENT_VALIDATION', message: `Disallowed operator ${key} at ${path}` } };
      }
      if (key === '$and' || key === '$or' || key === '$nor') {
        if (Array.isArray(value)) {
          for (let i = 0; i < value.length; i++) {
            const res = validateWhereObject(value[i], `${path}.${key}[${i}]`);
            if (!res.ok) return res;
          }
        }
        continue;
      }
      // $not wraps a single condition object
      if (key === '$not') {
        if (value && typeof value === 'object') {
          const res = validateWhereObject(value, `${path}.${key}`);
          if (!res.ok) return res;
        }
        continue;
      }
    }
    if (value && typeof value === 'object') {
      const res = validateWhereObject(value, `${path}.${key}`);
      if (!res.ok) return res;
    }
  }
  return { ok: true };
}

function validatePipeline(pipeline: unknown): ValidationResult {
  if (!Array.isArray(pipeline)) {
    return { ok: false, error: { code: 'CLIENT_VALIDATION', message: 'Aggregation pipeline must be an array' } };
  }
  if (pipeline.length === 0) {
    return { ok: false, error: { code: 'CLIENT_VALIDATION', message: 'Aggregation pipeline must include a final $limit stage' } };
  }
  for (let i = 0; i < pipeline.length; i++) {
    const stage = pipeline[i];
    const keys = stage && typeof stage === 'object' ? Object.keys(stage) : [];
    if (keys.length !== 1) {
      return { ok: false, error: { code: 'CLIENT_VALIDATION', message: `Aggregation stage at index ${i} must have exactly one key` } };
    }
    if (!ALLOWED_AGG_STAGES.has(keys[0])) {
      return { ok: false, error: { code: 'CLIENT_VALIDATION', message: `Forbidden stage ${keys[0]} at index ${i}` } };
    }
  }
  const last = pipeline[pipeline.length - 1] as Record<string, unknown>;
  const lastKey = last && typeof last === 'object' ? Object.keys(last)[0] : null;
  if (lastKey !== '$limit') {
    return { ok: false, error: { code: 'CLIENT_VALIDATION', message: 'Aggregation must end with a final $limit stage' } };
  }
  const limitVal = last['$limit'];
  if (typeof limitVal !== 'number' || !Number.isFinite(limitVal) || limitVal <= 0) {
    return { ok: false, error: { code: 'CLIENT_VALIDATION', message: 'Final $limit must be a positive number' } };
  }
  if (limitVal > 1000) {
    return { ok: false, error: { code: 'CLIENT_VALIDATION', message: 'Final $limit must be ≤ 1000' } };
  }
  return { ok: true };
}

function validateProjection(proj: unknown): ValidationResult {
  if (proj == null || typeof proj !== 'object') return { ok: true };
  for (const [key, value] of Object.entries(proj as Record<string, unknown>)) {
    if (HEAVY_ARRAY_FIELDS.has(key) && value === 1) {
      return {
        ok: false,
        error: {
          code: 'CLIENT_VALIDATION',
          message: `Projection "${key}: 1" returns the full embedded array and may be too large. Use dot notation like "${key}.id": 1, "${key}.name": 1, or use the dedicated subcomponent tool with limit/skip.`,
        },
      };
    }
  }
  return { ok: true };
}

export function validateDataMartQuery(body: DataMartBody | null | undefined): ValidationResult {
  if (!body || typeof body !== 'object') return { ok: true };

  const query = body.query ?? '';
  const variables = (body.variables ?? {}) as Record<string, unknown>;

  if (selectsJsonSubfields(query)) {
    return { ok: false, error: { code: 'CLIENT_VALIDATION', message: 'Do not select subfields of JSON; project fields via variables (proj / w / p) instead.' } };
  }

  const proj = variables.proj ?? variables.project;
  if (proj) {
    const projRes = validateProjection(proj);
    if (!projRes.ok) return projRes;
  }

  if (isAggregateQuery(query)) {
    const pipeline = variables.p ?? variables.pipeline;
    const res = validatePipeline(pipeline);
    if (!res.ok) return res;
    if (pipelineHasFacet(pipeline as unknown[])) {
      return {
        ok: false,
        error: {
          code: 'CLIENT_VALIDATION',
          message: 'Forbidden stage $facet. For totals use components(where...).total with limit=1, or run separate $count pipelines.',
        },
      };
    }
    return { ok: true };
  }

  if (isListQuery(query)) {
    const limit = variables.limit;
    if (typeof limit === 'number' && limit > 100) {
      return { ok: true, warning: 'High limit requested (>100). Server may clamp to 200.' };
    }
    const whereObj = variables.w ?? variables.where;
    if (whereObj) {
      const res = validateWhereObject(whereObj, '$.w');
      if (!res.ok) return res;
    }
    return { ok: true };
  }

  const genericWhere = variables.w ?? variables.where;
  if (genericWhere) {
    const res = validateWhereObject(genericWhere, '$.w');
    if (!res.ok) return res;
  }

  return { ok: true };
}
