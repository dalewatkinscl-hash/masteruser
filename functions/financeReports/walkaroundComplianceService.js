'use strict';

const { withRedshift } = require('./redshiftClient');

function normalizePlate(plate) {
  return String(plate || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function toLondonDateKey(d = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const y = parts.find((p) => p.type === 'year')?.value || '2026';
  const m = parts.find((p) => p.type === 'month')?.value || '01';
  const day = parts.find((p) => p.type === 'day')?.value || '01';
  return `${y}${m}${day}`;
}

function toLondonDateIso(d = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const y = parts.find((p) => p.type === 'year')?.value || '2026';
  const m = parts.find((p) => p.type === 'month')?.value || '01';
  const day = parts.find((p) => p.type === 'day')?.value || '01';
  return `${y}-${m}-${day}`;
}

/**
 * Build daily walkaround compliance report combining Redshift allocated trips and Firestore VMS checks.
 */
async function getWalkaroundComplianceReport(rawDate, db) {
  const dateIso = typeof rawDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rawDate.trim())
    ? rawDate.trim()
    : toLondonDateIso();
  const dateKey = parseInt(dateIso.replace(/-/g, ''), 10);

  // 1. Fetch metadata (last VMS sync timestamp)
  let lastSync = null;
  if (db) {
    try {
      const metaDoc = await db.collection('vmsWalkAroundMeta').doc('status').get();
      if (metaDoc.exists) {
        const d = metaDoc.data();
        lastSync = {
          lastSyncAt: d.lastSyncAt?.toDate ? d.lastSyncAt.toDate().toISOString() : d.lastSyncDateIso || null,
          totalChecksSaved: d.totalChecksSaved || 0,
        };
      }
    } catch (err) {
      console.warn('[walkaroundCompliance] could not fetch meta status:', err.message);
    }
  }

  // 2. Fetch VMS walkaround checks from Firestore for dateKey
  const vmsMap = new Map();
  const allVmsChecks = [];
  if (db) {
    try {
      const checksSnap = await db
        .collection('vmsWalkAroundChecks')
        .where('dateKey', '==', String(dateKey))
        .get();

      checksSnap.forEach((doc) => {
        const data = doc.data();
        const reg = normalizePlate(data.registrationNorm || data.registrationMark);
        if (!vmsMap.has(reg)) {
          vmsMap.set(reg, []);
        }
        vmsMap.get(reg).push(data);
        allVmsChecks.push(data);
      });
    } catch (err) {
      console.warn('[walkaroundCompliance] Firestore checks fetch failed:', err.message);
    }
  }

  // 3. Query Redshift for vehicles allocated work on this dateKey
  let redshiftRows = [];
  const redshiftRes = await withRedshift(async (client) => {
    const res = await client.query(
      `
      WITH ranked_trips AS (
        SELECT 
          t.trip_date_datekey,
          v.license_plate,
          v.passenger_capacity,
          COALESCE(NULLIF(TRIM(v.vehicle_name), ''), v.license_plate) AS vehicle_name,
          COALESCE(
            NULLIF(TRIM(COALESCE(e.first_name, '') || ' ' || COALESCE(e.last_name, '')), ''),
            'Driver #' || CAST(t.driver_id AS varchar)
          ) AS first_allocated_driver,
          e.id AS driver_id,
          t.trip_code,
          t.trip_type,
          COALESCE(c.name, '(Unknown customer)') AS customer_name,
          COALESCE(t.a_actualtime, t.a_plannedtime) AS first_departure_time,
          t.a_plannedtime,
          t.a_actualtime,
          ROW_NUMBER() OVER (
            PARTITION BY v.license_plate 
            ORDER BY COALESCE(t.a_actualtime, t.a_plannedtime) ASC, t.id ASC
          ) as rn,
          COUNT(*) OVER (PARTITION BY v.license_plate) as total_trips_today
        FROM public.fact_teq_trip t
        JOIN public.dim_vehicle v ON v.id = t.vehicle_id AND v.ferdia_partner_id = t.ferdia_partner_id
        LEFT JOIN public.dim_employee e ON e.id = t.driver_id AND e.ferdia_partner_id = t.ferdia_partner_id
        LEFT JOIN public.dim_customer c ON c.id = t.customer_id AND c.ferdia_partner_id = t.ferdia_partner_id
        WHERE COALESCE(t.deleted, false) = false
          AND COALESCE(t.trip_state, '') NOT IN ('draft', 'sent', 'cancel', 'lost')
          AND COALESCE(t.status, '') NOT IN ('canceled')
          AND t.vehicle_id IS NOT NULL
          AND t.trip_date_datekey = $1
      )
      SELECT *
      FROM ranked_trips
      WHERE rn = 1
      ORDER BY first_departure_time ASC;
      `,
      [dateKey]
    );
    return res.rows;
  });

  if (redshiftRes.ok) {
    redshiftRows = Array.isArray(redshiftRes.value) ? redshiftRes.value : [];
  } else {
    console.error('[walkaroundCompliance] Redshift query failed:', redshiftRes.reason);
  }

  // 4. Correlate Redshift allocated vehicles with VMS walkaround checks
  const matchedPlates = new Set();
  const records = [];
  let compliantCount = 0;
  let missingCount = 0;
  let defectCount = 0;
  let lateCount = 0;

  for (const r of redshiftRows) {
    const regNorm = normalizePlate(r.license_plate);
    matchedPlates.add(regNorm);

    const checks = vmsMap.get(regNorm) || [];
    // Sort checks by completion time
    checks.sort((a, b) => new Date(a.completedDateTime || a.startDateTime) - new Date(b.completedDateTime || b.startDateTime));
    const primaryCheck = checks[0] || null;

    let status = 'missing_check';
    let isLate = false;
    let departureTimeIso = null;

    if (r.first_departure_time) {
      departureTimeIso = r.first_departure_time instanceof Date
        ? r.first_departure_time.toISOString()
        : new Date(r.first_departure_time).toISOString();
    }

    if (primaryCheck) {
      const checkEnd = primaryCheck.completedDateTime ? new Date(primaryCheck.completedDateTime) : null;
      const departTime = departureTimeIso ? new Date(departureTimeIso) : null;

      // If departure time is known and check was completed after departure (+10m buffer)
      if (checkEnd && departTime && checkEnd.getTime() > (departTime.getTime() + 10 * 60 * 1000)) {
        isLate = true;
      }

      if (primaryCheck.hasDefects) {
        status = 'defect_reported';
        defectCount++;
      } else if (isLate) {
        status = 'late_check';
        lateCount++;
        compliantCount++; // It was completed, though late
      } else {
        status = 'compliant';
        compliantCount++;
      }
    } else {
      status = 'missing_check';
      missingCount++;
    }

    const firstDriver = r.first_allocated_driver || 'Unassigned Driver';
    const inspectingDriver = primaryCheck?.driverName || null;
    const isDriverMismatch = inspectingDriver && firstDriver
      && normalizePlate(inspectingDriver) !== normalizePlate(firstDriver);

    records.push({
      licensePlate: r.license_plate,
      vehicleName: r.vehicle_name,
      capacity: Number(r.passenger_capacity) || null,
      firstDepartureTime: departureTimeIso,
      firstAllocatedDriver: firstDriver,
      firstAllocatedDriverId: r.driver_id,
      firstTripCode: r.trip_code,
      firstTripType: r.trip_type === 'Normal' ? 'Private Hire' : r.trip_type === 'Fixed' ? 'Contracts' : r.trip_type,
      customerName: r.customer_name,
      totalTripsToday: Number(r.total_trips_today) || 1,
      status,
      isLate,
      driverMismatch: Boolean(isDriverMismatch),
      // VMS Check Details
      checkSerialNo: primaryCheck?.checkSerialNo || null,
      checkStartTime: primaryCheck?.startDateTime || null,
      checkCompletedTime: primaryCheck?.completedDateTime || null,
      durationMinutes: primaryCheck?.durationMinutes || null,
      odometer: primaryCheck?.odometer || null,
      inspectingDriver,
      inspectingDriverId: primaryCheck?.driverId || null,
      isNilDefect: primaryCheck?.isNilDefect ?? null,
      hasDefects: primaryCheck?.hasDefects || false,
      defects: primaryCheck?.defects || [],
      allChecksCount: checks.length,
    });
  }

  // 5. Unallocated checks (checks done on vehicles that had NO trips in Redshift today)
  const unallocatedChecks = [];
  for (const check of allVmsChecks) {
    const regNorm = normalizePlate(check.registrationNorm || check.registrationMark);
    if (!matchedPlates.has(regNorm)) {
      unallocatedChecks.push({
        registrationMark: check.registrationMark,
        fleetNo: check.fleetNo,
        inspectingDriver: check.driverName,
        completedTime: check.completedDateTime,
        durationMinutes: check.durationMinutes,
        isNilDefect: check.isNilDefect,
        hasDefects: check.hasDefects,
        defectsCount: check.defects?.length || 0,
      });
    }
  }

  const totalAllocated = redshiftRows.length;
  const complianceRate = totalAllocated > 0
    ? Math.round(((totalAllocated - missingCount) / totalAllocated) * 1000) / 10
    : 100;

  return {
    id: 'walkaround-compliance',
    title: 'Walk Around Compliance',
    description:
      'Verification of mandatory driver walkaround checks in VMS against all vehicles allocated operational work in Redshift. Identifies missing inspections for first allocated drivers.',
    date: dateIso,
    dateKey,
    lastSync,
    kpis: {
      totalAllocated,
      compliantCount,
      missingCount,
      defectCount,
      lateCount,
      complianceRate,
      unallocatedChecksCount: unallocatedChecks.length,
    },
    records: records.sort((a, b) => {
      // Prioritize missing checks at top, then defects, then by departure time
      const score = (r) => (r.status === 'missing_check' ? 3 : r.status === 'defect_reported' ? 2 : r.status === 'late_check' ? 1 : 0);
      return score(b) - score(a) || (a.firstDepartureTime || '').localeCompare(b.firstDepartureTime || '');
    }),
    unallocatedChecks,
  };
}

module.exports = {
  getWalkaroundComplianceReport,
};
