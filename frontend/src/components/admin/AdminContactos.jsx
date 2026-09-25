import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Mail, Trash2, CheckCircle2, RefreshCw, Eye } from '../../lib/icons';

export default function AdminContactos() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('contactos')
      .select('*')
      .order('created_at', { ascending: false });
    setItems(data || []);
    setLoading(false);
  }

  async function toggleLeido(item) {
    const { error } = await supabase
      .from('contactos')
      .update({ leido: !item.leido })
      .eq('id', item.id);
    if (error) return alert(error.message);
    load();
  }

  async function handleDelete(id) {
    if (!confirm('¿Eliminar este mensaje de contacto?')) return;
    const { error } = await supabase.from('contactos').delete().eq('id', id);
    if (error) return alert(error.message);
    if (selected?.id === id) setSelected(null);
    load();
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
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mensajes de Contacto</h1>
          <p className="text-sm text-gray-500 mt-1">
            Mensajes enviados desde el formulario de contacto público de la web.
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
        <div className="text-gray-400 text-sm py-12 text-center">Cargando mensajes...</div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center text-sm text-gray-500">
          No hay mensajes de contacto registrados todavía.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-1 bg-white rounded-xl border border-gray-100 divide-y divide-gray-50 overflow-hidden max-h-[600px] overflow-y-auto">
            {items.map((item) => (
              <div
                key={item.id}
                onClick={() => setSelected(item)}
                className={`p-4 cursor-pointer transition-colors ${
                  selected?.id === item.id
                    ? 'bg-brand/5 border-l-4 border-brand'
                    : 'hover:bg-gray-50'
                } ${!item.leido ? 'font-semibold bg-gray-50/80' : ''}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-500">{formatFecha(item.created_at)}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleLeido(item);
                    }}
                    title={item.leido ? 'Marcar como no leído' : 'Marcar como leído'}
                    className="text-gray-400 hover:text-brand"
                  >
                    {item.leido ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <CheckCircle2 className="w-4 h-4 text-gray-300" />}
                  </button>
                </div>
                <p className="text-sm text-gray-900 truncate">{item.nombre}</p>
                <p className="text-xs text-brand truncate">{item.asunto}</p>
              </div>
            ))}
          </div>

          <div className="md:col-span-2 bg-white rounded-xl border border-gray-100 p-6 flex flex-col justify-between">
            {selected ? (
              <div>
                <div className="flex items-start justify-between pb-4 border-b border-gray-100 mb-4">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">{selected.asunto}</h2>
                    <p className="text-sm text-gray-600 mt-0.5">
                      De: <strong className="text-gray-900">{selected.nombre}</strong> ({selected.email})
                    </p>
                    <p className="text-xs text-gray-400 mt-1">{formatFecha(selected.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleLeido(selected)}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
                    >
                      {selected.leido ? 'Marcar no leído' : 'Marcar leído'}
                    </button>
                    <button
                      onClick={() => handleDelete(selected.id)}
                      className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      title="Eliminar mensaje"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                  {selected.mensaje}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-gray-400 text-sm">
                <Mail className="w-10 h-10 text-gray-300 mb-2" />
                Selecciona un mensaje para ver su contenido completo.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
