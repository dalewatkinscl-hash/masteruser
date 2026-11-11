'use strict';

const {
  resolveDateRange,
  resolveMtdRange,
  shiftIsoYears,
  toYmdInt,
  ymdToIso,
} = require('./dateRange');
const { getMockFinanceData } = require('./mockFinance');
const { readRedshiftConfigFromEnv } = require('./redshiftConfig');
const { withRedshift } = require('./redshiftClient');
const { getWalkaroundComplianceReport } = require('./walkaroundComplianceService');

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Mirrors Power Query is_operational + deleted filter from CLion_Reports.pbix */
const OPERATIONAL_SQL = `
  COALESCE(t.deleted, false) = false
  AND COALESCE(t.trip_state, '') NOT IN ('draft', 'sent', 'cancel', 'lost')
  AND COALESCE(t.status, '') NOT IN ('canceled')
  AND COALESCE(t.mission_status, '') NOT IN ('canceled')
`;

function monthLabel(year, month) {
  return `${MONTH_NAMES[month - 1] ?? month} ${String(year).slice(-2)}`;
}

function delta(recent, prior) {
  if (!prior) return recent ? 1 : 0;
  return (recent - prior) / Math.abs(prior);
}

function periodStats(revenue, trips, bookings) {
  return {
    revenue: Number(revenue) || 0,
    trips: Number(trips) || 0,
    bookings: Number(bookings) || 0,
  };
}

function comparePeriods(current, prior) {
  return {
    current,
    prior,
    revenueDelta: delta(current.revenue, prior.revenue),
    tripsDelta: delta(current.trips, prior.trips),
    bookingsDelta: delta(current.bookings, prior.bookings),
  };
}

function toNamed(rows) {
  const total = rows.reduce((a, r) => a + r.amount, 0) || 1;
  return rows.map((r) => ({
    name: r.name,
    amount: r.amount,
    trips: r.trips,
    meta: r.meta,
    share: r.amount / total,
  }));
}

function sortByRevenueDesc(rows) {
  return rows.sort((a, b) => (b.revenue || 0) - (a.revenue || 0));
}

function withRevenueShares(rows) {
  const total = rows.reduce((a, r) => a + (r.revenue || 0), 0) || 1;
  return rows.map((r) => ({
    name: r.name,
    amount: r.revenue || 0,
    trips: r.trips || 0,
    share: (r.revenue || 0) / total,
    category: r.category,
  }));
}

/** Split rows that include trip_type into Private Hire / Contracts / Both scopes. */
function splitScopedRevenue(rows, keyFn) {
  const privateHire = [];
  const contracts = [];
  const bothMap = new Map();

  for (const r of rows) {
    const tripType = String(r.trip_type || '');
    const row = {
      name: r.name,
      category: r.category || undefined,
      trips: Number(r.trips) || 0,
      revenue: Number(r.revenue) || 0,
    };
    if (tripType === 'Normal') privateHire.push({ ...row });
    else if (tripType === 'Fixed') contracts.push({ ...row });

    const key = keyFn(row);
    const existing = bothMap.get(key);
    if (existing) {
      existing.trips += row.trips;
      existing.revenue += row.revenue;
    } else {
      bothMap.set(key, { ...row });
    }
  }

  return {
    privateHire: sortByRevenueDesc(privateHire),
    contracts: sortByRevenueDesc(contracts),
    both: sortByRevenueDesc([...bothMap.values()]),
  };
}



function buildVehicleUtilisationScopes(rows, fromIso, toIso) {
  const from = new Date(`${fromIso}T00:00:00Z`);
  const to = new Date(`${toIso}T00:00:00Z`);
  const daysDiff = Math.max(1, Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)) + 1);
  const availableHoursPerVehicle = Math.round(daysDiff * 12);

  const processScope = (scopedRows) => {
    const list = scopedRows.map((r) => {
      const operationalHours = Math.round((Number(r.operational_hours) || 0) * 10) / 10;
      const idleHours = Math.max(0, Math.round((availableHoursPerVehicle - operationalHours) * 10) / 10);
      const rev = Number(r.revenue) || 0;
      const trips = Number(r.trips) || 0;
      const utilisationPct = availableHoursPerVehicle > 0 ? operationalHours / availableHoursPerVehicle : 0;
      const revenuePerHour = operationalHours > 0 ? Math.round(rev / operationalHours) : 0;
      const avgHoursPerTrip = trips > 0 ? Math.round((operationalHours / trips) * 10) / 10 : 0;
      return {
        coach: r.coach,
        licensePlate: r.license_plate,
        vehicleType: r.vehicle_type,
        trips,
        operationalHours,
        idleHours,
        availableHours: availableHoursPerVehicle,
        utilisationPct,
        revenue: rev,
        revenuePerHour,
        avgHoursPerTrip,
      };
    }).sort((a, b) => b.operationalHours - a.operationalHours);

    const totalHours = Math.round(list.reduce((sum, v) => sum + v.operationalHours, 0) * 10) / 10;
    const totalIdleHours = Math.round(list.reduce((sum, v) => sum + v.idleHours, 0) * 10) / 10;
    const totalRev = list.reduce((sum, v) => sum + v.revenue, 0);
    const totalTrips = list.reduce((sum, v) => sum + v.trips, 0);
    const totalAvailable = availableHoursPerVehicle * (list.length || 1);
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
      vehicles: list,
    };
  };

  const phRows = [];
  const ctRows = [];
  const bothMap = new Map();

  for (const r of rows) {
    const tripType = String(r.trip_type || '');
    if (tripType === 'Normal') phRows.push(r);
    else if (tripType === 'Fixed') ctRows.push(r);

    const key = `${r.coach}\0${r.vehicle_type}\0${r.license_plate}`;
    const existing = bothMap.get(key);
    if (existing) {
      existing.trips = (Number(existing.trips) || 0) + (Number(r.trips) || 0);
      existing.revenue = (Number(existing.revenue) || 0) + (Number(r.revenue) || 0);
      existing.operational_hours = (Number(existing.operational_hours) || 0) + (Number(r.operational_hours) || 0);
    } else {
      bothMap.set(key, { ...r });
    }
  }

  return {
    both: {
      label: 'Both',
      ...processScope([...bothMap.values()]),
    },
    privateHire: {
      label: 'Private Hire',
      ...processScope(phRows),
    },
    contracts: {
      label: 'Contracts',
      ...processScope(ctRows),
    },
  };
}

function buildMiddayUtilisationScopes(
  vehicleRows = [],
  hourlyRows = [],
  tripRows = [],
  fromIso,
  toIso,
  phDailyRows = [],
  phBandRows = [],
) {
  const from = new Date(`${fromIso}T00:00:00Z`);
  const to = new Date(`${toIso}T00:00:00Z`);
  const daysDiff = Math.max(1, Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)) + 1);
  const availableMiddayHoursPerVehicle = Math.round(daysDiff * 5 * 10) / 10;

  const DOW_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const BAND_META = {
    minibus: { label: '1 - 16 (Minibus)', sort: 1 },
    midi: { label: '17 - 33 (Midi Coach)', sort: 2 },
    standard: { label: '34 - 49 (Standard Coach)', sort: 3 },
    executive: { label: '50 - 57 (Executive)', sort: 4 },
    high_capacity: { label: '58+ (High Capacity / Decker)', sort: 5 },
    unspecified: { label: 'Unspecified', sort: 6 },
  };

  let peakSimultaneousCoaches = 0;
  let peakDate = '';
  let peakDayOfWeek = '';
  let totalPhTrips = 0;
  let totalPhMiddayHours = 0;
  let totalPhMiddayRevenue = 0;

  const busiestDays = phDailyRows.map((d) => {
    const trips = Number(d.ph_trips) || 0;
    const peakConcurrent = Math.max(
      Number(d.active_0930_1030) || 0,
      Number(d.active_1030_1130) || 0,
      Number(d.active_1130_1230) || 0,
      Number(d.active_1230_1330) || 0,
      Number(d.active_1330_1430) || 0,
    );
    if (peakConcurrent > peakSimultaneousCoaches) {
      peakSimultaneousCoaches = peakConcurrent;
      peakDate = ymdToIso(d.ymd);
      peakDayOfWeek = DOW_NAMES[Number(d.dow_num)] || '';
    }
    totalPhTrips += trips;
    totalPhMiddayHours += Number(d.midday_hours_sold) || 0;
    totalPhMiddayRevenue += Number(d.revenue) || 0;

    return {
      date: ymdToIso(d.ymd),
      dayOfWeek: DOW_NAMES[Number(d.dow_num)] || '',
      phTrips: trips,
      peakConcurrent,
      hoursSold: Math.round((Number(d.midday_hours_sold) || 0) * 10) / 10,
      revenue: Math.round(Number(d.revenue) || 0),
    };
  }).sort((a, b) => b.phTrips - a.phTrips || b.peakConcurrent - a.peakConcurrent);

  const slotDemand = [
    {
      slot: '09:30 - 10:30',
      peakCoaches: Math.max(0, ...phDailyRows.map((d) => Number(d.active_0930_1030) || 0)),
      avgCoaches: phDailyRows.length > 0
        ? Math.round((phDailyRows.reduce((sum, d) => sum + (Number(d.active_0930_1030) || 0), 0) / phDailyRows.length) * 10) / 10
        : 0,
    },
    {
      slot: '10:30 - 11:30',
      peakCoaches: Math.max(0, ...phDailyRows.map((d) => Number(d.active_1030_1130) || 0)),
      avgCoaches: phDailyRows.length > 0
        ? Math.round((phDailyRows.reduce((sum, d) => sum + (Number(d.active_1030_1130) || 0), 0) / phDailyRows.length) * 10) / 10
        : 0,
    },
    {
      slot: '11:30 - 12:30',
      peakCoaches: Math.max(0, ...phDailyRows.map((d) => Number(d.active_1130_1230) || 0)),
      avgCoaches: phDailyRows.length > 0
        ? Math.round((phDailyRows.reduce((sum, d) => sum + (Number(d.active_1130_1230) || 0), 0) / phDailyRows.length) * 10) / 10
        : 0,
    },
    {
      slot: '12:30 - 13:30',
      peakCoaches: Math.max(0, ...phDailyRows.map((d) => Number(d.active_1230_1330) || 0)),
      avgCoaches: phDailyRows.length > 0
        ? Math.round((phDailyRows.reduce((sum, d) => sum + (Number(d.active_1230_1330) || 0), 0) / phDailyRows.length) * 10) / 10
        : 0,
    },
    {
      slot: '13:30 - 14:30',
      peakCoaches: Math.max(0, ...phDailyRows.map((d) => Number(d.active_1330_1430) || 0)),
      avgCoaches: phDailyRows.length > 0
        ? Math.round((phDailyRows.reduce((sum, d) => sum + (Number(d.active_1330_1430) || 0), 0) / phDailyRows.length) * 10) / 10
        : 0,
    },
  ];

  const sizeDemand = phBandRows.map((b) => ({
    key: b.capacity_band,
    band: BAND_META[b.capacity_band]?.label || b.capacity_band,
    totalTrips: Number(b.ph_trips) || 0,
    hoursSold: Math.round((Number(b.midday_hours_sold) || 0) * 10) / 10,
    revenue: Math.round(Number(b.revenue) || 0),
    avgPax: Math.round(Number(b.avg_pax) || 0),
    sort: BAND_META[b.capacity_band]?.sort || 99,
  })).sort((a, b) => a.sort - b.sort);

  const phCapacity = {
    peakSimultaneousCoaches,
    peakDate,
    peakDayOfWeek,
    totalPhTrips,
    totalPhMiddayHours: Math.round(totalPhMiddayHours * 10) / 10,
    totalPhMiddayRevenue: Math.round(totalPhMiddayRevenue),
    avgTripsPerDay: daysDiff > 0 ? Math.round((totalPhTrips / daysDiff) * 10) / 10 : 0,
    slotDemand,
    sizeDemand,
    busiestDays: busiestDays.slice(0, 20),
  };

  const processScope = (scopedVehicles, scopedHourly, scopedTrips) => {
    const list = scopedVehicles.map((v) => {
      const middayHours = Math.round((Number(v.midday_hours) || 0) * 10) / 10;
      const totalOpsHours = Math.round((Number(v.total_operational_hours) || 0) * 10) / 10;
      const rev = Number(v.revenue) || 0;
      const trips = Number(v.trips) || 0;
      const utilisationPct = availableMiddayHoursPerVehicle > 0 ? middayHours / availableMiddayHoursPerVehicle : 0;
      const revPerMiddayHour = middayHours > 0 ? Math.round(rev / middayHours) : 0;
      const idleMiddayHours = Math.max(0, Math.round((availableMiddayHoursPerVehicle - middayHours) * 10) / 10);
      return {
        coach: v.coach,
        licensePlate: v.license_plate,
        vehicleType: v.vehicle_type,
        passengerCapacity: Number(v.passenger_capacity) || 0,
        trips,
        middayHoursSold: middayHours,
        totalOperationalHours: totalOpsHours,
        idleMiddayHours,
        availableMiddayHours: availableMiddayHoursPerVehicle,
        utilisationPct,
        revenue: rev,
        revPerMiddayHour,
        avgMiddayHoursPerTrip: trips > 0 ? Math.round((middayHours / trips) * 10) / 10 : 0,
      };
    }).sort((a, b) => b.middayHoursSold - a.middayHoursSold);

    const totalSoldMiddayHours = Math.round(list.reduce((sum, v) => sum + v.middayHoursSold, 0) * 10) / 10;
    const totalIdleMiddayHours = Math.round(list.reduce((sum, v) => sum + v.idleMiddayHours, 0) * 10) / 10;
    const totalMiddayRevenue = list.reduce((sum, v) => sum + v.revenue, 0);
    const totalMiddayTrips = list.reduce((sum, v) => sum + v.trips, 0);
    const totalAvailable = Math.round(availableMiddayHoursPerVehicle * (list.length || 1) * 10) / 10;
    const overallUtilisationPct = totalAvailable > 0 ? totalSoldMiddayHours / totalAvailable : 0;
    const avgRevPerMiddayHour = totalSoldMiddayHours > 0 ? Math.round(totalMiddayRevenue / totalSoldMiddayHours) : 0;
    const activeVehiclesCount = list.filter((v) => v.middayHoursSold > 0).length;

    let slot1 = 0;
    let slot2 = 0;
    let slot3 = 0;
    let slot4 = 0;
    let slot5 = 0;
    const dowMap = new Map();
    for (let i = 0; i < 7; i++) {
      dowMap.set(i, { day: DOW_NAMES[i], dowNum: i, hoursSold: 0, trips: 0, revenue: 0 });
    }

    for (const h of scopedHourly) {
      slot1 += Number(h.slot_0930_1030) || 0;
      slot2 += Number(h.slot_1030_1130) || 0;
      slot3 += Number(h.slot_1130_1230) || 0;
      slot4 += Number(h.slot_1230_1330) || 0;
      slot5 += Number(h.slot_1330_1430) || 0;

      const dNum = Number(h.dow_num);
      const entry = dowMap.get(dNum);
      if (entry) {
        const hMid = (Number(h.slot_0930_1030) || 0) +
                     (Number(h.slot_1030_1130) || 0) +
                     (Number(h.slot_1130_1230) || 0) +
                     (Number(h.slot_1230_1330) || 0) +
                     (Number(h.slot_1330_1430) || 0);
        entry.hoursSold += hMid;
        entry.trips += Number(h.trips) || 0;
        entry.revenue += Number(h.revenue) || 0;
      }
    }

    const hourlyProfile = [
      { slot: '09:30 - 10:30', hoursSold: Math.round(slot1 * 10) / 10 },
      { slot: '10:30 - 11:30', hoursSold: Math.round(slot2 * 10) / 10 },
      { slot: '11:30 - 12:30', hoursSold: Math.round(slot3 * 10) / 10 },
      { slot: '12:30 - 13:30', hoursSold: Math.round(slot4 * 10) / 10 },
      { slot: '13:30 - 14:30', hoursSold: Math.round(slot5 * 10) / 10 },
    ];

    const dayOrder = [1, 2, 3, 4, 5, 6, 0];
    const dayOfWeekProfile = dayOrder.map((num) => {
      const d = dowMap.get(num);
      return {
        day: d.day,
        hoursSold: Math.round(d.hoursSold * 10) / 10,
        trips: d.trips,
        revenue: d.revenue,
      };
    });

    const formattedTrips = scopedTrips.map((t) => {
      const formatTime = (ts) => {
        if (!ts) return '';
        try {
          const d = ts instanceof Date ? ts : new Date(ts);
          return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });
        } catch {
          return '';
        }
      };

      const dateStr = t.ymd ? ymdToIso(t.ymd) : '';
      const dow = t.dow_num != null ? (DOW_NAMES[Number(t.dow_num)] || '') : '';

      return {
        id: String(t.id || ''),
        tripCode: String(t.trip_code || t.id || ''),
        date: dateStr,
        dayOfWeek: dow,
        customerName: t.customer_name,
        customerCategory: t.customer_category,
        coach: t.coach,
        licensePlate: t.license_plate,
        vehicleType: t.vehicle_type,
        tripType: t.trip_type === 'Normal' ? 'Private Hire' : t.trip_type === 'Fixed' ? 'Contracts' : t.trip_type,
        departureTime: formatTime(t.trip_start),
        arrivalTime: formatTime(t.trip_end),
        totalTripHours: Math.round((Number(t.total_trip_hours) || 0) * 10) / 10,
        middayHoursSold: Math.round((Number(t.midday_hours_sold) || 0) * 10) / 10,
        revenue: Number(t.revenue) || 0,
      };
    });

    return {
      kpis: {
        totalMiddayHoursSold: totalSoldMiddayHours,
        totalAvailableMiddayHours: totalAvailable,
        totalIdleMiddayHours: totalIdleMiddayHours,
        overallUtilisationPct,
        avgRevenuePerMiddayHour: avgRevPerMiddayHour,
        totalMiddayRevenue,
        totalMiddayTrips,
        activeVehiclesInWindow: activeVehiclesCount,
        totalFleetVehicles: list.length,
        availableMiddayHoursPerVehicle,
        daysCount: daysDiff,
        windowHoursPerDay: 5.0,
      },
      hourlyProfile,
      dayOfWeekProfile,
      vehicles: list,
      trips: formattedTrips,
    };
  };

  const phVehicles = [];
  const ctVehicles = [];
  const bothMap = new Map();

  for (const r of vehicleRows) {
    const tripType = String(r.trip_type || '');
    if (tripType === 'Normal') phVehicles.push(r);
    else if (tripType === 'Fixed') ctVehicles.push(r);

    const key = `${r.coach}\0${r.vehicle_type}\0${r.license_plate}`;
    const existing = bothMap.get(key);
    if (existing) {
      existing.trips = (Number(existing.trips) || 0) + (Number(r.trips) || 0);
      existing.revenue = (Number(existing.revenue) || 0) + (Number(r.revenue) || 0);
      existing.midday_hours = (Number(existing.midday_hours) || 0) + (Number(r.midday_hours) || 0);
      existing.total_operational_hours = (Number(existing.total_operational_hours) || 0) + (Number(r.total_operational_hours) || 0);
    } else {
      bothMap.set(key, { ...r });
    }
  }

  const phHourly = hourlyRows.filter((r) => r.trip_type === 'Normal');
  const ctHourly = hourlyRows.filter((r) => r.trip_type === 'Fixed');

  const phTrips = tripRows.filter((r) => r.trip_type === 'Normal');
  const ctTrips = tripRows.filter((r) => r.trip_type === 'Fixed');

  return {
    both: {
      label: 'Both',
      ...processScope([...bothMap.values()], hourlyRows, tripRows),
      phCapacity,
    },
    privateHire: {
      label: 'Private Hire',
      ...processScope(phVehicles, phHourly, phTrips),
      phCapacity,
    },
    contracts: {
      label: 'Contracts',
      ...processScope(ctVehicles, ctHourly, ctTrips),
      phCapacity,
    },
    phCapacity,
  };
}

function splitVehiclesByTripType(rows) {
  const privateHire = [];
  const contracts = [];
  const bothMap = new Map();

  for (const r of rows) {
    const row = {
      coach: r.coach,
      vehicleType: r.vehicle_type,
      licensePlate: r.license_plate,
      trips: Number(r.trips) || 0,
      revenue: Number(r.revenue) || 0,
    };
    const tripType = String(r.trip_type || '');
    if (tripType === 'Normal') privateHire.push(row);
    else if (tripType === 'Fixed') contracts.push(row);

    const key = `${row.coach}\0${row.vehicleType}\0${row.licensePlate}`;
    const existing = bothMap.get(key);
    if (existing) {
      existing.trips += row.trips;
      existing.revenue += row.revenue;
    } else {
      bothMap.set(key, { ...row });
    }
  }

  return {
    privateHire: sortByRevenueDesc(privateHire),
    contracts: sortByRevenueDesc(contracts),
    both: sortByRevenueDesc([...bothMap.values()]),
  };
}

function splitDriversByTripType(rows) {
  const privateHire = [];
  const contracts = [];
  const bothMap = new Map();

  for (const r of rows) {
    const row = {
      driver: r.driver,
      trips: Number(r.trips) || 0,
      revenue: Number(r.revenue) || 0,
      active: r.active ?? undefined,
    };
    const tripType = String(r.trip_type || '');
    if (tripType === 'Normal') privateHire.push(row);
    else if (tripType === 'Fixed') contracts.push(row);

    const existing = bothMap.get(row.driver);
    if (existing) {
      existing.trips += row.trips;
      existing.revenue += row.revenue;
      if (row.active != null) existing.active = existing.active || row.active;
    } else {
      bothMap.set(row.driver, { ...row });
    }
  }

  return {
    privateHire: sortByRevenueDesc(privateHire),
    contracts: sortByRevenueDesc(contracts),
    both: sortByRevenueDesc([...bothMap.values()]),
  };
}

function kpisFromTrend(trend, bookings) {
  const half = Math.max(1, Math.floor(trend.length / 2));
  const recent = trend.slice(-half);
  const prior = trend.slice(0, Math.max(half, trend.length - half));
  const sum = (rows) => rows.reduce((a, p) => a + p.revenue, 0);
  const revenue = sum(trend);
  return {
    revenue,
    trips: trend.reduce((a, p) => a + p.trips, 0),
    bookings,
    revenueDelta: delta(sum(recent), sum(prior)),
  };
}

function parseFilters(input = {}) {
  const period = ['3m', '6m', '12m', 'ytd', 'custom'].includes(input.period) ? input.period : '12m';
  const range = resolveDateRange({
    period,
    fromDate: input.fromDate,
    toDate: input.toDate,
  });
  return {
    period: range.period,
    depot: (input.depot || '').trim() || 'All',
    segment: (input.segment || '').trim() || 'All',
    fromDate: range.from,
    toDate: range.to,
  };
}

async function fetchFromRedshift(filters, customer) {
  const from = filters.fromDate;
  const to = filters.toDate;
  const fromYmd = toYmdInt(from);
  const toYmd = toYmdInt(to);

  const result = await withRedshift(async (client) => {
    const depotClause = filters.depot !== 'All' ? 'AND g.name = $3' : '';
    const segmentClause =
      filters.segment !== 'All'
        ? `AND COALESCE(NULLIF(TRIM(c.category), ''), '(Uncategorised)') = $${filters.depot !== 'All' ? 4 : 3}`
        : '';
    const baseParams = [fromYmd, toYmd];
    if (filters.depot !== 'All') baseParams.push(filters.depot);
    if (filters.segment !== 'All') baseParams.push(filters.segment);

    const dayFilter = '(d.year * 10000 + d.month * 100 + d.day) BETWEEN $1 AND $2';
    const fromJoins = `
      FROM public.fact_teq_trip t
      JOIN public.dim_date d ON d.id = t.trip_date_datekey
      LEFT JOIN public.dim_garage g
        ON g.id = t.garage_id AND g.ferdia_partner_id = t.ferdia_partner_id
      LEFT JOIN public.dim_customer c
        ON c.id = t.customer_id AND c.ferdia_partner_id = t.ferdia_partner_id
    `;
    const whereBase = `
      WHERE ${OPERATIONAL_SQL}
        AND ${dayFilter}
        ${depotClause}
        ${segmentClause}
    `;

    const mapTrend = (rows) =>
      rows.map((r) => {
        const revenue = Number(r.revenue) || 0;
        return {
          month: monthLabel(Number(r.year), Number(r.month)),
          revenue,
          spend: 0,
          margin: revenue,
          marginPct: 1,
          tripRevenue: revenue,
          trips: Number(r.trips) || 0,
        };
      });

    // 1. Consolidated Trends (Normal, Fixed, All in 1 query)
    const trendRes = await client.query(
      `
      SELECT
        d.year,
        d.month,
        COALESCE(t.trip_type, '') AS trip_type,
        SUM(COALESCE(t.total_price_ex_vat, 0))::float8 AS revenue,
        COUNT(*)::bigint AS trips
      ${fromJoins}
      ${whereBase}
      GROUP BY d.year, d.month, t.trip_type
      ORDER BY d.year, d.month
      `,
      baseParams,
    );

    const phTrendRows = trendRes.rows.filter((r) => r.trip_type === 'Normal');
    const ctTrendRows = trendRes.rows.filter((r) => r.trip_type === 'Fixed');
    const phTrend = mapTrend(phTrendRows);
    const ctTrend = mapTrend(ctTrendRows);

    const allMonthMap = new Map();
    for (const r of trendRes.rows) {
      const key = `${r.year}-${r.month}`;
      const existing = allMonthMap.get(key);
      if (existing) {
        existing.revenue += Number(r.revenue) || 0;
        existing.trips += Number(r.trips) || 0;
      } else {
        allMonthMap.set(key, {
          year: r.year,
          month: r.month,
          revenue: Number(r.revenue) || 0,
          trips: Number(r.trips) || 0,
        });
      }
    }
    const allTrend = mapTrend([...allMonthMap.values()]);

    // 2. Consolidated Bookings (Normal, Fixed, All distinct orders in 1 query)
    const bookingsRes = await client.query(
      `
      SELECT
        COUNT(DISTINCT CASE WHEN t.trip_type = 'Normal' THEN t.order_id END)::bigint AS ph_bookings,
        COUNT(DISTINCT CASE WHEN t.trip_type = 'Fixed' THEN t.order_id END)::bigint AS ct_bookings,
        COUNT(DISTINCT t.order_id)::bigint AS all_bookings
      ${fromJoins}
      ${whereBase}
      `,
      baseParams,
    );
    const phBookings = Number(bookingsRes.rows[0]?.ph_bookings || 0);
    const ctBookings = Number(bookingsRes.rows[0]?.ct_bookings || 0);
    const allBookings = Number(bookingsRes.rows[0]?.all_bookings || 0);

    // 3. Consolidated Depots (Normal and Fixed in 1 query)
    const depotRes = await client.query(
      `
      SELECT
        COALESCE(NULLIF(TRIM(g.name), ''), '(Unassigned depot)') AS name,
        COALESCE(t.trip_type, '') AS trip_type,
        SUM(COALESCE(t.total_price_ex_vat, 0))::float8 AS amount,
        COUNT(*)::bigint AS trips
      ${fromJoins}
      ${whereBase}
      GROUP BY 1, 2
      ORDER BY amount DESC
      `,
      baseParams,
    );
    const phDepots = toNamed(
      depotRes.rows
        .filter((r) => r.trip_type === 'Normal')
        .slice(0, 12)
        .map((r) => ({ name: r.name, amount: Number(r.amount) || 0, trips: Number(r.trips) || 0 })),
    );
    const ctDepots = toNamed(
      depotRes.rows
        .filter((r) => r.trip_type === 'Fixed')
        .slice(0, 12)
        .map((r) => ({ name: r.name, amount: Number(r.amount) || 0, trips: Number(r.trips) || 0 })),
    );

    // 4. Vehicles
    const vehicleRes = await client.query(
      `
      SELECT
        COALESCE(
          NULLIF(TRIM(v.vehicle_name), ''),
          NULLIF(TRIM(v.license_plate), ''),
          'Coach #' || CAST(t.vehicle_id AS varchar)
        ) AS coach,
        COALESCE(v.vehicle_type, 'Unknown type') AS vehicle_type,
        COALESCE(TRIM(v.license_plate), '') AS license_plate,
        COALESCE(t.trip_type, '') AS trip_type,
        COUNT(*)::bigint AS trips,
        SUM(COALESCE(t.total_price_ex_vat, 0))::float8 AS revenue,
        SUM(
          CASE
            WHEN COALESCE(t.a_actualtime, t.a_plannedtime) IS NOT NULL
             AND COALESCE(t.d_actualtime, t.d_plannedtime, t.c2_actualtime, t.c2_plannedtime, t.c_actualtime, t.c_plannedtime, t.b2_actualtime, t.b2_plannedtime, t.b_actualtime, t.b_plannedtime) IS NOT NULL
            THEN LEAST(24.0, GREATEST(
              0.0,
              DATEDIFF(
                minute,
                COALESCE(t.a_actualtime, t.a_plannedtime),
                COALESCE(t.d_actualtime, t.d_plannedtime, t.c2_actualtime, t.c2_plannedtime, t.c_actualtime, t.c_plannedtime, t.b2_actualtime, t.b2_plannedtime, t.b_actualtime, t.b_plannedtime)
              ) / 60.0
            ))
            ELSE 0.0
          END
        )::float8 AS operational_hours
      ${fromJoins}
      LEFT JOIN public.dim_vehicle v
        ON v.id = t.vehicle_id AND v.ferdia_partner_id = t.ferdia_partner_id
      ${whereBase}
        AND t.vehicle_id IS NOT NULL
      GROUP BY 1, 2, 3, 4
      ORDER BY revenue DESC
      `,
      baseParams,
    );

    // 5. Drivers
    const driverRes = await client.query(
      `
      SELECT
        COALESCE(
          NULLIF(TRIM(COALESCE(e.first_name, '') || ' ' || COALESCE(e.last_name, '')), ''),
          'Driver #' || CAST(t.driver_id AS varchar)
        ) AS driver,
        COALESCE(t.trip_type, '') AS trip_type,
        COUNT(*)::bigint AS trips,
        SUM(COALESCE(t.total_price_ex_vat, 0))::float8 AS revenue,
        BOOL_OR(COALESCE(e.active, true)) AS active
      ${fromJoins}
      LEFT JOIN public.dim_employee e
        ON e.id = t.driver_id AND e.ferdia_partner_id = t.ferdia_partner_id
      ${whereBase}
        AND t.driver_id IS NOT NULL
      GROUP BY 1, 2
      ORDER BY revenue DESC
      `,
      baseParams,
    );

    const vehicleUtilisationScopes = buildVehicleUtilisationScopes(vehicleRes.rows, from, to);
    const { privateHire: phVehicles, contracts: ctVehicles, both: allVehicles } = splitVehiclesByTripType(
      vehicleRes.rows,
    );
    const { privateHire: phDrivers, contracts: ctDrivers, both: allDrivers } = splitDriversByTripType(
      driverRes.rows,
    );

    // 6. Job Type / Category
    const jobTypeRes = await client.query(
      `
      SELECT
        COALESCE(NULLIF(TRIM(c.category), ''), '(Uncategorised)') AS name,
        COALESCE(t.trip_type, '') AS trip_type,
        COUNT(*)::bigint AS trips,
        SUM(COALESCE(t.total_price_ex_vat, 0))::float8 AS revenue,
        SUM(
          CASE
            WHEN COALESCE(t.a_actualtime, t.a_plannedtime) IS NOT NULL
             AND COALESCE(t.d_actualtime, t.d_plannedtime, t.c2_actualtime, t.c2_plannedtime, t.c_actualtime, t.c_plannedtime, t.b2_actualtime, t.b2_plannedtime, t.b_actualtime, t.b_plannedtime) IS NOT NULL
            THEN LEAST(24.0, GREATEST(
              0.0,
              DATEDIFF(
                minute,
                COALESCE(t.a_actualtime, t.a_plannedtime),
                COALESCE(t.d_actualtime, t.d_plannedtime, t.c2_actualtime, t.c2_plannedtime, t.c_actualtime, t.c_plannedtime, t.b2_actualtime, t.b2_plannedtime, t.b_actualtime, t.b_plannedtime)
              ) / 60.0
            ))
            ELSE 0.0
          END
        )::float8 AS operational_hours
      ${fromJoins}
      ${whereBase}
      GROUP BY 1, 2
      ORDER BY revenue DESC
      `,
      baseParams,
    );
    const jobTypeSplit = splitScopedRevenue(jobTypeRes.rows, (row) => row.name);

    // 7. Top Customers (also provides phCustomers and ctCustomers without redundant queries)
    const topCustomerRes = await client.query(
      `
      SELECT
        COALESCE(NULLIF(TRIM(c.name), ''), '(Unknown customer)') AS name,
        COALESCE(NULLIF(TRIM(c.category), ''), '(Uncategorised)') AS category,
        COALESCE(t.trip_type, '') AS trip_type,
        COUNT(*)::bigint AS trips,
        COUNT(DISTINCT t.order_id)::bigint AS bookings,
        SUM(COALESCE(t.total_price_ex_vat, 0))::float8 AS revenue
      ${fromJoins}
      ${whereBase}
        AND t.customer_id IS NOT NULL
      GROUP BY 1, 2, 3
      ORDER BY revenue DESC
      `,
      baseParams,
    );

    const phCustomers = toNamed(
      topCustomerRes.rows
        .filter((r) => r.trip_type === 'Normal')
        .slice(0, 12)
        .map((r) => ({ name: r.name, amount: Number(r.revenue) || 0, trips: Number(r.trips) || 0 })),
    );
    const ctCustomers = toNamed(
      topCustomerRes.rows
        .filter((r) => r.trip_type === 'Fixed')
        .slice(0, 12)
        .map((r) => ({ name: r.name, amount: Number(r.revenue) || 0, trips: Number(r.trips) || 0 })),
    );

    const topCustomerSplit = splitScopedRevenue(
      topCustomerRes.rows.map((r) => ({
        ...r,
        name: r.name,
        category: r.category,
      })),
      (row) => `${row.name}\0${row.category || ''}`,
    );

    const attachBookings = (scopedRows, tripType) => {
      const source = topCustomerRes.rows.filter((r) =>
        tripType ? r.trip_type === tripType : true,
      );
      if (!tripType) {
        const map = new Map();
        for (const r of source) {
          const key = `${r.name}\0${r.category || ''}`;
          const prev = map.get(key) || 0;
          map.set(key, prev + (Number(r.bookings) || 0));
        }
        return scopedRows.map((row) => ({
          ...row,
          bookings: map.get(`${row.name}\0${row.category || ''}`) || 0,
        }));
      }
      const map = new Map(
        source.map((r) => [`${r.name}\0${r.category || ''}`, Number(r.bookings) || 0]),
      );
      return scopedRows.map((row) => ({
        ...row,
        bookings: map.get(`${row.name}\0${row.category || ''}`) || 0,
      }));
    };
    const phTopCustomers = attachBookings(topCustomerSplit.privateHire, 'Normal');
    const ctTopCustomers = attachBookings(topCustomerSplit.contracts, 'Fixed');
    const allTopCustomers = attachBookings(topCustomerSplit.both, null);

    // 8. Conversion / Quotes broken down by passenger numbers (pax)
    const conversionRes = await client.query(
      `
      WITH order_pax AS (
        SELECT
          o.id AS order_id,
          o.status,
          COALESCE(MAX(t.pax), 0) AS pax
        FROM public.fact_order o
        LEFT JOIN public.fact_teq_trip t
          ON t.order_id = o.id AND t.ferdia_partner_id = o.ferdia_partner_id
          AND COALESCE(t.deleted, false) = false
        WHERE o.order_type = 'Normal'
          AND o.order_date_datekey BETWEEN $1 AND $2
        GROUP BY o.id, o.status
      )
      SELECT
        pax,
        SUM(CASE WHEN status IN ('complete', 'done', 'manually_updated') THEN 1 ELSE 0 END)::bigint AS won,
        SUM(CASE WHEN status = 'lost' THEN 1 ELSE 0 END)::bigint AS lost,
        SUM(CASE WHEN status IN ('sent', 'draft') THEN 1 ELSE 0 END)::bigint AS open_quotes,
        SUM(CASE WHEN status = 'cancel' THEN 1 ELSE 0 END)::bigint AS cancelled,
        COUNT(*)::bigint AS quotes
      FROM order_pax
      GROUP BY pax
      ORDER BY quotes DESC
      `,
      [fromYmd, toYmd],
    );

    const BANDS = [
      { key: 'minibus', label: '1 - 16 (Minibus)', min: 1, max: 16, sort: 1 },
      { key: 'midi', label: '17 - 33 (Midi Coach)', min: 17, max: 33, sort: 2 },
      { key: 'standard', label: '34 - 49 (Standard Coach)', min: 34, max: 49, sort: 3 },
      { key: 'executive', label: '50 - 57 (Executive)', min: 50, max: 57, sort: 4 },
      { key: 'high_capacity', label: '58+ (High Capacity / Decker)', min: 58, max: 9999, sort: 5 },
      { key: 'unspecified', label: 'Unspecified / Not entered', min: 0, max: 0, sort: 6 },
    ];

    const bandMap = new Map(
      BANDS.map((b) => [b.key, { ...b, won: 0, lost: 0, openQuotes: 0, cancelled: 0, quotes: 0 }]),
    );
    let won = 0;
    let lost = 0;
    let openQuotes = 0;
    let cancelled = 0;
    let quotes = 0;

    const byPax = [];

    for (const r of conversionRes.rows) {
      const pax = Number(r.pax) || 0;
      const rWon = Number(r.won) || 0;
      const rLost = Number(r.lost) || 0;
      const rOpen = Number(r.open_quotes) || 0;
      const rCancelled = Number(r.cancelled) || 0;
      const rQuotes = Number(r.quotes) || 0;
      const rBase = rWon + rLost + rOpen;

      won += rWon;
      lost += rLost;
      openQuotes += rOpen;
      cancelled += rCancelled;
      quotes += rQuotes;

      let matchedBandKey = 'unspecified';
      if (pax >= 1 && pax <= 16) matchedBandKey = 'minibus';
      else if (pax >= 17 && pax <= 33) matchedBandKey = 'midi';
      else if (pax >= 34 && pax <= 49) matchedBandKey = 'standard';
      else if (pax >= 50 && pax <= 57) matchedBandKey = 'executive';
      else if (pax >= 58) matchedBandKey = 'high_capacity';

      const b = bandMap.get(matchedBandKey);
      b.won += rWon;
      b.lost += rLost;
      b.openQuotes += rOpen;
      b.cancelled += rCancelled;
      b.quotes += rQuotes;

      if (pax > 0) {
        byPax.push({
          pax,
          band: b.label,
          won: rWon,
          lost: rLost,
          openQuotes: rOpen,
          cancelled: rCancelled,
          quotes: rQuotes,
          acceptanceRate: rBase > 0 ? rWon / rBase : 0,
          lossRate: rBase > 0 ? rLost / rBase : 0,
        });
      }
    }

    const byPaxBand = Array.from(bandMap.values())
      .map((b) => {
        const base = b.won + b.lost + b.openQuotes;
        return {
          band: b.label,
          key: b.key,
          sortOrder: b.sort,
          won: b.won,
          lost: b.lost,
          openQuotes: b.openQuotes,
          cancelled: b.cancelled,
          quotes: b.quotes,
          acceptanceRate: base > 0 ? b.won / base : 0,
          lossRate: base > 0 ? b.lost / base : 0,
        };
      })
      .sort((a, b) => a.sortOrder - b.sortOrder);

    const acceptanceBase = won + lost + openQuotes;
    const acceptance = {
      won,
      lost,
      openQuotes,
      cancelled,
      quotes,
      acceptanceRate: acceptanceBase > 0 ? won / acceptanceBase : null,
      byPaxBand,
      byPax,
    };

    // 9. Dormant Top Customers (Lifetime trips with none in last 9 months)
    const dormantParams = [];
    let dormantSegmentClause = '';
    if (filters.segment !== 'All') {
      dormantParams.push(filters.segment);
      dormantSegmentClause = `AND COALESCE(NULLIF(TRIM(c.category), ''), '(Uncategorised)') = $1`;
    }
    const dormantRes = await client.query(
      `
      WITH trip_ops AS (
        SELECT
          t.customer_id,
          t.ferdia_partner_id,
          SUM(COALESCE(t.total_price_ex_vat, 0))::float8 AS revenue,
          COUNT(*)::bigint AS trips,
          MAX(d.year * 10000 + d.month * 100 + d.day) AS last_ymd
        FROM public.fact_teq_trip t
        JOIN public.dim_date d ON d.id = t.trip_date_datekey
        WHERE ${OPERATIONAL_SQL}
        GROUP BY 1, 2
      ),
      cutoff AS (
        SELECT CAST(TO_CHAR(DATEADD(month, -9, CURRENT_DATE), 'YYYYMMDD') AS INTEGER) AS ymd
      )
      SELECT
        COALESCE(NULLIF(TRIM(c.name), ''), '(Unknown customer)') AS name,
        COALESCE(NULLIF(TRIM(c.category), ''), '(Uncategorised)') AS category,
        t.revenue,
        t.trips,
        t.last_ymd
      FROM trip_ops t
      JOIN public.dim_customer c
        ON c.id = t.customer_id AND c.ferdia_partner_id = t.ferdia_partner_id
      CROSS JOIN cutoff k
      WHERE t.last_ymd < k.ymd
        AND LOWER(COALESCE(c.name, '')) NOT LIKE 'test %'
        ${dormantSegmentClause}
      ORDER BY t.revenue DESC
      LIMIT 10
      `,
      dormantParams,
    );
    const dormantTopCustomers = dormantRes.rows.map((r) => ({
      name: r.name,
      category: r.category,
      revenue: Number(r.revenue) || 0,
      trips: Number(r.trips) || 0,
      lastTripDate: ymdToIso(r.last_ymd),
    }));

    // 10. Consolidated 4-Period Comparisons (Single scan replaces 4 heavy sequential queries)
    const priorFrom = shiftIsoYears(from, -1);
    const priorTo = shiftIsoYears(to, -1);
    const mtd = resolveMtdRange(to);
    const mtdLy = {
      from: shiftIsoYears(mtd.from, -1),
      to: shiftIsoYears(mtd.to, -1),
    };

    const compParams = [
      toYmdInt(from),
      toYmdInt(to),
      toYmdInt(priorFrom),
      toYmdInt(priorTo),
      toYmdInt(mtd.from),
      toYmdInt(mtd.to),
      toYmdInt(mtdLy.from),
      toYmdInt(mtdLy.to),
    ];
    if (filters.depot !== 'All') compParams.push(filters.depot);
    if (filters.segment !== 'All') compParams.push(filters.segment);

    const compDepotClause = filters.depot !== 'All' ? 'AND g.name = $9' : '';
    const compSegmentClause =
      filters.segment !== 'All'
        ? `AND COALESCE(NULLIF(TRIM(c.category), ''), '(Uncategorised)') = $${filters.depot !== 'All' ? 10 : 9}`
        : '';

    const compRes = await client.query(
      `
      SELECT
        SUM(CASE WHEN d_val BETWEEN $1 AND $2 THEN COALESCE(total_price_ex_vat, 0) ELSE 0 END)::float8 AS rev_cur,
        COUNT(CASE WHEN d_val BETWEEN $1 AND $2 THEN 1 ELSE NULL END)::bigint AS trips_cur,
        COUNT(DISTINCT CASE WHEN d_val BETWEEN $1 AND $2 THEN order_id ELSE NULL END)::bigint AS bookings_cur,

        SUM(CASE WHEN d_val BETWEEN $3 AND $4 THEN COALESCE(total_price_ex_vat, 0) ELSE 0 END)::float8 AS rev_prior,
        COUNT(CASE WHEN d_val BETWEEN $3 AND $4 THEN 1 ELSE NULL END)::bigint AS trips_prior,
        COUNT(DISTINCT CASE WHEN d_val BETWEEN $3 AND $4 THEN order_id ELSE NULL END)::bigint AS bookings_prior,

        SUM(CASE WHEN d_val BETWEEN $5 AND $6 THEN COALESCE(total_price_ex_vat, 0) ELSE 0 END)::float8 AS rev_mtd,
        COUNT(CASE WHEN d_val BETWEEN $5 AND $6 THEN 1 ELSE NULL END)::bigint AS trips_mtd,
        COUNT(DISTINCT CASE WHEN d_val BETWEEN $5 AND $6 THEN order_id ELSE NULL END)::bigint AS bookings_mtd,

        SUM(CASE WHEN d_val BETWEEN $7 AND $8 THEN COALESCE(total_price_ex_vat, 0) ELSE 0 END)::float8 AS rev_mtd_ly,
        COUNT(CASE WHEN d_val BETWEEN $7 AND $8 THEN 1 ELSE NULL END)::bigint AS trips_mtd_ly,
        COUNT(DISTINCT CASE WHEN d_val BETWEEN $7 AND $8 THEN order_id ELSE NULL END)::bigint AS bookings_mtd_ly
      FROM (
        SELECT
          t.total_price_ex_vat,
          t.order_id,
          (d.year * 10000 + d.month * 100 + d.day) AS d_val
        ${fromJoins}
        WHERE ${OPERATIONAL_SQL}
          AND (
            (d.year * 10000 + d.month * 100 + d.day) BETWEEN $1 AND $2
            OR (d.year * 10000 + d.month * 100 + d.day) BETWEEN $3 AND $4
            OR (d.year * 10000 + d.month * 100 + d.day) BETWEEN $5 AND $6
            OR (d.year * 10000 + d.month * 100 + d.day) BETWEEN $7 AND $8
          )
          ${compDepotClause}
          ${compSegmentClause}
      ) sub
      `,
      compParams,
    );
    const compRow = compRes.rows[0] || {};
    const periodCurrent = periodStats(compRow.rev_cur, compRow.trips_cur, compRow.bookings_cur);
    const periodPrior = periodStats(compRow.rev_prior, compRow.trips_prior, compRow.bookings_prior);
    const mtdCurrent = periodStats(compRow.rev_mtd, compRow.trips_mtd, compRow.bookings_mtd);
    const mtdPrior = periodStats(compRow.rev_mtd_ly, compRow.trips_mtd_ly, compRow.bookings_mtd_ly);

    const comparisons = {
      period: {
        label: 'Selected period vs same dates last year',
        from,
        to,
        priorFrom,
        priorTo,
        ...comparePeriods(periodCurrent, periodPrior),
      },
      mtd: {
        label: 'Month to date vs MTD last year',
        from: mtd.from,
        to: mtd.to,
        priorFrom: mtdLy.from,
        priorTo: mtdLy.to,
        ...comparePeriods(mtdCurrent, mtdPrior),
      },
    };

    // 11. Consolidated Customer Health & Top At-Risk/Churned (1 query replaces 2 CTE scans)
    const healthParams = [];
    let healthSegmentClause = '';
    if (filters.segment !== 'All') {
      healthParams.push(filters.segment);
      healthSegmentClause = `AND COALESCE(NULLIF(TRIM(c.category), ''), '(Uncategorised)') = $1`;
    }
    const healthRes = await client.query(
      `
      WITH trip_ops AS (
        SELECT
          t.customer_id,
          t.ferdia_partner_id,
          SUM(COALESCE(t.total_price_ex_vat, 0))::float8 AS revenue,
          COUNT(*)::bigint AS trips,
          MAX(d.year * 10000 + d.month * 100 + d.day) AS last_ymd
        FROM public.fact_teq_trip t
        JOIN public.dim_date d ON d.id = t.trip_date_datekey
        WHERE ${OPERATIONAL_SQL}
        GROUP BY 1, 2
      ),
      cutoffs AS (
        SELECT
          CAST(TO_CHAR(DATEADD(day, -59, CURRENT_DATE), 'YYYYMMDD') AS INTEGER) AS active_ymd,
          CAST(TO_CHAR(DATEADD(day, -89, CURRENT_DATE), 'YYYYMMDD') AS INTEGER) AS risk_ymd
      ),
      banded AS (
        SELECT
          COALESCE(NULLIF(TRIM(c.name), ''), '(Unknown customer)') AS name,
          COALESCE(NULLIF(TRIM(c.category), ''), '(Uncategorised)') AS category,
          t.revenue,
          t.trips,
          t.last_ymd,
          CASE
            WHEN t.last_ymd >= k.active_ymd THEN 'active'
            WHEN t.last_ymd >= k.risk_ymd THEN 'atRisk'
            ELSE 'churned'
          END AS band,
          ROW_NUMBER() OVER (
            PARTITION BY (CASE WHEN t.last_ymd >= k.active_ymd THEN 'active' WHEN t.last_ymd >= k.risk_ymd THEN 'atRisk' ELSE 'churned' END)
            ORDER BY t.revenue DESC
          ) AS rn
        FROM trip_ops t
        JOIN public.dim_customer c ON c.id = t.customer_id AND c.ferdia_partner_id = t.ferdia_partner_id
        CROSS JOIN cutoffs k
        WHERE LOWER(COALESCE(c.name, '')) NOT LIKE 'test %'
          ${healthSegmentClause}
      )
      SELECT name, category, revenue, trips, last_ymd, band, rn
      FROM banded
      `,
      healthParams,
    );

    const emptyBand = { customers: 0, revenue: 0, trips: 0 };
    const healthBands = {
      active: { ...emptyBand },
      atRisk: { ...emptyBand },
      churned: { ...emptyBand },
    };
    const atRiskTop = [];
    const churnedTop = [];

    for (const row of healthRes.rows) {
      const b = row.band;
      if (healthBands[b]) {
        healthBands[b].customers += 1;
        healthBands[b].revenue += Number(row.revenue) || 0;
        healthBands[b].trips += Number(row.trips) || 0;
      }
      if (Number(row.rn) <= 10) {
        const item = {
          name: row.name,
          category: row.category,
          revenue: Number(row.revenue) || 0,
          trips: Number(row.trips) || 0,
          lastTripDate: ymdToIso(row.last_ymd),
          band: row.band,
        };
        if (b === 'atRisk') atRiskTop.push(item);
        else if (b === 'churned') churnedTop.push(item);
      }
    }

    const customerHealth = {
      bands: healthBands,
      revenueAtRisk: (healthBands.atRisk.revenue || 0) + (healthBands.churned.revenue || 0),
      atRiskTop,
      churnedTop,
      note: 'Active = last trip within 60 days; at risk = 60–89 days; churned = 90+ days (Power BI Customer Health).',
    };

    // 12. Dropdown Lists
    const depotList = await client.query(
      `SELECT name FROM public.dim_garage
         WHERE COALESCE(active, true) = true AND COALESCE(deleted, false) = false
         ORDER BY name`,
    );
    const segmentList = await client.query(
      `SELECT DISTINCT COALESCE(NULLIF(TRIM(category), ''), '(Uncategorised)') AS name
         FROM public.dim_customer
         WHERE COALESCE(deleted, false) = false
         ORDER BY 1`,
    );

    // 13. Planned vs Allocated Capacity (pax vs vehicle capacity)
    let paxCapacity = {
      kpis: {
        totalTrips: 0,
        totalPax: 0,
        totalCapacity: 0,
        totalEmptySeats: 0,
        avgSeatFillPct: 0,
        highMismatchTrips: 0,
        trips30PlusEmpty: 0,
        trips20to29Empty: 0,
        trips10to19Empty: 0,
        tripsWellMatched: 0,
        tripsOverCap: 0,
      },
      distribution: [],
      vehicles: [],
      mismatchedTrips: [],
    };

    try {
      let paxCapJoinCustomer = '';
      let paxCapSegmentClause = '';
      const paxCapParams = [fromYmd, toYmd];
      if (filters.segment !== 'All') {
        paxCapParams.push(filters.segment);
        paxCapJoinCustomer = 'JOIN public.dim_customer c ON c.id = t.customer_id AND c.ferdia_partner_id = t.ferdia_partner_id';
        paxCapSegmentClause = 'AND COALESCE(NULLIF(TRIM(c.category), \'\'), \'(Uncategorised)\') = $3';
      }

      const paxCapSummaryRes = await client.query(
        `
        SELECT
          COUNT(*)::bigint AS total_trips,
          SUM(t.pax)::bigint AS total_pax,
          SUM(v.passenger_capacity)::bigint AS total_capacity,
          SUM(GREATEST(0, v.passenger_capacity - t.pax))::bigint AS total_empty_seats,
          AVG((t.pax::float / v.passenger_capacity::float) * 100)::numeric(10,1) AS avg_seat_fill_pct,
          COUNT(CASE WHEN (v.passenger_capacity - t.pax) >= 30 THEN 1 END)::bigint AS trips_empty_30_plus,
          COUNT(CASE WHEN (v.passenger_capacity - t.pax) >= 20 AND (v.passenger_capacity - t.pax) < 30 THEN 1 END)::bigint AS trips_empty_20_29,
          COUNT(CASE WHEN (v.passenger_capacity - t.pax) >= 10 AND (v.passenger_capacity - t.pax) < 20 THEN 1 END)::bigint AS trips_empty_10_19,
          COUNT(CASE WHEN (v.passenger_capacity - t.pax) >= 0 AND (v.passenger_capacity - t.pax) < 10 THEN 1 END)::bigint AS trips_well_matched,
          COUNT(CASE WHEN (v.passenger_capacity - t.pax) < 0 THEN 1 END)::bigint AS trips_over_capacity
        FROM public.fact_teq_trip t
        JOIN public.dim_vehicle v ON v.id = t.vehicle_id AND v.ferdia_partner_id = t.ferdia_partner_id
        ${paxCapJoinCustomer}
        WHERE COALESCE(t.deleted, false) = false
          AND COALESCE(t.trip_state, '') NOT IN ('draft', 'sent', 'cancel', 'lost')
          AND COALESCE(t.status, '') NOT IN ('canceled')
          AND COALESCE(t.mission_status, '') NOT IN ('canceled')
          AND t.trip_type = 'Normal'
          AND t.trip_date_datekey BETWEEN $1 AND $2
          AND t.pax > 0
          AND v.passenger_capacity > 0
          ${paxCapSegmentClause}
        `,
        paxCapParams,
      );
      const pcs = paxCapSummaryRes.rows[0] || {};

      const paxCapMismatchedRes = await client.query(
        `
        SELECT
          t.id,
          t.trip_code,
          t.trip_date_datekey,
          t.trip_type,
          COALESCE(c.name, '(Unknown)') AS customer_name,
          COALESCE(c.category, '(Uncategorised)') AS customer_category,
          t.pax,
          v.license_plate,
          v.passenger_capacity AS capacity,
          (v.passenger_capacity - t.pax) AS empty_seats,
          ROUND((t.pax::float / v.passenger_capacity::float) * 100, 1) AS seat_fill_pct
        FROM public.fact_teq_trip t
        JOIN public.dim_vehicle v ON v.id = t.vehicle_id AND v.ferdia_partner_id = t.ferdia_partner_id
        LEFT JOIN public.dim_customer c ON c.id = t.customer_id AND c.ferdia_partner_id = t.ferdia_partner_id
        WHERE COALESCE(t.deleted, false) = false
          AND COALESCE(t.trip_state, '') NOT IN ('draft', 'sent', 'cancel', 'lost')
          AND COALESCE(t.status, '') NOT IN ('canceled')
          AND COALESCE(t.mission_status, '') NOT IN ('canceled')
          AND t.trip_type = 'Normal'
          AND t.trip_date_datekey BETWEEN $1 AND $2
          AND t.pax > 0
          AND v.passenger_capacity > 0
          AND (v.passenger_capacity - t.pax) >= 20
          ${paxCapSegmentClause}
        ORDER BY empty_seats DESC, t.trip_date_datekey DESC
        LIMIT 100
        `,
        paxCapParams,
      );

      const paxCapLevelsRes = await client.query(
        `
        SELECT
          v.license_plate,
          v.passenger_capacity AS capacity,
          t.pax,
          COUNT(*)::bigint AS trips,
          SUM(COALESCE(t.total_price_ex_vat, 0))::float8 AS revenue,
          (v.passenger_capacity - t.pax) AS empty_seats,
          ROUND((t.pax::float / v.passenger_capacity::float) * 100, 1) AS seat_fill_pct
        FROM public.fact_teq_trip t
        JOIN public.dim_vehicle v ON v.id = t.vehicle_id AND v.ferdia_partner_id = t.ferdia_partner_id
        ${paxCapJoinCustomer}
        WHERE COALESCE(t.deleted, false) = false
          AND COALESCE(t.trip_state, '') NOT IN ('draft', 'sent', 'cancel', 'lost')
          AND COALESCE(t.status, '') NOT IN ('canceled')
          AND COALESCE(t.mission_status, '') NOT IN ('canceled')
          AND t.trip_type = 'Normal'
          AND t.trip_date_datekey BETWEEN $1 AND $2
          AND t.pax > 0
          AND v.passenger_capacity > 0
          ${paxCapSegmentClause}
        GROUP BY v.license_plate, v.passenger_capacity, t.pax
        ORDER BY v.license_plate, t.pax ASC
        `,
        paxCapParams,
      );

      const vehicleMap = new Map();
      for (const r of paxCapLevelsRes.rows) {
        const plate = r.license_plate;
        const cap = Number(r.capacity) || 0;
        const pax = Number(r.pax) || 0;
        const trips = Number(r.trips) || 0;
        const rev = Number(r.revenue) || 0;
        const emptySeats = cap - pax;
        const fillPct = cap > 0 ? Math.round((pax / cap) * 1000) / 10 : 0;

        if (!vehicleMap.has(plate)) {
          vehicleMap.set(plate, {
            licensePlate: plate,
            capacity: cap,
            trips: 0,
            totalPax: 0,
            totalEmptySeats: 0,
            highEmptyTrips: 0,
            minPaxCarried: pax,
            maxPaxCarried: pax,
            weightedFillSum: 0,
            paxLevels: [],
          });
        }

        const v = vehicleMap.get(plate);
        v.trips += trips;
        v.totalPax += (pax * trips);
        v.totalEmptySeats += Math.max(0, emptySeats) * trips;
        if (emptySeats >= 20) {
          v.highEmptyTrips += trips;
        }
        if (pax < v.minPaxCarried) v.minPaxCarried = pax;
        if (pax > v.maxPaxCarried) v.maxPaxCarried = pax;
        v.weightedFillSum += (fillPct * trips);

        v.paxLevels.push({
          pax,
          trips,
          revenue: rev,
          emptySeats,
          seatFillPct: fillPct,
        });
      }

      const paxCapacityVehicles = Array.from(vehicleMap.values()).map((v) => ({
        licensePlate: v.licensePlate,
        capacity: v.capacity,
        trips: v.trips,
        totalPax: v.totalPax,
        avgPaxPerTrip: v.trips > 0 ? Math.round((v.totalPax / v.trips) * 10) / 10 : 0,
        totalEmptySeats: v.totalEmptySeats,
        avgSeatFillPct: v.trips > 0 ? Math.round((v.weightedFillSum / v.trips) * 10) / 10 : 0,
        highEmptyTrips: v.highEmptyTrips,
        minPaxCarried: v.minPaxCarried,
        maxPaxCarried: v.maxPaxCarried,
        paxLevels: v.paxLevels.sort((a, b) => a.pax - b.pax),
      })).sort((a, b) => b.highEmptyTrips - a.highEmptyTrips || b.totalEmptySeats - a.totalEmptySeats);

      const totalTrips = Number(pcs.total_trips) || 0;
      const totalPax = Number(pcs.total_pax) || 0;
      const trips30Plus = Number(pcs.trips_empty_30_plus) || 0;
      const trips20to29 = Number(pcs.trips_empty_20_29) || 0;
      const trips10to19 = Number(pcs.trips_empty_10_19) || 0;
      const tripsWellMatched = Number(pcs.trips_well_matched) || 0;
      const tripsOverCap = Number(pcs.trips_over_capacity) || 0;

      paxCapacity = {
        title: 'Planned vs Actual Pax (Private Hire)',
        description:
          'Comparison of planned passenger count against allocated vehicle seating capacity for Private Hire journeys. Identifies over-capacity allocations (e.g. 20 passengers in a 53-seat coach) and seat utilization efficiency.',
        kpis: {
          totalTrips,
          totalPax,
          totalCapacity: Number(pcs.total_capacity) || 0,
          totalEmptySeats: Number(pcs.total_empty_seats) || 0,
          avgPaxPerTrip: totalTrips > 0 ? Math.round((totalPax / totalTrips) * 10) / 10 : 0,
          avgSeatFillPct: Number(pcs.avg_seat_fill_pct) || 0,
          highMismatchTrips: trips30Plus + trips20to29,
          trips30PlusEmpty: trips30Plus,
          trips20to29Empty: trips20to29,
          trips10to19Empty: trips10to19,
          tripsWellMatched,
          tripsOverCap,
        },
        distribution: [
          {
            key: 'severe',
            label: 'Severe (30+ Empty Seats)',
            shortLabel: '30+ Empty',
            count: trips30Plus,
            pct: totalTrips > 0 ? (trips30Plus / totalTrips) * 100 : 0,
            color: '#ef4444',
            description: 'Small groups on large coaches (e.g. ≤24 pax in 53+ seaters)',
          },
          {
            key: 'moderate',
            label: 'Moderate (20–29 Empty Seats)',
            shortLabel: '20-29 Empty',
            count: trips20to29,
            pct: totalTrips > 0 ? (trips20to29 / totalTrips) * 100 : 0,
            color: '#f97316',
            description: 'Substantial excess vehicle capacity dispatched',
          },
          {
            key: 'mild',
            label: 'Mild (10–19 Empty Seats)',
            shortLabel: '10-19 Empty',
            count: trips10to19,
            pct: totalTrips > 0 ? (trips10to19 / totalTrips) * 100 : 0,
            color: '#eab308',
            description: 'Standard comfortable headroom',
          },
          {
            key: 'optimal',
            label: 'Optimal (0–9 Empty Seats)',
            shortLabel: '0-9 Empty',
            count: tripsWellMatched,
            pct: totalTrips > 0 ? (tripsWellMatched / totalTrips) * 100 : 0,
            color: '#10b981',
            description: 'Right-sized vehicle dispatched for group size',
          },
          {
            key: 'full',
            label: 'Full / At Max Capacity',
            shortLabel: 'Full / Max',
            count: tripsOverCap,
            pct: totalTrips > 0 ? (tripsOverCap / totalTrips) * 100 : 0,
            color: '#3b82f6',
            description: '100% capacity utilization or high passenger load',
          },
        ],
        vehicles: paxCapacityVehicles,
        mismatchedTrips: paxCapMismatchedRes.rows.map((r) => ({
          id: r.id,
          tripCode: r.trip_code,
          dateKey: ymdToIso(r.trip_date_datekey),
          tripType: r.trip_type === 'Normal' ? 'Private Hire' : r.trip_type === 'Fixed' ? 'Contracts' : r.trip_type,
          customerName: r.customer_name,
          customerCategory: r.customer_category,
          pax: Number(r.pax) || 0,
          licensePlate: r.license_plate,
          capacity: Number(r.capacity) || 0,
          emptySeats: Number(r.empty_seats) || 0,
          seatFillPct: Number(r.seat_fill_pct) || 0,
        })),
      };
    } catch (err) {
      console.error('[financeService] paxCapacity query failed:', err.message);
    }

    // 14. Midday Utilisation (09:30 - 14:30 Operational Hours Sold)
    let middayUtilisationScopes = buildMiddayUtilisationScopes([], [], [], from, to);
    try {
      const middayVehicleRes = await client.query(
        `
        SELECT
          COALESCE(
            NULLIF(TRIM(v.vehicle_name), ''),
            NULLIF(TRIM(v.license_plate), ''),
            'Coach #' || CAST(t.vehicle_id AS varchar)
          ) AS coach,
          COALESCE(TRIM(v.license_plate), '') AS license_plate,
          COALESCE(v.vehicle_type, 'Unknown type') AS vehicle_type,
          COALESCE(v.passenger_capacity, 0)::int AS passenger_capacity,
          COALESCE(t.trip_type, '') AS trip_type,
          COUNT(*)::bigint AS trips,
          SUM(COALESCE(t.total_price_ex_vat, 0))::float8 AS revenue,
          SUM(
            CASE
              WHEN COALESCE(t.a_actualtime, t.a_plannedtime) IS NOT NULL
               AND COALESCE(t.d_actualtime, t.d_plannedtime, t.c2_actualtime, t.c2_plannedtime, t.c_actualtime, t.c_plannedtime, t.b2_actualtime, t.b2_plannedtime, t.b_actualtime, t.b_plannedtime) IS NOT NULL
               AND COALESCE(t.a_actualtime, t.a_plannedtime) < DATEADD(minute, 870, DATE_TRUNC('day', COALESCE(t.a_actualtime, t.a_plannedtime)))
               AND COALESCE(t.d_actualtime, t.d_plannedtime, t.c2_actualtime, t.c2_plannedtime, t.c_actualtime, t.c_plannedtime, t.b2_actualtime, t.b2_plannedtime, t.b_actualtime, t.b_plannedtime) > DATEADD(minute, 570, DATE_TRUNC('day', COALESCE(t.a_actualtime, t.a_plannedtime)))
              THEN LEAST(5.0, GREATEST(0.0,
                DATEDIFF(
                  minute,
                  GREATEST(COALESCE(t.a_actualtime, t.a_plannedtime), DATEADD(minute, 570, DATE_TRUNC('day', COALESCE(t.a_actualtime, t.a_plannedtime)))),
                  LEAST(COALESCE(t.d_actualtime, t.d_plannedtime, t.c2_actualtime, t.c2_plannedtime, t.c_actualtime, t.c_plannedtime, t.b2_actualtime, t.b2_plannedtime, t.b_actualtime, t.b_plannedtime), DATEADD(minute, 870, DATE_TRUNC('day', COALESCE(t.a_actualtime, t.a_plannedtime))))
                ) / 60.0
              ))
              ELSE 0.0
            END
          )::float8 AS midday_hours,
          SUM(
            CASE
              WHEN COALESCE(t.a_actualtime, t.a_plannedtime) IS NOT NULL
               AND COALESCE(t.d_actualtime, t.d_plannedtime, t.c2_actualtime, t.c2_plannedtime, t.c_actualtime, t.c_plannedtime, t.b2_actualtime, t.b2_plannedtime, t.b_actualtime, t.b_plannedtime) IS NOT NULL
              THEN LEAST(24.0, GREATEST(0.0,
                DATEDIFF(
                  minute,
                  COALESCE(t.a_actualtime, t.a_plannedtime),
                  COALESCE(t.d_actualtime, t.d_plannedtime, t.c2_actualtime, t.c2_plannedtime, t.c_actualtime, t.c_plannedtime, t.b2_actualtime, t.b2_plannedtime, t.b_actualtime, t.b_plannedtime)
                ) / 60.0
              ))
              ELSE 0.0
            END
          )::float8 AS total_operational_hours
        ${fromJoins}
        LEFT JOIN public.dim_vehicle v
          ON v.id = t.vehicle_id AND v.ferdia_partner_id = t.ferdia_partner_id
        ${whereBase}
          AND t.vehicle_id IS NOT NULL
        GROUP BY 1, 2, 3, 4, 5
        ORDER BY midday_hours DESC
        `,
        baseParams,
      );

      const middayHourlyRes = await client.query(
        `
        SELECT
          EXTRACT(dow FROM COALESCE(t.a_actualtime, t.a_plannedtime))::int AS dow_num,
          COALESCE(t.trip_type, '') AS trip_type,
          COUNT(*)::bigint AS trips,
          SUM(COALESCE(t.total_price_ex_vat, 0))::float8 AS revenue,
          SUM(
            CASE
              WHEN COALESCE(t.a_actualtime, t.a_plannedtime) < DATEADD(minute, 630, DATE_TRUNC('day', COALESCE(t.a_actualtime, t.a_plannedtime)))
               AND COALESCE(t.d_actualtime, t.d_plannedtime, t.c2_actualtime, t.c2_plannedtime, t.c_actualtime, t.c_plannedtime, t.b2_actualtime, t.b2_plannedtime, t.b_actualtime, t.b_plannedtime) > DATEADD(minute, 570, DATE_TRUNC('day', COALESCE(t.a_actualtime, t.a_plannedtime)))
              THEN LEAST(1.0, GREATEST(0.0, DATEDIFF(minute,
                GREATEST(COALESCE(t.a_actualtime, t.a_plannedtime), DATEADD(minute, 570, DATE_TRUNC('day', COALESCE(t.a_actualtime, t.a_plannedtime)))),
                LEAST(COALESCE(t.d_actualtime, t.d_plannedtime, t.c2_actualtime, t.c2_plannedtime, t.c_actualtime, t.c_plannedtime, t.b2_actualtime, t.b2_plannedtime, t.b_actualtime, t.b_plannedtime), DATEADD(minute, 630, DATE_TRUNC('day', COALESCE(t.a_actualtime, t.a_plannedtime))))
              ) / 60.0))
              ELSE 0.0
            END
          )::float8 AS slot_0930_1030,
          SUM(
            CASE
              WHEN COALESCE(t.a_actualtime, t.a_plannedtime) < DATEADD(minute, 690, DATE_TRUNC('day', COALESCE(t.a_actualtime, t.a_plannedtime)))
               AND COALESCE(t.d_actualtime, t.d_plannedtime, t.c2_actualtime, t.c2_plannedtime, t.c_actualtime, t.c_plannedtime, t.b2_actualtime, t.b2_plannedtime, t.b_actualtime, t.b_plannedtime) > DATEADD(minute, 630, DATE_TRUNC('day', COALESCE(t.a_actualtime, t.a_plannedtime)))
              THEN LEAST(1.0, GREATEST(0.0, DATEDIFF(minute,
                GREATEST(COALESCE(t.a_actualtime, t.a_plannedtime), DATEADD(minute, 630, DATE_TRUNC('day', COALESCE(t.a_actualtime, t.a_plannedtime)))),
                LEAST(COALESCE(t.d_actualtime, t.d_plannedtime, t.c2_actualtime, t.c2_plannedtime, t.c_actualtime, t.c_plannedtime, t.b2_actualtime, t.b2_plannedtime, t.b_actualtime, t.b_plannedtime), DATEADD(minute, 690, DATE_TRUNC('day', COALESCE(t.a_actualtime, t.a_plannedtime))))
              ) / 60.0))
              ELSE 0.0
            END
          )::float8 AS slot_1030_1130,
          SUM(
            CASE
              WHEN COALESCE(t.a_actualtime, t.a_plannedtime) < DATEADD(minute, 750, DATE_TRUNC('day', COALESCE(t.a_actualtime, t.a_plannedtime)))
               AND COALESCE(t.d_actualtime, t.d_plannedtime, t.c2_actualtime, t.c2_plannedtime, t.c_actualtime, t.c_plannedtime, t.b2_actualtime, t.b2_plannedtime, t.b_actualtime, t.b_plannedtime) > DATEADD(minute, 690, DATE_TRUNC('day', COALESCE(t.a_actualtime, t.a_plannedtime)))
              THEN LEAST(1.0, GREATEST(0.0, DATEDIFF(minute,
                GREATEST(COALESCE(t.a_actualtime, t.a_plannedtime), DATEADD(minute, 690, DATE_TRUNC('day', COALESCE(t.a_actualtime, t.a_plannedtime)))),
                LEAST(COALESCE(t.d_actualtime, t.d_plannedtime, t.c2_actualtime, t.c2_plannedtime, t.c_actualtime, t.c_plannedtime, t.b2_actualtime, t.b2_plannedtime, t.b_actualtime, t.b_plannedtime), DATEADD(minute, 750, DATE_TRUNC('day', COALESCE(t.a_actualtime, t.a_plannedtime))))
              ) / 60.0))
              ELSE 0.0
            END
          )::float8 AS slot_1130_1230,
          SUM(
            CASE
              WHEN COALESCE(t.a_actualtime, t.a_plannedtime) < DATEADD(minute, 810, DATE_TRUNC('day', COALESCE(t.a_actualtime, t.a_plannedtime)))
               AND COALESCE(t.d_actualtime, t.d_plannedtime, t.c2_actualtime, t.c2_plannedtime, t.c_actualtime, t.c_plannedtime, t.b2_actualtime, t.b2_plannedtime, t.b_actualtime, t.b_plannedtime) > DATEADD(minute, 750, DATE_TRUNC('day', COALESCE(t.a_actualtime, t.a_plannedtime)))
              THEN LEAST(1.0, GREATEST(0.0, DATEDIFF(minute,
                GREATEST(COALESCE(t.a_actualtime, t.a_plannedtime), DATEADD(minute, 750, DATE_TRUNC('day', COALESCE(t.a_actualtime, t.a_plannedtime)))),
                LEAST(COALESCE(t.d_actualtime, t.d_plannedtime, t.c2_actualtime, t.c2_plannedtime, t.c_actualtime, t.c_plannedtime, t.b2_actualtime, t.b2_plannedtime, t.b_actualtime, t.b_plannedtime), DATEADD(minute, 810, DATE_TRUNC('day', COALESCE(t.a_actualtime, t.a_plannedtime))))
              ) / 60.0))
              ELSE 0.0
            END
          )::float8 AS slot_1230_1330,
          SUM(
            CASE
              WHEN COALESCE(t.a_actualtime, t.a_plannedtime) < DATEADD(minute, 870, DATE_TRUNC('day', COALESCE(t.a_actualtime, t.a_plannedtime)))
               AND COALESCE(t.d_actualtime, t.d_plannedtime, t.c2_actualtime, t.c2_plannedtime, t.c_actualtime, t.c_plannedtime, t.b2_actualtime, t.b2_plannedtime, t.b_actualtime, t.b_plannedtime) > DATEADD(minute, 810, DATE_TRUNC('day', COALESCE(t.a_actualtime, t.a_plannedtime)))
              THEN LEAST(1.0, GREATEST(0.0, DATEDIFF(minute,
                GREATEST(COALESCE(t.a_actualtime, t.a_plannedtime), DATEADD(minute, 810, DATE_TRUNC('day', COALESCE(t.a_actualtime, t.a_plannedtime)))),
                LEAST(COALESCE(t.d_actualtime, t.d_plannedtime, t.c2_actualtime, t.c2_plannedtime, t.c_actualtime, t.c_plannedtime, t.b2_actualtime, t.b2_plannedtime, t.b_actualtime, t.b_plannedtime), DATEADD(minute, 870, DATE_TRUNC('day', COALESCE(t.a_actualtime, t.a_plannedtime))))
              ) / 60.0))
              ELSE 0.0
            END
          )::float8 AS slot_1330_1430
        ${fromJoins}
        ${whereBase}
          AND COALESCE(t.a_actualtime, t.a_plannedtime) < DATEADD(minute, 870, DATE_TRUNC('day', COALESCE(t.a_actualtime, t.a_plannedtime)))
          AND COALESCE(t.d_actualtime, t.d_plannedtime, t.c2_actualtime, t.c2_plannedtime, t.c_actualtime, t.c_plannedtime, t.b2_actualtime, t.b2_plannedtime, t.b_actualtime, t.b_plannedtime) > DATEADD(minute, 570, DATE_TRUNC('day', COALESCE(t.a_actualtime, t.a_plannedtime)))
        GROUP BY 1, 2
        ORDER BY dow_num ASC
        `,
        baseParams,
      );

      const middayTripsRes = await client.query(
        `
        SELECT
          t.id,
          t.trip_code,
          (d.year * 10000 + d.month * 100 + d.day) AS ymd,
          EXTRACT(dow FROM COALESCE(t.a_actualtime, t.a_plannedtime))::int AS dow_num,
          COALESCE(t.trip_type, '') AS trip_type,
          COALESCE(c.name, '(Unknown customer)') AS customer_name,
          COALESCE(c.category, '(Uncategorised)') AS customer_category,
          COALESCE(
            NULLIF(TRIM(v.vehicle_name), ''),
            NULLIF(TRIM(v.license_plate), ''),
            'Coach #' || CAST(t.vehicle_id AS varchar)
          ) AS coach,
          COALESCE(v.license_plate, '') AS license_plate,
          COALESCE(v.vehicle_type, '') AS vehicle_type,
          COALESCE(t.a_actualtime, t.a_plannedtime) AS trip_start,
          COALESCE(t.d_actualtime, t.d_plannedtime, t.c2_actualtime, t.c2_plannedtime, t.c_actualtime, t.c_plannedtime, t.b2_actualtime, t.b2_plannedtime, t.b_actualtime, t.b_plannedtime) AS trip_end,
          LEAST(24.0, GREATEST(0.0, DATEDIFF(minute,
            COALESCE(t.a_actualtime, t.a_plannedtime),
            COALESCE(t.d_actualtime, t.d_plannedtime, t.c2_actualtime, t.c2_plannedtime, t.c_actualtime, t.c_plannedtime, t.b2_actualtime, t.b2_plannedtime, t.b_actualtime, t.b_plannedtime)
          ) / 60.0))::float8 AS total_trip_hours,
          LEAST(5.0, GREATEST(0.0, DATEDIFF(minute,
            GREATEST(COALESCE(t.a_actualtime, t.a_plannedtime), DATEADD(minute, 570, DATE_TRUNC('day', COALESCE(t.a_actualtime, t.a_plannedtime)))),
            LEAST(COALESCE(t.d_actualtime, t.d_plannedtime, t.c2_actualtime, t.c2_plannedtime, t.c_actualtime, t.c_plannedtime, t.b2_actualtime, t.b2_plannedtime, t.b_actualtime, t.b_plannedtime), DATEADD(minute, 870, DATE_TRUNC('day', COALESCE(t.a_actualtime, t.a_plannedtime))))
          ) / 60.0))::float8 AS midday_hours_sold,
          COALESCE(t.total_price_ex_vat, 0)::float8 AS revenue
        ${fromJoins}
        LEFT JOIN public.dim_vehicle v
          ON v.id = t.vehicle_id AND v.ferdia_partner_id = t.ferdia_partner_id
        ${whereBase}
          AND COALESCE(t.a_actualtime, t.a_plannedtime) < DATEADD(minute, 870, DATE_TRUNC('day', COALESCE(t.a_actualtime, t.a_plannedtime)))
          AND COALESCE(t.d_actualtime, t.d_plannedtime, t.c2_actualtime, t.c2_plannedtime, t.c_actualtime, t.c_plannedtime, t.b2_actualtime, t.b2_plannedtime, t.b_actualtime, t.b_plannedtime) > DATEADD(minute, 570, DATE_TRUNC('day', COALESCE(t.a_actualtime, t.a_plannedtime)))
        ORDER BY midday_hours_sold DESC, ymd DESC
        LIMIT 150
        `,
        baseParams,
      );

      const middayPhDailyRes = await client.query(
        `
        SELECT
          d.year * 10000 + d.month * 100 + d.day AS ymd,
          EXTRACT(dow FROM COALESCE(t.a_actualtime, t.a_plannedtime))::int AS dow_num,
          COUNT(*)::bigint AS ph_trips,
          SUM(
            LEAST(5.0, GREATEST(0.0, DATEDIFF(minute,
              GREATEST(COALESCE(t.a_actualtime, t.a_plannedtime), DATEADD(minute, 570, DATE_TRUNC('day', COALESCE(t.a_actualtime, t.a_plannedtime)))),
              LEAST(COALESCE(t.d_actualtime, t.d_plannedtime, t.c2_actualtime, t.c2_plannedtime, t.c_actualtime, t.c_plannedtime, t.b2_actualtime, t.b2_plannedtime, t.b_actualtime, t.b_plannedtime), DATEADD(minute, 870, DATE_TRUNC('day', COALESCE(t.a_actualtime, t.a_plannedtime))))
            ) / 60.0)))::float8 AS midday_hours_sold,
          SUM(COALESCE(t.total_price_ex_vat, 0))::float8 AS revenue,
          SUM(CASE WHEN COALESCE(t.a_actualtime, t.a_plannedtime) < DATEADD(minute, 630, DATE_TRUNC('day', COALESCE(t.a_actualtime, t.a_plannedtime)))
                    AND COALESCE(t.d_actualtime, t.d_plannedtime, t.c2_actualtime, t.c2_plannedtime, t.c_actualtime, t.c_plannedtime, t.b2_actualtime, t.b2_plannedtime, t.b_actualtime, t.b_plannedtime) > DATEADD(minute, 570, DATE_TRUNC('day', COALESCE(t.a_actualtime, t.a_plannedtime)))
                   THEN 1 ELSE 0 END) AS active_0930_1030,
          SUM(CASE WHEN COALESCE(t.a_actualtime, t.a_plannedtime) < DATEADD(minute, 690, DATE_TRUNC('day', COALESCE(t.a_actualtime, t.a_plannedtime)))
                    AND COALESCE(t.d_actualtime, t.d_plannedtime, t.c2_actualtime, t.c2_plannedtime, t.c_actualtime, t.c_plannedtime, t.b2_actualtime, t.b2_plannedtime, t.b_actualtime, t.b_plannedtime) > DATEADD(minute, 630, DATE_TRUNC('day', COALESCE(t.a_actualtime, t.a_plannedtime)))
                   THEN 1 ELSE 0 END) AS active_1030_1130,
          SUM(CASE WHEN COALESCE(t.a_actualtime, t.a_plannedtime) < DATEADD(minute, 750, DATE_TRUNC('day', COALESCE(t.a_actualtime, t.a_plannedtime)))
                    AND COALESCE(t.d_actualtime, t.d_plannedtime, t.c2_actualtime, t.c2_plannedtime, t.c_actualtime, t.c_plannedtime, t.b2_actualtime, t.b2_plannedtime, t.b_actualtime, t.b_plannedtime) > DATEADD(minute, 690, DATE_TRUNC('day', COALESCE(t.a_actualtime, t.a_plannedtime)))
                   THEN 1 ELSE 0 END) AS active_1130_1230,
          SUM(CASE WHEN COALESCE(t.a_actualtime, t.a_plannedtime) < DATEADD(minute, 810, DATE_TRUNC('day', COALESCE(t.a_actualtime, t.a_plannedtime)))
                    AND COALESCE(t.d_actualtime, t.d_plannedtime, t.c2_actualtime, t.c2_plannedtime, t.c_actualtime, t.c_plannedtime, t.b2_actualtime, t.b2_plannedtime, t.b_actualtime, t.b_plannedtime) > DATEADD(minute, 750, DATE_TRUNC('day', COALESCE(t.a_actualtime, t.a_plannedtime)))
                   THEN 1 ELSE 0 END) AS active_1230_1330,
          SUM(CASE WHEN COALESCE(t.a_actualtime, t.a_plannedtime) < DATEADD(minute, 870, DATE_TRUNC('day', COALESCE(t.a_actualtime, t.a_plannedtime)))
                    AND COALESCE(t.d_actualtime, t.d_plannedtime, t.c2_actualtime, t.c2_plannedtime, t.c_actualtime, t.c_plannedtime, t.b2_actualtime, t.b2_plannedtime, t.b_actualtime, t.b_plannedtime) > DATEADD(minute, 810, DATE_TRUNC('day', COALESCE(t.a_actualtime, t.a_plannedtime)))
                   THEN 1 ELSE 0 END) AS active_1330_1430
        ${fromJoins}
        ${whereBase}
          AND t.trip_type = 'Normal'
          AND COALESCE(t.a_actualtime, t.a_plannedtime) < DATEADD(minute, 870, DATE_TRUNC('day', COALESCE(t.a_actualtime, t.a_plannedtime)))
          AND COALESCE(t.d_actualtime, t.d_plannedtime, t.c2_actualtime, t.c2_plannedtime, t.c_actualtime, t.c_plannedtime, t.b2_actualtime, t.b2_plannedtime, t.b_actualtime, t.b_plannedtime) > DATEADD(minute, 570, DATE_TRUNC('day', COALESCE(t.a_actualtime, t.a_plannedtime)))
        GROUP BY 1, 2
        ORDER BY ph_trips DESC, ymd DESC
        `,
        baseParams,
      );

      const middayPhBandRes = await client.query(
        `
        SELECT
          CASE
            WHEN COALESCE(t.pax, 0) BETWEEN 1 AND 16 THEN 'minibus'
            WHEN COALESCE(t.pax, 0) BETWEEN 17 AND 33 THEN 'midi'
            WHEN COALESCE(t.pax, 0) BETWEEN 34 AND 49 THEN 'standard'
            WHEN COALESCE(t.pax, 0) BETWEEN 50 AND 57 THEN 'executive'
            WHEN COALESCE(t.pax, 0) >= 58 THEN 'high_capacity'
            ELSE 'unspecified'
          END AS capacity_band,
          COUNT(*)::bigint AS ph_trips,
          SUM(
            LEAST(5.0, GREATEST(0.0, DATEDIFF(minute,
              GREATEST(COALESCE(t.a_actualtime, t.a_plannedtime), DATEADD(minute, 570, DATE_TRUNC('day', COALESCE(t.a_actualtime, t.a_plannedtime)))),
              LEAST(COALESCE(t.d_actualtime, t.d_plannedtime, t.c2_actualtime, t.c2_plannedtime, t.c_actualtime, t.c_plannedtime, t.b2_actualtime, t.b2_plannedtime, t.b_actualtime, t.b_plannedtime), DATEADD(minute, 870, DATE_TRUNC('day', COALESCE(t.a_actualtime, t.a_plannedtime))))
            ) / 60.0)))::float8 AS midday_hours_sold,
          SUM(COALESCE(t.total_price_ex_vat, 0))::float8 AS revenue,
          AVG(COALESCE(t.pax, 0))::float8 AS avg_pax
        ${fromJoins}
        ${whereBase}
          AND t.trip_type = 'Normal'
          AND COALESCE(t.a_actualtime, t.a_plannedtime) < DATEADD(minute, 870, DATE_TRUNC('day', COALESCE(t.a_actualtime, t.a_plannedtime)))
          AND COALESCE(t.d_actualtime, t.d_plannedtime, t.c2_actualtime, t.c2_plannedtime, t.c_actualtime, t.c_plannedtime, t.b2_actualtime, t.b2_plannedtime, t.b_actualtime, t.b_plannedtime) > DATEADD(minute, 570, DATE_TRUNC('day', COALESCE(t.a_actualtime, t.a_plannedtime)))
        GROUP BY 1
        ORDER BY ph_trips DESC
        `,
        baseParams,
      );

      middayUtilisationScopes = buildMiddayUtilisationScopes(
        middayVehicleRes.rows,
        middayHourlyRes.rows,
        middayTripsRes.rows,
        from,
        to,
        middayPhDailyRes.rows,
        middayPhBandRes.rows,
      );
    } catch (err) {
      console.error('[financeService] middayUtilisation query failed:', err.message);
    }

    return {
      phTrend,
      ctTrend,
      allTrend,
      phBookings,
      ctBookings,
      allBookings,
      phDepots,
      ctDepots,
      phCustomers,
      ctCustomers,
      phVehicles,
      ctVehicles,
      allVehicles,
      vehicleUtilisationScopes,
      middayUtilisationScopes,
      phDrivers,
      ctDrivers,
      allDrivers,
      phJobTypes: withRevenueShares(jobTypeSplit.privateHire),
      ctJobTypes: withRevenueShares(jobTypeSplit.contracts),
      allJobTypes: withRevenueShares(jobTypeSplit.both),
      phTopCustomers,
      ctTopCustomers,
      allTopCustomers,
      acceptance,
      paxCapacity,
      comparisons,
      dormantTopCustomers,
      customerHealth,
      depots: depotList.rows.map((r) => r.name),
      segments: segmentList.rows.map((r) => r.name),
      period: filters.period,
      fromDate: from,
      toDate: to,
      customer,
    };
  });

  if (!result.ok) {
    console.error('fetchFromRedshift failed:', result.reason);
    return null;
  }
  return buildDashboardPayload(result.value, result.config);
}

function buildDashboardPayload(v, config) {
  const customer = config?.customer || 'Country Lion';
  return {
    source: 'redshift',
    customer,
    asOf: new Date().toISOString(),
    currency: 'GBP',
    filters: {
      period: v.period,
      fromDate: v.fromDate,
      toDate: v.toDate,
    },
    dateRange: { from: v.fromDate, to: v.toDate },
    comparisons: v.comparisons,
    customerHealth: v.customerHealth,
    depots: v.depots,
    segments: v.segments,
    privateHire: {
      id: 'private-hire',
      title: 'Private Hire',
      tripType: 'Normal',
      description: 'Ad-hoc / private hire trips (trip type Normal in the Power BI report).',
      kpis: kpisFromTrend(v.phTrend, v.phBookings),
      trend: v.phTrend,
      byDepot: v.phDepots,
      byCustomer: v.phCustomers,
    },
    contracts: {
      id: 'contracts',
      title: 'Contracts',
      tripType: 'Fixed',
      description: 'Contract / fixed work (trip type Fixed in the Power BI report).',
      kpis: kpisFromTrend(v.ctTrend, v.ctBookings),
      trend: v.ctTrend,
      byDepot: v.ctDepots,
      byCustomer: v.ctCustomers,
    },
    byVehicle: {
      id: 'by-vehicle',
      title: 'By vehicle',
      description: 'Trip revenue attributed to each coach (vehicle / licence plate).',
      scopes: {
        both: {
          label: 'Both',
          kpis: kpisFromTrend(v.allTrend, v.allBookings),
          trend: v.allTrend,
          byVehicle: v.allVehicles,
        },
        privateHire: {
          label: 'Private Hire',
          kpis: kpisFromTrend(v.phTrend, v.phBookings),
          trend: v.phTrend,
          byVehicle: v.phVehicles,
        },
        contracts: {
          label: 'Contracts',
          kpis: kpisFromTrend(v.ctTrend, v.ctBookings),
          trend: v.ctTrend,
          byVehicle: v.ctVehicles,
        },
      },
    },
    vehicleUtilisation: {
      id: 'utilisation',
      title: 'Vehicle Utilisation & Hours',
      description:
        'Operating hours, idle hours, and revenue yield per hour by coach — calculated from trip duration (trip start to finish).',
      scopes: v.vehicleUtilisationScopes,
    },
    middayUtilisation: {
      id: 'midday-utilisation',
      title: 'Middle of the Day Utilisation (09:30 – 14:30)',
      description:
        'Operational hours sold between 09:30 and 14:30 (5-hour window). Measures fleet deployment and sold operational capacity between morning and afternoon school / contract commitments.',
      window: { start: '09:30', end: '14:30', windowHoursPerDay: 5.0 },
      scopes: v.middayUtilisationScopes,
      phCapacity: v.middayUtilisationScopes?.phCapacity,
    },
    byDriver: {
      id: 'by-driver',
      title: 'By driver',
      description: 'Trip revenue attributed to each driver (person) — not the vehicle.',
      scopes: {
        both: {
          label: 'Both',
          kpis: kpisFromTrend(v.allTrend, v.allBookings),
          trend: v.allTrend,
          byDriver: v.allDrivers,
        },
        privateHire: {
          label: 'Private Hire',
          kpis: kpisFromTrend(v.phTrend, v.phBookings),
          trend: v.phTrend,
          byDriver: v.phDrivers,
        },
        contracts: {
          label: 'Contracts',
          kpis: kpisFromTrend(v.ctTrend, v.ctBookings),
          trend: v.ctTrend,
          byDriver: v.ctDrivers,
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
          kpis: kpisFromTrend(v.allTrend, v.allBookings),
          trend: v.allTrend,
          byJobType: v.allJobTypes,
        },
        privateHire: {
          label: 'Private Hire',
          kpis: kpisFromTrend(v.phTrend, v.phBookings),
          trend: v.phTrend,
          byJobType: v.phJobTypes,
        },
        contracts: {
          label: 'Contracts',
          kpis: kpisFromTrend(v.ctTrend, v.ctBookings),
          trend: v.ctTrend,
          byJobType: v.ctJobTypes,
        },
      },
    },
    acceptance: {
      id: 'acceptance',
      title: 'Acceptance rate',
      description:
        'Private Hire quotes (Normal orders) by order date. Acceptance rate = won ÷ (won + lost + open).',
      ...v.acceptance,
    },
    paxCapacity: {
      id: 'pax-capacity',
      title: 'Planned vs Actual Pax',
      description:
        'Comparison of planned passenger count (pax) against allocated vehicle seating capacity. Identifies over-capacity allocations (e.g. 20 passengers in a 53-seat coach) and seat utilization efficiency.',
      ...v.paxCapacity,
    },
    customers: {
      id: 'customers',
      title: 'Customers',
      description:
        'Top customers in the selected trip-date range, health bands (active / at risk / churned), and long-lapsed accounts.',
      scopes: {
        both: {
          label: 'Both',
          kpis: kpisFromTrend(v.allTrend, v.allBookings),
          trend: v.allTrend,
          topCustomers: v.allTopCustomers,
        },
        privateHire: {
          label: 'Private Hire',
          kpis: kpisFromTrend(v.phTrend, v.phBookings),
          trend: v.phTrend,
          topCustomers: v.phTopCustomers,
        },
        contracts: {
          label: 'Contracts',
          kpis: kpisFromTrend(v.ctTrend, v.ctBookings),
          trend: v.ctTrend,
          topCustomers: v.ctTopCustomers,
        },
      },
      health: v.customerHealth,
      dormantTopCustomers: v.dormantTopCustomers,
      dormantNote:
        'Top 10 customers by lifetime trip revenue (ex VAT) with no operational trip in the last 9 months.',
    },
    note:
      'Figures match Power BI Total Revenue (excl VAT) on operational trips by trip date. Private Hire = Normal trips; Contracts = Fixed trips. Acceptance rate uses Normal order dates (quotes).',
  };
}

// In-memory server-side cache with 10-minute TTL and Promise coalescing
const DASHBOARD_CACHE = new Map();
const IN_FLIGHT_REQUESTS = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000;

async function getFinanceDashboard(rawFilters = {}, db = null) {
  const filters = parseFilters(rawFilters);
  const config = readRedshiftConfigFromEnv();
  const customer = config?.customer || 'Country Lion';

  if (!config) {
    return getMockFinanceData(filters, customer);
  }

  const cacheKey = [
    customer,
    filters.period,
    filters.depot,
    filters.segment,
    filters.fromDate || '',
    filters.toDate || '',
  ].join('::');

  const now = Date.now();
  const cached = DASHBOARD_CACHE.get(cacheKey);
  const forceRefresh = Boolean(rawFilters.refresh);

  if (!forceRefresh && cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  if (!forceRefresh && IN_FLIGHT_REQUESTS.has(cacheKey)) {
    return IN_FLIGHT_REQUESTS.get(cacheKey);
  }

  const promise = (async () => {
    try {
      const live = await fetchFromRedshift(filters, customer);

      if (!live) {
        const mock = getMockFinanceData(filters, customer);
        return {
          ...mock,
          note: 'Redshift is configured but unreachable — showing mock coach-hire figures so the dashboard stays usable.',
        };
      }
      DASHBOARD_CACHE.set(cacheKey, { timestamp: Date.now(), data: live });
      return live;
    } finally {
      IN_FLIGHT_REQUESTS.delete(cacheKey);
    }
  })();

  IN_FLIGHT_REQUESTS.set(cacheKey, promise);
  return promise;
}

module.exports = {
  getFinanceDashboard,
  parseFilters,
  getWalkaroundComplianceReport,
};
