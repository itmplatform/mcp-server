import { createDataMartClient, type DataMartClient } from './datamart-client.js';
import { createRestClient, type RestClient } from './rest-client.js';

export interface ClientConfig {
  apiUrl: string;
  company: string;
  authHeaders: Record<string, string>;
}

export interface Clients {
  datamart: DataMartClient;
  rest: RestClient;
}

export function createClients(config: ClientConfig): Clients {
  return {
    datamart: createDataMartClient(config),
    rest: createRestClient(config),
  };
}

export type { DataMartClient, RestClient };
