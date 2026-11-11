import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Clients } from '../clients/index.js';
import {
  buildFieldProjection,
  buildPageResult,
  fetchSubcomponentPage,
  fitPageToBudget,
  pageToolResult,
} from './subcomponent-page.js';
import { AGGREGATE_QUERY, MAX_LIST_LIMIT, clampLimit } from './graphql-queries.js';
import { PAGE_BUDGET_BYTES } from '../validation/result-size-guard.js';

export interface SearchTasksArgs {
  query?: string;
  status?: string;
  assignee?: string;
  category?: string;
  projectId?: number;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  skip?: number;
  fields?: string[];
}

type JsonRecord = Record<string, unknown>;

const FIELD_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)*$/;

export const TASK_PAGE_HINT = 'Page trimmed to stay within the response size limit. Continue with skip=nextSkip, '
  + 'or pass fields with only the task fields you need to receive more tasks per page.';

const TASK_SIZE_GUIDANCE = 'Each task is returned whole, including its progress history (progressReports), assignments, '
  + 'category effort, and custom fields, unless fields is given. '
  + 'Responses stay under a size limit: when the requested tasks do not fit, the page comes back shorter with '
  + 'trimmedForSize: true, limit set to the number of tasks returned, and nextSkip to continue. '
  + 'Pass fields (for example ["name","statusLabel","percentComplete","endDate"]) to receive more tasks per page; '
  + 'field names are listed in the itm://schema/tasks resource. '
  + 'A task whose progress history alone exceeds the limit comes with its newest progressReports, progressReportsTotal, '
  + 'and progressReportsTruncated: true; read the full history with list_task_progress.';

const fieldsSchema = z.array(z.string()).max(60).optional()
  .describe('Task fields to return, for example ["name","statusLabel","endDate"]; id is always included. '
    + 'Dot notation selects nested fields (assignments.displayName). Omit to return whole tasks.');

export function validateTaskFields(fields: string[] | undefined): void {
  for (const field of fields ?? []) {
    if (!FIELD_NAME_PATTERN.test(field)) {
      throw new Error(`Invalid field name "${field}". Use task field names such as "name" or "assignments.displayName", `
        + 'as listed in the itm://schema/tasks resource.');
    }
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function byteLength(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

/**
 * Shortens a task that does not fit the page budget on its own: keeps the
 * newest progress reports that fit in maxBytes and states the total. Every
 * other field stays whole. Accepts a list_project_tasks item (the task) or a
 * search_tasks item ({ projectId, projectName, task }).
 */
export function shrinkTaskProgressReports(item: unknown, maxBytes: number): unknown {
  if (!isRecord(item)) return item;

  if (isRecord(item.task) && 'projectId' in item) {
    const wrapperBytes = byteLength({ ...item, task: {} }) - 2;
    const task = shrinkTaskProgressReports(item.task, maxBytes - wrapperBytes);
    return task === item.task ? item : { ...item, task };
  }

  const reports = item.progressReports;
  if (!Array.isArray(reports)) return item;

  const newestFirst = [...reports].sort((a, b) =>
    String((b as JsonRecord)?.reportDate ?? '').localeCompare(String((a as JsonRecord)?.reportDate ?? '')));
  const build = (count: number) => ({
    ...item,
    progressReports: newestFirst.slice(0, count),
    progressReportsTotal: reports.length,
    progressReportsTruncated: true,
  });

  let low = 0;
  let high = newestFirst.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (byteLength(build(mid)) <= maxBytes) low = mid;
    else high = mid - 1;
  }
  return build(low);
}

function buildTaskFilterMatch(args: SearchTasksArgs): Record<string, unknown> {
  const match: Record<string, unknown> = {};
  if (args.query) match['tasks.name'] = { $regex: args.query, $options: 'i' };
  if (args.status) match['tasks.statusLabel'] = { $regex: args.status, $options: 'i' };
  if (args.assignee) match['tasks.teamMemberDisplayNames'] = { $regex: args.assignee, $options: 'i' };
  if (args.category) match['tasks.category'] = { $eq: args.category };
  if (args.dateFrom) match['tasks.startDate'] = { $gte: args.dateFrom };
  if (args.dateTo) match['tasks.endDate'] = { $lte: args.dateTo };
  return match;
}

function buildSearchTasksBaseStages(args: SearchTasksArgs): Record<string, unknown>[] {
  const componentMatch: Record<string, unknown> = { componentType: { $eq: 'project' } };
  if (args.projectId !== undefined) componentMatch.id = { $eq: args.projectId };

  const stages: Record<string, unknown>[] = [
    { $match: componentMatch },
    { $unwind: '$tasks' },
  ];

  const taskMatch = buildTaskFilterMatch(args);
  if (Object.keys(taskMatch).length) stages.push({ $match: taskMatch });

  return stages;
}

export function buildSearchTasksPipeline(args: SearchTasksArgs): Record<string, unknown>[] {
  const stages: Record<string, unknown>[] = [
    ...buildSearchTasksBaseStages(args),
    { $project: { _id: 0, projectId: '$id', projectName: '$name', task: '$tasks' } },
    // task.id breaks end-date ties so consecutive pages neither repeat nor skip tasks.
    { $sort: { 'task.endDate': 1, 'task.id': 1 } },
    { $skip: args.skip ?? 0 },
    { $limit: clampLimit(args.limit, MAX_LIST_LIMIT) },
  ];
  if (args.fields?.length) {
    stages.push({ $project: { projectId: 1, projectName: 1, ...buildFieldProjection('task', args.fields) } });
  }
  return stages;
}

export function buildSearchTasksCountPipeline(args: SearchTasksArgs): Record<string, unknown>[] {
  return [
    ...buildSearchTasksBaseStages(args),
    { $group: { _id: null, count: { $sum: 1 } } },
    { $limit: 1 },
  ];
}

export function registerTaskTools(server: McpServer, clients: Clients) {
  server.registerTool(
    'list_project_tasks',
    {
      description: 'List tasks for a project with pagination. Returns { items, total, limit, skip, hasMore }. Default limit: 50, max: 200. '
        + TASK_SIZE_GUIDANCE,
      inputSchema: {
        projectId: z.number().describe('The project ID'),
        limit: z.number().optional().describe('Max tasks to return (default 50, max 200)'),
        skip: z.number().optional().describe('Number of tasks to skip (for pagination)'),
        fields: fieldsSchema,
      },
    },
    async (args) => {
      validateTaskFields(args.fields);
      const page = await fetchSubcomponentPage(clients, args.projectId, 'tasks', args.limit, args.skip, {
        fields: args.fields,
        hint: TASK_PAGE_HINT,
        shrinkItem: shrinkTaskProgressReports,
      });
      return pageToolResult(page);
    },
  );

  server.registerTool(
    'get_task',
    {
      description: 'Get full detail of a single task from v2 REST (source of truth, not affected by DataMart sync delay). '
        + 'Returns dates, status, type, priority, kind, parent task, sprint, and has-subcomponent flags. '
        + 'Use list_project_tasks or search_tasks first to discover task IDs.',
      inputSchema: {
        projectId: z.number().describe('The project ID containing the task'),
        taskId: z.number().describe('The task ID'),
      },
    },
    async (args) => {
      const task = await clients.rest.get(`projects/${args.projectId}/tasks/${args.taskId}`);
      return { content: [{ type: 'text' as const, text: JSON.stringify(task, null, 2) }] };
    },
  );

  server.registerTool(
    'search_tasks',
    {
      description: 'Search tasks across all projects in the account (DataMart). Filters combine with AND. '
        + 'Returns { items, total, limit, skip, hasMore } where each item is { projectId, projectName, task }, ordered by task end date. '
        + 'Results may lag writes by up to 60 seconds (DataMart eventual consistency); use get_task for the confirmed state of one task. '
        + 'Default limit: 50, max: 200. '
        + TASK_SIZE_GUIDANCE,
      inputSchema: {
        query: z.string().optional().describe('Case-insensitive task name filter'),
        status: z.string().optional().describe('Case-insensitive status label filter (e.g. "In progress")'),
        assignee: z.string().optional().describe('Case-insensitive team member display name filter'),
        category: z.enum(['Task', 'Milestone', 'Summary']).optional().describe('Task kind filter'),
        projectId: z.number().optional().describe('Narrow the search to a single project'),
        dateFrom: z.string().optional().describe('Only tasks starting on or after this date (YYYY-MM-DD)'),
        dateTo: z.string().optional().describe('Only tasks ending on or before this date (YYYY-MM-DD)'),
        limit: z.number().optional().describe('Max tasks to return (default 50, max 200)'),
        skip: z.number().optional().describe('Number of tasks to skip (for pagination)'),
        fields: fieldsSchema,
      },
    },
    async (args) => {
      validateTaskFields(args.fields);
      const limit = clampLimit(args.limit, MAX_LIST_LIMIT);
      const skip = args.skip ?? 0;

      const [pageData, countData] = await Promise.all([
        clients.datamart.query({ query: AGGREGATE_QUERY, variables: { p: buildSearchTasksPipeline(args) } }),
        clients.datamart.query({ query: AGGREGATE_QUERY, variables: { p: buildSearchTasksCountPipeline(args) } }),
      ]);

      const items = (pageData.aggregateComponents as unknown[]) ?? [];
      const countRow = ((countData.aggregateComponents as unknown[]) ?? [])[0] as { count?: number } | undefined;
      const page = fitPageToBudget(buildPageResult(items, countRow?.count ?? items.length, limit, skip), PAGE_BUDGET_BYTES, {
        hint: TASK_PAGE_HINT,
        shrinkItem: shrinkTaskProgressReports,
      });
      return pageToolResult(page);
    },
  );
}
