const admin = require('firebase-admin');

/**
 * Returns today's ISO date string (YYYY-MM-DD) in the Europe/London timezone.
 */
function getLondonIsoDate() {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(new Date());
}

/**
 * Normalizes a name for comparison.
 */
function normalizeName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * Checks whether a user has management status.
 * Evaluates:
 * 1. Explicit profile.isManager === true or profile.isManagement === true
 * 2. Has staff assigned to them in the database (via UID or managerName)
 * 3. Master admin role
 */
function isEmployeeAManager(userData, managerUidsSet = null, managerNamesSet = null) {
  if (!userData) return false;
  const profile = userData.employeeProfile || {};
  if (profile.isManager === true || profile.isManagement === true) {
    return true;
  }
  if (managerUidsSet && userData.uid && managerUidsSet.has(userData.uid)) {
    return true;
  }
  const name = normalizeName(userData.fullName);
  if (managerNamesSet && name && managerNamesSet.has(name)) {
    return true;
  }
  if (userData.portalsAccess?.master_admin === 'admin') {
    return true;
  }
  return false;
}

/**
 * Checks whether an employee is managed by a given manager UID / name.
 */
function isEmployeeManagedBy(employeeData, managerUid, managerFullName) {
  if (!employeeData) return false;
  const empProfile = employeeData.employeeProfile || {};
  const lineManagerId = String(
    empProfile.lineManagerId || empProfile.managerUid || employeeData.managerUid || ''
  ).trim();

  if (lineManagerId && managerUid) {
    return lineManagerId === managerUid;
  }

  // Legacy fallback: match by full name if manager ID is not yet populated
  const managerName = normalizeName(
    empProfile.lineManagerName ||
    empProfile.managerName ||
    empProfile.manager ||
    employeeData.managerName ||
    employeeData.manager
  );
  const targetName = normalizeName(managerFullName);
  return Boolean(managerName && targetName && managerName === targetName);
}

/**
 * Serializes an employee record for the managed staff list.
 */
function serializeManagedStaffMember(docId, data, extra = {}) {
  const profile = data.employeeProfile || {};
  return {
    uid: docId,
    fullName: data.fullName || '',
    email: data.email || '',
    contactEmail: data.contactEmail || data.email || '',
    phoneNumber: profile.phoneNumber || '',
    personalEmail: profile.personalEmail || '',
    department: profile.department || '',
    jobRole: profile.jobRole || '',
    startDate: profile.startDate || '',
    dateOfBirth: profile.dateOfBirth || '',
    lastAppraisalDate: profile.lastAppraisalDate || '',
    drivingStaff: profile.drivingStaff === true,
    computerUser: profile.computerUser === true,
    isManager: profile.isManager === true || profile.isManagement === true,
    isActive: data.isActive !== false,
    lineManagerId: profile.lineManagerId || profile.managerUid || '',
    lineManagerName: profile.lineManagerName || profile.managerName || profile.manager || '',
    ...extra,
  };
}

/**
 * Retrieves the full managed staff data payload for a manager or acting cover manager.
 */
async function getMyManagedStaffData(db, userProfile, requestedManagerUid) {
  const managerUid = requestedManagerUid || userProfile.uid;
  const today = getLondonIsoDate();

  // 1. Fetch covers involving this manager (incoming where user covers someone, outgoing where someone covers user)
  const [incomingSnap, outgoingSnap] = await Promise.all([
    db.collection('line_manager_covers')
      .where('coverManagerUid', '==', managerUid)
      .where('status', '==', 'active')
      .get(),
    db.collection('line_manager_covers')
      .where('managerUid', '==', managerUid)
      .get(),
  ]);

  // Active incoming covers: today is within [startDate, endDate]
  const activeIncomingCovers = incomingSnap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((cover) => {
      const start = String(cover.startDate || '').trim();
      const end = String(cover.endDate || '').trim();
      return start && end && today >= start && today <= end;
    });

  // Outgoing covers:
  const allOutgoingCovers = outgoingSnap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .sort((a, b) => String(b.startDate || '').localeCompare(String(a.startDate || '')));

  const activeOutgoingCover = allOutgoingCovers.find((cover) => {
    if (cover.status !== 'active') return false;
    const start = String(cover.startDate || '').trim();
    const end = String(cover.endDate || '').trim();
    return start && end && today >= start && today <= end;
  }) || null;

  const scheduledOutgoingCovers = allOutgoingCovers.filter((cover) => {
    if (cover.status !== 'active') return false;
    const start = String(cover.startDate || '').trim();
    return start && start > today;
  });

  // 2. Fetch all active users to resolve managed staff and available colleagues
  const usersSnap = await db.collection('users').get();
  const directStaff = [];
  const coveredStaff = [];
  const availableCoverColleagues = [];

  const directStaffUids = new Set();
  const managerUidsSet = new Set();
  const managerNamesSet = new Set();

  // First pass: collect all managers referenced by active employees
  usersSnap.docs.forEach((doc) => {
    const data = doc.data() || {};
    if (data.isActive === false) return;
    const empProfile = data.employeeProfile || {};
    const lmid = String(empProfile.lineManagerId || empProfile.managerUid || data.managerUid || '').trim();
    if (lmid) managerUidsSet.add(lmid);
    const lmName = normalizeName(
      empProfile.lineManagerName || empProfile.managerName || empProfile.manager || data.managerName || data.manager
    );
    if (lmName) managerNamesSet.add(lmName);
  });

  usersSnap.docs.forEach((doc) => {
    const data = doc.data() || {};
    const uid = doc.id;
    if (data.isActive === false) return;

    // Direct staff check
    if (isEmployeeManagedBy(data, managerUid, userProfile.fullName)) {
      directStaff.push(serializeManagedStaffMember(uid, data, { isCovered: false }));
      directStaffUids.add(uid);
    }

    // Available colleague for cover picker: must be a manager and not self
    if (uid !== managerUid && isEmployeeAManager({ uid, ...data }, managerUidsSet, managerNamesSet)) {
      availableCoverColleagues.push({
        uid,
        fullName: data.fullName || '',
        email: data.email || '',
        department: data.employeeProfile?.department || '',
        jobRole: data.employeeProfile?.jobRole || '',
      });
    }
  });

  // Covered staff: staff of any manager this user is currently covering for
  if (activeIncomingCovers.length > 0) {
    const coveredManagerMap = new Map();
    activeIncomingCovers.forEach((cov) => {
      coveredManagerMap.set(cov.managerUid, cov);
    });

    usersSnap.docs.forEach((doc) => {
      const data = doc.data() || {};
      const uid = doc.id;
      if (data.isActive === false) return;
      if (directStaffUids.has(uid)) return; // Don't duplicate if already direct

      const empProfile = data.employeeProfile || {};
      const lineManagerId = String(empProfile.lineManagerId || '').trim();

      for (const [covManagerUid, cov] of coveredManagerMap.entries()) {
        if (isEmployeeManagedBy(data, covManagerUid, cov.managerName)) {
          coveredStaff.push(
            serializeManagedStaffMember(uid, data, {
              isCovered: true,
              coveredFrom: {
                coverId: cov.id,
                managerUid: cov.managerUid,
                managerName: cov.managerName,
                startDate: cov.startDate,
                endDate: cov.endDate,
                reason: cov.reason || '',
              },
            }),
          );
          break;
        }
      }
    });
  }

  // Sort lists alphabetically by employee full name
  directStaff.sort((a, b) => a.fullName.localeCompare(b.fullName));
  coveredStaff.sort((a, b) => a.fullName.localeCompare(b.fullName));
  availableCoverColleagues.sort((a, b) => a.fullName.localeCompare(b.fullName));

  const allManagedStaff = [...directStaff, ...coveredStaff];
  const hasStaff = allManagedStaff.length > 0;

  return {
    hasStaff,
    totalCount: allManagedStaff.length,
    directCount: directStaff.length,
    coveredCount: coveredStaff.length,
    directStaff,
    coveredStaff,
    allManagedStaff,
    today,
    activeOutgoingCover,
    scheduledOutgoingCovers,
    activeIncomingCovers,
    outgoingCovers: allOutgoingCovers,
    availableCoverColleagues,
  };
}

/**
 * Configures a temporary cover arrangement for a manager.
 */
async function setManagerCoverRecord(db, {
  managerUid,
  managerName,
  coverManagerUid,
  coverManagerName,
  startDate,
  endDate,
  reason,
  notes,
  createdByUid,
  createdByName,
}) {
  if (!managerUid || !coverManagerUid) {
    throw new Error('Manager and cover manager are required.');
  }

  if (managerUid === coverManagerUid) {
    throw new Error('An employee cannot be selected as their own cover manager.');
  }

  const startIso = String(startDate || '').trim();
  const endIso = String(endDate || '').trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(startIso) || !/^\d{4}-\d{2}-\d{2}$/.test(endIso)) {
    throw new Error('Start date and end date must be valid dates in YYYY-MM-DD format.');
  }

  if (startIso > endIso) {
    throw new Error('Start date cannot be after end date.');
  }

  // Validate that the designated cover person has management status
  const coverUserSnap = await db.collection('users').doc(coverManagerUid).get();
  if (!coverUserSnap.exists || coverUserSnap.data()?.isActive === false) {
    throw new Error('The selected cover colleague does not exist or is inactive.');
  }
  const coverUserData = { uid: coverUserSnap.id, ...coverUserSnap.data() };
  if (!isEmployeeAManager(coverUserData)) {
    const staffQuery = await db.collection('users')
      .where('employeeProfile.lineManagerId', '==', coverManagerUid)
      .limit(1)
      .get();
    const staffQuery2 = staffQuery.empty
      ? await db.collection('users')
          .where('employeeProfile.managerName', '==', coverUserData.fullName || '')
          .limit(1)
          .get()
      : null;

    if (staffQuery.empty && (!staffQuery2 || staffQuery2.empty)) {
      throw new Error('Cover can only be assigned to an employee with management status.');
    }
  }

  // Deactivate any existing active cover for this manager that overlaps with this window
  const existingCoversSnap = await db.collection('line_manager_covers')
    .where('managerUid', '==', managerUid)
    .where('status', '==', 'active')
    .get();

  const batch = db.batch();

  existingCoversSnap.docs.forEach((doc) => {
    const data = doc.data() || {};
    const eStart = String(data.startDate || '');
    const eEnd = String(data.endDate || '');
    // Check overlap: start <= eEnd && end >= eStart
    if (startIso <= eEnd && endIso >= eStart) {
      batch.update(doc.ref, {
        status: 'replaced',
        replacedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  });

  const newDocRef = db.collection('line_manager_covers').doc();
  const coverData = {
    managerUid,
    managerName: String(managerName || '').trim(),
    coverManagerUid,
    coverManagerName: String(coverManagerName || '').trim(),
    startDate: startIso,
    endDate: endIso,
    reason: String(reason || 'Holiday cover').trim(),
    notes: String(notes || '').trim(),
    status: 'active',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    createdByUid: String(createdByUid || '').trim(),
    createdByName: String(createdByName || '').trim(),
  };

  batch.set(newDocRef, coverData);
  await batch.commit();

  return { id: newDocRef.id, ...coverData };
}

/**
 * Cancels or ends an existing cover record early.
 */
async function cancelManagerCoverRecord(db, { coverId, cancelledByUid }) {
  if (!coverId) {
    throw new Error('coverId is required.');
  }

  const docRef = db.collection('line_manager_covers').doc(coverId);
  const snap = await docRef.get();

  if (!snap.exists) {
    throw new Error('Cover arrangement not found.');
  }

  const data = snap.data() || {};
  if (data.status === 'cancelled') {
    return { success: true, message: 'Cover already cancelled.' };
  }

  await docRef.update({
    status: 'cancelled',
    cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
    cancelledByUid: String(cancelledByUid || '').trim(),
  });

  return { success: true, message: 'Cover arrangement ended successfully.' };
}

/**
 * Checks if a specific manager currently has active cover today.
 */
async function getActiveCoverForManager(db, managerUid) {
  if (!managerUid) return null;
  const today = getLondonIsoDate();

  const snap = await db.collection('line_manager_covers')
    .where('managerUid', '==', managerUid)
    .where('status', '==', 'active')
    .get();

  const match = snap.docs.find((doc) => {
    const data = doc.data() || {};
    const start = String(data.startDate || '');
    const end = String(data.endDate || '');
    return start && end && today >= start && today <= end;
  });

  if (!match) return null;
  const data = match.data() || {};
  return {
    coverId: match.id,
    coverManagerUid: data.coverManagerUid,
    coverManagerName: data.coverManagerName,
    startDate: data.startDate,
    endDate: data.endDate,
    reason: data.reason || '',
  };
}

module.exports = {
  getLondonIsoDate,
  getMyManagedStaffData,
  setManagerCoverRecord,
  cancelManagerCoverRecord,
  getActiveCoverForManager,
  isEmployeeManagedBy,
  isEmployeeAManager,
};
