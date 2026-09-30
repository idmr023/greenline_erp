import {
  createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState,
} from 'react';
import { useAuth } from './AuthContext';
import { crearClienteBoveda } from '../lib/vault/cliente';
import { crearAlmacenGrants } from '../lib/vault/grants';
import {
  EVENTO,
  POLITICA_DEFECTO,
  estadoInicialLock,
  reducirLock,
  vencido,
} from '../lib/vault/lock';
import { ARGON2 } from '../lib/vault/params';

const VaultContext = createContext(null);

/** Frecuencia con la que se revisa el auto-lock (§9 R26). */
const TICK_MS = 15_000;
/** Umbral para no inundar el reducer con eventos de puntero a 60 Hz. */
const UMBRAL_ACTIVIDAD_MS = 500;

/**
 * Estado de la bóveda para toda la SPA.
 *
 * §9 — el desbloqueo NO es la sesión. `accessToken` vive en AuthContext y
 * sirve para llamar a la API; la clave que descifra vive únicamente en el
 * Web Worker y sólo existe mientras este reducer dice `activa`.
 *
 * `generacion` se incrementa en cada desbloqueo. Los componentes que
 * muestran secretos guardan la generación a la que perteneció su estado:
 * al bloquear y volver a abrir, esa generación ya no coincide y el estado
 * sensible anterior queda descartado sin necesidad de ningún efecto que
 * limpie estado (§9 R27).
 */
export function VaultProvider({ children, politica = POLITICA_DEFECTO }) {
  const { user } = useAuth();
  const sub = user?.id ?? user?.email ?? null;

  const [lock, despachar] = useReducer(reducirLock, undefined, () =>
    estadoInicialLock(Date.now()),
  );
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState(null);
  const [parametros, setParametros] = useState(null);
  const [generacion, setGeneracion] = useState(0);
  /** Espejo síncrono de `generacion` para poder devolverlo desde `desbloquear`. */
  const generacionRef = useRef(0);
  const [grants] = useState(() => crearAlmacenGrants());

  const lockRef = useRef(lock);
  useEffect(() => {
    lockRef.current = lock;
  }, [lock]);

  const clienteRef = useRef(null);

  /** Crea el worker bajo demanda: nada corre hasta que alguien desbloquea. */
  const obtenerCliente = useCallback(() => {
    if (!clienteRef.current) clienteRef.current = crearClienteBoveda();
    return clienteRef.current;
  }, []);

  /** §9 — única vía de apagado: grants, parámetros y worker, de una. */
  const bloquearTodo = useCallback(() => {
    despachar({ tipo: EVENTO.bloqueado });
    grants.limpiar();
    setParametros(null);
    setError(null);
    const cliente = clienteRef.current;
    if (cliente) cliente.bloquear().catch(() => {});
  }, [grants]);

  const desbloquear = useCallback(
    async ({ masterPassword, salt, parametros: parametrosEntrada }) => {
      setOcupado(true);
      setError(null);
      try {
        const cliente = obtenerCliente();
        const r = await cliente.desbloquear(masterPassword, salt, parametrosEntrada || ARGON2);
        despachar({ tipo: EVENTO.desbloqueado, ahora: Date.now() });
        setParametros(r.parametros ?? null);
        generacionRef.current += 1;
        setGeneracion(generacionRef.current);
        // La nueva generación viaja en la respuesta: el llamante la usa para
        // ligar su estado sensible a ESTE desbloqueo y no a uno anterior.
        return { ...r, generacion: generacionRef.current };
      } catch (err) {
        setError(err?.message || 'No se pudo desbloquear la bóveda');
        throw err;
      } finally {
        setOcupado(false);
      }
    },
    [obtenerCliente],
  );

  const registrarActividad = useCallback(() => {
    despachar({ tipo: EVENTO.actividad, ahora: Date.now() });
  }, []);

  const definirModoCritico = useCallback((critico) => {
    despachar({ tipo: critico ? EVENTO.modoCritico : EVENTO.modoEstandar, ahora: Date.now() });
  }, []);

  /**
   * §13 — step-up local: el worker rederiva con la maestra tecleada y
   * compara en tiempo constante con la KEK viva. No devuelve material.
   */
  const verificarMaster = useCallback(async (masterPassword) => {
    if (!clienteRef.current) return false;
    try {
      const r = await clienteRef.current.verificarMaster(masterPassword);
      return r?.correcta === true;
    } catch (err) {
      if (err?.codigo === 'BLOQUEADA') throw err;
      return false;
    }
  }, []);

  /** §9 R27 — al ocultar la pestaña, ventana crítica de 5 min. */
  useEffect(() => {
    if (lock.estado !== 'activa') return undefined;
    const alCambiar = () => definirModoCritico(document.visibilityState === 'hidden');
    document.addEventListener('visibilitychange', alCambiar);
    window.addEventListener('pagehide', bloquearTodo);
    return () => {
      document.removeEventListener('visibilitychange', alCambiar);
      window.removeEventListener('pagehide', bloquearTodo);
    };
  }, [lock.estado, definirModoCritico, bloquearTodo]);

  /** §9 R27 — la interacción reinicia el reloj, con throttle. */
  useEffect(() => {
    if (lock.estado !== 'activa') return undefined;
    let ultimo = 0;
    const alActivar = () => {
      const ahora = Date.now();
      if (ahora - ultimo < UMBRAL_ACTIVIDAD_MS) return;
      ultimo = ahora;
      despachar({ tipo: EVENTO.actividad, ahora });
    };
    const eventos = ['pointerdown', 'keydown', 'wheel', 'touchstart'];
    for (const nombre of eventos) window.addEventListener(nombre, alActivar, { passive: true });
    return () => {
      for (const nombre of eventos) window.removeEventListener(nombre, alActivar);
    };
  }, [lock.estado]);

  /** §9 R26 — revisión del vencimiento. */
  useEffect(() => {
    if (lock.estado !== 'activa') return undefined;
    const id = setInterval(() => {
      if (vencido(lockRef.current, Date.now(), politica)) bloquearTodo();
    }, TICK_MS);
    return () => clearInterval(id);
  }, [lock.estado, politica, bloquearTodo]);

  /**
   * §9 R27/R28 — perder o cambiar la identidad bloquea la bóveda.
   * Sólo actúa sobre transiciones reales: en el montaje inicial no hay
   * nada que apagar y no debe provocar ningún ciclo de estado.
   */
  const subAnterior = useRef(sub);
  useEffect(() => {
    const anterior = subAnterior.current;
    subAnterior.current = sub;
    if (anterior !== sub) bloquearTodo();
  }, [sub, bloquearTodo]);

  /** Al desmontar el árbol no se deja nada en memoria. */
  useEffect(() => {
    const cliente = clienteRef.current;
    return () => {
      grants.limpiar();
      cliente?.destruir();
    };
  }, [grants]);

  const valor = useMemo(
    () => ({
      estado: lock.estado,
      modo: lock.modo,
      generacion,
      ocupado,
      error,
      parametros,
      sub,
      grants,
      desbloquear,
      bloquear: bloquearTodo,
      registrarActividad,
      definirModoCritico,
      verificarMaster,
      /** Uso avanzado: operaciones criptográficas directas (Fase 3+). */
      obtenerCliente,
      limpiarError: () => setError(null),
    }),
    [
      lock.estado, lock.modo, generacion, ocupado, error, parametros, sub, grants,
      desbloquear, bloquearTodo, registrarActividad, definirModoCritico,
      verificarMaster, obtenerCliente,
    ],
  );

  return <VaultContext.Provider value={valor}>{children}</VaultContext.Provider>;
}

export function useVault() {
  const ctx = useContext(VaultContext);
  if (!ctx) throw new Error('useVault debe usarse dentro de VaultProvider');
  return ctx;
}
