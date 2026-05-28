# Manual Testing Guide -- MCP on Stage

> How to verify the hosted MCP server end-to-end on the stage environment.

## Stage URLs

| Endpoint | URL |
|----------|-----|
| MCP server (via gateway) | `https://new-api.itmplatform.com/revamping/v2/_/mcp/` |
| OAuth authorization server | `https://new-api.itmplatform.com/revamping/` |
| Protected resource metadata | `https://new-api.itmplatform.com/revamping/v2/_/mcp/.well-known/oauth-protected-resource` |
| Auth server metadata | `https://new-api.itmplatform.com/revamping/.well-known/oauth-authorization-server` |
| Health check | `https://new-api.itmplatform.com/revamping/v2/_/mcp/health` |
| Client registration | `https://new-api.itmplatform.com/revamping/oauth/register` |
| Authorization | `https://new-api.itmplatform.com/revamping/oauth/authorize` |
| Token | `https://new-api.itmplatform.com/revamping/oauth/token` |
| Login page (stage) | `https://new.itmplatform.com/revamping/` |

**Important:** Always use the trailing slash on the MCP URL (`/mcp/`). Without it, the IIS gateway returns an empty response.

---

## 1. Quick smoke test (no auth needed)

These endpoints work without any authentication.

### Health check

```powershell
curl https://new-api.itmplatform.com/revamping/v2/_/mcp/health
```

Expected: `{"status":"ok"}`

### Protected resource metadata

```powershell
curl https://new-api.itmplatform.com/revamping/v2/_/mcp/.well-known/oauth-protected-resource
```

Expected:
```json
{
  "resource": "https://new-api.itmplatform.com/revamping/v2/_/mcp",
  "authorization_servers": ["https://new-api.itmplatform.com/revamping"],
  "scopes_supported": ["mcp:read", "mcp:write"]
}
```

Verify:
- Content-Type is `application/json` (not `application/octet-stream`)
- No `service_documentation` field
- `resource` has no trailing slash
- `authorization_servers` is the public URL (not `localhost`)

### Authorization server metadata

```powershell
curl https://new-api.itmplatform.com/revamping/.well-known/oauth-authorization-server
```

Expected: JSON with `issuer`, `authorization_endpoint`, `token_endpoint`, `registration_endpoint`, etc.

Verify:
- Content-Type is `application/json` (not `application/octet-stream`)
- No `service_documentation` field
- All endpoint URLs start with `https://new-api.itmplatform.com/revamping/`

### 401 challenge

```powershell
curl -D - -X POST https://new-api.itmplatform.com/revamping/v2/_/mcp/ `
  -H "Content-Type: application/json" `
  -d '{"jsonrpc":"2.0","method":"initialize","id":1,"params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'
```

Expected:
- HTTP 401
- `WWW-Authenticate: Bearer resource_metadata="https://new-api.itmplatform.com/revamping/v2/_/mcp/.well-known/oauth-protected-resource"`
- No double slashes in the URL

---

## 2. Full OAuth flow (curl + browser)

This walks through the complete OAuth 2.1 flow that an AI client performs automatically. You will do it manually, step by step.

### Step 1: Register a client

```powershell
curl -X POST https://new-api.itmplatform.com/revamping/oauth/register `
  -H "Content-Type: application/json" `
  -d '{"client_name":"manual-test","redirect_uris":["http://localhost:3000/callback"],"grant_types":["authorization_code"],"response_types":["code"],"token_endpoint_auth_method":"none"}'
```

Expected: 201 with a JSON body containing `client_id`. Save it:

```powershell
$CLIENT_ID = "dcr_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"   # paste the value you got
```

### Step 2: Generate a PKCE code verifier and challenge

OAuth 2.1 requires PKCE. Generate the values:

```powershell
# Generate a random code_verifier (43-128 chars, URL-safe)
$bytes = [byte[]]::new(32)
[System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
$CODE_VERIFIER = [Convert]::ToBase64String($bytes) -replace '\+','-' -replace '/','_' -replace '='
Write-Host "code_verifier: $CODE_VERIFIER"

# Compute code_challenge = BASE64URL(SHA256(code_verifier))
$sha256 = [System.Security.Cryptography.SHA256]::Create()
$hash = $sha256.ComputeHash([System.Text.Encoding]::ASCII.GetBytes($CODE_VERIFIER))
$CODE_CHALLENGE = [Convert]::ToBase64String($hash) -replace '\+','-' -replace '/','_' -replace '='
Write-Host "code_challenge: $CODE_CHALLENGE"
```

### Step 3: Open the authorization URL in a browser

Build the URL and open it:

```powershell
$AUTH_URL = "https://new-api.itmplatform.com/revamping/oauth/authorize?response_type=code&client_id=$CLIENT_ID&redirect_uri=http://localhost:3000/callback&code_challenge=$CODE_CHALLENGE&code_challenge_method=S256&scope=mcp:read mcp:write&resource=https://new-api.itmplatform.com/revamping/v2/_/mcp&state=test123"
Write-Host $AUTH_URL
Start-Process $AUTH_URL
```

This opens the ITM Platform login page. Log in with your stage credentials:

| Field | Value |
|-------|-------|
| Company | `testsmarter` or `itmrozas` |
| Email | `daniel.piret@itmplatform.com` |
| Password | `1` |

After login, the browser redirects to `http://localhost:3000/callback?code=XXXXX&state=test123`.

Since nothing is listening on localhost:3000, the browser will show a "connection refused" page. That is expected. **Copy the `code` value from the URL bar.**

```powershell
$AUTH_CODE = "paste-the-code-here"
```

### Step 4: Exchange the code for tokens

```powershell
curl -X POST https://new-api.itmplatform.com/revamping/oauth/token `
  -H "Content-Type: application/x-www-form-urlencoded" `
  -d "grant_type=authorization_code&code=$AUTH_CODE&client_id=$CLIENT_ID&redirect_uri=http://localhost:3000/callback&code_verifier=$CODE_VERIFIER"
```

Expected: JSON with `access_token`, `refresh_token`, `token_type`, `expires_in`, `scope`.

```powershell
$ACCESS_TOKEN = "paste-the-access-token-here"
```

### Step 5: Call the MCP server with the token

Send an `initialize` request:

```powershell
$response = curl -s -D - -X POST https://new-api.itmplatform.com/revamping/v2/_/mcp/ `
  -H "Content-Type: application/json" `
  -H "Authorization: Bearer $ACCESS_TOKEN" `
  -d '{"jsonrpc":"2.0","method":"initialize","id":1,"params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"manual-test","version":"1.0"}}}'
$response
```

Expected:
- HTTP 200
- Response body includes `serverInfo`, `protocolVersion`, `capabilities`
- Response header `mcp-session-id` with a UUID

Save the session ID:

```powershell
$SESSION_ID = "paste-the-mcp-session-id-header-value"
```

### Step 6: List available tools

```powershell
curl -s -X POST https://new-api.itmplatform.com/revamping/v2/_/mcp/ `
  -H "Content-Type: application/json" `
  -H "Authorization: Bearer $ACCESS_TOKEN" `
  -H "mcp-session-id: $SESSION_ID" `
  -d '{"jsonrpc":"2.0","method":"tools/list","id":2}'
```

Expected: JSON with a `tools` array listing all available MCP tools (search_projects, get_project, etc.).

### Step 7: Call a tool

```powershell
curl -s -X POST https://new-api.itmplatform.com/revamping/v2/_/mcp/ `
  -H "Content-Type: application/json" `
  -H "Authorization: Bearer $ACCESS_TOKEN" `
  -H "mcp-session-id: $SESSION_ID" `
  -d '{"jsonrpc":"2.0","method":"tools/call","id":3,"params":{"name":"search_projects","arguments":{"limit":3}}}'
```

Expected: JSON with project data from the stage database.

### Step 8 (optional): Refresh the token

Access tokens expire in 15 minutes. To get a new one:

```powershell
curl -X POST https://new-api.itmplatform.com/revamping/oauth/token `
  -H "Content-Type: application/x-www-form-urlencoded" `
  -d "grant_type=refresh_token&refresh_token=$REFRESH_TOKEN&client_id=$CLIENT_ID"
```

---

## 3. Testing with an AI client

The real test is using an actual AI client. The client handles the entire OAuth flow automatically.

### Claude Desktop (remote MCP)

Claude Desktop supports remote MCP servers via the `url` field. Edit `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "itm-platform-stage": {
      "type": "url",
      "url": "https://new-api.itmplatform.com/revamping/v2/_/mcp/"
    }
  }
}
```

Restart Claude Desktop. When you first use an ITM tool, Claude will open a browser window for OAuth login. Log in with the stage credentials above.

### Claude Code (remote MCP)

```bash
claude mcp add --scope user --transport http itm-platform-stage https://new-api.itmplatform.com/revamping/v2/_/mcp/
```

The `--scope user` flag makes the server available in all Claude Code sessions. Without it, the config is saved to `.mcp.json` in the current directory only.

After adding, authenticate the server:

1. Start Claude Code (`claude`)
2. Type `/mcp`
3. Select `itm-platform-stage`
4. Select **Authenticate** -- a browser window opens
5. Log in with your stage credentials (see table above)
6. After login, the browser redirects back and Claude Code shows the server as connected
7. You can now use ITM Platform tools in conversation

### VS Code Copilot

Add to `.vscode/mcp.json`:

```json
{
  "servers": {
    "itm-platform-stage": {
      "type": "http",
      "url": "https://new-api.itmplatform.com/revamping/v2/_/mcp/"
    }
  }
}
```

### What to try once connected

Ask the AI:
- "List my projects" -- should call `search_projects`
- "Show me the budget for project X" -- should call `get_project_budget`
- "Who are the team members?" -- should call `search_users`
- "What are the open risks across all projects?" -- should call `search_projects` + `get_project_risks`
- "Create a task called 'Test MCP' in project X" -- should call `create_task` (needs `mcp:write` scope)

---

## 4. Expected results checklist

| # | Test | Expected |
|---|------|----------|
| 1 | Health endpoint | `{"status":"ok"}` |
| 2 | Resource metadata Content-Type | `application/json` |
| 3 | Resource metadata `resource` field | No trailing slash |
| 4 | Resource metadata `authorization_servers` | Public URL, not localhost |
| 5 | Resource metadata `service_documentation` | Field absent |
| 6 | Auth server metadata Content-Type | `application/json` |
| 7 | Auth server metadata `service_documentation` | Field absent |
| 8 | POST without token | 401 with `WWW-Authenticate` header |
| 9 | `resource_metadata` URL in 401 | No double slashes |
| 10 | Client registration | 201 with `client_id` |
| 11 | Authorization with correct resource | 302 to login page |
| 12 | Authorization with trailing-slash resource | 302 to login page (accepted) |
| 13 | Authorization with wrong resource | 302 to callback with `error=invalid_target` |
| 14 | Token exchange with valid code | 200 with `access_token` + `refresh_token` |
| 15 | MCP initialize with valid token | 200 with server info + session ID |
| 16 | tools/list | 200 with 15-20 tools |
| 17 | tools/call (search_projects) | 200 with project data |
| 18 | Token refresh | 200 with new `access_token` |

---

## 5. Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Empty reply from server | URL missing trailing slash | Use `/mcp/` not `/mcp` |
| 401 on initialize | Token expired or invalid | Get a fresh token (Step 4 or 8) |
| `invalid_target` on authorize | Wrong `resource` parameter | Use `https://new-api.itmplatform.com/revamping/v2/_/mcp` |
| 400 `Missing or invalid session` | Missing `mcp-session-id` header on non-initialize request | Include the session ID header from the initialize response |
| 404 on `/register` through MCP gateway | Registration goes through the auth server, not MCP | Use `https://new-api.itmplatform.com/revamping/oauth/register` |
| Login page does not load | Stage web app down | Check `https://new.itmplatform.com/revamping/` in browser |
| "Authorization request not found or expired" | `OAuthInternalSharedSecret` missing from ITM.Web config | Add the secret to `Web.config` `<appSettings>` on the server |
| Token exchange fails with 404 | `ITM_AUTH_URL` pointing to wrong service | Must point to ITM.Account (port 3121 on stage), not ITM.API |
| `undefined` in API URLs at runtime | `.env` file has UTF-8 BOM | Rewrite file without BOM (PowerShell `Set-Content -Encoding UTF8` adds BOM) |
| `REST request failed: 404` on tool calls | `ITM_API_URL` pointing to `localhost/ITM.API` | Use host-header URL: `http://new-api.itmplatform.com/revamping` |
| `API calls quota exceeded` | Rate limit is 3 req/sec per IP | Wait and retry, or increase limit in ITM.API config |
| Token exchange fails with 500 | ITM.Account cannot reach ITM.API internally | SSH to stage VM and check IIS sites are running |
