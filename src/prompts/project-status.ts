import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerProjectStatusPrompt(server: McpServer) {
  server.registerPrompt(
    'project_status',
    {
      description: 'Generate a status report for a project. Fetches project details, budget, tasks, risks, and issues using dedicated tools.',
      argsSchema: {
        projectId: z.string().describe('The project ID to report on'),
      },
    },
    async (args) => ({
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: `Generate a comprehensive status report for project ${args.projectId}.
1. Use get_project with include: ["budget"] to fetch project details, subcomponent counts, and budget.
2. Use list_project_tasks to fetch tasks (paginate if the count is large).
3. Use get_project_risks to fetch risks.
4. Use get_project_issues to fetch issues.
Then summarize:
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
