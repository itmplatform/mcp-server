export function isAuditEnabled(value = process.env.ITM_AUDIT_ENABLED): boolean {
  return value?.toLowerCase() !== 'false';
}
