'use strict';

const { getLondonDayKey } = require('./coachCapitalistPlay');

/**
 * Coach Capitalist Syndicate Contracts:
 * Rotating corporate tenders active Monday to Friday.
 * Escalate in contribution targets (Cash + Donated Fleet Vehicles).
 * Random sponsor rewards: Vehicles grants, Manager promotions, Super Frenzy perks, Mega Dividends!
 */

const SPONSOR_REWARDS_POOL = [
  {
    id: 'reward-fleet-grant',
    type: 'vehicles',
    icon: '🚌',
    title: 'Fleet Delivery Grant: +15 Brand New Cheetah XL Coaches',
    desc: 'The corporate sponsor delivers 15 high-spec Cheetah XL coaches directly into your Local Depot yard!',
    details: { depotId: 'local', businessIndex: 3, vehicleName: 'Brand New Cheetah XL', count: 15 },
  },
  {
    id: 'reward-executive-grant',
    type: 'vehicles',
    icon: '🚍',
    title: 'Executive Delivery: +5 Brand New Team Spec Tri-Axle Coaches',
    desc: 'The corporate sponsor gifts 5 flagship Brand New Team Spec Tri-Axles directly into your fleet yard!',
    details: { depotId: 'local', businessIndex: 9, vehicleName: 'Brand New Team Spec Tri-Axle', count: 5 },
  },
  {
    id: 'reward-manager-academy',
    type: 'managers',
    icon: '🎓',
    title: 'Dispatch Academy: +1 Manager Level Promotion',
    desc: 'Corporate sponsors upgrade training for all depot managers, advancing their efficiency levels by +1!',
    details: { promoteAllBy: 1 },
  },
  {
    id: 'reward-super-frenzy',
    type: 'perks',
    icon: '⚡',
    title: '24-Hour 3× Super Overdrive Perk',
    desc: 'Priority route clearance granted! 24 hours of 3× fleet speed across your active depot!',
    details: { perkKind: 'frenzy', durationHours: 24, speedMult: 3 },
  },
  {
    id: 'reward-fuel-subsidy',
    type: 'perks',
    icon: '⛽',
    title: 'Fuel Card Subsidy: 24-Hour 2× Route Speed',
    desc: 'Bulk wholesale fuel grant active! 24 hours of 2× accelerated route production!',
    details: { perkKind: 'frenzy', durationHours: 24, speedMult: 2 },
  },
  {
    id: 'reward-mega-dividend',
    type: 'cash_bonus',
    icon: '💎',
    title: 'Golden Mega-Dividend: 20× Cash Return!',
    desc: 'Record event profits! Payout upgraded to an extraordinary 20× return on all cash pledged!',
    details: { cashReturnMult: 20 },
  },
];

const SYNDICATE_CONTRACTS_CATALOG = [
  {
    id: 'contract-sport-sponsorship',
    title: '🏆 Premier League Global Sports Sponsorship',
    client: 'National Football Association & Sky Media',
    targetAmount: 1_000_000_000_000, // £1 Trillion
    targetCash: 1_000_000_000_000,
    requiredVehicle: {
      depotId: 'local',
      businessIndex: 0,
      businessId: 'used-transit',
      vehicleName: 'Used Ford Transit Minibuses',
      targetCount: 100,
      currentCount: 0,
    },
    rewardCoins: 250,
    minContribution: 1,
    durationDays: 1,
  },
  {
    id: 'contract-silverstone-f1',
    title: '🏎️ British Grand Prix Paddock Super-Express',
    client: 'Silverstone Circuit & Formula 1 Group',
    targetAmount: 5_000_000_000_000, // £5 Trillion
    targetCash: 5_000_000_000_000,
    requiredVehicle: {
      depotId: 'local',
      businessIndex: 2,
      businessId: 'seat16',
      vehicleName: 'Used Cheetah Coaches',
      targetCount: 75,
      currentCount: 0,
    },
    rewardCoins: 300,
    minContribution: 1,
    durationDays: 1,
  },
  {
    id: 'contract-rail-emergency',
    title: '🚆 Great Western Mainline Signal Rescue Grid',
    client: 'Network Rail Emergency Contingency',
    targetAmount: 25_000_000_000_000, // £25 Trillion
    targetCash: 25_000_000_000_000,
    requiredVehicle: {
      depotId: 'local',
      businessIndex: 4,
      businessId: 'fullsize',
      vehicleName: 'Used Deckers',
      targetCount: 50,
      currentCount: 0,
    },
    rewardCoins: 350,
    minContribution: 1,
    durationDays: 1,
  },
  {
    id: 'contract-champions-league',
    title: '⚽ Champions League Final VIP Transport Network',
    client: 'UEFA Logistics & Host City Authority',
    targetAmount: 100_000_000_000_000, // £100 Trillion
    targetCash: 100_000_000_000_000,
    requiredVehicle: {
      depotId: 'local',
      businessIndex: 6,
      businessId: 'executive',
      vehicleName: 'Brand New Executive Deckers',
      targetCount: 40,
      currentCount: 0,
    },
    rewardCoins: 400,
    minContribution: 1,
    durationDays: 1,
  },
  {
    id: 'contract-edinburgh-fringe',
    title: '🎭 Edinburgh Festival Fringe Megaconvoy',
    client: 'Fringe Festival Logistics Society',
    targetAmount: 500_000_000_000_000, // £500 Trillion
    targetCash: 500_000_000_000_000,
    requiredVehicle: {
      depotId: 'local',
      businessIndex: 7,
      businessId: 'school',
      vehicleName: 'Brand New Plaxton Panthers',
      targetCount: 35,
      currentCount: 0,
    },
    rewardCoins: 450,
    minContribution: 1,
    durationDays: 1,
  },
  {
    id: 'contract-royal-ascot',
    title: '🎩 Royal Ascot Luxury VIP Paddock Network',
    client: 'Ascot Racecourse Hospitality',
    targetAmount: 2_000_000_000_000_000, // £2 Quadrillion
    targetCash: 2_000_000_000_000_000,
    requiredVehicle: {
      depotId: 'local',
      businessIndex: 8,
      businessId: 'national',
      vehicleName: 'Used Team Spec Tri-Axles',
      targetCount: 30,
      currentCount: 0,
    },
    rewardCoins: 500,
    minContribution: 1,
    durationDays: 1,
  },
  {
    id: 'contract-heathrow-snow',
    title: '✈️ Heathrow Terminal Snow Ground Fleet Crisis',
    client: 'British Airways & Heathrow Airport Ltd',
    targetAmount: 10_000_000_000_000_000, // £10 Quadrillion
    targetCash: 10_000_000_000_000_000,
    requiredVehicle: {
      depotId: 'local',
      businessIndex: 9,
      businessId: 'mega',
      vehicleName: 'Brand New Team Spec Tri-Axles',
      targetCount: 25,
      currentCount: 0,
    },
    rewardCoins: 600,
    minContribution: 1,
    durationDays: 1,
  },
];

const SYNDICATE_DIRECTOR_UIDS = ['R42J0IYo6OR9QvVEXcyVYCpZ8EF3'];
const SYNDICATE_DIRECTOR_EMAILS = ['dalewatkins@countrylion.co.uk'];

function isSyndicateDirector(profile) {
  if (!profile) return false;
  const email = String(profile.email || '').trim().toLowerCase();
  const uid = String(profile.uid || '').trim();
  return SYNDICATE_DIRECTOR_UIDS.includes(uid) || SYNDICATE_DIRECTOR_EMAILS.includes(email);
}

function getLondonDayOfWeek(timestamp = Date.now()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    weekday: 'short',
  }).format(new Date(timestamp));
  return parts; // 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'
}

function isLondonWeekend(timestamp = Date.now()) {
  const day = getLondonDayOfWeek(timestamp);
  return day === 'Sat' || day === 'Sun';
}

function getNextMondayMorningMs(timestamp = Date.now()) {
  const now = new Date(timestamp);
  const target = new Date(now);
  const day = target.getUTCDay(); // 0 is Sunday, 6 is Saturday
  const daysUntilMonday = day === 6 ? 2 : day === 0 ? 1 : (8 - day);
  target.setUTCDate(target.getUTCDate() + daysUntilMonday);
  target.setUTCHours(5, 0, 0, 0); // 05:00 UTC Monday
  return target.getTime();
}

/**
 * Randomize start time of future weekday syndicates
 * (between 10:00 AM and 13:00 PM Europe/London time).
 */
function getRandomLondonLaunchTime(dayKey, minHour = 10, minMinute = 0, maxHour = 13, maxMinute = 0) {
  const [y, m, d] = (dayKey || '').split('-').map(Number);
  if (!y || !m || !d) return Date.now();

  const startMin = minHour * 60 + minMinute; // 600 (10:00 AM)
  const endMin = maxHour * 60 + maxMinute;   // 780 (13:00 PM)
  const randomMinutes = startMin + Math.floor(Math.random() * (endMin - startMin + 1));
  const h = Math.floor(randomMinutes / 60);
  const min = randomMinutes % 60;

  // Determine London timezone offset for this date (GMT vs BST)
  const noonUtc = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const londonHourStr = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    hour: 'numeric',
    hour12: false,
  }).format(noonUtc);
  const londonHour = parseInt(londonHourStr, 10);
  const offsetHours = (londonHour === 24 ? 0 : londonHour) - 12;

  const utcHour = h - offsetHours;
  const launchUtc = new Date(Date.UTC(y, m - 1, d, utcHour, min, 0, 0));
  return launchUtc.getTime();
}

/**
 * Multiplier formula:
 * 0 completed -> 1.0x (normal)
 * 1 completed -> 1.5x
 * 2 completed -> 2.0x
 * 3 completed -> 2.5x
 * etc. (+0.5x per additional)
 */
function getSyndicateMultiplier(syndicatesCompleted) {
  const count = Math.max(0, Math.floor(Number(syndicatesCompleted) || 0));
  if (count <= 0) return 1.0;
  return 1.5 + (count - 1) * 0.5;
}

function defaultSyndicateContract(index = 0, dayKey = null, options = {}) {
  const catalogIndex = Math.max(0, Math.floor(Number(index) || 0));
  const template = SYNDICATE_CONTRACTS_CATALOG[catalogIndex % SYNDICATE_CONTRACTS_CATALOG.length];
  const now = Date.now();
  const currentDayKey = dayKey || getLondonDayKey(now);

  // Roll a randomized sponsor reward from the pool
  const sponsorReward = SPONSOR_REWARDS_POOL[
    (catalogIndex + Math.floor(Math.random() * SPONSOR_REWARDS_POOL.length)) % SPONSOR_REWARDS_POOL.length
  ];

  const cashMultDesc = sponsorReward.details?.cashReturnMult
    ? `${sponsorReward.details.cashReturnMult}× Return on Cash Pledges`
    : '10× Return on Cash Pledges';

  const rewardDesc = `${cashMultDesc} + ${template.rewardCoins} Coins + Permanent Multiplier (+0.5×) + ${sponsorReward.title}`;

  // Randomized start time for weekdays unless forced active
  let opensAt = now;
  let status = 'active';

  if (!options.forceActive) {
    const randomLaunch = options.opensAt || getRandomLondonLaunchTime(currentDayKey);
    opensAt = randomLaunch;
    status = (now >= opensAt) ? 'active' : 'upcoming';
  }

  const expiresAt = opensAt + (template.durationDays * 24 * 60 * 60 * 1000);

  return {
    ...template,
    catalogIndex,
    instanceId: `${template.id}-${now.toString(36)}`,
    status, // 'upcoming' | 'active' | 'completed' | 'expired' | 'weekend_standdown'
    opensAt,
    startedAt: opensAt,
    expiresAt,
    currentAmount: 0,
    currentCash: 0,
    requiredVehicle: template.requiredVehicle ? { ...template.requiredVehicle, currentCount: 0 } : null,
    sponsorReward,
    rewardDesc,
    rewardMultiplier: 1.50,
    maxContributionShare: options.maxContributionShare ?? 0.60, // Max 60% per player to enforce collective teamwork
    excludedUids: Array.isArray(options.excludedUids) ? options.excludedUids : [],
    restrictedToNewToday: Boolean(options.restrictedToNewToday),
    eligibilityNote: options.eligibilityNote || null,
    contributors: {}, // uid -> { fullName, amount, vehiclesDonated, contributedAt }
    completedAt: null,
    dayKey: currentDayKey,
  };
}

async function advanceSyndicateContract(db, force = false, options = {}) {
  const docRef = db.doc('coach_capitalist/syndicate');
  const snap = await docRef.get();
  const current = snap.exists ? snap.data() : null;
  const now = Date.now();
  const todayKey = getLondonDayKey(now);

  // If weekend and not forced by admin, set to weekend standdown
  if (isLondonWeekend(now) && !force) {
    const standdown = {
      status: 'weekend_standdown',
      title: '🏁 Weekend Fleet Operations Stand-Down',
      client: 'Country Lion Logistics HQ',
      desc: 'Corporate Syndicate tenders operate Monday to Friday. Fleets stand down for weekend maintenance and driver rest.',
      opensAt: getNextMondayMorningMs(now),
      dayKey: todayKey,
      isWeekend: true,
    };
    await docRef.set(standdown);
    return standdown;
  }

  // Archive previous contract if it had contributors
  if (current && current.instanceId) {
    try {
      await db.collection('coach_capitalist_syndicate_archive').doc(current.instanceId).set({
        ...current,
        archivedAt: Date.now(),
      });
    } catch (e) {
      console.warn('Failed to archive previous syndicate contract:', e);
    }
  }

  const nextIndex = (typeof options.catalogIndex === 'number')
    ? options.catalogIndex
    : (current ? (Number(current.catalogIndex) || 0) + 1 : 0);

  const nextContract = defaultSyndicateContract(nextIndex, todayKey, {
    ...options,
    forceActive: force || options.forceActive,
  });

  await docRef.set(nextContract);
  return nextContract;
}

async function getOrCreateSyndicateContract(db) {
  const docRef = db.doc('coach_capitalist/syndicate');
  const snap = await docRef.get();
  const now = Date.now();
  const todayKey = getLondonDayKey(now);

  if (snap.exists) {
    const data = snap.data();

    // 0. Upcoming tender whose drop time has arrived -> unlock to active
    if (data.status === 'upcoming' && data.opensAt && now >= data.opensAt) {
      const activated = {
        ...data,
        status: 'active',
        startedAt: data.opensAt || now,
      };
      await docRef.update({ status: 'active', startedAt: data.opensAt || now });
      return activated;
    }

    // 1. Contract expired without meeting target -> mark expired (awaiting Dale to launch next)
    if (data.status === 'active' && data.expiresAt && now > data.expiresAt) {
      await docRef.update({ status: 'expired', expiredAt: now });
      return { ...data, status: 'expired', expiredAt: now };
    }

    // Completed, expired, or active contracts remain as-is until Dale Watkins explicitly triggers the next one
    return data;
  }

  if (isLondonWeekend(now)) {
    const standdown = {
      status: 'weekend_standdown',
      title: '🏁 Weekend Fleet Operations Stand-Down',
      client: 'Country Lion Logistics HQ',
      desc: 'Corporate Syndicate tenders operate Monday to Friday. Fleets stand down for weekend maintenance and driver rest.',
      opensAt: getNextMondayMorningMs(now),
      dayKey: todayKey,
      isWeekend: true,
    };
    await docRef.set(standdown);
    return standdown;
  }

  const initial = defaultSyndicateContract(0, todayKey);
  await docRef.set(initial);
  return initial;
}

module.exports = {
  SPONSOR_REWARDS_POOL,
  SYNDICATE_CONTRACTS_CATALOG,
  getLondonDayOfWeek,
  isLondonWeekend,
  getNextMondayMorningMs,
  getRandomLondonLaunchTime,
  getSyndicateMultiplier,
  defaultSyndicateContract,
  advanceSyndicateContract,
  getOrCreateSyndicateContract,
  isSyndicateDirector,
};
