import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { MAXIMO_GRANTS, TTL_GRANT_MS, crearAlmacenGrants } from './grants.js';

function conReloj() {
  let reloj = 1_000_000;
  return {
    ahora: () => reloj,
    avanzar: (ms) => { reloj += ms; },
  };
}

const USUARIO = { sub: 'user-1', proposito: 'reveal', itemRef: 'item-1' };

describe('grants de step-up (§13 / R38–R40)', () => {
  test('emitir y consumir una vez devuelve true', () => {
    const almacen = crearAlmacenGrants({ ahora: () => 1000 });
    const token = almacen.emitir(USUARIO);
    assert.equal(typeof token, 'string');
    assert.ok(token.length >= 40, 'token de 32 bytes en base64url');
    assert.equal(almacen.consumir(token, USUARIO), true);
  });

  test('R38: es de un solo uso', () => {
    const almacen = crearAlmacenGrants({ ahora: () => 1000 });
    const token = almacen.emitir(USUARIO);
    assert.equal(almacen.consumir(token, USUARIO), true);
    assert.equal(almacen.consumir(token, USUARIO), false);
  });

  test('R39/R40: el propósito, el item y el usuario quedan ligados', () => {
    const almacen = crearAlmacenGrants({ ahora: () => 1000 });

    const porProposito = almacen.emitir(USUARIO);
    assert.equal(
      almacen.consumir(porProposito, { ...USUARIO, proposito: 'export' }),
      false,
      'propósito distinto',
    );
    assert.equal(
      almacen.consumir(porProposito, USUARIO),
      false,
      'el intento erróneo ya gastó el grant',
    );

    const porItem = almacen.emitir(USUARIO);
    assert.equal(almacen.consumir(porItem, { ...USUARIO, itemRef: 'item-2' }), false, 'item distinto');
    assert.equal(almacen.consumir(porItem, USUARIO), false);

    const porUsuario = almacen.emitir(USUARIO);
    assert.equal(almacen.consumir(porUsuario, { ...USUARIO, sub: 'user-2' }), false, 'usuario distinto');
    assert.equal(almacen.consumir(porUsuario, USUARIO), false);

    // Con un grant fresco, el uso correcto sí pasa.
    const correcto = almacen.emitir(USUARIO);
    assert.equal(almacen.consumir(correcto, USUARIO), true);
    assert.equal(almacen.activos(), 0, 'no quedan grants vivos');
  });

  test('R38: caduca a los 60 s', () => {
    const reloj = conReloj();
    const almacen = crearAlmacenGrants({ ahora: reloj.ahora, ttlMs: TTL_GRANT_MS });
    const token = almacen.emitir(USUARIO);

    reloj.avanzar(TTL_GRANT_MS - 1);
    assert.equal(almacen.consumir(token, USUARIO), true, 'dentro de la ventana');

    const otro = almacen.emitir(USUARIO);
    reloj.avanzar(TTL_GRANT_MS);
    assert.equal(almacen.consumir(otro, USUARIO), false, 'fuera de la ventana');
  });

  test('un token nunca emitido no consume nada', () => {
    const almacen = crearAlmacenGrants({ ahora: () => 1000 });
    assert.equal(almacen.consumir('token-inventado', USUARIO), false);
    assert.equal(almacen.consumir('', USUARIO), false);
    assert.equal(almacen.consumir(undefined, USUARIO), false);
  });

  test('los tokens son únicos', () => {
    const almacen = crearAlmacenGrants({ ahora: () => 1000 });
    const tokens = new Set();
    for (let i = 0; i < 50; i += 1) tokens.add(almacen.emitir(USUARIO));
    assert.equal(tokens.size, 50);
  });

  test('limpiar() descarta todo (logout / auto-lock)', () => {
    const almacen = crearAlmacenGrants({ ahora: () => 1000 });
    const token = almacen.emitir(USUARIO);
    assert.equal(almacen.activos(), 1);
    almacen.limpiar();
    assert.equal(almacen.activos(), 0);
    assert.equal(almacen.consumir(token, USUARIO), false);
  });

  test('el tope de grants activos no crece sin límite', () => {
    const almacen = crearAlmacenGrants({ ahora: () => 1000, maximo: MAXIMO_GRANTS });
    for (let i = 0; i < MAXIMO_GRANTS + 20; i += 1) almacen.emitir(USUARIO);
    assert.ok(almacen.activos() <= MAXIMO_GRANTS);
  });

  test('exige sub y proposito al emitir', () => {
    const almacen = crearAlmacenGrants({ ahora: () => 1000 });
    assert.throws(() => almacen.emitir({ proposito: 'reveal' }), /falta sub/);
    assert.throws(() => almacen.emitir({ sub: 'u' }), /falta proposito/);
  });

  test('itemRef null funciona para operaciones que no son de un ítem', () => {
    const almacen = crearAlmacenGrants({ ahora: () => 1000 });
    const token = almacen.emitir({ sub: 'user-1', proposito: 'export' });
    assert.equal(almacen.consumir(token, { sub: 'user-1', proposito: 'export' }), true);
  });
});
