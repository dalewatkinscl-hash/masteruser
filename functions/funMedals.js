'use strict';

/**
 * Fun-tab medals (🥇🥈🥉) — stored per game/day, aggregated onto each user.
 * Day awards are recomputed whenever a day's leaderboard changes so joint/late
 * finishers don't leave stale medals behind.
 */

const { assignJointRanks } = require('./funLeaderboard');

const MEDAL_KEYS = ['gold', 'silver', 'bronze'];

function emptyMedalTotals() {
  return { gold: 0, silver: 0, bronze: 0 };
}

function normalizeMedalTotals(raw = {}) {
  return {
    gold: Number.isFinite(raw.gold) ? Math.max(0, Math.floor(raw.gold)) : 0,
    silver: Number.isFinite(raw.silver) ? Math.max(0, Math.floor(raw.silver)) : 0,
    bronze: Number.isFinite(raw.bronze) ? Math.max(0, Math.floor(raw.bronze)) : 0,
  };
}

function formatMedalTotals(totals = {}) {
  const t = normalizeMedalTotals(totals);
  const parts = [];
  if (t.gold) parts.push(`${t.gold} × Gold`);
  if (t.silver) parts.push(`${t.silver} × Silver`);
  if (t.bronze) parts.push(`${t.bronze} × Bronze`);
  return {
    ...t,
    label: parts.length ? parts.join(', ') : 'No medals yet',
    total: t.gold + t.silver + t.bronze,
  };
}

function dayMedalDocId(gameKey, dayKey) {
  return `${gameKey}_${dayKey}`;
}

function medalistsFromLeaderboard(rows = []) {
  return (rows || [])
    .filter((row) => MEDAL_KEYS.includes(row.medal) && row.uid)
    .map((row) => ({
      uid: row.uid,
      fullName: row.fullName || 'Colleague',
      medal: row.medal,
    }));
}

/**
 * Replace medal awards for one game/day and adjust per-user totals by delta.
 */
async function syncDayMedals(db, {
  gameKey,
  dayKey,
  leaderboardRows = [],
  FieldValue,
}) {
  if (!gameKey || !dayKey || !FieldValue) return { awards: [] };

  const nextAwards = medalistsFromLeaderboard(leaderboardRows);
  const ref = db.collection('fun_medal_days').doc(dayMedalDocId(gameKey, dayKey));
  const snap = await ref.get();
  const prevAwards = snap.exists && Array.isArray(snap.data()?.awards)
    ? snap.data().awards
    : [];

  const prevByUid = new Map(prevAwards.map((row) => [row.uid, row.medal]));
  const nextByUid = new Map(nextAwards.map((row) => [row.uid, row.medal]));
  const touched = new Set([...prevByUid.keys(), ...nextByUid.keys()]);

  await ref.set({
    gameKey,
    dayKey,
    awards: nextAwards,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  for (const uid of touched) {
    const prev = prevByUid.get(uid) || null;
    const next = nextByUid.get(uid) || null;
    if (prev === next) continue;

    const userRef = db.collection('fun_medals').doc(uid);
    const patch = {
      uid,
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (prev && MEDAL_KEYS.includes(prev)) {
      patch[prev] = FieldValue.increment(-1);
    }
    if (next && MEDAL_KEYS.includes(next)) {
      patch[next] = FieldValue.increment(1);
    }
    const name = nextAwards.find((row) => row.uid === uid)?.fullName
      || prevAwards.find((row) => row.uid === uid)?.fullName
      || '';
    if (name) patch.fullName = name;
    await userRef.set(patch, { merge: true });
  }

  return { awards: nextAwards };
}

async function loadUserMedals(db, uid) {
  if (!uid) return formatMedalTotals();
  const snap = await db.collection('fun_medals').doc(uid).get();
  const data = snap.exists ? snap.data() || {} : {};
  const totals = normalizeMedalTotals(data);
  // Clamp negatives from any racey increments.
  const safe = {
    gold: Math.max(0, totals.gold),
    silver: Math.max(0, totals.silver),
    bronze: Math.max(0, totals.bronze),
  };
  if (safe.gold !== totals.gold || safe.silver !== totals.silver || safe.bronze !== totals.bronze) {
    await db.collection('fun_medals').doc(uid).set(safe, { merge: true });
  }
  return formatMedalTotals(safe);
}

/**
 * Rebuild all medal day docs from history, then recompute every user's totals.
 * builders: { [gameKey]: async (dayKey) => leaderboardRows }
 * dayKeysByGame: { [gameKey]: string[] }
 */
async function backfillAllMedals(db, {
  dayKeysByGame = {},
  builders = {},
  FieldValue,
}) {
  const gameKeys = Object.keys(builders);
  for (const gameKey of gameKeys) {
    const days = [...new Set(dayKeysByGame[gameKey] || [])].filter(Boolean);
    for (const dayKey of days) {
      const rows = await builders[gameKey](dayKey);
      const ref = db.collection('fun_medal_days').doc(dayMedalDocId(gameKey, dayKey));
      await ref.set({
        gameKey,
        dayKey,
        awards: medalistsFromLeaderboard(rows),
        updatedAt: FieldValue.serverTimestamp(),
        backfilled: true,
      }, { merge: true });
    }
  }

  const daySnap = await db.collection('fun_medal_days').get();
  const totalsByUid = new Map();
  const namesByUid = new Map();
  daySnap.docs.forEach((doc) => {
    const data = doc.data() || {};
    (data.awards || []).forEach((award) => {
      if (!award?.uid || !MEDAL_KEYS.includes(award.medal)) return;
      const current = totalsByUid.get(award.uid) || emptyMedalTotals();
      current[award.medal] += 1;
      totalsByUid.set(award.uid, current);
      if (award.fullName) namesByUid.set(award.uid, award.fullName);
    });
  });

  const existing = await db.collection('fun_medals').get();
  const batchWrites = [];
  const seen = new Set();

  for (const [uid, totals] of totalsByUid.entries()) {
    seen.add(uid);
    batchWrites.push({
      ref: db.collection('fun_medals').doc(uid),
      data: {
        uid,
        fullName: namesByUid.get(uid) || '',
        ...normalizeMedalTotals(totals),
        backfilledAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
    });
  }

  // Zero out anyone who had medals but no longer does.
  existing.docs.forEach((doc) => {
    if (seen.has(doc.id)) return;
    batchWrites.push({
      ref: doc.ref,
      data: {
        uid: doc.id,
        ...emptyMedalTotals(),
        backfilledAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
    });
  });

  // Firestore batches max 500.
  for (let i = 0; i < batchWrites.length; i += 400) {
    const batch = db.batch();
    batchWrites.slice(i, i + 400).forEach((item) => {
      batch.set(item.ref, item.data, { merge: true });
    });
    await batch.commit();
  }

  return {
    dayDocs: daySnap.size,
    users: totalsByUid.size,
  };
}

async function collectDayKeysFromCollection(db, collectionName) {
  const snap = await db.collection(collectionName).select('dayKey').limit(2000).get();
  const days = new Set();
  snap.docs.forEach((doc) => {
    const dayKey = doc.data()?.dayKey;
    if (dayKey) days.add(dayKey);
  });
  return [...days];
}

module.exports = {
  MEDAL_KEYS,
  emptyMedalTotals,
  normalizeMedalTotals,
  formatMedalTotals,
  medalistsFromLeaderboard,
  syncDayMedals,
  loadUserMedals,
  backfillAllMedals,
  collectDayKeysFromCollection,
  assignJointRanks,
};
