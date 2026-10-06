import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

export default function NotFound() {
  const { user } = useAuth();
  useDocumentTitle('Page not found');

  return (
    <div className="min-h-screen flex items-center justify-center bg-base-100 px-4">
      <div className="w-full max-w-md text-center space-y-4">
        <p className="text-xs font-mono uppercase tracking-[0.2em] text-primary">404</p>
        <h1 className="text-2xl font-semibold text-base-content">Page not found</h1>
        <p className="text-sm text-base-content/65">
          That address is not part of the Employee Portal. Check the link, or continue from a known page.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
          {user ? (
            <>
              <Link to="/dashboard/profile" className="btn btn-primary btn-sm">
                Back to my profile
              </Link>
              <Link to="/dashboard/hr" className="btn btn-ghost btn-sm">
                HR portal
              </Link>
            </>
          ) : (
            <Link to="/login" className="btn btn-primary btn-sm">
              Sign in
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
