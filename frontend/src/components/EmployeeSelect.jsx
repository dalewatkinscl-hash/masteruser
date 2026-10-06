import { useEffect, useMemo, useState } from 'react';

const inputClass = 'w-full bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-3 py-2';

export function isCasesManagerCandidate(employee) {
  const access = employee?.portalsAccess || {};
  if (access.master_admin === 'admin') return true;
  return ['manager', 'hr', 'admin'].includes(access.cases_app);
}

function personId(employee) {
  return String(employee?.uid || employee?.id || '').trim();
}

function labelFor(employee) {
  const name = employee.fullName || employee.email || employee.uid;
  const dept = employee.employeeProfile?.department;
  return dept ? `${name} — ${dept}` : name;
}

/**
 * Searchable person picker. mode: "employees" (active staff) or "managers" (cases-capable).
 * Results appear as a dropdown as you type, matching the manager picker behaviour.
 *
 * allowEmpty: if false, submit validation should reject blank selection — but the user
 * can still clear/change the current person to pick someone else.
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [picked, setPicked] = useState(null);
  const [changing, setChanging] = useState(false);

  // Parent re-prefills (e.g. opening a fresh interview form) — exit change mode.
  useEffect(() => {
    if (value) setChanging(false);
  }, [value]);

  const selected = !changing
    ? (employees.find((employee) => personId(employee) === String(value || '').trim())
      || (picked && personId(picked) === String(value || '').trim() ? picked : null))
    : null;

  // When a value is set externally (e.g. prefill), clear any stale search text.
  const displaySearch = selected ? '' : search;

  const suggestions = useMemo(() => {
    const query = (selected ? '' : search).trim().toLowerCase();
    const selectedId = String(value || '').trim();

    let list = employees.filter((employee) => employee.isActive !== false);
    if (mode === 'managers') {
      list = list.filter(isCasesManagerCandidate);
    }

    list = list.filter((employee) => {
      const id = personId(employee);
      // While searching for a replacement, still exclude the current selection from the list.
      if (selectedId && id === selectedId) return false;
      if (!query) return true;
      const haystack = [
        employee.fullName,
        employee.email,
        employee.employeeProfile?.department,
        employee.employeeProfile?.jobRole,
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(query);
    });

    return list
      .sort((a, b) => (a.fullName || a.email || '').localeCompare(b.fullName || b.email || ''))
      .slice(0, 10);
  }, [employees, mode, search, value, selected]);

  const select = (employee) => {
    const uid = personId(employee);
    if (!uid) return;
    setPicked(employee);
    setChanging(false);
    onChange?.(uid, employee);
    setSearch('');
    setMenuOpen(false);
  };

  const beginChange = () => {
    setChanging(true);
    setSearch('');
    setMenuOpen(true);
    // Clear value so parent form does not keep the old selection while choosing.
    onChange?.('');
  };

  const clear = () => {
    setPicked(null);
    setChanging(false);
    onChange?.('');
    setSearch('');
  };

  return (
    <div className={`space-y-2 ${className}`}>
      {selected ? (
        <div className="flex items-center gap-2 rounded-lg border border-[#1a2540] bg-[#060e1a] px-3 py-2">
          <span className="flex-1 text-sm text-slate-100 truncate">
            {labelFor(selected)}
          </span>
          {!disabled ? (
            <button
              type="button"
              className="text-xs font-medium text-indigo-300 hover:text-indigo-200 shrink-0"
              onClick={beginChange}
            >
              Change
            </button>
          ) : null}
          {!disabled && allowEmpty ? (
            <button
              type="button"
              className="text-slate-500 hover:text-red-300 text-base leading-none"
              onClick={clear}
              aria-label="Clear selection"
            >
              ×
            </button>
          ) : null}
        </div>
      ) : (
        <div className="relative">
          <input
            type="text"
            value={displaySearch || search}
            onChange={(e) => { setSearch(e.target.value); setMenuOpen(true); }}
            onFocus={() => setMenuOpen(true)}
            onBlur={() => window.setTimeout(() => setMenuOpen(false), 200)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (suggestions[0]) select(suggestions[0]);
              }
            }}
            className={inputClass}
            placeholder={loading ? 'Loading staff list…' : 'Click or type a name, email or department'}
            disabled={disabled}
            autoComplete="off"
            role="combobox"
            aria-expanded={menuOpen}
            aria-label={emptyLabel}
          />
          {menuOpen && suggestions.length > 0 && (
            <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-[#1a2540] bg-[#0b1220] shadow-xl py-1">
              {suggestions.map((employee) => (
                <li key={personId(employee) || employee.email}>
                  <button
                    type="button"
                    className="block w-full px-3 py-2 text-left text-sm text-slate-200 hover:bg-[#060e1a]"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      select(employee);
                    }}
                  >
                    <span className="block">{labelFor(employee)}</span>
                    <span className="block text-xs text-slate-500">
                      {employee.email || ''}
                      {employee.employeeProfile?.jobRole ? ` · ${employee.employeeProfile.jobRole}` : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {menuOpen && !loading && employees.length === 0 && (
            <p className="absolute z-20 mt-1 w-full rounded-lg border border-[#1a2540] bg-[#0b1220] px-3 py-2 text-xs text-amber-300 shadow-xl">
              Staff list did not load. Refresh the page and try again.
            </p>
          )}
          {menuOpen && !loading && employees.length > 0 && suggestions.length === 0 && (
            <p className="absolute z-20 mt-1 w-full rounded-lg border border-[#1a2540] bg-[#0b1220] px-3 py-2 text-xs text-amber-300 shadow-xl">
              {mode === 'managers'
                ? 'No People Cases managers match. Grant the People Cases role in the portal matrix.'
                : `No active employees match "${search.trim()}".`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Multi-select for people (employees or managers).
 * value: string[] of uids. onChange(nextUids).
 */
export function EmployeeMultiSelect({
  value = [],
  onChange,
  employees = [],
  loading = false,
  excludeUids = [],
  disabled = false,
  mode = 'employees',
  minSelected = 0,
  emptyHint = 'Add people',
  searchPlaceholder = 'Type a name to search…',
  noneMatchLabel = 'No people match',
}) {
  const [search, setSearch] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);

  const selectedUids = Array.isArray(value) ? value.filter(Boolean) : [];
  const exclude = new Set([...(excludeUids || []), ...selectedUids].map(String));

  const selectedPeople = selectedUids
    .map((uid) => {
      const match = employees.find((employee) => personId(employee) === String(uid));
      return match || { uid, fullName: uid };
    })
    .filter(Boolean);

  const suggestions = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return [];

    let list = employees.filter((employee) => employee.isActive !== false);
    if (mode === 'managers') {
      list = list.filter(isCasesManagerCandidate);
    }
    list = list.filter((employee) => !exclude.has(personId(employee)));
    list = list.filter((employee) => {
      const haystack = [
        employee.fullName,
        employee.email,
        employee.employeeProfile?.department,
        employee.employeeProfile?.jobRole,
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(query);
    });

    return list
      .sort((a, b) => (a.fullName || a.email || '').localeCompare(b.fullName || b.email || ''))
      .slice(0, 8);
  }, [employees, exclude, mode, search]);

  const addUid = (uid) => {
    const next = String(uid || '').trim();
    if (!next || selectedUids.includes(next)) return;
    onChange?.([...selectedUids, next]);
    setSearch('');
    setMenuOpen(false);
  };

  const removeUid = (uid) => {
    onChange?.(selectedUids.filter((item) => item !== uid));
  };

  const shortOfMinimum = minSelected > 0 && selectedUids.length < minSelected;

  return (
    <div className="space-y-2">
      {selectedPeople.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {selectedPeople.map((person) => {
            const uid = personId(person) || person.uid;
            return (
              <li
                key={uid}
                className="inline-flex items-center gap-2 rounded-lg border border-[#1a2540] bg-[#060e1a] px-2.5 py-1.5 text-sm text-slate-200"
              >
                <span>{person.fullName || person.email || uid}</span>
                <button
                  type="button"
                  className="text-slate-500 hover:text-red-300"
                  disabled={disabled}
                  onClick={() => removeUid(uid)}
                  aria-label={`Remove ${person.fullName || uid}`}
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-xs text-slate-500">{emptyHint}</p>
      )}

      <div className="relative">
        <input
          type="search"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setMenuOpen(true);
          }}
          onFocus={() => setMenuOpen(true)}
          onBlur={() => {
            window.setTimeout(() => setMenuOpen(false), 150);
          }}
          className={inputClass}
          placeholder={loading ? 'Loading staff…' : searchPlaceholder}
          disabled={disabled || loading}
          autoComplete="off"
        />
        {menuOpen && search.trim() && !loading && suggestions.length > 0 && (
          <ul className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-[#1a2540] bg-[#0b1220] shadow-xl py-1">
            {suggestions.map((employee) => (
              <li key={personId(employee) || employee.email}>
                <button
                  type="button"
                  className="block w-full px-3 py-2 text-left text-sm text-slate-200 hover:bg-[#060e1a]"
                  onPointerDown={(event) => {
                    event.preventDefault();
                    addUid(personId(employee));
                  }}
                >
                  {labelFor(employee)}
                </button>
              </li>
            ))}
          </ul>
        )}
        {menuOpen && search.trim() && !loading && suggestions.length === 0 && (
          <p className="absolute z-20 mt-1 w-full rounded-lg border border-[#1a2540] bg-[#0b1220] px-3 py-2 text-xs text-amber-300 shadow-xl">
            {noneMatchLabel} &ldquo;{search.trim()}&rdquo;.
          </p>
        )}
      </div>

      {shortOfMinimum && (
        <p className="text-xs text-amber-300">
          Select at least {minSelected} ({selectedUids.length} selected).
        </p>
      )}
    </div>
  );
}

/**
 * Multi-select for managers present at interviews / investigation meetings.
 * value: string[] of uids. onChange(nextUids).
 */
export function ManagerMultiSelect(props) {
  return (
    <EmployeeMultiSelect
      {...props}
      mode="managers"
      minSelected={props.minManagers || 0}
      emptyHint={props.emptyHint || 'Add managers who were present at this meeting'}
      searchPlaceholder={props.loading ? 'Loading managers…' : 'Type a manager name to search…'}
      noneMatchLabel="No managers match"
    />
  );
}
