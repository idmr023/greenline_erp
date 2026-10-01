import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ADMIN_ROLES,
  STAFF_ROLES,
  PANEL_ROLES,
  ROLES_MAXIMOS,
  ROLES_BLOG,
  ROLES_DISTRIBUCION,
  rolesDe,
  tieneRol,
} from './roles.js';

test('ADMIN_ROLES es la autoridad máxima de /admin (unión de los es_* del backend)', () => {
  assert.deepEqual([...ADMIN_ROLES].sort(), ['ADMIN', 'DESARROLLADOR_WEB', 'DISTRIBUCION', 'EDITORA_BLOG']);
});

test('STAFF_ROLES contiene a los colaboradores por debajo y excluye el privilegio máximo', () => {
  assert.ok(STAFF_ROLES.includes('EDITORA_BLOG'));
  assert.ok(STAFF_ROLES.includes('DISTRIBUCION'));
  assert.ok(STAFF_ROLES.includes('GERENTE_TIENDA'));
  assert.ok(STAFF_ROLES.includes('COLABORADOR_TIENDA'));
  assert.ok(STAFF_ROLES.includes('GERENTE_ALMACEN'));
  assert.ok(STAFF_ROLES.includes('COLABORADOR_ALMACEN'));
  assert.ok(!STAFF_ROLES.includes('ADMIN'));
  assert.ok(!STAFF_ROLES.includes('DESARROLLADOR_WEB'));
});

test('PANEL_ROLES es exactamente ADMIN_ROLES ∪ STAFF_ROLES, sin duplicados', () => {
  const union = [...new Set([...ADMIN_ROLES, ...STAFF_ROLES])].sort();
  assert.deepEqual([...PANEL_ROLES].sort(), union);
  assert.equal(new Set(PANEL_ROLES).size, PANEL_ROLES.length);
  assert.equal(PANEL_ROLES.length, 8);
});

test('ninguna lista admite duplicados', () => {
  for (const lista of [ADMIN_ROLES, STAFF_ROLES, PANEL_ROLES, ROLES_MAXIMOS, ROLES_BLOG, ROLES_DISTRIBUCION]) {
    assert.equal(new Set(lista).size, lista.length, `duplicados en ${lista.join(',')}`);
  }
});

test('ROLES_MAXIMOS (RLS de escritura de la bóveda) está contenido en ADMIN_ROLES', () => {
  assert.deepEqual(ROLES_MAXIMOS, ['ADMIN', 'DESARROLLADOR_WEB']);
  for (const rol of ROLES_MAXIMOS) assert.ok(ADMIN_ROLES.includes(rol));
});

test('tieneRol es null-safe y no admite roles desconocidos', () => {
  assert.equal(tieneRol(ADMIN_ROLES, 'ADMIN'), true);
  assert.equal(tieneRol(ADMIN_ROLES, 'GERENTE_TIENDA'), false);
  assert.equal(tieneRol(ADMIN_ROLES, null), false);
  assert.equal(tieneRol(ADMIN_ROLES, undefined), false);
  assert.equal(tieneRol(null, 'ADMIN'), false);
  assert.equal(tieneRol('ADMIN', 'ADMIN'), false);
});

test('rolesDe une el rol primario y los adicionales sin duplicados', () => {
  assert.deepEqual(rolesDe({ rol: 'ADMIN', extraRoles: ['EDITORA_BLOG'] }), ['ADMIN', 'EDITORA_BLOG']);
  assert.deepEqual(rolesDe({ rol: 'ADMIN', extraRoles: ['ADMIN'] }), ['ADMIN']);
  assert.deepEqual(rolesDe({ rol: 'GERENTE_TIENDA', extraRoles: [] }), ['GERENTE_TIENDA']);
});

test('rolesDe prefiere `roles` calculado por el backend si existe', () => {
  assert.deepEqual(rolesDe({ rol: 'CLIENTE', extraRoles: ['ADMIN'], roles: ['ADMIN', 'DISTRIBUCION'] }),
    ['ADMIN', 'DISTRIBUCION']);
});

test('rolesDe es null-safe', () => {
  assert.deepEqual(rolesDe(null), []);
  assert.deepEqual(rolesDe(undefined), []);
  assert.deepEqual(rolesDe({}), []);
});

test('tieneRol acepta el array de roles efectivos (multi-rol)', () => {
  const efectivos = rolesDe({ rol: 'GERENTE_TIENDA', extraRoles: ['COLABORADOR_TIENDA'] });
  assert.equal(tieneRol(ADMIN_ROLES, efectivos), false);
  assert.equal(tieneRol(ROLES_BLOG, efectivos), false);
  assert.equal(tieneRol(PANEL_ROLES, efectivos), true);
  const mixto = rolesDe({ rol: 'GERENTE_TIENDA', extraRoles: ['EDITORA_BLOG'] });
  assert.equal(tieneRol(ROLES_BLOG, mixto), true);
  assert.equal(tieneRol(ADMIN_ROLES, rolesDe({ rol: 'ADMIN', extraRoles: ['EDITORA_BLOG'] })), true);
  assert.equal(tieneRol(ADMIN_ROLES, []), false);
});
