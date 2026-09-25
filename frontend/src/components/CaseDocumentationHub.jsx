import { useEffect, useMemo, useRef, useState } from 'react';
import EmployeeSelect, { ManagerMultiSelect } from './EmployeeSelect';
import CaseStageDocuments from './CaseStageDocuments';
import CaseRecordDetailModal from './CaseRecordDetailModal';
import {
  buildInterviewContent,
  interviewStatusTone,
  isAmendmentPending,
  MIN_INTERVIEW_MANAGERS,
} from '../utils/interviewNotes';
import { buildDocumentationRecords } from '../utils/caseDocumentationRecords';
import { documentationEmptyMessage, stageAllowsDocumentation, stageLabel } from '../utils/peopleCasesAccess';

const inputClass = 'w-full bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-3 py-2';
const btnSecondary = 'px-3 py-2 text-sm border border-[#1a2540] rounded-lg text-slate-200 hover:bg-[#0b1220]';
const btnPrimary = 'px-3 py-2 text-sm rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium disabled:opacity-50';

function localDateIso(date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function localTimeHm(date = new Date()) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function freshInterviewForm(intervieweeUid = '') {
  const now = new Date();
  return {
    interviewAt: localDateIso(now),
    interviewTime: localTimeHm(now),
    intervieweeUid: intervieweeUid || '',
    managersPresentUids: [],
    content: '',
  };
}

function RecordStatusBadge({ record }) {
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wide border ${interviewStatusTone(record.status)}`}>
      {record.statusLabel}
    </span>
  );
}

function DocumentationRecordList({ records, listFilter, onOpen, emptyMessage }) {
  if (!records.length) {
    return (
      <p className="text-sm text-slate-500">
        {emptyMessage}
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {records.map((record) => (
        <li
          key={record.id}
          className="flex flex-wrap items-center justify-between gap-3 border border-[#1a2540] rounded-lg px-3 py-2.5 bg-[#0b1220]"
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm text-slate-100 truncate">{record.summary}</p>
            {listFilter === 'all' && record.stageLabel && (
              <p className="text-[11px] text-slate-500 mt-0.5">{record.stageLabel}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <RecordStatusBadge record={record} />
            <button
              type="button"
              className={btnSecondary}
              onClick={() => onOpen(record)}
            >
              Open
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function CaseDocumentationHub({
  stageKey,
  processFamily = 'disciplinary',
  caseData,
  minutes = [],
  documents = [],
  templates = [],
  missingDocuments = [],
  sharePointConfigured = false,
  sharePointPath = '',
  sharePointFolderConfirmed = false,
  employees = [],
  employeesLoading = false,
  uploading = false,
  saving = false,
  canAdd = true,
  meetingType = 'interview',
  documentTypes = [],
  uploadType = 'evidence',
  onUploadTypeChange,
  onRecordInterview,
  onUploadDocument,
  onDownloadTemplate,
  onUploadForTemplate,
  onIssueToEmployee,
  onRespondToMinutes,
  focusMinutesId = null,
  onFocusMinutesHandled,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const [showInterviewForm, setShowInterviewForm] = useState(false);
  const [dismissedInitialInterview, setDismissedInitialInterview] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [listFilter, setListFilter] = useState('all');
  const [openRecord, setOpenRecord] = useState(null);
  const [interviewError, setInterviewError] = useState('');
  const uploadInputRef = useRef(null);
  const addMenuRef = useRef(null);
  const autoOpenedKeyRef = useRef('');

  const defaultIntervieweeUid = caseData?.employeeUid || '';

  const [interviewForm, setInterviewForm] = useState(() => freshInterviewForm(defaultIntervieweeUid));

  const allRecords = useMemo(
    () => buildDocumentationRecords({ minutes, documents, caseData }),
    [minutes, documents, caseData],
  );

  const stageRecords = useMemo(
    () => allRecords.filter((item) => item.stageKey === stageKey),
    [allRecords, stageKey],
  );

  const stageInterviewCount = useMemo(
    () => stageRecords.filter((item) => item.kind === 'interview').length,
    [stageRecords],
  );

  /** Stages that open the interview form by default until at least one interview exists. */
  const isRequiredInterviewStage = (
    (processFamily === 'disciplinary' && (stageKey === 'fact_finding' || stageKey === 'hearing'))
    || (processFamily === 'grievance' && stageKey === 'investigation')
  );
  const needsRequiredInterview = Boolean(
    canAdd
    && isRequiredInterviewStage
    && stageInterviewCount === 0,
  );
  const requiredInterviewTitle = stageKey === 'hearing'
    ? 'Hearing interview'
    : stageKey === 'fact_finding'
      ? 'Initial interview'
      : 'Interview';
  const requiredInterviewHint = stageKey === 'hearing'
    ? 'Required for this hearing. Additional interviews can be added from Add documentation.'
    : 'Required for this case. Additional interviews can be added from Add documentation.';

  const visibleRecords = listFilter === 'stage' ? stageRecords : allRecords;
  const recordsEmptyMessage = documentationEmptyMessage(processFamily, stageKey, listFilter);
  const letterTemplates = useMemo(
    () => templates.filter((item) => item.documentType !== 'minutes'),
    [templates],
  );
  const missingInterviewNotes = missingDocuments.some((item) => item.documentType === 'minutes');

  useEffect(() => {
    setDismissedInitialInterview(false);
  }, [stageKey, caseData?.id]);

  useEffect(() => {
    if (!focusMinutesId) return;
    const record = allRecords.find((item) => item.minute?.id === focusMinutesId);
    if (record) {
      setListFilter('all');
      setOpenRecord(record);
    }
    onFocusMinutesHandled?.();
  }, [focusMinutesId, allRecords, onFocusMinutesHandled]);

  useEffect(() => {
    if (!needsRequiredInterview || dismissedInitialInterview) return;
    const key = `${caseData?.id || ''}:${stageKey}`;
    setShowInterviewForm(true);
    if (autoOpenedKeyRef.current !== key) {
      autoOpenedKeyRef.current = key;
      setInterviewForm(freshInterviewForm(defaultIntervieweeUid));
      return;
    }
    setInterviewForm((prev) => ({
      ...prev,
      intervieweeUid: prev.intervieweeUid || defaultIntervieweeUid,
    }));
  }, [needsRequiredInterview, dismissedInitialInterview, defaultIntervieweeUid, caseData?.id, stageKey]);

  useEffect(() => {
    if (!defaultIntervieweeUid) return;
    setInterviewForm((prev) => (
      prev.intervieweeUid ? prev : { ...prev, intervieweeUid: defaultIntervieweeUid }
    ));
  }, [defaultIntervieweeUid]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onPointerDown = (event) => {
      if (addMenuRef.current && !addMenuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  const openAddMenu = () => {
    const rect = addMenuRef.current?.getBoundingClientRect();
    if (rect) {
      const width = 256;
      const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
      setMenuPos({ top: rect.bottom + 8, left });
    }
    setMenuOpen((open) => !open);
  };

  const resetInterviewForm = () => {
    setInterviewForm(freshInterviewForm(defaultIntervieweeUid));
  };

  const submitInterview = async () => {
    setInterviewError('');
    if (!interviewForm.content.trim() || !interviewForm.intervieweeUid) return;
    if (interviewForm.managersPresentUids.length < MIN_INTERVIEW_MANAGERS) {
      setInterviewError(`At least ${MIN_INTERVIEW_MANAGERS} managers must be recorded as present before logging an interview.`);
      return;
    }
    const interviewee = employees.find((person) => person.uid === interviewForm.intervieweeUid);
    const intervieweeName = interviewee?.fullName || interviewee?.email || caseData?.employeeNameSnapshot || '';
    const managersLabel = interviewForm.managersPresentUids
      .map((uid) => employees.find((person) => person.uid === uid)?.fullName || uid)
      .filter(Boolean)
      .join(', ');

    const content = buildInterviewContent({
      content: interviewForm.content,
      interviewAt: interviewForm.interviewAt,
      interviewTime: interviewForm.interviewTime,
      employeeName: intervieweeName,
      managersLabel,
      stageLabelText: stageLabel(stageKey),
    });

    await onRecordInterview?.({
      content,
      interviewAt: interviewForm.interviewAt,
      interviewTime: interviewForm.interviewTime,
      intervieweeUid: interviewForm.intervieweeUid,
      managersPresentUids: interviewForm.managersPresentUids,
      meetingType,
      stageKey,
    });

    resetInterviewForm();
    setShowInterviewForm(false);
    setMenuOpen(false);
  };

  return (
    <>
      <div className="rounded-xl border border-[#1a2540] bg-[#060e1a]/40 p-4 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold text-white">Documentation &amp; interviews</h4>
            <p className="text-xs text-slate-400 mt-1">
              Summaries below — click Open for full notes, attachments, and sign-off status.
              Interview notes are recorded on the portal; Word upload is only needed for letters and outcome documents.
            </p>
          </div>
          {needsRequiredInterview && (
            <p className="text-xs text-amber-300 w-full">
              {stageKey === 'hearing'
                ? 'Record the hearing interview below before continuing to the outcome. You can add more interviews later if needed.'
                : 'Every disciplinary and grievance case needs an initial interview. The form below is ready — complete it before choosing how the case continues. You can add more interviews later if needed.'}
            </p>
          )}
          {!needsRequiredInterview && missingInterviewNotes && canAdd && (
            <p className="text-xs text-amber-300 w-full">
              Record an interview for this stage before continuing to the next step.
            </p>
          )}
          {canAdd && (
            <div className="relative shrink-0" ref={addMenuRef}>
              <button
                type="button"
                className={btnPrimary}
                disabled={saving || uploading}
                onClick={openAddMenu}
              >
                Add documentation
              </button>
              {menuOpen && (
                <div
                  className="fixed z-[80] w-64 rounded-lg border border-[#1a2540] bg-[#0b1220] shadow-2xl py-1"
                  style={{ top: menuPos.top, left: menuPos.left }}
                >
                  <button
                    type="button"
                    className="block w-full text-left px-4 py-2 text-sm text-slate-200 hover:bg-[#060e1a]"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      setInterviewForm(freshInterviewForm(defaultIntervieweeUid));
                      setShowInterviewForm(true);
                      setShowTemplates(false);
                      setDismissedInitialInterview(false);
                      setMenuOpen(false);
                    }}
                  >
                    Record interview
                  </button>
                  <button
                    type="button"
                    className="block w-full text-left px-4 py-2 text-sm text-slate-200 hover:bg-[#060e1a]"
                    onClick={() => {
                      uploadInputRef.current?.click();
                      setMenuOpen(false);
                    }}
                  >
                    Upload document
                  </button>
                  {letterTemplates.length > 0 && (
                    <button
                      type="button"
                      className="block w-full text-left px-4 py-2 text-sm text-slate-200 hover:bg-[#060e1a]"
                      onClick={() => {
                        setShowTemplates(true);
                        setShowInterviewForm(false);
                        setMenuOpen(false);
                      }}
                    >
                      Word templates (letters / outcome docs)
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <input
          ref={uploadInputRef}
          type="file"
          className="hidden"
          disabled={uploading || saving}
          onChange={(event) => onUploadDocument?.(event)}
        />

        {canAdd && showInterviewForm && (
          <div className="rounded-lg border border-indigo-500/30 bg-indigo-500/5 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-indigo-100">
                  {needsRequiredInterview
                    ? `${requiredInterviewTitle} — ${stageLabel(stageKey)}`
                    : `Record interview — ${stageLabel(stageKey)}`}
                </p>
                {needsRequiredInterview && (
                  <p className="text-xs text-indigo-200/70 mt-0.5">
                    {requiredInterviewHint}
                  </p>
                )}
              </div>
              <button
                type="button"
                className="text-xs text-slate-400 hover:text-slate-200"
                onClick={() => {
                  setShowInterviewForm(false);
                  if (needsRequiredInterview) setDismissedInitialInterview(true);
                }}
              >
                {needsRequiredInterview ? 'Hide for now' : 'Cancel'}
              </button>
            </div>
            <label className="block space-y-1">
              <span className="text-xs uppercase tracking-wide text-slate-500">Employee interviewed</span>
              <EmployeeSelect
                value={interviewForm.intervieweeUid}
                onChange={(uid) => setInterviewForm((prev) => ({ ...prev, intervieweeUid: uid }))}
                employees={employees}
                loading={employeesLoading}
                mode="employees"
                allowEmpty={false}
                emptyLabel="Select employee interviewed"
                disabled={saving}
              />
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Defaults to the case employee. Click <span className="text-slate-300">Change</span> to
                interview someone else first (for example a witness) — notes are sent to that person
                for confirmation.
              </p>
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="block space-y-1">
                <span className="text-xs uppercase tracking-wide text-slate-500">Interview date</span>
                <input
                  type="date"
                  className={inputClass}
                  value={interviewForm.interviewAt}
                  onChange={(e) => setInterviewForm((prev) => ({ ...prev, interviewAt: e.target.value }))}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs uppercase tracking-wide text-slate-500">Interview time</span>
                <input
                  type="time"
                  className={inputClass}
                  value={interviewForm.interviewTime}
                  onChange={(e) => setInterviewForm((prev) => ({ ...prev, interviewTime: e.target.value }))}
                />
              </label>
            </div>
            <label className="block space-y-1">
              <span className="text-xs uppercase tracking-wide text-slate-500">
                Managers present (minimum {MIN_INTERVIEW_MANAGERS})
              </span>
              <ManagerMultiSelect
                value={interviewForm.managersPresentUids}
                onChange={(uids) => {
                  setInterviewError('');
                  setInterviewForm((prev) => ({ ...prev, managersPresentUids: uids }));
                }}
                employees={employees}
                loading={employeesLoading}
                disabled={saving}
                minManagers={MIN_INTERVIEW_MANAGERS}
                emptyHint={`Search and add at least ${MIN_INTERVIEW_MANAGERS} managers who attended this interview`}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs uppercase tracking-wide text-slate-500">Interview notes</span>
              <textarea
                rows={6}
                className={inputClass}
                placeholder="Record questions asked, employee responses, evidence referred to, and any agreed next steps…"
                value={interviewForm.content}
                onChange={(e) => setInterviewForm((prev) => ({ ...prev, content: e.target.value }))}
              />
            </label>
            {interviewError && (
              <p className="text-sm text-amber-300">{interviewError}</p>
            )}
            <button
              type="button"
              className={btnPrimary}
              disabled={
                saving
                || !interviewForm.content.trim()
                || !interviewForm.intervieweeUid
                || interviewForm.managersPresentUids.length < MIN_INTERVIEW_MANAGERS
              }
              onClick={submitInterview}
            >
              {interviewForm.intervieweeUid
                && interviewForm.intervieweeUid !== defaultIntervieweeUid
                ? 'Send notes for confirmation'
                : 'Send notes to employee for confirmation'}
            </button>
          </div>
        )}

        {canAdd && showTemplates && letterTemplates.length > 0 && (
          <div className="border-t border-[#1a2540] pt-4">
            <CaseStageDocuments
              templates={letterTemplates}
              missingDocuments={missingDocuments.filter((item) => item.documentType !== 'minutes')}
              sharePointConfigured={sharePointConfigured}
              sharePointPath={sharePointPath}
              sharePointFolderConfirmed={sharePointFolderConfirmed}
              uploading={uploading}
              saving={saving}
              onDownloadTemplate={onDownloadTemplate}
              onUploadForTemplate={onUploadForTemplate}
              onIssueToEmployee={onIssueToEmployee}
            />
          </div>
        )}

        <div className="border-t border-[#1a2540] pt-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-slate-200">Records</p>
            <div className="flex gap-2 text-xs">
              <button
                type="button"
                className={`px-2 py-1 rounded ${listFilter === 'stage' ? 'bg-indigo-600 text-white' : 'text-slate-400 border border-[#1a2540]'}`}
                onClick={() => setListFilter('stage')}
              >
                This stage ({stageRecords.length})
              </button>
              <button
                type="button"
                className={`px-2 py-1 rounded ${listFilter === 'all' ? 'bg-indigo-600 text-white' : 'text-slate-400 border border-[#1a2540]'}`}
                onClick={() => setListFilter('all')}
              >
                All case ({allRecords.length})
              </button>
            </div>
          </div>
          <DocumentationRecordList
            records={visibleRecords}
            listFilter={listFilter}
            emptyMessage={recordsEmptyMessage}
            onOpen={setOpenRecord}
          />
        </div>

        {canAdd && documentTypes.length > 0 && (
          <div className="border-t border-[#1a2540] pt-4 space-y-2">
            <p className="text-xs uppercase text-slate-500">Quick upload</p>
            <div className="flex flex-wrap gap-3 items-center">
              <select
                value={uploadType}
                onChange={(e) => onUploadTypeChange?.(e.target.value)}
                className={`${inputClass} w-auto`}
              >
                {documentTypes.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
              <button
                type="button"
                className={btnSecondary}
                disabled={uploading || saving}
                onClick={() => uploadInputRef.current?.click()}
              >
                {uploading ? 'Uploading…' : 'Choose file to upload'}
              </button>
            </div>
          </div>
        )}
      </div>

      <CaseRecordDetailModal
        record={openRecord}
        caseData={caseData}
        onClose={() => setOpenRecord(null)}
        canManageAmendments={
          canAdd
          && Boolean(openRecord?.minute && isAmendmentPending(openRecord.minute) && onRespondToMinutes)
        }
        onRespondToMinutes={onRespondToMinutes}
        saving={saving}
      />
    </>
  );
}
