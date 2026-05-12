import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerProjectStatusPrompt(server: McpServer) {
  server.registerPrompt(
    'project_status',
    {
      description: 'Generate a status report for a project. Fetches the project with tasks, risks, issues, and budget in one call.',
      argsSchema: {
        projectId: z.string().describe('The project ID to report on'),
      },
    },
    async (args) => ({
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: `Generate a comprehensive status report for project ${args.projectId}. Use the get_project tool with include: ["tasks", "risks", "issues", "budget"] to fetch all data in one call. Then summarize:
1. Overall status and progress
2. Key task status breakdown (not started / in progress / completed)
3. Active risks and their mitigation status
4. Open issues
5. Budget health (planned vs actual)
6. Key concerns or blockers`,
        },
      }],
    }),
  );
}
