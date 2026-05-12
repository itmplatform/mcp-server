import { randomUUID } from 'node:crypto';

export interface DataMartClientConfig {
  apiUrl: string;
  company: string;
  authHeaders: Record<string, string>;
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

  return {
    async query(body: DataMartQuery): Promise<Record<string, unknown>> {
      const response = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          ...config.authHeaders,
          'Content-Type': 'application/json',
          'X-Request-Id': randomUUID(),
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(`DataMart request failed: ${response.status} ${response.statusText}`);
      }

      const json = await response.json() as { data?: Record<string, unknown>; errors?: Array<{ message: string }> };

      if (json.errors?.length) {
        throw new Error(`DataMart GraphQL error: ${json.errors[0].message}`);
      }

      return json.data ?? {};
    },
  };
}
