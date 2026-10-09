import { useCallback, useEffect, useMemo, useState } from 'react';
import { Lock, Plus, ShieldCheck, Trash2, ArrowLeft } from '../../lib/icons';
import { useVault } from '../../contexts/VaultContext';
import { useAuth } from '../../contexts/AuthContext';
import { useAbility } from '@casl/react';
import { useStepUp } from '../../hooks/useStepUp';
import SecretField from '../vault/SecretField';
import { authAPI } from '../../lib/api';
import {
  ErrorSinMigracion,
  cargarBoveda,
  cargarRecuperacion,
  contarEventos,
  crearBoveda,
  eliminarBovedaPropia,
  eliminarItem,
  guardarClavePropia,
  guardarItem,
  guardarRecuperacion,
  listarCategorias,
  obtenerOwnerId,
  registrarEvento,
  revocarOtrasSesiones,
  revocarRecuperacion,
  actualizarItem,
} from '../../lib/vault/api';
import {
  ARGON2,
  ErrorExport,
  FORMATO_EXPORT,
  MAX_EXPORTS_POR_HORA,
  MAX_INTENTOS_STEPUP,
  borrar,
  detalleAuditoriaExport,
  generarPassphraseExport,
  generarRecoveryKey,
  parametrosUsados,
  parsearRecoveryKey,
  puedeExportar,
  saltAleatorio,
} from '../../lib/vault';

/** §28.1 R123 — la descarga sólo nace del clic del usuario, nunca antes. */
function descargar(nombre, contenido, mime = 'application/json') {
  const blob = new Blob([contenido], { type: mime });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

const ITEM_VACIO = { title: '', username: '', password: '', url: '', notes: '', categoria: 'general' };

/**
 * §40 — dos límites distintos, no los confundas:
 *
 *  • ESCRIBIR secretos: sólo con el permiso `boveda:write` (ADMIN/DESARROLLADOR_WEB). El
 *    resto del staff abre la bóveda, ve y copia, pero no crea ni cambia nada.
 *  • REKEY (§27) y RECOVERY (§25): sólo el DUEÑO de la bóveda, porque en
 *    `greenline_vault_keys` el RLS es de propiedad y el miembro con
 *    privilegio máximo sólo tiene SELECT sobre esas filas.
 */
const esDuenoDe = (b) => Boolean(b && (!b.boveda || b.boveda.owner_id === b.yo));

/** §40 — D1: ver y copiar es de todo el staff; escribir, no. */
const SOLO_ESCRITURA = 'Sólo ADMIN y DESARROLLADOR_WEB pueden modificar los secretos (§40).';

/** §28 — techo de secretos por importación: nada de ingesta masiva. */
const MAX_IMPORT_POR_FICHERO = 500;
/** Tope por campo: un fichero hostil no debe poder escribir megabytes en una fila. */
const MAX_LARGO_CAMPO = 5_000;

/**
 * Reduce un secreto leído de un export a la lista blanca de campos del
 * formulario. Cualquier campo extra del JSON se descarta y los tipos no
 * string se vuelven cadena vacía: el fichero lo ha escrito el disco, no
 * el usuario, y §16 no permite que alcance el DOM sin pasar por aquí.
 *
 * @param {unknown} bruto
 * @returns {typeof ITEM_VACIO}
 */
function normalizarImportado(bruto) {
  const origen = typeof bruto === 'object' && bruto !== null ? bruto : {};
  const salida = {};
  for (const campo of Object.keys(ITEM_VACIO)) {
    const valor = origen[campo];
    salida[campo] =
      typeof valor === 'string' ? valor.slice(0, MAX_LARGO_CAMPO) : '';
  }
  return salida;
}

/**
 * Bóveda Segura V5 en el panel — Fase 3.
 *
 * Todo lo sensible se resuelve en el worker (§9): este componente sólo
 * mueve ciphertext y decide cuándo pedir la maestra (§13) y cuándo
 * ocultar (§12). El RLS de `greenline_vault_*` es la autorización real
 * (§20); aquí no se comprueban permisos, se asumen denegados por defecto.
 */
export default function AdminBoveda() {
  const { estado, ocupado, generacion, desbloquear, bloquear, obtenerCliente } = useVault();
  const { accessToken } = useAuth();
  const desbloqueada = estado === 'activa';
  // §40 — D1: el RLS sólo acepta escritura de ADMIN/DESARROLLADOR_WEB; la UI
  // no debe ni ofrecerla a los demás roles (permiso único: boveda:write).
  const ability = useAbility();
  const puedeEscribir = ability.can('write', 'boveda');

  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState(null);
  const [sinMigracion, setSinMigracion] = useState(null);
  const [bootstrap, setBootstrap] = useState(null);

  const [master, setMaster] = useState('');
  const [master2, setMaster2] = useState('');
  const [errorMaestra, setErrorMaestra] = useState(null);

  const [datos, setDatos] = useState(null);
  const [form, setForm] = useState(ITEM_VACIO);
  const [editando, setEditando] = useState(null);
  const [abriendoForm, setAbriendoForm] = useState(false);
  const [mensaje, setMensaje] = useState(null);
  /** «Reparar bóveda»: borrado de la propia vacía y sin clave. */
  const [reparando, setReparando] = useState(false);
  /** §40 — catálogo de categorías (SÓLO el nombre viaja en claro). */
  const [categorias, setCategorias] = useState([]);

  // --- Fase 4 (§25, §27, §28) ---
  const [panel, setPanel] = useState(null); // 'recovery' | 'export' | 'import'
  const [trabajando, setTrabajando] = useState(false);
  /** §25.1 — se muestra UNA vez y no se guarda en ningún estado persistente. */
  const [recoveryTexto, setRecoveryTexto] = useState(null);
  const [activaRecovery, setActivaRecovery] = useState(false);
  /** §25 + §11 — recuperar reenvuelve MI fila bajo MI contraseña de panel. */
  const [formRecovery, setFormRecovery] = useState({ key: '', password: '' });
  const [viendoRecuperacion, setViendoRecuperacion] = useState(false);
  /** Contraseña de usuario tecleada para el step-up del panel (§13/§28). */
  const [masterPanel, setMasterPanel] = useState('');
  /** §28.1 R122 — fichero de export elegido, ya parseado en memoria. */
  const [ficheroImport, setFicheroImport] = useState(null);
  const [passImport, setPassImport] = useState('');

  // §28 exige step-up para exportar; §13 lo exige igual para activar una
  // recovery key, que es una puerta trasera permanente si alguien con la
  // sesión abierta la rota en silencio. Sólo un panel está abierto cada vez,
  // por eso comparten el mismo campo.
  const pasoExport = useStepUp({ proposito: 'export' });
  const pasoRecovery = useStepUp({ proposito: 'recovery' });

  // Los items descifrados sólo se muestran si corresponden a ESTE
  // desbloqueo: si la bóveda se bloquea, `desbloqueada` ya es false y al
  // reabrir la `generacion` habrá cambiado (§9 R25). Memoizado para que la
  // identidad sea estable entre renders.
  const items = useMemo(
    () => (desbloqueada && datos?.gen === generacion ? datos.lista : []),
    [desbloqueada, datos, generacion],
  );
  // Ítems que NO superan la verificación de integridad (AAD). Se quedan
  // fuera de `items` para que uno corrupto no bloquee el desbloqueo, pero se
  // enseñan aparte para poder eliminarlos desde el panel.
  const itemsRotos = useMemo(
    () => (desbloqueada && datos?.gen === generacion ? datos.rotos || [] : []),
    [desbloqueada, datos, generacion],
  );
  const creada = bootstrap && !bootstrap.boveda;
  const soyDueno = esDuenoDe(bootstrap);

  // Bóveda visible pero sin envoltorio de DEK vigente: `cargarBoveda()`
  // devuelve `clave: null` (api.js) y `bootstrap.clave.envoltura` revienta
  // con un TypeError en vez de dar un mensaje. Suele quedar así si la
  // creación se cortó a mitad (fila de bóveda insertada, `guardarClave()`
  // falló) o si RLS no devuelve ninguna clave para tu usuario.
  const sinClave = Boolean(bootstrap?.boveda) && !bootstrap?.clave;
  const avisoSinClave =
    'Esta bóveda existe pero no tiene ninguna clave activa que desbloquear: ' +
    'no se puede abrir. Avisa a sistemas (falta el envoltorio de la DEK).';

  /**
   * Bootstrap + envolturas de recuperación SIEMPRE juntos (§25 R107).
   *
   * `cargarBoveda()` no las trae, así que quien haga `setBootstrap()` con su
   * resultado a secas dejaría `bootstrap.recuperacion` en `undefined` y el
   * panel de recuperación se rompería la próxima vez que se abriera. Toda
   * actualización del bootstrap pasa por aquí.
   */
  const leerBootstrap = useCallback(async () => {
    const b = await cargarBoveda();
    let recuperacion = [];
    if (b.bovedaId) {
      try {
        recuperacion = await cargarRecuperacion(b.bovedaId);
      } catch {
        recuperacion = [];
      }
    }
    return { ...b, recuperacion };
  }, []);

  const recargar = useCallback(async () => {
    setCargando(true);
    setErrorCarga(null);
    setSinMigracion(null);
    try {
      const b = await leerBootstrap();
      setBootstrap(b);
      setActivaRecovery(b.recuperacion.length > 0);
    } catch (err) {
      if (err instanceof ErrorSinMigracion) setSinMigracion(err);
      else setErrorCarga(err);
    } finally {
      setCargando(false);
    }
  }, [leerBootstrap]);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  // El RLS de miembros sólo devuelve items con `categoria` asignada: sin
  // este catálogo la bóveda de equipo se vería vacía para los demás.
  useEffect(() => {
    let vivo = true;
    listarCategorias()
      .then((lista) => { if (vivo) setCategorias(lista); })
      .catch(() => { if (vivo) setCategorias([]); });
    return () => { vivo = false; };
  }, []);

  /**
   * Descifra todos los items visibles de la bóveda.
   *
   * Un ítem cuya autenticación falle (el AAD reconstruido no coincide con
   * el autenticado) NO bloquea el desbloqueo del resto: se separa en `rotos`
   * para poder enseñarlo y eliminarlo desde el panel. Devuelve
   * `{ lista, rotos }`.
   */
  const descifrarTodo = useCallback(async (cliente, lista) => {
    const resultados = await Promise.allSettled(
      lista.map(async (registro) => {
        const bytes = await cliente.descifrarItem(registro.envoltura, registro.contexto);
        return { ...registro, datos: await cliente.deserializarItem(bytes) };
      }),
    );
    const ok = [];
    const rotos = [];
    resultados.forEach((resultado, i) => {
      if (resultado.status === 'fulfilled') ok.push(resultado.value);
      else rotos.push(lista[i]);
    });
    return { lista: ok, rotos };
  }, []);

  /**
   * §11 — valida la contraseña de panel contra el backend ANTES de guardar
   * cualquier envoltura propia (migración / creación / recuperación): si no
   * es la contraseña real, no se llega a escribir nada y no queda la bóveda
   * envuelta bajo una contraseña que no sirve.
   *
   * No se usa en el desbloqueo normal: ahí la corrección la comprueba el
   * worker con R120 y el servidor no tiene por qué estar disponible.
   */
  const verificarPasswordPanel = useCallback(
    async (password) => {
      try {
        const r = await authAPI.verifyPassword(password, accessToken);
        if (!r?.valid) {
          setErrorMaestra('La contraseña de usuario no es correcta.');
          return false;
        }
        return true;
      } catch (err) {
        if (err?.status === 401) {
          setErrorMaestra('Tu sesión expiró. Vuelve a entrar para verificar la contraseña de usuario.');
          return false;
        }
        setErrorMaestra(
          `No se pudo verificar la contraseña de usuario: ${err?.error || err?.message || 'error del servidor'}`,
        );
        return false;
      }
    },
    [accessToken],
  );

  const alDesbloquear = useCallback(
    async (e) => {
      e?.preventDefault?.();
      setErrorMaestra(null);
      setMensaje(null);
      if (!bootstrap?.clave) {
        setErrorMaestra(sinClave ? avisoSinClave : 'No se pudo cargar la bóveda. Recarga la página.');
        return;
      }
      try {
        const migrando = Boolean(bootstrap.migracionPendiente);
        if (migrando) {
          // 1) la contraseña de panel se verifica en el backend ANTES de
          //    derivar nada: sólo así la fila propia se guarda bajo una
          //    contraseña que de verdad abre el panel.
          if (!(await verificarPasswordPanel(master2))) return;
        }
        // 2) abrir la DEK con lo que haya (maestra legado en migración,
        //    contraseña de panel en el caso normal — misma derivación).
        const r = await desbloquear({
          masterPassword: master,
          salt: bootstrap.salt,
          parametros: bootstrap.parametros,
        });
        const cliente = obtenerCliente();
        await cliente.abrirDEK(bootstrap.clave.envoltura, bootstrap.clave.contexto);
        if (migrando) {
          // 3) re-envolver la MISMA DEK bajo MI contraseña de panel (R120
          //    en el worker) y guardarla con upsert: si algo falla, la fila
          //    legado sigue intacta y se puede reintentar.
          const nueva = await cliente.migrarClaveUsuario({ passwordUsuario: master2 });
          await guardarClavePropia({
            vaultId: bootstrap.bovedaId,
            keyVersion: nueva.contexto.keyVersion,
            envoltura: nueva.envoltura,
          });
          setBootstrap(await leerBootstrap());
        }
        const { lista, rotos } = await descifrarTodo(cliente, bootstrap.items);
        setDatos({ gen: r.generacion, lista, rotos });
        setMaster('');
        setMaster2('');
        await registrarEvento({ evento: 'BOVED_UNLOCK', vaultId: bootstrap.bovedaId });
      } catch (err) {
        setErrorMaestra(err?.message || 'No se pudo desbloquear.');
        bloquear();
      }
    },
    [
      avisoSinClave,
      bootstrap,
      bloquear,
      descifrarTodo,
      desbloquear,
      leerBootstrap,
      master,
      master2,
      obtenerCliente,
      sinClave,
      verificarPasswordPanel,
    ],
  );

  const alCrear = useCallback(
    async (e) => {
      e?.preventDefault?.();
      setErrorMaestra(null);
      if (master !== master2) {
        setErrorMaestra('Las contraseñas no coinciden.');
        return;
      }
      // §11 — la bóveda se envuelve con la contraseña de PANEL, así que
      // debe ser la que el backend acepta (el mismo check del formulario de
      // cambio de contraseña). Sin el check de 14 caracteres: la política
      // del panel es la que manda.
      if (!(await verificarPasswordPanel(master))) return;
      try {
        const ownerId = await obtenerOwnerId();
        const vaultId = crypto.randomUUID();
        const salt = saltAleatorio();

        const r = await desbloquear({ masterPassword: master, salt, parametros: ARGON2 });
        const cliente = obtenerCliente();

        const contextoDEK = { vaultId, keyVersion: 1 };
        const contextoItem = {
          vaultId,
          itemId: crypto.randomUUID(),
          ownerId,
          tenantId: null,
          revision: 1,
          keyVersion: 1,
        };

        const creada = await cliente.crearBoveda(ITEM_VACIO, contextoItem, contextoDEK);
        await crearBoveda({
          id: vaultId,
          salt,
          parametros: parametrosUsados(ARGON2),
          envolturaClave: creada.dek.envoltura,
        });
        await guardarItem({
          vaultId,
          contexto: contextoItem,
          envoltura: creada.envoltura,
          tipo: null,
        });
        await registrarEvento({ evento: 'BOVED_CREATE', vaultId });

        const recienCreada = await leerBootstrap();
        setBootstrap(recienCreada);
        setActivaRecovery(false);
        setDatos({
          gen: r.generacion,
          lista: [{ ...recienCreada.items[0], datos: ITEM_VACIO }],
          rotos: [],
        });
        setMaster('');
        setMaster2('');
        setMensaje('Bóveda creada. Tu contraseña de panel no se ha guardado en ningún sitio.');
      } catch (err) {
        setErrorMaestra(err?.message || 'No se pudo crear la bóveda.');
        bloquear();
      }
    },
    [bloquear, desbloquear, leerBootstrap, master, master2, obtenerCliente, verificarPasswordPanel],
  );

  /**
   * Borra la propia bóveda cuando está vacía y sin envoltorio de DEK (el
   * estado que deja una creación interrumpida a mitad de camino). Al
   * recargar, sin ninguna bóveda la pantalla ofrece «Crear bóveda segura».
   */
  const alReparar = useCallback(async () => {
    setErrorMaestra(null);
    setReparando(true);
    try {
      await eliminarBovedaPropia(bootstrap?.propiaId);
      await recargar();
    } catch (err) {
      setErrorMaestra(err?.message || 'No se pudo reparar la bóveda.');
    } finally {
      setReparando(false);
    }
  }, [bootstrap, recargar]);

  const alGuardar = useCallback(
    async (e) => {
      e?.preventDefault();
      setMensaje(null);
      if (!puedeEscribir) {
        setMensaje({ tipo: 'error', texto: SOLO_ESCRITURA });
        return;
      }
      const cliente = obtenerCliente();
      try {
        if (editando) {
          const registro = items.find((i) => i.id === editando);
          const contexto = { ...registro.contexto, revision: registro.revision + 1 };
          const envoltura = await cliente.cifrarItem(form, contexto);
          await actualizarItem({
            id: registro.id,
            contexto,
            envoltura,
            tipo: null,
            categoria: form.categoria || null,
          });
          await registrarEvento({ evento: 'BOVED_UPDATE', itemId: registro.id });
        } else {
          const ownerId = await obtenerOwnerId();
          const contexto = {
            vaultId: bootstrap.bovedaId,
            itemId: crypto.randomUUID(),
            ownerId,
            tenantId: null,
            revision: 1,
            keyVersion: 1,
          };
          const envoltura = await cliente.cifrarItem(form, contexto);
          await guardarItem({
            vaultId: bootstrap.bovedaId,
            contexto,
            envoltura,
            tipo: null,
            categoria: form.categoria || null,
          });
          await registrarEvento({ evento: 'BOVED_CREATE', itemId: contexto.itemId });
        }
        const b = await leerBootstrap();
        setBootstrap(b);
        setActivaRecovery(b.recuperacion.length > 0);
        const { lista, rotos } = await descifrarTodo(cliente, b.items);
        setDatos({ gen: generacion, lista, rotos });
        setForm(ITEM_VACIO);
        setEditando(null);
        setAbriendoForm(false);
      } catch (err) {
        setMensaje({ tipo: 'error', texto: err?.message || 'No se pudo guardar.' });
      }
    },
    [bootstrap, descifrarTodo, editando, form, generacion, items, leerBootstrap, obtenerCliente, puedeEscribir],
  );

  const alEliminar = useCallback(
    async (registro) => {
      setMensaje(null);
      if (!puedeEscribir) {
        setMensaje({ tipo: 'error', texto: SOLO_ESCRITURA });
        return;
      }
      try {
        await eliminarItem(registro.id);
        await registrarEvento({ evento: 'BOVED_DELETE', itemId: registro.id });
        setDatos({
          gen: generacion,
          lista: items.filter((i) => i.id !== registro.id),
          rotos: (datos?.rotos || []).filter((r) => r.id !== registro.id),
        });
      } catch (err) {
        setMensaje({ tipo: 'error', texto: err?.message || 'No se pudo eliminar.' });
      }
    },
    [datos, generacion, items, puedeEscribir],
  );

  /**
   * Borra (lógicamente) los ítems que no pasan la verificación de
   * integridad. Su ciphertext va ligado a un `itemId` que ya no coincide con
   * el de su fila, así que no son descifrables por nadie: sólo estorban.
   */
  const alEliminarRotos = useCallback(async () => {
    setMensaje(null);
    if (!puedeEscribir) {
      setMensaje({ tipo: 'error', texto: SOLO_ESCRITURA });
      return;
    }
    const total = itemsRotos.length;
    try {
      for (const registro of itemsRotos) {
        await eliminarItem(registro.id);
        await registrarEvento({ evento: 'BOVED_DELETE', itemId: registro.id });
      }
      setDatos({ gen: generacion, lista: items, rotos: [] });
      setMensaje({ tipo: 'ok', texto: `${total} secreto(s) dañado(s) eliminado(s).` });
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err?.message || 'No se pudieron eliminar los ítems dañados.' });
    }
  }, [generacion, items, itemsRotos, puedeEscribir]);

  // ---------------------------------------------------------------------
  // Fase 4 — §25 recuperación, §27 cambio de maestra, §28 exportación.
  // ---------------------------------------------------------------------

  const fallo = (err, porDefecto) =>
    setMensaje({ tipo: 'error', texto: err?.message || porDefecto });

  /**
   * §25.3 R105/R106 — genera la recovery key EN cliente y reenvuelve las
   * DEKs bajo ella. Ni la key ni la KEK de recuperación salen de este
   * navegador (§25.1 anti-escrow): a servidor sólo va ciphertext.
   *
   * Antes, step-up con la maestra (§13): reenvolver todas las DEKs bajo una
   * clave nueva equivale a instalar una puerta trasera, y eso no puede
   * hacerse sólo con la sesión abierta.
   */
  const alGenerarRecovery = useCallback(async () => {
    setMensaje(null);
    if (!soyDueno) {
      return fallo(null, 'Sólo el dueño de la bóveda puede crear o renovar la recovery key (§25).');
    }
    if (!(await pasoRecovery.autorizar(masterPanel))) {
      setMasterPanel('');
      return;
    }
    setTrabajando(true);
    try {
      const { bytes, texto } = generarRecoveryKey();
      const cliente = obtenerCliente();
      const r = await cliente.activarRecuperacion({
        recoveryKey: bytes,
        salt: bootstrap.salt,
        vaultId: bootstrap.bovedaId,
        envolturas: bootstrap.claves.map((c) => ({ keyVersion: c.keyVersion, envoltura: c.envoltura })),
      });
      borrar(bytes);
      await guardarRecuperacion({ vaultId: bootstrap.bovedaId, envolturas: r.envolturas });
      await registrarEvento({ evento: 'BOVED_RECOVERY_ACTIVATE', vaultId: bootstrap.bovedaId });
      setRecoveryTexto(texto);
      setActivaRecovery(true);
      setBootstrap({ ...bootstrap, recuperacion: r.envolturas });
      setMasterPanel('');
    } catch (err) {
      fallo(err, 'No se pudo activar la recuperación.');
    } finally {
      setTrabajando(false);
    }
  }, [bootstrap, masterPanel, obtenerCliente, pasoRecovery, soyDueno]);

  /**
   * §28 — export cifrado versionado con passphrase propia (R121), límite
   * por hora (R125), step-up (§28 «requerir step-up authentication») y
   * auditoría con recuento, nunca con contenido (R124).
   */
  const alExportar = useCallback(
    async (e) => {
      e?.preventDefault?.();
      setMensaje(null);
      // Sin secretos descifrados no hay nada que exportar: si la bóveda
      // está bloqueada o la generación cambió, `items` está vacío y un
      // export en silencio de 0 items es un fallo, no un resultado.
      if (items.length === 0) {
        return fallo(null, 'No hay secretos descifrados: desbloquea la bóveda antes de exportar.');
      }
      if (!(await pasoExport.autorizar(masterPanel))) {
        setMasterPanel('');
        return;
      }
      setTrabajando(true);
      try {
        const desde = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        puedeExportar(await contarEventos({ evento: 'BOVED_EXPORT', desdeIso: desde }));

        const passphrase = generarPassphraseExport();
        const fichero = await obtenerCliente().crearExport({
          items: items.map((i) => i.datos),
          passphrase,
          vaultId: bootstrap.bovedaId,
        });
        await registrarEvento({
          evento: 'BOVED_EXPORT',
          vaultId: bootstrap.bovedaId,
          detalle: detalleAuditoriaExport(fichero),
        });
        descargar(`greenline-boveda-${fichero.created_at.slice(0, 10)}.json`, JSON.stringify(fichero, null, 2));
        setMensaje({
          tipo: 'ok',
          texto: `Exportado (${fichero.item_count} secretos). Passphrase de apertura: ${passphrase} — guárdala en un sitio distinto del fichero: no se puede recuperar.`,
        });
        setPanel(null);
        setMasterPanel('');
      } catch (err) {
        fallo(err, err instanceof ErrorExport ? err.message : 'No se pudo exportar.');
      } finally {
        setTrabajando(false);
      }
    },
    [bootstrap, items, masterPanel, obtenerCliente, pasoExport],
  );

  // ---------------------------------------------------------------------
  // §28.1 R122 — importar un export cifrado.
  // ---------------------------------------------------------------------

  /**
   * El fichero llega de disco y por tanto es un fichero HOSTIL: se acepta
   * sólo el formato conocido y cada secreto se reduce a la lista blanca de
   * campos de `ITEM_VACIO` antes de cifrarlo. Así un JSON con campos
   * raros no acaba ni en la base de datos ni, más tarde, en el DOM (§16).
   */
  const alElegirFichero = useCallback(async (e) => {
    const archivo = e?.target?.files?.[0];
    if (!archivo) return;
    setMensaje(null);
    setFicheroImport(null);
    try {
      const texto = await archivo.text();
      const datos = JSON.parse(texto);
      // Etiqueta de formato; la validación estricta (versión, cifrado,
      // AAD…) la hace `abrirExport` dentro del worker.
      if (datos?.format !== FORMATO_EXPORT || typeof datos?.format_version !== 'number') {
        return fallo(null, `«${archivo.name}» no es un export de bóveda de GreenLine.`);
      }
      setFicheroImport({ nombre: archivo.name, datos });
    } catch {
      fallo(null, `No se pudo leer «${archivo.name}»: no es JSON válido.`);
    } finally {
      // El input no se queda con el fichero: nada se conserva en memoria
      // más allá de lo que el usuario está importando ahora mismo.
      if (e?.target) e.target.value = '';
    }
  }, []);

  const alImportar = useCallback(
    async (ev) => {
      ev?.preventDefault?.();
      setMensaje(null);
      if (!puedeEscribir) return fallo(null, SOLO_ESCRITURA);
      if (!ficheroImport) return fallo(null, 'Elige primero un fichero de export.');

      setTrabajando(true);
      try {
        const cliente = obtenerCliente();
        // R52: el Argon2id de apertura va al worker, no a la página.
        const secretos = await cliente.abrirExport({
          exportacion: ficheroImport.datos,
          passphrase: passImport,
          vaultId: bootstrap.bovedaId,
        });

        if (!Array.isArray(secretos) || secretos.length === 0) {
          return fallo(null, 'El fichero no contiene secretos.');
        }
        if (secretos.length > MAX_IMPORT_POR_FICHERO) {
          return fallo(
            null,
            `El fichero declara ${secretos.length} secretos y el máximo por importación es ${MAX_IMPORT_POR_FICHERO}.`,
          );
        }
        // Doble confirmación explícita (§28: «mostrar advertencia»).
        const seguro = window.confirm(
          `Se añadirán ${secretos.length} secretos a ESTA bóveda.\n\n` +
            'No se sustituye nada: si un secreto ya existe con el mismo título, ' +
            'quedará como una entrada aparte. ¿Continuar?',
        );
        if (!seguro) return;

        const ownerId = await obtenerOwnerId();
        let importados = 0;
        for (const bruto of secretos) {
          const contexto = {
            vaultId: bootstrap.bovedaId,
            itemId: crypto.randomUUID(),
            ownerId,
            tenantId: null,
            revision: 1,
            keyVersion: 1,
          };
          const envoltura = await cliente.cifrarItem(normalizarImportado(bruto), contexto);
          await guardarItem({ vaultId: bootstrap.bovedaId, contexto, envoltura, tipo: null });
          importados += 1;
        }

        await registrarEvento({
          evento: 'BOVED_IMPORT',
          vaultId: bootstrap.bovedaId,
          detalle: JSON.stringify({ formato: FORMATO_EXPORT, items: importados }),
        });

        const b = await leerBootstrap();
        setBootstrap(b);
        setActivaRecovery(b.recuperacion.length > 0);
        const { lista, rotos } = await descifrarTodo(cliente, b.items);
        setDatos({ gen: generacion, lista, rotos });
        setFicheroImport(null);
        setPassImport('');
        setPanel(null);
        setMensaje({ tipo: 'ok', texto: `Importados ${importados} secretos.` });
      } catch (err) {
        fallo(err, 'No se pudo importar el fichero.');
      } finally {
        setTrabajando(false);
      }
    },
    [bootstrap, descifrarTodo, ficheroImport, generacion, leerBootstrap, obtenerCliente, passImport, puedeEscribir],
  );

  /**
   * §25.3 R107/R109 + §11 — usar la recovery key: abre las DEKs con ella,
   * las reenvuelve bajo MI contraseña de panel (MISMO salt: no rota),
   * guarda mi fila con upsert, REVOCA la recovery key y cierra el resto
   * de sesiones. La contraseña de panel se verifica en el backend ANTES de
   * escribir nada — si se teclea mal, no queda la fila propia envuelta
   * bajo una contraseña inútil. Sólo se hace desde la pantalla de
   * desbloqueo.
   */
  const alUsarRecovery = useCallback(
    async (e) => {
      e?.preventDefault?.();
      setErrorMaestra(null);
      if (!soyDueno) {
        setErrorMaestra('Sólo el dueño de la bóveda puede usar la recovery key (§25).');
        return;
      }
      if (!formRecovery.password) {
        setErrorMaestra('Escribe tu contraseña de panel.');
        return;
      }
      if (!(await verificarPasswordPanel(formRecovery.password))) return;
      setTrabajando(true);
      try {
        const bytes = parsearRecoveryKey(formRecovery.key);
        const cliente = obtenerCliente();
        const r = await cliente.reenvolverDesdeRecuperacion({
          recoveryKey: bytes,
          salt: bootstrap.salt,
          vaultId: bootstrap.bovedaId,
          passwordUsuario: formRecovery.password,
          parametros: bootstrap.parametros,
          envolturas: bootstrap.recuperacion,
        });
        borrar(bytes);

        for (const { keyVersion, envoltura } of r.envolturas) {
          await guardarClavePropia({
            vaultId: bootstrap.bovedaId,
            keyVersion,
            envoltura,
          });
        }
        // R107 — un solo uso: la recovery key queda revocada.
        await revocarRecuperacion(bootstrap.bovedaId);
        await registrarEvento({ evento: 'BOVED_RECOVERY', vaultId: bootstrap.bovedaId });
        // R109 — todas las sesiones, fuera.
        await revocarOtrasSesiones();

        setFormRecovery({ key: '', password: '' });
        setViendoRecuperacion(false);
        setActivaRecovery(false);
        await recargar();
        setErrorMaestra(null);
        setMensaje(null);
        alert(
          'Bóveda recuperada con tu contraseña de panel. La recovery key ha quedado revocada ' +
            'y las demás sesiones cerradas. Desbloquea ahora con tu contraseña de usuario.',
        );
      } catch (err) {
        setErrorMaestra(err?.message || 'La recovery key no es válida.');
      } finally {
        setTrabajando(false);
      }
    },
    [bootstrap, formRecovery, obtenerCliente, recargar, soyDueno, verificarPasswordPanel],
  );

  if (cargando) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-gray-500">
        <ShieldCheck className="h-4 w-4 animate-pulse" /> Cargando bóveda…
      </div>
    );
  }

  if (sinMigracion) {
    return (
      <div className="m-6 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
        <p className="font-semibold">Falta la migración de la bóveda</p>
        <p className="mt-1">{sinMigracion.message}</p>
        <p className="mt-3 text-xs">
          Tablas requeridas: greenline_vaults, greenline_vault_keys, greenline_vault_items,
          greenline_vault_events.
        </p>
      </div>
    );
  }

  if (errorCarga) {
    return (
      <div className="m-6 rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
        <p className="font-semibold">No se pudo leer la bóveda</p>
        <p className="mt-1">{errorCarga.message}</p>
        <button
          type="button"
          onClick={() => void recargar()}
          className="mt-3 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white"
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (!desbloqueada) {
    // §11 — sin envoltura propia todavía: se ofrece la maestra legado UNA
    // vez, junto a la contraseña de panel, y al guardarla la siguiente
    // apertura es sólo con la contraseña de usuario.
    const migrando = !creada && Boolean(bootstrap?.migracionPendiente);
    return (
      <div className="m-6 max-w-lg rounded-xl border border-gray-200 bg-white p-6">
        <div className="flex items-center gap-2">
          <Lock className="h-5 w-5 text-brand" />
          <h2 className="text-lg font-bold text-gray-900">
            {creada ? 'Crear bóveda segura' : 'Desbloquear bóveda'}
          </h2>
        </div>
        <p className="mt-2 text-sm text-gray-500">
          {creada
            ? 'La bóveda se envuelve con tu contraseña de panel: se deriva aquí (Argon2id) y NUNCA se envía al servidor — sólo se verifica contra el backend. Si la pierdes, usa la recovery key.'
            : 'Se deriva la clave en tu equipo (Argon2id) con tu contraseña de usuario y sólo se envía material cifrado.'}
        </p>

        {sinClave && !bootstrap?.propiaReparable && (
          <p
            className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700"
            role="alert"
          >
            {avisoSinClave}
          </p>
        )}

        {bootstrap?.propiaSinClave && !sinClave && !bootstrap?.propiaReparable && (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Tu bóveda propia no tiene una clave activa, así que se está abriendo otra bóveda a la
            que tienes acceso. Avisa a sistemas para regenerar la clave de tu usuario.
          </p>
        )}

        {soyDueno && bootstrap?.propiaReparable && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
            <p className="text-xs text-amber-800">
              Tu bóveda propia está vacía y sin clave: no se puede abrir (una creación se cortó a
              mitad de camino). Puedes eliminarla y crear una nueva.
            </p>
            <button
              type="button"
              onClick={alReparar}
              disabled={reparando || ocupado}
              className="mt-2 text-xs font-semibold text-amber-700 underline hover:text-amber-900 disabled:opacity-50"
            >
              {reparando ? 'Reparando…' : 'Reparar bóveda (eliminar la vacía)'}
            </button>
          </div>
        )}

        <form onSubmit={creada ? alCrear : alDesbloquear} className="mt-5 space-y-3">
          {migrando && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Primera apertura con clave por usuario: introduce la maestra legado y, además, tu
              contraseña de panel. Al guardar, la bóveda queda envuelta bajo TÚ contraseña y después
              sólo pedirá ésta.
            </p>
          )}

          <label className="block">
            <span className="text-xs font-medium text-gray-600">
              {creada
                ? 'Tu contraseña de panel'
                : migrando
                  ? 'Contraseña maestra (legado)'
                  : 'Tu contraseña de usuario (contraseña de panel)'}
            </span>
            <input
              type="password"
              value={master}
              onChange={(e) => setMaster(e.target.value)}
              autoComplete={migrando ? 'off' : 'current-password'}
              autoCorrect="off"
              spellCheck={false}
              required
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
            />
          </label>

          {creada && (
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Repite tu contraseña de panel</span>
              <input
                type="password"
                value={master2}
                onChange={(e) => setMaster2(e.target.value)}
                autoComplete="new-password"
                required
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              />
            </label>
          )}

          {migrando && !creada && (
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Tu contraseña de panel</span>
              <input
                type="password"
                value={master2}
                onChange={(e) => setMaster2(e.target.value)}
                autoComplete="current-password"
                required
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              />
            </label>
          )}

          {errorMaestra && (
            <p className="text-xs font-medium text-red-600" role="alert">{errorMaestra}</p>
          )}

          <button
            type="submit"
            disabled={
              ocupado ||
              master.length === 0 ||
              sinClave ||
              ((creada || migrando) && master2.length === 0)
            }
            className="w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-dark disabled:opacity-50"
          >
            {ocupado
              ? 'Derivando clave…'
              : creada
                ? 'Crear bóveda'
                : migrando
                  ? 'Migrar y desbloquear'
                  : 'Desbloquear'}
          </button>
        </form>

        {ocupado && (
          <p className="mt-3 text-xs text-gray-400">
            Argon2id tarda ~1 s a propósito: se ejecuta en un worker y no bloquea la página.
          </p>
        )}

        {!creada && soyDueno && bootstrap?.recuperacion?.length > 0 && (
          <div className="mt-5 border-t border-gray-100 pt-4">
            {!viendoRecuperacion ? (
              <button
                type="button"
                onClick={() => setViendoRecuperacion(true)}
                className="text-xs font-medium text-amber-600 hover:text-amber-700"
              >
                ¿Olvidaste tu contraseña de usuario? Usa tu recovery key
              </button>
            ) : (
              <form onSubmit={alUsarRecovery} className="space-y-3">
                <p className="text-xs text-gray-500">
                  Se reenvuelven las claves con tu contraseña de panel (si no la recuerdas,
                  restablécela primero con «Olvidé mi contraseña»). Después, la recovery key queda
                  <strong> revocada</strong> y las demás sesiones se cierran (§25 R107/R109).
                </p>
                <label className="block">
                  <span className="text-xs font-medium text-gray-600">Recovery key</span>
                  <textarea
                    value={formRecovery.key}
                    onChange={(e) => setFormRecovery({ ...formRecovery, key: e.target.value })}
                    rows={2}
                    spellCheck={false}
                    autoComplete="off"
                    className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-xs focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-gray-600">Tu contraseña de panel</span>
                  <input
                    type="password"
                    value={formRecovery.password}
                    onChange={(e) => setFormRecovery({ ...formRecovery, password: e.target.value })}
                    autoComplete="current-password"
                    required
                    className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                  />
                </label>
                {errorMaestra && (
                  <p className="text-xs font-medium text-red-600" role="alert">{errorMaestra}</p>
                )}
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={ocupado || trabajando}
                    className="rounded-lg bg-amber-600 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                  >
                    {trabajando ? 'Recuperando…' : 'Recuperar bóveda'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setViendoRecuperacion(false); setErrorMaestra(null); }}
                    className="text-xs text-gray-400 hover:text-gray-600"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Bóveda segura</h2>
          <p className="text-xs text-gray-500">
            {items.length} secreto(s) · descifrado local con AES-256-GCM + AAD
            {!puedeEscribir && ' · sólo lectura: ver y copiar (§40)'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {puedeEscribir && (
            <button
              type="button"
              onClick={() => { setAbriendoForm(true); setEditando(null); setForm(ITEM_VACIO); }}
              className="inline-flex items-center gap-1 rounded-lg bg-brand px-3 py-2 text-xs font-semibold text-white hover:bg-brand-dark"
            >
              <Plus className="h-3.5 w-3.5" /> Nuevo
            </button>
          )}
          <button
            type="button"
            onClick={() => { bloquear(); setDatos(null); }}
            className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50"
          >
            Bloquear
          </button>
        </div>
      </div>

      {mensaje && (
        <p className={`text-xs ${mensaje.tipo === 'error' ? 'text-red-600' : 'text-emerald-700'}`}>
          {mensaje.texto}
        </p>
      )}

      {itemsRotos.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
          <p className="text-xs text-amber-800">
            {itemsRotos.length === 1
              ? '1 secreto no supera'
              : `${itemsRotos.length} secretos no superan`}{' '}
            la verificación de integridad, así que no se pueden descifrar (se crearon ligados a
            un id que ya no es el de su fila). El resto de la bóveda funciona con normalidad.
          </p>
          {puedeEscribir && (
            <button
              type="button"
              onClick={alEliminarRotos}
              className="mt-2 text-xs font-semibold text-amber-700 underline hover:text-amber-900"
            >
              Eliminar los dañados
            </button>
          )}
        </div>
      )}

      {/* --- Fase 4: mantenimiento (§25, §27, §28) --- */}
      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-gray-800">Mantenimiento de la bóveda</p>
            <p className="text-xs text-gray-500">
              {activaRecovery ? 'Recovery key activa' : 'Sin recovery key'} ·{' '}
              {MAX_EXPORTS_POR_HORA} exportaciones/hora máx. · Contraseña maestra retirada: la
              bóveda se desbloquea y se reenvuelve con tu contraseña de panel (§11)
              {!soyDueno && ' · La recovery key es sólo del dueño'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setPanel(panel === 'recovery' ? null : 'recovery')}
              disabled={trabajando || !soyDueno}
              title={
                soyDueno
                  ? undefined
                  : 'Sólo el dueño de la bóveda puede crear o renovar la recovery key (§25).'
              }
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              {activaRecovery ? 'Renovar recovery key' : 'Crear recovery key'}
            </button>
            <button
              type="button"
              onClick={() => setPanel(panel === 'export' ? null : 'export')}
              disabled={trabajando}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              Exportar cifrado
            </button>
            {puedeEscribir && (
              <button
                type="button"
                onClick={() => setPanel(panel === 'import' ? null : 'import')}
                disabled={trabajando}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                Importar export
              </button>
            )}
          </div>
        </div>

        {panel === 'recovery' && (
          <div className="mt-4 space-y-3 border-t border-gray-100 pt-4">
            {!recoveryTexto ? (
              <form onSubmit={(e) => { e.preventDefault(); void alGenerarRecovery(); }} className="space-y-3">
                <p className="text-xs text-gray-600">
                  Se genera <strong>en tu navegador</strong>, se guarda cifrada en tu bóveda y no se
                  envía al servidor (§25.1). Si la pierdes junto con tu contraseña de usuario,
                  nadie podrá abrir tus secretos — ni siquiera el administrador del sistema.
                </p>
                <label className="block">
                  <span className="text-xs font-medium text-gray-600">
                    Tu contraseña de usuario (step-up §13)
                  </span>
                  <input
                    type="password"
                    value={masterPanel}
                    onChange={(e) => setMasterPanel(e.target.value)}
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    required
                    className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                  />
                </label>
                {pasoRecovery.error && (
                  <p className="text-xs font-medium text-red-600" role="alert">
                    {pasoRecovery.error}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={trabajando || pasoRecovery.verificando || masterPanel.length === 0}
                  className="rounded-lg bg-brand px-4 py-2 text-xs font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
                >
                  {trabajando || pasoRecovery.verificando
                    ? 'Envolviendo claves…'
                    : activaRecovery
                      ? 'Renovar (revoca la anterior)'
                      : 'Generar y activar'}
                </button>
              </form>
            ) : (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <p className="text-xs font-semibold text-amber-900">
                  Guarda esta recovery key. Se muestra una sola vez.
                </p>
                <p className="mt-2 break-all rounded-lg bg-white p-3 font-mono text-sm text-gray-900">
                  {recoveryTexto}
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      descargar(
                        `greenline-recovery-${new Date().toISOString().slice(0, 10)}.txt`,
                        recoveryTexto,
                        'text/plain',
                      )
                    }
                    className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
                  >
                    Descargar
                  </button>
                  <button
                    type="button"
                    onClick={() => setRecoveryTexto(null)}
                    className="rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100"
                  >
                    Ya la he guardado
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {panel === 'export' && (
          <form onSubmit={alExportar} className="mt-4 space-y-3 border-t border-gray-100 pt-4">
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <p className="font-semibold">Advertencia (§28)</p>
              <ul className="mt-1 list-disc space-y-1 pl-4">
                <li>
                  Se descargará un fichero JSON <strong>cifrado</strong> con los{' '}
                  {items.length} secretos que están descifrados ahora mismo.
                </li>
                <li>
                  La passphrase de apertura sólo aparece una vez. Si la pierdes, el fichero no se
                  puede abrir; nadie puede recuperarla por ti.
                </li>
                <li>Guárda la passphrase en un sitio distinto del fichero.</li>
              </ul>
            </div>
            <label className="block">
              <span className="text-xs font-medium text-gray-600">
                Tu contraseña de usuario (step-up §28)
              </span>
              <input
                type="password"
                value={masterPanel}
                onChange={(e) => setMasterPanel(e.target.value)}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                required
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              />
            </label>
            {pasoExport.error && (
              <p className="text-xs font-medium text-red-600" role="alert">
                {pasoExport.error}
              </p>
            )}
            <p className="text-xs text-gray-500">
              Tope de {MAX_EXPORTS_POR_HORA} exportaciones por hora (R125) y{' '}
              {pasoExport.intentosRestantes ?? MAX_INTENTOS_STEPUP} intentos de verificación por
              minuto (§52).
            </p>
            <button
              type="submit"
              disabled={trabajando || pasoExport.verificando || masterPanel.length === 0}
              className="rounded-lg bg-amber-600 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
            >
              {trabajando || pasoExport.verificando ? 'Exportando…' : 'Exportar cifrado'}
            </button>
          </form>
        )}

        {panel === 'import' && (
          <form onSubmit={alImportar} className="mt-4 space-y-3 border-t border-gray-100 pt-4">
            <p className="text-xs text-gray-600">
              Abre un fichero <code className="font-mono">GL-VAULT-EXPORT</code> y vuelve a cifrar
              sus secretos con la clave de <strong>esta</strong> bóveda (R122). El contenido pasa
              por tu navegador: el servidor nunca ve la passphrase de apertura.
            </p>
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Fichero de export</span>
              <input
                type="file"
                accept="application/json,.json"
                onChange={(e) => void alElegirFichero(e)}
                className="mt-1 block w-full text-xs text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-gray-700 hover:file:bg-gray-200"
              />
            </label>
            {ficheroImport && (
              <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
                {ficheroImport.nombre} · {ficheroImport.datos.item_count} secretos · versión{' '}
                {ficheroImport.datos.format_version} ·{' '}
                {ficheroImport.datos.created_at?.slice(0, 19).replace('T', ' ')}
              </p>
            )}
            <label className="block">
              <span className="text-xs font-medium text-gray-600">
                Passphrase de apertura del fichero
              </span>
              <input
                type="password"
                value={passImport}
                onChange={(e) => setPassImport(e.target.value)}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                required
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              />
            </label>
            <p className="text-xs text-gray-500">
              Los secretos se <strong>añaden</strong>: nada existente se borra ni se sobrescribe.
              Techo de {MAX_IMPORT_POR_FICHERO} secretos por importación.
            </p>
            <button
              type="submit"
              disabled={trabajando || !ficheroImport || passImport.length === 0}
              className="rounded-lg bg-brand px-4 py-2 text-xs font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
            >
              {trabajando ? 'Descifrando e importando…' : 'Importar en esta bóveda'}
            </button>
          </form>
        )}
      </section>

      {abriendoForm && (
        <form onSubmit={alGuardar} className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-800">
              {editando ? 'Editar secreto' : 'Nuevo secreto'}
            </p>
            <button
              type="button"
              onClick={() => { setAbriendoForm(false); setEditando(null); }}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
            </button>
          </div>
          {[
            ['title', 'Título', 'Correo corporativo'],
            ['username', 'Usuario', 'ana@ejemplo.com'],
            ['password', 'Contraseña', ''],
            ['url', 'URL', 'https://example.com'],
          ].map(([campo, etiqueta, placeholder]) => (
            <label key={campo} className="block">
              <span className="text-xs font-medium text-gray-600">{etiqueta}</span>
              <input
                value={form[campo]}
                onChange={(e) => setForm({ ...form, [campo]: e.target.value })}
                placeholder={placeholder}
                autoComplete="off"
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              />
            </label>
          ))}
          <label className="block">
            <span className="text-xs font-medium text-gray-600">Categoría</span>
            <select
              value={form.categoria}
              onChange={(e) => setForm({ ...form, categoria: e.target.value })}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
            >
              {categorias.length === 0 && <option value="general">Claves Generales</option>}
              {categorias.map((c) => (
                <option key={c.clave} value={c.clave}>
                  {c.nombre}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-[11px] text-gray-400">
              Cada secreto sólo lo ve el rol con permiso sobre su categoría (§40).
            </span>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-600">Notas</span>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
            />
          </label>
          <button
            type="submit"
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
          >
            Guardar cifrado
          </button>
        </form>
      )}

      <div className="space-y-3">
        {items.length === 0 && (
          <p className="rounded-xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-400">
            Aún no hay secretos. Crea el primero con «Nuevo».
          </p>
        )}

        {items.map((registro) => (
          <div key={registro.id} className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-gray-900">
                  {registro.datos.title || '(sin título)'}
                </p>
                <p className="truncate text-xs text-gray-500">{registro.datos.username}</p>
                {registro.datos.url && (
                  <p className="truncate text-xs text-gray-400">{registro.datos.url}</p>
                )}
              </div>
              <div className="flex shrink-0 gap-1">
                {puedeEscribir && (
                  <>
                    <button
                      type="button"
                      onClick={() => { setForm({ ...ITEM_VACIO, ...registro.datos }); setEditando(registro.id); setAbriendoForm(true); }}
                      className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                      title="Editar"
                    >
                      <ArrowLeft className="h-3.5 w-3.5 rotate-45" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void alEliminar(registro)}
                      className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                      title="Eliminar"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="mt-3">
              <SecretField
                valor={registro.datos.password || ''}
                etiqueta="Contraseña"
                idItem={registro.id}
                proposito="reveal"
                stepUp={false}
              />
            </div>

            {registro.datos.notes && (
              <p className="mt-3 whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
                {registro.datos.notes}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
