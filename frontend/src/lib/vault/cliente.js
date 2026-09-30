/**
 * Cliente del worker de bóveda — Bóveda Segura V5 §9, §15.1.
 *
 * Espejo en promesas de `servicio.manejar`. La fábrica del worker es
 * inyectable, de modo que los tests de este módulo usan un worker falso y
 * se comprueba el protocolo (ids, errores, destrucción) sin navegador.
 */

import { ErrorBoveda } from './servicio.js';

function workerPorDefecto() {
  return new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
}

export function crearClienteBoveda({ fabricaWorker = workerPorDefecto } = {}) {
  const worker = fabricaWorker();
  /** @type {Map<number, {resolve:Function, reject:Function}>} */
  const pendientes = new Map();
  let siguienteId = 1;
  let destruido = false;

  function falloGlobal(error) {
    const causa = error?.message || 'El worker de la bóveda falló';
    for (const { reject } of pendientes.values()) reject(new Error(causa));
    pendientes.clear();
  }

  function alRecibir(evento) {
    const { id, ok, resultado, error } = evento.data || {};
    const pendiente = pendientes.get(id);
    if (!pendiente) return;
    pendientes.delete(id);

    if (ok) {
      pendiente.resolve(resultado);
      return;
    }

    const err = error?.codigo
      ? new ErrorBoveda(error.message, error.codigo)
      : new Error(error?.message || 'Error desconocido en el worker');
    if (error?.name) err.name = error.name;
    pendiente.reject(err);
  }

  worker.addEventListener?.('message', alRecibir);
  worker.addEventListener?.('error', falloGlobal);
  worker.addEventListener?.('messageerror', falloGlobal);

  function pedir(tipo, datos = {}) {
    if (destruido) return Promise.reject(new Error('El cliente de la bóveda fue destruido'));
    const id = siguienteId++;
    return new Promise((resolve, reject) => {
      pendientes.set(id, { resolve, reject });
      try {
        worker.postMessage({ id, mensaje: { tipo, datos } });
      } catch (error) {
        pendientes.delete(id);
        reject(error);
      }
    });
  }

  return {
    pedir,
    estado: () => pedir('estado'),
    desbloquear: (masterPassword, salt, parametros) =>
      pedir('desbloquear', { masterPassword, salt, parametros }),
    bloquear: () => pedir('bloquear'),
    verificarMaster: (masterPassword) => pedir('verificarMaster', { masterPassword }),
    abrirDEK: (envoltura, contexto) => pedir('abrirDEK', { envoltura, contexto }),
    cerrarDEK: () => pedir('cerrarDEK'),
    crearBoveda: (item, contextoItem, contextoDEK) =>
      pedir('crearBoveda', { item, contextoItem, contextoDEK }),
    envolverDEK: (dek, contexto) => pedir('envolverDEK', { dek, contexto }),
    cifrarItem: (item, contextoItem) => pedir('cifrarItem', { item, contextoItem }),
    descifrarItem: (envoltura, contextoItem) =>
      pedir('descifrarItem', { envoltura, contextoItem }),
    confirmarKEK: (envoltura, contexto) => pedir('confirmarKEK', { envoltura, contexto }),
    serializarItem: (item) => pedir('serializarItem', item),
    deserializarItem: (bytes) => pedir('deserializarItem', bytes),

    // --- Fase 4 (§25, §27): sólo el worker ve estas claves ---

    /** §27 — devuelve el salt nuevo y las DEKs reenvueltas (R116/R120). */
    cambiarMasterPassword: (datos) => pedir('cambiarMasterPassword', datos),
    /** §25 R106 — devuelve las DEKs envueltas bajo la recovery key. */
    activarRecuperacion: (datos) => pedir('activarRecuperacion', datos),
    /** §25 R109 — devuelve el salt y las DEKs reenvueltes bajo la maestra nueva. */
    usarRecuperacion: (datos) => pedir('usarRecuperacion', datos),
    /** §28 — el KDF del export también corre en el worker (§15.1 R52). */
    crearExport: (datos) => pedir('crearExport', datos),
    /** abrir un export cifrado también cuesta Argon2id: al worker (§15.1 R52). */
    abrirExport: (datos) => pedir('abrirExport', datos),

    // --- Fase 5.1 (§6.2, §26): el par vive en el worker, aquí sólo envolturas ---

    /** §6.2 R6 — genera el par y devuelve envolturas + públicas (R7). */
    generarParAsimetrico: (datos) => pedir('generarParAsimetrico', datos),
    /** §6.2 — deja el par abierto en el worker hasta que se bloquee. */
    abrirPar: (datos) => pedir('abrirPar', datos),
    /** §26 R110 — snapshot re-cifrado y envuelto hacia el receptor. */
    envolverPara: (datos) => pedir('envolverPara', datos),
    /** §26 — abre una compartición recibida. */
    abrirShare: (datos) => pedir('abrirShare', datos),

    /** §9 R27/R28: cierra todo y rechaza lo que quede en vuelo. */
    destruir() {
      if (destruido) return;
      destruido = true;
      falloGlobal(new Error('Sesión de bóveda finalizada'));
      try {
        worker.terminate?.();
      } catch {
        /* el worker ya no estaba */
      }
    },
  };
}
