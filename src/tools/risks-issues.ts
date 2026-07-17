import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Clients } from '../clients/index.js';
import { fetchSubcomponentPage } from './subcomponent-page.js';

export function registerRisksIssuesTools(server: McpServer, clients: Clients) {
  server.registerTool(
    'get_project_risks',
    {
      description: 'Get risks for a project with pagination. Returns { items, total, limit, skip, hasMore }. Default limit: 50, max: 200.',
      inputSchema: {
        projectId: z.number().describe('The project ID'),
        limit: z.number().optional().describe('Max risks to return (default 50, max 200)'),
        skip: z.number().optional().describe('Number of risks to skip (for pagination)'),
      },
    },
    async (args) => {
      const page = await fetchSubcomponentPage(clients, args.projectId, 'risks', args.limit, args.skip);
      return { content: [{ type: 'text' as const, text: JSON.stringify(page, null, 2) }] };
    },
  );

  server.registerTool(
    'get_risk',
    {
      description: 'Get full detail of a single risk from v2 REST (source of truth). '
        + 'Includes mitigation and contingency plans, probability, impact, level, occurrence cost, and manager. '
        + 'Use get_project_risks first to discover risk IDs.',
      inputSchema: {
        projectId: z.number().describe('The project ID containing the risk'),
        riskId: z.number().describe('The risk ID'),
      },
    },
    async (args) => {
      const risk = await clients.rest.get(`projects/${args.projectId}/risks/${args.riskId}`);
      return { content: [{ type: 'text' as const, text: JSON.stringify(risk, null, 2) }] };
    },
  );

  server.registerTool(
    'get_issue',
    {
      description: 'Get full detail of a single issue from v2 REST (source of truth). '
        + 'Includes type, status, manager, management cost/hours, project impact, final resolution, and custom fields. '
        + 'Use get_project_issues first to discover issue IDs.',
      inputSchema: {
        projectId: z.number().describe('The project ID containing the issue'),
        issueId: z.number().describe('The issue ID'),
      },
    },
    async (args) => {
      const issue = await clients.rest.get(`projects/${args.projectId}/issues/${args.issueId}`);
      return { content: [{ type: 'text' as const, text: JSON.stringify(issue, null, 2) }] };
    },
  );

  server.registerTool(
    'get_project_issues',
    {
      description: 'Get issues for a project with pagination. Returns { items, total, limit, skip, hasMore }. Default limit: 50, max: 200.',
      inputSchema: {
        projectId: z.number().describe('The project ID'),
        limit: z.number().optional().describe('Max issues to return (default 50, max 200)'),
        skip: z.number().optional().describe('Number of issues to skip (for pagination)'),
      },
    },
    async (args) => {
      const page = await fetchSubcomponentPage(clients, args.projectId, 'issues', args.limit, args.skip);
      return { content: [{ type: 'text' as const, text: JSON.stringify(page, null, 2) }] };
    },
  );
}
