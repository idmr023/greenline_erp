/**
 * Capa asimétrica — Bóveda Segura V5 §6.2 (Fase 5.1).
 *
 * Cada usuario tiene un par doble:
 *
 *   - **Ed25519** (`firma`): autoría sobre anclas de auditoría (§24),
 *     comparticiones (§26 R113) y aprobaciones de break-glass (§41).
 *   - **X25519** (`canje`): envolver la clave de un secreto hacia otro
 *     usuario sin enviar jamás la KEK ni la master password (§26 R110).
 *
 * R6: las privadas se generan en cliente, se protegen con la KEK del
 * usuario y nunca salen en claro — este módulo se ejecuta dentro del
 * worker (§15.1), de modo que ni siquiera llegan al hilo principal. R7: las
 * públicas se almacenan en claro.
 *
 * Cada mitad se envuelve con un propósito propio (`par_firma` y
 * `par_canje`): como el propósito forma parte del AAD (§7 R10), la
 * envoltura de una mitad no puede abrirse haciéndose pasar por la otra.
 *
 * R8: el material efímero de ECDH se crea por operación y se borra después
 * (§15.1 R51); `intercambiarClave` rechaza las claves públicas de bajo
 * orden que noble detecta.
 */

import { ed25519, x25519 } from '@noble/curves/ed25519.js';
import { sha256 } from '@noble/hashes/sha2.js';

import { PROPOSITOS, desenvolverClave, envolverClave } from './envelope.js';
import { aBase64Url, borrar } from './random.js';

/** Longitudes fijas de §6.2: 32 bytes de privada, 32 de pública, 64 de firma. */
export const LONGITUDES = Object.freeze({ privada: 32, publica: 32, firma: 64 });

function exigirBytes(valor, longitud, nombre) {
  if (!(valor instanceof Uint8Array) || valor.length !== longitud) {
    throw new Error(`${nombre} debe ser un Uint8Array de ${longitud} bytes`);
  }
  return valor;
}

/** R7 — valida una pública antes de tocarla: 32 bytes y punto no degenerado. */
export function exigirPublica(publica, nombre = 'clave pública') {
  return exigirBytes(publica, LONGITUDES.publica, nombre);
}

/**
 * Genera el par completo (§6.2). Las privadas sólo deben salir de aquí hacia
 * `envolverPar`: en claro nunca deben viajar ni por mensaje de worker ni por
 * storage.
 *
 * @returns {{firma:{privada:Uint8Array,publica:Uint8Array}, canje:{privada:Uint8Array,publica:Uint8Array}}}
 */
export function generarParAsimetrico() {
  const firma = ed25519.keygen();
  const canje = x25519.keygen();
  return {
    firma: { privada: firma.secretKey, publica: firma.publicKey },
    canje: { privada: canje.secretKey, publica: canje.publicKey },
  };
}

/**
 * Par efímero X25519 de una sola operación (§6.2 R8). El caller debe borrar
 * `privada` en cuanto termine de derivar — no se guarda nunca.
 */
export function generarEfimera() {
  const eph = x25519.keygen();
  return { privada: eph.secretKey, publica: eph.publicKey };
}

/**
 * Envuelve las dos privadas con la KEK vigente (R6). Devuelve sólo
 * envolturas y públicas: nada de material privado.
 *
 * @param par el par generado por `generarParAsimetrico`
 * @param {Uint8Array} kek
 * @param {{vaultId:string, keyVersion:number}} contexto
 */
export async function envolverPar(par, kek, contexto) {
  const { vaultId, keyVersion } = contexto || {};
  if (!par?.firma?.privada || !par?.canje?.privada) {
    throw new Error('Par asimétrico incompleto');
  }
  const privadaFirma = exigirBytes(par.firma.privada, LONGITUDES.privada, 'privada de firma');
  const privadaCanje = exigirBytes(par.canje.privada, LONGITUDES.privada, 'privada de canje');

  const [envolturaFirma, envolturaCanje] = await Promise.all([
    envolverClave(kek, privadaFirma, { vaultId, keyVersion, proposito: PROPOSITOS.par_firma }),
    envolverClave(kek, privadaCanje, { vaultId, keyVersion, proposito: PROPOSITOS.par_canje }),
  ]);

  return {
    firma: { envoltura: envolturaFirma, publica: exigirPublica(par.firma.publica, 'pública de firma') },
    canje: { envoltura: envolturaCanje, publica: exigirPublica(par.canje.publica, 'pública de canje') },
  };
}

/**
 * Abre el par bajo la KEK vigente y lo reconstruye a partir de las
 * envolturas. Lanza sin dejar material a medias: si una de las dos mitades
 * no abre, la que hubiera abierto se borra antes de propagar el error.
 *
 * El caller es responsable de borrar el par devuelto al bloquear (§15.1 R51).
 *
 * @param {{firma:object, canje:object}} envolturas
 * @param {Uint8Array} kek
 * @param {{vaultId:string, keyVersion:number}} contexto
 */
export async function abrirPar(envolturas, kek, contexto) {
  const { vaultId, keyVersion } = contexto || {};
  if (!envolturas?.firma?.envoltura || !envolturas?.canje?.envoltura) {
    throw new Error('Faltan las envolturas del par asimétrico');
  }

  const privadaFirma = await desenvolverClave(kek, envolturas.firma.envoltura, {
    vaultId,
    keyVersion,
    proposito: PROPOSITOS.par_firma,
  });
  let privadaCanje;
  try {
    privadaCanje = await desenvolverClave(kek, envolturas.canje.envoltura, {
      vaultId,
      keyVersion,
      proposito: PROPOSITOS.par_canje,
    });
    exigirBytes(privadaFirma, LONGITUDES.privada, 'privada de firma');
    exigirBytes(privadaCanje, LONGITUDES.privada, 'privada de canje');
  } catch (error) {
    borrar(privadaFirma);
    borrar(privadaCanje);
    throw error;
  }

  return {
    firma: { privada: privadaFirma, publica: ed25519.getPublicKey(privadaFirma) },
    canje: { privada: privadaCanje, publica: x25519.getPublicKey(privadaCanje) },
  };
}

/** Firma Ed25519 sobre un mensaje ya canónico (§6.2, R113). */
export function firmar(mensaje, privadaFirma) {
  if (!(mensaje instanceof Uint8Array)) {
    throw new Error('El mensaje a firmar debe ser un Uint8Array');
  }
  return ed25519.sign(mensaje, privadaFirma);
}

/**
 * Verificación estricta. `zip215: false` es deliberado: en modo laxo noble
 * devuelve `true` para una firma toda ceros contra una pública toda ceros,
 * lo que dejaría a cualquiera fabricar la autoría de una compartición
 * (§26 R113/R114). Con el modo estricto esa combinación se rechaza.
 *
 * @returns {boolean} nunca lanza: una pública corrupta es «no verifica».
 */
export function verificarFirma(firma, mensaje, publica) {
  try {
    exigirBytes(firma, LONGITUDES.firma, 'firma');
    exigirBytes(publica, LONGITUDES.publica, 'clave pública de firma');
    if (!(mensaje instanceof Uint8Array)) return false;
    return ed25519.verify(firma, mensaje, publica, { zip215: false });
  } catch {
    return false;
  }
}

/**
 * ECDH de §6.2: la única fuente compartida entre dos usuarios. Devuelve 32
 * bytes de IKM que el caller mete en HKDF — nunca se usa crudo.
 *
 * Rechaza las claves públicas de bajo orden (puntos de torsión) que noble
 * detecta, para no caer en un secreto común trivialmente conocible.
 *
 * @param {Uint8Array} privadaCanje privada X25519 propia
 * @param {Uint8Array} publicaAjena pública X25519 del otro usuario
 * @returns {Uint8Array} 32 bytes — borrar tras derivar (§15.1 R51)
 */
export function intercambiarClave(privadaCanje, publicaAjena) {
  exigirBytes(privadaCanje, LONGITUDES.privada, 'privada de canje');
  exigirPublica(publicaAjena, 'pública de canje ajena');
  return x25519.getSharedSecret(privadaCanje, publicaAjena);
}

/**
 * R114 — identidad pública legible para confirmarla en un canal secundario
 * antes de compartir. `SHA256:<base64url>` al estilo OpenSSH: una sola
 * línea, sin caracteres ambiguos para lectora por teléfono.
 *
 * @param {Uint8Array} publica clave pública a identificar
 */
export function huella(publica) {
  return `SHA256:${aBase64Url(new Uint8Array(sha256(exigirPublica(publica))))}`;
}
