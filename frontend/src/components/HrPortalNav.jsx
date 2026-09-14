import { Link, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { canAccessHrDirectory } from '../utils/employeeProfile';
import { canAccessHrCases, canAccessHrPortal } from '../utils/peopleCasesAccess';

/**
 * Sub-nav for the in-app HR portal (directory + People Cases surfaces).
 */
export default function HrPortalNav() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const canDirectory = canAccessHrDirectory(user);
  const canCases = canAccessHrCases(user);

  const items = [
    canDirectory && {
      id: 'employees',
      label: 'Employees',
      to: '/dashboard/hr/employees',
      active: (
        pathname === '/dashboard/hr/employees'
        || (
          pathname.startsWith('/dashboard/hr/employees/')
          && !pathname.includes('/milestones')
          && !pathname.includes('/duplicates')
        )
      ),
    },
    canDirectory && {
      id: 'milestones',
      label: 'Birthdays & anniversaries',
      to: '/dashboard/hr/employees/milestones',
      active: pathname.includes('/employees/milestones'),
    },
    canDirectory && {
      id: 'roll-calls',
      label: 'Roll calls',
      to: '/dashboard/hr/roll-calls',
      active: pathname.includes('/hr/roll-calls'),
    },
    canCases && {
      id: 'cases',
      label: 'People Cases',
      to: '/dashboard/hr/cases',
      active: pathname.includes('/hr/cases'),
    },
    canCases && {
      id: 'measures',
      label: 'Active disciplinary measures',
      to: '/dashboard/hr/active-disciplinary-measures',
      active: pathname.includes('/active-disciplinary-measures'),
    },
    canCases && {
      id: 'bonus',
      label: 'Bonus deductions',
      to: '/dashboard/hr/bonus-deductions',
      active: pathname.includes('/bonus-deductions'),
    },
  ].filter(Boolean);

  if (!items.length) return null;

  return (
    <div className="px-4 sm:px-8 border-b border-cl-border bg-cl-elevated/40">
      <nav className="flex gap-1 overflow-x-auto scrollbar-thin" aria-label="HR portal sections">
        {items.map((item) => (
          <Link
            key={item.id}
            to={item.to}
            className={`relative flex-shrink-0 px-4 py-3 text-sm font-medium transition-colors ${
              item.active ? 'text-cl-fg' : 'text-cl-muted hover:text-cl-fg'
            }`}
          >
            {item.label}
            <span
              className={`absolute left-2 right-2 bottom-0 h-0.5 rounded-full transition-colors ${
                item.active ? 'bg-indigo-500' : 'bg-transparent'
              }`}
            />
          </Link>
        ))}
      </nav>
    </div>
  );
}

/** Landing redirect for /dashboard/hr based on access. */
export function HrPortalLanding() {
  const { user } = useAuth();
  if (!canAccessHrPortal(user)) {
    return <Navigate to="/dashboard/profile" replace />;
  }
  if (canAccessHrDirectory(user)) {
    return <Navigate to="/dashboard/hr/employees" replace />;
  }
  return <Navigate to="/dashboard/hr/cases" replace />;
}
