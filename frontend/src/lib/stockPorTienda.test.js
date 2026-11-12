import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  borradoresDeUbicacion, imagenesConStock, stockPorColor, stockPorColorAlmacen, totalBorradores, validarCantidadInicial,
} from './stockPorTienda.js';

describe('stock por tienda', () => {
  const colores = [
    { color_id: 1, nombre: 'Rojo' },
    { color_id: 2, nombre: 'Azul' },
    { color_id: 3, nombre: 'Negro' },
    { color_id: '', nombre: '' },
  ];
  const existencias = [
    { color_id: 1, tienda_id: 'a', stock: 2 },
    { color_id: 2, tienda_id: 'a', stock: 0 },
    { color_id: 3, tienda_id: 'b', stock: 5 },
  ];

  it('distingue cero de un color sin registro y no mezcla tiendas', () => {
    assert.deepEqual(
      stockPorColor(colores, existencias, 'a').map((color) => color.stockTienda),
      [2, 0, null],
    );
    assert.deepEqual(
      stockPorColor(colores, existencias, 'b').map((color) => color.stockTienda),
      [null, null, 5],
    );
  });

  it('muestra imágenes únicamente de colores con stock positivo', () => {
    const imagenes = [
      { url: 'rojo.png', color: 'Rojo' },
      { url: 'azul.png', color: 'Azul' },
      { url: 'negro.png', color: 'Negro' },
      { url: '', color: 'Rojo' },
    ];
    assert.deepEqual(
      imagenesConStock(imagenes, stockPorColor(colores, existencias, 'a')),
      [imagenes[0]],
    );
    assert.deepEqual(imagenesConStock(imagenes, stockPorColor(colores, [], 'a')), []);
  });

  it('muestra almacén de forma independiente y distingue cero de sin registro', () => {
    const almacen = [
      { color_id: 1, stock: 4 },
      { color_id: 2, stock: 0 },
    ];
    assert.deepEqual(
      stockPorColorAlmacen(colores, almacen).map((color) => color.stockTienda),
      [4, 0, null],
    );
    assert.deepEqual(
      imagenesConStock([{ url: 'rojo.png', color: 'Rojo' }], stockPorColorAlmacen(colores, almacen)),
      [{ url: 'rojo.png', color: 'Rojo' }],
    );
  });

  it('valida cantidades enteras dentro del rango de la base de datos', () => {
    assert.equal(validarCantidadInicial('0'), 0);
    assert.equal(validarCantidadInicial(' 42 '), 42);
    for (const valor of ['', '-1', '1.2', '1e3', '2147483648']) {
      assert.equal(validarCantidadInicial(valor), null);
    }
  });

  it('separa borradores por tienda y almacén', () => {
    const borradores = [
      { color_id: 1, tienda_id: 'a', stock: 3 },
      { color_id: 1, tienda_id: null, stock: 2 },
      { color_id: 2, tienda_id: 'b', stock: 0 },
    ];
    assert.deepEqual(borradoresDeUbicacion(borradores, 'a'), [borradores[0]]);
    assert.deepEqual(borradoresDeUbicacion(borradores, 'almacen'), [borradores[1]]);
    assert.equal(totalBorradores(borradores), 5);
    assert.equal(totalBorradores([]), 0);
  });
});
