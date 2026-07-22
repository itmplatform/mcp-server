# SPEC: MCP task effort tools (get_task_effort + update_task_effort)

> **Date:** 2026-07-22
> **Driver:** [Help Scout 11634](https://secure.helpscout.net/conversation/3393666030/11634/) (Gilsandro Cezar, Ucloud PMO):
> "Permitir indicar el Usuario (User) al realizar la estimación de esfuerzo (Estimated Hours) de una tarea."
> The second half of 11634 (per-user **time entries**) is explicitly out of scope here; that remains a product
> decision tracked in [SPEC_HELPSCOUT_11535_TIME_TRACKING_FOLLOWUP_REPORTING.md](SPEC_HELPSCOUT_11535_TIME_TRACKING_FOLLOWUP_REPORTING.md) Section 3.
> **Backlog source:** [INDEX.md](INDEX.md) P2 #15 (`get_task_effort`). The read tool also substantially covers
> P2 #11 (`get_task_team`), because `EffortByTeamMember` returns the assigned users with names and emails.
> **Scope:** 1 read tool + 1 write tool, implemented entirely in ITM.MCP (target v1.0.15).
> No ITM.Tasks or ITM.Web changes are required (endpoints and gateway routes exist and are live).
> One **recommended, non-blocking** hardening ticket for ITM.Tasks (Section 4).
> **Status:** Proposed. Fact-checked 2026-07-22 against ITM.Tasks, ITM.Web gateway, and the deployed production API.

---

## 1. Background

Estimated effort in ITM Platform is **per-user planning data** stored on the task assignment
(`tblTaskUser.intEstimatedHours/intEstimatedMins`), plus a task-level headline estimate
(`tblTask.intTaskEstHour/intTaskEstmin`) and optional per-category unassigned effort
(`tblTaskWorkTime`). None of it is reachable through MCP today: `create_task`/`update_task`
intentionally reject effort fields because effort has its own v2 route
(established in [SPEC_MCP_CREATE_PROJECT_HIERARCHY_MILESTONES.md](done/SPEC_MCP_CREATE_PROJECT_HIERARCHY_MILESTONES.md) Section 1.5).

Unlike time entries, setting another user's **estimate** is not impersonation: it is what a PM
does in the Task Effort dialog. No on-behalf authorization question arises; the caller acts as
themselves and the gateway applies normal project access rules.

**Prerequisite for estimating:** the target user must already be assigned to the task.
Assignment is already possible via `update_task`/`create_task` `TaskMembers`/`TaskManagers`
(comma-separated usernames, honored and validated server-side; see milestones spec Section 6 #1).
The tools below do not create assignments.

## 2. Verified backend facts (2026-07-22)

Search record (house rule): `Effort` in ITM.Tasks controllers; `TaskEffortBulkUpdate`,
`UpdateTaskEffort`, `UpdateTaskUserEffort`, `tblTaskWorkTime` in ITM.Tasks; `TaskEffort.js` and
`IsTaskEffortV2Enabled` in ITM.Web; `Effort` in `ITM.Web/ITM.API/APIGateway.json`; `effort` in
ITM.MCP src/tests (no tool exists; only INDEX P2 rows). Prior art traced end-to-end:
controller -> manager -> DA -> SQL -> async job -> events, plus the UI caller payload.

### Endpoints (all v2, served by ITM.Tasks, routed by the gateway, live in prod)

| Endpoint | Purpose | Evidence |
|---|---|---|
| `GET v2/{acct}/Projects/{pid}/Tasks/{tid}/EffortByTeamMember` | Per-user rows: `TaskUserId`, `UserId`, `DisplayName`, `EmailAddress`, category ids/name, `EstimatedEffortHours/Mins`, `ActualEffortAcceptedHours/Mins`, `ActualEffortByTimeEntryHours/Mins`, `IsAutomaticActualEffortAccepted`, `BillingCategoryId`, overload flags | `TaskEffortController.cs:43`, `EffortByTeamMember.cs:5-32` |
| `GET v2/{acct}/Projects/{pid}/Tasks/{tid}/EffortByCategory` | Per-category rows incl. `NonAssignedEffortHours/Mins`, accepted effort, `TotalEstimatedEffortHours/Mins`, `IsDelete` | `TaskEffortController.cs:23`, `EffortByCategory.cs:11-36` |
| `PUT v2/{acct}/Projects/{pid}/Tasks/{tid}/Effort` | Bulk write: `UserEfforts[]`, `CategoryEfforts[]`, `TaskTotalEstimateHours/Mins` | `TaskEffortController.cs:88`, `TaskEffortBulkUpdate.cs` |

Gateway: dedicated entries exist (`APIGateway.json:1448-1465`, `auth: token`, `micro: Tasks`),
but they are **shadowed** by the earlier generic tasks route (`APIGateway.json:845-854`,
unanchored first-match in `ApiGateway.cs:217-224`). Net effect, verified: requests reach
ITM.Tasks with `UserId`/`LanguageId` injected, authorized as **`SetAccountWithPMRights` against
`UserPages/ProjectTaskList.aspx`** (page right + PM project access for the URL's ProjectId,
`APIGatewayManager.cs:303-328`). That is the correct authorization class for a planning write,
so no gateway change is needed.

### Write semantics of `PUT .../Effort` (the part that shapes the tool design)

`TaskWorkTimeManager.UpdateTaskEffort` (`TaskWorkTimeManager.cs:135-236`) is a **hybrid write**:

| Payload part | Semantics | Consequence |
|---|---|---|
| `TaskTotalEstimateHours/Mins` | **Unconditional overwrite** of `tblTask.intTaskEstHour/intTaskEstmin` (`TaskWorkTimeManagerDA.cs:124-137`) | Omitting it (C# default 0) **zeroes the task's headline estimate** |
| `CategoryEfforts` | **Full replace**: `DELETE FROM tblTaskWorkTime WHERE intTaskId` then re-insert provided rows (`TaskWorkTimeManager.cs:152-170`) | Omitting the array **deletes all category/unassigned effort** |
| `UserEfforts` | **Partial by user**: one `UPDATE tblTaskUser ... WHERE intTaskUserId=@TaskUserId` per entry; no deletes, no inserts (`TaskUserManagerDA.cs:133-154`) | Unlisted users untouched; **each listed row is fully overwritten** (see traps) |

Confirmed traps (each verified in source by the fact-check):

1. **`UserId` is ignored server-side.** The write keys only on `TaskUserId`
   (`TaskWorkTimeManager.cs:174-184`). An unknown or `0` `TaskUserId` is a **silent no-op that
   still returns 200 "Updated Successfully"**. The `WHERE` clause has no task scoping.
2. **Per-user rows have no field-level merge.** `ActualEffortAcceptedHours/Mins` omitted ->
   written as 0; `IsAutomaticActualEffortAccepted` omitted -> written as `false`;
   `BillingCategoryId` omitted -> written as `NULL`. The web UI always echoes all six fields
   read from the current state (`ITM.Web .../TaskEffort.js:1748-1759`); any API caller must too.
3. **No domain validation.** Only `payload == null` -> 400. No task-in-project or
   project-in-account check, no task-existence check, no negative-hours check, no
   milestone/summary check (`TaskWorkTimeManager.cs:137-236`). Errors surface as 200-no-op or
   500 with a raw stack trace.
4. **Side effects:** hour redistribution and overload recalc run **asynchronously** via a
   scheduled job (only when the task has valid dates, `TaskManager.cs:2193-2224`); an
   `updated/Task` extension event always fires; a project event fires when values changed.
   No inline cost recalculation (`numTotalAcceptedEffortCost` is not touched by this path).
5. **Accepted effort is out of bounds for MCP.** It is a derived aggregate
   (auto-recalculated from time entries when `IsAutomaticActualEffortAccepted = 1`); the 11535
   spec already ruled that no MCP tool may write it. These tools only ever **echo** it.

## 3. Tool designs

Both tools live in a new `src/tools/effort.ts`, registered from `server.ts` following the
`registerProgressTools` pattern (`src/tools/progress.ts:60`): the read registers always, the
write only with `mcp:write` plus the per-handler `hasScope` guard
(`src/auth/effective-user-context.ts:15-26`, `write-tools.ts:14-19`).

### 3.1 `get_task_effort` (read)

- **Input:** `projectId: z.number()`, `taskId: z.number()`.
- **Backend:** the two GETs above, called in parallel.
- **Output:** `{ teamMembers: [...], categories: [...] }` raw passthrough.
- **Description must say:** estimated vs accepted vs time-entry actuals are different concepts;
  `teamMembers` doubles as the task team list (assigned users with `UserId`, `DisplayName`,
  `EmailAddress`); `TaskUserId` is the assignment id used internally by effort updates.

### 3.2 `update_task_effort` (write)

- **Input:**
  - `projectId: z.number()`, `taskId: z.number()`
  - `userEstimates: z.array(z.object({ userId: z.number(), estimatedHours: z.number().int().min(0), estimatedMinutes: z.number().int().min(0).max(59) })).min(1)`
  - `taskTotalEstimate: z.object({ hours: ..., minutes: ... }).optional()` -- when omitted, the
    current task total is preserved, not zeroed.
- **Handler flow (read-modify-write, mirroring the UI):**
  1. Scope guard (`mcp:write`).
  2. `GET .../EffortByTeamMember` -> current per-user state. Resolve each requested `userId` to
     its `TaskUserId`. Unknown user -> tool error: "User {id} is not assigned to task {taskId}.
     Assign them first with update_task (TaskMembers/TaskManagers usernames), then retry."
     This also defeats trap 1 by construction (fresh, task-scoped `TaskUserId`).
  3. `GET .../{taskId}` task readback (same call as `get_task`) to (a) verify the task belongs
     to `projectId` (compare the project reference field; exact field name verified at
     implementation) and (b) reject `KindId` 1 (milestone) and 2 (summary) with a clear message,
     since the backend does not (trap 3).
  4. Build `UserEfforts`: **only** the requested users; new `EstimatedHours/Mins`; echo the
     current `ActualEffortAcceptedHours/Mins`, `IsAutomaticActualEffortAccepted`, and
     `BillingCategoryId` from step 2 (trap 2).
  5. Build `CategoryEfforts` by echoing the current `EffortByCategory` rows mapped back to
     `CategoryEffortInput` (trap: full replace). The `MasterCategoryId -> CategoryId` and
     `CategoryTypeId -> CategoryType` mapping must be verified empirically during
     implementation (E2E acceptance criterion below asserts zero net change to
     `tblTaskWorkTime` on an estimate-only update).
  6. `TaskTotalEstimateHours/Mins`: from input if provided, else echo the current total.
     Source for the current total (`EffortByCategory.TotalEstimatedEffortHours/Mins` vs task
     detail) is an implementation verification item; assert against `tblTask` in E2E.
  7. `PUT .../Effort`, then re-`GET EffortByTeamMember` and verify the written estimates with
     `verifyRequestedFields`-style comparison; return via `buildWriteResponse` (stale-DataMart
     notice included, `write-tools.ts:9-28`).
- **Description must say:** sets ESTIMATED (planned) effort per assigned user; it does not log
  worked hours (time entries) and never changes accepted effort or billing categories; the
  target user must already be assigned to the task.

### Deliberately not exposed

- Writing `ActualEffortAccepted*` or `IsAutomaticActualEffortAccepted` (echo only).
- Editing `CategoryEfforts` / unassigned category effort (echo only; revisit on demand).
- Creating or removing assignments (that is `update_task` TaskMembers/TaskManagers).
- Milestones and summary tasks (rejected client-side).

## 4. Recommended backend hardening (ITM.Tasks, non-blocking follow-up)

The fact-check found that `PUT .../Effort` does not validate that the task belongs to the URL's
project/account, and the per-user `UPDATE` is not scoped to the task
(`WHERE intTaskUserId` only). The gateway authorizes the caller against the **claimed**
ProjectId, so a crafted direct REST call naming an accessible project but a foreign `TaskId`
(or a foreign `TaskUserId`) writes outside the authorization boundary. This mirrors the class
of defect already fixed in the v2 progress endpoints ("validate task belongs to project and
project to account, 404 otherwise", 11535 rollout) and the 2026-07-07 cross-tenant progress
leak. **Recommendation:** open a ticket for ITM.Tasks to add the same ownership checks to
`UpdateTaskEffort` (and scope `UpdateTaskUserEffort` by `intTaskId`). The MCP tools are safe by
construction (they resolve ids fresh and verify pairing), so this does not block v1.0.15, but
the raw endpoint is exposed to any API-key caller today.

## 5. TDD plan

### Unit (vitest, new `tests/unit/tools/effort.test.ts` + updates)

Red first, then implement:

1. Payload builder: estimate-only change echoes accepted/auto-accept/billing values verbatim;
   only requested users included; total echoed when input omits it; total overridden when given.
2. Unknown `userId` -> actionable error, no PUT attempted.
3. Milestone/summary kind -> rejection, no PUT attempted.
4. Task/project mismatch -> rejection.
5. Input validation: negative hours, minutes > 59.
6. Registration: read tool always present; write tool absent without `mcp:write`
   (pattern of `progress.test.ts:110-124`); per-handler insufficient-scope response.
7. Update `tests/unit/auth/scope-enforcement.test.ts` (`WRITE_TOOL_NAMES` 16 -> 17,
   `update_task_effort` added to `src/auth/effective-user-context.ts`).

### E2E (vitest e2e config, local API, cleanup via existing helpers)

New `tests/e2e/effort.e2e.test.ts` using `tests/helpers/local-api.ts`:

1. Create project + task, assign the e2e user via `update_task` TaskMembers.
2. `get_task_effort` returns the assignment with a `TaskUserId`.
3. `update_task_effort` sets 3h30m for the user; readback shows 3/30; SQL asserts
   `tblTaskUser.intEstimatedHours=3, intEstimatedMins=30`, `IsAutomaticActualEffortAccepted`
   still 1, `BillingCategoryId` unchanged, `ActualEffortAccepted*` unchanged.
4. Preservation: `tblTask.intTaskEstHour/intTaskEstmin` unchanged when `taskTotalEstimate`
   omitted; changed when provided. `tblTaskWorkTime` row count and values unchanged by an
   estimate-only update (verifies the CategoryEfforts echo, Section 3.2 step 5).
5. Negatives: unassigned user, milestone task, wrong projectId -> tool errors, SQL unchanged.
6. Cleanup: `deleteTasksViaRest` + `deleteProjectViaRest` in `afterAll`.

Kill any orphan MCP on port 6170 before re-running after code changes
(established pitfall, `project_e2e_orphan_server`).

### UI verification (house rules)

After the E2E write, open the task's Effort dialog in the local web UI with Playwright MCP and
screenshot the per-user estimate to `.playwright-mcp/` (pattern of the Gantt verification in
the milestones spec). No ITM.UI-E2E-Testing change: this work touches only ITM.MCP, which is
not one of the four repos whose deployments trigger that suite; behavior is covered by the MCP
E2E suite above. (The Section 4 hardening ticket, when done in ITM.Tasks, carries its own E2E
obligation.)

## 6. Documentation plan

| Artifact | Change |
|---|---|
| `README.md` | Tool count 42 -> 44; add `get_task_effort` to Read Tools, `update_task_effort` to Write Tools; "What Can an Agent Do?" gains per-user estimation phrasing |
| `tests/e2e/auth.e2e.test.ts` | Expected tool list + `toHaveLength(44)` |
| `APIDocs/src/content/tool-supplement.ts` | Two entries (read: Tasks category; write: Write Operations) |
| `APIDocs/src/content/sections/{en,es}/changelog.md` | v1.0.15 entry |
| Tool manifest | `npm run build` then `tsx scripts/generate-tool-manifest.ts` (with `ITM_CUSTOM_FIELD_CONTEXT=off`) |
| [INDEX.md](INDEX.md) | Inventory + counts; P2 #15 -> done, #11 -> partially covered; spec row in Active Specs |
| Public REST docs | None required (endpoints already public v2; no contract change) |

## 7. Rollout

1. Implement with TDD in ITM.MCP; `npm test` green; `npm run build` clean (auto-bumps to v1.0.15).
2. Local E2E + Playwright MCP verification per Section 5.
3. Deploy to stage via pipeline (never manually); re-run E2E against stage per
   `ref_stage_mcp_e2e`; kill orphan MCP on 6170 first.
4. Prod pipeline with approval; npm publish happens via the GitHub Actions workflow on `main`.
5. Reply in Help Scout 11634 (and close the estimation half); move this spec to `done/` with
   implementation notes.

## 8. Implementation notes (2026-07-22, v1.0.15)

Implemented as specced with three deltas found during TDD/E2E:

1. **Category echo must be filtered, not verbatim.** `EffortByCategory` also returns rows that
   merely project the assigned users' categories (all zeros, auto-accept true). Echoing them
   verbatim INSERTed `tblTaskWorkTime` rows that never existed (caught by the E2E row-count
   assert). The tool now echoes only rows carrying standalone data: nonzero unassigned or
   accepted effort, or `IsAutomaticActualEffortAccepted === false`.
2. **Validation must run before the effort GETs.** The effort GET endpoints themselves 500 on
   milestones, so the handler fetches the task detail first (pairing + kind checks), then the
   effort state. The task readback carries top-level `ProjectId` and `KindId` (verified
   empirically), so both checks work as designed.
3. **Task-total echo source confirmed.** `EffortByCategory[0].TotalEstimatedEffortHours/Mins`
   reflects `tblTask.intTaskEstHour/intTaskEstmin`; preservation and explicit-total writes are
   both SQL-asserted in E2E.

Verification: 467 unit tests green (21 new in `tests/unit/tools/effort.test.ts`); full local
E2E suite 94/94 (7 new in `tests/e2e/effort.e2e.test.ts` incl. SQL preservation asserts);
Playwright MCP UI check on the local Task Effort page shows the tool-written 5:15 estimate for
the assigned user with accepted effort untouched (screenshot in `.playwright-mcp/effort-dialog-verification.png`).
Note for future UI checks: TaskGeneral/TaskEffort pages render blank when opened by direct URL
without the `tk` query param; navigate via the project's Tasks tab.

## 9. Open questions

1. Product: should `taskTotalEstimate` even be exposed in v1, or always preserved? (Kanban UI
   derives it from the user sum; Waterfall lets it diverge.) Default proposal: expose optional,
   document that Kanban recomputes visually from user rows.
2. Product: is activity (service) estimation parity wanted later? Activities reuse the task
   pipeline; not fact-checked here.
3. Who owns the Section 4 ITM.Tasks hardening ticket and when?
