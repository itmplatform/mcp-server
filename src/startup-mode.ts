import type { OAuthConfig } from './auth/oauth-auth.js';

export type StartupMode =
  | { mode: 'stdio' }
  | { mode: 'http-dev'; port: number }
  | { mode: 'http-oauth'; port: number; oauthConfig: OAuthConfig };

export function resolveStartupMode(
  env: Record<string, string | undefined>,
  argv: string[],
): StartupMode {
  const useHttp = env.PORT || argv.includes('--http');
  if (!useHttp) return { mode: 'stdio' };

  const port = parseInt(env.PORT ?? '0', 10);
  const authUrl = env.ITM_AUTH_URL;
  const audience = env.MCP_SERVER_URL;

  if (authUrl && audience) {
    return {
      mode: 'http-oauth',
      port,
      oauthConfig: { tokenExchangeUrl: `${authUrl}/auth/exchange-token`, audience },
    };
  }

  return { mode: 'http-dev', port };
}
