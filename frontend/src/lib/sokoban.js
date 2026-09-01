/**
 * Client-side Sokoban engine — mirrors functions/sokoban.js so play stays local.
 */

export const DIRS = {
  up: { dr: -1, dc: 0 },
  down: { dr: 1, dc: 0 },
  left: { dr: 0, dc: -1 },
  right: { dr: 0, dc: 1 },
};

export function cellKey(r, c) {
  return `${r},${c}`;
}

export function normalizeDirection(raw) {
  const value = String(raw || '').trim().toLowerCase();
  if (value === 'u' || value === 'w' || value === 'north') return 'up';
  if (value === 'd' || value === 's' || value === 'south') return 'down';
  if (value === 'l' || value === 'a' || value === 'west') return 'left';
  if (value === 'east') return 'right';
  if (DIRS[value]) return value;
  return '';
}

function cloneState(state) {
  return {
    player: { r: state.player.r, c: state.player.c },
    boxes: state.boxes.map((box) => ({ r: box.r, c: box.c })),
  };
}

function boxSet(boxes) {
  return new Set(boxes.map((box) => cellKey(box.r, box.c)));
}

export function buildEngine(puzzle) {
  return {
    width: puzzle.width,
    height: puzzle.height,
    walls: new Set(puzzle.walls || []),
    targets: puzzle.targets || [],
    player: puzzle.initialPlayer,
    boxes: puzzle.initialBoxes || [],
  };
}

function isWall(engine, r, c) {
  if (r < 0 || c < 0 || r >= engine.height || c >= engine.width) return true;
  return engine.walls.has(cellKey(r, c));
}

export function isSolved(state, targets) {
  const boxes = boxSet(state.boxes);
  return (targets || []).every((t) => boxes.has(typeof t === 'string' ? t : cellKey(t.r, t.c)));
}

export function applyMove(engine, state, direction) {
  const dir = DIRS[normalizeDirection(direction)];
  if (!dir) return { ok: false, reason: 'Invalid direction.' };

  const next = cloneState(state);
  const nr = next.player.r + dir.dr;
  const nc = next.player.c + dir.dc;
  if (isWall(engine, nr, nc)) return { ok: false, reason: 'Blocked by wall.' };

  const boxes = boxSet(next.boxes);
  if (boxes.has(cellKey(nr, nc))) {
    const br = nr + dir.dr;
    const bc = nc + dir.dc;
    if (isWall(engine, br, bc) || boxes.has(cellKey(br, bc))) {
      return { ok: false, reason: 'Cannot push box.' };
    }
    next.boxes = next.boxes.map((box) => (
      box.r === nr && box.c === nc ? { r: br, c: bc } : box
    ));
  }

  next.player = { r: nr, c: nc };
  return { ok: true, state: next };
}

export function replayMoves(engine, moves) {
  let state = {
    player: { ...engine.player },
    boxes: (engine.boxes || []).map((box) => ({ ...box })),
  };
  const applied = [];
  for (const move of moves || []) {
    const direction = normalizeDirection(move);
    if (!direction) continue;
    const result = applyMove(engine, state, direction);
    if (!result.ok) break;
    state = result.state;
    applied.push(direction);
  }
  return { state, moves: applied };
}

export function createLocalGame(puzzle, priorMoves = []) {
  const engine = buildEngine(puzzle);
  const { state, moves } = replayMoves(engine, priorMoves);
  const won = isSolved(state, engine.targets);
  return {
    dayKey: puzzle.dayKey,
    puzzleId: puzzle.puzzleId,
    title: puzzle.title,
    difficulty: puzzle.difficulty,
    player: state.player,
    boxes: state.boxes,
    moves,
    moveCount: moves.length,
    status: won ? 'won' : 'in_progress',
    facing: moves.length ? moves[moves.length - 1] : 'down',
    resetCount: 0,
    maxResets: null,
    undoCount: 0,
    maxUndos: null,
  };
}

export function localMove(puzzle, game, direction) {
  if (!puzzle || !game || game.status === 'won') return game;
  const engine = buildEngine(puzzle);
  const dir = normalizeDirection(direction);
  if (!dir) return game;
  const current = {
    player: game.player,
    boxes: game.boxes,
  };
  const result = applyMove(engine, current, dir);
  if (!result.ok) return { ...game, facing: dir };
  const moves = [...(game.moves || []), dir];
  const won = isSolved(result.state, engine.targets);
  return {
    ...game,
    player: result.state.player,
    boxes: result.state.boxes,
    moves,
    // Move count is always the length of the current attempt path.
    moveCount: moves.length,
    status: won ? 'won' : 'in_progress',
    facing: dir,
  };
}

export function localUndo(puzzle, game) {
  if (!puzzle || !game || game.status === 'won') return game;
  if (!(game.moves || []).length) return game;
  const moves = (game.moves || []).slice(0, -1);
  return {
    ...createLocalGame(puzzle, moves),
    moveCount: moves.length,
    resetCount: Number.isFinite(game.resetCount) ? game.resetCount : 0,
    maxResets: Number.isFinite(game.maxResets) ? game.maxResets : null,
    undoCount: Number.isFinite(game.undoCount) ? game.undoCount : 0,
    maxUndos: Number.isFinite(game.maxUndos) ? game.maxUndos : null,
  };
}

export function localReset(puzzle, game = null) {
  if (!puzzle) return null;
  return {
    ...createLocalGame(puzzle, []),
    moveCount: 0,
    resetCount: Number.isFinite(game?.resetCount) ? game.resetCount : 0,
    maxResets: Number.isFinite(game?.maxResets) ? game.maxResets : null,
    undoCount: Number.isFinite(game?.undoCount) ? game.undoCount : 0,
    maxUndos: Number.isFinite(game?.maxUndos) ? game.maxUndos : null,
  };
}
