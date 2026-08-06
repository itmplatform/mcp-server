import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Clients } from '../clients/index.js';
import { hasScope, type EffectiveUserContext } from '../auth/effective-user-context.js';
import { buildInsufficientScopeResponse, buildWriteResponse } from './write-tools.js';

type JsonRecord = Record<string, unknown>;

// v1 timehours licenses allowed to write another user's timesheet
// (mirror of TimeEntryAuthorizationPolicy: Company Admin or Full Access).
const ON_BEHALF_LICENSE_TYPES = new Set([0, 1]);
const MAX_DAY_MINUTES = 24 * 60;

export function parseReportedHours(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  const text = String(value).trim();
  if (!text) return 0;
  const match = /^(\d{1,3}):(\d{1,2})$/.exec(text);
  if (!match) {
    throw new Error(`Unexpected ReportedHours format from REST: "${text}"`);
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

export function formatReportedHours(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}:${String(minutes).padStart(2, '0')}`;
}

// Walks the v1 timesheet shape: TimeReports (entity) > WorkItems (task) > TimeEntries (day).
export function findReportedMinutes(timesheet: unknown, projectId: number, taskId: number, date: string): number {
  if (!timesheet || typeof timesheet !== 'object') return 0;
  const reports = (timesheet as JsonRecord).TimeReports;
  if (!Array.isArray(reports)) return 0;
  for (const report of reports as JsonRecord[]) {
    if (report.EntityId !== projectId) continue;
    const workItems = report.WorkItems;
    if (!Array.isArray(workItems)) continue;
    for (const workItem of workItems as JsonRecord[]) {
      if (workItem.WorkItemId !== taskId) continue;
      const entries = workItem.TimeEntries;
      if (!Array.isArray(entries)) continue;
      for (const entry of entries as JsonRecord[]) {
        if (typeof entry.Date === 'string' && entry.Date.slice(0, 10) === date) {
          return parseReportedHours(entry.ReportedHours);
        }
      }
    }
  }
  return 0;
}

function buildValidationError(message: string): { content: Array<{ type: 'text'; text: string }>; isError: true } {
  return { content: [{ type: 'text' as const, text: `Validation error: ${message}` }], isError: true };
}

function isValidIsoDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

function localToday(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function timesheetPath(date: string, userId: number): string {
  return `timehours?startdate=${date}&enddate=${date}&teammember=${userId}`;
}

function collectRestErrors(response: unknown): string | undefined {
  if (!response || typeof response !== 'object') return undefined;
  const record = response as JsonRecord;
  const statusCode = typeof record.StatusCode === 'number' ? record.StatusCode : 200;
  const errors = Array.isArray(record.Errors) ? record.Errors as JsonRecord[] : [];
  if (statusCode < 400 && !errors.length) return undefined;
  const messages = errors.map(error => String(error.Message ?? '')).filter(Boolean);
  if (!messages.length && typeof record.StatusMessage === 'string') messages.push(record.StatusMessage);
  return messages.join('; ') || `REST reported status ${statusCode}`;
}

export function registerTimeEntryTools(
  server: McpServer,
  clients: Clients,
  effectiveUserContext?: EffectiveUserContext,
): void {
  if (effectiveUserContext && !hasScope(effectiveUserContext, 'mcp:write')) {
    return;
  }

  server.registerTool(
    'log_time_entry',
    {
      description: 'Log actual worked hours on a task for one user and date. ITM Platform stores ONE total per '
        + 'user+task+date: mode "add" adds to it, "set" replaces it (0:00 clears). The response echoes the previous and new '
        + 'totals. The user must be assigned to the task (TaskMembers on update_task) and the project status must allow time '
        + 'entry (closed projects block it). userId defaults to the session user; another user requires a Company Admin or '
        + 'Full Access license and the hours are attributed to that user.',
      inputSchema: {
        projectId: z.number().describe('Project ID containing the task'),
        taskId: z.number().describe('Task ID to log time on'),
        date: z.string().describe('Work date (YYYY-MM-DD); not in the future'),
        hours: z.number().int().min(0).max(24).describe('Whole hours worked'),
        minutes: z.number().int().min(0).max(59).optional().describe('Minutes worked, 0-59 (default 0)'),
        mode: z.enum(['set', 'add']).describe('"add" adds to the existing total; "set" replaces it'),
        userId: z.number().optional().describe('User to log time for (default: session user)'),
        comment: z.string().optional().describe('Comment stored on the day\'s entry'),
      },
    },
    async (args) => {
      if (effectiveUserContext && !hasScope(effectiveUserContext, 'mcp:write')) return buildInsufficientScopeResponse();

      const date = args.date as string;
      if (!isValidIsoDate(date)) {
        return buildValidationError(`date must be a valid YYYY-MM-DD date, got "${date}"`);
      }
      if (date > localToday()) {
        return buildValidationError(`date ${date} is in the future; time can only be logged up to today`);
      }

      const sessionUserId = effectiveUserContext?.userId;
      const targetUserId = (args.userId as number | undefined) ?? sessionUserId;
      if (targetUserId === undefined) {
        return buildValidationError('userId is required when the session user is unknown');
      }
      if (effectiveUserContext && targetUserId !== sessionUserId
        && !effectiveUserContext.licenseTypeIds.some(id => ON_BEHALF_LICENSE_TYPES.has(id))) {
        return buildValidationError(
          `Logging time for another user (${targetUserId}) requires a Company Admin or Full Access license; `
          + 'your session can only log its own hours',
        );
      }

      const requestedMinutes = (args.hours as number) * 60 + ((args.minutes as number | undefined) ?? 0);

      const before = await clients.restV1.get(timesheetPath(date, targetUserId));
      const previousMinutes = findReportedMinutes(before, args.projectId as number, args.taskId as number, date);

      const newTotalMinutes = args.mode === 'add' ? previousMinutes + requestedMinutes : requestedMinutes;
      if (newTotalMinutes > MAX_DAY_MINUTES) {
        return buildValidationError(
          `the resulting total ${formatReportedHours(newTotalMinutes)} exceeds 24 hours for ${date} `
          + `(existing total ${formatReportedHours(previousMinutes)})`,
        );
      }

      const response = await clients.restV1.post('timehours', {
        UserId: targetUserId,
        TimeReports: [{
          EntityId: args.projectId,
          WorkItemId: args.taskId,
          Date: date,
          ReportedHours: formatReportedHours(newTotalMinutes),
          ...(args.comment !== undefined ? { UserComment: args.comment } : {}),
        }],
      });

      const restError = collectRestErrors(response);
      if (restError) {
        const hint = restError.includes('not assigned')
          ? ' Assign the user to the task first with update_task (TaskMembers/TaskManagers accept comma-separated usernames), then retry.'
          : '';
        return { content: [{ type: 'text' as const, text: `Time entry failed: ${restError}.${hint}` }], isError: true };
      }

      const after = await clients.restV1.get(timesheetPath(date, targetUserId));
      const readbackMinutes = findReportedMinutes(after, args.projectId as number, args.taskId as number, date);
      if (readbackMinutes !== newTotalMinutes) {
        throw new Error(
          `Source-of-truth write verification failed for log_time_entry: expected total `
          + `${formatReportedHours(newTotalMinutes)} but read back ${formatReportedHours(readbackMinutes)}`,
        );
      }

      return buildWriteResponse({
        projectId: args.projectId,
        taskId: args.taskId,
        userId: targetUserId,
        date,
        mode: args.mode,
        logged: formatReportedHours(requestedMinutes),
        previousTotal: formatReportedHours(previousMinutes),
        newTotal: formatReportedHours(newTotalMinutes),
        ...(args.comment !== undefined ? { comment: args.comment } : {}),
      });
    },
  );
}
