Access to MCP tools depends on your ITM Platform license type. The MCP server enforces the same permissions as the ITM Platform web application.

### License types

| License | Read access | Write access | Notes |
|---------|------------|--------------|-------|
| **Company Admin** | Full | Full | Can see and modify all projects, services, and users |
| **Full User** | Full | Full | Same data access as Company Admin |
| **Project Manager** | Scoped | Scoped | Can see and modify only projects they manage |
| **Team Member** | Blocked | Blocked | Cannot use MCP tools |

### How it works

When you connect your AI client, the MCP server resolves your identity using your API key or OAuth token. Your license type determines which projects and data the AI can access. The AI never sees data that you would not be able to see in the ITM Platform web application.

### Project-level permissions

Company Admins and Full Users can access all projects. Project Managers can access only the projects they manage.
