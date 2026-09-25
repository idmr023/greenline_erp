import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, Pencil, Trash2, Check, X, ArrowUp, ArrowDown, Eye, EyeOff } from '../../lib/icons';

const EMPTY_FORM = {
  nombre: '',
  rol: '',
  texto: '',
  vehiculo: '',
  rating: 5,
  activo: true,
};

export default function AdminTestimonios() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const { data } = await supabase
      .from('testimonios')
      .select('*')
      .order('orden', { ascending: true })
      .order('id', { ascending: true });
    setItems(data || []);
    setLoading(false);
  }

  const openNew = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  };

  const openEdit = (t) => {
    setEditingId(t.id);
    setForm({
      nombre: t.nombre,
      rol: t.rol || '',
      texto: t.texto,
      vehiculo: t.vehiculo || '',
      rating: t.rating,
      activo: t.activo,
    });
    setFormOpen(true);
  };

  const handleSave = async () => {
    if (!form.nombre.trim() || !form.texto.trim()) {
      alert('Nombre y texto son obligatorios');
      return;
    }

    const payload = {
      nombre: form.nombre.trim(),
      rol: form.rol.trim() || null,
      texto: form.texto.trim(),
      vehiculo: form.vehiculo.trim() || null,
      rating: Number(form.rating),
      activo: form.activo,
    };

    if (editingId) {
      const { error } = await supabase.from('testimonios').update(payload).eq('id', editingId);
      if (error) return alert(error.message);
    } else {
      const { data: maxRow } = await supabase
        .from('testimonios')
        .select('orden')
        .order('orden', { ascending: false })
        .limit(1);
      payload.orden = (maxRow?.[0]?.orden ?? 0) + 1;
      const { error } = await supabase.from('testimonios').insert(payload);
      if (error) return alert(error.message);
    }

    setFormOpen(false);
    load();
  };

  const toggleActivo = async (t) => {
    const { error } = await supabase
      .from('testimonios')
      .update({ activo: !t.activo })
      .eq('id', t.id);
    if (error) return alert(error.message);
    load();
  };

  const handleDelete = async (t) => {
    if (!confirm(`¿Eliminar el testimonio de "${t.nombre}"?`)) return;
    const { error } = await supabase.from('testimonios').delete().eq('id', t.id);
    if (error) return alert(error.message);
    load();
  };

  const move = async (index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;

    const current = items[index];
    const other = items[target];
    const updates = [
      supabase.from('testimonios').update({ orden: other.orden }).eq('id', current.id),
      supabase.from('testimonios').update({ orden: current.orden }).eq('id', other.id),
    ];
    const results = await Promise.all(updates);
    if (results.some((r) => r.error)) return alert(results.find((r) => r.error)?.error.message);
    load();
  };

  const setField = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Testimonios</h1>
          <p className="text-sm text-gray-500 mt-1">
            Reseñas de clientes que se muestran en la página de inicio
          </p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-lg text-sm font-semibold hover:bg-brand-dark transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nuevo testimonio
        </button>
      </div>

      {loading ? (
        <div className="text-gray-400 text-sm py-8 text-center">Cargando...</div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-10 text-center text-sm text-gray-500">
          No hay testimonios todavía.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-50">
          {items.map((t, index) => (
            <div key={t.id} className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50/50 transition-colors">
              <div className="flex flex-col items-center gap-0.5 self-center">
                <button
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  className="p-1 text-gray-300 hover:text-brand disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label="Subir"
                >
                  <ArrowUp className="w-4 h-4" />
                </button>
                <button
                  onClick={() => move(index, 1)}
                  disabled={index === items.length - 1}
                  className="p-1 text-gray-300 hover:text-brand disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label="Bajar"
                >
                  <ArrowDown className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-gray-900 text-sm">{t.nombre}</p>
                  {t.vehiculo && (
                    <span className="text-[10px] font-semibold text-brand bg-brand/10 px-2 py-0.5 rounded">
                      {t.vehiculo}
                    </span>
                  )}
                  <span className="text-xs text-amber-500">{'★'.repeat(t.rating)}</span>
                  {!t.activo && (
                    <span className="text-[10px] font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                      Oculto
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-600 mt-0.5 line-clamp-2">{t.texto}</p>
                {t.rol && <p className="text-xs text-gray-400 mt-0.5">{t.rol}</p>}
              </div>

              <div className="flex items-center gap-1 self-center">
                <button
                  onClick={() => toggleActivo(t)}
                  className={`p-1.5 rounded-lg transition-colors ${
                    t.activo ? 'text-gray-400 hover:text-brand' : 'text-gray-300 hover:text-brand'
                  }`}
                  title={t.activo ? 'Ocultar' : 'Publicar'}
                >
                  {t.activo ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => openEdit(t)}
                  className="p-1.5 text-gray-400 hover:text-brand hover:bg-brand/10 rounded-lg transition-colors"
                  title="Editar"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(t)}
                  className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  title="Eliminar"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Form (crear / editar) */}
      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setFormOpen(false)}>
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-auto p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-gray-900">
                {editingId ? 'Editar testimonio' : 'Nuevo testimonio'}
              </h2>
              <button onClick={() => setFormOpen(false)} className="p-1.5 text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Nombre *</label>
                <input value={form.nombre} onChange={(e) => setField('nombre', e.target.value)} className="input" placeholder="Nombre del cliente" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Rol / desde</label>
                  <input value={form.rol} onChange={(e) => setField('rol', e.target.value)} className="input" placeholder="Cliente desde 2023" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Vehículo</label>
                  <input value={form.vehiculo} onChange={(e) => setField('vehiculo', e.target.value)} className="input" placeholder="VMP P01" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Texto del testimonio *</label>
                <textarea
                  value={form.texto}
                  onChange={(e) => setField('texto', e.target.value)}
                  rows={4}
                  className="input resize-none"
                  placeholder="Lo que el cliente dice..."
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Calificación</label>
                  <select
                    value={form.rating}
                    onChange={(e) => setField('rating', Number(e.target.value))}
                    className="input"
                  >
                    {[5, 4, 3, 2, 1].map((n) => (
                      <option key={n} value={n}>{'★'.repeat(n)} ({n})</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end pb-2">
                  <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.activo}
                      onChange={(e) => setField('activo', e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-brand focus:ring-brand"
                    />
                    Publicado en la web
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setFormOpen(false)}
                  className="px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSave}
                  className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-lg text-sm font-semibold hover:bg-brand-dark transition-colors"
                >
                  <Check className="w-4 h-4" />
                  Guardar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}