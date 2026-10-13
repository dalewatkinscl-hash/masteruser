import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import {
  applyRolePreview,
  canUseRolePreview,
  readStoredRolePreviewId,
  writeStoredRolePreviewId,
} from '../utils/rolePreview';

const AuthContext = createContext(null);

async function readJsonResponse(res) {
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    return null;
  }

  try {
    return await res.json();
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [sessionUser, setSessionUser] = useState(null);
  // Start as loading=true so ProtectedRoute shows a spinner instead of flashing /login.
  const [loading, setLoading] = useState(true);
  const [rolePreviewId, setRolePreviewIdState] = useState(() => readStoredRolePreviewId());

  const refreshSession = useCallback(async () => {
    try {
      const res = await fetch('/api/verifyUserSession', { credentials: 'include' });

      if (res.ok) {
        const data = await readJsonResponse(res);
        setSessionUser(data?.user ?? null);
      } else {
        setSessionUser(null);
      }
    } catch {
      setSessionUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  const canPreviewRoles = canUseRolePreview(sessionUser);

  useEffect(() => {
    if (!canPreviewRoles && rolePreviewId) {
      setRolePreviewIdState('');
      writeStoredRolePreviewId('');
    }
  }, [canPreviewRoles, rolePreviewId]);

  const setRolePreview = useCallback((id) => {
    const next = typeof id === 'string' ? id : '';
    setRolePreviewIdState(next);
    writeStoredRolePreviewId(next);
  }, []);

  const setUser = useCallback((next) => {
    setSessionUser(next);
  }, []);

  const user = useMemo(
    () => applyRolePreview(sessionUser, canPreviewRoles ? rolePreviewId : ''),
    [sessionUser, rolePreviewId, canPreviewRoles],
  );

  const value = useMemo(() => ({
    user,
    realUser: sessionUser,
    loading,
    setUser,
    refreshSession,
    rolePreviewId: canPreviewRoles ? rolePreviewId : '',
    setRolePreview,
    canPreviewRoles,
  }), [
    user,
    sessionUser,
    loading,
    setUser,
    refreshSession,
    rolePreviewId,
    setRolePreview,
    canPreviewRoles,
  ]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);

  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }

  return ctx;
}
