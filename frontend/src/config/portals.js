/** Portal definitions used across user admin screens. */
export const KNOWN_PORTALS = [
  {
    key: 'master_admin',
    label: 'Master Admin',
    roles: [{ value: 'admin', label: 'Admin' }],
  },
  {
    key: 'mentoring_app',
    label: 'Mentor',
    roles: [
      { value: 'candidate', label: 'Candidate' },
      { value: 'new_starter', label: 'New Starter' },
      { value: 'trainee', label: 'Trainee' },
      { value: 'mentor', label: 'Mentor' },
      { value: 'admin', label: 'Admin' },
    ],
  },
  {
    key: 'assessment_app',
    label: 'Assessment',
    roles: [
      { value: 'learner', label: 'Learner' },
      { value: 'admin', label: 'Admin' },
    ],
  },
  {
    key: 'routes_app',
    label: 'Routes',
    roles: [
      { value: 'driver', label: 'Driver' },
      { value: 'manager', label: 'Manager' },
      { value: 'admin', label: 'Admin' },
    ],
  },
  {
    key: 'hr_app',
    label: 'Headcount',
    roles: [
      { value: 'staff', label: 'Staff' },
      { value: 'manager', label: 'Manager' },
      { value: 'admin', label: 'Admin' },
    ],
  },
  {
    key: 'cpc_app',
    label: 'CPC Training',
    roles: [
      { value: 'driver', label: 'Driver' },
      { value: 'trainer', label: 'Trainer' },
      { value: 'admin', label: 'Admin' },
    ],
  },
  {
    key: 'tyre_app',
    label: 'Tyre Tracker',
    roles: [
      { value: 'fitter', label: 'Fitter' },
      { value: 'manager', label: 'Manager' },
      { value: 'admin', label: 'Admin' },
    ],
  },
  {
    key: 'cleaning_app',
    label: 'Vehicle Cleaning',
    roles: [
      { value: 'driver', label: 'Driver' },
      { value: 'manager', label: 'Manager' },
      { value: 'admin', label: 'Admin' },
    ],
  },
  {
    key: 'contracts_app',
    label: 'Contracts Portal',
    roles: [
      { value: 'manager', label: 'Manager' },
      { value: 'admin', label: 'Admin' },
    ],
  },
  {
    key: 'compliance_app',
    label: 'Weekend Availability',
    roles: [
      { value: 'user', label: 'User' },
      { value: 'manager', label: 'Manager' },
      { value: 'planner', label: 'Planner' },
      { value: 'payroll', label: 'Payroll' },
      { value: 'admin', label: 'Admin' },
    ],
  },
  {
    key: 'attendance_app',
    label: 'Attendance',
    roles: [
      { value: 'employee', label: 'Employee' },
      { value: 'manager', label: 'Manager' },
      { value: 'ops', label: 'Ops' },
      { value: 'admin', label: 'Admin' },
    ],
  },
  {
    key: 'training_app',
    label: 'Training',
    roles: [
      { value: 'employee', label: 'Employee' },
      { value: 'manager', label: 'Manager' },
      { value: 'trainer', label: 'Trainer' },
      { value: 'admin', label: 'Admin' },
    ],
  },
  {
    key: 'holidays_app',
    label: 'Holidays',
    roles: [
      { value: 'employee', label: 'Employee' },
      { value: 'manager', label: 'Manager' },
      { value: 'hr', label: 'HR' },
      { value: 'admin', label: 'Admin' },
    ],
  },
  {
    key: 'events_app',
    label: 'Events Transport',
    roles: [
      { value: 'driver', label: 'Driver' },
      { value: 'ops', label: 'Ops' },
      { value: 'admin', label: 'Admin' },
    ],
  },
  {
    key: 'cases_app',
    label: 'People Cases',
    roles: [
      { value: 'manager', label: 'Manager' },
      { value: 'hr', label: 'HR' },
      { value: 'admin', label: 'Admin' },
    ],
  },
];

export const PORTAL_KEYS = KNOWN_PORTALS.map((p) => p.key);

export function buildPortalsAccessFromMatrixRow(row = {}) {
  const access = {};
  PORTAL_KEYS.forEach((key) => {
    const role = row[key];
    if (typeof role === 'string' && role.trim()) {
      access[key] = role.trim();
    }
  });
  return access;
}

export function matrixRowFromUser(user) {
  const row = Object.fromEntries(PORTAL_KEYS.map((key) => [key, '']));
  const existing = user?.portalsAccess || {};
  PORTAL_KEYS.forEach((key) => {
    const role = existing[key];
    if (typeof role === 'string' && role.trim()) {
      row[key] = role.trim();
    }
  });
  return row;
}

export function defaultRoleForPortal(portalKey) {
  const portal = KNOWN_PORTALS.find((p) => p.key === portalKey);
  return portal?.roles?.[0]?.value || '';
}
