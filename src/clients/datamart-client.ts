import { randomUUID } from 'node:crypto';
import type { Logger } from 'pino';

export interface DataMartClientConfig {
  apiUrl: string;
  company: string;
  authHeaders: Record<string, string>;
  log?: Logger;
}

export interface DataMartQuery {
  query: string;
  variables: Record<string, unknown>;
}

export interface DataMartClient {
  query(body: DataMartQuery): Promise<Record<string, unknown>>;
}

export function createDataMartClient(config: DataMartClientConfig): DataMartClient {
  const baseUrl = `${config.apiUrl}/v2/${config.company}/datamart/graphql`;
  const log = config.log;

  return {
    async query(body: DataMartQuery): Promise<Record<string, unknown>> {
      const requestId = randomUUID();
      const start = Date.now();

      const response = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          ...config.authHeaders,
          'Content-Type': 'application/json',
          'X-Request-Id': requestId,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        log?.error({ requestId, status: response.status, ms: Date.now() - start }, 'DataMart request failed');
        throw new Error(`DataMart request failed: ${response.status} ${response.statusText}`);
      }

      const json = await response.json() as { data?: Record<string, unknown>; errors?: Array<{ message: string }> };

      if (json.errors?.length) {
        log?.error({ requestId, graphqlError: json.errors[0].message, ms: Date.now() - start }, 'DataMart GraphQL error');
        throw new Error(`DataMart GraphQL error: ${json.errors[0].message}`);
      }

      log?.debug({ requestId, ms: Date.now() - start }, 'DataMart request OK');
      return json.data ?? {};
    },
  };
}
