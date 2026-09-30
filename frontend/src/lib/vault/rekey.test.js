import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { envolverClave, PROPOSITOS } from './envelope.js';
import { bytesAleatorios } from './random.js';
import {
  ErrorRekey,
  resultadoVerificable,
  reenvolverDEKs,
  verificarReenvolturas,
} from './rekey.js';

const VAULT = '11111111-1111-4111-8111-111111111111';
const KEK_VIEJA = bytesAleatorios(32);
const KEK_NUEVA = bytesAleatorios(32);

async function vigentes(n = 2) {
  const salida = [];
  for (let i = 1; i <= n; i += 1) {
    const dek = bytesAleatorios(32);
    const envoltura = await envolverClave(KEK_VIEJA, dek, {
      vaultId: VAULT,
      keyVersion: i,
      proposito: PROPOSITOS.dek,
    });
    salida.push({ keyVersion: i, envoltura, dek });
  }
  return salida;
}

describe('rekey §27 — re-envoltura', () => {
  it('las DEKs no cambian: sólo quién las envuelve (R116/R120)', async () => {
    const originales = await vigentes(3);
    const nuevas = await reenvolverDEKs({
      kekVieja: KEK_VIEJA,
      kekNueva: KEK_NUEVA,
      vaultId: VAULT,
      envolturas: originales.map(({ keyVersion, envoltura }) => ({ keyVersion, envoltura })),
    });

    assert.equal(nuevas.length, 3);
    assert.deepEqual(
      nuevas.map((n) => n.keyVersion),
      [1, 2, 3],
    );
    // El ciphertext del envoltorio cambia (nonce nuevo), la DEK subyacente no.
    assert.notDeepEqual(nuevas[0].envoltura.ciphertext, originales[0].envoltura.ciphertext);

    const verificacion = await verificarReenvolturas({
      kekVieja: KEK_VIEJA,
      kekNueva: KEK_NUEVA,
      vaultId: VAULT,
      originales: originales.map(({ keyVersion, envoltura }) => ({ keyVersion, envoltura })),
      nuevas,
    });
    assert.deepEqual(verificacion, { ok: true, fallos: 0 });
    assert.equal(resultadoVerificable(verificacion), true);
  });

  it('la envoltura nueva sólo abre con la KEK nueva', async () => {
    const originales = await vigentes(1);
    const [{ envoltura: nueva }] = await reenvolverDEKs({
      kekVieja: KEK_VIEJA,
      kekNueva: KEK_NUEVA,
      vaultId: VAULT,
      envolturas: originales,
    });

    const { descifrarConAAD } = await import('./aead.js');
    const { construirAADEnvoltura } = await import('./aad.js');
    const aad = (e) =>
      construirAADEnvoltura({
        vaultId: VAULT,
        keyVersion: 1,
        proposito: PROPOSITOS.dek,
        algorithm: e.algorithm,
        nonce: e.nonce,
      });

    const conNueva = await descifrarConAAD(KEK_NUEVA, nueva, aad(nueva));
    assert.deepEqual(conNueva, originales[0].dek);
    await assert.rejects(() => descifrarConAAD(KEK_VIEJA, nueva, aad(nueva)));
    // y la vieja ya no abre con la KEK nueva: un cliente desactualizado
    // se encuentra con que debe re-autenticarse, no con un estado mixto.
    await assert.rejects(() => descifrarConAAD(KEK_NUEVA, originales[0].envoltura, aad(originales[0].envoltura)));
  });

  it('KEK vieja incorrecta ⇒ aborta sin producir nada', async () => {
    const originales = await vigentes(2);
    await assert.rejects(
      () =>
        reenvolverDEKs({
          kekVieja: bytesAleatorios(32),
          kekNueva: KEK_NUEVA,
          vaultId: VAULT,
          envolturas: originales,
        }),
      ErrorRekey,
    );
  });

  it('vaultId alterado ⇒ aborta (AAD de §7 R10)', async () => {
    const originales = await vigentes(1);
    await assert.rejects(
      () =>
        reenvolverDEKs({
          kekVieja: KEK_VIEJA,
          kekNueva: KEK_NUEVA,
          vaultId: '22222222-2222-4222-8222-222222222222',
          envolturas: originales,
        }),
      ErrorRekey,
    );
  });

  it('conjunto vacío o incompleto ⇒ R116 lo rechaza', async () => {
    await assert.rejects(
      () => reenvolverDEKs({ kekVieja: KEK_VIEJA, kekNueva: KEK_NUEVA, vaultId: VAULT, envolturas: [] }),
      ErrorRekey,
    );
    await assert.rejects(
      () => reenvolverDEKs({ kekVieja: KEK_VIEJA, kekNueva: KEK_NUEVA, vaultId: VAULT }),
      ErrorRekey,
    );
    await assert.rejects(
      () => reenvolverDEKs({ kekVieja: null, kekNueva: KEK_NUEVA, vaultId: VAULT, envolturas: [] }),
      ErrorRekey,
    );
  });
});

describe('rekey §27 — R120 verificación previa al commit', () => {
  it('detecta una envoltura alterada', async () => {
    const originales = await vigentes(2);
    const envolturas = originales.map(({ keyVersion, envoltura }) => ({ keyVersion, envoltura }));
    const nuevas = await reenvolverDEKs({
      kekVieja: KEK_VIEJA,
      kekNueva: KEK_NUEVA,
      vaultId: VAULT,
      envolturas,
    });

    // Simula corrupción/rollback parcial en el servidor.
    const alteradas = [nuevas[0], { ...nuevas[1], envoltura: { ...nuevas[1].envoltura, ciphertext: bytesAleatorios(16) } }];
    const verificacion = await verificarReenvolturas({
      kekVieja: KEK_VIEJA,
      kekNueva: KEK_NUEVA,
      vaultId: VAULT,
      originales: envolturas,
      nuevas: alteradas,
    });

    assert.equal(verificacion.ok, false);
    assert.equal(verificacion.fallos, 1);
    assert.throws(() => resultadoVerificable(verificacion), ErrorRekey);
  });

  it('un conjunto de distinta longitud nunca valida', async () => {
    const originales = await vigentes(2);
    const verificacion = await verificarReenvolturas({
      kekVieja: KEK_VIEJA,
      kekNueva: KEK_NUEVA,
      vaultId: VAULT,
      originales,
      nuevas: [],
    });
    assert.equal(verificacion.ok, false);
    assert.throws(() => resultadoVerificable(verificacion), ErrorRekey);
  });

  it('una key_version desalineada no valida', async () => {
    const originales = await vigentes(2);
    const envolturas = originales.map(({ keyVersion, envoltura }) => ({ keyVersion, envoltura }));
    const nuevas = await reenvolverDEKs({
      kekVieja: KEK_VIEJA,
      kekNueva: KEK_NUEVA,
      vaultId: VAULT,
      envolturas,
    });
    nuevas[1] = { ...nuevas[1], keyVersion: 99 };
    const verificacion = await verificarReenvolturas({
      kekVieja: KEK_VIEJA,
      kekNueva: KEK_NUEVA,
      vaultId: VAULT,
      originales: envolturas,
      nuevas,
    });
    assert.equal(verificacion.ok, false);
  });
});
