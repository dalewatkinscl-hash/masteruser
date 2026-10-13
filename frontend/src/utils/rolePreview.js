import { buildFeatureAccess } from '../config/features';
import { buildPortalsAccess } from './portalAccess';

const STORAGE_KEY = 'cl_role_preview_id';

/** Presets that reshape portalsAccess for UI-only “view as” (APIs still use the real session). */
export const ROLE_PREVIEW_PRESETS = [
  {
    id: '',
    label: 'My access',
    hint: 'Your real portal roles',
    homePath: null,
  },
  {
    id: 'driver',
    label: 'Driver / employee',
    hint: 'No People Cases or HR hub — Submit bump card on Profile home',
    homePath: '/dashboard/profile',
    portalsAccess: {
      routes_app: 'driver',
      cpc_app: 'driver',
      cleaning_app: 'driver',
      events_app: 'driver',
      holidays_app: 'employee',
      attendance_app: 'employee',
      training_app: 'employee',
    },
    featureAccess: {},
    flags: { canIssueKudos: false },
  },
  {
    id: 'cases_manager',
    label: 'Cases manager',
    hint: 'People Cases + headcount directory (Record accident)',
    homePath: '/dashboard/hr/vehicle-accidents',
    portalsAccess: {
      cases_app: 'manager',
      hr_app: 'manager',
      vehicles_app: 'manager',
    },
    featureAccess: {},
    flags: { canIssueKudos: false },
  },
  {
    id: 'cases_hr',
    label: 'Cases HR',
    hint: 'People Cases HR role + directory',
    homePath: '/dashboard/hr/cases',
    portalsAccess: {
      cases_app: 'hr',
      hr_app: 'admin',
    },
    featureAccess: { bonus_deductions: true },
    flags: { canIssueKudos: false },
  },
  {
    id: 'headcount_manager',
    label: 'Headcount only',
    hint: 'Directory without People Cases',
    homePath: '/dashboard/hr/employees',
    portalsAccess: {
      hr_app: 'manager',
    },
    featureAccess: {},
    flags: { canIssueKudos: false },
  },
  {
    id: 'bonus_only',
    label: 'Bonus admin',
    hint: 'Bonus feature without cases or directory',
    homePath: '/dashboard/hr/bonus-deductions',
    portalsAccess: {},
    featureAccess: { bonus_deductions: true },
    flags: { canIssueKudos: false },
  },
  {
    id: 'finance_reports',
    label: 'Finance reports',
    hint: 'Country Lion Reports only (no HR / People Cases)',
    homePath: '/dashboard/reports',
    portalsAccess: {},
    featureAccess: { finance_reports: true },
    flags: { canIssueKudos: false },
  },
];

export function canUseRolePreview(realUser) {
  return realUser?.portalsAccess?.master_admin === 'admin';
}

export function readStoredRolePreviewId() {
  if (typeof window === 'undefined') return '';
  try {
    const value = window.sessionStorage.getItem(STORAGE_KEY);
    if (!value) return '';
    return ROLE_PREVIEW_PRESETS.some((p) => p.id === value) ? value : '';
  } catch {
    return '';
  }
}

export function writeStoredRolePreviewId(id) {
  if (typeof window === 'undefined') return;
  try {
    if (!id) window.sessionStorage.removeItem(STORAGE_KEY);
    else window.sessionStorage.setItem(STORAGE_KEY, id);
  } catch {
    // ignore
  }
}

export function getRolePreviewPreset(id) {
  return ROLE_PREVIEW_PRESETS.find((p) => p.id === (id || '')) || ROLE_PREVIEW_PRESETS[0];
}

/**
 * Return a shallow-cloned user with portals/features overridden for preview.
 * Identity (uid, email, name) stays real so bump-card / my-cases APIs still work for you.
 */
export function applyRolePreview(realUser, previewId) {
  if (!realUser || !previewId || !canUseRolePreview(realUser)) return realUser;
  const preset = getRolePreviewPreset(previewId);
  if (!preset?.id) return realUser;

  return {
    ...realUser,
    portalsAccess: buildPortalsAccess(preset.portalsAccess || {}),
    featureAccess: buildFeatureAccess(preset.featureAccess || {}),
    ...(preset.flags || {}),
    rolePreviewId: preset.id,
    rolePreviewLabel: preset.label,
  };
}
