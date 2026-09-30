/**
 * Fuente única de verdad de los roles del panel (§40 — mínimo privilegio).
 *
 * Antes había 5 copias repartidas por AuthContext, ProtectedRoute, AdminPanel
 * y AdminMetrics, con dos significados distintos para «ADMIN_ROLES». Cualquier
 * cambio de rol tenía que tocarse a mano en cinco sitios y se descuadraba.
 *
 * Correspondencia con el backend / RLS (fuente única = SQL):
 *
 *   ADMIN_ROLES    → quién entra en /admin con autoridad máxima. Es la unión
 *                    de es_admin_panel() + es_blog_admin() + es_distribucion().
 *   STAFF_ROLES    → colaboradores por debajo: entran a /admin pero sólo ven
 *                    y editan las secciones que sus permisos permitan.
 *   PANEL_ROLES    → nadie más entra en /admin (ProtectedRoute).
 *   ROLES_MAXIMOS  → privilegio máximo: es_admin_panel() y, en la bóveda,
 *                    quienes tienen INSERT/UPDATE/DELETE sobre los items.
 *
 * Nota: el RLS exige además `panel_acceso` (grant por rol) y `activo`; estos
 * arrays son sólo la parte de rol, que es lo que decide la UI.
 */

/** Autoridad máxima: entra en /admin y ve todas las secciones habilitadas. */
export const ADMIN_ROLES = ['ADMIN', 'DESARROLLADOR_WEB', 'EDITORA_BLOG', 'DISTRIBUCION'];

/** Colaboradores por debajo: acceso al panel limitado por sección (§40). */
export const STAFF_ROLES = [
  'EDITORA_BLOG', 'DISTRIBUCION', 'GERENTE_TIENDA', 'COLABORADOR_TIENDA',
  'GERENTE_ALMACEN', 'COLABORADOR_ALMACEN',
];

/** Único guard de la ruta /admin: autoridad máxima + colaboradores. */
export const PANEL_ROLES = [
  'ADMIN', 'DESARROLLADOR_WEB', 'EDITORA_BLOG', 'DISTRIBUCION',
  'GERENTE_TIENDA', 'COLABORADOR_TIENDA', 'GERENTE_ALMACEN', 'COLABORADOR_ALMACEN',
];

/** Privilegio máximo (es_admin_panel): bóveda, métricas, grants, aniversario. */
export const ROLES_MAXIMOS = ['ADMIN', 'DESARROLLADOR_WEB'];

/** Sólo gestión de blog. */
export const ROLES_BLOG = ['EDITORA_BLOG'];

/** Sólo gestión de distribuidores. */
export const ROLES_DISTRIBUCION = ['DISTRIBUCION'];

/**
 * Quién ve /admin/usuarios: es `usuarios:read` del backend
 * (ADMIN, DESARROLLADOR_WEB, DISTRIBUCION).
 */
export const USUARIOS_ROLES = ['ADMIN', 'DESARROLLADOR_WEB', 'DISTRIBUCION'];

/**
 * Quién puede crear, editar y borrar usuarios: `usuarios:create/update/delete`
 * (el propio cambio de rol entra aquí; `usuarios:manage-roles` es de ADMIN,
 * pero la API lo resuelve con `usuarios:update`).
 */
export const USUARIOS_ESCRITURA_ROLES = ['ADMIN', 'DESARROLLADOR_WEB'];

/** Null-safe: `undefined`/`null` de rol nunca crashea un guard. */
export function tieneRol(roles, rol) {
  return Boolean(rol) && Array.isArray(roles) && roles.includes(rol);
}
