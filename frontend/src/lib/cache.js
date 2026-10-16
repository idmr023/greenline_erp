/**
 * Caché persistente en localStorage con TTL.
 *
 * Los catálogos se guardan ya normalizados para que las recargas del panel
 * no vuelvan a golpear PostgREST (egress a Supabase). Prefijo con versión
 * para invalidar todo tras un deploy que cambie la forma de los datos.
 */

const CACHE_VERSION = 'v1';
const PREFIX = `gl_cache:${CACHE_VERSION}:`;

export function cacheGet(key, ttlMs) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (typeof ts !== 'number' || Date.now() - ts > ttlMs) {
      // No se borra aquí: un stale de respaldo puede leerla con TTL enorme
      // si la red falla. La sobrescribe el siguiente cacheSet exitoso.
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function cacheSet(key, data) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ ts: Date.now(), data }));
  } catch {
    // Cuota llena o modo privado: la app sigue sin caché, no rompe.
  }
}

export function cacheClear(key) {
  try {
    if (key) {
      localStorage.removeItem(PREFIX + key);
      return;
    }
    const stale = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('gl_cache:')) stale.push(k);
    }
    stale.forEach((k) => localStorage.removeItem(k));
  } catch {
    // noop
  }
}
