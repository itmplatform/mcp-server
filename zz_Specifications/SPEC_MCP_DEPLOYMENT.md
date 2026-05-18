# MCP Server -- Deployment, npm Publishing & Marketplace Listings

> **Status:** Draft
> **Date:** 2026-05-14
> **Depends on:** SPEC_MCP_SERVER.md (Phases 1 & 2 complete), SPEC_MCP_DOCUMENTATION.md (docs SPA)
> **Delivers:** Hosted MCP server, npm package, marketplace listings

---

## 1. Goal

Make the ITM Platform MCP server available to users through three channels:

1. **Hosted server** -- a URL users point their AI client at, no install required, OAuth authentication
2. **npm package** -- for users who want to run the server locally (enterprise, airgapped, dev)
3. **Marketplace listings** -- so users discover ITM Platform when browsing MCP servers in their AI client

These are ordered by priority. The hosted server is the primary distribution path because it requires zero setup from the user beyond authentication. npm is the fallback for local/enterprise use. Marketplace listings are catalog entries that point to the hosted URL and the documentation.

---

## 2. Hosted Server Deployment

### 2.1 Architecture

The MCP server already supports Streamable HTTP transport (implemented in Phase 2). In hosted mode, it runs as a long-lived Node.js process behind a reverse proxy, handling multiple concurrent sessions via the session map in `server.ts`.

```
AI Client (Claude, Codex, VS Code...)
  |
  | HTTPS POST to https://mcp.itmplatform.com/mcp
  | Bearer token (OAuth)
  |
  v
Reverse Proxy (nginx)
  |
  v
Node.js MCP Server (port 6160)
  |  - OAuth token exchange per session
  |  - Routes tool calls to ITM.API gateway
  |
  v
ITM.API Gateway (api.itmplatform.com)
```

### 2.2 Environment URLs

| Environment | MCP Server URL | ITM.API Target | OAuth Auth URL | Purpose |
|-------------|---------------|----------------|----------------|---------|
| Local | `http://localhost:6160/mcp` | `http://localhost/ITM.API` | `http://localhost/ITM.API` | Development |
| Demo | `https://mcp-demo.itmplatform.com/mcp` | `https://demo-api.itmplatform.com` | `https://demo-api.itmplatform.com` | Sales demos |
| Stage | `https://mcp-stage.itmplatform.com/mcp` | `https://new-api.itmplatform.com` | `https://new-api.itmplatform.com` | Pre-production testing |
| Production | `https://mcp.itmplatform.com/mcp` | `https://api.itmplatform.com` | `https://api.itmplatform.com` | Live users |

### 2.3 Infrastructure

Follow the existing DataMart deployment pattern:

| Concern | Approach | Notes |
|---------|----------|-------|
| Hosting | AWS EC2 (same instance as DataMart) or dedicated | Node.js 22 LTS |
| Process manager | PM2 or systemd | Auto-restart on crash, log rotation |
| Reverse proxy | nginx | TLS termination, `/mcp` path routing |
| TLS | Let's Encrypt or AWS ACM | Required for production |
| DNS | `mcp.itmplatform.com` CNAME | Route 53 or existing DNS |
| Monitoring | Health endpoint: `GET /health` | Returns `{ status: "ok", user: "..." }` |

### 2.4 Environment Variables (Production)

```bash
# Required
ITM_API_URL=https://api.itmplatform.com
ITM_COMPANY=default          # not used in multi-tenant HTTP mode, but required for startup identity
ITM_API_KEY=<service-key>    # for startup identity resolution only
PORT=6160

# OAuth (required for hosted mode)
ITM_AUTH_URL=https://api.itmplatform.com
MCP_SERVER_URL=https://mcp.itmplatform.com/mcp

# Optional
LOG_LEVEL=info
ITM_AUDIT_ENABLED=true
```

### 2.5 Startup Identity vs Per-Session Identity

The hosted server resolves a startup identity (from `ITM_API_KEY`) to verify connectivity and populate the health endpoint. But in OAuth mode, each session gets its own identity via token exchange. The startup identity is NOT used for tool calls -- it is only a connectivity check.

This means the `ITM_API_KEY` in production config is a service-level key used once at boot, not a user key. It needs minimal permissions (just enough for `POST /resolve/identity` to succeed).

### 2.6 Deployment Pipeline

Azure Pipelines YAML (`ITM-MCP-Server.yml`):

```yaml
# Trigger: merge to main (prod) or stage
trigger:
  branches:
    include:
      - main
      - stage

stages:
  - stage: Build
    jobs:
      - job: BuildMCP
        steps:
          - task: NodeTool@0
            inputs: { versionSpec: '22.x' }
          - script: npm ci
          - script: npm test
          - script: npm run build
          - publish: $(System.DefaultWorkingDirectory)/dist
            artifact: mcp-server

  - stage: DeployStage
    condition: eq(variables['Build.SourceBranch'], 'refs/heads/stage')
    jobs:
      - deployment: DeployToStage
        environment: mcp-stage
        strategy:
          runOnce:
            deploy:
              steps:
                - script: |
                    scp -r $(Pipeline.Workspace)/mcp-server/* user@stage-host:/app/mcp/
                    ssh user@stage-host 'cd /app/mcp && npm ci --production && pm2 restart mcp'

  - stage: DeployProd
    condition: eq(variables['Build.SourceBranch'], 'refs/heads/main')
    jobs:
      - deployment: DeployToProd
        environment: mcp-prod
        strategy:
          runOnce:
            deploy:
              steps:
                - script: |
                    scp -r $(Pipeline.Workspace)/mcp-server/* user@prod-host:/app/mcp/
                    ssh user@prod-host 'cd /app/mcp && npm ci --production && pm2 restart mcp'
```

### 2.7 nginx Configuration

```nginx
server {
    listen 443 ssl;
    server_name mcp.itmplatform.com;

    ssl_certificate     /etc/letsencrypt/live/mcp.itmplatform.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/mcp.itmplatform.com/privkey.pem;

    location /mcp {
        proxy_pass http://127.0.0.1:6160;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;    # MCP sessions can be long-lived
        proxy_send_timeout 300s;
    }

    location /.well-known/oauth-protected-resource {
        proxy_pass http://127.0.0.1:6160;
        proxy_set_header Host $host;
    }

    location /health {
        proxy_pass http://127.0.0.1:6160;
    }
}
```

### 2.8 Pre-Deployment Checklist

| Item | Detail | Status |
|------|--------|--------|
| OAuth flow works end-to-end against target environment | Token exchange, scope enforcement, session lifecycle | ⬜ |
| Health endpoint accessible | `GET /health` returns 200 | ⬜ |
| OAuth metadata endpoint accessible | `GET /.well-known/oauth-protected-resource` returns valid JSON | ⬜ |
| TLS configured | HTTPS only, no HTTP fallback in production | ⬜ |
| PM2 / systemd process manager configured | Auto-restart, log capture | ⬜ |
| DNS configured | `mcp.itmplatform.com` resolves | ⬜ |
| Seed OAuth clients for known AI clients | Claude Desktop, Codex, VS Code client_id + redirect URIs in `tblOAuthClient` | ⬜ |
| Rate limiting | Per-session token bucket (MCP-side). Gateway throttling re-enabled. | ⬜ |
| Monitoring / alerting | Health check ping, error rate alerting | ⬜ |

---

## 3. npm Publishing

### 3.1 Why npm

npm distribution lets users run the MCP server locally via `npx itm-mcp`. This is useful for:

- Enterprise users who cannot send data through a third-party hosted server
- Developers testing against local ITM Platform instances
- Airgapped environments

It is NOT the primary distribution path (the hosted server is). Users who can use the hosted server should be directed there.

### 3.2 Package Configuration

Changes needed in `package.json`:

```json
{
  "name": "itm-mcp",
  "version": "1.0.0",
  "description": "MCP server for ITM Platform -- connect AI assistants to your project management data",
  "type": "module",
  "main": "dist/server.js",
  "bin": {
    "itm-mcp": "dist/server.js"
  },
  "files": [
    "dist",
    "package.json",
    "README.md",
    "LICENSE"
  ],
  "keywords": [
    "mcp",
    "model-context-protocol",
    "itm-platform",
    "project-management",
    "ai-tools"
  ],
  "repository": {
    "type": "git",
    "url": "https://github.com/niceTech/ITM-MCP"
  },
  "license": "MIT"
}
```

### 3.3 Entry Point Changes

The compiled `dist/server.js` needs a Node.js shebang for direct execution via `npx`:

```js
#!/usr/bin/env node
```

Add this via a build step or a banner plugin in tsconfig/build script. The shebang must be the first line of `dist/server.js`.

### 3.4 What Gets Published

Only the `dist/` folder, `package.json`, `README.md`, and `LICENSE`. Source code, tests, specs, and APIDocs are NOT included in the npm package.

The `files` array in `package.json` controls this. Verify with `npm pack --dry-run` before publishing.

### 3.5 npm README

The npm README is a stripped-down version of the main README, focused on installation and configuration. It should include:

1. One-line description
2. Quick start (3 steps: install, configure, use)
3. Config snippets for Claude Desktop, Codex, VS Code
4. Link to full documentation at `developers.itmplatform.com/mcp`
5. Environment variable reference table

### 3.6 Publishing Workflow

| Step | Command | Notes |
|------|---------|-------|
| Build | `npm run build` | Compile TypeScript |
| Test | `npm test` | All unit tests pass |
| Verify package contents | `npm pack --dry-run` | Check no source/test files included |
| Publish | `npm publish` | Requires npm account + 2FA |
| Verify | `npx itm-mcp --help` | Should print usage or start server |

### 3.7 Versioning

Follow semver. The MCP server is at 1.0.0. Future changes:

- New read tool: minor bump (1.1.0)
- New write tool: minor bump (1.2.0)
- Breaking change (removed tool, changed auth): major bump (2.0.0)
- Bug fix: patch bump (1.0.1)

### 3.8 CI/CD for npm

Add a publish stage to the Azure Pipeline that runs on tagged commits (e.g., `v1.1.0`):

```yaml
  - stage: PublishNpm
    condition: startsWith(variables['Build.SourceBranch'], 'refs/tags/v')
    jobs:
      - job: Publish
        steps:
          - script: npm ci && npm run build && npm test
          - script: npm publish
            env:
              NODE_AUTH_TOKEN: $(NPM_TOKEN)
```

---

## 4. Marketplace Listings

### 4.1 Purpose

Marketplace listings are discovery points. Users browsing their AI client's tool/server catalog should find ITM Platform and be directed to the hosted server URL or the documentation. The listing itself is a catalog entry, not a deployment.

### 4.2 Target Marketplaces

| Marketplace | Owner | Listing format | Status |
|------------|-------|----------------|--------|
| Claude MCP Directory | Anthropic | Submit via form/PR to MCP server registry | ⬜ Research submission process |
| OpenAI Codex / ChatGPT Plugins | OpenAI | Tool registry / plugin manifest | ⬜ Research submission process |
| VS Code Marketplace | Microsoft | Extension or MCP server listing | ⬜ Research MCP listing support |
| Cursor Directory | Cursor | Community-maintained list | ⬜ Research submission process |
| MCP Server Registry (modelcontextprotocol.io) | MCP project | GitHub PR to official server list | ⬜ Research submission process |
| JetBrains Marketplace | JetBrains | Plugin/tool listing | ⬜ Research submission process |

### 4.3 Listing Content Template

Each marketplace has its own format, but all need the same core content:

**Short description (1 line):**
> Connect AI assistants to ITM Platform project management data -- projects, tasks, budgets, risks, and team workload.

**Long description (1 paragraph):**
> ITM Platform MCP server lets AI assistants (Claude, ChatGPT, Codex, Copilot, Cursor) read and write your project management data through the Model Context Protocol. The AI can search projects, analyze budgets, track risks, manage tasks, and generate portfolio insights -- all using your existing ITM Platform permissions. 20 tools (15 read, 5 write), 6 resources, 4 workflow prompts. Supports both local (stdio + API key) and hosted (HTTP + OAuth) connections.

**Features list:**
- Search and analyze projects, services, tasks, risks, issues, and budgets
- Portfolio-level analytics (group, count, average across all projects)
- Create and update tasks, risks, and issues
- Team workload analysis
- OAuth 2.1 authentication with scope enforcement
- Works with Claude Desktop, Claude Code, OpenAI Codex, VS Code Copilot, Cursor, JetBrains

**Quick start:**
- Hosted: Add `https://mcp.itmplatform.com/mcp` to your AI client's MCP config
- Local: `npx itm-mcp` with your API key

**Links:**
- Documentation: `https://developers.itmplatform.com/mcp`
- npm: `https://www.npmjs.com/package/itm-mcp`
- Support: `https://help.itmplatform.com`

### 4.4 OAuth Client Registration for Marketplaces

Each AI client that connects via OAuth needs a registered `client_id` in `tblOAuthClient`. For marketplace listings:

| AI Client | client_id | redirect_uri | Scope | Notes |
|-----------|-----------|-------------|-------|-------|
| Claude Desktop | `claude-desktop` | TBD (Anthropic provides) | `mcp:read mcp:write` | Check Anthropic docs for callback URL |
| Codex CLI | `codex-cli` | TBD (OpenAI provides) | `mcp:read mcp:write` | Check OpenAI docs for callback URL |
| VS Code Copilot | `vscode-copilot` | TBD (Microsoft provides) | `mcp:read mcp:write` | Check VS Code MCP docs |
| Cursor | `cursor` | TBD (Cursor provides) | `mcp:read mcp:write` | Check Cursor docs |
| E2E Test | `e2e-test-client` | `http://localhost:9876/callback` | `mcp:read mcp:write` | Already seeded |

These need to be seeded in each environment's database before the marketplace listing goes live. The redirect URIs are provided by each AI client vendor -- research these during the submission process.

If the AI client does not provide a fixed redirect URI (some use dynamic ports), Dynamic Client Registration (RFC 7591, currently deferred) may be needed. Evaluate per client.

---

## 5. Implementation Steps

| # | Step | Description | Depends on | Status |
|---|------|-------------|-----------|--------|
| 1 | Provision infrastructure | DNS, TLS, nginx, PM2 for `mcp.itmplatform.com` | -- | ⬜ |
| 2 | Deploy to stage | Deploy MCP server to stage environment. Verify OAuth flow, health endpoint, tool execution. | 1 | ⬜ |
| 3 | Seed OAuth clients | Register known AI client client_ids in stage database. Test OAuth flow per client. | 2 | ⬜ |
| 4 | Deploy to production | Deploy MCP server to production. Smoke test. | 2, 3 | ⬜ |
| 5 | Prepare npm package | Add `bin`, `files`, shebang. Verify with `npm pack --dry-run`. | -- | ⬜ |
| 6 | Publish to npm | `npm publish`. Verify `npx itm-mcp` works. | 5 | ⬜ |
| 7 | Research marketplace submission | For each target marketplace, document the submission process, required metadata, and any approval timeline. | -- | ⬜ |
| 8 | Submit to MCP Server Registry | PR to modelcontextprotocol.io official list. | 4, 6, docs SPA live | ⬜ |
| 9 | Submit to Claude MCP Directory | Follow Anthropic's submission process. | 4, 6, docs SPA live | ⬜ |
| 10 | Submit to OpenAI / VS Code / Cursor | Follow each vendor's submission process. | 4, 6, docs SPA live | ⬜ |
| 11 | Monitoring & alerting | Set up health check pings, error rate alerts, usage dashboards. | 4 | ⬜ |
| 12 | Rate limiting | Implement per-session token bucket. Re-enable gateway throttling. | 4 | ⬜ |

---

## 6. Security Considerations

| Concern | Mitigation |
|---------|-----------|
| DDoS on hosted endpoint | nginx rate limiting + MCP-side per-session token bucket. Gateway throttling as defense in depth. |
| OAuth token theft | Short-lived access tokens (15 min). Refresh token rotation. HTTPS only. Audience binding (RFC 8707). |
| Session exhaustion | Session map cleanup on disconnect. Max concurrent sessions limit. Session TTL with eviction. |
| npm supply chain | Publish from CI only (tagged commits). Enable npm 2FA. Use `npm provenance` if available. |
| Credential exposure in npm | `files` array ensures only `dist/` is published. No `.env`, no source, no test fixtures. Verify with `npm pack --dry-run`. |

---

## 7. Open Questions

| Question | Context |
|----------|---------|
| Shared EC2 or dedicated? | DataMart runs on a dedicated EC2. Does MCP go on the same instance or get its own? Cost vs isolation tradeoff. |
| Rate limits | What are the right per-session limits? Need to balance AI agent chattiness against backend capacity. |
| Dynamic Client Registration | Some AI clients may use dynamic callback ports. If so, DCR (currently deferred in SPEC_OAUTH_REMAINING.md) will need to be built. Research per client. |
| npm scope | Publish as `itm-mcp` (unscoped) or `@itm-platform/mcp` (scoped)? Scoped requires an npm org. |
| Public GitHub repo | Marketplace listings typically link to a public repo. Is the ITM.MCP repo public or does it need to be? Alternative: publish a subset (README + examples) to a public repo. |
| Demo environment | Should `mcp-demo.itmplatform.com` be deployed for sales demos? |
