'use strict';

const { Client } = require('pg');
const { readRedshiftConfigFromEnv } = require('../financeReports/redshiftConfig');

async function main() {
  const config = readRedshiftConfigFromEnv();
  const client = new Client({
    ...config,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 8000,
    query_timeout: 90000,
  });
  await client.connect();

  const q = async (sql, label) => {
    const r = await client.query(sql);
    console.log(label, JSON.stringify(r.rows, null, 2));
  };

  await q(
    `
    SELECT
      CASE
        WHEN COALESCE(is_external, false) THEN 'External'
        WHEN COALESCE(is_rental, false) THEN 'Rental'
        ELSE 'Own fleet'
      END AS job_type,
      COUNT(*)::bigint AS trips,
      SUM(COALESCE(total_price_ex_vat, 0))::float8 AS revenue
    FROM public.fact_teq_trip
    WHERE COALESCE(deleted, false) = false
      AND COALESCE(trip_state, '') NOT IN ('draft', 'sent', 'cancel', 'lost')
      AND COALESCE(status, '') NOT IN ('canceled')
      AND COALESCE(mission_status, '') NOT IN ('canceled')
    GROUP BY 1
    ORDER BY revenue DESC
    `,
    'FLEET_KIND',
  );

  await q(
    `
    SELECT
      CASE
        WHEN trip_type = 'Normal' THEN 'Private Hire'
        WHEN trip_type = 'Fixed' THEN 'Contracts'
        ELSE COALESCE(NULLIF(TRIM(trip_type), ''), '(Other)')
      END AS job_type,
      COUNT(*)::bigint AS trips,
      SUM(COALESCE(total_price_ex_vat, 0))::float8 AS revenue
    FROM public.fact_teq_trip
    WHERE COALESCE(deleted, false) = false
      AND COALESCE(trip_state, '') NOT IN ('draft', 'sent', 'cancel', 'lost')
      AND COALESCE(status, '') NOT IN ('canceled')
      AND COALESCE(mission_status, '') NOT IN ('canceled')
    GROUP BY 1
    ORDER BY revenue DESC
    `,
    'TRIP_TYPE_AS_JOB',
  );

  await q(
    `
    SELECT
      COALESCE(NULLIF(TRIM(c.category), ''), '(Uncategorised)') AS job_type,
      COUNT(*)::bigint AS trips,
      SUM(COALESCE(t.total_price_ex_vat, 0))::float8 AS revenue
    FROM public.fact_teq_trip t
    LEFT JOIN public.dim_customer c
      ON c.id = t.customer_id AND c.ferdia_partner_id = t.ferdia_partner_id
    WHERE COALESCE(t.deleted, false) = false
      AND COALESCE(t.trip_state, '') NOT IN ('draft', 'sent', 'cancel', 'lost')
      AND COALESCE(t.status, '') NOT IN ('canceled')
      AND COALESCE(t.mission_status, '') NOT IN ('canceled')
    GROUP BY 1
    ORDER BY revenue DESC
    LIMIT 20
    `,
    'BY_CATEGORY',
  );

  await q(
    `
    SELECT status, COUNT(*)::bigint AS n
    FROM public.fact_order
    WHERE order_type = 'Normal'
      AND order_date_datekey BETWEEN 20240101 AND 20251013
    GROUP BY 1
    ORDER BY n DESC
    `,
    'ORDERS',
  );

  await q(
    `
    SELECT
      SUM(CASE WHEN status IN ('complete', 'done', 'manually_updated') THEN 1 ELSE 0 END)::bigint AS won,
      SUM(CASE WHEN status = 'lost' THEN 1 ELSE 0 END)::bigint AS lost,
      SUM(CASE WHEN status IN ('sent', 'draft') THEN 1 ELSE 0 END)::bigint AS open_quotes,
      COUNT(*)::bigint AS all_orders
    FROM public.fact_order
    WHERE order_type = 'Normal'
      AND order_date_datekey BETWEEN 20240101 AND 20251013
    `,
    'CONV',
  );

  await q(
    `
    WITH trip_ops AS (
      SELECT
        t.customer_id,
        SUM(COALESCE(t.total_price_ex_vat, 0))::float8 AS revenue,
        COUNT(*)::bigint AS trips,
        MAX(d.year * 10000 + d.month * 100 + d.day) AS last_ymd
      FROM public.fact_teq_trip t
      JOIN public.dim_date d ON d.id = t.trip_date_datekey
      WHERE COALESCE(t.deleted, false) = false
        AND COALESCE(t.trip_state, '') NOT IN ('draft', 'sent', 'cancel', 'lost')
        AND COALESCE(t.status, '') NOT IN ('canceled')
        AND COALESCE(t.mission_status, '') NOT IN ('canceled')
      GROUP BY 1
    ),
    cutoff AS (
      SELECT CAST(TO_CHAR(DATEADD(month, -9, CURRENT_DATE), 'YYYYMMDD') AS INTEGER) AS ymd
    )
    SELECT c.name, c.category, t.revenue, t.trips, t.last_ymd
    FROM trip_ops t
    JOIN public.dim_customer c ON c.id = t.customer_id
    CROSS JOIN cutoff k
    WHERE t.last_ymd < k.ymd
    ORDER BY t.revenue DESC
    LIMIT 10
    `,
    'DORMANT',
  );

  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
