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

The MCP server already supports Streamable HTTP transport (implemented in Phase 2). In hosted mode, it runs as a PM2-managed Node.js process on the same Windows Server VMs that host DataMart, PMPilot, and MSTeamBot. Requests reach it via the IIS API Gateway -- the same reverse-proxy mechanism used by all ITM Node.js microservices.

```
AI Client (Claude, Codex, VS Code...)
  |
  | HTTPS POST to https://api.itmplatform.com/v2/_/mcp/
  | Bearer token (OAuth)
  |
  v
IIS (ITM.API site, TLS termination)
  |
  v
API Gateway (ApiGateway.cs)
  |  - Matches URL regexp from APIGateway.json
  |  - No auth field = unauthenticated pass-through (MCP handles its own OAuth)
  |
  v
Node.js MCP Server (localhost:6170, PM2)
  |  - OAuth token exchange per session
  |  - Routes tool calls to ITM.API on localhost
  |
  v
ITM.API (http://localhost/ITM.API)
```

### 2.2 Environment URLs

| Environment | MCP Server URL | ITM.API Target | OAuth Auth URL | VM | Purpose |
|-------------|---------------|----------------|----------------|----|---------|
| Local | `http://localhost:6170/` | `http://localhost/ITM.API` | `http://localhost/ITM.API` | TROJANHORSE | Development |
| Demo | `https://new-api.itmplatform.com/v2/_/mcp/` | `https://new-api.itmplatform.com` | `https://new-api.itmplatform.com` | DemoAz2 | Sales demos |
| Stage | `https://new-api.itmplatform.com/revamping/v2/_/mcp/` | `https://new-api.itmplatform.com/revamping` | `https://new-api.itmplatform.com/revamping` | DemoAz2 | Pre-production testing |
| Production | `https://api.itmplatform.com/v2/_/mcp/` | `https://api.itmplatform.com` | `https://api.itmplatform.com` | ITMApp (Prod) | Live users |

Port convention follows the org standard (6xxx prod, 3xxx stage, 2xxx demo):

| Environment | Port |
|-------------|------|
| Local / Prod | 6170 |
| Stage | 3170 |
| Demo | 2170 |

> **Port note:** Port 6160 is already used by MSTeamBot. The next available slot in the 6xxx range is 6170.

### 2.3 Infrastructure

Follow the existing DataMart / PMPilot / MSTeamBot deployment pattern:

| Concern | Approach | Notes |
|---------|----------|-------|
| VMs | Azure VMs -- DemoAz2 (stage + demo), ITMApp (prod) | Same instances as DataMart, PMPilot, MSTeamBot |
| Process manager | PM2 | Auto-restart on crash, log rotation. Global ecosystem at `C:\inetpub\wwwroot\ecosystem.config.js` |
| Reverse proxy | IIS API Gateway (`ApiGateway.cs`) | TLS termination, URL routing via `APIGateway.json` |
| TLS | IIS-managed certificates | Existing certs on the IIS sites |
| DNS | No new DNS records needed | Routes through existing `api.itmplatform.com` / `new-api.itmplatform.com` |
| Monitoring | Health endpoint: `GET /health` | Returns `{ status: "ok" }` (http-oauth) or `{ status: "ok", user: "..." }` (http-dev) |
| Deployment path | `C:\inetpub\wwwroot\ITM.MCP\` | Same pattern as other Node.js services |

### 2.4 Environment Variables (Production)

```bash
ITM_API_URL=http://localhost/ITM.API
PORT=6170
ITM_AUTH_URL=http://localhost/ITM.API
MCP_SERVER_URL=https://api.itmplatform.com/v2/_/mcp/
LOG_LEVEL=info
ITM_AUDIT_ENABLED=true
```

`ITM_COMPANY` and `ITM_API_KEY` are **not required** in HTTP+OAuth mode. When both `ITM_AUTH_URL` and `MCP_SERVER_URL` are set, OAuth is mandatory per session and no startup identity is resolved. These variables are only needed for stdio mode (local dev).

> Note: In production, `ITM_API_URL` points to `http://localhost/ITM.API` (local IIS), not the external URL. All ITM microservices call the API via localhost.

### 2.5 Startup Modes

The server selects one of three modes at startup (via `resolveStartupMode()` in `src/startup-mode.ts`):

| Mode | When | Identity | Auth |
|------|------|----------|------|
| **stdio** | No `PORT`, no `--http` | `resolveIdentity()` at boot from `ITM_COMPANY` + `ITM_API_KEY` | Single user for process lifetime |
| **http-oauth** | `PORT` + `ITM_AUTH_URL` + `MCP_SERVER_URL` all set | No startup identity. Each session resolves via OAuth token exchange. | Bearer token required on `initialize`. 401 if missing. |
| **http-dev** | `PORT` set but OAuth vars missing | `resolveIdentity()` at boot (warning logged) | Fallback identity for all sessions. Dev/test only. |

In production, the deployed `.env` files set `ITM_AUTH_URL` and `MCP_SERVER_URL`, so the server always starts in **http-oauth** mode. Unauthenticated clients receive a 401 response.

### 2.6 API Gateway Integration (ITM.Web changes)

Same pattern as MSTeamBot. No separate IIS sites, DNS records, or SSL certs needed.

| File | Change |
|------|--------|
| `ITM.API/APIGateway/Enums.cs` | Add `MCP` to `Microservices` enum |
| `ITM.API/APIGateway/APIGatewayManager.cs` | Add `MCPMS` case in `GetMicroserviceName()` |
| `ITM.API/Web.config` (all variants) | Add `<add key="MCPMS" value="http://localhost:6170/" />` (port per env) |
| `ITM.API/APIGateway.json` | Add route (see below) |

Route entry in `APIGateway.json` (no `auth` -- MCP handles its own OAuth):

```json
{
  "url": "v2/{AccountId}/mcp/{*pathInfo}",
  "regexp": "v2/[\\w-_0-9]+/mcp/",
  "micro": "MCP"
}
```

Web.config appSetting per environment:

| Environment | Value |
|-------------|-------|
| Dev / Prod | `<add key="MCPMS" value="http://localhost:6170/" />` |
| Stage | `<add key="MCPMS" value="http://localhost:3170/" />` |
| Demo | `<add key="MCPMS" value="http://localhost:2170/" />` |

### 2.7 Gateway-Aware Routes (Code Change)

The API Gateway forwards the **full URL path** to the microservice. For example, a request to `https://api.itmplatform.com/v2/_/mcp/` arrives at the Node.js server as `GET /v2/_/mcp/`. This is the same pattern MSTeamBot uses -- it registers both direct and gateway-prefixed routes:

```typescript
// MSTeamBot pattern (for reference):
app.post('/api/messages', messagesHandler);                              // Direct
app.post('/v2/:accountId/msteamsbot/api/messages', messagesHandler);     // Via gateway
```

The MCP server currently handles `req.url === '/.well-known/oauth-protected-resource'`, `req.url === '/'`, and `req.url === '/health'`. It needs to also handle the gateway-prefixed versions:

| Direct path (local dev) | Gateway path (hosted) |
|---|---|
| `GET /.well-known/oauth-protected-resource` | `GET /v2/_/mcp/.well-known/oauth-protected-resource` |
| `POST /` | `POST /v2/_/mcp/` |
| `GET /health` | `GET /v2/_/mcp/health` |

This is a code change in `server.ts`, not an infrastructure change. The OAuth metadata endpoint works through the API Gateway -- clients discover its URL from the `resource_metadata` field in the server's 401 `WWW-Authenticate` header, so the path does not need to be at the domain root.

### 2.8 Deployment Pipeline

Azure Pipelines YAML (`Pipelines/ITM-MCP-Stage.yml` and `Pipelines/ITM-MCP-Prod.yml`), following the DataMart/PMPilot/MSTeamBot pattern.

#### Stage Pipeline (`ITM-MCP-Stage.yml`)

**Trigger:** `stage` branch (exclude `Pipelines/**`)

Deploys both `MCPStage` and `MCPDemo` on DemoAz2 (same pattern as PMPilot's stage pipeline).

```yaml
trigger:
  branches:
    include:
      - stage
    exclude:
      - Pipelines/**

stages:
  - stage: Build
    pool:
      vmImage: 'windows-latest'
    jobs:
      - job: BuildMCP
        steps:
          - task: NodeTool@0
            inputs:
              versionSpec: '22.x'
          - script: npm ci
          - script: npm test
          - script: npm run build
          - task: ArchiveFiles@2
            inputs:
              rootFolderOrFile: '$(System.DefaultWorkingDirectory)'
              includeRootFolder: false
              archiveType: 'zip'
              archiveFile: '$(Build.ArtifactStagingDirectory)/drop.zip'
          - publish: $(Build.ArtifactStagingDirectory)/drop.zip
            artifact: drop

  - stage: Deploy
    dependsOn: Build
    jobs:
      - deployment: DeployToStage
        environment:
          name: ITM-Stage
          resourceType: VirtualMachine
        strategy:
          runOnce:
            deploy:
              steps:
                - script: |
                    if exist "C:\inetpub\wwwroot\0Backups\ITM.MCP_Backup" rd /s /q "C:\inetpub\wwwroot\0Backups\ITM.MCP_Backup"
                    if exist "C:\inetpub\wwwroot\ITM.MCP" xcopy "C:\inetpub\wwwroot\ITM.MCP" "C:\inetpub\wwwroot\0Backups\ITM.MCP_Backup\" /E /I /Y
                  displayName: 'Backup existing'
                - task: ExtractFiles@1
                  inputs:
                    archiveFilePatterns: '$(Pipeline.Workspace)/drop/drop.zip'
                    destinationFolder: 'C:\inetpub\wwwroot\ITM.MCP'
                    cleanDestinationFolder: true
                - script: |
                    copy /Y "C:\inetpub\wwwroot\ITM.MCP\.env.stage" "C:\inetpub\wwwroot\ITM.MCP\.env"
                  displayName: 'Copy .env.stage to .env'
                - script: |
                    node "C:\inetpub\wwwroot\ITM.MCP\scripts\ensure-ecosystem-app.cjs" "C:\inetpub\wwwroot\ecosystem.config.js" MCPStage MCPDemo
                  displayName: 'Update PM2 ecosystem'
                - script: |
                    pm2 stop MCPStage & pm2 delete MCPStage & pm2 stop MCPDemo & pm2 delete MCPDemo
                    pm2 start "C:\inetpub\wwwroot\ecosystem.config.js" --only MCPStage --update-env
                    pm2 start "C:\inetpub\wwwroot\ecosystem.config.js" --only MCPDemo --update-env
                    pm2 save
                  displayName: 'Restart PM2 processes'
```

#### Prod Pipeline (`ITM-MCP-Prod.yml`)

Same structure, triggered on `main`, deploys to `ITM-Prod` environment, PM2 app name `MCPProd`.

### 2.9 PM2 Configuration

Via `scripts/ensure-ecosystem-app.cjs` (to be created, same pattern as DataMart/MSTeamBot):

```javascript
// Prod entry
{
  name: 'MCPProd',
  cwd: 'C:/inetpub/wwwroot/ITM.MCP',
  script: 'dist/server.js',
  interpreter: 'node',
  node_args: ['--env-file=.env'],
  instances: 1,
  exec_mode: 'fork',
  autorestart: true,
  restart_delay: 3000,
  min_uptime: '10m',
  max_restarts: 5,
  exp_backoff_restart_delay: 100
}

// Stage and Demo entries follow the same structure with:
// MCPStage: node_args: ['--env-file=.env.stage']
// MCPDemo:  node_args: ['--env-file=.env.demo']
```

### 2.10 Pre-Deployment Checklist

| Item | Detail | Status |
|------|--------|--------|
| OAuth flow works end-to-end against target environment | Token exchange, scope enforcement, session lifecycle | &#11036; |
| Health endpoint accessible | `GET /health` returns 200 | &#11036; |
| OAuth metadata endpoint accessible | `GET /.well-known/oauth-protected-resource` returns valid JSON | &#11036; |
| TLS configured | HTTPS via IIS (existing certs) | &#11036; |
| API Gateway route added | `APIGateway.json` + `Web.config` + `Enums.cs` + `APIGatewayManager.cs` | &#9989; |
| PM2 process manager configured | `ensure-ecosystem-app.cjs` created, ecosystem entries tested | &#9989; |
| ITM.Web deployed with MCP route | Gateway changes deployed to target VMs | &#11036; |
| ~~Seed OAuth clients~~ ~~Implement DCR (RFC 7591)~~ | DCR implemented in ITM.Account (2026-05-26). See [SPEC_DYNAMIC_CLIENT_REGISTRATION.md](../../ITM.Account/ITM.Account/zz_Specifications/done/SPEC_DYNAMIC_CLIENT_REGISTRATION.md). Deferred items in [SPEC_DCR_DEFERRED_ITEMS.md](../../ITM.Account/ITM.Account/zz_Specifications/SPEC_DCR_DEFERRED_ITEMS.md). | &#9989; |
| Rate limiting | Per-session token bucket (MCP-side). Gateway throttling re-enabled. | &#11036; |
| Monitoring / alerting | Health check ping, error rate alerting | &#11036; |

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
| Claude MCP Directory | Anthropic | Submit via form/PR to MCP server registry | &#11036; Research submission process |
| OpenAI Codex / ChatGPT Plugins | OpenAI | Tool registry / plugin manifest | &#11036; Research submission process |
| VS Code Marketplace | Microsoft | Extension or MCP server listing | &#11036; Research MCP listing support |
| Cursor Directory | Cursor | Community-maintained list | &#11036; Research submission process |
| MCP Server Registry (modelcontextprotocol.io) | MCP project | GitHub PR to official server list | &#11036; Research submission process |
| JetBrains Marketplace | JetBrains | Plugin/tool listing | &#11036; Research submission process |

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
- Hosted: Add the hosted MCP URL to your AI client's MCP config (see Environment URLs table)
- Local: `npx itm-mcp` with your API key

**Links:**
- Documentation: `https://developers.itmplatform.com/mcp`
- npm: `https://www.npmjs.com/package/itm-mcp`
- Support: `https://helpcenter.itmplatform.com`

### 4.4 OAuth Client Registration for Marketplaces

> **Research completed 2026-05-26.** Full findings in [OAUTH-CLIENT-REGISTRATION.md](../../OAUTH-CLIENT-REGISTRATION.md).

**Key finding:** Every major AI client uses Dynamic Client Registration (DCR, RFC 7591) as its primary (or only) registration mechanism. Pre-seeding static `client_id`s will not work for any real client. DCR must move from "deferred" to "blocking for deployment."

| AI Client | Registration | `redirect_uri` pattern | PKCE | Static `client_id` |
|-----------|-------------|----------------------|------|-------------------|
| Claude Code | DCR only | `http://localhost:<port>/callback` (random port) | S256 | Not supported |
| Codex CLI | DCR only | `http://localhost:<port>/callback` (configurable port) | S256 | Not supported |
| VS Code | DCR (fallback: hardcoded MS Graph ID) | `https://vscode.dev/redirect` + `http://127.0.0.1:33418/` | S256 | Feature requested, not shipped |
| Cursor | DCR only | `cursor://anysphere.cursor-mcp/oauth/callback` + `http://127.0.0.1:<port>/callback` | S256 | Not supported |
| JetBrains (native) | N/A | N/A | N/A | N/A (no OAuth for MCP) |
| JetBrains (Copilot) | DCR (fallback: static) | Not published | S256 | Yes (fallback) |
| E2E Test | Pre-registered | `http://localhost:9876/callback` | S256 | `e2e-test-client` (seeded) |

**ITM.Account DCR implementation (done 2026-05-26):**

1. ~~`POST /oauth/register`~~ Done -- DCR endpoint with metadata validation
2. ~~`registration_endpoint` in metadata~~ Done -- advertised in `/.well-known/oauth-authorization-server`
3. ~~RFC 8252 loopback port matching~~ Done -- accepts any port for `localhost` / `127.0.0.1` / `[::1]`
4. Custom URI scheme support (`cursor://...`) -- deferred to v2 (see [SPEC_DCR_DEFERRED_ITEMS.md](../../ITM.Account/ITM.Account/zz_Specifications/SPEC_DCR_DEFERRED_ITEMS.md))
5. ~~HTTPS redirect URI support~~ Done -- accepts `https://` redirect URIs with host validation

**Security mitigations implemented:** Request body size cap (8192 bytes at proxy and controller), PKCE S256 enforcement, registered-scope enforcement, refresh-client binding, periodic cleanup of stale dynamic clients (30 days). DCR-specific per-IP rate limiter deferred (existing general throttler covers baseline).

**CIMD (future):** The MCP spec prefers Client ID Metadata Documents over DCR, but no AI client has shipped CIMD support as of May 2026. When clients adopt it, set `client_id_metadata_document_supported: true` in AS metadata (currently `false`).

---

## 5. Implementation Steps

| # | Step | Description | Depends on | Status |
|---|------|-------------|-----------|--------|
| 1 | API Gateway integration | Add MCP route to `APIGateway.json`, enum, `GetMicroserviceName()`, `Web.config` (all variants). Gateway-aware routes in `server.ts` via `resolveRoute()`. | -- | &#9989; |
| 2 | Create `scripts/ensure-ecosystem-app.cjs` | PM2 ecosystem config for `MCPProd`, `MCPStage`, `MCPDemo` | -- | &#9989; |
| 3 | Create pipeline YAMLs | `Pipelines/ITM-MCP-Stage.yml` and `Pipelines/ITM-MCP-Prod.yml` | -- | &#9989; |
| 4 | Create `.env.stage` and `.env.demo` | Environment-specific config files (+ `.env.prod`) | -- | &#9989; |
| 4b | Auth hardening | Remove fallback identity in HTTP+OAuth mode. Tokenless sessions return 401. Remove `ITM_COMPANY`/`ITM_API_KEY` from deployed env files. | 4 | &#9989; |
| 5 | Deploy ITM.Web with MCP gateway route | Deploy the gateway changes to DemoAz2 and Prod VMs | 1 | &#11036; |
| 6 | Deploy to stage | Deploy MCP server to DemoAz2. Verify OAuth flow, health endpoint, tool execution. | 2, 3, 4, 5 | &#11036; |
| 7 | ~~Seed OAuth clients~~ ~~Implement DCR~~ | DCR implemented in ITM.Account (2026-05-26). `POST /oauth/register`, redirect validation, PKCE S256, scope enforcement, client binding, cleanup, proxy, MCP discovery. See [SPEC_DYNAMIC_CLIENT_REGISTRATION.md](../../ITM.Account/ITM.Account/zz_Specifications/done/SPEC_DYNAMIC_CLIENT_REGISTRATION.md). | 6 | &#9989; |
| 8 | Deploy to production | Deploy MCP server to Prod VM. Smoke test. | 6, 7 | &#11036; |
| 9 | Prepare npm package | Add `bin`, `files`, shebang. Verify with `npm pack --dry-run`. | -- | &#11036; |
| 10 | Publish to npm | `npm publish`. Verify `npx itm-mcp` works. | 9 | &#11036; |
| 11 | Research marketplace submission | For each target marketplace, document the submission process, required metadata, and any approval timeline. | -- | &#11036; |
| 12 | Submit to MCP Server Registry | PR to modelcontextprotocol.io official list. | 8, 10, docs SPA live | &#11036; |
| 13 | Submit to Claude MCP Directory | Follow Anthropic's submission process. | 8, 10, docs SPA live | &#11036; |
| 14 | Submit to OpenAI / VS Code / Cursor | Follow each vendor's submission process. | 8, 10, docs SPA live | &#11036; |
| 15 | Monitoring & alerting | Set up health check pings, error rate alerts, usage dashboards. | 8 | &#11036; |
| 16 | Rate limiting | Implement per-session token bucket. Re-enable gateway throttling. | 8 | &#11036; |

---

## 6. Security Considerations

| Concern | Mitigation |
|---------|-----------|
| DDoS on hosted endpoint | API Gateway-level throttling + MCP-side per-session token bucket. IIS request filtering as defense in depth. |
| OAuth token theft | Short-lived access tokens (15 min). Refresh token rotation. HTTPS only. Audience binding (RFC 8707). |
| Session exhaustion | Session map cleanup on disconnect. Max concurrent sessions limit. Session TTL with eviction. |
| npm supply chain | Publish from CI only (tagged commits). Enable npm 2FA. Use `npm provenance` if available. |
| Credential exposure in npm | `files` array ensures only `dist/` is published. No `.env`, no source, no test fixtures. Verify with `npm pack --dry-run`. |

---

## 7. Open Questions

| Question | Context |
|----------|---------|
| **Port assignment** | Proposed 6170/3170/2170. Confirm no conflicts with other services on the VMs. |
| **Rate limits** | What are the right per-session limits? Need to balance AI agent chattiness against backend capacity. |
| ~~**Dynamic Client Registration**~~ | **Done (2026-05-26).** DCR implemented in ITM.Account. See [SPEC_DYNAMIC_CLIENT_REGISTRATION.md](../../ITM.Account/ITM.Account/zz_Specifications/done/SPEC_DYNAMIC_CLIENT_REGISTRATION.md). Deferred items (rate limiter, E2E, Cursor scheme) in [SPEC_DCR_DEFERRED_ITEMS.md](../../ITM.Account/ITM.Account/zz_Specifications/SPEC_DCR_DEFERRED_ITEMS.md). |
| **npm scope** | Publish as `itm-mcp` (unscoped) or `@itm-platform/mcp` (scoped)? Scoped requires an npm org. |
| **Public GitHub repo** | Marketplace listings typically link to a public repo. Is the ITM.MCP repo public or does it need to be? Alternative: publish a subset (README + examples) to a public repo. |
| **Demo environment** | Should the MCP server be deployed to the demo environment for sales demos? |
