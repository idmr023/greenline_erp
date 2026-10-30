import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, Pencil, Trash2, Search, Upload, Eye, EyeOff, Calendar } from '../../lib/icons';
import { ColorDot } from '../ColorDot';
import AdminStockImportar from './AdminStockImportar';
import {
  estadoPublicacion,
  esFuturo,
  fechaAgendadaLegible,
  isoADatetimeLocal,
} from '../../utils/publicacionAgendada';

export default function AdminProductos({ onEdit, onNew }) {
    const [productos, setProductos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [filterCat, setFilterCat] = useState('');
    const [filterEstado, setFilterEstado] = useState('');
    const [categorias, setCategorias] = useState([]);
    const [colores, setColores] = useState([]);
    const [importando, setImportando] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);

    const [prodRes, catRes, coloresRes] = await Promise.all([
      supabase.from('productos').select(`
        id, nombre, slug, precio_actual, precio_original, destacado, disponible, activo, publicar_en, created_at,
        categoria:categorias(id, nombre),
        imagenes(id),
        color_rel:prod_color_rel(color_id, stock, visible, color:colores(id, nombre, hex_code))
      `).order('created_at', { ascending: false }),
      supabase.from('categorias').select('*').order('id'),
      supabase.from('colores').select('id, nombre, hex_code').order('nombre'),
    ]);

    setCategorias(catRes.data || []);
    setColores(coloresRes.data || []);

    // COMENTADO (temporal — stock por números / por sucursal. Se reactiva a futuro):
    // const [prodRes, catRes, stockRes] = await Promise.all([
    //   supabase.from('productos').select(`
    //     id, nombre, slug, precio_actual, precio_original, destacado, created_at,
    //     categoria:categorias(id, nombre),
    //     imagenes(id),
    //     color_rel:prod_color_rel(stock)
    //   `).order('created_at', { ascending: false }),
    //   supabase.from('categorias').select('*').order('id'),
    //   supabase.from('prod_color_stock')
    //     .select('producto_id, stock, tienda:tiendas(tipo)'),
    // ]);
    //
    // const porProducto = {};
    // for (const s of stockRes.data || []) {
    //   const item = porProducto[s.producto_id] || (porProducto[s.producto_id] = { almacen: 0, tiendas: 0 });
    //   if (s.tienda?.tipo === 'almacen') item.almacen += Number(s.stock) || 0;
    //   else item.tiendas += Number(s.stock) || 0;
    // }

    const data = (prodRes.data || []).map((p) => ({
      ...p,
      categoria_nombre: p.categoria?.nombre || 'Sin categoría',
      total_imagenes: (p.imagenes || []).length,
      disponible: p.disponible !== false,
      // Estado de publicación: false = borrador/programado (oculto de la tienda).
      activo: p.activo !== false,
      publicar_en: p.publicar_en || null,
      stock_total: (p.color_rel || []).reduce(
        (acc, cr) => acc + (Math.max(0, Math.trunc(Number(cr.stock))) || 0),
        0,
      ),
      colores_disponibles: (p.color_rel || [])
        .filter((cr) => cr.color && cr.visible !== false)
        .map((cr) => cr.color.nombre),
    }));

    setProductos(data);
    setLoading(false);
  }

  const borradores = productos.filter((p) => estadoPublicacion(p) === 'borrador').length;
  const programados = productos.filter(
    (p) => estadoPublicacion(p) === 'programado' && esFuturo(isoADatetimeLocal(p.publicar_en)),
  ).length;

  const filtered = productos.filter((p) => {
    const matchSearch = !search || p.nombre.toLowerCase().includes(search.toLowerCase());
    const matchCat = !filterCat || p.categoria_nombre === filterCat;
    const estado = estadoPublicacion(p);
    const matchEstado =
      !filterEstado ||
      (filterEstado === 'publicados' && estado === 'publicado') ||
      (filterEstado === 'programados' && estado === 'programado') ||
      (filterEstado === 'borradores' && (estado === 'borrador' || estado === 'programado'));
    return matchSearch && matchCat && matchEstado;
  });

  const handleDelete = async (id, nombre) => {
    if (!confirm(`¿Eliminar "${nombre}"? Esta acción no se puede deshacer.`)) return;
    await supabase.from('productos').delete().eq('id', id);
    load();
  };

  /**
   * Publica un borrador/programado o lo retira de la tienda, sin abrir el
   * formulario. Al cambiar el estado se limpia la agenda (publicar_en = NULL).
   */
  const handleToggleEstado = async (p) => {
    const publicar = !p.activo;
    const mensaje = publicar
      ? `¿Publicar "${p.nombre}"? Aparecerá en la tienda y en la web.`
      : `¿Pasar "${p.nombre}" a borrador? Dejará de aparecer en la tienda.`;
    if (!confirm(mensaje)) return;
    const { error } = await supabase
      .from('productos')
      .update({ activo: publicar, publicar_en: null })
      .eq('id', p.id);
    if (error) {
      alert(`No se pudo cambiar el estado: ${error.message}`);
      return;
    }
    load();
  };

  /** Cancela la agenda y deja el producto como borrador (oculto). */
  const handleCancelarAgenda = async (p) => {
    if (!confirm(`¿Cancelar la publicación programada de "${p.nombre}"? Quedará como borrador.`)) return;
    const { error } = await supabase
      .from('productos')
      .update({ activo: false, publicar_en: null })
      .eq('id', p.id);
    if (error) {
      alert(`No se pudo cancelar la agenda: ${error.message}`);
      return;
    }
    load();
  };

  /** Badge de estado: Publicado / Programado / Borrador. */
  const badgeEstado = (p) => {
    const estado = estadoPublicacion(p);
    if (estado === 'publicado') {
      return (
        <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">
          Publicado
        </span>
      );
    }
    if (estado === 'programado') {
      const futuro = esFuturo(isoADatetimeLocal(p.publicar_en));
      return (
        <span
          className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700"
          title={futuro
            ? `Se publicará el ${fechaAgendadaLegible(p.publicar_en)}`
            : `Agendado para ${fechaAgendadaLegible(p.publicar_en)} (pendiente de materializar)`}
        >
          Programado
        </span>
      );
    }
    return (
      <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
        Borrador
      </span>
    );
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Productos</h1>
          <p className="text-sm text-gray-500 mt-1">
            {productos.length} productos en total
            {borradores > 0 && ` · ${borradores} en borrador`}
            {programados > 0 && ` · ${programados} programados`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setImportando(true)}
            className="flex items-center gap-2 px-4 py-2 border border-gray-200 bg-white text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-50 transition-colors"
            title="Cargar unidades por modelo × color desde un .xlsx o .csv"
          >
            <Upload className="w-4 h-4" />
            Importar Excel
          </button>
          <button
            onClick={onNew}
            className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-lg text-sm font-semibold hover:bg-brand-dark transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nuevo Producto
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-3 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por nombre..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
          />
        </div>
        <select
          value={filterCat}
          onChange={(e) => setFilterCat(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
        >
          <option value="">Todas las categorías</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.nombre}>{c.nombre}</option>
          ))}
        </select>
        <select
          value={filterEstado}
          onChange={(e) => setFilterEstado(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
        >
          <option value="">Todos los estados</option>
          <option value="publicados">Publicados</option>
          <option value="programados">Programados</option>
          <option value="borradores">Borradores</option>
        </select>
      </div>

      {/* Tabla */}
      {loading ? (
        <div className="text-gray-400 text-sm py-8 text-center">Cargando productos...</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
<thead>
               <tr className="border-b border-gray-100 text-left">
                  <th className="px-4 py-3 font-semibold text-gray-600">ID</th>
                  <th className="px-4 py-3 font-semibold text-gray-600">Nombre</th>
                  <th className="px-4 py-3 font-semibold text-gray-600">Categoría</th>
                  <th className="px-4 py-3 font-semibold text-gray-600 text-right">Precio</th>
                  <th className="px-4 py-3 font-semibold text-gray-600 text-center">Estado</th>
                  <th className="px-4 py-3 font-semibold text-gray-600 text-center">Disponible</th>
                  <th className="px-4 py-3 font-semibold text-gray-600 text-center">Colores</th>
                  <th className="px-4 py-3 font-semibold text-gray-600 text-right">Stock</th>
                  <th className="px-4 py-3 font-semibold text-gray-600 text-right">Acciones</th>
                </tr>
             </thead>
<tbody>
               {filtered.map((p) => (
                 <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                   <td className="px-4 py-3 text-gray-400">{p.id}</td>
                   <td className="px-4 py-3 font-medium text-gray-900">{p.nombre}</td>
                   <td className="px-4 py-3 text-gray-600">{p.categoria_nombre}</td>
                   <td className="px-4 py-3 text-right font-medium text-gray-900">
                     S/ {Number(p.precio_actual).toLocaleString('es-PE')}
                   </td>
                    <td className="px-4 py-3 text-center">
                      {badgeEstado(p)}
                      {estadoPublicacion(p) === 'programado' && esFuturo(isoADatetimeLocal(p.publicar_en)) && (
                        <div className="text-[11px] text-blue-600 mt-0.5">
                          {fechaAgendadaLegible(p.publicar_en)}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                        p.disponible ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {p.disponible ? 'Disponible' : 'Agotado'}
                      </span>
                    </td>
                   <td className="px-4 py-3">
                     <div className="flex flex-wrap gap-1 justify-center">
                       {(p.colores_disponibles || []).map((nombre) => (
                         <ColorDot
                           key={nombre}
                           nombre={nombre}
                           coloresDetalle={colores}
                           className="w-4 h-4"
                         />
                       ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={`text-sm font-semibold ${p.stock_total > 0 ? 'text-gray-900' : 'text-red-500'}`}
                        title="Unidades en almacén (suma de todos los colores)"
                      >
                        {p.stock_total}
                      </span>
                      <span className="text-xs text-gray-400 ml-1">un.</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {estadoPublicacion(p) === 'programado' && (
                          <button
                            onClick={() => handleCancelarAgenda(p)}
                            className="p-1.5 rounded-lg text-blue-500 hover:text-blue-700 hover:bg-blue-50 transition-colors"
                            title="Cancelar publicación programada"
                          >
                            <Calendar className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => handleToggleEstado(p)}
                          className={`p-1.5 rounded-lg transition-colors ${
                            p.activo
                              ? 'text-amber-500 hover:text-amber-700 hover:bg-amber-50'
                              : 'text-green-600 hover:text-green-700 hover:bg-green-50'
                          }`}
                          title={p.activo ? 'Pasar a borrador' : 'Publicar en la tienda'}
                        >
                          {p.activo ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => onEdit(p.id)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-brand hover:bg-brand/10 transition-colors"
                          title="Editar"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(p.id, p.nombre)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                          title="Eliminar"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                 </tr>
               ))}
                {filtered.length === 0 && (
                   <tr>
                     <td colSpan={9} className="px-4 py-8 text-center text-gray-400">
                       No se encontraron productos
                     </td>
                   </tr>
                 )}
             </tbody>
          </table>
        </div>
      )}

      {importando && (
        <AdminStockImportar
          onClose={() => setImportando(false)}
          onAplicado={load}
        />
      )}
    </div>
  );
}
