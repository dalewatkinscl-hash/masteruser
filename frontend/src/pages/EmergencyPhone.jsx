import { useEffect, useMemo, useState } from 'react';
import WorkspaceTabs from '../components/WorkspaceTabs';

const DEFAULT_PHONE = '07734560791';
const DEFAULT_TEL = 'tel:+447734560791';
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const SHIFT_COLORS = [
  'bg-indigo-500/80',
  'bg-emerald-500/80',
  'bg-amber-500/80',
  'bg-sky-500/80',
  'bg-rose-500/80',
  'bg-violet-500/80',
  'bg-teal-500/80',
  'bg-orange-500/80',
];

async function readJsonResponse(res) {
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function weeksLabel(person) {
  if (person.onCoverNow) return 'On call now';
  if (person.weeksSinceLast === null || person.weeksSinceLast === undefined) return 'Never assigned';
  if (person.weeksSinceLast === 0) return 'Less than a week';
  if (person.weeksSinceLast === 1) return '1 week ago';
  return `${person.weeksSinceLast} weeks ago`;
}

function colorForUid(uid, map) {
  if (!map.has(uid)) {
    map.set(uid, SHIFT_COLORS[map.size % SHIFT_COLORS.length]);
  }
  return map.get(uid);
}

function shiftsForDay(shifts, dateKey) {
  return (shifts || []).filter(
    (shift) => shift.startDate <= dateKey && shift.endDate >= dateKey,
  );
}

function buildCalendarDays(viewDate) {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const first = new Date(year, month, 1);
  const startOffset = (first.getDay() + 6) % 7; // Monday-first
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];

  for (let i = 0; i < startOffset; i += 1) {
    cells.push({ key: `empty-${i}`, empty: true });
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, month, day);
    cells.push({
      key: toDateKey(date),
      day,
      dateKey: toDateKey(date),
      empty: false,
    });
  }
  return cells;
}

export default function EmergencyPhone() {
  const todayKey = toDateKey(new Date());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [current, setCurrent] = useState(null);
  const [phoneNumber, setPhoneNumber] = useState(DEFAULT_PHONE);
  const [phoneTel, setPhoneTel] = useState(DEFAULT_TEL);
  const [shifts, setShifts] = useState([]);
  const [coverPeople, setCoverPeople] = useState([]);
  const [viewDate, setViewDate] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [form, setForm] = useState({
    uid: '',
    startDate: todayKey,
    endDate: todayKey,
  });

  const colorMap = useMemo(() => {
    const map = new Map();
    shifts.forEach((shift) => colorForUid(shift.uid, map));
    return map;
  }, [shifts]);

  const calendarDays = useMemo(() => buildCalendarDays(viewDate), [viewDate]);

  const monthShifts = useMemo(() => {
    const monthStart = toDateKey(new Date(viewDate.getFullYear(), viewDate.getMonth(), 1));
    const monthEnd = toDateKey(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0));
    return shifts.filter((shift) => shift.startDate <= monthEnd && shift.endDate >= monthStart);
  }, [shifts, viewDate]);

  const load = async () => {
    const response = await fetch('/api/getEmergencyPhone', { credentials: 'include' });
    const payload = (await readJsonResponse(response)) || {};
    if (!response.ok) throw new Error(payload.error || 'Failed to load emergency phone.');
    setCanManage(Boolean(payload.canManage));
    setCurrent(payload.current || null);
    setPhoneNumber(payload.phoneNumber || DEFAULT_PHONE);
    setPhoneTel(payload.phoneTel || DEFAULT_TEL);
    setShifts(payload.shifts || []);
    setCoverPeople(payload.coverPeople || []);
    setForm((prev) => {
      if (prev.uid || !payload.coverPeople?.length) return prev;
      const preferred = payload.coverPeople.find((p) => !p.onCoverNow) || payload.coverPeople[0];
      return { ...prev, uid: preferred.uid };
    });
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError('');
        await load();
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load emergency phone.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const changeMonth = (delta) => {
    setViewDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  };

  const onDayClick = (dateKey) => {
    if (!canManage) return;
    setForm((prev) => ({
      ...prev,
      startDate: dateKey,
      endDate: prev.endDate && prev.endDate >= dateKey ? prev.endDate : dateKey,
    }));
  };

  const createShift = async (event) => {
    event.preventDefault();
    if (!form.uid || !form.startDate || !form.endDate) return;
    setSaving(true);
    setMessage('');
    setError('');
    try {
      const response = await fetch('/api/createEmergencyPhoneShift', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const payload = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(payload.error || 'Failed to create shift.');
      setMessage(
        `Added ${payload.shift?.fullName || 'person'} from ${payload.shift?.startLabel} to ${payload.shift?.endLabel}.`,
      );
      await load();
    } catch (err) {
      setError(err.message || 'Failed to create shift.');
    } finally {
      setSaving(false);
    }
  };

  const deleteShift = async (id, label) => {
    if (!window.confirm(`Remove call shift${label ? ` for ${label}` : ''}?`)) return;
    setSaving(true);
    setMessage('');
    setError('');
    try {
      const response = await fetch('/api/deleteEmergencyPhoneShift', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const payload = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(payload.error || 'Failed to delete shift.');
      setMessage('Shift removed.');
      await load();
    } catch (err) {
      setError(err.message || 'Failed to delete shift.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-full">
      <WorkspaceTabs />
      <div className="px-4 sm:px-8 py-6 max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-white tracking-tight">Emergency phone</h1>
          <p className="mt-1 text-sm text-slate-400">
            {canManage
              ? 'Plan call shifts on the calendar, from one day up to a full year.'
              : 'Who is on the emergency phone right now.'}
          </p>
        </div>

        {loading ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : (
          <>
            {error && (
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                {error}
              </div>
            )}
            {message && (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                {message}
              </div>
            )}

            <section className="rounded-2xl border border-[#1a2540] bg-[#0a1220]/80 p-6 sm:p-8">
              <p className="text-xs uppercase tracking-[0.2em] text-indigo-300/80">On call now</p>
              <p className="mt-4 text-3xl sm:text-4xl font-semibold text-white">
                {current?.fullName || 'Not assigned'}
              </p>
              {current && (
                <p className="mt-2 text-sm text-slate-400">
                  {current.startLabel} – {current.endLabel}
                </p>
              )}
              {!current && (
                <p className="mt-2 text-sm text-slate-500">
                  No one is covering the emergency phone today.
                </p>
              )}

              <a
                href={phoneTel}
                className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-base font-semibold text-white hover:bg-emerald-500 active:bg-emerald-700"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path
                    d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1.1-.3 1.2.4 2.5.6 3.8.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.6.6 3.8.1.4 0 .8-.3 1.1L6.6 10.8Z"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinejoin="round"
                  />
                </svg>
                Call {phoneNumber}
              </a>
            </section>

            {canManage && (
              <>
                <section className="rounded-2xl border border-[#1a2540] bg-[#0a1220]/80 p-5 sm:p-6 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-lg font-medium text-white">
                      {MONTH_NAMES[viewDate.getMonth()]} {viewDate.getFullYear()}
                    </h2>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => changeMonth(-1)}
                        className="rounded-lg border border-[#1a2540] px-3 py-1.5 text-sm text-slate-200 hover:bg-[#121a2c]"
                      >
                        Prev
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}
                        className="rounded-lg border border-[#1a2540] px-3 py-1.5 text-sm text-slate-200 hover:bg-[#121a2c]"
                      >
                        Today
                      </button>
                      <button
                        type="button"
                        onClick={() => changeMonth(1)}
                        className="rounded-lg border border-[#1a2540] px-3 py-1.5 text-sm text-slate-200 hover:bg-[#121a2c]"
                      >
                        Next
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-7 gap-1 text-center text-xs text-slate-500 mb-1">
                    {WEEKDAYS.map((day) => (
                      <div key={day} className="py-1 font-medium">{day}</div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-1">
                    {calendarDays.map((cell) => {
                      if (cell.empty) {
                        return <div key={cell.key} className="min-h-[72px] rounded-lg bg-transparent" />;
                      }
                      const dayShifts = shiftsForDay(shifts, cell.dateKey);
                      const isToday = cell.dateKey === todayKey;
                      const isSelected = cell.dateKey === form.startDate || cell.dateKey === form.endDate;
                      return (
                        <button
                          key={cell.key}
                          type="button"
                          onClick={() => onDayClick(cell.dateKey)}
                          className={`min-h-[72px] rounded-lg border p-1.5 text-left transition-colors ${
                            isSelected
                              ? 'border-indigo-400 bg-indigo-500/10'
                              : isToday
                                ? 'border-indigo-500/50 bg-[#121a2c]'
                                : 'border-[#1a2540] bg-[#060e1a]/60 hover:border-slate-600'
                          }`}
                        >
                          <div className={`text-xs font-medium ${isToday ? 'text-indigo-300' : 'text-slate-400'}`}>
                            {cell.day}
                          </div>
                          <div className="mt-1 space-y-0.5">
                            {dayShifts.slice(0, 2).map((shift) => (
                              <div
                                key={shift.id}
                                className={`truncate rounded px-1 py-0.5 text-[10px] leading-tight text-white ${colorForUid(shift.uid, colorMap)}`}
                                title={shift.fullName}
                              >
                                {shift.fullName.split(' ')[0]}
                              </div>
                            ))}
                            {dayShifts.length > 2 && (
                              <div className="text-[10px] text-slate-500">+{dayShifts.length - 2}</div>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-slate-500">
                    Click a day to set the shift start date. Adjust end date below if needed.
                  </p>
                </section>

                <section className="rounded-2xl border border-[#1a2540] bg-[#0a1220]/80 p-5 sm:p-6 space-y-4">
                  <div>
                    <h2 className="text-lg font-medium text-white">Add call shift</h2>
                    <p className="text-sm text-slate-400 mt-1">
                      Choose a person and a start/end date — one day or a whole year.
                    </p>
                  </div>
                  <form onSubmit={createShift} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
                    <label className="block text-sm sm:col-span-2 lg:col-span-1">
                      <span className="text-slate-400">Person</span>
                      <select
                        className="mt-1 w-full rounded-lg border border-[#1a2540] bg-[#060e1a] px-3 py-2 text-white"
                        value={form.uid}
                        onChange={(e) => setForm((prev) => ({ ...prev, uid: e.target.value }))}
                        required
                      >
                        <option value="">Select…</option>
                        {coverPeople.map((person) => (
                          <option key={person.uid} value={person.uid}>
                            {person.fullName}
                            {person.onCoverNow ? ' (on call now)' : ''}
                            {!person.onCoverNow && person.weeksSinceLast !== null
                              ? ` · ${person.weeksSinceLast}w since last`
                              : !person.onCoverNow
                                ? ' · never'
                                : ''}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-sm">
                      <span className="text-slate-400">Start date</span>
                      <input
                        type="date"
                        className="mt-1 w-full rounded-lg border border-[#1a2540] bg-[#060e1a] px-3 py-2 text-white [color-scheme:dark]"
                        value={form.startDate}
                        onChange={(e) => setForm((prev) => ({
                          ...prev,
                          startDate: e.target.value,
                          endDate: prev.endDate < e.target.value ? e.target.value : prev.endDate,
                        }))}
                        required
                      />
                    </label>
                    <label className="block text-sm">
                      <span className="text-slate-400">End date</span>
                      <input
                        type="date"
                        className="mt-1 w-full rounded-lg border border-[#1a2540] bg-[#060e1a] px-3 py-2 text-white [color-scheme:dark]"
                        value={form.endDate}
                        min={form.startDate}
                        onChange={(e) => setForm((prev) => ({ ...prev, endDate: e.target.value }))}
                        required
                      />
                    </label>
                    <button
                      type="submit"
                      disabled={saving || !form.uid}
                      className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                    >
                      {saving ? 'Saving…' : 'Add shift'}
                    </button>
                  </form>
                  {!coverPeople.length && (
                    <p className="text-sm text-amber-200/90">
                      No employees are flagged for emergency phone cover yet. Turn on
                      {' '}
                      <strong>Emergency phone cover</strong>
                      {' '}
                      on their employee record first.
                    </p>
                  )}
                </section>

                <section className="rounded-2xl border border-[#1a2540] bg-[#0a1220]/80 p-5 sm:p-6">
                  <h2 className="text-lg font-medium text-white">Shifts this month</h2>
                  {monthShifts.length === 0 ? (
                    <p className="mt-3 text-sm text-slate-500">No shifts overlap this month.</p>
                  ) : (
                    <ul className="mt-3 divide-y divide-[#1a2540]">
                      {monthShifts.map((shift) => (
                        <li key={shift.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <span className={`h-2.5 w-2.5 rounded-full ${colorForUid(shift.uid, colorMap)}`} />
                            <div className="min-w-0">
                              <p className="text-white font-medium truncate">{shift.fullName}</p>
                              <p className="text-sm text-slate-400">
                                {shift.startLabel} – {shift.endLabel}
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            className="text-xs text-rose-300 hover:text-rose-200"
                            onClick={() => deleteShift(shift.id, shift.fullName)}
                            disabled={saving}
                          >
                            Remove
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section className="rounded-2xl border border-[#1a2540] bg-[#0a1220]/80 p-5 sm:p-6">
                  <h2 className="text-lg font-medium text-white">Cover pool</h2>
                  <p className="text-sm text-slate-400 mt-1 mb-4">
                    People who can cover, sorted by longest time since last call shift.
                  </p>
                  {coverPeople.length === 0 ? (
                    <p className="text-sm text-slate-500">No cover people configured.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left">
                        <thead>
                          <tr className="text-slate-500 border-b border-[#1a2540]">
                            <th className="py-2 pr-3 font-medium">Name</th>
                            <th className="py-2 pr-3 font-medium">Role</th>
                            <th className="py-2 pr-3 font-medium">Since last cover</th>
                            <th className="py-2 font-medium">Last ended</th>
                          </tr>
                        </thead>
                        <tbody>
                          {coverPeople.map((person) => (
                            <tr key={person.uid} className="border-b border-[#1a2540]/60">
                              <td className="py-2.5 pr-3 text-white">{person.fullName}</td>
                              <td className="py-2.5 pr-3 text-slate-400">{person.jobRole || '—'}</td>
                              <td className="py-2.5 pr-3 text-slate-300">{weeksLabel(person)}</td>
                              <td className="py-2.5 text-slate-400">{person.lastEndLabel || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
