import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Clients } from '../clients/index.js';
import { fetchSubcomponentPage, buildPageResult } from './subcomponent-page.js';
import { AGGREGATE_QUERY, MAX_LIST_LIMIT, clampLimit } from './graphql-queries.js';

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
  return [
    ...buildSearchTasksBaseStages(args),
    { $project: { _id: 0, projectId: '$id', projectName: '$name', task: '$tasks' } },
    { $sort: { 'task.endDate': 1 } },
    { $skip: args.skip ?? 0 },
    { $limit: clampLimit(args.limit, MAX_LIST_LIMIT) },
  ];
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
      description: 'List tasks for a project with pagination. Returns { items, total, limit, skip, hasMore }. Default limit: 50, max: 200.',
      inputSchema: {
        projectId: z.number().describe('The project ID'),
        limit: z.number().optional().describe('Max tasks to return (default 50, max 200)'),
        skip: z.number().optional().describe('Number of tasks to skip (for pagination)'),
      },
    },
    async (args) => {
      const page = await fetchSubcomponentPage(clients, args.projectId, 'tasks', args.limit, args.skip);
      return { content: [{ type: 'text' as const, text: JSON.stringify(page, null, 2) }] };
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
        + 'Returns { items, total, limit, skip, hasMore } where each item is { projectId, projectName, task }. '
        + 'Results may lag writes by up to 60 seconds (DataMart eventual consistency); use get_task for the confirmed state of one task. '
        + 'Default limit: 50, max: 200.',
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
      },
    },
    async (args) => {
      const limit = clampLimit(args.limit, MAX_LIST_LIMIT);
      const skip = args.skip ?? 0;

      const [pageData, countData] = await Promise.all([
        clients.datamart.query({ query: AGGREGATE_QUERY, variables: { p: buildSearchTasksPipeline(args) } }),
        clients.datamart.query({ query: AGGREGATE_QUERY, variables: { p: buildSearchTasksCountPipeline(args) } }),
      ]);

      const items = (pageData.aggregateComponents as unknown[]) ?? [];
      const countRow = ((countData.aggregateComponents as unknown[]) ?? [])[0] as { count?: number } | undefined;
      const page = buildPageResult(items, countRow?.count ?? items.length, limit, skip);
      return { content: [{ type: 'text' as const, text: JSON.stringify(page, null, 2) }] };
    },
  );
}
