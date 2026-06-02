# ITM Platform MCP Server

Connect ITM Platform to AI assistants through the [Model Context Protocol](https://modelcontextprotocol.io). The ITM Platform MCP server lets MCP-compatible clients search projects, inspect budgets, summarize portfolio health, create tasks, log risks and issues, and update project details using your ITM Platform permissions.

It works with Claude, VS Code, Cursor, OpenAI Codex, Windsurf, JetBrains AI Assistant, and any other client that supports MCP.

- Public docs: [developers.itmplatform.com/mcp](https://developers.itmplatform.com/mcp/)
- npm package: [@itm-platform/mcp-server](https://www.npmjs.com/package/@itm-platform/mcp-server)
- Hosted MCP URL: `https://api.itmplatform.com/v2/_/mcp/`

## Quick Start

### Hosted connection with OAuth

Use the hosted server if your AI client supports remote MCP servers. There is nothing to install: add the URL, sign in with your ITM Platform account, and approve the requested access.

```bash
claude mcp add --scope user --transport http itm-platform https://api.itmplatform.com/v2/_/mcp/
```

For other MCP clients, use this remote URL:

```text
https://api.itmplatform.com/v2/_/mcp/
```

OAuth is the recommended setup for most users because your AI client never sees your ITM Platform password or API key.

### Local connection with an API key

Use the npm package if you prefer to run the server locally, work behind a firewall, or need to connect to a self-hosted ITM Platform instance.

```bash
npx @itm-platform/mcp-server
```

Your MCP client must pass these environment variables to the server:

| Variable | Value |
|----------|-------|
| `ITM_API_URL` | `https://api.itmplatform.com` |
| `ITM_COMPANY` | Your company/account slug |
| `ITM_API_KEY` | Your personal API key from ITM Platform |

Example stdio configuration:

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

To create an API key, log in to ITM Platform, open **My Profile**, and generate a key from the **API Key** section.

## What You Can Ask

Once connected, your AI assistant can use ITM Platform data in normal conversation:

> "Which projects are behind schedule?"

> "Give me a budget summary for the Digital Transformation program."

> "Create a high-priority task in Project Alpha due next Friday."

> "What open risks exist across my portfolio?"

The MCP server authenticates as you, calls ITM Platform APIs, and returns only the data your ITM Platform account is allowed to access.

## Capabilities

The server exposes 20 MCP tools, 6 resources, and 4 prompt templates.

### Read Tools

| Tool | What it does |
|------|--------------|
| `search_projects` | Find projects by name, status, type, or date range |
| `get_project` | Retrieve project details, including optional tasks, risks, issues, budget, purchases, and revenues |
| `search_services` | Find services by name, status, type, or date range |
| `get_service` | Retrieve service details |
| `list_project_tasks` | List tasks for a project |
| `get_project_budget` | Get budget, actuals, revenue, cost, and margin information |
| `get_project_purchases` | List purchase orders for a project |
| `get_project_revenues` | List revenue items for a project |
| `get_project_risks` | List project risks |
| `get_project_issues` | List project issues |
| `aggregate_portfolio` | Group and summarize portfolio data |
| `query_datamart` | Run validated DataMart queries for advanced analysis |
| `search_users` | Find users and team members |
| `get_user` | Retrieve user details |
| `get_reference_data` | Retrieve statuses, types, priorities, and other reference lists |

### Write Tools

| Tool | What it does |
|------|--------------|
| `create_task` | Add a task to a project |
| `update_task` | Update task fields such as status, dates, assignee, and progress |
| `create_risk` | Log a project risk |
| `create_issue` | Log a project issue |
| `update_project` | Update project fields such as name, status, dates, and priority |

Write operations confirm the saved state from the ITM Platform REST API. DataMart-backed search results may take up to 60 seconds to reflect recent writes.

### Resources and Prompts

Resources give AI clients read-only context such as DataMart schemas and project calendars. Prompt templates provide guided workflows for common analysis tasks:

| Prompt | What it helps with |
|--------|--------------------|
| `/project_status` | Summarize health, tasks, risks, issues, and budget for one project |
| `/portfolio_overview` | Analyze portfolio status, methodology, budget, and delivery patterns |
| `/team_workload` | Review assignments and workload patterns |
| `/risk_analysis` | Assess risk exposure, issues, and budget impact |

## Authentication and Permissions

The MCP server uses the same identity and permission model as ITM Platform.

| Connection method | Authentication | Best for |
|-------------------|----------------|----------|
| Hosted HTTP | OAuth 2.1 with PKCE | Most users and managed AI clients |
| Local stdio | ITM Platform API key | Local execution, firewalled networks, self-hosted environments |

OAuth sessions use scopes:

| Scope | Allows |
|-------|--------|
| `mcp:read` | Read-only tools such as search, get, list, aggregate, and query |
| `mcp:write` | Read tools plus create and update tools |

API key sessions use the full permissions of the ITM Platform user who generated the key.

License access:

| License | MCP access |
|---------|------------|
| Company Admin | Full read and write access |
| Full User | Full read and write access |
| Project Manager | Not yet available |
| Team Member | Blocked |

Your AI assistant does not receive your ITM Platform password or API key. Project data is returned to the AI client you choose, so the AI provider's data-handling policy applies to any data it processes.

## Client Setup

Use the public docs for client-specific setup:

- [Claude Code, Claude Desktop, VS Code, Cursor, Codex, Windsurf, and JetBrains](https://developers.itmplatform.com/mcp/#ai-clients)
- [Connect with OAuth](https://developers.itmplatform.com/mcp/#setup-oauth)
- [Connect with an API key](https://developers.itmplatform.com/mcp/#setup-stdio)
- [Troubleshooting](https://developers.itmplatform.com/mcp/#troubleshooting)

For any MCP-compatible client, the two connection values are:

| Method | Value |
|--------|-------|
| Remote URL | `https://api.itmplatform.com/v2/_/mcp/` |
| Local command | `npx @itm-platform/mcp-server` |

## Self-Hosting

For a local stdio server, configure `ITM_API_URL`, `ITM_COMPANY`, and either `ITM_API_KEY` or `ITM_TOKEN`.

For an HTTP server with OAuth, configure:

| Variable | Description |
|----------|-------------|
| `ITM_API_URL` | ITM Platform API gateway URL |
| `PORT` | HTTP listen port |
| `ITM_AUTH_URL` | OAuth authorization server URL used for token exchange |
| `ITM_AUTH_PUBLIC_URL` | Public OAuth URL advertised to AI clients |
| `MCP_SERVER_URL` | Public MCP server URL used as the OAuth audience |
| `LOG_LEVEL` | Optional Pino log level: `debug`, `info`, `warn`, or `error` |
| `ITM_AUDIT_ENABLED` | Enables server-side audit logging when set to `true` |

When deployed behind a reverse proxy, `ITM_AUTH_URL` can point to a server-to-server address while `ITM_AUTH_PUBLIC_URL` must be reachable by AI clients.

## Development

Requirements:

- Node.js 20 or later
- npm

Install dependencies, run tests, and build:

```bash
npm install
npm test
npm run build
```

Run the HTTP development server:

```bash
cp .env.sample .env
npm run dev
```

The package entry point is `dist/server.js`; the npm executable is `mcp-server`.

## Troubleshooting

If tools do not appear in your AI client, confirm that the server configuration is in the correct file for that client, restart the client, and check that `npx @itm-platform/mcp-server` runs successfully for local setups.

If authentication fails, regenerate your API key or reconnect the OAuth server so your client receives a fresh token.

If a write succeeds but a later search shows old data, wait up to 60 seconds. Writes are confirmed from the REST API immediately, while DataMart search indexes update asynchronously.

## More Help

- MCP docs: [modelcontextprotocol.io](https://modelcontextprotocol.io)
- ITM Platform help: [help.itmplatform.com](https://help.itmplatform.com)
- ITM Platform developer docs: [developers.itmplatform.com/documentation](https://developers.itmplatform.com/documentation)
