/**
 * AAD contextual — Bóveda Segura V5 §8.1 (corrección principal de la V5).
 *
 * Sin AAD, AES-GCM autentica el texto pero no su CONTEXTO: un atacante con
 * la base de datos puede pegar el ciphertext del ítem A sobre la fila del
 * ítem B y la comprobación seguiría pasando. Aquí el AAD liga el ciphertext
 * a su fila, su revisión, su clave y su algoritmo.
 *
 * Serialización canónica: array JSON en el orden fijo de `CAMPOS_AAD`.
 * JSON escapa comillas y separadores, así que ningún valor puede alterar la
 * estructura (evita "injection" dentro del AAD).
 */

import { AEAD, CAMPOS_AAD, CAMPOS_AAD_ENVOLTURA, FORMATO } from './params.js';
import { aBase64Url, utf8 } from './random.js';

function exigir(condicion, mensaje) {
  if (!condicion) throw new Error(`AAD inválido: ${mensaje}`);
}

/**
 * @param {object} ctx
 * @param {string} ctx.vaultId
 * @param {string} ctx.itemId
 * @param {string|number} ctx.ownerId
 * @param {string|number|null} [ctx.tenantId]
 * @param {number} ctx.revision   contador anti-replay (§8.3)
 * @param {number} ctx.keyVersion
 * @param {string} [ctx.algorithm]
 * @param {Uint8Array} ctx.nonce
 * @returns {Uint8Array}
 */
export function construirAAD(ctx) {
  const {
    vaultId, itemId, ownerId, tenantId = null,
    revision, keyVersion, algorithm = AEAD.algId, nonce,
  } = ctx || {};

  exigir(vaultId !== undefined && vaultId !== null && `${vaultId}` !== '', 'falta vaultId');
  exigir(itemId !== undefined && itemId !== null && `${itemId}` !== '', 'falta itemId');
  exigir(ownerId !== undefined && ownerId !== null && `${ownerId}` !== '', 'falta ownerId');
  exigir(Number.isInteger(revision) && revision >= 0, 'revision debe ser un entero >= 0');
  exigir(Number.isInteger(keyVersion) && keyVersion >= 0, 'keyVersion debe ser un entero >= 0');
  exigir(nonce instanceof Uint8Array && nonce.length === AEAD.nonceBytes, 'nonce de longitud incorrecta');
  exigir(typeof algorithm === 'string' && algorithm.length > 0, 'falta algorithm');

  const canonico = [
    FORMATO,
    String(vaultId),
    String(itemId),
    String(ownerId),
    tenantId === null || tenantId === undefined ? null : String(tenantId),
    revision,
    keyVersion,
    algorithm,
    aBase64Url(nonce),
  ];

  // El orden lo fija CAMPOS_AAD: si algún día se añade un campo, hay que
  // añadirlo aquí Y a CAMPOS_AAD, y subir VERSION_CRYPTO.
  if (canonico.length !== CAMPOS_AAD.length) {
    throw new Error('AAD: el número de campos no coincide con CAMPOS_AAD');
  }

  return utf8(JSON.stringify(canonico));
}

/**
 * AAD del envoltorio de una DEK (§7 R10): incluye `keyVersion` dentro del
 * propio envoltorio para impedir la key-version confusion.
 */
export function construirAADEnvoltura({ vaultId, keyVersion, proposito, algorithm = AEAD.algId, nonce }) {
  exigir(vaultId !== undefined && vaultId !== null && `${vaultId}` !== '', 'falta vaultId');
  exigir(Number.isInteger(keyVersion) && keyVersion >= 0, 'keyVersion debe ser un entero >= 0');
  exigir(typeof proposito === 'string' && proposito.length > 0, 'falta proposito');
  exigir(nonce instanceof Uint8Array && nonce.length === AEAD.nonceBytes, 'nonce de longitud incorrecta');

  const canonico = [
    FORMATO,
    'envelope',
    String(vaultId),
    keyVersion,
    proposito,
    algorithm,
    aBase64Url(nonce),
  ];

  if (canonico.length !== CAMPOS_AAD_ENVOLTURA.length) {
    throw new Error('AAD de envoltura: el número de campos no coincide');
  }

  return utf8(JSON.stringify(canonico));
}

/**
 * Reconstruye el AAD a partir de la fila almacenada. Es lo que el cliente
 * ejecuta antes de descifrar: si la fila fue manipulada, el AAD calculado
 * no coincide con el que se autenticó y el descifrado falla.
 */
export function aadDesdeAlmacenamiento(fila) {
  return construirAAD(fila);
}
