const MASTER_ADMIN_ROLE = 'admin';

const SELF_EDITABLE_PATHS = new Set([
  'phoneNumber',
  'personalEmail',
  'address',
  'nextOfKin',
]);

const EMPTY_ADDRESS = {
  line1: '',
  line2: '',
  city: '',
  county: '',
  postcode: '',
};

const EMPTY_NEXT_OF_KIN = {
  name: '',
  relationship: '',
  phoneNumber: '',
  email: '',
  address: '',
};

function decodeHtmlEntities(value) {
  return String(value)
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, ' ');
}

function trimString(value) {
  if (value === undefined || value === null) return '';
  return decodeHtmlEntities(String(value)).trim();
}

function parseYesNo(value) {
  const normalized = trimString(value).toLowerCase();
  if (!normalized) return null;
  if (normalized === 'yes' || normalized === 'y' || normalized === 'true') return true;
  if (normalized === 'no' || normalized === 'n' || normalized === 'false') return false;
  return null;
}

function excelSerialToIsoDate(serial) {
  if (serial === undefined || serial === null || serial === '') return '';
  const numeric = Number(serial);
  if (!Number.isFinite(numeric) || numeric <= 0) return trimString(serial);
  const utcMs = Math.round((numeric - 25569) * 86400 * 1000);
  const date = new Date(utcMs);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function sanitizeAddress(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ...EMPTY_ADDRESS };
  }

  return {
    line1: trimString(input.line1),
    line2: trimString(input.line2),
    city: trimString(input.city),
    county: trimString(input.county),
    postcode: trimString(input.postcode),
  };
}

function sanitizeNextOfKin(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ...EMPTY_NEXT_OF_KIN };
  }

  return {
    name: trimString(input.name),
    relationship: trimString(input.relationship),
    phoneNumber: trimString(input.phoneNumber),
    email: trimString(input.email).toLowerCase(),
    address: trimString(input.address),
  };
}

function sanitizeEmployeeProfile(input = {}, { partial = false } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return partial ? {} : createEmptyEmployeeProfile();
  }

  const profile = partial ? {} : createEmptyEmployeeProfile();

  const assignString = (key) => {
    if (input[key] !== undefined) profile[key] = trimString(input[key]);
  };

  const assignDate = (key) => {
    if (input[key] !== undefined) {
      const raw = input[key];
      const asString = trimString(raw);
      profile[key] = /^\d+(\.\d+)?$/.test(asString) ? excelSerialToIsoDate(asString) : asString;
    }
  };

  const assignBool = (key) => {
    if (input[key] !== undefined) {
      if (typeof input[key] === 'boolean') {
        profile[key] = input[key];
      } else {
        const parsed = parseYesNo(input[key]);
        if (parsed !== null) profile[key] = parsed;
      }
    }
  };

  assignBool('drivingStaff');
  assignBool('computerUser');
  assignBool('emergencyPhoneCover');
  assignBool('canIssueKudos');
  assignString('department');
  assignString('managerName');
  assignString('contractType');
  assignString('jobRole');
  assignString('phoneNumber');
  assignString('personalEmail');
  assignString('computerAsset');
  assignDate('dateOfBirth');
  assignDate('startDate');
  assignDate('lastAtFaultAccidentDate');
  assignDate('lastAppraisalDate');

  if (input.hoursPerWeek !== undefined) {
    const hours = Number(input.hoursPerWeek);
    profile.hoursPerWeek = Number.isFinite(hours) && hours > 0 ? hours : 0;
  }
  if (input.annualContractedHours !== undefined) {
    const annual = Number(input.annualContractedHours);
    profile.annualContractedHours = Number.isFinite(annual) && annual > 0 ? annual : 0;
  }
  if (input.fte !== undefined) {
    const fte = Number(input.fte);
    profile.fte = Number.isFinite(fte) && fte > 0 ? fte : 0;
  }

  if (input.address !== undefined) {
    profile.address = sanitizeAddress(input.address);
  }

  if (input.nextOfKin !== undefined) {
    profile.nextOfKin = sanitizeNextOfKin(input.nextOfKin);
  }

  if (profile.personalEmail) {
    profile.personalEmail = profile.personalEmail.toLowerCase();
  }

  return profile;
}

function createEmptyEmployeeProfile() {
  return {
    drivingStaff: false,
    computerUser: false,
    emergencyPhoneCover: false,
    canIssueKudos: false,
    department: '',
    managerName: '',
    contractType: '',
    jobRole: '',
    phoneNumber: '',
    personalEmail: '',
    computerAsset: '',
    hoursPerWeek: 0,
    annualContractedHours: 0,
    fte: 0,
    dateOfBirth: '',
    startDate: '',
    lastAtFaultAccidentDate: '',
    lastAppraisalDate: '',
    address: { ...EMPTY_ADDRESS },
    nextOfKin: { ...EMPTY_NEXT_OF_KIN },
  };
}

function mergeEmployeeProfiles(existing = {}, patch = {}) {
  const base = {
    ...createEmptyEmployeeProfile(),
    ...sanitizeEmployeeProfile(existing),
  };

  const sanitizedPatch = sanitizeEmployeeProfile(patch, { partial: true });

  // Do not let an empty personalEmail in a full-form save wipe a stored address —
  // that made "personal" preference appear to revert after reload.
  if (
    Object.prototype.hasOwnProperty.call(sanitizedPatch, 'personalEmail')
    && !trimString(sanitizedPatch.personalEmail)
    && trimString(base.personalEmail)
  ) {
    delete sanitizedPatch.personalEmail;
  }

  return {
    ...base,
    ...sanitizedPatch,
    address: sanitizedPatch.address
      ? { ...base.address, ...sanitizedPatch.address }
      : base.address,
    nextOfKin: sanitizedPatch.nextOfKin
      ? { ...base.nextOfKin, ...sanitizedPatch.nextOfKin }
      : base.nextOfKin,
  };
}

function isEmptyProfileValue(value) {
  if (value === null || value === undefined || value === false) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (typeof value === 'object' && !Array.isArray(value)) {
    return Object.values(value).every(isEmptyProfileValue);
  }
  return false;
}

function mergeNestedObjectsFillGaps(preferred = {}, fallback = {}, emptyTemplate = {}) {
  const base = { ...emptyTemplate, ...preferred };
  const alt = { ...emptyTemplate, ...fallback };
  const result = { ...base };

  for (const key of Object.keys(emptyTemplate)) {
    if (isEmptyProfileValue(result[key]) && !isEmptyProfileValue(alt[key])) {
      result[key] = alt[key];
    }
  }

  return result;
}

function mergeEmployeeProfilesFillGaps(preferred = {}, fallback = {}) {
  const base = mergeEmployeeProfiles({}, preferred);
  const alt = mergeEmployeeProfiles({}, fallback);
  const result = { ...base };

  for (const key of Object.keys(createEmptyEmployeeProfile())) {
    if (key === 'address' || key === 'nextOfKin') continue;
    if (isEmptyProfileValue(result[key]) && !isEmptyProfileValue(alt[key])) {
      result[key] = alt[key];
    }
  }

  result.address = mergeNestedObjectsFillGaps(base.address, alt.address, EMPTY_ADDRESS);
  result.nextOfKin = mergeNestedObjectsFillGaps(base.nextOfKin, alt.nextOfKin, EMPTY_NEXT_OF_KIN);

  return result;
}

function normalizeEmployeeName(name) {
  return trimString(name)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshteinDistance(a, b) {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const matrix = Array.from({ length: rows }, () => Array(cols).fill(0));

  for (let i = 0; i < rows; i += 1) matrix[i][0] = i;
  for (let j = 0; j < cols; j += 1) matrix[0][j] = j;

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }

  return matrix[rows - 1][cols - 1];
}

function employeeNameSimilarity(a, b) {
  const left = normalizeEmployeeName(a);
  const right = normalizeEmployeeName(b);
  if (!left || !right) return 0;
  if (left === right) return 1;

  const leftTokens = new Set(left.split(' ').filter((token) => token.length > 1));
  const rightTokens = new Set(right.split(' ').filter((token) => token.length > 1));
  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) intersection += 1;
  }
  const union = new Set([...leftTokens, ...rightTokens]).size;
  const jaccard = union > 0 ? intersection / union : 0;

  const maxLength = Math.max(left.length, right.length);
  const levRatio = maxLength > 0
    ? 1 - levenshteinDistance(left, right) / maxLength
    : 0;

  if (left.includes(right) || right.includes(left)) {
    return Math.max(jaccard, levRatio, 0.85);
  }

  return Math.max(jaccard, levRatio);
}

function hasPortalAccount(user) {
  return user?.hasPortalAccount !== false;
}

function pickNonEmptyString(preferred, fallback) {
  const preferredValue = trimString(preferred);
  if (preferredValue) return preferredValue;
  return trimString(fallback);
}

function getHrRole(profile, getEffectivePortalRole) {
  return getEffectivePortalRole(profile, 'hr_app');
}

function canViewAllEmployeeProfiles(profile, getEffectivePortalRole) {
  if (profile?.portalsAccess?.master_admin === MASTER_ADMIN_ROLE) return true;
  const hrRole = getHrRole(profile, getEffectivePortalRole);
  return hrRole === 'manager' || hrRole === 'admin';
}

function canEditAllEmployeeFields(profile, getEffectivePortalRole) {
  if (profile?.portalsAccess?.master_admin === MASTER_ADMIN_ROLE) return true;
  const hrRole = getHrRole(profile, getEffectivePortalRole);
  return hrRole === 'manager' || hrRole === 'admin';
}

function canManagePortalAccess(profile) {
  return profile?.portalsAccess?.master_admin === MASTER_ADMIN_ROLE;
}

/**
 * Who can send kudos: master admin, any portal manager/admin,
 * or an employee explicitly flagged with employeeProfile.canIssueKudos.
 */
function canIssueKudos(profile, getEffectivePortalRole) {
  if (!profile) return false;
  if (canManagePortalAccess(profile)) return true;
  if (canViewAllEmployeeProfiles(profile, getEffectivePortalRole)) return true;
  if (profile?.employeeProfile?.canIssueKudos === true) return true;

  const access = profile.portalsAccess || {};
  return Object.values(access).some((role) => {
    const normalized = String(role || '').trim().toLowerCase();
    return normalized === 'manager' || normalized === 'admin';
  });
}

function pickSelfEditablePatch(patch = {}) {
  const sanitized = sanitizeEmployeeProfile(patch, { partial: true });
  const result = {};

  for (const key of SELF_EDITABLE_PATHS) {
    if (sanitized[key] !== undefined) result[key] = sanitized[key];
  }

  return result;
}

function daysSinceDate(isoDate) {
  if (!isoDate) return null;
  const target = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const targetUtc = Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate());
  return Math.floor((todayUtc - targetUtc) / 86400000);
}

function normalizeEmail(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim().toLowerCase();
}

function normalizeBusinessCommsEmail(value) {
  const normalized = trimString(value).toLowerCase();
  return normalized === 'personal' ? 'personal' : 'work';
}

const THEME_PREFERENCES = new Set([
  'dark',
  'light',
  'corporate',
  'business',
  'nord',
  'night',
  'cupcake',
  'kawaii',
  'forest',
  'autumn',
  'sunset',
  'aqua',
  'aurora',
]);

/** Empty string = user choice (device localStorage). */
function normalizeThemePreference(value) {
  const theme = String(value || '').trim().toLowerCase();
  return THEME_PREFERENCES.has(theme) ? theme : '';
}

function inferBusinessCommsEmail(profile = {}) {
  const explicit = trimString(profile.businessCommsEmail).toLowerCase();
  if (explicit === 'personal' || explicit === 'work') {
    return explicit;
  }

  const workEmail = normalizeEmail(profile.email);
  const personalEmail = normalizeEmail(mergeEmployeeProfiles(profile.employeeProfile || {}).personalEmail);
  const storedContact = normalizeEmail(profile.contactEmail);

  if (personalEmail && storedContact === personalEmail && storedContact !== workEmail) {
    return 'personal';
  }

  return 'work';
}

function buildContactEmailFields(profile = {}) {
  const employeeProfile = mergeEmployeeProfiles(profile.employeeProfile || {});
  const workEmail = normalizeEmail(profile.email);
  const personalEmail = normalizeEmail(employeeProfile.personalEmail);
  // Honour an explicit preference. Do not silently downgrade "personal" → "work"
  // when personal email is missing — that made UI selections appear to save then revert.
  const businessCommsEmail = inferBusinessCommsEmail(profile);

  const contactEmail = businessCommsEmail === 'personal' && personalEmail
    ? personalEmail
    : workEmail;

  return { businessCommsEmail, contactEmail, personalEmail, workEmail };
}

function resolveBusinessContactEmail(profile = {}) {
  return buildContactEmailFields(profile).contactEmail;
}

function buildEmployeeProfileResponse(user) {
  const employeeProfile = mergeEmployeeProfiles(user.employeeProfile || {});
  const daysSinceLastAppraisal = daysSinceDate(employeeProfile.lastAppraisalDate);
  const { businessCommsEmail, contactEmail } = buildContactEmailFields(user);

  return {
    uid: user.uid,
    email: user.email || '',
    contactEmail,
    businessCommsEmail,
    themePreference: normalizeThemePreference(user.themePreference),
    themeEnforced: user.themeEnforced === true,
    fullName: user.fullName || '',
    isActive: user.isActive !== false,
    hasPortalAccount: user.hasPortalAccount !== false,
    portalsAccess: user.portalsAccess || {},
    portalMappings: user.portalMappings || {},
    employeeProfile: {
      ...employeeProfile,
      daysSinceLastAppraisal,
    },
    sharePointFolderName: user.sharePointFolderName || '',
    sharePointEmployeeRoot: user.sharePointEmployeeRoot || '',
    sharePointFolderConfirmedAt: user.sharePointFolderConfirmedAt || null,
  };
}

function mapHrSpreadsheetRow(row = {}) {
  return {
    fullName: trimString(row['Employee Name']),
    drivingStaff: parseYesNo(row['Driving Staff']),
    computerUser: parseYesNo(row['Computer User']),
    department: trimString(row.Department),
    managerName: trimString(row.Manager),
    contractType: trimString(row['Contract Type']),
    jobRole: trimString(row.Role),
    phoneNumber: trimString(row['Phone Number']),
    email: trimString(row.Column2).toLowerCase(),
    personalEmail: trimString(row['Personal Email']).toLowerCase(),
    computerAsset: trimString(row.Computer),
    dateOfBirth: excelSerialToIsoDate(row.DOB),
    startDate: excelSerialToIsoDate(row['Start Date']),
    isActive: parseYesNo(row['Active?']) !== false,
    lastAtFaultAccidentDate: excelSerialToIsoDate(row['Date of last at fault accident ']),
    lastAppraisalDate: excelSerialToIsoDate(row['Last Appraisal Date']),
  };
}

module.exports = {
  SELF_EDITABLE_PATHS,
  buildContactEmailFields,
  buildEmployeeProfileResponse,
  canEditAllEmployeeFields,
  canIssueKudos,
  canManagePortalAccess,
  canViewAllEmployeeProfiles,
  createEmptyEmployeeProfile,
  employeeNameSimilarity,
  hasPortalAccount,
  inferBusinessCommsEmail,
  mapHrSpreadsheetRow,
  mergeEmployeeProfiles,
  mergeEmployeeProfilesFillGaps,
  normalizeBusinessCommsEmail,
  normalizeEmployeeName,
  normalizeThemePreference,
  pickNonEmptyString,
  pickSelfEditablePatch,
  resolveBusinessContactEmail,
  sanitizeEmployeeProfile,
};
