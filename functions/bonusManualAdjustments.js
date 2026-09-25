/**
 * Admin manual bonus additions / deductions for a payment run.
 */

const MANUAL_COLLECTION = 'bonus_manual_adjustments';
const MANUAL_ADDITION = 'manual_addition';
const MANUAL_DEDUCTION = 'manual_deduction';

function toIsoDateOnly(value) {
  if (!value) return '';
  if (typeof value === 'string') {
    const match = value.trim().match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
    return '';
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value?.toDate === 'function') {
    try {
      const date = value.toDate();
      if (date && !Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
    } catch (_) { /* ignore */ }
  }
  return '';
}

function roundGbp(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function normalizeKind(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'addition' || raw === 'add' || raw === 'credit' || raw === MANUAL_ADDITION) {
    return 'addition';
  }
  return 'deduction';
}

function serializeManualAdjustment(doc) {
  const data = doc.data() || {};
  const kind = normalizeKind(data.kind || data.outcomePreset);
  const amount = Math.max(0, roundGbp(data.amount));
  return {
    id: doc.id,
    caseId: doc.id,
    employeeUid: String(data.employeeUid || '').trim(),
    paymentRunId: String(data.paymentRunId || '').trim(),
    paymentDate: toIsoDateOnly(data.paymentDate),
    kind,
    amount,
    currency: data.currency || 'GBP',
    reason: String(data.reason || '').trim(),
    givenAt: toIsoDateOnly(data.givenAt) || toIsoDateOnly(data.createdAt) || '',
    countsTowardPayment: data.countsTowardPayment !== false,
    outcomePreset: kind === 'addition' ? MANUAL_ADDITION : MANUAL_DEDUCTION,
    warningLabel: kind === 'addition' ? 'Manual addition' : 'Manual deduction',
    title: kind === 'addition' ? 'Manual addition' : 'Manual deduction',
    source: 'manual',
    isManual: true,
    createdAt: data.createdAt || null,
    createdByUid: data.createdByUid || '',
    updatedAt: data.updatedAt || null,
    updatedByUid: data.updatedByUid || '',
    /** Signed amount for settlement: deductions positive, additions negative. */
    settlementAmount: kind === 'addition' ? -amount : amount,
  };
}

async function listManualAdjustmentsForPaymentRun(db, { paymentRunId = '', paymentDate = '' } = {}) {
  const runId = String(paymentRunId || '').trim();
  let snap;
  if (runId) {
    snap = await db.collection(MANUAL_COLLECTION).where('paymentRunId', '==', runId).get();
  } else {
    const payDate = toIsoDateOnly(paymentDate);
    if (!payDate) return [];
    snap = await db.collection(MANUAL_COLLECTION).where('paymentDate', '==', payDate).get();
  }
  return snap.docs.map(serializeManualAdjustment);
}

async function upsertManualAdjustment(db, input = {}, actorUid = '') {
  const employeeUid = String(input.employeeUid || '').trim();
  const paymentRunId = String(input.paymentRunId || '').trim();
  const kind = normalizeKind(input.kind);
  const amount = roundGbp(input.amount);
  const reason = String(input.reason || '').trim();
  const givenAt = toIsoDateOnly(input.givenAt) || new Date().toISOString().slice(0, 10);
  const paymentDate = toIsoDateOnly(input.paymentDate);
  const existingId = String(input.id || '').trim();

  if (!employeeUid) return { error: 'employeeUid is required.' };
  if (!paymentRunId) return { error: 'paymentRunId is required.' };
  if (!(amount > 0)) return { error: 'Amount must be greater than zero.' };
  if (!reason) return { error: 'Reason is required.' };

  const now = new Date().toISOString();
  const ref = existingId
    ? db.collection(MANUAL_COLLECTION).doc(existingId)
    : db.collection(MANUAL_COLLECTION).doc();

  if (existingId) {
    const existing = await ref.get();
    if (!existing.exists) return { error: 'Adjustment not found.' };
  }

  const payload = {
    employeeUid,
    paymentRunId,
    paymentDate: paymentDate || '',
    kind,
    amount,
    currency: 'GBP',
    reason,
    givenAt,
    countsTowardPayment: true,
    outcomePreset: kind === 'addition' ? MANUAL_ADDITION : MANUAL_DEDUCTION,
    source: 'manual',
    updatedAt: now,
    updatedByUid: actorUid || '',
  };

  if (existingId) {
    await ref.set(payload, { merge: true });
  } else {
    await ref.set({
      ...payload,
      createdAt: now,
      createdByUid: actorUid || '',
    });
  }

  const saved = await ref.get();
  return { value: serializeManualAdjustment(saved) };
}

async function deleteManualAdjustment(db, id) {
  const docId = String(id || '').trim();
  if (!docId) return { error: 'id is required.' };
  const ref = db.collection(MANUAL_COLLECTION).doc(docId);
  const existing = await ref.get();
  if (!existing.exists) return { error: 'Adjustment not found.' };
  await ref.delete();
  return { ok: true, id: docId };
}

module.exports = {
  MANUAL_COLLECTION,
  MANUAL_ADDITION,
  MANUAL_DEDUCTION,
  serializeManualAdjustment,
  listManualAdjustmentsForPaymentRun,
  upsertManualAdjustment,
  deleteManualAdjustment,
  normalizeKind,
  toIsoDateOnly,
};
