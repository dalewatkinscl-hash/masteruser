'use strict';

const fs = require('fs');
const path = require('path');
const sql = require('mssql');
const admin = require('firebase-admin');

// Load environment variables from functions/.env
function loadEnv() {
  const envPath = path.resolve(__dirname, '../.env');
  if (!fs.existsSync(envPath)) return {};
  const text = fs.readFileSync(envPath, 'utf8');
  const env = {};
  text.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
  });
  return env;
}

const env = loadEnv();

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: 'master-user-management',
  });
}

const db = admin.firestore();

function normalizePlate(plate) {
  return String(plate || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function toDateKey(date) {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

function toIsoDate(date) {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().split('T')[0];
}

async function syncWalkaroundChecks(daysBack = 14) {
  console.log(`[VMS Sync] Starting sync for the past ${daysBack} days...`);

  const hostRaw = env.LOCAL_SQL_HOST || 'country-ad\\sqlexpress2016';
  const [server, instanceName] = hostRaw.includes('\\') ? hostRaw.split('\\') : [hostRaw, undefined];

  const sqlConfig = {
    server,
    options: {
      instanceName,
      port: env.LOCAL_SQL_PORT ? parseInt(env.LOCAL_SQL_PORT, 10) : undefined,
      encrypt: false,
      trustServerCertificate: true,
    },
    database: env.LOCAL_SQL_DATABASE || 'VMS',
    user: env.LOCAL_SQL_USER || 'sa',
    password: env.LOCAL_SQL_PASSWORD,
    connectionTimeout: 10000,
    requestTimeout: 30000,
  };

  const pool = await sql.connect(sqlConfig);
  console.log(`[VMS Sync] Connected to ${sqlConfig.database} on ${hostRaw}.`);

  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - daysBack);
  fromDate.setHours(0, 0, 0, 0);

  // 1. Fetch walkaround checks
  const checksQuery = `
    SELECT 
      c.EmployeeWalkAroundCheckSerialNo AS checkSerialNo,
      c.StartDateTime AS startDateTime,
      c.CompletedDateTime AS completedDateTime,
      DATEDIFF(minute, c.StartDateTime, c.CompletedDateTime) AS durationMinutes,
      c.Distance AS odometer,
      c.Latitude AS latitude,
      c.Longitude AS longitude,
      c.NilDefectSerialNo AS nilDefectSerialNo,
      CASE WHEN c.NilDefectSerialNo IS NOT NULL THEN 1 ELSE 0 END AS isNilDefect,
      v.RegistrationMark AS registrationMark,
      v.FleetNo AS fleetNo,
      e.EmployeeID AS driverId,
      LTRIM(RTRIM(COALESCE(e.FirstName, '') + ' ' + COALESCE(e.Surname, ''))) AS driverName,
      c.DateCreated AS dateCreated
    FROM EmployeeWalkAroundChecks c
    LEFT JOIN Vehicles v ON v.VehicleSerialNo = c.VehicleSerialNo
    LEFT JOIN Employees e ON e.EmployeeSerialNo = c.EmployeeSerialNo
    WHERE c.StartDateTime >= @fromDate
    ORDER BY c.StartDateTime ASC;
  `;

  const request = pool.request();
  request.input('fromDate', sql.DateTime, fromDate);
  const checksRes = await request.query(checksQuery);
  const checks = checksRes.recordset;

  console.log(`[VMS Sync] Retrieved ${checks.length} checks from VMS since ${fromDate.toISOString().split('T')[0]}.`);

  if (checks.length === 0) {
    await pool.close();
    return { synced: 0 };
  }

  // 2. Fetch defects for these checks
  const checkSerialNos = checks.map((c) => c.checkSerialNo);
  const defectsMap = new Map();

  // Query defects in chunks of 1000 if needed
  for (let i = 0; i < checkSerialNos.length; i += 1000) {
    const chunk = checkSerialNos.slice(i, i + 1000);
    const defectReq = pool.request();
    const defectRes = await defectReq.query(`
      SELECT
        d.DefectID AS defectId,
        d.EmployeeWalkAroundCheckSerialNo AS checkSerialNo,
        d.DefectType AS defectType,
        d.DefectTypeDescription AS defectDescription,
        d.FailureReason AS failureReason,
        d.DefectSeverity AS severity,
        d.Comments AS comments,
        d.Rectified AS isRectified,
        d.RectifiedDateTime AS rectifiedDateTime,
        d.RectifiedDescription AS rectifiedDescription,
        d.DefectStatus AS defectStatus
      FROM Defects d
      WHERE d.EmployeeWalkAroundCheckSerialNo IN (${chunk.join(',')})
    `);

    for (const d of defectRes.recordset) {
      if (!defectsMap.has(d.checkSerialNo)) {
        defectsMap.set(d.checkSerialNo, []);
      }
      defectsMap.get(d.checkSerialNo).push({
        defectId: d.defectId,
        type: d.defectType || '',
        description: d.defectDescription || '',
        failureReason: d.failureReason || '',
        severity: d.severity || '',
        comments: d.comments || '',
        isRectified: d.isRectified === 'Y' || d.isRectified === true,
        rectifiedDateTime: d.rectifiedDateTime ? new Date(d.rectifiedDateTime).toISOString() : null,
        rectifiedDescription: d.rectifiedDescription || '',
        status: d.defectStatus || '',
      });
    }
  }

  await pool.close();
  console.log(`[VMS Sync] Retrieved defect records for ${defectsMap.size} checks.`);

  // 3. Batch write to Firestore collection 'vmsWalkAroundChecks'
  const colRef = db.collection('vmsWalkAroundChecks');
  const BATCH_SIZE = 400;
  let batch = db.batch();
  let countInBatch = 0;
  let totalSaved = 0;

  for (const c of checks) {
    const checkIdStr = String(c.checkSerialNo);
    const docRef = colRef.doc(checkIdStr);
    const dateKey = toDateKey(c.startDateTime);
    const dateIso = toIsoDate(c.startDateTime);
    const regNorm = normalizePlate(c.registrationMark);
    const checkDefects = defectsMap.get(c.checkSerialNo) || [];

    batch.set(
      docRef,
      {
        checkSerialNo: c.checkSerialNo,
        dateKey,
        dateIso,
        registrationNorm: regNorm,
        registrationMark: c.registrationMark ? c.registrationMark.trim() : '',
        fleetNo: c.fleetNo ? c.fleetNo.trim() : '',
        driverId: c.driverId ? c.driverId.trim() : '',
        driverName: c.driverName || '',
        startDateTime: c.startDateTime ? new Date(c.startDateTime).toISOString() : null,
        completedDateTime: c.completedDateTime ? new Date(c.completedDateTime).toISOString() : null,
        durationMinutes: Number(c.durationMinutes) || 0,
        odometer: Number(c.odometer) || 0,
        isNilDefect: c.isNilDefect === 1 && checkDefects.length === 0,
        hasDefects: checkDefects.length > 0 || c.isNilDefect === 0,
        defects: checkDefects,
        latitude: c.latitude != null ? Number(c.latitude) : null,
        longitude: c.longitude != null ? Number(c.longitude) : null,
        syncedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    countInBatch++;
    totalSaved++;

    if (countInBatch >= BATCH_SIZE) {
      await batch.commit();
      console.log(`[VMS Sync] Saved ${totalSaved} checks so far...`);
      batch = db.batch();
      countInBatch = 0;
    }
  }

  if (countInBatch > 0) {
    await batch.commit();
  }

  // Update sync metadata
  await db.collection('vmsWalkAroundMeta').doc('status').set(
    {
      lastSyncAt: admin.firestore.FieldValue.serverTimestamp(),
      lastSyncDateIso: new Date().toISOString(),
      totalChecksSaved: totalSaved,
      daysSynced: daysBack,
    },
    { merge: true }
  );

  console.log(`[VMS Sync] Completed! Successfully saved ${totalSaved} walkaround checks into Firestore.`);
  return { synced: totalSaved };
}

if (require.main === module) {
  const daysArg = parseInt(process.argv[2], 10) || 14;
  syncWalkaroundChecks(daysArg)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[VMS Sync Error]:', err);
      process.exit(1);
    });
}

module.exports = {
  syncWalkaroundChecks,
};
