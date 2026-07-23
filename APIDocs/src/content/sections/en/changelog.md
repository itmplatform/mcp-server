### v1.0.16

Claude custom-connector compatibility fix. The server still exposes all 44 tools with the same schemas and behavior, but removes duplicated prose from the serialized tool metadata so the complete `tools/list` response stays below a 49 KB compatibility budget.

**Reliability:**
- Added an end-to-end regression check against the actual UTF-8 `tools/list` response size.
- Kept the task-methodology, automatic-progress, reference-ID, assignment, and effort-preservation guidance required for safe writes.

### v1.0.15

Per-user task effort: read the effort breakdown and set estimated hours per assigned user.

**New tools (2):**
- `get_task_effort`: a task's effort breakdown per team member (estimated, accepted, and time-entry hours, plus billing category) and per professional category. The `teamMembers` list doubles as the task team, so this also answers "who is assigned to this task?".
- `update_task_effort`: sets the ESTIMATED (planned) effort per assigned user, optionally together with an explicit task-level total estimate (otherwise the total is recomputed from the estimates, as the web UI does). Planning data only: it never writes worked hours or accepted effort, and it reads the current state first so accepted effort, automatic-acceptance flags, billing categories, category efforts, and unlisted users are preserved exactly.

**Notes:**
- The target user must already be assigned to the task; assign with `update_task` (`TaskMembers`/`TaskManagers` usernames) and discover assignees with `get_task_effort` or `search_users`.
- Milestones and summary tasks are rejected: effort belongs to regular tasks.
- Time entry logging (worked hours) remains out of scope for MCP; use the documented REST `timehours` endpoint for programmatic time entries.

### v1.0.14

Custom fields discovery: definitions, dropdown options, and per-account session context.

**New tools (2):**
- `get_custom_fields`: the account's custom field definitions (name, type, required, BaseId) for projects, tasks, risks, issues, services, activities, purchases, or revenues. Definitions are per-language (1=English, 2=Spanish, 3=Portuguese); the tool defaults to your user language.
- `get_custom_field_options`: the selectable options of a dropdown custom field (RYGList, DropDownList, List), by BaseId.

**Session context:**
- When the account defines custom fields, the server now lists the DataMart `customFields` keys actually in use (with component counts) in the MCP initialize instructions and at the end of the `query_datamart` description. Agents can answer questions about custom fields without any prior discovery step, including warnings for keys that contain dots (not addressable with dot notation) and hints about per-language key variants on multilingual accounts.

**Notes:**
- Custom field values were already queryable through `query_datamart` (`customFields` object on every component document, keyed by the field's display name, case- and accent-sensitive); this release makes them discoverable.

### v1.0.13

P1 core CRUD: single-entity reads, account-wide task search, and the risk, issue, service, and activity write surface.

**New tools (10):**
- 4 read tools: `get_task`, `get_risk`, and `get_issue` retrieve one entity's full detail from v2 REST (source of truth, no DataMart delay); `search_tasks` searches tasks across all projects by name, status, assignee, kind, or date range, returning each task with its project context.
- 6 write tools: `update_risk` (including mitigation and contingency plans), `update_issue` (including final resolution), `create_service`, `update_service`, `create_activity`, and `update_activity`. All follow the standard write pattern: reference-ID normalization, readback from v2 REST, and source-of-truth verification.

**Reference data:**
- New `servicetypes` entity in get_reference_data to discover the service type IDs required by create_service.

**Notes:**
- Service activities form a flat list: the activity tools reject `KindId` and `ParentId` (milestones, summary tasks, and hierarchy exist only on project tasks).
- `update_risk` accepts `ContingencyPlan` and maps it to the backend field spelling (`ContigencyPlan`).

### v1.0.12

Risk creation contract corrections and summary task verification fix.

**Write validation:**
- `create_risk` now publishes `TypeId`, `StatusId`, `ImpactId`, `ProbabilityId`, and `LevelId` as required MCP inputs (the v2 risk create route always required them) and rejects missing fields client-side with a pointer to the matching reference entity, instead of forwarding a REST 400.
- `create_task` and `update_task` reject `TypeId` on summary tasks (KindId 2). The backend ignores it and omits the type from the readback, which previously produced a false write-verification error after a successful creation.

**Reference data:**
- New `risklevels` entity in get_reference_data to discover the `LevelId` values required by create_risk. `LevelId` accepts localized Id values and normalizes them to the BaseId that v2 REST requires, like the other risk reference fields. Requires the `v2/{company}/risklevels` API Gateway route released alongside this version.

**Documentation:**
- `create_task` and `update_task` document the automatic progress side effect: statuses with AutomaticProgress (such as Completed) create a 100% progress entry, and percentComplete follows the latest entry by ReportDate.

### v1.0.11

Project creation, task hierarchy, and milestones.

**New tools (1):**
- `create_project`: create a Waterfall or Kanban project. The project starts with the account default status (use update_project to change it) and the creating user becomes the project manager. When the optional `ITM_UI_URL` variable is configured, the response includes a `uiUrl` deep link to open the project in the ITM Platform UI.

**Extended tools (2):**
- `create_task` and `update_task` accept `KindId` (1=Milestone, 2=Summary task, 3=Task) and `ParentId` to build Gantt hierarchy on Waterfall projects. A regular-task parent is automatically converted to a summary task. Milestones sit on their end date: the tools validate the date rules client-side so a milestone is never silently converted back to a regular task.

**Documentation:**
- Task kind (`KindId`) is now clearly distinguished from task type (`TypeId`) in the tool descriptions

### v1.0.10

Bulk status tools.

**New tools (2):**
- `bulk_update_task_status`: apply one status to up to 100 tasks of a project in a single call. Supports Waterfall status IDs, Kanban column IDs, and server-side status name resolution.
- `bulk_update_activity_status`: apply one status to up to 100 activities of a service in a single call. Status names are resolved against the activity status list.

**Reference data:**
- New `activitystatuses` entity in get_reference_data to discover valid service activity statuses (these differ from task statuses)

**Client hardening:**
- Bulk status requests use a 90-second request timeout via AbortController

### v1.0.9

Task and issue creation contract corrections.

**Write validation:**
- `create_task` checks the project methodology before writing. Waterfall tasks require `StatusId`, `StartDate`, and `EndDate`; Kanban tasks continue to use board defaults.
- `create_issue` now publishes `TypeId` and `StatusId` as required MCP inputs.
- REST validation responses retain the downstream `StatusMessage`, with bounded plain-text fallback, instead of returning only a generic HTTP status.

### v1.0.8

Task and project progress (seguimiento) support.

**New tools (4):**
- 2 read tools: list_task_progress (task progress history), get_project_progress (expected vs baseline vs actual curves)
- 2 write tools: create_task_progress, update_task_progress. Creating progress preserves all platform side effects: task status transitions at 100%, parent task rollups, and automatic project progress

**Reference data:**
- New `assessments` entity in get_reference_data to discover the progress rating IDs required by create_task_progress

**Documentation:**
- The tool catalog now also documents list_service_activities, get_service_purchases, and get_service_revenues, which shipped in an earlier server release

### v1.0.0

Initial release of the ITM Platform MCP server.

**Tools (20):**
- 15 read tools: search_projects, get_project, search_services, get_service, list_project_tasks, get_project_budget, get_project_purchases, get_project_revenues, get_project_risks, get_project_issues, aggregate_portfolio, query_datamart, search_users, get_user, get_reference_data
- 5 write tools: create_task, update_task, create_risk, create_issue, update_project

**Resources (6):**
- 5 DataMart schema resources (component, tasks, purchases, risks, issues)
- 1 calendar resource template

**Prompts (4):**
- project_status, portfolio_overview, team_workload, risk_analysis

**Authentication:**
- API key (stdio mode)
- OAuth 2.1 with PKCE (HTTP mode)
- Scope enforcement (mcp:read, mcp:write)

**Transports:**
- stdio (local AI clients)
- Streamable HTTP (hosted/remote)
