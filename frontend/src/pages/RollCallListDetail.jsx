import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import RollCallMemberPicker from '../components/RollCallMemberPicker';
import { readJsonResponse } from '../utils/employeeProfile';
import { printRollCall } from '../utils/rollCallPrint';
import {
  fetchRollCallList,
  formatRollCallDateTime,
  setRollCallMemberTick,
  setRollCallMemberStatus,
  distributeRollCallList,
  updateRollCallList,
  ROLL_CALL_RESPONSE_PRESETS,
} from '../utils/rollCallLists';

export default function RollCallListDetail() {
  const { listId } = useParams();
  const navigate = useNavigate();
  const [list, setList] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'confirmed' | 'rejected' | 'seen' | 'sent'
  const [tickingUid, setTickingUid] = useState('');
  const [printing, setPrinting] = useState(false);

  // Edit list modal
  const [editOpen, setEditOpen] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editMessage, setEditMessage] = useState('');
  const [editConfirmLabel, setEditConfirmLabel] = useState('I am available');
  const [editRejectLabel, setEditRejectLabel] = useState('I am not available');
  const [editPreset, setEditPreset] = useState('availability');
  const [editUids, setEditUids] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  // Distribute modal
  const [distributeOpen, setDistributeOpen] = useState(false);
  const [distributeMessage, setDistributeMessage] = useState('');
  const [distributeConfirmLabel, setDistributeConfirmLabel] = useState('I am available');
  const [distributeRejectLabel, setDistributeRejectLabel] = useState('I am not available');
  const [distributePreset, setDistributePreset] = useState('availability');
  const [resendAll, setResendAll] = useState(false);
  const [distributing, setDistributing] = useState(false);

  const load = async () => {
    const payload = await fetchRollCallList(listId);
    setList(payload.list);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError('');
        await load();
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load roll call.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [listId]);

  const members = list?.members || [];
  const confirmText = list?.confirmLabel || 'I am available';
  const rejectText = list?.rejectLabel || 'I am not available';

  const counts = useMemo(() => {
    const total = members.length;
    const confirmed = members.filter((m) => m.status === 'confirmed' || m.ticked).length;
    const rejected = members.filter((m) => m.status === 'rejected').length;
    const seen = members.filter((m) => m.status === 'seen').length;
    const sent = members.filter((m) => !m.status || m.status === 'sent').length;
    return { total, confirmed, rejected, seen, sent };
  }, [members]);

  const visibleMembers = useMemo(() => {
    if (statusFilter === 'confirmed') {
      return members.filter((m) => m.status === 'confirmed' || m.ticked);
    }
    if (statusFilter === 'rejected') {
      return members.filter((m) => m.status === 'rejected');
    }
    if (statusFilter === 'seen') {
      return members.filter((m) => m.status === 'seen');
    }
    if (statusFilter === 'sent') {
      return members.filter((m) => !m.status || m.status === 'sent');
    }
    return members;
  }, [members, statusFilter]);

  const handleTick = async (member, ticked) => {
    setTickingUid(member.uid);
    setError('');
    try {
      const payload = await setRollCallMemberTick({
        listId,
        uid: member.uid,
        ticked,
      });
      setList(payload.list);
    } catch (err) {
      setError(err.message || 'Failed to update tick.');
    } finally {
      setTickingUid('');
    }
  };

  const handleManualStatus = async (uid, nextStatus) => {
    setTickingUid(uid);
    setError('');
    try {
      const payload = await setRollCallMemberStatus({
        listId,
        uid,
        status: nextStatus,
      });
      setList(payload.list);
    } catch (err) {
      setError(err.message || 'Failed to update status.');
    } finally {
      setTickingUid('');
    }
  };

  const handleDistribute = async (e) => {
    e.preventDefault();
    setDistributing(true);
    setError('');
    try {
      const payload = await distributeRollCallList({
        listId,
        message: distributeMessage.trim(),
        confirmLabel: distributeConfirmLabel.trim() || 'I am available',
        rejectLabel: distributeRejectLabel.trim() || 'I am not available',
        resendAll,
      });
      setList(payload.list);
      setDistributeOpen(false);
    } catch (err) {
      setError(err.message || 'Failed to distribute roll call.');
    } finally {
      setDistributing(false);
    }
  };

  const handlePrint = async () => {
    if (!list) return;
    setPrinting(true);
    setError('');
    try {
      await printRollCall({
        title: list.title,
        employees: members.map((member) => ({
          uid: member.uid,
          fullName: member.fullName,
          email: member.email,
        })),
        includeSignature: false,
      });
    } catch (err) {
      setError(err.message || 'Failed to print.');
    } finally {
      setPrinting(false);
    }
  };

  const openEdit = async () => {
    if (!list) return;
    setEditTitle(list.title || '');
    setEditMessage(list.message || '');
    setEditConfirmLabel(list.confirmLabel || 'I am available');
    setEditRejectLabel(list.rejectLabel || 'I am not available');
    const matchedPreset = ROLL_CALL_RESPONSE_PRESETS.find(
      (p) => p.confirmLabel === (list.confirmLabel || 'I am available') && p.rejectLabel === (list.rejectLabel || 'I am not available')
    );
    setEditPreset(matchedPreset ? matchedPreset.id : 'custom');
    setEditUids(members.map((member) => member.uid));
    setEditOpen(true);
    setError('');
    if (employees.length === 0) {
      setEmployeesLoading(true);
      try {
        const response = await fetch('/api/getEmployeeProfiles', { credentials: 'include' });
        const payload = (await readJsonResponse(response)) || {};
        if (!response.ok) throw new Error(payload.error || 'Failed to load employees.');
        setEmployees(payload.employees || []);
      } catch (err) {
        setError(err.message || 'Failed to load employees.');
      } finally {
        setEmployeesLoading(false);
      }
    }
  };

  const saveEdit = async (event) => {
    event.preventDefault();
    setSavingEdit(true);
    setError('');
    try {
      const payload = await updateRollCallList({
        listId,
        title: editTitle.trim(),
        message: editMessage.trim(),
        confirmLabel: editConfirmLabel.trim() || 'I am available',
        rejectLabel: editRejectLabel.trim() || 'I am not available',
        memberUids: editUids,
      });
      setList(payload.list);
      setEditOpen(false);
    } catch (err) {
      setError(err.message || 'Failed to save changes.');
    } finally {
      setSavingEdit(false);
    }
  };

  const openDistributeModal = () => {
    setDistributeMessage(list?.message || '');
    setDistributeConfirmLabel(list?.confirmLabel || 'I am available');
    setDistributeRejectLabel(list?.rejectLabel || 'I am not available');
    const matchedPreset = ROLL_CALL_RESPONSE_PRESETS.find(
      (p) => p.confirmLabel === (list?.confirmLabel || 'I am available') && p.rejectLabel === (list?.rejectLabel || 'I am not available')
    );
    setDistributePreset(matchedPreset ? matchedPreset.id : 'custom');
    setResendAll(false);
    setDistributeOpen(true);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto px-4 sm:px-8 py-8 space-y-6">
          <div>
            <button
              type="button"
              onClick={() => navigate('/dashboard/hr/roll-calls')}
              className="text-sm text-slate-400 hover:text-slate-200"
            >
              ← All roll calls
            </button>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/25 rounded-xl p-4">
              <p className="text-red-300 text-sm">{error}</p>
            </div>
          )}

          {loading ? (
            <p className="text-sm text-slate-500">Loading list…</p>
          ) : !list ? (
            <p className="text-sm text-slate-500">List not found.</p>
          ) : (
            <>
              {/* Header Details */}
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-2xl font-bold text-white tracking-tight">{list.title}</h1>
                    {list.distributed ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        Distributed
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-800 text-slate-400 border border-slate-700">
                        Draft / Not distributed
                      </span>
                    )}
                    {list.archived && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-950/60 text-amber-300 border border-amber-500/30">
                        Archived
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-slate-400">
                    {list.distributedAt ? (
                      <>
                        Distributed on {formatRollCallDateTime(list.distributedAt)}
                        {list.distributedByName ? ` by ${list.distributedByName}` : ''}
                      </>
                    ) : (
                      <>Created by {list.createdByName || 'Admin'}</>
                    )}
                    {list.updatedByName && list.updatedByName !== list.distributedByName
                      ? ` · updated by ${list.updatedByName}`
                      : ''}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={openDistributeModal}
                    className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1.5 shadow-md shadow-indigo-950/50"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                    {list.distributed ? 'Re-distribute / Notify' : 'Distribute to staff'}
                  </button>
                  <button
                    type="button"
                    onClick={openEdit}
                    className="px-3 py-2 rounded-lg text-xs border border-[#1a2540] text-slate-200 hover:bg-[#060e1a]"
                  >
                    Edit list
                  </button>
                  <button
                    type="button"
                    onClick={handlePrint}
                    disabled={printing || members.length === 0}
                    className="px-3 py-2 rounded-lg text-xs border border-[#1a2540] text-slate-200 hover:bg-[#060e1a] disabled:opacity-40"
                  >
                    {printing ? 'Preparing…' : 'Print sheet'}
                  </button>
                </div>
              </div>

              {/* Message Box if set */}
              {list.message && (
                <div className="rounded-xl border border-indigo-500/20 bg-[#0d1627] p-4 text-sm text-slate-200">
                  <span className="block text-[11px] font-semibold uppercase tracking-wider text-indigo-400 mb-1">
                    Instructions / Message to Staff:
                  </span>
                  <p className="whitespace-pre-wrap">{list.message}</p>
                </div>
              )}

              {/* KPI Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div
                  onClick={() => setStatusFilter('all')}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                    statusFilter === 'all'
                      ? 'border-indigo-500/60 bg-indigo-950/30'
                      : 'border-[#1a2540] bg-[#0b1220] hover:bg-[#0d1627]'
                  }`}
                >
                  <span className="text-[11px] font-medium text-slate-400 block uppercase tracking-wider truncate">
                    Total Staff
                  </span>
                  <span className="text-2xl font-bold text-white mt-0.5 block">{counts.total}</span>
                  <span className="text-[11px] text-slate-500 mt-1 block">100% selected</span>
                </div>

                <div
                  onClick={() => setStatusFilter('confirmed')}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                    statusFilter === 'confirmed'
                      ? 'border-emerald-500/60 bg-emerald-950/30'
                      : 'border-[#1a2540] bg-[#0b1220] hover:bg-[#0d1627]'
                  }`}
                >
                  <span className="text-[11px] font-medium text-emerald-400 block uppercase tracking-wider truncate" title={confirmText}>
                    {confirmText}
                  </span>
                  <span className="text-2xl font-bold text-emerald-300 mt-0.5 block">
                    {counts.confirmed}
                  </span>
                  <span className="text-[11px] text-emerald-500/80 mt-1 block">
                    {counts.total ? Math.round((counts.confirmed / counts.total) * 100) : 0}% responded
                  </span>
                </div>

                <div
                  onClick={() => setStatusFilter('rejected')}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                    statusFilter === 'rejected'
                      ? 'border-rose-500/60 bg-rose-950/30'
                      : 'border-[#1a2540] bg-[#0b1220] hover:bg-[#0d1627]'
                  }`}
                >
                  <span className="text-[11px] font-medium text-rose-400 block uppercase tracking-wider truncate" title={rejectText}>
                    {rejectText}
                  </span>
                  <span className="text-2xl font-bold text-rose-300 mt-0.5 block">
                    {counts.rejected}
                  </span>
                  <span className="text-[11px] text-rose-500/80 mt-1 block">
                    {counts.total ? Math.round((counts.rejected / counts.total) * 100) : 0}% responded
                  </span>
                </div>

                <div
                  onClick={() => setStatusFilter('seen')}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                    statusFilter === 'seen'
                      ? 'border-sky-500/60 bg-sky-950/30'
                      : 'border-[#1a2540] bg-[#0b1220] hover:bg-[#0d1627]'
                  }`}
                >
                  <span className="text-[11px] font-medium text-sky-400 block uppercase tracking-wider">
                    Seen
                  </span>
                  <span className="text-2xl font-bold text-sky-300 mt-0.5 block">{counts.seen}</span>
                  <span className="text-[11px] text-sky-500/80 mt-1 block">Awaiting response</span>
                </div>

                <div
                  onClick={() => setStatusFilter('sent')}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                    statusFilter === 'sent'
                      ? 'border-amber-500/60 bg-amber-950/30'
                      : 'border-[#1a2540] bg-[#0b1220] hover:bg-[#0d1627]'
                  }`}
                >
                  <span className="text-[11px] font-medium text-amber-400 block uppercase tracking-wider">
                    Sent
                  </span>
                  <span className="text-2xl font-bold text-amber-300 mt-0.5 block">{counts.sent}</span>
                  <span className="text-[11px] text-amber-500/80 mt-1 block">Unopened / unseen</span>
                </div>
              </div>

              {/* Filter Tabs */}
              <div className="flex flex-wrap items-center gap-2 border-b border-[#1a2540] pb-2 text-xs">
                <span className="text-slate-400 font-medium mr-1">Filter view:</span>
                {[
                  { id: 'all', label: `All (${counts.total})` },
                  { id: 'confirmed', label: `${confirmText} (${counts.confirmed})`, color: 'text-emerald-400' },
                  { id: 'rejected', label: `${rejectText} (${counts.rejected})`, color: 'text-rose-400' },
                  { id: 'seen', label: `Seen (${counts.seen})`, color: 'text-sky-400' },
                  { id: 'sent', label: `Sent (${counts.sent})`, color: 'text-amber-400' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setStatusFilter(tab.id)}
                    className={`px-3 py-1.5 rounded-lg transition-colors font-medium truncate max-w-[200px] ${
                      statusFilter === tab.id
                        ? 'bg-indigo-600 text-white'
                        : `text-slate-300 hover:bg-[#0b1220] ${tab.color || ''}`
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Members List */}
              <div className="rounded-2xl border border-[#1a2540] bg-[#0b1220] divide-y divide-[#1a2540] overflow-hidden">
                {visibleMembers.length === 0 ? (
                  <p className="px-5 py-8 text-sm text-slate-500 text-center">
                    No staff members match the selected filter.
                  </p>
                ) : (
                  visibleMembers.map((member) => {
                    const busy = tickingUid === member.uid;
                    const status = member.status || (member.ticked ? 'confirmed' : 'sent');
                    const isConfirmed = status === 'confirmed' || member.ticked;
                    const isRejected = status === 'rejected';
                    const isSeen = status === 'seen';
                    const isSent = status === 'sent';

                    return (
                      <div
                        key={member.uid}
                        className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-3.5 hover:bg-[#060e1a]/50 transition-colors ${
                          isConfirmed
                            ? 'bg-emerald-950/10'
                            : isRejected
                            ? 'bg-rose-950/10'
                            : ''
                        }`}
                      >
                        <div className="flex items-start gap-3 min-w-0 flex-1">
                          <input
                            type="checkbox"
                            checked={Boolean(member.ticked)}
                            disabled={busy}
                            onChange={(e) => handleTick(member, e.target.checked)}
                            title="Tick off employee"
                            className="mt-1 w-4 h-4 rounded border-[#1a2540] bg-[#060e1a] text-indigo-500 focus:ring-indigo-500/40"
                          />

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={`text-sm font-semibold ${
                                  isConfirmed ? 'text-white' : 'text-slate-200'
                                }`}
                              >
                                {member.fullName || member.email || member.uid}
                              </span>

                              {/* Status Badge */}
                              {isConfirmed ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                  ✓ {confirmText}
                                </span>
                              ) : isRejected ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                                  ✕ {rejectText}
                                </span>
                              ) : isSeen ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-sky-500/20 text-sky-300 border border-sky-500/30">
                                  👁 Seen (Awaiting)
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                                  ✉ Sent
                                </span>
                              )}
                            </div>

                            {member.email && (
                              <span className="block text-xs text-slate-400 mt-0.5">
                                {member.email}
                              </span>
                            )}

                            {/* Response Note if present */}
                            {member.responseNote && (
                              <div className="mt-1.5 text-xs text-slate-300 bg-black/40 border border-white/10 rounded-lg px-2.5 py-1 inline-block">
                                Note: &ldquo;{member.responseNote}&rdquo;
                              </div>
                            )}

                            {/* Timestamps */}
                            <div className="flex flex-wrap gap-x-3 text-[11px] text-slate-500 mt-1">
                              {member.respondedAt && (
                                <span>Responded: {formatRollCallDateTime(member.respondedAt)}</span>
                              )}
                              {!member.respondedAt && member.seenAt && (
                                <span>Seen: {formatRollCallDateTime(member.seenAt)}</span>
                              )}
                              {member.sentAt && !member.seenAt && (
                                <span>Sent: {formatRollCallDateTime(member.sentAt)}</span>
                              )}
                              {member.tickedByName && (
                                <span>Ticked by {member.tickedByName}</span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Admin manual override actions */}
                        <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                          {!isConfirmed && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleManualStatus(member.uid, 'confirmed')}
                              className="px-2.5 py-1 rounded text-xs font-medium border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
                              title={`Manually mark staff member as "${confirmText}"`}
                            >
                              Mark: {confirmText}
                            </button>
                          )}

                          {!isRejected && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleManualStatus(member.uid, 'rejected')}
                              className="px-2.5 py-1 rounded text-xs font-medium border border-rose-500/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 disabled:opacity-50"
                              title={`Manually mark staff member as "${rejectText}"`}
                            >
                              Mark: {rejectText}
                            </button>
                          )}

                          {(isConfirmed || isRejected) && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleManualStatus(member.uid, 'sent')}
                              className="px-2 py-1 rounded text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                              title="Reset status back to Sent"
                            >
                              Reset
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Edit Roll Call Modal */}
      {editOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div
            className="w-full max-w-xl max-h-[90vh] overflow-auto rounded-2xl border border-[#1a2540] bg-[#0b1220] shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-roll-call-title"
          >
            <form onSubmit={saveEdit}>
              <div className="px-6 py-5 border-b border-[#1a2540] bg-[#0d1627]">
                <h2 id="edit-roll-call-title" className="text-lg font-semibold text-white">
                  Edit Roll Call
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Update the title, instructions, response buttons or selected members.
                </p>
              </div>
              <div className="px-6 py-5 space-y-4">
                <div>
                  <label className="block text-[11px] font-medium uppercase tracking-wider text-slate-400 mb-1">
                    List Title / Question
                  </label>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    required
                    className="w-full bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium uppercase tracking-wider text-slate-400 mb-1">
                    Instructions / Message (optional)
                  </label>
                  <textarea
                    value={editMessage}
                    onChange={(e) => setEditMessage(e.target.value)}
                    rows={2}
                    className="w-full bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                {/* Response Buttons Preset & Labels in Edit */}
                <div className="rounded-xl border border-indigo-500/20 bg-indigo-950/20 p-3.5 space-y-3">
                  <span className="block text-[11px] font-semibold uppercase tracking-wider text-indigo-300">
                    Response Button Presets:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {ROLL_CALL_RESPONSE_PRESETS.map((preset) => {
                      const active = editPreset === preset.id;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => {
                            setEditPreset(preset.id);
                            if (preset.id !== 'custom') {
                              setEditConfirmLabel(preset.confirmLabel);
                              setEditRejectLabel(preset.rejectLabel);
                            }
                          }}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                            active
                              ? 'bg-indigo-600 text-white shadow-sm'
                              : 'bg-[#060e1a] border border-[#1a2540] text-slate-300 hover:bg-[#0e172a]'
                          }`}
                        >
                          {preset.name}
                        </button>
                      );
                    })}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                    <div>
                      <label className="block text-[10px] font-medium uppercase tracking-wider text-emerald-400 mb-1">
                        Confirm Button Label
                      </label>
                      <input
                        type="text"
                        value={editConfirmLabel}
                        onChange={(e) => {
                          setEditConfirmLabel(e.target.value);
                          setEditPreset('custom');
                        }}
                        className="w-full bg-[#060e1a] border border-[#1a2540] text-slate-100 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium uppercase tracking-wider text-rose-400 mb-1">
                        Decline Button Label
                      </label>
                      <input
                        type="text"
                        value={editRejectLabel}
                        onChange={(e) => {
                          setEditRejectLabel(e.target.value);
                          setEditPreset('custom');
                        }}
                        className="w-full bg-[#060e1a] border border-[#1a2540] text-slate-100 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>
                </div>

                <RollCallMemberPicker
                  employees={employees}
                  selectedUids={editUids}
                  onChange={setEditUids}
                  loading={employeesLoading}
                  disabled={savingEdit}
                />
              </div>
              <div className="px-6 py-4 border-t border-[#1a2540] bg-[#08101d] flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditOpen(false)}
                  className="px-4 py-2 rounded-lg text-xs border border-[#1a2540] text-slate-300 hover:bg-[#060e1a]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit || !editTitle.trim() || editUids.length === 0}
                  className="px-5 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white"
                >
                  {savingEdit ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Distribute Modal */}
      {distributeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div
            className="w-full max-w-lg rounded-2xl border border-[#1a2540] bg-[#0b1220] shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="distribute-roll-call-title"
          >
            <form onSubmit={handleDistribute}>
              <div className="px-6 py-5 border-b border-[#1a2540] bg-[#0d1627]">
                <h2 id="distribute-roll-call-title" className="text-lg font-semibold text-white">
                  {list?.distributed ? 'Re-distribute Roll Call' : 'Distribute Roll Call to Staff'}
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  This will email all selected employees and display a response banner at the top of their portal page.
                </p>
              </div>

              <div className="px-6 py-5 space-y-4">
                <div>
                  <label className="block text-[11px] font-medium uppercase tracking-wider text-slate-400 mb-1">
                    Instructions / Message to Staff
                  </label>
                  <textarea
                    value={distributeMessage}
                    onChange={(e) => setDistributeMessage(e.target.value)}
                    rows={3}
                    placeholder="e.g. Please confirm if you are available to work this weekend for a private hire."
                    className="w-full bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                {/* Response Button Presets */}
                <div className="rounded-xl border border-indigo-500/20 bg-indigo-950/20 p-3.5 space-y-3">
                  <span className="block text-[11px] font-semibold uppercase tracking-wider text-indigo-300">
                    Response Buttons for Staff:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {ROLL_CALL_RESPONSE_PRESETS.map((preset) => {
                      const active = distributePreset === preset.id;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => {
                            setDistributePreset(preset.id);
                            if (preset.id !== 'custom') {
                              setDistributeConfirmLabel(preset.confirmLabel);
                              setDistributeRejectLabel(preset.rejectLabel);
                            }
                          }}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                            active
                              ? 'bg-indigo-600 text-white shadow-sm'
                              : 'bg-[#060e1a] border border-[#1a2540] text-slate-300 hover:bg-[#0e172a]'
                          }`}
                        >
                          {preset.name}
                        </button>
                      );
                    })}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                    <div>
                      <label className="block text-[10px] font-medium uppercase tracking-wider text-emerald-400 mb-1">
                        Confirm Button Label
                      </label>
                      <input
                        type="text"
                        value={distributeConfirmLabel}
                        onChange={(e) => {
                          setDistributeConfirmLabel(e.target.value);
                          setDistributePreset('custom');
                        }}
                        className="w-full bg-[#060e1a] border border-[#1a2540] text-slate-100 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium uppercase tracking-wider text-rose-400 mb-1">
                        Decline Button Label
                      </label>
                      <input
                        type="text"
                        value={distributeRejectLabel}
                        onChange={(e) => {
                          setDistributeRejectLabel(e.target.value);
                          setDistributePreset('custom');
                        }}
                        className="w-full bg-[#060e1a] border border-[#1a2540] text-slate-100 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>
                </div>

                {list?.distributed && (
                  <label className="flex items-start gap-2.5 cursor-pointer rounded-xl border border-amber-500/30 bg-amber-950/20 p-3">
                    <input
                      type="checkbox"
                      checked={resendAll}
                      onChange={(e) => setResendAll(e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded border-[#1a2540] bg-[#060e1a] text-indigo-500"
                    />
                    <div className="min-w-0 flex-1">
                      <span className="block text-xs font-semibold text-amber-200">
                        Force reset &amp; re-notify all staff
                      </span>
                      <span className="block text-[11px] text-amber-300/80 mt-0.5">
                        If unchecked, only staff who have not yet responded will be notified.
                      </span>
                    </div>
                  </label>
                )}

                <div className="rounded-xl border border-indigo-500/20 bg-indigo-950/20 p-3 text-xs text-indigo-300">
                  Target: <strong>{members.length} employees</strong> on this list.
                </div>
              </div>

              <div className="px-6 py-4 border-t border-[#1a2540] bg-[#08101d] flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setDistributeOpen(false)}
                  disabled={distributing}
                  className="px-4 py-2 rounded-lg text-xs border border-[#1a2540] text-slate-300 hover:bg-[#060e1a]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={distributing}
                  className="px-5 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white flex items-center gap-1.5 shadow-md shadow-indigo-950/50"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                  {distributing ? 'Distributing…' : 'Send & Distribute'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
