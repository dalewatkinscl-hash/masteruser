import { useEffect, useMemo, useState, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import WorkspaceTabs from '../components/WorkspaceTabs';
import { readJsonResponse } from '../utils/employeeProfile';

function formatUkDate(value) {
  const text = String(value || '').slice(0, 10);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return text || '—';
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function formatGbp(amount) {
  const value = Number(amount) || 0;
  return `£${value.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
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

export default function BonusDeductions() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rows, setRows] = useState([]);
  const [amounts, setAmounts] = useState({ written_warning: 50, final_written_warning: 100 });
  const [grandTotal, setGrandTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [onlyWithDeductions, setOnlyWithDeductions] = useState(false);
  const [sortKey, setSortKey] = useState('employeeName');
  const [sortDir, setSortDir] = useState('asc');
  const [expandedUids, setExpandedUids] = useState(() => new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const response = await fetch('/api/getBonusDeductions', { credentials: 'include' });
        const data = (await readJsonResponse(response)) || {};
        if (!response.ok) throw new Error(data.error || 'Failed to load bonus deductions.');
        if (!cancelled) {
          setRows(Array.isArray(data.rows) ? data.rows : []);
          setAmounts(data.amounts || { written_warning: 50, final_written_warning: 100 });
          setGrandTotal(Number(data.grandTotal) || 0);
        }
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load bonus deductions.');
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
      const deductions = (row.deductions || []).filter((item) => (
        typeFilter === 'all' || item.outcomePreset === typeFilter
      ));

      if (needle) {
        const haystack = `${name} ${department} ${email}`.toLowerCase();
        const deductionHay = deductions
          .map((item) => `${item.warningLabel} ${item.reason} ${item.title} ${item.warningTitle}`)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(needle) && !deductionHay.includes(needle)) continue;
      }

      if (onlyWithDeductions && deductions.length === 0) continue;
      if (typeFilter !== 'all' && deductions.length === 0) continue;

      const totalAmount = deductions.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
      filtered.push({
        employeeUid: row.employeeUid,
        employeeName: name,
        department,
        deductions,
        deductionCount: deductions.length,
        totalAmount,
        latestGivenAt: deductions[0]?.givenAt || '',
      });
    }

    const dir = sortDir === 'asc' ? 1 : -1;
    filtered.sort((left, right) => {
      let leftVal = '';
      let rightVal = '';
      if (sortKey === 'deductionCount') {
        leftVal = left.deductionCount;
        rightVal = right.deductionCount;
      } else if (sortKey === 'totalAmount') {
        leftVal = left.totalAmount;
        rightVal = right.totalAmount;
      } else if (sortKey === 'givenAt') {
        leftVal = left.latestGivenAt || '';
        rightVal = right.latestGivenAt || '';
      } else {
        leftVal = String(left.employeeName || '').toLowerCase();
        rightVal = String(right.employeeName || '').toLowerCase();
      }
      if (leftVal < rightVal) return -1 * dir;
      if (leftVal > rightVal) return 1 * dir;
      return String(left.employeeName || '').localeCompare(String(right.employeeName || ''));
    });

    return filtered;
  }, [rows, search, typeFilter, onlyWithDeductions, sortKey, sortDir]);

  const filteredTotal = useMemo(
    () => tableRows.reduce((sum, row) => sum + (Number(row.totalAmount) || 0), 0),
    [tableRows],
  );

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
          <h1 className="text-xl font-semibold text-white">Bonus deductions</h1>
          <p className="text-sm text-slate-400 mt-1">
            Written warning {formatGbp(amounts.written_warning)} · Final written warning {formatGbp(amounts.final_written_warning)}.
            Every active employee is listed — including those with no deductions this bonus term.
          </p>
          {!loading && !error && (
            <p className="text-sm text-white mt-2">
              Total deductions across all employees:{' '}
              <span className="font-semibold text-indigo-200">{formatGbp(grandTotal)}</span>
              {filteredTotal !== grandTotal ? (
                <span className="text-slate-400 font-normal">
                  {' '}(filtered view {formatGbp(filteredTotal)})
                </span>
              ) : null}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search employees or deductions…"
            className="w-full sm:w-64 bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-4 py-2.5 focus:outline-none focus:border-indigo-500/60"
          />
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-3 py-2.5"
          >
            <option value="all">All deduction types</option>
            <option value="written_warning">Written warning ({formatGbp(amounts.written_warning)})</option>
            <option value="final_written_warning">Final written warning ({formatGbp(amounts.final_written_warning)})</option>
          </select>
          <button
            type="button"
            onClick={() => setOnlyWithDeductions((prev) => !prev)}
            className={`px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
              onlyWithDeductions
                ? 'border-indigo-500/50 bg-indigo-500/15 text-indigo-200'
                : 'border-[#1a2540] text-slate-200 hover:bg-[#0b1220]'
            }`}
          >
            {onlyWithDeductions ? 'Showing staff with deductions only' : 'Only show staff with deductions'}
          </button>
        </div>
      </div>

      <div className="p-8 overflow-auto space-y-4">
        {error && (
          <div className="bg-red-500/10 border border-red-500/25 rounded-lg p-4 text-sm text-red-300">{error}</div>
        )}
        {loading ? (
          <p className="text-sm text-slate-400">Loading bonus deductions…</p>
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
                        label="Deductions"
                        active={sortKey === 'deductionCount'}
                        direction={sortDir}
                        onClick={() => toggleSort('deductionCount')}
                      />
                    </th>
                    <th className="px-5 py-3 text-left">
                      <SortHeader
                        label="Total"
                        active={sortKey === 'totalAmount'}
                        direction={sortDir}
                        onClick={() => toggleSort('totalAmount')}
                      />
                    </th>
                    <th className="px-5 py-3 text-left">
                      <SortHeader
                        label="Latest"
                        active={sortKey === 'givenAt'}
                        direction={sortDir}
                        onClick={() => toggleSort('givenAt')}
                      />
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-widest text-slate-400">
                      Detail
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
                  ) : tableRows.map((row) => {
                    const open = expandedUids.has(row.employeeUid);
                    const canExpand = row.deductionCount > 0;
                    return (
                      <Fragment key={row.employeeUid}>
                        <tr className="hover:bg-[#060e1a]/40">
                          <td className="px-5 py-4 text-sm">
                            <div className="flex items-start gap-2">
                              {canExpand ? (
                                <button
                                  type="button"
                                  onClick={() => toggleExpanded(row.employeeUid)}
                                  className="mt-0.5 p-0.5 rounded hover:bg-[#1a2540]"
                                  aria-expanded={open}
                                  aria-label={open ? 'Collapse deductions' : 'Expand deductions'}
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
                                {row.deductionCount === 1
                                  ? '1 deduction'
                                  : `${row.deductionCount} deductions`}
                              </button>
                            ) : (
                              <span className="text-slate-500 italic">No deductions this bonus term</span>
                            )}
                          </td>
                          <td className="px-5 py-4 text-sm text-white font-medium">
                            {canExpand ? formatGbp(row.totalAmount) : formatGbp(0)}
                          </td>
                          <td className="px-5 py-4 text-sm text-slate-300">
                            {row.latestGivenAt ? formatUkDate(row.latestGivenAt) : '—'}
                          </td>
                          <td className="px-5 py-4 text-sm text-slate-500">
                            {canExpand ? (open ? 'Expanded below' : 'Click to expand') : '—'}
                          </td>
                        </tr>
                        {open && row.deductions.map((item) => (
                          <tr key={`${row.employeeUid}-${item.caseId}`} className="bg-[#060e1a]/60">
                            <td className="px-5 py-3 text-sm text-slate-500 pl-12">
                              {row.employeeName}
                            </td>
                            <td className="px-5 py-3 text-sm text-slate-200">
                              <button
                                type="button"
                                onClick={() => navigate(`/dashboard/cases/${item.caseId}`)}
                                className="text-left hover:text-indigo-300"
                              >
                                {item.warningLabel}
                                {item.warningTitle ? ` — ${item.warningTitle}` : ''}
                              </button>
                              {item.reason ? (
                                <p className="text-xs text-slate-500 mt-0.5">{item.reason}</p>
                              ) : null}
                            </td>
                            <td className="px-5 py-3 text-sm text-white font-medium">
                              {formatGbp(item.amount)}
                            </td>
                            <td className="px-5 py-3 text-sm text-slate-300">
                              {formatUkDate(item.givenAt)}
                            </td>
                            <td className="px-5 py-3 text-sm text-slate-500">
                              {item.superseded ? 'Superseded' : 'Issued'}
                            </td>
                          </tr>
                        ))}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
