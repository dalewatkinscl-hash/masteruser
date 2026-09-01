import { createRequire } from 'module';
import fs from 'fs';

const require = createRequire(
  new URL('../functions/package.json', import.meta.url),
);
const admin = require('firebase-admin');
const {
  mapHrSpreadsheetRow,
  mergeEmployeeProfiles,
} = require('../functions/employeeProfile.js');

const rowsPath =
  'c:/Users/dalewatkins/OneDrive - Country Lion/Projects/hrdata/hr-import-rows.json';

admin.initializeApp({ projectId: 'master-user-management' });
const db = admin.firestore();

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

const rows = JSON.parse(fs.readFileSync(rowsPath, 'utf8'));
const snapshot = await db.collection('users').get();

const usersByEmail = new Map();
snapshot.docs.forEach((doc) => {
  const data = doc.data();
  const email = normalizeEmail(data.email);
  if (email) usersByEmail.set(email, { uid: doc.id, ...data });
});

let matched = 0;
const unmatched = [];
const batchSize = 400;
let batch = db.batch();
let batchCount = 0;

async function commitBatch() {
  if (batchCount === 0) return;
  await batch.commit();
  batch = db.batch();
  batchCount = 0;
}

for (const rawRow of rows) {
  const mapped = mapHrSpreadsheetRow(rawRow);
  if (!mapped.fullName && !mapped.email) continue;

  const employeeProfile = mergeEmployeeProfiles({}, {
    drivingStaff: mapped.drivingStaff,
    computerUser: mapped.computerUser,
    department: mapped.department,
    managerName: mapped.managerName,
    contractType: mapped.contractType,
    jobRole: mapped.jobRole,
    phoneNumber: mapped.phoneNumber,
    personalEmail: mapped.personalEmail,
    computerAsset: mapped.computerAsset,
    dateOfBirth: mapped.dateOfBirth,
    startDate: mapped.startDate,
    lastAtFaultAccidentDate: mapped.lastAtFaultAccidentDate,
    lastAppraisalDate: mapped.lastAppraisalDate,
  });

  const existing = mapped.email ? usersByEmail.get(mapped.email) : null;

  if (existing) {
    const ref = db.collection('users').doc(existing.uid);
    batch.set(
      ref,
      {
        fullName: mapped.fullName || existing.fullName || '',
        isActive: mapped.isActive,
        contactEmail: mapped.personalEmail || existing.contactEmail || '',
        employeeProfile: mergeEmployeeProfiles(existing.employeeProfile, employeeProfile),
        employeeProfileUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        hrDataImportedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    batchCount += 1;
    matched += 1;
  } else {
    unmatched.push({
      fullName: mapped.fullName,
      email: mapped.email,
    });
  }

  if (batchCount >= batchSize) {
    await commitBatch();
  }
}

await commitBatch();

console.log(JSON.stringify({ matched, unmatchedCount: unmatched.length, unmatched }, null, 2));
process.exit(0);
