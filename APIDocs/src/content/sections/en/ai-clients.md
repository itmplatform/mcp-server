### Claude Desktop

**Config file:** `%APPDATA%\Claude\claude_desktop_config.json` (Windows) or `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS)

Add the `mcpServers` entry to your config file. For local setup, use the stdio configuration shown in the config panel above. For hosted setup, use the HTTP variant.

### Claude Code

Run this command to add the MCP server:

```
claude mcp add itm-platform -- npx -y itm-mcp
```

Then set your environment variables:

```
ITM_API_URL=https://api.itmplatform.com
ITM_COMPANY={your-account}
ITM_API_KEY=your-api-key
```

For hosted setup, use:

```
claude mcp add itm-platform --transport http --url https://mcp.itmplatform.com/mcp
```

### OpenAI Codex

Add the MCP server to your Codex configuration. Codex supports both stdio and HTTP transports. Use the config snippets from the config panel above.

### VS Code (Copilot)

Add to your VS Code `settings.json` (User or Workspace settings):

```json
{
  "mcp.servers": {
    "itm-platform": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "itm-mcp"],
      "env": {
        "ITM_API_URL": "https://api.itmplatform.com",
        "ITM_COMPANY": "{your-account}",
        "ITM_API_KEY": "your-api-key"
      }
    }
  }
}
```

### Cursor

Create a `.cursor/mcp.json` file in your project root with the stdio configuration.

### JetBrains

Go to **Settings > Tools > AI Assistant > MCP Servers** and add a new server with the stdio or HTTP configuration.
