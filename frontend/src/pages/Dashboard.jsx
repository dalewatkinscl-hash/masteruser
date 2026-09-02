import { useEffect, useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { useAuth } from '../context/AuthContext';
import AmbientBackground from '../components/AmbientBackground';
import ThemeToggle from '../components/ThemeToggle';
import DigitalClock from '../components/DigitalClock';
import KudosWelcomeModal from '../components/KudosWelcomeModal';
import KawaiiDecor from '../components/KawaiiDecor';
import { useTheme } from '../context/ThemeContext';

function MenuIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <line x1="3" y1="6" x2="21" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="3" y1="12" x2="21" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="3" y1="18" x2="21" y2="18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
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

function BookOpenIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4H20v14.5A1.5 1.5 0 0 1 18.5 20H6.5A2.5 2.5 0 0 1 4 17.5v-11Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 8h8M8 12h8M8 16h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M4 17.5A2.5 2.5 0 0 1 6.5 15H20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function SignOutIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M9 6H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="m16 17 4-4m0 0-4-4m4 4H9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function UserCircleIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="12" cy="9" r="3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6.5 19.5a6 6 0 0 1 11 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ShieldIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.35C17.25 22.15 21 17.25 21 12V7l-9-5Z"
        fill="currentColor"
        fillOpacity="0.2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.matchMedia('(min-width: 768px)').matches;
  });

  useEffect(() => {
    const media = window.matchMedia('(min-width: 768px)');
    const onChange = () => setIsDesktop(media.matches);
    onChange();
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  return isDesktop;
}

export default function Dashboard() {
  const isDesktop = useIsDesktop();
  // Mobile: drawer closed by default for full-width content. Desktop: open.
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.matchMedia('(min-width: 768px)').matches;
  });
  const { user, setUser } = useAuth();
  const { isKawaii } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // When switching to mobile, close the drawer so content is full width.
    if (!isDesktop) setSidebarOpen(false);
    else setSidebarOpen(true);
  }, [isDesktop]);

  // Close mobile drawer after in-app navigation.
  useEffect(() => {
    if (!isDesktop) setSidebarOpen(false);
  }, [location.pathname, isDesktop]);

  const handleSignOut = async () => {
    await fetch('/api/logoutPortalUser', { method: 'POST', credentials: 'include' }).catch(() => {});
    await signOut(auth).catch(() => {});
    setUser(null);
    navigate('/login', { replace: true });
  };

  const go = (path) => {
    navigate(path);
    if (!isDesktop) setSidebarOpen(false);
  };

  const isProfileActive = location.pathname.includes('/profile');
  const mentoringRole = user?.portalsAccess?.mentoring_app || user?.portalsAccess?.mentor;
  const hasMentoringAccess = typeof mentoringRole === 'string' && mentoringRole.trim().length > 0;
  const assessmentRole = user?.portalsAccess?.assessment_app;
  const hasAssessmentAccess = typeof assessmentRole === 'string' && assessmentRole.trim().length > 0;
  const routesRole = user?.portalsAccess?.routes_app;
  const hasRoutesAccess = typeof routesRole === 'string' && routesRole.trim().length > 0;
  const hrRole = user?.portalsAccess?.hr_app;
  const hasHrAccess = typeof hrRole === 'string' && hrRole.trim().length > 0;
  const cpcRole = user?.portalsAccess?.cpc_app;
  const hasCpcAccess = typeof cpcRole === 'string' && cpcRole.trim().length > 0;
  const tyreRole = user?.portalsAccess?.tyre_app;
  const hasTyreAccess = typeof tyreRole === 'string' && tyreRole.trim().length > 0;
  const cleaningRole = user?.portalsAccess?.cleaning_app;
  const hasCleaningAccess = typeof cleaningRole === 'string' && cleaningRole.trim().length > 0;
  const complianceRole = user?.portalsAccess?.compliance_app;
  const hasComplianceAccess = typeof complianceRole === 'string' && complianceRole.trim().length > 0;
  const attendanceRole = user?.portalsAccess?.attendance_app;
  const hasAttendanceAccess = typeof attendanceRole === 'string' && attendanceRole.trim().length > 0;
  const trainingRole = user?.portalsAccess?.training_app;
  const hasTrainingAccess = typeof trainingRole === 'string' && trainingRole.trim().length > 0;
  const holidaysRole = user?.portalsAccess?.holidays_app;
  const hasHolidaysAccess = typeof holidaysRole === 'string' && holidaysRole.trim().length > 0;
  const eventsRole = user?.portalsAccess?.events_app;
  const hasEventsAccess = typeof eventsRole === 'string' && eventsRole.trim().length > 0;
  const contractsRole = user?.portalsAccess?.contracts_app;
  const hasContractsAccess = typeof contractsRole === 'string' && contractsRole.trim().length > 0;
  const firstName = (user?.fullName || user?.email || 'there').trim().split(/\s+/)[0];

  const navClass = (active) =>
    `cl-nav-item ${active ? 'cl-nav-item-active' : ''}`;

  const showLabels = isDesktop ? sidebarOpen : true;

  const portalLinks = [
    hasAssessmentAccess && { label: 'Assessment Portal', href: 'https://assessments.countrylion.co.uk' },
    hasAttendanceAccess && { label: 'Attendance', href: 'https://attendance.countrylion.co.uk' },
    hasCpcAccess && { label: 'CPC Portal', href: 'https://cpc.countrylion.co.uk' },
    hasContractsAccess && { label: 'Contracts Portal', href: 'https://contracts.countrylion.co.uk' },
    hasHrAccess && { label: 'Headcount', href: 'https://headcount.countrylion.co.uk' },
    hasMentoringAccess && { label: 'Mentor Portal', href: 'https://mentor.countrylion.co.uk' },
    hasRoutesAccess && { label: 'Routes Portal', href: 'https://routes.countrylion.co.uk' },
    hasTrainingAccess && { label: 'Training', href: 'https://training.countrylion.co.uk' },
    hasHolidaysAccess && { label: 'Holidays', href: 'https://holidays.countrylion.co.uk' },
    hasEventsAccess && { label: 'Events Transport', href: 'https://events.countrylion.co.uk' },
    hasTyreAccess && { label: 'Tyre Tracker', href: 'https://tyres.countrylion.co.uk' },
    hasCleaningAccess && { label: 'Vehicle Cleaning', href: 'https://cleaning.countrylion.co.uk' },
    hasComplianceAccess && { label: 'Weekend Availability', href: 'https://compliance.countrylion.co.uk' },
  ]
    .filter(Boolean)
    .sort((a, b) => a.label.localeCompare(b.label, 'en', { sensitivity: 'base' }));

  const sidebar = (
    <aside
      className={`
        border-r border-cl-border flex flex-col bg-cl-elevated/95 backdrop-blur-xl
        transition-transform duration-300 ease-cl-out
        ${isDesktop
          ? `relative z-10 ${sidebarOpen ? 'w-64' : 'w-20'}`
          : `fixed inset-y-0 left-0 z-50 w-[min(18rem,88vw)] shadow-2xl ${
              sidebarOpen ? 'translate-x-0' : '-translate-x-full'
            }`}
      `}
    >
      <div className="flex items-center justify-between h-16 px-4 border-b border-cl-border">
        {showLabels && (
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-cl-accent flex items-center justify-center flex-shrink-0 shadow-cl-accent">
              <ShieldIcon className="w-5 h-5 text-white" />
            </div>
            <span className="text-sm font-semibold tracking-tight text-cl-fg truncate">Country Lion</span>
          </div>
        )}
        <button
          type="button"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="btn btn-ghost btn-sm btn-square text-base-content/70"
          aria-label={sidebarOpen ? 'Close menu' : 'Open menu'}
        >
          {isDesktop ? <MenuIcon className="w-5 h-5" /> : <CloseIcon className="w-5 h-5" />}
        </button>
      </div>

      <nav className="flex-1 px-3 py-6 space-y-1 overflow-y-auto scrollbar-thin">
        <button type="button" onClick={() => go('/dashboard/profile')} className={navClass(isProfileActive)}>
          <UserCircleIcon className="w-5 h-5 flex-shrink-0" />
          {showLabels && <span>My Profile</span>}
        </button>

        {portalLinks.map((portal) => (
          <a key={portal.href} href={portal.href} className="cl-nav-item">
            <BookOpenIcon className="w-5 h-5 flex-shrink-0" />
            {showLabels && <span>{portal.label}</span>}
          </a>
        ))}
      </nav>

      <div className="px-3 py-4 border-t border-cl-border space-y-3">
        {showLabels && (
          <div className="px-2 py-2 rounded-lg border border-base-300 bg-base-200/50">
            <p className="text-[10px] font-mono uppercase tracking-widest text-base-content/60">Signed in as</p>
            <p className="text-xs font-semibold text-base-content mt-1 truncate">{user?.fullName || user?.email}</p>
          </div>
        )}
        <ThemeToggle showLabel={showLabels} />
        <button
          type="button"
          onClick={handleSignOut}
          className="btn btn-ghost btn-sm w-full justify-start text-error hover:bg-error/10"
        >
          <SignOutIcon className="w-4 h-4 flex-shrink-0" />
          {showLabels && <span>Sign out</span>}
        </button>
      </div>
    </aside>
  );

  return (
    <div className="relative flex h-screen bg-base-100 text-base-content">
      <AmbientBackground />
      {isKawaii && <KawaiiDecor />}

      {!isDesktop && sidebarOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[1px]"
          aria-label="Close menu"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {sidebar}

      <main className="relative z-10 flex-1 min-w-0 overflow-y-auto scrollbar-thin">
        <div className="px-4 sm:px-8 py-3 sm:py-4 border-b border-base-300 bg-base-200/60 backdrop-blur-md flex items-center gap-3">
          {!isDesktop && (
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="btn btn-ghost btn-sm btn-square"
              aria-label="Open menu"
            >
              <MenuIcon className="w-5 h-5" />
            </button>
          )}
          <div className="min-w-0 flex-1 flex items-center gap-3">
            <p className="text-base-content/70 text-sm min-w-0 truncate">
              Hello, <span className="font-semibold text-base-content">{firstName}</span>
            </p>
            <DigitalClock />
          </div>
          <div className="sm:hidden">
            <ThemeToggle showLabel={false} className="!w-auto px-2" />
          </div>
        </div>
        <Outlet />
      </main>
      <KudosWelcomeModal uid={user?.uid} />
    </div>
  );
}
