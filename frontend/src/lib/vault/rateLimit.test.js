import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { MAX_INTENTOS_STEPUP, VENTANA_STEPUP_MS } from './params.js';
import { crearLimitador, limitadorStepUp } from './rateLimit.js';

/** Reloj controlado: la ventana de 60 s se prueba sin esperar 60 s. */
function relojFalso(inicio = 1_000_000) {
  let t = inicio;
  return {
    ahora: () => t,
    avanzar: (ms) => { t += ms; },
  };
}

describe('rate limit de step-up (§52)', () => {
  test('fail-closed: parámetros inválidos lanzan, nunca dejan sin límite', () => {
    assert.throws(() => crearLimitador({ max: 0, ventanaMs: 1000 }), /max/);
    assert.throws(() => crearLimitador({ max: -1, ventanaMs: 1000 }), /max/);
    assert.throws(() => crearLimitador({ max: NaN, ventanaMs: 1000 }), /max/);
    assert.throws(() => crearLimitador({ max: 1.5, ventanaMs: 1000 }), /max/);
    assert.throws(() => crearLimitador({ max: 3, ventanaMs: 0 }), /ventanaMs/);
    assert.throws(() => crearLimitador({ max: 3, ventanaMs: NaN }), /ventanaMs/);
    assert.throws(() => crearLimitador({ max: 3, ventanaMs: -5 }), /ventanaMs/);
  });

  test('permite hasta el techo y corta el intento siguiente', () => {
    const reloj = relojFalso();
    const lim = crearLimitador({ max: 3, ventanaMs: 1000, ahora: reloj.ahora });

    assert.equal(lim.consumir('u:reveal'), true);
    assert.equal(lim.consumir('u:reveal'), true);
    assert.equal(lim.consumir('u:reveal'), true);
    // El cuarto NO se permite y tampoco cuenta: si contara, la ventana
    // nunca se liberaría (una denegación no puede penalizar más).
    assert.equal(lim.consumir('u:reveal'), false);
    assert.equal(lim.consumir('u:reveal'), false);
    assert.equal(lim.restantes('u:reveal'), 0);
  });

  test('la ventana es deslizante: al vencer las marcas se liberan', () => {
    const reloj = relojFalso();
    const lim = crearLimitador({ max: 2, ventanaMs: 1000, ahora: reloj.ahora });

    lim.consumir('u:export');
    lim.consumir('u:export');
    assert.equal(lim.consumir('u:export'), false);

    reloj.avanzar(999);
    assert.equal(lim.consumir('u:export'), false, 'aún no venció');

    reloj.avanzar(2);
    assert.equal(lim.consumir('u:export'), true, 'la marca más antigua ya venció');
    assert.equal(lim.consumir('u:export'), true);
    assert.equal(lim.consumir('u:export'), false);
  });

  test('las marcas caducan una a una, no todas a la vez', () => {
    const reloj = relojFalso();
    const lim = crearLimitador({ max: 2, ventanaMs: 1000, ahora: reloj.ahora });

    lim.consumir('k');
    reloj.avanzar(600);
    lim.consumir('k');
    // Sólo la primera marca vence a los 1000 ms, no la segunda.
    reloj.avanzar(500); // t = 1100
    assert.equal(lim.restantes('k'), 1, 'sólo caducó la primera marca');
    assert.equal(lim.consumir('k'), true);
    assert.equal(lim.restantes('k'), 0);
  });

  test('las claves están aisladas: agotar reveal no bloquea copy ni export', () => {
    const reloj = relojFalso();
    const lim = crearLimitador({ max: 1, ventanaMs: 1000, ahora: reloj.ahora });

    assert.equal(lim.consumir('u:reveal'), true);
    assert.equal(lim.consumir('u:reveal'), false);
    assert.equal(lim.consumir('u:copy'), true);
    assert.equal(lim.consumir('u:export'), true);
    assert.equal(lim.consumir('otro-usuario:reveal'), true);
  });

  test('restantes() informa sin consumir', () => {
    const lim = crearLimitador({ max: 4, ventanaMs: 1000, ahora: relojFalso().ahora });
    assert.equal(lim.restantes('k'), 4);
    assert.equal(lim.restantes('k'), 4);
    assert.equal(lim.restantes('k'), 4);
    lim.consumir('k');
    assert.equal(lim.restantes('k'), 3);
  });

  test('limpiar() NO rebaja una ventana en curso (no puede burlarse borrando)', () => {
    const reloj = relojFalso();
    const lim = crearLimitador({ max: 2, ventanaMs: 1000, ahora: reloj.ahora });

    lim.consumir('k');
    lim.consumir('k');
    assert.equal(lim.consumir('k'), false);

    lim.limpiar();
    assert.equal(lim.consumir('k'), false, 'limpiar no debe resetear la ventana');
    assert.equal(lim.restantes('k'), 0);
  });

  test('limpiar() sí descarta claves cuya ventana venció entera', () => {
    const reloj = relojFalso();
    const lim = crearLimitador({ max: 1, ventanaMs: 1000, ahora: reloj.ahora });

    lim.consumir('vieja');
    reloj.avanzar(5000);
    lim.limpiar();
    // Al estar vacía, restantes devuelve el techo completo.
    assert.equal(lim.restantes('vieja'), 1);
  });

  test('consumir exige una clave: sin clave no hay límite que aplicar', () => {
    const lim = crearLimitador({ max: 3, ventanaMs: 1000, ahora: relojFalso().ahora });
    assert.throws(() => lim.consumir(''), /clave/);
    assert.throws(() => lim.consumir(null), /clave/);
    assert.throws(() => lim.consumir(undefined), /clave/);
    assert.throws(() => lim.consumir(42), /clave/);
  });

  test('la instancia compartida respeta los parámetros de §52', () => {
    assert.equal(limitadorStepUp.restantes('x:y'), MAX_INTENTOS_STEPUP);
    assert.ok(VENTANA_STEPUP_MS >= 1000);
    assert.ok(MAX_INTENTOS_STEPUP >= 3);
  });

  test('reiniciar() sólo lo usan los tests', () => {
    const lim = crearLimitador({ max: 1, ventanaMs: 60_000, ahora: relojFalso().ahora });
    lim.consumir('k');
    assert.equal(lim.consumir('k'), false);
    lim.reiniciar();
    assert.equal(lim.consumir('k'), true);
  });
});
