import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { createLogger } from './logger.js';
import { resolveIdentity } from './auth/api-key-auth.js';
import { createClients, type Clients } from './clients/index.js';
import { registerProjectTools } from './tools/projects.js';
import { registerServiceTools } from './tools/services.js';
import { registerTaskTools } from './tools/tasks.js';
import { registerFinancialTools } from './tools/financials.js';
import { registerRisksIssuesTools } from './tools/risks-issues.js';
import { registerProgressTools } from './tools/progress.js';
import { registerProjectProgressTools } from './tools/project-progress.js';
import { registerEffortTools } from './tools/effort.js';
import { registerTimeEntryTools } from './tools/time-entries.js';
import { registerPortfolioTools } from './tools/portfolio.js';
import { registerDataMartTool } from './tools/datamart.js';
import { registerUserTools } from './tools/users.js';
import { registerReferenceDataTools } from './tools/reference-data.js';
import { registerCustomFieldTools } from './tools/custom-fields.js';
import { registerWriteTools } from './tools/write-tools.js';
import { registerSchemaResources } from './resources/schemas.js';
import { registerCalendarResources } from './resources/calendars.js';
import { registerProjectStatusPrompt } from './prompts/project-status.js';
import { registerPortfolioOverviewPrompt } from './prompts/portfolio-overview.js';
import { registerTeamWorkloadPrompt } from './prompts/team-workload.js';
import { registerRiskAnalysisPrompt } from './prompts/risk-analysis.js';
import { buildProtectedResourceMetadata, buildResourceMetadataUrl } from './auth/oauth-metadata.js';
import { resolveRoute } from './gateway.js';
import { extractBearerToken } from './auth/token-extraction.js';
import { exchangeToken, buildEffectiveUserContextFromExchange } from './auth/oauth-auth.js';
import { createTokenRefreshCallback } from './auth/token-refresh.js';
import { createAuditClient } from './clients/audit-client.js';
import { hasScope, type EffectiveUserContext } from './auth/effective-user-context.js';
import { isAuditEnabled } from './audit-config.js';
import { instrumentServer } from './instrument-server.js';
import { resolveStartupMode } from './startup-mode.js';
import { getCustomFieldContext, buildServerInstructions } from './custom-field-context.js';

const log = createLogger('mcp');

interface WriteUserContext {
  userId: number;
  accountId: number;
  aiClientId: string;
}

function createMcpServer(
  clients: Clients,
  writeCtx: WriteUserContext,
  userContext: EffectiveUserContext,
  customFieldContext?: string,
): McpServer {
  const server = new McpServer(
    { name: 'itm-platform', version: '1.0.0' },
    {
      capabilities: { tools: {}, resources: {}, prompts: {} },
      ...(customFieldContext ? { instructions: buildServerInstructions(customFieldContext) } : {}),
    },
  );

  instrumentServer(server, log, writeCtx, clients.audit);

  registerProjectTools(server, clients);
  registerServiceTools(server, clients);
  registerTaskTools(server, clients);
  registerFinancialTools(server, clients);
  registerRisksIssuesTools(server, clients);
  registerProgressTools(server, clients, userContext);
  registerProjectProgressTools(server, clients, userContext);
  registerEffortTools(server, clients, userContext);
  registerTimeEntryTools(server, clients, userContext);
  registerPortfolioTools(server, clients);
  registerDataMartTool(server, clients, customFieldContext);
  registerUserTools(server, clients);
  registerReferenceDataTools(server, clients);
  registerCustomFieldTools(server, clients, userContext);
  if (hasScope(userContext, 'mcp:write')) {
    registerWriteTools(server, clients, userContext);
  }

  registerSchemaResources(server, clients);
  registerCalendarResources(server, clients);

  registerProjectStatusPrompt(server);
  registerPortfolioOverviewPrompt(server);
  registerTeamWorkloadPrompt(server);
  registerRiskAnalysisPrompt(server);

  return server;
}

async function resolveCustomFieldContext(userContext: EffectiveUserContext, clients: Clients): Promise<string | undefined> {
  if (userContext.dataMartAccess === 'none') return undefined;
  return getCustomFieldContext(userContext.company, clients, log);
}

function buildClientsForUser(userContext: EffectiveUserContext, onUnauthorized?: () => Promise<void>): Clients {
  const auditEnabled = isAuditEnabled();
  const audit = auditEnabled
    ? createAuditClient({
        apiUrl: process.env.ITM_API_URL!,
        company: userContext.company,
        authHeaders: userContext.authHeaders,
        log,
      })
    : undefined;

  return createClients({
    apiUrl: process.env.ITM_API_URL!,
    company: userContext.company,
    authHeaders: userContext.authHeaders,
    log,
    onUnauthorized,
  }, audit);
}

async function main() {
  log.info('ITM Platform MCP server starting...');

  const startupMode = resolveStartupMode(process.env, process.argv);

  if (startupMode.mode === 'stdio') {
    let userContext: EffectiveUserContext;
    try {
      userContext = await resolveIdentity();
      log.info({ userId: userContext.userId, email: userContext.email, access: userContext.dataMartAccess }, 'Identity resolved');
    } catch (err) {
      log.fatal({ err }, 'Failed to resolve identity');
      process.exit(1);
    }

    const clients = buildClientsForUser(userContext);
    const writeCtx: WriteUserContext = {
      userId: userContext.userId,
      accountId: userContext.accountId,
      aiClientId: 'stdio',
    };
    const customFieldContext = await resolveCustomFieldContext(userContext, clients);
    const server = createMcpServer(clients, writeCtx, userContext, customFieldContext);
    const transport = new StdioServerTransport();
    await server.connect(transport);
    log.info({ transport: 'stdio' }, 'MCP server connected via stdio');
    return;
  }

  // HTTP modes: http-dev or http-oauth
  const { port } = startupMode;
  let fallbackContext: EffectiveUserContext | undefined;
  let fallbackClients: Clients | undefined;

  if (startupMode.mode === 'http-dev') {
    log.warn('HTTP mode without OAuth -- all sessions use startup identity (dev only)');
    try {
      fallbackContext = await resolveIdentity();
      fallbackClients = buildClientsForUser(fallbackContext);
      log.info({ userId: fallbackContext.userId, email: fallbackContext.email, access: fallbackContext.dataMartAccess }, 'Identity resolved');
    } catch (err) {
      log.fatal({ err }, 'Failed to resolve identity');
      process.exit(1);
    }
  }

  const oauthConfig = startupMode.mode === 'http-oauth' ? startupMode.oauthConfig : undefined;
  interface TokenState {
    oauthToken: string;
    tokenExpiresAt: number;
  }
  interface SessionEntry {
    server: McpServer;
    transport: StreamableHTTPServerTransport;
    authHeaders?: Record<string, string>;
    tokenState?: TokenState;
  }
  const sessions = new Map<string, SessionEntry>();

  if (oauthConfig) {
    log.info('OAuth configured -- per-session auth enabled');
  }

  const httpServer = createServer(async (req, res) => {
    try {
      const route = resolveRoute(req.url ?? '/');

      if (req.method === 'GET' && route === '/.well-known/oauth-protected-resource') {
        if (!oauthConfig) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'OAuth not configured' }));
          return;
        }
        const metadata = buildProtectedResourceMetadata({
          mcpServerUrl: process.env.MCP_SERVER_URL!,
          authorizationServerUrl: process.env.ITM_AUTH_PUBLIC_URL || process.env.ITM_AUTH_URL!,
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(metadata));
        return;
      }

      if (req.method === 'POST' && route === '/') {
        const body = await new Promise<string>((resolve) => {
          let data = '';
          req.on('data', (chunk: Buffer) => { data += chunk.toString(); });
          req.on('end', () => resolve(data));
        });
        const parsed = JSON.parse(body);

        const sessionId = req.headers['mcp-session-id'] as string | undefined;
        let transport: StreamableHTTPServerTransport;

        if (sessionId && sessions.has(sessionId)) {
          const session = sessions.get(sessionId)!;
          transport = session.transport;

          const freshOAuthToken = extractBearerToken(req.headers as Record<string, string | undefined>);
          if (freshOAuthToken && session.tokenState) {
            session.tokenState.oauthToken = freshOAuthToken;
          }

          if (oauthConfig && session.authHeaders && session.tokenState
            && Date.now() >= session.tokenState.tokenExpiresAt - 30_000) {
            if (freshOAuthToken) {
              try {
                const refreshed = await exchangeToken(freshOAuthToken, oauthConfig, log);
                session.authHeaders['Token'] = refreshed.sessionToken;
                session.tokenState.tokenExpiresAt = new Date(refreshed.expiresAt).getTime();
                log.info({ sessionId }, 'Session token refreshed');
              } catch (err) {
                log.warn({ err, sessionId }, 'Session token refresh failed');
              }
            }
          }
        } else if (!sessionId && parsed.method === 'initialize') {
          let sessionUserContext: EffectiveUserContext;
          let sessionClients: Clients;
          let tokenState: TokenState | undefined;
          const aiClientId = parsed.params?.clientInfo?.name ?? 'unknown';

          if (oauthConfig) {
            const oauthToken = extractBearerToken(req.headers as Record<string, string | undefined>);
            if (!oauthToken) {
              const resourceMetadataUrl = buildResourceMetadataUrl(process.env.MCP_SERVER_URL!);
              res.writeHead(401, {
                'Content-Type': 'application/json',
                'WWW-Authenticate': `Bearer resource_metadata="${resourceMetadataUrl}"`,
              });
              res.end(JSON.stringify({ error: 'Authentication required' }));
              return;
            }
            try {
              const exchangeResult = await exchangeToken(oauthToken, oauthConfig, log);
              sessionUserContext = buildEffectiveUserContextFromExchange(exchangeResult);
              tokenState = {
                oauthToken,
                tokenExpiresAt: new Date(exchangeResult.expiresAt).getTime(),
              };
              const onUnauthorized = createTokenRefreshCallback(
                () => tokenState!.oauthToken,
                oauthConfig,
                sessionUserContext.authHeaders,
                (ms) => { tokenState!.tokenExpiresAt = ms; },
                log,
              );
              sessionClients = buildClientsForUser(sessionUserContext, onUnauthorized);
              log.info({ userId: sessionUserContext.userId, email: sessionUserContext.email }, 'Per-session auth resolved');
            } catch (err) {
              log.error({ err }, 'OAuth token exchange failed');
              const resourceMetadataUrl = buildResourceMetadataUrl(process.env.MCP_SERVER_URL!);
              res.writeHead(401, {
                'Content-Type': 'application/json',
                'WWW-Authenticate': `Bearer resource_metadata="${resourceMetadataUrl}"`,
              });
              res.end(JSON.stringify({ error: 'Authentication failed' }));
              return;
            }
          } else {
            sessionUserContext = fallbackContext!;
            sessionClients = fallbackClients!;
          }

          const writeCtx: WriteUserContext = {
            userId: sessionUserContext.userId,
            accountId: sessionUserContext.accountId,
            aiClientId,
          };

          const customFieldContext = await resolveCustomFieldContext(sessionUserContext, sessionClients);
          const server = createMcpServer(sessionClients, writeCtx, sessionUserContext, customFieldContext);
          transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            enableJsonResponse: true,
          });
          transport.onclose = () => {
            if (transport.sessionId) sessions.delete(transport.sessionId);
          };
          await server.connect(transport);
          await transport.handleRequest(req, res, parsed);
          if (transport.sessionId) {
            sessions.set(transport.sessionId, {
              server, transport,
              authHeaders: oauthConfig ? sessionUserContext.authHeaders : undefined,
              tokenState,
            });
            log.debug({ sessionId: transport.sessionId, aiClientId }, 'Session created');
          }
          return;
        } else {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing or invalid session' }));
          return;
        }

        await transport.handleRequest(req, res, parsed);
      } else if (req.method === 'GET' && route === '/health') {
        const health: Record<string, string> = { status: 'ok' };
        if (fallbackContext) health.user = fallbackContext.email;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(health));
      } else {
        res.writeHead(404);
        res.end();
      }
    } catch (err) {
      log.error({ err }, 'HTTP request error');
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error' }));
      }
    }
  });

  httpServer.listen(port, () => {
    log.info({ port, transport: 'http' }, `MCP server listening on http://localhost:${port}/`);
  });
}

main().catch((err) => {
  log.fatal({ err }, 'Unhandled error');
  process.exit(1);
});
