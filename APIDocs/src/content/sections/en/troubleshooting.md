### Server won't start

**"Identity resolution timeout"** -- The server calls ITM Platform at startup to verify your credentials. If it cannot reach the API:

- Check that `ITM_API_URL` is correct and reachable
- Check that `ITM_COMPANY` matches your account slug exactly
- Check that your API key is valid (try generating a new one)
- Check your network connection and firewall settings

**"Invalid API key"** -- The API key was rejected. Generate a new one in your ITM Platform user settings.

### Tools not appearing in the AI client

- Make sure the MCP server started successfully (check stderr output for the "MCP server connected" message)
- Verify the configuration path and format match what your AI client expects
- For stdio mode: check that `npx @itm-platform/mcp-server` runs correctly in your terminal
- For HTTP mode: check that the URL is correct and the server is listening on the expected port
- Restart your AI client after changing the configuration

### OAuth errors

**"Authorization failed"** -- The user cancelled the authorization flow or the session expired. Try connecting again.

**"Insufficient scope"** -- You need `mcp:write` scope for write operations. Re-authorize and make sure to grant write permissions when prompted.

**"Token expired"** -- Reconnect your AI client. The authorization flow will issue a new token.

### DataMart lag after writes

After creating or updating a record via a write tool, search results may show stale data for up to 60 seconds. This is expected behavior -- DataMart is an eventually consistent read replica. The write confirmation itself comes from the v2 REST API (source of truth) and is always accurate.

### "Permission denied" (403)

Your ITM Platform license does not allow MCP access. Team Members and Project Guests cannot use MCP tools. Contact your Company Admin to upgrade your license.

### Connection refused / timeout

- For stdio: ensure Node.js is installed and `npx` is in your PATH
- For HTTP: ensure the server is running and the port is not blocked
- Check that no other process is using the same port
