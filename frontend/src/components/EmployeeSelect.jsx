import { useMemo, useState } from 'react';

const inputClass = 'w-full bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-3 py-2';

export function isCasesManagerCandidate(employee) {
  const access = employee?.portalsAccess || {};
  if (access.master_admin === 'admin') return true;
  if (['manager', 'hr', 'admin'].includes(access.cases_app)) return true;
  if (['manager', 'admin'].includes(access.hr_app)) return true;
  return false;
}

function labelFor(employee) {
  const name = employee.fullName || employee.email || employee.uid;
  const dept = employee.employeeProfile?.department;
  return dept ? `${name} — ${dept}` : name;
}

/**
 * Searchable person picker. mode: "employees" (active staff) or "managers" (cases-capable).
 */
export default function EmployeeSelect({
  value = '',
  onChange,
  employees = [],
  loading = false,
  mode = 'employees',
  allowEmpty = true,
  emptyLabel = 'Select a person',
  disabled = false,
  className = '',
}) {
  const [search, setSearch] = useState('');

  const options = useMemo(() => {
    const query = search.trim().toLowerCase();
    let list = employees.filter((employee) => employee.isActive !== false);

    if (mode === 'managers') {
      list = list.filter(isCasesManagerCandidate);
    }

    // Keep current value visible even if inactive / not in filtered set.
    if (value) {
      const selected = employees.find((employee) => employee.uid === value);
      if (selected && !list.some((employee) => employee.uid === value)) {
        list = [selected, ...list];
      }
    }

    if (query) {
      list = list.filter((employee) => {
        const haystack = [
          employee.fullName,
          employee.email,
          employee.employeeProfile?.department,
          employee.employeeProfile?.jobRole,
        ].filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(query);
      });
    }

    return list.sort((a, b) => (a.fullName || a.email || '').localeCompare(b.fullName || b.email || ''));
  }, [employees, mode, search, value]);

  const selected = employees.find((employee) => employee.uid === value) || null;

  return (
    <div className={`space-y-2 ${className}`}>
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className={inputClass}
        placeholder="Search by name, email, or department…"
        disabled={disabled || loading}
      />
      <select
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        className={inputClass}
        disabled={disabled || loading}
      >
        {allowEmpty && (
          <option value="">{loading ? 'Loading…' : emptyLabel}</option>
        )}
        {options.map((employee) => (
          <option key={employee.uid} value={employee.uid}>
            {labelFor(employee)}
          </option>
        ))}
      </select>
      {selected && (
        <p className="text-xs text-slate-500">
          {selected.email || 'No email'}
          {selected.employeeProfile?.jobRole ? ` · ${selected.employeeProfile.jobRole}` : ''}
        </p>
      )}
      {!loading && options.length === 0 && (
        <p className="text-xs text-amber-300">
          {mode === 'managers'
            ? 'No People Cases managers match this search. Grant the People Cases role in the portal matrix.'
            : 'No active employees match this search.'}
        </p>
      )}
    </div>
  );
}

/**
 * Multi-select for managers present at interviews / investigation meetings.
 * value: string[] of uids. onChange(nextUids).
 */
export function ManagerMultiSelect({
  value = [],
  onChange,
  employees = [],
  loading = false,
  excludeUids = [],
  disabled = false,
  emptyHint = 'Add managers who were present at this meeting',
}) {
  const selectedUids = Array.isArray(value) ? value.filter(Boolean) : [];
  const exclude = new Set([...(excludeUids || []), ...selectedUids]);

  const selectedPeople = selectedUids
    .map((uid) => employees.find((employee) => employee.uid === uid) || { uid, fullName: uid })
    .filter(Boolean);

  const addUid = (uid) => {
    if (!uid || selectedUids.includes(uid)) return;
    onChange?.([...selectedUids, uid]);
  };

  const removeUid = (uid) => {
    onChange?.(selectedUids.filter((item) => item !== uid));
  };

  return (
    <div className="space-y-2">
      {selectedPeople.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {selectedPeople.map((person) => (
            <li
              key={person.uid}
              className="inline-flex items-center gap-2 rounded-lg border border-[#1a2540] bg-[#060e1a] px-2.5 py-1.5 text-sm text-slate-200"
            >
              <span>{person.fullName || person.email || person.uid}</span>
              <button
                type="button"
                className="text-slate-500 hover:text-red-300"
                disabled={disabled}
                onClick={() => removeUid(person.uid)}
                aria-label={`Remove ${person.fullName || person.uid}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-slate-500">{emptyHint}</p>
      )}
      <EmployeeSelect
        value=""
        onChange={addUid}
        employees={employees.filter((employee) => !exclude.has(employee.uid))}
        loading={loading}
        mode="managers"
        allowEmpty
        emptyLabel="Add another manager…"
        disabled={disabled}
      />
    </div>
  );
}
