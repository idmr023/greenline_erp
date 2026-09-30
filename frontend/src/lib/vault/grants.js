/**
 * Concesiones de step-up (grants) — Bóveda Segura V5 §13 / R38–R40.
 *
 * Un grant es la prueba de que, en este mismo momento, el usuario volvió a
 * demostrar posesión de la maestra para una operación concreta. Reglas de
 * §13.1 aplicadas en cliente:
 *
 *   R38  single-use con TTL corto (60 s por defecto)
 *   R39  claims: sub + purpose + itemRef
 *   R40  usarlo para otra acción u otro ítem se rechaza
 *
 * Nota de alcance: esta es la mitad local. Cuando exista
 * `POST /auth/step-up` (§13.1), el token se emite en servidor y este
 * almacén sólo guarda el trámite local. Ver `useStepUp`.
 */

import { aBase64Url, bytesAleatorios } from './random.js';

export const TTL_GRANT_MS = 60_000;
/** Tope de grants vivos para que no crezca sin límite en una sesión larga. */
export const MAXIMO_GRANTS = 32;

export function crearAlmacenGrants({
  ahora = () => Date.now(),
  ttlMs = TTL_GRANT_MS,
  maximo = MAXIMO_GRANTS,
} = {}) {
  /** @type {Map<string, {sub:string, proposito:string, itemRef:string|null, expiraEn:number}>} */
  const vivos = new Map();

  function expulsarVencidos(momento) {
    for (const [token, grant] of vivos) {
      if (grant.expiraEn <= momento) vivos.delete(token);
    }
  }

  function emitir({ sub, proposito, itemRef = null }) {
    if (typeof sub !== 'string' || sub === '') throw new Error('grant: falta sub');
    if (typeof proposito !== 'string' || proposito === '') throw new Error('grant: falta proposito');

    const momento = ahora();
    expulsarVencidos(momento);

    // §8 aplica al mundo de los grants también: si se llena, se limpia lo
    // más viejo antes de emitir, nunca se emite sin registro.
    if (vivos.size >= maximo) {
      const masAntiguo = [...vivos.entries()].sort((a, b) => a[1].expiraEn - b[1].expiraEn)[0];
      if (masAntiguo) vivos.delete(masAntiguo[0]);
    }

    const token = aBase64Url(bytesAleatorios(32));
    vivos.set(token, {
      sub,
      proposito,
      itemRef: itemRef === null || itemRef === undefined ? null : String(itemRef),
      expiraEn: momento + ttlMs,
    });
    return token;
  }

  /**
   * R38/R40: cualquier intento de uso consume el grant, sea correcto o no.
   * Invariante simple: un grant se usa una vez y sólo una.
   */
  function consumir(token, { sub, proposito, itemRef = null }) {
    if (typeof token !== 'string' || token === '') return false;

    const grant = vivos.get(token);
    if (!grant) return false;

    vivos.delete(token);

    const momento = ahora();
    if (grant.expiraEn <= momento) return false;
    if (grant.sub !== sub) return false;
    if (grant.proposito !== proposito) return false;

    const refEsperada = grant.itemRef;
    const refRecibida = itemRef === null || itemRef === undefined ? null : String(itemRef);
    if (refEsperada !== refRecibida) return false;

    return true;
  }

  function limpiar() {
    vivos.clear();
  }

  function activos() {
    expulsarVencidos(ahora());
    return vivos.size;
  }

  return { emitir, consumir, limpiar, activos };
}
