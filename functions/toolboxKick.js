'use strict';

/**
 * Toolbox Kick — daily competitive helpers (distance leaderboard).
 */

const TOOLBOX_KICK_LIVE_FROM = '2026-08-26';
const MAX_DISTANCE_M = 2_000_000;

function getLondonDayKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function normalizeMode(mode) {
  return mode === 'allOrNothing' ? 'allOrNothing' : 'careful';
}

function serializeToolboxKickGame(data = {}) {
  return {
    dayKey: data.dayKey || '',
    status: data.status || 'in_progress',
    mode: normalizeMode(data.mode),
    distanceM: clampDistance(data.distanceM),
    attempts: Array.isArray(data.attempts)
      ? data.attempts.map((n) => clampDistance(n))
      : [],
    completedAt: data.completedAt?.toDate?.()?.toISOString?.() || data.completedAt || null,
  };
}

function compareToolboxKickRows(a, b) {
  if (b.distanceM !== a.distanceM) return b.distanceM - a.distanceM;
  const aAt = a.completedAt || '';
  const bAt = b.completedAt || '';
  return String(aAt).localeCompare(String(bAt));
}

/** Negative distances are valid — Little Dick can boot the toolbox back past the start. */
function formatDistanceLabel(metres) {
  const raw = clampDistance(metres);
  const m = Math.abs(raw);
  const sign = raw < 0 ? '−' : '';
  if (m < 1000) return `${sign}${m.toLocaleString('en-GB')} m`;
  return `${sign}${(m / 1000).toFixed(1)} km`;
}

function toolboxKickResultLabel(row) {
  return formatDistanceLabel(row.distanceM);
}

function clampDistance(value) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return 0;
  return Math.max(-MAX_DISTANCE_M, Math.min(MAX_DISTANCE_M, n));
}

module.exports = {
  TOOLBOX_KICK_LIVE_FROM,
  getLondonDayKey,
  normalizeMode,
  serializeToolboxKickGame,
  compareToolboxKickRows,
  formatDistanceLabel,
  toolboxKickResultLabel,
  clampDistance,
};
