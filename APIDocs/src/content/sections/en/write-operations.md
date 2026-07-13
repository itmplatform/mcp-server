The AI can modify your ITM Platform data, not just read it. Write operations include creating tasks, updating projects, and logging risks or issues.

### Available write operations

| Operation | What it does |
|-----------|-------------|
| **Create task** | Add a new task to a project |
| **Update task** | Change task name, status, priority, or dates |
| **Create task progress** | Report progress on a task (percentage, assessment rating, notes). Triggers the same side effects as reporting progress in the app: status transitions, parent rollups, and automatic project progress |
| **Update task progress** | Correct an existing progress entry |
| **Create risk** | Log a new risk in a project |
| **Create issue** | Log a new issue in a project |
| **Update project** | Change project name, status, priority, or dates |

### Safety design

Every write operation follows the same pattern:

1. **Source-of-truth verification**: After the write, the server reads the updated record back from the v2 REST API to confirm it was saved correctly. If the readback does not match the requested changes, the server reports an error.
2. **Audit logging**: When enabled, each tool call is logged with the user, timestamp, tool name, and result.

### DataMart eventual consistency

After a write operation, the data in DataMart (used by read tools) may take 5 to 60 seconds to reflect the change. The write confirmation comes from the v2 REST API (source of truth), so you will see the correct result immediately in the response. Subsequent reads via search tools may show stale data for a short period.

### Scope requirements

When using OAuth (hosted setup), write operations require the `mcp:write` scope. If your token only has `mcp:read`, write tools will return a permission error. When using an API key (local setup), all operations are available based on your ITM Platform license and role.
