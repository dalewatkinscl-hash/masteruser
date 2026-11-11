// 2D Quarter-Mile Drag Racing ("Quarter-Mile Clash") — Physics, Cars, Upgrades & Audio Engine

export const DRAG_STORAGE_KEY = 'country-lion-drag-racing-v1';
export const QUARTER_MILE_METERS = 402.336; // 1,320 ft

export const CAR_PAINT_PALETTE = [
  { id: 'red', name: 'guards Red', hex: '#ef4444', accent: '#991b1b' },
  { id: 'blue', name: 'Nitro Blue', hex: '#3b82f6', accent: '#1e40af' },
  { id: 'yellow', name: 'Signal Yellow', hex: '#eab308', accent: '#854d0e' },
  { id: 'green', name: 'British Racing Green', hex: '#10b981', accent: '#065f46' },
  { id: 'orange', name: 'Papaya Orange', hex: '#f97316', accent: '#9a3412' },
  { id: 'purple', name: 'Midnight Purple', hex: '#a855f7', accent: '#581c87' },
  { id: 'white', name: 'Championship White', hex: '#f8fafc', accent: '#64748b' },
  { id: 'black', name: 'Stealth Carbon', hex: '#1e293b', accent: '#0f172a' },
];

/**
 * 8 Real-World Inspired 2D Cartoon Cars — from bog-standard starter hatchback to 1,100+ bhp exotic.
 */
export const DRAG_CARS = [
  {
    id: 'fiesta-mk6',
    name: '2004 Ford Fiesta 1.25 Zetec',
    shortName: 'Fiesta 1.25',
    tier: 1,
    badge: 'Bog Standard Starter',
    blurb: '68 bhp of pure L-plate fury. Steel wheels, manual wind-up windows, and a 17-second quarter mile.',
    cost: 0,
    bodyStyle: 'hatch_basic',
    defaultPaint: 'blue',
    baseHp: 72,
    baseWeightKg: 1080,
    baseGrip: 0.62,
    baseShiftMs: 420,
    drivetrain: 'FWD',
    gears: 5,
    redlineRpm: 6300,
    idleRpm: 850,
    launchSweetSpot: [4250, 4750],
    perfectShiftZone: [5860, 6080],
    topSpeedMph: 104,
  },
  {
    id: 'golf-gti',
    name: 'VW Golf GTI Mk5 2.0T',
    shortName: 'Golf GTI Mk5',
    tier: 2,
    badge: 'Warm Hatch Icon',
    blurb: 'Turbocharged 2.0 TFSI with DSG-style punch and tartan seats. Loves a Stage 2 remap.',
    cost: 2200,
    bodyStyle: 'hatch_hot',
    defaultPaint: 'red',
    baseHp: 205,
    baseWeightKg: 1330,
    baseGrip: 0.72,
    baseShiftMs: 310,
    drivetrain: 'FWD',
    gears: 6,
    redlineRpm: 6800,
    idleRpm: 850,
    launchSweetSpot: [4500, 5050],
    perfectShiftZone: [6340, 6570],
    topSpeedMph: 148,
  },
  {
    id: 'civic-type-r',
    name: 'Honda Civic Type R (FK8)',
    shortName: 'Civic Type R',
    tier: 3,
    badge: 'VTEC Screamer',
    blurb: 'High-revving VTEC turbo with a massive rear wing and triple centre exhausts.',
    cost: 6800,
    bodyStyle: 'civic_wing',
    defaultPaint: 'white',
    baseHp: 320,
    baseWeightKg: 1380,
    baseGrip: 0.78,
    baseShiftMs: 260,
    drivetrain: 'FWD',
    gears: 6,
    redlineRpm: 7600,
    idleRpm: 900,
    launchSweetSpot: [5000, 5600],
    perfectShiftZone: [7120, 7370],
    topSpeedMph: 170,
  },
  {
    id: 'impreza-sti',
    name: 'Subaru Impreza WRX STI',
    shortName: 'Impreza STI',
    tier: 4,
    badge: 'AWD Launch King',
    blurb: 'Boxer rumble, huge bonnet scoop, gold rally rims, and symmetrical AWD that hooks off the line.',
    cost: 16500,
    bodyStyle: 'rally_saloon',
    defaultPaint: 'blue',
    baseHp: 385,
    baseWeightKg: 1450,
    baseGrip: 0.90,
    baseShiftMs: 240,
    drivetrain: 'AWD',
    gears: 6,
    redlineRpm: 7400,
    idleRpm: 900,
    launchSweetSpot: [5200, 5800],
    perfectShiftZone: [6930, 7170],
    topSpeedMph: 178,
  },
  {
    id: 'bmw-m3',
    name: 'BMW M3 Competition (G80)',
    shortName: 'M3 Competition',
    tier: 5,
    badge: 'autobahn Bruiser',
    blurb: 'Twin-turbo S58 straight-six with xDrive traction and ferocious mid-range pull.',
    cost: 38000,
    bodyStyle: 'sports_saloon',
    defaultPaint: 'green',
    baseHp: 530,
    baseWeightKg: 1680,
    baseGrip: 0.92,
    baseShiftMs: 190,
    drivetrain: 'AWD',
    gears: 6,
    redlineRpm: 7500,
    idleRpm: 850,
    launchSweetSpot: [5000, 5650],
    perfectShiftZone: [7030, 7270],
    topSpeedMph: 196,
  },
  {
    id: 'mustang-gt500',
    name: 'Ford Mustang Shelby GT500',
    shortName: 'Shelby GT500',
    tier: 6,
    badge: 'Supercharged V8 Muscle',
    blurb: '5.2L Predator V8 with a screaming supercharger. Needs sticky drag radials to tame the torque.',
    cost: 85000,
    bodyStyle: 'muscle_coupe',
    defaultPaint: 'orange',
    baseHp: 760,
    baseWeightKg: 1790,
    baseGrip: 0.86,
    baseShiftMs: 165,
    drivetrain: 'RWD',
    gears: 6,
    redlineRpm: 7500,
    idleRpm: 800,
    launchSweetSpot: [4700, 5300],
    perfectShiftZone: [7030, 7270],
    topSpeedMph: 214,
  },
  {
    id: 'gtr-nismo',
    name: 'Nissan GT-R R35 Nismo',
    shortName: 'GT-R Nismo',
    tier: 7,
    badge: 'Godzilla 1,000+ BHP Potential',
    blurb: 'ATTESA E-TS AWD and twin-turbo VR38DETT. Built to humble anything on a quarter-mile strip.',
    cost: 190000,
    bodyStyle: 'super_coupe',
    defaultPaint: 'purple',
    baseHp: 880,
    baseWeightKg: 1660,
    baseGrip: 0.98,
    baseShiftMs: 130,
    drivetrain: 'AWD',
    gears: 6,
    redlineRpm: 7800,
    idleRpm: 950,
    launchSweetSpot: [5500, 6150],
    perfectShiftZone: [7320, 7570],
    topSpeedMph: 232,
  },
  {
    id: 'huracan-tt',
    name: 'Lamborghini Huracán Twin-Turbo',
    shortName: 'Huracán TT',
    tier: 8,
    badge: '7-Second Strip King',
    blurb: '5.2L V10 strapped with twin billet turbos and a parachute on the rear bumper.',
    cost: 420000,
    bodyStyle: 'wedge_exotic',
    defaultPaint: 'yellow',
    baseHp: 1180,
    baseWeightKg: 1420,
    baseGrip: 1.04,
    baseShiftMs: 95,
    drivetrain: 'AWD',
    gears: 7,
    redlineRpm: 8600,
    idleRpm: 1050,
    launchSweetSpot: [6100, 6800],
    perfectShiftZone: [8100, 8360],
    topSpeedMph: 258,
  },
];

export const UPGRADE_CATEGORIES = [
  {
    id: 'power',
    name: 'Engine & Turbo',
    icon: '🔧',
    maxLevel: 5,
    baseCost: 220,
    desc: 'Increases BHP & top-end pull down the strip.',
    levels: ['Stock Airbox', 'Cold Air Intake & Exhaust', 'ECU Stage 2 Remap', 'Hybrid Big Turbo', 'Forged Internals + Meth', 'Billet Race Block'],
  },
  {
    id: 'grip',
    name: 'Tyres & Suspension',
    icon: '🛞',
    maxLevel: 5,
    baseCost: 180,
    desc: 'Hooks harder off the line & widens the Launch RPM sweet spot.',
    levels: ['Budget Ditchfinders', 'Sport Street Compound', 'Semi-Slick Track Tyres', 'Coilover Launch Struts', 'Wrinkle-Wall Drag Radials', 'Full Pro-Street Slicks'],
  },
  {
    id: 'gearbox',
    name: 'Gearbox & Clutch',
    icon: '⚙️',
    maxLevel: 5,
    baseCost: 200,
    desc: 'Cuts shift lag and widens the Perfect Shift RPM zone.',
    levels: ['Stock Synchro Box', 'Short-Throw Shifter', 'Twin-Plate Race Clutch', 'Close-Ratio Straight Cut', 'Pneumatic Paddle Shift', 'Instant Dog-Box Sequential'],
  },
  {
    id: 'nitrous',
    name: 'Nitrous Oxide (N2O)',
    icon: '🧪',
    maxLevel: 5,
    baseCost: 300,
    desc: 'Unlocks & upgrades your N2O bottle for an explosive mid-track surge.',
    levels: ['No Bottle Installed', '50-Shot Dry Kit (1.2s)', '100-Shot Wet Kit (1.7s)', '150-Shot Dual Purge (2.2s)', '250-Shot Direct Port (2.7s)', '400-Shot Pro Fogger (3.3s)'],
  },
  {
    id: 'weight',
    name: 'Weight Reduction',
    icon: '🪶',
    maxLevel: 5,
    baseCost: 190,
    desc: 'Strips heavy trim & adds carbon panels for quicker 60ft & ET.',
    levels: ['Full Factory Interior', 'Rear Seat & Spare Delete', 'Bucket Seats & Lexan Glass', 'Carbon Bonnet & Boot', 'Tubular Subframes', 'Full Carbon Drag Shell'],
  },
];

export function getCarById(carId) {
  return DRAG_CARS.find((c) => c.id === carId) || DRAG_CARS[0];
}

export function getUpgradeCost(car, categoryId, currentLevel) {
  const cat = UPGRADE_CATEGORIES.find((c) => c.id === categoryId);
  if (!cat || currentLevel >= cat.maxLevel) return 0;
  const tierScale = 1 + (car.tier - 1) * 0.85 + Math.max(0, car.cost * 0.045) / 220;
  const levelScale = 1.75 ** currentLevel;
  return Math.round((cat.baseCost * tierScale * levelScale) / 10) * 10;
}

/**
 * Compute effective car stats given its upgrade levels (`{ power, grip, gearbox, nitrous, weight }`).
 */
export function computeCarStats(carId, upgrades = {}) {
  const car = getCarById(carId);
  const pLv = Math.max(0, Math.min(5, Number(upgrades.power) || 0));
  const gLv = Math.max(0, Math.min(5, Number(upgrades.grip) || 0));
  const bLv = Math.max(0, Math.min(5, Number(upgrades.gearbox) || 0));
  const nLv = Math.max(0, Math.min(5, Number(upgrades.nitrous) || 0));
  const wLv = Math.max(0, Math.min(5, Number(upgrades.weight) || 0));

  // Power scales generously so a fully built car can punch into the next tier
  const hpMult = 1 + pLv * 0.145 + (pLv === 5 ? 0.1 : 0);
  const hp = Math.round(car.baseHp * hpMult);

  // Weight drops up to ~18%
  const weightKg = Math.round(car.baseWeightKg * (1 - wLv * 0.036));

  // Grip scales traction and widens launch sweet spot
  const grip = +(car.baseGrip + gLv * 0.068).toFixed(2);
  const launchBonusRpm = gLv * 95;
  const launchSweetSpot = [
    Math.max(car.idleRpm + 1200, car.launchSweetSpot[0] - launchBonusRpm),
    Math.min(car.redlineRpm - 300, car.launchSweetSpot[1] + launchBonusRpm),
  ];

  // Gearbox cuts shift time and slightly widens perfect shift window (kept tight for skill!)
  const shiftMs = Math.max(40, Math.round(car.baseShiftMs * (1 - bLv * 0.14)));
  const shiftWindowBonusRpm = bLv * 18;
  const perfectShiftZone = [
    Math.max(car.redlineRpm - 650, car.perfectShiftZone[0] - shiftWindowBonusRpm),
    Math.min(car.redlineRpm - 90, car.perfectShiftZone[1] + Math.round(shiftWindowBonusRpm * 0.3)),
  ];

  // Nitrous duration & boost power
  const nitrousDurationSec = nLv > 0 ? +(0.8 + nLv * 0.5).toFixed(1) : 0;
  const nitrousHpBonus = nLv > 0 ? Math.round(car.baseHp * (0.18 + nLv * 0.09) + nLv * 28) : 0;

  // Power-to-weight & Performance Index (PI 100..999)
  const powerToWeight = (hp / weightKg) * 1000; // bhp per tonne
  const pi = Math.min(
    999,
    Math.round(
      powerToWeight * 1.15
      + grip * 140
      + (450 - shiftMs) * 0.22
      + nLv * 22,
    ),
  );

  // Top speed scales with power
  const topSpeedMph = Math.round(car.topSpeedMph * (1 + pLv * 0.045 + wLv * 0.012));

  // Estimated 1/4 mile ET with good driving
  const estEtSec = estimateQuarterMileEt({
    hp,
    weightKg,
    grip,
    shiftMs,
    nitrousDurationSec,
    nitrousHpBonus,
  });

  return {
    car,
    upgrades: { power: pLv, grip: gLv, gearbox: bLv, nitrous: nLv, weight: wLv },
    hp,
    weightKg,
    grip,
    shiftMs,
    launchSweetSpot,
    perfectShiftZone,
    nitrousDurationSec,
    nitrousHpBonus,
    topSpeedMph,
    powerToWeight: Math.round(powerToWeight),
    pi,
    estEtSec,
  };
}

export function estimateQuarterMileEt({
  hp,
  weightKg,
  grip,
  shiftMs,
  nitrousDurationSec = 0,
  nitrousHpBonus = 0,
}) {
  const effectiveHp = hp + (nitrousDurationSec > 0 ? nitrousHpBonus * 0.38 : 0);
  const ratio = Math.max(0.03, weightKg / Math.max(40, effectiveHp));
  // Classic Hale/Huntington quarter-mile formula + traction & shift adjustments
  const rawEt = 5.825 * (ratio ** (1 / 3));
  const gripPenalty = Math.max(0, (0.95 - grip) * 1.65);
  const shiftPenalty = (shiftMs / 1000) * 1.8;
  return +(rawEt + gripPenalty + shiftPenalty).toFixed(2);
}

/**
 * Evaluate launch quality based on RPM at the moment the green light drops.
 */
export function evaluateLaunch(rpm, stats) {
  const [low, high] = stats.launchSweetSpot;
  const center = (low + high) / 2;
  const halfWidth = (high - low) / 2;
  const diff = rpm - center;
  // Power-to-grip factor: low-grip or high-power cars chirp/spin tyres even on good launches
  const slipFactor = Math.max(0.2, Math.min(1.4, (stats.powerToWeight / 260) + (0.95 - stats.grip)));

  if (rpm >= low && rpm <= high) {
    const closeness = 1 - Math.abs(diff) / Math.max(1, halfWidth);
    return {
      grade: 'PERFECT LAUNCH!',
      code: 'perfect',
      colour: '#34d399',
      gripMult: 1.08 + closeness * 0.06,
      wheelspinSec: +(0.32 * slipFactor).toFixed(2),
      cashBonus: 75,
    };
  }

  const goodMargin = 450;
  if (rpm >= low - goodMargin && rpm <= high + goodMargin) {
    const isHigh = rpm > high;
    return {
      grade: isHigh ? 'GOOD LAUNCH (TYRE SPIN)' : 'GOOD LAUNCH',
      code: 'good',
      colour: '#38bdf8',
      gripMult: 0.94,
      wheelspinSec: isHigh ? +(0.75 * slipFactor).toFixed(2) : +(0.42 * slipFactor).toFixed(2),
      cashBonus: 25,
    };
  }

  if (rpm > high + goodMargin) {
    return {
      grade: 'HEAVY WHEELSPIN! (OVER-REV)',
      code: 'wheelspin',
      colour: '#fb7185',
      gripMult: 0.64,
      wheelspinSec: +(1.45 + slipFactor * 0.35).toFixed(2),
      cashBonus: 0,
    };
  }

  return {
    grade: 'BOGGED DOWN! (LOW REVS)',
    code: 'bog',
    colour: '#fbbf24',
    gripMult: 0.74,
    wheelspinSec: 0,
    cashBonus: 0,
  };
}

/**
 * Evaluate gearshift quality based on current RPM vs car's perfectShiftZone.
 */
export function evaluateShift(rpm, stats) {
  const [pLow, pHigh] = stats.perfectShiftZone;
  const redline = stats.car.redlineRpm;
  if (rpm >= pLow && rpm <= pHigh) {
    return {
      grade: '⚡ PERFECT SHIFT!',
      code: 'perfect',
      colour: '#34d399',
      speedBoostMps: 1.35,
      shiftDelayMult: 0.65,
      cashBonus: 40,
    };
  }
  if (rpm >= pLow - 550 && rpm < pLow) {
    return {
      grade: '✓ GOOD SHIFT',
      code: 'good',
      colour: '#38bdf8',
      speedBoostMps: 0.4,
      shiftDelayMult: 1.0,
      cashBonus: 15,
    };
  }
  if (rpm > pHigh && rpm <= redline + 150) {
    return {
      grade: '⚠ LATE SHIFT (REDLINE)',
      code: 'late',
      colour: '#fbbf24',
      speedBoostMps: -0.35,
      shiftDelayMult: 1.25,
      cashBonus: 0,
    };
  }
  return {
    grade: '⚠ EARLY SHIFT',
    code: 'early',
    colour: '#94a3b8',
    speedBoostMps: -0.5,
    shiftDelayMult: 1.15,
    cashBonus: 0,
  };
}

/**
 * Bot Opponents for Single-Player Quarter-Mile Ladder.
 */
export const BOT_OPPONENTS = [
  {
    id: 'bot-rookie',
    name: 'Rookie Ronnie',
    title: 'L-Plate Apprentice',
    difficulty: 'Easy',
    carId: 'fiesta-mk6',
    paint: 'yellow',
    upgrades: { power: 0, grip: 0, gearbox: 0, nitrous: 0, weight: 0 },
    skill: 0.62,
    purse: 350,
    runnerUpPurse: 90,
  },
  {
    id: 'bot-brad',
    name: 'Boy-Racer Brad',
    title: 'Retail Park Regular',
    difficulty: 'Novice',
    carId: 'golf-gti',
    paint: 'red',
    upgrades: { power: 1, grip: 1, gearbox: 1, nitrous: 0, weight: 1 },
    skill: 0.72,
    purse: 750,
    runnerUpPurse: 160,
  },
  {
    id: 'bot-tarn',
    name: 'Tuner Tarn',
    title: 'Midnight VTEC Club',
    difficulty: 'Medium',
    carId: 'civic-type-r',
    paint: 'white',
    upgrades: { power: 2, grip: 2, gearbox: 2, nitrous: 1, weight: 2 },
    skill: 0.80,
    purse: 1650,
    runnerUpPurse: 320,
  },
  {
    id: 'bot-terry',
    name: 'Boosted Baz',
    title: 'AWD Strip Specialist',
    difficulty: 'Hard',
    carId: 'impreza-sti',
    paint: 'blue',
    upgrades: { power: 3, grip: 3, gearbox: 3, nitrous: 2, weight: 3 },
    skill: 0.86,
    purse: 3600,
    runnerUpPurse: 650,
  },
  {
    id: 'bot-shelby',
    name: 'V8 Victoria',
    title: 'Supercharged Outlaw',
    difficulty: 'Pro',
    carId: 'mustang-gt500',
    paint: 'orange',
    upgrades: { power: 3, grip: 4, gearbox: 3, nitrous: 3, weight: 3 },
    skill: 0.90,
    purse: 8000,
    runnerUpPurse: 1200,
  },
  {
    id: 'bot-godzilla',
    name: 'King Kai',
    title: '7-Second Strip Legend',
    difficulty: 'Boss',
    carId: 'gtr-nismo',
    paint: 'purple',
    upgrades: { power: 4, grip: 4, gearbox: 4, nitrous: 4, weight: 4 },
    skill: 0.94,
    purse: 18500,
    runnerUpPurse: 2500,
  },
];

/**
 * Build a matched AI opponent scaled closely to the player's current car & upgrades.
 */
export function buildMatchedBot(playerStats) {
  const playerCar = playerStats.car;
  const ups = playerStats.upgrades || {};
  const avgLv = Math.round(((ups.power || 0) + (ups.grip || 0) + (ups.gearbox || 0) + (ups.weight || 0)) / 4);
  const botUps = {
    power: Math.max(0, Math.min(5, avgLv)),
    grip: Math.max(0, Math.min(5, avgLv)),
    gearbox: Math.max(0, Math.min(5, avgLv)),
    nitrous: Math.max(0, Math.min(5, ups.nitrous || 0)),
    weight: Math.max(0, Math.min(5, avgLv)),
  };
  const purse = Math.round((400 + playerStats.pi * 4.5 + (playerCar.tier - 1) * 900) / 25) * 25;
  return {
    id: 'bot-matched',
    name: `Dyno Rival (${playerCar.shortName})`,
    title: `PI ${playerStats.pi} Bracket Match`,
    difficulty: 'Matched',
    carId: playerCar.id,
    paint: CAR_PAINT_PALETTE[(playerCar.tier + 2) % CAR_PAINT_PALETTE.length].id,
    upgrades: botUps,
    skill: 0.78,
    purse,
    runnerUpPurse: Math.round(purse * 0.22),
  };
}

/**
 * Default player state — starts with £500 and the bog-standard 2004 Ford Fiesta 1.25 Zetec.
 */
export function createInitialDragState() {
  return {
    version: 1,
    cash: 500,
    activeCarId: 'fiesta-mk6',
    ownedCars: {
      'fiesta-mk6': {
        paint: 'blue',
        stripes: false,
        upgrades: { power: 0, grip: 0, gearbox: 0, nitrous: 0, weight: 0 },
      },
    },
    stats: {
      racesRun: 0,
      botWins: 0,
      multiplayerWins: 0,
      bestEtSec: null,
      bestTrapMph: 0,
      bestCarId: 'fiesta-mk6',
      bestCarName: '2004 Ford Fiesta 1.25 Zetec',
      totalEarnings: 500,
    },
  };
}

export function normalizeDragState(raw) {
  const base = createInitialDragState();
  if (!raw || typeof raw !== 'object') return base;
  const ownedCars = { ...base.ownedCars };
  if (raw.ownedCars && typeof raw.ownedCars === 'object') {
    for (const [id, entry] of Object.entries(raw.ownedCars)) {
      if (!DRAG_CARS.some((c) => c.id === id) || !entry || typeof entry !== 'object') continue;
      const u = entry.upgrades && typeof entry.upgrades === 'object' ? entry.upgrades : {};
      ownedCars[id] = {
        paint: typeof entry.paint === 'string' ? entry.paint : getCarById(id).defaultPaint,
        stripes: Boolean(entry.stripes),
        upgrades: {
          power: Math.max(0, Math.min(5, Math.floor(Number(u.power) || 0))),
          grip: Math.max(0, Math.min(5, Math.floor(Number(u.grip) || 0))),
          gearbox: Math.max(0, Math.min(5, Math.floor(Number(u.gearbox) || 0))),
          nitrous: Math.max(0, Math.min(5, Math.floor(Number(u.nitrous) || 0))),
          weight: Math.max(0, Math.min(5, Math.floor(Number(u.weight) || 0))),
        },
      };
    }
  }
  const activeCarId = ownedCars[raw.activeCarId] ? raw.activeCarId : 'fiesta-mk6';
  const rawStats = raw.stats && typeof raw.stats === 'object' ? raw.stats : {};
  return {
    version: 1,
    cash: Math.max(0, Math.round(Number(raw.cash) ?? 500)),
    activeCarId,
    ownedCars,
    stats: {
      racesRun: Math.max(0, Math.floor(Number(rawStats.racesRun) || 0)),
      botWins: Math.max(0, Math.floor(Number(rawStats.botWins) || 0)),
      multiplayerWins: Math.max(0, Math.floor(Number(rawStats.multiplayerWins) || 0)),
      bestEtSec: Number(rawStats.bestEtSec) > 0 ? +Number(rawStats.bestEtSec).toFixed(3) : null,
      bestTrapMph: Math.max(0, +(Number(rawStats.bestTrapMph) || 0).toFixed(1)),
      bestCarId: rawStats.bestCarId || activeCarId,
      bestCarName: rawStats.bestCarName || getCarById(activeCarId).name,
      totalEarnings: Math.max(0, Math.round(Number(rawStats.totalEarnings) || 500)),
    },
  };
}

export function loadDragState() {
  try {
    const raw = localStorage.getItem(DRAG_STORAGE_KEY);
    if (!raw) return createInitialDragState();
    return normalizeDragState(JSON.parse(raw));
  } catch {
    return createInitialDragState();
  }
}

export function saveDragState(state) {
  try {
    localStorage.setItem(DRAG_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

// --- Procedural WebAudio Engine for Revs, Shifts, Tree Beeps & Nitrous ---
const DRAG_MUTE_KEY = 'country-lion-drag-mute';
let audioCtx = null;

export function isDragSoundMuted() {
  try {
    return localStorage.getItem(DRAG_MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setDragSoundMuted(muted) {
  try {
    localStorage.setItem(DRAG_MUTE_KEY, muted ? '1' : '0');
  } catch {
    /* ignore */
  }
}

export function playDragSfx(kind = 'beep_amber') {
  if (typeof window === 'undefined' || isDragSoundMuted()) return;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!audioCtx) audioCtx = new Ctx();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const now = audioCtx.currentTime;

    const tone = (freq, start, dur, type = 'sawtooth', peak = 0.08, endFreq = null) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now + start);
      if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, now + start + dur);
      gain.gain.setValueAtTime(0.0001, now + start);
      gain.gain.exponentialRampToValueAtTime(peak, now + start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now + start);
      osc.stop(now + start + dur + 0.01);
    };

    if (kind === 'beep_amber') {
      tone(440, 0, 0.11, 'sine', 0.09);
    } else if (kind === 'beep_green') {
      tone(880, 0, 0.24, 'triangle', 0.13);
    } else if (kind === 'shift_perfect') {
      tone(160, 0, 0.09, 'sawtooth', 0.1, 95);
      tone(740, 0.03, 0.11, 'triangle', 0.08, 1180);
    } else if (kind === 'shift_good') {
      tone(140, 0, 0.08, 'sawtooth', 0.07, 90);
    } else if (kind === 'nitrous') {
      tone(220, 0, 0.28, 'sawtooth', 0.09, 520);
    } else if (kind === 'win') {
      tone(523.25, 0, 0.1, 'triangle', 0.1);
      tone(659.25, 0.08, 0.1, 'triangle', 0.1);
      tone(783.99, 0.16, 0.1, 'triangle', 0.1);
      tone(1046.5, 0.24, 0.28, 'sine', 0.12);
    } else if (kind === 'upgrade') {
      tone(440, 0, 0.07, 'triangle', 0.08, 660);
      tone(880, 0.06, 0.12, 'sine', 0.09);
    }
  } catch {
    /* ignore */
  }
}

let engineNodes = null;

export function updateDragEngineAudio(rpm = 850, redline = 6500, active = false) {
  if (typeof window === 'undefined') return;
  try {
    if (!active || isDragSoundMuted()) {
      if (engineNodes && audioCtx) {
        engineNodes.gain.gain.setTargetAtTime(0.0001, audioCtx.currentTime, 0.04);
      }
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!audioCtx) audioCtx = new Ctx();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    if (!engineNodes) {
      const osc1 = audioCtx.createOscillator();
      const osc2 = audioCtx.createOscillator();
      const filter = audioCtx.createBiquadFilter();
      const gain = audioCtx.createGain();
      osc1.type = 'sawtooth';
      osc2.type = 'triangle';
      filter.type = 'lowpass';
      filter.frequency.value = 320;
      gain.gain.value = 0.0001;
      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(gain);
      gain.connect(audioCtx.destination);
      osc1.start();
      osc2.start();
      engineNodes = { osc1, osc2, filter, gain };
    }

    const norm = Math.max(0, Math.min(1.05, (rpm - 700) / Math.max(2000, redline - 700)));
    const baseFreq = 38 + norm * 145;
    const now = audioCtx.currentTime;
    engineNodes.osc1.frequency.setTargetAtTime(baseFreq, now, 0.03);
    engineNodes.osc2.frequency.setTargetAtTime(baseFreq * 1.5, now, 0.03);
    engineNodes.filter.frequency.setTargetAtTime(220 + norm * 680, now, 0.03);
    engineNodes.gain.gain.setTargetAtTime(0.025 + norm * 0.045, now, 0.03);
  } catch {
    /* ignore */
  }
}

/**
 * Synthesize realistic multi-pop exhaust backfire cracks & bangs on gearshifts and overrun decel.
 */
export function playExhaustPopsAndBangs(intensity = 'perfect') {
  if (typeof window === 'undefined' || isDragSoundMuted()) return;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!audioCtx) audioCtx = new Ctx();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const now = audioCtx.currentTime;

    const schedulePop = (delaySec, vol = 0.14, centerHz = 360) => {
      const dur = 0.055 + Math.random() * 0.035;
      // Explosive crackle noise burst
      const bufSize = Math.floor(audioCtx.sampleRate * dur);
      const buf = audioCtx.createBuffer(1, bufSize, audioCtx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < bufSize; i += 1) {
        const env = (1 - i / bufSize) ** 1.8;
        data[i] = (Math.random() * 2 - 1) * env;
      }
      const noise = audioCtx.createBufferSource();
      noise.buffer = buf;

      const filter = audioCtx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(centerHz + (Math.random() - 0.5) * 90, now + delaySec);
      filter.Q.value = 1.4;

      const nGain = audioCtx.createGain();
      nGain.gain.setValueAtTime(vol, now + delaySec);
      nGain.gain.exponentialRampToValueAtTime(0.0001, now + delaySec + dur);

      noise.connect(filter);
      filter.connect(nGain);
      nGain.connect(audioCtx.destination);
      noise.start(now + delaySec);

      // Deep exhaust thump / concussion
      const thump = audioCtx.createOscillator();
      const tGain = audioCtx.createGain();
      thump.type = 'triangle';
      thump.frequency.setValueAtTime(125 + Math.random() * 35, now + delaySec);
      thump.frequency.exponentialRampToValueAtTime(36, now + delaySec + dur);
      tGain.gain.setValueAtTime(vol * 0.95, now + delaySec);
      tGain.gain.exponentialRampToValueAtTime(0.0001, now + delaySec + dur);
      thump.connect(tGain);
      tGain.connect(audioCtx.destination);
      thump.start(now + delaySec);
      thump.stop(now + delaySec + dur + 0.01);
    };

    if (intensity === 'perfect') {
      schedulePop(0.0, 0.17, 420);
      schedulePop(0.055, 0.14, 340);
      schedulePop(0.115, 0.16, 390);
      schedulePop(0.18, 0.11, 290);
    } else if (intensity === 'decel') {
      schedulePop(0.02, 0.12, 310);
      schedulePop(0.11, 0.14, 350);
      schedulePop(0.22, 0.11, 280);
      schedulePop(0.36, 0.13, 320);
      schedulePop(0.52, 0.09, 260);
    } else {
      schedulePop(0.0, 0.13, 350);
      schedulePop(0.065, 0.11, 300);
      schedulePop(0.135, 0.09, 270);
    }
  } catch {
    /* ignore */
  }
}

let wheelspinNodes = null;

/**
 * Continuous tyre screech / wheelspin audio synthesizer.
 */
export function updateWheelspinAudio(active = false, intensity = 0.75) {
  if (typeof window === 'undefined') return;
  try {
    if (!active || isDragSoundMuted()) {
      if (wheelspinNodes && audioCtx) {
        wheelspinNodes.gain.gain.setTargetAtTime(0.0001, audioCtx.currentTime, 0.04);
      }
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!audioCtx) audioCtx = new Ctx();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    if (!wheelspinNodes) {
      // High-pitched dual rubber squeal oscillators + friction noise
      const osc1 = audioCtx.createOscillator();
      const osc2 = audioCtx.createOscillator();
      const lfo = audioCtx.createOscillator();
      const lfoGain = audioCtx.createGain();
      const filter = audioCtx.createBiquadFilter();
      const gain = audioCtx.createGain();

      osc1.type = 'sawtooth';
      osc2.type = 'triangle';
      osc1.frequency.value = 940;
      osc2.frequency.value = 1310;

      lfo.type = 'sine';
      lfo.frequency.value = 19;
      lfoGain.gain.value = 48;

      filter.type = 'bandpass';
      filter.frequency.value = 1180;
      filter.Q.value = 3.2;

      gain.gain.value = 0.0001;

      lfo.connect(lfoGain);
      lfoGain.connect(osc1.frequency);
      lfoGain.connect(osc2.frequency);
      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(gain);
      gain.connect(audioCtx.destination);

      osc1.start();
      osc2.start();
      lfo.start();
      wheelspinNodes = { osc1, osc2, filter, gain };
    }

    const now = audioCtx.currentTime;
    const clamped = Math.max(0.2, Math.min(1, intensity));
    const jitter = (Math.random() - 0.5) * 45;
    wheelspinNodes.osc1.frequency.setTargetAtTime(890 + clamped * 190 + jitter, now, 0.025);
    wheelspinNodes.osc2.frequency.setTargetAtTime(1240 + clamped * 240 - jitter, now, 0.025);
    wheelspinNodes.gain.gain.setTargetAtTime(0.032 * clamped, now, 0.025);
  } catch {
    /* ignore */
  }
}


