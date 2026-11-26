'use strict';

const { CARD_TRADES_COLLECTION, emptyStarterState } = require('./coachCapitalistPlay');

const VALID_CARD_IDS = [
  'card-transit-89',
  'card-cheetah-midicoach',
  'card-plaxton-panther',
  'card-yellow-decker',
  'card-triaxle-team',
  'card-airport-shuttle',
  'card-luxury-sleeper',
  'card-bendy-bus',
  'card-terry-transit',
  'card-head-fitter-wendy',
  'card-inspector-dave',
  'card-schoolrun-sally',
  'card-nightshift-gary',
  'card-pete-silverstone',
  'card-golden-spanner',
  'card-master-tacho-key',
  'card-vintage-tie',
  'card-unlimited-fuel-card',
  'card-secret-kettle',
  'card-lion-trophy',
];

const VALID_CARD_ID_SET = new Set(VALID_CARD_IDS);
const MAX_OPEN_LISTINGS_PER_SELLER = 3;

function sanitizeCardsMap(rawCards) {
  const out = {};
  if (!rawCards || typeof rawCards !== 'object' || Array.isArray(rawCards)) return out;
  for (const [cardId, entry] of Object.entries(rawCards)) {
    if (!VALID_CARD_ID_SET.has(cardId) || !entry || typeof entry !== 'object') continue;
    const count = Math.max(0, Math.floor(Number(entry.count) || 0));
    if (count <= 0) continue;
    out[cardId] = {
      count,
      shinyCount: Math.max(0, Math.min(count, Math.floor(Number(entry.shinyCount) || 0))),
      firstDrawnAt: Math.max(0, Math.floor(Number(entry.firstDrawnAt) || 0)),
    };
  }
  return out;
}

function addCardToMap(cards, cardId, { shiny = false, now = Date.now() } = {}) {
  const prev = cards[cardId] || { count: 0, shinyCount: 0, firstDrawnAt: now };
  cards[cardId] = {
    count: (prev.count || 0) + 1,
    shinyCount: (prev.shinyCount || 0) + (shiny ? 1 : 0),
    firstDrawnAt: prev.firstDrawnAt || now,
  };
}

function removeRegularCardFromMap(cards, cardId, qty = 1) {
  const entry = cards[cardId];
  const count = Math.max(0, Math.floor(Number(entry?.count) || 0));
  const shinyCount = Math.max(0, Math.min(count, Math.floor(Number(entry?.shinyCount) || 0)));
  const regular = count - shinyCount;
  if (regular < qty) return false;
  const nextCount = count - qty;
  if (nextCount <= 0) {
    delete cards[cardId];
  } else {
    cards[cardId] = {
      ...entry,
      count: nextCount,
      shinyCount,
    };
  }
  return true;
}

async function listCardTrades(db, uid) {
  const [openSnap, completedSnap, saveSnap] = await Promise.all([
    db.collection(CARD_TRADES_COLLECTION).where('status', '==', 'open').limit(100).get(),
    db.collection(CARD_TRADES_COLLECTION).where('status', '==', 'completed').limit(100).get(),
    uid ? db.collection('coach_capitalist_saves').doc(uid).get() : Promise.resolve(null),
  ]);

  const openTrades = openSnap.docs
    .map((doc) => ({ id: doc.id, ...(doc.data() || {}) }))
    .sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0))
    .slice(0, 50);

  const myRecentCompleted = completedSnap.docs
    .map((doc) => ({ id: doc.id, ...(doc.data() || {}) }))
    .filter((t) => uid && (t.sellerUid === uid || t.buyerUid === uid))
    .sort((a, b) => (Number(b.completedAt) || 0) - (Number(a.completedAt) || 0))
    .slice(0, 10);

  const saveData = saveSnap && saveSnap.exists ? (saveSnap.data() || {}) : {};
  const cards = sanitizeCardsMap(saveData.state?.cards);
  const cardsRev = Math.max(
    Number(saveData.cardsRev) || 0,
    Number(saveData.state?.cardsRev) || 0,
  );

  return {
    openTrades,
    recentCompleted: myRecentCompleted,
    cards,
    cardsRev,
  };
}

async function forgeShinyCard(db, {
  uid,
  mode = 'targeted',
  cardId = '',
  sacrificeIds = [],
  FieldValue,
}) {
  const cleanMode = mode === 'random' ? 'random' : 'targeted';
  const now = Date.now();
  const saveRef = db.collection('coach_capitalist_saves').doc(uid);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(saveRef);
    const saveData = snap.exists ? (snap.data() || {}) : {};
    const state = saveData.state && typeof saveData.state === 'object'
      ? { ...saveData.state }
      : emptyStarterState(now);
    const cards = sanitizeCardsMap(state.cards);

    let forgedCardId = '';

    if (cleanMode === 'targeted') {
      const targetId = String(cardId || '').trim();
      if (!VALID_CARD_ID_SET.has(targetId)) {
        const err = new Error('Select a valid card to forge.');
        err.status = 400;
        throw err;
      }
      if (!removeRegularCardFromMap(cards, targetId, 5)) {
        const err = new Error('You need at least 5 standard copies of that card to forge a Shiny.');
        err.status = 400;
        throw err;
      }
      addCardToMap(cards, targetId, { shiny: true, now });
      forgedCardId = targetId;
    } else {
      const ids = Array.isArray(sacrificeIds)
        ? sacrificeIds.map((id) => String(id || '').trim()).filter(Boolean)
        : [];
      if (ids.length !== 5 || ids.some((id) => !VALID_CARD_ID_SET.has(id))) {
        const err = new Error('Select exactly 5 valid duplicate cards to feed into the Workshop Press.');
        err.status = 400;
        throw err;
      }
      const countsNeeded = {};
      for (const id of ids) {
        countsNeeded[id] = (countsNeeded[id] || 0) + 1;
      }
      for (const [id, needed] of Object.entries(countsNeeded)) {
        if (!removeRegularCardFromMap(cards, id, needed)) {
          const err = new Error(`Not enough standard copies of ${id} to forge.`);
          err.status = 400;
          throw err;
        }
      }
      const unownedShinies = VALID_CARD_IDS.filter((id) => !(cards[id]?.shinyCount > 0));
      const pool = unownedShinies.length > 0 ? unownedShinies : VALID_CARD_IDS;
      forgedCardId = pool[Math.floor(Math.random() * pool.length)];
      addCardToMap(cards, forgedCardId, { shiny: true, now });
    }

    const nextRev = Math.max(
      Number(saveData.cardsRev) || 0,
      Number(state.cardsRev) || 0,
    ) + 1;
    state.cards = cards;
    state.cardsRev = nextRev;

    tx.set(saveRef, {
      uid,
      state,
      cardsRev: nextRev,
      updatedAt: FieldValue ? FieldValue.serverTimestamp() : now,
    }, { merge: true });

    return {
      ok: true,
      mode: cleanMode,
      forgedCardId,
      cards,
      cardsRev: nextRev,
    };
  });
}

async function createCardTrade(db, {
  uid,
  fullName = 'Operator',
  offerCardId,
  wantCardId,
  FieldValue,
}) {
  const offer = String(offerCardId || '').trim();
  const want = String(wantCardId || '').trim();
  if (!VALID_CARD_ID_SET.has(offer) || !VALID_CARD_ID_SET.has(want)) {
    const err = new Error('Please choose valid cards to offer and request.');
    err.status = 400;
    throw err;
  }
  if (offer === want) {
    const err = new Error('You must request a different card than the one you are offering.');
    err.status = 400;
    throw err;
  }

  const now = Date.now();
  const saveRef = db.collection('coach_capitalist_saves').doc(uid);
  const sellerTradesQuery = db.collection(CARD_TRADES_COLLECTION).where('sellerUid', '==', uid);
  const newTradeRef = db.collection(CARD_TRADES_COLLECTION).doc();

  const listing = await db.runTransaction(async (tx) => {
    const [saveSnap, existingSnap] = await Promise.all([
      tx.get(saveRef),
      tx.get(sellerTradesQuery),
    ]);

    const openCount = existingSnap.docs.filter((d) => d.data()?.status === 'open').length;
    if (openCount >= MAX_OPEN_LISTINGS_PER_SELLER) {
      const err = new Error(`You already have ${MAX_OPEN_LISTINGS_PER_SELLER} open swap listings. Cancel or wait for one to complete first.`);
      err.status = 400;
      throw err;
    }

    const saveData = saveSnap.exists ? (saveSnap.data() || {}) : {};
    const state = saveData.state && typeof saveData.state === 'object'
      ? { ...saveData.state }
      : emptyStarterState(now);
    const cards = sanitizeCardsMap(state.cards);

    if (!removeRegularCardFromMap(cards, offer, 1)) {
      const err = new Error('You do not have a standard copy of that card available to trade.');
      err.status = 400;
      throw err;
    }

    const nextRev = Math.max(
      Number(saveData.cardsRev) || 0,
      Number(state.cardsRev) || 0,
    ) + 1;
    state.cards = cards;
    state.cardsRev = nextRev;

    const tradeDoc = {
      sellerUid: uid,
      sellerName: String(fullName || 'Operator').trim().slice(0, 120) || 'Operator',
      offerCardId: offer,
      wantCardId: want,
      status: 'open',
      createdAt: now,
    };

    tx.set(saveRef, {
      uid,
      state,
      cardsRev: nextRev,
      updatedAt: FieldValue ? FieldValue.serverTimestamp() : now,
    }, { merge: true });
    tx.set(newTradeRef, tradeDoc);

    return {
      trade: { id: newTradeRef.id, ...tradeDoc },
      cards,
      cardsRev: nextRev,
    };
  });

  return { ok: true, ...listing };
}

async function cancelCardTrade(db, { uid, tradeId, FieldValue }) {
  const cleanId = String(tradeId || '').trim();
  if (!cleanId) {
    const err = new Error('tradeId is required.');
    err.status = 400;
    throw err;
  }

  const now = Date.now();
  const tradeRef = db.collection(CARD_TRADES_COLLECTION).doc(cleanId);
  const saveRef = db.collection('coach_capitalist_saves').doc(uid);

  return db.runTransaction(async (tx) => {
    const [tradeSnap, saveSnap] = await Promise.all([
      tx.get(tradeRef),
      tx.get(saveRef),
    ]);
    if (!tradeSnap.exists) {
      const err = new Error('Swap listing not found.');
      err.status = 404;
      throw err;
    }
    const trade = tradeSnap.data() || {};
    if (trade.status !== 'open') {
      const err = new Error('This swap listing is no longer open.');
      err.status = 400;
      throw err;
    }
    if (trade.sellerUid !== uid) {
      const err = new Error('You can only cancel your own swap listings.');
      err.status = 403;
      throw err;
    }

    const saveData = saveSnap.exists ? (saveSnap.data() || {}) : {};
    const state = saveData.state && typeof saveData.state === 'object'
      ? { ...saveData.state }
      : emptyStarterState(now);
    const cards = sanitizeCardsMap(state.cards);
    addCardToMap(cards, trade.offerCardId, { shiny: false, now });

    const nextRev = Math.max(
      Number(saveData.cardsRev) || 0,
      Number(state.cardsRev) || 0,
    ) + 1;
    state.cards = cards;
    state.cardsRev = nextRev;

    tx.set(tradeRef, { status: 'cancelled', cancelledAt: now }, { merge: true });
    tx.set(saveRef, {
      uid,
      state,
      cardsRev: nextRev,
      updatedAt: FieldValue ? FieldValue.serverTimestamp() : now,
    }, { merge: true });

    return { ok: true, cards, cardsRev: nextRev };
  });
}

async function acceptCardTrade(db, {
  uid,
  fullName = 'Operator',
  tradeId,
  FieldValue,
}) {
  const cleanId = String(tradeId || '').trim();
  if (!cleanId) {
    const err = new Error('tradeId is required.');
    err.status = 400;
    throw err;
  }

  const now = Date.now();
  const tradeRef = db.collection(CARD_TRADES_COLLECTION).doc(cleanId);
  const buyerSaveRef = db.collection('coach_capitalist_saves').doc(uid);

  return db.runTransaction(async (tx) => {
    const tradeSnap = await tx.get(tradeRef);
    if (!tradeSnap.exists) {
      const err = new Error('Swap listing not found.');
      err.status = 404;
      throw err;
    }
    const trade = tradeSnap.data() || {};
    if (trade.status !== 'open') {
      const err = new Error('This swap listing has already been claimed or cancelled.');
      err.status = 400;
      throw err;
    }
    if (trade.sellerUid === uid) {
      const err = new Error('You cannot accept your own swap listing.');
      err.status = 400;
      throw err;
    }

    const sellerSaveRef = db.collection('coach_capitalist_saves').doc(trade.sellerUid);
    const [buyerSnap, sellerSnap] = await Promise.all([
      tx.get(buyerSaveRef),
      tx.get(sellerSaveRef),
    ]);

    const buyerData = buyerSnap.exists ? (buyerSnap.data() || {}) : {};
    const buyerState = buyerData.state && typeof buyerData.state === 'object'
      ? { ...buyerData.state }
      : emptyStarterState(now);
    const buyerCards = sanitizeCardsMap(buyerState.cards);

    if (!removeRegularCardFromMap(buyerCards, trade.wantCardId, 1)) {
      const err = new Error('You need at least 1 standard copy of the requested card to complete this swap.');
      err.status = 400;
      throw err;
    }
    addCardToMap(buyerCards, trade.offerCardId, { shiny: false, now });

    const buyerRev = Math.max(
      Number(buyerData.cardsRev) || 0,
      Number(buyerState.cardsRev) || 0,
    ) + 1;
    buyerState.cards = buyerCards;
    buyerState.cardsRev = buyerRev;

    const sellerData = sellerSnap.exists ? (sellerSnap.data() || {}) : {};
    const sellerState = sellerData.state && typeof sellerData.state === 'object'
      ? { ...sellerData.state }
      : emptyStarterState(now);
    const sellerCards = sanitizeCardsMap(sellerState.cards);
    addCardToMap(sellerCards, trade.wantCardId, { shiny: false, now });

    const sellerRev = Math.max(
      Number(sellerData.cardsRev) || 0,
      Number(sellerState.cardsRev) || 0,
    ) + 1;
    sellerState.cards = sellerCards;
    sellerState.cardsRev = sellerRev;

    const cleanBuyerName = String(fullName || 'Operator').trim().slice(0, 120) || 'Operator';

    tx.set(tradeRef, {
      status: 'completed',
      buyerUid: uid,
      buyerName: cleanBuyerName,
      completedAt: now,
    }, { merge: true });
    tx.set(buyerSaveRef, {
      uid,
      state: buyerState,
      cardsRev: buyerRev,
      updatedAt: FieldValue ? FieldValue.serverTimestamp() : now,
    }, { merge: true });
    tx.set(sellerSaveRef, {
      uid: trade.sellerUid,
      state: sellerState,
      cardsRev: sellerRev,
      updatedAt: FieldValue ? FieldValue.serverTimestamp() : now,
    }, { merge: true });

    return {
      ok: true,
      receivedCardId: trade.offerCardId,
      givenCardId: trade.wantCardId,
      cards: buyerCards,
      cardsRev: buyerRev,
    };
  });
}

module.exports = {
  VALID_CARD_IDS,
  VALID_CARD_ID_SET,
  listCardTrades,
  forgeShinyCard,
  createCardTrade,
  cancelCardTrade,
  acceptCardTrade,
};
