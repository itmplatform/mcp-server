# MCP Bulk Status Tools (Phase 1 of Bulk Operations)

> **Status:** IMPLEMENTED -- shipped in MCP server v1.0.10 (2026-07-16); see "Implementation notes" at the end for deltas found during fact-check
> **Date:** 2026-07-16
> **Parent spec:** [SPEC_MCP_BULK_OPERATIONS.md](../../ITM.Web/zz_Specifications/SPEC_MCP_BULK_OPERATIONS.md) (ITM.Web repo) -- full research, fact-check, and the Phase 2/3 roadmap
> **Replaces (partially):** roadmap item 23 `bulk_update_tasks` in [SPEC_MCP_SERVER.md](done/SPEC_MCP_SERVER.md) (this spec covers the status-change subset)

---

## Summary

Add two MCP tools that expose the **already existing, gateway-routed, publicly documented** bulk status endpoints of ITM.Tasks:

| New tool | Backend endpoint (already live) |
|---|---|
| `bulk_update_task_status` | POST `v2/{co}/projects/{projectId}/UpdateTaskStatuses` |
| `bulk_update_activity_status` | POST `v2/{co}/services/{serviceId}/UpdateActivityStatuses` |

This turns "close all 1,000 tasks" from 1,000 `update_task` calls (2,000 HTTP requests, ~11 minutes of network floor at the 3 req/s API limit, context overflow) into ~10 tool calls. It is entirely an ITM.MCP change: no ITM.Tasks, gateway, or openapi.json work.

Out of scope here (see parent spec): arbitrary-field bulk updates, bulk **project** updates (no backend endpoint exists yet), async mass operations, notification suppression.

---

## 1. Backend Contract (verified 2026-07-16)

### 1.1 Tasks

`POST v2/{AccountId}/Projects/{ProjectId}/UpdateTaskStatuses` -- `ITM.Tasks/Controllers/TaskController.cs:569`. Gateway route: `APIGateway.json` (`.../updatetaskstatuses`). Documented in openapi.json as `bulkUpdateTaskStatus`.

Request body:

```json
{
  "TaskIds": "101,102,103",
  "SelectedStatus": 5,
  "SelectedStatusName": "",
  "ProjectMethodTypeId": 1
}
```

- `TaskIds`: comma-separated string of task IDs.
- `SelectedStatus`: status ID. **Kanban nuance:** when `ProjectMethodTypeId` is Kanban, this value is resolved as a `KanbanId` via `GetKanbanStatusFromKanbanId(ProjectId, StatusId)`; for waterfall it is a `TaskStatus` ID (`TaskManager.cs:1343-1357`).
- `SelectedStatusName`: alternative to the ID; used only when `SelectedStatus == 0` -- the server resolves name to ID (`TaskController.cs:589-593`).
- `UserId` and `LanguageId` arrive as query-string parameters supplied by the API Gateway from the authenticated token, same as the existing write tools.

Response: a JSON **array of `DetailResponseMessage`** (one per task): `Id` (task ID), `StatusCode`, `StatusMessage`. Correction (verified during implementation): the `IsValid` flag is `[JsonIgnore]` (`ITM.Framework/Common/DetailResponseMessage.cs:42`), so it never reaches the wire -- success must be detected as `StatusCode == 200`.

### 1.2 Activities

`POST v2/{AccountId}/Services/{ServiceId}/UpdateActivityStatuses` -- `ServiceActivityController.cs:301`. Identical payload; note the body key for the IDs is **also `TaskIds`** (not `ActivityIds`), because activities are `TaskDetail` rows with `IsActivity=true` and reuse `ITaskManager`.

### 1.3 Execution semantics (verified in code)

- The whole request runs in **one DB transaction**. An unhandled exception rolls back everything and returns 500 with a single error message (`TaskController.cs:573-608`).
- Per-task validation failures do not throw: the loop continues, valid tasks commit, and the response array carries a per-task message. So the response must be inspected item by item.
- Correction (verified e2e): a **nonexistent task ID is not a per-item failure**. `GetTaskDetail` returns null and `CreateTaskObject` dereferences it (`TaskManager.cs:1315`, `:1330`), so the whole chunk 500s and rolls back, including tasks already processed in that chunk. Per-item failures only occur for validation errors on existing tasks.
- Each task goes through the **full single-task update pipeline** (`TaskManager.UpdateTaskStatuses:2065` loops `UpdateTaskStatus:1312`, which calls `UpdateTasks` with a one-item list). Per task that means: task reload, status resolution, cache invalidation, domain events, Kanban history, parent date rollups, project min/max date recompute, related recalculation jobs, and a queued notification mail job. Cost is linear and much heavier than a plain SQL UPDATE, which is why the tool caps the batch size.

---

## 2. Tool Specifications

Both tools live in `src/tools/write-tools.ts`, registered with the existing `server.registerTool` pattern, gated on the `mcp:write` scope at registration and call time (same as `update_task`). Audit logging comes free via `instrumentServer`.

### 2.1 `bulk_update_task_status`

Input schema (zod):

| Field | Type | Notes |
|---|---|---|
| `projectId` | `z.number()` | required |
| `taskIds` | `z.array(z.number()).min(1).max(100)` | required; **cap 100 per call** (see 3.1) |
| `statusId` | `z.number().optional()` | one of `statusId` / `statusName` required (runtime check) |
| `statusName` | `z.string().optional()` | server resolves to an ID |
| `projectMethodTypeId` | `z.number().optional()` | needed for Kanban ID resolution and name lookup |

Handler:

1. Scope gate (`buildInsufficientScopeResponse` if missing `mcp:write`).
2. Validate that `statusId` or `statusName` is present.
3. `POST projects/{projectId}/UpdateTaskStatuses` with `{ TaskIds: taskIds.join(','), SelectedStatus: statusId ?? 0, SelectedStatusName: statusName ?? '', ProjectMethodTypeId: projectMethodTypeId ?? 0 }`.
4. Map the response array to a **compact summary** -- no GET readbacks (unlike `update_task`), to stay far below the client-side tool-response token cap:

```json
{
  "requested": 100,
  "succeeded": 98,
  "failed": [ { "taskId": 104, "message": "..." } ]
}
```

5. Append the existing `STALE_AFTER_WRITE_NOTICE`.

Tool description must tell the agent to: collect IDs first (`list_project_tasks` / search), chunk into calls of at most 100 IDs, resolve valid status IDs via `get_reference_data` (statuses differ between waterfall and Kanban projects), and check the `failed` array of every chunk.

### 2.2 `bulk_update_activity_status`

Identical shape with `serviceId` + `activityIds`; calls `services/{serviceId}/UpdateActivityStatuses` and joins `activityIds` into the `TaskIds` body key.

Correction (found e2e): `statusName` must NOT be sent to the backend for activities. `ServiceActivityController.cs:324` resolves `SelectedStatusName` with `isActivity: false`, so names that exist in both lists (e.g. "In Progress") resolve to a **task** status ID; the update pipeline then finds no matching activity status and silently skips the item while still reporting success. The tool therefore resolves `statusName` client-side against `gettaskstatuses?IsService=true` and always sends the resolved ID. A new `activitystatuses` entity in `get_reference_data` exposes that list to agents.

---

## 3. Decisions and Constraints

### 3.1 Cap: 100 IDs per call (initial)

Rationale: each ID triggers the full update pipeline inside one HTTP request (Section 1.3) under the default 110 s ASP.NET execution timeout and a ~60 s MCP client tool timeout. 100 is conservative; measure real latency on stage and raise toward 200 if there is comfortable headroom. Industry reference points: HubSpot 100, Salesforce 200, Jira 1,000 (async).

### 3.2 Inherited behavior (accepted for Phase 1)

- **Notifications:** one mail job per task is enqueued, as with any UI-driven status change. Suppression requires a backend flag and is deferred to Phase 2 (parent spec, Section 7.3).
- **Atomicity:** exception = full rollback; validation failure = partial success with per-item messages. This is the endpoint's existing, UI-exercised behavior; do not change it from the MCP side.
- **Idempotency:** re-applying the same status is harmless, so retrying a failed or timed-out chunk is safe.

### 3.3 Client hardening prerequisite (recommended, not blocking)

`rest-client.ts` has no request timeout and no 429/5xx retry. A 100-task call is the longest request the MCP will make so far; adding an `AbortController` timeout (e.g. 90 s for these two tools) is strongly recommended in the same change. See parent spec, "Cross-cutting".

---

## 4. Testing

- **Unit (vitest):** payload construction (ID join, status fallbacks), cap enforcement, scope gating, response mapping including `failed` extraction, error propagation on 4xx/5xx.
- **E2E (vitest e2e config):** `tests/e2e/bulk-status.e2e.test.ts`, run against the local API per repo convention (`.env`), then re-run against stage after deployment. Covers: N tasks on a waterfall project, N tasks on a Kanban project (KanbanId resolution), N activities on a service (client-side name resolution), full-rollback behavior on a nonexistent ID, missing status validation, and tool cap publication. Creates its own projects/service and deletes them afterwards.
- **Manual checklist:** oversize array rejected client-side; call without `mcp:write` scope is refused. (Original "mixed valid/invalid IDs produce a `failed` list" does not hold for nonexistent IDs -- see Section 1.3 correction.)

---

## 5. Rollout

1. Implement both tools + tests in ITM.MCP. ✅
2. Update `README.md` tool table and tool count. ✅
3. No openapi.json changes needed (endpoints already documented); no gateway changes; no ITM.Tasks changes. ✅
4. Mark roadmap item 23 in `SPEC_MCP_SERVER.md` / `SPEC_PENDING_ITEMS.md` as partially delivered (status subset), pointing here and to the parent spec for the general-field remainder (Phase 2). ✅

---

## 6. Implementation Notes (2026-07-16, v1.0.10)

Shipped as specified, with these deltas:

- **Response mapping** uses `StatusCode == 200` per item (the spec's "validity flag" is `[JsonIgnore]` and absent from the wire).
- **Nonexistent IDs 500-roll-back the whole chunk** instead of appearing in `failed` (Section 1.3 correction); the tool propagates the REST error so the agent can retry safely (idempotent).
- **Activity `statusName` is resolved client-side** against `gettaskstatuses?IsService=true` because the backend resolves names against task statuses for activities and silently no-ops on the mismatch (Section 2.2 correction). Task `statusName` continues to resolve server-side.
- **New `activitystatuses` entity** in `get_reference_data` (maps to `gettaskstatuses?IsService=true`) so agents can discover valid activity status IDs; they were previously undiscoverable through MCP.
- **`rest-client.ts` timeout** (Section 3.3): `get`/`post`/`patch` accept an optional `timeoutMs` via `AbortController`; the bulk tools pass 90 s. No default timeout added for other calls.
- **Docs:** README (29 tools), APIDocs changelog + write-operations (en/es), tool-supplement narratives, regenerated tool-manifest; `WRITE_TOOL_NAMES` extended; the OAuth scope E2E spec in ITM.UI-E2E-Testing updated to the 20 read / 29 total counts.
