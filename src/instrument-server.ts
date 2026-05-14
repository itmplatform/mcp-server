import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Logger } from 'pino';
import { hashParameters, type AuditClient } from './clients/audit-client.js';

interface InstrumentUserContext {
  userId: number;
  accountId: number;
  aiClientId: string;
}

export function instrumentServer(
  server: McpServer,
  log: Logger,
  userCtx: InstrumentUserContext,
  auditClient: AuditClient,
): void {
  const original = server.registerTool.bind(server);

  (server as any).registerTool = (name: string, config: any, cb: any) => {
    const wrappedCb = async (args: Record<string, unknown>, extra: any) => {
      const start = Date.now();
      log.info({ tool: name, userId: userCtx.userId, aiClientId: userCtx.aiClientId }, 'Tool invoked');

      try {
        const result = await cb(args, extra);
        const durationMs = Date.now() - start;
        const isError = result?.isError === true;

        if (isError) {
          log.error({ tool: name, durationMs }, 'Tool failed');
        } else {
          log.debug({ tool: name, durationMs }, 'Tool completed');
        }

        auditClient.log({
          timestamp: new Date().toISOString(),
          userId: userCtx.userId,
          accountId: userCtx.accountId,
          toolName: name,
          parametersHash: hashParameters(args ?? {}),
          success: !isError,
          error: isError ? result.content?.[0]?.text : undefined,
          aiClientId: userCtx.aiClientId,
          durationMs,
        }).catch(() => {});

        return result;
      } catch (err) {
        const durationMs = Date.now() - start;
        log.error({ tool: name, err, durationMs }, 'Tool failed');

        auditClient.log({
          timestamp: new Date().toISOString(),
          userId: userCtx.userId,
          accountId: userCtx.accountId,
          toolName: name,
          parametersHash: hashParameters(args ?? {}),
          success: false,
          error: err instanceof Error ? err.message : String(err),
          aiClientId: userCtx.aiClientId,
          durationMs,
        }).catch(() => {});

        throw err;
      }
    };

    return original(name, config, wrappedCb as any);
  };
}
