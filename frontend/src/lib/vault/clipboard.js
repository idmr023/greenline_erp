/**
 * Portapapeles — Bóveda Segura V5 §14 / R44–R49.
 *
 * Copiar es una operación sensible con el mismo step-up que revelar (R44).
 * Este módulo sólo resuelve lo técnico: escribir, esperar, borrar y avisar.
 * Quién exige el step-up es el componente que llama (`SecretField`).
 *
 * §14.1 y §53 L5: el borrado NO garantiza nada. El sistema operativo
 * conserva historial (Win+V), sincroniza con la nube y otras aplicaciones
 * pueden leer el portapapeles. Por eso el aviso es parte de la API, no
 * un extra opcional.
 */

/** 30 s por defecto: suficiente para pegar, poco para que se olvide. */
export const RETENCION_DEFECTO_MS = 30_000;

/** R47 — el texto de aviso que la UI debe mostrar al copiar. */
export const AVISO_HISTORIAL_SO =
  'La contraseña se borrará del portapapeles, pero tu sistema operativo puede ' +
  'conservarla en el historial (Win+V en Windows) o sincronizarla con la nube. ' +
  'Vacía el historial del portapapeles si el equipo es compartido.';

async function escribirPorDefecto(texto) {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
    // Contexto no seguro (HTTP) o navegador sin API de portapapeles.
    throw new Error('El portapapeles no está disponible en este contexto');
  }
  await navigator.clipboard.writeText(texto);
}

function vaciarPorDefecto() {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return;
  // Si falla aquí no importa: ya se agotó la ventana de utilidad.
  navigator.clipboard.writeText('').catch(() => {});
}

/**
 * @param {string} texto el secreto — jamás se registra en logs ni errores
 * @param {object} [opciones]
 * @param {number} [opciones.retencionMs]
 * @param {(t:string)=>Promise<void>} [opciones.escribir]
 * @param {()=>void} [opciones.alVencer] se invoca al limpiar
 * @param {(fn:Function, ms:number)=>any} [opciones.programar]
 * @param {(id:any)=>void} [opciones.cancelar]
 * @returns {Promise<{limpiar:() => void, restanteMs:()=>number, aviso:string}>}
 */
export async function copiarAlPortapapeles(
  texto,
  {
    retencionMs = RETENCION_DEFECTO_MS,
    escribir = escribirPorDefecto,
    alVencer = null,
    programar = setTimeout,
    cancelar = clearTimeout,
    vaciar = vaciarPorDefecto,
    ahora = Date.now,
  } = {},
) {
  if (typeof texto !== 'string' || texto === '') {
    throw new Error('No hay nada que copiar');
  }
  if (!Number.isFinite(retencionMs) || retencionMs <= 0) {
    throw new Error('retencionMs inválido');
  }

  // R45: no se copia nada hasta aquí. El step-up lo exige el llamante.
  await escribir(texto);

  const creadoEn = ahora();
  let temporizador = null;
  let limpiado = false;

  function limpiar() {
    if (limpiado) return;
    limpiado = true;
    if (temporizador !== null) cancelar(temporizador);
    temporizador = null;
    vaciar();
    if (typeof alVencer === 'function') alVencer();
  }

  temporizador = programar(limpiar, retencionMs);

  return {
    limpiar,
    restanteMs: () => (limpiado ? 0 : Math.max(0, retencionMs - (ahora() - creadoEn))),
    aviso: AVISO_HISTORIAL_SO,
  };
}
