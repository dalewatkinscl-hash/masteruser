import { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { normalizePortalTheme, useTheme } from '../context/ThemeContext';

/**
 * Syncs portal theme from the signed-in user profile.
 * Enforced themes lock the toggle; otherwise a saved preference is applied,
 * and an empty preference leaves the user's local/device choice alone.
 */
export default function PortalThemeSync() {
  const { user, loading } = useAuth();
  const { setAssignedTheme } = useTheme();

  useEffect(() => {
    if (loading) return;
    setAssignedTheme(
      normalizePortalTheme(user?.themePreference),
      user?.themeEnforced === true,
    );
  }, [loading, user?.themePreference, user?.themeEnforced, setAssignedTheme]);

  return null;
}
