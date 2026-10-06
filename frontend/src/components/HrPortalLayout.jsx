import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import AppErrorBoundary from './AppErrorBoundary';
import HrPortalNav from './HrPortalNav';

/** Shared shell for all /dashboard/hr/* pages. */
export default function HrPortalLayout() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <>
      <HrPortalNav />
      <AppErrorBoundary
        variant="section"
        resetKey={location.pathname}
        onHome={() => navigate('/dashboard/profile')}
        onRetry={() => navigate(location.pathname, { replace: true })}
      >
        <Outlet />
      </AppErrorBoundary>
    </>
  );
}
