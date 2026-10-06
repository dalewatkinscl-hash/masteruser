import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { canViewAllEmployeeProfiles } from '../utils/employeeProfile';
import { canManagePeopleCases } from '../utils/peopleCasesAccess';
import { canAccessBonusAdmin } from '../utils/featureAccess';
import PageSpinner from './PageSpinner';

export default function ProtectedRoute({
  children,
  requireAdmin = false,
  requireEmployeeDirectory = false,
  requireCasesManager = false,
  requireBonusAccess = false,
}) {
  const { user, loading } = useAuth();

  // Nested route guards (HR pages) should not replace the whole portal chrome.
  const nestedGuard = requireAdmin || requireEmployeeDirectory || requireCasesManager || requireBonusAccess;

  if (loading) {
    return <PageSpinner fullPage={!nestedGuard} label="Verifying session…" />;
  }
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
  if (requireBonusAccess && !canAccessBonusAdmin(user)) {
    return <Navigate to="/dashboard/profile" replace />;
  }

  return children;
}
