import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { readJsonResponse } from '../utils/employeeProfile';
import WorkspaceTabs from '../components/WorkspaceTabs';
import { PROCESS_FAMILIES, caseProgressToneClass, formatCaseTimeToResolution, getCaseProgressStatus, stageLabel } from '../utils/peopleCasesAccess';
import { ALLOW_DELETE_CASES } from '../utils/featureFlags';

const STATUS_OPTIONS = ['', 'open', 'pending_manager', 'pending_hr', 'pending_employee', 'reopened_on_appeal', 'closed'];

const STATUS_FILTER_LABELS = {
  '': 'All workflow statuses',
  open: 'Open (all active)',
  pending_manager: 'Pending manager',
  pending_hr: 'Pending HR',
  pending_employee: 'Pending employee',
  reopened_on_appeal: 'Reopened on appeal',
  closed: 'Closed',
};

function matchesStatusFilter(item, statusFilter) {
  if (!statusFilter) return true;
  const isClosed = item.status === 'closed' || item.stage === 'closed';
  if (statusFilter === 'open') {
    // "Open" means still active — includes pending manager/employee/HR queues.
    return !isClosed;
  }
  if (statusFilter === 'closed') {
    return isClosed;
  }
  return item.status === statusFilter;
}

export default function DisciplinaryDashboard() {
  const navigate = useNavigate();
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [familyFilter, setFamilyFilter] = useState('');
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [mineOnly, setMineOnly] = useState(false);
  const [deletingId, setDeletingId] = useState('');

  const deleteCase = async (item) => {
    const label = item.title || item.id;
    if (!window.confirm(`Permanently delete "${label}"?\n\nAll portal records for this case will be removed.`)) {
      return;
    }
    if (!window.confirm('This cannot be undone. Delete now?')) {
      return;
    }
    setDeletingId(item.id);
    setError('');
    try {
      const response = await fetch('/api/deletePeopleCase', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caseId: item.id }),
      });
      const data = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(data.error || 'Failed to delete case.');
      setCases((prev) => prev.filter((row) => row.id !== item.id));
    } catch (err) {
      setError(err.message || 'Failed to delete case.');
    } finally {
      setDeletingId('');
    }
  };

  const load = async () => {
    try {
      setLoading(true);
      setError('');
      const params = new URLSearchParams();
      if (mineOnly) params.set('mine', '1');
      if (attentionOnly) params.set('attention', '1');
      if (familyFilter) params.set('processFamily', familyFilter);
      const response = await fetch(`/api/getPeopleCases?${params.toString()}`, { credentials: 'include' });
      const data = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(data.error || 'Failed to load cases.');
      setCases(data.cases || []);
    } catch (err) {
      setError(err.message || 'Failed to load cases.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [mineOnly, attentionOnly, familyFilter]);

  const filteredCases = useMemo(() => {
    const query = search.trim().toLowerCase();
    return cases.filter((item) => {
      if (!matchesStatusFilter(item, statusFilter)) return false;
      if (!query) return true;
      const haystack = [
        item.title,
        item.employeeNameSnapshot,
        item.managerNameSnapshot,
        item.departmentSnapshot,
        item.caseType,
        item.processFamily,
        item.stage,
        item.status,
        getCaseProgressStatus(item).label,
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(query);
    });
  }, [cases, search, statusFilter]);

  const queues = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return {
      suspensions: cases.filter((c) => c.suspensionActive).length,
      pendingEmployee: cases.filter((c) => c.status === 'pending_employee').length,
      trainingDecision: cases.filter((c) => c.stage === 'training_decision').length,
      appealWindow: cases.filter((c) => c.stage === 'closed' && c.appealWindowEndsAt && c.appealWindowEndsAt >= today).length,
      slaOverdue: cases.filter((c) => c.stage !== 'closed' && c.slaDueAt && c.slaDueAt < today).length,
    };
  }, [cases]);

  return (
    <div className="flex flex-col h-full">
      <WorkspaceTabs />
      <div className="flex items-center justify-between px-8 py-6 border-b border-[#1a2540] gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">People Cases</h1>
          <p className="text-sm text-slate-400 mt-1">
            Disciplinary, grievance, and vehicle accident case management with Acas-guided steps
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => navigate('/dashboard/cases/bump-prompt')}
            className="px-4 py-2.5 rounded-lg border border-[#1a2540] text-slate-200 text-sm hover:bg-[#0b1220]"
          >
            Prompt bump card
          </button>
          <button
            type="button"
            onClick={() => navigate('/dashboard/cases/new')}
            className="px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold"
          >
            New case
          </button>
        </div>
      </div>

      <div className="px-8 py-4 border-b border-[#1a2540] bg-[#060e1a]/30 grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          ['Active suspensions', queues.suspensions],
          ['Pending employee', queues.pendingEmployee],
          ['Training decisions', queues.trainingDecision],
          ['In appeal window', queues.appealWindow],
          ['SLA overdue', queues.slaOverdue],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-[#1a2540] bg-[#0b1220] px-3 py-2">
            <p className="text-[11px] uppercase text-slate-500">{label}</p>
            <p className="text-xl font-semibold text-white">{value}</p>
          </div>
        ))}
      </div>

      <div className="px-8 py-4 border-b border-[#1a2540] bg-[#060e1a]/30 flex gap-3 flex-wrap items-center">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search cases…"
          className="w-full sm:w-72 bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-4 py-2.5"
        />
        <select
          value={familyFilter}
          onChange={(e) => setFamilyFilter(e.target.value)}
          className="bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-3 py-2.5"
        >
          <option value="">All families</option>
          {PROCESS_FAMILIES.map((family) => (
            <option key={family.id} value={family.id}>{family.label}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-3 py-2.5"
        >
          {STATUS_OPTIONS.map((status) => (
            <option key={status || 'all'} value={status}>{STATUS_FILTER_LABELS[status] || status}</option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} />
          My cases
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={attentionOnly} onChange={(e) => setAttentionOnly(e.target.checked)} />
          Needs attention
        </label>
      </div>

      <div className="flex-1 overflow-auto p-8">
        {loading ? (
          <p className="text-sm text-slate-400">Loading cases…</p>
        ) : error ? (
          <div className="bg-red-500/10 border border-red-500/25 rounded-lg p-4 text-red-300 text-sm">{error}</div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-[#1a2540]">
            <table className="w-full">
              <thead>
                <tr className="bg-[#0b1220] border-b border-[#1a2540]">
                  <th className="px-5 py-3 text-left text-xs text-slate-400 uppercase">Title</th>
                  <th className="px-5 py-3 text-left text-xs text-slate-400 uppercase">Employee</th>
                  <th className="px-5 py-3 text-left text-xs text-slate-400 uppercase">Owner</th>
                  <th className="px-5 py-3 text-left text-xs text-slate-400 uppercase">Family</th>
                  <th className="px-5 py-3 text-left text-xs text-slate-400 uppercase">Progress</th>
                  <th className="px-5 py-3 text-left text-xs text-slate-400 uppercase">Time to resolution</th>
                  <th className="px-5 py-3 text-left text-xs text-slate-400 uppercase">SLA</th>
                  <th className="px-5 py-3 text-right text-xs text-slate-400 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1a2540]">
                {filteredCases.map((item) => {
                  const progress = getCaseProgressStatus(item);
                  return (
                  <tr key={item.id} className="hover:bg-[#0b1220]">
                    <td className="px-5 py-3 text-sm text-white">
                      {item.title || '—'}
                      {item.suspensionActive && (
                        <span className="ml-2 text-[10px] uppercase tracking-wide text-amber-300">Suspended</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-sm text-slate-300">{item.employeeNameSnapshot || '—'}</td>
                    <td className="px-5 py-3 text-sm text-slate-300 whitespace-nowrap">
                      {item.managerNameSnapshot || '—'}
                    </td>
                    <td className="px-5 py-3 text-sm text-slate-300 capitalize">
                      {String(item.processFamily || 'disciplinary').replace(/_/g, ' ')}
                    </td>
                    <td className="px-5 py-3">
                      <div className={`inline-flex flex-col gap-0.5 rounded-lg border px-2.5 py-1.5 max-w-xs ${caseProgressToneClass(progress.tone)}`}>
                        <span className="text-sm font-medium leading-snug">{progress.label}</span>
                        <span className="text-[11px] opacity-80">
                          Step: {stageLabel(progress.stage)}
                          {progress.hint ? ` · ${progress.hint}` : ''}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-sm text-slate-300 whitespace-nowrap">
                      {formatCaseTimeToResolution(item)}
                    </td>
                    <td className="px-5 py-3 text-sm text-slate-300">{item.slaDueAt || '—'}</td>
                    <td className="px-5 py-3 text-right">
                      <div className="inline-flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => navigate(`/dashboard/cases/${item.id}`)}
                          className="text-indigo-300 hover:text-indigo-200 text-sm"
                        >
                          Open
                        </button>
                        {ALLOW_DELETE_CASES && (
                          <button
                            type="button"
                            onClick={() => deleteCase(item)}
                            disabled={deletingId === item.id}
                            className="text-red-300 hover:text-red-200 text-sm disabled:opacity-50"
                          >
                            {deletingId === item.id ? 'Deleting…' : 'Delete'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  );
                })}
                {filteredCases.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-5 py-6 text-sm text-slate-500 text-center">
                      No cases found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
