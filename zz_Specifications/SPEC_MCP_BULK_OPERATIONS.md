# MCP Bulk Operations -- Remaining Phases

> **Status:** Phases 2-3 pending owner decisions (Section 4).
> **Phase 1 (delivered):** `bulk_update_task_status` and `bulk_update_activity_status` shipped in v1.0.10 (2026-07-16). See `done/SPEC_MCP_BULK_STATUS_TOOLS.md`.
> **Scope:** ITM.MCP (tools), ITM.Tasks (v2 endpoints), ITM.API (gateway), ITM.APIDocs (openapi.json)

---

## 1. Backend Bulk Endpoints Not Yet Exposed to MCP

| Route | What it does | Notes |
|---|---|---|
| `Projects/{pid}/Tasks/Gantt` | Bryntum sync (arrays of tasks, deps, assignations) | Gantt-specific shape, not suitable for general bulk |
| `Projects/{pid}/Tasks/Batch` | Array insert/update, phantom-ID mapping | Undocumented, Gantt-shaped |
| `MassUpdateTasks` | One field-set applied to N task IDs, one transaction | Internal only, not gateway-routed |
| `Entity/{entity}/MassUpdateOperation` | Async job wrapping MassUpdateTasks | Gateway-routed, for Phase 3 |
| `Portfolio/Gantt`, `Programs/{id}/Gantt` | Multi-project schedule save | Gantt-specific |

**No bulk project field update exists anywhere** in the backend.

### Reusable internal machinery

- `ITaskManager.UpdateTasks(List<JToken>)` -- the per-item-fields plural update path already exists. The single-task PATCH wraps one task in a list and calls this. Phase 2 can reuse it directly.
- All existing batch controllers wrap writes in one DB transaction with rollback on failure.
- `MassUpdateOperation` implements the register-job-process-in-background pattern via `ServiceJob` (Phase 3 engine).
- `IsService`/`IsActivity` discriminators mean any bulk implementation on `ITaskManager`/`IProjectManager` automatically serves services and activities.

### MCP client hardening (partially done)

| Item | Status |
|---|---|
| Per-request timeout (`AbortController`) | Done (opt-in, bulk tools use 90 s) |
| Exponential backoff on 429/5xx | Pending |
| Concurrency cap | Pending |
| Default timeout for all calls | Pending |

---

## 2. Phase 2 -- General-purpose bulk field update

For non-status updates (dates, priority, names, custom fields).

**Tasks:** `POST v2/{co}/Projects/{pid}/Tasks/BulkUpdate`

```json
{
  "Tasks": [{ "Id": 123, "StatusId": 5, "EndDate": "2026-08-01" }, ...],
  "SuppressNotifications": true
}
```

- Thin controller over existing `ITaskManager.UpdateTasks(List<JToken>)` -- manager layer needs no changes.
- One DB transaction, all-or-nothing. Cap: 100 items.
- Response: per-item `{ Id, ok }` array plus summary counts.

**Projects:** `POST v2/{co}/Projects/BulkUpdate`, same shape. Requires a loop over `IProjectManager.UpdateProject` inside one transaction (no list overload exists). Cap: 50 (heavier per-item side effects).

**Services/activities:** mirror routes (`Services/BulkUpdate`, `Services/{sid}/Activities/BulkUpdate`) calling the same managers with `IsService`/`IsActivity` = true.

**MCP tools:** `bulk_update_tasks`, `bulk_update_projects`, and if owner approves service writes (Section 4.4), `bulk_update_activities`/`bulk_update_services`.

**Also required:** APIGateway.json routes, openapi.json documentation, NUnit + MCP unit/e2e tests.

---

## 3. Phase 3 -- Async mass operations (optional)

For thousands of items or cross-project sets. Reuse `MassUpdateOperation` (already gateway-routed, async `ServiceJob`). Add `start_mass_update` + `get_operation_status` MCP tools. Do not build speculatively -- Phase 2 chunking may make this unnecessary.

---

## 4. Open Questions (Owner Decisions)

1. **Atomicity (Phase 2):** all-or-nothing per request (recommended, free with existing transaction pattern) vs. partial success with per-item errors?
2. **Caps:** 100 tasks / 50 projects per request. Raise Phase 1's 100 toward 200 after stage latency measurement?
3. **Notification suppression:** should bulk updates suppress per-task mail jobs? Options: `SuppressNotifications` flag (proposed, default true), `UserId == -99` convention (loses attribution), or aggregated digest.
4. **Service/activity writes:** services and activities are read-only in MCP. Should writes (even single-entity) be enabled?
5. **Phase 3 trigger:** what real-world volume justifies the async tools?
6. **`/Tasks/Batch`:** document publicly, or keep internal?

---

## 5. Industry Reference Points

| Aspect | Pattern |
|---|---|
| Batch caps | Asana 10, Graph 20, HubSpot 100, Salesforce 200, Jira 1,000 (async) |
| Atomicity | Google AIP-233: sync batch must be atomic; async may do partial success |
| Sync/async crossover | ~few hundred items; Jira/Shopify go async above that |
| MCP tool design | Anthropic guidance: consolidate multi-call workflows into single tools; compact per-item summaries, not full readbacks |
