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
import { registerPortfolioTools } from './tools/portfolio.js';
import { registerDataMartTool } from './tools/datamart.js';
import { registerUserTools } from './tools/users.js';
import { registerReferenceDataTools } from './tools/reference-data.js';
import { registerSchemaResources } from './resources/schemas.js';
import { registerCalendarResources } from './resources/calendars.js';
import { registerProjectStatusPrompt } from './prompts/project-status.js';
import { registerPortfolioOverviewPrompt } from './prompts/portfolio-overview.js';
import { registerTeamWorkloadPrompt } from './prompts/team-workload.js';
import { registerRiskAnalysisPrompt } from './prompts/risk-analysis.js';

const log = createLogger('mcp');

function createMcpServer(clients: Clients): McpServer {
  const server = new McpServer(
    { name: 'itm-platform', version: '1.0.0' },
    { capabilities: { tools: {}, resources: {}, prompts: {} } },
  );

  registerProjectTools(server, clients);
  registerServiceTools(server, clients);
  registerTaskTools(server, clients);
  registerFinancialTools(server, clients);
  registerRisksIssuesTools(server, clients);
  registerPortfolioTools(server, clients);
  registerDataMartTool(server, clients);
  registerUserTools(server, clients);
  registerReferenceDataTools(server, clients);

  registerSchemaResources(server, clients);
  registerCalendarResources(server, clients);

  registerProjectStatusPrompt(server);
  registerPortfolioOverviewPrompt(server);
  registerTeamWorkloadPrompt(server);
  registerRiskAnalysisPrompt(server);

  return server;
}

async function main() {
  log.info('ITM Platform MCP server starting...');

  let userContext;
  try {
    userContext = await resolveIdentity();
    log.info({ userId: userContext.userId, email: userContext.email, access: userContext.dataMartAccess }, 'Identity resolved');
  } catch (err) {
    log.fatal({ err }, 'Failed to resolve identity');
    process.exit(1);
  }

  const clients = createClients({
    apiUrl: process.env.ITM_API_URL!,
    company: userContext.company,
    authHeaders: userContext.authHeaders,
    log,
  });

  const useHttp = process.env.PORT || process.argv.includes('--http');

  if (useHttp) {
    const port = parseInt(process.env.PORT ?? '6160', 10);
    const sessions = new Map<string, { server: McpServer; transport: StreamableHTTPServerTransport }>();

    const httpServer = createServer(async (req, res) => {
      try {
      if (req.method === 'POST' && req.url === '/mcp') {
        const body = await new Promise<string>((resolve) => {
          let data = '';
          req.on('data', (chunk: Buffer) => { data += chunk.toString(); });
          req.on('end', () => resolve(data));
        });
        const parsed = JSON.parse(body);

        const sessionId = req.headers['mcp-session-id'] as string | undefined;
        let transport: StreamableHTTPServerTransport;

        if (sessionId && sessions.has(sessionId)) {
          transport = sessions.get(sessionId)!.transport;
        } else if (!sessionId && parsed.method === 'initialize') {
          const server = createMcpServer(clients);
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
            sessions.set(transport.sessionId, { server, transport });
          }
          return;
        } else {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing or invalid session' }));
          return;
        }

        await transport.handleRequest(req, res, parsed);
      } else if (req.method === 'GET' && req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', user: userContext.email }));
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
      log.info({ port, transport: 'http' }, `MCP server listening on http://localhost:${port}/mcp`);
    });
  } else {
    const server = createMcpServer(clients);
    const transport = new StdioServerTransport();
    await server.connect(transport);
    log.info({ transport: 'stdio' }, 'MCP server connected via stdio');
  }
}

main().catch((err) => {
  log.fatal({ err }, 'Unhandled error');
  process.exit(1);
});
