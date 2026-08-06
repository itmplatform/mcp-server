import type { Logger } from 'pino';

export interface RestClientConfig {
  apiUrl: string;
  company: string;
  authHeaders: Record<string, string>;
  log?: Logger;
  onUnauthorized?: () => Promise<void>;
}

export interface RequestOptions {
  timeoutMs?: number;
}

export interface RestClient {
  get(path: string, opts?: RequestOptions): Promise<unknown>;
  post(path: string, body: unknown, opts?: RequestOptions): Promise<unknown>;
  patch(path: string, body: unknown, opts?: RequestOptions): Promise<unknown>;
  put(path: string, body: unknown, opts?: RequestOptions): Promise<unknown>;
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

async function readErrorText(response: Response): Promise<string> {
  if (typeof response.text !== 'function') return '';
  return response.text().catch(() => '');
}

function detailFromText(text: string): string | undefined {
  if (!text) return undefined;
  try {
    return detailFromJson(JSON.parse(text)) ?? normalizeErrorDetail(text);
  } catch {
    return normalizeErrorDetail(text);
  }
}

interface RequestPipeline {
  baseUrl: string;
  resolveHeaders: () => Promise<Record<string, string>>;
  onAuthRetry?: () => Promise<void>;
  // Extra auth-failure detector for a 400 response body (v1 reports expired
  // tokens as 400, not 401). Only consulted when onAuthRetry is set.
  authRetryOn400Body?: (bodyText: string) => boolean;
  parseBody: (response: Response) => Promise<unknown>;
  log?: Logger;
}

function createRequestPipeline(pipeline: RequestPipeline): RestClient {
  const { baseUrl, log } = pipeline;

  async function request(method: string, path: string, body?: unknown, opts?: RequestOptions): Promise<unknown> {
    const start = Date.now();
    const buildFetchOpts = async (signal?: AbortSignal) => ({
      method,
      headers: { ...(await pipeline.resolveHeaders()), 'Content-Type': 'application/json' },
      ...(signal ? { signal } : {}),
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

    const controller = opts?.timeoutMs ? new AbortController() : undefined;
    const timer = controller
      ? setTimeout(() => controller.abort(), opts!.timeoutMs)
      : undefined;

    try {
      let response = await fetch(`${baseUrl}/${path}`, await buildFetchOpts(controller?.signal));
      let consumedErrorText: string | undefined;

      if (pipeline.onAuthRetry) {
        let authFailure = response.status === 401;
        if (!authFailure && response.status === 400 && pipeline.authRetryOn400Body) {
          consumedErrorText = await readErrorText(response);
          authFailure = pipeline.authRetryOn400Body(consumedErrorText);
        }
        if (authFailure) {
          try {
            await pipeline.onAuthRetry();
            response = await fetch(`${baseUrl}/${path}`, await buildFetchOpts(controller?.signal));
            consumedErrorText = undefined;
          } catch {
            // re-authentication failed; fall through to the error below
          }
        }
      }

      if (!response.ok) {
        const detail = detailFromText(consumedErrorText ?? await readErrorText(response));
        log?.error({ method, path, status: response.status, detail, ms: Date.now() - start }, 'REST request failed');
        const detailSuffix = detail ? ` -- ${detail}` : '';
        throw new Error(`REST request failed: ${response.status} ${response.statusText}${detailSuffix}`);
      }

      const result = await pipeline.parseBody(response);
      log?.debug({ method, path, ms: Date.now() - start }, 'REST request OK');
      return result;
    } catch (err) {
      if (controller?.signal.aborted) {
        log?.error({ method, path, ms: Date.now() - start }, 'REST request timed out');
        throw new Error(`REST request timed out after ${opts!.timeoutMs}ms: ${method} ${path}`);
      }
      throw err;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  return {
    get: (path: string, opts?: RequestOptions) => request('GET', path, undefined, opts),
    post: (path: string, body: unknown, opts?: RequestOptions) => request('POST', path, body, opts),
    patch: (path: string, body: unknown, opts?: RequestOptions) => request('PATCH', path, body, opts),
    put: (path: string, body: unknown, opts?: RequestOptions) => request('PUT', path, body, opts),
  };
}

// Some v2 gateway routes are backed by v1 controllers that report an expired
// token as HTTP 400 with a message instead of 401 (e.g. after a concurrent
// login overwrites the platform's single token row per user).
const TOKEN_FAILURE_400 = (bodyText: string): boolean => /token expired|invalid token/i.test(bodyText);

export function createRestClient(config: RestClientConfig): RestClient {
  return createRequestPipeline({
    baseUrl: `${config.apiUrl}/v2/${config.company}`,
    resolveHeaders: async () => ({ ...config.authHeaders }),
    onAuthRetry: config.onUnauthorized,
    authRetryOn400Body: TOKEN_FAILURE_400,
    parseBody: response => response.json(),
    log: config.log,
  });
}

// v1 endpoints live outside the /v2 gateway prefix and only authenticate with
// the `Token` header: the gateway's Bearer-to-token conversion never runs for
// them. API-key sessions therefore exchange the key through the v1 Login
// route once and reuse the resulting token.
export function createV1RestClient(config: RestClientConfig): RestClient {
  const baseUrl = `${config.apiUrl}/${config.company}`;
  let v1Token: string | undefined;
  let loginPromise: Promise<void> | undefined;

  function sessionToken(): string | undefined {
    const token = config.authHeaders['Token'];
    return typeof token === 'string' && token.length > 0 ? token : undefined;
  }

  function apiKey(): string | undefined {
    const auth = config.authHeaders['Authorization'];
    if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
      const key = auth.slice('Bearer '.length).trim();
      if (key) return key;
    }
    return undefined;
  }

  async function performLogin(): Promise<void> {
    const key = apiKey();
    if (!key) throw new Error('v1 REST call requires a session token or an API key');
    const response = await fetch(`${baseUrl}/Login/${encodeURIComponent(key)}`, { method: 'GET' });
    const body = response.ok ? await response.json().catch(() => undefined) : undefined;
    const token = body && typeof body === 'object' ? (body as Record<string, unknown>).Token : undefined;
    if (typeof token !== 'string' || !token) {
      throw new Error(`v1 API-key login failed: ${response.status} ${response.statusText}`);
    }
    v1Token = token;
  }

  async function loginOnce(): Promise<void> {
    if (!loginPromise) {
      loginPromise = performLogin().finally(() => { loginPromise = undefined; });
    }
    return loginPromise;
  }

  return createRequestPipeline({
    baseUrl,
    resolveHeaders: async () => {
      if (sessionToken()) return { ...config.authHeaders };
      if (!v1Token) await loginOnce();
      return { Token: v1Token! };
    },
    onAuthRetry: async () => {
      if (sessionToken()) {
        if (!config.onUnauthorized) throw new Error('unauthorized');
        await config.onUnauthorized();
        return;
      }
      v1Token = undefined;
      await loginOnce();
    },
    // v1 TokenValidation answers 400 "Token expired" instead of 401.
    authRetryOn400Body: TOKEN_FAILURE_400,
    parseBody: async response => {
      if (response.status === 204) return null;
      const text = await response.text();
      return text ? JSON.parse(text) : null;
    },
    log: config.log,
  });
}
