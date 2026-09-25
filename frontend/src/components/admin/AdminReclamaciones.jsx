import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { FileText, RefreshCw, Eye, CheckCircle2, AlertCircle } from '../../lib/icons';

export default function AdminReclamaciones() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from('libro_reclamaciones')
      .select('*')
      .order('created_at', { ascending: false });
    // Sin esto, una tabla ausente/RLS se disfrazaba de "No hay reclamaciones".
    setLoadError(error ? error.message : null);
    setItems(data || []);
    setLoading(false);
  }

  async function updateEstado(item, nuevoEstado) {
    const { error } = await supabase
      .from('libro_reclamaciones')
      .update({ estado: nuevoEstado })
      .eq('id', item.id);
    if (error) return alert(error.message);
    load();
    if (selected?.id === item.id) {
      setSelected({ ...selected, estado: nuevoEstado });
    }
  }

  function formatFecha(iso) {
    try {
      return new Date(iso).toLocaleString('es-PE', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  }

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Libro de Reclamaciones</h1>
          <p className="text-sm text-gray-500 mt-1">
            Reclamos y quejas registrados por los consumidores en la plataforma.
          </p>
        </div>
        <button
          onClick={load}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Recargar
        </button>
      </div>

      {loading ? (
        <div className="text-gray-400 text-sm py-12 text-center">Cargando reclamaciones...</div>
      ) : loadError ? (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-6 text-sm">
          <p className="font-semibold mb-1">Error cargando reclamaciones</p>
          <p className="text-red-600">{loadError}</p>
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center text-sm text-gray-500">
          No hay reclamaciones registradas.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="p-4">N° Reclamo</th>
                  <th className="p-4">Fecha</th>
                  <th className="p-4">Cliente</th>
                  <th className="p-4">Tipo</th>
                  <th className="p-4">Producto / Área</th>
                  <th className="p-4">Estado</th>
                  <th className="p-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {items.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="p-4 font-bold text-brand">{r.correlativo || `#${r.correlativo_numero}`}</td>
                    <td className="p-4 text-gray-500 text-xs">{formatFecha(r.created_at)}</td>
                    <td className="p-4">
                      <p className="font-semibold text-gray-900">{r.nombre} {r.apellidos}</p>
                      <p className="text-xs text-gray-500">{r.email} • {r.telefono}</p>
                    </td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${
                        r.tipo === 'RECLAMO' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'
                      }`}>
                        {r.tipo || 'QUEJA'}
                      </span>
                    </td>
                    <td className="p-4 text-gray-700">
                      <p className="truncate max-w-xs">{r.producto || '-'}</p>
                      <p className="text-xs text-gray-400">{r.area}</p>
                    </td>
                    <td className="p-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                        r.estado === 'RESUELTO' ? 'bg-green-50 text-green-700' : 'bg-blue-50 text-blue-700'
                      }`}>
                        {r.estado || 'PENDIENTE'}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <button
                        onClick={() => setSelected(r)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand/10 text-brand rounded-lg text-xs font-semibold hover:bg-brand/20 transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Ver detalle
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 shadow-xl">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100 mb-4">
              <div>
                <span className="text-xs font-bold text-brand bg-brand/10 px-2 py-0.5 rounded">
                  {selected.correlativo || `#${selected.correlativo_numero}`}
                </span>
                <h2 className="text-lg font-bold text-gray-900 mt-1">Reclamo de {selected.nombre} {selected.apellidos}</h2>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="text-gray-400 hover:text-gray-600 font-bold text-lg px-2"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-xl">
                <div>
                  <p className="text-xs text-gray-500 font-semibold uppercase">Documento</p>
                  <p className="text-gray-900">{selected.tipo_doc}: {selected.num_doc}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 font-semibold uppercase">Contacto</p>
                  <p className="text-gray-900">{selected.email} / {selected.telefono}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 font-semibold uppercase">Ubicación</p>
                  <p className="text-gray-900">{selected.distrito}, {selected.ciudad}, {selected.departamento}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 font-semibold uppercase">Sede / Tienda</p>
                  <p className="text-gray-900">{selected.area_entidad_nombre}</p>
                </div>
              </div>

              <div>
                <p className="text-xs text-gray-500 font-semibold uppercase mb-1">Producto / Servicio contratado</p>
                <p className="text-gray-900 bg-gray-50 p-3 rounded-lg">{selected.producto || '-'}</p>
              </div>

              <div>
                <p className="text-xs text-gray-500 font-semibold uppercase mb-1">Detalle del reclamo</p>
                <p className="text-gray-900 bg-gray-50 p-3 rounded-lg whitespace-pre-wrap">{selected.detalle}</p>
              </div>

              {selected.observaciones && (
                <div>
                  <p className="text-xs text-gray-500 font-semibold uppercase mb-1">Observaciones</p>
                  <p className="text-gray-900 bg-gray-50 p-3 rounded-lg whitespace-pre-wrap">{selected.observaciones}</p>
                </div>
              )}

              <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                <span className="text-xs font-semibold text-gray-500">Estado del reclamo:</span>
                <div className="flex items-center gap-2">
                  <select
                    value={selected.estado || 'PENDIENTE'}
                    onChange={(e) => updateEstado(selected, e.target.value)}
                    className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-brand/30"
                  >
                    <option value="PENDIENTE">PENDIENTE</option>
                    <option value="EN_PROCESO">EN PROCESO</option>
                    <option value="RESUELTO">RESUELTO</option>
                    <option value="CERRADO">CERRADO</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
