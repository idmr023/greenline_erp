/**
 * Compartición por elemento — Bóveda Segura V5 §26 (Fase 5.1).
 *
 * Corrección de diseño sobre el diagrama de §26: aquí NO existe una DEK por
 * ítem (la bóveda tiene una sola, `dekActiva`), y envolverla equivaldría a
 * entregar la bóveda entera al receptor — más el IDOR de §22 sobre
 * `greenline_vault_items`. En su lugar cada compartición genera una
 * **content key efímera** que cifra un snapshot del secreto; esa content key
 * es lo único que se envuelve hacia el receptor:
 *
 * ```text
 *  A (propietario, desbloqueado)
 *   |-- snapshot = AEAD(CK, item)                        payload
 *   |-- eph   = X25519.keygen()                          R8: un solo uso
 *   |-- k     = HKDF(ECDH(eph_priv, pub_B), dominio, info)
 *   |-- wrappedKey = AEAD(k, CK)                         R110: ni KEK ni master
 *   |-- firma = Ed25519_A(tuple con wrappedKey y expiry)  R113
 *   v
 *  vault_shares  ---->  B verifica firma con pub_A, hace ECDH con su privada
 *                        y abre CK -> snapshot             R114
 * ```
 *
 * El receptor ve únicamente ese secreto y hasta `expiresAt` (R111): ni la DEK
 * de la bóveda ni la KEK del propietario se tocan (R110). Revocar (R112) es
 * que el servidor deje de servir la fila; no borra lo que B ya descifró,
 * limitación que §53 debe declarar.
 *
 * Todo corre dentro del worker (§15.1 R52), igual que el resto del módulo.
 */

import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';

import { cifrarConAAD, descifrarConAAD } from './aead.js';
import {
  AEAD,
  CAMPOS_AAD_COMPARTICION,
  CAMPOS_CLAVE_COMPARTICION,
  CAMPOS_COMPARTICION,
  ETIQUETAS,
  FORMATO,
  FORMATO_COMPARTICION,
  VERSION_COMPARTICION,
} from './params.js';
import {
  LONGITUDES,
  exigirPublica,
  firmar,
  generarEfimera,
  intercambiarClave,
  verificarFirma,
} from './asimetrica.js';
import { aBase64Url, borrar, bytesAleatorios, concatenar, utf8 } from './random.js';

export const CODIGOS_COMPARTICION = Object.freeze({
  invalida: 'DATOS_INVALIDOS',
  expirada: 'EXPIRADA',
  revocada: 'REVOCADA',
  receptor: 'RECEPTOR_INCORRECTO',
  firma: 'FIRMA_INVALIDA',
});

export class ErrorComparticion extends Error {
  constructor(mensaje, codigo) {
    super(mensaje);
    this.name = 'ErrorComparticion';
    this.codigo = codigo;
  }
}

function exigirIdentidad(valor, nombre) {
  if (valor === undefined || valor === null || `${valor}` === '') {
    throw new ErrorComparticion(`Falta ${nombre}`, CODIGOS_COMPARTICION.invalida);
  }
  return `${valor}`;
}

/** AAD del snapshot y de la content key: `tipo` impide que se intercambien. */
function construirAADComparticion({ tipo, vaultId, itemId, emisor, receptor, revision, nonce }) {
  if (!['payload', 'clave'].includes(tipo)) {
    throw new ErrorComparticion('Tipo de AAD de compartición desconocido', CODIGOS_COMPARTICION.invalida);
  }
  if (!Number.isInteger(revision) || revision < 0) {
    throw new ErrorComparticion('revision debe ser un entero >= 0', CODIGOS_COMPARTICION.invalida);
  }
  const canonico = [
    FORMATO,
    tipo,
    String(vaultId),
    String(itemId),
    String(emisor),
    String(receptor),
    revision,
    AEAD.algId,
    aBase64Url(nonce),
  ];
  if (canonico.length !== CAMPOS_AAD_COMPARTICION.length) {
    throw new ErrorComparticion('AAD: el número de campos no coincide con CAMPOS_AAD_COMPARTICION', CODIGOS_COMPARTICION.invalida);
  }
  return utf8(JSON.stringify(canonico));
}

/** Envoltura AEAD a los tres campos que viajan (el AAD se reconstruye). */
function serializarEnvoltura({ nonce, ciphertext, tag }) {
  return concatenar(nonce, ciphertext, tag);
}

/**
 * Serialización canónica de la tuple: array JSON de orden fijo, el mismo
 * criterio que §8.1 aplica al AAD para que ningún valor pueda alterar la
 * estructura. `campos` decide qué se incluye (HKDF sin wrappedKey, firma
 * con él), `valores` trae todos.
 */
function serializarCanonica(campos, valores) {
  const fila = campos.map((campo) => {
    const valor = valores[campo];
    if (valor === undefined) {
      throw new ErrorComparticion(`Falta el campo ${campo} de la tuple`, CODIGOS_COMPARTICION.invalida);
    }
    return valor;
  });
  return utf8(JSON.stringify(fila));
}

function validarExpiracion(expiresAt, ahora) {
  const expira = Date.parse(typeof expiresAt === 'string' ? expiresAt : '');
  if (!Number.isFinite(expira)) {
    throw new ErrorComparticion('expiresAt no es una fecha ISO válida', CODIGOS_COMPARTICION.invalida);
  }
  if (expira <= ahora) {
    throw new ErrorComparticion('La compartición ya ha expirado', CODIGOS_COMPARTICION.expirada);
  }
  return expira;
}

/**
 * §26 — envuelve un snapshot del ítem para otro usuario.
 *
 * @param {object} datos
 * @param {Uint8Array} datos.datos            plaintext del item, ya descifrado con la DEK
 * @param {Uint8Array} datos.clavePublicaReceptor  X25519 pública de B
 * @param {Uint8Array} datos.claveFirmaEmisor      Ed25519 privada de A (§6.2)
 * @param {string} datos.vaultId
 * @param {string} datos.itemId
 * @param {string|number} datos.emisor
 * @param {string|number} datos.receptor
 * @param {number} datos.revision             revisión del ítem compartido (§8.3)
 * @param {string} datos.expiresAt            ISO; obligatoria (R111)
 * @returns {Promise<object>} fila lista para `vault_shares`
 */
export async function envolverPara({
  datos,
  clavePublicaReceptor,
  claveFirmaEmisor,
  vaultId,
  itemId,
  emisor,
  receptor,
  revision,
  expiresAt,
  ahora = Date.now(),
}) {
  if (!(datos instanceof Uint8Array) || datos.length === 0) {
    throw new ErrorComparticion('El snapshot a compartir debe ser un Uint8Array no vacío', CODIGOS_COMPARTICION.invalida);
  }
  exigirPublica(clavePublicaReceptor, 'clave pública X25519 del receptor');
  if (!(claveFirmaEmisor instanceof Uint8Array) || claveFirmaEmisor.length !== LONGITUDES.privada) {
    throw new ErrorComparticion(`La clave de firma debe ser un Uint8Array de ${LONGITUDES.privada} bytes`, CODIGOS_COMPARTICION.invalida);
  }

  const idEmisor = exigirIdentidad(emisor, 'emisor');
  const idReceptor = exigirIdentidad(receptor, 'receptor');
  const idVault = exigirIdentidad(vaultId, 'vaultId');
  const idItem = exigirIdentidad(itemId, 'itemId');
  if (idEmisor === idReceptor) {
    throw new ErrorComparticion('No se puede compartir un ítem consigo mismo', CODIGOS_COMPARTICION.invalida);
  }
  validarExpiracion(expiresAt, ahora);

  const contexto = { vaultId: idVault, itemId: idItem, emisor: idEmisor, receptor: idReceptor, revision };
  const valoresBase = {
    formato: FORMATO_COMPARTICION,
    formatVersion: VERSION_COMPARTICION,
    vaultId: idVault,
    itemId: idItem,
    emisor: idEmisor,
    receptor: idReceptor,
    claveReceptor: aBase64Url(clavePublicaReceptor),
    expiresAt: String(expiresAt),
  };

  const claveContenido = bytesAleatorios(AEAD.claveBytes);
  let efimera = null;
  let ikm = null;
  let claveEnvoltura = null;
  let hashPayload = null;
  try {
    const payload = await cifrarConAAD(claveContenido, datos, (nonce) =>
      construirAADComparticion({ ...contexto, tipo: 'payload', nonce }),
    );

    // R8: par efímero por operación; su privada no sobrevive a este bloque.
    efimera = generarEfimera();
    ikm = intercambiarClave(efimera.privada, clavePublicaReceptor);

    // El hash del payload se calcula una vez: como BYTES para la fila y
    // como base64url para la tuple firmada / el `info` del HKDF.
    hashPayload = new Uint8Array(sha256(serializarEnvoltura(payload)));

    const valores = {
      ...valoresBase,
      claveEfimera: aBase64Url(efimera.publica),
      payloadHash: aBase64Url(hashPayload),
    };
    // El info del HKDF amarra identidades, revisión, expiración y hash del
    // payload: cambiar cualquiera de ellos hace que k ya no abra nada.
    claveEnvoltura = hkdf(
      sha256,
      ikm,
      utf8(ETIQUETAS.comparticion),
      serializarCanonica(CAMPOS_CLAVE_COMPARTICION, valores),
      AEAD.claveBytes,
    );

    const wrappedKey = await cifrarConAAD(claveEnvoltura, claveContenido, (nonce) =>
      construirAADComparticion({ ...contexto, tipo: 'clave', nonce }),
    );
    valores.wrappedKey = aBase64Url(serializarEnvoltura(wrappedKey));

    const firma = firmar(serializarCanonica(CAMPOS_COMPARTICION, valores), claveFirmaEmisor);

    return {
      formato: FORMATO_COMPARTICION,
      formatVersion: VERSION_COMPARTICION,
      vaultId: idVault,
      itemId: idItem,
      emisor: idEmisor,
      receptor: idReceptor,
      revision,
      claveReceptor: clavePublicaReceptor,
      claveEfimera: efimera.publica,
      wrappedKey: { algorithm: wrappedKey.algorithm, nonce: wrappedKey.nonce, ciphertext: wrappedKey.ciphertext, tag: wrappedKey.tag },
      payload: { algorithm: payload.algorithm, nonce: payload.nonce, ciphertext: payload.ciphertext, tag: payload.tag },
      expiresAt: String(expiresAt),
      payloadHash: hashPayload,
      firma,
      creadoEn: new Date(ahora).toISOString(),
    };
  } finally {
    borrar(claveContenido);
    if (efimera) borrar(efimera.privada);
    borrar(ikm);
    borrar(claveEnvoltura);
  }
}

/**
 * §26 — abre una compartición recibida.
 *
 * Orden deliberado: forma → revocación → expiración → IDENTIDAD (R114) →
 * firma (R113) → ECDH → AEAD. La firma se comprueba ANTES de derivar
 * cualquier clave, de modo que una fila alterada ni siquiera llega a tocar
 * crypto.
 *
 * @param {object} parametros
 * @param {object} parametros.share            fila de `vault_shares`
 * @param {object} parametros.parReceptor      par abierto del receptor (§6.2)
 * @param {Uint8Array} parametros.publicaEmisor Ed25519 pública de A
 * @param {boolean} [parametros.revocado]      estado reportado por el servidor (R112)
 * @param {number} [parametros.ahora]
 * @returns {Promise<{datos: Uint8Array, itemId: string, revision: number, emisor: string, expiresAt: string}>}
 */
export async function abrirShare({ share, parReceptor, publicaEmisor, revocado = false, ahora = Date.now() }) {
  if (!share || typeof share !== 'object') {
    throw new ErrorComparticion('Compartición ausente', CODIGOS_COMPARTICION.invalida);
  }
  const { formato, formatVersion, vaultId, itemId, emisor, receptor, revision, claveReceptor, claveEfimera, wrappedKey, payload, expiresAt, firma } = share;
  if (formato !== FORMATO_COMPARTICION || formatVersion !== VERSION_COMPARTICION) {
    throw new ErrorComparticion('Formato de compartición desconocido', CODIGOS_COMPARTICION.invalida);
  }
  if (!payload || !wrappedKey || !(payload.ciphertext instanceof Uint8Array) || !(wrappedKey.ciphertext instanceof Uint8Array)) {
    throw new ErrorComparticion('Compartición malformada', CODIGOS_COMPARTICION.invalida);
  }
  if (revocado) {
    throw new ErrorComparticion('La compartición ha sido revocada', CODIGOS_COMPARTICION.revocada);
  }
  validarExpiracion(expiresAt, ahora);

  // R114 — antes de nada, que el share sea PARA ESTA clave del receptor:
  // si el servidor cambió la identidad, no se continúa.
  exigirPublica(claveReceptor, 'clave pública X25519 del receptor');
  if (!parReceptor?.canje?.privada || !parReceptor?.canje?.publica) {
    throw new ErrorComparticion('Falta el par asimétrico del receptor', CODIGOS_COMPARTICION.invalida);
  }
  const identidad = new Uint8Array(claveReceptor.length);
  identidad.set(claveReceptor);
  const coincide = identidad.every((byte, i) => byte === parReceptor.canje.publica[i]);
  borrar(identidad);
  if (!coincide) {
    throw new ErrorComparticion('La compartición no está dirigida a esta clave', CODIGOS_COMPARTICION.receptor);
  }

  // Los ids se coercen a string y la revisión a número ANTES de serializar:
  // un `emisor` numérico en la fila y un string al firmar producirían dos
  // tuples distintas y la firma no cuadraría nunca.
  const idVault = String(vaultId);
  const idItem = String(itemId);
  const idEmisor = String(emisor);
  const idReceptor = String(receptor);
  const numRevision = Number(revision);
  const valores = {
    formato,
    formatVersion,
    vaultId: idVault,
    itemId: idItem,
    emisor: idEmisor,
    receptor: idReceptor,
    claveReceptor: aBase64Url(claveReceptor),
    claveEfimera: aBase64Url(claveEfimera),
    wrappedKey: aBase64Url(serializarEnvoltura(wrappedKey)),
    payloadHash: aBase64Url(new Uint8Array(sha256(serializarEnvoltura(payload)))),
    expiresAt: String(expiresAt),
  };
  if (!verificarFirma(firma, serializarCanonica(CAMPOS_COMPARTICION, valores), publicaEmisor)) {
    throw new ErrorComparticion('La firma del emisor no valida', CODIGOS_COMPARTICION.firma);
  }

  const contexto = { vaultId: idVault, itemId: idItem, emisor: idEmisor, receptor: idReceptor, revision: numRevision };
  let ikm = null;
  let claveEnvoltura = null;
  let claveContenido = null;
  try {
    // X25519 con la clave efímera del emisor: si es un punto de bajo orden
    // noble lanza y aquí no se tolera un secreto conocible (§6.2 R8).
    ikm = intercambiarClave(parReceptor.canje.privada, claveEfimera);
    claveEnvoltura = hkdf(
      sha256,
      ikm,
      utf8(ETIQUETAS.comparticion),
      serializarCanonica(CAMPOS_CLAVE_COMPARTICION, valores),
      AEAD.claveBytes,
    );
    claveContenido = await descifrarConAAD(claveEnvoltura, wrappedKey, construirAADComparticion({ ...contexto, tipo: 'clave', nonce: wrappedKey.nonce }));
    const datos = await descifrarConAAD(claveContenido, payload, construirAADComparticion({ ...contexto, tipo: 'payload', nonce: payload.nonce }));
    return {
      datos,
      itemId: String(itemId),
      revision,
      emisor: String(emisor),
      expiresAt: String(expiresAt),
    };
  } finally {
    borrar(ikm);
    borrar(claveEnvoltura);
    borrar(claveContenido);
  }
}
