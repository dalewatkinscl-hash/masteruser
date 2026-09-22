'use strict';

/**
 * Fun-tab win streaks (all Fun games).
 * Stored per user in fun_streaks/{uid}.
 *
 * Rules (Europe/London weekdays):
 * - Only weekday results count
 * - Wins extend the streak
 * - Fails reset the streak to 0
 * - Missed days do not break the streak
 * - Weekends / rotation sit-outs are ignored (same as missed)
 */

const { isWeekendDayKey } = require('./funRotation');
const {
  maybeAwardStreakUnlock,
  maybeAwardFunAttempt,
  toCoinAward,
} = require('./coins');

const STREAK_ACHIEVEMENT_DAYS = 5;

function emptyGameStreak() {
  return {
    current: 0,
    best: 0,
    lastDayKey: null,
    lastOutcome: null,
    unlocked: [],
  };
}

function normalizeGameStreak(raw = {}) {
  const unlocked = Array.isArray(raw.unlocked)
    ? [...new Set(raw.unlocked.map(String))]
    : [];
  const lastOutcome = raw.lastOutcome === 'win' || raw.lastOutcome === 'fail'
    ? raw.lastOutcome
    : null;
  return {
    current: Number.isFinite(raw.current) ? raw.current : 0,
    best: Number.isFinite(raw.best) ? raw.best : 0,
    lastDayKey: raw.lastDayKey || null,
    lastOutcome,
    unlocked,
  };
}

function withUnlocks(streak) {
  const unlocked = new Set(streak.unlocked || []);
  if ((streak.best || 0) >= STREAK_ACHIEVEMENT_DAYS || (streak.current || 0) >= STREAK_ACHIEVEMENT_DAYS) {
    unlocked.add(`streak_${STREAK_ACHIEVEMENT_DAYS}`);
  }
  return { ...streak, unlocked: [...unlocked] };
}

/**
 * Compute current/best from chronological weekday outcomes.
 * @param {Array<{dayKey:string, outcome:'win'|'fail'}>} events
 */
function computeStreakFromOutcomes(events = [], todayKey = '') {
  const byDay = new Map();
  for (const event of events || []) {
    const dayKey = event?.dayKey;
    const outcome = event?.outcome;
    if (!dayKey || (outcome !== 'win' && outcome !== 'fail')) continue;
    if (isWeekendDayKey(dayKey)) continue;
    // One outcome per day — prefer fail if both somehow exist (streak breaks).
    const prev = byDay.get(dayKey);
    if (!prev || (prev === 'win' && outcome === 'fail')) {
      byDay.set(dayKey, outcome);
    }
  }

  const days = [...byDay.keys()].sort();
  if (!days.length) return emptyGameStreak();

  let best = 0;
  let run = 0;
  let lastDayKey = null;
  let lastOutcome = null;

  for (const day of days) {
    const outcome = byDay.get(day);
    lastDayKey = day;
    lastOutcome = outcome;
    if (outcome === 'win') {
      run += 1;
      best = Math.max(best, run);
    } else {
      run = 0;
    }
  }

  // Current streak survives missed days until a fail.
  const current = lastOutcome === 'win' ? run : 0;

  return withUnlocks({
    current,
    best: Math.max(best, current),
    lastDayKey,
    lastOutcome,
    unlocked: [],
  });
}

/** @deprecated Prefer computeStreakFromOutcomes — kept for callers that only have wins. */
function computeStreakFromDayKeys(dayKeys = [], todayKey = '', _gameKey = '') {
  const events = [...new Set((dayKeys || []).filter(Boolean))]
    .sort()
    .map((dayKey) => ({ dayKey, outcome: 'win' }));
  return computeStreakFromOutcomes(events, todayKey);
}

async function recordFunStreakWin(db, {
  uid,
  fullName = '',
  email = '',
  gameKey,
  dayKey,
  FieldValue,
}) {
  if (!uid || !gameKey || !dayKey) return emptyGameStreak();
  if (isWeekendDayKey(dayKey)) return emptyGameStreak();
  const ref = db.collection('fun_streaks').doc(uid);

  const next = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() || {} : {};
    const previous = normalizeGameStreak(data[gameKey]);

    if (previous.lastDayKey === dayKey && previous.lastOutcome === 'win') {
      return { streak: previous, newlyUnlocked: [] };
    }

    // Missed days do not reset — only a prior fail does.
    const current = previous.lastOutcome === 'win'
      ? (previous.current || 0) + 1
      : 1;
    const streak = withUnlocks({
      current,
      best: Math.max(previous.best || 0, current),
      lastDayKey: dayKey,
      lastOutcome: 'win',
      unlocked: previous.unlocked || [],
    });

    const prevUnlocked = new Set(previous.unlocked || []);
    const newlyUnlocked = (streak.unlocked || []).filter((key) => !prevUnlocked.has(key));

    tx.set(ref, {
      uid,
      fullName: fullName || data.fullName || 'Colleague',
      email: email || data.email || '',
      [gameKey]: streak,
      streakFailAware: true,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    return { streak, newlyUnlocked };
  });

  const coinsAwarded = [];

  if (next.newlyUnlocked?.length && FieldValue) {
    try {
      const unlockResult = await maybeAwardStreakUnlock(db, {
        uid,
        gameKey,
        dayKey,
        FieldValue,
        fullName,
        newlyUnlocked: next.newlyUnlocked,
      });
      const award = toCoinAward({ ...unlockResult, reason: unlockResult.reason || 'streak_5' });
      if (award) coinsAwarded.push(award);
    } catch (error) {
      console.warn('recordFunStreakWin coin award failed', error?.message || error);
    }
  }

  if (FieldValue) {
    try {
      const attemptResult = await maybeAwardFunAttempt(db, {
        uid,
        gameKey,
        dayKey,
        FieldValue,
        fullName,
        practice: false,
      });
      const attemptAward = toCoinAward({ ...attemptResult, reason: attemptResult.reason || 'fun_attempt' });
      if (attemptAward) coinsAwarded.push(attemptAward);
      // Competitive podium coins (1st/2nd/3rd) settle at London midnight — not on win.
    } catch (error) {
      console.warn('recordFunStreakWin fun coins failed', error?.message || error);
    }
  }

  const streak = next.streak || emptyGameStreak();
  if (coinsAwarded.length) streak.coinsAwarded = coinsAwarded;
  return streak;
}

async function recordFunStreakFail(db, {
  uid,
  fullName = '',
  email = '',
  gameKey,
  dayKey,
  FieldValue,
}) {
  if (!uid || !gameKey || !dayKey) return emptyGameStreak();
  if (isWeekendDayKey(dayKey)) return emptyGameStreak();
  const ref = db.collection('fun_streaks').doc(uid);

  const next = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() || {} : {};
    const previous = normalizeGameStreak(data[gameKey]);

    if (previous.lastDayKey === dayKey && previous.lastOutcome === 'fail') {
      return previous;
    }

    const streak = withUnlocks({
      current: 0,
      best: previous.best || 0,
      lastDayKey: dayKey,
      lastOutcome: 'fail',
      unlocked: previous.unlocked || [],
    });

    tx.set(ref, {
      uid,
      fullName: fullName || data.fullName || 'Colleague',
      email: email || data.email || '',
      [gameKey]: streak,
      streakFailAware: true,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    return streak;
  });

  const coinsAwarded = [];
  if (FieldValue) {
    try {
      const attemptResult = await maybeAwardFunAttempt(db, {
        uid,
        gameKey,
        dayKey,
        FieldValue,
        fullName,
        practice: false,
      });
      const award = toCoinAward({ ...attemptResult, reason: attemptResult.reason || 'fun_attempt' });
      if (award) coinsAwarded.push(award);
    } catch (error) {
      console.warn('recordFunStreakFail fun coins failed', error?.message || error);
    }
  }

  const streak = next || emptyGameStreak();
  if (coinsAwarded.length) streak.coinsAwarded = coinsAwarded;
  return streak;
}

async function collectOutcomeEvents(db, uid) {
  const [triviaSnap, wordleSnap, nonogramSnap, sokobanSnap, boggleSnap, connectionsSnap, encloseSnap, letterboxSnap, pipesSnap, toolboxKickSnap, wantedSnap, stackWalkSnap] = await Promise.all([
    db.collection('trivia_answers').where('uid', '==', uid).limit(400).get().catch(() => ({ docs: [] })),
    db.collection('wordle_games').where('uid', '==', uid).limit(400).get().catch(() => ({ docs: [] })),
    db.collection('nonogram_games').where('uid', '==', uid).limit(400).get().catch(() => ({ docs: [] })),
    db.collection('sokoban_games').where('uid', '==', uid).limit(400).get().catch(() => ({ docs: [] })),
    db.collection('boggle_games').where('uid', '==', uid).limit(400).get().catch(() => ({ docs: [] })),
    db.collection('connections_games').where('uid', '==', uid).limit(400).get().catch(() => ({ docs: [] })),
    db.collection('enclose_games').where('uid', '==', uid).limit(400).get().catch(() => ({ docs: [] })),
    db.collection('letterbox_games').where('uid', '==', uid).limit(400).get().catch(() => ({ docs: [] })),
    db.collection('pipes_games').where('uid', '==', uid).limit(400).get().catch(() => ({ docs: [] })),
    db.collection('toolbox_kick_games').where('uid', '==', uid).limit(400).get().catch(() => ({ docs: [] })),
    db.collection('wanted_games').where('uid', '==', uid).limit(400).get().catch(() => ({ docs: [] })),
    db.collection('stack_walk_games').where('uid', '==', uid).limit(400).get().catch(() => ({ docs: [] })),
  ]);

  const fromTrivia = triviaSnap.docs.map((doc) => {
    const row = doc.data() || {};
    if (!row.dayKey) return null;
    if (row.correct === true) return { dayKey: row.dayKey, outcome: 'win' };
    if (row.correct === false) return { dayKey: row.dayKey, outcome: 'fail' };
    return null;
  }).filter(Boolean);

  const fromStatus = (snap) => snap.docs.map((doc) => {
    const row = doc.data() || {};
    if (!row.dayKey) return null;
    if (row.status === 'won' || row.status === 'complete') return { dayKey: row.dayKey, outcome: 'win' };
    if (row.status === 'lost') return { dayKey: row.dayKey, outcome: 'fail' };
    return null;
  }).filter(Boolean);

  const fromWanted = wantedSnap.docs.map((doc) => {
    const row = doc.data() || {};
    if (!row.dayKey) return null;
    const hasWin = Boolean(
      row.status === 'won'
      || (row.standard?.timeMs != null && row.impossible?.timeMs != null),
    );
    if (hasWin) return { dayKey: row.dayKey, outcome: 'win' };
    return null;
  }).filter(Boolean);

  return {
    trivia: fromTrivia,
    wordle: fromStatus(wordleSnap),
    nonogram: fromStatus(nonogramSnap),
    sokoban: fromStatus(sokobanSnap),
    boggle: fromStatus(boggleSnap),
    connections: fromStatus(connectionsSnap),
    enclose: fromStatus(encloseSnap),
    letterbox: fromStatus(letterboxSnap),
    pipes: fromStatus(pipesSnap),
    toolboxkick: fromStatus(toolboxKickSnap),
    wanted: fromWanted,
    stackwalk: fromStatus(stackWalkSnap),
  };
}

async function backfillFunStreaksFromHistory(db, {
  uid,
  fullName = '',
  email = '',
  todayKey,
  FieldValue,
}) {
  if (!uid) {
    return {
      trivia: emptyGameStreak(),
      wordle: emptyGameStreak(),
      nonogram: emptyGameStreak(),
      sokoban: emptyGameStreak(),
      boggle: emptyGameStreak(),
      connections: emptyGameStreak(),
      enclose: emptyGameStreak(),
      letterbox: emptyGameStreak(),
      pipes: emptyGameStreak(),
      toolboxkick: emptyGameStreak(),
      wanted: emptyGameStreak(),
      stackwalk: emptyGameStreak(),
    };
  }

  const events = await collectOutcomeEvents(db, uid);
  const trivia = computeStreakFromOutcomes(events.trivia, todayKey);
  const wordle = computeStreakFromOutcomes(events.wordle, todayKey);
  const nonogram = computeStreakFromOutcomes(events.nonogram, todayKey);
  const sokoban = computeStreakFromOutcomes(events.sokoban, todayKey);
  const boggle = computeStreakFromOutcomes(events.boggle, todayKey);
  const connections = computeStreakFromOutcomes(events.connections, todayKey);
  const enclose = computeStreakFromOutcomes(events.enclose, todayKey);
  const letterbox = computeStreakFromOutcomes(events.letterbox, todayKey);
  const pipes = computeStreakFromOutcomes(events.pipes, todayKey);
  const toolboxkick = computeStreakFromOutcomes(events.toolboxkick, todayKey);
  const wanted = computeStreakFromOutcomes(events.wanted, todayKey);
  const stackwalk = computeStreakFromOutcomes(events.stackwalk, todayKey);

  await db.collection('fun_streaks').doc(uid).set({
    uid,
    fullName: fullName || 'Colleague',
    email: email || '',
    trivia,
    wordle,
    nonogram,
    sokoban,
    boggle,
    connections,
    enclose,
    letterbox,
    pipes,
    toolboxkick,
    wanted,
    stackwalk,
    streakWeekdayAware: true,
    streakFailAware: true,
    backfilledAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  return { trivia, wordle, nonogram, sokoban, boggle, connections, enclose, letterbox, pipes, toolboxkick, wanted, stackwalk };
}

async function loadFunStreaks(db, uid, {
  todayKey = '',
  fullName = '',
  email = '',
  FieldValue = null,
  forceBackfill = false,
} = {}) {
  if (!uid) {
    return {
      trivia: emptyGameStreak(),
      wordle: emptyGameStreak(),
      nonogram: emptyGameStreak(),
      sokoban: emptyGameStreak(),
      boggle: emptyGameStreak(),
      connections: emptyGameStreak(),
      enclose: emptyGameStreak(),
      letterbox: emptyGameStreak(),
      pipes: emptyGameStreak(),
      toolboxkick: emptyGameStreak(),
      wanted: emptyGameStreak(),
      stackwalk: emptyGameStreak(),
    };
  }

  const ref = db.collection('fun_streaks').doc(uid);
  const snap = await ref.get();
  const data = snap.exists ? snap.data() || {} : {};
  const needsBackfill = forceBackfill
    || !snap.exists
    || !data.backfilledAt
    || !data.sokoban
    || !data.boggle
    || !data.connections
    || !data.enclose
    || !data.letterbox
    || !data.pipes
    || !data.toolboxkick
    || !data.wanted
    || !data.stackwalk
    || !data.streakWeekdayAware
    || !data.streakFailAware;

  if (needsBackfill && FieldValue && todayKey) {
    return backfillFunStreaksFromHistory(db, {
      uid,
      fullName: fullName || data.fullName || '',
      email: email || data.email || '',
      todayKey,
      FieldValue,
    });
  }

  return {
    trivia: normalizeGameStreak(data.trivia),
    wordle: normalizeGameStreak(data.wordle),
    nonogram: normalizeGameStreak(data.nonogram),
    sokoban: normalizeGameStreak(data.sokoban),
    boggle: normalizeGameStreak(data.boggle),
    connections: normalizeGameStreak(data.connections),
    enclose: normalizeGameStreak(data.enclose),
    letterbox: normalizeGameStreak(data.letterbox),
    pipes: normalizeGameStreak(data.pipes),
    toolboxkick: normalizeGameStreak(data.toolboxkick),
    wanted: normalizeGameStreak(data.wanted),
    stackwalk: normalizeGameStreak(data.stackwalk),
  };
}

function serializeAchievements(streaks = {}, dayKey = '') {
  const games = [
    { key: 'trivia', label: 'Quiz of the day' },
    { key: 'wordle', label: 'Wordle' },
    { key: 'nonogram', label: 'Nonogram' },
    { key: 'sokoban', label: 'Sokoban' },
    { key: 'boggle', label: 'Boggle' },
    { key: 'connections', label: 'Connections' },
    { key: 'enclose', label: 'Enclose' },
    { key: 'letterbox', label: 'Letter Box' },
    { key: 'pipes', label: 'Pipes' },
    { key: 'toolboxkick', label: 'Little Dicks Toolbox' },
    { key: 'wanted', label: 'Wanted' },
    { key: 'stackwalk', label: "O Dell's Amazon Run" },
  ];

  return games.map((game) => {
    const streak = normalizeGameStreak(streaks[game.key]);
    const unlocked = streak.unlocked.includes(`streak_${STREAK_ACHIEVEMENT_DAYS}`);
    const doneToday = streak.lastDayKey === dayKey && streak.lastOutcome === 'win';
    return {
      gameKey: game.key,
      label: game.label,
      current: streak.current,
      best: streak.best,
      lastDayKey: streak.lastDayKey,
      lastOutcome: streak.lastOutcome,
      doneToday,
      target: STREAK_ACHIEVEMENT_DAYS,
      unlocked,
      title: `${game.label} · best ${streak.best} weekday win${streak.best === 1 ? '' : 's'}`,
      description: unlocked
        ? `Unlocked — current streak ${streak.current}. Fails reset; missed weekdays don’t.`
        : `Best ${streak.best} · current ${streak.current}. Reach ${STREAK_ACHIEVEMENT_DAYS} weekday wins without a fail.`,
    };
  });
}

module.exports = {
  STREAK_ACHIEVEMENT_DAYS,
  recordFunStreakWin,
  recordFunStreakFail,
  loadFunStreaks,
  serializeAchievements,
  normalizeGameStreak,
  computeStreakFromDayKeys,
  computeStreakFromOutcomes,
  backfillFunStreaksFromHistory,
};
