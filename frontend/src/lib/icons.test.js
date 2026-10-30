import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { auditarIconos, parsearExportsIconos } from './icons-audit.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SRC = path.join(RAIZ, 'frontend', 'src');
const ICONS = path.join(SRC, 'lib', 'icons.jsx');
const EXTENSIONES = new Set(['.js', '.jsx', '.ts', '.tsx']);

function listar(dir, salida = []) {
  if (!existsSync(dir)) return salida;
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    if (entrada.name === 'node_modules') continue;
    const ruta = path.join(dir, entrada.name);
    if (entrada.isDirectory()) listar(ruta, salida);
    else if (EXTENSIONES.has(path.extname(entrada.name))) salida.push(ruta);
  }
  return salida;
}

const codigoIcons = readFileSync(ICONS, 'utf8');
const archivos = listar(SRC)
  .filter((ruta) => ruta !== ICONS)
  .map((ruta) => ({
    ruta: path.relative(RAIZ, ruta).split(path.sep).join('/'),
    codigo: readFileSync(ruta, 'utf8'),
  }));

test('todo icono que importa el panel está exportado por lib/icons.jsx', () => {
  const { faltantes } = auditarIconos({ codigoIcons, archivos });
  const detalle = faltantes.map((f) => `  -> ${f.ruta} importa "${f.nombre}"`).join('\n');
  assert.equal(
    faltantes.length,
    0,
    `Faltan exports en frontend/src/lib/icons.jsx:\n${detalle}\n\n` +
      'lib/icons.jsx es un archivo COMPARTIDO: lo define el sitio público ' +
      '(greenline/frontend/lib/icons.jsx) y lo copia `npm run sync:shared`.\n' +
      'El export faltante se agrega en el canónico del sitio y se sincroniza: ' +
      'agregarlo sólo en el panel lo borra la siguiente sincronización.',
  );
});

test('lib/icons.jsx no declara dos veces el mismo export', () => {
  const { duplicados } = parsearExportsIconos(codigoIcons);
  const detalle = duplicados.map((d) => `  -> ${d.nombre} x${d.veces}`).join('\n');
  assert.equal(
    duplicados.length,
    0,
    `Exports duplicados en frontend/src/lib/icons.jsx:\n${detalle}\n\n` +
      'Un export declarado dos veces rompe el build. Se borra la copia repetida, ' +
      'NO el export: si el panel lo importa, tiene que quedar en el canónico.',
  );
});

test('los alias al mismo icono de FontAwesome se conservan', () => {
  const { alias } = parsearExportsIconos(codigoIcons);
  const porNombre = new Map(alias.map((a) => [a.icono, a.nombres]));
  // Alias intencionales: nombres distintos con el mismo dibujo. No son
  // duplicados y borrarlos rompe los imports que los usan.
  assert.deepEqual(porNombre.get('faImage'), ['Image', 'ImageIcon']);
  assert.deepEqual(porNombre.get('faImages'), ['Images', 'ImagesIcon']);
  assert.deepEqual(porNombre.get('faLink'), ['Link', 'LinkIcon']);
  assert.deepEqual(porNombre.get('faTable'), ['Table', 'TableIcon']);
});
