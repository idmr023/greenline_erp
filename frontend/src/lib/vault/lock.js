/**
 * Control de auto-lock — Bóveda Segura V5 §9 / R26–R28.
 *
 * §9 es la distinción central de la V5: un token de sesión robado no puede
 * descifrar nada porque la Unlock Key sólo vive en memoria y caduca. Este
 * módulo es el reloj que decide cuándo esa memoria se limpia.
 *
 * Puro y sin `setTimeout`: el módulo sólo calcula. Quien programa los
 * temporizadores es `VaultContext`.
 */

/** §9 R26: 15 min sin interacción, 5 min en ítems críticos. */
export const POLITICA_DEFECTO = Object.freeze({
  inactividadMs: 15 * 60_000,
  criticoMs: 5 * 60_000,
});

export const EVENTO = Object.freeze({
  desbloqueado: 'desbloqueado',
  bloqueado: 'bloqueado',
  actividad: 'actividad',
  modoEstandar: 'modoEstandar',
  modoCritico: 'modoCritico',
});

export function estadoInicialLock(ahora = 0) {
  return { estado: 'bloqueada', ultimoActividad: ahora, modo: 'estandar' };
}

/** Límite de inactividad vigente según el modo (§9 R27). */
export function limiteMs(lock, politica = POLITICA_DEFECTO) {
  return lock.modo === 'critico' ? politica.criticoMs : politica.inactividadMs;
}

export function vencido(lock, ahora, politica = POLITICA_DEFECTO) {
  if (lock.estado !== 'activa') return false;
  return ahora - lock.ultimoActividad >= limiteMs(lock, politica);
}

/** Cuánto falta, en ms, antes de que el auto-lock dispare (0 si ya venció). */
export function restanteMs(lock, ahora, politica = POLITICA_DEFECTO) {
  if (lock.estado !== 'activa') return 0;
  const restante = limiteMs(lock, politica) - (ahora - lock.ultimoActividad);
  return restante > 0 ? restante : 0;
}

/**
 * Reductor puro. `accion` es un objeto `{ tipo, ahora? }`.
 * Todas las transiciones relevantes están aquí para poderlas probar sin
 * tocar temporizadores ni DOM. La política no interviene: sólo decide
 * cuándo se evalúa, no qué transiciones existen.
 */
export function reducirLock(lock, accion) {
  const ahora = accion.ahora ?? Date.now();

  switch (accion.tipo) {
    case EVENTO.desbloqueado:
      return { estado: 'activa', ultimoActividad: ahora, modo: 'estandar' };

    case EVENTO.bloqueado:
      // §9 R25: al bloquear se limpia todo el estado sensible, no sólo se
      // marca una bandera.
      return { estado: 'bloqueada', ultimoActividad: 0, modo: 'estandar' };

    case EVENTO.actividad: {
      if (lock.estado !== 'activa') return lock;
      return { ...lock, ultimoActividad: ahora };
    }

    case EVENTO.modoCritico: {
      if (lock.estado !== 'activa') return lock;
      return { ...lock, modo: 'critico' };
    }

    case EVENTO.modoEstandar: {
      if (lock.estado !== 'activa') return lock;
      return { ...lock, modo: 'estandar' };
    }

    default:
      return lock;
  }
}

/**
 * Comprueba el reloj y devuelve `bloqueada` si venció. Centraliza la
 * decisión para que el contexto no tenga que reimplementarla.
 */
export function evaluarVencimiento(lock, ahora, politica = POLITICA_DEFECTO) {
  if (!vencido(lock, ahora, politica)) return lock;
  return reducirLock(lock, { tipo: EVENTO.bloqueado });
}
