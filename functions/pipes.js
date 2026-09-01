'use strict';

/**
 * Daily Pipes — rotate tiles so water fills every cell in one connected network.
 * Boards are spanning trees of the grid, scrambled by rotation (always solvable).
 * Competitive score is time to complete (durationMs ascending).
 */

const N = 1;
const E = 2;
const S = 4;
const W = 8;

const DIRS = [
  { bit: N, dr: -1, dc: 0, opp: S },
  { bit: E, dr: 0, dc: 1, opp: W },
  { bit: S, dr: 1, dc: 0, opp: N },
  { bit: W, dr: 0, dc: -1, opp: E },
];

/** Competitive Pipes starts this Europe/London day (inclusive). */
const PIPES_LIVE_FROM = '2026-08-26';
const DAILY_SIZE = 5;

function getLondonDayKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

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
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function rotateMask(mask, turns = 1) {
  let m = mask & 0xf;
  const n = ((turns % 4) + 4) % 4;
  for (let i = 0; i < n; i += 1) {
    m = ((m << 1) & 0xe) | ((m >> 3) & 0x1);
  }
  return m;
}

function cellIndex(size, row, col) {
  return row * size + col;
}

function cellCoords(size, index) {
  return { row: Math.floor(index / size), col: index % size };
}

function neighbors(size, index) {
  const { row, col } = cellCoords(size, index);
  const out = [];
  for (const dir of DIRS) {
    const nr = row + dir.dr;
    const nc = col + dir.dc;
    if (nr < 0 || nc < 0 || nr >= size || nc >= size) continue;
    out.push({ index: cellIndex(size, nr, nc), bit: dir.bit, opp: dir.opp });
  }
  return out;
}

function spanningTree(size, rng) {
  const total = size * size;
  const visited = new Uint8Array(total);
  const edges = [];
  const stack = [Math.floor(rng() * total)];
  visited[stack[0]] = 1;

  while (stack.length) {
    const cur = stack[stack.length - 1];
    const opts = neighbors(size, cur).filter((n) => !visited[n.index]);
    if (!opts.length) {
      stack.pop();
      continue;
    }
    for (let i = opts.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      [opts[i], opts[j]] = [opts[j], opts[i]];
    }
    const pick = opts[0];
    visited[pick.index] = 1;
    edges.push(cur < pick.index ? [cur, pick.index] : [pick.index, cur]);
    stack.push(pick.index);
  }

  if (edges.length !== total - 1) {
    throw new Error('Pipes generator failed to build a spanning tree.');
  }
  return edges;
}

function masksFromTree(size, edges) {
  const masks = new Uint8Array(size * size);
  const edgeSet = new Set(edges.map(([a, b]) => `${a}-${b}`));
  for (let i = 0; i < size * size; i += 1) {
    for (const n of neighbors(size, i)) {
      const key = i < n.index ? `${i}-${n.index}` : `${n.index}-${i}`;
      if (edgeSet.has(key)) masks[i] |= n.bit;
    }
  }
  return masks;
}

function analyzeBoard(size, masks) {
  const total = size * size;
  const adj = Array.from({ length: total }, () => []);
  let undirectedEdges = 0;

  for (let i = 0; i < total; i += 1) {
    const { row, col } = cellCoords(size, i);
    const mask = masks[i] & 0xf;
    for (const dir of DIRS) {
      if (!(mask & dir.bit)) continue;
      const nr = row + dir.dr;
      const nc = col + dir.dc;
      if (nr < 0 || nc < 0 || nr >= size || nc >= size) continue;
      const j = cellIndex(size, nr, nc);
      if (i < j && (masks[j] & dir.opp)) {
        adj[i].push(j);
        adj[j].push(i);
        undirectedEdges += 1;
      }
    }
  }

  const visited = new Uint8Array(total);
  const stack = [0];
  visited[0] = 1;
  let seen = 0;
  while (stack.length) {
    const cur = stack.pop();
    seen += 1;
    for (const n of adj[cur]) {
      if (visited[n]) continue;
      visited[n] = 1;
      stack.push(n);
    }
  }

  const connected = seen === total;
  const isTree = connected && undirectedEdges === total - 1;
  return {
    connected,
    undirectedEdges,
    isTree,
    solved: isTree,
    filledTiles: seen,
    totalTiles: total,
  };
}

function getEffectiveMasks(tiles) {
  return tiles.map((tile) => rotateMask(tile.baseMask, tile.rotation));
}

function isSolved(size, tiles) {
  return analyzeBoard(size, getEffectiveMasks(tiles)).solved;
}

function generatePipesPuzzle({ size = DAILY_SIZE, seed = null, id = null, scramble = true } = {}) {
  const n = Number(size);
  if (!(Number.isInteger(n) && n >= 3 && n <= 25)) {
    throw new Error(`Unsupported pipes size: ${size}`);
  }
  const seedKey = seed == null ? `pipes:rand:${Date.now()}` : String(seed);
  const rng = mulberry32(hashString(seedKey));
  const tree = spanningTree(n, rng);
  const baseMasks = masksFromTree(n, tree);

  const tiles = [];
  for (let i = 0; i < n * n; i += 1) {
    const rotation = scramble ? Math.floor(rng() * 4) : 0;
    tiles.push({
      baseMask: baseMasks[i],
      rotation,
      pinned: false,
    });
  }

  if (scramble && isSolved(n, tiles)) {
    for (let i = 0; i < tiles.length; i += 1) {
      if (tiles[i].baseMask === 0 || tiles[i].baseMask === 0xf) continue;
      tiles[i] = { ...tiles[i], rotation: (tiles[i].rotation + 1) % 4 };
      if (!isSolved(n, tiles)) break;
    }
  }

  return {
    id: id || `pipes-${n}x${n}-${hashString(seedKey).toString(16)}`,
    size: n,
    seed: seedKey,
    tiles,
    title: `${n}×${n} Pipes`,
  };
}

function getPuzzleForDay(dayKey, size = DAILY_SIZE) {
  const key = String(dayKey || '');
  return generatePipesPuzzle({
    size,
    seed: `pipes:v1:${size}:${key}`,
    id: `pipes-day-${size}-${key}`,
  });
}

function publicPuzzle(puzzle) {
  return {
    id: puzzle.id,
    size: puzzle.size,
    title: puzzle.title || `${puzzle.size}×${puzzle.size} Pipes`,
    tiles: (puzzle.tiles || []).map((tile) => ({
      baseMask: tile.baseMask & 0xf,
      rotation: ((Number(tile.rotation) % 4) + 4) % 4,
    })),
  };
}

function evaluateRotations(puzzle, rotations) {
  const size = puzzle.size;
  const total = size * size;
  const list = Array.isArray(rotations) ? rotations : [];
  if (list.length !== total) {
    return { solved: false, reason: 'length', filledTiles: 0, totalTiles: total };
  }
  const tiles = puzzle.tiles.map((tile, index) => ({
    baseMask: tile.baseMask,
    rotation: ((Number(list[index]) % 4) + 4) % 4,
  }));
  const analysis = analyzeBoard(size, getEffectiveMasks(tiles));
  return {
    solved: Boolean(analysis.solved),
    reason: analysis.solved ? null : 'unsolved',
    filledTiles: analysis.filledTiles,
    totalTiles: analysis.totalTiles,
    undirectedEdges: analysis.undirectedEdges,
    rotations: tiles.map((t) => t.rotation),
  };
}

function serializePipesGame(data = {}, { includeRotations = false } = {}) {
  const out = {
    dayKey: data.dayKey || null,
    status: data.status || 'in_progress',
    moves: Number(data.moves) || 0,
    durationMs: Number.isFinite(data.durationMs) ? data.durationMs : null,
    startedAt: data.startedAt || null,
    completedAt: data.completedAt?.toDate?.()?.toISOString?.() || data.completedAt || null,
  };
  if (includeRotations && Array.isArray(data.rotations)) {
    out.rotations = data.rotations;
  }
  return out;
}

function comparePipesRows(a, b) {
  if (a.durationMs !== b.durationMs) return a.durationMs - b.durationMs;
  if (a.moves !== b.moves) return a.moves - b.moves;
  const aTime = a.completedAt ? new Date(a.completedAt).getTime() : Number.MAX_SAFE_INTEGER;
  const bTime = b.completedAt ? new Date(b.completedAt).getTime() : Number.MAX_SAFE_INTEGER;
  return aTime - bTime;
}

function pipesResultLabel(row, formatDuration) {
  const hasDuration = Number.isFinite(row.durationMs) && row.durationMs < Number.MAX_SAFE_INTEGER;
  if (hasDuration && typeof formatDuration === 'function') {
    return formatDuration(row.durationMs);
  }
  if (hasDuration) {
    const sec = Math.floor(row.durationMs / 1000);
    const mm = String(Math.floor(sec / 60)).padStart(2, '0');
    const ss = String(sec % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  }
  return 'Solved';
}

module.exports = {
  PIPES_LIVE_FROM,
  DAILY_SIZE,
  getLondonDayKey,
  getPuzzleForDay,
  generatePipesPuzzle,
  publicPuzzle,
  evaluateRotations,
  serializePipesGame,
  comparePipesRows,
  pipesResultLabel,
  isSolved,
  analyzeBoard,
};
