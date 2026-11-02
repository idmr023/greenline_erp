/**
 * Precio por cuotas (categorías con `precio_por_cuotas`, p. ej. scooters).
 *
 * Esas categorías NO muestran el precio tachado ni el % de descuento:
 * muestran el precio, el precio total en cuotas y el valor de cada cuota.
 *
 * Módulo puro (sin Supabase ni React) para que se pueda probar solo.
 */

/** ¿Este producto se muestra con precio por cuotas? */
export function esPrecioPorCuotas(producto) {
  return producto?.precio_por_cuotas === true;
}

/**
 * Número de cuotas: se DERIVA (precio_cuotas / precio_cuota) para que no
 * pueda quedar inconsistente con el importe. Null si falta alguno de los dos.
 */
export function numeroCuotas(producto) {
  const total = Number(producto?.precio_cuotas);
  const cuota = Number(producto?.precio_cuota);
  if (!Number.isFinite(total) || !Number.isFinite(cuota) || cuota <= 0) return null;
  const n = Math.round(total / cuota);
  return n > 0 ? n : null;
}

/**
 * Datos de precio por cuotas listos para pintar. `total` y `cuota` pueden
 * venir null (el admin aún no los cargó): la UI oculta la línea que falte.
 */
export function precioPorCuotasDe(producto) {
  return {
    precio: producto?.precio_actual ?? null,
    total: producto?.precio_cuotas ?? null,
    cuota: producto?.precio_cuota ?? null,
    numCuotas: numeroCuotas(producto),
  };
}
