import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import RollCallModal from '../components/RollCallModal';
import { canViewAllEmployeeProfiles, phoneHref, readJsonResponse } from '../utils/employeeProfile';
import {
  DEFAULT_VISIBLE_COLUMN_IDS,
  GROUP_BY_OPTIONS,
  TABLE_COLUMNS,
  collectColumnFilterOptions,
  createDefaultColumnFilters,
  createEmptyColumnFilters,
  filterEmployees,
  getDisplayValue,
  getVisibleTableColumns,
  groupEmployees,
  loadVisibleColumns,
  saveVisibleColumns,
  sortEmployees,
} from '../utils/employeeDirectory';
import { canManagePortalAccess } from '../utils/portalAccess';
import { canManagePeopleCases } from '../utils/peopleCasesAccess';
import { useAuth } from '../context/AuthContext';

function PlusIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <line x1="12" y1="5" x2="12" y2="19" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ChevronRightIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="m9 6 6 6-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PhoneIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M6.5 3h3l1.5 5-2 1.2a12.5 12.5 0 0 0 5.8 5.8L15 13l5 1.5v3A2 2 0 0 1 18 20.2 16 16 0 0 1 3.8 6 2 2 0 0 1 6.5 3Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ColumnsIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="4" width="5" height="16" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="10" y="4" width="5" height="16" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="17" y="4" width="4" height="16" rx="1" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function SortButton({ label, column, sortColumn, sortDirection, onSort }) {
  const active = sortColumn === column;
  return (
    <button
      type="button"
      onClick={() => onSort(column)}
      className={`inline-flex items-center gap-1 whitespace-nowrap hover:text-slate-200 ${active ? 'text-indigo-300' : ''}`}
    >
      {label}
      <span className="text-[10px]">{active ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}</span>
    </button>
  );
}

function ColumnFilterDropdown({
  columnId,
  options,
  selected,
  onChange,
  open,
  onToggle,
  onClose,
}) {
  const buttonRef = useRef(null);
  const panelRef = useRef(null);
  const [query, setQuery] = useState('');
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const selectedSet = useMemo(() => new Set(selected || []), [selected]);
  const activeCount = selectedSet.size;

  useEffect(() => {
    if (!open) {
      setQuery('');
      return undefined;
    }

    const updatePosition = () => {
      if (!buttonRef.current) return;
      const rect = buttonRef.current.getBoundingClientRect();
      const panelWidth = 240;
      const maxLeft = window.innerWidth - panelWidth - 8;
      setPosition({
        top: rect.bottom + 6,
        left: Math.max(8, Math.min(rect.left, maxLeft)),
      });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event) => {
      const target = event.target;
      if (buttonRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      onClose();
    };

    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  const filteredOptions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((option) => option.toLowerCase().includes(needle));
  }, [options, query]);

  const toggleOption = (option) => {
    const next = new Set(selectedSet);
    if (next.has(option)) next.delete(option);
    else next.add(option);
    onChange([...next]);
  };

  const selectAllVisible = () => {
    const next = new Set(selectedSet);
    filteredOptions.forEach((option) => next.add(option));
    onChange([...next]);
  };

  const clearAll = () => onChange([]);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={onToggle}
        className={`inline-flex items-center gap-1.5 max-w-[9rem] px-2 py-1.5 rounded border text-xs transition-colors ${
          activeCount > 0
            ? 'border-indigo-500/50 bg-indigo-500/10 text-indigo-200'
            : 'border-[#1a2540] bg-[#060e1a] text-slate-300 hover:border-slate-600'
        }`}
      >
        <span className="truncate">{activeCount > 0 ? `${activeCount} selected` : 'All'}</span>
        <span className="text-[10px] opacity-70">{open ? '▴' : '▾'}</span>
      </button>

      {open && createPortal(
        <div
          ref={panelRef}
          style={{ top: position.top, left: position.left }}
          className="fixed z-[80] w-60 rounded-xl border border-[#1a2540] bg-[#0b1220] shadow-2xl"
        >
          <div className="p-2 border-b border-[#1a2540] space-y-2">
            {options.length > 8 && (
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search options…"
                className="w-full bg-[#060e1a] border border-[#1a2540] text-slate-200 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-indigo-500/50"
              />
            )}
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={selectAllVisible}
                className="text-[11px] text-indigo-300 hover:text-indigo-200"
              >
                Select all
              </button>
              <button
                type="button"
                onClick={clearAll}
                className="text-[11px] text-slate-400 hover:text-slate-200"
              >
                Clear
              </button>
            </div>
          </div>
          <div className="max-h-56 overflow-y-auto p-1">
            {filteredOptions.length === 0 ? (
              <p className="px-2 py-3 text-xs text-slate-500">No options</p>
            ) : (
              filteredOptions.map((option) => {
                const checked = selectedSet.has(option);
                return (
                  <label
                    key={`${columnId}-${option}`}
                    className="flex items-start gap-2 px-2 py-1.5 rounded-lg hover:bg-[#060e1a] cursor-pointer text-xs text-slate-200"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleOption(option)}
                      className="mt-0.5 w-3.5 h-3.5 rounded border-[#1a2540] bg-[#060e1a] text-indigo-500"
                    />
                    <span className="break-words">{option}</span>
                  </label>
                );
              })
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

function StatusBadge({ employee }) {
  if (employee.hasPortalAccount === false) {
    return (
      <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30">
        HR only
      </span>
    );
  }

  if (employee.isActive) {
    return (
      <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
        Active
      </span>
    );
  }

  return (
    <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-medium bg-slate-500/20 text-slate-300 border border-slate-500/30">
      Inactive
    </span>
  );
}

function EmployeeCell({ employee, columnId }) {
  if (columnId === 'name') {
    return (
      <div className="flex items-center gap-3 min-w-[12rem]">
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
          {(employee.fullName || employee.email || '?')[0].toUpperCase()}
        </div>
        <div>
          <p className="text-sm font-medium text-white">{employee.fullName || '—'}</p>
          <p className="text-xs text-slate-500">{employee.email || 'No work email'}</p>
        </div>
      </div>
    );
  }

  if (columnId === 'phone') {
    const phone = employee.employeeProfile?.phoneNumber;
    const tel = phoneHref(phone);
    return (
      <div className="flex items-center gap-2 whitespace-nowrap">
        <span className="text-sm text-slate-300">{phone || '—'}</span>
        {tel && (
          <a href={tel} className="text-emerald-300 hover:text-emerald-200" title="Call">
            <PhoneIcon className="w-3.5 h-3.5" />
          </a>
        )}
      </div>
    );
  }

  if (columnId === 'status') {
    return <StatusBadge employee={employee} />;
  }

  return (
    <span className="text-sm text-slate-300 whitespace-nowrap">
      {getDisplayValue(employee, columnId)}
    </span>
  );
}

function EmployeeRow({
  employee,
  selected,
  onToggleSelect,
  onManage,
  visibleColumns,
}) {
  return (
    <tr className={`hover:bg-[#0b1220] transition-colors ${selected ? 'bg-indigo-500/5' : ''}`}>
      <td className="px-4 py-4">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(employee.uid)}
          aria-label={`Select ${employee.fullName || 'employee'}`}
          className="w-4 h-4 rounded border-[#1a2540] bg-[#060e1a] text-indigo-500"
        />
      </td>
      {visibleColumns.map((column) => (
        <td key={column.id} className="px-4 py-4">
          <EmployeeCell employee={employee} columnId={column.id} />
        </td>
      ))}
      <td className="px-4 py-4 text-right">
        <button
          type="button"
          onClick={() => onManage(employee.uid)}
          className="inline-flex items-center gap-1 text-indigo-400 hover:text-indigo-300 text-sm font-medium transition-colors"
        >
          Manage
          <ChevronRightIcon className="w-4 h-4" />
        </button>
      </td>
    </tr>
  );
}

export default function EmployeesDirectory() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = canManagePortalAccess(user);
  const canViewDisciplinaryMeasures = canManagePeopleCases(user);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [sortColumn, setSortColumn] = useState('name');
  const [sortDirection, setSortDirection] = useState('asc');
  const [columnFilters, setColumnFilters] = useState(() => createDefaultColumnFilters());
  const [groupBy, setGroupBy] = useState('');
  const [selectedUids, setSelectedUids] = useState(() => new Set());
  const [showRollCallModal, setShowRollCallModal] = useState(false);
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [openFilterColumn, setOpenFilterColumn] = useState(null);
  const [visibleColumnIds, setVisibleColumnIds] = useState(() => loadVisibleColumns());

  const visibleColumns = useMemo(
    () => getVisibleTableColumns(visibleColumnIds),
    [visibleColumnIds],
  );

  // Checkbox + visible data columns + Actions
  const colSpan = 2 + visibleColumns.length;

  useEffect(() => {
    if (!canViewAllEmployeeProfiles(user)) return;

    const loadEmployees = async () => {
      try {
        setLoading(true);
        setError('');
        const response = await fetch('/api/getEmployeeProfiles', { credentials: 'include' });
        const data = (await readJsonResponse(response)) || {};
        if (!response.ok) throw new Error(data.error || 'Failed to load employees.');
        setEmployees(data.employees || []);
      } catch (err) {
        setError(err.message || 'Failed to load employees.');
      } finally {
        setLoading(false);
      }
    };

    loadEmployees();
  }, [user]);

  useEffect(() => {
    saveVisibleColumns(visibleColumnIds);
  }, [visibleColumnIds]);

  const processedEmployees = useMemo(() => {
    // Keep status (and any other) filters even if that column is hidden.
    const filtered = filterEmployees(employees, { search, columnFilters });
    return sortEmployees(filtered, sortColumn, sortDirection);
  }, [employees, search, columnFilters, sortColumn, sortDirection]);

  const filterOptionsByColumn = useMemo(() => {
    const map = {};
    for (const column of visibleColumns) {
      const otherFilters = createEmptyColumnFilters();
      for (const id of Object.keys(columnFilters)) {
        if (id === column.id) continue;
        otherFilters[id] = columnFilters[id] || [];
      }
      const pool = filterEmployees(employees, { search, columnFilters: otherFilters });
      map[column.id] = collectColumnFilterOptions(pool, column.id);
    }
    return map;
  }, [employees, search, columnFilters, visibleColumns]);

  const groupedEmployees = useMemo(
    () => groupEmployees(processedEmployees, groupBy),
    [processedEmployees, groupBy],
  );

  const selectedEmployees = useMemo(
    () => employees.filter((employee) => selectedUids.has(employee.uid)),
    [employees, selectedUids],
  );

  const visibleUids = processedEmployees.map((employee) => employee.uid);
  const allVisibleSelected = visibleUids.length > 0 && visibleUids.every((uid) => selectedUids.has(uid));

  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection((direction) => (direction === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortColumn(column);
    setSortDirection('asc');
  };

  const handleFilterChange = (column, values) => {
    setColumnFilters((current) => ({ ...current, [column]: values }));
  };

  const closeFilter = () => setOpenFilterColumn(null);

  const toggleColumn = (columnId) => {
    const column = TABLE_COLUMNS.find((item) => item.id === columnId);
    if (column?.locked) return;

    setVisibleColumnIds((current) => {
      if (current.includes(columnId)) {
        return current.filter((id) => id !== columnId);
      }
      return [...current, columnId];
    });
  };

  const resetColumns = () => {
    setVisibleColumnIds([...DEFAULT_VISIBLE_COLUMN_IDS]);
  };

  const toggleSelect = (uid) => {
    setSelectedUids((current) => {
      const next = new Set(current);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  const toggleSelectAllVisible = () => {
    setSelectedUids((current) => {
      const next = new Set(current);
      if (allVisibleSelected) {
        visibleUids.forEach((uid) => next.delete(uid));
      } else {
        visibleUids.forEach((uid) => next.add(uid));
      }
      return next;
    });
  };

  const clearFilters = () => {
    setSearch('');
    setColumnFilters(createDefaultColumnFilters());
    setGroupBy('');
    setOpenFilterColumn(null);
  };

  const hasActiveFilters = Boolean(search.trim() || groupBy)
    || Object.entries(columnFilters).some(([id, selected]) => {
      const values = selected || [];
      if (id === 'status') return !(values.length === 1 && values[0] === 'Active');
      return values.length > 0;
    });

  const tableHeader = (
    <thead>
      <tr className="border-b border-[#1a2540] bg-[#0b1220]">
        <th rowSpan={2} className="px-4 py-3 text-left w-12 align-middle">
          <input
            type="checkbox"
            checked={allVisibleSelected}
            onChange={toggleSelectAllVisible}
            aria-label="Select all visible employees"
            className="w-4 h-4 rounded border-[#1a2540] bg-[#060e1a] text-indigo-500"
          />
        </th>
        {visibleColumns.map((column) => (
          <th
            key={`label-${column.id}`}
            className="px-4 pt-3 pb-1 text-left text-xs font-semibold uppercase tracking-widest text-slate-400"
          >
            <SortButton
              label={column.label}
              column={column.id}
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              onSort={handleSort}
            />
          </th>
        ))}
        <th
          rowSpan={2}
          className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-widest text-slate-400 align-middle"
        >
          Actions
        </th>
      </tr>
      <tr className="border-b border-[#1a2540] bg-[#0b1220]">
        {visibleColumns.map((column) => (
          <th key={`filter-${column.id}`} className="px-4 pt-1 pb-3 text-left align-top">
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
          </th>
        ))}
      </tr>
    </thead>
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 sm:px-8 py-6 border-b border-[#1a2540] gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">Employees</h1>
          <p className="text-sm text-slate-400 mt-1">
            Manage employee profiles, HR records, and portal access
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search employees…"
            className="w-full sm:w-64 bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-4 py-2.5 focus:outline-none focus:border-indigo-500/60"
          />
          <button
            type="button"
            onClick={() => navigate('/dashboard/hr/employees/milestones')}
            className="px-4 py-2.5 rounded-lg border border-[#1a2540] text-slate-200 text-sm font-medium hover:bg-[#0b1220] transition-colors"
          >
            Birthdays and anniversaries
          </button>
          {canViewDisciplinaryMeasures && (
            <>
              <button
                type="button"
                onClick={() => navigate('/dashboard/hr/active-disciplinary-measures')}
                className="px-4 py-2.5 rounded-lg border border-[#1a2540] text-slate-200 text-sm font-medium hover:bg-[#0b1220] transition-colors"
              >
                Active disciplinary measures
              </button>
              <button
                type="button"
                onClick={() => navigate('/dashboard/hr/bonus-deductions')}
                className="px-4 py-2.5 rounded-lg border border-[#1a2540] text-slate-200 text-sm font-medium hover:bg-[#0b1220] transition-colors"
              >
                Bonus deductions
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => navigate('/dashboard/hr/roll-calls')}
            className="px-4 py-2.5 rounded-lg border border-[#1a2540] text-slate-200 text-sm font-medium hover:bg-[#0b1220] transition-colors"
          >
            Roll calls
          </button>
          {isAdmin && (
            <>
              <button
                type="button"
                onClick={() => navigate('/dashboard/hr/employees/duplicates')}
                className="px-4 py-2.5 rounded-lg border border-[#1a2540] text-slate-200 text-sm font-medium hover:bg-[#0b1220] transition-colors"
              >
                Find duplicates
              </button>
              <button
                type="button"
                onClick={() => navigate('/dashboard/portal-access')}
                className="px-4 py-2.5 rounded-lg border border-[#1a2540] text-slate-200 text-sm font-medium hover:bg-[#0b1220] transition-colors"
              >
                Portal matrix
              </button>
              <button
                type="button"
                onClick={() => navigate('/dashboard/hr/employees/new')}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-indigo-500 to-violet-600 text-white text-sm font-semibold hover:from-indigo-600 hover:to-violet-700 transition-all shadow-lg shadow-indigo-500/20"
              >
                <PlusIcon className="w-5 h-5" />
                New employee
              </button>
            </>
          )}
        </div>
      </div>

      <div className="px-4 sm:px-8 py-4 border-b border-[#1a2540] flex items-center justify-between gap-4 flex-wrap bg-[#060e1a]/40">
        <div className="flex items-center gap-3 flex-wrap">
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <span className="text-slate-500">Group by</span>
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value)}
              className="bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-3 py-2"
            >
              {GROUP_BY_OPTIONS.map((option) => (
                <option key={option.value || 'none'} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <div className="relative">
            <button
              type="button"
              onClick={() => setShowColumnPicker((open) => !open)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[#1a2540] text-slate-200 text-sm font-medium hover:bg-[#0b1220] transition-colors"
            >
              <ColumnsIcon className="w-4 h-4" />
              Columns
              <span className="text-xs text-slate-500">{visibleColumns.length}/{TABLE_COLUMNS.length}</span>
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
                  {TABLE_COLUMNS.map((column) => {
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

          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-sm text-indigo-300 hover:text-indigo-200"
            >
              Clear filters
            </button>
          )}
          <span className="text-sm text-slate-500">
            {processedEmployees.length} of {employees.length} shown
            {selectedUids.size > 0 ? ` · ${selectedUids.size} selected` : ''}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setShowRollCallModal(true)}
          disabled={selectedEmployees.length === 0}
          className="px-4 py-2.5 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors"
        >
          Generate roll call
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-slate-400 text-sm">Loading employees…</p>
          </div>
        ) : error ? (
          <div className="p-8">
            <div className="bg-red-500/10 border border-red-500/25 rounded-lg p-4">
              <p className="text-red-300 text-sm">{error}</p>
            </div>
          </div>
        ) : (
          <div className="p-8">
            <div className="overflow-x-auto rounded-lg border border-[#1a2540]">
              <table className="w-full min-w-max">
                {tableHeader}
                <tbody className="divide-y divide-[#1a2540]">
                  {processedEmployees.length === 0 ? (
                    <tr>
                      <td colSpan={colSpan} className="px-6 py-8 text-sm text-slate-500 text-center">
                        No employees match your search and filters.
                      </td>
                    </tr>
                  ) : groupBy ? (
                    groupedEmployees.map((group) => (
                      <GroupSection
                        key={group.key || 'ungrouped'}
                        group={group}
                        selectedUids={selectedUids}
                        onToggleSelect={toggleSelect}
                        onManage={(uid) => navigate(`/dashboard/hr/employees/${uid}`)}
                        visibleColumns={visibleColumns}
                        colSpan={colSpan}
                      />
                    ))
                  ) : (
                    processedEmployees.map((employee) => (
                      <EmployeeRow
                        key={employee.uid}
                        employee={employee}
                        selected={selectedUids.has(employee.uid)}
                        onToggleSelect={toggleSelect}
                        onManage={(uid) => navigate(`/dashboard/hr/employees/${uid}`)}
                        visibleColumns={visibleColumns}
                      />
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {showRollCallModal && (
        <RollCallModal
          employees={selectedEmployees}
          groupBy={groupBy}
          onClose={() => setShowRollCallModal(false)}
        />
      )}
    </div>
  );
}

function GroupSection({
  group,
  selectedUids,
  onToggleSelect,
  onManage,
  visibleColumns,
  colSpan,
}) {
  return (
    <>
      <tr className="bg-[#060e1a]">
        <td colSpan={colSpan} className="px-6 py-3 text-sm font-semibold text-indigo-200">
          {group.label}
          <span className="ml-2 text-slate-500 font-normal">({group.employees.length})</span>
        </td>
      </tr>
      {group.employees.map((employee) => (
        <EmployeeRow
          key={employee.uid}
          employee={employee}
          selected={selectedUids.has(employee.uid)}
          onToggleSelect={onToggleSelect}
          onManage={onManage}
          visibleColumns={visibleColumns}
        />
      ))}
    </>
  );
}
