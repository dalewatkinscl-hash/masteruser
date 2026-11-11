'use strict';

/**
 * Re-read SharePoint Disciplinary Process Log dates with Europe/London parsing
 * and amend any bonus_absence_deductions whose eventDate/absenceDate is wrong.
 *
 * Usage (from functions/):
 *   node scripts/repairBonusSharePointDates.js
 *   node scripts/repairBonusSharePointDates.js --dry-run
 */

const fs = require('fs');
const path = require('path');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx < 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(path.join(__dirname, '..', '.env'));

const admin = require('firebase-admin');
const {
  isSharePointConfigured,
  listDisciplinaryProcessLogBonusItems,
} = require('../sharepoint');
const { PAYMENT_RUNS_COLLECTION } = require('../bonusPaymentRuns');

const dryRun = process.argv.includes('--dry-run');

admin.initializeApp({
  projectId: 'master-user-management',
});

const db = admin.firestore();

function getSharePointConfig() {
  return {
    tenantId: process.env.MS_GRAPH_TENANT_ID || '',
    clientId: process.env.MS_GRAPH_CLIENT_ID || '',
    clientSecret: process.env.MS_GRAPH_CLIENT_SECRET || '',
  };
}

function addDaysIso(isoDate, days) {
  const text = String(isoDate || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return '';
  const date = new Date(`${text}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

function ukDate(iso) {
  const key = String(iso || '').slice(0, 10);
  const match = key.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return key || '—';
  return `${match[3]}/${match[2]}/${match[1]}`;
}

(async () => {
  try {
    const config = getSharePointConfig();
    if (!isSharePointConfigured(config)) {
      console.error('SharePoint is not configured in functions/.env');
      process.exit(1);
    }

    const [deductionsSnap, runsSnap, settingsSnap] = await Promise.all([
      db.collection('bonus_absence_deductions').get(),
      db.collection(PAYMENT_RUNS_COLLECTION).get(),
      db.collection('settings').doc('bonus').get(),
    ]);

    const dateCandidates = [];
    for (const doc of deductionsSnap.docs) {
      const data = doc.data() || {};
      const eventDate = String(data.eventDate || data.absenceDate || '').slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) dateCandidates.push(eventDate);
    }
    for (const doc of runsSnap.docs) {
      const data = doc.data() || {};
      for (const key of ['calculationFrom', 'calculationTo', 'paymentDate']) {
        const value = String(data[key] || '').slice(0, 10);
        if (/^\d{4}-\d{2}-\d{2}$/.test(value)) dateCandidates.push(value);
      }
    }
    const active = settingsSnap.exists ? (settingsSnap.data()?.activePeriod || {}) : {};
    for (const key of ['calculationFrom', 'calculationTo', 'paymentDate']) {
      const value = String(active[key] || '').slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(value)) dateCandidates.push(value);
    }

    dateCandidates.sort();
    const fromDate = addDaysIso(dateCandidates[0] || '2024-01-01', -3) || '2024-01-01';
    const toDate = addDaysIso(dateCandidates[dateCandidates.length - 1] || new Date().toISOString().slice(0, 10), 3)
      || new Date().toISOString().slice(0, 10);

    console.log(`Fetching SharePoint bonus items ${fromDate} → ${toDate}…`);
    const logResult = await listDisciplinaryProcessLogBonusItems(config, {
      fromDate,
      toDate,
      maxPages: 80,
    });
    const byItemId = new Map(
      (logResult.rows || []).map((row) => [String(row.sharePointItemId), row]),
    );
    console.log(`SharePoint rows: ${byItemId.size} (skipped zero-loyalty: ${logResult.skippedZeroLoyalty || 0})`);

    let checked = 0;
    let alreadyOk = 0;
    let missingOnSharePoint = 0;
    let amended = 0;
    const changes = [];

    for (const doc of deductionsSnap.docs) {
      const data = doc.data() || {};
      const sharePointItemId = String(data.sharePointItemId || '').trim();
      if (!sharePointItemId && !String(doc.id).startsWith('sp_')) {
        continue;
      }
      const itemId = sharePointItemId || String(doc.id).replace(/^sp_/, '');
      if (!itemId) continue;

      checked += 1;
      const spRow = byItemId.get(itemId);
      if (!spRow) {
        missingOnSharePoint += 1;
        continue;
      }

      const correctDate = String(spRow.eventDate || spRow.absenceDate || '').slice(0, 10);
      const currentDate = String(data.eventDate || data.absenceDate || '').slice(0, 10);
      if (!correctDate || currentDate === correctDate) {
        alreadyOk += 1;
        continue;
      }

      changes.push({
        id: doc.id,
        name: data.sharePointName || data.employeeUid || '',
        type: data.recordType || data.outcomePreset || '',
        from: currentDate,
        to: correctDate,
      });

      if (!dryRun) {
        await doc.ref.set({
          eventDate: correctDate,
          absenceDate: correctDate,
          dateRepairedAt: new Date().toISOString(),
          dateRepairedFrom: currentDate,
          updatedAt: new Date().toISOString(),
          updatedByUid: 'repairBonusSharePointDates',
        }, { merge: true });
      }
      amended += 1;
    }

    console.log('\nResults');
    console.log(`  checked:              ${checked}`);
    console.log(`  already correct:      ${alreadyOk}`);
    console.log(`  amended:              ${amended}${dryRun ? ' (dry-run)' : ''}`);
    console.log(`  not found on SP pass: ${missingOnSharePoint}`);

    if (changes.length) {
      console.log('\nAmendments:');
      for (const row of changes.slice(0, 200)) {
        console.log(
          `  ${row.id}  ${row.name || '—'}  ${row.type || '—'}  ${ukDate(row.from)} → ${ukDate(row.to)}`,
        );
      }
      if (changes.length > 200) {
        console.log(`  …and ${changes.length - 200} more`);
      }
    } else {
      console.log('\nNo date mismatches found in the fetched window.');
    }

    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
})();
