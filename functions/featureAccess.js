/**
 * Per-user feature grants (separate from portal roles).
 * Stored on users/{uid}.featureAccess as { [featureKey]: true }.
 */

const KNOWN_FEATURE_KEYS = Object.freeze(['bonus_deductions']);

function sanitizeFeatureAccess(featureAccess) {
  if (!featureAccess || typeof featureAccess !== 'object' || Array.isArray(featureAccess)) {
    return {};
  }
  const out = {};
  for (const key of KNOWN_FEATURE_KEYS) {
    if (featureAccess[key] === true) out[key] = true;
  }
  return out;
}

function hasFeatureAccess(profile, featureKey) {
  if (!featureKey || !KNOWN_FEATURE_KEYS.includes(featureKey)) return false;
  if (profile?.portalsAccess?.master_admin === 'admin') return true;
  return profile?.featureAccess?.[featureKey] === true;
}

module.exports = {
  KNOWN_FEATURE_KEYS,
  sanitizeFeatureAccess,
  hasFeatureAccess,
};
