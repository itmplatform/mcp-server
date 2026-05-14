import type { Logger } from 'pino';
import type { EffectiveUserContext } from './effective-user-context.js';

export interface TokenExchangeResult {
  sessionToken: string;
  userId: number;
  accountId: number;
  company: string;
  email: string;
  languageId: number;
  licenseTypeIds: number[];
  dataMartAccess: 'full' | 'pm-scoped' | 'none';
  pmScopeUserId?: number;
  expiresAt: string;
  scope: string;
}

export interface OAuthConfig {
  tokenExchangeUrl: string;
  audience: string;
}

export async function exchangeToken(
  oauthToken: string,
  config: OAuthConfig,
  log?: Logger,
): Promise<TokenExchangeResult> {
  log?.debug({ url: config.tokenExchangeUrl }, 'Token exchange request');

  const response = await fetch(config.tokenExchangeUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${oauthToken}`,
    },
    body: JSON.stringify({ audience: config.audience }),
  });

  if (!response.ok) {
    log?.error({ status: response.status }, 'Token exchange failed');
    throw new Error(`Token exchange failed: ${response.status} ${response.statusText}`);
  }

  const result = await response.json() as TokenExchangeResult;
  log?.info({ userId: result.userId, company: result.company }, 'Token exchange succeeded');
  return result;
}

export function buildEffectiveUserContextFromExchange(result: TokenExchangeResult): EffectiveUserContext {
  return {
    source: 'token',
    company: result.company,
    accountId: result.accountId,
    userId: result.userId,
    languageId: result.languageId,
    email: result.email,
    licenseTypeIds: result.licenseTypeIds,
    dataMartAccess: result.dataMartAccess,
    pmScopeUserId: result.pmScopeUserId,
    grantedScopes: result.scope.split(' ').filter(Boolean),
    authHeaders: { 'Token': result.sessionToken },
  };
}
