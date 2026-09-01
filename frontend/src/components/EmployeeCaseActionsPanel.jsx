import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { readJsonResponse } from '../utils/employeeProfile';

export default function EmployeeCaseActionsPanel() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [data, setData] = useState({
    pendingMinutes: [],
    cases: [],
    bumpPrompts: [],
    documents: [],
    pendingHearingInvites: [],
    badgeCount: 0,
  });
  const [amendText, setAmendText] = useState({});

  const openPortalDocument = (doc) => {
    if (doc?.portalHtml) {
      const win = window.open('', '_blank');
      if (!win) {
        setError('Pop-up blocked. Allow pop-ups to view the invite.');
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
      await load();
    } catch (err) {
      setError(err.message || 'Failed to update minutes.');
    }
  };

  if (loading) return <p className="text-sm text-slate-400">Loading your case actions…</p>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white">My case actions</h2>
        <p className="text-sm text-slate-400 mt-1">
          Minutes to sign off, documents issued to you, and bump card prompts.
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
              <div key={invite.caseId} className="border border-indigo-500/20 rounded-lg p-3 space-y-2 text-sm text-indigo-50">
                <p className="font-medium">{invite.title || 'Disciplinary hearing'}</p>
                <p>
                  {invite.hearingScheduledAt || 'Date TBC'}
                  {invite.hearingScheduledTime ? ` at ${invite.hearingScheduledTime}` : ''}
                  {invite.hearingLocation ? ` · ${invite.hearingLocation}` : ''}
                </p>
                {inviteDoc && (
                  <button
                    type="button"
                    className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium"
                    onClick={() => openPortalDocument(inviteDoc)}
                  >
                    View / print invite
                  </button>
                )}
              </div>
            );
          })}
        </section>
      )}

      <section className="rounded-xl border border-[#1a2540] bg-[#0b1220] p-4 space-y-3">
        <h3 className="text-white font-medium">Minutes awaiting your response</h3>
        {(data.pendingMinutes || []).length === 0 && (
          <p className="text-sm text-slate-500">No minutes pending.</p>
        )}
        {(data.pendingMinutes || []).map((item) => (
          <div key={item.id} className="border border-[#1a2540] rounded-lg p-3 space-y-3">
            <p className="text-xs uppercase text-slate-500">{item.meetingType} · {item.status}</p>
            {Array.isArray(item.managersPresent) && item.managersPresent.length > 0 && (
              <p className="text-xs text-slate-400">
                Managers present: {item.managersPresent.map((person) => person.name || person.uid).join(', ')}
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
            <p className="text-sm text-slate-300 whitespace-pre-wrap">{item.content}</p>
            <textarea
              className="w-full bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-3 py-2"
              rows={2}
              placeholder="Request an amendment (you can do this repeatedly)"
              value={amendText[item.id] || ''}
              onChange={(e) => setAmendText((prev) => ({ ...prev, [item.id]: e.target.value }))}
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="px-3 py-1.5 text-sm rounded-lg bg-indigo-600 text-white"
                onClick={() => respondMinutes(item.id, 'sign_off')}
              >
                Sign off as accurate
              </button>
              <button
                type="button"
                className="px-3 py-1.5 text-sm rounded-lg border border-[#1a2540] text-slate-200"
                onClick={() => respondMinutes(item.id, 'amend', { amendmentRequest: amendText[item.id] || '' })}
              >
                Request amendment
              </button>
              <button
                type="button"
                className="px-3 py-1.5 text-sm rounded-lg border border-amber-500/40 text-amber-200"
                onClick={() => respondMinutes(item.id, 'dispute', {
                  disputedNotes: amendText[item.id] || 'Employee disputes accuracy',
                  employeeVersion: amendText[item.id] || item.content,
                })}
              >
                Dispute (keep both versions)
              </button>
            </div>
          </div>
        ))}
      </section>

      <section className="rounded-xl border border-[#1a2540] bg-[#0b1220] p-4 space-y-3">
        <h3 className="text-white font-medium">Documents issued to you</h3>
        {(data.documents || []).length === 0 && <p className="text-sm text-slate-500">No documents yet.</p>}
        <ul className="space-y-2">
          {(data.documents || []).map((doc) => (
            <li key={doc.id} className="text-sm text-slate-300 flex justify-between gap-3 items-center">
              <span>{doc.documentType}: {doc.fileName}</span>
              {(doc.portalHtml || doc.sharePointWebUrl) && (
                <button
                  type="button"
                  className="text-indigo-300"
                  onClick={() => openPortalDocument(doc)}
                >
                  {doc.portalHtml ? 'View' : 'Open'}
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-[#1a2540] bg-[#0b1220] p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-white font-medium">Your cases</h3>
          <Link to="/dashboard/bump-card" className="text-sm text-indigo-300">Submit bump card</Link>
        </div>
        <ul className="space-y-2">
          {(data.cases || []).map((item) => (
            <li key={item.id} className="text-sm text-slate-300 border border-[#1a2540] rounded-lg px-3 py-2">
              {item.title} · {item.processFamily} · {item.stage}
            </li>
          ))}
          {(data.cases || []).length === 0 && <p className="text-sm text-slate-500">No cases.</p>}
        </ul>
      </section>
    </div>
  );
}
