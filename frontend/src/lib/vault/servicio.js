/**
 * Servicio de bóveda — Bóveda Segura V5 §9, §15.1, §27.
 *
 * Es el corazón que corre DENTRO del Web Worker: aquí viven la KEK y la
 * DEK activa, y de aquí no salen. El hilo principal sólo pide operaciones
 * (cifrar, descifrar, verificar) y recibe plaintext cuando hay que
 * mostrarlo — que es inevitable (§13).
 *
 * `worker.js` es un adaptador de ~20 líneas sobre este módulo; al ser puro,
 * se prueba con `node --test` sin necesidad de un worker real.
 */

import { cifrar, descifrar, deserializar, serializar } from './aead.js';
import { derivarMaterialMaestro, validarMasterPassword } from './kdf.js';
import { construirAAD, construirAADEnvoltura } from './aad.js';
import { confirmarKEK, desenvolverClave, envolverClave, PROPOSITOS } from './envelope.js';
import { AEAD } from './params.js';
import { aBytes, borrar, bytesAleatorios, igualdadConstante } from './random.js';
// --- Fase 4 (§25, §27): la maestra NUEVA y la KEK de recuperación sólo
// existen dentro de este worker, igual que la actual (§15.1/R51). ---
import { derivarKEKRecuperacion, desenvolverDEKsDeRecuperacion } from './recovery.js';
import { reenvolverDEKs, verificarReenvolturas } from './rekey.js';
import { crearExport as construirExport, abrirExport as abrirExportFichero } from './exportar.js';
// --- Fase 5.1 (§6.2, §26): el par asimétrico y la compartición por elemento.
// Igual que el resto del worker: las privadas se generan y se usan aquí. ---
import { abrirPar as abrirParPuro, envolverPar, generarParAsimetrico as generarParPuro } from './asimetrica.js';
import { abrirShare as abrirSharePuro, envolverPara as envolverParaPuro } from './compartir.js';

export const CODIGOS = Object.freeze({
  bloqueada: 'BLOQUEADA',
  yaDesbloqueada: 'YA_DESBLOQUEADA',
  dekAbierta: 'DEK_ABIERTA',
  sinDEK: 'SIN_DEK',
  masterIncorrecta: 'MASTER_INCORRECTA',
  /** §6.2/§26 — se pidió una operación que necesita el par asimétrico abierto. */
  sinPar: 'SIN_PAR',
});

export class ErrorBoveda extends Error {
  constructor(mensaje, codigo) {
    super(mensaje);
    this.name = 'ErrorBoveda';
    this.codigo = codigo;
  }
}

/** §15.1 R51 — sobreescribe un material derivado completo. */
function borrarMaterial(material) {
  if (!material) return;
  borrar(material.auth);
  borrar(material.kek);
  borrar(material.recuperacion);
}

export function crearServicioBoveda() {
  /** Material derivado de la maestra (KEK y compañía). Sólo aquí dentro. */
  let material = null;
  /** DEK de la bóveda ya desenvuelta, cacheada para no abrir en cada operación. */
  let dekActiva = null;
  /** Par asimétrico abierto del usuario (§6.2 R6). Se borra al bloquear. */
  let parActivo = null;

  function exigirDesbloqueada() {
    if (!material) throw new ErrorBoveda('La bóveda está bloqueada', CODIGOS.bloqueada);
    return material;
  }

  function exigirDEK() {
    exigirDesbloqueada();
    if (!dekActiva) throw new ErrorBoveda('No hay ninguna DEK abierta', CODIGOS.sinDEK);
    return dekActiva;
  }

  function exigirPar() {
    exigirDesbloqueada();
    if (!parActivo) throw new ErrorBoveda('El par asimétrico no está abierto', CODIGOS.sinPar);
    return parActivo;
  }

  function limpiarDEK() {
    if (dekActiva) {
      borrar(dekActiva.clave);
      dekActiva = null;
    }
  }

  function limpiarPar() {
    if (parActivo) {
      borrar(parActivo.firma.privada);
      borrar(parActivo.canje.privada);
      parActivo = null;
    }
  }

  return {
    /**
     * §5 — deriva todo el material y lo guarda SÓLO en este worker.
     * Bloquea ~1,3 s: por eso existe el worker (§15.1 R52).
     */
    desbloquear({ masterPassword, salt, parametros }) {
      if (material) {
        return Promise.reject(
          new ErrorBoveda('La bóveda ya estaba desbloqueada', CODIGOS.yaDesbloqueada),
        );
      }
      try {
        validarMasterPassword(masterPassword);
        const bytesSalt = aBytes(salt, 'salt');
        material = derivarMaterialMaestro(masterPassword, bytesSalt, parametros);
        return Promise.resolve({ parametros: material.parametros });
      } catch (error) {
        return Promise.reject(error);
      }
    },

    /** §9 R25/R27: limpia el material derivado, la DEK y el par (§6.2 R6). */
    bloquear() {
      if (material) {
        borrar(material.auth);
        borrar(material.kek);
        borrar(material.recuperacion);
        material = null;
      }
      limpiarDEK();
      limpiarPar();
      return Promise.resolve({ desbloqueado: false });
    },

    estado() {
      return Promise.resolve({
        desbloqueado: material !== null,
        dekAbierta: dekActiva !== null,
        parametros: material ? material.parametros : null,
        contextoDEK: dekActiva ? dekActiva.contexto : null,
      });
    },

    /**
     * §13 — step-up local: vuelve a derivar con la maestra recién tecleada
     * y compara en tiempo constante con la KEK viva. No altera el estado
     * de desbloqueo. Cuando exista `POST /auth/step-up`, este método pasa
     * a ser la comprobación adicional, no la única.
     */
    verificarMaster({ masterPassword }) {
      if (!material) {
        return Promise.reject(new ErrorBoveda('La bóveda está bloqueada', CODIGOS.bloqueada));
      }
      let temporal = null;
      try {
        validarMasterPassword(masterPassword);
        temporal = derivarMaterialMaestro(masterPassword, material.salt, material.parametros);
        const correcta = igualdadConstante(temporal.kek, material.kek);
        return Promise.resolve({ correcta });
      } catch (error) {
        return Promise.reject(error);
      } finally {
        if (temporal) {
          borrar(temporal.auth);
          borrar(temporal.kek);
          borrar(temporal.recuperacion);
        }
      }
    },

    /** Envuelve la DEK de la bóveda con la KEK viva (§7). */
    envolverDEK({ dek, contexto }) {
      const actual = exigirDesbloqueada();
      return envolverClave(actual.kek, aBytes(dek, 'dek'), {
        ...contexto,
        proposito: PROPOSITOS.dek,
      });
    },

    /** Abre y cachea la DEK de la bóveda. La clave jamás sale de aquí. */
    abrirDEK({ envoltura, contexto }) {
      const actual = exigirDesbloqueada();
      if (dekActiva) return Promise.resolve({ yaAbierta: true });
      return desenvolverClave(actual.kek, envoltura, {
        ...contexto,
        proposito: PROPOSITOS.dek,
      }).then((clave) => {
        dekActiva = { clave, contexto: { ...contexto } };
        return { abierta: true };
      });
    },

    cerrarDEK() {
      limpiarDEK();
      return Promise.resolve({ dekAbierta: false });
    },

    /**
     * §6.1 + §7: crea la DEK de una bóveda nueva, la envuelve y cifra el
     * primer item en un solo paso. La DEK se genera aquí y no se devuelve.
     */
    crearBoveda({ item, contextoItem, contextoDEK }) {
      const actual = exigirDesbloqueada();
      if (dekActiva) {
        return Promise.reject(new ErrorBoveda('Ya hay una DEK abierta', CODIGOS.dekAbierta));
      }
      const clave = bytesAleatorios(32);
      const contexto = { ...contextoDEK, proposito: PROPOSITOS.dek };
      const datos = item instanceof Uint8Array ? item : serializar(item);

      return envolverClave(actual.kek, clave, contexto)
        .then((envolturaDEK) =>
          cifrar(clave, datos, contextoItem).then((envolturaItem) => {
            dekActiva = { clave, contexto: { ...contextoDEK } };
            return { dek: { envoltura: envolturaDEK, contexto: contextoDEK }, envoltura: envolturaItem };
          }),
        )
        .catch((error) => {
          borrar(clave);
          throw error;
        });
    },

    /** Cifra un ítem con la DEK cacheada. Acepta objeto o bytes. */
    cifrarItem({ item, contextoItem }) {
      const dek = exigirDEK();
      const datos = item instanceof Uint8Array ? item : serializar(item);
      return cifrar(dek.clave, datos, contextoItem);
    },

    /** Descifra un ítem con la DEK cacheada y devuelve el plaintext. */
    descifrarItem({ envoltura, contextoItem }) {
      const dek = exigirDEK();
      return descifrar(dek.clave, envoltura, contextoItem);
    },

    /** §5.3 — confirmación local de la KEK contra un envoltorio de prueba. */
    confirmarKEK({ envoltura, contexto }) {
      const actual = exigirDesbloqueada();
      return confirmarKEK(actual.kek, envoltura, { ...contexto, proposito: PROPOSITOS.dek });
    },

    /** Comodidades para no reimplementar la serialización en cada caller. */
    serializarItem(item) {
      return Promise.resolve(serializar(item));
    },

    deserializarItem(bytes) {
      return Promise.resolve(deserializar(bytes));
    },

    /** Reconstruye el AAD de un item almacenado (§8.1) para re-descifrar. */
    reconstruirAAD(contextoItem, nonce) {
      exigirDesbloqueada();
      return Promise.resolve(
        construirAAD({ ...contextoItem, algorithm: AEAD.algId, nonce }),
      );
    },

    reconstruirAADEnvoltura(contextoDEK, nonce) {
      exigirDesbloqueada();
      return Promise.resolve(
        construirAADEnvoltura({
          ...contextoDEK,
          proposito: PROPOSITOS.dek,
          algorithm: AEAD.algId,
          nonce,
        }),
      );
    },

    // -----------------------------------------------------------------------
    // Fase 4 — §25 recuperación, §27 cambio de maestra.
    //
    // Los tres métodos de abajo son los ÚNICOS sitios donde se manipula una
    // KEK que no es la vigente: la antigua, la nueva y la de recuperación
    // se derivan y se usan aquí dentro, se sobreescriben y no salen (§15.1
    // R51). El hilo principal recibe únicamente envolturas cifradas.
    // -----------------------------------------------------------------------

    /**
     * §27 — R118 step-up + R116 todas-o-nada + R120 verificación.
     *
     * No escribe nada: devuelve el salt nuevo y el conjunto COMPLETO de
     * envolturas reenvueltas para que el caller lo mande a `vault_rekey`.
     * Si algo falla aquí, el servidor jamás recibe la petición.
     *
     * @param {object} datos
     * @param {string} datos.masterActual   step-up (§13)
     * @param {string} datos.masterNueva
     * @param {Uint8Array} datos.salt       salt NUEVO de la bóveda
     * @param {object} datos.parametros     parámetros NUEVOS
     * @param {Array} datos.envolturas      DEKs vigentes
     * @param {object} [datos.parAsimetrico] envolturas del par §6.2 (opcional:
     *        si no se envía, el usuario pierde su identidad firmante)
     */
    async cambiarMasterPassword({ masterActual, masterNueva, vaultId, salt, parametros, envolturas, parAsimetrico }) {
      const actual = exigirDesbloqueada();
      validarMasterPassword(masterNueva);
      const temporal = derivarMaterialMaestro(masterActual, actual.salt, actual.parametros);
      let materialNuevo = null;
      try {
        if (!igualdadConstante(temporal.kek, actual.kek)) {
          throw new ErrorBoveda('La contraseña maestra actual es incorrecta', CODIGOS.masterIncorrecta);
        }
        materialNuevo = derivarMaterialMaestro(masterNueva, aBytes(salt, 'salt'), parametros);

        const originales = envolturas.map((c) => ({ keyVersion: c.keyVersion, envoltura: c.envoltura }));
        const claves = await reenvolverDEKs({
          kekVieja: actual.kek,
          kekNueva: materialNuevo.kek,
          vaultId,
          envolturas: originales,
        });

        // R120 — si la muestra no re-descifra, no se manda nada (R116).
        const verificacion = await verificarReenvolturas({
          kekVieja: actual.kek,
          kekNueva: materialNuevo.kek,
          vaultId,
          originales,
          nuevas: claves,
        });
        if (!verificacion.ok) {
          throw new ErrorBoveda(
            `Verificación post-re-wrap fallida (${verificacion.fallos}): no se cambia nada (R120)`,
            CODIGOS.masterIncorrecta,
          );
        }

        // §6.2 — el par asimétrico se reenvuelve con la misma regla que las
        // DEKs: si no, cambiar la maestra dejaría al usuario sin identidad
        // (no podría firmar ni abrir lo que le han compartido). Se verifica
        // igualmente antes de devolver nada (R120).
        let parReenvuelto = null;
        if (parAsimetrico) {
          parReenvuelto = {};
          for (const mitad of ['firma', 'canje']) {
            const origen = parAsimetrico[mitad];
            const proposito = mitad === 'firma' ? PROPOSITOS.par_firma : PROPOSITOS.par_canje;
            const contexto = { vaultId, keyVersion: origen.keyVersion, proposito };
            const privada = await desenvolverClave(actual.kek, origen.envoltura, contexto);
            try {
              const nueva = await envolverClave(materialNuevo.kek, privada, contexto);
              const reabierta = await desenvolverClave(materialNuevo.kek, nueva, contexto);
              const coincide = igualdadConstante(reabierta, privada);
              borrar(reabierta);
              if (!coincide) {
                throw new ErrorBoveda(
                  `Verificación post-re-wrap del par asimétrico fallida (${mitad}) (R120)`,
                  CODIGOS.masterIncorrecta,
                );
              }
              parReenvuelto[mitad] = { keyVersion: origen.keyVersion, envoltura: nueva, publica: origen.publica };
            } finally {
              borrar(privada);
            }
          }
        }
        return { salt, claves, parAsimetrico: parReenvuelto };
      } finally {
        borrarMaterial(temporal);
        borrarMaterial(materialNuevo);
      }
    },

    /**
     * §25.3 R106 — reenvuelve las DEKs vigentes bajo la KEK derivada de
     * la recovery key. La recovery key entra al worker, se usa y no se
     * guarda: sólo salen las envolturas cifradas.
     */
    async activarRecuperacion({ recoveryKey, salt, vaultId, envolturas }) {
      const actual = exigirDesbloqueada();
      const kekRec = derivarKEKRecuperacion(aBytes(recoveryKey, 'recoveryKey'), aBytes(salt, 'salt'));
      const abiertas = [];
      try {
        for (const { keyVersion, envoltura } of envolturas) {
          const dek = await desenvolverClave(actual.kek, envoltura, {
            vaultId,
            keyVersion,
            proposito: PROPOSITOS.dek,
          });
          abiertas.push({ keyVersion, dek });
        }
        const salida = [];
        for (const { keyVersion, dek } of abiertas) {
          salida.push({
            keyVersion,
            envoltura: await envolverClave(kekRec, dek, {
              vaultId,
              keyVersion,
              proposito: PROPOSITOS.recuperacion,
            }),
          });
        }
        return { envolturas: salida };
      } finally {
        borrar(kekRec);
        abiertas.forEach(({ dek }) => borrar(dek));
      }
    },

    /**
     * §25.3 R107/R109 — abre las DEKs con la recovery key, deriva la
     * maestra NUEVA y devuelve el conjunto reenvuelto. El caller lo manda
     * a `vault_rekey` (atómico) y después revoca la recovery key.
     */
    async usarRecuperacion({ recoveryKey, salt, vaultId, masterNueva, saltNuevo, parametros, envolturas }) {
      validarMasterPassword(masterNueva);
      const kekRec = derivarKEKRecuperacion(aBytes(recoveryKey, 'recoveryKey'), aBytes(salt, 'salt'));
      let materialNuevo = null;
      let abiertas = [];
      try {
        abiertas = await desenvolverDEKsDeRecuperacion(
          kekRec,
          envolturas.map((c) => ({ keyVersion: c.keyVersion, envoltura: c.envoltura })),
          vaultId,
        );
        materialNuevo = derivarMaterialMaestro(masterNueva, aBytes(saltNuevo, 'salt'), parametros);

        const claves = [];
        for (const { keyVersion, dek } of abiertas) {
          claves.push({
            keyVersion,
            envoltura: await envolverClave(materialNuevo.kek, dek, {
              vaultId,
              keyVersion,
              proposito: PROPOSITOS.dek,
            }),
          });
        }

        // R120 — muestra completa ANTES de que nadie escriba en servidor.
        for (let i = 0; i < abiertas.length; i += 1) {
          const reabierta = await desenvolverClave(materialNuevo.kek, claves[i].envoltura, {
            vaultId,
            keyVersion: claves[i].keyVersion,
            proposito: PROPOSITOS.dek,
          });
          const coincide = igualdadConstante(reabierta, abiertas[i].dek);
          borrar(reabierta);
          if (!coincide) {
            throw new ErrorBoveda('Verificación post-recuperación fallida (R120)', CODIGOS.masterIncorrecta);
          }
        }
        return { salt: saltNuevo, claves };
      } finally {
        borrar(kekRec);
        abiertas.forEach(({ dek }) => borrar(dek));
        borrarMaterial(materialNuevo);
      }
    },

    /**
     * §28 — el Argon2id del export bloquea ~1,3 s, así que corre aquí y no
     * en el hilo principal (§15.1 R52). El passphrase de export nunca se
     * guarda: sólo se usa para este fichero.
     */
    crearExport({ items, passphrase, vaultId, creadoEn, parametros }) {
      return construirExport({ items, passphrase, vaultId, creadoEn, parametros });
    },

    /**
     * §28.1 R122 — abrir un export también cuesta Argon2id, así que corre
     * aquí (§15.1 R52). NO exige desbloqueo: sólo usa la passphrase de
     * export. El que después se re-cifra cada item sí pasa por la DEK, y
     * esa operación sí la exige.
     */
    abrirExport({ exportacion, passphrase, vaultId, parametros }) {
      return abrirExportFichero({ exportacion, passphrase, vaultId, parametros });
    },

    // -----------------------------------------------------------------------
    // Fase 5.1 — §6.2 par asimétrico, §26 compartición por elemento.
    //
    // Las privadas del par se generan, se envuelven, se abren y se firman
    // SÓLO dentro de este worker (R6); el hilo principal recibe envolturas,
    // públicas y filas ya cifradas. Al bloquear desaparecen (§15.1 R51).
    // -----------------------------------------------------------------------

    /**
     * §6.2 — genera el par del usuario y devuelve únicamente las envolturas
     * bajo la KEK (R6) y las públicas (R7).
     *
     * @param {{vaultId:string, keyVersion:number}} datos
     */
    async generarParAsimetrico({ vaultId, keyVersion }) {
      const actual = exigirDesbloqueada();
      if (!vaultId || !Number.isInteger(keyVersion)) {
        throw new Error('generarParAsimetrico: faltan vaultId o keyVersion');
      }
      const par = generarParPuro();
      try {
        return await envolverPar(par, actual.kek, { vaultId, keyVersion });
      } finally {
        borrar(par.firma.privada);
        borrar(par.canje.privada);
      }
    },

    /**
     * §6.2 — abre el par con la KEK vigente y lo deja residente hasta que
     * se bloquee. Comprueba además que las privadas corresponden a las
     * públicas almacenadas (R114): una fila alterada no se acepta.
     *
     * @param {{envolturas:object, vaultId:string, keyVersion:number}} datos
     */
    async abrirPar({ envolturas, vaultId, keyVersion }) {
      const actual = exigirDesbloqueada();
      if (!vaultId || !Number.isInteger(keyVersion)) {
        throw new Error('abrirPar: faltan vaultId o keyVersion');
      }
      const par = await abrirParPuro(envolturas, actual.kek, { vaultId, keyVersion });
      const coherente =
        igualdadConstante(par.firma.publica, envolturas.firma.publica) &&
        igualdadConstante(par.canje.publica, envolturas.canje.publica);
      if (!coherente) {
        borrar(par.firma.privada);
        borrar(par.canje.privada);
        throw new Error('Las claves privadas no corresponden a las públicas almacenadas');
      }
      limpiarPar();
      parActivo = par;
      return { publicas: { firma: par.firma.publica, canje: par.canje.publica } };
    },

    /**
     * §26 R110 — re-cifra el snapshot del ítem con una content key efímera
     * y la envuelve hacia la pública X25519 del receptor. El ítem se
     * descifra aquí con la DEK y el plaintext NO se devuelve: sólo sale la
     * fila de `vault_shares` ya cifrada.
     *
     * @param {object} datos
     * @param {object} datos.envolturaItem
     * @param {object} datos.contextoItem
     * @param {Uint8Array} datos.clavePublicaReceptor
     * @param {string|number} datos.emisor
     * @param {string|number} datos.receptor
     * @param {string} datos.expiresAt
     */
    async envolverPara({ envolturaItem, contextoItem, clavePublicaReceptor, emisor, receptor, expiresAt }) {
      const dek = exigirDEK();
      const par = exigirPar();
      const datos = await descifrar(dek.clave, envolturaItem, contextoItem);
      try {
        return await envolverParaPuro({
          datos,
          clavePublicaReceptor,
          claveFirmaEmisor: par.firma.privada,
          vaultId: contextoItem.vaultId,
          itemId: contextoItem.itemId,
          emisor,
          receptor,
          revision: contextoItem.revision,
          expiresAt,
        });
      } finally {
        borrar(datos);
      }
    },

    /** §26 — abre una compartición recibida: firma → expiración → ECDH → AEAD. */
    abrirShare({ share, publicaEmisor, revocado }) {
      const par = exigirPar();
      return abrirSharePuro({ share, parReceptor: par, publicaEmisor, revocado });
    },

    /**
     * Despachador genérico de mensajes. Lo comparten el worker real y los
     * tests: así el protocolo se prueba igual que en producción.
     *
     * @param {{tipo:string, datos?:object}} mensaje
     * @returns {Promise<any>}
     */
    manejar(mensaje) {
      const { tipo, datos = {} } = mensaje || {};
      const manejadores = {
        desbloquear: this.desbloquear,
        bloquear: this.bloquear,
        estado: this.estado,
        verificarMaster: this.verificarMaster,
        envolverDEK: this.envolverDEK,
        abrirDEK: this.abrirDEK,
        cerrarDEK: this.cerrarDEK,
        crearBoveda: this.crearBoveda,
        cifrarItem: this.cifrarItem,
        descifrarItem: this.descifrarItem,
        confirmarKEK: this.confirmarKEK,
        serializarItem: this.serializarItem,
        deserializarItem: this.deserializarItem,
        reconstruirAAD: this.reconstruirAAD,
        reconstruirAADEnvoltura: this.reconstruirAADEnvoltura,
        cambiarMasterPassword: this.cambiarMasterPassword,
        activarRecuperacion: this.activarRecuperacion,
        usarRecuperacion: this.usarRecuperacion,
        crearExport: this.crearExport,
        abrirExport: this.abrirExport,
        // --- Fase 5.1 (§6.2, §26) ---
        generarParAsimetrico: this.generarParAsimetrico,
        abrirPar: this.abrirPar,
        envolverPara: this.envolverPara,
        abrirShare: this.abrirShare,
      };
      const manejador = manejadores[tipo];
      if (!manejador) {
        return Promise.reject(new Error(`Mensaje desconocido: ${String(tipo)}`));
      }
      // Frontera asíncrona: los manejadores lanzan síncronos (bóveda
      // bloqueada, DEK ausente…) y aquí se convierten siempre en
      // rechazos, para que el protocolo del worker sea uniforme.
      try {
        return Promise.resolve(manejador.call(this, datos));
      } catch (error) {
        return Promise.reject(error);
      }
    },
  };
}
