const COLOR_DOT_CLASS = {
  Blanco: 'bg-white border-gray-300',
  Negro: 'bg-gray-900',
  Gris: 'bg-gray-500',
  'Gris Claro': 'bg-gray-300',
  'Gris Oscuro': 'bg-gray-700',
  Rojo: 'bg-red-600',
  'Verde (y sus variantes)': 'bg-green-400',
  Verde: 'bg-green-500',
  'Verde ligero': 'bg-green-400',
  'Verde Esmeralda': 'bg-emerald-600',
  'Verde Metálico': 'bg-emerald-800',
  Celeste: 'bg-sky-400',
  Azul: 'bg-blue-600',
  Crema: 'bg-orange-100',
  Rosado: 'bg-pink-400',
  Plateado: 'bg-gray-400',
  Plata: 'bg-gray-400',
  Marrón: 'bg-amber-800',
  Morado: 'bg-purple-600',
  Naranja: 'bg-orange-500',
  Camaleón: 'bg-gradient-to-br from-green-400 via-blue-500 to-purple-500',
};

export const DEFAULT_COLOR_DOT = 'bg-gray-300';

export function colorDotClassFor(nombre) {
  return COLOR_DOT_CLASS[nombre] || DEFAULT_COLOR_DOT;
}

export const normalizeColorName = (value) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

export function hexFromColores(coloresDetalle, nombre) {
  if (!nombre || !Array.isArray(coloresDetalle)) return null;
  const target = normalizeColorName(nombre);
  const match = coloresDetalle.find((c) => normalizeColorName(c?.nombre) === target);
  const hex = match?.hex_code;
  return typeof hex === 'string' && /^#?[0-9a-f]{3,8}$/i.test(hex.trim())
    ? (hex.trim().startsWith('#') ? hex.trim() : `#${hex.trim()}`)
    : null;
}

export function colorDotStyle(coloresDetalle, nombre) {
  const hex = hexFromColores(coloresDetalle, nombre);
  return hex ? { backgroundColor: hex } : undefined;
}

export default COLOR_DOT_CLASS;
