import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parsePermiso, abilityDe, ABILITY_VACIA, puedeEntrarAlPanel } from './permissions.js';

test('parsePermiso parte el sujeto y la acción como el backend', () => {
  assert.deepEqual(parsePermiso('usuarios:read'), { action: 'read', subject: 'usuarios' });
  assert.deepEqual(parsePermiso('stock:almacen:write'), { action: 'write', subject: 'stock:almacen' });
  assert.deepEqual(parsePermiso('menu:boveda:read'), { action: 'read', subject: 'menu:boveda' });
  assert.deepEqual(parsePermiso('panel:acceso'), { action: 'acceso', subject: 'panel' });
});

test('parsePermiso ignora lo mal formado (denegar por defecto)', () => {
  for (const malo of ['sin-accion', ':read', 'usuarios:', '', null, undefined, 42]) {
    assert.equal(parsePermiso(malo), null, `debería rechazar ${String(malo)}`);
  }
});

test('sin permisos no se permite nada (la sesión aún no ha cargado)', () => {
  assert.equal(ABILITY_VACIA.can('read', 'menu:dashboard'), false);
  assert.equal(abilityDe(null).can('read', 'usuarios'), false);
  assert.equal(abilityDe([]).can('read', 'usuarios'), false);
});

test('abilityDe monta exactamente las reglas que manda el servidor', () => {
  const ability = abilityDe(['usuarios:read', 'menu:usuarios:read', 'boveda:write']);
  assert.equal(ability.can('read', 'usuarios'), true);
  assert.equal(ability.can('delete', 'usuarios'), false);
  assert.equal(ability.can('read', 'menu:usuarios'), true);
  assert.equal(ability.can('write', 'boveda'), true);
  // nada más allá de lo enviado
  assert.equal(ability.can('read', 'metricas'), false);
  assert.equal(ability.can('read', 'menu:metricas'), false);
});

test('los permisos desconocidos o corruptos no otorgan nada', () => {
  const ability = abilityDe(['usuarios:read', 'basura', ':roto', 'sinaccion', '']);
  assert.equal(ability.can('read', 'usuarios'), true);
  assert.equal(ability.can('read', 'basura'), false);
  assert.equal(ability.can('roto', ''), false);
});

test('multi-rol: la ability es la unión de lo que manda el servidor', () => {
  // EDITORA_BLOG + extra ADMIN → el backend manda la unión en una sola lista
  const ability = abilityDe(['menu:blog:read', 'menu:boveda:read', 'usuarios:read', 'config:read']);
  assert.equal(ability.can('read', 'menu:blog'), true);
  assert.equal(ability.can('read', 'menu:boveda'), true);
  assert.equal(ability.can('read', 'usuarios'), true);
  assert.equal(ability.can('read', 'config'), true);
  assert.equal(ability.can('update', 'config'), false);
  // y sigue sin tener escritura de bóveda si el servidor no la dio
  assert.equal(ability.can('write', 'boveda'), false);
});

test('coincidencia exacta de sujetos: no se cuela un sujeto parecido', () => {
  const ability = abilityDe(['stock:almacen:write']);
  assert.equal(ability.can('write', 'stock:almacen'), true);
  assert.equal(ability.can('write', 'stock:tienda'), false);
  assert.equal(ability.can('write', 'stock'), false);
  assert.equal(ability.can('read', 'stock:almacen'), false);
});

test('puedeEntrarAlPanel: exige al menos un menú legible', () => {
  // Sesión todavía sin permisos cargados → no se abre el panel.
  assert.equal(puedeEntrarAlPanel(ABILITY_VACIA), false);
  assert.equal(puedeEntrarAlPanel(null), false);
  assert.equal(puedeEntrarAlPanel(undefined), false);

  // Permisos de recurso pero ningún menú: no hay sección que mostrar.
  assert.equal(puedeEntrarAlPanel(abilityDe(['productos:read', 'usuarios:read'])), false);

  // Cualquier sección legible basta (dashboard, blog, roles…).
  assert.equal(puedeEntrarAlPanel(abilityDe(['menu:dashboard:read'])), true);
  assert.equal(puedeEntrarAlPanel(abilityDe(['menu:blog:read'])), true);
  assert.equal(puedeEntrarAlPanel(abilityDe(['productos:read', 'menu:roles:read'])), true);
});

test('puedeEntrarAlPanel no mira la escritura: un editor de blog entra', () => {
  // EDITORA_BLOG sólo tiene lectura de menú: no puede gestionar usuarios ni
  // roles, pero /admin es su panel.
  const ability = abilityDe(['menu:blog:read', 'blog:update', 'menu:boveda:read']);
  assert.equal(puedeEntrarAlPanel(ability), true);
  assert.equal(ability.can('manage-roles', 'usuarios'), false);
});

test('puedeEntrarAlPanel deja entrar a un rol que el panel creó (sin lista fija)', () => {
  // Un rol inventado desde la pestaña «Roles» no está en ninguna lista del
  // cliente: si el servidor le dio un menú, entra.
  const ability = abilityDe(['menu:dashboard:read', 'productos:read']);
  assert.equal(puedeEntrarAlPanel(ability), true);
  // …y un rol con el mismo nombre pero sin menú, no.
  assert.equal(puedeEntrarAlPanel(abilityDe(['productos:read'])), false);
});
