import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { readJsonResponse } from '../utils/employeeProfile';
import { getCaseProgressStatus, stageLabel } from '../utils/peopleCasesAccess';
import {
  formatInterviewWhen,
  formatManagersPresent,
  interviewDisplayStatus,
  interviewStatusLabel,
  interviewStatusTone,
} from '../utils/interviewNotes';

function isEvidenceDoc(doc) {
  const type = String(doc?.documentType || '').toLowerCase();
  if (['invite', 'file_note_for_improvement', 'warning', 'outcome', 'suspension_letter', 'training_outline', 'pip_plan'].includes(type)) {
    return false;
  }
  return ['evidence', 'minutes', 'letter', 'other'].includes(type)
    || /witness|investigation|statement|note/i.test(String(doc?.fileName || ''));
}

function documentTypeLabel(doc) {
  const type = String(doc?.documentType || '').toLowerCase();
  if (doc?.warningPresetLabel) return doc.warningPresetLabel;
  if (type === 'file_note_for_improvement') return 'File note for improvement';
  if (type === 'invite') return 'Hearing invite';
  if (type === 'outcome') return 'Outcome letter';
  return type ? type.replace(/_/g, ' ') : 'Document';
}

export default function EmployeeCaseActionsPanel() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [data, setData] = useState({
    pendingMinutes: [],
    pendingFileNotes: [],
    pendingWarnings: [],
    cases: [],
    bumpPrompts: [],
    documents: [],
    pendingHearingInvites: [],
    badgeCount: 0,
  });
  const [selectedCaseId, setSelectedCaseId] = useState(null);
  const [amendText, setAmendText] = useState({});
  const [showAmendForm, setShowAmendForm] = useState({});
  const [signingId, setSigningId] = useState('');
  const [viewingFileNoteId, setViewingFileNoteId] = useState('');
  const [viewingWarningId, setViewingWarningId] = useState('');
  const [downloadingId, setDownloadingId] = useState('');

  const openPortalDocument = (doc) => {
    if (doc?.portalHtml) {
      const win = window.open('', '_blank');
      if (!win) {
        setError('Pop-up blocked. Allow pop-ups to view the document.');
        return;
      }
      win.document.open();
      win.document.write(doc.portalHtml);
      win.document.close();
      return;
    }
    if (doc?.sharePointWebUrl) {
      window.open(doc.sharePointWebUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const downloadCaseDocument = async (documentId) => {
    setError('');
    setDownloadingId(documentId);
    try {
      const response = await fetch('/api/downloadEmployeeCaseDocument', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId }),
      });
      const payload = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(payload.error || 'Failed to open document.');

      if (payload.portalHtml) {
        openPortalDocument(payload);
        return;
      }

      if (payload.contentBase64) {
        const binary = atob(payload.contentBase64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes], { type: payload.mimeType || 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = payload.fileName || 'document';
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        return;
      }

      if (payload.sharePointWebUrl) {
        window.open(payload.sharePointWebUrl, '_blank', 'noopener,noreferrer');
        return;
      }

      throw new Error('No downloadable file was returned.');
    } catch (err) {
      setError(err.message || 'Failed to open document.');
    } finally {
      setDownloadingId('');
    }
  };

  const openDocument = (doc) => {
    if (doc?.portalHtml) {
      openPortalDocument(doc);
      return;
    }
    downloadCaseDocument(doc.id);
  };

  const load = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await fetch('/api/getEmployeeCaseActions', { credentials: 'include' });
      const payload = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(payload.error || 'Failed to load case actions.');
      setData(payload);
    } catch (err) {
      setError(err.message || 'Failed to load case actions.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const respondMinutes = async (minutesId, action, extra = {}) => {
    setMessage('');
    setError('');
    try {
      const response = await fetch('/api/respondCaseMinutes', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ minutesId, action, ...extra }),
      });
      const payload = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(payload.error || 'Failed to update minutes.');
      setMessage(payload.message || 'Updated.');
      setAmendText((prev) => ({ ...prev, [minutesId]: '' }));
      setShowAmendForm((prev) => ({ ...prev, [minutesId]: false }));
      await load();
    } catch (err) {
      setError(err.message || 'Failed to update minutes.');
    }
  };

  const requestAmendment = (minutesId) => {
    const comments = (amendText[minutesId] || '').trim();
    if (!comments) {
      setError('Please describe what should be amended before submitting your request.');
      return;
    }
    respondMinutes(minutesId, 'amend', { amendmentRequest: comments });
  };

  const signIssuedDocument = async (documentId, label = 'document') => {
    setMessage('');
    setError('');
    setSigningId(documentId);
    try {
      const response = await fetch('/api/signFileNoteDocument', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId }),
      });
      const payload = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(payload.error || `Failed to sign ${label}.`);
      setMessage(payload.message || 'Document digitally signed.');
      setViewingFileNoteId('');
      setViewingWarningId('');
      if (payload.portalHtml) {
        const win = window.open('', '_blank');
        if (win) {
          win.document.open();
          win.document.write(payload.portalHtml);
          win.document.close();
        }
      }
      await load();
    } catch (err) {
      setError(err.message || `Failed to sign ${label}.`);
    } finally {
      setSigningId('');
    }
  };

  const signFileNote = (documentId) => signIssuedDocument(documentId, 'file note');
  const signWarning = (documentId) => signIssuedDocument(documentId, 'warning');

  const selectedCase = useMemo(
    () => (data.cases || []).find((item) => item.id === selectedCaseId) || null,
    [data.cases, selectedCaseId],
  );

  const caseMaterials = useMemo(() => {
    if (!selectedCaseId) {
      return { documents: [], notes: [], evidence: [] };
    }
    const docs = (data.documents || []).filter((doc) => doc.caseId === selectedCaseId);
    const notes = (data.pendingMinutes || []).filter((item) => item.caseId === selectedCaseId);
    // Include all minutes for the case if API ever returns more than pending — pendingMinutes is what we have.
    const evidence = docs.filter((doc) => isEvidenceDoc(doc));
    const documents = docs.filter((doc) => !isEvidenceDoc(doc));
    return { documents, notes, evidence };
  }, [data.documents, data.pendingMinutes, selectedCaseId]);

  const caseActionCounts = useMemo(() => {
    const counts = {};
    for (const item of data.cases || []) {
      counts[item.id] = {
        docs: (data.documents || []).filter((doc) => doc.caseId === item.id).length,
        pendingNotes: (data.pendingMinutes || []).filter((note) => note.caseId === item.id).length,
        pendingFileNotes: (data.pendingFileNotes || []).filter((note) => note.caseId === item.id).length,
        pendingWarnings: (data.pendingWarnings || []).filter((note) => note.caseId === item.id).length,
        hearing: (data.pendingHearingInvites || []).some((invite) => invite.caseId === item.id),
      };
    }
    return counts;
  }, [data.cases, data.documents, data.pendingMinutes, data.pendingFileNotes, data.pendingWarnings, data.pendingHearingInvites]);

  if (loading) return <p className="text-sm text-slate-400">Loading your case actions…</p>;

  if (selectedCase) {
    const progress = getCaseProgressStatus(selectedCase);
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <button
              type="button"
              className="text-sm text-slate-400 hover:text-slate-200"
              onClick={() => setSelectedCaseId(null)}
            >
              ← Back to My cases
            </button>
            <h2 className="text-lg font-semibold text-white mt-2">{selectedCase.title || 'Case'}</h2>
            <p className="text-sm text-slate-400 mt-1">
              {String(selectedCase.processFamily || 'disciplinary').replace(/_/g, ' ')}
              {' · '}
              {stageLabel(selectedCase.stage)}
            </p>
            <p className="text-sm text-slate-500 mt-1">{progress.label}</p>
          </div>
          <Link to="/dashboard/bump-card" className="text-sm text-indigo-300">Submit bump card</Link>
        </div>

        {error && <div className="bg-red-500/10 border border-red-500/25 rounded-lg p-3 text-sm text-red-300">{error}</div>}
        {message && <div className="bg-emerald-500/10 border border-emerald-500/25 rounded-lg p-3 text-sm text-emerald-300">{message}</div>}

        {caseMaterials.documents.length > 0 && (
          <section className="rounded-xl border border-[#1a2540] bg-[#0b1220] p-4 space-y-3">
            <h3 className="text-white font-medium">Issued documents</h3>
            <ul className="space-y-2">
              {caseMaterials.documents.map((doc) => (
                <li key={doc.id} className="text-sm text-slate-300 flex justify-between gap-3 items-center border border-[#1a2540] rounded-lg px-3 py-2">
                  <span>
                    {documentTypeLabel(doc)}: {doc.fileName || 'Document'}
                    {doc.employeeSignStatus === 'pending' && (
                      <span className="ml-2 text-[10px] uppercase text-amber-300">Awaiting your signature</span>
                    )}
                    {doc.employeeSignStatus === 'signed' && (
                      <span className="ml-2 text-[10px] uppercase text-emerald-300">Signed</span>
                    )}
                  </span>
                  <button
                    type="button"
                    className="text-indigo-300 disabled:opacity-50"
                    disabled={downloadingId === doc.id}
                    onClick={() => openDocument(doc)}
                  >
                    {downloadingId === doc.id ? 'Opening…' : (doc.portalHtml ? 'View' : 'Open')}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {caseMaterials.notes.length > 0 && (
          <section className="rounded-xl border border-[#1a2540] bg-[#0b1220] p-4 space-y-3">
            <h3 className="text-white font-medium">Interview notes</h3>
            {caseMaterials.notes.map((item) => {
              const displayStatus = interviewDisplayStatus(item);
              const amendOpen = showAmendForm[item.id];
              return (
                <div key={item.id} className="border border-[#1a2540] rounded-lg p-3 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs uppercase text-slate-500">{item.meetingType}</p>
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wide border ${interviewStatusTone(displayStatus)}`}>
                      {interviewStatusLabel(displayStatus)}
                    </span>
                  </div>
                  {formatInterviewWhen(item) && (
                    <p className="text-xs text-slate-500">Interview: {formatInterviewWhen(item)}</p>
                  )}
                  {formatManagersPresent(item) && (
                    <p className="text-xs text-slate-400">
                      Managers present: {formatManagersPresent(item)}
                    </p>
                  )}
                  <p className="text-sm text-slate-300 whitespace-pre-wrap">{item.content}</p>
                  {item.status === 'issued' && (
                    <>
                      {amendOpen && (
                        <label className="block space-y-1">
                          <span className="text-xs uppercase tracking-wide text-slate-500">What should be amended?</span>
                          <textarea
                            className="w-full bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-3 py-2"
                            rows={3}
                            placeholder="Describe what is inaccurate or missing from these notes…"
                            value={amendText[item.id] || ''}
                            onChange={(e) => setAmendText((prev) => ({ ...prev, [item.id]: e.target.value }))}
                          />
                        </label>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="px-3 py-1.5 text-sm rounded-lg bg-indigo-600 text-white"
                          onClick={() => respondMinutes(item.id, 'sign_off')}
                        >
                          Sign off as accurate
                        </button>
                        {!amendOpen ? (
                          <button
                            type="button"
                            className="px-3 py-1.5 text-sm rounded-lg border border-[#1a2540] text-slate-200"
                            onClick={() => {
                              setError('');
                              setShowAmendForm((prev) => ({ ...prev, [item.id]: true }));
                            }}
                          >
                            Request amendment
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="px-3 py-1.5 text-sm rounded-lg border border-amber-500/40 text-amber-200"
                              disabled={!(amendText[item.id] || '').trim()}
                              onClick={() => requestAmendment(item.id)}
                            >
                              Submit amendment request
                            </button>
                            <button
                              type="button"
                              className="px-3 py-1.5 text-sm rounded-lg border border-[#1a2540] text-slate-400"
                              onClick={() => {
                                setShowAmendForm((prev) => ({ ...prev, [item.id]: false }));
                                setAmendText((prev) => ({ ...prev, [item.id]: '' }));
                              }}
                            >
                              Cancel
                            </button>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </section>
        )}

        {caseMaterials.evidence.length > 0 && (
          <section className="rounded-xl border border-[#1a2540] bg-[#0b1220] p-4 space-y-3">
            <h3 className="text-white font-medium">Evidence</h3>
            <ul className="space-y-2">
              {caseMaterials.evidence.map((doc) => (
                <li key={doc.id} className="text-sm text-slate-300 flex justify-between gap-3 items-center border border-[#1a2540] rounded-lg px-3 py-2">
                  <span>
                    {doc.fileName || 'Evidence document'}
                    <span className="ml-2 text-[10px] uppercase text-slate-500">
                      {documentTypeLabel(doc)}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="text-indigo-300 disabled:opacity-50"
                    disabled={downloadingId === doc.id}
                    onClick={() => openDocument(doc)}
                  >
                    {downloadingId === doc.id ? 'Opening…' : 'Open / download'}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {caseMaterials.documents.length === 0 && caseMaterials.notes.length === 0 && caseMaterials.evidence.length === 0 && (
          <p className="text-sm text-slate-500">No documents, notes, or evidence have been issued for this case yet.</p>
        )}
      </div>
    );
  }

  const hasAnyActions = Boolean(
    data.bumpPrompts?.length
    || data.pendingHearingInvites?.length
    || data.pendingFileNotes?.length
    || data.pendingWarnings?.length
    || data.pendingMinutes?.length
    || data.cases?.length,
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white">My cases</h2>
        <p className="text-sm text-slate-400 mt-1">
          Open a case to view issued documents, interview notes, and evidence. Action items appear above when something needs your response.
        </p>
      </div>

      {error && <div className="bg-red-500/10 border border-red-500/25 rounded-lg p-3 text-sm text-red-300">{error}</div>}
      {message && <div className="bg-emerald-500/10 border border-emerald-500/25 rounded-lg p-3 text-sm text-emerald-300">{message}</div>}

      {data.bumpPrompts?.length > 0 && (
        <section className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-4 space-y-2">
          <h3 className="text-amber-100 font-medium">Bump card required</h3>
          {data.bumpPrompts.map((prompt) => (
            <div key={prompt.id} className="flex items-center justify-between gap-3 text-sm text-amber-50">
              <span>{prompt.notes || 'Please complete a bump card for a reported incident.'}</span>
              <Link to="/dashboard/bump-card" className="px-3 py-1.5 rounded-lg bg-amber-500 text-slate-900 text-xs font-semibold">
                Complete bump card
              </Link>
            </div>
          ))}
        </section>
      )}

      {data.pendingHearingInvites?.length > 0 && (
        <section className="rounded-xl border border-indigo-500/25 bg-indigo-500/10 p-4 space-y-3">
          <h3 className="text-indigo-100 font-medium">Hearing invitations</h3>
          {data.pendingHearingInvites.map((invite) => {
            const inviteDoc = (data.documents || []).find((doc) => doc.id === invite.hearingInviteDocumentId)
              || (data.documents || []).find((doc) => doc.caseId === invite.caseId && doc.documentType === 'invite');
            return (
              <div key={invite.caseId} className="border border-indigo-500/20 rounded-lg p-3 space-y-3 text-sm text-indigo-50">
                <div className="space-y-1">
                  <p className="font-medium">{invite.title || 'Disciplinary hearing'}</p>
                  <p>
                    {invite.hearingScheduledAt || 'Date TBC'}
                    {invite.hearingScheduledTime ? ` at ${invite.hearingScheduledTime}` : ''}
                    {invite.hearingLocation ? ` · ${invite.hearingLocation}` : ''}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {inviteDoc && (
                    <button
                      type="button"
                      className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium"
                      onClick={() => openPortalDocument(inviteDoc)}
                    >
                      View / print invite
                    </button>
                  )}
                  <button
                    type="button"
                    className="px-3 py-1.5 rounded-lg border border-indigo-500/30 text-indigo-100 text-xs font-medium hover:bg-indigo-500/10"
                    onClick={() => setSelectedCaseId(invite.caseId)}
                  >
                    View case materials
                  </button>
                </div>
              </div>
            );
          })}
        </section>
      )}

      {data.pendingFileNotes?.length > 0 && (
        <section className="rounded-xl border border-indigo-500/25 bg-indigo-500/10 p-4 space-y-3">
          <h3 className="text-indigo-100 font-medium">File notes awaiting your digital signature</h3>
          {data.pendingFileNotes.map((item) => {
            const previewCollapsed = viewingFileNoteId === item.id;
            return (
              <div key={item.id} className="border border-indigo-500/20 rounded-lg p-3 space-y-3 bg-[#0b1220]/40">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="text-sm font-medium text-indigo-50">File Note for Improvement</p>
                  {item.portalHtml && (
                    <button
                      type="button"
                      className="text-xs text-indigo-300 hover:text-indigo-200"
                      onClick={() => openPortalDocument(item)}
                    >
                      Open full document ↗
                    </button>
                  )}
                </div>

                {item.fileNoteReason && (
                  <p className="text-sm text-indigo-100/90 whitespace-pre-wrap">
                    <span className="text-indigo-200/70">Reason: </span>{item.fileNoteReason}
                  </p>
                )}
                {item.fileNoteActionRequired && (
                  <p className="text-sm text-indigo-100/90 whitespace-pre-wrap">
                    <span className="text-indigo-200/70">Action required: </span>{item.fileNoteActionRequired}
                  </p>
                )}
                {item.managerSignature?.signedByName && (
                  <p className="text-xs text-emerald-200">
                    Manager signed: {item.managerSignature.signedByName}
                    {item.managerSignature.signedAtLabel ? ` · ${item.managerSignature.signedAtLabel}` : ''}
                  </p>
                )}

                {item.portalHtml && (
                  <div className="rounded-lg border border-[#1a2540] bg-white overflow-hidden">
                    <iframe
                      title="File note for improvement"
                      srcDoc={item.portalHtml}
                      className={`w-full bg-white transition-all ${previewCollapsed ? 'max-h-[160px]' : 'min-h-[520px]'}`}
                      style={{ display: 'block' }}
                    />
                    <button
                      type="button"
                      className="w-full py-1.5 text-xs text-indigo-300 hover:text-indigo-200 border-t border-[#1a2540] bg-[#0b1220]"
                      onClick={() => setViewingFileNoteId(previewCollapsed ? '' : item.id)}
                    >
                      {previewCollapsed ? 'Show full preview ▼' : 'Collapse preview ▲'}
                    </button>
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="px-3 py-1.5 text-sm rounded-lg bg-indigo-600 text-white font-medium disabled:opacity-50"
                    disabled={signingId === item.id}
                    onClick={() => {
                      if (!window.confirm('Digitally sign this File Note for Improvement? Your name and the current date/time will be recorded on the document.')) {
                        return;
                      }
                      signFileNote(item.id);
                    }}
                  >
                    {signingId === item.id ? 'Signing…' : 'Sign digitally'}
                  </button>
                  {item.caseId && (
                    <button
                      type="button"
                      className="px-3 py-1.5 text-sm rounded-lg border border-indigo-500/30 text-indigo-100"
                      onClick={() => setSelectedCaseId(item.caseId)}
                    >
                      View case
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </section>
      )}

      {data.pendingWarnings?.length > 0 && (
        <section className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-4 space-y-3">
          <h3 className="text-amber-100 font-medium">Outcome letters awaiting your digital signature</h3>
          {data.pendingWarnings.map((item) => {
            const previewCollapsed = viewingWarningId === item.id;
            const label = item.warningPresetLabel || documentTypeLabel(item);
            return (
              <div key={item.id} className="border border-amber-500/20 rounded-lg p-3 space-y-3 bg-[#0b1220]/40">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="text-sm font-medium text-amber-50">{label}</p>
                  {item.portalHtml && (
                    <button
                      type="button"
                      className="text-xs text-amber-200 hover:text-amber-100"
                      onClick={() => openPortalDocument(item)}
                    >
                      Open full document ↗
                    </button>
                  )}
                </div>
                {(item.warningEffectiveAt || item.warningExpiresAt) && (
                  <p className="text-xs text-amber-100/80">
                    Live {item.warningEffectiveAt || '—'} → {item.warningExpiresAt || '—'}
                  </p>
                )}
                {item.managerSignature?.signedByName && (
                  <p className="text-xs text-emerald-200">
                    Manager signed: {item.managerSignature.signedByName}
                    {item.managerSignature.signedAtLabel ? ` · ${item.managerSignature.signedAtLabel}` : ''}
                  </p>
                )}
                {item.portalHtml && (
                  <div className="rounded-lg border border-[#1a2540] bg-white overflow-hidden">
                    <iframe
                      title={label}
                      srcDoc={item.portalHtml}
                      className={`w-full bg-white transition-all ${previewCollapsed ? 'max-h-[160px]' : 'min-h-[520px]'}`}
                      style={{ display: 'block' }}
                    />
                    <button
                      type="button"
                      className="w-full py-1.5 text-xs text-amber-200 hover:text-amber-100 border-t border-[#1a2540] bg-[#0b1220]"
                      onClick={() => setViewingWarningId(previewCollapsed ? '' : item.id)}
                    >
                      {previewCollapsed ? 'Show full preview ▼' : 'Collapse preview ▲'}
                    </button>
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="px-3 py-1.5 text-sm rounded-lg bg-amber-500 text-slate-900 font-medium disabled:opacity-50"
                    disabled={signingId === item.id}
                    onClick={() => {
                      if (!window.confirm(`Digitally sign this ${label}? Your name and the current date/time will be recorded on the document.`)) {
                        return;
                      }
                      signWarning(item.id);
                    }}
                  >
                    {signingId === item.id ? 'Signing…' : 'Sign digitally'}
                  </button>
                  {item.caseId && (
                    <button
                      type="button"
                      className="px-3 py-1.5 text-sm rounded-lg border border-amber-500/30 text-amber-50"
                      onClick={() => setSelectedCaseId(item.caseId)}
                    >
                      View case
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </section>
      )}

      {data.pendingMinutes?.length > 0 && (
        <section className="rounded-xl border border-[#1a2540] bg-[#0b1220] p-4 space-y-3">
          <h3 className="text-white font-medium">Minutes awaiting your response</h3>
          {data.pendingMinutes.map((item) => {
            const displayStatus = interviewDisplayStatus(item);
            const amendOpen = showAmendForm[item.id];
            return (
              <div key={item.id} className="border border-[#1a2540] rounded-lg p-3 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs uppercase text-slate-500">{item.meetingType}</p>
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wide border ${interviewStatusTone(displayStatus)}`}>
                    {interviewStatusLabel(displayStatus)}
                  </span>
                </div>
                {formatInterviewWhen(item) && (
                  <p className="text-xs text-slate-500">Interview: {formatInterviewWhen(item)}</p>
                )}
                {formatManagersPresent(item) && (
                  <p className="text-xs text-slate-400">
                    Managers present: {formatManagersPresent(item)}
                  </p>
                )}
                {(item.sharePointWebUrl || item.fileName) && (
                  <div className="rounded-lg border border-indigo-500/20 bg-indigo-500/10 px-3 py-2 text-sm text-indigo-50 space-y-2">
                    <p>Document to review: {item.fileName || 'Case document'}</p>
                    {item.sharePointWebUrl && (
                      <a
                        href={item.sharePointWebUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium"
                      >
                        Open document
                      </a>
                    )}
                  </div>
                )}
                {item.lastAmendmentDeclineReason && (
                  <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                    <p className="text-xs uppercase tracking-wide text-amber-200/80 mb-1">Investigator response</p>
                    {item.lastAmendmentDeclineReason}
                  </div>
                )}
                <p className="text-sm text-slate-300 whitespace-pre-wrap">{item.content}</p>

                {amendOpen && (
                  <label className="block space-y-1">
                    <span className="text-xs uppercase tracking-wide text-slate-500">What should be amended?</span>
                    <textarea
                      className="w-full bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-3 py-2"
                      rows={3}
                      placeholder="Describe what is inaccurate or missing from these notes…"
                      value={amendText[item.id] || ''}
                      onChange={(e) => setAmendText((prev) => ({ ...prev, [item.id]: e.target.value }))}
                    />
                  </label>
                )}

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="px-3 py-1.5 text-sm rounded-lg bg-indigo-600 text-white"
                    onClick={() => respondMinutes(item.id, 'sign_off')}
                  >
                    Sign off as accurate
                  </button>
                  {!amendOpen ? (
                    <button
                      type="button"
                      className="px-3 py-1.5 text-sm rounded-lg border border-[#1a2540] text-slate-200"
                      onClick={() => {
                        setError('');
                        setShowAmendForm((prev) => ({ ...prev, [item.id]: true }));
                      }}
                    >
                      Request amendment
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="px-3 py-1.5 text-sm rounded-lg border border-amber-500/40 text-amber-200"
                        disabled={!(amendText[item.id] || '').trim()}
                        onClick={() => requestAmendment(item.id)}
                      >
                        Submit amendment request
                      </button>
                      <button
                        type="button"
                        className="px-3 py-1.5 text-sm rounded-lg border border-[#1a2540] text-slate-400"
                        onClick={() => {
                          setShowAmendForm((prev) => ({ ...prev, [item.id]: false }));
                          setAmendText((prev) => ({ ...prev, [item.id]: '' }));
                        }}
                      >
                        Cancel
                      </button>
                    </>
                  )}
                  {item.caseId && (
                    <button
                      type="button"
                      className="px-3 py-1.5 text-sm rounded-lg border border-[#1a2540] text-slate-300"
                      onClick={() => setSelectedCaseId(item.caseId)}
                    >
                      View case
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </section>
      )}

      <section className="rounded-xl border border-[#1a2540] bg-[#0b1220] p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-white font-medium">Your cases</h3>
          <Link to="/dashboard/bump-card" className="text-sm text-indigo-300">Submit bump card</Link>
        </div>
        {(data.cases || []).length === 0 ? (
          <p className="text-sm text-slate-500">No cases.</p>
        ) : (
          <ul className="space-y-2">
            {(data.cases || []).map((item) => {
              const progress = getCaseProgressStatus(item);
              const counts = caseActionCounts[item.id] || { docs: 0, pendingNotes: 0, pendingFileNotes: 0, pendingWarnings: 0, hearing: false };
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedCaseId(item.id)}
                    className="w-full text-left rounded-lg border border-[#1a2540] px-4 py-3 hover:bg-[#060e1a] transition-colors"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white">{item.title || 'Untitled case'}</p>
                        <p className="text-xs text-slate-500 mt-1 capitalize">
                          {String(item.processFamily || 'disciplinary').replace(/_/g, ' ')}
                          {' · '}
                          {stageLabel(item.stage)}
                        </p>
                        <p className="text-xs text-slate-400 mt-1">{progress.label}</p>
                      </div>
                      <span className="text-indigo-300 text-sm flex-shrink-0">Open →</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-2">
                      {counts.docs} document{counts.docs === 1 ? '' : 's'}
                      {counts.pendingNotes ? ` · ${counts.pendingNotes} notes to review` : ''}
                      {counts.pendingFileNotes ? ` · file note to sign` : ''}
                      {counts.pendingWarnings ? ` · outcome to sign` : ''}
                      {counts.hearing ? ' · hearing invite' : ''}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {!hasAnyActions && (
        <p className="text-sm text-slate-500">Nothing needs your attention right now.</p>
      )}
    </div>
  );
}
