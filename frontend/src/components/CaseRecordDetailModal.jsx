import { useEffect, useState } from 'react';
import {
  formatInterviewWhen,
  formatInterviewee,
  formatManagersPresent,
  interviewStatusLabel,
  interviewStatusTone,
  interviewDisplayStatus,
  isAmendmentPending,
  pendingAmendmentRequests,
} from '../utils/interviewNotes';
import { stageLabel } from '../utils/peopleCasesAccess';

const inputClass = 'w-full bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-3 py-2';
const btnSecondary = 'px-3 py-2 text-sm border border-[#1a2540] rounded-lg text-slate-200 hover:bg-[#0b1220] disabled:opacity-50';
const btnPrimary = 'px-3 py-2 text-sm rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium disabled:opacity-50';

export default function CaseRecordDetailModal({
  record,
  caseData,
  onClose,
  canManageAmendments = false,
  onRespondToMinutes,
  saving = false,
}) {
  const [amendedContent, setAmendedContent] = useState('');
  const [declineReason, setDeclineReason] = useState('');
  const [actionError, setActionError] = useState('');

  const minute = record?.minute;
  const document = record?.document;
  const displayStatus = minute ? interviewDisplayStatus(minute) : record?.status;
  const showAmendmentPanel = canManageAmendments && minute && isAmendmentPending(minute);

  useEffect(() => {
    setAmendedContent(minute?.content || '');
    setDeclineReason('');
    setActionError('');
  }, [record?.id, minute?.content, minute?.status]);

  if (!record) return null;

  const runAction = async (action, extra = {}) => {
    if (!minute?.id || !onRespondToMinutes) return;
    setActionError('');
    try {
      await onRespondToMinutes(minute.id, action, extra);
      onClose?.();
    } catch (err) {
      setActionError(err.message || 'Failed to update notes.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl border border-[#1a2540] bg-[#0b1220] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 flex items-start justify-between gap-3 border-b border-[#1a2540] bg-[#0b1220] px-5 py-4">
          <div>
            <p className="text-xs uppercase text-slate-500">{record.kind === 'interview' ? 'Interview notes' : 'Document'}</p>
            <h3 className="text-lg font-semibold text-white mt-1">{record.summary}</h3>
            <span className={`inline-flex mt-2 px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wide border ${interviewStatusTone(displayStatus)}`}>
              {minute ? interviewStatusLabel(displayStatus) : record.statusLabel}
            </span>
          </div>
          <button type="button" className={btnSecondary} onClick={onClose}>Close</button>
        </div>

        <div className="px-5 py-4 space-y-4 text-sm text-slate-300">
          {record.stageKey && (
            <p><span className="text-slate-500">Stage:</span> {stageLabel(record.stageKey)}</p>
          )}
          {minute && (
            <>
              {formatInterviewee(minute, caseData) && (
                <p><span className="text-slate-500">Interviewee:</span> {formatInterviewee(minute, caseData)}</p>
              )}
              {formatInterviewWhen(minute) && (
                <p><span className="text-slate-500">When:</span> {formatInterviewWhen(minute)}</p>
              )}
              {formatManagersPresent(minute) && (
                <p><span className="text-slate-500">Managers present:</span> {formatManagersPresent(minute)}</p>
              )}

              {pendingAmendmentRequests(minute).length > 0 && (
                <div>
                  <p className="text-slate-500 mb-1">Employee amendment request</p>
                  <ul className="space-y-2">
                    {pendingAmendmentRequests(minute).map((item, index) => (
                      <li key={index} className="rounded-lg border border-orange-500/30 bg-orange-500/5 p-3 text-orange-100">
                        {item.text}
                        {item.at && <span className="block text-xs text-orange-200/70 mt-1">{String(item.at).slice(0, 19)}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {Array.isArray(minute.amendmentRequests) && minute.amendmentRequests.some((item) => item.status && item.status !== 'pending') && (
                <div>
                  <p className="text-slate-500 mb-1">Amendment history</p>
                  <ul className="space-y-2">
                    {minute.amendmentRequests.filter((item) => item.status && item.status !== 'pending').map((item, index) => (
                      <li key={index} className="rounded-lg border border-[#1a2540] bg-[#060e1a] p-2 text-slate-300">
                        <p>{item.text}</p>
                        <p className="text-xs text-slate-500 mt-1 capitalize">
                          {item.status}
                          {item.resolvedAt ? ` · ${String(item.resolvedAt).slice(0, 19)}` : ''}
                        </p>
                        {item.managerResponse && (
                          <p className="text-xs text-slate-400 mt-1">Investigator: {item.managerResponse}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div>
                <p className="text-slate-500 mb-1">Notes</p>
                <div className="rounded-lg border border-[#1a2540] bg-[#060e1a] p-3 whitespace-pre-wrap text-slate-200">
                  {minute.content}
                </div>
              </div>

              {showAmendmentPanel && (
                <div className="rounded-lg border border-orange-500/30 bg-orange-500/5 p-4 space-y-4">
                  <p className="text-sm font-medium text-orange-100">Respond to amendment request</p>
                  {actionError && (
                    <p className="text-sm text-red-300">{actionError}</p>
                  )}
                  <label className="block space-y-1">
                    <span className="text-xs uppercase tracking-wide text-slate-500">Apply amendment — edit notes</span>
                    <textarea
                      rows={8}
                      className={inputClass}
                      value={amendedContent}
                      onChange={(event) => setAmendedContent(event.target.value)}
                      disabled={saving}
                    />
                  </label>
                  <button
                    type="button"
                    className={btnPrimary}
                    disabled={saving || !amendedContent.trim()}
                    onClick={() => runAction('apply_amendment', { content: amendedContent.trim() })}
                  >
                    Apply amendment and re-send to employee
                  </button>

                  <div className="border-t border-orange-500/20 pt-4 space-y-2">
                    <label className="block space-y-1">
                      <span className="text-xs uppercase tracking-wide text-slate-500">Decline amendment — optional note to employee</span>
                      <textarea
                        rows={2}
                        className={inputClass}
                        placeholder="Explain why the notes will stay as written (optional)"
                        value={declineReason}
                        onChange={(event) => setDeclineReason(event.target.value)}
                        disabled={saving}
                      />
                    </label>
                    <button
                      type="button"
                      className={btnSecondary}
                      disabled={saving}
                      onClick={() => runAction('decline_amendment', { declineReason: declineReason.trim() })}
                    >
                      Decline amendment and re-send original notes
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {(document?.fileName || document?.sharePointWebUrl) && (
            <div className="rounded-lg border border-indigo-500/25 bg-indigo-500/5 p-3">
              <p className="text-indigo-100 font-medium">{document.fileName || 'Attached file'}</p>
              {document.sharePointWebUrl && (
                <a
                  href={document.sharePointWebUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex mt-2 text-sm text-indigo-300 underline"
                >
                  Open in SharePoint
                </a>
              )}
              {document.documentType && (
                <p className="text-xs text-slate-400 mt-2">Type: {document.documentType}</p>
              )}
            </div>
          )}

          {!minute && document && !document.sharePointWebUrl && (
            <p className="text-slate-500">No additional preview available for this upload.</p>
          )}
        </div>
      </div>
    </div>
  );
}
