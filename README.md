# ITM.MCP

> For cross-cutting documentation (debugging, database schema, environments, API versioning, build commands), see the [parent README](../README.md#documentation-index).

MCP (Model Context Protocol) server for ITM Platform. Exposes project management data to AI assistants -- Claude, ChatGPT, VS Code Copilot, Cursor, JetBrains -- through a universal open protocol.

**Status:** Phase 2 in progress -- 20 tools (15 read + 5 write), 6 resources, 4 prompts. OAuth scaffolding and audit logging infrastructure in place. 124 unit tests, 23 E2E tests.

See [House Rules](../House-rules.md) for coding conventions.

## How it works

MCP is a JSON-RPC 2.0 protocol that lets AI assistants discover and call tools on external servers. The AI client (Claude Desktop, VS Code, etc.) spawns the MCP server as a **child process** connected via stdin/stdout. The server stays running for the session's lifetime -- you never start it manually.

```
You ask: "Which projects are behind schedule?"
  |
  v
AI Client (Claude Desktop / VS Code / Cursor)
  |  1. Spawns ITM.MCP as a child process at session start
  |  2. Discovers tools via JSON-RPC handshake
  |  3. The AI model decides which tools to call based on your question
  |  4. Sends tool calls over stdin, reads results from stdout
  |
  v
ITM.MCP Server (child process, stdin/stdout)
  |  - Authenticates once at startup using your API key
  |  - Receives tool calls, queries ITM APIs, returns results
  |  - Stays alive until the AI client closes
  |
  v
ITM.API Gateway --> DataMart (GraphQL) + v2 REST (users, reference data)
```

**Key point:** The AI model never sees your credentials. Auth is handled by the MCP server process. The model only sees tool names, descriptions, and results.

### Three MCP primitives

| Primitive | Who controls it | What it does | Example |
|-----------|----------------|--------------|---------|
| **Tools** | AI model decides when to call | Executable read/write operations | `search_projects`, `get_project_budget` |
| **Resources** | Client app loads as context | Read-only reference data (schemas, docs) | `itm://schema/component` |
| **Prompts** | User triggers a workflow template | Pre-composed multi-tool request | `/project_status` fetches project + tasks + risks + budget in one shot |

## Quick start

```bash
npm install
cp .env.sample .env   # edit with your credentials
npm test              # unit tests (124 tests)
npm run build         # compile TypeScript to dist/
npm run dev           # HTTP dev server on port 6160 (for testing with curl)
npm run test:e2e      # E2E tests (requires local ITM.API + DataMart)
```

## AI client configuration

The config tells the AI client how to spawn the MCP server. All clients use the same pattern: a command, args, and three environment variables.

| Variable | Required | Description |
|----------|----------|-------------|
| `ITM_API_URL` | Yes | ITM.API gateway URL |
| `ITM_COMPANY` | Yes | Company/tenant slug |
| `ITM_API_KEY` | Yes* | Per-user API key (generate from My Profile in ITM Platform) |
| `ITM_TOKEN` | Yes* | Session token (alternative to API key, useful for dev) |
| `LOG_LEVEL` | No | Pino log level: `debug`, `info`, `warn`, `error` (default: `info`) |

\* One of `ITM_API_KEY` or `ITM_TOKEN` is required.

### Claude Desktop

Edit `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "itm-platform": {
      "type": "stdio",
      "command": "node",
      "args": ["C:/path/to/ITM.MCP/dist/server.js"],
      "env": {
        "ITM_API_URL": "http://localhost/ITM.API",
        "ITM_COMPANY": "testsmarter",
        "ITM_API_KEY": "your-api-key"
      }
    }
  }
}
```

### Claude Code

Add to `.claude/settings.json` or `.mcp.json` -- same JSON structure as above.

### VS Code (Copilot)

Add to `.vscode/mcp.json` -- same JSON structure as above.

### Cursor / JetBrains

Add to `.cursor/mcp.json` or IDE MCP settings -- same JSON structure as above.

## Tools (Phase 1 -- read-only)

### DataMart-backed (fast, single-query reads)

| Tool | Description |
|------|-------------|
| `search_projects` | Find projects by name, status, type, date range |
| `search_services` | Find services by name, status, type, date range |
| `get_project` | Full project details with optional subcomponents (tasks, risks, budget, etc.) |
| `get_service` | Full service details with optional subcomponents |
| `list_project_tasks` | Tasks for a project |
| `get_project_risks` | Risks for a project |
| `get_project_issues` | Issues for a project |
| `get_project_budget` | Budget summary (top-down, bottom-up, actual, period-end close) |
| `get_project_purchases` | Purchase orders for a project |
| `get_project_revenues` | Revenue items for a project |
| `aggregate_portfolio` | Portfolio analytics -- group, count, sum, avg across all projects |
| `query_datamart` | Raw DataMart query for advanced analysis (validated, safe operators only) |

### v2 REST-backed (users, reference data)

| Tool | Description |
|------|-------------|
| `search_users` | Find team members |
| `get_user` | User details |
| `get_reference_data` | Status lists, types, priorities for any entity |

### Write tools (Phase 2 -- v2 REST-backed)

| Tool | Description |
|------|-------------|
| `create_task` | Create a new task in a project |
| `update_task` | PATCH task fields (status, dates, assignee, progress) |
| `create_risk` | Log a new risk in a project |
| `create_issue` | Log a new issue in a project |
| `update_project` | PATCH project fields (name, status, dates, priority) |

Write tools return confirmed state from v2 REST (source of truth). Subsequent DataMart reads may lag 5-60 seconds due to eventual consistency -- this is noted in every write response.

## Prompts

Workflow templates the user can trigger. The MCP server returns a pre-composed message that instructs the AI to call the right tools.

| Prompt | What it does |
|--------|-------------|
| `/project_status` | Fetches project + tasks + risks + budget, asks AI to summarize |
| `/portfolio_overview` | Aggregates projects by status/methodology/budget, asks AI for health overview |
| `/team_workload` | Fetches users + assignments, asks AI for workload analysis |
| `/risk_analysis` | Fetches risks + issues + budget, asks AI for risk assessment |

## Architecture

```
src/
  server.ts                # MCP server bootstrap (stdio + HTTP, per-session auth)
  logger.ts                # Pino logger factory (stderr + rotating file in logs/mcp.log)
  auth/
    effective-user-context.ts  # User identity type
    api-key-auth.ts            # API key auth, calls /resolve/identity
    license-resolver.ts        # License type -> access level
    oauth-auth.ts              # Phase 2: OAuth token exchange
    oauth-metadata.ts          # Phase 2: /.well-known/oauth-protected-resource
    token-extraction.ts        # Bearer token extraction from headers
  clients/
    datamart-client.ts     # DataMart GraphQL through gateway
    rest-client.ts         # v2 REST through gateway (GET, POST, PATCH)
    audit-client.ts        # Phase 2: audit logging (fire-and-forget)
  tools/                   # One file per tool group
    write-tools.ts         # Phase 2: create/update tools (task, risk, issue, project)
  resources/               # Schema + calendar resources
  prompts/                 # Workflow templates
  validation/
    query-validator.ts     # Allowlist of safe MongoDB operators
```

## Access control

| License type | Access |
|-------------|--------|
| CompanyAdmin | Full |
| FullUser | Full |
| ProjectManager | Blocked in Phase 1 (requires gateway PM-scope injection -- Phase 2) |
| TeamMember | Blocked |

## Logging

Uses [Pino](https://getpino.io/) (same as DataMart and MSTeamsBot). Logs go to two destinations:

- **stderr** -- pretty-printed, colorized (stdout is reserved for the MCP JSON-RPC protocol)
- **`logs/mcp.log`** -- rotating file, 10 MB max, keeps 5 old files (skipped in test)

Set `LOG_LEVEL` in `.env` to control verbosity (`debug`, `info`, `warn`, `error`; default: `info`). All log entries include `{ service: 'mcp', app: 'ITM.MCP' }` base fields and ISO timestamps.

HTTP clients (DataMart, REST) log at `debug` level on success (with duration in ms) and `error` on failure.

## Specification

Full design, architecture decisions, phased rollout, and E2E test details:

- [SPEC_MCP_SERVER.md](zz_Specifications/SPEC_MCP_SERVER.md)
