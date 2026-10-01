/**
 * URL base de la API (Bóveda Segura V5 §39 / R7).
 *
 * Fail-closed: si en un build de producción no hay VITE_API_URL, NO se
 * arranca la app. El fallback a localhost sólo se tolera en desarrollo,
 * porque en un sitio publicado apuntaría al puerto 3000 de la máquina del
 * visitante y podría filtrar credenciales a un servicio local ajeno.
 */
function resolverApiUrl() {
  const crudo = import.meta.env.VITE_API_URL;
  const url = typeof crudo === 'string' ? crudo.trim().replace(/\/+$/, '') : '';

  if (url) {
    if (!/^https?:\/\/[^\s]+$/i.test(url)) {
      throw new Error('VITE_API_URL no es una URL http(s) válida.');
    }
    return url;
  }

  if (import.meta.env.PROD) {
    throw new Error(
      'VITE_API_URL no está definida: la app no puede arrancar en producción sin la URL de la API.',
    );
  }

  return 'http://localhost:3000/api';
}

export const API_URL = resolverApiUrl();

// Umbral (ms) sobre el cual un fetch se considera "cold start" (Render dormido)
export const COLD_START_THRESHOLD_MS = 1200;

// Instrumentación de rendimiento: expone la latencia medida de cada petición
// para diagnosticar el ahorro de tiempo entre cold-start y warm.
export const apiPerf = {
  coldStart: false,
  lastLatency: 0,
  samples: [], // { path, method, ms, at }
};

function emitColdStart(detail) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('gl:coldstart', { detail }));
  }
}

let slowTimer = null;

const DEFAULT_TIMEOUT_MS = 30_000;

async function request(path, options = {}) {
  const { method, body, headers, timeout } = options;
  const started = performance.now();
  const timeoutMs = timeout ?? DEFAULT_TIMEOUT_MS;

  // Si tras el umbral la respuesta no ha llegado, asumimos Render dormido
  // y avisamos para mostrar banner + skeleton ("Despertando sistema...").
  if (slowTimer) clearTimeout(slowTimer);
  slowTimer = window.setTimeout(() => {
    const ms = Math.round(performance.now() - started);
    apiPerf.coldStart = true;
    emitColdStart({ coldStart: true, latency: ms, path });
  }, COLD_START_THRESHOLD_MS);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  let data;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body,
      signal: controller.signal,
    });
    data = await res.json();
  } catch (err) {
    if (err.name === 'AbortError') {
      throw { status: 408, message: 'El servidor tardó demasiado en responder. Intenta de nuevo.' };
    }
    throw err;
  } finally {
    clearTimeout(timer);
    if (slowTimer) {
      clearTimeout(slowTimer);
      slowTimer = null;
    }
    const ms = Math.round(performance.now() - started);
    apiPerf.lastLatency = ms;
    apiPerf.samples.push({ path, method: method || 'GET', ms, at: Date.now() });
    if (apiPerf.samples.length > 100) apiPerf.samples.shift();
    apiPerf.coldStart = false;
    emitColdStart({ coldStart: false, latency: ms, path });
  }

  if (!res.ok) throw { status: res.status, ...data };
  return data;
}

/** Devuelve el resumen de rendimiento para diagnóstico (ms promedio, muestras). */
export function getPerfSummary() {
  if (apiPerf.samples.length === 0) return { count: 0 };
  const total = apiPerf.samples.reduce((s, x) => s + x.ms, 0);
  const avg = Math.round(total / apiPerf.samples.length);
  return { count: apiPerf.samples.length, avg, last: apiPerf.lastLatency };
}

function authHeaders(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export const authAPI = {
  login: (email, password) =>
    request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),

  changePassword: (currentPassword, newPassword, accessToken) =>
    request('/auth/change-password', {
      method: 'POST',
      headers: authHeaders(accessToken),
      body: JSON.stringify({ currentPassword, newPassword }),
    }),

  verifyOTP: (email, codigo) =>
    request('/auth/verify-otp', { method: 'POST', body: JSON.stringify({ email, codigo }) }),

  verifyGate: (tempToken, gate) =>
    request('/auth/verify-gate', { method: 'POST', body: JSON.stringify({ tempToken, gate }) }),

  verify2FA: (tempToken, totpCode) =>
    request('/auth/verify-2fa', { method: 'POST', body: JSON.stringify({ tempToken, totpCode }) }),

  refresh: (refreshToken) =>
    request('/auth/refresh', { method: 'POST', body: JSON.stringify({ refreshToken }) }),

  logout: (refreshToken, accessToken) =>
    request('/auth/logout', {
      method: 'POST',
      headers: authHeaders(accessToken),
      body: JSON.stringify({ refreshToken }),
    }),

  me: (accessToken) =>
    request('/auth/me', { headers: authHeaders(accessToken) }),

  setup2FA: (accessToken) =>
    request('/auth/setup-2fa', {
      method: 'POST',
      headers: authHeaders(accessToken),
    }),

  confirm2FA: (token, accessToken) =>
    request('/auth/confirm-2fa', {
      method: 'POST',
      headers: authHeaders(accessToken),
      body: JSON.stringify({ token }),
    }),

  inviteGet: (token) =>
    request(`/auth/invite/${encodeURIComponent(token)}`),

  inviteAccept: (token, password) =>
    request('/auth/invite/accept', {
      method: 'POST',
      body: JSON.stringify({ token, password }),
    }),

  onboardingSetup2FA: (onboardingToken) =>
    request('/auth/onboarding/setup-2fa', {
      method: 'POST',
      body: JSON.stringify({ onboardingToken }),
    }),

  onboardingConfirm2FA: (onboardingToken, token) =>
    request('/auth/onboarding/confirm-2fa', {
      method: 'POST',
      body: JSON.stringify({ onboardingToken, token }),
    }),

  updateProfile: (payload, accessToken) =>
    request('/auth/me/profile', {
      method: 'PUT',
      headers: authHeaders(accessToken),
      body: JSON.stringify(payload),
    }),

  supabaseSync: (password, accessToken) =>
    request('/auth/supabase-sync', {
      method: 'POST',
      headers: authHeaders(accessToken),
      body: JSON.stringify({ password }),
    }),

  panelGrants: (accessToken) =>
    request('/auth/panel-grants', { headers: authHeaders(accessToken) }),

  setPanelGrant: (payload, accessToken) =>
    request('/auth/panel-grants', {
      method: 'POST',
      headers: authHeaders(accessToken),
      body: JSON.stringify(payload),
    }),
};

/**
 * Gestión de usuarios del panel: delega en la API del backend
 * (`/api/users`, RBAC `usuarios:*`). El ERP no toca `public.users` por
 * Supabase: esa tabla está REVOKEada para `authenticated`.
 */
export const usuariosAPI = {
  listar: (params = {}, accessToken) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([clave, valor]) => {
      if (valor !== undefined && valor !== null && valor !== '') q.set(clave, String(valor));
    });
    const sufijo = q.toString() ? `?${q.toString()}` : '';
    return request(`/users${sufijo}`, { headers: authHeaders(accessToken) });
  },

  obtener: (id, accessToken) =>
    request(`/users/${encodeURIComponent(id)}`, { headers: authHeaders(accessToken) }),

  crear: (payload, accessToken) =>
    request('/users', {
      method: 'POST',
      headers: authHeaders(accessToken),
      body: JSON.stringify(payload),
    }),

  actualizar: (id, payload, accessToken) =>
    request(`/users/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: authHeaders(accessToken),
      body: JSON.stringify(payload),
    }),

  eliminar: (id, accessToken) =>
    request(`/users/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: authHeaders(accessToken),
    }),

  /** Manda el correo con el que el usuario fija su contraseña (OTP de reset). */
  enviarCorreoClave: (email) =>
    request('/auth/request-reset', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
};

export const contactAPI = {
  send: (payload) =>
    request('/contact', { method: 'POST', body: JSON.stringify(payload) }),
};

export const pedidosAPI = {
  send: (payload) =>
    request('/pedidos', { method: 'POST', body: JSON.stringify(payload) }),

  reenviarEmail: (payload, accessToken) =>
    request('/pedidos/reenviar-email', {
      method: 'POST',
      headers: authHeaders(accessToken),
      body: JSON.stringify(payload),
    }),
};

export const metricsAPI = {
  get: (accessToken) =>
    request('/metrics', { headers: authHeaders(accessToken) }),
};

export const imagenesAPI = {
  listar: (ruta, accessToken) =>
    request(`/imagenes/listar?ruta=${encodeURIComponent(ruta || '')}`, {
      headers: authHeaders(accessToken),
    }),
};

export const marketingAPI = {
  unsubscribe: (email) =>
    request('/marketing/unsubscribe', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
};
