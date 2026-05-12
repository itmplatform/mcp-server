import { ChildProcess, spawn } from 'node:child_process';
import { beforeAll, afterAll } from 'vitest';

const MCP_URL = 'http://localhost:6160/mcp';
let sessionId: string | undefined;
let serverProcess: ChildProcess | undefined;

async function waitForServer(url: string, timeoutMs = 15000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url.replace('/mcp', '/health'));
      if (res.ok) return;
    } catch {
      // not ready yet
    }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`Server did not start within ${timeoutMs}ms`);
}

export async function startSession(): Promise<string> {
  const response = await fetch(MCP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 'e2e-test', version: '1.0.0' },
      },
    }),
  });

  const sid = response.headers.get('mcp-session-id');
  if (!sid) {
    const body = await response.text();
    throw new Error(`No session ID in initialize response: ${body}`);
  }
  sessionId = sid;

  await fetch(MCP_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      'Mcp-Session-Id': sessionId,
    },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
  });

  return sessionId;
}

export async function callTool(name: string, args: Record<string, unknown>, id = Date.now()) {
  if (!sessionId) throw new Error('Session not initialized');
  const response = await fetch(MCP_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      'Mcp-Session-Id': sessionId,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id,
      method: 'tools/call',
      params: { name, arguments: args },
    }),
  });
  return response.json();
}

export async function listTools(id = 2) {
  if (!sessionId) throw new Error('Session not initialized');
  const response = await fetch(MCP_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      'Mcp-Session-Id': sessionId,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/list' }),
  });
  return response.json();
}

export function setupE2E() {
  beforeAll(async () => {
    try {
      const healthRes = await fetch('http://localhost:6160/health');
      if (healthRes.ok) {
        await startSession();
        return;
      }
    } catch {
      // server not running, start it
    }

    serverProcess = spawn('npx', ['tsx', 'src/server.ts'], {
      env: { ...process.env, PORT: '6160' },
      stdio: 'pipe',
      shell: true,
    });

    await waitForServer('http://localhost:6160/mcp');
    await startSession();
  }, 30000);

  afterAll(async () => {
    if (serverProcess) {
      serverProcess.kill();
      serverProcess = undefined;
    }
  });
}
