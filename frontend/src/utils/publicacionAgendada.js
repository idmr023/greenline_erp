/**
 * Helpers de publicación agendada de productos.
 *
 * `productos.publicar_en` es TIMESTAMPTZ (UTC) en la BD. El input
 * type="datetime-local" del formulario trabaja en hora local del
 * navegador y usa el formato "YYYY-MM-DDTHH:MM"; aquí se traduce
 * en ambos sentidos sin depender de librerías de fecha.
 */

/** ISO/timestamptz de la BD → "YYYY-MM-DDTHH:MM" local para datetime-local. */
export function isoADatetimeLocal(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "YYYY-MM-DDTHH:MM" local → ISO UTC para guardar en la BD (o null). */
export function datetimeLocalAIso(valor) {
  if (!valor) return null;
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/** true si el valor de datetime-local apunta a un instante futuro. */
export function esFuturo(valorLocal) {
  if (!valorLocal) return false;
  const d = new Date(valorLocal);
  return !Number.isNaN(d.getTime()) && d.getTime() > Date.now();
}

/**
 * Estado de publicación derivado de activo + publicar_en.
 * @returns {'publicado'|'programado'|'borrador'}
 */
export function estadoPublicacion({ activo, publicarEn }) {
  if (activo) return 'publicado';
  if (publicarEn) return 'programado';
  return 'borrador';
}

/** Texto legible de la fecha de agendado (hora local, es-PE). */
export function fechaAgendadaLegible(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return d.toLocaleString('es-PE', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return d.toISOString();
  }
}
