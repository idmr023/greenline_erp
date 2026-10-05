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
  if (session) return;

  let res = await supabase.auth.signInWithPassword({ email, password });
  if (!res.error) return;

  await authAPI.supabaseSync(password, accessToken);
  res = await supabase.auth.signInWithPassword({ email, password });
  if (res.error) {
    throw new Error(res.error.message || 'No se pudo vincular el acceso de datos');
  }
}
