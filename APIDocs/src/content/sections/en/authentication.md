### API key authentication (stdio mode only)

For local use via stdio transport (AI clients that spawn the server as a child process). Generate an API key in your ITM Platform user settings and pass it as an environment variable:

```
ITM_API_URL=https://api.itmplatform.com
ITM_COMPANY=your-account
ITM_API_KEY=your-api-key
```

At startup, the server calls the identity resolution endpoint (`/resolve/identity`) to verify the key and determine the user's license type. If the key is invalid or the user account is disabled, the server fails to start.

API keys provide full access (read + write) based on the user's license type. There is no scope restriction -- the key represents the user's full permissions.

API key authentication is not available in HTTP+OAuth mode. When deployed with OAuth, `ITM_COMPANY` and `ITM_API_KEY` are not required -- each session authenticates via OAuth token exchange.

### OAuth 2.1 authentication

The hosted server uses OAuth 2.1 with the authorization code flow (with PKCE). This is used when AI clients connect to the server over HTTP.

```
AI Client                  MCP Server                  ITM Platform
    |                          |                            |
    |-- GET /.well-known/ ---->|                            |
    |<-- server metadata ------|                            |
    |                          |                            |
    |-- GET /authorize ------->|                            |
    |<------ redirect ---------|                            |
    |                          |                            |
    |-- browser login ---------|--------------------------->|
    |<-- authorization code ---|<---------------------------|
    |                          |                            |
    |-- POST /token ---------->|                            |
    |<-- access_token ---------|                            |
```

### Token exchange

The authorization code is exchanged for an access token via the `/token` endpoint. The token includes:

- `sub`: The user ID
- `scope`: `mcp:read` or `mcp:read mcp:write`
- `exp`: Token expiration time

### Scope enforcement

| Scope | Allowed operations |
|-------|--------------------|
| `mcp:read` | All read tools (search, get, list, aggregate, query) |
| `mcp:write` | All read tools + write tools (create, update) |

Write tools check for the `mcp:write` scope on every call. If the token only has `mcp:read`, write operations return a 403 error.

API key sessions do not have scope restrictions -- they use the full permissions of the user's license type.

### Server metadata

The MCP server publishes its OAuth configuration at `/.well-known/oauth-authorization-server`. AI clients use this to discover the authorization and token endpoints automatically.
