import { ChildProcess, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, afterAll } from 'vitest';

// Load .env so E2E tests have API credentials even when run without --env-file
try {
  const content = readFileSync(resolve(process.cwd(), '.env'), 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx);
    const value = trimmed.slice(eqIdx + 1);
    if (key && !process.env[key]) process.env[key] = value;
  }
} catch { /* .env not found -- rely on existing env vars */ }

const MCP_URL = 'http://localhost:6160/mcp';
const API_URL = process.env.ITM_API_URL ?? 'http://localhost/ITM.API';
const COMPANY = process.env.ITM_COMPANY ?? 'testsmarter';
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

function getRestHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (process.env.ITM_API_KEY) {
    headers['Authorization'] = `Bearer ${process.env.ITM_API_KEY}`;
  } else if (process.env.ITM_TOKEN) {
    headers['Token'] = process.env.ITM_TOKEN;
  }
  return headers;
}

async function getFirstProjectTypeId(): Promise<number> {
  const response = await fetch(`${API_URL}/v2/${COMPANY}/getprojecttypes`, {
    method: 'GET',
    headers: getRestHeaders(),
  });
  if (!response.ok) {
    throw new Error(`Failed to get project types: ${response.status} ${response.statusText}`);
  }
  const types = await response.json() as { Id: number }[];
  if (!types.length) throw new Error('No project types available');
  return types[0].Id;
}

export async function createProjectViaRest(name: string): Promise<number> {
  const typeId = await getFirstProjectTypeId();
  const response = await fetch(`${API_URL}/v2/${COMPANY}/projects`, {
    method: 'POST',
    headers: getRestHeaders(),
    body: JSON.stringify({ Name: name, TypeId: typeId }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to create project: ${response.status} ${response.statusText} -- ${body}`);
  }
  const data = await response.json() as Record<string, unknown>;
  return (data.Id ?? data.id ?? data.ProjectId) as number;
}

export async function getReferenceIds(entity: string): Promise<number[]> {
  const response = await fetch(`${API_URL}/v2/${COMPANY}/${entity}`, {
    method: 'GET',
    headers: getRestHeaders(),
  });
  if (!response.ok) {
    throw new Error(`Failed to get ${entity}: ${response.status} ${response.statusText}`);
  }
  const items = await response.json() as { Id: number }[];
  return items.map(i => i.Id);
}

export async function deleteViaRest(path: string): Promise<void> {
  try {
    const response = await fetch(`${API_URL}/v2/${COMPANY}/${path}`, {
      method: 'DELETE',
      headers: getRestHeaders(),
    });
    if (!response.ok && response.status !== 404) {
      console.warn(`Cleanup DELETE ${path} returned ${response.status}`);
    }
  } catch (err) {
    console.warn(`Cleanup DELETE ${path} failed:`, err);
  }
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
