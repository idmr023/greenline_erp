import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  ARGON2,
  ETIQUETAS,
  MINIMOS_ARGON2,
} from './params.js';
import {
  derivarIKM,
  derivarMaterial,
  derivarMaterialMaestro,
  parametrosUsados,
  saltAleatorio,
  validarMasterPassword,
  validarParamsArgon2,
} from './kdf.js';
import { bytesAleatorios } from './random.js';

/** Suelo de §5.1: deriva real pero rápida para no alargar la suite. */
const PARAMS_RAPIDOS = Object.freeze({ ...ARGON2, m: MINIMOS_ARGON2.m, t: MINIMOS_ARGON2.t, p: MINIMOS_ARGON2.p });

const MAESTRA = 'correct-horse-battery-staple-greenline';

function distinto(a, b) {
  return Buffer.compare(Buffer.from(a), Buffer.from(b)) !== 0;
}

describe('KDF — Argon2id + HKDF (§5)', () => {
  test('rechaza parámetros por debajo del suelo de §5.1', () => {
    assert.throws(() => validarParamsArgon2({ ...ARGON2, m: 1024 }), /m=1024/);
    assert.throws(() => validarParamsArgon2({ ...ARGON2, t: 1 }), /t=1/);
    assert.throws(() => validarParamsArgon2({ ...ARGON2, p: 0 }), /p=0/);
    assert.throws(() => validarParamsArgon2({ ...ARGON2, dkLen: 16 }), /dkLen/);
    assert.doesNotThrow(() => validarParamsArgon2(ARGON2));
    assert.doesNotThrow(() => validarParamsArgon2(PARAMS_RAPIDOS));
  });

  test('rechaza maestra vacía o salt demasiado corto', () => {
    assert.throws(() => validarMasterPassword(''), /vacía/);
    assert.throws(() => validarMasterPassword(null), /vacía/);
    assert.throws(() => validarMasterPassword(new Uint8Array(0)), /vacía/);
    assert.equal(validarMasterPassword(MAESTRA), true);

    assert.throws(() => derivarIKM(MAESTRA, new Uint8Array(4), PARAMS_RAPIDOS), /salt/);
    assert.throws(() => derivarIKM(MAESTRA, 'no-bytes', PARAMS_RAPIDOS), /salt/);
  });

  test('el salt aleatorio tiene el tamaño de §5.1', () => {
    assert.equal(saltAleatorio().length, ARGON2.saltBytes);
    assert.equal(saltAleatorio().length, 16);
  });

  test('Argon2id es determinista y depende del salt (una derivación)', () => {
    const salt = saltAleatorio();
    const a = derivarIKM(MAESTRA, salt, PARAMS_RAPIDOS);
    const b = derivarIKM(MAESTRA, salt, PARAMS_RAPIDOS);
    assert.equal(a.length, PARAMS_RAPIDOS.dkLen);
    assert.equal(distinto(a, b), false, 'mismo salt + misma maestra = misma clave');

    const c = derivarIKM(MAESTRA, bytesAleatorios(16), PARAMS_RAPIDOS);
    assert.equal(distinto(a, c), true, 'salt distinto debe dar clave distinta');

    const d = derivarIKM(`${MAESTRA}x`, salt, PARAMS_RAPIDOS);
    assert.equal(distinto(a, d), true, 'maestra distinta debe dar clave distinta');
  });

  test('domain separation: auth, kek y recuperación nunca coinciden (§5.2 R5)', () => {
    const ikm = bytesAleatorios(64);
    const salt = bytesAleatorios(16);
    const material = derivarMaterial(ikm, salt);

    assert.equal(material.auth.length, 32);
    assert.equal(material.kek.length, 32);
    assert.equal(material.recuperacion.length, 32);

    assert.equal(distinto(material.auth, material.kek), true, 'auth y kek deben ser distintas');
    assert.equal(distinto(material.auth, material.recuperacion), true);
    assert.equal(distinto(material.kek, material.recuperacion), true);

    // Repetible: mismo IKM + mismo salt = mismas claves.
    const repetido = derivarMaterial(ikm, salt);
    assert.equal(distinto(material.kek, repetido.kek), false);
  });

  test('el salt de la bóveda separa claves entre bóvedas distintas', () => {
    const ikm = bytesAleatorios(64);
    const una = derivarMaterial(ikm, bytesAleatorios(16));
    const otra = derivarMaterial(ikm, bytesAleatorios(16));
    assert.equal(distinto(una.kek, otra.kek), true);
    assert.equal(distinto(una.auth, otra.auth), true);
  });

  test('las etiquetas HKDF son las versionadas del repo', () => {
    assert.equal(ETIQUETAS.auth, 'greenline-vault/v1/auth');
    assert.equal(ETIQUETAS.kek, 'greenline-vault/v1/kek');
    assert.equal(ETIQUETAS.recuperacion, 'greenline-vault/v1/recuperacion');
    for (const etiqueta of Object.values(ETIQUETAS)) {
      assert.ok(etiqueta.startsWith('greenline-vault/v1/'), `etiqueta sin versión: ${etiqueta}`);
    }
    assert.equal(new Set(Object.values(ETIQUETAS)).size, Object.values(ETIQUETAS).length);
  });

  test('derivarMaterialMaestro devuelve material + snapshot versionado', () => {
    const salt = saltAleatorio();
    const material = derivarMaterialMaestro(MAESTRA, salt, PARAMS_RAPIDOS);

    assert.equal(material.kek.length, 32);
    assert.equal(material.auth.length, 32);
    assert.equal(material.recuperacion.length, 32);
    assert.deepEqual(material.salt, salt);
    assert.equal(material.parametros.nombre, 'argon2id');
    assert.equal(material.parametros.m, PARAMS_RAPIDOS.m);
    assert.equal(material.parametros.t, PARAMS_RAPIDOS.t);
    assert.equal(material.parametros.p, PARAMS_RAPIDOS.p);
    assert.equal(material.parametros.dkLen, 64, 'dkLen es 64 bytes');

    const usados = parametrosUsados();
    assert.equal(usados.m, ARGON2.m);
    assert.equal(usados.version, 1);
  });

  test('los parámetros de producción derivan (§5.1, sin acortar)', () => {
    const salt = saltAleatorio();
    const t0 = performance.now();
    const ikm = derivarIKM(MAESTRA, salt, ARGON2);
    const ms = performance.now() - t0;

    assert.equal(ikm.length, 64);
    assert.ok(ms > 100, `Argon2id no debía ser instantáneo (${ms.toFixed(0)} ms)`);
    assert.ok(ms < 20000, `derivación anormalmente lenta: ${ms.toFixed(0)} ms`);
  });
});
