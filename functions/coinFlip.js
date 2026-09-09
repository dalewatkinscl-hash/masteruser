'use strict';

/**
 * Coin Flip Streak — daily competitive helpers (best streak leaderboard).
 * Competitive: 3 runs per London day (one miss ends a run).
 */

const COIN_FLIP_LIVE_FROM = '2026-09-07';
const MAX_STREAK = 10_000;
const MAX_RUNS = 3;

function getLondonDayKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function clampStreak(value) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(MAX_STREAK, n));
}

function clampRunsUsed(value) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(MAX_RUNS, n));
}

function serializeCoinFlipGame(data = {}) {
  const runsUsed = clampRunsUsed(data.runsUsed);
  const bestStreak = clampStreak(data.bestStreak);
  const dayComplete = runsUsed >= MAX_RUNS || data.status === 'complete';
  return {
    dayKey: data.dayKey || '',
    status: dayComplete ? 'complete' : (bestStreak >= 1 ? 'won' : (data.status || 'in_progress')),
    bestStreak,
    runsUsed,
    maxRuns: MAX_RUNS,
    dayComplete,
    completedAt: data.completedAt?.toDate?.()?.toISOString?.() || data.completedAt || null,
  };
}

function compareCoinFlipRows(a, b) {
  if (b.bestStreak !== a.bestStreak) return b.bestStreak - a.bestStreak;
  const aAt = a.completedAt || '';
  const bAt = b.completedAt || '';
  return String(aAt).localeCompare(String(bAt));
}

function coinFlipResultLabel(row) {
  const n = clampStreak(row?.bestStreak);
  return `streak ${n}`;
}

module.exports = {
  COIN_FLIP_LIVE_FROM,
  MAX_STREAK,
  MAX_RUNS,
  getLondonDayKey,
  clampStreak,
  clampRunsUsed,
  serializeCoinFlipGame,
  compareCoinFlipRows,
  coinFlipResultLabel,
};
