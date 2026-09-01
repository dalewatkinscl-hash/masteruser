import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { readJsonResponse } from '../utils/employeeProfile';

function PairCard({ pair, onMerge }) {
  const [primaryUid, setPrimaryUid] = useState(pair.suggestedPrimaryUid);
  const [preferredFullName, setPreferredFullName] = useState(
    pair.employees.find((employee) => employee.uid === pair.suggestedPrimaryUid)?.fullName || '',
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const primary = pair.employees.find((employee) => employee.uid === primaryUid) || pair.employees[0];
  const secondary = pair.employees.find((employee) => employee.uid !== primaryUid) || pair.employees[1];

  const handleMerge = async () => {
    const confirmed = window.confirm(
      `Merge "${secondary.fullName || secondary.email}" into "${preferredFullName || primary.fullName}"?`,
    );
    if (!confirmed) return;

    setSaving(true);
    setError('');

    try {
      await onMerge({
        primaryUid: primary.uid,
        secondaryUid: secondary.uid,
        preferredFullName: preferredFullName.trim(),
      });
    } catch (err) {
      setError(err.message || 'Failed to merge employees.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-[#1a2540] bg-[#0b1220] p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-slate-500">
            {Math.round(pair.score * 100)}% name match
          </p>
          <h2 className="text-lg font-semibold text-white mt-1">
            {pair.employees.map((employee) => employee.fullName || '—').join(' vs ')}
          </h2>
          <p className="text-sm text-slate-400 mt-1">{pair.reason}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {pair.employees.map((employee) => (
          <label
            key={employee.uid}
            className={`rounded-lg border p-4 cursor-pointer ${
              primaryUid === employee.uid
                ? 'border-indigo-500/50 bg-indigo-500/10'
                : 'border-[#1a2540] bg-[#060e1a]'
            }`}
          >
            <div className="flex items-start gap-3">
              <input
                type="radio"
                name={`primary-${pair.employees.map((item) => item.uid).join('-')}`}
                checked={primaryUid === employee.uid}
                onChange={() => {
                  setPrimaryUid(employee.uid);
                  setPreferredFullName(employee.fullName || '');
                }}
                className="mt-1"
              />
              <div>
                <p className="text-sm font-medium text-white">{employee.fullName || '—'}</p>
                <p className="text-xs text-slate-400 mt-1">{employee.email || 'No work email'}</p>
                <p className="text-xs text-slate-500 mt-1">
                  {employee.employeeProfile?.jobRole || '—'}
                  {employee.employeeProfile?.department ? ` · ${employee.employeeProfile.department}` : ''}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {employee.hasPortalAccount === false ? 'HR only' : 'Portal login'}
                </p>
              </div>
            </div>
          </label>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-[11px] font-medium uppercase tracking-wider text-slate-500 mb-1">
            Name to keep
          </label>
          <select
            value={preferredFullName}
            onChange={(e) => setPreferredFullName(e.target.value)}
            className="w-full bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-3 py-2"
          >
            {pair.employees
              .map((employee) => employee.fullName)
              .filter(Boolean)
              .filter((name, index, list) => list.indexOf(name) === index)
              .map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/25 rounded-lg p-3">
          <p className="text-red-300 text-sm">{error}</p>
        </div>
      )}

      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={() => window.open(`/dashboard/employees/${primary.uid}`, '_blank')}
          className="px-4 py-2 rounded-lg text-sm border border-[#1a2540] text-slate-200 hover:bg-[#060e1a]"
        >
          Review keeper
        </button>
        <button
          type="button"
          onClick={handleMerge}
          disabled={saving}
          className="px-5 py-2.5 rounded-lg text-sm font-medium bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white"
        >
          {saving ? 'Merging…' : 'Merge pair'}
        </button>
      </div>
    </div>
  );
}

export default function DuplicateEmployees() {
  const navigate = useNavigate();
  const [pairs, setPairs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadPairs = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await fetch('/api/getEmployeeDuplicateSuggestions', { credentials: 'include' });
      const data = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(data.error || 'Failed to load duplicate suggestions.');
      setPairs(data.pairs || []);
    } catch (err) {
      setError(err.message || 'Failed to load duplicate suggestions.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPairs();
  }, []);

  const handleMerge = async ({ primaryUid, secondaryUid, preferredFullName }) => {
    const response = await fetch('/api/adminMergeEmployees', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ primaryUid, secondaryUid, preferredFullName }),
    });
    const data = (await readJsonResponse(response)) || {};
    if (!response.ok) {
      throw new Error(data.error || 'Failed to merge employees.');
    }

    setPairs((current) => current.filter((pair) => (
      !pair.employees.some((employee) => employee.uid === primaryUid || employee.uid === secondaryUid)
    )));
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-8 py-6 border-b border-[#1a2540] gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">Possible duplicates</h1>
          <p className="text-sm text-slate-400 mt-1">
            Review employees with similar names and merge HR records into the account you want to keep.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/dashboard/employees')}
          className="px-4 py-2.5 rounded-lg border border-[#1a2540] text-slate-200 text-sm font-medium hover:bg-[#0b1220]"
        >
          Back to employees
        </button>
      </div>

      <div className="flex-1 overflow-auto p-8 space-y-4">
        {loading ? (
          <p className="text-slate-400 text-sm">Scanning for similar names…</p>
        ) : error ? (
          <div className="bg-red-500/10 border border-red-500/25 rounded-lg p-4">
            <p className="text-red-300 text-sm">{error}</p>
          </div>
        ) : pairs.length === 0 ? (
          <div className="bg-emerald-500/10 border border-emerald-500/25 rounded-lg p-4">
            <p className="text-emerald-300 text-sm">No likely duplicate names found.</p>
          </div>
        ) : (
          pairs.map((pair) => (
            <PairCard
              key={pair.employees.map((employee) => employee.uid).sort().join('-')}
              pair={pair}
              onMerge={handleMerge}
            />
          ))
        )}
      </div>
    </div>
  );
}
