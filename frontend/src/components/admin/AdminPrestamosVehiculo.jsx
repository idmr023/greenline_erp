import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { prestamosVehiculoAPI } from '../../lib/api';
import {
  Car, Plus, RefreshCw, Eye, LogIn, LogOut, Trash2, X, Camera,
  AlertTriangle, CheckCircle2, Clock,
} from '../../lib/icons';

const ESTADO_BADGE = {
  activo: 'bg-blue-50 text-blue-700 border-blue-200',
  devuelto: 'bg-green-50 text-green-700 border-green-200',
};

const ESTADO_LABEL = {
  activo: 'Activo',
  devuelto: 'Devuelto',
};

const COMBUSTIBLE_LABEL = {
  lleno: 'Lleno',
  medio: 'Medio',
  bajo: 'Bajo',
  reserva: 'Reserva',
};

const NIVEL_DANO = {
  leve: { label: 'Leve', color: 'text-yellow-600 bg-yellow-50' },
  moderado: { label: 'Moderado', color: 'text-orange-600 bg-orange-50' },
  grave: { label: 'Grave', color: 'text-red-600 bg-red-50' },
};

function formatFecha(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('es-PE', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function AdminPrestamosVehiculo() {
  const { accessToken, ability } = useAuth();
  const puedeEditar = ability.can('write', 'vehicles');

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [showCrear, setShowCrear] = useState(false);
  const [showInspeccion, setShowInspeccion] = useState(null); // { tipo: 'ingreso' | 'salida' }

  const [filtros, setFiltros] = useState({ estado: '', tiendaId: '', q: '' });
  const [tiendas, setTiendas] = useState([]);
  const [empleados, setEmpleados] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await prestamosVehiculoAPI.listar(filtros, accessToken);
      setItems(data.prestamos || []);
    } catch (err) {
      setLoadError(err?.error || err?.message || 'Error cargando préstamos');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [filtros, accessToken]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    prestamosVehiculoAPI.listarTiendas(accessToken)
      .then((d) => setTiendas(d.tiendas || []))
      .catch(() => {});
  }, [accessToken]);

  useEffect(() => {
    if (!puedeEditar) return;
    prestamosVehiculoAPI.listarEmpleados(accessToken)
      .then((d) => setEmpleados(d.empleados || []))
      .catch(() => {});
  }, [accessToken, puedeEditar]);

  async function abrirDetalle(prestamo) {
    try {
      const completa = await prestamosVehiculoAPI.obtener(prestamo.id, accessToken);
      setSelected(completa);
    } catch {
      setSelected(prestamo);
    }
  }

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Car className="w-6 h-6 text-brand" /> Préstamos de vehículos
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Verificación de estado al ingreso y salida del vehículo.
          </p>
        </div>
        {puedeEditar && (
          <button
            onClick={() => setShowCrear(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand/90 transition-colors"
          >
            <Plus className="w-4 h-4" /> Nuevo préstamo
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-3 mb-4 items-end">
        <label className="text-xs text-gray-500">
          Estado
          <select
            value={filtros.estado}
            onChange={(e) => setFiltros({ ...filtros, estado: e.target.value })}
            className="block mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white"
          >
            <option value="">Todos</option>
            <option value="activo">Activo</option>
            <option value="devuelto">Devuelto</option>
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
              {tiendas.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </label>
        )}
        <label className="text-xs text-gray-500 flex-1 min-w-[200px]">
          Buscar
          <input
            type="text"
            placeholder="Vehículo, placa, empleado…"
            value={filtros.q}
            onChange={(e) => setFiltros({ ...filtros, q: e.target.value })}
            className="block mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white w-full"
          />
        </label>
        <button
          onClick={load}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Recargar
        </button>
      </div>

      {loading ? (
        <div className="text-gray-400 text-sm py-12 text-center">Cargando préstamos...</div>
      ) : loadError ? (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-6 text-sm">
          <p className="font-semibold mb-1">Error cargando préstamos</p>
          <p className="text-red-600">{loadError}</p>
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center text-sm text-gray-500">
          No hay préstamos con esos filtros.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="p-4">Vehículo</th>
                  <th className="p-4">Empleado</th>
                  <th className="p-4">Tienda</th>
                  <th className="p-4">Estado</th>
                  <th className="p-4">Ingreso</th>
                  <th className="p-4">Salida</th>
                  <th className="p-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {items.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="p-4">
                      <p className="font-semibold text-gray-900">{p.vehiculo}</p>
                      {p.placa && <p className="text-xs text-gray-400">{p.placa}</p>}
                    </td>
                    <td className="p-4 text-gray-700">
                      {p.empleado ? `${p.empleado.nombre} ${p.empleado.apellido}` : '—'}
                    </td>
                    <td className="p-4 text-gray-700">{p.tienda?.name || '—'}</td>
                    <td className="p-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${ESTADO_BADGE[p.estado] || ''}`}>
                        {ESTADO_LABEL[p.estado] || p.estado}
                      </span>
                    </td>
                    <td className="p-4 text-xs text-gray-500">
                      {p.ingresoEn ? formatFecha(p.ingresoEn) : '—'}
                      {p.ingresoKm && <span className="block">{p.ingresoKm.toLocaleString()} km</span>}
                    </td>
                    <td className="p-4 text-xs text-gray-500">
                      {p.salidaEn ? formatFecha(p.salidaEn) : '—'}
                      {p.salidaKm && <span className="block">{p.salidaKm.toLocaleString()} km</span>}
                    </td>
                    <td className="p-4 text-right">
                      <button
                        onClick={() => abrirDetalle(p)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50"
                      >
                        <Eye className="w-3.5 h-3.5" /> Ver
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 text-xs text-gray-400 border-t border-gray-100">
            {items.length} préstamo(s)
          </div>
        </div>
      )}

      {showCrear && (
        <ModalCrear
          tiendas={tiendas}
          empleados={empleados}
          accessToken={accessToken}
          onClose={() => setShowCrear(false)}
          onCreated={(p) => { setShowCrear(false); load(); setSelected(p); }}
        />
      )}

      {selected && (
        <ModalDetalle
          prestamo={selected}
          puedeEditar={puedeEditar}
          accessToken={accessToken}
          onClose={() => setSelected(null)}
          onUpdated={(p) => { setSelected(p); load(); }}
          onDeleted={() => { setSelected(null); load(); }}
          onInspeccion={(tipo) => setShowInspeccion({ tipo })}
        />
      )}

      {showInspeccion && selected && (
        <ModalInspeccion
          prestamo={selected}
          tipo={showInspeccion.tipo}
          accessToken={accessToken}
          onClose={() => setShowInspeccion(null)}
          onSaved={(p) => { setShowInspeccion(null); setSelected(p); load(); }}
        />
      )}
    </div>
  );
}

// ============================================================
// Modal: Crear préstamo
// ============================================================

function ModalCrear({ tiendas, empleados, accessToken, onClose, onCreated }) {
  const [form, setForm] = useState({
    tiendaId: '',
    vehiculo: '',
    placa: '',
    empleadoId: '',
    motivo: '',
    notas: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const creado = await prestamosVehiculoAPI.crear(form, accessToken);
      onCreated(creado);
    } catch (err) {
      setError(err?.error || err?.message || 'No se pudo crear el préstamo');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">Nuevo préstamo de vehículo</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tienda / Origen *</label>
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
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Vehículo *</label>
            <input
              value={form.vehiculo}
              onChange={(e) => setForm({ ...form, vehiculo: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              placeholder="Ej: Moto Honda XR150, Placa ABC-123"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Placa</label>
            <input
              value={form.placa}
              onChange={(e) => setForm({ ...form, placa: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              placeholder="ABC-123"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Empleado *</label>
            <select
              value={form.empleadoId}
              onChange={(e) => setForm({ ...form, empleadoId: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              required
            >
              <option value="">Seleccionar…</option>
              {empleados.map((u) => (
                <option key={u.id} value={u.id}>{u.nombre} {u.apellido}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Motivo</label>
            <input
              value={form.motivo}
              onChange={(e) => setForm({ ...form, motivo: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              placeholder="Ej: Reparto de pedidos, visita a cliente…"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
            <textarea
              value={form.notas}
              onChange={(e) => setForm({ ...form, notas: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              rows={3}
            />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand/90 disabled:opacity-50"
            >
              {saving ? 'Creando…' : 'Crear préstamo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============================================================
// Modal: Detalle del préstamo
// ============================================================

function ModalDetalle({ prestamo, puedeEditar, accessToken, onClose, onUpdated, onDeleted, onInspeccion }) {
  const [notas, setNotas] = useState(prestamo.notas || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function guardarNotas() {
    setSaving(true);
    setError(null);
    try {
      const actualizado = await prestamosVehiculoAPI.actualizar(prestamo.id, { notas }, accessToken);
      onUpdated(actualizado);
    } catch (err) {
      setError(err?.error || err?.message || 'No se pudieron guardar las notas');
    } finally {
      setSaving(false);
    }
  }

  async function eliminar() {
    if (!window.confirm('¿Eliminar este préstamo?')) return;
    try {
      await prestamosVehiculoAPI.eliminar(prestamo.id, accessToken);
      onDeleted();
    } catch (err) {
      alert(err?.error || err?.message || 'No se pudo eliminar');
    }
  }

  const tieneIngreso = !!prestamo.ingresoEn;
  const tieneSalida = !!prestamo.salidaEn;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Car className="w-5 h-5 text-brand" /> {prestamo.vehiculo}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>
          )}

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500 text-xs">Placa</span>
              <p className="font-medium">{prestamo.placa || '—'}</p>
            </div>
            <div>
              <span className="text-gray-500 text-xs">Estado</span>
              <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold border ${ESTADO_BADGE[prestamo.estado] || ''}`}>
                {ESTADO_LABEL[prestamo.estado] || prestamo.estado}
              </span>
            </div>
            <div>
              <span className="text-gray-500 text-xs">Empleado</span>
              <p className="font-medium">
                {prestamo.empleado ? `${prestamo.empleado.nombre} ${prestamo.empleado.apellido}` : '—'}
              </p>
            </div>
            <div>
              <span className="text-gray-500 text-xs">Tienda</span>
              <p className="font-medium">{prestamo.tienda?.name || '—'}</p>
            </div>
            {prestamo.motivo && (
              <div className="col-span-2">
                <span className="text-gray-500 text-xs">Motivo</span>
                <p className="font-medium">{prestamo.motivo}</p>
              </div>
            )}
          </div>

          <div className="border-t border-gray-100 pt-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <LogIn className="w-4 h-4 text-blue-500" /> Inspección de ingreso
            </h3>
            {tieneIngreso ? (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm space-y-2">
                <p className="flex items-center gap-2 text-green-700">
                  <CheckCircle2 className="w-4 h-4" /> Registrada el {formatFecha(prestamo.ingresoEn)}
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                  <p><strong>Km:</strong> {prestamo.ingresoKm?.toLocaleString()}</p>
                  <p><strong>Combustible:</strong> {COMBUSTIBLE_LABEL[prestamo.ingresoCombustible] || prestamo.ingresoCombustible}</p>
                </div>
                {prestamo.ingresoDanos?.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs font-medium text-gray-700 mb-1">Daños pre-existentes:</p>
                    <ul className="text-xs text-gray-600 space-y-1">
                      {prestamo.ingresoDanos.map((d, i) => (
                        <li key={i} className="flex items-center gap-2">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${NIVEL_DANO[d.nivel]?.color || ''}`}>
                            {NIVEL_DANO[d.nivel]?.label || d.nivel}
                          </span>
                          <span>{d.parte}{d.descripcion ? ` — ${d.descripcion}` : ''}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {prestamo.ingresoFotos?.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs font-medium text-gray-700 mb-1">Fotos:</p>
                    <div className="flex gap-2 flex-wrap">
                      {prestamo.ingresoFotos.map((f, i) => (
                        <a key={i} href={f.url} target="_blank" rel="noreferrer" className="block w-16 h-16 rounded-lg overflow-hidden border border-gray-200">
                          <img src={f.url} alt={f.parte || `Foto ${i + 1}`} className="w-full h-full object-cover" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-500 flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Clock className="w-4 h-4" /> Sin registrar
                </span>
                {puedeEditar && (
                  <button
                    onClick={() => onInspeccion('ingreso')}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700"
                  >
                    <Camera className="w-3.5 h-3.5" /> Registrar
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="border-t border-gray-100 pt-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <LogOut className="w-4 h-4 text-green-500" /> Inspección de salida
            </h3>
            {tieneSalida ? (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm space-y-2">
                <p className="flex items-center gap-2 text-green-700">
                  <CheckCircle2 className="w-4 h-4" /> Registrada el {formatFecha(prestamo.salidaEn)}
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                  <p><strong>Km:</strong> {prestamo.salidaKm?.toLocaleString()}</p>
                  <p><strong>Combustible:</strong> {COMBUSTIBLE_LABEL[prestamo.salidaCombustible] || prestamo.salidaCombustible}</p>
                </div>
                {prestamo.salidaDanos?.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs font-medium text-gray-700 mb-1">Daños al salir:</p>
                    <ul className="text-xs text-gray-600 space-y-1">
                      {prestamo.salidaDanos.map((d, i) => (
                        <li key={i} className="flex items-center gap-2">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${NIVEL_DANO[d.nivel]?.color || ''}`}>
                            {NIVEL_DANO[d.nivel]?.label || d.nivel}
                          </span>
                          <span>{d.parte}{d.descripcion ? ` — ${d.descripcion}` : ''}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {prestamo.salidaFotos?.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs font-medium text-gray-700 mb-1">Fotos:</p>
                    <div className="flex gap-2 flex-wrap">
                      {prestamo.salidaFotos.map((f, i) => (
                        <a key={i} href={f.url} target="_blank" rel="noreferrer" className="block w-16 h-16 rounded-lg overflow-hidden border border-gray-200">
                          <img src={f.url} alt={f.parte || `Foto ${i + 1}`} className="w-full h-full object-cover" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-500 flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Clock className="w-4 h-4" /> Sin registrar
                </span>
                {puedeEditar && tieneIngreso && (
                  <button
                    onClick={() => onInspeccion('salida')}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-medium hover:bg-green-700"
                  >
                    <Camera className="w-3.5 h-3.5" /> Registrar
                  </button>
                )}
              </div>
            )}
          </div>

          {tieneIngreso && tieneSalida && (
            <div className="border-t border-gray-100 pt-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" /> Comparación ingreso vs salida
              </h3>
              <ComparacionIngresoSalida prestamo={prestamo} />
            </div>
          )}

          <div className="border-t border-gray-100 pt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              rows={3}
            />
            {puedeEditar && (
              <div className="flex justify-end mt-2">
                <button
                  onClick={guardarNotas}
                  disabled={saving}
                  className="px-3 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-medium hover:bg-gray-800 disabled:opacity-50"
                >
                  {saving ? 'Guardando…' : 'Guardar notas'}
                </button>
              </div>
            )}
          </div>

          {puedeEditar && !tieneIngreso && (
            <div className="flex justify-end pt-2 border-t border-gray-100">
              <button
                onClick={eliminar}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-red-200 text-red-600 text-xs font-medium hover:bg-red-50"
              >
                <Trash2 className="w-3.5 h-3.5" /> Eliminar préstamo
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Comparación ingreso vs salida
// ============================================================

function ComparacionIngresoSalida({ prestamo }) {
  const kmDiff = (prestamo.salidaKm || 0) - (prestamo.ingresoKm || 0);
  const danosIngreso = new Set((prestamo.ingresoDanos || []).map((d) => d.parte.toLowerCase()));
  const danosNuevos = (prestamo.salidaDanos || []).filter((d) => !danosIngreso.has(d.parte.toLowerCase()));
  const danosPrevios = (prestamo.salidaDanos || []).filter((d) => danosIngreso.has(d.parte.toLowerCase()));

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm space-y-3">
      <div className="grid grid-cols-2 gap-2 text-xs">
        <p><strong>Km recorridos:</strong> {kmDiff.toLocaleString()} km</p>
        <p>
          <strong>Combustible:</strong>{' '}
          {COMBUSTIBLE_LABEL[prestamo.ingresoCombustible]} → {COMBUSTIBLE_LABEL[prestamo.salidaCombustible]}
        </p>
      </div>

      {danosNuevos.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-xs font-semibold text-red-700 mb-1 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" /> Daños nuevos detectados ({danosNuevos.length})
          </p>
          <ul className="text-xs text-red-600 space-y-1">
            {danosNuevos.map((d, i) => (
              <li key={i}>• {d.parte}{d.descripcion ? ` — ${d.descripcion}` : ''} ({NIVEL_DANO[d.nivel]?.label || d.nivel})</li>
            ))}
          </ul>
        </div>
      )}

      {danosPrevios.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-700 mb-1">Daños previos (ya existían al ingreso):</p>
          <ul className="text-xs text-gray-600 space-y-1">
            {danosPrevios.map((d, i) => (
              <li key={i}>• {d.parte}{d.descripcion ? ` — ${d.descripcion}` : ''}</li>
            ))}
          </ul>
        </div>
      )}

      {danosNuevos.length === 0 && (
        <p className="text-xs text-green-600 flex items-center gap-1">
          <CheckCircle2 className="w-3.5 h-3.5" /> No se detectaron daños nuevos.
        </p>
      )}
    </div>
  );
}

// ============================================================
// Modal: Inspección (ingreso o salida)
// ============================================================

function ModalInspeccion({ prestamo, tipo, accessToken, onClose, onSaved }) {
  const esIngreso = tipo === 'ingreso';
  const [form, setForm] = useState({
    kilometraje: esIngreso ? prestamo.ingresoKm || '' : prestamo.salidaKm || '',
    combustible: esIngreso ? prestamo.ingresoCombustible || 'lleno' : prestamo.salidaCombustible || 'lleno',
    fotos: [],
    danos: [],
    accesorios: [],
    notas: '',
  });
  const [nuevoDano, setNuevoDano] = useState({ parte: '', descripcion: '', nivel: 'leve' });
  const [nuevoAccesorio, setNuevoAccesorio] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    if (!form.kilometraje || form.kilometraje < 0) {
      setError('Ingresa el kilometraje.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        kilometraje: parseInt(form.kilometraje, 10),
        combustible: form.combustible,
        fotos: form.fotos,
        danos: form.danos,
        accesorios: form.accesorios,
        notas: form.notas,
      };
      const apiCall = esIngreso
        ? prestamosVehiculoAPI.registrarIngreso
        : prestamosVehiculoAPI.registrarSalida;
      const actualizado = await apiCall(prestamo.id, payload, accessToken);
      onSaved(actualizado);
    } catch (err) {
      setError(err?.error || err?.message || 'No se pudo guardar la inspección');
    } finally {
      setSaving(false);
    }
  }

  function agregarDano() {
    if (!nuevoDano.parte.trim()) return;
    setForm({ ...form, danos: [...form.danos, { ...nuevoDano }] });
    setNuevoDano({ parte: '', descripcion: '', nivel: 'leve' });
  }

  function quitarDano(idx) {
    setForm({ ...form, danos: form.danos.filter((_, i) => i !== idx) });
  }

  function agregarAccesorio() {
    if (!nuevoAccesorio.trim()) return;
    setForm({ ...form, accesorios: [...form.accesorios, nuevoAccesorio.trim()] });
    setNuevoAccesorio('');
  }

  function quitarAccesorio(idx) {
    setForm({ ...form, accesorios: form.accesorios.filter((_, i) => i !== idx) });
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            {esIngreso ? <LogIn className="w-5 h-5 text-blue-500" /> : <LogOut className="w-5 h-5 text-green-500" />}
            Inspección de {esIngreso ? 'ingreso' : 'salida'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={submit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>
          )}

          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm">
            <p className="font-medium">{prestamo.vehiculo}</p>
            <p className="text-xs text-gray-500">
              {prestamo.empleado ? `${prestamo.empleado.nombre} ${prestamo.empleado.apellido}` : ''} · {prestamo.tienda?.name}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Kilometraje *</label>
              <input
                type="number"
                value={form.kilometraje}
                onChange={(e) => setForm({ ...form, kilometraje: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                placeholder="Ej: 15000"
                min="0"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Combustible *</label>
              <select
                value={form.combustible}
                onChange={(e) => setForm({ ...form, combustible: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              >
                <option value="lleno">Lleno</option>
                <option value="medio">Medio</option>
                <option value="bajo">Bajo</option>
                <option value="reserva">Reserva</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Fotos</label>
            <div className="border-2 border-dashed border-gray-200 rounded-lg p-4 text-center">
              <Camera className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-xs text-gray-500 mb-2">
                Sube fotos del vehículo (carrocería, tablero, llantas, etc.)
              </p>
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                id="fotos-input"
                onChange={async (e) => {
                  const files = Array.from(e.target.files || []);
                  for (const file of files) {
                    try {
                      const result = await prestamosVehiculoAPI.subirFoto(prestamo.id, file, file.name, accessToken);
                      setForm((prev) => ({ ...prev, fotos: [...prev.fotos, { url: result.url, parte: result.parte || file.name }] }));
                    } catch (err) {
                      setError(err?.error || err?.message || 'No se pudo subir la foto');
                    }
                  }
                  e.target.value = '';
                }}
              />
              <label
                htmlFor="fotos-input"
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Añadir fotos
              </label>
            </div>
            {form.fotos.length > 0 && (
              <div className="flex gap-2 flex-wrap mt-2">
                {form.fotos.map((f, i) => (
                  <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border border-gray-200">
                    <img src={f.url} alt="" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, fotos: form.fotos.filter((_, idx) => idx !== i) })}
                      className="absolute top-0 right-0 bg-red-500 text-white rounded-bl-lg p-0.5"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {esIngreso ? 'Daños pre-existentes' : 'Daños detectados'}
            </label>
            <div className="space-y-2">
              {form.danos.map((d, i) => (
                <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-lg p-2 text-xs">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${NIVEL_DANO[d.nivel]?.color || ''}`}>
                    {NIVEL_DANO[d.nivel]?.label || d.nivel}
                  </span>
                  <span className="flex-1">{d.parte}{d.descripcion ? ` — ${d.descripcion}` : ''}</span>
                  <button type="button" onClick={() => quitarDano(i)} className="text-red-400 hover:text-red-600">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              <div className="flex gap-2">
                <input
                  value={nuevoDano.parte}
                  onChange={(e) => setNuevoDano({ ...nuevoDano, parte: e.target.value })}
                  className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs"
                  placeholder="Parte (ej: Parabrisas)"
                />
                <input
                  value={nuevoDano.descripcion}
                  onChange={(e) => setNuevoDano({ ...nuevoDano, descripcion: e.target.value })}
                  className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs"
                  placeholder="Descripción"
                />
                <select
                  value={nuevoDano.nivel}
                  onChange={(e) => setNuevoDano({ ...nuevoDano, nivel: e.target.value })}
                  className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs"
                >
                  <option value="leve">Leve</option>
                  <option value="moderado">Moderado</option>
                  <option value="grave">Grave</option>
                </select>
                <button
                  type="button"
                  onClick={agregarDano}
                  className="px-2 py-1.5 rounded-lg bg-gray-900 text-white text-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Accesorios</label>
            <div className="space-y-2">
              {form.accesorios.map((a, i) => (
                <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-lg p-2 text-xs">
                  <span className="flex-1">{a}</span>
                  <button type="button" onClick={() => quitarAccesorio(i)} className="text-red-400 hover:text-red-600">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              <div className="flex gap-2">
                <input
                  value={nuevoAccesorio}
                  onChange={(e) => setNuevoAccesorio(e.target.value)}
                  className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs"
                  placeholder="Ej: Cargador, llanta de repuesto…"
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); agregarAccesorio(); } }}
                />
                <button
                  type="button"
                  onClick={agregarAccesorio}
                  className="px-2 py-1.5 rounded-lg bg-gray-900 text-white text-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
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

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className={`px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50 ${
                esIngreso ? 'bg-blue-600 hover:bg-blue-700' : 'bg-green-600 hover:bg-green-700'
              }`}
            >
              {saving ? 'Guardando…' : `Registrar ${esIngreso ? 'ingreso' : 'salida'}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
