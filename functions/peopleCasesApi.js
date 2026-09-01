/**
 * HTTP handlers for People Cases (wired from functions/index.js).
 */

const {
  DOCUMENT_TYPES,
  OUTCOME_PRESETS,
  toTrimmedString,
  canManageCases,
  canHrOverseeCases,
  stagesForFamily,
  normalizeStage,
  guideFor,
  sanitizeCaseCreateInput,
  outcomePresetById,
  buildOutcomePackSteps,
  addWorkingDays,
  countWorkingDaysNotice,
  buildHearingInviteHtml,
  serializeCase,
  serializeTimestamp,
  CASES_PORTAL,
} = require('./peopleCases');
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
  CASE_DOCUMENT_TEMPLATES,
} = require('./caseDocumentTemplates');
const {
  resolveEmployeeSharePointPaths,
  listTemplateLibraryFiles,
  findTemplateFile,
  resolveAndDownloadCaseTemplate,
  TEMPLATES_FOLDER_NAME,
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

  async function loadCaseOrFail(caseId, res) {
    const caseSnap = await db.collection('disciplinary_cases').doc(caseId).get();
    if (!caseSnap.exists) {
      res.status(404).json({ error: 'Case not found.' });
      return null;
    }
    return caseSnap;
  }

  async function canViewCase(session, caseData) {
    if (canManageCases(session.profile, getEffectivePortalRole)) return true;
    return caseData.employeeUid === session.profile.uid;
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
    };
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
        casesRole: (() => {
          if (session.profile?.portalsAccess?.master_admin === 'admin') return 'admin';
          return getEffectivePortalRole(session.profile, CASES_PORTAL)
            || (['manager', 'admin'].includes(getEffectivePortalRole(session.profile, 'hr_app')) ? 'hr' : '');
        })(),
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
      if (!session) {
        res.status(401).json({ error: 'Authentication required.' });
        return;
      }

      const caseId = toTrimmedString(req.path.split('/').pop());
      if (!caseId) {
        res.status(400).json({ error: 'Case id is required.' });
        return;
      }

      try {
        const caseSnap = await loadCaseOrFail(caseId, res);
        if (!caseSnap) return;
        const caseData = caseSnap.data();
        if (!(await canViewCase(session, caseData))) {
          res.status(403).json({ error: 'Insufficient access.' });
          return;
        }

        const related = await listRelated(caseId);

        let history = [];
        if (canManageCases(session.profile, getEffectivePortalRole) && caseData.employeeUid) {
          const historySnap = await db.collection('disciplinary_cases')
            .where('employeeUid', '==', caseData.employeeUid)
            .get();
          const today = new Date().toISOString().slice(0, 10);
          history = historySnap.docs
            .map((doc) => serializeCase(doc))
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
            .sort((a, b) => String(b.closedAt || b.createdAt || '').localeCompare(String(a.closedAt || a.createdAt || '')));
        }

        let consistency = [];
        if (canManageCases(session.profile, getEffectivePortalRole)) {
          const similarSnap = await db.collection('disciplinary_cases')
            .where('caseType', '==', caseData.caseType || 'other')
            .limit(40)
            .get();
          consistency = similarSnap.docs
            .map((doc) => serializeCase(doc))
            .filter((item) => item.id !== caseId && item.outcomePreset && item.stage === 'closed')
            .slice(0, 8)
            .map((item) => ({
              id: item.id,
              outcomePreset: item.outcomePreset,
              caseType: item.caseType,
              closedAt: item.closedAt,
              title: item.title,
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
        const documents = related.documents || [];

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
        const documentTemplates = stageTemplates.map((template) => {
          const match = documents.find((doc) => doc.templateId === template.id)
            || documents.find((doc) => doc.documentType === template.documentType && ['template_upload', 'upload'].includes(doc.source || 'upload'));
          const libraryMatch = findTemplateFile(templateLibraryFiles, template);
          const issuedMinutes = match
            ? minutes.find((item) => item.documentId === match.id)
            : null;
          return {
            ...template,
            uploaded: Boolean(match),
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
          templates: stageTemplates,
        }).map((item) => ({ id: item.id, title: item.title, documentType: item.documentType }));

        res.status(200).json({
          case: serialized,
          ...related,
          history,
          consistency,
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
      if (input.processFamily === 'disciplinary' || input.processFamily === 'grievance') {
        const path = input.informalResolutionPath;
        if (!path) {
          res.status(400).json({
            error: 'Choose an informal resolution option: proceed formally, not appropriate, or informal action taken.',
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
        if (path === 'informal_action_taken' && !input.informalActionDetails) {
          res.status(400).json({
            error: 'Record the informal action taken before closing the case.',
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
        const closeAsInformal = input.informalResolutionPath === 'informal_action_taken';
        const slaDueAt = closeAsInformal ? '' : addWorkingDays(new Date(), 5);

        const caseDoc = await db.collection('disciplinary_cases').add({
          employeeUid: input.employeeUid,
          employeeNameSnapshot: employee.fullName || employee.email || '',
          departmentSnapshot: employee.employeeProfile?.department || '',
          managerUid: ownerManagerUid,
          ownerManagerUid,
          managerNameSnapshot: ownerProfile?.fullName || session.profile.fullName || '',
          processFamily: input.processFamily,
          caseType: input.caseType,
          title: input.title || `${input.processFamily.replace(/_/g, ' ')} case`,
          summary: input.summary,
          status: closeAsInformal ? 'closed' : 'open',
          stage: closeAsInformal ? 'closed' : input.stage,
          origin: input.sourceIncidentId ? 'attendance_auto' : 'manual',
          sourceIncidentId: input.sourceIncidentId || '',
          dueAt: input.dueAt || '',
          slaDueAt,
          informalResolutionPath: input.informalResolutionPath || '',
          informalTried: input.informalResolutionPath === 'proceed_formal' || input.informalTried,
          informalNotes: input.informalNotes,
          informalNotAppropriateReason: input.informalNotAppropriateReason,
          informalActionDetails: input.informalActionDetails,
          informalActionTakenAt: closeAsInformal ? now : null,
          offPortalRaiseDate: input.offPortalRaiseDate,
          offPortalRaiseNotes: input.offPortalRaiseNotes,
          historyReviewedAt: null,
          historyReviewedByUid: '',
          investigatorUid: session.profile.uid,
          hearingManagerUid: '',
          decisionMakerUid: closeAsInformal ? session.profile.uid : '',
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
          outcomePreset: closeAsInformal ? 'informal_action' : '',
          outcomePackSteps: [],
          warningEffectiveAt: '',
          warningExpiresAt: '',
          appealWindowEndsAt: '',
          linkedDisciplinaryCaseId: '',
          linkedAccidentCaseId: '',
          trainingDecision: '',
          trainingOutline: '',
          openedAt: now,
          closedAt: closeAsInformal ? now : null,
          appealedAt: null,
          createdByUid: session.profile.uid,
          updatedByUid: session.profile.uid,
          createdAt: now,
          updatedAt: now,
        });

        await appendEvent(caseDoc.id, 'case_created', {
          processFamily: input.processFamily,
          caseType: input.caseType,
          stage: closeAsInformal ? 'closed' : input.stage,
          ownerManagerUid,
          informalResolutionPath: input.informalResolutionPath || '',
        }, session.profile);

        if (closeAsInformal) {
          await appendEvent(caseDoc.id, 'informal_action_recorded_and_closed', {
            informalActionDetails: input.informalActionDetails,
            outcomePreset: 'informal_action',
          }, session.profile);
        }

        res.status(200).json({
          id: caseDoc.id,
          message: closeAsInformal
            ? 'Informal action recorded and case closed.'
            : 'Case created.',
          closedAsInformal: closeAsInformal,
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
            const missing = missingRequiredTemplates({
              processFamily: family,
              stage: currentStage,
              outcomePreset: existing.outcomePreset || existing.trainingDecision || '',
              documents: related.documents || [],
            });
            if (missing.length) {
              res.status(400).json({
                error: `Upload required documents before continuing: ${missing.map((item) => item.title).join(', ')}. Download the template, complete it, then upload.`,
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
          patch.stage = 'closed';
          patch.status = 'closed';
          patch.closedAt = admin.firestore.FieldValue.serverTimestamp();
          patch.appealWindowEndsAt = addWorkingDays(new Date(), 5);
          events.push(['closed_with_notes', { outcomePreset: preset.id, notes }]);
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
          const recommendedDays = 5;
          if (noticeDays < recommendedDays && !body.acknowledgeShortNotice) {
            res.status(400).json({
              error: `Acas expects reasonable notice. Recommended gap is about ${recommendedDays} working days (this date gives ${noticeDays}). Confirm to proceed with shorter notice.`,
              code: 'short_notice',
              noticeWorkingDays: noticeDays,
              recommendedWorkingDays: recommendedDays,
              suggestedDate: addWorkingDays(new Date(), recommendedDays),
            });
            return;
          }

          const hearingManagerUid = toTrimmedString(patch.hearingManagerUid || existing.hearingManagerUid);
          const hearingManager = hearingManagerUid ? await getUserProfile(hearingManagerUid) : null;
          const inviteHtml = buildHearingInviteHtml({
            employeeName: existing.employeeNameSnapshot || '',
            caseTitle: existing.title || '',
            caseSummary: existing.summary || '',
            hearingScheduledAt,
            hearingScheduledTime,
            hearingLocation,
            hearingManagerName: hearingManager?.fullName || '',
            issuedByName: session.profile.fullName || session.profile.email || 'Management',
            issuedAtLabel: new Date().toLocaleDateString('en-GB'),
            extraNotes: hearingInviteNotes,
            suspensionActive: Boolean(existing.suspensionActive),
            precautionarySuspension: Boolean(existing.precautionarySuspension || existing.suspensionActive),
            suspensionReason: existing.suspensionReason || '',
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
                  caseFolderName: buildCaseSharePointFolderName(existing, caseId),
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
            hearingLocation,
            createdAt: now,
            updatedAt: now,
          });

          patch.hearingScheduledAt = hearingScheduledAt;
          patch.hearingScheduledTime = hearingScheduledTime;
          patch.hearingLocation = hearingLocation;
          patch.hearingInviteNotes = hearingInviteNotes;
          patch.companionOffered = true;
          patch.hearingInviteIssuedAt = now;
          patch.hearingInviteDocumentId = docRef.id;
          patch.status = 'pending_employee';
          events.push(['hearing_invite_issued', {
            documentId: docRef.id,
            hearingScheduledAt,
            hearingScheduledTime,
            hearingLocation,
            noticeWorkingDays: noticeDays,
            shortNotice: noticeDays < recommendedDays,
          }]);
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

        if (body.outcomePreset) {
          const preset = outcomePresetById(body.outcomePreset);
          if (!preset) {
            res.status(400).json({ error: 'Invalid outcome preset.' });
            return;
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
          if (preset.warning && !body.warningExpiresAt && preset.suggestedExpiryMonths) {
            const effective = toTrimmedString(body.warningEffectiveAt) || new Date().toISOString().slice(0, 10);
            const expires = new Date(effective);
            expires.setMonth(expires.getMonth() + preset.suggestedExpiryMonths);
            patch.warningEffectiveAt = effective;
            patch.warningExpiresAt = expires.toISOString().slice(0, 10);
          }
          if (body.warningEffectiveAt) patch.warningEffectiveAt = body.warningEffectiveAt;
          if (body.warningExpiresAt) patch.warningExpiresAt = body.warningExpiresAt;
          events.push(['outcome_selected', { outcomePreset: preset.id }]);
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
          const family = existing.processFamily || 'disciplinary';
          const currentStage = normalizeStage(family, existing.stage);
          if (['outcome_pack', 'appeal'].includes(currentStage)) {
            const relatedForClose = await listRelated(caseId);
            const missing = missingRequiredTemplates({
              processFamily: family,
              stage: currentStage,
              outcomePreset: patch.outcomePreset || existing.outcomePreset || '',
              documents: relatedForClose.documents || [],
            });
            if (missing.length && !body.forceClose) {
              res.status(400).json({
                error: `Upload required outcome documents before closing: ${missing.map((item) => item.title).join(', ')}.`,
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
          patch.linkedDisciplinaryCaseId = linked.id;
          patch.trainingDecision = 'disciplinary';
          events.push(['linked_disciplinary_opened', { linkedCaseId: linked.id }]);
        }

        patch.updatedAt = admin.firestore.FieldValue.serverTimestamp();
        patch.updatedByUid = session.profile.uid;
        await caseSnap.ref.update(patch);
        for (const [type, payload] of events) {
          await appendEvent(caseId, type, payload, session.profile);
        }

        const refreshed = await caseSnap.ref.get();
        res.status(200).json({ case: serializeCase(refreshed), message: 'Case updated.' });
      } catch (error) {
        console.error('updatePeopleCase failed', error);
        res.status(500).json({ error: 'Failed to update case.' });
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
        const ref = await db.collection('case_minutes').add({
          caseId,
          employeeUid: caseData.employeeUid,
          meetingType,
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
        await caseSnap.ref.update({
          status: 'pending_employee',
          updatedAt: now,
          updatedByUid: session.profile.uid,
        });
        await appendEvent(caseId, 'minutes_issued', {
          minutesId: ref.id,
          meetingType,
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
      if (!minutesId || !['approve', 'amend', 'sign_off', 'dispute', 'manager_update'].includes(action)) {
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
            res.status(400).json({ error: 'amendmentRequest is required.' });
            return;
          }
          patch.amendmentRequests = admin.firestore.FieldValue.arrayUnion({
            text: request,
            at: new Date().toISOString(),
            byUid: session.profile.uid,
          });
          patch.status = 'amendment_requested';
        } else if (action === 'manager_update' && isManager) {
          patch.content = toTrimmedString(body.content) || minutes.content;
          patch.managerVersion = patch.content;
          patch.status = 'issued';
        } else if ((action === 'approve' || action === 'sign_off') && isEmployee) {
          patch.status = 'signed_off';
          patch.signedOffAt = now;
          patch.signedOffByUid = session.profile.uid;
          patch.disputed = false;
        } else if (action === 'dispute' && isEmployee) {
          patch.status = 'disputed';
          patch.disputed = true;
          patch.disputedNotes = toTrimmedString(body.disputedNotes);
          patch.employeeVersion = toTrimmedString(body.employeeVersion) || minutes.content;
          patch.signedOffAt = now;
          patch.signedOffByUid = session.profile.uid;
        } else {
          res.status(403).json({ error: 'Action not allowed for this user.' });
          return;
        }

        await minutesSnap.ref.update(patch);
        await appendEvent(minutes.caseId, `minutes_${action}`, { minutesId }, session.profile);

        if (['sign_off', 'approve', 'dispute'].includes(action)) {
          await db.collection('disciplinary_cases').doc(minutes.caseId).update({
            status: 'pending_manager',
            updatedAt: now,
          });
        }

        res.status(200).json({ message: 'Minutes updated.' });
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
        res.status(200).json({ id: ref.id, message: 'Review scheduled.' });
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
          .filter((item) => ['issued', 'amendment_requested'].includes(item.status));

        const cases = casesSnap.docs.map((doc) => serializeCase(doc));
        const prompts = promptsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        const documents = docsSnap.docs
          .map((doc) => ({
            id: doc.id,
            ...doc.data(),
            createdAt: serializeTimestamp(doc.data().createdAt),
            issuedToEmployeeAt: serializeTimestamp(doc.data().issuedToEmployeeAt),
          }))
          .filter((item) => {
            if (['invite', 'letter', 'warning', 'outcome', 'suspension_letter', 'training_outline', 'pip_plan'].includes(item.documentType)) {
              return true;
            }
            // Minutes / notes Word files that were explicitly sent for employee review
            return Boolean(item.issuedToEmployeeAt) && ['minutes', 'evidence', 'other'].includes(item.documentType);
          });

        const pendingHearingInvites = cases
          .filter((item) => item.hearingInviteIssuedAt && ['hearing_invite', 'hearing'].includes(item.stage))
          .map((item) => ({
            caseId: item.id,
            title: item.title,
            hearingScheduledAt: item.hearingScheduledAt || '',
            hearingScheduledTime: item.hearingScheduledTime || '',
            hearingLocation: item.hearingLocation || '',
            hearingInviteDocumentId: item.hearingInviteDocumentId || '',
          }));

        res.status(200).json({
          pendingMinutes,
          cases,
          bumpPrompts: prompts,
          documents,
          pendingHearingInvites,
          badgeCount: pendingMinutes.length + prompts.length + pendingHearingInvites.length,
        });
      } catch (error) {
        console.error('getEmployeeCaseActions failed', error);
        res.status(500).json({ error: 'Failed to load actions.' });
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
          ...related,
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

  // Keep legacy create path compatible by enriching createDisciplinaryCase callers via shared sanitize later.
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
    createBumpCardPrompt,
    submitBumpCard,
    downloadCaseDocumentTemplate,
    exportPeopleCase,
    clearExpiredWarnings,
    DOCUMENT_TYPES,
  };
}

module.exports = {
  createPeopleCasesApi,
};
