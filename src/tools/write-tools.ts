import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Clients } from '../clients/index.js';
import { hasScope, type EffectiveUserContext } from '../auth/effective-user-context.js';

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

export function splitCreateTaskArgs(args: { projectId: number; [key: string]: unknown }) {
  const { projectId, ...body } = args;
  normalizeAlias(body, 'Description', 'Details');
  rejectUnsupportedFields('create_task', body, {
    AssignedToUserId: 'task assignment is managed by task team endpoints, not the task create route',
    PercentComplete: 'task progress is managed through follow-up/progress APIs, not task create',
  });
  return { path: `projects/${projectId}/tasks`, body };
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
    'create_task',
    {
      description: 'Create a new task in a project. Returns the created task read back from v2 REST (source of truth). Use get_reference_data with entity "gettaskstatuses", "gettasktypes", or "gettaskpriorities" to discover valid IDs.',
      inputSchema: {
        projectId: z.number().describe('The project ID to create the task in'),
        Name: z.string().describe('Task name (required)'),
        Description: z.string().optional().describe('Task description. Compatibility alias for the v2 REST Details field.'),
        Details: z.string().optional().describe('Task details/description field used by v2 REST'),
        StatusId: z.number().optional().describe('Task status ID'),
        TypeId: z.number().optional().describe('Task type ID'),
        PriorityId: z.number().optional().describe('Task priority ID'),
        StartDate: z.string().optional().describe('Start date (ISO 8601)'),
        EndDate: z.string().optional().describe('End date (ISO 8601)'),
      },
    },
    async (args) => {
      if (effectiveUserContext && !hasScope(effectiveUserContext, 'mcp:write')) return buildInsufficientScopeResponse();
      const { path, body } = splitCreateTaskArgs(args);
      const data = await clients.rest.post(path, body);
      const taskId = extractResponseId(data, 'created task');
      const readback = await clients.rest.get(`${path}/${taskId}`);
      verifyRequestedFields(body, readback, TASK_VERIFICATION_FIELDS, 'create_task');
      return buildWriteResponse(readback);
    },
  );

  server.registerTool(
    'update_task',
    {
      description: 'Update task fields via PATCH. Only send the fields you want to change. Returns the updated task read back from v2 REST.',
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
      },
    },
    async (args) => {
      if (effectiveUserContext && !hasScope(effectiveUserContext, 'mcp:write')) return buildInsufficientScopeResponse();
      const { path, body } = splitUpdateTaskArgs(args);
      await clients.rest.patch(path, body);
      const readback = await clients.rest.get(path);
      verifyRequestedFields(body, readback, TASK_VERIFICATION_FIELDS, 'update_task');
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
        StatusId: z.number().optional().describe('Issue status ID. Mapped to the v2 REST Status field.'),
        TypeId: z.number().optional().describe('Issue type ID. Mapped to the v2 REST Type field.'),
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
}
