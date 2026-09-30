/**
 * Capa de datos de la bóveda — Bóveda Segura V5 §10, §21, §22, §23.
 *
 * Va directamente a Supabase, igual que el resto de datos del panel
 * (`AdminBlog`, `AdminProductos`): la autorización la impone el RLS de la
 * fila (§20), no el cliente. Aquí SÓLO se mueven ciphertext y metadatos —
 * ningún byte descifrado pasa por este módulo.
 *
 * Esquema (migración única `20260930120000_boveda_segura_v5_completa.sql`
 * en el repo hermano `greenline`):
 *
 *   greenline_vaults        salt + parámetros KDF del propietario
 *   greenline_vault_keys    DEKs envueltas (envelope, §7)
 *   greenline_vault_items   items cifrados + revisión anti-replay (§8.3)
 *   greenline_vault_events  auditoría append-only sin secretos (§23)
 */

import { supabase } from '../supabase';
import { aBase64Url, desdeBase64Url } from './random';
import { ARGON2 } from './params';

export const TABLAS = Object.freeze({
  bovedas: 'greenline_vaults',
  claves: 'greenline_vault_keys',
  items: 'greenline_vault_items',
  eventos: 'greenline_vault_events',
  // --- Fase 5.1 (§6.2, §26) ---
  clavesPar: 'greenline_vault_user_keys',
  pubs: 'greenline_vault_user_pubs',
  shares: 'greenline_vault_shares',
  // --- Equipo (§40): catálogo de categorías de la bóveda ---
  categorias: 'boveda_categorias',
});

/** Errores que la UI debe tratar como «la migración no está aplicada». */
export class ErrorSinMigracion extends Error {
  constructor(tabla) {
    super(
      `La tabla «${tabla}» no existe todavía en Supabase. ` +
        'Aplica la migración de bóveda en el repo hermano (supabase/migrations).',
    );
    this.name = 'ErrorSinMigracion';
    this.tabla = tabla;
  }
}

export class ErrorRls extends Error {
  constructor(mensaje = 'RLS denegó la operación sobre la bóveda') {
    super(mensaje);
    this.name = 'ErrorRls';
  }
}

function traducir(error, tabla) {
  const codigo = error?.code || '';
  const texto = String(error?.message || '');
  if (codigo === 'PGRST205' || /does not exist|no existe|schema cache/i.test(texto)) {
    return new ErrorSinMigracion(tabla);
  }
  if (codigo === '42501' || codigo === 'PGRST301' || /row-level security|permission denied/i.test(texto)) {
    return new ErrorRls(texto);
  }
  return new Error(texto || 'Error de la bóveda');
}

async function consultar(tabla, operacion) {
  const { data, error } = await operacion();
  if (error) throw traducir(error, tabla);
  return data;
}

function aTexto(bytes) {
  return aBase64Url(bytes);
}

function aBytes(texto) {
  return desdeBase64Url(texto);
}

/** Reconstruye una envoltura almacenada (item o clave) a su forma en memoria. */
function envolturaDeFila(fila) {
  return {
    algorithm: fila.algorithm,
    nonce: aBytes(fila.nonce),
    ciphertext: aBytes(fila.ciphertext),
    tag: aBytes(fila.tag),
  };
}

function filaDeEnvoltura(envoltura) {
  return {
    algorithm: envoltura.algorithm,
    nonce: aTexto(envoltura.nonce),
    ciphertext: aTexto(envoltura.ciphertext),
    tag: aTexto(envoltura.tag),
  };
}

/**
 * `auth.uid()` de la sesión de Supabase. Es el `owner_id` del AAD (§8.1)
 * y el que exigen las políticas RLS (§20): el cliente no puede inventarlo.
 */
export async function obtenerOwnerId() {
  const { data } = await supabase.auth.getSession();
  const id = data?.session?.user?.id;
  if (!id) {
    throw new ErrorRls('No hay sesión de Supabase activa: la bóveda necesita auth.uid().');
  }
  return id;
}

/**
 * §10 — bootstrap: parámetros de derivación, envoltorio de la DEK e items.
 * Todo llega cifrado; el descifrado ocurre en el worker (§9).
 *
 * Se piden las envolturas `proposito='dek'` (vigentes) y, aparte, las
 * `dek_previa` de §27 R117, que sólo existen durante la ventana de
 * migración tras un cambio de maestra.
 *
 * @returns {Promise<{boveda:object, propiaSinClave:boolean, propiaId:string|null, propiaReparable:boolean, clave:object|null, claves:Array, clavesPrevias:Array, items:Array, salt:Uint8Array|null}>}
 */
export async function cargarBoveda() {
  // Con bóvedas de equipo el RLS devuelve varias filas (la propia y las
  // donde soy miembro): elegir con `limit(1)` era arbitrario y podía no
  // coincidir con los items/claves de abajo. La propia tiene prioridad.
  let uid = null;
  try {
    uid = await obtenerOwnerId();
  } catch {
    // Sin sesión Supabase: las consultas de vuelven vacías igualmente.
  }

  const [{ data: bovedas, error: e1 }, { data: claves, error: e2 }, { data: previas, error: e2b }, { data: items, error: e3 }] =
    await Promise.all([
      supabase.from(TABLAS.bovedas).select('*').order('created_at', { ascending: true }),
      supabase.from(TABLAS.claves).select('*').is('revoked_at', null).eq('proposito', 'dek'),
      supabase.from(TABLAS.claves).select('*').is('revoked_at', null).eq('proposito', 'dek_previa'),
      supabase.from(TABLAS.items).select('*').is('deleted_at', null).order('created_at', { ascending: false }),
    ]);

  if (e1) throw traducir(e1, TABLAS.bovedas);
  if (e2) throw traducir(e2, TABLAS.claves);
  if (e2b) throw traducir(e2b, TABLAS.claves);
  if (e3) throw traducir(e3, TABLAS.items);

  const visibles = bovedas || [];

  // Si la propia bóveda no tiene envoltorio de DEK vigente (creación que se
  // cortó a mitad: se insertó la fila y `guardarClave()` falló), elegirla deja
  // el desbloqueo sin salida — `clave` sale null y el panel no puede abrir
  // nada. En ese caso caemos a la primera visible que sí tenga clave; si no
  // hay ninguna, se mantiene la propia para que el aviso apunte a ella.
  const conClave = (v) => (claves || []).some((k) => k.vault_id === v.id);
  const propia = uid ? visibles.find((v) => v.owner_id === uid) : null;
  const propiaSinClave = Boolean(propia) && !conClave(propia);

  // «Reparable» = la propia existe pero no tiene NINGUNA clave (ni de este
  // propósito ni de otro, ni vigente ni revocada: si quedara una envoltura de
  // recuperación el material sigue siendo recuperable) y tampoco ningún item
  // (los borrados lógicos cuentan). Sólo se consulta si hace falta, así el
  // caso sano no paga ninguna petición extra.
  let propiaReparable = false;
  if (propiaSinClave && propia) {
    const [{ count: nClaves, error: eClaves }, { count: nItems, error: eItems }] = await Promise.all([
      supabase.from(TABLAS.claves).select('id', { count: 'exact', head: true }).eq('vault_id', propia.id),
      supabase.from(TABLAS.items).select('id', { count: 'exact', head: true }).eq('vault_id', propia.id),
    ]);
    propiaReparable = !eClaves && !eItems && nClaves === 0 && nItems === 0;
  }
  const boveda =
    (propia && conClave(propia) ? propia : null) ||
    visibles.find(conClave) ||
    propia ||
    visibles[0] ||
    null;
  const delVault = (fila) => Boolean(boveda) && fila.vault_id === boveda.id;
  const clavesVisibles = (claves || []).filter(delVault);
  const previasVisibles = (previas || []).filter(delVault);
  const itemsVisibles = (items || []).filter(delVault);

  const aEnvoltura = (fila) => ({
    keyVersion: fila.key_version,
    envoltura: envolturaDeFila(fila),
    contexto: { vaultId: fila.vault_id, keyVersion: fila.key_version },
  });
  const clavesVigentes = clavesVisibles.map(aEnvoltura).sort((a, b) => a.keyVersion - b.keyVersion);
  const clavesPrevias = previasVisibles.map(aEnvoltura).sort((a, b) => a.keyVersion - b.keyVersion);

  return {
    boveda,
    // La propia existe pero no tiene DEK vigente y se ha usado otra bóveda.
    propiaSinClave,
    // id de la propia (puede no ser la seleccionada) y si está vacía y sin
    // clave, con lo que el panel ofrece «Reparar bóveda» (borrarla).
    propiaId: propia?.id ?? null,
    propiaReparable,
    // auth.uid() del que llama. Permite distinguir en UI si la bóveda es
    // suya (rekey §27 y recovery §25 son de propiedad en RLS).
    yo: uid,
    clave: clavesVigentes[0] || null,
    claves: clavesVigentes,
    clavesPrevias,
    items: itemsVisibles.map((fila) => ({
      id: fila.id,
      vaultId: fila.vault_id,
      revision: fila.revision,
      keyVersion: fila.key_version,
      creado: fila.created_at,
      actualizado: fila.updated_at,
      contexto: {
        vaultId: fila.vault_id,
        itemId: fila.id,
        ownerId: fila.owner_id,
        tenantId: fila.tenant_id,
        revision: fila.revision,
        keyVersion: fila.key_version,
      },
      envoltura: envolturaDeFila(fila),
    })),
    parametros: boveda
      ? {
          nombre: boveda.kdf_name,
          m: boveda.kdf_m,
          t: boveda.kdf_t,
          p: boveda.kdf_p,
          dkLen: boveda.kdf_dklen,
          saltBytes: 16,
          version: boveda.kdf_version,
        }
      : null,
    /**
     * §27 R117 — snapshot de los parámetros ANTERIORES. Un cliente que
     * aún no ha recibido la maestra nueva puede abrir `clavesPrevias`
     * con esto hasta que expire la ventana y se ejecute
     * `revocarClavesPrevias()`.
     */
    parametrosPrevios:
      boveda?.prev_kdf_salt
        ? {
            nombre: boveda.kdf_name,
            m: boveda.prev_kdf_m,
            t: boveda.prev_kdf_t,
            p: boveda.prev_kdf_p,
            dkLen: boveda.prev_kdf_dklen,
            saltBytes: 16,
            version: boveda.kdf_version,
            vence: boveda.prev_kdf_expires_at,
            salt: aBytes(boveda.prev_kdf_salt),
          }
        : null,
    salt: boveda ? aBytes(boveda.kdf_salt) : null,
    bovedaId: boveda?.id ?? null,
    rekeyCount: boveda?.rekey_count ?? 0,
  };
}

/** §22 — crea la bóveda con su DEK recién envuelta (un solo paso atómico de cliente). */
export async function crearBoveda({ id, salt, parametros, envolturaClave, keyVersion = 1 }) {
  const fila = {
    ...(id ? { id } : {}),
    kdf_name: ARGON2.nombre,
    kdf_salt: aTexto(salt),
    kdf_m: parametros.m,
    kdf_t: parametros.t,
    kdf_p: parametros.p,
    kdf_dklen: parametros.dkLen,
    kdf_version: parametros.version ?? 1,
    crypto_version: 1,
  };

  // supabase-js v2 devuelve un OBJETO { data, error }: destructurarlo como
  // array lanza «(intermediate value) is not iterable» DESPUÉS de ejecutarse
  // el INSERT, y eso dejaba bóvedas huérfanas sin su envoltorio de DEK.
  const { data: creada, error } = await supabase
    .from(TABLAS.bovedas)
    .insert(fila)
    .select()
    .single();
  if (error) throw traducir(error, TABLAS.bovedas);

  const idBoveda = creada?.id ?? id;
  try {
    if (!idBoveda) throw new Error('La bóveda se insertó pero no se devolvió su id.');
    await guardarClave(idBoveda, keyVersion, envolturaClave);
  } catch (claveError) {
    // Compensación: una bóveda sin envoltorio no se puede abrir nunca
    // (§22). Si el borrado tampoco llega, queda la reparación manual.
    if (idBoveda) await supabase.from(TABLAS.bovedas).delete().eq('id', idBoveda);
    throw claveError;
  }
  return { boveda: creada, bovedaId: creada.id };
}

/** §7 — guarda una DEK envuelta. `AAD` ya lleva `key_version` (R10). */
export async function guardarClave(vaultId, keyVersion, envoltura) {
  const fila = {
    vault_id: vaultId,
    key_version: keyVersion,
    proposito: 'dek',
    ...filaDeEnvoltura(envoltura),
  };
  return consultar(TABLAS.claves, () =>
    supabase.from(TABLAS.claves).insert(fila).select().single(),
  );
}

/** §10 — alta de item cifrado. */
export async function guardarItem({ vaultId, contexto, envoltura, tipo, categoria = null }) {
  const fila = {
    // §8.1: `itemId` va DENTRO del AAD con el que se cifró. Si la BD
    // asignara otro id, el AAD reconstruido al descifrar no coincidiría y el
    // ítem quedaría cifrado para siempre (ErrorDescifrado).
    id: contexto.itemId,
    vault_id: vaultId,
    owner_id: contexto.ownerId,
    tenant_id: contexto.tenantId,
    revision: contexto.revision,
    key_version: contexto.keyVersion,
    item_type: tipo || null,
    // §40: el RLS de miembros sólo muestra items con categoría asignada.
    // Si no llega, la columna aplica su DEFAULT de BD ('general').
    ...(categoria ? { categoria } : {}),
    ...filaDeEnvoltura(envoltura),
  };
  const creada = await consultar(TABLAS.items, () =>
    supabase.from(TABLAS.items).insert(fila).select().single(),
  );
  return { id: creada.id };
}

/**
 * §8.3 R23 — la revisión sólo puede subir. Se envía el valor esperado en la
 * condición: si otra sesión ya escribió una revisión más alta, no hay filas
 * afectadas y se lanza en lugar de sobrescribir a ciegas.
 */
export async function actualizarItem({ id, contexto, envoltura, tipo, categoria = undefined }) {
  const fila = {
    revision: contexto.revision,
    key_version: contexto.keyVersion,
    item_type: tipo ?? null,
    ...(categoria ? { categoria } : {}),
    ...filaDeEnvoltura(envoltura),
  };
  const { data, error } = await supabase
    .from(TABLAS.items)
    .update(fila)
    .eq('id', id)
    .eq('revision', contexto.revision - 1)
    .select();
  if (error) throw traducir(error, TABLAS.items);
  if (!data || data.length === 0) {
    throw new Error('La revisión del item cambió en el servidor: recarga antes de guardar.');
  }
  return data[0];
}

/** §19 — borrado lógico: el ciphertext histórico sigue para auditoría. */
export async function eliminarItem(id) {
  const { error } = await supabase
    .from(TABLAS.items)
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .is('deleted_at', null);
  if (error) throw traducir(error, TABLAS.items);
}

/**
 * Reparación de una bóveda propia vacía y sin envoltorio de DEK (el estado
 * que deja un `crearBoveda()` interrumpido a mitad de camino).
 *
 * Se niega si existe cualquier fila: una envoltura de otro propósito o ya
 * revocada significa que el material sigue siendo recuperable, y cualquier
 * item (vivo o borrado lógicamente) es material que no se destruye jamás.
 * El RLS sólo permite borrar la propia bóveda (`vault_owner` FOR ALL).
 */
export async function eliminarBovedaPropia(vaultId) {
  const [{ count: nClaves, error: eClaves }, { count: nItems, error: eItems }] = await Promise.all([
    supabase.from(TABLAS.claves).select('id', { count: 'exact', head: true }).eq('vault_id', vaultId),
    supabase.from(TABLAS.items).select('id', { count: 'exact', head: true }).eq('vault_id', vaultId),
  ]);
  if (eClaves) throw traducir(eClaves, TABLAS.claves);
  if (eItems) throw traducir(eItems, TABLAS.items);
  if (nClaves > 0 || nItems > 0) {
    throw new Error('La bóveda tiene claves o items: no se puede reparar borrándola.');
  }
  const { error } = await supabase.from(TABLAS.bovedas).delete().eq('id', vaultId);
  if (error) throw traducir(error, TABLAS.bovedas);
  return true;
}

/**
 * §40 — catálogo de categorías de la bóveda. El nombre es lo único que se
 * muestra en claro (junto a `greenline_vault_items.categoria`); el
 * título/usuario/contraseña siguen cifrados. El mapa rol → categoría lo
 * decide el servidor en el RLS (`boveda_categoria_permitida`).
 */
export async function listarCategorias() {
  const { data, error } = await supabase
    .from(TABLAS.categorias)
    .select('clave, nombre')
    .eq('activa', true)
    .order('nombre');
  if (error) throw traducir(error, TABLAS.categorias);
  return (data || []).map((c) => ({ clave: c.clave, nombre: c.nombre }));
}

/**
 * §23 — auditoría. Sólo IDs y metadatos: jamás un secreto, jamás un
 * plaintext, jamás la maestra (R97 — allowlist, no denylist).
 */
export async function registrarEvento({ evento, vaultId = null, itemId = null, detalle = null }) {
  const PERMITIDOS = new Set([
        'BOVED_UNLOCK', 'BOVED_LOCK', 'BOVED_REVEAL', 'BOVED_COPY', 'BOVED_CREATE',
        'BOVED_UPDATE', 'BOVED_DELETE', 'BOVED_EXPORT', 'BOVED_STEPUP_OK',
        'BOVED_STEPUP_FAIL', 'BOVED_RECOVERY', 'BOVED_RECOVERY_ACTIVATE',
        'BOVED_IMPORT', 'BOVED_REKEY',
        // --- Fase 5.1 (§26 R113): crear, revocar y abrir un share ---
        'BOVED_PAR_CREATE', 'BOVED_PAR_ROTATE',
        'BOVED_SHARE_CREATE', 'BOVED_SHARE_REVOKE', 'BOVED_SHARE_OPEN',
  ]);
  if (!PERMITIDOS.has(evento)) return null;

  const fila = {
    evento,
    vault_id: vaultId,
    item_id: itemId,
    detalle: detalle ? String(detalle).slice(0, 200) : null,
  };
  const { error } = await supabase.from(TABLAS.eventos).insert(fila);
  // Un fallo de auditoría no debe tumbar la operación del usuario, pero
  // tampoco debe silenciarse del todo.
  if (error && !/row-level security/i.test(String(error.message || ''))) {
    throw traducir(error, TABLAS.eventos);
  }
  return true;
}

/**
 * R125 — cuántas exportaciones (u otro evento) hubo en una ventana.
 * `head: true` sólo cuenta: no baja filas.
 */
export async function contarEventos({ evento, desdeIso }) {
  const { count, error } = await supabase
    .from(TABLAS.eventos)
    .select('id', { count: 'exact', head: true })
    .eq('evento', evento)
    .gte('created_at', desdeIso);
  if (error) throw traducir(error, TABLAS.eventos);
  return count ?? 0;
}

// ---------------------------------------------------------------------------
// §27 — cambio de contraseña maestra (R116–R120)
// ---------------------------------------------------------------------------

/**
 * R116 — TODAS o NADA. La escritura ocurre en UNA transacción de Postgres
 * (`vault_rekey`, repo hermano): la función recibe el salt nuevo y el
 * conjunto COMPLETO de envolturas, comprueba que coincide con las
 * vigentes, rota todo y audita. Si falta una fila, lanza y no cambia nada.
 *
 * La función corre con `SECURITY INVOKER`, así que el RLS de §20 sigue
 * aplicando: no es un bypass, es el mismo camino que cualquier update.
 *
 * @param {object} args
 * @param {string} args.vaultId
 * @param {string} args.salt          base64url del salt nuevo
 * @param {{m:number,t:number,p:number,dkLen:number}} args.parametros
 * @param {Array<{keyVersion:number, envoltura:object}>} args.claves
 * @param {number} [args.ventanaHoras] ventana de R117 (defecto 168 h)
 */
export async function cambiarMasterPassword({ vaultId, salt, parametros, claves, ventanaHoras = 168 }) {
  if (!vaultId) throw new Error('Falta vaultId');
  if (!Array.isArray(claves) || claves.length === 0) {
    throw new Error('R116: el conjunto de envolturas está vacío: no se cambia nada.');
  }

  const p_claves = claves.map(({ keyVersion, envoltura }) => ({
    key_version: keyVersion,
    algorithm: envoltura.algorithm,
    nonce: aTexto(envoltura.nonce),
    ciphertext: aTexto(envoltura.ciphertext),
    tag: aTexto(envoltura.tag),
  }));

  const { data, error } = await supabase.rpc('vault_rekey', {
    p_vault_id: vaultId,
    p_kdf_salt: aTexto(salt),
    p_kdf_m: parametros.m,
    p_kdf_t: parametros.t,
    p_kdf_p: parametros.p,
    p_kdf_dklen: parametros.dkLen,
    p_claves,
    p_ventana_horas: ventanaHoras,
  });

  if (error) {
    // 42P01 = función inexistente (migración de Fase 4 no aplicada).
    if (error.code === '42P01' || /function .*vault_rekey/i.test(String(error.message || ''))) {
      throw new ErrorSinMigracion('vault_rekey');
    }
    throw traducir(error, TABLAS.bovedas);
  }
  return data;
}

/**
 * R117 — cierra la ventana: revoca las envolturas bajo la KEK anterior.
 * Sólo tiene sentido cuando todos los clientes ya usan la maestra nueva.
 */
export async function revocarClavesPrevias(vaultId) {
  const { data, error } = await supabase.rpc('vault_revocar_anteriores', {
    p_vault_id: vaultId,
  });
  if (error) throw traducir(error, TABLAS.claves);
  return data ?? 0;
}

// ---------------------------------------------------------------------------
// §25 — recuperación (R106–R107)
// ---------------------------------------------------------------------------

/**
 * R106 — guarda las DEKs reenvueltes bajo la KEK de recuperación.
 *
 * Sólo viaja ciphertext: la recovery key y la KEK de recuperación se
 * derivan y usan en cliente y NUNCA se envían (§25.1 anti-escrow).
 *
 * @param {object} args
 * @param {string} args.vaultId
 * @param {Array<{keyVersion:number, envoltura:object}>} args.envolturas
 */
export async function guardarRecuperacion({ vaultId, envolturas }) {
  if (!Array.isArray(envolturas) || envolturas.length === 0) {
    throw new Error('No hay envolturas de recuperación que guardar');
  }
  const filas = envolturas.map(({ keyVersion, envoltura }) => ({
    vault_id: vaultId,
    key_version: keyVersion,
    proposito: 'recuperacion',
    ...filaDeEnvoltura(envoltura),
  }));
  // Reemplazo total: si ya había una activa, se revoca antes de escribir
  // la nueva para no dejar dos recovery keys vivas a la vez.
  await revocarRecuperacion(vaultId, { silencioso: true });
  const { error } = await supabase.from(TABLAS.claves).insert(filas);
  if (error) throw traducir(error, TABLAS.claves);
  return true;
}

/**
 * R107 — revoca la recovery key. `silencioso` evita un update inútil en
 * la primera activación.
 */
export async function revocarRecuperacion(vaultId, { silencioso = false } = {}) {
  if (silencioso) return 0;
  const { data, error } = await supabase
    .from(TABLAS.claves)
    .update({ revoked_at: new Date().toISOString() })
    .eq('vault_id', vaultId)
    .eq('proposito', 'recuperacion')
    .is('revoked_at', null)
    .select('id');
  if (error) throw traducir(error, TABLAS.claves);
  return data?.length ?? 0;
}

/** Devuelve las envolturas de recuperación vigentes (para usarlas o revocarlas). */
export async function cargarRecuperacion(vaultId) {
  const { data, error } = await supabase
    .from(TABLAS.claves)
    .select('*')
    .eq('vault_id', vaultId)
    .eq('proposito', 'recuperacion')
    .is('revoked_at', null);
  if (error) throw traducir(error, TABLAS.claves);
  return (data || []).map((fila) => ({
    keyVersion: fila.key_version,
    envoltura: envolturaDeFila(fila),
  }));
}

/**
 * §25.3 R109 — tras recuperar: todas las sesiones distintas de la actual
 * se cierran. `scope:'others'` las revoca en Supabase sin matar la que
 * está haciendo la recuperación.
 */
export async function revocarOtrasSesiones() {
  const { error } = await supabase.auth.signOut({ scope: 'others' });
  // Sin sesión activa o sin permiso no debe impedir la recuperación: el
  // evento queda en auditoría y el paso se puede repetir desde ajustes.
  return !error;
}

// ---------------------------------------------------------------------------
// Fase 5.1 — §6.2 par asimétrico, §26 compartición por elemento.
//
// Igual que el resto de este módulo: por aquí sólo viajan envolturas,
// públicas y metadatos. El snapshot del item NUNCA se sube en claro — va
// re-cifrado con una content key efímera que el worker ya envolvió hacia el
// receptor antes de que esta capa lo vea (R110).
// ---------------------------------------------------------------------------

/** Fila de `greenline_vault_user_keys` → par con la forma del worker. */
function parDeFila(fila) {
  const mitad = (prefijo) => ({
    envoltura: {
      algorithm: fila[`${prefijo}_algorithm`],
      nonce: aBytes(fila[`${prefijo}_nonce`]),
      ciphertext: aBytes(fila[`${prefijo}_ciphertext`]),
      tag: aBytes(fila[`${prefijo}_tag`]),
    },
    publica: aBytes(fila[`${prefijo}_publica`]),
  });
  return { firma: mitad('firma'), canje: mitad('canje') };
}

function mitadDeFila(fila, prefijo) {
  return {
    algorithm: fila[`${prefijo}_algorithm`],
    nonce: aBytes(fila[`${prefijo}_nonce`]),
    ciphertext: aBytes(fila[`${prefijo}_ciphertext`]),
    tag: aBytes(fila[`${prefijo}_tag`]),
  };
}

function camposDeMitad(prefijo, mitad) {
  return {
    [`${prefijo}_algorithm`]: mitad.envoltura.algorithm,
    [`${prefijo}_nonce`]: aTexto(mitad.envoltura.nonce),
    [`${prefijo}_ciphertext`]: aTexto(mitad.envoltura.ciphertext),
    [`${prefijo}_tag`]: aTexto(mitad.envoltura.tag),
    [`${prefijo}_publica`]: aTexto(mitad.publica),
  };
}

/**
 * §6.2 R6/R7 — guarda el par del usuario en dos sitios a propósito:
 * envolturas en `greenline_vault_user_keys` (sólo su dueño las lee) y
 * públicas en `greenline_vault_user_pubs` (directorio, R7/R114).
 *
 * Se hace en dos upserts y no en una transacción: si el segundo falla, el
 * par privado ya está guardado y se puede reintentar sin pérdida — el
 * inverso (públicas sin privadas) dejaría a otros compartiendo claves que
 * el dueño no podría abrir.
 *
 * @param {{vaultId:string, keyVersion:number, par:object}} args
 */
export async function guardarParAsimetrico({ vaultId, keyVersion, par }) {
  if (!vaultId || !Number.isInteger(keyVersion)) throw new Error('Faltan vaultId o keyVersion');
  const userId = await obtenerOwnerId();

  const privada = {
    user_id: userId,
    vault_id: vaultId,
    key_version: keyVersion,
    ...camposDeMitad('firma', par.firma),
    ...camposDeMitad('canje', par.canje),
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from(TABLAS.clavesPar).upsert(privada, { onConflict: 'user_id' });
  if (error) throw traducir(error, TABLAS.clavesPar);

  const publica = {
    user_id: userId,
    key_version: keyVersion,
    firma_publica: aTexto(par.firma.publica),
    canje_publica: aTexto(par.canje.publica),
    updated_at: new Date().toISOString(),
  };
  const { error: errorPub } = await supabase.from(TABLAS.pubs).upsert(publica, { onConflict: 'user_id' });
  if (errorPub) throw traducir(errorPub, TABLAS.pubs);

  return { guardado: true, userId };
}

/** Devuelve el par ENVIOLTO del usuario actual, o `null` si aún no existe. */
export async function cargarParAsimetrico() {
  const userId = await obtenerOwnerId();
  const { data, error } = await supabase
    .from(TABLAS.clavesPar)
    .select('*')
    .eq('user_id', userId)
    .limit(1);
  if (error) throw traducir(error, TABLAS.clavesPar);
  const fila = data?.[0];
  if (!fila) return null;
  return { vaultId: fila.vault_id, keyVersion: fila.key_version, par: parDeFila(fila) };
}

/**
 * R114 — pública X25519 (y Ed25519) de OTRO usuario, desde el directorio.
 * Sin clave pública no hay compartición posible: no existe ninguna manera
 * alternativa de llegar al receptor (R110 prohíbe pasarle la KEK).
 */
export async function buscarClavePublica(userId) {
  if (!userId) throw new Error('Falta el usuario receptor');
  const { data, error } = await supabase
    .from(TABLAS.pubs)
    .select('*')
    .eq('user_id', userId)
    .limit(1);
  if (error) throw traducir(error, TABLAS.pubs);
  const fila = data?.[0];
  if (!fila) {
    throw new Error(
      'Ese usuario todavía no tiene clave pública en el directorio: no se puede compartir con él.',
    );
  }
  return {
    keyVersion: fila.key_version,
    firma: aBytes(fila.firma_publica),
    canje: aBytes(fila.canje_publica),
  };
}

/** Fila de `greenline_vault_shares` → objeto con bytes, listo para el worker. */
export function shareDeFila(fila) {
  return {
    id: fila.id,
    formato: fila.formato || 'GLV5-SHARE',
    formatVersion: fila.format_version || 1,
    vaultId: fila.vault_id,
    itemId: fila.item_id,
    emisor: fila.emisor,
    receptor: fila.receptor,
    revision: fila.revision,
    claveReceptor: aBytes(fila.clave_receptor),
    claveEfimera: aBytes(fila.clave_efimera),
    wrappedKey: mitadDeFila(fila, 'wrapped'),
    payload: mitadDeFila(fila, 'payload'),
    payloadHash: aBytes(fila.payload_hash),
    expiresAt: new Date(fila.expires_at).toISOString(),
    firma: aBytes(fila.firma),
    revocado: fila.revoked_at != null,
    creadoEn: new Date(fila.creado_en).toISOString(),
  };
}

/** §26 — crea la compartición firmada. Sólo ciphertext y metadatos. */
export async function crearShare({ share, vaultId }) {
  const fila = {
    formato: share.formato,
    format_version: share.formatVersion,
    vault_id: vaultId,
    item_id: share.itemId,
    emisor: share.emisor,
    receptor: share.receptor,
    revision: share.revision,
    clave_receptor: aTexto(share.claveReceptor),
    clave_efimera: aTexto(share.claveEfimera),
    wrapped_algorithm: share.wrappedKey.algorithm,
    wrapped_nonce: aTexto(share.wrappedKey.nonce),
    wrapped_ciphertext: aTexto(share.wrappedKey.ciphertext),
    wrapped_tag: aTexto(share.wrappedKey.tag),
    payload_algorithm: share.payload.algorithm,
    payload_nonce: aTexto(share.payload.nonce),
    payload_ciphertext: aTexto(share.payload.ciphertext),
    payload_tag: aTexto(share.payload.tag),
    payload_hash: aTexto(share.payloadHash),
    firma: aTexto(share.firma),
    expires_at: share.expiresAt,
  };
  const creada = await consultar(TABLAS.shares, () =>
    supabase.from(TABLAS.shares).insert(fila).select('id').single(),
  );
  return { id: creada.id };
}

/** §26 R111/R112 — lo que otros me han compartido (RLS filtra revocados). */
export async function listarSharesRecibidos() {
  const { data, error } = await supabase
    .from(TABLAS.shares)
    .select('*')
    .order('creado_en', { ascending: false });
  if (error) throw traducir(error, TABLAS.shares);
  return (data || []).map(shareDeFila);
}

/** Lo que he compartido yo, con su estado de revocación. */
export async function listarSharesEmitidos(vaultId) {
  const { data, error } = await supabase
    .from(TABLAS.shares)
    .select('*')
    .eq('vault_id', vaultId)
    .order('creado_en', { ascending: false });
  if (error) throw traducir(error, TABLAS.shares);
  return (data || []).map(shareDeFila);
}

/**
 * R112 — marca la compartición como revocada. A partir de aquí el RLS del
 * receptor deja de servirle la fila. NO garantiza que B no la hubiera
 * descifrado antes: es una limitación declarada en §53.
 */
export async function revocarShare(id) {
  const { data, error } = await supabase
    .from(TABLAS.shares)
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
    .is('revoked_at', null)
    .select('id');
  if (error) throw traducir(error, TABLAS.shares);
  if (!data || data.length === 0) {
    throw new Error('La compartición ya estaba revocada o no existe.');
  }
  return data[0].id;
}
