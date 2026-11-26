'use strict';

const {
  DISPATCH_COLLECTION,
  CHIPS_COLLECTION,
  getLondonDayKey,
  getLondonWeekKey,
  emptyStarterState,
} = require('./coachCapitalistPlay');
const { isLondonWeekend } = require('./coachCapitalistSyndicate');

const STARTING_WEEKLY_CHIPS = 100;
const SYNDICATE_BONUS_CHIPS = 15;
const MAX_DAILY_SWITCHES = 2;

const ROUTE_VARIANTS = {
  local_boost: [
    {
      title: 'School Run Surge',
      corridor: 'Northamptonshire & Village School Circuits',
      desc: 'Boosts Local Depot profits across all 10 yard vehicles.',
      icon: '🎒',
    },
    {
      title: 'Market Town Shuttles',
      corridor: 'County High Street & Rural Hopper Loops',
      desc: 'Boosts Local Depot profits across all 10 yard vehicles.',
      icon: '🚐',
    },
    {
      title: 'Matchday Park & Shuttle',
      corridor: 'Local Stadium & Town Centre Feeder Runs',
      desc: 'Boosts Local Depot profits across all 10 yard vehicles.',
      icon: '⚽',
    },
  ],
  regional_boost: [
    {
      title: 'Heathrow T5 Diversions',
      corridor: 'M1 / M25 Airport Emergency Uplift',
      desc: 'Boosts Regional Hub profits across all 10 regional routes.',
      icon: '✈️',
    },
    {
      title: 'Cotswolds & Manor Weddings',
      corridor: 'Regional VIP Hospitality & Touring Loop',
      desc: 'Boosts Regional Hub profits across all 10 regional routes.',
      icon: '🥂',
    },
    {
      title: 'Midlands Park & Ride Blitz',
      corridor: 'Inter-County Commuter Rapid Corridors',
      desc: 'Boosts Regional Hub profits across all 10 regional routes.',
      icon: '🅿️',
    },
  ],
  national_boost: [
    {
      title: 'Wembley Away-Day Convoy',
      corridor: 'National Motorway Trunking & Fan Coaches',
      desc: 'Boosts National Network profits across all 9 national arms.',
      icon: '🏟️',
    },
    {
      title: 'Cross-Channel Eurostar Relief',
      corridor: 'Dover / Folkestone Continental Trunking',
      desc: 'Boosts National Network profits across all 9 national arms.',
      icon: '🚄',
    },
    {
      title: 'Edinburgh Fringe Megarun',
      corridor: 'M6 / A1 Northbound Express Contracts',
      desc: 'Boosts National Network profits across all 9 national arms.',
      icon: '🎭',
    },
  ],
  away_boost: [
    {
      title: 'Overnight Rail Replacement',
      corridor: 'Network Rail Possession Standby Roster',
      desc: 'Multiplies Offline Away Earnings while your tab is closed or capped.',
      icon: '🌙',
    },
    {
      title: 'Night Freight & Crew Transfers',
      corridor: '24/7 Airport & Logistics Shift Swaps',
      desc: 'Multiplies Offline Away Earnings while your tab is closed or capped.',
      icon: '🦉',
    },
    {
      title: 'Twilight Sleeper Trunk',
      corridor: 'Overnight Intercity Depot Transfers',
      desc: 'Multiplies Offline Away Earnings while your tab is closed or capped.',
      icon: '🛏️',
    },
  ],
  backer_boost: [
    {
      title: 'Private Equity Roadshow',
      corridor: 'City of London Investor Showcase Charter',
      desc: 'Boosts Silent Backer efficacy (+25% to +100% extra per backer).',
      icon: '💼',
    },
    {
      title: 'Boardroom Fleet Inspection',
      corridor: 'Institutional Transport Fund Tour',
      desc: 'Boosts Silent Backer efficacy (+25% to +100% extra per backer).',
      icon: '📈',
    },
    {
      title: 'Sovereign Fleet Pitch',
      corridor: 'Executive Syndicate Capital Tour',
      desc: 'Boosts Silent Backer efficacy (+25% to +100% extra per backer).',
      icon: '🏦',
    },
  ],
};

const ROUTE_SLOTS = [
  {
    id: 'local_boost',
    depotId: 'local',
    effectType: 'depot_profit',
    effectTargetLabel: 'Local Depot Profit',
    synergyCardId: 'card-schoolrun-sally',
    synergyCardName: 'School Run Sally',
  },
  {
    id: 'regional_boost',
    depotId: 'regional',
    effectType: 'depot_profit',
    effectTargetLabel: 'Regional Hub Profit',
    synergyCardId: 'card-airport-shuttle',
    synergyCardName: 'Sky-Shuttle Express',
  },
  {
    id: 'national_boost',
    depotId: 'national',
    effectType: 'depot_profit',
    effectTargetLabel: 'National Network Profit',
    synergyCardId: 'card-pete-silverstone',
    synergyCardName: 'Grand Prix Pete',
  },
  {
    id: 'away_boost',
    depotId: null,
    effectType: 'away_mult',
    effectTargetLabel: 'Offline Away Earnings',
    synergyCardId: 'card-nightshift-gary',
    synergyCardName: 'Night Shifter Gary',
  },
  {
    id: 'backer_boost',
    depotId: null,
    effectType: 'angel_mult',
    effectTargetLabel: 'Backer Strength Bonus',
    synergyCardId: 'card-lion-trophy',
    synergyCardName: 'Coach Operator Cup',
  },
];

const GOLDEN_TENDER_CATALOG = [
  {
    id: 'gt-silverstone-vip',
    title: '🏎️ Silverstone Paddock VIP',
    client: 'Formula 1 British Grand Prix Hospitality',
    desc: 'Exclusive circuit infield shuttle tender. Huge visibility and priority motorway clearance.',
  },
  {
    id: 'gt-royal-ascot',
    title: '🎩 Royal Ascot Royal Enclosure',
    client: 'Ascot Racecourse VIP Concierge',
    desc: 'White-glove executive fleet convoy from Mayfair to Berkshire.',
  },
  {
    id: 'gt-glastonbury-artists',
    title: '🎸 Glastonbury Artist Transfers',
    client: 'Worthy Farm Headliner Logistics',
    desc: '24/7 sleeper & VIP artist fleet operations across Somerset.',
  },
  {
    id: 'gt-champions-final',
    title: '🏆 Wembley Champions VIP Grid',
    client: 'UEFA & Wembley Stadium Operations',
    desc: 'Priority police-escorted coach lanes for tournament VIPs.',
  },
  {
    id: 'gt-farnborough-airshow',
    title: '✈️ Farnborough Airshow Executive Charter',
    client: 'Aerospace Trade Delegation',
    desc: 'High-security tarmac transfers for international aviation executives.',
  },
];

function computeRouteMultiplier(operatorCount) {
  const count = Math.max(0, Math.floor(Number(operatorCount) || 0));
  if (count <= 2) {
    return { mult: 4.0, status: 'surge', label: '🔥 Driver Shortage Surge' };
  }
  if (count <= 4) {
    return { mult: 2.5, status: 'healthy', label: '✅ Healthy Margin' };
  }
  return { mult: 1.4, status: 'flooded', label: '⚠️ Route Flooded' };
}

function dayIndexFromKey(dayKey) {
  const parts = String(dayKey || '').split('-').map(Number);
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return 0;
  const utc = Date.UTC(parts[0], parts[1] - 1, parts[2]);
  return Math.floor(utc / 86400000);
}

function getLondonClockMs(dayKey, hour = 13, minute = 0) {
  const [y, m, d] = String(dayKey || '').split('-').map(Number);
  if (!y || !m || !d) return Date.now();
  const noonUtc = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const londonHourStr = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    hour: 'numeric',
    hour12: false,
  }).format(noonUtc);
  const londonHour = parseInt(londonHourStr, 10);
  const offsetHours = (londonHour === 24 ? 0 : londonHour) - 12;
  const utcHour = hour - offsetHours;
  return Date.UTC(y, m - 1, d, utcHour, minute, 0, 0);
}

function buildInitialDispatchDoc(dayKey) {
  const dayIdx = Math.abs(dayIndexFromKey(dayKey));
  const routes = {};
  for (let i = 0; i < ROUTE_SLOTS.length; i += 1) {
    const slot = ROUTE_SLOTS[i];
    const variants = ROUTE_VARIANTS[slot.id] || [];
    const variant = variants[(dayIdx + i) % variants.length] || {
      title: slot.id,
      corridor: 'UK National Network',
      desc: slot.effectTargetLabel,
      icon: '🚌',
    };
    routes[slot.id] = {
      id: slot.id,
      depotId: slot.depotId,
      effectType: slot.effectType,
      effectTargetLabel: slot.effectTargetLabel,
      synergyCardId: slot.synergyCardId,
      synergyCardName: slot.synergyCardName,
      title: variant.title,
      corridor: variant.corridor,
      desc: variant.desc,
      icon: variant.icon,
      operators: {},
    };
  }

  const tenderTpl = GOLDEN_TENDER_CATALOG[dayIdx % GOLDEN_TENDER_CATALOG.length];
  const opensAtMs = getLondonClockMs(dayKey, 5, 0);
  const closesAtMs = getLondonClockMs(dayKey, 13, 0);

  return {
    dayKey,
    createdAt: Date.now(),
    switchesByUid: {},
    routes,
    goldenTender: {
      ...tenderTpl,
      dayKey,
      opensAtMs,
      closesAtMs,
      status: 'open', // 'open' | 'awarded'
      winner: null,
      runnerUp: null,
      bidderCount: 0,
      resolvedAt: null,
    },
    goldenTenderBids: {},
  };
}

function chipsDocId(uid, weekKey) {
  return `${uid}_${weekKey}`;
}

async function ensureChipsDoc(db, uid, weekKey, FieldValue) {
  const cleanUid = String(uid || '').trim();
  const cleanWeek = String(weekKey || '').trim() || getLondonWeekKey();
  const ref = db.collection(CHIPS_COLLECTION).doc(chipsDocId(cleanUid, cleanWeek));
  const snap = await ref.get();
  if (snap.exists) {
    const data = snap.data() || {};
    return {
      uid: cleanUid,
      weekKey: cleanWeek,
      balance: Math.max(0, Math.floor(Number(data.balance) || 0)),
      earnedBonus: Math.max(0, Math.floor(Number(data.earnedBonus) || 0)),
      spent: Math.max(0, Math.floor(Number(data.spent) || 0)),
    };
  }
  const initial = {
    uid: cleanUid,
    weekKey: cleanWeek,
    balance: STARTING_WEEKLY_CHIPS,
    earnedBonus: 0,
    spent: 0,
    updatedAt: FieldValue ? FieldValue.serverTimestamp() : Date.now(),
  };
  await ref.set(initial, { merge: true });
  return {
    uid: cleanUid,
    weekKey: cleanWeek,
    balance: STARTING_WEEKLY_CHIPS,
    earnedBonus: 0,
    spent: 0,
  };
}

async function awardSyndicateTenderChips(db, {
  uid,
  amount = SYNDICATE_BONUS_CHIPS,
  weekKey = getLondonWeekKey(),
  FieldValue,
}) {
  const cleanUid = String(uid || '').trim();
  const bonus = Math.max(0, Math.floor(Number(amount) || 0));
  if (!cleanUid || !bonus || !weekKey) return null;
  const ref = db.collection(CHIPS_COLLECTION).doc(chipsDocId(cleanUid, weekKey));
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const prev = snap.exists ? (snap.data() || {}) : null;
    const prevBal = prev ? Math.max(0, Math.floor(Number(prev.balance) || 0)) : STARTING_WEEKLY_CHIPS;
    const prevBonus = prev ? Math.max(0, Math.floor(Number(prev.earnedBonus) || 0)) : 0;
    const prevSpent = prev ? Math.max(0, Math.floor(Number(prev.spent) || 0)) : 0;
    const nextBal = prevBal + bonus;
    const nextBonus = prevBonus + bonus;
    tx.set(ref, {
      uid: cleanUid,
      weekKey,
      balance: nextBal,
      earnedBonus: nextBonus,
      spent: prevSpent,
      updatedAt: FieldValue ? FieldValue.serverTimestamp() : Date.now(),
    }, { merge: true });
    return { balance: nextBal, earnedBonus: nextBonus, awarded: bonus };
  });
}

async function getOrCreateDispatchDoc(db, dayKey = getLondonDayKey()) {
  const ref = db.collection(DISPATCH_COLLECTION).doc(dayKey);
  const snap = await ref.get();
  if (snap.exists) {
    return { ref, data: snap.data() || {} };
  }
  const initial = buildInitialDispatchDoc(dayKey);
  try {
    await ref.create(initial);
    return { ref, data: initial };
  } catch {
    const retry = await ref.get();
    return { ref, data: retry.exists ? (retry.data() || {}) : initial };
  }
}

async function maybeResolveGoldenTender(db, {
  dayKey = getLondonDayKey(),
  weekKey = getLondonWeekKey(dayKey),
  forceResolve = false,
  FieldValue = null,
}) {
  const dispatchRef = db.collection(DISPATCH_COLLECTION).doc(dayKey);
  const now = Date.now();
  const preSnap = await dispatchRef.get();
  if (!preSnap.exists) return null;
  const preData = preSnap.data() || {};
  const tender = preData.goldenTender || {};
  if (tender.status !== 'open') return preData;
  if (!forceResolve && now < (Number(tender.closesAtMs) || 0)) return preData;

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(dispatchRef);
    if (!snap.exists) return null;
    const data = snap.data() || {};
    const gt = data.goldenTender || {};
    if (gt.status !== 'open') return data;
    if (!forceResolve && now < (Number(gt.closesAtMs) || 0)) return data;

    const bidsMap = data.goldenTenderBids && typeof data.goldenTenderBids === 'object'
      ? data.goldenTenderBids
      : {};
    const ranked = Object.entries(bidsMap)
      .map(([uid, entry]) => ({
        uid,
        fullName: String(entry?.fullName || 'Operator'),
        amount: Math.max(0, Math.floor(Number(entry?.amount) || 0)),
        placedAt: Number(entry?.placedAt) || 0,
      }))
      .filter((b) => b.amount > 0)
      .sort((a, b) => {
        if (b.amount !== a.amount) return b.amount - a.amount;
        return a.placedAt - b.placedAt;
      });

    const first = ranked[0] || null;
    const second = ranked[1] || null;

    let winnerChipsRef = null;
    let winnerChipsSnap = null;
    if (first) {
      winnerChipsRef = db.collection(CHIPS_COLLECTION).doc(chipsDocId(first.uid, weekKey));
      winnerChipsSnap = await tx.get(winnerChipsRef);
    }

    if (first && winnerChipsRef) {
      const cData = winnerChipsSnap && winnerChipsSnap.exists ? (winnerChipsSnap.data() || {}) : null;
      const curBal = cData ? Math.max(0, Math.floor(Number(cData.balance) || 0)) : STARTING_WEEKLY_CHIPS;
      const curSpent = cData ? Math.max(0, Math.floor(Number(cData.spent) || 0)) : 0;
      const curEarnedBonus = cData ? Math.max(0, Math.floor(Number(cData.earnedBonus) || 0)) : 0;
      const deduct = Math.min(curBal, first.amount);
      tx.set(winnerChipsRef, {
        uid: first.uid,
        weekKey,
        balance: Math.max(0, curBal - deduct),
        spent: curSpent + deduct,
        earnedBonus: curEarnedBonus,
        updatedAt: FieldValue ? FieldValue.serverTimestamp() : now,
      }, { merge: true });
    }

    const updatedTender = {
      ...gt,
      status: 'awarded',
      winner: first
        ? { uid: first.uid, fullName: first.fullName, bid: first.amount, claimed: false }
        : null,
      runnerUp: second
        ? { uid: second.uid, fullName: second.fullName, bid: second.amount, claimed: false }
        : null,
      bidderCount: ranked.length,
      resolvedAt: now,
    };

    tx.set(dispatchRef, { goldenTender: updatedTender }, { merge: true });
    return { ...data, goldenTender: updatedTender };
  });
}

function serializeTrafficOffice(docData, uid, chips, now = Date.now()) {
  const routesObj = docData?.routes && typeof docData.routes === 'object' ? docData.routes : {};
  let myRouteId = null;

  const routes = ROUTE_SLOTS.map((slot) => {
    const r = routesObj[slot.id] || {};
    const opsMap = r.operators && typeof r.operators === 'object' ? r.operators : {};
    const operatorsList = Object.entries(opsMap).map(([opUid, op]) => ({
      uid: opUid,
      fullName: String(op?.fullName || 'Operator'),
      assignedAt: Number(op?.assignedAt) || 0,
    })).sort((a, b) => a.assignedAt - b.assignedAt);

    if (uid && opsMap[uid]) {
      myRouteId = slot.id;
    }

    const rate = computeRouteMultiplier(operatorsList.length);
    return {
      id: slot.id,
      depotId: slot.depotId,
      effectType: slot.effectType,
      effectTargetLabel: slot.effectTargetLabel,
      synergyCardId: slot.synergyCardId,
      synergyCardName: slot.synergyCardName,
      title: r.title || slot.id,
      corridor: r.corridor || '',
      desc: r.desc || slot.effectTargetLabel,
      icon: r.icon || '🚌',
      operatorCount: operatorsList.length,
      operators: operatorsList,
      multiplier: rate.mult,
      demandStatus: rate.status,
      demandLabel: rate.label,
    };
  });

  const switchesUsed = Math.max(0, Math.floor(Number(docData?.switchesByUid?.[uid]) || 0));
  const gt = docData?.goldenTender || {};
  const bidsMap = docData?.goldenTenderBids && typeof docData.goldenTenderBids === 'object'
    ? docData.goldenTenderBids
    : {};
  const myBidEntry = uid && bidsMap[uid] ? bidsMap[uid] : null;

  return {
    dayKey: docData?.dayKey || getLondonDayKey(now),
    weekKey: chips?.weekKey || getLondonWeekKey(docData?.dayKey || getLondonDayKey(now)),
    isWeekend: isLondonWeekend(now),
    serverNow: now,
    routes,
    myRouteId,
    switchesUsed,
    switchesRemaining: Math.max(0, MAX_DAILY_SWITCHES - switchesUsed),
    maxDailySwitches: MAX_DAILY_SWITCHES,
    chips: chips || {
      uid,
      weekKey: getLondonWeekKey(),
      balance: STARTING_WEEKLY_CHIPS,
      earnedBonus: 0,
      spent: 0,
    },
    goldenTender: {
      id: gt.id || '',
      title: gt.title || 'Golden Tender',
      client: gt.client || '',
      desc: gt.desc || '',
      dayKey: gt.dayKey || docData?.dayKey || '',
      opensAtMs: Number(gt.opensAtMs) || 0,
      closesAtMs: Number(gt.closesAtMs) || 0,
      status: gt.status || 'open',
      winner: gt.winner || null,
      runnerUp: gt.runnerUp || null,
      bidderCount: gt.status === 'open'
        ? Object.keys(bidsMap).filter((k) => (Number(bidsMap[k]?.amount) || 0) > 0).length
        : (Number(gt.bidderCount) || 0),
      resolvedAt: gt.resolvedAt || null,
      myBid: myBidEntry ? Math.max(0, Math.floor(Number(myBidEntry.amount) || 0)) : 0,
    },
  };
}

async function getTrafficOfficeState(db, { uid, FieldValue }) {
  const now = Date.now();
  const dayKey = getLondonDayKey(now);
  const weekKey = getLondonWeekKey(dayKey);

  const [{ data }, chips] = await Promise.all([
    getOrCreateDispatchDoc(db, dayKey),
    ensureChipsDoc(db, uid, weekKey, FieldValue),
  ]);

  let current = data;
  if (current?.goldenTender?.status === 'open' && now >= (Number(current.goldenTender.closesAtMs) || 0)) {
    const resolved = await maybeResolveGoldenTender(db, { dayKey, weekKey, FieldValue });
    if (resolved) current = resolved;
  }

  // Re-read chips if caller just won and had chips deducted
  const latestChips = current?.goldenTender?.winner?.uid === uid && current?.goldenTender?.resolvedAt
    ? await ensureChipsDoc(db, uid, weekKey, FieldValue)
    : chips;

  return serializeTrafficOffice(current, uid, latestChips, Date.now());
}

async function assignDispatchRoute(db, { uid, fullName, routeId, FieldValue }) {
  const cleanRouteId = String(routeId || '').trim();
  if (!ROUTE_SLOTS.some((s) => s.id === cleanRouteId)) {
    const err = new Error('Invalid dispatch corridor selected.');
    err.status = 400;
    throw err;
  }
  const now = Date.now();
  if (isLondonWeekend(now)) {
    const err = new Error('Traffic Office dispatches Monday to Friday.');
    err.status = 400;
    throw err;
  }
  const dayKey = getLondonDayKey(now);
  const weekKey = getLondonWeekKey(dayKey);
  await getOrCreateDispatchDoc(db, dayKey);
  const dispatchRef = db.collection(DISPATCH_COLLECTION).doc(dayKey);

  const updatedData = await db.runTransaction(async (tx) => {
    const snap = await tx.get(dispatchRef);
    const data = snap.exists ? (snap.data() || {}) : buildInitialDispatchDoc(dayKey);
    const routes = { ...(data.routes || {}) };
    const switchesByUid = { ...(data.switchesByUid || {}) };

    let currentRouteId = null;
    for (const slot of ROUTE_SLOTS) {
      if (routes[slot.id]?.operators?.[uid]) {
        currentRouteId = slot.id;
        break;
      }
    }

    if (currentRouteId === cleanRouteId) {
      return data;
    }

    const switchesUsed = Math.max(0, Math.floor(Number(switchesByUid[uid]) || 0));
    if (currentRouteId) {
      if (switchesUsed >= MAX_DAILY_SWITCHES) {
        const err = new Error(`You have used all ${MAX_DAILY_SWITCHES} route switches for today.`);
        err.status = 400;
        throw err;
      }
      switchesByUid[uid] = switchesUsed + 1;
      const oldRoute = { ...(routes[currentRouteId] || {}) };
      const oldOps = { ...(oldRoute.operators || {}) };
      delete oldOps[uid];
      routes[currentRouteId] = { ...oldRoute, operators: oldOps };
    }

    const targetRoute = { ...(routes[cleanRouteId] || {}) };
    const targetOps = { ...(targetRoute.operators || {}) };
    targetOps[uid] = {
      fullName: String(fullName || 'Operator').trim().slice(0, 120) || 'Operator',
      assignedAt: now,
    };
    routes[cleanRouteId] = { ...targetRoute, operators: targetOps };

    const nextDoc = { ...data, routes, switchesByUid };
    tx.set(dispatchRef, { routes, switchesByUid }, { merge: true });
    return nextDoc;
  });

  const chips = await ensureChipsDoc(db, uid, weekKey, FieldValue);
  return serializeTrafficOffice(updatedData, uid, chips, Date.now());
}

async function placeGoldenTenderBid(db, { uid, fullName, amount, FieldValue }) {
  const bid = Math.floor(Number(amount) || 0);
  if (!Number.isFinite(bid) || bid < 1) {
    const err = new Error('Bid must be at least 1 Tender Chip.');
    err.status = 400;
    throw err;
  }
  const now = Date.now();
  if (isLondonWeekend(now)) {
    const err = new Error('Golden Tender auctions run Monday to Friday.');
    err.status = 400;
    throw err;
  }
  const dayKey = getLondonDayKey(now);
  const weekKey = getLondonWeekKey(dayKey);
  await getOrCreateDispatchDoc(db, dayKey);
  const chips = await ensureChipsDoc(db, uid, weekKey, FieldValue);

  const dispatchRef = db.collection(DISPATCH_COLLECTION).doc(dayKey);
  const chipsRef = db.collection(CHIPS_COLLECTION).doc(chipsDocId(uid, weekKey));

  const updatedData = await db.runTransaction(async (tx) => {
    const [dispatchSnap, chipsSnap] = await Promise.all([
      tx.get(dispatchRef),
      tx.get(chipsRef),
    ]);
    const data = dispatchSnap.exists ? (dispatchSnap.data() || {}) : buildInitialDispatchDoc(dayKey);
    const gt = data.goldenTender || {};
    if (gt.status !== 'open' || now >= (Number(gt.closesAtMs) || 0)) {
      const err = new Error('Today’s Golden Tender bidding has already closed.');
      err.status = 400;
      throw err;
    }
    const bal = chipsSnap.exists
      ? Math.max(0, Math.floor(Number(chipsSnap.data()?.balance) || 0))
      : STARTING_WEEKLY_CHIPS;
    if (bid > bal) {
      const err = new Error(`Insufficient Tender Chips. You have ${bal} chips available this week.`);
      err.status = 400;
      throw err;
    }

    const bidsMap = { ...(data.goldenTenderBids || {}) };
    bidsMap[uid] = {
      amount: bid,
      fullName: String(fullName || 'Operator').trim().slice(0, 120) || 'Operator',
      placedAt: now,
    };
    const nextCount = Object.keys(bidsMap).filter((k) => (Number(bidsMap[k]?.amount) || 0) > 0).length;
    const nextTender = { ...gt, bidderCount: nextCount };

    tx.set(dispatchRef, {
      goldenTenderBids: bidsMap,
      goldenTender: nextTender,
    }, { merge: true });

    return { ...data, goldenTenderBids: bidsMap, goldenTender: nextTender };
  });

  return serializeTrafficOffice(updatedData, uid, chips, Date.now());
}

async function claimGoldenTenderReward(db, { uid, FieldValue }) {
  const now = Date.now();
  const dayKey = getLondonDayKey(now);
  const weekKey = getLondonWeekKey(dayKey);
  const dispatchRef = db.collection(DISPATCH_COLLECTION).doc(dayKey);
  const saveRef = db.collection('coach_capitalist_saves').doc(uid);

  const txResult = await db.runTransaction(async (tx) => {
    const [dispatchSnap, saveSnap] = await Promise.all([
      tx.get(dispatchRef),
      tx.get(saveRef),
    ]);
    if (!dispatchSnap.exists) {
      const err = new Error('No Golden Tender found for today.');
      err.status = 404;
      throw err;
    }
    const data = dispatchSnap.data() || {};
    const gt = data.goldenTender || {};
    if (gt.status !== 'awarded') {
      const err = new Error('Golden Tender has not been awarded yet.');
      err.status = 400;
      throw err;
    }

    const isWinner = gt.winner?.uid === uid;
    const isRunnerUp = !isWinner && gt.runnerUp?.uid === uid;
    if (!isWinner && !isRunnerUp) {
      const err = new Error('No unclaimed Golden Tender prize for your account today.');
      err.status = 400;
      throw err;
    }
    if ((isWinner && gt.winner?.claimed) || (isRunnerUp && gt.runnerUp?.claimed)) {
      const err = new Error('You have already claimed today’s Golden Tender reward.');
      err.status = 400;
      throw err;
    }

    const saveData = saveSnap.exists ? (saveSnap.data() || {}) : {};
    const curState = saveData.state && typeof saveData.state === 'object'
      ? { ...saveData.state }
      : emptyStarterState(now);

    const packsAwarded = isWinner ? 2 : 1;
    const speedMult = isWinner ? 3.5 : 2.0;
    const durationMs = isWinner ? (24 * 3600 * 1000) : (6 * 3600 * 1000);

    curState.unopenedPacks = Math.max(0, Math.floor(Number(curState.unopenedPacks) || 0)) + packsAwarded;
    curState.goldenTenderUntil = Math.max(Number(curState.goldenTenderUntil) || 0, now) + durationMs;
    curState.goldenTenderSpeedMult = Math.max(Number(curState.goldenTenderSpeedMult) || 1, speedMult);

    if (isWinner) {
      curState.goldenTendersWon = Math.max(0, Math.floor(Number(curState.goldenTendersWon) || 0)) + 1;
      curState.goldenTenderImmuneUntil = Math.max(Number(curState.goldenTenderImmuneUntil) || 0, now) + durationMs;
    }

    const nextTender = {
      ...gt,
      ...(isWinner ? { winner: { ...gt.winner, claimed: true, claimedAt: now } } : {}),
      ...(isRunnerUp ? { runnerUp: { ...gt.runnerUp, claimed: true, claimedAt: now } } : {}),
    };

    tx.set(dispatchRef, { goldenTender: nextTender }, { merge: true });
    tx.set(saveRef, {
      uid,
      state: curState,
      goldenTendersWon: Math.max(0, Math.floor(Number(curState.goldenTendersWon) || 0)),
      updatedAt: FieldValue ? FieldValue.serverTimestamp() : now,
    }, { merge: true });

    return {
      dispatchData: { ...data, goldenTender: nextTender },
      state: curState,
      tier: isWinner ? 'winner' : 'runner_up',
      packsAwarded,
      speedMult,
      durationHours: isWinner ? 24 : 6,
      breakdownImmunity: isWinner,
    };
  });

  const chips = await ensureChipsDoc(db, uid, weekKey, FieldValue);
  return {
    ok: true,
    tier: txResult.tier,
    packsAwarded: txResult.packsAwarded,
    speedMult: txResult.speedMult,
    durationHours: txResult.durationHours,
    breakdownImmunity: txResult.breakdownImmunity,
    state: txResult.state,
    trafficOffice: serializeTrafficOffice(txResult.dispatchData, uid, chips, Date.now()),
  };
}

module.exports = {
  STARTING_WEEKLY_CHIPS,
  SYNDICATE_BONUS_CHIPS,
  MAX_DAILY_SWITCHES,
  ROUTE_SLOTS,
  computeRouteMultiplier,
  awardSyndicateTenderChips,
  getOrCreateDispatchDoc,
  maybeResolveGoldenTender,
  getTrafficOfficeState,
  assignDispatchRoute,
  placeGoldenTenderBid,
  claimGoldenTenderReward,
};
