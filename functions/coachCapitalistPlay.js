'use strict';

/**
 * Coach Capitalist season play budget — server-authoritative heartbeats.
 * London day keys; 60-minute daily cap; max gap per heartbeat.
 */

const DEFAULT_DAILY_PLAY_MS = 60 * 60 * 1000;
const HEARTBEAT_MAX_GAP_MS = 60 * 1000;
const PLAY_COLLECTION = 'coach_capitalist_play';
const SCORES_ARCHIVE = 'coach_capitalist_scores_archive';

function getLondonDayKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
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

function serializePlayStatus(doc = {}, dayKey, capMs) {
  const playedMs = Math.max(0, Math.min(capMs, Math.floor(Number(doc.playedMs) || 0)));
  const remainingMs = Math.max(0, capMs - playedMs);
  return {
    dayKey,
    playedMs,
    remainingMs,
    locked: remainingMs <= 0,
    dailyPlayCapMs: capMs,
    lastHeartbeatAt: doc.lastHeartbeatAt?.toDate?.()?.toISOString?.()
      || (typeof doc.lastHeartbeatAt === 'string' ? doc.lastHeartbeatAt : null),
  };
}

/**
 * Load play status without crediting (for GET save).
 */
async function loadPlayStatus(db, { uid, seasonId, dailyPlayCapMs, dayKey = getLondonDayKey() }) {
  const cap = Number.isFinite(dailyPlayCapMs) ? dailyPlayCapMs : DEFAULT_DAILY_PLAY_MS;
  const ref = db.collection(PLAY_COLLECTION).doc(playDocId(uid, dayKey));
  const snap = await ref.get();
  const data = snap.exists ? (snap.data() || {}) : {};
  // Different season → treat as fresh day budget (old docs ignored)
  if (data.seasonId && data.seasonId !== seasonId) {
    return serializePlayStatus({}, dayKey, cap);
  }
  return serializePlayStatus(data, dayKey, cap);
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
  const cap = Number.isFinite(dailyPlayCapMs) ? dailyPlayCapMs : DEFAULT_DAILY_PLAY_MS;
  const ref = db.collection(PLAY_COLLECTION).doc(playDocId(uid, dayKey));

  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const prev = snap.exists ? (snap.data() || {}) : {};
    const sameSeason = !prev.seasonId || prev.seasonId === seasonId;
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
      lastHeartbeatAt: FieldValue.serverTimestamp(),
      lastHeartbeatMs: nowMs,
      updatedAt: FieldValue.serverTimestamp(),
    };
    tx.set(ref, payload, { merge: true });
    return { playedMs, delta };
  });

  return {
    ...serializePlayStatus({ playedMs: result.playedMs }, dayKey, cap),
    creditedMs: result.delta,
  };
}

const LIFETIME_WEIGHT = { local: 1, regional: 2.5, national: 5 };
const ANGEL_SCALE = 180;
const ANGEL_DIVISOR = 1e15;

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
  return Math.floor(ANGEL_SCALE * Math.sqrt(life / ANGEL_DIVISOR));
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

module.exports = {
  DEFAULT_DAILY_PLAY_MS,
  HEARTBEAT_MAX_GAP_MS,
  PLAY_COLLECTION,
  getLondonDayKey,
  normalizeSeasonConfig,
  loadPlayStatus,
  creditPlayHeartbeat,
  emptyStarterState,
  startCoachCapitalistSeason,
  buildPreviousSeasonWrapup,
  serializePlayStatus,
};
