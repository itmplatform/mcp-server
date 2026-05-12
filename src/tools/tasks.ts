import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Clients } from '../clients/index.js';
import { COMPONENT_QUERY } from './graphql-queries.js';

export function registerTaskTools(server: McpServer, clients: Clients) {
  server.registerTool(
    'list_project_tasks',
    {
      description: 'List all tasks for a project. Returns task details: taskId, name, statusLabel, priorityLabel, assignedTo, startDate, endDate, percentComplete.',
      inputSchema: {
        projectId: z.number().describe('The project ID'),
      },
    },
    async (args) => {
      const variables = { id: args.projectId, proj: { tasks: 1 } };
      const data = await clients.datamart.query({ query: COMPONENT_QUERY, variables });
      const component = data.component as Record<string, unknown> | null;
      const tasks = (component?.tasks ?? []) as unknown[];
      return { content: [{ type: 'text' as const, text: JSON.stringify(tasks, null, 2) }] };
    },
  );
}
