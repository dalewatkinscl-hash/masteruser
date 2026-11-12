import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  APPRAISAL_CYCLE_MONTHS,
  APPRAISAL_RATINGS,
  DUE_SOON_DAYS,
  addAppraisalMonths,
  appraisalDueLabel,
  appraisalRatingLabel,
  appraisalStatusLabel,
  deleteAppraisal,
  fetchAppraisals,
  fetchEmployeeAppraisals,
  formatAppraisalDate,
  saveAppraisal,
} from '../utils/appraisals';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'due_soon', label: 'Due soon' },
  { id: 'current', label: 'Up to date' },
  { id: 'missing', label: 'No dates' },
];

const STATUS_STYLES = {
  overdue: 'bg-red-500/15 text-red-200 border-red-500/30',
  due_soon: 'bg-amber-500/15 text-amber-100 border-amber-500/30',
  current: 'bg-emerald-500/15 text-emerald-100 border-emerald-500/30',
  missing: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
};

function todayIso() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const read = (type) => parts.find((part) => part.type === type)?.value || '';
  return `${read('year')}-${read('month')}-${read('day')}`;
}

function emptyForm(reviewerName) {
  const appraisalDate = todayIso();
  return {
    id: '',
    appraisalDate,
    reviewerName: reviewerName || '',
    rating: 'good',
    summary: '',
    objectives: '',
    nextDueDate: addAppraisalMonths(appraisalDate),
  };
}

function StatusBadge({ row }) {
  const status = row?.status || 'missing';
  return (
    <span className={`inline-flex max-w-full items-center rounded-full border px-2.5 py-1 text-xs font-medium whitespace-normal ${STATUS_STYLES[status] || STATUS_STYLES.missing}`}>
      {appraisalStatusLabel(row)}
    </span>
  );
}

function CloseIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export default function Appraisals() {
  const { user } = useAuth();
  const reviewerDefault = user?.fullName || user?.email || '';
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [selectedUid, setSelectedUid] = useState('');
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [panelError, setPanelError] = useState('');
  const [form, setForm] = useState(() => emptyForm(''));
  const [nextDueTouched, setNextDueTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState('');

  const load = async () => {
    const payload = await fetchAppraisals();
    setEmployees(payload.employees || []);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError('');
        await load();
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load appraisals.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const population = useMemo(
    () => employees.filter((employee) => includeInactive || employee.isActive),
    [employees, includeInactive],
  );

  const counts = useMemo(() => {
    const next = { all: population.length, overdue: 0, due_soon: 0, current: 0, missing: 0 };
    population.forEach((employee) => {
      if (next[employee.status] !== undefined) next[employee.status] += 1;
    });
    return next;
  }, [population]);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return population.filter((employee) => {
      if (filter !== 'all' && employee.status !== filter) return false;
      if (!query) return true;
      const haystack = [
        employee.fullName,
        employee.email,
        employee.department,
        employee.jobRole,
        employee.managerName,
      ].join(' ').toLowerCase();
      return haystack.includes(query);
    });
  }, [population, filter, search]);

  const selected = employees.find((employee) => employee.uid === selectedUid) || null;

  const openEmployee = (employee) => {
    setSelectedUid(employee.uid);
    setPanelError('');
    setHistory([]);
    setNextDueTouched(false);
    setForm(emptyForm(reviewerDefault));
  };

  const closePanel = () => {
    setSelectedUid('');
    setPanelError('');
    setHistory([]);
  };

  useEffect(() => {
    if (!selectedUid) return undefined;
    let cancelled = false;
    (async () => {
      try {
        setHistoryLoading(true);
        setPanelError('');
        const payload = await fetchEmployeeAppraisals(selectedUid);
        if (!cancelled) setHistory(payload.appraisals || []);
      } catch (err) {
        if (!cancelled) setPanelError(err.message || 'Failed to load appraisal history.');
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedUid]);

  useEffect(() => {
    if (!selectedUid) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') closePanel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedUid]);

  const updateForm = (key, value) => {
    setForm((current) => {
      const next = { ...current, [key]: value };
      if (key === 'appraisalDate' && !nextDueTouched) {
        next.nextDueDate = addAppraisalMonths(value);
      }
      return next;
    });
    if (key === 'nextDueDate') setNextDueTouched(true);
  };

  const startEdit = (appraisal) => {
    setNextDueTouched(true);
    setForm({
      id: appraisal.id,
      appraisalDate: appraisal.appraisalDate || '',
      reviewerName: appraisal.reviewerName || reviewerDefault,
      rating: appraisal.rating || 'good',
      summary: appraisal.summary || '',
      objectives: appraisal.objectives || '',
      nextDueDate: appraisal.nextDueDate || addAppraisalMonths(appraisal.appraisalDate),
    });
    setPanelError('');
  };

  const resetForm = () => {
    setNextDueTouched(false);
    setForm(emptyForm(reviewerDefault));
    setPanelError('');
  };

  const handleSave = async (event) => {
    event.preventDefault();
    if (!selected) return;
    setSaving(true);
    setPanelError('');
    try {
      await saveAppraisal({
        id: form.id || undefined,
        employeeUid: selected.uid,
        appraisalDate: form.appraisalDate,
        reviewerName: form.reviewerName,
        rating: form.rating,
        summary: form.summary,
        objectives: form.objectives,
        nextDueDate: form.nextDueDate,
      });
      await load();
      const payload = await fetchEmployeeAppraisals(selected.uid);
      setHistory(payload.appraisals || []);
      resetForm();
    } catch (err) {
      setPanelError(err.message || 'Failed to save appraisal.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (appraisal) => {
    const when = formatAppraisalDate(appraisal.appraisalDate);
    if (!window.confirm(`Delete the appraisal from ${when}?`)) return;
    setDeletingId(appraisal.id);
    setPanelError('');
    try {
      await deleteAppraisal(appraisal.id);
      if (form.id === appraisal.id) resetForm();
      await load();
      const payload = await fetchEmployeeAppraisals(selected.uid);
      setHistory(payload.appraisals || []);
    } catch (err) {
      setPanelError(err.message || 'Failed to delete appraisal.');
    } finally {
      setDeletingId('');
    }
  };

  return (
    <div className="flex flex-col min-w-0 w-full">
      <div className="px-4 sm:px-8 py-6 border-b border-[#1a2540]">
        <h1 className="text-2xl font-bold text-white">Appraisals</h1>
        <p className="text-sm text-slate-400 mt-1 max-w-3xl">
          Annual reviews are due {APPRAISAL_CYCLE_MONTHS} months after the last appraisal.
          People with no appraisal on file are due {APPRAISAL_CYCLE_MONTHS} months after their start date.
          Due soon means the next {DUE_SOON_DAYS} days.
        </p>
      </div>

      <div className="min-w-0">
        <div className="px-4 sm:px-8 py-6 space-y-5 min-w-0">
          {error && (
            <div className="bg-red-500/10 border border-red-500/25 rounded-lg p-4">
              <p className="text-red-300 text-sm">{error}</p>
            </div>
          )}

          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {FILTERS.map((item) => {
              const active = filter === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setFilter(item.id)}
                  className={`rounded-xl border px-4 py-3 text-left transition-colors ${
                    active
                      ? 'border-indigo-500/50 bg-indigo-500/10'
                      : 'border-[#1a2540] bg-[#0b1220] hover:border-indigo-500/30'
                  }`}
                >
                  <p className="text-2xl font-semibold text-white">{counts[item.id] || 0}</p>
                  <p className="text-xs text-slate-400 mt-1">{item.label}</p>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name, department, role, manager…"
              className="w-full sm:w-80 min-h-11 bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-4 py-2.5 focus:outline-none focus:border-indigo-500/60"
            />
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={includeInactive}
                onChange={(event) => setIncludeInactive(event.target.checked)}
                className="rounded border-[#1a2540]"
              />
              Include inactive
            </label>
            <p className="text-sm text-slate-500 ml-auto">
              {loading ? 'Loading…' : `${visible.length} shown`}
            </p>
          </div>

          {loading ? (
            <p className="text-sm text-slate-500">Loading appraisals…</p>
          ) : visible.length === 0 ? (
            <div className="rounded-xl border border-[#1a2540] bg-[#0b1220] px-6 py-10 text-center">
              <p className="text-slate-300 text-sm">No employees match this view.</p>
            </div>
          ) : (
            <div className="w-full min-w-0 max-w-full overflow-x-auto rounded-xl border border-[#1a2540]">
              <table className="w-full min-w-[680px] text-sm">
                <thead className="bg-[#0b1220] text-left text-xs font-semibold uppercase tracking-widest text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Employee</th>
                    <th className="px-4 py-3">Department</th>
                    <th className="px-4 py-3">Last appraisal</th>
                    <th className="px-4 py-3">Next due</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((employee) => (
                    <tr
                      key={employee.uid}
                      className="border-t border-[#1a2540] hover:bg-[#0b1220]/80 cursor-pointer"
                      onClick={() => openEmployee(employee)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          openEmployee(employee);
                        }
                      }}
                      tabIndex={0}
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-white">
                          {employee.fullName || employee.email || 'Unnamed employee'}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {[employee.jobRole, employee.managerName ? `Manager ${employee.managerName}` : '']
                            .filter(Boolean)
                            .join(' · ') || employee.email || '—'}
                          {!employee.isActive ? ' · Inactive' : ''}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-slate-300">{employee.department || '—'}</td>
                      <td className="px-4 py-3 text-slate-300">
                        {employee.lastAppraisalDate ? formatAppraisalDate(employee.lastAppraisalDate) : '—'}
                        {employee.latestRating ? (
                          <span className="block text-xs text-slate-500 mt-0.5">
                            {appraisalRatingLabel(employee.latestRating)}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-slate-300 break-words">{appraisalDueLabel(employee)}</td>
                      <td className="px-4 py-3">
                        <StatusBadge row={employee} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {selected && (
        <div className="fixed inset-0 z-[80] flex justify-end">
          <button
            type="button"
            className="absolute inset-0 bg-black/60"
            aria-label="Close appraisals"
            onClick={closePanel}
          />
          <aside className="relative h-full w-full max-w-xl bg-[#0b1220] border-l border-[#1a2540] shadow-2xl flex flex-col">
            <div className="px-5 py-4 border-b border-[#1a2540] flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-white">
                  {selected.fullName || selected.email || 'Employee'}
                </h2>
                <p className="text-sm text-slate-400 mt-1">
                  {[selected.jobRole, selected.department].filter(Boolean).join(' · ') || 'No role recorded'}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <StatusBadge row={selected} />
                  <Link
                    to={`/dashboard/hr/employees/${selected.uid}`}
                    className="text-xs text-indigo-300 hover:text-indigo-200"
                  >
                    Open employee
                  </Link>
                </div>
              </div>
              <button
                type="button"
                onClick={closePanel}
                className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-[#1a2540]"
                aria-label="Close"
              >
                <CloseIcon />
              </button>
            </div>

            <div className="flex-1 overflow-auto px-5 py-4 space-y-6">
              {panelError && (
                <div className="bg-red-500/10 border border-red-500/25 rounded-lg p-3">
                  <p className="text-red-300 text-sm">{panelError}</p>
                </div>
              )}

              <form onSubmit={handleSave} className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-white">
                    {form.id ? 'Edit appraisal' : 'Record appraisal'}
                  </h3>
                  {form.id ? (
                    <button
                      type="button"
                      onClick={resetForm}
                      className="text-xs text-slate-400 hover:text-slate-200"
                    >
                      Cancel edit
                    </button>
                  ) : null}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="block text-xs text-slate-400">
                    Appraisal date
                    <input
                      type="date"
                      required
                      value={form.appraisalDate}
                      onChange={(event) => updateForm('appraisalDate', event.target.value)}
                      className="mt-1 w-full bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-3 py-2"
                    />
                  </label>
                  <label className="block text-xs text-slate-400">
                    Next due
                    <input
                      type="date"
                      required
                      value={form.nextDueDate}
                      onChange={(event) => updateForm('nextDueDate', event.target.value)}
                      className="mt-1 w-full bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-3 py-2"
                    />
                  </label>
                </div>
                <label className="block text-xs text-slate-400">
                  Reviewer
                  <input
                    type="text"
                    required
                    value={form.reviewerName}
                    onChange={(event) => updateForm('reviewerName', event.target.value)}
                    className="mt-1 w-full bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-3 py-2"
                  />
                </label>
                <label className="block text-xs text-slate-400">
                  Rating
                  <select
                    value={form.rating}
                    onChange={(event) => updateForm('rating', event.target.value)}
                    className="mt-1 w-full bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-3 py-2"
                  >
                    {APPRAISAL_RATINGS.map((rating) => (
                      <option key={rating.id} value={rating.id}>{rating.label}</option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs text-slate-400">
                  Summary
                  <textarea
                    value={form.summary}
                    onChange={(event) => updateForm('summary', event.target.value)}
                    rows={4}
                    className="mt-1 w-full bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-3 py-2"
                    placeholder="What was discussed and agreed"
                  />
                </label>
                <label className="block text-xs text-slate-400">
                  Objectives for next time
                  <textarea
                    value={form.objectives}
                    onChange={(event) => updateForm('objectives', event.target.value)}
                    rows={3}
                    className="mt-1 w-full bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-3 py-2"
                  />
                </label>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2.5 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50"
                >
                  {saving ? 'Saving…' : form.id ? 'Save changes' : 'Record appraisal'}
                </button>
              </form>

              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-white">History</h3>
                {selected.appraisalCount === 0 && selected.lastAppraisalDate ? (
                  <p className="text-sm text-slate-400">
                    The employee record has a last appraisal date of {formatAppraisalDate(selected.lastAppraisalDate)}, with no write-up stored yet.
                  </p>
                ) : null}
                {historyLoading ? (
                  <p className="text-sm text-slate-500">Loading history…</p>
                ) : history.length === 0 ? (
                  <p className="text-sm text-slate-500">No appraisals recorded yet.</p>
                ) : (
                  <ul className="space-y-3">
                    {history.map((appraisal) => (
                      <li key={appraisal.id} className="rounded-xl border border-[#1a2540] bg-[#060e1a] px-4 py-3 space-y-2">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-medium text-white">
                              {formatAppraisalDate(appraisal.appraisalDate)}
                              {appraisal.rating ? ` · ${appraisalRatingLabel(appraisal.rating)}` : ''}
                            </p>
                            <p className="text-xs text-slate-500 mt-0.5">
                              {appraisal.reviewerName || 'Reviewer not recorded'}
                              {appraisal.nextDueDate ? ` · Next due ${formatAppraisalDate(appraisal.nextDueDate)}` : ''}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => startEdit(appraisal)}
                              className="text-xs text-slate-300 hover:text-white"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(appraisal)}
                              disabled={deletingId === appraisal.id}
                              className="text-xs text-red-300 hover:text-red-200 disabled:opacity-40"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                        {appraisal.summary ? (
                          <p className="text-sm text-slate-300 whitespace-pre-wrap">{appraisal.summary}</p>
                        ) : null}
                        {appraisal.objectives ? (
                          <p className="text-sm text-slate-400 whitespace-pre-wrap">
                            <span className="text-slate-500">Objectives: </span>
                            {appraisal.objectives}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
