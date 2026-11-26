'use strict';

/**
 * Coach Park — daily 2D top-down coach parking simulator scoring helpers.
 * Lowest total time wins (elapsedMs + 5s per bump).
 */

const BUMP_PENALTY_MS = 5000;
const MAX_BUMPS = 5;
const MAX_DAILY_TRIES = 3;
const MIN_DURATION_MS = 1500;
const MAX_DURATION_MS = 1800000;

function clampDurationMs(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(MAX_DURATION_MS, Math.floor(n)));
}

function clampBumps(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(MAX_BUMPS, Math.floor(n)));
}

function clampAttempts(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.max(1, Math.min(999, Math.floor(n)));
}

function clampTriesUsed(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(MAX_DAILY_TRIES, Math.floor(n)));
}

function computeScoreMs(durationMs, bumps = 0) {
  return clampDurationMs(durationMs) + clampBumps(bumps) * BUMP_PENALTY_MS;
}

function normalizeAttemptHistory(raw) {
  if (!Array.isArray(raw)) return [];
  const maxScoreCap = MAX_DURATION_MS + MAX_BUMPS * BUMP_PENALTY_MS;
  return raw
    .filter((item) => item && typeof item === 'object')
    .slice(0, MAX_DAILY_TRIES)
    .map((item, idx) => {
      const outcome = item.outcome === 'wrecked'
        ? 'wrecked'
        : (item.outcome === 'abandoned' ? 'abandoned' : 'parked');
      const durationMs = clampDurationMs(item.durationMs);
      const bumps = clampBumps(item.bumps);
      const rawScore = Number(item.scoreMs);
      const scoreMs = outcome === 'parked'
        ? (Number.isFinite(rawScore) && rawScore > 0
          ? Math.max(durationMs, Math.min(maxScoreCap, Math.floor(rawScore)))
          : computeScoreMs(durationMs, bumps))
        : 0;
      const rawTryNo = Number(item.tryNumber);
      const tryNumber = Number.isFinite(rawTryNo)
        ? Math.max(1, Math.min(MAX_DAILY_TRIES, Math.floor(rawTryNo)))
        : Math.min(MAX_DAILY_TRIES, idx + 1);
      return {
        tryNumber,
        outcome,
        durationMs,
        bumps,
        scoreMs,
      };
    });
}

function formatCoachParkMs(ms) {
  const n = Math.max(0, Math.floor(Number(ms) || 0));
  const totalSec = n / 1000;
  if (totalSec < 60) return `${totalSec.toFixed(1)}s`;
  const min = Math.floor(totalSec / 60);
  const sec = (totalSec % 60).toFixed(1).padStart(4, '0');
  return `${min}:${sec}`;
}

function serializeCoachParkGame(data = {}) {
  const durationMs = clampDurationMs(data.durationMs);
  const bumps = clampBumps(data.bumps);
  const rawScore = Number(data.scoreMs);
  const scoreMs = Number.isFinite(rawScore) && rawScore > 0
    ? Math.max(durationMs, Math.min(MAX_DURATION_MS + MAX_BUMPS * BUMP_PENALTY_MS, Math.floor(rawScore)))
    : computeScoreMs(durationMs, bumps);
  const hasExplicitTries = data.triesUsed !== undefined
    && data.triesUsed !== null
    && data.triesUsed !== ''
    && Number.isFinite(Number(data.triesUsed));
  const triesUsed = hasExplicitTries
    ? clampTriesUsed(data.triesUsed)
    : ((data.status === 'won' || data.status === 'lost')
      ? Math.min(MAX_DAILY_TRIES, Math.max(1, clampAttempts(data.attempts)))
      : 0);
  const triesRemaining = Math.max(0, MAX_DAILY_TRIES - triesUsed);
  const attemptHistory = normalizeAttemptHistory(data.attemptHistory);
  const roundComplete = Boolean(data.roundComplete) || triesUsed >= MAX_DAILY_TRIES;
  return {
    dayKey: data.dayKey || null,
    status: data.status || 'ready',
    durationMs,
    bumps,
    scoreMs,
    attempts: Math.max(triesUsed, Number(data.attempts) > 0 ? clampAttempts(data.attempts) : 0),
    maxTries: MAX_DAILY_TRIES,
    triesUsed,
    triesRemaining,
    roundComplete,
    attemptHistory,
    completedAt: data.completedAt?.toDate?.()?.toISOString?.() || data.completedAt || null,
  };
}

function compareCoachParkRows(a, b) {
  if (a.scoreMs !== b.scoreMs) return a.scoreMs - b.scoreMs;
  if (a.bumps !== b.bumps) return a.bumps - b.bumps;
  if (a.durationMs !== b.durationMs) return a.durationMs - b.durationMs;
  const aAt = a.completedAt || '';
  const bAt = b.completedAt || '';
  return String(aAt).localeCompare(String(bAt));
}

function coachParkResultLabel(row) {
  if (row?.status === 'lost') return '💩 Did not park';
  const bumps = clampBumps(row?.bumps);
  const durationMs = clampDurationMs(row?.durationMs);
  const scoreMs = Number.isFinite(Number(row?.scoreMs)) && Number(row.scoreMs) > 0
    ? Math.floor(Number(row.scoreMs))
    : computeScoreMs(durationMs, bumps);
  if (bumps === 0) return `${formatCoachParkMs(scoreMs)} · Clean`;
  return `${formatCoachParkMs(scoreMs)} (${bumps} ${bumps === 1 ? 'bump' : 'bumps'})`;
}

module.exports = {
  BUMP_PENALTY_MS,
  MAX_BUMPS,
  MAX_DAILY_TRIES,
  MIN_DURATION_MS,
  MAX_DURATION_MS,
  clampDurationMs,
  clampBumps,
  clampAttempts,
  clampTriesUsed,
  computeScoreMs,
  normalizeAttemptHistory,
  formatCoachParkMs,
  serializeCoachParkGame,
  compareCoachParkRows,
  coachParkResultLabel,
};
