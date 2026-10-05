/**
 * Fuente única de verdad de los ROLES del panel (§40 — mínimo privilegio).
 *
 * Qué puede hacer cada rol ya NO vive aquí: eso es la matriz de permisos del
 * backend (`greenline/backend/src/config/permissions.js`), que el panel
 * recibe con `GET /auth/permissions` y convierte en una ability CASL
 * (`lib/permissions.js`). Antes había arrays duplicados (USUARIOS_ROLES,
 * ROLES_MAXIMOS, ROLES_BLOG…) que había que sincronizar a mano con el
 * servidor; se fueron con la migración a CASL.
 *
 * Aquí sólo queda lo que es de naturaleza de ROL:
 *
 *   PANEL_ROLES    → quién entra en /admin (guard de ProtectedRoute).
 *   ADMIN_ROLES    → quién entra con autoridad máxima en /fase-2-implementacion
 *                    y en las vistas que el propio router exige.
 *   STAFF_ROLES    → quién es equipo por debajo (AuthContext.isStaff).
 *
 * Correspondencia con el backend / RLS (fuente única = SQL):
 *   ADMIN_ROLES    → unión de es_admin_panel() + es_blog_admin() + es_distribucion().
 *   Nota: el RLS exige además `panel_acceso` (grant por rol) y `activo`.
 *
 * MULTI-ROL: una cuenta puede tener VARIOS roles a la vez (rol primario +
 * `extraRoles`). Todo permiso se resuelve con la UNIÓN de los roles efectivos,
 * que es lo que devuelve `rolesDe(user)`; `tieneRol` acepta tanto un rol suelto
 * como ese array de roles efectivos.
 */

/** Autoridad máxima: entra en /admin y ve todas las secciones habilitadas. */
export const ADMIN_ROLES = ['ADMIN', 'DESARROLLADOR_WEB', 'EDITORA_BLOG', 'DISTRIBUCION'];

/** Colaboradores por debajo: acceso al panel limitado por sección (§40). */
export const STAFF_ROLES = [
  'EDITORA_BLOG', 'DISTRIBUCION', 'GERENTE_TIENDA', 'COLABORADOR_TIENDA',
  'GERENTE_ALMACEN', 'COLABORADOR_ALMACEN', 'REDES_SOCIALES',
];

/** Único guard de la ruta /admin: autoridad máxima + colaboradores. */
export const PANEL_ROLES = [
  'ADMIN', 'DESARROLLADOR_WEB', 'EDITORA_BLOG', 'DISTRIBUCION',
  'GERENTE_TIENDA', 'COLABORADOR_TIENDA', 'GERENTE_ALMACEN', 'COLABORADOR_ALMACEN',
  'REDES_SOCIALES',
];

/**
 * Roles efectivos de un usuario: la unión del rol primario (`user.rol`) y los
 * adicionales (`user.extraRoles`). Si el backend ya manda `roles` calculado,
 * se usa ese. Null-safe: `undefined`/`null` nunca crashea un guard.
 */
export function rolesDe(user) {
  if (!user) return [];
  if (Array.isArray(user.roles) && user.roles.length > 0) {
    return [...new Set(user.roles.filter(Boolean))];
  }
  const primario = user.rol ? [user.rol] : [];
  const extras = Array.isArray(user.extraRoles) ? user.extraRoles : [];
  return [...new Set([...primario, ...extras].filter(Boolean))];
}

/**
 * ¿Tiene `roles` (lista permitida) ALGUNO de los roles dados?
 * El segundo argumento acepta un rol suelto (`user.rol`) o el array de
 * roles efectivos de `rolesDe(user)`.
 */
export function tieneRol(roles, rol) {
  if (!Array.isArray(roles) || !rol) return false;
  const delUsuario = Array.isArray(rol) ? rol : [rol];
  return delUsuario.some((r) => Boolean(r) && roles.includes(r));
}
