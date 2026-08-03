# MCP Tool Roadmap and Specification Index

> **Created:** 2026-07-17
> **Current version:** v1.0.17 (44 tools: 27 read, 17 write)

This document is the central index for MCP server tool development. It catalogs the current tool surface, the prioritized backlog of new tools and enrichments, and links to all specification documents.

---

## Current Tool Inventory

### Read Tools (24)

| Tool | What it does |
|------|-------------|
| `search_projects` | Find projects by name, status, type, date range (DataMart) |
| `get_project` | Project details with subcomponent counts, optional budget |
| `search_services` | Find services by name, status, type, date range (DataMart) |
| `get_service` | Service details with subcomponent counts, optional budget |
| `list_project_tasks` | Paginated task list for a project (DataMart) |
| `get_task` | Single task detail (REST) |
| `search_tasks` | Account-wide task search with name/status/assignee/kind/date filters (DataMart) |
| `list_service_activities` | Paginated activity list for a service (DataMart) |
| `get_project_budget` | Budget breakdown: top-down, bottom-up, forecast, actual |
| `get_project_purchases` | Paginated purchase orders for a project |
| `get_project_revenues` | Paginated revenue items for a project |
| `get_service_purchases` | Paginated purchase orders for a service |
| `get_service_revenues` | Paginated revenue items for a service |
| `get_project_risks` | Paginated risks for a project |
| `get_project_issues` | Paginated issues for a project |
| `get_risk` | Single risk detail with mitigation/contingency plans (REST) |
| `get_issue` | Single issue detail with resolution and impact fields (REST) |
| `list_task_progress` | Progress/follow-up history for a task (no pagination) |
| `get_project_progress` | Project progress curves: expected, baseline, actual |
| `get_task_effort` | Task effort breakdown per team member and per category (doubles as task team read) |
| `aggregate_portfolio` | Group projects by field with count/avg/sum metrics |
| `query_datamart` | Custom DataMart queries (escape hatch) |
| `search_users` | Find users by name or email (REST) |
| `get_user` | User profile with roles and contact info |
| `get_reference_data` | Statuses, types, priorities, and other lookup lists (19 entities) |

### Write Tools (16, gated by `mcp:write` scope)

| Tool | What it does |
|------|-------------|
| `create_project` | Create a project (Waterfall or Kanban) |
| `update_project` | Update project name, status, dates, priority, description |
| `create_task` | Create task, milestone (KindId 1), or summary task (KindId 2); TaskManagers/TaskMembers assign users (v1.0.17) |
| `update_task` | Update task fields: status, dates, kind, parent, etc.; TaskManagers/TaskMembers add assignees, add-only (v1.0.17) |
| `create_task_progress` | Report progress on a task (%, assessment, notes) |
| `update_task_progress` | Update an existing progress entry |
| `update_task_effort` | Set per-user estimated hours (read-modify-write; preserves accepted effort, billing, categories) |
| `create_risk` | Log a project risk with status, type, probability, impact, level |
| `update_risk` | Update risk fields including mitigation/contingency plans (PUT) |
| `create_issue` | Log a project issue with type and status |
| `update_issue` | Update issue fields including resolution |
| `create_service` | Create a service (account default status applies) |
| `update_service` | Update service name, status, dates, priority |
| `create_activity` | Add an activity to a service (flat list) |
| `update_activity` | Update activity fields |
| `bulk_update_task_status` | Apply one status to up to 100 tasks |
| `bulk_update_activity_status` | Apply one status to up to 100 service activities |

---

## Prioritized Backlog

Priority is based on: how often agents and users need the capability, whether the backend endpoint already exists, and implementation complexity.

### P1 -- High-impact gaps that block common workflows

These are capabilities that agents hit regularly and cannot work around. Fact-checked and implemented in [SPEC_MCP_P1_CORE_CRUD.md](SPEC_MCP_P1_CORE_CRUD.md).

| # | Tool / Enrichment | Type | Backend | Notes |
|---|-------------------|------|---------|-------|
| 1 | `get_task` | New read | `GET v2/.../Projects/{id}/Tasks/{taskId}` | Effort fields are not in the default response columns; effort reads stay in P2 #15. |
| 2 | `update_risk` | New write | `PUT v2/.../Projects/{id}/Risks/{riskId}` | The only v2 write using PUT; load-merge-save, so partial updates work. |
| 3 | `update_issue` | New write | `PATCH v2/.../Projects/{id}/Issues/{issueId}` | Backend expects bare `Type`/`Status`/`Manager` BaseId keys; tool aliases TypeId/StatusId. |
| 4 | `create_service` | New write | `POST v2/.../Services` | Service is a Project with IsService=true; types via `getprojecttypes?IsService=true` (new `servicetypes` reference entity). |
| 5 | `update_service` | New write | `PATCH v2/.../Services/{serviceId}` | Mirrors update_project (StatusId aliased to ProjectStatusId). |
| 6 | `create_activity` | New write | `POST v2/.../Services/{id}/Activities` | Backend reuses the task pipeline with IsActivity=true; flat list, no hierarchy/kind fields. |
| 7 | `update_activity` | New write | `PATCH v2/.../Services/{id}/Activities/{actId}` | Paired with create_activity. |
| 8 | `get_risk` | New read | `GET v2/.../Projects/{id}/Risks/{riskId}` | Includes mitigation/contingency plans, probability, impact, level, manager. |
| 9 | `get_issue` | New read | `GET v2/.../Projects/{id}/Issues/{issueId}` | Full issue entity (backend applies no column filter). |
| 10 | `search_tasks` | New read | DataMart `$unwind` over components | Corrected: no bare `POST v2/.../Tasks` route exists; REST alternative `Tasks/Search` uses the ITM.Framework filter model. Implemented on DataMart for consistency with search_projects. |

### P2 -- Team and resource management

These unlock the most-requested agent workflows: assigning people, reading team composition, and understanding resource allocation.

| # | Tool / Enrichment | Type | Backend | Notes |
|---|-------------------|------|---------|-------|
| 11 | `get_task_team` | New read | `GET v2/.../Projects/{id}/Tasks/{taskId}/Users` | See who is assigned to a task. v2 endpoint exists (read-only). Substantially covered by `get_task_effort` (#15), whose `EffortByTeamMember` rows include the assigned users. |
| 12 | `assign_task_team` | New write | v1 only: `POST .../Task/{TaskId}/Team/{ProjectUserIds}/{TaskManager}` | **Adding resolved in v1.0.17** without this tool: `TaskManagers`/`TaskMembers` username fields on create_task/update_task ride the v2 task pipeline; see [SPEC_MCP_TASK_ASSIGNMENT.md](SPEC_MCP_TASK_ASSIGNMENT.md). Removal still needs the v1-only endpoints. |
| 13 | `remove_task_team` | New write | v1 only: `DELETE .../Task/{TaskId}/Team/{TaskUserId}` | Same v1-only constraint as assign. Still open after v1.0.17 (assignment is add-only). |
| 14 | `get_project_team` | New read | v1 only: `GET .../Project/{id}/AssignedUsers` | List all users assigned to a project. v1-only. |
| 15 | `get_task_effort` | New read | `GET v2/.../Projects/{id}/Tasks/{taskId}/EffortByCategory` and `.../EffortByTeamMember` | Done (v1.0.15) with a paired `update_task_effort` write (per-user estimated hours); see [done/SPEC_MCP_TASK_EFFORT_TOOLS.md](done/SPEC_MCP_TASK_EFFORT_TOOLS.md) (HS 11634). |

### P3 -- Financial write operations

Enable agents to manage the full purchase/revenue lifecycle, not just read.

| # | Tool / Enrichment | Type | Backend | Notes |
|---|-------------------|------|---------|-------|
| 16 | `create_purchase` | New write | `POST v2/.../Projects/{id}/Purchases` | Create a purchase order on a project. |
| 17 | `update_purchase` | New write | `PATCH v2/.../Projects/{id}/Purchases/{purchaseId}` | Update purchase fields. |
| 18 | `create_revenue` | New write | `POST v2/.../Projects/{id}/Revenues` | Create a revenue item on a project. |
| 19 | `update_revenue` | New write | `PATCH v2/.../Projects/{id}/Revenues/{revenueId}` | Update revenue fields. |
| 20 | `update_project_budget` | New write | `PATCH v2/.../Projects/{id}/Budget` | Update planned budget. Endpoint exists but not exposed. |

### P4 -- Task dependencies and scheduling

The most-requested missing feature. Dependencies are **v1-only** (no v2 endpoint), so this requires either calling the v1 API or building new v2 endpoints in ITM.Tasks.

| # | Tool / Enrichment | Type | Backend | Notes |
|---|-------------------|------|---------|-------|
| 21 | `get_task_dependencies` | New read | v1: `GET .../Project/{id}/TaskDependencies` | List finish-to-start (and other) links between tasks. |
| 22 | `create_task_dependency` | New write | v1: `POST .../Project/{id}/TaskDependencies` | Create predecessor/successor links. |
| 23 | `delete_task_dependency` | New write | v1: `DELETE .../Project/{id}/TaskDependencies` | Remove dependency links. |
| 24 | `get_project_gantt` | New read | `GET v2/.../Projects/{id}/Tasks/Gantt` | Full task tree with dependency data. Could be the read path instead of #21. |

### P5 -- Enrichments to existing tools

Improvements to tools that already exist, making them more useful without adding new tool names.

| # | Enrichment | Target tool | Notes |
|---|-----------|-------------|-------|
| 25 | Add task filtering (status, assignee, date range) | `list_project_tasks` | Currently returns all tasks with pagination only. Agents must fetch everything to find specific tasks. |
| 26 | Add risk/issue filtering | `get_project_risks`, `get_project_issues` | Same filtering gap. |
| 27 | Add pagination to progress list | `list_task_progress` | Only tool without limit/skip support. |
| 28 | Add service aggregation | `aggregate_portfolio` | Currently hardcoded to `componentType: project`. Should support services too. |
| 29 | Expand `get_reference_data` entities | `get_reference_data` | Add: `currencies`, `workgroups`, `professionalcategories`, `programs`, `clients`, `providers`. These exist in v2 (ITM.Account and ITM.Tasks). |
| 30 | Return `uiUrl` deep links in read tools | All read tools | When `ITM_UI_URL` is set, include a clickable link to the entity in the ITM Platform web UI. Currently only `create_project` returns this. |

### P6 -- Programs and cross-project structure

| # | Tool / Enrichment | Type | Backend | Notes |
|---|-------------------|------|---------|-------|
| 31 | `search_programs` | New read | `GET/POST v2/.../Programs/Search` | Programs group projects. No MCP visibility today. |
| 32 | `get_program` | New read | `GET v2/.../Programs/{programId}` | Single program detail. |
| 33 | `get_project_dependencies` | New read | v1 only: `GET .../project/{id}/dependencies` | Cross-project dependency links (different from task dependencies). |

### P7 -- Sprints and Kanban

| # | Tool / Enrichment | Type | Backend | Notes |
|---|-------------------|------|---------|-------|
| 34 | `list_sprints` | New read | `GET/POST v2/.../Projects/{id}/Sprints/Search` | Sprint list for agile projects. |
| 35 | `create_sprint` | New write | `POST v2/.../Projects/{id}/Sprints` | Create a sprint. |
| 36 | `update_sprint` | New write | `PATCH v2/.../Projects/{id}/Sprints/{sprintId}` | Update sprint dates, name, etc. |

### P8 -- Custom fields and advanced reads

Custom field discovery (#37, #38) fact-checked and implemented in [SPEC_MCP_CUSTOM_FIELDS_DISCOVERY.md](done/SPEC_MCP_CUSTOM_FIELDS_DISCOVERY.md) (v1.0.14), including per-account session context (DataMart `customFields` keys injected into MCP `instructions` and the `query_datamart` description).

| # | Tool / Enrichment | Type | Backend | Notes |
|---|-------------------|------|---------|-------|
| 37 | `get_custom_fields` | New read | `GET v2/.../{EntityName}/CustomFields?LanguageId=` | Done (v1.0.14). 8 entities; definitions are per-language rows sharing a BaseId (1=EN default, 2=ES, 3=PT); tool defaults to the session user's language. |
| 38 | `get_custom_field_options` | New read | `GET v2/.../CustomFieldOptions/{CustomFieldBaseId}?LanguageId=` | Done (v1.0.14). Options exist for RYGList/DropDownList/List types. |
| 39 | `get_project_change_history` | New read | `GET v2/.../Projects/{id}/changeHistory` | Audit trail of project changes. |

Values in typed reads (get_project/search) are specced separately in [SPEC_MCP_CUSTOM_FIELDS_IN_TYPED_READS.md](SPEC_MCP_CUSTOM_FIELDS_IN_TYPED_READS.md) (proposed).

### P9 -- Documents, baselines, earned value (v1-dependent)

All v1-only. Higher implementation cost because they require v1 REST calls (different auth/routing) or new v2 endpoints.

| # | Tool / Enrichment | Type | Backend | Notes |
|---|-------------------|------|---------|-------|
| 40 | `list_project_documents` | New read | v1: `GET .../Project/{id}/Documents` | List attachments. File download is complex for MCP. |
| 41 | `list_baselines` | New read | v1: `GET .../project/{id}/baselines` | Project schedule/cost snapshots. |
| 42 | `get_earned_value` | New read | v1: `GET .../Project/{id}/FollowUps/earned-value` | EVM data (CPI, SPI). Valuable for health analysis. |
| 43 | `get_capacity` | New read | v1: `GET .../resourceCapacity` | Resource capacity vs demand by period. |

### P10 -- Risk-issue-task associations

| # | Tool / Enrichment | Type | Backend | Notes |
|---|-------------------|------|---------|-------|
| 44 | `get_risk_issues` | New read | `GET v2/.../Projects/{id}/Risks/{riskId}/Issues` | Which issues are linked to a risk. |
| 45 | `get_issue_risks` | New read | `GET v2/.../Projects/{id}/Issues/{issueId}/Risks` | Which risks are linked to an issue. |
| 46 | `get_task_affected_risks` | New read | `GET v2/.../Projects/{id}/TaskAffectedRisk/{riskId}` | Which tasks a risk impacts. |
| 47 | `get_risk_action_tasks` | New read | `GET v2/.../Projects/{id}/RiskActionTask/{riskId}` | Mitigation tasks for a risk. |

---

## API Coverage Map

Summary of backend endpoint coverage by the MCP server.

| Domain | v2 endpoints | v1-only endpoints | MCP tools | Coverage |
|--------|-------------|-------------------|-----------|----------|
| Projects (CRUD) | 6 | -- | 4 | Good (missing delete, budget update) |
| Tasks (CRUD) | 8 | -- | 6 | Good (missing batch, delete) |
| Task dependencies | -- | 3 | 0 | None |
| Task team/assignments | 3 (read) | 5 (write) | 2 | Add-only via create_task/update_task username fields (v1.0.17); removal v1-only |
| Task effort/hours | 5 | 5 | 2 | Estimates read/write (v1.0.15); time entries none |
| Task progress | 5 | -- | 4 | Good |
| Risks | 6 | -- | 4 | Good (missing delete, account-wide search) |
| Issues | 6 | -- | 4 | Good (missing delete, account-wide search) |
| Purchases (project) | 8 | -- | 1 | Read-only |
| Revenues (project) | 10+ | -- | 1 | Read-only |
| Services (CRUD) | 5 | -- | 4 | Good (missing delete) |
| Service activities | 5 | -- | 4 | Good (missing delete, get-single) |
| Service purchases | 7 | -- | 1 | Read-only |
| Service revenues | 7 | -- | 1 | Read-only |
| Programs | 4 | -- | 0 | None |
| Sprints | 7 | -- | 0 | None |
| Custom fields | 4 | 1 | 2 | Good (definitions + options tools; values via query_datamart `customFields` with per-account session context; writes pending) |
| Documents | -- | 6 | 0 | None (v1-only) |
| Baselines | -- | 8 | 0 | None (v1-only) |
| Earned value | -- | 2 | 0 | None (v1-only) |
| Capacity/resources | 3 | 1 | 0 | None |
| Risk-issue associations | 8 | -- | 0 | None |
| Users | 3 | -- | 2 | Good |
| Reference data | 18 | -- | 1 | Good |
| Portfolio aggregation | -- | -- | 2 | Good (DataMart) |
| Kanban board | 10 | -- | 0 | None (UI-specific) |
| Revenue recognition | 6 | -- | 0 | None |
| Clients/providers | 10 | -- | 0 | None |

---

## Specification Index

### Active Specs

| File | Summary | Status |
|------|---------|--------|
| [INDEX.md](INDEX.md) | This document: tool roadmap, backlog, and spec index | Active |
| [SPEC_MCP_P1_CORE_CRUD.md](SPEC_MCP_P1_CORE_CRUD.md) | P1: 10 core CRUD tools (get_task, get_risk, get_issue, search_tasks, update_risk, update_issue, service and activity writes) | Done (v1.0.13, stage verified; prod deploy pending) |
| [done/SPEC_MCP_CUSTOM_FIELDS_DISCOVERY.md](done/SPEC_MCP_CUSTOM_FIELDS_DISCOVERY.md) | P8 #37/#38 (get_custom_fields, get_custom_field_options) + per-account customFields session context (Ucloud request) | Done (v1.0.14) |
| [SPEC_MCP_CUSTOM_FIELDS_IN_TYPED_READS.md](SPEC_MCP_CUSTOM_FIELDS_IN_TYPED_READS.md) | customFields in get_project/get_service output and search opt-in | Proposed (revisit after discovery usage is observed) |
| [done/SPEC_MCP_TASK_EFFORT_TOOLS.md](done/SPEC_MCP_TASK_EFFORT_TOOLS.md) | P2 #15 + write: `get_task_effort` + `update_task_effort` (per-user estimated hours, HS 11634) | Done (v1.0.15, prod 2026-07-23) |
| [SPEC_MCP_TASK_ASSIGNMENT.md](SPEC_MCP_TASK_ASSIGNMENT.md) | P2 #12 add path: `TaskManagers`/`TaskMembers` on create_task/update_task (HS 11710, 11715) | Done (v1.0.17, stage pending prod) |
| [SPEC_MCP_TIME_ENTRY_TOOLS.md](SPEC_MCP_TIME_ENTRY_TOOLS.md) | Delegated actuals (`log_time_entry`): decision record + guarded design (HS 11634) | On hold; address cons first, revisit if Gilsandro insists or a new request arrives |
| [SPEC_MCP_BULK_OPERATIONS.md](SPEC_MCP_BULK_OPERATIONS.md) | Phases 2-3: general-purpose bulk field updates and async mass operations | Pending (owner decisions needed) |
| [SPEC_MCP_WHATS_NEW_DISCOVERY.md](SPEC_MCP_WHATS_NEW_DISCOVERY.md) | Server instructions banner + `itm://changelog` resource | Pending |
| [SPEC_OAUTH_CONSENT_SCOPE_CHECKBOXES.md](SPEC_OAUTH_CONSENT_SCOPE_CHECKBOXES.md) | OAuth consent page per-scope checkboxes (impl in ITM.Account) | Pending |
| [SPEC_HELPSCOUT_11535_TIME_TRACKING_FOLLOWUP_REPORTING.md](SPEC_HELPSCOUT_11535_TIME_TRACKING_FOLLOWUP_REPORTING.md) | UCloud: time tracking, follow-up, reporting via MCP | Partially done (progress tools shipped; Clockify, DataMart time detail pending) |
| [done/SPEC_MCP_WRITE_TOOL_FIXES.md](done/SPEC_MCP_WRITE_TOOL_FIXES.md) | Three write-tool fixes from first prod session | Done (v1.0.12, 2026-07-17) |

### Completed Specs (done/)

| File | Summary |
|------|---------|
| [SPEC_MCP_SERVER.md](done/SPEC_MCP_SERVER.md) | Master spec: protocol, auth, tool surface Phases 1-3, deployment, security |
| [SPEC_OAUTH_REMAINING.md](done/SPEC_OAUTH_REMAINING.md) | OAuth completion tracker (all actionable items done) |
| [SPEC_MCP_DOCUMENTATION.md](done/SPEC_MCP_DOCUMENTATION.md) | APIDocs SPA (React + Vite + Tailwind); CI/CD pipeline still pending |
| [SPEC_MCP_DEPLOYMENT.md](done/SPEC_MCP_DEPLOYMENT.md) | PM2 + IIS gateway deployment, npm publishing, marketplace listings |
| [SPEC_NPM_PUBLISH.md](done/SPEC_NPM_PUBLISH.md) | npm publishing via GitHub Actions OIDC (`@itm-platform/mcp-server`) |
| [SPEC_OAUTH_COMPANY_SELECTION.md](done/SPEC_OAUTH_COMPANY_SELECTION.md) | Remove company slug text field; server-side resolution |
| [SPEC_PM_ACCESS.md](done/SPEC_PM_ACCESS.md) | Project Manager license MCP access with scoped permissions |
| [SPEC_REGISTRY_SUBMISSIONS.md](done/SPEC_REGISTRY_SUBMISSIONS.md) | Listings in 7 MCP registries (all live 2026-06-19) |
| [SPEC_MCP_PROGRESS_TOOLS.md](done/SPEC_MCP_PROGRESS_TOOLS.md) | 4 progress tools (list, create, update, project progress) |
| [SPEC_MCP_BULK_STATUS_TOOLS.md](done/SPEC_MCP_BULK_STATUS_TOOLS.md) | `bulk_update_task_status` + `bulk_update_activity_status` (v1.0.10) |
| [SPEC_MCP_CREATE_PROJECT_HIERARCHY_MILESTONES.md](done/SPEC_MCP_CREATE_PROJECT_HIERARCHY_MILESTONES.md) | `create_project` + ParentId/KindId on task tools (v1.0.11) |
| [SPEC_PENDING_ITEMS.md](done/SPEC_PENDING_ITEMS.md) | Consolidated tracker of deferred items from completed specs |
| [SPEC_APIDOCS_PUBLISH_AND_SERVICE_DOCUMENTATION.md](done/SPEC_APIDOCS_PUBLISH_AND_SERVICE_DOCUMENTATION.md) | Publish APIDocs + restore `service_documentation` in OAuth metadata |
| [GUIDE_STAGE_MANUAL_TESTING.md](done/GUIDE_STAGE_MANUAL_TESTING.md) | Step-by-step stage testing guide (OAuth flow, curl, AI clients) |

---

## Decision Log

Decisions that affect the backlog or overall direction.

| Date | Decision | Impact |
|------|----------|--------|
| 2026-07-17 | Task dependencies, team assignments, documents, and project dependencies are v1-only. MCP must call v1 REST or wait for v2 endpoints in ITM.Tasks. | P2 team tools and P4 dependency tools require architectural decision: v1 calls from MCP vs new v2 endpoints. |
| 2026-07-17 | Delete operations intentionally excluded from initial MCP surface. | Revisit if agents need delete capabilities. Destructive operations require extra confirmation UX. |
| 2026-07-17 | `search_tasks` implemented on DataMart (`$unwind` over components) instead of the REST `Tasks/Search` endpoint. | Consistent with search_projects; avoids the ITM.Framework FilterExpression payload and grid-column coupling. Eventual-consistency caveat documented in the tool description. |
| 2026-07-17 | P1 implemented entirely inside ITM.MCP (v1.0.13). All backend endpoints and gateway routes already existed. | No ITM.Tasks or ITM.Web changes required. See [SPEC_MCP_P1_CORE_CRUD.md](SPEC_MCP_P1_CORE_CRUD.md). |
| 2026-07-22 | Per-account custom field session context is sourced from a DataMart key-usage aggregate ($objectToArray over customFields), not from REST definitions. | Reflects the keys actually queryable in DataMart, including per-language variants and dotted-name traps that REST definitions cannot reveal. See [SPEC_MCP_CUSTOM_FIELDS_DISCOVERY.md](done/SPEC_MCP_CUSTOM_FIELDS_DISCOVERY.md). |
| 2026-07-22 | The published APIDocs tool manifest is generated with `ITM_CUSTOM_FIELD_CONTEXT=off`. | Keeps the public query_datamart description account-neutral; the per-account block exists only in live sessions. |
| 2026-08-03 | Task assignment shipped as `TaskManagers`/`TaskMembers` fields on create_task/update_task instead of a new `assign_task_team` tool. | The v2 task pipeline already honors the fields (verified on stage); no new tool name keeps the 44-tool catalog below the 49 KB Claude budget. Add-only; removal remains v1-only. See [SPEC_MCP_TASK_ASSIGNMENT.md](SPEC_MCP_TASK_ASSIGNMENT.md). |
| 2026-08-03 | Closing a project needs no new tool: `update_project` with a closed-type `ProjectStatusId` (projectstatuses entry with `IsCompleted: true`) closes it (verified on stage, reversible). | Answers HS 11710 request 3 with existing tools. Caveat: closed statuses block time entry (`IsAllowTimeEntry: false`), so hours must be logged before closing; task writes are NOT blocked by a closed status. |
