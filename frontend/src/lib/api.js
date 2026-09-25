export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

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
