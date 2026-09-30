import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  ErrorDescifrado,
  cifrar,
  comprobarTechoDeClave,
  descifrar,
  deserializar,
  exigirAlgoritmo,
  serializar,
} from './aead.js';
import { MAX_ITEMS_POR_DEK } from './params.js';
import { bytesAleatorios } from './random.js';

const CLAVE = bytesAleatorios(32);

const CONTEXTO = Object.freeze({
  vaultId: 'vault-1',
  itemId: 'item-1',
  ownerId: 'user-1',
  tenantId: 'tenant-1',
  revision: 1,
  keyVersion: 1,
});

const ITEM = {
  title: 'Correo corporativo',
  username: 'usuario@example.com',
  password: 'MiContraseña-Súper-Secreta-2026!',
  notes: 'nota privada',
};

async function cifrarItem(contexto = CONTEXTO, clave = CLAVE) {
  return cifrar(clave, serializar(ITEM), contexto);
}

async function falla(promesa, mensaje = 'debía fallar') {
  await assert.rejects(promesa, (error) => {
    assert.ok(error instanceof Error, `${mensaje}: error no válido`);
    return true;
  }, mensaje);
}

describe('AES-256-GCM con AAD (§8)', () => {
  test('roundtrip: cifra y descifra conservando el contenido', async () => {
    const env = await cifrarItem();
    assert.equal(env.algorithm, 'A256GCM');
    assert.equal(env.nonce.length, 12);
    assert.equal(env.tag.length, 16);
    assert.ok(env.ciphertext.length > 0);

    const plano = await descifrar(CLAVE, env, CONTEXTO);
    assert.deepEqual(deserializar(plano), ITEM);
  });

  test('el ciphertext no contiene el plaintext (§38 / criptografía)', async () => {
    const env = await cifrarItem();
    const plano = Buffer.from(serializar(ITEM));
    const blob = Buffer.from(env.ciphertext);
    // Búsqueda de la firma completa del password: no debe aparecer.
    assert.equal(blob.includes(plano.subarray(0, 40)), false);
    assert.equal(blob.includes(Buffer.from(ITEM.password, 'utf8')), false);
    assert.notDeepEqual(Buffer.from(env.ciphertext), plano);
  });

  test('dos cifrados del mismo item usan nonces distintos (§8.2)', async () => {
    const a = await cifrarItem();
    const b = await cifrarItem();
    assert.notDeepEqual(Buffer.from(a.nonce), Buffer.from(b.nonce));
    assert.notDeepEqual(Buffer.from(a.ciphertext), Buffer.from(b.ciphertext));
  });

  test('SPlicing: mover el ciphertext a otra fila hace fallar el descifrado', async () => {
    const origen = await cifrarItem({ ...CONTEXTO, itemId: 'item-A' });
    const destino = { ...CONTEXTO, itemId: 'item-B' };
    await falla(descifrar(CLAVE, origen, destino), 'el AAD debe ligarlo a item-A');
  });

  test('alterar ownerId o tenantId en la fila hace fallar el descifrado', async () => {
    const env = await cifrarItem();
    await falla(descifrar(CLAVE, env, { ...CONTEXTO, ownerId: 'user-2' }), 'ownerId en el AAD');
    await falla(descifrar(CLAVE, env, { ...CONTEXTO, tenantId: 'tenant-2' }), 'tenantId en el AAD');
  });

  test('REPLAY: reabrir una revisión anterior hace fallar (§8.3)', async () => {
    const actual = await cifrarItem({ ...CONTEXTO, revision: 7 });
    assert.deepEqual(
      deserializar(await descifrar(CLAVE, actual, { ...CONTEXTO, revision: 7 })),
      ITEM,
    );
    await falla(descifrar(CLAVE, actual, { ...CONTEXTO, revision: 6 }), 'revision rebobinada');
    await falla(descifrar(CLAVE, actual, { ...CONTEXTO, revision: 8 }), 'revision adelantada');
  });

  test('mutar un byte del ciphertext invalida la autenticación', async () => {
    const env = await cifrarItem();
    const mutado = Uint8Array.from(env.ciphertext);
    mutado[0] ^= 0x01;
    await falla(descifrar(CLAVE, { ...env, ciphertext: mutado }, CONTEXTO), 'byte alterado');
  });

  test('mutar un byte del tag invalida la autenticación', async () => {
    const env = await cifrarItem();
    const tag = Uint8Array.from(env.tag);
    tag[5] ^= 0xff;
    await falla(descifrar(CLAVE, { ...env, tag }, CONTEXTO), 'tag alterado');
  });

  test('mutar un byte del nonce invalida la autenticación', async () => {
    const env = await cifrarItem();
    const nonce = Uint8Array.from(env.nonce);
    nonce[3] ^= 0x01;
    await falla(descifrar(CLAVE, { ...env, nonce }, CONTEXTO), 'nonce alterado');
  });

  test('truncar el ciphertext invalida la autenticación', async () => {
    const env = await cifrarItem();
    const corto = env.ciphertext.slice(0, env.ciphertext.length - 1);
    await falla(descifrar(CLAVE, { ...env, ciphertext: corto }, CONTEXTO), 'truncamiento');
  });

  test('una clave equivocada no descifra', async () => {
    const env = await cifrarItem();
    await falla(descifrar(bytesAleatorios(32), env, CONTEXTO), 'clave incorrecta');
  });

  test('algoritmo fuera de la lista blanca se rechaza (R21)', async () => {
    const env = await cifrarItem();
    await falla(descifrar(CLAVE, { ...env, algorithm: 'DES-EDE3' }, CONTEXTO), 'algoritmo ajeno');
    await falla(descifrar(CLAVE, { ...env, algorithm: undefined }, CONTEXTO), 'algoritmo ausente');
    assert.throws(() => exigirAlgoritmo('RC4'), ErrorDescifrado);
    assert.doesNotThrow(() => exigirAlgoritmo('A256GCM'));
  });

  test('todos los fallos usan el mismo error, sin filtrar la causa (§8)', async () => {
    const env = await cifrarItem();
    const resultados = await Promise.allSettled([
      descifrar(CLAVE, { ...env, tag: Uint8Array.from(env.tag).fill(0) }, CONTEXTO),
      descifrar(CLAVE, env, { ...CONTEXTO, itemId: 'otro' }),
      descifrar(bytesAleatorios(32), env, CONTEXTO),
    ]);
    const errores = resultados.map((r, i) => {
      assert.equal(r.status, 'rejected', `el intento ${i} debía fallar`);
      return `${r.reason.name}:${r.reason.message}`;
    });
    assert.equal(errores.length, 3, 'los tres intentos deben producir error');
    assert.equal(new Set(errores).size, 1, `mensajes distintos: ${resumenErrores(errores)}`);
  });

  test('el techo de items por DEK dispara la rotación (§8.2 / R18)', () => {
    assert.equal(comprobarTechoDeClave(MAX_ITEMS_POR_DEK - 1), true);
    assert.throws(
      () => comprobarTechoDeClave(MAX_ITEMS_POR_DEK),
      (e) => e.code === 'DEK_TECHO_ALCANZADO',
    );
    assert.throws(() => comprobarTechoDeClave(MAX_ITEMS_POR_DEK + 1));
    assert.throws(() => comprobarTechoDeClave(-1), /inválido/);
  });

  test('serializar/deserializar no pierden estructura', () => {
    const bytes = serializar(ITEM);
    assert.ok(bytes instanceof Uint8Array);
    assert.deepEqual(deserializar(bytes), ITEM);
  });
});

function resumenErrores(lista) {
  return lista.join(' | ');
}
