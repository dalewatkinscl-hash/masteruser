/**
 * Named bonus payment runs (calc period + payment date).
 */

const PAYMENT_RUNS_COLLECTION = 'bonus_payment_runs';

function toIsoDateOnly(value) {
  if (!value) return '';
  if (typeof value === 'string') {
    const match = value.trim().match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : '';
  }
  if (typeof value.toDate === 'function') {
    return value.toDate().toISOString().slice(0, 10);
  }
  if (value._seconds) {
    return new Date(value._seconds * 1000).toISOString().slice(0, 10);
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function normalizePaymentOfYear(value) {
  const num = Number(value);
  return num === 2 ? 2 : 1;
}

function bonusYearFromPaymentDate(paymentDate) {
  const iso = toIsoDateOnly(paymentDate);
  if (!iso) return '';
  return iso.slice(0, 4);
}

function serializePaymentRun(doc) {
  const data = doc.data() || {};
  return {
    id: doc.id,
    name: String(data.name || '').trim(),
    calculationFrom: toIsoDateOnly(data.calculationFrom),
    calculationTo: toIsoDateOnly(data.calculationTo),
    paymentDate: toIsoDateOnly(data.paymentDate),
    paymentOfYear: normalizePaymentOfYear(data.paymentOfYear),
    lastSharePointSyncAt: data.lastSharePointSyncAt || null,
    lastSharePointSyncMode: data.lastSharePointSyncMode || '',
    pendingUnmatchedCount: Number(data.pendingUnmatchedCount) || 0,
    createdAt: data.createdAt || null,
    updatedAt: data.updatedAt || null,
    createdByUid: data.createdByUid || '',
    updatedByUid: data.updatedByUid || '',
  };
}

function isActivePaymentRun(run, todayIso = '') {
  const today = toIsoDateOnly(todayIso) || new Date().toISOString().slice(0, 10);
  const paymentDate = toIsoDateOnly(run?.paymentDate);
  const from = toIsoDateOnly(run?.calculationFrom);
  const to = toIsoDateOnly(run?.calculationTo);
  if (paymentDate && paymentDate >= today) return true;
  if (from && to && from <= today && to >= today) return true;
  return false;
}

async function listActiveBonusPaymentRuns(db, todayIso = '') {
  const runs = await listBonusPaymentRuns(db);
  return runs.filter((run) => isActivePaymentRun(run, todayIso));
}

function validatePaymentRunInput(input = {}) {
  const name = String(input.name || '').trim();
  const calculationFrom = toIsoDateOnly(input.calculationFrom);
  const calculationTo = toIsoDateOnly(input.calculationTo);
  const paymentDate = toIsoDateOnly(input.paymentDate);
  const paymentOfYear = normalizePaymentOfYear(input.paymentOfYear);
  if (!name) return { error: 'Name is required (e.g. Xmas 2026).' };
  if (!calculationFrom || !calculationTo || !paymentDate) {
    return { error: 'calculationFrom, calculationTo, and paymentDate are required (YYYY-MM-DD).' };
  }
  if (calculationFrom > calculationTo) {
    return { error: 'calculationFrom must be on or before calculationTo.' };
  }
  if (input.paymentOfYear != null && input.paymentOfYear !== '' && ![1, 2, '1', '2'].includes(input.paymentOfYear)) {
    return { error: 'paymentOfYear must be 1 (first payment) or 2 (second payment).' };
  }
  return {
    value: {
      name,
      calculationFrom,
      calculationTo,
      paymentDate,
      paymentOfYear,
    },
  };
}

function findPairedFirstPaymentRun(paymentRuns, currentRun) {
  if (!currentRun || normalizePaymentOfYear(currentRun.paymentOfYear) !== 2) return null;
  const year = bonusYearFromPaymentDate(currentRun.paymentDate);
  if (!year) return null;
  return (paymentRuns || []).find((run) => (
    run.id !== currentRun.id
    && normalizePaymentOfYear(run.paymentOfYear) === 1
    && bonusYearFromPaymentDate(run.paymentDate) === year
  )) || null;
}

function dateInInclusiveRange(isoDate, fromIso, toIso) {
  const day = toIsoDateOnly(isoDate);
  if (!day) return false;
  if (fromIso && day < fromIso) return false;
  if (toIso && day > toIso) return false;
  return true;
}

async function listBonusPaymentRuns(db) {
  const snap = await db.collection(PAYMENT_RUNS_COLLECTION).get();
  const runs = snap.docs.map(serializePaymentRun);
  runs.sort((left, right) => {
    const byPay = String(right.paymentDate || '').localeCompare(String(left.paymentDate || ''));
    if (byPay) return byPay;
    return String(left.name || '').localeCompare(String(right.name || ''));
  });
  return runs;
}

async function getBonusPaymentRun(db, runId) {
  const id = String(runId || '').trim();
  if (!id) return null;
  const snap = await db.collection(PAYMENT_RUNS_COLLECTION).doc(id).get();
  if (!snap.exists) return null;
  return serializePaymentRun(snap);
}

async function upsertBonusPaymentRun(db, input, actorUid = '') {
  const checked = validatePaymentRunInput(input);
  if (checked.error) return checked;
  const now = new Date().toISOString();
  const existingId = String(input.id || '').trim();
  const ref = existingId
    ? db.collection(PAYMENT_RUNS_COLLECTION).doc(existingId)
    : db.collection(PAYMENT_RUNS_COLLECTION).doc();

  const payload = {
    ...checked.value,
    updatedAt: now,
    updatedByUid: actorUid || '',
  };

  if (existingId) {
    const existing = await ref.get();
    if (!existing.exists) {
      return { error: 'Payment run not found.' };
    }
    await ref.set(payload, { merge: true });
  } else {
    await ref.set({
      ...payload,
      createdAt: now,
      createdByUid: actorUid || '',
    });
  }

  const saved = await ref.get();
  return { value: serializePaymentRun(saved) };
}

async function deleteBonusPaymentRun(db, runId) {
  const id = String(runId || '').trim();
  if (!id) return { error: 'id is required.' };
  await db.collection(PAYMENT_RUNS_COLLECTION).doc(id).delete();
  return { ok: true, id };
}

module.exports = {
  PAYMENT_RUNS_COLLECTION,
  toIsoDateOnly,
  serializePaymentRun,
  validatePaymentRunInput,
  dateInInclusiveRange,
  listBonusPaymentRuns,
  listActiveBonusPaymentRuns,
  getBonusPaymentRun,
  upsertBonusPaymentRun,
  deleteBonusPaymentRun,
  isActivePaymentRun,
  normalizePaymentOfYear,
  bonusYearFromPaymentDate,
  findPairedFirstPaymentRun,
};
