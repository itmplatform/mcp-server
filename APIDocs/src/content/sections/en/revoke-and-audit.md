### Revoking access

You can disconnect your AI client at any time:

**If you used an API key (local setup):**
1. Go to **User Settings** in ITM Platform
2. Under **API Key**, click **Regenerate**
3. The old key is immediately invalidated. The AI client will stop working until you configure a new key.

**If you used OAuth (hosted setup):**
1. Go to **User Settings** in ITM Platform
2. Under **Connected Applications**, find the MCP server entry
3. Click **Revoke**
4. The AI client's token is immediately invalidated

### Reviewing activity

Every write operation performed by the AI is recorded in the audit log. Each entry includes:

| Field | Description |
|-------|-------------|
| **Who** | The user whose credentials were used |
| **When** | Timestamp of the operation |
| **Tool** | Which MCP tool was called (e.g., `create_task`, `update_project`) |
| **What changed** | The fields that were modified and their new values |
| **AI client** | Which AI client initiated the request |

Company Admins can review audit log entries to see all AI-initiated changes across the organization.

### Why this matters

When you give an AI assistant write access to project and financial data, you need to know exactly what it changed. The audit log provides a complete trail of every AI-initiated modification, so you can verify changes and troubleshoot issues.
