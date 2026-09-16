/**
 * Staff bonus accrual — base £1100 + loyalty by completed years,
 * paid half at each configurable July / December payment date.
 */

const DEFAULT_BASE_BONUS = 1100;
/** Full-time contract: 42.5 hours × 52 weeks = 2,210 annual hours. */
const DEFAULT_FULL_TIME_HOURS_PER_WEEK = 42.5;
const DEFAULT_FULL_TIME_WEEKS_PER_YEAR = 52;
const DEFAULT_FULL_TIME_ANNUAL_HOURS = DEFAULT_FULL_TIME_HOURS_PER_WEEK * DEFAULT_FULL_TIME_WEEKS_PER_YEAR;

/** Default schedule: 31 July and 31 December (month is 1–12). */
const DEFAULT_PAYMENT_SCHEDULE = [
  { id: 'july', label: '31 July', month: 7, day: 31 },
  { id: 'december', label: '31 December', month: 12, day: 31 },
];

function toIsoDateOnly(value) {
  if (!value) return '';
  if (typeof value === 'string') {
    const match = value.trim().match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : '';
  }
  if (typeof value.toDate === 'function') {
    return value.toDate().toISOString().slice(0, 10);
  }
  if (value._seconds) {
    return new Date(value._seconds * 1000).toISOString().slice(0, 10);
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function parseIsoDate(iso) {
  const text = toIsoDateOnly(iso);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(`${text}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatIsoFromParts(year, month, day) {
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

function roundGbp(amount) {
  return Math.round((Number(amount) || 0) * 100) / 100;
}

/**
 * Full calendar months completed from startDate to asOfDate.
 * If as-of day-of-month is before start day-of-month, that month is not complete.
 */
function completedMonthsOfService(startDateIso, asOfDateIso) {
  const start = parseIsoDate(startDateIso);
  const asOf = parseIsoDate(asOfDateIso);
  if (!start || !asOf || asOf < start) return 0;

  let months = (asOf.getUTCFullYear() - start.getUTCFullYear()) * 12
    + (asOf.getUTCMonth() - start.getUTCMonth());
  if (asOf.getUTCDate() < start.getUTCDate()) {
    months -= 1;
  }
  return Math.max(0, months);
}

/** Completed whole years of service at asOfDate. */
function completedYearsOfService(startDateIso, asOfDateIso) {
  return Math.floor(completedMonthsOfService(startDateIso, asOfDateIso) / 12);
}

/**
 * Loyalty / time-served add-on from completed whole years (Excel F25 style).
 * =IF(F25<2, 0, IF(F25<=5, (F25-1)*30, IF(F25<=10, 120+(F25-5)*35, IF(F25<=15, 295+(F25-10)*40, 495+(F25-15)*45))))
 */
function loyaltyBonusForYears(completedYears) {
  const years = Math.max(0, Math.floor(Number(completedYears) || 0));
  if (years < 2) return 0;
  if (years <= 5) return (years - 1) * 30;
  if (years <= 10) return 120 + (years - 5) * 35;
  if (years <= 15) return 295 + (years - 10) * 40;
  return 495 + (years - 15) * 45;
}

/**
 * Accrued pot and payment (half pot) at a bonus payment date.
 */
function calculateBonusAtPaymentDate({
  startDate,
  paymentDate,
  baseBonus = DEFAULT_BASE_BONUS,
} = {}) {
  const startIso = toIsoDateOnly(startDate);
  const paymentIso = toIsoDateOnly(paymentDate);
  if (!startIso || !paymentIso) {
    return {
      startDate: startIso,
      paymentDate: paymentIso,
      missingStartDate: !startIso,
      completedMonths: 0,
      completedYears: 0,
      baseBonus: 0,
      loyaltyBonus: 0,
      accruedPot: 0,
      paymentAmount: 0,
      underOneYear: false,
    };
  }

  const months = completedMonthsOfService(startIso, paymentIso);
  const years = Math.floor(months / 12);
  const underOneYear = months < 12;

  const base = underOneYear
    ? (months / 12) * baseBonus
    : baseBonus;
  const loyalty = underOneYear ? 0 : loyaltyBonusForYears(years);
  const accruedPot = roundGbp(base + loyalty);
  const paymentAmount = roundGbp(accruedPot / 2);

  return {
    startDate: startIso,
    paymentDate: paymentIso,
    missingStartDate: false,
    completedMonths: months,
    completedYears: years,
    underOneYear,
    baseBonus: roundGbp(base),
    loyaltyBonus: roundGbp(loyalty),
    accruedPot,
    paymentAmount,
  };
}

function normalizeSchedule(schedule) {
  const list = Array.isArray(schedule) && schedule.length
    ? schedule
    : DEFAULT_PAYMENT_SCHEDULE;
  return list
    .map((item, index) => {
      const month = Number(item.month);
      const day = Number(item.day);
      if (!Number.isFinite(month) || !Number.isFinite(day) || month < 1 || month > 12 || day < 1 || day > 31) {
        return null;
      }
      return {
        id: item.id || `payment_${index}`,
        label: item.label || `${day} / ${month}`,
        month,
        day,
      };
    })
    .filter(Boolean)
    .sort((left, right) => (left.month - right.month) || (left.day - right.day));
}

function paymentDatesForYear(year, schedule = DEFAULT_PAYMENT_SCHEDULE) {
  return normalizeSchedule(schedule).map((item) => ({
    ...item,
    date: formatIsoFromParts(year, item.month, item.day),
  }));
}

/**
 * Next scheduled payment on or after fromDate (defaults today).
 * If fromDate is itself a payment date, returns that date.
 */
function resolveNextPaymentDate(fromDateIso, schedule = DEFAULT_PAYMENT_SCHEDULE) {
  const from = toIsoDateOnly(fromDateIso) || new Date().toISOString().slice(0, 10);
  const fromDate = parseIsoDate(from);
  if (!fromDate) return '';

  const year = fromDate.getUTCFullYear();
  const candidates = [
    ...paymentDatesForYear(year, schedule),
    ...paymentDatesForYear(year + 1, schedule),
  ].map((item) => item.date)
    .filter(Boolean)
    .sort();

  return candidates.find((date) => date >= from) || candidates[0] || '';
}

function listUpcomingPaymentOptions(fromDateIso, schedule = DEFAULT_PAYMENT_SCHEDULE, count = 4) {
  const from = toIsoDateOnly(fromDateIso) || new Date().toISOString().slice(0, 10);
  const fromDate = parseIsoDate(from);
  if (!fromDate) return [];
  const year = fromDate.getUTCFullYear();
  const dates = [
    ...paymentDatesForYear(year - 1, schedule),
    ...paymentDatesForYear(year, schedule),
    ...paymentDatesForYear(year + 1, schedule),
    ...paymentDatesForYear(year + 2, schedule),
  ]
    .filter((item) => item.date)
    .sort((left, right) => String(left.date).localeCompare(String(right.date)));

  const upcoming = dates.filter((item) => item.date >= from);
  return (upcoming.length ? upcoming : dates).slice(0, count);
}

function looksPartTimeContract(contractType) {
  const text = String(contractType || '').toLowerCase();
  return /\bpart[\s-]?time\b|\bpt\b/.test(text);
}

function looksFullTimeContract(contractType) {
  const text = String(contractType || '').toLowerCase();
  return /\bfull[\s-]?time\b|\bft\b/.test(text);
}

/**
 * Resolve pro-rata factor for bonus from annual contracted hours.
 * Full-time denominator = 42.5 × 52 = 2,210 hours.
 * factor = annualContractedHours / 2210 (capped at 1).
 */
function resolveBonusProRata({
  contractType = '',
  annualContractedHours = 0,
  hoursPerWeek = 0,
  fte = 0,
  fullTimeAnnualHours = DEFAULT_FULL_TIME_ANNUAL_HOURS,
  fullTimeHoursPerWeek = DEFAULT_FULL_TIME_HOURS_PER_WEEK,
  fullTimeWeeksPerYear = DEFAULT_FULL_TIME_WEEKS_PER_YEAR,
} = {}) {
  const denominator = Number(fullTimeAnnualHours) > 0
    ? Number(fullTimeAnnualHours)
    : (Number(fullTimeHoursPerWeek) || DEFAULT_FULL_TIME_HOURS_PER_WEEK)
      * (Number(fullTimeWeeksPerYear) || DEFAULT_FULL_TIME_WEEKS_PER_YEAR);
  const partTime = looksPartTimeContract(contractType);
  const annual = Number(annualContractedHours) || 0;
  const weekly = Number(hoursPerWeek) || 0;
  const fteValue = Number(fte) || 0;

  const baseMeta = {
    contractType: String(contractType || ''),
    fullTimeHoursPerWeek: Number(fullTimeHoursPerWeek) || DEFAULT_FULL_TIME_HOURS_PER_WEEK,
    fullTimeWeeksPerYear: Number(fullTimeWeeksPerYear) || DEFAULT_FULL_TIME_WEEKS_PER_YEAR,
    fullTimeAnnualHours: denominator,
    formula: `annualContractedHours / (${DEFAULT_FULL_TIME_HOURS_PER_WEEK} × ${DEFAULT_FULL_TIME_WEEKS_PER_YEAR})`,
  };

  if (annual > 0) {
    const factor = Math.min(1, Math.max(0, annual / denominator));
    return {
      ...baseMeta,
      isPartTime: partTime || factor < 0.999,
      isFullTime: !partTime && factor >= 0.999,
      factor: roundGbp(factor * 10000) / 10000,
      source: 'annual_hours',
      annualContractedHours: annual,
      hoursPerWeek: weekly || null,
      fte: factor,
      missingHours: false,
      calculation: `${annual} ÷ ${denominator} = ${(factor * 100).toFixed(2)}%`,
    };
  }

  // Legacy weekly hours → annualise against the same FT weeks.
  if (weekly > 0) {
    const annualised = weekly * (Number(fullTimeWeeksPerYear) || DEFAULT_FULL_TIME_WEEKS_PER_YEAR);
    const factor = Math.min(1, Math.max(0, annualised / denominator));
    return {
      ...baseMeta,
      isPartTime: partTime || factor < 0.999,
      isFullTime: !partTime && factor >= 0.999,
      factor: roundGbp(factor * 10000) / 10000,
      source: 'weekly_hours',
      annualContractedHours: annualised,
      hoursPerWeek: weekly,
      fte: factor,
      missingHours: false,
      calculation: `${weekly}h/wk × ${baseMeta.fullTimeWeeksPerYear} = ${annualised} ÷ ${denominator} = ${(factor * 100).toFixed(2)}%`,
    };
  }

  if (fteValue > 0) {
    const factor = Math.min(1, Math.max(0, fteValue > 1 ? fteValue / 100 : fteValue));
    return {
      ...baseMeta,
      isPartTime: partTime || factor < 0.999,
      isFullTime: !partTime && factor >= 0.999,
      factor: roundGbp(factor * 10000) / 10000,
      source: 'fte',
      annualContractedHours: roundGbp(factor * denominator),
      hoursPerWeek: weekly || null,
      fte: factor,
      missingHours: false,
      calculation: `FTE ${factor} × ${denominator}`,
    };
  }

  if (partTime) {
    return {
      ...baseMeta,
      isPartTime: true,
      isFullTime: false,
      factor: 1,
      source: 'part_time_missing_hours',
      annualContractedHours: null,
      hoursPerWeek: null,
      fte: null,
      missingHours: true,
      calculation: 'Annual contracted hours not set — using full bonus until hours are entered',
    };
  }

  return {
    ...baseMeta,
    isPartTime: false,
    isFullTime: true,
    factor: 1,
    source: 'full_time',
    annualContractedHours: denominator,
    hoursPerWeek: weekly || DEFAULT_FULL_TIME_HOURS_PER_WEEK,
    fte: 1,
    missingHours: false,
    calculation: `Full-time ${denominator} ÷ ${denominator} = 100%`,
  };
}

/**
 * Apply pro-rata to a calculated bonus payment, then subtract deductions for final pay.
 */
function applyBonusDeductionsAndProRata({
  bonus,
  proRata,
  deductionTotal = 0,
} = {}) {
  const factor = Number(proRata?.factor);
  const safeFactor = Number.isFinite(factor) && factor > 0 ? Math.min(1, factor) : 1;
  const preDeductionPot = roundGbp((Number(bonus?.paymentAmount) || 0) * safeFactor);
  const deductions = Math.max(0, roundGbp(deductionTotal));
  const finalPayment = roundGbp(Math.max(0, preDeductionPot - deductions));
  return {
    proRataFactor: safeFactor,
    preDeductionPot,
    deductionTotal: deductions,
    finalPayment,
  };
}

module.exports = {
  DEFAULT_BASE_BONUS,
  DEFAULT_FULL_TIME_HOURS_PER_WEEK,
  DEFAULT_FULL_TIME_WEEKS_PER_YEAR,
  DEFAULT_FULL_TIME_ANNUAL_HOURS,
  DEFAULT_PAYMENT_SCHEDULE,
  toIsoDateOnly,
  completedMonthsOfService,
  completedYearsOfService,
  loyaltyBonusForYears,
  calculateBonusAtPaymentDate,
  resolveNextPaymentDate,
  listUpcomingPaymentOptions,
  normalizeSchedule,
  resolveBonusProRata,
  applyBonusDeductionsAndProRata,
  looksPartTimeContract,
  roundGbp,
};
