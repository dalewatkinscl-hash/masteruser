import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { canViewAllEmployeeProfiles, readJsonResponse } from '../utils/employeeProfile';
import {
  buildAnniversaryLists,
  buildBirthdayLists,
  buildSpecialBirthdayLists,
  formatDaysUntilLabel,
  formatMilestoneDate,
  UPCOMING_HIGHLIGHT_DAYS,
} from '../utils/milestones';
import { useAuth } from '../context/AuthContext';
import { canManagePortalAccess } from '../utils/portalAccess';

function ChevronLeftIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MilestoneTable({
  title,
  description,
  rows,
  columns,
  showAllLabel,
  onShowAll,
  emptyMessage,
}) {
  return (
    <section className="rounded-xl border border-[#1a2540] bg-[#0b1220] overflow-hidden">
      <div className="px-5 py-4 border-b border-[#1a2540] flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          <p className="text-sm text-slate-400 mt-1">{description}</p>
        </div>
        <button
          type="button"
          onClick={onShowAll}
          className="px-4 py-2 rounded-lg text-sm font-medium border border-indigo-500/40 text-indigo-300 hover:bg-indigo-500/10 transition-colors"
        >
          {showAllLabel}
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#1a2540] bg-[#060e1a]/70">
              {columns.map((column) => (
                <th
                  key={column.key}
                  className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-widest text-slate-400"
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1a2540]">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-5 py-6 text-sm text-slate-500">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.key}
                  className={row.isUpcoming
                    ? 'bg-amber-500/10 hover:bg-amber-500/15 border-l-4 border-amber-400'
                    : 'hover:bg-[#060e1a]'}
                >
                  {columns.map((column) => (
                    <td key={column.key} className="px-5 py-4 text-sm text-slate-200">
                      {column.render(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function EmployeeNameCell({ employee, navigate }) {
  return (
    <button
      type="button"
      onClick={() => navigate(`/dashboard/employees/${employee.uid}`)}
      className="text-left hover:text-indigo-300 transition-colors"
    >
      <span className="font-medium text-white">{employee.fullName || '—'}</span>
      {employee.employeeProfile?.department && (
        <span className="block text-xs text-slate-500 mt-0.5">{employee.employeeProfile.department}</span>
      )}
    </button>
  );
}

function DateCell({ row }) {
  return (
    <div>
      <p className={row.isUpcoming ? 'font-semibold text-amber-100' : 'text-slate-200'}>
        {formatMilestoneDate(row.date)}
      </p>
      <p className={`text-xs mt-0.5 ${row.isUpcoming ? 'text-amber-300 font-medium' : 'text-slate-500'}`}>
        {formatDaysUntilLabel(row.daysUntil)}
      </p>
    </div>
  );
}

export default function BirthdaysAnniversaries() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const view = searchParams.get('view') || 'overview';

  const isAdmin = canManagePortalAccess(user);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sendingAlerts, setSendingAlerts] = useState(false);
  const [alertResult, setAlertResult] = useState('');

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

  const birthdays = useMemo(
    () => buildBirthdayLists(employees.filter((employee) => employee.isActive !== false)),
    [employees],
  );
  const specialBirthdays = useMemo(
    () => buildSpecialBirthdayLists(employees.filter((employee) => employee.isActive !== false)),
    [employees],
  );
  const anniversaries = useMemo(
    () => buildAnniversaryLists(employees.filter((employee) => employee.isActive !== false)),
    [employees],
  );

  const setView = (nextView) => {
    if (nextView === 'overview') {
      setSearchParams({});
      return;
    }
    setSearchParams({ view: nextView });
  };

  const handleRunHrAlerts = async ({ force = false } = {}) => {
    if (force) {
      const confirmed = window.confirm(
        'Resend all due milestone alerts to HR, even if they were already sent?\n\nThis is useful after changing the HR email address.',
      );
      if (!confirmed) return;
    }

    setSendingAlerts(true);
    setAlertResult('');
    setError('');

    try {
      const response = await fetch('/api/adminRunHrMilestoneAlerts', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force }),
      });
      const data = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(data.error || 'Failed to send HR alerts.');

      if (data.skipped) {
        setAlertResult(data.message || 'Alert job skipped — Gmail is not configured.');
      } else if (data.sent === 0) {
        setAlertResult(data.message || 'No milestone alerts are due within the next 30 days.');
      } else {
        const names = (data.alerts || [])
          .map((alert) => alert.employeeName || 'Employee')
          .join(', ');
        setAlertResult(
          `${data.message || `Sent ${data.sent} email(s)`}: ${names}`,
        );
      }
    } catch (err) {
      setError(err.message || 'Failed to send HR alerts.');
    } finally {
      setSendingAlerts(false);
    }
  };

  const birthdayColumns = [
    {
      key: 'name',
      label: 'Name',
      render: (row) => <EmployeeNameCell employee={row.employee} navigate={navigate} />,
    },
    {
      key: 'age',
      label: 'Turning',
      render: (row) => (
        <span className={row.isUpcoming ? 'font-semibold text-amber-100' : ''}>
          {row.ageTurning}
        </span>
      ),
    },
    {
      key: 'date',
      label: 'Date',
      render: (row) => <DateCell row={row} />,
    },
  ];

  const specialBirthdayColumns = [
    {
      key: 'name',
      label: 'Name',
      render: (row) => <EmployeeNameCell employee={row.employee} navigate={navigate} />,
    },
    {
      key: 'milestone',
      label: 'Special birthday',
      render: (row) => (
        <span className={row.isUpcoming ? 'font-semibold text-amber-100' : ''}>
          {row.milestoneAge}
          <span className="text-slate-400 font-normal"> years</span>
        </span>
      ),
    },
    {
      key: 'date',
      label: 'Date',
      render: (row) => <DateCell row={row} />,
    },
  ];

  const anniversaryColumns = [
    {
      key: 'name',
      label: 'Name',
      render: (row) => <EmployeeNameCell employee={row.employee} navigate={navigate} />,
    },
    {
      key: 'years',
      label: 'Anniversary',
      render: (row) => (
        <span className={row.isUpcoming ? 'font-semibold text-amber-100' : ''}>
          {row.yearsServed}
          <span className="text-slate-400 font-normal"> years</span>
        </span>
      ),
    },
    {
      key: 'date',
      label: 'Date',
      render: (row) => <DateCell row={row} />,
    },
  ];

  const mapRows = (entries, prefix) => entries.map((entry) => ({
    ...entry,
    key: `${prefix}-${entry.employee.uid}`,
  }));

  const viewConfig = {
    birthdays: {
      title: 'All birthdays',
      description: `Every employee birthday ordered by the next upcoming date. Highlighted rows are within ${UPCOMING_HIGHLIGHT_DAYS} days.`,
      rows: mapRows(birthdays.all, 'birthday'),
      columns: birthdayColumns,
      emptyMessage: 'No employees have a date of birth on file.',
    },
    special: {
      title: 'All special birthdays',
      description: 'Next milestone birthdays (18, 21, 30, 40, 50, 60, 65, 70, 75, 80, 85, 90, 95, 100) ordered by date.',
      rows: mapRows(specialBirthdays.all, 'special'),
      columns: specialBirthdayColumns,
      emptyMessage: 'No upcoming special birthdays on file.',
    },
    anniversaries: {
      title: 'All work anniversaries',
      description: 'Next milestone anniversaries (10, 15, 20, 25, 30, 35, 40, 45, 50 years) ordered by date.',
      rows: mapRows(anniversaries.all, 'anniversary'),
      columns: anniversaryColumns,
      emptyMessage: 'No upcoming work anniversaries on file.',
    },
  };

  const activeView = viewConfig[view];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-8 py-6 border-b border-[#1a2540] gap-4 flex-wrap">
        <div className="flex items-start gap-4 min-w-0">
          <button
            type="button"
            onClick={() => (activeView ? setView('overview') : navigate('/dashboard/employees'))}
            className="p-1.5 hover:bg-[#1a2540] rounded-lg transition-colors text-slate-400 hover:text-slate-200 flex-shrink-0 mt-1"
            aria-label="Back"
          >
            <ChevronLeftIcon className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-white">
              {activeView ? activeView.title : 'Birthdays and anniversaries'}
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              {activeView
                ? activeView.description
                : 'Upcoming birthdays, milestone ages, and long-service anniversaries'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {!activeView && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-200">
              Rows within {UPCOMING_HIGHLIGHT_DAYS} days are highlighted
            </div>
          )}
          {isAdmin && !activeView && (
            <>
              <button
                type="button"
                onClick={() => handleRunHrAlerts({ force: false })}
                disabled={sendingAlerts || loading}
                className="px-4 py-2.5 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white transition-colors"
              >
                {sendingAlerts ? 'Sending HR alerts…' : 'Send HR alerts now'}
              </button>
              <button
                type="button"
                onClick={() => handleRunHrAlerts({ force: true })}
                disabled={sendingAlerts || loading}
                className="px-4 py-2.5 rounded-lg text-sm font-medium border border-[#1a2540] text-slate-200 hover:bg-[#0b1220] disabled:opacity-50 transition-colors"
              >
                Resend due alerts
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-8">
        {alertResult && (
          <div className="mb-4 bg-emerald-500/10 border border-emerald-500/25 rounded-lg p-4">
            <p className="text-emerald-300 text-sm">{alertResult}</p>
          </div>
        )}
        {loading ? (
          <p className="text-slate-400 text-sm">Loading milestones…</p>
        ) : error ? (
          <div className="bg-red-500/10 border border-red-500/25 rounded-lg p-4">
            <p className="text-red-300 text-sm">{error}</p>
          </div>
        ) : activeView ? (
          <MilestoneTable
            title={activeView.title}
            description={activeView.description}
            rows={activeView.rows}
            columns={activeView.columns}
            showAllLabel="Back to overview"
            onShowAll={() => setView('overview')}
            emptyMessage={activeView.emptyMessage}
          />
        ) : (
          <div className="space-y-6">
            <MilestoneTable
              title="Next birthdays"
              description="The five closest upcoming employee birthdays."
              rows={mapRows(birthdays.next, 'birthday-preview')}
              columns={birthdayColumns}
              showAllLabel="Show all birthdays"
              onShowAll={() => setView('birthdays')}
              emptyMessage="No employees have a date of birth on file."
            />

            <MilestoneTable
              title="Next special birthdays"
              description="Milestone ages: 18, 21, 30, 40, 50, 60, 65, 70, 75, 80, 85, 90, 95, 100."
              rows={mapRows(specialBirthdays.next, 'special-preview')}
              columns={specialBirthdayColumns}
              showAllLabel="Show all special birthdays"
              onShowAll={() => setView('special')}
              emptyMessage="No upcoming special birthdays on file."
            />

            <MilestoneTable
              title="Next work anniversaries"
              description="Milestone service: 10, 15, 20, 25, 30, 35, 40, 45, 50 years."
              rows={mapRows(anniversaries.next, 'anniversary-preview')}
              columns={anniversaryColumns}
              showAllLabel="Show all anniversaries"
              onShowAll={() => setView('anniversaries')}
              emptyMessage="No upcoming work anniversaries on file."
            />
          </div>
        )}
      </div>
    </div>
  );
}
