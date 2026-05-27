export interface ProtectedResourceMetadata {
  resource: string;
  authorization_servers: string[];
  scopes_supported: string[];
}

function stripTrailingSlashes(url: string): string {
  return url.replace(/\/+$/, '');
}

export function buildResourceMetadataUrl(mcpServerUrl: string): string {
  return `${stripTrailingSlashes(mcpServerUrl)}/.well-known/oauth-protected-resource`;
}

export function buildProtectedResourceMetadata(config: {
  mcpServerUrl: string;
  authorizationServerUrl: string;
}): ProtectedResourceMetadata {
  return {
    resource: stripTrailingSlashes(config.mcpServerUrl),
    authorization_servers: [config.authorizationServerUrl],
    scopes_supported: ['mcp:read', 'mcp:write'],
  };
}
