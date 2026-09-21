'use strict';

/**
 * O Dell's Amazon Run — walk while balancing a growing stack of parcels.
 * Competitive score is distance in metres (higher wins).
 */

/** Competitive O Dell's Amazon Run soft-launch / secret preview from this day. */
const STACK_WALK_PREVIEW_FROM = '2026-09-18';
/** Joins Fun rotation (normal play) from this Europe/London day. */
const STACK_WALK_LIVE_FROM = '2026-09-19';
/** Cap high enough for long runs; stay within Number.MAX_SAFE_INTEGER. */
const MAX_DISTANCE_M = 1_000_000;

function getLondonDayKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function clampDistance(metres) {
  const n = Number(metres);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(MAX_DISTANCE_M, Math.floor(n)));
}

function formatDistanceLabel(metres) {
  const m = clampDistance(metres);
  if (m < 1000) return `${m.toLocaleString('en-GB')} m`;
  const km = m / 1000;
  if (km >= 10) return `${Math.round(km).toLocaleString('en-GB')} km`;
  return `${km.toFixed(1)} km`;
}

function serializeStackWalkGame(data = {}) {
  return {
    dayKey: data.dayKey || null,
    status: data.status || 'ready',
    distanceM: clampDistance(data.distanceM),
    durationMs: Number.isFinite(data.durationMs) ? Math.max(0, Math.floor(data.durationMs)) : null,
    startedAt: data.startedAt || null,
    completedAt: data.completedAt?.toDate?.()?.toISOString?.() || data.completedAt || null,
  };
}

function compareStackWalkRows(a, b) {
  if (b.distanceM !== a.distanceM) return b.distanceM - a.distanceM;
  const aAt = a.completedAt || '';
  const bAt = b.completedAt || '';
  return String(aAt).localeCompare(String(bAt));
}

function stackWalkResultLabel(row) {
  return formatDistanceLabel(row?.distanceM);
}

module.exports = {
  STACK_WALK_LIVE_FROM,
  STACK_WALK_PREVIEW_FROM,
  MAX_DISTANCE_M,
  getLondonDayKey,
  clampDistance,
  formatDistanceLabel,
  serializeStackWalkGame,
  compareStackWalkRows,
  stackWalkResultLabel,
};
