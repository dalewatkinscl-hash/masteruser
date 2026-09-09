import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import WorkspaceTabs from '../components/WorkspaceTabs';
import RollCallMemberPicker from '../components/RollCallMemberPicker';
import { readJsonResponse } from '../utils/employeeProfile';
import { printRollCall } from '../utils/rollCallPrint';
import {
  fetchRollCallList,
  formatRollCallDateTime,
  rollCallPercentComplete,
  setRollCallMemberTick,
  updateRollCallList,
} from '../utils/rollCallLists';

export default function RollCallListDetail() {
  const { listId } = useParams();
  const navigate = useNavigate();
  const [list, setList] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [untickedOnly, setUntickedOnly] = useState(false);
  const [tickingUid, setTickingUid] = useState('');
  const [printing, setPrinting] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editUids, setEditUids] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

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

  const visibleMembers = useMemo(() => {
    const members = list?.members || [];
    if (!untickedOnly) return members;
    return members.filter((member) => !member.ticked);
  }, [list, untickedOnly]);

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

  const handlePrint = async () => {
    if (!list) return;
    setPrinting(true);
    setError('');
    try {
      await printRollCall({
        title: list.title,
        employees: (list.members || []).map((member) => ({
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
    setEditUids((list.members || []).map((member) => member.uid));
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

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <WorkspaceTabs />
      <div className="flex-1 overflow-auto">
        <div className="max-w-3xl mx-auto px-4 sm:px-8 py-8 space-y-6">
          <div>
            <button
              type="button"
              onClick={() => navigate('/dashboard/roll-calls')}
              className="text-sm text-slate-400 hover:text-slate-200"
            >
              ← All roll calls
            </button>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/25 rounded-lg p-4">
              <p className="text-red-300 text-sm">{error}</p>
            </div>
          )}

          {loading ? (
            <p className="text-sm text-slate-500">Loading list…</p>
          ) : !list ? (
            <p className="text-sm text-slate-500">List not found.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-semibold text-white">{list.title}</h1>
                  <p className="text-sm text-slate-400 mt-1">
                    {rollCallPercentComplete(list)}% complete
                    {' · '}
                    {list.doneCount}/{list.totalCount} done
                    {list.updatedByName ? ` · last updated by ${list.updatedByName}` : ''}
                    {list.archived ? ' · Archived' : ''}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={openEdit}
                    className="px-3 py-2 rounded-lg text-sm border border-[#1a2540] text-slate-200 hover:bg-[#060e1a]"
                  >
                    Edit list
                  </button>
                  <button
                    type="button"
                    onClick={handlePrint}
                    disabled={printing || (list.members || []).length === 0}
                    className="px-3 py-2 rounded-lg text-sm border border-[#1a2540] text-slate-200 hover:bg-[#060e1a] disabled:opacity-40"
                  >
                    {printing ? 'Preparing…' : 'Print'}
                  </button>
                </div>
              </div>

              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={untickedOnly}
                  onChange={(e) => setUntickedOnly(e.target.checked)}
                  className="w-4 h-4 rounded border-[#1a2540] bg-[#060e1a] text-indigo-500"
                />
                <span className="text-sm text-slate-300">Show only names not yet ticked</span>
              </label>

              <div className="rounded-xl border border-[#1a2540] bg-[#0b1220] divide-y divide-[#1a2540]">
                {visibleMembers.length === 0 ? (
                  <p className="px-5 py-8 text-sm text-slate-500 text-center">
                    {untickedOnly ? 'Everyone on this list has been ticked.' : 'No people on this list.'}
                  </p>
                ) : (
                  visibleMembers.map((member) => {
                    const busy = tickingUid === member.uid;
                    return (
                      <label
                        key={member.uid}
                        className={`flex items-start gap-3 px-5 py-3.5 cursor-pointer hover:bg-[#060e1a]/40 ${
                          member.ticked ? 'opacity-80' : ''
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={Boolean(member.ticked)}
                          disabled={busy}
                          onChange={(e) => handleTick(member, e.target.checked)}
                          className="mt-0.5 w-4 h-4 rounded border-[#1a2540] bg-[#060e1a] text-indigo-500"
                        />
                        <span className="min-w-0 flex-1">
                          <span className={`block text-sm ${member.ticked ? 'text-slate-400 line-through' : 'text-slate-100'}`}>
                            {member.fullName || member.email || member.uid}
                          </span>
                          {member.ticked && (
                            <span className="block text-xs text-slate-500 mt-0.5">
                              Ticked by {member.tickedByName || 'Unknown'}
                              {member.tickedAt ? ` · ${formatRollCallDateTime(member.tickedAt)}` : ''}
                            </span>
                          )}
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {editOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div
            className="w-full max-w-xl max-h-[90vh] overflow-auto rounded-xl border border-[#1a2540] bg-[#0b1220] shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-roll-call-title"
          >
            <form onSubmit={saveEdit}>
              <div className="px-6 py-5 border-b border-[#1a2540]">
                <h2 id="edit-roll-call-title" className="text-lg font-semibold text-white">
                  Edit roll call
                </h2>
                <p className="text-sm text-slate-400 mt-1">
                  Rename the list or change who is on it. Existing ticks are kept for people who remain.
                </p>
              </div>
              <div className="px-6 py-5 space-y-4">
                <div>
                  <label className="block text-[11px] font-medium uppercase tracking-wider text-slate-500 mb-1">
                    List name
                  </label>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    required
                    className="w-full bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-3 py-2"
                  />
                </div>
                <RollCallMemberPicker
                  employees={employees}
                  selectedUids={editUids}
                  onChange={setEditUids}
                  loading={employeesLoading}
                  disabled={savingEdit}
                />
              </div>
              <div className="px-6 py-4 border-t border-[#1a2540] flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditOpen(false)}
                  className="px-4 py-2 rounded-lg text-sm border border-[#1a2540] text-slate-200 hover:bg-[#060e1a]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit || !editTitle.trim() || editUids.length === 0}
                  className="px-5 py-2 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white"
                >
                  {savingEdit ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
