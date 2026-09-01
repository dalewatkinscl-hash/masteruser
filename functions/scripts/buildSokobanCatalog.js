'use strict';

/**
 * One-shot: parse Skinner HTML dumps, BFS-validate, keep hard levels,
 * emit sokobanLevels.generated.json for embedding in sokoban.js.
 *
 * Levels by David W. Skinner (Microban / Sasquatch). Used with attribution.
 */

const fs = require('fs');
const path = require('path');
const sokoban = require('../sokoban');

const DIR_NAMES = ['up', 'down', 'left', 'right'];
const ROOT = path.join(__dirname, '..');

const PACKS = [
  { file: 'microban_raw.html', prefix: 'mb', name: 'Microban' },
  { file: 'sasquatch_raw.html', prefix: 'sq', name: 'Sasquatch' },
  { file: 'masSas_raw.html', prefix: 'ms', name: 'Mas Sasquatch' },
  { file: 'sasquatch3_raw.html', prefix: 's3', name: 'Sasquatch III' },
  { file: 'sasquatch4_raw.html', prefix: 's4', name: 'Sasquatch IV' },
  { file: 'sasquatch5_raw.html', prefix: 's5', name: 'Sasquatch V' },
];

function parseLevelsFromHtml(html, prefix, packName) {
  const preMatch = html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
  const text = preMatch ? preMatch[1] : html;
  const cleaned = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\r/g, '');

  const levels = [];
  const blocks = cleaned.split(/\n(?=Level\s+\d+)/i);
  for (const block of blocks) {
    const m = block.match(/^Level\s+(\d+)\s*\n([\s\S]*)$/i);
    if (!m) continue;
    const num = Number(m[1]);
    const lines = m[2].split('\n');
    const layout = [];
    let titleExtra = '';
    for (const line of lines) {
      const trimmedEnd = line.replace(/\s+$/, '');
      if (!trimmedEnd) {
        if (layout.length) break;
        continue;
      }
      if (/^['"]/.test(trimmedEnd) && !layout.length) {
        titleExtra = trimmedEnd.replace(/^['"]|['"]$/g, '');
        continue;
      }
      if (/^Level\s+/i.test(trimmedEnd)) break;
      if (!/[#@\$\.\*\+]/.test(trimmedEnd) && layout.length) break;
      if (!/[#@\$\.\*\+\s-]/.test(trimmedEnd)) continue;
      layout.push(trimmedEnd.replace(/-/g, ' '));
    }
    if (layout.length < 3) continue;
    levels.push({
      id: `${prefix}-${String(num).padStart(3, '0')}`,
      title: titleExtra || `${packName} ${num}`,
      layout,
      sourceNum: num,
      source: prefix,
    });
  }
  return levels;
}

function countBoxes(layout) {
  let n = 0;
  for (const row of layout) {
    for (const ch of row) {
      if (ch === '$' || ch === '*') n += 1;
    }
  }
  return n;
}

function stateKey(state) {
  const boxes = state.boxes
    .map((b) => `${b.r},${b.c}`)
    .sort()
    .join(';');
  return `${state.player.r},${state.player.c}|${boxes}`;
}

function bfsSolve(layout, { maxStates = 500000 } = {}) {
  let puzzle;
  try {
    puzzle = sokoban.parseLayout(layout);
  } catch {
    return null;
  }
  if (puzzle.boxes.length !== puzzle.targets.length) return null;
  if (puzzle.boxes.length < 1) return null;

  const start = {
    player: { ...puzzle.player },
    boxes: puzzle.boxes.map((b) => ({ ...b })),
  };
  const queue = [{ state: start, moves: 0 }];
  const visited = new Set([stateKey(start)]);
  let explored = 0;
  let head = 0;

  while (head < queue.length) {
    const cur = queue[head];
    head += 1;
    explored += 1;
    if (explored > maxStates) {
      return { solvable: false, reason: 'timeout', explored, boxes: puzzle.boxes.length };
    }

    if (sokoban.isSolved(cur.state, puzzle.targets)) {
      return {
        solvable: true,
        moves: cur.moves,
        explored,
        boxes: puzzle.boxes.length,
      };
    }

    for (const dir of DIR_NAMES) {
      const result = sokoban.applyMove(puzzle, cur.state, dir);
      if (!result.ok) continue;
      const key = stateKey(result.state);
      if (visited.has(key)) continue;
      visited.add(key);
      queue.push({ state: result.state, moves: cur.moves + 1 });
    }
  }

  return { solvable: false, reason: 'unsolvable', explored, boxes: puzzle.boxes.length };
}

function difficultyLabel(moves, boxes) {
  if (moves >= 70 || boxes >= 6) return 'hard';
  if (moves >= 35 || boxes >= 4) return 'hard';
  if (moves >= 22) return 'medium';
  return 'easy';
}

function main() {
  const all = [
    {
      id: 'boxroom-1',
      title: 'Box Room',
      layout: [
        '########',
        '#      #',
        '# $$$@ #',
        '#  ... #',
        '########',
      ],
      source: 'custom',
      sourceNum: 0,
    },
  ];

  for (const pack of PACKS) {
    const filePath = path.join(ROOT, pack.file);
    if (!fs.existsSync(filePath)) {
      console.warn('missing', pack.file);
      continue;
    }
    const parsed = parseLevelsFromHtml(fs.readFileSync(filePath, 'utf8'), pack.prefix, pack.name);
    console.log(`${pack.name}: ${parsed.length}`);
    all.push(...parsed);
  }

  console.log(`Total candidates: ${all.length}`);

  const kept = [];
  let i = 0;
  for (const level of all) {
    i += 1;
    const boxes = countBoxes(level.layout);
    const h = level.layout.length;
    const w = Math.max(...level.layout.map((r) => r.length));
    if (boxes < 2) continue;
    // Keep daily puzzles playable on phone; skip huge boards
    if (h > 14 || w > 16) continue;
    // Sasquatch with many boxes can explode; raise budget for mid sizes
    const maxStates = boxes >= 6 ? 250000 : boxes >= 4 ? 600000 : 400000;
    const result = bfsSolve(level.layout, { maxStates });
    if (!result || !result.solvable) {
      process.stdout.write(result?.reason === 'timeout' ? 'T' : '.');
      continue;
    }

    const hardEnough =
      level.id === 'boxroom-1'
      || result.moves >= 32
      || (boxes >= 4 && result.moves >= 22)
      || (boxes >= 5 && result.moves >= 18);

    if (!hardEnough) {
      process.stdout.write('x');
      continue;
    }

    kept.push({
      id: level.id,
      title: level.title,
      difficulty: level.id === 'boxroom-1' ? 'medium' : difficultyLabel(result.moves, boxes),
      layout: level.layout,
      meta: { moves: result.moves, boxes, explored: result.explored },
    });
    process.stdout.write('+');
    if (i % 40 === 0) process.stdout.write(` [${i}/${all.length} kept=${kept.length}]\n`);
  }
  console.log('');

  const seenLayout = new Set();
  const unique = [];
  for (const level of kept.sort((a, b) => (b.meta.moves - a.meta.moves) || (b.meta.boxes - a.meta.boxes))) {
    const sig = level.layout.join('\n');
    if (seenLayout.has(sig)) continue;
    seenLayout.add(sig);
    unique.push(level);
  }

  const boxroom = unique.find((l) => l.id === 'boxroom-1');
  const others = unique.filter((l) => l.id !== 'boxroom-1');
  // Prefer hard, keep a large unique pool (~120) so days don't collide for months
  const hard = others.filter((l) => l.difficulty === 'hard');
  const medium = others.filter((l) => l.difficulty === 'medium');
  const capped = [...hard.slice(0, 100), ...medium.slice(0, 20)].slice(0, 120);
  const finalLevels = boxroom ? [boxroom, ...capped] : capped;

  console.log(`Kept ${finalLevels.length} levels (hard=${hard.length}, medium=${medium.length})`);
  console.log('Hardest:', finalLevels.slice(1, 10).map((l) => `${l.id} m=${l.meta.moves} b=${l.meta.boxes}`));
  console.log('boxroom moves', boxroom?.meta);

  const outPath = path.join(ROOT, 'sokobanLevels.generated.json');
  fs.writeFileSync(
    outPath,
    JSON.stringify(finalLevels.map(({ meta, ...rest }) => ({ ...rest, _meta: meta })), null, 2),
  );
  console.log('Wrote', outPath);
}

main();
