import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Package, AlertTriangle, Image, TrendingUp } from '../../lib/icons';

export default function AdminDashboard({ onNavigate }) {
  const [stats, setStats] = useState({
    totalProductos: 0,
    noDisponibles: 0,
    sinImagenes: 0,
    destacados: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStats() {
      const [productos, imagenes] = await Promise.all([
        supabase.from('productos').select('id, destacado, disponible', { count: 'exact', head: false }),
        supabase.from('imagenes').select('producto_id'),
      ]);

      // COMENTADO (temporal — stock por números):
      // const [productos, imagenes, sinStock] = await Promise.all([
      //   supabase.from('productos').select('id, destacado', { count: 'exact', head: false }),
      //   supabase.from('imagenes').select('producto_id'),
      //   supabase.from('prod_color_rel').select('producto_id, stock'),
      // ]);

      const idsConImagen = new Set((imagenes.data || []).map((i) => i.producto_id));
      // COMENTADO (temporal):
      // const stockPorProducto = {};
      // (sinStock.data || []).forEach((r) => {
      //   stockPorProducto[r.producto_id] = (stockPorProducto[r.producto_id] || 0) + r.stock;
      // });

      setStats({
        totalProductos: productos.count || 0,
        noDisponibles: (productos.data || []).filter((p) => p.disponible === false).length,
        sinImagenes: (productos.data || []).filter((p) => !idsConImagen.has(p.id)).length,
        destacados: (productos.data || []).filter((p) => p.destacado).length,
        // COMENTADO (temporal):
        // sinStock: (productos.data || []).filter((p) => (stockPorProducto[p.id] || 0) === 0).length,
      });
      setLoading(false);
    }
    loadStats();
  }, []);

  if (loading) return <div className="p-8 text-gray-400 text-sm">Cargando estadísticas...</div>;

  const cards = [
    { label: 'Total Productos', value: stats.totalProductos, icon: Package, color: 'text-brand', bg: 'bg-brand/10' },
    { label: 'Destacados', value: stats.destacados, icon: TrendingUp, color: 'text-amber-600', bg: 'bg-amber-50' },
    { label: 'No Disponibles', value: stats.noDisponibles, icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50' },
    { label: 'Sin Imágenes', value: stats.sinImagenes, icon: Image, color: 'text-gray-500', bg: 'bg-gray-100' },
  ];

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">Resumen de tu catálogo de productos</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="bg-white rounded-xl border border-gray-100 p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${card.bg}`}>
                  <Icon className={`w-5 h-5 ${card.color}`} />
                </div>
                <span className="text-sm text-gray-500">{card.label}</span>
              </div>
              <p className="text-3xl font-bold text-gray-900">{card.value}</p>
            </div>
          );
        })}
      </div>

      <div className="flex gap-3">
        <button
          onClick={() => onNavigate('productos')}
          className="px-4 py-2 bg-brand text-white rounded-lg text-sm font-semibold hover:bg-brand-dark transition-colors"
        >
          Gestionar Productos
        </button>
        <button
          onClick={() => onNavigate('colores')}
          className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-200 transition-colors"
        >
          Gestionar Colores
        </button>
      </div>
    </div>
  );
}
