# ITM.MCP

> For cross-cutting documentation (debugging, database schema, environments, API versioning, build commands), see the [parent README](../README.md#documentation-index).

MCP (Model Context Protocol) server for ITM Platform. Exposes project management data and operations to AI assistants (Claude, ChatGPT, VS Code Copilot, Cursor, etc.) through a universal protocol.

See [House Rules](../House-rules.md) for coding conventions.

## Quick Start

```bash
npm install
cp .env.sample .env   # edit with your credentials
npm test              # run unit tests (76 tests)
npm run dev           # start HTTP dev server on port 6160 (requires .env)
npm run build         # compile TypeScript to dist/
npm start             # start in stdio mode (for AI clients)
npm run test:e2e      # run E2E tests (requires local ITM.API + DataMart)
```

## Architecture

```
AI Client (Claude / ChatGPT / VS Code / Cursor)
   |
   |  MCP Protocol (JSON-RPC 2.0)
   |  Transport: Streamable HTTP (prod) or stdio (local dev)
   |
   v
+------------------+
|   ITM.MCP        |  TypeScript + @modelcontextprotocol/sdk
|   Server         |  15 Tools, 6 Resources, 4 Prompts
+--------+---------+
         |
         |  HTTP (Bearer API key auth)
         |
         v
+------------------+     +------------------+     +--------------------+
|  ITM.API         |---->|  ITM.Tasks       |     |  ITM.DataMart      |
|  Gateway         |---->|  ITM.Account     |     |  (GraphQL)         |
+------------------+     +------------------+     +--------------------+
```

## AI Client Configuration

### Claude Desktop

```json
{
  "mcpServers": {
    "itm-platform": {
      "type": "stdio",
      "command": "node",
      "args": ["./dist/server.js"],
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

Add to `.claude/settings.json` or `.mcp.json`:

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

### VS Code (Copilot)

Add to `.vscode/mcp.json`:

```json
{
  "mcpServers": {
    "itm-platform": {
      "type": "stdio",
      "command": "node",
      "args": ["./dist/server.js"],
      "env": {
        "ITM_API_URL": "http://localhost/ITM.API",
        "ITM_COMPANY": "testsmarter",
        "ITM_API_KEY": "your-api-key"
      }
    }
  }
}
```

### Cursor

Add to `.cursor/mcp.json` with the same format as VS Code above.

### JetBrains IDEs

Configure in IDE MCP settings with the same environment variables.

## Tools (Phase 1 -- Read-Only)

### DataMart-backed (component reads)

| Tool | Description |
|------|-------------|
| `search_projects` | Find projects by name, status, type, date range |
| `get_project` | Full project details with optional subcomponents |
| `search_services` | Find services by name, status, type, date range |
| `get_service` | Full service details with optional subcomponents |
| `list_project_tasks` | List tasks for a project |
| `get_project_risks` | List risks for a project |
| `get_project_issues` | List issues for a project |
| `get_project_budget` | Budget summary (4 budget types) |
| `get_project_purchases` | Purchase orders for a project |
| `get_project_revenues` | Revenue items for a project |
| `aggregate_portfolio` | Portfolio analytics (group, count, sum, avg) |
| `query_datamart` | Raw DataMart query (advanced, with validation) |

### v2 REST-backed (users, reference data)

| Tool | Description |
|------|-------------|
| `search_users` | Find team members |
| `get_user` | User details |
| `get_reference_data` | Status lists, types, priorities |

## Prompts

| Prompt | Description |
|--------|-------------|
| `/project_status` | Status report for a project |
| `/portfolio_overview` | Portfolio health overview |
| `/team_workload` | Team workload analysis |
| `/risk_analysis` | Risk assessment for a project |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ITM_API_URL` | Yes | Base URL for ITM.API gateway |
| `ITM_COMPANY` | Yes | Company/tenant slug |
| `ITM_API_KEY` | One required | Per-user API key (from ITM Platform profile page) |
| `ITM_TOKEN` | One required | Session token (alternative to API key for dev; see `.env.sample`) |
| `PORT` | No | HTTP port for dev mode (default: 6160) |
| `LOG_LEVEL` | No | Pino log level (default: info) |

## Specification

Full discovery, architecture decisions, phased capabilities, and implementation details:

- [SPEC_MCP_SERVER.md](zz_Specifications/SPEC_MCP_SERVER.md)

## Status

**Phase 1 complete** -- Read-only tools over stdio transport. 15 tools, 6 resources, 4 prompts. 76 unit tests, 18 E2E tests passing.
