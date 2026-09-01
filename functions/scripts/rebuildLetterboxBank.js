'use strict';

const fs = require('fs');
const path = require('path');
const { ensureWordSet } = require('../boggle');

function assignSides(wordList) {
  const norms = wordList.map((w) => w.toUpperCase());
  const letters = [...new Set(norms.join('').split(''))];
  if (letters.length !== 12) return null;
  const edges = [];
  for (const w of norms) {
    for (let i = 1; i < w.length; i += 1) {
      if (w[i] !== w[i - 1]) edges.push([w[i - 1], w[i]]);
    }
  }
  const map = {};
  const counts = [0, 0, 0, 0];
  function ok(ch, s) {
    for (const [a, b] of edges) {
      if ((a === ch && map[b] === s) || (b === ch && map[a] === s)) return false;
    }
    return true;
  }
  function bt(i) {
    if (i >= letters.length) return true;
    const ch = letters[i];
    for (const s of [0, 1, 2, 3].sort(() => Math.random() - 0.5)) {
      if (counts[s] >= 3 || !ok(ch, s)) continue;
      map[ch] = s;
      counts[s] += 1;
      if (bt(i + 1)) return true;
      counts[s] -= 1;
      delete map[ch];
    }
    return false;
  }
  if (!bt(0) || counts.some((c) => c !== 3)) return null;
  const sides = ['', '', '', ''];
  for (const [ch, s] of Object.entries(map)) sides[s] += ch;
  return sides.map((s) => s.split('').sort().join(''));
}

const WANT = [
  // deliberately easy / common first
  ['SOUND', 'DITCH', 'HEART'],
  ['BUSH', 'HARMONY', 'YACHTS'],
  ['PEARL', 'LIGHT', 'TRUNK'],
  ['COAST', 'THRONGS', 'SPYING'],
  ['CRADLES', 'SIMPLE', 'ENGINE'],
  // daily bank filler
  ['SING', 'GLYPHS', 'STEAM'],
  ['GRIND', 'DWARFS', 'STOUT'],
  ['FOAM', 'MACHINE', 'ENERGY'],
  ['NUTMEG', 'GRAPE', 'EBONY'],
  ['RICE', 'EBONY', 'YACHTS'],
  ['SCOUT', 'TEMPLE', 'ETCH', 'HOUND'],
  ['CRUST', 'TABLE', 'EAGLE', 'ENGINE'],
  ['GRAPE', 'ENGINE', 'EARTH', 'HOLD'],
  ['WRITE', 'ENGINE', 'ENERGY', 'YACHTS'],
  ['NATURE', 'EXPAND', 'DRIVE', 'EARTH'],
  ['SPEAK', 'KARMA', 'ANIMAL', 'LEGEND'],
  ['LAKE', 'EAGLE', 'EPIC', 'CRUMB'],
  ['GAME', 'ENGINE', 'ELBOW', 'WALNUT'],
];

(async () => {
  const set = await ensureWordSet(null);
  const bank = [];
  for (const chain of WANT) {
    const upper = chain.map((w) => w.toUpperCase());
    if (upper.some((w) => !set.has(w.toLowerCase()))) {
      console.log('skip missing', chain.join(' → '));
      continue;
    }
    if (new Set(upper.join('')).size !== 12) {
      console.log('skip letters', new Set(upper.join('')).size, chain.join(' → '));
      continue;
    }
    let sides = null;
    for (let t = 0; t < 120; t += 1) {
      sides = assignSides(upper);
      if (sides) break;
    }
    if (!sides) {
      console.log('skip sides', chain.join(' → '));
      continue;
    }
    const key = sides.slice().sort().join('|');
    if (bank.some((p) => p.sides.slice().sort().join('|') === key)) continue;
    bank.push({
      id: `lb${String(bank.length + 1).padStart(3, '0')}`,
      sides,
      solution: upper,
      par: upper.length,
    });
    if (bank.length >= 16) break;
  }

  if (bank.length < 12) {
    console.error('Only got', bank.length);
    process.exit(1);
  }

  const outPath = path.join(__dirname, '..', 'data', 'letterboxPuzzles.json');
  fs.writeFileSync(outPath, `${JSON.stringify(bank, null, 2)}\n`);
  console.log('Wrote', bank.length, 'to', outPath);
  bank.forEach((p, i) => console.log(i + 1, `par ${p.par}`, p.solution.join(' → ')));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
