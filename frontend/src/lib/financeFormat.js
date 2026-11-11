export function formatGbp(value, compact = false) {
  if (!Number.isFinite(value)) return '—';
  if (compact) {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      notation: Math.abs(value) >= 10_000 ? 'compact' : 'standard',
      maximumFractionDigits: Math.abs(value) >= 10_000 ? 1 : 0,
    }).format(value);
  }
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatPct(value, signed = false) {
  if (!Number.isFinite(value)) return '—';
  const pct = value * 100;
  const body = new Intl.NumberFormat('en-GB', {
    maximumFractionDigits: 1,
    signDisplay: signed ? 'exceptZero' : 'auto',
  }).format(pct);
  return `${body}%`;
}

export function formatInt(value) {
  return new Intl.NumberFormat('en-GB').format(Math.round(value));
}

export function formatUkDate(iso) {
  if (iso == null || iso === '') return '';
  const s = String(iso).trim();
  if (!s) return '';
  if (/^\d{8}$/.test(s)) {
    const y = s.slice(0, 4);
    const m = s.slice(4, 6);
    const d = s.slice(6, 8);
    return `${d}/${m}/${y}`;
  }
  if (s.includes('-')) {
    const [y, m, d] = s.split('-');
    if (!y || !m || !d) return s;
    return `${d.slice(0, 2)}/${m}/${y}`;
  }
  return s;
}

export const FILTER_PERIODS = [
  { value: '3m', label: 'Last 3 months' },
  { value: '6m', label: 'Last 6 months' },
  { value: '12m', label: 'Last 12 months' },
  { value: 'ytd', label: 'Year to date' },
  { value: 'custom', label: 'Custom dates' },
];
