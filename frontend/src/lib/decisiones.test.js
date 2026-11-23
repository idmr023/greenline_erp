import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatoPct, formatoVariacion, hoyLima, rangoDePeriodo, toCsv } from './decisiones.js';

test('hoy se toma en hora de Lima', () => {
  // 2026-11-21 03:00 UTC = 2026-11-20 22:00 en Lima
  assert.equal(hoyLima(Date.parse('2026-11-21T03:00:00Z')), '2026-11-20');
});

test('rangos predefinidos (ambos extremos incluidos)', () => {
  const hoy = '2026-11-20';
  assert.deepEqual(rangoDePeriodo('7d', hoy), { desde: '2026-11-14', hasta: hoy });
  assert.deepEqual(rangoDePeriodo('30d', hoy), { desde: '2026-10-22', hasta: hoy });
  assert.deepEqual(rangoDePeriodo('90d', hoy), { desde: '2026-08-23', hasta: hoy });
  assert.deepEqual(rangoDePeriodo('mes', hoy), { desde: '2026-11-01', hasta: hoy });
  assert.deepEqual(rangoDePeriodo('mes-anterior', hoy), { desde: '2026-10-01', hasta: '2026-10-31' });
  assert.deepEqual(rangoDePeriodo('mes-anterior', '2026-03-05'), { desde: '2026-02-01', hasta: '2026-02-28' });
});

test('formato de variación y porcentaje', () => {
  assert.equal(formatoVariacion(0.25), '+25 %');
  assert.equal(formatoVariacion(-0.1), '-10 %');
  assert.equal(formatoVariacion(0), '0 %');
  assert.equal(formatoVariacion(null), null);
  assert.equal(formatoPct(0.8), '80 %');
  assert.equal(formatoPct(null), '-');
});

test('toCsv: separador ;, coma decimal, comillas y BOM', () => {
  const csv = toCsv(
    [{ clave: 'nombre', titulo: 'Modelo' }, { clave: 'monto', titulo: 'Monto' }],
    [{ nombre: 'H5 "Pro"; rojo', monto: 1234.5 }, { nombre: 'TC2', monto: null }],
  );
  assert.equal(csv, '\uFEFFModelo;Monto\r\n"H5 ""Pro""; rojo";1234,5\r\nTC2;\r\n');
});

test('toCsv: neutraliza fórmulas de Excel', () => {
  const csv = toCsv([{ clave: 'x', titulo: 'X' }], [{ x: '=HYPERLINK("http://mal")' }, { x: '-1+1' }, { x: -5 }]);
  assert.equal(csv, '\uFEFFX\r\n"\'=HYPERLINK(""http://mal"")"\r\n\'-1+1\r\n-5\r\n');
});
