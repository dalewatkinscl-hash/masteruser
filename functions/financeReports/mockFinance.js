'use strict';

const { resolveDateRange, resolveMtdRange, shiftIsoYears } = require('./dateRange');

const DEPOTS = ['Northampton', 'Kettering', 'Rushden', 'Daventry', 'Brackley'];
const SEGMENTS = ['Schools', 'Corporate/VIP', 'Rail Replacement', 'Sports', 'General'];
const COACH_FLEET = [
  { coach: 'BU11 JSF (57)', vehicleType: '57 Seat Executive Coach', licensePlate: 'BU11 JSF' },
  { coach: 'T66 CLN (61)', vehicleType: '61 Seat Coach', licensePlate: 'T66 CLN' },
  { coach: 'F1 CLN (57)', vehicleType: '57 Seat Executive Coach', licensePlate: 'F1 CLN' },
  { coach: 'A8 CLN (61)', vehicleType: '61 Seat Coach', licensePlate: 'A8 CLN' },
  { coach: 'G1 CLN (57)', vehicleType: '57 Seat Executive Coach', licensePlate: 'G1 CLN' },
  { coach: 'A15 CLN (59)', vehicleType: '59 Seat Coach', licensePlate: 'A15 CLN' },
  { coach: 'W16 CLN (84)', vehicleType: '84 Seat Double Decker', licensePlate: 'W16 CLN' },
  { coach: 'V16 CLN (84)', vehicleType: '84 Seat Double Decker', licensePlate: 'V16 CLN' },
  { coach: 'JB 3890 (53)', vehicleType: '53 Seat Executive Coach', licensePlate: 'JB 3890' },
  { coach: 'S1 CLN (59)', vehicleType: '59 Seat Coach', licensePlate: 'S1 CLN' },
  { coach: 'L10 NCC (36)', vehicleType: '36 Seat Midi Coach', licensePlate: 'L10 NCC' },
  { coach: 'KX14 EBL (57)', vehicleType: '57 Seat Executive Coach', licensePlate: 'KX14 EBL' },
  { coach: 'YT13 YVO (53)', vehicleType: '53 Seat Coach', licensePlate: 'YT13 YVO' },
  { coach: 'PO63 OXF (57)', vehicleType: '57 Seat Executive Coach', licensePlate: 'PO63 OXF' },
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

  return {
    kpis: {
      totalOperationalHours: totalHours,
      totalIdleHours,
      overallUtilisationPct,
      avgRevenuePerHour: avgRevPerHour,
      totalRevenue: totalRev,
      totalTrips,
      activeVehicles: list.length,
      availableHoursPerVehicle,
    },
    vehicles: list.sort((a, b) => b.operationalHours - a.operationalHours),
  };
}

function buildMockMiddayUtilisation(totalRevenue, monthsCount, scope = 'both') {
  const days = Math.max(14, Math.round(monthsCount * 30.4));
  // 5 hours operational window per day (09:30 to 14:30)
  const availableMiddayHoursPerVehicle = Math.round(days * 5);

  const revenueWeights = [0.14, 0.13, 0.12, 0.11, 0.10, 0.09, 0.08, 0.07, 0.05, 0.04, 0.03, 0.02, 0.015, 0.005];
  const weightSum = revenueWeights.reduce((a, b) => a + b, 0);

  const list = COACH_FLEET.map((c, i) => {
    const share = revenueWeights[i] / weightSum;
    let rev = Math.round(totalRevenue * share * 0.42);
    let baseTrips = Math.round((28 + (COACH_FLEET.length - i) * 4) * (monthsCount / 12));

    let avgMiddayHoursPerTrip = 2.4;
    if (c.vehicleType.includes('Double Decker')) avgMiddayHoursPerTrip = 1.8;
    else if (c.vehicleType.includes('Executive')) avgMiddayHoursPerTrip = 3.2;
    else if (c.vehicleType.includes('Midi')) avgMiddayHoursPerTrip = 2.1;

    if (scope === 'privateHire') {
      rev = Math.round(rev * 0.65);
      baseTrips = Math.max(1, Math.round(baseTrips * 0.6));
      avgMiddayHoursPerTrip *= 1.1;
    } else if (scope === 'contracts') {
      rev = Math.round(rev * 0.35);
      baseTrips = Math.max(1, Math.round(baseTrips * 0.4));
      avgMiddayHoursPerTrip *= 0.85;
    }

    const middayHoursSold = Math.min(availableMiddayHoursPerVehicle, Math.round(baseTrips * avgMiddayHoursPerTrip * 10) / 10);
    const idleMiddayHours = Math.max(0, Math.round((availableMiddayHoursPerVehicle - middayHoursSold) * 10) / 10);
    const utilisationPct = availableMiddayHoursPerVehicle > 0 ? middayHoursSold / availableMiddayHoursPerVehicle : 0;
    const revPerMiddayHour = middayHoursSold > 0 ? Math.round(rev / middayHoursSold) : 0;
    const totalOpsHours = Math.round(middayHoursSold * 2.2 * 10) / 10;

    let seats = 53;
    const matchCap = c.coach.match(/\((\d+)\)/);
    if (matchCap) seats = parseInt(matchCap[1], 10);

    return {
      coach: c.coach,
      licensePlate: c.licensePlate,
      vehicleType: c.vehicleType,
      passengerCapacity: seats,
      trips: baseTrips,
      middayHoursSold,
      idleMiddayHours,
      totalOperationalHours: totalOpsHours,
      availableMiddayHours: availableMiddayHoursPerVehicle,
      utilisationPct,
      revenue: rev,
      revPerMiddayHour,
      avgMiddayHoursPerTrip: Math.round((middayHoursSold / baseTrips) * 10) / 10,
    };
  });

  const totalSoldHours = Math.round(list.reduce((sum, v) => sum + v.middayHoursSold, 0) * 10) / 10;
  const totalIdleHours = Math.round(list.reduce((sum, v) => sum + v.idleMiddayHours, 0) * 10) / 10;
  const totalRev = list.reduce((sum, v) => sum + v.revenue, 0);
  const totalTrips = list.reduce((sum, v) => sum + v.trips, 0);
  const totalAvailable = availableMiddayHoursPerVehicle * list.length;
  const overallUtilisationPct = totalAvailable > 0 ? totalSoldHours / totalAvailable : 0;
  const avgRevPerHour = totalSoldHours > 0 ? Math.round(totalRev / totalSoldHours) : 0;
  const activeVehicles = list.filter((v) => v.middayHoursSold > 0).length;

  const hourlyProfile = [
    { slot: '09:30 - 10:30', hoursSold: Math.round(totalSoldHours * 0.24 * 10) / 10, coachesActive: Math.round(activeVehicles * 0.85) },
    { slot: '10:30 - 11:30', hoursSold: Math.round(totalSoldHours * 0.21 * 10) / 10, coachesActive: Math.round(activeVehicles * 0.75) },
    { slot: '11:30 - 12:30', hoursSold: Math.round(totalSoldHours * 0.16 * 10) / 10, coachesActive: Math.round(activeVehicles * 0.58) },
    { slot: '12:30 - 13:30', hoursSold: Math.round(totalSoldHours * 0.17 * 10) / 10, coachesActive: Math.round(activeVehicles * 0.62) },
    { slot: '13:30 - 14:30', hoursSold: Math.round(totalSoldHours * 0.22 * 10) / 10, coachesActive: Math.round(activeVehicles * 0.80) },
  ];

  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const dayWeights = [0.18, 0.17, 0.22, 0.19, 0.14, 0.06, 0.04];
  const dayOfWeekProfile = DAYS.map((day, idx) => ({
    day,
    hoursSold: Math.round(totalSoldHours * dayWeights[idx] * 10) / 10,
    trips: Math.round(totalTrips * dayWeights[idx]),
    revenue: Math.round(totalRev * dayWeights[idx]),
    avgCoachesActive: Math.round(activeVehicles * (dayWeights[idx] / 0.15)),
  }));

  const sampleCustomers = [
    { name: 'Northampton School for Girls', cat: 'Schools', type: 'Private Hire', from: '09:45', to: '14:15', midHours: 4.5, totalHours: 4.5, rev: 480 },
    { name: 'University of Northampton', cat: 'Higher Education', type: 'Contracts', from: '09:30', to: '14:30', midHours: 5.0, totalHours: 6.5, rev: 620 },
    { name: 'Travis Perkins HQ', cat: 'Corporate', type: 'Private Hire', from: '10:00', to: '13:00', midHours: 3.0, totalHours: 3.5, rev: 395 },
    { name: 'Silverstone Circuits Ltd', cat: 'Events & Leisure', type: 'Private Hire', from: '09:00', to: '16:00', midHours: 5.0, totalHours: 7.0, rev: 850 },
    { name: 'Moulton College', cat: 'Schools', type: 'Contracts', from: '11:15', to: '13:45', midHours: 2.5, totalHours: 2.5, rev: 310 },
    { name: 'Avon Cosmetics UK', cat: 'Corporate', type: 'Private Hire', from: '09:30', to: '12:00', midHours: 2.5, totalHours: 3.0, rev: 340 },
    { name: 'Northamptonshire Police HQ', cat: 'Public Sector', type: 'Private Hire', from: '10:30', to: '14:30', midHours: 4.0, totalHours: 4.5, rev: 490 },
    { name: 'St Andrews Healthcare', cat: 'Healthcare', type: 'Contracts', from: '09:30', to: '14:00', midHours: 4.5, totalHours: 5.5, rev: 520 },
  ];

  const trips = sampleCustomers.map((sc, i) => {
    const coach = COACH_FLEET[i % COACH_FLEET.length];
    return {
      id: `TRIP-${1000 + i}`,
      tripCode: `CL-2026-${String(8800 + i)}`,
      date: '2026-11-04',
      dayOfWeek: DAYS[i % 5],
      customerName: sc.name,
      customerCategory: sc.cat,
      coach: coach.coach,
      licensePlate: coach.licensePlate,
      vehicleType: coach.vehicleType,
      tripType: sc.type,
      departureTime: sc.from,
      arrivalTime: sc.to,
      totalTripHours: sc.totalHours,
      middayHoursSold: sc.midHours,
      revenue: sc.rev,
    };
  });

  const phCapacity = {
    peakSimultaneousCoaches: 14,
    peakDate: '2026-10-15',
    peakDayOfWeek: 'Wednesday',
    avgTripsPerDay: Math.max(0.1, Math.round((totalTrips * 0.65 / days) * 10) / 10),
    avgTripsPerWeekday: Math.max(0.1, Math.round(((totalTrips * 0.65 / days) * (7 / 5)) * 10) / 10),
    totalPhTrips: Math.round(totalTrips * 0.65),
    totalPhMiddayHours: Math.round(totalSoldHours * 0.65 * 10) / 10,
    totalPhMiddayRevenue: Math.round(totalRev * 0.65),
    slotDemand: [
      { slot: '09:30 - 10:30', peakCoaches: 11, avgCoaches: 4.8, trips: Math.round(totalTrips * 0.22) },
      { slot: '10:30 - 11:30', peakCoaches: 14, avgCoaches: 6.2, trips: Math.round(totalTrips * 0.26) },
      { slot: '11:30 - 12:30', peakCoaches: 13, avgCoaches: 5.9, trips: Math.round(totalTrips * 0.24) },
      { slot: '12:30 - 13:30', peakCoaches: 12, avgCoaches: 5.5, trips: Math.round(totalTrips * 0.23) },
      { slot: '13:30 - 14:30', peakCoaches: 10, avgCoaches: 4.4, trips: Math.round(totalTrips * 0.20) },
    ],
    sizeDemand: [
      { band: '1 - 16 (Minibus)', key: 'minibus', peakCoaches: 3, totalTrips: Math.round(totalTrips * 0.10), hoursSold: Math.round(totalSoldHours * 0.08 * 10) / 10, revenue: Math.round(totalRev * 0.06), avgPax: 12 },
      { band: '17 - 33 (Midi Coach)', key: 'midi', peakCoaches: 4, totalTrips: Math.round(totalTrips * 0.18), hoursSold: Math.round(totalSoldHours * 0.16 * 10) / 10, revenue: Math.round(totalRev * 0.15), avgPax: 26 },
      { band: '34 - 49 (Standard Coach)', key: 'standard', peakCoaches: 6, totalTrips: Math.round(totalTrips * 0.30), hoursSold: Math.round(totalSoldHours * 0.30 * 10) / 10, revenue: Math.round(totalRev * 0.30), avgPax: 44 },
      { band: '50 - 57 (Executive)', key: 'executive', peakCoaches: 8, totalTrips: Math.round(totalTrips * 0.35), hoursSold: Math.round(totalSoldHours * 0.40 * 10) / 10, revenue: Math.round(totalRev * 0.42), avgPax: 53 },
      { band: '58+ (High Capacity / Decker)', key: 'high_capacity', peakCoaches: 2, totalTrips: Math.round(totalTrips * 0.07), hoursSold: Math.round(totalSoldHours * 0.06 * 10) / 10, revenue: Math.round(totalRev * 0.07), avgPax: 72 },
    ],
    busiestDays: [
      { date: '2026-10-15', dayOfWeek: 'Wednesday', phTrips: 18, peakConcurrent: 14, hoursSold: 52.5, revenue: 6450 },
      { date: '2026-10-22', dayOfWeek: 'Wednesday', phTrips: 16, peakConcurrent: 13, hoursSold: 47.0, revenue: 5820 },
      { date: '2026-10-08', dayOfWeek: 'Wednesday', phTrips: 15, peakConcurrent: 12, hoursSold: 44.5, revenue: 5400 },
      { date: '2026-10-17', dayOfWeek: 'Friday', phTrips: 14, peakConcurrent: 11, hoursSold: 41.0, revenue: 5120 },
      { date: '2026-10-10', dayOfWeek: 'Friday', phTrips: 13, peakConcurrent: 10, hoursSold: 38.5, revenue: 4800 },
      { date: '2026-10-14', dayOfWeek: 'Tuesday', phTrips: 12, peakConcurrent: 9, hoursSold: 36.0, revenue: 4450 },
      { date: '2026-10-21', dayOfWeek: 'Tuesday', phTrips: 12, peakConcurrent: 9, hoursSold: 35.5, revenue: 4390 },
      { date: '2026-10-16', dayOfWeek: 'Thursday', phTrips: 11, peakConcurrent: 9, hoursSold: 33.0, revenue: 4100 },
      { date: '2026-10-23', dayOfWeek: 'Thursday', phTrips: 11, peakConcurrent: 8, hoursSold: 32.5, revenue: 4050 },
      { date: '2026-10-13', dayOfWeek: 'Monday', phTrips: 10, peakConcurrent: 8, hoursSold: 29.0, revenue: 3680 },
    ],
    dayOfWeekDemand: [
      { day: 'Monday', avgTrips: 4.8, peakTrips: 10, avgHours: 13.5, peakConcurrent: 8 },
      { day: 'Tuesday', avgTrips: 5.6, peakTrips: 12, avgHours: 16.2, peakConcurrent: 9 },
      { day: 'Wednesday', avgTrips: 8.9, peakTrips: 18, avgHours: 25.8, peakConcurrent: 14 },
      { day: 'Thursday', avgTrips: 5.4, peakTrips: 11, avgHours: 15.6, peakConcurrent: 9 },
      { day: 'Friday', avgTrips: 6.2, peakTrips: 14, avgHours: 18.0, peakConcurrent: 11 },
      { day: 'Saturday', avgTrips: 2.1, peakTrips: 6, avgHours: 6.2, peakConcurrent: 4 },
      { day: 'Sunday', avgTrips: 1.2, peakTrips: 4, avgHours: 3.5, peakConcurrent: 3 },
    ],
  };

  return {
    kpis: {
      totalMiddayHoursSold: totalSoldHours,
      totalAvailableMiddayHours: totalAvailable,
      totalIdleMiddayHours: totalIdleHours,
      overallUtilisationPct,
      avgRevenuePerMiddayHour: avgRevPerHour,
      totalMiddayRevenue: totalRev,
      totalMiddayTrips: totalTrips,
      activeVehiclesInWindow: activeVehicles,
      totalFleetVehicles: list.length,
      availableMiddayHoursPerVehicle,
      daysCount: days,
      windowHoursPerDay: 5.0,
    },
    phCapacity,
    hourlyProfile,
    dayOfWeekProfile,
    vehicles: list.sort((a, b) => b.middayHoursSold - a.middayHoursSold),
    trips,
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
    middayUtilisation: {
      id: 'midday-utilisation',
      title: 'Middle of the Day Utilisation (09:30 – 14:30)',
      description:
        'Operational hours sold between 09:30 and 14:30 (5-hour window). Measures fleet deployment and sold operational capacity between morning and afternoon school / contract commitments.',
      window: { start: '09:30', end: '14:30', windowHoursPerDay: 5.0 },
      scopes: {
        both: {
          label: 'Both',
          ...buildMockMiddayUtilisation(allK.revenue, monthsCount, 'both'),
        },
        privateHire: {
          label: 'Private Hire',
          ...buildMockMiddayUtilisation(phK.revenue, monthsCount, 'privateHire'),
        },
        contracts: {
          label: 'Contracts',
          ...buildMockMiddayUtilisation(ctK.revenue, monthsCount, 'contracts'),
        },
      },
      phCapacity: buildMockMiddayUtilisation(phK.revenue, monthsCount, 'privateHire').phCapacity,
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
      byPaxBand: [
        {
          band: '1 - 16 (Minibus)',
          key: 'minibus',
          sortOrder: 1,
          won: 18,
          lost: 82,
          openQuotes: 4,
          cancelled: 6,
          quotes: 110,
          acceptanceRate: 18 / (18 + 82 + 4),
          lossRate: 82 / (18 + 82 + 4),
        },
        {
          band: '17 - 33 (Midi Coach)',
          key: 'midi',
          sortOrder: 2,
          won: 65,
          lost: 135,
          openQuotes: 6,
          cancelled: 12,
          quotes: 218,
          acceptanceRate: 65 / (65 + 135 + 6),
          lossRate: 135 / (65 + 135 + 6),
        },
        {
          band: '34 - 49 (Standard Coach)',
          key: 'standard',
          sortOrder: 3,
          won: 85,
          lost: 95,
          openQuotes: 5,
          cancelled: 8,
          quotes: 193,
          acceptanceRate: 85 / (85 + 95 + 5),
          lossRate: 95 / (85 + 95 + 5),
        },
        {
          band: '50 - 57 (Executive)',
          key: 'executive',
          sortOrder: 4,
          won: 152,
          lost: 88,
          openQuotes: 7,
          cancelled: 10,
          quotes: 257,
          acceptanceRate: 152 / (152 + 88 + 7),
          lossRate: 88 / (152 + 88 + 7),
        },
        {
          band: '58+ (High Capacity / Decker)',
          key: 'high_capacity',
          sortOrder: 5,
          won: 80,
          lost: 60,
          openQuotes: 2,
          cancelled: 4,
          quotes: 146,
          acceptanceRate: 80 / (80 + 60 + 2),
          lossRate: 60 / (80 + 60 + 2),
        },
        {
          band: 'Unspecified / Not entered',
          key: 'unspecified',
          sortOrder: 6,
          won: 20,
          lost: 0,
          openQuotes: 0,
          cancelled: 0,
          quotes: 20,
          acceptanceRate: 1,
          lossRate: 0,
        },
      ],
      byPax: [
        { pax: 53, band: '50 - 57 (Executive)', won: 95, lost: 55, openQuotes: 5, cancelled: 5, quotes: 160, acceptanceRate: 0.613, lossRate: 0.355 },
        { pax: 70, band: '58+ (High Capacity / Decker)', won: 45, lost: 35, openQuotes: 1, cancelled: 2, quotes: 83, acceptanceRate: 0.556, lossRate: 0.432 },
        { pax: 36, band: '34 - 49 (Standard Coach)', won: 48, lost: 42, openQuotes: 2, cancelled: 4, quotes: 96, acceptanceRate: 0.522, lossRate: 0.457 },
        { pax: 61, band: '58+ (High Capacity / Decker)', won: 25, lost: 22, openQuotes: 1, cancelled: 1, quotes: 49, acceptanceRate: 0.521, lossRate: 0.458 },
        { pax: 50, band: '50 - 57 (Executive)', won: 28, lost: 14, openQuotes: 1, cancelled: 2, quotes: 45, acceptanceRate: 0.651, lossRate: 0.326 },
        { pax: 55, band: '50 - 57 (Executive)', won: 22, lost: 8, openQuotes: 1, cancelled: 1, quotes: 32, acceptanceRate: 0.710, lossRate: 0.258 },
        { pax: 57, band: '50 - 57 (Executive)', won: 18, lost: 6, openQuotes: 0, cancelled: 1, quotes: 25, acceptanceRate: 0.750, lossRate: 0.250 },
        { pax: 29, band: '17 - 33 (Midi Coach)', won: 12, lost: 28, openQuotes: 2, cancelled: 2, quotes: 44, acceptanceRate: 0.286, lossRate: 0.667 },
        { pax: 16, band: '1 - 16 (Minibus)', won: 5, lost: 35, openQuotes: 1, cancelled: 2, quotes: 43, acceptanceRate: 0.122, lossRate: 0.854 },
        { pax: 20, band: '17 - 33 (Midi Coach)', won: 4, lost: 26, openQuotes: 1, cancelled: 2, quotes: 33, acceptanceRate: 0.129, lossRate: 0.839 },
      ],
    },
    paxCapacity: {
      id: 'pax-capacity',
      title: 'Planned vs Actual Pax (Private Hire)',
      description:
        'Comparison of planned passenger count (pax) against allocated vehicle seating capacity for Private Hire journeys. Identifies over-capacity allocations (e.g. 20 passengers in a 53-seat coach) and seat utilization efficiency.',
      kpis: {
        totalTrips: 14790,
        totalPax: 796109,
        totalCapacity: 872347,
        totalEmptySeats: 113306,
        avgPaxPerTrip: 53.8,
        avgSeatFillPct: 93.2,
        highMismatchTrips: 2242,
        trips30PlusEmpty: 1271,
        trips20to29Empty: 971,
        trips10to19Empty: 1665,
        tripsWellMatched: 7161,
        tripsOverCap: 3722,
      },
      distribution: [
        {
          key: 'severe',
          label: 'Severe (30+ Empty Seats)',
          shortLabel: '30+ Empty',
          count: 1271,
          pct: 8.6,
          color: '#ef4444',
          description: 'Small groups on large coaches (e.g. ≤24 pax in 53+ seaters)',
        },
        {
          key: 'moderate',
          label: 'Moderate (20–29 Empty Seats)',
          shortLabel: '20-29 Empty',
          count: 971,
          pct: 6.6,
          color: '#f97316',
          description: 'Substantial excess vehicle capacity dispatched',
        },
        {
          key: 'mild',
          label: 'Mild (10–19 Empty Seats)',
          shortLabel: '10-19 Empty',
          count: 1665,
          pct: 11.3,
          color: '#eab308',
          description: 'Standard comfortable headroom',
        },
        {
          key: 'optimal',
          label: 'Optimal (0–9 Empty Seats)',
          shortLabel: '0-9 Empty',
          count: 7161,
          pct: 48.4,
          color: '#10b981',
          description: 'Right-sized vehicle dispatched for group size',
        },
        {
          key: 'full',
          label: 'Full / At Max Capacity',
          shortLabel: 'Full / Max',
          count: 3722,
          pct: 25.1,
          color: '#3b82f6',
          description: '100% capacity utilization or high passenger load',
        },
      ],
      vehicles: [
        { licensePlate: 'A8 CLN', capacity: 61, trips: 370, totalPax: 18520, avgPaxPerTrip: 50.1, totalEmptySeats: 4311, avgSeatFillPct: 82.1, highEmptyTrips: 139, minPaxCarried: 22, maxPaxCarried: 86 , paxLevels: [{"pax":18,"trips":56,"revenue":21090,"emptySeats":43,"seatFillPct":30},{"pax":31,"trips":74,"revenue":33300,"emptySeats":31,"seatFillPct":50},{"pax":49,"trips":111,"revenue":57720,"emptySeats":12,"seatFillPct":80},{"pax":61,"trips":130,"revenue":77700,"emptySeats":0,"seatFillPct":100}] },
        { licensePlate: 'Y16 CLN', capacity: 84, trips: 207, totalPax: 13166, avgPaxPerTrip: 63.6, totalEmptySeats: 4232, avgSeatFillPct: 75.7, highEmptyTrips: 102, minPaxCarried: 29, maxPaxCarried: 87 , paxLevels: [{"pax":25,"trips":31,"revenue":11799,"emptySeats":59,"seatFillPct":30},{"pax":42,"trips":41,"revenue":18630,"emptySeats":42,"seatFillPct":50},{"pax":67,"trips":62,"revenue":32292,"emptySeats":17,"seatFillPct":80},{"pax":84,"trips":72,"revenue":43470,"emptySeats":0,"seatFillPct":100}] },
        { licensePlate: 'V99 CLN', capacity: 59, trips: 362, totalPax: 19030, avgPaxPerTrip: 52.6, totalEmptySeats: 3079, avgSeatFillPct: 89.1, highEmptyTrips: 102, minPaxCarried: 19, maxPaxCarried: 76 , paxLevels: [{"pax":18,"trips":54,"revenue":20634,"emptySeats":41,"seatFillPct":30},{"pax":30,"trips":72,"revenue":32580,"emptySeats":30,"seatFillPct":50},{"pax":47,"trips":109,"revenue":56472,"emptySeats":12,"seatFillPct":80},{"pax":59,"trips":127,"revenue":76020,"emptySeats":0,"seatFillPct":100}] },
        { licensePlate: 'TSO 30X', capacity: 76, trips: 322, totalPax: 18530, avgPaxPerTrip: 57.5, totalEmptySeats: 5972, avgSeatFillPct: 75.7, highEmptyTrips: 99, minPaxCarried: 29, maxPaxCarried: 86 , paxLevels: [{"pax":23,"trips":48,"revenue":18354,"emptySeats":53,"seatFillPct":30},{"pax":38,"trips":64,"revenue":28980,"emptySeats":38,"seatFillPct":50},{"pax":61,"trips":97,"revenue":50232,"emptySeats":15,"seatFillPct":80},{"pax":76,"trips":113,"revenue":67620,"emptySeats":0,"seatFillPct":100}] },
        { licensePlate: 'T1 CLN', capacity: 59, trips: 368, totalPax: 19715, avgPaxPerTrip: 53.6, totalEmptySeats: 3064, avgSeatFillPct: 90.8, highEmptyTrips: 94, minPaxCarried: 10, maxPaxCarried: 84 , paxLevels: [{"pax":18,"trips":55,"revenue":20976,"emptySeats":41,"seatFillPct":30},{"pax":30,"trips":74,"revenue":33120,"emptySeats":30,"seatFillPct":50},{"pax":47,"trips":110,"revenue":57408,"emptySeats":12,"seatFillPct":80},{"pax":59,"trips":129,"revenue":77280,"emptySeats":0,"seatFillPct":100}] },
        { licensePlate: 'V66 CLN', capacity: 61, trips: 386, totalPax: 20249, avgPaxPerTrip: 52.5, totalEmptySeats: 3485, avgSeatFillPct: 86.0, highEmptyTrips: 83, minPaxCarried: 9, maxPaxCarried: 84 , paxLevels: [{"pax":18,"trips":58,"revenue":22002,"emptySeats":43,"seatFillPct":30},{"pax":31,"trips":77,"revenue":34740,"emptySeats":31,"seatFillPct":50},{"pax":49,"trips":116,"revenue":60216,"emptySeats":12,"seatFillPct":80},{"pax":61,"trips":135,"revenue":81060,"emptySeats":0,"seatFillPct":100}] },
        { licensePlate: 'X66 CLN', capacity: 61, trips: 421, totalPax: 22838, avgPaxPerTrip: 54.2, totalEmptySeats: 3347, avgSeatFillPct: 88.9, highEmptyTrips: 81, minPaxCarried: 11, maxPaxCarried: 84 , paxLevels: [{"pax":18,"trips":63,"revenue":23997,"emptySeats":43,"seatFillPct":30},{"pax":31,"trips":84,"revenue":37890,"emptySeats":31,"seatFillPct":50},{"pax":49,"trips":126,"revenue":65676,"emptySeats":12,"seatFillPct":80},{"pax":61,"trips":147,"revenue":88410,"emptySeats":0,"seatFillPct":100}] },
        { licensePlate: 'T66 CLN', capacity: 61, trips: 397, totalPax: 20847, avgPaxPerTrip: 52.5, totalEmptySeats: 3617, avgSeatFillPct: 86.1, highEmptyTrips: 79, minPaxCarried: 23, maxPaxCarried: 84 , paxLevels: [{"pax":18,"trips":60,"revenue":22629,"emptySeats":43,"seatFillPct":30},{"pax":31,"trips":79,"revenue":35730,"emptySeats":31,"seatFillPct":50},{"pax":49,"trips":119,"revenue":61932,"emptySeats":12,"seatFillPct":80},{"pax":61,"trips":139,"revenue":83370,"emptySeats":0,"seatFillPct":100}] },
        { licensePlate: 'K70 CLN', capacity: 70, trips: 278, totalPax: 16031, avgPaxPerTrip: 57.7, totalEmptySeats: 3479, avgSeatFillPct: 82.4, highEmptyTrips: 78, minPaxCarried: 16, maxPaxCarried: 76 , paxLevels: [{"pax":21,"trips":42,"revenue":15846,"emptySeats":49,"seatFillPct":30},{"pax":35,"trips":56,"revenue":25020,"emptySeats":35,"seatFillPct":50},{"pax":56,"trips":83,"revenue":43368,"emptySeats":14,"seatFillPct":80},{"pax":70,"trips":97,"revenue":58380,"emptySeats":0,"seatFillPct":100}] },
        { licensePlate: 'A15 CLN', capacity: 59, trips: 343, totalPax: 18639, avgPaxPerTrip: 54.3, totalEmptySeats: 2676, avgSeatFillPct: 92.1, highEmptyTrips: 71, minPaxCarried: 20, maxPaxCarried: 84 , paxLevels: [{"pax":18,"trips":51,"revenue":19551,"emptySeats":41,"seatFillPct":30},{"pax":30,"trips":69,"revenue":30870,"emptySeats":30,"seatFillPct":50},{"pax":47,"trips":103,"revenue":53508,"emptySeats":12,"seatFillPct":80},{"pax":59,"trips":120,"revenue":72030,"emptySeats":0,"seatFillPct":100}] },
      ],
      mismatchedTrips: [
        { id: 1, tripCode: 'CL-003300-S01-N001', dateKey: 20251001, tripType: 'Private Hire', customerName: 'KINGSTHORPE VILLAGE PRIMARY SCHOOL', customerCategory: 'Schools', pax: 12, licensePlate: 'A14 CLC', capacity: 72, emptySeats: 60, seatFillPct: 16.7 },
        { id: 2, tripCode: 'CL-001745-S01-N001', dateKey: 20250604, tripType: 'Private Hire', customerName: 'KINGSTHORPE VILLAGE PRIMARY SCHOOL', customerCategory: 'Schools', pax: 12, licensePlate: 'A14 CLC', capacity: 72, emptySeats: 60, seatFillPct: 16.7 },
        { id: 3, tripCode: 'CL-004410-S01-N001', dateKey: 20250704, tripType: 'Private Hire', customerName: 'NORTHAMPTON RUGBY CLUB', customerCategory: 'Sports', pax: 27, licensePlate: 'W16 CLN', capacity: 84, emptySeats: 57, seatFillPct: 32.1 },
        { id: 4, tripCode: 'CL-005110-S01-N001', dateKey: 20250918, tripType: 'Private Hire', customerName: 'ST ANDREWS HEALTHCARE', customerCategory: 'Corporate', pax: 29, licensePlate: 'V16 CLN', capacity: 84, emptySeats: 55, seatFillPct: 34.5 },
        { id: 5, tripCode: 'CL-004120-S01-N001', dateKey: 20250812, tripType: 'Private Hire', customerName: 'SILVERSTONE MOTORSPORTS', customerCategory: 'Events', pax: 20, licensePlate: 'A8 CLN', capacity: 61, emptySeats: 41, seatFillPct: 32.8 },
        { id: 6, tripCode: 'CL-005230-S01-N001', dateKey: 20250902, tripType: 'Private Hire', customerName: 'NORTHAMPTON COLLEGE', customerCategory: 'Education', pax: 22, licensePlate: 'TSO 30X', capacity: 76, emptySeats: 54, seatFillPct: 28.9 },
        { id: 7, tripCode: 'CL-003890-S01-N001', dateKey: 20250720, tripType: 'Private Hire', customerName: 'LOCAL WEDDING PARTY', customerCategory: 'Private Hire', pax: 18, licensePlate: 'V99 CLN', capacity: 59, emptySeats: 41, seatFillPct: 30.5 },
      ],
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
    comparison: {
      id: 'comparison',
      title: 'Period Comparison',
      description: 'Direct comparison of revenue, journeys, passenger volumes, and coach utilisation between any two dates or custom date ranges.',
      basePeriod: {
        from: '2026-10-01',
        to: '2026-10-31',
        isSingleDay: false,
      },
      comparePeriod: {
        from: '2025-10-01',
        to: '2025-10-31',
        isSingleDay: false,
      },
      depot: 'All',
      segment: 'All',
      kpis: {
        all: {
          baseRevenue: 284500,
          compRevenue: 251200,
          revenueDiff: 33300,
          revenueDelta: 0.1326,
          baseTrips: 1120,
          compTrips: 1045,
          tripsDiff: 75,
          tripsDelta: 0.0718,
          baseBookings: 840,
          compBookings: 790,
          bookingsDiff: 50,
          bookingsDelta: 0.0633,
          basePax: 54800,
          compPax: 50200,
          paxDiff: 4600,
          paxDelta: 0.0916,
          baseAvgPaxPerTrip: 48.9,
          compAvgPaxPerTrip: 48.0,
          baseHours: 4210,
          compHours: 3950,
          hoursDiff: 260,
          hoursDelta: 0.0658,
          baseRevPerHour: 68,
          compRevPerHour: 64,
        },
        privateHire: {
          baseRevenue: 172000,
          compRevenue: 148000,
          revenueDiff: 24000,
          revenueDelta: 0.1622,
          baseTrips: 340,
          compTrips: 310,
          tripsDiff: 30,
          tripsDelta: 0.0968,
          baseBookings: 290,
          compBookings: 265,
          bookingsDiff: 25,
          bookingsDelta: 0.0943,
          basePax: 17500,
          compPax: 15400,
          paxDiff: 2100,
          paxDelta: 0.1364,
          baseAvgPaxPerTrip: 51.5,
          compAvgPaxPerTrip: 49.7,
          baseHours: 2150,
          compHours: 1980,
          hoursDiff: 170,
          hoursDelta: 0.0859,
          baseRevPerHour: 80,
          compRevPerHour: 75,
        },
        contracts: {
          baseRevenue: 112500,
          compRevenue: 103200,
          revenueDiff: 9300,
          revenueDelta: 0.0901,
          baseTrips: 780,
          compTrips: 735,
          tripsDiff: 45,
          tripsDelta: 0.0612,
          baseBookings: 550,
          compBookings: 525,
          bookingsDiff: 25,
          bookingsDelta: 0.0476,
          basePax: 37300,
          compPax: 34800,
          paxDiff: 2500,
          paxDelta: 0.0718,
          baseAvgPaxPerTrip: 47.8,
          compAvgPaxPerTrip: 47.3,
          baseHours: 2060,
          compHours: 1970,
          hoursDiff: 90,
          hoursDelta: 0.0457,
          baseRevPerHour: 55,
          compRevPerHour: 52,
        },
      },
      vehicles: [
        { licensePlate: 'A8 CLN', capacity: 61, baseRevenue: 14200, compRevenue: 12100, revenueDiff: 2100, revenueDelta: 0.1736, baseTrips: 34, compTrips: 29, tripsDiff: 5, tripsDelta: 0.1724, basePax: 1720, compPax: 1450, paxDiff: 270 },
        { licensePlate: 'Y16 CLN', capacity: 84, baseRevenue: 13800, compRevenue: 11500, revenueDiff: 2300, revenueDelta: 0.2000, baseTrips: 28, compTrips: 25, tripsDiff: 3, tripsDelta: 0.1200, basePax: 1950, compPax: 1780, paxDiff: 170 },
        { licensePlate: 'V99 CLN', capacity: 59, baseRevenue: 12900, compRevenue: 13400, revenueDiff: -500, revenueDelta: -0.0373, baseTrips: 32, compTrips: 33, tripsDiff: -1, tripsDelta: -0.0303, basePax: 1610, compPax: 1680, paxDiff: -70 },
        { licensePlate: 'T1 CLN', capacity: 59, baseRevenue: 12400, compRevenue: 10800, revenueDiff: 1600, revenueDelta: 0.1481, baseTrips: 30, compTrips: 27, tripsDiff: 3, tripsDelta: 0.1111, basePax: 1530, compPax: 1390, paxDiff: 140 },
        { licensePlate: 'TSO 30X', capacity: 76, baseRevenue: 11800, compRevenue: 10200, revenueDiff: 1600, revenueDelta: 0.1569, baseTrips: 26, compTrips: 24, tripsDiff: 2, tripsDelta: 0.0833, basePax: 1580, compPax: 1410, paxDiff: 170 },
      ],
      categories: [
        { category: 'Schools', baseRevenue: 98000, compRevenue: 86500, revenueDiff: 11500, revenueDelta: 0.1329, baseTrips: 420, compTrips: 390, tripsDiff: 30, tripsDelta: 0.0769 },
        { category: 'Corporate', baseRevenue: 72000, compRevenue: 64000, revenueDiff: 8000, revenueDelta: 0.1250, baseTrips: 280, compTrips: 260, tripsDiff: 20, tripsDelta: 0.0769 },
        { category: 'Events / Sports', baseRevenue: 48000, compRevenue: 41000, revenueDiff: 7000, revenueDelta: 0.1707, baseTrips: 180, compTrips: 165, tripsDiff: 15, tripsDelta: 0.0909 },
        { category: 'Private Hire', baseRevenue: 41500, compRevenue: 37200, revenueDiff: 4300, revenueDelta: 0.1156, baseTrips: 150, compTrips: 140, tripsDiff: 10, tripsDelta: 0.0714 },
      ],
    },
    walkaroundCompliance: {
      id: 'walkaround-compliance',
      title: 'Walk Around Compliance',
      description:
        'Verification of mandatory driver walkaround checks in VMS against all vehicles allocated operational work in Redshift. Identifies missing inspections for first allocated drivers.',
      date: '2026-10-23',
      dateKey: 20261023,
      lastSync: {
        lastSyncAt: new Date().toISOString(),
        totalChecksSaved: 605,
      },
      kpis: {
        totalAllocated: 36,
        compliantCount: 20,
        missingCount: 5,
        defectCount: 11,
        lateCount: 7,
        complianceRate: 86.1,
        unallocatedChecksCount: 4,
      },
      records: [
        {
          licensePlate: 'T1 CLN',
          vehicleName: 'T1 CLN (59)',
          capacity: 59,
          firstDepartureTime: '2026-10-23T00:30:00.000Z',
          firstAllocatedDriver: 'Nicholas Clack',
          firstAllocatedDriverId: 101,
          firstTripCode: 'CL-F1528-R17',
          firstTripType: 'Contracts',
          customerName: 'MAGNA PARK COMMUTER',
          totalTripsToday: 3,
          status: 'missing_check',
          isLate: false,
          driverMismatch: false,
          checkSerialNo: null,
          checkStartTime: null,
          checkCompletedTime: null,
          durationMinutes: null,
          odometer: null,
          inspectingDriver: null,
          inspectingDriverId: null,
          isNilDefect: null,
          hasDefects: false,
          defects: [],
          allChecksCount: 0,
        },
        {
          licensePlate: 'A15 NFC',
          vehicleName: 'A15 NFC (70)',
          capacity: 70,
          firstDepartureTime: '2026-10-23T05:40:00.000Z',
          firstAllocatedDriver: 'Stephen Ling',
          firstAllocatedDriverId: 104,
          firstTripCode: 'CL-F1557-R37',
          firstTripType: 'Contracts',
          customerName: 'NORTHAMPTONSHIRE HIGHWAYS',
          totalTripsToday: 2,
          status: 'missing_check',
          isLate: false,
          driverMismatch: false,
          checkSerialNo: null,
          checkStartTime: null,
          checkCompletedTime: null,
          durationMinutes: null,
          odometer: null,
          inspectingDriver: null,
          inspectingDriverId: null,
          isNilDefect: null,
          hasDefects: false,
          defects: [],
          allChecksCount: 0,
        },
        {
          licensePlate: 'V16 CLN',
          vehicleName: 'V16 CLN (84)',
          capacity: 84,
          firstDepartureTime: '2026-10-23T03:05:00.000Z',
          firstAllocatedDriver: 'Craig Palethorpe',
          firstAllocatedDriverId: 72,
          firstTripCode: 'CL-F1531-R23',
          firstTripType: 'Contracts',
          customerName: 'DHL SUPPLY CHAIN',
          totalTripsToday: 5,
          status: 'compliant',
          isLate: false,
          driverMismatch: false,
          checkSerialNo: 98885,
          checkStartTime: '2026-10-23T04:48:00.000Z',
          checkCompletedTime: '2026-10-23T04:53:00.000Z',
          durationMinutes: 5,
          odometer: 312450,
          inspectingDriver: 'Craig Palethorpe',
          inspectingDriverId: 'CP',
          isNilDefect: true,
          hasDefects: false,
          defects: [],
          allChecksCount: 1,
        },
        {
          licensePlate: 'A16 CLC',
          vehicleName: 'A16 CLC (72)',
          capacity: 72,
          firstDepartureTime: '2026-10-23T04:40:00.000Z',
          firstAllocatedDriver: 'Shefit Tocilla',
          firstAllocatedDriverId: 116,
          firstTripCode: 'CL-F1567-R37',
          firstTripType: 'Contracts',
          customerName: 'AMAZON LOGISTICS',
          totalTripsToday: 9,
          status: 'defect_reported',
          isLate: false,
          driverMismatch: false,
          checkSerialNo: 98880,
          checkStartTime: '2026-10-23T06:30:00.000Z',
          checkCompletedTime: '2026-10-23T06:37:00.000Z',
          durationMinutes: 7,
          odometer: 284120,
          inspectingDriver: 'Shefit Tocilla',
          inspectingDriverId: 'ST',
          isNilDefect: false,
          hasDefects: true,
          defects: [
            {
              defectId: 4320,
              type: 'Lights',
              description: 'Nearside marker light inoperative',
              severity: 'Minor',
              comments: 'Bulb replaced by workshop',
              isRectified: true,
              rectifiedDateTime: '2026-10-23T08:15:00.000Z',
              rectifiedDescription: 'Replaced 24V bulb',
              status: 'Closed',
            },
          ],
          allChecksCount: 1,
        },
        {
          licensePlate: 'L10 NCC',
          vehicleName: 'L10 NCC (36)',
          capacity: 36,
          firstDepartureTime: '2026-10-23T04:45:00.000Z',
          firstAllocatedDriver: 'Thomas Brightwell',
          firstAllocatedDriverId: 199,
          firstTripCode: 'CL-F1458-R36',
          firstTripType: 'Contracts',
          customerName: 'BARCLAYS OPERATIONS',
          totalTripsToday: 3,
          status: 'compliant',
          isLate: false,
          driverMismatch: false,
          checkSerialNo: 98879,
          checkStartTime: '2026-10-23T06:48:00.000Z',
          checkCompletedTime: '2026-10-23T06:53:00.000Z',
          durationMinutes: 5,
          odometer: 198440,
          inspectingDriver: 'Thomas Brightwell',
          inspectingDriverId: 'TB',
          isNilDefect: true,
          hasDefects: false,
          defects: [],
          allChecksCount: 1,
        },
      ],
      unallocatedChecks: [
        {
          registrationMark: 'A8 CLN',
          fleetNo: '088',
          inspectingDriver: 'Yard Driver',
          completedTime: '2026-10-23T06:15:00.000Z',
          durationMinutes: 6,
          isNilDefect: true,
          hasDefects: false,
          defectsCount: 0,
        },
      ],
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
