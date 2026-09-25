/**
 * Staff bonus accrual — base £1100 + loyalty by completed years,
 * paid half at each configurable July / December payment date.
 */

const DEFAULT_BASE_BONUS = 1100;
/** Driver full-time: 42.5 hours × 52 weeks = 2,210 annual hours. */
const DEFAULT_FULL_TIME_HOURS_PER_WEEK = 42.5;
const DEFAULT_FULL_TIME_WEEKS_PER_YEAR = 52;
const DRIVER_FULL_TIME_ANNUAL_HOURS = DEFAULT_FULL_TIME_HOURS_PER_WEEK * DEFAULT_FULL_TIME_WEEKS_PER_YEAR;
/** Office full-time: 37.5 hours × 52 weeks = 1,950 annual hours. */
const OFFICE_FULL_TIME_HOURS_PER_WEEK = 37.5;
const OFFICE_FULL_TIME_ANNUAL_HOURS = OFFICE_FULL_TIME_HOURS_PER_WEEK * DEFAULT_FULL_TIME_WEEKS_PER_YEAR;
/** Workshop full-time: 40 hours × 52 weeks = 2,080 annual hours. */
const WORKSHOP_FULL_TIME_HOURS_PER_WEEK = 40;
const WORKSHOP_FULL_TIME_ANNUAL_HOURS = WORKSHOP_FULL_TIME_HOURS_PER_WEEK * DEFAULT_FULL_TIME_WEEKS_PER_YEAR;
/** Legacy default denominator (driver FT). Prefer Driver/Office/Workshop bases via proRataBase. */
const DEFAULT_FULL_TIME_ANNUAL_HOURS = DRIVER_FULL_TIME_ANNUAL_HOURS;

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
 * Loyalty / time-served add-on from completed whole years of service:
 * - 1–5 years: £30 per year
 * - 6–10 years: £35 per year
 * - 11–15 years: £40 per year
 * - 16+ years: £45 per year
 */
function loyaltyBonusForYears(completedYears) {
  const years = Math.max(0, Math.floor(Number(completedYears) || 0));
  if (years < 1) return 0;
  if (years <= 5) return years * 30;
  if (years <= 10) return 150 + (years - 5) * 35;
  if (years <= 15) return 325 + (years - 10) * 40;
  return 525 + (years - 15) * 45;
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
  return /\bpart[\s-]?time\b|\bpt\b|\brata\b|\bpro[\s-]?rata\b|\bterm[\s-]?time\b/.test(text);
}

function looksFullTimeContract(contractType) {
  const text = String(contractType || '').toLowerCase();
  return /\bfull[\s-]?time\b|\bft\b/.test(text) && !/\bterm[\s-]?time\b/.test(text);
}

function looksZeroHoursContract(contractType) {
  const text = String(contractType || '').toLowerCase();
  return /\bzero[\s-]?hours?\b|\bnot[\s-]?paid\b/.test(text);
}

function looksFullTimeTermTimeContract(contractType) {
  const text = String(contractType || '').toLowerCase();
  return /\bfull[\s-]?time\b/.test(text) && /\bterm[\s-]?time\b/.test(text);
}

function looksPartTimeTermTimeContract(contractType) {
  const text = String(contractType || '').toLowerCase();
  return /\bpart[\s-]?time\b/.test(text) && /\bterm[\s-]?time\b/.test(text);
}

/** Stored contract / bonus modes. */
const BONUS_HOURS_MODES = {
  FULL_TIME: 'full_time',
  FULL_TIME_TERM_TIME: 'full_time_term_time',
  PART_TIME: 'part_time',
  PART_TIME_TERM_TIME: 'part_time_term_time',
  SALARIED: 'salaried',
  ZERO_HOURS: 'zero_hours',
};

const RATA_BONUS_MODES = new Set([
  BONUS_HOURS_MODES.FULL_TIME_TERM_TIME,
  BONUS_HOURS_MODES.PART_TIME,
  BONUS_HOURS_MODES.PART_TIME_TERM_TIME,
]);

function normalizeBonusHoursMode(value) {
  const text = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (
    text === 'full_time_term_time'
    || text === 'fulltime_term_time'
    || text === 'ft_term_time'
    || text === 'full_time_termtime'
  ) {
    return BONUS_HOURS_MODES.FULL_TIME_TERM_TIME;
  }
  if (
    text === 'part_time_term_time'
    || text === 'parttime_term_time'
    || text === 'pt_term_time'
    || text === 'part_time_termtime'
  ) {
    return BONUS_HOURS_MODES.PART_TIME_TERM_TIME;
  }
  // Legacy "Rata" maps to Part-Time.
  if (text === 'rata' || text === 'pro_rata' || text === 'part_time' || text === 'parttime') {
    return BONUS_HOURS_MODES.PART_TIME;
  }
  if (text === 'full_time' || text === 'fulltime' || text === 'ft') {
    return BONUS_HOURS_MODES.FULL_TIME;
  }
  if (text === 'salaried' || text === 'salary') {
    return BONUS_HOURS_MODES.SALARIED;
  }
  // Legacy "Not paid bonus" maps to Zero Hours.
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
    return BONUS_HOURS_MODES.ZERO_HOURS;
  }
  return '';
}

function isRataBonusMode(mode) {
  return RATA_BONUS_MODES.has(normalizeBonusHoursMode(mode));
}

function isNotPaidBonusMode(mode) {
  return normalizeBonusHoursMode(mode) === BONUS_HOURS_MODES.ZERO_HOURS;
}

function contractTypeLabelForMode(mode) {
  switch (normalizeBonusHoursMode(mode)) {
    case BONUS_HOURS_MODES.FULL_TIME:
      return 'Full-Time';
    case BONUS_HOURS_MODES.FULL_TIME_TERM_TIME:
      return 'Full-Time Term Time';
    case BONUS_HOURS_MODES.PART_TIME:
      return 'Part-Time';
    case BONUS_HOURS_MODES.PART_TIME_TERM_TIME:
      return 'Part-Time Term-Time';
    case BONUS_HOURS_MODES.SALARIED:
      return 'Salaried';
    case BONUS_HOURS_MODES.ZERO_HOURS:
      return 'Zero Hours';
    default:
      return '';
  }
}

/** How the mode settles for bonus pay: full_time | rata | not_paid | ''. */
function bonusSettlementKind(mode) {
  const normalized = normalizeBonusHoursMode(mode);
  if (
    normalized === BONUS_HOURS_MODES.FULL_TIME
    || normalized === BONUS_HOURS_MODES.SALARIED
  ) {
    return 'full_time';
  }
  if (normalized === BONUS_HOURS_MODES.ZERO_HOURS) return 'not_paid';
  if (isRataBonusMode(normalized)) return 'rata';
  return '';
}

function normalizeProRataBase(value) {
  const text = String(value || '').trim().toLowerCase();
  if (text === 'office') return 'office';
  if (text === 'driver') return 'driver';
  if (text === 'workshop') return 'workshop';
  return '';
}

function resolveProRataBaseAnnualHours(proRataBase) {
  const base = normalizeProRataBase(proRataBase);
  if (base === 'office') return OFFICE_FULL_TIME_ANNUAL_HOURS;
  if (base === 'workshop') return WORKSHOP_FULL_TIME_ANNUAL_HOURS;
  return DRIVER_FULL_TIME_ANNUAL_HOURS;
}

function resolveProRataBaseLabel(proRataBase) {
  const base = normalizeProRataBase(proRataBase);
  if (base === 'office') return 'Office';
  if (base === 'workshop') return 'Workshop';
  return 'Driver';
}

function looksSalariedContract(contractType) {
  const text = String(contractType || '').toLowerCase();
  return /\bsalaried\b|\bsalary\b/.test(text);
}

function inferBonusHoursMode({
  bonusHoursMode = '',
  contractType = '',
  annualContractedHours = 0,
} = {}) {
  const explicit = normalizeBonusHoursMode(bonusHoursMode);
  if (explicit) return explicit;
  if (looksZeroHoursContract(contractType)) return BONUS_HOURS_MODES.ZERO_HOURS;
  if (looksSalariedContract(contractType)) return BONUS_HOURS_MODES.SALARIED;
  if (looksFullTimeTermTimeContract(contractType)) return BONUS_HOURS_MODES.FULL_TIME_TERM_TIME;
  if (looksPartTimeTermTimeContract(contractType)) return BONUS_HOURS_MODES.PART_TIME_TERM_TIME;
  if (looksPartTimeContract(contractType)) return BONUS_HOURS_MODES.PART_TIME;
  if (looksFullTimeContract(contractType)) return BONUS_HOURS_MODES.FULL_TIME;
  const annual = Number(annualContractedHours) || 0;
  if (annual > 0 && annual < DRIVER_FULL_TIME_ANNUAL_HOURS * 0.999) {
    return BONUS_HOURS_MODES.PART_TIME;
  }
  return BONUS_HOURS_MODES.FULL_TIME;
}

function inferProRataBase({
  proRataBase = '',
  contractType = '',
  drivingStaff = false,
} = {}) {
  const explicit = normalizeProRataBase(proRataBase);
  if (explicit) return explicit;
  const text = String(contractType || '').toLowerCase();
  if (/\bworkshop\b/.test(text)) return 'workshop';
  if (/\boffice\b/.test(text)) return 'office';
  if (/\bdriver\b/.test(text)) return 'driver';
  return drivingStaff ? 'driver' : 'office';
}

/**
 * Resolve pro-rata factor for bonus from annual contracted hours.
 * Full-Time → 100% (no pro-rata).
 * Full-Time Term Time / Part-Time / Part-Time Term-Time → annual ÷ Driver/Office/Workshop base.
 * Zero Hours → excluded (factor 0).
 */
function resolveBonusProRata({
  bonusHoursMode = '',
  proRataBase = '',
  contractType = '',
  annualContractedHours = 0,
  hoursPerWeek = 0,
  fte = 0,
  drivingStaff = false,
  doesNotPayBonus = false,
  fullTimeAnnualHours = DEFAULT_FULL_TIME_ANNUAL_HOURS,
  fullTimeHoursPerWeek = DEFAULT_FULL_TIME_HOURS_PER_WEEK,
  fullTimeWeeksPerYear = DEFAULT_FULL_TIME_WEEKS_PER_YEAR,
} = {}) {
  const mode = inferBonusHoursMode({ bonusHoursMode, contractType, annualContractedHours });
  const excludeBonus = Boolean(doesNotPayBonus) || isNotPaidBonusMode(mode);
  const kind = excludeBonus ? 'not_paid' : bonusSettlementKind(mode);
  const annual = Number(annualContractedHours) || 0;
  const weekly = Number(hoursPerWeek) || 0;
  const fteValue = Number(fte) || 0;
  const weeks = Number(fullTimeWeeksPerYear) || DEFAULT_FULL_TIME_WEEKS_PER_YEAR;

  const base = kind === 'rata'
    ? inferProRataBase({ proRataBase, contractType, drivingStaff })
    : '';
  const denominator = kind === 'rata'
    ? resolveProRataBaseAnnualHours(base)
    : (Number(fullTimeAnnualHours) > 0
      ? Number(fullTimeAnnualHours)
      : DRIVER_FULL_TIME_ANNUAL_HOURS);
  const baseWeekly = kind === 'rata' && base === 'office'
    ? OFFICE_FULL_TIME_HOURS_PER_WEEK
    : kind === 'rata' && base === 'workshop'
      ? WORKSHOP_FULL_TIME_HOURS_PER_WEEK
      : (Number(fullTimeHoursPerWeek) || DEFAULT_FULL_TIME_HOURS_PER_WEEK);
  const baseLabel = base ? resolveProRataBaseLabel(base) : 'Full-time';
  const modeLabel = contractTypeLabelForMode(mode) || String(contractType || mode || 'Contract');

  const baseMeta = {
    contractType: String(contractType || ''),
    bonusHoursMode: mode,
    proRataBase: base || null,
    proRataBaseLabel: base ? baseLabel : null,
    fullTimeHoursPerWeek: baseWeekly,
    fullTimeWeeksPerYear: weeks,
    fullTimeAnnualHours: denominator,
    formula: kind === 'rata'
      ? `annualContractedHours / ${baseLabel} FT (${denominator})`
      : kind === 'not_paid'
        ? 'zero_hours'
        : 'full_time',
  };

  if (kind === 'not_paid') {
    return {
      ...baseMeta,
      isPartTime: false,
      isFullTime: false,
      notPaidBonus: true,
      doesNotPayBonus: true,
      factor: 0,
      source: excludeBonus && !isNotPaidBonusMode(mode) ? 'does_not_pay_bonus' : 'zero_hours',
      annualContractedHours: annual || null,
      hoursPerWeek: weekly || null,
      fte: 0,
      missingHours: false,
      calculation: excludeBonus && !isNotPaidBonusMode(mode)
        ? `${modeLabel} — marked does not pay bonus`
        : `${modeLabel} — excluded from bonus payment`,
    };
  }

  if (kind === 'full_time') {
    return {
      ...baseMeta,
      isPartTime: false,
      isFullTime: true,
      factor: 1,
      source: 'full_time',
      annualContractedHours: annual || denominator,
      hoursPerWeek: weekly || baseWeekly,
      fte: 1,
      missingHours: false,
      calculation: `${modeLabel} — no pro-rata (100%)`,
    };
  }

  if (annual > 0) {
    const factor = Math.min(1, Math.max(0, annual / denominator));
    return {
      ...baseMeta,
      isPartTime: true,
      isFullTime: false,
      factor: roundGbp(factor * 10000) / 10000,
      source: 'annual_hours',
      annualContractedHours: annual,
      hoursPerWeek: weekly || null,
      fte: factor,
      missingHours: false,
      calculation: `${modeLabel}: ${annual} ÷ ${baseLabel} FT ${denominator} = ${(factor * 100).toFixed(2)}%`,
    };
  }

  // Legacy weekly hours → annualise against the same FT weeks.
  if (weekly > 0) {
    const annualised = weekly * weeks;
    const factor = Math.min(1, Math.max(0, annualised / denominator));
    return {
      ...baseMeta,
      isPartTime: true,
      isFullTime: false,
      factor: roundGbp(factor * 10000) / 10000,
      source: 'weekly_hours',
      annualContractedHours: annualised,
      hoursPerWeek: weekly,
      fte: factor,
      missingHours: false,
      calculation: `${modeLabel}: ${weekly}h/wk × ${weeks} = ${annualised} ÷ ${baseLabel} FT ${denominator} = ${(factor * 100).toFixed(2)}%`,
    };
  }

  if (fteValue > 0) {
    const factor = Math.min(1, Math.max(0, fteValue > 1 ? fteValue / 100 : fteValue));
    return {
      ...baseMeta,
      isPartTime: true,
      isFullTime: false,
      factor: roundGbp(factor * 10000) / 10000,
      source: 'fte',
      annualContractedHours: roundGbp(factor * denominator),
      hoursPerWeek: weekly || null,
      fte: factor,
      missingHours: false,
      calculation: `${modeLabel}: FTE ${factor} × ${baseLabel} FT ${denominator}`,
    };
  }

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
    calculation: `${modeLabel} (${baseLabel}) — add annual contracted hours on the employee profile to pro-rata`,
  };
}

/**
 * Apply pro-rata to the full annual pot (base + loyalty), then half for payment,
 * then subtract deductions (including optional carry-forward from payment 1)
 * and add any manual additions.
 * Payment 1 excess carries to payment 2; payment 2 excess is written off (year reset).
 */
function applyBonusDeductionsAndProRata({
  bonus,
  proRata,
  deductionTotal = 0,
  additionTotal = 0,
  carryForwardIn = 0,
  paymentOfYear = 1,
} = {}) {
  const periodDeductions = Math.max(0, roundGbp(deductionTotal));
  const periodAdditions = Math.max(0, roundGbp(additionTotal));
  const carriedIn = Math.max(0, roundGbp(carryForwardIn));
  const half = Number(paymentOfYear) === 2 ? 2 : 1;
  if (
    proRata?.notPaidBonus
    || proRata?.doesNotPayBonus
    || isNotPaidBonusMode(proRata?.bonusHoursMode)
    || proRata?.bonusHoursMode === 'not_paid'
  ) {
    return {
      proRataFactor: 0,
      baseAfterProRata: 0,
      loyaltyBonus: 0,
      annualEntitlement: 0,
      preDeductionPot: 0,
      periodDeductionTotal: periodDeductions,
      periodAdditionTotal: periodAdditions,
      carryForwardIn: carriedIn,
      deductionTotal: roundGbp(Math.max(0, periodDeductions + carriedIn - periodAdditions)),
      finalPayment: 0,
      carryForwardOut: 0,
      writtenOff: 0,
      paymentOfYear: half,
      notPaidBonus: true,
    };
  }
  const factor = Number(proRata?.factor);
  const safeFactor = Number.isFinite(factor) && factor >= 0
    ? Math.min(1, Math.max(0, factor))
    : 1;
  const baseBonus = Number(bonus?.baseBonus) || 0;
  const loyaltyBonus = Number(bonus?.loyaltyBonus) || 0;
  const accruedPot = Number(bonus?.accruedPot);
  const grossAnnual = Number.isFinite(accruedPot) && accruedPot > 0
    ? accruedPot
    : roundGbp(baseBonus + loyaltyBonus);
  const annualEntitlement = roundGbp(grossAnnual * safeFactor);
  const preDeductionPot = roundGbp(annualEntitlement / 2);
  const netCharge = roundGbp(periodDeductions + carriedIn - periodAdditions);
  const finalPayment = roundGbp(Math.max(0, preDeductionPot - netCharge));
  const excess = roundGbp(Math.max(0, netCharge - preDeductionPot));
  return {
    proRataFactor: safeFactor,
    baseAfterProRata: roundGbp(baseBonus * safeFactor),
    loyaltyBonus: roundGbp(loyaltyBonus),
    annualEntitlement,
    preDeductionPot,
    periodDeductionTotal: periodDeductions,
    periodAdditionTotal: periodAdditions,
    carryForwardIn: carriedIn,
    deductionTotal: roundGbp(Math.max(0, netCharge)),
    finalPayment,
    carryForwardOut: half === 1 ? excess : 0,
    writtenOff: half === 2 ? excess : 0,
    paymentOfYear: half,
    notPaidBonus: false,
  };
}

module.exports = {
  DEFAULT_BASE_BONUS,
  DEFAULT_FULL_TIME_HOURS_PER_WEEK,
  DEFAULT_FULL_TIME_WEEKS_PER_YEAR,
  DEFAULT_FULL_TIME_ANNUAL_HOURS,
  DRIVER_FULL_TIME_ANNUAL_HOURS,
  OFFICE_FULL_TIME_HOURS_PER_WEEK,
  OFFICE_FULL_TIME_ANNUAL_HOURS,
  WORKSHOP_FULL_TIME_HOURS_PER_WEEK,
  WORKSHOP_FULL_TIME_ANNUAL_HOURS,
  BONUS_HOURS_MODES,
  DEFAULT_PAYMENT_SCHEDULE,
  toIsoDateOnly,
  completedMonthsOfService,
  completedYearsOfService,
  loyaltyBonusForYears,
  calculateBonusAtPaymentDate,
  resolveNextPaymentDate,
  listUpcomingPaymentOptions,
  normalizeSchedule,
  normalizeBonusHoursMode,
  normalizeProRataBase,
  resolveProRataBaseAnnualHours,
  resolveProRataBaseLabel,
  resolveBonusProRata,
  applyBonusDeductionsAndProRata,
  isRataBonusMode,
  isNotPaidBonusMode,
  bonusSettlementKind,
  contractTypeLabelForMode,
  looksPartTimeContract,
  roundGbp,
};
