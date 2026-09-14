import { Outlet } from 'react-router-dom';
import HrPortalNav from './HrPortalNav';

/** Shared shell for all /dashboard/hr/* pages. */
export default function HrPortalLayout() {
  return (
    <>
      <HrPortalNav />
      <Outlet />
    </>
  );
}
