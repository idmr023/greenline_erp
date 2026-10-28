/**
 * Visibilidad de contraseñas por rol — Bóveda Segura V5 §40.
 *
 * La CATEGORÍA de un secreto decide QUIÉN llega a ver el ítem: eso lo
 * impone el RLS de `greenline_vault_items` en el repo hermano. Este módulo
 * decide QUIÉN ve, además, la CONTRASEÑA dentro de ese conjunto.
 *
 * El valor viaja en la columna `roles_visibles` (metadato en claro, como
 * `categoria`) para que el RLS pueda aplicarlo sin descifrar nada, y en el
 * payload cifrado como copia de cortesía.
 *
 * Dominio del valor:
 *
 *   null      → sin restricción: todos los roles con acceso a la categoría
 *               ven la contraseña (comportamiento heredado).
 *   []        → restringido a los gestores (ADMIN / DESARROLLADOR_WEB).
 *   [roles…]  → restringido a esos roles + los gestores.
 *
 * Un array vacío NO significa «nadie lo ve»: el gestor siempre la ve.
 * Sin ese bypass un gestor podría quitarse a sí mismo el acceso y dejaría
 * el secreto sin nadie que pueda auditarlo ni corregirlo.
 */

/** Roles que conservan siempre el acceso a la contraseña (ver `lib/roles.js`). */
export const ROLES_GESTORES_BOVEDA = ['ADMIN', 'DESARROLLADOR_WEB'];

/**
 * Normaliza el valor de «quién ve esta contraseña» al dominio de la columna.
 * Cualquier cosa que no sea un array (o que no contenga strings válidos)
 * se trata como «sin restricción».
 *
 * @param {unknown} valor
 * @returns {string[] | null}
 */
export function normalizarRolesVisibles(valor) {
  if (valor === null || valor === undefined) return null;
  if (!Array.isArray(valor)) return null;
  const limpios = [
    ...new Set(
      valor
        .filter((r) => typeof r === 'string')
        .map((r) => r.trim())
        .filter((r) => r !== ''),
    ),
  ];
  return limpios;
}

/**
 * Alterna un rol en la lista de roles visibles de un secreto.
 *
 * Si la lista estaba sin restringir (`null`) y se añade el primer rol, pasa
 * a restringida. Quitar un rol de una lista sin restringir no puede cambiar
 * nada, así que en ese caso la operación es un no-op.
 *
 * @param {string[] | null} actual
 * @param {string} rol
 * @returns {string[] | null}
 */
export function alternarRolVisible(actual, rol) {
  if (!rol) return actual;
  const base = normalizarRolesVisibles(actual) ?? [];
  const siguiente = base.includes(rol)
    ? base.filter((r) => r !== rol)
    : [...base, rol];
  return siguiente;
}

/**
 * ¿Le corresponde la contraseña a este usuario?
 *
 * @param {object} args
 * @param {string[] | null} args.rolesVisibles  roles permitidos (null = sin restricción)
 * @param {string[]} args.rolesUsuario         roles efectivos del usuario
 * @returns {boolean}
 */
export function puedeVerContrasena({ rolesVisibles, rolesUsuario }) {
  const permitidos = normalizarRolesVisibles(rolesVisibles);
  if (permitidos === null) return true;
  const roles = Array.isArray(rolesUsuario) ? rolesUsuario : [];
  if (roles.some((r) => ROLES_GESTORES_BOVEDA.includes(r))) return true;
  return roles.some((r) => permitidos.includes(r));
}

/**
 * Texto para la UI: a qué roles se ve la contraseña.
 *
 * @param {string[] | null} rolesVisibles
 * @returns {string} etiqueta legible
 */
export function etiquetaVisibilidad(rolesVisibles) {
  const permitidos = normalizarRolesVisibles(rolesVisibles);
  if (permitidos === null) return 'Sin restricción (cualquier rol con acceso a la categoría)';
  if (permitidos.length === 0) return 'Sólo ADMIN y DESARROLLADOR_WEB';
  return permitidos.join(', ');
}
