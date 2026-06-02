There are two ways to connect your AI assistant to ITM Platform. Pick the one that fits your situation -- you can always switch later.

### Connect with OAuth (recommended)

Add a single URL to your AI client. Then open MCP in the client -- type `/mcp` where slash commands are supported -- select `itm-platform`, and authenticate with your ITM Platform credentials. No install, no API key, no environment variables.

**One line is all it takes:**

```
https://api.itmplatform.com/v2/_/mcp/
```

After adding the URL, use `/mcp` or your client's MCP server list to connect to `itm-platform` and complete the OAuth login.

**Best for:** most users. Works with Claude Code, Claude Desktop, Cursor, VS Code, and any MCP-compatible client that supports remote servers.

### Connect with an API key (alternative)

Install the MCP server locally via npm. Your AI client spawns the server as a local process. You authenticate with an API key generated from your ITM Platform account.

```bash
npx @itm-platform/mcp-server
```

After configuring the local server, restart your AI client and use `/mcp` or the client's MCP server list to confirm `itm-platform` is connected.

**Best for:** users who prefer offline access, work behind a firewall, or need full control over the server process.

### How MCP works

MCP (Model Context Protocol) is an open standard that lets AI assistants connect to external data sources. When you ask a question about your projects, the AI client sends the request to the ITM MCP server. The server authenticates as you, calls ITM Platform APIs, and returns the data to the AI so it can answer.

```
You ask a question
  |
  v
AI Client (Claude, Cursor, VS Code, Codex...)
  |  connects to MCP server (remote URL or local process)
  v
ITM MCP Server
  |  authenticates as you, calls ITM APIs
  v
Your ITM Platform Data
```

Your data flows through the MCP server to the AI client you are using. The AI provider's data-handling policy applies to any data the AI processes.
