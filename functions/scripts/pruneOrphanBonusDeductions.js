'use strict';

/**
 * Remove bonus_absence_deductions whose SharePoint source items no longer exist
 * (or are no longer loyalty>0 absence/lateness in the payment period).
 *
 * Usage (from functions/):
 *   node scripts/pruneOrphanBonusDeductions.js
 *   node scripts/pruneOrphanBonusDeductions.js --dry-run
 */

const fs = require('fs');
const path = require('path');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
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
const {
  DEDUCTION_COLLECTION,
  pruneMissingSharePointDeductions,
} = require('../bonusAbsenceSync');
const { PAYMENT_RUNS_COLLECTION } = require('../bonusPaymentRuns');

const dryRun = process.argv.includes('--dry-run');

admin.initializeApp({ projectId: 'master-user-management' });
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
      console.error('SharePoint is not configured.');
      process.exit(1);
    }

    const [runsSnap, deductionsSnap] = await Promise.all([
      db.collection(PAYMENT_RUNS_COLLECTION).get(),
      db.collection(DEDUCTION_COLLECTION).get(),
    ]);

    const runs = runsSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }));
    if (!runs.length) {
      // Fall back to grouping deductions by paymentRunId / paymentDate.
      const byKey = new Map();
      for (const doc of deductionsSnap.docs) {
        const data = doc.data() || {};
        const key = data.paymentRunId
          ? `run:${data.paymentRunId}`
          : `date:${data.paymentDate || ''}`;
        if (!byKey.has(key)) {
          byKey.set(key, {
            id: data.paymentRunId || '',
            calculationFrom: data.calculationFrom || '',
            calculationTo: data.calculationTo || '',
            paymentDate: data.paymentDate || '',
            name: data.paymentRunName || '',
          });
        }
      }
      runs.push(...byKey.values());
    }

    let totalRemoved = 0;
    for (const run of runs) {
      const from = String(run.calculationFrom || '').slice(0, 10);
      const to = String(run.calculationTo || '').slice(0, 10);
      const paymentDate = String(run.paymentDate || '').slice(0, 10);
      if (!from || !to) {
        console.log(`Skip ${run.id || run.name || 'unnamed'}: missing calculation window`);
        continue;
      }

      // Small buffer so previously shifted dates still match the live SP set.
      const fromDate = addDaysIso(from, -2) || from;
      const toDate = addDaysIso(to, 2) || to;
      console.log(`\n${run.name || run.id || paymentDate}: ${fromDate} → ${toDate}`);

      const logResult = await listDisciplinaryProcessLogBonusItems(config, {
        fromDate,
        toDate,
        maxPages: 80,
      });
      const liveIds = new Set(
        (logResult.rows || [])
          .map((row) => String(row.sharePointItemId || '').trim())
          .filter(Boolean),
      );
      console.log(`  live SharePoint items: ${liveIds.size}`);

      if (dryRun) {
        const existing = await db.collection(DEDUCTION_COLLECTION)
          .where(run.id ? 'paymentRunId' : 'paymentDate', '==', run.id || paymentDate)
          .get()
          .catch(async () => {
            // Fallback scan if composite/index issues
            const all = await db.collection(DEDUCTION_COLLECTION).get();
            return {
              docs: all.docs.filter((doc) => {
                const data = doc.data() || {};
                if (run.id) return data.paymentRunId === run.id;
                return data.paymentDate === paymentDate;
              }),
            };
          });

        const orphans = [];
        for (const doc of existing.docs) {
          const data = doc.data() || {};
          const spId = String(data.sharePointItemId || doc.id.replace(/^sp_/, '')).trim();
          if (!spId) continue;
          if (!liveIds.has(spId)) {
            orphans.push({
              id: doc.id,
              name: data.sharePointName || '',
              date: data.eventDate || data.absenceDate || '',
              type: data.recordType || data.outcomePreset || '',
              amount: data.amount,
            });
          }
        }
        console.log(`  would remove: ${orphans.length}`);
        for (const row of orphans) {
          console.log(
            `    ${row.id}  ${row.name || '—'}  ${row.type || '—'}  ${ukDate(row.date)}  £${row.amount || 0}`,
          );
        }
        totalRemoved += orphans.length;
        continue;
      }

      const pruneResult = await pruneMissingSharePointDeductions(db, {
        paymentRunId: run.id || '',
        paymentDate,
        liveSharePointItemIds: liveIds,
      });
      console.log(`  removed: ${pruneResult.removed}`);
      for (const row of pruneResult.removedItems || []) {
        console.log(
          `    ${row.id}  ${row.employeeNameSnapshot || '—'}  ${row.recordType || '—'}  ${ukDate(row.eventDate)}  £${row.amount || 0}`,
        );
      }
      totalRemoved += pruneResult.removed;
    }

    console.log(`\nTotal ${dryRun ? 'would remove' : 'removed'}: ${totalRemoved}`);
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
})();
