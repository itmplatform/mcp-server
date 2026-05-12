import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerTeamWorkloadPrompt(server: McpServer) {
  server.registerPrompt(
    'team_workload',
    {
      description: 'Team workload overview. Shows user assignments and project involvement.',
      argsSchema: {
        userId: z.string().optional().describe('Optional: specific user ID to focus on'),
      },
    },
    async (args) => {
      const userFilter = args.userId
        ? ` Focus on user ${args.userId} -- use get_user to get their details first.`
        : ' Get a broad view of the team.';

      return {
        messages: [{
          role: 'user',
          content: {
            type: 'text',
            text: `Generate a team workload overview.${userFilter} Use these tools:
1. search_users to find team members
2. search_projects to see active projects and their managers
Then summarize:
- Who is assigned to what
- Which projects have the most team involvement
- Any potential overload or underutilization patterns`,
          },
        }],
      };
    },
  );
}
