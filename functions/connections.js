'use strict';

/**
 * Daily Connections — NYT-style groups.
 * Play is local (group hashes for checking); one Firestore write on finish.
 */

const crypto = require('crypto');

const MAX_MISTAKES = 4;
const GROUP_SIZE = 4;
const DIFFICULTIES = [
  { key: 'yellow', label: 'Yellow', color: '#facc15' },
  { key: 'green', label: 'Green', color: '#4ade80' },
  { key: 'blue', label: 'Blue', color: '#60a5fa' },
  { key: 'purple', label: 'Purple', color: '#c084fc' },
];

/**
 * Curated puzzles. Each has 4 groups of 4 words + titles.
 * Difficulty order: yellow (easiest) → purple (trickiest).
 */
const PUZZLES = [
  {
    id: 'transport-1',
    groups: [
      { title: 'Road vehicles', words: ['BUS', 'CAR', 'LORRY', 'VAN'] },
      { title: 'Things that fly', words: ['PLANE', 'HELICOPTER', 'DRONE', 'KITE'] },
      { title: 'Watercraft', words: ['FERRY', 'YACHT', 'CANOE', 'BARGE'] },
      { title: '___ STATION', words: ['FIRE', 'PETROL', 'TRAIN', 'POLICE'] },
    ],
  },
  {
    id: 'office-1',
    groups: [
      { title: 'Office supplies', words: ['STAPLER', 'PAPERCLIP', 'FOLDER', 'BINDER'] },
      { title: 'Meeting words', words: ['AGENDA', 'MINUTES', 'ACTION', 'PARKING'] },
      { title: 'Email verbs', words: ['SEND', 'FORWARD', 'REPLY', 'CC'] },
      { title: 'Things you book', words: ['ROOM', 'LEAVE', 'FLIGHT', 'TABLE'] },
    ],
  },
  {
    id: 'food-1',
    groups: [
      { title: 'Breakfast foods', words: ['TOAST', 'CEREAL', 'EGGS', 'PORRIDGE'] },
      { title: 'Sandwich fillings', words: ['HAM', 'CHEESE', 'TUNA', 'CHICKEN'] },
      { title: 'Hot drinks', words: ['TEA', 'COFFEE', 'COCOA', 'CHAI'] },
      { title: '___ CAKE', words: ['CARROT', 'FRUIT', 'SPONGE', 'MADEIRA'] },
    ],
  },
  {
    id: 'nature-1',
    groups: [
      { title: 'Trees', words: ['OAK', 'ASH', 'PINE', 'BIRCH'] },
      { title: 'Garden birds', words: ['ROBIN', 'SPARROW', 'THRUSH', 'FINCH'] },
      { title: 'Weather', words: ['RAIN', 'HAIL', 'FOG', 'WIND'] },
      { title: 'Bodies of water', words: ['LAKE', 'POND', 'RIVER', 'STREAM'] },
    ],
  },
  {
    id: 'sports-1',
    groups: [
      { title: 'Ball sports', words: ['FOOTBALL', 'RUGBY', 'CRICKET', 'HOCKEY'] },
      { title: 'Olympic sports', words: ['ROWING', 'FENCING', 'JUDO', 'ARCHERY'] },
      { title: 'Golf terms', words: ['PAR', 'BIRDIE', 'EAGLE', 'BOGEY'] },
      { title: 'Things with nets', words: ['GOAL', 'TENNIS', 'BUTTERFLY', 'FISHING'] },
    ],
  },
  {
    id: 'music-1',
    groups: [
      { title: 'Instruments', words: ['PIANO', 'GUITAR', 'VIOLIN', 'DRUMS'] },
      { title: 'Music genres', words: ['JAZZ', 'BLUES', 'ROCK', 'SOUL'] },
      { title: 'Choir voices', words: ['SOPRANO', 'ALTO', 'TENOR', 'BASS'] },
      { title: '___ BAND', words: ['RUBBER', 'WEDDING', 'MARCHING', 'COVER'] },
    ],
  },
  {
    id: 'colours-1',
    groups: [
      { title: 'Primary colours', words: ['RED', 'BLUE', 'YELLOW', 'GREEN'] },
      { title: 'Shades of brown', words: ['TAN', 'BEIGE', 'UMBER', 'SIENNA'] },
      { title: 'Fruits that are colours', words: ['ORANGE', 'LIME', 'LEMON', 'PLUM'] },
      { title: '___ LIGHT', words: ['TRAFFIC', 'NIGHT', 'SPOT', 'DAY'] },
    ],
  },
  {
    id: 'uk-1',
    groups: [
      { title: 'UK cities', words: ['LONDON', 'MANCHESTER', 'BRISTOL', 'LEEDS'] },
      { title: 'British biscuits', words: ['DIGESTIVE', 'HOBNOB', 'BOURBON', 'CUSTARD'] },
      { title: 'Coins', words: ['POUND', 'PENNY', 'QUARTER', 'EURO'] },
      { title: '___ STREET', words: ['WALL', 'HIGH', 'DOWNING', 'BAKER'] },
    ],
  },
  {
    id: 'school-1',
    groups: [
      { title: 'School subjects', words: ['MATHS', 'HISTORY', 'SCIENCE', 'GEOGRAPHY'] },
      { title: 'Writing tools', words: ['PEN', 'PENCIL', 'MARKER', 'CHALK'] },
      { title: 'Exam words', words: ['REVISION', 'PAPER', 'GRADE', 'RESULT'] },
      { title: 'Things you pass', words: ['TEST', 'BALL', 'LAW', 'NOTE'] },
    ],
  },
  {
    id: 'home-1',
    groups: [
      { title: 'Kitchen items', words: ['KETTLE', 'TOASTER', 'FRIDGE', 'OVEN'] },
      { title: 'Furniture', words: ['SOFA', 'CHAIR', 'TABLE', 'DESK'] },
      { title: 'Cleaning', words: ['MOP', 'BROOM', 'SPONGE', 'CLOTH'] },
      { title: '___ ROOM', words: ['LIVING', 'DINING', 'CLASS', 'BOARD'] },
    ],
  },
  {
    id: 'animals-1',
    groups: [
      { title: 'Farm animals', words: ['COW', 'SHEEP', 'PIG', 'GOAT'] },
      { title: 'Pets', words: ['DOG', 'CAT', 'RABBIT', 'HAMSTER'] },
      { title: 'Big cats', words: ['LION', 'TIGER', 'LEOPARD', 'JAGUAR'] },
      { title: '___ DOG', words: ['HOT', 'GUARD', 'SAUSAGE', 'LAP'] },
    ],
  },
  {
    id: 'tech-1',
    groups: [
      { title: 'Computer parts', words: ['MOUSE', 'KEYBOARD', 'MONITOR', 'SPEAKER'] },
      { title: 'File actions', words: ['SAVE', 'OPEN', 'COPY', 'DELETE'] },
      { title: 'Internet words', words: ['BROWSER', 'SERVER', 'CLOUD', 'WIFI'] },
      { title: '___ PAD', words: ['NOTE', 'LAUNCH', 'KEY', 'LILY'] },
    ],
  },
  {
    id: 'clothes-1',
    groups: [
      { title: 'Footwear', words: ['BOOTS', 'TRAINERS', 'SANDALS', 'SLIPPERS'] },
      { title: 'Winter wear', words: ['COAT', 'SCARF', 'GLOVES', 'HAT'] },
      { title: 'Jewellery', words: ['RING', 'NECKLACE', 'BRACELET', 'EARRING'] },
      { title: 'Things you tie', words: ['LACE', 'TIE', 'KNOT', 'BOW'] },
    ],
  },
  {
    id: 'time-1',
    groups: [
      { title: 'Days of the week', words: ['MONDAY', 'FRIDAY', 'SUNDAY', 'WEDNESDAY'] },
      { title: 'Months', words: ['MARCH', 'JUNE', 'JULY', 'AUGUST'] },
      { title: 'Time units', words: ['SECOND', 'MINUTE', 'HOUR', 'WEEK'] },
      { title: '___ TIME', words: ['HALF', 'FULL', 'PRIME', 'OVER'] },
    ],
  },
  {
    id: 'movies-1',
    groups: [
      { title: 'Film genres', words: ['COMEDY', 'HORROR', 'DRAMA', 'THRILLER'] },
      { title: 'Cinema snacks', words: ['POPCORN', 'NACHOS', 'SWEETS', 'SODA'] },
      { title: 'Camera shots', words: ['CLOSEUP', 'WIDE', 'PAN', 'ZOOM'] },
      { title: '___ CUT', words: ['HAIR', 'FINAL', 'SHORT', 'PAPER'] },
    ],
  },
  {
    id: 'money-1',
    groups: [
      { title: 'Payment methods', words: ['CASH', 'CARD', 'CHEQUE', 'TRANSFER'] },
      { title: 'Bank words', words: ['ACCOUNT', 'BALANCE', 'INTEREST', 'LOAN'] },
      { title: 'Shop actions', words: ['BUY', 'SELL', 'REFUND', 'EXCHANGE'] },
      { title: '___ CHANGE', words: ['SMALL', 'CLIMATE', 'SEA', 'POCKET'] },
    ],
  },
  {
    id: 'body-1',
    groups: [
      { title: 'Body parts', words: ['HAND', 'FOOT', 'HEAD', 'KNEE'] },
      { title: 'Senses', words: ['SIGHT', 'SMELL', 'TOUCH', 'TASTE'] },
      { title: 'Facial features', words: ['NOSE', 'EAR', 'EYE', 'LIP'] },
      { title: '___ BONE', words: ['FUNNY', 'WISH', 'T', 'BACK'] },
    ],
  },
  {
    id: 'travel-1',
    groups: [
      { title: 'Luggage', words: ['SUITCASE', 'BACKPACK', 'HOLDALL', 'TOTE'] },
      { title: 'Airport words', words: ['GATE', 'RUNWAY', 'BOARDING', 'ARRIVALS'] },
      { title: 'Hotel words', words: ['LOBBY', 'SUITE', 'CHECKIN', 'HOUSEKEEPING'] },
      { title: '___ TRIP', words: ['ROAD', 'DAY', 'POWER', 'FIELD'] },
    ],
  },
  {
    id: 'games-1',
    groups: [
      { title: 'Board games', words: ['CHESS', 'DRAUGHTS', 'MONOPOLY', 'CLUEDO'] },
      { title: 'Card games', words: ['POKER', 'RUMMY', 'BRIDGE', 'WHIST'] },
      { title: 'Playground games', words: ['TAG', 'HOPSCOTCH', 'SKIPPING', 'HIDE'] },
      { title: '___ GAME', words: ['BOARD', 'BALL', 'END', 'FAIR'] },
    ],
  },
  {
    id: 'space-1',
    groups: [
      { title: 'Planets', words: ['MARS', 'VENUS', 'EARTH', 'JUPITER'] },
      { title: 'Night sky', words: ['STAR', 'MOON', 'COMET', 'METEOR'] },
      { title: 'Space travel', words: ['ROCKET', 'ORBIT', 'LAUNCH', 'SHUTTLE'] },
      { title: '___ STAR', words: ['ROCK', 'NORTH', 'FILM', 'SUPER'] },
    ],
  },
  {
    id: 'jobs-1',
    groups: [
      { title: 'Trades', words: ['PLUMBER', 'ELECTRICIAN', 'CARPENTER', 'PAINTER'] },
      { title: 'Medical roles', words: ['DOCTOR', 'NURSE', 'SURGEON', 'PARAMEDIC'] },
      { title: 'Kitchen roles', words: ['CHEF', 'WAITER', 'BARISTA', 'SOMMELIER'] },
      { title: '___ DRIVER', words: ['BUS', 'TAXI', 'SCREW', 'PILE'] },
    ],
  },
  {
    id: 'shapes-1',
    groups: [
      { title: '2D shapes', words: ['CIRCLE', 'SQUARE', 'TRIANGLE', 'HEXAGON'] },
      { title: '3D shapes', words: ['CUBE', 'SPHERE', 'CONE', 'CYLINDER'] },
      { title: 'Directions', words: ['NORTH', 'SOUTH', 'EAST', 'WEST'] },
      { title: '___ ANGLE', words: ['RIGHT', 'WIDE', 'CAMERA', 'DUTCH'] },
    ],
  },
  {
    id: 'books-1',
    groups: [
      { title: 'Book parts', words: ['COVER', 'SPINE', 'CHAPTER', 'PAGE'] },
      { title: 'Writing forms', words: ['NOVEL', 'POEM', 'ESSAY', 'SCRIPT'] },
      { title: 'Library words', words: ['SHELF', 'LOAN', 'FINE', 'CATALOGUE'] },
      { title: '___ BOOK', words: ['CHEQUE', 'PHONE', 'GUEST', 'EXERCISE'] },
    ],
  },
  {
    id: 'weather-2',
    groups: [
      { title: 'Precipitation', words: ['RAIN', 'SNOW', 'SLEET', 'DRIZZLE'] },
      { title: 'Sky words', words: ['CLOUD', 'SUN', 'HORIZON', 'DAWN'] },
      { title: 'Stormy words', words: ['THUNDER', 'LIGHTNING', 'GALE', 'TEMPEST'] },
      { title: '___ FRONT', words: ['COLD', 'WARM', 'HOME', 'WATER'] },
    ],
  },
  {
    id: 'plants-1',
    groups: [
      { title: 'Flowers', words: ['ROSE', 'DAISY', 'TULIP', 'LILY'] },
      { title: 'Herbs', words: ['BASIL', 'THYME', 'MINT', 'PARSLEY'] },
      { title: 'Vegetables', words: ['CARROT', 'PEA', 'ONION', 'LEEK'] },
      { title: '___ ROOT', words: ['CUBE', 'SQUARE', 'BEET', 'GRASS'] },
    ],
  },
  {
    id: 'fleet-1',
    groups: [
      { title: 'Vehicle checks', words: ['TYRES', 'LIGHTS', 'BRAKES', 'MIRRORS'] },
      { title: 'Journey words', words: ['ROUTE', 'DEPOT', 'STOP', 'SCHEDULE'] },
      { title: 'Fuel & energy', words: ['DIESEL', 'PETROL', 'CHARGE', 'BATTERY'] },
      { title: '___ CHECK', words: ['RAIN', 'SPELL', 'SAFETY', 'BACKGROUND'] },
    ],
  },
  {
    id: 'emotions-1',
    groups: [
      { title: 'Happy words', words: ['JOY', 'GLEE', 'DELIGHT', 'CHEER'] },
      { title: 'Calm words', words: ['PEACE', 'EASE', 'RELAX', 'SERENE'] },
      { title: 'Angry words', words: ['FURY', 'RAGE', 'IRE', 'WRATH'] },
      { title: '___ BLUE', words: ['SKY', 'NAVY', 'FEELING', 'BABY'] },
    ],
  },
  {
    id: 'numbers-1',
    groups: [
      { title: 'Even numbers', words: ['TWO', 'FOUR', 'SIX', 'EIGHT'] },
      { title: 'Odd numbers', words: ['ONE', 'THREE', 'FIVE', 'SEVEN'] },
      { title: 'Dozen-related', words: ['TWELVE', 'GROSS', 'SCORE', 'PAIR'] },
      { title: '___ NUMBER', words: ['PHONE', 'PRIME', 'LUCKY', 'SERIAL'] },
    ],
  },
  {
    id: 'kitchen-2',
    groups: [
      { title: 'Cutlery', words: ['FORK', 'KNIFE', 'SPOON', 'TEASPOON'] },
      { title: 'Cookware', words: ['PAN', 'POT', 'WOK', 'GRILL'] },
      { title: 'Baking', words: ['FLOUR', 'YEAST', 'ICING', 'DOUGH'] },
      { title: '___ PAN', words: ['FRYING', 'DUST', 'BED', 'FLASH'] },
    ],
  },
  {
    id: 'sea-1',
    groups: [
      { title: 'Sea creatures', words: ['CRAB', 'SHRIMP', 'OCTOPUS', 'EEL'] },
      { title: 'Beach words', words: ['SAND', 'SHELL', 'WAVE', 'TIDE'] },
      { title: 'Boat parts', words: ['SAIL', 'MAST', 'HULL', 'DECK'] },
      { title: '___ FISH', words: ['GOLD', 'FLYING', 'CAT', 'STAR'] },
    ],
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

function hashString(input) {
  let h = 2166136261;
  const s = String(input || '');
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function normalizeWord(word) {
  return String(word || '').trim().toUpperCase().replace(/[^A-Z]/g, '');
}

function groupKey(words) {
  return [...words].map(normalizeWord).filter(Boolean).sort().join('|');
}

function groupHash(words) {
  return crypto.createHash('sha256').update(groupKey(words)).digest('hex');
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(arr, rand) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy;
}

function getPuzzleForDay(dayKey) {
  const index = hashString(`connections:v1:${dayKey}`) % PUZZLES.length;
  const base = PUZZLES[index];
  const groups = base.groups.map((group, difficulty) => ({
    id: `${base.id}-${difficulty}`,
    title: group.title,
    words: group.words.map(normalizeWord),
    difficulty,
    difficultyKey: DIFFICULTIES[difficulty].key,
    color: DIFFICULTIES[difficulty].color,
    label: DIFFICULTIES[difficulty].label,
    hash: groupHash(group.words),
  }));
  return {
    id: base.id,
    dayKey,
    groups,
  };
}

function publicPuzzle(puzzle, { reveal = false } = {}) {
  const rand = mulberry32(hashString(`connections:shuffle:${puzzle.dayKey}:${puzzle.id}`));
  const words = shuffle(puzzle.groups.flatMap((g) => g.words), rand);
  return {
    id: puzzle.id,
    dayKey: puzzle.dayKey,
    words,
    maxMistakes: MAX_MISTAKES,
    groups: puzzle.groups.map((g) => ({
      id: g.id,
      hash: g.hash,
      difficulty: g.difficulty,
      difficultyKey: g.difficultyKey,
      color: g.color,
      label: g.label,
      title: g.title,
      words: reveal ? g.words : undefined,
    })),
  };
}

function matchGroup(puzzle, words) {
  const hash = groupHash(words || []);
  return puzzle.groups.find((g) => g.hash === hash) || null;
}

function evaluateGuesses(puzzle, guesses = []) {
  const solved = [];
  const solvedIds = new Set();
  let mistakes = 0;
  const history = [];

  for (const guess of guesses) {
    const words = (Array.isArray(guess) ? guess : guess?.words || []).map(normalizeWord);
    if (words.length !== GROUP_SIZE) {
      history.push({ words, correct: false, reason: 'size' });
      continue;
    }
    if (new Set(words).size !== GROUP_SIZE) {
      history.push({ words, correct: false, reason: 'duplicate' });
      continue;
    }
    const group = matchGroup(puzzle, words);
    if (group && !solvedIds.has(group.id)) {
      solvedIds.add(group.id);
      solved.push({
        id: group.id,
        title: group.title,
        words: group.words,
        difficulty: group.difficulty,
        difficultyKey: group.difficultyKey,
        color: group.color,
        label: group.label,
      });
      history.push({ words, correct: true, groupId: group.id });
    } else {
      mistakes += 1;
      history.push({ words, correct: false, reason: group ? 'already_solved' : 'wrong' });
    }
  }

  const won = solved.length === puzzle.groups.length;
  const lost = !won && mistakes >= MAX_MISTAKES;
  return {
    solved,
    mistakes,
    history,
    status: won ? 'won' : (lost ? 'lost' : 'in_progress'),
  };
}

function serializeConnectionsGame(data = {}, puzzle = null) {
  const status = data.status || 'in_progress';
  const finished = status === 'won' || status === 'lost';
  return {
    dayKey: data.dayKey || '',
    status,
    mistakes: Number.isFinite(data.mistakes) ? data.mistakes : 0,
    maxMistakes: MAX_MISTAKES,
    solved: Array.isArray(data.solved) ? data.solved : [],
    startedAt: data.startedAt?.toDate?.()?.toISOString?.() || data.startedAt || null,
    durationMs: Number.isFinite(data.durationMs) ? data.durationMs : null,
    completedAt: data.completedAt?.toDate?.()?.toISOString?.() || data.completedAt || null,
    solution: finished && puzzle
      ? puzzle.groups.map((g) => ({
          id: g.id,
          title: g.title,
          words: g.words,
          difficulty: g.difficulty,
          difficultyKey: g.difficultyKey,
          color: g.color,
          label: g.label,
        }))
      : null,
  };
}

module.exports = {
  MAX_MISTAKES,
  GROUP_SIZE,
  DIFFICULTIES,
  PUZZLES,
  getLondonDayKey,
  getPuzzleForDay,
  publicPuzzle,
  groupHash,
  groupKey,
  normalizeWord,
  matchGroup,
  evaluateGuesses,
  serializeConnectionsGame,
  hashString,
};
