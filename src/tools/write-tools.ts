import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Clients } from '../clients/index.js';
import { hasScope, type EffectiveUserContext } from '../auth/effective-user-context.js';
import { ACTIVITY_STATUSES_PATH } from './reference-data.js';

type JsonRecord = Record<string, unknown>;

export const STALE_AFTER_WRITE_NOTICE =
  'Note: DataMart reads (search_projects, get_project, list_project_tasks, etc.) ' +
  'may return stale data for 5-60 seconds after a write due to eventual consistency. ' +
  'The confirmed state above is from the v2 REST API (source of truth).';

export function buildInsufficientScopeResponse(): { content: Array<{ type: 'text'; text: string }>; isError: true } {
  return {
    content: [{ type: 'text' as const, text: 'Error: insufficient_scope -- the mcp:write scope is required for write operations' }],
    isError: true,
  };
}

export function buildWriteResponse(data: unknown): { content: Array<{ type: 'text'; text: string }> } {
  return {
    content: [
      { type: 'text' as const, text: JSON.stringify(data, null, 2) },
      { type: 'text' as const, text: STALE_AFTER_WRITE_NOTICE },
    ],
  };
}

function buildValidationErrorResponse(message: string): { content: Array<{ type: 'text'; text: string }>; isError: true } {
  return {
    content: [{ type: 'text' as const, text: `Validation error: ${message}` }],
    isError: true,
  };
}

function hasSuppliedField(body: JsonRecord, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(body, field) && body[field] !== undefined;
}

function formatValue(value: unknown): string {
  return JSON.stringify(value);
}

function numericValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

function dateOnly(value: unknown): string | undefined {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return value.toISOString().slice(0, 10);
  if (typeof value !== 'string') return undefined;
  const match = value.match(/^(\d{4}-\d{2}-\d{2})(?:T.*)?$/);
  return match?.[1];
}

function valuesMatch(expected: unknown, actual: unknown): boolean {
  if (expected === actual) return true;

  const expectedNumber = numericValue(expected);
  const actualNumber = numericValue(actual);
  if (expectedNumber !== undefined && actualNumber !== undefined) return expectedNumber === actualNumber;

  const expectedDate = dateOnly(expected);
  const actualDate = dateOnly(actual);
  if (expectedDate && actualDate) return expectedDate === actualDate;

  return false;
}

function normalizeAlias(body: JsonRecord, alias: string, canonical: string): void {
  const hasAlias = hasSuppliedField(body, alias);
  const hasCanonical = hasSuppliedField(body, canonical);

  if (hasAlias && hasCanonical && !valuesMatch(body[alias], body[canonical])) {
    throw new Error(`${alias} and ${canonical} cannot both be supplied with different values`);
  }

  if (hasAlias && !hasCanonical) {
    body[canonical] = body[alias];
  }

  if (Object.prototype.hasOwnProperty.call(body, alias)) {
    delete body[alias];
  }
}

function rejectUnsupportedFields(toolName: string, body: JsonRecord, unsupported: Record<string, string>): void {
  for (const [field, reason] of Object.entries(unsupported)) {
    if (hasSuppliedField(body, field)) {
      throw new Error(`${field} is not supported by ${toolName}: ${reason}`);
    }
  }
}

function requireSuppliedField(toolName: string, body: JsonRecord, field: string, reason: string): void {
  if (!hasSuppliedField(body, field)) {
    throw new Error(`${field} is required by ${toolName}: ${reason}`);
  }
}

export const TASK_KIND_MILESTONE = 1;
export const TASK_KIND_SUMMARY = 2;
export const TASK_KIND_TASK = 3;

export function splitCreateTaskArgs(args: { projectId: number; [key: string]: unknown }) {
  const { projectId, ...body } = args;
  normalizeAlias(body, 'Description', 'Details');
  rejectUnsupportedFields('create_task', body, {
    AssignedToUserId: 'task assignment is managed by task team endpoints, not the task create route',
    PercentComplete: 'task progress is managed through follow-up/progress APIs, not task create',
  });
  return { path: `projects/${projectId}/tasks`, body };
}

function resolveMethodTypeId(project: unknown): number | undefined {
  if (project === null || typeof project !== 'object') return undefined;
  const projectRecord = project as JsonRecord;
  return numericValue(
    projectRecord.MethodTypeId
      ?? projectRecord.ProjectMethodTypeId
      ?? (projectRecord.MethodType as JsonRecord | undefined)?.Id,
  );
}

// The Kanban insert route forces KindId to Task and skips parent validation
// entirely, so hierarchy/kind fields are rejected here instead of written unvalidated.
function getKanbanHierarchyRejection(body: JsonRecord): string | undefined {
  if (hasSuppliedField(body, 'KindId') && numericValue(body.KindId) !== TASK_KIND_TASK) {
    return 'Kanban projects support only regular tasks; milestones (KindId 1) and summary tasks (KindId 2) require a Waterfall project.';
  }
  if (hasSuppliedField(body, 'ParentId')) {
    return 'Task hierarchy (ParentId) is only supported on Waterfall projects.';
  }
  return undefined;
}

function getKindIdRangeError(body: JsonRecord): string | undefined {
  if (!hasSuppliedField(body, 'KindId')) return undefined;
  const kindId = numericValue(body.KindId);
  if (kindId === TASK_KIND_MILESTONE || kindId === TASK_KIND_SUMMARY || kindId === TASK_KIND_TASK) return undefined;
  return 'KindId must be 1 (Milestone), 2 (Summary task), or 3 (Task).';
}

function hasValidStatusId(body: JsonRecord): boolean {
  return hasSuppliedField(body, 'StatusId') && (numericValue(body.StatusId) ?? 0) > 0;
}

export function getCreateTaskValidationError(body: JsonRecord, project: unknown): string | undefined {
  const methodTypeId = resolveMethodTypeId(project);
  if (methodTypeId === undefined) {
    return 'Could not determine project methodology before creating the task.';
  }

  if (methodTypeId === 2) return getKanbanHierarchyRejection(body);
  if (methodTypeId !== 1) {
    return `Unsupported project methodology (${methodTypeId}) for task creation.`;
  }

  const kindError = getKindIdRangeError(body);
  if (kindError) return kindError;

  const kindId = numericValue(body.KindId) ?? TASK_KIND_TASK;

  if (kindId === TASK_KIND_MILESTONE) {
    if (!dateOnly(body.EndDate)) {
      return 'Waterfall Milestone creation (KindId 1) requires EndDate; the milestone sits on that date. StatusId, StartDate, TypeId, and PriorityId are not required.';
    }
    if (hasSuppliedField(body, 'StartDate') && dateOnly(body.StartDate) !== dateOnly(body.EndDate)) {
      return 'Milestone StartDate must be omitted or equal to EndDate; a date span makes the backend silently convert the milestone into a regular task.';
    }
    return undefined;
  }

  if (kindId === TASK_KIND_SUMMARY) {
    return hasValidStatusId(body)
      ? undefined
      : 'Waterfall summary task creation (KindId 2) requires StatusId. Dates are optional and roll up from child tasks.';
  }

  const requiredFields = ['StatusId', 'StartDate', 'EndDate'];
  const missingFields = requiredFields.filter(field => {
    const value = body[field];
    if (!hasSuppliedField(body, field)) return true;
    if (field === 'StatusId') return numericValue(value) === undefined || Number(value) <= 0;
    return typeof value !== 'string' || value.trim() === '';
  });
  if (!missingFields.length) return undefined;

  return `Waterfall task creation requires StatusId, StartDate, and EndDate. Missing: ${missingFields.join(', ')}.`;
}

export function getUpdateTaskValidationError(body: JsonRecord, project: unknown): string | undefined {
  const methodTypeId = resolveMethodTypeId(project);
  if (methodTypeId === undefined) {
    return 'Could not determine project methodology before updating the task.';
  }

  if (methodTypeId === 2) return getKanbanHierarchyRejection(body);
  if (methodTypeId !== 1) {
    return `Unsupported project methodology (${methodTypeId}) for task hierarchy updates.`;
  }

  const kindError = getKindIdRangeError(body);
  if (kindError) return kindError;

  if (numericValue(body.KindId) === TASK_KIND_MILESTONE) {
    const startDate = dateOnly(body.StartDate);
    const endDate = dateOnly(body.EndDate);
    if (!startDate || !endDate) {
      return 'Converting a task to a milestone (KindId 1) requires supplying both StartDate and EndDate in the same call; PATCH keeps existing dates otherwise, and a date span makes the backend silently revert the task kind.';
    }
    if (startDate !== endDate) {
      return 'Milestone StartDate and EndDate must be equal; the milestone sits on that single date.';
    }
  }

  return undefined;
}

export function splitUpdateTaskArgs(args: { projectId: number; taskId: number; [key: string]: unknown }) {
  const { projectId, taskId, ...body } = args;
  normalizeAlias(body, 'Description', 'Details');
  rejectUnsupportedFields('update_task', body, {
    AssignedToUserId: 'task assignment is managed by task team endpoints, not the task PATCH route',
    PercentComplete: 'task progress is managed through follow-up/progress APIs, not task PATCH',
  });
  return { path: `projects/${projectId}/tasks/${taskId}`, body };
}

export function splitCreateRiskArgs(args: { projectId: number; [key: string]: unknown }) {
  const { projectId, ...body } = args;
  normalizeAlias(body, 'Impact', 'ImpactId');
  normalizeAlias(body, 'Probability', 'ProbabilityId');
  requireSuppliedField(
    'create_risk',
    body,
    'LevelId',
    'the v2 risk create route validates risk level, and there is not currently a v2 risklevels reference endpoint',
  );
  return { path: `projects/${projectId}/risks`, body };
}

export function splitCreateIssueArgs(args: { projectId: number; [key: string]: unknown }) {
  const { projectId, ...body } = args;
  requireSuppliedField('create_issue', body, 'TypeId', 'the v2 issue create route requires a valid issue type');
  requireSuppliedField('create_issue', body, 'StatusId', 'the v2 issue create route requires a valid issue status');
  normalizeAlias(body, 'TypeId', 'Type');
  normalizeAlias(body, 'StatusId', 'Status');
  normalizeAlias(body, 'Resolution', 'FinalResolution');
  rejectUnsupportedFields('create_issue', body, {
    Severity: 'the v2 issue create route has no severity field',
  });
  return { path: `projects/${projectId}/issues`, body };
}

export function splitUpdateProjectArgs(args: { projectId: number; [key: string]: unknown }) {
  const { projectId, ...body } = args;
  normalizeAlias(body, 'StatusId', 'ProjectStatusId');
  return { path: `projects/${projectId}`, body };
}

export function splitCreateProjectArgs(args: { [key: string]: unknown }) {
  const body = { ...args };
  const statusIgnoredReason =
    'the v2 project create route ignores status and always applies the account default status; use update_project after creation to change it';
  rejectUnsupportedFields('create_project', body, {
    StatusId: statusIgnoredReason,
    ProjectStatusId: statusIgnoredReason,
  });
  return { path: 'projects', body };
}

export function getCreateProjectValidationError(args: JsonRecord): string | undefined {
  if (hasSuppliedField(args, 'ProjectMethodTypeId')) {
    const methodTypeId = numericValue(args.ProjectMethodTypeId);
    // The backend stores any int unvalidated, so constrain it here.
    if (methodTypeId !== 1 && methodTypeId !== 2) {
      return 'ProjectMethodTypeId must be 1 (Waterfall) or 2 (Kanban).';
    }
  }
  return undefined;
}

export function buildProjectUiUrl(
  uiBaseUrl: string | undefined,
  company: string | undefined,
  projectId: number | string,
): string | undefined {
  if (!uiBaseUrl || !company) return undefined;
  return `${uiBaseUrl.replace(/\/+$/, '')}/${company}/UserPages/ProjectGeneral.aspx?pid=${projectId}`;
}

export const BULK_STATUS_MAX_IDS = 100;
export const BULK_STATUS_TIMEOUT_MS = 90_000;

export function getBulkStatusValidationError(args: { statusId?: number; statusName?: string }): string | undefined {
  if (args.statusId === undefined && (args.statusName === undefined || args.statusName.trim() === '')) {
    return 'Either statusId or statusName must be provided.';
  }
  return undefined;
}

export function buildBulkStatusBody(
  ids: number[],
  args: { statusId?: number; statusName?: string; projectMethodTypeId?: number },
): JsonRecord {
  return {
    TaskIds: ids.join(','),
    SelectedStatus: args.statusId ?? 0,
    SelectedStatusName: args.statusId === undefined ? args.statusName ?? '' : '',
    ProjectMethodTypeId: args.projectMethodTypeId ?? 0,
  };
}

export async function resolveActivityStatusIdByName(clients: Clients, statusName: string): Promise<number | undefined> {
  const statuses = await clients.rest.get(ACTIVITY_STATUSES_PATH);
  if (!Array.isArray(statuses)) return undefined;

  const wanted = statusName.trim().toLowerCase();
  const match = statuses.find(status => {
    const name = (status as JsonRecord)?.Name;
    return typeof name === 'string' && name.trim().toLowerCase() === wanted;
  });
  return match ? numericValue((match as JsonRecord).Id) : undefined;
}

export interface BulkStatusSummary {
  requested: number;
  succeeded: number;
  failed: Array<Record<string, unknown>>;
}

export function summarizeBulkStatusResponse(
  requestedIds: number[],
  response: unknown,
  idField: 'taskId' | 'activityId',
): BulkStatusSummary {
  if (!Array.isArray(response)) {
    throw new Error(`Expected an array of per-item results from the bulk status endpoint, got: ${JSON.stringify(response)}`);
  }

  const failed = response
    .filter(item => numericValue((item as JsonRecord)?.StatusCode) !== 200)
    .map(item => {
      const record = item as JsonRecord;
      return {
        [idField]: record?.Id,
        message: typeof record?.StatusMessage === 'string' && record.StatusMessage.trim() !== ''
          ? record.StatusMessage
          : `Update failed with status code ${record?.StatusCode}`,
      };
    });

  return {
    requested: requestedIds.length,
    succeeded: response.length - failed.length,
    failed,
  };
}

export interface VerificationField {
  requestField: string;
  readPaths: string[];
  label?: string;
}

function getPathValue(source: unknown, path: string): unknown {
  if (source === null || typeof source !== 'object') return undefined;
  let current: unknown = source;
  for (const segment of path.split('.')) {
    if (current === null || typeof current !== 'object') return undefined;
    if (!Object.prototype.hasOwnProperty.call(current, segment)) return undefined;
    current = (current as JsonRecord)[segment];
  }
  return current;
}

export function verifyRequestedFields(
  requested: JsonRecord,
  readback: unknown,
  fields: VerificationField[],
  entityLabel: string,
): void {
  const mismatches: string[] = [];

  for (const field of fields) {
    if (!hasSuppliedField(requested, field.requestField)) continue;

    const expected = requested[field.requestField];
    const actualValues = field.readPaths
      .map(path => getPathValue(readback, path))
      .filter(value => value !== undefined);

    if (!actualValues.length) {
      mismatches.push(`${field.label ?? field.requestField} expected ${formatValue(expected)} but readback did not include ${field.readPaths.join(' or ')}`);
      continue;
    }

    if (!actualValues.some(actual => valuesMatch(expected, actual))) {
      mismatches.push(`${field.label ?? field.requestField} expected ${formatValue(expected)} but read back ${actualValues.map(formatValue).join(' / ')}`);
    }
  }

  if (mismatches.length) {
    throw new Error(`Source-of-truth write verification failed for ${entityLabel}: ${mismatches.join('; ')}`);
  }
}

export function mapReferenceIdToBaseId(value: unknown, referenceData: unknown): unknown {
  if (!Array.isArray(referenceData)) return value;

  for (const item of referenceData) {
    if (item === null || typeof item !== 'object') continue;
    const record = item as JsonRecord;
    const id = record.Id ?? record.id;
    const baseId = record.BaseId ?? record.baseId;

    if (baseId !== undefined && valuesMatch(value, baseId)) return baseId;
    if (id !== undefined && valuesMatch(value, id)) return baseId ?? id;
  }

  return value;
}

async function normalizeReferenceIds(
  clients: Clients,
  body: JsonRecord,
  mappings: Array<{ field: string; entity: string }>,
): Promise<void> {
  for (const { field, entity } of mappings) {
    if (!hasSuppliedField(body, field)) continue;
    const referenceData = await clients.rest.get(entity);
    body[field] = mapReferenceIdToBaseId(body[field], referenceData);
  }
}

export function extractResponseId(data: unknown, label: string): number | string {
  if (data && typeof data === 'object') {
    const record = data as JsonRecord;
    const id = record.Id ?? record.id ?? record.ProjectId ?? record.projectId ?? record.TaskId ?? record.taskId;
    if (typeof id === 'number' || typeof id === 'string') return id;
  }

  throw new Error(`Could not read ${label} id from REST write response`);
}

const PROJECT_VERIFICATION_FIELDS: VerificationField[] = [
  { requestField: 'Name', readPaths: ['Name'] },
  { requestField: 'Description', readPaths: ['Description'] },
  { requestField: 'ProjectStatusId', readPaths: ['Status.Id', 'ProjectStatusId', 'StatusId'], label: 'StatusId' },
  { requestField: 'PriorityId', readPaths: ['Priority.Id', 'PriorityId'] },
  { requestField: 'StartDate', readPaths: ['StartDate'] },
  { requestField: 'EndDate', readPaths: ['EndDate'] },
];

const TASK_VERIFICATION_FIELDS: VerificationField[] = [
  { requestField: 'Name', readPaths: ['Name'] },
  { requestField: 'Details', readPaths: ['Details', 'Description'], label: 'Description' },
  { requestField: 'StatusId', readPaths: ['Status.Id', 'StatusId'] },
  { requestField: 'TypeId', readPaths: ['Type.Id', 'TypeId'] },
  { requestField: 'PriorityId', readPaths: ['Priority.Id', 'PriorityId'] },
  { requestField: 'StartDate', readPaths: ['StartDate'] },
  { requestField: 'EndDate', readPaths: ['EndDate'] },
  { requestField: 'KindId', readPaths: ['KindId'] },
  { requestField: 'ParentId', readPaths: ['ParentTask.Id'] },
];

// Milestones sit on EndDate; the backend clears StartDate by design, so a
// supplied StartDate can never match the readback. ParentId 0 detaches the
// task to root, so the readback has no ParentTask to compare against.
function taskVerificationFieldsFor(body: JsonRecord): VerificationField[] {
  return TASK_VERIFICATION_FIELDS.filter(field => {
    if (field.requestField === 'StartDate') return numericValue(body.KindId) !== TASK_KIND_MILESTONE;
    if (field.requestField === 'ParentId') return numericValue(body.ParentId) !== 0;
    return true;
  });
}

const CREATE_PROJECT_VERIFICATION_FIELDS: VerificationField[] = [
  { requestField: 'Name', readPaths: ['Name'] },
  { requestField: 'Description', readPaths: ['Description'] },
  { requestField: 'InternalCode', readPaths: ['InternalCode'] },
  { requestField: 'StartDate', readPaths: ['StartDate'] },
  { requestField: 'EndDate', readPaths: ['EndDate'] },
  { requestField: 'TypeId', readPaths: ['Type.Id', 'TypeId'] },
  { requestField: 'PriorityId', readPaths: ['Priority.Id', 'PriorityId'] },
  { requestField: 'ProjectMethodTypeId', readPaths: ['MethodTypeId', 'ProjectMethodTypeId'] },
];

const RISK_VERIFICATION_FIELDS: VerificationField[] = [
  { requestField: 'Name', readPaths: ['Name'] },
  { requestField: 'Description', readPaths: ['Description'] },
  { requestField: 'StatusId', readPaths: ['Status.BaseId', 'Status.Id', 'StatusId'] },
  { requestField: 'TypeId', readPaths: ['Type.BaseId', 'Type.Id', 'TypeId'] },
  { requestField: 'ImpactId', readPaths: ['Impact.BaseId', 'Impact.Id', 'ImpactId'] },
  { requestField: 'ProbabilityId', readPaths: ['Probability.BaseId', 'Probability.Id', 'ProbabilityId'] },
  { requestField: 'LevelId', readPaths: ['Level.BaseId', 'Level.Id', 'LevelId'] },
  { requestField: 'MitigationPlan', readPaths: ['MitigationPlan'] },
];

const ISSUE_VERIFICATION_FIELDS: VerificationField[] = [
  { requestField: 'Name', readPaths: ['Name'] },
  { requestField: 'Description', readPaths: ['Description'] },
  { requestField: 'Type', readPaths: ['Type.BaseId', 'Type.Id', 'Type'], label: 'TypeId' },
  { requestField: 'Status', readPaths: ['Status.BaseId', 'Status.Id', 'Status'], label: 'StatusId' },
  { requestField: 'FinalResolution', readPaths: ['FinalResolution'], label: 'Resolution' },
];

export function registerWriteTools(
  server: McpServer,
  clients: Clients,
  effectiveUserContext?: EffectiveUserContext,
): void {

  server.registerTool(
    'create_project',
    {
      description: 'Create a new project. Name and TypeId are required; use get_reference_data with entity "getprojecttypes" to discover valid project type IDs. '
        + 'ProjectMethodTypeId selects the methodology: 1=Waterfall (default when omitted), 2=Kanban (created with default board columns). '
        + 'The project is always created with the account default status; status cannot be set at creation, call update_project afterwards to change it. '
        + 'The authenticated user becomes the project manager when their license allows it. '
        + 'Returns the created project read back from v2 REST (source of truth).',
      inputSchema: {
        Name: z.string().describe('Project name (required, must be unique in the account)'),
        TypeId: z.number().describe('Project type ID (required). Use get_reference_data with entity "getprojecttypes" to discover valid IDs.'),
        ProjectMethodTypeId: z.number().optional().describe('Project methodology: 1=Waterfall (default when omitted), 2=Kanban'),
        Description: z.string().optional().describe('Project description'),
        StartDate: z.string().optional().describe('Start date (ISO 8601)'),
        EndDate: z.string().optional().describe('End date (ISO 8601)'),
        PriorityId: z.number().optional().describe('Project priority ID; account default when omitted. Use get_reference_data with entity "projectpriorities".'),
        InternalCode: z.string().optional().describe('Internal project code'),
        // Published so the SDK does not silently strip them; the handler rejects
        // both with a pointer to update_project instead of ignoring the value.
        StatusId: z.number().optional().describe('NOT SUPPORTED at creation: the project is always created with the account default status. Use update_project to change the status afterwards.'),
        ProjectStatusId: z.number().optional().describe('NOT SUPPORTED at creation: the project is always created with the account default status. Use update_project to change the status afterwards.'),
      },
    },
    async (args) => {
      if (effectiveUserContext && !hasScope(effectiveUserContext, 'mcp:write')) return buildInsufficientScopeResponse();
      const validationError = getCreateProjectValidationError(args);
      if (validationError) return buildValidationErrorResponse(validationError);
      const { path, body } = splitCreateProjectArgs(args);
      const data = await clients.rest.post(path, body);
      const projectId = extractResponseId(data, 'created project');
      const readback = await clients.rest.get(`projects/${projectId}`);
      verifyRequestedFields(body, readback, CREATE_PROJECT_VERIFICATION_FIELDS, 'create_project');
      const uiUrl = buildProjectUiUrl(process.env.ITM_UI_URL, effectiveUserContext?.company, projectId);
      const payload = uiUrl && readback !== null && typeof readback === 'object'
        ? { ...(readback as JsonRecord), uiUrl }
        : readback;
      return buildWriteResponse(payload);
    },
  );

  server.registerTool(
    'create_task',
    {
      description: 'Create a new task, milestone, or summary task in a project. '
        + 'KindId selects the task kind: 1=Milestone, 2=Summary task, 3=Task (default); this is not the task type (TypeId). '
        + 'Waterfall regular tasks require StatusId, StartDate, and EndDate. Waterfall milestones require only EndDate (they sit on that date; omit StartDate). '
        + 'Waterfall summary tasks require only StatusId (dates roll up from children). Kanban projects support only regular tasks and use board defaults without dates. '
        + 'Use ParentId to place the task under a summary task (Waterfall only). '
        + 'Returns the created task read back from v2 REST (source of truth). Use get_reference_data with entity "gettaskstatuses", "gettasktypes", or "gettaskpriorities" to discover valid Waterfall IDs.',
      inputSchema: {
        projectId: z.number().describe('The project ID to create the task in'),
        Name: z.string().describe('Task name (required)'),
        Description: z.string().optional().describe('Task description. Compatibility alias for the v2 REST Details field.'),
        Details: z.string().optional().describe('Task details/description field used by v2 REST'),
        StatusId: z.number().optional().describe('Task status ID. Required for Waterfall regular and summary tasks; not required for milestones; Kanban uses board-specific status defaults.'),
        TypeId: z.number().optional().describe('Task type ID (account default when omitted). Not the same as KindId.'),
        PriorityId: z.number().optional().describe('Task priority ID (account default when omitted)'),
        StartDate: z.string().optional().describe('Start date (ISO 8601). Required for Waterfall regular tasks. For milestones omit it or set it equal to EndDate.'),
        EndDate: z.string().optional().describe('End date (ISO 8601). Required for Waterfall regular tasks and milestones.'),
        KindId: z.number().optional().describe('Task kind: 1=Milestone, 2=Summary task, 3=Task (default). Milestones and summary tasks require a Waterfall project.'),
        ParentId: z.number().optional().describe('Parent task ID to place this task under (Waterfall only). A regular-task parent is automatically converted to a summary task unless it has assignees or dependencies.'),
      },
    },
    async (args) => {
      if (effectiveUserContext && !hasScope(effectiveUserContext, 'mcp:write')) return buildInsufficientScopeResponse();
      const { path, body } = splitCreateTaskArgs(args);
      const project = await clients.rest.get(`projects/${args.projectId}`);
      const validationError = getCreateTaskValidationError(body, project);
      if (validationError) return buildValidationErrorResponse(validationError);
      const data = await clients.rest.post(path, body);
      const taskId = extractResponseId(data, 'created task');
      const readback = await clients.rest.get(`${path}/${taskId}`);
      verifyRequestedFields(body, readback, taskVerificationFieldsFor(body), 'create_task');
      return buildWriteResponse(readback);
    },
  );

  server.registerTool(
    'update_task',
    {
      description: 'Update task fields via PATCH. Only send the fields you want to change. Returns the updated task read back from v2 REST. '
        + 'KindId changes the task kind (1=Milestone, 2=Summary task, 3=Task; not the task type TypeId) and ParentId moves the task under a summary task; both are Waterfall-only. '
        + 'Converting a task to a milestone requires supplying StartDate and EndDate with the same value in the same call.',
      inputSchema: {
        projectId: z.number().describe('The project ID containing the task'),
        taskId: z.number().describe('The task ID to update'),
        Name: z.string().optional().describe('New task name'),
        Description: z.string().optional().describe('New description. Compatibility alias for the v2 REST Details field.'),
        Details: z.string().optional().describe('New task details/description field used by v2 REST'),
        StatusId: z.number().optional().describe('New status ID'),
        TypeId: z.number().optional().describe('New type ID'),
        PriorityId: z.number().optional().describe('New priority ID'),
        StartDate: z.string().optional().describe('New start date (ISO 8601)'),
        EndDate: z.string().optional().describe('New end date (ISO 8601)'),
        KindId: z.number().optional().describe('New task kind: 1=Milestone, 2=Summary task, 3=Task (Waterfall only). Converting to a milestone requires equal StartDate and EndDate in the same call.'),
        ParentId: z.number().optional().describe('New parent task ID (Waterfall only). A regular-task parent is automatically converted to a summary task unless it has assignees or dependencies.'),
      },
    },
    async (args) => {
      if (effectiveUserContext && !hasScope(effectiveUserContext, 'mcp:write')) return buildInsufficientScopeResponse();
      const { path, body } = splitUpdateTaskArgs(args);
      if (hasSuppliedField(body, 'KindId') || hasSuppliedField(body, 'ParentId')) {
        const project = await clients.rest.get(`projects/${args.projectId}`);
        const validationError = getUpdateTaskValidationError(body, project);
        if (validationError) return buildValidationErrorResponse(validationError);
      }
      await clients.rest.patch(path, body);
      const readback = await clients.rest.get(path);
      verifyRequestedFields(body, readback, taskVerificationFieldsFor(body), 'update_task');
      return buildWriteResponse(readback);
    },
  );

  server.registerTool(
    'create_risk',
    {
      description: 'Log a new risk in a project. Returns the created risk read back from v2 REST. Use get_reference_data with entity "riskstatuses", "risktypes", "riskimpacts", or "riskprobabilities" to discover IDs; the tool accepts localized Id values and normalizes them to BaseId values where v2 REST requires them.',
      inputSchema: {
        projectId: z.number().describe('The project ID to create the risk in'),
        Name: z.string().describe('Risk name (required)'),
        Description: z.string().optional().describe('Risk description'),
        StatusId: z.number().optional().describe('Risk status ID'),
        TypeId: z.number().optional().describe('Risk type ID'),
        ProbabilityId: z.number().optional().describe('Risk probability ID'),
        ImpactId: z.number().optional().describe('Risk impact ID'),
        LevelId: z.number().describe('Risk level base ID required by v2 REST. No v2 risklevels reference endpoint currently exists.'),
        MitigationPlan: z.string().optional().describe('Mitigation plan description'),
      },
    },
    async (args) => {
      if (effectiveUserContext && !hasScope(effectiveUserContext, 'mcp:write')) return buildInsufficientScopeResponse();
      const { path, body } = splitCreateRiskArgs(args);
      await normalizeReferenceIds(clients, body, [
        { field: 'TypeId', entity: 'risktypes' },
        { field: 'StatusId', entity: 'riskstatuses' },
        { field: 'ImpactId', entity: 'riskimpacts' },
        { field: 'ProbabilityId', entity: 'riskprobabilities' },
      ]);
      const data = await clients.rest.post(path, body);
      const riskId = extractResponseId(data, 'created risk');
      const readback = await clients.rest.get(`${path}/${riskId}`);
      verifyRequestedFields(body, readback, RISK_VERIFICATION_FIELDS, 'create_risk');
      return buildWriteResponse(readback);
    },
  );

  server.registerTool(
    'create_issue',
    {
      description: 'Log a new issue in a project. Returns the created issue read back from v2 REST. Use get_reference_data with entity "issuestatuses" or "issuetypes" to discover IDs; the tool accepts localized Id values and normalizes them to BaseId values where v2 REST requires them.',
      inputSchema: {
        projectId: z.number().describe('The project ID to create the issue in'),
        Name: z.string().describe('Issue name (required)'),
        Description: z.string().optional().describe('Issue description'),
        StatusId: z.number().describe('Issue status ID (required). Mapped to the v2 REST Status field.'),
        TypeId: z.number().describe('Issue type ID (required). Mapped to the v2 REST Type field.'),
        Resolution: z.string().optional().describe('Resolution description. Mapped to the v2 REST FinalResolution field.'),
      },
    },
    async (args) => {
      if (effectiveUserContext && !hasScope(effectiveUserContext, 'mcp:write')) return buildInsufficientScopeResponse();
      const { path, body } = splitCreateIssueArgs(args);
      await normalizeReferenceIds(clients, body, [
        { field: 'Type', entity: 'issuetypes' },
        { field: 'Status', entity: 'issuestatuses' },
      ]);
      const data = await clients.rest.post(path, body);
      const issueId = extractResponseId(data, 'created issue');
      const readback = await clients.rest.get(`${path}/${issueId}`);
      verifyRequestedFields(body, readback, ISSUE_VERIFICATION_FIELDS, 'create_issue');
      return buildWriteResponse(readback);
    },
  );

  server.registerTool(
    'update_project',
    {
      description: 'Update project fields via PATCH. Only send the fields you want to change. Returns the updated project read back from v2 REST.',
      inputSchema: {
        projectId: z.number().describe('The project ID to update'),
        Name: z.string().optional().describe('New project name'),
        Description: z.string().optional().describe('New project description'),
        StatusId: z.number().optional().describe('New project status ID. Compatibility alias mapped to ProjectStatusId before calling v2 REST.'),
        ProjectStatusId: z.number().optional().describe('New project status ID field used by v2 REST'),
        PriorityId: z.number().optional().describe('New priority ID'),
        StartDate: z.string().optional().describe('New start date (ISO 8601)'),
        EndDate: z.string().optional().describe('New end date (ISO 8601)'),
      },
    },
    async (args) => {
      if (effectiveUserContext && !hasScope(effectiveUserContext, 'mcp:write')) return buildInsufficientScopeResponse();
      const { path, body } = splitUpdateProjectArgs(args);
      await clients.rest.patch(path, body);
      const readback = await clients.rest.get(path);
      verifyRequestedFields(body, readback, PROJECT_VERIFICATION_FIELDS, 'update_project');
      return buildWriteResponse(readback);
    },
  );

  server.registerTool(
    'bulk_update_task_status',
    {
      description: 'Apply one status to many tasks of a project in a single call (much faster than looping update_task). '
        + `Collect task IDs first via list_project_tasks or search, then chunk into calls of at most ${BULK_STATUS_MAX_IDS} IDs. `
        + 'Resolve valid status IDs via get_reference_data (entity "gettaskstatuses"): statuses differ between Waterfall and Kanban projects, '
        + 'and Kanban projects interpret statusId as the Kanban column ID, so pass projectMethodTypeId (1=Waterfall, 2=Kanban) or use statusName instead. '
        + 'Returns a compact summary; always check the failed array of every chunk. Re-applying the same status is harmless, so retrying a failed chunk is safe.',
      inputSchema: {
        projectId: z.number().describe('The project ID containing the tasks'),
        taskIds: z.array(z.number()).min(1).max(BULK_STATUS_MAX_IDS)
          .describe(`Task IDs to update (1-${BULK_STATUS_MAX_IDS} per call; chunk larger sets into multiple calls)`),
        statusId: z.number().optional().describe('Target status ID (Kanban column ID for Kanban projects). Either statusId or statusName is required.'),
        statusName: z.string().optional().describe('Target status name, resolved server-side when statusId is omitted'),
        projectMethodTypeId: z.number().optional().describe('Project methodology: 1=Waterfall, 2=Kanban. Needed for Kanban status resolution and name lookup.'),
      },
    },
    async (args) => {
      if (effectiveUserContext && !hasScope(effectiveUserContext, 'mcp:write')) return buildInsufficientScopeResponse();
      const validationError = getBulkStatusValidationError(args);
      if (validationError) return buildValidationErrorResponse(validationError);
      const body = buildBulkStatusBody(args.taskIds, args);
      const data = await clients.rest.post(`projects/${args.projectId}/UpdateTaskStatuses`, body, { timeoutMs: BULK_STATUS_TIMEOUT_MS });
      return buildWriteResponse(summarizeBulkStatusResponse(args.taskIds, data, 'taskId'));
    },
  );

  server.registerTool(
    'bulk_update_activity_status',
    {
      description: 'Apply one status to many activities of a service in a single call. '
        + `Collect activity IDs first via list_service_activities, then chunk into calls of at most ${BULK_STATUS_MAX_IDS} IDs. `
        + 'Resolve valid activity status IDs via get_reference_data with entity "activitystatuses" (activity statuses differ from task statuses), or pass statusName. '
        + 'Returns a compact summary; always check the failed array of every chunk. Re-applying the same status is harmless, so retrying a failed chunk is safe.',
      inputSchema: {
        serviceId: z.number().describe('The service ID containing the activities'),
        activityIds: z.array(z.number()).min(1).max(BULK_STATUS_MAX_IDS)
          .describe(`Activity IDs to update (1-${BULK_STATUS_MAX_IDS} per call; chunk larger sets into multiple calls)`),
        statusId: z.number().optional().describe('Target activity status ID. Either statusId or statusName is required.'),
        statusName: z.string().optional().describe('Target activity status name, resolved against the activitystatuses reference list when statusId is omitted'),
        projectMethodTypeId: z.number().optional().describe('Service methodology type ID passed through to the backend'),
      },
    },
    async (args) => {
      if (effectiveUserContext && !hasScope(effectiveUserContext, 'mcp:write')) return buildInsufficientScopeResponse();
      const validationError = getBulkStatusValidationError(args);
      if (validationError) return buildValidationErrorResponse(validationError);

      // The backend resolves SelectedStatusName against task statuses even for
      // activities, silently skipping the update on a mismatch, so resolve the
      // name against the real activity statuses here instead.
      let statusId = args.statusId;
      if (statusId === undefined && args.statusName !== undefined) {
        statusId = await resolveActivityStatusIdByName(clients, args.statusName);
        if (statusId === undefined) {
          return buildValidationErrorResponse(
            `Unknown activity status name "${args.statusName}". Use get_reference_data with entity "activitystatuses" to list valid values.`,
          );
        }
      }

      const body = buildBulkStatusBody(args.activityIds, { statusId, projectMethodTypeId: args.projectMethodTypeId });
      const data = await clients.rest.post(`services/${args.serviceId}/UpdateActivityStatuses`, body, { timeoutMs: BULK_STATUS_TIMEOUT_MS });
      return buildWriteResponse(summarizeBulkStatusResponse(args.activityIds, data, 'activityId'));
    },
  );
}
