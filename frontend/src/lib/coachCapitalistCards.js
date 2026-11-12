/**
 * Coach Capitalist Season 4: Fleet Trading Cards & Booster Pack System
 *
 * - Earn 1 Booster Pack every time your whole fleet reaches a global milestone.
 * - Each pack contains 3 cards.
 * - Every card has a 2% chance of being a ✨ SHINY HOLOGRAPHIC ✨ card with a massive bonus!
 */

export const SHINY_CHANCE = 0.02; // 2% chance per card

export const FLEET_CARDS_CATALOGUE = [
  // --- FLEET (01 - 08) ---
  {
    id: 'card-transit-89',
    number: 1,
    name: "The '89 Used Transit",
    category: 'fleet',
    rarity: 'common',
    quote: 'The legend that started it all behind the pub.',
    type: 'biz_profit',
    bizIndex: 0,
    depotId: 'local',
    standardValue: 5, // +5% profit to Used Transit
    shinyValue: 50,   // +50% profit
    badge: '🚐 Local Yard',
    color: '#f59e0b',
  },
  {
    id: 'card-cheetah-midicoach',
    number: 2,
    name: 'Cheetah XL Midicoach',
    category: 'fleet',
    rarity: 'common',
    quote: 'Agile enough for country lanes, swift on the dual carriageway.',
    type: 'biz_profit',
    bizIndex: 3,
    depotId: 'local',
    standardValue: 4,
    shinyValue: 40,
    badge: '🐆 Agile Fleet',
    color: '#a78bfa',
  },
  {
    id: 'card-plaxton-panther',
    number: 3,
    name: 'Plaxton Panther Express',
    category: 'fleet',
    rarity: 'rare',
    quote: 'Unstoppable workhorse of the M1 commuter corridor.',
    type: 'biz_speed',
    bizIndex: 5,
    depotId: 'local',
    standardValue: 6, // +6% speed
    shinyValue: 60,
    badge: '🛣️ Motorway Legend',
    color: '#f472b6',
  },
  {
    id: 'card-yellow-decker',
    number: 4,
    name: 'Titan School Decker',
    category: 'fleet',
    rarity: 'common',
    quote: 'Indestructible, loud, and on time for the 8:15 AM bell.',
    type: 'biz_profit',
    bizIndex: 6,
    depotId: 'local',
    standardValue: 5,
    shinyValue: 50,
    badge: '🚌 Double Deck',
    color: '#eab308',
  },
  {
    id: 'card-triaxle-team',
    number: 5,
    name: 'Team Spec Tri-Axle',
    category: 'fleet',
    rarity: 'rare',
    quote: 'Leather seats, privacy glass, and cup final glory.',
    type: 'biz_profit',
    bizIndex: 8,
    depotId: 'local',
    standardValue: 6,
    shinyValue: 60,
    badge: '⭐ VIP Spec',
    color: '#818cf8',
  },
  {
    id: 'card-airport-shuttle',
    number: 6,
    name: 'Sky-Shuttle Express',
    category: 'fleet',
    rarity: 'common',
    quote: 'Terminal 5 or bust — luggage loaded in record time.',
    type: 'biz_speed',
    bizIndex: 0,
    depotId: 'regional',
    standardValue: 5,
    shinyValue: 50,
    badge: '✈️ Airport Fleet',
    color: '#38bdf8',
  },
  {
    id: 'card-luxury-sleeper',
    number: 7,
    name: 'Midnight Sleeper Cruiser',
    category: 'fleet',
    rarity: 'rare',
    quote: 'Sleeping pods, starlight roof, and Scotland by sunrise.',
    type: 'away_rate',
    standardValue: 5, // +5% away earnings rate
    shinyValue: 40,
    badge: '🌙 Night Fleet',
    color: '#c084fc',
  },
  {
    id: 'card-bendy-bus',
    number: 8,
    name: 'Articulated Mega-Bendy',
    category: 'fleet',
    rarity: 'epic',
    quote: 'Two coaches, one accordion, pure passenger capacity.',
    type: 'all_profit',
    standardValue: 3,
    shinyValue: 30,
    badge: '⚡ Heavy Haul',
    color: '#fb923c',
  },

  // --- CREW & CHARACTERS (09 - 14) ---
  {
    id: 'card-terry-transit',
    number: 9,
    name: 'Terry Transit',
    category: 'crew',
    rarity: 'common',
    quote: 'Has every county timetable memorized since 1994.',
    type: 'all_speed',
    standardValue: 3,
    shinyValue: 25,
    badge: '📻 Chief Controller',
    color: '#34d399',
  },
  {
    id: 'card-head-fitter-wendy',
    number: 10,
    name: 'Head Fitter Wendy',
    category: 'crew',
    rarity: 'rare',
    quote: 'Can rebuild a tri-axle gearbox with an adjustable wrench and a cuppa.',
    type: 'all_speed',
    standardValue: 4,
    shinyValue: 35,
    badge: '🔧 Master Mechanic',
    color: '#fb7185',
  },
  {
    id: 'card-inspector-dave',
    number: 11,
    name: 'Inspector Dave',
    category: 'crew',
    rarity: 'common',
    quote: 'Spotted a tyre tread depth breach from 60 yards away.',
    type: 'all_profit',
    standardValue: 3,
    shinyValue: 25,
    badge: '📋 Yard Marshal',
    color: '#60a5fa',
  },
  {
    id: 'card-schoolrun-sally',
    number: 12,
    name: 'School Run Sally',
    category: 'crew',
    rarity: 'common',
    quote: 'Survives 70 screaming teenagers twice a day with a bright smile.',
    type: 'biz_profit',
    bizIndex: 1,
    depotId: 'local',
    standardValue: 5,
    shinyValue: 50,
    badge: '🎒 Ace Driver',
    color: '#38bdf8',
  },
  {
    id: 'card-nightshift-gary',
    number: 13,
    name: 'Night Shifter Gary',
    category: 'crew',
    rarity: 'common',
    quote: 'Fuels, sweeps, and jet-washes 40 coaches while the town sleeps.',
    type: 'away_rate',
    standardValue: 6,
    shinyValue: 50,
    badge: '🧽 Night Crew',
    color: '#4ade80',
  },
  {
    id: 'card-pete-silverstone',
    number: 14,
    name: 'Grand Prix Pete',
    category: 'crew',
    rarity: 'epic',
    quote: 'Knows every unmapped backlane around Silverstone Circuit.',
    type: 'all_profit',
    standardValue: 4,
    shinyValue: 35,
    badge: '🏎️ Charter Master',
    color: '#facc15',
  },

  // --- RELICS & DEPOT ARTIFACTS (15 - 20) ---
  {
    id: 'card-golden-spanner',
    number: 15,
    name: 'The Golden Spanner',
    category: 'relic',
    rarity: 'rare',
    quote: 'Passed down through three generations of depot fitters.',
    type: 'all_speed',
    standardValue: 4,
    shinyValue: 35,
    badge: '✨ Workshop Relic',
    color: '#f59e0b',
  },
  {
    id: 'card-master-tacho-key',
    number: 16,
    name: 'The Master Tachograph Key',
    category: 'relic',
    rarity: 'epic',
    quote: 'Zero infringements, perfect driving hours, green O-licence.',
    type: 'all_profit',
    standardValue: 4,
    shinyValue: 35,
    badge: '⏱️ Compliance Holy Grail',
    color: '#10b981',
  },
  {
    id: 'card-vintage-tie',
    number: 17,
    name: 'Vintage Country Lion Tie',
    category: 'relic',
    rarity: 'common',
    quote: '100% polyester, 1980s gold lion crest. Pure elegance.',
    type: 'all_profit',
    standardValue: 3,
    shinyValue: 25,
    badge: '👔 Uniform Classic',
    color: '#ec4899',
  },
  {
    id: 'card-unlimited-fuel-card',
    number: 18,
    name: 'Directors Fuel Bowser Card',
    category: 'relic',
    rarity: 'legendary',
    quote: 'Bulk diesel tanker discounts signed straight by the board.',
    type: 'all_profit',
    standardValue: 6,
    shinyValue: 50,
    badge: '⛽ Fleet Black Card',
    color: '#ef4444',
  },
  {
    id: 'card-secret-kettle',
    number: 19,
    name: 'The Yard Breakroom Kettle',
    category: 'relic',
    rarity: 'common',
    quote: 'Tea quality directly correlates with fleet turnover speed.',
    type: 'all_speed',
    standardValue: 3,
    shinyValue: 25,
    badge: '🫖 Depot Fuel',
    color: '#d97706',
  },
  {
    id: 'card-lion-trophy',
    number: 20,
    name: 'Coach Operator of the Year Cup',
    category: 'relic',
    rarity: 'legendary',
    quote: 'National industry recognition for Britain’s finest independent fleet.',
    type: 'angel_bonus',
    standardValue: 0.005, // +0.5% extra angel bonus
    shinyValue: 0.03,    // +3.0% extra angel bonus (Huge!)
    badge: '🏆 Crown Jewel',
    color: '#fbbf24',
  },
];

/** Lookup map for fast access. */
export const CARDS_BY_ID = new Map(FLEET_CARDS_CATALOGUE.map((c) => [c.id, c]));

/**
 * Open a booster pack:
 * Generates 3 cards from the catalogue.
 * Each card independently has a 2% chance of being Shiny.
 */
export function drawBoosterPack(customShinyChance = SHINY_CHANCE) {
  const drawn = [];
  const catalogue = FLEET_CARDS_CATALOGUE;
  const pickedIds = new Set();

  for (let i = 0; i < 3; i += 1) {
    // Avoid drawing exact duplicates in the same 3-card pack if possible
    let available = catalogue.filter((c) => !pickedIds.has(c.id));
    if (available.length === 0) available = catalogue;

    const baseCard = available[Math.floor(Math.random() * available.length)];
    pickedIds.add(baseCard.id);

    const isShiny = Math.random() < customShinyChance;
    drawn.push({
      id: baseCard.id,
      card: baseCard,
      isShiny,
      drawnAt: Date.now(),
    });
  }

  return drawn;
}

/**
 * Apply drawn cards to existing cards inventory.
 * State cards format:
 * cards: {
 *   [cardId]: { count: number, shinyCount: number, firstDrawnAt: number }
 * }
 */
export function addCardsToInventory(existingCards = {}, drawnCards = []) {
  const next = { ...existingCards };
  for (const item of drawnCards) {
    const prev = next[item.id] || { count: 0, shinyCount: 0, firstDrawnAt: item.drawnAt };
    next[item.id] = {
      count: (prev.count || 0) + 1,
      shinyCount: (prev.shinyCount || 0) + (item.isShiny ? 1 : 0),
      firstDrawnAt: prev.firstDrawnAt || item.drawnAt,
    };
  }
  return next;
}

/**
 * Calculate total cumulative bonuses from the player's card collection.
 */
export function computeCardBonuses(cards = {}) {
  let allProfitPct = 0;
  let allSpeedPct = 0;
  let awayRatePct = 0;
  let angelBonusExtra = 0;
  const bizProfitPct = {}; // key: "depotId:bizIndex" -> number
  const bizSpeedPct = {};

  let totalCardsCount = 0;
  let totalShiniesCount = 0;
  let uniqueCardsCount = 0;

  for (const [id, entry] of Object.entries(cards || {})) {
    if (!entry || !entry.count) continue;
    const card = CARDS_BY_ID.get(id);
    if (!card) continue;

    uniqueCardsCount += 1;
    totalCardsCount += entry.count;
    totalShiniesCount += (entry.shinyCount || 0);

    // Each regular copy gives standardValue
    const regularCopies = Math.max(0, entry.count - (entry.shinyCount || 0));
    const shinyCopies = Math.max(0, entry.shinyCount || 0);

    const effectValue = (regularCopies * card.standardValue) + (shinyCopies * card.shinyValue);

    switch (card.type) {
      case 'all_profit':
        allProfitPct += effectValue;
        break;
      case 'all_speed':
        allSpeedPct += effectValue;
        break;
      case 'away_rate':
        awayRatePct += effectValue;
        break;
      case 'angel_bonus':
        angelBonusExtra += effectValue;
        break;
      case 'biz_profit': {
        const key = `${card.depotId || 'local'}:${card.bizIndex || 0}`;
        bizProfitPct[key] = (bizProfitPct[key] || 0) + effectValue;
        break;
      }
      case 'biz_speed': {
        const key = `${card.depotId || 'local'}:${card.bizIndex || 0}`;
        bizSpeedPct[key] = (bizSpeedPct[key] || 0) + effectValue;
        break;
      }
      default:
        break;
    }
  }

  return {
    allProfitPct,
    allSpeedPct,
    awayRatePct,
    angelBonusExtra,
    bizProfitPct,
    bizSpeedPct,
    totalCardsCount,
    totalShiniesCount,
    uniqueCardsCount,
  };
}
