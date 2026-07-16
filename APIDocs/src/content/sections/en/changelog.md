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
