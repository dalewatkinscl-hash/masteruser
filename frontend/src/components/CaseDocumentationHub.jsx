import { useMemo, useRef, useState } from 'react';
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
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [showInterviewForm, setShowInterviewForm] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [listFilter, setListFilter] = useState('stage');
  const [openRecord, setOpenRecord] = useState(null);
  const [interviewError, setInterviewError] = useState('');
  const uploadInputRef = useRef(null);

  const defaultIntervieweeUid = caseData?.employeeUid || '';

  const [interviewForm, setInterviewForm] = useState({
    interviewAt: new Date().toISOString().slice(0, 10),
    interviewTime: '10:00',
    intervieweeUid: defaultIntervieweeUid,
    managersPresentUids: [],
    content: '',
  });

  const allRecords = useMemo(
    () => buildDocumentationRecords({ minutes, documents, caseData }),
    [minutes, documents, caseData],
  );

  const stageRecords = useMemo(
    () => allRecords.filter((item) => item.stageKey === stageKey),
    [allRecords, stageKey],
  );

  const visibleRecords = listFilter === 'stage' ? stageRecords : allRecords;
  const recordsEmptyMessage = documentationEmptyMessage(processFamily, stageKey, listFilter);
  const letterTemplates = useMemo(
    () => templates.filter((item) => item.documentType !== 'minutes'),
    [templates],
  );
  const missingInterviewNotes = missingDocuments.some((item) => item.documentType === 'minutes');

  const resetInterviewForm = () => {
    setInterviewForm({
      interviewAt: new Date().toISOString().slice(0, 10),
      interviewTime: '10:00',
      intervieweeUid: defaultIntervieweeUid,
      managersPresentUids: [],
      content: '',
    });
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
          {missingInterviewNotes && canAdd && (
            <p className="text-xs text-amber-300 w-full">
              Record an interview for this stage before continuing to the next step.
            </p>
          )}
          {canAdd && (
            <div className="relative">
              <button
                type="button"
                className={btnPrimary}
                disabled={saving || uploading}
                onClick={() => setMenuOpen((open) => !open)}
              >
                Add documentation
              </button>
              {menuOpen && (
                <div className="absolute right-0 z-20 mt-2 w-56 rounded-lg border border-[#1a2540] bg-[#0b1220] shadow-xl py-1">
                  <button
                    type="button"
                    className="block w-full text-left px-4 py-2 text-sm text-slate-200 hover:bg-[#060e1a]"
                    onClick={() => {
                      setInterviewForm((prev) => ({
                        ...prev,
                        intervieweeUid: prev.intervieweeUid || defaultIntervieweeUid,
                      }));
                      setShowInterviewForm(true);
                      setShowTemplates(false);
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
              <p className="text-sm font-medium text-indigo-100">Record interview — {stageLabel(stageKey)}</p>
              <button type="button" className="text-xs text-slate-400 hover:text-slate-200" onClick={() => setShowInterviewForm(false)}>
                Cancel
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
              Send notes to employee for confirmation
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
