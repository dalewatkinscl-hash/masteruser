/**
 * SharePoint Disciplinary Process Log → bonus deduction sync helpers.
 * Handles Record of Absence and Record of Lateness (skips £0 loyalty).
 */

const ABSENCE_OUTCOME_PRESET = 'absence';
const LATENESS_OUTCOME_PRESET = 'lateness';
const MAP_COLLECTION = 'bonus_sp_employee_map';
const DEDUCTION_COLLECTION = 'bonus_absence_deductions';

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function mapDocId({ sharePointLookupId = '', sharePointEmail = '' } = {}) {
  const lookup = String(sharePointLookupId || '').trim();
  if (lookup) return `lookup_${lookup}`;
  const email = normalizeEmail(sharePointEmail);
  if (email) return `email_${email.replace(/[^a-z0-9@._+-]/g, '_')}`;
  return '';
}

function deductionDocId(sharePointItemId) {
  return `sp_${String(sharePointItemId || '').trim()}`;
}

function isLatenessRecord(item = {}) {
  return item.recordType === 'lateness'
    || item.disciplinaryType === 'Record of Lateness'
    || item.outcomePreset === LATENESS_OUTCOME_PRESET;
}

function describeSharePointDeduction(item = {}) {
  if (isLatenessRecord(item)) {
    const disciplinaryReason = String(item.disciplinaryReason || '').trim();
    const latenessType = String(item.latenessType || '').trim();
    // Prefer the most specific / last field (lateness type), avoid duplicated labels.
    const label = latenessType || disciplinaryReason || 'Lateness';
    return {
      outcomePreset: LATENESS_OUTCOME_PRESET,
      warningLabel: label,
      reason: label,
      title: 'Record of Lateness',
      source: 'sharepoint_lateness',
    };
  }

  const absenceReason = String(item.absenceReason || item.reason || '').trim();
  return {
    outcomePreset: ABSENCE_OUTCOME_PRESET,
    warningLabel: 'Absence',
    reason: absenceReason || 'Record of Absence',
    title: 'Record of Absence',
    source: 'sharepoint_absence',
  };
}

function buildEmployeesByEmail(usersSnap) {
  const byEmail = new Map();
  const directory = [];
  for (const doc of usersSnap.docs) {
    const data = doc.data() || {};
    if (data.isActive === false) continue;
    const email = normalizeEmail(data.email);
    const fullName = data.fullName || data.email || 'Unknown';
    directory.push({
      uid: doc.id,
      fullName,
      email: data.email || '',
      department: data.employeeProfile?.department || data.department || '',
    });
    if (!email) continue;
    if (!byEmail.has(email)) {
      byEmail.set(email, {
        uid: doc.id,
        fullName,
        email,
      });
    }
  }
  directory.sort((a, b) => String(a.fullName).localeCompare(String(b.fullName)));
  return { byEmail, directory };
}

async function loadSharePointEmployeeMaps(db) {
  const snap = await db.collection(MAP_COLLECTION).get();
  const byLookupId = new Map();
  const byEmail = new Map();
  for (const doc of snap.docs) {
    const data = doc.data() || {};
    const employeeUid = String(data.employeeUid || '').trim();
    if (!employeeUid) continue;
    const lookupId = String(data.sharePointLookupId || '').trim();
    const email = normalizeEmail(data.sharePointEmail);
    const entry = {
      employeeUid,
      sharePointLookupId: lookupId,
      sharePointEmail: email,
      sharePointName: data.sharePointName || '',
    };
    if (lookupId) byLookupId.set(lookupId, entry);
    if (email) byEmail.set(email, entry);
  }
  return { byLookupId, byEmail };
}

function resolveMappedEmployee(item, { maps, employeesByEmail }) {
  const lookupId = String(item.sharePointLookupId || '').trim();
  if (lookupId && maps.byLookupId.has(lookupId)) {
    return { ...maps.byLookupId.get(lookupId), matchMethod: 'saved_lookup' };
  }
  const email = normalizeEmail(item.sharePointEmail);
  if (email && maps.byEmail.has(email)) {
    return { ...maps.byEmail.get(email), matchMethod: 'saved_email' };
  }
  if (email && employeesByEmail.has(email)) {
    const employee = employeesByEmail.get(email);
    return {
      employeeUid: employee.uid,
      sharePointLookupId: lookupId,
      sharePointEmail: email,
      sharePointName: item.sharePointName || employee.fullName || '',
      matchMethod: 'email',
    };
  }
  return null;
}

function buildAbsenceDeductionRecord({
  absence,
  employeeUid,
  period,
  actorUid = '',
  matchMethod = '',
}) {
  const described = describeSharePointDeduction(absence);
  const eventDate = absence.eventDate || absence.absenceDate || '';
  return {
    sharePointItemId: String(absence.sharePointItemId),
    employeeUid,
    recordType: described.outcomePreset,
    eventDate,
    absenceDate: eventDate,
    amount: Number(absence.amount) || 0,
    currency: 'GBP',
    absenceReason: absence.absenceReason || '',
    disciplinaryReason: absence.disciplinaryReason || '',
    latenessType: absence.latenessType || '',
    disciplinaryType: absence.disciplinaryType || described.title,
    outcomePreset: described.outcomePreset,
    warningLabel: described.warningLabel,
    reason: described.reason,
    title: described.title,
    sharePointLookupId: absence.sharePointLookupId || '',
    sharePointName: absence.sharePointName || '',
    sharePointEmail: absence.sharePointEmail || '',
    calculationFrom: period.calculationFrom || '',
    calculationTo: period.calculationTo || '',
    paymentDate: period.paymentDate || '',
    paymentRunId: period.paymentRunId || '',
    paymentRunName: period.paymentRunName || '',
    countsTowardPayment: true,
    matchMethod: matchMethod || '',
    source: described.source,
    updatedAt: new Date().toISOString(),
    updatedByUid: actorUid || '',
  };
}

async function upsertAbsenceDeduction(db, record) {
  const id = deductionDocId(record.sharePointItemId);
  const ref = db.collection(DEDUCTION_COLLECTION).doc(id);
  const existing = await ref.get();
  await ref.set({
    ...record,
    createdAt: existing.exists
      ? (existing.data()?.createdAt || new Date().toISOString())
      : new Date().toISOString(),
  }, { merge: true });
  return id;
}

async function loadAbsenceDeductionsForPaymentRun(db, { paymentRunId = '', paymentDate = '' } = {}) {
  const runId = String(paymentRunId || '').trim();
  const iso = String(paymentDate || '').slice(0, 10);
  let snap;
  if (runId) {
    snap = await db.collection(DEDUCTION_COLLECTION)
      .where('paymentRunId', '==', runId)
      .get();
  } else if (iso) {
    snap = await db.collection(DEDUCTION_COLLECTION)
      .where('paymentDate', '==', iso)
      .get();
  } else {
    return [];
  }
  return snap.docs.map((doc) => {
    const data = doc.data() || {};
    const described = describeSharePointDeduction({
      ...data,
      recordType: data.recordType || data.outcomePreset,
      disciplinaryReason: data.disciplinaryReason || '',
      latenessType: data.latenessType || '',
      absenceReason: data.absenceReason || '',
    });
    return {
      id: doc.id,
      caseId: doc.id,
      outcomePreset: described.outcomePreset,
      warningLabel: described.warningLabel,
      amount: Number(data.amount) || 0,
      currency: data.currency || 'GBP',
      reason: described.reason,
      title: described.title,
      warningTitle: '',
      givenAt: data.eventDate || data.absenceDate || '',
      warningExpiresAt: '',
      status: 'imported',
      stage: described.outcomePreset,
      warningClearedAt: null,
      superseded: false,
      cleared: false,
      countsTowardPayment: data.countsTowardPayment !== false,
      employeeUid: data.employeeUid || '',
      employeeNameSnapshot: data.sharePointName || '',
      sharePointItemId: data.sharePointItemId || '',
      paymentRunId: data.paymentRunId || '',
      disciplinaryReason: data.disciplinaryReason || '',
      latenessType: data.latenessType || '',
      source: described.source,
    };
  });
}

/** @deprecated use loadAbsenceDeductionsForPaymentRun */
async function loadAbsenceDeductionsForPaymentDate(db, paymentDate) {
  return loadAbsenceDeductionsForPaymentRun(db, { paymentDate });
}

function subtractDaysIso(isoDate, days) {
  const text = String(isoDate || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return '';
  const date = new Date(`${text}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - Number(days || 0));
  return date.toISOString().slice(0, 10);
}

/**
 * Sync SharePoint absence/lateness rows into bonus_absence_deductions for one payment run.
 * Use modifiedSince for incremental daily updates; omit for a full period pass.
 */
async function syncSharePointDeductionsForRun(db, sharePointConfig, {
  run,
  actorUid = 'system',
  modifiedSince = '',
  incremental = false,
} = {}) {
  const { listDisciplinaryProcessLogBonusItems } = require('./sharepoint');
  const { PAYMENT_RUNS_COLLECTION } = require('./bonusPaymentRuns');

  const calculationFrom = String(run?.calculationFrom || '').slice(0, 10);
  const calculationTo = String(run?.calculationTo || '').slice(0, 10);
  const paymentDate = String(run?.paymentDate || '').slice(0, 10);
  if (!calculationFrom || !calculationTo || !paymentDate) {
    return { error: 'Payment run needs calculationFrom, calculationTo, and paymentDate.' };
  }

  const period = {
    calculationFrom,
    calculationTo,
    paymentDate,
    paymentRunId: run.id || '',
    paymentRunName: run.name || '',
  };

  let effectiveModifiedSince = '';
  if (incremental) {
    const watermark = modifiedSince
      || run.lastSharePointSyncAt
      || '';
    // 2-day overlap so timezone / late edits are not missed.
    effectiveModifiedSince = watermark
      ? subtractDaysIso(String(watermark).slice(0, 10), 2)
      : '';
  }

  let logResult;
  try {
    logResult = await listDisciplinaryProcessLogBonusItems(sharePointConfig, {
      fromDate: calculationFrom,
      toDate: calculationTo,
      modifiedSince: effectiveModifiedSince,
    });
  } catch (error) {
    if (effectiveModifiedSince) {
      console.warn(
        'Incremental SharePoint filter failed; falling back to full period sync',
        error.message || error,
      );
      effectiveModifiedSince = '';
      logResult = await listDisciplinaryProcessLogBonusItems(sharePointConfig, {
        fromDate: calculationFrom,
        toDate: calculationTo,
      });
    } else {
      throw error;
    }
  }

  const [usersSnap, maps] = await Promise.all([
    db.collection('users').get(),
    loadSharePointEmployeeMaps(db),
  ]);

  const { byEmail: employeesByEmail, directory } = buildEmployeesByEmail(usersSnap);
  const unmatchedByKey = new Map();
  let applied = 0;
  let appliedAbsences = 0;
  let appliedLateness = 0;
  const matchedUidSet = new Set();

  for (const item of logResult.rows || []) {
    const matched = resolveMappedEmployee(item, { maps, employeesByEmail });
    if (!matched?.employeeUid) {
      const key = item.sharePointLookupId
        ? `lookup:${item.sharePointLookupId}`
        : `email:${normalizeEmail(item.sharePointEmail) || item.sharePointItemId}`;
      const existing = unmatchedByKey.get(key) || {
        sharePointLookupId: item.sharePointLookupId || '',
        sharePointName: item.sharePointName || '',
        sharePointEmail: item.sharePointEmail || '',
        absences: [],
        totalAmount: 0,
      };
      existing.absences.push({
        sharePointItemId: item.sharePointItemId,
        absenceDate: item.eventDate || item.absenceDate,
        amount: item.amount,
        absenceReason: item.absenceReason || '',
        disciplinaryReason: item.disciplinaryReason || '',
        latenessType: item.latenessType || '',
        recordType: item.recordType || 'absence',
        disciplinaryType: item.disciplinaryType || '',
      });
      existing.totalAmount += Number(item.amount) || 0;
      if (!existing.sharePointName && item.sharePointName) {
        existing.sharePointName = item.sharePointName;
      }
      if (!existing.sharePointEmail && item.sharePointEmail) {
        existing.sharePointEmail = item.sharePointEmail;
      }
      unmatchedByKey.set(key, existing);
      continue;
    }

    await upsertAbsenceDeduction(db, buildAbsenceDeductionRecord({
      absence: item,
      employeeUid: matched.employeeUid,
      period,
      actorUid,
      matchMethod: matched.matchMethod,
    }));
    applied += 1;
    if (item.recordType === 'lateness') appliedLateness += 1;
    else appliedAbsences += 1;
    matchedUidSet.add(matched.employeeUid);
  }

  const unmatched = [...unmatchedByKey.values()]
    .map((entry) => ({
      ...entry,
      absenceCount: entry.absences.length,
    }))
    .sort((left, right) => String(left.sharePointName || left.sharePointEmail)
      .localeCompare(String(right.sharePointName || right.sharePointEmail)));

  const syncedAt = new Date().toISOString();
  if (run.id) {
    await db.collection(PAYMENT_RUNS_COLLECTION).doc(run.id).set({
      lastSharePointSyncAt: syncedAt,
      lastSharePointSyncMode: effectiveModifiedSince ? 'incremental' : 'full',
      pendingUnmatchedCount: unmatched.length,
      updatedAt: syncedAt,
    }, { merge: true });
  }

  return {
    ok: true,
    activePeriod: period,
    scanned: logResult.count,
    skippedZeroLoyalty: logResult.skippedZeroLoyalty,
    applied,
    appliedAbsences,
    appliedLateness,
    matchedPeople: matchedUidSet.size,
    unmatchedCount: unmatched.length,
    unmatched,
    employees: directory,
    modifiedSince: effectiveModifiedSince || '',
    syncMode: effectiveModifiedSince ? 'incremental' : 'full',
    syncedAt,
  };
}

/**
 * Daily job: incremental sync for all active payment runs.
 */
async function runDailyBonusSharePointSync(db, sharePointConfig, {
  todayIso = '',
} = {}) {
  const { listActiveBonusPaymentRuns } = require('./bonusPaymentRuns');
  const today = String(todayIso || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const runs = await listActiveBonusPaymentRuns(db, today);
  const results = [];
  for (const run of runs) {
    const result = await syncSharePointDeductionsForRun(db, sharePointConfig, {
      run,
      actorUid: 'system_daily_sync',
      incremental: Boolean(run.lastSharePointSyncAt),
      modifiedSince: run.lastSharePointSyncAt || '',
    });
    results.push({
      paymentRunId: run.id,
      paymentRunName: run.name,
      ...result,
      unmatched: undefined,
      employees: undefined,
    });
  }
  return {
    ok: true,
    today,
    runCount: runs.length,
    results,
  };
}

module.exports = {
  ABSENCE_OUTCOME_PRESET,
  LATENESS_OUTCOME_PRESET,
  MAP_COLLECTION,
  DEDUCTION_COLLECTION,
  normalizeEmail,
  mapDocId,
  deductionDocId,
  describeSharePointDeduction,
  buildEmployeesByEmail,
  loadSharePointEmployeeMaps,
  resolveMappedEmployee,
  buildAbsenceDeductionRecord,
  upsertAbsenceDeduction,
  loadAbsenceDeductionsForPaymentDate,
  loadAbsenceDeductionsForPaymentRun,
  syncSharePointDeductionsForRun,
  runDailyBonusSharePointSync,
};
