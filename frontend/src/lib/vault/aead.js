/**
 * Cifrado autenticado AES-256-GCM con AAD — Bóveda Segura V5 §8.
 *
 * WebCrypto concatena el tag de 16 bytes al final del ciphertext; aquí se
 * separan porque el modelo de datos de §11 los guarda en columnas distintas
 * (`ciphertext` y `authentication_tag`).
 *
 * El bloque de abajo (`cifrarConAAD` / `descifrarConAAD`) es el primitivo
 * único de todo el módulo: los items de la bóveda (§8.1) y el envoltorio de
 * las DEKs (§7) se construyen encima de él para no duplicar criptografía.
 */

import { construirAAD } from './aad.js';
import { AEAD, ALGORITMOS_PERMITIDOS, MAX_ITEMS_POR_DEK } from './params.js';
import { aBytes, bytesAleatorios, concatenar } from './random.js';

/**
 * Error único y sin filtrar información: no revela si falló el tag, el AAD
 * o la clave. Esa distinción sólo beneficiaría a un atacante.
 */
export class ErrorDescifrado extends Error {
  constructor(mensaje = 'No se pudo verificar la integridad del contenido') {
    super(mensaje);
    this.name = 'ErrorDescifrado';
  }
}

/** R21 — lista blanca de algoritmos; cualquier otro se rechaza. */
export function exigirAlgoritmo(algorithm) {
  if (typeof algorithm !== 'string' || !ALGORITMOS_PERMITIDOS.has(algorithm)) {
    throw new ErrorDescifrado('Algoritmo criptográfico no permitido');
  }
}

async function importarClave(bytes) {
  const clave = aBytes(bytes, 'clave');
  if (clave.length !== AEAD.claveBytes) {
    throw new Error(`La clave AES-256-GCM debe tener ${AEAD.claveBytes} bytes`);
  }
  return crypto.subtle.importKey('raw', clave, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
}

/**
 * R18 — el techo de §8.2 se comprueba ANTES de cifrar, nunca después.
 * @returns {true}
 */
export function comprobarTechoDeClave(contadorDeItems, maximo = MAX_ITEMS_POR_DEK) {
  if (!Number.isInteger(contadorDeItems) || contadorDeItems < 0) {
    throw new Error('Contador de items inválido');
  }
  if (contadorDeItems >= maximo) {
    const error = new Error(
      `La clave alcanzó el techo de ${maximo} items: rotación de DEK obligatoria (§8.2)`,
    );
    error.code = 'DEK_TECHO_ALCANZADO';
    throw error;
  }
  return true;
}

/**
 * Primitivo: cifra generando el nonce y delegando en el caller la
 * construcción del AAD (que debe incluir ese nonce, §8.1 R14).
 *
 * @param {Uint8Array} claveBytes
 * @param {Uint8Array} plaintext
 * @param {(nonce: Uint8Array) => Uint8Array} construirAad
 */
export async function cifrarConAAD(claveBytes, plaintext, construirAad) {
  const datos = aBytes(plaintext, 'plaintext');
  if (typeof construirAad !== 'function') {
    throw new Error('Falta el constructor del AAD');
  }

  const nonce = bytesAleatorios(AEAD.nonceBytes);
  const aad = construirAad(nonce);
  if (!(aad instanceof Uint8Array) || aad.length === 0) {
    throw new Error('El AAD debe ser un Uint8Array no vacío');
  }

  const clave = await importarClave(claveBytes);
  const completo = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce, additionalData: aad, tagLength: 128 },
      clave,
      datos,
    ),
  );

  const corte = completo.length - AEAD.tagBytes;
  return {
    algorithm: AEAD.algId,
    nonce,
    ciphertext: completo.slice(0, corte),
    tag: completo.slice(corte),
    aad,
  };
}

/**
 * Primitivo: descifra autenticando contra el AAD indicado.
 * @param {Uint8Array} claveBytes
 * @param {{algorithm:string, nonce:Uint8Array, ciphertext:Uint8Array, tag:Uint8Array}} envoltura
 * @param {Uint8Array} aad
 */
export async function descifrarConAAD(claveBytes, envoltura, aad) {
  const { algorithm, nonce, ciphertext, tag } = envoltura || {};
  exigirAlgoritmo(algorithm);

  if (!(nonce instanceof Uint8Array) || nonce.length !== AEAD.nonceBytes) {
    throw new ErrorDescifrado();
  }
  if (!(ciphertext instanceof Uint8Array) || !(tag instanceof Uint8Array)) {
    throw new ErrorDescifrado();
  }
  if (tag.length !== AEAD.tagBytes) {
    throw new ErrorDescifrado();
  }
  if (!(aad instanceof Uint8Array) || aad.length === 0) {
    throw new ErrorDescifrado();
  }

  try {
    const clave = await importarClave(claveBytes);
    const descifrado = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: nonce, additionalData: aad, tagLength: 128 },
      clave,
      concatenar(ciphertext, tag),
    );
    return new Uint8Array(descifrado);
  } catch {
    throw new ErrorDescifrado();
  }
}

/**
 * Cifra un ítem de bóveda con el AAD contextual de §8.1.
 * @param {Uint8Array} claveBytes DEK vigente
 * @param {Uint8Array} plaintext
 * @param {object} contexto { vaultId, itemId, ownerId, tenantId?, revision, keyVersion }
 */
export async function cifrar(claveBytes, plaintext, contexto) {
  return cifrarConAAD(claveBytes, plaintext, (nonce) =>
    construirAAD({ ...contexto, algorithm: AEAD.algId, nonce }),
  );
}

/**
 * Descifra un ítem reconstruyendo el AAD desde el contexto vigente.
 *
 * Si alguien movió el ciphertext a otra fila, alteró `ownerId`/`tenantId`
 * o rebobinó `revision`, el AAD calculado no coincide con el autenticado y
 * el descifrado falla (splicing y replay — §38).
 */
export async function descifrar(claveBytes, envoltura, contexto) {
  const aad = construirAAD({ ...contexto, algorithm: envoltura?.algorithm, nonce: envoltura?.nonce });
  return descifrarConAAD(claveBytes, envoltura, aad);
}

/** Serializa un objeto de bóveda a bytes (§9: el JSON vive sólo cifrado). */
export function serializar(item) {
  return new TextEncoder().encode(JSON.stringify(item));
}

export function deserializar(bytes) {
  return JSON.parse(new TextDecoder().decode(aBytes(bytes, 'contenido')));
}
