import { useEffect, useState } from 'react';
import {
  fetchMyPendingRollCalls,
  markRollCallSeen,
  respondRollCall,
  formatRollCallDateTime,
} from '../utils/rollCallLists';

export default function RollCallBanner() {
  const [rollCalls, setRollCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submittingId, setSubmittingId] = useState('');
  const [notes, setNotes] = useState({});
  const [showNoteInput, setShowNoteInput] = useState({});
  const [changeResponseOpen, setChangeResponseOpen] = useState({});
  const [collapsed, setCollapsed] = useState({});
  const [errorMessage, setErrorMessage] = useState('');

  const loadRollCalls = async () => {
    try {
      setErrorMessage('');
      const payload = await fetchMyPendingRollCalls();
      const items = payload.rollCalls || [];
      setRollCalls(items);

      // Automatically mark unseen roll calls as "seen"
      items.forEach((rc) => {
        if (rc.myMember?.status === 'sent') {
          markRollCallSeen(rc.id).catch((err) => {
            console.warn('Failed to mark roll call as seen:', err);
          });
        }
      });
    } catch (err) {
      console.warn('Failed to load pending roll calls:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRollCalls();
  }, []);

  const handleRespond = async (rcId, status) => {
    setSubmittingId(rcId);
    setErrorMessage('');
    const note = notes[rcId] || '';

    try {
      await respondRollCall({
        listId: rcId,
        status,
        note,
      });

      // Update state locally
      setRollCalls((current) =>
        current.map((item) => {
          if (item.id === rcId) {
            return {
              ...item,
              myMember: {
                ...item.myMember,
                status,
                respondedAt: new Date().toISOString(),
                responseNote: note || item.myMember?.responseNote,
              },
            };
          }
          return item;
        }),
      );

      // Close the change response mode if open
      setChangeResponseOpen((prev) => ({ ...prev, [rcId]: false }));
    } catch (err) {
      setErrorMessage(err.message || 'Failed to submit response. Please try again.');
    } finally {
      setSubmittingId('');
    }
  };

  if (loading || rollCalls.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4 mb-6" aria-label="Action required roll calls">
      {errorMessage && (
        <div className="rounded-xl border border-red-500/30 bg-red-950/40 p-4 text-sm text-red-200">
          {errorMessage}
        </div>
      )}

      {rollCalls.map((rc) => {
        const myStatus = rc.myMember?.status || 'sent';
        const hasResponded = myStatus === 'confirmed' || myStatus === 'rejected';
        const isChanging = changeResponseOpen[rc.id];
        const isCollapsed = collapsed[rc.id];
        const busy = submittingId === rc.id;

        const isConfirmed = myStatus === 'confirmed';
        const isRejected = myStatus === 'rejected';

        const confirmText = rc.confirmLabel || 'I am available';
        const rejectText = rc.rejectLabel || 'I am not available';

        return (
          <div
            key={rc.id}
            className={`relative overflow-hidden rounded-2xl border transition-all shadow-xl ${
              !hasResponded
                ? 'border-indigo-500/40 bg-gradient-to-br from-[#0e172a] via-[#101b33] to-[#1e1e38] ring-1 ring-indigo-500/30'
                : isConfirmed
                ? 'border-emerald-500/30 bg-[#061814]/90'
                : 'border-rose-500/30 bg-[#1a0c10]/90'
            }`}
          >
            {/* Top accent glow line */}
            <div
              className={`h-1.5 w-full ${
                !hasResponded
                  ? 'bg-gradient-to-r from-indigo-500 via-sky-400 to-indigo-500 animate-pulse'
                  : isConfirmed
                  ? 'bg-emerald-500'
                  : 'bg-rose-500'
              }`}
            />

            <div className="p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  {!hasResponded ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500" />
                      </span>
                      Action Required · Roll Call
                    </span>
                  ) : isConfirmed ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      ✓ Confirmed: {confirmText}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                      ✕ Responded: {rejectText}
                    </span>
                  )}

                  {rc.distributedAt && (
                    <span className="text-xs text-slate-400">
                      Issued {formatRollCallDateTime(rc.distributedAt)}
                      {rc.distributedByName ? ` by ${rc.distributedByName}` : ''}
                    </span>
                  )}
                </div>

                {hasResponded && (
                  <button
                    type="button"
                    onClick={() => setCollapsed((prev) => ({ ...prev, [rc.id]: !isCollapsed }))}
                    className="text-xs text-slate-400 hover:text-slate-200 underline"
                  >
                    {isCollapsed ? 'Show details' : 'Collapse'}
                  </button>
                )}
              </div>

              {/* Title & Message */}
              <div className="mt-3">
                <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                  {rc.title}
                </h2>
                {rc.message && !isCollapsed && (
                  <div className="mt-2.5 rounded-xl bg-black/30 border border-white/10 p-3.5 text-sm text-slate-200 whitespace-pre-wrap">
                    {rc.message}
                  </div>
                )}
              </div>

              {/* Active response area (when not responded or when changing response) */}
              {(!hasResponded || isChanging) && !isCollapsed && (
                <div className="mt-5 pt-4 border-t border-white/10 space-y-4">
                  {showNoteInput[rc.id] ? (
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Optional Note (e.g. times available, vehicle preferences, etc.)
                      </label>
                      <input
                        type="text"
                        value={notes[rc.id] !== undefined ? notes[rc.id] : rc.myMember?.responseNote || ''}
                        onChange={(e) => setNotes({ ...notes, [rc.id]: e.target.value })}
                        placeholder="e.g. Can do Saturday morning, or anytime after 12pm"
                        className="w-full bg-[#050b14] border border-[#1e293b] text-slate-100 text-sm rounded-lg px-3.5 py-2 focus:outline-none focus:border-indigo-500"
                        maxLength={200}
                      />
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowNoteInput({ ...showNoteInput, [rc.id]: true })}
                      className="text-xs text-indigo-300 hover:text-indigo-200 flex items-center gap-1"
                    >
                      + Add a note with your response
                    </button>
                  )}

                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleRespond(rc.id, 'confirmed')}
                      className="flex-1 min-w-[140px] px-5 py-3 rounded-xl font-semibold text-sm bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-lg shadow-emerald-900/30 flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                      {busy && submittingId === rc.id ? 'Submitting…' : confirmText}
                    </button>

                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleRespond(rc.id, 'rejected')}
                      className="flex-1 min-w-[140px] px-5 py-3 rounded-xl font-semibold text-sm bg-rose-600/90 hover:bg-rose-500 text-white transition-all shadow-lg shadow-rose-950/30 flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      {busy && submittingId === rc.id ? 'Submitting…' : rejectText}
                    </button>

                    {isChanging && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setChangeResponseOpen((prev) => ({ ...prev, [rc.id]: false }))}
                        className="px-4 py-3 rounded-xl text-xs text-slate-300 hover:text-white border border-white/10 hover:bg-white/5"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Already responded status view */}
              {hasResponded && !isChanging && !isCollapsed && (
                <div className="mt-4 pt-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="text-slate-300">
                    {rc.myMember?.respondedAt && (
                      <span>Responded on {formatRollCallDateTime(rc.myMember.respondedAt)}</span>
                    )}
                    {rc.myMember?.responseNote && (
                      <span className="block mt-1 text-slate-400 italic">
                        “{rc.myMember.responseNote}”
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => setChangeResponseOpen((prev) => ({ ...prev, [rc.id]: true }))}
                    className="text-xs text-indigo-300 hover:text-indigo-200 underline font-medium"
                  >
                    Change my response
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
