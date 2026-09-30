import DOMPurify from 'dompurify';

/**
 * Sanitizado de HTML de usuario (Bóveda Segura V5 §16 / R60).
 *
 * Todo string que vaya a terminar en `innerHTML`, `dangerouslySetInnerHTML`
 * o en un `contentEditable` DEBE pasar por aquí. No existe ninguna otra
 * vía permitida en este repo.
 *
 * Reglas:
 *  - allowlist de etiquetas (nada que ejecute script ni cargue recursos activos);
 *  - allowlist de atributos (la por defecto de DOMPurify) + data-*;
 *  - enlaces con esquema peligroso eliminados y `rel` forzado en target _blank;
 *  - el sanitizado es SIEMPRE la última transformación antes del render.
 */

const ALLOWED_TAGS = [
  // estructura
  'p', 'br', 'hr', 'div', 'span',
  // títulos
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  // formato en línea
  'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'sub', 'sup', 'mark', 'small',
  // listas y citas
  'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'blockquote', 'pre', 'code',
  // enlaces
  'a',
  // imagen
  'img', 'figure', 'figcaption',
  // tablas
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption',
];

/**
 * Refuerzo explícito sobre la allowlist por defecto de DOMPurify.
 * Ninguna de estas etiquetas es necesaria en el contenido del blog y todas
 * han sido vector de mXSS o de ejecución remota en el pasado.
 */
const FORBID_TAGS = [
  'script', 'style', 'iframe', 'frame', 'frameset', 'object', 'embed',
  'applet', 'link', 'meta', 'base', 'title', 'template', 'noscript',
  'form', 'input', 'button', 'select', 'textarea', 'option', 'label',
  'svg', 'math', 'canvas', 'audio', 'video', 'source', 'picture', 'track',
  'marquee', 'portal',
];

const FORBID_ATTR = [
  'formaction', 'action', 'ping', 'background', 'srcset', 'imagesrcset',
  'xlink:href', 'xmlns', 'poster', 'dynsrc', 'lowsrc',
];

/** Esquemas que jamás deben aparecer en href/src. */
const ESQUEMA_PELIGROSO = /^\s*(javascript|vbscript|data|blob|file|about|livescript|mocha):/i;
const ESQUEMA_DATA_IMG = /^data:image\/(png|jpe?g|gif|webp|avif|svg\+xml|bmp);/i;

function depurarEnlace(node) {
  if (node.tagName !== 'A') return;
  const href = node.getAttribute('href');
  if (!href) {
    node.removeAttribute('href');
    return;
  }
  const limpio = href.trim();
  // data: sólo se tolera para imágenes; nunca en enlaces.
  if (ESQUEMA_PELIGROSO.test(limpio) || ESQUEMA_DATA_IMG.test(limpio)) {
    node.removeAttribute('href');
    return;
  }
  if (node.getAttribute('target') === '_blank') {
    node.setAttribute('rel', 'noopener noreferrer');
    node.setAttribute('referrerpolicy', 'no-referrer');
  }
}

function depurarImagen(node) {
  if (node.tagName !== 'IMG') return;
  const src = (node.getAttribute('src') || '').trim();
  if (!src) {
    node.removeAttribute('src');
    return;
  }
  const esRelativa = src.startsWith('/') || src.startsWith('#') || src.startsWith('?');
  const esAbsolutaPermitida = /^https?:\/\//i.test(src);
  if (!esRelativa && !esAbsolutaPermitida && !ESQUEMA_DATA_IMG.test(src)) {
    node.removeAttribute('src');
    return;
  }
  // Sin handlers: DOMPurify ya los elimina, esto es defensa en profundidad.
  node.removeAttribute('onerror');
  node.removeAttribute('onload');
}

let hooksInstalados = false;

function instalarHooks() {
  if (hooksInstalados) return;
  hooksInstalados = true;
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    depurarEnlace(node);
    depurarImagen(node);
  });
}

instalarHooks();

/**
 * Devuelve HTML seguro para inyectar en el DOM.
 *
 * @param {unknown} html
 * @returns {string}
 */
export function sanitizeHtml(html) {
  if (typeof html !== 'string' || html === '') return '';

  // Fail-closed: sin DOM no podemos garantizar nada, y preferimos no
  // renderizar nada a renderizar HTML sin sanitizar.
  if (typeof window === 'undefined' || typeof document === 'undefined') return '';

  try {
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS,
      FORBID_TAGS,
      FORBID_ATTR,
      ALLOW_DATA_ATTR: true,
      ALLOW_ARIA_ATTR: true,
      ALLOW_UNKNOWN_PROTOCOLS: false,
      KEEP_CONTENT: true,
      RETURN_DOM: false,
      RETURN_DOM_FRAGMENT: false,
      SAFE_FOR_XML: true,
    });
  } catch {
    // Cualquier fallo de la sanitización deja el contenido fuera.
    return '';
  }
}

export default sanitizeHtml;
