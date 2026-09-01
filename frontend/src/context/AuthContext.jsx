import { createContext, useContext, useEffect, useState, useCallback } from 'react';

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
  const [user, setUser] = useState(null);
  // Start as loading=true so ProtectedRoute shows a spinner instead of flashing /login.
  const [loading, setLoading] = useState(true);

  const refreshSession = useCallback(async () => {
    try {
      const res = await fetch('/api/verifyUserSession', { credentials: 'include' });

      if (res.ok) {
        const data = await readJsonResponse(res);
        setUser(data?.user ?? null);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  return (
    <AuthContext.Provider value={{ user, loading, setUser, refreshSession }}>
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
