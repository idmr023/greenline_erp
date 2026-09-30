/**
 * Envelope encryption — Bóveda Segura V5 §7.
 *
 * La DEK jamás se guarda en claro: se envuelve con la KEK y cada envoltorio
 * lleva su `key_version` DENTRO del AAD (R10), lo que impide la
 * key-version confusion: reclamar que un envoltorio pertenece a v2 cuando
 * se creó con v1 hace fallar el descifrado en lugar de aceptarlo.
 */

import { construirAADEnvoltura } from './aad.js';
import { cifrarConAAD, descifrarConAAD } from './aead.js';
import { AEAD } from './params.js';
import { borrar } from './random.js';

/** Propósitos conocidos de un envoltorio. Cualquier otro se rechaza. */
export const PROPOSITOS = Object.freeze({
  dek: 'dek',
  /**
   * §27 R117 — la envoltura DEK bajo la KEK anterior. Vive junto a la
   * vigente durante la ventana de migración tras un cambio de maestra y
   * se revoca al cerrarla. Al ir dentro del AAD, una envoltura vieja no
   * puede hacerse pasar por vigente (§7 R10).
   */
  dek_previa: 'dek_previa',
  recuperacion: 'recuperacion',
  dispositivo: 'dispositivo',
  comparticion: 'comparticion',
  exportacion: 'exportacion',
  /**
   * §6.2 (Fase 5.1) — las dos mitades del par asimétrico viajan con un
   * propósito distinto cada una: como el propósito va dentro del AAD, la
   * envoltura de la clave de firma no puede abrirse haciéndose pasar por la
   * de canje (misma defensa que R10 aplica a `key_version`).
   */
  par_firma: 'par_firma',
  par_canje: 'par_canje',
});

function exigirProposito(proposito) {
  if (!Object.values(PROPOSITOS).includes(proposito)) {
    throw new Error(`Propósito de envoltorio desconocido: ${String(proposito)}`);
  }
}

/**
 * @param {Uint8Array} kekBytes clave de envoltorio (nunca se almacena en claro)
 * @param {Uint8Array} dekBytes clave de datos a proteger
 * @param {{vaultId:string, keyVersion:number, proposito:string}} contexto
 * @returns {Promise<{algorithm:string, nonce:Uint8Array, ciphertext:Uint8Array, tag:Uint8Array}>}
 */
export async function envolverClave(kekBytes, dekBytes, contexto) {
  const { vaultId, keyVersion, proposito } = contexto || {};
  exigirProposito(proposito);

  const resultado = await cifrarConAAD(kekBytes, dekBytes, (nonce) =>
    construirAADEnvoltura({ vaultId, keyVersion, proposito, algorithm: AEAD.algId, nonce }),
  );

  // El AAD se devuelve para poder reconstruirlo al abrir; el caller almacena
  // el resto en `wrapped_keys` (§10).
  return resultado;
}

/**
 * @param {Uint8Array} kekBytes
 * @param {{algorithm:string, nonce:Uint8Array, ciphertext:Uint8Array, tag:Uint8Array}} envoltura
 * @param {{vaultId:string, keyVersion:number, proposito:string}} contexto
 * @returns {Promise<Uint8Array>} la DEK en memoria, lista para usar y borrar (§15.1)
 */
export async function desenvolverClave(kekBytes, envoltura, contexto) {
  const { vaultId, keyVersion, proposito } = contexto || {};
  exigirProposito(proposito);

  const aad = construirAADEnvoltura({
    vaultId,
    keyVersion,
    proposito,
    algorithm: envoltura?.algorithm,
    nonce: envoltura?.nonce,
  });

  return descifrarConAAD(kekBytes, envoltura, aad);
}

/**
 * §5.3 — confirmación LOCAL de la KEK.
 *
 * El cliente comprueba que la clave derivada abre un envoltorio de prueba
 * antes de descargar/manipular la bóveda entera. Si falla, la master
 * password era incorrecta y no se toca nada más.
 *
 * Prohibido (y esto corrige la redacción de la V4): guardar en el servidor
 * un confirmation value derivado de la master password. Bajo la Opción C de
 * §3.1 eso recrearía exactamente el oráculo de fuerza bruta offline que la
 * Opción C existe para evitar.
 *
 * @returns {Promise<boolean>}
 */
export async function confirmarKEK(kekBytes, envolturaDePrueba, contexto) {
  try {
    const dek = await desenvolverClave(kekBytes, envolturaDePrueba, contexto);
    borrar(dek);
    return true;
  } catch {
    return false;
  }
}
