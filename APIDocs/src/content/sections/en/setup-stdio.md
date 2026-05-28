Use this method if you prefer to run the MCP server on your own machine. The AI client spawns the server as a local process and communicates with it directly. You authenticate with an API key from your ITM Platform account.

### Step 1: Generate an API key

1. Log in to your ITM Platform account
2. Go to **My Profile** (click your avatar in the top right)
3. Under **API Key**, click **Generate** to create a new key
4. Copy the key -- you will need it in the next step

### Step 2: Configure your AI client

Your AI client needs three environment variables to connect:

| Variable | Value |
|----------|-------|
| `ITM_API_URL` | `https://api.itmplatform.com` |
| `ITM_COMPANY` | Your company/account slug (the name in your ITM Platform URL) |
| `ITM_API_KEY` | The API key you generated in Step 1 |

The server runs via npm -- no global install is needed:

```bash
npx @itm-platform/mcp-server
```

See [Setup by AI Client](#ai-clients) above for the exact configuration for Claude, VS Code, Cursor, and other clients.

### Step 3: Verify the connection

After adding the configuration, restart your AI client. Then ask a question like:

> "How many projects do I have in ITM Platform?"

If the AI returns project data, the connection is working.

### When to use this method

- You work behind a corporate firewall that blocks outbound connections to the hosted server
- You want the MCP server to run fully offline
- You need to point the server at a self-hosted ITM Platform instance
- You want to inspect or customize the server behavior locally
