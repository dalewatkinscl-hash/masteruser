/**
 * HTTP handlers for People Cases (wired from functions/index.js).
 */

const {
  DOCUMENT_TYPES,
  OUTCOME_PRESETS,
  PROCESS_FAMILIES,
  RESTRICTION_OPTIONS,
  restrictionLabel,
  toTrimmedString,
  getCasesRole,
  canManageCases,
  canHrOverseeCases,
  stagesForFamily,
  normalizeStage,
  mapStageForFamilyChange,
  guideFor,
  sanitizeCaseCreateInput,
  outcomePresetById,
  buildOutcomePackSteps,
  addWorkingDays,
  countWorkingDaysNotice,
  countWorkingHoursNotice,
  parseHearingDateTime,
  MINIMUM_HEARING_NOTICE_WORKING_HOURS,
  buildHearingInviteHtml,
  buildOutcomeLetterHtml,
  buildWarningDocumentHtml,
  serializeCase,
  serializeTimestamp,
} = require('./peopleCases');
const { calendarEventFromOptions } = require('./calendarIcs');
const {
  buildCaseSharePointFolderName,
  templatesForStage,
  buildTemplateFillContext,
  applyPlaceholdersToText,
  looksLikeHtmlDocument,
  buildTemplateDocHtml,
  buildTemplateDocxBuffer,
  DOCX_MIME_TYPE,
  templateSeedFileName,
  templateFileName,
  missingRequiredTemplates,
  formatMissingDocumentsError,
  portalInterviewCoversTemplate,
  CASE_DOCUMENT_TEMPLATES,
} = require('./caseDocumentTemplates');
const { buildFileNoteForImprovementHtml, formatUkDateTime } = require('./fileNoteForImprovement');
const {
  resolveEmployeeSharePointPaths,
  listTemplateLibraryFiles,
  findTemplateFile,
  resolveAndDownloadCaseTemplate,
  TEMPLATES_FOLDER_NAME,
  downloadDriveItemContent,
  deleteCaseSharePointFolder,
} = require('./sharepoint');

function createPeopleCasesApi({
  admin,
  db,
  onRequest,
  withCors,
  getVerifiedSessionUser,
  getUserProfile,
  getEffectivePortalRole,
  uploadDisciplinaryDocument,
  isSharePointConfigured,
  getSharePointConfig,
}) {
  async function appendEvent(caseId, eventType, payload, actor) {
    await db.collection('disciplinary_case_events').add({
      caseId,
      eventType,
      payload: payload || {},
      actorUid: actor?.uid || '',
      actorRole: canHrOverseeCases(actor, getEffectivePortalRole) ? 'hr' : 'manager',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  function assertManager(session, res) {
    if (!session) {
      res.status(401).json({ error: 'Authentication required.' });
      return false;
    }
    if (!canManageCases(session.profile, getEffectivePortalRole)) {
      res.status(403).json({ error: 'Cases manager access required.' });
      return false;
    }
    return true;
  }

  /** Retag an existing case as closed Samsara coaching (keeps issue/employee). */
  function buildSamsaraConversionFields(existing = {}) {
    const employeeName = toTrimmedString(existing.employeeNameSnapshot) || 'Employee';
    const issue = toTrimmedString(existing.issue) || 'Coaching';
    const fromOpened = serializeTimestamp(existing.openedAt) || existing.openedAt || '';
    const fromClosed = serializeTimestamp(existing.closedAt) || existing.closedAt || '';
    const rawEventDate = toTrimmedString(existing.eventDate).slice(0, 10)
      || String(fromOpened || fromClosed || new Date().toISOString()).slice(0, 10);
    const eventDate = /^\d{4}-\d{2}-\d{2}$/.test(rawEventDate)
      ? rawEventDate
      : new Date().toISOString().slice(0, 10);
    const dateLabel = eventDate.split('-').reverse().join('/');
    const closeNotes = toTrimmedString(existing.closeNotes)
      || toTrimmedString(existing.informalActionDetails)
      || 'Processed on the Samsara system. Converted from an informal disciplinary case.';

    return {
      processFamily: 'samsara_coaching',
      caseType: 'samsara_coaching',
      stage: 'closed',
      status: 'closed',
      outcomePreset: 'samsara_coaching',
      outcomePackSteps: [],
      processedOnSamsara: true,
      eventDate,
      title: `${employeeName} - ${issue} Samsara Coaching ${dateLabel}`,
      closeNotes,
      informalResolutionPath: '',
      warningEffectiveAt: '',
      warningExpiresAt: '',
      warningDurationMonths: null,
      warningClearedAt: null,
      slaDueAt: '',
      closedAt: existing.closedAt || admin.firestore.FieldValue.serverTimestamp(),
    };
  }

  function sanitizeRestrictionInput(body, processFamily) {
    if ((processFamily || 'disciplinary') !== 'disciplinary') {
      return { ok: true, patch: null };
    }
    const enabled = body.restrictionEnabled === true
      || Boolean(toTrimmedString(body.restrictionType));
    if (!enabled) {
      return {
        ok: true,
        patch: {
          restrictionType: '',
          restrictionDetail: '',
          restrictionExpiresAt: '',
          restrictionActive: false,
        },
      };
    }
    const restrictionType = toTrimmedString(body.restrictionType);
    const allowed = new Set(RESTRICTION_OPTIONS.map((item) => item.id));
    if (!allowed.has(restrictionType)) {
      return { ok: false, error: 'Choose a restriction type.' };
    }
    const restrictionDetail = toTrimmedString(body.restrictionDetail || body.restrictionOther);
    if (restrictionType === 'other' && !restrictionDetail) {
      return { ok: false, error: 'Specify the restriction when choosing Other.' };
    }
    const restrictionExpiresAt = toTrimmedString(body.restrictionExpiresAt).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(restrictionExpiresAt)) {
      return { ok: false, error: 'Choose when the restriction expires.' };
    }
    return {
      ok: true,
      patch: {
        restrictionType,
        restrictionDetail: restrictionType === 'other' ? restrictionDetail : '',
        restrictionExpiresAt,
        restrictionActive: true,
        restrictionSetAt: new Date().toISOString().slice(0, 10),
        restrictionClearedAt: null,
        restrictionClearedReason: '',
      },
    };
  }

  function isActiveRestriction(item, today) {
    if (!item || !item.restrictionActive) return false;
    if ((item.processFamily || 'disciplinary') !== 'disciplinary') return false;
    if (item.restrictionClearedAt) return false;
    const expires = String(item.restrictionExpiresAt || '').slice(0, 10);
    if (expires && expires < today) return false;
    if (!item.restrictionType) return false;
    return true;
  }

  function restrictionMeasureFromCase(item) {
    return {
      caseId: item.id,
      outcomePreset: 'restriction',
      measureType: `Restriction — ${restrictionLabel(item.restrictionType, item.restrictionDetail)}`,
      reason: restrictionLabel(item.restrictionType, item.restrictionDetail),
      givenAt: String(item.restrictionSetAt || item.closedAt || item.createdAt || '').slice(0, 10),
      expiresAt: String(item.restrictionExpiresAt || '').slice(0, 10),
      durationMonths: null,
      title: item.title || '',
      employeeNameSnapshot: item.employeeNameSnapshot || '',
      isRestriction: true,
    };
  }

  function minutesHavePendingAmendment(minutes = []) {
    return (Array.isArray(minutes) ? minutes : []).some((item) => (
      item
      && (item.status === 'amendment_requested' || item.status === 'disputed' || item.disputed === true)
    ));
  }

  async function assertNoPendingAmendments(caseId, res) {
    const related = await listRelated(caseId);
    if (!minutesHavePendingAmendment(related.minutes || [])) return related;
    res.status(400).json({
      error: 'An employee has requested an amendment to interview notes. Address the amendment before continuing.',
      code: 'amendment_pending',
    });
    return null;
  }

  async function loadCaseOrFail(caseId, res) {
    const caseSnap = await db.collection('disciplinary_cases').doc(caseId).get();
    if (!caseSnap.exists) {
      res.status(404).json({ error: 'Case not found.' });
      return null;
    }
    return caseSnap;
  }

  function serializeEmployeeOwnCase(doc) {
    const item = serializeCase(doc);
    return {
      id: item.id,
      title: item.title || '',
      processFamily: item.processFamily || 'disciplinary',
      stage: item.stage,
      status: item.status || '',
      outcomePreset: item.outcomePreset || '',
      nextReviewDueAt: item.nextReviewDueAt || '',
      appealWindowEndsAt: item.appealWindowEndsAt || '',
      warningEmployeeSignStatus: item.warningEmployeeSignStatus || '',
      fileNoteEmployeeSignStatus: item.fileNoteEmployeeSignStatus || '',
      hearingInviteIssuedAt: item.hearingInviteIssuedAt || '',
      hearingScheduledAt: item.hearingScheduledAt || '',
      hearingScheduledTime: item.hearingScheduledTime || '',
      hearingLocation: item.hearingLocation || '',
      hearingInviteDocumentId: item.hearingInviteDocumentId || '',
    };
  }

  function portalHtmlHasLetterhead(html) {
    const value = String(html || '');
    return value.includes('lh-header') && value.includes('data:image/png;base64,');
  }

  function isHearingEvidenceDocument(doc = {}) {
    const type = toTrimmedString(doc.documentType).toLowerCase();
    if (['invite', 'file_note_for_improvement', 'warning', 'outcome', 'suspension_letter', 'training_outline', 'pip_plan'].includes(type)) {
      return false;
    }
    return ['evidence', 'minutes', 'letter', 'other'].includes(type)
      || /witness|investigation|statement|note/i.test(String(doc.fileName || ''));
  }

  function evidenceNamesForInvite(documents = []) {
    return (documents || [])
      .filter((doc) => isHearingEvidenceDocument(doc))
      .map((doc) => toTrimmedString(doc.fileName) || toTrimmedString(doc.title))
      .filter(Boolean);
  }

  async function releaseHearingEvidenceDocuments({
    caseId,
    employeeUid,
    inviteDocumentId,
    documents = [],
    evidenceDocumentIds = [],
  }) {
    const now = admin.firestore.FieldValue.serverTimestamp();
    const preferredIds = new Set((evidenceDocumentIds || []).map(toTrimmedString).filter(Boolean));
    const toRelease = (documents || []).filter((doc) => {
      if (!doc?.id) return false;
      if (toTrimmedString(doc.employeeUid) && toTrimmedString(doc.employeeUid) !== toTrimmedString(employeeUid)) {
        return false;
      }
      if (preferredIds.size > 0 && preferredIds.has(doc.id)) return true;
      return isHearingEvidenceDocument(doc);
    });

    const releasedIds = [];
    for (const doc of toRelease) {
      // eslint-disable-next-line no-await-in-loop
      await db.collection('disciplinary_documents').doc(doc.id).update({
        issuedToEmployeeAt: doc.issuedToEmployeeAt || now,
        issuedWithHearingInviteId: inviteDocumentId || '',
        issuedReason: 'hearing_invite',
        updatedAt: now,
      }).catch((err) => {
        console.error('Failed to release hearing evidence document', doc.id, err);
      });
      releasedIds.push(doc.id);
    }
    return releasedIds;
  }

  function rebuildHearingInvitePortalHtml({
    caseData = {},
    inviteDoc = {},
    relatedDocuments = [],
    hearingManagerName = '',
  }) {
    const issuedAtLabel = (() => {
      const raw = inviteDoc.createdAt || inviteDoc.issuedToEmployeeAt || '';
      const iso = typeof raw === 'string' ? raw : (serializeTimestamp(raw) || '');
      const datePart = String(iso).slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
        const [year, month, day] = datePart.split('-');
        return `${day}/${month}/${year}`;
      }
      return new Date().toLocaleDateString('en-GB');
    })();
    return buildHearingInviteHtml({
      employeeName: caseData.employeeNameSnapshot || '',
      caseTitle: caseData.title || '',
      caseSummary: caseData.summary || '',
      hearingScheduledAt: inviteDoc.hearingScheduledAt || caseData.hearingScheduledAt || '',
      hearingScheduledTime: inviteDoc.hearingScheduledTime || caseData.hearingScheduledTime || '',
      hearingLocation: inviteDoc.hearingLocation || caseData.hearingLocation || 'Country Lion',
      hearingManagerName: hearingManagerName || caseData.managerNameSnapshot || '',
      issuedByName: hearingManagerName || caseData.managerNameSnapshot || 'Management',
      issuedAtLabel,
      extraNotes: caseData.hearingInviteNotes || '',
      evidenceDocumentNames: evidenceNamesForInvite(relatedDocuments),
      suspensionActive: Boolean(caseData.suspensionActive || caseData.precautionarySuspension),
      precautionarySuspension: Boolean(caseData.precautionarySuspension || caseData.suspensionActive),
      suspensionReason: caseData.suspensionReason || '',
    });
  }

  async function listRelated(caseId) {
    // Avoid composite-index requirement: filter by caseId, sort in memory.
    const [eventsSnap, documentsSnap, minutesSnap, reviewsSnap] = await Promise.all([
      db.collection('disciplinary_case_events').where('caseId', '==', caseId).get(),
      db.collection('disciplinary_documents').where('caseId', '==', caseId).get(),
      db.collection('case_minutes').where('caseId', '==', caseId).get(),
      db.collection('case_reviews').where('caseId', '==', caseId).get(),
    ]);

    const documents = documentsSnap.docs
      .map((doc) => ({
        id: doc.id,
        ...doc.data(),
        createdAt: serializeTimestamp(doc.data().createdAt),
        issuedToEmployeeAt: serializeTimestamp(doc.data().issuedToEmployeeAt),
      }))
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

    const minutes = minutesSnap.docs
      .map((doc) => ({
        id: doc.id,
        ...doc.data(),
        createdAt: serializeTimestamp(doc.data().createdAt),
        issuedAt: serializeTimestamp(doc.data().issuedAt),
      }))
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

    const reviews = reviewsSnap.docs
      .map((doc) => ({ id: doc.id, ...doc.data(), createdAt: serializeTimestamp(doc.data().createdAt) }))
      .sort((a, b) => String(a.dueAt || '').localeCompare(String(b.dueAt || '')));

    const events = eventsSnap.docs
      .map((doc) => ({
        id: doc.id,
        ...doc.data(),
        createdAt: serializeTimestamp(doc.data().createdAt),
      }))
      .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));

    return {
      events,
      documents,
      minutes,
      reviews,
      eventRefs: eventsSnap.docs.map((doc) => doc.ref),
      documentRefs: documentsSnap.docs.map((doc) => doc.ref),
      minuteRefs: minutesSnap.docs.map((doc) => doc.ref),
      reviewRefs: reviewsSnap.docs.map((doc) => doc.ref),
    };
  }

  function relatedForClient(related) {
    return {
      events: related.events || [],
      documents: related.documents || [],
      minutes: related.minutes || [],
      reviews: related.reviews || [],
    };
  }

  async function stampSharePointCaseFolderName(caseRef, caseData = {}) {
    if (toTrimmedString(caseData.sharePointCaseFolderName)) {
      return buildCaseSharePointFolderName(caseData, caseRef.id);
    }
    const name = buildCaseSharePointFolderName({
      ...caseData,
      openedAt: caseData.openedAt || caseData.createdAt || new Date(),
    }, caseRef.id);
    await caseRef.update({ sharePointCaseFolderName: name });
    return name;
  }

  async function clearCaseLinks(caseId, caseData = {}) {
    const updates = [];
    if (caseData.linkedDisciplinaryCaseId) {
      updates.push(
        db.collection('disciplinary_cases').doc(caseData.linkedDisciplinaryCaseId).update({
          linkedAccidentCaseId: admin.firestore.FieldValue.delete(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }),
      );
    }
    if (caseData.linkedAccidentCaseId) {
      updates.push(
        db.collection('disciplinary_cases').doc(caseData.linkedAccidentCaseId).update({
          linkedDisciplinaryCaseId: admin.firestore.FieldValue.delete(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }),
      );
    }
    const [fromAccidentSnap, fromDisciplinarySnap] = await Promise.all([
      db.collection('disciplinary_cases').where('linkedAccidentCaseId', '==', caseId).get(),
      db.collection('disciplinary_cases').where('linkedDisciplinaryCaseId', '==', caseId).get(),
    ]);
    for (const doc of fromAccidentSnap.docs) {
      updates.push(doc.ref.update({
        linkedAccidentCaseId: admin.firestore.FieldValue.delete(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }));
    }
    for (const doc of fromDisciplinarySnap.docs) {
      updates.push(doc.ref.update({
        linkedDisciplinaryCaseId: admin.firestore.FieldValue.delete(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }));
    }
    await Promise.allSettled(updates);
  }

  async function deleteCaseSharePointArtifacts(caseId, caseData = {}, related = {}) {
    const sharePointConfig = getSharePointConfig();
    if (!isSharePointConfigured(sharePointConfig)) {
      return { skipped: true, reason: 'SharePoint is not configured.' };
    }

    const employeeUid = toTrimmedString(caseData.employeeUid);
    const employee = employeeUid ? await getUserProfile(employeeUid) : null;
    if (!employee) {
      return { skipped: true, reason: 'Employee profile not found for SharePoint cleanup.' };
    }

    const caseFolderName = toTrimmedString(caseData.sharePointCaseFolderName)
      || buildCaseSharePointFolderName(caseData, caseId);
    const documentItemIds = (related.documents || [])
      .map((doc) => toTrimmedString(doc.sharePointItemId))
      .filter(Boolean);

    try {
      return await deleteCaseSharePointFolder(sharePointConfig, {
        employee,
        caseFolderName,
        documentItemIds,
      });
    } catch (error) {
      if (error.status === 404) {
        return { folderDeleted: false, skippedMissing: true, caseFolderName };
      }
      throw error;
    }
  }

  async function deleteCaseAndRelated(caseId, caseData = {}) {
    const related = await listRelated(caseId);
    const sharePointCleanup = await deleteCaseSharePointArtifacts(caseId, caseData, related);
    await clearCaseLinks(caseId, caseData);

    const bumpSnap = await db.collection('bump_cards').where('caseId', '==', caseId).get();
    const refs = [
      ...related.eventRefs,
      ...related.documentRefs,
      ...related.minuteRefs,
      ...related.reviewRefs,
      ...bumpSnap.docs.map((doc) => doc.ref),
      db.collection('disciplinary_cases').doc(caseId),
    ];
    for (let index = 0; index < refs.length; index += 400) {
      const batch = db.batch();
      refs.slice(index, index + 400).forEach((ref) => batch.delete(ref));
      await batch.commit();
    }

    return { sharePointCleanup };
  }

  const getPeopleCaseMeta = onRequest(
    { region: 'europe-west2' },
    withCors(async (req, res) => {
      if (req.method !== 'GET') {
        res.status(405).json({ error: 'Method not allowed.' });
        return;
      }
      const session = await getVerifiedSessionUser(req);
      if (!session) {
        res.status(401).json({ error: 'Authentication required.' });
        return;
      }
      res.status(200).json({
        outcomes: OUTCOME_PRESETS,
        canManage: canManageCases(session.profile, getEffectivePortalRole),
        casesRole: getCasesRole(session.profile, getEffectivePortalRole),
      });
    }),
  );

  const getPeopleCases = onRequest(
    { region: 'europe-west2' },
    withCors(async (req, res) => {
      if (req.method !== 'GET') {
        res.status(405).json({ error: 'Method not allowed.' });
        return;
      }
      const session = await getVerifiedSessionUser(req);
      if (!assertManager(session, res)) return;

      try {
        const employeeUid = toTrimmedString(req.query?.employeeUid);
        const processFamily = toTrimmedString(req.query?.processFamily);
        const mine = toTrimmedString(req.query?.mine) === '1';
        const attention = toTrimmedString(req.query?.attention) === '1';

        let snapshot;
        if (employeeUid) {
          snapshot = await db.collection('disciplinary_cases').where('employeeUid', '==', employeeUid).get();
        } else if (mine) {
          snapshot = await db.collection('disciplinary_cases')
            .where('ownerManagerUid', '==', session.profile.uid)
            .limit(300)
            .get();
        } else {
          snapshot = await db.collection('disciplinary_cases').orderBy('createdAt', 'desc').limit(300).get();
        }

        let cases = snapshot.docs.map((doc) => serializeCase(doc));
        if (processFamily) {
          cases = cases.filter((item) => (item.processFamily || 'disciplinary') === processFamily);
        }

        if (attention) {
          cases = cases.filter((item) => {
            if (item.status === 'pending_employee') return true;
            if (item.suspensionActive) return true;
            if (item.stage !== 'closed' && item.slaDueAt && item.slaDueAt < new Date().toISOString().slice(0, 10)) {
              return true;
            }
            if (item.stage === 'closed' && item.appealWindowEndsAt) {
              return item.appealWindowEndsAt >= new Date().toISOString().slice(0, 10);
            }
            if (item.stage === 'training_decision') return true;
            return Boolean(item.hasBlockedSteps);
          });
        }

        cases.sort((left, right) => String(right.createdAt || '').localeCompare(String(left.createdAt || '')));
        res.status(200).json({ cases });
      } catch (error) {
        console.error('getPeopleCases failed', error);
        res.status(500).json({ error: 'Failed to load cases.' });
      }
    }),
  );

  const getPeopleCase = onRequest(
    { region: 'europe-west2' },
    withCors(async (req, res) => {
      if (req.method !== 'GET') {
        res.status(405).json({ error: 'Method not allowed.' });
        return;
      }
      const session = await getVerifiedSessionUser(req);
      if (!assertManager(session, res)) return;

      const caseId = toTrimmedString(req.path.split('/').pop());
      if (!caseId) {
        res.status(400).json({ error: 'Case id is required.' });
        return;
      }

      try {
        const caseSnap = await loadCaseOrFail(caseId, res);
        if (!caseSnap) return;
        const caseData = caseSnap.data();

        const related = await listRelated(caseId);

        let history = [];
        let coachingHistory = [];
        if (canManageCases(session.profile, getEffectivePortalRole) && caseData.employeeUid) {
          const historySnap = await db.collection('disciplinary_cases')
            .where('employeeUid', '==', caseData.employeeUid)
            .get();
          const today = new Date().toISOString().slice(0, 10);
          const cutoff = new Date();
          cutoff.setFullYear(cutoff.getFullYear() - 1);
          const cutoffIso = cutoff.toISOString();
          const allCases = historySnap.docs.map((doc) => serializeCase(doc));

          history = allCases
            .filter((item) => {
              if (item.id === caseId) return false;
              if ((item.processFamily || 'disciplinary') === 'grievance') return false;
              if (item.warningClearedAt) return false;
              if (!item.outcomePreset || !['verbal_warning', 'written_warning', 'final_written_warning'].includes(item.outcomePreset)) {
                return false;
              }
              if (!item.warningExpiresAt) return true;
              return item.warningExpiresAt >= today;
            })
            .sort((a, b) => String(b.closedAt || b.createdAt || '').localeCompare(String(a.closedAt || a.createdAt || '')))
            .map((item) => ({
              id: item.id,
              title: item.title || '',
              warningTitle: item.warningTitle || '',
              outcomePreset: item.outcomePreset || '',
              warningEffectiveAt: item.warningEffectiveAt || '',
              warningExpiresAt: item.warningExpiresAt || '',
              closedAt: item.closedAt || '',
              kind: 'warning',
            }));

          coachingHistory = allCases
            .filter((item) => {
              if (item.id === caseId) return false;
              if ((item.processFamily || '') !== 'samsara_coaching' && item.outcomePreset !== 'samsara_coaching') {
                return false;
              }
              const closedAt = item.closedAt || item.updatedAt || item.createdAt || '';
              return String(closedAt) >= cutoffIso;
            })
            .sort((a, b) => String(b.eventDate || b.closedAt || b.createdAt || '')
              .localeCompare(String(a.eventDate || a.closedAt || a.createdAt || '')))
            .map((item) => ({
              id: item.id,
              title: item.title || '',
              issue: item.issue || '',
              eventDate: item.eventDate || '',
              outcomePreset: item.outcomePreset || 'samsara_coaching',
              processFamily: 'samsara_coaching',
              closedAt: item.closedAt || '',
              kind: 'samsara_coaching',
            }));
        }

        const serialized = serializeCase(caseSnap);
        const stage = serialized.stage;
        const family = serialized.processFamily || 'disciplinary';
        const stageTemplates = templatesForStage(
          family,
          stage,
          serialized.outcomePreset || '',
          serialized.trainingDecision || '',
        );
        let documents = related.documents || [];

        let sharePointPath = '';
        let sharePointFolderConfirmed = false;
        let templateLibraryFiles = [];
        if (canManageCases(session.profile, getEffectivePortalRole) && caseData.employeeUid) {
          const employee = await getUserProfile(caseData.employeeUid);
          if (employee) {
            const paths = resolveEmployeeSharePointPaths(employee);
            const caseFolder = buildCaseSharePointFolderName(caseData, caseId);
            sharePointPath = `${paths.disciplinaryFolderPath}/${caseFolder}`;
            sharePointFolderConfirmed = paths.isConfirmed;
          }
          if (isSharePointConfigured(getSharePointConfig())) {
            try {
              templateLibraryFiles = await listTemplateLibraryFiles(getSharePointConfig());
            } catch (spError) {
              console.error('listTemplateLibraryFiles failed', spError);
              templateLibraryFiles = [];
            }
          }
        }

        const minutes = related.minutes || [];
        const inviteDocsNeedingRefresh = documents.filter(
          (doc) => (doc.documentType === 'invite' || doc.source === 'hearing_invite')
            && !portalHtmlHasLetterhead(doc.portalHtml),
        );
        if (inviteDocsNeedingRefresh.length) {
          let hearingManagerName = '';
          const hearingManagerUid = toTrimmedString(caseData.hearingManagerUid);
          if (hearingManagerUid) {
            const manager = await getUserProfile(hearingManagerUid);
            hearingManagerName = manager?.fullName || '';
          }
          for (const inviteDoc of inviteDocsNeedingRefresh) {
            const refreshedHtml = rebuildHearingInvitePortalHtml({
              caseData,
              inviteDoc,
              relatedDocuments: documents,
              hearingManagerName,
            });
            inviteDoc.portalHtml = refreshedHtml;
            // eslint-disable-next-line no-await-in-loop
            await db.collection('disciplinary_documents').doc(inviteDoc.id).update({
              portalHtml: refreshedHtml,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            }).catch((err) => {
              console.error('Failed to refresh hearing invite portalHtml', inviteDoc.id, err);
            });
          }
        }

        const documentTemplates = stageTemplates.map((template) => {
          const match = documents.find((doc) => doc.templateId === template.id)
            || documents.find((doc) => doc.documentType === template.documentType && ['template_upload', 'upload'].includes(doc.source || 'upload'));
          const libraryMatch = findTemplateFile(templateLibraryFiles, template);
          const issuedMinutes = match
            ? minutes.find((item) => item.documentId === match.id)
            : null;
          const satisfiedByPortalInterview = !match && portalInterviewCoversTemplate(minutes, stage, template);
          return {
            ...template,
            uploaded: Boolean(match) || satisfiedByPortalInterview,
            satisfiedByPortalInterview,
            uploadedDocument: match ? {
              id: match.id,
              fileName: match.fileName,
              sharePointWebUrl: match.sharePointWebUrl || '',
              createdAt: match.createdAt || null,
              issuedToEmployeeAt: match.issuedToEmployeeAt || issuedMinutes?.issuedAt || null,
              issuedMinutesId: match.issuedMinutesId || issuedMinutes?.id || '',
              employeeReviewStatus: issuedMinutes?.status || match.employeeReviewStatus || '',
            } : null,
            sharePointTemplateAvailable: Boolean(libraryMatch),
            sharePointTemplateFileName: libraryMatch?.name || (template.sharePointFileNames || [])[0] || '',
            sharePointTemplateWebUrl: libraryMatch?.webUrl || '',
            templatesFolder: `Employee Files/${TEMPLATES_FOLDER_NAME}`,
          };
        });
        const missingDocuments = missingRequiredTemplates({
          processFamily: family,
          stage,
          outcomePreset: serialized.outcomePreset || serialized.trainingDecision || '',
          documents,
          minutes,
          templates: stageTemplates,
        }).map((item) => ({ id: item.id, title: item.title, documentType: item.documentType }));

        res.status(200).json({
          case: serialized,
          ...relatedForClient(related),
          history,
          coachingHistory,
          outcomes: OUTCOME_PRESETS,
          documentTemplates,
          missingDocuments,
          sharePointPath,
          sharePointFolderConfirmed,
          templatesFolder: `Employee Files/${TEMPLATES_FOLDER_NAME}`,
          sharePointConfigured: isSharePointConfigured(getSharePointConfig()),
          isEmployeeView: caseData.employeeUid === session.profile.uid
            && !canManageCases(session.profile, getEffectivePortalRole),
        });
      } catch (error) {
        console.error('getPeopleCase failed', error);
        res.status(500).json({ error: 'Failed to load case.' });
      }
    }),
  );

  const createPeopleCase = onRequest(
    { region: 'europe-west2' },
    withCors(async (req, res) => {
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed.' });
        return;
      }
      const session = await getVerifiedSessionUser(req);
      if (!assertManager(session, res)) return;

      const input = sanitizeCaseCreateInput(req.body || {});
      if (!input.employeeUid) {
        res.status(400).json({ error: 'employeeUid is required.' });
        return;
      }
      if (!input.issue) {
        res.status(400).json({
          error: input.processFamily === 'samsara_coaching'
            ? 'Event type is required.'
            : 'Issue is required.',
        });
        return;
      }
      if (input.processFamily === 'samsara_coaching' && !input.eventDate) {
        input.eventDate = new Date().toISOString().slice(0, 10);
      }
      if (input.processFamily === 'disciplinary' || input.processFamily === 'grievance') {
        const path = input.informalResolutionPath;
        if (!path) {
          res.status(400).json({
            error: 'Choose how to start: resolve informally, proceed formally, or not appropriate for informal resolution.',
          });
          return;
        }
        if (path === 'proceed_formal' && !input.informalNotes && !input.informalTried) {
          res.status(400).json({
            error: 'Record what informal steps were tried before proceeding formally.',
          });
          return;
        }
        if (path === 'not_appropriate' && !input.informalNotAppropriateReason) {
          res.status(400).json({
            error: 'Explain why informal resolution is not appropriate.',
          });
          return;
        }
      }
      if (input.processFamily === 'grievance' && !input.offPortalRaiseDate && !input.offPortalRaiseNotes) {
        res.status(400).json({ error: 'Record the off-portal grievance raise date or notes.' });
        return;
      }

      try {
        const employee = await getUserProfile(input.employeeUid);
        if (!employee) {
          res.status(404).json({ error: 'Employee not found.' });
          return;
        }

        const ownerManagerUid = input.ownerManagerUid || session.profile.uid;
        const ownerProfile = await getUserProfile(ownerManagerUid);
        const now = admin.firestore.FieldValue.serverTimestamp();
        const slaDueAt = addWorkingDays(new Date(), 5);
        const employeeName = employee.fullName || employee.email || 'Employee';
        const isSamsara = input.processFamily === 'samsara_coaching';
        const openedDateLabel = isSamsara && input.eventDate
          ? input.eventDate.split('-').reverse().join('/')
          : new Date().toLocaleDateString('en-GB');
        const issue = input.issue;
        const title = input.title || `${employeeName} - ${issue} - ${openedDateLabel}`;
        const closeNotes = isSamsara
          ? 'Processed on the Samsara system. No portal interview required.'
          : '';

        const caseDoc = await db.collection('disciplinary_cases').add({
          employeeUid: input.employeeUid,
          employeeNameSnapshot: employeeName,
          departmentSnapshot: employee.employeeProfile?.department || '',
          managerUid: ownerManagerUid,
          ownerManagerUid,
          managerNameSnapshot: ownerProfile?.fullName || session.profile.fullName || '',
          processFamily: input.processFamily,
          caseType: input.caseType,
          issue,
          title,
          summary: input.summary || (isSamsara ? closeNotes : ''),
          status: isSamsara ? 'closed' : 'open',
          stage: isSamsara ? 'closed' : input.stage,
          origin: input.sourceIncidentId ? 'attendance_auto' : (isSamsara ? 'samsara' : 'manual'),
          sourceIncidentId: input.sourceIncidentId || '',
          dueAt: input.dueAt || '',
          slaDueAt: isSamsara ? '' : slaDueAt,
          informalResolutionPath: input.informalResolutionPath || '',
          informalTried: input.informalResolutionPath === 'proceed_formal' || input.informalTried,
          informalNotes: input.informalNotes,
          informalNotAppropriateReason: input.informalNotAppropriateReason,
          informalActionDetails: '',
          informalActionTakenAt: null,
          offPortalRaiseDate: input.offPortalRaiseDate,
          offPortalRaiseNotes: input.offPortalRaiseNotes,
          eventDate: input.eventDate || '',
          processedOnSamsara: isSamsara,
          historyReviewedAt: isSamsara ? now : null,
          historyReviewedByUid: isSamsara ? session.profile.uid : '',
          investigatorUid: session.profile.uid,
          hearingManagerUid: '',
          decisionMakerUid: '',
          appealOwnerUid: '',
          companionOffered: false,
          companionRequested: false,
          companionName: '',
          companionType: '',
          companionAttended: false,
          hearingPostponedTo: '',
          hearingScheduledAt: '',
          hearingScheduledTime: '',
          hearingLocation: '',
          hearingInviteNotes: '',
          hearingInviteIssuedAt: null,
          hearingInviteDocumentId: '',
          hearingInviteDeliveredInPerson: false,
          evidenceDocumentIds: [],
          precautionarySuspension: false,
          suspensionActive: false,
          suspensionFrom: '',
          suspensionTo: '',
          suspensionReason: '',
          outcomePreset: isSamsara ? 'samsara_coaching' : '',
          outcomePackSteps: [],
          warningEffectiveAt: '',
          warningExpiresAt: '',
          appealWindowEndsAt: '',
          linkedDisciplinaryCaseId: '',
          linkedAccidentCaseId: '',
          trainingDecision: '',
          trainingOutline: '',
          closeNotes,
          closedByUid: isSamsara ? session.profile.uid : '',
          closedByName: isSamsara ? (session.profile.fullName || session.profile.email || '') : '',
          openedAt: now,
          closedAt: isSamsara ? now : null,
          appealedAt: null,
          createdByUid: session.profile.uid,
          createdByName: session.profile.fullName || session.profile.email || '',
          updatedByUid: session.profile.uid,
          createdAt: now,
          updatedAt: now,
        });

        if (!isSamsara) {
          await stampSharePointCaseFolderName(caseDoc, {
            title,
            openedAt: new Date(),
            offPortalRaiseDate: input.offPortalRaiseDate,
          });
        }

        await appendEvent(caseDoc.id, 'case_created', {
          processFamily: input.processFamily,
          caseType: input.caseType,
          stage: isSamsara ? 'closed' : input.stage,
          ownerManagerUid,
          issue,
          title,
          eventDate: input.eventDate || '',
          processedOnSamsara: isSamsara,
          informalResolutionPath: input.informalResolutionPath || '',
          createdByName: session.profile.fullName || session.profile.email || '',
        }, session.profile);

        if (isSamsara) {
          await appendEvent(caseDoc.id, 'samsara_coaching_logged', {
            eventDate: input.eventDate,
            eventType: issue,
            processedOnSamsara: true,
          }, session.profile);
        }

        res.status(200).json({
          id: caseDoc.id,
          message: isSamsara
            ? 'Samsara coaching logged and closed.'
            : 'Case created.',
        });
      } catch (error) {
        console.error('createPeopleCase failed', error);
        res.status(500).json({ error: 'Failed to create case.' });
      }
    }),
  );

  const updatePeopleCase = onRequest(
    { region: 'europe-west2' },
    withCors(async (req, res) => {
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed.' });
        return;
      }
      const session = await getVerifiedSessionUser(req);
      if (!assertManager(session, res)) return;

      const body = req.body || {};
      const caseId = toTrimmedString(body.caseId);
      if (!caseId) {
        res.status(400).json({ error: 'caseId is required.' });
        return;
      }

      try {
        const caseSnap = await loadCaseOrFail(caseId, res);
        if (!caseSnap) return;
        const existing = caseSnap.data();
        const patch = {};
        const events = [];
        const calendarEvents = [];
        let restrictionForOutcome = null;

        const assignable = [
          'title', 'summary', 'status', 'dueAt', 'slaDueAt',
          'ownerManagerUid', 'hearingManagerUid', 'investigatorUid', 'decisionMakerUid',
          'appealOwnerUid', 'companionName', 'companionType', 'hearingPostponedTo',
          'hearingScheduledAt', 'hearingScheduledTime', 'hearingLocation', 'hearingInviteNotes',
          'suspensionFrom', 'suspensionTo', 'suspensionReason', 'trainingDecision',
          'trainingOutline', 'warningEffectiveAt', 'warningExpiresAt',
          'offPortalRaiseDate', 'offPortalRaiseNotes', 'linkedDisciplinaryCaseId',
        ];
        for (const key of assignable) {
          if (body[key] !== undefined) patch[key] = body[key];
        }

        if (body.ownerManagerUid) {
          const owner = await getUserProfile(body.ownerManagerUid);
          patch.managerUid = body.ownerManagerUid;
          patch.managerNameSnapshot = owner?.fullName || '';
          events.push(['owner_assigned', { ownerManagerUid: body.ownerManagerUid }]);
        }

        if (body.processFamily !== undefined) {
          const nextFamily = toTrimmedString(body.processFamily).toLowerCase();
          if (!PROCESS_FAMILIES.has(nextFamily)) {
            res.status(400).json({ error: 'Invalid process family.' });
            return;
          }
          const currentFamily = existing.processFamily || 'disciplinary';
          if (nextFamily !== currentFamily) {
            const remappedStage = mapStageForFamilyChange(currentFamily, nextFamily, existing.stage);
            patch.processFamily = nextFamily;
            patch.stage = remappedStage;
            if (nextFamily === 'grievance') {
              patch.caseType = 'grievance';
            } else if (nextFamily === 'samsara_coaching') {
              Object.assign(patch, buildSamsaraConversionFields(existing));
            } else if (currentFamily === 'grievance' && (existing.caseType || '') === 'grievance') {
              patch.caseType = nextFamily === 'vehicle_accident' ? 'vehicle_accident' : 'other';
            } else if (nextFamily === 'vehicle_accident') {
              patch.caseType = 'vehicle_accident';
            }
            if (body.caseType && nextFamily !== 'samsara_coaching') {
              patch.caseType = toTrimmedString(body.caseType);
            }
            events.push(['process_family_changed', {
              from: currentFamily,
              to: nextFamily,
              stageFrom: existing.stage,
              stageTo: patch.stage || remappedStage,
            }]);
            if (nextFamily === 'samsara_coaching') {
              events.push(['converted_to_samsara_coaching', {
                fromProcessFamily: currentFamily,
                fromOutcomePreset: existing.outcomePreset || '',
                eventDate: patch.eventDate || '',
                title: patch.title || '',
              }]);
            }
          }
        }

        if (body.convertToSamsaraCoaching === true) {
          const currentFamily = existing.processFamily || 'disciplinary';
          if (currentFamily === 'samsara_coaching') {
            res.status(400).json({ error: 'This case is already Samsara coaching.' });
            return;
          }
          Object.assign(patch, buildSamsaraConversionFields(existing));
          events.push(['converted_to_samsara_coaching', {
            fromProcessFamily: currentFamily,
            fromOutcomePreset: existing.outcomePreset || '',
            eventDate: patch.eventDate || '',
            title: patch.title || '',
          }]);
        }

        if (body.stage) {
          const family = existing.processFamily || 'disciplinary';
          const nextStage = normalizeStage(family, body.stage);
          const stages = stagesForFamily(family);
          if (!stages.includes(nextStage)) {
            res.status(400).json({ error: 'Invalid stage.' });
            return;
          }
          const currentStage = normalizeStage(family, existing.stage);
          const fromIdx = stages.indexOf(currentStage);
          const toIdx = stages.indexOf(nextStage);
          if (toIdx > fromIdx) {
            const related = await listRelated(caseId);
            if (minutesHavePendingAmendment(related.minutes || [])) {
              res.status(400).json({
                error: 'An employee has requested an amendment to interview notes. Address the amendment before continuing.',
                code: 'amendment_pending',
              });
              return;
            }
            const missing = missingRequiredTemplates({
              processFamily: family,
              stage: currentStage,
              outcomePreset: existing.outcomePreset || existing.trainingDecision || '',
              documents: related.documents || [],
              minutes: related.minutes || [],
            });
            if (missing.length) {
              res.status(400).json({
                error: formatMissingDocumentsError(missing),
                code: 'missing_documents',
                missing: missing.map((item) => ({ id: item.id, title: item.title, documentType: item.documentType })),
              });
              return;
            }
          }
          patch.stage = nextStage;
          if (nextStage !== 'closed') patch.status = body.status || 'open';
          events.push(['stage_changed', { from: existing.stage, to: nextStage }]);
        }

        if (body.closeWithNotes === true) {
          if (!(await assertNoPendingAmendments(caseId, res))) return;
          const notes = toTrimmedString(body.closeNotes);
          if (!notes) {
            res.status(400).json({ error: 'Add notes explaining why the case is being closed.' });
            return;
          }
          const presetId = toTrimmedString(body.outcomePreset) || 'no_further_action';
          const preset = outcomePresetById(presetId);
          if (!preset) {
            res.status(400).json({ error: 'Invalid outcome preset.' });
            return;
          }
          patch.outcomePreset = preset.id;
          patch.outcomePackSteps = [];
          patch.closeNotes = notes;
          patch.decisionMakerUid = session.profile.uid;
          patch.closedByUid = session.profile.uid;
          patch.closedByName = session.profile.fullName || session.profile.email || '';
          patch.stage = 'closed';
          patch.status = 'closed';
          patch.closedAt = admin.firestore.FieldValue.serverTimestamp();
          patch.appealWindowEndsAt = addWorkingDays(new Date(), 5);
          events.push(['closed_with_notes', {
            outcomePreset: preset.id,
            notes,
            closedByUid: session.profile.uid,
            closedByName: session.profile.fullName || session.profile.email || '',
          }]);
        }

        if (body.closeAsInformalAction === true) {
          if (!(await assertNoPendingAmendments(caseId, res))) return;
          const details = toTrimmedString(body.informalActionDetails) || toTrimmedString(body.closeNotes);
          if (!details) {
            res.status(400).json({ error: 'Record the informal action taken before closing the case.' });
            return;
          }
          const effective = new Date().toISOString().slice(0, 10);
          const expires = new Date(`${effective}T00:00:00`);
          expires.setMonth(expires.getMonth() + 6);
          patch.outcomePreset = 'informal_action';
          patch.outcomePackSteps = [];
          patch.informalResolutionPath = 'informal_action_taken';
          patch.informalActionDetails = details;
          patch.informalActionTakenAt = admin.firestore.FieldValue.serverTimestamp();
          patch.warningEffectiveAt = effective;
          patch.warningExpiresAt = expires.toISOString().slice(0, 10);
          patch.warningDurationMonths = 6;
          patch.closeNotes = details;
          patch.decisionMakerUid = session.profile.uid;
          patch.closedByUid = session.profile.uid;
          patch.closedByName = session.profile.fullName || session.profile.email || '';
          patch.stage = 'closed';
          patch.status = 'closed';
          patch.closedAt = admin.firestore.FieldValue.serverTimestamp();
          events.push(['informal_action_recorded_and_closed', {
            informalActionDetails: details,
            outcomePreset: 'informal_action',
            warningExpiresAt: patch.warningExpiresAt,
            closedByUid: session.profile.uid,
            closedByName: session.profile.fullName || session.profile.email || '',
          }]);
        }

        let fileNoteHtml = '';
        if (body.issueFileNoteForImprovement === true) {
          if (!(await assertNoPendingAmendments(caseId, res))) return;
          const reason = toTrimmedString(body.fileNoteReason);
          const actionRequired = toTrimmedString(body.fileNoteActionRequired);
          if (!reason) {
            res.status(400).json({ error: 'Enter the reason the file note is being issued.' });
            return;
          }
          if (!actionRequired) {
            res.status(400).json({ error: 'Enter the improvement or action required from the employee.' });
            return;
          }
          const family = existing.processFamily || 'disciplinary';
          const currentStage = normalizeStage(family, existing.stage);
          if (currentStage !== 'fact_finding') {
            res.status(400).json({ error: 'File notes for improvement can only be issued during fact-finding.' });
            return;
          }
          const relatedForFileNote = await listRelated(caseId);
          const missingMinutes = missingRequiredTemplates({
            processFamily: family,
            stage: currentStage,
            outcomePreset: '',
            documents: relatedForFileNote.documents || [],
            minutes: relatedForFileNote.minutes || [],
          }).filter((item) => item.documentType === 'minutes');
          if (missingMinutes.length) {
            res.status(400).json({
              error: 'Record a fact-finding interview on the portal before issuing a file note for improvement.',
              code: 'missing_documents',
            });
            return;
          }

          const issuerName = session.profile.fullName || session.profile.email || 'Manager';
          const issuedAt = new Date();
          const issuedAtLabel = issuedAt.toLocaleDateString('en-GB');
          const managerSignature = {
            signedByUid: session.profile.uid,
            signedByName: issuerName,
            signedAt: issuedAt.toISOString(),
            signedAtLabel: formatUkDateTime(issuedAt),
            method: 'portal_issue',
          };
          fileNoteHtml = buildFileNoteForImprovementHtml({
            employeeName: existing.employeeNameSnapshot || '',
            managerName: issuerName,
            reason,
            actionRequired,
            issuedAtLabel,
            managerSignature,
            employeeSignature: null,
          });
          const fileName = `File note for improvement - ${issuedAtLabel.replace(/\//g, '-')}.html`;
          const now = admin.firestore.FieldValue.serverTimestamp();
          let sharePointWebUrl = '';
          let sharePointFolderPath = '';
          let storageProvider = 'portal';
          if (typeof uploadDisciplinaryDocument === 'function' && isSharePointConfigured(getSharePointConfig())) {
            try {
              const employee = await getUserProfile(existing.employeeUid);
              if (employee) {
                const uploadResult = await uploadDisciplinaryDocument(getSharePointConfig(), {
                  fullName: employee.fullName || existing.employeeNameSnapshot || '',
                  isActive: employee.isActive !== false,
                  sharePointFolderName: employee.sharePointFolderName || '',
                  employeeRoot: employee.sharePointEmployeeRoot || '',
                  caseFolderName: await stampSharePointCaseFolderName(caseSnap.ref, existing),
                  fileName,
                  fileBuffer: Buffer.from(fileNoteHtml, 'utf8'),
                  mimeType: 'text/html',
                });
                sharePointWebUrl = uploadResult.sharePointWebUrl || '';
                sharePointFolderPath = uploadResult.folderPath || '';
                storageProvider = 'sharepoint';
              }
            } catch (spError) {
              console.error('File note SharePoint upload failed; keeping portal copy', spError);
            }
          }
          const docRef = await db.collection('disciplinary_documents').add({
            caseId,
            employeeUid: existing.employeeUid,
            documentType: 'file_note_for_improvement',
            templateId: 'file_note_for_improvement',
            fileName,
            fileFormat: 'html',
            mimeType: 'text/html',
            storageProvider,
            portalHtml: fileNoteHtml,
            sharePointWebUrl,
            sharePointFolderPath,
            uploadedByUid: session.profile.uid,
            source: 'file_note_for_improvement',
            fileNoteReason: reason,
            fileNoteActionRequired: actionRequired,
            issuedToEmployeeAt: now,
            employeeSignStatus: 'pending',
            managerSignature,
            employeeSignature: null,
            createdAt: now,
            updatedAt: now,
          });

          patch.outcomePreset = 'file_note_for_improvement';
          patch.outcomePackSteps = [];
          patch.fileNoteReason = reason;
          patch.fileNoteActionRequired = actionRequired;
          patch.fileNoteIssuedAt = now;
          patch.fileNoteDocumentId = docRef.id;
          patch.fileNoteIssuedByUid = session.profile.uid;
          patch.fileNoteIssuedByName = issuerName;
          patch.fileNoteManagerSignedAt = managerSignature.signedAt;
          patch.fileNoteEmployeeSignStatus = 'pending';
          const fileNoteEffective = issuedAt.toISOString().slice(0, 10);
          const fileNoteExpires = new Date(`${fileNoteEffective}T00:00:00Z`);
          fileNoteExpires.setUTCMonth(fileNoteExpires.getUTCMonth() + 6);
          patch.warningEffectiveAt = fileNoteEffective;
          patch.warningExpiresAt = fileNoteExpires.toISOString().slice(0, 10);
          patch.warningDurationMonths = 6;
          patch.closeNotes = reason;
          patch.decisionMakerUid = session.profile.uid;
          patch.closedByUid = session.profile.uid;
          patch.closedByName = issuerName;
          patch.stage = 'closed';
          // Keep pending_employee so the case shows awaiting employee digital signature.
          patch.status = 'pending_employee';
          patch.closedAt = now;
          events.push(['file_note_for_improvement_issued', {
            documentId: docRef.id,
            reason,
            actionRequired,
            outcomePreset: 'file_note_for_improvement',
            managerSignedAt: managerSignature.signedAt,
            awaitingEmployeeSignature: true,
            closedByUid: session.profile.uid,
            closedByName: issuerName,
          }]);
        }

        if (body.historyReviewed === true) {
          patch.historyReviewedAt = admin.firestore.FieldValue.serverTimestamp();
          patch.historyReviewedByUid = session.profile.uid;
          events.push(['history_reviewed', {}]);
        }

        if (typeof body.companionOffered === 'boolean') patch.companionOffered = body.companionOffered;
        if (typeof body.companionRequested === 'boolean') patch.companionRequested = body.companionRequested;
        if (typeof body.companionAttended === 'boolean') patch.companionAttended = body.companionAttended;

        if (body.markHearingInviteIssued) {
          patch.hearingInviteIssuedAt = admin.firestore.FieldValue.serverTimestamp();
          events.push(['hearing_invite_issued', {}]);
        }
        if (body.markDeliveredInPerson === true) {
          patch.hearingInviteDeliveredInPerson = true;
          events.push(['hearing_invite_delivered_in_person', {}]);
        }

        if (body.issueHearingInvite === true) {
          const hearingScheduledAt = toTrimmedString(body.hearingScheduledAt || patch.hearingScheduledAt || existing.hearingScheduledAt);
          const hearingScheduledTime = toTrimmedString(body.hearingScheduledTime ?? patch.hearingScheduledTime ?? existing.hearingScheduledTime);
          const hearingLocation = toTrimmedString(body.hearingLocation ?? patch.hearingLocation ?? existing.hearingLocation);
          const hearingInviteNotes = toTrimmedString(body.hearingInviteNotes ?? patch.hearingInviteNotes ?? existing.hearingInviteNotes);
          if (!hearingScheduledAt) {
            res.status(400).json({ error: 'Choose a hearing date before sending the invite.' });
            return;
          }
          const today = new Date().toISOString().slice(0, 10);
          if (hearingScheduledAt < today) {
            res.status(400).json({ error: 'Hearing date cannot be in the past.' });
            return;
          }
          const noticeDays = countWorkingDaysNotice(today, hearingScheduledAt);
          const hearingAt = parseHearingDateTime(hearingScheduledAt, hearingScheduledTime)
            || new Date(`${hearingScheduledAt}T09:00:00`);
          const noticeWorkingHours = countWorkingHoursNotice(new Date(), hearingAt);
          const shortNotice = noticeWorkingHours < MINIMUM_HEARING_NOTICE_WORKING_HOURS;
          if (shortNotice && !body.acknowledgeShortNotice) {
            res.status(400).json({
              error: `Country Lion policy requires a minimum of 24 working hours' notice (this date/time gives about ${Math.floor(noticeWorkingHours)} working hour(s)). Confirm to proceed with shorter notice.`,
              code: 'short_notice',
              noticeWorkingDays: noticeDays,
              noticeWorkingHours: Math.round(noticeWorkingHours * 10) / 10,
              recommendedWorkingHours: MINIMUM_HEARING_NOTICE_WORKING_HOURS,
            });
            return;
          }

          // Apply suspension if specified
          if (body.precautionarySuspension) {
            patch.suspensionActive = true;
            patch.precautionarySuspension = true;
            patch.suspensionReason = toTrimmedString(body.suspensionReason) || 'Suspended pending disciplinary hearing';
          }

          const hearingManagerUid = toTrimmedString(patch.hearingManagerUid || existing.hearingManagerUid);
          const hearingManager = hearingManagerUid ? await getUserProfile(hearingManagerUid) : null;
          const resolvedLocation = hearingLocation || 'Country Lion';
          const relatedForInvite = await listRelated(caseId);
          const evidenceDocs = (relatedForInvite.documents || []).filter((doc) => isHearingEvidenceDocument(doc));
          const evidenceDocumentNames = evidenceDocs
            .map((doc) => toTrimmedString(doc.fileName) || toTrimmedString(doc.title))
            .filter(Boolean);
          const inviteHtml = buildHearingInviteHtml({
            employeeName: existing.employeeNameSnapshot || '',
            caseTitle: existing.title || '',
            caseSummary: existing.summary || '',
            hearingScheduledAt,
            hearingScheduledTime,
            hearingLocation: resolvedLocation,
            hearingManagerName: hearingManager?.fullName || session.profile.fullName || '',
            issuedByName: session.profile.fullName || session.profile.email || 'Management',
            issuedAtLabel: new Date().toLocaleDateString('en-GB'),
            extraNotes: hearingInviteNotes,
            evidenceDocumentNames,
            suspensionActive: Boolean(body.precautionarySuspension || existing.suspensionActive),
            precautionarySuspension: Boolean(body.precautionarySuspension || existing.precautionarySuspension || existing.suspensionActive),
            suspensionReason: toTrimmedString(body.suspensionReason) || existing.suspensionReason || '',
          });
          const fileName = `Hearing invite - ${hearingScheduledAt}.html`;
          const now = admin.firestore.FieldValue.serverTimestamp();
          let sharePointWebUrl = '';
          let sharePointFolderPath = '';
          let storageProvider = 'portal';
          if (typeof uploadDisciplinaryDocument === 'function' && isSharePointConfigured(getSharePointConfig())) {
            try {
              const employee = await getUserProfile(existing.employeeUid);
              if (employee) {
                const uploadResult = await uploadDisciplinaryDocument(getSharePointConfig(), {
                  fullName: employee.fullName || existing.employeeNameSnapshot || '',
                  isActive: employee.isActive !== false,
                  sharePointFolderName: employee.sharePointFolderName || '',
                  employeeRoot: employee.sharePointEmployeeRoot || '',
                  caseFolderName: await stampSharePointCaseFolderName(caseSnap.ref, existing),
                  fileName,
                  fileBuffer: Buffer.from(inviteHtml, 'utf8'),
                  mimeType: 'text/html',
                });
                sharePointWebUrl = uploadResult.sharePointWebUrl || '';
                sharePointFolderPath = uploadResult.folderPath || '';
                storageProvider = 'sharepoint';
              }
            } catch (spError) {
              console.error('Hearing invite SharePoint upload failed; keeping portal copy', spError);
            }
          }
          const docRef = await db.collection('disciplinary_documents').add({
            caseId,
            employeeUid: existing.employeeUid,
            documentType: 'invite',
            templateId: 'hearing_invite_letter',
            fileName,
            fileFormat: 'html',
            mimeType: 'text/html',
            storageProvider,
            portalHtml: inviteHtml,
            sharePointWebUrl,
            sharePointFolderPath,
            uploadedByUid: session.profile.uid,
            source: 'hearing_invite',
            hearingScheduledAt,
            hearingScheduledTime,
            hearingLocation: resolvedLocation,
            createdAt: now,
            updatedAt: now,
          });

          const releasedEvidenceIds = await releaseHearingEvidenceDocuments({
            caseId,
            employeeUid: existing.employeeUid,
            inviteDocumentId: docRef.id,
            documents: relatedForInvite.documents || [],
            evidenceDocumentIds: Array.isArray(body.evidenceDocumentIds)
              ? body.evidenceDocumentIds
              : (existing.evidenceDocumentIds || []),
          });

          patch.hearingScheduledAt = hearingScheduledAt;
          patch.hearingScheduledTime = hearingScheduledTime;
          patch.hearingLocation = resolvedLocation;
          patch.hearingInviteNotes = hearingInviteNotes;
          patch.companionOffered = true;
          patch.hearingInviteIssuedAt = now;
          patch.hearingInviteDocumentId = docRef.id;
          patch.status = 'pending_employee';
          events.push(['hearing_invite_issued', {
            documentId: docRef.id,
            hearingScheduledAt,
            hearingScheduledTime,
            hearingLocation: resolvedLocation,
            noticeWorkingDays: noticeDays,
            noticeWorkingHours: Math.round(noticeWorkingHours * 10) / 10,
            shortNotice,
            evidenceDocumentIds: releasedEvidenceIds,
          }]);
          calendarEvents.push(calendarEventFromOptions(
            `hearing-${caseId}-${hearingScheduledAt}.ics`,
            {
              uid: `hearing-${caseId}-${docRef.id}@countrylion.co.uk`,
              summary: `Disciplinary hearing — ${existing.employeeNameSnapshot || existing.title || caseId}`,
              description: [
                `Case: ${existing.title || caseId}`,
                hearingInviteNotes ? `Notes: ${hearingInviteNotes}` : '',
                'Hearing invite issued via Employee Portal.',
              ].filter(Boolean).join('\n'),
              location: resolvedLocation,
              startDate: hearingScheduledAt,
              startTime: hearingScheduledTime || '10:00',
              durationMinutes: 60,
            },
          ));
        }
        if (Array.isArray(body.evidenceDocumentIds)) {
          patch.evidenceDocumentIds = body.evidenceDocumentIds.map(toTrimmedString).filter(Boolean);
          events.push(['evidence_bundle_updated', { count: patch.evidenceDocumentIds.length }]);
        }

        if (typeof body.precautionarySuspension === 'boolean') {
          patch.precautionarySuspension = body.precautionarySuspension;
          if (body.precautionarySuspension) {
            patch.suspensionActive = true;
            patch.suspensionReason = toTrimmedString(body.suspensionReason) || 'Precautionary pending investigation';
            events.push(['precautionary_suspension_started', {}]);
          }
        }

        if (body.endSuspension === true) {
          patch.suspensionActive = false;
          patch.suspensionTo = toTrimmedString(body.suspensionTo) || new Date().toISOString().slice(0, 10);
          events.push(['suspension_ended', {}]);
        }

        if (body.hearingPostponedTo) {
          events.push(['hearing_postponed_for_companion', { to: body.hearingPostponedTo }]);
        }

        if (body.rescheduleReview && typeof body.rescheduleReview === 'object') {
          const reviewId = toTrimmedString(body.rescheduleReview.reviewId);
          const dueAt = toTrimmedString(body.rescheduleReview.dueAt).slice(0, 10);
          const reviewTitle = toTrimmedString(body.rescheduleReview.title);
          const reviewNotes = toTrimmedString(body.rescheduleReview.notes);
          if (!reviewId || !/^\d{4}-\d{2}-\d{2}$/.test(dueAt)) {
            res.status(400).json({ error: 'Review id and a valid new date are required to reschedule.' });
            return;
          }
          const reviewSnap = await db.collection('case_reviews').doc(reviewId).get();
          if (!reviewSnap.exists) {
            res.status(404).json({ error: 'Review not found.' });
            return;
          }
          const reviewData = reviewSnap.data() || {};
          if (reviewData.caseId !== caseId) {
            res.status(400).json({ error: 'Review does not belong to this case.' });
            return;
          }
          if (reviewData.status === 'completed') {
            res.status(400).json({ error: 'Completed reviews cannot be rescheduled.' });
            return;
          }
          const previousDueAt = toTrimmedString(reviewData.dueAt);
          const nextTitle = reviewTitle || reviewData.title || 'Review meeting';
          const nextNotes = reviewNotes || reviewData.notes || '';
          await reviewSnap.ref.update({
            dueAt,
            title: nextTitle,
            notes: nextNotes,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedByUid: session.profile.uid,
          });
          const openReviews = await db.collection('case_reviews').where('caseId', '==', caseId).get();
          const openDueDates = openReviews.docs
            .map((doc) => {
              const data = doc.data() || {};
              if (doc.id === reviewId) return dueAt;
              if (data.status === 'completed') return '';
              return toTrimmedString(data.dueAt);
            })
            .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value))
            .sort();
          if (openDueDates.length) {
            patch.nextReviewDueAt = openDueDates[0];
          }
          events.push(['review_rescheduled', {
            reviewId,
            from: previousDueAt,
            to: dueAt,
            title: nextTitle,
          }]);
          calendarEvents.push(calendarEventFromOptions(
            `review-${caseId}-${dueAt}.ics`,
            {
              uid: `review-${caseId}-${reviewId}@countrylion.co.uk`,
              summary: `${nextTitle} — ${existing.employeeNameSnapshot || existing.title || caseId}`,
              description: [
                `Case: ${existing.title || caseId}`,
                nextNotes ? `Notes: ${nextNotes}` : '',
                previousDueAt ? `Rescheduled from ${previousDueAt}.` : 'Review rescheduled via Employee Portal.',
              ].filter(Boolean).join('\n'),
              startDate: dueAt,
            },
          ));
        }

        if (body.outcomePreset) {
          const preset = outcomePresetById(body.outcomePreset);
          if (!preset) {
            res.status(400).json({ error: 'Invalid outcome preset.' });
            return;
          }
          const finalizeOutcome = body.finalizeOutcome === true;
          const evidenceConsideration = toTrimmedString(body.evidenceConsideration);
          const expectedStandard = toTrimmedString(body.expectedStandard);
          const supportMonitoringRetraining = toTrimmedString(body.supportMonitoringRetraining);
          const appealRecipientUid = toTrimmedString(body.appealRecipientUid);
          const warningTitle = toTrimmedString(body.warningTitle);
          const reviewInputs = Array.isArray(body.reviews)
            ? body.reviews
              .map((item) => ({
                title: toTrimmedString(item?.title) || 'Review meeting',
                dueAt: toTrimmedString(item?.dueAt),
                notes: toTrimmedString(item?.notes),
              }))
              .filter((item) => item.dueAt)
            : [];

          if (finalizeOutcome) {
            if (!(await assertNoPendingAmendments(caseId, res))) return;
            const outcomeDetailsCheck = toTrimmedString(body.outcomeDetails);
            if (!outcomeDetailsCheck) {
              res.status(400).json({ error: 'Outcome details / reasons are required.' });
              return;
            }
            if (!evidenceConsideration) {
              res.status(400).json({ error: 'Please record consideration of the evidence.' });
              return;
            }
            if (!expectedStandard) {
              res.status(400).json({ error: 'Please set out the expected standard going forward.' });
              return;
            }
            if (!supportMonitoringRetraining) {
              res.status(400).json({ error: 'Please outline support, monitoring and/or retraining.' });
              return;
            }
            if (!appealRecipientUid) {
              res.status(400).json({ error: 'Select who the employee should appeal to.' });
              return;
            }
            if (
              ['written_warning', 'final_written_warning', 'pip'].includes(preset.id)
              && !warningTitle
            ) {
              res.status(400).json({ error: 'Enter a short warning title (e.g. Speeding).' });
              return;
            }
            if (
              ['written_warning', 'final_written_warning', 'pip'].includes(preset.id)
              && !body.warningDurationMonths
              && !body.warningExpiresAt
            ) {
              res.status(400).json({ error: 'Choose a 6 or 12 month duration for this outcome.' });
              return;
            }
            const restrictionCheck = sanitizeRestrictionInput(body, existing.processFamily || 'disciplinary');
            if (!restrictionCheck.ok) {
              res.status(400).json({ error: restrictionCheck.error });
              return;
            }
            restrictionForOutcome = restrictionCheck.patch;
          }

          if (
            existing.investigatorUid
            && existing.hearingManagerUid
            && existing.investigatorUid === existing.hearingManagerUid
            && !body.acknowledgeSameInvestigatorHearer
          ) {
            // Soft warning only — client should confirm; server still allows with flag.
          }
          patch.outcomePreset = preset.id;
          patch.outcomePackSteps = buildOutcomePackSteps(preset.id);
          patch.decisionMakerUid = session.profile.uid;
          if (body.outcomeDetails) patch.outcomeDetails = toTrimmedString(body.outcomeDetails);
          if (evidenceConsideration) patch.evidenceConsideration = evidenceConsideration;
          if (expectedStandard) patch.expectedStandard = expectedStandard;
          if (supportMonitoringRetraining) patch.supportMonitoringRetraining = supportMonitoringRetraining;
          if (warningTitle) patch.warningTitle = warningTitle;
          if (body.warningDurationMonths) patch.warningDurationMonths = Number(body.warningDurationMonths);
          if (body.warningEffectiveAt) patch.warningEffectiveAt = body.warningEffectiveAt;
          if (body.warningExpiresAt) patch.warningExpiresAt = body.warningExpiresAt;
          if (!body.warningExpiresAt && body.warningEffectiveAt && body.warningDurationMonths) {
            const expires = new Date(body.warningEffectiveAt);
            expires.setMonth(expires.getMonth() + Number(body.warningDurationMonths));
            patch.warningExpiresAt = expires.toISOString().slice(0, 10);
          } else if (
            (preset.warning || ['written_warning', 'final_written_warning', 'pip'].includes(preset.id))
            && !body.warningExpiresAt
            && (preset.suggestedExpiryMonths || body.warningDurationMonths)
          ) {
            const effective = toTrimmedString(body.warningEffectiveAt) || new Date().toISOString().slice(0, 10);
            const months = Number(body.warningDurationMonths || preset.suggestedExpiryMonths || 6);
            const expires = new Date(effective);
            expires.setMonth(expires.getMonth() + months);
            patch.warningEffectiveAt = effective;
            patch.warningExpiresAt = expires.toISOString().slice(0, 10);
            patch.warningDurationMonths = months;
          }
          events.push(['outcome_selected', { outcomePreset: preset.id, finalizeOutcome }]);

          const supersedeCaseIds = Array.isArray(body.supersedeCaseIds)
            ? [...new Set(body.supersedeCaseIds.map(toTrimmedString).filter(Boolean))]
            : [];
          const superseded = [];
          for (const oldCaseId of supersedeCaseIds) {
            if (!oldCaseId || oldCaseId === caseId) continue;
            // eslint-disable-next-line no-await-in-loop
            const oldSnap = await db.collection('disciplinary_cases').doc(oldCaseId).get();
            if (!oldSnap.exists) continue;
            const oldData = oldSnap.data() || {};
            if (toTrimmedString(oldData.employeeUid) !== toTrimmedString(existing.employeeUid)) {
              continue;
            }
            if (oldData.warningClearedAt) continue;
            // eslint-disable-next-line no-await-in-loop
            await oldSnap.ref.update({
              warningClearedAt: admin.firestore.FieldValue.serverTimestamp(),
              warningClearedReason: 'superseded',
              supersededByCaseId: caseId,
              supersededByOutcome: preset.id,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              updatedByUid: session.profile.uid,
            });
            // eslint-disable-next-line no-await-in-loop
            await appendEvent(oldCaseId, 'warning_superseded', {
              supersededByCaseId: caseId,
              supersededByOutcome: preset.id,
              previousOutcome: oldData.outcomePreset || '',
              title: oldData.title || '',
            }, session.profile);
            superseded.push({
              id: oldCaseId,
              title: oldData.title || '',
              outcomePreset: oldData.outcomePreset || '',
            });
          }
          if (superseded.length) {
            patch.supersededCaseIds = superseded.map((item) => item.id);
            patch.supersededWarnings = superseded;
            events.push(['warnings_superseded', {
              caseIds: superseded.map((item) => item.id),
              warnings: superseded,
            }]);
          }

          let appealRecipientName = '';
          if (appealRecipientUid) {
            const appealRecipient = await getUserProfile(appealRecipientUid);
            appealRecipientName = appealRecipient?.fullName || appealRecipient?.email || '';
            patch.appealOwnerUid = appealRecipientUid;
            patch.appealRecipientUid = appealRecipientUid;
            patch.appealRecipientNameSnapshot = appealRecipientName;
          }

          const appealWindowEndsAt = addWorkingDays(new Date(), 5);
          const outcomeDetails = toTrimmedString(body.outcomeDetails) || '';
          const employeeName = existing.employeeNameSnapshot || '';
          const durationLabel = (patch.warningDurationMonths || body.warningDurationMonths)
            ? `${patch.warningDurationMonths || body.warningDurationMonths} months`
            : '';
          const todayLabel = new Date().toLocaleDateString('en-GB');
          const appealDeadlineLabel = String(appealWindowEndsAt).slice(0, 10).split('-').reverse().join('/');
          const requiresEmployeeSignature = finalizeOutcome
            && ['written_warning', 'final_written_warning', 'pip'].includes(preset.id);
          const issuerName = session.profile.fullName || session.profile.email || 'Management';
          const managerSignature = requiresEmployeeSignature
            ? {
              signedByUid: session.profile.uid,
              signedByName: issuerName,
              signedAt: new Date().toISOString(),
              signedAtLabel: formatUkDateTime(new Date()),
              method: 'portal_issue',
            }
            : null;
          const restrictionLetterFields = restrictionForOutcome?.restrictionActive
            ? {
              restrictionType: restrictionForOutcome.restrictionType || '',
              restrictionDetail: restrictionForOutcome.restrictionDetail || '',
              restrictionExpiresAt: restrictionForOutcome.restrictionExpiresAt || '',
            }
            : {
              restrictionType: '',
              restrictionDetail: '',
              restrictionExpiresAt: '',
            };
          const outcomeLetterHtml = buildOutcomeLetterHtml({
            employeeName,
            caseTitle: existing.title || '',
            presetLabel: preset.label,
            outcomeDetails,
            evidenceConsideration,
            expectedStandard,
            supportMonitoringRetraining,
            reviewDates: reviewInputs,
            ...restrictionLetterFields,
            warningEffectiveAt: patch.warningEffectiveAt || '',
            warningExpiresAt: patch.warningExpiresAt || '',
            durationLabel,
            issuedByName: issuerName,
            issuedAtLabel: todayLabel,
            appealRecipientName,
            appealDeadlineLabel,
            managerSignature,
            employeeSignature: null,
            requiresEmployeeSignature,
            warningTitle,
          });
          const outcomeNow = admin.firestore.FieldValue.serverTimestamp();
          const outcomeFileName = requiresEmployeeSignature
            ? `${warningTitle || preset.label} - ${new Date().toISOString().slice(0, 10)}.html`
            : `Outcome letter - ${new Date().toISOString().slice(0, 10)}.html`;
          const outcomeDocRef = await db.collection('disciplinary_documents').add({
            caseId,
            employeeUid: existing.employeeUid,
            documentType: 'outcome',
            templateId: requiresEmployeeSignature ? `${preset.id}_outcome` : 'outcome_letter',
            fileName: outcomeFileName,
            fileFormat: 'html',
            mimeType: 'text/html',
            storageProvider: 'portal',
            portalHtml: outcomeLetterHtml,
            uploadedByUid: session.profile.uid,
            source: finalizeOutcome ? 'outcome_finalize' : 'outcome_selection',
            issuedToEmployeeAt: finalizeOutcome ? outcomeNow : null,
            employeeSignStatus: requiresEmployeeSignature ? 'pending' : null,
            managerSignature: managerSignature || null,
            employeeSignature: null,
            requiresEmployeeSignature: Boolean(requiresEmployeeSignature),
            warningPresetId: requiresEmployeeSignature ? preset.id : null,
            warningPresetLabel: requiresEmployeeSignature ? preset.label : null,
            warningTitle: warningTitle || null,
            warningEffectiveAt: patch.warningEffectiveAt || '',
            warningExpiresAt: patch.warningExpiresAt || '',
            warningDurationMonths: patch.warningDurationMonths || body.warningDurationMonths || null,
            outcomeDetails,
            evidenceConsideration,
            expectedStandard,
            supportMonitoringRetraining,
            reviewDates: reviewInputs,
            ...restrictionLetterFields,
            appealRecipientName,
            appealDeadlineLabel,
            createdAt: outcomeNow,
            updatedAt: outcomeNow,
          });

          if (requiresEmployeeSignature) {
            patch.warningDocumentId = outcomeDocRef.id;
            patch.warningEmployeeSignStatus = 'pending';
            patch.warningIssuedByUid = session.profile.uid;
            patch.warningIssuedByName = issuerName;
          }

          if (finalizeOutcome) {
            for (const review of reviewInputs) {
              // eslint-disable-next-line no-await-in-loop
              await db.collection('case_reviews').add({
                caseId,
                employeeUid: existing.employeeUid || '',
                title: review.title,
                notes: review.notes || '',
                dueAt: review.dueAt,
                status: 'open',
                createdByUid: session.profile.uid,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              });
              calendarEvents.push(calendarEventFromOptions(
                `review-${caseId}-${review.dueAt}.ics`,
                {
                  uid: `review-${caseId}-${review.dueAt}-${review.title}@countrylion.co.uk`,
                  summary: `${review.title} — ${existing.employeeNameSnapshot || existing.title || caseId}`,
                  description: [
                    `Case: ${existing.title || caseId}`,
                    review.notes ? `Notes: ${review.notes}` : '',
                    'Review meeting scheduled via Employee Portal.',
                  ].filter(Boolean).join('\n'),
                  startDate: review.dueAt,
                },
              ));
            }
            if (reviewInputs.length) {
              const nextDue = [...reviewInputs]
                .map((item) => item.dueAt)
                .sort()[0];
              patch.nextReviewDueAt = nextDue;
              patch.reviewScheduledCount = reviewInputs.length;
              events.push(['reviews_scheduled', { count: reviewInputs.length, nextDue }]);
            }

            patch.outcomePackSteps = (patch.outcomePackSteps || []).map((step) => ({
              ...step,
              done: true,
              completedAt: new Date().toISOString(),
              completedByUid: session.profile.uid,
            }));
            patch.stage = 'closed';
            // Written warnings / PIP await employee digital signature on the portal.
            patch.status = ['written_warning', 'final_written_warning', 'pip'].includes(preset.id)
              ? 'pending_employee'
              : 'closed';
            patch.closedAt = admin.firestore.FieldValue.serverTimestamp();
            patch.closedByUid = session.profile.uid;
            patch.closedByName = session.profile.fullName || session.profile.email || '';
            patch.appealWindowEndsAt = appealWindowEndsAt;
            patch.outcomeIssuedAt = outcomeNow;
            events.push(['outcome_finalized', {
              outcomePreset: preset.id,
              appealWindowEndsAt,
              appealRecipientUid,
              reviewCount: reviewInputs.length,
              awaitingEmployeeSignature: ['written_warning', 'final_written_warning', 'pip'].includes(preset.id),
            }]);
            events.push(['case_closed', {
              appealWindowEndsAt,
              via: 'outcome_finalize',
              awaitingEmployeeSignature: ['written_warning', 'final_written_warning', 'pip'].includes(preset.id),
            }]);
          }
        }

        if (body.completePackStepId) {
          const steps = Array.isArray(existing.outcomePackSteps) ? [...existing.outcomePackSteps] : [];
          const idx = steps.findIndex((step) => step.id === body.completePackStepId);
          if (idx >= 0) {
            steps[idx] = { ...steps[idx], done: true, completedAt: new Date().toISOString(), completedByUid: session.profile.uid };
            patch.outcomePackSteps = steps;
            events.push(['outcome_pack_step_completed', { stepId: body.completePackStepId }]);
          }
        }

        if (body.closeCase === true) {
          if (!(await assertNoPendingAmendments(caseId, res))) return;
          const family = existing.processFamily || 'disciplinary';
          const currentStage = normalizeStage(family, existing.stage);
          if (['outcome_pack', 'appeal'].includes(currentStage)) {
            const relatedForClose = await listRelated(caseId);
            const missing = missingRequiredTemplates({
              processFamily: family,
              stage: currentStage,
              outcomePreset: patch.outcomePreset || existing.outcomePreset || '',
              documents: relatedForClose.documents || [],
              minutes: relatedForClose.minutes || [],
            });
            if (missing.length && !body.forceClose) {
              res.status(400).json({
                error: formatMissingDocumentsError(missing),
                code: 'missing_documents',
                missing: missing.map((item) => ({ id: item.id, title: item.title, documentType: item.documentType })),
              });
              return;
            }
          }
          const steps = patch.outcomePackSteps || existing.outcomePackSteps || [];
          const incomplete = steps.filter((step) => step.id !== 'mark_complete' && !step.done);
          if (incomplete.length && !body.forceClose) {
            res.status(400).json({ error: 'Complete outcome pack steps before closing, or force close with reason.' });
            return;
          }
          patch.stage = 'closed';
          patch.status = 'closed';
          patch.closedAt = admin.firestore.FieldValue.serverTimestamp();
          patch.appealWindowEndsAt = addWorkingDays(new Date(), 5);
          if (Array.isArray(steps)) {
            patch.outcomePackSteps = steps.map((step) => (
              step.id === 'mark_complete' ? { ...step, done: true } : step
            ));
          }
          events.push(['case_closed', { appealWindowEndsAt: patch.appealWindowEndsAt }]);
        }

        if (body.initiateAppeal === true) {
          if (existing.stage !== 'closed') {
            res.status(400).json({ error: 'Only closed cases can be appealed.' });
            return;
          }
          const appealOwnerUid = toTrimmedString(body.appealOwnerUid);
          if (appealOwnerUid && appealOwnerUid === (existing.decisionMakerUid || existing.ownerManagerUid)) {
            if (!body.acknowledgeSameAppealOwner) {
              res.status(400).json({
                error: 'Appeal owner should differ from the original decision-maker. Confirm to override.',
                code: 'appeal_owner_same',
              });
              return;
            }
          }
          patch.stage = 'appeal';
          patch.status = 'reopened_on_appeal';
          patch.appealedAt = admin.firestore.FieldValue.serverTimestamp();
          patch.closedAt = null;
          if (appealOwnerUid) patch.appealOwnerUid = appealOwnerUid;
          if (appealOwnerUid) patch.ownerManagerUid = appealOwnerUid;
          events.push(['appeal_initiated', { appealOwnerUid }]);
        }

        if (body.leaverAction) {
          patch.leaverAction = toTrimmedString(body.leaverAction);
          events.push(['leaver_action', { action: patch.leaverAction }]);
          if (body.leaverAction === 'close') {
            patch.stage = 'closed';
            patch.status = 'closed';
            patch.closedAt = admin.firestore.FieldValue.serverTimestamp();
          }
        }

        if (body.trainingDecision) {
          patch.trainingDecision = toTrimmedString(body.trainingDecision);
          events.push(['training_decision', { decision: patch.trainingDecision }]);
          if (patch.trainingDecision === 'no_further_action') {
            patch.stage = 'closed';
            patch.status = 'closed';
            patch.closedAt = admin.firestore.FieldValue.serverTimestamp();
          }
          if (patch.trainingDecision === 'training_required') {
            patch.outcomePreset = 'training_required';
            patch.outcomePackSteps = buildOutcomePackSteps('training_required');
          }
        }

        if (body.openLinkedDisciplinary === true) {
          const now = admin.firestore.FieldValue.serverTimestamp();
          const linked = await db.collection('disciplinary_cases').add({
            ...existing,
            processFamily: 'disciplinary',
            caseType: 'conduct',
            title: `Disciplinary linked to accident: ${existing.title || caseId}`,
            stage: 'fact_finding',
            status: 'open',
            linkedAccidentCaseId: caseId,
            outcomePreset: '',
            outcomePackSteps: [],
            createdAt: now,
            updatedAt: now,
            openedAt: now,
            closedAt: null,
            createdByUid: session.profile.uid,
            updatedByUid: session.profile.uid,
          });
          await stampSharePointCaseFolderName(linked, {
            title: `Disciplinary linked to accident: ${existing.title || caseId}`,
            openedAt: new Date(),
          });
          patch.linkedDisciplinaryCaseId = linked.id;
          patch.trainingDecision = 'disciplinary';
          events.push(['linked_disciplinary_opened', { linkedCaseId: linked.id }]);
        }

        const appliesRestriction = body.closeWithNotes === true
          || body.issueFileNoteForImprovement === true
          || body.finalizeOutcome === true;
        if (body.closeAsInformalAction === true) {
          // Informal resolution cannot carry a work restriction.
          Object.assign(patch, {
            restrictionType: '',
            restrictionDetail: '',
            restrictionExpiresAt: '',
            restrictionActive: false,
          });
        } else if (appliesRestriction) {
          let restrictionPatch = null;
          if (body.finalizeOutcome === true && restrictionForOutcome) {
            restrictionPatch = restrictionForOutcome;
          } else {
            const restriction = sanitizeRestrictionInput(body, existing.processFamily || 'disciplinary');
            if (!restriction.ok) {
              res.status(400).json({ error: restriction.error });
              return;
            }
            restrictionPatch = restriction.patch;
          }
          if (restrictionPatch) {
            Object.assign(patch, restrictionPatch);
            if (restrictionPatch.restrictionActive) {
              events.push(['restriction_added', {
                restrictionType: restrictionPatch.restrictionType,
                restrictionDetail: restrictionPatch.restrictionDetail || '',
                restrictionExpiresAt: restrictionPatch.restrictionExpiresAt,
              }]);
              calendarEvents.push(calendarEventFromOptions(
                `restriction-${caseId}-${restrictionPatch.restrictionExpiresAt}.ics`,
                {
                  uid: `restriction-${caseId}-${restrictionPatch.restrictionExpiresAt}@countrylion.co.uk`,
                  summary: `Restriction ends — ${restrictionLabel(restrictionPatch.restrictionType, restrictionPatch.restrictionDetail)}`,
                  description: [
                    `Case: ${existing.title || caseId}`,
                    `Employee: ${existing.employeeNameSnapshot || ''}`,
                    `Restriction: ${restrictionLabel(restrictionPatch.restrictionType, restrictionPatch.restrictionDetail)}`,
                    'Reminder: work restriction expiry from Employee Portal.',
                  ].filter(Boolean).join('\n'),
                  startDate: restrictionPatch.restrictionExpiresAt,
                },
              ));
            }
          }
        }

        patch.updatedAt = admin.firestore.FieldValue.serverTimestamp();
        patch.updatedByUid = session.profile.uid;
        await caseSnap.ref.update(patch);
        for (const [type, payload] of events) {
          await appendEvent(caseId, type, payload, session.profile);
        }

        const refreshed = await caseSnap.ref.get();
        const responseBody = { case: serializeCase(refreshed), message: 'Case updated.' };
        if (fileNoteHtml) {
          responseBody.message = 'File note issued to the employee portal for digital signature. Manager signature applied. Case closed pending employee sign-off.';
          responseBody.fileNoteHtml = fileNoteHtml;
          responseBody.fileNoteDocumentId = patch.fileNoteDocumentId || '';
        }
        if (calendarEvents.length) {
          responseBody.calendarEvents = calendarEvents;
          responseBody.message = `${responseBody.message} Use Add to Outlook below to put the reminder in your calendar (recommended for New Outlook).`;
        }
        res.status(200).json(responseBody);
      } catch (error) {
        console.error('updatePeopleCase failed', error);
        res.status(500).json({
          error: error?.message ? `Failed to update case: ${error.message}` : 'Failed to update case.',
        });
      }
    }),
  );

  const createCaseMinutes = onRequest(
    { region: 'europe-west2' },
    withCors(async (req, res) => {
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed.' });
        return;
      }
      const session = await getVerifiedSessionUser(req);
      if (!assertManager(session, res)) return;
      const body = req.body || {};
      const caseId = toTrimmedString(body.caseId);
      const documentId = toTrimmedString(body.documentId);
      let content = toTrimmedString(body.content);
      if (!caseId || (!content && !documentId)) {
        res.status(400).json({ error: 'caseId and content or documentId are required.' });
        return;
      }
      try {
        const caseSnap = await loadCaseOrFail(caseId, res);
        if (!caseSnap) return;
        const caseData = caseSnap.data();
        const now = admin.firestore.FieldValue.serverTimestamp();

        let documentData = null;
        if (documentId) {
          const documentSnap = await db.collection('disciplinary_documents').doc(documentId).get();
          if (!documentSnap.exists) {
            res.status(404).json({ error: 'Document not found.' });
            return;
          }
          documentData = { id: documentSnap.id, ...documentSnap.data() };
          if (documentData.caseId !== caseId) {
            res.status(400).json({ error: 'Document does not belong to this case.' });
            return;
          }
          if (!content) {
            content = `Please review and sign off the attached document: ${documentData.fileName || 'case document'}.`;
          }
        }

        const rawPresentUids = Array.isArray(body.managersPresentUids)
          ? body.managersPresentUids.map(toTrimmedString).filter(Boolean)
          : [];
        // De-dupe while preserving order
        const presentUids = [...new Set(rawPresentUids)];
        if (!documentId && presentUids.length < 2) {
          res.status(400).json({ error: 'At least 2 managers must be recorded as present for an interview.' });
          return;
        }
        const managersPresent = [];
        for (const uid of presentUids) {
          const profile = await getUserProfile(uid);
          managersPresent.push({
            uid,
            name: profile?.fullName || profile?.email || uid,
          });
        }
        const meetingType = toTrimmedString(body.meetingType)
          || (documentData?.templateId ? String(documentData.templateId).replace(/_/g, ' ') : '')
          || 'interview';
        const stageKey = toTrimmedString(body.stageKey)
          || toTrimmedString(documentData?.stageKey)
          || '';
        const interviewAt = toTrimmedString(body.interviewAt) || '';
        const interviewTime = toTrimmedString(body.interviewTime) || '';
        const recordType = documentId ? 'document' : 'interview';
        const intervieweeUid = toTrimmedString(body.intervieweeUid) || caseData.employeeUid;
        const interviewee = await getUserProfile(intervieweeUid);
        if (!interviewee) {
          res.status(400).json({ error: 'Selected interviewee not found.' });
          return;
        }
        const intervieweeNameSnapshot = interviewee.fullName || interviewee.email || '';
        const ref = await db.collection('case_minutes').add({
          caseId,
          employeeUid: intervieweeUid,
          caseEmployeeUid: caseData.employeeUid || '',
          intervieweeNameSnapshot,
          meetingType,
          stageKey,
          interviewAt,
          interviewTime,
          recordType,
          content,
          documentId: documentData?.id || '',
          fileName: documentData?.fileName || '',
          sharePointWebUrl: documentData?.sharePointWebUrl || '',
          managersPresent,
          managersPresentUids: presentUids,
          status: 'issued',
          amendmentRequests: [],
          signedOffAt: null,
          signedOffByUid: '',
          disputed: false,
          disputedNotes: '',
          managerVersion: content,
          employeeVersion: '',
          issuedAt: now,
          createdByUid: session.profile.uid,
          createdAt: now,
          updatedAt: now,
        });
        if (documentData?.id) {
          await db.collection('disciplinary_documents').doc(documentData.id).update({
            issuedToEmployeeAt: now,
            issuedMinutesId: ref.id,
            employeeReviewStatus: 'issued',
            updatedAt: now,
          });
        }
        // Interview notes are non-blocking: the employee may amend/sign in the portal,
        // but the case proceeds without waiting on that response.
        const casePatch = {
          interviewNotesIssuedAt: now,
          updatedAt: now,
          updatedByUid: session.profile.uid,
        };
        if (caseData.status !== 'closed' && normalizeStage(caseData.processFamily || 'disciplinary', caseData.stage) !== 'closed') {
          casePatch.status = 'open';
        }
        await caseSnap.ref.update(casePatch);
        await appendEvent(caseId, 'minutes_issued', {
          minutesId: ref.id,
          meetingType,
          stageKey,
          interviewAt,
          interviewTime,
          recordType,
          intervieweeUid,
          intervieweeNameSnapshot,
          managersPresentUids: presentUids,
          documentId: documentData?.id || '',
          fileName: documentData?.fileName || '',
        }, session.profile);
        res.status(200).json({
          id: ref.id,
          message: documentData
            ? 'Document sent to the employee for review and sign-off.'
            : 'Minutes issued to employee.',
        });
      } catch (error) {
        console.error('createCaseMinutes failed', error);
        res.status(500).json({ error: 'Failed to issue minutes.' });
      }
    }),
  );

  function resolvePendingAmendmentRequests(requests = [], decision, managerUid, managerResponse = '') {
    const resolvedAt = new Date().toISOString();
    return requests.map((item) => {
      if (item.status && item.status !== 'pending') return item;
      return {
        ...item,
        status: decision,
        resolvedAt,
        resolvedByUid: managerUid,
        managerResponse: managerResponse || '',
      };
    });
  }

  const respondCaseMinutes = onRequest(
    { region: 'europe-west2' },
    withCors(async (req, res) => {
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed.' });
        return;
      }
      const session = await getVerifiedSessionUser(req);
      if (!session) {
        res.status(401).json({ error: 'Authentication required.' });
        return;
      }
      const body = req.body || {};
      const minutesId = toTrimmedString(body.minutesId);
      const action = toTrimmedString(body.action);
      if (!minutesId || !['approve', 'amend', 'sign_off', 'manager_update', 'apply_amendment', 'decline_amendment'].includes(action)) {
        res.status(400).json({ error: 'minutesId and valid action are required.' });
        return;
      }
      try {
        const minutesSnap = await db.collection('case_minutes').doc(minutesId).get();
        if (!minutesSnap.exists) {
          res.status(404).json({ error: 'Minutes not found.' });
          return;
        }
        const minutes = minutesSnap.data();
        const isEmployee = minutes.employeeUid === session.profile.uid;
        const isManager = canManageCases(session.profile, getEffectivePortalRole);
        if (!isEmployee && !isManager) {
          res.status(403).json({ error: 'Insufficient access.' });
          return;
        }

        const now = admin.firestore.FieldValue.serverTimestamp();
        const patch = { updatedAt: now };
        if (action === 'amend' && isEmployee) {
          const request = toTrimmedString(body.amendmentRequest);
          if (!request) {
            res.status(400).json({ error: 'Please describe what should be amended.' });
            return;
          }
          patch.amendmentRequests = admin.firestore.FieldValue.arrayUnion({
            text: request,
            at: new Date().toISOString(),
            byUid: session.profile.uid,
            status: 'pending',
          });
          patch.status = 'amendment_requested';
        } else if (action === 'apply_amendment' && isManager) {
          const content = toTrimmedString(body.content);
          if (!content) {
            res.status(400).json({ error: 'Updated notes are required when applying an amendment.' });
            return;
          }
          patch.content = content;
          patch.managerVersion = content;
          patch.status = 'issued';
          patch.amendmentRequests = resolvePendingAmendmentRequests(
            minutes.amendmentRequests || [],
            'applied',
            session.profile.uid,
            toTrimmedString(body.managerResponse),
          );
          patch.lastAmendmentDeclineReason = admin.firestore.FieldValue.delete();
        } else if (action === 'decline_amendment' && isManager) {
          patch.status = 'issued';
          patch.amendmentRequests = resolvePendingAmendmentRequests(
            minutes.amendmentRequests || [],
            'declined',
            session.profile.uid,
            toTrimmedString(body.declineReason),
          );
          patch.lastAmendmentDeclineReason = toTrimmedString(body.declineReason) || '';
        } else if (action === 'manager_update' && isManager) {
          patch.content = toTrimmedString(body.content) || minutes.content;
          patch.managerVersion = patch.content;
          patch.status = 'issued';
          if ((minutes.amendmentRequests || []).some((item) => !item.status || item.status === 'pending')) {
            patch.amendmentRequests = resolvePendingAmendmentRequests(
              minutes.amendmentRequests || [],
              'applied',
              session.profile.uid,
              '',
            );
          }
        } else if ((action === 'approve' || action === 'sign_off') && isEmployee) {
          patch.status = 'signed_off';
          patch.signedOffAt = now;
          patch.signedOffByUid = session.profile.uid;
          patch.disputed = false;
        } else {
          res.status(403).json({ error: 'Action not allowed for this user.' });
          return;
        }

        await minutesSnap.ref.update(patch);
        await appendEvent(minutes.caseId, `minutes_${action}`, { minutesId }, session.profile);

        if (action === 'amend') {
          await db.collection('disciplinary_cases').doc(minutes.caseId).update({
            status: 'pending_manager',
            updatedAt: now,
          });
        } else if (['sign_off', 'approve'].includes(action)) {
          // Sign-off is optional confirmation — do not park the case as waiting.
          await db.collection('disciplinary_cases').doc(minutes.caseId).update({
            status: 'open',
            updatedAt: now,
          });
        } else if (['apply_amendment', 'decline_amendment', 'manager_update'].includes(action) && isManager) {
          // Re-issued notes remain non-blocking for case progress.
          await db.collection('disciplinary_cases').doc(minutes.caseId).update({
            status: 'open',
            updatedAt: now,
          });
        }

        const messages = {
          amend: 'Amendment request sent to the investigator.',
          sign_off: 'Notes signed off as accurate.',
          approve: 'Notes signed off as accurate.',
          apply_amendment: 'Amended notes sent back to the employee for sign-off.',
          decline_amendment: 'Amendment declined — original notes sent back to the employee.',
          manager_update: 'Notes updated and sent back to the employee.',
        };
        res.status(200).json({ message: messages[action] || 'Minutes updated.' });
      } catch (error) {
        console.error('respondCaseMinutes failed', error);
        res.status(500).json({ error: 'Failed to update minutes.' });
      }
    }),
  );

  const createCaseReview = onRequest(
    { region: 'europe-west2' },
    withCors(async (req, res) => {
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed.' });
        return;
      }
      const session = await getVerifiedSessionUser(req);
      if (!assertManager(session, res)) return;
      const body = req.body || {};
      const caseId = toTrimmedString(body.caseId);
      const dueAt = toTrimmedString(body.dueAt);
      const title = toTrimmedString(body.title) || 'Scheduled review';
      if (!caseId || !dueAt) {
        res.status(400).json({ error: 'caseId and dueAt are required.' });
        return;
      }
      try {
        const caseSnap = await loadCaseOrFail(caseId, res);
        if (!caseSnap) return;
        const ref = await db.collection('case_reviews').add({
          caseId,
          employeeUid: caseSnap.data().employeeUid,
          title,
          notes: toTrimmedString(body.notes),
          dueAt,
          status: 'open',
          completedAt: null,
          completedByUid: '',
          createdByUid: session.profile.uid,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        await appendEvent(caseId, 'review_scheduled', { reviewId: ref.id, dueAt, title }, session.profile);
        const caseData = caseSnap.data() || {};
        const calendarEvent = calendarEventFromOptions(
          `review-${caseId}-${dueAt}.ics`,
          {
            uid: `review-${caseId}-${ref.id}@countrylion.co.uk`,
            summary: `${title} — ${caseData.employeeNameSnapshot || caseData.title || caseId}`,
            description: [
              `Case: ${caseData.title || caseId}`,
              toTrimmedString(body.notes) ? `Notes: ${toTrimmedString(body.notes)}` : '',
              'Review meeting scheduled via Employee Portal.',
            ].filter(Boolean).join('\n'),
            startDate: dueAt,
          },
        );
        res.status(200).json({
          id: ref.id,
          message: 'Review scheduled. Use Add to Outlook to put it in your calendar.',
          calendarEvents: [calendarEvent],
        });
      } catch (error) {
        console.error('createCaseReview failed', error);
        res.status(500).json({ error: 'Failed to schedule review.' });
      }
    }),
  );

  const completeCaseReview = onRequest(
    { region: 'europe-west2' },
    withCors(async (req, res) => {
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed.' });
        return;
      }
      const session = await getVerifiedSessionUser(req);
      if (!assertManager(session, res)) return;
      const reviewId = toTrimmedString(req.body?.reviewId);
      if (!reviewId) {
        res.status(400).json({ error: 'reviewId is required.' });
        return;
      }
      try {
        const snap = await db.collection('case_reviews').doc(reviewId).get();
        if (!snap.exists) {
          res.status(404).json({ error: 'Review not found.' });
          return;
        }
        await snap.ref.update({
          status: 'completed',
          completedAt: admin.firestore.FieldValue.serverTimestamp(),
          completedByUid: session.profile.uid,
          completionNotes: toTrimmedString(req.body?.notes),
        });
        await appendEvent(snap.data().caseId, 'review_completed', { reviewId }, session.profile);
        res.status(200).json({ message: 'Review completed.' });
      } catch (error) {
        console.error('completeCaseReview failed', error);
        res.status(500).json({ error: 'Failed to complete review.' });
      }
    }),
  );

  const getEmployeeCaseActions = onRequest(
    { region: 'europe-west2' },
    withCors(async (req, res) => {
      if (req.method !== 'GET') {
        res.status(405).json({ error: 'Method not allowed.' });
        return;
      }
      const session = await getVerifiedSessionUser(req);
      if (!session) {
        res.status(401).json({ error: 'Authentication required.' });
        return;
      }
      const uid = session.profile.uid;
      try {
        const [minutesSnap, casesSnap, promptsSnap, docsSnap] = await Promise.all([
          db.collection('case_minutes').where('employeeUid', '==', uid).get(),
          db.collection('disciplinary_cases').where('employeeUid', '==', uid).limit(50).get(),
          db.collection('bump_card_prompts').where('employeeUid', '==', uid).where('status', '==', 'open').get(),
          db.collection('disciplinary_documents').where('employeeUid', '==', uid).limit(100).get(),
        ]);

        const pendingMinutes = minutesSnap.docs
          .map((doc) => ({ id: doc.id, ...doc.data(), createdAt: serializeTimestamp(doc.data().createdAt) }))
          .filter((item) => item.status === 'issued');

        const casesById = Object.fromEntries(
          casesSnap.docs.map((doc) => [doc.id, { id: doc.id, ...doc.data() }]),
        );
        const cases = casesSnap.docs.map((doc) => serializeEmployeeOwnCase(doc));
        const prompts = promptsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        const allEmployeeDocs = docsSnap.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
          createdAt: serializeTimestamp(doc.data().createdAt),
          issuedToEmployeeAt: serializeTimestamp(doc.data().issuedToEmployeeAt),
          managerSignature: doc.data().managerSignature || null,
          employeeSignature: doc.data().employeeSignature || null,
        }));

        const hearingManagerCache = {};
        const documents = [];
        for (const item of allEmployeeDocs) {
          const caseData = casesById[item.caseId] || {};
          const caseHasHearingInvite = Boolean(caseData.hearingInviteIssuedAt);
          const include = (
            (item.documentType === 'file_note_for_improvement' && item.issuedToEmployeeAt)
            || (['invite', 'letter', 'warning', 'outcome', 'suspension_letter', 'training_outline', 'pip_plan'].includes(item.documentType)
              && Boolean(item.issuedToEmployeeAt || item.documentType === 'invite'))
            || (Boolean(item.issuedToEmployeeAt) && ['minutes', 'evidence', 'other'].includes(item.documentType))
            || (caseHasHearingInvite && isHearingEvidenceDocument(item))
          );
          if (!include) continue;

          if (
            (item.documentType === 'invite' || item.source === 'hearing_invite')
            && !portalHtmlHasLetterhead(item.portalHtml)
          ) {
            let hearingManagerName = '';
            const hearingManagerUid = toTrimmedString(caseData.hearingManagerUid);
            if (hearingManagerUid) {
              if (!Object.prototype.hasOwnProperty.call(hearingManagerCache, hearingManagerUid)) {
                // eslint-disable-next-line no-await-in-loop
                const manager = await getUserProfile(hearingManagerUid);
                hearingManagerCache[hearingManagerUid] = manager?.fullName || '';
              }
              hearingManagerName = hearingManagerCache[hearingManagerUid] || '';
            }
            const relatedForCase = allEmployeeDocs.filter((doc) => doc.caseId === item.caseId);
            const refreshedHtml = rebuildHearingInvitePortalHtml({
              caseData,
              inviteDoc: item,
              relatedDocuments: relatedForCase,
              hearingManagerName,
            });
            item.portalHtml = refreshedHtml;
            // Persist so the employee keeps seeing the letterheaded version.
            // eslint-disable-next-line no-await-in-loop
            await db.collection('disciplinary_documents').doc(item.id).update({
              portalHtml: refreshedHtml,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            }).catch((err) => {
              console.error('Failed to refresh hearing invite portalHtml', item.id, err);
            });
          }

          documents.push(item);
        }

        const pendingFileNotes = documents.filter(
          (item) => item.documentType === 'file_note_for_improvement'
            && item.employeeSignStatus === 'pending',
        );
        const pendingWarnings = documents.filter(
          (item) => item.employeeSignStatus === 'pending'
            && (
              item.documentType === 'warning'
              || item.documentType === 'outcome'
              || item.requiresEmployeeSignature
            ),
        );

        const pendingHearingInvites = cases
          .filter((item) => item.hearingInviteIssuedAt && ['hearing_invite', 'hearing'].includes(item.stage))
          .map((item) => {
            const evidenceDocuments = documents
              .filter((doc) => doc.caseId === item.id && isHearingEvidenceDocument(doc))
              .map((doc) => ({
                id: doc.id,
                caseId: doc.caseId,
                fileName: doc.fileName || 'Evidence document',
                documentType: doc.documentType || 'evidence',
                mimeType: doc.mimeType || '',
                canDownload: Boolean(doc.portalHtml || doc.sharePointItemId || doc.sharePointWebUrl),
              }));
            return {
              caseId: item.id,
              title: item.title,
              hearingScheduledAt: item.hearingScheduledAt || '',
              hearingScheduledTime: item.hearingScheduledTime || '',
              hearingLocation: item.hearingLocation || '',
              hearingInviteDocumentId: item.hearingInviteDocumentId || '',
              evidenceDocuments,
            };
          });

        res.status(200).json({
          pendingMinutes,
          pendingFileNotes,
          pendingWarnings,
          cases,
          bumpPrompts: prompts,
          documents,
          pendingHearingInvites,
          badgeCount: pendingMinutes.length
            + prompts.length
            + pendingHearingInvites.length
            + pendingFileNotes.length
            + pendingWarnings.length,
        });
      } catch (error) {
        console.error('getEmployeeCaseActions failed', error);
        res.status(500).json({ error: 'Failed to load actions.' });
      }
    }),
  );

  const downloadEmployeeCaseDocument = onRequest(
    { region: 'europe-west2' },
    withCors(async (req, res) => {
      if (req.method !== 'POST' && req.method !== 'GET') {
        res.status(405).json({ error: 'Method not allowed.' });
        return;
      }
      const session = await getVerifiedSessionUser(req);
      if (!session) {
        res.status(401).json({ error: 'Authentication required.' });
        return;
      }

      const documentId = toTrimmedString(
        req.method === 'GET' ? req.query?.documentId : req.body?.documentId,
      );
      if (!documentId) {
        res.status(400).json({ error: 'documentId is required.' });
        return;
      }

      try {
        const docSnap = await db.collection('disciplinary_documents').doc(documentId).get();
        if (!docSnap.exists) {
          res.status(404).json({ error: 'Document not found.' });
          return;
        }
        const doc = { id: docSnap.id, ...docSnap.data() };
        if (toTrimmedString(doc.employeeUid) !== toTrimmedString(session.profile.uid)) {
          res.status(403).json({ error: 'You can only open documents issued for your own cases.' });
          return;
        }

        const caseSnap = doc.caseId
          ? await db.collection('disciplinary_cases').doc(doc.caseId).get()
          : null;
        const caseData = caseSnap?.exists ? caseSnap.data() : {};
        const caseHasHearingInvite = Boolean(caseData.hearingInviteIssuedAt);
        const alwaysVisible = ['invite', 'letter', 'warning', 'outcome', 'suspension_letter', 'training_outline', 'pip_plan', 'file_note_for_improvement'].includes(
          toTrimmedString(doc.documentType).toLowerCase(),
        );
        const allowed = alwaysVisible
          || Boolean(doc.issuedToEmployeeAt)
          || (caseHasHearingInvite && isHearingEvidenceDocument(doc));
        if (!allowed) {
          res.status(403).json({ error: 'This document is not available in your portal yet.' });
          return;
        }

        if (doc.portalHtml) {
          res.status(200).json({
            id: doc.id,
            fileName: doc.fileName || 'Document.html',
            mimeType: 'text/html',
            portalHtml: doc.portalHtml,
          });
          return;
        }

        const itemId = toTrimmedString(doc.sharePointItemId);
        if (itemId && isSharePointConfigured(getSharePointConfig())) {
          const content = await downloadDriveItemContent(getSharePointConfig(), itemId);
          const buffer = content?.buffer;
          if (!buffer || !buffer.length) {
            res.status(404).json({ error: 'Document file could not be downloaded.' });
            return;
          }
          res.status(200).json({
            id: doc.id,
            fileName: doc.fileName || 'document',
            mimeType: content.contentType || doc.mimeType || 'application/octet-stream',
            contentBase64: Buffer.from(buffer).toString('base64'),
          });
          return;
        }

        if (doc.sharePointWebUrl) {
          res.status(200).json({
            id: doc.id,
            fileName: doc.fileName || 'document',
            mimeType: doc.mimeType || 'application/octet-stream',
            sharePointWebUrl: doc.sharePointWebUrl,
          });
          return;
        }

        res.status(404).json({ error: 'No downloadable file is attached to this document.' });
      } catch (error) {
        console.error('downloadEmployeeCaseDocument failed', error);
        res.status(500).json({ error: 'Failed to download document.' });
      }
    }),
  );

  const signFileNoteDocument = onRequest(
    { region: 'europe-west2' },
    withCors(async (req, res) => {
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed.' });
        return;
      }
      const session = await getVerifiedSessionUser(req);
      if (!session) {
        res.status(401).json({ error: 'Authentication required.' });
        return;
      }

      const documentId = toTrimmedString(req.body?.documentId);
      if (!documentId) {
        res.status(400).json({ error: 'documentId is required.' });
        return;
      }

      try {
        const docSnap = await db.collection('disciplinary_documents').doc(documentId).get();
        if (!docSnap.exists) {
          res.status(404).json({ error: 'Document not found.' });
          return;
        }
        const docData = docSnap.data();
        const isFileNote = docData.documentType === 'file_note_for_improvement';
        const isLegacyWarning = docData.documentType === 'warning';
        const isOutcomeWarning = docData.documentType === 'outcome'
          && (docData.requiresEmployeeSignature || docData.employeeSignStatus === 'pending' || docData.employeeSignStatus === 'signed');
        const isWarningSignable = isLegacyWarning || isOutcomeWarning;
        if (!isFileNote && !isWarningSignable) {
          res.status(400).json({ error: 'This document cannot be digitally signed here.' });
          return;
        }
        if (docData.employeeUid !== session.profile.uid) {
          res.status(403).json({ error: 'Only the employee named on this document can sign it.' });
          return;
        }
        if (docData.employeeSignStatus === 'signed' || docData.employeeSignature?.signedAt) {
          res.status(400).json({ error: 'This document has already been signed.' });
          return;
        }

        const managerSignature = docData.managerSignature || null;
        const signedAt = new Date();
        const employeeSignature = {
          signedByUid: session.profile.uid,
          signedByName: session.profile.fullName || session.profile.email || 'Employee',
          signedAt: signedAt.toISOString(),
          signedAtLabel: formatUkDateTime(signedAt),
          method: 'portal_employee',
        };

        // Prefer employee name from the case when available.
        let employeeName = '';
        let caseData = {};
        const caseSnap = await db.collection('disciplinary_cases').doc(docData.caseId).get();
        if (caseSnap.exists) {
          caseData = caseSnap.data() || {};
          employeeName = caseData.employeeNameSnapshot || '';
        }

        let finalHtml = '';
        let signedFileName = docData.fileName || '';
        if (isFileNote) {
          finalHtml = buildFileNoteForImprovementHtml({
            employeeName: employeeName || employeeSignature.signedByName,
            managerName: managerSignature?.signedByName || '',
            reason: docData.fileNoteReason || '',
            actionRequired: docData.fileNoteActionRequired || '',
            issuedAtLabel: caseData.fileNoteIssuedAt?.toDate
              ? caseData.fileNoteIssuedAt.toDate().toLocaleDateString('en-GB')
              : new Date().toLocaleDateString('en-GB'),
            managerSignature,
            employeeSignature,
          });
          signedFileName = `File note for improvement - signed ${signedAt.toISOString().slice(0, 10)}.html`;
        } else if (isOutcomeWarning) {
          const presetId = docData.warningPresetId || caseData.outcomePreset || 'written_warning';
          const presetLabel = docData.warningPresetLabel
            || outcomePresetById(presetId)?.label
            || 'Written warning';
          const durationMonths = docData.warningDurationMonths || caseData.warningDurationMonths;
          const appealDeadlineLabel = docData.appealDeadlineLabel
            || (caseData.appealWindowEndsAt
              ? String(caseData.appealWindowEndsAt).slice(0, 10).split('-').reverse().join('/')
              : '');
          finalHtml = buildOutcomeLetterHtml({
            employeeName: employeeName || employeeSignature.signedByName,
            caseTitle: caseData.title || '',
            presetLabel,
            outcomeDetails: docData.outcomeDetails || caseData.outcomeDetails || '',
            evidenceConsideration: docData.evidenceConsideration || caseData.evidenceConsideration || '',
            expectedStandard: docData.expectedStandard || caseData.expectedStandard || '',
            supportMonitoringRetraining: docData.supportMonitoringRetraining || caseData.supportMonitoringRetraining || '',
            reviewDates: Array.isArray(docData.reviewDates) ? docData.reviewDates : [],
            restrictionType: docData.restrictionType || caseData.restrictionType || '',
            restrictionDetail: docData.restrictionDetail || caseData.restrictionDetail || '',
            restrictionExpiresAt: docData.restrictionExpiresAt || caseData.restrictionExpiresAt || '',
            warningEffectiveAt: docData.warningEffectiveAt || caseData.warningEffectiveAt || '',
            warningExpiresAt: docData.warningExpiresAt || caseData.warningExpiresAt || '',
            durationLabel: durationMonths ? `${durationMonths} months` : '',
            issuedByName: managerSignature?.signedByName || caseData.warningIssuedByName || 'Management',
            issuedAtLabel: caseData.outcomeIssuedAt?.toDate
              ? caseData.outcomeIssuedAt.toDate().toLocaleDateString('en-GB')
              : new Date().toLocaleDateString('en-GB'),
            appealRecipientName: docData.appealRecipientName || caseData.appealRecipientNameSnapshot || '',
            appealDeadlineLabel,
            managerSignature,
            employeeSignature,
            requiresEmployeeSignature: true,
            warningTitle: docData.warningTitle || caseData.warningTitle || '',
          });
          signedFileName = `${docData.warningTitle || presetLabel} - signed ${signedAt.toISOString().slice(0, 10)}.html`;
        } else {
          const presetId = docData.warningPresetId || caseData.outcomePreset || 'written_warning';
          const presetLabel = docData.warningPresetLabel
            || outcomePresetById(presetId)?.label
            || 'Written warning';
          const durationMonths = docData.warningDurationMonths || caseData.warningDurationMonths;
          finalHtml = buildWarningDocumentHtml({
            employeeName: employeeName || employeeSignature.signedByName,
            caseTitle: caseData.title || '',
            presetLabel,
            presetId,
            outcomeDetails: docData.outcomeDetails || caseData.outcomeDetails || '',
            warningEffectiveAt: docData.warningEffectiveAt || caseData.warningEffectiveAt || '',
            warningExpiresAt: docData.warningExpiresAt || caseData.warningExpiresAt || '',
            durationLabel: durationMonths ? `${durationMonths} months` : '',
            issuedByName: managerSignature?.signedByName || caseData.warningIssuedByName || 'Management',
            issuedAtLabel: caseData.outcomeIssuedAt?.toDate
              ? caseData.outcomeIssuedAt.toDate().toLocaleDateString('en-GB')
              : new Date().toLocaleDateString('en-GB'),
            managerSignature,
            employeeSignature,
          });
          signedFileName = `${presetLabel} - signed ${signedAt.toISOString().slice(0, 10)}.html`;
        }

        const now = admin.firestore.FieldValue.serverTimestamp();
        let sharePointWebUrl = docData.sharePointWebUrl || '';
        let sharePointItemId = docData.sharePointItemId || '';
        let sharePointFolderPath = docData.sharePointFolderPath || '';
        let storageProvider = docData.storageProvider || 'portal';

        if (typeof uploadDisciplinaryDocument === 'function' && isSharePointConfigured(getSharePointConfig()) && caseSnap.exists) {
          try {
            const employee = await getUserProfile(docData.employeeUid);
            if (employee) {
              const uploadResult = await uploadDisciplinaryDocument(getSharePointConfig(), {
                fullName: employee.fullName || caseData.employeeNameSnapshot || '',
                isActive: employee.isActive !== false,
                sharePointFolderName: employee.sharePointFolderName || '',
                employeeRoot: employee.sharePointEmployeeRoot || '',
                caseFolderName: await stampSharePointCaseFolderName(caseSnap.ref, caseData),
                fileName: signedFileName,
                fileBuffer: Buffer.from(finalHtml, 'utf8'),
                mimeType: 'text/html',
              });
              sharePointWebUrl = uploadResult.sharePointWebUrl || sharePointWebUrl;
              sharePointItemId = uploadResult.sharePointItemId || sharePointItemId;
              sharePointFolderPath = uploadResult.folderPath || sharePointFolderPath;
              storageProvider = 'sharepoint';
            }
          } catch (spError) {
            console.error('Signed document SharePoint upload failed; keeping portal copy', spError);
          }
        }

        await docSnap.ref.update({
          portalHtml: finalHtml,
          fileName: signedFileName || docData.fileName,
          employeeSignature,
          employeeSignStatus: 'signed',
          signedCopy: true,
          signedAt: now,
          sharePointWebUrl,
          sharePointItemId,
          sharePointFolderPath,
          storageProvider,
          updatedAt: now,
        });

        if (caseSnap.exists) {
          const casePatch = {
            status: 'closed',
            updatedAt: now,
          };
          if (isFileNote) {
            casePatch.fileNoteEmployeeSignStatus = 'signed';
            casePatch.fileNoteEmployeeSignedAt = employeeSignature.signedAt;
            casePatch.fileNoteSignedDocumentId = documentId;
            casePatch.fileNoteSignedAt = now;
          } else {
            casePatch.warningEmployeeSignStatus = 'signed';
            casePatch.warningEmployeeSignedAt = employeeSignature.signedAt;
            casePatch.warningSignedDocumentId = documentId;
            casePatch.warningSignedAt = now;
          }
          await caseSnap.ref.update(casePatch);
          await appendEvent(docData.caseId, isFileNote ? 'file_note_employee_signed' : 'warning_employee_signed', {
            documentId,
            signedAt: employeeSignature.signedAt,
            signedByUid: session.profile.uid,
            documentType: docData.documentType,
          }, session.profile);
        }

        res.status(200).json({
          message: isFileNote ? 'File note digitally signed.' : 'Outcome letter digitally signed.',
          documentId,
          portalHtml: finalHtml,
          employeeSignature,
        });
      } catch (error) {
        console.error('signFileNoteDocument failed', error);
        res.status(500).json({ error: 'Failed to sign document.' });
      }
    }),
  );

  const createBumpCardPrompt = onRequest(
    { region: 'europe-west2' },
    withCors(async (req, res) => {
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed.' });
        return;
      }
      const session = await getVerifiedSessionUser(req);
      if (!assertManager(session, res)) return;
      const employeeUid = toTrimmedString(req.body?.employeeUid);
      if (!employeeUid) {
        res.status(400).json({ error: 'employeeUid is required.' });
        return;
      }
      try {
        const employee = await getUserProfile(employeeUid);
        if (!employee) {
          res.status(404).json({ error: 'Employee not found.' });
          return;
        }
        const ref = await db.collection('bump_card_prompts').add({
          employeeUid,
          employeeNameSnapshot: employee.fullName || '',
          notes: toTrimmedString(req.body?.notes),
          status: 'open',
          createdByUid: session.profile.uid,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        res.status(200).json({ id: ref.id, message: 'Driver prompted to complete bump card.' });
      } catch (error) {
        console.error('createBumpCardPrompt failed', error);
        res.status(500).json({ error: 'Failed to create prompt.' });
      }
    }),
  );

  const submitBumpCard = onRequest(
    { region: 'europe-west2' },
    withCors(async (req, res) => {
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed.' });
        return;
      }
      const session = await getVerifiedSessionUser(req);
      if (!session) {
        res.status(401).json({ error: 'Authentication required.' });
        return;
      }
      const body = req.body || {};
      const targetUid = toTrimmedString(body.employeeUid) || session.profile.uid;
      const isManager = canManageCases(session.profile, getEffectivePortalRole);
      if (targetUid !== session.profile.uid && !isManager) {
        res.status(403).json({ error: 'Insufficient access.' });
        return;
      }
      try {
        const employee = await getUserProfile(targetUid);
        if (!employee) {
          res.status(404).json({ error: 'Employee not found.' });
          return;
        }
        const now = admin.firestore.FieldValue.serverTimestamp();
        const bump = {
          employeeUid: targetUid,
          employeeNameSnapshot: employee.fullName || '',
          incidentAt: toTrimmedString(body.incidentAt) || new Date().toISOString(),
          location: toTrimmedString(body.location),
          vehicleReg: toTrimmedString(body.vehicleReg),
          description: toTrimmedString(body.description),
          injuries: toTrimmedString(body.injuries),
          thirdParty: toTrimmedString(body.thirdParty),
          weather: toTrimmedString(body.weather),
          policeInvolved: Boolean(body.policeInvolved),
          createdByUid: session.profile.uid,
          createdAt: now,
        };
        const bumpRef = await db.collection('bump_cards').add(bump);

        const caseDoc = await db.collection('disciplinary_cases').add({
          employeeUid: targetUid,
          employeeNameSnapshot: employee.fullName || '',
          departmentSnapshot: employee.employeeProfile?.department || '',
          managerUid: session.profile.uid,
          ownerManagerUid: isManager ? session.profile.uid : (employee.managerUid || session.profile.uid),
          managerNameSnapshot: session.profile.fullName || '',
          processFamily: 'vehicle_accident',
          caseType: 'vehicle_accident',
          title: `Vehicle accident — ${employee.fullName || targetUid}`,
          summary: bump.description,
          status: 'open',
          stage: 'triage',
          bumpCardId: bumpRef.id,
          origin: 'bump_card',
          openedAt: now,
          createdAt: now,
          updatedAt: now,
          createdByUid: session.profile.uid,
          updatedByUid: session.profile.uid,
          suspensionActive: false,
          outcomePackSteps: [],
        });

        await stampSharePointCaseFolderName(caseDoc, {
          title: `Vehicle accident — ${employee.fullName || targetUid}`,
          openedAt: new Date(),
          incidentAt: bump.incidentAt,
        });

        await bumpRef.update({ caseId: caseDoc.id });

        const openPrompts = await db.collection('bump_card_prompts')
          .where('employeeUid', '==', targetUid)
          .where('status', '==', 'open')
          .get();
        const batch = db.batch();
        openPrompts.docs.forEach((doc) => {
          batch.update(doc.ref, { status: 'completed', completedAt: now, caseId: caseDoc.id });
        });
        await batch.commit();

        await appendEvent(caseDoc.id, 'bump_card_submitted', { bumpCardId: bumpRef.id }, session.profile);
        res.status(200).json({ bumpCardId: bumpRef.id, caseId: caseDoc.id, message: 'Bump card submitted.' });
      } catch (error) {
        console.error('submitBumpCard failed', error);
        res.status(500).json({ error: 'Failed to submit bump card.' });
      }
    }),
  );

  const downloadCaseDocumentTemplate = onRequest(
    { region: 'europe-west2' },
    withCors(async (req, res) => {
      if (req.method !== 'GET' && req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed.' });
        return;
      }
      const session = await getVerifiedSessionUser(req);
      if (!assertManager(session, res)) return;
      const body = req.method === 'POST' ? (req.body || {}) : (req.query || {});
      const caseId = toTrimmedString(body.caseId);
      const templateId = toTrimmedString(body.templateId);
      const allowSeed = body.allowSeed !== false;
      if (!caseId || !templateId) {
        res.status(400).json({ error: 'caseId and templateId are required.' });
        return;
      }
      try {
        if (!isSharePointConfigured(getSharePointConfig())) {
          res.status(503).json({ error: 'SharePoint is not configured. Templates are stored in Employee Files/Templates.' });
          return;
        }
        const caseSnap = await loadCaseOrFail(caseId, res);
        if (!caseSnap) return;
        const caseData = caseSnap.data();
        const template = CASE_DOCUMENT_TEMPLATES.find((item) => item.id === templateId);
        if (!template) {
          res.status(404).json({ error: 'Template not found.' });
          return;
        }

        const investigatorUid = toTrimmedString(caseData.investigatorUid);
        const hearingManagerUid = toTrimmedString(caseData.hearingManagerUid);
        const appealOwnerUid = toTrimmedString(caseData.appealOwnerUid || caseData.decisionMakerUid);
        const [investigator, hearingManager, appealOwner] = await Promise.all([
          investigatorUid ? getUserProfile(investigatorUid) : null,
          hearingManagerUid ? getUserProfile(hearingManagerUid) : null,
          appealOwnerUid ? getUserProfile(appealOwnerUid) : null,
        ]);

        const rawPresentUids = Array.isArray(body.managersPresentUids)
          ? body.managersPresentUids.map(toTrimmedString).filter(Boolean)
          : [];
        const presentUids = [...new Set(rawPresentUids)];
        const managersPresent = [];
        for (const uid of presentUids) {
          const profile = await getUserProfile(uid);
          managersPresent.push({
            uid,
            name: profile?.fullName || profile?.email || uid,
          });
        }

        const fills = buildTemplateFillContext({
          caseData: { ...caseData, id: caseId },
          sessionProfile: session.profile || {},
          investigator,
          hearingManager,
          appealOwner,
          managersPresent,
        });

        const placeholderFills = buildTemplateFillContext({ caseData: {} });
        const seedFileName = templateSeedFileName(template);
        const seedBuffer = await buildTemplateDocxBuffer({ template, fills: placeholderFills });
        const downloaded = await resolveAndDownloadCaseTemplate(getSharePointConfig(), template, allowSeed ? {
          seedBuffer,
          seedFileName,
          seedMimeType: DOCX_MIME_TYPE,
        } : {});

        const workingBuffer = await buildTemplateDocxBuffer({
          template,
          caseData: { ...caseData, id: caseId },
          fills,
        });

        const workingCopyName = templateFileName(template, {
          employeeNameSnapshot: fills.employeeName,
        });

        res.status(200).json({
          templateId: template.id,
          title: template.title,
          documentType: template.documentType,
          fileName: workingCopyName,
          masterFileName: downloaded.fileName,
          mimeType: DOCX_MIME_TYPE,
          contentBase64: workingBuffer.toString('base64'),
          sharePointWebUrl: downloaded.webUrl || '',
          templatesFolder: `Employee Files/${downloaded.templatesFolder || TEMPLATES_FOLDER_NAME}`,
          filledFields: {
            employeeName: fills.employeeName,
            letterDate: fills.letterDate,
            investigatorName: fills.investigatorName,
            hearingManagerName: fills.hearingManagerName,
            managersPresent: fills.managersPresentLabel,
            caseTitle: fills.caseTitle,
          },
          fillSource: 'generated_docx',
          message: 'Pre-filled working copy ready. Open in desktop Word — click each checkbox square to tick. Then upload to the case folder.',
        });
      } catch (error) {
        console.error('downloadCaseDocumentTemplate failed', error);
        res.status(error.code === 'template_missing' ? 404 : 500).json({
          error: error.message || 'Failed to download template from SharePoint.',
          code: error.code || 'template_download_failed',
          expectedNames: error.expectedNames || [],
          availableFiles: error.availableFiles || [],
        });
      }
    }),
  );

  const exportPeopleCase = onRequest(
    { region: 'europe-west2' },
    withCors(async (req, res) => {
      if (req.method !== 'GET') {
        res.status(405).json({ error: 'Method not allowed.' });
        return;
      }
      const session = await getVerifiedSessionUser(req);
      if (!assertManager(session, res)) return;
      const caseId = toTrimmedString(req.query?.caseId || req.path.split('/').pop());
      if (!caseId) {
        res.status(400).json({ error: 'caseId is required.' });
        return;
      }
      try {
        const caseSnap = await loadCaseOrFail(caseId, res);
        if (!caseSnap) return;
        const related = await listRelated(caseId);
        const payload = {
          exportedAt: new Date().toISOString(),
          exportedByUid: session.profile.uid,
          case: serializeCase(caseSnap),
          ...relatedForClient(related),
          guide: guideFor(
            caseSnap.data().processFamily || 'disciplinary',
            normalizeStage(caseSnap.data().processFamily || 'disciplinary', caseSnap.data().stage),
          ),
        };
        await appendEvent(caseId, 'case_exported', {}, session.profile);
        res.status(200).json(payload);
      } catch (error) {
        console.error('exportPeopleCase failed', error);
        res.status(500).json({ error: 'Failed to export case.' });
      }
    }),
  );

  const clearExpiredWarnings = onRequest(
    { region: 'europe-west2' },
    withCors(async (req, res) => {
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed.' });
        return;
      }
      const session = await getVerifiedSessionUser(req);
      if (!assertManager(session, res)) return;
      if (!canHrOverseeCases(session.profile, getEffectivePortalRole) && session.profile?.portalsAccess?.master_admin !== 'admin') {
        // Managers can clear individually; bulk is fine for managers too per plan.
      }
      try {
        const today = new Date().toISOString().slice(0, 10);
        const snap = await db.collection('disciplinary_cases')
          .where('warningExpiresAt', '<=', today)
          .limit(200)
          .get();
        let cleared = 0;
        for (const doc of snap.docs) {
          const data = doc.data();
          if (data.warningClearedAt) continue;
          if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data.warningExpiresAt || '').slice(0, 10))) continue;
          await doc.ref.update({
            warningClearedAt: admin.firestore.FieldValue.serverTimestamp(),
            warningClearedReason: 'expired',
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          await appendEvent(doc.id, 'warning_expired_cleared', {}, session.profile);
          cleared += 1;
        }
        res.status(200).json({ cleared, message: `Cleared ${cleared} expired warning(s).` });
      } catch (error) {
        console.error('clearExpiredWarnings failed', error);
        res.status(500).json({ error: 'Failed to clear expired warnings.' });
      }
    }),
  );

  const ACTIVE_MEASURE_PRESETS = new Set([
    'informal_action',
    'file_note_for_improvement',
    'verbal_warning',
    'written_warning',
    'final_written_warning',
    'pip',
  ]);
  const SIX_MONTH_MEASURE_PRESETS = new Set([
    'informal_action',
    'file_note_for_improvement',
  ]);

  function isIsoDateOnly(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '').slice(0, 10));
  }

  function toIsoDateOnly(value) {
    if (!value) return '';
    if (typeof value === 'string') {
      const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
      return match ? match[1] : '';
    }
    if (typeof value.toDate === 'function') {
      try {
        return value.toDate().toISOString().slice(0, 10);
      } catch (_) {
        return '';
      }
    }
    if (typeof value._seconds === 'number') {
      return new Date(value._seconds * 1000).toISOString().slice(0, 10);
    }
    if (typeof value.seconds === 'number') {
      return new Date(value.seconds * 1000).toISOString().slice(0, 10);
    }
    return '';
  }

  async function softClearExpiredMeasures(actorProfile) {
    const today = new Date().toISOString().slice(0, 10);
    const snap = await db.collection('disciplinary_cases')
      .where('warningExpiresAt', '<=', today)
      .limit(500)
      .get();
    let cleared = 0;
    for (const doc of snap.docs) {
      const data = doc.data() || {};
      if (data.warningClearedAt) continue;
      // Empty-string warningExpiresAt is stored on new cases and must NOT be treated as expired.
      if (!isIsoDateOnly(data.warningExpiresAt)) continue;
      if (String(data.warningExpiresAt).slice(0, 10) > today) continue;
      await doc.ref.update({
        warningClearedAt: admin.firestore.FieldValue.serverTimestamp(),
        warningClearedReason: 'expired',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      if (actorProfile) {
        await appendEvent(doc.id, 'warning_expired_cleared', {}, actorProfile);
      }
      cleared += 1;
    }
    return cleared;
  }

  function addMonthsIsoLocal(isoDate, months) {
    const text = toIsoDateOnly(isoDate);
    if (!text) return '';
    const date = new Date(`${text}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) return '';
    date.setUTCMonth(date.getUTCMonth() + Number(months || 0));
    return date.toISOString().slice(0, 10);
  }

  function measureGivenAt(item) {
    return toIsoDateOnly(item.warningEffectiveAt)
      || toIsoDateOnly(item.informalActionTakenAt)
      || toIsoDateOnly(item.fileNoteIssuedAt)
      || toIsoDateOnly(item.closedAt)
      || toIsoDateOnly(item.updatedAt)
      || toIsoDateOnly(item.createdAt)
      || '';
  }

  function measureExpiresAt(item) {
    // Informal / file-note live for 6 months from the given date.
    // Prefer the computed window so false-positive clears (empty warningExpiresAt) cannot hide them.
    if (SIX_MONTH_MEASURE_PRESETS.has(item.outcomePreset)) {
      const given = measureGivenAt(item);
      if (given) return addMonthsIsoLocal(given, 6);
    }
    if (isIsoDateOnly(item.warningExpiresAt)) {
      return String(item.warningExpiresAt).slice(0, 10);
    }
    return '';
  }

  function isSupersededMeasure(item) {
    return String(item.warningClearedReason || '') === 'superseded';
  }

  function isActiveDisciplinaryMeasure(item, today) {
    if (!item || !ACTIVE_MEASURE_PRESETS.has(item.outcomePreset)) return false;
    const family = item.processFamily || 'disciplinary';
    if (family !== 'disciplinary') return false;
    if (isSupersededMeasure(item)) return false;

    if (SIX_MONTH_MEASURE_PRESETS.has(item.outcomePreset)) {
      const expiresAt = measureExpiresAt(item);
      // If we cannot derive a given date, still show rather than hide a live informal/file note.
      if (expiresAt && expiresAt < today) return false;
      return true;
    }

    if (item.warningClearedAt) return false;
    const expiresAt = measureExpiresAt(item);
    if (expiresAt && expiresAt < today) return false;
    return true;
  }

  function measureReason(item) {
    return toTrimmedString(item.warningTitle)
      || toTrimmedString(item.issue)
      || toTrimmedString(item.informalActionDetails)
      || toTrimmedString(item.fileNoteReason)
      || toTrimmedString(item.outcomeDetails)
      || toTrimmedString(item.title)
      || '—';
  }

  const getActiveDisciplinaryMeasures = onRequest(
    { region: 'europe-west2' },
    withCors(async (req, res) => {
      if (req.method !== 'GET') {
        res.status(405).json({ error: 'Method not allowed.' });
        return;
      }
      const session = await getVerifiedSessionUser(req);
      if (!assertManager(session, res)) return;

      try {
        const today = new Date().toISOString().slice(0, 10);
        const employeeUidFilter = toTrimmedString(req.query?.employeeUid);
        let cleared = await softClearExpiredMeasures(session.profile);
        let restored = 0;

        const [usersSnap, casesSnap] = await Promise.all([
          employeeUidFilter
            ? db.collection('users').doc(employeeUidFilter).get().then((doc) => ({ docs: doc.exists ? [doc] : [] }))
            : db.collection('users').get(),
          employeeUidFilter
            ? db.collection('disciplinary_cases').where('employeeUid', '==', employeeUidFilter).get()
            : db.collection('disciplinary_cases').get(),
        ]);

        const employeesByUid = new Map();
        for (const doc of usersSnap.docs) {
          const data = doc.data() || {};
          if (data.isActive === false) continue;
          employeesByUid.set(doc.id, {
            uid: doc.id,
            fullName: data.fullName || data.email || 'Unknown',
            email: data.email || '',
            department: data.employeeProfile?.department || data.department || '',
            isActive: true,
          });
        }

        const measuresByEmployee = new Map();
        for (const doc of casesSnap.docs) {
          const item = serializeCase(doc);
          if (!ACTIVE_MEASURE_PRESETS.has(item.outcomePreset)) continue;
          if ((item.processFamily || 'disciplinary') !== 'disciplinary') continue;
          if (isSupersededMeasure(item)) continue;

          const expiresAt = measureExpiresAt(item);
          const active = isActiveDisciplinaryMeasure(item, today);

          // Restore false-positive expiry clears so case records stay consistent.
          if (item.warningClearedAt && active && !isSupersededMeasure(item)) {
            const reason = String(item.warningClearedReason || '');
            const shouldRestore = !reason
              || reason.startsWith('expired')
              || SIX_MONTH_MEASURE_PRESETS.has(item.outcomePreset);
            if (shouldRestore) {
              const given = measureGivenAt(item) || today;
              const patch = {
                warningClearedAt: admin.firestore.FieldValue.delete(),
                warningClearedReason: admin.firestore.FieldValue.delete(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              };
              if (SIX_MONTH_MEASURE_PRESETS.has(item.outcomePreset)) {
                patch.warningEffectiveAt = toIsoDateOnly(item.warningEffectiveAt) || given;
                patch.warningExpiresAt = expiresAt || addMonthsIsoLocal(given, 6);
                patch.warningDurationMonths = 6;
              }
              // eslint-disable-next-line no-await-in-loop
              await doc.ref.update(patch);
              // eslint-disable-next-line no-await-in-loop
              await appendEvent(doc.id, 'warning_expiry_restored', {
                outcomePreset: item.outcomePreset,
                reason: reason || 'missing_clear_reason',
              }, session.profile);
              item.warningClearedAt = null;
              item.warningClearedReason = '';
              if (patch.warningExpiresAt) item.warningExpiresAt = patch.warningExpiresAt;
              restored += 1;
            }
          }

          if (!active) {
            if (
              SIX_MONTH_MEASURE_PRESETS.has(item.outcomePreset)
              && expiresAt
              && expiresAt < today
              && !item.warningClearedAt
            ) {
              // eslint-disable-next-line no-await-in-loop
              await doc.ref.update({
                warningEffectiveAt: toIsoDateOnly(item.warningEffectiveAt) || measureGivenAt(item) || today,
                warningExpiresAt: expiresAt,
                warningDurationMonths: 6,
                warningClearedAt: admin.firestore.FieldValue.serverTimestamp(),
                warningClearedReason: 'expired',
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              });
              // eslint-disable-next-line no-await-in-loop
              await appendEvent(doc.id, 'warning_expired_cleared', { outcomePreset: item.outcomePreset }, session.profile);
              cleared += 1;
            }
            continue;
          }

          if (item.warningClearedAt) {
            // Still marked cleared after restore attempt — do not show.
            continue;
          }

          if (SIX_MONTH_MEASURE_PRESETS.has(item.outcomePreset) && expiresAt) {
            const storedExpiry = toIsoDateOnly(item.warningExpiresAt);
            const storedEffective = toIsoDateOnly(item.warningEffectiveAt);
            const given = measureGivenAt(item) || today;
            if (storedExpiry !== expiresAt || !storedEffective || Number(item.warningDurationMonths) !== 6) {
              // eslint-disable-next-line no-await-in-loop
              await doc.ref.update({
                warningEffectiveAt: storedEffective || given,
                warningExpiresAt: expiresAt,
                warningDurationMonths: 6,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              });
            }
          }

          const preset = outcomePresetById(item.outcomePreset);
          const measure = {
            caseId: item.id,
            outcomePreset: item.outcomePreset,
            measureType: preset?.label || item.outcomePreset,
            reason: measureReason(item),
            givenAt: measureGivenAt(item),
            expiresAt: expiresAt || '',
            durationMonths: item.warningDurationMonths
              || (SIX_MONTH_MEASURE_PRESETS.has(item.outcomePreset) ? 6 : null),
            title: item.title || '',
            employeeNameSnapshot: item.employeeNameSnapshot || '',
          };
          if (!item.employeeUid) continue;
          const list = measuresByEmployee.get(item.employeeUid) || [];
          list.push(measure);

          // Soft-clear and/or surface optional outcome restrictions.
          if (item.restrictionActive && item.restrictionType) {
            const restrictionExpires = String(item.restrictionExpiresAt || '').slice(0, 10);
            if (restrictionExpires && restrictionExpires < today && !item.restrictionClearedAt) {
              // eslint-disable-next-line no-await-in-loop
              await doc.ref.update({
                restrictionActive: false,
                restrictionClearedAt: admin.firestore.FieldValue.serverTimestamp(),
                restrictionClearedReason: 'expired',
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              });
              // eslint-disable-next-line no-await-in-loop
              await appendEvent(doc.id, 'restriction_expired_cleared', {
                restrictionType: item.restrictionType,
              }, session.profile);
              cleared += 1;
            } else if (isActiveRestriction(item, today)) {
              list.push(restrictionMeasureFromCase(item));
            }
          }

          measuresByEmployee.set(item.employeeUid, list);
        }

        // Cases with only a restriction (e.g. NFA + restriction) still need a pass when
        // outcome preset is outside ACTIVE_MEASURE_PRESETS.
        for (const doc of casesSnap.docs) {
          const item = serializeCase(doc);
          if ((item.processFamily || 'disciplinary') !== 'disciplinary') continue;
          if (!item.employeeUid || !item.restrictionType) continue;
          if (ACTIVE_MEASURE_PRESETS.has(item.outcomePreset)) continue; // already handled above
          if (!isActiveRestriction(item, today)) {
            const restrictionExpires = String(item.restrictionExpiresAt || '').slice(0, 10);
            if (
              item.restrictionActive
              && restrictionExpires
              && restrictionExpires < today
              && !item.restrictionClearedAt
            ) {
              // eslint-disable-next-line no-await-in-loop
              await doc.ref.update({
                restrictionActive: false,
                restrictionClearedAt: admin.firestore.FieldValue.serverTimestamp(),
                restrictionClearedReason: 'expired',
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              });
              cleared += 1;
            }
            continue;
          }
          const list = measuresByEmployee.get(item.employeeUid) || [];
          if (!list.some((m) => m.isRestriction && m.caseId === item.id)) {
            list.push(restrictionMeasureFromCase(item));
            measuresByEmployee.set(item.employeeUid, list);
          }
        }
        for (const list of measuresByEmployee.values()) {
          list.sort((left, right) => String(right.givenAt || '').localeCompare(String(left.givenAt || '')));
        }

        const employeeUids = new Set([
          ...employeesByUid.keys(),
          ...measuresByEmployee.keys(),
        ]);
        const rows = [...employeeUids]
          .map((uid) => {
            const employee = employeesByUid.get(uid);
            const measures = measuresByEmployee.get(uid) || [];
            return {
              employeeUid: uid,
              employeeName: employee?.fullName || measures[0]?.employeeNameSnapshot || 'Unknown employee',
              employeeEmail: employee?.email || '',
              department: employee?.department || '',
              measures,
            };
          })
          .sort((a, b) => String(a.employeeName).localeCompare(String(b.employeeName)));

        res.status(200).json({
          today,
          clearedExpired: cleared,
          restored,
          rows,
          ...(employeeUidFilter ? {
            employeeUid: employeeUidFilter,
            items: rows[0]?.measures || [],
          } : {}),
        });
      } catch (error) {
        console.error('getActiveDisciplinaryMeasures failed', error);
        res.status(500).json({ error: 'Failed to load active disciplinary measures.' });
      }
    }),
  );

  const BONUS_DEDUCTION_AMOUNTS = {
    written_warning: 50,
    final_written_warning: 100,
  };

  const {
    DEFAULT_BASE_BONUS,
    DEFAULT_FULL_TIME_HOURS_PER_WEEK,
    DEFAULT_FULL_TIME_WEEKS_PER_YEAR,
    DEFAULT_FULL_TIME_ANNUAL_HOURS,
    DEFAULT_PAYMENT_SCHEDULE,
    calculateBonusAtPaymentDate,
    resolveNextPaymentDate,
    listUpcomingPaymentOptions,
    normalizeSchedule,
    resolveBonusProRata,
    applyBonusDeductionsAndProRata,
    toIsoDateOnly: bonusToIsoDateOnly,
  } = require('./bonusAccrual');

  async function loadBonusConfig() {
    try {
      const snap = await db.collection('settings').doc('bonus').get();
      if (!snap.exists) {
        return {
          schedule: DEFAULT_PAYMENT_SCHEDULE,
          fullTimeHoursPerWeek: DEFAULT_FULL_TIME_HOURS_PER_WEEK,
          fullTimeWeeksPerYear: DEFAULT_FULL_TIME_WEEKS_PER_YEAR,
          fullTimeAnnualHours: DEFAULT_FULL_TIME_ANNUAL_HOURS,
        };
      }
      const data = snap.data() || {};
      const schedule = normalizeSchedule(data.paymentSchedule || data.paymentDates);
      const weekly = Number(data.fullTimeHoursPerWeek);
      const weeks = Number(data.fullTimeWeeksPerYear);
      const annual = Number(data.fullTimeAnnualHours);
      const fullTimeHoursPerWeek = weekly > 0 ? weekly : DEFAULT_FULL_TIME_HOURS_PER_WEEK;
      const fullTimeWeeksPerYear = weeks > 0 ? weeks : DEFAULT_FULL_TIME_WEEKS_PER_YEAR;
      const fullTimeAnnualHours = annual > 0
        ? annual
        : fullTimeHoursPerWeek * fullTimeWeeksPerYear;
      return {
        schedule: schedule.length ? schedule : DEFAULT_PAYMENT_SCHEDULE,
        fullTimeHoursPerWeek,
        fullTimeWeeksPerYear,
        fullTimeAnnualHours,
      };
    } catch (error) {
      console.warn('loadBonusConfig failed, using defaults', error.message || error);
      return {
        schedule: DEFAULT_PAYMENT_SCHEDULE,
        fullTimeHoursPerWeek: DEFAULT_FULL_TIME_HOURS_PER_WEEK,
        fullTimeWeeksPerYear: DEFAULT_FULL_TIME_WEEKS_PER_YEAR,
        fullTimeAnnualHours: DEFAULT_FULL_TIME_ANNUAL_HOURS,
      };
    }
  }

  function bonusDeductionPresetId(item) {
    const raw = toTrimmedString(item?.outcomePreset)
      || toTrimmedString(item?.warningPresetId)
      || '';
    if (BONUS_DEDUCTION_AMOUNTS[raw]) return raw;
    const lower = raw.toLowerCase().replace(/\s+/g, '_');
    if (BONUS_DEDUCTION_AMOUNTS[lower]) return lower;
    if (/final.?written/.test(lower)) return 'final_written_warning';
    if (/written.?warning/.test(lower) && !/final/.test(lower)) return 'written_warning';
    return '';
  }

  function bonusDeductionWasIssued(item) {
    if (!item) return false;
    if (item.outcomeIssuedAt || item.closedAt || item.warningEffectiveAt) return true;
    if (isIsoDateOnly(item.warningExpiresAt) || isIsoDateOnly(item.warningEffectiveAt)) return true;
    const stage = String(item.stage || '');
    if (stage === 'closed' || stage === 'appeal' || stage === 'outcome') return true;
    const status = String(item.status || '').toLowerCase();
    if (
      status.includes('closed')
      || status.includes('awaiting_employee')
      || status.includes('outcome')
      || status.includes('warning')
      || status.includes('signed')
    ) {
      return true;
    }
    return false;
  }

  const getBonusDeductions = onRequest(
    { region: 'europe-west2' },
    withCors(async (req, res) => {
      if (req.method !== 'GET') {
        res.status(405).json({ error: 'Method not allowed.' });
        return;
      }
      const session = await getVerifiedSessionUser(req);
      if (!assertManager(session, res)) return;

      try {
        const employeeUidFilter = toTrimmedString(req.query?.employeeUid);
        const {
          schedule,
          fullTimeHoursPerWeek,
          fullTimeWeeksPerYear,
          fullTimeAnnualHours,
        } = await loadBonusConfig();
        const todayIso = new Date().toISOString().slice(0, 10);
        const requestedPaymentDate = bonusToIsoDateOnly(req.query?.paymentDate);
        const nextDefault = resolveNextPaymentDate(todayIso, schedule);
        const paymentDate = requestedPaymentDate || nextDefault;
        const paymentOptions = listUpcomingPaymentOptions(todayIso, schedule, 6);
        const baseBonus = DEFAULT_BASE_BONUS;

        const [usersSnap, casesSnap] = await Promise.all([
          employeeUidFilter
            ? db.collection('users').doc(employeeUidFilter).get().then((doc) => ({ docs: doc.exists ? [doc] : [] }))
            : db.collection('users').get(),
          employeeUidFilter
            ? db.collection('disciplinary_cases').where('employeeUid', '==', employeeUidFilter).get()
            : db.collection('disciplinary_cases').get(),
        ]);

        const employeesByUid = new Map();
        for (const doc of usersSnap.docs) {
          const data = doc.data() || {};
          if (data.isActive === false) continue;
          const profile = data.employeeProfile || {};
          const startDate = bonusToIsoDateOnly(
            profile.startDate
            || profile.hireDate
            || data.startDate
            || data.hireDate
            || '',
          );
          employeesByUid.set(doc.id, {
            uid: doc.id,
            fullName: data.fullName || data.email || 'Unknown',
            email: data.email || '',
            department: profile.department || data.department || '',
            startDate,
            contractType: profile.contractType || data.contractType || '',
            annualContractedHours: Number(
              profile.annualContractedHours || data.annualContractedHours || 0,
            ) || 0,
            hoursPerWeek: Number(profile.hoursPerWeek || data.hoursPerWeek || 0) || 0,
            fte: Number(profile.fte || data.fte || 0) || 0,
          });
        }

        const deductionsByEmployee = new Map();
        for (const doc of casesSnap.docs) {
          const item = serializeCase(doc);
          const presetId = bonusDeductionPresetId(item);
          const amount = BONUS_DEDUCTION_AMOUNTS[presetId];
          if (!amount) continue;
          const family = item.processFamily || 'disciplinary';
          if (family && family !== 'disciplinary') continue;
          if (!item.employeeUid) continue;
          if (!bonusDeductionWasIssued(item)) continue;

          const givenAt = measureGivenAt(item)
            || toIsoDateOnly(item.outcomeIssuedAt)
            || toIsoDateOnly(item.closedAt)
            || toIsoDateOnly(item.warningEffectiveAt)
            || toIsoDateOnly(item.updatedAt)
            || '';
          const superseded = isSupersededMeasure(item);
          const cleared = Boolean(item.warningClearedAt) && !superseded;
          // Superseded / cleared warnings stay listed but do not reduce final payment.
          const countsTowardPayment = !superseded && !item.warningClearedAt;
          const preset = outcomePresetById(presetId);
          const entry = {
            caseId: item.id,
            outcomePreset: presetId,
            warningLabel: preset?.label || presetId,
            amount,
            currency: 'GBP',
            reason: measureReason(item),
            title: item.title || '',
            warningTitle: item.warningTitle || '',
            givenAt,
            warningExpiresAt: toIsoDateOnly(item.warningExpiresAt) || '',
            status: item.status || '',
            stage: item.stage || '',
            warningClearedAt: item.warningClearedAt || null,
            superseded,
            cleared,
            countsTowardPayment,
            employeeNameSnapshot: item.employeeNameSnapshot || '',
          };
          const list = deductionsByEmployee.get(item.employeeUid) || [];
          list.push(entry);
          deductionsByEmployee.set(item.employeeUid, list);
        }

        for (const list of deductionsByEmployee.values()) {
          list.sort((left, right) => String(right.givenAt || '').localeCompare(String(left.givenAt || '')));
        }

        // Active employees + anyone with a listed deduction (so warnings are never hidden).
        const employeeUids = [...new Set([
          ...employeesByUid.keys(),
          ...deductionsByEmployee.keys(),
        ])];
        const rows = employeeUids
          .map((uid) => {
            const employee = employeesByUid.get(uid);
            const deductions = deductionsByEmployee.get(uid) || [];
            const applicableDeductions = deductions.filter((item) => item.countsTowardPayment);
            const totalAmount = applicableDeductions.reduce(
              (sum, item) => sum + (Number(item.amount) || 0),
              0,
            );
            const listedDeductionTotal = deductions.reduce(
              (sum, item) => sum + (Number(item.amount) || 0),
              0,
            );
            const bonus = calculateBonusAtPaymentDate({
              startDate: employee?.startDate || '',
              paymentDate,
              baseBonus,
            });
            const proRata = resolveBonusProRata({
              contractType: employee?.contractType || '',
              annualContractedHours: employee?.annualContractedHours || 0,
              hoursPerWeek: employee?.hoursPerWeek || 0,
              fte: employee?.fte || 0,
              fullTimeHoursPerWeek,
              fullTimeWeeksPerYear,
              fullTimeAnnualHours,
            });
            const settlement = applyBonusDeductionsAndProRata({
              bonus,
              proRata,
              deductionTotal: totalAmount,
            });
            return {
              employeeUid: uid,
              employeeName: employee?.fullName || deductions[0]?.employeeNameSnapshot || 'Unknown employee',
              employeeEmail: employee?.email || '',
              department: employee?.department || '',
              startDate: employee?.startDate || '',
              contractType: employee?.contractType || '',
              annualContractedHours: employee?.annualContractedHours || null,
              hoursPerWeek: employee?.hoursPerWeek || null,
              fte: employee?.fte || null,
              isPartTime: Boolean(proRata.isPartTime),
              isFullTime: Boolean(proRata.isFullTime),
              isActiveEmployee: Boolean(employee),
              proRata,
              bonus,
              bonusPaymentAmountGross: bonus.paymentAmount,
              bonusAccruedPot: bonus.accruedPot,
              preDeductionPot: settlement.preDeductionPot,
              bonusPaymentAmount: settlement.preDeductionPot,
              deductions,
              totalAmount,
              listedDeductionTotal,
              deductionCount: deductions.length,
              applicableDeductionCount: applicableDeductions.length,
              finalPayment: settlement.finalPayment,
            };
          })
          .sort((a, b) => String(a.employeeName).localeCompare(String(b.employeeName)));

        const grandTotal = rows.reduce((sum, row) => sum + (Number(row.totalAmount) || 0), 0);
        const bonusPaymentsTotal = rows.reduce((sum, row) => sum + (Number(row.preDeductionPot) || 0), 0);
        const finalPaymentsTotal = rows.reduce((sum, row) => sum + (Number(row.finalPayment) || 0), 0);
        const partTimeCount = rows.filter((row) => row.isPartTime).length;
        res.status(200).json({
          amounts: BONUS_DEDUCTION_AMOUNTS,
          grandTotal,
          bonusPaymentsTotal,
          finalPaymentsTotal,
          partTimeCount,
          currency: 'GBP',
          paymentDate,
          nextPaymentDate: nextDefault,
          paymentOptions,
          bonusConfig: {
            baseBonus,
            schedule,
            fullTimeHoursPerWeek,
            fullTimeWeeksPerYear,
            fullTimeAnnualHours,
          },
          rows,
          ...(employeeUidFilter ? {
            employeeUid: employeeUidFilter,
            items: rows[0]?.deductions || [],
          } : {}),
        });
      } catch (error) {
        console.error('getBonusDeductions failed', error);
        res.status(500).json({ error: 'Failed to load bonus deductions.' });
      }
    }),
  );

  const getEmployeeInformalHistory = onRequest(
    { region: 'europe-west2' },
    withCors(async (req, res) => {
      if (req.method !== 'GET') {
        res.status(405).json({ error: 'Method not allowed.' });
        return;
      }
      const session = await getVerifiedSessionUser(req);
      if (!assertManager(session, res)) return;

      const employeeUid = toTrimmedString(req.query?.employeeUid);
      if (!employeeUid) {
        res.status(400).json({ error: 'employeeUid is required.' });
        return;
      }

      try {
        const cutoff = new Date();
        cutoff.setFullYear(cutoff.getFullYear() - 1);
        const cutoffIso = cutoff.toISOString();

        const snap = await db.collection('disciplinary_cases')
          .where('employeeUid', '==', employeeUid)
          .where('stage', '==', 'closed')
          .get();

        const INFORMAL_OUTCOMES = new Set([
          'informal_action',
          'file_note_for_improvement',
          'no_further_action',
          'verbal_warning',
          'written_warning',
          'final_written_warning',
          'samsara_coaching',
        ]);

        const items = snap.docs
          .map((doc) => serializeCase(doc))
          .filter((item) => {
            const isSamsara = (item.processFamily || '') === 'samsara_coaching'
              || item.outcomePreset === 'samsara_coaching';
            if (!isSamsara && (!item.outcomePreset || !INFORMAL_OUTCOMES.has(item.outcomePreset))) {
              return false;
            }
            const closedAt = item.closedAt || item.updatedAt || item.createdAt || '';
            return String(closedAt) >= cutoffIso;
          })
          .sort((a, b) => String(b.eventDate || b.closedAt || b.createdAt || '')
            .localeCompare(String(a.eventDate || a.closedAt || a.createdAt || '')))
          .map((item) => ({
            id: item.id,
            title: item.title || '',
            processFamily: item.processFamily || 'disciplinary',
            caseType: item.caseType || '',
            issue: item.issue || '',
            eventDate: item.eventDate || '',
            outcomePreset: item.outcomePreset || (
              (item.processFamily || '') === 'samsara_coaching' ? 'samsara_coaching' : ''
            ),
            closeNotes: item.closeNotes || '',
            informalActionDetails: item.informalActionDetails || '',
            closedAt: item.closedAt || item.updatedAt || '',
            informalResolutionPath: item.informalResolutionPath || '',
            fileNoteReason: item.fileNoteReason || '',
            processedOnSamsara: Boolean(item.processedOnSamsara)
              || (item.processFamily || '') === 'samsara_coaching',
            recordedByName: item.closedByName
              || item.fileNoteIssuedByName
              || item.createdByName
              || item.managerNameSnapshot
              || '',
            openedByName: item.createdByName || item.managerNameSnapshot || '',
          }));

        res.status(200).json({ items });
      } catch (error) {
        console.error('getEmployeeInformalHistory failed', error);
        res.status(500).json({ error: 'Failed to load informal history.' });
      }
    }),
  );

  const deletePeopleCase = onRequest(
    { region: 'europe-west2' },
    withCors(async (req, res) => {
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed.' });
        return;
      }
      const session = await getVerifiedSessionUser(req);
      if (!assertManager(session, res)) return;

      const body = req.body || {};
      const caseId = toTrimmedString(body.caseId);
      if (!caseId) {
        res.status(400).json({ error: 'caseId is required.' });
        return;
      }

      try {
        const caseSnap = await loadCaseOrFail(caseId, res);
        if (!caseSnap) return;
        const caseData = caseSnap.data();
        const { sharePointCleanup } = await deleteCaseAndRelated(caseId, caseData);
        const sharePointDeleted = Boolean(
          sharePointCleanup?.folderDeleted
          || (sharePointCleanup?.deletedItemIds || []).length,
        );
        const sharePointSkipped = Boolean(sharePointCleanup?.skipped);
        let message = 'Case and all portal records deleted.';
        if (sharePointDeleted) {
          message = 'Case, portal records, and SharePoint case folder/files deleted.';
        } else if (sharePointSkipped) {
          message = `Case and portal records deleted. SharePoint cleanup skipped: ${sharePointCleanup.reason || 'not configured.'}`;
        } else {
          message = 'Case and portal records deleted. No matching SharePoint case folder/files were found.';
        }
        res.status(200).json({
          deleted: true,
          caseId,
          sharePointCleanup: sharePointCleanup || null,
          message,
        });
      } catch (error) {
        console.error('deletePeopleCase failed', error);
        res.status(500).json({
          error: error.message || 'Failed to delete case.',
        });
      }
    }),
  );

  return {
    getPeopleCaseMeta,
    getPeopleCases,
    getPeopleCase,
    createPeopleCase,
    updatePeopleCase,
    createCaseMinutes,
    respondCaseMinutes,
    createCaseReview,
    completeCaseReview,
    getEmployeeCaseActions,
    downloadEmployeeCaseDocument,
    signFileNoteDocument,
    createBumpCardPrompt,
    submitBumpCard,
    downloadCaseDocumentTemplate,
    exportPeopleCase,
    clearExpiredWarnings,
    deletePeopleCase,
    getEmployeeInformalHistory,
    getActiveDisciplinaryMeasures,
    getBonusDeductions,
    DOCUMENT_TYPES,
  };
}

module.exports = {
  createPeopleCasesApi,
};
