import { formatDisplayDate, readJsonResponse } from './employeeProfile';

export const APPRAISAL_CYCLE_MONTHS = 12;
export const DUE_SOON_DAYS = 30;

export const APPRAISAL_RATINGS = [
  { id: 'outstanding', label: 'Outstanding' },
  { id: 'good', label: 'Good' },
  { id: 'satisfactory', label: 'Satisfactory' },
  { id: 'needs_improvement', label: 'Needs improvement' },
  { id: 'unsatisfactory', label: 'Unsatisfactory' },
];

const RATING_LABELS = Object.fromEntries(APPRAISAL_RATINGS.map((rating) => [rating.id, rating.label]));

export function appraisalRatingLabel(rating) {
  return RATING_LABELS[rating] || '';
}

export function addAppraisalMonths(isoDate, months = APPRAISAL_CYCLE_MONTHS) {
  const match = String(isoDate || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '';
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const targetMonthIndex = monthIndex + Number(months || 0);
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const normalizedMonth = ((targetMonthIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate();
  const clampedDay = Math.min(day, lastDay);
  return `${targetYear}-${String(normalizedMonth + 1).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`;
}

export function formatAppraisalDate(value) {
  return formatDisplayDate(value);
}

export function appraisalStatusLabel(row) {
  if (!row) return 'No dates';
  if (row.status === 'overdue') {
    return row.awaitingFirst ? 'First appraisal overdue' : 'Overdue';
  }
  if (row.status === 'due_soon') {
    return row.awaitingFirst ? 'First appraisal due' : 'Due soon';
  }
  if (row.status === 'current') {
    return row.awaitingFirst ? 'First appraisal scheduled' : 'Up to date';
  }
  return 'No dates';
}

export function appraisalDueLabel(row) {
  if (!row?.nextDueDate) return '—';
  const days = row.daysUntilDue;
  const date = formatAppraisalDate(row.nextDueDate);
  if (days === null || days === undefined) return date;
  if (days === 0) return `${date} · today`;
  if (days === 1) return `${date} · tomorrow`;
  if (days > 1) return `${date} · ${days} days`;
  const late = Math.abs(days);
  return `${date} · ${late} day${late === 1 ? '' : 's'} overdue`;
}

async function apiJson(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'include',
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
  const payload = (await readJsonResponse(response)) || {};
  if (!response.ok) {
    throw new Error(payload.error || 'Request failed.');
  }
  return payload;
}

export function fetchAppraisals() {
  return apiJson('/api/getAppraisals');
}

export function fetchEmployeeAppraisals(employeeUid) {
  return apiJson(`/api/getEmployeeAppraisals?employeeUid=${encodeURIComponent(employeeUid)}`);
}

export function saveAppraisal(appraisal) {
  return apiJson('/api/saveAppraisal', {
    method: 'POST',
    body: JSON.stringify(appraisal),
  });
}

export function deleteAppraisal(id) {
  return apiJson('/api/deleteAppraisal', {
    method: 'POST',
    body: JSON.stringify({ id }),
  });
}
