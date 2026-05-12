import type { Logger } from 'pino';

export interface RestClientConfig {
  apiUrl: string;
  company: string;
  authHeaders: Record<string, string>;
  log?: Logger;
}

export interface RestClient {
  get(path: string): Promise<unknown>;
  post(path: string, body: unknown): Promise<unknown>;
}

export function createRestClient(config: RestClientConfig): RestClient {
  const baseUrl = `${config.apiUrl}/v2/${config.company}`;
  const headers: Record<string, string> = {
    ...config.authHeaders,
    'Content-Type': 'application/json',
  };
  const log = config.log;

  async function request(method: string, path: string, body?: unknown): Promise<unknown> {
    const start = Date.now();

    const response = await fetch(`${baseUrl}/${path}`, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

    if (!response.ok) {
      log?.error({ method, path, status: response.status, ms: Date.now() - start }, 'REST request failed');
      throw new Error(`REST request failed: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    log?.debug({ method, path, ms: Date.now() - start }, 'REST request OK');
    return result;
  }

  return {
    get: (path: string) => request('GET', path),
    post: (path: string, body: unknown) => request('POST', path, body),
  };
}
