import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  fetchRollCallLists,
  formatRollCallDate,
  setRollCallListArchived,
} from '../utils/rollCallLists';

export default function RollCallLists() {
  const navigate = useNavigate();
  const [lists, setLists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  const load = async () => {
    const payload = await fetchRollCallLists();
    setLists(payload.lists || []);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError('');
        await load();
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load roll call lists.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const archivedCount = useMemo(
    () => lists.filter((list) => list.archived).length,
    [lists],
  );

  const visibleLists = useMemo(
    () => lists.filter((list) => (showArchived ? list.archived : !list.archived)),
    [lists, showArchived],
  );

  const handleArchiveToggle = async (list) => {
    const nextArchived = !list.archived;
    const label = nextArchived ? 'Archive' : 'Restore';
    if (nextArchived && !window.confirm(`${label} “${list.title}”?`)) return;
    setBusyId(list.id);
    setError('');
    try {
      const payload = await setRollCallListArchived(list.id, nextArchived);
      const updated = payload.list;
      setLists((current) => current.map((item) => (
        item.id === list.id
          ? { ...item, ...(updated || {}), archived: nextArchived }
          : item
      )));
    } catch (err) {
      setError(err.message || `Failed to ${label.toLowerCase()} list.`);
    } finally {
      setBusyId('');
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto px-4 sm:px-8 py-8 space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <button
                type="button"
                onClick={() => navigate('/dashboard/hr/employees')}
                className="text-sm text-slate-400 hover:text-slate-200"
              >
                ← Employees
              </button>
              <h1 className="text-2xl font-semibold text-white mt-3">
                {showArchived ? 'Archived roll calls' : 'Roll calls'}
              </h1>
              <p className="text-sm text-slate-400 mt-1">
                {showArchived
                  ? 'Hidden lists you can restore if needed.'
                  : 'Saved staff lists from the employee directory — distribute to staff or tick off as you go.'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowArchived((current) => !current)}
              className={`px-4 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                showArchived
                  ? 'border-indigo-500/40 bg-indigo-500/15 text-indigo-200'
                  : 'border-[#1a2540] text-slate-200 hover:bg-[#0b1220]'
              }`}
            >
              {showArchived ? 'Active lists' : `Archived${archivedCount ? ` (${archivedCount})` : ''}`}
            </button>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/25 rounded-lg p-4">
              <p className="text-red-300 text-sm">{error}</p>
            </div>
          )}

          {loading ? (
            <p className="text-sm text-slate-500">Loading lists…</p>
          ) : visibleLists.length === 0 ? (
            <div className="rounded-xl border border-[#1a2540] bg-[#0b1220] px-6 py-10 text-center">
              <p className="text-slate-300 text-sm">
                {showArchived ? 'No archived roll calls.' : 'No roll call lists yet.'}
              </p>
              {!showArchived && (
                <>
                  <p className="text-slate-500 text-sm mt-1">
                    Select people in the employee directory, then generate a roll call from there.
                  </p>
                  <button
                    type="button"
                    onClick={() => navigate('/dashboard/hr/employees')}
                    className="mt-5 px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white"
                  >
                    Go to employees
                  </button>
                </>
              )}
            </div>
          ) : (
            <ul className="space-y-3">
              {visibleLists.map((list) => {
                const total = Number(list.totalCount) || 0;
                const confirmed = Number(list.confirmedCount ?? list.doneCount) || 0;
                const rejected = Number(list.rejectedCount) || 0;
                const seen = Number(list.seenCount) || 0;
                const sent = Number(list.sentCount) || 0;

                const confirmedPercent = total ? Math.round((confirmed / total) * 100) : 0;
                const rejectedPercent = total ? Math.round((rejected / total) * 100) : 0;

                return (
                  <li
                    key={list.id}
                    className="rounded-xl border border-[#1a2540] bg-[#0b1220] px-5 py-4 flex flex-wrap items-center gap-4 justify-between hover:border-slate-700 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          to={`/dashboard/hr/roll-calls/${list.id}`}
                          className="text-base font-semibold text-white hover:text-indigo-200"
                        >
                          {list.title}
                        </Link>
                        {list.distributed ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            Distributed
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-800 text-slate-400 border border-slate-700">
                            Draft
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-slate-400 mt-1">
                        <span className="text-emerald-400 font-medium">{confirmed} confirmed</span>
                        {' · '}
                        <span className="text-rose-400 font-medium">{rejected} rejected</span>
                        {' · '}
                        <span className="text-sky-400 font-medium">{seen} seen</span>
                        {' · '}
                        <span className="text-slate-400">{sent} pending</span>
                        {' · '}
                        <span className="text-slate-400">{total} total</span>
                        {list.updatedAt ? ` · Updated ${formatRollCallDate(list.updatedAt)}` : ''}
                        {list.createdByName ? ` · by ${list.createdByName}` : ''}
                      </p>

                      {/* Multi-color progress bar */}
                      <div className="mt-2.5 h-2 max-w-sm rounded-full bg-[#060e1a] overflow-hidden flex">
                        <div
                          className="h-full bg-emerald-500 transition-all"
                          style={{ width: `${confirmedPercent}%` }}
                          title={`${confirmed} confirmed`}
                        />
                        <div
                          className="h-full bg-rose-500 transition-all"
                          style={{ width: `${rejectedPercent}%` }}
                          title={`${rejected} rejected`}
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => navigate(`/dashboard/hr/roll-calls/${list.id}`)}
                        className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
                      >
                        View status
                      </button>
                      <button
                        type="button"
                        onClick={() => handleArchiveToggle(list)}
                        disabled={busyId === list.id}
                        className={`px-3 py-2 rounded-lg text-xs border disabled:opacity-40 transition-colors ${
                          list.archived
                            ? 'border-indigo-500/30 text-indigo-200 hover:bg-indigo-500/10'
                            : 'border-slate-500/30 text-slate-300 hover:bg-[#060e1a]'
                        }`}
                      >
                        {busyId === list.id
                          ? (list.archived ? 'Restoring…' : 'Archiving…')
                          : (list.archived ? 'Restore' : 'Archive')}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
