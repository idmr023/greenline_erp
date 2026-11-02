import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  esPrecioPorCuotas,
  numeroCuotas,
  precioPorCuotasDe,
} from './precioCuotas.js';

/**
 * Precio por cuotas (categorías tipo scooters): en vez del precio tachado y
 * el % de descuento se muestran el precio, el precio en cuotas y el valor de
 * cada cuota. El número de cuotas se DERIVA del total y la cuota.
 */

test('sólo las categorías marcadas se muestran por cuotas', () => {
  assert.equal(esPrecioPorCuotas({ precio_por_cuotas: true }), true);
  assert.equal(esPrecioPorCuotas({ precio_por_cuotas: false }), false);
  assert.equal(esPrecioPorCuotas({}), false);
  assert.equal(esPrecioPorCuotas(null), false);
  assert.equal(esPrecioPorCuotas(undefined), false);
});

test('el número de cuotas se deriva del total y la cuota', () => {
  assert.equal(numeroCuotas({ precio_cuotas: 3840, precio_cuota: 320 }), 12);
  assert.equal(numeroCuotas({ precio_cuotas: 3000, precio_cuota: 250 }), 12);
  // Redondea: 3840 / 320 puede dar 11.999999 por coma flotante.
  assert.equal(numeroCuotas({ precio_cuotas: 1079.99, precio_cuota: 90 }), 12);
});

test('sin total o sin cuota no hay número de cuotas', () => {
  assert.equal(numeroCuotas({ precio_cuotas: 3840 }), null);
  assert.equal(numeroCuotas({ precio_cuota: 320 }), null);
  assert.equal(numeroCuotas({ precio_cuotas: 3840, precio_cuota: 0 }), null);
  assert.equal(numeroCuotas({}), null);
  assert.equal(numeroCuotas(null), null);
});

test('precioPorCuotasDe devuelve los tres importes', () => {
  const d = precioPorCuotasDe({
    precio_actual: 3500,
    precio_cuotas: 3840,
    precio_cuota: 320,
  });
  assert.deepEqual(d, { precio: 3500, total: 3840, cuota: 320, numCuotas: 12 });
});

test('precioPorCuotasDe tolera lo que falte', () => {
  const d = precioPorCuotasDe({ precio_actual: 3500 });
  assert.deepEqual(d, { precio: 3500, total: null, cuota: null, numCuotas: null });
  assert.deepEqual(precioPorCuotasDe(null), {
    precio: null, total: null, cuota: null, numCuotas: null,
  });
});
