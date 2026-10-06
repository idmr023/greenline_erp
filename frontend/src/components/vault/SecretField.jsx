import { useCallback, useEffect, useRef, useState } from 'react';
import { Copy, Eye, EyeOff, Lock } from '../../lib/icons';
import { useVault } from '../../contexts/VaultContext';
import { useStepUp } from '../../hooks/useStepUp';
import { copiarAlPortapapeles, RETENCION_DEFECTO_MS } from '../../lib/vault/clipboard';

const MASCARA = '••••••••••••••••';

/**
 * Visualización segura de un secreto — Bóveda Segura V5 §12, §14, §42.
 *
 * Principios que este componente materializa:
 *
 * - Oculto por defecto; el secreto **no está en el DOM** mientras está
 *   oculto (ni en `value`, ni en `title`, ni en `aria-label`).
 * - Revelar/copiando con `stepUp` (§13): se vuelve a pedir la contraseña y
 *   sólo devuelve un sí/no. Con `stepUp={false}` no se pregunta nada (§53):
 *   basta con tener la bóveda desbloqueada. El ERP usa `stepUp={false}`
 *   porque el step-up de reveal fue retirado a petición del equipo.
 * - Auto-hide con timeout y limpieza del estado (§12 R35).
 * - Con step-up, copiar exige lo mismo (§14 R44) y avisa del historial del
 *   sistema operativo (R47): el borrado no es garantía (§53 L5).
 * - En modo revelado se pasa a ventana crítica de auto-lock (§9 R27).
 *
 * El estado sensible va ligado a `generacion` del VaultContext: si la
 * bóveda se bloquea y vuelve a abrirse, la generación cambia y cualquier
 * reveal o contraseña maestra quedan descartados sin necesidad de un
 * efecto que los limpie (§9 R25).
 */
export default function SecretField({
  valor,
  etiqueta = 'Contraseña',
  idItem = null,
  proposito = 'reveal',
  stepUp = true,
  autoHideMs = 15_000,
  permitirCopiar = true,
  retencionPortapapeles = RETENCION_DEFECTO_MS,
  className = '',
}) {
  const { estado, ocupado, generacion, definirModoCritico, registrarActividad } = useVault();
  const desbloqueada = estado === 'activa';
  const { autorizar, verificando, error, limpiar } = useStepUp({ proposito, itemRef: idItem });

  const [seguridad, setSeguridad] = useState({ gen: -1, visible: false, preguntando: false, master: '' });
  const [avisoCopia, setAvisoCopia] = useState(null);
  const [errorCopia, setErrorCopia] = useState(null);

  const vigente = seguridad.gen === generacion;
  const visible = vigente && seguridad.visible && desbloqueada;
  const preguntando = vigente && seguridad.preguntando && desbloqueada;
  const master = vigente ? seguridad.master : '';

  const temporizador = useRef(null);

  const actualizar = useCallback(
    (parche) => setSeguridad((prev) => ({ ...prev, gen: generacion, ...parche })),
    [generacion],
  );

  const pararTemporizador = useCallback(() => {
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = null;
  }, []);

  useEffect(() => pararTemporizador, [pararTemporizador]);

  const ocultar = useCallback(() => {
    pararTemporizador();
    actualizar({ visible: false, preguntando: false, master: '' });
    definirModoCritico(false);
  }, [actualizar, definirModoCritico, pararTemporizador]);

  const revelar = useCallback(() => {
    pararTemporizador();
    registrarActividad();
    definirModoCritico(true);
    actualizar({ visible: true, preguntando: false, master: '' });
    temporizador.current = setTimeout(ocultar, autoHideMs);
  }, [actualizar, autoHideMs, definirModoCritico, ocultar, pararTemporizador, registrarActividad]);

  const alMostrar = useCallback(() => {
    if (!desbloqueada) return;
    setErrorCopia(null);
    limpiar();
    if (!stepUp) {
      revelar();
      return;
    }
    actualizar({ preguntando: !preguntando });
  }, [actualizar, desbloqueada, limpiar, preguntando, revelar, stepUp]);

  const pedirAutorizacion = useCallback(async () => {
    const concedido = await autorizar(master);
    if (concedido) revelar();
  }, [autorizar, master, revelar]);

  const alCopiar = useCallback(async () => {
    if (!desbloqueada || !valor) return;
    setErrorCopia(null);
    setAvisoCopia(null);

    // Copiar dentro de una ventana de reveal ya autorizado no pide la
    // maestra otra vez: es la misma acción de alto riesgo en curso (§14).
    if (!visible && stepUp) {
      const concedido = await autorizar(master);
      if (!concedido) {
        actualizar({ preguntando: true });
        return;
      }
      definirModoCritico(true);
      actualizar({ visible: true, preguntando: false, master: '' });
      pararTemporizador();
      temporizador.current = setTimeout(ocultar, autoHideMs);
    }

    try {
      const control = await copiarAlPortapapeles(valor, { retencionMs: retencionPortapapeles });
      setAvisoCopia(control.aviso);
      registrarActividad();
    } catch (err) {
      setErrorCopia(err?.message || 'No se pudo copiar al portapapeles.');
    }
  }, [
    actualizar, autorizar, definirModoCritico, desbloqueada, master, ocultar,
    pararTemporizador, registrarActividad, retencionPortapapeles, stepUp, valor,
    visible, autoHideMs,
  ]);

  if (!desbloqueada) {
    return (
      <div className={`flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500 ${className}`}>
        <Lock className="h-3.5 w-3.5 shrink-0" />
        <span>Bóveda bloqueada — desbloquea para ver {etiqueta.toLowerCase()}.</span>
      </div>
    );
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2">
        {/* El secreto sólo entra en el DOM cuando está revelado. */}
        <span
          className={`flex-1 select-text break-all text-sm ${visible ? 'text-gray-900' : 'tracking-widest text-gray-400'}`}
          aria-live="polite"
        >
          {visible ? valor : MASCARA}
        </span>

        <button
          type="button"
          onClick={alMostrar}
          disabled={ocupado || verificando}
          title={visible ? `Ocultar ${etiqueta.toLowerCase()}` : `Mostrar ${etiqueta.toLowerCase()}`}
          aria-label={visible ? `Ocultar ${etiqueta.toLowerCase()}` : `Mostrar ${etiqueta.toLowerCase()}`}
          className="rounded p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 disabled:opacity-40"
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>

        {permitirCopiar && (
          <button
            type="button"
            onClick={alCopiar}
            disabled={ocupado || verificando || !valor}
            title="Copiar"
            aria-label="Copiar al portapapeles"
            className="rounded p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 disabled:opacity-40"
          >
            <Copy className="h-4 w-4" />
          </button>
        )}
      </div>

      {preguntando && stepUp && (
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void pedirAutorizacion();
          }}
        >
          <input
            type="password"
            value={master}
            onChange={(e) => actualizar({ master: e.target.value })}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="Contraseña maestra"
            aria-label="Contraseña maestra para autorizar"
            className="min-w-0 flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
          />
          <button
            type="submit"
            disabled={verificando || master.length === 0}
            className="rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-dark disabled:opacity-50"
          >
            {verificando ? 'Verificando…' : 'Autorizar'}
          </button>
        </form>
      )}

      {error && (
        <p className="text-xs font-medium text-red-600" role="alert">
          {error}
        </p>
      )}
      {errorCopia && (
        <p className="text-xs font-medium text-red-600" role="alert">
          {errorCopia}
        </p>
      )}
      {avisoCopia && (
        <p className="text-xs text-amber-700" role="status">
          Copiado. {avisoCopia}
        </p>
      )}
      {visible && (
        <p className="text-xs text-gray-400">
          Se ocultará automáticamente en {Math.round(autoHideMs / 1000)} s.
        </p>
      )}
    </div>
  );
}
