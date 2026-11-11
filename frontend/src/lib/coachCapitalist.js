/**
 * Coach Capitalist — Adventure Capitalist balances, coach-hire theme.
 * Depots map to Earth / Moon / Mars worlds.
 */

const ILLIONS = [
  '', 'thousand', 'million', 'billion', 'trillion', 'quadrillion', 'quintillion',
  'sextillion', 'septillion', 'octillion', 'nonillion', 'decillion', 'undecillion',
  'duodecillion', 'tredecillion', 'quattuordecillion', 'quindecillion', 'sexdecillion',
  'septendecillion', 'octodecillion', 'novemdecillion', 'vigintillion', 'unvigintillion',
  'duovigintillion', 'trevigintillion', 'quattuorvigintillion', 'quinvigintillion',
  'sexvigintillion', 'septenvigintillion', 'octovigintillion', 'novemvigintillion',
  'trigintillion', 'untrigintillion', 'duotrigintillion', 'tretrigintillion',
  'quattuortrigintillion', 'quintrigintillion', 'sextrigintillion', 'septentrigintillion',
  'octotrigintillion', 'novemtrigintillion', 'quadragintillion',
];

export function formatMoney(value, { compact = false, symbol = '£' } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n)) return `${symbol}0`;
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs < 1000) {
    const decimals = abs < 10 && abs !== Math.floor(abs) ? 2 : abs < 100 && abs !== Math.floor(abs) ? 1 : 0;
    return `${sign}${symbol}${abs.toFixed(decimals)}`;
  }
  const tier = Math.min(ILLIONS.length - 1, Math.floor(Math.log10(abs) / 3));
  const scaled = abs / 10 ** (tier * 3);
  const digits = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
  // Thousands use compact "k" (saves space on buttons); larger units stay spaced words.
  if (tier === 1) {
    return `${sign}${symbol}${scaled.toFixed(digits)}k`;
  }
  const name = ILLIONS[tier];
  if (compact && !name) return `${sign}${symbol}${Math.round(scaled)}`;
  return name
    ? `${sign}${symbol}${scaled.toFixed(digits)} ${name}`
    : `${sign}${symbol}${scaled.toFixed(digits)}`;
}

export function formatDuration(seconds) {
  const s = Math.max(0, Number(seconds) || 0);
  if (s < 0.01) return 'instant';
  if (s < 1) return `${s.toFixed(2)}s`;
  if (s < 60) return `${s.toFixed(1)}s`;
  const total = Math.floor(s);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

/** Geometric sum: cost of buying `qty` starting from `owned`. */
export function buyCost(baseCost, coefficient, owned, qty) {
  const n = Math.max(0, Math.floor(qty));
  if (n <= 0) return 0;
  const c = Number(coefficient);
  const b = Number(baseCost);
  if (c === 1) return b * n;
  // sum = base * c^owned * (c^n - 1) / (c - 1)
  return b * (c ** owned) * ((c ** n) - 1) / (c - 1);
}

export function maxAffordable(baseCost, coefficient, owned, cash) {
  if (cash <= 0) return 0;
  const first = Number(baseCost) * (Number(coefficient) ** owned);
  if (cash < first) return 0;
  const c = Number(coefficient);
  if (c === 1) return Math.floor(cash / first);
  // cash >= first * (c^n - 1) / (c - 1)  =>  n = log_c( cash*(c-1)/first + 1 )
  const n = Math.floor(Math.log((cash * (c - 1)) / first + 1) / Math.log(c));
  return Math.max(0, n);
}

const SPEED_OWNED = [25, 50, 100, 200, 300, 400];
const STANDARD_PROFIT = [
  [500, 2], [600, 2], [700, 2], [800, 2], [900, 2],
  [1000, 3], [1100, 2], [1200, 2], [1300, 2], [1400, 2],
  [1500, 2], [1600, 2], [1700, 2], [1800, 2], [1900, 2],
  [2000, 5], [2100, 3], [2200, 3], [2300, 3], [2400, 3],
  [2500, 3], [2600, 3], [2700, 3], [2800, 3], [2900, 3],
  [3000, 3], [3250, 3], [3500, 3], [3750, 3], [4000, 5],
];

const GLOBAL_UNLOCKS = [
  ...SPEED_OWNED.map((at) => ({ at, speed: 2 })),
  [500, 2], [600, 2], [666, 2], [700, 2], [777, 2], [800, 2], [900, 2],
  [1000, 2], [1111, 2], [1200, 2], [1300, 2], [1400, 2], [1500, 2],
  [1600, 2], [1700, 2], [1800, 2], [1900, 2], [2000, 2], [2222, 2],
  [2500, 2], [3000, 2], [3333, 2],
].map((item) => (Array.isArray(item) ? { at: item[0], profit: item[1] } : item));

/** Newspaper-style unlocks for business index 1 (Brand New Minibus / Moon Express etc). */
const NEWSPAPER_UNLOCKS = [
  { at: 25, selfSpeed: 2 },
  { at: 50, selfSpeed: 2 },
  { at: 75, selfSpeed: 2 },
  { at: 100, target: 0, profit: 2 },
  { at: 125, target: 0, profit: 2 },
  { at: 150, target: 2, profit: 2 },
  { at: 175, target: 2, profit: 2 },
  { at: 200, target: 3, profit: 2 },
  { at: 225, target: 3, profit: 2 },
  { at: 250, target: 4, profit: 2 },
  { at: 275, target: 4, profit: 2 },
  { at: 300, target: 5, profit: 2 },
  { at: 325, target: 5, profit: 2 },
  { at: 350, target: 6, profit: 2 },
  { at: 375, target: 6, profit: 2 },
  { at: 400, target: 7, profit: 2 },
  { at: 425, target: 7, profit: 2 },
  { at: 450, target: 8, profit: 2 },
  { at: 475, target: 8, profit: 2 },
  { at: 500, target: 9, profit: 2 },
  { at: 525, target: 0, profit: 3 },
  { at: 550, target: 2, profit: 3 },
  { at: 575, target: 3, profit: 5 },
  { at: 600, target: 6, profit: 11 },
  { at: 625, target: 4, profit: 5 },
  { at: 650, target: 0, profit: 6 },
  { at: 675, target: 2, profit: 6 },
  { at: 700, target: 7, profit: 11 },
  { at: 725, target: 3, profit: 6 },
  { at: 750, target: 5, profit: 3 },
  { at: 775, target: 8, profit: 3 },
  { at: 800, target: 9, profit: 3 },
  { at: 825, target: 2, profit: 7 },
  { at: 850, target: 4, profit: 7 },
  { at: 875, target: 0, profit: 7 },
  { at: 900, target: 6, profit: 7 },
  { at: 925, target: 3, profit: 7 },
  { at: 950, target: 7, profit: 7 },
  { at: 975, target: 5, profit: 7 },
  { at: 1000, target: 8, profit: 7 },
];

function parseIllion(amount, word) {
  const idx = ILLIONS.indexOf(String(word || '').toLowerCase());
  if (idx <= 0) return Number(amount);
  return Number(amount) * 10 ** (idx * 3);
}

function cashUpgradeTiers(businessIndex, tiers) {
  return tiers.map((t, i) => ({
    id: `cash-${businessIndex}-${i}`,
    business: businessIndex,
    cost: t.cost,
    multiplier: t.mult,
    name: t.name,
  }));
}

/** First six cash-upgrade tiers per Earth business (Adventure Capitalist prices). */
const EARTH_CASH_UPGRADES = [
  ...cashUpgradeTiers(0, [
    { cost: 250_000, mult: 3, name: 'Spare Wheel Kit' },
    { cost: parseIllion(20, 'trillion'), mult: 3, name: 'Bluetooth Stereo' },
    { cost: parseIllion(2, 'quintillion'), mult: 3, name: 'Heated Seats' },
    { cost: parseIllion(25, 'sextillion'), mult: 3, name: 'Custom Livery' },
    { cost: parseIllion(1, 'octillion'), mult: 7, name: 'Turbo Transit' },
    { cost: parseIllion(25, 'quattuordecillion'), mult: 3, name: 'Legendary Transit' },
  ]),
  ...cashUpgradeTiers(1, [
    { cost: 500_000, mult: 3, name: 'Showroom Polish' },
    { cost: parseIllion(50, 'trillion'), mult: 3, name: 'Sat-Nav Pack' },
    { cost: parseIllion(5, 'quintillion'), mult: 3, name: 'Warranty Plus' },
    { cost: parseIllion(50, 'sextillion'), mult: 3, name: 'Dealer Network' },
    { cost: parseIllion(5, 'octillion'), mult: 7, name: 'Factory Fresh' },
    { cost: parseIllion(5, 'tredecillion'), mult: 3, name: 'Zero-Mile Fleet' },
  ]),
  ...cashUpgradeTiers(2, [
    { cost: 1_000_000, mult: 3, name: 'Luggage Racks' },
    { cost: parseIllion(100, 'trillion'), mult: 3, name: 'Air Con Upgrade' },
    { cost: parseIllion(7, 'quintillion'), mult: 3, name: 'USB Ports All Round' },
    { cost: parseIllion(100, 'sextillion'), mult: 3, name: 'Coach Wi-Fi' },
    { cost: parseIllion(25, 'octillion'), mult: 7, name: '16-Seat Pro' },
    { cost: parseIllion(25, 'tredecillion'), mult: 3, name: 'Route King' },
  ]),
  ...cashUpgradeTiers(3, [
    { cost: 500_000_000, mult: 3, name: 'Reclining Seats' },
    { cost: parseIllion(500, 'trillion'), mult: 3, name: 'Toilet Module' },
    { cost: parseIllion(10, 'quintillion'), mult: 3, name: 'PA System' },
    { cost: parseIllion(200, 'sextillion'), mult: 3, name: 'Midi Branding' },
    { cost: parseIllion(100, 'octillion'), mult: 7, name: 'Midi Master' },
    { cost: parseIllion(50, 'tredecillion'), mult: 3, name: 'Midi Empire' },
  ]),
  ...cashUpgradeTiers(4, [
    { cost: 10_000_000, mult: 3, name: 'Destination Boards' },
    { cost: parseIllion(1, 'quadrillion'), mult: 3, name: 'Kneeling Suspension' },
    { cost: parseIllion(20, 'quintillion'), mult: 3, name: 'CCTV Suite' },
    { cost: parseIllion(300, 'sextillion'), mult: 3, name: 'Accessible Ramp' },
    { cost: parseIllion(250, 'octillion'), mult: 7, name: 'Deck Dominator' },
    { cost: parseIllion(100, 'tredecillion'), mult: 3, name: 'Single-Deck Sovereign' },
  ]),
  ...cashUpgradeTiers(5, [
    { cost: 25_000_000, mult: 3, name: 'Upper Deck Bar' },
    { cost: parseIllion(2, 'quadrillion'), mult: 3, name: 'Open-Top Tours' },
    { cost: parseIllion(35, 'quintillion'), mult: 3, name: 'Heritage Livery' },
    { cost: parseIllion(400, 'sextillion'), mult: 3, name: 'City Sightseeing' },
    { cost: parseIllion(500, 'octillion'), mult: 7, name: 'Double-Deck Dynasty' },
    { cost: parseIllion(250, 'tredecillion'), mult: 3, name: 'Sky Lounge Fleet' },
  ]),
  ...cashUpgradeTiers(6, [
    { cost: 500_000_000, mult: 3, name: 'Champagne Cooler' },
    { cost: parseIllion(5, 'quadrillion'), mult: 3, name: 'Leather Captain Chairs' },
    { cost: parseIllion(50, 'quintillion'), mult: 3, name: 'Onboard Concierge' },
    { cost: parseIllion(500, 'sextillion'), mult: 3, name: 'Blackout Curtains' },
    { cost: parseIllion(1, 'nonillion'), mult: 7, name: 'VIP Exclusive' },
    { cost: parseIllion(500, 'tredecillion'), mult: 3, name: 'Executive Empire' },
  ]),
  ...cashUpgradeTiers(7, [
    { cost: 10_000_000_000, mult: 3, name: 'School Run Contracts' },
    { cost: parseIllion(7, 'quadrillion'), mult: 3, name: 'Local Authority Tender' },
    { cost: parseIllion(75, 'quintillion'), mult: 3, name: 'Yellow Stripe Fleet' },
    { cost: parseIllion(600, 'sextillion'), mult: 3, name: 'Term-Time Guarantee' },
    { cost: parseIllion(5, 'nonillion'), mult: 7, name: 'Education Express' },
    { cost: parseIllion(1, 'quattuordecillion'), mult: 3, name: 'Contract Colossus' },
  ]),
  ...cashUpgradeTiers(8, [
    { cost: 50_000_000_000, mult: 3, name: 'Motorway Coach Stops' },
    { cost: parseIllion(10, 'quadrillion'), mult: 3, name: 'National Timetable' },
    { cost: parseIllion(100, 'quintillion'), mult: 3, name: 'Intercity Lounge' },
    { cost: parseIllion(700, 'sextillion'), mult: 3, name: 'Express Priority' },
    { cost: parseIllion(25, 'nonillion'), mult: 7, name: 'National Network' },
    { cost: parseIllion(5, 'quattuordecillion'), mult: 3, name: 'Island Grid' },
  ]),
  ...cashUpgradeTiers(9, [
    { cost: 250_000_000_000, mult: 3, name: 'Mega Depot Yard' },
    { cost: parseIllion(20, 'quadrillion'), mult: 3, name: 'Global Booking Engine' },
    { cost: parseIllion(200, 'quintillion'), mult: 3, name: 'Franchise Licences' },
    { cost: parseIllion(800, 'sextillion'), mult: 3, name: 'Stock Market Listing' },
    { cost: parseIllion(50, 'nonillion'), mult: 7, name: 'Coach Conglomerate' },
    { cost: parseIllion(10, 'quattuordecillion'), mult: 3, name: 'Planet of Coaches' },
  ]),
  {
    id: 'cash-all-0', business: 'all', cost: parseIllion(1, 'trillion'), multiplier: 3, name: 'Fleet Synergy',
  },
  {
    id: 'cash-all-1', business: 'all', cost: parseIllion(50, 'quadrillion'), multiplier: 3, name: 'Depot Merger',
  },
  {
    id: 'cash-all-2', business: 'all', cost: parseIllion(500, 'quintillion'), multiplier: 3, name: 'Brand Takeover',
  },
  {
    id: 'cash-all-3', business: 'all', cost: parseIllion(900, 'sextillion'), multiplier: 3, name: 'Industry Monopoly',
  },
  {
    id: 'cash-all-4', business: 'all', cost: parseIllion(1, 'tredecillion'), multiplier: 7, name: 'Capitalist Coach',
  },
  {
    id: 'cash-all-5', business: 'all', cost: parseIllion(100, 'quattuordecillion'), multiplier: 3, name: 'Ultimate Hire',
  },
  {
    id: 'cash-angel-0', business: 'angel', cost: parseIllion(100, 'quadrillion'), angelBonus: 0.01, name: 'Silent Partner Pitch',
  },
  {
    id: 'cash-angel-1', business: 'angel', cost: parseIllion(1, 'sextillion'), angelBonus: 0.01, name: 'Angel Roadshow',
  },
  {
    id: 'cash-angel-2', business: 'angel', cost: parseIllion(10, 'septillion'), angelBonus: 0.02, name: 'Venture Garage',
  },
];

const EARTH_ANGEL_UPGRADES = [
  { id: 'angel-early-mgr0', cost: 5, autoManagerIndex: 0, startingCashBonus: 2500, name: 'Terry Transit Retainer' },
  { id: 'angel-early-all-1', cost: 15, business: 'all', multiplier: 2, name: 'Seed Round Syndicate' },
  { id: 'angel-early-disc-1', cost: 40, business: 'all', costDiscount: 0.10, name: 'Bulk Fleet Trade Rebate' },
  { id: 'angel-early-perm-reg', cost: 100, business: 'all', multiplier: 1.5, keepDepotUnlocked: 'regional', name: 'Regional Operator Permit' },
  { id: 'angel-early-eff-1', cost: 250, angelBonus: 0.01, name: 'Silent Partner Dividends' },
  { id: 'angel-early-spd-1', cost: 600, business: 'all', speedMultiplier: 2, name: 'Express Dispatch Priority' },
  { id: 'angel-early-all-2', cost: 1_500, business: 'all', multiplier: 3, bonusOwned: { index: 1, qty: 5 }, name: 'Series Seed Expansion' },
  { id: 'angel-early-eff-2', cost: 4_000, angelBonus: 0.01, costDiscount: 0.15, name: 'Venture Board Seat' },
  { id: 'angel-all-0', cost: 10_000, business: 'all', multiplier: 3, name: 'Backer Boost' },
  { id: 'angel-eff-0', cost: 100_000, angelBonus: 0.02, name: 'Pitch Deck Polish' },
  { id: 'angel-news-0', cost: 25_000_000, business: 1, flatOwned: 10, name: 'Minibus Angels +10' },
  { id: 'angel-all-1', cost: 100_000_000, angelBonus: 0.02, name: 'Series A Charm' },
  { id: 'angel-all-2', cost: 1_000_000_000, business: 'all', multiplier: 5, name: 'Series B Fleet' },
  { id: 'angel-all-3', cost: 100_000_000_000, business: 'all', multiplier: 9, name: 'Unicorn Hire' },
  { id: 'angel-all-4', cost: 1_000_000_000_000, business: 'all', multiplier: 11, name: 'IPO Ready' },
];

function regionalCashTiers(businessIndex, tiers) {
  return tiers.map((t, i) => ({
    id: `reg-cash-${businessIndex}-${i}`,
    business: businessIndex,
    cost: t.cost,
    multiplier: t.mult,
    name: t.name,
  }));
}

const REGIONAL_CASH_UPGRADES = [
  ...regionalCashTiers(0, [
    { cost: 50_000, mult: 3, name: 'Flight Tracker Board' },
    { cost: parseIllion(10, 'trillion'), mult: 3, name: 'Terminal Priority Lane' },
    { cost: parseIllion(1, 'quintillion'), mult: 3, name: 'Oversize Baggage Bay' },
    { cost: parseIllion(15, 'sextillion'), mult: 3, name: 'Jetbridge Express' },
    { cost: parseIllion(500, 'septillion'), mult: 7, name: 'Runway Transfer Contract' },
    { cost: parseIllion(15, 'quattuordecillion'), mult: 3, name: 'Skyport Monopoly' },
  ]),
  ...regionalCashTiers(1, [
    { cost: 150_000, mult: 3, name: 'Contactless Tap Gates' },
    { cost: parseIllion(25, 'trillion'), mult: 3, name: 'Dedicated Bus Lane' },
    { cost: parseIllion(3, 'quintillion'), mult: 3, name: 'Solar Canopy Car Parks' },
    { cost: parseIllion(35, 'sextillion'), mult: 3, name: 'ANPR Barrier Entry' },
    { cost: parseIllion(3, 'octillion'), mult: 7, name: 'Commuter Super-Hub' },
    { cost: parseIllion(3, 'tredecillion'), mult: 3, name: 'Green Belt Express' },
  ]),
  ...regionalCashTiers(2, [
    { cost: 500_000, mult: 3, name: 'Silk Ribbons & Fizz' },
    { cost: parseIllion(60, 'trillion'), mult: 3, name: 'Bridal Party Lounge' },
    { cost: parseIllion(5, 'quintillion'), mult: 3, name: 'Red Carpet Rollout' },
    { cost: parseIllion(75, 'sextillion'), mult: 3, name: 'Manor House Exclusive' },
    { cost: parseIllion(15, 'octillion'), mult: 7, name: 'Royal Gala Fleet' },
    { cost: parseIllion(15, 'tredecillion'), mult: 3, name: 'Society Events Dynasty' },
  ]),
  ...regionalCashTiers(3, [
    { cost: 5_000_000, mult: 3, name: 'Panoramic Glass Roof' },
    { cost: parseIllion(250, 'trillion'), mult: 3, name: 'Highland Route Pass' },
    { cost: parseIllion(8, 'quintillion'), mult: 3, name: 'Onboard Tour Guide Mic' },
    { cost: parseIllion(150, 'sextillion'), mult: 3, name: 'Lake District Partner' },
    { cost: parseIllion(60, 'octillion'), mult: 7, name: 'Grand Britain Tourer' },
    { cost: parseIllion(35, 'tredecillion'), mult: 3, name: 'Scenic Sovereign' },
  ]),
  ...regionalCashTiers(4, [
    { cost: 15_000_000, mult: 3, name: 'Memory Foam Bunks' },
    { cost: parseIllion(600, 'trillion'), mult: 3, name: 'Night Espresso Bar' },
    { cost: parseIllion(15, 'quintillion'), mult: 3, name: 'Acoustic Privacy Pods' },
    { cost: parseIllion(240, 'sextillion'), mult: 3, name: 'Overnight Steward' },
    { cost: parseIllion(180, 'octillion'), mult: 7, name: 'Starlight Sleeper' },
    { cost: parseIllion(80, 'tredecillion'), mult: 3, name: 'Dreamline Express' },
  ]),
  ...regionalCashTiers(5, [
    { cost: 75_000_000, mult: 3, name: 'Accordion Turntable Lube' },
    { cost: parseIllion(1.5, 'quadrillion'), mult: 3, name: 'All-Door Boarding' },
    { cost: parseIllion(28, 'quintillion'), mult: 3, name: 'Bend-Master Hydraulics' },
    { cost: parseIllion(320, 'sextillion'), mult: 3, name: 'Guided Busway Track' },
    { cost: parseIllion(400, 'octillion'), mult: 7, name: 'Mega Bendy Fleet' },
    { cost: parseIllion(200, 'tredecillion'), mult: 3, name: 'Corridor Titan' },
  ]),
  ...regionalCashTiers(6, [
    { cost: 400_000_000, mult: 3, name: 'Walnut Veneer Galley' },
    { cost: parseIllion(4, 'quadrillion'), mult: 3, name: 'Heated Massage Recliners' },
    { cost: parseIllion(40, 'quintillion'), mult: 3, name: 'Onboard Sommelier' },
    { cost: parseIllion(400, 'sextillion'), mult: 3, name: 'Starlink Roof Dome' },
    { cost: parseIllion(800, 'octillion'), mult: 7, name: 'Rockstar Tour Suite' },
    { cost: parseIllion(400, 'tredecillion'), mult: 3, name: 'Land Yacht Sovereign' },
  ]),
  ...regionalCashTiers(7, [
    { cost: 8_000_000_000, mult: 3, name: 'Regional Brand Pack' },
    { cost: parseIllion(5.5, 'quadrillion'), mult: 3, name: 'Shared Parts Warehouse' },
    { cost: parseIllion(60, 'quintillion'), mult: 3, name: 'County Council Tender' },
    { cost: parseIllion(480, 'sextillion'), mult: 3, name: 'Rival Yard Buyout' },
    { cost: parseIllion(4, 'nonillion'), mult: 7, name: 'Shire Syndicate' },
    { cost: parseIllion(800, 'tredecillion'), mult: 3, name: 'Franchise Federation' },
  ]),
  ...regionalCashTiers(8, [
    { cost: 40_000_000_000, mult: 3, name: 'Eurotunnel Fast-Track' },
    { cost: parseIllion(8, 'quadrillion'), mult: 3, name: 'Duty-Free Galley' },
    { cost: parseIllion(80, 'quintillion'), mult: 3, name: 'Dover Ferry Priority' },
    { cost: parseIllion(560, 'sextillion'), mult: 3, name: 'Dual-Voltage Chargers' },
    { cost: parseIllion(20, 'nonillion'), mult: 7, name: 'Channel Chunnel King' },
    { cost: parseIllion(4, 'quattuordecillion'), mult: 3, name: 'Borderless Express' },
  ]),
  ...regionalCashTiers(9, [
    { cost: 200_000_000_000, mult: 3, name: 'Alpine Tunnel Permits' },
    { cost: parseIllion(16, 'quadrillion'), mult: 3, name: 'Autobahn Priority' },
    { cost: parseIllion(160, 'quintillion'), mult: 3, name: 'Riviera Sleeper Hubs' },
    { cost: parseIllion(640, 'sextillion'), mult: 3, name: 'Schengen Super-Grid' },
    { cost: parseIllion(40, 'nonillion'), mult: 7, name: 'Continental Emperor' },
    { cost: parseIllion(8, 'quattuordecillion'), mult: 3, name: 'Eurasian Coach Grid' },
  ]),
  { id: 'reg-cash-all-0', business: 'all', cost: parseIllion(800, 'billion'), multiplier: 3, name: 'Regional Dispatch Ring' },
  { id: 'reg-cash-all-1', business: 'all', cost: parseIllion(40, 'quadrillion'), multiplier: 3, name: 'Inter-County Merger' },
  { id: 'reg-cash-all-2', business: 'all', cost: parseIllion(400, 'quintillion'), multiplier: 3, name: 'Motorway Service Hubs' },
  { id: 'reg-cash-all-3', business: 'all', cost: parseIllion(720, 'sextillion'), multiplier: 3, name: 'Regional Monopoly' },
  { id: 'reg-cash-all-4', business: 'all', cost: parseIllion(800, 'duodecillion'), multiplier: 7, name: 'Hub Overlord' },
  { id: 'reg-cash-all-5', business: 'all', cost: parseIllion(80, 'quattuordecillion'), multiplier: 3, name: 'Continental Supremacy' },
  { id: 'reg-cash-angel-0', business: 'angel', cost: parseIllion(100, 'quadrillion'), angelBonus: 0.01, name: 'Regional Investor Dinner' },
  { id: 'reg-cash-angel-1', business: 'angel', cost: parseIllion(1, 'sextillion'), angelBonus: 0.01, name: 'Private Equity Roadshow' },
  { id: 'reg-cash-angel-2', business: 'angel', cost: parseIllion(10, 'septillion'), angelBonus: 0.02, name: 'Sovereign Wealth Syndicate' },
];

const REGIONAL_ANGEL_UPGRADES = [
  { id: 'reg-angel-early-mgr0', cost: 10, autoManagerIndex: 0, business: 0, flatOwned: 5, name: 'Ava Arrivals Retainer' },
  { id: 'reg-angel-early-all-1', cost: 30, business: 'all', multiplier: 2, name: 'Airport Concourse Pact' },
  { id: 'reg-angel-early-disc-1', cost: 75, business: 'all', costDiscount: 0.10, name: 'Coachbuilder Fleet Rebate' },
  { id: 'reg-angel-early-eff-1', cost: 200, angelBonus: 0.01, name: 'Regional Equity Partners' },
  { id: 'reg-angel-early-spd-1', cost: 500, business: 'all', speedMultiplier: 2, name: 'Dedicated Motorway Lanes' },
  { id: 'reg-angel-early-perm-nat', cost: 1_200, business: 'all', multiplier: 2, keepDepotUnlocked: 'national', name: 'National Operator Charter' },
  { id: 'reg-angel-early-all-2', cost: 3_000, business: 'all', multiplier: 3, name: 'Inter-City Express Syndicate' },
  { id: 'reg-angel-all-0', cost: 10_000, business: 'all', multiplier: 3, name: 'Regional Syndicate ×3' },
  { id: 'reg-angel-eff-0', cost: 100_000, angelBonus: 0.02, name: 'Hub Boardroom Polish' },
  { id: 'reg-angel-news-0', cost: 25_000_000, business: 1, flatOwned: 10, name: 'Park & Ride +10' },
  { id: 'reg-angel-all-1', cost: 100_000_000, angelBonus: 0.02, name: 'Regional Bond Issue' },
  { id: 'reg-angel-all-2', cost: 1_000_000_000, business: 'all', multiplier: 5, name: 'Intercity Expansion ×5' },
  { id: 'reg-angel-all-3', cost: 100_000_000_000, business: 'all', multiplier: 9, name: 'Cross-Border Takeover ×9' },
  { id: 'reg-angel-all-4', cost: 1_000_000_000_000, business: 'all', multiplier: 11, name: 'Continental Float ×11' },
];

function nationalCashTiers(businessIndex, tiers) {
  return tiers.map((t, i) => ({
    id: `nat-cash-${businessIndex}-${i}`,
    business: businessIndex,
    cost: t.cost,
    multiplier: t.mult,
    name: t.name,
  }));
}

const NATIONAL_CASH_UPGRADES = [
  ...nationalCashTiers(0, [
    { cost: 25, mult: 3, name: 'Thermal Ticket Printers' },
    { cost: parseIllion(1, 'trillion'), mult: 3, name: 'Self-Serve Kiosks' },
    { cost: parseIllion(500, 'quadrillion'), mult: 3, name: 'Dynamic Surge Pricing' },
    { cost: parseIllion(5, 'sextillion'), mult: 3, name: 'Biometric Fast-Gate' },
    { cost: parseIllion(250, 'septillion'), mult: 7, name: 'AI Fare Optimizer' },
    { cost: parseIllion(5, 'quattuordecillion'), mult: 3, name: 'Universal Travel Pass' },
  ]),
  ...nationalCashTiers(1, [
    { cost: 250, mult: 3, name: 'One-Tap Apple/Google Pay' },
    { cost: parseIllion(5, 'trillion'), mult: 3, name: 'Push Notification Deals' },
    { cost: parseIllion(1, 'quintillion'), mult: 3, name: 'Loyalty Rewards Club' },
    { cost: parseIllion(15, 'sextillion'), mult: 3, name: 'Live Coach Tracking Map' },
    { cost: parseIllion(1, 'octillion'), mult: 7, name: 'Super-App Ecosystem' },
    { cost: parseIllion(1, 'tredecillion'), mult: 3, name: 'Neural Seat Booking' },
  ]),
  ...nationalCashTiers(2, [
    { cost: 50_000, mult: 3, name: 'CPC Fast-Track Academy' },
    { cost: parseIllion(25, 'trillion'), mult: 3, name: 'Simulator Training Pods' },
    { cost: parseIllion(2.5, 'quintillion'), mult: 3, name: 'Nationwide Relief Pool' },
    { cost: parseIllion(35, 'sextillion'), mult: 3, name: 'Zero-Incident Bonus Scheme' },
    { cost: parseIllion(8, 'octillion'), mult: 7, name: 'Elite Chauffeur Guild' },
    { cost: parseIllion(8, 'tredecillion'), mult: 3, name: 'Autonomous Co-Pilots' },
  ]),
  ...nationalCashTiers(3, [
    { cost: 150_000_000, mult: 3, name: '24/7 Hydraulic Pit Lanes' },
    { cost: parseIllion(150, 'trillion'), mult: 3, name: 'Predictive OBD Telemetry' },
    { cost: parseIllion(5, 'quintillion'), mult: 3, name: 'Robotic Tyre Changers' },
    { cost: parseIllion(80, 'sextillion'), mult: 3, name: 'Automated Wash Tunnels' },
    { cost: parseIllion(40, 'octillion'), mult: 7, name: 'Zero-Downtime Overhaul' },
    { cost: parseIllion(20, 'tredecillion'), mult: 3, name: 'Nano-Coat Chassis Lab' },
  ]),
  ...nationalCashTiers(4, [
    { cost: 250_000_000_000, mult: 3, name: 'Bulk Tanker Hedging' },
    { cost: parseIllion(500, 'trillion'), mult: 3, name: 'High-Flow AdBlue Pumps' },
    { cost: parseIllion(10, 'quintillion'), mult: 3, name: 'Megawatt EV Superchargers' },
    { cost: parseIllion(150, 'sextillion'), mult: 3, name: 'Hydrogen Fuel-Cell Rig' },
    { cost: parseIllion(125, 'octillion'), mult: 7, name: 'Private Refinery Pipeline' },
    { cost: parseIllion(50, 'tredecillion'), mult: 3, name: 'Synthetic E-Fuel Grid' },
  ]),
  ...nationalCashTiers(5, [
    { cost: parseIllion(400, 'trillion'), mult: 3, name: 'Premier League Team Deals' },
    { cost: parseIllion(1.5, 'quadrillion'), mult: 3, name: 'Festival Shuttle Lock-In' },
    { cost: parseIllion(20, 'quintillion'), mult: 3, name: 'Rail Replacement Standby' },
    { cost: parseIllion(200, 'sextillion'), mult: 3, name: 'Arena Tour Exclusives' },
    { cost: parseIllion(250, 'octillion'), mult: 7, name: 'Global Summit Fleet' },
    { cost: parseIllion(125, 'tredecillion'), mult: 3, name: 'World Cup Official Carrier' },
  ]),
  ...nationalCashTiers(6, [
    { cost: parseIllion(25, 'quadrillion'), mult: 3, name: 'Whitehall Transit Pact' },
    { cost: parseIllion(150, 'quadrillion'), mult: 3, name: 'Motorway Bus-Only Lanes' },
    { cost: parseIllion(30, 'quintillion'), mult: 3, name: 'Green Mobility Subsidy' },
    { cost: parseIllion(280, 'sextillion'), mult: 3, name: 'National Concession Pass' },
    { cost: parseIllion(500, 'octillion'), mult: 7, name: 'Ministry of Coaches' },
    { cost: parseIllion(250, 'tredecillion'), mult: 3, name: 'Sovereign Transit Charter' },
  ]),
  ...nationalCashTiers(7, [
    { cost: parseIllion(5, 'quintillion'), mult: 3, name: 'VIP Departure Concourse' },
    { cost: parseIllion(50, 'quintillion'), mult: 3, name: 'Automated Baggage Carousels' },
    { cost: parseIllion(150, 'quintillion'), mult: 3, name: 'Customs Pre-Clearance Gate' },
    { cost: parseIllion(350, 'sextillion'), mult: 3, name: '100-Bay Coach Megaport' },
    { cost: parseIllion(2.5, 'nonillion'), mult: 7, name: 'Intercontinental Hub' },
    { cost: parseIllion(500, 'tredecillion'), mult: 3, name: 'World Central Station' },
  ]),
  ...nationalCashTiers(8, [
    { cost: parseIllion(50, 'septillion'), mult: 3, name: 'FTSE 100 Inclusion' },
    { cost: parseIllion(500, 'septillion'), mult: 3, name: 'Trans-Oceanic Roll-On Ferries' },
    { cost: parseIllion(10, 'octillion'), mult: 3, name: 'Global Dispatch Satellite' },
    { cost: parseIllion(400, 'octillion'), mult: 3, name: 'Five-Continent Monopoly' },
    { cost: parseIllion(25, 'nonillion'), mult: 7, name: 'Planetary Coach Conglomerate' },
    { cost: parseIllion(5, 'quattuordecillion'), mult: 3, name: 'Solar System Express' },
  ]),
  { id: 'nat-cash-all-0', business: 'all', cost: parseIllion(250, 'billion'), multiplier: 3, name: 'National Grid Telemetry' },
  { id: 'nat-cash-all-1', business: 'all', cost: parseIllion(25, 'quadrillion'), multiplier: 3, name: 'Coast-to-Coast Merger' },
  { id: 'nat-cash-all-2', business: 'all', cost: parseIllion(250, 'quintillion'), multiplier: 3, name: 'Public Transit Buyout' },
  { id: 'nat-cash-all-3', business: 'all', cost: parseIllion(450, 'sextillion'), multiplier: 3, name: 'National Highway Monopoly' },
  { id: 'nat-cash-all-4', business: 'all', cost: parseIllion(500, 'duodecillion'), multiplier: 7, name: 'Supreme Transit Board' },
  { id: 'nat-cash-all-5', business: 'all', cost: parseIllion(50, 'quattuordecillion'), multiplier: 3, name: 'Global Empire Dividend' },
  { id: 'nat-cash-angel-0', business: 'angel', cost: parseIllion(50, 'quadrillion'), angelBonus: 0.01, name: 'Institutional Roadshow' },
  { id: 'nat-cash-angel-1', business: 'angel', cost: parseIllion(500, 'quintillion'), angelBonus: 0.01, name: 'Wall Street & City Listing' },
  { id: 'nat-cash-angel-2', business: 'angel', cost: parseIllion(5, 'septillion'), angelBonus: 0.02, name: 'Central Bank Credit Line' },
];

const NATIONAL_ANGEL_UPGRADES = [
  { id: 'nat-angel-early-mgr0', cost: 25, autoManagerIndex: 0, business: 0, flatOwned: 10, name: 'Tina Tickets Retainer' },
  { id: 'nat-angel-early-all-1', cost: 75, business: 'all', multiplier: 2, name: 'National Rail Replacement Deal' },
  { id: 'nat-angel-early-disc-1', cost: 200, business: 'all', costDiscount: 0.15, name: 'Sovereign Procurement Rebate' },
  { id: 'nat-angel-early-spd-1', cost: 600, business: 'all', speedMultiplier: 2, name: 'Green-Wave Traffic Control' },
  { id: 'nat-angel-early-eff-1', cost: 1_500, angelBonus: 0.01, name: 'FTSE Transport Dividend' },
  { id: 'nat-angel-early-all-2', cost: 4_000, business: 'all', multiplier: 3, name: 'Motorway Megagrid ×3' },
  { id: 'nat-angel-all-0', cost: 10_000, business: 'all', multiplier: 3, name: 'National Backer Surge ×3' },
  { id: 'nat-angel-eff-0', cost: 100_000, angelBonus: 0.02, name: 'Executive Investor Relations' },
  { id: 'nat-angel-news-0', cost: 25_000_000, business: 1, flatOwned: 10, name: 'App Bookings +10' },
  { id: 'nat-angel-all-1', cost: 100_000_000, angelBonus: 0.02, name: 'Treasury Gilts Bonus' },
  { id: 'nat-angel-all-2', cost: 1_000_000_000, business: 'all', multiplier: 5, name: 'Motorway Dominance ×5' },
  { id: 'nat-angel-all-3', cost: 100_000_000_000, business: 'all', multiplier: 9, name: 'Sovereign Fleet ×9' },
  { id: 'nat-angel-all-4', cost: 1_000_000_000_000, business: 'all', multiplier: 11, name: 'Global Mega-IPO ×11' },
];

export const DEPOTS = [
  {
    id: 'local',
    name: 'Local Depot',
    blurb: 'Yard out the back of a pub — start with a used Transit.',
    theme: 'local',
    unlockCost: 0,
    /** Weighted contribution to account lifetime / shared backers (Local = baseline). */
    lifetimeWeight: 1,
    angelDivisor: 1e15,
    angelScale: 180, // 150 × 1.2 backer accrual
    startingCash: 0,
    freeFirstBusiness: true,
    businesses: [
      { id: 'used-transit', name: 'Used Ford Transit Minibus', art: '/coach-capitalist/used-transit.jpg', baseCost: 3.738, coefficient: 1.07, baseTime: 0.6, baseRevenue: 1, colour: '#f59e0b' },
      { id: 'new-minibus', name: 'Brand New Minibus', art: '/coach-capitalist/new-transit.jpg', baseCost: 60, coefficient: 1.15, baseTime: 3, baseRevenue: 60, colour: '#38bdf8', newspaper: true },
      { id: 'seat16', name: 'Used Cheetah', art: '/coach-capitalist/old-cheetah.jpg', baseCost: 720, coefficient: 1.14, baseTime: 6, baseRevenue: 540, colour: '#34d399' },
      { id: 'midi', name: 'Brand New Cheetah XL', art: '/coach-capitalist/new-cheetah.jpg', baseCost: 8640, coefficient: 1.13, baseTime: 12, baseRevenue: 4320, colour: '#a78bfa' },
      { id: 'fullsize', name: 'Used Decker', art: '/coach-capitalist/old-decker.jpg', baseCost: 103680, coefficient: 1.12, baseTime: 24, baseRevenue: 51840, colour: '#fb7185' },
      { id: 'double', name: 'Used Plaxton Panther', art: '/coach-capitalist/old-coach.jpg', baseCost: 1244160, coefficient: 1.11, baseTime: 96, baseRevenue: 622080, colour: '#f472b6' },
      { id: 'executive', name: 'Brand New Decker', art: '/coach-capitalist/new-decker.jpg', baseCost: 14929920, coefficient: 1.10, baseTime: 384, baseRevenue: 7464960, colour: '#eab308' },
      { id: 'school', name: 'Brand New Plaxton Panther', art: '/coach-capitalist/new-coach.jpg', baseCost: 179159040, coefficient: 1.09, baseTime: 1536, baseRevenue: 89579520, colour: '#22d3ee' },
      { id: 'national', name: 'Used Team Spec Tri-Axle', art: '/coach-capitalist/used-team-coach.jpg', baseCost: 2149908480, coefficient: 1.08, baseTime: 6144, baseRevenue: 1074954240, colour: '#818cf8' },
      { id: 'mega', name: 'Brand New Team Spec Tri-Axle', art: '/coach-capitalist/new-team-coach.jpg', baseCost: 25798901760, coefficient: 1.07, baseTime: 36864, baseRevenue: 29668737024, colour: '#f97316' },
    ],
    managers: [
      { name: 'Terry Transit', cost: 1000 },
      { name: 'Nina Newbus', cost: 15000 },
      { name: 'Charlie Sixteen', cost: 100000 },
      { name: 'Middy Malone', cost: 500000 },
      { name: 'Deck Donovan', cost: 1200000 },
      { name: 'Diana Double', cost: 10000000 },
      { name: 'Victor VIP', cost: 111111111 },
      { name: 'Sally Schoolrun', cost: 555555555 },
      { name: 'Nat Express', cost: 10000000000 },
      { name: 'Max Mega', cost: 100000000000 },
    ],
    cashUpgrades: EARTH_CASH_UPGRADES,
    angelUpgrades: EARTH_ANGEL_UPGRADES,
  },
  {
    id: 'regional',
    name: 'Regional Hub',
    blurb: 'A proper depot with a workshop and night parking.',
    theme: 'regional',
    unlockCost: 1e12, // unlock when local hits £1 trillion
    unlockHint: 'Earn £1 trillion at Local Depot (or Regional Operator Permit)',
    lifetimeWeight: 2.5, // Regional £ counts 2.5× toward score + shared backers
    angelDivisor: 1e15,
    angelScale: 198, // 165 × 1.2 (legacy per-depot curve)
    startingCash: 0,
    freeFirstBusiness: true,
    businesses: [
      { id: 'airport', name: 'Airport Shuttle', iconType: 'airport', art: '/coach-capitalist/used-transit.jpg', baseCost: 5, coefficient: 1.05, baseTime: 2, baseRevenue: 1, colour: '#38bdf8' },
      { id: 'parkride', name: 'Park & Ride Service', iconType: 'parkride', art: '/coach-capitalist/new-transit.jpg', baseCost: 105, coefficient: 1.21, baseTime: 7, baseRevenue: 21, colour: '#10b981', newspaper: true },
      { id: 'wedding', name: 'Wedding & Events Fleet', iconType: 'wedding', art: '/coach-capitalist/new-cheetah.jpg', baseCost: 2929, coefficient: 1.07, baseTime: 28, baseRevenue: 2001, colour: '#f472b6' },
      { id: 'touring', name: 'Touring Coach', iconType: 'touring', art: '/coach-capitalist/old-coach.jpg', baseCost: 42525, coefficient: 1.19, baseTime: 2, baseRevenue: 376, colour: '#4ade80' },
      { id: 'sleeper', name: 'Sleeper Coach', iconType: 'sleeper', art: '/coach-capitalist/new-coach.jpg', baseCost: 493025, coefficient: 1.09, baseTime: 45, baseRevenue: 98820, colour: '#a78bfa' },
      { id: 'artic', name: 'Articulated Bus', iconType: 'artic', art: '/coach-capitalist/used-team-coach.jpg', baseCost: 18753525, coefficient: 1.15, baseTime: 180, baseRevenue: 1976400, colour: '#fb923c' },
      { id: 'suite', name: 'Luxury Touring Suite', iconType: 'suite', art: '/coach-capitalist/new-team-coach.jpg', baseCost: 393824025, coefficient: 1.13, baseTime: 600, baseRevenue: 32940000, colour: '#facc15' },
      { id: 'franchise', name: 'Multi-Depot Franchise', iconType: 'franchise', art: '/coach-capitalist/old-decker.jpg', baseCost: 8270304525, coefficient: 1.17, baseTime: 3000, baseRevenue: 1152900000, colour: '#2dd4bf' },
      { id: 'crossborder', name: 'Cross-Border Express', iconType: 'crossborder', art: '/coach-capitalist/new-decker.jpg', baseCost: 173676395025, coefficient: 1.11, baseTime: 14400, baseRevenue: 11067840000, colour: '#60a5fa' },
      { id: 'continental', name: 'Continental Network', iconType: 'continental', art: '/coach-capitalist/new-team-coach.jpg', baseCost: 1e12, coefficient: 1.50, baseTime: 86400, baseRevenue: 332035200000, colour: '#f87171' },
    ],
    managers: [
      { name: 'Ava Arrivals', cost: 750 },
      { name: 'Parker Ride', cost: 22500 },
      { name: 'Wendy Wedding', cost: 150000 },
      { name: 'Tom Touring', cost: 1850000 },
      { name: 'Sasha Sleeper', cost: 4300000 },
      { name: 'Artie Artic', cost: 145000000 },
      { name: 'Lux Lane', cost: 33333000000 },
      { name: 'Fran Franchise', cost: 55000000000 },
      { name: 'Border Bill', cost: 1530000000000 },
      { name: 'Connie Continent', cost: 11109000000000 },
    ],
    cashUpgrades: REGIONAL_CASH_UPGRADES,
    angelUpgrades: REGIONAL_ANGEL_UPGRADES,
  },
  {
    id: 'national',
    name: 'National Network',
    blurb: 'Boardrooms, terminals, and a logo on every motorway.',
    theme: 'national',
    unlockCost: 1e16,
    unlockHint: 'Earn £10 quadrillion at Regional Hub (or National Operator Charter)',
    lifetimeWeight: 5, // National £ counts 5× toward score + shared backers
    angelDivisor: 1e14, // Mars uses 100B equivalent scale (wiki: 100 billion vs 400 billion)
    angelScale: 180, // 150 × 1.2 (legacy per-depot curve)
    startingCash: 10,
    freeFirstBusiness: false,
    businesses: [
      { id: 'tickets', name: 'Ticket Booth', iconType: 'tickets', art: '/coach-capitalist/used-transit.jpg', baseCost: 10, coefficient: 1.07, baseTime: 0.8, baseRevenue: 4, colour: '#a3e635' },
      { id: 'app', name: 'App Bookings', iconType: 'app', art: '/coach-capitalist/new-transit.jpg', baseCost: 150, coefficient: 1.12, baseTime: 4, baseRevenue: 80, colour: '#38bdf8', newspaper: true },
      { id: 'drivers', name: 'Driver Agency', iconType: 'drivers', art: '/coach-capitalist/old-cheetah.jpg', baseCost: 2000, coefficient: 1.11, baseTime: 10, baseRevenue: 1500, colour: '#fbbf24' },
      { id: 'workshop', name: 'Fleet Workshop', iconType: 'workshop', art: '/coach-capitalist/new-cheetah.jpg', baseCost: 35000, coefficient: 1.10, baseTime: 24, baseRevenue: 32000, colour: '#fb7185' },
      { id: 'fuel', name: 'Fuel Depot', iconType: 'fuel', art: '/coach-capitalist/old-coach.jpg', baseCost: 650000, coefficient: 1.09, baseTime: 45, baseRevenue: 850000, colour: '#f97316' },
      { id: 'charter', name: 'Charter Contracts', iconType: 'charter', art: '/coach-capitalist/new-coach.jpg', baseCost: 15000000, coefficient: 1.08, baseTime: 90, baseRevenue: 25000000, colour: '#a78bfa' },
      { id: 'gov', name: 'Government Routes', iconType: 'gov', art: '/coach-capitalist/used-team-coach.jpg', baseCost: 450000000, coefficient: 1.08, baseTime: 180, baseRevenue: 900000000, colour: '#2dd4bf' },
      { id: 'terminal', name: 'International Terminal', iconType: 'terminal', art: '/coach-capitalist/new-team-coach.jpg', baseCost: 15000000000, coefficient: 1.07, baseTime: 360, baseRevenue: 40000000000, colour: '#818cf8' },
      { id: 'global', name: 'Global Coach Conglomerate', iconType: 'global', art: '/coach-capitalist/new-decker.jpg', baseCost: 750000000000, coefficient: 1.07, baseTime: 900, baseRevenue: 2500000000000, colour: '#f43f5e' },
    ],
    managers: [
      { name: 'Tina Tickets', cost: 1000 },
      { name: 'Appy Anderson', cost: 15000 },
      { name: 'Dana Drivers', cost: 200000 },
      { name: 'Wrench Wendy', cost: 3500000 },
      { name: 'Fuel Phil', cost: 65000000 },
      { name: 'Charter Charles', cost: 1500000000 },
      { name: 'Gov Greta', cost: 45000000000 },
      { name: 'Term Tom', cost: 1500000000000 },
      { name: 'Globe Gloria', cost: 75000000000000 },
    ],
    cashUpgrades: NATIONAL_CASH_UPGRADES,
    angelUpgrades: NATIONAL_ANGEL_UPGRADES,
  },
];

export const STORAGE_KEY = 'coach-capitalist-v2';
const FORCE_RESET_ACK_KEY = 'coach-capitalist-force-reset';

/** Drop local cache when cloud issues a new force-reset token (admin wipe / claim sync). */
export function acknowledgeForceReset(token) {
  const t = String(token || '').trim();
  if (!t) return false;
  try {
    if (localStorage.getItem(FORCE_RESET_ACK_KEY) === t) return false;
    localStorage.removeItem(STORAGE_KEY);
    // Also clear legacy key from before the v2 bump.
    localStorage.removeItem('coach-capitalist-v1');
    localStorage.setItem(FORCE_RESET_ACK_KEY, t);
    return true;
  } catch {
    return false;
  }
}

export function currentForceResetAck() {
  try {
    return localStorage.getItem(FORCE_RESET_ACK_KEY) || '';
  } catch {
    return '';
  }
}

function emptyDepotState(depot) {
  const n = depot.businesses.length;
  return {
    cash: depot.startingCash || 0,
    lifetimeEarnings: 0,
    sessionEarnings: 0,
    owned: depot.businesses.map((_, i) => (depot.freeFirstBusiness && i === 0 ? 1 : 0)),
    managers: depot.businesses.map(() => false),
    upgrades: [],
    angelUpgrades: [],
    angels: 0,
    angelsSpent: 0,
    angelBonusExtra: 0, // additive to 0.02 base
    progress: depot.businesses.map(() => 0), // 0..1 cycle progress
    running: depot.businesses.map(() => false),
    lastTick: Date.now(),
    frenzyUntil: 0,
    frenzySpeedMult: 2,
    underdogBoostUntil: 0,
    breakdownUntil: 0,
    breakdownSpeedMult: 1,
    unlocked: depot.id === 'local',
    syndicatesCompleted: 0,
  };
}

export function createInitialState() {
  const depots = {};
  for (const d of DEPOTS) depots[d.id] = emptyDepotState(d);
  return {
    version: 1,
    activeDepot: 'local',
    buyMode: 1, // 1 | 10 | 100 | 'max'
    /** Shared company wallet — all depots earn into / spend from this. */
    cash: 0,
    /** Shared backers pool — fed by weighted lifetime across all depots. */
    angels: 0,
    angelsSpent: 0,
    syndicatesCompleted: 0,
    depots,
  };
}

/** Purchase price multiplier for a depot (matches lifetime weight). */
export function depotPriceMult(depotId) {
  return depotLifetimeWeight(depotId);
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createInitialState();
    const parsed = JSON.parse(raw);
    return normalizeGameState(parsed);
  } catch {
    return createInitialState();
  }
}

function padArray(arr, len, fill) {
  const a = Array.isArray(arr) ? [...arr] : [];
  while (a.length < len) a.push(typeof fill === 'function' ? fill() : fill);
  return a.slice(0, len);
}

export function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore quota */
  }
}

export function getDepot(depotId) {
  return DEPOTS.find((d) => d.id === depotId) || DEPOTS[0];
}

export const COACH_CAP_ART_CATALOGUE = [
  { value: '/coach-capitalist/used-transit.jpg', label: 'Photo · Used Ford Transit Minibus', kind: 'photo' },
  { value: '/coach-capitalist/new-transit.jpg', label: 'Photo · Brand New Minibus', kind: 'photo' },
  { value: '/coach-capitalist/old-cheetah.jpg', label: 'Photo · Used Cheetah', kind: 'photo' },
  { value: '/coach-capitalist/new-cheetah.jpg', label: 'Photo · Brand New Cheetah XL', kind: 'photo' },
  { value: '/coach-capitalist/old-decker.jpg', label: 'Photo · Used Decker (Red Double-Decker)', kind: 'photo' },
  { value: '/coach-capitalist/old-coach.jpg', label: 'Photo · Used Plaxton Panther (Single-Decker)', kind: 'photo' },
  { value: '/coach-capitalist/new-decker.jpg', label: 'Photo · Brand New Decker (Blue/Yellow)', kind: 'photo' },
  { value: '/coach-capitalist/new-coach.jpg', label: 'Photo · Brand New Plaxton Panther (White)', kind: 'photo' },
  { value: '/coach-capitalist/used-team-coach.jpg', label: 'Photo · Used Team Spec Tri-Axle', kind: 'photo' },
  { value: '/coach-capitalist/new-team-coach.jpg', label: 'Photo · Brand New Team Spec Tri-Axle', kind: 'photo' },
  { value: 'svg:airport', label: 'Graphic · Airport Shuttle', kind: 'svg', iconType: 'airport', colour: '#38bdf8' },
  { value: 'svg:parkride', label: 'Graphic · Park & Ride Service', kind: 'svg', iconType: 'parkride', colour: '#10b981' },
  { value: 'svg:wedding', label: 'Graphic · Wedding & Events Fleet', kind: 'svg', iconType: 'wedding', colour: '#f472b6' },
  { value: 'svg:touring', label: 'Graphic · Touring Coach', kind: 'svg', iconType: 'touring', colour: '#4ade80' },
  { value: 'svg:sleeper', label: 'Graphic · Sleeper Coach', kind: 'svg', iconType: 'sleeper', colour: '#a78bfa' },
  { value: 'svg:artic', label: 'Graphic · Articulated Bus', kind: 'svg', iconType: 'artic', colour: '#fb923c' },
  { value: 'svg:suite', label: 'Graphic · Luxury Touring Suite', kind: 'svg', iconType: 'suite', colour: '#facc15' },
  { value: 'svg:franchise', label: 'Graphic · Multi-Depot Franchise', kind: 'svg', iconType: 'franchise', colour: '#2dd4bf' },
  { value: 'svg:crossborder', label: 'Graphic · Cross-Border Express', kind: 'svg', iconType: 'crossborder', colour: '#60a5fa' },
  { value: 'svg:continental', label: 'Graphic · Continental Network', kind: 'svg', iconType: 'continental', colour: '#f87171' },
  { value: 'svg:tickets', label: 'Graphic · Ticket Booth', kind: 'svg', iconType: 'tickets', colour: '#a3e635' },
  { value: 'svg:app', label: 'Graphic · App Bookings', kind: 'svg', iconType: 'app', colour: '#38bdf8' },
  { value: 'svg:drivers', label: 'Graphic · Driver Agency', kind: 'svg', iconType: 'drivers', colour: '#fbbf24' },
  { value: 'svg:workshop', label: 'Graphic · Fleet Workshop', kind: 'svg', iconType: 'workshop', colour: '#fb7185' },
  { value: 'svg:fuel', label: 'Graphic · Fuel Depot', kind: 'svg', iconType: 'fuel', colour: '#f97316' },
  { value: 'svg:charter', label: 'Graphic · Charter Contracts', kind: 'svg', iconType: 'charter', colour: '#a78bfa' },
  { value: 'svg:gov', label: 'Graphic · Government Routes', kind: 'svg', iconType: 'gov', colour: '#2dd4bf' },
  { value: 'svg:terminal', label: 'Graphic · International Terminal', kind: 'svg', iconType: 'terminal', colour: '#818cf8' },
  { value: 'svg:global', label: 'Graphic · Global Coach Conglomerate', kind: 'svg', iconType: 'global', colour: '#f43f5e' },
];

export function getBusinessArtValue(biz) {
  if (!biz) return '';
  if (biz.iconType) return `svg:${biz.iconType}`;
  return biz.art || '';
}

const UPPER_ACRONYMS = new Set([
  'XL', 'VIP', 'EV', 'AI', 'CPC', 'OBD', 'ANPR', 'USB', 'PA', 'CCTV', 'IPO', 'FTSE', 'UK', 'EU', 'P+R', 'GT', 'HD',
]);
const LOWER_WORDS = new Set([
  'a', 'an', 'and', 'as', 'at', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'with',
]);
const SPECIAL_WORDS = {
  'wi-fi': 'Wi-Fi',
  'adblue': 'AdBlue',
};

export function formatCoachCapTitleCase(input) {
  const raw = String(input || '').trim().replace(/\s+/g, ' ');
  if (!raw) return '';
  const words = raw.split(' ');
  return words
    .map((word, wIdx) => {
      const lowerWhole = word.toLowerCase();
      if (SPECIAL_WORDS[lowerWhole]) return SPECIAL_WORDS[lowerWhole];
      if (UPPER_ACRONYMS.has(word.toUpperCase())) return word.toUpperCase();
      if (wIdx > 0 && wIdx < words.length - 1 && LOWER_WORDS.has(lowerWhole)) {
        return lowerWhole;
      }
      return word
        .split(/([-–/])/)
        .map((seg) => {
          if (seg === '-' || seg === '–' || seg === '/') return seg;
          if (!seg) return seg;
          const upper = seg.toUpperCase();
          if (UPPER_ACRONYMS.has(upper)) return upper;
          const lower = seg.toLowerCase();
          if (SPECIAL_WORDS[lower]) return SPECIAL_WORDS[lower];
          if (/^[×+\d]/.test(seg)) {
            return seg.replace(/[a-zA-Z]+/g, (m) => m.charAt(0).toUpperCase() + m.slice(1).toLowerCase());
          }
          return seg.charAt(0).toUpperCase() + seg.slice(1).toLowerCase();
        })
        .join('');
    })
    .join(' ');
}

/**
 * Shared admin name & image overrides:
 * {
 *   depots: {
 *     local: {
 *       name?: string,
 *       businesses?: { [businessId]: string },
 *       art?: { [businessId]: string },
 *       upgrades?: { [upgradeId]: string }
 *     }
 *   }
 * }
 */
/** Keep spaces while editing; only collapse empty / oversized values. */
export function draftNameConfig(raw) {
  const out = { depots: {} };
  const src = raw && typeof raw === 'object' ? raw : {};
  const depots = src.depots && typeof src.depots === 'object' ? src.depots : {};
  for (const d of DEPOTS) {
    const entry = depots[d.id] && typeof depots[d.id] === 'object' ? depots[d.id] : {};
    const businesses = {};
    const bizSrc = entry.businesses && typeof entry.businesses === 'object' ? entry.businesses : {};
    for (const biz of d.businesses) {
      if (!Object.prototype.hasOwnProperty.call(bizSrc, biz.id)) continue;
      businesses[biz.id] = String(bizSrc[biz.id] ?? '').slice(0, 80);
    }
    const art = {};
    const artSrc = entry.art && typeof entry.art === 'object' ? entry.art : {};
    for (const biz of d.businesses) {
      if (!Object.prototype.hasOwnProperty.call(artSrc, biz.id)) continue;
      art[biz.id] = String(artSrc[biz.id] ?? '').slice(0, 160);
    }
    const upgrades = {};
    const upSrc = entry.upgrades && typeof entry.upgrades === 'object' ? entry.upgrades : {};
    for (const [id, name] of Object.entries(upSrc)) {
      upgrades[String(id).slice(0, 80)] = String(name ?? '').slice(0, 80);
    }
    const depotName = Object.prototype.hasOwnProperty.call(entry, 'name')
      ? String(entry.name ?? '').slice(0, 80)
      : undefined;
    out.depots[d.id] = {
      ...(depotName !== undefined ? { name: depotName } : {}),
      businesses,
      art,
      upgrades,
    };
  }
  return out;
}

/** Trim ends and apply Title Case for persistence / server save. */
export function normalizeNameConfig(raw) {
  const drafted = draftNameConfig(raw);
  const out = { depots: {} };
  for (const d of DEPOTS) {
    const entry = drafted.depots[d.id] || { businesses: {}, art: {}, upgrades: {} };
    const businesses = {};
    for (const [id, name] of Object.entries(entry.businesses || {})) {
      const clean = formatCoachCapTitleCase(String(name || '').trim()).slice(0, 80);
      if (clean) businesses[id] = clean;
    }
    const art = {};
    for (const [id, artVal] of Object.entries(entry.art || {})) {
      const clean = String(artVal || '').trim().slice(0, 160);
      if (clean) art[id] = clean;
    }
    const upgrades = {};
    for (const [id, name] of Object.entries(entry.upgrades || {})) {
      const clean = formatCoachCapTitleCase(String(name || '').trim()).slice(0, 80);
      if (clean) upgrades[id] = clean;
    }
    const depotName = formatCoachCapTitleCase(String(entry.name || '').trim()).slice(0, 80);
    out.depots[d.id] = {
      ...(depotName ? { name: depotName } : {}),
      businesses,
      art,
      upgrades,
    };
  }
  return out;
}

/** Unweighted sum of depot cash-lifetime (for away banners / raw stats). */
export function rawLifetimeEarnings(state) {
  if (!state?.depots) return 0;
  let sum = 0;
  for (const d of DEPOTS) {
    sum += Number(state.depots[d.id]?.lifetimeEarnings) || 0;
  }
  return sum;
}

/**
 * Account lifetime for leaderboard + shared backers.
 * Regional/National count more so same-vehicle worlds feed one progression.
 */
export function totalLifetimeEarnings(state) {
  if (!state?.depots) return 0;
  let sum = 0;
  for (const d of DEPOTS) {
    const life = Number(state.depots[d.id]?.lifetimeEarnings) || 0;
    const weight = Number(d.lifetimeWeight) > 0 ? Number(d.lifetimeWeight) : 1;
    sum += life * weight;
  }
  return sum;
}

export function depotLifetimeWeight(depotId) {
  const d = DEPOTS.find((x) => x.id === depotId);
  return Number(d?.lifetimeWeight) > 0 ? Number(d.lifetimeWeight) : 1;
}

/** Stable log10 sort key for huge earnings (Firestore number ordering). */
export function lifetimeSortKey(lifetimeEarnings) {
  const n = Number(lifetimeEarnings);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.log10(n);
}

export function normalizeGameState(raw) {
  if (!raw || typeof raw !== 'object') return createInitialState();
  const base = createInitialState();
  const syndicatesCompleted = Math.max(0, Math.floor(Number(raw.syndicatesCompleted) || 0));
  const merged = {
    ...base,
    ...raw,
    version: 1,
    syndicatesCompleted,
    depots: { ...base.depots },
  };
  if (raw.buyMode === 10 || raw.buyMode === 100 || raw.buyMode === 'max' || raw.buyMode === 'next' || raw.buyMode === 1) {
    merged.buyMode = raw.buyMode;
  }
  if (typeof raw.activeDepot === 'string' && DEPOTS.some((d) => d.id === raw.activeDepot)) {
    merged.activeDepot = raw.activeDepot;
  }
  for (const d of DEPOTS) {
    const saved = raw.depots?.[d.id];
    merged.depots[d.id] = saved
      ? {
          ...emptyDepotState(d),
          ...saved,
          owned: padArray(saved.owned, d.businesses.length, 0),
          managers: padArray(saved.managers, d.businesses.length, false),
          progress: padArray(saved.progress, d.businesses.length, 0),
          running: padArray(saved.running, d.businesses.length, false),
          upgrades: Array.isArray(saved.upgrades) ? saved.upgrades : [],
          angelUpgrades: Array.isArray(saved.angelUpgrades) ? saved.angelUpgrades : [],
          cash: Math.max(0, Number(saved.cash) || 0),
          lifetimeEarnings: Math.max(0, Number(saved.lifetimeEarnings) || 0),
          sessionEarnings: Math.max(0, Number(saved.sessionEarnings) || 0),
          // Per-depot angels kept for migration only; gameplay uses account pool.
          angels: Math.max(0, Number(saved.angels) || 0),
          angelsSpent: Math.max(0, Number(saved.angelsSpent) || 0),
          lastTick: Number(saved.lastTick) || Date.now(),
          frenzyUntil: Math.max(0, Number(saved.frenzyUntil) || 0),
          frenzySpeedMult: Number(saved.frenzySpeedMult) || 2,
          underdogBoostUntil: Math.max(0, Number(saved.underdogBoostUntil) || 0),
          breakdownUntil: Math.max(0, Number(saved.breakdownUntil) || 0),
          breakdownSpeedMult: Number(saved.breakdownSpeedMult) || 0.5,
          unlocked: d.id === 'local' ? true : Boolean(saved.unlocked),
          syndicatesCompleted: Math.max(
            syndicatesCompleted,
            Math.floor(Number(saved.syndicatesCompleted) || 0),
          ),
        }
      : { ...emptyDepotState(d), syndicatesCompleted };
    if (d.id === 'local') merged.depots[d.id].unlocked = true;
    for (const id of merged.depots[d.id].angelUpgrades) {
      const up = d.angelUpgrades.find((u) => u.id === id);
      if (up?.autoManagerIndex != null) {
        const idx = Number(up.autoManagerIndex);
        if (idx >= 0 && idx < d.businesses.length) {
          merged.depots[d.id].owned[idx] = Math.max(1, merged.depots[d.id].owned[idx] || 0);
          merged.depots[d.id].managers[idx] = true;
          merged.depots[d.id].running[idx] = true;
        }
      }
    }
  }
  // Shared wallet: prefer account cash; else migrate sum of old per-depot piles.
  if (raw.cash != null) {
    merged.cash = Math.max(0, Number(raw.cash) || 0);
  } else {
    let cash = 0;
    for (const d of DEPOTS) {
      cash += Number(merged.depots[d.id]?.cash) || 0;
    }
    merged.cash = cash;
  }
  // Shared backers: prefer account fields; else migrate sum of old per-depot pools.
  const hasAccountAngels = raw.angels != null || raw.angelsSpent != null;
  if (hasAccountAngels) {
    merged.angels = Math.max(0, Number(raw.angels) || 0);
    merged.angelsSpent = Math.max(0, Number(raw.angelsSpent) || 0);
  } else {
    let angels = 0;
    let spent = 0;
    for (const d of DEPOTS) {
      angels += Number(merged.depots[d.id]?.angels) || 0;
      spent += Number(merged.depots[d.id]?.angelsSpent) || 0;
    }
    merged.angels = angels;
    merged.angelsSpent = spent;
  }
  return syncDepotUnlocks(merged);
}

/** Sum of per-depot session earnings — drops on claim/prestige. */
export function totalSessionEarnings(state) {
  let sum = 0;
  for (const d of DEPOTS) {
    sum += Number(state?.depots?.[d.id]?.sessionEarnings) || 0;
  }
  return sum;
}

/**
 * Prefer the save with higher lifetime earnings.
 * On a tie, prefer the lower session total (post-claim) so a stale tab cannot
 * undo a prestige while lifetime is unchanged.
 */
function maxDepotLastTick(state) {
  let max = 0;
  for (const d of DEPOTS) {
    const t = Number(state?.depots?.[d.id]?.lastTick) || 0;
    if (t > max) max = t;
  }
  return max;
}

function totalRunningProgress(state) {
  let sum = 0;
  for (const d of DEPOTS) {
    const prog = state?.depots?.[d.id]?.progress;
    if (!Array.isArray(prog)) continue;
    for (const p of prog) sum += Math.max(0, Number(p) || 0);
  }
  return sum;
}

export function pickRicherState(localState, cloudState, cloudUpdatedAt = null) {
  const local = normalizeGameState(localState);
  if (!cloudState) return { state: local, source: 'local' };
  const cloud = normalizeGameState(cloudState);
  const localLife = totalLifetimeEarnings(local);
  const cloudLife = totalLifetimeEarnings(cloud);
  if (cloudLife > localLife) return { state: cloud, source: 'cloud' };
  if (localLife > cloudLife) return { state: local, source: 'local' };
  const localAngels = (Number(local.angels) || 0) + (Number(local.angelsSpent) || 0);
  const cloudAngels = (Number(cloud.angels) || 0) + (Number(cloud.angelsSpent) || 0);
  if (cloudAngels > localAngels) return { state: cloud, source: 'cloud' };
  if (localAngels > cloudAngels) return { state: local, source: 'local' };
  const localSession = totalSessionEarnings(local);
  const cloudSession = totalSessionEarnings(cloud);
  if (cloudSession < localSession) return { state: cloud, source: 'cloud' };
  if (localSession < cloudSession) return { state: local, source: 'local' };
  const localCash = Math.max(0, Number(local.cash) || 0);
  const cloudCash = Math.max(0, Number(cloud.cash) || 0);
  if (cloudCash < localCash) return { state: cloud, source: 'cloud' };
  if (localCash < cloudCash) return { state: local, source: 'local' };
  const localProg = totalRunningProgress(local);
  const cloudProg = totalRunningProgress(cloud);
  if (localProg > cloudProg + 1e-6) return { state: local, source: 'local' };
  if (cloudProg > localProg + 1e-6) return { state: cloud, source: 'cloud' };
  if (maxDepotLastTick(local) >= maxDepotLastTick(cloud)) {
    return { state: local, source: 'local' };
  }
  const cloudAt = cloudUpdatedAt ? Date.parse(cloudUpdatedAt) : 0;
  if (Number.isFinite(cloudAt) && cloudAt > Date.now() - 5_000) {
    return { state: cloud, source: 'cloud' };
  }
  return { state: local, source: 'local' };
}

/** Offline pay is a small fraction of live manager £/s (not full AdCap offline). */
export const AWAY_EARNINGS_RATE = 0.1;
/** Only the first N hours away (wall clock) are considered. */
export const AWAY_EARNINGS_MAX_MS = 8 * 60 * 60 * 1000;
/** No earnings 22:00–05:00 Europe/London (live or away). */
export const QUIET_HOURS_TZ = 'Europe/London';
export const QUIET_HOUR_START = 22; // inclusive
export const QUIET_HOUR_END = 5; // exclusive

function londonHour(ms) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: QUIET_HOURS_TZ,
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(ms));
  return Number(parts.find((p) => p.type === 'hour')?.value || 0);
}

/** True during 10pm–5am Europe/London. */
export function isCoachCapQuietHours(ms = Date.now()) {
  const hour = londonHour(ms);
  return hour >= QUIET_HOUR_START || hour < QUIET_HOUR_END;
}

/** True on Saturday or Sunday Europe/London. */
export function isCoachCapWeekend(ms = Date.now()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: QUIET_HOURS_TZ,
    weekday: 'short',
  }).format(new Date(ms));
  return parts === 'Sat' || parts === 'Sun';
}

/** Milliseconds timestamp of the next upcoming Monday at 05:00 Europe/London. */
export function getNextMondayMorningMs(ms = Date.now()) {
  const d = new Date(ms);
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: QUIET_HOURS_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  });
  for (let offset = 0; offset <= 8; offset++) {
    const testDate = new Date(d.getTime() + offset * 86400000);
    const parts = formatter.formatToParts(testDate);
    const weekday = parts.find((p) => p.type === 'weekday')?.value;
    if (weekday === 'Mon') {
      const year = parts.find((p) => p.type === 'year')?.value;
      const month = parts.find((p) => p.type === 'month')?.value;
      const day = parts.find((p) => p.type === 'day')?.value;
      const iso = `${year}-${month}-${day}T05:00:00Z`;
      const base = new Date(iso).getTime();
      const dLondon = new Date(base);
      const hourInLondon = Number(
        new Intl.DateTimeFormat('en-GB', { timeZone: QUIET_HOURS_TZ, hour: 'numeric', hourCycle: 'h23' }).format(dLondon),
      );
      const offsetMs = (hourInLondon - 5) * 3600000;
      const monday5amMs = base - offsetMs;
      if (monday5amMs > ms) {
        return monday5amMs;
      }
    }
  }
  return ms + 86400000;
}

/**
 * Milliseconds between start and end that fall outside quiet hours and outside weekends.
 * Steps in 1-minute chunks (fine for live ticks and ≤8h away windows).
 */
export function earnableMsBetween(startMs, endMs) {
  const start = Math.floor(Number(startMs) || 0);
  const end = Math.floor(Number(endMs) || 0);
  if (!(end > start)) return 0;
  const STEP = 60_000;
  let total = 0;
  let t = start;
  while (t < end) {
    const next = Math.min(end, t + STEP);
    const mid = t + (next - t) / 2;
    if (!isCoachCapQuietHours(mid) && !isCoachCapWeekend(mid)) total += next - t;
    t = next;
  }
  return total;
}

/**
 * Credit managed fleets for time away at AWAY_EARNINGS_RATE (default 10% of live).
 * Quiet hours (10pm–5am London) never earn. Unmanaged in-progress jobs finish at most once.
 * Timers always advance forward from their current progress and never reset on focus loss.
 */
export function applyAwayEarnings(state, now = Date.now()) {
  let awayMs = 0;
  let earnableMs = 0;
  let cashEarned = 0;
  const depots = { ...state.depots };
  for (const d of DEPOTS) {
    const ds = depots[d.id];
    if (!ds?.unlocked) continue;
    const last = Number(ds.lastTick) || now;
    const windowEnd = Math.min(now, last + AWAY_EARNINGS_MAX_MS);
    const wallMs = Math.max(0, windowEnd - last);
    if (wallMs < 1500) {
      // Short focus switch: advance timers smoothly using normal live tick instead of discarding elapsed time.
      const quickTick = tickDepot(d, ds, now, state.angels);
      depots[d.id] = quickTick.depotState;
      cashEarned += quickTick.earned;
      continue;
    }
    const paidMs = earnableMsBetween(last, windowEnd);
    awayMs = Math.max(awayMs, wallMs);
    earnableMs = Math.max(earnableMs, paidMs);
    const awayTick = tickDepotAway(d, ds, now, paidMs / 1000, state.angels);
    depots[d.id] = awayTick.depotState;
    cashEarned += awayTick.earned;
  }
  return {
    state: syncDepotUnlocks({
      ...state,
      cash: Math.max(0, Number(state.cash) || 0) + cashEarned,
      depots,
    }),
    awayMs,
    earnableMs,
    earned: Math.max(0, cashEarned),
    quietNow: isCoachCapQuietHours(now),
  };
}

function tickDepotAway(depot, depotState, now, elapsedSec, accountAngels = 0) {
  const state = {
    ...depotState,
    owned: [...depotState.owned],
    managers: [...depotState.managers],
    progress: [...depotState.progress],
    running: [...depotState.running],
  };
  state.lastTick = now;
  if (!(elapsedSec > 0)) return { depotState: state, earned: 0 };

  const mult = computeMultipliers(depot, state, accountAngels);
  const rate = AWAY_EARNINGS_RATE;
  let earned = 0;
  for (let i = 0; i < depot.businesses.length; i += 1) {
    const o = state.owned[i] || 0;
    if (o <= 0) continue;
    const { time, cycleRevenue } = mult.perBusiness[i];
    if (cycleRevenue <= 0 || time <= 0) continue;
    if (state.managers[i]) {
      if (time < 0.05) {
        // Ultra-fast striped bar: continuous away payout
        earned += (cycleRevenue / time) * elapsedSec * rate;
        state.progress[i] = 0;
        state.running[i] = true;
      } else {
        // Advance cycle progress forward without resetting the timer bar
        const prog = Math.max(0, Math.min(0.999999, Number(state.progress[i]) || 0));
        const totalProg = prog + elapsedSec / time;
        const completedCycles = Math.floor(totalProg);
        if (completedCycles >= 1) {
          // First cycle blends live portion (prog at 100%) + away portion ((1 - prog) at away rate)
          const firstCycleMult = prog + (1 - prog) * rate;
          earned += cycleRevenue * (firstCycleMult + (completedCycles - 1) * rate);
        }
        state.progress[i] = totalProg - completedCycles;
        state.running[i] = true;
      }
    } else if (state.running[i]) {
      const prog = Math.max(0, Math.min(0.999999, Number(state.progress[i]) || 0));
      const need = (1 - prog) * time;
      if (elapsedSec >= need) {
        earned += cycleRevenue;
        state.progress[i] = 0;
        state.running[i] = false;
      } else {
        state.progress[i] = prog + elapsedSec / time;
      }
    }
  }
  if (earned > 0) {
    state.lifetimeEarnings += earned;
    state.sessionEarnings = (Number(state.sessionEarnings) || 0) + earned;
  }
  return { depotState: state, earned };
}

/** Portal-coin milestones keyed by total lifetime earnings thresholds. */
export const COACH_CAP_MILESTONES = [
  { id: 'life_1m', at: 1e6, coins: 5, label: '£1 million lifetime' },
  { id: 'life_1b', at: 1e9, coins: 10, label: '£1 billion lifetime' },
  { id: 'life_1t', at: 1e12, coins: 25, label: '£1 trillion lifetime' },
  { id: 'life_1qa', at: 1e15, coins: 50, label: '£1 quadrillion lifetime' },
  { id: 'life_1qi', at: 1e18, coins: 75, label: '£1 quintillion lifetime' },
];

export function applyNameOverrides(depot, nameConfig) {
  if (!depot) return depot;
  const entry = nameConfig?.depots?.[depot.id];
  if (!entry) return depot;
  const businesses = (depot.businesses || []).map((biz) => {
    let nextBiz = biz;
    if (Object.prototype.hasOwnProperty.call(entry.businesses || {}, biz.id)) {
      const override = entry.businesses[biz.id];
      // Allow spaces while typing; empty string falls back to default.
      if (override !== '' && override != null) {
        nextBiz = { ...nextBiz, name: String(override) };
      }
    }
    if (Object.prototype.hasOwnProperty.call(entry.art || {}, biz.id)) {
      const artOverride = String(entry.art[biz.id] || '').trim();
      if (artOverride) {
        if (artOverride.startsWith('svg:')) {
          nextBiz = { ...nextBiz, iconType: artOverride.slice(4), art: '' };
        } else {
          nextBiz = { ...nextBiz, art: artOverride, iconType: '' };
        }
      }
    }
    return nextBiz;
  });
  const cashUpgrades = (depot.cashUpgrades || []).map((up) => {
    if (!Object.prototype.hasOwnProperty.call(entry.upgrades || {}, up.id)) return up;
    const override = entry.upgrades[up.id];
    if (override === '' || override == null) return up;
    return { ...up, name: String(override) };
  });
  const angelUpgrades = (depot.angelUpgrades || []).map((up) => {
    if (!Object.prototype.hasOwnProperty.call(entry.upgrades || {}, up.id)) return up;
    const override = entry.upgrades[up.id];
    if (override === '' || override == null) return up;
    return { ...up, name: String(override) };
  });
  const depotName = Object.prototype.hasOwnProperty.call(entry, 'name')
    ? String(entry.name ?? '')
    : '';
  return {
    ...depot,
    name: depotName || depot.name,
    businesses,
    cashUpgrades,
    angelUpgrades,
  };
}

export function businessDisplayName(depot, businessIndexOrId) {
  if (!depot) return '';
  if (typeof businessIndexOrId === 'number') {
    return depot.businesses[businessIndexOrId]?.name || '';
  }
  return depot.businesses.find((b) => b.id === businessIndexOrId)?.name || '';
}

function countSpeedHalves(owned) {
  return SPEED_OWNED.filter((m) => owned >= m).length;
}

function profitFromStandardUnlocks(owned) {
  const cappedOwned = Math.min(4000, Math.max(0, Math.floor(Number(owned) || 0)));
  let m = 1;
  for (const [at, mult] of STANDARD_PROFIT) {
    if (cappedOwned >= at) m *= mult;
  }
  return m;
}

function newspaperBonuses(owned, businessCount) {
  const selfSpeed = { halves: 0 };
  const profitByTarget = Array.from({ length: businessCount }, () => 1);
  for (const u of NEWSPAPER_UNLOCKS) {
    if (owned < u.at) continue;
    if (u.selfSpeed) selfSpeed.halves += Math.log2(u.selfSpeed);
    if (u.target != null && u.profit) {
      if (u.target >= 0 && u.target < businessCount) profitByTarget[u.target] *= u.profit;
    }
  }
  return { selfSpeedHalves: Math.floor(selfSpeed.halves), profitByTarget };
}

function globalBonuses(ownedArr) {
  const minOwned = ownedArr.length ? Math.min(...ownedArr) : 0;
  let speedHalves = 0;
  let profit = 1;
  for (const u of GLOBAL_UNLOCKS) {
    if (minOwned < u.at) continue;
    if (u.speed) speedHalves += Math.log2(u.speed);
    if (u.profit) profit *= u.profit;
  }
  return { speedHalves: Math.floor(speedHalves), profit };
}

export function getManagerLevel(depotState, index) {
  if (!depotState?.managers?.[index]) return 0;
  const ups = depotState.upgrades || [];
  if (ups.includes(`mgr-promo-${index}-2`)) return 3;
  if (ups.includes(`mgr-promo-${index}-1`)) return 2;
  return 1;
}

export function getManagerPromotionInfo(depot, depotState, index) {
  const level = getManagerLevel(depotState, index);
  const mgr = depot?.managers?.[index];
  const baseCost = Number(mgr?.cost) || 1000;
  const priceMult = depotPriceMult(depot?.id);
  const titles = {
    0: 'Unhired',
    1: 'Dispatcher',
    2: 'Senior Dispatcher',
    3: 'Fleet Director',
  };
  const activeEffects = {
    0: 'Manual dispatch only',
    1: 'Auto-runs jobs continuously',
    2: 'Speed ×1.5 · Profit ×1.5 · −10% Vehicle Cost',
    3: 'Speed ×3 · Profit ×3 · −23.5% Vehicle Cost',
  };
  if (level === 1) {
    return {
      level,
      title: titles[1],
      activeEffectLabel: activeEffects[1],
      nextLevel: 2,
      nextTitle: titles[2],
      nextId: `mgr-promo-${index}-1`,
      nextCost: baseCost * 250 * priceMult,
      nextEffectLabel: 'Speed ×1.5 · Profit ×1.5 · −10% Cost',
    };
  }
  if (level === 2) {
    return {
      level,
      title: titles[2],
      activeEffectLabel: activeEffects[2],
      nextLevel: 3,
      nextTitle: titles[3],
      nextId: `mgr-promo-${index}-2`,
      nextCost: baseCost * 25_000 * priceMult,
      nextEffectLabel: 'Speed ×3 · Profit ×3 · −23.5% Cost',
    };
  }
  return {
    level,
    title: titles[level] || 'Dispatcher',
    activeEffectLabel: activeEffects[level] || '',
    nextLevel: null,
    nextTitle: null,
    nextId: null,
    nextCost: 0,
    nextEffectLabel: null,
  };
}

export function promoteManager(state, depotId, index) {
  const depot = getDepot(depotId);
  const depotState = state?.depots?.[depotId];
  if (!depot || !depotState) return state;
  const info = getManagerPromotionInfo(depot, depotState, index);
  if (!info.nextId) return state;
  const cash = Math.max(0, Number(state.cash) || 0);
  if (cash < info.nextCost) return state;
  if ((depotState.upgrades || []).includes(info.nextId)) return state;
  return {
    ...state,
    cash: cash - info.nextCost,
    depots: {
      ...state.depots,
      [depotId]: {
        ...depotState,
        upgrades: [...(depotState.upgrades || []), info.nextId],
      },
    },
  };
}

export function getBusinessCostMultiplier(depot, depotState, index) {
  let mult = depotPriceMult(depot?.id);
  if (!depot || !depotState) return mult;
  for (const id of depotState.angelUpgrades || []) {
    const up = depot.angelUpgrades.find((u) => u.id === id);
    if (up?.costDiscount && (up.business === 'all' || up.business == null || up.business === index)) {
      mult *= Math.max(0.1, 1 - Number(up.costDiscount));
    }
  }
  const mgrLevel = getManagerLevel(depotState, index);
  if (mgrLevel >= 2) mult *= 0.9;
  if (mgrLevel >= 3) mult *= 0.85;
  return mult;
}

export function getSyndicateMultiplier(syndicatesCompleted) {
  const count = Math.max(0, Math.floor(Number(syndicatesCompleted) || 0));
  if (count <= 0) return 1.0;
  return 1.5 + (count - 1) * 0.5;
}

export function computeMultipliers(depot, depotState, accountAngels = null, explicitSyndicateMult = null, accountSyndicatesCompleted = null) {
  const n = depot.businesses.length;
  const owned = depotState.owned;
  const upgradeProfit = Array.from({ length: n }, () => 1);
  let allProfit = 1;
  let angelAllSpeedMult = 1;
  let angelBonusExtra = Number(depotState.angelBonusExtra) || 0;

  for (const id of depotState.upgrades || []) {
    const up = depot.cashUpgrades.find((u) => u.id === id);
    if (!up) continue;
    if (up.business === 'all') allProfit *= up.multiplier || 1;
    else if (up.business === 'angel') angelBonusExtra += up.angelBonus || 0;
    else if (typeof up.business === 'number') upgradeProfit[up.business] *= up.multiplier || 1;
  }
  for (const id of depotState.angelUpgrades || []) {
    const up = depot.angelUpgrades.find((u) => u.id === id);
    if (!up) continue;
    if (up.business === 'all') allProfit *= up.multiplier || 1;
    else if (typeof up.business === 'number' && up.multiplier) upgradeProfit[up.business] *= up.multiplier;
    if (up.speedMultiplier && (up.business === 'all' || up.business == null)) {
      angelAllSpeedMult *= Number(up.speedMultiplier) || 1;
    }
    if (up.angelBonus) angelBonusExtra += up.angelBonus;
  }

  const newsIdx = depot.businesses.findIndex((b) => b.newspaper);
  const news = newsIdx >= 0
    ? newspaperBonuses(owned[newsIdx] || 0, n)
    : { selfSpeedHalves: 0, profitByTarget: Array.from({ length: n }, () => 1) };
  const global = globalBonuses(owned);

  const angelRate = 0.02 + angelBonusExtra;
  const angels = accountAngels != null
    ? Number(accountAngels) || 0
    : Number(depotState.angels) || 0;
  const angelMult = 1 + angels * angelRate;

  const frenzyUntil = Number(depotState?.frenzyUntil) || 0;
  const underdogBoostUntil = Number(depotState?.underdogBoostUntil) || 0;
  const breakdownUntil = Number(depotState?.breakdownUntil) || 0;
  const nowMs = Date.now();
  const frenzyActive = frenzyUntil > nowMs;
  const frenzyRemainingSec = frenzyActive ? Math.max(0, Math.ceil((frenzyUntil - nowMs) / 1000)) : 0;
  const frenzySpeedMult = frenzyActive ? (Number(depotState?.frenzySpeedMult) || 2) : 1;
  const underdogActive = underdogBoostUntil > nowMs;
  const underdogRemainingSec = underdogActive ? Math.max(0, Math.ceil((underdogBoostUntil - nowMs) / 1000)) : 0;
  const underdogProfitMult = underdogActive ? 3 : 1;

  const breakdownActive = breakdownUntil > nowMs;
  const breakdownRemainingSec = breakdownActive ? Math.max(0, Math.ceil((breakdownUntil - nowMs) / 1000)) : 0;
  const breakdownSpeedMult = breakdownActive ? (Number(depotState?.breakdownSpeedMult) || 0.5) : 1;

  const syndCount = Math.max(0, Math.floor(Number(depotState?.syndicatesCompleted ?? accountSyndicatesCompleted) || 0));
  const syndicateProfitMult = explicitSyndicateMult != null
    ? Math.max(1, Number(explicitSyndicateMult) || 1)
    : getSyndicateMultiplier(syndCount);

  const perBusiness = depot.businesses.map((biz, i) => {
    const o = owned[i] || 0;
    // Newspaper-style businesses use their own early speed unlocks; others use 25/50/100…
    const speedHalves = (biz.newspaper ? news.selfSpeedHalves : countSpeedHalves(o)) + global.speedHalves;
    const mgrLevel = getManagerLevel(depotState, i);
    const mgrSpeedMult = mgrLevel >= 3 ? 3 : mgrLevel >= 2 ? 1.5 : 1;
    const mgrProfitMult = mgrLevel >= 3 ? 3 : mgrLevel >= 2 ? 1.5 : 1;
    const profitMult = profitFromStandardUnlocks(o)
      * (news.profitByTarget[i] || 1)
      * upgradeProfit[i]
      * allProfit
      * global.profit
      * mgrProfitMult
      * angelMult
      * underdogProfitMult
      * syndicateProfitMult;
    const totalSpeedMult = (2 ** speedHalves) * angelAllSpeedMult * mgrSpeedMult * frenzySpeedMult * breakdownSpeedMult;
    const time = biz.baseTime / totalSpeedMult;
    const revenuePerUnit = biz.baseRevenue * profitMult;
    const cycleRevenue = revenuePerUnit * o;
    const revenuePerSecond = time > 0 ? cycleRevenue / time : 0;
    return {
      speedHalves,
      profitMult,
      mgrLevel,
      time,
      revenuePerUnit,
      cycleRevenue,
      revenuePerSecond,
    };
  });

  return {
    perBusiness,
    angelRate,
    angelMult,
    allProfit,
    syndicateProfitMult,
    syndicatesCompleted: syndCount,
    frenzyActive,
    frenzyRemainingSec,
    frenzySpeedMult,
    underdogActive,
    underdogRemainingSec,
    breakdownActive,
    breakdownRemainingSec,
    breakdownSpeedMult,
  };
}

/** Shared backer curve scale (AdCap Earth 150 × 1.2 accrual buff). */
export const ANGEL_SCALE = 180;
const ANGEL_DIVISOR = 1e15;

/** Shared backer curve — Earth-scale formula on weighted account lifetime. */
export function angelsFromWeightedLifetime(weightedLifetime) {
  const life = Number(weightedLifetime) || 0;
  if (life <= 0) return 0;
  return Math.floor(ANGEL_SCALE * Math.sqrt(life / ANGEL_DIVISOR));
}

/** @deprecated Prefer angelsFromWeightedLifetime — kept for call sites that pass a depot. */
export function angelsFromLifetime(depot, lifetimeEarnings) {
  const scale = depot?.angelScale || ANGEL_SCALE;
  const div = depot?.angelDivisor || ANGEL_DIVISOR;
  if (lifetimeEarnings <= 0) return 0;
  return Math.floor(scale * Math.sqrt(lifetimeEarnings / div));
}

/** Pending shared backers from weighted lifetime across all depots. */
export function pendingAngels(state) {
  const total = angelsFromWeightedLifetime(totalLifetimeEarnings(state));
  const already = (Number(state.angels) || 0) + (Number(state.angelsSpent) || 0);
  return Math.max(0, total - already);
}

export function tickDepot(depot, depotState, now = Date.now(), accountAngels = 0) {
  const state = {
    ...depotState,
    owned: [...depotState.owned],
    managers: [...depotState.managers],
    progress: [...depotState.progress],
    running: [...depotState.running],
  };
  const last = Number(state.lastTick) || now;
  // Only seconds outside 10pm–5am London count toward production.
  const elapsed = earnableMsBetween(last, now) / 1000;
  state.lastTick = now;
  if (elapsed <= 0) return { depotState: state, earned: 0 };

  const mult = computeMultipliers(depot, state, accountAngels);
  let earned = 0;

  for (let i = 0; i < depot.businesses.length; i += 1) {
    const o = state.owned[i] || 0;
    if (o <= 0) continue;
    const { time, cycleRevenue } = mult.perBusiness[i];
    if (cycleRevenue <= 0 || time <= 0) continue;

    const hasManager = state.managers[i];
    if (hasManager) {
      // Continuous production when very fast; otherwise simulate cycles
      if (time < 0.05) {
        earned += (cycleRevenue / time) * elapsed;
        state.progress[i] = 0;
        state.running[i] = true;
      } else {
        let remaining = elapsed;
        let prog = state.progress[i] || 0;
        // If not running, manager starts immediately
        if (!state.running[i]) {
          state.running[i] = true;
          prog = 0;
        }
        while (remaining > 0) {
          const need = (1 - prog) * time;
          if (remaining >= need) {
            earned += cycleRevenue;
            remaining -= need;
            prog = 0;
          } else {
            prog += remaining / time;
            remaining = 0;
          }
        }
        state.progress[i] = prog;
        state.running[i] = true;
      }
    } else if (state.running[i]) {
      let prog = state.progress[i] || 0;
      const need = (1 - prog) * time;
      if (elapsed >= need) {
        earned += cycleRevenue;
        state.progress[i] = 0;
        state.running[i] = false;
      } else {
        state.progress[i] = prog + elapsed / time;
      }
    }
  }

  if (earned > 0) {
    state.lifetimeEarnings += earned;
    state.sessionEarnings += earned;
  }
  return { depotState: state, earned };
}

export function startCycle(depot, depotState, index) {
  const state = { ...depotState, running: [...depotState.running], progress: [...depotState.progress] };
  if ((state.owned[index] || 0) <= 0) return state;
  if (state.running[index]) return state;
  state.running[index] = true;
  state.progress[index] = 0;
  return state;
}

/** Scaled list price for a depot (Regional ×2.5, National ×5). */
export function scaledCost(base, depotId) {
  return (Number(base) || 0) * depotPriceMult(depotId);
}

export function nextUnlockQty(biz, owned) {
  const o = Math.max(0, Math.floor(Number(owned) || 0));
  if (o <= 0) return 1;
  const target = nextUnlockAtForBusiness(biz, o);
  if (target != null && target > o) return target - o;
  return 1;
}

export function buyBusinesses(state, depotId, index, mode) {
  const depot = getDepot(depotId);
  const depotState = state.depots[depotId];
  if (!depotState) return state;
  const biz = depot.businesses[index];
  if (!biz) return state;
  const priceMult = getBusinessCostMultiplier(depot, depotState, index);
  const cash = Math.max(0, Number(state.cash) || 0);
  const owned = depotState.owned[index] || 0;
  const affordCash = priceMult > 0 ? cash / priceMult : cash;
  let qty;
  if (mode === 'max') {
    qty = maxAffordable(biz.baseCost, biz.coefficient, owned, affordCash);
  } else if (mode === 'next') {
    qty = nextUnlockQty(biz, owned);
    if (buyCost(biz.baseCost, biz.coefficient, owned, qty) > affordCash) {
      return state;
    }
  } else {
    qty = Math.max(1, Math.floor(Number(mode) || 1));
    if (owned <= 0) qty = 1;
    if (buyCost(biz.baseCost, biz.coefficient, owned, qty) > affordCash) {
      return state;
    }
  }
  if (qty <= 0) return state;
  while (qty > 0 && buyCost(biz.baseCost, biz.coefficient, owned, qty) > affordCash) {
    qty -= 1;
  }
  if (qty <= 0) return state;
  const cost = buyCost(biz.baseCost, biz.coefficient, owned, qty) * priceMult;
  const nextOwned = [...depotState.owned];
  nextOwned[index] = owned + qty;
  return {
    ...state,
    cash: cash - cost,
    depots: {
      ...state.depots,
      [depotId]: { ...depotState, owned: nextOwned },
    },
  };
}

export function buyManager(state, depotId, index) {
  const depot = getDepot(depotId);
  const depotState = state.depots[depotId];
  if (!depotState) return state;
  if (depotState.managers[index]) return state;
  const mgr = depot.managers[index];
  const priceMult = depotPriceMult(depotId);
  const cost = (mgr?.cost || 0) * priceMult;
  const cash = Math.max(0, Number(state.cash) || 0);
  if (!mgr || cash < cost) return state;
  if ((depotState.owned[index] || 0) <= 0) return state;
  const managers = [...depotState.managers];
  const running = [...depotState.running];
  managers[index] = true;
  running[index] = true;
  return {
    ...state,
    cash: cash - cost,
    depots: {
      ...state.depots,
      [depotId]: { ...depotState, managers, running },
    },
  };
}

export function getAffordableManagers(state, depotId) {
  const depot = getDepot(depotId);
  const depotState = state?.depots?.[depotId];
  if (!depot || !depotState) return [];
  const priceMult = depotPriceMult(depotId);
  let remainingCash = Math.max(0, Number(state.cash) || 0);
  const candidates = [];
  for (let i = 0; i < depot.managers.length; i += 1) {
    if (depotState.managers[i]) continue;
    if ((depotState.owned[i] || 0) <= 0) continue;
    const mgr = depot.managers[i];
    if (!mgr) continue;
    const cost = (mgr.cost || 0) * priceMult;
    if (cost <= remainingCash) {
      candidates.push({ index: i, manager: mgr, cost });
    }
  }
  candidates.sort((a, b) => a.cost - b.cost);
  const affordable = [];
  for (const c of candidates) {
    if (c.cost <= remainingCash) {
      remainingCash -= c.cost;
      affordable.push(c);
    }
  }
  return affordable;
}

export function buyAllAffordableManagers(state, depotId) {
  const list = getAffordableManagers(state, depotId);
  let cur = state;
  let totalCost = 0;
  for (const item of list) {
    cur = buyManager(cur, depotId, item.index);
    totalCost += item.cost;
  }
  return { state: cur, hiredCount: list.length, totalCost };
}

export function buyCashUpgrade(state, depotId, upgradeId) {
  const depot = getDepot(depotId);
  const depotState = state.depots[depotId];
  if (!depotState) return state;
  const up = depot.cashUpgrades.find((u) => u.id === upgradeId);
  if (!up) return state;
  if ((depotState.upgrades || []).includes(upgradeId)) return state;
  const priceMult = depotPriceMult(depotId);
  const cost = up.cost * priceMult;
  const cash = Math.max(0, Number(state.cash) || 0);
  if (cash < cost) return state;
  return {
    ...state,
    cash: cash - cost,
    depots: {
      ...state.depots,
      [depotId]: {
        ...depotState,
        upgrades: [...(depotState.upgrades || []), upgradeId],
      },
    },
  };
}

export function getAffordableCashUpgrades(state, depotId) {
  const depot = getDepot(depotId);
  const depotState = state?.depots?.[depotId];
  if (!depot || !depotState) return [];
  const priceMult = depotPriceMult(depotId);
  const ownedSet = new Set(depotState.upgrades || []);
  let remainingCash = Math.max(0, Number(state.cash) || 0);
  const candidates = [];
  for (const up of depot.cashUpgrades) {
    if (ownedSet.has(up.id)) continue;
    const cost = (up.cost || 0) * priceMult;
    if (cost <= remainingCash) {
      candidates.push({ upgrade: up, cost });
    }
  }
  candidates.sort((a, b) => a.cost - b.cost);
  const affordable = [];
  for (const c of candidates) {
    if (c.cost <= remainingCash) {
      remainingCash -= c.cost;
      affordable.push(c);
    }
  }
  return affordable;
}

export function buyAllAffordableCashUpgrades(state, depotId) {
  const list = getAffordableCashUpgrades(state, depotId);
  let cur = state;
  let totalCost = 0;
  for (const item of list) {
    cur = buyCashUpgrade(cur, depotId, item.upgrade.id);
    totalCost += item.cost;
  }
  return { state: cur, boughtCount: list.length, totalCost };
}

export function describeAngelUpgradeEffect(depot, up) {
  if (!up) return '';
  const parts = [];
  if (up.multiplier) {
    const target = up.business === 'all' || up.business == null
      ? 'All Fleet Profits'
      : `${depot?.businesses?.[up.business]?.name || 'Vehicle'} Profit`;
    parts.push(`${target} ×${up.multiplier}`);
  }
  if (up.speedMultiplier) {
    parts.push(`All Fleet Speed ×${up.speedMultiplier}`);
  }
  if (up.costDiscount) {
    parts.push(`Vehicle Costs −${Math.round(Number(up.costDiscount) * 100)}%`);
  }
  if (up.angelBonus) {
    parts.push(`+${(Number(up.angelBonus) * 100).toFixed(0)}% backer strength`);
  }
  if (up.autoManagerIndex != null) {
    const mgrName = depot?.managers?.[up.autoManagerIndex]?.name || 'Starter Manager';
    parts.push(`Auto-hires ${mgrName} on every reset`);
  }
  if (up.startingCashBonus) {
    parts.push(`+${formatMoney(up.startingCashBonus)} starter cash`);
  }
  if (up.flatOwned != null && typeof up.business === 'number') {
    parts.push(`+${up.flatOwned} ${depot?.businesses?.[up.business]?.name || 'vehicles'}`);
  }
  if (up.bonusOwned && typeof up.bonusOwned.index === 'number') {
    parts.push(`+${up.bonusOwned.qty} ${depot?.businesses?.[up.bonusOwned.index]?.name || 'vehicles'}`);
  }
  if (up.keepDepotUnlocked) {
    const targetDepot = DEPOTS.find((d) => d.id === up.keepDepotUnlocked);
    parts.push(`Permanently unlocks ${targetDepot ? targetDepot.name : up.keepDepotUnlocked}`);
  }
  return parts.join(' · ');
}

function applySingleAngelPerk(depot, depotState, up) {
  let cashBonus = 0;
  if (up.flatOwned != null && typeof up.business === 'number') {
    depotState.owned[up.business] = (depotState.owned[up.business] || 0) + up.flatOwned;
  }
  if (up.bonusOwned && typeof up.bonusOwned.index === 'number') {
    const idx = up.bonusOwned.index;
    depotState.owned[idx] = (depotState.owned[idx] || 0) + (Number(up.bonusOwned.qty) || 0);
  }
  if (up.autoManagerIndex != null) {
    const idx = Number(up.autoManagerIndex);
    if (idx >= 0 && idx < depot.businesses.length) {
      depotState.owned[idx] = Math.max(1, depotState.owned[idx] || 0);
      depotState.managers[idx] = true;
      depotState.running[idx] = true;
    }
  }
  if (up.startingCashBonus) {
    cashBonus += Number(up.startingCashBonus) || 0;
  }
  return cashBonus;
}

/** Spend shared backers on the active depot's angel shop. Returns full game state. */
export function buyAngelUpgrade(state, depotId, upgradeId) {
  const depot = getDepot(depotId);
  const depotState = state.depots[depotId];
  if (!depotState) return state;
  const up = depot.angelUpgrades.find((u) => u.id === upgradeId);
  if (!up) return state;
  if ((depotState.angelUpgrades || []).includes(upgradeId)) return state;
  if ((Number(state.angels) || 0) < up.cost) return state;
  const nextDepot = {
    ...depotState,
    angelUpgrades: [...(depotState.angelUpgrades || []), upgradeId],
    owned: [...depotState.owned],
    managers: [...depotState.managers],
    running: [...depotState.running],
  };
  const cashBonus = applySingleAngelPerk(depot, nextDepot, up);
  if (cashBonus > 0) {
    nextDepot.lifetimeEarnings = (Number(nextDepot.lifetimeEarnings) || 0) + cashBonus;
    nextDepot.sessionEarnings = (Number(nextDepot.sessionEarnings) || 0) + cashBonus;
  }
  return syncDepotUnlocks({
    ...state,
    cash: (Number(state.cash) || 0) + cashBonus,
    angels: (Number(state.angels) || 0) - up.cost,
    angelsSpent: (Number(state.angelsSpent) || 0) + up.cost,
    depots: {
      ...state.depots,
      [depotId]: nextDepot,
    },
  });
}

/**
 * Prestige: bank pending shared backers and reset ALL depot boards + shared wallet.
 * Lifetime on each depot is kept (account score / future backers). Backer upgrades stay.
 * Unlocked hubs remain accessible if their lifetime threshold or Operator Permit is met.
 */
export function claimBackers(state, depotId) {
  const focus = getDepot(depotId);
  if (!state.depots?.[depotId]) return state;
  const pending = pendingAngels(state);
  const depots = { ...state.depots };
  let totalStarterCashBonus = 0;
  for (const d of DEPOTS) {
    const prev = depots[d.id];
    if (!prev) continue;
    const next = emptyDepotState(d);
    next.lifetimeEarnings = Number(prev.lifetimeEarnings) || 0;
    next.angelUpgrades = [...(prev.angelUpgrades || [])];
    next.frenzyUntil = Math.max(0, Number(prev.frenzyUntil) || 0);
    next.underdogBoostUntil = Math.max(0, Number(prev.underdogBoostUntil) || 0);
    next.syndicatesCompleted = Math.max(0, Number(prev.syndicatesCompleted ?? state.syndicatesCompleted) || 0);
    next.unlocked = d.id === 'local';
    for (const id of next.angelUpgrades) {
      const up = d.angelUpgrades.find((u) => u.id === id);
      if (up) {
        totalStarterCashBonus += applySingleAngelPerk(d, next, up);
      }
    }
    depots[d.id] = next;
  }
  return syncDepotUnlocks({
    ...state,
    cash: Math.max(Number(focus.startingCash) || 0, 0.05) + totalStarterCashBonus,
    activeDepot: 'local',
    angels: (Number(state.angels) || 0) + pending,
    depots,
  });
}

/** @deprecated Use claimBackers(state, depotId) — kept name for older imports. */
export function resetDepot(depot, depotState) {
  const next = emptyDepotState(depot);
  next.lifetimeEarnings = depotState.lifetimeEarnings || 0;
  next.angelUpgrades = [...(depotState.angelUpgrades || [])];
  next.unlocked = true;
  for (const id of next.angelUpgrades) {
    const up = depot.angelUpgrades.find((u) => u.id === id);
    if (up) applySingleAngelPerk(depot, next, up);
  }
  return next;
}

export function syncDepotUnlocks(state) {
  const next = { ...state, depots: { ...state.depots } };
  // Unlock when either session or lifetime earnings reach the depot threshold, or via an Operator Permit.
  const localBest = Math.max(
    Number(next.depots.local?.sessionEarnings) || 0,
    Number(next.depots.local?.lifetimeEarnings) || 0,
  );
  const regionalBest = Math.max(
    Number(next.depots.regional?.sessionEarnings) || 0,
    Number(next.depots.regional?.lifetimeEarnings) || 0,
  );
  const hasPermit = (targetDepotId) => DEPOTS.some((d) => {
    const ownedIds = next.depots[d.id]?.angelUpgrades || [];
    return d.angelUpgrades.some(
      (u) => ownedIds.includes(u.id) && u.keepDepotUnlocked === targetDepotId,
    );
  });

  next.depots.local = { ...next.depots.local, unlocked: true };
  next.depots.regional = {
    ...next.depots.regional,
    unlocked:
      Boolean(next.depots.regional?.unlocked)
      || localBest >= DEPOTS[1].unlockCost
      || (Number(next.depots.regional?.lifetimeEarnings) || 0) > 0
      || hasPermit('regional'),
  };
  next.depots.national = {
    ...next.depots.national,
    unlocked:
      Boolean(next.depots.national?.unlocked)
      || regionalBest >= DEPOTS[2].unlockCost
      || (Number(next.depots.national?.lifetimeEarnings) || 0) > 0
      || hasPermit('national'),
  };
  // If user was viewing a now-locked depot, drop them back to Local.
  if (next.activeDepot !== 'local' && !next.depots[next.activeDepot]?.unlocked) {
    next.activeDepot = 'local';
  }
  return next;
}

export function totalRevenuePerSecond(depot, depotState, accountAngels = null) {
  const mult = computeMultipliers(depot, depotState, accountAngels);
  let sum = 0;
  for (let i = 0; i < depot.businesses.length; i += 1) {
    if (depotState.managers[i] && (depotState.owned[i] || 0) > 0) {
      sum += mult.perBusiness[i].revenuePerSecond;
    }
  }
  return sum;
}

export function nextUnlockAt(owned) {
  const milestones = [...SPEED_OWNED, ...STANDARD_PROFIT.map(([at]) => at)];
  return milestones.find((m) => owned < m) || null;
}

/** Next unlock milestone for a business (newspaper uses denser early steps). */
export function nextUnlockAtForBusiness(biz, owned) {
  const o = Math.max(0, Math.floor(Number(owned) || 0));
  if (biz?.newspaper) {
    const marks = [
      ...NEWSPAPER_UNLOCKS.map((u) => u.at),
      ...SPEED_OWNED,
      ...STANDARD_PROFIT.map(([at]) => at),
    ];
    const unique = [...new Set(marks)].sort((a, b) => a - b);
    return unique.find((m) => o < m) || null;
  }
  return nextUnlockAt(o);
}

/**
 * Detailed description of the next milestone for a specific business.
 */
export function nextUnlockInfoForBusiness(depot, biz, owned) {
  const o = Math.max(0, Math.floor(Number(owned) || 0));
  const at = nextUnlockAtForBusiness(biz, o);
  if (at == null) return null;
  const remaining = Math.max(1, at - o);

  if (biz?.newspaper) {
    const nu = NEWSPAPER_UNLOCKS.find((u) => u.at === at);
    if (nu) {
      if (nu.selfSpeed) {
        return {
          at,
          remaining,
          isSpeed: true,
          multiplier: nu.selfSpeed,
          effectLabel: `Speed ×${nu.selfSpeed}`,
        };
      }
      if (nu.target != null && nu.profit) {
        const targetBiz = depot?.businesses?.[nu.target];
        const targetName = targetBiz ? targetBiz.name : `Fleet #${nu.target + 1}`;
        return {
          at,
          remaining,
          isSpeed: false,
          multiplier: nu.profit,
          targetName,
          effectLabel: `${targetName} ×${nu.profit}`,
        };
      }
    }
  }

  if (SPEED_OWNED.includes(at)) {
    return {
      at,
      remaining,
      isSpeed: true,
      multiplier: 2,
      effectLabel: 'Speed ×2',
    };
  }
  const std = STANDARD_PROFIT.find(([m]) => m === at);
  if (std) {
    return {
      at,
      remaining,
      isSpeed: false,
      multiplier: std[1],
      effectLabel: `Profit ×${std[1]}`,
    };
  }
  return {
    at,
    remaining,
    isSpeed: false,
    multiplier: 2,
    effectLabel: 'Bonus unlock',
  };
}

/**
 * Next all-fleet global unlock (based on minimum owned across all businesses in depot).
 */
export function nextGlobalUnlockInfo(depot, ownedArr = []) {
  const n = depot?.businesses?.length || 0;
  const padded = padArray(ownedArr, n, 0).map((x) => Math.max(0, Math.floor(Number(x) || 0)));
  const currentMin = padded.length ? Math.min(...padded) : 0;
  const next = GLOBAL_UNLOCKS.find((u) => currentMin < u.at);
  if (!next) return null;
  return {
    at: next.at,
    currentMin,
    remaining: Math.max(1, next.at - currentMin),
    isSpeed: Boolean(next.speed),
    multiplier: next.speed || next.profit || 2,
    effectLabel: next.speed ? `All Fleet Speed ×${next.speed}` : `All Fleet Profit ×${next.profit}`,
  };
}

/**
 * Full Milestone & Synergy Roadmap for the Milestone Inspector Modal.
 */
export function getMilestoneRoadmap(depot, depotState) {
  if (!depot || !depotState) return null;
  const n = depot.businesses.length;
  const ownedArr = padArray(depotState.owned, n, 0).map((x) => Math.max(0, Math.floor(Number(x) || 0)));
  const currentMin = n > 0 ? Math.min(...ownedArr) : 0;
  const bottleneckBiz = depot.businesses
    .map((b, i) => ({ name: b.name, owned: ownedArr[i], index: i }))
    .filter((x) => x.owned === currentMin);

  const globalUpcoming = GLOBAL_UNLOCKS
    .filter((u) => u.at > currentMin)
    .slice(0, 6)
    .map((u) => ({
      at: u.at,
      remaining: Math.max(1, u.at - currentMin),
      isSpeed: Boolean(u.speed),
      effectLabel: u.speed ? `All Fleet Speed ×${u.speed}` : `All Fleet Profit ×${u.profit}`,
    }));

  const globalUnlockedCount = GLOBAL_UNLOCKS.filter((u) => currentMin >= u.at).length;

  const newsIdx = depot.businesses.findIndex((b) => b.newspaper);
  const newsBiz = newsIdx >= 0 ? depot.businesses[newsIdx] : null;
  const newsOwned = newsIdx >= 0 ? ownedArr[newsIdx] : 0;
  const newspaperSynergies = newsBiz
    ? NEWSPAPER_UNLOCKS.filter((u) => u.target != null && u.target < n).map((u) => {
        const targetBiz = depot.businesses[u.target];
        return {
          at: u.at,
          unlocked: newsOwned >= u.at,
          remaining: Math.max(0, u.at - newsOwned),
          targetIndex: u.target,
          targetName: targetBiz ? targetBiz.name : `Vehicle #${u.target + 1}`,
          multiplier: u.profit,
          effectLabel: `${targetBiz ? targetBiz.name : 'Vehicle'} Profit ×${u.profit}`,
        };
      })
    : [];

  const perBusiness = depot.businesses.map((biz, i) => {
    const o = ownedArr[i];
    const upcoming = [];
    let probe = o;
    for (let step = 0; step < 4; step += 1) {
      const info = nextUnlockInfoForBusiness(depot, biz, probe);
      if (!info) break;
      upcoming.push({
        ...info,
        remainingFromNow: Math.max(1, info.at - o),
      });
      probe = info.at;
    }
    return {
      index: i,
      biz,
      owned: o,
      upcoming,
    };
  });

  return {
    currentMin,
    bottleneckBiz,
    globalUpcoming,
    globalUnlockedCount,
    newsBiz,
    newsOwned,
    newspaperSynergies,
    perBusiness,
  };
}

/**
 * Smart Fleet Helper: identifies the vehicle with the highest £/sec per £ spent (Best ROI)
 * and the vehicle with the lowest cost to hit its next milestone (Closest Milestone).
 */
export function computeFleetRecommendations(depot, depotState, cash = 0, accountAngels = 0) {
  if (!depot || !depotState) {
    return { bestRoiIndex: -1, closestMilestoneIndex: -1, closestMilestoneCost: 0 };
  }
  const mult = computeMultipliers(depot, depotState, accountAngels);
  let bestRoiIndex = -1;
  let bestRoiScore = -1;
  let closestMilestoneIndex = -1;
  let closestMilestoneCost = Infinity;

  const wallet = Math.max(0, Number(cash) || 0);

  for (let i = 0; i < depot.businesses.length; i += 1) {
    const biz = depot.businesses[i];
    const owned = depotState.owned[i] || 0;
    const costMult = getBusinessCostMultiplier(depot, depotState, i);
    const stats = mult.perBusiness[i];
    const cost1 = buyCost(biz.baseCost, biz.coefficient, owned, 1) * costMult;
    const unitRps = stats.time > 0 ? stats.revenuePerUnit / stats.time : 0;

    // Prefer vehicles within reach (affordable or within 25× current wallet, or index 0)
    const reachable = wallet <= 0 ? i === 0 : cost1 <= Math.max(wallet * 25, 50);
    if (cost1 > 0 && unitRps > 0 && reachable) {
      const roi = unitRps / cost1;
      if (roi > bestRoiScore) {
        bestRoiScore = roi;
        bestRoiIndex = i;
      }
    }

    if (owned > 0) {
      const nextAt = nextUnlockAtForBusiness(biz, owned);
      if (nextAt != null && nextAt > owned) {
        const qtyToNext = nextAt - owned;
        const mCost = buyCost(biz.baseCost, biz.coefficient, owned, qtyToNext) * costMult;
        if (mCost > 0 && mCost < closestMilestoneCost) {
          closestMilestoneCost = mCost;
          closestMilestoneIndex = i;
        }
      }
    }
  }

  return {
    bestRoiIndex,
    closestMilestoneIndex,
    closestMilestoneCost: Number.isFinite(closestMilestoneCost) ? closestMilestoneCost : 0,
  };
}

export const DEFAULT_EVENTS = [
  {
    id: 'cup-final',
    title: '⚽ Wembley Cup Final Express',
    subtitle: 'Supporters club needs emergency coaches to the stadium!',
    category: 'positive',
    kind: 'cash',
    secondsOfRps: 45,
    weight: 20,
    reactionSec: 18,
    actionLabel: 'Accept Charter',
    spawnForFirstPlace: true,
    enabled: true,
  },
  {
    id: 'rail-strike',
    title: '🚆 Urgent Rail Replacement Surge',
    subtitle: 'Signal failure on the mainline — all depots on double-time!',
    category: 'positive',
    kind: 'frenzy',
    durationSec: 60,
    speedMultiplier: 2,
    weight: 15,
    reactionSec: 18,
    actionLabel: 'Accept Charter',
    spawnForFirstPlace: true,
    enabled: true,
  },
  {
    id: 'festival-shuttle',
    title: '🎪 Festival VIP Mud Rescue',
    subtitle: 'Headliner tour manager paying instant cash premium for pickup!',
    category: 'positive',
    kind: 'cash',
    secondsOfRps: 60,
    weight: 15,
    reactionSec: 18,
    actionLabel: 'Accept Charter',
    spawnForFirstPlace: false,
    enabled: true,
  },
  {
    id: 'airport-divert',
    title: '✈️ Diverted Flights Emergency',
    subtitle: 'Three jumbo jets landed at the wrong terminal — full speed dispatch!',
    category: 'positive',
    kind: 'frenzy',
    durationSec: 60,
    speedMultiplier: 2,
    weight: 15,
    reactionSec: 18,
    actionLabel: 'Accept Charter',
    spawnForFirstPlace: true,
    enabled: true,
  },
  {
    id: 'dealer-surplus',
    title: '🚌 Manufacturer Fleet Clearance',
    subtitle: 'Coachbuilder cancelled an export order — free vehicles for your yard!',
    category: 'positive',
    kind: 'fleet',
    minQty: 2,
    maxQty: 4,
    weight: 10,
    reactionSec: 18,
    actionLabel: 'Claim Vehicles',
    spawnForFirstPlace: false,
    enabled: true,
  },
  {
    id: 'angel-roadshow',
    title: '💼 Angel Syndicate Capital Grant',
    subtitle: 'Private equity investors offering instant cash injection to accelerate growth!',
    category: 'positive',
    kind: 'cash',
    secondsOfRps: 90,
    weight: 10,
    reactionSec: 18,
    actionLabel: 'Accept Grant',
    spawnForFirstPlace: false,
    enabled: true,
  },
  // --- NEGATIVE EVENTS (INCIDENTS / CRISES) ---
  {
    id: 'motorway-breakdown',
    title: '🚨 M1 Motorway Axle Failure',
    subtitle: 'Emergency! A flagship coach threw a drive axle on the M1! Dispatch recovery fitters before police tow it!',
    category: 'negative',
    kind: 'penalty_breakdown',
    reactionSec: 15,
    actionLabel: '🔧 Dispatch Recovery Fitter',
    penaltyLabel: '0.5× Fleet Speed for 60s',
    penaltyDurationSec: 60,
    penaltySpeedMult: 0.5,
    weight: 16,
    spawnForFirstPlace: true,
    enabled: true,
  },
  {
    id: 'dvsa-audit',
    title: '📋 Surprise DVSA Roadside Inspection',
    subtitle: 'Enforcement officers pulled a coach into a weighbridge! Present maintenance walkaround logs immediately!',
    category: 'negative',
    kind: 'penalty_fine',
    reactionSec: 15,
    actionLabel: '📑 Present Walkaround Logs',
    penaltyLabel: 'DVSA Fine: 30s revenue',
    secondsOfRps: 30,
    cashPercent: 0.05,
    weight: 15,
    spawnForFirstPlace: true,
    enabled: true,
  },
  {
    id: 'depot-fuel-spill',
    title: '⛽ Depot Fuel Spill Hazard',
    subtitle: 'Bulk fuel bowser valve sprang a leak on the yard apron! Deploy environmental cleanup crew before EPA fines!',
    category: 'negative',
    kind: 'penalty_fine',
    reactionSec: 13,
    actionLabel: '🧯 Deploy Spill Kit',
    penaltyLabel: 'EPA Cleanup Fee: 45s revenue',
    secondsOfRps: 45,
    cashPercent: 0.08,
    weight: 12,
    spawnForFirstPlace: true,
    enabled: true,
  },
  {
    id: 'driver-sickout',
    title: '⚠️ Morning Peak Driver Shortage',
    subtitle: 'Multiple drivers called in sick during school run peak! Authorize emergency agency drivers before routes stall!',
    category: 'negative',
    kind: 'penalty_breakdown',
    reactionSec: 14,
    actionLabel: '📞 Authorize Agency Drivers',
    penaltyLabel: '0.5× Fleet Speed for 45s',
    penaltyDurationSec: 45,
    penaltySpeedMult: 0.5,
    weight: 14,
    spawnForFirstPlace: true,
    enabled: true,
  },
  {
    id: 'tachograph-warning',
    title: '⏱️ Tachograph Compliance Alert',
    subtitle: 'Traffic Commissioner automated audit flagged an unexplained card breach! Sign off digital rectification!',
    category: 'negative',
    kind: 'penalty_fine',
    reactionSec: 15,
    actionLabel: '✍️ Sign Off Rectification',
    penaltyLabel: 'Regulatory Fine: 25s revenue',
    secondsOfRps: 25,
    cashPercent: 0.04,
    weight: 12,
    spawnForFirstPlace: true,
    enabled: true,
  },
];

export const VIP_CHARTER_TEMPLATES = DEFAULT_EVENTS.filter((e) => e.category === 'positive');

export function rollEventOffer(state, depot, accountAngels = 0, options = {}) {
  if (!state || !depot) return null;
  const isFirstPlace = Boolean(options.isFirstPlace);
  const catalog = Array.isArray(options.customEvents) && options.customEvents.length > 0
    ? options.customEvents
    : DEFAULT_EVENTS;

  const eligible = catalog.filter((e) => {
    if (e.enabled === false) return false;
    if (isFirstPlace && e.spawnForFirstPlace === false) return false;
    return true;
  });

  if (eligible.length === 0) return null;

  const totalWeight = eligible.reduce((acc, e) => acc + Math.max(1, Number(e.weight) || 10), 0);
  let roll = Math.random() * totalWeight;
  let selected = eligible[0];
  for (const e of eligible) {
    const w = Math.max(1, Number(e.weight) || 10);
    if (roll < w) {
      selected = e;
      break;
    }
    roll -= w;
  }

  const depotState = state.depots?.[depot.id];
  if (!depotState) return null;

  let totalAccountRps = 0;
  for (const d of DEPOTS) {
    const ds = state.depots?.[d.id];
    if (ds?.unlocked) {
      totalAccountRps += totalRevenuePerSecond(d, ds, accountAngels);
    }
  }
  const cashWallet = Math.max(0, Number(state.cash) || 0);
  const reactionSec = Math.max(5, Number(selected.reactionSec) || 15);
  const expiresAt = Date.now() + (reactionSec * 1000);

  if (selected.category === 'negative') {
    let fineAmount = 0;
    if (selected.kind === 'penalty_fine') {
      fineAmount = Math.max(
        250,
        totalAccountRps * (Number(selected.secondsOfRps) || 30),
        cashWallet * (Number(selected.cashPercent) || 0.05),
      );
    }
    const penaltyDurationSec = Math.max(10, Number(selected.penaltyDurationSec || selected.durationSec) || 60);
    const penaltySpeedMult = Number(selected.penaltySpeedMult || selected.speedMultiplier) || 0.5;

    const penaltyLabel = selected.kind === 'penalty_fine'
      ? `Fine of ${formatMoney(fineAmount)}`
      : `${penaltySpeedMult}× All-Fleet Speed for ${penaltyDurationSec}s`;

    return {
      ...selected,
      category: 'negative',
      fineAmount,
      penaltyDurationSec,
      penaltySpeedMult,
      penaltyLabel,
      reactionSec,
      actionLabel: selected.actionLabel || 'Resolve Incident',
      expiresAt,
    };
  }

  // Positive events
  if (selected.kind === 'frenzy') {
    const durationSec = Math.max(10, Number(selected.durationSec) || 60);
    const speedMult = Number(selected.speedMultiplier) || 2;
    return {
      ...selected,
      category: 'positive',
      durationSec,
      speedMultiplier: speedMult,
      reactionSec,
      rewardLabel: `🔥 ${speedMult}× All-Fleet Speed for ${durationSec}s`,
      actionLabel: selected.actionLabel || 'Accept Charter',
      expiresAt,
    };
  }

  if (selected.kind === 'fleet') {
    const ownedIndices = depot.businesses
      .map((_, i) => i)
      .filter((i) => (depotState.owned[i] || 0) > 0);
    const targetIndex = ownedIndices.length > 0
      ? ownedIndices[Math.floor(Math.random() * ownedIndices.length)]
      : 0;
    const biz = depot.businesses[targetIndex];
    const owned = depotState.owned[targetIndex] || 0;
    const toNext = nextUnlockQty(biz, owned);
    const qty = Math.min(selected.maxQty || 4, Math.max(selected.minQty || 2, toNext <= 5 ? toNext : 3));
    return {
      ...selected,
      category: 'positive',
      targetIndex,
      qty,
      reactionSec,
      rewardLabel: `🎁 +${qty} Free ${biz.name}`,
      actionLabel: selected.actionLabel || 'Claim Vehicles',
      expiresAt,
    };
  }

  // Cash positive event
  const payout = Math.max(
    500,
    totalAccountRps * (Number(selected.secondsOfRps) || 45),
    cashWallet * 0.25 + 500,
  );
  return {
    ...selected,
    category: 'positive',
    payout,
    reactionSec,
    rewardLabel: `💷 +${formatMoney(payout)} Payout`,
    actionLabel: selected.actionLabel || 'Accept Charter',
    expiresAt,
  };
}

export function rollVipCharterOffer(state, depot, accountAngels = 0, options = {}) {
  return rollEventOffer(state, depot, accountAngels, options);
}

export function resolveEventAction(state, event, now = Date.now()) {
  if (!state || !event) return { state, toastMessage: '' };
  if (event.category === 'negative') {
    return {
      state,
      toastMessage: `✅ Averted! ${event.title} resolved in time with zero penalties.`,
      resolved: true,
    };
  }
  return claimVipCharterReward(state, event, now);
}

export function applyNegativeEventPenalty(state, event, now = Date.now()) {
  if (!state || !event) return { state, toastMessage: '' };

  if (event.kind === 'penalty_fine') {
    const fine = Math.max(0, Number(event.fineAmount) || 500);
    const nextCash = Math.max(0, (Number(state.cash) || 0) - fine);
    return {
      state: {
        ...state,
        cash: nextCash,
      },
      toastMessage: `💥 Incident Unresolved! ${event.title}: -${formatMoney(fine)} fine deducted.`,
      penaltyApplied: true,
      fineDeducted: fine,
    };
  }

  if (event.kind === 'penalty_breakdown') {
    const durationMs = (Number(event.penaltyDurationSec) || 60) * 1000;
    const activeDepotId = state.activeDepot || 'local';
    const breakdownUntil = Math.max(now, Number(state.depots?.[activeDepotId]?.breakdownUntil) || 0) + durationMs;
    const breakdownSpeedMult = Number(event.penaltySpeedMult) || 0.5;

    const depots = { ...state.depots };
    for (const d of DEPOTS) {
      if (!depots[d.id]) continue;
      depots[d.id] = {
        ...depots[d.id],
        breakdownUntil,
        breakdownSpeedMult,
      };
    }

    return {
      state: {
        ...state,
        depots,
      },
      toastMessage: `💥 Breakdown Unresolved! ${event.title}: All depots operating at ${Math.round(breakdownSpeedMult * 100)}% speed for ${event.penaltyDurationSec || 60}s!`,
      penaltyApplied: true,
    };
  }

  return { state, toastMessage: '' };
}

export function claimVipCharterReward(state, charter, now = Date.now()) {
  if (!state || !charter) return { state, toastMessage: '' };
  const depotId = state.activeDepot || 'local';
  const depot = getDepot(depotId);
  const depotState = state.depots?.[depotId];
  if (!depot || !depotState) return { state, toastMessage: '' };

  if (charter.kind === 'frenzy') {
    const durationMs = (Number(charter.durationSec) || 60) * 1000;
    const speedMultiplier = Number(charter.speedMultiplier) || 2;
    const frenzyUntil = Math.max(now, Number(depotState.frenzyUntil) || 0) + durationMs;
    const signingFee = Math.max(100, totalRevenuePerSecond(depot, depotState, state.angels) * 2);
    const depots = { ...state.depots };
    for (const d of DEPOTS) {
      if (!depots[d.id]) continue;
      depots[d.id] = {
        ...depots[d.id],
        frenzyUntil,
        frenzySpeedMult: speedMultiplier,
        ...(d.id === depotId
          ? {
              lifetimeEarnings: (Number(depots[d.id].lifetimeEarnings) || 0) + signingFee,
              sessionEarnings: (Number(depots[d.id].sessionEarnings) || 0) + signingFee,
            }
          : {}),
      };
    }
    return {
      state: syncDepotUnlocks({
        ...state,
        cash: (Number(state.cash) || 0) + signingFee,
        depots,
      }),
      toastMessage: `🔥 Overdrive Frenzy! ${speedMultiplier}× All-Fleet Speed for ${charter.durationSec || 60}s!`,
    };
  }

  if (charter.kind === 'fleet') {
    const idx = Number.isInteger(charter.targetIndex) ? charter.targetIndex : 0;
    const qty = Math.max(1, Number(charter.qty) || 2);
    const prevOwned = [...(depotState.owned || [])];
    const nextOwned = [...prevOwned];
    nextOwned[idx] = (nextOwned[idx] || 0) + qty;
    const signingFee = Math.max(100, totalRevenuePerSecond(depot, depotState, state.angels) * 2);
    const bizName = depot.businesses[idx]?.name || 'Vehicles';
    return {
      state: syncDepotUnlocks({
        ...state,
        cash: (Number(state.cash) || 0) + signingFee,
        depots: {
          ...state.depots,
          [depotId]: {
            ...depotState,
            owned: nextOwned,
            lifetimeEarnings: (Number(depotState.lifetimeEarnings) || 0) + signingFee,
            sessionEarnings: (Number(depotState.sessionEarnings) || 0) + signingFee,
          },
        },
      }),
      prevOwned,
      nextOwned,
      targetIndex: idx,
      toastMessage: `🎁 Charter Delivery: +${qty} Free ${bizName}!`,
    };
  }

  const payout = Math.max(500, Number(charter.payout) || 500);
  return {
    state: syncDepotUnlocks({
      ...state,
      cash: (Number(state.cash) || 0) + payout,
      depots: {
        ...state.depots,
        [depotId]: {
          ...depotState,
          lifetimeEarnings: (Number(depotState.lifetimeEarnings) || 0) + payout,
          sessionEarnings: (Number(depotState.sessionEarnings) || 0) + payout,
        },
      },
    }),
    toastMessage: `💷 ${charter.title} · +${formatMoney(payout)}!`,
  };
}

export const UNDERDOG_GRANT_TEMPLATES = [
  {
    id: 'challenger-subsidy',
    title: '🚀 Challenger Dispatch Subsidy!',
    subtitle: 'Transport commissioners are backing the chasing pack to shake up the leaderboard!',
  },
  {
    id: 'slipstream-contract',
    title: '⚡ Underdog National Tour Contract!',
    subtitle: 'Corporate sponsors are offering triple fare payouts to help you close the gap on #1!',
  },
  {
    id: 'catchup-surge',
    title: '🔥 Rival Slipstream Surge!',
    subtitle: 'High-demand routes diverted to your yards — earn 3× profits across all depots!',
  },
];

export function rollUnderdogGrantOffer(leaderName = 'the #1 Boss', currentRank = null) {
  const tpl = UNDERDOG_GRANT_TEMPLATES[Math.floor(Math.random() * UNDERDOG_GRANT_TEMPLATES.length)];
  const rankTag = currentRank && currentRank > 1 ? ` (You are #${currentRank})` : '';
  return {
    ...tpl,
    leaderName: leaderName || 'the #1 Boss',
    rankTag,
    durationSec: 300,
    multiplier: 3,
    rewardLabel: '🚀 3× All-Fleet Profits for 5 Minutes',
    expiresAt: Date.now() + 25_000,
  };
}

export function claimUnderdogBoost(state, durationSec = 300, now = Date.now()) {
  if (!state) return { state, toastMessage: '' };
  const depotId = state.activeDepot || 'local';
  const depot = getDepot(depotId);
  const depotState = state.depots?.[depotId];
  if (!depot || !depotState) return { state, toastMessage: '' };

  const durationMs = Math.max(60, Number(durationSec) || 300) * 1000;
  const underdogBoostUntil = Math.max(now, Number(depotState.underdogBoostUntil) || 0) + durationMs;
  const signingFee = Math.max(250, totalRevenuePerSecond(depot, depotState, state.angels) * 3);
  const depots = { ...state.depots };
  for (const d of DEPOTS) {
    if (!depots[d.id]) continue;
    depots[d.id] = {
      ...depots[d.id],
      underdogBoostUntil,
      ...(d.id === depotId
        ? {
            lifetimeEarnings: (Number(depots[d.id].lifetimeEarnings) || 0) + signingFee,
            sessionEarnings: (Number(depots[d.id].sessionEarnings) || 0) + signingFee,
          }
        : {}),
    };
  }
  return {
    state: syncDepotUnlocks({
      ...state,
      cash: (Number(state.cash) || 0) + signingFee,
      depots,
    }),
    toastMessage: '🚀 Underdog Boost Activated! 3× All-Fleet Profits for 5 Minutes!',
  };
}

/**
 * Detect any business or global milestones crossed between prevOwnedArr and nextOwnedArr.
 */
export function detectCrossedMilestones(depot, prevOwnedArr = [], nextOwnedArr = []) {
  if (!depot?.businesses) return [];
  const events = [];
  const n = depot.businesses.length;
  for (let i = 0; i < n; i += 1) {
    const prev = Math.max(0, Math.floor(Number(prevOwnedArr[i]) || 0));
    const next = Math.max(0, Math.floor(Number(nextOwnedArr[i]) || 0));
    if (next <= prev) continue;
    const biz = depot.businesses[i];
    let probe = prev;
    while (probe < next) {
      const info = nextUnlockInfoForBusiness(depot, biz, probe);
      if (!info || info.at > next) break;
      events.push({
        type: 'business',
        businessIndex: i,
        businessName: biz.name,
        at: info.at,
        effectLabel: info.effectLabel,
      });
      probe = info.at;
    }
  }
  const prevMin = n > 0 ? Math.min(...padArray(prevOwnedArr, n, 0).map((x) => Math.max(0, Number(x) || 0))) : 0;
  const nextMin = n > 0 ? Math.min(...padArray(nextOwnedArr, n, 0).map((x) => Math.max(0, Number(x) || 0))) : 0;
  if (nextMin > prevMin) {
    for (const gu of GLOBAL_UNLOCKS) {
      if (gu.at > prevMin && gu.at <= nextMin) {
        events.push({
          type: 'global',
          businessIndex: -1,
          businessName: 'All Fleet',
          at: gu.at,
          effectLabel: gu.speed ? `All Fleet Speed ×${gu.speed}` : `All Fleet Profit ×${gu.profit}`,
        });
      }
    }
  }
  return events;
}

/**
 * Prestige helper: calculates profit multiplier gain and whether claiming backers is recommended.
 */
export function computePrestigePreview(state, angelRate = 0.02) {
  const pending = pendingAngels(state);
  const currentAngels = Math.max(0, Number(state?.angels) || 0);
  const spentAngels = Math.max(0, Number(state?.angelsSpent) || 0);
  const claimedTotal = currentAngels + spentAngels;
  const rate = Number(angelRate) > 0 ? Number(angelRate) : 0.02;
  const currentMult = 1 + currentAngels * rate;
  const afterMult = 1 + (currentAngels + pending) * rate;
  const multRatio = currentMult > 0 ? afterMult / currentMult : 1;
  const profitGainPct = Math.max(0, (multRatio - 1) * 100);
  const recommended = pending > 0 && (
    (currentAngels === 0 && pending >= 5)
    || (currentAngels > 0 && profitGainPct >= 50)
  );
  return {
    pending,
    currentAngels,
    claimedTotal,
    currentMult,
    afterMult,
    multRatio,
    profitGainPct,
    recommended,
  };
}

const SOUND_MUTE_KEY = 'coach-capitalist-mute';
let sharedAudioCtx = null;

export function isCoachCapSoundMuted() {
  try {
    return localStorage.getItem(SOUND_MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setCoachCapSoundMuted(muted) {
  try {
    localStorage.setItem(SOUND_MUTE_KEY, muted ? '1' : '0');
  } catch {
    /* ignore */
  }
}

export function playCoachCapSfx(kind = 'buy') {
  if (typeof window === 'undefined' || isCoachCapSoundMuted()) return;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    if (!sharedAudioCtx) sharedAudioCtx = new AudioCtx();
    if (sharedAudioCtx.state === 'suspended') sharedAudioCtx.resume();
    const ctx = sharedAudioCtx;
    const now = ctx.currentTime;

    const tone = (freq, startOffset, duration, type = 'triangle', gainPeak = 0.08, endFreq = null) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now + startOffset);
      if (endFreq) {
        osc.frequency.exponentialRampToValueAtTime(endFreq, now + startOffset + duration);
      }
      gain.gain.setValueAtTime(0.0001, now + startOffset);
      gain.gain.exponentialRampToValueAtTime(gainPeak, now + startOffset + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + startOffset + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + startOffset);
      osc.stop(now + startOffset + duration + 0.01);
    };

    if (kind === 'buy') {
      tone(587.33, 0, 0.07, 'triangle', 0.07, 783.99);
      tone(880, 0.04, 0.09, 'sine', 0.06);
    } else if (kind === 'run') {
      tone(330, 0, 0.06, 'sine', 0.05, 440);
    } else if (kind === 'upgrade') {
      tone(523.25, 0, 0.08, 'triangle', 0.08);
      tone(659.25, 0.06, 0.08, 'triangle', 0.08);
      tone(1046.5, 0.12, 0.16, 'sine', 0.09);
    } else if (kind === 'manager') {
      tone(392, 0, 0.09, 'sawtooth', 0.05);
      tone(523.25, 0.07, 0.09, 'triangle', 0.07);
      tone(783.99, 0.14, 0.18, 'triangle', 0.08);
    } else if (kind === 'milestone') {
      tone(523.25, 0, 0.09, 'triangle', 0.09);
      tone(659.25, 0.07, 0.09, 'triangle', 0.09);
      tone(783.99, 0.14, 0.09, 'triangle', 0.09);
      tone(1046.5, 0.21, 0.24, 'sine', 0.11);
    } else if (kind === 'prestige') {
      tone(440, 0, 0.12, 'triangle', 0.09);
      tone(554.37, 0.09, 0.12, 'triangle', 0.09);
      tone(659.25, 0.18, 0.12, 'triangle', 0.09);
      tone(880, 0.27, 0.32, 'sine', 0.12);
    } else if (kind === 'charter_alert') {
      tone(659.25, 0, 0.1, 'triangle', 0.08);
      tone(880, 0.09, 0.14, 'triangle', 0.09);
      tone(659.25, 0.22, 0.1, 'triangle', 0.08);
      tone(1046.5, 0.31, 0.22, 'sine', 0.1);
    } else if (kind === 'charter_claim') {
      tone(523.25, 0, 0.08, 'triangle', 0.09);
      tone(659.25, 0.06, 0.08, 'triangle', 0.09);
      tone(783.99, 0.12, 0.08, 'triangle', 0.09);
      tone(1046.5, 0.18, 0.12, 'triangle', 0.1);
      tone(1318.5, 0.26, 0.28, 'sine', 0.12);
    } else if (kind === 'crisis_alert') {
      tone(880, 0, 0.12, 'sawtooth', 0.1, 440);
      tone(880, 0.14, 0.12, 'sawtooth', 0.1, 440);
    } else if (kind === 'crisis_penalty') {
      tone(220, 0, 0.22, 'sawtooth', 0.12, 110);
      tone(165, 0.15, 0.25, 'sawtooth', 0.12, 82.4);
    }
  } catch {
    /* ignore audio errors */
  }
}

