/**
 * Mensajes de error de la API, según el motivo real del fallo.
 *
 * Por qué existe: el 2FA del panel limita a 5 intentos cada 5 minutos
 * (por IP, compartido entre TOTP, correo y códigos de respaldo). Si un
 * fallo del servidor se muestra como "código inválido", el usuario
 * reintenta, quema la cuota y además cree que su app de autenticación
 * está mal.
 *
 * Regla: el mensaje debe decir SI conviene reintentar y con qué clave.
 *   · 401 → el dato que se envió no vale (código incorrecto, caducado).
 *   · 408 → el servidor tardó: reintentar sí.
 *   · 429 → hay que esperar: reintentar no.
 *   · 5xx → el servidor falló: reintentar más tarde, no insiste.
 */

const MENSAJE_SERVIDOR =
  'El servidor no pudo responder en este momento. Intenta en un momento.';
const MENSAJE_ESPERA =
  'El servidor está limitando las peticiones. Espera unos minutos y vuelve a intentarlo.';
const MENSAJE_TIMEOUT =
  'El servidor tardó demasiado en responder. Intenta de nuevo.';

/**
 * Traduce un error de `request()` a un mensaje accionable.
 *
 * @param {{ status?: number, error?: string, message?: string }|null|undefined} err
 * @param {string} [fallback] texto si el error no trae información
 * @returns {string}
 */
export function mensajeDeError(err, fallback = 'No se pudo completar la operación.') {
  const status = err?.status;

  if (status === 429) return err?.error || MENSAJE_ESPERA;
  if (status === 408) return MENSAJE_TIMEOUT;
  if (typeof status === 'number' && status >= 500) return MENSAJE_SERVIDOR;
  if (status === 401) return err?.error || 'Código inválido';

  // Sin status: error de red o excepción local. `message` puede ser
  // "Failed to fetch" (poco útil en español), así que se prioriza el
  // `error` del backend y el fallback por defecto.
  return err?.error || fallback;
}

/** ¿El fallo fue del servidor (o de la red), no del dato enviado? */
export function esFalloDeServidor(err) {
  const status = err?.status;
  return typeof status === 'number' && (status >= 500 || status === 408 || status === 429);
}
