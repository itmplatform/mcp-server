The MCP server exposes resources and prompts in addition to tools. Resources provide schema information and calendar data. Prompts are pre-built workflows that combine multiple tool calls.

### Resources

Resources are read-only data the AI can access without a specific tool call.

| Resource URI | Description |
|-------------|-------------|
| `itm://schema/component` | DataMart component schema -- available fields, types, and enums for projects and services |
| `itm://schema/tasks` | DataMart task schema -- fields available on task subcomponents |
| `itm://schema/purchases` | DataMart purchase schema -- fields on purchase subcomponents |
| `itm://schema/risks` | DataMart risk schema -- fields on risk subcomponents |
| `itm://schema/issues` | DataMart issue schema -- fields on issue subcomponents |
| `itm://calendars/{projectId}` | Holiday calendar and work hours for a specific project |

Schema resources help the AI understand which fields are available when constructing queries or interpreting results. The calendar resource provides working-day information for scheduling calculations.

### Prompts

Prompts are pre-built workflows that combine multiple tool calls into a single, structured request. They give the AI clear instructions on what data to fetch and how to present it.

| Prompt | Arguments | What it does |
|--------|-----------|-------------|
| `/project_status` | `projectId` (required) | Fetches a project with tasks, risks, issues, and budget. Instructs the AI to summarize overall health, task progress, active risks, open issues, and budget status. |
| `/portfolio_overview` | none | Aggregates projects by status and methodology. Instructs the AI to summarize portfolio-level metrics: total projects, status distribution, budget health, and concerning patterns. |
| `/team_workload` | `userId` (optional) | Fetches users and their project assignments. Optionally focuses on a specific user. Instructs the AI to summarize assignments and workload patterns. |
| `/risk_analysis` | `projectId` (required) | Fetches risks, issues, and budget for a project. Instructs the AI to analyze risk exposure, probability/impact, budget variance, and recommend actions. |
