/**
 * Cambio de contraseña maestra — Bóveda Segura V5 §27.
 *
 * La operación NO descifra ni vuelve a cifrar los items: sólo reenvuelve
 * las DEKs bajo la KEK nueva y rota el salt. Los items siguen con el mismo
 * ciphertext y la misma DEK, así que el coste es constante en el número de
 * registros (§27, último párrafo).
 *
 *   KEK antigua ──► desenvuelve cada DEK
 *   salt nuevo + Argon2id ──► IKM nuevo ──► KEK nueva
 *   KEK nueva  ──► re-envuelve cada DEK
 *
 * Este módulo es PURO (sin red): hace el cálculo y la verificación local
 * de R120. La escritura atómica en servidor la hace `vault_rekey()` en el
 * repo hermano (R116), que recibe TODO el conjunto y aplica o nada.
 */

import { construirAADEnvoltura } from './aad.js';
import { descifrarConAAD } from './aead.js';
import { envolverClave, PROPOSITOS } from './envelope.js';
import { borrar, igualdadConstante } from './random.js';

export class ErrorRekey extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.name = 'ErrorRekey';
  }
}

/**
 * R116 — todas o ninguna. Si una sola envoltura no se puede rehacer, se
 * aborta ANTES de tocar el servidor: no existe estado intermedio.
 *
 * @param {object} args
 * @param {Uint8Array} args.kekVieja
 * @param {Uint8Array} args.kekNueva
 * @param {string} args.vaultId
 * @param {Array<{keyVersion:number, envoltura:object}>} args.envolturas DEKs vigentes
 * @returns {Promise<Array<{keyVersion:number, envoltura:object}>>}
 */
export async function reenvolverDEKs({ kekVieja, kekNueva, vaultId, envolturas }) {
  if (!Array.isArray(envolturas) || envolturas.length === 0) {
    throw new ErrorRekey('No hay envolturas de DEK que reenvolver');
  }
  if (!kekVieja || !kekNueva) {
    throw new ErrorRekey('Faltan la KEK antigua o la nueva');
  }

  const hechas = [];
  const abiertas = [];
  try {
    for (const { keyVersion, envoltura } of envolturas) {
      const aadVieja = construirAADEnvoltura({
        vaultId,
        keyVersion,
        proposito: PROPOSITOS.dek,
        algorithm: envoltura.algorithm,
        nonce: envoltura.nonce,
      });
      let dek;
      try {
        // Si la contraseña vieja era incorrecta o alguien alteró la fila,
        // esto lanza y no llegamos a escribir nada.
        dek = await descifrarConAAD(kekVieja, envoltura, aadVieja);
      } catch (error) {
        // Se normaliza: para el llamante sólo existe "no se pudo reenvolver",
        // y no debe distinguir si falló el tag, el AAD o la clave (§8).
        throw new ErrorRekey(
          `No se pudo abrir la envoltura de la DEK v${keyVersion} con la KEK actual: ${error.message}`,
        );
      }
      abiertas.push(dek);

      const nueva = await envolverClave(kekNueva, dek, {
        vaultId,
        keyVersion,
        proposito: PROPOSITOS.dek,
      });
      hechas.push({ keyVersion, envoltura: nueva });
    }
    return hechas;
  } finally {
    abiertas.forEach(borrar);
  }
}

/**
 * R120 — el cliente debe verificar que puede re-descifrar una muestra
 * ANTES de confirmar el cambio.
 *
 * Se comprueba el conjunto completo porque el coste es el de abrir N
 * envolturas de 32 bytes: no hay razón para muestrear. Si algo falla, el
 * caller no llama a `vault_rekey` y el servidor queda intacto (rollback
 * automático por omisión).
 *
 * @returns {Promise<{ok:boolean, fallos:number}>}
 */
export async function verificarReenvolturas({ kekVieja, kekNueva, vaultId, originales, nuevas }) {
  if (!Array.isArray(originales) || originales.length !== (nuevas?.length ?? 0)) {
    return { ok: false, fallos: originales?.length ?? 0 };
  }

  let fallos = 0;
  for (let i = 0; i < originales.length; i += 1) {
    const original = originales[i];
    const nueva = nuevas[i];
    if (original.keyVersion !== nueva.keyVersion) {
      fallos += 1;
      continue;
    }
    try {
      const abiertaVieja = await descifrarConAAD(kekVieja, original.envoltura, construirAADEnvoltura({
        vaultId,
        keyVersion: original.keyVersion,
        proposito: PROPOSITOS.dek,
        algorithm: original.envoltura.algorithm,
        nonce: original.envoltura.nonce,
      }));
      const abiertaNueva = await descifrarConAAD(kekNueva, nueva.envoltura, construirAADEnvoltura({
        vaultId,
        keyVersion: nueva.keyVersion,
        proposito: PROPOSITOS.dek,
        algorithm: nueva.envoltura.algorithm,
        nonce: nueva.envoltura.nonce,
      }));
      if (!igualdadConstante(abiertaVieja, abiertaNueva)) fallos += 1;
      borrar(abiertaVieja);
      borrar(abiertaNueva);
    } catch {
      fallos += 1;
    }
  }

  return { ok: fallos === 0, fallos };
}

/**
 * Fallback de R117: si `originales` no se pueden abrir con la KEK vieja
 * pero sí las nuevas con la nueva, alguien ya re-encriptó — no continuar.
 */
export function resultadoVerificable(verificacion) {
  if (!verificacion?.ok) {
    throw new ErrorRekey(
      `Verificación post-re-wrap fallida (${verificacion?.fallos ?? '?'} claves): no se cambia nada.`,
    );
  }
  return true;
}
