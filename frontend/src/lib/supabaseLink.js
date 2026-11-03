import { supabase } from './supabase';
import { authAPI } from './api';

/**
 * Vincula la sesión de Supabase Auth del staff usando la misma credencial
 * que acaba de validar el backend (la RLS del panel se evalúa con auth.uid()).
 * Se usa en el login y en /change-password: sin ella AdminPanel monta sin
 * sesión de datos y muestra "No se pudo conectar el panel".
 */
export async function linkSupabase(email, password, accessToken) {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    const refreshed = await supabase.auth.refreshSession();
    if (!refreshed.error && refreshed.data.session) return;
  }

  let res = await supabase.auth.signInWithPassword({ email, password });
  if (!res.error) return;

  await authAPI.supabaseSync(password, accessToken);
  res = await supabase.auth.signInWithPassword({ email, password });
  if (res.error) {
    throw new Error(res.error.message || 'No se pudo vincular el acceso de datos');
  }
}

export async function refreshSupabaseSession() {
  const { data, error } = await supabase.auth.refreshSession();
  if (error) throw new Error(error.message || 'No se pudo renovar la sesión de Supabase');
  if (!data.session) throw new Error('Supabase no devolvió una sesión renovada');
  return data.session;
}

/**
 * Conecta el "panel de datos": deja una sesión de Supabase Auth (rol
 * `authenticated`) para la sesión actual del backend.
 *
 * El RLS del panel se evalúa con auth.uid(), así que sin esta sesión el
 * AdminPanel no monta ("No se pudo conectar el panel"). Con el login en el
 * sitio público, el panel recibe los tokens del backend por el fragmento de
 * traspaso, pero NO la contraseña: por eso la sesión de datos se pide al
 * backend (POST /auth/supabase-session) en vez de firmarse aquí.
 *
 * @param {string|null} accessToken  token de la sesión del backend
 * @returns {Promise<boolean>}  true si hay sesión de datos al final
 */
export async function conectarPanelDatos(accessToken) {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) return true;
  if (!accessToken) return false;

  const res = await authAPI.supabaseSession(accessToken);
  if (!res?.access_token || !res?.refresh_token) {
    throw new Error(res?.error || 'El servidor no devolvió una sesión de datos válida');
  }
  const { error } = await supabase.auth.setSession({
    access_token: res.access_token,
    refresh_token: res.refresh_token,
  });
  if (error) {
    throw new Error(error.message || 'No se pudo conectar con el panel de datos');
  }
  return true;
}
