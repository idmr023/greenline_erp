#!/usr/bin/env node
/**
 * Auditoría de puntos de inyección de HTML (Bóveda Segura V5 §16 / R60).
 *
 * Regla del repo: TODO string que aterrice en `innerHTML`, en
 * `dangerouslySetInnerHTML` o en `insertAdjacentHTML` tiene que pasar por
 * `utils/sanitizeHtml`. Este script lo comprueba y falla el lint si aparece
 * algún sink sin sanitizar.
 *
 * Excepción justificada: añadir en la misma línea
 *   // html-sink:allow <motivo>
 *
 * Uso: node scripts/auditar-sinks-html.mjs
 */

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = path.join(raiz, 'frontend', 'src');
const EXTENSIONES = new Set(['.js', '.jsx', '.ts', '.tsx']);

const RE_DANGEROUS = /dangerouslySetInnerHTML/;
const RE_ASSIGN_INNER = /\.innerHTML\s*=(?!=)/;
const RE_ADJACENT = /\.insertAdjacentHTML\s*\(/;
const RE_DOC_WRITE = /(?:^|[^.\w])document\.write\s*\(/;
const RE_SANITIZA = /sanitizeHtml\s*\(/;
const RE_ASIGNA_VACIO = /\.innerHTML\s*=\s*(?:''|"")\s*;?$/;
const RE_EXCEPCION = /html-sink:allow\b/;

function listar(dir, salida = []) {
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const ruta = path.join(dir, entrada.name);
    if (entrada.isDirectory()) {
      listar(ruta, salida);
    } else if (EXTENSIONES.has(path.extname(entrada.name))) {
      salida.push(ruta);
    }
  }
  return salida;
}

const hallazgos = [];

for (const archivo of listar(srcDir)) {
  // El propio utilitario define la API y no debe autoexigirse.
  if (archivo.endsWith(path.join('utils', 'sanitizeHtml.js'))) continue;

  const rel = path.relative(raiz, archivo).split(path.sep).join('/');
  const lineas = readFileSync(archivo, 'utf8').split(/\r?\n/);

  lineas.forEach((linea, indice) => {
    const num = indice + 1;
    if (RE_EXCEPCION.test(linea)) return;

    if (RE_DANGEROUS.test(linea)) {
      if (!RE_SANITIZA.test(linea)) {
        hallazgos.push(`${rel}:${num}  dangerouslySetInnerHTML sin sanitizeHtml(...)`);
      }
      return;
    }

    if (RE_DOC_WRITE.test(linea)) {
      hallazgos.push(`${rel}:${num}  document.write() está prohibido`);
      return;
    }

    if (RE_ADJACENT.test(linea)) {
      if (!RE_SANITIZA.test(linea)) {
        hallazgos.push(`${rel}:${num}  insertAdjacentHTML(...) sin sanitizeHtml(...)`);
      }
      return;
    }

    if (RE_ASSIGN_INNER.test(linea)) {
      if (RE_ASIGNA_VACIO.test(linea)) return; // limpieza explícita del nodo
      if (!RE_SANITIZA.test(linea)) {
        hallazgos.push(`${rel}:${num}  asignación a .innerHTML sin sanitizeHtml(...)`);
      }
    }
  });
}

if (hallazgos.length) {
  console.error('Sinks de HTML sin sanitizar (Bóveda Segura V5 §16 / R60):\n');
  for (const h of hallazgos) console.error(`  ✗ ${h}`);
  console.error(`\n${hallazgos.length} incidencia(s). Envuelve el valor en sanitizeHtml().`);
  process.exit(1);
}

console.log('auditar-sinks-html: OK — todos los sinks de HTML pasan por sanitizeHtml.');