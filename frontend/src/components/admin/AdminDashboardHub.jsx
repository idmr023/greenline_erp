import { useState, useEffect, useCallback } from 'react';
import { LayoutDashboard, Wrench, Award, Package, TrendingUp, Users, ShieldCheck, FileText, RefreshCw, AlertTriangle, Image } from '../../lib/icons';
import { supabase } from '../../lib/supabase';

const OPCIONES = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    description: 'Resumen de tu catálogo de productos',
    permiso: 'menu:dashboard',
    vista: 'dashboard',
  },
  {
    id: 'servicio-tecnico',
    label: 'Servicio Técnico por Sede',
    icon: Wrench,
    description: 'Indicadores de servicio, técnicos y cumplimiento por sede',
    permiso: 'menu:servicio_tecnico',
    vista: 'servicio_tecnico',
  },
  {
    id: 'evaluacion-incentivos',
    label: 'Evaluación de Incentivos',
    icon: Award,
    description: 'Puntaje y evaluaciones de armadores por mes y tienda',
    permiso: 'menu:evaluacion-armadores',
    vista: 'evaluaciones',
  },
  {
    id: 'reporte-ensamblado',
    label: 'Reporte Ensamblado',
    icon: Package,
    description: 'Registro de ensamblado y resumen por sede',
    permiso: 'menu:ensamblado',
    vista: 'ensamblado',
  },
];

export default function AdminDashboardHub({ onNavigate }) {
const [stats, setStats] = useState({
    totalProductos: 0,
    noDisponibles: 0,
    sinImagenes: 0,
    destacados: 0,
  });
  const [loading, setLoading] = useState(true);

  const loadStats = useCallback(async () => {
    try {
      const [productos, imagenes] = await Promise.all([
        supabase.from('productos').select('id, destacado, disponible', { count: 'exact', head: false }),
        supabase.from('imagenes').select('producto_id'),
      ]);
      const idsConImagen = new Set((imagenes.data || []).map((i) => i.producto_id));
      setStats({
        totalProductos: productos.count || 0,
        noDisponibles: (productos.data || []).filter((p) => p.disponible === false).length,
        sinImagenes: (productos.data || []).filter((p) => !idsConImagen.has(p.id)).length,
        destacados: (productos.data || []).filter((p) => p.destacado).length,
      });
    } catch {
      // silenciar errores de estadísticas
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

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
        <p className="text-sm text-gray-500 mt-1">Resumen y acceso rápido a los módulos del taller</p>
      </div>

      {/* Estadísticas rápidas */}
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
              <p className="text-3xl font-bold text-gray-900">{loading ? '—' : card.value}</p>
            </div>
          );
        })}
      </div>

      {/* Opciones del portal */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {OPCIONES.map((op) => {
          const Icon = op.icon;
          return (
            <button
              key={op.id}
              onClick={() => onNavigate(op.vista)}
              className="group bg-white rounded-xl border border-gray-100 p-6 text-left hover:border-brand/40 hover:shadow-md transition-all duration-200"
            >
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-brand/10 flex items-center justify-center shrink-0 group-hover:bg-brand/20 transition-colors">
                  <Icon className="w-6 h-6 text-brand" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-bold text-gray-900 group-hover:text-brand transition-colors">
                    {op.label}
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">{op.description}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-6 flex gap-3">
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