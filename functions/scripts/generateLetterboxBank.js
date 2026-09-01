'use strict';

/**
 * One-off generator: Letter Box boards with 3–4 word solutions.
 * Opaque ids only (lb001…). Writes functions/data/letterboxPuzzles.json
 */

const fs = require('fs');
const path = require('path');

const dictText = fs.readFileSync(
  path.join(__dirname, '..', 'data', 'boggleDictionary-v1.txt'),
  'utf8',
);
const dict = new Set(
  dictText
    .split(/\r?\n/)
    .map((l) => l.trim().toLowerCase())
    .filter((w) => /^[a-z]{3,8}$/.test(w) && !/(.)\1/.test(w)),
);

/** Prefer familiar / pronounceable words over Scrabble dumps. */
const PREFERRED = [
  'jacket', 'throngs', 'buckets', 'sphinx', 'cradles', 'dogmatic', 'clumpy',
  'flexed', 'wrenches', 'stumpy', 'simple', 'trophies', 'symbol', 'jackpot',
  'thumbs', 'expand', 'hybrid', 'fabled', 'jumped', 'hydrant', 'jinxed',
  'brick', 'flame', 'ghost', 'quick', 'brown', 'vexed', 'plumb', 'frogs',
  'waltz', 'nymph', 'grape', 'hazy', 'dust', 'film', 'boxing', 'fjords',
  'quartz', 'jumpy', 'thawed', 'blight', 'farms', 'dwarfs', 'fights',
  'flames', 'inject', 'object', 'flaws', 'phlegm', 'dusty', 'quirky',
  'rhymes', 'blade', 'unlock', 'myths', 'vouch', 'tramps', 'wrecks',
  'yachts', 'zodiac', 'banjo', 'crumb', 'glyph', 'plows', 'nickel',
  'liquid', 'shade', 'stalk', 'vexing', 'fjord', 'nymphs', 'jockey',
  'tribes', 'faxed', 'plums', 'glyphs', 'quart', 'fluxed', 'thunder',
  'clamor', 'spying', 'board', 'night', 'clumps', 'hydrate', 'wrench',
  'quips', 'mystic', 'brave', 'cloud', 'drink', 'forge', 'grasp', 'hound',
  'ivory', 'jewel', 'knack', 'lemon', 'marsh', 'north', 'opera', 'prism',
  'quest', 'raven', 'scout', 'tiger', 'ultra', 'vivid', 'whale', 'xenon',
  'yacht', 'zesty', 'amber', 'cabin', 'delta', 'eagle', 'frost', 'grain',
  'hobby', 'index', 'jumps', 'knots', 'lunar', 'maple', 'noble', 'ocean',
  'piano', 'quilt', 'river', 'storm', 'trend', 'urban', 'vapor', 'wheat',
  'crane', 'spike', 'flame', 'brush', 'craft', 'dwarf', 'flask', 'globe',
  'hinge', 'ivory', 'judge', 'kneel', 'latch', 'mango', 'nerve', 'oxide',
  'punch', 'quark', 'ranch', 'shelf', 'torch', 'unity', 'vault', 'woven',
  'blank', 'chord', 'draft', 'equal', 'fancy', 'grind', 'haste', 'image',
  'joint', 'karma', 'ledge', 'mirth', 'nexus', 'orbit', 'peach', 'quota',
  'ridge', 'satin', 'trace', 'usher', 'vinyl', 'wager', 'yearn', 'zebra',
  'plants', 'bridge', 'market', 'silver', 'golden', 'castle', 'window',
  'garden', 'forest', 'stream', 'purple', 'orange', 'yellow', 'bright',
  'strong', 'gentle', 'honest', 'clever', 'humble', 'mighty', 'silent',
  'broken', 'frozen', 'hidden', 'sacred', 'ancient', 'modern', 'simple',
  'complex', 'mystery', 'journey', 'freedom', 'harmony', 'victory',
  'problem', 'project', 'product', 'service', 'company', 'country',
  'machine', 'network', 'program', 'picture', 'history', 'science',
  'culture', 'nature', 'animal', 'planet', 'galaxy', 'cosmos', 'energy',
  'matter', 'motion', 'force', 'power', 'light', 'sound', 'water', 'earth',
  'fire', 'wind', 'stone', 'metal', 'glass', 'paper', 'cloth', 'wood',
  'bread', 'fruit', 'sugar', 'spice', 'honey', 'cream', 'butter', 'cheese',
  'table', 'chair', 'house', 'tower', 'bridge', 'tunnel', 'street', 'path',
  'road', 'track', 'trail', 'route', 'flight', 'voyage', 'cruise', 'drive',
  'spin', 'turn', 'twist', 'bend', 'fold', 'press', 'push', 'pull',
  'lift', 'drop', 'throw', 'catch', 'hold', 'grip', 'clasp', 'bind',
  'link', 'join', 'merge', 'split', 'break', 'crack', 'smash', 'crush',
  'grind', 'shape', 'form', 'mold', 'carve', 'etch', 'paint', 'draw',
  'write', 'print', 'type', 'mark', 'sign', 'seal', 'stamp', 'brand',
  'label', 'tag', 'name', 'title', 'word', 'phrase', 'sentence', 'story',
  'novel', 'poem', 'song', 'tune', 'melody', 'rhythm', 'beat', 'pulse',
  'heart', 'brain', 'nerve', 'bone', 'flesh', 'blood', 'vein', 'skin',
  'hair', 'nail', 'tooth', 'eye', 'ear', 'nose', 'mouth', 'lip',
  'hand', 'foot', 'arm', 'leg', 'knee', 'elbow', 'wrist', 'ankle',
  'chest', 'back', 'neck', 'head', 'face', 'chin', 'cheek', 'brow',
  'smile', 'laugh', 'tears', 'anger', 'fear', 'hope', 'love', 'trust',
  'faith', 'grace', 'mercy', 'peace', 'war', 'fight', 'battle', 'clash',
  'duel', 'match', 'game', 'sport', 'race', 'run', 'walk', 'jump',
  'skip', 'hop', 'leap', 'dive', 'swim', 'float', 'sail', 'row',
  'paddle', 'steer', 'guide', 'lead', 'follow', 'chase', 'hunt', 'seek',
  'find', 'lose', 'keep', 'give', 'take', 'send', 'bring', 'fetch',
  'carry', 'haul', 'drag', 'tug', 'yank', 'jerk', 'snap', 'flick',
  'tap', 'knock', 'bang', 'boom', 'crash', 'roar', 'howl', 'growl',
  'bark', 'chirp', 'sing', 'hum', 'whistle', 'whisper', 'shout', 'yell',
  'speak', 'talk', 'chat', 'say', 'tell', 'ask', 'answer', 'reply',
  'question', 'puzzle', 'riddle', 'enigma', 'secret', 'truth', 'lie',
  'fact', 'myth', 'legend', 'fable', 'tale', 'yarn', 'saga', 'epic',
  'hero', 'villain', 'knight', 'king', 'queen', 'prince', 'duke', 'lord',
  'lady', 'maiden', 'wizard', 'witch', 'magic', 'spell', 'charm', 'curse',
  'bless', 'gift', 'prize', 'reward', 'medal', 'trophy', 'crown', 'throne',
  'castle', 'palace', 'temple', 'shrine', 'altar', 'chapel', 'church',
  'mosque', 'pagoda', 'tower', 'spire', 'dome', 'arch', 'gate', 'door',
  'window', 'wall', 'floor', 'roof', 'ceiling', 'beam', 'pillar', 'column',
  'stair', 'ladder', 'ramp', 'bridge', 'ford', 'ferry', 'boat', 'ship',
  'yacht', 'canoe', 'raft', 'barge', 'ferry', 'train', 'tram', 'bus',
  'cart', 'wagon', 'coach', 'sleigh', 'sled', 'bike', 'cycle', 'motor',
  'engine', 'boiler', 'furnace', 'stove', 'oven', 'grill', 'pan', 'pot',
  'kettle', 'flask', 'jug', 'vase', 'bowl', 'plate', 'dish', 'cup',
  'mug', 'glass', 'bottle', 'jar', 'tin', 'can', 'box', 'crate',
  'chest', 'trunk', 'case', 'bag', 'sack', 'pouch', 'purse', 'wallet',
  'coin', 'cash', 'gold', 'silver', 'bronze', 'copper', 'iron', 'steel',
  'brass', 'tin', 'lead', 'zinc', 'chrome', 'nickel', 'cobalt', 'quartz',
  'jade', 'ruby', 'pearl', 'amber', 'coral', 'ivory', 'ebony', 'oak',
  'pine', 'maple', 'birch', 'cedar', 'willow', 'ash', 'elm', 'beech',
  'rose', 'lily', 'daisy', 'tulip', 'orchid', 'violet', 'iris', 'fern',
  'moss', 'vine', 'ivy', 'grass', 'wheat', 'corn', 'oats', 'rice',
  'bean', 'pea', 'lentil', 'nut', 'almond', 'walnut', 'hazel', 'pecan',
  'apple', 'pear', 'plum', 'peach', 'grape', 'berry', 'lemon', 'lime',
  'orange', 'mango', 'melon', 'fig', 'date', 'olive', 'onion', 'garlic',
  'ginger', 'pepper', 'salt', 'sugar', 'honey', 'syrup', 'jam', 'jelly',
  'bread', 'toast', 'crust', 'loaf', 'roll', 'bun', 'cake', 'pie',
  'tart', 'cookie', 'biscuit', 'candy', 'fudge', 'toffee', 'caramel',
  'cream', 'milk', 'butter', 'cheese', 'yogurt', 'custard', 'pudding',
  'soup', 'stew', 'broth', 'gravy', 'sauce', 'paste', 'dough', 'batter',
  'flour', 'yeast', 'spice', 'herb', 'mint', 'basil', 'thyme', 'sage',
  'parsley', 'chive', 'dill', 'cumin', 'clove', 'nutmeg', 'cinnamon',
  'vanilla', 'cocoa', 'coffee', 'tea', 'juice', 'cider', 'wine', 'beer',
  'ale', 'lager', 'stout', 'porter', 'mead', 'cider', 'punch', 'soda',
  'water', 'ice', 'steam', 'mist', 'fog', 'cloud', 'rain', 'snow',
  'hail', 'sleet', 'frost', 'dew', 'breeze', 'gale', 'storm', 'tempest',
  'thunder', 'lightning', 'flash', 'spark', 'flame', 'blaze', 'ember',
  'ash', 'smoke', 'soot', 'dust', 'sand', 'clay', 'mud', 'dirt',
  'soil', 'earth', 'rock', 'stone', 'pebble', 'boulder', 'cliff', 'crag',
  'peak', 'ridge', 'summit', 'valley', 'canyon', 'gorge', 'ravine', 'gully',
  'plain', 'field', 'meadow', 'pasture', 'lawn', 'garden', 'park', 'grove',
  'forest', 'jungle', 'wood', 'thicket', 'bush', 'shrub', 'hedge', 'fence',
  'wall', 'moat', 'ditch', 'trench', 'pit', 'hole', 'cave', 'cavern',
  'tunnel', 'shaft', 'mine', 'quarry', 'pit', 'well', 'spring', 'brook',
  'creek', 'stream', 'river', 'lake', 'pond', 'pool', 'bay', 'gulf',
  'sea', 'ocean', 'tide', 'wave', 'surf', 'foam', 'spray', 'shore',
  'beach', 'coast', 'bank', 'delta', 'island', 'islet', 'reef', 'atoll',
  'harbor', 'port', 'dock', 'pier', 'wharf', 'jetty', 'quay', 'marina',
].filter((w) => dict.has(w) && w.length >= 3 && w.length <= 8 && !/(.)\1/.test(w));

/** Solutions only use the preferred list so boards stay human-friendly. */
const WORDS = [...new Set(PREFERRED.map((w) => w.toUpperCase()))];

const byStart = {};
for (const w of WORDS) {
  const s = w[0];
  if (!byStart[s]) byStart[s] = [];
  byStart[s].push(w);
}

function uniqueLetters(words) {
  return new Set(words.join(''));
}

function chainOk(words) {
  for (let i = 1; i < words.length; i += 1) {
    if (words[i - 1].slice(-1) !== words[i][0]) return false;
  }
  return true;
}

function looksObscure(w) {
  return /(.{2,4})\1/.test(w.toLowerCase()) || w.length >= 8 && /[KJQXZ].*[KJQXZ]/i.test(w);
}

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
    const order = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
    for (const s of order) {
      if (counts[s] >= 3) continue;
      if (!ok(ch, s)) continue;
      map[ch] = s;
      counts[s] += 1;
      if (bt(i + 1)) return true;
      counts[s] -= 1;
      delete map[ch];
    }
    return false;
  }

  if (!bt(0)) return null;
  if (counts.some((c) => c !== 3)) return null;
  const sides = ['', '', '', ''];
  for (const [ch, s] of Object.entries(map)) sides[s] += ch;
  return sides.map((s) => s.split('').sort().join(''));
}

function randomPreferred() {
  const pool = PREFERRED.map((w) => w.toUpperCase()).filter((w) => WORDS.includes(w));
  return pool[(Math.random() * pool.length) | 0];
}

const TARGET = 16;
const MAX_TRIES = 200000;
const puzzles = [];
const seenBoards = new Set();
const wantFour = 6;
let tries = 0;

while (puzzles.length < TARGET && tries < MAX_TRIES) {
  tries += 1;
  const needFour = puzzles.filter((p) => p.par === 4).length < wantFour;
  const targetLen = needFour && Math.random() < 0.7 ? 4 : Math.random() < 0.4 ? 4 : 3;
  const chain = [];
  let w = Math.random() < 0.65 ? randomPreferred() : WORDS[(Math.random() * WORDS.length) | 0];
  if (!w || looksObscure(w)) continue;
  chain.push(w);
  let fail = false;

  for (let i = 1; i < targetLen; i += 1) {
    const last = chain[chain.length - 1];
    const nexts = (byStart[last.slice(-1)] || []).filter((n) => !looksObscure(n) && !chain.includes(n));
    if (!nexts.length) {
      fail = true;
      break;
    }
    const used = uniqueLetters(chain);
    const scored = nexts
      .map((n) => {
        let neu = 0;
        for (const ch of n) if (!used.has(ch)) neu += 1;
        const preferred = PREFERRED.includes(n.toLowerCase()) ? 2 : 0;
        return { n, neu, len: n.length, preferred };
      })
      .filter((x) => x.neu > 0);
    if (!scored.length) {
      fail = true;
      break;
    }
    scored.sort((a, b) => b.preferred - a.preferred || b.neu - a.neu || b.len - a.len);
    const pick =
      scored[Math.min(scored.length - 1, (Math.random() * Math.min(12, scored.length)) | 0)];
    if (!pick?.n) {
      fail = true;
      break;
    }
    chain.push(pick.n);
  }

  if (fail || !chainOk(chain)) continue;
  if (chain.some(looksObscure)) continue;
  const letters = uniqueLetters(chain);
  if (letters.size !== 12) continue;
  if ([...chain.join('')].some((ch) => !letters.has(ch))) continue;

  let sides = null;
  for (let t = 0; t < 60; t += 1) {
    sides = assignSides(chain);
    if (sides) break;
  }
  if (!sides) continue;

  const boardKey = sides.slice().sort().join('|');
  if (seenBoards.has(boardKey)) continue;
  seenBoards.add(boardKey);

  puzzles.push({
    id: `lb${String(puzzles.length + 1).padStart(3, '0')}`,
    sides,
    solution: chain,
    par: chain.length,
  });
}

if (puzzles.length < TARGET) {
  console.error(`Only found ${puzzles.length}/${TARGET} after ${tries} tries`);
  process.exit(1);
}

const outPath = path.join(__dirname, '..', 'data', 'letterboxPuzzles.json');
fs.writeFileSync(outPath, `${JSON.stringify(puzzles, null, 2)}\n`);
console.log(`Wrote ${puzzles.length} puzzles (${tries} tries)`);
console.log(
  `par3=${puzzles.filter((p) => p.par === 3).length} par4=${puzzles.filter((p) => p.par === 4).length}`,
);
for (const p of puzzles) {
  console.log(p.id, `par ${p.par}`, p.sides.join('/'), p.solution.join(' → '));
}
