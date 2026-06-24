import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerRiskAnalysisPrompt(server: McpServer) {
  server.registerPrompt(
    'risk_analysis',
    {
      description: 'Risk assessment for a project. Fetches risks, issues, and budget data to analyze risk exposure.',
      argsSchema: {
        projectId: z.string().describe('The project ID to analyze'),
      },
    },
    async (args) => ({
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: `Perform a risk assessment for project ${args.projectId}.
1. Use get_project with include: ["budget"] to fetch project details and budget.
2. Use get_project_risks to fetch risks.
3. Use get_project_issues to fetch issues.
Then analyze:
1. Active risks: probability, impact, and mitigation status
2. Open issues: severity and resolution progress
3. Budget risk: variance between planned and actual
4. Overall risk exposure rating (low/medium/high/critical)
5. Recommended actions for the top risks`,
        },
      }],
    }),
  );
}
