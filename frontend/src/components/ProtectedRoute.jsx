import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { canViewAllEmployeeProfiles } from '../utils/employeeProfile';
import { canManagePeopleCases } from '../utils/peopleCasesAccess';

function FullPageSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#030712]">
      <div className="flex flex-col items-center gap-4">
        <svg
          className="animate-spin h-8 w-8 text-indigo-500"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
        <p className="text-slate-500 text-sm">Verifying session…</p>
      </div>
    </div>
  );
}

export default function ProtectedRoute({
  children,
  requireAdmin = false,
  requireEmployeeDirectory = false,
  requireCasesManager = false,
}) {
  const { user, loading } = useAuth();

  if (loading) return <FullPageSpinner />;
  if (!user) return <Navigate to="/login" replace />;
  if (requireAdmin && user?.portalsAccess?.master_admin !== 'admin') {
    return <Navigate to="/dashboard/profile" replace />;
  }
  if (requireEmployeeDirectory && !canViewAllEmployeeProfiles(user)) {
    return <Navigate to="/dashboard/profile" replace />;
  }
  if (requireCasesManager && !canManagePeopleCases(user)) {
    return <Navigate to="/dashboard/profile" replace />;
  }

  return children;
}
