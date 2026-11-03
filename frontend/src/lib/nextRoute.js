/**
 * Destino de vuelta tras iniciar sesión (`?next=`).
 *
 * El destino viaja en la URL y no en `location.state` porque así sobrevive a
 * una recarga del formulario de login, es compartible y se puede auditar.
 * El sitio público ya usa esta misma convención (`/login?next=/checkout`).
 *
 * Como el destino acaba en una redirección del navegador, se sanea con reglas
 * estrictas: sólo rutas relativas del mismo origen. Cualquier esquema
 * (`https:`, `javascript:`) o host externo (`//evil.com`) se descarta.
 */

/** Destino por defecto cuando no hay `?next=` válido: el hub del panel. */
export const FALLBACK_POST_LOGIN = '/admin';

/**
 * Rutas que no pueden ser destino de vuelta: llevarían a un bucle
 * (login → login) o devolverían al propio formulario de cambio de clave.
 */
const RUTAS_RESERVADAS = new Set(['/login', '/change-password']);

/**
 * ¿El texto tiene caracteres de control? (CR, LF, NUL, DEL...)
 * Se comprueba carácter a carácter para no depender de una expresión regular
 * con escapes de control.
 *
 * @param {string} v
 * @returns {boolean}
 */
function tieneControl(v) {
  for (let i = 0; i < v.length; i += 1) {
    const c = v.charCodeAt(i);
    if (c < 32 || c === 127) return true;
  }
  return false;
}

/**
 * Sanea un destino de vuelta.
 *
 * @param {unknown} valor
 * @returns {string|null} ruta relativa válida o `null`
 */
export function sanitizarNext(valor) {
  if (typeof valor !== 'string') return null;
  const v = valor.trim();
  if (!v) return null;
  // Debe empezar por una barra: descarta `https://…`, `javascript:…` y
  // rutas relativas sin barra inicial.
  if (!v.startsWith('/')) return null;
  // `//host` y `/\host` son URLs relativas al protocolo (open redirect).
  if (v.startsWith('//') || v.startsWith('/\\')) return null;
  // Cualquier barra invertida puede interpretarse como separador de host.
  if (v.includes('\\')) return null;
  // Caracteres de control: permitirían cortar la URL o inyectar cabeceras.
  if (tieneControl(v)) return null;
  // El destino no puede ser el login (bucle) ni el cambio de clave.
  const ruta = v.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
  if (RUTAS_RESERVADAS.has(ruta)) return null;
  return v;
}

/**
 * Construye el destino de vuelta a partir de una ubicación. Sirve tanto con
 * la de React Router (`useLocation`) como con `window.location`: ambos
 * exponen `pathname`, `search` y `hash`.
 *
 * @param {{pathname?: string, search?: string, hash?: string}|null|undefined} loc
 * @returns {string|null}
 */
export function nextDesdeLocation(loc) {
  if (!loc) return null;
  const path = typeof loc.pathname === 'string' ? loc.pathname : '';
  if (!path) return null;
  const search = typeof loc.search === 'string' ? loc.search : '';
  const hash = typeof loc.hash === 'string' ? loc.hash : '';
  return sanitizarNext(`${path}${search}${hash}`);
}

/**
 * Destino final tras iniciar sesión: el pedido si es válido, si no el hub.
 *
 * @param {unknown} next
 * @returns {string}
 */
export function destinoPostLogin(next) {
  return sanitizarNext(next) || FALLBACK_POST_LOGIN;
}

/**
 * URL de login que recuerda adónde volver.
 *
 * @param {unknown} destino
 * @returns {string}
 */
export function loginConNext(destino) {
  const d = sanitizarNext(destino);
  return d ? `/login?next=${encodeURIComponent(d)}` : '/login';
}

/**
 * URL de login que toma la ubicación actual como destino de vuelta.
 *
 * @param {{pathname?: string, search?: string, hash?: string}|null|undefined} loc
 * @returns {string}
 */
export function loginDesdeLocation(loc) {
  return loginConNext(nextDesdeLocation(loc));
}

/**
 * URL de cambio de contraseña que recuerda adónde volver.
 *
 * @param {unknown} destino
 * @returns {string}
 */
export function cambiarPasswordConNext(destino) {
  const d = sanitizarNext(destino);
  return d ? `/change-password?next=${encodeURIComponent(d)}` : '/change-password';
}

/**
 * Tabla de decisión: a dónde va el usuario según el tipo de sesión y el
 * destino pedido. La comparten el login recién hecho y el caso «ya había
 * sesión», para que ambos caminos no puedan divergir.
 *
 *   esCliente        → el cliente final va al sitio público (lo resuelve
 *                      el LoginPage, que es quien conoce SITE_URL).
 *   mustChangePassword → hay que cambiar la clave temporal antes de entrar;
 *                      el destino se arrastra a esa pantalla.
 *   resto            → al panel, al destino pedido.
 *
 * @param {{esCliente?: boolean, mustChangePassword?: boolean, next?: unknown}} entrada
 * @returns {{tipo: 'cliente'|'cambio-password'|'panel', destino: string}}
 */
export function pantallaPostLogin({ esCliente = false, mustChangePassword = false, next = null } = {}) {
  const destino = destinoPostLogin(next);
  if (esCliente) return { tipo: 'cliente', destino };
  if (mustChangePassword) return { tipo: 'cambio-password', destino: cambiarPasswordConNext(destino) };
  return { tipo: 'panel', destino };
}
