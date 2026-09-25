'use strict';

/**
 * Coach Depot — HQ-tier progression (no ages).
 * Portal coins: jobs earn; HQ / land / buildings / staff / fleet spend.
 * No leaderboard.
 */

const STAFF_GRADE_ORDER = [
  'casual',
  'fullTime',
  'privateHire',
  'tour',
];

const STAFF_GRADE_MIGRATE = {
  basic: 'casual',
  qualified: 'fullTime',
  pcv: 'privateHire',
  captain: 'tour',
  continental: 'tour',
  casual: 'casual',
  fullTime: 'fullTime',
  privateHire: 'privateHire',
  tour: 'tour',
};

/** Bay caps by HQ level. */
const HQ_BAY_CAPS = { 1: 7, 2: 15, 3: 20, 4: 30 };
/** Owned tile caps by HQ level (12×12 = 144). */
const HQ_TILE_CAPS = { 1: 24, 2: 48, 3: 80, 4: 144 };

/** @deprecated — ages removed; kept empty for old callers. */
const AGES = {};

const BUILDING_KEYS = [
  'opsOffice',
  'trainingCentre',
  'workshop',
  'wash',
  'breakRoom',
  'paintShop',
  'chargers',
  'tourOffice',
];

/**
 * Per-level requirements to unlock / build that level.
 * Tech stays hidden until these are met.
 */
const BUILDING_LEVEL_REQUIRES = {
  opsOffice: {
    1: { officeLevel: 1 },
    2: { officeLevel: 2 },
    3: { officeLevel: 3 },
    4: { officeLevel: 4 },
  },
  trainingCentre: {
    1: { officeLevel: 2 },
    2: { opsOffice: 3 },
    3: { opsOffice: 4 },
  },
  workshop: {
    1: { opsOffice: 2 },
    2: { opsOffice: 3 },
    3: { officeLevel: 4 },
  },
  wash: {
    1: { opsOffice: 2 },
    2: { opsOffice: 3 },
  },
  breakRoom: {
    1: { opsOffice: 3 },
    2: { officeLevel: 4 },
  },
  paintShop: {
    1: { workshop: 2 },
    2: { workshop: 3 },
  },
  chargers: {
    1: { opsOffice: 4 },
  },
  tourOffice: {
    1: { opsOffice: 4 },
    2: { tourOffice: 1 },
  },
};

const BUILDINGS = {
  opsOffice: {
    key: 'opsOffice',
    label: 'Operations',
    maxLevel: 4,
    usesPlot: true,
    effect: 'Unlocks workshops, wash, training and tour office tiers.',
    costForLevel: (n) => [0, 120, 900, 4500, 22000][n] || 120,
    levelLabel: (n) => (n === 0 ? 'Not built' : `Ops Lv ${n}`),
  },
  trainingCentre: {
    key: 'trainingCentre',
    label: 'Training centre',
    maxLevel: 3,
    usesPlot: true,
    effect: 'Recruit better drivers.',
    costForLevel: (n) => [0, 800, 5000, 18000][n] || 800,
    levelLabel: (n) => (n === 0 ? 'Not built' : `Training Lv ${n}`),
  },
  workshop: {
    key: 'workshop',
    label: 'Vehicle workshop',
    maxLevel: 3,
    usesPlot: true,
    effect: 'Unlocks coaches, exec coaches and super exec.',
    costForLevel: (n) => [0, 600, 3500, 16000][n] || 600,
    levelLabel: (n) => (n === 0 ? 'Not built' : `Workshop Lv ${n}`),
  },
  wash: {
    key: 'wash',
    label: 'Vehicle wash',
    maxLevel: 2,
    usesPlot: true,
    effect: 'Bonus coins on every job.',
    costForLevel: (n) => [0, 450, 2800][n] || 450,
    levelLabel: (n) => (n === 0 ? 'Not built' : `Wash Lv ${n}`),
  },
  breakRoom: {
    key: 'breakRoom',
    label: 'Drivers break room',
    maxLevel: 2,
    usesPlot: true,
    effect: 'Jobs finish faster.',
    costForLevel: (n) => [0, 700, 4200][n] || 700,
    levelLabel: (n) => (n === 0 ? 'Not built' : `Break room Lv ${n}`),
  },
  paintShop: {
    key: 'paintShop',
    label: 'Paint shop',
    maxLevel: 2,
    usesPlot: true,
    effect: 'Fleet finish — Lv 2 boosts job revenue.',
    costForLevel: (n) => [0, 2000, 9000][n] || 2000,
    levelLabel: (n) => (n === 0 ? 'Not built' : `Paint shop Lv ${n}`),
  },
  chargers: {
    key: 'chargers',
    label: 'Electric charger',
    maxLevel: 1,
    usesPlot: false,
    bayUpgrade: true,
    effect: 'Upgrade a parking bay with a charger — unlocks electric coaches (+25% job revenue).',
    costForLevel: (n) => [0, 12000][n] || 12000,
    levelLabel: (n) => (n === 0 ? 'No chargers' : 'Bay chargers installed'),
  },
  tourOffice: {
    key: 'tourOffice',
    label: 'Tour office',
    maxLevel: 2,
    usesPlot: true,
    effect: 'Unlocks tours; Lv 2 unlocks continental tours.',
    costForLevel: (n) => [0, 14000, 45000][n] || 14000,
    levelLabel: (n) => (n === 0 ? 'Not built' : `Tour office Lv ${n}`),
  },
};

const OFFICE_LEVELS = {
  maxLevel: 4,
  costForLevel: (n) => ({ 2: 5000, 3: 28000, 4: 120000 }[n] || 5000),
  levelLabel: (n) => `HQ Level ${Math.max(1, n)}`,
  effect: 'Big HQ upgrades unlock the next tier of buildings.',
  requiresForLevel: (n) => ({
    2: { opsOffice: 1 },
    3: { opsOffice: 2, workshop: 1 },
    4: { opsOffice: 3, workshop: 2 },
  })[n] || {},
  unlocksForLevel: (n) => ({
    2: [
      'Ops Lv 2 (workshop & wash)',
      'Training centre Lv 1 → full-time drivers → private school',
    ],
    3: [
      'Ops Lv 3 (wash 2, break room, training 2, workshop 2)',
    ],
    4: [
      'Ops Lv 4 (bay chargers, training 3, tour office)',
      'Workshop Lv 3 (paint shop 2, super exec coaches)',
      'Break room Lv 2',
    ],
  })[n] || [],
};

const BAY_COST = (nextCount) => Math.floor(80 + (nextCount - 2) * 95);
/** First purchased tile 50, then +50 each (starter tiles are free). */
function landTileCost(ownedCount, starterCount = 9) {
  const starter = Math.max(0, Math.floor(Number(starterCount) || 9));
  const owned = Math.max(0, Math.floor(Number(ownedCount) || 0));
  const purchased = Math.max(0, owned - starter);
  return 50 * (purchased + 1);
}
const LAND_TILE_COST = landTileCost;

/** Full yard is 12×12. Defaults used until admin saves a starter map. */
const GRID_SIZE = 12;
const STARTER_ORIGIN = { x: 4, y: 5 }; // inclusive 4..6 × 5..7
const HQ_TILE = { x: 5, y: 6 };
const STARTER_BAY_TILE = { x: 5, y: 7 };
const DEFAULT_ROAD_TILES = [
  { x: 5, y: 8 },
  { x: 5, y: 9 },
  { x: 5, y: 10 },
  { x: 5, y: 11 },
];
/** @deprecated alias — prefer mapConfig.roadTiles */
const ROAD_TILES = DEFAULT_ROAD_TILES;

function tileKey(x, y) {
  return `${x},${y}`;
}

function parseTileKey(key) {
  const [xs, ys] = String(key || '').split(',');
  const x = Math.floor(Number(xs));
  const y = Math.floor(Number(ys));
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

function inGrid(x, y, size = GRID_SIZE) {
  return x >= 0 && y >= 0 && x < size && y < size;
}

function defaultStarterOwnedKeys() {
  const keys = [];
  for (let y = STARTER_ORIGIN.y; y < STARTER_ORIGIN.y + 3; y += 1) {
    for (let x = STARTER_ORIGIN.x; x < STARTER_ORIGIN.x + 3; x += 1) {
      keys.push(tileKey(x, y));
    }
  }
  return keys;
}

function defaultStarterPlacements() {
  return [
    {
      id: 'hq',
      type: 'hq',
      key: 'hq',
      level: 1,
      x: HQ_TILE.x,
      y: HQ_TILE.y,
    },
    {
      id: 'bay-1',
      type: 'bay',
      key: 'bay',
      level: 1,
      x: STARTER_BAY_TILE.x,
      y: STARTER_BAY_TILE.y,
    },
  ];
}

/** Default: every non-road tile is buildable. */
function defaultBuildableKeys(roadKeys = DEFAULT_ROAD_TILES.map((t) => tileKey(t.x, t.y))) {
  const road = new Set(roadKeys);
  const keys = [];
  for (let y = 0; y < GRID_SIZE; y += 1) {
    for (let x = 0; x < GRID_SIZE; x += 1) {
      const k = tileKey(x, y);
      if (!road.has(k)) keys.push(k);
    }
  }
  return keys;
}

function defaultMapConfig() {
  const roadTiles = DEFAULT_ROAD_TILES.map((t) => ({ ...t }));
  const roadKeys = roadTiles.map((t) => tileKey(t.x, t.y));
  return {
    gridSize: GRID_SIZE,
    starterOwned: defaultStarterOwnedKeys(),
    buildable: defaultBuildableKeys(roadKeys),
    blocked: [],
    roadTiles,
    starterPlacements: defaultStarterPlacements(),
  };
}

function normalizeTileList(list, { allowEmpty = true } = {}) {
  const set = new Set();
  if (!Array.isArray(list)) return allowEmpty ? [] : null;
  for (const item of list) {
    let t = null;
    if (typeof item === 'string') t = parseTileKey(item);
    else if (item && typeof item === 'object') {
      const x = Math.floor(Number(item.x));
      const y = Math.floor(Number(item.y));
      if (Number.isFinite(x) && Number.isFinite(y)) t = { x, y };
    }
    if (t && inGrid(t.x, t.y)) set.add(tileKey(t.x, t.y));
  }
  return [...set];
}

function normalizeMapConfig(raw = {}) {
  const base = defaultMapConfig();
  const gridSize = Math.max(8, Math.min(16, Math.floor(Number(raw.gridSize)) || GRID_SIZE));
  const roadTiles = normalizeTileList(raw.roadTiles ?? base.roadTiles).map(parseTileKey).filter(Boolean);
  const roadKeys = roadTiles.map((t) => tileKey(t.x, t.y));
  let blocked = normalizeTileList(raw.blocked ?? []);
  blocked = blocked.filter((k) => !roadKeys.includes(k));
  let buildable = normalizeTileList(raw.buildable);
  if (!buildable.length) {
    buildable = defaultBuildableKeys(roadKeys).filter((k) => !blocked.includes(k));
  } else {
    buildable = buildable.filter((k) => !roadKeys.includes(k) && !blocked.includes(k));
  }
  let starterOwned = normalizeTileList(raw.starterOwned ?? base.starterOwned);
  starterOwned = starterOwned.filter((k) => buildable.includes(k));
  if (starterOwned.length < 1) starterOwned = defaultStarterOwnedKeys().filter((k) => buildable.includes(k));

  let starterPlacements = Array.isArray(raw.starterPlacements) ? raw.starterPlacements : base.starterPlacements;
  starterPlacements = starterPlacements
    .map((p) => {
      const x = Math.floor(Number(p.x));
      const y = Math.floor(Number(p.y));
      if (!inGrid(x, y, gridSize)) return null;
      const type = String(p.type || '');
      if (type === 'hq') {
        return { id: 'hq', type: 'hq', key: 'hq', level: 1, x, y };
      }
      if (type === 'bay') {
        return { id: String(p.id || 'bay-1'), type: 'bay', key: 'bay', level: 1, x, y };
      }
      return null;
    })
    .filter(Boolean);
  if (!starterPlacements.some((p) => p.type === 'hq')) {
    const hqKey = starterOwned[0];
    const t = parseTileKey(hqKey) || HQ_TILE;
    starterPlacements.unshift({ id: 'hq', type: 'hq', key: 'hq', level: 1, x: t.x, y: t.y });
  }
  if (!starterPlacements.some((p) => p.type === 'bay')) {
    const free = starterOwned.find((k) => {
      const t = parseTileKey(k);
      return t && !starterPlacements.some((p) => p.x === t.x && p.y === t.y);
    });
    const t = parseTileKey(free) || STARTER_BAY_TILE;
    starterPlacements.push({ id: 'bay-1', type: 'bay', key: 'bay', level: 1, x: t.x, y: t.y });
  }
  // Ensure starter placement tiles are owned + buildable
  for (const p of starterPlacements) {
    const k = tileKey(p.x, p.y);
    if (!starterOwned.includes(k)) starterOwned.push(k);
    if (!buildable.includes(k)) buildable.push(k);
  }

  return {
    gridSize,
    starterOwned,
    buildable,
    blocked,
    roadTiles,
    starterPlacements,
  };
}

function serializeMapConfig(config) {
  const c = normalizeMapConfig(config);
  return {
    gridSize: c.gridSize,
    starterOwned: c.starterOwned.map(parseTileKey).filter(Boolean),
    buildable: c.buildable.map(parseTileKey).filter(Boolean),
    blocked: c.blocked.map(parseTileKey).filter(Boolean),
    roadTiles: c.roadTiles,
    starterPlacements: c.starterPlacements,
  };
}

async function loadMapConfig(db) {
  if (!db) return defaultMapConfig();
  try {
    const snap = await db.collection('coach_depot_config').doc('starterMap').get();
    if (!snap.exists) return defaultMapConfig();
    return normalizeMapConfig(snap.data() || {});
  } catch {
    return defaultMapConfig();
  }
}

async function saveMapConfig(db, raw, { uid = '', fullName = '', FieldValue = null } = {}) {
  const config = normalizeMapConfig(raw);
  const payload = {
    ...config,
    updatedAt: FieldValue ? FieldValue.serverTimestamp() : new Date().toISOString(),
    updatedByUid: uid || null,
    updatedByName: fullName || null,
  };
  await db.collection('coach_depot_config').doc('starterMap').set(payload, { merge: true });
  return normalizeMapConfig(payload);
}

function normalizeSpriteAnchor(raw = {}) {
  const scale = Number(raw.scale);
  const ox = Number(raw.ox);
  const oy = Number(raw.oy);
  return {
    scale: Math.min(2.5, Math.max(0.35, Number.isFinite(scale) ? scale : 1)),
    ox: Math.round(Math.min(96, Math.max(-96, Number.isFinite(ox) ? ox : 0))),
    oy: Math.round(Math.min(96, Math.max(-96, Number.isFinite(oy) ? oy : 0))),
  };
}

function normalizeSpriteAnchors(map = {}) {
  const out = {};
  if (!map || typeof map !== 'object') return out;
  for (const [key, val] of Object.entries(map)) {
    const file = String(key || '').split('/').pop();
    if (!file || !file.endsWith('.png')) continue;
    out[file] = normalizeSpriteAnchor(val);
  }
  return out;
}

async function loadSpriteAnchors(db) {
  if (!db) return {};
  try {
    const snap = await db.collection('coach_depot_config').doc('spriteAnchors').get();
    if (!snap.exists) return {};
    const data = snap.data() || {};
    return normalizeSpriteAnchors(data.anchors || data);
  } catch {
    return {};
  }
}

async function saveSpriteAnchors(db, raw, { uid = '', fullName = '', FieldValue = null } = {}) {
  const anchors = normalizeSpriteAnchors(raw?.anchors || raw || {});
  const payload = {
    anchors,
    updatedAt: FieldValue ? FieldValue.serverTimestamp() : new Date().toISOString(),
    updatedByUid: uid || null,
    updatedByName: fullName || null,
  };
  await db.collection('coach_depot_config').doc('spriteAnchors').set(payload, { merge: false });
  return anchors;
}

function roadKeySet(depotOrConfig) {
  const roads = depotOrConfig?.roadTiles || DEFAULT_ROAD_TILES;
  return new Set(roads.map((t) => (typeof t === 'string' ? t : tileKey(t.x, t.y))));
}

function isRoadTile(x, y, depotOrConfig = null) {
  return roadKeySet(depotOrConfig).has(tileKey(x, y));
}

function isBuildableTile(x, y, depotOrConfig = null) {
  if (!inGrid(x, y)) return false;
  if (isRoadTile(x, y, depotOrConfig)) return false;
  const blocked = new Set(depotOrConfig?.blockedTiles || depotOrConfig?.blocked || []);
  if (blocked.has(tileKey(x, y))) return false;
  const buildable = depotOrConfig?.buildableTiles || depotOrConfig?.buildable;
  if (Array.isArray(buildable) && buildable.length) {
    return buildable.map(String).includes(tileKey(x, y))
      || buildable.some((t) => t && t.x === x && t.y === y);
  }
  return true;
}

function starterOwnedKeys(mapConfig = null) {
  const cfg = normalizeMapConfig(mapConfig || defaultMapConfig());
  return [...cfg.starterOwned];
}

function starterPlacements(mapConfig = null) {
  const cfg = normalizeMapConfig(mapConfig || defaultMapConfig());
  return cfg.starterPlacements.map((p) => ({ ...p }));
}

function mapMetaFromConfig(mapConfig) {
  const cfg = normalizeMapConfig(mapConfig || defaultMapConfig());
  return {
    roadTiles: cfg.roadTiles.map((t) => ({ ...t })),
    buildableTiles: [...cfg.buildable],
    blockedTiles: [...cfg.blocked],
  };
}

const STAFF_GRADES = {
  casual: {
    grade: 'casual',
    label: 'Casual driver',
    hireCost: 40,
    maxVehicleTier: 1,
    requires: {},
  },
  fullTime: {
    grade: 'fullTime',
    label: 'Full-time driver',
    hireCost: 280,
    maxVehicleTier: 2,
    requires: { trainingCentre: 1 },
  },
  privateHire: {
    grade: 'privateHire',
    label: 'Private hire driver',
    hireCost: 1400,
    maxVehicleTier: 3,
    requires: { trainingCentre: 2 },
  },
  tour: {
    grade: 'tour',
    label: 'Tour driver',
    hireCost: 6500,
    maxVehicleTier: 5,
    requires: { trainingCentre: 3 },
  },
};

const VEHICLE_TIERS = {
  1: {
    tier: 1,
    key: 'minibus',
    label: 'Minibus',
    buyCost: 60,
    minStaffGrade: 'casual',
    requires: {},
    color: 0xb45309, // minibus amber-brown
  },
  2: {
    tier: 2,
    key: 'coach',
    label: 'Coach',
    buyCost: 450,
    minStaffGrade: 'fullTime',
    requires: { workshop: 1 },
    color: 0xf59e0b, // amber
  },
  3: {
    tier: 3,
    key: 'exec_coach',
    label: 'Exec coach',
    buyCost: 2800,
    minStaffGrade: 'privateHire',
    requires: { workshop: 2 },
    color: 0x38bdf8, // sky blue
  },
  4: {
    tier: 4,
    key: 'electric_coach',
    label: 'Electric coach',
    buyCost: 12000,
    minStaffGrade: 'tour',
    requires: { chargers: 1 },
    color: 0x34d399, // green
    electricBonus: true,
  },
  5: {
    tier: 5,
    key: 'super_exec',
    label: 'Super exec coach',
    buyCost: 35000,
    minStaffGrade: 'tour',
    requires: { workshop: 3 },
    color: 0xa78bfa, // purple
  },
};

const JOB_TYPES = {
  council_school: {
    key: 'council_school',
    label: 'Council school run',
    blurb: 'Morning council school contract.',
    durationMs: 4 * 60 * 60 * 1000,
    baseReward: 14,
    minStaffGrade: 'casual',
    minVehicleTier: 1,
    requires: {},
  },
  private_school: {
    key: 'private_school',
    label: 'Private school run',
    blurb: 'Needs a full-time driver and a coach.',
    durationMs: 6 * 60 * 60 * 1000,
    baseReward: 36,
    minStaffGrade: 'fullTime',
    minVehicleTier: 2,
    requires: { trainingCentre: 1 },
  },
  private_hire: {
    key: 'private_hire',
    label: 'Private hire',
    blurb: 'Needs a PH driver and an exec coach.',
    durationMs: 12 * 60 * 60 * 1000,
    baseReward: 110,
    minStaffGrade: 'privateHire',
    minVehicleTier: 3,
    requires: { trainingCentre: 2 },
  },
  tour: {
    key: 'tour',
    label: 'Tour',
    blurb: 'Needs tour office, tour driver and an exec coach.',
    durationMs: 96 * 60 * 60 * 1000,
    baseReward: 220,
    minStaffGrade: 'tour',
    minVehicleTier: 3,
    requires: { tourOffice: 1 },
  },
  continental_tour: {
    key: 'continental_tour',
    label: 'Continental tour',
    blurb: 'Needs Tour office Lv 2, tour driver and an exec coach.',
    durationMs: 5 * 24 * 60 * 60 * 1000,
    baseReward: 520,
    minStaffGrade: 'tour',
    minVehicleTier: 3,
    requires: { tourOffice: 2 },
  },
  vip: {
    key: 'vip',
    label: 'VIP',
    blurb: 'Needs a tour driver and a super exec coach.',
    durationMs: 48 * 60 * 60 * 1000,
    baseReward: 480,
    minStaffGrade: 'tour',
    minVehicleTier: 5,
    requires: { workshop: 3 },
  },
};

const FIRST_NAMES = [
  'Ash', 'Blake', 'Chris', 'Dale', 'Eden', 'Finn', 'Glen', 'Harper',
  'Indie', 'Jules', 'Kit', 'Lou', 'Mo', 'Nico', 'Ollie', 'Pat',
  'Quinn', 'Rae', 'Sam', 'Terry', 'Uma', 'Val', 'Will', 'Yaz',
];

function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function randomStaffName() {
  return FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
}

/** Current UK-style plate: AA12 BBB (no I/Q). */
function randomUkReg() {
  const letters = 'ABCDEFGHJKLMNOPRSTUVWXYZ';
  const pick = (n) => Array.from({ length: n }, () => (
    letters[Math.floor(Math.random() * letters.length)]
  )).join('');
  const age = String(1 + Math.floor(Math.random() * 99)).padStart(2, '0');
  return `${pick(2)}${age} ${pick(3)}`;
}

function nextStaffGrade(grade) {
  const i = STAFF_GRADE_ORDER.indexOf(String(grade || ''));
  if (i < 0 || i >= STAFF_GRADE_ORDER.length - 1) return null;
  return STAFF_GRADE_ORDER[i + 1];
}

function trainStaffCost(toGrade) {
  const def = STAFF_GRADES[toGrade];
  if (!def) return null;
  return Math.max(20, Math.floor(def.hireCost * 0.55));
}

function vehicleSellValue(tier) {
  const def = VEHICLE_TIERS[tier];
  if (!def) return 0;
  return Math.max(1, Math.floor(def.buyCost * 0.5));
}

/**
 * Workshop inspection cadence after claimed jobs.
 * No workshop: every job, 2h. Lv1: every 4 / 1h. Lv2: every 10 / 30m. Lv3: every 25 / 15m.
 */
function inspectionRules(workshopLevel) {
  const lvl = Math.max(0, Math.floor(Number(workshopLevel) || 0));
  if (lvl >= 3) return { every: 25, durationMs: 15 * 60 * 1000 };
  if (lvl >= 2) return { every: 10, durationMs: 30 * 60 * 1000 };
  if (lvl >= 1) return { every: 4, durationMs: 60 * 60 * 1000 };
  return { every: 1, durationMs: 2 * 60 * 60 * 1000 };
}

function vehicleInspectingUntil(vehicle) {
  const t = Date.parse(vehicle?.inspectUntil || '');
  if (!Number.isFinite(t) || t <= Date.now()) return null;
  return t;
}

function isVehicleInspecting(vehicle) {
  return vehicleInspectingUntil(vehicle) != null;
}

function applyInspectionAfterClaim(depot, vehicleId) {
  if (!vehicleId) return depot;
  const rules = inspectionRules(buildingLevel(depot, 'workshop'));
  const fleet = (depot.fleet || []).map((v) => {
    if (v.id !== vehicleId) return v;
    const jobsSince = Math.max(0, Math.floor(Number(v.jobsSinceInspection) || 0)) + 1;
    if (jobsSince < rules.every) {
      return { ...v, jobsSinceInspection: jobsSince, inspectUntil: null };
    }
    return {
      ...v,
      jobsSinceInspection: 0,
      inspectUntil: new Date(Date.now() + rules.durationMs).toISOString(),
    };
  });
  return { ...depot, fleet };
}

function staffGradeRank(grade) {
  const i = STAFF_GRADE_ORDER.indexOf(String(grade || ''));
  return i < 0 ? -1 : i;
}

function staffCanDriveTier(grade, tier) {
  const def = STAFF_GRADES[grade];
  if (!def) return false;
  return Number(tier) <= def.maxVehicleTier;
}

function buildingLevel(depot, key) {
  if (key === 'officeLevel' || key === 'hq') {
    return Math.max(1, Number(depot.officeLevel) || 1);
  }
  const buildings = depot.buildings || {};
  return Math.max(0, Math.floor(Number(buildings[key]) || 0));
}

function formatRequireLabel(key, need) {
  if (key === 'officeLevel' || key === 'hq') return `HQ Level ${need}`;
  const label = BUILDINGS[key]?.label || key;
  return `${label} Lv ${need}`;
}

function meetsRequires(depot, requires = {}) {
  const missing = [];
  for (const [key, need] of Object.entries(requires || {})) {
    if (buildingLevel(depot, key) < need) {
      missing.push(formatRequireLabel(key, need));
    }
  }
  if (!missing.length) return null;
  return missing.join(' · ');
}

function maxOwnedTilesForHq(hqLevel) {
  const lvl = Math.max(1, Math.min(4, Math.floor(Number(hqLevel)) || 1));
  return HQ_TILE_CAPS[lvl] || HQ_TILE_CAPS[1];
}

/** @deprecated */
function maxOwnedTilesForAge(_age) {
  return maxOwnedTilesForHq(1);
}

function maxBaysForHq(hqLevel) {
  const lvl = Math.max(1, Math.min(4, Math.floor(Number(hqLevel)) || 1));
  return HQ_BAY_CAPS[lvl] || HQ_BAY_CAPS[1];
}

/** @deprecated use maxOwnedTilesForHq */
function maxPlotsForAge(age) {
  return Math.max(1, Math.ceil(maxOwnedTilesForAge(age) / 9));
}

function buildingLevelUnlocked(depot, key, level) {
  const req = BUILDING_LEVEL_REQUIRES[key]?.[level];
  if (!req) return false;
  return !meetsRequires(depot, req);
}

function buildingLevelVisible(depot, key, level) {
  const def = BUILDINGS[key];
  if (!def || level < 1 || level > def.maxLevel) return false;
  const current = buildingLevel(depot, key);
  if (level <= current) return true;
  if (level > current + 1) return false;
  return buildingLevelUnlocked(depot, key, level);
}

function ownedSet(depot) {
  return new Set((depot.ownedTiles || []).map(String));
}

function occupiedSet(depot) {
  const set = new Set();
  for (const p of depot.placements || []) {
    set.add(tileKey(p.x, p.y));
  }
  return set;
}

function freeOwnedTiles(depot) {
  const owned = ownedSet(depot);
  const occ = occupiedSet(depot);
  const free = [];
  for (const key of owned) {
    if (!occ.has(key)) {
      const t = parseTileKey(key);
      if (t && !isRoadTile(t.x, t.y, depot) && isBuildableTile(t.x, t.y, depot)) free.push(t);
    }
  }
  return free;
}

function freePlots(depot) {
  return freeOwnedTiles(depot).length;
}

function bayHasCharger(p) {
  return Boolean(p && (p.charged || Math.floor(Number(p.level) || 1) >= 2));
}

function buildingsFromPlacements(placements = []) {
  const buildings = Object.fromEntries(BUILDING_KEYS.map((k) => [k, 0]));
  let officeLevel = 0;
  let bays = 0;
  let chargedBays = 0;
  let hasHq = false;
  for (const p of placements) {
    if (p.type === 'hq') {
      hasHq = true;
      officeLevel = Math.max(officeLevel, Math.floor(Number(p.level) || 1));
    }
    if (p.type === 'bay') {
      bays += 1;
      if (bayHasCharger(p)) chargedBays += 1;
    }
    if (p.type === 'building' && BUILDINGS[p.key] && BUILDINGS[p.key].usesPlot !== false) {
      buildings[p.key] = Math.max(buildings[p.key], Math.floor(Number(p.level) || 0));
    }
  }
  // Chargers are bay upgrades, not a plot building.
  buildings.chargers = chargedBays > 0 ? 1 : 0;
  if (hasHq) officeLevel = Math.max(1, Math.min(4, officeLevel || 1));
  return { buildings, officeLevel, bays: Math.max(1, bays) };
}

function syncDerived(depot) {
  const derived = buildingsFromPlacements(depot.placements);
  return {
    ...depot,
    buildings: derived.buildings,
    officeLevel: derived.officeLevel,
    bays: derived.bays,
    plots: Math.max(1, Math.ceil((depot.ownedTiles || []).length / 9)),
  };
}

function plotsUsed(depot) {
  return (depot.placements || []).filter((p) => p.type === 'building' || p.type === 'hq').length;
}

function staffCap(depot) {
  const breakRoom = buildingLevel(depot, 'breakRoom');
  const training = buildingLevel(depot, 'trainingCentre');
  return 1 + breakRoom * 2 + training * 2;
}

function emptyDepot(mapConfig = null) {
  const cfg = normalizeMapConfig(mapConfig || defaultMapConfig());
  const staffId = newId('staff');
  const vehicleId = newId('veh');
  const placements = starterPlacements(cfg);
  const ownedTiles = starterOwnedKeys(cfg);
  const meta = mapMetaFromConfig(cfg);
  return syncDerived({
    age: 1,
    gridSize: cfg.gridSize || GRID_SIZE,
    ownedTiles,
    starterTileCount: ownedTiles.length,
    placements,
    roadTiles: meta.roadTiles,
    buildableTiles: meta.buildableTiles,
    blockedTiles: meta.blockedTiles,
    staff: [{ id: staffId, grade: 'casual', name: randomStaffName() }],
    fleet: [{
      id: vehicleId,
      tier: 1,
      label: VEHICLE_TIERS[1].label,
      reg: randomUkReg(),
      jobsSinceInspection: 0,
      inspectUntil: null,
    }],
    jobsCompleted: 0,
  });
}

function migrateLegacyDepot(raw = {}) {
  // Already on grid model
  if (Array.isArray(raw.ownedTiles) && Array.isArray(raw.placements)) {
    return null;
  }
  if (raw.age != null || Array.isArray(raw.staff) || Array.isArray(raw.fleet)) {
    // Ages model without grid — rebuild starter grid and keep progression levels
    const buildings = Object.fromEntries(BUILDING_KEYS.map((k) => [k, 0]));
    const incoming = raw.buildings && typeof raw.buildings === 'object' ? raw.buildings : {};
    for (const key of BUILDING_KEYS) {
      buildings[key] = Math.max(0, Math.floor(Number(incoming[key]) || 0));
    }
    const ownedTiles = starterOwnedKeys();
    const placements = starterPlacements();
    placements[0].level = Math.max(1, Math.min(4, Math.floor(Number(raw.officeLevel) || 1)));
    // Place any built buildings on free owned tiles (expand ownership if needed)
    const free = () => {
      const occ = new Set(placements.map((p) => tileKey(p.x, p.y)));
      return ownedTiles.map(parseTileKey).filter((t) => t && !occ.has(tileKey(t.x, t.y)));
    };
    const hadChargers = buildings.chargers > 0;
    buildings.chargers = 0;
    for (const key of BUILDING_KEYS) {
      if (buildings[key] <= 0) continue;
      if (BUILDINGS[key]?.usesPlot === false) continue;
      let spot = free()[0];
      if (!spot) {
        // claim adjacent
        const claim = claimAdjacentTile({ ownedTiles, placements }, true);
        if (claim) {
          ownedTiles.push(tileKey(claim.x, claim.y));
          spot = claim;
        }
      }
      if (!spot) continue;
      placements.push({
        id: newId('bld'),
        type: 'building',
        key,
        level: buildings[key],
        x: spot.x,
        y: spot.y,
      });
    }
    if (hadChargers) {
      const firstBay = placements.find((p) => p.type === 'bay');
      if (firstBay) {
        firstBay.level = 2;
        firstBay.charged = true;
      }
    }
    const bayTarget = Math.max(1, Math.floor(Number(raw.bays) || 1));
    while (placements.filter((p) => p.type === 'bay').length < bayTarget) {
      let spot = free()[0];
      if (!spot) {
        const claim = claimAdjacentTile({ ownedTiles, placements }, true);
        if (claim) {
          ownedTiles.push(tileKey(claim.x, claim.y));
          spot = claim;
        }
      }
      if (!spot) break;
      placements.push({
        id: newId('bay'),
        type: 'bay',
        key: 'bay',
        level: 1,
        x: spot.x,
        y: spot.y,
      });
    }
    return syncDerived({
      age: Math.max(1, Math.min(5, Math.floor(Number(raw.age)) || 1)),
      gridSize: GRID_SIZE,
      ownedTiles,
      placements,
      staff: raw.staff,
      fleet: raw.fleet,
      jobsCompleted: Math.max(0, Math.floor(Number(raw.jobsCompleted) || 0)),
    });
  }

  const upgrades = raw.upgrades && typeof raw.upgrades === 'object' ? raw.upgrades : {};
  if (!Object.keys(upgrades).length && raw.age == null) {
    return null;
  }
  // Very old upgrades map → fresh starter (progression can be re-earned in sandbox)
  return emptyDepot();
}

function claimAdjacentTile(depot, allowAny = false) {
  const owned = ownedSet(depot);
  const candidates = [];
  for (const key of owned) {
    const t = parseTileKey(key);
    if (!t) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = t.x + dx;
      const ny = t.y + dy;
      if (!inGrid(nx, ny) || isRoadTile(nx, ny, depot)) continue;
      if (!allowAny && !isBuildableTile(nx, ny, depot)) continue;
      const nk = tileKey(nx, ny);
      if (owned.has(nk)) continue;
      candidates.push({ x: nx, y: ny });
    }
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => (a.y - b.y) || (a.x - b.x));
  return candidates[0];
}

function normalizePlacements(list, officeLevel = 0, depotOrConfig = null) {
  if (!Array.isArray(list) || !list.length) return starterPlacements();
  const out = [];
  let hasHq = false;
  let bays = 0;
  let legacyChargers = false;
  for (const raw of list.slice(0, 200)) {
    const x = Math.floor(Number(raw.x));
    const y = Math.floor(Number(raw.y));
    if (!inGrid(x, y) || isRoadTile(x, y, depotOrConfig)) continue;
    const type = String(raw.type || '');
    if (type === 'hq') {
      hasHq = true;
      out.push({
        id: String(raw.id || 'hq'),
        type: 'hq',
        key: 'hq',
        level: Math.max(1, Math.min(OFFICE_LEVELS.maxLevel, Math.floor(Number(raw.level ?? officeLevel) || 1))),
        x,
        y,
      });
    } else if (type === 'bay') {
      bays += 1;
      const charged = Boolean(raw.charged) || Math.floor(Number(raw.level) || 1) >= 2;
      out.push({
        id: String(raw.id || newId('bay')),
        type: 'bay',
        key: 'bay',
        level: charged ? 2 : 1,
        charged,
        x,
        y,
      });
    } else if (type === 'building' && BUILDINGS[raw.key] && BUILDINGS[raw.key].usesPlot !== false) {
      const def = BUILDINGS[raw.key];
      out.push({
        id: String(raw.id || newId('bld')),
        type: 'building',
        key: raw.key,
        level: Math.max(1, Math.min(def.maxLevel, Math.floor(Number(raw.level) || 1))),
        x,
        y,
      });
    } else if (type === 'building' && raw.key === 'chargers') {
      legacyChargers = true;
    }
  }
  if (!hasHq) out.unshift(starterPlacements()[0]);
  if (bays < 1) out.push(starterPlacements()[1]);
  if (legacyChargers) {
    const firstBay = out.find((p) => p.type === 'bay');
    if (firstBay && !bayHasCharger(firstBay)) {
      firstBay.level = 2;
      firstBay.charged = true;
    }
  }
  return out;
}

function normalizeOwnedTiles(list, depotOrConfig = null) {
  if (!Array.isArray(list) || !list.length) return starterOwnedKeys();
  const set = new Set();
  for (const item of list) {
    if (typeof item === 'string') {
      const t = parseTileKey(item);
      if (t && inGrid(t.x, t.y) && !isRoadTile(t.x, t.y, depotOrConfig)) set.add(tileKey(t.x, t.y));
    } else if (item && typeof item === 'object') {
      const x = Math.floor(Number(item.x));
      const y = Math.floor(Number(item.y));
      if (inGrid(x, y) && !isRoadTile(x, y, depotOrConfig)) set.add(tileKey(x, y));
    }
  }
  if (set.size < 1) {
    starterOwnedKeys().forEach((k) => set.add(k));
  }
  return [...set];
}

function normalizeStaff(list) {
  if (!Array.isArray(list) || !list.length) {
    return [{ id: newId('staff'), grade: 'casual', name: randomStaffName() }];
  }
  return list.slice(0, 40).map((s) => {
    const migrated = STAFF_GRADE_MIGRATE[s.grade] || s.grade;
    const grade = STAFF_GRADES[migrated] ? migrated : 'casual';
    return {
      id: String(s.id || newId('staff')),
      grade,
      name: String(s.name || randomStaffName()).slice(0, 40),
    };
  });
}

function normalizeFleet(list) {
  if (!Array.isArray(list) || !list.length) {
    return [{
      id: newId('veh'),
      tier: 1,
      label: VEHICLE_TIERS[1].label,
      reg: randomUkReg(),
      jobsSinceInspection: 0,
      inspectUntil: null,
    }];
  }
  return list.slice(0, 40).map((v) => {
    const tier = Math.max(1, Math.min(5, Math.floor(Number(v.tier) || 1)));
    const inspectUntil = v.inspectUntil && Date.parse(v.inspectUntil) > Date.now()
      ? String(v.inspectUntil)
      : null;
    return {
      id: String(v.id || newId('veh')),
      tier,
      label: String(v.label || VEHICLE_TIERS[tier].label).slice(0, 60),
      reg: String(v.reg || randomUkReg()).slice(0, 12),
      jobsSinceInspection: Math.max(0, Math.floor(Number(v.jobsSinceInspection) || 0)),
      inspectUntil,
    };
  });
}

function normalizeDepot(raw = {}) {
  const migrated = migrateLegacyDepot(raw);
  const src = migrated || raw;
  const defaults = mapMetaFromConfig(defaultMapConfig());
  const roadTiles = Array.isArray(src.roadTiles) && src.roadTiles.length
    ? src.roadTiles.map((t) => (typeof t === 'string' ? parseTileKey(t) : { x: Math.floor(Number(t.x)), y: Math.floor(Number(t.y)) })).filter((t) => t && inGrid(t.x, t.y))
    : defaults.roadTiles;
  const buildableTiles = Array.isArray(src.buildableTiles) && src.buildableTiles.length
    ? normalizeTileList(src.buildableTiles)
    : defaults.buildableTiles;
  const blockedTiles = normalizeTileList(src.blockedTiles || []);
  const meta = { roadTiles, buildableTiles, blockedTiles };
  const ownedTiles = normalizeOwnedTiles(src.ownedTiles, meta);
  const placements = normalizePlacements(src.placements, src.officeLevel, meta);
  const owned = new Set(ownedTiles);
  for (const p of placements) owned.add(tileKey(p.x, p.y));
  const age = Math.max(1, Math.min(5, Math.floor(Number(src.age)) || 1));
  const ownedList = [...owned];
  const starterTileCount = Math.max(
    1,
    Math.floor(Number(src.starterTileCount)) || Math.min(ownedList.length, 9) || 9,
  );
  return syncDerived({
    age,
    gridSize: GRID_SIZE,
    ownedTiles: ownedList,
    starterTileCount,
    placements,
    roadTiles,
    buildableTiles,
    blockedTiles,
    staff: normalizeStaff(src.staff),
    fleet: normalizeFleet(src.fleet),
    jobsCompleted: Math.max(0, Math.floor(Number(src.jobsCompleted)) || 0),
  });
}

function maxBays(depot) {
  return Math.max(1, Math.floor(Number(depot.bays) || 1));
}

function maxDrivers(depot) {
  return Math.min(maxBays(depot), depot.staff.length, depot.fleet.length);
}

function durationMultiplier(depot) {
  const breakRoom = buildingLevel(depot, 'breakRoom');
  // Break room 1: 20% faster; Lv 2: another ~15%
  let mult = 1;
  if (breakRoom >= 1) mult *= 0.8;
  if (breakRoom >= 2) mult *= 0.85;
  return Math.max(0.4, mult);
}

function rewardMultiplier(depot, { vehicleTier = null } = {}) {
  const wash = buildingLevel(depot, 'wash');
  const paint = buildingLevel(depot, 'paintShop');
  let mult = 1;
  if (wash >= 1) mult += 0.1;
  if (wash >= 2) mult += 0.12;
  if (paint >= 2) mult += 0.15;
  if (vehicleTier === 4 || VEHICLE_TIERS[vehicleTier]?.electricBonus) {
    mult += 0.25;
  }
  return mult;
}

function computeJobReward(depot, jobType, { vehicleTier = null } = {}) {
  const base = jobType.baseReward;
  return Math.max(1, Math.floor(base * rewardMultiplier(depot, { vehicleTier })));
}

function computeJobDurationMs(depot, jobType) {
  return Math.max(20_000, Math.floor(jobType.durationMs * durationMultiplier(depot)));
}

function jobLockedReason(depot, jobType) {
  const req = { ...(jobType.requires || {}) };
  for (const [k, v] of Object.entries(req)) {
    if (v <= 0) delete req[k];
  }
  return meetsRequires(depot, req);
}

function jobDispatchReadyReason(depot, jobType, activeJobs = []) {
  const buildingLock = jobLockedReason(depot, jobType);
  if (buildingLock) return buildingLock;
  const needGrade = jobType.minStaffGrade;
  const needTier = jobType.minVehicleTier;
  const hasDriver = (depot.staff || []).some(
    (s) => staffGradeRank(s.grade) >= staffGradeRank(needGrade),
  );
  if (!hasDriver) {
    return `Needs a ${STAFF_GRADES[needGrade]?.label || needGrade} (or higher).`;
  }
  const hasVehicle = (depot.fleet || []).some((v) => (
    v.tier >= needTier && !isVehicleInspecting(v)
  ));
  if (!hasVehicle) {
    const anyOfTier = (depot.fleet || []).some((v) => v.tier >= needTier);
    if (anyOfTier) {
      return 'Needs a coach free of workshop inspection.';
    }
    return `Needs a ${VEHICLE_TIERS[needTier]?.label || `tier ${needTier}`} (or better).`;
  }
  if (activeJobs.length >= maxBays(depot)) {
    return 'All bays are busy. Claim a finished job or buy another bay.';
  }
  return null;
}

function jobVisible(depot, jobType) {
  if (!jobType.requires || !Object.keys(jobType.requires).length) return true;
  return !meetsRequires(depot, jobType.requires);
}

function hqUpgradeLockedReason(depot) {
  const next = (depot.officeLevel || 1) + 1;
  if (next > OFFICE_LEVELS.maxLevel) return 'HQ is fully upgraded.';
  return meetsRequires(depot, OFFICE_LEVELS.requiresForLevel(next));
}

function buildingLockedReason(depot, key, nextLevel) {
  const def = BUILDINGS[key];
  if (!def) return 'Unknown building.';
  const current = buildingLevel(depot, key);
  if (nextLevel > def.maxLevel) return 'Already maxed.';
  if (nextLevel !== current + 1) return 'Upgrade one level at a time.';
  if (!buildingLevelUnlocked(depot, key, nextLevel)) {
    return meetsRequires(depot, BUILDING_LEVEL_REQUIRES[key]?.[nextLevel] || {})
      || 'Not unlocked yet.';
  }
  if (def.bayUpgrade) {
    const uncharged = (depot.placements || []).some((p) => p.type === 'bay' && !bayHasCharger(p));
    if (!uncharged) return 'All parking bays already have chargers.';
    return null;
  }
  if (current === 0 && def.usesPlot && freePlots(depot) < 1) {
    return 'Need a free owned tile to place this building.';
  }
  return null;
}

function chargerBayLockedReason(depot, bayId = null, x = null, y = null) {
  const unlock = meetsRequires(depot, BUILDING_LEVEL_REQUIRES.chargers?.[1] || {});
  if (unlock) return unlock;
  let bay = null;
  if (bayId) {
    bay = (depot.placements || []).find((p) => p.type === 'bay' && p.id === bayId) || null;
  } else if (x != null && y != null) {
    bay = (depot.placements || []).find((p) => p.type === 'bay' && p.x === x && p.y === y) || null;
  }
  if (!bay) return 'Pick a parking bay to upgrade.';
  if (bayHasCharger(bay)) return 'This bay already has a charger.';
  return null;
}

function staffHireLockedReason(depot, grade) {
  const def = STAFF_GRADES[grade];
  if (!def) return 'Unknown staff grade.';
  const need = meetsRequires(depot, def.requires || {});
  if (need) return need;
  if (depot.staff.length >= staffCap(depot)) {
    return `Staff roster full (${staffCap(depot)}). Upgrade break room / training.`;
  }
  return null;
}

function staffVisible(depot, grade) {
  const def = STAFF_GRADES[grade];
  if (!def) return false;
  if (!def.requires || !Object.keys(def.requires).length) return true;
  return !meetsRequires(depot, def.requires);
}

function vehicleBuyLockedReason(depot, tier) {
  const def = VEHICLE_TIERS[tier];
  if (!def) return 'Unknown vehicle.';
  const need = meetsRequires(depot, def.requires || {});
  if (need) return need;
  if (depot.fleet.length >= maxBays(depot)) {
    return `Need another parking bay (fleet ${depot.fleet.length}/${maxBays(depot)}).`;
  }
  return null;
}

function vehicleVisible(depot, tier) {
  const def = VEHICLE_TIERS[tier];
  if (!def) return false;
  if (!def.requires || !Object.keys(def.requires).length) return true;
  return !meetsRequires(depot, def.requires);
}

function bayBuyLockedReason(depot) {
  const next = maxBays(depot) + 1;
  const cap = maxBaysForHq(depot.officeLevel || 1);
  if (next > cap) {
    return `HQ Level ${depot.officeLevel || 1} supports ${cap} bays. Upgrade HQ for more.`;
  }
  if (freePlots(depot) < 1) return 'Need a free owned tile for a bay.';
  return null;
}

function plotBuyLockedReason(depot) {
  const max = maxOwnedTilesForHq(depot.officeLevel || 1);
  if ((depot.ownedTiles || []).length >= max) {
    return `HQ Level ${depot.officeLevel || 1} supports ${max} tiles. Upgrade HQ for more land.`;
  }
  if (!claimAdjacentTile(depot)) {
    return 'No adjacent land left to claim.';
  }
  return null;
}

function serializeJob(doc) {
  if (!doc) return null;
  const data = typeof doc.data === 'function' ? (doc.data() || {}) : (doc || {});
  const id = doc.id || data.id || null;
  return {
    id,
    jobType: data.jobType || null,
    label: data.label || JOB_TYPES[data.jobType]?.label || data.jobType,
    driverSlot: data.driverSlot ?? null,
    staffId: data.staffId || null,
    vehicleId: data.vehicleId || null,
    startedAt: data.startedAt || null,
    readyAt: data.readyAt || null,
    reward: data.reward || 0,
    status: data.status || 'active',
    durationMs: data.durationMs || 0,
  };
}

function serializeDepot(depot, { jobs = [], walletBalance = 0, sandbox = false } = {}) {
  const active = jobs.filter((j) => j.status === 'active');
  const busyStaff = new Set(active.map((j) => j.staffId).filter(Boolean));
  const busyFleet = new Set(active.map((j) => j.vehicleId).filter(Boolean));
  const busySlots = new Set(active.map((j) => j.driverSlot).filter((n) => n != null));

  const staff = (depot.staff || []).map((s, index) => {
    const busy = busyStaff.has(s.id) || busySlots.has(index);
    const nextGrade = nextStaffGrade(s.grade);
    const nextDef = nextGrade ? STAFF_GRADES[nextGrade] : null;
    const trainCost = nextGrade ? trainStaffCost(nextGrade) : null;
    const trainLock = nextGrade
      ? (meetsRequires(depot, nextDef.requires || {}) || null)
      : 'Max grade';
    return {
      ...s,
      busy,
      jobId: active.find((j) => j.staffId === s.id || j.driverSlot === index)?.id || null,
      gradeLabel: STAFF_GRADES[s.grade]?.label || s.grade,
      nextGrade,
      nextGradeLabel: nextDef?.label || null,
      trainCost,
      canTrain: Boolean(nextGrade && !trainLock && !busy),
      trainLockReason: trainLock,
    };
  });

  const fleet = (depot.fleet || []).map((v, index) => {
    const inspectUntilMs = vehicleInspectingUntil(v);
    const inspecting = inspectUntilMs != null;
    const rules = inspectionRules(buildingLevel(depot, 'workshop'));
    const jobsSince = Math.max(0, Math.floor(Number(v.jobsSinceInspection) || 0));
    return {
      ...v,
      reg: v.reg || randomUkReg(),
      busy: busyFleet.has(v.id) || busySlots.has(index) || inspecting,
      onJob: busyFleet.has(v.id) || busySlots.has(index),
      inspecting,
      inspectUntil: inspecting ? new Date(inspectUntilMs).toISOString() : null,
      inspectRemainingMs: inspecting ? Math.max(0, inspectUntilMs - Date.now()) : 0,
      jobsSinceInspection: jobsSince,
      jobsUntilInspection: Math.max(0, rules.every - jobsSince),
      inspectionEvery: rules.every,
      inspectionDurationMs: rules.durationMs,
      jobId: active.find((j) => j.vehicleId === v.id || j.driverSlot === index)?.id || null,
      tierLabel: VEHICLE_TIERS[v.tier]?.label || v.label,
      color: VEHICLE_TIERS[v.tier]?.color || 0xf59e0b,
      sellValue: vehicleSellValue(v.tier),
      canSell: !busyFleet.has(v.id) && !busySlots.has(index) && !inspecting && (depot.fleet || []).length > 1,
    };
  });

  const workshopLevel = buildingLevel(depot, 'workshop');
  const inspectRules = inspectionRules(workshopLevel);

  const hqLevel = Math.max(1, depot.officeLevel || 1);

  const buildingShop = BUILDING_KEYS.flatMap((key) => {
    const def = BUILDINGS[key];
    // Chargers are installed on parking bays — not a build-menu item.
    if (def.bayUpgrade || def.usesPlot === false) return [];
    const level = buildingLevel(depot, key);
    const next = level + 1;
    const maxed = level >= def.maxLevel;
    if (maxed) {
      return [{
        key,
        label: def.label,
        effect: def.effect,
        level,
        maxLevel: def.maxLevel,
        maxed: true,
        visible: true,
        locked: true,
        lockReason: null,
        requirements: null,
        cost: null,
        levelLabel: def.levelLabel(level),
        nextLabel: null,
        usesPlot: def.usesPlot,
      }];
    }
    // Not built yet: hide until unlocked. Already placed: always include next upgrade (may be locked).
    if (level === 0 && !buildingLevelVisible(depot, key, next)) return [];
    const lockReason = buildingLockedReason(depot, key, next);
    const requirements = meetsRequires(depot, BUILDING_LEVEL_REQUIRES[key]?.[next] || {});
    const cost = def.costForLevel(next);
    return [{
      key,
      label: def.label,
      effect: def.effect,
      level,
      maxLevel: def.maxLevel,
      maxed: false,
      visible: true,
      locked: Boolean(lockReason),
      lockReason: lockReason || null,
      requirements: requirements || null,
      cost,
      levelLabel: def.levelLabel(level),
      nextLabel: def.levelLabel(next),
      usesPlot: def.usesPlot,
    }];
  });

  const officeNext = hqLevel + 1;
  const officeMaxed = hqLevel >= OFFICE_LEVELS.maxLevel;
  const hqReq = officeMaxed ? null : OFFICE_LEVELS.requiresForLevel(officeNext);
  const hqLock = officeMaxed ? null : hqUpgradeLockedReason(depot);
  const officeShop = {
    key: 'office',
    label: 'Upgrade HQ',
    effect: OFFICE_LEVELS.effect,
    level: hqLevel,
    maxLevel: OFFICE_LEVELS.maxLevel,
    maxed: officeMaxed,
    locked: Boolean(hqLock),
    lockReason: hqLock || null,
    requirements: hqLock || null,
    cost: officeMaxed ? null : OFFICE_LEVELS.costForLevel(officeNext),
    levelLabel: OFFICE_LEVELS.levelLabel(hqLevel),
    nextLabel: officeMaxed ? null : OFFICE_LEVELS.levelLabel(officeNext),
    unlocks: officeMaxed ? [] : OFFICE_LEVELS.unlocksForLevel(officeNext),
    requireList: hqReq
      ? Object.entries(hqReq).map(([k, v]) => formatRequireLabel(k, v))
      : [],
  };

  const bayLock = bayBuyLockedReason(depot);
  const bayShop = {
    key: 'bay',
    label: 'Parking bay',
    effect: 'Another parking bay — room for one more vehicle.',
    level: maxBays(depot),
    max: maxBaysForHq(hqLevel),
    cost: bayLock ? null : BAY_COST(maxBays(depot) + 1),
    locked: Boolean(bayLock),
    lockReason: bayLock || null,
    requirements: bayLock || null,
  };

  const chargerDef = BUILDINGS.chargers;
  const chargerUnlock = meetsRequires(depot, BUILDING_LEVEL_REQUIRES.chargers?.[1] || {});
  const unchargedBayCount = (depot.placements || []).filter((p) => p.type === 'bay' && !bayHasCharger(p)).length;
  const chargerShop = {
    key: 'chargers',
    label: chargerDef.label,
    effect: chargerDef.effect,
    cost: chargerDef.costForLevel(1),
    visible: !chargerUnlock,
    locked: Boolean(chargerUnlock) || unchargedBayCount < 1,
    lockReason: chargerUnlock
      || (unchargedBayCount < 1 ? 'All parking bays already have chargers.' : null),
    requirements: chargerUnlock || null,
    chargedBays: (depot.placements || []).filter((p) => p.type === 'bay' && bayHasCharger(p)).length,
    unchargedBays: unchargedBayCount,
  };

  const plotLock = plotBuyLockedReason(depot);
  const ownedCount = (depot.ownedTiles || []).length;
  const starterCount = Math.max(1, Math.floor(Number(depot.starterTileCount)) || 9);
  const nextLandCost = LAND_TILE_COST(ownedCount, starterCount);
  const plotShop = {
    key: 'plot',
    label: 'Claim adjacent land',
    effect: 'For-sale tiles next to your yard. First 50 coins, then +50 each.',
    level: ownedCount,
    max: maxOwnedTilesForHq(hqLevel),
    free: freePlots(depot),
    cost: plotLock ? null : nextLandCost,
    locked: Boolean(plotLock),
    lockReason: plotLock || null,
  };

  const hireShop = STAFF_GRADE_ORDER.filter((grade) => staffVisible(depot, grade)).map((grade) => {
    const def = STAFF_GRADES[grade];
    const lockReason = staffHireLockedReason(depot, grade);
    const requirements = meetsRequires(depot, def.requires || {});
    return {
      grade,
      label: def.label,
      cost: def.hireCost,
      visible: true,
      locked: Boolean(lockReason),
      lockReason: lockReason || null,
      requirements: requirements || null,
      maxVehicleTier: def.maxVehicleTier,
    };
  });

  const fleetShop = [1, 2, 3, 4, 5].filter((tier) => vehicleVisible(depot, tier)).map((tier) => {
    const def = VEHICLE_TIERS[tier];
    const lockReason = vehicleBuyLockedReason(depot, tier);
    const requirements = meetsRequires(depot, def.requires || {});
    return {
      tier,
      label: def.label,
      cost: def.buyCost,
      visible: true,
      locked: Boolean(lockReason),
      lockReason: lockReason || null,
      requirements: requirements || null,
      minStaffGrade: def.minStaffGrade,
      color: def.color,
    };
  });

  const jobTypes = Object.values(JOB_TYPES)
    .filter((j) => jobVisible(depot, j))
    .map((j) => {
      const lockReason = jobDispatchReadyReason(depot, j, active);
      const requirements = lockReason || meetsRequires(depot, j.requires || {});
      const staffNeed = STAFF_GRADES[j.minStaffGrade]?.label || j.minStaffGrade;
      const vehNeed = VEHICLE_TIERS[j.minVehicleTier]?.label || ('Tier ' + j.minVehicleTier);
      const locked = Boolean(lockReason);
      return {
        key: j.key,
        label: j.label,
        blurb: j.blurb,
        durationMs: computeJobDurationMs(depot, j),
        reward: computeJobReward(depot, j),
        locked,
        lockReason: lockReason || null,
        requirements: locked ? requirements : null,
        needs: staffNeed + ' + ' + vehNeed,
        minStaffGrade: j.minStaffGrade,
        minVehicleTier: j.minVehicleTier,
      };
    });

  return {
    age: hqLevel,
    ageName: OFFICE_LEVELS.levelLabel(hqLevel),
    ageBlurb: OFFICE_LEVELS.effect,
    officeLevel: hqLevel,
    officeLabel: OFFICE_LEVELS.levelLabel(hqLevel),
    plots: depot.plots,
    freePlots: freePlots(depot),
    buildings: depot.buildings,
    bays: maxBays(depot),
    bayCap: maxBaysForHq(hqLevel),
    staff,
    fleet,
    jobsCompleted: depot.jobsCompleted,
    coinBalance: walletBalance,
    sandbox: Boolean(sandbox),
    maxDrivers: maxDrivers(depot),
    maxBays: maxBays(depot),
    staffCap: staffCap(depot),
    activeJobs: active,
    jobTypes,
    ageUp: null,
    officeShop,
    plotShop,
    bayShop,
    chargerShop,
    buildingShop,
    hireShop,
    fleetShop,
    grid: {
      size: GRID_SIZE,
      ownedTiles: (depot.ownedTiles || []).map((k) => parseTileKey(k)).filter(Boolean),
      roadTiles: (depot.roadTiles || DEFAULT_ROAD_TILES).map((t) => ({ ...t })),
      buildableTiles: (depot.buildableTiles || []).map((k) => parseTileKey(k)).filter(Boolean),
      blockedTiles: (depot.blockedTiles || []).map((k) => parseTileKey(k)).filter(Boolean),
      placements: (depot.placements || []).map((p) => ({ ...p })),
      freeTiles: freeOwnedTiles(depot),
      claimable: (() => {
        const list = [];
        const owned = ownedSet(depot);
        for (const key of owned) {
          const t = parseTileKey(key);
          if (!t) continue;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = t.x + dx;
            const ny = t.y + dy;
            if (!inGrid(nx, ny) || isRoadTile(nx, ny, depot)) continue;
            if (!isBuildableTile(nx, ny, depot)) continue;
            const nk = tileKey(nx, ny);
            if (!owned.has(nk)) list.push({ x: nx, y: ny, cost: nextLandCost });
          }
        }
        const seen = new Set();
        return list.filter((t) => {
          const k = tileKey(t.x, t.y);
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });
      })(),
    },
    scene: {
      age: hqLevel,
      officeLevel: hqLevel,
      plots: depot.plots,
      bays: maxBays(depot),
      buildings: depot.buildings,
      fleet: fleet.map((v) => ({
        id: v.id,
        tier: v.tier,
        busy: v.busy,
        inspecting: v.inspecting,
        reg: v.reg,
        color: v.color,
      })),
      staffCount: staff.length,
      gridSize: GRID_SIZE,
      ownedTiles: depot.ownedTiles,
      placements: depot.placements,
      roadTiles: depot.roadTiles || DEFAULT_ROAD_TILES,
      buildableTiles: depot.buildableTiles,
      blockedTiles: depot.blockedTiles,
    },
    inspectionInfo: {
      workshopLevel,
      every: inspectRules.every,
      durationMs: inspectRules.durationMs,
      blurb: workshopLevel < 1
        ? 'No workshop — every job needs a 2h inspection.'
        : `Workshop Lv ${workshopLevel} — inspection every ${inspectRules.every} jobs (${Math.round(inspectRules.durationMs / 60000)} min).`,
    },
    buildingsView: {
      shed: hqLevel,
      workshop: workshopLevel,
      bays: maxBays(depot),
      coaches: depot.fleet.length,
      land: Math.max(0, (depot.ownedTiles || []).length - starterCount),
      wash: buildingLevel(depot, 'wash'),
      breakRoom: buildingLevel(depot, 'breakRoom'),
      opsOffice: buildingLevel(depot, 'opsOffice'),
      paintShop: buildingLevel(depot, 'paintShop'),
      chargers: buildingLevel(depot, 'chargers'),
      trainingCentre: buildingLevel(depot, 'trainingCentre'),
      tourOffice: buildingLevel(depot, 'tourOffice'),
    },
    pocNote: `${OFFICE_LEVELS.levelLabel(hqLevel)} — upgrade HQ to unlock the next tier of buildings.`,
  };
}

function pickDispatchAssets(depot, jobType, activeJobs, { staffId = null, vehicleId = null } = {}) {
  const busyStaff = new Set(activeJobs.map((j) => j.staffId).filter(Boolean));
  const busyFleet = new Set(activeJobs.map((j) => j.vehicleId).filter(Boolean));
  const busySlots = new Set(activeJobs.map((j) => j.driverSlot).filter((n) => n != null));

  depot.staff.forEach((s, i) => {
    if (busySlots.has(i)) busyStaff.add(s.id);
  });
  depot.fleet.forEach((v, i) => {
    if (busySlots.has(i)) busyFleet.add(v.id);
  });

  let staff = null;
  if (staffId) {
    staff = depot.staff.find((s) => s.id === staffId) || null;
    if (!staff) return { error: 'Staff not found.' };
    if (busyStaff.has(staff.id)) return { error: 'That driver is already out.' };
    if (staffGradeRank(staff.grade) < staffGradeRank(jobType.minStaffGrade)) {
      return { error: `Needs ${STAFF_GRADES[jobType.minStaffGrade].label} or higher.` };
    }
  } else {
    staff = depot.staff.find((s) => (
      !busyStaff.has(s.id)
      && staffGradeRank(s.grade) >= staffGradeRank(jobType.minStaffGrade)
    )) || null;
    if (!staff) {
      return {
        error: `No idle ${STAFF_GRADES[jobType.minStaffGrade]?.label || 'driver'} for this job.`,
      };
    }
  }

  let vehicle = null;
  if (vehicleId) {
    vehicle = depot.fleet.find((v) => v.id === vehicleId) || null;
    if (!vehicle) return { error: 'Vehicle not found.' };
    if (busyFleet.has(vehicle.id)) return { error: 'That coach is already out.' };
    if (isVehicleInspecting(vehicle)) {
      return { error: 'That coach is in workshop inspection.' };
    }
    if (vehicle.tier < jobType.minVehicleTier) {
      return { error: `Needs ${VEHICLE_TIERS[jobType.minVehicleTier].label} or better.` };
    }
    if (!staffCanDriveTier(staff.grade, vehicle.tier)) {
      return { error: 'That driver cannot take this coach.' };
    }
  } else {
    vehicle = depot.fleet.find((v) => (
      !busyFleet.has(v.id)
      && !isVehicleInspecting(v)
      && v.tier >= jobType.minVehicleTier
      && staffCanDriveTier(staff.grade, v.tier)
    )) || null;
    if (!vehicle) {
      const anyInspecting = depot.fleet.some((v) => isVehicleInspecting(v));
      return {
        error: anyInspecting
          ? 'No idle coach ready — some are in workshop inspection.'
          : `No idle ${VEHICLE_TIERS[jobType.minVehicleTier]?.label || 'coach'} suitable for this job.`,
      };
    }
  }

  if (activeJobs.length >= maxBays(depot)) {
    return { error: 'All bays are busy. Claim a finished job or buy another bay.' };
  }

  const driverSlot = depot.fleet.findIndex((v) => v.id === vehicle.id);
  return {
    staff,
    vehicle,
    driverSlot: driverSlot < 0 ? 0 : driverSlot,
  };
}

function applyPurchase(depot, kind, opts = {}) {
  const sandbox = Boolean(opts.sandbox);
  let next = normalizeDepot(JSON.parse(JSON.stringify(depot)));
  const tx = Number.isFinite(Number(opts.x)) ? Math.floor(Number(opts.x)) : null;
  const ty = Number.isFinite(Number(opts.y)) ? Math.floor(Number(opts.y)) : null;

  if (kind === 'age') {
    return { error: 'Ages removed — upgrade your HQ instead.' };
  }

  if (kind === 'plot' || kind === 'land') {
    if (!sandbox) {
      const lock = plotBuyLockedReason(next);
      if (lock) return { error: lock };
    }
    let tile = null;
    if (tx != null && ty != null) {
      if (!inGrid(tx, ty) || isRoadTile(tx, ty, next)) return { error: 'Invalid tile.' };
      if (!isBuildableTile(tx, ty, next) && !sandbox) return { error: 'That tile is not buildable.' };
      if (ownedSet(next).has(tileKey(tx, ty))) return { error: 'Already owned.' };
      // Must be adjacent to owned (unless sandbox)
      const owned = ownedSet(next);
      const adj = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => owned.has(tileKey(tx + dx, ty + dy)));
      if (!adj && !sandbox) return { error: 'Land must touch your yard.' };
      tile = { x: tx, y: ty };
    } else {
      tile = claimAdjacentTile(next, sandbox);
    }
    if (!tile) return { error: 'No land available to claim.' };
    if ((next.ownedTiles || []).length >= maxOwnedTilesForHq(next.officeLevel || 1) && !sandbox) {
      return { error: plotBuyLockedReason(next) || 'HQ land cap reached.' };
    }
    const cost = LAND_TILE_COST(
      (next.ownedTiles || []).length,
      next.starterTileCount || 9,
    );
    const ownedTiles = [...next.ownedTiles, tileKey(tile.x, tile.y)];
    return {
      depot: syncDerived({ ...next, ownedTiles }),
      cost,
      label: `Land (${tile.x},${tile.y})`,
    };
  }

  if (kind === 'bay') {
    if (!sandbox) {
      const lock = bayBuyLockedReason(next);
      if (lock) return { error: lock };
    }
    let spot = null;
    if (tx != null && ty != null) {
      if (!ownedSet(next).has(tileKey(tx, ty))) return { error: 'Bay must sit on owned land.' };
      if (occupiedSet(next).has(tileKey(tx, ty))) return { error: 'Tile already occupied.' };
      if (isRoadTile(tx, ty, next)) return { error: 'Cannot build on the road.' };
      if (!isBuildableTile(tx, ty, next) && !sandbox) return { error: 'That tile is not buildable.' };
      spot = { x: tx, y: ty };
    } else {
      spot = freeOwnedTiles(next)[0] || null;
    }
    if (!spot) {
      if (sandbox) {
        const claim = claimAdjacentTile(next, true);
        if (claim) {
          next = syncDerived({
            ...next,
            ownedTiles: [...next.ownedTiles, tileKey(claim.x, claim.y)],
          });
          spot = claim;
        }
      }
    }
    if (!spot) return { error: 'Need a free owned tile for a bay.' };
    const cost = BAY_COST(maxBays(next) + 1);
    const placements = [
      ...next.placements,
      { id: newId('bay'), type: 'bay', key: 'bay', level: 1, x: spot.x, y: spot.y },
    ];
    return {
      depot: syncDerived({ ...next, placements }),
      cost,
      label: 'Parking bay',
    };
  }

  if (kind === 'office') {
    const hq = next.placements.find((p) => p.type === 'hq');
    if (!hq) return { error: 'HQ missing.' };
    const current = Math.max(1, Math.floor(Number(hq.level) || 1));
    if (current >= OFFICE_LEVELS.maxLevel) return { error: 'HQ already maxed.' };
    if (!sandbox) {
      const lock = hqUpgradeLockedReason({ ...next, officeLevel: current });
      if (lock) return { error: lock };
    }
    const cost = OFFICE_LEVELS.costForLevel(current + 1);
    const placements = next.placements.map((p) => (
      p.type === 'hq' ? { ...p, level: current + 1 } : p
    ));
    return {
      depot: syncDerived({ ...next, placements }),
      cost,
      label: OFFICE_LEVELS.levelLabel(current + 1),
    };
  }

  if (kind === 'building') {
    const key = String(opts.key || '').trim();
    const def = BUILDINGS[key];
    if (!def) return { error: 'Unknown building.' };
    if (def.bayUpgrade || def.usesPlot === false) {
      return { error: 'Install chargers by upgrading a parking bay.' };
    }
    const level = buildingLevel(next, key);
    if (level >= def.maxLevel) return { error: 'Already maxed.' };
    if (!sandbox) {
      const lock = buildingLockedReason(next, key, level + 1);
      if (lock) return { error: lock };
    } else if (!buildingLevelVisible(next, key, level + 1)) {
      return { error: 'Not unlocked yet.' };
    }
    const cost = def.costForLevel(level + 1);

    if (level === 0) {
      // Place new building
      let spot = null;
      if (tx != null && ty != null) {
        if (!ownedSet(next).has(tileKey(tx, ty)) && !sandbox) {
          return { error: 'Must place on owned land.' };
        }
        if (occupiedSet(next).has(tileKey(tx, ty))) return { error: 'Tile already occupied.' };
        if (isRoadTile(tx, ty, next)) return { error: 'Cannot build on the road.' };
        if (!isBuildableTile(tx, ty, next) && !sandbox) return { error: 'That tile is not buildable.' };
        spot = { x: tx, y: ty };
        if (!ownedSet(next).has(tileKey(tx, ty))) {
          next = syncDerived({
            ...next,
            ownedTiles: [...next.ownedTiles, tileKey(tx, ty)],
          });
        }
      } else {
        spot = freeOwnedTiles(next)[0] || null;
        if (!spot && sandbox) {
          const claim = claimAdjacentTile(next, true);
          if (claim) {
            next = syncDerived({
              ...next,
              ownedTiles: [...next.ownedTiles, tileKey(claim.x, claim.y)],
            });
            spot = claim;
          }
        }
      }
      if (!spot) return { error: 'Need a free owned tile to place this building.' };
      const placements = [
        ...next.placements,
        { id: newId('bld'), type: 'building', key, level: 1, x: spot.x, y: spot.y },
      ];
      return {
        depot: syncDerived({ ...next, placements }),
        cost,
        label: def.levelLabel(1),
      };
    }

    // Upgrade existing
    const placements = next.placements.map((p) => (
      p.type === 'building' && p.key === key
        ? { ...p, level: p.level + 1 }
        : p
    ));
    return {
      depot: syncDerived({ ...next, placements }),
      cost,
      label: def.levelLabel(level + 1),
    };
  }

  if (kind === 'charger' || kind === 'bayCharger') {
    const bayId = opts.bayId ? String(opts.bayId) : null;
    const lock = chargerBayLockedReason(next, bayId, tx, ty);
    if (lock && !sandbox) return { error: lock };
    if (sandbox && meetsRequires(next, BUILDING_LEVEL_REQUIRES.chargers?.[1] || {})) {
      return { error: meetsRequires(next, BUILDING_LEVEL_REQUIRES.chargers?.[1] || {}) };
    }
    let bay = null;
    if (bayId) {
      bay = next.placements.find((p) => p.type === 'bay' && p.id === bayId) || null;
    } else if (tx != null && ty != null) {
      bay = next.placements.find((p) => p.type === 'bay' && p.x === tx && p.y === ty) || null;
    } else {
      bay = next.placements.find((p) => p.type === 'bay' && !bayHasCharger(p)) || null;
    }
    if (!bay) return { error: 'Pick a parking bay to upgrade.' };
    if (bayHasCharger(bay)) return { error: 'This bay already has a charger.' };
    const cost = BUILDINGS.chargers.costForLevel(1);
    const placements = next.placements.map((p) => (
      p.id === bay.id
        ? { ...p, level: 2, charged: true }
        : p
    ));
    return {
      depot: syncDerived({ ...next, placements }),
      cost,
      label: 'Electric charger',
    };
  }

  if (kind === 'staff') {
    const grade = String(opts.grade || '').trim();
    const def = STAFF_GRADES[grade];
    if (!def) return { error: 'Unknown staff grade.' };
    if (!staffVisible(next, grade)) {
      return { error: meetsRequires(next, def.requires || {}) || 'Not unlocked yet.' };
    }
    if (!sandbox) {
      const lock = staffHireLockedReason(next, grade);
      if (lock) return { error: lock };
    }
    const staff = [
      ...next.staff,
      { id: newId('staff'), grade, name: randomStaffName() },
    ];
    return {
      depot: { ...next, staff },
      cost: def.hireCost,
      label: def.label,
    };
  }

  if (kind === 'vehicle') {
    const tier = Math.floor(Number(opts.tier));
    const def = VEHICLE_TIERS[tier];
    if (!def) return { error: 'Unknown vehicle.' };
    if (!vehicleVisible(next, tier)) {
      return { error: meetsRequires(next, def.requires || {}) || 'Not unlocked yet.' };
    }
    if (!sandbox) {
      const lock = vehicleBuyLockedReason(next, tier);
      if (lock) return { error: lock };
    }
    let placements = next.placements;
    if (sandbox && next.fleet.length >= maxBays(next)) {
      const spot = freeOwnedTiles(next)[0] || claimAdjacentTile(next, true);
      if (spot) {
        let ownedTiles = next.ownedTiles;
        if (!ownedSet(next).has(tileKey(spot.x, spot.y))) {
          ownedTiles = [...ownedTiles, tileKey(spot.x, spot.y)];
        }
        placements = [
          ...placements,
          { id: newId('bay'), type: 'bay', key: 'bay', level: 1, x: spot.x, y: spot.y },
        ];
        next = syncDerived({ ...next, ownedTiles, placements });
        placements = next.placements;
      }
    }
    const fleet = [
      ...next.fleet,
      {
        id: newId('veh'),
        tier,
        label: def.label,
        reg: randomUkReg(),
        jobsSinceInspection: 0,
        inspectUntil: null,
      },
    ];
    return {
      depot: syncDerived({ ...next, fleet, placements }),
      cost: def.buyCost,
      label: def.label,
    };
  }

  if (kind === 'trainStaff') {
    const staffId = String(opts.staffId || '').trim();
    const staffMember = next.staff.find((s) => s.id === staffId);
    if (!staffMember) return { error: 'Driver not found.' };
    const toGrade = String(opts.grade || nextStaffGrade(staffMember.grade) || '').trim();
    const expected = nextStaffGrade(staffMember.grade);
    if (!expected || toGrade !== expected) {
      return { error: expected ? `Train to ${STAFF_GRADES[expected].label} next.` : 'Driver is already at max grade.' };
    }
    const def = STAFF_GRADES[toGrade];
    const lock = meetsRequires(next, def.requires || {});
    if (lock) return { error: lock };
    const cost = trainStaffCost(toGrade);
    const staff = next.staff.map((s) => (
      s.id === staffId ? { ...s, grade: toGrade } : s
    ));
    return {
      depot: { ...next, staff },
      cost,
      label: `Trained → ${def.label}`,
    };
  }

  if (kind === 'sellVehicle') {
    const vehicleId = String(opts.vehicleId || opts.id || '').trim();
    if ((next.fleet || []).length <= 1) {
      return { error: 'Keep at least one vehicle in the fleet.' };
    }
    const vehicle = next.fleet.find((v) => v.id === vehicleId);
    if (!vehicle) return { error: 'Vehicle not found.' };
    if (isVehicleInspecting(vehicle)) {
      return { error: 'Cannot sell a coach while it is in inspection.' };
    }
    // Caller must ensure vehicle is not on an active job (checked via serialize canSell).
    const refund = vehicleSellValue(vehicle.tier);
    const fleet = next.fleet.filter((v) => v.id !== vehicleId);
    return {
      depot: syncDerived({ ...next, fleet }),
      cost: -refund,
      refund,
      label: `Sold ${vehicle.reg || vehicle.label}`,
    };
  }

  if (kind === 'skipInspection') {
    if (!sandbox) return { error: 'Admin sandbox only.' };
    const vehicleId = String(opts.vehicleId || opts.id || '').trim();
    const fleet = next.fleet.map((v) => (
      (!vehicleId || v.id === vehicleId)
        ? { ...v, inspectUntil: null, jobsSinceInspection: 0 }
        : v
    ));
    return {
      depot: { ...next, fleet },
      cost: 0,
      label: 'Inspection skipped',
    };
  }

  return { error: 'Unknown purchase kind.' };
}

const UPGRADES = {};

module.exports = {
  AGES,
  BUILDINGS,
  BUILDING_KEYS,
  STAFF_GRADES,
  STAFF_GRADE_ORDER,
  VEHICLE_TIERS,
  JOB_TYPES,
  OFFICE_LEVELS,
  UPGRADES,
  emptyDepot,
  normalizeDepot,
  maxDrivers,
  maxBays,
  staffCap,
  freePlots,
  GRID_SIZE,
  ROAD_TILES,
  DEFAULT_ROAD_TILES,
  defaultMapConfig,
  normalizeMapConfig,
  serializeMapConfig,
  loadMapConfig,
  saveMapConfig,
  loadSpriteAnchors,
  saveSpriteAnchors,
  normalizeSpriteAnchors,
  computeJobReward,
  computeJobDurationMs,
  serializeJob,
  serializeDepot,
  jobLockedReason,
  jobDispatchReadyReason,
  pickDispatchAssets,
  applyPurchase,
  applyInspectionAfterClaim,
  staffGradeRank,
  randomUkReg,
  inspectionRules,
  upgradeLockedReason: () => null,
  xpForClaim: (reward) => Math.max(1, Math.floor(reward / 2)),
  maybeLevelUp: (depot) => depot,
  landCapacity: (depot) => maxBays(depot),
};
