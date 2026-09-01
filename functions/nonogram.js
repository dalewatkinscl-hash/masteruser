'use strict';

/**
 * Daily Nonogram (paint-by-numbers) for the Employee Portal Fun tab.
 * Uses curated pixel-art first, then a validated fallback generator.
 */

const admin = require('firebase-admin');

const DEFAULT_SIZE = 10;
const MAX_LIVES = 3;
const MIN_SIZE = 10;
const MAX_SIZE = 20;
const UNKNOWN = null;
const EMPTY = 0;
const FILLED = 1;
const CURATED_META_DOC_ID = 'curated_meta';
const SIZE_ROTATION = [10, 12, 15, 18, 20, 12, 15];
const CURATED_ART_VERSION = 2;
const RETIRED_CURATED_IDS = ['house-10', 'apple-12', 'chicken-18'];

const CURATED_TEMPLATES = [
  {
    id: 'heart-10',
    title: 'Heart',
    subject: 'symbol',
    difficulty: 'easy',
    art: [
      '..........',
      '..RR..RR..',
      '.RRRRRRRR.',
      '.RRRRRRRR.',
      '.RRRRRRRR.',
      '..RRRRRR..',
      '...RRRR...',
      '....RR....',
      '..........',
      '..........',
    ],
    palette: { R: '#e11d48' },
  },
  {
    id: 'mushroom-10',
    title: 'Mushroom',
    subject: 'nature',
    difficulty: 'easy',
    art: [
      '..........',
      '...RRRR...',
      '..RRWWRR..',
      '.RRRRRRRR.',
      '.RRWWRRRR.',
      '..RRRRRR..',
      '....WW....',
      '....WW....',
      '...WWWW...',
      '..........',
    ],
    palette: { R: '#dc2626', W: '#f8fafc' },
  },
  {
    id: 'fish-12',
    title: 'Fish',
    subject: 'animal',
    difficulty: 'easy',
    art: [
      '............',
      '............',
      '...OOOO.....',
      '..OOOOOO.O..',
      '.OOOOOWOOO..',
      'OOOOOOOOOOO.',
      '.OOOOOOOOO..',
      '..OOOOOO.O..',
      '...OOOO.....',
      '............',
      '............',
      '............',
    ],
    palette: { O: '#f97316', W: '#0f172a' },
  },
  {
    id: 'tree-12',
    title: 'Tree',
    subject: 'nature',
    difficulty: 'easy',
    art: [
      '............',
      '.....GG.....',
      '....GGGG....',
      '...GGGGGG...',
      '..GGGGGGGG..',
      '...GGGGGG...',
      '..GGGGGGGG..',
      '...GGBBGG...',
      '.....BB.....',
      '.....BB.....',
      '....BBBB....',
      '............',
    ],
    palette: { G: '#16a34a', B: '#92400e' },
  },
  {
    id: 'cat-15',
    title: 'Cat',
    subject: 'animal',
    difficulty: 'medium',
    art: [
      '...............',
      '..O.......O....',
      '.OOO.....OOO...',
      '.OOOOOOOOOOO...',
      '.OOOOOOOOOOO...',
      '.OOOWOOOOWOO...',
      '.OOOOOYOOOOO...',
      '.OOOOOOOOOOO...',
      '..OOOOOOOOO....',
      '...OO...OO.....',
      '...OO...OO.....',
      '..OOOO.OOOO....',
      '.OOOOOOOOOOO...',
      '...............',
      '...............',
    ],
    palette: { O: '#f59e0b', W: '#0f172a', Y: '#fb7185' },
  },
  {
    id: 'truck-15',
    title: 'Farm Truck',
    subject: 'vehicle',
    difficulty: 'medium',
    art: [
      '...............',
      '...............',
      '......CCCC.....',
      '.....CCCCCC....',
      '....CCWWCCCC...',
      'GGGGCCCCCCCC...',
      'GGGGGGGGGGGGGG.',
      'GGGGGGGGGGGGGG.',
      'GGGGGGGGGGGGGG.',
      '..KK......KK...',
      '.KKKK....KKKK..',
      '.KKKK....KKKK..',
      '..KK......KK...',
      '...............',
      '...............',
    ],
    palette: {
      G: '#65a30d',
      C: '#4d7c0f',
      W: '#7dd3fc',
      K: '#111827',
    },
  },
  {
    id: 'duck-18',
    title: 'Duck',
    subject: 'farm',
    difficulty: 'medium',
    art: [
      '..................',
      '..................',
      '........YYY.......',
      '.......YYYYY......',
      '......YYYYWYY.....',
      '......YYYYYYY.OO..',
      '.....YYYYYYYYOOO..',
      '......YYYYYYY.....',
      '.......YYYYY......',
      '....WWWWWWWWW.....',
      '...WWWWWWWWWWW....',
      '...WWWWWWWWWWW....',
      '....WWWWWWWWW.....',
      '.....WW...WW......',
      '.....OO...OO......',
      '..................',
      '..................',
      '..................',
    ],
    palette: {
      Y: '#facc15',
      W: '#f8fafc',
      O: '#ea580c',
    },
  },
  {
    id: 'lighthouse-18',
    title: 'Lighthouse',
    subject: 'building',
    difficulty: 'medium',
    art: [
      '..................',
      '........YY........',
      '.......YYYY.......',
      '......WWWWWW......',
      '......WWRRWW......',
      '......WWWWWW......',
      '.......RRRR.......',
      '.......WWWW.......',
      '.......RRRR.......',
      '.......WWWW.......',
      '.......RRRR.......',
      '.......WWWW.......',
      '......RRRRRR......',
      '.....WWWWWWWW.....',
      '....GGGGGGGGGG....',
      '...GGGGGGGGGGGG...',
      '..GG.GGGGGGGG.GG..',
      '..................',
    ],
    palette: {
      Y: '#facc15',
      W: '#f8fafc',
      R: '#dc2626',
      G: '#166534',
    },
  },
  {
    id: 'sunflower-20',
    title: 'Sunflower',
    subject: 'flower',
    difficulty: 'hard',
    art: [
      '....................',
      '........YYYY........',
      '......YYYYYYYY......',
      '.....YYYYYYYYYY.....',
      '....YYYYBBBBYYYY....',
      '...YYYBBBBBBBBYYY...',
      '...YYBBBBBBBBBBYY...',
      '..YYYBBBBBBBBBBYYY..',
      '..YYBBBBBBBBBBBBYY..',
      '..YYBBBBBBBBBBBBYY..',
      '..YYYBBBBBBBBBBYYY..',
      '...YYBBBBBBBBBBYY...',
      '...YYYBBBBBBBBYYY...',
      '....YYYYBBBBYYYY....',
      '.....YYYYYYYYYY.....',
      '......YYYYYYYY......',
      '.........GG.........',
      '.........GG.........',
      '........GGGG........',
      '.......GG..GG.......',
    ],
    palette: {
      Y: '#facc15',
      B: '#78350f',
      G: '#16a34a',
    },
  },
  {
    id: 'castle-20',
    title: 'Castle',
    subject: 'building',
    difficulty: 'hard',
    art: [
      '....................',
      '..KK..KK....KK..KK..',
      '..KK..KK....KK..KK..',
      '..KKKKKK....KKKKKK..',
      '..KKWWKK....KKWWKK..',
      '..KKWWKK....KKWWKK..',
      '..KKKKKK....KKKKKK..',
      '..KKKKKKKKKKKKKKKK..',
      '..KK..............KK',
      '..KK..KKKKKKKK..KK..',
      '..KK..KKWWWWKK..KK..',
      '..KK..KKWWWWKK..KK..',
      '..KK..KKKKKKKK..KK..',
      '..KKKKKKKKKKKKKKKK..',
      '..KKKK..........KKKK',
      '..KKKK..KKKKKK..KKKK',
      '..KKKK..KKRRKK..KKKK',
      '..KKKK..KKRRKK..KKKK',
      '..KKKKKKKKKKKKKKKKKK',
      '....................',
    ],
    palette: {
      K: '#64748b',
      W: '#7dd3fc',
      R: '#78350f',
    },
  },
];

function getLondonDayKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function hashString(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
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

function emptyGrid(size = DEFAULT_SIZE, value = 0) {
  return Array.from({ length: size }, () => Array(size).fill(value));
}

function cloneGrid(grid) {
  return (grid || []).map((row) => [...(row || [])]);
}

function lineClues(line) {
  const clues = [];
  let run = 0;
  for (let i = 0; i < line.length; i += 1) {
    if (line[i] === 1) run += 1;
    else if (run > 0) {
      clues.push(run);
      run = 0;
    }
  }
  if (run > 0) clues.push(run);
  return clues.length ? clues : [0];
}

function buildClues(solution) {
  const size = solution.length;
  const rows = solution.map((row) => lineClues(row));
  const cols = [];
  for (let c = 0; c < size; c += 1) {
    const col = [];
    for (let r = 0; r < size; r += 1) col.push(solution[r][c]);
    cols.push(lineClues(col));
  }
  return { rows, cols };
}

function flattenMarks(marks, size = DEFAULT_SIZE) {
  const flat = [];
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      const value = Number(marks?.[r]?.[c] ?? 0);
      if (value === 1) flat.push(1);
      else if (value === -1) flat.push(-1);
      else flat.push(0);
    }
  }
  return flat;
}

function normalizeMarksFromNested(marks, size = DEFAULT_SIZE) {
  const next = emptyGrid(size);
  if (!Array.isArray(marks)) return next;
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      const value = Number(marks?.[r]?.[c] ?? 0);
      if (value === 1) next[r][c] = 1;
      else if (value === -1) next[r][c] = -1;
      else next[r][c] = 0;
    }
  }
  return next;
}

function unflattenMarks(flat, size = DEFAULT_SIZE) {
  const next = emptyGrid(size);
  if (!Array.isArray(flat)) return next;
  if (Array.isArray(flat[0])) return normalizeMarksFromNested(flat, size);
  for (let i = 0; i < size * size; i += 1) {
    const r = Math.floor(i / size);
    const c = i % size;
    const value = Number(flat[i] ?? 0);
    if (value === 1) next[r][c] = 1;
    else if (value === -1) next[r][c] = -1;
    else next[r][c] = 0;
  }
  return next;
}

function normalizeMarks(marks, size = DEFAULT_SIZE) {
  if (Array.isArray(marks) && !Array.isArray(marks[0])) {
    return unflattenMarks(marks, size);
  }
  return normalizeMarksFromNested(marks, size);
}

function dateToWeekdayIndex(dayKey) {
  const [year, month, day] = String(dayKey).split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  return (date.getUTCDay() + 6) % 7;
}

function getTargetSizeForDay(dayKey) {
  return SIZE_ROTATION[dateToWeekdayIndex(dayKey)] || DEFAULT_SIZE;
}

function makeArtPuzzle(template) {
  const size = template.art.length;
  const solution = template.art.map((row) => (
    row.split('').map((cell) => (cell === '.' ? 0 : 1))
  ));
  const reveal = template.art.map((row) => (
    row.split('').map((cell) => (cell === '.' ? null : template.palette?.[cell] || '#6366f1'))
  ));
  const clues = buildClues(solution);
  return {
    puzzleId: template.id,
    title: template.title,
    subject: template.subject,
    difficulty: template.difficulty,
    source: 'curated',
    size,
    solution,
    reveal,
    rowClues: clues.rows,
    colClues: clues.cols,
  };
}

function buildLinePossibilities(length, clues, current) {
  const results = [];

  function canPlaceEmpty(index) {
    return current[index] === UNKNOWN || current[index] === EMPTY;
  }

  function canPlaceFilled(index) {
    return current[index] === UNKNOWN || current[index] === FILLED;
  }

  function helper(position, clueIndex, built) {
    if (clueIndex >= clues.length || (clues.length === 1 && clues[0] === 0)) {
      const rest = [];
      for (let i = position; i < length; i += 1) {
        if (!canPlaceEmpty(i)) return;
        rest.push(EMPTY);
      }
      results.push([...built, ...rest]);
      return;
    }

    const clue = clues[clueIndex];
    let remaining = 0;
    for (let i = clueIndex + 1; i < clues.length; i += 1) remaining += clues[i];
    const remainingGaps = Math.max(0, clues.length - clueIndex - 1);
    const latestStart = length - (clue + remaining + remainingGaps);

    for (let start = position; start <= latestStart; start += 1) {
      const prefix = [];
      let valid = true;

      for (let i = position; i < start; i += 1) {
        if (!canPlaceEmpty(i)) {
          valid = false;
          break;
        }
        prefix.push(EMPTY);
      }
      if (!valid) continue;

      const run = [];
      for (let i = start; i < start + clue; i += 1) {
        if (!canPlaceFilled(i)) {
          valid = false;
          break;
        }
        run.push(FILLED);
      }
      if (!valid) continue;

      const nextBuilt = [...built, ...prefix, ...run];
      const afterRun = start + clue;

      if (clueIndex === clues.length - 1) {
        helper(afterRun, clueIndex + 1, nextBuilt);
        continue;
      }

      if (afterRun >= length || !canPlaceEmpty(afterRun)) continue;
      helper(afterRun + 1, clueIndex + 1, [...nextBuilt, EMPTY]);
    }
  }

  helper(0, 0, []);
  return results;
}

function getColumn(grid, col) {
  return grid.map((row) => row[col]);
}

function withColumn(grid, col, values) {
  const next = cloneGrid(grid);
  for (let row = 0; row < values.length; row += 1) {
    next[row][col] = values[row];
  }
  return next;
}

function reduceLine(possibilities) {
  if (!possibilities.length) return null;
  const reduced = Array(possibilities[0].length).fill(UNKNOWN);
  for (let i = 0; i < reduced.length; i += 1) {
    const first = possibilities[0][i];
    reduced[i] = possibilities.every((line) => line[i] === first) ? first : UNKNOWN;
  }
  return reduced;
}

function solvePuzzle(rowClues, colClues) {
  const size = rowClues.length;
  const initial = emptyGrid(size, UNKNOWN);
  const solutions = [];

  function propagate(grid) {
    let next = cloneGrid(grid);
    let changed = true;

    while (changed) {
      changed = false;

      for (let row = 0; row < size; row += 1) {
        const possibilities = buildLinePossibilities(size, rowClues[row], next[row]);
        if (!possibilities.length) return null;
        const reduced = reduceLine(possibilities);
        for (let col = 0; col < size; col += 1) {
          if (reduced[col] !== UNKNOWN && next[row][col] !== reduced[col]) {
            next[row][col] = reduced[col];
            changed = true;
          }
        }
      }

      for (let col = 0; col < size; col += 1) {
        const column = getColumn(next, col);
        const possibilities = buildLinePossibilities(size, colClues[col], column);
        if (!possibilities.length) return null;
        const reduced = reduceLine(possibilities);
        for (let row = 0; row < size; row += 1) {
          if (reduced[row] !== UNKNOWN && next[row][col] !== reduced[row]) {
            next[row][col] = reduced[row];
            changed = true;
          }
        }
      }
    }

    return next;
  }

  function isComplete(grid) {
    return grid.every((row) => row.every((cell) => cell !== UNKNOWN));
  }

  function search(grid) {
    if (solutions.length > 1) return;
    const reduced = propagate(grid);
    if (!reduced) return;

    if (isComplete(reduced)) {
      solutions.push(reduced.map((row) => row.map((cell) => (cell === FILLED ? 1 : 0))));
      return;
    }

    let targetRow = -1;
    let bestCount = Number.POSITIVE_INFINITY;
    let bestPossibilities = null;

    for (let row = 0; row < size; row += 1) {
      if (reduced[row].every((cell) => cell !== UNKNOWN)) continue;
      const possibilities = buildLinePossibilities(size, rowClues[row], reduced[row]);
      if (!possibilities.length) return;
      if (possibilities.length < bestCount) {
        bestCount = possibilities.length;
        bestPossibilities = possibilities;
        targetRow = row;
      }
    }

    if (!bestPossibilities || targetRow < 0) return;
    for (const candidate of bestPossibilities) {
      if (solutions.length > 1) return;
      const next = cloneGrid(reduced);
      next[targetRow] = candidate;
      search(next);
    }
  }

  search(initial);
  return {
    solutionCount: solutions.length,
    firstSolution: solutions[0] || null,
  };
}

function countFilled(solution) {
  let total = 0;
  for (const row of solution) {
    for (const cell of row) total += cell === 1 ? 1 : 0;
  }
  return total;
}

function getBoundingBox(solution) {
  const size = solution.length;
  let minRow = size;
  let maxRow = -1;
  let minCol = size;
  let maxCol = -1;
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (solution[row][col] !== 1) continue;
      minRow = Math.min(minRow, row);
      maxRow = Math.max(maxRow, row);
      minCol = Math.min(minCol, col);
      maxCol = Math.max(maxCol, col);
    }
  }
  if (maxRow < 0) return null;
  return { minRow, maxRow, minCol, maxCol };
}

function validatePuzzle(puzzle) {
  const size = puzzle.size;
  const filled = countFilled(puzzle.solution);
  const fillRatio = filled / (size * size);
  const bbox = getBoundingBox(puzzle.solution);
  const boxCoverage = bbox
    ? ((bbox.maxRow - bbox.minRow + 1) * (bbox.maxCol - bbox.minCol + 1)) / (size * size)
    : 0;
  const rowRunAverage = puzzle.rowClues.reduce((sum, clues) => sum + clues.filter((n) => n > 0).length, 0) / size;
  const colRunAverage = puzzle.colClues.reduce((sum, clues) => sum + clues.filter((n) => n > 0).length, 0) / size;
  const solver = solvePuzzle(puzzle.rowClues, puzzle.colClues);

  const reasons = [];
  if (size < MIN_SIZE || size > MAX_SIZE) reasons.push('size_out_of_range');
  if (fillRatio < 0.22 || fillRatio > 0.62) reasons.push('fill_ratio');
  if (boxCoverage < 0.2) reasons.push('shape_too_small');
  if (rowRunAverage > Math.max(4.8, size / 3.2)) reasons.push('row_noise');
  if (colRunAverage > Math.max(4.8, size / 3.2)) reasons.push('col_noise');
  if (solver.solutionCount === 0) reasons.push('unsatisfiable');
  if (solver.solutionCount !== 1) reasons.push('non_unique');

  return {
    valid: reasons.length === 0,
    reasons,
    metrics: {
      size,
      fillRatio,
      boxCoverage,
      rowRunAverage,
      colRunAverage,
      solutionCount: solver.solutionCount,
    },
  };
}

function buildFallbackReveal(dayKey, solution) {
  const rand = mulberry32(hashString(`nonogram:palette:${dayKey}`));
  const baseHue = Math.floor(rand() * 360);
  const accentHue = (baseHue + 55 + Math.floor(rand() * 60)) % 360;
  return solution.map((row, rowIndex) => (
    row.map((cell, colIndex) => {
      if (cell !== 1) return null;
      const hue = (rowIndex + colIndex) % 3 === 0 ? accentHue : baseHue;
      const sat = 62 + ((rowIndex * 9 + colIndex * 7) % 14);
      const light = (rowIndex + colIndex) % 2 === 0 ? 56 : 48;
      return `hsl(${hue} ${sat}% ${light}%)`;
    })
  ));
}

function generateFallbackSolution(dayKey = getLondonDayKey(), size = DEFAULT_SIZE, salt = 0) {
  const rand = mulberry32(hashString(`nonogram:${dayKey}:${size}:${salt}`));
  const grid = emptyGrid(size);
  const targetFill = Math.round(size * size * (0.32 + rand() * 0.12));
  let filled = 0;
  const seeds = 2 + Math.floor(rand() * 4);
  const queue = [];

  for (let s = 0; s < seeds; s += 1) {
    const r = Math.floor(rand() * size);
    const c = Math.floor(rand() * size);
    if (!grid[r][c]) {
      grid[r][c] = 1;
      filled += 1;
      queue.push([r, c]);
    }
  }

  const dirs = [
    [0, 1], [1, 0], [0, -1], [-1, 0],
    [1, 1], [1, -1], [-1, 1], [-1, -1],
  ];

  while (filled < targetFill && queue.length) {
    const idx = Math.floor(rand() * queue.length);
    const [r, c] = queue[idx];
    const [dr, dc] = dirs[Math.floor(rand() * dirs.length)];
    const nr = r + dr;
    const nc = c + dc;
    if (nr < 0 || nc < 0 || nr >= size || nc >= size) continue;
    if (grid[nr][nc]) continue;
    if (Math.abs(dr) + Math.abs(dc) > 1 && rand() > 0.28) continue;
    grid[nr][nc] = 1;
    filled += 1;
    queue.push([nr, nc]);
  }

  return grid;
}

function makeFallbackPuzzle(dayKey, size, salt = 0) {
  const solution = generateFallbackSolution(dayKey, size, salt);
  const clues = buildClues(solution);
  return {
    puzzleId: `fallback-${size}-${salt}`,
    title: `${size}x${size} Mystery`,
    subject: 'mystery',
    difficulty: size >= 18 ? 'hard' : size >= 15 ? 'medium' : 'easy',
    source: 'fallback',
    size,
    solution,
    reveal: buildFallbackReveal(`${dayKey}:${salt}`, solution),
    rowClues: clues.rows,
    colClues: clues.cols,
  };
}

function buildCuratedCatalog() {
  return CURATED_TEMPLATES.map((template) => {
    const puzzle = makeArtPuzzle(template);
    return {
      ...puzzle,
      validation: validatePuzzle(puzzle),
    };
  }).filter((entry) => entry.validation.valid);
}

const CURATED_CATALOG = buildCuratedCatalog();

function listPuzzleCatalog(options = {}) {
  const {
    includeValidation = false,
    includeSolution = false,
  } = options;

  return CURATED_CATALOG.map((puzzle) => ({
    puzzleId: puzzle.puzzleId,
    title: puzzle.title,
    subject: puzzle.subject,
    difficulty: puzzle.difficulty,
    size: puzzle.size,
    source: puzzle.source,
    reveal: cloneGrid(puzzle.reveal),
    ...(includeSolution ? { solution: cloneGrid(puzzle.solution) } : {}),
    ...(includeValidation ? { validation: puzzle.validation } : {}),
  }));
}

function findPuzzleById(puzzleId) {
  return CURATED_CATALOG.find((entry) => entry.puzzleId === puzzleId) || null;
}

function getPuzzleForDay(dayKey = getLondonDayKey(), options = {}) {
  const requestedPuzzleId = options.puzzleId || '';
  if (requestedPuzzleId) {
    const chosen = findPuzzleById(requestedPuzzleId);
    if (!chosen) {
      const error = new Error('Requested nonogram puzzle was not found.');
      error.status = 404;
      throw error;
    }
    return {
      ...chosen,
      dayKey,
      puzzleId: chosen.puzzleId,
    };
  }

  const targetSize = getTargetSizeForDay(dayKey);
  const pool = CURATED_CATALOG.filter((entry) => entry.size === targetSize);
  if (pool.length) {
    const index = hashString(`nonogram:daily:${dayKey}`) % pool.length;
    return {
      ...pool[index],
      dayKey,
    };
  }

  for (let attempt = 0; attempt < 48; attempt += 1) {
    const candidate = makeFallbackPuzzle(dayKey, targetSize, attempt);
    const validation = validatePuzzle(candidate);
    if (validation.valid) {
      return {
        ...candidate,
        dayKey,
      };
    }
  }

  const backup = CURATED_CATALOG[hashString(`nonogram:backup:${dayKey}`) % CURATED_CATALOG.length];
  return {
    ...backup,
    dayKey,
  };
}

function publicPuzzle(puzzle) {
  return {
    dayKey: puzzle.dayKey,
    size: puzzle.size,
    puzzleId: puzzle.puzzleId,
    title: puzzle.title,
    subject: puzzle.subject,
    difficulty: puzzle.difficulty,
    source: puzzle.source,
    rowClues: puzzle.rowClues,
    colClues: puzzle.colClues,
    reveal: cloneGrid(puzzle.reveal),
  };
}

function serializeNonogramGame(data = {}, { includeSolution = false, solution = null } = {}) {
  const status = data.status || 'in_progress';
  const durationMs = data.durationMs ?? null;
  const size = data.size || DEFAULT_SIZE;
  const maxLives = data.maxLives || MAX_LIVES;
  const mistakes = Number.isFinite(data.mistakes) ? data.mistakes : 0;
  const livesRemaining = Number.isFinite(data.livesRemaining)
    ? data.livesRemaining
    : Math.max(0, maxLives - mistakes);
  const revealSolution = includeSolution && (status === 'won' || status === 'lost');
  return {
    dayKey: data.dayKey || '',
    status,
    marks: normalizeMarks(data.marks, size),
    size,
    maxLives,
    livesRemaining,
    mistakes,
    startedAt: data.startedAt?.toDate?.()?.toISOString?.() || data.startedAt || null,
    completedAt: data.completedAt?.toDate?.()?.toISOString?.() || data.completedAt || null,
    durationMs,
    durationLabel: formatDuration(durationMs),
    solution: revealSolution ? cloneGrid(solution || data.solution || []) : null,
  };
}

function isSolved(marks, solution) {
  const size = solution.length;
  const grid = normalizeMarks(marks, size);
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      const mark = grid[r][c];
      if (solution[r][c] === 1) {
        if (mark !== 1) return false;
      } else if (mark === 1) {
        return false;
      }
    }
  }
  return true;
}

function findWrongFills(marks, solution) {
  const size = solution.length;
  const grid = normalizeMarks(marks, size);
  const wrong = [];
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      if (grid[r][c] === 1 && solution[r][c] !== 1) {
        wrong.push({ row: r, col: c });
      }
    }
  }
  return wrong;
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

const PIXEL_PALETTE = [
  '#111827', '#6b7280', '#f8fafc', '#ef4444',
  '#f97316', '#eab308', '#84cc16', '#22c55e',
  '#14b8a6', '#0ea5e9', '#3b82f6', '#6366f1',
  '#a855f7', '#ec4899', '#92400e', '#f5d0a9',
];

const CATALOG_COLLECTION = 'nonogram_puzzles';
const DAILY_COLLECTION = 'nonogram_daily';

function inferDifficulty(size) {
  if (size >= 18) return 'hard';
  if (size >= 15) return 'medium';
  return 'easy';
}

/** Firestore rejects nested arrays — store grids/clues as flat fields. */
function flattenGrid(grid) {
  if (!Array.isArray(grid)) return [];
  if (!Array.isArray(grid[0])) return [...grid];
  return grid.flatMap((row) => [...(row || [])]);
}

function unflattenGrid(flat, size) {
  if (Array.isArray(flat) && Array.isArray(flat[0])) return cloneGrid(flat);
  const values = Array.isArray(flat) ? flat : [];
  const next = emptyGrid(size, 0);
  for (let i = 0; i < size * size; i += 1) {
    const r = Math.floor(i / size);
    const c = i % size;
    next[r][c] = values[i] ?? 0;
  }
  return next;
}

function flattenReveal(grid) {
  if (!Array.isArray(grid)) return [];
  if (!Array.isArray(grid[0])) {
    return valuesAsRevealStrings(grid);
  }
  return grid.flatMap((row) => (row || []).map((cell) => (cell == null ? '' : String(cell))));
}

function valuesAsRevealStrings(values) {
  return (values || []).map((cell) => (cell == null || cell === '' ? '' : String(cell)));
}

function unflattenReveal(flat, size) {
  if (Array.isArray(flat) && Array.isArray(flat[0])) return cloneGrid(flat);
  const values = Array.isArray(flat) ? flat : [];
  const next = emptyGrid(size, null);
  for (let i = 0; i < size * size; i += 1) {
    const r = Math.floor(i / size);
    const c = i % size;
    const value = values[i];
    next[r][c] = value == null || value === '' ? null : String(value);
  }
  return next;
}

function encodeClues(clues) {
  if (!Array.isArray(clues)) return [];
  return clues.map((line) => (
    Array.isArray(line) ? line.join(',') : String(line || '0')
  ));
}

function decodeClues(encoded) {
  if (!Array.isArray(encoded)) return [];
  if (Array.isArray(encoded[0])) return encoded.map((line) => [...line]);
  return encoded.map((line) => {
    const parts = String(line || '0').split(',').map((n) => Number(n));
    return parts.length ? parts.map((n) => (Number.isFinite(n) ? n : 0)) : [0];
  });
}

function packPuzzleForStorage(puzzle) {
  const size = puzzle.size || DEFAULT_SIZE;
  return {
    size,
    solutionFlat: flattenGrid(puzzle.solution).map((n) => (n === 1 ? 1 : 0)),
    revealFlat: flattenReveal(puzzle.reveal),
    rowCluesEncoded: encodeClues(puzzle.rowClues),
    colCluesEncoded: encodeClues(puzzle.colClues),
  };
}

function unpackPuzzleFields(data = {}) {
  const size = data.size || DEFAULT_SIZE;
  const solution = data.solutionFlat
    ? unflattenGrid(data.solutionFlat, size)
    : cloneGrid(data.solution || []);
  const reveal = data.revealFlat
    ? unflattenReveal(data.revealFlat, size)
    : cloneGrid(data.reveal || []);
  const rowClues = data.rowCluesEncoded
    ? decodeClues(data.rowCluesEncoded)
    : (data.rowClues || []);
  const colClues = data.colCluesEncoded
    ? decodeClues(data.colCluesEncoded)
    : (data.colClues || []);
  return { size, solution, reveal, rowClues, colClues };
}

function makePuzzleFromColorGrid(colorGrid, meta = {}) {
  if (!Array.isArray(colorGrid) || !colorGrid.length) {
    throw Object.assign(new Error('Color grid is required.'), { status: 400 });
  }
  const size = colorGrid.length;
  if (size < MIN_SIZE || size > MAX_SIZE) {
    throw Object.assign(new Error(`Grid size must be ${MIN_SIZE}–${MAX_SIZE}.`), { status: 400 });
  }
  if (colorGrid.some((row) => !Array.isArray(row) || row.length !== size)) {
    throw Object.assign(new Error('Color grid must be square.'), { status: 400 });
  }

  const solution = colorGrid.map((row) => (
    row.map((cell) => {
      const value = String(cell || '').trim();
      return value && value !== '.' && value.toLowerCase() !== 'null' ? 1 : 0;
    })
  ));
  const reveal = colorGrid.map((row) => (
    row.map((cell) => {
      const value = String(cell || '').trim();
      if (!value || value === '.' || value.toLowerCase() === 'null') return null;
      return value;
    })
  ));
  const clues = buildClues(solution);
  const puzzle = {
    puzzleId: meta.puzzleId || `custom-${Date.now()}`,
    title: String(meta.title || 'Custom pixel art').trim() || 'Custom pixel art',
    subject: String(meta.subject || 'custom').trim() || 'custom',
    difficulty: meta.difficulty || inferDifficulty(size),
    source: meta.source || 'custom',
    size,
    solution,
    reveal,
    rowClues: clues.rows,
    colClues: clues.cols,
  };
  puzzle.validation = validatePuzzle(puzzle);
  return puzzle;
}

function serializeStoredPuzzle(doc, options = {}) {
  const {
    includeValidation = false,
    includeSolution = false,
  } = options;
  const data = doc.data ? (doc.data() || {}) : (doc || {});
  const id = doc.id || data.puzzleId || '';
  const unpacked = unpackPuzzleFields(data);
  return {
    puzzleId: id,
    title: data.title || 'Untitled',
    subject: data.subject || '',
    difficulty: data.difficulty || inferDifficulty(unpacked.size),
    size: unpacked.size,
    source: data.source || 'custom',
    scheduledFor: data.scheduledFor || null,
    usedAt: data.usedAt?.toDate?.()?.toISOString?.() || data.usedAt || null,
    usedOnDayKey: data.usedOnDayKey || null,
    spent: Boolean(data.usedOnDayKey || data.usedAt),
    active: data.active !== false,
    deletedAt: data.deletedAt?.toDate?.()?.toISOString?.() || data.deletedAt || null,
    createdAt: data.createdAt?.toDate?.()?.toISOString?.() || data.createdAt || null,
    updatedAt: data.updatedAt?.toDate?.()?.toISOString?.() || data.updatedAt || null,
    createdByName: data.createdByName || '',
    reveal: cloneGrid(unpacked.reveal),
    ...(includeSolution ? { solution: cloneGrid(unpacked.solution) } : {}),
    ...(includeValidation ? { validation: data.validation || null } : {}),
  };
}

function storedDocToPlayable(doc, dayKey) {
  const data = doc.data ? (doc.data() || {}) : (doc || {});
  const puzzleId = doc.id || data.puzzleId;
  const unpacked = unpackPuzzleFields(data);
  return {
    puzzleId,
    title: data.title || 'Untitled',
    subject: data.subject || '',
    difficulty: data.difficulty || inferDifficulty(unpacked.size),
    source: data.source || 'custom',
    size: unpacked.size,
    solution: cloneGrid(unpacked.solution),
    reveal: cloneGrid(unpacked.reveal),
    rowClues: unpacked.rowClues,
    colClues: unpacked.colClues,
    dayKey,
  };
}

async function ensureSeedCatalog(db) {
  const metaRef = db.collection(CATALOG_COLLECTION).doc(CURATED_META_DOC_ID);
  const metaSnap = await metaRef.get();
  const currentVersion = metaSnap.exists ? Number(metaSnap.data()?.curatedArtVersion || 0) : 0;
  const sample = await db.collection(CATALOG_COLLECTION).limit(3).get();
  const hasPuzzleDocs = sample.docs.some((doc) => doc.id !== CURATED_META_DOC_ID);
  if (hasPuzzleDocs && currentVersion >= CURATED_ART_VERSION) {
    return { seeded: false, refreshed: false, count: 0 };
  }

  const existingSnap = await db.collection(CATALOG_COLLECTION).get();
  const existingById = new Map(existingSnap.docs.map((doc) => [doc.id, doc]));
  const batch = db.batch();
  let count = 0;

  for (const template of CURATED_TEMPLATES) {
    const puzzle = makeArtPuzzle(template);
    const validation = validatePuzzle(puzzle);
    if (!validation.valid) continue;
    const packed = packPuzzleForStorage(puzzle);
    const ref = db.collection(CATALOG_COLLECTION).doc(puzzle.puzzleId);
    const existing = existingById.get(puzzle.puzzleId);
    const payload = {
      puzzleId: puzzle.puzzleId,
      title: puzzle.title,
      subject: puzzle.subject,
      difficulty: puzzle.difficulty,
      size: packed.size,
      source: 'curated',
      solutionFlat: packed.solutionFlat,
      revealFlat: packed.revealFlat,
      rowCluesEncoded: packed.rowCluesEncoded,
      colCluesEncoded: packed.colCluesEncoded,
      validation: {
        valid: validation.valid,
        reasons: validation.reasons || [],
        metrics: validation.metrics || {},
      },
      active: true,
      deletedAt: null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (!existing) {
      batch.set(ref, {
        ...payload,
        scheduledFor: null,
        usedAt: null,
        usedOnDayKey: null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdByUid: 'system',
        createdByName: 'System seed',
      });
    } else {
      batch.set(ref, payload, { merge: true });
    }
    count += 1;
  }

  for (const retiredId of RETIRED_CURATED_IDS) {
    const existing = existingById.get(retiredId);
    if (!existing) continue;
    batch.set(existing.ref, {
      active: false,
      deletedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  }

  await batch.commit();

  // Write version marker separately so a reserved/invalid meta id cannot block puzzles.
  await metaRef.set({
    curatedArtVersion: CURATED_ART_VERSION,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  return {
    seeded: !hasPuzzleDocs,
    refreshed: hasPuzzleDocs,
    count,
  };
}

async function listStoredCatalog(db, options = {}) {
  await ensureSeedCatalog(db);
  const snap = await db.collection(CATALOG_COLLECTION).get();
  return snap.docs
    .map((doc) => serializeStoredPuzzle(doc, options))
    .filter((row) => row.puzzleId !== CURATED_META_DOC_ID && !row.deletedAt && row.active !== false)
    .sort((a, b) => {
      const aSched = a.scheduledFor || '9999-99-99';
      const bSched = b.scheduledFor || '9999-99-99';
      if (aSched !== bSched) return aSched.localeCompare(bSched);
      return String(a.title || '').localeCompare(String(b.title || ''));
    });
}

async function createStoredPuzzle(db, payload, actor = {}) {
  const colorGrid = payload.colorGrid || payload.reveal;
  const puzzle = makePuzzleFromColorGrid(colorGrid, {
    title: payload.title,
    subject: payload.subject || 'custom',
    difficulty: payload.difficulty,
    source: 'custom',
    puzzleId: payload.puzzleId,
  });

  if (!puzzle.validation?.valid) {
    throw Object.assign(new Error(
      `Puzzle is not valid: ${(puzzle.validation?.reasons || []).join(', ') || 'unknown'}`,
    ), { status: 400, validation: puzzle.validation });
  }

  const scheduledFor = String(payload.scheduledFor || '').trim() || null;
  if (scheduledFor && !/^\d{4}-\d{2}-\d{2}$/.test(scheduledFor)) {
    throw Object.assign(new Error('scheduledFor must be YYYY-MM-DD.'), { status: 400 });
  }

  const packed = packPuzzleForStorage(puzzle);
  const ref = db.collection(CATALOG_COLLECTION).doc();
  const now = admin.firestore.FieldValue.serverTimestamp();
  const docData = {
    puzzleId: ref.id,
    title: puzzle.title,
    subject: puzzle.subject,
    difficulty: puzzle.difficulty,
    size: packed.size,
    source: 'custom',
    solutionFlat: packed.solutionFlat,
    revealFlat: packed.revealFlat,
    rowCluesEncoded: packed.rowCluesEncoded,
    colCluesEncoded: packed.colCluesEncoded,
    validation: {
      valid: puzzle.validation.valid,
      reasons: puzzle.validation.reasons || [],
      metrics: puzzle.validation.metrics || {},
    },
    scheduledFor: scheduledFor || null,
    usedAt: null,
    usedOnDayKey: null,
    active: true,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    createdByUid: actor.uid || '',
    createdByName: actor.fullName || actor.email || '',
  };

  if (scheduledFor) {
    const clash = await db.collection(CATALOG_COLLECTION)
      .where('scheduledFor', '==', scheduledFor)
      .get();
    const batch = db.batch();
    clash.docs.forEach((doc) => {
      if (!doc.data()?.deletedAt) {
        batch.update(doc.ref, {
          scheduledFor: null,
          updatedAt: now,
        });
      }
    });
    batch.set(ref, docData);
    await batch.commit();
  } else {
    await ref.set(docData);
  }

  const snap = await ref.get();
  return serializeStoredPuzzle(snap, { includeValidation: true, includeSolution: true });
}

async function deleteStoredPuzzle(db, puzzleId) {
  const id = String(puzzleId || '').trim();
  if (!id) throw Object.assign(new Error('puzzleId is required.'), { status: 400 });
  const ref = db.collection(CATALOG_COLLECTION).doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw Object.assign(new Error('Puzzle not found.'), { status: 404 });
  await ref.update({
    active: false,
    deletedAt: admin.firestore.FieldValue.serverTimestamp(),
    scheduledFor: null,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return { puzzleId: id, deleted: true };
}

async function scheduleStoredPuzzle(db, puzzleId, scheduledFor) {
  const id = String(puzzleId || '').trim();
  if (!id) throw Object.assign(new Error('puzzleId is required.'), { status: 400 });
  const day = scheduledFor == null || scheduledFor === ''
    ? null
    : String(scheduledFor).trim();
  if (day && !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    throw Object.assign(new Error('scheduledFor must be YYYY-MM-DD.'), { status: 400 });
  }

  const ref = db.collection(CATALOG_COLLECTION).doc(id);
  const snap = await ref.get();
  if (!snap.exists || snap.data()?.deletedAt) {
    throw Object.assign(new Error('Puzzle not found.'), { status: 404 });
  }
  if (snap.data()?.usedOnDayKey) {
    throw Object.assign(new Error('This puzzle is spent and cannot be re-scheduled.'), { status: 400 });
  }

  const now = admin.firestore.FieldValue.serverTimestamp();
  const batch = db.batch();
  if (day) {
    const clash = await db.collection(CATALOG_COLLECTION)
      .where('scheduledFor', '==', day)
      .get();
    clash.docs.forEach((doc) => {
      if (doc.id === id) return;
      if (doc.data()?.deletedAt) return;
      batch.update(doc.ref, { scheduledFor: null, updatedAt: now });
    });
  }
  batch.update(ref, {
    scheduledFor: day,
    updatedAt: now,
  });
  await batch.commit();
  const updated = await ref.get();
  return serializeStoredPuzzle(updated, { includeValidation: true, includeSolution: true });
}

async function markPuzzleSpent(db, puzzleId, dayKey) {
  if (!puzzleId || String(puzzleId).startsWith('fallback-')) return;
  const ref = db.collection(CATALOG_COLLECTION).doc(puzzleId);
  const snap = await ref.get();
  if (!snap.exists) return;
  const data = snap.data() || {};
  if (data.usedOnDayKey) return;
  await ref.update({
    usedAt: admin.firestore.FieldValue.serverTimestamp(),
    usedOnDayKey: dayKey,
    scheduledFor: null,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

/**
 * Live daily selection:
 * 1) If this day already has a locked served puzzle, reuse it
 * 2) Else prefer a puzzle scheduled for this day (unspent)
 * 3) Else pick an unspent curated/custom puzzle matching target size
 * 4) Else fallback generator
 * On first live serve, lock the day and mark the catalog puzzle spent.
 */
async function resolveDailyPuzzle(db, dayKey = getLondonDayKey(), options = {}) {
  const requestedPuzzleId = options.puzzleId || '';
  const practice = Boolean(options.practice);

  if (requestedPuzzleId) {
    const doc = await db.collection(CATALOG_COLLECTION).doc(requestedPuzzleId).get();
    if (doc.exists && !doc.data()?.deletedAt) {
      return storedDocToPlayable(doc, dayKey);
    }
    const legacy = findPuzzleById(requestedPuzzleId);
    if (legacy) return { ...legacy, dayKey };
    const error = new Error('Requested nonogram puzzle was not found.');
    error.status = 404;
    throw error;
  }

  await ensureSeedCatalog(db);
  const catalogSnap = await db.collection(CATALOG_COLLECTION).get();
  const available = catalogSnap.docs
    .map((doc) => ({ doc, data: doc.data() || {} }))
    .filter(({ doc, data }) => (
      doc.id !== CURATED_META_DOC_ID
      && !data.deletedAt
      && data.active !== false
      && !data.usedOnDayKey
    ));

  const pickFromAvailable = () => {
    let chosen = available.find(({ data }) => data.scheduledFor === dayKey) || null;
    if (!chosen) {
      const targetSize = getTargetSizeForDay(dayKey);
      const pool = available.filter(({ data }) => data.size === targetSize && !data.scheduledFor);
      if (pool.length) {
        const index = hashString(`nonogram:daily:${dayKey}`) % pool.length;
        chosen = pool[index];
      }
    }
    if (!chosen && available.length) {
      const index = hashString(`nonogram:backup:${dayKey}`) % available.length;
      chosen = available[index];
    }
    return chosen;
  };

  if (!practice) {
    const dailyRef = db.collection(DAILY_COLLECTION).doc(dayKey);
    const locked = await db.runTransaction(async (tx) => {
      const dailySnap = await tx.get(dailyRef);
      if (dailySnap.exists) {
        return dailySnap.data() || null;
      }

      const chosen = pickFromAvailable();
      let puzzleId;
      let title = '';
      let size = getTargetSizeForDay(dayKey);
      let source = 'fallback';

      if (chosen) {
        const fresh = await tx.get(chosen.doc.ref);
        const data = fresh.data() || {};
        if (fresh.exists && !data.deletedAt && !data.usedOnDayKey) {
          puzzleId = fresh.id;
          title = data.title || '';
          size = data.size || size;
          source = data.source || 'custom';
          tx.update(fresh.ref, {
            usedAt: admin.firestore.FieldValue.serverTimestamp(),
            usedOnDayKey: dayKey,
            scheduledFor: null,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
      }

      if (!puzzleId) {
        const generated = getPuzzleForDay(dayKey);
        puzzleId = generated.puzzleId;
        title = generated.title || '';
        size = generated.size;
        source = generated.source || 'fallback';
      }

      tx.set(dailyRef, {
        dayKey,
        puzzleId,
        title,
        size,
        source,
        servedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return { puzzleId, title, size, source };
    });

    if (locked?.puzzleId) {
      if (String(locked.puzzleId).startsWith('fallback-')) {
        return getPuzzleForDay(dayKey);
      }
      const lockedDoc = await db.collection(CATALOG_COLLECTION).doc(locked.puzzleId).get();
      if (lockedDoc.exists) return storedDocToPlayable(lockedDoc, dayKey);
      return getPuzzleForDay(dayKey);
    }
  }

  const chosen = pickFromAvailable();
  if (chosen) return storedDocToPlayable(chosen.doc, dayKey);
  return getPuzzleForDay(dayKey);
}

module.exports = {
  SIZE: DEFAULT_SIZE,
  MAX_LIVES,
  MIN_SIZE,
  MAX_SIZE,
  PIXEL_PALETTE,
  CURATED_TEMPLATES,
  getLondonDayKey,
  getTargetSizeForDay,
  getPuzzleForDay,
  resolveDailyPuzzle,
  listPuzzleCatalog,
  listStoredCatalog,
  ensureSeedCatalog,
  createStoredPuzzle,
  deleteStoredPuzzle,
  scheduleStoredPuzzle,
  makePuzzleFromColorGrid,
  makeArtPuzzle,
  publicPuzzle,
  normalizeMarks,
  flattenMarks,
  isSolved,
  findWrongFills,
  serializeNonogramGame,
  formatDuration,
  cloneGrid,
  validatePuzzle,
  buildClues,
};
