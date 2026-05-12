export interface RestClientConfig {
  apiUrl: string;
  company: string;
  authHeaders: Record<string, string>;
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

  async function request(method: string, path: string, body?: unknown): Promise<unknown> {
    const response = await fetch(`${baseUrl}/${path}`, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

    if (!response.ok) {
      throw new Error(`REST request failed: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  return {
    get: (path: string) => request('GET', path),
    post: (path: string, body: unknown) => request('POST', path, body),
  };
}
