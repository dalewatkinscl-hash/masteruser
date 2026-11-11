/**
 * Pigment Pour game logic, solver, puzzle generator, and Web Audio effects.
 * A satisfying color-sorting liquid puzzle clone.
 */

export const TUBE_CAPACITY = 4;

export const PIGMENT_COLORS = {
  crimson: {
    id: 'crimson',
    name: 'Crimson',
    hex: '#ef4444',
    from: '#f87171',
    to: '#dc2626',
    border: '#ef4444',
    glow: 'rgba(239, 68, 68, 0.45)',
    text: '#ffffff',
  },
  royal: {
    id: 'royal',
    name: 'Royal Blue',
    hex: '#3b82f6',
    from: '#60a5fa',
    to: '#2563eb',
    border: '#3b82f6',
    glow: 'rgba(59, 130, 246, 0.45)',
    text: '#ffffff',
  },
  amber: {
    id: 'amber',
    name: 'Amber Gold',
    hex: '#f59e0b',
    from: '#fbbf24',
    to: '#d97706',
    border: '#f59e0b',
    glow: 'rgba(245, 158, 11, 0.45)',
    text: '#ffffff',
  },
  emerald: {
    id: 'emerald',
    name: 'Emerald',
    hex: '#10b981',
    from: '#34d399',
    to: '#059669',
    border: '#10b981',
    glow: 'rgba(16, 185, 129, 0.45)',
    text: '#ffffff',
  },
  purple: {
    id: 'purple',
    name: 'Amethyst',
    hex: '#8b5cf6',
    from: '#a78bfa',
    to: '#7c3aed',
    border: '#8b5cf6',
    glow: 'rgba(139, 92, 246, 0.45)',
    text: '#ffffff',
  },
  coral: {
    id: 'coral',
    name: 'Coral Orange',
    hex: '#f97316',
    from: '#fb923c',
    to: '#ea580c',
    border: '#f97316',
    glow: 'rgba(249, 115, 22, 0.45)',
    text: '#ffffff',
  },
  pink: {
    id: 'pink',
    name: 'Hot Pink',
    hex: '#ec4899',
    from: '#f472b6',
    to: '#db2777',
    border: '#ec4899',
    glow: 'rgba(236, 72, 153, 0.45)',
    text: '#ffffff',
  },
  cyan: {
    id: 'cyan',
    name: 'Cyan Teal',
    hex: '#06b6d4',
    from: '#22d3ee',
    to: '#0891b2',
    border: '#06b6d4',
    glow: 'rgba(6, 182, 212, 0.45)',
    text: '#ffffff',
  },
  lime: {
    id: 'lime',
    name: 'Lime Spark',
    hex: '#84cc16',
    from: '#a3e635',
    to: '#65a30d',
    border: '#84cc16',
    glow: 'rgba(132, 204, 22, 0.45)',
    text: '#ffffff',
  },
};

export const COLOR_KEYS = Object.keys(PIGMENT_COLORS);

/**
 * Gets top color of tube or null.
 */
export function getTopColor(tube) {
  if (!tube || tube.length === 0) return null;
  return tube[tube.length - 1];
}

/**
 * Counts how many segments of the top color are contiguous at the top.
 */
export function getTopRunLength(tube) {
  if (!tube || tube.length === 0) return 0;
  const topColor = tube[tube.length - 1];
  let count = 0;
  for (let i = tube.length - 1; i >= 0; i -= 1) {
    if (tube[i] === topColor) count += 1;
    else break;
  }
  return count;
}

/**
 * Checks if a tube is full of a single color.
 */
export function isTubeCompleted(tube, capacity = TUBE_CAPACITY) {
  if (!tube || tube.length === 0) return false;
  if (tube.length !== capacity) return false;
  const first = tube[0];
  return tube.every((c) => c === first);
}

/**
 * Checks if the entire board is solved.
 */
export function isBoardSolved(tubes, capacity = TUBE_CAPACITY) {
  return tubes.every((tube) => tube.length === 0 || isTubeCompleted(tube, capacity));
}

/**
 * Validates whether a pour from fromIndex to toIndex is permitted.
 */
export function canPour(tubes, fromIndex, toIndex, capacity = TUBE_CAPACITY) {
  if (fromIndex === toIndex) return false;
  const fromTube = tubes[fromIndex];
  const toTube = tubes[toIndex];
  if (!fromTube || fromTube.length === 0) return false;
  if (!toTube || toTube.length >= capacity) return false;

  // If already completely sorted and sealed, don't break it up unless strictly needed
  if (isTubeCompleted(fromTube, capacity)) return false;

  const fromColor = getTopColor(fromTube);
  const toColor = getTopColor(toTube);

  if (toTube.length === 0) {
    // Avoid redundant move: if fromTube contains only 1 color, pouring to empty tube achieves nothing
    const isSingleColorSource = fromTube.every((c) => c === fromColor);
    if (isSingleColorSource) return false;
    return true;
  }

  return fromColor === toColor;
}

/**
 * Executes a pour and returns the new board state and pour metadata.
 */
export function executePour(tubes, fromIndex, toIndex, capacity = TUBE_CAPACITY) {
  if (!canPour(tubes, fromIndex, toIndex, capacity)) return null;

  const nextTubes = tubes.map((t) => [...t]);
  const fromTube = nextTubes[fromIndex];
  const toTube = nextTubes[toIndex];

  const color = getTopColor(fromTube);
  const run = getTopRunLength(fromTube);
  const availableSpace = capacity - toTube.length;
  const pourCount = Math.min(run, availableSpace);

  for (let i = 0; i < pourCount; i += 1) {
    fromTube.pop();
    toTube.push(color);
  }

  const justCompleted = isTubeCompleted(toTube, capacity);

  return {
    tubes: nextTubes,
    fromIndex,
    toIndex,
    pourCount,
    color,
    justCompleted,
  };
}

/**
 * Canonical state hash for duplicate detection in solver.
 */
function canonicalState(tubes) {
  return tubes
    .map((t) => t.join(','))
    .sort()
    .join('|');
}

/**
 * BFS Solver: returns shortest path of moves {from, to} or null if unsolvable.
 */
export function solvePigmentPour(initialTubes, capacity = TUBE_CAPACITY, maxIterations = 25000) {
  if (isBoardSolved(initialTubes, capacity)) return [];

  const queue = [{ tubes: initialTubes, moves: [] }];
  const visited = new Set();
  visited.add(canonicalState(initialTubes));

  let iterations = 0;

  while (queue.length > 0 && iterations < maxIterations) {
    iterations += 1;
    const current = queue.shift();

    for (let from = 0; from < current.tubes.length; from += 1) {
      if (current.tubes[from].length === 0) continue;
      if (isTubeCompleted(current.tubes[from], capacity)) continue;

      for (let to = 0; to < current.tubes.length; to += 1) {
        if (from === to) continue;

        if (canPour(current.tubes, from, to, capacity)) {
          const result = executePour(current.tubes, from, to, capacity);
          if (!result) continue;

          if (isBoardSolved(result.tubes, capacity)) {
            return [...current.moves, { from, to, color: result.color, count: result.pourCount }];
          }

          const stateKey = canonicalState(result.tubes);
          if (!visited.has(stateKey)) {
            visited.add(stateKey);
            queue.push({
              tubes: result.tubes,
              moves: [...current.moves, { from, to, color: result.color, count: result.pourCount }],
            });
          }
        }
      }
    }
  }

  return null; // Unsolvable or exceeded search limit
}

/**
 * Finds any single strategic hint move.
 */
export function getHintMove(tubes, capacity = TUBE_CAPACITY) {
  const solution = solvePigmentPour(tubes, capacity, 15000);
  if (solution && solution.length > 0) {
    return solution[0];
  }
  return null;
}

/**
 * Simple pseudo-random number generator with seed.
 */
function createSeededRandom(seedInt) {
  let s = seedInt % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/**
 * Hash a string to a 32-bit positive integer.
 */
export function hashStringToInt(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) + 1;
}

/**
 * Generates a verified solvable puzzle with the given color count and empty tubes.
 */
export function generateSolvablePuzzle({
  colorCount = 6,
  emptyCount = 2,
  seed = Date.now(),
  minMoves = 10,
  maxAttempts = 50,
}) {
  const selectedColors = COLOR_KEYS.slice(0, Math.min(colorCount, COLOR_KEYS.length));
  const rand = createSeededRandom(typeof seed === 'number' ? seed : hashStringToInt(String(seed)));

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    // 1. Create a pool of 4 units per color
    const pool = [];
    selectedColors.forEach((color) => {
      for (let i = 0; i < TUBE_CAPACITY; i += 1) {
        pool.push(color);
      }
    });

    // 2. Shuffle pool
    for (let i = pool.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rand() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    // 3. Fill colorCount tubes
    const tubes = [];
    for (let i = 0; i < colorCount; i += 1) {
      tubes.push(pool.slice(i * TUBE_CAPACITY, (i + 1) * TUBE_CAPACITY));
    }

    // 4. Add empty tubes
    for (let i = 0; i < emptyCount; i += 1) {
      tubes.push([]);
    }

    // Check that we didn't accidentally generate an already-solved tube
    const alreadySolvedCount = tubes.filter((t) => isTubeCompleted(t, TUBE_CAPACITY)).length;
    if (alreadySolvedCount > 0) continue;

    // 5. Test solvability with BFS
    const solution = solvePigmentPour(tubes, TUBE_CAPACITY, 12000);
    if (solution && solution.length >= minMoves) {
      return {
        id: `gen-${colorCount}-${seed}-${attempt}`,
        tubes,
        colorCount,
        emptyCount,
        minMoves: solution.length,
        solution,
      };
    }
  }

  // Fallback to built-in verified seeds if random generation times out
  const fallback = SEED_LEVELS.find((lvl) => lvl.colorCount === colorCount) || SEED_LEVELS[3];
  return {
    id: `fallback-${fallback.id}`,
    tubes: fallback.tubes.map((t) => [...t]),
    colorCount: fallback.colorCount,
    emptyCount: fallback.emptyCount,
    minMoves: fallback.minMoves,
  };
}

/**
 * Built-in hand-crafted progression levels.
 */
export const SEED_LEVELS = [
  {
    id: 'level-1',
    title: 'Level 1 · The Basics',
    subtitle: '3 Colors · 1 Empty Tube',
    colorCount: 3,
    emptyCount: 1,
    minMoves: 6,
    tubes: [
      ['crimson', 'royal', 'amber', 'crimson'],
      ['royal', 'amber', 'crimson', 'royal'],
      ['amber', 'crimson', 'royal', 'amber'],
      [],
    ],
  },
  {
    id: 'level-2',
    title: 'Level 2 · Double Buffer',
    subtitle: '4 Colors · 2 Empty Tubes',
    colorCount: 4,
    emptyCount: 2,
    minMoves: 10,
    tubes: [
      ['emerald', 'crimson', 'royal', 'amber'],
      ['royal', 'amber', 'emerald', 'crimson'],
      ['amber', 'emerald', 'crimson', 'royal'],
      ['crimson', 'royal', 'amber', 'emerald'],
      [],
      [],
    ],
  },
  {
    id: 'level-3',
    title: 'Level 3 · Prism Sort',
    subtitle: '5 Colors · 2 Empty Tubes',
    colorCount: 5,
    emptyCount: 2,
    minMoves: 14,
    tubes: [
      ['purple', 'emerald', 'royal', 'crimson'],
      ['amber', 'purple', 'emerald', 'royal'],
      ['crimson', 'amber', 'purple', 'emerald'],
      ['royal', 'crimson', 'amber', 'purple'],
      ['emerald', 'royal', 'crimson', 'amber'],
      [],
      [],
    ],
  },
  {
    id: 'level-4',
    title: 'Level 4 · Reddit Daily Standard',
    subtitle: '6 Colors · 2 Empty Tubes',
    colorCount: 6,
    emptyCount: 2,
    minMoves: 18,
    tubes: [
      ['coral', 'purple', 'emerald', 'crimson'],
      ['royal', 'amber', 'coral', 'purple'],
      ['emerald', 'royal', 'amber', 'coral'],
      ['crimson', 'emerald', 'royal', 'amber'],
      ['purple', 'crimson', 'emerald', 'royal'],
      ['amber', 'coral', 'purple', 'crimson'],
      [],
      [],
    ],
  },
  {
    id: 'level-5',
    title: 'Level 5 · Master Mixer',
    subtitle: '7 Colors · 2 Empty Tubes',
    colorCount: 7,
    emptyCount: 2,
    minMoves: 22,
    tubes: [
      ['pink', 'coral', 'purple', 'emerald'],
      ['crimson', 'royal', 'amber', 'pink'],
      ['coral', 'purple', 'emerald', 'crimson'],
      ['royal', 'amber', 'pink', 'coral'],
      ['purple', 'emerald', 'crimson', 'royal'],
      ['amber', 'pink', 'coral', 'purple'],
      ['emerald', 'crimson', 'royal', 'amber'],
      [],
      [],
    ],
  },
  {
    id: 'level-6',
    title: 'Level 6 · Grandmaster Flask',
    subtitle: '8 Colors · 2 Empty Tubes',
    colorCount: 8,
    emptyCount: 2,
    minMoves: 26,
    tubes: [
      ['cyan', 'pink', 'coral', 'purple'],
      ['emerald', 'crimson', 'royal', 'amber'],
      ['cyan', 'emerald', 'pink', 'coral'],
      ['purple', 'royal', 'amber', 'cyan'],
      ['crimson', 'purple', 'emerald', 'pink'],
      ['coral', 'amber', 'royal', 'crimson'],
      ['pink', 'cyan', 'coral', 'purple'],
      ['amber', 'crimson', 'emerald', 'royal'],
      [],
      [],
    ],
  },
];

/**
 * Deterministic Daily Puzzle based on a dayKey (e.g. '2026-10-16').
 */
export function getDailyPigmentPuzzle(dayKey) {
  const seed = hashStringToInt(`pigment-pour-${dayKey}`);
  return generateSolvablePuzzle({
    colorCount: 6,
    emptyCount: 2,
    seed,
    minMoves: 14,
  });
}

// -------------------------------------------------------------
// Web Audio Synthesizer (Zero-dependency rich sound design)
// -------------------------------------------------------------

let audioCtx = null;

function getAudioContext() {
  if (typeof window === 'undefined') return null;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  if (!audioCtx) {
    audioCtx = new AudioCtx();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

/**
 * Subtle glass tap on tube selection.
 */
export function playSelectSound(muted = false) {
  if (muted) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(1320, now + 0.04);

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.09);
  } catch {
    // ignore
  }
}

/**
 * Liquid bubbling glug pour sound.
 */
export function playPourSound(count = 1, muted = false) {
  if (muted) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const notes = [440, 554.37, 659.25, 880];
    const duration = 0.07 + count * 0.04;

    for (let i = 0; i < count; i += 1) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const startTime = now + i * 0.045;

      osc.type = 'triangle';
      const freq = notes[i % notes.length];
      osc.frequency.setValueAtTime(freq, startTime);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.25, startTime + 0.06);

      gain.gain.setValueAtTime(0.16, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.08);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + 0.08);
    }
  } catch {
    // ignore
  }
}

/**
 * Harmonious celebratory chord when a tube is completely sorted!
 */
export function playTubeCompleteSound(muted = false) {
  if (muted) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const pitches = [523.25, 659.25, 783.99, 1046.50]; // C Major arpeggio
    pitches.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const startTime = now + i * 0.04;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0.15, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.22);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + 0.22);
    });
  } catch {
    // ignore
  }
}

/**
 * Grand victory melody when the puzzle is fully solved!
 */
export function playVictorySound(muted = false) {
  if (muted) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Victory fanfare notes: G4, C5, E5, G5
    const fanfare = [
      { f: 392.00, t: 0.00, d: 0.12 },
      { f: 523.25, t: 0.12, d: 0.12 },
      { f: 659.25, t: 0.24, d: 0.12 },
      { f: 783.99, t: 0.36, d: 0.35 },
    ];

    fanfare.forEach(({ f, t, d }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const startTime = now + t;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, startTime);

      gain.gain.setValueAtTime(0.2, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + d);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + d);
    });
  } catch {
    // ignore
  }
}

/**
 * Gentle error thud when an invalid pour is attempted.
 */
export function playErrorSound(muted = false) {
  if (muted) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(110, now + 0.08);

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.08);
  } catch {
    // ignore
  }
}
