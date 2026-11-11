'use strict';

const { withRedshift } = require('./redshiftClient');
const { toYmdInt, isIsoDate } = require('./dateRange');

const OPERATIONAL_SQL = `
  COALESCE(t.deleted, false) = false
  AND COALESCE(t.trip_state, '') NOT IN ('draft', 'sent', 'cancel', 'lost')
  AND COALESCE(t.status, '') NOT IN ('canceled')
  AND COALESCE(t.mission_status, '') NOT IN ('canceled')
`;

function calcDelta(cur, prior) {
  if (prior === 0) return cur === 0 ? 0 : 1;
  return (cur - prior) / prior;
}

/**
 * Compare two arbitrary date ranges (Period A vs Period B) from Redshift data.
 * @param {Object} options
 * @param {string} options.baseFrom - ISO date string (YYYY-MM-DD) for Base Period (Period A)
 * @param {string} options.baseTo - ISO date string (YYYY-MM-DD)
 * @param {string} options.compareFrom - ISO date string (YYYY-MM-DD) for Compare Period (Period B)
 * @param {string} options.compareTo - ISO date string (YYYY-MM-DD)
 * @param {string} [options.depot='All']
 * @param {string} [options.segment='All']
 */
async function getComparisonReport(options = {}) {
  const baseFrom = isIsoDate(options.baseFrom) ? options.baseFrom : '2026-10-01';
  const baseTo = isIsoDate(options.baseTo) ? options.baseTo : baseFrom;
  const compFrom = isIsoDate(options.compareFrom) ? options.compareFrom : '2025-10-01';
  const compTo = isIsoDate(options.compareTo) ? options.compareTo : compFrom;

  const bStartYmd = toYmdInt(baseFrom);
  const bEndYmd = toYmdInt(baseTo);
  const cStartYmd = toYmdInt(compFrom);
  const cEndYmd = toYmdInt(compTo);

  const depot = options.depot || 'All';
  const segment = options.segment || 'All';

  const params = [bStartYmd, bEndYmd, cStartYmd, cEndYmd];
  let depotClause = '';
  let segmentClause = '';
  let joinCustomer = '';

  if (depot !== 'All') {
    params.push(depot);
    depotClause = `AND g.name = $${params.length}`;
  }
  if (segment !== 'All') {
    params.push(segment);
    joinCustomer = 'JOIN public.dim_customer c ON c.id = t.customer_id AND c.ferdia_partner_id = t.ferdia_partner_id';
    segmentClause = `AND COALESCE(NULLIF(TRIM(c.category), ''), '(Uncategorised)') = $${params.length}`;
  } else {
    joinCustomer = 'LEFT JOIN public.dim_customer c ON c.id = t.customer_id AND c.ferdia_partner_id = t.ferdia_partner_id';
  }

  const redshiftRes = await withRedshift(async (client) => {
    // 1. Overall & by trip_type breakdown
    const summaryRes = await client.query(
      `
      SELECT
        CASE
          WHEN t.trip_date_datekey BETWEEN $1 AND $2 THEN 'BASE'
          WHEN t.trip_date_datekey BETWEEN $3 AND $4 THEN 'COMPARE'
        END AS period,
        COALESCE(t.trip_type, 'Normal') AS trip_type,
        COUNT(*)::bigint AS trips,
        COUNT(DISTINCT t.order_id)::bigint AS bookings,
        SUM(COALESCE(t.total_price_ex_vat, 0))::float8 AS revenue,
        SUM(COALESCE(t.pax, 0))::bigint AS pax,
        COUNT(DISTINCT t.vehicle_id)::bigint AS vehicles,
        COUNT(DISTINCT t.driver_id)::bigint AS drivers,
        SUM(
          CASE
            WHEN COALESCE(t.a_actualtime, t.a_plannedtime) IS NOT NULL
             AND COALESCE(t.d_actualtime, t.d_plannedtime, t.c2_actualtime, t.c2_plannedtime, t.c_actualtime, t.c_plannedtime, t.b2_actualtime, t.b2_plannedtime, t.b_actualtime, t.b_plannedtime) IS NOT NULL
            THEN LEAST(24.0, GREATEST(0.0, DATEDIFF(
              minute,
              COALESCE(t.a_actualtime, t.a_plannedtime),
              COALESCE(t.d_actualtime, t.d_plannedtime, t.c2_actualtime, t.c2_plannedtime, t.c_actualtime, t.c_plannedtime, t.b2_actualtime, t.b2_plannedtime, t.b_actualtime, t.b_plannedtime)
            ) / 60.0))
            ELSE 0.0
          END
        )::float8 AS operational_hours
      FROM public.fact_teq_trip t
      LEFT JOIN public.dim_garage g ON g.id = t.garage_id AND g.ferdia_partner_id = t.ferdia_partner_id
      ${joinCustomer}
      WHERE ${OPERATIONAL_SQL}
        AND (
          t.trip_date_datekey BETWEEN $1 AND $2
          OR t.trip_date_datekey BETWEEN $3 AND $4
        )
        ${depotClause}
        ${segmentClause}
      GROUP BY 1, 2
      ORDER BY 1, 2;
      `,
      params
    );

    // 2. By Top Vehicles comparison
    const vehiclesRes = await client.query(
      `
      SELECT
        COALESCE(NULLIF(TRIM(v.license_plate), ''), 'Unknown') AS license_plate,
        COALESCE(v.passenger_capacity, 0) AS capacity,
        SUM(CASE WHEN t.trip_date_datekey BETWEEN $1 AND $2 THEN COALESCE(t.total_price_ex_vat, 0) ELSE 0 END)::float8 AS base_revenue,
        COUNT(CASE WHEN t.trip_date_datekey BETWEEN $1 AND $2 THEN 1 END)::bigint AS base_trips,
        SUM(CASE WHEN t.trip_date_datekey BETWEEN $1 AND $2 THEN COALESCE(t.pax, 0) ELSE 0 END)::bigint AS base_pax,
        SUM(CASE WHEN t.trip_date_datekey BETWEEN $3 AND $4 THEN COALESCE(t.total_price_ex_vat, 0) ELSE 0 END)::float8 AS comp_revenue,
        COUNT(CASE WHEN t.trip_date_datekey BETWEEN $3 AND $4 THEN 1 END)::bigint AS comp_trips,
        SUM(CASE WHEN t.trip_date_datekey BETWEEN $3 AND $4 THEN COALESCE(t.pax, 0) ELSE 0 END)::bigint AS comp_pax
      FROM public.fact_teq_trip t
      JOIN public.dim_vehicle v ON v.id = t.vehicle_id AND v.ferdia_partner_id = t.ferdia_partner_id
      LEFT JOIN public.dim_garage g ON g.id = t.garage_id AND g.ferdia_partner_id = t.ferdia_partner_id
      ${joinCustomer}
      WHERE ${OPERATIONAL_SQL}
        AND (
          t.trip_date_datekey BETWEEN $1 AND $2
          OR t.trip_date_datekey BETWEEN $3 AND $4
        )
        ${depotClause}
        ${segmentClause}
      GROUP BY 1, 2
      ORDER BY (SUM(CASE WHEN t.trip_date_datekey BETWEEN $1 AND $2 THEN COALESCE(t.total_price_ex_vat, 0) ELSE 0 END) + SUM(CASE WHEN t.trip_date_datekey BETWEEN $3 AND $4 THEN COALESCE(t.total_price_ex_vat, 0) ELSE 0 END)) DESC
      LIMIT 25;
      `,
      params
    );

    // 3. By Customer Segment / Category
    const categoryRes = await client.query(
      `
      SELECT
        COALESCE(NULLIF(TRIM(c.category), ''), '(Uncategorised)') AS category,
        SUM(CASE WHEN t.trip_date_datekey BETWEEN $1 AND $2 THEN COALESCE(t.total_price_ex_vat, 0) ELSE 0 END)::float8 AS base_revenue,
        COUNT(CASE WHEN t.trip_date_datekey BETWEEN $1 AND $2 THEN 1 END)::bigint AS base_trips,
        SUM(CASE WHEN t.trip_date_datekey BETWEEN $3 AND $4 THEN COALESCE(t.total_price_ex_vat, 0) ELSE 0 END)::float8 AS comp_revenue,
        COUNT(CASE WHEN t.trip_date_datekey BETWEEN $3 AND $4 THEN 1 END)::bigint AS comp_trips
      FROM public.fact_teq_trip t
      LEFT JOIN public.dim_customer c ON c.id = t.customer_id AND c.ferdia_partner_id = t.ferdia_partner_id
      LEFT JOIN public.dim_garage g ON g.id = t.garage_id AND g.ferdia_partner_id = t.ferdia_partner_id
      WHERE ${OPERATIONAL_SQL}
        AND (
          t.trip_date_datekey BETWEEN $1 AND $2
          OR t.trip_date_datekey BETWEEN $3 AND $4
        )
        ${depotClause}
        ${segmentClause}
      GROUP BY 1
      ORDER BY 2 DESC
      LIMIT 15;
      `,
      params
    );

    return {
      summary: summaryRes.rows,
      vehicles: vehiclesRes.rows,
      categories: categoryRes.rows,
    };
  });

  if (!redshiftRes.ok) {
    console.error('[getComparisonReport] Redshift query failed:', redshiftRes.reason);
    return null;
  }

  const { summary, vehicles, categories } = redshiftRes.value || { summary: [], vehicles: [], categories: [] };

  // Aggregate Base and Compare totals
  const emptyStats = () => ({
    revenue: 0,
    trips: 0,
    bookings: 0,
    pax: 0,
    vehicles: 0,
    drivers: 0,
    operationalHours: 0,
  });

  const baseTotal = emptyStats();
  const compTotal = emptyStats();
  const basePh = emptyStats();
  const compPh = emptyStats();
  const baseCt = emptyStats();
  const compCt = emptyStats();

  for (const r of summary) {
    const isBase = r.period === 'BASE';
    const target = isBase ? baseTotal : compTotal;
    const rev = Number(r.revenue) || 0;
    const trips = Number(r.trips) || 0;
    const bookings = Number(r.bookings) || 0;
    const pax = Number(r.pax) || 0;
    const vCount = Number(r.vehicles) || 0;
    const dCount = Number(r.drivers) || 0;
    const hours = Number(r.operational_hours) || 0;

    target.revenue += rev;
    target.trips += trips;
    target.bookings += bookings;
    target.pax += pax;
    target.vehicles = Math.max(target.vehicles, vCount);
    target.drivers = Math.max(target.drivers, dCount);
    target.operationalHours += hours;

    if (r.trip_type === 'Normal') {
      const phTarget = isBase ? basePh : compPh;
      phTarget.revenue += rev;
      phTarget.trips += trips;
      phTarget.bookings += bookings;
      phTarget.pax += pax;
      phTarget.operationalHours += hours;
    } else if (r.trip_type === 'Fixed') {
      const ctTarget = isBase ? baseCt : compCt;
      ctTarget.revenue += rev;
      ctTarget.trips += trips;
      ctTarget.bookings += bookings;
      ctTarget.pax += pax;
      ctTarget.operationalHours += hours;
    }
  }

  const buildKpiSummary = (b, c) => ({
    baseRevenue: b.revenue,
    compRevenue: c.revenue,
    revenueDiff: b.revenue - c.revenue,
    revenueDelta: calcDelta(b.revenue, c.revenue),

    baseTrips: b.trips,
    compTrips: c.trips,
    tripsDiff: b.trips - c.trips,
    tripsDelta: calcDelta(b.trips, c.trips),

    baseBookings: b.bookings,
    compBookings: c.bookings,
    bookingsDiff: b.bookings - c.bookings,
    bookingsDelta: calcDelta(b.bookings, c.bookings),

    basePax: b.pax,
    compPax: c.pax,
    paxDiff: b.pax - c.pax,
    paxDelta: calcDelta(b.pax, c.pax),

    baseAvgPaxPerTrip: b.trips > 0 ? Math.round((b.pax / b.trips) * 10) / 10 : 0,
    compAvgPaxPerTrip: c.trips > 0 ? Math.round((c.pax / c.trips) * 10) / 10 : 0,

    baseHours: Math.round(b.operationalHours * 10) / 10,
    compHours: Math.round(c.operationalHours * 10) / 10,
    hoursDiff: Math.round((b.operationalHours - c.operationalHours) * 10) / 10,
    hoursDelta: calcDelta(b.operationalHours, c.operationalHours),

    baseRevPerHour: b.operationalHours > 0 ? Math.round(b.revenue / b.operationalHours) : 0,
    compRevPerHour: c.operationalHours > 0 ? Math.round(c.revenue / c.operationalHours) : 0,
  });

  return {
    id: 'comparison',
    title: 'Period Comparison',
    description: 'Direct comparison of revenue, journeys, passenger volumes, and coach utilisation between any two dates or custom date ranges.',
    basePeriod: {
      from: baseFrom,
      to: baseTo,
      isSingleDay: baseFrom === baseTo,
    },
    comparePeriod: {
      from: compFrom,
      to: compTo,
      isSingleDay: compFrom === compTo,
    },
    depot,
    segment,
    kpis: {
      all: buildKpiSummary(baseTotal, compTotal),
      privateHire: buildKpiSummary(basePh, compPh),
      contracts: buildKpiSummary(baseCt, compCt),
    },
    vehicles: vehicles.map((v) => {
      const bRev = Number(v.base_revenue) || 0;
      const cRev = Number(v.comp_revenue) || 0;
      const bTrips = Number(v.base_trips) || 0;
      const cTrips = Number(v.comp_trips) || 0;
      const bPax = Number(v.base_pax) || 0;
      const cPax = Number(v.comp_pax) || 0;
      return {
        licensePlate: v.license_plate,
        capacity: Number(v.capacity) || 0,
        baseRevenue: bRev,
        compRevenue: cRev,
        revenueDiff: bRev - cRev,
        revenueDelta: calcDelta(bRev, cRev),
        baseTrips: bTrips,
        compTrips: cTrips,
        tripsDiff: bTrips - cTrips,
        tripsDelta: calcDelta(bTrips, cTrips),
        basePax: bPax,
        compPax: cPax,
        paxDiff: bPax - cPax,
      };
    }),
    categories: categories.map((c) => {
      const bRev = Number(c.base_revenue) || 0;
      const cRev = Number(c.comp_revenue) || 0;
      const bTrips = Number(c.base_trips) || 0;
      const cTrips = Number(c.comp_trips) || 0;
      return {
        category: c.category,
        baseRevenue: bRev,
        compRevenue: cRev,
        revenueDiff: bRev - cRev,
        revenueDelta: calcDelta(bRev, cRev),
        baseTrips: bTrips,
        compTrips: cTrips,
        tripsDiff: bTrips - cTrips,
        tripsDelta: calcDelta(bTrips, cTrips),
      };
    }),
  };
}

module.exports = {
  getComparisonReport,
};
