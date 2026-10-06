import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { authAPI } from '../lib/api';
import { supabase } from '../lib/supabase';
import { ADMIN_ROLES, STAFF_ROLES, rolesDe, tieneRol } from '../lib/roles';
import { abilityDe, ABILITY_VACIA } from '../lib/permissions';

const AuthContext = createContext(null);

const STORAGE_KEY = 'gl_auth';

/**
 * Duración ABSOLUTA de la sesión del panel: 1 hora desde el login (o desde
 * el último restore de la sesión en esta pestaña). Pasado ese tiempo se
 * cierra sola y hay que volver a entrar con contraseña + código (OTP/2FA).
 *
 * El refresh automático del access token (caduca a los 15 min en el
 * backend) sólo mantiene VIVA la sesión dentro de esta ventana: nunca la
 * alarga. Al caducar se revoca también el refresh token en el servidor.
 */
export const DURACION_SESION_MS = 60 * 60 * 1000;

/** Cada cuánto se renueva el access token dentro de la ventana de 1 hora. */
const RENOVAR_CADA_MS = 10 * 60 * 1000;

/** Instante (epoch ms) en que empezó la sesión actual de ESTA pestaña. */
const CLAVE_INICIO = 'gl_session_inicio';
/** Marca de «la sesión se cerró por caducar» para avisar en /login. */
const CLAVE_AVISO = 'gl_sesion_expirada';

function leerInicio() {
  try {
    const v = Number(sessionStorage.getItem(CLAVE_INICIO));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

function escribirInicio(ms) {
  try {
    sessionStorage.setItem(CLAVE_INICIO, String(ms));
  } catch { /* sin storage no hay sesión que mantener */ }
}

function borrarClavesSesion() {
  try {
    sessionStorage.removeItem(CLAVE_INICIO);
    sessionStorage.removeItem(CLAVE_AVISO);
  } catch { /* noop */ }
}

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
  /** true = la sesión se cerró sola por llegar a la hora (aviso en /login). */
  const [sesionExpirada, setSesionExpirada] = useState(
    () => sessionStorage.getItem(CLAVE_AVISO) === '1',
  );

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
    // Arranque de la ventana de 1 hora. Un login nuevo la reinicia; una
    // renovación (p. ej. /change-password re-guardando la sesión) la respeta.
    if (!leerInicio()) escribirInicio(Date.now());
    try { sessionStorage.removeItem(CLAVE_AVISO); } catch { /* noop */ }
    setSesionExpirada(false);
    await cargarPermisos(tokens.accessToken);
  }, [cargarPermisos]);

  /**
   * Cierre de sesión. `opciones.expirada === true` marca que fue el corte
   * automático de la hora (para el aviso de /login). El primer argumento
   * puede ser un evento de React (`onClick={logout}`): sólo se mira la
   * propiedad `expirada`, así que un evento nunca activa ese modo.
   */
  const logout = useCallback(async (opciones = {}) => {
    const porExpiracion = opciones?.expirada === true;
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
      borrarClavesSesion();
      if (porExpiracion) {
        try { sessionStorage.setItem(CLAVE_AVISO, '1'); } catch { /* noop */ }
        setSesionExpirada(true);
      } else {
        setSesionExpirada(false);
      }
    }
  }, [accessToken, refreshToken]);

  const refreshAccessToken = useCallback(async () => {
    if (!refreshToken) return false;
    // El refresh puede caer por un cold start de Render (fetch abortado):
    // se reintenta antes de tirar la sesión. Un 401/4xx del servidor sí es
    // definitivo (token inválido o rotado): ahí no hay nada que reintentar.
    for (let intento = 0; intento < 3; intento += 1) {
      try {
        const res = await authAPI.refresh(refreshToken);
        if (res.success) {
          setAccessToken(res.accessToken);
          setRefreshToken(res.refreshToken);
          persist({ tokens: { accessToken: res.accessToken, refreshToken: res.refreshToken }, user });
          return true;
        }
        break; // success:false — credenciales de refresh inválidas
      } catch (err) {
        const estado = err?.status;
        if (estado && estado !== 408 && estado < 500) break; // 4xx definitivo
        if (intento < 2) await esperar(2_000 * (intento + 1));
      }
    }
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
          // Sesión heredada sin marca de inicio (despliegue nuevo): se toma
          // AHORA como inicio para no tirar a nadie en el primer arranque.
          if (!leerInicio()) escribirInicio(Date.now());
          // En paralelo a nada: se espera aquí para que `loading` cubra
          // también los permisos (la ability no puede llegar tarde al menú).
          await cargarPermisos(stored.tokens.accessToken);
        })
        .catch(() => {
          setPermissions(null);
          persist(null);
          borrarClavesSesion();
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [cargarPermisos]);

  // Refs para que el temporizador de 1 hora no se reinicie con cada
  // rotación de tokens (refreshAccessToken/logout cambian de identidad en
  // cada refresh, y reiniciar el intervalo anularía la renovación periódica).
  const refrescarRef = useRef(refreshAccessToken);
  const logoutRef = useRef(logout);
  useEffect(() => {
    refrescarRef.current = refreshAccessToken;
    logoutRef.current = logout;
  });

  /**
   * Ventana de 1 hora + renovación del access token (§ sesión).
   *
   *  • Al montar con sesión: si la ventana ya venció, se cierra enseguida
   *    (con el aviso de «sesión caducada» en /login).
   *  • `alCaducar`: corte absoluto a la hora, haya actividad o no.
   *  ·  `intervalo`: renueva el access token (15 min) cada 10 min para que
   *    la sesión NO se rompa antes de la hora, que es el síntoma actual.
   */
  useEffect(() => {
    if (!user) return undefined;

    let inicio = leerInicio();
    if (!inicio) {
      inicio = Date.now();
      escribirInicio(inicio);
    }
    const restante = () => DURACION_SESION_MS - (Date.now() - inicio);

    if (restante() <= 0) {
      void logoutRef.current({ expirada: true });
      return undefined;
    }

    const alCaducar = setTimeout(() => {
      void logoutRef.current({ expirada: true });
    }, restante());

    const intervalo = setInterval(() => {
      if (restante() <= 0) {
        void logoutRef.current({ expirada: true });
        return;
      }
      void refrescarRef.current();
    }, RENOVAR_CADA_MS);

    return () => {
      clearTimeout(alCaducar);
      clearInterval(intervalo);
    };
  }, [user]);

  return (
    <AuthContext.Provider value={{
      user, accessToken, refreshToken, loading,
      permissions, ability, permisosListos: permissions !== null,
      isStaff, isAdmin,
      sesionExpirada, duracionSesionMs: DURACION_SESION_MS,
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
