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
    patch: (path: string, body: unknown) => request('PATCH', path, body),
  };
}
