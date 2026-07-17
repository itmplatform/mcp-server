# MCP Write Tool Fixes: Summary Task Verification, Risk Schema, and Auto-Progress Warning

> **Status:** Implemented and verified on stage 2026-07-17 (MCP v1.0.12); prod deployment pending
> **Date:** 2026-07-17
> **Origin:** Claude Desktop prod session on project 81412 (testsmarter account, 2026-07-17 18:03-18:11 UTC). Prod logs confirmed all three issues; the ticket is at `zz_Tickets/Claude-desktop-project-creation.md`.

---

## Summary

Three issues surfaced in the first real-world prod session using the new `create_project`/hierarchy/milestone tools (v1.0.12). Two are code bugs, one is a schema/discovery gap that makes `create_risk` unusable in practice. All fixes are in ITM.MCP except exposing the already-implemented `risklevels` endpoint through the API Gateway, which is a one-route change in `APIGateway.json` (ITM.Web/ITM.API); no ITM.Tasks code change is needed.

| # | Issue | Severity | Fix location |
|---|-------|----------|--------------|
| 1 | Summary task `TypeId` verification false negative | High -- returns error on successful writes; invites duplicate creation | `src/tools/write-tools.ts` |
| 2 | `create_risk` schema marks 4 required fields as optional + `LevelId` undiscoverable | High -- tool is unusable (23 consecutive failures in prod) | `src/tools/write-tools.ts` + `src/tools/reference-data.ts` + `APIGateway.json` (ITM.Web/ITM.API) |
| 3 | Auto-progress side effect not documented in tool descriptions | Low -- documentation gap, no code change | `src/tools/write-tools.ts` description strings |

---

## 1. Summary Task TypeId Verification False Negative

### Problem

When `create_task` is called with `KindId=2` (summary) and `TypeId`, the write succeeds but `verifyRequestedFields` throws:

```
Source-of-truth write verification failed for create_task:
TypeId expected 612756 but readback did not include Type.Id or TypeId
```

The backend readback for summary tasks omits `Type.Id` because `TypeId` is not applicable to summaries (confirmed in `zz_Specifications/done/SPEC_MCP_CREATE_PROJECT_HIERARCHY_MILESTONES.md` Section 1.4: summary tasks have no TypeId validation, and the resolution path in ITM.Tasks `TaskManager.cs:1004`, `if (task.KindId != (int)Enums.TaskKind.Summary)`, only runs for non-summary tasks; re-verified against the ITM.Tasks source on 2026-07-17).

### Prod evidence

Three consecutive `create_task` errors at 18:03:57, 18:03:59, 18:04:00 in `MCPProd-error-22__2026-07-17_00-00-00.log`. The agent correctly diagnosed these as false negatives and used `list_project_tasks` at 18:04:08 to confirm the tasks existed. A less sophisticated agent would retry and create duplicates.

### Root cause

`taskVerificationFieldsFor` (write-tools.ts:473-479) excludes `StartDate` for milestones and `ParentId` when detaching to root, but has no exclusion for `TypeId` when `KindId=2`.

### Fix

Two changes, both in `src/tools/write-tools.ts`:

**A. Reject `TypeId` on summary tasks in validation** (write-tools.ts:176-179). `TypeId` is not applicable to summary tasks -- the backend silently ignores it and the readback omits it. The validation error should say: "Summary tasks (KindId 2) do not use TypeId; omit it. Use TypeId only on regular tasks and milestones."

This is the same "reject rather than ignore" pattern applied to `StatusId` on `create_project` (Section 3.1 of the hierarchy spec). The rejection should apply to both `create_task` and `update_task` when `KindId=2` is in the payload.

**B. Exclude `TypeId` from verification for summaries** (write-tools.ts:473-479). Add a filter line in `taskVerificationFieldsFor`:

```
if (field.requestField === 'TypeId') return numericValue(body.KindId) !== TASK_KIND_SUMMARY;
```

This is defense in depth: if an agent somehow sends `TypeId` on a summary and bypasses client-side validation (e.g. through a future tool or direct REST), verification won't throw a false error.

---

## 2. `create_risk` Schema and Discovery Gaps

### Problem (a): Four required fields marked optional

The `create_risk` input schema (write-tools.ts:638-641) marks `StatusId`, `TypeId`, `ProbabilityId`, and `ImpactId` as `.optional()`. The v2 REST API requires all four. The first prod call returned:

```
Please enter valid Risk Type ID. Please enter valid Risk Status ID.
Please enter valid Risk Impact ID. Please enter valid Risk Probability ID.
Please enter valid Risk Level ID.
```

### Problem (b): `LevelId` is undiscoverable

There is no `risklevels` entity in `ALLOWED_ENTITIES` (reference-data.ts:5-11). The MCP field description says: "No v2 risklevels reference endpoint currently exists." The agent tried 23 consecutive `LevelId` probes (brute-forcing ID ranges), all returning 400.

**Corrected finding (2026-07-17 fact-check):** the endpoint does exist in ITM.Tasks. `RiskLevelController.cs` implements `GET v2/{AccountId}/RiskLevels`, backed by `RiskLevelManager.GetRiskLevelByAccountId`. What is missing is the route in `APIGateway.json` (ITM.Web/ITM.API): the gateway routes `riskstatuses`, `risktypes`, `riskimpacts`, and `riskprobabilities` (lines 330-353) but not `risklevels`, so the endpoint is unreachable from outside. The UI is unaffected because it does not go through the v2 gateway route to populate the risk level picker.

The e2e tests work around this by querying SQL directly:
```sql
SELECT TOP 1 intRiskLevalBaseId FROM dbo.tblRiskLeval
WHERE intAccountId = 18137 ORDER BY intRiskLevalBaseId;
```

### Fix (a): Make the four fields required

Change `StatusId`, `TypeId`, `ProbabilityId`, and `ImpactId` from `.optional()` to required in the `create_risk` input schema. Point each description at the correct `get_reference_data` entity:

| Field | Entity |
|-------|--------|
| `TypeId` | `risktypes` |
| `StatusId` | `riskstatuses` |
| `ImpactId` | `riskimpacts` |
| `ProbabilityId` | `riskprobabilities` |

Also add `requireSuppliedField` calls in `splitCreateRiskArgs` (write-tools.ts:232-243) for all four, matching the pattern `splitCreateIssueArgs` already uses for `TypeId` and `StatusId`.

### Fix (b): Make `LevelId` discoverable

The backend endpoint already exists (`RiskLevelController.cs` in ITM.Tasks); the main gap is the missing API Gateway route.

**Found during implementation (2026-07-17):** one ITM.Tasks code fix was needed after all. `RiskLevelMapper.Map` passed its own never-assigned null `Impact`/`Probability` properties into the `RiskLevel` constructor, so serializing the `Value` getter threw a NullReferenceException and the endpoint returned 500 on its first-ever real call. Fixed in ITM.Tasks commit b734858c (mapper now uses the default constructor; regression test in `ITM.Tasks.Test2/TestRiskLevel.cs` asserts the mapped object serializes). The bug was invisible until now precisely because the route had never been exposed.

1. Add the `risklevels` route to `APIGateway.json` in ITM.Web/ITM.API, mirroring the four sibling risk reference routes:

```json
{
  "auth": "token",
  "url": "v2/{companyId}/risklevels",
  "regexp": "v2/[\\w-_0-9]+/risklevels",
  "micro": "Tasks"
},
```

2. The deployed `APIGateway.json` can also be edited manually on the servers (local, stage, prod) to avoid an unnecessary full deployment. The repo change in ITM.Web keeps the source of truth in sync so the next regular deployment does not roll the route back. When the fix is done, push to the develop branch.
3. Once the route is live, add `'risklevels'` to `ALLOWED_ENTITIES` in reference-data.ts and update the `LevelId` description to point at `get_reference_data` with entity `risklevels`.

**Ruled out (verified 2026-07-17): deriving `LevelId` from `ImpactId x ProbabilityId` when omitted.** `RiskManager.CheckValidation` (RiskManager.cs:85-88) rejects a missing or invalid `Level`, and `Risk.UpdateLevelWithValuesSuppliedByUser` (Risk.cs:453-471) reads `LevelId` straight from the payload with no derivation logic. The apparent impact x probability correlation in existing data comes from how users pick levels in the UI, not from backend derivation.

**Ruled out: hardcoding the ID lookup in the MCP** (query `tblRiskLeval` at startup and cache). Fragile and couples the MCP to the SQL schema.

---

## 3. Auto-Progress Side Effect Warning

### Problem

When a task is created or updated with a status that has `AutomaticProgress: true` (like Completed, StatusId 544588), the backend silently creates a 100% "Automatic progress report" entry. The agent did not expect this.

Additionally, `percentComplete` is determined by the latest entry by `ReportDate`, not by creation order. A backdated progress entry can be silently superseded by an auto-progress entry with a later date.

Neither `create_task` nor `update_task` descriptions mention this behavior.

### Fix

Add a note to both `create_task` and `update_task` descriptions:

> "Setting a status that has AutomaticProgress (such as Completed) creates a 100% progress entry automatically. If you later report lower progress, the entry must have a ReportDate later than the auto-generated one to take effect, since percentComplete tracks the latest entry by ReportDate."

This is documentation only; no code path changes.

---

## 4. House Rules

Implementation must follow `../House-rules.md` (workspace root). The rules that apply directly here:

- **TDD**: main logic changes use red-code-green-refactor-green; edge-case tests are added after the code. All tests, previous and new, must pass, and the build must complete without errors or warnings before the deliverable is accepted.
- **Code**: search the codebase for prior art before writing anything new and reuse existing mechanisms (`requireSuppliedField`, the `taskVerificationFieldsFor` filter pattern, the sibling gateway route entries) instead of parallel code paths. Clean Code, simple, no overengineering.
- **Documentation**: update related docs concisely without duplicating content across documents (Section 6 lists the surfaces), including API documentation (APIDocs). Commit messages stay short and without authoring.

---

## 5. TDD Plan

### Unit tests (vitest, `tests/unit/tools/write-tools.test.ts`)

1. `getCreateTaskValidationError`: reject `TypeId` on `KindId=2` (summary) for Waterfall.
2. `getUpdateTaskValidationError`: reject `TypeId` on `KindId=2` when `KindId` is in the payload.
3. `taskVerificationFieldsFor`: exclude `TypeId` when `KindId=2`.
4. `splitCreateRiskArgs`: `requireSuppliedField` for `TypeId`, `StatusId`, `ImpactId`, `ProbabilityId` (in addition to existing `LevelId`).

### E2E tests (`tests/e2e/write-tools.e2e.test.ts`)

5. `create_task` with `KindId=2` and no `TypeId`: succeeds, readback `KindId` 2.
6. `create_task` with `KindId=2` and `TypeId`: client-side rejection with actionable message.
7. `create_risk` with all required fields including `LevelId` (from SQL): succeeds (this already exists but validates the schema change doesn't regress).
8. `create_risk` missing `TypeId`: client-side rejection (not a 400 from REST).

### Scope enforcement

No new tools, so `WRITE_TOOL_NAMES` count stays at 10 and total tool count stays at 30.

---

## 6. Documentation Plan

| Surface | Change |
|---------|--------|
| `src/tools/write-tools.ts` | Tool description updates for `create_task`, `update_task`, `create_risk` |
| `src/tools/reference-data.ts` | Add `risklevels` to `ALLOWED_ENTITIES` (once the gateway route is live) |
| `APIDocs .../en+es/changelog.md` | Patch note for risk schema fix and summary task fix |
| `APIDocs .../en+es/write-operations.md` | Update `create_risk` requirements column |
| `APIDocs/src/content/tool-supplement.ts` | Refresh `create_risk` narrative |
| `APIDocs tool-manifest.json` | Regenerate |

---

## 7. Rollout

1. ~~Verify ITM.Tasks `RiskManager.cs` to determine if `LevelId` is derived~~ Done 2026-07-17: `LevelId` is required, not derived; the endpoint exists but is not gateway-routed (see Section 2, Fix b).
2. ~~Add the `risklevels` route to `APIGateway.json`~~ Done: ITM.Web develop commit a8312579; applied manually on the local and stage gateways (backup `APIGateway.json.bak-20260717` on stage).
3. ~~Fix `RiskLevelMapper` NRE in ITM.Tasks~~ Done: develop commit b734858c, deployed to stage via the ITM.Tasks-Stage pipeline.
4. ~~Implement fixes 1, 2a, 2b, and 3 in ITM.MCP; TDD per Section 5~~ Done: develop commit de0b41c (v1.0.12), 372 unit tests green, build green.
5. ~~E2E against local API~~ Done: 70/70 green (14 write-tools tests, including the new summary task, risklevels, and create_risk rejection cases).
6. ~~Deploy to stage~~ Done: ITM.MCP-Stage and ITM.Tasks-Stage pipelines succeeded; verified on stage via scripted OAuth session (risklevels discovery, create_risk with discovered LevelId, summary task with and without TypeId).
7. **Prod:**
   a. ~~Deploy ITM.Tasks to prod~~ Done 2026-07-17: develop merged to main (2e7a1984), ITM.Tasks-Prod pipeline deployed.
   b. ~~Add the `risklevels` route manually to the prod `APIGateway.json`~~ Done 2026-07-17: route inserted on `app2-api.itmplatform.com` (backup `APIGateway.json.bak-20260717`), app domain recycled, endpoint verified returning the three levels. Note: the route only reaches ITM.Web `main` with the next regular ITM.Web promotion; until then, an ITM.Web prod deployment from `main` would overwrite the manual edit.
   c. Deploy ITM.MCP to prod (`merge-develop-into.bat main`); the prod pipeline publishes npm. **This is the only remaining step.**
