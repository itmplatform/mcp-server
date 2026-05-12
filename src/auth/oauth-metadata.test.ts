import { describe, it, expect } from 'vitest';
import { buildProtectedResourceMetadata } from './oauth-metadata.js';

describe('buildProtectedResourceMetadata', () => {
  it('builds metadata with correct structure', () => {
    const metadata = buildProtectedResourceMetadata({
      mcpServerUrl: 'https://mcp.itmplatform.com',
      authorizationServerUrl: 'https://account.itmplatform.com',
    });
    expect(metadata.resource).toBe('https://mcp.itmplatform.com');
    expect(metadata.authorization_servers).toEqual(['https://account.itmplatform.com']);
  });

  it('includes mcp:read and mcp:write scopes', () => {
    const metadata = buildProtectedResourceMetadata({
      mcpServerUrl: 'https://mcp.itmplatform.com',
      authorizationServerUrl: 'https://account.itmplatform.com',
    });
    expect(metadata.scopes_supported).toContain('mcp:read');
    expect(metadata.scopes_supported).toContain('mcp:write');
  });
});
