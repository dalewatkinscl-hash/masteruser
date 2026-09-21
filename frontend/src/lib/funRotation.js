/**
 * Fun weekday rotation — mirrors functions/funRotation.js (Europe/London day keys).
 * Hardcoded defaults; live settings come from /api/getFunRotation.
 */

export const FUN_GAMES_BASE = [
  { key: 'trivia', label: 'Daily Trivia' },
  { key: 'wordle', label: 'Daily Wordle' },
  { key: 'nonogram', label: 'Daily Nonogram' },
  { key: 'sokoban', label: 'Daily Sokoban' },
  { key: 'boggle', label: 'Daily Boggle' },
  { key: 'connections', label: 'Daily Connections' },
];

export const ENCLOSE_LIVE_FROM = '2026-08-04';
export const ENCLOSE_GAME = { key: 'enclose', label: 'Daily Enclose' };

export const LETTERBOX_LIVE_FROM = '2026-08-05';
export const LETTERBOX_GAME = { key: 'letterbox', label: 'Daily Letter Box' };

export const PIPES_LIVE_FROM = '2026-08-26';
export const PIPES_GAME = { key: 'pipes', label: 'Daily Pipes' };

export const TOOLBOX_KICK_LIVE_FROM = '2026-08-26';
export const TOOLBOX_KICK_GAME = { key: 'toolboxkick', label: 'Little Dicks Toolbox' };

/** Live on Fun from this London day key. */
export const WANTED_LIVE_FROM = '2026-09-08';
export const WANTED_GAME = { key: 'wanted', label: 'Daily Wanted' };

/** Soft launch / O×5 secret unlock from this day. */
export const STACK_WALK_PREVIEW_FROM = '2026-09-18';
/** Joins Fun rotation (normal play) from this Europe/London day. */
export const STACK_WALK_LIVE_FROM = '2026-09-19';
export const STACK_WALK_GAME = { key: 'stackwalk', label: "O Dell's Amazon Run" };

export const PERMANENT_FUN_FROM = '2026-08-27';

export const DEFAULT_PERMANENT_GAME_KEYS = ['wordle', 'toolboxkick', 'wanted'];
export const DEFAULT_ROTATED_DAILY_COUNT = 4;

/** @deprecated Prefer DEFAULT_PERMANENT_GAME_KEYS. */
export const PERMANENT_GAME_KEYS = DEFAULT_PERMANENT_GAME_KEYS;

export const FUN_GAME_ROSTER = [
  ...FUN_GAMES_BASE,
  ENCLOSE_GAME,
  LETTERBOX_GAME,
  PIPES_GAME,
  TOOLBOX_KICK_GAME,
  WANTED_GAME,
  STACK_WALK_GAME,
];

export const ROTATION_START_DAY_KEY = '2026-08-03';
export const ROTATION_START = ROTATION_START_DAY_KEY;

/** @deprecated Prefer rotatedDailyCount + permanent keys. */
export const DAILY_GAME_COUNT = DEFAULT_PERMANENT_GAME_KEYS.length + DEFAULT_ROTATED_DAILY_COUNT;

const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const ALL_ROSTER_KEYS = FUN_GAME_ROSTER.map((g) => g.key);

export function getDefaultRotationSettings() {
  return {
    permanentGameKeys: [...DEFAULT_PERMANENT_GAME_KEYS],
    rotatedDailyCount: DEFAULT_ROTATED_DAILY_COUNT,
    source: 'default',
  };
}

export function normalizeRotationSettings(raw = {}) {
  const defaults = getDefaultRotationSettings();
  const allowed = new Set(ALL_ROSTER_KEYS);
  let permanentGameKeys = Array.isArray(raw.permanentGameKeys)
    ? raw.permanentGameKeys.map((k) => String(k || '').trim()).filter((k) => allowed.has(k))
    : [...defaults.permanentGameKeys];
  permanentGameKeys = [...new Set(permanentGameKeys)];

  let rotatedDailyCount = Number(raw.rotatedDailyCount);
  if (!Number.isFinite(rotatedDailyCount)) {
    rotatedDailyCount = defaults.rotatedDailyCount;
  }
  rotatedDailyCount = Math.max(0, Math.min(ALL_ROSTER_KEYS.length, Math.floor(rotatedDailyCount)));

  return {
    permanentGameKeys,
    rotatedDailyCount,
    source: raw.source || 'client',
    updatedAt: raw.updatedAt || null,
    updatedByUid: raw.updatedByUid || null,
    updatedByName: raw.updatedByName || null,
  };
}

export function getRosterForDay(dayKey) {
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

export function isEncloseLive(dayKey) {
  return String(dayKey || '') >= ENCLOSE_LIVE_FROM;
}

export function isEnclosePracticeDay(dayKey) {
  return DAY_KEY_RE.test(String(dayKey || '')) && !isWeekendDayKey(dayKey) && !isEncloseLive(dayKey);
}

export function isLetterboxLive(dayKey) {
  return String(dayKey || '') >= LETTERBOX_LIVE_FROM;
}

export function isLetterboxPracticeDay(dayKey) {
  return DAY_KEY_RE.test(String(dayKey || '')) && !isWeekendDayKey(dayKey) && !isLetterboxLive(dayKey);
}

export function isPipesLive(dayKey) {
  return String(dayKey || '') >= PIPES_LIVE_FROM;
}

export function isPipesPracticeDay(dayKey) {
  return DAY_KEY_RE.test(String(dayKey || '')) && !isWeekendDayKey(dayKey) && !isPipesLive(dayKey);
}

export function isToolboxKickLive(dayKey) {
  return String(dayKey || '') >= TOOLBOX_KICK_LIVE_FROM;
}

export function isWantedLive(dayKey) {
  return String(dayKey || '') >= WANTED_LIVE_FROM;
}

export function isStackWalkLive(dayKey) {
  return String(dayKey || '') >= STACK_WALK_LIVE_FROM;
}

export function isStackWalkPreviewDay(dayKey) {
  const key = String(dayKey || '');
  return key >= STACK_WALK_PREVIEW_FROM && key < STACK_WALK_LIVE_FROM;
}

export function addDaysToDayKey(dayKey, deltaDays) {
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

export function isWeekendDayKey(dayKey) {
  const dow = weekdayIndexUtc(dayKey);
  return dow === 0 || dow === 6;
}

export function isWeekdayDayKey(dayKey) {
  return DAY_KEY_RE.test(String(dayKey || '')) && !isWeekendDayKey(dayKey);
}

function weekdayOrdinalFromRotationStart(dayKey) {
  if (!DAY_KEY_RE.test(String(dayKey || '')) || dayKey < ROTATION_START_DAY_KEY) return -1;
  let cursor = ROTATION_START_DAY_KEY;
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
  const sitOuts = [];
  for (let i = 0; i < sitOutCount; i += 1) {
    sitOuts.push(rosterKeys[(ordinal + i) % n]);
  }
  const sitOutSet = new Set(sitOuts);
  return {
    games: rosterKeys.filter((g) => !sitOutSet.has(g)),
    sitOuts,
  };
}

function pickGamesForDay(rosterKeys, ordinal, dayKey, settings) {
  const permanentKeys = (settings.permanentGameKeys || [])
    .filter((k) => rosterKeys.includes(k));
  const usePermanent = dayKey >= PERMANENT_FUN_FROM;
  const permanent = usePermanent ? permanentKeys : [];
  const rotating = rosterKeys.filter((k) => !permanent.includes(k));

  let rotatedCount = Number(settings.rotatedDailyCount);
  if (!Number.isFinite(rotatedCount)) rotatedCount = DEFAULT_ROTATED_DAILY_COUNT;

  if (!usePermanent) {
    rotatedCount = permanentKeys.length + Math.max(0, Math.floor(rotatedCount));
    return pickDailyGames(rosterKeys, ordinal, rotatedCount);
  }

  const picked = pickDailyGames(rotating, ordinal, Math.floor(rotatedCount));
  return {
    games: [...permanent, ...picked.games],
    sitOuts: picked.sitOuts,
  };
}

export function nextMondayDayKey(fromDayKey) {
  let cursor = String(fromDayKey || '');
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

export function getFunRotationForDay(dayKey, settingsInput = null) {
  const key = DAY_KEY_RE.test(String(dayKey || '')) ? dayKey : '';
  const settings = normalizeRotationSettings(settingsInput || getDefaultRotationSettings());

  if (!key || isWeekendDayKey(key)) {
    const monday = nextMondayDayKey(key || '2026-08-03');
    return {
      dayKey: key,
      closed: true,
      reason: 'weekend',
      message: `Fun games are weekday-only — back Monday ${monday}.`,
      games: [],
      sitOut: null,
      sitOuts: [],
      rotationActive: Boolean(key && key >= ROTATION_START_DAY_KEY),
      labels: [],
      nextOpenDayKey: monday,
      permanentGameKeys: settings.permanentGameKeys,
      rotatedDailyCount: settings.rotatedDailyCount,
      encloseLive: Boolean(key && key >= ENCLOSE_LIVE_FROM),
      enclosePractice: false,
      letterboxLive: Boolean(key && key >= LETTERBOX_LIVE_FROM),
      letterboxPractice: false,
      pipesLive: Boolean(key && key >= PIPES_LIVE_FROM),
      pipesPractice: false,
      toolboxKickLive: Boolean(key && key >= TOOLBOX_KICK_LIVE_FROM),
      wantedLive: Boolean(key && key >= WANTED_LIVE_FROM),
      stackWalkLive: Boolean(key && key >= STACK_WALK_LIVE_FROM),
    };
  }

  const roster = getRosterForDay(key);
  const rosterKeys = roster.map((g) => g.key);
  const rotationActive = key >= ROTATION_START_DAY_KEY;
  let sitOuts = [];
  let games = [...rosterKeys];

  if (rotationActive) {
    const ordinal = weekdayOrdinalFromRotationStart(key);
    const picked = pickGamesForDay(rosterKeys, ordinal, key, settings);
    games = picked.games;
    sitOuts = picked.sitOuts;
  }

  const sitOut = sitOuts[0] || null;
  const labelMap = Object.fromEntries(FUN_GAME_ROSTER.map((g) => [g.key, g.label]));
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
    permanentGameKeys: settings.permanentGameKeys,
    rotatedDailyCount: settings.rotatedDailyCount,
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

export function isGameAvailableOnDay(gameKey, dayKey, settings = null) {
  const rotation = getFunRotationForDay(dayKey, settings);
  if (rotation.closed) return false;
  return rotation.games.includes(String(gameKey || ''));
}
