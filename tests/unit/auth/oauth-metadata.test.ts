import { describe, it, expect } from 'vitest';
import { buildProtectedResourceMetadata, buildResourceMetadataUrl } from '../../../src/auth/oauth-metadata.js';

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

  it('normalizes trailing slash on resource field', () => {
    const metadata = buildProtectedResourceMetadata({
      mcpServerUrl: 'https://new-api.itmplatform.com/revamping/v2/_/mcp/',
      authorizationServerUrl: 'https://new-api.itmplatform.com/revamping',
    });
    expect(metadata.resource).toBe('https://new-api.itmplatform.com/revamping/v2/_/mcp');
  });
});

describe('buildResourceMetadataUrl', () => {
  it('builds correct URL when mcpServerUrl has no trailing slash', () => {
    const url = buildResourceMetadataUrl('http://localhost:6170');
    expect(url).toBe('http://localhost:6170/.well-known/oauth-protected-resource');
  });

  it('strips trailing slash to avoid double slash', () => {
    const url = buildResourceMetadataUrl('https://new-api.itmplatform.com/revamping/v2/_/mcp/');
    expect(url).toBe('https://new-api.itmplatform.com/revamping/v2/_/mcp/.well-known/oauth-protected-resource');
  });

  it('strips multiple trailing slashes', () => {
    const url = buildResourceMetadataUrl('https://example.com/mcp///');
    expect(url).toBe('https://example.com/mcp/.well-known/oauth-protected-resource');
  });
});
