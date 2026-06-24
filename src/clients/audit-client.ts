import { createHash } from 'node:crypto';
import type { Logger } from 'pino';

export interface AuditClientConfig {
  apiUrl: string;
  company: string;
  authHeaders: Record<string, string>;
  log?: Logger;
}

export interface AuditEntry {
  timestamp: string;
  userId: number;
  accountId: number;
  toolName: string;
  parametersHash: string;
  success: boolean;
  error?: string;
  aiClientId: string;
  durationMs: number;
  responseBytes?: number;
  wasTruncated?: boolean;
}

export interface AuditClient {
  log(entry: AuditEntry): Promise<void>;
}

export function hashParameters(params: unknown): string {
  return createHash('sha256').update(JSON.stringify(params)).digest('hex');
}

export function createAuditClient(config: AuditClientConfig): AuditClient {
  const url = `${config.apiUrl}/v2/${config.company}/mcp/audit`;
  const log = config.log;

  return {
    async log(entry: AuditEntry): Promise<void> {
      try {
        const headers: Record<string, string> = {
          ...config.authHeaders,
          'Content-Type': 'application/json',
        };
        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(entry),
        });
        if (!response.ok) {
          log?.warn({ status: response.status, toolName: entry.toolName }, 'Audit POST failed');
          return;
        }
        log?.debug({ toolName: entry.toolName }, 'Audit entry logged');
      } catch (err) {
        log?.warn({ err, toolName: entry.toolName }, 'Audit POST error');
      }
    },
  };
}

export function createNoOpAuditClient(): AuditClient {
  return {
    async log(): Promise<void> {},
  };
}
