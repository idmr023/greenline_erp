import { useCallback, useEffect, useState } from 'react';
import { Loader2, Save, Check, AlertCircle, Eye, EyeOff, Ghost, Gift } from '../../lib/icons';
import { siteConfigAPI } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
import { rolesDe, tieneRol } from '../../lib/roles';

const CLAVE_HALLOWEEN = 'halloween';
const CLAVE_ANIVERSARIO = 'aniversario';
const VARIANTES = [
  { id: 'brand', etiqueta: 'Brand (verde)', color: '#009000' },
  { id: 'orange', etiqueta: 'Naranja FFB300', color: '#FFB300' },
  { id: 'black', etiqueta: 'Negro', color: '#0d0d0d' },
];
const VALOR_HALLOWEEN = { activo: false, variante: 'orange' };

function Interruptor({ activo, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      onClick={onChange}
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
  );
}

export default function AdminAjustes() {
  const { accessToken, user } = useAuth();
  const puedeGestionarTemas = tieneRol(['ADMIN', 'DESARROLLADOR_WEB'], rolesDe(user));
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [exito, setExito] = useState('');
  const [activo, setActivo] = useState(VALOR_HALLOWEEN.activo);
  const [variante, setVariante] = useState(VALOR_HALLOWEEN.variante);
  const [aniversarioActivo, setAniversarioActivo] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      const [halloween, aniversario] = await Promise.all([
        siteConfigAPI.obtener(CLAVE_HALLOWEEN, accessToken).catch((err) => {
          if (err?.status !== 404) throw err;
          return VALOR_HALLOWEEN;
        }),
        siteConfigAPI.obtener(CLAVE_ANIVERSARIO, accessToken).catch((err) => {
          if (err?.status !== 404) throw err;
          return { activo: false };
        }),
      ]);
      setActivo(Boolean(halloween?.activo));
      setVariante(halloween?.variante || VALOR_HALLOWEEN.variante);
      setAniversarioActivo(Boolean(aniversario?.activo));
    } catch (err) {
      setError(err?.message || 'No se pudo leer la configuración de temas');
    } finally {
      setCargando(false);
    }
  }, [accessToken]);

  useEffect(() => {
    if (puedeGestionarTemas) cargar();
  }, [cargar, puedeGestionarTemas]);

  const guardar = async () => {
    setGuardando(true);
    setError('');
    setExito('');
    try {
      await Promise.all([
        siteConfigAPI.guardar(CLAVE_HALLOWEEN, { activo, variante }, accessToken),
        siteConfigAPI.guardar(CLAVE_ANIVERSARIO, { activo: aniversarioActivo }, accessToken),
      ]);
      setExito('Temas actualizados. El sitio público los aplicará en su próxima carga.');
      setTimeout(() => setExito(''), 4000);
    } catch (err) {
      setError(err?.message || 'No se pudo guardar la configuración de temas');
    } finally {
      setGuardando(false);
    }
  };

  if (!puedeGestionarTemas) return null;

  return (
    <div>
      <div className="flex items-center justify-between gap-4 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gestor de temas</h1>
          <p className="text-sm text-gray-500 mt-1">
            Controla qué temas y efectos del sitio público están visibles.
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
          <Loader2 className="w-4 h-4 animate-spin" /> Cargando temas…
        </div>
      ) : (
        <div className="space-y-5">
          <section className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <span className="w-10 h-10 rounded-lg bg-orange-50 text-orange-500 flex items-center justify-center shrink-0">
                  <Ghost className="w-5 h-5" />
                </span>
                <div>
                  <h2 className="font-semibold text-gray-900">Tema Halloween</h2>
                  <p className="text-sm text-gray-500 mt-1 max-w-lg">
                    Cursor, sonidos y fantasmas del tema Halloween.
                  </p>
                </div>
              </div>
              <Interruptor activo={activo} onChange={() => setActivo((actual) => !actual)} />
            </div>
            {activo && (
              <div className="pt-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Variante de color</h3>
                <div className="flex flex-wrap gap-3">
                  {VARIANTES.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setVariante(item.id)}
                      className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium ${
                        variante === item.id
                          ? 'border-brand bg-brand/5 text-brand'
                          : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      <span className="w-4 h-4 rounded-full border border-black/10" style={{ background: item.color }} />
                      {item.etiqueta}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>

          <section className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <span className="w-10 h-10 rounded-lg bg-yellow-50 text-yellow-600 flex items-center justify-center shrink-0">
                  <Gift className="w-5 h-5" />
                </span>
                <div>
                  <h2 className="font-semibold text-gray-900">Tema aniversario</h2>
                  <p className="text-sm text-gray-500 mt-1 max-w-lg">
                    Atmósfera, efectos y promociones visuales de aniversario.
                  </p>
                </div>
              </div>
              <Interruptor
                activo={aniversarioActivo}
                onChange={() => setAniversarioActivo((actual) => !actual)}
              />
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
