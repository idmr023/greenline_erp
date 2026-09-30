import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  LONGITUDES,
  abrirPar,
  envolverPar,
  exigirPublica,
  firmar,
  generarParAsimetrico,
  huella,
  intercambiarClave,
  verificarFirma,
} from './asimetrica.js';
import { PROPOSITOS, desenvolverClave } from './envelope.js';
import { bytesAleatorios, igualdadConstante } from './random.js';

const CONTEXTO = Object.freeze({ vaultId: 'vault-1', keyVersion: 1 });
const KEK = bytesAleatorios(32);

describe('capa asimétrica §6.2 (Fase 5.1)', () => {
  test('genera un par de longitudes correctas y públicas derivables', () => {
    const par = generarParAsimetrico();
    assert.equal(par.firma.privada.length, LONGITUDES.privada);
    assert.equal(par.firma.publica.length, LONGITUDES.publica);
    assert.equal(par.canje.privada.length, LONGITUDES.privada);
    assert.equal(par.canje.publica.length, LONGITUDES.publica);

    const otro = generarParAsimetrico();
    assert.equal(igualdadConstante(par.firma.privada, otro.firma.privada), false);
    assert.equal(igualdadConstante(par.canje.privada, otro.canje.privada), false);

    assert.equal(igualdadConstante(exigirPublica(par.firma.publica), par.firma.publica), true);
    assert.equal(huella(par.firma.publica), huella(Uint8Array.from(par.firma.publica)));
    assert.notEqual(huella(par.firma.publica), huella(par.canje.publica));
  });

  test('R6: las envolturas no contienen la privada en claro', async () => {
    const par = generarParAsimetrico();
    const envueltas = await envolverPar(par, KEK, CONTEXTO);

    assert.equal(igualdadConstante(envueltas.firma.envoltura.ciphertext, par.firma.privada), false);
    assert.equal(igualdadConstante(envueltas.canje.envoltura.ciphertext, par.canje.privada), false);
    assert.equal(igualdadConstante(envueltas.firma.publica, par.firma.publica), true);
    assert.equal(igualdadConstante(envueltas.canje.publica, par.canje.publica), true);

    // Ni el ciphertext ni el tag llevan dentro el material privado.
    const parEnclaro = concatenar(par.firma.privada, par.canje.privada);
    for (const mitad of [envueltas.firma, envueltas.canje]) {
      const crudo = concatenar(mitad.envoltura.ciphertext, mitad.envoltura.tag, mitad.envoltura.nonce);
      assert.notDeepEqual(crudo.subarray(0, parEnclaro.length), parEnclaro);
    }
  });

  test('el par envuelto vuelve a abrirse con la misma KEK', async () => {
    const par = generarParAsimetrico();
    const envueltas = await envolverPar(par, KEK, CONTEXTO);
    const abierta = await abrirPar(envueltas, KEK, CONTEXTO);

    assert.equal(igualdadConstante(abierta.firma.privada, par.firma.privada), true);
    assert.equal(igualdadConstante(abierta.canje.privada, par.canje.privada), true);
    assert.equal(igualdadConstante(abierta.firma.publica, par.firma.publica), true);
    assert.equal(igualdadConstante(abierta.canje.publica, par.canje.publica), true);
  });

  test('R10: las dos envolturas no se pueden intercambiar ni abrir con otro propósito', async () => {
    const par = generarParAsimetrico();
    const envueltas = await envolverPar(par, KEK, CONTEXTO);

    await assert.rejects(
      () =>
        abrirPar(
          { firma: envueltas.canje, canje: envueltas.firma },
          KEK,
          CONTEXTO,
        ),
      'una envoltura no puede ocupar el sitio de la otra',
    );

    await assert.rejects(
      () =>
        desenvolverClave(KEK, envueltas.firma.envoltura, {
          ...CONTEXTO,
          proposito: PROPOSITOS.par_canje,
        }),
      'la envoltura de firma no se abre como si fuera de canje',
    );
  });

  test('con la KEK equivocada no se abre nada', async () => {
    const par = generarParAsimetrico();
    const envueltas = await envolverPar(par, KEK, CONTEXTO);
    await assert.rejects(() => abrirPar(envueltas, bytesAleatorios(32), CONTEXTO));
    await assert.rejects(() => abrirPar(envueltas, KEK, { ...CONTEXTO, keyVersion: 2 }));
  });

  test('un par incompleto se rechaza antes de tocar la criptografía', async () => {
    await assert.rejects(() => envolverPar({}, KEK, CONTEXTO), /incompleto/);
    await assert.rejects(() => abrirPar({}, KEK, CONTEXTO), /envolturas/);
    await assert.rejects(
      () => envolverPar({ firma: { privada: new Uint8Array(31) }, canje: { privada: new Uint8Array(32) } }, KEK, CONTEXTO),
      /32 bytes/,
    );
  });

  test('firmar y verificar: sólo la combinación correcta pasa', () => {
    const par = generarParAsimetrico();
    const mensaje = new TextEncoder().encode('i-1|pub-B|2026-10-01T00:00:00Z');
    const firma = firmar(mensaje, par.firma.privada);
    assert.equal(firma.length, LONGITUDES.firma);

    assert.equal(verificarFirma(firma, mensaje, par.firma.publica), true);
    assert.equal(verificarFirma(firma, new TextEncoder().encode('otro'), par.firma.publica), false);

    const otro = generarParAsimetrico();
    assert.equal(verificarFirma(firma, mensaje, otro.firma.publica), false);

    const alterada = Uint8Array.from(firma);
    alterada[7] ^= 0x01;
    assert.equal(verificarFirma(alterada, mensaje, par.firma.publica), false);
  });

  test('R113: firma toda ceros contra pública toda ceros NO verifica', () => {
    // Regresión del modo laxo (zip215 por defecto): con la firma y la
    // pública a ceros devolvía `true`, o sea que cualquiera fabricaba la
    // autoría de una compartición.
    assert.equal(verificarFirma(new Uint8Array(LONGITUDES.firma), new Uint8Array([1]), new Uint8Array(32)), false);
    assert.equal(verificarFirma(new Uint8Array(LONGITUDES.firma), new Uint8Array(0), new Uint8Array(32)), false);
  });

  test('verificarFirma devuelve false en vez de lanzar con basura', () => {
    assert.equal(verificarFirma('no-bytes', new Uint8Array(1), new Uint8Array(32)), false);
    assert.equal(verificarFirma(new Uint8Array(64), 'no-bytes', new Uint8Array(32)), false);
    assert.equal(verificarFirma(new Uint8Array(64), new Uint8Array(1), new Uint8Array(31)), false);
    assert.equal(verificarFirma(null, null, null), false);
  });

  test('R8: ECDH simétrico entre dos usuarios y claves de bajo orden rechazadas', () => {
    const a = generarParAsimetrico();
    const b = generarParAsimetrico();

    const ikmAb = intercambiarClave(a.canje.privada, b.canje.publica);
    const ikmBa = intercambiarClave(b.canje.privada, a.canje.publica);
    assert.equal(ikmAb.length, 32);
    assert.equal(igualdadConstante(ikmAb, ikmBa), true, 'ambos lados deben derivar lo mismo');

    // Una tercera parte no llega al mismo IKM.
    const c = generarParAsimetrico();
    assert.equal(igualdadConstante(intercambiarClave(c.canje.privada, b.canje.publica), ikmAb), false);

    // Puntos de bajo orden: noble lanza y aquí no se tolera un secreto
    // común trivialmente conocible.
    assert.throws(() => intercambiarClave(a.canje.privada, new Uint8Array(32)));
    const torsion = new Uint8Array(32);
    torsion[0] = 0x01;
    assert.throws(() => intercambiarClave(a.canje.privada, torsion));

    assert.throws(() => intercambiarClave(new Uint8Array(31), b.canje.publica), /32 bytes/);
    assert.throws(() => intercambiarClave(a.canje.privada, new Uint8Array(31)), /32 bytes/);
  });

  test('R114: la huella identifica a la clave y no a la persona equivocada', () => {
    const par = generarParAsimetrico();
    const otra = generarParAsimetrico();

    assert.match(huella(par.firma.publica), /^SHA256:[A-Za-z0-9_-]{43}$/);
    assert.equal(huella(par.firma.publica), huella(par.firma.publica));
    assert.notEqual(huella(par.firma.publica), huella(otra.firma.publica));

    // Un solo bit cambiado cambia la identidad mostrada al usuario.
    const tocada = Uint8Array.from(par.firma.publica);
    tocada[0] ^= 0x01;
    assert.notEqual(huella(par.firma.publica), huella(tocada));

    assert.throws(() => huella(new Uint8Array(31)), /32 bytes/);
  });
});

/** Concatena arrays sin salir del módulo (el helper de `random` es de un solo uso aquí). */
function concatenar(...arrays) {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const salida = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    salida.set(a, offset);
    offset += a.length;
  }
  return salida;
}
