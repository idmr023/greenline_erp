import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { construirAADEnvoltura } from './aad.js';
import { descifrarConAAD } from './aead.js';
import { envolverClave, PROPOSITOS } from './envelope.js';
import { derivarMaterialMaestro } from './kdf.js';
import { ETIQUETAS, LONGITUD_RECOVERY_KEY } from './params.js';
import {
  confirmarRecoveryKey,
  derivarKEKRecuperacion,
  desenvolverDEKsDeRecuperacion,
  ErrorRecovery,
  formatearRecoveryKey,
  generarRecoveryKey,
  parsearRecoveryKey,
} from './recovery.js';
import { bytesAleatorios } from './random.js';

const VAULT = '11111111-1111-4111-8111-111111111111';
const SALT = bytesAleatorios(16);

describe('recovery §25 — R105 generación en cliente', () => {
  it('genera 256 bits con CSPRNG y forma imprimible', () => {
    const a = generarRecoveryKey();
    const b = generarRecoveryKey();

    assert.equal(a.bytes.length, LONGITUD_RECOVERY_KEY);
    assert.equal(LONGITUD_RECOVERY_KEY * 8, 256);
    // Dos generaciones nunca coinciden (prob. de colisión despreciable).
    assert.notEqual(formatearRecoveryKey(a.bytes), formatearRecoveryKey(b.bytes));
    assert.match(a.texto, /^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)+$/);
  });

  it('el formato es reversible y tolera puntos/espacios', () => {
    const { bytes, texto } = generarRecoveryKey();
    assert.deepEqual(parsearRecoveryKey(texto), bytes);
    assert.deepEqual(parsearRecoveryKey(`  ${texto.replace(/\./g, ' ')} `), bytes);
    // Un guión pegado a mano NO debe corromper la clave: los grupos se
    // separan con puntos, y los guiones son un carácter válido del dato.
    assert.deepEqual(parsearRecoveryKey(texto.replace(/\./g, '')), bytes);
  });

  it('rechaza claves de longitud equivocada o vacías', () => {
    assert.throws(() => parsearRecoveryKey(''), ErrorRecovery);
    assert.throws(() => parsearRecoveryKey('abcd.efgh'), ErrorRecovery);
    assert.throws(() => parsearRecoveryKey(42), ErrorRecovery);
  });

  it('no confunde la rama de recuperación con la derivada de la maestra', () => {
    const maestra = 'una contraseña maestra larga';
    const material = derivarMaterialMaestro(maestra, SALT);
    const desdeRecovery = derivarKEKRecuperacion(bytesAleatorios(32), SALT);

    // Etiquetas distintas ⇒ claves distintas (§5.2 R5).
    assert.notEqual(ETIQUETAS.recuperacion, ETIQUETAS.claveRecuperacion);
    assert.notEqual(material.recuperacion.length, 0);
    assert.equal(desdeRecovery.length, 32);
    // La KEK de recuperación NO es ninguna de las claves de la maestra.
    assert.notDeepEqual(desdeRecovery, material.kek);
    assert.notDeepEqual(desdeRecovery, material.recuperacion);
    assert.notDeepEqual(desdeRecovery, material.auth);
  });

  it('la KEK de recuperación depende de la key y del salt', () => {
    const k1 = bytesAleatorios(32);
    const k2 = bytesAleatorios(32);
    const otraSalt = bytesAleatorios(16);

    assert.deepEqual(derivarKEKRecuperacion(k1, SALT), derivarKEKRecuperacion(k1, SALT));
    assert.notDeepEqual(derivarKEKRecuperacion(k1, SALT), derivarKEKRecuperacion(k2, SALT));
    assert.notDeepEqual(derivarKEKRecuperacion(k1, SALT), derivarKEKRecuperacion(k1, otraSalt));
    assert.throws(() => derivarKEKRecuperacion(bytesAleatorios(8), SALT), ErrorRecovery);
    assert.throws(() => derivarKEKRecuperacion(k1, bytesAleatorios(4)), ErrorRecovery);
  });
});

describe('recovery §25 — R106 reenvoltura de DEKs', () => {
  it('envuelve y reabre con proposito=recuperacion', async () => {
    const { bytes: key } = generarRecoveryKey();
    const kekRec = derivarKEKRecuperacion(key, SALT);
    const dek = bytesAleatorios(32);

    const [envuelta] = await desarrollarYEnvolver(kekRec, dek);

    const abiertas = await desenvolverDEKsDeRecuperacion(kekRec, [envuelta], VAULT);
    assert.equal(abiertas.length, 1);
    assert.deepEqual(abiertas[0].dek, dek);
    assert.equal(abiertas[0].keyVersion, 1);
  });

  it('la envoltura usa el propósito permitido y el mismo key_version', async () => {
    const kekRec = derivarKEKRecuperacion(bytesAleatorios(32), SALT);
    const dek = bytesAleatorios(32);
    const [{ keyVersion, envoltura }] = await desarrollarYEnvolver(kekRec, dek, 7);

    assert.equal(keyVersion, 7);
    // El AAD autenticado debe corresponder a proposito='recuperacion'.
    const aad = construirAADEnvoltura({
      vaultId: VAULT,
      keyVersion: 7,
      proposito: PROPOSITOS.recuperacion,
      algorithm: envoltura.algorithm,
      nonce: envoltura.nonce,
    });
    const texto = new TextDecoder().decode(aad);
    assert.ok(texto.includes('recuperacion'));
    // y NO a 'dek': si alguien lo reetiquetara, el descifrado fallaría.
    assert.ok(!texto.includes('"dek"'));
  });

  it('un keyVersion o vaultId distintos rompen el descifrado', async () => {
    const kekRec = derivarKEKRecuperacion(bytesAleatorios(32), SALT);
    const dek = bytesAleatorios(32);
    const [{ envoltura }] = await desarrollarYEnvolver(kekRec, dek, 1);

    const otroVault = construirAADEnvoltura({
      vaultId: '22222222-2222-4222-8222-222222222222',
      keyVersion: 1,
      proposito: PROPOSITOS.recuperacion,
      algorithm: envoltura.algorithm,
      nonce: envoltura.nonce,
    });
    await assert.rejects(() => descifrarConAAD(kekRec, envoltura, otroVault));

    await assert.rejects(() =>
      desenvolverDEKsDeRecuperacion(kekRec, [{ keyVersion: 99, envoltura }], VAULT),
    );
  });

  it('una recovery key incorrecta no abre nada (confirmación local §5.3)', async () => {
    const { bytes: correcta } = generarRecoveryKey();
    const kekRec = derivarKEKRecuperacion(correcta, SALT);
    const [{ envoltura }] = await desarrollarYEnvolver(kekRec, bytesAleatorios(32));

    const kekBien = derivarKEKRecuperacion(correcta, SALT);
    const kekMal = derivarKEKRecuperacion(bytesAleatorios(32), SALT);

    assert.equal(await confirmarRecoveryKey(kekBien, [{ keyVersion: 1, envoltura }], VAULT), true);
    assert.equal(await confirmarRecoveryKey(kekMal, [{ keyVersion: 1, envoltura }], VAULT), false);
    // Un conjunto vacío no confirma nada.
    assert.equal(await confirmarRecoveryKey(kekBien, [], VAULT), false);
  });

  it('exige conjunto de envolturas no vacío', async () => {
    const kekRec = derivarKEKRecuperacion(bytesAleatorios(32), SALT);
    await assert.rejects(() => desenvolverDEKsDeRecuperacion(kekRec, [], VAULT), ErrorRecovery);
    await assert.rejects(() => desenvolverDEKsDeRecuperacion(kekRec, null, VAULT), ErrorRecovery);
  });
});

/** Envuelve una DEK bajo la KEK de recuperación con el propósito correcto. */
async function desarrollarYEnvolver(kekRec, dek, keyVersion = 1) {
  const envoltura = await envolverClave(kekRec, dek, {
    vaultId: VAULT,
    keyVersion,
    proposito: PROPOSITOS.recuperacion,
  });
  return [{ keyVersion, envoltura }];
}
