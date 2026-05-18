# OAuth 2.1 -- Remaining Work

> **Status:** Open -- tracks all remaining OAuth work across repos (E2E tests done 2026-05-14)
> **Date:** 2026-05-13
> **Master spec:** [SPEC_MCP_SERVER.md](SPEC_MCP_SERVER.md) (Sections 3.5, 3.6.1, Phase 2 tracker)

---

## What This Document Is

Phases 1 and 2 of the OAuth 2.1 rollout are done. This document tracks everything that remains before the OAuth flow is fully operational end-to-end. Each item lives in one of three categories:

1. **Unblocked now** -- can be done immediately
2. **Blocked by another item** -- has a dependency chain
3. **Deferred by design** -- build when needed, not before

---

## 1. Unblocked Now

### ~~1.1 ITM.MCP -- OAuth Scope Enforcement (Step 21)~~ DONE ✅ (2026-05-14)

**Spec reference:** [SPEC_MCP_SERVER.md, Section 3.6.1](SPEC_MCP_SERVER.md#361-oauth-scope-enforcement)

All five changes implemented:

| Change | File | Status |
|--------|------|--------|
| Add `scope` to exchange result | `src/auth/oauth-auth.ts` | ✅ |
| Store parsed scopes in context | `src/auth/effective-user-context.ts` + `oauth-auth.ts` | ✅ |
| Fix downstream auth header | `src/auth/oauth-auth.ts` | ✅ (`Token:` header) |
| Conditional tool registration | `src/server.ts` | ✅ |
| Dispatch guard (defense in depth) | `src/tools/write-tools.ts` | ✅ |

10 new unit tests (scope parsing, hasScope, WRITE_TOOL_NAMES, dispatch guard). Playwright E2E test in `ITM.UI-E2E-Testing/playwright/tests/oauth/mcp-scope-enforcement.spec.ts`.

**Next:** Update the E2E seed client in ITM.Account's `deployment.sql` from `scope: 'mcp:read'` to `'mcp:read mcp:write'` after verifying scope enforcement works in stage.

---

### ~~1.2 ITM.Account -- Integration Tests~~ DONE ✅ (2026-05-14)

**Spec reference:** [SPEC_OAUTH_AUTHORIZATION_SERVER.md, Section 9.2](../../ITM.Account/ITM.Account/zz_Specifications/done/SPEC_OAUTH_AUTHORIZATION_SERVER.md#92-integration-tests)

8 integration tests implemented in `TestOAuthIntegration.cs`. All 8 green. Tests read the connection string from `Web.config` at runtime (portable across machines), look up real accountId/userId for FK constraints, and clean up all created rows in teardown.

| Test | What it verifies |
|------|-----------------|
| Create OAuth client in DB, retrieve by client_id | DA round-trip |
| Create authorization request, retrieve by requestId, mark consumed | Request lifecycle |
| Create authorization code, retrieve by hash, mark consumed | Code lifecycle |
| Create refresh token, revoke, verify revoked | Token lifecycle |
| Refresh token replay triggers family revocation | All tokens for client+user are revoked |
| Insert audit log entry, verify in DB | Audit DA |
| Insert MCP session token, verify in `tblUserToken` | SessionTokenDA round-trip |
| Two MCP tokens for same user coexist | Both rows exist with different token strings |

---

### ~~1.3 ITM.Web -- Login & Consent UI (Phase 3)~~ DONE ✅ (2026-05-13)

**Spec reference:** [SPEC_OAUTH_LOGIN_CONSENT.md](../../ITM.Web/zz_Specifications/done/SPEC_OAUTH_LOGIN_CONSENT.md)

Three ASPX pages + App_Code service layer implemented: `OAuthLogin.aspx`, `OAuthConsent.aspx`, `OAuthError.aspx`. 16 unit tests green. Proxy redirect bug fixed. E2E tests written (14 Playwright scenarios). See spec Section 12 for implementation notes.

---

## 2. ~~Blocked~~ (All items resolved)

### ~~2.1 Full Browser E2E Tests (Phase 4)~~ DONE ✅ (2026-05-14)

**Spec reference:** [SPEC_OAUTH_E2E_TESTS.md](../../ITM.UI-E2E-Testing/zz_Specifications/done/SPEC_OAUTH_E2E_TESTS.md)

All 16 Playwright tests passing locally (3.1 min, `--workers=2`). Tests span two files:

- `oauth-flow.spec.ts` (14 tests): login page rendering, company pre-fill, editable company, invalid credentials, empty fields, login-to-consent redirect, consent page content, approve/deny flows, cancel flow, invalid client_id, expired request, full PKCE token exchange with session token + refresh token rotation.
- `mcp-scope-enforcement.spec.ts` (2 tests): read-only OAuth session sees 15 tools (no write tools), read-write session sees all 20 tools.

**Server-side fixes applied during E2E execution (2026-05-14):**
- `OAuthController.cs`: read `company` query param, include in consent redirect URL
- `deployment.sql`: updated seed `e2e-test-client` with callback URI + `mcp:write` scope
- `SessionTokenManager.cs`: removed dual-constructor DI violation; fixed UTC/local time mismatch in session token expiry (GETDATE() uses local time)

**CI integration:** Tests skip gracefully when OAuth/MCP prerequisites are unavailable. Environment-specific `.env` files added for stage, demo, and prod.

---

## 3. Deferred by Design

### 3.1 Dynamic Client Registration (RFC 7591)

**Spec reference:** [SPEC_OAUTH_AUTHORIZATION_SERVER.md, Section 4.8](../../ITM.Account/ITM.Account/zz_Specifications/done/SPEC_OAUTH_AUTHORIZATION_SERVER.md#48-dynamic-client-registration-rfc-7591--deferred)

A `POST /oauth/register` endpoint that lets unknown AI clients register themselves automatically (send name + redirect URIs, get back a client_id).

**Why deferred:**
- MCP authorization guidance prefers Client ID Metadata Documents over DCR
- The endpoint would be publicly accessible with no authentication, creating a spam vector on `tblOAuthClient`
- All known onboarding scenarios are covered by pre-seeded clients or future Client ID Metadata Document support

**When to build:** When a concrete need arises -- e.g., a new AI client needs to connect and manual seeding is impractical.

**If building:** Add rate limiting (IP-based minimum), request-body size caps, optionally a registration token requirement (RFC 7591 Section 3). Then add `registration_endpoint` to the metadata response and the `/oauth/register` route to `OAuthProxyController`.

### 3.2 Client ID Metadata Documents

**Spec reference:** [SPEC_MCP_SERVER.md, Section 3.5](SPEC_MCP_SERVER.md)

An alternative to DCR where AI clients publish their OAuth metadata at a well-known URL and the authorization server fetches it. The MCP authorization spec prefers this approach. Currently `client_id_metadata_document_supported` is set to `false` in the authorization server metadata.

**When to build:** When AI clients start publishing metadata documents and ITM needs to support unknown clients without manual seeding.

### 3.3 Token Revocation Endpoint (RFC 7009)

A `POST /oauth/revoke` endpoint for explicitly revoking access or refresh tokens. Currently not needed because refresh token rotation handles compromised tokens, and access tokens are short-lived (15 min).

**When to build:** If a user-facing "revoke MCP access" UI is needed, or if compliance requires explicit revocation capability.

---

## Cross-Repo Dependency Map

```
Phase 1 (Done)          Phase 2 (Done)           Phase 3 (Done)             Phase 4 (Done)
-----------------       -----------------        ---------------------      ------------------
Gateway proxy     --->  OAuth server       --->  Login & Consent UI   --->  Browser E2E ✅
Token validation        JWT service              16 unit tests              16 Playwright tests
Audit route             Session tokens           Proxy redirect fix         CI-compatible
                        DB migration                                        1.1 Scope enforcement ✅
                        Pipeline secrets                                    1.2 Integration tests ✅
                        8 integration tests ✅
```

---

## Completion Criteria

OAuth is fully operational end-to-end when:

1. An AI client (Claude Desktop, VS Code, etc.) can complete the full OAuth flow against any environment
2. Write tools are hidden from sessions without `mcp:write` scope
3. Downstream gateway calls use the `token` header
4. All integration and E2E tests pass
5. At least one real AI client is onboarded with confirmed redirect URIs (not just `e2e-test-client`)
