'use strict';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isIsoDate(value) {
  if (!value || !ISO_DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function toYmdInt(isoDate) {
  return Number(String(isoDate).replace(/-/g, ''));
}

function ymdToIso(ymd) {
  const s = String(ymd || '');
  if (!/^\d{8}$/.test(s)) return null;
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

function startOfMonth(d) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function endOfDayUtc(d) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function formatIso(d) {
  return d.toISOString().slice(0, 10);
}

/** Shift an ISO date by whole calendar years (UTC). */
function shiftIsoYears(isoDate, years) {
  if (!isIsoDate(isoDate)) return null;
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return formatIso(d);
}

/** Month-to-date window ending on `asOfIso` (defaults to today UTC). */
function resolveMtdRange(asOfIso) {
  const asOf = isIsoDate(asOfIso) ? asOfIso : formatIso(endOfDayUtc(new Date()));
  const d = new Date(`${asOf}T00:00:00Z`);
  const from = formatIso(startOfMonth(d));
  return { from, to: asOf };
}

function monthsBack(period) {
  if (period === '3m') return 3;
  if (period === '6m') return 6;
  if (period === 'ytd') {
    const now = new Date();
    return Math.max(1, now.getUTCMonth() + 1);
  }
  return 12;
}

/** Resolve inclusive from/to trip dates from presets or custom inputs. */
function resolveDateRange(filters) {
  const today = endOfDayUtc(new Date());
  const toDefault = formatIso(today);

  if (filters.period === 'custom') {
    let from = isIsoDate(filters.fromDate) ? filters.fromDate : undefined;
    let to = isIsoDate(filters.toDate) ? filters.toDate : undefined;

    if (!from && !to) {
      const start = startOfMonth(today);
      start.setUTCMonth(start.getUTCMonth() - 11);
      return { from: formatIso(start), to: toDefault, period: 'custom' };
    }
    if (!from) from = to;
    if (!to) to = from;
    if (from > to) {
      const swap = from;
      from = to;
      to = swap;
    }
    return { from, to, period: 'custom' };
  }

  const period = ['3m', '6m', '12m', 'ytd'].includes(filters.period) ? filters.period : '12m';
  const n = monthsBack(period);
  const start = startOfMonth(today);
  start.setUTCMonth(start.getUTCMonth() - (n - 1));
  return { from: formatIso(start), to: toDefault, period };
}

module.exports = {
  isIsoDate,
  toYmdInt,
  ymdToIso,
  shiftIsoYears,
  resolveMtdRange,
  resolveDateRange,
};
