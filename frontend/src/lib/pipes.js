/**
 * Pipes — rotate tiles so water fills every cell in one connected network.
 * Puzzles are generated from a spanning tree of the grid, then scrambled by rotation,
 * so every board is guaranteed solvable. Competitive score is time to complete.
 */

export const N = 1; // north
export const E = 2; // east
export const S = 4; // south
export const W = 8; // west

const DIRS = [
  { bit: N, dr: -1, dc: 0, opp: S },
  { bit: E, dr: 0, dc: 1, opp: W },
  { bit: S, dr: 1, dc: 0, opp: N },
  { bit: W, dr: 0, dc: -1, opp: E },
];

export const PIPES_SIZES = [4, 5, 7, 10];

export function hashString(input) {
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

/** Rotate openings 90° clockwise. */
export function rotateMask(mask, turns = 1) {
  let m = mask & 0xf;
  const n = ((turns % 4) + 4) % 4;
  for (let i = 0; i < n; i += 1) {
    m = ((m << 1) & 0xe) | ((m >> 3) & 0x1);
  }
  return m;
}

export function cellIndex(size, row, col) {
  return row * size + col;
}

export function cellCoords(size, index) {
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

/**
 * Build a random spanning tree on the size×size grid (DFS with shuffled neighbors).
 * Returns undirected edges as [a, b] with a < b.
 */
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
    // Fisher–Yates shuffle of options
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

/** Convert spanning-tree edges into per-cell opening bitmasks (solved orientation). */
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

/**
 * Analyse current board openings.
 * Connections only count when both sides open toward each other.
 */
export function analyzeBoard(size, masks) {
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
    componentsVisited: seen,
  };
}

export function getEffectiveMasks(tiles) {
  return tiles.map((tile) => rotateMask(tile.baseMask, tile.rotation));
}

export function isSolved(size, tiles) {
  return analyzeBoard(size, getEffectiveMasks(tiles)).solved;
}

/**
 * Generate a scrambled, always-solvable pipes puzzle.
 */
export function generatePipesPuzzle({
  size = 5,
  seed = null,
  id = null,
  scramble = true,
} = {}) {
  const n = Number(size);
  if (!PIPES_SIZES.includes(n) && !(Number.isInteger(n) && n >= 3 && n <= 25)) {
    throw new Error(`Unsupported pipes size: ${size}`);
  }
  const seedKey = seed == null ? `pipes:rand:${Date.now()}:${Math.random()}` : String(seed);
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

  // Ensure scramble actually changes something when possible
  if (scramble && isSolved(n, tiles)) {
    for (let i = 0; i < tiles.length; i += 1) {
      if (tiles[i].baseMask === 0 || tiles[i].baseMask === 0xf) continue;
      tiles[i] = { ...tiles[i], rotation: (tiles[i].rotation + 1) % 4 };
      if (!isSolved(n, tiles)) break;
    }
  }

  const puzzleId = id || `pipes-${n}x${n}-${hashString(seedKey).toString(16)}`;
  return {
    id: puzzleId,
    size: n,
    seed: seedKey,
    tiles,
    title: `${n}×${n} Pipes`,
  };
}

export function getPuzzleForDay(dayKey, size = 5) {
  const key = String(dayKey || '');
  return generatePipesPuzzle({
    size,
    seed: `pipes:v1:${size}:${key}`,
    id: `pipes-day-${size}-${key}`,
  });
}

export function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const totalSec = Math.floor(ms / 1000);
  const mm = String(Math.floor(totalSec / 60)).padStart(2, '0');
  const ss = String(totalSec % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

export function clonePuzzle(puzzle) {
  return {
    ...puzzle,
    tiles: puzzle.tiles.map((t) => ({ ...t })),
  };
}

/** Curated seed list for the Dev sandbox (each regenerated from fixed seeds = stable). */
export const PIPES_SEED_PUZZLES = [
  { size: 4, seed: 'pipes:seed:easy-4a', label: 'Practice 4×4 · easy' },
  { size: 4, seed: 'pipes:seed:easy-4b', label: 'Practice 4×4 · 2' },
  { size: 5, seed: 'pipes:seed:mid-5a', label: 'Practice 5×5 · 1' },
  { size: 5, seed: 'pipes:seed:mid-5b', label: 'Practice 5×5 · 2' },
  { size: 7, seed: 'pipes:seed:mid-7a', label: 'Practice 7×7 · 1' },
  { size: 7, seed: 'pipes:seed:hard-7b', label: 'Practice 7×7 · 2' },
  { size: 10, seed: 'pipes:seed:hard-10a', label: 'Practice 10×10 · 1' },
  { size: 10, seed: 'pipes:seed:hard-10b', label: 'Practice 10×10 · 2' },
].map((entry) => {
  const puzzle = generatePipesPuzzle({
    size: entry.size,
    seed: entry.seed,
    id: entry.seed,
  });
  return { ...puzzle, title: entry.label };
});

export function getPuzzleById(puzzleId) {
  return PIPES_SEED_PUZZLES.find((p) => p.id === puzzleId) || null;
}

/** Verify a generated puzzle’s base orientation is a valid solution (no scramble). */
export function assertPuzzleSolvable(puzzle) {
  const solvedTiles = puzzle.tiles.map((t) => ({ ...t, rotation: 0 }));
  const check = analyzeBoard(puzzle.size, getEffectiveMasks(solvedTiles));
  if (!check.solved) {
    throw new Error(`Pipes puzzle ${puzzle.id} base state is not a spanning tree.`);
  }
  return true;
}

// Validate seed bank at module load
for (const puzzle of PIPES_SEED_PUZZLES) {
  assertPuzzleSolvable(puzzle);
}
