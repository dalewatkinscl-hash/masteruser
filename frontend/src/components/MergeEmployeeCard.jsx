import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { readJsonResponse } from '../utils/employeeProfile';

function EmployeePreview({ employee, label }) {
  if (!employee) return null;

  return (
    <div className="rounded-lg border border-[#1a2540] bg-[#060e1a] p-4 space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="text-sm font-medium text-white">{employee.fullName || '—'}</p>
      <p className="text-xs text-slate-400">{employee.email || 'No work email'}</p>
      <p className="text-xs text-slate-400">
        {employee.employeeProfile?.jobRole || '—'}
        {employee.employeeProfile?.department ? ` · ${employee.employeeProfile.department}` : ''}
      </p>
      <p className="text-xs text-slate-500">
        {employee.hasPortalAccount === false ? 'HR only' : 'Portal login'}
        {employee.employeeProfile?.phoneNumber ? ` · ${employee.employeeProfile.phoneNumber}` : ''}
      </p>
    </div>
  );
}

function CloseIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export default function MergeEmployeeCard({
  primaryEmployee,
  employees = [],
  onMerged,
  open = false,
  onOpenChange,
}) {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [selectedUid, setSelectedUid] = useState('');
  const [preferredFullName, setPreferredFullName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const candidates = useMemo(() => (
    employees
      .filter((employee) => employee.uid !== primaryEmployee?.uid)
      .filter((employee) => {
        const query = search.trim().toLowerCase();
        if (!query) return true;
        const haystack = [
          employee.fullName,
          employee.email,
          employee.employeeProfile?.jobRole,
          employee.employeeProfile?.department,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(query);
      })
      .slice(0, 12)
  ), [employees, primaryEmployee?.uid, search]);

  const selectedEmployee = employees.find((employee) => employee.uid === selectedUid) || null;

  useEffect(() => {
    if (!open) return;
    setError('');
    setSearch('');
    setSelectedUid('');
  }, [open]);

  useEffect(() => {
    if (!selectedEmployee) {
      setPreferredFullName('');
      return;
    }

    setPreferredFullName(primaryEmployee?.fullName || selectedEmployee.fullName || '');
  }, [primaryEmployee?.fullName, selectedEmployee]);

  const mergeBlockedBecausePortalOnDuplicate = selectedEmployee
    && selectedEmployee.hasPortalAccount !== false
    && primaryEmployee?.hasPortalAccount === false;

  const close = () => {
    if (onOpenChange) onOpenChange(false);
  };

  const handleMerge = async () => {
    if (!primaryEmployee?.uid || !selectedEmployee?.uid) return;

    if (mergeBlockedBecausePortalOnDuplicate) {
      navigate(`/dashboard/employees/${selectedEmployee.uid}`);
      return;
    }

    const confirmed = window.confirm(
      `Merge "${selectedEmployee.fullName || selectedEmployee.email}" into "${preferredFullName || primaryEmployee.fullName}"?\n\nThe duplicate record will be deleted. This cannot be undone.`,
    );
    if (!confirmed) return;

    setSaving(true);
    setError('');

    try {
      const response = await fetch('/api/adminMergeEmployees', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          primaryUid: primaryEmployee.uid,
          secondaryUid: selectedEmployee.uid,
          preferredFullName: preferredFullName.trim(),
        }),
      });
      const data = (await readJsonResponse(response)) || {};
      if (!response.ok) {
        if (data.suggestPrimaryUid && data.suggestSecondaryUid) {
          throw new Error(`${data.error} Open the portal account record to continue.`);
        }
        throw new Error(data.error || 'Failed to merge employees.');
      }

      close();
      if (onMerged) {
        await onMerged(data);
      } else if (data.uid && data.uid !== primaryEmployee.uid) {
        navigate(`/dashboard/employees/${data.uid}`, { replace: true });
      } else {
        window.location.reload();
      }
    } catch (err) {
      setError(err.message || 'Failed to merge employees.');
    } finally {
      setSaving(false);
    }
  };

  if (!primaryEmployee || !open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-black/60 backdrop-blur-[1px]"
        aria-label="Close merge drawer"
        onClick={close}
      />
      <aside className="relative h-full w-full max-w-xl bg-[#0b1220] border-l border-[#1a2540] shadow-2xl flex flex-col animate-in slide-in-from-right">
        <div className="px-5 py-4 border-b border-[#1a2540] flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-white">Merge duplicate</h3>
            <p className="text-sm text-slate-400 mt-1">
              Combine another record into this employee. Empty fields are filled from the duplicate.
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-[#1a2540] transition-colors"
            aria-label="Close"
          >
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto px-5 py-4 space-y-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/25 rounded-lg p-3">
              <p className="text-red-300 text-sm">{error}</p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <EmployeePreview employee={primaryEmployee} label="Keep this record" />
            <EmployeePreview employee={selectedEmployee} label="Duplicate to remove" />
          </div>

          <div>
            <label className="block text-[11px] font-medium uppercase tracking-wider text-slate-500 mb-1">
              Find duplicate
            </label>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, email, department…"
              className="w-full bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-3 py-2"
            />
          </div>

          <div className="max-h-64 overflow-auto rounded-lg border border-[#1a2540] divide-y divide-[#1a2540]">
            {candidates.length === 0 ? (
              <p className="px-4 py-3 text-sm text-slate-500">No matching employees.</p>
            ) : (
              candidates.map((employee) => (
                <label
                  key={employee.uid}
                  className={`flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-[#060e1a] ${
                    selectedUid === employee.uid ? 'bg-indigo-500/10 ring-1 ring-inset ring-indigo-500/40' : ''
                  }`}
                >
                  <input
                    type="radio"
                    name="mergeCandidate"
                    checked={selectedUid === employee.uid}
                    onChange={() => setSelectedUid(employee.uid)}
                    className="mt-1"
                  />
                  <div>
                    <p className="text-sm font-medium text-white">{employee.fullName || '—'}</p>
                    <p className="text-xs text-slate-400">
                      {employee.email || 'No work email'}
                      {employee.hasPortalAccount === false ? ' · HR only' : ' · Portal login'}
                    </p>
                  </div>
                </label>
              ))
            )}
          </div>

          {selectedEmployee && (
            <div>
              <label className="block text-[11px] font-medium uppercase tracking-wider text-slate-500 mb-1">
                Name to keep
              </label>
              <select
                value={preferredFullName}
                onChange={(e) => setPreferredFullName(e.target.value)}
                className="w-full bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-3 py-2"
              >
                {[primaryEmployee.fullName, selectedEmployee.fullName]
                  .filter(Boolean)
                  .filter((name, index, list) => list.indexOf(name) === index)
                  .map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
              </select>
            </div>
          )}

          {mergeBlockedBecausePortalOnDuplicate && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
              <p className="text-amber-200 text-sm">
                The selected duplicate has the portal login. Open that employee and merge this HR-only record into them instead.
              </p>
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-[#1a2540] flex justify-end gap-3">
          <button
            type="button"
            onClick={close}
            className="px-4 py-2.5 rounded-lg text-sm font-medium border border-[#1a2540] text-slate-300 hover:bg-[#060e1a]"
          >
            Cancel
          </button>
          {mergeBlockedBecausePortalOnDuplicate ? (
            <button
              type="button"
              onClick={() => navigate(`/dashboard/employees/${selectedEmployee.uid}`)}
              className="px-5 py-2.5 rounded-lg text-sm font-medium bg-amber-500 hover:bg-amber-400 text-[#1a1200] font-semibold"
            >
              Open portal account
            </button>
          ) : (
            <button
              type="button"
              onClick={handleMerge}
              disabled={saving || !selectedEmployee}
              className="px-5 py-2.5 rounded-lg text-sm font-medium bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white"
            >
              {saving ? 'Merging…' : 'Merge and delete duplicate'}
            </button>
          )}
        </div>
      </aside>
    </div>
  );
}
