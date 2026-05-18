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
