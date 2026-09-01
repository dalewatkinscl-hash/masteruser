/**
 * Client helpers for the Sokoban level editor (XSB grid).
 */

export const SOKOBAN_TOOLS = [
  { id: 'wall', char: '#', label: 'Wall', color: 'bg-slate-600' },
  { id: 'floor', char: ' ', label: 'Floor', color: 'bg-[#0b1220]' },
  { id: 'goal', char: '.', label: 'Goal', color: 'bg-emerald-900/80' },
  { id: 'box', char: '$', label: 'Box', color: 'bg-amber-600' },
  { id: 'boxGoal', char: '*', label: 'Box on goal', color: 'bg-emerald-600' },
  { id: 'player', char: '@', label: 'Player', color: 'bg-blue-600' },
  { id: 'playerGoal', char: '+', label: 'Player on goal', color: 'bg-cyan-600' },
];

export const DEFAULT_SOKOBAN_WIDTH = 10;
export const DEFAULT_SOKOBAN_HEIGHT = 10;
export const MAX_SOKOBAN_SIZE = 16;

export function createEmptyGrid(height = DEFAULT_SOKOBAN_HEIGHT, width = DEFAULT_SOKOBAN_WIDTH) {
  const h = Math.max(3, Math.min(MAX_SOKOBAN_SIZE, height));
  const w = Math.max(3, Math.min(MAX_SOKOBAN_SIZE, width));
  const grid = Array.from({ length: h }, () => Array.from({ length: w }, () => ' '));
  for (let r = 0; r < h; r += 1) {
    for (let c = 0; c < w; c += 1) {
      if (r === 0 || c === 0 || r === h - 1 || c === w - 1) grid[r][c] = '#';
    }
  }
  // Default player in centre-ish floor cell
  const pr = Math.floor(h / 2);
  const pc = Math.floor(w / 2);
  if (grid[pr]?.[pc] === ' ') grid[pr][pc] = '@';
  return grid;
}

export function gridFromLayout(layout) {
  const rows = (Array.isArray(layout) ? layout : []).map((row) => String(row));
  if (!rows.length) return createEmptyGrid();
  const width = Math.max(...rows.map((row) => row.length));
  return rows.map((row) => row.padEnd(width, ' ').split(''));
}

export function layoutFromGrid(grid) {
  return (grid || []).map((row) => row.join('').replace(/\s+$/, ''));
}

export function cloneGrid(grid) {
  return (grid || []).map((row) => [...row]);
}

/** Ensure only one player; converting old player cell to floor/goal as needed. */
export function placeChar(grid, row, col, char) {
  const next = cloneGrid(grid);
  if (!next[row] || next[row][col] === undefined) return next;

  if (char === '@' || char === '+') {
    for (let r = 0; r < next.length; r += 1) {
      for (let c = 0; c < next[r].length; c += 1) {
        const ch = next[r][c];
        if (ch === '@') next[r][c] = ' ';
        if (ch === '+') next[r][c] = '.';
      }
    }
  }

  next[row][col] = char;
  return next;
}

export function resizeGrid(grid, height, width) {
  const h = Math.max(3, Math.min(MAX_SOKOBAN_SIZE, height));
  const w = Math.max(3, Math.min(MAX_SOKOBAN_SIZE, width));
  const next = Array.from({ length: h }, (_, r) => (
    Array.from({ length: w }, (_, c) => (grid[r] && grid[r][c] !== undefined ? grid[r][c] : ' '))
  ));
  return next;
}

export function validateSokobanGrid(grid) {
  const layout = layoutFromGrid(grid);
  const height = layout.length;
  const width = Math.max(0, ...layout.map((row) => row.length));
  let players = 0;
  let boxes = 0;
  let goals = 0;

  for (let r = 0; r < height; r += 1) {
    const row = String(layout[r] || '').padEnd(width, ' ');
    for (let c = 0; c < width; c += 1) {
      const ch = row[c];
      if (ch === '@' || ch === '+') players += 1;
      if (ch === '$' || ch === '*') boxes += 1;
      if (ch === '.' || ch === '+' || ch === '*') goals += 1;
    }
  }

  const errors = [];
  if (players !== 1) errors.push(`Need exactly 1 player (found ${players}).`);
  if (boxes < 1) errors.push('Need at least one box.');
  if (boxes !== goals) errors.push(`Boxes (${boxes}) must equal goals (${goals}).`);

  return {
    ok: errors.length === 0,
    errors,
    players,
    boxes,
    goals,
    layout,
    width,
    height,
  };
}

export function cellVisual(char) {
  switch (char) {
    case '#':
      return { label: '', className: 'bg-slate-600 border-slate-500' };
    case '.':
      return { label: '·', className: 'bg-[#0b1220] border-emerald-700/60 text-emerald-400' };
    case '$':
      return { label: '■', className: 'bg-amber-700/40 border-amber-500 text-amber-300' };
    case '*':
      return { label: '■', className: 'bg-emerald-800/50 border-emerald-400 text-emerald-200' };
    case '@':
      return { label: '☺', className: 'bg-blue-900/50 border-blue-400 text-blue-200' };
    case '+':
      return { label: '☺', className: 'bg-cyan-900/50 border-cyan-400 text-cyan-200' };
    default:
      return { label: '', className: 'bg-[#060e1a] border-[#1a2540]' };
  }
}
