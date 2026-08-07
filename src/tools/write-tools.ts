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

// The backend silently ignores TypeId on summary tasks and omits Type from the
// readback, so a supplied TypeId can never verify; reject it up front instead.
const SUMMARY_TASK_TYPE_ID_ERROR =
  'Summary tasks (KindId 2) do not use TypeId; omit it. Use TypeId only on regular tasks and milestones.';

export function parseUsernameList(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  return value.split(',').map(name => name.trim()).filter(Boolean);
}

const ASSIGNMENT_FIELDS = ['TaskManagers', 'TaskMembers'] as const;

export function hasAssignmentFields(body: JsonRecord): boolean {
  return ASSIGNMENT_FIELDS.some(field => hasSuppliedField(body, field));
}

// The backend applies TaskManagers before TaskMembers, so a user listed in both
// silently ends up as a plain member; reject the ambiguity up front.
function normalizeTaskAssignmentFields(body: JsonRecord): void {
  for (const field of ASSIGNMENT_FIELDS) {
    if (!hasSuppliedField(body, field)) continue;
    const names = parseUsernameList(body[field]);
    if (names.length) body[field] = names.join(',');
    else delete body[field];
  }
  const managers = new Set(parseUsernameList(body.TaskManagers).map(name => name.toLowerCase()));
  const duplicated = parseUsernameList(body.TaskMembers).filter(name => managers.has(name.toLowerCase()));
  if (duplicated.length) {
    throw new Error(`Users listed in both TaskManagers and TaskMembers: ${duplicated.join(', ')} -- list each user in only one field`);
  }
}

export function splitCreateTaskArgs(args: { projectId: number; [key: string]: unknown }) {
  const { projectId, ...body } = args;
  normalizeAlias(body, 'Description', 'Details');
  rejectUnsupportedFields('create_task', body, {
    AssignedToUserId: 'use TaskManagers/TaskMembers (comma-separated usernames) to assign users',
    PercentComplete: 'task progress is managed through follow-up/progress APIs, not task create',
  });
  normalizeTaskAssignmentFields(body);
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
    if (hasSuppliedField(body, 'TypeId')) return SUMMARY_TASK_TYPE_ID_ERROR;
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

  if (numericValue(body.KindId) === TASK_KIND_SUMMARY && hasSuppliedField(body, 'TypeId')) {
    return SUMMARY_TASK_TYPE_ID_ERROR;
  }

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
    AssignedToUserId: 'use TaskManagers/TaskMembers (comma-separated usernames) to assign users',
    PercentComplete: 'task progress is managed through follow-up/progress APIs, not task PATCH',
  });
  normalizeTaskAssignmentFields(body);
  return { path: `projects/${projectId}/tasks/${taskId}`, body };
}

export function splitCreateRiskArgs(args: { projectId: number; [key: string]: unknown }) {
  const { projectId, ...body } = args;
  normalizeAlias(body, 'Impact', 'ImpactId');
  normalizeAlias(body, 'Probability', 'ProbabilityId');
  const requiredReferenceFields: Array<{ field: string; label: string; entity: string }> = [
    { field: 'TypeId', label: 'risk type', entity: 'risktypes' },
    { field: 'StatusId', label: 'risk status', entity: 'riskstatuses' },
    { field: 'ImpactId', label: 'risk impact', entity: 'riskimpacts' },
    { field: 'ProbabilityId', label: 'risk probability', entity: 'riskprobabilities' },
    { field: 'LevelId', label: 'risk level', entity: 'risklevels' },
  ];
  for (const { field, label, entity } of requiredReferenceFields) {
    requireSuppliedField(
      'create_risk',
      body,
      field,
      `the v2 risk create route requires a valid ${label}; use get_reference_data with entity "${entity}" to discover IDs`,
    );
  }
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

export function splitUpdateRiskArgs(args: { projectId: number; riskId: number; [key: string]: unknown }) {
  const { projectId, riskId, ...body } = args;
  normalizeAlias(body, 'Impact', 'ImpactId');
  normalizeAlias(body, 'Probability', 'ProbabilityId');
  // The backend field is misspelled "ContigencyPlan"; accept the correct spelling.
  normalizeAlias(body, 'ContingencyPlan', 'ContigencyPlan');
  return { path: `projects/${projectId}/risks/${riskId}`, body };
}

export function splitUpdateIssueArgs(args: { projectId: number; issueId: number; [key: string]: unknown }) {
  const { projectId, issueId, ...body } = args;
  normalizeAlias(body, 'TypeId', 'Type');
  normalizeAlias(body, 'StatusId', 'Status');
  normalizeAlias(body, 'Resolution', 'FinalResolution');
  return { path: `projects/${projectId}/issues/${issueId}`, body };
}

export function splitCreateServiceArgs(args: { [key: string]: unknown }) {
  const body = { ...args };
  requireSuppliedField(
    'create_service',
    body,
    'TypeId',
    'the v2 service create route requires a valid service type; use get_reference_data with entity "servicetypes" to discover IDs',
  );
  const statusIgnoredReason =
    'the v2 service create route ignores status and always applies the account default status; use update_service after creation to change it';
  rejectUnsupportedFields('create_service', body, {
    StatusId: statusIgnoredReason,
    ProjectStatusId: statusIgnoredReason,
  });
  return { path: 'services', body };
}

export function splitUpdateServiceArgs(args: { serviceId: number; [key: string]: unknown }) {
  const { serviceId, ...body } = args;
  normalizeAlias(body, 'StatusId', 'ProjectStatusId');
  return { path: `services/${serviceId}`, body };
}

const ACTIVITY_UNSUPPORTED_FIELDS: Record<string, string> = {
  KindId: 'service activities are a flat list; milestones and summary tasks are project-task concepts',
  ParentId: 'service activities are a flat list; hierarchy is a project-task concept',
  AssignedToUserId: 'activity assignment is managed by team endpoints, not the activity routes',
  PercentComplete: 'activity progress is managed through follow-up/progress APIs, not the activity routes',
};

export function splitCreateActivityArgs(args: { serviceId: number; [key: string]: unknown }) {
  const { serviceId, ...body } = args;
  normalizeAlias(body, 'Description', 'Details');
  rejectUnsupportedFields('create_activity', body, ACTIVITY_UNSUPPORTED_FIELDS);
  requireSuppliedField('create_activity', body, 'StatusId',
    'activity creation requires an activity status; use get_reference_data with entity "activitystatuses" to discover IDs');
  requireSuppliedField('create_activity', body, 'StartDate', 'activity creation requires StartDate (ISO 8601)');
  requireSuppliedField('create_activity', body, 'EndDate', 'activity creation requires EndDate (ISO 8601)');
  return { path: `services/${serviceId}/activities`, body };
}

export function splitUpdateActivityArgs(args: { serviceId: number; activityId: number; [key: string]: unknown }) {
  const { serviceId, activityId, ...body } = args;
  normalizeAlias(body, 'Description', 'Details');
  rejectUnsupportedFields('update_activity', body, ACTIVITY_UNSUPPORTED_FIELDS);
  return { path: `services/${serviceId}/activities/${activityId}`, body };
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
// Summary tasks have no TypeId (the backend ignores it and omits Type from
// the readback); the readback KindId covers updates that do not resend KindId.
export function taskVerificationFieldsFor(body: JsonRecord, readback?: unknown): VerificationField[] {
  const kindId = numericValue(body.KindId) ?? numericValue(getPathValue(readback, 'KindId'));
  return TASK_VERIFICATION_FIELDS.filter(field => {
    if (field.requestField === 'StartDate') return numericValue(body.KindId) !== TASK_KIND_MILESTONE;
    if (field.requestField === 'ParentId') return numericValue(body.ParentId) !== 0;
    if (field.requestField === 'TypeId') return kindId !== TASK_KIND_SUMMARY;
    return true;
  });
}

// The backend forwards the URL param to a page-rights check; backends without the
// ITM.Tasks null-URL fallback (pre 2026-08) throw a NullReferenceException in
// ITM.Account when it is missing, so always send the page the web UI uses.
export function taskUsersReadbackPath(taskPath: string): string {
  return `${taskPath}/users?URL=UserPages/TaskTeam.aspx`;
}

// GET .../tasks/{taskId}/users returns { canAddTeam, TaskUsers: { <username>: row } };
// the row carries the full user profile (holiday calendars included), far too verbose
// to echo back, so responses carry this compact projection instead.
function taskUsersByUsername(usersResponse: unknown): Record<string, JsonRecord> {
  if (usersResponse === null || typeof usersResponse !== 'object') return {};
  const taskUsers = (usersResponse as JsonRecord).TaskUsers;
  if (taskUsers === null || typeof taskUsers !== 'object') return {};
  return taskUsers as Record<string, JsonRecord>;
}

export function buildTaskTeamSummary(usersResponse: unknown): JsonRecord[] {
  return Object.entries(taskUsersByUsername(usersResponse)).map(([username, row]) => ({
    Username: username,
    UserId: row.UserId,
    DisplayName: row.DisplayName,
    IsTaskManager: row.IsTaskManager,
  }));
}

function withTeam(readback: unknown, usersResponse: unknown): unknown {
  const team = buildTaskTeamSummary(usersResponse);
  if (readback !== null && typeof readback === 'object' && !Array.isArray(readback)) {
    return { ...(readback as JsonRecord), team };
  }
  return { task: readback, team };
}

// The backend silently skips stakeholder users, so presence must be verified;
// the manager flag only exists on Waterfall (Kanban saves everyone as member).
export function verifyTaskTeamReadback(
  body: JsonRecord,
  usersResponse: unknown,
  isWaterfallProject: boolean,
  entityLabel: string,
): void {
  const rowsByUsername = new Map(
    Object.entries(taskUsersByUsername(usersResponse)).map(([username, row]) => [username.toLowerCase(), row]),
  );

  const requested = [
    ...parseUsernameList(body.TaskManagers).map(username => ({ username, isManager: true })),
    ...parseUsernameList(body.TaskMembers).map(username => ({ username, isManager: false })),
  ];

  const mismatches: string[] = [];
  for (const { username, isManager } of requested) {
    const row = rowsByUsername.get(username.toLowerCase());
    if (!row) {
      mismatches.push(`${username} is not on the task team after the write (stakeholder users cannot be assigned)`);
      continue;
    }
    if (isWaterfallProject && row.IsTaskManager !== isManager) {
      mismatches.push(`${username} expected IsTaskManager ${isManager} but read back ${formatValue(row.IsTaskManager)}`);
    }
  }

  if (mismatches.length) {
    throw new Error(`Source-of-truth write verification failed for ${entityLabel}: ${mismatches.join('; ')}`);
  }
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
  { requestField: 'ContigencyPlan', readPaths: ['ContigencyPlan'], label: 'ContingencyPlan' },
];

const RISK_REFERENCE_MAPPINGS = [
  { field: 'TypeId', entity: 'risktypes' },
  { field: 'StatusId', entity: 'riskstatuses' },
  { field: 'ImpactId', entity: 'riskimpacts' },
  { field: 'ProbabilityId', entity: 'riskprobabilities' },
  { field: 'LevelId', entity: 'risklevels' },
];

const ISSUE_REFERENCE_MAPPINGS = [
  { field: 'Type', entity: 'issuetypes' },
  { field: 'Status', entity: 'issuestatuses' },
];

const SERVICE_VERIFICATION_FIELDS: VerificationField[] = [
  { requestField: 'Name', readPaths: ['Name'] },
  { requestField: 'Description', readPaths: ['Description'] },
  { requestField: 'InternalCode', readPaths: ['InternalCode'] },
  { requestField: 'StartDate', readPaths: ['StartDate'] },
  { requestField: 'EndDate', readPaths: ['EndDate'] },
  { requestField: 'TypeId', readPaths: ['Type.Id', 'TypeId'] },
  { requestField: 'PriorityId', readPaths: ['Priority.Id', 'PriorityId'] },
  { requestField: 'ProjectStatusId', readPaths: ['Status.Id', 'ProjectStatusId', 'StatusId'], label: 'StatusId' },
];

const ACTIVITY_VERIFICATION_FIELDS: VerificationField[] = [
  { requestField: 'Name', readPaths: ['Name'] },
  { requestField: 'Details', readPaths: ['Details', 'Description'], label: 'Description' },
  { requestField: 'StatusId', readPaths: ['Status.Id', 'StatusId'] },
  { requestField: 'TypeId', readPaths: ['Type.Id', 'TypeId'] },
  { requestField: 'PriorityId', readPaths: ['Priority.Id', 'PriorityId'] },
  { requestField: 'StartDate', readPaths: ['StartDate'] },
  { requestField: 'EndDate', readPaths: ['EndDate'] },
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
      description: 'Create a new project. Name and TypeId are required (entity "getprojecttypes"). '
        + 'ProjectMethodTypeId selects the methodology: 1=Waterfall (default when omitted), 2=Kanban (created with default board columns). '
        + 'Status cannot be set at creation (the account default status applies); change it with update_project. '
        + 'The caller becomes project manager when their license allows it.',
      inputSchema: {
        Name: z.string().describe('Project name (required, must be unique in the account)'),
        TypeId: z.number().describe('Project type ID (required; entity "getprojecttypes")'),
        ProjectMethodTypeId: z.number().optional().describe('Project methodology: 1=Waterfall (default when omitted), 2=Kanban'),
        Description: z.string().optional().describe('Project description'),
        StartDate: z.string().optional().describe('Start date (ISO 8601)'),
        EndDate: z.string().optional().describe('End date (ISO 8601)'),
        PriorityId: z.number().optional().describe('Priority ID; account default when omitted (entity "projectpriorities")'),
        InternalCode: z.string().optional().describe('Internal project code'),
        // Published so the SDK does not silently strip them; the handler rejects
        // both with a pointer to update_project instead of ignoring the value.
        StatusId: z.number().optional().describe('NOT SUPPORTED at creation; the account default status applies. Change it with update_project.'),
        ProjectStatusId: z.number().optional().describe('NOT SUPPORTED at creation; the account default status applies. Change it with update_project.'),
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
      description: 'Create a regular task, milestone, or summary task. KindId: 1=Milestone, 2=Summary, 3/default=Task (not the TypeId). '
        + 'Waterfall regular tasks require StatusId, StartDate, and EndDate; milestones require EndDate; summaries require StatusId. '
        + 'Kanban supports regular tasks only and uses board defaults. ParentId creates Waterfall hierarchy. '
        + 'AutomaticProgress statuses create 100% progress; a later lower report needs a later ReportDate. '
        + 'Use get_reference_data for valid IDs.',
      inputSchema: {
        projectId: z.number().describe('The project ID to create the task in'),
        Name: z.string().describe('Task name (required)'),
        Description: z.string().optional().describe('Task description (alias of Details)'),
        Details: z.string().optional().describe('Details field used by v2 REST'),
        StatusId: z.number().optional().describe('Status ID; required for Waterfall regular and summary tasks, not for milestones; Kanban uses board defaults'),
        TypeId: z.number().optional().describe('Task type ID (account default when omitted). Not the same as KindId.'),
        PriorityId: z.number().optional().describe('Task priority ID (account default when omitted)'),
        StartDate: z.string().optional().describe('Start date (ISO 8601); required for Waterfall regular tasks. Milestones: omit or equal to EndDate.'),
        EndDate: z.string().optional().describe('End date (ISO 8601); required for Waterfall regular tasks and milestones'),
        KindId: z.number().optional().describe('Kind: 1=Milestone, 2=Summary, 3=Task (default); 1 and 2 require a Waterfall project'),
        ParentId: z.number().optional().describe('Parent task ID (Waterfall only); a regular-task parent converts to a summary unless it has assignees or dependencies'),
        TaskManagers: z.string().optional().describe('Comma-separated usernames (search_users EmailAddress) added as task managers; Kanban saves them as members. Add-only.'),
        TaskMembers: z.string().optional().describe('Comma-separated usernames added as team members. Add-only.'),
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
      verifyRequestedFields(body, readback, taskVerificationFieldsFor(body, readback), 'create_task');
      if (hasAssignmentFields(body)) {
        const usersReadback = await clients.rest.get(taskUsersReadbackPath(`${path}/${taskId}`));
        verifyTaskTeamReadback(body, usersReadback, resolveMethodTypeId(project) === 1, 'create_task');
        return buildWriteResponse(withTeam(readback, usersReadback));
      }
      return buildWriteResponse(readback);
    },
  );

  server.registerTool(
    'update_task',
    {
      description: 'Update task fields via PATCH; send only the fields to change. '
        + 'KindId changes the task kind (1=Milestone, 2=Summary, 3=Task; not TypeId) and ParentId moves the task under a summary task; both are Waterfall-only. '
        + 'Converting to a milestone requires equal StartDate and EndDate in the same call. '
        + 'A status with AutomaticProgress (such as Completed) creates a 100% progress entry; '
        + 'a later lower report only takes effect with a later ReportDate (percentComplete tracks the latest entry by ReportDate).',
      inputSchema: {
        projectId: z.number().describe('The project ID containing the task'),
        taskId: z.number().describe('The task ID to update'),
        Name: z.string().optional().describe('New task name'),
        Description: z.string().optional().describe('New description (alias of Details)'),
        Details: z.string().optional().describe('Details field used by v2 REST'),
        StatusId: z.number().optional().describe('New status ID'),
        TypeId: z.number().optional().describe('New type ID'),
        PriorityId: z.number().optional().describe('New priority ID'),
        StartDate: z.string().optional().describe('New start date (ISO 8601)'),
        EndDate: z.string().optional().describe('New end date (ISO 8601)'),
        KindId: z.number().optional().describe('New kind: 1=Milestone, 2=Summary, 3=Task (Waterfall only); to milestone requires equal StartDate and EndDate in the same call'),
        ParentId: z.number().optional().describe('New parent task ID (Waterfall only); a regular-task parent converts to a summary unless it has assignees or dependencies'),
        TaskManagers: z.string().optional().describe('Comma-separated usernames (search_users EmailAddress) added as task managers; Kanban saves them as members. Add-only.'),
        TaskMembers: z.string().optional().describe('Comma-separated usernames added as team members. Add-only.'),
      },
    },
    async (args) => {
      if (effectiveUserContext && !hasScope(effectiveUserContext, 'mcp:write')) return buildInsufficientScopeResponse();
      const { path, body } = splitUpdateTaskArgs(args);
      const needsProject = hasSuppliedField(body, 'KindId') || hasSuppliedField(body, 'ParentId') || hasAssignmentFields(body);
      const project = needsProject ? await clients.rest.get(`projects/${args.projectId}`) : undefined;
      if (hasSuppliedField(body, 'KindId') || hasSuppliedField(body, 'ParentId')) {
        const validationError = getUpdateTaskValidationError(body, project);
        if (validationError) return buildValidationErrorResponse(validationError);
      }
      await clients.rest.patch(path, body);
      const readback = await clients.rest.get(path);
      verifyRequestedFields(body, readback, taskVerificationFieldsFor(body, readback), 'update_task');
      if (hasAssignmentFields(body)) {
        const usersReadback = await clients.rest.get(taskUsersReadbackPath(path));
        verifyTaskTeamReadback(body, usersReadback, resolveMethodTypeId(project) === 1, 'update_task');
        return buildWriteResponse(withTeam(readback, usersReadback));
      }
      return buildWriteResponse(readback);
    },
  );

  server.registerTool(
    'create_risk',
    {
      description: 'Log a new risk in a project. TypeId, StatusId, ImpactId, ProbabilityId, and LevelId are all required. Discover IDs with get_reference_data (entities "riskstatuses", "risktypes", "riskimpacts", "riskprobabilities", "risklevels"); localized Ids are normalized automatically.',
      inputSchema: {
        projectId: z.number().describe('The project ID to create the risk in'),
        Name: z.string().describe('Risk name (required)'),
        Description: z.string().optional().describe('Risk description'),
        StatusId: z.number().describe('Risk status ID (required; entity "riskstatuses")'),
        TypeId: z.number().describe('Risk type ID (required; entity "risktypes")'),
        ProbabilityId: z.number().describe('Risk probability ID (required; entity "riskprobabilities")'),
        ImpactId: z.number().describe('Risk impact ID (required; entity "riskimpacts")'),
        LevelId: z.number().describe('Risk level ID (required; entity "risklevels")'),
        MitigationPlan: z.string().optional().describe('Mitigation plan description'),
      },
    },
    async (args) => {
      if (effectiveUserContext && !hasScope(effectiveUserContext, 'mcp:write')) return buildInsufficientScopeResponse();
      const { path, body } = splitCreateRiskArgs(args);
      await normalizeReferenceIds(clients, body, RISK_REFERENCE_MAPPINGS);
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
      description: 'Log a new issue in a project. Discover IDs with get_reference_data (entities "issuestatuses", "issuetypes"); localized Ids are normalized automatically.',
      inputSchema: {
        projectId: z.number().describe('The project ID to create the issue in'),
        Name: z.string().describe('Issue name (required)'),
        Description: z.string().optional().describe('Issue description'),
        StatusId: z.number().describe('Issue status ID (required)'),
        TypeId: z.number().describe('Issue type ID (required)'),
        Resolution: z.string().optional().describe('Resolution description'),
      },
    },
    async (args) => {
      if (effectiveUserContext && !hasScope(effectiveUserContext, 'mcp:write')) return buildInsufficientScopeResponse();
      const { path, body } = splitCreateIssueArgs(args);
      await normalizeReferenceIds(clients, body, ISSUE_REFERENCE_MAPPINGS);
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
      description: 'Update project fields via PATCH; send only the fields to change.',
      inputSchema: {
        projectId: z.number().describe('The project ID to update'),
        Name: z.string().optional().describe('New project name'),
        Description: z.string().optional().describe('New project description'),
        StatusId: z.number().optional().describe('New project status ID (alias of ProjectStatusId)'),
        ProjectStatusId: z.number().optional().describe('New project status ID (v2 field name)'),
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
    'update_risk',
    {
      description: 'Update risk fields; send only the fields to change. Discover IDs with get_reference_data (entities "riskstatuses", "risktypes", "riskimpacts", "riskprobabilities", "risklevels"); localized Ids are normalized automatically.',
      inputSchema: {
        projectId: z.number().describe('The project ID containing the risk'),
        riskId: z.number().describe('The risk ID to update'),
        Name: z.string().optional().describe('New risk name'),
        Description: z.string().optional().describe('New risk description'),
        StatusId: z.number().optional().describe('New risk status ID'),
        TypeId: z.number().optional().describe('New risk type ID'),
        ProbabilityId: z.number().optional().describe('New risk probability ID'),
        ImpactId: z.number().optional().describe('New risk impact ID'),
        LevelId: z.number().optional().describe('New risk level ID'),
        MitigationPlan: z.string().optional().describe('New mitigation plan description'),
        ContingencyPlan: z.string().optional().describe('New contingency plan description'),
      },
    },
    async (args) => {
      if (effectiveUserContext && !hasScope(effectiveUserContext, 'mcp:write')) return buildInsufficientScopeResponse();
      const { path, body } = splitUpdateRiskArgs(args);
      await normalizeReferenceIds(clients, body, RISK_REFERENCE_MAPPINGS);
      await clients.rest.put(path, body);
      const readback = await clients.rest.get(path);
      verifyRequestedFields(body, readback, RISK_VERIFICATION_FIELDS, 'update_risk');
      return buildWriteResponse(readback);
    },
  );

  server.registerTool(
    'update_issue',
    {
      description: 'Update issue fields via PATCH; send only the fields to change. Discover IDs with get_reference_data (entities "issuestatuses", "issuetypes"); localized Ids are normalized automatically.',
      inputSchema: {
        projectId: z.number().describe('The project ID containing the issue'),
        issueId: z.number().describe('The issue ID to update'),
        Name: z.string().optional().describe('New issue name'),
        Description: z.string().optional().describe('New issue description'),
        StatusId: z.number().optional().describe('New issue status ID'),
        TypeId: z.number().optional().describe('New issue type ID'),
        Resolution: z.string().optional().describe('New resolution description'),
      },
    },
    async (args) => {
      if (effectiveUserContext && !hasScope(effectiveUserContext, 'mcp:write')) return buildInsufficientScopeResponse();
      const { path, body } = splitUpdateIssueArgs(args);
      await normalizeReferenceIds(clients, body, ISSUE_REFERENCE_MAPPINGS);
      await clients.rest.patch(path, body);
      const readback = await clients.rest.get(path);
      verifyRequestedFields(body, readback, ISSUE_VERIFICATION_FIELDS, 'update_issue');
      return buildWriteResponse(readback);
    },
  );

  server.registerTool(
    'create_service',
    {
      description: 'Create a new service. Name and TypeId are required; use get_reference_data with entity "servicetypes" to discover valid service type IDs. '
        + 'The service is always created with the account default status; call update_service afterwards to change it.',
      inputSchema: {
        Name: z.string().describe('Service name (required, must be unique among services in the account)'),
        TypeId: z.number().describe('Service type ID (required; entity "servicetypes")'),
        Description: z.string().optional().describe('Service description'),
        StartDate: z.string().optional().describe('Start date (ISO 8601)'),
        EndDate: z.string().optional().describe('End date (ISO 8601)'),
        PriorityId: z.number().optional().describe('Priority ID; account default when omitted (entity "projectpriorities")'),
        InternalCode: z.string().optional().describe('Internal service code'),
        // Published so the SDK does not silently strip them; the handler rejects
        // both with a pointer to update_service instead of ignoring the value.
        StatusId: z.number().optional().describe('NOT SUPPORTED at creation; the account default status applies. Change it with update_service.'),
        ProjectStatusId: z.number().optional().describe('NOT SUPPORTED at creation; the account default status applies. Change it with update_service.'),
      },
    },
    async (args) => {
      if (effectiveUserContext && !hasScope(effectiveUserContext, 'mcp:write')) return buildInsufficientScopeResponse();
      const { path, body } = splitCreateServiceArgs(args);
      const data = await clients.rest.post(path, body);
      const serviceId = extractResponseId(data, 'created service');
      const readback = await clients.rest.get(`services/${serviceId}`);
      verifyRequestedFields(body, readback, SERVICE_VERIFICATION_FIELDS, 'create_service');
      return buildWriteResponse(readback);
    },
  );

  server.registerTool(
    'update_service',
    {
      description: 'Update service fields via PATCH; send only the fields to change. Status IDs come from get_reference_data entity "projectstatuses".',
      inputSchema: {
        serviceId: z.number().describe('The service ID to update'),
        Name: z.string().optional().describe('New service name'),
        Description: z.string().optional().describe('New service description'),
        StatusId: z.number().optional().describe('New service status ID (alias of ProjectStatusId)'),
        ProjectStatusId: z.number().optional().describe('New service status ID (v2 field name)'),
        PriorityId: z.number().optional().describe('New priority ID'),
        StartDate: z.string().optional().describe('New start date (ISO 8601)'),
        EndDate: z.string().optional().describe('New end date (ISO 8601)'),
      },
    },
    async (args) => {
      if (effectiveUserContext && !hasScope(effectiveUserContext, 'mcp:write')) return buildInsufficientScopeResponse();
      const { path, body } = splitUpdateServiceArgs(args);
      await clients.rest.patch(path, body);
      const readback = await clients.rest.get(path);
      verifyRequestedFields(body, readback, SERVICE_VERIFICATION_FIELDS, 'update_service');
      return buildWriteResponse(readback);
    },
  );

  server.registerTool(
    'create_activity',
    {
      description: 'Create a new activity in a service. Activities form a flat list (no milestones, summaries, or hierarchy). '
        + 'Name, StatusId, StartDate, and EndDate are required. Activity statuses differ from task statuses; '
        + 'use get_reference_data with entity "activitystatuses" to discover valid IDs.',
      inputSchema: {
        serviceId: z.number().describe('The service ID to create the activity in'),
        Name: z.string().describe('Activity name (required)'),
        Description: z.string().optional().describe('Activity description (alias of Details)'),
        Details: z.string().optional().describe('Details field used by v2 REST'),
        StatusId: z.number().describe('Activity status ID (required; entity "activitystatuses")'),
        TypeId: z.number().optional().describe('Activity type ID (account default when omitted)'),
        PriorityId: z.number().optional().describe('Activity priority ID (account default when omitted)'),
        StartDate: z.string().describe('Start date (ISO 8601, required)'),
        EndDate: z.string().describe('End date (ISO 8601, required)'),
        // Published so the SDK does not silently strip them; the handler rejects
        // both because service activities form a flat list.
        KindId: z.number().optional().describe('NOT SUPPORTED: activities form a flat list; milestones exist only on project tasks.'),
        ParentId: z.number().optional().describe('NOT SUPPORTED: activities form a flat list; hierarchy exists only on project tasks.'),
      },
    },
    async (args) => {
      if (effectiveUserContext && !hasScope(effectiveUserContext, 'mcp:write')) return buildInsufficientScopeResponse();
      const { path, body } = splitCreateActivityArgs(args);
      const data = await clients.rest.post(path, body);
      const activityId = extractResponseId(data, 'created activity');
      const readback = await clients.rest.get(`${path}/${activityId}`);
      verifyRequestedFields(body, readback, ACTIVITY_VERIFICATION_FIELDS, 'create_activity');
      return buildWriteResponse(readback);
    },
  );

  server.registerTool(
    'update_activity',
    {
      description: 'Update activity fields via PATCH; send only the fields to change. '
        + 'Activity statuses differ from task statuses (entity "activitystatuses").',
      inputSchema: {
        serviceId: z.number().describe('The service ID containing the activity'),
        activityId: z.number().describe('The activity ID to update'),
        Name: z.string().optional().describe('New activity name'),
        Description: z.string().optional().describe('New description (alias of Details)'),
        Details: z.string().optional().describe('Details field used by v2 REST'),
        StatusId: z.number().optional().describe('New activity status ID'),
        TypeId: z.number().optional().describe('New activity type ID'),
        PriorityId: z.number().optional().describe('New activity priority ID'),
        StartDate: z.string().optional().describe('New start date (ISO 8601)'),
        EndDate: z.string().optional().describe('New end date (ISO 8601)'),
        // Published so the SDK does not silently strip them; the handler rejects
        // both because service activities form a flat list.
        KindId: z.number().optional().describe('NOT SUPPORTED: activities form a flat list; milestones exist only on project tasks.'),
        ParentId: z.number().optional().describe('NOT SUPPORTED: activities form a flat list; hierarchy exists only on project tasks.'),
      },
    },
    async (args) => {
      if (effectiveUserContext && !hasScope(effectiveUserContext, 'mcp:write')) return buildInsufficientScopeResponse();
      const { path, body } = splitUpdateActivityArgs(args);
      await clients.rest.patch(path, body);
      const readback = await clients.rest.get(path);
      verifyRequestedFields(body, readback, ACTIVITY_VERIFICATION_FIELDS, 'update_activity');
      return buildWriteResponse(readback);
    },
  );

  server.registerTool(
    'bulk_update_task_status',
    {
      description: 'Apply one status to many tasks of a project in one call (faster than looping update_task). '
        + `Collect task IDs via list_project_tasks or search_tasks; chunk into calls of at most ${BULK_STATUS_MAX_IDS} IDs. `
        + 'Resolve valid status IDs via get_reference_data (entity "gettaskstatuses"): statuses differ between Waterfall and Kanban projects, '
        + 'and Kanban projects interpret statusId as the Kanban column ID, so pass projectMethodTypeId (1=Waterfall, 2=Kanban) or use statusName instead. '
        + 'Always check the failed array; retrying a failed chunk is safe.',
      inputSchema: {
        projectId: z.number().describe('The project ID containing the tasks'),
        taskIds: z.array(z.number()).min(1).max(BULK_STATUS_MAX_IDS)
          .describe(`Task IDs to update (max ${BULK_STATUS_MAX_IDS} per call)`),
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
        + 'Always check the failed array; retrying a failed chunk is safe.',
      inputSchema: {
        serviceId: z.number().describe('The service ID containing the activities'),
        activityIds: z.array(z.number()).min(1).max(BULK_STATUS_MAX_IDS)
          .describe(`Activity IDs to update (max ${BULK_STATUS_MAX_IDS} per call)`),
        statusId: z.number().optional().describe('Target activity status ID. Either statusId or statusName is required.'),
        statusName: z.string().optional().describe('Target activity status name, used when statusId is omitted'),
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
