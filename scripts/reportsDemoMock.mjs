/**
 * Shared mock payloads for local Reports demo (Vite middleware).
 * Does not talk to Firebase or Redshift.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function buildDemoUser({ allowReports = true } = {}) {
  return {
    uid: 'demo-finance-user',
    email: 'dale.demo@countrylion.co.uk',
    fullName: 'Dale Demo',
    isActive: true,
    portalsAccess: allowReports
      ? { master_admin: 'admin' }
      : { routes_app: 'driver' },
    featureAccess: allowReports
      ? { finance_reports: true, bonus_deductions: false }
      : { finance_reports: false, bonus_deductions: false },
  };
}

const { buildAppraisalSchedule, addMonthsIso, RATINGS } = require(path.join(root, 'functions/appraisals.js'));
const DEMO_RATING_IDS = new Set(RATINGS.map((rating) => rating.id));

const demoPeople = [
  {
    uid: 'demo-amira',
    fullName: 'Amira Khan',
    email: 'amira.khan@countrylion.co.uk',
    isActive: true,
    department: 'Operations',
    jobRole: 'Driver',
    managerName: 'Sam Reed',
    startDate: '2022-03-14',
    lastAppraisalDate: '2025-02-01',
    importedLastAppraisalDate: '2025-02-01',
  },
  {
    uid: 'demo-lewis',
    fullName: 'Lewis Hart',
    email: 'lewis.hart@countrylion.co.uk',
    isActive: true,
    department: 'Workshop',
    jobRole: 'Technician',
    managerName: 'Priya Shah',
    startDate: '2024-11-20',
    lastAppraisalDate: '',
    importedLastAppraisalDate: '',
  },
  {
    uid: 'demo-nina',
    fullName: 'Nina Cole',
    email: 'nina.cole@countrylion.co.uk',
    isActive: true,
    department: 'Office',
    jobRole: 'Coordinator',
    managerName: 'Sam Reed',
    startDate: '2019-06-01',
    lastAppraisalDate: '2026-09-01',
    importedLastAppraisalDate: '2026-09-01',
  },
  {
    uid: 'demo-owen',
    fullName: 'Owen Blake',
    email: 'owen.blake@countrylion.co.uk',
    isActive: false,
    department: 'Driving',
    jobRole: 'Driver',
    managerName: 'Sam Reed',
    startDate: '2018-01-10',
    lastAppraisalDate: '2023-01-10',
    importedLastAppraisalDate: '2023-01-10',
  },
];

const demoAppraisals = [];

function latestDemoDate(dates) {
  return dates.filter(Boolean).sort().at(-1) || '';
}

function syncDemoPerson(uid, clearDate = '') {
  const person = demoPeople.find((item) => item.uid === uid);
  if (!person) return;
  const recordDates = demoAppraisals
    .filter((item) => item.employeeUid === uid)
    .map((item) => item.appraisalDate);
  const kept = person.importedLastAppraisalDate && person.importedLastAppraisalDate !== clearDate
    ? person.importedLastAppraisalDate
    : '';
  person.lastAppraisalDate = latestDemoDate([...recordDates, kept]);
}

function demoEmployeeRows() {
  const rank = { overdue: 0, due_soon: 1, missing: 2, current: 3 };
  return demoPeople.map((person) => {
    const records = demoAppraisals
      .filter((item) => item.employeeUid === person.uid)
      .sort((left, right) => right.appraisalDate.localeCompare(left.appraisalDate));
    const latest = records[0] || null;
    const schedule = buildAppraisalSchedule({
      lastAppraisalDate: person.lastAppraisalDate,
      startDate: person.startDate,
      latestRecord: latest,
    });
    const recordIsLatest = Boolean(latest) && latest.appraisalDate === schedule.lastAppraisalDate;
    return {
      uid: person.uid,
      fullName: person.fullName,
      email: person.email,
      isActive: person.isActive,
      department: person.department,
      jobRole: person.jobRole,
      managerName: person.managerName,
      startDate: person.startDate,
      appraisalCount: records.length,
      latestAppraisalId: recordIsLatest ? latest.id : '',
      latestRating: recordIsLatest ? latest.rating : '',
      latestReviewerName: recordIsLatest ? latest.reviewerName : '',
      ...schedule,
    };
  }).sort((left, right) => (
    (rank[left.status] ?? 9) - (rank[right.status] ?? 9)
    || (left.daysUntilDue ?? 99999) - (right.daysUntilDue ?? 99999)
    || left.fullName.localeCompare(right.fullName)
  ));
}

export function getDemoAppraisals() {
  return { employees: demoEmployeeRows(), cycleMonths: 12, dueSoonDays: 30 };
}

export function getDemoEmployeeAppraisals(employeeUid) {
  const employee = demoEmployeeRows().find((item) => item.uid === employeeUid);
  if (!employee) return null;
  const appraisals = demoAppraisals
    .filter((item) => item.employeeUid === employeeUid)
    .sort((left, right) => right.appraisalDate.localeCompare(left.appraisalDate));
  return { employee, appraisals };
}

export function saveDemoAppraisal(body = {}) {
  const employeeUid = String(body.employeeUid || '').trim();
  const person = demoPeople.find((item) => item.uid === employeeUid);
  if (!person) return { status: 404, body: { error: 'Employee not found.' } };
  const appraisalDate = String(body.appraisalDate || '').slice(0, 10);
  const reviewerName = String(body.reviewerName || '').trim();
  const rating = String(body.rating || '').trim();
  const nextDueDate = String(body.nextDueDate || '').slice(0, 10) || addMonthsIso(appraisalDate, 12);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(appraisalDate)) {
    return { status: 400, body: { error: 'Appraisal date is required.' } };
  }
  if (!reviewerName) return { status: 400, body: { error: 'Reviewer name is required.' } };
  if (!DEMO_RATING_IDS.has(rating)) return { status: 400, body: { error: 'Choose an appraisal rating.' } };
  if (!nextDueDate || nextDueDate <= appraisalDate) {
    return { status: 400, body: { error: 'Next due date must be after the appraisal date.' } };
  }

  const appraisalId = String(body.id || '').trim();
  let appraisal = appraisalId ? demoAppraisals.find((item) => item.id === appraisalId) : null;
  if (appraisalId && !appraisal) return { status: 404, body: { error: 'Appraisal not found.' } };
  if (appraisal && appraisal.employeeUid !== employeeUid) {
    return { status: 400, body: { error: 'That appraisal belongs to a different employee.' } };
  }
  if (!appraisal) {
    appraisal = { id: `demo-appraisal-${Date.now()}`, employeeUid, createdAt: new Date().toISOString() };
    demoAppraisals.push(appraisal);
  }
  Object.assign(appraisal, {
    appraisalDate,
    reviewerName,
    rating,
    summary: String(body.summary || '').trim(),
    objectives: String(body.objectives || '').trim(),
    nextDueDate,
    updatedAt: new Date().toISOString(),
  });
  syncDemoPerson(employeeUid);
  return { status: appraisalId ? 200 : 201, body: { appraisal, message: 'Appraisal recorded.' } };
}

export function deleteDemoAppraisal(id) {
  const index = demoAppraisals.findIndex((item) => item.id === id);
  if (index === -1) return { status: 404, body: { error: 'Appraisal not found.' } };
  const [removed] = demoAppraisals.splice(index, 1);
  syncDemoPerson(removed.employeeUid, removed.appraisalDate);
  return { status: 200, body: { message: 'Appraisal deleted.' } };
}

export async function getDemoFinancePayload(query = {}) {
  const { getFinanceDashboard } = require(path.join(root, 'functions/financeReports/financeService.js'));
  const data = await getFinanceDashboard({
    period: query.period || '12m',
    depot: query.depot || 'All',
    segment: query.segment || 'All',
    fromDate: query.from,
    toDate: query.to,
  });
  return { ok: true, data };
}
