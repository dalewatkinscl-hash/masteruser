/** Feature-level grants assigned per user (in addition to portal roles). */
export const KNOWN_FEATURES = [
  {
    key: 'bonus_deductions',
    label: 'Bonus deductions',
    description: 'Bonus deductions and payment schedule without People Cases access',
  },
];

export const FEATURE_KEYS = KNOWN_FEATURES.map((feature) => feature.key);

export function buildFeatureAccess(existing = {}) {
  const base = Object.fromEntries(FEATURE_KEYS.map((key) => [key, false]));
  const next = { ...base };
  for (const key of FEATURE_KEYS) {
    if (existing?.[key] === true || existing?.[key] === 'true' || existing?.[key] === 1) {
      next[key] = true;
    }
  }
  return next;
}

export function featureAccessFromUser(user = {}) {
  return buildFeatureAccess(user?.featureAccess || {});
}

export function sanitizeFeatureAccessClient(featureAccess = {}) {
  const out = {};
  for (const key of FEATURE_KEYS) {
    if (featureAccess?.[key] === true) out[key] = true;
  }
  return out;
}
