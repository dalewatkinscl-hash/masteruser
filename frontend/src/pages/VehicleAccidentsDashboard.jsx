import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { readJsonResponse } from '../utils/employeeProfile';
import {
  accidentPenaltyTriggerLabels,
  getAccidentPointsDate,
  getAccidentPointsExpiryDate,
  getRecordedAccidentPoints,
  groupAccidentsByDriver,
  isAccidentPointsActive,
} from '../utils/accidentPenaltyPoints';
import {
  formatCaseDate,
  formatCaseTitleDisplay,
  getCaseProgressStatus,
  stageLabel,
} from '../utils/peopleCasesDirectory';
import { caseProgressToneClass } from '../utils/peopleCasesAccess';

function faultLabel(fault) {
  const value = String(fault || '').toLowerCase();
  if (value === 'driver') return 'Driver at fault';
  if (value === 'third_party') return 'Third party';
  if (value === 'pending') return 'Awaiting fault';
  return value ? stageLabel(value) : '—';
}

function pointsToneClass(points) {
  if (points >= 5) return 'text-rose-200 border-rose-500/40 bg-rose-500/15';
  if (points >= 3) return 'text-amber-100 border-amber-500/40 bg-amber-500/15';
  if (points >= 1) return 'text-indigo-100 border-indigo-500/40 bg-indigo-500/15';
  return 'text-slate-300 border-[#1a2540] bg-[#060e1a]/50';
}

function formatUkIso(iso) {
  const key = String(iso || '').slice(0, 10);
  const match = key.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '—';
  return `${match[3]}/${match[2]}/${match[1]}`;
}

export default function VehicleAccidentsDashboard() {
  const navigate = useNavigate();
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [expandedUid, setExpandedUid] = useState('');
  const [pointsOnly, setPointsOnly] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await fetch('/api/getPeopleCases?scope=vehicle_accidents', {
        credentials: 'include',
      });
      const data = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(data.error || 'Failed to load accidents.');
      setCases(data.cases || []);
    } catch (err) {
      setError(err.message || 'Failed to load accidents.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const driverRows = useMemo(() => groupAccidentsByDriver(cases), [cases]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return driverRows.filter((row) => {
      if (pointsOnly && row.activePoints < 1) return false;
      if (!query) return true;
      const haystack = [
        row.employeeName,
        row.department,
        row.levelLabel,
        row.activePoints,
        ...row.accidents.flatMap((item) => [
          item.vehicleReg,
          item.title,
          item.accidentFault,
          item.stage,
          formatCaseDate(item),
        ]),
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(query);
    });
  }, [driverRows, search, pointsOnly]);

  const totals = useMemo(() => ({
    drivers: driverRows.length,
    withPoints: driverRows.filter((row) => row.activePoints > 0).length,
    activePoints: driverRows.reduce((sum, row) => sum + row.activePoints, 0),
    accidents: cases.length,
  }), [driverRows, cases.length]);

  const toggleRow = (uidKey) => {
    setExpandedUid((current) => (current === uidKey ? '' : uidKey));
  };

  const rowKey = (row) => row.employeeUid || `name:${row.employeeName}`;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 sm:px-8 py-6 border-b border-[#1a2540] gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">Vehicle accidents</h1>
          <p className="text-sm text-slate-400 mt-1">
            Drivers ranked by rolling 12-month accident points. Expand a row for each accident.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap w-full sm:w-auto">
          <button
            type="button"
            onClick={() => navigate('/dashboard/hr/cases/bump-prompt')}
            className="min-h-11 px-4 py-2.5 rounded-lg border border-[#1a2540] text-slate-200 text-sm hover:bg-[#0b1220]"
          >
            Prompt bump card
          </button>
          <button
            type="button"
            onClick={() => navigate('/dashboard/hr/cases/new?processFamily=vehicle_accident')}
            className="min-h-11 px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold"
          >
            Record accident
          </button>
        </div>
      </div>

      <div className="px-4 sm:px-8 py-4 border-b border-[#1a2540] bg-[#060e1a]/30 grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          ['Drivers', totals.drivers],
          ['With active points', totals.withPoints],
          ['Active points (12 mo)', totals.activePoints],
          ['Accidents logged', totals.accidents],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-[#1a2540] bg-[#0b1220] px-3 py-2">
            <p className="text-[11px] uppercase text-slate-500">{label}</p>
            <p className="text-xl font-semibold text-white tabular-nums">{value}</p>
          </div>
        ))}
      </div>

      <div className="px-4 sm:px-8 py-4 border-b border-[#1a2540] bg-[#060e1a]/30 flex gap-3 flex-wrap items-center">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search drivers or registrations…"
          className="w-full sm:w-80 min-h-11 bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-4 py-2.5"
        />
        <label className="flex items-center gap-2 min-h-11 text-sm text-slate-300">
          <input
            type="checkbox"
            className="w-4 h-4"
            checked={pointsOnly}
            onChange={(e) => setPointsOnly(e.target.checked)}
          />
          Active points only
        </label>
        <button
          type="button"
          onClick={load}
          className="min-h-11 px-3 py-2 rounded-lg border border-[#1a2540] text-slate-300 text-sm hover:bg-[#0b1220]"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="mx-4 sm:mx-8 mt-4 rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      )}

      <div className="flex-1 overflow-auto px-4 sm:px-8 py-4">
        {loading ? (
          <p className="text-sm text-slate-400">Loading drivers…</p>
        ) : filteredRows.length === 0 ? (
          <div className="rounded-xl border border-[#1a2540] bg-[#0b1220] px-6 py-10 text-center">
            <p className="text-slate-300 font-medium">No drivers to show</p>
            <p className="text-sm text-slate-500 mt-1">
              Record an accident or wait for a bump card to appear here.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-[#1a2540] overflow-hidden bg-[#0b1220]">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#060e1a]/80 text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium w-10" aria-hidden="true" />
                  <th className="px-4 py-3 font-medium">Driver</th>
                  <th className="px-4 py-3 font-medium">Department</th>
                  <th className="px-4 py-3 font-medium">Accidents</th>
                  <th className="px-4 py-3 font-medium">Points (12 mo)</th>
                  <th className="px-4 py-3 font-medium">Level</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1a2540]">
                {filteredRows.map((row) => {
                  const key = rowKey(row);
                  const open = expandedUid === key;
                  return (
                    <DriverAccidentRow
                      key={key}
                      row={row}
                      open={open}
                      onToggle={() => toggleRow(key)}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function DriverAccidentRow({ row, open, onToggle }) {
  return (
    <>
      <tr
        className={`cursor-pointer transition-colors ${open ? 'bg-indigo-500/10' : 'hover:bg-white/[0.03]'}`}
        onClick={onToggle}
      >
        <td className="px-4 py-3 text-slate-500">
          <span className={`inline-block transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden="true">
            ▸
          </span>
        </td>
        <td className="px-4 py-3">
          <p className="font-medium text-white">{row.employeeName}</p>
          {row.employeeUid ? (
            <p className="text-xs text-slate-500 mt-0.5 font-mono truncate max-w-[14rem]">{row.employeeUid}</p>
          ) : null}
        </td>
        <td className="px-4 py-3 text-slate-300">{row.department || '—'}</td>
        <td className="px-4 py-3 text-slate-200 tabular-nums">{row.accidentCount}</td>
        <td className="px-4 py-3">
          <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-sm font-semibold tabular-nums ${pointsToneClass(row.activePoints)}`}>
            {row.activePoints}
          </span>
        </td>
        <td className="px-4 py-3 text-slate-200">{row.levelLabel}</td>
      </tr>
      {open && (
        <tr className="bg-[#060e1a]/60">
          <td colSpan={6} className="px-4 py-4">
            <div className="rounded-lg border border-[#1a2540] overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="bg-[#0b1220] text-[10px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Date</th>
                    <th className="px-3 py-2 font-medium">Vehicle</th>
                    <th className="px-3 py-2 font-medium">Fault</th>
                    <th className="px-3 py-2 font-medium">Points</th>
                    <th className="px-3 py-2 font-medium">Expires</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Case</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1a2540]">
                  {row.accidents.map((item) => {
                    const recorded = getRecordedAccidentPoints(item);
                    const active = isAccidentPointsActive(item);
                    const progress = getCaseProgressStatus(item);
                    const triggers = accidentPenaltyTriggerLabels(item.accidentPenaltyTriggers || []);
                    return (
                      <tr key={item.id} className="align-top">
                        <td className="px-3 py-2.5 text-slate-200 whitespace-nowrap">
                          {formatUkIso(getAccidentPointsDate(item)) !== '—'
                            ? formatUkIso(getAccidentPointsDate(item))
                            : formatCaseDate(item)}
                        </td>
                        <td className="px-3 py-2.5 text-slate-200 font-mono">
                          {item.vehicleReg || '—'}
                        </td>
                        <td className="px-3 py-2.5 text-slate-300">
                          {faultLabel(item.accidentFault)}
                        </td>
                        <td className="px-3 py-2.5">
                          {recorded > 0 ? (
                            <div className="space-y-1">
                              <span className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-semibold tabular-nums ${
                                active
                                  ? pointsToneClass(recorded)
                                  : 'text-slate-500 border-[#1a2540] bg-transparent line-through decoration-slate-600'
                              }`}
                              >
                                {recorded}
                                {!active ? ' expired' : ''}
                              </span>
                              {triggers.length > 0 && (
                                <p className="text-[11px] text-slate-500 max-w-xs">
                                  {triggers.join('; ')}
                                </p>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-500">0</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-slate-400 whitespace-nowrap">
                          {recorded > 0 ? formatUkIso(getAccidentPointsExpiryDate(item)) : '—'}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={`inline-flex rounded-md border px-2 py-0.5 text-xs ${caseProgressToneClass(progress.tone)}`}>
                            {progress.label}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <Link
                            to={`/dashboard/hr/cases/${encodeURIComponent(item.id)}`}
                            onClick={(event) => event.stopPropagation()}
                            className="text-indigo-300 hover:text-indigo-200 font-medium"
                          >
                            {formatCaseTitleDisplay(item.title) === '—'
                              ? 'Open case'
                              : formatCaseTitleDisplay(item.title)}
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
