import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { readJsonResponse } from '../utils/employeeProfile';
import CaseGuidePanel from '../components/CaseGuidePanel';
import CaseDocumentationHub from '../components/CaseDocumentationHub';
import CaseProgressRail from '../components/CaseProgressRail';
import EmployeeSelect from '../components/EmployeeSelect';
import { useAuth } from '../context/AuthContext';
import {
  INFORMAL_RESOLUTION_OPTIONS,
  MINIMUM_HEARING_NOTICE_WORKING_HOURS,
  OUTCOME_PRESETS,
  PROCESS_FAMILIES,
  addMonthsIso,
  addWorkingDaysIso,
  countWorkingDaysNotice,
  countWorkingHoursNotice,
  parseHearingDateTime,
  normalizeStage,
  stageAllowsDocumentation,
  stageLabel,
  stagesForFamily,
  stagesForCaseDisplay,
  getCaseProgressStatus,
  caseProgressToneClass,
  describePriorCaseInvolvement,
  RESTRICTION_OPTIONS,
} from '../utils/peopleCasesAccess';
import { nameForUid } from '../utils/caseStageHistory';
import { buildHearingInviteHtml, printHearingInvite } from '../utils/hearingInvitePrint';
import { buildFileNoteForImprovementHtml, printHtmlDocument } from '../utils/fileNoteForImprovementPrint';
import { ALLOW_DELETE_CASES } from '../utils/featureFlags';
import { isAmendmentPending } from '../utils/interviewNotes';
import { buildHearingCalendarOffer, buildReviewCalendarOffer, downloadIcsFromOffer } from '../utils/calendarLinks';

const CASE_TYPES = [
  'attendance',
  'conduct',
  'performance',
  'policy',
  'capability',
  'grievance',
  'vehicle_accident',
  'other',
];
const DOCUMENT_TYPES = ['evidence', 'letter', 'minutes', 'warning', 'outcome', 'invite', 'suspension_letter', 'training_outline', 'pip_plan', 'other'];

function defaultCaseTypeForFamily(processFamily) {
  if (processFamily === 'grievance') return 'grievance';
  if (processFamily === 'vehicle_accident') return 'vehicle_accident';
  if (processFamily === 'samsara_coaching') return 'samsara_coaching';
  return 'conduct';
}

function isSamsaraCreateForm(form = {}) {
  return form.processFamily === 'samsara_coaching' || form.caseType === 'samsara_coaching';
}

function formatHistoryDate(value) {
  if (!value) return '—';
  const text = String(value).slice(0, 10);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-GB');
}

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

function CalendarOffersBlock({ events, compact = false }) {
  if (!Array.isArray(events) || !events.length) return null;
  return (
    <div className={`rounded-lg border border-sky-500/25 bg-sky-500/10 ${compact ? 'p-3' : 'p-4'} space-y-3`}>
      <div>
        <p className={`font-medium text-sky-100 ${compact ? 'text-sm' : 'text-sm'}`}>Add to your calendar</p>
        <p className="text-xs text-sky-200/80 mt-1">
          New Outlook often ignores downloaded .ics files. Use Add to Outlook (opens Outlook on the web with the event ready to save).
        </p>
      </div>
      <ul className="space-y-3">
        {events.map((event, index) => (
          <li key={`${event.fileName || 'event'}-${index}`} className="rounded-lg border border-sky-500/20 bg-[#060e1a]/50 p-3 space-y-2">
            <p className="text-sm text-slate-200">{event.summary || event.fileName || `Event ${index + 1}`}</p>
            <div className="flex flex-wrap gap-2">
              {event.outlookUrl && (
                <a
                  href={event.outlookUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={`${btnPrimary} text-xs`}
                >
                  Add to Outlook
                </a>
              )}
              {event.googleUrl && (
                <a
                  href={event.googleUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={`${btnSecondary} text-xs`}
                >
                  Google Calendar
                </a>
              )}
              <button
                type="button"
                className={`${btnSecondary} text-xs`}
                onClick={() => downloadIcsFromOffer(event, index)}
              >
                Download .ics
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function DisciplinaryCase() {
  const { caseId } = useParams();
  const [searchParams] = useSearchParams();
  const isNew = !caseId || caseId === 'new';
  const navigate = useNavigate();
  const { user } = useAuth();
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
  const [coachingHistory, setCoachingHistory] = useState([]);
  const [priorHistory, setPriorHistory] = useState([]);
  const [priorHistoryLoading, setPriorHistoryLoading] = useState(false);
  const [sharePointConfigured, setSharePointConfigured] = useState(false);
  const [sharePointPath, setSharePointPath] = useState('');
  const [sharePointFolderConfirmed, setSharePointFolderConfirmed] = useState(false);
  const [documentTemplates, setDocumentTemplates] = useState([]);
  const [missingDocuments, setMissingDocuments] = useState([]);
  const [titleDraft, setTitleDraft] = useState('');
  const [editingTitle, setEditingTitle] = useState(false);
  const [outcomeRestriction, setOutcomeRestriction] = useState({
    enabled: false,
    type: '',
    other: '',
    duration: '', // '3' | '6' | 'custom'
    expiresAt: '',
  });
  const [uploading, setUploading] = useState(false);
  const [uploadType, setUploadType] = useState('evidence');
  const [closeNotes, setCloseNotes] = useState('');
  const [informalActionDetails, setInformalActionDetails] = useState('');
  const [fileNoteReason, setFileNoteReason] = useState('');
  const [fileNoteActionRequired, setFileNoteActionRequired] = useState('');
  const [selectedFactFindingOutcome, setSelectedFactFindingOutcome] = useState('');
  const [showFactFindingSuspension, setShowFactFindingSuspension] = useState(false);
  const [showFactFindingHistoryDetails, setShowFactFindingHistoryDetails] = useState(false);
  const signedFileNoteInputRef = useRef(null);
  const [viewStage, setViewStage] = useState(null);
  const [showExtras, setShowExtras] = useState(false);
  const [acknowledgeSameInvestigator, setAcknowledgeSameInvestigator] = useState(false);
  const [acknowledgeSameAppealOwner, setAcknowledgeSameAppealOwner] = useState(false);
  const [acknowledgeShortNotice, setAcknowledgeShortNotice] = useState(false);
  const [outcomeModal, setOutcomeModal] = useState(null);
  const [outcomeShowErrors, setOutcomeShowErrors] = useState(false);
  const [calendarOffers, setCalendarOffers] = useState([]);
  const [focusAmendmentMinutesId, setFocusAmendmentMinutesId] = useState(null);
  const [amendmentAlertActive, setAmendmentAlertActive] = useState(false);
  const [reschedulingHearing, setReschedulingHearing] = useState(false);
  const [reschedulingReviewId, setReschedulingReviewId] = useState(null);
  const [rescheduleReviewDueAt, setRescheduleReviewDueAt] = useState('');
  const caseAlertsRef = useRef(null);
  const docsSectionRef = useRef(null);
  const hearingScheduleRef = useRef(null);
  const [hearingForm, setHearingForm] = useState({
    hearingScheduledAt: '',
    hearingScheduledTime: '10:00',
    hearingLocation: '',
    hearingInviteNotes: '',
    suspensionPending: false,
    suspensionReason: '',
  });
  const [employees, setEmployees] = useState([]);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [form, setForm] = useState({
    employeeUid: '',
    ownerManagerUid: user?.uid || '',
    processFamily: prefilledFamily,
    caseType: defaultCaseTypeForFamily(prefilledFamily),
    issue: '',
    summary: '',
    informalResolutionPath: 'resolve_informally',
    informalNotes: '',
    informalNotAppropriateReason: '',
    informalActionDetails: '',
    offPortalRaiseDate: '',
    offPortalRaiseNotes: '',
    eventDate: new Date().toISOString().slice(0, 10),
  });
  const family = caseData?.processFamily || form.processFamily || 'disciplinary';
  const isSamsaraFamily = family === 'samsara_coaching';
  const isSamsaraCreate = isNew && isSamsaraCreateForm(form);

  useEffect(() => {
    if (!isNew || !user?.uid) return;
    setForm((prev) => (prev.ownerManagerUid ? prev : { ...prev, ownerManagerUid: user.uid }));
  }, [isNew, user?.uid]);
  const stages = useMemo(
    () => (isNew ? stagesForFamily(family) : stagesForCaseDisplay(family, caseData || {})),
    [isNew, family, caseData],
  );
  const currentStage = useMemo(
    () => (isNew ? null : normalizeStage(family, caseData?.stage)),
    [isNew, family, caseData?.stage],
  );
  const hasPendingAmendment = useMemo(
    () => (Array.isArray(minutes) ? minutes : []).some((item) => isAmendmentPending(item)),
    [minutes],
  );
  const pendingAmendmentMinute = useMemo(
    () => (Array.isArray(minutes) ? minutes : []).find((item) => isAmendmentPending(item)) || null,
    [minutes],
  );

  useEffect(() => {
    if (!hasPendingAmendment) setAmendmentAlertActive(false);
  }, [hasPendingAmendment]);

  useEffect(() => {
    if (!amendmentAlertActive) return;
    const timer = window.setTimeout(() => {
      caseAlertsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
    return () => window.clearTimeout(timer);
  }, [amendmentAlertActive, error]);

  const scrollToCaseAlerts = () => {
    requestAnimationFrame(() => {
      caseAlertsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const jumpToPendingAmendment = () => {
    if (!pendingAmendmentMinute) {
      scrollToCaseAlerts();
      return;
    }
    if (pendingAmendmentMinute.stageKey) {
      setViewStage(pendingAmendmentMinute.stageKey);
    }
    setFocusAmendmentMinutesId(pendingAmendmentMinute.id);
    window.setTimeout(() => {
      docsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  };

  useEffect(() => {
    if (currentStage) setViewStage(currentStage);
  }, [currentStage]);

  useEffect(() => {
    if (viewStage && stages.length && !stages.includes(viewStage)) {
      setViewStage(currentStage || stages[stages.length - 1] || null);
    }
  }, [stages, viewStage, currentStage]);

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

  const appealRecipientPriorRoles = useMemo(
    () => describePriorCaseInvolvement(caseData, outcomeModal?.appealRecipientUid),
    [caseData, outcomeModal?.appealRecipientUid],
  );

  const appealOwnerPriorRoles = useMemo(
    () => describePriorCaseInvolvement(caseData, caseData?.appealOwnerUid),
    [caseData],
  );

  const recordedByName = useMemo(() => {
    if (!caseData) return '';
    if (caseData.createdByName) return caseData.createdByName;
    return nameForUid(caseData.createdByUid, employees);
  }, [caseData, employees]);

  const closedByName = useMemo(() => {
    if (!caseData) return '';
    if (caseData.outcomePreset === 'file_note_for_improvement') {
      return caseData.fileNoteIssuedByName
        || nameForUid(caseData.fileNoteIssuedByUid, employees)
        || '';
    }
    if (caseData.closedByName) return caseData.closedByName;
    if (caseData.decisionMakerUid) return nameForUid(caseData.decisionMakerUid, employees);
    return nameForUid(caseData.updatedByUid, employees);
  }, [caseData, employees]);

  const ownerManagerName = useMemo(() => {
    if (!caseData) return '';
    if (caseData.managerNameSnapshot) return caseData.managerNameSnapshot;
    return nameForUid(caseData.ownerManagerUid || caseData.managerUid, employees);
  }, [caseData, employees]);

  const selectedEmployeeName = useMemo(() => {
    if (!form.employeeUid) return prefilledEmployeeName || '';
    const person = employees.find((item) => item.uid === form.employeeUid);
    return person?.fullName || person?.email || prefilledEmployeeName || '';
  }, [employees, form.employeeUid, prefilledEmployeeName]);

  const composedCaseTitle = useMemo(() => {
    const name = selectedEmployeeName.trim() || 'Employee';
    const issue = String(form.issue || '').trim() || '…';
    const dateLabel = isSamsaraCreateForm(form) && form.eventDate
      ? formatHistoryDate(form.eventDate)
      : new Date().toLocaleDateString('en-GB');
    if (isSamsaraCreateForm(form)) {
      return `${name} - ${issue} Samsara Coaching ${dateLabel}`;
    }
    return `${name} - ${issue} - ${dateLabel}`;
  }, [selectedEmployeeName, form.issue, form.processFamily, form.caseType, form.eventDate]);

  const todayIso = new Date().toISOString().slice(0, 10);
  const hearingAt = hearingForm.hearingScheduledAt
    ? parseHearingDateTime(hearingForm.hearingScheduledAt, hearingForm.hearingScheduledTime)
    : null;
  const hearingNoticeHours = hearingAt ? countWorkingHoursNotice(new Date(), hearingAt) : null;
  const hearingNoticeDays = hearingForm.hearingScheduledAt
    ? countWorkingDaysNotice(todayIso, hearingForm.hearingScheduledAt)
    : null;
  const hearingNoticeShort = hearingNoticeHours !== null
    && hearingNoticeHours < MINIMUM_HEARING_NOTICE_WORKING_HOURS;

  const reload = async (id = caseId) => {
    const response = await fetch(`/api/getPeopleCase/${id}`, { credentials: 'include' });
    const data = (await readJsonResponse(response)) || {};
    if (!response.ok) throw new Error(data.error || 'Failed to load case.');
    if (!data.case) throw new Error('Case payload missing from server response.');
    setCaseData(data.case);
    setTitleDraft(data.case.title || '');
    setEditingTitle(false);
    setEvents(data.events || []);
    setDocuments(data.documents || []);
    setMinutes(data.minutes || []);
    setReviews(data.reviews || []);
    setHistory(data.history || []);
    setCoachingHistory(data.coachingHistory || []);
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
        suspensionPending: data.case.suspensionActive ?? data.case.precautionarySuspension ?? prev.suspensionPending ?? false,
        suspensionReason: data.case.suspensionReason || prev.suspensionReason || '',
      }));
    }
  };

  useEffect(() => {
    if (!isNew || !prefilledEmployeeUid) return;
    setForm((prev) => ({
      ...prev,
      employeeUid: prefilledEmployeeUid,
    }));
  }, [isNew, prefilledEmployeeUid]);

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
    setForm((prev) => {
      const next = { ...prev, [name]: type === 'checkbox' ? checked : value };
      if (name === 'processFamily') {
        next.caseType = defaultCaseTypeForFamily(value);
        if (value === 'samsara_coaching') {
          next.informalResolutionPath = '';
          if (!next.eventDate) next.eventDate = new Date().toISOString().slice(0, 10);
        } else if (!next.informalResolutionPath) {
          next.informalResolutionPath = 'resolve_informally';
        }
      }
      if (name === 'caseType' && value === 'samsara_coaching') {
        next.processFamily = 'samsara_coaching';
        next.informalResolutionPath = '';
        if (!next.eventDate) next.eventDate = new Date().toISOString().slice(0, 10);
      }
      return next;
    });
  };

  const loadPriorHistory = (employeeUid) => {
    if (!employeeUid) {
      setPriorHistory([]);
      return;
    }
    setPriorHistoryLoading(true);
    fetch(`/api/getEmployeeInformalHistory?employeeUid=${encodeURIComponent(employeeUid)}`, {
      credentials: 'include',
    })
      .then((r) => readJsonResponse(r).then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (ok) setPriorHistory((d || {}).items || []);
      })
      .catch(() => {})
      .finally(() => setPriorHistoryLoading(false));
  };

  const handleEmployeeSelect = (uid, employee) => {
    const person = employee || employees.find((item) => item.uid === uid || item.id === uid);
    const resolvedUid = String(person?.uid || uid || '').trim();
    setForm((prev) => ({
      ...prev,
      employeeUid: resolvedUid,
    }));
    if (!resolvedUid) {
      setActiveMeasures([]);
      setPriorHistory([]);
    }
  };

  useEffect(() => {
    if (!isNew || !form.employeeUid) {
      if (isNew) {
        setActiveMeasures([]);
        setPriorHistory([]);
      }
      return;
    }
    loadPriorHistory(form.employeeUid);
    setActiveMeasuresLoading(true);
    fetch(`/api/getActiveDisciplinaryMeasures?employeeUid=${encodeURIComponent(form.employeeUid)}`, { credentials: 'include' })
      .then((r) => readJsonResponse(r).then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (ok) setActiveMeasures((d || {}).items || (d || {}).rows?.[0]?.measures || []);
      })
      .catch(() => {})
      .finally(() => setActiveMeasuresLoading(false));
  }, [isNew, form.employeeUid]);

  const emptyRestriction = {
    enabled: false,
    type: '',
    other: '',
    duration: '',
    expiresAt: '',
  };

  const restrictionPayload = (restriction = outcomeRestriction) => {
    if (!restriction?.enabled) {
      return { restrictionEnabled: false };
    }
    return {
      restrictionEnabled: true,
      restrictionType: restriction.type || '',
      restrictionDetail: restriction.other || '',
      restrictionExpiresAt: restriction.expiresAt || '',
    };
  };

  const restrictionReady = (restriction = outcomeRestriction) => {
    if (!restriction?.enabled) return true;
    if (!restriction.type) return false;
    if (restriction.type === 'other' && !String(restriction.other || '').trim()) return false;
    if (!restriction.duration) return false;
    if (!String(restriction.expiresAt || '').trim()) return false;
    return true;
  };

  const applyRestrictionDuration = (prev, duration) => {
    const today = new Date().toISOString().slice(0, 10);
    if (duration === '3') {
      return { ...prev, duration: '3', expiresAt: addMonthsIso(today, 3) };
    }
    if (duration === '6') {
      return { ...prev, duration: '6', expiresAt: addMonthsIso(today, 6) };
    }
    if (duration === 'custom') {
      return { ...prev, duration: 'custom', expiresAt: prev.duration === 'custom' ? prev.expiresAt : '' };
    }
    return { ...prev, duration: '', expiresAt: '' };
  };

  const renderRestrictionFields = (restriction, setRestriction, { disabled = false } = {}) => (
    <div className="rounded-lg border border-[#1a2540] bg-[#060e1a]/40 p-3 space-y-3">
      <label className="flex items-start gap-2 text-sm text-slate-200">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={Boolean(restriction.enabled)}
          disabled={disabled}
          onChange={(e) => setRestriction((prev) => (
            e.target.checked
              ? { ...prev, enabled: true }
              : { ...emptyRestriction }
          ))}
        />
        <span>
          Add a work restriction
          <span className="block text-xs text-slate-500 mt-0.5">
            Optional add-on to this outcome (not an outcome itself).
          </span>
        </span>
      </label>
      {restriction.enabled && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Restriction">
              <select
                className={inputClass}
                value={restriction.type}
                disabled={disabled}
                onChange={(e) => setRestriction((prev) => ({ ...prev, type: e.target.value }))}
              >
                <option value="">Select restriction…</option>
                {RESTRICTION_OPTIONS.map((item) => (
                  <option key={item.id} value={item.id}>{item.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Restriction length">
              <div className="flex flex-wrap gap-2">
                {[
                  { id: '3', label: '3 months' },
                  { id: '6', label: '6 months' },
                  { id: 'custom', label: 'Custom date' },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={disabled}
                    className={`px-3 py-2 text-sm rounded-lg border ${
                      restriction.duration === opt.id
                        ? 'border-indigo-500 bg-indigo-500/20 text-indigo-100'
                        : 'border-[#1a2540] text-slate-300 hover:bg-[#0b1220]'
                    }`}
                    onClick={() => setRestriction((prev) => applyRestrictionDuration(prev, opt.id))}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </Field>
          </div>
          {restriction.duration === 'custom' && (
            <Field label="Restriction expires">
              <input
                type="date"
                className={inputClass}
                value={restriction.expiresAt}
                disabled={disabled}
                min={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setRestriction((prev) => ({
                  ...prev,
                  duration: 'custom',
                  expiresAt: e.target.value,
                }))}
              />
            </Field>
          )}
          {restriction.duration && restriction.duration !== 'custom' && restriction.expiresAt && (
            <p className="text-xs text-slate-500">
              Expires {String(restriction.expiresAt).slice(0, 10).split('-').reverse().join('/')}
            </p>
          )}
          {restriction.type === 'other' && (
            <Field label="Specify other restriction">
              <input
                className={inputClass}
                value={restriction.other}
                disabled={disabled}
                placeholder="Describe the restriction…"
                onChange={(e) => setRestriction((prev) => ({ ...prev, other: e.target.value }))}
              />
            </Field>
          )}
        </div>
      )}
    </div>
  );

  const applyCalendarOffers = (events = []) => {
    const list = Array.isArray(events) ? events.filter(Boolean) : [];
    if (!list.length) return;
    setCalendarOffers(list);
    window.setTimeout(() => {
      caseAlertsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
  };

  const apiUpdate = async (body) => {
    setSaving(true);
    setError('');
    setMessage('');
    const keepCalendar = body.issueHearingInvite === true
      || body.finalizeOutcome === true
      || body.closeWithNotes === true
      || body.issueFileNoteForImprovement === true
      || Boolean(body.rescheduleReview);
    if (!keepCalendar) setCalendarOffers([]);
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
        if (data.code === 'amendment_pending') {
          setAmendmentAlertActive(true);
          setError(data.error || 'Address the employee amendment request before continuing.');
          return { ok: false, code: 'amendment_pending', data };
        }
        throw new Error(data.error || `Update failed (${response.status}).`);
      }
      if (Array.isArray(data.calendarEvents) && data.calendarEvents.length) {
        applyCalendarOffers(data.calendarEvents);
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

  const saveTitle = async () => {
    const nextTitle = String(titleDraft || '').trim();
    if (!nextTitle) {
      setError('Title cannot be empty.');
      return;
    }
    if (nextTitle === (caseData?.title || '')) {
      setEditingTitle(false);
      return;
    }
    const result = await apiUpdate({ title: nextTitle });
    if (result?.ok !== false) {
      setEditingTitle(false);
      setMessage('Title updated.');
    }
  };

  const handleCreate = async () => {
    if (!form.employeeUid) {
      setError('Select the employee this case is about, then open the case.');
      return;
    }
    const isSamsara = isSamsaraCreateForm(form);
    const issue = String(form.issue || '').trim();
    if (!issue) {
      setError(isSamsara ? 'Enter the issue before logging coaching.' : 'Enter the issue before opening the case.');
      return;
    }
    if (!isSamsara && (form.processFamily === 'disciplinary' || form.processFamily === 'grievance') && !form.informalResolutionPath) {
      setError('Choose how you are starting the case before opening it.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const eventDate = isSamsara
        ? (form.eventDate || new Date().toISOString().slice(0, 10))
        : '';
      const response = await fetch('/api/createPeopleCase', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          issue,
          caseType: isSamsara ? 'samsara_coaching' : form.caseType,
          title: composedCaseTitle,
          informalTried: form.informalResolutionPath === 'proceed_formal',
          eventDate,
        }),
      });
      const data = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(data.error || 'Failed to create case.');
      if (isSamsara) {
        navigate('/dashboard/hr/cases', {
          replace: true,
          state: { message: data.message || 'Samsara coaching logged.' },
        });
      } else {
        navigate(`/dashboard/hr/cases/${data.id}`);
      }
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
    <div ref={docsSectionRef} id="case-documentation-hub">
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
        focusMinutesId={focusAmendmentMinutesId}
        onFocusMinutesHandled={() => setFocusAmendmentMinutesId(null)}
        key={caseData?.id || 'case-docs'}
      />
    </div>
  ) : null;

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
    if (!window.confirm(`Permanently delete this case?\n\n"${label}"\n\nThis removes all portal records (events, minutes, document metadata) and deletes the case folder and files in SharePoint.`)) {
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
      navigate('/dashboard/hr/cases', { replace: true, state: { message: data.message || 'Case deleted.' } });
    } catch (err) {
      setError(err.message || 'Failed to delete case.');
    } finally {
      setSaving(false);
    }
  };

  const DURATION_OPTIONS = [
    { months: 6, label: '6 months', guidance: 'Acas: appropriate for first written warnings or less serious matters.' },
    { months: 12, label: '12 months', guidance: 'Acas: appropriate for final written warnings or more serious/repeated concerns.' },
  ];

  const formatWarningExpiry = (value) => {
    if (!value) return 'n/a';
    const text = String(value).slice(0, 10);
    const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return text;
    return `${match[3]}/${match[2]}/${match[1].slice(2)}`;
  };

  const formatActiveWarning = (item) => {
    const title = item.warningTitle || item.title || 'Untitled';
    const outcome = stageLabel(item.outcomePreset || 'warning');
    const expires = formatWarningExpiry(item.warningExpiresAt);
    return `${title} — ${outcome} — expires ${expires}`;
  };

  const formatCoachingHistoryItem = (item) => {
    const eventType = item.issue || item.title || 'Samsara coaching';
    const dateLabel = formatHistoryDate(item.eventDate || item.closedAt);
    return `Samsara coaching — ${eventType} — ${dateLabel}`;
  };

  const openActiveWarningCase = (item) => {
    if (!item?.id) return;
    window.open(`/dashboard/hr/cases/${item.id}`, '_blank', 'noopener,noreferrer');
  };

  const needsDuration = (presetId) => ['written_warning', 'final_written_warning', 'pip'].includes(presetId);

  const openOutcomeModal = (presetId) => {
    const preset = OUTCOME_PRESETS.find((item) => item.id === presetId);
    setOutcomeShowErrors(false);
    setOutcomeModal({
      presetId,
      presetLabel: preset?.label || presetId,
      warningTitle: caseData?.warningTitle || '',
      outcomeDetails: caseData?.outcomeDetails || '',
      evidenceConsideration: caseData?.evidenceConsideration || '',
      expectedStandard: caseData?.expectedStandard || '',
      supportMonitoringRetraining: caseData?.supportMonitoringRetraining || '',
      appealRecipientUid: caseData?.appealRecipientUid || caseData?.appealOwnerUid || '',
      durationMonths: caseData?.warningDurationMonths
        || preset?.suggestedExpiryMonths
        || (needsDuration(presetId) ? 6 : null),
      reviews: [{ title: 'Review meeting', dueAt: '', notes: '' }],
      supersedeCaseIds: [],
      restrictionEnabled: false,
      restrictionType: '',
      restrictionOther: '',
      restrictionDuration: '',
      restrictionExpiresAt: '',
    });
  };

  const toggleSupersedeCase = (caseId) => {
    setOutcomeModal((prev) => {
      if (!prev) return prev;
      const selected = new Set(prev.supersedeCaseIds || []);
      if (selected.has(caseId)) selected.delete(caseId);
      else selected.add(caseId);
      return { ...prev, supersedeCaseIds: [...selected] };
    });
  };

  const updateOutcomeReview = (index, patch) => {
    setOutcomeModal((prev) => {
      if (!prev) return prev;
      const reviews = [...(prev.reviews || [])];
      reviews[index] = { ...reviews[index], ...patch };
      return { ...prev, reviews };
    });
  };

  const addOutcomeReviewRow = () => {
    setOutcomeModal((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        reviews: [...(prev.reviews || []), { title: 'Review meeting', dueAt: '', notes: '' }],
      };
    });
  };

  const removeOutcomeReviewRow = (index) => {
    setOutcomeModal((prev) => {
      if (!prev) return prev;
      const reviews = [...(prev.reviews || [])];
      reviews.splice(index, 1);
      return { ...prev, reviews: reviews.length ? reviews : [{ title: 'Review meeting', dueAt: '', notes: '' }] };
    });
  };

  const outcomeFormReady = (modal) => {
    if (!modal) return false;
    if (needsDuration(modal.presetId) && !String(modal.warningTitle || '').trim()) return false;
    if (!String(modal.outcomeDetails || '').trim()) return false;
    if (!String(modal.evidenceConsideration || '').trim()) return false;
    if (!String(modal.expectedStandard || '').trim()) return false;
    if (!String(modal.supportMonitoringRetraining || '').trim()) return false;
    if (!String(modal.appealRecipientUid || '').trim()) return false;
    if (needsDuration(modal.presetId) && !modal.durationMonths) return false;
    if (modal.restrictionEnabled) {
      if (!modal.restrictionType) return false;
      if (modal.restrictionType === 'other' && !String(modal.restrictionOther || '').trim()) return false;
      if (!modal.restrictionDuration) return false;
      if (!String(modal.restrictionExpiresAt || '').trim()) return false;
    }
    return true;
  };

  const outcomeFieldInvalid = (key) => {
    if (!outcomeShowErrors || !outcomeModal) return false;
    if (key === 'warningTitle') {
      return needsDuration(outcomeModal.presetId) && !String(outcomeModal.warningTitle || '').trim();
    }
    if (key === 'durationMonths') {
      return needsDuration(outcomeModal.presetId) && !outcomeModal.durationMonths;
    }
    if (key === 'appealRecipientUid') {
      return !String(outcomeModal.appealRecipientUid || '').trim();
    }
    return !String(outcomeModal[key] || '').trim();
  };

  const outcomeInputClass = (key) => (
    outcomeFieldInvalid(key)
      ? `${inputClass} border-red-500 ring-1 ring-red-500/60`
      : inputClass
  );

  const confirmOutcome = async () => {
    if (!outcomeModal) return;
    if (!outcomeFormReady(outcomeModal)) {
      setOutcomeShowErrors(true);
      return;
    }
    const {
      presetId,
      warningTitle,
      outcomeDetails,
      evidenceConsideration,
      expectedStandard,
      supportMonitoringRetraining,
      appealRecipientUid,
      durationMonths,
      supersedeCaseIds,
      reviews,
    } = outcomeModal;
    const today = new Date().toISOString().slice(0, 10);
    const body = {
      finalizeOutcome: true,
      outcomePreset: presetId,
      warningTitle: String(warningTitle || '').trim(),
      outcomeDetails,
      evidenceConsideration,
      expectedStandard,
      supportMonitoringRetraining,
      appealRecipientUid,
      supersedeCaseIds: supersedeCaseIds || [],
      reviews: (reviews || [])
        .filter((item) => String(item.dueAt || '').trim())
        .map((item) => ({
          title: item.title || 'Review meeting',
          dueAt: item.dueAt,
          notes: item.notes || '',
        })),
    };
    if (durationMonths) {
      body.warningEffectiveAt = today;
      body.warningExpiresAt = addMonthsIso(today, durationMonths);
      body.warningDurationMonths = durationMonths;
    }
    if (outcomeModal.restrictionEnabled) {
      body.restrictionEnabled = true;
      body.restrictionType = outcomeModal.restrictionType || '';
      body.restrictionDetail = outcomeModal.restrictionOther || '';
      body.restrictionExpiresAt = outcomeModal.restrictionExpiresAt || '';
    } else {
      body.restrictionEnabled = false;
    }
    const result = await apiUpdate(body);
    if (result?.ok) {
      setOutcomeModal(null);
      setOutcomeShowErrors(false);
    }
  };

  const selectOutcome = (presetId) => openOutcomeModal(presetId);

  const activeWarningsPanel = (
    <div className="rounded-lg border border-[#1a2540] p-3 space-y-3">
      <div>
        <p className="text-sm font-medium text-slate-200">Current active disciplinaries</p>
        <p className="text-xs text-slate-500 mt-1">
          Live warnings on this employee&apos;s record. Click a warning to open that case. When confirming an outcome you can choose which ones the new decision supersedes.
        </p>
      </div>
      {history.length === 0 ? (
        <p className="text-sm text-slate-500">No active warnings on record.</p>
      ) : (
        <ul className="space-y-2">
          {history.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="w-full text-left text-sm text-slate-300 border border-[#1a2540] rounded-lg px-3 py-2 hover:border-indigo-500/40 hover:bg-indigo-500/10 hover:text-indigo-100"
                onClick={() => openActiveWarningCase(item)}
              >
                {formatActiveWarning(item)}
                <span className="block text-[11px] text-indigo-300 mt-1">Open case ↗</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {Array.isArray(caseData?.supersededWarnings) && caseData.supersededWarnings.length > 0 && (
        <p className="text-xs text-emerald-300">
          This outcome superseded: {caseData.supersededWarnings.map((item) => item.warningTitle || item.title || item.id).join(', ')}
        </p>
      )}
    </div>
  );

  const factFindingHistoryPanel = (
    <div className="rounded-xl border border-[#1a2540] bg-[#060e1a]/40 p-4 space-y-3">
      <div>
        <p className="text-sm font-semibold text-white">Unexpired disciplinary history</p>
        <p className="text-xs text-slate-400 mt-1">
          Review live warnings and recent Samsara coaching on this employee before the initial interview.
        </p>
      </div>
      {history.length === 0 ? (
        <p className="text-sm text-slate-500">No unexpired warnings on record.</p>
      ) : (
        <ul className="space-y-2">
          {history.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="w-full text-left text-sm text-slate-300 border border-[#1a2540] rounded-lg px-3 py-2 hover:border-indigo-500/40 hover:bg-indigo-500/10 hover:text-indigo-100"
                onClick={() => openActiveWarningCase(item)}
              >
                {formatActiveWarning(item)}
                <span className="block text-[11px] text-indigo-300 mt-1">Open case ↗</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {coachingHistory.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-[#1a2540]">
          <p className="text-xs uppercase tracking-wide text-slate-500">Recent Samsara coaching (12 months)</p>
          <ul className="space-y-2">
            {coachingHistory.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="w-full text-left text-sm text-slate-300 border border-[#1a2540] rounded-lg px-3 py-2 hover:border-indigo-500/40 hover:bg-indigo-500/10 hover:text-indigo-100"
                  onClick={() => openActiveWarningCase(item)}
                >
                  {formatCoachingHistoryItem(item)}
                  <span className="block text-[11px] text-indigo-300 mt-1">Open entry ↗</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
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
  );

  const factFindingOptionalTools = (
    <div className="rounded-xl border border-[#1a2540] border-dashed bg-[#060e1a]/25 p-4 space-y-3">
      <div>
        <p className="text-sm font-medium text-slate-300">Optional tools</p>
        <p className="text-xs text-slate-500 mt-1">
          History, suspension, and extra documentation — use if needed; the next step is choosing an outcome above.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={btnSecondary}
          onClick={() => setShowFactFindingHistoryDetails((open) => !open)}
        >
          {showFactFindingHistoryDetails
            ? 'Hide disciplinary history'
            : `Disciplinary history${history.length ? ` (${history.length})` : ''}…`}
        </button>
        <button
          type="button"
          className={btnSecondary}
          onClick={() => setShowFactFindingSuspension((open) => !open)}
        >
          {showFactFindingSuspension || caseData?.suspensionActive
            ? 'Hide suspension options'
            : 'Precautionary suspension…'}
        </button>
        {caseData?.suspensionActive && (
          <span className="text-xs text-amber-300 self-center">Suspension currently active</span>
        )}
      </div>
      {showFactFindingHistoryDetails && factFindingHistoryPanel}
      {(showFactFindingSuspension || caseData?.suspensionActive) && (
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
            <button
              type="button"
              className={btnSecondary}
              disabled={saving || !caseData?.suspensionActive}
              onClick={() => apiUpdate({ endSuspension: true })}
            >
              End suspension
            </button>
          </div>
        </div>
      )}
    </div>
  );

  const factFindingSuspensionControls = (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={btnSecondary}
          onClick={() => setShowFactFindingSuspension((open) => !open)}
        >
          {showFactFindingSuspension || caseData?.suspensionActive
            ? 'Hide suspension options'
            : 'Precautionary suspension…'}
        </button>
        {caseData?.suspensionActive && (
          <span className="text-xs text-amber-300">Suspension currently active</span>
        )}
      </div>
      {(showFactFindingSuspension || caseData?.suspensionActive) && (
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
            <button
              type="button"
              className={btnSecondary}
              disabled={saving || !caseData?.suspensionActive}
              onClick={() => apiUpdate({ endSuspension: true })}
            >
              End suspension
            </button>
          </div>
        </div>
      )}
    </div>
  );

  const closeWithNotes = async () => {
    if (!restrictionReady()) {
      setError('Complete the restriction details or turn the restriction off.');
      return;
    }
    const result = await apiUpdate({
      closeWithNotes: true,
      closeNotes,
      outcomePreset: 'no_further_action',
      ...restrictionPayload(),
    });
    if (result?.ok) {
      setCloseNotes('');
      setOutcomeRestriction({ ...emptyRestriction });
    }
  };

  const closeAsInformalAction = async () => {
    const result = await apiUpdate({
      closeAsInformalAction: true,
      informalActionDetails,
      restrictionEnabled: false,
    });
    if (result?.ok) {
      setInformalActionDetails('');
      setOutcomeRestriction({ ...emptyRestriction });
    }
  };

  const issueFileNoteForImprovement = async () => {
    if (!restrictionReady()) {
      setError('Complete the restriction details or turn the restriction off.');
      return;
    }
    const result = await apiUpdate({
      issueFileNoteForImprovement: true,
      fileNoteReason,
      fileNoteActionRequired,
      ...restrictionPayload(),
    });
    if (result?.ok) {
      setFileNoteReason('');
      setFileNoteActionRequired('');
      setOutcomeRestriction({ ...emptyRestriction });
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
          {(caseData?.fileNoteIssuedByName || closedByName) && (
            <p className="text-xs text-indigo-100/80 mt-1">
              Recorded by {caseData?.fileNoteIssuedByName || closedByName}
            </p>
          )}
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
    hearingManagerName: hearingManagerName || user?.fullName || '',
    issuedByName: user?.fullName || user?.email || 'Management',
    issuedAtLabel: new Date().toLocaleDateString('en-GB'),
    extraNotes: hearingForm.hearingInviteNotes,
    evidenceDocumentNames: documents
      .filter((doc) => {
        const type = String(doc.documentType || '').toLowerCase();
        return ['evidence', 'minutes', 'letter', 'other'].includes(type)
          || /witness|investigation|statement|note/i.test(String(doc.fileName || ''));
      })
      .map((doc) => doc.fileName || doc.title)
      .filter(Boolean),
    suspensionActive: hearingForm.suspensionPending,
    precautionarySuspension: hearingForm.suspensionPending,
    suspensionReason: hearingForm.suspensionReason || '',
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
      setError(`This date/time gives about ${Math.floor(hearingNoticeHours)} working hour(s)' notice. Country Lion policy requires a minimum of 24 working hours. Tick the short-notice acknowledgement to continue.`);
      return;
    }
    const result = await apiUpdate({
      issueHearingInvite: true,
      ...hearingForm,
      acknowledgeShortNotice,
      precautionarySuspension: hearingForm.suspensionPending,
      suspensionReason: hearingForm.suspensionReason || '',
    });
    if (!result?.ok) return;
    setAcknowledgeShortNotice(false);
    const fromApi = Array.isArray(result.data?.calendarEvents) ? result.data.calendarEvents : [];
    const localOffer = buildHearingCalendarOffer({
      caseId,
      employeeName: caseData?.employeeNameSnapshot || '',
      caseTitle: caseData?.title || '',
      hearingScheduledAt: hearingForm.hearingScheduledAt,
      hearingScheduledTime: hearingForm.hearingScheduledTime,
      hearingLocation: hearingForm.hearingLocation || 'Country Lion',
      notes: hearingForm.hearingInviteNotes,
    });
    applyCalendarOffers(fromApi.length ? fromApi : (localOffer ? [localOffer] : []));
    setReschedulingHearing(false);
    setMessage(
      fromApi.length || localOffer
        ? 'Hearing invite sent. Use Add to Outlook below to put the hearing in your calendar.'
        : 'Hearing invite sent to the employee portal.',
    );
  };

  const beginRescheduleHearing = () => {
    setReschedulingHearing(true);
    window.setTimeout(() => {
      hearingScheduleRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  };

  const saveRescheduledReview = async (review) => {
    if (!review?.id || !rescheduleReviewDueAt) {
      setError('Choose a new review date.');
      return;
    }
    const result = await apiUpdate({
      rescheduleReview: {
        reviewId: review.id,
        dueAt: rescheduleReviewDueAt,
        title: review.title || 'Review meeting',
        notes: review.notes || '',
      },
    });
    if (!result?.ok) return;
    const fromApi = Array.isArray(result.data?.calendarEvents) ? result.data.calendarEvents : [];
    const localOffer = buildReviewCalendarOffer({
      caseId,
      reviewId: review.id,
      title: review.title || 'Review meeting',
      employeeName: caseData?.employeeNameSnapshot || '',
      caseTitle: caseData?.title || '',
      dueAt: rescheduleReviewDueAt,
      notes: review.notes || '',
    });
    applyCalendarOffers(fromApi.length ? fromApi : (localOffer ? [localOffer] : []));
    setReschedulingReviewId(null);
    setRescheduleReviewDueAt('');
    setMessage('Review rescheduled. Use Add to Outlook below if you need an updated calendar entry.');
  };

  const renderScheduledReviews = (items = reviews) => {
    if (!items.length) return null;
    return (
      <div className="rounded-lg border border-[#1a2540] p-3 space-y-2">
        <p className="text-sm font-medium text-slate-200">Scheduled reviews</p>
        <ul className="space-y-2">
          {items.map((item) => {
            const isOpen = item.status !== 'completed';
            const editing = reschedulingReviewId === item.id;
            return (
              <li key={item.id} className="rounded-lg border border-[#1a2540] bg-[#060e1a]/40 px-3 py-2 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-slate-300">
                    {item.title || 'Review meeting'} · due {formatWarningExpiry(item.dueAt)} · {item.status || 'open'}
                  </p>
                  {isOpen && !editing && (
                    <button
                      type="button"
                      className={`${btnSecondary} text-xs py-1`}
                      disabled={saving}
                      onClick={() => {
                        setReschedulingReviewId(item.id);
                        setRescheduleReviewDueAt(String(item.dueAt || '').slice(0, 10));
                      }}
                    >
                      Reschedule
                    </button>
                  )}
                </div>
                {editing && (
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="space-y-1">
                      <span className="block text-[11px] uppercase tracking-wide text-slate-500">New date</span>
                      <input
                        type="date"
                        className={inputClass}
                        min={todayIso}
                        value={rescheduleReviewDueAt}
                        onChange={(e) => setRescheduleReviewDueAt(e.target.value)}
                      />
                    </label>
                    <button
                      type="button"
                      className={btnPrimary}
                      disabled={saving || !rescheduleReviewDueAt}
                      onClick={() => saveRescheduledReview(item)}
                    >
                      Save new date
                    </button>
                    <button
                      type="button"
                      className={btnSecondary}
                      disabled={saving}
                      onClick={() => {
                        setReschedulingReviewId(null);
                        setRescheduleReviewDueAt('');
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    );
  };

  const uploadedDocumentsList = (
    <ul className="space-y-2">
      {documents.map((doc) => (
        <li key={doc.id} className="text-sm text-slate-300 flex flex-wrap items-center gap-2">
          <span>{doc.documentType}: {doc.fileName}</span>
          {doc.portalHtml && (
            <button
              type="button"
              className="text-indigo-300"
              onClick={() => {
                const win = window.open('', '_blank', 'noopener,noreferrer');
                if (!win) return;
                win.document.open();
                win.document.write(doc.portalHtml);
                win.document.close();
              }}
            >
              Open
            </button>
          )}
          {!doc.portalHtml && doc.sharePointWebUrl && (
            <a href={doc.sharePointWebUrl} target="_blank" rel="noreferrer" className="text-indigo-300">Open</a>
          )}
          {doc.employeeSignStatus === 'pending' && (
            <span className="text-[10px] uppercase text-amber-300">Awaiting employee signature</span>
          )}
        </li>
      ))}
      {documents.length === 0 && <li className="text-sm text-slate-500">No uploaded files yet.</li>}
    </ul>
  );

  const renderDisciplinaryStep = () => {
    if (currentStage === 'fact_finding') {
      if (needsPortalInterview) {
        return null;
      }

      return (
        <StepCard title="After fact-finding — choose one outcome">
          <p className="text-sm text-slate-400">
            Pick the route that matches what happened. Extra interviews and uploads are optional and sit below.
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <ChoiceButton
              title="1. Close — no further action"
              help="Use when fact-finding shows no case to answer, or no action is needed. Brief close notes are kept on the case only — not a file note and not informal action."
              selected={selectedFactFindingOutcome === 'nfa'}
              disabled={saving}
              onClick={() => setSelectedFactFindingOutcome('nfa')}
            />
            <ChoiceButton
              title="2. Close — informal action"
              help="Use when a quiet word or informal agreement resolved it (e.g. verbal reminder, agreed change). Recorded on the case but no file note document and not formal discipline."
              selected={selectedFactFindingOutcome === 'informal'}
              disabled={saving}
              onClick={() => setSelectedFactFindingOutcome('informal')}
            />
            <ChoiceButton
              title="3. Issue file note for improvement"
              help="Use when standards must improve but formal discipline is not appropriate yet. Generates a printable file note for the personnel file — may be considered if issues recur."
              selected={selectedFactFindingOutcome === 'file_note'}
              disabled={saving}
              onClick={() => setSelectedFactFindingOutcome('file_note')}
            />
            <ChoiceButton
              primary
              title="4. Schedule formal hearing →"
              help="Use when the concern is serious, informal steps failed, or you are proceeding straight to formal discipline. Next step is the hearing invite."
              selected={selectedFactFindingOutcome === 'formal_hearing'}
              disabled={saving}
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
                  {renderRestrictionFields(outcomeRestriction, setOutcomeRestriction, { disabled: saving })}
                  <button
                    type="button"
                    className={btnPrimary}
                    disabled={saving || !closeNotes.trim() || !restrictionReady()}
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
                  {renderRestrictionFields(outcomeRestriction, setOutcomeRestriction, { disabled: saving })}
                  <button
                    type="button"
                    className={btnPrimary}
                    disabled={saving || !fileNoteReason.trim() || !fileNoteActionRequired.trim() || !restrictionReady()}
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
          <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 p-4 space-y-2">
            <p className="text-sm font-medium text-amber-100">Country Lion notice policy</p>
            <p className="text-sm text-amber-50/90">
              Country Lion policy is to give a minimum of <strong>24 working hours</strong> notice so the employee can prepare and arrange a companion.
            </p>
          </div>

          <Field label="Is the employee to be suspended pending the hearing?">
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input
                  type="radio"
                  name="suspensionPending"
                  checked={hearingForm.suspensionPending === true}
                  onChange={() => setHearingForm((prev) => ({ ...prev, suspensionPending: true }))}
                />
                Yes — suspend on full pay
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input
                  type="radio"
                  name="suspensionPending"
                  checked={hearingForm.suspensionPending === false}
                  onChange={() => setHearingForm((prev) => ({ ...prev, suspensionPending: false }))}
                />
                No
              </label>
            </div>
          </Field>

          {hearingForm.suspensionPending && (
            <Field label="Reason for suspension (optional)">
              <textarea
                rows={2}
                className={inputClass}
                placeholder="e.g. Nature of allegation requires separation from workplace"
                value={hearingForm.suspensionReason || ''}
                onChange={(e) => setHearingForm((prev) => ({ ...prev, suspensionReason: e.target.value }))}
              />
            </Field>
          )}

          <div ref={hearingScheduleRef} className="grid grid-cols-1 md:grid-cols-3 gap-3">
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
                placeholder="Defaults to Country Lion if left blank"
                value={hearingForm.hearingLocation}
                onChange={(e) => setHearingForm((prev) => ({ ...prev, hearingLocation: e.target.value }))}
              />
            </Field>
          </div>

          {reschedulingHearing && (
            <p className="text-sm text-sky-200">
              Choose the new hearing date and time, then confirm below to re-send the portal invite and refresh the calendar offer.
            </p>
          )}

          {hearingForm.hearingScheduledAt && (
            <p className={`text-sm ${hearingNoticeShort ? 'text-amber-200' : 'text-emerald-300'}`}>
              Notice from now: about {hearingNoticeHours !== null ? Math.floor(hearingNoticeHours) : '—'} working hour
              {Math.floor(hearingNoticeHours || 0) === 1 ? '' : 's'}
              {hearingNoticeDays !== null ? ` (${hearingNoticeDays} working day${hearingNoticeDays === 1 ? '' : 's'})` : ''}
              {hearingNoticeShort
                ? ' — under the 24 working hours Country Lion policy minimum.'
                : ' — meets the 24 working hours minimum.'}
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
              I understand this is shorter than Country Lion’s 24 working hours policy and still want to proceed.
            </label>
          )}

          {inviteIssued ? (
            <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 p-4 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-emerald-100">Invite sent to the employee portal</p>
                  <p className="text-sm text-emerald-50/90">
                    Hearing: {caseData.hearingScheduledAt}
                    {caseData.hearingScheduledTime ? ` at ${caseData.hearingScheduledTime}` : ''}
                    {caseData.hearingLocation ? ` · ${caseData.hearingLocation}` : ''}
                  </p>
                  <p className="text-xs text-emerald-100/80">Right to be accompanied is included on the invite.</p>
                </div>
                <button
                  type="button"
                  className={`${btnSecondary} text-xs`}
                  disabled={saving}
                  onClick={beginRescheduleHearing}
                >
                  Reschedule
                </button>
              </div>
              <CalendarOffersBlock
                compact
                events={
                  calendarOffers.length
                    ? calendarOffers
                    : [
                      buildHearingCalendarOffer({
                        caseId,
                        employeeName: caseData?.employeeNameSnapshot || '',
                        caseTitle: caseData?.title || '',
                        hearingScheduledAt: caseData?.hearingScheduledAt || hearingForm.hearingScheduledAt,
                        hearingScheduledTime: caseData?.hearingScheduledTime || hearingForm.hearingScheduledTime,
                        hearingLocation: caseData?.hearingLocation || hearingForm.hearingLocation || 'Country Lion',
                        notes: caseData?.hearingInviteNotes || hearingForm.hearingInviteNotes,
                      }),
                    ].filter(Boolean)
                }
              />
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={btnPrimary}
              disabled={saving || !hearingForm.hearingScheduledAt}
              onClick={handleSendHearingInvite}
            >
              {reschedulingHearing
                ? 'Confirm new date & re-send invite'
                : inviteIssued
                  ? 'Re-send invite via portal'
                  : 'Send invite via portal'}
            </button>
            {reschedulingHearing && (
              <button
                type="button"
                className={btnSecondary}
                disabled={saving}
                onClick={() => setReschedulingHearing(false)}
              >
                Cancel reschedule
              </button>
            )}
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
      const hearingDetails = (
        <div className="space-y-3">
          {(caseData?.hearingScheduledAt || caseData?.hearingLocation) && (
            <div className="rounded-lg border border-[#1a2540] px-3 py-2 text-sm text-slate-300 flex flex-wrap items-center justify-between gap-2">
              <span>
                Scheduled: {caseData.hearingScheduledAt || '—'}
                {caseData.hearingScheduledTime ? ` at ${caseData.hearingScheduledTime}` : ''}
                {caseData.hearingLocation ? ` · ${caseData.hearingLocation}` : ''}
              </span>
              <button
                type="button"
                className={`${btnSecondary} text-xs py-1`}
                disabled={saving}
                onClick={async () => {
                  setReschedulingHearing(true);
                  const result = await apiUpdate({ stage: 'hearing_invite' });
                  if (result?.ok) beginRescheduleHearing();
                }}
              >
                Reschedule
              </button>
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
        </div>
      );

      if (needsPortalInterview) {
        return (
          <div className="rounded-xl border border-[#1a2540] border-dashed bg-[#060e1a]/25 p-4 space-y-3">
            <div>
              <p className="text-sm font-medium text-slate-300">Hearing details</p>
              <p className="text-xs text-slate-500 mt-1">
                Companion attendance and postponement — optional while you record the hearing interview above.
              </p>
            </div>
            {hearingDetails}
            <button
              type="button"
              className={btnSecondary}
              disabled={saving}
              onClick={() => apiUpdate({ stage: 'hearing_invite' })}
            >
              ← Back to invite
            </button>
          </div>
        );
      }

      return (
        <StepCard title="Hearing complete — decide outcome">
          <p className="text-sm text-slate-400">
            Hearing notes are recorded. Continue to choose the outcome, or adjust companion details below if needed.
          </p>
          <ChoiceRow>
            <ChoiceButton
              title="← Back to invite"
              disabled={saving}
              onClick={() => apiUpdate({ stage: 'hearing_invite' })}
            />
            <ChoiceButton
              primary
              title="Continue to outcome →"
              disabled={saving}
              onClick={() => apiUpdate({ stage: 'outcome_pack' })}
            />
          </ChoiceRow>
          <div className="border-t border-[#1a2540] pt-4 space-y-3">
            <p className="text-xs text-slate-500">Optional hearing details</p>
            {hearingDetails}
          </div>
        </StepCard>
      );
    }

    if (currentStage === 'outcome_pack') {
      return (
        <StepCard title="Step 4 — Outcome">
          <p className="text-sm text-slate-400">
            Choose an outcome. You will complete one form that generates the letterheaded outcome letter,
            issues it on the portal, records any live warning with expiry, and closes the case.
          </p>
          {activeWarningsPanel}
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
          {renderScheduledReviews()}
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
              {closedByName && closedByName !== 'Unknown' && (
                <p className="text-xs text-emerald-100/80 mt-2">Recorded by {closedByName}</p>
              )}
            </div>
          ) : caseData?.outcomePreset === 'file_note_for_improvement' ? (
            renderFileNoteSigningPanel()
          ) : (
            <div className="space-y-2 text-sm text-slate-300">
              <p>Outcome: <span className="text-white">{stageLabel(caseData?.outcomePreset) || caseData?.outcomePreset || '—'}</span></p>
              {caseData?.warningEmployeeSignStatus === 'pending' && (
                <p className="text-amber-200">
                  Outcome letter issued to the employee for digital signature (My cases badge).
                </p>
              )}
              {caseData?.warningEmployeeSignStatus === 'signed' && (
                <p className="text-emerald-300">Employee digitally signed the outcome letter.</p>
              )}
              {(caseData?.warningEffectiveAt || caseData?.warningExpiresAt) && (
                <p className="text-slate-400">
                  Warning live {formatWarningExpiry(caseData.warningEffectiveAt)} → {formatWarningExpiry(caseData.warningExpiresAt)}
                </p>
              )}
              {caseData?.nextReviewDueAt && (
                <p className="text-slate-400">
                  Next review scheduled for {formatWarningExpiry(caseData.nextReviewDueAt)}
                </p>
              )}
              {caseData?.closeNotes && (
                <p className="whitespace-pre-wrap text-slate-400">Notes: {caseData.closeNotes}</p>
              )}
              {closedByName && closedByName !== 'Unknown' && (
                <p className="text-slate-400">Recorded by {closedByName}</p>
              )}
              {caseData?.appealWindowEndsAt && (
                <p className="text-slate-400">Appeal window ends: {formatWarningExpiry(caseData.appealWindowEndsAt)}</p>
              )}
              {caseData?.appealRecipientNameSnapshot && (
                <p className="text-slate-400">Appeals to: {caseData.appealRecipientNameSnapshot}</p>
              )}
              {renderScheduledReviews()}
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
              {appealOwnerPriorRoles.length > 0 && (
                <p className="text-sm text-amber-200 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">
                  Warning: this manager was already involved earlier in this case (
                  {appealOwnerPriorRoles.join(', ')}
                  ). Prefer an independent appeal manager where practicable.
                </p>
              )}
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
          <p className="text-sm text-slate-400">
            Complete the appeal hearing, then choose an outcome. The outcome form issues the letter and closes the case again.
          </p>
          {activeWarningsPanel}
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
          {appealOwnerPriorRoles.length > 0 && (
            <p className="text-sm text-amber-200 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">
              Warning: this manager was already involved earlier in this case (
              {appealOwnerPriorRoles.join(', ')}
              ). Prefer an independent appeal manager where practicable.
            </p>
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
            <button type="button" className="text-indigo-300 text-sm" onClick={() => navigate(`/dashboard/hr/cases/${caseData.linkedDisciplinaryCaseId}`)}>
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
    if (family === 'samsara_coaching') {
      return (
        <StepCard title="Samsara coaching — logged">
          <div className="space-y-3 text-sm text-slate-300">
            <p>
              This entry records that coaching was processed on the Samsara system.
              No portal interview or hearing is required.
            </p>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">Driver</dt>
                <dd className="mt-1 text-white">{caseData?.employeeNameSnapshot || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">Event date</dt>
                <dd className="mt-1 text-white">{formatHistoryDate(caseData?.eventDate || caseData?.closedAt)}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">Event type</dt>
                <dd className="mt-1 text-white">{caseData?.issue || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">Logged by</dt>
                <dd className="mt-1 text-white">{caseData?.closedByName || caseData?.createdByName || '—'}</dd>
              </div>
            </dl>
            {caseData?.closeNotes && (
              <p className="text-slate-400">{caseData.closeNotes}</p>
            )}
          </div>
        </StepCard>
      );
    }

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

    const isFactFinding = !viewingPastStage
      && family === 'disciplinary'
      && displayStage === 'fact_finding';
    const isHearing = !viewingPastStage
      && family === 'disciplinary'
      && displayStage === 'hearing';

    if (isFactFinding) {
      if (needsPortalInterview) {
        return (
          <div className="space-y-6">
            {factFindingHistoryPanel}
            {documentationHub}
            {factFindingSuspensionControls}
          </div>
        );
      }
      return (
        <div className="space-y-6">
          {step}
          {factFindingOptionalTools}
          {documentationHub}
        </div>
      );
    }

    if (isHearing) {
      if (needsPortalInterview) {
        return (
          <div className="space-y-6">
            {documentationHub}
            {step}
          </div>
        );
      }
      return (
        <div className="space-y-6">
          {step}
          {documentationHub}
        </div>
      );
    }

    const showDocsFirst = !viewingPastStage && family === 'grievance' && displayStage === 'investigation';
    return (
      <div className="space-y-6">
        {showDocsFirst ? (
          <>
            {documentationHub}
            {step}
          </>
        ) : (
          <>
            {step}
            {documentationHub}
          </>
        )}
      </div>
    );
  };

  if (!isNew && (loading || !caseData)) {
    if (error && !loading) {
      return (
        <div className="flex flex-col h-full">
          <div className="p-8 space-y-4 max-w-lg">
            <div className="bg-red-500/10 border border-red-500/25 rounded-lg p-4 text-sm text-red-300">{error}</div>
            <button type="button" onClick={() => navigate('/dashboard/hr/cases')} className={btnSecondary}>
              Back to cases
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className="flex flex-col h-full">
        <div className="p-8 text-sm text-slate-400">Loading case…</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-8 py-5 border-b border-[#1a2540] gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          {isNew ? (
            <h1 className="text-xl font-bold text-white">New people case</h1>
          ) : editingTitle ? (
            <div className="flex flex-wrap items-center gap-2 max-w-3xl">
              <input
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                className={`${inputClass} flex-1 min-w-[16rem]`}
                aria-label="Case title"
              />
              <button type="button" className={btnPrimary} disabled={saving} onClick={saveTitle}>
                Save title
              </button>
              <button
                type="button"
                className={btnSecondary}
                disabled={saving}
                onClick={() => {
                  setTitleDraft(caseData?.title || '');
                  setEditingTitle(false);
                }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-xl font-bold text-white">{caseData?.title || 'Case'}</h1>
              <button
                type="button"
                className="text-sm text-indigo-300 hover:text-indigo-200"
                onClick={() => {
                  setTitleDraft(caseData?.title || '');
                  setEditingTitle(true);
                }}
              >
                Edit title
              </button>
            </div>
          )}
          {!isNew && (
            <div className="mt-1 space-y-1">
              <p className="text-sm text-slate-400">
                {caseData?.employeeNameSnapshot || 'Unknown employee'}
                {' · '}
                {String(family).replace(/_/g, ' ')}
                {caseData?.suspensionActive ? ' · Suspension active' : ''}
              </p>
              <p className="text-sm text-slate-400">
                {recordedByName && recordedByName !== 'Unknown' ? (
                  <>Opened by <span className="text-slate-200">{recordedByName}</span></>
                ) : (
                  <>Opened by unknown</>
                )}
                {ownerManagerName && ownerManagerName !== 'Unknown' ? (
                  <> · Owner <span className="text-slate-200">{ownerManagerName}</span></>
                ) : null}
                {currentStage === 'closed' && closedByName && closedByName !== 'Unknown' ? (
                  <> · Recorded by <span className="text-slate-200">{closedByName}</span></>
                ) : null}
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
          <button type="button" onClick={() => navigate('/dashboard/hr/cases')} className={btnSecondary}>
            Back to cases
          </button>
        </div>
      </div>

      <div className="p-8 space-y-6 overflow-auto">
        <div ref={caseAlertsRef} className="space-y-3">
          {error && (
            amendmentAlertActive || (error || '').toLowerCase().includes('amendment') ? (
              <button
                type="button"
                onClick={jumpToPendingAmendment}
                className="w-full text-left bg-red-500/10 border border-red-500/25 rounded-lg p-4 text-sm text-red-300 hover:bg-red-500/15 hover:border-red-400/40 transition-colors"
              >
                <span className="block">{error}</span>
                <span className="block mt-1 text-xs text-red-200/80">Click to open the amendment request.</span>
              </button>
            ) : (
              <div className="bg-red-500/10 border border-red-500/25 rounded-lg p-4 text-sm text-red-300">{error}</div>
            )
          )}
          {message && <div className="bg-emerald-500/10 border border-emerald-500/25 rounded-lg p-4 text-sm text-emerald-300">{message}</div>}
          {!isNew && hasPendingAmendment && (
            <button
              type="button"
              onClick={jumpToPendingAmendment}
              className="w-full text-left bg-orange-500/10 border border-orange-500/30 rounded-lg p-4 text-sm text-orange-200 hover:bg-orange-500/15 hover:border-orange-400/40 transition-colors"
            >
              An employee has requested an amendment to interview notes. Address the amendment before the case can move on.
              <span className="block mt-1 text-xs text-orange-100/80">Click to open the amendment.</span>
            </button>
          )}
          {calendarOffers.length > 0 && (
            <CalendarOffersBlock events={calendarOffers} />
          )}
        </div>

        {isNew ? (
          <div className="bg-[#0b1220] border border-[#1a2540] rounded-xl p-5 space-y-4 max-w-3xl overflow-visible">
            <div>
              <p className="text-sm font-medium text-white">
                {isSamsaraCreate
                  ? 'Log Samsara coaching'
                  : 'Step 0 — Open the case'}
              </p>
              <p className="text-sm text-slate-400 mt-1">
                {isSamsaraCreate
                  ? 'Record that coaching was processed on Samsara. No portal interview is required.'
                  : 'Record the concern and open the case. You can hold interviews, upload notes, and decide later whether it resolves informally or goes formal.'}
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
              {!isSamsaraCreate && (
                <Field label="Case type">
                  <select name="caseType" value={form.caseType} onChange={handleChange} className={inputClass}>
                    {CASE_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                  </select>
                </Field>
              )}
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

            <Field label="Issue">
              <input
                name="issue"
                value={form.issue}
                onChange={handleChange}
                className={inputClass}
                placeholder={isSamsaraCreate
                  ? 'Short description of the coaching event'
                  : 'Short description of the issue'}
                autoComplete="off"
              />
            </Field>
            <Field label="Title (auto)">
              <input
                value={composedCaseTitle}
                readOnly
                className={`${inputClass} text-slate-400 cursor-not-allowed`}
                aria-label="Case title is generated automatically"
              />
              <span className="block text-xs text-slate-500 mt-1">
                {isSamsaraCreate
                  ? 'Built as Name — Issue Samsara Coaching Date'
                  : 'Built as Employee name — Issue — Date'}
              </span>
            </Field>
            {!isSamsaraCreate && (
              <Field label="Summary">
                <textarea name="summary" value={form.summary} onChange={handleChange} rows={4} className={inputClass} />
              </Field>
            )}

            {form.employeeUid && (
              <div className="rounded-lg border border-[#1a2540] bg-[#060e1a]/60 p-3 space-y-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  Recent history for this employee
                </p>
                {priorHistoryLoading && (
                  <p className="text-xs text-slate-400">Loading…</p>
                )}
                {!priorHistoryLoading && priorHistory.length === 0 && activeMeasures.length === 0 && (
                  <p className="text-xs text-slate-400">No recent coaching, informal outcomes, or active measures.</p>
                )}
                {!priorHistoryLoading && priorHistory.length > 0 && (
                  <ul className="space-y-2">
                    {priorHistory.slice(0, 8).map((item) => {
                      const isSamsara = item.processFamily === 'samsara_coaching'
                        || item.outcomePreset === 'samsara_coaching';
                      const dateStr = formatHistoryDate(item.eventDate || item.closedAt);
                      return (
                        <li key={item.id}>
                          <a
                            href={`/dashboard/hr/cases/${item.id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="block text-xs border-l-2 border-sky-500/30 pl-2.5 space-y-0.5 hover:border-sky-400/70 hover:bg-sky-500/5 rounded-r-md pr-1 py-0.5 transition-colors"
                          >
                            <p className="text-sky-100 font-medium">
                              {isSamsara
                                ? `Samsara coaching — ${item.issue || item.title || 'event'}`
                                : (item.title || stageLabel(item.outcomePreset || 'outcome'))}
                              <span className="text-slate-400 font-normal"> · {dateStr}</span>
                              <span className="text-slate-600 ml-1">↗</span>
                            </p>
                          </a>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {!priorHistoryLoading && activeMeasures.length > 0 && !isSamsaraCreate && (
                  <div className="space-y-2 pt-1 border-t border-[#1a2540]">
                    <p className="text-xs text-amber-200/80">Active measures</p>
                    <ul className="space-y-2">
                      {activeMeasures.map((item) => {
                        const dateStr = item.givenAt
                          ? String(item.givenAt).slice(0, 10).split('-').reverse().join('/')
                          : '—';
                        return (
                          <li key={`${item.caseId}-${item.outcomePreset}-${item.reason}`}>
                            <a
                              href={`/dashboard/hr/cases/${item.caseId}`}
                              target="_blank"
                              rel="noreferrer"
                              className="block text-xs border-l-2 border-amber-500/30 pl-2.5 hover:border-amber-400/70 hover:bg-amber-500/5 rounded-r-md pr-1 py-0.5"
                            >
                              <span className="text-amber-200 font-medium">
                                {item.measureType || item.outcomePreset}
                              </span>
                              <span className="text-slate-400"> · given {dateStr}</span>
                            </a>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {!isSamsaraCreate && (form.processFamily === 'disciplinary' || form.processFamily === 'grievance') && (
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 space-y-4">
                <div>
                  <p className="text-sm font-medium text-amber-100">How are you starting?</p>
                  <p className="text-xs text-slate-400 mt-1">
                    This records your initial approach. Informal resolution is decided later on the case, after interviews and notes.
                  </p>
                </div>

                {!form.employeeUid && (
                  <p className="text-xs text-amber-300">
                    Select an employee above to see their current active measures before choosing how to start.
                  </p>
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

            {!isSamsaraCreate && form.processFamily === 'grievance' && (
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
                || !String(form.issue || '').trim()
                || (!isSamsaraCreate && (form.processFamily === 'disciplinary' || form.processFamily === 'grievance') && !form.informalResolutionPath)
              }
              className={btnPrimary}
            >
              {saving
                ? 'Saving…'
                : isSamsaraCreate
                  ? 'Log coaching'
                  : 'Open case — start fact-finding'}
            </button>
            {!form.employeeUid && (
              <p className="text-xs text-amber-300">
                Click the employee field and choose who the case is about. The open button stays disabled until an employee is selected.
              </p>
            )}
            {form.employeeUid && !String(form.issue || '').trim() && (
              <p className="text-xs text-amber-300">
                {isSamsaraCreate
                  ? 'Enter the issue — the title is built as Name — Issue Samsara Coaching Date.'
                  : 'Enter the issue — the case title is built from the employee name, issue, and today’s date.'}
              </p>
            )}
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
                      <h4 className="text-white font-medium mb-3">Case details</h4>
                      <p className="text-xs text-slate-500 mb-3">
                        Edit the title, or change the process family if this case was opened under the wrong type (for example disciplinary → grievance).
                      </p>
                      <Field label="Title">
                        <div className="flex flex-wrap gap-2">
                          <input
                            value={titleDraft}
                            onChange={(e) => setTitleDraft(e.target.value)}
                            className={`${inputClass} flex-1 min-w-[12rem]`}
                          />
                          <button
                            type="button"
                            className={btnSecondary}
                            disabled={saving || !String(titleDraft || '').trim() || titleDraft === (caseData?.title || '')}
                            onClick={saveTitle}
                          >
                            Save title
                          </button>
                        </div>
                      </Field>
                      <Field label="Process family">
                        <select
                          className={inputClass}
                          value={family}
                          disabled={saving}
                          onChange={(e) => {
                            const next = e.target.value;
                            if (next === family) return;
                            const label = PROCESS_FAMILIES.find((item) => item.id === next)?.label || next;
                            if (!window.confirm(`Change this case to ${label}? The workflow step will be remapped.`)) return;
                            setViewStage(null);
                            apiUpdate({ processFamily: next });
                          }}
                        >
                          {PROCESS_FAMILIES.map((item) => (
                            <option key={item.id} value={item.id}>{item.label}</option>
                          ))}
                        </select>
                      </Field>
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

      {outcomeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-[#0b1220] border border-[#1a2540] rounded-xl p-6 w-full max-w-2xl space-y-4 shadow-xl max-h-[90vh] overflow-auto">
            <div>
              <h3 className="text-white font-semibold text-lg">Issue outcome — {outcomeModal.presetLabel}</h3>
              <p className="text-xs text-slate-500 mt-1">
                Completing this form generates the letterheaded outcome letter, issues it on the portal,
                records any live warning, schedules review tasks if set, and closes the case.
              </p>
            </div>

            {outcomeShowErrors && !outcomeFormReady(outcomeModal) && (
              <p className="text-sm text-red-300">
                Complete the highlighted fields before generating the letter.
              </p>
            )}

            {needsDuration(outcomeModal.presetId) && (
              <Field label="Warning title (e.g. Speeding)">
                <input
                  className={outcomeInputClass('warningTitle')}
                  placeholder="Short title shown on active disciplinaries…"
                  value={outcomeModal.warningTitle || ''}
                  onChange={(e) => setOutcomeModal((prev) => ({ ...prev, warningTitle: e.target.value }))}
                />
                <p className="text-xs text-slate-500 mt-1">
                  Appears as e.g. Speeding — Written warning — expires …
                </p>
              </Field>
            )}

            <Field label="Consideration of all evidence">
              <textarea
                rows={3}
                className={outcomeInputClass('evidenceConsideration')}
                placeholder="Summarise how the evidence was considered…"
                value={outcomeModal.evidenceConsideration}
                onChange={(e) => setOutcomeModal((prev) => ({ ...prev, evidenceConsideration: e.target.value }))}
              />
            </Field>

            <Field label="Outcome details / reasons">
              <textarea
                rows={3}
                className={outcomeInputClass('outcomeDetails')}
                placeholder="Reasons for this decision…"
                value={outcomeModal.outcomeDetails}
                onChange={(e) => setOutcomeModal((prev) => ({ ...prev, outcomeDetails: e.target.value }))}
              />
            </Field>

            <Field label="Expected standard going forward">
              <textarea
                rows={3}
                className={outcomeInputClass('expectedStandard')}
                placeholder="Set out the standard of conduct / performance required…"
                value={outcomeModal.expectedStandard}
                onChange={(e) => setOutcomeModal((prev) => ({ ...prev, expectedStandard: e.target.value }))}
              />
            </Field>

            <Field label="Support, monitoring and/or retraining">
              <textarea
                rows={3}
                className={outcomeInputClass('supportMonitoringRetraining')}
                placeholder="Outline any support, monitoring or retraining required…"
                value={outcomeModal.supportMonitoringRetraining}
                onChange={(e) => setOutcomeModal((prev) => ({ ...prev, supportMonitoringRetraining: e.target.value }))}
              />
            </Field>

            {needsDuration(outcomeModal.presetId) && (
              <div className={`space-y-3 rounded-lg p-1 ${outcomeFieldInvalid('durationMonths') ? 'ring-1 ring-red-500/60' : ''}`}>
                <p className={`text-sm font-medium ${outcomeFieldInvalid('durationMonths') ? 'text-red-300' : 'text-slate-200'}`}>
                  Warning / PIP live period
                </p>
                {DURATION_OPTIONS.map((opt) => (
                  <label key={opt.months} className="flex items-start gap-3 rounded-lg border border-[#1a2540] p-3 cursor-pointer hover:bg-[#060e1a]">
                    <input
                      type="radio"
                      name="durationMonths"
                      checked={outcomeModal.durationMonths === opt.months}
                      onChange={() => setOutcomeModal((prev) => ({ ...prev, durationMonths: opt.months }))}
                      className="mt-0.5"
                    />
                    <div>
                      <span className="text-sm text-white font-medium">{opt.label}</span>
                      <p className="text-xs text-slate-400 mt-0.5">{opt.guidance}</p>
                    </div>
                  </label>
                ))}
              </div>
            )}

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-200">Review date(s) (optional)</p>
                  <p className="text-xs text-slate-500 mt-1">
                    If set, these become tasks on the case and the case status shows review scheduled.
                  </p>
                </div>
                <button type="button" className={btnSecondary} onClick={addOutcomeReviewRow}>
                  Add review
                </button>
              </div>
              {(outcomeModal.reviews || []).map((review, index) => (
                <div key={`review-${index}`} className="grid grid-cols-1 md:grid-cols-[1fr_160px_auto] gap-2 items-end">
                  <Field label="Title">
                    <input
                      className={inputClass}
                      value={review.title}
                      onChange={(e) => updateOutcomeReview(index, { title: e.target.value })}
                    />
                  </Field>
                  <Field label="Due date">
                    <input
                      type="date"
                      className={inputClass}
                      value={review.dueAt}
                      onChange={(e) => updateOutcomeReview(index, { dueAt: e.target.value })}
                    />
                  </Field>
                  <button
                    type="button"
                    className={`${btnSecondary} mb-0.5`}
                    onClick={() => removeOutcomeReviewRow(index)}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>

            <div className={outcomeFieldInvalid('appealRecipientUid') ? 'rounded-lg ring-1 ring-red-500/60 p-1' : ''}>
              <Field label="Appeal to (manager)">
                <EmployeeSelect
                  value={outcomeModal.appealRecipientUid || ''}
                  onChange={(uid) => setOutcomeModal((prev) => ({ ...prev, appealRecipientUid: uid }))}
                  employees={employees}
                  loading={employeesLoading}
                  mode="managers"
                  emptyLabel="Select who the employee appeals to"
                />
                <p className="text-xs text-slate-500 mt-1">
                  The letter will confirm the right to appeal in writing to this person within 5 working days.
                </p>
                {appealRecipientPriorRoles.length > 0 && (
                  <p className="text-sm text-amber-200 mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">
                    Warning: this manager was already involved earlier in this case (
                    {appealRecipientPriorRoles.join(', ')}
                    ). Prefer an independent appeal manager where practicable.
                  </p>
                )}
              </Field>
            </div>

            {renderRestrictionFields(
              {
                enabled: Boolean(outcomeModal.restrictionEnabled),
                type: outcomeModal.restrictionType || '',
                other: outcomeModal.restrictionOther || '',
                duration: outcomeModal.restrictionDuration || '',
                expiresAt: outcomeModal.restrictionExpiresAt || '',
              },
              (updater) => {
                setOutcomeModal((prev) => {
                  if (!prev) return prev;
                  const current = {
                    enabled: Boolean(prev.restrictionEnabled),
                    type: prev.restrictionType || '',
                    other: prev.restrictionOther || '',
                    duration: prev.restrictionDuration || '',
                    expiresAt: prev.restrictionExpiresAt || '',
                  };
                  const next = typeof updater === 'function' ? updater(current) : updater;
                  return {
                    ...prev,
                    restrictionEnabled: Boolean(next.enabled),
                    restrictionType: next.type || '',
                    restrictionOther: next.other || '',
                    restrictionDuration: next.duration || '',
                    restrictionExpiresAt: next.expiresAt || '',
                  };
                });
              },
              { disabled: saving },
            )}

            {history.length > 0 && (
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium text-slate-200">Supersede existing warning(s)?</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Tick any live warnings this new outcome replaces. Unticked warnings stay active.
                  </p>
                </div>
                <ul className="space-y-2">
                  {history.map((item) => {
                    const checked = (outcomeModal.supersedeCaseIds || []).includes(item.id);
                    return (
                      <label
                        key={item.id}
                        className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer ${
                          checked ? 'border-indigo-500/40 bg-indigo-500/10' : 'border-[#1a2540] hover:bg-[#060e1a]'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleSupersedeCase(item.id)}
                          className="mt-0.5"
                        />
                        <span className="text-sm text-slate-200">{formatActiveWarning(item)}</span>
                      </label>
                    );
                  })}
                </ul>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                className={btnPrimary}
                disabled={saving}
                onClick={confirmOutcome}
              >
                Generate letter, issue & close
              </button>
              <button
                type="button"
                className={btnSecondary}
                onClick={() => {
                  setOutcomeModal(null);
                  setOutcomeShowErrors(false);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
