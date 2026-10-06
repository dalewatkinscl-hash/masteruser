import {
  caseIsVisibleToEmployee,
  caseTimeToResolutionDays,
  formatCaseTimeToResolution,
  getCaseProgressStatus,
  stageLabel,
} from './peopleCasesAccess';

export const CASE_TABLE_COLUMNS = [
  { id: 'date', label: 'Date', locked: true },
  { id: 'title', label: 'Title', locked: true },
  { id: 'employee', label: 'Employee' },
  { id: 'owner', label: 'Owner' },
  { id: 'family', label: 'Family' },
  { id: 'progress', label: 'Progress' },
  { id: 'timeToResolution', label: 'Time to resolution' },
  { id: 'sla', label: 'SLA' },
  { id: 'visible', label: 'Visible to employee' },
];

export const CASE_TABLE_COLUMN_IDS = CASE_TABLE_COLUMNS.map((column) => column.id);
export const DEFAULT_VISIBLE_CASE_COLUMN_IDS = CASE_TABLE_COLUMN_IDS.slice();

const COLUMN_PREFS_KEY = 'cl_people_cases_columns';
const COLUMN_WIDTH_PREFS_KEY = 'cl_people_cases_column_widths';
const EMPTY_SORT_VALUE = '\uffff';

/** Trailing UK date suffixes commonly auto-appended to case titles. */
const TRAILING_TITLE_DATE = /\s+-\s+\d{1,2}\/\d{1,2}\/\d{2,4}\s*$/;
const TRAILING_SAMSARA_DATE = /\s+Samsara Coaching\s+\d{1,2}\/\d{1,2}\/\d{2,4}\s*$/i;

export const DEFAULT_CASE_COLUMN_WIDTHS = {
  date: 110,
  title: 280,
  employee: 160,
  owner: 140,
  family: 130,
  progress: 220,
  timeToResolution: 150,
  sla: 110,
  visible: 140,
  actions: 280,
};

export function formatCaseTitleDisplay(title) {
  const text = String(title || '').trim();
  if (!text) return '—';
  return text
    .replace(TRAILING_SAMSARA_DATE, ' Samsara Coaching')
    .replace(TRAILING_TITLE_DATE, '')
    .trim() || '—';
}

export function loadCaseColumnWidths() {
  try {
    const raw = window.localStorage.getItem(COLUMN_WIDTH_PREFS_KEY);
    if (!raw) return { ...DEFAULT_CASE_COLUMN_WIDTHS };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_CASE_COLUMN_WIDTHS };
    const next = { ...DEFAULT_CASE_COLUMN_WIDTHS };
    for (const [id, value] of Object.entries(parsed)) {
      const width = Number(value);
      if (Number.isFinite(width) && width >= 72) next[id] = Math.round(width);
    }
    return next;
  } catch {
    return { ...DEFAULT_CASE_COLUMN_WIDTHS };
  }
}

export function saveCaseColumnWidths(widths) {
  try {
    window.localStorage.setItem(COLUMN_WIDTH_PREFS_KEY, JSON.stringify(widths || {}));
  } catch {
    // ignore storage failures
  }
}

/** Normalize case/event timestamps to YYYY-MM-DD for display/sort. */
export function toCaseDateKey(raw) {
  if (!raw) return '';
  if (typeof raw === 'object') {
    if (typeof raw.toDate === 'function') {
      const d = raw.toDate();
      if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }
    if (raw._seconds != null) {
      const d = new Date(Number(raw._seconds) * 1000);
      if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }
  }
  const text = String(raw).trim();
  if (!text) return '';
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const uk = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (uk) {
    return `${uk[3]}-${uk[2].padStart(2, '0')}-${uk[1].padStart(2, '0')}`;
  }
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
}

export function formatCaseDate(item) {
  const key = caseDateSortKey(item);
  if (!key) return '—';
  const match = key.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  return '—';
}

export function caseDateSortKey(item) {
  return toCaseDateKey(item?.eventDate)
    || toCaseDateKey(item?.openedAt)
    || toCaseDateKey(item?.createdAt)
    || toCaseDateKey(item?.closedAt)
    || '';
}

export function familyLabel(item) {
  return String(item?.processFamily || 'disciplinary').replace(/_/g, ' ');
}

function sanitizeVisibleColumnIds(columnIds) {
  const allowed = new Set(CASE_TABLE_COLUMN_IDS);
  const unique = [];
  for (const id of columnIds || []) {
    if (!allowed.has(id) || unique.includes(id)) continue;
    unique.push(id);
  }
  for (const column of CASE_TABLE_COLUMNS) {
    if (column.locked && !unique.includes(column.id)) {
      unique.unshift(column.id);
    }
  }
  return unique.length ? unique : [...DEFAULT_VISIBLE_CASE_COLUMN_IDS];
}

export function loadVisibleCaseColumns() {
  try {
    const raw = window.localStorage.getItem(COLUMN_PREFS_KEY);
    if (!raw) return [...DEFAULT_VISIBLE_CASE_COLUMN_IDS];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...DEFAULT_VISIBLE_CASE_COLUMN_IDS];
    return sanitizeVisibleColumnIds(parsed);
  } catch {
    return [...DEFAULT_VISIBLE_CASE_COLUMN_IDS];
  }
}

export function saveVisibleCaseColumns(columnIds) {
  try {
    window.localStorage.setItem(
      COLUMN_PREFS_KEY,
      JSON.stringify(sanitizeVisibleColumnIds(columnIds)),
    );
  } catch {
    // ignore storage failures
  }
}

export function getVisibleCaseColumns(visibleColumnIds) {
  const order = new Map(CASE_TABLE_COLUMNS.map((column, index) => [column.id, index]));
  return sanitizeVisibleColumnIds(visibleColumnIds)
    .map((id) => CASE_TABLE_COLUMNS.find((column) => column.id === id))
    .filter(Boolean)
    .sort((left, right) => (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0));
}

export function createEmptyCaseColumnFilters() {
  const filters = {};
  for (const id of CASE_TABLE_COLUMN_IDS) {
    filters[id] = [];
  }
  return filters;
}

export function getCaseColumnOptionValue(item, columnId) {
  switch (columnId) {
    case 'date':
      return formatCaseDate(item);
    case 'title':
      return formatCaseTitleDisplay(item?.title);
    case 'employee':
      return item?.employeeNameSnapshot || '—';
    case 'owner':
      return item?.managerNameSnapshot || '—';
    case 'family':
      return familyLabel(item);
    case 'progress':
      return getCaseProgressStatus(item).label;
    case 'timeToResolution':
      return formatCaseTimeToResolution(item);
    case 'sla':
      return item?.slaDueAt || '—';
    case 'visible':
      return caseIsVisibleToEmployee(item) ? 'Yes' : 'No';
    default:
      return '—';
  }
}

export function collectCaseColumnFilterOptions(cases, columnId) {
  const values = new Set();
  for (const item of cases) {
    values.add(String(getCaseColumnOptionValue(item, columnId) ?? '—'));
  }
  return [...values].sort((left, right) => left.localeCompare(right, undefined, {
    sensitivity: 'base',
    numeric: true,
  }));
}

function getSortValue(item, columnId) {
  switch (columnId) {
    case 'date':
      return caseDateSortKey(item) || EMPTY_SORT_VALUE;
    case 'title':
      return formatCaseTitleDisplay(item?.title).toLowerCase();
    case 'employee':
      return (item?.employeeNameSnapshot || '').toLowerCase();
    case 'owner':
      return (item?.managerNameSnapshot || '').toLowerCase();
    case 'family':
      return familyLabel(item).toLowerCase();
    case 'progress':
      return getCaseProgressStatus(item).label.toLowerCase();
    case 'timeToResolution': {
      const days = caseTimeToResolutionDays(item);
      return days === null ? Number.POSITIVE_INFINITY : days;
    }
    case 'sla':
      return String(item?.slaDueAt || EMPTY_SORT_VALUE);
    case 'visible':
      return caseIsVisibleToEmployee(item) ? 1 : 0;
    default:
      return '';
  }
}

export function filterCasesByColumns(cases, columnFilters) {
  return cases.filter((item) => {
    for (const columnId of CASE_TABLE_COLUMN_IDS) {
      const selected = columnFilters?.[columnId] || [];
      if (!selected.length) continue;
      const value = getCaseColumnOptionValue(item, columnId);
      if (!selected.includes(value)) return false;
    }
    return true;
  });
}

export function sortCases(cases, sortColumn, sortDirection) {
  const direction = sortDirection === 'desc' ? -1 : 1;
  const column = CASE_TABLE_COLUMN_IDS.includes(sortColumn) ? sortColumn : 'date';
  return [...cases].sort((left, right) => {
    if (column === 'date') {
      const a = caseDateSortKey(left) || '0000-00-00';
      const b = caseDateSortKey(right) || '0000-00-00';
      if (a !== b) return a < b ? -1 * direction : 1 * direction;
      return String(right.id || '').localeCompare(String(left.id || ''));
    }
    const a = getSortValue(left, column);
    const b = getSortValue(right, column);
    if (typeof a === 'number' && typeof b === 'number') {
      if (a === b) {
        const da = caseDateSortKey(left) || '0000-00-00';
        const db = caseDateSortKey(right) || '0000-00-00';
        if (da !== db) return db.localeCompare(da);
        return String(right.id || '').localeCompare(String(left.id || ''));
      }
      return (a - b) * direction;
    }
    const cmp = String(a).localeCompare(String(b), undefined, {
      sensitivity: 'base',
      numeric: true,
    });
    if (cmp !== 0) return cmp * direction;
    const da = caseDateSortKey(left) || '0000-00-00';
    const db = caseDateSortKey(right) || '0000-00-00';
    if (da !== db) return db.localeCompare(da);
    return String(right.id || '').localeCompare(String(left.id || ''));
  });
}

export { getCaseProgressStatus, stageLabel, formatCaseTimeToResolution, caseIsVisibleToEmployee };
