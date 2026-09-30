/**
 * Derivación de claves — Bóveda Segura V5 §5.
 *
 *   Master Password
 *        │
 *        ▼
 *   Argon2id(master, salt, m/t/p)  ──►  IKM (64 bytes, nunca se almacena)
 *        │
 *        ▼
 *   HKDF-SHA-256 con etiquetas separadas
 *        ├── info "…/v1/auth"         → auth_key   (opción B declarada)
 *        ├── info "…/v1/kek"          → kek        (envuelve las DEKs)
 *        └── info "…/v1/recuperacion" → recovery   (§25)
 *
 * §5.2 R5: la misma salida de Argon2 jamás se usa directamente como clave.
 */

import { argon2id } from '@noble/hashes/argon2.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';

import { ARGON2, ETIQUETAS, MINIMOS_ARGON2, VERSION_KDF } from './params.js';
import { borrar, bytesAleatorios, utf8 } from './random.js';

/**
 * R61–R66 de §17.1 no viven aquí (son de la contraseña de la cuenta y del
 * formulario), pero este módulo exige que la maestra no esté vacía.
 */
export function validarMasterPassword(masterPassword) {
  if (typeof masterPassword === 'string' && masterPassword.length > 0) return true;
  if (masterPassword instanceof Uint8Array && masterPassword.length > 0) return true;
  throw new Error('La contraseña maestra no puede estar vacía');
}

/**
 * §5.1: parámetros por debajo del suelo absoluto → no se deriva nada.
 * Preferible fallar en cara a producir una bóveda con KDF débil.
 */
export function validarParamsArgon2(params = ARGON2) {
  const { m, t, p, dkLen } = params || {};
  if (!Number.isInteger(m) || m < MINIMOS_ARGON2.m) {
    throw new Error(`Argon2id m=${m} por debajo del mínimo ${MINIMOS_ARGON2.m} KiB (§5.1)`);
  }
  if (!Number.isInteger(t) || t < MINIMOS_ARGON2.t) {
    throw new Error(`Argon2id t=${t} por debajo del mínimo ${MINIMOS_ARGON2.t} (§5.1)`);
  }
  if (!Number.isInteger(p) || p < MINIMOS_ARGON2.p) {
    throw new Error(`Argon2id p=${p} por debajo del mínimo ${MINIMOS_ARGON2.p} (§5.1)`);
  }
  if (!Number.isInteger(dkLen) || dkLen < 32) {
    throw new Error('Argon2id dkLen debe ser >= 32 bytes');
  }
  return params;
}

/** El salt no es secreto: se almacena junto a la bóveda (§5.1). */
export function saltAleatorio() {
  return bytesAleatorios(ARGON2.saltBytes);
}

/**
 * Ejecuta Argon2id. BLOQUEA el hilo ~1,3 s con los parámetros de
 * producción: el llamante debe invocar esto desde un Web Worker (§15.1/R52).
 *
 * @param {string|Uint8Array} masterPassword
 * @param {Uint8Array} salt
 * @param {object} [params]
 * @returns {Uint8Array} IKM de `params.dkLen` bytes
 */
export function derivarIKM(masterPassword, salt, params = ARGON2) {
  validarMasterPassword(masterPassword);
  validarParamsArgon2(params);
  if (!(salt instanceof Uint8Array) || salt.length < 8) {
    throw new Error('El salt de la bóveda debe ser un Uint8Array de >= 8 bytes');
  }

  const password =
    typeof masterPassword === 'string' ? utf8(masterPassword) : masterPassword;

  return argon2id(password, salt, {
    t: params.t,
    m: params.m,
    p: params.p,
    dkLen: params.dkLen,
  });
}

/**
 * Expande el IKM en claves con propósito separado (§5.2 R5).
 * El salt de HKDF es el de la bóveda: no es secreto y hace que dos bóvedas
 * con la misma maestra no compartan claves derivadas.
 *
 * @param {Uint8Array} ikm
 * @param {Uint8Array} saltBoveda
 */
export function derivarMaterial(ikm, saltBoveda) {
  if (!(ikm instanceof Uint8Array) || ikm.length < 32) {
    throw new Error('IKM inválido');
  }
  if (!(saltBoveda instanceof Uint8Array)) {
    throw new Error('saltBoveda inválido');
  }

  const etiqueta = (nombre) => utf8(ETIQUETAS[nombre]);

  return {
    auth: hkdf(sha256, ikm, saltBoveda, etiqueta('auth'), 32),
    kek: hkdf(sha256, ikm, saltBoveda, etiqueta('kek'), 32),
    recuperacion: hkdf(sha256, ikm, saltBoveda, etiqueta('recuperacion'), 32),
  };
}

/**
 * §17 R66 — snapshot versionado de los parámetros usados, que viaja en el
 * bootstrap de la bóveda para que el cliente sepa cómo derivar.
 */
export function parametrosUsados(params = ARGON2) {
  return {
    nombre: ARGON2.nombre,
    version: VERSION_KDF,
    m: params.m,
    t: params.t,
    p: params.p,
    dkLen: params.dkLen,
    saltBytes: params.saltBytes,
  };
}

/**
 * Deriva TODO el material de una bóveda en una sola llamada.
 *
 * ⚠ BLOQUEA. Usar sólo desde un Web Worker (§15.1/R52).
 *
 * El IKM intermedio se sobreescribe antes de devolver (R51).
 *
 * @param {string|Uint8Array} masterPassword
 * @param {Uint8Array} saltBoveda
 * @param {object} [params]
 */
export function derivarMaterialMaestro(masterPassword, saltBoveda, params = ARGON2) {
  const ikm = derivarIKM(masterPassword, saltBoveda, params);
  try {
    const material = derivarMaterial(ikm, saltBoveda);
    return {
      ...material,
      parametros: parametrosUsados(params),
      salt: saltBoveda,
    };
  } finally {
    borrar(ikm);
  }
}
