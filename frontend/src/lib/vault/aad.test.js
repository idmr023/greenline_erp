import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { construirAAD, construirAADEnvoltura } from './aad.js';
import { AEAD, CAMPOS_AAD, CAMPOS_AAD_ENVOLTURA } from './params.js';
import { bytesAleatorios, desdeUtf8 } from './random.js';

const CONTEXTO = Object.freeze({
  vaultId: 'vault-1',
  itemId: 'item-1',
  ownerId: 'user-1',
  tenantId: 'tenant-1',
  revision: 7,
  keyVersion: 3,
});

function aadDe(overrides = {}) {
  return construirAAD({ ...CONTEXTO, nonce: NONCE, ...overrides });
}

const NONCE = bytesAleatorios(AEAD.nonceBytes);

describe('AAD contextual (§8.1)', () => {
  test('es determinista con el mismo contexto', () => {
    assert.deepEqual(aadDe(), aadDe());
    assert.deepEqual(aadDe(), construirAAD({ ...CONTEXTO, nonce: NONCE }));
  });

  test('cualquier campo del contexto produce un AAD distinto', () => {
    const base = aadDe();
    const cambios = {
      vaultId: 'vault-2',
      itemId: 'item-2',
      ownerId: 'user-2',
      tenantId: 'tenant-2',
      revision: 8,
      keyVersion: 4,
      algorithm: 'A256GCM-otro',
    };
    for (const [campo, valor] of Object.entries(cambios)) {
      const distinto = aadDe({ [campo]: valor });
      assert.notDeepEqual(distinto, base, `cambiar ${campo} debe alterar el AAD`);
    }
  });

  test('el nonce forma parte del AAD', () => {
    const otro = construirAAD({ ...CONTEXTO, nonce: bytesAleatorios(AEAD.nonceBytes) });
    assert.notDeepEqual(otro, aadDe());
  });

  test('la serialización es inyectiva frente a separadores y comillas', () => {
    const raro = aadDe({ ownerId: 'user|1","ownerId":"x', vaultId: 'v"|\\"' });
    const campos = JSON.parse(desdeUtf8(raro));
    assert.equal(campos.length, CAMPOS_AAD.length);
    assert.equal(campos[0], 'GLV5');
    assert.equal(campos[2], 'item-1');
    // El valor con comillas y pipes se conserva tal cual: JSON no deja que
    // un dato altere la estructura del AAD.
    assert.equal(campos[1], 'v"|\\"');
    assert.equal(campos[3], 'user|1","ownerId":"x');
    assert.equal(campos[4], 'tenant-1');
    // Y el AAD «raro» no colisiona con ninguno legítimo.
    assert.notDeepEqual(raro, aadDe());
  });

  test('rechaza contextos incompletos o mal tipados', () => {
    assert.throws(() => construirAAD({ ...CONTEXTO, vaultId: '' }), /vaultId/);
    assert.throws(() => construirAAD({ ...CONTEXTO, itemId: undefined }), /itemId/);
    assert.throws(() => construirAAD({ ...CONTEXTO, ownerId: null }), /ownerId/);
    assert.throws(() => construirAAD({ ...CONTEXTO, revision: -1 }), /revision/);
    assert.throws(() => construirAAD({ ...CONTEXTO, revision: 1.5 }), /revision/);
    assert.throws(() => construirAAD({ ...CONTEXTO, keyVersion: 'x' }), /keyVersion/);
    assert.throws(() => construirAAD({ ...CONTEXTO, nonce: bytesAleatorios(11) }), /nonce/);
  });

  test('el AAD del envoltuario incluye keyVersion y proposito (§7 R10)', () => {
    const base = construirAADEnvoltura({
      vaultId: 'v1', keyVersion: 1, proposito: 'dek', nonce: NONCE,
    });
    const otraVersion = construirAADEnvoltura({
      vaultId: 'v1', keyVersion: 2, proposito: 'dek', nonce: NONCE,
    });
    const otroProposito = construirAADEnvoltura({
      vaultId: 'v1', keyVersion: 1, proposito: 'recuperacion', nonce: NONCE,
    });
    assert.notDeepEqual(base, otraVersion, 'key-version confusion debe cambiar el AAD');
    assert.notDeepEqual(base, otroProposito, 'el propósito debe autenticarse');

    const campos = JSON.parse(desdeUtf8(base));
    assert.equal(campos.length, CAMPOS_AAD_ENVOLTURA.length);
    assert.equal(campos[0], 'GLV5');
    assert.equal(campos[1], 'envelope');
    assert.ok(campos.includes(1));
    assert.ok(campos.includes('dek'));
  });

  test('el AAD del envoltuario exige proposito conocido y campos presentes', () => {
    assert.throws(
      () => construirAADEnvoltura({ vaultId: 'v', keyVersion: 1, proposito: '', nonce: NONCE }),
      /proposito/,
    );
    assert.throws(
      () => construirAADEnvoltura({ vaultId: '', keyVersion: 1, proposito: 'dek', nonce: NONCE }),
      /vaultId/,
    );
  });
});
