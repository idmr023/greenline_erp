import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { AEAD, ALGORITMOS_PERMITIDOS, ARGON2, CAMPOS_AAD, CAMPOS_AAD_ENVOLTURA, MINIMOS_ARGON2, MAX_ITEMS_POR_DEK } from './params.js';

describe('params — política criptográfica (§5.1, §8, §8.2)', () => {
  test('Argon2id de producción cumple el suelo de §5.1', () => {
    assert.ok(ARGON2.m >= MINIMOS_ARGON2.m, `m=${ARGON2.m} < ${MINIMOS_ARGON2.m}`);
    assert.ok(ARGON2.t >= MINIMOS_ARGON2.t, `t=${ARGON2.t} < ${MINIMOS_ARGON2.t}`);
    assert.ok(ARGON2.p >= MINIMOS_ARGON2.p, `p=${ARGON2.p} < ${MINIMOS_ARGON2.p}`);
    assert.ok(ARGON2.dkLen >= 32);
    assert.ok(ARGON2.saltBytes >= 16, '§5.1: salt de 16 bytes');
    assert.equal(ARGON2.nombre, 'argon2id');
  });

  test('sólo AES-256-GCM está en la lista blanca (R21)', () => {
    assert.deepEqual([...ALGORITMOS_PERMITIDOS], ['A256GCM']);
    assert.equal(AEAD.algId, 'A256GCM');
    assert.equal(AEAD.claveBytes, 32);
    assert.equal(AEAD.nonceBytes, 12, 'IV de 96 bits para GCM');
    assert.equal(AEAD.tagBytes, 16);
  });

  test('el techo de items por DEK está fijado (§8.2)', () => {
    assert.equal(MAX_ITEMS_POR_DEK, 100000);
  });

  test('el AAD de items y el de envoltura tienen listas de campos congeladas', () => {
    assert.ok(Object.isFrozen(CAMPOS_AAD));
    assert.ok(Object.isFrozen(CAMPOS_AAD_ENVOLTURA));
    assert.ok(CAMPOS_AAD.includes('revision'), '§8.3: revision va en el AAD');
    assert.ok(CAMPOS_AAD.includes('algorithm'));
    assert.ok(CAMPOS_AAD.includes('nonce'));
    assert.ok(CAMPOS_AAD_ENVOLTURA.includes('keyVersion'), '§7 R10: keyVersion en el envoltorio');
  });
});
