/**
 * Límite de velocidad de intentos — Bóveda Segura V5 §52.
 *
 * Ventana deslizante por clave: guarda las marcas de tiempo de los
 * intentos dentro de la ventana y cuenta sólo las que siguen vivas. No
 * hace falta podar en cada lectura; al consumir se descartan las que ya
 * caducaron y sólo se mantienen como mucho `max` marcas (el techo mismo).
 *
 * Diseño:
 *
 * - **Fail-closed**: parámetros no finitos o `max < 1` lanzan en la
 *   construcción; nunca se queda sin límite por un `NaN` tonto.
 * - **Claves aisladas**: el límite es por (usuario, propósito); si un
 *   propósito se desborda no se castigan los demás.
 * - **Inmutable por fuera**: `limpiar()` sólo descarta claves que ya
 *   caducaron por completo. Reiniciar la ventana a petición del usuario
 *   convertiría el límite en decoración.
 * - El reloj es inyectable (`ahora`) para que los tests no duerman 60 s.
 */

import { MAX_INTENTOS_STEPUP, VENTANA_STEPUP_MS } from './params.js';

function validar({ max, ventanaMs }) {
  if (!Number.isInteger(max) || max < 1) {
    throw new Error('limitador: max debe ser un entero >= 1');
  }
  if (!Number.isFinite(ventanaMs) || ventanaMs <= 0) {
    throw new Error('limitador: ventanaMs debe ser > 0');
  }
}

/**
 * @param {{max:number, ventanaMs:number, ahora?:()=>number}} opciones
 */
export function crearLimitador({ max, ventanaMs, ahora = Date.now }) {
  validar({ max, ventanaMs });

  /** @type {Map<string, number[]>} */
  const marcas = new Map();

  function vivas(clave) {
    const t = ahora();
    const lista = marcas.get(clave) || [];
    // Las marcas llegan ordenadas: basta cortar por la izquierda.
    let i = 0;
    while (i < lista.length && t - lista[i] >= ventanaMs) i += 1;
    const restantes = i === 0 ? lista : lista.slice(i);
    if (restantes.length === 0) marcas.delete(clave);
    else marcas.set(clave, restantes);
    return restantes;
  }

  return {
    /**
     * Consume un intento. Devuelve `true` si el intento se permite y
     * `false` si la clave ya agotó su ventana (el intento NO cuenta).
     *
     * @param {string} clave
     * @returns {boolean}
     */
    consumir(clave) {
      if (typeof clave !== 'string' || clave === '') {
        throw new Error('limitador: falta la clave');
      }
      const lista = vivas(clave);
      if (lista.length >= max) return false;
      lista.push(ahora());
      marcas.set(clave, lista);
      return true;
    },

    /**
     * Intentos que quedan en la ventana actual, sin consumir ninguno.
     *
     * @param {string} clave
     * @returns {number}
     */
    restantes(clave) {
      return Math.max(0, max - vivas(clave).length);
    },

    /**
     * Descarta las claves cuya ventana ya venció entera. No rebaja
     * ninguna ventana en curso (ver arriba).
     */
    limpiar() {
      for (const clave of [...marcas.keys()]) vivas(clave);
    },

    /** Sólo para tests: vacía todo. No usar en código de producción. */
    reiniciar() {
      marcas.clear();
    },
  };
}

/**
 * Instancia compartida del límite de step-up. Es módulo-level a propósito:
 * debe sobrevivir a los re-renders y a los cambios de componente, o cada
 * mount empezaría una ventana nueva.
 */
export const limitadorStepUp = crearLimitador({
  max: MAX_INTENTOS_STEPUP,
  ventanaMs: VENTANA_STEPUP_MS,
});
