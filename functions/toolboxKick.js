'use strict';

/**
 * Toolbox Kick — daily competitive helpers (distance leaderboard).
 * Super Rage = one energy drink per London week; everyone refills Monday.
 */

const TOOLBOX_KICK_LIVE_FROM = '2026-08-26';
const MAX_DISTANCE_M = 2_000_000;
const SUPER_RAGE_BOOST_PCT = 40;
const SUPER_RAGE_COLLECTION = 'toolbox_kick_powerups';

function getLondonDayKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function addDaysToDayKey(dayKey, deltaDays) {
  const [year, month, day] = String(dayKey || '').split('-').map(Number);
  if (!year || !month || !day) return '';
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + deltaDays);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Monday (Europe/London week) containing this day key. */
function getLondonWeekStartDayKey(dayKey = getLondonDayKey()) {
  const key = String(dayKey || getLondonDayKey());
  const [year, month, day] = key.split('-').map(Number);
  if (!year || !month || !day) return key;
  const dow = new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay(); // 0=Sun
  const daysFromMonday = dow === 0 ? 6 : dow - 1;
  return addDaysToDayKey(key, -daysFromMonday);
}

function getNextMondayDayKey(dayKey = getLondonDayKey()) {
  const weekStart = getLondonWeekStartDayKey(dayKey);
  return addDaysToDayKey(weekStart, 7);
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
    energyDrinkUsed: Boolean(data.energyDrinkUsed),
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

function serializeToolboxKickAllTimeRecord(row) {
  if (!row || !row.uid) return null;
  return {
    uid: row.uid,
    fullName: row.fullName || 'Colleague',
    distanceM: clampDistance(row.distanceM),
    dayKey: row.dayKey || '',
    mode: normalizeMode(row.mode),
    energyDrinkUsed: Boolean(row.energyDrinkUsed),
    completedAt: row.completedAt || null,
    resultLabel: formatDistanceLabel(row.distanceM),
  };
}

/**
 * From won-game docs, find the overall WR and each player's personal best.
 */
function collectToolboxKickRecords(docs = []) {
  let worldRecord = null;
  const personalBests = new Map();

  docs.forEach((doc) => {
    const data = typeof doc.data === 'function' ? (doc.data() || {}) : (doc || {});
    if ((data.status || '') !== 'won') return;
    const distanceM = clampDistance(data.distanceM);
    const uid = data.uid || doc.id || '';
    if (!uid) return;
    const completedAt = data.completedAt?.toDate?.()?.toISOString?.()
      || data.completedAt
      || null;
    const entry = {
      uid,
      fullName: data.fullName || 'Colleague',
      distanceM,
      dayKey: data.dayKey || '',
      mode: normalizeMode(data.mode),
      energyDrinkUsed: Boolean(data.energyDrinkUsed),
      completedAt,
    };

    if (!worldRecord || compareToolboxKickRows(entry, worldRecord) < 0) {
      worldRecord = entry;
    }
    const prev = personalBests.get(uid);
    if (!prev || compareToolboxKickRows(entry, prev) < 0) {
      personalBests.set(uid, entry);
    }
  });

  return {
    worldRecord: serializeToolboxKickAllTimeRecord(worldRecord),
    personalBests,
  };
}

function clampDistance(value) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return 0;
  return Math.max(-MAX_DISTANCE_M, Math.min(MAX_DISTANCE_M, n));
}

function parseUsedAt(raw) {
  if (!raw) return null;
  if (typeof raw.toDate === 'function') {
    const d = raw.toDate();
    return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
  }
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function resolveUsedWeekKey(docData = {}) {
  if (docData.lastUsedWeekKey && /^\d{4}-\d{2}-\d{2}$/.test(String(docData.lastUsedWeekKey))) {
    return String(docData.lastUsedWeekKey);
  }
  if (docData.lastUsedDayKey && /^\d{4}-\d{2}-\d{2}$/.test(String(docData.lastUsedDayKey))) {
    return getLondonWeekStartDayKey(docData.lastUsedDayKey);
  }
  const last = parseUsedAt(docData.lastUsedAt);
  if (last) return getLondonWeekStartDayKey(getLondonDayKey(last));
  return null;
}

/**
 * One energy drink per London Mon–Sun week. Everyone refills on Monday.
 */
function getSuperRageStatus(docData = {}, dayKey = getLondonDayKey()) {
  const todayKey = /^\d{4}-\d{2}-\d{2}$/.test(String(dayKey)) ? dayKey : getLondonDayKey();
  const weekKey = getLondonWeekStartDayKey(todayKey);
  const refillDayKey = getNextMondayDayKey(todayKey);
  const usedWeekKey = resolveUsedWeekKey(docData);
  const usedThisWeek = Boolean(usedWeekKey && usedWeekKey === weekKey);

  return {
    available: !usedThisWeek,
    usedThisWeek,
    weekKey,
    refillDayKey,
    availableAt: usedThisWeek ? `${refillDayKey}T00:00:00+01:00` : null,
    boostPct: SUPER_RAGE_BOOST_PCT,
    refillLabel: 'Monday',
  };
}

module.exports = {
  TOOLBOX_KICK_LIVE_FROM,
  SUPER_RAGE_BOOST_PCT,
  SUPER_RAGE_COLLECTION,
  getLondonDayKey,
  addDaysToDayKey,
  getLondonWeekStartDayKey,
  getNextMondayDayKey,
  normalizeMode,
  serializeToolboxKickGame,
  compareToolboxKickRows,
  formatDistanceLabel,
  toolboxKickResultLabel,
  serializeToolboxKickAllTimeRecord,
  collectToolboxKickRecords,
  clampDistance,
  getSuperRageStatus,
};
