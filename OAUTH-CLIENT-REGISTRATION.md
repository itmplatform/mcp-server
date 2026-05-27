# OAuth Client Registration -- AI Client Compatibility

> **Last updated:** 2026-05-26
> **Purpose:** Durable reference for how each AI client handles OAuth when connecting to MCP servers over HTTP. Informs what ITM.MCP's authorization server must support.

---

## How MCP OAuth client registration works

When an AI client (Claude Desktop, Codex, VS Code, etc.) connects to an MCP server over HTTP, it needs to authenticate users via OAuth 2.1. The first step is **client registration** -- the AI client must obtain a `client_id` that the authorization server recognizes.

The MCP spec (draft, 2025-06-18) defines three registration mechanisms in priority order:

| Priority | Mechanism | Spec level | How it works |
|----------|-----------|------------|--------------|
| 1 | **Pre-registered credentials** | SHOULD support | Server operator manually inserts a `client_id` + `redirect_uri` into the auth server's database. The AI client is configured with that `client_id`. |
| 2 | **Client ID Metadata Documents (CIMD)** | SHOULD support | The `client_id` is an HTTPS URL (e.g. `https://app.example.com/oauth/client-metadata.json`). The auth server fetches that URL at authorization time to validate the client. No prior registration needed. |
| 3 | **Dynamic Client Registration (DCR, RFC 7591)** | MAY support | The AI client POSTs to a `/register` endpoint to self-register and receive a `client_id` at runtime. Originally SHOULD in the 2025-03-26 spec, downgraded to MAY for backwards compatibility only. |

**The reality gap:** The spec prefers CIMD, but as of May 2026, **no major AI client has shipped CIMD support**. Every client relies on DCR as its primary (or only) mechanism. Without DCR, none of them can complete the OAuth flow.

Sources:
- [MCP Authorization Spec (draft)](https://modelcontextprotocol.io/specification/draft/basic/authorization)
- [Evolving OAuth Client Registration in MCP](https://blog.modelcontextprotocol.io/posts/client_registration/)
- [MCP spec GitHub -- authorization.mdx (2025-06-18)](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2025-06-18/basic/authorization.mdx)

---

## Per-client research

### Claude Code / Claude Desktop

| Field | Value |
|-------|-------|
| Registration | **DCR only** (no static client_id, no CIMD yet) |
| `redirect_uri` | `http://localhost:<random-port>/callback` or `http://127.0.0.1:<random-port>/callback` |
| PKCE | Yes, S256 (mandatory) |
| Known bugs | Ignores `redirect_uris` returned by DCR, always uses localhost ([#10439](https://github.com/anthropics/claude-code/issues/10439)). Fails loudly when DCR is unavailable ([#52638](https://github.com/anthropics/claude-code/issues/52638)). |

Claude Code's SDK attempts DCR first and fails with "does not support dynamic client registration" when the auth server lacks a `registration_endpoint`. There is no fallback to a pre-registered `client_id`.

The redirect URI uses a random ephemeral port -- the auth server must accept any `http://localhost:<port>/callback` or `http://127.0.0.1:<port>/callback` per RFC 8252 (OAuth for Native Apps).

Sources:
- [Claude Code Issue #10439](https://github.com/anthropics/claude-code/issues/10439)
- [Claude Code Issue #52638](https://github.com/anthropics/claude-code/issues/52638)
- [Claude Code Issue #38102](https://github.com/anthropics/claude-code/issues/38102)

### OpenAI Codex CLI

| Field | Value |
|-------|-------|
| Registration | **DCR only** (no static client_id support) |
| `redirect_uri` | `http://localhost:<random-port>/callback` (configurable via `mcp_oauth_callback_port` and `mcp_oauth_callback_url`) |
| PKCE | Yes, S256 |
| Known bugs | `resource` indicator (RFC 8707) sometimes omitted ([#13891](https://github.com/openai/codex/issues/13891)). Scopes not sent during DCR ([#20503](https://github.com/openai/codex/issues/20503)). |

Codex always attempts DCR. If the auth server does not support it, the flow fails with "Registration failed: Dynamic client registration not supported." There is no fallback. Config options exist to fix the port or override the callback URL for remote/devbox environments.

Sources:
- [Codex Issue #19154](https://github.com/openai/codex/issues/19154)
- [Codex Issue #15818](https://github.com/openai/codex/issues/15818)
- [Codex Config Reference](https://developers.openai.com/codex/config-reference)

### VS Code (Copilot)

| Field | Value |
|-------|-------|
| Registration | **DCR first**, falls back to hardcoded `client_id`: `aebc6443-996d-45c2-90f0-388ff96faa56` |
| `redirect_uri` | `https://vscode.dev/redirect`, `https://insiders.vscode.dev/redirect`, `http://127.0.0.1/`, `http://127.0.0.1:33418/` |
| PKCE | Yes, always |
| Known bugs | Port 33418 collision causes redirect_uri mismatch ([#278512](https://github.com/microsoft/vscode/issues/278512)). RFC 9728 discovery order not respected ([#273655](https://github.com/microsoft/vscode/issues/273655)). |

VS Code attempts DCR first. If DCR fails, it uses a built-in client_id originally meant for Microsoft Graph API -- this is not useful for non-Microsoft auth servers. A feature request for custom static client_id config exists but is not yet shipped ([#252892](https://github.com/microsoft/vscode/issues/252892)).

VS Code registers four redirect URIs during DCR. The `vscode.dev/redirect` URIs are HTTPS (web-based flow); the `127.0.0.1` URIs are loopback (desktop flow).

Sources:
- [VS Code Issue #278512](https://github.com/microsoft/vscode/issues/278512)
- [VS Code Issue #252892](https://github.com/microsoft/vscode/issues/252892)
- [VS Code MCP developer guide](https://code.visualstudio.com/api/extension-guides/ai/mcp)
- [VS Code blog: Full MCP spec support (June 2025)](https://code.visualstudio.com/blogs/2025/06/12/full-mcp-spec-support)

### Cursor

| Field | Value |
|-------|-------|
| Registration | **DCR only** (CIMD not yet shipped) |
| `redirect_uri` | `cursor://anysphere.cursor-mcp/oauth/callback` (custom scheme) + `http://127.0.0.1:<port>/callback` (loopback fallback) |
| PKCE | Yes, S256 |
| Known bugs | Re-registers on each session instead of reusing stored credential. Browser window sometimes fails to open after DCR. |

Cursor registers two redirect URIs via DCR: a custom `cursor://` deep-link scheme and a loopback fallback. The auth server must accept both URI patterns.

Sources:
- [Cursor forum: PKCE OAuth failing DCR](https://forum.cursor.com/t/pkce-oauth-flow-with-custom-mcp-server-failing-dynamic-client-registration-on-v3-3-30/160328)
- [Cursor forum: Working solution with Entra ID](https://forum.cursor.com/t/working-solution-mcp-server-oauth-with-microsoft-entra-id-on-azure-container-apps/151813)

### JetBrains IDEs

| Field | Value |
|-------|-------|
| **Native AI Assistant** | No OAuth support for MCP documented as of May 2026 |
| **GitHub Copilot plugin** | DCR first, falls back to static credentials. Redirect URI not published. |
| PKCE | Implied by OAuth 2.1 compliance (Copilot plugin) |

The native JetBrains AI Assistant can connect to remote MCP servers over Streamable HTTP but does not appear to support OAuth. The GitHub Copilot plugin for JetBrains does support OAuth via DCR with a static-credentials fallback.

Sources:
- [GitHub Changelog: Enhanced MCP OAuth for JetBrains (Nov 2025)](https://github.blog/changelog/2025-11-18-enhanced-mcp-oauth-support-for-github-copilot-in-jetbrains-eclipse-and-xcode/)
- [JetBrains AI Assistant MCP docs](https://www.jetbrains.com/help/ai-assistant/mcp.html)

---

## Summary matrix

| Client | Registration method | `redirect_uri` pattern | PKCE | CIMD | Static client_id |
|--------|--------------------|-----------------------|------|------|-----------------|
| Claude Code | DCR | `http://localhost:<port>/callback` | Yes | No | No |
| Codex CLI | DCR | `http://localhost:<port>/callback` | Yes | No | No |
| VS Code | DCR (fallback: hardcoded) | `https://vscode.dev/redirect` + `http://127.0.0.1:33418/` | Yes | No | Requested |
| Cursor | DCR | `cursor://...` + `http://127.0.0.1:<port>/callback` | Yes | No | No |
| JetBrains (native) | N/A | N/A | N/A | N/A | N/A |
| JetBrains (Copilot) | DCR (fallback: static) | Not published | Yes | No | Yes (fallback) |

---

## What ITM.Account implements (done)

The authorization server (ITM.Account) implements DCR as of 2026-05-26:

1. **`POST /oauth/register`** -- accepts a DCR request, creates a row in `tblOAuthClient`, returns `dcr_`-prefixed `client_id`
2. **`registration_endpoint`** in `/.well-known/oauth-authorization-server` metadata -- clients discover the DCR endpoint
3. **Localhost redirect URI validation** per RFC 8252 -- accepts any port for `localhost`/`127.0.0.1`/`::1`
4. **HTTPS redirect URI support** -- accepts `https://vscode.dev/redirect` and similar
5. **PKCE S256 enforcement** -- mandatory for all public clients
6. **Registered-scope enforcement** -- tokens cannot exceed the scope registered at DCR time
7. **Stale client cleanup** -- dynamic clients with no token issued in 30 days are purged

### Not yet implemented

- **Custom URI scheme support** (`cursor://...`) -- deferred to v2; Cursor falls back to loopback
- **DCR-specific rate limiter** -- existing general throttler covers baseline; tune from telemetry
- **CIMD** -- no AI client ships it yet

### Security mitigations in place

- 8192-byte request body cap (at proxy and controller)
- PKCE S256 enforcement (no plain)
- Refresh token rotation with family revocation
- 30-day stale dynamic client cleanup
- General IP-based request throttling via `RequestThrottler`/`CustomThrottlingHandler`

### Redirect URI validation rules

The auth server must enforce:

| URI type | Validation rule |
|----------|----------------|
| `http://localhost:<port>/...` | Accept any port. Match host `localhost` or `127.0.0.1`. Path must match exactly. |
| `https://<domain>/...` | Exact match against the registered URI (no wildcards). |
| `<custom-scheme>://...` | Exact match against the registered URI. |

Per RFC 8252 Section 7.3, loopback redirect URIs are allowed to vary by port. The auth server should compare scheme, host, and path but **ignore the port** for `localhost` and `127.0.0.1`.

### CIMD (future)

When AI clients start shipping CIMD support, ITM.Account should:

1. Set `client_id_metadata_document_supported: true` in AS metadata (currently `false`)
2. When the `client_id` in an authorization request is an HTTPS URL, fetch it and validate the metadata document
3. Cache the fetched document with appropriate TTL

This is not blocking for initial deployment since no client supports it yet.

---

## Current status

> **Updated:** 2026-05-27

| Item | Status | Notes |
|------|--------|-------|
| Pre-registered E2E test client | Done | `e2e-test-client` seeded in `deployment.sql` |
| DCR endpoint (`POST /oauth/register`) | **Done** | Implemented 2026-05-26. 47 unit tests + 6 integration tests. See [SPEC_DYNAMIC_CLIENT_REGISTRATION.md](../ITM.Account/ITM.Account/zz_Specifications/done/SPEC_DYNAMIC_CLIENT_REGISTRATION.md). |
| `registration_endpoint` in AS metadata | **Done** | Advertised in `/.well-known/oauth-authorization-server` |
| RFC 8252 loopback port matching | **Done** | `MatchesRedirectUri()` ignores port for `localhost`/`127.0.0.1`/`::1` |
| HTTPS redirect URIs | **Done** | Accepts `https://` redirect URIs with host validation |
| MCP `WWW-Authenticate` discovery | **Done** | 401 responses include `resource_metadata` URL for OAuth discovery |
| Custom URI scheme (`cursor://`) | Deferred | Rejected in v1. See [SPEC_DCR_DEFERRED_ITEMS.md](../ITM.Account/ITM.Account/zz_Specifications/SPEC_DCR_DEFERRED_ITEMS.md) |
| CIMD support | Deferred | No client ships it yet |
| DCR-specific rate limiter | Deferred | Existing general throttler covers baseline |
| E2E Playwright tests for DCR | Deferred | Build before first production deployment |
| Manual real-client validation | Deferred | Requires deployed hosted MCP server |

**Bottom line:** The DCR backend is complete. Remaining blockers for real AI client connections are infrastructure deployment (steps 5-6 in [SPEC_MCP_DEPLOYMENT.md](zz_Specifications/SPEC_MCP_DEPLOYMENT.md)) and the DCR E2E test.
