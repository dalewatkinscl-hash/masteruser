/**
 * Annual appraisals for the HR portal.
 * A review is due 3 months after the latest appraisal, or 3 months after
 * the start date when nobody has recorded one yet.
 */

const COLLECTION = 'appraisals';
const OUT_OF_SCOPE_DEPARTMENTS = new Set([
  'director',
  'directors',
  'casual driver',
  'casual drivers',
]);
const OUT_OF_SCOPE_NAMES = new Set([
  'driver',
  'test driver',
  'test office',
]);
const OUT_OF_SCOPE_EMAILS = new Set([
  'driver@countrylion.co.uk',
  'testdriver@countrylion.co.uk',
  'testoffice@countrylion.co.uk',
]);
const APPRAISAL_CYCLE_MONTHS = 3;
const DUE_SOON_DAYS = 30;
const RATINGS = [
  { id: 'outstanding', label: 'Outstanding' },
  { id: 'good', label: 'Good' },
  { id: 'satisfactory', label: 'Satisfactory' },
  { id: 'needs_improvement', label: 'Needs improvement' },
  { id: 'unsatisfactory', label: 'Unsatisfactory' },
];
const RATING_IDS = new Set(RATINGS.map((rating) => rating.id));
const STATUS_RANK = { overdue: 0, due_soon: 1, missing: 2, current: 3 };

function toTrimmedString(value) {
  return String(value || '').trim();
}

function isAppraisalOutOfScope(department) {
  return OUT_OF_SCOPE_DEPARTMENTS.has(toTrimmedString(department).toLowerCase());
}

function isAppraisalOutOfScopeEmployee({ department = '', fullName = '', email = '' } = {}) {
  if (isAppraisalOutOfScope(department)) return true;
  const name = toTrimmedString(fullName).toLowerCase();
  const mail = toTrimmedString(email).toLowerCase();
  return OUT_OF_SCOPE_NAMES.has(name) || OUT_OF_SCOPE_EMAILS.has(mail);
}

function isSeniorManagerRole(jobRole) {
  return toTrimmedString(jobRole).toLowerCase() === 'senior manager';
}

function isDirectorProfile(profile) {
  const employeeProfile = profile?.employeeProfile || {};
  const department = toTrimmedString(employeeProfile.department).toLowerCase();
  const jobRole = toTrimmedString(employeeProfile.jobRole).toLowerCase();
  return department === 'director' || department === 'directors' || jobRole === 'director';
}

function toIsoDate(value) {
  const match = toTrimmedString(value).match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
}

function clip(value, max) {
  return toTrimmedString(value).slice(0, max);
}

function londonTodayIso(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const read = (type) => parts.find((part) => part.type === type)?.value || '';
  const year = read('year');
  const month = read('month');
  const day = read('day');
  if (!year || !month || !day) return '';
  return `${year}-${month}-${day}`;
}

function addMonthsIso(isoDate, months) {
  const match = toIsoDate(isoDate).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '';
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const targetMonthIndex = monthIndex + Number(months || 0);
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const normalizedMonth = ((targetMonthIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate();
  const clampedDay = Math.min(day, lastDay);
  const month = String(normalizedMonth + 1).padStart(2, '0');
  const date = String(clampedDay).padStart(2, '0');
  return `${targetYear}-${month}-${date}`;
}

function daysBetween(fromIso, toIso) {
  const from = Date.parse(`${toIsoDate(fromIso)}T00:00:00Z`);
  const to = Date.parse(`${toIsoDate(toIso)}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  return Math.round((to - from) / 86400000);
}

function statusForDue(nextDueDate, today) {
  if (!nextDueDate) return 'missing';
  const days = daysBetween(today, nextDueDate);
  if (days === null) return 'missing';
  if (days < 0) return 'overdue';
  if (days <= DUE_SOON_DAYS) return 'due_soon';
  return 'current';
}

function latestIso(dates) {
  return dates.map(toIsoDate).filter(Boolean).sort().at(-1) || '';
}

/**
 * Work out the next appraisal date from recorded reviews, the profile date, and start date.
 * A stored next-due date is used only when that review is the latest known appraisal.
 */
function buildAppraisalSchedule({
  lastAppraisalDate = '',
  startDate = '',
  latestRecord = null,
  today = londonTodayIso(),
} = {}) {
  const recordDate = toIsoDate(latestRecord?.appraisalDate);
  const profileDate = toIsoDate(lastAppraisalDate);
  const start = toIsoDate(startDate);
  const effectiveLast = latestIso([recordDate, profileDate]);
  const recordIsLatest = Boolean(recordDate) && recordDate >= profileDate;

  let nextDueDate = '';
  let dueSource = '';
  if (recordIsLatest) {
    nextDueDate = toIsoDate(latestRecord?.nextDueDate) || addMonthsIso(recordDate, APPRAISAL_CYCLE_MONTHS);
    dueSource = toIsoDate(latestRecord?.nextDueDate) ? 'record' : 'cycle';
  } else if (effectiveLast) {
    nextDueDate = addMonthsIso(effectiveLast, APPRAISAL_CYCLE_MONTHS);
    dueSource = 'cycle';
  } else if (start) {
    nextDueDate = addMonthsIso(start, APPRAISAL_CYCLE_MONTHS);
    dueSource = 'start';
  }

  return {
    lastAppraisalDate: effectiveLast,
    nextDueDate,
    dueSource,
    status: statusForDue(nextDueDate, today),
    daysUntilDue: nextDueDate ? daysBetween(today, nextDueDate) : null,
    awaitingFirst: !effectiveLast && Boolean(nextDueDate),
  };
}

function serializeTimestamp(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (value._seconds) return new Date(value._seconds * 1000).toISOString();
  if (typeof value === 'string') return value;
  return null;
}

function serializeAppraisal(doc) {
  const data = typeof doc.data === 'function' ? doc.data() : doc;
  const id = doc.id || data.id;
  return {
    id,
    employeeUid: toTrimmedString(data.employeeUid),
    appraisalDate: toIsoDate(data.appraisalDate),
    reviewerName: toTrimmedString(data.reviewerName),
    reviewerUid: toTrimmedString(data.reviewerUid),
    rating: RATING_IDS.has(data.rating) ? data.rating : '',
    summary: toTrimmedString(data.summary),
    objectives: toTrimmedString(data.objectives),
    nextDueDate: toIsoDate(data.nextDueDate),
    createdAt: serializeTimestamp(data.createdAt),
    createdByUid: toTrimmedString(data.createdByUid),
    createdByName: toTrimmedString(data.createdByName),
    updatedAt: serializeTimestamp(data.updatedAt),
    updatedByUid: toTrimmedString(data.updatedByUid),
    updatedByName: toTrimmedString(data.updatedByName),
  };
}

function actorName(profile) {
  return toTrimmedString(profile?.fullName) || toTrimmedString(profile?.email) || 'Unknown';
}

function compareEmployees(left, right) {
  const byStatus = (STATUS_RANK[left.status] ?? 9) - (STATUS_RANK[right.status] ?? 9);
  if (byStatus) return byStatus;
  const leftDays = left.daysUntilDue === null || left.daysUntilDue === undefined ? 99999 : left.daysUntilDue;
  const rightDays = right.daysUntilDue === null || right.daysUntilDue === undefined ? 99999 : right.daysUntilDue;
  if (leftDays !== rightDays) return leftDays - rightDays;
  return (left.fullName || left.email || '').localeCompare(right.fullName || right.email || '', undefined, { sensitivity: 'base' });
}

function createAppraisalsApi({
  admin,
  db,
  onRequest,
  withCors,
  getVerifiedSessionUser,
  getEffectivePortalRole,
  canViewAllEmployeeProfiles,
  mergeEmployeeProfiles,
}) {
  function isAppraisalAdmin(profile) {
    if (profile?.portalsAccess?.master_admin === 'admin') return true;
    return getEffectivePortalRole(profile, 'hr_app') === 'admin';
  }

  function canSeeMainAppraisalList(profile) {
    return canViewAllEmployeeProfiles(profile, getEffectivePortalRole);
  }

  function canViewSeniorManagerAppraisal(viewer, employee) {
    if (!viewer || !employee || !isSeniorManagerRole(employee.jobRole)) return false;
    if (viewer.uid && viewer.uid === employee.uid) return true;
    if (isAppraisalAdmin(viewer)) return true;
    return isDirectorProfile(viewer);
  }

  function canAccessAppraisalArea(profile) {
    if (canSeeMainAppraisalList(profile)) return true;
    if (isDirectorProfile(profile)) return true;
    return isSeniorManagerRole(profile?.employeeProfile?.jobRole);
  }

  function assertCanReviewEmployee(session, employee, res) {
    if (isSeniorManagerRole(employee?.jobRole)) {
      if (!canViewSeniorManagerAppraisal(session.profile, employee)) {
        res.status(403).json({ error: 'Senior manager appraisals are restricted.' });
        return false;
      }
      return true;
    }
    if (!canSeeMainAppraisalList(session.profile)) {
      res.status(403).json({ error: 'HR access is required to manage appraisals.' });
      return false;
    }
    return true;
  }

  function assertAccess(session, res) {
    if (!session) {
      res.status(401).json({ error: 'Authentication required.' });
      return false;
    }
    if (!canAccessAppraisalArea(session.profile)) {
      res.status(403).json({ error: 'You do not have access to appraisals.' });
      return false;
    }
    return true;
  }

  function employeeRow(userDoc, latestRecord, today) {
    const data = userDoc.data() || {};
    const profile = data.employeeProfile || {};
    const schedule = buildAppraisalSchedule({
      lastAppraisalDate: profile.lastAppraisalDate,
      startDate: profile.startDate,
      latestRecord,
      today,
    });
    const recordIsLatest = Boolean(latestRecord)
      && toIsoDate(latestRecord.appraisalDate) === schedule.lastAppraisalDate;
    return {
      uid: userDoc.id,
      fullName: toTrimmedString(data.fullName),
      email: toTrimmedString(data.email),
      isActive: data.isActive !== false,
      department: toTrimmedString(profile.department),
      jobRole: toTrimmedString(profile.jobRole),
      managerName: toTrimmedString(profile.managerName),
      startDate: toIsoDate(profile.startDate),
      appraisalCount: 0,
      latestAppraisalId: recordIsLatest ? latestRecord.id : '',
      latestRating: recordIsLatest ? latestRecord.rating : '',
      latestReviewerName: recordIsLatest ? latestRecord.reviewerName : '',
      ...schedule,
    };
  }

  async function loadLatestByEmployee() {
    const snap = await db.collection(COLLECTION).get();
    const grouped = new Map();
    snap.docs.forEach((doc) => {
      const appraisal = serializeAppraisal(doc);
      if (!appraisal.employeeUid || !appraisal.appraisalDate) return;
      const current = grouped.get(appraisal.employeeUid);
      const laterDate = appraisal.appraisalDate > (current?.appraisalDate || '');
      const sameDateNewerWrite = appraisal.appraisalDate === current?.appraisalDate
        && String(appraisal.createdAt || '') > String(current?.createdAt || '');
      if (!current || laterDate || sameDateNewerWrite) {
        grouped.set(appraisal.employeeUid, appraisal);
      }
    });
    const counts = new Map();
    snap.docs.forEach((doc) => {
      const uid = toTrimmedString(doc.data()?.employeeUid);
      if (!uid) return;
      counts.set(uid, (counts.get(uid) || 0) + 1);
    });
    return { grouped, counts };
  }

  async function syncProfileAppraisalDate(employeeUid, { clearDate = '' } = {}) {
    const userRef = db.collection('users').doc(employeeUid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) return '';

    const existing = userSnap.data() || {};
    const profileDate = toIsoDate(existing.employeeProfile?.lastAppraisalDate);
    const snap = await db.collection(COLLECTION).where('employeeUid', '==', employeeUid).get();
    const latestRecord = snap.docs
      .map((doc) => toIsoDate(doc.data()?.appraisalDate))
      .filter(Boolean)
      .sort()
      .at(-1) || '';
    const keptProfileDate = profileDate && profileDate !== toIsoDate(clearDate) ? profileDate : '';
    const nextDate = latestIso([latestRecord, keptProfileDate]);

    if (nextDate !== profileDate) {
      const employeeProfile = mergeEmployeeProfiles(existing.employeeProfile, {
        lastAppraisalDate: nextDate,
      });
      await userRef.set({
        employeeProfile,
        employeeProfileUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    return nextDate;
  }

  const getAppraisals = onRequest(
    { region: 'europe-west2' },
    withCors(async (req, res) => {
      if (req.method !== 'GET') {
        res.status(405).json({ error: 'Method not allowed.' });
        return;
      }

      const session = await getVerifiedSessionUser(req);
      if (!assertAccess(session, res)) return;

      try {
        const today = londonTodayIso();
        const [usersSnap, latest] = await Promise.all([
          db.collection('users').get(),
          loadLatestByEmployee(),
        ]);
        const rows = usersSnap.docs.map((doc) => {
          const row = employeeRow(doc, latest.grouped.get(doc.id) || null, today);
          row.appraisalCount = latest.counts.get(doc.id) || 0;
          return row;
        }).filter((row) => !isAppraisalOutOfScopeEmployee(row));
        const employees = [];
        const seniorManagers = [];
        rows.forEach((row) => {
          if (!isSeniorManagerRole(row.jobRole)) {
            if (canSeeMainAppraisalList(session.profile)) employees.push(row);
            return;
          }
          if (canViewSeniorManagerAppraisal(session.profile, row)) seniorManagers.push(row);
        });
        employees.sort(compareEmployees);
        seniorManagers.sort(compareEmployees);
        res.status(200).json({
          employees,
          seniorManagers,
          today,
          cycleMonths: APPRAISAL_CYCLE_MONTHS,
          dueSoonDays: DUE_SOON_DAYS,
        });
      } catch (error) {
        console.error('getAppraisals failed', error);
        res.status(500).json({ error: 'Failed to load appraisals.' });
      }
    }),
  );

  const getEmployeeAppraisals = onRequest(
    { region: 'europe-west2' },
    withCors(async (req, res) => {
      if (req.method !== 'GET') {
        res.status(405).json({ error: 'Method not allowed.' });
        return;
      }

      const session = await getVerifiedSessionUser(req);
      if (!assertAccess(session, res)) return;

      const employeeUid = toTrimmedString(req.query?.employeeUid || req.path.split('/').pop());
      if (!employeeUid || employeeUid === 'getEmployeeAppraisals') {
        res.status(400).json({ error: 'Employee is required.' });
        return;
      }

      try {
        const userSnap = await db.collection('users').doc(employeeUid).get();
        if (!userSnap.exists) {
          res.status(404).json({ error: 'Employee not found.' });
          return;
        }
        const snap = await db.collection(COLLECTION).where('employeeUid', '==', employeeUid).get();
        const appraisals = snap.docs
          .map(serializeAppraisal)
          .sort((left, right) => {
            const byDate = right.appraisalDate.localeCompare(left.appraisalDate);
            if (byDate) return byDate;
            return String(right.createdAt || '').localeCompare(String(left.createdAt || ''));
          });
        const today = londonTodayIso();
        const row = employeeRow(userSnap, appraisals[0] || null, today);
        if (isAppraisalOutOfScopeEmployee(row)) {
          res.status(200).json({ employee: null, appraisals: [], outOfScope: true });
          return;
        }
        if (!assertCanReviewEmployee(session, row, res)) return;
        row.appraisalCount = appraisals.length;
        res.status(200).json({ employee: row, appraisals });
      } catch (error) {
        console.error('getEmployeeAppraisals failed', error);
        res.status(500).json({ error: 'Failed to load appraisal history.' });
      }
    }),
  );

  const saveAppraisal = onRequest(
    { region: 'europe-west2' },
    withCors(async (req, res) => {
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed.' });
        return;
      }

      const session = await getVerifiedSessionUser(req);
      if (!assertAccess(session, res)) return;

      const body = req.body || {};
      const employeeUid = toTrimmedString(body.employeeUid);
      const appraisalDate = toIsoDate(body.appraisalDate);
      const reviewerName = clip(body.reviewerName, 160);
      const rating = toTrimmedString(body.rating);
      const summary = clip(body.summary, 4000);
      const objectives = clip(body.objectives, 4000);
      const requestedDue = toIsoDate(body.nextDueDate);
      const appraisalId = toTrimmedString(body.id);

      if (!employeeUid) {
        res.status(400).json({ error: 'Employee is required.' });
        return;
      }
      if (!appraisalDate) {
        res.status(400).json({ error: 'Appraisal date is required.' });
        return;
      }
      if (!reviewerName) {
        res.status(400).json({ error: 'Reviewer name is required.' });
        return;
      }
      if (!RATING_IDS.has(rating)) {
        res.status(400).json({ error: 'Choose an appraisal rating.' });
        return;
      }

      const nextDueDate = requestedDue || addMonthsIso(appraisalDate, APPRAISAL_CYCLE_MONTHS);
      if (!nextDueDate || nextDueDate <= appraisalDate) {
        res.status(400).json({ error: 'Next due date must be after the appraisal date.' });
        return;
      }

      try {
        const userSnap = await db.collection('users').doc(employeeUid).get();
        if (!userSnap.exists) {
          res.status(404).json({ error: 'Employee not found.' });
          return;
        }
        const employeeData = userSnap.data() || {};
        const reviewTarget = {
          uid: employeeUid,
          department: employeeData.employeeProfile?.department,
          jobRole: employeeData.employeeProfile?.jobRole,
          fullName: employeeData.fullName,
          email: employeeData.email,
        };
        if (isAppraisalOutOfScopeEmployee(reviewTarget)) {
          res.status(400).json({ error: 'This employee is not included in appraisals.' });
          return;
        }
        if (!assertCanReviewEmployee(session, reviewTarget, res)) return;

        const ref = appraisalId
          ? db.collection(COLLECTION).doc(appraisalId)
          : db.collection(COLLECTION).doc();
        let existing = null;
        if (appraisalId) {
          const existingSnap = await ref.get();
          if (!existingSnap.exists) {
            res.status(404).json({ error: 'Appraisal not found.' });
            return;
          }
          existing = existingSnap.data() || {};
          if (toTrimmedString(existing.employeeUid) !== employeeUid) {
            res.status(400).json({ error: 'That appraisal belongs to a different employee.' });
            return;
          }
        }

        const name = actorName(session.profile);
        const payload = {
          employeeUid,
          employeeName: toTrimmedString(userSnap.data()?.fullName),
          appraisalDate,
          reviewerName,
          reviewerUid: toTrimmedString(session.profile?.uid),
          rating,
          summary,
          objectives,
          nextDueDate,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedByUid: toTrimmedString(session.profile?.uid),
          updatedByName: name,
          createdAt: existing?.createdAt || admin.firestore.FieldValue.serverTimestamp(),
          createdByUid: existing?.createdByUid || toTrimmedString(session.profile?.uid),
          createdByName: existing?.createdByName || name,
        };

        await ref.set(payload, { merge: true });
        await syncProfileAppraisalDate(employeeUid);
        const saved = serializeAppraisal(await ref.get());
        res.status(appraisalId ? 200 : 201).json({
          appraisal: saved,
          message: appraisalId ? 'Appraisal updated.' : 'Appraisal recorded.',
        });
      } catch (error) {
        console.error('saveAppraisal failed', error);
        res.status(500).json({ error: 'Failed to save appraisal.' });
      }
    }),
  );

  const deleteAppraisal = onRequest(
    { region: 'europe-west2' },
    withCors(async (req, res) => {
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed.' });
        return;
      }

      const session = await getVerifiedSessionUser(req);
      if (!assertAccess(session, res)) return;

      const appraisalId = toTrimmedString(req.body?.id);
      if (!appraisalId) {
        res.status(400).json({ error: 'Appraisal is required.' });
        return;
      }

      try {
        const ref = db.collection(COLLECTION).doc(appraisalId);
        const snap = await ref.get();
        if (!snap.exists) {
          res.status(404).json({ error: 'Appraisal not found.' });
          return;
        }
        const data = snap.data() || {};
        const employeeUid = toTrimmedString(data.employeeUid);
        if (employeeUid) {
          const userSnap = await db.collection('users').doc(employeeUid).get();
          const employeeData = userSnap.exists ? (userSnap.data() || {}) : {};
          const reviewTarget = {
            uid: employeeUid,
            department: employeeData.employeeProfile?.department,
            jobRole: employeeData.employeeProfile?.jobRole,
            fullName: employeeData.fullName,
            email: employeeData.email,
          };
          if (!assertCanReviewEmployee(session, reviewTarget, res)) return;
        }
        await ref.delete();
        if (employeeUid) {
          await syncProfileAppraisalDate(employeeUid, { clearDate: data.appraisalDate });
        }
        res.status(200).json({ message: 'Appraisal deleted.' });
      } catch (error) {
        console.error('deleteAppraisal failed', error);
        res.status(500).json({ error: 'Failed to delete appraisal.' });
      }
    }),
  );

  return {
    getAppraisals,
    getEmployeeAppraisals,
    saveAppraisal,
    deleteAppraisal,
  };
}

module.exports = {
  APPRAISAL_CYCLE_MONTHS,
  DUE_SOON_DAYS,
  RATINGS,
  addMonthsIso,
  buildAppraisalSchedule,
  createAppraisalsApi,
  londonTodayIso,
};
