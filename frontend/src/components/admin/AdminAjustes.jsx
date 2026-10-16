import { useCallback, useEffect, useState } from 'react';
import { Loader2, Save, Check, AlertCircle, Eye, EyeOff, Ghost } from '../../lib/icons';
import { siteConfigAPI } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';

// ============================================================
// Ajustes del SITIO PÚBLICO (greenline)
//
// El tema Halloween cuelga de una sola clave de la tabla `site_config`.
// Apagarlo aquí hace que el sitio deje de pintar cursor, sonidos y fantasmas
// para TODOS los visitantes a la vez, sin redeploy.
//
// El interruptor maestro manda sobre el calendario: si está apagado, octubre
// no enciende nada. Si está encendido, se puede ver incluso fuera de octubre
// (útil para probar la campaña antes de tiempo).
// ============================================================

const CLAVE_HALLOWEEN = 'halloween';

const VARIANTES = [
  { id: 'brand', etiqueta: 'Brand (verde)', color: '#009000' },
  { id: 'orange', etiqueta: 'Naranja FFB300', color: '#FFB300' },
  { id: 'black', etiqueta: 'Negro', color: '#0d0d0d' },
];

const VALOR_POR_DEFECTO = { activo: false, variante: 'orange' };

export default function AdminAjustes() {
  const { accessToken } = useAuth();

  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [exito, setExito] = useState('');

  const [activo, setActivo] = useState(VALOR_POR_DEFECTO.activo);
  const [variante, setVariante] = useState(VALOR_POR_DEFECTO.variante);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      const valor = await siteConfigAPI.obtener(CLAVE_HALLOWEEN, accessToken);
      setActivo(Boolean(valor?.activo));
      setVariante(valor?.variante || VALOR_POR_DEFECTO.variante);
    } catch (err) {
      // 404 = nadie ha configurado el tema todavía: estado por defecto.
      if (err?.status !== 404) {
        setError(err?.message || 'No se pudo leer el ajuste del sitio');
      }
    } finally {
      setCargando(false);
    }
  }, [accessToken]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const guardar = async () => {
    setGuardando(true);
    setError('');
    setExito('');
    try {
      await siteConfigAPI.guardar(
        CLAVE_HALLOWEEN,
        { activo, variante },
        accessToken,
      );
      setExito('Tema actualizado. El sitio público lo aplicará en su próxima carga.');
      setTimeout(() => setExito(''), 4000);
    } catch (err) {
      setError(err?.message || 'No se pudo guardar el ajuste');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-4 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Ajustes del sitio</h1>
          <p className="text-sm text-gray-500 mt-1">
            Controla lo que el sitio público muestra a los visitantes, sin redeploy.
          </p>
        </div>
        <button
          type="button"
          onClick={guardar}
          disabled={guardando || cargando}
          className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-lg text-sm font-semibold hover:bg-brand-dark transition-colors shrink-0 disabled:opacity-50"
        >
          {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Guardar
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg mb-4">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {exito && (
        <div className="flex items-center gap-2 bg-green-50 text-green-700 text-sm px-4 py-3 rounded-lg mb-4">
          <Check className="w-4 h-4 shrink-0" />
          {exito}
        </div>
      )}

      {cargando ? (
        <div className="flex items-center gap-2 text-sm text-gray-500 py-10">
          <Loader2 className="w-4 h-4 animate-spin" /> Cargando ajustes…
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          {/* ---------- Halloween ---------- */}
          <div className="flex items-start justify-between gap-4 pb-5 border-b border-gray-100">
            <div className="flex items-start gap-3">
              <span className="w-10 h-10 rounded-lg bg-orange-50 text-orange-500 flex items-center justify-center shrink-0">
                <Ghost className="w-5 h-5" />
              </span>
              <div>
                <h2 className="font-semibold text-gray-900">Tema Halloween</h2>
                <p className="text-sm text-gray-500 mt-1 max-w-lg">
                  Cursor de calavera, sonidos de hoja seca y fantasmas escondidos.
                  Apagarlo aquí detiene todo el tema para todos los visitantes.
                </p>
                <p className="text-xs text-gray-400 mt-2">
                  Ventana natural: del 1 al 31 de octubre. Este interruptor manda
                  sobre el calendario.
                </p>
              </div>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={activo}
              onClick={() => setActivo((a) => !a)}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                activo ? 'bg-brand' : 'bg-gray-200'
              }`}
            >
              <span
                className={`inline-flex h-5 w-5 items-center justify-center rounded-full bg-white shadow transform transition-transform ${
                  activo ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              >
                {activo ? <Eye className="w-3 h-3 text-brand" /> : <EyeOff className="w-3 h-3 text-gray-400" />}
              </span>
            </button>
          </div>

          {/* Variante de color: solo tiene sentido cuando está encendido */}
          {activo && (
            <div className="pt-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">
                Variante de color
              </h3>
              <div className="flex flex-wrap gap-3">
                {VARIANTES.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setVariante(v.id)}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                      variante === v.id
                        ? 'border-brand bg-brand/5 text-brand'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <span
                      className="w-4 h-4 rounded-full border border-black/10 shrink-0"
                      style={{ background: v.color }}
                    />
                    {v.etiqueta}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-3">
                Los tres colores se reparten por la página (fondos, acentos y
                texto) según la variante elegida.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
