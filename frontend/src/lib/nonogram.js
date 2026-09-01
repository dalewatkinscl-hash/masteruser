/**
 * Client-side helpers for the Nonogram UI.
 * Puzzle selection now lives on the backend so frontend and server never drift.
 */

export const NONOGRAM_SIZE = 10;
export const NONOGRAM_MAX_LIVES = 3;

export function getLondonDayKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function emptyGrid(size = NONOGRAM_SIZE) {
  return Array.from({ length: size }, () => Array(size).fill(0));
}

function toHsl(h, s, l) {
  return `hsl(${h} ${s}% ${l}%)`;
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

/**
 * Build a stable colour reveal grid for a given puzzle day.
 * Filled cells get clustered hues so the solved board reads like pixel art.
 */
export function buildRevealPalette(dayKey, solution) {
  const size = solution?.length || 0;
  if (!size) return [];
  const rand = mulberry32(hashString(`nonogram:palette:${dayKey}`));
  const baseHue = Math.floor(rand() * 360);
  const accentHue = (baseHue + 35 + Math.floor(rand() * 110)) % 360;
  const shadowHue = (baseHue + 180 + Math.floor(rand() * 40)) % 360;

  return Array.from({ length: size }, (_, row) => (
    Array.from({ length: size }, (_, col) => {
      if (solution[row][col] !== 1) return null;

      const diagonalBand = Math.floor((row + col) / 3) % 3;
      const checker = (row + col) % 2;
      const hue = diagonalBand === 0
        ? baseHue
        : diagonalBand === 1
          ? accentHue
          : shadowHue;
      const saturation = 62 + ((row * 7 + col * 11) % 16);
      const lightness = checker === 0 ? 58 : 48;

      return {
        fill: toHsl(hue, saturation, lightness),
        border: toHsl(hue, Math.min(90, saturation + 8), Math.max(24, lightness - 12)),
      };
    })
  ));
}

export function emptyMarks(size = NONOGRAM_SIZE) {
  return emptyGrid(size);
}

export function cloneMarks(marks, size = NONOGRAM_SIZE) {
  const next = emptyGrid(size);
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      const value = Number(marks?.[r]?.[c] ?? 0);
      next[r][c] = value === 1 || value === -1 ? value : 0;
    }
  }
  return next;
}

export function isBoardSolved(marks, solution) {
  if (!solution?.length) return false;
  const size = solution.length;
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      const mark = Number(marks?.[r]?.[c] ?? 0);
      if (solution[r][c] === 1) {
        if (mark !== 1) return false;
      } else if (mark === 1) {
        return false;
      }
    }
  }
  return true;
}

/** Medium (15+) and hard (18+) boards get starter X clues. */
export function isHarderNonogram(puzzle = {}) {
  const size = Number(puzzle.size) || 0;
  const difficulty = String(puzzle.difficulty || '').toLowerCase();
  if (difficulty === 'hard' || difficulty === 'medium') return true;
  return size >= 15;
}

function starterHintCount(size, difficulty) {
  const diff = String(difficulty || '').toLowerCase();
  if (diff === 'hard' || size >= 18) return Math.max(10, Math.round(size * 1.35));
  if (diff === 'medium' || size >= 15) return Math.max(6, Math.round(size * 0.85));
  return 0;
}

/**
 * Deterministic starter X marks on empty solution cells for harder puzzles.
 * Returns { marks, hintKeys: string[] } where hintKeys are `row:col`.
 */
export function buildStarterHintMarks(solution, {
  dayKey = '',
  puzzleId = '',
  difficulty = '',
} = {}) {
  const size = solution?.length || 0;
  const marks = emptyMarks(size);
  const hintKeys = [];
  if (!size) return { marks, hintKeys };

  const count = starterHintCount(size, difficulty);
  if (count <= 0) return { marks, hintKeys };

  const empties = [];
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      if (solution[r][c] === 0) empties.push([r, c]);
    }
  }
  if (!empties.length) return { marks, hintKeys };

  const rng = mulberry32(hashString(`nonogram:hints:v1:${dayKey}:${puzzleId}:${size}`));
  for (let i = empties.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [empties[i], empties[j]] = [empties[j], empties[i]];
  }

  const take = Math.min(count, empties.length);
  for (let i = 0; i < take; i += 1) {
    const [r, c] = empties[i];
    marks[r][c] = -1;
    hintKeys.push(`${r}:${c}`);
  }
  return { marks, hintKeys };
}

/** True when every required paint on a row/col is already filled. */
export function areLineFillsComplete(marks, solution, axis, index) {
  if (!solution?.length) return false;
  const size = solution.length;
  if (axis === 'row') {
    let hasFill = false;
    for (let c = 0; c < size; c += 1) {
      if (solution[index][c] === 1) {
        hasFill = true;
        if (Number(marks?.[index]?.[c] ?? 0) !== 1) return false;
      }
    }
    return hasFill;
  }

  let hasFill = false;
  for (let r = 0; r < size; r += 1) {
    if (solution[r][index] === 1) {
      hasFill = true;
      if (Number(marks?.[r]?.[index] ?? 0) !== 1) return false;
    }
  }
  return hasFill;
}

/** Mark remaining empty cells on a completed line as X. Returns whether anything changed. */
export function autoMarkLineEmpties(marks, solution, axis, index) {
  if (!solution?.length) return false;
  const size = solution.length;
  let changed = false;
  if (axis === 'row') {
    for (let c = 0; c < size; c += 1) {
      if (solution[index][c] === 0 && Number(marks[index][c] ?? 0) === 0) {
        marks[index][c] = -1;
        changed = true;
      }
    }
    return changed;
  }
  for (let r = 0; r < size; r += 1) {
    if (solution[r][index] === 0 && Number(marks[r][index] ?? 0) === 0) {
      marks[r][index] = -1;
      changed = true;
    }
  }
  return changed;
}

/**
 * After painting a fill at (row, col), auto-complete any finished row/col with X's.
 * Returns { marks, pulseRows, pulseCols }.
 */
export function applyLineAutoComplete(marks, solution, row, col) {
  const size = solution?.length || marks?.length || 0;
  const next = cloneMarks(marks, size);
  const pulseRows = [];
  const pulseCols = [];

  if (areLineFillsComplete(next, solution, 'row', row)) {
    autoMarkLineEmpties(next, solution, 'row', row);
    pulseRows.push(row);
  }
  if (areLineFillsComplete(next, solution, 'col', col)) {
    autoMarkLineEmpties(next, solution, 'col', col);
    pulseCols.push(col);
  }

  return { marks: next, pulseRows, pulseCols };
}

export function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function localStorageKey(dayKey, puzzleId = 'daily') {
  return `nonogram-local:${dayKey}:${puzzleId}`;
}

export function loadLocalGame(dayKey, size = NONOGRAM_SIZE, puzzleId = 'daily') {
  try {
    const raw = localStorage.getItem(localStorageKey(dayKey, puzzleId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      marks: cloneMarks(parsed.marks, size),
      livesRemaining: Number.isFinite(parsed.livesRemaining) ? parsed.livesRemaining : NONOGRAM_MAX_LIVES,
      mistakes: Number.isFinite(parsed.mistakes) ? parsed.mistakes : 0,
      status: parsed.status || 'in_progress',
      startedAt: parsed.startedAt || null,
      completedAt: parsed.completedAt || null,
      durationMs: parsed.durationMs ?? null,
      mistakenCells: Array.isArray(parsed.mistakenCells) ? parsed.mistakenCells : [],
      hintKeys: Array.isArray(parsed.hintKeys) ? parsed.hintKeys : [],
    };
  } catch {
    return null;
  }
}

export function saveLocalGame(dayKey, state, puzzleId = 'daily') {
  try {
    localStorage.setItem(localStorageKey(dayKey, puzzleId), JSON.stringify({
      marks: state.marks,
      livesRemaining: state.livesRemaining,
      mistakes: state.mistakes,
      status: state.status,
      startedAt: state.startedAt,
      completedAt: state.completedAt,
      durationMs: state.durationMs,
      mistakenCells: state.mistakenCells || [],
      hintKeys: state.hintKeys || [],
    }));
  } catch {
    // ignore quota / private mode
  }
}
