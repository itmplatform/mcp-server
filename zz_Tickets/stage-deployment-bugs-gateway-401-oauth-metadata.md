# Ticket: Stage Deployment Bugs -- OAuth Metadata Localhost URL + Double Slash

Created: 2026-05-27
Severity: High (blockers for AI client connectivity)
Area: ITM.MCP (server.ts, oauth-metadata.ts, .env files), ITM.Account (Web.stage.config)

## Summary

First deployment of ITM.MCP to stage (2026-05-27) revealed four bugs that prevent AI clients from discovering the OAuth authorization server.

| # | Bug | Severity | Fix in | Status |
|---|-----|----------|--------|--------|
| 1 | OAuth metadata advertises `http://localhost/ITM.API` as authorization server | Blocker | server.ts, .env files | **FIXED** |
| 2 | Double slash in `resource_metadata` URL in 401 WWW-Authenticate header | Blocker | server.ts, oauth-metadata.ts | **FIXED** |
| 4 | RFC 8414 discovery URL returns 404 on stage (path-inserted vs path-appended) | Blocker | Stage IIS URL Rewrite (stage-only) | **FIXED on VM** |
| 5 | OAuth metadata served as `application/octet-stream` instead of `application/json` | High | ITM.Account OAuthController.cs | Separate ticket |

**Related ITM.Web bug (separate ticket):** The API gateway crashes (500) when relaying 401 from the MCP server. That fix (`TrySkipIisCustomErrors`) must be deployed first. See `ITM.Web/zz_Tickets/2026-05-27-gateway-500-on-401-relay.md`.

---

## Bug 1: OAuth Metadata Advertises Localhost as Authorization Server

### Symptom

The `/.well-known/oauth-protected-resource` endpoint returns:

```json
{
  "resource": "https://new-api.itmplatform.com/revamping/v2/_/mcp/",
  "authorization_servers": ["http://localhost/ITM.API"],
  "scopes_supported": ["mcp:read", "mcp:write"]
}
```

AI clients (running on a user's machine) read `authorization_servers` and try to reach `http://localhost/ITM.API/.well-known/oauth-authorization-server`, which does not exist on their machine.

### Reproduction

```powershell
Invoke-RestMethod -Uri "https://new-api.itmplatform.com/revamping/v2/_/mcp/.well-known/oauth-protected-resource"
# Returns authorization_servers: ["http://localhost/ITM.API"]
```

### Root cause

`ITM_AUTH_URL` serves two purposes:

1. **Internal token exchange** (server-to-server on the VM): `${ITM_AUTH_URL}/auth/exchange-token` -- needs to be `http://localhost/ITM.API`
2. **OAuth discovery metadata** (advertised to external clients): `authorization_servers` array -- needs to be the public URL

Both are sourced from the same env var.

In `src/server.ts` (line 157):
```typescript
const metadata = buildProtectedResourceMetadata({
  mcpServerUrl: process.env.MCP_SERVER_URL!,
  authorizationServerUrl: process.env.ITM_AUTH_URL!,  // localhost!
});
```

In `src/auth/oauth-metadata.ts` (line 13):
```typescript
authorization_servers: [config.authorizationServerUrl],  // exposes localhost
```

### Why it was not caught locally

Locally, `ITM_AUTH_URL=http://localhost/ITM.API` is correct because the AI client IS running on the same machine. The bug only manifests when the MCP server is deployed behind a public URL but uses localhost for internal API calls.

**Note on local RFC 8414 discovery:** The local `ITM_AUTH_URL=http://localhost/ITM.API` has a path component. Strictly per RFC 8414, the discovery URL should be `http://localhost/.well-known/oauth-authorization-server/ITM.API` (path-inserted), not `http://localhost/ITM.API/.well-known/oauth-authorization-server` (path-appended). The MCP TypeScript SDK (`@modelcontextprotocol/sdk` v1.29.0, `buildDiscoveryUrls` in `client/auth.js`) implements RFC 8414 correctly and will try the path-inserted URL first. If that returns 404, the SDK has no OAuth fallback at the path-appended location -- so a strict MCP client would fail locally too. This is a known dev-environment limitation already documented in [SPEC_OAUTH_AUTHORIZATION_SERVER.md](../../ITM.Account/ITM.Account/zz_Specifications/done/SPEC_OAUTH_AUTHORIZATION_SERVER.md). Deferred as a local-dev issue -- does not affect deployed environments where prod/demo use pathless issuer URLs.

### Fix

Add a new env var `ITM_AUTH_PUBLIC_URL` for the public-facing authorization server URL. Use `ITM_AUTH_URL` for internal calls and `ITM_AUTH_PUBLIC_URL` for the OAuth metadata.

**1. Update env files:**

| File | New var |
|------|---------|
| `.env.stage` | `ITM_AUTH_PUBLIC_URL=https://new-api.itmplatform.com/revamping` |
| `.env.demo` | `ITM_AUTH_PUBLIC_URL=https://demo-api.itmplatform.com` |
| `.env.prod` | `ITM_AUTH_PUBLIC_URL=https://api.itmplatform.com` |
| `.env` (local) | `ITM_AUTH_PUBLIC_URL=http://localhost/ITM.API` (same as ITM_AUTH_URL) |
| `.env.sample` | Document both vars |

**2. Update `src/server.ts`** (line 157):
```typescript
const metadata = buildProtectedResourceMetadata({
  mcpServerUrl: process.env.MCP_SERVER_URL!,
  authorizationServerUrl: process.env.ITM_AUTH_PUBLIC_URL || process.env.ITM_AUTH_URL!,
});
```

The 401 `WWW-Authenticate` header (lines 186, 201) uses `MCP_SERVER_URL` which is already the public URL, so no change needed there.

**3. `src/startup-mode.ts`** -- no change needed (it only uses `ITM_AUTH_URL` for the internal token exchange URL).

### Correct values per environment

| Env | `ITM_AUTH_URL` (internal) | `ITM_AUTH_PUBLIC_URL` (advertised) |
|-----|---------------------------|------------------------------------|
| Local | `http://localhost/ITM.API` | `http://localhost/ITM.API` |
| Stage | `http://localhost/ITM.API` | `https://new-api.itmplatform.com/revamping` |
| Demo | `http://localhost/ITM.API` | `https://demo-api.itmplatform.com` |
| Prod | `http://localhost/ITM.API` | `https://api.itmplatform.com` |

### Verification

```powershell
# Stage: authorization_servers should show public URL
Invoke-RestMethod -Uri "https://new-api.itmplatform.com/revamping/v2/_/mcp/.well-known/oauth-protected-resource"
# Expected: authorization_servers: ["https://new-api.itmplatform.com/revamping"]

# Verify the OAuth discovery chain works end-to-end:
Invoke-RestMethod -Uri "https://new-api.itmplatform.com/revamping/.well-known/oauth-authorization-server"
# Expected: JSON with token_endpoint, authorization_endpoint, registration_endpoint, etc.
```

**Status: FIXED** -- Added `ITM_AUTH_PUBLIC_URL` env var. `server.ts` uses `ITM_AUTH_PUBLIC_URL || ITM_AUTH_URL` when building metadata. All `.env.*` files updated.

---

## Bug 2: Double Slash in resource_metadata URL

**Severity: Blocker** -- the `resource_metadata` URL in the 401 challenge is the only OAuth discovery mechanism for MCP clients. A broken URL blocks all compliant AI clients from connecting.

### Symptom

The 401 `WWW-Authenticate` header contains a double slash in the resource_metadata URL:

```
Bearer resource_metadata="https://new-api.itmplatform.com/revamping/v2/_/mcp//.well-known/oauth-protected-resource"
```

Note: `mcp//.well-known` -- double slash.

### Reproduction

On stage VM (direct access to confirm it's the MCP server, not the gateway):
```bash
# SSH to DemoAz2 (20.67.82.41), then:
curl -s -i -X POST http://localhost:3170/ \
  -H "Content-Type: application/json" -H "Accept: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'
# WWW-Authenticate: Bearer resource_metadata="https://new-api.itmplatform.com/revamping/v2/_/mcp//.well-known/oauth-protected-resource"
```

### Root cause

In `src/server.ts` (lines 186 and 201):
```typescript
const resourceMetadataUrl = `${process.env.MCP_SERVER_URL!}/.well-known/oauth-protected-resource`;
```

`MCP_SERVER_URL` in `.env.stage` ends with a trailing slash:
```
MCP_SERVER_URL=https://new-api.itmplatform.com/revamping/v2/_/mcp/
```

Concatenating with `/.well-known/...` produces `mcp//.well-known/...`.

### Why it was not caught locally

The local `.env` has `MCP_SERVER_URL=http://localhost:6170` (no trailing slash), so the local 401 header is correct:

```powershell
# Local 401 header -- no double slash:
# WWW-Authenticate: Bearer resource_metadata="http://localhost:6170/.well-known/oauth-protected-resource"
```

### Fix

Strip trailing slash from `MCP_SERVER_URL` when building the URL. In `src/server.ts`, replace both occurrences (lines 186 and 201):

```typescript
// Before:
const resourceMetadataUrl = `${process.env.MCP_SERVER_URL!}/.well-known/oauth-protected-resource`;

// After:
const mcpBase = process.env.MCP_SERVER_URL!.replace(/\/+$/, '');
const resourceMetadataUrl = `${mcpBase}/.well-known/oauth-protected-resource`;
```

Extract into a helper or compute once at startup to avoid duplication.

### Verification

```powershell
# After fix, the 401 header should have no double slash:
# Bearer resource_metadata="https://new-api.itmplatform.com/revamping/v2/_/mcp/.well-known/oauth-protected-resource"
```

### Note on RFC 9728 compliance

The fixed `resource_metadata` URL uses path-appended format:
```
https://new-api.itmplatform.com/revamping/v2/_/mcp/.well-known/oauth-protected-resource
```

RFC 9728 specifies a path-inserted format for derived discovery:
```
https://new-api.itmplatform.com/.well-known/oauth-protected-resource/revamping/v2/_/mcp/
```

This is **not a functional blocker**. MCP clients receive the `resource_metadata` URL directly from the 401 `WWW-Authenticate` challenge header and follow it as-is -- they do not derive it per RFC 9728. As long as the path-appended URL resolves (which it does), clients work.

However, the path-inserted URL is **not easy to fix**: it lives at the domain root, outside the MCP server's gateway route (`v2/{AccountId}/mcp/{*pathInfo}`). Supporting it would require adding a new IIS rewrite rule or gateway route for `/.well-known/oauth-protected-resource/...`. Deferred -- revisit only if a client is found that ignores the `resource_metadata` hint and tries RFC 9728 derivation.

**Status: FIXED** -- Extracted `buildResourceMetadataUrl()` helper in `oauth-metadata.ts` that strips trailing slashes. Both 401 paths in `server.ts` now call this helper. The `resource` field in the metadata is also normalized.

---

## Bug 4: RFC 8414 Discovery URL Returns 404 on Stage

**Severity: Blocker** (stage-only) -- AI clients cannot discover the authorization server because the RFC 8414 path-inserted discovery URL is not served.

### Symptom

When `authorization_servers` advertises `https://new-api.itmplatform.com/revamping`, the MCP TypeScript SDK builds the RFC 8414 path-inserted discovery URL:

```
https://new-api.itmplatform.com/.well-known/oauth-authorization-server/revamping
```

This URL returns **404** on stage. The path-appended URL that the ITM.Account app actually serves:

```
https://new-api.itmplatform.com/revamping/.well-known/oauth-authorization-server
```

is never tried by the SDK for OAuth discovery (only for OIDC fallbacks).

### Root cause

The ITM.Account app is deployed under the `/revamping` IIS virtual directory on stage. RFC 8414 Section 3 specifies that when the issuer has a path component, the well-known URL uses path insertion: `/.well-known/oauth-authorization-server/{path}`. But IIS only routes `/revamping/*` to the app, so the path-inserted URL at the site root is unhandled.

**This is a stage-only issue.** Prod and demo deploy ITM.Account at the site root (no path prefix), so the discovery URL has no path to insert and works correctly.

### Evidence: MCP SDK discovery behavior

From `@modelcontextprotocol/sdk` v1.29.0 (`node_modules/@modelcontextprotocol/sdk/dist/esm/client/auth.js`, `buildDiscoveryUrls` at line 550):

For issuer `https://new-api.itmplatform.com/revamping`, the SDK tries these URLs in order:

| # | URL | Type | Result on stage |
|---|-----|------|-----------------|
| 1 | `https://new-api.itmplatform.com/.well-known/oauth-authorization-server/revamping` | OAuth (RFC 8414) | **404** |
| 2 | `https://new-api.itmplatform.com/.well-known/openid-configuration/revamping` | OIDC (RFC 8414) | 404 |
| 3 | `https://new-api.itmplatform.com/revamping/.well-known/openid-configuration` | OIDC Discovery 1.0 | 404 |

The SDK stops after all three fail. It never tries the path-appended OAuth URL (`/revamping/.well-known/oauth-authorization-server`).

### Fix

Add one IIS URL Rewrite rule on the stage site root to map the RFC 8414 path-inserted URL to the path the app handles:

```xml
<!-- Add to the root web.config of the stage IIS site (not the /revamping app) -->
<system.webServer>
  <rewrite>
    <rules>
      <rule name="RFC8414 OAuth AS discovery for /revamping" stopProcessing="true">
        <match url="^\.well-known/oauth-authorization-server/revamping$" />
        <action type="Rewrite" url="/revamping/.well-known/oauth-authorization-server" />
      </rule>
    </rules>
  </rewrite>
</system.webServer>
```

Or via IIS Manager: URL Rewrite > Add Rule > Blank Rule:
- Pattern: `^\.well-known/oauth-authorization-server/revamping$`
- Action: Rewrite to `/revamping/.well-known/oauth-authorization-server`
- Stop processing: Yes

**Status: Applied on stage VM** (2026-05-27). The IIS URL Rewrite module was already installed. The rule was added to `C:\inetpub\wwwroot\new-api.itmplatform.com\web.config` (the API site root, NOT the web site root at `new.itmplatform.com`).

### Verification

```powershell
# After adding the rewrite rule:
Invoke-RestMethod -Uri "https://new-api.itmplatform.com/.well-known/oauth-authorization-server/revamping"
# Expected: same JSON as https://new-api.itmplatform.com/revamping/.well-known/oauth-authorization-server
# (token_endpoint, authorization_endpoint, registration_endpoint with /revamping paths)
```

### Why this doesn't affect prod/demo

| Env | IIS path | Issuer | RFC 8414 discovery URL | Works? |
|-----|----------|--------|------------------------|--------|
| Local | `/ITM.API` | `http://localhost/ITM.API` | `http://localhost/.well-known/oauth-authorization-server/ITM.API` | No (known dev limitation) |
| Stage | `/revamping` | `https://new-api.itmplatform.com/revamping` | `https://new-api.itmplatform.com/.well-known/oauth-authorization-server/revamping` | No -- **needs rewrite** |
| Demo | `/` (root) | `https://demo-api.itmplatform.com` | `https://demo-api.itmplatform.com/.well-known/oauth-authorization-server` | Yes (no path to insert) |
| Prod | `/` (root) | `https://api.itmplatform.com` | `https://api.itmplatform.com/.well-known/oauth-authorization-server` | Yes (no path to insert) |

---

## Bug 5: OAuth Metadata Served as `application/octet-stream`

**Severity: High** -- RFC 8414 requires `application/json`. Some clients may reject the response or fail to parse it.

### Symptom

The `/.well-known/oauth-authorization-server` endpoint on stage returns the correct JSON body but with the wrong Content-Type header:

```
Content-Type: application/octet-stream; charset=utf-8
```

RFC 8414 Section 3.2 requires `application/json`.

### Root cause

`OAuthController.GetMetadata()` returns `Ok(metadata)`, which delegates Content-Type to ASP.NET Web API content negotiation. A global config line in `WebApiConfig.cs` (lines 22-23) inserts `application/octet-stream` at position 0 of the JSON formatter's media type list, making it the default for all `Accept: */*` requests. See `ITM.Account/zz_Tickets/2026-05-27-webapi-content-type-octet-stream.md` for root cause analysis and long-term fix options.

### Immediate fix

In `OAuthController.cs`, return with an explicit Content-Type:

```csharp
// Before:
return Ok(metadata);

// After:
return Content(HttpStatusCode.OK, metadata, Configuration.Formatters.JsonFormatter, "application/json");
```

Apply the same pattern to any other OAuth endpoint that returns JSON (token, register, etc.).

### Verification

```powershell
$r = Invoke-WebRequest -Uri "https://new-api.itmplatform.com/revamping/.well-known/oauth-authorization-server" -UseBasicParsing
$r.Headers["Content-Type"]
# Expected: application/json; charset=utf-8
# NOT: application/octet-stream; charset=utf-8
```

---

## Deployment Context

### What's working on stage

| Test | Via Gateway (public URL) | Direct (localhost on VM) |
|------|--------------------------|--------------------------|
| `GET /health` | 200 `{"status":"ok"}` | 200 `{"status":"ok"}` |
| `GET /.well-known/oauth-protected-resource` | 200 (returns metadata) | 200 (returns metadata) |
| PM2 processes MCPStage + MCPDemo | Online | -- |
| `POST /` (initialize, no Bearer) | **500** (ITM.Web bug) | 401 (correct) |

### Environment details

- Stage VM: DemoAz2 (`20.67.82.41`), PM2 apps MCPStage (port 3170) + MCPDemo (port 2170)
- Stage public URL: `https://new-api.itmplatform.com/revamping/v2/_/mcp/`
- Demo public URL: `https://demo-api.itmplatform.com/v2/_/mcp/`
- Local dev: `http://localhost:6170/` direct, `http://localhost/ITM.API/v2/_/mcp/` via gateway

### SSH access for stage VM debugging

```powershell
# Load password from ..\.env > SSH_STAGE_PASSWORD
& "C:\Program Files\PuTTY\plink.exe" -ssh ITMPlatformAdmin@20.67.82.41 -pw $env:SSH_STAGE_PASSWORD -batch "<command>"

# Useful commands:
# PM2 status:   pm2 list
# MCP logs:     type C:\inetpub\wwwroot\ITM.MCP\logs\mcp.1.log
# Direct curl:  curl -s http://localhost:3170/health
# Ecosystem:    type C:\inetpub\wwwroot\ecosystem.config.js
```

---

## Fix Order

1. **ITM.Web bug** -- gateway 500 on 401 relay. See `ITM.Web/zz_Tickets/2026-05-27-gateway-500-on-401-relay.md` (being developed). Deploy ITM.Web to stage.
2. ~~**Bug 4 (this ticket):** Add IIS URL Rewrite rule on stage site root.~~ **DONE** (2026-05-27)
3. ~~**Bug 2 (this ticket):** Strip trailing slash from `MCP_SERVER_URL`.~~ **DONE** -- `buildResourceMetadataUrl()` helper in `oauth-metadata.ts`
4. ~~**Bug 1 (this ticket):** Add `ITM_AUTH_PUBLIC_URL` env var.~~ **DONE** -- `server.ts` + all `.env.*` files updated
5. **Bug 5:** Fix Content-Type on OAuth metadata endpoint. Separate ticket: `ITM.Account/zz_Tickets/2026-05-27-webapi-content-type-octet-stream.md`
6. Re-deploy ITM.MCP to stage.
7. Run the full curl test battery below.

---

## Full Curl Test Battery (after all fixes across both repos)

```bash
# === Through API Gateway (public URL) ===

# 1. Health check
curl -s https://new-api.itmplatform.com/revamping/v2/_/mcp/health
# Expected: {"status":"ok"}

# 2. OAuth protected resource metadata
curl -s https://new-api.itmplatform.com/revamping/v2/_/mcp/.well-known/oauth-protected-resource
# Expected: {"resource":"...","authorization_servers":["https://new-api.itmplatform.com/revamping"],"scopes_supported":["mcp:read","mcp:write"]}

# 3. Unauthenticated initialize -- 401 with discovery headers
curl -s -i -X POST https://new-api.itmplatform.com/revamping/v2/_/mcp/ \
  -H "Content-Type: application/json" -H "Accept: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"curl-test","version":"1.0"}}}'
# Expected: HTTP 401
# WWW-Authenticate: Bearer resource_metadata="https://new-api.itmplatform.com/revamping/v2/_/mcp/.well-known/oauth-protected-resource"
# {"error":"Authentication required"}

# 4. OAuth discovery chain (Bug 3 verification -- endpoints must include /revamping)
curl -s https://new-api.itmplatform.com/revamping/.well-known/oauth-authorization-server
# Expected: JSON with endpoints including /revamping path:
#   token_endpoint: "https://new-api.itmplatform.com/revamping/oauth/token"
#   authorization_endpoint: "https://new-api.itmplatform.com/revamping/oauth/authorize"
#   registration_endpoint: "https://new-api.itmplatform.com/revamping/oauth/register"
# NOT: "https://new-api.itmplatform.com/oauth/token" (missing /revamping = Bug 3)

# 5. RFC 8414 path-inserted discovery (Bug 4 verification -- stage-only rewrite rule)
curl -s https://new-api.itmplatform.com/.well-known/oauth-authorization-server/revamping
# Expected: same JSON as test #4 (token_endpoint with /revamping, etc.)
# If 404: IIS URL Rewrite rule is missing on stage site root

# 6. Content-Type check (Bug 5 verification)
curl -s -I https://new-api.itmplatform.com/revamping/.well-known/oauth-authorization-server
# Expected: Content-Type: application/json; charset=utf-8
# NOT: Content-Type: application/octet-stream; charset=utf-8

# 7. Demo health check
curl -s https://demo-api.itmplatform.com/v2/_/mcp/health
# Expected: {"status":"ok"}

# === Local (bypass gateway) ===

# 8. Health
curl -s http://localhost:6170/health
# Expected: {"status":"ok"}

# 9. OAuth metadata
curl -s http://localhost:6170/.well-known/oauth-protected-resource
# Expected: authorization_servers with correct URL

# 10. 401 rejection
curl -s -i -X POST http://localhost:6170/ \
  -H "Content-Type: application/json" -H "Accept: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'
# Expected: 401

# === Local through gateway (verifies ITM.Web fix) ===

# 11. 401 through gateway
curl -s -i -X POST http://localhost/ITM.API/v2/_/mcp/ \
  -H "Content-Type: application/json" -H "Accept: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'
# Expected: 401 (not 500)
```
