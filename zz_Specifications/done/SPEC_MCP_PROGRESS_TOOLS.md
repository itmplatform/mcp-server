# MCP progress tools

**Source:** [SPEC_HELPSCOUT_11535 section 1](../SPEC_HELPSCOUT_11535_TIME_TRACKING_FOLLOWUP_REPORTING.md#1-progress--seguimiento-tools-the-mcp-deliverable)
**Status:** Implemented locally (ITM.Tasks + ITM.Web gateway + ITM.MCP), all unit and E2E tests green on 2026-07-13. Pending deployment via pipeline.
**Scope:** ITM.MCP plus the backend prerequisites below

This document is the implementation spec for the four MCP progress tools identified in Help Scout 11535. Everything about the customer context, the other three work items (time entries, DataMart, Clockify connector), and the delivery order lives in the parent spec -- do not duplicate it here.

---

## Why PercentComplete cannot live on update_task

The spec's claim that "Seguimiento is a separate domain from time entry" is verified and correct, but the wording is misleading. What matters for MCP is not the domain boundary, but the mechanical reason:

**`TaskDetail.Completed` is a computed getter** that returns `FollowUp.Percentage` from the latest `tblTaskFollowUp` record ([TaskDetail.cs:653](../../../ITM.Tasks/ITM.Tasks/TaskDetail.cs)). There is no setter. The v2 `UpdateTask` method never reads `Completed` or `PercentComplete` from the incoming JObject -- it would silently ignore it.

Even if the backend accepted the field, setting a percentage directly would bypass five side effects that the follow-up pipeline provides:

1. **Task status transitions** -- 100% auto-sets the first Completed status; dropping below 100% from Completed reverts to InProgress ([TaskFollowUpManager.cs:211-261](../../../ITM.Tasks/ITM.Tasks/TaskFollowUpManager.cs)).
2. **Parent rollups** -- automatic follow-up for parent (summary) tasks, recursing up the hierarchy ([TaskFollowUpManager.cs:125-173](../../../ITM.Tasks/ITM.Tasks/TaskFollowUpManager.cs)).
3. **Automatic project progress** -- when `AutoProjectFollowUpForMainTask` is true, creates a `tblProjectFollowUp` record and can auto-close the project at 100% ([ProjectFollowUpManager.cs:33, 139-160](../../../ITM.Tasks/ITM.Tasks/ProjectFollowUpManager.cs)).
4. **Events** -- fires `task-updated` and `project-updated` events via the action handler.
5. **Email notifications** -- schedules async notification jobs for task and project follow-up.

The MCP already rejects `PercentComplete` on both `create_task` and `update_task` with the message "task progress is managed through follow-up/progress APIs, not task PATCH" ([write-tools.ts:100, 110](../../src/tools/write-tools.ts)).

---

## Backend prerequisites (ITM.Tasks)

The v2 controller (`TaskFollowUpController.cs`) exposes POST and PATCH but **no GET**. The API gateway already routes `v2/{company}/projects/{id}/tasks/{id}/progress[/{id}]` to ITM.Tasks (APIGateway.json lines 815-831), so no gateway changes are needed -- only a GET handler in the controller.

| What | Status | What was done |
|---|---|---|
| `POST .../progress` | Exists | Nothing |
| `PATCH .../progress/{id}` | Exists | Nothing |
| `GET .../progress` (list) | **Done 2026-07-13** | `GetTaskProgress` added to `TaskFollowUpController.cs`; scoped manager overload `GetTaskFollowUps(accountId, projectId, taskId, userId, languageId)` returns null (controller 404) on cross-tenant or task/project mismatch |
| `GET .../progress/{id}` (single) | **Done 2026-07-13** | `GetTaskProgressDetail` added; scoped manager overload `GetFollowUpDetails(...)` also validates the follow-up belongs to the task |
| `GET v2/{id}/Assessments` | **Done 2026-07-13** | New `AssessmentController` in ITM.Tasks calling the existing `GetAllAssessmentsForAccount`, plus a gateway entry in APIGateway.json |
| `GET .../ProgressReports` | Exists | Nothing |

Implementation notes:
- The DA `GetTaskFollowUps` query was widened from 3 columns to `SELECT tf.*` so the list returns full rows; its only other consumer (revenue recognition) reads a subset and is unaffected.
- The list is returned in full, newest first, without pagination. Per-task follow-up volumes are small (tens of rows); pagination can be added later without breaking the tool contract.
- Assessment IDs are `intAssesmentBaseId` values (language-independent); this is what `IsAssessmentValid` checks and what `create_task_progress.assessmentId` must carry.

The v1 API (ITM.Web) has full CRUD for task progress at `{company}/project/{id}/task/{id}/progress[/{id}]`, including GET list and detail. This path does NOT route through the gateway's v2 rules (the gateway entry matches `v2/{company}/projects/...` with capital-P `projects`). A v1 fallback is possible for initial readback but is not the target.

**Recommended approach:** add the two GET handlers to `TaskFollowUpController.cs` in ITM.Tasks before implementing MCP tools. This keeps all MCP REST calls on v2, matching the existing tool patterns. This is a small change -- the DA already has `GetTaskFollowUps(taskId)` and `GetFollowUpDetails(taskFollowUpId)` ([ITaskFollowUpManagerDA.cs:11-17](../../../ITM.Tasks/ITM.Tasks/DA/ITaskFollowUpManagerDA.cs)); only the controller methods (plus account/project/task ownership validation) are missing.

### Can the backend change be avoided? (verified 2026-07-13)

Strictly, 3 of the 4 tools work today with zero backend change: the v2 POST, PATCH, and `ProgressReports` GET all exist. What breaks without the new GET handlers is `list_task_progress` and the write-readback convention. Every alternative was checked and rejected:

- **Gateway fallthrough to v1:** does not happen. Gateway entries match by URL regexp only, not by HTTP verb (APIGateway.json lines 815-831), so `GET v2/.../progress` already routes to ITM.Tasks and 404s there because no handler exists.
- **Use the v2 write response as readback:** insufficient. Both `InsertTaskProgress` and `UpdateTaskProgress` return only a `DetailResponseMessage` (Id, StatusCode, StatusMessage), never the saved record ([TaskFollowUpController.cs:49-55](../../../ITM.Tasks/ITM.Tasks/Controllers/TaskFollowUpController.cs)).
- **Call the v1 GET endpoints:** mechanically possible (the MCP sends a `Token` header, which is exactly what the v1 controller reads), but rejected. The parent spec explicitly forbids a permanent v1 fallback, and the v1 detail endpoint loads the row via `TblTaskFollowUp.Select(taskFollowUpId)` with no check that the row belongs to the validated task or account ([TaskFollowUp.cs:166-172](../../../ITM.Web/ITM.BusinessAccess/TaskFollowUp.cs)). That is the same unscoped-row-lookup pattern as the open cross-tenant leak ticket [2026-07-07-cross-tenant-project-progress-leak.md](../../../ITM.Web/zz_Tickets/2026-07-07-cross-tenant-project-progress-leak.md), so this surface is expected to be reworked, not built upon.
- **Read from DataMart:** not available. DataMart has no per-task progress rows today; the draft spec to add them ([project-task-progress-history.md](../../../ITM.DataMart/zz_Specifications/project-task-progress-history.md)) itself requires a new ITM.Tasks bulk endpoint, so it is a larger backend change, not an alternative. DataMart is also asynchronous (up to 60s), which disqualifies it for write readback regardless.
- **Partial readback via task detail GET:** the v2 task detail only reflects the latest follow-up percentage. A backdated entry would not appear, and none of the created record's other fields could be verified. Degrades the tool contract.

Conclusion: the two GET handlers are the only supportable path for `list_task_progress` and full readback, and they are the smallest change available since the manager/DA read methods and gateway routes already exist.

For assessments, the simplest path: add `'assessments'` to the `ALLOWED_ENTITIES` list in `reference-data.ts` after verifying the v1 route `{company}/Assessments` works through the MCP REST client path. The v1 `AssessmentController` at `ITM.Web/ITM.API/Controllers/AssessmentController.cs` serves `GET {AccountName}/Assessments`. If this does not resolve through the `v2/{company}/` prefix (likely, since the gateway has no entry for it), then either:
- Add a gateway entry mapping `v2/{company}/assessments` to the existing v1 controller (no new code, just a gateway config line), or
- Add an `AssessmentReferenceController` in ITM.Tasks with a `GET v2/{AccountId}/Assessments` route plus a gateway entry.

---

## Tool surface

Four tools, all registered as write tools (gated on `mcp:write` scope). The first three touch task progress; the fourth reads project progress history.

### 1. `list_task_progress`

List progress entries for a task, newest first.

**Input:**

| Field | Type | Required | Description |
|---|---|---|---|
| `projectId` | number | yes | Project containing the task |
| `taskId` | number | yes | Task to list progress for |

**REST call:** `GET Projects/{projectId}/Tasks/{taskId}/progress`

**Output:** Array of progress records, each containing:

| Field | Source column/property |
|---|---|
| `TaskFollowUpId` | `intTaskFollowUpId` |
| `TaskId` | `intTaskId` |
| `AssessmentId` | `intAssessment` |
| `Percentage` | `intPercentage` |
| `ShortDescription` | `ntextAssementShortDescription` |
| `Description` | `ntextAssementDescription` |
| `ReportDate` | `dtFollowup` |
| `IsCompleted` | `blnCompleted` |
| `CreatedBy` | `intCreatedBy` |

This is a read tool. Register it regardless of write scope.

### 2. `create_task_progress`

Create a new progress entry for a task. Triggers all follow-up side effects (status transitions, parent rollups, project progress, events, notifications).

**Input:**

| Field | Type | Required | Description |
|---|---|---|---|
| `projectId` | number | yes | Project containing the task |
| `taskId` | number | yes | Task to report progress on |
| `reportDate` | string | yes | ISO 8601 date (e.g. `2026-07-13`) |
| `percentage` | number | yes | Progress percentage, 0-100 |
| `assessmentId` | number | yes | Assessment rating ID. Use `get_reference_data({ entity: 'assessments' })` to discover valid values |
| `shortDescription` | string | yes | Brief progress summary |
| `description` | string | no | Detailed progress notes (rich text) |

**REST call:** `POST Projects/{projectId}/Tasks/{taskId}/progress`

**Payload mapping:**

```json
{
  "ReportDate": "<reportDate>",
  "Percentage": "<percentage>",
  "AssessmentId": "<assessmentId>",
  "ShortDescription": "<shortDescription>",
  "Description": "<description>",
  "AutoProjectFollowUp": true
}
```

`AutoProjectFollowUp: true` preserves existing behavior -- the UI always sends it. This ensures that creating task progress cascades to project-level progress when the account/project is configured for it.

**Readback:** Extract the created ID from `DetailResponseMessage.Id`, then `GET Projects/{projectId}/Tasks/{taskId}/progress/{id}` and return the full record.

**Verification fields:**

| Request field | Read paths |
|---|---|
| `Percentage` | `Percentage`, `intPercentage` |
| `ShortDescription` | `ShortDescription`, `ntextAssementShortDescription` |
| `AssessmentId` | `AssessmentId`, `intAssessment` |

### 3. `update_task_progress`

Update an existing progress entry.

**Input:**

| Field | Type | Required | Description |
|---|---|---|---|
| `projectId` | number | yes | Project containing the task |
| `taskId` | number | yes | Task the progress belongs to |
| `progressId` | number | yes | ID of the progress entry to update |
| `reportDate` | string | no | ISO 8601 date |
| `percentage` | number | no | Progress percentage, 0-100 |
| `assessmentId` | number | no | Assessment rating ID |
| `shortDescription` | string | no | Brief progress summary |
| `description` | string | no | Detailed progress notes |

At least one optional field must be supplied.

**REST call:** `PATCH Projects/{projectId}/Tasks/{taskId}/progress/{progressId}`

**Payload:** Only fields supplied by the caller, mapped using the same key names as `create_task_progress`.

**Readback:** `GET Projects/{projectId}/Tasks/{taskId}/progress/{progressId}`, same verification as create.

### 4. `get_project_progress`

Get the project progress report: expected curve, baseline expected curve, and historical follow-up entries.

**Input:**

| Field | Type | Required | Description |
|---|---|---|---|
| `projectId` | number | yes | Project to get progress for |

**REST call:** `GET Projects/{projectId}/ProgressReports`

**Output:** The `ProjectFollowUpGraph` object, containing:
- `Expected` -- time-based expected progress curve computed from task dates and working days
- `BaselineExpected` -- same but using baseline dates
- `FollowUps` -- historical actual progress entries (date + percentage)

This is a read tool. Register it regardless of write scope.

---

## Assessment reference data

Add `'assessments'` to the `ALLOWED_ENTITIES` array in [reference-data.ts](../../src/tools/reference-data.ts) and update the tool description to include it.

The `tblAssesment` table stores per-account assessment ratings with fields: `intAssesmentId`, `strAssesmentName`, `strAssesmentDesc`, `intAssesment`, `intLanguageId`. The `assessmentId` parameter in `create_task_progress` must match one of these records for the caller's account.

Assessment is mandatory for main-task follow-ups. Validation is in [TaskFollowUpManager.cs:283-297](../../../ITM.Tasks/ITM.Tasks/TaskFollowUpManager.cs):
- `AssessmentId` must be > 0
- `AssessmentManager.IsAssessmentValid(accountId, assessmentId)` must return true

---

## Implementation plan

### File organization

Create a new file `src/tools/progress.ts` following the pattern of existing tool files. Export `registerProgressTools(server, clients)` and import/call it from `src/server.ts`.

### Registration

| Tool | Scope gate | Rationale |
|---|---|---|
| `list_task_progress` | none (read) | Read-only, same as other list tools |
| `create_task_progress` | `mcp:write` | Write operation |
| `update_task_progress` | `mcp:write` | Write operation |
| `get_project_progress` | none (read) | Read-only |

Add `create_task_progress` and `update_task_progress` to `WRITE_TOOL_NAMES` in [effective-user-context.ts](../../src/auth/effective-user-context.ts).

### REST paths

All calls use `clients.rest` (v2 base URL). Path templates:

```
GET    Projects/{projectId}/Tasks/{taskId}/progress              (list)
POST   Projects/{projectId}/Tasks/{taskId}/progress              (create)
GET    Projects/{projectId}/Tasks/{taskId}/progress/{progressId} (readback)
PATCH  Projects/{projectId}/Tasks/{taskId}/progress/{progressId} (update)
GET    Projects/{projectId}/ProgressReports                       (project progress)
```

### Write tool pattern

Follow the exact pattern from existing write tools in [write-tools.ts](../../src/tools/write-tools.ts):

1. Check `mcp:write` scope; return `buildInsufficientScopeResponse()` if missing.
2. Split path params from body, normalize field names.
3. POST or PATCH via `clients.rest`.
4. Extract ID from response with `extractResponseId`.
5. GET readback from the same path.
6. Verify requested fields with `verifyRequestedFields`.
7. Return `buildWriteResponse(readback)`.

Import `buildWriteResponse`, `buildInsufficientScopeResponse`, `extractResponseId`, `verifyRequestedFields`, and `STALE_AFTER_WRITE_NOTICE` from `write-tools.ts`. If they are not currently exported, export them.

### Payload field mapping

The v2 controller reads fields from the JObject using `ValueHelper.Instance.GetUpdatedValue`. The entity class ([TaskFollowUp.cs](../../../ITM.Tasks/ITM.Tasks/TaskFollowUp.cs)) reads these keys:

| MCP input | v2 payload key | Notes |
|---|---|---|
| `reportDate` | `ReportDate` | Also reads `Date` (both map to same property; prefer `ReportDate`) |
| `percentage` | `Percentage` | Integer 0-100 |
| `assessmentId` | `AssessmentId` | |
| `shortDescription` | `ShortDescription` | |
| `description` | `Description` | |
| (hardcoded) | `AutoProjectFollowUp` | Always `true` |

Do NOT send `CreatedBy`, `IsEntryFromSlack`, or `IsCompleted` -- these are internal.

---

## Testing

### Unit tests (vitest)

Test file: `src/tools/__tests__/progress.test.ts`

Core cases:
1. **`list_task_progress`** -- calls `GET Projects/{projectId}/Tasks/{taskId}/progress` with correct path; returns formatted response.
2. **`create_task_progress`** -- sends correct POST body; extracts ID from response; performs readback GET; verifies fields; returns `buildWriteResponse`.
3. **`create_task_progress` scope check** -- returns insufficient-scope response when `mcp:write` is missing.
4. **`create_task_progress` field mapping** -- `reportDate` maps to `ReportDate`, `percentage` to `Percentage`, etc. `AutoProjectFollowUp` is always included.
5. **`update_task_progress`** -- sends only supplied fields in PATCH body; performs readback; verifies.
6. **`update_task_progress` requires at least one field** -- rejects if no optional fields are provided.
7. **`get_project_progress`** -- calls `GET Projects/{projectId}/ProgressReports`; returns formatted response.
8. **Assessment in `get_reference_data`** -- `'assessments'` is an accepted entity value.

Follow the mocking pattern of existing tool tests -- mock `clients.rest.get`, `clients.rest.post`, `clients.rest.patch`.

### E2E tests

Done: `tests/e2e/progress.e2e.test.ts` passed 8/8 on 2026-07-13 against the local stack (MCP server, ITM.API gateway, ITM.Tasks, SQL Server). It covers:
1. All four tools listed by the server.
2. Assessment discovery through `get_reference_data` (MCP and direct REST).
3. Create a progress entry on its own test project/task and verify the readback.
4. List progress and verify the entry appears.
5. Update the entry, verify readback and the SQL row.
6. The automatic project progress cascade (`tblProjectFollowUp` row created).
7. `get_project_progress` returns the graph.
8. Scoping negative: a task outside the project returns an error.

Cleanup: the suite deletes its own task and project in `afterAll`, which removes the follow-up rows.

---

## Acceptance criteria

From the [parent spec](../SPEC_HELPSCOUT_11535_TIME_TRACKING_FOLLOWUP_REPORTING.md#acceptance-criteria):

- [x] Progress creates and updates preserve the existing side effects: the MCP calls the same v2 POST/PATCH pipeline; the project-progress cascade was verified E2E in SQL, and status transitions and parent rollups are covered by the existing `TestTaskFollowUp` unit tests.
- [x] PM scope prevents writes outside managed projects: the GET routes reuse the same gateway entries (project-specific rights on `TaskFollowUp.aspx`) as the existing POST/PATCH, and the new manager methods reject cross-account and cross-project access (verified with 404s and an E2E negative test).
- [x] Created and updated progress is read back and returned.
- [x] Assessment references are discoverable (`get_reference_data({ entity: 'assessments' })`) and validated server-side by the pre-existing `IsAssessmentValid`.
- [x] `list_task_progress` returns the full history for a task, newest first.
- [x] `get_project_progress` returns the expected/baseline/actual curves.
- [x] All existing tests pass (ITM.Tasks 2,654; MCP unit 273; MCP E2E 42/42). New tools have unit tests.
- [x] Build succeeds with no new errors or warnings (ITM.Tasks msbuild clean, MCP `tsc` clean; pre-existing warnings in ITM.Tasks.Test2 are untouched).

---

## README update

Done: [README.md](../../README.md) now says 27 MCP tools and lists the new tools in the Read Tools and Write Tools tables.

---

## Out of scope

- Service/activity progress tools (`create_activity_progress`, etc.) -- separate increment per parent spec.
- Project-level progress create/update (`create_project_progress`) -- separate increment.
- Delete progress -- not planned for MCP.
- ~~APIDocs updates~~ -- done on 2026-07-13: manifest regenerated (27 tools), supplement entries added (including the previously undocumented service subcomponent tools), write-operations and changelog updated in EN and ES.
