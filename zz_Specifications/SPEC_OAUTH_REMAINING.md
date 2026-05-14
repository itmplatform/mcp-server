# OAuth 2.1 -- Remaining Work

> **Status:** Open -- tracks all remaining OAuth work across repos
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

### 1.2 ITM.Account -- Integration Tests

**Spec reference:** [SPEC_OAUTH_AUTHORIZATION_SERVER.md, Section 9.2](../../ITM.Account/ITM.Account/zz_Specifications/done/SPEC_OAUTH_AUTHORIZATION_SERVER.md#92-integration-tests)

The 59 unit tests mock the DA layer. Integration tests verify the full path through the real database -- catching wrong column names, mapper mismatches, and parameter type errors that mocks cannot surface.

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

Run against local SQL Server. Each test creates its own data and cleans up in teardown.

**When to do:** Before first deployment to stage. These catch the class of bugs that only appear against a real database.

---

### ~~1.3 ITM.Web -- Login & Consent UI (Phase 3)~~ DONE ✅ (2026-05-13)

**Spec reference:** [SPEC_OAUTH_LOGIN_CONSENT.md](../../ITM.Web/zz_Specifications/done/SPEC_OAUTH_LOGIN_CONSENT.md)

Three ASPX pages + App_Code service layer implemented: `OAuthLogin.aspx`, `OAuthConsent.aspx`, `OAuthError.aspx`. 16 unit tests green. Proxy redirect bug fixed. E2E tests written (14 Playwright scenarios). See spec Section 12 for implementation notes.

---

## 2. Blocked

### 2.1 Full Browser E2E Tests (Phase 4) -- Tests Written, Blocked by Local DI Issue

**Spec references:**
- [SPEC_OAUTH_AUTHORIZATION_SERVER.md, Section 9.3.3](../../ITM.Account/ITM.Account/zz_Specifications/done/SPEC_OAUTH_AUTHORIZATION_SERVER.md#933-playwright-e2e-tests-full-browser-flow)
- [SPEC_OAUTH_LOGIN_CONSENT.md, Section 8.3](../../ITM.Web/zz_Specifications/done/SPEC_OAUTH_LOGIN_CONSENT.md)

14 Playwright test scenarios consolidated into `UI-E2E-Testing/playwright/tests/oauth/oauth-flow.spec.ts`. Tests cover: login page rendering, company pre-fill, editable company, invalid credentials, empty fields, login-to-consent redirect, consent page content, approve/deny flows, cancel flow, invalid client_id, expired request, and full PKCE token exchange.

**No longer blocked by:** Phase 3 (Login & Consent UI) -- done 2026-05-13.

**Previously blocked by:** ~~ITM.Account local DI issue~~ -- resolved 2026-05-14 (commits `0d19e17`, `ad52feb` simplified `OAuthManager` and `OAuthTokenService` constructors). Also needs `e2e-test-client` OAuth client seeded in local database (done via `deployment.sql` Build 3).

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
Phase 1 (Done)          Phase 2 (Done)           Phase 3 (Done)             Remaining
-----------------       -----------------        ---------------------      ------------------
Gateway proxy     --->  OAuth server       --->  Login & Consent UI   --->  2.1 Browser E2E
Token validation        JWT service              16 unit tests                (blocked: local DI)
Audit route             Session tokens           Proxy redirect fix         1.1 Scope enforcement
                        DB migration             E2E tests written          1.2 Integration tests
                        Pipeline secrets
```

---

## Completion Criteria

OAuth is fully operational end-to-end when:

1. An AI client (Claude Desktop, VS Code, etc.) can complete the full OAuth flow against any environment
2. Write tools are hidden from sessions without `mcp:write` scope
3. Downstream gateway calls use the `token` header
4. All integration and E2E tests pass
5. At least one real AI client is onboarded with confirmed redirect URIs (not just `e2e-test-client`)
