export interface EffectiveUserContext {
  source: 'api-key' | 'token';
  company: string;
  accountId: number;
  userId: number;
  languageId: number;
  email: string;
  licenseTypeIds: number[];
  dataMartAccess: 'full' | 'pm-scoped' | 'none';
  pmScopeUserId?: number;
  authHeaders: Record<string, string>;
}
