import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const root = path.dirname(fileURLToPath(import.meta.url));

/** Quita comillas envolventes: `.env` admite VITE_X="https://..." */
function limpiar(valor) {
  return String(valor ?? '').trim().replace(/^["']|["']$/g, '');
}

/** Devuelve el origin (protocolo+host+puerto) de una URL, o null. */
function origen(valor) {
  const limpio = limpiar(valor);
  if (!limpio) return null;
  try {
    return new URL(limpio).origin;
  } catch {
    return null;
  }
}

function hostWildcard(valor) {
  const limpio = limpiar(valor);
  if (!limpio) return null;
  try {
    const u = new URL(limpio);
    // https://xxxx.supabase.co -> https://*.supabase.co
    const partes = u.hostname.split('.');
    if (partes.length >= 2) {
      partes[0] = '*';
      return `${u.protocol}//${partes.join('.')}`;
    }
    return u.origin;
  } catch {
    return null;
  }
}

/**
 * CSP construida en tiempo de build con los orígenes reales del entorno
 * (Bóveda Segura V5 §16 / R57). `connect-src` sale de VITE_API_URL, que
 * no puede fijarse en vercel.json porque cambia por entorno.
 *
 * Se inyecta como <meta> porque la SPA es estática: Vercel no puede
 * generar nonces. `frame-ancestors` no se admite en meta, así que ese
 * control va en las cabeceras de vercel.json (X-Frame-Options).
 */
function construirCSP(env, esDev) {
  const api = origen(env.VITE_API_URL);
  const supabase = origen(env.VITE_SUPABASE_URL);
  const supabaseWildcard = hostWildcard(env.VITE_SUPABASE_URL);
  const site = origen(env.VITE_SITE_URL);
  const assets = origen(env.VITE_ASSETS_URL) || site;
  const sentry = origen(env.VITE_SENTRY_DSN);

  const connect = new Set(["'self'"]);
  if (api) connect.add(api);
  if (supabase) connect.add(supabase);
  if (supabaseWildcard) connect.add(supabaseWildcard);
  if (sentry) connect.add(sentry);
  if (esDev) connect.add('ws:').add('wss:');

  const img = new Set(["'self'", 'data:', 'blob:', 'https:']);
  if (assets) img.add(assets);
  if (site && site !== assets) img.add(site);

  const style = new Set(["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com']);
  const font = new Set(["'self'", 'https://fonts.gstatic.com', 'data:']);

  // El preamble de HMR de @vitejs/plugin-react es un <script> inline sólo
  // en dev; en build no debe existir ninguno (se verifica en CI).
  const script = esDev ? new Set(["'self'", "'unsafe-inline'"]) : new Set(["'self'"]);

  return [
    `default-src 'self'`,
    `script-src ${[...script].join(' ')}`,
    `style-src ${[...style].join(' ')}`,
    `font-src ${[...font].join(' ')}`,
    `img-src ${[...img].join(' ')}`,
    `connect-src ${[...connect].join(' ')}`,
    `media-src 'self'`,
    `object-src 'none'`,
    `frame-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    // Web Worker dedicado a Argon2id/HKDF/AES (V5 §5.1, §15.1).
    `worker-src 'self' blob:`,
    `manifest-src 'self'`,
    `frame-ancestors 'none'`,
  ].join('; ');
}

/**
 * Comprueba en build que el HTML no lleva <script> inline: si lo llevara,
 * rompería `script-src 'self'` en producción.
 */
function revisarScriptsInline(html) {
  const conInline = html.match(/<script\b[^>]*>([\s\S]*?)<\/script>/gi) || [];
  const malos = conInline.filter((t) => !/\bsrc\s*=/i.test(t));
  if (malos.length) {
    throw new Error(
      `[csp] index.html contiene ${malos.length} <script> sin src: rompería script-src 'self'.\n` +
        malos.map((t) => `  ${t.slice(0, 160)}`).join('\n'),
    );
  }
}

function csp(env, esDev) {
  return {
    name: 'greenline-csp',
    transformIndexHtml(html) {
      const politica = construirCSP(env, esDev);
      if (!esDev) revisarScriptsInline(html);
      return {
        html,
        tags: [
          {
            tag: 'meta',
            attrs: { 'http-equiv': 'Content-Security-Policy', content: politica },
            injectTo: 'head-prepend',
          },
        ],
      };
    },
  };
}

export default defineConfig(({ mode }) => {
  // Vercel/CI inyectan VITE_* por process.env; en local mandan los .env.
  const envDeProceso = {};
  for (const [clave, valor] of Object.entries(process.env)) {
    if (clave.startsWith('VITE_') && valor !== undefined) envDeProceso[clave] = valor;
  }
  const env = { ...loadEnv(mode, root, ''), ...envDeProceso };
  const esDev = mode !== 'production';

  return {
    root,
    plugins: [react(), tailwindcss(), csp(env, esDev)],
    resolve: {
      alias: {
        '@': path.resolve(root, 'src'),
      },
    },
    server: {
      fs: {
        // /fase-2-implementacion importa un .md con ?raw desde docs/ (raíz del repo)
        allow: [path.resolve(root, '..')],
      },
    },
    build: {
      target: 'es2020',
      sourcemap: false,
      chunkSizeWarningLimit: 700,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            if (id.includes('react-dom') || id.includes(`${path.sep}react${path.sep}`)) return 'vendor-react';
            if (id.includes('react-router')) return 'vendor-router';
            if (id.includes('@supabase')) return 'vendor-supabase';
            if (id.includes('@fortawesome')) return 'vendor-icons';
            if (id.includes('@tiptap')) return 'vendor-tiptap';
            return 'vendor';
          },
        },
      },
    },
  };
});
