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
