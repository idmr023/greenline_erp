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
 *   PANEL_ROLES    → lista de referencia del bloque «Acceso al panel» del
 *                    sidebar (el GUARD de /admin ya es por permisos, F2).
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
  'GERENTE_ALMACEN', 'JEFE_DE_ALMACEN', 'COLABORADOR_ALMACEN', 'REDES_SOCIALES',
];

/**
 * Autoridad máxima para el bloque «Acceso al panel» del sidebar.
 * DESDE EL F2 YA NO ES EL GUARD DE /admin: esa ruta se decide por permisos
 * (`puedeEntrarAlPanel`, lib/permissions.js). Sólo queda como lista de
 * referencia del bloque de grants.
 */
export const PANEL_ROLES = [
  'ADMIN', 'DESARROLLADOR_WEB', 'EDITORA_BLOG', 'DISTRIBUCION',
  'GERENTE_TIENDA', 'COLABORADOR_TIENDA', 'GERENTE_ALMACEN', 'JEFE_DE_ALMACEN',
  'COLABORADOR_ALMACEN', 'REDES_SOCIALES',
];

/**
 * Roles que gestionan la bóveda (escriben secretos: permiso `boveda:write`).
 *
 * Conservan SIEMPRE acceso a la contraseña de cualquier secreto, aunque el
 * gestor la restrinja a otros roles. Sin este bypass, un gestor podría
 * quitarse a sí mismo el acceso y dejaría el secreto sin nadie que pueda
 * auditarlo ni corregirlo (§40).
 */
export const ROLES_GESTORES_BOVEDA = ['ADMIN', 'DESARROLLADOR_WEB'];

/**
 * Lista de RESPALDO del selector de roles del formulario de usuarios.
 *
 * No es una segunda matriz de permisos: sólo `nombre` + `etiqueta` para poder
 * pintar el bloque de roles cuando `GET /auth/roles` no contesta (p. ej. el
 * endpoint aún no desplegado). El backend sigue validando cada rol en el alta,
 * así que un rol inventado o caducado aquí acaba en un 400 visible en el
 * formulario. Mientras el servidor responda se usa SIEMPRE su catálogo.
 * Etiquetas espejo de `roles` (BD) / `CATALOGO_ROLES` (backend).
 */
export const ROLES_RESPALDO = [
  { nombre: 'ADMIN', etiqueta: 'Administrador', panel: true },
  { nombre: 'DESARROLLADOR_WEB', etiqueta: 'Desarrollador web', panel: true },
  { nombre: 'EDITORA_BLOG', etiqueta: 'Editora de blog', panel: true },
  { nombre: 'DISTRIBUCION', etiqueta: 'Distribución', panel: true },
  { nombre: 'REDES_SOCIALES', etiqueta: 'Redes sociales', panel: false },
  { nombre: 'GERENTE_TIENDA', etiqueta: 'Gerente de tienda', panel: true },
  { nombre: 'COLABORADOR_TIENDA', etiqueta: 'Colaborador de tienda', panel: true },
  { nombre: 'GERENTE_ALMACEN', etiqueta: 'Gerente de almacén', panel: true },
  { nombre: 'JEFE_DE_ALMACEN', etiqueta: 'Jefe de almacén', panel: true },
  { nombre: 'COLABORADOR_ALMACEN', etiqueta: 'Colaborador de almacén', panel: true },
  { nombre: 'CLIENTE', etiqueta: 'Cliente', panel: false },
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
