'use strict';

/**
 * Employee coin wallets + ledger.
 *
 * coin_wallets/{uid}  — balance, lifetimeEarned
 * coin_ledger/{idempotencyKey} — one doc per award (natural dedupe)
 */

const COIN_AMOUNTS = {
  next_of_kin: 10,
  phone_number: 5,
  home_address: 10,
  personal_email: 5,
  fun_attempt: 3,
  fun_win: 5,
  podium: 25,
  streak_5: 25,
  kudos_send: 5,
  kudos_receive: 5,
  poll_vote: 3,
  suggestion: 10,
  daily_login: 2,
};

const MAX_EXTERNAL_AMOUNT = 500;
const MIN_EXTERNAL_AMOUNT = 1;

function emptyWallet() {
  return {
    balance: 0,
    lifetimeEarned: 0,
  };
}

function normalizeWallet(raw = {}) {
  return {
    balance: Number.isFinite(raw.balance) ? Math.max(0, Math.floor(raw.balance)) : 0,
    lifetimeEarned: Number.isFinite(raw.lifetimeEarned)
      ? Math.max(0, Math.floor(raw.lifetimeEarned))
      : 0,
  };
}

function sanitizeIdempotencyKey(key) {
  const raw = String(key || '').trim();
  if (!raw) return '';
  // Firestore doc ids: avoid slashes; keep readable keys under ~700 chars.
  return raw.replace(/\//g, '_').slice(0, 700);
}

/** ISO week key from a YYYY-MM-DD London day key, e.g. 2026-W12. */
function getLondonWeekKey(dayKey = '') {
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

/**
 * Award coins once per idempotencyKey. Returns { awarded, amount, balance }.
 */
async function awardCoins(db, {
  uid,
  amount,
  reason,
  idempotencyKey,
  FieldValue,
  fullName = '',
  meta = {},
}) {
  if (!db || !FieldValue || !uid) {
    return { awarded: false, amount: 0, balance: 0 };
  }

  const coins = Math.floor(Number(amount));
  if (!Number.isFinite(coins) || coins <= 0) {
    return { awarded: false, amount: 0, balance: 0 };
  }

  const key = sanitizeIdempotencyKey(idempotencyKey);
  if (!key) {
    return { awarded: false, amount: 0, balance: 0 };
  }

  const reasonKey = String(reason || 'unknown').trim().slice(0, 80) || 'unknown';
  const ledgerRef = db.collection('coin_ledger').doc(key);
  const walletRef = db.collection('coin_wallets').doc(uid);

  return db.runTransaction(async (tx) => {
    const ledgerSnap = await tx.get(ledgerRef);
    if (ledgerSnap.exists) {
      const walletSnap = await tx.get(walletRef);
      const wallet = normalizeWallet(walletSnap.exists ? walletSnap.data() : {});
      return { awarded: false, amount: 0, balance: wallet.balance, reason: reasonKey };
    }

    const walletSnap = await tx.get(walletRef);
    const previous = normalizeWallet(walletSnap.exists ? walletSnap.data() : {});
    const nextBalance = previous.balance + coins;
    const nextLifetime = previous.lifetimeEarned + coins;

    const ledgerDoc = {
      uid,
      amount: coins,
      reason: reasonKey,
      createdAt: FieldValue.serverTimestamp(),
    };
    if (meta.refType) ledgerDoc.refType = String(meta.refType).slice(0, 40);
    if (meta.refId) ledgerDoc.refId = String(meta.refId).slice(0, 200);
    if (meta.dayKey) ledgerDoc.dayKey = String(meta.dayKey).slice(0, 20);
    if (meta.source) ledgerDoc.source = String(meta.source).slice(0, 80);
    if (meta.gameKey) ledgerDoc.gameKey = String(meta.gameKey).slice(0, 40);

    tx.set(ledgerRef, ledgerDoc);
    tx.set(walletRef, {
      uid,
      balance: nextBalance,
      lifetimeEarned: nextLifetime,
      ...(fullName ? { fullName: String(fullName).slice(0, 120) } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    return { awarded: true, amount: coins, balance: nextBalance, reason: reasonKey };
  });
}

function toCoinAward(result) {
  if (!result?.awarded || !(result.amount > 0)) return null;
  return {
    amount: result.amount,
    reason: result.reason || 'reward',
  };
}

function collectCoinAwards(...results) {
  return results
    .flatMap((item) => (Array.isArray(item) ? item : [item]))
    .map(toCoinAward)
    .filter(Boolean);
}

async function getWallet(db, uid) {
  if (!uid) return emptyWallet();
  const snap = await db.collection('coin_wallets').doc(uid).get();
  if (!snap.exists) return emptyWallet();
  return normalizeWallet(snap.data() || {});
}

async function listRecentLedger(db, uid, limit = 8) {
  if (!uid) return [];
  const capped = Math.min(Math.max(1, Math.floor(limit) || 8), 40);

  const mapDoc = (doc) => {
    const data = doc.data() || {};
    if (data.reversedAt) return null;
    return {
      id: doc.id,
      amount: data.amount || 0,
      reason: data.reason || '',
      dayKey: data.dayKey || null,
      gameKey: data.gameKey || null,
      source: data.source || null,
      createdAt: data.createdAt?.toDate
        ? data.createdAt.toDate().toISOString()
        : (data.createdAt || null),
      _sortMs: data.createdAt?.toMillis
        ? data.createdAt.toMillis()
        : (data.createdAt ? Date.parse(data.createdAt) || 0 : 0),
    };
  };

  try {
    const snap = await db.collection('coin_ledger')
      .where('uid', '==', uid)
      .orderBy('createdAt', 'desc')
      .limit(capped * 3)
      .get();
    return snap.docs
      .map(mapDoc)
      .filter(Boolean)
      .slice(0, capped)
      .map(({ _sortMs, ...row }) => row);
  } catch (error) {
    // Missing composite index — fall back to in-memory sort.
    console.warn('listRecentLedger ordered query failed, using fallback', error?.message || error);
    try {
      const snap = await db.collection('coin_ledger')
        .where('uid', '==', uid)
        .limit(100)
        .get();
      return snap.docs
        .map(mapDoc)
        .filter(Boolean)
        .sort((a, b) => b._sortMs - a._sortMs)
        .slice(0, capped)
        .map(({ _sortMs, ...row }) => row);
    } catch (fallbackError) {
      console.warn('listRecentLedger failed', fallbackError?.message || fallbackError);
      return [];
    }
  }
}

async function maybeAwardFunAttempt(db, {
  uid,
  gameKey,
  dayKey,
  FieldValue,
  fullName = '',
  practice = false,
}) {
  if (practice || !uid || !gameKey || !dayKey) {
    return { awarded: false, amount: 0 };
  }
  return awardCoins(db, {
    uid,
    amount: COIN_AMOUNTS.fun_attempt,
    reason: 'fun_attempt',
    idempotencyKey: `fun_attempt:${gameKey}:${dayKey}:${uid}`,
    FieldValue,
    fullName,
    meta: { gameKey, dayKey, refType: 'fun_game' },
  });
}

async function maybeAwardFunWin(db, {
  uid,
  gameKey,
  dayKey,
  FieldValue,
  fullName = '',
  practice = false,
}) {
  if (practice || !uid || !gameKey || !dayKey) {
    return { awarded: false, amount: 0 };
  }
  return awardCoins(db, {
    uid,
    amount: COIN_AMOUNTS.fun_win,
    reason: 'fun_win',
    idempotencyKey: `fun_win:${gameKey}:${dayKey}:${uid}`,
    FieldValue,
    fullName,
    meta: { gameKey, dayKey, refType: 'fun_game' },
  });
}

async function maybeAwardStreakUnlock(db, {
  uid,
  gameKey,
  dayKey,
  FieldValue,
  fullName = '',
  newlyUnlocked = [],
}) {
  if (!uid || !Array.isArray(newlyUnlocked) || !newlyUnlocked.includes('streak_5')) {
    return { awarded: false, amount: 0 };
  }
  return awardCoins(db, {
    uid,
    amount: COIN_AMOUNTS.streak_5,
    reason: 'streak_5',
    idempotencyKey: `streak_5:${gameKey}:${uid}`,
    FieldValue,
    fullName,
    meta: { gameKey, dayKey, refType: 'fun_streak' },
  });
}

async function maybeAwardDailyLogin(db, {
  uid,
  dayKey,
  FieldValue,
  fullName = '',
}) {
  if (!uid || !dayKey) return { awarded: false, amount: 0 };
  return awardCoins(db, {
    uid,
    amount: COIN_AMOUNTS.daily_login,
    reason: 'daily_login',
    idempotencyKey: `login:${dayKey}:${uid}`,
    FieldValue,
    fullName,
    meta: { dayKey, refType: 'login' },
  });
}

/**
 * Settle podium coins for a finished day from fun_medal_days docs.
 * Awards 25 to each uid holding gold/silver/bronze that day (once per game).
 */
async function settlePodiumCoinsForDay(db, {
  dayKey,
  FieldValue,
  gameKeys = [],
}) {
  if (!dayKey || !FieldValue) {
    return { dayKey, awarded: 0, skipped: 0 };
  }

  let awarded = 0;
  let skipped = 0;
  const keys = Array.isArray(gameKeys) && gameKeys.length
    ? gameKeys
    : null;

  let dayDocs;
  if (keys) {
    dayDocs = [];
    for (const gameKey of keys) {
      const snap = await db.collection('fun_medal_days').doc(`${gameKey}_${dayKey}`).get();
      if (snap.exists) dayDocs.push(snap);
    }
  } else {
    const snap = await db.collection('fun_medal_days')
      .where('dayKey', '==', dayKey)
      .get();
    dayDocs = snap.docs;
  }

  for (const doc of dayDocs) {
    const data = doc.data() || {};
    const gameKey = data.gameKey || String(doc.id).split('_')[0];
    const awards = Array.isArray(data.awards) ? data.awards : [];
    const seen = new Set();

    for (const row of awards) {
      const uid = row?.uid;
      const medal = row?.medal;
      if (!uid || !['gold', 'silver', 'bronze'].includes(medal)) continue;
      if (seen.has(uid)) continue;
      seen.add(uid);

      const result = await awardCoins(db, {
        uid,
        amount: COIN_AMOUNTS.podium,
        reason: 'podium',
        idempotencyKey: `podium:${gameKey}:${dayKey}:${uid}`,
        FieldValue,
        fullName: row.fullName || '',
        meta: {
          gameKey,
          dayKey,
          refType: 'fun_podium',
          refId: medal,
        },
      });
      if (result.awarded) awarded += 1;
      else skipped += 1;
    }
  }

  return { dayKey, awarded, skipped, games: dayDocs.length };
}

function previousLondonDayKey(fromDayKey = '') {
  const key = String(fromDayKey || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return '';
  const [y, m, d] = key.split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  utc.setUTCDate(utc.getUTCDate() - 1);
  return utc.toISOString().slice(0, 10);
}

async function getCompletedEarnIds(db, {
  uid,
  dayKey = '',
  employeeProfile = {},
}) {
  if (!uid) return [];

  const profile = employeeProfile && typeof employeeProfile === 'object' ? employeeProfile : {};
  const nok = profile.nextOfKin || {};
  const address = profile.address || {};

  const profileComplete = {
    next_of_kin: Boolean(String(nok.name || '').trim() && String(nok.phoneNumber || '').trim()),
    phone_number: Boolean(String(profile.phoneNumber || '').trim()),
    home_address: Boolean(String(address.line1 || '').trim() && String(address.postcode || '').trim()),
    personal_email: Boolean(String(profile.personalEmail || '').trim()),
  };

  const ledgerChecks = [
    { id: 'next_of_kin', key: `profile:next_of_kin:${uid}` },
    { id: 'phone_number', key: `profile:phone_number:${uid}` },
    { id: 'home_address', key: `profile:home_address:${uid}` },
    { id: 'personal_email', key: `profile:personal_email:${uid}` },
  ];
  if (dayKey) {
    ledgerChecks.push({ id: 'daily_login', key: `login:${dayKey}:${uid}` });
    ledgerChecks.push({ id: 'poll_vote', key: `poll_vote:${dayKey}:${uid}` });
    ledgerChecks.push({ id: 'kudos_send', key: `kudos_send:${dayKey}:${uid}` });
    const weekKey = getLondonWeekKey(dayKey);
    if (weekKey) {
      ledgerChecks.push({ id: 'suggestion', key: `suggestion:${weekKey}:${uid}` });
    }
  }

  const completed = new Set();
  for (const [id, done] of Object.entries(profileComplete)) {
    if (done) completed.add(id);
  }

  try {
    const refs = ledgerChecks.map((row) => db.collection('coin_ledger').doc(row.key));
    const snaps = await db.getAll(...refs);
    snaps.forEach((snap, index) => {
      if (snap.exists) completed.add(ledgerChecks[index].id);
    });
  } catch (error) {
    console.warn('getCompletedEarnIds failed', error?.message || error);
  }

  return [...completed];
}

async function listCoinWallets(db, { limit = 500 } = {}) {
  const capped = Math.min(Math.max(1, Math.floor(limit) || 500), 2000);
  const snap = await db.collection('coin_wallets').limit(capped).get();
  const rows = snap.docs.map((doc) => {
    const data = doc.data() || {};
    const wallet = normalizeWallet(data);
    return {
      uid: doc.id,
      fullName: String(data.fullName || '').trim() || 'Employee',
      balance: wallet.balance,
      lifetimeEarned: wallet.lifetimeEarned,
      updatedAt: data.updatedAt?.toDate
        ? data.updatedAt.toDate().toISOString()
        : (data.updatedAt || null),
    };
  });
  rows.sort((a, b) => {
    if (b.balance !== a.balance) return b.balance - a.balance;
    if (b.lifetimeEarned !== a.lifetimeEarned) return b.lifetimeEarned - a.lifetimeEarned;
    return a.fullName.localeCompare(b.fullName);
  });
  return rows;
}

/**
 * Reverse all live fun_win awards (policy: podium pays at midnight only).
 * Idempotent via ledger.reversedAt.
 */
async function clawbackFunWinAwards(db, { FieldValue }) {
  if (!db || !FieldValue) {
    return { reversed: 0, amountTotal: 0, scanned: 0 };
  }

  const snap = await db.collection('coin_ledger').where('reason', '==', 'fun_win').get();
  let reversed = 0;
  let amountTotal = 0;

  for (const doc of snap.docs) {
    const data = doc.data() || {};
    if (data.reversedAt) continue;
    const uid = data.uid;
    const amount = Math.floor(Number(data.amount) || 0);
    if (!uid || amount <= 0) {
      await doc.ref.set({
        reversedAt: FieldValue.serverTimestamp(),
        reversedReason: 'fun_win_removed_empty',
      }, { merge: true });
      continue;
    }

    // eslint-disable-next-line no-await-in-loop
    await db.runTransaction(async (tx) => {
      const ledgerSnap = await tx.get(doc.ref);
      const ledger = ledgerSnap.exists ? ledgerSnap.data() || {} : {};
      if (!ledgerSnap.exists || ledger.reversedAt) return;

      const walletRef = db.collection('coin_wallets').doc(uid);
      const walletSnap = await tx.get(walletRef);
      const wallet = normalizeWallet(walletSnap.exists ? walletSnap.data() : {});

      tx.set(walletRef, {
        uid,
        balance: Math.max(0, wallet.balance - amount),
        lifetimeEarned: Math.max(0, wallet.lifetimeEarned - amount),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      tx.set(doc.ref, {
        reversedAt: FieldValue.serverTimestamp(),
        reversedReason: 'fun_win_removed',
      }, { merge: true });
    });

    reversed += 1;
    amountTotal += amount;
  }

  return { reversed, amountTotal, scanned: snap.size };
}

module.exports = {
  COIN_AMOUNTS,
  MAX_EXTERNAL_AMOUNT,
  MIN_EXTERNAL_AMOUNT,
  emptyWallet,
  normalizeWallet,
  awardCoins,
  toCoinAward,
  collectCoinAwards,
  getWallet,
  listRecentLedger,
  getCompletedEarnIds,
  clawbackFunWinAwards,
  listCoinWallets,
  maybeAwardFunAttempt,
  maybeAwardFunWin,
  maybeAwardStreakUnlock,
  maybeAwardDailyLogin,
  settlePodiumCoinsForDay,
  previousLondonDayKey,
  sanitizeIdempotencyKey,
  getLondonWeekKey,
};
