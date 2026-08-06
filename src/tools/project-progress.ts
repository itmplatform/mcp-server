import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Clients } from '../clients/index.js';
import { hasScope, type EffectiveUserContext } from '../auth/effective-user-context.js';
import { buildInsufficientScopeResponse, buildWriteResponse } from './write-tools.js';

type JsonRecord = Record<string, unknown>;

// Project follow-ups ride the v1 API (the only surface with manual
// create/update); v1 keys differ from the v2 task-progress names.
const PROJECT_PROGRESS_FIELD_MAP: Array<[input: string, v1Field: string]> = [
  ['reportDate', 'ReportDate'],
  ['percentage', 'PercentageCompleted'],
  ['assessmentId', 'AssessmentId'],
  ['shortDescription', 'ShortDescription'],
  ['description', 'DetailDescription'],
];

export function mapProjectProgressFields(source: JsonRecord): JsonRecord {
  const body: JsonRecord = {};
  for (const [input, v1Field] of PROJECT_PROGRESS_FIELD_MAP) {
    if (Object.prototype.hasOwnProperty.call(source, input) && source[input] !== undefined) {
      body[v1Field] = source[input];
    }
  }
  return body;
}

// Normalizes a v1 ProjectFollowUpView row to the field names agents already
// know from list_task_progress.
export function normalizeProjectProgressEntry(row: JsonRecord): JsonRecord {
  const assessment = (row.Assessment ?? null) as JsonRecord | null;
  const customFields = row.AllCustomFields;
  return {
    ProjectProgressId: row.ProjectProgressId,
    ProjectId: row.ProjectId,
    ReportDate: row.ReportDate,
    Percentage: row.PercentageCompleted,
    AssessmentId: assessment?.AssessmentId ?? null,
    AssessmentName: assessment?.AssessmentName ?? null,
    ShortDescription: row.ShortDescription,
    Description: row.DetailDescription,
    CreatedBy: row.CreatedBy,
    ...(customFields && typeof customFields === 'object' && Object.keys(customFields as JsonRecord).length
      ? { CustomFields: customFields }
      : {}),
  };
}

// The v1 write endpoints wrap failures in an HTTP 200 with the real status in
// the body (ProjectFollowUpDetailMessage).
export function extractProjectProgressResult(response: unknown, label: string): number {
  const record = (response ?? {}) as JsonRecord;
  const statusCode = typeof record.StatusCode === 'number' ? record.StatusCode : 0;
  const id = typeof record.ProjectProgressId === 'number' ? record.ProjectProgressId : 0;
  if (statusCode >= 400 || !id) {
    const message = typeof record.StatusMessage === 'string' && record.StatusMessage
      ? record.StatusMessage
      : `unexpected ${label} response: ${JSON.stringify(response)}`;
    throw new Error(message);
  }
  return id;
}

export async function fetchNormalizedProgressEntries(clients: Clients, projectId: number): Promise<JsonRecord[]> {
  const rows = await clients.restV1.get(`project/${projectId}/progress`);
  if (!Array.isArray(rows)) return [];
  return (rows as JsonRecord[]).map(normalizeProjectProgressEntry);
}

function buildValidationError(message: string): { content: Array<{ type: 'text'; text: string }>; isError: true } {
  return { content: [{ type: 'text' as const, text: `Validation error: ${message}` }], isError: true };
}

async function readBackEntry(clients: Clients, projectId: number, progressId: number): Promise<JsonRecord> {
  const entries = await fetchNormalizedProgressEntries(clients, projectId);
  const entry = entries.find(candidate => candidate.ProjectProgressId === progressId);
  if (!entry) {
    throw new Error(`Project progress entry ${progressId} is missing from the readback list for project ${projectId}`);
  }
  return entry;
}

function verifyEntry(requested: JsonRecord, entry: JsonRecord, toolName: string): void {
  const checks: Array<[input: string, normalizedField: string]> = [
    ['percentage', 'Percentage'],
    ['assessmentId', 'AssessmentId'],
    ['shortDescription', 'ShortDescription'],
  ];
  const mismatches: string[] = [];
  for (const [input, field] of checks) {
    if (requested[input] !== undefined && entry[field] !== requested[input]) {
      mismatches.push(`${field} expected ${JSON.stringify(requested[input])} but read back ${JSON.stringify(entry[field])}`);
    }
  }
  if (mismatches.length) {
    throw new Error(`Source-of-truth write verification failed for ${toolName}: ${mismatches.join('; ')}`);
  }
}

export function registerProjectProgressTools(
  server: McpServer,
  clients: Clients,
  effectiveUserContext?: EffectiveUserContext,
): void {
  if (effectiveUserContext && !hasScope(effectiveUserContext, 'mcp:write')) {
    return;
  }

  server.registerTool(
    'create_project_progress',
    {
      description: 'Create a project-level progress (Seguimiento) entry: the project status report with report date, '
        + 'completion percentage, assessment rating, and status description. Independent from per-task progress. '
        + 'WARNING: percentage 100 automatically CLOSES the project, which blocks further time entry; log hours first '
        + '(reopen with update_project if needed). Assessment IDs: get_reference_data entity "assessments".',
      inputSchema: {
        projectId: z.number().describe('The project ID to report status on'),
        reportDate: z.string().describe('Report date (ISO 8601)'),
        percentage: z.number().int().min(0).max(100).describe('Project completion percentage, 0-100'),
        assessmentId: z.number().describe('Assessment rating ID (required; entity "assessments")'),
        shortDescription: z.string().describe('Brief status summary (required)'),
        description: z.string().optional().describe('Detailed status narrative'),
      },
    },
    async (args) => {
      if (effectiveUserContext && !hasScope(effectiveUserContext, 'mcp:write')) return buildInsufficientScopeResponse();
      const { projectId, ...rest } = args as { projectId: number } & JsonRecord;
      const body = mapProjectProgressFields(rest);
      const response = await clients.restV1.post(`project/${projectId}/progress`, body);
      let progressId: number;
      try {
        progressId = extractProjectProgressResult(response, 'create_project_progress');
      } catch (err) {
        return buildValidationError(err instanceof Error ? err.message : String(err));
      }
      const entry = await readBackEntry(clients, projectId, progressId);
      verifyEntry(rest, entry, 'create_project_progress');
      return buildWriteResponse(entry);
    },
  );

  server.registerTool(
    'update_project_progress',
    {
      description: 'Update an existing project-level progress (Seguimiento) entry; send only the fields to change. '
        + 'Find the progressId with get_project_progress includeEntries true.',
      inputSchema: {
        projectId: z.number().describe('The project ID the progress entry belongs to'),
        progressId: z.number().describe('The progress entry ID to update (ProjectProgressId)'),
        reportDate: z.string().optional().describe('New report date (ISO 8601)'),
        percentage: z.number().int().min(0).max(100).optional().describe('New completion percentage, 0-100'),
        assessmentId: z.number().optional().describe('New assessment rating ID'),
        shortDescription: z.string().optional().describe('New brief status summary'),
        description: z.string().optional().describe('New detailed status narrative'),
      },
    },
    async (args) => {
      if (effectiveUserContext && !hasScope(effectiveUserContext, 'mcp:write')) return buildInsufficientScopeResponse();
      const { projectId, progressId, ...rest } = args as { projectId: number; progressId: number } & JsonRecord;
      const body = mapProjectProgressFields(rest);
      if (!Object.keys(body).length) {
        return buildValidationError(
          'update_project_progress requires at least one field to change (reportDate, percentage, assessmentId, shortDescription, or description)',
        );
      }
      // The v1 PUT deserializes AssessmentId and PercentageCompleted as
      // non-nullable ints, so omitting them would arrive as 0 and fail
      // validation (string fields merge server-side); carry the stored
      // values for whichever of the two was not supplied.
      const entries = await fetchNormalizedProgressEntries(clients, projectId);
      const current = entries.find(candidate => candidate.ProjectProgressId === progressId);
      if (!current) {
        return buildValidationError(`Project progress entry ${progressId} was not found on project ${projectId}`);
      }
      if (body.AssessmentId === undefined) body.AssessmentId = current.AssessmentId;
      if (body.PercentageCompleted === undefined) body.PercentageCompleted = current.Percentage;
      const response = await clients.restV1.put(`project/${projectId}/progress/${progressId}`, body);
      try {
        extractProjectProgressResult(response, 'update_project_progress');
      } catch (err) {
        return buildValidationError(err instanceof Error ? err.message : String(err));
      }
      const entry = await readBackEntry(clients, projectId, progressId);
      verifyEntry(rest, entry, 'update_project_progress');
      return buildWriteResponse(entry);
    },
  );
}
