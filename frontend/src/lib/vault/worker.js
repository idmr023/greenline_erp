/**
 * Adaptador de Web Worker — Bóveda Segura V5 §15.1 / R52.
 *
 * Todo el material derivado (KEK, DEK) vive en este hilo y jamás se
 * serializa hacia el hilo principal: sólo salen resultados. El único
 * resultado que sí sale en claro es el plaintext de un item cuando hay que
 * mostrarlo (§13), y se sobreescribe en el worker justo después de clonarlo.
 */

import { crearServicioBoveda } from './servicio.js';

const servicio = crearServicioBoveda();

globalThis.addEventListener('message', (evento) => {
  const { id, mensaje } = evento.data || {};

  servicio
    .manejar(mensaje)
    .then((resultado) => {
      globalThis.postMessage({ id, ok: true, resultado });
      // `postMessage` clona de forma síncrona: lo que queda en el worker es
      // una copia inútil y se limpia (§15.1 R51).
      if (resultado instanceof Uint8Array) resultado.fill(0);
    })
    .catch((error) => {
      globalThis.postMessage({
        id,
        ok: false,
        error: {
          name: error?.name || 'Error',
          message: error?.message || 'Error desconocido',
          codigo: error?.codigo,
        },
      });
    });
});
