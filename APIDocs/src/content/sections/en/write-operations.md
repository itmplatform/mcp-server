The AI can modify your ITM Platform data, not just read it. Write operations cover projects, services, tasks, activities, risks, and issues.

### Available write operations

| Operation | What it does |
|-----------|-------------|
| **Create project** | Create a Waterfall or Kanban project; it starts with the account default status and the creating user as project manager |
| **Create task** | Add a task, milestone, or summary task to a project; ParentId builds Gantt hierarchy on Waterfall projects |
| **Update task** | Change task name, status, priority, dates, kind, or parent |
| **Create task progress** | Report progress on a task (percentage, assessment rating, notes). Triggers the same side effects as reporting progress in the app: status transitions, parent rollups, and automatic project progress |
| **Update task progress** | Correct an existing progress entry |
| **Create project progress** | Report project-level status (Seguimiento): completion percentage, assessment rating, and status description. A 100% entry automatically closes the project |
| **Update project progress** | Correct an existing project progress entry |
| **Log time entry** | Log actual worked hours on a task for one user and date, adding to or replacing the day's total. Logging for another user requires a Company Admin or Full Access license |
| **Update task effort** | Set the estimated (planned) hours of a task per assigned user |
| **Create risk** | Log a new risk in a project. Type, status, impact, probability, and level are required; valid IDs are discovered through the reference data tool (including the `risklevels` entity) |
| **Update risk** | Change risk status, type, probability, impact, level, or the mitigation and contingency plans |
| **Create issue** | Log a new issue in a project |
| **Update issue** | Change issue name, status, type, or final resolution |
| **Update project** | Change project name, status, priority, or dates |
| **Create service** | Create a service; it starts with the account default status. Service types are discovered through the `servicetypes` reference entity |
| **Update service** | Change service name, status, priority, or dates |
| **Create activity** | Add an activity to a service (activities form a flat list: no milestones, summary tasks, or hierarchy) |
| **Update activity** | Change activity name, status, description, or dates |
| **Bulk update task status** | Apply one status to up to 100 tasks of a project in a single call |
| **Bulk update activity status** | Apply one status to up to 100 activities of a service in a single call |

### Bulk status updates

The bulk tools return a compact per-chunk summary (`requested`, `succeeded`, `failed`) instead of full record readbacks. The whole chunk runs in one database transaction on the server: an unexpected error rolls back the entire chunk, while per-item validation failures are reported in the `failed` array and do not block the other items. Re-applying the same status is harmless, so retrying a failed chunk is safe.

### Safety design

Every write operation follows the same pattern:

1. **Source-of-truth verification**: After the write, the server reads the updated record back from the v2 REST API to confirm it was saved correctly. If the readback does not match the requested changes, the server reports an error.
2. **Audit logging**: When enabled, each tool call is logged with the user, timestamp, tool name, and result.

### DataMart eventual consistency

After a write operation, the data in DataMart (used by read tools) may take 5 to 60 seconds to reflect the change. The write confirmation comes from the v2 REST API (source of truth), so you will see the correct result immediately in the response. Subsequent reads via search tools may show stale data for a short period.

### Scope requirements

When using OAuth (hosted setup), write operations require the `mcp:write` scope. If your token only has `mcp:read`, write tools will return a permission error. When using an API key (local setup), all operations are available based on your ITM Platform license and role.
