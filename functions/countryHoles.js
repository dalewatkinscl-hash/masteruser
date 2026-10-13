'use strict';

/**
 * Country Holes — daily mini-golf scores (lower strokes wins).
 * Profile tab game; not part of Fun weekday rotation scoring.
 */

const MAX_STROKES = 200;
const MAX_PAR = 90;

function clampStrokes(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(MAX_STROKES, Math.floor(n)));
}

function clampPar(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(MAX_PAR, Math.floor(n)));
}

function clampToPar(value, strokes, par) {
  const s = clampStrokes(strokes);
  const p = clampPar(par);
  const n = Number(value);
  if (Number.isFinite(n)) {
    return Math.max(-MAX_PAR, Math.min(MAX_STROKES, Math.floor(n)));
  }
  return s - p;
}

function serializeCountryHolesGame(data = {}) {
  const strokes = clampStrokes(data.strokes);
  const par = clampPar(data.par);
  return {
    dayKey: data.dayKey || null,
    status: data.status || 'ready',
    strokes,
    par,
    toPar: clampToPar(data.toPar, strokes, par),
    scorecard: Array.isArray(data.scorecard) ? data.scorecard.slice(0, 18) : null,
    completedAt: data.completedAt?.toDate?.()?.toISOString?.() || data.completedAt || null,
  };
}

function compareCountryHolesRows(a, b) {
  if (a.strokes !== b.strokes) return a.strokes - b.strokes;
  if (a.toPar !== b.toPar) return a.toPar - b.toPar;
  const aAt = a.completedAt || '';
  const bAt = b.completedAt || '';
  return String(aAt).localeCompare(String(bAt));
}

function countryHolesResultLabel(row) {
  const strokes = clampStrokes(row?.strokes);
  const toPar = clampToPar(row?.toPar, strokes, row?.par);
  const sign = toPar > 0 ? `+${toPar}` : String(toPar);
  return `${strokes} (${sign})`;
}

module.exports = {
  MAX_STROKES,
  MAX_PAR,
  clampStrokes,
  clampPar,
  clampToPar,
  serializeCountryHolesGame,
  compareCountryHolesRows,
  countryHolesResultLabel,
};
