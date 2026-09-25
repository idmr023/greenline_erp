import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, Pencil, Trash2, Check } from '../../lib/icons';

export default function AdminColores() {
  const [colores, setColores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newColor, setNewColor] = useState({ nombre: '', hex_code: '' });
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ nombre: '', hex_code: '' });

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const { data } = await supabase.from('colores').select('*').order('nombre');
    setColores(data || []);
    setLoading(false);
  }

  const handleAdd = async () => {
    const nombre = newColor.nombre.trim();
    if (!nombre) return;
    if (colores.some((c) => c.nombre.toLowerCase() === nombre.toLowerCase())) {
      alert('Ya existe un color con ese nombre');
      return;
    }
    const { error } = await supabase.from('colores').insert({
      nombre,
      hex_code: newColor.hex_code || null,
    });
    if (error) {
      alert(error.message.includes('duplicate') ? 'Ese color ya existe' : error.message);
      return;
    }
    setNewColor({ nombre: '', hex_code: '' });
    load();
  };

  const handleUpdate = async (id) => {
    const nombre = editForm.nombre.trim();
    if (!nombre) return;
    if (colores.some((c) => c.id !== id && c.nombre.toLowerCase() === nombre.toLowerCase())) {
      alert('Ya existe otro color con ese nombre');
      return;
    }
    const { error } = await supabase.from('colores').update({
      nombre,
      hex_code: editForm.hex_code || null,
    }).eq('id', id);
    if (error) {
      alert(error.message.includes('duplicate') ? 'Ya existe otro color con ese nombre' : error.message);
      return;
    }
    setEditingId(null);
    load();
  };

  const handleDelete = async (id, nombre) => {
    if (!confirm(`¿Eliminar el color "${nombre}"?`)) return;
    const { error } = await supabase.from('colores').delete().eq('id', id);
    if (error) {
      if (error.message?.includes('foreign key') || error.message?.includes('violates')) {
        alert('No se puede eliminar: está en uso por productos');
      } else {
        alert(error.message);
      }
      return;
    }
    load();
  };

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Colores</h1>
        <p className="text-sm text-gray-500 mt-1">Catálogo maestro de colores disponibles</p>
      </div>

      {/* Add form */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 mb-6">
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-500 mb-1">Nombre</label>
            <input
              value={newColor.nombre}
              onChange={(e) => setNewColor({ ...newColor, nombre: e.target.value })}
              className="input"
              placeholder="Ej: Verde Esmeralda"
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            />
          </div>
          <div className="w-24">
            <label className="block text-xs font-medium text-gray-500 mb-1">Hex</label>
            <input
              value={newColor.hex_code}
              onChange={(e) => setNewColor({ ...newColor, hex_code: e.target.value })}
              className="input"
              placeholder="#059669"
            />
          </div>
          <button
            onClick={handleAdd}
            className="px-4 py-2 bg-brand text-white rounded-lg text-sm font-semibold hover:bg-brand-dark transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="text-gray-400 text-sm py-8 text-center">Cargando...</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-50">
          {colores.map((c) => (
            <div key={c.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50/50 transition-colors">
              {c.hex_code && (
                <div
                  className="w-6 h-6 rounded-full border border-gray-200 shrink-0"
                  style={{ backgroundColor: c.hex_code }}
                />
              )}

              {editingId === c.id ? (
                <>
                  <input
                    value={editForm.nombre}
                    onChange={(e) => setEditForm({ ...editForm, nombre: e.target.value })}
                    className="input flex-1"
                    onKeyDown={(e) => e.key === 'Enter' && handleUpdate(c.id)}
                  />
                  <input
                    value={editForm.hex_code}
                    onChange={(e) => setEditForm({ ...editForm, hex_code: e.target.value })}
                    className="input w-24"
                  />
                  <button onClick={() => handleUpdate(c.id)} className="p-1.5 text-brand hover:bg-brand/10 rounded-lg">
                    <Check className="w-4 h-4" />
                  </button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm font-medium text-gray-900">{c.nombre}</span>
                  {c.hex_code && <span className="text-xs text-gray-400 font-mono">{c.hex_code}</span>}
                  <button
                    onClick={() => { setEditingId(c.id); setEditForm({ nombre: c.nombre, hex_code: c.hex_code || '' }); }}
                    className="p-1.5 text-gray-400 hover:text-brand hover:bg-brand/10 rounded-lg transition-colors"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(c.id, c.nombre)}
                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
