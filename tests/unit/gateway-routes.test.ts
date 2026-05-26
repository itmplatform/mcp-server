import { describe, it, expect } from 'vitest';
import { resolveRoute } from '../../src/gateway.js';

describe('resolveRoute', () => {
  it('returns "/" for direct root path', () => {
    expect(resolveRoute('/')).toBe('/');
  });

  it('returns "/health" for direct health path', () => {
    expect(resolveRoute('/health')).toBe('/health');
  });

  it('returns "/.well-known/oauth-protected-resource" for direct OAuth metadata path', () => {
    expect(resolveRoute('/.well-known/oauth-protected-resource'))
      .toBe('/.well-known/oauth-protected-resource');
  });

  it('strips gateway prefix to "/" for root MCP path', () => {
    expect(resolveRoute('/v2/testsmarter/mcp/')).toBe('/');
  });

  it('strips gateway prefix for health endpoint', () => {
    expect(resolveRoute('/v2/testsmarter/mcp/health')).toBe('/health');
  });

  it('strips gateway prefix for OAuth metadata endpoint', () => {
    expect(resolveRoute('/v2/testsmarter/mcp/.well-known/oauth-protected-resource'))
      .toBe('/.well-known/oauth-protected-resource');
  });

  it('handles hyphenated account IDs', () => {
    expect(resolveRoute('/v2/acme-corp/mcp/health')).toBe('/health');
  });

  it('handles underscored account IDs', () => {
    expect(resolveRoute('/v2/my_company/mcp/health')).toBe('/health');
  });

  it('handles alphanumeric account IDs', () => {
    expect(resolveRoute('/v2/Company123/mcp/')).toBe('/');
  });

  it('handles underscore-only account ID used by hosted URL', () => {
    expect(resolveRoute('/v2/_/mcp/')).toBe('/');
    expect(resolveRoute('/v2/_/mcp/health')).toBe('/health');
  });

  it('returns "/" when gateway prefix has no trailing slash', () => {
    expect(resolveRoute('/v2/testsmarter/mcp')).toBe('/');
  });

  it('does not strip partial matches like /mcpx/', () => {
    expect(resolveRoute('/v2/testsmarter/mcpx/health')).toBe('/v2/testsmarter/mcpx/health');
  });

  it('preserves query strings after stripping prefix', () => {
    expect(resolveRoute('/v2/testsmarter/mcp/health?verbose=1')).toBe('/health?verbose=1');
  });
});
