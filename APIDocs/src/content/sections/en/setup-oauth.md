This is the fastest way to get started. Your AI client connects to the ITM Platform MCP server over the internet. No installation, no API keys -- just a URL and your ITM Platform login.

If you prefer to run the server locally instead, see [Connect with an API Key](#setup-stdio).

### Step 1: Add the server URL

In your AI client's MCP configuration, add the server URL:

```
https://api.itmplatform.com/v2/_/mcp/
```

The exact format varies by client. See [Setup by AI Client](#ai-clients) below for copy-paste instructions for Claude, VS Code, Cursor, Codex, Windsurf, and more.

### Step 2: Open MCP and authorize

After adding the server, open your AI client and type `/mcp` where slash commands are supported. Select `itm-platform`; the client opens a browser window so you can log in with your ITM Platform credentials and grant access. The AI client receives a token that lets it act on your behalf.

### Step 3: Start asking questions

Ask the AI something about your projects. The authorization is remembered -- you will not need to log in again unless the token expires or you remove the server from your AI client.

### What OAuth does

OAuth lets the AI client act on your behalf without ever seeing your password. You log in directly with ITM Platform, and the server issues a scoped token. To disconnect, remove the server from your AI client (see [Disconnecting](#revoke-and-audit)).

### Scopes

Your OAuth token determines what the AI can do:

| Scope | What it allows |
|-------|----------------|
| `mcp:read` | Search projects, view budgets, list tasks, query the portfolio |
| `mcp:write` | Everything above, plus create tasks, log risks/issues, update projects |
