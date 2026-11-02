/**
 * Política de navegación del panel.
 *
 * La nav es una función de la matriz de permisos del backend: aquí no hay
 * listas de roles ni casos por rol — sólo se filtra lo que `GET
 * /auth/permissions` ya resolvió en el servidor. La única excepción es el
 * bypass de Servicio Técnico, que vive en `VISTAS_CON_BYPASS` porque
 * `menu:servicio_tecnico` todavía no existe en el catálogo del backend.
 *
 * El módulo es puro (sin React, sin iconos, sin CASL) para que `npm test`
 * lo ejecute con `node --test`.
 */

/**
 * Vistas que el cliente abre aunque la matriz del backend no envíe su
 * permiso. Clave = `VIEWS.*` del panel; valor = roles que la ven igual.
 * @type {Readonly<Record<string, readonly string[]>>}
 */
export const VISTAS_CON_BYPASS = Object.freeze({
  servicio_tecnico: Object.freeze(['ADMIN', 'DESARROLLADOR_WEB']),
});

/**
 * ¿La sesión ve esta sección?
 *
 * @param {{key?: string, vista?: string, perm: string}} item
 *   Elemento de la nav (`key`/`perm`) o de las opciones del hub
 *   (`vista`/`permiso`-como-`perm`).
 * @param {(perm: string) => boolean} can
 *   `ability.can('read', perm)` de CASL para ESTA sesión.
 * @param {readonly string[]} [roles]
 *   Roles efectivos de la sesión (para `VISTAS_CON_BYPASS`).
 * @returns {boolean}
 */
export function seccionVisible(item, can, roles = []) {
  const clave = item?.key ?? item?.vista;
  const bypass = VISTAS_CON_BYPASS[clave];
  if (bypass && roles.some((rol) => bypass.includes(rol))) return true;
  // Sin permiso declarado no se concede nada (denegar por defecto).
  if (typeof can !== 'function' || !item?.perm) return false;
  return !!can(item.perm);
}

/**
 * Secciones visibles para la ability de la sesión, en el orden del catálogo.
 * @param {Array<{key?: string, vista?: string, perm: string}>} items
 * @param {(perm: string) => boolean} can
 * @param {readonly string[]} [roles]
 * @returns {typeof items}
 */
export function navVisibleDe(items, can, roles = []) {
  return items.filter((item) => seccionVisible(item, can, roles));
}

/**
 * Resuelve qué vista debe abrir una sesión.
 *
 *   · la pedida, si la nav visible la incluye — o si es una subvista de una
 *     sección visible (`producto_form` sólo existe dentro de `productos`);
 *   · si no, la primera sección visible: la landing de quien sólo ve blog
 *     o distribuidores, sin casos especiales por rol;
 *   · si la sesión no ve nada, `reserva`.
 *
 * Se usa igual para la URL de entrada (`getInitialView`) y para
 * `navigateTo`: una sección a la que la sesión no tiene permiso nunca
 * llega a montarse.
 *
 * @param {Array<{key: string, perm: string}>} items
 * @param {(perm: string) => boolean} can
 * @param {readonly string[]} roles
 * @param {string} vistaPedida
 * @param {Record<string, string>} [subvistas] vista -> sección contenedora
 * @param {string|null} [reserva]
 * @returns {string|null}
 */
export function resolverVista(items, can, roles, vistaPedida, subvistas = {}, reserva = null) {
  const visibles = navVisibleDe(items, can, roles);
  if (visibles.length === 0) return reserva;
  const claves = new Set(visibles.map((item) => item.key));
  const permitida = (vista) => claves.has(vista)
    || (subvistas[vista] != null && claves.has(subvistas[vista]));
  return permitida(vistaPedida) ? vistaPedida : visibles[0].key;
}
