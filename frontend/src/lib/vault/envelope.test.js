import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { ErrorDescifrado } from './aead.js';
import { PROPOSITOS, confirmarKEK, desenvolverClave, envolverClave } from './envelope.js';
import { bytesAleatorios } from './random.js';

const KEK = bytesAleatorios(32);
const DEK = bytesAleatorios(32);

const CONTEXTO = Object.freeze({ vaultId: 'vault-1', keyVersion: 1, proposito: PROPOSITOS.dek });

async function envolver(contexto = CONTEXTO, kek = KEK, dek = DEK) {
  return envolverClave(kek, dek, contexto);
}

describe('Envelope encryption (§7)', () => {
  test('roundtrip: envolver y desenvolver devuelve la misma DEK', async () => {
    const env = await envolver();
    assert.equal(env.algorithm, 'A256GCM');
    assert.equal(env.nonce.length, 12);
    assert.equal(env.tag.length, 16);
    const abierta = await desenvolverClave(KEK, env, CONTEXTO);
    assert.deepEqual(Buffer.from(abierta), Buffer.from(DEK));
  });

  test('la DEK no aparece en claro dentro del envoltorio', async () => {
    const env = await envolver();
    const blob = Buffer.from(env.ciphertext);
    assert.equal(blob.includes(Buffer.from(DEK)), false);
    assert.notDeepEqual(blob, Buffer.from(DEK));
  });

  test('key-version confusion: reclamar otra versión hace fallar (R10)', async () => {
    const env = await envolver({ ...CONTEXTO, keyVersion: 1 });
    await assert.rejects(
      desenvolverClave(KEK, env, { ...CONTEXTO, keyVersion: 2 }),
      ErrorDescifrado,
    );
  });

  test('cambiar el propósito hace fallar (AAD con proposito)', async () => {
    const env = await envolver({ ...CONTEXTO, proposito: PROPOSITOS.dek });
    await assert.rejects(
      desenvolverClave(KEK, env, { ...CONTEXTO, proposito: PROPOSITOS.recuperacion }),
      ErrorDescifrado,
    );
  });

  test('cambiar el vaultId hace fallar', async () => {
    const env = await envolver({ ...CONTEXTO, vaultId: 'vault-1' });
    await assert.rejects(
      desenvolverClave(KEK, env, { ...CONTEXTO, vaultId: 'vault-2' }),
      ErrorDescifrado,
    );
  });

  test('una KEK equivocada no abre el envoltorio', async () => {
    const env = await envolver();
    await assert.rejects(
      desenvolverClave(bytesAleatorios(32), env, CONTEXTO),
      ErrorDescifrado,
    );
  });

  test('mutar un byte del ciphertext del envoltorio hace fallar', async () => {
    const env = await envolver();
    const mutado = Uint8Array.from(env.ciphertext);
    mutado[0] ^= 0x01;
    await assert.rejects(
      desenvolverClave(KEK, { ...env, ciphertext: mutado }, CONTEXTO),
      ErrorDescifrado,
    );
  });

  test('propósitos desconocidos se rechazan antes de cifrar', async () => {
    await assert.rejects(
      envolverClave(KEK, DEK, { ...CONTEXTO, proposito: 'lo-que-sea' }),
      /Propósito de envoltorio desconocido/,
    );
    await assert.rejects(
      envolverClave(KEK, DEK, { ...CONTEXTO, proposito: undefined }),
      /Propósito de envoltorio desconocido/,
    );
  });

  test('§5.3: confirmación local de la KEK (nunca se envía al servidor)', async () => {
    const env = await envolver();
    assert.equal(await confirmarKEK(KEK, env, CONTEXTO), true);
    assert.equal(await confirmarKEK(bytesAleatorios(32), env, CONTEXTO), false);
    assert.equal(
      await confirmarKEK(KEK, env, { ...CONTEXTO, keyVersion: 9 }),
      false,
      'KEK correcta con contexto equivocado no debe confirmar',
    );
  });
});
