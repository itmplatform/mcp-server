The AI can modify your ITM Platform data, not just read it. Write operations include creating tasks, updating projects, and logging risks or issues.

### Available write operations

| Operation | What it does |
|-----------|-------------|
| **Create task** | Add a new task to a project |
| **Update task** | Change task name, status, priority, or dates |
| **Create risk** | Log a new risk in a project |
| **Create issue** | Log a new issue in a project |
| **Update project** | Change project name, status, priority, or dates |

### Safety design

Every write operation follows the same pattern:

1. **Confirmation**: The AI tells you what it is about to do before making the change
2. **Source-of-truth verification**: After the write, the server reads the updated record back from the v2 REST API to confirm it was saved correctly
3. **Audit logging**: Each write is logged with who made the change, when, what tool was called, and what fields were modified

### DataMart eventual consistency

After a write operation, the data in DataMart (used by read tools) may take 5 to 60 seconds to reflect the change. The write confirmation comes from the v2 REST API (source of truth), so you will see the correct result immediately in the response. Subsequent reads via search tools may show stale data for a short period.

### Scope requirements

When using OAuth (hosted setup), write operations require the `mcp:write` scope. If your token only has `mcp:read`, write tools will return a permission error. When using an API key (local setup), all operations are available based on your ITM Platform license and role.
