# ITM.MCP

> For cross-cutting documentation (debugging, database schema, environments, API versioning, build commands), see the [parent README](../README.md#documentation-index).

MCP (Model Context Protocol) server for ITM Platform. Exposes project management data and operations to AI assistants (Claude, ChatGPT, VS Code Copilot, Cursor, etc.) through a universal protocol.

See [House Rules](../House-rules.md) for coding conventions.

## What Is This

An MCP server acts as a bridge between AI assistants and ITM Platform's v2 REST API. Any AI client that supports the MCP standard can connect to this server and:

- Query projects, tasks, users, risks, issues, and budgets
- Run analytics via DataMart's GraphQL endpoint
- Execute workflow prompts (project status reports, risk analysis, workload reviews)
- (Phase 2) Create and update tasks, risks, and issues

The server is a **thin proxy** -- it translates MCP tool calls into v2 API calls and formats responses for AI consumption. All business logic stays in the microservices.

## Architecture

```
AI Client (Claude / ChatGPT / VS Code / Cursor)
   │
   │  MCP Protocol (JSON-RPC 2.0)
   │  Transport: Streamable HTTP (prod) or stdio (local dev)
   │
   ▼
┌──────────────┐
│   ITM.MCP    │  TypeScript + @modelcontextprotocol/sdk
│   Server     │  Tools, Resources, Prompts
└──────┬───────┘
       │
       │  HTTP (Token auth)
       │
       ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────────┐
│  ITM.API     │────▶│  ITM.Tasks   │     │  ITM.DataMart    │
│  Gateway     │────▶│  ITM.Account │     │  (GraphQL)       │
└──────────────┘     └──────────────┘     └──────────────────┘
```

## Tech Stack

| Layer | Choice |
|-------|--------|
| Language | TypeScript |
| MCP SDK | `@modelcontextprotocol/sdk` |
| Transport | Streamable HTTP (production) + stdio (local dev) |
| Auth | Token pass-through to ITM v2 API |
| HTTP client | `fetch` or `axios` |

## Specification

Full discovery, architecture decisions, phased capabilities, and implementation details:

- [SPEC_MCP_SERVER.md](zz_Specifications/SPEC_MCP_SERVER.md)

## Status

**Pre-development** -- specification and architecture phase. No code yet.
