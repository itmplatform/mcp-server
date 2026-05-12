import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Clients } from '../clients/index.js';

export function registerCalendarResources(server: McpServer, clients: Clients) {
  server.registerResource(
    'calendar',
    new ResourceTemplate('itm://calendars/{projectId}', { list: undefined }),
    {
      description: 'Holiday calendar and work hours for a project',
      mimeType: 'application/json',
    },
    async (_uri, variables) => {
      const projectId = variables.projectId as string;
      const data = await clients.rest.get(`holidays`);
      return {
        contents: [{
          uri: `itm://calendars/${projectId}`,
          mimeType: 'application/json',
          text: JSON.stringify(data, null, 2),
        }],
      };
    },
  );
}
