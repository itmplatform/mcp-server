This section is for teams that want to run the MCP server on their own infrastructure, either as a local process for individual users or as a shared HTTP service behind OAuth.

### Prerequisites

- Node.js 20 or later
- An ITM Platform account with Company Admin or Full User license
- An API key generated from your ITM Platform user settings (for stdio mode)

### Install from npm

```bash
npm install -g @itm-platform/mcp-server
```

Or run without installing:

```bash
npx @itm-platform/mcp-server
```

### Build from source

```bash
git clone https://github.com/niceTech/ITM.MCP.git  # placeholder -- update with actual repo URL
cd ITM.MCP
npm install
npm run build
```

### Configuration

Create a `.env` file in the project root. The variables required depend on the transport mode:

**Stdio mode** (local, single user):
```
ITM_API_URL=https://api.itmplatform.com
ITM_COMPANY={your-account}
ITM_API_KEY=your-api-key
LOG_LEVEL=info
```

**HTTP + OAuth mode** (deployed, multi-tenant):
```
ITM_API_URL=http://localhost/ITM.API
PORT=6170
ITM_AUTH_URL=http://localhost/ITM.API
ITM_AUTH_PUBLIC_URL=https://api.itmplatform.com
MCP_SERVER_URL=https://api.itmplatform.com/v2/_/mcp/
LOG_LEVEL=info
ITM_AUDIT_ENABLED=true
```

### Environment variables reference

| Variable | Stdio | HTTP+OAuth | Description |
|----------|-------|------------|-------------|
| `ITM_API_URL` | Required | Required | ITM Platform API gateway URL |
| `ITM_COMPANY` | Required | -- | Your company/tenant slug |
| `ITM_API_KEY` | Required* | -- | Your personal API key (*or use `ITM_TOKEN`) |
| `ITM_TOKEN` | Required* | -- | Session token (*alternative to API key) |
| `PORT` | -- | Required | HTTP server port |
| `ITM_AUTH_URL` | -- | Required | Internal OAuth authorization server URL (token exchange) |
| `ITM_AUTH_PUBLIC_URL` | -- | Required* | Public OAuth URL for AI client discovery. Falls back to `ITM_AUTH_URL` |
| `MCP_SERVER_URL` | -- | Required | MCP server public URL (OAuth audience) |
| `LOG_LEVEL` | Optional | Optional | Pino log level: `debug`, `info`, `warn`, `error` (default: `info`) |
| `ITM_AUDIT_ENABLED` | Optional | Optional | Enable audit logging to ITM backend |

In HTTP mode, when both `ITM_AUTH_URL` and `MCP_SERVER_URL` are set, OAuth is mandatory and every session must provide a Bearer token. `ITM_COMPANY` and `ITM_API_KEY` are not required in this mode.

When deployed behind a reverse proxy, `ITM_AUTH_URL` may point to `localhost` for internal token exchange. Set `ITM_AUTH_PUBLIC_URL` to the URL that AI clients can reach from the internet.

### Running the server

**Stdio mode** (for AI clients that spawn a local process):
```bash
node dist/server.js
```

**HTTP mode** (for development or self-hosted deployment):
```bash
npm run dev
```

This starts the server on the configured port (default 6170) with hot-reload.

### Production deployment

For production, build and run the compiled output:

```bash
npm run build
node dist/server.js
```

The HTTP transport is used when the `PORT` environment variable is set or when the server detects it was not spawned by an MCP client.
