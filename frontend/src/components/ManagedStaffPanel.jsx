import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import YearsOfServiceBadge from './YearsOfServiceBadge';
import { formatDisplayDate, phoneHref, readJsonResponse } from '../utils/employeeProfile';
import { useLanguage } from '../context/LanguageContext';

function ShieldIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.35C17.25 22.15 21 17.25 21 12V7l-9-5Z"
        fill="currentColor"
        fillOpacity="0.15"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function UserGroupIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M23 21v-2a4 4 0 0 0-3-3.87"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M16 3.13a4 4 0 0 1 0 7.75"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
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

function MailIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="4" width="20" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="m2 7 10 7 10-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function CalendarIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ClockIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckCircleIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
      <path d="m9 12 2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CloseIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/** Formats initials for employee avatar. */
function getInitials(name) {
  if (!name) return '??';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Date math helper to add days. */
function addDaysIso(isoDate, days) {
  const d = isoDate ? new Date(`${isoDate}T00:00:00`) : new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function ManagedStaffPanel({ currentUserUid = null, isAdmin = false }) {
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);

  // Search & filter state
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all'); // 'all' | 'direct' | 'covered'
  const [deptFilter, setDeptFilter] = useState('');

  // Temporary cover modal
  const [coverModalOpen, setCoverModalOpen] = useState(false);
  const [coverColleagueUid, setCoverColleagueUid] = useState('');
  const [coverStartDate, setCoverStartDate] = useState('');
  const [coverEndDate, setCoverEndDate] = useState('');
  const [coverReason, setCoverReason] = useState('Annual leave cover');
  const [coverNotes, setCoverNotes] = useState('');
  const [savingCover, setSavingCover] = useState(false);
  const [coverError, setCoverError] = useState('');
  const [coverSuccess, setCoverSuccess] = useState('');

  // Selected staff detail modal
  const [selectedStaff, setSelectedStaff] = useState(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await fetch('/api/getMyManagedStaff', { credentials: 'include' });
      const payload = (await readJsonResponse(res)) || {};

      if (!res.ok) {
        throw new Error(payload.error || 'Failed to load managed staff.');
      }

      setData(payload);

      // Pre-fill default dates for cover if empty
      const today = payload.today || new Date().toISOString().slice(0, 10);
      if (!coverStartDate) setCoverStartDate(today);
      if (!coverEndDate) setCoverEndDate(addDaysIso(today, 7));
    } catch (err) {
      setError(err.message || 'Failed to load managed staff.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [currentUserUid]);

  const handleSetCover = async (e) => {
    e.preventDefault();
    setCoverError('');
    setCoverSuccess('');

    if (!coverColleagueUid) {
      setCoverError('Please select a colleague to act as your temporary cover.');
      return;
    }
    if (!coverStartDate || !coverEndDate) {
      setCoverError('Please select both start and end dates.');
      return;
    }
    if (coverStartDate > coverEndDate) {
      setCoverError('Start date cannot be after end date.');
      return;
    }

    try {
      setSavingCover(true);
      const res = await fetch('/api/setManagerCover', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          coverManagerUid: coverColleagueUid,
          startDate: coverStartDate,
          endDate: coverEndDate,
          reason: coverReason,
          notes: coverNotes,
        }),
      });

      const payload = (await readJsonResponse(res)) || {};
      if (!res.ok) {
        throw new Error(payload.error || 'Failed to save cover arrangement.');
      }

      setCoverSuccess('Temporary cover configured successfully.');
      window.dispatchEvent(new CustomEvent('cl-manager-cover-changed'));
      await loadData();
      setTimeout(() => {
        setCoverModalOpen(false);
        setCoverSuccess('');
      }, 1200);
    } catch (err) {
      setCoverError(err.message || 'Failed to set cover.');
    } finally {
      setSavingCover(false);
    }
  };

  const handleCancelCover = async (coverId) => {
    if (!window.confirm('Are you sure you want to end this cover arrangement early?')) return;

    try {
      setSavingCover(true);
      const res = await fetch('/api/cancelManagerCover', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coverId }),
      });

      const payload = (await readJsonResponse(res)) || {};
      if (!res.ok) {
        throw new Error(payload.error || 'Failed to cancel cover.');
      }

      window.dispatchEvent(new CustomEvent('cl-manager-cover-changed'));
      await loadData();
    } catch (err) {
      alert(err.message || 'Failed to cancel cover.');
    } finally {
      setSavingCover(false);
    }
  };

  // Filter staff list
  const filteredStaff = useMemo(() => {
    if (!data?.allManagedStaff) return [];
    const query = search.trim().toLowerCase();

    return data.allManagedStaff.filter((staff) => {
      if (filterType === 'direct' && staff.isCovered) return false;
      if (filterType === 'covered' && !staff.isCovered) return false;
      if (deptFilter && staff.department !== deptFilter) return false;

      if (!query) return true;
      const haystack = [
        staff.fullName,
        staff.email,
        staff.contactEmail,
        staff.department,
        staff.jobRole,
        staff.phoneNumber,
        staff.coveredFrom?.managerName,
      ].filter(Boolean).join(' ').toLowerCase();

      return haystack.includes(query);
    });
  }, [data, search, filterType, deptFilter]);

  // Unique departments for filter
  const departments = useMemo(() => {
    if (!data?.allManagedStaff) return [];
    const set = new Set();
    data.allManagedStaff.forEach((s) => {
      if (s.department) set.add(s.department);
    });
    return Array.from(set).sort();
  }, [data]);

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400">
        <span className="loading loading-spinner loading-lg text-primary mb-3" />
        <p className="text-sm">Loading your managed staff…</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="p-6 bg-red-500/10 border border-red-500/30 rounded-xl text-red-200">
        <h3 className="font-semibold text-base mb-1">Could not load managed staff</h3>
        <p className="text-sm opacity-90">{error}</p>
        <button
          type="button"
          onClick={loadData}
          className="mt-4 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 rounded-lg text-xs font-semibold text-white"
        >
          Try Again
        </button>
      </div>
    );
  }

  const {
    totalCount = 0,
    directCount = 0,
    coveredCount = 0,
    activeOutgoingCover,
    scheduledOutgoingCovers = [],
    activeIncomingCovers = [],
    outgoingCovers = [],
    availableCoverColleagues = [],
  } = data || {};

  return (
    <div className="w-full pt-4 sm:pt-6 px-4 sm:px-8 pb-12 space-y-6">
      {/* Top Banner / Actions Header */}
      <div className="bg-[#0b1220] border border-[#1a2540] rounded-2xl p-5 sm:p-6 shadow-xl relative overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 relative z-10">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <span className="p-2 rounded-xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-400">
                <UserGroupIcon className="w-5 h-5" />
              </span>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
                Managed Staff
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                {totalCount} {totalCount === 1 ? 'employee' : 'employees'}
              </span>
            </div>
            <p className="text-sm text-slate-400 max-w-2xl">
              Overview of your team members, reporting structures, and temporary manager cover assignments.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setCoverError('');
                setCoverSuccess('');
                setCoverModalOpen(true);
              }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] text-white shadow-lg shadow-indigo-600/20 transition-all"
            >
              <ShieldIcon className="w-4 h-4" />
              {activeOutgoingCover ? 'Manage Cover Arrangement' : 'Configure Temporary Cover'}
            </button>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-5 border-t border-[#1a2540]/80">
          <div className="bg-[#060e1a]/60 border border-[#1a2540] rounded-xl p-3.5">
            <p className="text-[11px] font-mono uppercase tracking-wider text-slate-400">Total Staff</p>
            <p className="text-2xl font-bold text-white mt-1">{totalCount}</p>
          </div>
          <div className="bg-[#060e1a]/60 border border-[#1a2540] rounded-xl p-3.5">
            <p className="text-[11px] font-mono uppercase tracking-wider text-slate-400">Direct Staff</p>
            <p className="text-2xl font-bold text-emerald-400 mt-1">{directCount}</p>
          </div>
          <div className="bg-[#060e1a]/60 border border-[#1a2540] rounded-xl p-3.5">
            <p className="text-[11px] font-mono uppercase tracking-wider text-slate-400">Covering Staff</p>
            <p className="text-2xl font-bold text-sky-400 mt-1">{coveredCount}</p>
          </div>
          <div className="bg-[#060e1a]/60 border border-[#1a2540] rounded-xl p-3.5">
            <p className="text-[11px] font-mono uppercase tracking-wider text-slate-400">Cover Status</p>
            <p className="text-sm font-medium mt-2">
              {activeOutgoingCover ? (
                <span className="text-amber-300 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                  Covered by {activeOutgoingCover.coverManagerName.split(' ')[0]}
                </span>
              ) : activeIncomingCovers.length > 0 ? (
                <span className="text-indigo-300 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
                  Acting Line Manager
                </span>
              ) : (
                <span className="text-slate-400">No active cover</span>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Active Incoming Cover Alert (You are acting line manager for someone else) */}
      {activeIncomingCovers.map((cov) => (
        <div
          key={cov.id}
          className="bg-indigo-950/40 border border-indigo-500/40 rounded-xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4 text-indigo-100 shadow-lg"
        >
          <div className="flex items-start gap-3.5 min-w-0">
            <div className="p-2.5 rounded-xl bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 shrink-0">
              <ShieldIcon className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold uppercase bg-indigo-500/25 text-indigo-200 border border-indigo-400/30">
                  Acting Line Manager
                </span>
                <span className="text-sm font-bold text-white">
                  Covering for {cov.managerName}
                </span>
              </div>
              <p className="text-xs text-indigo-200/90 leading-relaxed">
                You are currently acting as line manager for {cov.managerName}&apos;s staff from{' '}
                <strong>{formatDisplayDate(cov.startDate)}</strong> to{' '}
                <strong>{formatDisplayDate(cov.endDate)}</strong>.
                {cov.reason && <span className="text-indigo-300"> ({cov.reason})</span>}
              </p>
            </div>
          </div>
        </div>
      ))}

      {/* Active Outgoing Cover Alert (Someone is covering for you) */}
      {activeOutgoingCover && (
        <div className="bg-amber-950/30 border border-amber-500/40 rounded-xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4 text-amber-100 shadow-lg">
          <div className="flex items-start gap-3.5 min-w-0">
            <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0">
              <ClockIcon className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold uppercase bg-amber-500/25 text-amber-200 border border-amber-400/30">
                  Temporary Cover Active
                </span>
                <span className="text-sm font-bold text-white">
                  {activeOutgoingCover.coverManagerName} is covering your staff
                </span>
              </div>
              <p className="text-xs text-amber-200/90 leading-relaxed">
                Cover period: <strong>{formatDisplayDate(activeOutgoingCover.startDate)}</strong> to{' '}
                <strong>{formatDisplayDate(activeOutgoingCover.endDate)}</strong>.
                {activeOutgoingCover.reason && <span> Reason: {activeOutgoingCover.reason}.</span>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={savingCover}
              onClick={() => handleCancelCover(activeOutgoingCover.id)}
              className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/30 transition-colors"
            >
              End Cover Early
            </button>
          </div>
        </div>
      )}

      {/* Scheduled Outgoing Cover Alerts */}
      {scheduledOutgoingCovers.map((cov) => (
        <div
          key={cov.id}
          className="bg-slate-900/60 border border-slate-700/60 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 text-slate-300"
        >
          <div className="flex items-center gap-2 text-xs">
            <CalendarIcon className="w-4 h-4 text-slate-400" />
            <span>
              Upcoming cover scheduled: <strong>{cov.coverManagerName}</strong> will cover your staff from{' '}
              <strong>{formatDisplayDate(cov.startDate)}</strong> to{' '}
              <strong>{formatDisplayDate(cov.endDate)}</strong>.
            </span>
          </div>
          <button
            type="button"
            disabled={savingCover}
            onClick={() => handleCancelCover(cov.id)}
            className="text-xs text-rose-400 hover:text-rose-300 font-medium"
          >
            Cancel schedule
          </button>
        </div>
      ))}

      {/* Filter and Search Rail */}
      <div className="bg-[#0b1220] border border-[#1a2540] rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setFilterType('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filterType === 'all'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-[#060e1a] text-slate-400 hover:text-white border border-[#1a2540]'
            }`}
          >
            All Staff ({totalCount})
          </button>
          <button
            type="button"
            onClick={() => setFilterType('direct')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filterType === 'direct'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-[#060e1a] text-slate-400 hover:text-white border border-[#1a2540]'
            }`}
          >
            Direct Staff ({directCount})
          </button>
          {coveredCount > 0 && (
            <button
              type="button"
              onClick={() => setFilterType('covered')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filterType === 'covered'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-[#060e1a] text-slate-400 hover:text-white border border-[#1a2540]'
              }`}
            >
              Covered Staff ({coveredCount})
            </button>
          )}
          {departments.length > 1 && (
            <select
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              className="bg-[#060e1a] border border-[#1a2540] text-slate-300 text-xs rounded-lg px-2.5 py-1.5"
            >
              <option value="">All Departments</option>
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="w-full sm:w-64">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search team members…"
            className="w-full bg-[#060e1a] border border-[#1a2540] text-slate-200 text-xs rounded-lg px-3 py-1.5 focus:border-indigo-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Staff Grid */}
      {filteredStaff.length === 0 ? (
        <div className="bg-[#0b1220] border border-[#1a2540] rounded-2xl p-12 text-center text-slate-400">
          <UserGroupIcon className="w-12 h-12 mx-auto text-slate-600 mb-3" />
          <h3 className="text-base font-semibold text-white">No managed staff found</h3>
          <p className="text-xs text-slate-500 mt-1">
            {search
              ? `No staff members matched "${search}". Try clearing your search.`
              : 'You do not currently have any staff assigned to you.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredStaff.map((staff) => (
            <div
              key={staff.uid}
              className={`bg-[#0b1220] border rounded-2xl p-5 shadow-lg transition-all hover:border-[#2a3a60] flex flex-col justify-between ${
                staff.isCovered
                  ? 'border-indigo-500/30 bg-gradient-to-b from-indigo-950/20 to-[#0b1220]'
                  : 'border-[#1a2540]'
              }`}
            >
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-700 text-white font-bold text-sm flex items-center justify-center shrink-0 shadow-md">
                      {getInitials(staff.fullName)}
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-white truncate">{staff.fullName}</h3>
                      <p className="text-xs text-slate-400 truncate mt-0.5">
                        {[staff.jobRole, staff.department].filter(Boolean).join(' · ') || 'Staff Member'}
                      </p>
                    </div>
                  </div>
                  {staff.isCovered ? (
                    <span
                      title={`Covering for ${staff.coveredFrom?.managerName}`}
                      className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-indigo-500/20 text-indigo-300 border border-indigo-400/30 shrink-0"
                    >
                      Covered
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-emerald-500/15 text-emerald-300 border border-emerald-500/25 shrink-0">
                      Direct
                    </span>
                  )}
                </div>

                {staff.isCovered && staff.coveredFrom && (
                  <div className="bg-indigo-950/30 border border-indigo-500/20 rounded-lg px-2.5 py-1.5 text-[11px] text-indigo-200 flex items-center justify-between gap-2">
                    <span className="truncate">Covering for: <strong>{staff.coveredFrom.managerName}</strong></span>
                    <span className="text-[10px] text-indigo-300 shrink-0">
                      until {formatDisplayDate(staff.coveredFrom.endDate)}
                    </span>
                  </div>
                )}

                <div className="space-y-2 text-xs text-slate-300 pt-1">
                  {staff.contactEmail && (
                    <div className="flex items-center gap-2 truncate">
                      <MailIcon className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <a
                        href={`mailto:${staff.contactEmail}`}
                        className="truncate hover:text-indigo-300 transition-colors"
                      >
                        {staff.contactEmail}
                      </a>
                    </div>
                  )}
                  {staff.phoneNumber && (
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 truncate">
                        <PhoneIcon className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <span className="font-mono text-[11px]">{staff.phoneNumber}</span>
                      </div>
                      <a
                        href={phoneHref(staff.phoneNumber)}
                        className="btn btn-xs btn-outline btn-success gap-1 text-[10px] py-0 px-2 h-6 min-h-0"
                      >
                        Call
                      </a>
                    </div>
                  )}
                  {staff.startDate && (
                    <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-[#1a2540]">
                      <span>Started: {formatDisplayDate(staff.startDate)}</span>
                      <YearsOfServiceBadge startDate={staff.startDate} />
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-[#1a2540] flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedStaff(staff)}
                  className="w-full py-2 rounded-lg text-xs font-semibold bg-[#111c30] hover:bg-[#162540] text-indigo-300 border border-[#1a2540] transition-colors text-center"
                >
                  View Details & Contact
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Team Workflows & Notifications Section (Built for upcoming workflows) */}
      <div className="bg-[#0b1220] border border-[#1a2540] rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
              <CheckCircleIcon className="w-5 h-5" />
            </span>
            <div>
              <h2 className="text-base font-bold text-white">Team Workflows & Notifications</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Approvals, appraisals, and management workflow items for your staff.
              </p>
            </div>
          </div>
          <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            All up to date
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          <div className="bg-[#060e1a] border border-[#1a2540] rounded-xl p-4 space-y-2">
            <p className="text-xs font-semibold text-slate-200">Pending Approvals</p>
            <p className="text-xs text-slate-400 leading-relaxed">
              No pending holiday requests or workflow approvals awaiting your sign-off.
            </p>
          </div>
          <div className="bg-[#060e1a] border border-[#1a2540] rounded-xl p-4 space-y-2">
            <p className="text-xs font-semibold text-slate-200">Team Appraisals</p>
            <p className="text-xs text-slate-400 leading-relaxed">
              Staff appraisals and performance reviews are logged under HR employee records.
            </p>
          </div>
          <div className="bg-[#060e1a] border border-[#1a2540] rounded-xl p-4 space-y-2">
            <p className="text-xs font-semibold text-slate-200">Active Supervision</p>
            <p className="text-xs text-slate-400 leading-relaxed">
              When temporary cover is active, workflow requests from covered staff will route directly to you.
            </p>
          </div>
        </div>
      </div>

      {/* Staff Details Modal */}
      {selectedStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-[#0b1220] border border-[#1a2540] rounded-2xl max-w-lg w-full p-6 shadow-2xl relative space-y-5 animate-in fade-in duration-200">
            <div className="flex items-start justify-between gap-4 border-b border-[#1a2540] pb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-700 text-white font-bold text-base flex items-center justify-center shadow-lg">
                  {getInitials(selectedStaff.fullName)}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">{selectedStaff.fullName}</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {[selectedStaff.jobRole, selectedStaff.department].filter(Boolean).join(' · ')}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedStaff(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
              >
                <CloseIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="bg-[#060e1a] border border-[#1a2540] rounded-xl p-3.5">
                <p className="text-[10px] font-mono uppercase tracking-wider text-slate-500 mb-1">Work Email</p>
                <p className="text-slate-200 break-all">{selectedStaff.email || '—'}</p>
              </div>
              <div className="bg-[#060e1a] border border-[#1a2540] rounded-xl p-3.5">
                <p className="text-[10px] font-mono uppercase tracking-wider text-slate-500 mb-1">Contact Email</p>
                <p className="text-slate-200 break-all">{selectedStaff.contactEmail || selectedStaff.email || '—'}</p>
              </div>
              <div className="bg-[#060e1a] border border-[#1a2540] rounded-xl p-3.5">
                <p className="text-[10px] font-mono uppercase tracking-wider text-slate-500 mb-1">Phone Number</p>
                <div className="flex items-center justify-between gap-2 mt-1">
                  <p className="text-slate-200 font-mono">{selectedStaff.phoneNumber || '—'}</p>
                  {selectedStaff.phoneNumber && (
                    <a
                      href={phoneHref(selectedStaff.phoneNumber)}
                      className="btn btn-xs btn-outline btn-success"
                    >
                      Call
                    </a>
                  )}
                </div>
              </div>
              <div className="bg-[#060e1a] border border-[#1a2540] rounded-xl p-3.5">
                <p className="text-[10px] font-mono uppercase tracking-wider text-slate-500 mb-1">Start Date</p>
                <p className="text-slate-200">{formatDisplayDate(selectedStaff.startDate) || '—'}</p>
              </div>
              {selectedStaff.isCovered && selectedStaff.coveredFrom && (
                <div className="sm:col-span-2 bg-indigo-950/40 border border-indigo-500/30 rounded-xl p-3.5 text-indigo-100">
                  <p className="text-[10px] font-mono uppercase tracking-wider text-indigo-300 mb-1">
                    Temporary Cover Arrangement
                  </p>
                  <p className="text-xs">
                    Primary Line Manager: <strong>{selectedStaff.coveredFrom.managerName}</strong>
                  </p>
                  <p className="text-xs text-indigo-200/80 mt-0.5">
                    Cover Period: {formatDisplayDate(selectedStaff.coveredFrom.startDate)} to{' '}
                    {formatDisplayDate(selectedStaff.coveredFrom.endDate)}
                    {selectedStaff.coveredFrom.reason ? ` · ${selectedStaff.coveredFrom.reason}` : ''}
                  </p>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setSelectedStaff(null)}
                className="px-4 py-2 rounded-lg text-xs font-medium bg-[#060e1a] hover:bg-[#162540] text-slate-300 border border-[#1a2540]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Configure Temporary Cover Modal */}
      {coverModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="bg-[#0b1220] border border-[#1a2540] rounded-2xl max-w-xl w-full p-6 shadow-2xl relative space-y-5 animate-in fade-in duration-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-4 border-b border-[#1a2540] pb-4">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <ShieldIcon className="w-5 h-5 text-indigo-400" />
                  Configure Temporary Cover
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Reassign line management of your staff to a colleague for a fixed period (e.g. while on holiday).
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCoverModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
              >
                <CloseIcon className="w-5 h-5" />
              </button>
            </div>

            {/* If currently covered */}
            {activeOutgoingCover && (
              <div className="bg-amber-950/30 border border-amber-500/30 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-amber-200">
                    Active Cover: {activeOutgoingCover.coverManagerName}
                  </span>
                  <button
                    type="button"
                    disabled={savingCover}
                    onClick={() => handleCancelCover(activeOutgoingCover.id)}
                    className="px-3 py-1 rounded text-xs font-semibold bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-500/30"
                  >
                    End Cover Now
                  </button>
                </div>
                <p className="text-xs text-amber-200/80">
                  Currently active from {formatDisplayDate(activeOutgoingCover.startDate)} to{' '}
                  {formatDisplayDate(activeOutgoingCover.endDate)}.
                </p>
              </div>
            )}

            {coverError && (
              <div className="p-3 bg-red-500/15 border border-red-500/30 rounded-lg text-xs text-red-200">
                {coverError}
              </div>
            )}
            {coverSuccess && (
              <div className="p-3 bg-emerald-500/15 border border-emerald-500/30 rounded-lg text-xs text-emerald-200">
                {coverSuccess}
              </div>
            )}

            <form onSubmit={handleSetCover} className="space-y-4">
              <div>
                <label className="block text-[11px] font-medium uppercase tracking-wider text-slate-400 mb-1">
                  Cover Manager (Colleague)
                </label>
                <select
                  required
                  value={coverColleagueUid}
                  onChange={(e) => setCoverColleagueUid(e.target.value)}
                  className="w-full bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-3 py-2.5 focus:border-indigo-500 focus:outline-none"
                >
                  <option value="">Select a manager to cover your staff…</option>
                  {availableCoverColleagues.map((colleague) => (
                    <option key={colleague.uid} value={colleague.uid}>
                      {colleague.fullName}
                      {colleague.department ? ` — ${colleague.department}` : ''}
                      {colleague.jobRole ? ` (${colleague.jobRole})` : ''}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1.5">
                  <span>🛡️</span>
                  <span>Only employees with <strong>Management status</strong> can be designated as line manager cover.</span>
                </p>
                {availableCoverColleagues.length === 0 && (
                  <p className="text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1.5 rounded mt-2">
                    No other colleagues with management status were found. HR administrators can grant Management status on employee profiles.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-medium uppercase tracking-wider text-slate-400 mb-1">
                    Start Date
                  </label>
                  <input
                    type="date"
                    required
                    value={coverStartDate}
                    onChange={(e) => setCoverStartDate(e.target.value)}
                    className="w-full bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium uppercase tracking-wider text-slate-400 mb-1">
                    End Date
                  </label>
                  <input
                    type="date"
                    required
                    value={coverEndDate}
                    onChange={(e) => setCoverEndDate(e.target.value)}
                    className="w-full bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-3 py-2"
                  />
                </div>
              </div>

              {/* Quick preset buttons for duration */}
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-500">Presets:</span>
                <button
                  type="button"
                  onClick={() => setCoverEndDate(addDaysIso(coverStartDate, 7))}
                  className="px-2.5 py-1 rounded bg-[#060e1a] hover:bg-[#162540] border border-[#1a2540] text-slate-300"
                >
                  1 Week
                </button>
                <button
                  type="button"
                  onClick={() => setCoverEndDate(addDaysIso(coverStartDate, 14))}
                  className="px-2.5 py-1 rounded bg-[#060e1a] hover:bg-[#162540] border border-[#1a2540] text-slate-300"
                >
                  2 Weeks
                </button>
                <button
                  type="button"
                  onClick={() => setCoverEndDate(addDaysIso(coverStartDate, 30))}
                  className="px-2.5 py-1 rounded bg-[#060e1a] hover:bg-[#162540] border border-[#1a2540] text-slate-300"
                >
                  1 Month
                </button>
              </div>

              <div>
                <label className="block text-[11px] font-medium uppercase tracking-wider text-slate-400 mb-1">
                  Reason / Handover Note
                </label>
                <input
                  type="text"
                  value={coverReason}
                  onChange={(e) => setCoverReason(e.target.value)}
                  placeholder="e.g. Annual leave, Holiday cover, Training"
                  className="w-full bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-3 py-2"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium uppercase tracking-wider text-slate-400 mb-1">
                  Private Handover Notes (Optional)
                </label>
                <textarea
                  rows={2}
                  value={coverNotes}
                  onChange={(e) => setCoverNotes(e.target.value)}
                  placeholder="Notes for the cover manager or record keeping…"
                  className="w-full bg-[#060e1a] border border-[#1a2540] text-slate-100 text-xs rounded-lg px-3 py-2"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-[#1a2540]">
                <button
                  type="button"
                  onClick={() => setCoverModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-xs font-medium bg-[#060e1a] hover:bg-[#162540] text-slate-300 border border-[#1a2540]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingCover}
                  className="px-5 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg disabled:opacity-50"
                >
                  {savingCover ? 'Activating Cover…' : 'Activate Cover'}
                </button>
              </div>
            </form>

            {/* Past covers history */}
            {outgoingCovers.length > 0 && (
              <div className="pt-4 border-t border-[#1a2540] space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Cover History
                </h4>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {outgoingCovers.map((cov) => (
                    <div
                      key={cov.id}
                      className="bg-[#060e1a] border border-[#1a2540] rounded-lg p-2.5 text-xs flex items-center justify-between text-slate-300"
                    >
                      <div>
                        <p className="font-semibold text-white">Cover: {cov.coverManagerName}</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {formatDisplayDate(cov.startDate)} – {formatDisplayDate(cov.endDate)} · {cov.reason}
                        </p>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                          cov.status === 'active'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : cov.status === 'cancelled'
                            ? 'bg-rose-500/20 text-rose-300'
                            : 'bg-slate-700/50 text-slate-400'
                        }`}
                      >
                        {cov.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
