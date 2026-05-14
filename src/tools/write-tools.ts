import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Clients } from '../clients/index.js';
import { hasScope, type EffectiveUserContext } from '../auth/effective-user-context.js';

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

export function splitCreateTaskArgs(args: { projectId: number; [key: string]: unknown }) {
  const { projectId, ...body } = args;
  return { path: `projects/${projectId}/tasks`, body };
}

export function splitUpdateTaskArgs(args: { projectId: number; taskId: number; [key: string]: unknown }) {
  const { projectId, taskId, ...body } = args;
  return { path: `projects/${projectId}/tasks/${taskId}`, body };
}

export function splitCreateRiskArgs(args: { projectId: number; [key: string]: unknown }) {
  const { projectId, ...body } = args;
  return { path: `projects/${projectId}/risks`, body };
}

export function splitCreateIssueArgs(args: { projectId: number; [key: string]: unknown }) {
  const { projectId, ...body } = args;
  return { path: `projects/${projectId}/issues`, body };
}

export function splitUpdateProjectArgs(args: { projectId: number; [key: string]: unknown }) {
  const { projectId, ...body } = args;
  return { path: `projects/${projectId}`, body };
}

export function registerWriteTools(
  server: McpServer,
  clients: Clients,
  effectiveUserContext?: EffectiveUserContext,
): void {

  server.registerTool(
    'create_task',
    {
      description: 'Create a new task in a project. Returns the created task from v2 REST (source of truth). Use get_reference_data with entity "gettaskstatuses", "gettasktypes", or "gettaskpriorities" to discover valid IDs.',
      inputSchema: {
        projectId: z.number().describe('The project ID to create the task in'),
        Name: z.string().describe('Task name (required)'),
        Description: z.string().optional().describe('Task description'),
        StatusId: z.number().optional().describe('Task status ID'),
        TypeId: z.number().optional().describe('Task type ID'),
        PriorityId: z.number().optional().describe('Task priority ID'),
        StartDate: z.string().optional().describe('Start date (ISO 8601)'),
        EndDate: z.string().optional().describe('End date (ISO 8601)'),
        AssignedToUserId: z.number().optional().describe('User ID to assign the task to'),
      },
    },
    async (args) => {
      if (effectiveUserContext && !hasScope(effectiveUserContext, 'mcp:write')) return buildInsufficientScopeResponse();
      const { path, body } = splitCreateTaskArgs(args);
      const data = await clients.rest.post(path, body);
      return buildWriteResponse(data);
    },
  );

  server.registerTool(
    'update_task',
    {
      description: 'Update task fields (status, dates, assignee, progress, etc.) via PATCH. Only send the fields you want to change. Returns the updated task from v2 REST.',
      inputSchema: {
        projectId: z.number().describe('The project ID containing the task'),
        taskId: z.number().describe('The task ID to update'),
        Name: z.string().optional().describe('New task name'),
        Description: z.string().optional().describe('New description'),
        StatusId: z.number().optional().describe('New status ID'),
        TypeId: z.number().optional().describe('New type ID'),
        PriorityId: z.number().optional().describe('New priority ID'),
        StartDate: z.string().optional().describe('New start date (ISO 8601)'),
        EndDate: z.string().optional().describe('New end date (ISO 8601)'),
        PercentComplete: z.number().min(0).max(100).optional().describe('Completion percentage (0-100)'),
        AssignedToUserId: z.number().optional().describe('User ID to reassign to'),
      },
    },
    async (args) => {
      if (effectiveUserContext && !hasScope(effectiveUserContext, 'mcp:write')) return buildInsufficientScopeResponse();
      const { path, body } = splitUpdateTaskArgs(args);
      const data = await clients.rest.patch(path, body);
      return buildWriteResponse(data);
    },
  );

  server.registerTool(
    'create_risk',
    {
      description: 'Log a new risk in a project. Returns the created risk from v2 REST. Use get_reference_data with entity "riskstatuses" or "risktypes" to discover valid IDs.',
      inputSchema: {
        projectId: z.number().describe('The project ID to create the risk in'),
        Name: z.string().describe('Risk name (required)'),
        Description: z.string().optional().describe('Risk description'),
        StatusId: z.number().optional().describe('Risk status ID'),
        TypeId: z.number().optional().describe('Risk type ID'),
        Probability: z.number().optional().describe('Probability level'),
        Impact: z.number().optional().describe('Impact level'),
        MitigationPlan: z.string().optional().describe('Mitigation plan description'),
      },
    },
    async (args) => {
      if (effectiveUserContext && !hasScope(effectiveUserContext, 'mcp:write')) return buildInsufficientScopeResponse();
      const { path, body } = splitCreateRiskArgs(args);
      const data = await clients.rest.post(path, body);
      return buildWriteResponse(data);
    },
  );

  server.registerTool(
    'create_issue',
    {
      description: 'Log a new issue in a project. Returns the created issue from v2 REST. Use get_reference_data with entity "issuestatuses" or "issuetypes" to discover valid IDs.',
      inputSchema: {
        projectId: z.number().describe('The project ID to create the issue in'),
        Name: z.string().describe('Issue name (required)'),
        Description: z.string().optional().describe('Issue description'),
        StatusId: z.number().optional().describe('Issue status ID'),
        TypeId: z.number().optional().describe('Issue type ID'),
        Severity: z.number().optional().describe('Severity level'),
        Resolution: z.string().optional().describe('Resolution description'),
      },
    },
    async (args) => {
      if (effectiveUserContext && !hasScope(effectiveUserContext, 'mcp:write')) return buildInsufficientScopeResponse();
      const { path, body } = splitCreateIssueArgs(args);
      const data = await clients.rest.post(path, body);
      return buildWriteResponse(data);
    },
  );

  server.registerTool(
    'update_project',
    {
      description: 'Update project fields (name, status, dates, priority, etc.) via PATCH. Only send the fields you want to change. Returns the updated project from v2 REST.',
      inputSchema: {
        projectId: z.number().describe('The project ID to update'),
        Name: z.string().optional().describe('New project name'),
        Description: z.string().optional().describe('New project description'),
        StatusId: z.number().optional().describe('New project status ID'),
        PriorityId: z.number().optional().describe('New priority ID'),
        StartDate: z.string().optional().describe('New start date (ISO 8601)'),
        EndDate: z.string().optional().describe('New end date (ISO 8601)'),
      },
    },
    async (args) => {
      if (effectiveUserContext && !hasScope(effectiveUserContext, 'mcp:write')) return buildInsufficientScopeResponse();
      const { path, body } = splitUpdateProjectArgs(args);
      const data = await clients.rest.patch(path, body);
      return buildWriteResponse(data);
    },
  );
}
