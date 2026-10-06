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
  { id: 'angel-all-0', cost: 10_000, business: 'all', multiplier: 3, name: 'Backer Boost' },
  { id: 'angel-eff-0', cost: 100_000, angelBonus: 0.02, name: 'Pitch Deck Polish' },
  { id: 'angel-news-0', cost: 25_000_000, business: 1, flatOwned: 10, name: 'Minibus Angels +10' },
  { id: 'angel-all-1', cost: 100_000_000, angelBonus: 0.02, name: 'Series A Charm' },
  { id: 'angel-all-2', cost: 1_000_000_000, business: 'all', multiplier: 5, name: 'Series B Fleet' },
  { id: 'angel-all-3', cost: 100_000_000_000, business: 'all', multiplier: 9, name: 'Unicorn Hire' },
  { id: 'angel-all-4', cost: 1_000_000_000_000, business: 'all', multiplier: 11, name: 'IPO Ready' },
];

export const DEPOTS = [
  {
    id: 'local',
    name: 'Local Depot',
    blurb: 'Yard out the back of a pub — start with a used Transit.',
    unlockCost: 0,
    angelDivisor: 1e15,
    angelScale: 150,
    startingCash: 0,
    freeFirstBusiness: true,
    businesses: [
      { id: 'used-transit', name: 'Used Ford Transit Minibus', baseCost: 3.738, coefficient: 1.07, baseTime: 0.6, baseRevenue: 1, colour: '#f59e0b' },
      { id: 'new-minibus', name: 'Brand New Minibus', baseCost: 60, coefficient: 1.15, baseTime: 3, baseRevenue: 60, colour: '#38bdf8', newspaper: true },
      { id: 'seat16', name: '16-Seat Coach', baseCost: 720, coefficient: 1.14, baseTime: 6, baseRevenue: 540, colour: '#34d399' },
      { id: 'midi', name: 'Midicoach', baseCost: 8640, coefficient: 1.13, baseTime: 12, baseRevenue: 4320, colour: '#a78bfa' },
      { id: 'fullsize', name: 'Full-Size Single-Decker', baseCost: 103680, coefficient: 1.12, baseTime: 24, baseRevenue: 51840, colour: '#fb7185' },
      { id: 'double', name: 'Double-Decker Fleet', baseCost: 1244160, coefficient: 1.11, baseTime: 96, baseRevenue: 622080, colour: '#f472b6' },
      { id: 'executive', name: 'Executive / VIP Coaches', baseCost: 14929920, coefficient: 1.10, baseTime: 384, baseRevenue: 7464960, colour: '#eab308' },
      { id: 'school', name: 'School & Contract Fleet', baseCost: 179159040, coefficient: 1.09, baseTime: 1536, baseRevenue: 89579520, colour: '#22d3ee' },
      { id: 'national', name: 'National Express Routes', baseCost: 2149908480, coefficient: 1.08, baseTime: 6144, baseRevenue: 1074954240, colour: '#818cf8' },
      { id: 'mega', name: 'Mega Coach Empire', baseCost: 25798901760, coefficient: 1.07, baseTime: 36864, baseRevenue: 29668737024, colour: '#f97316' },
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
    unlockCost: 1e12, // unlock when local lifetime hits £1 trillion (soft gate via angels/progress)
    unlockHint: 'Earn £1 trillion lifetime at Local Depot',
    angelDivisor: 1e15,
    angelScale: 165,
    startingCash: 0,
    freeFirstBusiness: true,
    businesses: [
      { id: 'airport', name: 'Airport Shuttle', baseCost: 5, coefficient: 1.05, baseTime: 2, baseRevenue: 1, colour: '#94a3b8' },
      { id: 'parkride', name: 'Park & Ride Service', baseCost: 105, coefficient: 1.21, baseTime: 7, baseRevenue: 21, colour: '#38bdf8', newspaper: true },
      { id: 'wedding', name: 'Wedding & Events Fleet', baseCost: 2929, coefficient: 1.07, baseTime: 28, baseRevenue: 2001, colour: '#f9a8d4' },
      { id: 'touring', name: 'Touring Coach', baseCost: 42525, coefficient: 1.19, baseTime: 2, baseRevenue: 376, colour: '#4ade80' },
      { id: 'sleeper', name: 'Sleeper Coach', baseCost: 493025, coefficient: 1.09, baseTime: 45, baseRevenue: 98820, colour: '#c084fc' },
      { id: 'artic', name: 'Articulated Bus', baseCost: 18753525, coefficient: 1.15, baseTime: 180, baseRevenue: 1976400, colour: '#fb923c' },
      { id: 'suite', name: 'Luxury Touring Suite', baseCost: 393824025, coefficient: 1.13, baseTime: 600, baseRevenue: 32940000, colour: '#facc15' },
      { id: 'franchise', name: 'Multi-Depot Franchise', baseCost: 8270304525, coefficient: 1.17, baseTime: 3000, baseRevenue: 1152900000, colour: '#2dd4bf' },
      { id: 'crossborder', name: 'Cross-Border Express', baseCost: 173676395025, coefficient: 1.11, baseTime: 14400, baseRevenue: 11067840000, colour: '#60a5fa' },
      { id: 'continental', name: 'Continental Network', baseCost: 1e12, coefficient: 1.50, baseTime: 86400, baseRevenue: 332035200000, colour: '#f87171' },
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
    cashUpgrades: EARTH_CASH_UPGRADES.map((u, i) => ({
      ...u,
      id: `reg-${u.id}`,
      // Scale costs slightly differently for variety but keep structure
      cost: u.cost * (u.business === 'angel' ? 1 : 0.8),
      name: u.name,
    })),
    angelUpgrades: EARTH_ANGEL_UPGRADES.map((u) => ({ ...u, id: `reg-${u.id}` })),
  },
  {
    id: 'national',
    name: 'National Network',
    blurb: 'Boardrooms, terminals, and a logo on every motorway.',
    unlockCost: 1e18,
    unlockHint: 'Earn £1 quintillion lifetime at Regional Hub',
    angelDivisor: 1e14, // Mars uses 100B equivalent scale (wiki: 100 billion vs 400 billion)
    angelScale: 150,
    startingCash: 0.05,
    freeFirstBusiness: false,
    businesses: [
      { id: 'tickets', name: 'Ticket Booth', baseCost: 0.05, coefficient: 1.01, baseTime: 0.5, baseRevenue: 0.011, colour: '#a3e635' },
      { id: 'app', name: 'App Bookings', baseCost: 1, coefficient: 1.03, baseTime: 3, baseRevenue: 1, colour: '#38bdf8', newspaper: true },
      { id: 'drivers', name: 'Driver Agency', baseCost: 1234, coefficient: 1.05, baseTime: 9, baseRevenue: 4321, colour: '#fbbf24' },
      { id: 'workshop', name: 'Fleet Workshop', baseCost: 23000000, coefficient: 1.07, baseTime: 32, baseRevenue: 4007310, colour: '#fb7185' },
      { id: 'fuel', name: 'Fuel Depot', baseCost: 49000000000, coefficient: 1.11, baseTime: 64, baseRevenue: 518783295, colour: '#f97316' },
      { id: 'charter', name: 'Charter Contracts', baseCost: 77e12, coefficient: 1.04, baseTime: 4, baseRevenue: 500634321, colour: '#a78bfa' },
      { id: 'gov', name: 'Government Routes', baseCost: 5e15, coefficient: 1.07, baseTime: 18, baseRevenue: 7543177325, colour: '#2dd4bf' },
      { id: 'terminal', name: 'International Terminal', baseCost: 1e18, coefficient: 1.09, baseTime: 42, baseRevenue: 69263532485, colour: '#818cf8' },
      { id: 'global', name: 'Global Coach Conglomerate', baseCost: 13e24, coefficient: 1.25, baseTime: 43200, baseRevenue: 99e12, colour: '#f43f5e' },
    ],
    managers: [
      { name: 'Tina Tickets', cost: 100 },
      { name: 'Appy Anderson', cost: 5000 },
      { name: 'Dana Drivers', cost: 10000000 },
      { name: 'Wrench Wendy', cost: 1e9 },
      { name: 'Fuel Phil', cost: 400e9 },
      { name: 'Charter Charles', cost: 100e12 },
      { name: 'Gov Greta', cost: 15e15 },
      { name: 'Term Tom', cost: 10e18 },
      { name: 'Globe Gloria', cost: 200e24 },
    ],
    cashUpgrades: EARTH_CASH_UPGRADES.filter((u) => u.business === 'all' || u.business === 'angel' || (typeof u.business === 'number' && u.business < 9))
      .map((u) => ({
        ...u,
        id: `nat-${u.id}`,
        business: typeof u.business === 'number' ? Math.min(u.business, 8) : u.business,
        cost: u.cost * 0.5,
      })),
    angelUpgrades: EARTH_ANGEL_UPGRADES.map((u) => ({ ...u, id: `nat-${u.id}` })),
  },
];

export const STORAGE_KEY = 'coach-capitalist-v1';

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
    unlocked: depot.id === 'local',
  };
}

export function createInitialState() {
  const depots = {};
  for (const d of DEPOTS) depots[d.id] = emptyDepotState(d);
  return {
    version: 1,
    activeDepot: 'local',
    buyMode: 1, // 1 | 10 | 100 | 'max'
    depots,
  };
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createInitialState();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return createInitialState();
    const base = createInitialState();
    const merged = {
      ...base,
      ...parsed,
      depots: { ...base.depots },
    };
    for (const d of DEPOTS) {
      const saved = parsed.depots?.[d.id];
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
          }
        : emptyDepotState(d);
      if (d.id === 'local') merged.depots[d.id].unlocked = true;
    }
    return merged;
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

/**
 * Shared admin name overrides:
 * {
 *   depots: {
 *     local: { name?: string, businesses?: { [businessId]: string }, upgrades?: { [upgradeId]: string } }
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
      upgrades,
    };
  }
  return out;
}

/** Trim ends for persistence / server save. */
export function normalizeNameConfig(raw) {
  const drafted = draftNameConfig(raw);
  const out = { depots: {} };
  for (const d of DEPOTS) {
    const entry = drafted.depots[d.id] || { businesses: {}, upgrades: {} };
    const businesses = {};
    for (const [id, name] of Object.entries(entry.businesses || {})) {
      const clean = String(name || '').trim().slice(0, 80);
      if (clean) businesses[id] = clean;
    }
    const upgrades = {};
    for (const [id, name] of Object.entries(entry.upgrades || {})) {
      const clean = String(name || '').trim().slice(0, 80);
      if (clean) upgrades[id] = clean;
    }
    const depotName = String(entry.name || '').trim().slice(0, 80);
    out.depots[d.id] = {
      ...(depotName ? { name: depotName } : {}),
      businesses,
      upgrades,
    };
  }
  return out;
}

export function totalLifetimeEarnings(state) {
  if (!state?.depots) return 0;
  let sum = 0;
  for (const d of DEPOTS) {
    sum += Number(state.depots[d.id]?.lifetimeEarnings) || 0;
  }
  return sum;
}

export function applyNameOverrides(depot, nameConfig) {
  if (!depot) return depot;
  const entry = nameConfig?.depots?.[depot.id];
  if (!entry) return depot;
  const businesses = (depot.businesses || []).map((biz) => {
    if (!Object.prototype.hasOwnProperty.call(entry.businesses || {}, biz.id)) return biz;
    const override = entry.businesses[biz.id];
    // Allow spaces while typing; empty string falls back to default.
    if (override === '' || override == null) return biz;
    return { ...biz, name: String(override) };
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
  let m = 1;
  for (const [at, mult] of STANDARD_PROFIT) {
    if (owned >= at) m *= mult;
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

export function computeMultipliers(depot, depotState) {
  const n = depot.businesses.length;
  const owned = depotState.owned;
  const upgradeProfit = Array.from({ length: n }, () => 1);
  let allProfit = 1;
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
    if (up.angelBonus) angelBonusExtra += up.angelBonus;
  }

  const newsIdx = depot.businesses.findIndex((b) => b.newspaper);
  const news = newsIdx >= 0
    ? newspaperBonuses(owned[newsIdx] || 0, n)
    : { selfSpeedHalves: 0, profitByTarget: Array.from({ length: n }, () => 1) };
  const global = globalBonuses(owned);

  const angelRate = 0.02 + angelBonusExtra;
  const angelMult = 1 + (Number(depotState.angels) || 0) * angelRate;

  const perBusiness = depot.businesses.map((biz, i) => {
    const o = owned[i] || 0;
    // Newspaper-style businesses use their own early speed unlocks; others use 25/50/100…
    const speedHalves = (biz.newspaper ? news.selfSpeedHalves : countSpeedHalves(o)) + global.speedHalves;
    const profitMult = profitFromStandardUnlocks(o)
      * (news.profitByTarget[i] || 1)
      * upgradeProfit[i]
      * allProfit
      * global.profit
      * angelMult;
    const time = biz.baseTime / (2 ** speedHalves);
    const revenuePerUnit = biz.baseRevenue * profitMult;
    const cycleRevenue = revenuePerUnit * o;
    const revenuePerSecond = time > 0 ? cycleRevenue / time : 0;
    return {
      speedHalves,
      profitMult,
      time,
      revenuePerUnit,
      cycleRevenue,
      revenuePerSecond,
    };
  });

  return { perBusiness, angelRate, angelMult, allProfit };
}

export function angelsFromLifetime(depot, lifetimeEarnings) {
  const scale = depot.angelScale || 150;
  const div = depot.angelDivisor || 1e15;
  if (lifetimeEarnings <= 0) return 0;
  return Math.floor(scale * Math.sqrt(lifetimeEarnings / div));
}

export function pendingAngels(depot, depotState) {
  const total = angelsFromLifetime(depot, depotState.lifetimeEarnings);
  const already = (Number(depotState.angels) || 0) + (Number(depotState.angelsSpent) || 0);
  return Math.max(0, total - already);
}

export function tickDepot(depot, depotState, now = Date.now()) {
  const state = {
    ...depotState,
    owned: [...depotState.owned],
    managers: [...depotState.managers],
    progress: [...depotState.progress],
    running: [...depotState.running],
  };
  const elapsed = Math.max(0, (now - (state.lastTick || now)) / 1000);
  state.lastTick = now;
  if (elapsed <= 0) return state;

  const mult = computeMultipliers(depot, state);
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
    state.cash += earned;
    state.lifetimeEarnings += earned;
    state.sessionEarnings += earned;
  }
  return state;
}

export function startCycle(depot, depotState, index) {
  const state = { ...depotState, running: [...depotState.running], progress: [...depotState.progress] };
  if ((state.owned[index] || 0) <= 0) return state;
  if (state.running[index]) return state;
  state.running[index] = true;
  state.progress[index] = 0;
  return state;
}

export function buyBusinesses(depot, depotState, index, mode) {
  const state = {
    ...depotState,
    owned: [...depotState.owned],
  };
  const biz = depot.businesses[index];
  if (!biz) return state;
  const owned = state.owned[index] || 0;
  let qty;
  if (mode === 'max') {
    qty = maxAffordable(biz.baseCost, biz.coefficient, owned, state.cash);
  } else {
    qty = Math.max(1, Math.floor(Number(mode) || 1));
  }
  if (qty <= 0) return state;
  // If not max, shrink to what we can afford
  while (qty > 0 && buyCost(biz.baseCost, biz.coefficient, owned, qty) > state.cash) {
    qty -= 1;
  }
  if (qty <= 0) return state;
  const cost = buyCost(biz.baseCost, biz.coefficient, owned, qty);
  state.cash -= cost;
  state.owned[index] = owned + qty;
  return state;
}

export function buyManager(depot, depotState, index) {
  const state = {
    ...depotState,
    managers: [...depotState.managers],
    running: [...depotState.running],
  };
  if (state.managers[index]) return state;
  const mgr = depot.managers[index];
  if (!mgr || state.cash < mgr.cost) return state;
  if ((state.owned[index] || 0) <= 0) return state;
  state.cash -= mgr.cost;
  state.managers[index] = true;
  state.running[index] = true;
  return state;
}

export function buyCashUpgrade(depot, depotState, upgradeId) {
  const up = depot.cashUpgrades.find((u) => u.id === upgradeId);
  if (!up) return depotState;
  if ((depotState.upgrades || []).includes(upgradeId)) return depotState;
  if (depotState.cash < up.cost) return depotState;
  return {
    ...depotState,
    cash: depotState.cash - up.cost,
    upgrades: [...(depotState.upgrades || []), upgradeId],
  };
}

export function buyAngelUpgrade(depot, depotState, upgradeId) {
  const up = depot.angelUpgrades.find((u) => u.id === upgradeId);
  if (!up) return depotState;
  if ((depotState.angelUpgrades || []).includes(upgradeId)) return depotState;
  if ((depotState.angels || 0) < up.cost) return depotState;
  const next = {
    ...depotState,
    angels: depotState.angels - up.cost,
    angelsSpent: (depotState.angelsSpent || 0) + up.cost,
    angelUpgrades: [...(depotState.angelUpgrades || []), upgradeId],
    owned: [...depotState.owned],
  };
  if (up.flatOwned != null && typeof up.business === 'number') {
    next.owned[up.business] = (next.owned[up.business] || 0) + up.flatOwned;
  }
  return next;
}

export function resetDepot(depot, depotState) {
  const pending = pendingAngels(depot, depotState);
  const next = emptyDepotState(depot);
  next.angels = (depotState.angels || 0) + pending;
  next.angelsSpent = depotState.angelsSpent || 0;
  next.lifetimeEarnings = depotState.lifetimeEarnings || 0;
  next.angelUpgrades = [...(depotState.angelUpgrades || [])];
  next.unlocked = true;
  // Angel upgrades that grant flat owned apply after reset
  for (const id of next.angelUpgrades) {
    const up = depot.angelUpgrades.find((u) => u.id === id);
    if (up?.flatOwned != null && typeof up.business === 'number') {
      next.owned[up.business] = (next.owned[up.business] || 0) + up.flatOwned;
    }
  }
  return next;
}

export function syncDepotUnlocks(state) {
  const next = { ...state, depots: { ...state.depots } };
  const localLife = next.depots.local?.lifetimeEarnings || 0;
  const regionalLife = next.depots.regional?.lifetimeEarnings || 0;
  if (localLife >= DEPOTS[1].unlockCost) {
    next.depots.regional = { ...next.depots.regional, unlocked: true };
  }
  if (regionalLife >= DEPOTS[2].unlockCost) {
    next.depots.national = { ...next.depots.national, unlocked: true };
  }
  return next;
}

export function totalRevenuePerSecond(depot, depotState) {
  const mult = computeMultipliers(depot, depotState);
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
