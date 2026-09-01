'use strict';

/**
 * Fun weekday rotation — six live games each Mon–Fri (Europe/London).
 * Extra roster games sit out on a rolling window. Weekends are closed.
 * Rolling sit-out starts Monday 2026-08-03.
 * Enclose from 2026-08-04; Letter Box from 2026-08-05; Pipes from 2026-08-26.
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

/** Competitive Letter Box starts this Europe/London day (inclusive). */
const LETTERBOX_LIVE_FROM = '2026-08-05';
const LETTERBOX_GAME = { key: 'letterbox', label: 'Daily Letter Box' };

/** Competitive Pipes starts this Europe/London day (inclusive). */
const PIPES_LIVE_FROM = '2026-08-26';
const PIPES_GAME = { key: 'pipes', label: 'Daily Pipes' };

/** Competitive Little Dicks Toolbox starts this Europe/London day (inclusive). */
const TOOLBOX_KICK_LIVE_FROM = '2026-08-26';
const TOOLBOX_KICK_GAME = { key: 'toolboxkick', label: 'Little Dicks Toolbox' };

/** From this day, Wordle + Little Dicks Toolbox never sit out. */
const PERMANENT_FUN_FROM = '2026-08-27';
const PERMANENT_GAME_KEYS = ['wordle', 'toolboxkick'];

/** Full roster including staged games (for labels / admin). Live days filter via getRosterForDay. */
const FUN_GAMES = [...FUN_GAMES_BASE, ENCLOSE_GAME, LETTERBOX_GAME, PIPES_GAME, TOOLBOX_KICK_GAME];
const FUN_GAME_ROSTER = FUN_GAMES;

/** First Monday the sit-out rotation applies. Before this, weekdays still show all then-available games. */
const ROTATION_START = '2026-08-03';
const ROTATION_START_DAY_KEY = ROTATION_START;

/** Competitive Fun always offers this many games on a weekday. */
const DAILY_GAME_COUNT = 6;

const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

function getRosterForDay(dayKey) {
  const key = String(dayKey || '');
  const roster = [...FUN_GAMES_BASE];
  if (key >= ENCLOSE_LIVE_FROM) roster.push(ENCLOSE_GAME);
  if (key >= LETTERBOX_LIVE_FROM) roster.push(LETTERBOX_GAME);
  if (key >= PIPES_LIVE_FROM) roster.push(PIPES_GAME);
  if (key >= TOOLBOX_KICK_LIVE_FROM) roster.push(TOOLBOX_KICK_GAME);
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

/** UTC weekday for a calendar dayKey (Sun=0 … Sat=6), matching the civil date. */
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

/** Count of Mon–Fri days from ROTATION_START inclusive to dayKey inclusive. */
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
 * Launch day for Little Dicks Toolbox: append it on top.
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
    const prePipesRoster = rosterKeys.filter((g) => g !== 'pipes' && g !== 'toolboxkick');
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

function nextMondayDayKey(fromDayKey = getLondonDayKey()) {
  let cursor = String(fromDayKey || getLondonDayKey());
  for (let i = 0; i < 8; i += 1) {
    if (weekdayIndexUtc(cursor) === 1) return cursor;
    cursor = addDaysToDayKey(cursor, 1);
  }
  return cursor;
}

/**
 * @returns {{
 *   dayKey: string,
 *   closed: boolean,
 *   reason: 'weekend'|'ok',
 *   message: string,
 *   games: string[],
 *   sitOut: string|null,
 *   rotationActive: boolean,
 *   labels: Array<{key:string,label:string}>,
 *   nextOpenDayKey: string,
 * }}
 */
function getFunRotationForDay(dayKey = getLondonDayKey()) {
  const key = DAY_KEY_RE.test(String(dayKey || '')) ? dayKey : getLondonDayKey();

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
      encloseLive: key >= ENCLOSE_LIVE_FROM,
      enclosePractice: false,
      letterboxLive: key >= LETTERBOX_LIVE_FROM,
      letterboxPractice: false,
      pipesLive: key >= PIPES_LIVE_FROM,
      pipesPractice: false,
      toolboxKickLive: key >= TOOLBOX_KICK_LIVE_FROM,
    };
  }

  const roster = getRosterForDay(key);
  const rosterKeys = roster.map((g) => g.key);
  const rotationActive = key >= ROTATION_START;
  let sitOuts = [];
  let games = [...rosterKeys];

  if (rotationActive) {
    const ordinal = weekdayOrdinalFromRotationStart(key);
    const picked = pickGamesForDay(rosterKeys, ordinal, key);
    games = picked.games;
    sitOuts = picked.sitOuts;
  }

  const sitOut = sitOuts[0] || null;
  const labelMap = Object.fromEntries(FUN_GAMES.map((g) => [g.key, g.label]));
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

function isGameAvailableOnDay(gameKey, dayKey = getLondonDayKey()) {
  const rotation = getFunRotationForDay(dayKey);
  if (rotation.closed) return false;
  return rotation.games.includes(String(gameKey || ''));
}

function isGameOfferedOnDay(gameKey, dayKey = getLondonDayKey()) {
  return isGameAvailableOnDay(gameKey, dayKey);
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

/**
 * Competitive gate used by Cloud Functions.
 * Signature: assertGamePlayable(dayKey, gameKey, { sandbox })
 */
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
  PERMANENT_FUN_FROM,
  PERMANENT_GAME_KEYS,
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
  assertFunGamePlayable,
  weekdayOrdinalFromRotationStart,
};
