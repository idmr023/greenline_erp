import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { ensambladoAPI, tallerAPI, prestamosVehiculoAPI } from '../../lib/api';
import { nombreMes, ultimosMeses } from '../../utils/meses';
import {
  Package, Plus, RefreshCw, Trash2, X, Pencil, Wrench, MapPin, User,
} from '../../lib/icons';

const ESTADOS = [
  { valor: 'PENDIENTE', label: 'Pendiente' },
  { valor: 'EN_PROCESO', label: 'En proceso' },
  { valor: 'ARMADO', label: 'Armado' },
  { valor: 'DESPACHADO', label: 'Despachado' },
  { valor: 'OBSERVADO', label: 'Observado' },
];

const ESTADO_BADGE = {
  PENDIENTE: 'bg-gray-100 text-gray-600 border-gray-200',
  EN_PROCESO: 'bg-amber-50 text-amber-700 border-amber-200',
  ARMADO: 'bg-blue-50 text-blue-700 border-blue-200',
  DESPACHADO: 'bg-green-50 text-green-700 border-green-200',
  OBSERVADO: 'bg-red-50 text-red-700 border-red-200',
};

const ESTADO_LABEL = Object.fromEntries(ESTADOS.map((e) => [e.valor, e.label]));

const TIPOS = [
  { valor: 'completo', label: 'Armado completo' },
  { valor: 'parcial', label: 'Armado parcial' },
  { valor: 'revision', label: 'Revisión' },
];

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

export default function AdminEnsamblado() {
  const { accessToken, ability } = useAuth();
  const puedeEditar = ability.can('write', 'ensamblado');

  const [items, setItems] = useState([]);
  const [resumen, setResumen] = useState(null);
  const [tiendas, setTiendas] = useState([]);
  const [tecnicos, setTecnicos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [showCrear, setShowCrear] = useState(false);
  const [editando, setEditando] = useState(null);

  // El histórico importado de Google Sheets va de junio a septiembre de 2026,
  // así que el filtro arranca en «todos los meses»: con el mes actual se veía
  // vacío aunque hubiera datos.
  const [filtros, setFiltros] = useState({ mes: '', estado: '', tiendaId: '', q: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [d, r] = await Promise.all([
        ensambladoAPI.listar(filtros, accessToken),
        ensambladoAPI.resumen({ mes: filtros.mes, tiendaId: filtros.tiendaId }, accessToken),
      ]);
      setItems(d.registros || []);
      setResumen(r);
    } catch (err) {
      setError(err?.error || err?.message || 'Error cargando el reporte.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [filtros, accessToken]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    Promise.all([
      prestamosVehiculoAPI.listarTiendas(accessToken),
      tallerAPI.listarTecnicos({}, accessToken),
    ])
      .then(([t, tec]) => {
        setTiendas(t.tiendas || []);
        setTecnicos(tec.tecnicos || []);
      })
      .catch(() => {});
  }, [accessToken]);

  async function eliminar(registro) {
    if (!window.confirm('¿Eliminar este registro de armado?')) return;
    try {
      await ensambladoAPI.eliminar(registro.id, accessToken);
      setAviso('Registro eliminado.');
      load();
    } catch (err) {
      setError(err?.error || err?.message || 'No se pudo eliminar.');
    }
  }

  const maxMes = Math.max(1, ...(resumen?.porMes || []).map((m) => m.total));

  return (
    <div className="p-8 max-w-7xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Package className="w-6 h-6 text-brand" /> Reporte de Ensamblado
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Se registra el armado y el despacho; el dashboard se arma con esa misma data.
          </p>
          <p className="text-xs text-gray-400 mt-1">
            El histórico viene importado de la hoja «Registro Armado y Despacho» de Google Drive
            (jun–sep 2026); los registros que llegan desde el panel se marcan igual.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={load}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          {puedeEditar && (
            <button
              onClick={() => setShowCrear(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand/90"
            >
              <Plus className="w-4 h-4" /> Nuevo registro
            </button>
          )}
        </div>
      </div>

      {(error || aviso) && (
        <div className={`mb-4 rounded-xl p-3 text-sm border relative ${
          error ? 'bg-red-50 border-red-200 text-red-700' : 'bg-green-50 border-green-200 text-green-700'
        }`}
        >
          {error || aviso}
          <button onClick={() => { setError(null); setAviso(null); }} className="absolute top-2 right-2 text-current">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {resumen && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
            <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
              <p className="text-xs text-gray-500">Registros</p>
              <p className="text-2xl font-bold text-gray-900">{resumen.total}</p>
            </div>
            {resumen.porEstado.slice(0, 3).map((e) => (
              <div key={e.estado} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                <p className="text-xs text-gray-500">{ESTADO_LABEL[e.estado] || e.estado}</p>
                <p className="text-2xl font-bold text-gray-900">{e.count}</p>
              </div>
            ))}
          </div>

          {resumen.porMes.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm mb-5">
              <h2 className="font-semibold text-gray-900 mb-4">Producción por mes</h2>
              <div className="flex items-end gap-3 h-40">
                {resumen.porMes.slice(-12).map((m) => (
                  <div key={m.mes} className="flex-1 flex flex-col items-center gap-1 min-w-[38px]">
                    <span className="text-xs text-gray-500">{m.total}</span>
                    <div
                      className="w-full bg-brand rounded-t-md"
                      style={{ height: `${Math.max(4, (m.total / maxMes) * 120)}px` }}
                      title={`${m.total} registros · ${m.despachados} despachados`}
                    />
                    <span className="text-[10px] text-gray-400 text-center">{nombreMes(m.mes).split(' ')[0].slice(0, 3)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
            <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
              <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-brand" /> Por tienda
              </h3>
              <ul className="space-y-2 text-sm">
                {resumen.porTienda.map((t) => (
                  <li key={t.id} className="flex justify-between">
                    <span className="text-gray-700">{t.nombre}</span>
                    <span className="font-medium text-gray-900">{t.count}</span>
                  </li>
                ))}
                {resumen.porTienda.length === 0 && <li className="text-gray-400 text-sm">Sin datos.</li>}
              </ul>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
              <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <User className="w-4 h-4 text-brand" /> Por responsable
              </h3>
              <ul className="space-y-2 text-sm">
                {resumen.porTecnico.map((t) => (
                  <li key={t.id} className="flex justify-between">
                    <span className="text-gray-700">{t.nombre}</span>
                    <span className="font-medium text-gray-900">{t.count}</span>
                  </li>
                ))}
                {resumen.porTecnico.length === 0 && <li className="text-gray-400 text-sm">Sin datos.</li>}
              </ul>
            </div>
          </div>
        </>
      )}

      <div className="flex flex-wrap gap-3 mb-4 items-end">
        <label className="text-xs text-gray-500">
          Mes
          <select
            value={filtros.mes}
            onChange={(e) => setFiltros({ ...filtros, mes: e.target.value })}
            className="block mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white"
          >
            <option value="">Todos los meses</option>
            {ultimosMeses(18).map((m) => (
              <option key={m} value={m}>{nombreMes(m)}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-gray-500">
          Estado
          <select
            value={filtros.estado}
            onChange={(e) => setFiltros({ ...filtros, estado: e.target.value })}
            className="block mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white"
          >
            <option value="">Todos</option>
            {ESTADOS.map((e) => <option key={e.valor} value={e.valor}>{e.label}</option>)}
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
              <option value="">Todas</option>
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
            placeholder="Orden, cliente, modelo, serie…"
            className="block mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm w-full"
          />
        </label>
      </div>

      {loading ? (
        <div className="text-gray-400 text-sm py-12 text-center">Cargando registros…</div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center text-sm text-gray-500">
          No hay registros con esos filtros.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="p-4">Fecha</th>
                  <th className="p-4">Orden</th>
                  <th className="p-4">Tienda</th>
                  <th className="p-4">Cliente / Modelo</th>
                  <th className="p-4">Tipo</th>
                  <th className="p-4">Responsable</th>
                  <th className="p-4">Estado</th>
                  <th className="p-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {items.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50/50">
                    <td className="p-4 text-gray-600 whitespace-nowrap">{formatFecha(r.fecha)}</td>
                    <td className="p-4 font-mono text-xs text-gray-700">{r.orden || '—'}</td>
                    <td className="p-4 text-gray-600">{r.tienda?.name}</td>
                    <td className="p-4">
                      <p className="font-medium text-gray-900">{r.cliente || '—'}</p>
                      <p className="text-xs text-gray-400">{[r.modelo, r.color].filter(Boolean).join(' · ') || '—'}</p>
                    </td>
                    <td className="p-4 text-gray-600 text-xs">
                      {TIPOS.find((t) => t.valor === r.tipoArmado)?.label || r.tipoArmado}
                    </td>
                    <td className="p-4 text-gray-600">{r.responsable?.nombre || '—'}</td>
                    <td className="p-4">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${ESTADO_BADGE[r.estado] || ''}`}>
                        {ESTADO_LABEL[r.estado] || r.estado}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex justify-end gap-1">
                        {puedeEditar && (
                          <>
                            <button
                              onClick={() => setEditando(r)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50"
                            >
                              <Pencil className="w-3.5 h-3.5" /> Editar
                            </button>
                            <button
                              onClick={() => eliminar(r)}
                              className="inline-flex items-center px-2.5 py-1.5 rounded-lg border border-red-200 text-xs font-medium text-red-600 hover:bg-red-50"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 text-xs text-gray-400 border-t border-gray-100">
            {items.length} registro(s)
          </div>
        </div>
      )}

      {showCrear && (
        <ModalRegistro
          tiendas={tiendas}
          tecnicos={tecnicos}
          accessToken={accessToken}
          onClose={() => setShowCrear(false)}
          onSaved={() => { setShowCrear(false); load(); setAviso('Registro guardado.'); }}
          onError={setError}
        />
      )}

      {editando && (
        <ModalRegistro
          registro={editando}
          tiendas={tiendas}
          tecnicos={tecnicos}
          accessToken={accessToken}
          onClose={() => setEditando(null)}
          onSaved={() => { setEditando(null); load(); setAviso('Registro actualizado.'); }}
          onError={setError}
        />
      )}
    </div>
  );
}

function ModalRegistro({ registro, tiendas, tecnicos, accessToken, onClose, onSaved, onError }) {
  const [form, setForm] = useState({
    fecha: registro ? String(registro.fecha).slice(0, 10) : new Date().toISOString().slice(0, 10),
    tiendaId: registro?.tiendaId || tiendas[0]?.id || '',
    orden: registro?.orden || '',
    cliente: registro?.cliente || '',
    modelo: registro?.modelo || '',
    color: registro?.color || '',
    serie: registro?.serie || '',
    cantidad: registro?.cantidad ?? 1,
    tipoArmado: registro?.tipoArmado || 'completo',
    responsableId: registro?.responsableId || '',
    estado: registro?.estado || 'PENDIENTE',
    fechaDespacho: registro?.fechaDespacho ? String(registro.fechaDespacho).slice(0, 10) : '',
    observaciones: registro?.observaciones || '',
  });
  const [saving, setSaving] = useState(false);

  const set = (campo, valor) => setForm((f) => ({ ...f, [campo]: valor }));

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        cantidad: Number(form.cantidad) || 1,
        responsableId: form.responsableId || null,
        fechaDespacho: form.fechaDespacho || null,
      };
      if (registro) await ensambladoAPI.actualizar(registro.id, payload, accessToken);
      else await ensambladoAPI.crear(payload, accessToken);
      onSaved();
    } catch (err) {
      onError(err?.error || err?.message || 'No se pudo guardar el registro.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Wrench className="w-5 h-5 text-brand" />
            {registro ? 'Editar registro de armado' : 'Nuevo registro de armado'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <label className="text-xs text-gray-500">
              Fecha *
              <input type="date" value={form.fecha} onChange={(e) => set('fecha', e.target.value)} className="block mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" required />
            </label>
            <label className="text-xs text-gray-500">
              Tienda *
              <select value={form.tiendaId} onChange={(e) => set('tiendaId', e.target.value)} className="block mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" required>
                <option value="">Seleccionar…</option>
                {tiendas.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
            <label className="text-xs text-gray-500">
              N° de orden
              <input value={form.orden} onChange={(e) => set('orden', e.target.value)} className="block mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </label>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <label className="text-xs text-gray-500">
              Cliente
              <input value={form.cliente} onChange={(e) => set('cliente', e.target.value)} className="block mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </label>
            <label className="text-xs text-gray-500">
              Modelo
              <input value={form.modelo} onChange={(e) => set('modelo', e.target.value)} className="block mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </label>
            <label className="text-xs text-gray-500">
              Color
              <input value={form.color} onChange={(e) => set('color', e.target.value)} className="block mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </label>
            <label className="text-xs text-gray-500">
              Serie
              <input value={form.serie} onChange={(e) => set('serie', e.target.value)} className="block mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </label>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <label className="text-xs text-gray-500">
              Tipo de armado
              <select value={form.tipoArmado} onChange={(e) => set('tipoArmado', e.target.value)} className="block mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                {TIPOS.map((t) => <option key={t.valor} value={t.valor}>{t.label}</option>)}
              </select>
            </label>
            <label className="text-xs text-gray-500">
              Cantidad
              <input type="number" min="1" value={form.cantidad} onChange={(e) => set('cantidad', e.target.value)} className="block mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </label>
            <label className="text-xs text-gray-500">
              Responsable
              <select value={form.responsableId} onChange={(e) => set('responsableId', e.target.value)} className="block mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                <option value="">Sin asignar</option>
                {tecnicos.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
              </select>
            </label>
            <label className="text-xs text-gray-500">
              Estado
              <select value={form.estado} onChange={(e) => set('estado', e.target.value)} className="block mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                {ESTADOS.map((e) => <option key={e.valor} value={e.valor}>{e.label}</option>)}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-gray-500">
              Fecha de despacho
              <input type="date" value={form.fechaDespacho} onChange={(e) => set('fechaDespacho', e.target.value)} className="block mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </label>
            <label className="text-xs text-gray-500">
              Observaciones
              <input value={form.observaciones} onChange={(e) => set('observaciones', e.target.value)} className="block mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </label>
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
