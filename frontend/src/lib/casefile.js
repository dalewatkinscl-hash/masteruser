/**
 * Casefile — Murdoku-style daily scene logic (original cases, LimeZu interiors).
 * 6×6 map, five people, one per row and column. Clues must all be true.
 * The murderer is the only other person in the victim’s room.
 * Puzzles are generated from a known placement, then trimmed until unique.
 */

import seedBank from './casefileSeeds.json' with { type: 'json' };

export const CASEFILE_SIZE = 6;
export const CASEFILE_ASSET_BASE = '/casefile';

export const CASEFILE_PEOPLE = [
  { id: 'adam', name: 'Adam', role: 'suspect', sprite: `${CASEFILE_ASSET_BASE}/adam.png` },
  { id: 'alex', name: 'Alex', role: 'suspect', sprite: `${CASEFILE_ASSET_BASE}/alex.png` },
  { id: 'amelia', name: 'Amelia', role: 'suspect', sprite: `${CASEFILE_ASSET_BASE}/amelia.png` },
  { id: 'bob', name: 'Bob', role: 'suspect', sprite: `${CASEFILE_ASSET_BASE}/bob.png` },
  { id: 'victim', name: 'the victim', shortName: 'Victim', role: 'victim', sprite: null },
];

export const CASEFILE_ROOMS = [
  {
    id: 'lounge',
    name: 'Lounge',
    floor: `${CASEFILE_ASSET_BASE}/art/floor-wood.png`,
    wall: `${CASEFILE_ASSET_BASE}/art/wall-wood.png`,
  },
  {
    id: 'kitchen',
    name: 'Kitchen',
    floor: `${CASEFILE_ASSET_BASE}/art/floor-yellow.png`,
    wall: `${CASEFILE_ASSET_BASE}/art/wall-yellow.png`,
  },
  {
    id: 'study',
    name: 'Study',
    floor: `${CASEFILE_ASSET_BASE}/art/floor-blue.png`,
    wall: `${CASEFILE_ASSET_BASE}/art/wall-cyan.png`,
  },
  {
    id: 'hall',
    name: 'Hall',
    floor: `${CASEFILE_ASSET_BASE}/art/floor-grey.png`,
    wall: `${CASEFILE_ASSET_BASE}/art/wall-grey.png`,
  },
];

/** Unique named props — cropped from LimeZu Interiors so they always draw. */
export const CASEFILE_OBJECTS = [
  { id: 'plant', label: 'the plant', src: `${CASEFILE_ASSET_BASE}/art/plant.png`, w: 32, h: 32 },
  { id: 'globe', label: 'the globe', src: `${CASEFILE_ASSET_BASE}/art/globe.png`, w: 16, h: 32 },
  { id: 'chair', label: 'the chair', src: `${CASEFILE_ASSET_BASE}/art/chair.png`, w: 16, h: 32 },
  { id: 'lamp', label: 'the lamp', src: `${CASEFILE_ASSET_BASE}/art/lamp.png`, w: 16, h: 32 },
  { id: 'shelf', label: 'the bookshelf', src: `${CASEFILE_ASSET_BASE}/art/shelf.png`, w: 16, h: 32 },
];

export const ROOMS_SHEET = {
  src: `${CASEFILE_ASSET_BASE}/rooms.png`,
  width: 272,
  height: 368,
};

export const INTERIORS_SHEET = {
  src: `${CASEFILE_ASSET_BASE}/interiors.png`,
  width: 256,
  height: 1424,
};

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

function shuffle(arr, rng) {
  const next = [...arr];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function pick(arr, rng) {
  return arr[Math.floor(rng() * arr.length)];
}

export function roomIdAt(row, col) {
  const north = row < 3;
  const west = col < 3;
  if (north && west) return 'lounge';
  if (north && !west) return 'kitchen';
  if (!north && west) return 'study';
  return 'hall';
}

export function getRoom(roomId) {
  return CASEFILE_ROOMS.find((r) => r.id === roomId) || CASEFILE_ROOMS[0];
}

export function getPerson(personId) {
  return CASEFILE_PEOPLE.find((p) => p.id === personId) || null;
}

export function getObject(objectId) {
  return CASEFILE_OBJECTS.find((o) => o.id === objectId) || null;
}

function cellKey(row, col) {
  return `${row},${col}`;
}

function adjacent(a, b) {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1;
}

function occupiedByObject(row, col, objects) {
  return (objects || []).some((o) => o.row === row && o.col === col);
}

function peopleByRoom(placement) {
  const map = {};
  for (const room of CASEFILE_ROOMS) map[room.id] = [];
  for (const [pid, pos] of Object.entries(placement || {})) {
    if (!pos) continue;
    const rid = roomIdAt(pos.row, pos.col);
    map[rid].push(pid);
  }
  return map;
}

export function murdererOf(placement) {
  const victim = placement?.victim;
  if (!victim) return null;
  const room = roomIdAt(victim.row, victim.col);
  const others = (peopleByRoom(placement)[room] || []).filter((id) => id !== 'victim');
  if (others.length !== 1) return null;
  return others[0];
}

function clueHolds(clue, placement, objects) {
  const pos = (id) => placement?.[id];
  if (clue.type === 'inRoom') {
    const p = pos(clue.person);
    return Boolean(p) && roomIdAt(p.row, p.col) === clue.room;
  }
  if (clue.type === 'besideObject') {
    const p = pos(clue.person);
    const obj = (objects || []).find((o) => o.id === clue.object);
    if (!p || !obj) return false;
    return adjacent(p, obj) && roomIdAt(p.row, p.col) === roomIdAt(obj.row, obj.col);
  }
  if (clue.type === 'nextTo') {
    const a = pos(clue.person);
    const b = pos(clue.other);
    if (!a || !b) return false;
    return adjacent(a, b) && roomIdAt(a.row, a.col) === roomIdAt(b.row, b.col);
  }
  if (clue.type === 'sameRoom') {
    const a = pos(clue.person);
    const b = pos(clue.other);
    return Boolean(a && b) && roomIdAt(a.row, a.col) === roomIdAt(b.row, b.col);
  }
  if (clue.type === 'aloneInRoom') {
    const p = pos(clue.person);
    if (!p) return false;
    const room = roomIdAt(p.row, p.col);
    const ids = peopleByRoom(placement)[room] || [];
    return ids.length === 1 && ids[0] === clue.person;
  }
  if (clue.type === 'northOf' || clue.type === 'southOf' || clue.type === 'westOf' || clue.type === 'eastOf') {
    const a = pos(clue.person);
    const b = pos(clue.other);
    if (!a || !b) return false;
    if (clue.type === 'northOf') return a.row < b.row;
    if (clue.type === 'southOf') return a.row > b.row;
    if (clue.type === 'westOf') return a.col < b.col;
    return a.col > b.col;
  }
  return false;
}

function cluesHold(clues, placement, objects, { partial = false } = {}) {
  for (const clue of clues || []) {
    const needed = [clue.person, clue.other].filter(Boolean);
    if (partial && needed.some((id) => !placement[id])) continue;
    if (!clueHolds(clue, placement, objects)) return false;
  }
  return true;
}

function countSolutions(clues, objects, { limit = 8 } = {}) {
  const ids = CASEFILE_PEOPLE.map((p) => p.id);
  const placement = {};
  const usedRow = new Array(CASEFILE_SIZE).fill(false);
  const usedCol = new Array(CASEFILE_SIZE).fill(false);
  let count = 0;
  const walk = (index) => {
    if (count >= limit) return;
    if (index >= ids.length) {
      // Clues alone must pin a unique seating — murderer is checked separately.
      count += 1;
      return;
    }
    const pid = ids[index];
    for (let row = 0; row < CASEFILE_SIZE; row += 1) {
      if (usedRow[row]) continue;
      for (let col = 0; col < CASEFILE_SIZE; col += 1) {
        if (usedCol[col]) continue;
        if (occupiedByObject(row, col, objects)) continue;
        placement[pid] = { row, col };
        usedRow[row] = true;
        usedCol[col] = true;
        if (cluesHold(clues, placement, objects, { partial: true })) {
          walk(index + 1);
        }
        usedRow[row] = false;
        usedCol[col] = false;
        delete placement[pid];
        if (count >= limit) return;
      }
    }
  };
  walk(0);
  return count;
}

function describeClue(clue) {
  const person = getPerson(clue.person)?.name || clue.person;
  const other = getPerson(clue.other)?.name || clue.other;
  const room = getRoom(clue.room)?.name || clue.room;
  const object = CASEFILE_OBJECTS.find((o) => o.id === clue.object)?.label || clue.object;
  const cap = (text) => text.charAt(0).toUpperCase() + text.slice(1);
  if (clue.type === 'inRoom') return cap(`${person} was in the ${room}.`);
  if (clue.type === 'besideObject') return cap(`${person} was beside ${object}.`);
  if (clue.type === 'nextTo') return cap(`${person} stood next to ${other}.`);
  if (clue.type === 'sameRoom') return cap(`${person} was in the same room as ${other}.`);
  if (clue.type === 'aloneInRoom') return cap(`${person} was alone in the ${room}.`);
  if (clue.type === 'northOf') return cap(`${person} was north of ${other}.`);
  if (clue.type === 'southOf') return cap(`${person} was south of ${other}.`);
  if (clue.type === 'westOf') return cap(`${person} was west of ${other}.`);
  if (clue.type === 'eastOf') return cap(`${person} was east of ${other}.`);
  return 'A clue is missing.';
}

function collectTrueClues(placement, objects) {
  const clues = [];
  const ids = CASEFILE_PEOPLE.map((p) => p.id);
  for (const person of ids) {
    const pos = placement[person];
    const room = roomIdAt(pos.row, pos.col);
    clues.push({ type: 'inRoom', person, room });
    const roommates = (peopleByRoom(placement)[room] || []).filter((id) => id !== person);
    if (roommates.length === 0) {
      clues.push({ type: 'aloneInRoom', person, room });
    }
    for (const other of ids) {
      if (other === person) continue;
      const b = placement[other];
      const otherRoom = roomIdAt(b.row, b.col);
      if (room === otherRoom) {
        clues.push({ type: 'sameRoom', person, other, room });
        if (adjacent(pos, b)) clues.push({ type: 'nextTo', person, other, room });
      }
      if (pos.row < b.row) clues.push({ type: 'northOf', person, other, room, otherRoom });
      if (pos.row > b.row) clues.push({ type: 'southOf', person, other, room, otherRoom });
      if (pos.col < b.col) clues.push({ type: 'westOf', person, other, room, otherRoom });
      if (pos.col > b.col) clues.push({ type: 'eastOf', person, other, room, otherRoom });
    }
    for (const obj of objects) {
      if (adjacent(pos, obj) && roomIdAt(obj.row, obj.col) === room) {
        clues.push({ type: 'besideObject', person, object: obj.id, room });
      }
    }
  }
  return clues;
}

function clueRank(clue) {
  if (clue.type === 'besideObject') return 0;
  if (clue.type === 'nextTo') return 1;
  if (clue.type === 'aloneInRoom') return 2;
  if (clue.type === 'inRoom') return 3;
  if (clue.type === 'sameRoom') return 4;
  return 5;
}

function pickOneClueEach(allClues, objects) {
  const ids = CASEFILE_PEOPLE.map((p) => p.id);
  if (countSolutions(allClues, objects, { limit: 2 }) !== 1) return null;
  const weakestFirst = [...allClues].sort((a, b) => clueRank(b) - clueRank(a));
  let kept = [...allClues];
  for (const clue of weakestFirst) {
    const forPerson = kept.filter((c) => c.person === clue.person);
    if (forPerson.length <= 1) continue;
    const without = kept.filter((c) => c !== clue);
    if (countSolutions(without, objects, { limit: 2 }) === 1) {
      kept = without;
    }
  }
  if (kept.length !== ids.length) return null;
  if (ids.some((id) => kept.filter((c) => c.person === id).length !== 1)) return null;
  if (countSolutions(kept, objects, { limit: 2 }) !== 1) return null;
  return kept;
}

function placePeople(rng) {
  const ids = CASEFILE_PEOPLE.map((p) => p.id);
  const rows = shuffle([...Array(CASEFILE_SIZE).keys()], rng).slice(0, ids.length);
  const cols = shuffle([...Array(CASEFILE_SIZE).keys()], rng).slice(0, ids.length);
  const placement = {};
  ids.forEach((id, index) => {
    placement[id] = { row: rows[index], col: cols[index] };
  });
  return placement;
}

function placeObjects(rng, placement) {
  const taken = new Set(Object.values(placement).map((p) => cellKey(p.row, p.col)));
  const kinds = shuffle(CASEFILE_OBJECTS, rng);
  const objects = [];
  const people = shuffle(Object.entries(placement), rng);
  for (let i = 0; i < people.length; i += 1) {
    const [, pos] = people[i];
    const kind = kinds[i];
    if (!kind) break;
    const room = roomIdAt(pos.row, pos.col);
    const spots = [];
    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (const [dr, dc] of dirs) {
      const row = pos.row + dr;
      const col = pos.col + dc;
      if (row < 0 || col < 0 || row >= CASEFILE_SIZE || col >= CASEFILE_SIZE) continue;
      if (roomIdAt(row, col) !== room) continue;
      if (taken.has(cellKey(row, col))) continue;
      spots.push({ row, col });
    }
    if (!spots.length) continue;
    const spot = pick(spots, rng);
    taken.add(cellKey(spot.row, spot.col));
    objects.push({
      id: kind.id,
      row: spot.row,
      col: spot.col,
      room,
    });
  }
  return objects;
}

export function generateCasefilePuzzle({ seed, title } = {}) {
  const seedKey = String(seed || `casefile:${Date.now()}`);
  const rng = mulberry32(hashString(seedKey));
  for (let attempt = 0; attempt < 240; attempt += 1) {
    const placement = placePeople(rng);
    const killer = murdererOf(placement);
    if (!killer) continue;
    const objects = placeObjects(rng, placement);
    if (objects.length < CASEFILE_PEOPLE.length) continue;
    const allClues = collectTrueClues(placement, objects);
    const clues = pickOneClueEach(allClues, objects);
    if (!clues || clues.length !== CASEFILE_PEOPLE.length) continue;
    return {
      id: seedKey.replace(/[^a-z0-9:-]+/gi, '').slice(0, 48) || 'case',
      title: title || 'The office',
      size: CASEFILE_SIZE,
      rooms: CASEFILE_ROOMS.map((r) => r.id),
      objects,
      clues: clues.map((clue) => ({ ...clue, text: describeClue(clue) })),
      solution: {
        placement,
        murderer: killer,
      },
    };
  }
  throw new Error('Could not generate a unique Casefile puzzle.');
}

export const CASEFILE_SEED_PUZZLES = seedBank;

export function getPuzzleById(id) {
  return CASEFILE_SEED_PUZZLES.find((p) => p.id === id) || null;
}

export function getPuzzleForDay(dayKey) {
  return generateCasefilePuzzle({
    seed: `casefile:v4:${dayKey}`,
    title: `Case ${dayKey}`,
  });
}

export function clonePuzzle(puzzle) {
  return JSON.parse(JSON.stringify(puzzle));
}

export function emptyMarks(size = CASEFILE_SIZE) {
  return Array.from({ length: size }, () => Array.from({ length: size }, () => false));
}

/** Auto-cross furniture and every other cell in each placed person's row and column. */
export function marksFromPlacement(placement, objects, size = CASEFILE_SIZE) {
  const next = emptyMarks(size);
  for (const obj of objects || []) {
    if (obj.row >= 0 && obj.col >= 0 && obj.row < size && obj.col < size) {
      next[obj.row][obj.col] = true;
    }
  }
  for (const pos of Object.values(placement || {})) {
    if (!pos) continue;
    for (let col = 0; col < size; col += 1) {
      if (col !== pos.col) next[pos.row][col] = true;
    }
    for (let row = 0; row < size; row += 1) {
      if (row !== pos.row) next[row][pos.col] = true;
    }
  }
  return next;
}

export function evaluateCasefile(puzzle, placement, murdererId) {
  const expected = puzzle?.solution?.placement || {};
  let correctSeats = 0;
  for (const person of CASEFILE_PEOPLE) {
    const got = placement?.[person.id];
    const want = expected[person.id];
    if (got && want && got.row === want.row && got.col === want.col) correctSeats += 1;
  }
  const seatsOk = correctSeats === CASEFILE_PEOPLE.length;
  const killerOk = seatsOk && murdererId === puzzle?.solution?.murderer;
  return {
    correctSeats,
    total: CASEFILE_PEOPLE.length,
    seatsOk,
    killerOk,
    solved: Boolean(killerOk),
    murderer: puzzle?.solution?.murderer || null,
  };
}

export { describeClue };
