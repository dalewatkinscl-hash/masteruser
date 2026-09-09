import { useMemo, useState } from 'react';

/**
 * Multi-select employee checklist with search.
 */
export default function RollCallMemberPicker({
  employees = [],
  selectedUids = [],
  onChange,
  loading = false,
  disabled = false,
}) {
  const [search, setSearch] = useState('');
  const selectedSet = useMemo(() => new Set(selectedUids), [selectedUids]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    let list = employees.filter((employee) => employee.isActive !== false);
    if (query) {
      list = list.filter((employee) => {
        const haystack = [
          employee.fullName,
          employee.email,
          employee.employeeProfile?.department,
          employee.employeeProfile?.jobRole,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(query);
      });
    }
    return [...list].sort((left, right) => (
      (left.fullName || left.email || '').localeCompare(right.fullName || right.email || '', undefined, {
        sensitivity: 'base',
      })
    ));
  }, [employees, search]);

  const toggle = (uid) => {
    if (disabled) return;
    const next = new Set(selectedSet);
    if (next.has(uid)) next.delete(uid);
    else next.add(uid);
    onChange([...next]);
  };

  const selectVisible = () => {
    if (disabled) return;
    const next = new Set(selectedSet);
    filtered.forEach((employee) => next.add(employee.uid));
    onChange([...next]);
  };

  const clearAll = () => {
    if (disabled) return;
    onChange([]);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search employees…"
          disabled={disabled || loading}
          className="flex-1 min-w-[12rem] bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-3 py-2"
        />
        <button
          type="button"
          onClick={selectVisible}
          disabled={disabled || loading || filtered.length === 0}
          className="px-3 py-2 rounded-lg text-xs border border-[#1a2540] text-slate-300 hover:bg-[#060e1a] disabled:opacity-40"
        >
          Select visible
        </button>
        <button
          type="button"
          onClick={clearAll}
          disabled={disabled || loading || selectedUids.length === 0}
          className="px-3 py-2 rounded-lg text-xs border border-[#1a2540] text-slate-300 hover:bg-[#060e1a] disabled:opacity-40"
        >
          Clear
        </button>
        <span className="text-xs text-slate-500">
          {selectedUids.length} selected
        </span>
      </div>

      <div className="max-h-80 overflow-auto rounded-lg border border-[#1a2540] divide-y divide-[#1a2540]">
        {loading ? (
          <p className="px-4 py-6 text-sm text-slate-500 text-center">Loading employees…</p>
        ) : filtered.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-500 text-center">No employees match.</p>
        ) : (
          filtered.map((employee) => {
            const checked = selectedSet.has(employee.uid);
            const subtitle = [
              employee.employeeProfile?.jobRole,
              employee.employeeProfile?.department,
            ].filter(Boolean).join(' · ');
            return (
              <label
                key={employee.uid}
                className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-[#060e1a]/50 ${
                  checked ? 'bg-indigo-500/5' : ''
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(employee.uid)}
                  disabled={disabled}
                  className="w-4 h-4 rounded border-[#1a2540] bg-[#060e1a] text-indigo-500"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-slate-100 truncate">
                    {employee.fullName || employee.email || employee.uid}
                  </span>
                  {subtitle && (
                    <span className="block text-xs text-slate-500 truncate">{subtitle}</span>
                  )}
                </span>
              </label>
            );
          })
        )}
      </div>
    </div>
  );
}
