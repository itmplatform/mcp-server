There are two ways to connect your AI assistant to ITM Platform:

### Local setup (API Key)

Install the MCP server on your machine. Your AI client spawns the server as a local process and communicates with it directly. You authenticate with an API key from your ITM Platform account.

**Best for:** users who run an AI client on their own computer (Claude Desktop, Claude Code, Cursor, VS Code).

### Hosted setup (OAuth)

Point your AI client to the hosted server URL. When you connect for the first time, you authorize via your ITM Platform login. No install, no API key.

**Best for:** users who want zero setup, or whose AI client supports remote MCP servers.

### How MCP works

MCP (Model Context Protocol) is a standard that lets AI assistants connect to external data sources. When you ask a question about your projects, the AI client sends the request to the ITM MCP server. The server authenticates as you, calls ITM Platform APIs, and returns the data to the AI so it can answer your question.

```
You ask a question
  |
  v
AI Client (Claude, Codex, VS Code...)
  |  spawns MCP server or connects via URL
  v
ITM MCP Server
  |  authenticates as you, calls ITM APIs
  v
Your ITM Platform Data
```

Your data flows through the MCP server to the AI client you are using. The AI provider's data handling policy applies to any data the AI processes.
