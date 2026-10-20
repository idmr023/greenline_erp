/**
 * Helpers de filtro por mes (compartidos por los módulos del taller).
 *
 * El filtro es SIEMPRE un string "YYYY-MM" y viaja a la API como `mes=`,
 * que el backend traduce al rango [inicio de mes, fin de mes].
 */

const MESES_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Setiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

/** Mes actual en "YYYY-MM" (hora local, no UTC: el filtro es de la tienda). */
export function mesActual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** "2026-10" → "Octubre 2026" */
export function nombreMes(clave) {
  if (!clave || !/^\d{4}-\d{2}$/.test(clave)) return 'Todos los meses';
  const [y, m] = clave.split('-').map(Number);
  return `${MESES_ES[m - 1]} ${y}`;
}

/** Últimos `cantidad` meses (incluye el actual), de más reciente a más antiguo. */
export function ultimosMeses(cantidad = 12) {
  const salida = [];
  const d = new Date();
  for (let i = 0; i < cantidad; i += 1) {
    const fecha = new Date(d.getFullYear(), d.getMonth() - i, 1);
    salida.push(`${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`);
  }
  return salida;
}

/** Primer día del mes "YYYY-MM-DD" (para inputs type="date"). */
export function primerDiaMes(clave) {
  if (!clave || !/^\d{4}-\d{2}$/.test(clave)) return '';
  return `${clave}-01`;
}

/** Fecha "YYYY-MM-DD" → clave de mes "YYYY-MM". */
export function claveMes(fechaISO) {
  if (!fechaISO) return '';
  return String(fechaISO).slice(0, 7);
}
