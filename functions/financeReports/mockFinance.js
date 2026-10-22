'use strict';

const { resolveDateRange, resolveMtdRange, shiftIsoYears } = require('./dateRange');

const DEPOTS = ['Northampton', 'Kettering', 'Rushden', 'Daventry', 'Brackley'];
const SEGMENTS = ['Schools', 'Corporate/VIP', 'Rail Replacement', 'Sports', 'General'];
const COACH_FLEET = [
  { coach: 'BU11 JSF (57)', vehicleType: '57 Seat Executive Coach', licensePlate: 'BU11 JSF', isFinanced: true },
  { coach: 'T66 CLN (61)', vehicleType: '61 Seat Coach', licensePlate: 'T66 CLN', isFinanced: false },
  { coach: 'F1 CLN (57)', vehicleType: '57 Seat Executive Coach', licensePlate: 'F1 CLN', isFinanced: true },
  { coach: 'A8 CLN (61)', vehicleType: '61 Seat Coach', licensePlate: 'A8 CLN', isFinanced: false },
  { coach: 'G1 CLN (57)', vehicleType: '57 Seat Executive Coach', licensePlate: 'G1 CLN', isFinanced: true },
  { coach: 'A15 CLN (59)', vehicleType: '59 Seat Coach', licensePlate: 'A15 CLN', isFinanced: false },
  { coach: 'W16 CLN (84)', vehicleType: '84 Seat Double Decker', licensePlate: 'W16 CLN', isFinanced: true },
  { coach: 'V16 CLN (84)', vehicleType: '84 Seat Double Decker', licensePlate: 'V16 CLN', isFinanced: true },
  { coach: 'JB 3890 (53)', vehicleType: '53 Seat Executive Coach', licensePlate: 'JB 3890', isFinanced: true },
  { coach: 'S1 CLN (59)', vehicleType: '59 Seat Coach', licensePlate: 'S1 CLN', isFinanced: false },
  { coach: 'L10 NCC (36)', vehicleType: '36 Seat Midi Coach', licensePlate: 'L10 NCC', isFinanced: false },
  { coach: 'KX14 EBL (57)', vehicleType: '57 Seat Executive Coach', licensePlate: 'KX14 EBL', isFinanced: true },
  { coach: 'YT13 YVO (53)', vehicleType: '53 Seat Coach', licensePlate: 'YT13 YVO', isFinanced: false },
  { coach: 'PO63 OXF (57)', vehicleType: '57 Seat Executive Coach', licensePlate: 'PO63 OXF', isFinanced: true },
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

function topCustomers(total) {
  const names = [
    ['Northampton School Trust', 'Schools'],
    ['Acme Events Ltd', 'Corporate/VIP'],
    ['County Rail Hub', 'Rail Replacement'],
    ['VIP Travel Co', 'Corporate/VIP'],
    ['Village Primary Federation', 'Schools'],
  ];
  const weights = [0.32, 0.24, 0.18, 0.14, 0.12];
  const sum = weights.reduce((a, b) => a + b, 0);
  return names.map(([name, category], i) => ({
    name,
    category,
    trips: Math.round(40 + (names.length - i) * 12),
    bookings: Math.round(12 + (names.length - i) * 3),
    revenue: Math.round(total * (weights[i] / sum)),
  }));
}

function dormantCustomers() {
  return [
    { name: 'Olympic Primary Academy', category: 'Schools', revenue: 42800, trips: 36, lastTripDate: '2025-07-16' },
    { name: 'Meaco (UK) Ltd', category: 'Corporate/VIP', revenue: 31200, trips: 22, lastTripDate: '2025-05-30' },
    { name: 'Earls Barton Bowls Club', category: 'General', revenue: 18400, trips: 8, lastTripDate: '2025-05-26' },
  ];
}

function buildUtilisation(totalRevenue, monthsCount, scope = 'both') {
  const days = Math.max(14, Math.round(monthsCount * 30.4));
  // Standard operational window: 12 hours/day per vehicle
  const availableHoursPerVehicle = Math.round(days * 12);

  const revenueWeights = [0.14, 0.13, 0.12, 0.11, 0.10, 0.09, 0.08, 0.07, 0.05, 0.04, 0.03, 0.02, 0.015, 0.005];
  const weightSum = revenueWeights.reduce((a, b) => a + b, 0);

  const list = COACH_FLEET.map((c, i) => {
    const share = revenueWeights[i] / weightSum;
    let rev = Math.round(totalRevenue * share);
    let baseTrips = Math.round((55 + (COACH_FLEET.length - i) * 8) * (monthsCount / 12));

    let avgHoursPerTrip = 3.6;
    if (c.vehicleType.includes('Double Decker')) avgHoursPerTrip = 2.8;
    else if (c.vehicleType.includes('Executive')) avgHoursPerTrip = 4.4;
    else if (c.vehicleType.includes('Midi')) avgHoursPerTrip = 3.0;

    if (scope === 'privateHire') {
      rev = Math.round(rev * 0.55);
      baseTrips = Math.max(1, Math.round(baseTrips * 0.45));
      avgHoursPerTrip *= 1.15;
    } else if (scope === 'contracts') {
      rev = Math.round(rev * 0.45);
      baseTrips = Math.max(1, Math.round(baseTrips * 0.55));
      avgHoursPerTrip *= 0.85;
    }

    if (c.licensePlate === 'KX14 EBL') {
      baseTrips = Math.max(4, Math.round(baseTrips * 0.35));
      rev = Math.round(rev * 0.4);
    } else if (c.licensePlate === 'PO63 OXF') {
      baseTrips = Math.max(2, Math.round(baseTrips * 0.2));
      rev = Math.round(rev * 0.25);
    }

    const operationalHours = Math.round(baseTrips * avgHoursPerTrip * 10) / 10;
    const idleHours = Math.max(0, Math.round((availableHoursPerVehicle - operationalHours) * 10) / 10);
    const utilisationPct = availableHoursPerVehicle > 0 ? operationalHours / availableHoursPerVehicle : 0;
    const revenuePerHour = operationalHours > 0 ? Math.round(rev / operationalHours) : 0;

    return {
      coach: c.coach,
      licensePlate: c.licensePlate,
      vehicleType: c.vehicleType,
      isFinanced: Boolean(c.isFinanced),
      trips: baseTrips,
      operationalHours,
      idleHours,
      availableHours: availableHoursPerVehicle,
      utilisationPct,
      revenue: rev,
      revenuePerHour,
      avgHoursPerTrip: Math.round((operationalHours / baseTrips) * 10) / 10,
    };
  });

  const totalHours = Math.round(list.reduce((sum, v) => sum + v.operationalHours, 0) * 10) / 10;
  const totalIdleHours = Math.round(list.reduce((sum, v) => sum + v.idleHours, 0) * 10) / 10;
  const totalRev = list.reduce((sum, v) => sum + v.revenue, 0);
  const totalTrips = list.reduce((sum, v) => sum + v.trips, 0);
  const totalAvailable = availableHoursPerVehicle * list.length;
  const overallUtilisationPct = totalAvailable > 0 ? totalHours / totalAvailable : 0;
  const avgRevPerHour = totalHours > 0 ? Math.round(totalRev / totalHours) : 0;

  const financedUnderperforming = list.filter(
    (v) => v.isFinanced && (v.utilisationPct < 0.15 || v.revenuePerHour < 60)
  ).length;

  return {
    kpis: {
      totalOperationalHours: totalHours,
      totalIdleHours,
      overallUtilisationPct,
      avgRevenuePerHour: avgRevPerHour,
      totalRevenue: totalRev,
      totalTrips,
      activeVehicles: list.length,
      financedUnderperforming,
      availableHoursPerVehicle,
    },
    vehicles: list.sort((a, b) => b.operationalHours - a.operationalHours),
  };
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
  const priorRev = Math.round(allK.revenue * 0.88);
  const priorTrips = Math.round(allK.trips * 0.9);
  const mtd = resolveMtdRange(range.to);
  const mtdRev = Math.round(allK.revenue * 0.12);
  const mtdLyRev = Math.round(mtdRev * 0.85);
  const monthsCount = monthsBetween(range.from, range.to);

  return {
    source: 'mock',
    customer,
    asOf: new Date().toISOString(),
    currency: 'GBP',
    filters: resolved,
    dateRange: { from: range.from, to: range.to },
    comparisons: {
      period: {
        label: 'Selected period vs same dates last year',
        from: range.from,
        to: range.to,
        priorFrom: shiftIsoYears(range.from, -1),
        priorTo: shiftIsoYears(range.to, -1),
        current: { revenue: allK.revenue, trips: allK.trips, bookings: allK.bookings },
        prior: { revenue: priorRev, trips: priorTrips, bookings: Math.round(allK.bookings * 0.9) },
        revenueDelta: (allK.revenue - priorRev) / priorRev,
        tripsDelta: (allK.trips - priorTrips) / priorTrips,
        bookingsDelta: 0.1,
      },
      mtd: {
        label: 'Month to date vs MTD last year',
        from: mtd.from,
        to: mtd.to,
        priorFrom: shiftIsoYears(mtd.from, -1),
        priorTo: shiftIsoYears(mtd.to, -1),
        current: { revenue: mtdRev, trips: Math.round(allK.trips * 0.1), bookings: Math.round(allK.bookings * 0.1) },
        prior: { revenue: mtdLyRev, trips: Math.round(allK.trips * 0.09), bookings: Math.round(allK.bookings * 0.09) },
        revenueDelta: (mtdRev - mtdLyRev) / mtdLyRev,
        tripsDelta: 0.12,
        bookingsDelta: 0.08,
      },
    },
    customerHealth: {
      bands: {
        active: { customers: 180, revenue: Math.round(allK.revenue * 0.7), trips: Math.round(allK.trips * 0.75) },
        atRisk: { customers: 24, revenue: Math.round(allK.revenue * 0.08), trips: Math.round(allK.trips * 0.05) },
        churned: { customers: 96, revenue: Math.round(allK.revenue * 0.22), trips: Math.round(allK.trips * 0.2) },
      },
      revenueAtRisk: Math.round(allK.revenue * 0.3),
      atRiskTop: dormantCustomers().slice(0, 2).map((r) => ({ ...r, band: 'atRisk' })),
      churnedTop: dormantCustomers().map((r) => ({ ...r, band: 'churned' })),
      note: 'Active = last trip within 60 days; at risk = 60–89 days; churned = 90+ days (Power BI Customer Health).',
    },
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
      scopes: {
        both: {
          label: 'Both',
          kpis: allK,
          trend: allTrend,
          byVehicle: vehicles(allK.revenue),
        },
        privateHire: {
          label: 'Private Hire',
          kpis: phK,
          trend: phTrend,
          byVehicle: vehicles(phK.revenue),
        },
        contracts: {
          label: 'Contracts',
          kpis: ctK,
          trend: ctTrend,
          byVehicle: vehicles(ctK.revenue),
        },
      },
    },
    vehicleUtilisation: {
      id: 'utilisation',
      title: 'Vehicle Utilisation & Hours',
      description:
        'Operating hours, idle hours, and revenue yield per hour by coach — calculated from trip duration (trip start to finish).',
      scopes: {
        both: {
          label: 'Both',
          ...buildUtilisation(allK.revenue, monthsCount, 'both'),
        },
        privateHire: {
          label: 'Private Hire',
          ...buildUtilisation(phK.revenue, monthsCount, 'privateHire'),
        },
        contracts: {
          label: 'Contracts',
          ...buildUtilisation(ctK.revenue, monthsCount, 'contracts'),
        },
      },
    },
    byDriver: {
      id: 'by-driver',
      title: 'By driver',
      description: 'Trip revenue attributed to each driver (person) — not the vehicle.',
      scopes: {
        both: {
          label: 'Both',
          kpis: allK,
          trend: allTrend,
          byDriver: drivers(allK.revenue),
        },
        privateHire: {
          label: 'Private Hire',
          kpis: phK,
          trend: phTrend,
          byDriver: drivers(phK.revenue),
        },
        contracts: {
          label: 'Contracts',
          kpis: ctK,
          trend: ctTrend,
          byDriver: drivers(ctK.revenue),
        },
      },
    },
    byJobType: {
      id: 'by-job-type',
      title: 'By job type',
      description:
        'Trip revenue by customer category (Schools, Corporate/VIP, Rail Replacement, …) — the job-type slice from Power BI Revenue & Yield.',
      scopes: {
        both: {
          label: 'Both',
          kpis: allK,
          trend: allTrend,
          byJobType: named(allK.revenue, [...SEGMENTS]),
        },
        privateHire: {
          label: 'Private Hire',
          kpis: phK,
          trend: phTrend,
          byJobType: named(phK.revenue, [...SEGMENTS]),
        },
        contracts: {
          label: 'Contracts',
          kpis: ctK,
          trend: ctTrend,
          byJobType: named(ctK.revenue, [...SEGMENTS]),
        },
      },
    },
    acceptance: {
      id: 'acceptance',
      title: 'Acceptance rate',
      description:
        'Private Hire quotes (Normal orders) by order date. Acceptance rate = won ÷ (won + lost + open).',
      won: 420,
      lost: 380,
      openQuotes: 24,
      cancelled: 40,
      quotes: 864,
      acceptanceRate: 420 / (420 + 380 + 24),
    },
    customers: {
      id: 'customers',
      title: 'Customers',
      description:
        'Top customers in the selected trip-date range, health bands (active / at risk / churned), and long-lapsed accounts.',
      scopes: {
        both: {
          label: 'Both',
          kpis: allK,
          trend: allTrend,
          topCustomers: topCustomers(allK.revenue),
        },
        privateHire: {
          label: 'Private Hire',
          kpis: phK,
          trend: phTrend,
          topCustomers: topCustomers(phK.revenue),
        },
        contracts: {
          label: 'Contracts',
          kpis: ctK,
          trend: ctTrend,
          topCustomers: topCustomers(ctK.revenue),
        },
      },
      health: {
        bands: {
          active: { customers: 180, revenue: Math.round(allK.revenue * 0.7), trips: Math.round(allK.trips * 0.75) },
          atRisk: { customers: 24, revenue: Math.round(allK.revenue * 0.08), trips: Math.round(allK.trips * 0.05) },
          churned: { customers: 96, revenue: Math.round(allK.revenue * 0.22), trips: Math.round(allK.trips * 0.2) },
        },
        revenueAtRisk: Math.round(allK.revenue * 0.3),
        atRiskTop: dormantCustomers().slice(0, 2).map((r) => ({ ...r, band: 'atRisk' })),
        churnedTop: dormantCustomers().map((r) => ({ ...r, band: 'churned' })),
        note: 'Active = last trip within 60 days; at risk = 60–89 days; churned = 90+ days (Power BI Customer Health).',
      },
      dormantTopCustomers: dormantCustomers(),
      dormantNote:
        'Top 10 customers by lifetime trip revenue (ex VAT) with no operational trip in the last 9 months.',
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
