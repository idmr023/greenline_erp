/**
 * Scrubbing de observabilidad (Bóveda Segura V5 §45 / R156–R159).
 *
 * Principio: por ALLOWLIST. De cada evento sólo se conserva lo que hace
 * falta para agrupar errores (mensaje, stack, tags, release, environment).
 * Todo lo demás — request, headers, extra, contexts, user, breadcrumbs con
 * datos — se elimina antes de salir del navegador. El filtro de claves y de
 * valores es la segunda línea, por si algo se cuela.
 */

/** Rutas cuyo evento se descarta íntegro. */
const RUTAS_SENSIBLES = [/\/vault\b/i, /\/boveda/i, /boveda-segura/i];

/** Claves que jamás deben viajar en un evento (defensa en profundidad). */
const CLAVES_PROHIBIDAS = new Set([
  'password', 'passwd', 'pwd', 'master_password', 'masterPassword',
  'encryption_key', 'encryptionKey', 'encryptionkey', 'kek', 'dek',
  'wrapped_dek', 'wrappedDek', 'unlock_key', 'unlockKey', 'clave_maestra',
  'secret', 'secrets', 'api_key', 'apiKey', 'apikey', 'access_token',
  'accessToken', 'refresh_token', 'refreshToken', 'token', 'authorization',
  'totp_secret', 'totpSecret', 'otp', 'codigo', 'recovery_key', 'recoveryKey',
  'step_up_token', 'stepUpToken', 'cookie', 'set-cookie', 'x-step-up',
  'private_key', 'privateKey', 'service_role', 'serviceRole',
]);

/** Valores con forma de secreto que deben enmascararse en cualquier texto. */
const PATRONES_SENSIBLES = [
  // JWT (header.payload.signature)
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\b/g, '[jwt]'],
  // Authorization: Bearer xxx
  [/\b(bearer)\s+[A-Za-z0-9._~+/=-]{8,}/gi, '$1 [redactado]'],
  // clave=valor en query strings y bodies
  [
    /\b(password|passwd|pwd|token|access_token|refresh_token|api_key|apikey|secret|codigo|otp)\s*[=:]\s*([^&\s"']{3,})/gi,
    '$1=[redactado]',
  ],
  // tokens de sesión / blobs largos (hex o base64) que no son hashes cortos
  [/\b[A-Za-z0-9+/]{40,}={0,2}\b/g, '[blob]'],
  [/\b[0-9a-fA-F]{32,}\b/g, '[hex]'],
];

/**
 * Enmascara cualquier patrón de secreto dentro de un texto libre.
 * @param {unknown} texto
 * @returns {string}
 */
export function limpiarTexto(texto) {
  if (typeof texto !== 'string' || texto === '') return '';
  let salida = texto;
  for (const [re, reemplazo] of PATRONES_SENSIBLES) {
    salida = salida.replace(re, reemplazo);
  }
  return salida;
}

function valorEsSeguro(valor) {
  return typeof valor === 'string' || typeof valor === 'number' || typeof valor === 'boolean' || valor === null;
}

/**
 * Devuelve una copia del objeto sin claves prohibidas y con todos los
 * textos pasados por `limpiarTexto`. Los objetos muy profundos se limitan
 * en profundidad para no dejar datos colgando.
 */
export function limpiarObjeto(obj, profundidad = 0) {
  if (obj === null || obj === undefined) return obj;
  if (profundidad > 6) return undefined;
  if (typeof obj === 'string') return limpiarTexto(obj);
  if (valorEsSeguro(obj)) return obj;
  if (Array.isArray(obj)) {
    return obj
      .slice(0, 50)
      .map((item) => limpiarObjeto(item, profundidad + 1))
      .filter((item) => item !== undefined);
  }
  if (typeof obj !== 'object') return undefined;

  const salida = {};
  for (const [clave, valor] of Object.entries(obj)) {
    if (CLAVES_PROHIBIDAS.has(clave.toLowerCase()) || CLAVES_PROHIBIDAS.has(clave)) continue;
    const limpio = limpiarObjeto(valor, profundidad + 1);
    if (limpio !== undefined) salida[clave] = limpio;
  }
  return salida;
}

function urlEsSensible(url) {
  if (typeof url !== 'string') return false;
  return RUTAS_SENSIBLES.some((re) => re.test(url));
}

function soloRuta(url) {
  if (typeof url !== 'string') return '';
  try {
    const u = new URL(url, 'https://placeholder.local');
    return u.pathname + u.hash;
  } catch {
    return '';
  }
}

/**
 * Filtro de eventos: devuelve el evento saneado o `null` para descartarlo.
 */
export function beforeSend(event) {
  if (!event) return null;

  const urlSensible = urlEsSensible(event.request?.url) || urlEsSensible(event.request?.url?.toString());
  if (urlSensible) return null;

  // Sólo sobrevive lo estrictamente necesario para agrupar el error.
  const limpio = {
    event_id: event.event_id,
    message: limpiarTexto(event.message),
    logger: event.logger,
    level: event.level,
    platform: event.platform,
    release: event.release,
    environment: event.environment,
    transaction: soloRuta(event.transaction),
    tags: limpiarObjeto(event.tags) || {},
    fingerprint: event.fingerprint,
  };

  if (event.exception?.values) {
    limpio.exception = {
      values: (event.exception.values || []).slice(0, 10).map((valor) => ({
        type: valor.type,
        value: limpiarTexto(valor.value),
        stacktrace: valor.stacktrace
          ? {
              frames: (valor.stacktrace.frames || []).slice(-30).map((frame) => ({
                filename: frame.filename,
                function: limpiarTexto(frame.function),
                lineno: frame.lineno,
                colno: frame.colno,
                in_app: frame.in_app,
              })),
            }
          : undefined,
      })),
    };
  }

  if (event.extra) {
    const extra = limpiarObjeto(event.extra);
    if (extra && Object.keys(extra).length) limpio.extra = extra;
  }

  return limpio;
}

/**
 * Filtro de breadcrumbs: se descartan los de red y cualquier dato con
 * claves prohibidas o rutas sensibles.
 */
export function beforeBreadcrumb(migaja) {
  if (!migaja) return migaja;

  const categoria = String(migaja.category || '');
  if (categoria.startsWith('xhr') || categoria.startsWith('fetch') || categoria.startsWith('http')) {
    const url = migaja.data?.url;
    if (urlEsSensible(url)) return null;
    return {
      ...migaja,
      data: limpiarObjeto({
        method: migaja.data?.method,
        status_code: migaja.data?.status_code,
        url: soloRuta(url),
      }),
    };
  }

  if (categoria.startsWith('console')) {
    return {
      ...migaja,
      data: limpiarObjeto(migaja.data),
      message: limpiarTexto(migaja.message),
    };
  }

  const datos = migaja.data ? limpiarObjeto(migaja.data) : migaja.data;
  if (migaja.data && datos === undefined) return null;

  return { ...migaja, data: datos, message: limpiarTexto(migaja.message) };
}
