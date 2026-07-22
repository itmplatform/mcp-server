import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Clients } from '../clients/index.js';
import { hasScope, type EffectiveUserContext } from '../auth/effective-user-context.js';
import { buildInsufficientScopeResponse, buildWriteResponse } from './write-tools.js';

type JsonRecord = Record<string, unknown>;

export interface EffortEstimateChange {
  userId: number;
  estimatedHours: number;
  estimatedMinutes: number;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function teamPath(projectId: number, taskId: number): string {
  return `projects/${projectId}/tasks/${taskId}/effortbyteammember`;
}

function categoryPath(projectId: number, taskId: number): string {
  return `projects/${projectId}/tasks/${taskId}/effortbycategory`;
}

// PUT .../Effort is a hybrid write: the task total estimate is overwritten
// unconditionally, the category set is fully replaced, and each listed user
// row is overwritten whole (omitted fields become 0/false/null). The payload
// must therefore echo every value it does not intend to change.
export function buildEffortUpdatePayload(
  changes: EffortEstimateChange[],
  teamRows: JsonRecord[],
  categoryRows: JsonRecord[],
  taskTotal?: { hours: number; minutes: number },
): JsonRecord {
  const seen = new Set<number>();
  for (const change of changes) {
    if (seen.has(change.userId)) {
      throw new Error(`Duplicate userId ${change.userId} in userEstimates -- list each user at most once`);
    }
    seen.add(change.userId);
  }

  const userEfforts = changes.map(change => {
    const rows = teamRows.filter(row => row.UserId === change.userId);
    if (!rows.length) {
      throw new Error(
        `User ${change.userId} is not assigned to this task. Assign them first with update_task `
        + '(TaskMembers/TaskManagers accept comma-separated usernames), then retry.',
      );
    }
    if (rows.length > 1) {
      throw new Error(`User ${change.userId} has multiple assignment rows on this task; refusing an ambiguous update`);
    }
    const row = rows[0];
    return {
      TaskUserId: row.TaskUserId as number,
      UserId: change.userId,
      EstimatedHours: change.estimatedHours,
      EstimatedMins: change.estimatedMinutes,
      ActualEffortAcceptedHours: asNumber(row.ActualEffortAcceptedHours, 0),
      ActualEffortAcceptedMins: asNumber(row.ActualEffortAcceptedMins, 0),
      IsAutomaticActualEffortAccepted: typeof row.IsAutomaticActualEffortAccepted === 'boolean'
        ? row.IsAutomaticActualEffortAccepted
        : true,
      BillingCategoryId: row.BillingCategoryId ?? null,
    };
  });

  // EffortByCategory also returns rows that merely project the assigned
  // users' categories (all zeros, auto-accept). Echoing those would INSERT
  // tblTaskWorkTime rows that never existed (the PUT fully replaces the
  // table), so only rows carrying standalone category data are echoed.
  const categoryEfforts = categoryRows.filter(row =>
    asNumber(row.NonAssignedEffortHours, 0) !== 0
    || asNumber(row.NonAssignedEffortMins, 0) !== 0
    || asNumber(row.ActualEffortAcceptedHours, 0) !== 0
    || asNumber(row.ActualEffortAcceptedMins, 0) !== 0
    || row.IsAutomaticActualEffortAccepted === false,
  ).map(row => ({
    CategoryId: (row.MasterCategoryId ?? null) as number | null,
    CategoryType: asNumber(row.CategoryTypeId, 0),
    NonAssignedEffortHours: asNumber(row.NonAssignedEffortHours, 0),
    NonAssignedEffortMins: asNumber(row.NonAssignedEffortMins, 0),
    ActualEffortAcceptedHours: asNumber(row.ActualEffortAcceptedHours, 0),
    ActualEffortAcceptedMins: asNumber(row.ActualEffortAcceptedMins, 0),
    IsAutomaticActualEffortAccepted: typeof row.IsAutomaticActualEffortAccepted === 'boolean'
      ? row.IsAutomaticActualEffortAccepted
      : true,
  }));

  let totalHours: number;
  let totalMins: number;
  if (taskTotal) {
    totalHours = taskTotal.hours;
    totalMins = taskTotal.minutes;
  } else if (categoryRows.length) {
    totalHours = asNumber(categoryRows[0].TotalEstimatedEffortHours, 0);
    totalMins = asNumber(categoryRows[0].TotalEstimatedEffortMins, 0);
  } else {
    // No category rows to read the current total from: derive it from the
    // post-change per-user estimates (the same rule the Kanban UI applies).
    const changed = new Map(changes.map(change => [change.userId, change]));
    let minutes = 0;
    for (const row of teamRows) {
      const change = changed.get(row.UserId as number);
      minutes += change
        ? change.estimatedHours * 60 + change.estimatedMinutes
        : asNumber(row.EstimatedEffortHours, 0) * 60 + asNumber(row.EstimatedEffortMins, 0);
    }
    totalHours = Math.floor(minutes / 60);
    totalMins = minutes % 60;
  }

  return {
    UserEfforts: userEfforts,
    CategoryEfforts: categoryEfforts,
    TaskTotalEstimateHours: totalHours,
    TaskTotalEstimateMins: totalMins,
  };
}

function buildEffortValidationError(message: string): { content: Array<{ type: 'text'; text: string }>; isError: true } {
  return { content: [{ type: 'text' as const, text: `Validation error: ${message}` }], isError: true };
}

function verifyEstimateReadback(changes: EffortEstimateChange[], readbackRows: JsonRecord[]): void {
  const mismatches: string[] = [];
  for (const change of changes) {
    const row = readbackRows.find(candidate => candidate.UserId === change.userId);
    if (!row) {
      mismatches.push(`user ${change.userId} missing from readback`);
      continue;
    }
    if (asNumber(row.EstimatedEffortHours, -1) !== change.estimatedHours
      || asNumber(row.EstimatedEffortMins, -1) !== change.estimatedMinutes) {
      mismatches.push(
        `user ${change.userId} expected ${change.estimatedHours}h${change.estimatedMinutes}m `
        + `but read back ${row.EstimatedEffortHours}h${row.EstimatedEffortMins}m`,
      );
    }
  }
  if (mismatches.length) {
    throw new Error(`Source-of-truth write verification failed for update_task_effort: ${mismatches.join('; ')}`);
  }
}

export function registerEffortTools(
  server: McpServer,
  clients: Clients,
  effectiveUserContext?: EffectiveUserContext,
): void {

  server.registerTool(
    'get_task_effort',
    {
      description: 'Get the effort breakdown of a task: per team member (teamMembers) and per professional category (categories). '
        + 'Distinguishes three concepts: ESTIMATED effort (planned hours), ACCEPTED actual effort (a derived aggregate), and actual effort from TIME ENTRIES (worked hours logged). '
        + 'teamMembers doubles as the task team list: each row has UserId, DisplayName, EmailAddress, plus TaskUserId (the assignment id used by effort updates). '
        + 'Use update_task_effort to change per-user estimated hours.',
      inputSchema: {
        projectId: z.number().describe('The project ID containing the task'),
        taskId: z.number().describe('The task ID'),
      },
    },
    async (args) => {
      const [teamMembers, categories] = await Promise.all([
        clients.rest.get(teamPath(args.projectId, args.taskId)),
        clients.rest.get(categoryPath(args.projectId, args.taskId)),
      ]);
      return { content: [{ type: 'text' as const, text: JSON.stringify({ teamMembers, categories }, null, 2) }] };
    },
  );

  if (effectiveUserContext && !hasScope(effectiveUserContext, 'mcp:write')) {
    return;
  }

  server.registerTool(
    'update_task_effort',
    {
      description: 'Set the ESTIMATED (planned) effort of a task per assigned user. This is planning data, not time logging: '
        + 'it never writes worked hours, accepted effort, or billing categories (those are read and preserved). '
        + 'Each target user must already be assigned to the task (assign with update_task TaskMembers/TaskManagers first; discover assignees with get_task_effort). '
        + 'Users not listed keep their current estimates. The task total estimate is preserved unless taskTotalEstimate is provided. '
        + 'Not allowed on milestones or summary tasks. Returns the effort breakdown read back from v2 REST.',
      inputSchema: {
        projectId: z.number().describe('The project ID containing the task'),
        taskId: z.number().describe('The task ID (a regular task, not a milestone or summary)'),
        userEstimates: z.array(z.object({
          userId: z.number().describe('The assigned user\'s ID (see get_task_effort teamMembers or search_users)'),
          estimatedHours: z.number().int().min(0).describe('Estimated hours (whole hours part)'),
          estimatedMinutes: z.number().int().min(0).max(59).describe('Estimated minutes part, 0-59'),
        })).min(1).describe('New estimated effort per user; each user at most once'),
        taskTotalEstimate: z.object({
          hours: z.number().int().min(0).describe('Task total estimate, hours part'),
          minutes: z.number().int().min(0).max(59).describe('Task total estimate, minutes part, 0-59'),
        }).optional().describe('Optional new task-level total estimate; when omitted the current total is preserved'),
      },
    },
    async (args) => {
      if (effectiveUserContext && !hasScope(effectiveUserContext, 'mcp:write')) return buildInsufficientScopeResponse();

      const changes = args.userEstimates as EffortEstimateChange[];

      // The backend write validates neither task-project pairing nor task kind;
      // both checks must pass before anything else is fetched or written
      // (the effort GETs themselves error on milestones).
      const task = await clients.rest.get(`projects/${args.projectId}/tasks/${args.taskId}`) as JsonRecord;
      const taskProjectId = asNumber(task?.ProjectId, args.projectId);
      if (taskProjectId !== args.projectId) {
        return buildEffortValidationError(`Task ${args.taskId} does not belong to project ${args.projectId} (it belongs to project ${taskProjectId})`);
      }
      const kindId = asNumber(task?.KindId, 0);
      if (kindId === 1) return buildEffortValidationError(`Task ${args.taskId} is a milestone; milestones have no effort`);
      if (kindId === 2) return buildEffortValidationError(`Task ${args.taskId} is a summary task; set effort on its child tasks instead`);

      const [teamRows, categoryRows] = await Promise.all([
        clients.rest.get(teamPath(args.projectId, args.taskId)) as Promise<JsonRecord[]>,
        clients.rest.get(categoryPath(args.projectId, args.taskId)) as Promise<JsonRecord[]>,
      ]);

      let body: JsonRecord;
      try {
        body = buildEffortUpdatePayload(changes, teamRows, categoryRows, args.taskTotalEstimate as { hours: number; minutes: number } | undefined);
      } catch (err) {
        return buildEffortValidationError(err instanceof Error ? err.message : String(err));
      }

      await clients.rest.put(`projects/${args.projectId}/tasks/${args.taskId}/effort`, body);

      const [teamReadback, categoryReadback] = await Promise.all([
        clients.rest.get(teamPath(args.projectId, args.taskId)) as Promise<JsonRecord[]>,
        clients.rest.get(categoryPath(args.projectId, args.taskId)) as Promise<JsonRecord[]>,
      ]);
      verifyEstimateReadback(changes, teamReadback);
      return buildWriteResponse({ teamMembers: teamReadback, categories: categoryReadback });
    },
  );
}
