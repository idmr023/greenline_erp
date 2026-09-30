/**
 * Utilidades de bytes — Bóveda Segura V5.
 *
 * Regla de §15.1/R50: el material derivado y el plaintext viajan como
 * Uint8Array y sólo se convierten a string en el último momento.
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: false });

/** CSPRNG del navegador/Node. Nunca usar Math.random para nada criptográfico. */
export function bytesAleatorios(longitud) {
  if (!Number.isInteger(longitud) || longitud <= 0) {
    throw new Error('longitud de bytes inválida');
  }
  const bytes = new Uint8Array(longitud);
  crypto.getRandomValues(bytes);
  return bytes;
}

export function utf8(texto) {
  return encoder.encode(String(texto ?? ''));
}

export function desdeUtf8(bytes) {
  return decoder.decode(bytes);
}

/** Sobreescribe el material (§15.1/R51): mejora, no garantía de borrado. */
export function borrar(bytes) {
  if (bytes instanceof Uint8Array) bytes.fill(0);
}

export function concatenar(...arrays) {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const salida = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    salida.set(a, offset);
    offset += a.length;
  }
  return salida;
}

/**
 * Comparación en tiempo constante. WebCrypto ya valida el tag de GCM, pero
 * la usamos para los MAC de confirmación de clave (§5.3).
 */
export function igualdadConstante(a, b) {
  if (!(a instanceof Uint8Array) || !(b instanceof Uint8Array)) return false;
  if (a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i += 1) dif |= a[i] ^ b[i];
  return dif === 0;
}

function aLatin1(bytes) {
  let s = '';
  const TROZO = 0x8000;
  for (let i = 0; i < bytes.length; i += TROZO) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + TROZO));
  }
  return s;
}

export function aBase64(bytes) {
  return btoa(aLatin1(bytes));
}

export function desdeBase64(texto) {
  const binario = atob(texto);
  const salida = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i += 1) salida[i] = binario.charCodeAt(i);
  return salida;
}

/** Base64 URL-safe sin relleno: la forma que viaja en JSON y en URLs. */
export function aBase64Url(bytes) {
  return aBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function desdeBase64Url(texto) {
  const relleno = '='.repeat((4 - (texto.length % 4)) % 4);
  const normalizado = texto.replace(/-/g, '+').replace(/_/g, '/') + relleno;
  return desdeBase64(normalizado);
}

/** Devuelve Uint8Array desde string/Uint8Array/array de números. */
export function aBytes(valor, nombre = 'valor') {
  if (valor instanceof Uint8Array) return valor;
  if (ArrayBuffer.isView(valor)) {
    return new Uint8Array(valor.buffer, valor.byteOffset, valor.byteLength);
  }
  if (valor instanceof ArrayBuffer) return new Uint8Array(valor);
  throw new Error(`${nombre} debe ser un Uint8Array`);
}
