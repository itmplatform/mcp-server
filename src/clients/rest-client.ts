import type { Logger } from 'pino';

export interface RestClientConfig {
  apiUrl: string;
  company: string;
  authHeaders: Record<string, string>;
  log?: Logger;
  onUnauthorized?: () => Promise<void>;
}

export interface RestClient {
  get(path: string): Promise<unknown>;
  post(path: string, body: unknown): Promise<unknown>;
  patch(path: string, body: unknown): Promise<unknown>;
}

const MAX_ERROR_DETAIL_LENGTH = 2000;

function normalizeErrorDetail(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;

  const normalized = value
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) return undefined;
  return normalized.slice(0, MAX_ERROR_DETAIL_LENGTH);
}

function detailFromJson(value: unknown): string | undefined {
  if (typeof value === 'string') return normalizeErrorDetail(value);
  if (value === null || typeof value !== 'object') return undefined;

  const record = value as Record<string, unknown>;
  for (const key of ['StatusMessage', 'statusMessage', 'Message', 'message', 'error', 'title']) {
    const detail = normalizeErrorDetail(record[key]);
    if (detail) return detail;
  }

  return undefined;
}

async function readErrorDetail(response: Response): Promise<string | undefined> {
  if (typeof response.text !== 'function') return undefined;

  const text = await response.text().catch(() => '');
  if (!text) return undefined;

  try {
    return detailFromJson(JSON.parse(text)) ?? normalizeErrorDetail(text);
  } catch {
    return normalizeErrorDetail(text);
  }
}

export function createRestClient(config: RestClientConfig): RestClient {
  const baseUrl = `${config.apiUrl}/v2/${config.company}`;
  const log = config.log;

  async function request(method: string, path: string, body?: unknown): Promise<unknown> {
    const start = Date.now();
    const buildHeaders = (): Record<string, string> => ({
      ...config.authHeaders,
      'Content-Type': 'application/json',
    });
    const buildFetchOpts = () => ({
      method,
      headers: buildHeaders(),
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

    let response = await fetch(`${baseUrl}/${path}`, buildFetchOpts());

    if (response.status === 401 && config.onUnauthorized) {
      try {
        await config.onUnauthorized();
        response = await fetch(`${baseUrl}/${path}`, buildFetchOpts());
      } catch {
        // re-exchange failed; fall through to the error below
      }
    }

    if (!response.ok) {
      const detail = await readErrorDetail(response);
      log?.error({ method, path, status: response.status, detail, ms: Date.now() - start }, 'REST request failed');
      const detailSuffix = detail ? ` -- ${detail}` : '';
      throw new Error(`REST request failed: ${response.status} ${response.statusText}${detailSuffix}`);
    }

    const result = await response.json();
    log?.debug({ method, path, ms: Date.now() - start }, 'REST request OK');
    return result;
  }

  return {
    get: (path: string) => request('GET', path),
    post: (path: string, body: unknown) => request('POST', path, body),
    patch: (path: string, body: unknown) => request('PATCH', path, body),
  };
}
