# Pending Items -- Consolidated from Completed Specs

> **Date:** 2026-05-18
> **Source specs (moved to done/):** SPEC_MCP_SERVER.md, SPEC_MCP_DOCUMENTATION.md, SPEC_OAUTH_REMAINING.md
> **Still active:** SPEC_MCP_DEPLOYMENT.md (entirely pending -- infrastructure, npm, marketplace)

---

## 1. Phase 3 -- Advanced Tools (from SPEC_MCP_SERVER.md)

Phase 1 (Read-Only) and Phase 2 (Writes + HTTP + OAuth) are fully implemented. Phase 3 tools are not started.

| # | Step | Description | Status |
|---|------|-------------|--------|
| 22 | `generate_insights` | AiGenerator integration (`POST /v2/{co}/entityInsights`) | To do |
| 23 | `bulk_update_tasks` | Batch task operations. Status subset shipped as `bulk_update_task_status` / `bulk_update_activity_status` (v1.0.10, [SPEC_MCP_BULK_STATUS_TOOLS.md](SPEC_MCP_BULK_STATUS_TOOLS.md)); general-field remainder is Phase 2 of `ITM.Web/zz_Specifications/SPEC_MCP_BULK_OPERATIONS.md` | Partially delivered |
| 24 | Extension management tools | Create/configure connector extensions | To do |
| 25 | E2E tests for Phase 3 | Verify AiGenerator integration, bulk operations | To do |

---

## 2. Documentation Pipeline (from SPEC_MCP_DOCUMENTATION.md)

The APIDocs SPA is fully built (all components, all 15 English sections, all 9 Spanish sections, tool manifest generation, tool supplement). Only CI/CD and cross-linking remain.

| # | Step | Description | Status |
|---|------|-------------|--------|
| 10 | Set up pipeline | Azure Pipelines config to build and deploy APIDocs to `developers.itmplatform.com/mcp`. Includes manifest generation in build. | To do |
| 11 | Cross-link | Add links from ITM Platform help center and other docs to MCP docs, and vice versa. | To do |

---

## 3. Open Questions (from SPEC_MCP_SERVER.md)

| Question | Context |
|----------|---------|
| Gateway rate limiting disabled | WebApiThrottle is configured in `Web.prod.config` but the handler is commented out in `WebApiConfig.cs`. Decide: re-enable as defense in depth, or rely on MCP-side throttling. Either way, MCP must implement its own rate limiting. |
| DataMart localization | Labels stored at sync time in the account's language. Is multi-language label storage on the DataMart roadmap, or document as known limitation? |

---

## 4. Open Questions (from SPEC_MCP_DOCUMENTATION.md)

| Question | Context |
|----------|---------|
| Help center integration | Should MCP docs be linked from helpcenter.itmplatform.com? If so, where? |
| Video content | Would a short setup walkthrough video be valuable? |
| Manifest generation in CI | Script needs ITM.API access. Options: (a) CI service API key, (b) commit generated manifest. |
| Audit log visibility | `revoke-and-audit` section promises users can see AI changes. Is there a UI/API exposing `tblMcpAuditLog`? |
| Sidebar track divider | Should Sidebar visually separate end-user and developer sections? |

---

## 5. OAuth -- Deferred by Design (from SPEC_OAUTH_REMAINING.md)

These are intentionally deferred, not pending work. Build only when a concrete need arises.

| Item | Trigger to build | Status |
|------|-----------------|--------|
| ~~Dynamic Client Registration (RFC 7591)~~ | ~~When a new AI client needs to connect and manual seeding is impractical~~ | **Done** (2026-05-26). See [SPEC_DYNAMIC_CLIENT_REGISTRATION.md](../../ITM.Account/ITM.Account/zz_Specifications/done/SPEC_DYNAMIC_CLIENT_REGISTRATION.md). Remaining items in [SPEC_DCR_DEFERRED_ITEMS.md](../../ITM.Account/ITM.Account/zz_Specifications/SPEC_DCR_DEFERRED_ITEMS.md). |
| Client ID Metadata Documents | When AI clients start publishing metadata documents | Deferred |
| Token Revocation Endpoint (RFC 7009) | When a user-facing "revoke MCP access" UI is needed, or compliance requires it | Deferred |

---

## 6. OAuth Completion Criterion Still Open (from SPEC_OAUTH_REMAINING.md)

> At least one real AI client is onboarded with confirmed redirect URIs (not just `e2e-test-client`)

DCR is now implemented -- AI clients can self-register via `POST /oauth/register`. This criterion now depends on the hosted deployment (tracked in [SPEC_MCP_DEPLOYMENT.md](SPEC_MCP_DEPLOYMENT.md)) and manual real-client validation (tracked in [SPEC_DCR_DEFERRED_ITEMS.md](../../ITM.Account/ITM.Account/zz_Specifications/SPEC_DCR_DEFERRED_ITEMS.md) Section 3).

---

## Related

- **[SPEC_MCP_DEPLOYMENT.md](SPEC_MCP_DEPLOYMENT.md)** -- full spec for hosted deployment, npm publishing, and marketplace listings (entirely pending, kept in active specs)
- **[done/SPEC_MCP_SERVER.md](done/SPEC_MCP_SERVER.md)** -- complete server spec (Phases 1+2 done)
- **[done/SPEC_MCP_DOCUMENTATION.md](done/SPEC_MCP_DOCUMENTATION.md)** -- documentation SPA spec (SPA built)
- **[done/SPEC_OAUTH_REMAINING.md](done/SPEC_OAUTH_REMAINING.md)** -- OAuth tracking spec (all actionable items done)
