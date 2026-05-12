export const COMPONENTS_QUERY = `query($w: JSON, $proj: JSON, $sort: JSON, $limit: Int, $skip: Int) {
  components(where: $w, project: $proj, sort: $sort, limit: $limit, skip: $skip) {
    items total limit skip
  }
}`;

export const COMPONENT_QUERY = `query($id: ID!, $proj: JSON) {
  component(id: $id, project: $proj)
}`;

export const AGGREGATE_QUERY = `query($p: JSON!) {
  aggregateComponents(pipeline: $p)
}`;

export const DEFAULT_PROJECT_FIELDS = {
  id: 1, name: 1, code: 1, componentType: 1,
  statusLabel: 1, priorityLabel: 1, percentComplete: 1,
  startDate: 1, endDate: 1,
  'managers.name': 1, 'managers.userId': 1,
  methodology: 1, customTypeLabel: 1,
};

export const MAX_LIST_LIMIT = 200;
export const MAX_AGG_LIMIT = 1000;

export function clampLimit(limit: number | undefined, max: number): number {
  if (limit === undefined || limit <= 0) return 50;
  return Math.min(limit, max);
}
