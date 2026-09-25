import { FEATURE_KEYS, buildFeatureAccess } from '../config/features';

export function hasFeatureAccess(user, featureKey) {
  if (!featureKey || !FEATURE_KEYS.includes(featureKey)) return false;
  if (user?.portalsAccess?.master_admin === 'admin') return true;
  return user?.featureAccess?.[featureKey] === true;
}

/** Bonus deductions / payment schedule — People Cases role OR bonus_deductions feature. */
export function canAccessBonusAdmin(user) {
  if (user?.portalsAccess?.master_admin === 'admin') return true;
  const casesRole = user?.portalsAccess?.cases_app;
  if (casesRole === 'manager' || casesRole === 'admin' || casesRole === 'hr') return true;
  return hasFeatureAccess(user, 'bonus_deductions');
}

export { buildFeatureAccess };
