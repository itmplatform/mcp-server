### Prerequisites

- Node.js 20 or later
- An ITM Platform account with Company Admin or Full User license
- An API key generated in your ITM Platform user settings

### Install from npm

```bash
npm install -g itm-mcp
```

Or run without installing:

```bash
npx -y itm-mcp
```

### Clone and build from source

```bash
git clone https://github.com/niceTech/ITM.MCP.git
cd ITM.MCP
npm install
npm run build
```

### Configuration

Create a `.env` file in the project root:

```
ITM_API_URL=https://api.itmplatform.com
ITM_COMPANY={your-account}
ITM_API_KEY=your-api-key
LOG_LEVEL=info
PORT=6170
```

### Environment variables reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ITM_API_URL` | Yes | -- | ITM Platform API gateway URL |
| `ITM_COMPANY` | Yes | -- | Your company/tenant slug |
| `ITM_API_KEY` | Yes* | -- | Your personal API key (*or use `ITM_TOKEN`) |
| `ITM_TOKEN` | Yes* | -- | Session token (*alternative to API key) |
| `LOG_LEVEL` | No | `info` | Pino log level: `debug`, `info`, `warn`, `error` |
| `PORT` | No | `6170` | HTTP server port (for dev/hosted mode) |
| `ITM_AUTH_URL` | No | -- | OAuth authorization server URL |
| `MCP_SERVER_URL` | No | -- | MCP server URL for OAuth resource metadata |
| `ITM_AUDIT_ENABLED` | No | `false` | Enable audit logging to ITM backend |

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
