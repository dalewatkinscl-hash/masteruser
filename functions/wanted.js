'use strict';

/**
 * Daily Wanted — emoji spotter helpers.
 * Flow: Standard then Impossible; score = combined corrected time.
 */

const WANTED_LIVE_FROM = '2026-09-08';
const PENALTY_MS = 3000;
const MAX_TIME_MS = 30 * 60 * 1000;
const MAX_PENALTIES = 200;
const CHALLENGES = ['standard', 'impossible'];

function getLondonDayKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function clampTimeMs(value) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return MAX_TIME_MS;
  return Math.max(0, Math.min(MAX_TIME_MS, n));
}

function clampPenalties(value) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(MAX_PENALTIES, n));
}

function normalizeChallenge(value) {
  const key = String(value || '').trim().toLowerCase();
  return CHALLENGES.includes(key) ? key : 'standard';
}

function gradeForTimeMs(timeMs) {
  const s = clampTimeMs(timeMs) / 1000;
  if (s <= 3) return 'S';
  if (s <= 5) return 'A';
  if (s <= 8) return 'B';
  if (s <= 12) return 'C';
  if (s <= 20) return 'D';
  return 'F';
}

function gradeForCombinedTimeMs(timeMs) {
  const s = clampTimeMs(timeMs) / 1000;
  if (s <= 6) return 'S';
  if (s <= 10) return 'A';
  if (s <= 16) return 'B';
  if (s <= 24) return 'C';
  if (s <= 40) return 'D';
  return 'F';
}

function formatWantedTime(timeMs) {
  const ms = clampTimeMs(timeMs);
  const whole = Math.floor(ms / 1000);
  const tenths = Math.floor((ms % 1000) / 100);
  return `${whole}.${tenths}s`;
}

function serializeChallengeBest(data = null) {
  if (!data || data.timeMs == null) return null;
  const timeMs = clampTimeMs(data.timeMs);
  const penalties = clampPenalties(data.penalties);
  return {
    timeMs,
    penalties,
    elapsedMs: clampTimeMs(data.elapsedMs != null ? data.elapsedMs : timeMs - penalties * PENALTY_MS),
    grade: data.grade || gradeForTimeMs(timeMs),
    completedAt: data.completedAt?.toDate?.()?.toISOString?.() || data.completedAt || null,
  };
}

function serializeWantedGame(data = {}) {
  const standard = serializeChallengeBest(data.standard);
  const impossible = serializeChallengeBest(data.impossible);
  const bothDone = Boolean(standard && impossible);
  const combinedTimeMs = bothDone
    ? clampTimeMs(standard.timeMs + impossible.timeMs)
    : null;
  const combinedPenalties = bothDone
    ? clampPenalties((standard.penalties || 0) + (impossible.penalties || 0))
    : null;
  return {
    dayKey: data.dayKey || '',
    status: bothDone ? 'won' : (standard || impossible ? 'in_progress' : (data.status || 'in_progress')),
    standard,
    impossible,
    bothComplete: bothDone,
    combinedTimeMs,
    combinedPenalties,
    combinedGrade: combinedTimeMs != null ? gradeForCombinedTimeMs(combinedTimeMs) : null,
    nextChallenge: bothDone ? null : (standard ? 'impossible' : 'standard'),
    completedAt: data.completedAt?.toDate?.()?.toISOString?.() || data.completedAt || null,
  };
}

function compareWantedRows(a, b) {
  const aMs = Number.isFinite(a.timeMs) ? a.timeMs : Number.MAX_SAFE_INTEGER;
  const bMs = Number.isFinite(b.timeMs) ? b.timeMs : Number.MAX_SAFE_INTEGER;
  if (aMs !== bMs) return aMs - bMs;
  const aPen = clampPenalties(a.penalties);
  const bPen = clampPenalties(b.penalties);
  if (aPen !== bPen) return aPen - bPen;
  return String(a.completedAt || '').localeCompare(String(b.completedAt || ''));
}

function wantedResultLabel(row) {
  if (!Number.isFinite(row?.timeMs)) return '—';
  const grade = row.grade || gradeForCombinedTimeMs(row.timeMs);
  return `${grade} · ${formatWantedTime(row.timeMs)}`;
}

function isBetterWantedTime(nextMs, prevMs) {
  if (!Number.isFinite(nextMs)) return false;
  if (!Number.isFinite(prevMs)) return true;
  return nextMs < prevMs;
}

module.exports = {
  WANTED_LIVE_FROM,
  PENALTY_MS,
  MAX_TIME_MS,
  CHALLENGES,
  getLondonDayKey,
  clampTimeMs,
  clampPenalties,
  normalizeChallenge,
  gradeForTimeMs,
  gradeForCombinedTimeMs,
  formatWantedTime,
  serializeChallengeBest,
  serializeWantedGame,
  compareWantedRows,
  wantedResultLabel,
  isBetterWantedTime,
};
