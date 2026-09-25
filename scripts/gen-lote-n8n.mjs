#!/usr/bin/env node
/**
 * Genera la lista embebida (DESTINATARIOS) de un workflow n8n de email
 * marketing a partir de un CSV de destinatarios, aplicando limpieza.
 *
 * Uso:
 *   node scripts/gen-lote-n8n.mjs [opciones]
 *
 * Opciones:
 *   --archivo=<csv>     CSV de entrada (por defecto docs/emails/destinatarios_dia1.csv)
 *   --workflow=<json>   Workflow n8n a leer. Si se omite se buscan, en este orden:
 *                       <raíz>/  ·  <raíz>/../  ·  <raíz>/../greenline/  ·
 *                       <raíz>/../../greenline/
 *                       con nombre "Batch Worker - Email Marketing con Resend (1).json"
 *                       (ese fichero vive en el repo del sitio público, no aquí)
 *   --desde=<n>         Saltar las primeras n filas de datos ya enviadas
 *                       (por defecto 49 -> el lote arranca en la fila 50)
 *   --limite=<n>        Máximo a incluir en el lote (0 = todos, por defecto)
 *   --salida=<json>     Ruta de salida. Si se omite se sobrescribe --workflow,
 *                       SALVO que ese fichero esté fuera de este repo: entonces
 *                       es obligatorio (no tocamos el repo hermano sin pedirlo).
 *
 * El resto del workflow (nodos, conexiones, credenciales, HTML, remitente,
 * Split In Batches, Wait) se conserva intacto: solo se reescribe el jsCode
 * del nodo "Prepare Email Payloads".
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

const DESECHABLES = new Set([
  'mailinator.com', 'mailinator.net', '10minutemail.com', '10minutemail.net',
  'guerrillamail.com', 'guerrillamail.info', 'guerrillamail.org',
  'tempmail.com', 'temp-mail.org', 'tempmailo.com', 'tempmail.io',
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

// Cuentas de prueba / basura detectadas en la campaña de aniversario.
const PRUEBA_LOCAL = new Set([
  'idmr_02', 'sadsadsad', 'asdsad', 'sadasdsad', 'nejfkfkf',
  'jparatupcya', 'peruvianecsom',
]);
const PRUEBA_EMAIL = new Set(['juan@gmail.com']);

const EMAIL_RE = /^[^\s@,;<>"]+@[^\s@,;<>".]+\.[^\s@,;<>".]{2,}$/;

function normalizarHeader(s) {
  return String(s || '')
    .replace(/^\uFEFF/g, '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function parseCSV(text) {
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
    } else if (c === ',') {
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

function clasificarEmail(emailRaw) {
  const email = String(emailRaw || '').trim();
  if (!email) return { motivo: 'formato_invalido' };
  if (!EMAIL_RE.test(email)) return { motivo: 'formato_invalido' };

  const [local, dominio] = email.toLowerCase().split('@');
  if (DESECHABLES.has(dominio)) return { motivo: 'desechable' };
  if (FALSO_DOMINIO.has(dominio)) return { motivo: 'falso_obvio' };
  if (PRUEBA_EMAIL.has(email.toLowerCase())) return { motivo: 'prueba' };

  const localLimpio = local.replace(/[._-]/g, '');
  if (ROL_LOCAL.has(local) || ROL_LOCAL.has(localLimpio)) return { motivo: 'rol_o_test' };
  if (FALSO_LOCAL.has(local) || FALSO_LOCAL.has(localLimpio)) return { motivo: 'falso_obvio' };
  if (PRUEBA_LOCAL.has(local) || PRUEBA_LOCAL.has(localLimpio)) return { motivo: 'prueba' };
  if (local.length < 3) return { motivo: 'falso_obvio' };
  if (/^(.)\1+$/.test(localLimpio)) return { motivo: 'falso_obvio' };

  return { email };
}

function construirJsCode(destinatarios, meta) {
  const filas = destinatarios.map((d) =>
    `  { "email": ${JSON.stringify(d.email)}, "nombre": ${JSON.stringify(d.nombre)} }`).join(',\n');

  return [
    `// Lista embebida: ${meta.archivo} ${meta.rango}`,
    `// Generada con scripts/gen-lote-n8n.mjs el ${meta.fecha}.`,
    '// Si cambia la lista, vuelve a correr el script (no editar a mano).',
    'const DESTINATARIOS = [',
    filas,
    '];',
    '',
    `const LIMITE = ${meta.limite}; // 0 = todos los de la lista`,
    '',
    'const items = DESTINATARIOS',
    '  .slice(0, LIMITE > 0 ? LIMITE : DESTINATARIOS.length)',
    "  .map((d) => ({ json: { email: d.email, nombre: d.nombre } }));",
    '',
    "console.log('Destinatarios en este lote:', items.length);",
    'return items;',
    '',
  ].join('\n');
}

function mostrarUso() {
  console.log('Uso: node scripts/gen-lote-n8n.mjs [--archivo=<csv>] [--workflow=<json>] [--desde=<n>] [--limite=<n>] --salida=<json>');
  console.log('Nota: --salida es obligatoria cuando el workflow está fuera de este repo.');
  process.exit(1);
}

function main() {
  // El workflow de n8n vive en el repo del sitio público, no aquí. Se prueban
  // los layouts habituales; si no está ninguno, se pide --workflow=<ruta>.
  const WF_NOMBRE = 'Batch Worker - Email Marketing con Resend (1).json';
  const WF_CANDIDATAS = [
    path.resolve(ROOT, WF_NOMBRE),                         // layout unido (ERP en la raíz del sitio)
    path.resolve(ROOT, '..', WF_NOMBRE),                   // ERP dentro del sitio (greenline/ERP)
    path.resolve(ROOT, '..', 'greenline', WF_NOMBRE),      // hermanos dentro de la misma carpeta
    path.resolve(ROOT, '..', '..', 'greenline', WF_NOMBRE),// Desktop/greenline_erp + perfil/greenline
  ];
  let archivo = path.join(ROOT, 'docs', 'emails', 'destinatarios_dia1.csv');
  let workflow = WF_CANDIDATAS[0];
  let workflowFijo = false;
  let salida = null;
  let desde = 49;
  let limite = 0;

  for (const a of process.argv.slice(2)) {
    if (a.startsWith('--archivo=')) archivo = path.resolve(a.slice('--archivo='.length));
    else if (a.startsWith('--workflow=')) { workflow = path.resolve(a.slice('--workflow='.length)); workflowFijo = true; }
    else if (a.startsWith('--salida=')) salida = path.resolve(a.slice('--salida='.length));
    else if (a.startsWith('--desde=')) desde = Number(a.slice('--desde='.length)) || 0;
    else if (a.startsWith('--limite=')) limite = Number(a.slice('--limite='.length)) || 0;
    else { console.warn(`Aviso: opción ignorada ${a}`); }
  }
  if (!workflowFijo) {
    const hit = WF_CANDIDATAS.find((c) => fs.existsSync(c));
    if (hit) workflow = hit;
  }
  const destino = salida || workflow;

  if (!fs.existsSync(archivo)) { console.error(`No existe el CSV: ${archivo}`); process.exit(1); }
  if (!fs.existsSync(workflow)) {
    console.error('No encuentro el workflow de n8n. Busqué en:');
    for (const c of WF_CANDIDATAS) console.error(`  - ${c}`);
    console.error('Pásalo explícitamente con: --workflow=<ruta-al-json-de-n8n>');
    process.exit(1);
  }
  // El workflow resuelto casi siempre vive en el repo hermano: no lo
  // sobrescribimos sin que lo pidas (los dos repos se desarrollan en paralelo).
  if (!salida && !destino.startsWith(ROOT + path.sep)) {
    console.error(`El workflow está fuera de este repo: ${destino}`);
    console.error('No lo sobrescribo por defecto. Indica el destino con:');
    console.error('  --salida=<ruta-de-salida.json>');
    process.exit(1);
  }

  const raw = fs.readFileSync(archivo, 'utf8').replace(/^\uFEFF/, '');
  const filas = parseCSV(raw);
  if (filas.length < 2) { console.error('El CSV no tiene filas de datos.'); process.exit(1); }

  const headers = filas[0].map(normalizarHeader);
  const idxEmail = headers.findIndex((h) =>
    h.includes('correo electr') || h === 'email' || h === 'e-mail' || h === 'correo');
  const idxNombre = headers.findIndex((h) =>
    h === 'nombre' || h === 'nombre de usuario' || h === 'username' || h.includes('nombre'));
  if (idxEmail < 0) { console.error('No se encontró la columna de email.'); process.exit(1); }

  // Filas de datos en bruto (sin cabeceras): el corte de tanda se hace AQUÍ,
  // porque lo ya enviado fueron filas crudas del CSV (incluidas cuentas de
  // prueba); limpiar antes desplazaría el inicio del lote.
  const datos = [];
  let cabeceras = 0;
  for (let i = 1; i < filas.length; i++) {
    const fila = filas[i];
    const emailPrimero = String(fila[0] || '').trim().toLowerCase();
    if (emailPrimero === 'email' || normalizarHeader(fila[idxEmail]) === 'email') { cabeceras++; continue; }
    datos.push(fila);
  }

  const porDespedir = datos.slice(desde);

  const reales = [];
  const descartados = [];
  for (const fila of porDespedir) {
    const cl = clasificarEmail(fila[idxEmail]);
    if (cl.motivo) { descartados.push({ email: String(fila[idxEmail] || '').trim(), motivo: cl.motivo }); continue; }
    reales.push({ email: cl.email, nombre: (idxNombre >= 0 ? fila[idxNombre] : '') || '' });
  }

  const vistos = new Set();
  const unicos = [];
  let duplicados = 0;
  for (const r of reales) {
    const k = r.email.toLowerCase();
    if (vistos.has(k)) { duplicados++; continue; }
    vistos.add(k);
    unicos.push(r);
  }

  const lote = limite > 0 ? unicos.slice(0, limite) : unicos;
  if (!lote.length) { console.error('El lote quedó vacío: revisa --desde / --limite.'); process.exit(1); }

  const wf = JSON.parse(fs.readFileSync(workflow, 'utf8'));
  const nodo = (wf.nodes || []).find((n) => n.name === 'Prepare Email Payloads');
  if (!nodo) { console.error('El workflow no tiene el nodo "Prepare Email Payloads".'); process.exit(1); }

  nodo.parameters.jsCode = construirJsCode(lote, {
    archivo: path.relative(ROOT, archivo).replaceAll('\\', '/'),
    rango: `filas de datos ${desde + 1}..${datos.length}, tanda siguiente`,
    fecha: new Date().toISOString().slice(0, 10),
    limite,
  });

  fs.writeFileSync(destino, JSON.stringify(wf, null, 2) + '\n', 'utf8');

  console.log('--- Generación de lote n8n ---');
  console.log(`CSV:                 ${path.relative(ROOT, archivo).replaceAll('\\', '/')}`);
  console.log(`Cabeceras saltadas:  ${cabeceras}`);
  console.log(`Filas de datos:      ${datos.length} (se saltan las ${desde} ya enviadas)`);
  console.log(`A revisar:           ${porDespedir.length}`);
  console.log(`Descartados:         ${descartados.length}`);
  for (const [motivo, n] of Object.entries(descartados.reduce((acc, d) => {
    acc[d.motivo] = (acc[d.motivo] || 0) + 1; return acc;
  }, {})).sort((a, b) => b[1] - a[1])) {
    console.log(`  - ${motivo}: ${n}`);
  }
  console.log(`Duplicados saltados: ${duplicados}`);
  console.log(`Lote embebido:       ${lote.length}`);
  console.log(`Primero:             ${lote[0].email}`);
  console.log(`Último:              ${lote[lote.length - 1].email}`);
  console.log(`Workflow:            ${path.relative(ROOT, destino).replaceAll('\\', '/')}`);
}

main();
