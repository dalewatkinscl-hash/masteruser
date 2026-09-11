import { useEffect, useMemo, useState, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import WorkspaceTabs from '../components/WorkspaceTabs';
import { readJsonResponse } from '../utils/employeeProfile';
import { OUTCOME_PRESETS } from '../utils/peopleCasesAccess';

function formatUkDate(value) {
  const text = String(value || '').slice(0, 10);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return text || '—';
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function SortHeader({ label, active, direction, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-widest text-slate-400 hover:text-slate-200"
    >
      {label}
      {active && (
        <span className="text-indigo-300">{direction === 'asc' ? '↑' : '↓'}</span>
      )}
    </button>
  );
}

function ChevronIcon({ open }) {
  return (
    <svg
      className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-90' : ''}`}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="m9 6 6 6-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function ActiveDisciplinaryMeasures() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [onlyWithActive, setOnlyWithActive] = useState(false);
  const [sortKey, setSortKey] = useState('employeeName');
  const [sortDir, setSortDir] = useState('asc');
  const [expandedUids, setExpandedUids] = useState(() => new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const response = await fetch('/api/getActiveDisciplinaryMeasures', { credentials: 'include' });
        const data = (await readJsonResponse(response)) || {};
        if (!response.ok) throw new Error(data.error || 'Failed to load active disciplinary measures.');
        if (!cancelled) setRows(Array.isArray(data.rows) ? data.rows : []);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load active disciplinary measures.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const tableRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const filtered = [];

    for (const row of rows) {
      const name = row.employeeName || '';
      const department = row.department || '';
      const email = row.employeeEmail || '';
      const measures = (row.measures || []).filter((item) => (
        typeFilter === 'all' || item.outcomePreset === typeFilter
      ));

      if (needle) {
        const haystack = `${name} ${department} ${email}`.toLowerCase();
        const measureHay = measures
          .map((item) => `${item.measureType} ${item.reason} ${item.title}`)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(needle) && !measureHay.includes(needle)) continue;
      }

      if (onlyWithActive && measures.length === 0) continue;
      if (typeFilter !== 'all' && measures.length === 0) continue;

      filtered.push({
        employeeUid: row.employeeUid,
        employeeName: name,
        department,
        measures,
        measureCount: measures.length,
        latestGivenAt: measures[0]?.givenAt || '',
        latestExpiresAt: measures[0]?.expiresAt || '',
      });
    }

    const dir = sortDir === 'asc' ? 1 : -1;
    filtered.sort((left, right) => {
      let leftVal = '';
      let rightVal = '';
      if (sortKey === 'measureCount') {
        leftVal = left.measureCount;
        rightVal = right.measureCount;
        if (leftVal < rightVal) return -1 * dir;
        if (leftVal > rightVal) return 1 * dir;
        return String(left.employeeName || '').localeCompare(String(right.employeeName || ''));
      }
      if (sortKey === 'givenAt') {
        leftVal = left.latestGivenAt || '';
        rightVal = right.latestGivenAt || '';
      } else if (sortKey === 'expiresAt') {
        leftVal = left.latestExpiresAt || '';
        rightVal = right.latestExpiresAt || '';
      } else {
        leftVal = String(left.employeeName || '').toLowerCase();
        rightVal = String(right.employeeName || '').toLowerCase();
      }
      if (leftVal < rightVal) return -1 * dir;
      if (leftVal > rightVal) return 1 * dir;
      return String(left.employeeName || '').localeCompare(String(right.employeeName || ''));
    });

    return filtered;
  }, [rows, search, typeFilter, onlyWithActive, sortKey, sortDir]);

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDir(key === 'employeeName' ? 'asc' : 'desc');
  };

  const toggleExpanded = (uid) => {
    setExpandedUids((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  const typeOptions = [
    ...OUTCOME_PRESETS.filter((item) => (
      ['informal_action', 'file_note_for_improvement', 'written_warning', 'final_written_warning', 'pip'].includes(item.id)
    )),
    { id: 'restriction', label: 'Restriction' },
  ];

  return (
    <div className="flex flex-col h-full">
      <WorkspaceTabs />
      <div className="flex items-center justify-between px-8 py-5 border-b border-[#1a2540] gap-3 flex-wrap">
        <div>
          <button
            type="button"
            onClick={() => navigate('/dashboard/employees')}
            className="text-xs text-slate-500 hover:text-slate-300 mb-1"
          >
            ← Employees
          </button>
          <h1 className="text-xl font-semibold text-white">Active disciplinary measures</h1>
          <p className="text-sm text-slate-400 mt-1">
            Live informal resolutions and file notes (6 months), warnings, and PIPs. Expired records are removed automatically.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search employees or measures…"
            className="w-full sm:w-64 bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-4 py-2.5 focus:outline-none focus:border-indigo-500/60"
          />
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-3 py-2.5"
          >
            <option value="all">All measure types</option>
            {typeOptions.map((item) => (
              <option key={item.id} value={item.id}>{item.label}</option>
            ))}
            <option value="verbal_warning">Verbal warning</option>
          </select>
          <button
            type="button"
            onClick={() => setOnlyWithActive((prev) => !prev)}
            className={`px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
              onlyWithActive
                ? 'border-indigo-500/50 bg-indigo-500/15 text-indigo-200'
                : 'border-[#1a2540] text-slate-200 hover:bg-[#0b1220]'
            }`}
          >
            {onlyWithActive ? 'Showing active records only' : 'Only show employees with active records'}
          </button>
        </div>
      </div>

      <div className="p-8 overflow-auto space-y-4">
        {error && (
          <div className="bg-red-500/10 border border-red-500/25 rounded-lg p-4 text-sm text-red-300">{error}</div>
        )}
        {loading ? (
          <p className="text-sm text-slate-400">Loading active measures…</p>
        ) : (
          <div className="rounded-xl border border-[#1a2540] bg-[#0b1220] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#1a2540] bg-[#060e1a]/70">
                    <th className="px-5 py-3 text-left">
                      <SortHeader
                        label="Employee"
                        active={sortKey === 'employeeName'}
                        direction={sortDir}
                        onClick={() => toggleSort('employeeName')}
                      />
                    </th>
                    <th className="px-5 py-3 text-left">
                      <SortHeader
                        label="Measures"
                        active={sortKey === 'measureCount'}
                        direction={sortDir}
                        onClick={() => toggleSort('measureCount')}
                      />
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-widest text-slate-400">
                      Detail
                    </th>
                    <th className="px-5 py-3 text-left">
                      <SortHeader
                        label="Latest given"
                        active={sortKey === 'givenAt'}
                        direction={sortDir}
                        onClick={() => toggleSort('givenAt')}
                      />
                    </th>
                    <th className="px-5 py-3 text-left">
                      <SortHeader
                        label="Latest expires"
                        active={sortKey === 'expiresAt'}
                        direction={sortDir}
                        onClick={() => toggleSort('expiresAt')}
                      />
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1a2540]">
                  {tableRows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-5 py-6 text-sm text-slate-500">
                        No employees match the current filters.
                      </td>
                    </tr>
                  ) : (
                    tableRows.map((row) => {
                      const open = expandedUids.has(row.employeeUid);
                      const canExpand = row.measureCount > 0;
                      return (
                        <Fragment key={row.employeeUid}>
                          <tr className="hover:bg-[#060e1a]">
                            <td className="px-5 py-4 text-sm">
                              <div className="flex items-start gap-2">
                                {canExpand ? (
                                  <button
                                    type="button"
                                    onClick={() => toggleExpanded(row.employeeUid)}
                                    className="mt-0.5 p-0.5 rounded hover:bg-[#1a2540]"
                                    aria-expanded={open}
                                    aria-label={open ? 'Collapse measures' : 'Expand measures'}
                                  >
                                    <ChevronIcon open={open} />
                                  </button>
                                ) : (
                                  <span className="w-5" />
                                )}
                                <div>
                                  <button
                                    type="button"
                                    onClick={() => navigate(`/dashboard/employees/${row.employeeUid}`)}
                                    className="text-left font-medium text-white hover:text-indigo-300"
                                  >
                                    {row.employeeName || '—'}
                                  </button>
                                  {row.department ? (
                                    <p className="text-xs text-slate-500 mt-0.5">{row.department}</p>
                                  ) : null}
                                </div>
                              </div>
                            </td>
                            <td className="px-5 py-4 text-sm text-slate-200">
                              {canExpand ? (
                                <button
                                  type="button"
                                  onClick={() => toggleExpanded(row.employeeUid)}
                                  className="text-left hover:text-indigo-300"
                                >
                                  {row.measureCount === 1
                                    ? '1 active measure'
                                    : `${row.measureCount} active measures`}
                                </button>
                              ) : (
                                <span className="text-slate-500 italic">No active disciplinary measures</span>
                              )}
                            </td>
                            <td className="px-5 py-4 text-sm text-slate-500">
                              {canExpand ? (open ? 'Expanded below' : 'Click to expand') : '—'}
                            </td>
                            <td className="px-5 py-4 text-sm text-slate-300">
                              {row.latestGivenAt ? formatUkDate(row.latestGivenAt) : '—'}
                            </td>
                            <td className="px-5 py-4 text-sm text-slate-300">
                              {row.latestExpiresAt ? formatUkDate(row.latestExpiresAt) : '—'}
                            </td>
                          </tr>
                          {open && row.measures.map((measure) => (
                            <tr key={`${row.employeeUid}-${measure.caseId}`} className="bg-[#060e1a]/60">
                              <td className="px-5 py-3 text-sm text-slate-500 pl-12">
                                {row.employeeName}
                              </td>
                              <td className="px-5 py-3 text-sm text-slate-200">
                                {measure.caseId ? (
                                  <button
                                    type="button"
                                    onClick={() => navigate(`/dashboard/cases/${measure.caseId}`)}
                                    className="text-left hover:text-indigo-300"
                                  >
                                    {measure.measureType}
                                  </button>
                                ) : measure.measureType}
                                {measure.durationMonths ? (
                                  <span className="block text-[11px] text-slate-500 mt-0.5">
                                    {measure.durationMonths}-month period
                                  </span>
                                ) : null}
                              </td>
                              <td className="px-5 py-3 text-sm text-slate-300 max-w-md">
                                <span className="line-clamp-2">{measure.reason || '—'}</span>
                              </td>
                              <td className="px-5 py-3 text-sm text-slate-300">{formatUkDate(measure.givenAt)}</td>
                              <td className="px-5 py-3 text-sm text-slate-300">
                                {measure.expiresAt ? formatUkDate(measure.expiresAt) : '—'}
                              </td>
                            </tr>
                          ))}
                        </Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
