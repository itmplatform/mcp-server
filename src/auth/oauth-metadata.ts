export interface ProtectedResourceMetadata {
  resource: string;
  authorization_servers: string[];
  scopes_supported: string[];
}

export function buildProtectedResourceMetadata(config: {
  mcpServerUrl: string;
  authorizationServerUrl: string;
}): ProtectedResourceMetadata {
  return {
    resource: config.mcpServerUrl,
    authorization_servers: [config.authorizationServerUrl],
    scopes_supported: ['mcp:read', 'mcp:write'],
  };
}
