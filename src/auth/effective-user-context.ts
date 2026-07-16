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
  grantedScopes?: string[];
}

export const WRITE_TOOL_NAMES = new Set([
  'create_project', 'create_task', 'update_task', 'create_risk', 'create_issue', 'update_project',
  'create_task_progress', 'update_task_progress',
  'bulk_update_task_status', 'bulk_update_activity_status',
]);

export function hasScope(ctx: EffectiveUserContext, scope: string): boolean {
  if (!ctx.grantedScopes) return true;
  return ctx.grantedScopes.includes(scope);
}
