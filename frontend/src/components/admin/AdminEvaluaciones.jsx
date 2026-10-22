import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { tallerAPI, prestamosVehiculoAPI } from '../../lib/api';
import { mesActual, nombreMes, ultimosMeses } from '../../utils/meses';
import {
  Award, Plus, RefreshCw, Trash2, X, Pencil, Star, Users, MapPin,
  Calendar,
} from '../../lib/icons';

const CATEGORIA_BADGE = {
  incentivo: 'bg-green-50 text-green-700 border-green-200',
  incidencia: 'bg-red-50 text-red-700 border-red-200',
  calidad: 'bg-blue-50 text-blue-700 border-blue-200',
};

const CATEGORIA_LABEL = {
  incentivo: 'Incentivo',
  incidencia: 'Incidencia',
  calidad: 'Calidad',
};

function formatFecha(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('es-PE', {
      day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC',
    });
  } catch {
    return String(iso).slice(0, 10);
  }
}

export default function AdminEvaluaciones() {
  const { accessToken, ability } = useAuth();
  const puedeEditar = ability.can('write', 'taller');

  const [tab, setTab] = useState('registrar');
  const [mes, setMes] = useState(mesActual());
  const [tiendas, setTiendas] = useState([]);
  const [tecnicos, setTecnicos] = useState([]);
  const [criterios, setCriterios] = useState([]);
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);

  const cargarCatalogos = useCallback(async () => {
    try {
      const [t, tec, cr] = await Promise.all([
        prestamosVehiculoAPI.listarTiendas(accessToken),
        tallerAPI.listarTecnicos({}, accessToken),
        tallerAPI.listarCriterios(accessToken),
      ]);
      setTiendas(t.tiendas || []);
      setTecnicos(tec.tecnicos || []);
      setCriterios(cr.criterios || []);
    } catch (err) {
      setError(err?.error || err?.message || 'No se pudieron cargar los catálogos.');
    }
  }, [accessToken]);

  useEffect(() => { cargarCatalogos(); }, [cargarCatalogos]);

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Award className="w-6 h-6 text-brand" /> Evaluación de Incentivos · Armadores
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Cada registro es un motivo o incidencia de un técnico. El puntaje general sale del historial.
          </p>
          <p className="text-xs text-gray-400 mt-1">
            El histórico del cierre de mes se importa de la hoja «Evaluación Armadores (Cierre de Mes)»
            de Google Drive; desde el panel se registran las incidencias día a día.
          </p>
        </div>
        <button
          onClick={cargarCatalogos}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <RefreshCw className="w-4 h-4" /> Recargar
        </button>
      </div>

      <div className="flex gap-1 mb-6 border-b border-gray-200 overflow-x-auto">
        {[
          { key: 'registrar', label: 'Registrar evaluación' },
          { key: 'historial', label: 'Historial' },
          { key: 'puntajes', label: 'Puntaje general' },
          { key: 'rotacion', label: 'Rotación de técnicos' },
          { key: 'criterios', label: 'Condiciones' },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg -mb-px border-b-2 transition-colors whitespace-nowrap ${
              tab === t.key
                ? 'border-brand text-brand'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {(error || aviso) && (
        <div className={`mb-4 rounded-xl p-3 text-sm border ${
          error ? 'bg-red-50 border-red-200 text-red-700' : 'bg-green-50 border-green-200 text-green-700'
        }`}
        >
          {error || aviso}
          <button onClick={() => { setError(null); setAviso(null); }} className="float-right">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {tab === 'registrar' && (
        <FormEvaluacion
          accessToken={accessToken}
          puedeEditar={puedeEditar}
          tiendas={tiendas}
          tecnicos={tecnicos}
          criterios={criterios}
          onSaved={async (mensaje) => { setAviso(mensaje); await cargarCatalogos(); }}
          onError={setError}
        />
      )}

      {tab === 'historial' && (
        <Historial
          accessToken={accessToken}
          puedeEditar={puedeEditar}
          mes={mes}
          onMes={setMes}
          tiendas={tiendas}
          tecnicos={tecnicos}
          criterios={criterios}
          onError={setError}
          onAviso={setAviso}
        />
      )}

      {tab === 'puntajes' && (
        <Puntajes
          accessToken={accessToken}
          mes={mes}
          onMes={setMes}
          tiendas={tiendas}
        />
      )}

      {tab === 'rotacion' && (
        <Rotacion
          accessToken={accessToken}
          puedeEditar={puedeEditar}
          tiendas={tiendas}
          tecnicos={tecnicos}
          onRecargar={cargarCatalogos}
          onError={setError}
          onAviso={setAviso}
        />
      )}

      {tab === 'criterios' && (
        <Criterios
          accessToken={accessToken}
          puedeEditar={puedeEditar}
          criterios={criterios}
          onRecargar={cargarCatalogos}
          onError={setError}
          onAviso={setAviso}
        />
      )}
    </div>
  );
}

// ============================================================
// Filtro de mes (compartido por las pestañas)
// ============================================================

function FiltroMes({ mes, onMes, tiendas, tiendaId = '', onTienda }) {
  return (
    <div className="flex flex-wrap gap-3 mb-4 items-end">
      <label className="text-xs text-gray-500">
        Mes
        <select
          value={mes}
          onChange={(e) => onMes(e.target.value)}
          className="block mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white"
        >
          <option value="">Todos los meses</option>
          {ultimosMeses(18).map((m) => (
            <option key={m} value={m}>{nombreMes(m)}</option>
          ))}
        </select>
      </label>
      {tiendas?.length > 1 && (
        <label className="text-xs text-gray-500">
          Tienda
          <select
            value={tiendaId}
            onChange={(e) => onTienda?.(e.target.value)}
            className="block mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white"
          >
            <option value="">Todas</option>
            {tiendas.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}

// ============================================================
// Formulario de registro
// ============================================================

function FormEvaluacion({ accessToken, puedeEditar, tiendas, tecnicos, criterios, onSaved, onError }) {
  const hoy = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    fecha: hoy,
    tecnicoId: '',
    tiendaId: '',
    criterioId: '',
    puntaje: '',
    descripcion: '',
    notas: '',
  });
  const [saving, setSaving] = useState(false);
  const [nuevoTecnico, setNuevoTecnico] = useState('');
  const [creandoTecnico, setCreandoTecnico] = useState(false);

  const criterio = criterios.find((c) => c.id === form.criterioId);

  useEffect(() => {
    if (!criterio) return;
    setForm((f) => ({ ...f, puntaje: String(criterio.maximo) }));
  }, [form.criterioId, criterio]);

  async function crearTecnico() {
    const nombre = nuevoTecnico.trim();
    if (nombre.length < 2) return;
    setCreandoTecnico(true);
    try {
      const creado = await tallerAPI.crearTecnico({ nombre }, accessToken);
      setForm((f) => ({ ...f, tecnicoId: creado.id }));
      setNuevoTecnico('');
      onSaved(`Técnico «${creado.nombre}» creado.`);
    } catch (err) {
      onError(err?.error || err?.message || 'No se pudo crear el técnico.');
    } finally {
      setCreandoTecnico(false);
    }
  }

  async function submit(e) {
    e.preventDefault();
    if (!form.tecnicoId) { onError('Selecciona el técnico.'); return; }
    if (!form.tiendaId) { onError('Selecciona la tienda donde ocurrió.'); return; }
    if (!form.criterioId) { onError('Selecciona la condición a evaluar.'); return; }
    if (form.puntaje === '') { onError('Ingresa el puntaje.'); return; }

    setSaving(true);
    try {
      await tallerAPI.crearEvaluacion({
        ...form,
        puntaje: Number(form.puntaje),
      }, accessToken);
      setForm({ ...form, puntaje: '', descripcion: '', notas: '' });
      onSaved('Evaluación registrada en el historial.');
    } catch (err) {
      onError(err?.error || err?.message || 'No se pudo registrar la evaluación.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm max-w-2xl space-y-4">
      <h2 className="text-lg font-semibold text-gray-900">Nueva evaluación</h2>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Fecha *</label>
          <input
            type="date"
            value={form.fecha}
            onChange={(e) => setForm({ ...form, fecha: e.target.value })}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Tienda donde ocurrió *</label>
          <select
            value={form.tiendaId}
            onChange={(e) => setForm({ ...form, tiendaId: e.target.value })}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            required
          >
            <option value="">Seleccionar…</option>
            {tiendas.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Técnico *</label>
        <div className="flex gap-2">
          <select
            value={form.tecnicoId}
            onChange={(e) => setForm({ ...form, tecnicoId: e.target.value })}
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm"
            required
          >
            <option value="">Seleccionar…</option>
            {tecnicos.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}{t.tienda ? ` (${t.tienda.name})` : ''}
              </option>
            ))}
          </select>
          {puedeEditar && (
            <div className="flex gap-1">
              <input
                value={nuevoTecnico}
                onChange={(e) => setNuevoTecnico(e.target.value)}
                placeholder="Nombre nuevo"
                className="w-36 border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={crearTecnico}
                disabled={creandoTecnico || nuevoTecnico.trim().length < 2}
                className="px-3 py-2 rounded-lg bg-gray-900 text-white text-sm disabled:opacity-40"
                title="Dar de alta un técnico"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
        <p className="text-xs text-gray-400 mt-1">
          El técnico puede estar rotado: se registra la tienda donde PASÓ, no su tienda base.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Condición a evaluar *</label>
          <select
            value={form.criterioId}
            onChange={(e) => setForm({ ...form, criterioId: e.target.value })}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            required
          >
            <option value="">Seleccionar…</option>
            {criterios.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre} ({CATEGORIA_LABEL[c.categoria] || c.categoria})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Puntaje * {criterio && <span className="text-gray-400 font-normal">({criterio.minimo} a {criterio.maximo})</span>}
          </label>
          <input
            type="number"
            min={criterio?.minimo ?? 0}
            max={criterio?.maximo ?? 10}
            value={form.puntaje}
            onChange={(e) => setForm({ ...form, puntaje: e.target.value })}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            required
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Motivo / descripción</label>
        <textarea
          value={form.descripcion}
          onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
          rows={2}
          placeholder="Ej: incendio en el tablero por cortocircuito; quemó el arnés…"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
        <textarea
          value={form.notas}
          onChange={(e) => setForm({ ...form, notas: e.target.value })}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
          rows={2}
        />
      </div>

      <div className="flex justify-end pt-2">
        <button
          type="submit"
          disabled={saving || !puedeEditar}
          className="px-4 py-2 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand/90 disabled:opacity-50"
        >
          {saving ? 'Guardando…' : 'Registrar evaluación'}
        </button>
      </div>
    </form>
  );
}

// ============================================================
// Historial
// ============================================================

function Historial({ accessToken, puedeEditar, mes, onMes, tiendas, tecnicos, criterios, onError, onAviso }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtros, setFiltros] = useState({ tecnicoId: '', criterioId: '', tiendaId: '', q: '' });
  const [editando, setEditando] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await tallerAPI.listarEvaluaciones(
        { mes, ...filtros }, accessToken,
      );
      setItems(data.evaluaciones || []);
    } catch (err) {
      onError(err?.error || err?.message || 'Error cargando el historial.');
    } finally {
      setLoading(false);
    }
  }, [mes, filtros, accessToken, onError]);

  useEffect(() => { load(); }, [load]);

  async function eliminar(id) {
    if (!window.confirm('¿Eliminar esta evaluación del historial?')) return;
    try {
      await tallerAPI.eliminarEvaluacion(id, accessToken);
      onAviso('Evaluación eliminada.');
      load();
    } catch (err) {
      onError(err?.error || err?.message || 'No se pudo eliminar.');
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-4 items-end">
        <label className="text-xs text-gray-500">
          Mes
          <select
            value={mes}
            onChange={(e) => onMes(e.target.value)}
            className="block mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white"
          >
            <option value="">Todos los meses</option>
            {ultimosMeses(18).map((m) => (
              <option key={m} value={m}>{nombreMes(m)}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-gray-500">
          Técnico
          <select
            value={filtros.tecnicoId}
            onChange={(e) => setFiltros({ ...filtros, tecnicoId: e.target.value })}
            className="block mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white"
          >
            <option value="">Todos</option>
            {tecnicos.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </select>
        </label>
        <label className="text-xs text-gray-500">
          Condición
          <select
            value={filtros.criterioId}
            onChange={(e) => setFiltros({ ...filtros, criterioId: e.target.value })}
            className="block mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white"
          >
            <option value="">Todas</option>
            {criterios.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </label>
        {tiendas.length > 1 && (
          <label className="text-xs text-gray-500">
            Tienda
            <select
              value={filtros.tiendaId}
              onChange={(e) => setFiltros({ ...filtros, tiendaId: e.target.value })}
              className="block mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white"
            >
              <option value="">Todas las tiendas</option>
              {tiendas.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
        )}
        <label className="text-xs text-gray-500 flex-1 min-w-[180px]">
          Buscar
          <input
            type="text"
            value={filtros.q}
            onChange={(e) => setFiltros({ ...filtros, q: e.target.value })}
            placeholder="Motivo, notas, técnico…"
            className="block mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm w-full"
          />
        </label>
        <button
          onClick={load}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {loading ? (
        <div className="text-gray-400 text-sm py-12 text-center">Cargando historial…</div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center text-sm text-gray-500">
          No hay evaluaciones con esos filtros.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="p-4">Fecha</th>
                  <th className="p-4">Técnico</th>
                  <th className="p-4">Tienda</th>
                  <th className="p-4">Condición</th>
                  <th className="p-4">Puntaje</th>
                  <th className="p-4">Motivo</th>
                  {puedeEditar && <th className="p-4 text-right">Acciones</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {items.map((ev) => (
                  <tr key={ev.id} className="hover:bg-gray-50/50">
                    <td className="p-4 whitespace-nowrap text-gray-600">{formatFecha(ev.fecha)}</td>
                    <td className="p-4 font-medium text-gray-900">{ev.tecnico?.nombre}</td>
                    <td className="p-4 text-gray-600">{ev.tienda?.name}</td>
                    <td className="p-4">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium border ${CATEGORIA_BADGE[ev.criterio?.categoria] || ''}`}>
                        {ev.criterio?.nombre}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className={`font-semibold ${ev.puntaje < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                        {ev.puntaje}
                      </span>
                    </td>
                    <td className="p-4 text-gray-600 max-w-[260px] truncate" title={ev.descripcion || ''}>
                      {ev.descripcion || '—'}
                    </td>
                    {puedeEditar && (
                      <td className="p-4 text-right space-x-1">
                        <button
                          onClick={() => setEditando(ev)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50"
                        >
                          <Pencil className="w-3.5 h-3.5" /> Editar
                        </button>
                        <button
                          onClick={() => eliminar(ev.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-red-200 text-xs font-medium text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 text-xs text-gray-400 border-t border-gray-100">
            {items.length} evaluación(es)
          </div>
        </div>
      )}

      {editando && (
        <ModalEditarEvaluacion
          evaluacion={editando}
          accessToken={accessToken}
          onClose={() => setEditando(null)}
          onSaved={() => { setEditando(null); load(); onAviso('Evaluación actualizada.'); }}
          onError={onError}
        />
      )}
    </div>
  );
}

function ModalEditarEvaluacion({ evaluacion, accessToken, onClose, onSaved, onError }) {
  const [form, setForm] = useState({
    fecha: String(evaluacion.fecha).slice(0, 10),
    tiendaId: evaluacion.tiendaId,
    puntaje: String(evaluacion.puntaje),
    descripcion: evaluacion.descripcion || '',
    notas: evaluacion.notas || '',
  });
  const [tiendas, setTiendas] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    prestamosVehiculoAPI.listarTiendas(accessToken)
      .then((d) => setTiendas(d.tiendas || []))
      .catch(() => {});
  }, [accessToken]);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await tallerAPI.actualizarEvaluacion(evaluacion.id, {
        ...form,
        puntaje: Number(form.puntaje),
      }, accessToken);
      onSaved();
    } catch (err) {
      onError(err?.error || err?.message || 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">Editar evaluación</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fecha</label>
              <input
                type="date"
                value={form.fecha}
                onChange={(e) => setForm({ ...form, fecha: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Puntaje</label>
              <input
                type="number"
                value={form.puntaje}
                onChange={(e) => setForm({ ...form, puntaje: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tienda</label>
            <select
              value={form.tiendaId}
              onChange={(e) => setForm({ ...form, tiendaId: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            >
              {tiendas.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Motivo / descripción</label>
            <textarea
              value={form.descripcion}
              onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              rows={3}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
            <textarea
              value={form.notas}
              onChange={(e) => setForm({ ...form, notas: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              rows={2}
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50">
              Cancelar
            </button>
            <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-brand text-white text-sm font-medium disabled:opacity-50">
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============================================================
// Puntaje general (consolidado)
// ============================================================

function Puntajes({ accessToken, mes, onMes, tiendas }) {
  const [data, setData] = useState(null);
  const [tiendaId, setTiendaId] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await tallerAPI.puntajes({ mes, tiendaId }, accessToken);
      setData(d);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [mes, tiendaId, accessToken]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <FiltroMes mes={mes} onMes={onMes} tiendas={tiendas} tiendaId={tiendaId} onTienda={setTiendaId} />

      {loading ? (
        <div className="text-gray-400 text-sm py-12 text-center">Calculando puntajes…</div>
      ) : !data || data.total === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center text-sm text-gray-500">
          Sin evaluaciones en el periodo seleccionado.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.puntajes.map((p) => (
              <div key={p.tecnicoId} className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                      <Star className="w-4 h-4 text-amber-500" /> {p.nombre}
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {p.evaluaciones} evaluación(es) · {p.tiendas.length} tienda(s)
                    </p>
                  </div>
                  <div className="text-right">
                    <span className={`text-2xl font-bold ${p.general >= 70 ? 'text-green-600' : p.general >= 40 ? 'text-amber-600' : 'text-red-600'}`}>
                      {p.general}
                    </span>
                    <span className="text-xs text-gray-400 block">puntaje general</span>
                  </div>
                </div>

                <div className="w-full bg-gray-100 rounded-full h-2 mb-4">
                  <div
                    className={`h-2 rounded-full ${p.general >= 70 ? 'bg-green-500' : p.general >= 40 ? 'bg-amber-500' : 'bg-red-500'}`}
                    style={{ width: `${Math.max(0, Math.min(100, p.general))}%` }}
                  />
                </div>

                <div className="space-y-2 text-xs">
                  {p.tiendas.map((t) => (
                    <div key={t.id} className="flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5 text-gray-400" />
                      <span className="font-medium text-gray-700 flex-1">{t.nombre}</span>
                      <span className="text-gray-500">{t.evaluaciones} eval.</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm mt-4">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Users className="w-4 h-4 text-brand" /> Reparto por tienda
            </h3>
            <p className="text-xs text-gray-500 mb-3">
              Los técnicos rotan: cada tienda acumula las evaluaciones de quien estaba ahí, sin importar su tienda base.
            </p>
            <div className="space-y-2">
              {data.porTienda.map((t) => (
                <div key={t.id} className="flex items-start gap-2 text-sm">
                  <MapPin className="w-4 h-4 text-gray-400 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-medium text-gray-800">{t.nombre}</p>
                    <p className="text-xs text-gray-500">{t.tecnicos.join(', ')}</p>
                  </div>
                  <span className="text-xs text-gray-500">{t.evaluaciones} eval.</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================
// Rotación de técnicos
// ============================================================

function Rotacion({ accessToken, puedeEditar, tiendas, tecnicos, onRecargar, onError, onAviso }) {
  const [form, setForm] = useState({ tecnicoId: '', tiendaId: '', desde: '', hasta: '', motivo: '' });
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!form.tecnicoId || !form.tiendaId || !form.desde) {
      onError('Completa técnico, tienda y fecha de inicio.');
      return;
    }
    setSaving(true);
    try {
      await tallerAPI.crearRotacion(form.tecnicoId, {
        tiendaId: form.tiendaId,
        desde: form.desde,
        hasta: form.hasta || null,
        motivo: form.motivo || null,
      }, accessToken);
      setForm({ tecnicoId: '', tiendaId: '', desde: '', hasta: '', motivo: '' });
      onAviso('Rotación registrada.');
      onRecargar();
    } catch (err) {
      onError(err?.error || err?.message || 'No se pudo registrar la rotación.');
    } finally {
      setSaving(false);
    }
  }

  async function eliminarRotacion(tecnicoId, rotacionId) {
    if (!window.confirm('¿Eliminar este registro de rotación?')) return;
    try {
      await tallerAPI.eliminarRotacion(tecnicoId, rotacionId, accessToken);
      onAviso('Rotación eliminada.');
      onRecargar();
    } catch (err) {
      onError(err?.error || err?.message || 'No se pudo eliminar.');
    }
  }

  return (
    <div className="space-y-6">
      {puedeEditar && (
        <form onSubmit={submit} className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm max-w-3xl">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Registrar rotación de tienda</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Técnico</label>
              <select
                value={form.tecnicoId}
                onChange={(e) => setForm({ ...form, tecnicoId: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                required
              >
                <option value="">Seleccionar…</option>
                {tecnicos.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tienda</label>
              <select
                value={form.tiendaId}
                onChange={(e) => setForm({ ...form, tiendaId: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                required
              >
                <option value="">Seleccionar…</option>
                {tiendas.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Desde</label>
              <input
                type="date"
                value={form.desde}
                onChange={(e) => setForm({ ...form, desde: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Hasta</label>
              <input
                type="date"
                value={form.hasta}
                onChange={(e) => setForm({ ...form, hasta: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Motivo</label>
            <input
              value={form.motivo}
              onChange={(e) => setForm({ ...form, motivo: e.target.value })}
              placeholder="Ej: cobertura por vacaciones"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div className="flex justify-end mt-4">
            <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-brand text-white text-sm font-medium disabled:opacity-50">
              {saving ? 'Guardando…' : 'Registrar rotación'}
            </button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              <th className="p-4">Técnico</th>
              <th className="p-4">Tienda base</th>
              <th className="p-4">Rotaciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {tecnicos.length === 0 && (
              <tr><td colSpan={3} className="p-8 text-center text-sm text-gray-500">No hay técnicos registrados.</td></tr>
            )}
            {tecnicos.map((t) => (
              <tr key={t.id} className="hover:bg-gray-50/50 align-top">
                <td className="p-4 font-medium text-gray-900">{t.nombre}</td>
                <td className="p-4 text-gray-600">{t.tienda?.name || '—'}</td>
                <td className="p-4">
                  {t.rotaciones?.length ? (
                    <ul className="space-y-1">
                      {t.rotaciones.map((r) => (
                        <li key={r.id} className="flex items-center gap-2 text-xs text-gray-600">
                          <Calendar className="w-3.5 h-3.5 text-gray-400" />
                          <span className="font-medium">{r.tienda?.name}</span>
                          <span className="text-gray-400">
                            {String(r.desde).slice(0, 10)} {r.hasta ? `→ ${String(r.hasta).slice(0, 10)}` : '→ actual'}
                          </span>
                          {r.motivo && <span className="text-gray-400 italic">({r.motivo})</span>}
                          {puedeEditar && (
                            <button
                              onClick={() => eliminarRotacion(t.id, r.id)}
                              className="text-red-400 hover:text-red-600"
                              title="Eliminar rotación"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="text-xs text-gray-400">Sin rotaciones registradas</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================
// Condiciones (catálogo = columnas del formulario)
// ============================================================

function Criterios({ accessToken, puedeEditar, criterios, onRecargar, onError, onAviso }) {
  const [form, setForm] = useState({
    nombre: '', categoria: 'incentivo', peso: 1, minimo: 0, maximo: 10,
  });
  const [saving, setSaving] = useState(false);

  async function crear(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await tallerAPI.crearCriterio({
        ...form,
        peso: Number(form.peso),
        minimo: Number(form.minimo),
        maximo: Number(form.maximo),
      }, accessToken);
      setForm({ nombre: '', categoria: 'incentivo', peso: 1, minimo: 0, maximo: 10 });
      onAviso('Condición creada. Ya aparece como columna en el formulario.');
      onRecargar();
    } catch (err) {
      onError(err?.error || err?.message || 'No se pudo crear la condición.');
    } finally {
      setSaving(false);
    }
  }

  async function alternar(c) {
    try {
      await tallerAPI.actualizarCriterio(c.id, { activo: !c.activo }, accessToken);
      onRecargar();
    } catch (err) {
      onError(err?.error || err?.message || 'No se pudo actualizar.');
    }
  }

  async function eliminar(c) {
    if (!window.confirm(`¿Eliminar la condición «${c.nombre}»?`)) return;
    try {
      await tallerAPI.eliminarCriterio(c.id, accessToken);
      onAviso('Condición eliminada.');
      onRecargar();
    } catch (err) {
      onError(err?.error || err?.message || 'No se pudo eliminar.');
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
        <p className="font-semibold mb-1">Cómo se añade una condición nueva</p>
        <p>
          Las condiciones son datos, no código. Al crear una aquí aparece automáticamente como
          columna en el formulario de evaluación y entra en el cálculo del puntaje general.
        </p>
      </div>

      {puedeEditar && (
        <form onSubmit={crear} className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm max-w-3xl">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Nueva condición</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
              <input
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                placeholder="Ej: Retraso en entrega"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
              <select
                value={form.categoria}
                onChange={(e) => setForm({ ...form, categoria: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              >
                <option value="incentivo">Incentivo</option>
                <option value="incidencia">Incidencia</option>
                <option value="calidad">Calidad</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Peso</label>
              <input
                type="number" min="0" max="100"
                value={form.peso}
                onChange={(e) => setForm({ ...form, peso: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mín</label>
                <input
                  type="number"
                  value={form.minimo}
                  onChange={(e) => setForm({ ...form, minimo: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Máx</label>
                <input
                  type="number"
                  value={form.maximo}
                  onChange={(e) => setForm({ ...form, maximo: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>
          </div>
          <div className="flex justify-end mt-4">
            <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-brand text-white text-sm font-medium disabled:opacity-50">
              {saving ? 'Guardando…' : 'Crear condición'}
            </button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              <th className="p-4">Condición</th>
              <th className="p-4">Tipo</th>
              <th className="p-4">Peso</th>
              <th className="p-4">Escala</th>
              <th className="p-4">Estado</th>
              {puedeEditar && <th className="p-4 text-right">Acciones</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {criterios.length === 0 && (
              <tr><td colSpan={6} className="p-8 text-center text-sm text-gray-500">No hay condiciones configuradas.</td></tr>
            )}
            {criterios.map((c) => (
              <tr key={c.id} className="hover:bg-gray-50/50">
                <td className="p-4 font-medium text-gray-900">{c.nombre}</td>
                <td className="p-4">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium border ${CATEGORIA_BADGE[c.categoria] || ''}`}>
                    {CATEGORIA_LABEL[c.categoria] || c.categoria}
                  </span>
                </td>
                <td className="p-4 text-gray-700">{c.peso}</td>
                <td className="p-4 text-gray-700">{c.minimo} … {c.maximo}</td>
                <td className="p-4">
                  <span className={`text-xs font-medium ${c.activo ? 'text-green-600' : 'text-gray-400'}`}>
                    {c.activo ? 'Activa' : 'Inactiva'}
                  </span>
                </td>
                {puedeEditar && (
                  <td className="p-4 text-right space-x-1">
                    <button
                      onClick={() => alternar(c)}
                      className="px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50"
                    >
                      {c.activo ? 'Desactivar' : 'Activar'}
                    </button>
                    <button
                      onClick={() => eliminar(c)}
                      className="inline-flex items-center px-2.5 py-1.5 rounded-lg border border-red-200 text-xs font-medium text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
