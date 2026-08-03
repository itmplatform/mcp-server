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

After adding the server, open your AI client, type `/mcp` where slash commands are supported, select `itm-platform`, and complete the ITM Platform OAuth login when prompted.

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

After configuring the local server, restart your AI client and use `/mcp` or the client's MCP server list to confirm `itm-platform` is connected.

## What Can an Agent Do?

From simple lookups to fully automated cross-system workflows, MCP unlocks progressively more powerful use cases.

**Quick lookup** -- Ask a question, get an answer:

> "What risks are open across my portfolio?"

**Multi-step analysis** -- The agent chains multiple tools and synthesizes results:

> "Review every project ending this quarter. Flag any with budget overruns, open high-impact risks, or task completion below 60%."

**Automated bulk actions** -- The agent reads, decides, and writes across projects:

> "For every project still in Planning status with a start date in the past, update the status to Execution and create a kick-off checklist task assigned to the project manager."

**Scheduled intelligence** -- An agent runs on a schedule with no human prompt, pulling overdue tasks every Monday and posting a summary to Slack grouped by project manager.

**Cross-system orchestration** -- Combine ITM Platform's MCP with other MCP servers (GitHub, Slack, Google Calendar, email). When a developer merges a PR, an agent finds the matching ITM Platform task, marks it complete, and if the project hits 100%, drafts a closure summary and emails the program manager.

The MCP server authenticates as you, calls ITM Platform APIs, and returns only the data your ITM Platform account is allowed to access.

## Capabilities

The server exposes 44 MCP tools, 6 resources, and 4 prompt templates.

### Read Tools

| Tool | What it does |
|------|--------------|
| `search_projects` | Find projects by name, status, type, or date range |
| `get_project` | Retrieve project details with subcomponent counts and optional budget |
| `search_services` | Find services by name, status, type, or date range |
| `get_service` | Retrieve service details with subcomponent counts and optional budget |
| `list_project_tasks` | List tasks for a project with pagination |
| `get_task` | Retrieve full detail of a single task |
| `search_tasks` | Search tasks across all projects by name, status, assignee, kind, or date range |
| `get_project_budget` | Get budget, actuals, revenue, cost, and margin information |
| `get_project_purchases` | List purchase orders for a project with pagination |
| `get_project_revenues` | List revenue items for a project with pagination |
| `get_project_risks` | List project risks with pagination |
| `get_project_issues` | List project issues with pagination |
| `get_risk` | Retrieve full detail of a single risk, including mitigation and contingency plans |
| `get_issue` | Retrieve full detail of a single issue, including resolution and impact fields |
| `list_task_progress` | List the progress (follow-up) history for a task |
| `get_task_effort` | Get a task's effort breakdown per team member and per professional category; doubles as the task team list |
| `get_project_progress` | Get project progress report: expected, baseline, and actual curves |
| `list_service_activities` | List activities for a service with pagination |
| `get_service_purchases` | List purchase orders for a service with pagination |
| `get_service_revenues` | List revenue items for a service with pagination |
| `aggregate_portfolio` | Group and summarize portfolio data |
| `query_datamart` | Run validated DataMart queries for advanced analysis |
| `search_users` | Find users and team members |
| `get_user` | Retrieve user details |
| `get_reference_data` | Retrieve statuses, types, priorities, and other reference lists |
| `get_custom_fields` | Retrieve the account's custom field definitions for projects, tasks, risks, issues, services, activities, purchases, or revenues |
| `get_custom_field_options` | Retrieve the selectable options of a dropdown custom field |

### Write Tools

| Tool | What it does |
|------|--------------|
| `create_project` | Create a project (Waterfall or Kanban); the project starts with the account default status and the creating user as project manager |
| `create_task` | Add a task, milestone (KindId 1), or summary task (KindId 2); ParentId builds Gantt hierarchy on Waterfall projects; TaskManagers/TaskMembers assign users by username |
| `update_task` | Update task fields such as status, dates, kind, and parent; TaskManagers/TaskMembers add assignees by username (add-only, never removes) |
| `create_task_progress` | Report progress on a task (percentage, assessment, notes) with full side effects |
| `update_task_progress` | Update an existing task progress entry |
| `update_task_effort` | Set the estimated (planned) hours of a task per assigned user; accepted effort and billing data are preserved |
| `create_risk` | Log a project risk |
| `update_risk` | Update risk fields such as status, probability, impact, level, and mitigation or contingency plans |
| `create_issue` | Log a project issue with a required issue type and status |
| `update_issue` | Update issue fields such as status, type, and resolution |
| `update_project` | Update project fields such as name, status, dates, and priority |
| `create_service` | Create a service; it starts with the account default status |
| `update_service` | Update service fields such as name, status, dates, and priority |
| `create_activity` | Add an activity to a service (activities form a flat list) |
| `update_activity` | Update activity fields such as status and dates |
| `bulk_update_task_status` | Apply one status to up to 100 tasks of a project in a single call |
| `bulk_update_activity_status` | Apply one status to up to 100 activities of a service in a single call |

Write operations confirm the saved state from the ITM Platform REST API. DataMart-backed search results may take up to 60 seconds to reflect recent writes.
Validation failures include the actionable message returned by REST instead of only the HTTP status.

When the account defines custom fields, each session is enriched with per-account context: the server lists the DataMart `customFields` keys actually in use in the MCP initialize instructions and in the `query_datamart` tool description, so agents can read and filter custom field values without prior discovery.

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
| Project Manager | Read and write access scoped to managed projects |
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

After adding either connection, open the client's MCP command or server list. In clients that support slash commands, type `/mcp`, select `itm-platform`, and authenticate when prompted.

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
| `ITM_UI_URL` | Optional ITM Platform UI base URL (e.g. `https://app.itmplatform.com`); when set, `create_project` returns a `uiUrl` deep link to the created project |

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

OAuth sessions automatically retry once on a downstream 401 by re-exchanging the OAuth bearer token for a fresh session token. This handles cases where the session token is invalidated externally (e.g. by a concurrent browser login). If 401 errors persist, the OAuth bearer token itself has likely expired and the AI client needs to re-authenticate.

If a write succeeds but a later search shows old data, wait up to 60 seconds. Writes are confirmed from the REST API immediately, while DataMart search indexes update asynchronously.

## More Help

- MCP docs: [modelcontextprotocol.io](https://modelcontextprotocol.io)
- ITM Platform help: [helpcenter.itmplatform.com](https://helpcenter.itmplatform.com)
- ITM Platform developer docs: [developers.itmplatform.com](https://developers.itmplatform.com)
