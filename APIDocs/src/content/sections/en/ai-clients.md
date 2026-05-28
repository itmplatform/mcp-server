There are two ways to connect: **OAuth** (recommended) connects to the hosted server with just a URL -- no install, no keys. **API Key** runs the server locally on your machine and authenticates with a key from your ITM Platform account.

Pick your AI client below. Each one shows both methods.

---

### Claude Code

**OAuth (recommended):**

```bash
claude mcp add --scope user --transport http itm-platform https://api.itmplatform.com/v2/_/mcp/
```

The `--scope user` flag makes the server available across all your projects. Claude Code handles OAuth automatically -- your browser will open for login the first time a tool is called.

**API Key (local):**

```bash
claude mcp add --scope user itm-platform -- npx @itm-platform/mcp-server
```

Then set your environment variables (see [API Key details](#api-key-details) below).

---

### Claude Desktop

**OAuth (recommended):**

Go to **Settings > Connectors > Add custom connector** and enter the server URL:

```
https://api.itmplatform.com/v2/_/mcp/
```

Claude Desktop handles the OAuth flow automatically. Available on Pro, Max, Team, and Enterprise plans.

**API Key (local):**

Edit your config file (`%APPDATA%\Claude\claude_desktop_config.json` on Windows, `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "itm-platform": {
      "command": "npx",
      "args": ["@itm-platform/mcp-server"],
      "env": {
        "ITM_API_URL": "https://api.itmplatform.com",
        "ITM_COMPANY": "{your-account}",
        "ITM_API_KEY": "your-api-key"
      }
    }
  }
}
```

---

### VS Code (GitHub Copilot)

**OAuth (recommended)** -- create or edit `.vscode/mcp.json` in your workspace:

```json
{
  "servers": {
    "itm-platform": {
      "type": "http",
      "url": "https://api.itmplatform.com/v2/_/mcp/"
    }
  }
}
```

You can also add servers via **Command Palette > MCP: Add Server**.

**API Key (local):**

```json
{
  "servers": {
    "itm-platform": {
      "type": "stdio",
      "command": "npx",
      "args": ["@itm-platform/mcp-server"],
      "env": {
        "ITM_API_URL": "https://api.itmplatform.com",
        "ITM_COMPANY": "{your-account}",
        "ITM_API_KEY": "your-api-key"
      }
    }
  }
}
```

---

### Cursor

Create or edit `.cursor/mcp.json` in your project root (or `~/.cursor/mcp.json` for global access).

**OAuth (recommended):**

```json
{
  "mcpServers": {
    "itm-platform": {
      "url": "https://api.itmplatform.com/v2/_/mcp/"
    }
  }
}
```

**API Key (local):**

```json
{
  "mcpServers": {
    "itm-platform": {
      "command": "npx",
      "args": ["@itm-platform/mcp-server"],
      "env": {
        "ITM_API_URL": "https://api.itmplatform.com",
        "ITM_COMPANY": "{your-account}",
        "ITM_API_KEY": "your-api-key"
      }
    }
  }
}
```

---

### OpenAI Codex

**OAuth (recommended):**

```bash
codex mcp add itm-platform --url https://api.itmplatform.com/v2/_/mcp/
```

Or add manually to `~/.codex/config.toml`:

```toml
[mcp_servers.itm-platform]
url = "https://api.itmplatform.com/v2/_/mcp/"
```

---

### Windsurf

Edit `~/.codeium/windsurf/mcp_config.json` (or `%USERPROFILE%\.codeium\windsurf\mcp_config.json` on Windows):

**OAuth (recommended):**

```json
{
  "mcpServers": {
    "itm-platform": {
      "serverUrl": "https://api.itmplatform.com/v2/_/mcp/"
    }
  }
}
```

**API Key (local):**

```json
{
  "mcpServers": {
    "itm-platform": {
      "command": "npx",
      "args": ["@itm-platform/mcp-server"],
      "env": {
        "ITM_API_URL": "https://api.itmplatform.com",
        "ITM_COMPANY": "{your-account}",
        "ITM_API_KEY": "your-api-key"
      }
    }
  }
}
```

---

### JetBrains (AI Assistant)

Go to **Settings > Tools > AI Assistant > Model Context Protocol (MCP)** and click **Add**.

**OAuth (recommended):** select HTTP protocol and enter `https://api.itmplatform.com/v2/_/mcp/`.

**API Key (local):** select stdio protocol and use the command `npx @itm-platform/mcp-server` with the required environment variables.

---

### Other MCP clients

Any client that implements the [Model Context Protocol](https://modelcontextprotocol.io) can connect:

| Method | Value |
|--------|-------|
| **Remote URL (OAuth)** | `https://api.itmplatform.com/v2/_/mcp/` |
| **Local command (API Key)** | `npx @itm-platform/mcp-server` |

---

### About OAuth

The first time you connect via OAuth, your AI client opens a browser window. Log in with your ITM Platform credentials and grant access. The AI client receives a scoped token:

| Scope | What it allows |
|-------|----------------|
| `mcp:read` | Search projects, view budgets, list tasks, query the portfolio |
| `mcp:write` | Everything above, plus create tasks, log risks/issues, update projects |

OAuth lets the AI act on your behalf without ever seeing your password.

### <a id="api-key-details"></a>About API Keys

To use the local (API Key) method, generate a key in your ITM Platform account:

1. Log in and go to **My Profile** (click your avatar in the top right)
2. Under **API Key**, click **Generate**
3. Copy the key

Your AI client needs three environment variables:

| Variable | Value |
|----------|-------|
| `ITM_API_URL` | `https://api.itmplatform.com` |
| `ITM_COMPANY` | Your company/account slug (the name in your ITM Platform URL) |
| `ITM_API_KEY` | The key you just generated |

**When to use API Keys instead of OAuth:**

- You work behind a corporate firewall that blocks the hosted server
- You want the MCP server to run fully offline
- You need to point the server at a self-hosted ITM Platform instance
- You want to inspect or customize the server behavior locally
