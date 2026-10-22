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


async function detectTimingExpr(client) {
  try {
    const colRes = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'fact_teq_trip' 
        AND column_name IN ('start_time', 'end_time', 'trip_start', 'trip_finish', 'departure_time', 'arrival_time', 'pickup_time', 'dropoff_time', 'duration_minutes')
    `);
    const cols = new Set(colRes.rows.map((r) => String(r.column_name || '').toLowerCase()));
    if (cols.has('trip_start') && cols.has('trip_finish')) {
      return `ROUND(SUM(CASE WHEN t.trip_finish >= t.trip_start THEN DATEDIFF('minute', t.trip_start, t.trip_finish) ELSE DATEDIFF('minute', t.trip_start, t.trip_finish) + 1440 END) / 60.0, 1)::float8`;
    }
    if (cols.has('start_time') && cols.has('end_time')) {
      return `ROUND(SUM(CASE WHEN t.end_time >= t.start_time THEN DATEDIFF('minute', t.start_time, t.end_time) ELSE DATEDIFF('minute', t.start_time, t.end_time) + 1440 END) / 60.0, 1)::float8`;
    }
    if (cols.has('departure_time') && cols.has('arrival_time')) {
      return `ROUND(SUM(CASE WHEN t.arrival_time >= t.departure_time THEN DATEDIFF('minute', t.departure_time, t.arrival_time) ELSE DATEDIFF('minute', t.departure_time, t.arrival_time) + 1440 END) / 60.0, 1)::float8`;
    }
    if (cols.has('pickup_time') && cols.has('dropoff_time')) {
      return `ROUND(SUM(CASE WHEN t.dropoff_time >= t.pickup_time THEN DATEDIFF('minute', t.pickup_time, t.dropoff_time) ELSE DATEDIFF('minute', t.pickup_time, t.dropoff_time) + 1440 END) / 60.0, 1)::float8`;
    }
    if (cols.has('duration_minutes')) {
      return `ROUND(SUM(COALESCE(t.duration_minutes, 0)) / 60.0, 1)::float8`;
    }
  } catch {
    // fallback if information_schema query fails
  }
  return `ROUND(SUM(CASE WHEN t.trip_type = 'Normal' THEN 4.5 ELSE 2.8 END), 1)::float8`;
}

function buildVehicleUtilisationScopes(rows, fromIso, toIso) {
  const from = new Date(`${fromIso}T00:00:00Z`);
  const to = new Date(`${toIso}T00:00:00Z`);
  const daysDiff = Math.max(14, Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)) + 1);
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

      const isExecOrDecker = (r.vehicle_type || '').includes('Executive') || (r.vehicle_type || '').includes('Decker');
      return {
        coach: r.coach,
        licensePlate: r.license_plate,
        vehicleType: r.vehicle_type,
        isFinanced: isExecOrDecker,
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

    const trendFor = async (tripType) => {
      const typeClause = tripType ? `AND t.trip_type = '${tripType}'` : '';
      const res = await client.query(
        `
        SELECT
          d.year,
          d.month,
          SUM(COALESCE(t.total_price_ex_vat, 0))::float8 AS revenue,
          COUNT(*)::bigint AS trips
        ${fromJoins}
        ${whereBase}
          ${typeClause}
        GROUP BY d.year, d.month
        ORDER BY d.year, d.month
        `,
        baseParams,
      );
      return mapTrend(res.rows);
    };

    const bookingsFor = async (tripType) => {
      const typeClause = tripType ? `AND t.trip_type = '${tripType}'` : '';
      const res = await client.query(
        `
        SELECT COUNT(DISTINCT t.order_id)::bigint AS n
        ${fromJoins}
        ${whereBase}
          ${typeClause}
        `,
        baseParams,
      );
      return Number(res.rows[0]?.n || 0);
    };

    const namedBreakdown = async (tripType, dimension) => {
      const params = [...baseParams, tripType];
      const typeParam = `$${params.length}`;
      const expr =
        dimension === 'depot'
          ? `COALESCE(NULLIF(TRIM(g.name), ''), '(Unassigned depot)')`
          : `COALESCE(NULLIF(TRIM(c.name), ''), '(Unknown customer)')`;
      const res = await client.query(
        `
        SELECT
          ${expr} AS name,
          SUM(COALESCE(t.total_price_ex_vat, 0))::float8 AS amount,
          COUNT(*)::bigint AS trips
        ${fromJoins}
        ${whereBase}
          AND t.trip_type = ${typeParam}
        GROUP BY 1
        ORDER BY amount DESC
        LIMIT 12
        `,
        params,
      );
      return toNamed(
        res.rows.map((r) => ({
          name: r.name,
          amount: Number(r.amount) || 0,
          trips: Number(r.trips) || 0,
        })),
      );
    };

    // pg Client is single-connection — run queries sequentially (Promise.all breaks Redshift).
    const phTrend = await trendFor('Normal');
    const ctTrend = await trendFor('Fixed');
    const allTrend = await trendFor(null);
    const phBookings = await bookingsFor('Normal');
    const ctBookings = await bookingsFor('Fixed');
    const allBookings = await bookingsFor(null);
    const phDepots = await namedBreakdown('Normal', 'depot');
    const ctDepots = await namedBreakdown('Fixed', 'depot');
    const phCustomers = await namedBreakdown('Normal', 'customer');
    const ctCustomers = await namedBreakdown('Fixed', 'customer');
    // One query each, split by trip_type in JS (avoids 6 heavy sequential scans / timeouts).
        const timingExpr = await detectTimingExpr(client);
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
          ${timingExpr} AS operational_hours
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

    // Job type = customer category (Schools, Corporate/VIP, …) — matches Revenue & Yield category views.
    const jobTypeRes = await client.query(
      `
        SELECT
          COALESCE(NULLIF(TRIM(c.category), ''), '(Uncategorised)') AS name,
          COALESCE(t.trip_type, '') AS trip_type,
          COUNT(*)::bigint AS trips,
          SUM(COALESCE(t.total_price_ex_vat, 0))::float8 AS revenue
        ${fromJoins}
        ${whereBase}
        GROUP BY 1, 2
        ORDER BY revenue DESC
        `,
      baseParams,
    );
    const jobTypeSplit = splitScopedRevenue(jobTypeRes.rows, (row) => row.name);

    // Top customers in the selected trip-date range (all ranks returned; UI can sort/filter).
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
    const topCustomerSplit = splitScopedRevenue(
      topCustomerRes.rows.map((r) => ({
        ...r,
        name: r.name,
        category: r.category,
      })),
      (row) => `${row.name}\0${row.category || ''}`,
    );
    // Preserve bookings on top-customer rows (splitScopedRevenue only keeps name/category/trips/revenue).
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

    // Acceptance / conversion rate — Power BI Conversion Rate page (Normal quotes by order date).
    const conversionRes = await client.query(
      `
        SELECT
          SUM(CASE WHEN status IN ('complete', 'done', 'manually_updated') THEN 1 ELSE 0 END)::bigint AS won,
          SUM(CASE WHEN status = 'lost' THEN 1 ELSE 0 END)::bigint AS lost,
          SUM(CASE WHEN status IN ('sent', 'draft') THEN 1 ELSE 0 END)::bigint AS open_quotes,
          SUM(CASE WHEN status = 'cancel' THEN 1 ELSE 0 END)::bigint AS cancelled,
          COUNT(*)::bigint AS quotes
        FROM public.fact_order
        WHERE order_type = 'Normal'
          AND order_date_datekey BETWEEN $1 AND $2
        `,
      [fromYmd, toYmd],
    );
    const conv = conversionRes.rows[0] || {};
    const won = Number(conv.won) || 0;
    const lost = Number(conv.lost) || 0;
    const openQuotes = Number(conv.open_quotes) || 0;
    const acceptanceBase = won + lost + openQuotes;
    const acceptance = {
      won,
      lost,
      openQuotes,
      cancelled: Number(conv.cancelled) || 0,
      quotes: Number(conv.quotes) || 0,
      // Won ÷ (won + lost + open); cancelled excluded from the rate.
      acceptanceRate: acceptanceBase > 0 ? won / acceptanceBase : null,
    };

    // Top 10 lifetime-revenue customers with no operational trip in the last 9 months.
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

    // Period totals helper (same depot/segment filters, different trip-date window).
    const statsForRange = async (rangeFrom, rangeTo) => {
      const params = [toYmdInt(rangeFrom), toYmdInt(rangeTo)];
      if (filters.depot !== 'All') params.push(filters.depot);
      if (filters.segment !== 'All') params.push(filters.segment);
      const res = await client.query(
        `
        SELECT
          SUM(COALESCE(t.total_price_ex_vat, 0))::float8 AS revenue,
          COUNT(*)::bigint AS trips,
          COUNT(DISTINCT t.order_id)::bigint AS bookings
        ${fromJoins}
        ${whereBase}
        `,
        params,
      );
      const row = res.rows[0] || {};
      return periodStats(row.revenue, row.trips, row.bookings);
    };

    const priorFrom = shiftIsoYears(from, -1);
    const priorTo = shiftIsoYears(to, -1);
    const mtd = resolveMtdRange(to);
    const mtdLy = {
      from: shiftIsoYears(mtd.from, -1),
      to: shiftIsoYears(mtd.to, -1),
    };
    const periodCurrent = await statsForRange(from, to);
    const periodPrior = await statsForRange(priorFrom, priorTo);
    const mtdCurrent = await statsForRange(mtd.from, mtd.to);
    const mtdPrior = await statsForRange(mtdLy.from, mtdLy.to);
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

    // Customer health bands (Power BI Customer Health: <60 active, 60–89 at risk, ≥90 churned).
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
          END AS band
        FROM trip_ops t
        JOIN public.dim_customer c
          ON c.id = t.customer_id AND c.ferdia_partner_id = t.ferdia_partner_id
        CROSS JOIN cutoffs k
        WHERE LOWER(COALESCE(c.name, '')) NOT LIKE 'test %'
          ${healthSegmentClause}
      )
      SELECT
        band,
        COUNT(*)::bigint AS customers,
        SUM(revenue)::float8 AS revenue,
        SUM(trips)::bigint AS trips
      FROM banded
      GROUP BY 1
      `,
      healthParams,
    );
    const healthTopRes = await client.query(
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
          END AS band
        FROM trip_ops t
        JOIN public.dim_customer c
          ON c.id = t.customer_id AND c.ferdia_partner_id = t.ferdia_partner_id
        CROSS JOIN cutoffs k
        WHERE LOWER(COALESCE(c.name, '')) NOT LIKE 'test %'
          ${healthSegmentClause}
      )
      SELECT name, category, revenue, trips, last_ymd, band
      FROM (
        SELECT
          banded.*,
          ROW_NUMBER() OVER (PARTITION BY band ORDER BY revenue DESC) AS rn
        FROM banded
        WHERE band IN ('atRisk', 'churned')
      ) ranked
      WHERE rn <= 10
      ORDER BY band, revenue DESC
      `,
      healthParams,
    );

    const emptyBand = { customers: 0, revenue: 0, trips: 0 };
    const healthBands = {
      active: { ...emptyBand },
      atRisk: { ...emptyBand },
      churned: { ...emptyBand },
    };
    for (const row of healthRes.rows) {
      const key = row.band === 'atRisk' ? 'atRisk' : row.band === 'churned' ? 'churned' : 'active';
      healthBands[key] = {
        customers: Number(row.customers) || 0,
        revenue: Number(row.revenue) || 0,
        trips: Number(row.trips) || 0,
      };
    }
    const mapHealthRow = (r) => ({
      name: r.name,
      category: r.category,
      revenue: Number(r.revenue) || 0,
      trips: Number(r.trips) || 0,
      lastTripDate: ymdToIso(r.last_ymd),
      band: r.band,
    });
    const customerHealth = {
      bands: healthBands,
      revenueAtRisk: (healthBands.atRisk.revenue || 0) + (healthBands.churned.revenue || 0),
      atRiskTop: healthTopRes.rows.filter((r) => r.band === 'atRisk').map(mapHealthRow),
      churnedTop: healthTopRes.rows.filter((r) => r.band === 'churned').map(mapHealthRow),
      note: 'Active = last trip within 60 days; at risk = 60–89 days; churned = 90+ days (Power BI Customer Health).',
    };

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
      dormantTopCustomers,
      comparisons,
      customerHealth,
      depots: depotList.rows.map((r) => r.name).filter(Boolean),
      segments: segmentList.rows.map((r) => r.name).filter(Boolean),
    };
  });

  if (!result.ok) {
    console.error('Redshift finance fetch failed:', result.reason || 'unknown');
    return null;
  }
  const v = result.value;

  return {
    source: 'redshift',
    customer,
    asOf: new Date().toISOString(),
    currency: 'GBP',
    filters,
    dateRange: { from, to },
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
      won: v.acceptance.won,
      lost: v.acceptance.lost,
      openQuotes: v.acceptance.openQuotes,
      cancelled: v.acceptance.cancelled,
      quotes: v.acceptance.quotes,
      acceptanceRate: v.acceptance.acceptanceRate,
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

async function getFinanceDashboard(rawFilters = {}) {
  const filters = parseFilters(rawFilters);
  const config = readRedshiftConfigFromEnv();
  const customer = config?.customer || 'Country Lion';

  if (!config) {
    return getMockFinanceData(filters, customer);
  }

  const live = await fetchFromRedshift(filters, customer);
  if (!live) {
    const mock = getMockFinanceData(filters, customer);
    return {
      ...mock,
      note: 'Redshift is configured but unreachable — showing mock coach-hire figures so the dashboard stays usable.',
    };
  }
  return live;
}

module.exports = {
  getFinanceDashboard,
  parseFilters,
};
