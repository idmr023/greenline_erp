/**
 * Parámetros criptográficos versionados — Bóveda Segura V5.
 *
 * §5.1 (Argon2id mínimo), §5.2 (domain separation), §8 (AAD), §8.1 (campos
 * canónicos), §8.2 (techo de items por DEK), §8.3 (anti-replay).
 *
 * TODO valor de este archivo es una constante pública: no oculta nada y no
 * puede sustituirse en runtime sin cambiar también `VERSION_CRYPTO`.
 */

/** Prefijo de dominio de todo lo que producimos. Aparece en el AAD. */
export const FORMATO = 'GLV5';

/** Versión del esquema de datos criptográfico (§11). */
export const VERSION_CRYPTO = 1;

/** Versión de los parámetros KDF; se almacena junto a la bóveda (§5.1). */
export const VERSION_KDF = 1;

/**
 * Argon2id. Objetivo V5 §5.1 — 64 MiB, t=3, p=4.
 *
 * Nota sobre el coste: `@noble/hashes` es JavaScript puro (sin WASM), así
 * que esta derivación bloquea el hilo ~1,3 s. Por eso §15.1/R52 exige
 * ejecutarla en un Web Worker y por eso `MINIMOS_ARGON2` no es negociable.
 */
export const ARGON2 = Object.freeze({
  nombre: 'argon2id',
  m: 65536, // KiB = 64 MiB
  t: 3,
  p: 4,
  dkLen: 64,
  saltBytes: 16,
});

/** Suelo absoluto de §5.1 (OWASP). Por debajo, el módulo se niega a derivar. */
export const MINIMOS_ARGON2 = Object.freeze({ m: 19456, t: 2, p: 1 });

/**
 * Etiquetas de domain separation (§5.2). Están en el repo a propósito:
 * el compromiso de una clave derivada no revela ninguna otra.
 */
export const ETIQUETAS = Object.freeze({
  auth: 'greenline-vault/v1/auth',
  kek: 'greenline-vault/v1/kek',
  recuperacion: 'greenline-vault/v1/recuperacion',
  exportacion: 'greenline-vault/v1/exportacion',
  confirmacion: 'greenline-vault/v1/confirmacion',
  /**
   * §25.3 R105 — etiqueta EXACTA que exige la spec para derivar la KEK de
   * recuperación a partir de la recovery key generada en cliente.
   * Es distinta de `recuperacion` (que es la rama de la maestra): el
   * compromiso de una no revela la otra.
   */
  claveRecuperacion: 'greenline-vault/v1/recovery',
  /**
   * §26 (Fase 5.1) — domain separation del HKDF que convierte el ECDH de
   * una compartición en la clave que envuelve la content key. Comprometer
   * esa rama no revela la KEK, la DEK ni la de exportación.
   */
  comparticion: 'greenline-vault/v1/comparticion',
});

/**
 * Cifrado autenticado (§8).
 * `nonceBytes: 12` es el IV de 96 bits que exige GCM sin riesgo de
 * colisión bajo el techo de `MAX_ITEMS_POR_DEK`.
 */
export const AEAD = Object.freeze({
  nombre: 'AES-256-GCM',
  algId: 'A256GCM',
  nonceBytes: 12,
  tagBytes: 16,
  claveBytes: 32,
});

/** Lista blanca de algoritmos (R21): cualquier otro se rechaza. */
export const ALGORITMOS_PERMITIDOS = Object.freeze(new Set([AEAD.algId]));

/**
 * §8.2 — techo de items por clave de datos con AES-GCM e IV aleatorio de
 * 96 bits. Al alcanzarlo, rotación obligatoria de DEK.
 */
export const MAX_ITEMS_POR_DEK = 100000;

/**
 * Campos del AAD, en ORDEN FIJO (§8.1 R14). Se serializan como array JSON
 * para que ningún carácter de un valor pueda alterar la estructura.
 *
 * Cambiar este orden rompe el descifrado de todo lo almacenado: es un
 * cambio de `VERSION_CRYPTO`, no un refactoring.
 */
export const CAMPOS_AAD = Object.freeze([
  'formato',
  'vaultId',
  'itemId',
  'ownerId',
  'tenantId',
  'revision',
  'keyVersion',
  'algorithm',
  'nonce',
]);

/** Campos que autentican el envoltorio de una DEK (§7 R10). */
export const CAMPOS_AAD_ENVOLTURA = Object.freeze([
  'formato',
  'tipo',
  'vaultId',
  'keyVersion',
  'proposito',
  'algorithm',
  'nonce',
]);

// ---------------------------------------------------------------------------
// §25 Recuperación
// ---------------------------------------------------------------------------

/** Longitud de la recovery key: 256 bits de CSPRNG (§25.3 R105). */
export const LONGITUD_RECOVERY_KEY = 32;

/**
 * §25.3 R106 — cada DEK vigente se reenvuelve bajo la KEK de recuperación
 * con `proposito='recuperacion'` y su MISMO `key_version`. Como la
 * unicidad es `(vault_id, key_version, proposito)`, la envoltura de
 * recuperación convive con la normal sin pisarse, y el propósito va dentro
 * del AAD: intercambiarlas hace fallar el descifrado (§7 R10).
 */

// ---------------------------------------------------------------------------
// §28 Exportación cifrada
// ---------------------------------------------------------------------------

/** Formato de export de §28.1. */
export const FORMATO_EXPORT = 'GL-VAULT-EXPORT';
export const VERSION_EXPORT = 1;

/**
 * §28.3 R125 — techo de exportaciones por hora. La comprobación es de
 * cliente (consulta la auditoría) y por tanto disuasoria: el registro
 * sigue siendo la garantía, no el contador.
 */
export const MAX_EXPORTS_POR_HORA = 3;

/**
 * §52 «Rate limit en reveal/copy/export/step-up» — techo de intentos de
 * step-up por ventana deslizante y por (sub, propósito).
 *
 * Cada intento ejecuta Argon2id (~1,3 s, L14), así que un atacante con
 * sesión abierta ya está limitado por CPU; este límite pone además cota
 * al número de intentos y corta el bucle **antes** de derivar. Es
 * disuasorio como el contador de export: la garantía de verdad sigue
 * siendo la entropía de la maestra (L13).
 */
export const MAX_INTENTOS_STEPUP = 10;
export const VENTANA_STEPUP_MS = 60_000;

/** §28.1 — Argon2id propio de la passphrase de export (R121: nunca la maestra). */
export const ARGON2_EXPORT = Object.freeze({
  nombre: 'argon2id',
  m: 65536,
  t: 3,
  p: 4,
  dkLen: 64,
  saltBytes: 16,
});

/**
 * Campos que autentican el fichero de export (§28.1). Mismo truco que
 * CAMPOS_AAD: array JSON de orden fijo, para que un cambio en cualquier
 * valor obligue a fallar el descifrado en lugar de aceptarlo.
 */
export const CAMPOS_AAD_EXPORT = Object.freeze([
  'formato',
  'formatVersion',
  'vaultId',
  'creadoEn',
  'itemCount',
  'cipher',
]);

// ---------------------------------------------------------------------------
// §26 Compartición por elemento (Fase 5.1)
// ---------------------------------------------------------------------------

/**
 * AAD de la compartición: `tipo` separa el snapshot cifrado de la content
 * key envuelta (misma defensa de propósito que R10), y `emisor`/`receptor`
 * atan cada ciphertext a sus dos identidades: el de A no sirve para B.
 */
export const CAMPOS_AAD_COMPARTICION = Object.freeze([
  'formato',
  'tipo',
  'vaultId',
  'itemId',
  'emisor',
  'receptor',
  'revision',
  'algorithm',
  'nonce',
]);

/**
 * Campos que firma el emisor (§26 R113): todo lo que un receptor o un
 * auditor necesitan para saber QUÉ se compartió, CON QUIÉN y HASTA CUÁNDO.
 *
 * `wrappedKey` y `payloadHash` van serializados en base64url para que ningún
 * byte binario altere la estructura del array JSON (§8.1 R14, mismo criterio
 * que `CAMPOS_AAD`).
 */
export const CAMPOS_COMPARTICION = Object.freeze([
  'formato',
  'formatVersion',
  'vaultId',
  'itemId',
  'emisor',
  'receptor',
  'claveReceptor',
  'claveEfimera',
  'wrappedKey',
  'payloadHash',
  'expiresAt',
]);

/**
 * Subconjunto que alimenta el `info` del HKDF. Se deriva de la lista
 * anterior para que no pueda divergir: el HKDF amarra todo salvo el propio
 * wrappedKey (que se deriva de él), y la firma amarra también ese.
 */
export const CAMPOS_CLAVE_COMPARTICION = Object.freeze(
  CAMPOS_COMPARTICION.filter((campo) => campo !== 'wrappedKey'),
);

/** Prefijo y versión de la compartición firmada (§26). */
export const FORMATO_COMPARTICION = 'GLV5-SHARE';
export const VERSION_COMPARTICION = 1;
