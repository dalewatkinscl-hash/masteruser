import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { readJsonResponse } from '../utils/employeeProfile';
import CaseGuidePanel from '../components/CaseGuidePanel';
import CaseDocumentationHub from '../components/CaseDocumentationHub';
import CaseProgressRail from '../components/CaseProgressRail';
import EmployeeSelect from '../components/EmployeeSelect';
import {
  INFORMAL_RESOLUTION_OPTIONS,
  MINIMUM_HEARING_NOTICE_WORKING_DAYS,
  OUTCOME_PRESETS,
  PROCESS_FAMILIES,
  RECOMMENDED_HEARING_NOTICE_WORKING_DAYS,
  addMonthsIso,
  addWorkingDaysIso,
  countWorkingDaysNotice,
  normalizeStage,
  stageAllowsDocumentation,
  stageLabel,
  stagesForFamily,
  getCaseProgressStatus,
  caseProgressToneClass,
} from '../utils/peopleCasesAccess';
import { buildHearingInviteHtml, printHearingInvite } from '../utils/hearingInvitePrint';
import { buildFileNoteForImprovementHtml, printHtmlDocument } from '../utils/fileNoteForImprovementPrint';
import { ALLOW_DELETE_CASES } from '../utils/featureFlags';

const CASE_TYPES = ['attendance', 'conduct', 'performance', 'policy', 'capability', 'grievance', 'vehicle_accident', 'other'];
const DOCUMENT_TYPES = ['evidence', 'letter', 'minutes', 'warning', 'outcome', 'invite', 'suspension_letter', 'training_outline', 'pip_plan', 'other'];

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      resolve(result.includes(',') ? result.split(',')[1] : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function Field({ label, children }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs uppercase tracking-wide text-slate-500">{label}</span>
      {children}
    </label>
  );
}

const inputClass = 'w-full bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-3 py-2';
const btnSecondary = 'px-3 py-2 text-sm border border-[#1a2540] rounded-lg text-slate-200 hover:bg-[#0b1220]';
const btnPrimary = 'px-3 py-2 text-sm rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium';

function StepCard({ title, children, footer }) {
  return (
    <section className="bg-[#0b1220] border border-[#1a2540] rounded-xl p-5 space-y-4">
      <h3 className="text-white font-semibold text-lg">{title}</h3>
      {children}
      {footer}
    </section>
  );
}

function ChoiceRow({ children }) {
  return <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">{children}</div>;
}

function ChoiceButton({ title, help, onClick, disabled, primary, selected }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`text-left rounded-xl border p-4 transition ${
        selected
          ? 'ring-2 ring-indigo-400/80 border-indigo-500/60 bg-indigo-500/15'
          : primary
            ? 'border-indigo-500/50 bg-indigo-500/10 hover:bg-indigo-500/15'
            : 'border-[#1a2540] bg-[#060e1a]/50 hover:bg-[#060e1a]'
      } disabled:opacity-50`}
    >
      <span className={`block text-sm font-medium ${primary || selected ? 'text-indigo-100' : 'text-slate-100'}`}>{title}</span>
      {help && <span className="block text-xs text-slate-400 mt-1">{help}</span>}
    </button>
  );
}

export default function DisciplinaryCase() {
  const { caseId } = useParams();
  const [searchParams] = useSearchParams();
  const isNew = !caseId || caseId === 'new';
  const navigate = useNavigate();
  const prefilledEmployeeUid = searchParams.get('employeeUid') || '';
  const prefilledEmployeeName = searchParams.get('employeeName') || '';
  const prefilledFamily = searchParams.get('processFamily') || 'disciplinary';

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [caseData, setCaseData] = useState(null);
  const [events, setEvents] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [minutes, setMinutes] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [history, setHistory] = useState([]);
  const [consistency, setConsistency] = useState([]);
  const [sharePointConfigured, setSharePointConfigured] = useState(false);
  const [sharePointPath, setSharePointPath] = useState('');
  const [sharePointFolderConfirmed, setSharePointFolderConfirmed] = useState(false);
  const [documentTemplates, setDocumentTemplates] = useState([]);
  const [missingDocuments, setMissingDocuments] = useState([]);
  const [informalHistory, setInformalHistory] = useState([]);
  const [informalHistoryLoading, setInformalHistoryLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadType, setUploadType] = useState('evidence');
  const [closeNotes, setCloseNotes] = useState('');
  const [informalActionDetails, setInformalActionDetails] = useState('');
  const [fileNoteReason, setFileNoteReason] = useState('');
  const [fileNoteActionRequired, setFileNoteActionRequired] = useState('');
  const [selectedFactFindingOutcome, setSelectedFactFindingOutcome] = useState('');
  const signedFileNoteInputRef = useRef(null);
  const [viewStage, setViewStage] = useState(null);
  const [showExtras, setShowExtras] = useState(false);
  const [reviewDueAt, setReviewDueAt] = useState('');
  const [reviewTitle, setReviewTitle] = useState('Scheduled review');
  const [acknowledgeSameInvestigator, setAcknowledgeSameInvestigator] = useState(false);
  const [acknowledgeSameAppealOwner, setAcknowledgeSameAppealOwner] = useState(false);
  const [acknowledgeShortNotice, setAcknowledgeShortNotice] = useState(false);
  const [hearingForm, setHearingForm] = useState({
    hearingScheduledAt: '',
    hearingScheduledTime: '10:00',
    hearingLocation: '',
    hearingInviteNotes: '',
  });
  const [employees, setEmployees] = useState([]);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [form, setForm] = useState({
    employeeUid: '',
    ownerManagerUid: '',
    processFamily: prefilledFamily,
    caseType: prefilledFamily === 'grievance' ? 'grievance' : prefilledFamily === 'vehicle_accident' ? 'vehicle_accident' : 'conduct',
    title: '',
    summary: '',
    informalResolutionPath: 'resolve_informally',
    informalNotes: '',
    informalNotAppropriateReason: '',
    informalActionDetails: '',
    offPortalRaiseDate: '',
    offPortalRaiseNotes: '',
  });

  const family = caseData?.processFamily || form.processFamily || 'disciplinary';
  const stages = useMemo(() => stagesForFamily(family), [family]);
  const currentStage = useMemo(
    () => (isNew ? null : normalizeStage(family, caseData?.stage)),
    [isNew, family, caseData?.stage],
  );

  useEffect(() => {
    if (currentStage) setViewStage(currentStage);
  }, [currentStage]);

  const displayStage = viewStage || currentStage;
  const viewingPastStage = Boolean(displayStage && currentStage && displayStage !== currentStage);
  const needsPortalInterview = useMemo(
    () => missingDocuments.some((item) => item.documentType === 'minutes'),
    [missingDocuments],
  );

  const meetingTypeForStage = useMemo(() => {
    if (family === 'grievance') {
      if (currentStage === 'meeting') return 'grievance_meeting';
      return 'grievance_investigation';
    }
    if (family === 'vehicle_accident') return 'accident_interview';
    if (currentStage === 'hearing') return 'hearing';
    if (currentStage === 'hearing_invite') return 'hearing_invite';
    if (currentStage === 'appeal') return 'appeal';
    if (currentStage === 'outcome_pack') return 'outcome';
    if (currentStage === 'fact_finding') return 'fact_finding';
    return 'investigation';
  }, [family, currentStage]);

  const hearingManagerName = useMemo(() => {
    const uid = caseData?.hearingManagerUid;
    if (!uid) return '';
    return employees.find((item) => item.uid === uid)?.fullName || '';
  }, [caseData?.hearingManagerUid, employees]);

  const todayIso = new Date().toISOString().slice(0, 10);
  const suggestedHearingDate = addWorkingDaysIso(new Date(), RECOMMENDED_HEARING_NOTICE_WORKING_DAYS);
  const hearingNoticeDays = hearingForm.hearingScheduledAt
    ? countWorkingDaysNotice(todayIso, hearingForm.hearingScheduledAt)
    : null;
  const hearingNoticeShort = hearingNoticeDays !== null && hearingNoticeDays < RECOMMENDED_HEARING_NOTICE_WORKING_DAYS;
  const hearingNoticeVeryShort = hearingNoticeDays !== null && hearingNoticeDays < MINIMUM_HEARING_NOTICE_WORKING_DAYS;

  const reload = async (id = caseId) => {
    const response = await fetch(`/api/getPeopleCase/${id}`, { credentials: 'include' });
    const data = (await readJsonResponse(response)) || {};
    if (!response.ok) throw new Error(data.error || 'Failed to load case.');
    if (!data.case) throw new Error('Case payload missing from server response.');
    setCaseData(data.case);
    setEvents(data.events || []);
    setDocuments(data.documents || []);
    setMinutes(data.minutes || []);
    setReviews(data.reviews || []);
    setHistory(data.history || []);
    setConsistency(data.consistency || []);
    setSharePointConfigured(Boolean(data.sharePointConfigured));
    setSharePointPath(data.sharePointPath || '');
    setSharePointFolderConfirmed(Boolean(data.sharePointFolderConfirmed));
    setDocumentTemplates(data.documentTemplates || []);
    setMissingDocuments(data.missingDocuments || []);
    if (data.case) {
      setHearingForm((prev) => ({
        hearingScheduledAt: data.case.hearingScheduledAt || prev.hearingScheduledAt || '',
        hearingScheduledTime: data.case.hearingScheduledTime || prev.hearingScheduledTime || '10:00',
        hearingLocation: data.case.hearingLocation || prev.hearingLocation || '',
        hearingInviteNotes: data.case.hearingInviteNotes || prev.hearingInviteNotes || '',
      }));
    }
  };

  useEffect(() => {
    if (!isNew || !prefilledEmployeeUid) return;
    setForm((prev) => ({
      ...prev,
      employeeUid: prefilledEmployeeUid,
      title: prev.title || (prefilledEmployeeName ? `Case: ${prefilledEmployeeName}` : ''),
    }));
  }, [isNew, prefilledEmployeeUid, prefilledEmployeeName]);

  useEffect(() => {
    const loadEmployees = async () => {
      try {
        setEmployeesLoading(true);
        const response = await fetch('/api/getEmployeeProfiles', { credentials: 'include' });
        const data = (await readJsonResponse(response)) || {};
        if (!response.ok) throw new Error(data.error || 'Failed to load employees.');
        setEmployees(data.employees || []);
      } catch (err) {
        setError(err.message || 'Failed to load employees.');
      } finally {
        setEmployeesLoading(false);
      }
    };
    loadEmployees();
  }, []);

  useEffect(() => {
    if (isNew) {
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    // Route reuse (new → existing case) keeps this component mounted with stale
    // loading=false / caseData=null — clear and reload so we never render a blank crash.
    setLoading(true);
    setCaseData(null);
    setError('');
    setMessage('');
    setViewStage(null);

    const load = async () => {
      try {
        await reload(caseId);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load case.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [caseId, isNew]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleEmployeeSelect = (uid) => {
    const employee = employees.find((item) => item.uid === uid);
    setForm((prev) => ({
      ...prev,
      employeeUid: uid,
      title: prev.title?.trim()
        ? prev.title
        : (employee?.fullName ? `Case: ${employee.fullName}` : prev.title),
    }));
    setInformalHistory([]);
    if (uid) {
      setInformalHistoryLoading(true);
      fetch(`/api/getEmployeeInformalHistory?employeeUid=${encodeURIComponent(uid)}`, { credentials: 'include' })
        .then((r) => readJsonResponse(r).then((d) => ({ ok: r.ok, d })))
        .then(({ ok, d }) => { if (ok) setInformalHistory((d || {}).items || []); })
        .catch(() => {})
        .finally(() => setInformalHistoryLoading(false));
    }
  };

  const apiUpdate = async (body) => {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/updatePeopleCase', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caseId, ...body }),
      });
      const data = (await readJsonResponse(response)) || {};
      if (!response.ok) {
        if (data.code === 'short_notice') {
          setError(data.error || 'Short notice — confirm to proceed.');
          return { ok: false, code: 'short_notice', data };
        }
        if (data.code === 'missing_documents') {
          setError(data.error || 'Upload required documents before continuing.');
          return { ok: false, code: 'missing_documents', data };
        }
        throw new Error(data.error || 'Update failed.');
      }
      setMessage(data.message || 'Updated.');
      await reload();
      return { ok: true, data };
    } catch (err) {
      setError(err.message || 'Update failed.');
      return { ok: false };
    } finally {
      setSaving(false);
    }
  };

  const handleCreate = async () => {
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/createPeopleCase', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          informalTried: form.informalResolutionPath === 'proceed_formal',
        }),
      });
      const data = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(data.error || 'Failed to create case.');
      navigate(`/dashboard/cases/${data.id}`);
    } catch (err) {
      setError(err.message || 'Failed to create case.');
    } finally {
      setSaving(false);
    }
  };

  const handleUploadDocument = async (event, template = null, overrides = {}) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || isNew) return;
    setUploading(true);
    setError('');
    try {
      const contentBase64 = await readFileAsBase64(file);
      const response = await fetch('/api/uploadDisciplinaryDocument', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caseId,
          fileName: file.name,
          contentBase64,
          mimeType: file.type || 'application/octet-stream',
          documentType: overrides.documentType || template?.documentType || uploadType,
          templateId: template?.id || '',
          stageKey: overrides.stageKey || currentStage || '',
          source: overrides.source || '',
          relatedDocumentId: overrides.relatedDocumentId || '',
        }),
      });
      const data = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(data.error || 'Failed to upload document.');
      await reload();
      setMessage(
        data.message
        || (data.sharePointFolderPath
          ? `Document uploaded to SharePoint: ${data.sharePointFolderPath}`
          : 'Document uploaded.'),
      );
    } catch (err) {
      setError(err.message || 'Failed to upload document.');
    } finally {
      setUploading(false);
    }
  };

  const handleDownloadTemplate = async (template) => {
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/downloadCaseDocumentTemplate', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caseId,
          templateId: template.id,
        }),
      });
      const data = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(data.error || 'Failed to download template.');
      const binary = atob(data.contentBase64 || '');
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: data.mimeType || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = data.fileName || `${template.id}.doc`;
      anchor.click();
      URL.revokeObjectURL(url);
      const who = data.filledFields?.employeeName;
      setMessage(who
        ? `Pre-filled working copy downloaded for ${who} — finish in Word, then upload.`
        : 'Pre-filled working copy downloaded — finish in Word, then upload.');
    } catch (err) {
      setError(err.message || 'Failed to download template.');
    } finally {
      setSaving(false);
    }
  };

  const issueDocumentToEmployee = async (template) => {
    const documentId = template?.uploadedDocument?.id;
    if (!documentId) {
      setError('Upload the completed document before sending it to the employee.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/createCaseMinutes', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caseId,
          documentId,
          meetingType: meetingTypeForStage || template?.id || 'interview',
          stageKey: currentStage || '',
        }),
      });
      const data = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(data.error || 'Failed to send document.');
      setMessage(data.message || 'Document sent to employee.');
      await reload();
    } catch (err) {
      setError(err.message || 'Failed to send document.');
    } finally {
      setSaving(false);
    }
  };

  const recordInterview = async ({
    content,
    interviewAt,
    interviewTime,
    intervieweeUid,
    managersPresentUids,
    meetingType,
    stageKey,
  }) => {
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/createCaseMinutes', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caseId,
          content,
          interviewAt,
          interviewTime,
          intervieweeUid,
          meetingType: meetingType || meetingTypeForStage,
          stageKey: stageKey || currentStage || '',
          managersPresentUids,
        }),
      });
      const data = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(data.error || 'Failed to send interview notes.');
      setMessage(data.message || 'Interview notes sent to employee for confirmation.');
      await reload();
    } catch (err) {
      setError(err.message || 'Failed to send interview notes.');
    } finally {
      setSaving(false);
    }
  };

  const respondToMinutes = async (minutesId, action, extra = {}) => {
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/respondCaseMinutes', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ minutesId, action, ...extra }),
      });
      const data = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(data.error || 'Failed to update notes.');
      setMessage(data.message || 'Notes updated.');
      await reload();
    } catch (err) {
      setError(err.message || 'Failed to update notes.');
      throw err;
    } finally {
      setSaving(false);
    }
  };

  const canAddDocumentation = !isNew
    && currentStage !== 'closed'
    && stageAllowsDocumentation(family, currentStage);

  const documentationHub = !isNew && displayStage ? (
    <CaseDocumentationHub
      stageKey={displayStage}
      processFamily={family}
      caseData={caseData}
      minutes={minutes}
      documents={documents}
      templates={documentTemplates}
      missingDocuments={missingDocuments}
      sharePointConfigured={sharePointConfigured}
      sharePointPath={sharePointPath}
      sharePointFolderConfirmed={sharePointFolderConfirmed}
      employees={employees}
      employeesLoading={employeesLoading}
      uploading={uploading}
      saving={saving}
      canAdd={canAddDocumentation && !viewingPastStage}
      meetingType={meetingTypeForStage}
      documentTypes={DOCUMENT_TYPES}
      uploadType={uploadType}
      onUploadTypeChange={setUploadType}
      onRecordInterview={recordInterview}
      onUploadDocument={handleUploadDocument}
      onDownloadTemplate={handleDownloadTemplate}
      onUploadForTemplate={(template, event) => handleUploadDocument(event, template)}
      onIssueToEmployee={issueDocumentToEmployee}
      onRespondToMinutes={respondToMinutes}
    />
  ) : null;

  const scheduleReview = async () => {
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/createCaseReview', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caseId, dueAt: reviewDueAt, title: reviewTitle }),
      });
      const data = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(data.error || 'Failed to schedule review.');
      setMessage('Review scheduled.');
      await reload();
    } catch (err) {
      setError(err.message || 'Failed to schedule review.');
    } finally {
      setSaving(false);
    }
  };

  const exportCase = async () => {
    setSaving(true);
    setError('');
    try {
      const response = await fetch(`/api/exportPeopleCase?caseId=${encodeURIComponent(caseId)}`, { credentials: 'include' });
      const data = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(data.error || 'Export failed.');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `case-${caseId}-export.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setMessage('Case export downloaded.');
    } catch (err) {
      setError(err.message || 'Export failed.');
    } finally {
      setSaving(false);
    }
  };

  const deleteCase = async () => {
    const label = caseData?.title || caseId;
    if (!window.confirm(`Permanently delete this case?\n\n"${label}"\n\nAll portal records (events, minutes, document metadata) will be removed. SharePoint files are not deleted.`)) {
      return;
    }
    if (!window.confirm('This cannot be undone. Delete the case now?')) {
      return;
    }
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/deletePeopleCase', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caseId }),
      });
      const data = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(data.error || 'Failed to delete case.');
      navigate('/dashboard/cases', { replace: true, state: { message: data.message || 'Case deleted.' } });
    } catch (err) {
      setError(err.message || 'Failed to delete case.');
    } finally {
      setSaving(false);
    }
  };

  const selectOutcome = async (presetId) => {
    const preset = OUTCOME_PRESETS.find((item) => item.id === presetId);
    const today = new Date().toISOString().slice(0, 10);
    const body = {
      outcomePreset: presetId,
      acknowledgeSameInvestigatorHearer: acknowledgeSameInvestigator,
      stage: 'outcome_pack',
    };
    if (preset?.suggestedExpiryMonths) {
      body.warningEffectiveAt = today;
      body.warningExpiresAt = addMonthsIso(today, preset.suggestedExpiryMonths);
    }
    await apiUpdate(body);
  };

  const closeWithNotes = async () => {
    const result = await apiUpdate({
      closeWithNotes: true,
      closeNotes,
      outcomePreset: 'no_further_action',
    });
    if (result?.ok) setCloseNotes('');
  };

  const closeAsInformalAction = async () => {
    const result = await apiUpdate({
      closeAsInformalAction: true,
      informalActionDetails,
    });
    if (result?.ok) setInformalActionDetails('');
  };

  const issueFileNoteForImprovement = async () => {
    const result = await apiUpdate({
      issueFileNoteForImprovement: true,
      fileNoteReason,
      fileNoteActionRequired,
    });
    if (result?.ok) {
      setFileNoteReason('');
      setFileNoteActionRequired('');
      const html = result.data?.fileNoteHtml;
      if (html) {
        try {
          await printHtmlDocument(html);
          setMessage('File note issued to the employee portal. Your manager signature is already applied — the employee must digitally sign in their account.');
          // Do not auto-print; portal sign-off is the primary path.
        } catch (err) {
          setError(err.message || 'File note saved but print failed.');
        }
      }
    }
  };

  const printExistingFileNote = async () => {
    const docId = caseData?.fileNoteDocumentId;
    const doc = documents.find((item) => item.id === docId) || documents.find((item) => item.documentType === 'file_note_for_improvement');
    const html = doc?.portalHtml
      || buildFileNoteForImprovementHtml({
        employeeName: caseData?.employeeNameSnapshot || '',
        managerName: caseData?.fileNoteIssuedByName
          || employees.find((person) => person.uid === caseData?.fileNoteIssuedByUid)?.fullName
          || 'Manager',
        reason: caseData?.fileNoteReason || caseData?.closeNotes || '',
        actionRequired: caseData?.fileNoteActionRequired || '',
        managerSignature: doc?.managerSignature || (caseData?.fileNoteIssuedByName ? {
          signedByName: caseData.fileNoteIssuedByName,
          signedAtLabel: caseData.fileNoteManagerSignedAt
            ? String(caseData.fileNoteManagerSignedAt).slice(0, 16).replace('T', ' ')
            : '',
        } : null),
        employeeSignature: doc?.employeeSignature || null,
      });
    try {
      await printHtmlDocument(html);
    } catch (err) {
      setError(err.message || 'Could not open print dialog.');
    }
  };

  const signedFileNoteDocument = useMemo(() => {
    const bySignedId = caseData?.fileNoteSignedDocumentId
      ? documents.find((item) => item.id === caseData.fileNoteSignedDocumentId)
      : null;
    if (bySignedId) return bySignedId;
    const original = caseData?.fileNoteDocumentId
      ? documents.find((item) => item.id === caseData.fileNoteDocumentId)
      : documents.find((item) => item.documentType === 'file_note_for_improvement');
    if (original?.signedCopy || original?.source === 'signed_file_note') return original;
    return documents.find((item) => item.documentType === 'file_note_signed') || null;
  }, [caseData?.fileNoteDocumentId, caseData?.fileNoteSignedDocumentId, documents]);

  const uploadSignedFileNote = (event) => handleUploadDocument(event, null, {
    documentType: 'file_note_signed',
    stageKey: 'fact_finding',
    source: 'signed_file_note',
    relatedDocumentId: caseData?.fileNoteDocumentId || '',
  });

  const renderFileNoteSigningPanel = () => {
    const employeePending = caseData?.fileNoteEmployeeSignStatus === 'pending'
      || (!caseData?.fileNoteEmployeeSignStatus && !signedFileNoteDocument);
    const employeeSigned = caseData?.fileNoteEmployeeSignStatus === 'signed'
      || Boolean(caseData?.fileNoteEmployeeSignedAt)
      || Boolean(signedFileNoteDocument?.employeeSignature?.signedAt);

    return (
      <div className="rounded-xl border border-indigo-500/25 bg-indigo-500/10 p-4 space-y-4">
        <div>
          <p className="text-sm font-medium text-indigo-100">File note for improvement</p>
          <p className="text-xs text-indigo-100/80 mt-1">
            Primary process: issued to the employee portal for digital signature.
            Your manager signature was applied when the note was created.
          </p>
        </div>

        <div className="rounded-lg border border-indigo-500/20 bg-[#0b1220]/40 p-3 space-y-2 text-sm">
          <p className="text-indigo-100">
            Manager signature:{' '}
            <span className="text-emerald-300">
              {caseData?.fileNoteIssuedByName || 'Applied at issue'}
              {caseData?.fileNoteManagerSignedAt
                ? ` · ${String(caseData.fileNoteManagerSignedAt).slice(0, 16).replace('T', ' ')}`
                : ''}
            </span>
          </p>
          <p className="text-indigo-100">
            Employee signature:{' '}
            {employeeSigned ? (
              <span className="text-emerald-300">
                Signed
                {caseData?.fileNoteEmployeeSignedAt
                  ? ` · ${String(caseData.fileNoteEmployeeSignedAt).slice(0, 16).replace('T', ' ')}`
                  : ''}
              </span>
            ) : (
              <span className="text-amber-300">Awaiting digital signature in Employee Portal</span>
            )}
          </p>
        </div>

        {caseData?.fileNoteReason && (
          <div>
            <p className="text-xs uppercase text-indigo-200/70">Reason</p>
            <p className="text-sm text-indigo-50/90 whitespace-pre-wrap">{caseData.fileNoteReason}</p>
          </div>
        )}
        {caseData?.fileNoteActionRequired && (
          <div>
            <p className="text-xs uppercase text-indigo-200/70">Improvement required</p>
            <p className="text-sm text-indigo-50/90 whitespace-pre-wrap">{caseData.fileNoteActionRequired}</p>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button type="button" className={btnSecondary} onClick={printExistingFileNote}>
            View / print document
          </button>
        </div>

        <div className="border-t border-indigo-500/20 pt-4 space-y-3">
          <p className="text-xs uppercase tracking-wide text-indigo-200/70">Backup — wet signature</p>
          <p className="text-xs text-indigo-100/80">
            If portal signing is not possible, print the note, obtain wet signatures, scan, and upload.
            The upload replaces the portal copy on the personnel file.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btnSecondary} onClick={printExistingFileNote}>
              Print for wet signature
            </button>
            <button
              type="button"
              className={btnSecondary}
              disabled={uploading || !sharePointConfigured}
              onClick={() => signedFileNoteInputRef.current?.click()}
            >
              {uploading
                ? 'Uploading…'
                : signedFileNoteDocument && !employeePending
                  ? 'Replace signed scan'
                  : 'Upload signed scan'}
            </button>
            <input
              ref={signedFileNoteInputRef}
              type="file"
              className="hidden"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx"
              onChange={uploadSignedFileNote}
            />
          </div>
          {!sharePointConfigured && (
            <p className="text-xs text-amber-300">SharePoint must be configured to upload a signed scan.</p>
          )}
          {signedFileNoteDocument?.sharePointWebUrl && (
            <p className="text-sm text-emerald-300">
              File on SharePoint:{' '}
              <a href={signedFileNoteDocument.sharePointWebUrl} target="_blank" rel="noreferrer" className="underline">
                {signedFileNoteDocument.fileName || 'Open'}
              </a>
            </p>
          )}
        </div>
      </div>
    );
  };

  const buildInviteHtmlFromForm = () => buildHearingInviteHtml({
    employeeName: caseData?.employeeNameSnapshot || '',
    caseTitle: caseData?.title || '',
    caseSummary: caseData?.summary || '',
    hearingScheduledAt: hearingForm.hearingScheduledAt,
    hearingScheduledTime: hearingForm.hearingScheduledTime,
    hearingLocation: hearingForm.hearingLocation,
    hearingManagerName,
    issuedByName: 'Management',
    issuedAtLabel: new Date().toLocaleDateString('en-GB'),
    extraNotes: hearingForm.hearingInviteNotes,
  });

  const handlePrintInvite = async () => {
    if (!hearingForm.hearingScheduledAt) {
      setError('Choose a hearing date before printing the invite.');
      return;
    }
    try {
      await printHearingInvite(buildInviteHtmlFromForm());
    } catch (err) {
      setError(err.message || 'Could not open print dialog.');
    }
  };

  const handleSendHearingInvite = async () => {
    if (!hearingForm.hearingScheduledAt) {
      setError('Choose a hearing date before sending the invite.');
      return;
    }
    if (hearingNoticeShort && !acknowledgeShortNotice) {
      setError(`This date gives only ${hearingNoticeDays} working day(s)’ notice. Acas recommends reasonable notice (around ${RECOMMENDED_HEARING_NOTICE_WORKING_DAYS} working days). Tick the short-notice acknowledgement to continue.`);
      return;
    }
    const result = await apiUpdate({
      issueHearingInvite: true,
      ...hearingForm,
      acknowledgeShortNotice,
    });
    if (result?.ok) {
      setAcknowledgeShortNotice(false);
      setMessage('Hearing invite sent to the employee portal.');
    }
  };

  const uploadedDocumentsList = (
    <ul className="space-y-2">
      {documents.map((doc) => (
        <li key={doc.id} className="text-sm text-slate-300">
          {doc.documentType}: {doc.fileName}
          {doc.sharePointWebUrl && (
            <a href={doc.sharePointWebUrl} target="_blank" rel="noreferrer" className="ml-2 text-indigo-300">Open</a>
          )}
        </li>
      ))}
      {documents.length === 0 && <li className="text-sm text-slate-500">No uploaded files yet.</li>}
    </ul>
  );

  const renderDisciplinaryStep = () => {
    if (currentStage === 'fact_finding') {
      return (
        <StepCard title="Step 1 — Fact-finding interview">
          <p className="text-sm text-slate-400">
            Hold an initial fact-finding interview (not a formal hearing). Record notes on the portal, then choose how the matter resolves.
          </p>

          <div className="rounded-lg border border-[#1a2540] p-3 space-y-3">
            <p className="text-sm font-medium text-slate-200">Unexpired disciplinary history</p>
            {history.length === 0 ? (
              <p className="text-sm text-slate-500">No unexpired warnings on record.</p>
            ) : (
              <ul className="space-y-2">
                {history.map((item) => (
                  <li key={item.id} className="text-sm text-slate-300 border border-[#1a2540] rounded-lg px-3 py-2">
                    {item.title} · {item.outcomePreset || '—'} · expires {item.warningExpiresAt || 'n/a'}
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              className={btnSecondary}
              disabled={saving || Boolean(caseData?.historyReviewedAt)}
              onClick={() => apiUpdate({ historyReviewed: true })}
            >
              {caseData?.historyReviewedAt ? 'History reviewed ✓' : 'Mark history reviewed'}
            </button>
          </div>

          <Field label="Investigator (for this fact-finding)">
            <EmployeeSelect
              value={caseData?.investigatorUid || ''}
              onChange={(uid) => apiUpdate({ investigatorUid: uid })}
              employees={employees}
              loading={employeesLoading}
              mode="managers"
              emptyLabel="Select investigator"
            />
          </Field>

          <div className="rounded-lg border border-[#1a2540] p-3 space-y-2">
            <p className="text-sm text-slate-300">Optional: precautionary suspension</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={btnSecondary}
                disabled={saving}
                onClick={() => apiUpdate({
                  precautionarySuspension: true,
                  suspensionFrom: new Date().toISOString().slice(0, 10),
                  suspensionReason: 'Precautionary pending investigation',
                })}
              >
                Start precautionary suspension
              </button>
              <button type="button" className={btnSecondary} disabled={saving || !caseData?.suspensionActive} onClick={() => apiUpdate({ endSuspension: true })}>
                End suspension
              </button>
            </div>
          </div>

          <div className="border-t border-[#1a2540] pt-4 space-y-4">
            <div>
              <p className="text-sm font-medium text-white">After fact-finding — choose one outcome</p>
              <p className="text-xs text-slate-400 mt-1">
                Record interview notes on the portal first (Documentation &amp; interviews below). Then pick the route that matches what happened.
              </p>
              {needsPortalInterview && (
                <p className="text-xs text-amber-300 mt-2">Record at least one interview for this stage before continuing.</p>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <ChoiceButton
                title="1. Close — no further action"
                help="Use when fact-finding shows no case to answer, or no action is needed. Brief close notes are kept on the case only — not a file note and not informal action."
                selected={selectedFactFindingOutcome === 'nfa'}
                disabled={saving || needsPortalInterview}
                onClick={() => setSelectedFactFindingOutcome('nfa')}
              />
              <ChoiceButton
                title="2. Close — informal action"
                help="Use when a quiet word or informal agreement resolved it (e.g. verbal reminder, agreed change). Recorded on the case but no file note document and not formal discipline."
                selected={selectedFactFindingOutcome === 'informal'}
                disabled={saving || needsPortalInterview}
                onClick={() => setSelectedFactFindingOutcome('informal')}
              />
              <ChoiceButton
                title="3. Issue file note for improvement"
                help="Use when standards must improve but formal discipline is not appropriate yet. Generates a printable file note for the personnel file — may be considered if issues recur."
                selected={selectedFactFindingOutcome === 'file_note'}
                disabled={saving || needsPortalInterview}
                onClick={() => setSelectedFactFindingOutcome('file_note')}
              />
              <ChoiceButton
                primary
                title="4. Schedule formal hearing →"
                help="Use when the concern is serious, informal steps failed, or you are proceeding straight to formal discipline. Next step is the hearing invite."
                selected={selectedFactFindingOutcome === 'formal_hearing'}
                disabled={saving || needsPortalInterview}
                onClick={() => setSelectedFactFindingOutcome('formal_hearing')}
              />
            </div>

            {selectedFactFindingOutcome && (
              <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-4 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-indigo-100">Complete your chosen outcome</p>
                  <button
                    type="button"
                    className="text-xs text-slate-400 hover:text-slate-200"
                    onClick={() => setSelectedFactFindingOutcome('')}
                  >
                    Choose a different outcome
                  </button>
                </div>

                {selectedFactFindingOutcome === 'nfa' && (
                  <>
                    <Field label="Close notes">
                      <textarea
                        value={closeNotes}
                        onChange={(e) => setCloseNotes(e.target.value)}
                        rows={4}
                        className={inputClass}
                        placeholder="Why is the case being closed with no further action?"
                      />
                    </Field>
                    <button
                      type="button"
                      className={btnPrimary}
                      disabled={saving || !closeNotes.trim()}
                      onClick={closeWithNotes}
                    >
                      Close case — no further action
                    </button>
                  </>
                )}

                {selectedFactFindingOutcome === 'informal' && (
                  <>
                    <Field label="What was said or agreed">
                      <textarea
                        value={informalActionDetails}
                        onChange={(e) => setInformalActionDetails(e.target.value)}
                        rows={4}
                        className={inputClass}
                        placeholder="e.g. Verbal reminder given; employee agreed to improve attendance."
                      />
                    </Field>
                    <button
                      type="button"
                      className={btnPrimary}
                      disabled={saving || !informalActionDetails.trim()}
                      onClick={closeAsInformalAction}
                    >
                      Close case — informal action
                    </button>
                  </>
                )}

                {selectedFactFindingOutcome === 'file_note' && (
                  <>
                    <Field label="Reason the file note is being issued">
                      <textarea
                        value={fileNoteReason}
                        onChange={(e) => setFileNoteReason(e.target.value)}
                        rows={3}
                        className={inputClass}
                        placeholder="The reason improvement is required (shown on the file note document)."
                      />
                    </Field>
                    <Field label="Improvement or action required">
                      <textarea
                        value={fileNoteActionRequired}
                        onChange={(e) => setFileNoteActionRequired(e.target.value)}
                        rows={3}
                        className={inputClass}
                        placeholder="What the employee must do differently going forward."
                      />
                    </Field>
                    <p className="text-xs text-slate-400">
                      Issuing applies your digital signature automatically and sends the file note to the employee portal for their digital signature. Print / scan / upload remains available as a backup on the closed case.
                    </p>
                    <button
                      type="button"
                      className={btnPrimary}
                      disabled={saving || !fileNoteReason.trim() || !fileNoteActionRequired.trim()}
                      onClick={issueFileNoteForImprovement}
                    >
                      Issue to portal &amp; apply my signature
                    </button>
                  </>
                )}

                {selectedFactFindingOutcome === 'formal_hearing' && (
                  <>
                    <p className="text-sm text-slate-300">
                      You will move to the hearing invite step to set a date, send the portal invite, and prepare the formal hearing.
                    </p>
                    <button
                      type="button"
                      className={btnPrimary}
                      disabled={saving}
                      onClick={() => apiUpdate({ stage: 'hearing_invite' })}
                    >
                      Continue to schedule formal hearing
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </StepCard>
      );
    }

    if (currentStage === 'hearing_invite') {
      const inviteIssued = Boolean(caseData?.hearingInviteIssuedAt);
      return (
        <StepCard title="Step 2 — Schedule formal hearing">
          <p className="text-sm text-slate-400">
            Choose the hearing date, send the invite through the portal, and print a copy if you are handing it over in person.
          </p>

          <Field label="Hearing manager">
            <EmployeeSelect
              value={caseData?.hearingManagerUid || ''}
              onChange={(uid) => apiUpdate({ hearingManagerUid: uid })}
              employees={employees}
              loading={employeesLoading}
              mode="managers"
              emptyLabel="Select hearing manager"
            />
          </Field>
          {caseData?.investigatorUid
            && caseData?.hearingManagerUid
            && caseData.investigatorUid === caseData.hearingManagerUid && (
            <label className="flex items-start gap-2 text-sm text-amber-200">
              <input
                type="checkbox"
                checked={acknowledgeSameInvestigator}
                onChange={(e) => setAcknowledgeSameInvestigator(e.target.checked)}
              />
              Same person investigating and hearing (Acas: where practicable use different people). I acknowledge.
            </label>
          )}

          <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 p-4 space-y-2">
            <p className="text-sm font-medium text-amber-100">Acas notice guidance</p>
            <p className="text-sm text-amber-50/90">
              Acas does not set a fixed number of days. Notice must be reasonable so the employee can prepare and arrange a companion.
              A common practice is about <strong>{RECOMMENDED_HEARING_NOTICE_WORKING_DAYS} working days</strong>.
            </p>
            <button
              type="button"
              className={btnSecondary}
              disabled={saving}
              onClick={() => setHearingForm((prev) => ({ ...prev, hearingScheduledAt: suggestedHearingDate }))}
            >
              Use suggested date ({suggestedHearingDate})
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="Hearing date">
              <input
                type="date"
                className={inputClass}
                min={todayIso}
                value={hearingForm.hearingScheduledAt}
                onChange={(e) => setHearingForm((prev) => ({ ...prev, hearingScheduledAt: e.target.value }))}
              />
            </Field>
            <Field label="Time">
              <input
                type="time"
                className={inputClass}
                value={hearingForm.hearingScheduledTime}
                onChange={(e) => setHearingForm((prev) => ({ ...prev, hearingScheduledTime: e.target.value }))}
              />
            </Field>
            <Field label="Location">
              <input
                className={inputClass}
                placeholder="e.g. Depot meeting room"
                value={hearingForm.hearingLocation}
                onChange={(e) => setHearingForm((prev) => ({ ...prev, hearingLocation: e.target.value }))}
              />
            </Field>
          </div>

          {hearingForm.hearingScheduledAt && (
            <p className={`text-sm ${hearingNoticeVeryShort ? 'text-red-300' : hearingNoticeShort ? 'text-amber-200' : 'text-emerald-300'}`}>
              Notice from today: {hearingNoticeDays} working day{hearingNoticeDays === 1 ? '' : 's'}
              {hearingNoticeShort
                ? ` — shorter than the usual ${RECOMMENDED_HEARING_NOTICE_WORKING_DAYS}-day practice.`
                : ' — within usual reasonable notice.'}
            </p>
          )}

          <Field label="Extra details for the invite (optional)">
            <textarea
              rows={3}
              className={inputClass}
              placeholder="e.g. Allegations to cover, documents enclosed, room access notes…"
              value={hearingForm.hearingInviteNotes}
              onChange={(e) => setHearingForm((prev) => ({ ...prev, hearingInviteNotes: e.target.value }))}
            />
          </Field>

          {hearingNoticeShort && (
            <label className="flex items-start gap-2 text-sm text-amber-200">
              <input
                type="checkbox"
                checked={acknowledgeShortNotice}
                onChange={(e) => setAcknowledgeShortNotice(e.target.checked)}
              />
              I understand this is shorter than usual Acas-aligned notice and still want to proceed.
            </label>
          )}

          {inviteIssued ? (
            <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 p-4 space-y-2">
              <p className="text-sm font-medium text-emerald-100">Invite sent to the employee portal</p>
              <p className="text-sm text-emerald-50/90">
                Hearing: {caseData.hearingScheduledAt}
                {caseData.hearingScheduledTime ? ` at ${caseData.hearingScheduledTime}` : ''}
                {caseData.hearingLocation ? ` · ${caseData.hearingLocation}` : ''}
              </p>
              <p className="text-xs text-emerald-100/80">Right to be accompanied is included on the invite.</p>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={btnPrimary}
              disabled={saving || !hearingForm.hearingScheduledAt}
              onClick={handleSendHearingInvite}
            >
              {inviteIssued ? 'Re-send invite via portal' : 'Send invite via portal'}
            </button>
            <button
              type="button"
              className={btnSecondary}
              disabled={saving || !hearingForm.hearingScheduledAt}
              onClick={handlePrintInvite}
            >
              Print invite
            </button>
            <button
              type="button"
              className={btnSecondary}
              disabled={saving || !inviteIssued}
              onClick={() => apiUpdate({ markDeliveredInPerson: true })}
            >
              {caseData?.hearingInviteDeliveredInPerson ? 'Marked delivered in person ✓' : 'Mark delivered in person'}
            </button>
            <button
              type="button"
              className={btnSecondary}
              disabled={saving}
              onClick={() => apiUpdate({
                evidenceDocumentIds: documents.filter((d) => d.documentType === 'evidence').map((d) => d.id),
              })}
            >
              Attach evidence bundle
            </button>
          </div>

          <div className="border-t border-[#1a2540] pt-4">
            <p className="text-sm text-slate-400 mb-3">Attach evidence using Add documentation below before continuing.</p>
          </div>

          <ChoiceRow>
            <ChoiceButton
              title="← Back to fact-finding"
              help="Only if you need to amend fact-finding before the hearing."
              disabled={saving}
              onClick={() => apiUpdate({ stage: 'fact_finding' })}
            />
            <ChoiceButton
              primary
              title="Invite ready — hold hearing →"
              help="Continue once the portal invite has been sent."
              disabled={saving || !inviteIssued}
              onClick={() => apiUpdate({ stage: 'hearing' })}
            />
          </ChoiceRow>
        </StepCard>
      );
    }

    if (currentStage === 'hearing') {
      return (
        <StepCard title="Step 3 — Formal hearing">
          <p className="text-sm text-slate-400">
            Hold the hearing, record companion attendance, and record the hearing using Add documentation below.
          </p>
          {(caseData?.hearingScheduledAt || caseData?.hearingLocation) && (
            <div className="rounded-lg border border-[#1a2540] px-3 py-2 text-sm text-slate-300">
              Scheduled: {caseData.hearingScheduledAt || '—'}
              {caseData.hearingScheduledTime ? ` at ${caseData.hearingScheduledTime}` : ''}
              {caseData.hearingLocation ? ` · ${caseData.hearingLocation}` : ''}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={Boolean(caseData?.companionAttended)}
                onChange={(e) => apiUpdate({ companionAttended: e.target.checked })}
              />
              Companion attended
            </label>
            <Field label="Companion name">
              <input
                className={inputClass}
                defaultValue={caseData?.companionName || ''}
                onBlur={(e) => apiUpdate({ companionName: e.target.value, companionRequested: Boolean(e.target.value) })}
              />
            </Field>
            <Field label="Postpone (companion ≤5 working days)">
              <input
                type="date"
                className={inputClass}
                defaultValue={caseData?.hearingPostponedTo || ''}
                min={new Date().toISOString().slice(0, 10)}
                max={addWorkingDaysIso(new Date(), 5)}
                onChange={(e) => apiUpdate({ hearingPostponedTo: e.target.value })}
              />
            </Field>
          </div>
          <ChoiceRow>
            <ChoiceButton
              title="← Back to invite"
              disabled={saving}
              onClick={() => apiUpdate({ stage: 'hearing_invite' })}
            />
            <ChoiceButton
              primary
              title="Hearing complete — decide outcome →"
              disabled={saving || needsPortalInterview}
              onClick={() => apiUpdate({ stage: 'outcome_pack' })}
            />
          </ChoiceRow>
          {needsPortalInterview && (
            <p className="text-xs text-amber-300">Record hearing interview notes on the portal before continuing.</p>
          )}
        </StepCard>
      );
    }

    if (currentStage === 'outcome_pack') {
      return (
        <StepCard title="Step 4 — Outcome">
          <p className="text-sm text-slate-400">Select an outcome, complete the document pack using Add documentation below, then close the case.</p>
          {consistency.length > 0 && (
            <div className="rounded-lg border border-[#1a2540] p-3">
              <p className="text-xs uppercase text-slate-500 mb-2">Consistency snapshot (similar closed cases)</p>
              <ul className="space-y-1 text-sm text-slate-300">
                {consistency.map((item) => (
                  <li key={item.id}>{item.outcomePreset} · {item.closedAt?.slice?.(0, 10) || '—'}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {OUTCOME_PRESETS.filter((p) => p.id !== 'informal_action').map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={`px-3 py-1.5 rounded-lg text-sm border ${
                  caseData?.outcomePreset === preset.id
                    ? 'bg-indigo-600 border-indigo-500 text-white'
                    : 'border-[#1a2540] text-slate-300 hover:bg-[#060e1a]'
                }`}
                disabled={saving}
                onClick={() => selectOutcome(preset.id)}
              >
                {preset.label}
              </button>
            ))}
          </div>
          {(caseData?.warningEffectiveAt || caseData?.warningExpiresAt) && (
            <p className="text-sm text-slate-400">
              Warning live {caseData.warningEffectiveAt} → {caseData.warningExpiresAt}
            </p>
          )}
          <ul className="space-y-2">
            {(caseData?.outcomePackSteps || []).map((step) => (
              <li key={step.id} className="flex items-center justify-between gap-3 text-sm border border-[#1a2540] rounded-lg px-3 py-2">
                <span className={step.done ? 'text-emerald-300' : 'text-slate-300'}>
                  {step.done ? '✓ ' : ''}{step.label}
                </span>
                {!step.done && step.id !== 'mark_complete' && (
                  <button type="button" className={btnSecondary} disabled={saving} onClick={() => apiUpdate({ completePackStepId: step.id })}>
                    Complete
                  </button>
                )}
              </li>
            ))}
          </ul>
          {(caseData?.outcomePreset === 'pip' || caseData?.outcomePreset === 'training_required') && (
            <div className="rounded-lg border border-[#1a2540] p-3 space-y-3">
              <p className="text-sm font-medium text-slate-200">Schedule follow-up review</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label="Review title">
                  <input value={reviewTitle} onChange={(e) => setReviewTitle(e.target.value)} className={inputClass} />
                </Field>
                <Field label="Due date">
                  <input type="date" value={reviewDueAt} onChange={(e) => setReviewDueAt(e.target.value)} className={inputClass} />
                </Field>
              </div>
              <button type="button" className={btnSecondary} disabled={saving || !reviewDueAt} onClick={scheduleReview}>
                Add review
              </button>
              <ul className="space-y-2">
                {reviews.map((item) => (
                  <li key={item.id} className="text-sm text-slate-300">{item.title} · due {item.dueAt} · {item.status}</li>
                ))}
              </ul>
            </div>
          )}
          <button
            type="button"
            className={btnPrimary}
            disabled={saving || !caseData?.outcomePreset}
            onClick={() => apiUpdate({ closeCase: true })}
          >
            Complete pack & close case
          </button>
        </StepCard>
      );
    }

    if (currentStage === 'closed') {
      return (
        <StepCard title="Case closed">
          {caseData?.outcomePreset === 'informal_action' ? (
            <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-4">
              <p className="text-sm font-medium text-emerald-100">Closed as informal action</p>
              <p className="text-sm text-emerald-50/90 mt-1 whitespace-pre-wrap">
                {caseData.informalActionDetails || 'Informal action was recorded.'}
              </p>
            </div>
          ) : caseData?.outcomePreset === 'file_note_for_improvement' ? (
            renderFileNoteSigningPanel()
          ) : (
            <div className="space-y-2 text-sm text-slate-300">
              <p>Outcome: <span className="text-white">{caseData?.outcomePreset || '—'}</span></p>
              {caseData?.closeNotes && (
                <p className="whitespace-pre-wrap text-slate-400">Notes: {caseData.closeNotes}</p>
              )}
              {caseData?.appealWindowEndsAt && (
                <p className="text-slate-400">Appeal window ends: {String(caseData.appealWindowEndsAt).slice(0, 10)}</p>
              )}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btnSecondary} disabled={saving} onClick={exportCase}>
              Export pack
            </button>
          </div>
          {caseData?.outcomePreset !== 'informal_action' && caseData?.outcomePreset !== 'file_note_for_improvement' && (
            <div className="border-t border-[#1a2540] pt-4 space-y-3">
              <p className="text-sm font-medium text-white">Appeal</p>
              <Field label="Appeal owner (should differ from decision-maker)">
                <EmployeeSelect
                  value={caseData?.appealOwnerUid || ''}
                  onChange={(uid) => apiUpdate({ appealOwnerUid: uid })}
                  employees={employees}
                  loading={employeesLoading}
                  mode="managers"
                  emptyLabel="Select appeal owner"
                />
              </Field>
              <label className="flex items-start gap-2 text-sm text-amber-200">
                <input type="checkbox" checked={acknowledgeSameAppealOwner} onChange={(e) => setAcknowledgeSameAppealOwner(e.target.checked)} />
                Override: allow same person as original decision-maker for appeal
              </label>
              <button
                type="button"
                className={btnPrimary}
                disabled={saving}
                onClick={() => apiUpdate({
                  initiateAppeal: true,
                  appealOwnerUid: caseData?.appealOwnerUid || '',
                  acknowledgeSameAppealOwner,
                })}
              >
                Log appeal & reopen case
              </button>
            </div>
          )}
        </StepCard>
      );
    }

    if (currentStage === 'appeal') {
      return (
        <StepCard title="Appeal">
          <p className="text-sm text-slate-400">Complete the appeal hearing and outcome, then close again.</p>
          <Field label="Appeal owner">
            <EmployeeSelect
              value={caseData?.appealOwnerUid || caseData?.ownerManagerUid || ''}
              onChange={(uid) => apiUpdate({ appealOwnerUid: uid, ownerManagerUid: uid })}
              employees={employees}
              loading={employeesLoading}
              mode="managers"
              emptyLabel="Select appeal owner"
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            {OUTCOME_PRESETS.filter((p) => p.id !== 'informal_action').map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={`px-3 py-1.5 rounded-lg text-sm border ${
                  caseData?.outcomePreset === preset.id
                    ? 'bg-indigo-600 border-indigo-500 text-white'
                    : 'border-[#1a2540] text-slate-300 hover:bg-[#060e1a]'
                }`}
                disabled={saving}
                onClick={() => selectOutcome(preset.id)}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <button type="button" className={btnPrimary} disabled={saving} onClick={() => apiUpdate({ closeCase: true, forceClose: true })}>
            Close after appeal
          </button>
        </StepCard>
      );
    }

    return (
      <StepCard title={stageLabel(currentStage) || 'Case'}>
        <p className="text-sm text-slate-400">This stage is not recognised. Use secondary tools below if needed.</p>
      </StepCard>
    );
  };

  const renderGrievanceStep = () => {
    if (currentStage === 'acknowledged') {
      return (
        <StepCard title="Step 1 — Acknowledge grievance">
          <p className="text-sm text-slate-400">Confirm receipt and plan investigation.</p>
          <ChoiceButton
            primary
            title="Acknowledged — start investigation →"
            disabled={saving}
            onClick={() => apiUpdate({ stage: 'investigation' })}
          />
        </StepCard>
      );
    }
    if (currentStage === 'investigation') {
      return (
        <StepCard title="Step 2 — Investigate">
          <Field label="Investigator">
            <EmployeeSelect
              value={caseData?.investigatorUid || ''}
              onChange={(uid) => apiUpdate({ investigatorUid: uid })}
              employees={employees}
              loading={employeesLoading}
              mode="managers"
              emptyLabel="Select investigator"
            />
          </Field>
          <ChoiceRow>
            <ChoiceButton title="Close with notes" disabled={saving || !closeNotes.trim()} onClick={closeWithNotes} />
            <ChoiceButton
              primary
              title="Arrange grievance meeting →"
              disabled={saving || needsPortalInterview}
              onClick={() => apiUpdate({ stage: 'meeting' })}
            />
          </ChoiceRow>
          {needsPortalInterview && (
            <p className="text-xs text-amber-300">Record investigation interview notes on the portal before continuing.</p>
          )}
          <Field label="Close notes (if closing)">
            <textarea value={closeNotes} onChange={(e) => setCloseNotes(e.target.value)} rows={2} className={inputClass} />
          </Field>
        </StepCard>
      );
    }
    if (currentStage === 'meeting') {
      return (
        <StepCard title="Step 3 — Grievance meeting">
          <ChoiceButton
            primary
            title="Meeting done — decide outcome →"
            disabled={saving || needsPortalInterview}
            onClick={() => apiUpdate({ stage: 'outcome_pack' })}
          />
          {needsPortalInterview && (
            <p className="text-xs text-amber-300 mt-2">Record meeting interview notes on the portal before continuing.</p>
          )}
        </StepCard>
      );
    }
    if (currentStage === 'outcome_pack' || currentStage === 'closed' || currentStage === 'appeal') {
      return renderDisciplinaryStep();
    }
    return renderDisciplinaryStep();
  };

  const renderAccidentStep = () => {
    if (currentStage === 'triage') {
      return (
        <StepCard title="Step 1 — Triage">
          <p className="text-sm text-slate-400">Confirm the incident details and who is involved.</p>
          <ChoiceButton primary title="Start investigation →" disabled={saving} onClick={() => apiUpdate({ stage: 'investigation' })} />
        </StepCard>
      );
    }
    if (currentStage === 'investigation') {
      return (
        <StepCard title="Step 2 — Investigation">
          <ChoiceButton
            primary
            title="Investigation complete — training decision →"
            disabled={saving || needsPortalInterview}
            onClick={() => apiUpdate({ stage: 'training_decision' })}
          />
          {needsPortalInterview && (
            <p className="text-xs text-amber-300 mt-2">Record investigation interview notes on the portal before continuing.</p>
          )}
        </StepCard>
      );
    }
    if (currentStage === 'training_decision') {
      return (
        <StepCard title="Step 3 — Training team decision">
          <ChoiceRow>
            <ChoiceButton title="Training required" disabled={saving} onClick={() => apiUpdate({ trainingDecision: 'training_required', stage: 'training_decision' })} />
            <ChoiceButton title="Open linked disciplinary" disabled={saving} onClick={() => apiUpdate({ openLinkedDisciplinary: true })} />
            <ChoiceButton title="No further action — close" disabled={saving} onClick={() => apiUpdate({ trainingDecision: 'no_further_action' })} />
          </ChoiceRow>
          {caseData?.linkedDisciplinaryCaseId && (
            <button type="button" className="text-indigo-300 text-sm" onClick={() => navigate(`/dashboard/cases/${caseData.linkedDisciplinaryCaseId}`)}>
              Open linked disciplinary case
            </button>
          )}
          {caseData?.trainingDecision === 'training_required' && (
            <button type="button" className={btnPrimary} disabled={saving} onClick={() => apiUpdate({ closeCase: true, forceClose: true })}>
              Close after training decision
            </button>
          )}
        </StepCard>
      );
    }
    if (currentStage === 'closed') {
      return renderDisciplinaryStep();
    }
    return renderDisciplinaryStep();
  };

  const renderCurrentStep = () => {
    const step = viewingPastStage ? (
      <StepCard title={`Viewing — ${stageLabel(displayStage)}`}>
        <p className="text-sm text-slate-400">
          Historical view of this stage. Dates, choices, and who actioned them are in the progress panel above.
          Documentation and interviews for this stage are listed below — click Open for full details.
        </p>
      </StepCard>
    ) : family === 'grievance'
      ? renderGrievanceStep()
      : family === 'vehicle_accident'
        ? renderAccidentStep()
        : renderDisciplinaryStep();
    return (
      <div className="space-y-6">
        {step}
        {documentationHub}
      </div>
    );
  };

  if (!isNew && (loading || !caseData)) {
    if (error && !loading) {
      return (
        <div className="p-8 space-y-4 max-w-lg">
          <div className="bg-red-500/10 border border-red-500/25 rounded-lg p-4 text-sm text-red-300">{error}</div>
          <button type="button" onClick={() => navigate('/dashboard/cases')} className={btnSecondary}>
            Back to cases
          </button>
        </div>
      );
    }
    return <div className="p-8 text-sm text-slate-400">Loading case…</div>;
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-8 py-5 border-b border-[#1a2540] gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-white">
            {isNew ? 'New people case' : (caseData?.title || 'Case')}
          </h1>
          {!isNew && (
            <div className="mt-1 space-y-1">
              <p className="text-sm text-slate-400">
                {caseData?.employeeNameSnapshot || 'Unknown employee'}
                {' · '}
                {String(family).replace(/_/g, ' ')}
                {caseData?.suspensionActive ? ' · Suspension active' : ''}
              </p>
              {(() => {
                const progress = getCaseProgressStatus(caseData || {});
                return (
                  <span className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-sm font-medium ${caseProgressToneClass(progress.tone)}`}>
                    {progress.label}
                  </span>
                );
              })()}
            </div>
          )}
        </div>
        <div className="flex gap-2">
          {!isNew && currentStage === 'closed' && (
            <button type="button" onClick={exportCase} className={btnSecondary} disabled={saving}>
              Export pack
            </button>
          )}
          <button type="button" onClick={() => navigate('/dashboard/cases')} className={btnSecondary}>
            Back to cases
          </button>
        </div>
      </div>

      <div className="p-8 space-y-6 overflow-auto">
        {error && <div className="bg-red-500/10 border border-red-500/25 rounded-lg p-4 text-sm text-red-300">{error}</div>}
        {message && <div className="bg-emerald-500/10 border border-emerald-500/25 rounded-lg p-4 text-sm text-emerald-300">{message}</div>}

        {isNew ? (
          <div className="bg-[#0b1220] border border-[#1a2540] rounded-xl p-5 space-y-4 max-w-3xl">
            <div>
              <p className="text-sm font-medium text-white">Step 0 — Open the case</p>
              <p className="text-sm text-slate-400 mt-1">
                Record the concern and open the case. You can hold interviews, upload notes, and decide later whether it resolves informally or goes formal.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Process family">
                <select name="processFamily" value={form.processFamily} onChange={handleChange} className={inputClass}>
                  {PROCESS_FAMILIES.map((item) => (
                    <option key={item.id} value={item.id}>{item.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Case type">
                <select name="caseType" value={form.caseType} onChange={handleChange} className={inputClass}>
                  {CASE_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
              </Field>
              <Field label="Employee">
                <EmployeeSelect
                  value={form.employeeUid}
                  onChange={handleEmployeeSelect}
                  employees={employees}
                  loading={employeesLoading}
                  mode="employees"
                  emptyLabel="Select an active employee"
                />
              </Field>
              <Field label="Owner manager (optional assign)">
                <EmployeeSelect
                  value={form.ownerManagerUid}
                  onChange={(uid) => setForm((prev) => ({ ...prev, ownerManagerUid: uid }))}
                  employees={employees}
                  loading={employeesLoading}
                  mode="managers"
                  emptyLabel="Defaults to you"
                />
              </Field>
            </div>
            <Field label="Title">
              <input name="title" value={form.title} onChange={handleChange} className={inputClass} />
            </Field>
            <Field label="Summary">
              <textarea name="summary" value={form.summary} onChange={handleChange} rows={4} className={inputClass} />
            </Field>

            {(form.processFamily === 'disciplinary' || form.processFamily === 'grievance') && (
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 space-y-4">
                <div>
                  <p className="text-sm font-medium text-amber-100">How are you starting?</p>
                  <p className="text-xs text-slate-400 mt-1">
                    This records your initial approach. Informal resolution is decided later on the case, after interviews and notes.
                  </p>
                </div>

                {!form.employeeUid && (
                  <p className="text-xs text-amber-300">
                    Select an employee above to see their informal resolution history before choosing how to start.
                  </p>
                )}

                {form.employeeUid && (
                  <div className="rounded-lg border border-[#1a2540] bg-[#060e1a]/60 p-3 space-y-2">
                    <p className="text-xs uppercase tracking-wide text-slate-500">
                      Informal resolutions — past 12 months
                    </p>
                    {informalHistoryLoading && (
                      <p className="text-xs text-slate-400">Loading…</p>
                    )}
                    {!informalHistoryLoading && informalHistory.length === 0 && (
                      <p className="text-xs text-slate-400">None on record in the last 12 months.</p>
                    )}
                    {!informalHistoryLoading && informalHistory.length > 0 && (
                      <ul className="space-y-2">
                        {informalHistory.map((item) => {
                          const outcomeLabels = {
                            informal_action: 'Informal action',
                            file_note_for_improvement: 'File note for improvement',
                            no_further_action: 'No further action',
                            verbal_warning: 'Verbal warning',
                            written_warning: 'Written warning',
                            final_written_warning: 'Final written warning',
                          };
                          const dateStr = item.closedAt
                            ? String(item.closedAt).slice(0, 10).split('-').reverse().join('/')
                            : '—';
                          const detail = item.informalActionDetails || item.fileNoteReason || item.closeNotes || '';
                          return (
                            <li key={item.id}>
                              <a
                                href={`/dashboard/cases/${item.id}`}
                                target="_blank"
                                rel="noreferrer"
                                className="block text-xs border-l-2 border-amber-500/30 pl-2.5 space-y-0.5 hover:border-amber-400/70 hover:bg-amber-500/5 rounded-r-md pr-1 py-0.5 transition-colors"
                              >
                                <p className="text-amber-200 font-medium">
                                  {outcomeLabels[item.outcomePreset] || item.outcomePreset}
                                  <span className="text-slate-400 font-normal"> · {dateStr}</span>
                                  <span className="text-slate-600 ml-1">↗</span>
                                </p>
                                <p className="text-slate-300 truncate">{item.title}</p>
                                {detail && <p className="text-slate-500 line-clamp-2">{detail}</p>}
                              </a>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                )}

                <div className="space-y-3">
                  {INFORMAL_RESOLUTION_OPTIONS.map((option) => (
                    <label
                      key={option.id}
                      className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 cursor-pointer ${
                        form.informalResolutionPath === option.id
                          ? 'border-amber-400/50 bg-amber-500/10'
                          : 'border-[#1a2540] bg-[#060e1a]/40'
                      }`}
                    >
                      <input
                        type="radio"
                        name="informalResolutionPath"
                        value={option.id}
                        checked={form.informalResolutionPath === option.id}
                        onChange={handleChange}
                        className="mt-1"
                      />
                      <span>
                        <span className="block text-sm text-slate-100">{option.label}</span>
                        <span className="block text-xs text-slate-500 mt-0.5">{option.help}</span>
                      </span>
                    </label>
                  ))}
                </div>

                {form.informalResolutionPath === 'proceed_formal' && (
                  <Field label="What informal steps were tried?">
                    <textarea name="informalNotes" value={form.informalNotes} onChange={handleChange} rows={3} className={inputClass} />
                  </Field>
                )}
                {form.informalResolutionPath === 'not_appropriate' && (
                  <Field label="Why is informal resolution not appropriate?">
                    <textarea name="informalNotAppropriateReason" value={form.informalNotAppropriateReason} onChange={handleChange} rows={3} className={inputClass} />
                  </Field>
                )}
              </div>
            )}

            {form.processFamily === 'grievance' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Off-portal raise date">
                  <input type="date" name="offPortalRaiseDate" value={form.offPortalRaiseDate} onChange={handleChange} className={inputClass} />
                </Field>
                <Field label="Off-portal raise notes">
                  <textarea name="offPortalRaiseNotes" value={form.offPortalRaiseNotes} onChange={handleChange} rows={2} className={inputClass} />
                </Field>
              </div>
            )}

            <button
              type="button"
              onClick={handleCreate}
              disabled={
                saving
                || !form.employeeUid
                || ((form.processFamily === 'disciplinary' || form.processFamily === 'grievance') && !form.informalResolutionPath)
              }
              className={btnPrimary}
            >
              {saving ? 'Saving…' : 'Open case — start fact-finding'}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-6">
            <div className="space-y-6">
              <CaseProgressRail
                stages={stages}
                currentStage={currentStage}
                viewStage={displayStage}
                onViewStageChange={setViewStage}
                caseData={caseData}
                events={events}
                minutes={minutes}
                documents={documents}
                employees={employees}
              />
              {renderCurrentStep()}

              <div className="bg-[#0b1220] border border-[#1a2540] rounded-xl">
                <button
                  type="button"
                  className="w-full flex items-center justify-between px-5 py-3 text-sm text-slate-300 hover:text-white"
                  onClick={() => setShowExtras((prev) => !prev)}
                >
                  <span>Documents, timeline & admin tools</span>
                  <span className="text-slate-500">{showExtras ? 'Hide' : 'Show'}</span>
                </button>
                {showExtras && (
                  <div className="px-5 pb-5 space-y-6 border-t border-[#1a2540] pt-4">
                    <div>
                      <h4 className="text-white font-medium mb-3">Documents</h4>
                      {uploadedDocumentsList}
                    </div>
                    <div>
                      <h4 className="text-white font-medium mb-3">Reassign / leaver</h4>
                      <Field label="Owner manager">
                        <EmployeeSelect
                          value={caseData?.ownerManagerUid || ''}
                          onChange={(uid) => uid && apiUpdate({ ownerManagerUid: uid })}
                          employees={employees}
                          loading={employeesLoading}
                          mode="managers"
                          emptyLabel="Select owner manager"
                        />
                      </Field>
                      <div className="flex flex-wrap gap-2 mt-3">
                        <button type="button" className={btnSecondary} disabled={saving} onClick={() => apiUpdate({ leaverAction: 'continue' })}>
                          Employee left — continue case
                        </button>
                        <button type="button" className={btnSecondary} disabled={saving} onClick={() => apiUpdate({ leaverAction: 'close' })}>
                          Employee left — close case
                        </button>
                      </div>
                    </div>
                    <div>
                      <h4 className="text-white font-medium mb-3">Timeline</h4>
                      <ul className="space-y-2">
                        {events.map((event) => (
                          <li key={event.id} className="text-sm text-slate-400 border-l border-[#1a2540] pl-3">
                            <span className="text-slate-200">{event.eventType}</span>
                            {event.createdAt ? ` · ${String(event.createdAt).slice(0, 19)}` : ''}
                          </li>
                        ))}
                      </ul>
                    </div>
                    {ALLOW_DELETE_CASES && (
                      <div className="border-t border-red-500/20 pt-4">
                        <h4 className="text-white font-medium mb-2">Testing — delete case</h4>
                        <p className="text-xs text-slate-500 mb-3">
                          Removes this case and all portal records permanently. SharePoint files are left in place.
                        </p>
                        <button
                          type="button"
                          className="px-3 py-2 text-sm rounded-lg border border-red-500/40 text-red-300 hover:bg-red-500/10 disabled:opacity-50"
                          disabled={saving}
                          onClick={deleteCase}
                        >
                          Delete entire case
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <CaseGuidePanel guide={caseData?.guide} stageLabel={stageLabel(currentStage)} />
          </div>
        )}
      </div>
    </div>
  );
}
