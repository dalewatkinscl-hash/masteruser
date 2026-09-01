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
  const distanceM = Math.max(0, Math.floor(Number(data.distanceM) || 0));
  return {
    dayKey: data.dayKey || '',
    status: data.status || 'in_progress',
    mode: normalizeMode(data.mode),
    distanceM,
    attempts: Array.isArray(data.attempts)
      ? data.attempts.map((n) => Math.max(0, Math.floor(Number(n) || 0)))
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

function formatDistanceLabel(metres) {
  const m = Math.max(0, Math.floor(Number(metres) || 0));
  if (m < 1000) return `${m.toLocaleString('en-GB')} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

function toolboxKickResultLabel(row) {
  return formatDistanceLabel(row.distanceM);
}

function clampDistance(value) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(MAX_DISTANCE_M, n);
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
