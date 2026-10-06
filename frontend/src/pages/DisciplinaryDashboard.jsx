import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ColumnFilterDropdown, ColumnsIcon, SortButton } from '../components/DataTableControls';
import { readJsonResponse } from '../utils/employeeProfile';
import {
  PROCESS_FAMILIES,
  caseProgressToneClass,
} from '../utils/peopleCasesAccess';
import {
  CASE_TABLE_COLUMNS,
  DEFAULT_VISIBLE_CASE_COLUMN_IDS,
  caseIsVisibleToEmployee,
  collectCaseColumnFilterOptions,
  createEmptyCaseColumnFilters,
  familyLabel,
  filterCasesByColumns,
  formatCaseDate,
  formatCaseTimeToResolution,
  formatCaseTitleDisplay,
  getCaseProgressStatus,
  getVisibleCaseColumns,
  loadCaseColumnWidths,
  loadVisibleCaseColumns,
  saveCaseColumnWidths,
  saveVisibleCaseColumns,
  sortCases,
  stageLabel,
} from '../utils/peopleCasesDirectory';
import { ALLOW_DELETE_CASES } from '../utils/featureFlags';

const STATUS_OPTIONS = ['', 'open', 'pending_manager', 'pending_hr', 'pending_employee', 'reopened_on_appeal', 'closed'];

const MIN_COLUMN_WIDTH = 72;

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
    return !isClosed;
  }
  if (statusFilter === 'closed') {
    return isClosed;
  }
  return item.status === statusFilter;
}

function VisibilityDot({ visible }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className={`inline-block h-2.5 w-2.5 rounded-full ${
          visible ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.55)]' : 'bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.45)]'
        }`}
        title={visible ? 'Visible to employee' : 'Hidden from employee'}
      />
      <span className={`text-xs ${visible ? 'text-emerald-300' : 'text-red-300'}`}>
        {visible ? 'Yes' : 'No'}
      </span>
    </span>
  );
}

function CaseCell({ item, columnId }) {
  if (columnId === 'date') {
    return <span className="text-sm text-slate-300 whitespace-nowrap">{formatCaseDate(item)}</span>;
  }
  if (columnId === 'title') {
    return (
      <span className="text-sm text-white break-words whitespace-normal leading-snug">
        {formatCaseTitleDisplay(item.title)}
        {item.suspensionActive && (
          <span className="ml-2 text-[10px] uppercase tracking-wide text-amber-300">Suspended</span>
        )}
      </span>
    );
  }
  if (columnId === 'employee') {
    return <span className="text-sm text-slate-300 break-words whitespace-normal leading-snug">{item.employeeNameSnapshot || '—'}</span>;
  }
  if (columnId === 'owner') {
    return <span className="text-sm text-slate-300 break-words whitespace-normal leading-snug">{item.managerNameSnapshot || '—'}</span>;
  }
  if (columnId === 'family') {
    return <span className="text-sm text-slate-300 capitalize break-words whitespace-normal">{familyLabel(item)}</span>;
  }
  if (columnId === 'progress') {
    const progress = getCaseProgressStatus(item);
    return (
      <div className={`inline-flex flex-col gap-0.5 rounded-lg border px-2.5 py-1.5 max-w-full ${caseProgressToneClass(progress.tone)}`}>
        <span className="text-sm font-medium leading-snug break-words whitespace-normal">{progress.label}</span>
        <span className="text-[11px] opacity-80 break-words whitespace-normal">
          Step: {stageLabel(progress.stage)}
          {progress.hint ? ` · ${progress.hint}` : ''}
        </span>
      </div>
    );
  }
  if (columnId === 'timeToResolution') {
    return <span className="text-sm text-slate-300 whitespace-nowrap">{formatCaseTimeToResolution(item)}</span>;
  }
  if (columnId === 'sla') {
    return <span className="text-sm text-slate-300 break-words whitespace-normal">{item.slaDueAt || '—'}</span>;
  }
  if (columnId === 'visible') {
    return <VisibilityDot visible={caseIsVisibleToEmployee(item)} />;
  }
  return null;
}

function ColumnResizeHandle({ columnId, onResizeStart }) {
  return (
    <button
      type="button"
      aria-label={`Resize ${columnId} column`}
      onMouseDown={(event) => onResizeStart(event, columnId)}
      className="absolute top-0 right-0 z-10 h-full w-2 cursor-col-resize touch-none border-0 bg-transparent p-0 hover:bg-indigo-500/30"
    />
  );
}

function CaseMobileCard({
  item,
  progress,
  visible,
  publishingId,
  deletingId,
  onOpen,
  onToggleVisibility,
  onDelete,
}) {
  return (
    <div className="rounded-xl border border-[#1a2540] bg-[#0b1220] p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-white break-words">
            {formatCaseTitleDisplay(item.title)}
            {item.suspensionActive && (
              <span className="ml-2 text-[10px] uppercase tracking-wide text-amber-300">Suspended</span>
            )}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            {formatCaseDate(item)}
            {' · '}
            {item.employeeNameSnapshot || '—'}
          </p>
        </div>
        <VisibilityDot visible={visible} />
      </div>

      <div className={`rounded-lg border px-2.5 py-1.5 ${caseProgressToneClass(progress.tone)}`}>
        <p className="text-sm font-medium leading-snug">{progress.label}</p>
        <p className="text-[11px] opacity-80 mt-0.5">
          {familyLabel(item)}
          {' · '}
          Step: {stageLabel(progress.stage)}
          {progress.hint ? ` · ${progress.hint}` : ''}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          type="button"
          onClick={() => onOpen(item.id)}
          className="inline-flex items-center justify-center min-h-11 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium"
        >
          Open
        </button>
        <button
          type="button"
          onClick={() => onToggleVisibility(item, !visible)}
          disabled={publishingId === item.id}
          className={`inline-flex items-center justify-center min-h-11 px-3 rounded-lg border border-[#1a2540] text-sm disabled:opacity-50 ${
            visible ? 'text-amber-300' : 'text-emerald-300'
          }`}
        >
          {publishingId === item.id
            ? (visible ? 'Hiding…' : 'Publishing…')
            : (visible ? 'Hide' : 'Publish')}
        </button>
        {ALLOW_DELETE_CASES && (
          <button
            type="button"
            onClick={() => onDelete(item)}
            disabled={deletingId === item.id}
            className="inline-flex items-center justify-center min-h-11 px-3 rounded-lg border border-red-500/30 text-red-300 text-sm disabled:opacity-50"
          >
            {deletingId === item.id ? 'Deleting…' : 'Delete'}
          </button>
        )}
      </div>
    </div>
  );
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
  const [publishingId, setPublishingId] = useState('');
  const [kpiOpen, setKpiOpen] = useState(false);
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [visibleColumnIds, setVisibleColumnIds] = useState(() => loadVisibleCaseColumns());
  const [columnFilters, setColumnFilters] = useState(() => createEmptyCaseColumnFilters());
  const [openFilterColumn, setOpenFilterColumn] = useState(null);
  const [sortColumn, setSortColumn] = useState('date');
  const [sortDirection, setSortDirection] = useState('desc');
  const [columnWidths, setColumnWidths] = useState(() => loadCaseColumnWidths());
  const resizeRef = useRef(null);

  const visibleColumns = useMemo(
    () => getVisibleCaseColumns(visibleColumnIds),
    [visibleColumnIds],
  );
  const colSpan = visibleColumns.length + 1;
  const tableWidth = useMemo(() => {
    const dataWidth = visibleColumns.reduce(
      (sum, column) => sum + (columnWidths[column.id] || MIN_COLUMN_WIDTH),
      0,
    );
    return dataWidth + (columnWidths.actions || 280);
  }, [visibleColumns, columnWidths]);

  useEffect(() => {
    saveVisibleCaseColumns(visibleColumnIds);
  }, [visibleColumnIds]);

  useEffect(() => {
    saveCaseColumnWidths(columnWidths);
  }, [columnWidths]);

  useEffect(() => {
    const onMove = (event) => {
      const active = resizeRef.current;
      if (!active) return;
      const nextWidth = Math.max(MIN_COLUMN_WIDTH, active.startWidth + (event.clientX - active.startX));
      setColumnWidths((current) => (
        current[active.columnId] === nextWidth
          ? current
          : { ...current, [active.columnId]: nextWidth }
      ));
    };
    const onUp = () => {
      resizeRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  const handleColumnResizeStart = (event, columnId) => {
    event.preventDefault();
    event.stopPropagation();
    resizeRef.current = {
      columnId,
      startX: event.clientX,
      startWidth: columnWidths[columnId] || MIN_COLUMN_WIDTH,
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  const setEmployeeVisibility = async (item, publish) => {
    const label = formatCaseTitleDisplay(item.title) === '—' ? item.id : formatCaseTitleDisplay(item.title);
    if (publish) {
      if (!window.confirm(`Publish "${label}" to the employee portal?\n\nThey will see this case under My cases.`)) {
        return;
      }
    } else if (!window.confirm(`Hide "${label}" from the employee portal?\n\nThey will no longer see this case under My cases.`)) {
      return;
    }
    setPublishingId(item.id);
    setError('');
    try {
      const response = await fetch('/api/updatePeopleCase', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caseId: item.id, publishToEmployee: publish }),
      });
      const data = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(data.error || 'Failed to update visibility.');
      const nowIso = new Date().toISOString();
      setCases((prev) => prev.map((row) => {
        if (row.id !== item.id) return row;
        if (publish) {
          return {
            ...row,
            publishedToEmployeeAt: nowIso,
            unpublishedFromEmployeeAt: null,
          };
        }
        return {
          ...row,
          publishedToEmployeeAt: null,
          unpublishedFromEmployeeAt: nowIso,
        };
      }));
    } catch (err) {
      setError(err.message || 'Failed to update visibility.');
    } finally {
      setPublishingId('');
    }
  };

  const deleteCase = async (item) => {
    const label = formatCaseTitleDisplay(item.title) === '—' ? item.id : formatCaseTitleDisplay(item.title);
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

  const baseFilteredCases = useMemo(() => {
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
        formatCaseDate(item),
        getCaseProgressStatus(item).label,
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(query);
    });
  }, [cases, search, statusFilter]);

  const filteredCases = useMemo(() => {
    const columnFiltered = filterCasesByColumns(baseFilteredCases, columnFilters);
    return sortCases(columnFiltered, sortColumn, sortDirection);
  }, [baseFilteredCases, columnFilters, sortColumn, sortDirection]);

  const filterOptionsByColumn = useMemo(() => {
    const map = {};
    for (const column of visibleColumns) {
      const otherFilters = createEmptyCaseColumnFilters();
      for (const id of Object.keys(columnFilters)) {
        if (id === column.id) continue;
        otherFilters[id] = columnFilters[id] || [];
      }
      const pool = filterCasesByColumns(baseFilteredCases, otherFilters);
      map[column.id] = collectCaseColumnFilterOptions(pool, column.id);
    }
    return map;
  }, [baseFilteredCases, columnFilters, visibleColumns]);

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

  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection((direction) => (direction === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortColumn(column);
    setSortDirection(column === 'date' || column === 'sla' ? 'desc' : 'asc');
  };

  const handleFilterChange = (column, values) => {
    setColumnFilters((current) => ({ ...current, [column]: values }));
  };

  const closeFilter = () => setOpenFilterColumn(null);

  const toggleColumn = (columnId) => {
    const column = CASE_TABLE_COLUMNS.find((item) => item.id === columnId);
    if (column?.locked) return;
    setVisibleColumnIds((current) => {
      if (current.includes(columnId)) {
        return current.filter((id) => id !== columnId);
      }
      return [...current, columnId];
    });
  };

  const resetColumns = () => {
    setVisibleColumnIds([...DEFAULT_VISIBLE_CASE_COLUMN_IDS]);
  };

  const clearColumnFilters = () => {
    setColumnFilters(createEmptyCaseColumnFilters());
    setOpenFilterColumn(null);
  };

  const hasActiveColumnFilters = Object.values(columnFilters).some((values) => (values || []).length > 0);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 sm:px-8 py-6 border-b border-[#1a2540] gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">People Cases</h1>
          <p className="text-sm text-slate-400 mt-1">
            Disciplinary, grievance, and vehicle accident case management with Acas-guided steps
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
            onClick={() => navigate('/dashboard/hr/cases/new')}
            className="min-h-11 px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold"
          >
            New case
          </button>
        </div>
      </div>

      <div className="border-b border-[#1a2540] bg-[#060e1a]/30">
        <button
          type="button"
          onClick={() => setKpiOpen((open) => !open)}
          className="md:hidden w-full flex items-center justify-between gap-3 px-4 py-3 min-h-11 text-left"
          aria-expanded={kpiOpen}
        >
          <span className="text-sm font-medium text-slate-200">Queue summary</span>
          <span className="flex items-center gap-3">
            <span className="text-xs text-slate-500 tabular-nums">
              {[
                queues.suspensions,
                queues.pendingEmployee,
                queues.trainingDecision,
                queues.appealWindow,
                queues.slaOverdue,
              ].reduce((sum, n) => sum + n, 0)}{' '}
              flagged
            </span>
            <svg
              className={`w-4 h-4 text-slate-400 transition-transform ${kpiOpen ? 'rotate-180' : ''}`}
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
            </svg>
          </span>
        </button>
        <div className={`${kpiOpen ? 'grid' : 'hidden'} md:grid px-4 sm:px-8 pb-4 md:py-4 grid-cols-2 md:grid-cols-5 gap-3`}>
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
      </div>

      <div className="px-4 sm:px-8 py-4 border-b border-[#1a2540] bg-[#060e1a]/30 flex gap-3 flex-wrap items-center">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search cases…"
          className="w-full sm:w-72 min-h-11 bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-4 py-2.5"
        />
        <select
          value={familyFilter}
          onChange={(e) => setFamilyFilter(e.target.value)}
          className="w-full sm:w-auto min-h-11 bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-3 py-2.5"
        >
          <option value="">All families</option>
          {PROCESS_FAMILIES.map((family) => (
            <option key={family.id} value={family.id}>{family.label}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="w-full sm:w-auto min-h-11 bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-3 py-2.5"
        >
          {STATUS_OPTIONS.map((status) => (
            <option key={status || 'all'} value={status}>{STATUS_FILTER_LABELS[status] || status}</option>
          ))}
        </select>
        <label className="flex items-center gap-2 min-h-11 text-sm text-slate-300">
          <input type="checkbox" className="w-4 h-4" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} />
          My cases
        </label>
        <label className="flex items-center gap-2 min-h-11 text-sm text-slate-300">
          <input type="checkbox" className="w-4 h-4" checked={attentionOnly} onChange={(e) => setAttentionOnly(e.target.checked)} />
          Needs attention
        </label>

        <div className="relative hidden md:block">
          <button
            type="button"
            onClick={() => setShowColumnPicker((open) => !open)}
            className="inline-flex items-center gap-2 min-h-11 px-3 py-2 rounded-lg border border-[#1a2540] text-slate-200 text-sm font-medium hover:bg-[#0b1220] transition-colors"
          >
            <ColumnsIcon className="w-4 h-4" />
            Columns
            <span className="text-xs text-slate-500">{visibleColumns.length}/{CASE_TABLE_COLUMNS.length}</span>
          </button>
          {showColumnPicker && (
            <>
              <button
                type="button"
                className="fixed inset-0 z-20 cursor-default"
                aria-label="Close columns menu"
                onClick={() => setShowColumnPicker(false)}
              />
              <div className="absolute left-0 top-full mt-2 z-30 w-72 rounded-xl border border-[#1a2540] bg-[#0b1220] shadow-xl p-3 space-y-1">
                <div className="flex items-center justify-between px-1 pb-2">
                  <p className="text-[10px] font-mono uppercase tracking-widest text-slate-500">
                    Show / hide columns
                  </p>
                  <button
                    type="button"
                    onClick={resetColumns}
                    className="text-xs text-indigo-300 hover:text-indigo-200"
                  >
                    Reset
                  </button>
                </div>
                {CASE_TABLE_COLUMNS.map((column) => {
                  const checked = visibleColumnIds.includes(column.id);
                  return (
                    <label
                      key={column.id}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm ${
                        column.locked
                          ? 'text-slate-500 cursor-not-allowed'
                          : 'text-slate-200 hover:bg-[#060e1a] cursor-pointer'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={Boolean(column.locked)}
                        onChange={() => toggleColumn(column.id)}
                        className="w-4 h-4 rounded border-[#1a2540] bg-[#060e1a] text-indigo-500 disabled:opacity-50"
                      />
                      <span>{column.label}</span>
                      {column.locked && (
                        <span className="ml-auto text-[10px] uppercase tracking-wide text-slate-600">
                          Required
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {hasActiveColumnFilters && (
          <button
            type="button"
            onClick={clearColumnFilters}
            className="text-sm text-indigo-300 hover:text-indigo-200"
          >
            Clear column filters
          </button>
        )}
        <span className="text-sm text-slate-500">
          {filteredCases.length} of {cases.length} shown
        </span>
      </div>

      <div className="flex-1 overflow-auto p-4 sm:p-8">
        {loading ? (
          <p className="text-sm text-slate-400">Loading cases…</p>
        ) : error ? (
          <div className="bg-red-500/10 border border-red-500/25 rounded-lg p-4 text-red-300 text-sm">{error}</div>
        ) : filteredCases.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-8">No cases found.</p>
        ) : (
          <>
            <div className="md:hidden space-y-3">
              {filteredCases.map((item) => {
                const progress = getCaseProgressStatus(item);
                const visible = caseIsVisibleToEmployee(item);
                return (
                  <CaseMobileCard
                    key={item.id}
                    item={item}
                    progress={progress}
                    visible={visible}
                    publishingId={publishingId}
                    deletingId={deletingId}
                    onOpen={(id) => navigate(`/dashboard/hr/cases/${id}`)}
                    onToggleVisibility={setEmployeeVisibility}
                    onDelete={deleteCase}
                  />
                );
              })}
            </div>

            <div className="hidden md:block overflow-x-auto rounded-lg border border-[#1a2540]">
              <table className="table-fixed border-collapse" style={{ width: tableWidth, minWidth: tableWidth }}>
                <colgroup>
                  {visibleColumns.map((column) => (
                    <col
                      key={`col-${column.id}`}
                      style={{ width: columnWidths[column.id] || MIN_COLUMN_WIDTH }}
                    />
                  ))}
                  <col style={{ width: columnWidths.actions || 280 }} />
                </colgroup>
                <thead>
                  <tr className="bg-[#0b1220] border-b border-[#1a2540]">
                    {visibleColumns.map((column) => (
                      <th
                        key={column.id}
                        className="relative px-5 py-3 text-left text-xs font-semibold uppercase tracking-widest text-slate-400"
                        style={{ width: columnWidths[column.id] || MIN_COLUMN_WIDTH }}
                      >
                        <div className="pr-2">
                          <SortButton
                            label={column.label}
                            column={column.id}
                            sortColumn={sortColumn}
                            sortDirection={sortDirection}
                            onSort={handleSort}
                          />
                        </div>
                        <ColumnResizeHandle
                          columnId={column.id}
                          onResizeStart={handleColumnResizeStart}
                        />
                      </th>
                    ))}
                    <th
                      className="relative px-5 py-3 text-right text-xs font-semibold uppercase tracking-widest text-slate-400"
                      style={{ width: columnWidths.actions || 280 }}
                    >
                      <span className="pr-2">Actions</span>
                      <ColumnResizeHandle
                        columnId="actions"
                        onResizeStart={handleColumnResizeStart}
                      />
                    </th>
                  </tr>
                  <tr className="bg-[#0b1220] border-b border-[#1a2540]">
                    {visibleColumns.map((column) => (
                      <th
                        key={`filter-${column.id}`}
                        className="relative px-5 pt-1 pb-3 text-left align-top"
                        style={{ width: columnWidths[column.id] || MIN_COLUMN_WIDTH }}
                      >
                        <ColumnFilterDropdown
                          columnId={column.id}
                          options={filterOptionsByColumn[column.id] || []}
                          selected={columnFilters[column.id] || []}
                          onChange={(values) => handleFilterChange(column.id, values)}
                          open={openFilterColumn === column.id}
                          onToggle={() => setOpenFilterColumn((current) => (
                            current === column.id ? null : column.id
                          ))}
                          onClose={closeFilter}
                        />
                        <ColumnResizeHandle
                          columnId={column.id}
                          onResizeStart={handleColumnResizeStart}
                        />
                      </th>
                    ))}
                    <th
                      className="relative px-5 py-3"
                      style={{ width: columnWidths.actions || 280 }}
                    >
                      <ColumnResizeHandle
                        columnId="actions"
                        onResizeStart={handleColumnResizeStart}
                      />
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1a2540]">
                  {filteredCases.map((item) => {
                    const visible = caseIsVisibleToEmployee(item);
                    return (
                      <tr key={item.id} className="hover:bg-[#0b1220]">
                        {visibleColumns.map((column) => (
                          <td
                            key={column.id}
                            className="px-5 py-3 align-top overflow-hidden"
                            style={{ width: columnWidths[column.id] || MIN_COLUMN_WIDTH }}
                          >
                            <CaseCell item={item} columnId={column.id} />
                          </td>
                        ))}
                        <td
                          className="px-5 py-3 text-right align-top overflow-hidden"
                          style={{ width: columnWidths.actions || 280 }}
                        >
                          <div className="inline-flex flex-wrap items-center justify-end gap-3">
                            <button
                              type="button"
                              onClick={() => setEmployeeVisibility(item, !visible)}
                              disabled={publishingId === item.id}
                              className={`text-sm disabled:opacity-50 ${
                                visible
                                  ? 'text-amber-300 hover:text-amber-200'
                                  : 'text-emerald-300 hover:text-emerald-200'
                              }`}
                            >
                              {publishingId === item.id
                                ? (visible ? 'Hiding…' : 'Publishing…')
                                : (visible ? 'Hide' : 'Publish to employee')}
                            </button>
                            <button
                              type="button"
                              onClick={() => navigate(`/dashboard/hr/cases/${item.id}`)}
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
                      <td colSpan={colSpan} className="px-5 py-6 text-sm text-slate-500 text-center">
                        No cases found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
