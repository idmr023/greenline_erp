import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, Pencil, Trash2, Check, X, Eye, EyeOff } from '../../lib/icons';

const EMPTY_FORM = {
  country: 'Perú',
  department: '',
  province: '',
  district: '',
  name: '',
  ruc: '',
  contact_name: '',
  address: '',
  latitude: '',
  longitude: '',
  coordinate_precision: 'city',
  maps_url: '',
  phone: '',
  whatsapp_number: '',
  whatsapp_url: '',
  priority: 1,
  technical_service: true,
  active: true,
};

export default function AdminDistribuidores() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const { data, error } = await supabase
      .from('greenline_distributors')
      .select('*')
      .order('priority', { ascending: true })
      .order('sort_order', { ascending: true });
    if (error) console.warn('load distributors failed:', error.message);
    setItems(data || []);
    setLoading(false);
  }

  const openNew = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  };

  const openEdit = (d) => {
    setEditingId(d.id);
    setForm({
      country: d.country || 'Perú',
      department: d.department || '',
      province: d.province || '',
      district: d.district || '',
      name: d.name || '',
      ruc: d.ruc || '',
      contact_name: d.contact_name || '',
      address: d.address || '',
      latitude: d.latitude != null ? String(d.latitude) : '',
      longitude: d.longitude != null ? String(d.longitude) : '',
      coordinate_precision: d.coordinate_precision || 'city',
      maps_url: d.maps_url || '',
      phone: d.phone || '',
      whatsapp_number: d.whatsapp_number || '',
      whatsapp_url: d.whatsapp_url || '',
      priority: d.priority ?? 1,
      technical_service: d.technical_service ?? true,
      active: d.active ?? true,
    });
    setFormOpen(true);
  };

  const buildPayload = () => {
    const lat = form.latitude !== '' ? Number(form.latitude) : null;
    const lng = form.longitude !== '' ? Number(form.longitude) : null;
    return {
      country: form.country.trim() || 'Perú',
      department: form.department.trim(),
      province: form.province.trim(),
      district: form.district.trim(),
      name: form.name.trim(),
      ruc: form.ruc.trim() || null,
      contact_name: form.contact_name.trim() || null,
      address: form.address.trim(),
      latitude: lat,
      longitude: lng,
      coordinate_precision: form.coordinate_precision || 'city',
      maps_url: form.maps_url.trim() || null,
      phone: form.phone.trim() || null,
      whatsapp_number: form.whatsapp_number.trim() || null,
      whatsapp_url: form.whatsapp_url.trim() || null,
      priority: Number(form.priority) || 1,
      technical_service: form.technical_service,
      active: form.active,
    };
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.address.trim()) {
      alert('Nombre y dirección son obligatorios');
      return;
    }

    const payload = buildPayload();

    try {
      if (editingId) {
        const { error } = await supabase.from('greenline_distributors').update(payload).eq('id', editingId);
        if (error) throw error;
      } else {
        const { data: maxRow } = await supabase
          .from('greenline_distributors')
          .select('sort_order')
          .order('sort_order', { ascending: false })
          .limit(1);
        payload.sort_order = (maxRow?.[0]?.sort_order ?? 0) + 1;
        const { error } = await supabase.from('greenline_distributors').insert(payload);
        if (error) throw error;
      }
    } catch (err) {
      return alert(err.message || 'No se pudo guardar el distribuidor');
    }

    setFormOpen(false);
    load();
  };

  const toggleActivo = async (d) => {
    const { error } = await supabase
      .from('greenline_distributors')
      .update({ active: !d.active })
      .eq('id', d.id);
    if (error) return alert(error.message);
    load();
  };

  const handleDelete = async (d) => {
    if (!confirm(`¿Eliminar el distribuidor "${d.name}"?`)) return;
    const { error } = await supabase.from('greenline_distributors').delete().eq('id', d.id);
    if (error) return alert(error.message);
    load();
  };

  const setField = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Distribuidores</h1>
          <p className="text-sm text-gray-500 mt-1">
            Puntos de venta que se muestran en el directorio de distribuidores
          </p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-lg text-sm font-semibold hover:bg-brand-dark transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nuevo distribuidor
        </button>
      </div>

      {loading ? (
        <div className="text-gray-400 text-sm py-8 text-center">Cargando...</div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-10 text-center text-sm text-gray-500">
          No hay distribuidores todavía.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-50">
          {items.map((d) => (
            <div key={d.id} className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50/50 transition-colors">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-gray-900 text-sm">{d.name}</p>
                  <span className="text-[10px] font-semibold text-brand bg-brand/10 px-2 py-0.5 rounded">
                    {d.department}
                  </span>
                  {d.priority != null && (
                    <span className="text-[10px] font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                      Prioridad {d.priority}
                    </span>
                  )}
                  {!d.active && (
                    <span className="text-[10px] font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                      Oculto
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-600 mt-0.5 line-clamp-1">{d.address}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {[d.province, d.district, d.country].filter(Boolean).join(' · ')}
                </p>
              </div>

              <div className="flex items-center gap-1 self-center">
                <button
                  onClick={() => toggleActivo(d)}
                  className={`p-1.5 rounded-lg transition-colors ${
                    d.active ? 'text-gray-400 hover:text-brand' : 'text-gray-300 hover:text-brand'
                  }`}
                  title={d.active ? 'Ocultar' : 'Publicar'}
                >
                  {d.active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => openEdit(d)}
                  className="p-1.5 text-gray-400 hover:text-brand hover:bg-brand/10 rounded-lg transition-colors"
                  title="Editar"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(d)}
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
            className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-auto p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-gray-900">
                {editingId ? 'Editar distribuidor' : 'Nuevo distribuidor'}
              </h2>
              <button onClick={() => setFormOpen(false)} className="p-1.5 text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Nombre *</label>
                  <input value={form.name} onChange={(e) => setField('name', e.target.value)} className="input" placeholder="Nombre del distribuidor" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">RUC</label>
                  <input value={form.ruc} onChange={(e) => setField('ruc', e.target.value)} className="input" placeholder="RUC" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Dirección *</label>
                <input value={form.address} onChange={(e) => setField('address', e.target.value)} className="input" placeholder="Av. ..." />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Departamento</label>
                  <input value={form.department} onChange={(e) => setField('department', e.target.value)} className="input" placeholder="Lima" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Provincia</label>
                  <input value={form.province} onChange={(e) => setField('province', e.target.value)} className="input" placeholder="Lima" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Distrito</label>
                  <input value={form.district} onChange={(e) => setField('district', e.target.value)} className="input" placeholder="La Victoria" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">País</label>
                  <input value={form.country} onChange={(e) => setField('country', e.target.value)} className="input" placeholder="Perú" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Representante / contacto</label>
                <input value={form.contact_name} onChange={(e) => setField('contact_name', e.target.value)} className="input" placeholder="Nombre del contacto" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Teléfono</label>
                  <input value={form.phone} onChange={(e) => setField('phone', e.target.value)} className="input" placeholder="+51 ..." />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">WhatsApp (número)</label>
                  <input value={form.whatsapp_number} onChange={(e) => setField('whatsapp_number', e.target.value)} className="input" placeholder="519..." />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Enlace de mapa (maps_url)</label>
                <input value={form.maps_url} onChange={(e) => setField('maps_url', e.target.value)} className="input" placeholder="https://www.google.com/maps/..." />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Latitud</label>
                  <input value={form.latitude} onChange={(e) => setField('latitude', e.target.value)} className="input" placeholder="-12.065" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Longitud</label>
                  <input value={form.longitude} onChange={(e) => setField('longitude', e.target.value)} className="input" placeholder="-77.03" />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Prioridad</label>
                  <select
                    value={form.priority}
                    onChange={(e) => setField('priority', Number(e.target.value))}
                    className="input"
                  >
                    {[1, 2, 3].map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Precisión de coords</label>
                  <select
                    value={form.coordinate_precision}
                    onChange={(e) => setField('coordinate_precision', e.target.value)}
                    className="input"
                  >
                    <option value="city">Ciudad</option>
                    <option value="address">Dirección</option>
                  </select>
                </div>
                <div className="flex items-end pb-2">
                  <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.technical_service}
                      onChange={(e) => setField('technical_service', e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-brand focus:ring-brand"
                    />
                    Servicio técnico
                  </label>
                </div>
              </div>

              <div className="flex items-end">
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={(e) => setField('active', e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-brand focus:ring-brand"
                  />
                  Visible en la web
                </label>
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
