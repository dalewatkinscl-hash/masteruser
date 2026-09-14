import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  fetchRollCallLists,
  formatRollCallDate,
  rollCallPercentComplete,
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
                  : 'Saved staff lists from the employee directory — tick off as you go.'}
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
                const percent = rollCallPercentComplete(list);
                return (
                  <li
                    key={list.id}
                    className="rounded-xl border border-[#1a2540] bg-[#0b1220] px-5 py-4 flex flex-wrap items-center gap-4 justify-between"
                  >
                    <div className="min-w-0 flex-1">
                      <Link
                        to={`/dashboard/hr/roll-calls/${list.id}`}
                        className="text-base font-medium text-white hover:text-indigo-200"
                      >
                        {list.title}
                      </Link>
                      <p className="text-sm text-slate-500 mt-1">
                        {percent}% complete
                        {' · '}
                        {list.doneCount}/{list.totalCount} done
                        {list.updatedAt ? ` · Updated ${formatRollCallDate(list.updatedAt)}` : ''}
                        {list.createdByName ? ` · by ${list.createdByName}` : ''}
                      </p>
                      <div className="mt-2 h-1.5 max-w-xs rounded-full bg-[#060e1a] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-indigo-500 transition-all"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => navigate(`/dashboard/hr/roll-calls/${list.id}`)}
                        className="px-3 py-2 rounded-lg text-sm border border-[#1a2540] text-slate-200 hover:bg-[#060e1a]"
                      >
                        Open
                      </button>
                      <button
                        type="button"
                        onClick={() => handleArchiveToggle(list)}
                        disabled={busyId === list.id}
                        className={`px-3 py-2 rounded-lg text-sm border disabled:opacity-40 ${
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
