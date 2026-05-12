# ITM Platform MCP Server

> **Status:** Phase 2 in progress -- 124 unit tests, 23 E2E tests passing  
> **Date:** 2026-05-12  
> **Phases:** 1 Read-Only (stdio) ✅ | 2 Writes + HTTP ⚠️ (ITM.MCP done, awaits ITM.Account OAuth + audit endpoints) | 3 Advanced ⬜

---

## 1. Goal

Build an MCP (Model Context Protocol) server that exposes ITM Platform's project management capabilities to any AI assistant that supports the standard -- Claude, ChatGPT, VS Code Copilot, Cursor, JetBrains AI, and others.

The server routes read-only tool calls to the fastest approved ITM read surface. Component and subcomponent reads (projects, services, tasks, purchases, revenues, risks, issues) use ITM.DataMart through ITM.API. Non-component reads (users, roles, calendars) and all mutations use v2 REST. All business logic remains in the existing microservices.

**Not in scope:** building a new API (this consumes existing ones), a chatbot (that is PMPilot), direct database access, or admin/licensing operations.

### Design principles

- **DataMart-first reads**: route component/subcomponent reads to DataMart for speed; fall back to v2 REST for entities DataMart does not cover
- **Read-first**: start with read-only operations, add writes later
- **Typed tools over raw queries**: expose domain tools (`search_projects`, `get_project`) that compose safe DataMart/REST calls internally; reserve raw `query_datamart` for advanced use
- **Response shaping**: trim verbose API responses to what AIs need (flatten nested objects, resolve IDs to names where practical)

---

## 2. MCP Protocol Overview

### 2.1 What is MCP

The Model Context Protocol is a JSON-RPC 2.0-based open standard for connecting AI assistants to external tools and data sources. It defines a stateful protocol with lifecycle management (initialization handshake, capability negotiation).

### 2.2 Three Primitives

| Primitive | Controlled by | Purpose | Example |
|-----------|--------------|---------|---------|
| **Tools** | AI (model decides when to call) | Executable actions | `search_projects`, `get_task` |
| **Resources** | Application (host decides what to surface) | Read-only context data | Entity schemas, calendar data |
| **Prompts** | User (triggers workflow templates) | Reusable interaction patterns | `/project_status`, `/risk_analysis` |

### 2.3 Transport Options

| Transport | Use case | How it works |
|-----------|----------|-------------|
| **Streamable HTTP** | Production / SaaS | Single endpoint supporting HTTP POST (requests) and GET (server-initiated messages), with optional SSE streaming |
| **stdio** | Local use | Standard input/output streams, process spawned by AI client |

**Decision:** Support both. Streamable HTTP for production deployment. stdio for anyone running an MCP client locally (Claude Desktop, Claude Code, VS Code, Cursor, etc.) against any ITM Platform environment -- local dev, stage, or production.

### 2.4 Client Compatibility

| Client | MCP support | Transport |
|--------|------------|-----------|
| Claude Desktop | Full | stdio + HTTP |
| Claude Code (CLI) | Full | stdio + HTTP |
| ChatGPT | Since March 2025 | HTTP only (no stdio) |
| VS Code (Copilot) | Full | stdio + HTTP |
| JetBrains IDEs | Full | stdio + HTTP |
| Cursor | Full | stdio + HTTP |

---

## 3. Authentication & Authorization

### 3.1 Design: EffectiveUserContext

MCP authentication resolves to a single context object at the MCP boundary. All tools consume this context -- no tool ever touches auth directly. This decouples the auth method from the tool implementation: swapping from API key (Phase 1) to OAuth (Phase 2) changes nothing in the tools layer.

```ts
interface EffectiveUserContext {
  source: "api-key" | "token";       // how the user was authenticated
  company: string;                   // tenant slug (e.g. "acme")
  accountId: number;                 // numeric account ID
  userId: number;                    // numeric user ID
  languageId: number;                // user's language preference
  email: string;                     // user's email
  licenseTypeIds: number[];          // all license type IDs for the user
  dataMartAccess: "full" | "pm-scoped" | "none";
  pmScopeUserId?: number;           // set only when dataMartAccess is "pm-scoped"
  authHeaders: Record<string, string>; // auth headers injected into all gateway requests
}
```

The auth headers (`Authorization: Bearer {api_key}` or `Token: {session_token}`) are held in the context and injected into every gateway request via the client layer. Neither raw credentials nor headers are exposed to tools -- tools only see the context object.

### 3.2 How MCP Auth Differs from Existing Systems

MCP is a new auth context. Here is how it compares to what exists:

| System | Identity source | Trust model | Gets userId via | Needs ITM token? |
|--------|----------------|-------------|----------------|-----------------|
| **PMPilot** | API Gateway validates bearer token, forwards UserId in headers | Trusts gateway | Gateway headers | No (calls DataMart and Account directly) |
| **MSTeamsBot** | Teams/Entra ID verifies user, bot gets email via `TeamsInfo.getMember()` | Trusts Microsoft JWT | SuperAdmin endpoint + login endpoint | No (passes ITMSessionDetails to PMPilot) |
| **DataMart** | X-Tenant header + UserId header (gateway) or Token (direct) | Trusts PMPilot or gateway | From headers | For direct calls only |
| **MCP (stdio)** | User provides API key in env vars | Trusts OS user session (same as AWS CLI, gh CLI, kubectl) | Identity resolution endpoint | Yes -- gateway creates session token from API key transparently |
| **MCP (HTTP)** | OAuth 2.1 flow -- AI client redirects to ITM auth | Trusts OAuth token | OAuth claims + token exchange | Issued by token exchange endpoint |

MCP uses the existing per-user API key system for stdio and OAuth 2.1 for HTTP transport. API keys are generated from the user's profile page, stored as SHA256 hashes in `tblUser.EncryptedAPIKey`, shown once at generation, and revocable by regeneration.

### 3.3 MCP Client Identity -- How Users Authenticate Across AI Clients

MCP authentication is between the user and the MCP server. The AI provider's own identity (Claude account, OpenAI account, GitHub Copilot seat) is irrelevant -- the AI model never sees ITM credentials.

**stdio (all AI clients work identically):**

The user configures ITM credentials as environment variables in their AI client's MCP settings file. The client spawns the MCP server as a child process with those env vars. No per-client variation:

| AI Client | Config file | Format |
|-----------|-------------|--------|
| Claude Desktop | `claude_desktop_config.json` | `env: { ITM_API_KEY: "...", ITM_COMPANY: "..." }` |
| Claude Code | `.claude/settings.json` or `.mcp.json` | `env: { ITM_API_KEY: "...", ITM_COMPANY: "..." }` |
| ChatGPT | N/A -- HTTP only | ChatGPT does not support stdio; use Streamable HTTP (Phase 2) |
| VS Code (Copilot) | `.vscode/mcp.json` | `env: { ITM_API_KEY: "...", ITM_COMPANY: "..." }` |
| Cursor | `.cursor/mcp.json` | `env: { ITM_API_KEY: "...", ITM_COMPANY: "..." }` |
| JetBrains IDEs | IDE MCP settings | Environment variables |

**Streamable HTTP (all AI clients work identically):**

The MCP spec (2025-11-25) standardizes OAuth 2.1 for HTTP transport. The AI client acts as an OAuth client, redirects the user to ITM's authorization endpoint, receives an access token, and sends it with every request. No per-client variation.

### 3.4 Phase 1 -- stdio Authentication (API key)

User provides API key and company slug as environment variables:

```json
{
  "mcpServers": {
    "itm-platform": {
      "type": "stdio",
      "command": "node",
      "args": ["./dist/server.js"],
      "env": {
        "ITM_API_URL": "http://localhost/ITM.API",
        "ITM_COMPANY": "acme",
        "ITM_API_KEY": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
      }
    }
  }
}
```

**Environment variables:**

| Variable | Required | Purpose |
|----------|----------|---------|
| `ITM_API_URL` | Yes | Base URL for ITM.API gateway (local, stage, or production) |
| `ITM_COMPANY` | Yes | Company/tenant slug |
| `ITM_API_KEY` | One required | Per-user API key (generated from ITM Platform profile page). Used as `Authorization: Bearer` for all gateway calls. |
| `ITM_TOKEN` | One required | Session token (alternative to API key). Used as `Token` header for all gateway calls. Useful for development when no API key is configured; obtain via the GUID login endpoint. |

**Startup flow:**

```
MCP server starts
  |
  | 1. Resolve user identity (single call)
  | POST /v2/{company}/resolve/identity  (through gateway, with Authorization: Bearer {api_key})
  | --> { userId, accountId, email, languageId, licenseTypeIds, dataMartAccess, pmScopeUserId }
  |
  | 2. Check Phase 1 restriction
  |   - If dataMartAccess is "pm-scoped" --> reject with error:
  |     "PM-only access is not yet available for MCP. It will arrive with
  |      hosted MCP (Phase 2) or gateway scope injection."
  |   - If dataMartAccess is "none" --> reject (Team Members blocked)
  |
  | 3. Build EffectiveUserContext from response
  |
  | 4. Cache context for session lifetime
  v
Ready -- tools use EffectiveUserContext
```

**Phase 1 stdio restriction -- PM-only users blocked:** See Section 3.6 for the rationale. CompanyAdmin and FullUser do not use PM-scope headers (they get full access), so stdio works safely for them.

**How tools use the context:**

- **DataMart tools:** Call through the API Gateway (`POST /v2/{co}/datamart/graphql`) with `Authorization: Bearer {api_key}`. The gateway validates the key, creates a session token, and forwards the request to DataMart. The MCP server also sends:
  - `X-Request-Id: {uuid}`
- **v2 REST tools:** Same gateway path with `Authorization: Bearer {api_key}`. The gateway validates the API key, creates a session token, and enforces page-level rights (View/Insert/Update/Delete) -- MCP does not reimplement this.

**How the API key flows through the gateway:**

```
MCP server sends:  Authorization: Bearer {api_key}
  |
  v
API Gateway (ITM.API):
  1. HasBearerToken() extracts the API key
  2. PerformLoginForAPIKey() hashes with SHA256, looks up tblUser.EncryptedAPIKey
  3. Creates session token via Token.SetUserToken()
  4. Proceeds with normal token validation (WithoutRights / WithPMRights)
  5. Forwards to microservice with: token, UserId, LanguageId, X-Application-Name
  |
  v
Microservice receives request as if user had logged in normally
```

**Why all calls go through the gateway:** stdio runs on the user's laptop, not on the same server as ITM services. Even for hosted deployment, the gateway validates page-level rights via `tblLmLicenseMenu` and `tblPMRoleRights`. Bypassing it would mean reimplementing that permission logic. The gateway overhead (~50-100ms) is acceptable for AI-driven reads.

### 3.5 Phase 2 -- Streamable HTTP Authentication (OAuth 2.1)

For hosted deployment, the MCP server uses OAuth 2.1 per the MCP authorization spec (2025-11-25). The AI client handles the browser flow:

1. AI client connects to MCP server, receives `401 Unauthorized` with `WWW-Authenticate` header
2. AI client discovers authorization server via `/.well-known/oauth-protected-resource` on the MCP server
3. AI client opens the user's browser to ITM Platform's authorization endpoint
4. User authenticates with their ITM Platform credentials (username/password or SSO) -- not the API key
5. On consent, authorization server issues an authorization code back to the AI client
6. AI client exchanges the code for an access token (with PKCE, mandatory per spec)
7. AI client stores the token locally and sends it with every MCP request
8. MCP server calls the token exchange endpoint to get an internal session token + EffectiveUserContext

```json
{
  "mcpServers": {
    "itm-platform": {
      "type": "http",
      "url": "https://mcp.itmplatform.com/mcp"
    }
  }
}
```

**Phase 2 token model for downstream calls:**

The MCP spec forbids forwarding OAuth tokens to upstream APIs (token passthrough). The gateway does not understand OAuth tokens. The solution is token exchange at the MCP boundary:

```
AI client sends:  Authorization: Bearer {oauth_token}
  |
  v
MCP server:
  1. Validates OAuth token (signature, audience, expiry)
  2. Calls POST /v2/{co}/auth/exchange-token with the OAuth token
     --> { sessionToken, userId, accountId, email, languageId, licenseTypeIds, dataMartAccess, pmScopeUserId }
  3. Builds EffectiveUserContext with sessionToken
  4. sessionToken.expiresAt = min(oauthToken.exp, ITM_SESSION_MAX_TTL)
  5. All subsequent gateway calls use Authorization: Bearer {sessionToken}
  |
  v
Gateway receives a normal session token -- no changes needed
```

The session token's TTL is capped at the OAuth token's expiry so the MCP session does not outlive the OAuth grant.

This keeps the gateway's existing trust model intact. The exchange endpoint lives in ITM.Account and is the only component that needs to validate OAuth tokens directly.

**Phase 2 supports PM-scoped users.** Unlike stdio, the hosted MCP server runs server-side inside the trust zone (same as PMPilot). It sets `X-PM-Scope-User-Id` correctly from the authenticated user's context. The gateway PM-scope injection (Section 12) is not required for Phase 2 but is still desirable for defense in depth.

**What needs to be built (cross-repo):**

| Component | Repo | What |
|-----------|------|------|
| **Authorization server** | ITM.Account | OAuth 2.1 endpoints: `/oauth/authorize`, `/oauth/token`. Authorization code + PKCE only (no implicit, no password grant). Refresh token rotation. Built in ITM.Account to keep user identity, SSO mapping, and license interpretation in one place. |
| **OAuth login + consent page** | ITM.Web | Login + consent page for the OAuth flow. The existing login page redirects to home -- this variant authenticates the user and then returns an authorization code to the AI client's redirect URI instead. ITM.Web owns all user-facing UI; ITM.Account provides the backend endpoints it calls. |
| **Authorization server metadata** | ITM.Account | `GET /.well-known/oauth-authorization-server` -- discovery document with endpoints, supported scopes, grant types. |
| **Token exchange endpoint** | ITM.Account | `POST /v2/{co}/auth/exchange-token` -- validates OAuth token, creates internal session token (TTL capped at OAuth token expiry), returns full user context. Same pattern as `PerformLoginForAPIKey` but for OAuth tokens. |
| **Protected resource metadata** | ITM.MCP | `GET /.well-known/oauth-protected-resource` -- tells AI clients which authorization server to use and what scopes are available. |
| **Token validation** | ITM.MCP | Validate incoming OAuth Bearer tokens, check audience and scopes, return 401/403 as appropriate. |
| **Dynamic client registration** | ITM.Account | RFC 7591 support so unknown AI clients (ChatGPT, future tools) can register automatically. Can be Phase 2 scope. |

**Security requirements per MCP spec:**
- PKCE mandatory (S256 code challenge)
- Resource indicators (RFC 8707) mandatory -- tokens are audience-bound to the MCP server
- Token passthrough forbidden -- MCP server must not forward OAuth tokens to upstream APIs (solved by token exchange)
- Short-lived access tokens with refresh token rotation

**Decision: multi-tenant for HTTP, single-tenant per process for stdio.** A single hosted endpoint `https://mcp.itmplatform.com/mcp` resolves tenant from the OAuth token claims (company/audience). Per-tenant hostnames add operational overhead (DNS, certs, deploys) for no security benefit -- isolation is at the token/identity layer. stdio is one process per user; tenant comes from `ITM_COMPANY` env var.

### 3.6 Permission Model

Mirrors the proven PMPilot/DataMart model:

| License Type | ID | DataMart access | v2 REST reads | v2 REST writes (Phase 2+) |
|-------------|-----|----------------|--------------|--------------------------|
| CompanyAdmin | 0 | Full -- all components | Full (gateway checks rights) | Full (gateway checks rights) |
| FullUser | 1 | Full -- all components | Full (gateway checks rights) | Full (gateway checks rights) |
| ProjectManager | 2 | PM-scoped -- only components where user is manager | Full (gateway checks rights) | Full (gateway checks rights) |
| TeamMember | 3+ | Blocked | Blocked | Blocked |

**Dual-license behavior:** When a user holds both FullUser (1) and ProjectManager (2), FullUser wins -- the user gets full access, not PM-scoped. This mirrors PMPilot's `isPmOnlyAccountUser()` which returns false when any license type 0 or 1 is present alongside type 2.

**Why block Team Members:** DataMart already blocks them. PMPilot already blocks them. The decision was made to simplify. Future phases could add limited TM tools (`my_tasks`, `my_assignments`) backed by v2 REST with gateway permission checks, but this is out of scope for Phase 1.

**PM-scope enforcement:** When `dataMartAccess` is `"pm-scoped"`, the MCP server sends `X-PM-Scope-User-Id: {userId}` with every DataMart call. DataMart's resolvers automatically filter results:
- `component` query: verifies user is in `managers` array or returns 403
- `components` query: adds `{ 'managers.userId': { $eq: pmScopeUserId } }` to filters
- `aggregateComponents`: prepends `$match` stage with manager filter

**PM-scope trust boundary:** DataMart trusts the `X-PM-Scope-User-Id` header without re-validating it against the authenticated caller (`directAccessControl.ts` assumes the upstream service has already determined scope). The resolver check confirms the *supplied* userId is a manager of the component -- it does not verify the *authenticated caller* is that user. This means a PM with stdio access could set another PM's userId and see their projects.

**Phase 1 decision: stdio restricted to CompanyAdmin and FullUser.** PM-only users are blocked at startup until the gateway computes and injects `X-PM-Scope-User-Id` from the authenticated user's license type (see Section 12). CompanyAdmin and FullUser do not use PM-scope headers -- they get full access -- so the trust boundary issue does not apply to them. Phase 2 HTTP is unaffected because the hosted MCP server runs server-side inside the trust zone (same as PMPilot).

### 3.7 Cross-Repo Dependency: Identity Resolution Endpoint

Both Phase 1 (stdio) and Phase 2 (HTTP) need to resolve an authenticated user into a full EffectiveUserContext. This requires a single endpoint that takes an authenticated request and returns the user's identity, license types, computed access level, and preferences.

**Endpoint (to be built in ITM.Account):**

```
POST /v2/{company}/resolve/identity
Header: Authorization: Bearer {api_key}    (Phase 1)
   or:  Authorization: Bearer {session_token}  (after token exchange, Phase 2)
-->  {
  "userId": 456,
  "accountId": 123,
  "email": "user@acme.com",
  "languageId": 2,
  "licenseTypeIds": [1],
  "dataMartAccess": "full",
  "pmScopeUserId": null
}
```

The endpoint returns **computed** values (`dataMartAccess`, `pmScopeUserId`), not just raw license types. This keeps the license-to-access interpretation in one place rather than duplicating it in MCP, PMPilot, and future integrations.

**Why this endpoint is needed:**
- The API gateway validates the API key or token and resolves the user internally, but it does not return the resolved userId/accountId to the HTTP client. The MCP server needs userId for DataMart `X-PM-Scope-User-Id` headers and access level determination.
- Without it, stdio auth would require the email as a separate env var (to look up userId via user search) -- a workaround the user then needs to keep in sync with their API key.
- The endpoint also benefits MSTeamsBot (which currently uses the SuperAdmin endpoint that returns plaintext passwords) and any future integrations.

**Implementation notes:**
- Gateway route: add to `APIGateway.json` with `"auth": "token"` (API key Bearer tokens are converted to session tokens by the gateway, so this works for both)
- Controller: new endpoint in ITM.Account's UserController
- Logic: the gateway already resolved the user during token/API key validation -- this endpoint queries the user's roles and license types, computes `dataMartAccess` using the same logic as PMPilot's `isPmOnlyAccountUser()`, and returns the full context
- This is a Phase 1 prerequisite -- it must be built before the MCP server can complete its auth layer

**API key prefix recommendation:** Currently API keys are UUID-format strings. Adding a prefix (e.g., `itmp_live_...`) would make leaked keys detectable in logs and on GitHub via secret scanning. Small change, high value. Consider for the next iteration of key generation.

---

## 4. ITM Platform Services -- What the MCP Server Consumes

The MCP server reads data from two surfaces, both accessed through the ITM.API gateway:

1. **ITM.DataMart** (primary) -- for all component and subcomponent reads (~90% of queries)
2. **v2 REST API** (secondary) -- for entities not in DataMart, and all writes

### 4.1 ITM.DataMart -- Primary Read Surface

DataMart stores pre-denormalized MongoDB documents: one document per component (project or service) with all subcomponents embedded as arrays. This is the same read path that PMPilot uses in production.

**Endpoint:** `POST /v2/{co}/datamart/graphql`

**Three query operations:**

| Operation | Purpose | Example |
|-----------|---------|---------|
| `component(id, project)` | Single component by ID | Get one project with selected fields |
| `components(where, project, sort, limit, skip)` | List with filters, pagination, field selection | Search projects by status, date range |
| `aggregateComponents(pipeline)` | MongoDB aggregation pipeline | Group projects by methodology, sum budgets |

**Entities available (all on one document):**

| Entity | Access | Notes |
|--------|--------|-------|
| Projects | `componentType: "project"` | Top-level component fields |
| Services | `componentType: "service"` | Same schema as projects |
| Tasks | `project: {"tasks": 1}` | Nested array (projects only) |
| Activities | `project: {"activities": 1}` | Nested array (services only; fewer fields than tasks) |
| Purchases | `project: {"purchases": 1}` | Nested array (both projects and services) |
| Revenues | `project: {"revenues": 1}` | Nested array (both projects and services) |
| Risks | `project: {"risks": 1}` | Nested array (projects only) |
| Issues | `project: {"issues": 1}` | Nested array (projects only) |
| Budgets | `project: {"budgetTopDown": 1, ...}` | Four budget objects: topDown, bottomUp, periodEndClose, actual |
| Earned value | `project: {"earnedValueMetrics": 1}` | Waterfall projects only, opaque JSON |
| Active baseline | `project: {"activeBaseline": 1}` | If project has a baseline |

**Filtering (MongoDB query syntax):**

```json
{
  "where": {
    "componentType": { "$eq": "project" },
    "percentComplete": { "$gte": 50 },
    "managers.userId": { "$eq": 123 },
    "name": { "$regex": "growth", "$options": "i" }
  },
  "project": { "id": 1, "name": 1, "statusLabel": 1, "budgetActual": 1 },
  "sort": { "name": 1 },
  "limit": 50
}
```

**Aggregation (unique capability -- no v2 REST equivalent):**

```json
{
  "pipeline": [
    { "$match": { "componentType": "project" } },
    { "$group": { "_id": "$methodology", "count": { "$sum": 1 }, "avgProgress": { "$avg": "$percentComplete" } } },
    { "$sort": { "count": -1 } },
    { "$limit": 10 }
  ]
}
```

**Server limits:** max 200 rows per list query, max 1000 rows per aggregation, 5-second query timeout. DataMart has no per-user rate limiting beyond the query timeout -- the MCP server must add its own throttling (see Section 10).

**Localization caveat:** DataMart stores labels (`statusLabel`, `priorityLabel`, etc.) at sync time in the account's configured language. The writer maps `Status.Name` to `statusLabel` directly -- there is no language parameter and no dynamic translation. A user with a different `languageId` than the account default will still see labels in the account's language. This is a known limitation shared with PMPilot.

**Schema discovery:** `GET /v2/{co}/datamart/api/schema/{entity}` returns JSON Schema for component, task, purchase, revenue, risk, issue, activity.

**Relevant repo:** [ITM.DataMart](../ITM.DataMart/)

### 4.2 Why DataMart over v2 REST for reads

| Factor | DataMart | v2 REST |
|--------|----------|---------|
| **Round trips** | 1 query returns project + all subcomponents | 5-6 calls (project + tasks + risks + issues + budget + team) |
| **Aggregation** | `$group`, `$match`, `$sort`, `$unwind`, `$addFields` | None -- must fetch all records and compute client-side |
| **Field selection** | MongoDB projection on any field | Limited `Columns` parameter on `/search` only |
| **Performance** | MongoDB (pre-denormalized) | API Gateway overhead (~50-100ms) + SQL stored procedures |
| **Token usage** | Minimal -- select only needed fields | 40+ fields per entity, nested objects |
| **Production proof** | PMPilot uses this path exclusively | N/A |

**Tradeoff -- eventual consistency:** DataMart syncs via events with a 5-second debounce. Data can lag the source of truth by 5-60 seconds. For AI-assisted portfolio analysis this is acceptable. For exact post-edit state (confirming a write succeeded), use v2 REST.

### 4.3 v2 REST API -- Secondary Read Surface and Mutations

Used for entities DataMart does not cover, and for all write operations.

**ITM.Account (users, roles, calendars):**

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v2/{co}/AllUsers` | GET/POST | List/search users (supports filter, pagination, sort via POST body) |
| `/v2/{co}/users/{id}` | GET | User details |
| `/v2/{co}/roles` | GET | Role list |
| `/v2/{co}/holidays` | GET | Holiday calendars |
| `/v2/{co}/HolidayCalendars` | GET | Holiday calendar list |
| `/v2/{co}/standardworkhours` | GET | Work hour templates |
| `/v2/{co}/categories` | GET | Professional categories |
| `/v2/{co}/clients` | GET | Client list |
| `/v2/{co}/providers` | GET | Provider/vendor list |

**ITM.Tasks -- reference data (not in DataMart):**

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v2/{co}/projectstatuses` | GET | Project status list |
| `/v2/{co}/gettaskstatuses` | GET | Task status list |
| `/v2/{co}/gettasktypes` | GET | Task type list |
| `/v2/{co}/gettaskpriorities` | GET | Task priority list |
| `/v2/{co}/getprojecttypes` | GET | Project type list |
| `/v2/{co}/projectpriorities` | GET | Project priority list |
| `/v2/{co}/riskstatuses` | GET | Risk status list |
| `/v2/{co}/risktypes` | GET | Risk type list |
| `/v2/{co}/issuestatuses` | GET | Issue status list |
| `/v2/{co}/issuetypes` | GET | Issue type list |
| `/v2/{co}/purchasestatuses` | GET | Purchase status list |
| `/v2/{co}/purchasetypes` | GET | Purchase type list |
| `/v2/{co}/revenuestatuses` | GET | Revenue status list |

**ITM.Tasks -- entities not in DataMart:**

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v2/{co}/projects/{pid}/sprints` | GET | Sprint list |
| `/v2/{co}/projects/{pid}/sprints/{sid}` | GET | Sprint detail |
| `/v2/{co}/Programs` | GET | Program list |
| `/v2/{co}/Programs/Search` | POST | Search programs |
| `/v2/{co}/projects/{pid}/KanbanTaskData` | GET | Kanban board data |
| `/v2/{co}/projects/{pid}/resources` | GET | Resource allocation |
| `/v2/{co}/resourceAnalysis` | GET | Resource analysis report |
| `/v2/{co}/projects/{pid}/progressreports` | GET | Detailed progress reports |
| `/v2/{co}/CustomFields/{pageId}` | GET | Custom field definitions |

**ITM.Tasks -- write endpoints (Phase 2+):**

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v2/{co}/projects` | POST | Create project |
| `/v2/{co}/projects/{id}` | PATCH | Update project fields |
| `/v2/{co}/projects/{pid}/tasks` | POST | Create task |
| `/v2/{co}/projects/{pid}/tasks/{tid}` | PATCH | Update task |
| `/v2/{co}/projects/{pid}/risks` | POST | Create risk |
| `/v2/{co}/projects/{pid}/issues` | POST | Create issue |
| `/v2/{co}/projects/{pid}/tasks/batch` | POST | Bulk task update |

**Relevant repos:** [ITM.Tasks](../ITM.Tasks/), [ITM.Account](../ITM.Account/)

### 4.4 ITM.AiGenerator (AI insights)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v2/{co}/genChartTitle/{lang}` | POST | Generate chart titles |
| `/v2/{co}/entityInsights` | POST | AI-generated entity insights |
| `/v2/{co}/planGeneration` | POST | AI plan generation |

**Relevant repo:** [ITM.AiGenerator](../ITM.AiGenerator/)

### 4.5 API Gateway routing

All requests (both DataMart and v2 REST) go through the API Gateway (`ITM.API/APIGateway.json`), which:
- Routes v2 URLs to the correct microservice via regex matching
- Replaces company slug with numeric `AccountId`
- Sets `X-Application-Name` from route configuration (gateway-managed, not client-set)
- Forwards `UserId`, `LanguageId`, and auth token to downstream services
- Enforces auth type per endpoint (`"auth": "token"` or `"auth": "extension"`)

DataMart endpoints are already registered in the gateway (`/v2/{AccountId}/datamart/*`) with `"auth": "token"`. The API key Bearer flow (`PerformLoginForAPIKey`) works for these routes -- confirmed in the gateway code.

The gateway has WebApiThrottle configuration (per `Authorization-Key` header, per IP, per endpoint) with quota values in `Web.prod.config` (3/sec, 100/min, 3000/hr, 10000/day), but the handler registration is currently commented out in `WebApiConfig.cs`. MCP cannot rely on gateway throttling as inherited protection -- see open questions.

For integration traceability, the MCP server logs the AI client identifier internally. If downstream services need to know a call came from MCP, a separate `X-Integration-Source` header can be added to the gateway's forwarded headers in a future iteration.

**Relevant repo:** [ITM.API](../ITM.Web/ITM.API/)

### 4.6 Search / Pagination Patterns

**DataMart (primary):** See Section 4.1. Uses MongoDB `where`, `project`, `sort`, `limit`, `skip` in GraphQL variables.

**v2 REST (secondary):** Almost all v2 list endpoints support a `/search` suffix with this request body:

```json
{
  "Filter": { "Name": { "$regex": "growth" }, "KindId": { "$in": [2, 3] } },
  "Columns": { "$in": ["Id", "Name", "Status"] },
  "page": 1,
  "pageSize": 50,
  "sortBy": "Name",
  "sortOrder": "asc"
}
```

Response:

```json
{
  "total": 1125,
  "pagerId": "44b7fecc-...",
  "page": 1,
  "pageSize": 50,
  "data": [...]
}
```

Without `/search`, endpoints return up to 50 items with no filtering.

### 4.7 Existing OpenAPI Specs

These can drive auto-generation of MCP tool input schemas:

| Spec | Location | Coverage |
|------|----------|----------|
| v2 API | [ITM.APIDocs/dist/openapi.json](../ITM.Web/ITM.APIDocs/dist/openapi.json) | ITM.Tasks + ITM.Account endpoints |
| DataMart | [ITM.DataMart/openapi.json](../ITM.DataMart/openapi.json) | GraphQL, writer, schema, admin endpoints |

Use OpenAPI as a source of truth for input/output validation (zod schemas) but hand-curate the tool surface. Auto-generated tool schemas from OpenAPI are too granular for LLMs (one tool per endpoint, full field lists). Phase 1 needs ~14 hand-curated tools, not 200 generated ones. The audit matters for Phase 2 writes -- to know which endpoints have accurate OpenAPI specs.

---

## 5. MCP Capabilities -- Phased Rollout

**Tool count target:** Keep total tools under 30 across all phases. Some AI clients degrade in quality past ~40 tools. If the surface grows beyond 30, split into domain-specific MCP servers (e.g., `itm-portfolio` for reads, `itm-manage` for writes).

### 5.1 Phase 1 -- Read-Only (initial release)

**Tools -- DataMart-backed (component and subcomponent reads):**

| Tool | Description | DataMart operation | Notes |
|------|-------------|-------------------|-------|
| `search_projects` | Find projects by name, status, type, date range | `components` with `componentType: "project"` | Supports filters, sort, pagination, field selection |
| `search_services` | Find services by name, status, type, date range | `components` with `componentType: "service"` | Same query shape as projects |
| `get_project` | Full project details with optional subcomponents | `component(id)` with projection | One query returns project + tasks + risks + budget etc. |
| `get_service` | Full service details with optional subcomponents | `component(id)` with projection | Same as get_project for services |
| `list_project_tasks` | List tasks for a project | `component(id, project: {"tasks": 1})` | Nested array extraction |
| `get_project_risks` | List risks for a project | `component(id, project: {"risks": 1})` | Nested array extraction |
| `get_project_issues` | List issues for a project | `component(id, project: {"issues": 1})` | Nested array extraction |
| `get_project_budget` | Budget summary (all four budget types) | `component(id, project: {"budgetTopDown": 1, "budgetBottomUp": 1, "budgetPeriodEndClose": 1, "budgetActual": 1})` | Four objects on one document |
| `get_project_purchases` | Purchase orders for a project | `component(id, project: {"purchases": 1})` | Nested array extraction |
| `get_project_revenues` | Revenue items for a project | `component(id, project: {"revenues": 1})` | Nested array extraction |
| `aggregate_portfolio` | Portfolio-level analytics (group, count, sum, avg) | `aggregateComponents` pipeline | Unique -- no v2 REST equivalent |

**Tools -- v2 REST-backed (entities not in DataMart):**

| Tool | Description | API call |
|------|-------------|----------|
| `search_users` | Find team members | `POST /v2/{co}/AllUsers` (with filter body) |
| `get_user` | User details | `GET /v2/{co}/users/{id}` |
| `get_reference_data` | Status lists, types, priorities for an entity | `GET /v2/{co}/{entity}statuses` etc. |

**Tools -- advanced (raw DataMart access):**

| Tool | Description | API call | Notes |
|------|-------------|----------|-------|
| `query_datamart` | Run arbitrary GraphQL query against DataMart | `POST /v2/{co}/datamart/graphql` | For custom analysis beyond typed tools; MCP server validates query shape and operators (see Section 12 release blocker) |

The typed tools (`search_projects`, `get_project`, etc.) compose safe DataMart queries internally. The AI model calls domain-level tools without needing to know GraphQL. `query_datamart` is available for advanced/custom analysis that typed tools do not cover.

**Resources (context data):**

| URI | Description |
|-----|-------------|
| `itm://schema/component` | DataMart component schema (projects/services -- fields, types, enums) |
| `itm://schema/tasks` | DataMart task schema |
| `itm://schema/purchases` | DataMart purchase schema |
| `itm://schema/risks` | DataMart risk schema |
| `itm://schema/issues` | DataMart issue schema |
| `itm://calendars/{projectId}` | Holiday calendar and weekend rules for a project |

**Schema strategy:** MCP does not have a server-side system prompt like PMPilot. The `InitializeResult.instructions` field provides a lightweight hint channel, but it is not guaranteed to reach the model's context in all clients. So the PMPilot pattern of injecting the full component schema at session start does not directly apply. Instead:
- Typed tools (`search_projects`, `get_project`, etc.) embed compact field hints in their tool descriptions so the model knows filterable/projectable fields without an extra call
- Full schemas are available as MCP Resources (`itm://schema/component` etc.) for AI clients that load them into context
- The `query_datamart` advanced tool includes a summary of available fields and query syntax in its tool description
- Sub-entity schemas (task, risk, purchase, etc.) are available as additional Resources for clients that need them

**Prompts (workflow templates):**

| Prompt | Description | Tools used |
|--------|-------------|------------|
| `/project_status` | Status report for a project -- fetches project, tasks, risks, budget in one query and summarizes | `get_project` (with full projection) |
| `/portfolio_overview` | Portfolio health -- aggregates projects by status, methodology, budget variance | `aggregate_portfolio` |
| `/team_workload` | Team workload overview -- fetches users, assignments, availability | `search_users`, `search_projects` |
| `/risk_analysis` | Risk assessment for a project -- fetches risks, issues, budget data | `get_project` (with risks + issues + budget projection) |

### 5.2 Phase 2 -- Write Operations

| Tool | Description |
|------|-------------|
| `create_task` | Create a new task in a project |
| `update_task` | PATCH task fields (status, dates, assignee) |
| `create_risk` | Log a new risk |
| `create_issue` | Log a new issue |
| `update_project` | PATCH project fields |

**Stale-after-write:** Write tools return the confirmed state from v2 REST (the write response). Subsequent reads via DataMart-backed tools may lag 5-60 seconds due to DataMart's eventual consistency model. This is documented in tool responses.

**Audit logging:** All write operations are logged to `tblMcpAuditLog` (in the ITM database, inserts via ITM.Account) with: timestamp, userId, accountId, tool name, parameters hash (SHA-256), success/error, AI client identifier, and duration. The audit client uses a fire-and-forget pattern: audit failures are logged as warnings but never break write operations. When the audit endpoint is unavailable (e.g. ITM.Account not yet deployed), a no-op fallback is used. ITM.Account owns the table and insert logic, keeping the schema with existing user/account tables and allowing it to enforce write-only-by-MCP via service identity.

### 5.3 Phase 3 -- Advanced

| Tool | Description |
|------|-------------|
| `generate_insights` | Call AiGenerator for entity insights |
| `manage_extensions` | Create/configure connector extensions |
| `bulk_update_tasks` | Batch task operations |

### 5.4 What to Exclude

| Excluded | Reason |
|----------|--------|
| Direct database access | Security risk; DataMart GraphQL and v2 API already abstract this |
| Admin/account management | Licensing, roles, SSO are high-risk operations |
| File uploads | Binary handling in MCP is awkward; defer |
| v1 endpoints | Legacy; v2 covers the same entities |
| v2 REST for component reads | DataMart is faster, denormalized, and supports aggregation; v2 REST adds gateway overhead and requires multiple round trips |
| PMPilot as a tool | PMPilot and MCP are different products. PMPilot is a stateful assistant with curated workflows and conversation memory; MCP is a typed capability layer. Query validation logic is copied (not shared via package) between repos with sync comments -- see Section 12. |

---

## 6. Project Structure

```
ITM.MCP/
  src/
    server.ts              # MCP server bootstrap (stdio + HTTP transports)
    logger.ts              # Pino logger to stderr (stdout reserved for MCP stdio protocol)
    auth/
      effective-user-context.ts  # EffectiveUserContext type
      api-key-auth.ts            # Phase 1: API key / session token auth, calls identity resolution endpoint
      license-resolver.ts        # License type interpretation (licenseTypeIds -> dataMartAccess)
      oauth-auth.ts              # Phase 2: OAuth 2.1 token exchange + EffectiveUserContext builder
      oauth-metadata.ts          # Phase 2: /.well-known/oauth-protected-resource (RFC 8707)
      token-extraction.ts        # Phase 2: Bearer token extraction from HTTP headers
    clients/
      index.ts             # createClients() factory (single entry point), Clients interface
      datamart-client.ts   # DataMart GraphQL client (through gateway)
      rest-client.ts       # v2 REST HTTP client (GET, POST, PATCH) (through gateway)
      audit-client.ts      # Phase 2: audit log client (fire-and-forget, no-op fallback)
    tools/
      graphql-queries.ts   # Fixed GraphQL query templates, default projections, clampLimit()
      projects.ts          # search_projects, get_project (DataMart-backed)
      services.ts          # search_services, get_service (DataMart-backed)
      tasks.ts             # list_project_tasks (DataMart-backed)
      financials.ts        # get_project_budget, purchases, revenues (DataMart-backed)
      risks-issues.ts      # get_project_risks, get_project_issues (DataMart-backed)
      portfolio.ts         # aggregate_portfolio (DataMart-backed)
      datamart.ts          # query_datamart (raw GraphQL -- advanced)
      users.ts             # search_users, get_user (v2 REST-backed)
      reference-data.ts    # get_reference_data (v2 REST-backed)
      write-tools.ts       # Phase 2: create_task, update_task, create_risk, create_issue, update_project (v2 REST)
    resources/
      schemas.ts           # DataMart entity schema resources
      calendars.ts         # Calendar resources (v2 REST)
    prompts/
      project-status.ts    # /project_status workflow
      portfolio-overview.ts # /portfolio_overview workflow
      team-workload.ts     # /team_workload workflow
      risk-analysis.ts     # /risk_analysis workflow
    validation/
      query-validator.ts   # DataMart query shape and operator validation
  tests/
  zz_Specifications/
  package.json
  tsconfig.json
  .gitignore
  .env.sample
  CLAUDE.md
  README.md
```

---

## 7. Tech Stack

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Language | TypeScript | Best MCP SDK support; matches ITM.DataMart and ITM.PMPilot |
| MCP SDK | `@modelcontextprotocol/sdk` | Official, Tier 1, full primitive support |
| Runtime | Node.js | Matches existing Node.js services |
| HTTP client | Native `fetch` | Calls ITM v2 REST API (no axios dependency) |
| Validation | `zod` | Already used in ITM.DataMart; validates tool inputs |
| Query guards | `src/validation/query-validator.ts` | Copied from PMPilot's `validators.js` with sync comments (see Section 12) |
| Testing | `vitest` | Already used in ITM.DataMart and ITM.PMPilot |
| Build | `tsc` | TypeScript compiler, same as ITM.DataMart |

---

## 8. Deployment

### 8.1 Local Development

**npm scripts:**

| Script | Command | Purpose |
|--------|---------|---------|
| `npm run dev` | `cross-env PORT=6160 node --env-file=.env --import tsx src/server.ts` | Start MCP server in dev mode (HTTP on port 6160, loads `.env`) |
| `npm run build` | `tsc` | Compile TypeScript to `dist/` |
| `npm start` | `node dist/server.js` | Start compiled server (stdio mode, used by AI clients) |
| `npm test` | `vitest` | Run unit tests |
| `npm run test:e2e` | `vitest run --config vitest.e2e.config.ts` | Run E2E tests against local services (see Section 15) |

**Development mode (`npm run dev`):**

Starts the MCP server with Streamable HTTP transport on **port 6160**. This allows testing with curl, the MCP Inspector, or any HTTP client. The server reads configuration from `.env` (or environment variables):

```env
ITM_API_URL=http://localhost/ITM.API
ITM_COMPANY=testsmarter
# Use ONE of the following:
ITM_API_KEY=a1b2c3d4-e5f6-7890-abcd-ef1234567890
# ITM_TOKEN=your-session-token-here
```

The dev server is the primary way to verify tools during development. Start it, test with curl (Section 15), and stop it with Ctrl+C. It can be restarted freely between test runs.

**Port assignment -- 6160:** Follows the existing local port sequence (see [ENVIRONMENTS-AND-ACCESS.md](../../ENVIRONMENTS-AND-ACCESS.md)):

| Service | Port |
|---------|------|
| AI Generator | 6128 |
| DataServiceModel | 6139 |
| DataMart | 6142 |
| PM Pilot | 6150 |
| **MCP Server** | **6160** |

**stdio mode (AI client usage):**

When an AI client spawns the MCP server, it connects via stdio (stdin/stdout). The client passes environment variables in its config file:

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
        "ITM_API_KEY": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
      }
    }
  }
}
```

stdio works against any ITM Platform environment. Change `ITM_API_URL` to point at a different target:

| Target | `ITM_API_URL` |
|--------|---------------|
| Local | `http://localhost/ITM.API` |
| Stage | `https://newapi.itmplatform.com` |
| Demo | `https://demoapi.itmplatform.com` |
| Production | `https://api.itmplatform.com` |

To generate an API key: log into ITM Platform, go to My Profile, and click Generate API Key. The key is shown once -- copy it immediately. Credentials and URLs: see [ENVIRONMENTS-AND-ACCESS.md](../../ENVIRONMENTS-AND-ACCESS.md).

### 8.2 Production (Streamable HTTP)

Hosted as an HTTP service alongside the existing API:

| Environment | URL | API target |
|-------------|-----|------------|
| Local | `http://localhost:6160/mcp` | `http://localhost/ITM.API` |
| Demo | `https://mcp-demo.itmplatform.com/mcp` | `https://demoapi.itmplatform.com` |
| Stage | `https://mcp-stage.itmplatform.com/mcp` | `https://newapi.itmplatform.com` |
| Production | `https://mcp.itmplatform.com/mcp` | `https://api.itmplatform.com` |

Single hosted endpoint for all tenants. Tenant resolved from OAuth token claims.

### 8.3 Deployment Pipeline

Follow the same pattern as ITM.DataMart:

```bash
merge-develop-into.bat stage   # deploy to Stage
merge-develop-into.bat main    # deploy to Production
```

---

## 9. Response Shaping

Raw API responses are often too verbose for AI context windows. The MCP server should:

| Technique | Example | Applies to |
|-----------|---------|------------|
| **Field projection** | DataMart `project` parameter selects only needed fields at query time | DataMart tools |
| **Field selection** | Return 8-10 key fields instead of 40+ | v2 REST tools |
| **Pre-resolved labels** | DataMart stores `statusLabel`, `priorityLabel` etc. -- no ID-to-name resolution needed | DataMart tools |
| **ID resolution** | Replace `StatusId: 3` with `Status: "In Progress"` where practical | v2 REST tools |
| **Flatten nesting** | `{ project: { details: { name } } }` becomes `{ name }` | v2 REST tools |
| **Pagination summary** | Include `total`, `limit`, `skip` but not internal IDs | Both |
| **Date formatting** | ISO 8601 strings, not .NET ticks or mixed formats | v2 REST tools (DataMart already uses ISO) |

DataMart responses are already relatively LLM-friendly: denormalized, label-resolved, ISO dates. Most shaping effort goes into v2 REST responses.

PMPilot does no code-level response shaping -- it returns DataMart responses verbatim and relies on prompt instructions to format output for the user. MCP tools should follow the same approach: select the right fields via projection, return them as-is, and let the AI model handle presentation.

---

## 10. Security Considerations

| Concern | Mitigation |
|---------|-----------|
| Credential storage (stdio) | API key in environment variables only; never hardcode. API keys are revocable (user can regenerate from profile) and do not expose the user's login password. Standard practice for CLI tools (GitHub CLI, Stripe CLI, etc.). Note: JSON env files on shared/managed laptops carry risk equivalent to a password file. For environments requiring stronger protection, a future `npx @itm/mcp-cli login` could store the key in the OS keychain (keytar). |
| API key security | API key is stored as SHA256 hash in the database (`tblUser.EncryptedAPIKey`). The full key is shown once at generation and never again. Last 4 characters stored separately for display in the UI. |
| No password exposure | MCP never handles user passwords. API key replaces email+password for stdio. OAuth handles HTTP. The SuperAdmin endpoint (which returns plaintext passwords) is not used. |
| Token lifetime | Phase 1: the gateway creates a fresh session token from the API key on every request. Phase 2: OAuth access tokens are short-lived with refresh token rotation; session tokens from exchange have TTL capped at `min(oauthToken.exp, ITM_SESSION_MAX_TTL)`. |
| Scope limiting | Phase 1 is read-only; write tools require explicit opt-in |
| Per-user scoping | EffectiveUserContext resolved at startup via identity resolution endpoint; DataMart PM-scope filtering enforced via `X-PM-Scope-User-Id`; v2 REST rights enforced by API Gateway |
| PM-scope trust boundary | Phase 1 stdio blocks PM-only users because DataMart trusts client-supplied `X-PM-Scope-User-Id` without re-validation. Phase 2 HTTP is safe (server-side, trusted zone). Long-term: gateway computes and injects the header from the authenticated user's license type. See Section 3.6. |
| License enforcement | Team Members (license type 3+) blocked from all tools; mirrors PMPilot/DataMart policy |
| Identity verification (stdio) | User provides API key in env vars. The API key authenticates the user (gateway validates SHA256 hash). The identity resolution endpoint returns the full user context. The trust model is the OS user session -- same as any CLI tool. |
| Identity verification (HTTP) | OAuth 2.1 with PKCE provides verified identity. Tokens are audience-bound to the MCP server (RFC 8707). OAuth tokens are exchanged for internal session tokens at the MCP boundary -- never forwarded to upstream APIs. |
| SSO compatibility | API keys work for SSO users -- they generate one from their profile page while logged in via SSO. No ITM Platform password needed. For HTTP, OAuth supports SSO natively. |
| Rate limiting | Gateway WebApiThrottle is configured but the handler is currently disabled (commented out in `WebApiConfig.cs`). MCP must implement its own throttling: token bucket per EffectiveUserContext, low limit on aggregations (`aggregateComponents`, `query_datamart`), per-tool concurrency cap (e.g., max 3 in-flight DataMart queries per session) to prevent runaway agents from saturating the service. Gateway throttling should be re-enabled as a defense-in-depth measure. |
| Data exposure | Only expose data the authenticated user has permission to see; CompanyAdmin/FullUser see all, PM sees only managed components, TM blocked |
| HTTPS | Required in production; HTTP only for localhost |
| AI model isolation | AI model never sees ITM credentials -- auth is handled at the transport layer by the MCP client. Tools receive EffectiveUserContext, not raw secrets. |
| AI client identification | MCP's `initialize.params.clientInfo` provides the AI client's name, version, and metadata during the handshake (e.g., `{ "name": "claude-desktop", "version": "1.0.0" }`). The MCP server logs this for usage analytics and abuse investigation. Transport-level headers (e.g., `User-Agent`) may provide additional info but are not a portable MCP guarantee. |

---

## 11. Reference: Production MCP Servers (Comparable SaaS Products)

| Product | Transport | Auth | Capabilities |
|---------|-----------|------|-------------|
| GitHub (official) | Streamable HTTP | OAuth / PAT | Browse repos, issues, PRs, workflows |
| Slack | Streamable HTTP | OAuth | Read channels, threads, send messages |
| Jira | Streamable HTTP | OAuth / API token | Query issues, transitions, custom fields |
| Linear | Streamable HTTP | API key | Issue tracking, workspace context |
| Sentry | Streamable HTTP | API token | Browse errors, releases, alerts |

All use Streamable HTTP for production hosting. stdio is the equivalent of running their CLI locally with an API key.

---

## 12. Release Blockers

These must be resolved before the MCP server can go to production:

| Blocker | Detail | Repo | Status |
|---------|--------|------|--------|
| Identity resolution endpoint | `POST /v2/{co}/resolve/identity` must be built. Returns userId, accountId, email, languageId, licenseTypeIds, computed dataMartAccess, pmScopeUserId. Both phases depend on it. See Section 3.7. | ITM.Account | ✅ Done |
| DataMart query validator | `query_datamart` must not ship without validation guards. Copy PMPilot's `inference/datamart/validators.js` (~150 lines, zero deps) into `src/validation/query-validator.ts` (ported to TypeScript). Both files carry sync comments pointing to each other. Allowed operators: `$eq`, `$ne`, `$in`, `$nin`, `$gt`, `$gte`, `$lt`, `$lte`, `$regex`, `$options`, `$exists`, `$not`, `$and`, `$or`, `$nor`. Note: `$not` is allowed by DataMart's `validate.ts` but not in PMPilot's current allow-list -- the MCP copy must add it. Allowed aggregation stages: `$match`, `$project`, `$group`, `$sort`, `$limit`, `$skip`, `$unwind`, `$addFields`, `$set`, `$unset`. Banned: `$lookup`, `$merge`, `$out`, `$function`, `$accumulator`, `$where` (JS execution), `$facet` (DoS surface). Enforce `$limit` on every aggregation (max 1000). | ITM.MCP (+ sync comment in ITM.PMPilot) | ⬜ To do |
| Gateway PM-scope injection | The gateway must compute `X-PM-Scope-User-Id` from the authenticated user's license type and inject it, so DataMart does not rely on client-supplied headers. Requires adding license type to the gateway's `UserAccount` object (currently only has UserId, AccountId, LanguageId, IsCompanyAdmin). Until this ships, PM-only users are blocked from stdio. Phase 2 HTTP is unaffected (server-side, trusted zone). | ITM.API | ⬜ Prerequisite for PM stdio |
| License policy verification | DataMart's `accessService.ts` already defines allowed license types as `[0, 1, 2]` (CompanyAdmin, FullUser, ProjectManager). PM-scoped access works in production via PMPilot. Verified: matches spec. | ITM.DataMart | ✅ Verified |

---

## 13. Decisions & Remaining Open Questions

### Resolved decisions

| Decision | Resolution | Rationale |
|----------|-----------|-----------|
| **Multi-tenant model** | Multi-tenant for HTTP (single URL, tenant from OAuth claims). Single-tenant per process for stdio (tenant from `ITM_COMPANY` env var). | Operationally simpler than per-tenant hostnames. Isolation is at the token/identity layer, not the URL. |
| **OAuth authorization server** | Build in ITM.Account, do not delegate to Auth0/Azure AD. Authorization code + PKCE only (no implicit, no password grant). Refresh token rotation. | ITM already owns user identity, SSO mapping, and license interpretation. Delegating creates a sync problem. |
| **Phase 2 token model** | OAuth-to-session-token exchange at MCP boundary via `POST /v2/{co}/auth/exchange-token`. Session token TTL capped at OAuth token expiry. MCP uses the resulting session token for gateway calls. | Smallest gateway change. Keeps gateway's existing trust model intact. No god-key / service account. |
| **stdio PM restriction** | Phase 1 stdio restricted to CompanyAdmin and FullUser. PM-only users blocked until gateway PM-scope injection ships. Phase 2 HTTP supports PMs (server-side, trusted zone). | Simplest correct solution. No PM-scope headers needed for full-access users. Avoids lateral PM-to-PM access via client-supplied headers. |
| **PMPilot overlap** | Complementary channels, not nested. PMPilot owns prompt engineering, conversation memory, ITM-specific UX. MCP owns typed tools/resources/prompts that compose DataMart and v2 REST safely. Query validation logic is copied between repos with sync comments. | Clear ownership. Copy-with-sync avoids introducing a shared package pattern that does not exist in the Node.js repos today. |
| **DataMart query validation** | Copy PMPilot's `validators.js` into ITM.MCP as `src/validation/query-validator.ts` (TypeScript port). Both files carry sync comments pointing to each other so changes in one prompt updates in the other. | ~150 lines, zero deps. A shared npm package is not justified for two consumers and would introduce a new dependency pattern. If a third consumer appears, reconsider. |
| **OpenAPI usage** | Hand-curate Phase 1 tools (14 tools). Use OpenAPI for zod schema generation and input validation. Audit OpenAPI coverage before Phase 2 writes. | Auto-generated tool schemas are too granular for LLMs. |
| **Extension system** | Not in scope for Phases 1-3. MCP is an outbound capability surface; extensions are inbound. Push notifications (SSE for real-time updates) is a future feature. | Orthogonal concern. Revisit when streaming/notifications are on the roadmap. |
| **Product naming** | User-facing: `ITM Platform`. Repo: `ITM.MCP`. | Matches existing naming pattern (Teams bot is `ITM Platform`). |
| **Licensing** | Phase 1 (read-only) is free with platform. Write operations (Phase 2+) may be seat-gated later. API key generation already exists on the profile page. | No feature flag needed for Phase 1. |
| **Audit log ownership** | `tblMcpAuditLog` in the ITM database, inserts via ITM.Account. | Keeps schema with existing user/account tables. ITM.Account can enforce write-only-by-MCP via service identity. Decided before Phase 2 to avoid rework. |

### Remaining open questions

| Question | Context |
|----------|---------|
| Gateway rate limiting disabled | The gateway has WebApiThrottle configured in `Web.prod.config` (3/sec, 100/min, 3000/hr, 10000/day) but the handler is commented out in `WebApiConfig.cs`. Decide: (a) re-enable gateway throttling as defense in depth, or (b) rely entirely on MCP-side throttling. Either way, MCP must implement its own rate limiting. |
| OAuth scope design | What scopes should the OAuth server define? Options: `mcp:read`, `mcp:write`, `mcp:admin` (coarse) vs per-tool scopes (fine-grained). Coarse is simpler; fine-grained enables step-up authorization. |
| DataMart localization | Labels are stored at sync time in the account's language. Is multi-language label storage on the DataMart roadmap, or should MCP document this as a known limitation and move on? |

---

## 14. Phase Tracker

### Phase 1 -- Read-Only (stdio)

| # | Step | Repo | Status |
|---|------|------|--------|
| 1 | Identity resolution endpoint (`POST /v2/{co}/resolve/identity`) | ITM.Account | ✅ DONE |
| 2 | Copy query validator from PMPilot's `validators.js` into `src/validation/query-validator.ts`; add sync comments to both files | ITM.MCP + ITM.PMPilot | ✅ Done |
| 3 | Verify DataMart license policy matches spec (Section 12) | ITM.DataMart | ✅ Done |
| 4 | Initialize repo (`npm init`, SDK, TypeScript, Vitest) | ITM.MCP | ✅ Done |
| 5 | Auth layer (EffectiveUserContext, API key auth, license interpreter, PM-only rejection) | ITM.MCP | ✅ Done |
| 6 | Gateway client (single HTTP client for DataMart + v2 REST through gateway) | ITM.MCP | ✅ Done |
| 7 | DataMart tools (`search_projects`, `get_project`, tasks, risks, issues, budget, portfolio) | ITM.MCP | ✅ Done |
| 8 | REST tools (`search_users`, `get_user`, `get_reference_data`) | ITM.MCP | ✅ Done |
| 9 | Resources (DataMart entity schemas, field hints in tool descriptions) | ITM.MCP | ✅ Done |
| 10 | Prompts (`/project_status`, `/portfolio_overview`, `/risk_analysis`, `/team_workload`) | ITM.MCP | ✅ Done |
| 11 | `query_datamart` tool with query guard validation | ITM.MCP | ✅ Done |
| 12 | E2E tests -- verify all Phase 1 tools against local services with curl and `npm run test:e2e` (Section 15) | ITM.MCP | ✅ Done |
| 13 | Documentation (usage guide, per-client config examples) | ITM.MCP | ✅ Done |

### Phase 2 -- Writes + Streamable HTTP

| # | Step | Repo | Status |
|---|------|------|--------|
| 14 | Gateway PM-scope injection (unblocks PM users for stdio; Section 12) | ITM.API | ⬜ To do |
| 15 | OAuth authorization server (authorize, token, exchange endpoints) | ITM.Account | ⬜ To do |
| 16 | OAuth login/consent page | ITM.Web | ⬜ To do |
| 17 | Streamable HTTP transport (metadata, token validation, token exchange) | ITM.MCP | ✅ Done (ITM.MCP side: OAuth scaffolding, per-session auth, metadata endpoint. Awaits ITM.Account OAuth server.) |
| 18 | Write tools (`create_task`, `update_task`, `create_risk`, `create_issue`, `update_project`) | ITM.MCP | ✅ Done |
| 19 | Audit log (`tblMcpAuditLog` inserts via ITM.Account) | ITM.Account + ITM.MCP | ✅ Done (ITM.MCP side: audit client with no-op fallback. Awaits ITM.Account audit endpoint.) |
| 20 | E2E tests -- verify write tools, stale-after-write behavior, OAuth flow (Section 15) | ITM.MCP | ✅ Done (write tool E2E tests with self-contained lifecycle. OAuth E2E awaits ITM.Account.) |

### Phase 3 -- Advanced

| # | Step | Repo | Status |
|---|------|------|--------|
| 21 | `generate_insights` (AiGenerator integration) | ITM.MCP | ⬜ To do |
| 22 | `bulk_update_tasks` (batch operations) | ITM.MCP | ⬜ To do |
| 23 | Extension management tools | ITM.MCP | ⬜ To do |
| 24 | E2E tests -- verify AiGenerator integration, bulk operations (Section 15) | ITM.MCP | ⬜ To do |

---

## 15. E2E Testing

E2E tests verify MCP tools against real local services. They are not mocked -- they call the actual gateway, DataMart, and v2 REST endpoints running on the developer's machine.

### 15.1 Prerequisites

The following services must be running locally before E2E tests. Verify each one:

| Service | URL | Verify with |
|---------|-----|-------------|
| ITM.API (gateway) | `http://localhost/ITM.API/` | `curl http://localhost/ITM.API/testsmarter/login/daniel.piret@itmplatform.com1/1` |
| DataMart | `http://localhost:6142/` | Accessed through gateway -- no direct check needed |
| ITM Platform Web | `http://localhost/ITM.Web/` | Browse in browser |

Credentials, URLs, and connection details: [ENVIRONMENTS-AND-ACCESS.md](../../ENVIRONMENTS-AND-ACCESS.md).

**Credentials for testing:** Either generate an API key from My Profile in ITM Platform (set `ITM_API_KEY` in `.env`), or obtain a session token via the GUID login endpoint `GET /{company}/login/{guid}` and set `ITM_TOKEN` in `.env`. Only one is needed.

### 15.2 Server Lifecycle

```bash
# Start the MCP server in HTTP dev mode (port 6160)
npm run dev

# The server logs "MCP server listening on http://localhost:6160/mcp" when ready.
# Stop with Ctrl+C. Restart freely between test runs.
```

For a clean-build test:

```bash
npm run build && npm start -- --http --port 6160
```

### 15.3 MCP Session Setup (curl)

All E2E tests follow the Streamable HTTP protocol: POST JSON-RPC 2.0 messages to `http://localhost:6160/mcp`.

**Step 1 -- Initialize the session:**

```bash
curl -s -D - -X POST http://localhost:6160/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2025-11-25",
      "capabilities": {},
      "clientInfo": {"name": "e2e-test", "version": "1.0.0"}
    }
  }'
```

The response includes a `Mcp-Session-Id` header. Save it for all subsequent requests.

Expected response body:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocolVersion": "2025-11-25",
    "capabilities": { "tools": { "listChanged": true }, "resources": { "listChanged": true }, "prompts": { "listChanged": true } },
    "serverInfo": { "name": "itm-platform", "version": "1.0.0" }
  }
}
```

**Step 2 -- Send the initialized notification:**

```bash
curl -s -X POST http://localhost:6160/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Mcp-Session-Id: <session-id>" \
  -d '{"jsonrpc": "2.0", "method": "notifications/initialized"}'
```

**Step 3 -- List available tools (sanity check):**

```bash
curl -s -X POST http://localhost:6160/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Mcp-Session-Id: <session-id>" \
  -d '{"jsonrpc": "2.0", "id": 2, "method": "tools/list"}'
```

Verify all 20 tools are listed (15 read + 5 write).

### 15.4 Phase 1 E2E Test Cases

After session setup, test each tool. All curl commands use the same endpoint and session header. Replace `<session-id>` with the value from Step 1.

**Auth verification (implicit):** If `npm run dev` starts without errors, identity resolution succeeded. If the API key is invalid or the user is a blocked Team Member, the server exits with an error message at startup.

**search_projects -- find projects by name:**

```bash
curl -s -X POST http://localhost:6160/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Mcp-Session-Id: <session-id>" \
  -d '{
    "jsonrpc": "2.0", "id": 10,
    "method": "tools/call",
    "params": {
      "name": "search_projects",
      "arguments": {"query": "test", "limit": 5}
    }
  }'
```

Expected: `result.content` contains an array of projects with `id`, `name`, `statusLabel`. Verify count <= 5.

**get_project -- single project with subcomponents:**

```bash
curl -s -X POST http://localhost:6160/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Mcp-Session-Id: <session-id>" \
  -d '{
    "jsonrpc": "2.0", "id": 11,
    "method": "tools/call",
    "params": {
      "name": "get_project",
      "arguments": {"projectId": 75868, "include": ["tasks", "risks", "budget"]}
    }
  }'
```

Expected: project fields (`id`, `name`, `statusLabel`, `percentComplete`) plus requested subcomponent arrays. Use a known project ID from the local database.

**list_project_tasks:**

```bash
curl -s -X POST http://localhost:6160/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Mcp-Session-Id: <session-id>" \
  -d '{
    "jsonrpc": "2.0", "id": 12,
    "method": "tools/call",
    "params": {
      "name": "list_project_tasks",
      "arguments": {"projectId": 75868}
    }
  }'
```

Expected: array of tasks with `taskId`, `name`, `statusLabel`, `assignedTo`.

**get_project_risks:**

```bash
curl -s -X POST http://localhost:6160/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Mcp-Session-Id: <session-id>" \
  -d '{
    "jsonrpc": "2.0", "id": 13,
    "method": "tools/call",
    "params": {
      "name": "get_project_risks",
      "arguments": {"projectId": 75868}
    }
  }'
```

Expected: array of risks (may be empty if project has none -- that is a valid result).

**get_project_issues:**

```bash
curl -s -X POST http://localhost:6160/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Mcp-Session-Id: <session-id>" \
  -d '{
    "jsonrpc": "2.0", "id": 14,
    "method": "tools/call",
    "params": {
      "name": "get_project_issues",
      "arguments": {"projectId": 75868}
    }
  }'
```

**get_project_budget:**

```bash
curl -s -X POST http://localhost:6160/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Mcp-Session-Id: <session-id>" \
  -d '{
    "jsonrpc": "2.0", "id": 15,
    "method": "tools/call",
    "params": {
      "name": "get_project_budget",
      "arguments": {"projectId": 75868}
    }
  }'
```

Expected: budget objects (`budgetTopDown`, `budgetBottomUp`, `budgetActual`, `budgetPeriodEndClose`).

**get_project_purchases / get_project_revenues:**

```bash
curl -s -X POST http://localhost:6160/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Mcp-Session-Id: <session-id>" \
  -d '{
    "jsonrpc": "2.0", "id": 16,
    "method": "tools/call",
    "params": {
      "name": "get_project_purchases",
      "arguments": {"projectId": 75868}
    }
  }'
```

```bash
curl -s -X POST http://localhost:6160/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Mcp-Session-Id: <session-id>" \
  -d '{
    "jsonrpc": "2.0", "id": 17,
    "method": "tools/call",
    "params": {
      "name": "get_project_revenues",
      "arguments": {"projectId": 75868}
    }
  }'
```

**aggregate_portfolio -- portfolio-level analytics:**

```bash
curl -s -X POST http://localhost:6160/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Mcp-Session-Id: <session-id>" \
  -d '{
    "jsonrpc": "2.0", "id": 18,
    "method": "tools/call",
    "params": {
      "name": "aggregate_portfolio",
      "arguments": {
        "groupBy": "statusLabel",
        "metrics": ["count", "avgProgress"]
      }
    }
  }'
```

Expected: grouped aggregation results (e.g., `{"_id": "In Progress", "count": 12, "avgProgress": 45.2}`).

**search_users -- find users (v2 REST):**

```bash
curl -s -X POST http://localhost:6160/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Mcp-Session-Id: <session-id>" \
  -d '{
    "jsonrpc": "2.0", "id": 19,
    "method": "tools/call",
    "params": {
      "name": "search_users",
      "arguments": {"query": "daniel", "limit": 5}
    }
  }'
```

Expected: array of users with `userId`, `name`, `email`.

**get_user -- single user (v2 REST):**

```bash
curl -s -X POST http://localhost:6160/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Mcp-Session-Id: <session-id>" \
  -d '{
    "jsonrpc": "2.0", "id": 20,
    "method": "tools/call",
    "params": {
      "name": "get_user",
      "arguments": {"userId": 1}
    }
  }'
```

**get_reference_data -- status/type lists (v2 REST):**

```bash
curl -s -X POST http://localhost:6160/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Mcp-Session-Id: <session-id>" \
  -d '{
    "jsonrpc": "2.0", "id": 21,
    "method": "tools/call",
    "params": {
      "name": "get_reference_data",
      "arguments": {"entity": "projectstatuses"}
    }
  }'
```

Expected: array of status objects with `id`, `name`.

**query_datamart -- raw GraphQL (advanced):**

```bash
curl -s -X POST http://localhost:6160/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Mcp-Session-Id: <session-id>" \
  -d '{
    "jsonrpc": "2.0", "id": 22,
    "method": "tools/call",
    "params": {
      "name": "query_datamart",
      "arguments": {
        "operation": "components",
        "where": {"componentType": {"$eq": "project"}, "percentComplete": {"$gte": 50}},
        "project": {"id": 1, "name": 1, "percentComplete": 1},
        "limit": 5
      }
    }
  }'
```

Expected: array of projects with >= 50% completion. Verify the query validator rejects disallowed operators (test with `$lookup` or `$where` -- should return an error).

**Negative test -- blocked operator:**

```bash
curl -s -X POST http://localhost:6160/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Mcp-Session-Id: <session-id>" \
  -d '{
    "jsonrpc": "2.0", "id": 23,
    "method": "tools/call",
    "params": {
      "name": "query_datamart",
      "arguments": {
        "operation": "aggregateComponents",
        "pipeline": [{"$lookup": {"from": "users", "localField": "userId", "foreignField": "_id", "as": "user"}}]
      }
    }
  }'
```

Expected: error response indicating `$lookup` is not allowed.

### 15.5 Phase 2 E2E Additions

Phase 2 adds write tool tests. These are self-contained: `beforeAll` creates a test project via direct REST, tests operate on it, and `afterAll` cleans up leaf-to-top (risks -> issues -> tasks -> project).

| Test | What to verify |
|------|---------------|
| `create_task` | Returns confirmed state (Id, StatusMessage) and stale-after-write notice. Requires `StartDate` + `EndDate`. |
| `update_task` | PATCH succeeds on the task created above. Returns two content items (JSON + notice). |
| `create_risk` | Sends required reference IDs (TypeId, StatusId, etc.) fetched dynamically. API may reject with validation errors depending on environment -- the test verifies the tool handles both success and structured error responses. |
| `create_issue` | Same pattern as create_risk -- sends TypeId + StatusId, handles success or API validation error. |
| `update_project` | PATCH project description. Returns confirmed state + stale notice. |
| All write responses | Two content items: `content[0]` is JSON data from v2 REST, `content[1]` is the stale-after-write notice. |

**OAuth flow** (not yet testable): Initialize session with OAuth Bearer token instead of API key. Awaits ITM.Account OAuth server deployment.

Write tests clean up after themselves -- `afterAll` deletes created entities leaf-to-top to avoid polluting the local database. Each delete is wrapped in try/catch so partial cleanup failure does not mask test results.

### 15.6 Automated E2E Tests

The manual curl tests above are codified as automated tests in `tests/e2e/`:

```
tests/e2e/
  setup.ts               # Connect to running server (or spawn one), initialize MCP session, load .env, export helpers
  auth.e2e.test.ts       # Session initialization, tool listing verification (all 20 tools)
  projects.e2e.test.ts   # search_projects, get_project
  tasks.e2e.test.ts      # list_project_tasks
  financials.e2e.test.ts # budget, purchases, revenues
  risks-issues.e2e.test.ts  # get_project_risks, get_project_issues
  portfolio.e2e.test.ts  # aggregate_portfolio
  users.e2e.test.ts      # search_users, get_user
  reference.e2e.test.ts  # get_reference_data
  datamart.e2e.test.ts   # query_datamart + validator negative tests
  write-tools.e2e.test.ts  # Phase 2: create/update task, risk, issue, project (self-contained lifecycle)
```

Run with:

```bash
npm run test:e2e
```

The test runner starts the MCP server on port 6160 (if not already running), runs all test files, and reports results. Tests use the same HTTP calls as the curl examples above, wrapped in Vitest assertions.

**Test configuration:** `vitest.e2e.config.ts` sets a longer timeout (30 seconds per test), points at the E2E test directory, and reads `.env.test` for test-specific credentials if needed.
