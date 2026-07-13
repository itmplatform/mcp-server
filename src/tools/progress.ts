import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Clients } from '../clients/index.js';
import { hasScope, type EffectiveUserContext } from '../auth/effective-user-context.js';
import {
  buildInsufficientScopeResponse,
  buildWriteResponse,
  extractResponseId,
  verifyRequestedFields,
  type VerificationField,
} from './write-tools.js';

type JsonRecord = Record<string, unknown>;

export const TASK_PROGRESS_VERIFICATION_FIELDS: VerificationField[] = [
  { requestField: 'Percentage', readPaths: ['Percentage'] },
  { requestField: 'AssessmentId', readPaths: ['AssessmentId'] },
  { requestField: 'ShortDescription', readPaths: ['ShortDescription'] },
  { requestField: 'Description', readPaths: ['Description'] },
  { requestField: 'ReportDate', readPaths: ['ReportDate'] },
];

const PROGRESS_FIELD_MAP: Array<[input: string, restField: string]> = [
  ['reportDate', 'ReportDate'],
  ['percentage', 'Percentage'],
  ['assessmentId', 'AssessmentId'],
  ['shortDescription', 'ShortDescription'],
  ['description', 'Description'],
];

function mapProgressFields(source: JsonRecord): JsonRecord {
  const body: JsonRecord = {};
  for (const [input, restField] of PROGRESS_FIELD_MAP) {
    if (Object.prototype.hasOwnProperty.call(source, input) && source[input] !== undefined) {
      body[restField] = source[input];
    }
  }
  return body;
}

export function splitCreateTaskProgressArgs(args: { projectId: number; taskId: number; [key: string]: unknown }) {
  const { projectId, taskId, ...rest } = args;
  const body = mapProgressFields(rest);
  // The web UI always sends AutoProjectFollowUp; without it a task progress
  // entry would not cascade to project-level progress.
  body.AutoProjectFollowUp = true;
  return { path: `projects/${projectId}/tasks/${taskId}/progress`, body };
}

export function splitUpdateTaskProgressArgs(args: { projectId: number; taskId: number; progressId: number; [key: string]: unknown }) {
  const { projectId, taskId, progressId, ...rest } = args;
  const body = mapProgressFields(rest);
  if (!Object.keys(body).length) {
    throw new Error('update_task_progress requires at least one field to change (reportDate, percentage, assessmentId, shortDescription, or description)');
  }
  body.AutoProjectFollowUp = true;
  return { path: `projects/${projectId}/tasks/${taskId}/progress/${progressId}`, body };
}

export function registerProgressTools(
  server: McpServer,
  clients: Clients,
  effectiveUserContext?: EffectiveUserContext,
): void {

  server.registerTool(
    'list_task_progress',
    {
      description: 'List the progress (seguimiento/follow-up) history for a task, newest first. Each entry contains TaskFollowUpId, Percentage, AssessmentId, ShortDescription, Description, ReportDate, CreatedBy, IsCompleted. Task progress is a time-series of entries, not a single field on the task; this is why update_task rejects PercentComplete.',
      inputSchema: {
        projectId: z.number().describe('The project ID containing the task'),
        taskId: z.number().describe('The task ID to list progress entries for'),
      },
    },
    async (args) => {
      const data = await clients.rest.get(`projects/${args.projectId}/tasks/${args.taskId}/progress`);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.registerTool(
    'get_project_progress',
    {
      description: 'Get the project progress report: the expected progress curve (from task dates and working days), the baseline expected curve, and the historical follow-up entries (date + percentage). Useful to compare planned vs actual progress.',
      inputSchema: {
        projectId: z.number().describe('The project ID to get the progress report for'),
      },
    },
    async (args) => {
      const data = await clients.rest.get(`projects/${args.projectId}/progressreports`);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    },
  );

  if (effectiveUserContext && !hasScope(effectiveUserContext, 'mcp:write')) {
    return;
  }

  server.registerTool(
    'create_task_progress',
    {
      description: 'Report progress on a task by creating a new progress (seguimiento/follow-up) entry. This is the correct way to set a task\'s completion percentage: it triggers task status transitions (100% completes the task, dropping below 100% reopens it), parent task rollups, automatic project progress, events, and notifications. Use get_reference_data with entity "assessments" to discover valid assessmentId values. Returns the created entry read back from v2 REST.',
      inputSchema: {
        projectId: z.number().describe('The project ID containing the task'),
        taskId: z.number().describe('The task ID to report progress on'),
        reportDate: z.string().describe('Report date (ISO 8601, e.g. 2026-07-13)'),
        percentage: z.number().int().min(0).max(100).describe('Progress percentage completed, 0-100'),
        assessmentId: z.number().describe('Assessment rating ID (required). Discover valid values with get_reference_data entity "assessments"'),
        shortDescription: z.string().describe('Brief progress summary (required)'),
        description: z.string().optional().describe('Detailed progress notes'),
      },
    },
    async (args) => {
      if (effectiveUserContext && !hasScope(effectiveUserContext, 'mcp:write')) return buildInsufficientScopeResponse();
      const { path, body } = splitCreateTaskProgressArgs(args);
      const data = await clients.rest.post(path, body);
      const progressId = extractResponseId(data, 'created task progress');
      const readback = await clients.rest.get(`${path}/${progressId}`);
      verifyRequestedFields(body, readback, TASK_PROGRESS_VERIFICATION_FIELDS, 'create_task_progress');
      return buildWriteResponse(readback);
    },
  );

  server.registerTool(
    'update_task_progress',
    {
      description: 'Update an existing task progress (seguimiento/follow-up) entry via PATCH. Only send the fields you want to change. Use list_task_progress to find the progressId. Returns the updated entry read back from v2 REST.',
      inputSchema: {
        projectId: z.number().describe('The project ID containing the task'),
        taskId: z.number().describe('The task ID the progress entry belongs to'),
        progressId: z.number().describe('The progress entry ID to update (TaskFollowUpId from list_task_progress)'),
        reportDate: z.string().optional().describe('New report date (ISO 8601)'),
        percentage: z.number().int().min(0).max(100).optional().describe('New progress percentage, 0-100'),
        assessmentId: z.number().optional().describe('New assessment rating ID'),
        shortDescription: z.string().optional().describe('New brief progress summary'),
        description: z.string().optional().describe('New detailed progress notes'),
      },
    },
    async (args) => {
      if (effectiveUserContext && !hasScope(effectiveUserContext, 'mcp:write')) return buildInsufficientScopeResponse();
      const { path, body } = splitUpdateTaskProgressArgs(args);
      await clients.rest.patch(path, body);
      const readback = await clients.rest.get(path);
      verifyRequestedFields(body, readback, TASK_PROGRESS_VERIFICATION_FIELDS, 'update_task_progress');
      return buildWriteResponse(readback);
    },
  );
}
