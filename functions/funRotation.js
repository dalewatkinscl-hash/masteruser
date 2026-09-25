'use strict';

/**
 * Fun weekday rotation — Europe/London day keys.
 * Permanent games always appear; a rolling window picks N rotated games each weekday.
 * Settings live in Firestore `fun_settings/rotation` (with hardcoded defaults).
 */

const FUN_GAMES_BASE = [
  { key: 'trivia', label: 'Daily Trivia' },
  { key: 'wordle', label: 'Daily Wordle' },
  { key: 'nonogram', label: 'Daily Nonogram' },
  { key: 'sokoban', label: 'Daily Sokoban' },
  { key: 'boggle', label: 'Daily Boggle' },
  { key: 'connections', label: 'Daily Connections' },
];

const ENCLOSE_LIVE_FROM = '2026-08-04';
const ENCLOSE_GAME = { key: 'enclose', label: 'Daily Enclose' };

const LETTERBOX_LIVE_FROM = '2026-08-05';
const LETTERBOX_GAME = { key: 'letterbox', label: 'Daily Letter Box' };

const PIPES_LIVE_FROM = '2026-08-26';
const PIPES_GAME = { key: 'pipes', label: 'Daily Pipes' };

const TOOLBOX_KICK_LIVE_FROM = '2026-08-26';
const TOOLBOX_KICK_GAME = { key: 'toolboxkick', label: 'Little Dicks Toolbox' };

/** Live on Fun from this London day key. */
const WANTED_LIVE_FROM = '2026-09-08';
const WANTED_GAME = { key: 'wanted', label: 'Daily Wanted' };

/** Soft launch / secret unlock from this day; joins weekday rotation from LIVE_FROM. */
const STACK_WALK_PREVIEW_FROM = '2026-09-18';
/** Joins Fun rotation (normal play) from this Europe/London day. */
const STACK_WALK_LIVE_FROM = '2026-09-19';
const STACK_WALK_GAME = { key: 'stackwalk', label: "O Dell's Amazon Run" };

/** From this day, permanent-game enforcement applies. */
const PERMANENT_FUN_FROM = '2026-08-27';

/** Hardcoded defaults — overridden by Firestore when present. */
const DEFAULT_PERMANENT_GAME_KEYS = ['wordle', 'toolboxkick', 'wanted', 'boggle', 'connections'];
/** How many non-permanent (rotated) games appear each weekday by default. */
const DEFAULT_ROTATED_DAILY_COUNT = 4;

const FUN_GAMES = [
  ...FUN_GAMES_BASE,
  ENCLOSE_GAME,
  LETTERBOX_GAME,
  PIPES_GAME,
  TOOLBOX_KICK_GAME,
  WANTED_GAME,
  STACK_WALK_GAME,
];
const FUN_GAME_ROSTER = FUN_GAMES;
const ALL_ROSTER_KEYS = FUN_GAME_ROSTER.map((g) => g.key);

const ROTATION_START = '2026-08-03';
const ROTATION_START_DAY_KEY = ROTATION_START;

/** @deprecated Prefer rotatedDailyCount + permanent keys. Kept for older callers. */
const DAILY_GAME_COUNT = DEFAULT_PERMANENT_GAME_KEYS.length + DEFAULT_ROTATED_DAILY_COUNT;
const PERMANENT_GAME_KEYS = DEFAULT_PERMANENT_GAME_KEYS;

const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const SETTINGS_DOC = 'fun_settings/rotation';
const SETTINGS_CACHE_MS = 15_000;

let cachedSettings = null;
let cachedSettingsAt = 0;

function getDefaultRotationSettings() {
  return {
    permanentGameKeys: [...DEFAULT_PERMANENT_GAME_KEYS],
    rotatedDailyCount: DEFAULT_ROTATED_DAILY_COUNT,
    source: 'default',
  };
}

function normalizeRotationSettings(raw = {}) {
  const defaults = getDefaultRotationSettings();
  const allowed = new Set(ALL_ROSTER_KEYS);
  let permanentGameKeys = Array.isArray(raw.permanentGameKeys)
    ? raw.permanentGameKeys.map((k) => String(k || '').trim()).filter((k) => allowed.has(k))
    : [...defaults.permanentGameKeys];
  // Unique, preserve order
  permanentGameKeys = [...new Set(permanentGameKeys)];

  // Upgrade pre-stackwalk defaults so Boggle + Connections aren't dunked for days.
  const oldDefault = permanentGameKeys.length === 3
    && permanentGameKeys.includes('wordle')
    && permanentGameKeys.includes('toolboxkick')
    && permanentGameKeys.includes('wanted');
  if (oldDefault) {
    permanentGameKeys = [...defaults.permanentGameKeys];
  }

  let rotatedDailyCount = Number(raw.rotatedDailyCount);
  if (!Number.isFinite(rotatedDailyCount)) {
    rotatedDailyCount = defaults.rotatedDailyCount;
  }
  rotatedDailyCount = Math.max(0, Math.min(ALL_ROSTER_KEYS.length, Math.floor(rotatedDailyCount)));

  return {
    permanentGameKeys,
    rotatedDailyCount,
    source: raw.source || 'firestore',
    updatedAt: raw.updatedAt || null,
    updatedByUid: raw.updatedByUid || null,
    updatedByName: raw.updatedByName || null,
  };
}

function getActiveRotationSettings() {
  return cachedSettings || getDefaultRotationSettings();
}

async function loadFunRotationSettings(db, { force = false } = {}) {
  if (!force && cachedSettings && (Date.now() - cachedSettingsAt) < SETTINGS_CACHE_MS) {
    return cachedSettings;
  }
  try {
    const snap = await db.doc(SETTINGS_DOC).get();
    if (!snap.exists) {
      cachedSettings = getDefaultRotationSettings();
    } else {
      cachedSettings = normalizeRotationSettings({ ...snap.data(), source: 'firestore' });
    }
  } catch (error) {
    console.error('loadFunRotationSettings failed — using defaults', error);
    cachedSettings = getDefaultRotationSettings();
  }
  cachedSettingsAt = Date.now();
  return cachedSettings;
}

async function saveFunRotationSettings(db, patch, { uid = '', fullName = '', FieldValue = null } = {}) {
  const current = await loadFunRotationSettings(db, { force: true });
  const next = normalizeRotationSettings({
    ...current,
    ...patch,
    source: 'firestore',
  });
  const payload = {
    permanentGameKeys: next.permanentGameKeys,
    rotatedDailyCount: next.rotatedDailyCount,
    updatedAt: FieldValue ? FieldValue.serverTimestamp() : new Date(),
    updatedByUid: uid || null,
    updatedByName: fullName || null,
  };
  await db.doc(SETTINGS_DOC).set(payload, { merge: true });
  cachedSettings = normalizeRotationSettings({
    ...payload,
    updatedAt: new Date().toISOString(),
    source: 'firestore',
  });
  cachedSettingsAt = Date.now();
  return cachedSettings;
}

function getRosterForDay(dayKey) {
  const key = String(dayKey || '');
  const roster = [...FUN_GAMES_BASE];
  if (key >= ENCLOSE_LIVE_FROM) roster.push(ENCLOSE_GAME);
  if (key >= LETTERBOX_LIVE_FROM) roster.push(LETTERBOX_GAME);
  if (key >= PIPES_LIVE_FROM) roster.push(PIPES_GAME);
  if (key >= TOOLBOX_KICK_LIVE_FROM) roster.push(TOOLBOX_KICK_GAME);
  if (key >= WANTED_LIVE_FROM) roster.push(WANTED_GAME);
  if (key >= STACK_WALK_LIVE_FROM) roster.push(STACK_WALK_GAME);
  return roster;
}

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

function weekdayIndexUtc(dayKey) {
  const [year, month, day] = String(dayKey || '').split('-').map(Number);
  if (!year || !month || !day) return -1;
  return new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay();
}

function isWeekendDayKey(dayKey) {
  const dow = weekdayIndexUtc(dayKey);
  return dow === 0 || dow === 6;
}

function isWeekdayDayKey(dayKey) {
  return DAY_KEY_RE.test(String(dayKey || '')) && !isWeekendDayKey(dayKey);
}

function weekdayOrdinalFromRotationStart(dayKey) {
  if (!DAY_KEY_RE.test(String(dayKey || '')) || dayKey < ROTATION_START) return -1;
  let cursor = ROTATION_START;
  let ordinal = 0;
  while (cursor < dayKey) {
    if (isWeekdayDayKey(cursor)) ordinal += 1;
    cursor = addDaysToDayKey(cursor, 1);
    if (!cursor) return -1;
  }
  if (!isWeekdayDayKey(dayKey)) return -1;
  return ordinal;
}

function pickDailyGames(rosterKeys, ordinal, dailyCount) {
  const n = rosterKeys.length;
  const count = Math.max(0, Math.min(n, Number(dailyCount) || 0));
  if (n <= count || ordinal < 0) {
    return { games: [...rosterKeys], sitOuts: [] };
  }
  const sitOutCount = n - count;
  // Evenly space sit-outs around the pool (offset by day) so adjacent games
  // aren't dunked together for a whole week.
  const used = new Set();
  const sitOuts = [];
  for (let i = 0; i < sitOutCount; i += 1) {
    let idx = (Math.floor((i * n) / sitOutCount) + ordinal) % n;
    let guard = 0;
    while (used.has(idx) && guard < n) {
      idx = (idx + 1) % n;
      guard += 1;
    }
    used.add(idx);
    sitOuts.push(rosterKeys[idx]);
  }
  const sitOutSet = new Set(sitOuts);
  return {
    games: rosterKeys.filter((g) => !sitOutSet.has(g)),
    sitOuts,
  };
}

/**
 * Permanent games always on (from PERMANENT_FUN_FROM).
 * Rotated pool contributes `rotatedDailyCount` games via rolling sit-outs.
 */
function pickGamesForDay(rosterKeys, ordinal, dayKey, settings = getActiveRotationSettings()) {
  const permanentKeys = (settings.permanentGameKeys || [])
    .filter((k) => rosterKeys.includes(k));
  // Before permanent enforcement date, treat nothing as permanent (all rotate together).
  const usePermanent = dayKey >= PERMANENT_FUN_FROM;
  const permanent = usePermanent ? permanentKeys : [];
  const rotating = rosterKeys.filter((k) => !permanent.includes(k));

  let rotatedCount = Number(settings.rotatedDailyCount);
  if (!Number.isFinite(rotatedCount)) rotatedCount = DEFAULT_ROTATED_DAILY_COUNT;
  // Before permanent date: show permanent+rotated total as one pool size
  if (!usePermanent) {
    rotatedCount = permanentKeys.length + Math.max(0, Math.floor(rotatedCount));
    const picked = pickDailyGames(rosterKeys, ordinal, rotatedCount);
    return picked;
  }

  const picked = pickDailyGames(rotating, ordinal, Math.floor(rotatedCount));
  return {
    games: [...permanent, ...picked.games],
    sitOuts: picked.sitOuts,
  };
}

function nextMondayDayKey(fromDayKey = getLondonDayKey()) {
  let cursor = String(fromDayKey || getLondonDayKey());
  for (let i = 0; i < 8; i += 1) {
    if (weekdayIndexUtc(cursor) === 1) return cursor;
    cursor = addDaysToDayKey(cursor, 1);
  }
  return cursor;
}

function countWordFor(n) {
  if (n === 5) return 'five';
  if (n === 6) return 'six';
  if (n === 7) return 'seven';
  if (n === 8) return 'eight';
  return String(n);
}

function getFunRotationForDay(dayKey = getLondonDayKey(), settings = getActiveRotationSettings()) {
  const key = DAY_KEY_RE.test(String(dayKey || '')) ? dayKey : getLondonDayKey();
  const active = normalizeRotationSettings(settings);

  if (isWeekendDayKey(key)) {
    const monday = nextMondayDayKey(key);
    return {
      dayKey: key,
      closed: true,
      reason: 'weekend',
      message: `Fun games are weekday-only — back Monday ${monday}.`,
      games: [],
      sitOut: null,
      sitOuts: [],
      rotationActive: key >= ROTATION_START,
      labels: [],
      nextOpenDayKey: monday,
      permanentGameKeys: active.permanentGameKeys,
      rotatedDailyCount: active.rotatedDailyCount,
      encloseLive: key >= ENCLOSE_LIVE_FROM,
      enclosePractice: false,
      letterboxLive: key >= LETTERBOX_LIVE_FROM,
      letterboxPractice: false,
      pipesLive: key >= PIPES_LIVE_FROM,
      pipesPractice: false,
      toolboxKickLive: key >= TOOLBOX_KICK_LIVE_FROM,
      wantedLive: key >= WANTED_LIVE_FROM,
      stackWalkLive: key >= STACK_WALK_LIVE_FROM,
    };
  }

  const roster = getRosterForDay(key);
  const rosterKeys = roster.map((g) => g.key);
  const rotationActive = key >= ROTATION_START;
  let sitOuts = [];
  let games = [...rosterKeys];

  if (rotationActive) {
    const ordinal = weekdayOrdinalFromRotationStart(key);
    const picked = pickGamesForDay(rosterKeys, ordinal, key, active);
    games = picked.games;
    sitOuts = picked.sitOuts;
  }

  const sitOut = sitOuts[0] || null;
  const labelMap = Object.fromEntries(FUN_GAMES.map((g) => [g.key, g.label]));
  const sitOutLabels = sitOuts.map((g) => labelMap[g] || g);
  const countWord = countWordFor(games.length);
  return {
    dayKey: key,
    closed: false,
    reason: 'ok',
    message: sitOuts.length
      ? `Today’s ${countWord}: ${games.map((g) => labelMap[g]).join(', ')}. Sitting out: ${sitOutLabels.join(', ')}.`
      : `All ${rosterKeys.length} daily games are on today.`,
    games,
    sitOut,
    sitOuts,
    rotationActive,
    labels: games.map((g) => ({ key: g, label: labelMap[g] })),
    nextOpenDayKey: key,
    permanentGameKeys: active.permanentGameKeys,
    rotatedDailyCount: active.rotatedDailyCount,
    encloseLive: key >= ENCLOSE_LIVE_FROM,
    enclosePractice: key < ENCLOSE_LIVE_FROM && !isWeekendDayKey(key),
    letterboxLive: key >= LETTERBOX_LIVE_FROM,
    letterboxPractice: key < LETTERBOX_LIVE_FROM && !isWeekendDayKey(key),
    pipesLive: key >= PIPES_LIVE_FROM,
    pipesPractice: key < PIPES_LIVE_FROM && !isWeekendDayKey(key),
    toolboxKickLive: key >= TOOLBOX_KICK_LIVE_FROM,
    wantedLive: key >= WANTED_LIVE_FROM,
    stackWalkLive: key >= STACK_WALK_LIVE_FROM,
  };
}

function isGameAvailableOnDay(gameKey, dayKey = getLondonDayKey(), settings = getActiveRotationSettings()) {
  const rotation = getFunRotationForDay(dayKey, settings);
  if (rotation.closed) return false;
  return rotation.games.includes(String(gameKey || ''));
}

function isGameOfferedOnDay(gameKey, dayKey = getLondonDayKey(), settings = getActiveRotationSettings()) {
  return isGameAvailableOnDay(gameKey, dayKey, settings);
}

function previousPlayableDayForGame(dayKey, gameKey) {
  let cursor = addDaysToDayKey(dayKey, -1);
  for (let i = 0; i < 21; i += 1) {
    if (!cursor) return null;
    if (isGameAvailableOnDay(gameKey, cursor)) return cursor;
    cursor = addDaysToDayKey(cursor, -1);
  }
  return null;
}

function previousPlayableDayKey(dayKey, gameKey) {
  return previousPlayableDayForGame(dayKey, gameKey);
}

function assertGamePlayable(dayKey, gameKey, { sandbox = false } = {}) {
  if (sandbox) {
    return { ok: true, bypass: true, rotation: getFunRotationForDay(dayKey) };
  }
  const rotation = getFunRotationForDay(dayKey);
  if (rotation.closed) {
    const err = new Error(rotation.message || 'Fun games are closed on weekends.');
    err.status = 403;
    err.code = 'fun_weekend';
    err.rotation = rotation;
    throw err;
  }
  if (!rotation.games.includes(String(gameKey || ''))) {
    const sitting = (rotation.sitOuts && rotation.sitOuts.length)
      ? rotation.sitOuts.join(', ')
      : rotation.sitOut;
    const err = new Error(
      `${gameKey} isn’t in today’s Fun rotation${sitting ? ` (sitting out: ${sitting})` : ''}.`,
    );
    err.status = 403;
    err.code = 'fun_rotation';
    err.rotation = rotation;
    throw err;
  }
  return { ok: true, bypass: false, rotation };
}

async function assertGamePlayableAsync(db, dayKey, gameKey, opts = {}) {
  await loadFunRotationSettings(db);
  return assertGamePlayable(dayKey, gameKey, opts);
}

function assertFunGamePlayable(gameKey, dayKey, { adminBypass = false } = {}) {
  return assertGamePlayable(dayKey, gameKey, { sandbox: adminBypass });
}

module.exports = {
  FUN_GAMES,
  FUN_GAME_ROSTER,
  FUN_GAMES_BASE,
  ENCLOSE_GAME,
  ENCLOSE_LIVE_FROM,
  LETTERBOX_GAME,
  LETTERBOX_LIVE_FROM,
  PIPES_GAME,
  PIPES_LIVE_FROM,
  TOOLBOX_KICK_GAME,
  TOOLBOX_KICK_LIVE_FROM,
  WANTED_GAME,
  WANTED_LIVE_FROM,
  STACK_WALK_GAME,
  STACK_WALK_LIVE_FROM,
  STACK_WALK_PREVIEW_FROM,
  PERMANENT_FUN_FROM,
  PERMANENT_GAME_KEYS,
  DEFAULT_PERMANENT_GAME_KEYS,
  DEFAULT_ROTATED_DAILY_COUNT,
  ROTATION_START,
  ROTATION_START_DAY_KEY,
  DAILY_GAME_COUNT,
  getRosterForDay,
  getLondonDayKey,
  addDaysToDayKey,
  isWeekendDayKey,
  isWeekdayDayKey,
  nextMondayDayKey,
  getFunRotationForDay,
  isGameAvailableOnDay,
  isGameOfferedOnDay,
  previousPlayableDayForGame,
  previousPlayableDayKey,
  assertGamePlayable,
  assertGamePlayableAsync,
  assertFunGamePlayable,
  weekdayOrdinalFromRotationStart,
  getDefaultRotationSettings,
  normalizeRotationSettings,
  getActiveRotationSettings,
  loadFunRotationSettings,
  saveFunRotationSettings,
};
