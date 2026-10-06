import { useLocation } from 'react-router-dom';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

const TITLE_MAP = [
  { test: (p) => p === '/login', title: 'Sign in' },
  { test: (p) => p === '/logout', title: 'Signed out' },
  { test: (p) => p === '/dashboard/profile', title: 'My profile' },
  { test: (p) => p === '/dashboard/bump-card', title: 'Bump card' },
  { test: (p) => p === '/dashboard/emergency-phone', title: 'Emergency phone' },
  { test: (p) => p === '/dashboard/fun-admin', title: 'Fun admin' },
  { test: (p) => p === '/dashboard/portal-access', title: 'Portal access' },
  { test: (p) => p === '/dashboard/hr' || p === '/dashboard/hr/', title: 'HR portal' },
  { test: (p) => p.startsWith('/dashboard/hr/employees/duplicates'), title: 'Duplicate employees' },
  { test: (p) => p.startsWith('/dashboard/hr/employees/milestones'), title: 'Birthdays & anniversaries' },
  { test: (p) => p === '/dashboard/hr/employees/new', title: 'New employee' },
  { test: (p) => /^\/dashboard\/hr\/employees\/[^/]+$/.test(p), title: 'Employee' },
  { test: (p) => p.startsWith('/dashboard/hr/employees'), title: 'Employees' },
  { test: (p) => p.startsWith('/dashboard/hr/roll-calls'), title: 'Roll calls' },
  { test: (p) => p.startsWith('/dashboard/hr/active-disciplinary'), title: 'Active disciplinaries' },
  { test: (p) => p.startsWith('/dashboard/hr/bonus-deductions'), title: 'Bonus deductions' },
  { test: (p) => p.startsWith('/dashboard/hr/bonus-payments'), title: 'Bonus payments' },
  { test: (p) => p === '/dashboard/hr/cases/new', title: 'New case' },
  { test: (p) => p.startsWith('/dashboard/hr/cases/bump'), title: 'Bump prompt' },
  { test: (p) => /^\/dashboard\/hr\/cases\/[^/]+$/.test(p), title: 'Case' },
  { test: (p) => p.startsWith('/dashboard/hr/cases'), title: 'People cases' },
];

export default function RouteDocumentTitle() {
  const { pathname } = useLocation();
  const match = TITLE_MAP.find((entry) => entry.test(pathname));
  useDocumentTitle(match?.title || (pathname.startsWith('/dashboard') ? 'Dashboard' : null));
  return null;
}
