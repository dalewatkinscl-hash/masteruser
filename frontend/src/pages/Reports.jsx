import CountryLionReports, { AccessDenied } from '../components/CountryLionReports';
import { useAuth } from '../context/AuthContext';
import { canAccessFinanceReports } from '../utils/featureAccess';

/**
 * Reports tab host page.
 * Route guard also checks access; this page shows a clear denied state if someone
 * lands on the URL without the Finance reports feature.
 */
export default function Reports() {
  const { user } = useAuth();

  if (!canAccessFinanceReports(user)) {
    return (
      <div className="p-4 sm:p-8">
        <AccessDenied />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-8">
      <CountryLionReports />
    </div>
  );
}
