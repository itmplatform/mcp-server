Access to MCP tools depends on your ITM Platform license type. The MCP server enforces the same permissions as the ITM Platform web application.

### License types

| License | Read access | Write access | Notes |
|---------|------------|--------------|-------|
| **Company Admin** | Full | Full | Can see and modify all projects, services, and users |
| **Full User** | Full | Full | Same data access as Company Admin |
| **Project Manager** | Scoped | Scoped | Can only see and modify projects where they are assigned as a manager |
| **Team Member** | Blocked | Blocked | Cannot use MCP tools (403 error) |

### How it works

When you connect your AI client, the MCP server resolves your identity using your API key or OAuth token. Your license type determines which projects and data the AI can access. The AI never sees data that you would not be able to see in the ITM Platform web application.

### Project-level permissions

Project Managers can only access projects where they are assigned as a manager. If you ask the AI about a project you do not manage, the server returns an empty result -- the AI will tell you it could not find that project.
