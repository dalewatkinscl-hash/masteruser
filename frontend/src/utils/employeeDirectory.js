import { resolveContractDisplayLabel } from './contractModes';

export function getEmployeeStatusLabel(employee) {
  if (employee?.hasPortalAccount === false) return 'HR only';
  return employee?.isActive ? 'Active' : 'Inactive';
}

function getEmployeeContractLabel(employee) {
  return resolveContractDisplayLabel({
    bonusHoursMode: employee?.employeeProfile?.bonusHoursMode,
    contractType: employee?.employeeProfile?.contractType,
  });
}

export function formatEmployeeDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    // Already a display string or partial ISO date.
    const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return `${match[3]}/${match[2]}/${match[1]}`;
    return String(value);
  }
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function yesNoLabel(value) {
  return value ? 'Yes' : 'No';
}

export const GROUP_BY_OPTIONS = [
  { value: '', label: 'No grouping' },
  { value: 'department', label: 'Department' },
  { value: 'jobRole', label: 'Job title' },
  { value: 'drivingStaff', label: 'Driving staff' },
  { value: 'status', label: 'Status' },
];

/** Default columns shown before customisation. */
export const CORE_COLUMNS = [
  { id: 'name', label: 'Name', filterPlaceholder: 'Filter name…', locked: true },
  { id: 'jobRole', label: 'Job title', filterPlaceholder: 'Filter job…' },
  { id: 'department', label: 'Department', filterPlaceholder: 'Filter dept…' },
  { id: 'drivingStaff', label: 'Driving staff', filterPlaceholder: 'Yes / No…' },
  { id: 'phone', label: 'Phone', filterPlaceholder: 'Filter phone…' },
  { id: 'status', label: 'Status', filterPlaceholder: 'Filter status…' },
];

/** Extra columns available from the Columns picker. */
export const OPTIONAL_COLUMNS = [
  { id: 'dateOfBirth', label: 'D.O.B', filterPlaceholder: 'Filter D.O.B…' },
  { id: 'startDate', label: 'Start date', filterPlaceholder: 'Filter start…' },
  { id: 'contract', label: 'Contract', filterPlaceholder: 'Filter contract…' },
  { id: 'contractedHours', label: 'Contracted hours', filterPlaceholder: 'Filter hours…' },
  { id: 'computerUser', label: 'Computer user', filterPlaceholder: 'Yes / No…' },
  { id: 'emergencyPhoneCover', label: 'Emergency phone cover', filterPlaceholder: 'Yes / No…' },
];

/** All data columns that can appear in the directory table. */
export const TABLE_COLUMNS = [...CORE_COLUMNS, ...OPTIONAL_COLUMNS];

export const TABLE_COLUMN_IDS = TABLE_COLUMNS.map((column) => column.id);
export const OPTIONAL_COLUMN_IDS = OPTIONAL_COLUMNS.map((column) => column.id);
export const DEFAULT_VISIBLE_COLUMN_IDS = CORE_COLUMNS.map((column) => column.id);

export const SORTABLE_COLUMNS = TABLE_COLUMN_IDS;

const EMPTY_SORT_VALUE = '\uffff';
const COLUMN_PREFS_KEY = 'cl_employee_directory_columns';

function sanitizeVisibleColumnIds(columnIds) {
  const allowed = new Set(TABLE_COLUMN_IDS);
  const unique = [];
  for (const id of columnIds) {
    if (!allowed.has(id) || unique.includes(id)) continue;
    unique.push(id);
  }
  // Name is always required so the row still identifies the employee.
  if (!unique.includes('name')) unique.unshift('name');
  return unique;
}

/** Ensure newer default columns appear for users with saved prefs. */
function ensureDefaultColumns(columnIds) {
  const ids = [...columnIds];
  if (!ids.includes('drivingStaff')) {
    const after = ids.indexOf('department');
    ids.splice(after >= 0 ? after + 1 : ids.length, 0, 'drivingStaff');
  }
  return sanitizeVisibleColumnIds(ids);
}

export function loadVisibleColumns() {
  try {
    const raw = window.localStorage.getItem(COLUMN_PREFS_KEY);
    if (!raw) return [...DEFAULT_VISIBLE_COLUMN_IDS];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...DEFAULT_VISIBLE_COLUMN_IDS];

    // Migrate older prefs that only stored optional column ids.
    const onlyOptionals = parsed.length > 0
      && parsed.every((id) => OPTIONAL_COLUMN_IDS.includes(id));
    if (onlyOptionals) {
      return ensureDefaultColumns([...DEFAULT_VISIBLE_COLUMN_IDS, ...parsed]);
    }

    return ensureDefaultColumns(parsed);
  } catch {
    return [...DEFAULT_VISIBLE_COLUMN_IDS];
  }
}

export function saveVisibleColumns(columnIds) {
  try {
    window.localStorage.setItem(
      COLUMN_PREFS_KEY,
      JSON.stringify(sanitizeVisibleColumnIds(columnIds)),
    );
  } catch {
    // ignore storage failures
  }
}

/** @deprecated Prefer loadVisibleColumns */
export function loadVisibleOptionalColumns() {
  return loadVisibleColumns().filter((id) => OPTIONAL_COLUMN_IDS.includes(id));
}

/** @deprecated Prefer saveVisibleColumns */
export function saveVisibleOptionalColumns(columnIds) {
  saveVisibleColumns([...DEFAULT_VISIBLE_COLUMN_IDS, ...columnIds]);
}

export function createEmptyColumnFilters() {
  const filters = {};
  for (const id of TABLE_COLUMN_IDS) {
    filters[id] = [];
  }
  return filters;
}

/** Default filters for directory views — active staff only. */
export function createDefaultColumnFilters() {
  const filters = createEmptyColumnFilters();
  filters.status = ['Active'];
  return filters;
}

export function isActiveEmployee(employee) {
  return employee?.isActive !== false;
}

export function getVisibleTableColumns(visibleColumnIds) {
  const order = new Map(TABLE_COLUMNS.map((column, index) => [column.id, index]));
  return sanitizeVisibleColumnIds(visibleColumnIds)
    .map((id) => TABLE_COLUMNS.find((column) => column.id === id))
    .filter(Boolean)
    .sort((left, right) => (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0));
}

/** Canonical option value used for checkbox filters. */
export function getColumnOptionValue(employee, column) {
  if (column === 'name') {
    return employee.fullName || employee.email || '—';
  }
  return getDisplayValue(employee, column);
}

export function collectColumnFilterOptions(employees, columnId) {
  const values = new Set();
  for (const employee of employees) {
    values.add(getColumnOptionValue(employee, columnId));
  }
  return [...values].sort((left, right) => left.localeCompare(right, undefined, {
    sensitivity: 'base',
    numeric: true,
  }));
}

function normalizeSelectedFilterValues(selected) {
  if (Array.isArray(selected)) {
    return selected.filter((value) => String(value || '').length > 0);
  }
  const text = String(selected || '').trim();
  return text ? [text] : [];
}

function getSortValue(employee, column) {
  switch (column) {
    case 'name':
      return (employee.fullName || employee.email || '').toLowerCase();
    case 'jobRole':
      return (employee.employeeProfile?.jobRole || '').toLowerCase();
    case 'department':
      return (employee.employeeProfile?.department || '').toLowerCase();
    case 'phone':
      return (employee.employeeProfile?.phoneNumber || '').toLowerCase();
    case 'status':
      return getEmployeeStatusLabel(employee).toLowerCase();
    case 'dateOfBirth':
      return employee.employeeProfile?.dateOfBirth || '';
    case 'startDate':
      return employee.employeeProfile?.startDate || '';
    case 'drivingStaff':
      return employee.employeeProfile?.drivingStaff ? '1' : '0';
    case 'computerUser':
      return employee.employeeProfile?.computerUser ? '1' : '0';
    case 'emergencyPhoneCover':
      return employee.employeeProfile?.emergencyPhoneCover ? '1' : '0';
    case 'contract':
      return getEmployeeContractLabel(employee).toLowerCase();
    case 'contractedHours': {
      const hours = Number(employee.employeeProfile?.annualContractedHours) || 0;
      return hours > 0 ? String(hours).padStart(6, '0') : EMPTY_SORT_VALUE;
    }
    default:
      return '';
  }
}

export function getDisplayValue(employee, column) {
  switch (column) {
    case 'jobRole':
      return employee.employeeProfile?.jobRole || '—';
    case 'department':
      return employee.employeeProfile?.department || '—';
    case 'phone':
      return employee.employeeProfile?.phoneNumber || '—';
    case 'status':
      return getEmployeeStatusLabel(employee);
    case 'dateOfBirth':
      return formatEmployeeDate(employee.employeeProfile?.dateOfBirth) || '—';
    case 'startDate':
      return formatEmployeeDate(employee.employeeProfile?.startDate) || '—';
    case 'drivingStaff':
      return yesNoLabel(Boolean(employee.employeeProfile?.drivingStaff));
    case 'computerUser':
      return yesNoLabel(Boolean(employee.employeeProfile?.computerUser));
    case 'emergencyPhoneCover':
      return yesNoLabel(Boolean(employee.employeeProfile?.emergencyPhoneCover));
    case 'contract':
      return getEmployeeContractLabel(employee);
    case 'contractedHours': {
      const hours = Number(employee.employeeProfile?.annualContractedHours) || 0;
      return hours > 0 ? String(hours) : '—';
    }
    default:
      return '—';
  }
}

export function getGroupKey(employee, groupBy) {
  switch (groupBy) {
    case 'department':
      return employee.employeeProfile?.department?.trim() || 'No department';
    case 'jobRole':
      return employee.employeeProfile?.jobRole?.trim() || 'No job title';
    case 'drivingStaff':
      return employee.employeeProfile?.drivingStaff ? 'Driving staff' : 'Non-driving staff';
    case 'status':
      return getEmployeeStatusLabel(employee);
    default:
      return '';
  }
}

export function filterEmployees(employees, { search, columnFilters }) {
  const query = search.trim().toLowerCase();

  return employees.filter((employee) => {
    if (query) {
      const haystack = [
        employee.fullName,
        employee.email,
        employee.employeeProfile?.department,
        employee.employeeProfile?.jobRole,
        employee.employeeProfile?.managerName,
        employee.employeeProfile?.phoneNumber,
        employee.employeeProfile?.dateOfBirth,
        formatEmployeeDate(employee.employeeProfile?.dateOfBirth),
        employee.employeeProfile?.startDate,
        formatEmployeeDate(employee.employeeProfile?.startDate),
        yesNoLabel(Boolean(employee.employeeProfile?.drivingStaff)),
        yesNoLabel(Boolean(employee.employeeProfile?.computerUser)),
        yesNoLabel(Boolean(employee.employeeProfile?.emergencyPhoneCover)),
        getEmployeeContractLabel(employee),
        employee.employeeProfile?.annualContractedHours,
        getEmployeeStatusLabel(employee),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      if (!haystack.includes(query)) return false;
    }

    return Object.entries(columnFilters).every(([column, selected]) => {
      const selectedValues = normalizeSelectedFilterValues(selected);
      if (selectedValues.length === 0) return true;
      return selectedValues.includes(getColumnOptionValue(employee, column));
    });
  });
}

export function sortEmployees(employees, sortColumn, sortDirection) {
  const direction = sortDirection === 'desc' ? -1 : 1;

  return [...employees].sort((left, right) => {
    const leftValue = getSortValue(left, sortColumn) || EMPTY_SORT_VALUE;
    const rightValue = getSortValue(right, sortColumn) || EMPTY_SORT_VALUE;
    const comparison = leftValue.localeCompare(rightValue, undefined, {
      sensitivity: 'base',
      numeric: true,
    });
    if (comparison !== 0) return comparison * direction;
    return (left.fullName || '').localeCompare(right.fullName || '', undefined, { sensitivity: 'base' });
  });
}

export function groupEmployees(employees, groupBy) {
  if (!groupBy) {
    return [{ key: '', label: '', employees }];
  }

  const groups = new Map();

  for (const employee of employees) {
    const key = getGroupKey(employee, groupBy);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(employee);
  }

  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right, undefined, { sensitivity: 'base' }))
    .map(([key, groupEmployeesList]) => ({
      key,
      label: key,
      employees: groupEmployeesList,
    }));
}
