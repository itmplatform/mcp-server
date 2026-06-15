# PM Access for MCP

> **Status:** ITM.MCP changes done, ITM.DataMart fix pending deploy
> **Date:** 2026-06-15

---

## 1. Goal

Enable Project Manager (license type 2) users to use the MCP server with scoped access -- they see and modify only the projects they manage. Company Admin and Full User access remains unchanged (full access). Team Members remain blocked.

---

## 2. Background

Phase 1 (stdio) shipped with an explicit PM block in `api-key-auth.ts` because PM-scoped DataMart queries required the API gateway to inject `X-PM-Scope-User-Id` headers, and the stdio path bypassed the gateway. Phase 2 (HTTP/OAuth) routes all traffic through the gateway, which handles scope injection server-side. The block is no longer needed.

### How PM scoping works

1. **ITM.API gateway** authenticates the user and checks `UserAccount.IsPmOnly` (license type 2 only, not admin).
2. If PM-only, the gateway adds `X-PM-Scope-User-Id: {userId}` to the forwarded request headers.
3. **ITM.DataMart** `directAccessControl` middleware reads this header and sets `req.pmScopeUserId`.
4. **DataMart GraphQL resolvers** apply a MongoDB filter `{ 'managers.userId': { $eq: pmScopeUserId } }` to all component queries, restricting results to projects where the user is a manager.

### License type reference

| ID | Type | `dataMartAccess` | MCP access |
|----|------|------------------|------------|
| 0 | Company Admin | `full` | Full |
| 1 | Full User | `full` | Full |
| 2 | Project Manager | `pm-scoped` | Scoped to managed projects |
| 3 | Team Member | `none` | Blocked |

---

## 3. Changes -- ITM.MCP (done, committed to `develop`)

### 3.1 Remove PM block in api-key-auth.ts

`src/auth/api-key-auth.ts`: Removed the rejection block for `pm-scoped` users. Only Team Members (`dataMartAccess === 'none'`) are now rejected.

Before:
```typescript
if (dataMartAccess === 'pm-scoped') {
  throw new Error('PM-only access is not yet available for MCP...');
}
if (dataMartAccess === 'none') {
  throw new Error('Team Member access is not available for MCP.');
}
```

After:
```typescript
if (dataMartAccess === 'none') {
  throw new Error('Team Member access is not available for MCP.');
}
```

No change to `oauth-auth.ts` -- it never had a PM block.

### 3.2 Unit test update

`tests/unit/auth/api-key-auth.test.ts`: Replaced the PM rejection test with an acceptance test confirming PM users resolve with `pm-scoped` access and their `pmScopeUserId`.

### 3.3 Documentation updates

- `README.md` line 162: PM row changed from "Not yet available" to "Read and write access scoped to managed projects".
- `APIDocs/src/content/sections/en/access-control.md`: PM row updated to "Scoped | Scoped | Can see and modify only projects they manage".

---

## 4. Bug found -- ITM.DataMart tenant resolution for PM-scoped gateway calls

### 4.1 Symptom

PM user authenticates successfully via OAuth, MCP session initializes, tools list, REST-based tools work. But DataMart-based tools (`search_projects`, `query_datamart`, etc.) return 0 results.

### 4.2 Root cause

In `ITM.DataMart/server/middleware/directAccessControl.ts`, the `X-PM-Scope-User-Id` early-return path (lines 63-80) skipped the gateway tenant mapping logic (lines 127-135).

When the API gateway forwards a request, it:
- Replaces the company slug with the numeric accountId in the URL (e.g., `/v2/18137/datamart/graphql`)
- Sends the original slug in the `X-Application-Name` header (e.g., `testsmarter`)

For non-PM users, the middleware's normal flow (lines 107-135) detects the gateway call and copies `X-Application-Name` to `X-Tenant` so the resolver finds the correct MongoDB collection. But for PM users, the early-return path never reached this code, so the resolver got "18137" as the tenant, which doesn't match any collection -- resulting in 0 results.

### 4.3 Proof (tested on stage)

```
# Direct call with slug in URL -- works
X-PM-Scope-User-Id: 64010 + URL /v2/testsmarter/... => 4 projects

# Gateway-style call with numeric ID -- fails  
X-PM-Scope-User-Id: 64010 + URL /v2/18137/...      => 0 projects

# MongoDB confirms data exists
db.testsmarter.countDocuments({"managers.userId": 64010}) => 4
```

### 4.4 Fix

`ITM.DataMart/server/middleware/directAccessControl.ts`: The PM-scope-header path now performs gateway tenant mapping before returning. When the URL path contains a numeric accountId and no `X-Tenant` header is present, it reads `X-Application-Name` and sets `X-Tenant` -- the same logic the non-PM path already does.

Three new unit tests added to `directAccessControl.test.ts`:
- PM scope header + numeric accountId: injects `X-Tenant` from `X-Application-Name`
- PM scope header + existing `X-Tenant`: does not overwrite
- PM scope header + slug accountId: skips injection (no mapping needed)

All 27 middleware tests pass.

### 4.5 Deployment

The fix is pending commit and deploy in the ITM.DataMart repo. After deploy, restart the DataMart stage process and re-test the PM user end-to-end.

---

## 5. Verification plan

After DataMart deploy:

1. Login as `pm@itmplatform.com1` (pwd: `1`) on testsmarter stage
2. Complete OAuth flow to MCP at `https://new-api.itmplatform.com/revamping/v2/_/mcp/`
3. Call `search_projects` -- should return 4 projects (test teamwok, test configuracion kanban, Test Horas custom fields, Market Research)
4. Call `get_project` with one of those project IDs -- should return details
5. Call `get_project` with a project ID the PM is NOT assigned to -- should return an error or empty
6. Call `get_reference_data` -- should work (REST-based, not affected by PM scope)

---

## 6. Files changed

### ITM.MCP (committed)

| File | Change |
|------|--------|
| `src/auth/api-key-auth.ts` | Removed PM rejection block |
| `tests/unit/auth/api-key-auth.test.ts` | PM acceptance test |
| `README.md` | PM access row updated |
| `APIDocs/src/content/sections/en/access-control.md` | PM access row updated |

### ITM.DataMart (pending commit)

| File | Change |
|------|--------|
| `server/middleware/directAccessControl.ts` | Gateway tenant mapping in PM-scope-header path |
| `server/middleware/__tests__/directAccessControl.test.ts` | 3 new tests for PM + gateway tenant mapping |
