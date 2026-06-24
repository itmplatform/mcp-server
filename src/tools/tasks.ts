import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Clients } from '../clients/index.js';
import { fetchSubcomponentPage } from './subcomponent-page.js';

export function registerTaskTools(server: McpServer, clients: Clients) {
  server.registerTool(
    'list_project_tasks',
    {
      description: 'List tasks for a project with pagination. Returns { items, total, limit, skip, hasMore }. Default limit: 50, max: 200.',
      inputSchema: {
        projectId: z.number().describe('The project ID'),
        limit: z.number().optional().describe('Max tasks to return (default 50, max 200)'),
        skip: z.number().optional().describe('Number of tasks to skip (for pagination)'),
      },
    },
    async (args) => {
      const page = await fetchSubcomponentPage(clients, args.projectId, 'tasks', args.limit, args.skip);
      return { content: [{ type: 'text' as const, text: JSON.stringify(page, null, 2) }] };
    },
  );
}
