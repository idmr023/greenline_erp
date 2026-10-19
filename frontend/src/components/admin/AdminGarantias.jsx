import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { garantiasAPI, prestamosVehiculoAPI } from '../../lib/api';
import { mesActual, nombreMes, ultimosMeses } from '../../utils/meses';
import {
  ShieldCheck, Plus, RefreshCw, Trash2, X, Pencil, Copy, Check,
  Search, Clipboard,
} from '../../lib/icons';

const ESTADOS = [
  { valor: 'REGISTRADA', label: 'Registrada' },
  { valor: 'EN_EVALUACION', label: 'En evaluación' },
  { valor: 'EN_GARANTIA', label: 'En garantía' },
  { valor: 'APROBADA', label: 'Aprobada' },
  { valor: 'RECHAZADA', label: 'Rechazada' },
  { valor: 'RESUELTA', label: 'Resuelta' },
  { valor: 'CERRADA', label: 'Cerrada' },
];

const ESTADO_BADGE = {
  REGISTRADA: 'bg-gray-100 text-gray-600 border-gray-200',
  EN_EVALUACION: 'bg-amber-50 text-amber-700 border-amber-200',
  EN_GARANTIA: 'bg-blue-50 text-blue-700 border-blue-200',
  APROBADA: 'bg-green-50 text-green-700 border-green-200',
  RECHAZADA: 'bg-red-50 text-red-700 border-red-200',
  RESUELTA: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  CERRADA: 'bg-gray-100 text-gray-500 border-gray-200',
};

const ESTADO_LABEL = Object.fromEntries(ESTADOS.map((e) => [e.valor, e.label]));

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

export default function AdminGarantias() {
  const { accessToken, ability } = useAuth();
  const puedeEditar = ability.can('write', 'garantias');

  const [items, setItems] = useState([]);
  const [resumen, setResumen] = useState(null);
  const [tiendas, setTiendas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [showCrear, setShowCrear] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [copiandoId, setCopiandoId] = useState(null);

  const [filtros, setFiltros] = useState({ mes: mesActual(), estado: '', tiendaId: '', q: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [d, r] = await Promise.all([
        garantiasAPI.listar(filtros, accessToken),
        garantiasAPI.resumen({ mes: filtros.mes, tiendaId: filtros.tiendaId }, accessToken),
      ]);
      setItems(d.garantias || []);
      setResumen(r);
    } catch (err) {
      setError(err?.error || err?.message || 'Error cargando las garantías.');
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

  async function copiar(garantia) {
    setCopiandoId(garantia.id);
    try {
      const copia = await garantiasAPI.copiar(garantia.id, accessToken);
      setAviso(`Copiado como ${copia.correlativo}.`);
      load();
    } catch (err) {
      setError(err?.error || err?.message || 'No se pudo copiar.');
    } finally {
      setCopiandoId(null);
    }
  }

  async function eliminar(garantia) {
    if (!window.confirm(`¿Eliminar la garantía ${garantia.correlativo}?`)) return;
    try {
      await garantiasAPI.eliminar(garantia.id, accessToken);
      setAviso('Garantía eliminada.');
      load();
    } catch (err) {
      setError(err?.error || err?.message || 'No se pudo eliminar.');
    }
  }

  return (
    <div className="p-8 max-w-7xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-brand" /> Registro de Garantías
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Ficha completa por caso. Para tocar una celda hay que abrir «Editar» en la fila.
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
              <Plus className="w-4 h-4" /> Nueva garantía
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
          <button
            onClick={() => { setError(null); setAviso(null); }}
            className="absolute top-2 right-2 text-current"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {resumen && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
            <p className="text-xs text-gray-500">Casos en el mes</p>
            <p className="text-2xl font-bold text-gray-900">{resumen.total}</p>
          </div>
          {resumen.porEstado.slice(0, 3).map((e) => (
            <div key={e.estado} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
              <p className="text-xs text-gray-500">{ESTADO_LABEL[e.estado] || e.estado}</p>
              <p className="text-2xl font-bold text-gray-900">{e.count}</p>
            </div>
          ))}
        </div>
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
        <label className="text-xs text-gray-500 flex-1 min-w-[200px]">
          Buscar
          <span className="relative block mt-1">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={filtros.q}
              onChange={(e) => setFiltros({ ...filtros, q: e.target.value })}
              placeholder="Correlativo, cliente, placa, VIN…"
              className="block w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-sm"
            />
          </span>
        </label>
      </div>

      {loading ? (
        <div className="text-gray-400 text-sm py-12 text-center">Cargando garantías…</div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center text-sm text-gray-500">
          No hay garantías con esos filtros.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="p-3">Correl.</th>
                  <th className="p-3">Fecha</th>
                  <th className="p-3">Cliente</th>
                  <th className="p-3">Tienda</th>
                  <th className="p-3">Producto</th>
                  <th className="p-3">Placa / VIN</th>
                  <th className="p-3">Tipo</th>
                  <th className="p-3">Estado</th>
                  <th className="p-3">Diagnóstico</th>
                  <th className="p-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {items.map((g) => (
                  <FilaGarantia
                    key={g.id}
                    garantia={g}
                    tiendas={tiendas}
                    editando={editandoId === g.id}
                    puedeEditar={puedeEditar}
                    copiando={copiandoId === g.id}
                    onEditar={() => setEditandoId(g.id)}
                    onCancelar={() => setEditandoId(null)}
                    onCopiar={() => copiar(g)}
                    onEliminar={() => eliminar(g)}
                    onGuardado={() => { setEditandoId(null); load(); setAviso('Garantía actualizada.'); }}
                    onError={setError}
                    accessToken={accessToken}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 text-xs text-gray-400 border-t border-gray-100">
            {items.length} garantía(s)
          </div>
        </div>
      )}

      {showCrear && (
        <ModalGarantia
          tiendas={tiendas}
          accessToken={accessToken}
          onClose={() => setShowCrear(false)}
          onSaved={() => { setShowCrear(false); load(); setAviso('Garantía registrada.'); }}
          onError={setError}
        />
      )}
    </div>
  );
}

// ============================================================
// Fila: vista / edición celda a celda
// ============================================================

function FilaGarantia({
  garantia, tiendas, editando, puedeEditar, copiando,
  onEditar, onCancelar, onCopiar, onEliminar, onGuardado, onError, accessToken,
}) {
  const [borrador, setBorrador] = useState({});
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (editando) {
      setBorrador({
        fechaReclamo: String(garantia.fechaReclamo).slice(0, 10),
        clienteNombre: garantia.clienteNombre || '',
        clienteDocumento: garantia.clienteDocumento || '',
        clienteTelefono: garantia.clienteTelefono || '',
        clienteEmail: garantia.clienteEmail || '',
        tiendaId: garantia.tiendaId,
        producto: garantia.producto || '',
        modelo: garantia.modelo || '',
        color: garantia.color || '',
        vin: garantia.vin || '',
        numeroMotor: garantia.numeroMotor || '',
        placa: garantia.placa || '',
        numeroSerie: garantia.numeroSerie || '',
        tipoGarantia: garantia.tipoGarantia || '',
        fechaCompra: garantia.fechaCompra ? String(garantia.fechaCompra).slice(0, 10) : '',
        plazoMeses: garantia.plazoMeses ?? '',
        descripcion: garantia.descripcion || '',
        diagnostico: garantia.diagnostico || '',
        causa: garantia.causa || '',
        taller: garantia.taller || '',
        piezas: garantia.piezas || '',
        costo: garantia.costo ?? '',
        estado: garantia.estado,
        resolucion: garantia.resolucion || '',
        observaciones: garantia.observaciones || '',
      });
    }
  }, [editando, garantia]);

  const set = (campo, valor) => setBorrador((b) => ({ ...b, [campo]: valor }));

  async function guardar() {
    setGuardando(true);
    try {
      await garantiasAPI.actualizar(garantia.id, borrador, accessToken);
      onGuardado();
    } catch (err) {
      onError(err?.error || err?.message || 'No se pudo guardar.');
    } finally {
      setGuardando(false);
    }
  }

  if (editando) {
    return (
      <tr className="bg-amber-50/40 align-top">
        <td className="p-2 text-xs font-mono text-gray-600">{garantia.correlativo}</td>
        <td className="p-2">
          <input type="date" value={borrador.fechaReclamo || ''} onChange={(e) => set('fechaReclamo', e.target.value)} className="w-32 border border-gray-200 rounded px-2 py-1 text-xs" />
        </td>
        <td className="p-2 space-y-1">
          <input value={borrador.clienteNombre || ''} onChange={(e) => set('clienteNombre', e.target.value)} className="w-40 border border-gray-200 rounded px-2 py-1 text-xs" placeholder="Cliente" />
          <input value={borrador.clienteDocumento || ''} onChange={(e) => set('clienteDocumento', e.target.value)} className="w-40 border border-gray-200 rounded px-2 py-1 text-xs" placeholder="Documento" />
          <input value={borrador.clienteTelefono || ''} onChange={(e) => set('clienteTelefono', e.target.value)} className="w-40 border border-gray-200 rounded px-2 py-1 text-xs" placeholder="Teléfono" />
          <input value={borrador.clienteEmail || ''} onChange={(e) => set('clienteEmail', e.target.value)} className="w-40 border border-gray-200 rounded px-2 py-1 text-xs" placeholder="Correo" />
        </td>
        <td className="p-2">
          <select value={borrador.tiendaId || ''} onChange={(e) => set('tiendaId', e.target.value)} className="w-32 border border-gray-200 rounded px-2 py-1 text-xs">
            {tiendas.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </td>
        <td className="p-2 space-y-1">
          <input value={borrador.producto || ''} onChange={(e) => set('producto', e.target.value)} className="w-36 border border-gray-200 rounded px-2 py-1 text-xs" placeholder="Producto" />
          <input value={borrador.modelo || ''} onChange={(e) => set('modelo', e.target.value)} className="w-36 border border-gray-200 rounded px-2 py-1 text-xs" placeholder="Modelo" />
          <input value={borrador.color || ''} onChange={(e) => set('color', e.target.value)} className="w-36 border border-gray-200 rounded px-2 py-1 text-xs" placeholder="Color" />
        </td>
        <td className="p-2 space-y-1">
          <input value={borrador.placa || ''} onChange={(e) => set('placa', e.target.value)} className="w-28 border border-gray-200 rounded px-2 py-1 text-xs" placeholder="Placa" />
          <input value={borrador.vin || ''} onChange={(e) => set('vin', e.target.value)} className="w-36 border border-gray-200 rounded px-2 py-1 text-xs" placeholder="VIN" />
          <input value={borrador.numeroMotor || ''} onChange={(e) => set('numeroMotor', e.target.value)} className="w-36 border border-gray-200 rounded px-2 py-1 text-xs" placeholder="N° motor" />
          <input value={borrador.numeroSerie || ''} onChange={(e) => set('numeroSerie', e.target.value)} className="w-36 border border-gray-200 rounded px-2 py-1 text-xs" placeholder="N° serie" />
        </td>
        <td className="p-2 space-y-1">
          <input value={borrador.tipoGarantia || ''} onChange={(e) => set('tipoGarantia', e.target.value)} className="w-32 border border-gray-200 rounded px-2 py-1 text-xs" placeholder="Tipo" />
          <input type="number" value={borrador.plazoMeses ?? ''} onChange={(e) => set('plazoMeses', e.target.value)} className="w-20 border border-gray-200 rounded px-2 py-1 text-xs" placeholder="Meses" />
          <input type="date" value={borrador.fechaCompra || ''} onChange={(e) => set('fechaCompra', e.target.value)} className="w-32 border border-gray-200 rounded px-2 py-1 text-xs" />
        </td>
        <td className="p-2">
          <select value={borrador.estado || ''} onChange={(e) => set('estado', e.target.value)} className="w-32 border border-gray-200 rounded px-2 py-1 text-xs">
            {ESTADOS.map((e) => <option key={e.valor} value={e.valor}>{e.label}</option>)}
          </select>
          <input value={borrador.resolucion || ''} onChange={(e) => set('resolucion', e.target.value)} className="w-32 border border-gray-200 rounded px-2 py-1 text-xs mt-1" placeholder="Resolución" />
        </td>
        <td className="p-2 space-y-1">
          <textarea value={borrador.descripcion || ''} onChange={(e) => set('descripcion', e.target.value)} rows={2} className="w-48 border border-gray-200 rounded px-2 py-1 text-xs" placeholder="Descripción" />
          <textarea value={borrador.diagnostico || ''} onChange={(e) => set('diagnostico', e.target.value)} rows={2} className="w-48 border border-gray-200 rounded px-2 py-1 text-xs" placeholder="Diagnóstico" />
          <textarea value={borrador.causa || ''} onChange={(e) => set('causa', e.target.value)} rows={2} className="w-48 border border-gray-200 rounded px-2 py-1 text-xs" placeholder="Causa" />
          <input value={borrador.taller || ''} onChange={(e) => set('taller', e.target.value)} className="w-48 border border-gray-200 rounded px-2 py-1 text-xs" placeholder="Taller" />
          <input value={borrador.piezas || ''} onChange={(e) => set('piezas', e.target.value)} className="w-48 border border-gray-200 rounded px-2 py-1 text-xs" placeholder="Piezas" />
          <input type="number" step="0.01" value={borrador.costo ?? ''} onChange={(e) => set('costo', e.target.value)} className="w-28 border border-gray-200 rounded px-2 py-1 text-xs" placeholder="Costo" />
          <textarea value={borrador.observaciones || ''} onChange={(e) => set('observaciones', e.target.value)} rows={2} className="w-48 border border-gray-200 rounded px-2 py-1 text-xs" placeholder="Observaciones" />
        </td>
        <td className="p-2 text-right space-y-1">
          <button
            onClick={guardar}
            disabled={guardando}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-green-600 text-white text-xs font-medium hover:bg-green-700 disabled:opacity-50"
          >
            <Check className="w-3.5 h-3.5" /> Guardar
          </button>
          <button
            onClick={onCancelar}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50"
          >
            <X className="w-3.5 h-3.5" /> Cancelar
          </button>
        </td>
      </tr>
    );
  }

  return (
    <tr className="hover:bg-gray-50/50 align-top">
      <td className="p-3 text-xs font-mono text-gray-600 whitespace-nowrap">{garantia.correlativo}</td>
      <td className="p-3 text-gray-600 whitespace-nowrap">{formatFecha(garantia.fechaReclamo)}</td>
      <td className="p-3">
        <p className="font-medium text-gray-900">{garantia.clienteNombre}</p>
        <p className="text-xs text-gray-400">
          {[garantia.clienteDocumento, garantia.clienteTelefono].filter(Boolean).join(' · ') || '—'}
        </p>
      </td>
      <td className="p-3 text-gray-600 whitespace-nowrap">{garantia.tienda?.name || '—'}</td>
      <td className="p-3">
        <p className="text-gray-800">{garantia.producto}</p>
        <p className="text-xs text-gray-400">{[garantia.modelo, garantia.color].filter(Boolean).join(' · ') || '—'}</p>
      </td>
      <td className="p-3 text-gray-600">
        <p className="text-xs">{garantia.placa || '—'}</p>
        <p className="text-xs text-gray-400">{garantia.vin || ''}</p>
      </td>
      <td className="p-3 text-gray-600 text-xs">{garantia.tipoGarantia}</td>
      <td className="p-3">
        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${ESTADO_BADGE[garantia.estado] || ''}`}>
          {ESTADO_LABEL[garantia.estado] || garantia.estado}
        </span>
      </td>
      <td className="p-3 text-gray-600 text-xs max-w-[220px]">
        <p className="truncate" title={garantia.diagnostico || ''}>{garantia.diagnostico || '—'}</p>
        {garantia.causa && <p className="truncate text-gray-400" title={garantia.causa}>Causa: {garantia.causa}</p>}
      </td>
      <td className="p-3 text-right">
        <div className="flex justify-end gap-1">
          {puedeEditar && (
            <button
              onClick={onEditar}
              title="Editar esta fila"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50"
            >
              <Pencil className="w-3.5 h-3.5" /> Editar
            </button>
          )}
          <button
            onClick={onCopiar}
            disabled={copiando}
            title="Copiar esta garantía"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            <Copy className="w-3.5 h-3.5" /> Copiar
          </button>
          {puedeEditar && (
            <button
              onClick={onEliminar}
              title="Eliminar"
              className="inline-flex items-center px-2.5 py-1.5 rounded-lg border border-red-200 text-xs font-medium text-red-600 hover:bg-red-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

// ============================================================
// Modal de alta
// ============================================================

function ModalGarantia({ tiendas, accessToken, onClose, onSaved, onError }) {
  const [form, setForm] = useState({
    fechaReclamo: new Date().toISOString().slice(0, 10),
    clienteNombre: '',
    clienteDocumento: '',
    clienteTelefono: '',
    clienteEmail: '',
    tiendaId: tiendas[0]?.id || '',
    producto: '',
    modelo: '',
    color: '',
    vin: '',
    numeroMotor: '',
    placa: '',
    tipoGarantia: '',
    plazoMeses: '',
    descripcion: '',
    diagnostico: '',
    causa: '',
    taller: '',
    observaciones: '',
  });
  const [saving, setSaving] = useState(false);

  const set = (campo, valor) => setForm((f) => ({ ...f, [campo]: valor }));

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await garantiasAPI.crear(form, accessToken);
      onSaved();
    } catch (err) {
      onError(err?.error || err?.message || 'No se pudo registrar la garantía.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Clipboard className="w-5 h-5 text-brand" /> Nueva garantía
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <label className="text-xs text-gray-500">
              Fecha de reclamo *
              <input type="date" value={form.fechaReclamo} onChange={(e) => set('fechaReclamo', e.target.value)} className="block mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" required />
            </label>
            <label className="text-xs text-gray-500">
              Tienda *
              <select value={form.tiendaId} onChange={(e) => set('tiendaId', e.target.value)} className="block mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" required>
                <option value="">Seleccionar…</option>
                {tiendas.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
            <label className="text-xs text-gray-500">
              Tipo de garantía *
              <input value={form.tipoGarantia} onChange={(e) => set('tipoGarantia', e.target.value)} placeholder="Ej: Batería 12 meses" className="block mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" required />
            </label>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <label className="text-xs text-gray-500">
              Cliente *
              <input value={form.clienteNombre} onChange={(e) => set('clienteNombre', e.target.value)} className="block mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" required />
            </label>
            <label className="text-xs text-gray-500">
              Documento
              <input value={form.clienteDocumento} onChange={(e) => set('clienteDocumento', e.target.value)} className="block mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </label>
            <label className="text-xs text-gray-500">
              Teléfono
              <input value={form.clienteTelefono} onChange={(e) => set('clienteTelefono', e.target.value)} className="block mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </label>
            <label className="text-xs text-gray-500">
              Correo
              <input type="email" value={form.clienteEmail} onChange={(e) => set('clienteEmail', e.target.value)} className="block mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </label>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <label className="text-xs text-gray-500">
              Producto *
              <input value={form.producto} onChange={(e) => set('producto', e.target.value)} className="block mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" required />
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
              Placa
              <input value={form.placa} onChange={(e) => set('placa', e.target.value)} className="block mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </label>
            <label className="text-xs text-gray-500">
              VIN
              <input value={form.vin} onChange={(e) => set('vin', e.target.value)} className="block mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </label>
            <label className="text-xs text-gray-500">
              N° motor
              <input value={form.numeroMotor} onChange={(e) => set('numeroMotor', e.target.value)} className="block mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </label>
            <label className="text-xs text-gray-500">
              Plazo (meses)
              <input type="number" value={form.plazoMeses} onChange={(e) => set('plazoMeses', e.target.value)} className="block mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </label>
          </div>

          <label className="block text-xs text-gray-500">
            Descripción del caso
            <textarea value={form.descripcion} onChange={(e) => set('descripcion', e.target.value)} rows={2} className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </label>
          <div className="grid grid-cols-3 gap-3">
            <label className="text-xs text-gray-500">
              Diagnóstico
              <textarea value={form.diagnostico} onChange={(e) => set('diagnostico', e.target.value)} rows={2} className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </label>
            <label className="text-xs text-gray-500">
              Causa
              <textarea value={form.causa} onChange={(e) => set('causa', e.target.value)} rows={2} className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </label>
            <label className="text-xs text-gray-500">
              Observaciones
              <textarea value={form.observaciones} onChange={(e) => set('observaciones', e.target.value)} rows={2} className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </label>
          </div>
          <label className="block text-xs text-gray-500">
            Taller
            <input value={form.taller} onChange={(e) => set('taller', e.target.value)} className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </label>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50">
              Cancelar
            </button>
            <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-brand text-white text-sm font-medium disabled:opacity-50">
              {saving ? 'Guardando…' : 'Registrar garantía'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
