/**
 * Visibilidad de contraseñas por rol — Bóveda Segura V5 §40.
 *
 * `node --test` sobre `frontend/src/lib/vault/*.test.js` (ver AGENTS.md §4).
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ROLES_GESTORES_BOVEDA,
  normalizarRolesVisibles,
  alternarRolVisible,
  puedeVerContrasena,
  etiquetaVisibilidad,
} from './visibilidad.js';

test('normalizarRolesVisibles: null/undefined → sin restricción', () => {
  assert.equal(normalizarRolesVisibles(null), null);
  assert.equal(normalizarRolesVisibles(undefined), null);
});

test('normalizarRolesVisibles: un array vacío es una restricción, no «sin restricción»', () => {
  assert.deepEqual(normalizarRolesVisibles([]), []);
});

test('normalizarRolesVisibles: descarta lo que no es string y quita duplicados', () => {
  assert.deepEqual(
    normalizarRolesVisibles(['ADMIN', 'ADMIN', 42, null, '', 'DISTRIBUCION']),
    ['ADMIN', 'DISTRIBUCION'],
  );
});

test('normalizarRolesVisibles: un valor que no es array se trata como sin restricción', () => {
  assert.equal(normalizarRolesVisibles('ADMIN'), null);
  assert.equal(normalizarRolesVisibles(7), null);
});

test('normalizarRolesVisibles: recorta los espacios pero conserva el nombre', () => {
  assert.deepEqual(normalizarRolesVisibles([' ADMIN ']), ['ADMIN']);
});

test('alternarRolVisible: añade un rol a una lista sin restringir', () => {
  assert.deepEqual(alternarRolVisible(null, 'GERENTE_TIENDA'), ['GERENTE_TIENDA']);
});

test('alternarRolVisible: quita un rol que ya estaba', () => {
  assert.deepEqual(
    alternarRolVisible(['ADMIN', 'GERENTE_TIENDA'], 'GERENTE_TIENDA'),
    ['ADMIN'],
  );
});

test('alternarRolVisible: un rol vacío o ausente no cambia nada', () => {
  assert.deepEqual(alternarRolVisible(['ADMIN'], ''), ['ADMIN']);
  assert.deepEqual(alternarRolVisible(['ADMIN'], undefined), ['ADMIN']);
});

test('alternarRolVisible: quitar el último rol deja la lista restringida y vacía', () => {
  assert.deepEqual(alternarRolVisible(['GERENTE_TIENDA'], 'GERENTE_TIENDA'), []);
});

test('puedeVerContrasena: sin restricción, todo el mundo ve', () => {
  assert.equal(puedeVerContrasena({ rolesVisibles: null, rolesUsuario: [] }), true);
  assert.equal(
    puedeVerContrasena({ rolesVisibles: null, rolesUsuario: ['COLABORADOR_ALMACEN'] }),
    true,
  );
});

test('puedeVerContrasena: con restricción, sólo los roles marcados', () => {
  const rolesVisibles = ['GERENTE_TIENDA'];
  assert.equal(
    puedeVerContrasena({ rolesVisibles, rolesUsuario: ['GERENTE_TIENDA'] }),
    true,
  );
  assert.equal(
    puedeVerContrasena({ rolesVisibles, rolesUsuario: ['COLABORADOR_TIENDA'] }),
    false,
  );
});

test('puedeVerContrasena: multi-rol, vale con uno de los roles', () => {
  assert.equal(
    puedeVerContrasena({
      rolesVisibles: ['GERENTE_TIENDA'],
      rolesUsuario: ['COLABORADOR_TIENDA', 'GERENTE_TIENDA'],
    }),
    true,
  );
});

test('puedeVerContrasena: los gestores conservan SIEMPRE el acceso', () => {
  for (const gestor of ROLES_GESTORES_BOVEDA) {
    assert.equal(
      puedeVerContrasena({ rolesVisibles: ['DISTRIBUCION'], rolesUsuario: [gestor] }),
      true,
      `${gestor} debe conservar el acceso`,
    );
  }
});

test('puedeVerContrasena: una lista vacía deja la contraseña a los gestores sólo', () => {
  assert.equal(puedeVerContrasena({ rolesVisibles: [], rolesUsuario: ['GERENTE_TIENDA'] }), false);
  assert.equal(puedeVerContrasena({ rolesVisibles: [], rolesUsuario: ['ADMIN'] }), true);
});

test('puedeVerContrasena: sin roles de usuario, nadie ve (fail-closed)', () => {
  assert.equal(puedeVerContrasena({ rolesVisibles: ['ADMIN'], rolesUsuario: [] }), false);
  assert.equal(puedeVerContrasena({ rolesVisibles: ['ADMIN'], rolesUsuario: null }), false);
});

test('etiquetaVisibilidad: describe la regla en lenguaje llano', () => {
  assert.match(etiquetaVisibilidad(null), /Sin restricción/);
  assert.match(etiquetaVisibilidad([]), /ADMIN/);
  assert.match(etiquetaVisibilidad(['GERENTE_TIENDA']), /GERENTE_TIENDA/);
});
