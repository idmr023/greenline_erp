/**
 * Exportación cifrada — Bóveda Segura V5 §28 (formato 28.1).
 *
 *   passphrase de export (aleatoria, 256 bits)
 *        │
 *        ▼
 *   Argon2id(salt propio) ──► HKDF "…/v1/exportacion" ──► clave de export
 *        │
 *        ▼
 *   AES-256-GCM(items JSON, AAD = fichero)
 *
 * R121: la passphrase NUNCA es la maestra actual — tiene su propio KDF y
 * su propio salt, así que descifrar el export no ayuda a atacar la bóveda
 * ni al revés.
 *
 * R123: este módulo no toca `localStorage`, ni `URL.createObjectURL`, ni
 * descarga nada. Devuelve un objeto; el que decide bajarlo es el usuario
 * en su clic (§28).
 *
 * No existe export plaintext/CSV: §28 lo permitía con doble confirmación,
 * y la opción más segura de las admitidas es no implementarlo.
 */

import { argon2id } from '@noble/hashes/argon2.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';

import { cifrarConAAD, descifrarConAAD } from './aead.js';
import { validarParamsArgon2 } from './kdf.js';
import {
  AEAD,
  ARGON2_EXPORT,
  CAMPOS_AAD_EXPORT,
  ETIQUETAS,
  FORMATO_EXPORT,
  MAX_EXPORTS_POR_HORA,
  VERSION_EXPORT,
} from './params.js';
import { aBase64Url, borrar, bytesAleatorios, desdeBase64Url, utf8 } from './random.js';

export class ErrorExport extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.name = 'ErrorExport';
  }
}

/** §28.1 — AAD canónico del fichero. El orden lo fija CAMPOS_AAD_EXPORT. */
export function construirAADExport({ vaultId, creadoEn, itemCount }) {
  if (!vaultId) throw new ErrorExport('Falta vaultId para el AAD del export');
  if (typeof creadoEn !== 'string' || creadoEn.length === 0) {
    throw new ErrorExport('Falta creadoEn para el AAD del export');
  }
  if (!Number.isInteger(itemCount) || itemCount < 0) {
    throw new ErrorExport('itemCount inválido');
  }
  const canonico = [
    FORMATO_EXPORT,
    VERSION_EXPORT,
    String(vaultId),
    creadoEn,
    itemCount,
    AEAD.algId,
  ];
  if (canonico.length !== CAMPOS_AAD_EXPORT.length) {
    throw new ErrorExport('AAD de export: el número de campos no coincide');
  }
  return utf8(JSON.stringify(canonico));
}

/**
 * R121 — passphrase de export aleatoria de 256 bits. Se muestra UNA vez:
 * no se guarda ni se recupera.
 */
export function generarPassphraseExport() {
  return aBase64Url(bytesAleatorios(32));
}

function exigirPassphrase(passphrase) {
  if (typeof passphrase !== 'string' || passphrase.length < 12) {
    throw new ErrorExport('La passphrase de export debe tener al menos 12 caracteres');
  }
}

async function claveDeExport(passphrase, salt, params = ARGON2_EXPORT) {
  // El suelo de §5.1 aplica también aquí: un export con KDF débil sería el
  // eslabón más flojo del sistema aunque la bóveda esté bien protegida.
  validarParamsArgon2(params);
  const ikm = argon2id(utf8(passphrase), salt, {
    t: params.t,
    m: params.m,
    p: params.p,
    dkLen: params.dkLen,
  });
  try {
    return hkdf(sha256, ikm, salt, utf8(ETIQUETAS.exportacion), AEAD.claveBytes);
  } finally {
    borrar(ikm);
  }
}

/**
 * Construye el fichero GL-VAULT-EXPORT de §28.1.
 *
 * @param {object} args
 * @param {Array} args.items  items YA descifrados en cliente
 * @param {string} args.passphrase
 * @param {string} args.vaultId
 * @param {string} [args.creadoEn] ISO-8601
 * @param {object} [args.parametros] sólo para tests/telemetría; se valida
 *   contra MINIMOS_ARGON2 igual que la bóveda (§5.1)
 * @returns {Promise<object>} objeto listo para `JSON.stringify`
 */
export async function crearExport({ items, passphrase, vaultId, creadoEn, parametros }) {
  exigirPassphrase(passphrase);
  if (!Array.isArray(items)) throw new ErrorExport('items debe ser un array');
  const params = validarParamsArgon2(parametros || ARGON2_EXPORT);

  const creado = creadoEn || new Date().toISOString();
  const salt = bytesAleatorios(params.saltBytes || ARGON2_EXPORT.saltBytes);
  const clave = await claveDeExport(passphrase, salt, params);

  try {
    const aad = construirAADExport({ vaultId, creadoEn: creado, itemCount: items.length });
    const { nonce, ciphertext, tag } = await cifrarConAAD(clave, utf8(JSON.stringify(items)), () => aad);

    return {
      format: FORMATO_EXPORT,
      format_version: VERSION_EXPORT,
      created_at: creado,
      item_count: items.length,
      kdf: {
        name: params.nombre,
        m: params.m,
        t: params.t,
        p: params.p,
        salt: aBase64Url(salt),
        version: 1,
      },
      cipher: AEAD.algId,
      nonce: aBase64Url(nonce),
      aad: aBase64Url(aad),
      ciphertext: aBase64Url(ciphertext),
      mac: aBase64Url(tag),
    };
  } finally {
    borrar(clave);
  }
}

function exigirFormato(exportacion) {
  if (!exportacion || typeof exportacion !== 'object') {
    throw new ErrorExport('Export vacío');
  }
  if (exportacion.format !== FORMATO_EXPORT) {
    throw new ErrorExport(`Formato desconocido: ${String(exportacion.format)}`);
  }
  if (exportacion.format_version !== VERSION_EXPORT) {
    // R122 — sólo se admiten versiones conocidas; una futura debe sumar un
    // parser aquí en lugar de aceptar lo que llegue.
    throw new ErrorExport(`Versión de export no soportada: ${String(exportacion.format_version)}`);
  }
  for (const campo of ['created_at', 'item_count', 'cipher', 'nonce', 'aad', 'ciphertext', 'mac']) {
    if (exportacion[campo] === undefined || exportacion[campo] === null) {
      throw new ErrorExport(`El export no trae «${campo}»`);
    }
  }
  if (exportacion.cipher !== AEAD.algId) {
    throw new ErrorExport(`Cipher no permitido: ${String(exportacion.cipher)}`);
  }
  if (!exportacion.kdf || exportacion.kdf.name !== ARGON2_EXPORT.nombre) {
    throw new ErrorExport('KDF del export no reconocido');
  }
  return true;
}

/**
 * Abre un fichero exportado. `vaultId` debe coincidir con el del AAD: si
 * alguien reutiliza el ciphertext con otro vault, el descifrado falla.
 *
 * @returns {Promise<Array>} los items originales
 */
export async function abrirExport({ exportacion, passphrase, vaultId }) {
  exigirFormato(exportacion);
  exigirPassphrase(passphrase);

  const salt = desdeBase64Url(exportacion.kdf.salt);
  const clave = await claveDeExport(passphrase, salt, {
    nombre: exportacion.kdf.name,
    m: exportacion.kdf.m,
    t: exportacion.kdf.t,
    p: exportacion.kdf.p,
    dkLen: ARGON2_EXPORT.dkLen,
    saltBytes: ARGON2_EXPORT.saltBytes,
  });

  try {
    const aad = construirAADExport({
      vaultId,
      creadoEn: exportacion.created_at,
      itemCount: exportacion.item_count,
    });
    // El AAD almacenado sólo se usa para comprobar que el fichero no fue
    // recortado: el que se autentica es el reconstruido.
    if (aBase64Url(aad) !== exportacion.aad) {
      throw new ErrorExport('El AAD almacenado no coincide con el del fichero');
    }

    const bytes = await descifrarConAAD(
      clave,
      {
        algorithm: exportacion.cipher,
        nonce: desdeBase64Url(exportacion.nonce),
        ciphertext: desdeBase64Url(exportacion.ciphertext),
        tag: desdeBase64Url(exportacion.mac),
      },
      aad,
    );
    try {
      const items = JSON.parse(new TextDecoder().decode(bytes));
      if (!Array.isArray(items)) throw new ErrorExport('El contenido del export no es una lista');
      if (items.length !== exportacion.item_count) {
        throw new ErrorExport('item_count no coincide con el contenido');
      }
      return items;
    } finally {
      borrar(bytes);
    }
  } finally {
    borrar(clave);
  }
}

/**
 * R125 — techo por ventana de hora. La cuenta sale de la auditoría, así
 * que es una barrera de cortesía: lo que realmente deja rastro es el
 * registro del propio export.
 *
 * @param {number} exportsUltimaHora
 */
export function puedeExportar(exportsUltimaHora) {
  const n = Number(exportsUltimaHora);
  // Fail-closed: si no se pudo contar, no se exporta (§52 R150).
  if (!Number.isFinite(n) || n < 0) {
    throw new ErrorExport('No se pudo comprobar el límite de exportaciones: se deniega.');
  }
  if (n >= MAX_EXPORTS_POR_HORA) {
    throw new ErrorExport(
      `Límite de ${MAX_EXPORTS_POR_HORA} exportaciones por hora alcanzado (§28 R125).`,
    );
  }
  return true;
}

/**
 * R124 — lo que se audita: formato, recuento y destino. Nunca el contenido
 * ni la passphrase.
 */
export function detalleAuditoriaExport({ item_count: itemCount, destino = 'descarga' }) {
  return JSON.stringify({ formato: FORMATO_EXPORT, items: itemCount, destino });
}
