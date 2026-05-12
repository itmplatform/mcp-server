import { EffectiveUserContext } from './effective-user-context.js';
import { resolveLicenseAccess } from './license-resolver.js';

interface IdentityResponse {
  userId: number;
  accountId: number;
  email: string;
  languageId: number;
  licenseTypeIds: number[];
  dataMartAccess: string;
  pmScopeUserId: number | null;
}

function resolveAuthHeaders(): { source: 'api-key' | 'token'; headers: Record<string, string> } {
  const apiKey = process.env.ITM_API_KEY;
  const token = process.env.ITM_TOKEN;

  if (apiKey) {
    return { source: 'api-key', headers: { 'Authorization': `Bearer ${apiKey}` } };
  }
  if (token) {
    return { source: 'token', headers: { 'Token': token } };
  }
  throw new Error('Missing required environment variable: ITM_API_KEY or ITM_TOKEN');
}

export async function resolveIdentity(): Promise<EffectiveUserContext> {
  const apiUrl = process.env.ITM_API_URL;
  const company = process.env.ITM_COMPANY;
  if (!apiUrl) throw new Error('Missing required environment variable: ITM_API_URL');
  if (!company) throw new Error('Missing required environment variable: ITM_COMPANY');

  const { source, headers: authHeaders } = resolveAuthHeaders();

  const url = `${apiUrl}/v2/${company}/resolve/identity`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      ...authHeaders,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Identity resolution failed: ${response.status} ${response.statusText}`);
  }

  const identity: IdentityResponse = await response.json();
  const { dataMartAccess, pmScopeUserId } = resolveLicenseAccess(identity.licenseTypeIds, identity.userId);

  if (dataMartAccess === 'pm-scoped') {
    throw new Error(
      'PM-only access is not yet available for MCP. It will arrive with hosted MCP (Phase 2) or gateway scope injection.',
    );
  }
  if (dataMartAccess === 'none') {
    throw new Error('Team Member access is not available for MCP.');
  }

  return {
    source,
    company,
    accountId: identity.accountId,
    userId: identity.userId,
    languageId: identity.languageId,
    email: identity.email,
    licenseTypeIds: identity.licenseTypeIds,
    dataMartAccess,
    pmScopeUserId,
    authHeaders,
  };
}
