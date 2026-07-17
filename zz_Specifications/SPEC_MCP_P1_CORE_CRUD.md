# SPEC: P1 Core CRUD Tools

> **Date:** 2026-07-17
> **Backlog source:** [INDEX.md](INDEX.md) section "P1 -- High-impact gaps that block common workflows"
> **Scope:** 10 new tools (4 read, 6 write) closing the fundamental CRUD gaps
> **Status:** Implemented (v1.0.13). Unit and local E2E green. Stage verification pending.

---

## 1. Fact-Check of the P1 Section

Every P1 row in INDEX.md was verified against the ITM.Tasks controllers and the ITM.Web API gateway before implementation. Corrections found:

| # | INDEX.md claim | Verified reality |
|---|----------------|------------------|
| 2 | `update_risk` -- `PUT v2/.../Risks/{riskId}` | Confirmed, and PUT is the **only** v2 write that uses PUT ([RiskController.cs:299](../../ITM.Tasks/ITM.Tasks/Controllers/RiskController.cs#L299)). The MCP REST client had no `put` method; it was added. Semantics are still load-merge-save, so partial updates work like PATCH. |
| 3 | `update_issue` -- PATCH | Confirmed, but the issue payload uses **bare keys `Type`, `Status`, `Manager`** (integer BaseIds), not `TypeId`/`StatusId` like risks ([Issue.cs:401](../../ITM.Tasks/ITM.Tasks/Issue.cs#L401)). Same convention `create_issue` already handles via aliases. |
| 4 | `create_service` -- `POST v2/.../Services` | Confirmed. A service is a `Project` with `IsService=true`; the response is a `DetailResponseMessage` with only the new Id, so the tool reads back `GET Services/{id}`. Service types come from `getprojecttypes?IsService=true` (same pattern as `activitystatuses`). Status cannot be set at creation (account default applies), like projects. |
| 6-7 | `create_activity` / `update_activity` | Confirmed. `ServiceActivityController` reuses the same `ITaskManager` methods and `TaskDetail` model as project tasks with `IsActivity=true` ([ServiceActivityController.cs:151](../../ITM.Tasks/ITM.Tasks/Controllers/ServiceActivityController.cs#L151)), so the tools mirror `create_task`/`update_task` minus hierarchy (services have a flat activity list, no Gantt). |
| 10 | `search_tasks` -- `POST v2/.../Tasks` (account-wide) | **Route does not exist.** The account-wide endpoint is `v2/{AccountId}/Tasks/Search` ([TaskController.cs:246](../../ITM.Tasks/ITM.Tasks/Controllers/TaskController.cs#L246)), which takes an ITM.Framework `FilterExpression` payload and returns grid-column-filtered pages. Decision: implement via **DataMart** instead (an `$unwind` pipeline over components), consistent with `search_projects`/`search_services`, with simpler filters and project context per row. Documented eventual-consistency caveat applies. |

Confirmed as stated: `get_task` (#1), `get_risk` (#8), `get_issue` (#9), `update_service` (#5). Notes: the task GET-single default columns do **not** include effort fields (effort read stays in P2 #15); the issue GET-single has no default-column filter and returns the full serialized entity.

**Gateway routing:** all paths used below already have routes in [APIGateway.json](../../ITM.Web/ITM.API/APIGateway.json) or a dedicated handler (single task GET, [ApiGateway.cs:129](../../ITM.Web/ITM.API/App_Start/ApiGateway.cs#L129)). No changes needed outside ITM.MCP.

---

## 2. Tool Designs

All tools follow the existing patterns: read tools return `{ content: [JSON] }`; write tools are scope-gated (`mcp:write`), normalize reference IDs to BaseId, POST/PATCH/PUT then read back from v2 REST and verify the written fields, and return the readback with the stale-DataMart notice.

### Read tools

| Tool | Backend | File | Notes |
|------|---------|------|-------|
| `get_task` | `GET projects/{projectId}/tasks/{taskId}` (REST) | `src/tools/tasks.ts` | Full single-task detail (TaskDetail default columns). |
| `get_risk` | `GET projects/{projectId}/risks/{riskId}` (REST) | `src/tools/risks-issues.ts` | Includes MitigationPlan, ContigencyPlan, Probability, Impact, Level, Manager. |
| `get_issue` | `GET projects/{projectId}/issues/{issueId}` (REST) | `src/tools/risks-issues.ts` | Full issue entity (no column filter server-side). |
| `search_tasks` | DataMart `aggregateComponents` `$unwind` pipeline | `src/tools/tasks.ts` | Account-wide search across all projects. |

`search_tasks` pipeline (pure builder `buildSearchTasksPipeline`, unit-tested):

```
$match { componentType: project }            -- plus projectId narrowing when supplied
$unwind $tasks
$match { tasks.<field> filters }             -- query->name regex, status->statusLabel regex,
                                                assignee->teamMemberDisplayNames regex,
                                                category (Task|Milestone|Summary),
                                                dateFrom/dateTo on tasks.startDate/endDate
$project { projectId: $id, projectName: $name, task: $tasks }
$sort { task.endDate: 1 }
$skip / $limit                               -- clamped, default 50, max 200
```

A parallel count pipeline (`$group { _id: null, count: { $sum: 1 } }` + `$limit 1`) produces `total`/`hasMore`, mirroring `fetchSubcomponentPage`.

### Write tools

| Tool | Backend | Required fields | Reference normalization | Readback |
|------|---------|-----------------|-------------------------|----------|
| `update_risk` | `PUT projects/{id}/risks/{riskId}` | none (partial update) | TypeId/StatusId/ImpactId/ProbabilityId/LevelId vs risk* entities; alias ContingencyPlan->ContigencyPlan | `GET .../risks/{riskId}` |
| `update_issue` | `PATCH projects/{id}/issues/{issueId}` | none (partial update) | aliases TypeId->Type, StatusId->Status, Resolution->FinalResolution; Type/Status vs issue* entities | `GET .../issues/{issueId}` |
| `create_service` | `POST services` | Name, TypeId | none (service types are account custom types with no BaseId localization, parity with create_project); rejects StatusId at creation | `GET services/{id}` |
| `update_service` | `PATCH services/{serviceId}` | none | alias StatusId->ProjectStatusId (same as update_project) | `GET services/{serviceId}` |
| `create_activity` | `POST services/{id}/activities` | Name, StatusId, StartDate, EndDate | none (parity with create_task; description points at `activitystatuses`) | `GET .../activities/{id}` |
| `update_activity` | `PATCH services/{id}/activities/{activityId}` | none | alias Description->Details | `GET .../activities/{activityId}` |

Design details:

- **`update_risk`**: exposes `ContingencyPlan` (correct spelling) as an alias for the backend field `ContigencyPlan`. The REST client gained a `put` method (interface + factory + 401-retry parity with post/patch).
- **`update_issue`**: same alias set as `create_issue` so the two tools accept identical field names.
- **`create_service`**: rejects `StatusId`/`ProjectStatusId` with a pointer to `update_service` (backend always applies the account default status, same as `create_project`). New reference entity `servicetypes` (path `getprojecttypes?IsService=true`) added to `get_reference_data`.
- **`create_activity`/`update_activity`**: reject `KindId` and `ParentId` (service activities are a flat list; milestones/summary/hierarchy are project-task concepts) and `AssignedToUserId`/`PercentComplete` (same reasons as tasks). Activity statuses differ from task statuses; the tools point at the `activitystatuses` reference entity.

---

## 3. Cross-Cutting Changes

| Change | File |
|--------|------|
| `put` method on the REST client | `src/clients/rest-client.ts` |
| 6 new names in `WRITE_TOOL_NAMES` (now 16) | `src/auth/effective-user-context.ts` |
| `servicetypes` reference entity | `src/tools/reference-data.ts` |
| Register read tools; `registerRisksIssuesTools`/`registerTasksTools` unchanged signatures | `src/server.ts` (no change needed; write tools already gated) |
| README tool tables and count (30 -> 40: 24 read, 16 write) | `README.md` |
| Tool manifest regenerated for APIDocs | `APIDocs/src/content/tool-manifest.json` |

## 4. Tests

- **Unit (TDD)**: pure builders first (`buildSearchTasksPipeline`, `splitUpdateRiskArgs`, `splitUpdateIssueArgs`, `splitCreateServiceArgs`, `splitUpdateServiceArgs`, `splitCreateActivityArgs`, `splitUpdateActivityArgs`), then handler tests with a fake `clients.rest`/`clients.datamart` covering scope gating, normalization, readback verification, and rejection messages. REST client `put` tested in `tests/unit/clients/rest-client.test.ts` (verb, headers, 401 retry).
- **Scope enforcement**: `tests/unit/auth/scope-enforcement.test.ts` count updated to 16 write tools.
- **E2E (local)**: `tests/e2e/p1-core-crud.e2e.test.ts` -- creates a service, activity, risk, and issue via the new tools against the local ITM.API, updates each, reads each back with the new read tools, uses `search_tasks` on a seeded project, and cleans up.
- **Stage**: same flows exercised against the deployed stage MCP with the OAuth/REST recipe in memory (`ref_stage_mcp_e2e`).

No UI changes, so no ITM.UI-E2E-Testing additions (MCP has no browser surface; the platform E2E suite covers the v2 endpoints already exercised by the web UI).

## 5. Out-of-Repo Impacts

None. All backend endpoints and gateway routes already exist in stage and prod (they serve the ITM Platform web UI today). Verified during fact-check; re-verified by stage E2E.

## 6. INDEX.md Updates

- P1 rows #1-#10 marked done (v1.0.13); backend column for #10 corrected to the DataMart decision.
- Decision Log: DataMart chosen over `Tasks/Search` REST for account-wide task search; `servicetypes` reference entity added.
- `SPEC_MCP_WRITE_TOOL_FIXES.md` moved to `done/` (was flagged in the spec index).
