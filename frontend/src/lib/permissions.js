/**
 * Ability CASL del panel, construida a partir de los permisos que devuelve el
 * backend (`GET /auth/permissions`).
 *
 * Fuente única = matriz del servidor (`greenline/backend/src/config/
 * permissions.js`). El cliente NO guarda ninguna lista de roles por recurso:
 * sólo recibe `['usuarios:read', 'menu:boveda:read', …]` y monta la ability.
 *
 * Formato del permiso: `sujeto:acción`; la ÚLTIMA parte es la acción y el
 * resto el sujeto (igual que en el servidor, para que ambos parseos
 * coincidan siempre):
 *   'usuarios:read'          → can('read', 'usuarios')
 *   'stock:almacen:write'    → can('write', 'stock:almacen')
 *   'menu:boveda:read'       → can('read', 'menu:boveda')
 *
 * Denegar por defecto: un permiso desconocido o mal formado no genera regla.
 */

import { createMongoAbility } from '@casl/ability';

/**
 * Parte `sujeto:acción` en la regla CASL.
 * @param {string} permiso
 * @returns {{ action: string, subject: string } | null}
 */
export function parsePermiso(permiso) {
  const texto = String(permiso || '');
  const i = texto.lastIndexOf(':');
  if (i <= 0 || i === texto.length - 1) return null;
  const subject = texto.slice(0, i);
  const action = texto.slice(i + 1);
  if (!subject || !action) return null;
  return { action, subject };
}

/**
 * Ability a partir de la lista de permisos de la sesión.
 * Lista vacía/ausente → ability que no permite nada (la sesión todavía no ha
 * cargado los permisos: mejor parpadeo de menú vacío que un menú que se
 * muestra de más).
 * @param {string[] | null | undefined} permisos
 */
export function abilityDe(permisos) {
  const reglas = (Array.isArray(permisos) ? permisos : [])
    .map(parsePermiso)
    .filter(Boolean);
  return createMongoAbility(reglas);
}

/** Ability "sin permisos": se usa antes de que llegue la respuesta del servidor. */
export const ABILITY_VACIA = abilityDe([]);
