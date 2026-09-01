'use strict';

/**
 * Enclose (cow) — daily puzzle + scoring for Fun rotation.
 * Mirrors frontend/src/lib/enclose.js for server-side evaluate/leaderboard.
 */

const { getLondonDayKey } = require('./funRotation');

const ITEM = {
  CHERRY: 'cherry',
  APPLE: 'apple',
  BEE: 'bee',
};

const ITEM_BONUS = {
  [ITEM.CHERRY]: 3,
  [ITEM.APPLE]: 10,
  [ITEM.BEE]: -5,
};

const DIRS = [
  [0, 1],
  [0, -1],
  [1, 0],
  [-1, 0],
];

/** Competitive Enclose starts this Europe/London day (inclusive). Before: practice only. */
const ENCLOSE_LIVE_FROM = '2026-08-04';

const SEED_PUZZLES = [
  {
    id: 'tutorial-1',
    title: 'Tutorial · first pen',
    rows: 7,
    cols: 7,
    wallBudget: 10,
    horse: { r: 3, c: 3 },
    water: [],
    items: {},
    portals: [],
  },
  {
    id: 'meadow-1',
    title: 'Meadow starter',
    rows: 9,
    cols: 9,
    wallBudget: 12,
    horse: { r: 4, c: 4 },
    water: ['0,3', '0,4', '0,5', '8,3', '8,4', '8,5', '3,0', '4,0', '5,0', '3,8', '4,8', '5,8'],
    items: {
      '1,1': ITEM.CHERRY,
      '1,7': ITEM.CHERRY,
      '7,1': ITEM.APPLE,
    },
    portals: [],
  },
  {
    id: 'ponds-1',
    title: 'Twin ponds',
    rows: 11,
    cols: 11,
    wallBudget: 16,
    horse: { r: 5, c: 5 },
    water: [
      '1,1', '1,2', '1,3', '2,1', '2,3', '3,1', '3,2', '3,3',
      '7,7', '7,8', '7,9', '8,7', '8,9', '9,7', '9,8', '9,9',
    ],
    items: {
      '1,5': ITEM.APPLE,
      '5,1': ITEM.CHERRY,
      '5,9': ITEM.CHERRY,
      '9,5': ITEM.BEE,
    },
    portals: [],
  },
  {
    id: 'portal-1',
    title: 'Portal paddock',
    rows: 10,
    cols: 10,
    wallBudget: 16,
    horse: { r: 4, c: 4 },
    water: [
      '0,0', '0,1', '1,0',
      '0,8', '0,9', '1,9',
      '8,0', '9,0', '9,1',
      '8,9', '9,8', '9,9',
    ],
    items: {
      '2,7': ITEM.APPLE,
      '7,2': ITEM.CHERRY,
      '7,7': ITEM.BEE,
    },
    portals: [['1,5', '8,5']],
  },
  {
    id: 'tight-1',
    title: 'Tight fence',
    rows: 8,
    cols: 8,
    wallBudget: 12,
    horse: { r: 3, c: 3 },
    water: ['0,0', '0,1', '1,0', '6,7', '7,6', '7,7'],
    items: {
      '1,5': ITEM.CHERRY,
      '5,1': ITEM.CHERRY,
      '6,4': ITEM.APPLE,
    },
    portals: [],
  },
];

function hashString(input) {
  let h = 2166136261;
  const s = String(input || '');
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function cellKey(r, c) {
  return `${r},${c}`;
}

function parseKey(key) {
  const [r, c] = String(key).split(',').map(Number);
  return { r, c };
}

function inBounds(puzzle, r, c) {
  return r >= 0 && c >= 0 && r < puzzle.rows && c < puzzle.cols;
}

function isBorder(puzzle, r, c) {
  return r === 0 || c === 0 || r === puzzle.rows - 1 || c === puzzle.cols - 1;
}

function horseRingCells(horse) {
  const { r, c } = horse || {};
  if (!Number.isInteger(r) || !Number.isInteger(c)) return [];
  const cells = [];
  for (let dr = -1; dr <= 1; dr += 1) {
    for (let dc = -1; dc <= 1; dc += 1) {
      if (dr === 0 && dc === 0) continue;
      cells.push({ r: r + dr, c: c + dc });
    }
  }
  return cells;
}

function baseTile(puzzle, r, c) {
  const water = new Set(puzzle.water || []);
  return water.has(cellKey(r, c)) ? 'water' : 'grass';
}

function itemAt(puzzle, r, c) {
  return (puzzle.items || {})[cellKey(r, c)] || null;
}

function portalPartner(puzzle, r, c) {
  const key = cellKey(r, c);
  for (const pair of puzzle.portals || []) {
    if (!Array.isArray(pair) || pair.length !== 2) continue;
    if (pair[0] === key) return parseKey(pair[1]);
    if (pair[1] === key) return parseKey(pair[0]);
  }
  return null;
}

function canPlaceWall(puzzle, walls, r, c) {
  if (!inBounds(puzzle, r, c)) return false;
  if (baseTile(puzzle, r, c) === 'water') return false;
  const horse = puzzle.horse || {};
  if (horse.r === r && horse.c === c) return false;
  if (itemAt(puzzle, r, c)) return false;
  if (portalPartner(puzzle, r, c)) return false;
  return true;
}

function isPassable(puzzle, walls, r, c) {
  if (!inBounds(puzzle, r, c)) return false;
  if (baseTile(puzzle, r, c) === 'water') return false;
  if (walls.has(cellKey(r, c))) return false;
  return true;
}

function analyzeEnclosure(puzzle, walls) {
  const wallSet = walls instanceof Set ? walls : new Set(walls || []);
  const horse = puzzle.horse || { r: 0, c: 0 };
  if (!isPassable(puzzle, wallSet, horse.r, horse.c)) {
    return {
      escaped: true,
      score: 0,
      breakdown: { tiles: 0, cherries: 0, apples: 0, bees: 0, bonus: 0 },
    };
  }

  const reachable = new Set();
  const queue = [{ r: horse.r, c: horse.c }];
  reachable.add(cellKey(horse.r, horse.c));
  let escaped = false;

  while (queue.length) {
    const { r, c } = queue.shift();
    if (isBorder(puzzle, r, c)) escaped = true;

    const neighbors = DIRS.map(([dr, dc]) => ({ r: r + dr, c: c + dc }));
    const partner = portalPartner(puzzle, r, c);
    if (partner) neighbors.push(partner);

    for (const next of neighbors) {
      if (!isPassable(puzzle, wallSet, next.r, next.c)) continue;
      const key = cellKey(next.r, next.c);
      if (reachable.has(key)) continue;
      reachable.add(key);
      queue.push(next);
    }
  }

  if (escaped) {
    return {
      escaped: true,
      score: 0,
      breakdown: { tiles: 0, cherries: 0, apples: 0, bees: 0, bonus: 0 },
    };
  }

  let tiles = 0;
  let cherries = 0;
  let apples = 0;
  let bees = 0;
  let bonus = 0;
  for (const key of reachable) {
    tiles += 1;
    const { r, c } = parseKey(key);
    const item = itemAt(puzzle, r, c);
    if (item === ITEM.CHERRY) {
      cherries += 1;
      bonus += ITEM_BONUS[ITEM.CHERRY];
    } else if (item === ITEM.APPLE) {
      apples += 1;
      bonus += ITEM_BONUS[ITEM.APPLE];
    } else if (item === ITEM.BEE) {
      bees += 1;
      bonus += ITEM_BONUS[ITEM.BEE];
    }
  }

  return {
    escaped: false,
    score: tiles + bonus,
    breakdown: { tiles, cherries, apples, bees, bonus },
  };
}

function ringKeys(horse) {
  return new Set(horseRingCells(horse).map(({ r, c }) => cellKey(r, c)));
}

function starterPenWalls(puzzle) {
  const walls = new Set();
  for (const { r, c } of horseRingCells(puzzle.horse)) {
    if (canPlaceWall(puzzle, walls, r, c)) walls.add(cellKey(r, c));
  }
  return walls;
}

function hasGuaranteedStarterPen(puzzle) {
  const horse = puzzle.horse || {};
  for (const { r, c } of horseRingCells(horse)) {
    if (!inBounds(puzzle, r, c)) return false;
    if (baseTile(puzzle, r, c) === 'water') continue;
    if (!canPlaceWall(puzzle, new Set(), r, c)) return false;
  }
  const pen = starterPenWalls(puzzle);
  if (pen.size > (puzzle.wallBudget || 0)) return false;
  return !analyzeEnclosure(puzzle, pen).escaped;
}

function getPuzzleForDay(dayKey) {
  const rand = mulberry32(hashString(`enclose:v2:${dayKey}`));
  const size = 9 + Math.floor(rand() * 3);
  const rows = size;
  const cols = size;
  const horse = {
    r: 2 + Math.floor(rand() * (rows - 4)),
    c: 2 + Math.floor(rand() * (cols - 4)),
  };
  const reserved = ringKeys(horse);
  reserved.add(cellKey(horse.r, horse.c));

  const water = new Set();
  const pondCount = 2 + Math.floor(rand() * 3);
  for (let p = 0; p < pondCount; p += 1) {
    const pr = Math.floor(rand() * rows);
    const pc = Math.floor(rand() * cols);
    const w = 1 + Math.floor(rand() * 3);
    const h = 1 + Math.floor(rand() * 3);
    for (let r = pr; r < Math.min(rows, pr + h); r += 1) {
      for (let c = pc; c < Math.min(cols, pc + w); c += 1) {
        const key = cellKey(r, c);
        if (reserved.has(key)) continue;
        water.add(key);
      }
    }
  }

  const items = {};
  const placeItem = (type) => {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const r = Math.floor(rand() * rows);
      const c = Math.floor(rand() * cols);
      const key = cellKey(r, c);
      if (reserved.has(key) || water.has(key) || items[key]) continue;
      items[key] = type;
      return;
    }
  };
  placeItem(ITEM.APPLE);
  placeItem(ITEM.CHERRY);
  placeItem(ITEM.CHERRY);
  if (rand() > 0.35) placeItem(ITEM.BEE);

  let portals = [];
  if (rand() > 0.55) {
    const picks = [];
    for (let attempt = 0; attempt < 80 && picks.length < 2; attempt += 1) {
      const r = Math.floor(rand() * rows);
      const c = Math.floor(rand() * cols);
      const key = cellKey(r, c);
      if (reserved.has(key) || water.has(key) || items[key]) continue;
      if (picks.includes(key)) continue;
      picks.push(key);
    }
    if (picks.length === 2) portals = [picks];
  }

  const wallBudget = 12 + Math.floor(rand() * 6);
  const puzzle = {
    id: `daily-${dayKey}`,
    title: `Daily Enclose · ${dayKey}`,
    dayKey,
    rows,
    cols,
    wallBudget,
    horse,
    water: [...water],
    items,
    portals,
    generated: true,
  };

  if (!hasGuaranteedStarterPen(puzzle)) {
    puzzle.water = puzzle.water.filter((key) => !reserved.has(key));
    for (const key of reserved) delete puzzle.items[key];
    puzzle.portals = (puzzle.portals || []).filter(
      ([a, b]) => !reserved.has(a) && !reserved.has(b),
    );
  }

  return puzzle;
}

function clonePuzzle(puzzle) {
  return {
    ...puzzle,
    horse: { ...(puzzle.horse || {}) },
    water: [...(puzzle.water || [])],
    items: { ...(puzzle.items || {}) },
    portals: (puzzle.portals || []).map((pair) => [...pair]),
  };
}

function getEncloseDayKey(date = new Date()) {
  return getLondonDayKey(date);
}

function isEncloseLive(dayKey = getEncloseDayKey()) {
  return String(dayKey || '') >= ENCLOSE_LIVE_FROM;
}

function isEnclosePracticeDay(dayKey = getEncloseDayKey()) {
  return !isEncloseLive(dayKey);
}

async function resolveEnclosePuzzle(dayKey) {
  return clonePuzzle(getPuzzleForDay(dayKey));
}

function publicEnclosePuzzle(puzzle) {
  if (!puzzle) return null;
  return {
    id: puzzle.id,
    title: puzzle.title,
    dayKey: puzzle.dayKey || null,
    rows: puzzle.rows,
    cols: puzzle.cols,
    wallBudget: puzzle.wallBudget,
    horse: { ...(puzzle.horse || {}) },
    water: [...(puzzle.water || [])],
    items: { ...(puzzle.items || {}) },
    portals: (puzzle.portals || []).map((pair) => [...pair]),
  };
}

function normalizeWalls(walls) {
  if (Array.isArray(walls)) return walls.map(String).filter(Boolean);
  if (walls instanceof Set) return [...walls].map(String);
  return [];
}

function evaluateEncloseSubmission(puzzle, wallsInput) {
  const walls = normalizeWalls(wallsInput);
  if (walls.length > (puzzle.wallBudget || 0)) {
    const err = new Error(`Too many fences (max ${puzzle.wallBudget}).`);
    err.status = 400;
    throw err;
  }
  for (const key of walls) {
    const { r, c } = parseKey(key);
    if (!canPlaceWall(puzzle, new Set(), r, c)) {
      const err = new Error(`Illegal fence at ${key}.`);
      err.status = 400;
      throw err;
    }
  }
  const analysis = analyzeEnclosure(puzzle, walls);
  if (analysis.escaped) {
    return {
      status: 'lost',
      escaped: true,
      score: 0,
      walls,
      breakdown: analysis.breakdown,
    };
  }
  return {
    status: 'won',
    escaped: false,
    score: analysis.score,
    walls,
    breakdown: analysis.breakdown,
  };
}

function serializeEncloseGame(game = {}) {
  return {
    dayKey: game.dayKey || null,
    status: game.status || 'in_progress',
    score: Number(game.score) || 0,
    escaped: Boolean(game.escaped),
    walls: Array.isArray(game.walls) ? game.walls : [],
    breakdown: game.breakdown || null,
    startedAt: game.startedAt || null,
    durationMs: Number.isFinite(Number(game.durationMs)) ? Number(game.durationMs) : null,
    completedAt: game.completedAt || null,
  };
}

module.exports = {
  ENCLOSE_LIVE_FROM,
  SEED_PUZZLES,
  ITEM,
  ITEM_BONUS,
  getEncloseDayKey,
  isEncloseLive,
  isEnclosePracticeDay,
  getPuzzleForDay,
  resolveEnclosePuzzle,
  publicEnclosePuzzle,
  evaluateEncloseSubmission,
  serializeEncloseGame,
  analyzeEnclosure,
  clonePuzzle,
};
