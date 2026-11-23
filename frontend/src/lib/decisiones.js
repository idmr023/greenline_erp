// Helpers del dashboard «Toma de Decisiones» (Sprint 5). Módulo puro.
// Los cálculos de negocio viven en el backend (/api/decisiones/*); aquí solo
// se arman los rangos de fechas y se formatean los valores.

const OFFSET_LIMA_MS = 5 * 60 * 60 * 1000;

/** 'YYYY-MM-DD' de hoy en Lima (UTC-5). */
export function hoyLima(ahora = Date.now()) {
  return new Date(ahora - OFFSET_LIMA_MS).toISOString().slice(0, 10);
}

function sumarDias(dia, n) {
  return new Date(Date.parse(`${dia}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

export const PERIODOS = [
  { id: '7d', label: 'Últimos 7 días' },
  { id: '30d', label: 'Últimos 30 días' },
  { id: '90d', label: 'Últimos 90 días' },
  { id: 'mes', label: 'Este mes' },
  { id: 'mes-anterior', label: 'Mes anterior' },
  { id: 'rango', label: 'Rango personalizado' },
];

/** Rango { desde, hasta } (ambos incluidos) de un periodo predefinido. */
export function rangoDePeriodo(id, hoy = hoyLima()) {
  if (id === '7d') return { desde: sumarDias(hoy, -6), hasta: hoy };
  if (id === '90d') return { desde: sumarDias(hoy, -89), hasta: hoy };
  if (id === 'mes') return { desde: `${hoy.slice(0, 7)}-01`, hasta: hoy };
  if (id === 'mes-anterior') {
    const finAnterior = sumarDias(`${hoy.slice(0, 7)}-01`, -1);
    return { desde: `${finAnterior.slice(0, 7)}-01`, hasta: finAnterior };
  }
  return { desde: sumarDias(hoy, -29), hasta: hoy };
}

/** '+25 %' / '-10 %' / '0 %'; null si el backend no dio variación (base chica). */
export function formatoVariacion(v) {
  if (v == null) return null;
  const pct = Math.round(v * 100);
  return `${pct > 0 ? '+' : ''}${pct} %`;
}

/** 0.8 -> '80 %'; null -> '-'. */
export function formatoPct(v) {
  return v == null ? '-' : `${Math.round(v * 100)} %`;
}

export function formatoSoles(v) {
  return `S/ ${Number(v || 0).toLocaleString('es-PE', { maximumFractionDigits: 0 })}`;
}

export function formatoDia(dia) {
  const [, m, d] = dia.split('-');
  return `${d}/${m}`;
}

// Una celda que empieza con = + - @ (o tab/CR) Excel la interpreta como
// fórmula: se antepone ' para que quede como texto.
const FORMULA = /^[=+\-@\t\r]/;

function celda(valor) {
  if (valor == null) return '';
  let s = typeof valor === 'number' ? String(valor).replace('.', ',') : String(valor);
  if (typeof valor !== 'number' && FORMULA.test(s)) s = `'${s}`;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * CSV para Excel en español: separador ';', coma decimal y BOM UTF-8.
 * columnas: [{ clave, titulo }]; filas: objetos con esas claves.
 */
export function toCsv(columnas, filas) {
  const lineas = [
    columnas.map((c) => celda(c.titulo)).join(';'),
    ...filas.map((f) => columnas.map((c) => celda(f[c.clave])).join(';')),
  ];
  return `\uFEFF${lineas.join('\r\n')}\r\n`;
}
