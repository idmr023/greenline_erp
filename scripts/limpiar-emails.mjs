#!/usr/bin/env node
/**
 * Limpia el export de clientes de WooCommerce/WordPress y genera la lista
 * definitiva para la campaña de email (n8n).
 *
 * Uso:
 *   node scripts/limpiar-emails.mjs <entrada.csv> [opciones]
 *
 * Opciones:
 *   --salida=<dir>   Carpeta de salida (por defecto: docs/emails)
 *   --por-dia=<n>    Genera destinatarios_dia1.csv, dia2... de a n emails
 *   --mx             Verifica MX del dominio (más lento; opcional)
 *
 * Salidas:
 *   destinatarios_limpio.csv  -> email,nombre,pedidos,gasto (orden: más pedidos primero)
 *   destinatarios_diaN.csv    -> solo con --por-dia
 *   descartados.csv           -> email,nombre,motivo
 *
 * Motivos: formato_invalido | desechable | rol_o_test | falso_obvio | duplicado | sin_mx
 */

import fs from 'node:fs';
import path from 'node:path';
import dns from 'node:dns/promises';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

const DESECHABLES = new Set([
  'mailinator.com', 'mailinator.net', '10minutemail.com', '10minutemail.net',
  'guerrillamail.com', 'guerrillamail.info', 'guerrillamail.org',
  'tempmail.com', 'temp-mail.org', 'tempmailo.com', 'temp-mail.io',
  'throwaway.email', 'throwawaymail.com', 'yopmail.com', 'yopmail.fr',
  'trashmail.com', 'trashmail.de', 'sharklasers.com', 'getnada.com',
  'maildrop.cc', 'dispostable.com', 'fakeinbox.com', 'mailnesia.com',
  'mailcatch.com', '1secmail.com', '1secmail.net', 'mailnull.com',
  'spam4.me', 'rcpt.at', 'tempr.email', 'mohmal.com', 'byom.de',
]);

const ROL_LOCAL = new Set([
  'noreply', 'no-reply', 'no_reply', 'donotreply', 'admin', 'administrator',
  'root', 'info', 'support', 'soporte', 'ventas', 'contacto', 'contact',
  'postmaster', 'webmaster', 'hostmaster', 'abuse', 'mailer-daemon',
  'bounce', 'bounces', 'demo', 'guest', 'prueba', 'test', 'testing',
]);

const FALSO_LOCAL = new Set([
  'asdf', 'asdfgh', 'qwer', 'qwerty', 'aaa', 'aaaa', 'xxxx', 'xx',
  'foo', 'bar', 'baz', 'abc', 'xyz', 'tmp', 'temp', 'fake', 'pruebas',
  'correo', 'email', 'mail', 'usuario', 'user', 'demo1', 'hola',
]);

const FALSO_DOMINIO = new Set([
  'example.com', 'example.org', 'example.net', 'test.com', 'test.org',
  'email.com', 'domain.com', 'localhost', 'local', 'foo.com', 'bar.com',
]);

const EMAIL_RE = /^[^\s@,;<>"]+@[^\s@,;<>".]+\.[^\s@,;<>".]{2,}$/;

function normalizarHeader(s) {
  return String(s || '')
    .replace(/^\uFEFF/g, '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function detectDelimiter(headerLine) {
  let comas = 0;
  let puntos = 0;
  let enComillas = false;
  for (const ch of headerLine) {
    if (ch === '"') enComillas = !enComillas;
    else if (!enComillas && ch === ',') comas++;
    else if (!enComillas && ch === ';') puntos++;
  }
  return puntos > comas ? ';' : ',';
}

function parseCSV(text, delimiter) {
  const rows = [];
  let row = [];
  let field = '';
  let enComillas = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (enComillas) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else enComillas = false;
      } else field += c;
    } else if (c === '"') {
      enComillas = true;
    } else if (c === delimiter) {
      row.push(field); field = '';
    } else if (c === '\n') {
      row.push(field); rows.push(row); row = []; field = '';
    } else if (c !== '\r') {
      field += c;
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((v) => String(v).trim() !== ''));
}

function csvEscape(value) {
  const s = String(value ?? '');
  if (/[",;\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function writeCSV(filePath, header, rows) {
  const lines = [header.join(',')];
  for (const r of rows) lines.push(r.map(csvEscape).join(','));
  fs.writeFileSync(filePath, lines.join('\n') + '\n', 'utf8');
}

function parseNumero(raw) {
  if (raw == null) return 0;
  const s = String(raw).trim();
  if (!s) return 0;
  const conPuntoMiles = /^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s);
  if (conPuntoMiles) return Number(s.replace(/\./g, '').replace(',', '.')) || 0;
  const soloComaDecimal = /^-?\d+,\d+$/.test(s);
  if (soloComaDecimal) return Number(s.replace(',', '.')) || 0;
  return Number(s.replace(/,/g, '')) || 0;
}

function clasificarEmail(emailRaw) {
  const email = String(emailRaw || '').trim();
  if (!email) return { motivo: 'formato_invalido' };
  if (!EMAIL_RE.test(email)) return { motivo: 'formato_invalido' };

  const [local, dominio] = email.toLowerCase().split('@');
  if (DESECHABLES.has(dominio)) return { motivo: 'desechable' };
  if (FALSO_DOMINIO.has(dominio)) return { motivo: 'falso_obvio' };

  const localLimpio = local.replace(/[._-]/g, '');
  if (ROL_LOCAL.has(local) || ROL_LOCAL.has(localLimpio)) return { motivo: 'rol_o_test' };
  if (FALSO_LOCAL.has(local) || FALSO_LOCAL.has(localLimpio)) return { motivo: 'falso_obvio' };
  if (local.length < 3) return { motivo: 'falso_obvio' };
  if (/^(.)\1+$/.test(localLimpio)) return { motivo: 'falso_obvio' };

  return { email, local, dominio };
}

async function verificarMX(dominios) {
  const cache = new Map();
  const lista = [...dominios];
  let idx = 0;
  const workers = Array.from({ length: 8 }, async () => {
    while (idx < lista.length) {
      const dom = lista[idx++];
      if (cache.has(dom)) continue;
      let ok = false;
      try {
        const mx = await dns.resolveMx(dom);
        ok = mx && mx.length > 0;
      } catch {
        ok = false;
      }
      cache.set(dom, ok);
    }
  });
  await Promise.all(workers);
  return cache;
}

function mostrarUso() {
  console.log('Uso: node scripts/limpiar-emails.mjs <entrada.csv> [--salida=<dir>] [--por-dia=<n>] [--mx]');
  process.exit(1);
}

async function main() {
  const args = process.argv.slice(2);
  if (!args.length || args[0].startsWith('--')) mostrarUso();

  const entrada = path.resolve(args[0]);
  if (!fs.existsSync(entrada)) {
    console.error(`No existe el archivo: ${entrada}`);
    process.exit(1);
  }

  let salidaDir = path.join(ROOT, 'docs', 'emails');
  let porDia = 0;
  let conMX = false;
  for (const a of args.slice(1)) {
    if (a.startsWith('--salida=')) salidaDir = path.resolve(a.slice('--salida='.length));
    else if (a.startsWith('--por-dia=')) porDia = Number(a.slice('--por-dia='.length)) || 0;
    else if (a === '--mx') conMX = true;
    else console.warn(`Aviso: opción ignorada ${a}`);
  }

  const raw = fs.readFileSync(entrada, 'utf8').replace(/^\uFEFF/, '');
  const primeraLinea = raw.split(/\r?\n/, 1)[0] || '';
  const delimiter = detectDelimiter(primeraLinea);
  const filas = parseCSV(raw, delimiter);
  if (filas.length < 2) {
    console.error('El CSV no tiene filas de datos.');
    process.exit(1);
  }

  const headers = filas[0].map(normalizarHeader);
  const idxEmail = headers.findIndex((h) =>
    h.includes('correo electr') || h === 'email' || h === 'e-mail' || h === 'correo');
  const idxNombre = headers.findIndex((h) =>
    h === 'nombre' || h === 'nombre de usuario' || h === 'username' || h.includes('nombre'));
  const idxPedidos = headers.findIndex((h) => h.includes('pedido') || h === 'orders');
  const idxGasto = headers.findIndex((h) => h.includes('gasto') || h.includes('total'));

  if (idxEmail < 0) {
    console.error('No se encontró la columna de email. Encabezados:', headers.join(' | '));
    process.exit(1);
  }

  const descartados = [];
  const validos = [];
  const vistos = new Set();

  for (let i = 1; i < filas.length; i++) {
    const fila = filas[i];
    const nombre = (idxNombre >= 0 ? fila[idxNombre] : '') || fila[0] || '';
    const emailRaw = fila[idxEmail];
    const cl = clasificarEmail(emailRaw);
    if (cl.motivo) {
      descartados.push({ email: String(emailRaw || '').trim(), nombre, motivo: cl.motivo });
      continue;
    }
    const key = cl.email.toLowerCase();
    if (vistos.has(key)) {
      descartados.push({ email: cl.email, nombre, motivo: 'duplicado' });
      continue;
    }
    vistos.add(key);
    validos.push({
      email: cl.email,
      nombre,
      pedidos: idxPedidos >= 0 ? parseNumero(fila[idxPedidos]) : 0,
      gasto: idxGasto >= 0 ? parseNumero(fila[idxGasto]) : 0,
      dominio: cl.dominio,
    });
  }

  if (conMX) {
    console.log(`Verificando MX de ${new Set(validos.map((v) => v.dominio)).size} dominios...`);
    const mxOk = await verificarMX([...new Set(validos.map((v) => v.dominio))]);
    const sinMX = validos.filter((v) => !mxOk.get(v.dominio));
    for (const v of sinMX) {
      descartados.push({ email: v.email, nombre: v.nombre, motivo: 'sin_mx' });
    }
    const quedan = validos.filter((v) => mxOk.get(v.dominio));
    validos.length = 0;
    validos.push(...quedan);
  }

  validos.sort((a, b) => (b.pedidos - a.pedidos) || (b.gasto - a.gasto) || a.email.localeCompare(b.email));

  fs.mkdirSync(salidaDir, { recursive: true });
  const salidaLimpio = path.join(salidaDir, 'destinatarios_limpio.csv');
  const salidaDesc = path.join(salidaDir, 'descartados.csv');

  writeCSV(salidaLimpio, ['email', 'nombre', 'pedidos', 'gasto'],
    validos.map((v) => [v.email, v.nombre, v.pedidos, v.gasto]));
  writeCSV(salidaDesc, ['email', 'nombre', 'motivo'],
    descartados.map((d) => [d.email, d.nombre, d.motivo]));

  const porMotivo = {};
  for (const d of descartados) porMotivo[d.motivo] = (porMotivo[d.motivo] || 0) + 1;

  if (porDia > 0) {
    let n = 1;
    for (let i = 0; i < validos.length; i += porDia, n++) {
      const lote = validos.slice(i, i + porDia);
      writeCSV(path.join(salidaDir, `destinatarios_dia${n}.csv`),
        ['email', 'nombre', 'pedidos', 'gasto'],
        lote.map((v) => [v.email, v.nombre, v.pedidos, v.gasto]));
    }
    console.log(`Lotes por día: ${Math.ceil(validos.length / porDia)} archivos (destinatarios_diaN.csv)`);
  }

  const total = filas.length - 1;
  console.log('--- Reporte de limpieza ---');
  console.log(`Entrada:            ${total} filas`);
  console.log(`Válidos para envío: ${validos.length}`);
  console.log(`Descartados:        ${descartados.length}`);
  for (const [motivo, cantidad] of Object.entries(porMotivo).sort((a, b) => b[1] - a[1])) {
    console.log(`  - ${motivo}: ${cantidad}`);
  }
  console.log(`Salida limpia:      ${salidaLimpio}`);
  console.log(`Descartados:        ${salidaDesc}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
