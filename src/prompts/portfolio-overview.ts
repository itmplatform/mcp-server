import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerPortfolioOverviewPrompt(server: McpServer) {
  server.registerPrompt(
    'portfolio_overview',
    {
      description: 'Portfolio health overview. Aggregates projects by status and methodology, summarizes budget variance.',
    },
    async () => ({
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: `Generate a portfolio health overview. Use these tools:
1. aggregate_portfolio with groupBy: "statusLabel", metrics: ["count", "avgProgress"] to see project distribution by status
2. aggregate_portfolio with groupBy: "methodology", metrics: ["count", "totalBudget", "totalActual"] to see methodology breakdown with financials
Then summarize:
- Total projects and status distribution
- Average progress by status
- Budget health across the portfolio (planned vs actual)
- Any concerning patterns (e.g., many projects behind schedule)`,
        },
      }],
    }),
  );
}
