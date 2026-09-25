import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const htmlPath = path.resolve(__dirname, '..', 'docs', 'Propuesta_CEO', 'presentacion-ceo.html');
const outPath = path.resolve(__dirname, '..', 'docs', 'Propuesta_CEO', 'presentacion-ceo.pdf');

// Puppeteer descarga un Chromium de ~150MB en su postinstall, así que no va
// en devDependencies (ralentiza el build de Vercel a cambio de una utilidad
// puntual). Se carga en diferido para que el error sea accionable.
if (!fs.existsSync(htmlPath)) {
  console.error(`No existe la plantilla: ${htmlPath}`);
  process.exit(1);
}

let puppeteer;
try {
  ({ default: puppeteer } = await import('puppeteer'));
} catch {
  console.error('Falta puppeteer. Instálalo sólo cuando vayas a regenerar el PDF:');
  console.error('  npm i -D puppeteer   (sólo local; no lo subas a package.json)');
  process.exit(1);
}

const browser = await puppeteer.launch();
try {
  const page = await browser.newPage();
  await page.goto(`file://${htmlPath.replace(/\\/g, '/')}`, {
    waitUntil: 'networkidle0',
    timeout: 60000,
  });

  await page.pdf({
    path: outPath,
    format: 'A4',
    landscape: true,
    printBackground: true,
    margin: { top: '0', right: '0', bottom: '0', left: '0' },
    preferCSSPageSize: true,
  });

  console.log(`PDF generado: ${outPath}`);
} finally {
  await browser.close();
}
