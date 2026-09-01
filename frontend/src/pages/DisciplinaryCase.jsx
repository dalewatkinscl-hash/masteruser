import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { readJsonResponse } from '../utils/employeeProfile';
import CaseGuidePanel from '../components/CaseGuidePanel';
import CaseStageDocuments from '../components/CaseStageDocuments';
import EmployeeSelect, { ManagerMultiSelect } from '../components/EmployeeSelect';
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
  stageLabel,
  stagesForFamily,
  getCaseProgressStatus,
  caseProgressToneClass,
} from '../utils/peopleCasesAccess';
import { buildHearingInviteHtml, printHearingInvite } from '../utils/hearingInvitePrint';

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

function ProgressRail({ stages, current }) {
  const currentIndex = Math.max(0, stages.indexOf(current));
  return (
    <div className="bg-[#0b1220] border border-[#1a2540] rounded-xl p-4">
      <p className="text-xs uppercase text-slate-500 mb-3">Case progress</p>
      <ol className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        {stages.map((stage, index) => {
          const done = index < currentIndex;
          const active = stage === current;
          return (
            <li key={stage} className="flex items-center gap-2">
              <span
                className={`inline-flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-xs font-medium border ${
                  active
                    ? 'bg-indigo-600 border-indigo-500 text-white'
                    : done
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
                      : 'border-[#1a2540] text-slate-500'
                }`}
              >
                {done ? '✓' : index + 1}
              </span>
              <span className={`text-sm ${active ? 'text-white font-medium' : done ? 'text-slate-300' : 'text-slate-500'}`}>
                {stageLabel(stage)}
              </span>
              {index < stages.length - 1 && (
                <span className="hidden sm:inline text-slate-600 mx-1">→</span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

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

function ChoiceButton({ title, help, onClick, disabled, primary }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`text-left rounded-xl border p-4 transition ${
        primary
          ? 'border-indigo-500/50 bg-indigo-500/10 hover:bg-indigo-500/15'
          : 'border-[#1a2540] bg-[#060e1a]/50 hover:bg-[#060e1a]'
      } disabled:opacity-50`}
    >
      <span className={`block text-sm font-medium ${primary ? 'text-indigo-100' : 'text-slate-100'}`}>{title}</span>
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
  const [uploading, setUploading] = useState(false);
  const [uploadType, setUploadType] = useState('evidence');
  const [minutesContent, setMinutesContent] = useState('');
  const [managersPresentUids, setManagersPresentUids] = useState([]);
  const [closeNotes, setCloseNotes] = useState('');
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
    informalResolutionPath: '',
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

  const meetingTypeForStage = useMemo(() => {
    if (family === 'grievance') return 'grievance_meeting';
    if (family === 'vehicle_accident') return 'accident_interview';
    if (currentStage === 'hearing') return 'hearing';
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
    if (isNew) return;
    const load = async () => {
      try {
        setLoading(true);
        setError('');
        await reload(caseId);
      } catch (err) {
        setError(err.message || 'Failed to load case.');
      } finally {
        setLoading(false);
      }
    };
    load();
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

  const handleUploadDocument = async (event, template = null) => {
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
          documentType: template?.documentType || uploadType,
          templateId: template?.id || '',
          stageKey: currentStage || '',
        }),
      });
      const data = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(data.error || 'Failed to upload document.');
      await reload();
      setMessage(data.sharePointFolderPath
        ? `Document uploaded to SharePoint: ${data.sharePointFolderPath}`
        : 'Document uploaded.');
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
          managersPresentUids,
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
          managersPresentUids,
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

  const stageDocumentsPanel = (
    <CaseStageDocuments
      templates={documentTemplates}
      missingDocuments={missingDocuments}
      sharePointConfigured={sharePointConfigured}
      sharePointPath={sharePointPath}
      sharePointFolderConfirmed={sharePointFolderConfirmed}
      uploading={uploading}
      saving={saving}
      onDownloadTemplate={handleDownloadTemplate}
      onUploadForTemplate={(template, event) => handleUploadDocument(event, template)}
      onIssueToEmployee={issueDocumentToEmployee}
      documentsBlock={null}
    />
  );

  const issueMinutes = async () => {
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/createCaseMinutes', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caseId,
          content: minutesContent,
          meetingType: meetingTypeForStage,
          managersPresentUids,
        }),
      });
      const data = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(data.error || 'Failed to issue minutes.');
      setMinutesContent('');
      setManagersPresentUids([]);
      setMessage('Minutes issued to employee.');
      await reload();
    } catch (err) {
      setError(err.message || 'Failed to issue minutes.');
    } finally {
      setSaving(false);
    }
  };

  const formatManagersPresent = (item) => {
    const list = Array.isArray(item?.managersPresent) ? item.managersPresent : [];
    if (list.length === 0) return null;
    return list.map((person) => person.name || person.uid).filter(Boolean).join(', ');
  };

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

  const minutesComposer = (
    <div className="space-y-3">
      <Field label="Managers present (can select more than one)">
        <ManagerMultiSelect
          value={managersPresentUids}
          onChange={setManagersPresentUids}
          employees={employees}
          loading={employeesLoading}
          disabled={saving}
          emptyHint="Add every manager who attended this interview / meeting"
        />
      </Field>
      <Field label="Minutes content">
        <textarea value={minutesContent} onChange={(e) => setMinutesContent(e.target.value)} rows={5} className={inputClass} />
      </Field>
      <button type="button" className={btnPrimary} disabled={saving || !minutesContent.trim()} onClick={issueMinutes}>
        Issue minutes to employee
      </button>
    </div>
  );

  const minutesList = (
    <ul className="space-y-2">
      {minutes.map((item) => {
        const presentLabel = formatManagersPresent(item);
        return (
          <li key={item.id} className="border border-[#1a2540] rounded-lg px-3 py-2 text-sm text-slate-300">
            <div className="flex justify-between gap-2">
              <span>{item.meetingType} · {item.status}</span>
              <span className="text-xs text-slate-500">{item.createdAt?.slice?.(0, 10) || ''}</span>
            </div>
            {presentLabel && (
              <p className="text-xs text-slate-500 mt-1">Managers present: {presentLabel}</p>
            )}
            {(item.sharePointWebUrl || item.fileName) && (
              <p className="text-xs text-indigo-300 mt-1">
                Document: {item.fileName || 'attached'}
                {item.sharePointWebUrl && (
                  <a href={item.sharePointWebUrl} target="_blank" rel="noreferrer" className="ml-2 underline">Open</a>
                )}
              </p>
            )}
            <p className="text-slate-400 mt-1 whitespace-pre-wrap">{item.content}</p>
            {item.disputed && <p className="text-amber-300 text-xs mt-1">Disputed — both versions retained</p>}
          </li>
        );
      })}
    </ul>
  );

  const documentsBlock = (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3 items-center">
        <select value={uploadType} onChange={(e) => setUploadType(e.target.value)} className={`${inputClass} w-auto`}>
          {DOCUMENT_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
        </select>
        <label className={`${btnSecondary} cursor-pointer`}>
          {uploading ? 'Uploading…' : 'Upload file'}
          <input type="file" className="hidden" onChange={handleUploadDocument} disabled={uploading} />
        </label>
        {!sharePointConfigured && (
          <span className="text-xs text-amber-300">SharePoint not configured — uploads may fail</span>
        )}
      </div>
      <ul className="space-y-2">
        {documents.map((doc) => (
          <li key={doc.id} className="text-sm text-slate-300">
            {doc.documentType}: {doc.fileName}
            {doc.sharePointWebUrl && (
              <a href={doc.sharePointWebUrl} target="_blank" rel="noreferrer" className="ml-2 text-indigo-300">Open</a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );

  const renderDisciplinaryStep = () => {
    if (currentStage === 'fact_finding') {
      return (
        <StepCard title="Step 1 — Fact-finding interview">
          <p className="text-sm text-slate-400">
            Hold an initial fact-finding interview. This is not a formal hearing. Afterwards, either close with notes or schedule a hearing.
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

          <Field label="Managers present (for notes / send to employee)">
            <ManagerMultiSelect
              value={managersPresentUids}
              onChange={setManagersPresentUids}
              employees={employees}
              loading={employeesLoading}
              disabled={saving}
              emptyHint="Add every manager who attended this interview"
            />
          </Field>

          {stageDocumentsPanel}

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

          <div className="border-t border-[#1a2540] pt-4 space-y-3">
            <p className="text-sm font-medium text-white">After fact-finding — choose one</p>
            <Field label="Close notes (required if closing now)">
              <textarea
                value={closeNotes}
                onChange={(e) => setCloseNotes(e.target.value)}
                rows={3}
                className={inputClass}
                placeholder="e.g. Fact-finding showed no case to answer; informal coaching given; no formal hearing needed."
              />
            </Field>
            <ChoiceRow>
              <ChoiceButton
                title="Close with notes"
                help="No formal hearing. Case closes as no further action with your notes on file."
                disabled={saving || !closeNotes.trim()}
                onClick={closeWithNotes}
              />
              <ChoiceButton
                primary
                title="Schedule formal hearing →"
                help="Move to the next step: issue hearing invite and evidence pack."
                disabled={saving}
                onClick={() => apiUpdate({ stage: 'hearing_invite' })}
              />
            </ChoiceRow>
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
            <p className="text-sm text-slate-400 mb-3">Upload additional evidence if needed.</p>
            {stageDocumentsPanel}
            <div className="mt-4">{documentsBlock}</div>
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
            Hold the hearing, record companion attendance, and issue hearing minutes for sign-off.
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
          <div className="space-y-3">
            <p className="text-sm font-medium text-slate-200">Hearing minutes</p>
            {minutesComposer}
            {minutesList}
          </div>
          {stageDocumentsPanel}
          <ChoiceRow>
            <ChoiceButton
              title="← Back to invite"
              disabled={saving}
              onClick={() => apiUpdate({ stage: 'hearing_invite' })}
            />
            <ChoiceButton
              primary
              title="Hearing complete — decide outcome →"
              disabled={saving}
              onClick={() => apiUpdate({ stage: 'outcome_pack' })}
            />
          </ChoiceRow>
        </StepCard>
      );
    }

    if (currentStage === 'outcome_pack') {
      return (
        <StepCard title="Step 4 — Outcome">
          <p className="text-sm text-slate-400">Select an outcome, complete the document pack, then close the case.</p>
          {stageDocumentsPanel}
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
                {caseData.informalActionDetails || 'Informal action was recorded at case creation.'}
              </p>
            </div>
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
          {caseData?.outcomePreset !== 'informal_action' && (
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
          <div className="space-y-3">
            <p className="text-sm font-medium text-slate-200">Appeal minutes</p>
            {minutesComposer}
            {minutesList}
          </div>
          {stageDocumentsPanel}
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
          <div className="space-y-3">
            <p className="text-sm font-medium text-slate-200">Investigation notes / minutes</p>
            {minutesComposer}
            {minutesList}
          </div>
          {stageDocumentsPanel}
          <ChoiceRow>
            <ChoiceButton title="Close with notes" disabled={saving || !closeNotes.trim()} onClick={closeWithNotes} />
            <ChoiceButton primary title="Arrange grievance meeting →" disabled={saving} onClick={() => apiUpdate({ stage: 'meeting' })} />
          </ChoiceRow>
          <Field label="Close notes (if closing)">
            <textarea value={closeNotes} onChange={(e) => setCloseNotes(e.target.value)} rows={2} className={inputClass} />
          </Field>
        </StepCard>
      );
    }
    if (currentStage === 'meeting') {
      return (
        <StepCard title="Step 3 — Grievance meeting">
          <div className="space-y-3">
            <p className="text-sm font-medium text-slate-200">Meeting minutes</p>
            {minutesComposer}
            {minutesList}
          </div>
          {stageDocumentsPanel}
          <ChoiceButton primary title="Meeting done — decide outcome →" disabled={saving} onClick={() => apiUpdate({ stage: 'outcome_pack' })} />
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
          <div className="space-y-3">
            <p className="text-sm font-medium text-slate-200">Interview minutes</p>
            {minutesComposer}
            {minutesList}
          </div>
          {stageDocumentsPanel}
          {documentsBlock}
          <ChoiceButton primary title="Investigation complete — training decision →" disabled={saving} onClick={() => apiUpdate({ stage: 'training_decision' })} />
        </StepCard>
      );
    }
    if (currentStage === 'training_decision') {
      return (
        <StepCard title="Step 3 — Training team decision">
          {stageDocumentsPanel}
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
    if (family === 'grievance') return renderGrievanceStep();
    if (family === 'vehicle_accident') return renderAccidentStep();
    return renderDisciplinaryStep();
  };

  if (loading) {
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
                Record the concern, then either dismiss informally with notes, or open a formal case and continue step by step.
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
                  <p className="text-sm font-medium text-amber-100">Informal resolution (Acas)</p>
                  <p className="text-xs text-slate-400 mt-1">
                    Choose one path. If informal action resolves it, record what happened and the case closes immediately but stays on file.
                  </p>
                </div>
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
                {form.informalResolutionPath === 'informal_action_taken' && (
                  <Field label="Informal action taken (what was said / agreed)">
                    <textarea
                      name="informalActionDetails"
                      value={form.informalActionDetails}
                      onChange={handleChange}
                      rows={4}
                      className={inputClass}
                      placeholder="e.g. Quiet word on 27 Aug about lateness; employee agreed to improve; no formal warning issued."
                    />
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
              {saving
                ? 'Saving…'
                : form.informalResolutionPath === 'informal_action_taken'
                  ? 'Record informal action & close'
                  : 'Open case — start fact-finding'}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-6">
            <div className="space-y-6">
              <ProgressRail stages={stages} current={currentStage} />
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
                      {documentsBlock}
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
