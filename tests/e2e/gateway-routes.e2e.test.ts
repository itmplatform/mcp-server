import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ChildProcess, spawn } from 'node:child_process';

const MCP_PORT = process.env.MCP_E2E_PORT ?? '6170';
const BASE = `http://localhost:${MCP_PORT}`;

let serverProcess: ChildProcess | undefined;

async function waitForServer(url: string, timeoutMs = 15000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(new URL('/health', url).href);
      if (res.ok) return;
    } catch { /* not ready */ }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`Server did not start within ${timeoutMs}ms`);
}

describe('gateway-prefixed routes', () => {
  beforeAll(async () => {
    try {
      const healthRes = await fetch(`${BASE}/health`);
      if (healthRes.ok) return;
    } catch { /* start it */ }

    serverProcess = spawn('npx', ['tsx', 'src/server.ts'], {
      env: { ...process.env, PORT: MCP_PORT, ITM_AUTH_URL: '', MCP_SERVER_URL: '' },
      stdio: 'pipe',
      shell: true,
    });
    await waitForServer(BASE);
  }, 30000);

  afterAll(async () => {
    if (serverProcess) {
      serverProcess.kill();
      serverProcess = undefined;
    }
  });

  it('GET /health returns 200', async () => {
    const res = await fetch(`${BASE}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
  });

  it('GET /v2/testsmarter/mcp/health returns 200 (gateway)', async () => {
    const res = await fetch(`${BASE}/v2/testsmarter/mcp/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
  });

  it('GET /v2/_/mcp/health returns 200 (hosted URL convention)', async () => {
    const res = await fetch(`${BASE}/v2/_/mcp/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
  });

  it('POST / initializes session', async () => {
    const res = await fetch(BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'initialize',
        params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'e2e-gw-direct', version: '1.0.0' } },
      }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('mcp-session-id')).toBeTruthy();
  });

  it('POST /v2/anyaccount/mcp/ initializes session (gateway)', async () => {
    const res = await fetch(`${BASE}/v2/anyaccount/mcp/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'initialize',
        params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'e2e-gw-gateway', version: '1.0.0' } },
      }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('mcp-session-id')).toBeTruthy();
  });

  it('OAuth metadata responds identically for direct and gateway paths', async () => {
    const direct = await fetch(`${BASE}/.well-known/oauth-protected-resource`);
    const gateway = await fetch(`${BASE}/v2/testsmarter/mcp/.well-known/oauth-protected-resource`);
    expect(direct.status).toBe(gateway.status);
  });
});

describe('http-oauth mode (tokenless rejection)', () => {
  const OAUTH_PORT = '6171';
  const OAUTH_BASE = `http://localhost:${OAUTH_PORT}`;
  let oauthServerProcess: ChildProcess | undefined;

  beforeAll(async () => {
    oauthServerProcess = spawn('npx', ['tsx', 'src/server.ts'], {
      env: {
        ...process.env,
        PORT: OAUTH_PORT,
        ITM_AUTH_URL: 'http://localhost/ITM.API',
        MCP_SERVER_URL: `http://localhost:${OAUTH_PORT}`,
        ITM_COMPANY: '',
        ITM_API_KEY: '',
        ITM_TOKEN: '',
      },
      stdio: 'pipe',
      shell: true,
    });
    await waitForServer(OAUTH_BASE);
  }, 30000);

  afterAll(async () => {
    if (oauthServerProcess) {
      oauthServerProcess.kill();
      oauthServerProcess = undefined;
    }
  });

  it('POST / initialize without Bearer token returns 401', async () => {
    const res = await fetch(OAUTH_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'initialize',
        params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'e2e-no-token', version: '1.0.0' } },
      }),
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Authentication required');
  });

  it('GET /health returns 200 without user field', async () => {
    const res = await fetch(`${OAUTH_BASE}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.user).toBeUndefined();
  });
});
