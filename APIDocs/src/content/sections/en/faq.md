### Is my data sent to the AI company?

The MCP server runs between your AI client and ITM Platform. Your project data flows through the MCP server to the AI client. The AI provider (Anthropic, OpenAI, etc.) processes the data according to their own data handling policy. ITM Platform does not send your data to any AI provider independently -- the data flows only when you ask a question through your AI client.

### Can the AI modify my projects?

Yes, if you have the right license and have granted write permissions. Company Admins and Full Users have full access; Project Managers can modify only the projects they manage. The AI can create tasks, update projects, and log risks and issues. To stop access, remove the MCP server from your AI client (see [Disconnecting](#revoke-and-audit)).

### Which AI clients are supported?

Claude Code, Claude Desktop, VS Code (Copilot), Cursor, OpenAI Codex, Windsurf, and JetBrains AI Assistant. Any MCP-compatible client can connect using the standard configuration.

### Do I need to install anything?

For local setup: you need Node.js installed (the `npx` command handles the rest). For hosted setup: nothing to install -- just add the server URL to your AI client.

### What happens if I change my password?

API keys are not affected by password changes. OAuth tokens remain valid until they expire. You do not need to reconfigure your AI client after a password change.

### Can multiple users connect at the same time?

Yes. Each user authenticates independently with their own API key or OAuth token. The MCP server resolves each user's identity and permissions separately.

### Where can I find more help?

- For ITM Platform questions: [helpcenter.itmplatform.com](https://helpcenter.itmplatform.com)
- For REST API access without an AI assistant: [developers.itmplatform.com/documentation](https://developers.itmplatform.com/documentation)
- For DataMart (GraphQL) queries: [developers.itmplatform.com/datamart](https://developers.itmplatform.com/datamart)
