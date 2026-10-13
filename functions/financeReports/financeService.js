'use strict';

const { resolveDateRange, toYmdInt } = require('./dateRange');
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

    const [
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
      vehicleRes,
      driverRes,
      depotList,
      segmentList,
    ] = await Promise.all([
      trendFor('Normal'),
      trendFor('Fixed'),
      trendFor(null),
      bookingsFor('Normal'),
      bookingsFor('Fixed'),
      bookingsFor(null),
      namedBreakdown('Normal', 'depot'),
      namedBreakdown('Fixed', 'depot'),
      namedBreakdown('Normal', 'customer'),
      namedBreakdown('Fixed', 'customer'),
      client.query(
        `
        SELECT
          COALESCE(
            NULLIF(TRIM(v.vehicle_name), ''),
            NULLIF(TRIM(v.license_plate), ''),
            'Coach #' || CAST(t.vehicle_id AS varchar)
          ) AS coach,
          COALESCE(v.vehicle_type, 'Unknown type') AS vehicle_type,
          COALESCE(TRIM(v.license_plate), '') AS license_plate,
          COUNT(*)::bigint AS trips,
          SUM(COALESCE(t.total_price_ex_vat, 0))::float8 AS revenue
        ${fromJoins}
        LEFT JOIN public.dim_vehicle v
          ON v.id = t.vehicle_id AND v.ferdia_partner_id = t.ferdia_partner_id
        ${whereBase}
          AND t.vehicle_id IS NOT NULL
        GROUP BY 1, 2, 3
        ORDER BY revenue DESC
        LIMIT 25
        `,
        baseParams,
      ),
      client.query(
        `
        SELECT
          COALESCE(
            NULLIF(TRIM(COALESCE(e.first_name, '') || ' ' || COALESCE(e.last_name, '')), ''),
            'Driver #' || CAST(t.driver_id AS varchar)
          ) AS driver,
          COUNT(*)::bigint AS trips,
          SUM(COALESCE(t.total_price_ex_vat, 0))::float8 AS revenue,
          BOOL_OR(COALESCE(e.active, true)) AS active
        ${fromJoins}
        LEFT JOIN public.dim_employee e
          ON e.id = t.driver_id AND e.ferdia_partner_id = t.ferdia_partner_id
        ${whereBase}
          AND t.driver_id IS NOT NULL
        GROUP BY 1
        ORDER BY revenue DESC
        LIMIT 25
        `,
        baseParams,
      ),
      client.query(
        `SELECT name FROM public.dim_garage
         WHERE COALESCE(active, true) = true AND COALESCE(deleted, false) = false
         ORDER BY name`,
      ),
      client.query(
        `SELECT DISTINCT COALESCE(NULLIF(TRIM(category), ''), '(Uncategorised)') AS name
         FROM public.dim_customer
         WHERE COALESCE(deleted, false) = false
         ORDER BY 1`,
      ),
    ]);

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
      vehicles: vehicleRes.rows.map((r) => ({
        coach: r.coach,
        vehicleType: r.vehicle_type,
        licensePlate: r.license_plate,
        trips: Number(r.trips) || 0,
        revenue: Number(r.revenue) || 0,
      })),
      drivers: driverRes.rows.map((r) => ({
        driver: r.driver,
        trips: Number(r.trips) || 0,
        revenue: Number(r.revenue) || 0,
        active: r.active ?? undefined,
      })),
      depots: depotList.rows.map((r) => r.name).filter(Boolean),
      segments: segmentList.rows.map((r) => r.name).filter(Boolean),
    };
  });

  if (!result.ok) return null;
  const v = result.value;

  return {
    source: 'redshift',
    customer,
    asOf: new Date().toISOString(),
    currency: 'GBP',
    filters,
    dateRange: { from, to },
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
      kpis: kpisFromTrend(v.allTrend, v.allBookings),
      trend: v.allTrend,
      byVehicle: v.vehicles,
    },
    byDriver: {
      id: 'by-driver',
      title: 'By driver',
      description: 'Trip revenue attributed to each driver (person) — not the vehicle.',
      kpis: kpisFromTrend(v.allTrend, v.allBookings),
      trend: v.allTrend,
      byDriver: v.drivers,
    },
    note:
      'Figures match Power BI Total Revenue (excl VAT) on operational trips by trip date. Private Hire = Normal trips; Contracts = Fixed trips.',
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
