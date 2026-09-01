import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { useAuth } from '../context/AuthContext';

// Handles the shared logout URL: https://employee.countrylion.co.uk/logout
// Any Country Lion sub-app can redirect here to clear the shared SSO cookie.
export default function Logout() {
  const navigate = useNavigate();
  const { setUser } = useAuth();

  useEffect(() => {
    const performLogout = async () => {
      await fetch('/api/logoutPortalUser', { method: 'POST', credentials: 'include' }).catch(() => {});
      await signOut(auth).catch(() => {});
      setUser(null);
      navigate('/login', { replace: true });
    };

    performLogout();
  }, [navigate, setUser]);

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: 'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(99,102,241,0.18) 0%, #030712 60%)' }}
    >
      <p className="text-slate-400 text-sm">Signing you out…</p>
    </div>
  );
}
