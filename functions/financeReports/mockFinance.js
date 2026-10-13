'use strict';

const { resolveDateRange } = require('./dateRange');

const DEPOTS = ['Northampton', 'Kettering', 'Rushden', 'Daventry', 'Brackley'];
const SEGMENTS = ['Schools', 'Corporate/VIP', 'Rail Replacement', 'Sports', 'General'];
const COACH_FLEET = [
  { coach: 'A15 CLN (59)', vehicleType: '59 Seat Coach', licensePlate: 'A15 CLN' },
  { coach: 'W16 CLN (84)', vehicleType: '84 Seat Double Decker', licensePlate: 'W16 CLN' },
  { coach: 'G1 CLN (57)', vehicleType: '57 Seat Executive Coach', licensePlate: 'G1 CLN' },
  { coach: 'F1 CLN (57)', vehicleType: '57 Seat Executive Coach', licensePlate: 'F1 CLN' },
  { coach: 'T66 CLN (61)', vehicleType: '61 Seat Coach', licensePlate: 'T66 CLN' },
  { coach: 'JB 3890 (53)', vehicleType: '53 Seat Executive Coach', licensePlate: 'JB 3890' },
];
const DRIVERS = [
  'Robert Dick',
  'Peter Webb',
  'Mark Weatherley',
  'Paul Horn',
  'Nicholas Clack',
  'Marcus Love',
];

function depotFactor(depot) {
  if (depot === 'All') return 1;
  const idx = DEPOTS.indexOf(depot);
  return idx >= 0 ? 0.28 - idx * 0.035 : 0.2;
}

function segmentFactor(segment) {
  if (segment === 'All') return 1;
  if (segment === 'Schools') return 0.52;
  if (segment === 'Corporate/VIP') return 0.18;
  return 0.12;
}

function monthLabel(d) {
  return d.toLocaleString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' });
}

function monthsBetween(fromIso, toIso) {
  const from = new Date(`${fromIso}T00:00:00Z`);
  const to = new Date(`${toIso}T00:00:00Z`);
  return (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth()) + 1;
}

function buildTrend(filters, from, to, scaleMul) {
  const count = Math.max(1, Math.min(36, monthsBetween(from, to)));
  const scale = depotFactor(filters.depot) * segmentFactor(filters.segment) * scaleMul;
  const end = new Date(`${to}T00:00:00Z`);
  const points = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - i, 1));
    const season = 1 + 0.12 * Math.sin((d.getUTCMonth() / 12) * Math.PI * 2);
    const growth = 1 + (count - i) * 0.01;
    const revenue = Math.round(485_000 * scale * season * growth);
    points.push({
      month: monthLabel(d),
      revenue,
      spend: 0,
      margin: revenue,
      marginPct: 1,
      tripRevenue: revenue,
      trips: Math.round(220 * scale * season),
    });
  }
  return points;
}

function kpis(trend) {
  const half = Math.max(1, Math.floor(trend.length / 2));
  const recent = trend.slice(-half);
  const prior = trend.slice(0, half);
  const sum = (rows) => rows.reduce((a, p) => a + p.revenue, 0);
  const revenue = sum(trend);
  const priorRevenue = sum(prior) || 1;
  return {
    revenue,
    trips: trend.reduce((a, p) => a + p.trips, 0),
    bookings: Math.round(trend.reduce((a, p) => a + p.trips, 0) * 0.35),
    revenueDelta: (sum(recent) - priorRevenue) / priorRevenue,
  };
}

function named(total, names) {
  const weights = names.map((_, i) => Math.max(0.05, 0.3 - i * 0.04));
  const sum = weights.reduce((a, b) => a + b, 0);
  return names.map((name, i) => {
    const share = weights[i] / sum;
    return {
      name,
      amount: Math.round(total * share),
      share,
      trips: Math.round(40 + (names.length - i) * 8),
    };
  });
}

function vehicles(total) {
  const weights = [0.18, 0.16, 0.15, 0.14, 0.13, 0.12];
  const sum = weights.reduce((a, b) => a + b, 0);
  return COACH_FLEET.map((c, i) => ({
    ...c,
    trips: Math.round(50 + (COACH_FLEET.length - i) * 15),
    revenue: Math.round(total * (weights[i] / sum)),
  }));
}

function drivers(total) {
  const weights = [0.2, 0.18, 0.16, 0.15, 0.14, 0.12];
  const sum = weights.reduce((a, b) => a + b, 0);
  return DRIVERS.map((driver, i) => ({
    driver,
    trips: Math.round(30 + (DRIVERS.length - i) * 10),
    revenue: Math.round(total * (weights[i] / sum)),
    active: true,
  }));
}

function getMockFinanceData(filters, customer = 'Country Lion') {
  const range = resolveDateRange(filters);
  const resolved = {
    ...filters,
    period: range.period,
    fromDate: range.from,
    toDate: range.to,
  };
  const phTrend = buildTrend(resolved, range.from, range.to, 0.35);
  const ctTrend = buildTrend(resolved, range.from, range.to, 0.65);
  const allTrend = buildTrend(resolved, range.from, range.to, 1);
  const phK = kpis(phTrend);
  const ctK = kpis(ctTrend);
  const allK = kpis(allTrend);

  return {
    source: 'mock',
    customer,
    asOf: new Date().toISOString(),
    currency: 'GBP',
    filters: resolved,
    dateRange: { from: range.from, to: range.to },
    depots: [...DEPOTS],
    segments: [...SEGMENTS],
    privateHire: {
      id: 'private-hire',
      title: 'Private Hire',
      tripType: 'Normal',
      description: 'Ad-hoc / private hire trips (trip type Normal in the Power BI report).',
      kpis: phK,
      trend: phTrend,
      byDepot: named(phK.revenue, [...DEPOTS]),
      byCustomer: named(phK.revenue, ['Acme Events', 'Northants Schools Trust', 'VIP Travel Co']),
    },
    contracts: {
      id: 'contracts',
      title: 'Contracts',
      tripType: 'Fixed',
      description: 'Contract / fixed work (trip type Fixed in the Power BI report).',
      kpis: ctK,
      trend: ctTrend,
      byDepot: named(ctK.revenue, [...DEPOTS]),
      byCustomer: named(ctK.revenue, [
        'County Schools Contract',
        'Rail Replacement Hub',
        'Local Authority Routes',
      ]),
    },
    byVehicle: {
      id: 'by-vehicle',
      title: 'By vehicle',
      description: 'Trip revenue attributed to each coach (vehicle / licence plate).',
      kpis: allK,
      trend: allTrend,
      byVehicle: vehicles(allK.revenue),
    },
    byDriver: {
      id: 'by-driver',
      title: 'By driver',
      description: 'Trip revenue attributed to each driver (person) — not the vehicle.',
      kpis: allK,
      trend: allTrend,
      byDriver: drivers(allK.revenue),
    },
    note: 'Showing realistic mock coach-hire figures — Redshift is not connected or unreachable from this environment.',
  };
}

const FILTER_OPTIONS = {
  periods: [
    { value: '3m', label: 'Last 3 months' },
    { value: '6m', label: 'Last 6 months' },
    { value: '12m', label: 'Last 12 months' },
    { value: 'ytd', label: 'Year to date' },
    { value: 'custom', label: 'Custom dates' },
  ],
};

module.exports = {
  getMockFinanceData,
  FILTER_OPTIONS,
};
