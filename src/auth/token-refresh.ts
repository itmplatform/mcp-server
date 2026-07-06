import type { Logger } from 'pino';
import type { OAuthConfig } from './oauth-auth.js';
import { exchangeToken } from './oauth-auth.js';

export function createTokenRefreshCallback(
  getOAuthToken: () => string | undefined,
  exchangeConfig: OAuthConfig,
  authHeaders: Record<string, string>,
  setExpiresAt: (ms: number) => void,
  log?: Logger,
): () => Promise<void> {
  let inflight: Promise<void> | null = null;

  return () => {
    if (inflight) return inflight;

    inflight = (async () => {
      const oauthToken = getOAuthToken();
      if (!oauthToken) {
        throw new Error('No OAuth token available for re-exchange');
      }

      try {
        const result = await exchangeToken(oauthToken, exchangeConfig, log);
        authHeaders['Token'] = result.sessionToken;
        setExpiresAt(new Date(result.expiresAt).getTime());
        log?.info('Session token re-exchanged after 401');
      } catch (err) {
        log?.warn({ err }, 'Token re-exchange failed');
        throw err;
      }
    })().finally(() => {
      inflight = null;
    });

    return inflight;
  };
}
