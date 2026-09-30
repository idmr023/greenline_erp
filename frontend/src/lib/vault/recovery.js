/**
 * Recovery key anti-escrow — Bóveda Segura V5 §25.
 *
 *   Recovery key (256 bits, CSPRNG en cliente)
 *        │
 *        ▼
 *   HKDF-SHA256(salt = salt de la bóveda, info = "…/v1/recovery")
 *        │
 *        ▼
 *   KEK de recuperación ──► envuelve cada DEK vigente con
 *                           proposito='recuperacion'  (R106)
 *
 * §25.1 — restricción anti-escrow: NINGUNO de estos bytes viaja al
 * servidor. Si la recovery key llegara a la API, o si el servidor guardara
 * una copia de la KEK, el sistema dejaría de ser zero-knowledge y habría
 * que declararlo en §53. Por eso este módulo no importa `supabase`: sólo
 * puede producir material y envolverlo, jamás persistirlo.
 *
 * R107: la envoltura de recuperación se revoca tras su primer uso.
 */

import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';

import { construirAADEnvoltura } from './aad.js';
import { descifrarConAAD } from './aead.js';
import { envolverClave, PROPOSITOS } from './envelope.js';
import { AEAD, ETIQUETAS, LONGITUD_RECOVERY_KEY } from './params.js';
import { aBase64Url, borrar, bytesAleatorios, desdeBase64Url, utf8 } from './random.js';

const GRUPO = 5;
/**
 * Separador de los grupos. NO puede ser `-` ni `_`: ambos forman parte del
 * alfabeto base64url, así que separar con ellos volvería ambigua la
 * lectura (¿era separador o era dato?). `.` no aparece nunca en base64url.
 */
const SEPARADOR = '.';

export class ErrorRecovery extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.name = 'ErrorRecovery';
  }
}

/** §25.3 R105 — 256 bits de CSPRNG en cliente. */
export function generarRecoveryKey() {
  const bytes = bytesAleatorios(LONGITUD_RECOVERY_KEY);
  return { bytes, texto: formatearRecoveryKey(bytes) };
}

/**
 * Forma imprimible: grupos de 5 separados por puntos. No aporta
 * seguridad, sólo evita errores de transcripción al guardarla en papel.
 */
export function formatearRecoveryKey(bytes) {
  const bruto = aBase64Url(bytes);
  const grupos = [];
  for (let i = 0; i < bruto.length; i += GRUPO) grupos.push(bruto.slice(i, i + GRUPO));
  return grupos.join(SEPARADOR);
}

/** Tolerante a puntos y espacios (se suele teclear de un papel). */
export function parsearRecoveryKey(texto) {
  if (typeof texto !== 'string' || texto.trim() === '') {
    throw new ErrorRecovery('Falta la recovery key');
  }
  const limpio = texto.replace(/[.\s]/g, '');
  let bytes;
  try {
    bytes = desdeBase64Url(limpio);
  } catch {
    throw new ErrorRecovery('Recovery key con formato no válido');
  }
  if (bytes.length !== LONGITUD_RECOVERY_KEY) {
    throw new ErrorRecovery(
      `La recovery key debe tener ${LONGITUD_RECOVERY_KEY} bytes (${LONGITUD_RECOVERY_KEY * 8} bits)`,
    );
  }
  return bytes;
}

/**
 * §25.3 R105 — KEK de recuperación. El salt es el de la bóveda (no es
 * secreto, §5.1) y hace que dos bóvedas no compartan material aunque la
 * recovery key fuera idéntica.
 *
 * @param {Uint8Array} recoveryKey
 * @param {Uint8Array} saltBoveda
 * @returns {Uint8Array} 32 bytes
 */
export function derivarKEKRecuperacion(recoveryKey, saltBoveda) {
  if (!(recoveryKey instanceof Uint8Array) || recoveryKey.length < 16) {
    throw new ErrorRecovery('Recovery key demasiado corta');
  }
  if (!(saltBoveda instanceof Uint8Array) || saltBoveda.length < 8) {
    throw new ErrorRecovery('salt de la bóveda inválido');
  }
  return hkdf(sha256, recoveryKey, saltBoveda, utf8(ETIQUETAS.claveRecuperacion), 32);
}

/**
 * R106 — reenvuelve cada DEK vigente bajo la KEK de recuperación.
 *
 * @param {Uint8Array} kekRecuperacion
 * @param {Array<{keyVersion:number, envoltura:object}>} deks
 * @param {string} vaultId
 * @returns {Promise<Array<{keyVersion:number, envoltura:object}>>}
 */
export async function envolverDEKsParaRecuperacion(kekRecuperacion, deks, vaultId) {
  if (!Array.isArray(deks) || deks.length === 0) {
    throw new ErrorRecovery('No hay DEKs que envolver');
  }
  const salidas = [];
  for (const { keyVersion, dek } of deks) {
    const envoltura = await envolverClave(kekRecuperacion, dek, {
      vaultId,
      keyVersion,
      proposito: PROPOSITOS.recuperacion,
    });
    salidas.push({ keyVersion, envoltura });
  }
  return salidas;
}

/**
 * Abre las envolturas de recuperación. Es el paso de `usarRecoveryKey`:
 * devuelve las DEKs en memoria para que el caller las reenvuelva bajo una
 * KEK nueva (R109) — este módulo nunca las persiste ni las devuelve a
 * pantalla.
 *
 * @param {Uint8Array} kekRecuperacion
 * @param {Array<{keyVersion:number, envoltura:object}>} envolturas
 * @param {string} vaultId
 * @returns {Promise<Array<{keyVersion:number, dek:Uint8Array}>>}
 */
export async function desenvolverDEKsDeRecuperacion(kekRecuperacion, envolturas, vaultId) {
  if (!Array.isArray(envolturas) || envolturas.length === 0) {
    throw new ErrorRecovery('No hay envolturas de recuperación');
  }
  const salidas = [];
  for (const { keyVersion, envoltura } of envolturas) {
    const aad = construirAADEnvoltura({
      vaultId,
      keyVersion,
      proposito: PROPOSITOS.recuperacion,
      algorithm: envoltura.algorithm,
      nonce: envoltura.nonce,
    });
    const dek = await descifrarConAAD(kekRecuperacion, envoltura, aad);
    salidas.push({ keyVersion, dek });
  }
  return salidas;
}

/**
 * Confirmación local (§5.3) antes de intentar nada más: ¿esta recovery key
 * abre alguna envoltura? Si no, la key es incorrecta y NO se debe revelar
 * al usuario siquiera un bit de detalle sobre por qué.
 *
 * @returns {Promise<boolean>}
 */
export function confirmarRecoveryKey(kekRecuperacion, envolturas, vaultId) {
  return desenvolverDEKsDeRecuperacion(kekRecuperacion, envolturas, vaultId)
    .then((deks) => {
      deks.forEach((d) => borrar(d.dek));
      return true;
    })
    .catch(() => false);
}

/** Comodidad para no repetir la derivación en cada caller. */
export function kekDeRecoveryKey(recoveryKey, saltBoveda) {
  return derivarKEKRecuperacion(recoveryKey, saltBoveda);
}

/** El AEAD que usan los envoltorios de este módulo (lista blanca §8). */
export const ALGORITMO_RECOVERY = AEAD.algId;
