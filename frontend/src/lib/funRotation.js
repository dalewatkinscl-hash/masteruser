/**
 * Fun weekday rotation — mirrors functions/funRotation.js (Europe/London day keys).
 */

export const FUN_GAMES_BASE = [
  { key: 'trivia', label: 'Daily Trivia' },
  { key: 'wordle', label: 'Daily Wordle' },
  { key: 'nonogram', label: 'Daily Nonogram' },
  { key: 'sokoban', label: 'Daily Sokoban' },
  { key: 'boggle', label: 'Daily Boggle' },
  { key: 'connections', label: 'Daily Connections' },
];

/** Competitive Enclose starts this Europe/London day (inclusive). */
export const ENCLOSE_LIVE_FROM = '2026-08-04';

export const ENCLOSE_GAME = { key: 'enclose', label: 'Daily Enclose' };

/** Competitive Letter Box starts this Europe/London day (inclusive). */
export const LETTERBOX_LIVE_FROM = '2026-08-05';

export const LETTERBOX_GAME = { key: 'letterbox', label: 'Daily Letter Box' };

/** Competitive Pipes starts this Europe/London day (inclusive). */
export const PIPES_LIVE_FROM = '2026-08-26';

export const PIPES_GAME = { key: 'pipes', label: 'Daily Pipes' };

/** Competitive Little Dicks Toolbox starts this Europe/London day (inclusive). */
export const TOOLBOX_KICK_LIVE_FROM = '2026-08-26';

export const TOOLBOX_KICK_GAME = { key: 'toolboxkick', label: 'Little Dicks Toolbox' };

/** From this day, Wordle + Little Dicks Toolbox never sit out of the weekday rotation. */
export const PERMANENT_FUN_FROM = '2026-08-27';

export const PERMANENT_GAME_KEYS = ['wordle', 'toolboxkick'];

export const FUN_GAME_ROSTER = [
  ...FUN_GAMES_BASE,
  ENCLOSE_GAME,
  LETTERBOX_GAME,
  PIPES_GAME,
  TOOLBOX_KICK_GAME,
];

export const ROTATION_START_DAY_KEY = '2026-08-03';
export const ROTATION_START = ROTATION_START_DAY_KEY;
export const DAILY_GAME_COUNT = 6;

const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function getRosterForDay(dayKey) {
  const key = String(dayKey || '');
  const roster = [...FUN_GAMES_BASE];
  if (key >= ENCLOSE_LIVE_FROM) roster.push(ENCLOSE_GAME);
  if (key >= LETTERBOX_LIVE_FROM) roster.push(LETTERBOX_GAME);
  if (key >= PIPES_LIVE_FROM) roster.push(PIPES_GAME);
  if (key >= TOOLBOX_KICK_LIVE_FROM) roster.push(TOOLBOX_KICK_GAME);
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

/** Previous daily count before Pipes raised the weekday target to DAILY_GAME_COUNT. */
const PRE_PIPES_DAILY_GAME_COUNT = 5;

function pickDailyGames(rosterKeys, ordinal, dailyCount = DAILY_GAME_COUNT) {
  const n = rosterKeys.length;
  if (n <= dailyCount || ordinal < 0) {
    return { games: [...rosterKeys], sitOuts: [] };
  }
  const sitOutCount = n - dailyCount;
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

/**
 * Launch day for Pipes: keep the pre-Pipes five-game lineup, then append Pipes.
 * Launch day for Little Dicks Toolbox: append it on top (may briefly exceed DAILY_GAME_COUNT).
 * From PERMANENT_FUN_FROM, Wordle + Little Dicks Toolbox never sit out.
 */
function ensurePermanentGames(games, sitOuts, dayKey, rosterKeys) {
  if (dayKey < PERMANENT_FUN_FROM) return { games, sitOuts };
  let nextGames = [...games];
  let nextSitOuts = [...sitOuts];
  for (const key of PERMANENT_GAME_KEYS) {
    if (!rosterKeys.includes(key) || nextGames.includes(key)) continue;
    nextSitOuts = nextSitOuts.filter((g) => g !== key);
    const bump = [...nextGames].reverse().find((g) => !PERMANENT_GAME_KEYS.includes(g));
    if (!bump) {
      nextGames = [...nextGames, key];
      continue;
    }
    nextGames = [...nextGames.filter((g) => g !== bump), key];
    nextSitOuts = [...nextSitOuts, bump];
  }
  return { games: nextGames, sitOuts: nextSitOuts };
}

function pickGamesForDay(rosterKeys, ordinal, dayKey) {
  let picked;
  if (dayKey === PIPES_LIVE_FROM) {
    const prePipesRoster = rosterKeys.filter((key) => key !== 'pipes' && key !== 'toolboxkick');
    picked = pickDailyGames(prePipesRoster, ordinal, PRE_PIPES_DAILY_GAME_COUNT);
    if (rosterKeys.includes('pipes') && !picked.games.includes('pipes')) {
      picked = { games: [...picked.games, 'pipes'], sitOuts: picked.sitOuts };
    }
  } else {
    picked = pickDailyGames(rosterKeys, ordinal, DAILY_GAME_COUNT);
  }

  if (
    dayKey === TOOLBOX_KICK_LIVE_FROM
    && rosterKeys.includes('toolboxkick')
    && !picked.games.includes('toolboxkick')
  ) {
    picked = {
      games: [...picked.games, 'toolboxkick'],
      sitOuts: picked.sitOuts.filter((g) => g !== 'toolboxkick'),
    };
  }

  return ensurePermanentGames(picked.games, picked.sitOuts, dayKey, rosterKeys);
}

export function nextMondayDayKey(fromDayKey) {
  let cursor = String(fromDayKey || '');
  for (let i = 0; i < 8; i += 1) {
    if (weekdayIndexUtc(cursor) === 1) return cursor;
    cursor = addDaysToDayKey(cursor, 1);
  }
  return cursor;
}

export function getFunRotationForDay(dayKey) {
  const key = DAY_KEY_RE.test(String(dayKey || '')) ? dayKey : '';

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
      encloseLive: Boolean(key && key >= ENCLOSE_LIVE_FROM),
      enclosePractice: false,
      letterboxLive: Boolean(key && key >= LETTERBOX_LIVE_FROM),
      letterboxPractice: false,
      pipesLive: Boolean(key && key >= PIPES_LIVE_FROM),
      pipesPractice: false,
      toolboxKickLive: Boolean(key && key >= TOOLBOX_KICK_LIVE_FROM),
    };
  }

  const roster = getRosterForDay(key);
  const rosterKeys = roster.map((g) => g.key);
  const rotationActive = key >= ROTATION_START_DAY_KEY;
  let sitOuts = [];
  let games = [...rosterKeys];

  if (rotationActive) {
    const ordinal = weekdayOrdinalFromRotationStart(key);
    const picked = pickGamesForDay(rosterKeys, ordinal, key);
    games = picked.games;
    sitOuts = picked.sitOuts;
  }

  const sitOut = sitOuts[0] || null;
  const labelMap = Object.fromEntries(FUN_GAME_ROSTER.map((g) => [g.key, g.label]));
  const sitOutLabels = sitOuts.map((g) => labelMap[g] || g);
  const countWord = games.length === 5
    ? 'five'
    : games.length === 6
      ? 'six'
      : games.length === 7
        ? 'seven'
        : games.length === 8
          ? 'eight'
          : String(games.length);
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
    encloseLive: key >= ENCLOSE_LIVE_FROM,
    enclosePractice: key < ENCLOSE_LIVE_FROM && !isWeekendDayKey(key),
    letterboxLive: key >= LETTERBOX_LIVE_FROM,
    letterboxPractice: key < LETTERBOX_LIVE_FROM && !isWeekendDayKey(key),
    pipesLive: key >= PIPES_LIVE_FROM,
    pipesPractice: key < PIPES_LIVE_FROM && !isWeekendDayKey(key),
    toolboxKickLive: key >= TOOLBOX_KICK_LIVE_FROM,
  };
}

export function isGameAvailableOnDay(gameKey, dayKey) {
  const rotation = getFunRotationForDay(dayKey);
  if (rotation.closed) return false;
  return rotation.games.includes(String(gameKey || ''));
}
