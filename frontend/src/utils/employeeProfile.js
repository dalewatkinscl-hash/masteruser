export function canViewAllEmployeeProfiles(user) {
  if (user?.portalsAccess?.master_admin === 'admin') return true;
  const hrRole = user?.portalsAccess?.hr_app;
  return hrRole === 'manager' || hrRole === 'admin';
}

export function canEditAllEmployeeFields(user) {
  return canViewAllEmployeeProfiles(user);
}

export function canManagePortalAccess(user) {
  return user?.portalsAccess?.master_admin === 'admin';
}

/** Employee directory / milestones / roll calls inside the in-app HR portal. */
export function canAccessHrDirectory(user) {
  return canViewAllEmployeeProfiles(user);
}

export function formatDisplayDate(value) {
  if (!value) return '—';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function calculateAge(dateOfBirth) {
  if (!dateOfBirth) return null;
  const dob = new Date(`${dateOfBirth}T00:00:00`);
  if (Number.isNaN(dob.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const hadBirthdayThisYear =
    today.getMonth() > dob.getMonth()
    || (today.getMonth() === dob.getMonth() && today.getDate() >= dob.getDate());

  if (!hadBirthdayThisYear) age -= 1;
  return age;
}

export function daysUntilBirthday(dateOfBirth) {
  if (!dateOfBirth) return null;
  const dob = new Date(`${dateOfBirth}T00:00:00`);
  if (Number.isNaN(dob.getTime())) return null;

  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let nextBirthday = new Date(today.getFullYear(), dob.getMonth(), dob.getDate());

  if (nextBirthday < todayStart) {
    nextBirthday = new Date(today.getFullYear() + 1, dob.getMonth(), dob.getDate());
  }

  return Math.round((nextBirthday - todayStart) / 86400000);
}

export function calculateYearsOfService(startDate) {
  if (!startDate) return null;
  const start = new Date(`${startDate}T00:00:00`);
  if (Number.isNaN(start.getTime())) return null;

  const today = new Date();
  let years = today.getFullYear() - start.getFullYear();
  const hadAnniversaryThisYear =
    today.getMonth() > start.getMonth()
    || (today.getMonth() === start.getMonth() && today.getDate() >= start.getDate());

  if (!hadAnniversaryThisYear) years -= 1;
  if (years < 0) return null;

  return years;
}

export function formatBirthdaySummary(dateOfBirth) {
  if (!dateOfBirth) return null;
  const age = calculateAge(dateOfBirth);
  const daysUntil = daysUntilBirthday(dateOfBirth);
  if (age === null || daysUntil === null) return null;

  const birthdayLabel = daysUntil === 0
    ? 'Birthday today'
    : daysUntil === 1
      ? 'Birthday tomorrow'
      : `${daysUntil} days until birthday`;

  return { age, daysUntil, birthdayLabel };
}

export function phoneHref(phone) {
  const trimmed = (phone || '').trim();
  if (!trimmed) return '';

  const digits = trimmed.replace(/[^\d+]/g, '');
  if (!digits) return '';

  if (digits.startsWith('+')) return `tel:${digits}`;
  if (digits.startsWith('0')) return `tel:+44${digits.slice(1)}`;
  return `tel:${digits}`;
}

export function createEmptyEmployeeProfile() {
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
    dateOfBirth: '',
    startDate: '',
    lastAtFaultAccidentDate: '',
    lastAppraisalDate: '',
    address: {
      line1: '',
      line2: '',
      city: '',
      county: '',
      postcode: '',
    },
    nextOfKin: {
      name: '',
      relationship: '',
      phoneNumber: '',
      email: '',
      address: '',
    },
  };
}

export function normalizeBusinessCommsEmail(value) {
  return value === 'personal' ? 'personal' : 'work';
}

export function resolveBusinessContactEmail(profile = {}) {
  const workEmail = (profile.email || '').trim().toLowerCase();
  const personalEmail = (
    profile.employeeProfile?.personalEmail
    || profile.personalEmail
    || ''
  ).trim().toLowerCase();
  const preference = normalizeBusinessCommsEmail(profile.businessCommsEmail);

  if (preference === 'personal' && personalEmail) {
    return personalEmail;
  }

  return workEmail;
}

export async function readJsonResponse(res) {
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    return null;
  }

  try {
    return await res.json();
  } catch {
    return null;
  }
}
