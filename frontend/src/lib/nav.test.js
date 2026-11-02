import { test } from 'node:test';
import assert from 'node:assert/strict';

import { VISTAS_CON_BYPASS, seccionVisible, navVisibleDe, resolverVista } from './nav.js';
import { abilityDe } from './permissions.js';

/**
 * `can` real (CASL) construido desde permisos en formato `recurso:acción`,
 * igual que los que manda `GET /auth/permissions`. Denegar por defecto.
 */
const canDe = (permisos) => {
  const ability = abilityDe(permisos);
  return (perm) => ability.can('read', perm);
};

const NAV = [
  { key: 'dashboard', perm: 'menu:dashboard' },
  { key: 'servicio_tecnico', perm: 'menu:servicio_tecnico' },
  { key: 'productos', perm: 'menu:productos' },
  { key: 'citas', perm: 'menu:citas' },
  { key: 'agenda_citas', perm: 'menu:agenda-citas' },
  { key: 'boveda', perm: 'menu:boveda' },
];

const SUBVISTAS = { producto_form: 'productos' };

test('seccionVisible: sólo lo que concede la matriz', () => {
  const can = canDe(['menu:citas:read', 'menu:agenda-citas:read']);
  assert.equal(seccionVisible({ key: 'citas', perm: 'menu:citas' }, can, []), true);
  assert.equal(seccionVisible({ key: 'boveda', perm: 'menu:boveda' }, can, []), false);
  assert.equal(seccionVisible({ key: 'dashboard', perm: 'menu:dashboard' }, can, []), false);
});

test('seccionVisible: el bypass de Servicio Técnico es por rol', () => {
  const can = canDe([]);
  assert.deepEqual(VISTAS_CON_BYPASS.servicio_tecnico, ['ADMIN', 'DESARROLLADOR_WEB']);
  assert.equal(seccionVisible({ key: 'servicio_tecnico', perm: 'menu:servicio_tecnico' }, can, ['ADMIN']), true);
  assert.equal(seccionVisible({ key: 'servicio_tecnico', perm: 'menu:servicio_tecnico' }, can, ['DESARROLLADOR_WEB']), true);
  // El resto de roles: la matriz no manda ese permiso, así que no la ven.
  assert.equal(seccionVisible({ key: 'servicio_tecnico', perm: 'menu:servicio_tecnico' }, can, ['GERENTE_TIENDA']), false);
  assert.equal(seccionVisible({ key: 'servicio_tecnico', perm: 'menu:servicio_tecnico' }, can, []), false);
});

test('seccionVisible: sin permiso declarado o sin `can` nunca concede', () => {
  assert.equal(seccionVisible({ key: 'citas', perm: 'menu:citas' }, () => false), false);
  assert.equal(seccionVisible({ key: 'citas' }, () => true), false);
  assert.equal(seccionVisible({ key: 'citas', perm: 'menu:citas' }), false);
  assert.equal(seccionVisible(null, () => true), false);
});

test('navVisibleDe conserva el orden del catálogo y no duplica', () => {
  const can = canDe(['menu:boveda:read', 'menu:citas:read', 'menu:dashboard:read']);
  const visibles = navVisibleDe(NAV, can, []);
  assert.deepEqual(visibles.map((i) => i.key), ['dashboard', 'citas', 'boveda']);
});

test('un rol de tienda ve sólo las secciones de citas', () => {
  // Matriz real de GERENTE_TIENDA / COLABORADOR_TIENDA tras el recorte.
  const permisosRolTienda = [
    'citas:read', 'citas:update', 'menu:citas:read', 'menu:agenda-citas:read',
  ];
  const visibles = navVisibleDe(NAV, canDe(permisosRolTienda), ['GERENTE_TIENDA']);
  assert.deepEqual(visibles.map((i) => i.key), ['citas', 'agenda_citas']);
  // Ni dashboard, ni productos, ni bóveda, ni servicio técnico.
  for (const clave of ['dashboard', 'productos', 'boveda', 'servicio_tecnico']) {
    assert.equal(visibles.some((i) => i.key === clave), false, `no debería ver ${clave}`);
  }
});

test('resolverVista deja abrir lo que la sesión ve', () => {
  const can = canDe(['menu:citas:read', 'menu:agenda-citas:read']);
  assert.equal(resolverVista(NAV, can, [], 'agenda_citas', SUBVISTAS, 'dashboard'), 'agenda_citas');
  assert.equal(resolverVista(NAV, can, [], 'citas', SUBVISTAS, 'dashboard'), 'citas');
});

test('resolverVista redirige una vista prohibida a la primera visible', () => {
  const can = canDe(['menu:citas:read', 'menu:agenda-citas:read']);
  // `navigateTo('productos')` sin permiso: no monta Productos.
  assert.equal(resolverVista(NAV, can, [], 'productos', SUBVISTAS, 'dashboard'), 'citas');
  assert.equal(resolverVista(NAV, can, [], 'boveda', SUBVISTAS, 'dashboard'), 'citas');
  // La URL de entrada por defecto (dashboard) también se redirige.
  assert.equal(resolverVista(NAV, can, [], 'dashboard', SUBVISTAS, 'dashboard'), 'citas');
});

test('resolverVista admite subvistas de una sección visible', () => {
  const can = canDe(['menu:productos:read']);
  assert.equal(resolverVista(NAV, can, [], 'producto_form', SUBVISTAS, 'dashboard'), 'producto_form');
  // …y las redirige si la sección contenedora no está visible.
  const soloCitas = canDe(['menu:citas:read']);
  assert.equal(resolverVista(NAV, soloCitas, [], 'producto_form', SUBVISTAS, 'dashboard'), 'citas');
});

test('resolverVista: si la sesión no ve nada, devuelve la reserva', () => {
  const can = canDe([]);
  assert.equal(resolverVista(NAV, can, [], 'dashboard', SUBVISTAS, 'dashboard'), 'dashboard');
  assert.equal(resolverVista(NAV, can, [], 'citas', SUBVISTAS, null), null);
});

test('resolverVista: la landing de quien sólo ve una sección es esa sección', () => {
  const can = canDe(['menu:boveda:read']);
  assert.equal(resolverVista(NAV, can, [], 'dashboard', SUBVISTAS, 'dashboard'), 'boveda');
});
