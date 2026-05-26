import { describe, it, expect } from 'vitest';
import { resolveStartupMode } from '../../src/startup-mode.js';

describe('resolveStartupMode', () => {
  const baseEnv: Record<string, string | undefined> = {};

  it('returns stdio when PORT is absent and --http not in argv', () => {
    const result = resolveStartupMode(baseEnv, []);
    expect(result).toEqual({ mode: 'stdio' });
  });

  it('returns http-dev when PORT set but ITM_AUTH_URL absent', () => {
    const result = resolveStartupMode({ PORT: '6170' }, []);
    expect(result.mode).toBe('http-dev');
  });

  it('returns http-dev when PORT set but MCP_SERVER_URL absent', () => {
    const result = resolveStartupMode(
      { PORT: '6170', ITM_AUTH_URL: 'http://localhost/ITM.API' },
      [],
    );
    expect(result.mode).toBe('http-dev');
  });

  it('returns http-oauth when PORT + ITM_AUTH_URL + MCP_SERVER_URL all set', () => {
    const result = resolveStartupMode(
      { PORT: '6170', ITM_AUTH_URL: 'http://localhost/ITM.API', MCP_SERVER_URL: 'http://localhost:6170' },
      [],
    );
    expect(result.mode).toBe('http-oauth');
  });

  it('http-oauth includes correct oauthConfig', () => {
    const result = resolveStartupMode(
      { PORT: '6170', ITM_AUTH_URL: 'http://auth.example.com', MCP_SERVER_URL: 'http://mcp.example.com' },
      [],
    );
    expect(result).toMatchObject({
      mode: 'http-oauth',
      port: 6170,
      oauthConfig: {
        tokenExchangeUrl: 'http://auth.example.com/auth/exchange-token',
        audience: 'http://mcp.example.com',
      },
    });
  });

  it('http-dev includes correct port', () => {
    const result = resolveStartupMode({ PORT: '3170' }, []);
    expect(result).toMatchObject({ mode: 'http-dev', port: 3170 });
  });

  it('returns http-dev when --http flag is used without PORT', () => {
    const result = resolveStartupMode({}, ['node', 'server.js', '--http']);
    expect(result.mode).toBe('http-dev');
  });
});
