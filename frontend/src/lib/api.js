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
    // Con FormData NO debe mandarse Content-Type: el navegador añade el
    // boundary del multipart. Con application/json, el express.json() global
    // del backend intenta parsear el multipart y la petición muere 400/500.
    const esFormData = typeof FormData !== 'undefined' && body instanceof FormData;

    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: { ...(esFormData ? {} : { 'Content-Type': 'application/json' }), ...headers },
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

  if (!res.ok) {
    // 429: el backend tiene un límite global por IP (15 min). Desde una red
    // compartida (oficina) se puede agotar: se explica en vez de dejar el
    // error técnico pelado.
    if (res.status === 429) {
      throw {
        status: 429,
        ...data,
        error:
          'El servidor está limitando las peticiones (demasiadas desde esta red). ' +
          'Espera un par de minutos y vuelve a intentarlo.',
      };
    }
    throw { status: res.status, ...data };
  }
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

  // ¿Es ésta la contraseña del USUARIO? La bóveda la pide antes de derivar la
  // KEK que envuelve su DEK (KEK por usuario): sólo responde { valid } y no
  // inicia sesión. Se le pasa el access token de la sesión vigente.
  verifyPassword: (password, accessToken) =>
    request('/auth/verify-password', {
      method: 'POST',
      headers: authHeaders(accessToken),
      body: JSON.stringify({ password }),
    }),

  verifyOTP: (email, codigo) =>
    request('/auth/verify-otp', { method: 'POST', body: JSON.stringify({ email, codigo }) }),

  verify2FA: (tempToken, totpCode) =>
    request('/auth/verify-2fa', { method: 'POST', body: JSON.stringify({ tempToken, totpCode }) }),

  // Retos del 2FA con tempToken: todavía no hay sesión, sólo la constancia
  // de que la contraseña del paso 1 fue correcta (purpose '2fa' / '2fa_setup').
  setup2FAChallenge: (tempToken) =>
    request('/auth/2fa/setup', { method: 'POST', body: JSON.stringify({ tempToken }) }),

  confirm2FAChallenge: (tempToken, token) =>
    request('/auth/2fa/setup/confirm', { method: 'POST', body: JSON.stringify({ tempToken, token }) }),

  send2FAEmail: (tempToken) =>
    request('/auth/2fa/email', { method: 'POST', body: JSON.stringify({ tempToken }) }),

  verify2FAEmail: (tempToken, codigo) =>
    request('/auth/verify-2fa-email', { method: 'POST', body: JSON.stringify({ tempToken, codigo }) }),

  verify2FABackup: (tempToken, codigo) =>
    request('/auth/2fa/backup', { method: 'POST', body: JSON.stringify({ tempToken, codigo }) }),

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

  // Matriz única de permisos del backend (recurso:acción). El panel monta su
  // ability CASL con esta lista y deja de copiar la matriz de roles.
  permissions: (accessToken) =>
    request('/auth/permissions', { headers: authHeaders(accessToken) }),

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

};

/**
 * Catálogo de roles editable desde el panel (`/api/auth/roles`, RBAC
 * `usuarios:manage-roles`). Devuelve además `permisos` (clave → grupo/orden)
 * para pintar la matriz de permisos sin copiar el catálogo del backend.
 *
 * NOTA de alcance: el RLS compara por NOMBRE de rol, así que un rol creado
 * aquí gobierna CASL/app pero no las políticas de Postgres (F3 no las toca).
 */
export const rolesAPI = {
  listar: (accessToken) =>
    request('/auth/roles', { headers: authHeaders(accessToken) }),

  crear: (payload, accessToken) =>
    request('/auth/roles', {
      method: 'POST',
      headers: authHeaders(accessToken),
      body: JSON.stringify(payload),
    }),

  actualizar: (rol, payload, accessToken) =>
    request(`/auth/roles/${encodeURIComponent(rol)}`, {
      method: 'PATCH',
      headers: authHeaders(accessToken),
      body: JSON.stringify(payload),
    }),

  setPermisos: (rol, permisos, accessToken) =>
    request(`/auth/roles/${encodeURIComponent(rol)}/permisos`, {
      method: 'PUT',
      headers: authHeaders(accessToken),
      body: JSON.stringify({ permisos }),
    }),

  eliminar: (rol, accessToken) =>
    request(`/auth/roles/${encodeURIComponent(rol)}`, {
      method: 'DELETE',
      headers: authHeaders(accessToken),
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

export const reclamacionesAPI = {
  reenviarEmail: (payload, accessToken) =>
    request('/reclamaciones/reenviar-email', {
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

/**
 * Citas de servicio técnico (§10): el panel administra las citas y los
 * destinatarios de los correos de tienda vía el backend (`/api/citas`,
 * RBAC `citas:*`); la creación es sólo pública (formulario web).
 */
export const citasAPI = {
  listar: (params = {}, accessToken) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([clave, valor]) => {
      if (valor !== undefined && valor !== null && valor !== '') q.set(clave, String(valor));
    });
    const sufijo = q.toString() ? `?${q.toString()}` : '';
    return request(`/citas${sufijo}`, { headers: authHeaders(accessToken) });
  },

  obtener: (id, accessToken) =>
    request(`/citas/id/${encodeURIComponent(id)}`, { headers: authHeaders(accessToken) }),

  actualizar: (id, payload, accessToken) =>
    request(`/citas/id/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: authHeaders(accessToken),
      body: JSON.stringify(payload),
    }),

  reenviarEmail: (id, accessToken) =>
    request(`/citas/id/${encodeURIComponent(id)}/reenviar-email`, {
      method: 'POST',
      headers: authHeaders(accessToken),
    }),

  tiendas: () => request('/citas/tiendas'),

  destinatarios: (params = {}, accessToken) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([clave, valor]) => {
      if (valor !== undefined && valor !== null && valor !== '') q.set(clave, String(valor));
    });
    const sufijo = q.toString() ? `?${q.toString()}` : '';
    return request(`/citas/destinatarios${sufijo}`, { headers: authHeaders(accessToken) });
  },

  crearDestinatario: (payload, accessToken) =>
    request('/citas/destinatarios', {
      method: 'POST',
      headers: authHeaders(accessToken),
      body: JSON.stringify(payload),
    }),

  desactivarDestinatario: (id, accessToken) =>
    request(`/citas/destinatarios/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: authHeaders(accessToken),
    }),
};

// ============================================================
// Préstamos de vehículos (verificación de estado ingreso/salida)
// ============================================================
export const prestamosVehiculoAPI = {
  listar: (params = {}, accessToken) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([clave, valor]) => {
      if (valor !== undefined && valor !== null && valor !== '') q.set(clave, String(valor));
    });
    const sufijo = q.toString() ? `?${q.toString()}` : '';
    return request(`/prestamos-vehiculo${sufijo}`, { headers: authHeaders(accessToken) });
  },

  obtener: (id, accessToken) =>
    request(`/prestamos-vehiculo/${encodeURIComponent(id)}`, { headers: authHeaders(accessToken) }),

  crear: (payload, accessToken) =>
    request('/prestamos-vehiculo', {
      method: 'POST',
      headers: authHeaders(accessToken),
      body: JSON.stringify(payload),
    }),

  actualizar: (id, payload, accessToken) =>
    request(`/prestamos-vehiculo/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: authHeaders(accessToken),
      body: JSON.stringify(payload),
    }),

  eliminar: (id, accessToken) =>
    request(`/prestamos-vehiculo/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: authHeaders(accessToken),
    }),

  registrarIngreso: (id, payload, accessToken) =>
    request(`/prestamos-vehiculo/${encodeURIComponent(id)}/ingreso`, {
      method: 'POST',
      headers: authHeaders(accessToken),
      body: JSON.stringify(payload),
    }),

  registrarSalida: (id, payload, accessToken) =>
    request(`/prestamos-vehiculo/${encodeURIComponent(id)}/salida`, {
      method: 'POST',
      headers: authHeaders(accessToken),
      body: JSON.stringify(payload),
    }),

  listarTiendas: (accessToken) =>
    request('/prestamos-vehiculo/tiendas', { headers: authHeaders(accessToken) }),

  listarEmpleados: (accessToken) =>
    request('/prestamos-vehiculo/empleados', { headers: authHeaders(accessToken) }),

  subirFoto: (id, file, parte, accessToken) => {
    const formData = new FormData();
    formData.append('foto', file);
    if (parte) formData.append('parte', parte);
    return request(`/prestamos-vehiculo/${encodeURIComponent(id)}/fotos`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: formData,
    });
  },

  /** Añade fotos a una inspección YA registrada (ingreso o salida). */
  adjuntarFotos: (id, tipo, fotos, accessToken) =>
    request(`/prestamos-vehiculo/${encodeURIComponent(id)}/fotos/adjuntar`, {
      method: 'POST',
      headers: authHeaders(accessToken),
      body: JSON.stringify({ tipo, fotos }),
    }),
};

// ============================================================
// TALLER OPERATIVO: evaluación de incentivos (armadores),
// registro de garantías y reporte de ensamblado.
// ============================================================

/** Taller: técnicos, rotaciones, criterios y evaluaciones de incentivos. */
export const tallerAPI = {
  // técnicos
  listarTecnicos: (params = {}, accessToken) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([clave, valor]) => {
      if (valor !== undefined && valor !== null && valor !== '') q.set(clave, String(valor));
    });
    const sufijo = q.toString() ? `?${q.toString()}` : '';
    return request(`/taller/tecnicos${sufijo}`, { headers: authHeaders(accessToken) });
  },
  crearTecnico: (payload, accessToken) =>
    request('/taller/tecnicos', {
      method: 'POST', headers: authHeaders(accessToken), body: JSON.stringify(payload),
    }),
  actualizarTecnico: (id, payload, accessToken) =>
    request(`/taller/tecnicos/${encodeURIComponent(id)}`, {
      method: 'PATCH', headers: authHeaders(accessToken), body: JSON.stringify(payload),
    }),
  eliminarTecnico: (id, accessToken) =>
    request(`/taller/tecnicos/${encodeURIComponent(id)}`, {
      method: 'DELETE', headers: authHeaders(accessToken),
    }),

  // rotaciones entre tiendas
  crearRotacion: (tecnicoId, payload, accessToken) =>
    request(`/taller/tecnicos/${encodeURIComponent(tecnicoId)}/rotaciones`, {
      method: 'POST', headers: authHeaders(accessToken), body: JSON.stringify(payload),
    }),
  eliminarRotacion: (tecnicoId, rotacionId, accessToken) =>
    request(`/taller/tecnicos/${encodeURIComponent(tecnicoId)}/rotaciones/${encodeURIComponent(rotacionId)}`, {
      method: 'DELETE', headers: authHeaders(accessToken),
    }),

  // condiciones evaluables (columnas configurables del formulario)
  listarCriterios: (accessToken) =>
    request('/taller/criterios', { headers: authHeaders(accessToken) }),
  crearCriterio: (payload, accessToken) =>
    request('/taller/criterios', {
      method: 'POST', headers: authHeaders(accessToken), body: JSON.stringify(payload),
    }),
  actualizarCriterio: (id, payload, accessToken) =>
    request(`/taller/criterios/${encodeURIComponent(id)}`, {
      method: 'PATCH', headers: authHeaders(accessToken), body: JSON.stringify(payload),
    }),
  eliminarCriterio: (id, accessToken) =>
    request(`/taller/criterios/${encodeURIComponent(id)}`, {
      method: 'DELETE', headers: authHeaders(accessToken),
    }),

  // historial + puntaje general
  listarEvaluaciones: (params = {}, accessToken) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([clave, valor]) => {
      if (valor !== undefined && valor !== null && valor !== '') q.set(clave, String(valor));
    });
    const sufijo = q.toString() ? `?${q.toString()}` : '';
    return request(`/taller/evaluaciones${sufijo}`, { headers: authHeaders(accessToken) });
  },
  crearEvaluacion: (payload, accessToken) =>
    request('/taller/evaluaciones', {
      method: 'POST', headers: authHeaders(accessToken), body: JSON.stringify(payload),
    }),
  actualizarEvaluacion: (id, payload, accessToken) =>
    request(`/taller/evaluaciones/${encodeURIComponent(id)}`, {
      method: 'PATCH', headers: authHeaders(accessToken), body: JSON.stringify(payload),
    }),
  eliminarEvaluacion: (id, accessToken) =>
    request(`/taller/evaluaciones/${encodeURIComponent(id)}`, {
      method: 'DELETE', headers: authHeaders(accessToken),
    }),
  puntajes: (params = {}, accessToken) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([clave, valor]) => {
      if (valor !== undefined && valor !== null && valor !== '') q.set(clave, String(valor));
    });
    const sufijo = q.toString() ? `?${q.toString()}` : '';
    return request(`/taller/puntajes${sufijo}`, { headers: authHeaders(accessToken) });
  },
};

/** Registro de garantías. */
export const garantiasAPI = {
  listar: (params = {}, accessToken) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([clave, valor]) => {
      if (valor !== undefined && valor !== null && valor !== '') q.set(clave, String(valor));
    });
    const sufijo = q.toString() ? `?${q.toString()}` : '';
    return request(`/garantias${sufijo}`, { headers: authHeaders(accessToken) });
  },
  crear: (payload, accessToken) =>
    request('/garantias', {
      method: 'POST', headers: authHeaders(accessToken), body: JSON.stringify(payload),
    }),
  actualizar: (id, payload, accessToken) =>
    request(`/garantias/${encodeURIComponent(id)}`, {
      method: 'PATCH', headers: authHeaders(accessToken), body: JSON.stringify(payload),
    }),
  eliminar: (id, accessToken) =>
    request(`/garantias/${encodeURIComponent(id)}`, {
      method: 'DELETE', headers: authHeaders(accessToken),
    }),
  copiar: (id, accessToken) =>
    request(`/garantias/${encodeURIComponent(id)}/copiar`, {
      method: 'POST', headers: authHeaders(accessToken),
    }),
  resumen: (params = {}, accessToken) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([clave, valor]) => {
      if (valor !== undefined && valor !== null && valor !== '') q.set(clave, String(valor));
    });
    const sufijo = q.toString() ? `?${q.toString()}` : '';
    return request(`/garantias/resumen${sufijo}`, { headers: authHeaders(accessToken) });
  },
};

/** Reporte de ensamblado. */
export const ensambladoAPI = {
  listar: (params = {}, accessToken) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([clave, valor]) => {
      if (valor !== undefined && valor !== null && valor !== '') q.set(clave, String(valor));
    });
    const sufijo = q.toString() ? `?${q.toString()}` : '';
    return request(`/ensamblado${sufijo}`, { headers: authHeaders(accessToken) });
  },
  crear: (payload, accessToken) =>
    request('/ensamblado', {
      method: 'POST', headers: authHeaders(accessToken), body: JSON.stringify(payload),
    }),
  actualizar: (id, payload, accessToken) =>
    request(`/ensamblado/${encodeURIComponent(id)}`, {
      method: 'PATCH', headers: authHeaders(accessToken), body: JSON.stringify(payload),
    }),
  eliminar: (id, accessToken) =>
    request(`/ensamblado/${encodeURIComponent(id)}`, {
      method: 'DELETE', headers: authHeaders(accessToken),
    }),
  resumen: (params = {}, accessToken) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([clave, valor]) => {
      if (valor !== undefined && valor !== null && valor !== '') q.set(clave, String(valor));
    });
    const sufijo = q.toString() ? `?${q.toString()}` : '';
    return request(`/ensamblado/resumen${sufijo}`, { headers: authHeaders(accessToken) });
  },
};

// ============================================================
// Ajustes del SITIO PÚBLICO (greenline)
//
// El panel escribe aquí lo que el sitio público debe mostrar sin redeploy:
// temas temporales (Halloween), banners, etc. Se lee con GET y se escribe
// con PUT (staff con permiso config:update).
// ============================================================
export const siteConfigAPI = {
  obtener: (clave, accessToken) =>
    request(`/site-config/${encodeURIComponent(clave)}`, {
      headers: authHeaders(accessToken),
    }),

  guardar: (clave, valor, accessToken) =>
    request(`/site-config/${encodeURIComponent(clave)}`, {
      method: 'PUT',
      headers: authHeaders(accessToken),
      body: JSON.stringify({ valor }),
    }),

  borrar: (clave, accessToken) =>
    request(`/site-config/${encodeURIComponent(clave)}`, {
      method: 'DELETE',
      headers: authHeaders(accessToken),
    }),
};
