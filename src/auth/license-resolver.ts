export interface LicenseAccessResult {
  dataMartAccess: 'full' | 'pm-scoped' | 'none';
  pmScopeUserId?: number;
}

const FULL_ACCESS_TYPES = new Set([0, 1]);
const PM_TYPE = 2;

export function resolveLicenseAccess(licenseTypeIds: number[], userId: number): LicenseAccessResult {
  if (licenseTypeIds.some(id => FULL_ACCESS_TYPES.has(id))) {
    return { dataMartAccess: 'full' };
  }
  if (licenseTypeIds.includes(PM_TYPE)) {
    return { dataMartAccess: 'pm-scoped', pmScopeUserId: userId };
  }
  return { dataMartAccess: 'none' };
}
