import type { Logger } from 'pino';
import { createDataMartClient, type DataMartClient } from './datamart-client.js';
import { createRestClient, createV1RestClient, type RestClient } from './rest-client.js';
import { createNoOpAuditClient, type AuditClient } from './audit-client.js';

export interface ClientConfig {
  apiUrl: string;
  company: string;
  authHeaders: Record<string, string>;
  log?: Logger;
  onUnauthorized?: () => Promise<void>;
}

export interface Clients {
  datamart: DataMartClient;
  rest: RestClient;
  restV1: RestClient;
  audit: AuditClient;
}

export function createClients(config: ClientConfig, audit?: AuditClient): Clients {
  return {
    datamart: createDataMartClient(config),
    rest: createRestClient(config),
    restV1: createV1RestClient(config),
    audit: audit ?? createNoOpAuditClient(),
  };
}

export type { DataMartClient, RestClient, AuditClient };
