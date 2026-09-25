/** Employee contract modes used for bonus settlement. */

export const CONTRACT_MODE_OPTIONS = [
  { value: 'full_time', label: 'Full-Time', settlement: 'full_time' },
  { value: 'full_time_term_time', label: 'Full-Time Term Time', settlement: 'rata' },
  { value: 'part_time', label: 'Part-Time', settlement: 'rata' },
  { value: 'part_time_term_time', label: 'Part-Time Term-Time', settlement: 'rata' },
  { value: 'salaried', label: 'Salaried', settlement: 'full_time' },
  { value: 'zero_hours', label: 'Zero Hours', settlement: 'not_paid' },
];

export function normalizeContractMode(value) {
  const text = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (
    text === 'full_time_term_time'
    || text === 'fulltime_term_time'
    || text === 'ft_term_time'
  ) {
    return 'full_time_term_time';
  }
  if (
    text === 'part_time_term_time'
    || text === 'parttime_term_time'
    || text === 'pt_term_time'
  ) {
    return 'part_time_term_time';
  }
  if (text === 'rata' || text === 'pro_rata' || text === 'part_time' || text === 'parttime') {
    return 'part_time';
  }
  if (text === 'full_time' || text === 'fulltime' || text === 'ft') {
    return 'full_time';
  }
  if (text === 'salaried' || text === 'salary') {
    return 'salaried';
  }
  if (
    text === 'zero_hours'
    || text === 'zero_hour'
    || text === 'zh'
    || text === 'not_paid'
    || text === 'not_paid_bonus'
    || text === 'no_bonus'
    || text === 'none'
    || text === 'excluded'
  ) {
    return 'zero_hours';
  }
  return '';
}

/** Infer a stored mode from a free-text contractType label (legacy rows). */
export function inferContractModeFromLabel(contractType) {
  const text = String(contractType || '').trim().toLowerCase();
  if (!text) return '';

  if (/\bzero[\s-]?hours?\b|\bnot[\s-]?paid\b/.test(text)) return 'zero_hours';
  if (/\bsalaried\b|\bsalary\b/.test(text)) return 'salaried';
  if (/\bfull[\s-]?time\b/.test(text) && /\bterm[\s-]?time\b/.test(text)) {
    return 'full_time_term_time';
  }
  if (/\bpart[\s-]?time\b/.test(text) && /\bterm[\s-]?time\b/.test(text)) {
    return 'part_time_term_time';
  }
  if (/\bpart[\s-]?time\b|\brata\b|\bpro[\s-]?rata\b/.test(text)) return 'part_time';
  if (/\bfull[\s-]?time\b|\bft\b/.test(text)) return 'full_time';
  return '';
}

export function contractModeLabel(mode) {
  const normalized = normalizeContractMode(mode);
  const row = CONTRACT_MODE_OPTIONS.find((item) => item.value === normalized);
  return row?.label || '';
}

/** Canonical display label for an employee contract (merges legacy spellings). */
export function resolveContractDisplayLabel({ bonusHoursMode = '', contractType = '' } = {}) {
  const fromMode = contractModeLabel(bonusHoursMode);
  if (fromMode) return fromMode;
  const inferred = inferContractModeFromLabel(contractType);
  const fromType = contractModeLabel(inferred);
  if (fromType) return fromType;
  return String(contractType || '').trim() || '—';
}

export function isRataContractMode(mode) {
  const normalized = normalizeContractMode(mode);
  return CONTRACT_MODE_OPTIONS.some(
    (item) => item.value === normalized && item.settlement === 'rata',
  );
}

export function isZeroHoursContractMode(mode) {
  return normalizeContractMode(mode) === 'zero_hours';
}

export function contractTypeLabelForMode(mode) {
  return contractModeLabel(mode);
}

export function resolveProRataBaseLabel(base) {
  if (base === 'office') return 'Office';
  if (base === 'workshop') return 'Workshop';
  if (base === 'driver') return 'Driver';
  return '';
}
