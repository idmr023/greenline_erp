import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { authAPI } from '../lib/api';
import { supabase } from '../lib/supabase';
import { ADMIN_ROLES, STAFF_ROLES, rolesDe, tieneRol } from '../lib/roles';
import { abilityDe, ABILITY_VACIA } from '../lib/permissions';

const AuthContext = createContext(null);

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

/** Permisos de la sesión: lista `recurso:acción` o `[]` si el servidor no mandó nada. */
function permisosDeRespuesta(res) {
  return Array.isArray(res?.permissions) ? res.permissions : [];
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  const [refreshToken, setRefreshToken] = useState(null);
  const [loading, setLoading] = useState(true);
  // `null` = todavía no se pidieron; `[]` = sin permisos (denegar por defecto).
  const [permissions, setPermissions] = useState(null);

  const isStaff = user ? tieneRol(STAFF_ROLES, rolesDe(user)) : false;
  const isAdmin = user ? tieneRol(ADMIN_ROLES, rolesDe(user)) : false;

  // Ability CASL de la sesión actual (fuente: GET /auth/permissions).
  const ability = useMemo(
    () => (permissions === null ? ABILITY_VACIA : abilityDe(permissions)),
    [permissions],
  );

  /**
   * Carga los permisos de la sesión en el servidor. Se espera su resultado
   * antes de dar por buena la sesión, para que /admin nunca pinte el menú
   * con la ability vacía.
   */
  const cargarPermisos = useCallback(async (token) => {
    if (!token) {
      setPermissions(null);
      return;
    }
    try {
      const res = await authAPI.permissions(token);
      setPermissions(permisosDeRespuesta(res));
    } catch {
      // Fail-closed: sin permisos confirmados no se otorga nada.
      setPermissions([]);
    }
  }, []);

  const saveSession = useCallback(async (tokens, userData) => {
    setAccessToken(tokens.accessToken);
    setRefreshToken(tokens.refreshToken);
    setUser(userData);
    persist({ tokens, user: userData });
    await cargarPermisos(tokens.accessToken);
  }, [cargarPermisos]);

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
      setPermissions(null);
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
        .then(async (res) => {
          setAccessToken(stored.tokens.accessToken);
          setRefreshToken(stored.tokens.refreshToken);
          setUser(res.user);
          persist(stored);
          // En paralelo a nada: se espera aquí para que `loading` cubra
          // también los permisos (la ability no puede llegar tarde al menú).
          await cargarPermisos(stored.tokens.accessToken);
        })
        .catch(() => {
          setPermissions(null);
          persist(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [cargarPermisos]);

  return (
    <AuthContext.Provider value={{
      user, accessToken, refreshToken, loading,
      permissions, ability, permisosListos: permissions !== null,
      isStaff, isAdmin,
      saveSession, logout, refreshAccessToken, cargarPermisos,
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
