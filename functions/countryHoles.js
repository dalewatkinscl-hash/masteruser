'use strict';

/**
 * Country Holes — 9-hole mini golf on the Profile tab (not Fun rotation).
 * Competitive score is total strokes (lower wins), then to-par, then completion time.
 */

const MAX_STROKES = 999;
const MAX_PAR = 999;

function clampStrokes(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(1, Math.min(MAX_STROKES, Math.floor(n)));
}

function clampPar(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(1, Math.min(MAX_PAR, Math.floor(n)));
}

function clampToPar(value, strokes, par) {
  const n = Number(value);
  if (Number.isFinite(n)) return Math.floor(n);
  return clampStrokes(strokes) - clampPar(par);
}

function formatToParSuffix(toPar) {
  const d = Math.floor(Number(toPar) || 0);
  if (d === 0) return 'E';
  if (d > 0) return `+${d}`;
  return `−${Math.abs(d)}`;
}

function countryHolesResultLabel(row) {
  const strokes = clampStrokes(row?.strokes);
  const toPar = Number.isFinite(row?.toPar) ? Math.floor(row.toPar) : 0;
  if (toPar === 0) return `${strokes} (E)`;
  return `${strokes} (${formatToParSuffix(toPar)})`;
}

function serializeCountryHolesGame(data = {}) {
  const status = data.status || 'ready';
  const strokes = status === 'won' ? clampStrokes(data.strokes) : Math.max(0, Math.floor(Number(data.strokes) || 0));
  const par = status === 'won' ? clampPar(data.par) : Math.max(0, Math.floor(Number(data.par) || 0));
  const toPar = status === 'won' ? clampToPar(data.toPar, strokes, par) : Math.floor(Number(data.toPar) || 0);
  const scorecard = Array.isArray(data.scorecard) ? data.scorecard : null;
  return {
    uid: data.uid || null,
    dayKey: data.dayKey || null,
    status,
    strokes,
    par,
    toPar,
    scorecard,
    completedAt: data.completedAt?.toDate?.()?.toISOString?.() || data.completedAt || null,
  };
}

function compareCountryHolesRows(a, b) {
  if (a.strokes !== b.strokes) return a.strokes - b.strokes;
  if (a.toPar !== b.toPar) return a.toPar - b.toPar;
  const aTime = a.completedAt ? new Date(a.completedAt).getTime() : Number.MAX_SAFE_INTEGER;
  const bTime = b.completedAt ? new Date(b.completedAt).getTime() : Number.MAX_SAFE_INTEGER;
  return aTime - bTime;
}

module.exports = {
  MAX_STROKES,
  MAX_PAR,
  clampStrokes,
  clampPar,
  clampToPar,
  formatToParSuffix,
  countryHolesResultLabel,
  serializeCountryHolesGame,
  compareCountryHolesRows,
};
