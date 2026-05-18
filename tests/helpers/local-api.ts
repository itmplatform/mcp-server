import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRestClient, type RestClient } from '../../src/clients/rest-client.js';

export interface ReferenceItem {
  Id: number;
  BaseId?: number;
  Name?: string;
}

export function loadLocalEnv(): void {
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
  } catch {
    // .env not found -- rely on existing environment variables.
  }
}

loadLocalEnv();

export const API_URL = process.env.ITM_API_URL ?? 'http://localhost/ITM.API';
export const COMPANY = process.env.ITM_COMPANY ?? 'testsmarter';

export function getRestHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (process.env.ITM_API_KEY) {
    headers.Authorization = `Bearer ${process.env.ITM_API_KEY}`;
  } else if (process.env.ITM_TOKEN) {
    headers.Token = process.env.ITM_TOKEN;
  }
  return headers;
}

export function createLocalRestClient(): RestClient {
  return createRestClient({
    apiUrl: API_URL,
    company: COMPANY,
    authHeaders: getRestHeaders(),
  });
}

export async function fetchJson(method: string, path: string, body?: unknown): Promise<unknown> {
  const response = await fetch(`${API_URL}/v2/${COMPANY}/${path}`, {
    method,
    headers: getRestHeaders(),
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${method} ${path} failed: ${response.status} ${response.statusText} -- ${text}`);
  }
  return text ? JSON.parse(text) : undefined;
}

function responseId(response: unknown): number {
  if (response && typeof response === 'object') {
    const record = response as Record<string, unknown>;
    const id = record.Id ?? record.id ?? record.ProjectId ?? record.projectId ?? record.TaskId ?? record.taskId;
    if (typeof id === 'number') return id;
    if (typeof id === 'string') return Number(id);
  }
  throw new Error(`Could not read id from response: ${JSON.stringify(response)}`);
}

export async function createProjectViaRest(name: string, rest = createLocalRestClient()): Promise<number> {
  const typeId = (await getReferenceItems('getprojecttypes', rest))[0]?.Id;
  if (!typeId) throw new Error('No project types available');
  return responseId(await rest.post('projects', { Name: name, TypeId: typeId }));
}

export async function getReferenceItems(entity: string, rest = createLocalRestClient()): Promise<ReferenceItem[]> {
  return await rest.get(entity) as ReferenceItem[];
}

export async function getReferenceIds(entity: string, rest = createLocalRestClient()): Promise<number[]> {
  return (await getReferenceItems(entity, rest)).map(item => item.Id);
}

export async function getReferenceBaseIds(entity: string, rest = createLocalRestClient()): Promise<number[]> {
  return (await getReferenceItems(entity, rest)).map(item => item.BaseId ?? item.Id);
}

export async function deleteProjectViaRest(projectId: number): Promise<void> {
  await cleanupDelete('projects', { ProjectIds: String(projectId) });
}

export async function deleteTasksViaRest(projectId: number, taskIds: number[]): Promise<void> {
  if (!taskIds.length) return;
  await cleanupDelete(`projects/${projectId}/tasks`, { Ids: taskIds.join(',') });
}

export async function deleteRiskViaRest(projectId: number, riskId: number): Promise<void> {
  await cleanupDelete(`projects/${projectId}/risks/${riskId}`);
}

export async function deleteIssueViaRest(projectId: number, issueId: number): Promise<void> {
  await cleanupDelete(`projects/${projectId}/issues/${issueId}`);
}

async function cleanupDelete(path: string, body?: unknown): Promise<void> {
  try {
    const response = await fetch(`${API_URL}/v2/${COMPANY}/${path}`, {
      method: 'DELETE',
      headers: getRestHeaders(),
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok && response.status !== 404) {
      console.warn(`Cleanup DELETE ${path} returned ${response.status}: ${await response.text()}`);
    }
  } catch (err) {
    console.warn(`Cleanup DELETE ${path} failed:`, err);
  }
}

export function querySqlScalar(query: string): string {
  const server = process.env.ITM_SQL_SERVER ?? 'TROJANHORSE\\SQLEXPRESS';
  const database = process.env.ITM_SQL_DATABASE ?? 'ITM_App-2025-5-22-6-33';
  const user = process.env.ITM_SQL_USER ?? 'appuser';
  const password = process.env.ITM_SQL_PASSWORD ?? 'Itm@2022';
  const output = execFileSync('sqlcmd', [
    '-S', server,
    '-U', user,
    '-P', password,
    '-d', database,
    '-W',
    '-h', '-1',
    '-Q', `SET NOCOUNT ON; ${query}`,
  ], { encoding: 'utf8' });

  const line = output.split(/\r?\n/).map(value => value.trim()).find(Boolean);
  if (!line) throw new Error(`SQL query returned no rows: ${query}`);
  return line;
}

export function querySqlNumber(query: string): number {
  return Number(querySqlScalar(query));
}
