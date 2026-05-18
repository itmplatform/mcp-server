### How it works

With the hosted setup, your AI client connects to the ITM Platform MCP server over the internet. When you connect for the first time, a browser window opens asking you to log in to ITM Platform and authorize the AI client.

### Step 1: Add the server URL

In your AI client's MCP configuration, add the hosted server:

```json
{
  "mcpServers": {
    "itm-platform": {
      "type": "http",
      "url": "https://mcp.itmplatform.com/mcp"
    }
  }
}
```

### Step 2: Authorize

When you first use the connection, your AI client will open a browser window. Log in with your ITM Platform credentials and click **Authorize**. The AI client receives a token that lets it act on your behalf.

### Step 3: Start using it

Ask the AI a question about your projects. The authorization is remembered -- you will not need to log in again unless you revoke access.

### What OAuth does

OAuth lets the AI client act on your behalf without ever seeing your password. You log in directly with ITM Platform, and the server issues a scoped token. You can revoke this token at any time (see the "Revoking Access" section).
