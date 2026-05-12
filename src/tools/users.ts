import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Clients } from '../clients/index.js';

export function registerUserTools(server: McpServer, clients: Clients) {
  server.registerTool(
    'search_users',
    {
      description: 'Find team members by name or email. Returns userId, name, email, role. Uses v2 REST API (not DataMart).',
      inputSchema: {
        query: z.string().optional().describe('Search by name or email (case-insensitive)'),
        limit: z.number().optional().describe('Max results (default 50)'),
      },
    },
    async (args) => {
      const body: Record<string, unknown> = {
        page: 1,
        pageSize: Math.min(args.limit ?? 50, 200),
      };
      if (args.query) {
        body.Filter = { Name: { $regex: args.query } };
      }
      const data = await clients.rest.post('AllUsers', body);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.registerTool(
    'get_user',
    {
      description: 'Get details for a single user by ID. Returns full user profile including roles, categories, and contact info.',
      inputSchema: {
        userId: z.number().describe('The user ID'),
      },
    },
    async (args) => {
      const data = await clients.rest.get(`users/${args.userId}`);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    },
  );
}
