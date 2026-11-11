'use strict';

const { execSync } = require('child_process');
const { Client } = require('pg');

function getSecret(name) {
  return execSync(`npx firebase functions:secrets:access ${name} --project master-user-management`, {
    encoding: 'utf8',
  }).trim();
}

async function run() {
  const hostRaw = getSecret('REDSHIFT_HOST');
  const database = getSecret('REDSHIFT_DATABASE');
  const user = getSecret('REDSHIFT_USER');
  const password = getSecret('REDSHIFT_PASSWORD');

  const [host, portStr] = hostRaw.split(':');
  const client = new Client({
    host,
    port: parseInt(portStr || 5439, 10),
    database,
    user,
    password,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
  });

  await client.connect();
  console.log('Connected to Redshift!');

  const fromYmd = 20241022;
  const toYmd = 20251022;

  // Let's measure each query in financeService.js
  const measure = async (name, fn) => {
    const t0 = Date.now();
    await fn();
    console.log(`[TIMING] ${name}: ${Date.now() - t0}ms`);
  };

  // 1. Trend
  await measure('1. Trend', () => client.query(`
    SELECT d.year, d.month, t.trip_type,
      SUM(COALESCE(t.total_price_ex_vat, 0))::float8 AS revenue,
      COUNT(*)::bigint AS trips
    FROM public.fact_teq_trip t
    JOIN public.dim_date d ON d.id = t.trip_date_datekey
    WHERE COALESCE(t.deleted, false) = false
      AND COALESCE(t.trip_state, '') NOT IN ('draft', 'sent', 'cancel', 'lost')
      AND COALESCE(t.status, '') NOT IN ('canceled')
      AND COALESCE(t.mission_status, '') NOT IN ('canceled')
      AND t.trip_date_datekey BETWEEN ${fromYmd} AND ${toYmd}
    GROUP BY d.year, d.month, t.trip_type
  `));

  // 2. Bookings
  await measure('2. Bookings', () => client.query(`
    SELECT
      COUNT(DISTINCT CASE WHEN t.trip_type = 'Normal' THEN t.order_id END)::bigint AS ph_bookings,
      COUNT(DISTINCT CASE WHEN t.trip_type = 'Fixed' THEN t.order_id END)::bigint AS ct_bookings,
      COUNT(DISTINCT t.order_id)::bigint AS all_bookings
    FROM public.fact_teq_trip t
    WHERE COALESCE(t.deleted, false) = false
      AND COALESCE(t.trip_state, '') NOT IN ('draft', 'sent', 'cancel', 'lost')
      AND COALESCE(t.status, '') NOT IN ('canceled')
      AND COALESCE(t.mission_status, '') NOT IN ('canceled')
      AND t.trip_date_datekey BETWEEN ${fromYmd} AND ${toYmd}
  `));

  // 3. Vehicles
  await measure('3. Vehicles', () => client.query(`
    SELECT
      COALESCE(NULLIF(TRIM(v.license_plate), ''), '(Unassigned)') AS license_plate,
      t.trip_type,
      SUM(COALESCE(t.total_price_ex_vat, 0))::float8 AS revenue,
      COUNT(*)::bigint AS trips
    FROM public.fact_teq_trip t
    LEFT JOIN public.dim_vehicle v ON v.id = t.vehicle_id AND v.ferdia_partner_id = t.ferdia_partner_id
    WHERE COALESCE(t.deleted, false) = false
      AND COALESCE(t.trip_state, '') NOT IN ('draft', 'sent', 'cancel', 'lost')
      AND COALESCE(t.status, '') NOT IN ('canceled')
      AND COALESCE(t.mission_status, '') NOT IN ('canceled')
      AND t.trip_date_datekey BETWEEN ${fromYmd} AND ${toYmd}
    GROUP BY 1, 2
  `));

  // 4. Utilisation
  await measure('4. Utilisation', () => client.query(`
    WITH trip_durations AS (
      SELECT
        t.vehicle_id,
        t.ferdia_partner_id,
        t.trip_type,
        SUM(COALESCE(t.total_price_ex_vat, 0))::float8 AS revenue,
        COUNT(*)::bigint AS trips,
        ROUND(SUM(
          CASE
            WHEN t.a_time IS NOT NULL AND COALESCE(t.d_time, t.c2_time, t.c_time, t.b2_time, t.b_time) IS NOT NULL
              AND DATEDIFF(minute, t.a_time, COALESCE(t.d_time, t.c2_time, t.c_time, t.b2_time, t.b_time)) > 0
              AND DATEDIFF(minute, t.a_time, COALESCE(t.d_time, t.c2_time, t.c_time, t.b2_time, t.b_time)) <= 1440
            THEN DATEDIFF(minute, t.a_time, COALESCE(t.d_time, t.c2_time, t.c_time, t.b2_time, t.b_time)) / 60.0
            ELSE 2.5
          END
        )::numeric, 1)::float8 AS operational_hours
      FROM (
        SELECT
          sub.vehicle_id,
          sub.ferdia_partner_id,
          sub.trip_type,
          sub.total_price_ex_vat,
          COALESCE(sub.a_actualtime, sub.a_plannedtime) AS a_time,
          COALESCE(sub.b_actualtime, sub.b_plannedtime) AS b_time,
          COALESCE(sub.b2_actualtime, sub.b2_plannedtime) AS b2_time,
          COALESCE(sub.c_actualtime, sub.c_plannedtime) AS c_time,
          COALESCE(sub.c2_actualtime, sub.c2_plannedtime) AS c2_time,
          COALESCE(sub.d_actualtime, sub.d_plannedtime) AS d_time
        FROM public.fact_teq_trip sub
        WHERE COALESCE(sub.deleted, false) = false
          AND COALESCE(sub.trip_state, '') NOT IN ('draft', 'sent', 'cancel', 'lost')
          AND COALESCE(sub.status, '') NOT IN ('canceled')
          AND COALESCE(sub.mission_status, '') NOT IN ('canceled')
          AND sub.trip_date_datekey BETWEEN ${fromYmd} AND ${toYmd}
      ) t
      GROUP BY 1, 2, 3
    )
    SELECT
      COALESCE(NULLIF(TRIM(v.vehicle_name), ''), TRIM(v.license_plate), '(Unassigned)') AS coach,
      COALESCE(NULLIF(TRIM(v.license_plate), ''), '(Unassigned)') AS license_plate,
      COALESCE(NULLIF(TRIM(v.vehicle_type), ''), 'Standard') AS vehicle_type,
      d.trip_type,
      d.trips,
      d.revenue,
      d.operational_hours
    FROM trip_durations d
    JOIN public.dim_vehicle v ON v.id = d.vehicle_id AND v.ferdia_partner_id = d.ferdia_partner_id
  `));

  // 5. Drivers
  await measure('5. Drivers', () => client.query(`
    SELECT
      COALESCE(
        NULLIF(TRIM(COALESCE(e.first_name, '') || ' ' || COALESCE(e.last_name, '')), ''),
        'Driver #' || CAST(t.driver_id AS varchar)
      ) AS driver,
      t.trip_type,
      SUM(COALESCE(t.total_price_ex_vat, 0))::float8 AS revenue,
      COUNT(*)::bigint AS trips
    FROM public.fact_teq_trip t
    LEFT JOIN public.dim_employee e ON e.id = t.driver_id AND e.ferdia_partner_id = t.ferdia_partner_id
    WHERE COALESCE(t.deleted, false) = false
      AND COALESCE(t.trip_state, '') NOT IN ('draft', 'sent', 'cancel', 'lost')
      AND COALESCE(t.status, '') NOT IN ('canceled')
      AND COALESCE(t.mission_status, '') NOT IN ('canceled')
      AND t.trip_date_datekey BETWEEN ${fromYmd} AND ${toYmd}
      AND t.driver_id IS NOT NULL
    GROUP BY 1, 2
  `));

  // 6. Job types
  await measure('6. Job types', () => client.query(`
    SELECT
      COALESCE(NULLIF(TRIM(c.category), ''), '(Uncategorised)') AS job_type,
      t.trip_type,
      COUNT(*)::bigint AS trips,
      SUM(COALESCE(t.total_price_ex_vat, 0))::float8 AS revenue
    FROM public.fact_teq_trip t
    LEFT JOIN public.dim_customer c ON c.id = t.customer_id AND c.ferdia_partner_id = t.ferdia_partner_id
    WHERE COALESCE(t.deleted, false) = false
      AND COALESCE(t.trip_state, '') NOT IN ('draft', 'sent', 'cancel', 'lost')
      AND COALESCE(t.status, '') NOT IN ('canceled')
      AND COALESCE(t.mission_status, '') NOT IN ('canceled')
      AND t.trip_date_datekey BETWEEN ${fromYmd} AND ${toYmd}
    GROUP BY 1, 2
  `));

  // 7. Top customers
  await measure('7. Top customers', () => client.query(`
    SELECT
      COALESCE(NULLIF(TRIM(c.name), ''), '(Unknown customer)') AS customer,
      COALESCE(NULLIF(TRIM(c.category), ''), '(Uncategorised)') AS category,
      t.trip_type,
      COUNT(*)::bigint AS trips,
      COUNT(DISTINCT t.order_id)::bigint AS bookings,
      SUM(COALESCE(t.total_price_ex_vat, 0))::float8 AS revenue
    FROM public.fact_teq_trip t
    LEFT JOIN public.dim_customer c ON c.id = t.customer_id AND c.ferdia_partner_id = t.ferdia_partner_id
    WHERE COALESCE(t.deleted, false) = false
      AND COALESCE(t.trip_state, '') NOT IN ('draft', 'sent', 'cancel', 'lost')
      AND COALESCE(t.status, '') NOT IN ('canceled')
      AND COALESCE(t.mission_status, '') NOT IN ('canceled')
      AND t.trip_date_datekey BETWEEN ${fromYmd} AND ${toYmd}
    GROUP BY 1, 2, 3
  `));

  // 8. Conversion
  await measure('8. Conversion', () => client.query(`
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
        AND o.order_date_datekey BETWEEN ${fromYmd} AND ${toYmd}
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
  `));

  // 9. Dormant
  await measure('9. Dormant', () => client.query(`
    WITH trip_ops AS (
      SELECT
        t.customer_id,
        t.ferdia_partner_id,
        SUM(COALESCE(t.total_price_ex_vat, 0))::float8 AS revenue,
        COUNT(*)::bigint AS trips,
        MAX(d.year * 10000 + d.month * 100 + d.day) AS last_ymd
      FROM public.fact_teq_trip t
      JOIN public.dim_date d ON d.id = t.trip_date_datekey
      WHERE COALESCE(t.deleted, false) = false
        AND COALESCE(t.trip_state, '') NOT IN ('draft', 'sent', 'cancel', 'lost')
        AND COALESCE(t.status, '') NOT IN ('canceled')
        AND COALESCE(t.mission_status, '') NOT IN ('canceled')
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
    JOIN public.dim_customer c ON c.id = t.customer_id AND c.ferdia_partner_id = t.ferdia_partner_id
    CROSS JOIN cutoff k
    WHERE t.last_ymd < k.ymd
    ORDER BY t.revenue DESC
    LIMIT 10
  `));

  // 10. Comparisons
  await measure('10. Comparisons', () => client.query(`
    SELECT
      SUM(CASE WHEN d_val BETWEEN ${fromYmd} AND ${toYmd} THEN total_price_ex_vat ELSE 0 END)::float8 AS rev_cur,
      COUNT(CASE WHEN d_val BETWEEN ${fromYmd} AND ${toYmd} THEN 1 ELSE NULL END)::bigint AS trips_cur,
      COUNT(DISTINCT CASE WHEN d_val BETWEEN ${fromYmd} AND ${toYmd} THEN order_id ELSE NULL END)::bigint AS bookings_cur,
      SUM(CASE WHEN d_val BETWEEN 20231022 AND 20241022 THEN total_price_ex_vat ELSE 0 END)::float8 AS rev_prior,
      COUNT(CASE WHEN d_val BETWEEN 20231022 AND 20241022 THEN 1 ELSE NULL END)::bigint AS trips_prior,
      COUNT(DISTINCT CASE WHEN d_val BETWEEN 20231022 AND 20241022 THEN order_id ELSE NULL END)::bigint AS bookings_prior,
      SUM(CASE WHEN d_val BETWEEN 20251001 AND 20251022 THEN total_price_ex_vat ELSE 0 END)::float8 AS rev_mtd,
      COUNT(CASE WHEN d_val BETWEEN 20251001 AND 20251022 THEN 1 ELSE NULL END)::bigint AS trips_mtd,
      COUNT(DISTINCT CASE WHEN d_val BETWEEN 20251001 AND 20251022 THEN order_id ELSE NULL END)::bigint AS bookings_mtd,
      SUM(CASE WHEN d_val BETWEEN 20241001 AND 20241022 THEN total_price_ex_vat ELSE 0 END)::float8 AS rev_mtd_ly,
      COUNT(CASE WHEN d_val BETWEEN 20241001 AND 20241022 THEN 1 ELSE NULL END)::bigint AS trips_mtd_ly,
      COUNT(DISTINCT CASE WHEN d_val BETWEEN 20241001 AND 20241022 THEN order_id ELSE NULL END)::bigint AS bookings_mtd_ly
    FROM (
      SELECT
        t.total_price_ex_vat,
        t.order_id,
        (d.year * 10000 + d.month * 100 + d.day) AS d_val
      FROM public.fact_teq_trip t
      JOIN public.dim_date d ON d.id = t.trip_date_datekey
      WHERE COALESCE(t.deleted, false) = false
        AND COALESCE(t.trip_state, '') NOT IN ('draft', 'sent', 'cancel', 'lost')
        AND COALESCE(t.status, '') NOT IN ('canceled')
        AND COALESCE(t.mission_status, '') NOT IN ('canceled')
        AND (
          (d.year * 10000 + d.month * 100 + d.day) BETWEEN ${fromYmd} AND ${toYmd}
          OR (d.year * 10000 + d.month * 100 + d.day) BETWEEN 20231022 AND 20241022
          OR (d.year * 10000 + d.month * 100 + d.day) BETWEEN 20251001 AND 20251022
          OR (d.year * 10000 + d.month * 100 + d.day) BETWEEN 20241001 AND 20241022
        )
    ) sub
  `));

  // 11. Customer health
  await measure('11. Customer health', () => client.query(`
    WITH trip_ops AS (
      SELECT
        t.customer_id,
        t.ferdia_partner_id,
        SUM(COALESCE(t.total_price_ex_vat, 0))::float8 AS revenue,
        COUNT(*)::bigint AS trips,
        MAX(d.year * 10000 + d.month * 100 + d.day) AS last_ymd
      FROM public.fact_teq_trip t
      JOIN public.dim_date d ON d.id = t.trip_date_datekey
      WHERE COALESCE(t.deleted, false) = false
        AND COALESCE(t.trip_state, '') NOT IN ('draft', 'sent', 'cancel', 'lost')
        AND COALESCE(t.status, '') NOT IN ('canceled')
        AND COALESCE(t.mission_status, '') NOT IN ('canceled')
      GROUP BY 1, 2
    ),
    cutoffs AS (
      SELECT
        CAST(TO_CHAR(DATEADD(month, -3, CURRENT_DATE), 'YYYYMMDD') AS INTEGER) AS active_ymd,
        CAST(TO_CHAR(DATEADD(month, -9, CURRENT_DATE), 'YYYYMMDD') AS INTEGER) AS risk_ymd
    ),
    banded_customers AS (
      SELECT
        c.name,
        c.category,
        t.revenue,
        t.trips,
        t.last_ymd,
        CASE
          WHEN t.last_ymd >= k.active_ymd THEN 'active'
          WHEN t.last_ymd >= k.risk_ymd THEN 'atRisk'
          ELSE 'churned'
        END AS health_status,
        ROW_NUMBER() OVER (
          PARTITION BY (CASE WHEN t.last_ymd >= k.active_ymd THEN 'active' WHEN t.last_ymd >= k.risk_ymd THEN 'atRisk' ELSE 'churned' END)
          ORDER BY t.revenue DESC
        ) AS rn
      FROM trip_ops t
      JOIN public.dim_customer c ON c.id = t.customer_id AND c.ferdia_partner_id = t.ferdia_partner_id
      CROSS JOIN cutoffs k
    )
    SELECT
      health_status,
      name,
      category,
      revenue,
      trips,
      last_ymd,
      rn
    FROM banded_customers
    WHERE rn <= 10
    ORDER BY health_status, rn
  `));

  // 12. Pax Capacity Summary
  await measure('12. Pax Capacity Summary', () => client.query(`
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
    LEFT JOIN public.dim_customer c ON c.id = t.customer_id AND c.ferdia_partner_id = t.ferdia_partner_id
    WHERE COALESCE(t.deleted, false) = false
      AND COALESCE(t.trip_state, '') NOT IN ('draft', 'sent', 'cancel', 'lost')
      AND COALESCE(t.status, '') NOT IN ('canceled')
      AND COALESCE(t.mission_status, '') NOT IN ('canceled')
      AND t.trip_date_datekey BETWEEN ${fromYmd} AND ${toYmd}
      AND t.pax > 0
      AND v.passenger_capacity > 0
  `));

  // 13. Pax Capacity Mismatched
  await measure('13. Pax Capacity Mismatched', () => client.query(`
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
      AND t.trip_date_datekey BETWEEN ${fromYmd} AND ${toYmd}
      AND t.pax > 0
      AND v.passenger_capacity > 0
      AND (v.passenger_capacity - t.pax) >= 20
    ORDER BY empty_seats DESC, t.trip_date_datekey DESC
    LIMIT 100
  `));

  // 14. Pax Capacity Vehicles
  await measure('14. Pax Capacity Vehicles', () => client.query(`
    SELECT
      v.license_plate,
      v.passenger_capacity AS capacity,
      COUNT(*)::bigint AS trips,
      SUM(t.pax)::bigint AS total_pax,
      SUM(GREATEST(0, v.passenger_capacity - t.pax))::bigint AS total_empty_seats,
      AVG((t.pax::float / v.passenger_capacity::float) * 100)::numeric(10,1) AS avg_seat_fill_pct,
      COUNT(CASE WHEN (v.passenger_capacity - t.pax) >= 20 THEN 1 END)::bigint AS high_empty_trips,
      MIN(t.pax) AS min_pax_carried,
      MAX(t.pax) AS max_pax_carried
    FROM public.fact_teq_trip t
    JOIN public.dim_vehicle v ON v.id = t.vehicle_id AND v.ferdia_partner_id = t.ferdia_partner_id
    LEFT JOIN public.dim_customer c ON c.id = t.customer_id AND c.ferdia_partner_id = t.ferdia_partner_id
    WHERE COALESCE(t.deleted, false) = false
      AND COALESCE(t.trip_state, '') NOT IN ('draft', 'sent', 'cancel', 'lost')
      AND COALESCE(t.status, '') NOT IN ('canceled')
      AND COALESCE(t.mission_status, '') NOT IN ('canceled')
      AND t.trip_date_datekey BETWEEN ${fromYmd} AND ${toYmd}
      AND t.pax > 0
      AND v.passenger_capacity > 0
    GROUP BY v.license_plate, v.passenger_capacity
    ORDER BY high_empty_trips DESC, total_empty_seats DESC
  `));

  await client.end();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
