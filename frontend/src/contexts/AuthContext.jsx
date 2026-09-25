import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authAPI } from '../lib/api';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

const STAFF_ROLES = [
  'ADMIN', 'EDITORA_BLOG', 'DISTRIBUCION', 'GERENTE_TIENDA',
  'COLABORADOR_TIENDA', 'GERENTE_ALMACEN', 'COLABORADOR_ALMACEN', 'DESARROLLADOR_WEB',
];

const ADMIN_ROLES = ['ADMIN', 'DESARROLLADOR_WEB'];

const STORAGE_KEY = 'gl_auth';

function loadStored() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function persist(data) {
  if (data) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  else sessionStorage.removeItem(STORAGE_KEY);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  const [refreshToken, setRefreshToken] = useState(null);
  const [loading, setLoading] = useState(true);

  const isStaff = user ? STAFF_ROLES.includes(user.rol) : false;
  const isAdmin = user ? ADMIN_ROLES.includes(user.rol) : false;

  const saveSession = useCallback((tokens, userData) => {
    setAccessToken(tokens.accessToken);
    setRefreshToken(tokens.refreshToken);
    setUser(userData);
    persist({ tokens, user: userData });
  }, []);

  const logout = useCallback(async () => {
    try {
      supabase.auth.signOut().catch(() => {});
      if (accessToken && refreshToken) {
        await authAPI.logout(refreshToken, accessToken).catch(() => {});
      }
    } finally {
      setAccessToken(null);
      setRefreshToken(null);
      setUser(null);
      persist(null);
    }
  }, [accessToken, refreshToken]);

  const refreshAccessToken = useCallback(async () => {
    if (!refreshToken) return false;
    try {
      const res = await authAPI.refresh(refreshToken);
      if (res.success) {
        setAccessToken(res.accessToken);
        setRefreshToken(res.refreshToken);
        persist({ tokens: { accessToken: res.accessToken, refreshToken: res.refreshToken }, user });
        return true;
      }
    } catch { /* fallthrough */ }
    await logout();
    return false;
  }, [refreshToken, user, logout]);

  useEffect(() => {
    const stored = loadStored();
    if (stored?.tokens?.accessToken && stored?.user) {
      authAPI.me(stored.tokens.accessToken)
        .then((res) => {
          setAccessToken(stored.tokens.accessToken);
          setRefreshToken(stored.tokens.refreshToken);
          setUser(res.user);
          persist(stored);
        })
        .catch(() => {
          persist(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  return (
    <AuthContext.Provider value={{
      user, accessToken, refreshToken, loading,
      isStaff, isAdmin,
      saveSession, logout, refreshAccessToken,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
