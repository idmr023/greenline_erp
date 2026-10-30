/**
 * Auditoría del archivo compartido de iconos (`lib/icons.jsx`).
 *
 * `lib/icons.jsx` seSINCRONIZA desde el sitio público hacia el panel ERP
 * (`scripts/sync-shared.mjs`): el archivo del sitio es el canónico y el del
 * panel es una copia byte a byte. Por eso un export agregado SOLO en el panel
 * desaparece en la siguiente sincronización y rompe el build del panel con
 * `MISSING_EXPORT`.
 *
 * Este módulo es lógica pura (sin fs) para que el mismo helper se pueda usar
 * desde el script de auditoría del sitio y desde el test del panel.
 */

/** Export con nombre: `export const X = ...`. */
const RE_EXPORT = /^[ \t]*export\s+const\s+([A-Za-z_$][\w$]*)\s*=\s*(.*)$/gm;

/** Import con llaves: `import { A, B as C } from '.../lib/icons'`. */
const RE_IMPORT = /import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g;

/** Icono de FontAwesome usado por un export: `icon={faX}`. */
const RE_BINDING = /\bicon=\{?(fa[A-Za-z0-9_]+)\}?/;

/** Ruta de módulo que resuelve al archivo de iconos. */
export function esModuloDeIconos(rutaModulo) {
  return /(^|\/)lib\/icons(\.[a-z]+)?$/.test(rutaModulo) || /(^|\/)icons$/.test(rutaModulo);
}

/**
 * Quita los comentarios: un import comentado no importa nada y un export
 * comentado no exporta nada.
 */
export function sinComentarios(codigo) {
  return codigo
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

/**
 * Lee los exports de un archivo de iconos.
 * @returns {{ nombres: string[], duplicados: { nombre: string, veces: number }[],
 *            bindings: Map<string, string>, alias: { icono: string, nombres: string[] }[] }}
 */
export function parsearExportsIconos(codigo) {
  const nombres = [];
  const bindings = new Map();

  for (const match of sinComentarios(codigo).matchAll(RE_EXPORT)) {
    const [, nombre, resto] = match;
    nombres.push(nombre);
    const binding = RE_BINDING.exec(resto);
    if (binding) bindings.set(nombre, binding[1]);
  }

  const conteo = new Map();
  for (const nombre of nombres) conteo.set(nombre, (conteo.get(nombre) || 0) + 1);

  const duplicados = [...conteo.entries()]
    .filter(([, veces]) => veces > 1)
    .map(([nombre, veces]) => ({ nombre, veces }));

  // Exports distintos que apuntan al MISMO icono de FontAwesome: son alias
  // intencionales (Image/ImageIcon, Gauge/LayoutDashboard, Shield/...). No son
  // duplicados y no se deben borrar.
  const porIcono = new Map();
  for (const [nombre, icono] of bindings) {
    if (!porIcono.has(icono)) porIcono.set(icono, []);
    porIcono.get(icono).push(nombre);
  }
  const alias = [...porIcono.entries()]
    .filter(([, grupo]) => grupo.length > 1)
    .map(([icono, grupo]) => ({ icono, nombres: grupo }));

  return { nombres, duplicados, bindings, alias };
}

/**
 * Lee los nombres de icono que un archivo importa del módulo de iconos.
 * `import { Image as ImageIcon }` requiere el export `Image`.
 * @returns {string[]}
 */
export function parsearImportsIconos(codigo) {
  const requeridos = [];
  for (const match of sinComentarios(codigo).matchAll(RE_IMPORT)) {
    const [, lista, rutaModulo] = match;
    if (!esModuloDeIconos(rutaModulo)) continue;
    for (const parte of lista.split(',')) {
      const limpio = parte.trim();
      if (!limpio) continue;
      const nombre = limpio.split(/\s+as\s+/)[0].trim();
      if (nombre) requeridos.push(nombre);
    }
  }
  return requeridos;
}

/**
 * Cruza los exports del archivo de iconos con los imports del código.
 * @param {{ codigoIcons: string, archivos: { ruta: string, codigo: string }[] }} entrada
 * @returns {{ faltantes: { ruta: string, nombre: string }[],
 *            duplicados: { nombre: string, veces: number }[],
 *            alias: { icono: string, nombres: string[] }[] }}
 */
export function auditarIconos({ codigoIcons, archivos }) {
  const { nombres, duplicados, alias } = parsearExportsIconos(codigoIcons);
  const exportados = new Set(nombres);

  const faltantes = [];
  for (const { ruta, codigo } of archivos) {
    for (const nombre of parsearImportsIconos(codigo)) {
      if (!exportados.has(nombre)) faltantes.push({ ruta, nombre });
    }
  }

  return { faltantes, duplicados, alias };
}

/**
 * Nombres de icono que un conjunto de archivos necesita y que el archivo de
 * iconos NO exporta. Sirve para abortar una sincronización destructiva.
 * @param {{ codigoIcons: string, archivos: { ruta: string, codigo: string }[] }} entrada
 * @returns {string[]} nombres faltantes, sin repetir y ordenados
 */
export function iconosFaltantes({ codigoIcons, archivos }) {
  const { faltantes } = auditarIconos({ codigoIcons, archivos });
  return [...new Set(faltantes.map((f) => f.nombre))].sort();
}
