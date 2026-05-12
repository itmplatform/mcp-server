import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Clients } from '../clients/index.js';
import { COMPONENT_QUERY } from './graphql-queries.js';

export function registerRisksIssuesTools(server: McpServer, clients: Clients) {
  server.registerTool(
    'get_project_risks',
    {
      description: 'Get risks for a project. Returns an array of risk items with name, description, status, probability, impact, and mitigation plan.',
      inputSchema: {
        projectId: z.number().describe('The project ID'),
      },
    },
    async (args) => {
      const data = await clients.datamart.query({
        query: COMPONENT_QUERY,
        variables: { id: args.projectId, proj: { risks: 1 } },
      });
      const component = data.component as Record<string, unknown> | null;
      const risks = component?.risks ?? [];
      return { content: [{ type: 'text' as const, text: JSON.stringify(risks, null, 2) }] };
    },
  );

  server.registerTool(
    'get_project_issues',
    {
      description: 'Get issues for a project. Returns an array of issue items with name, description, status, severity, and resolution.',
      inputSchema: {
        projectId: z.number().describe('The project ID'),
      },
    },
    async (args) => {
      const data = await clients.datamart.query({
        query: COMPONENT_QUERY,
        variables: { id: args.projectId, proj: { issues: 1 } },
      });
      const component = data.component as Record<string, unknown> | null;
      const issues = component?.issues ?? [];
      return { content: [{ type: 'text' as const, text: JSON.stringify(issues, null, 2) }] };
    },
  );
}
