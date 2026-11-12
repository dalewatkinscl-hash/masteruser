'use strict';

/**
 * Coach Capitalist season play budget — server-authoritative heartbeats.
 * London day keys; 60-minute daily cap; max gap per heartbeat.
 */

const DEFAULT_DAILY_PLAY_MS = 60 * 60 * 1000;
const HEARTBEAT_MAX_GAP_MS = 60 * 1000;
const PLAY_COLLECTION = 'coach_capitalist_play';
const BOOST_COLLECTION = 'coach_capitalist_play_boosts';
const SCORES_ARCHIVE = 'coach_capitalist_scores_archive';

/** Portal-coin purchase: +30 minutes active play, max 2× per London ISO week. */
const TIME_BOOST_COST = 100;
const TIME_BOOST_MS = 30 * 60 * 1000;
const TIME_BOOST_WEEKLY_LIMIT = 2;

function getLondonDayKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** ISO week key from a YYYY-MM-DD London day key, e.g. 2026-W42. */
function getLondonWeekKey(dayKey = getLondonDayKey()) {
  const key = String(dayKey || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return '';
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function boostDocId(uid, weekKey) {
  return `${uid}_${weekKey}`;
}

function normalizeSeasonConfig(raw = {}) {
  const seasonId = String(raw.seasonId || 'default').trim() || 'default';
  let dailyPlayCapMs = Number(raw.dailyPlayCapMs);
  if (!Number.isFinite(dailyPlayCapMs) || dailyPlayCapMs < 0) {
    dailyPlayCapMs = DEFAULT_DAILY_PLAY_MS;
  }
  const awayEarningsEnabled = raw.awayEarningsEnabled !== false;
  return { seasonId, dailyPlayCapMs, awayEarningsEnabled };
}

function playDocId(uid, dayKey) {
  return `${uid}_${dayKey}`;
}

function serializeTimeBoost(weeklyUsed = 0, weekKey = '') {
  const used = Math.max(0, Math.min(TIME_BOOST_WEEKLY_LIMIT, Math.floor(Number(weeklyUsed) || 0)));
  const remaining = Math.max(0, TIME_BOOST_WEEKLY_LIMIT - used);
  return {
    cost: TIME_BOOST_COST,
    bonusMs: TIME_BOOST_MS,
    weeklyLimit: TIME_BOOST_WEEKLY_LIMIT,
    weeklyUsed: used,
    weeklyRemaining: remaining,
    weekKey: weekKey || getLondonWeekKey(),
    canPurchase: remaining > 0,
  };
}

function effectiveCapMs(baseCapMs, bonusMs) {
  return Math.max(0, Math.floor(Number(baseCapMs) || 0)) + Math.max(0, Math.floor(Number(bonusMs) || 0));
}

function isLondonWeekend(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    weekday: 'short',
  }).format(date);
  return parts === 'Sat' || parts === 'Sun';
}

function serializePlayStatus(doc = {}, dayKey, baseCapMs, timeBoost = null, nowMs = Date.now()) {
  const bonusMs = Math.max(0, Math.floor(Number(doc.bonusMs) || 0));
  const capMs = effectiveCapMs(baseCapMs, bonusMs);
  const playedMs = Math.max(0, Math.min(capMs, Math.floor(Number(doc.playedMs) || 0)));
  const remainingMs = Math.max(0, capMs - playedMs);
  const isWeekend = isLondonWeekend(new Date(nowMs));
  return {
    dayKey,
    playedMs,
    remainingMs: isWeekend ? 0 : remainingMs,
    locked: isWeekend || remainingMs <= 0,
    isWeekend,
    dailyPlayCapMs: Math.max(0, Math.floor(Number(baseCapMs) || 0)),
    bonusMs,
    effectiveCapMs: capMs,
    timeBoost: timeBoost || serializeTimeBoost(0),
    lastHeartbeatAt: doc.lastHeartbeatAt?.toDate?.()?.toISOString?.()
      || (typeof doc.lastHeartbeatAt === 'string' ? doc.lastHeartbeatAt : null),
  };
}

async function loadWeeklyBoostUsed(db, uid, weekKey = getLondonWeekKey()) {
  if (!uid || !weekKey) return 0;
  const snap = await db.collection(BOOST_COLLECTION).doc(boostDocId(uid, weekKey)).get();
  if (!snap.exists) return 0;
  return Math.max(0, Math.floor(Number(snap.data()?.purchases) || 0));
}

/**
 * Load play status without crediting (for GET save).
 */
async function loadPlayStatus(db, { uid, seasonId, dailyPlayCapMs, dayKey = getLondonDayKey() }) {
  const baseCap = Number.isFinite(dailyPlayCapMs) ? dailyPlayCapMs : DEFAULT_DAILY_PLAY_MS;
  const weekKey = getLondonWeekKey(dayKey);
  const ref = db.collection(PLAY_COLLECTION).doc(playDocId(uid, dayKey));
  const [snap, weeklyUsed] = await Promise.all([
    ref.get(),
    loadWeeklyBoostUsed(db, uid, weekKey),
  ]);
  const data = snap.exists ? (snap.data() || {}) : {};
  const timeBoost = serializeTimeBoost(weeklyUsed, weekKey);
  // Different season → treat as fresh day budget (old docs ignored)
  if (data.seasonId && data.seasonId !== seasonId) {
    return serializePlayStatus({}, dayKey, baseCap, timeBoost);
  }
  return serializePlayStatus(data, dayKey, baseCap, timeBoost);
}

/**
 * Credit visible playtime from a heartbeat. Returns updated status.
 */
async function creditPlayHeartbeat(db, {
  uid,
  seasonId,
  dailyPlayCapMs,
  FieldValue,
  dayKey = getLondonDayKey(),
  nowMs = Date.now(),
}) {
  const baseCap = Number.isFinite(dailyPlayCapMs) ? dailyPlayCapMs : DEFAULT_DAILY_PLAY_MS;
  const weekKey = getLondonWeekKey(dayKey);
  const ref = db.collection(PLAY_COLLECTION).doc(playDocId(uid, dayKey));

  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const prev = snap.exists ? (snap.data() || {}) : {};
    const sameSeason = !prev.seasonId || prev.seasonId === seasonId;
    const bonusMs = sameSeason ? Math.max(0, Math.floor(Number(prev.bonusMs) || 0)) : 0;
    const cap = effectiveCapMs(baseCap, bonusMs);
    let playedMs = sameSeason ? Math.max(0, Math.floor(Number(prev.playedMs) || 0)) : 0;
    let delta = 0;

    if (playedMs < cap) {
      const lastMs = prev.lastHeartbeatAt?.toMillis?.()
        || (typeof prev.lastHeartbeatAt === 'number' ? prev.lastHeartbeatAt : 0)
        || (prev.lastHeartbeatMs ? Number(prev.lastHeartbeatMs) : 0);
      if (lastMs > 0 && sameSeason) {
        delta = Math.min(HEARTBEAT_MAX_GAP_MS, Math.max(0, nowMs - lastMs));
      } else {
        // First heartbeat of the day / season — seed without charging a full gap
        delta = 0;
      }
      playedMs = Math.min(cap, playedMs + delta);
    }

    const payload = {
      uid,
      dayKey,
      seasonId,
      playedMs,
      bonusMs,
      lastHeartbeatAt: FieldValue.serverTimestamp(),
      lastHeartbeatMs: nowMs,
      updatedAt: FieldValue.serverTimestamp(),
    };
    tx.set(ref, payload, { merge: true });
    return { playedMs, delta, bonusMs };
  });

  const weeklyUsed = await loadWeeklyBoostUsed(db, uid, weekKey);
  return {
    ...serializePlayStatus(
      { playedMs: result.playedMs, bonusMs: result.bonusMs },
      dayKey,
      baseCap,
      serializeTimeBoost(weeklyUsed, weekKey),
    ),
    creditedMs: result.delta,
  };
}

/**
 * Spend portal coins for +30 minutes of today's play budget (max 2× / London week).
 */
async function purchasePlayTimeBoost(db, {
  uid,
  seasonId,
  dailyPlayCapMs,
  FieldValue,
  fullName = '',
  dayKey = getLondonDayKey(),
}) {
  if (!db || !FieldValue || !uid) {
    const err = new Error('Missing purchase arguments.');
    err.status = 500;
    throw err;
  }
  const baseCap = Number.isFinite(dailyPlayCapMs) ? dailyPlayCapMs : DEFAULT_DAILY_PLAY_MS;
  const weekKey = getLondonWeekKey(dayKey);
  if (!weekKey) {
    const err = new Error('Could not resolve London week.');
    err.status = 500;
    throw err;
  }

  const playRef = db.collection(PLAY_COLLECTION).doc(playDocId(uid, dayKey));
  const boostRef = db.collection(BOOST_COLLECTION).doc(boostDocId(uid, weekKey));
  const walletRef = db.collection('coin_wallets').doc(uid);

  const result = await db.runTransaction(async (tx) => {
    const boostSnap = await tx.get(boostRef);
    const playSnap = await tx.get(playRef);
    const walletSnap = await tx.get(walletRef);

    const weeklyUsed = Math.max(0, Math.floor(Number(boostSnap.exists ? boostSnap.data()?.purchases : 0) || 0));
    const playPrev = playSnap.exists ? (playSnap.data() || {}) : {};
    const sameSeason = !playPrev.seasonId || playPrev.seasonId === seasonId;
    const prevBonus = sameSeason ? Math.max(0, Math.floor(Number(playPrev.bonusMs) || 0)) : 0;
    const prevPlayed = sameSeason ? Math.max(0, Math.floor(Number(playPrev.playedMs) || 0)) : 0;
    const wallet = walletSnap.exists ? (walletSnap.data() || {}) : {};
    const balance = Math.max(0, Math.floor(Number(wallet.balance) || 0));
    const lifetimeEarned = Math.max(0, Math.floor(Number(wallet.lifetimeEarned) || 0));

    if (weeklyUsed >= TIME_BOOST_WEEKLY_LIMIT) {
      return {
        ok: false,
        error: 'weekly_limit',
        weeklyUsed,
        balance,
        bonusMs: prevBonus,
        playedMs: prevPlayed,
      };
    }

    if (balance < TIME_BOOST_COST) {
      return {
        ok: false,
        error: 'insufficient_funds',
        weeklyUsed,
        balance,
        bonusMs: prevBonus,
        playedMs: prevPlayed,
      };
    }

    const purchaseIndex = weeklyUsed + 1;
    const ledgerKey = `coachcap:play_boost:${weekKey}:${uid}:${purchaseIndex}`;
    const ledgerRef = db.collection('coin_ledger').doc(ledgerKey);
    const ledgerSnap = await tx.get(ledgerRef);
    if (ledgerSnap.exists) {
      // Idempotent retry — treat as success and return current play status fields.
      return {
        ok: true,
        duplicate: true,
        weeklyUsed,
        balance,
        bonusMs: prevBonus,
        playedMs: prevPlayed,
        purchaseIndex,
      };
    }

    const nextBonus = prevBonus + TIME_BOOST_MS;
    const nextBalance = balance - TIME_BOOST_COST;

    tx.set(ledgerRef, {
      uid,
      amount: -TIME_BOOST_COST,
      reason: 'coach_cap_play_boost',
      createdAt: FieldValue.serverTimestamp(),
      gameKey: 'coachcapitalist',
      source: 'play_time_boost',
      dayKey,
      weekKey,
      refType: 'coach_cap_play_boost',
      refId: String(purchaseIndex),
    });
    tx.set(walletRef, {
      uid,
      balance: nextBalance,
      lifetimeEarned,
      ...(fullName ? { fullName: String(fullName).slice(0, 120) } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    tx.set(boostRef, {
      uid,
      weekKey,
      purchases: purchaseIndex,
      updatedAt: FieldValue.serverTimestamp(),
      lastPurchaseAt: FieldValue.serverTimestamp(),
      lastDayKey: dayKey,
    }, { merge: true });
    tx.set(playRef, {
      uid,
      dayKey,
      seasonId,
      playedMs: prevPlayed,
      bonusMs: nextBonus,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    return {
      ok: true,
      duplicate: false,
      weeklyUsed: purchaseIndex,
      balance: nextBalance,
      bonusMs: nextBonus,
      playedMs: prevPlayed,
      purchaseIndex,
    };
  });

  const play = serializePlayStatus(
    { playedMs: result.playedMs || 0, bonusMs: result.bonusMs || 0 },
    dayKey,
    baseCap,
    serializeTimeBoost(result.weeklyUsed || 0, weekKey),
  );

  if (!result.ok) {
    return {
      ok: false,
      error: result.error,
      cost: TIME_BOOST_COST,
      bonusMsGranted: TIME_BOOST_MS,
      walletBalance: result.balance,
      play,
    };
  }

  return {
    ok: true,
    duplicate: Boolean(result.duplicate),
    cost: TIME_BOOST_COST,
    bonusMsGranted: TIME_BOOST_MS,
    walletBalance: result.balance,
    purchaseIndex: result.purchaseIndex,
    play,
  };
}

const LIFETIME_WEIGHT = { local: 1, regional: 2.5, national: 2 };
const ANGEL_SCALE = 180;
const ANGEL_DIVISOR = 1e15;
const ANGEL_SOFT_CAP = 10_000_000;

function weightedLifetimeFromState(state) {
  if (!state?.depots) return 0;
  let sum = 0;
  for (const id of Object.keys(LIFETIME_WEIGHT)) {
    const life = Math.max(0, Number(state.depots?.[id]?.lifetimeEarnings) || 0);
    sum += life * (LIFETIME_WEIGHT[id] || 1);
  }
  return sum;
}

function angelsFromWeighted(weighted) {
  const life = Math.max(0, Number(weighted) || 0);
  if (life <= 0) return 0;
  const raw = ANGEL_SCALE * Math.sqrt(life / ANGEL_DIVISOR);
  if (raw <= ANGEL_SOFT_CAP) return Math.floor(raw);
  const excess = raw - ANGEL_SOFT_CAP;
  return ANGEL_SOFT_CAP + Math.floor(Math.pow(excess, 0.45) * 500);
}

function pendingAngelsFromState(state) {
  if (!state) return 0;
  const total = angelsFromWeighted(weightedLifetimeFromState(state));
  const already = Math.max(0, Number(state.angels) || 0) + Math.max(0, Number(state.angelsSpent) || 0);
  return Math.max(0, total - already);
}

function deepestDepotFromState(state) {
  if (!state?.depots) return 'none';
  if (state.depots.national?.unlocked) return 'national';
  if (state.depots.regional?.unlocked) return 'regional';
  if (state.depots.local?.unlocked) return 'local';
  return 'none';
}

function personRef(uid, fullName) {
  return {
    uid: uid || '',
    fullName: String(fullName || 'Employee').trim() || 'Employee',
  };
}

/**
 * Snapshot Season N notables from live scores + saves before a wipe.
 */
function buildPreviousSeasonWrapup({
  scoresDocs = [],
  savesDocs = [],
  previousSeasonId = 'season-1',
  previousSeasonLabel = 'Season 1',
}) {
  const nameByUid = new Map();
  const scoreRows = [];
  for (const doc of scoresDocs) {
    const data = doc.data() || {};
    const uid = doc.id;
    const fullName = data.fullName || data.email || 'Employee';
    nameByUid.set(uid, fullName);
    scoreRows.push({
      ...personRef(uid, fullName),
      lifetimeEarnings: Math.max(0, Number(data.lifetimeEarnings) || 0),
    });
  }
  scoreRows.sort((a, b) => b.lifetimeEarnings - a.lifetimeEarnings);

  let mostUnclaimed = null;
  let mostClaimed = null;
  let richestCash = null;
  let furthestDepot = null;
  let nationalCount = 0;
  let regionalCount = 0;
  const depotRank = { none: 0, local: 1, regional: 2, national: 3 };

  for (const doc of savesDocs) {
    const data = doc.data() || {};
    const uid = doc.id;
    const state = data.state || null;
    const fullName = nameByUid.get(uid) || data.updatedByName || 'Employee';
    const pending = pendingAngelsFromState(state);
    const claimed = Math.max(0, Number(state?.angels) || 0) + Math.max(0, Number(state?.angelsSpent) || 0);
    const cash = Math.max(0, Number(state?.cash) || 0);
    const deepest = deepestDepotFromState(state);
    if (deepest === 'national') nationalCount += 1;
    if (deepest === 'regional' || deepest === 'national') regionalCount += 1;

    if (!mostUnclaimed || pending > mostUnclaimed.pendingAngels) {
      mostUnclaimed = { ...personRef(uid, fullName), pendingAngels: pending };
    }
    if (!mostClaimed || claimed > mostClaimed.claimedAngels) {
      mostClaimed = { ...personRef(uid, fullName), claimedAngels: claimed };
    }
    if (!richestCash || cash > richestCash.cash) {
      richestCash = { ...personRef(uid, fullName), cash };
    }
    if (!furthestDepot || depotRank[deepest] > depotRank[furthestDepot.depot]) {
      furthestDepot = { ...personRef(uid, fullName), depot: deepest };
    }
  }

  const topEarners = scoreRows.slice(0, 5).map((row, i) => ({
    rank: i + 1,
    uid: row.uid,
    fullName: row.fullName,
    lifetimeEarnings: row.lifetimeEarnings,
  }));

  return {
    previousSeasonId,
    previousSeasonLabel,
    playerCount: Math.max(scoreRows.length, savesDocs.length),
    scoredPlayers: scoreRows.length,
    topEarners,
    champion: topEarners[0] || null,
    mostUnclaimedBackers: mostUnclaimed && mostUnclaimed.pendingAngels > 0 ? mostUnclaimed : null,
    mostClaimedBackers: mostClaimed && mostClaimed.claimedAngels > 0 ? mostClaimed : null,
    richestCash: richestCash && richestCash.cash > 0 ? richestCash : null,
    furthestDepot: furthestDepot && furthestDepot.depot !== 'none' ? furthestDepot : null,
    reachedRegional: regionalCount,
    reachedNational: nationalCount,
  };
}

function emptyStarterState(now = Date.now()) {
  const blankDepot = (unlocked, ownedFirst = false) => ({
    cash: 0,
    lifetimeEarnings: 0,
    sessionEarnings: 0,
    owned: ownedFirst ? [1] : [],
    managers: ownedFirst ? [false] : [],
    upgrades: [],
    angelUpgrades: [],
    angels: 0,
    angelsSpent: 0,
    angelBonusExtra: 0,
    progress: ownedFirst ? [0] : [],
    running: ownedFirst ? [false] : [],
    lastTick: now,
    unlocked,
  });
  return {
    version: 1,
    activeDepot: 'local',
    buyMode: 1,
    cash: 0,
    angels: 0,
    angelsSpent: 0,
    unopenedPacks: 0,
    cards: {},
    depots: {
      local: blankDepot(true, true),
      regional: blankDepot(false, false),
      national: blankDepot(false, false),
    },
  };
}

async function deleteCollectionInBatches(db, collectionRef, { batchSize = 400 } = {}) {
  let deleted = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const snap = await collectionRef.limit(batchSize).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    deleted += snap.size;
    if (snap.size < batchSize) break;
  }
  return deleted;
}

/**
 * Wipe scores (+ optional archive), reset all saves, bump season config.
 */
async function startCoachCapitalistSeason(db, {
  seasonId,
  dailyPlayCapMs = DEFAULT_DAILY_PLAY_MS,
  awayEarningsEnabled = true,
  archiveScores = true,
  previousSeasonLabel = '',
  FieldValue,
  adminUid = '',
  adminName = '',
}) {
  const id = String(seasonId || '').trim();
  if (!id) {
    const err = new Error('seasonId is required.');
    err.status = 400;
    throw err;
  }
  const forceResetToken = `season-${id}-${Date.now().toString(36)}`;
  const starter = emptyStarterState();
  let archived = 0;
  let scoresCleared = 0;
  let savesReset = 0;

  const configSnap = await db.doc('coach_capitalist/config').get();
  const prevConfig = configSnap.exists ? (configSnap.data() || {}) : {};
  const prevSeasonId = String(prevConfig.seasonId || 'season-1').trim() || 'season-1';
  const archiveKey = prevSeasonId === id ? `${prevSeasonId}-pre-${Date.now().toString(36)}` : prevSeasonId;
  const label = String(previousSeasonLabel || '').trim()
    || (prevSeasonId === 'default' || prevSeasonId === 'season-1' ? 'Season 1' : prevSeasonId);

  const [scoresSnap, savesSnap] = await Promise.all([
    db.collection('coach_capitalist_scores').get(),
    db.collection('coach_capitalist_saves').get(),
  ]);

  const previousSeasonWrapup = buildPreviousSeasonWrapup({
    scoresDocs: scoresSnap.docs,
    savesDocs: savesSnap.docs,
    previousSeasonId: archiveKey,
    previousSeasonLabel: label,
  });

  if (archiveScores) {
    let batch = db.batch();
    let n = 0;
    for (const doc of scoresSnap.docs) {
      const data = doc.data() || {};
      batch.set(
        db.collection(SCORES_ARCHIVE).doc(archiveKey).collection('scores').doc(doc.id),
        { ...data, archivedAt: FieldValue.serverTimestamp(), seasonId: archiveKey },
      );
      n += 1;
      archived += 1;
      if (n >= 400) {
        await batch.commit();
        batch = db.batch();
        n = 0;
      }
    }
    if (n > 0) await batch.commit();
    await db.collection(SCORES_ARCHIVE).doc(archiveKey).set({
      seasonId: archiveKey,
      seasonLabel: label,
      wrapup: previousSeasonWrapup,
      archivedAt: FieldValue.serverTimestamp(),
      archivedByUid: adminUid || '',
      archivedByName: adminName || '',
      nextSeasonId: id,
    }, { merge: true });
  }

  scoresCleared = await deleteCollectionInBatches(db, db.collection('coach_capitalist_scores'));

  // Reset every save doc (or create wipe token even if empty collection)
  let batch = db.batch();
  let n = 0;
  for (const doc of savesSnap.docs) {
    const uid = doc.id;
    batch.set(doc.ref, {
      uid,
      state: starter,
      lifetimeEarnings: 0,
      lifetimeSort: 0,
      lifetimeCap: FieldValue.delete(),
      forceResetToken,
      seasonId: id,
      updatedAt: FieldValue.serverTimestamp(),
      updatedByName: adminName || 'season-reset',
      seasonResetAt: FieldValue.serverTimestamp(),
      seasonResetBy: adminUid || '',
    }, { merge: true });
    n += 1;
    savesReset += 1;
    if (n >= 400) {
      await batch.commit();
      batch = db.batch();
      n = 0;
    }
  }
  if (n > 0) await batch.commit();

  // Reset today's used playtime and clear bonuses for all players so everyone starts fresh today
  const todayPlaySnap = await db.collection(PLAY_COLLECTION).get();
  let playBatch = db.batch();
  let pCount = 0;
  for (const doc of todayPlaySnap.docs) {
    playBatch.set(doc.ref, {
      playedMs: 0,
      bonusMs: 0,
      seasonId: id,
      lastHeartbeatMs: 0,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    pCount += 1;
    if (pCount >= 400) {
      await playBatch.commit();
      playBatch = db.batch();
      pCount = 0;
    }
  }
  if (pCount > 0) await playBatch.commit();

  await db.doc('coach_capitalist/config').set({
    seasonId: id,
    dailyPlayCapMs: Math.max(0, Math.floor(Number(dailyPlayCapMs) || DEFAULT_DAILY_PLAY_MS)),
    awayEarningsEnabled: awayEarningsEnabled !== false,
    forceResetToken,
    previousSeasonWrapup,
    seasonIntroVersion: 1,
    seasonStartedAt: FieldValue.serverTimestamp(),
    seasonStartedByUid: adminUid || '',
    seasonStartedByName: adminName || '',
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  return {
    seasonId: id,
    forceResetToken,
    dailyPlayCapMs: Math.max(0, Math.floor(Number(dailyPlayCapMs) || DEFAULT_DAILY_PLAY_MS)),
    awayEarningsEnabled: awayEarningsEnabled !== false,
    previousSeasonWrapup,
    archived,
    scoresCleared,
    savesReset,
  };
}

/**
 * List all Coach Capitalist players + active portal staff with their today play status.
 */
async function listAdminPlayStatuses(db, {
  seasonId = 'default',
  dailyPlayCapMs = DEFAULT_DAILY_PLAY_MS,
  dayKey = getLondonDayKey(),
}) {
  const baseCap = Number.isFinite(dailyPlayCapMs) ? dailyPlayCapMs : DEFAULT_DAILY_PLAY_MS;
  const weekKey = getLondonWeekKey(dayKey);

  const [scoresSnap, savesSnap, playSnap, boostSnap, employeesSnap] = await Promise.all([
    db.collection('coach_capitalist_scores').get(),
    db.collection('coach_capitalist_saves').get(),
    db.collection(PLAY_COLLECTION).where('dayKey', '==', dayKey).get(),
    weekKey ? db.collection(BOOST_COLLECTION).where('weekKey', '==', weekKey).get() : Promise.resolve({ docs: [] }),
    db.collection('employees').get(),
  ]);

  const userMap = new Map();
  const ensureUser = (uid) => {
    const cleanUid = String(uid || '').trim();
    if (!cleanUid) return null;
    if (!userMap.has(cleanUid)) {
      userMap.set(cleanUid, {
        uid: cleanUid,
        fullName: '',
        email: '',
        lifetimeEarnings: 0,
        hasCoachCap: false,
        isActiveStaff: false,
        playDoc: null,
        weeklyUsed: 0,
      });
    }
    return userMap.get(cleanUid);
  };

  for (const doc of employeesSnap.docs) {
    const d = doc.data() || {};
    const uid = String(d.uid || doc.id || '').trim();
    if (!uid) continue;
    if (d.status === 'Left' || d.archived === true || d.isDeleted === true) continue;
    const u = ensureUser(uid);
    if (!u) continue;
    const name = String(d.fullName || `${d.firstName || ''} ${d.lastName || ''}`).trim();
    if (name) u.fullName = name;
    if (d.email) u.email = String(d.email).trim();
    u.isActiveStaff = true;
  }

  for (const doc of savesSnap.docs) {
    const d = doc.data() || {};
    const u = ensureUser(doc.id);
    if (!u) continue;
    u.hasCoachCap = true;
    if (!u.fullName && d.updatedByName) u.fullName = String(d.updatedByName).trim();
    const saveLife = Number(d.lifetimeEarnings) || 0;
    if (saveLife > u.lifetimeEarnings) u.lifetimeEarnings = saveLife;
  }

  for (const doc of scoresSnap.docs) {
    const d = doc.data() || {};
    const u = ensureUser(doc.id);
    if (!u) continue;
    u.hasCoachCap = true;
    if (!u.fullName && d.fullName) u.fullName = String(d.fullName).trim();
    const scoreLife = Number(d.lifetimeEarnings) || 0;
    if (scoreLife > u.lifetimeEarnings) u.lifetimeEarnings = scoreLife;
  }

  for (const doc of boostSnap.docs) {
    const d = doc.data() || {};
    const uid = String(d.uid || doc.id.split('_')[0] || '').trim();
    const u = ensureUser(uid);
    if (!u) continue;
    u.weeklyUsed = Math.max(0, Math.floor(Number(d.purchases) || 0));
  }

  for (const doc of playSnap.docs) {
    const d = doc.data() || {};
    const uid = String(d.uid || doc.id.replace(`_${dayKey}`, '') || '').trim();
    const u = ensureUser(uid);
    if (!u) continue;
    u.hasCoachCap = true;
    if (!d.seasonId || d.seasonId === seasonId) {
      u.playDoc = d;
    }
  }

  // Compute leaderboard ranks for Coach Capitalist players
  const rankedList = Array.from(userMap.values())
    .filter((u) => u.hasCoachCap && u.lifetimeEarnings > 0)
    .sort((a, b) => b.lifetimeEarnings - a.lifetimeEarnings);
  const rankByUid = new Map();
  rankedList.forEach((u, idx) => rankByUid.set(u.uid, idx + 1));

  const players = [];
  for (const u of userMap.values()) {
    if (!u.hasCoachCap && !u.isActiveStaff) continue;
    const name = u.fullName || u.email || u.uid;
    if (name === u.uid && !u.hasCoachCap) continue;
    const play = serializePlayStatus(
      u.playDoc || {},
      dayKey,
      baseCap,
      serializeTimeBoost(u.weeklyUsed, weekKey),
    );
    players.push({
      uid: u.uid,
      fullName: name,
      hasCoachCap: u.hasCoachCap,
      rank: rankByUid.get(u.uid) || null,
      lifetimeEarnings: u.lifetimeEarnings,
      play,
      lastGrantedByName: u.playDoc?.lastGrantedByName || null,
      lastGrantReason: u.playDoc?.lastGrantReason || null,
      lastGrantedAt: u.playDoc?.lastGrantedAt?.toDate?.()?.toISOString?.() || null,
    });
  }

  players.sort((a, b) => {
    const aActiveToday = (a.play.playedMs > 0 || a.play.bonusMs > 0) ? 1 : 0;
    const bActiveToday = (b.play.playedMs > 0 || b.play.bonusMs > 0) ? 1 : 0;
    if (aActiveToday !== bActiveToday) return bActiveToday - aActiveToday;
    if (a.hasCoachCap !== b.hasCoachCap) return a.hasCoachCap ? -1 : 1;
    if (a.rank && b.rank) return a.rank - b.rank;
    if (a.rank) return -1;
    if (b.rank) return 1;
    return String(a.fullName).localeCompare(String(b.fullName));
  });

  return {
    dayKey,
    weekKey,
    seasonId,
    dailyPlayCapMs: baseCap,
    players,
  };
}

/**
 * Admin grant/set/reset play time for one or more users on a London day.
 */
async function adminAdjustPlayTime(db, {
  uids = [],
  deltaBonusMs = 0,
  mode = 'add', // 'add' | 'set'
  resetPlayed = false,
  resetWeeklyBoosts = false,
  reason = '',
  seasonId = 'default',
  dailyPlayCapMs = DEFAULT_DAILY_PLAY_MS,
  FieldValue,
  adminUid = '',
  adminName = '',
  dayKey = getLondonDayKey(),
}) {
  const cleanUids = Array.from(
    new Set(
      (Array.isArray(uids) ? uids : [uids])
        .map((id) => String(id || '').trim())
        .filter(Boolean),
    ),
  );
  if (!cleanUids.length) {
    const err = new Error('At least one user must be selected.');
    err.status = 400;
    throw err;
  }

  const baseCap = Number.isFinite(dailyPlayCapMs) ? dailyPlayCapMs : DEFAULT_DAILY_PLAY_MS;
  const weekKey = getLondonWeekKey(dayKey);
  const delta = Math.floor(Number(deltaBonusMs) || 0);
  const updated = [];

  for (const uid of cleanUids) {
    const playRef = db.collection(PLAY_COLLECTION).doc(playDocId(uid, dayKey));
    const boostRef = weekKey ? db.collection(BOOST_COLLECTION).doc(boostDocId(uid, weekKey)) : null;

    const txRes = await db.runTransaction(async (tx) => {
      const snap = await tx.get(playRef);
      const boostSnap = boostRef ? await tx.get(boostRef) : null;
      const prev = snap.exists ? (snap.data() || {}) : {};
      const sameSeason = !prev.seasonId || prev.seasonId === seasonId;
      const prevBonus = sameSeason ? Math.max(0, Math.floor(Number(prev.bonusMs) || 0)) : 0;
      const prevPlayed = sameSeason ? Math.max(0, Math.floor(Number(prev.playedMs) || 0)) : 0;

      const nextBonus = mode === 'set'
        ? Math.max(0, delta)
        : Math.max(0, prevBonus + delta);
      const nextPlayed = resetPlayed ? 0 : prevPlayed;

      let weeklyUsed = boostSnap && boostSnap.exists
        ? Math.max(0, Math.floor(Number(boostSnap.data()?.purchases) || 0))
        : 0;

      if (resetWeeklyBoosts && boostRef) {
        weeklyUsed = 0;
        tx.set(boostRef, {
          uid,
          weekKey,
          purchases: 0,
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      }

      const payload = {
        uid,
        dayKey,
        seasonId,
        playedMs: nextPlayed,
        bonusMs: nextBonus,
        lastHeartbeatMs: 0,
        updatedAt: FieldValue.serverTimestamp(),
        lastGrantedByUid: adminUid || '',
        lastGrantedByName: adminName || 'Admin',
        lastGrantReason: String(reason || '').trim().slice(0, 200),
        lastGrantedAt: FieldValue.serverTimestamp(),
      };
      tx.set(playRef, payload, { merge: true });
      return { playedMs: nextPlayed, bonusMs: nextBonus, weeklyUsed };
    });

    updated.push({
      uid,
      play: serializePlayStatus(
        { playedMs: txRes.playedMs, bonusMs: txRes.bonusMs },
        dayKey,
        baseCap,
        serializeTimeBoost(txRes.weeklyUsed, weekKey),
      ),
    });
  }

  return {
    ok: true,
    dayKey,
    seasonId,
    updatedCount: updated.length,
    updated,
  };
}

module.exports = {
  DEFAULT_DAILY_PLAY_MS,
  HEARTBEAT_MAX_GAP_MS,
  PLAY_COLLECTION,
  TIME_BOOST_COST,
  TIME_BOOST_MS,
  TIME_BOOST_WEEKLY_LIMIT,
  getLondonDayKey,
  getLondonWeekKey,
  normalizeSeasonConfig,
  loadPlayStatus,
  creditPlayHeartbeat,
  purchasePlayTimeBoost,
  emptyStarterState,
  startCoachCapitalistSeason,
  buildPreviousSeasonWrapup,
  serializePlayStatus,
  listAdminPlayStatuses,
  adminAdjustPlayTime,
};
