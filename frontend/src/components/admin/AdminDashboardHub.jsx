import { useState, useEffect, useCallback } from 'react';
import { useAbility } from '@casl/react';
import { LayoutDashboard, Wrench, Award, Package, TrendingUp, AlertTriangle, Image } from '../../lib/icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { rolesDe } from '../../lib/roles';
import { navVisibleDe } from '../../lib/nav';

/**
 * Accesos rápidos del hub. `perm` es el asunto CASL de la sección, igual
 * que en la nav lateral: sin él, la tarjeta no se pinta. El hub no decide
 * por rol, sólo filtra lo que `GET /auth/permissions` ya resolvió.
 */
const OPCIONES = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    description: 'Resumen de tu catálogo de productos',
    perm: 'menu:dashboard',
    vista: 'dashboard',
  },
  {
    id: 'servicio-tecnico',
    label: 'Servicio Técnico por Sede',
    icon: Wrench,
    description: 'Indicadores de servicio, técnicos y cumplimiento por sede',
    perm: 'menu:servicio_tecnico',
    vista: 'servicio_tecnico',
  },
  {
    id: 'evaluacion-incentivos',
    label: 'Evaluación de Incentivos',
    icon: Award,
    description: 'Puntaje y evaluaciones de armadores por mes y tienda',
    perm: 'menu:evaluacion-armadores',
    vista: 'evaluaciones',
  },
  {
    id: 'reporte-ensamblado',
    label: 'Reporte Ensamblado',
    icon: Package,
    description: 'Registro de ensamblado y resumen por sede',
    perm: 'menu:ensamblado',
    vista: 'ensamblado',
  },
];

/** Botones de pie del hub, con la sección que abren. */
const ACCESOS_DIRECTOS = [
  { id: 'productos', label: 'Gestionar Productos', vista: 'productos', perm: 'menu:productos', primario: true },
  { id: 'colores', label: 'Gestionar Colores', vista: 'colores', perm: 'menu:colores', primario: false },
];

export default function AdminDashboardHub({ onNavigate }) {
const [stats, setStats] = useState({
    totalProductos: 0,
    noDisponibles: 0,
    sinImagenes: 0,
    destacados: 0,
  });
  const [loading, setLoading] = useState(true);

  const ability = useAbility();
  const { user } = useAuth();
  const roles = rolesDe(user);
  const can = (perm) => ability.can('read', perm);

  // El hub sólo ofrece lo que la sesión puede abrir: sin este filtro, una
  // tarjeta o un botón bastaban para llegar a una vista sin permiso
  // (navigateTo ahora también redirige, pero no hay que enseñar lo inaccesible).
  const opcionesVisibles = navVisibleDe(OPCIONES, can, roles);
  const accesosVisibles = navVisibleDe(ACCESOS_DIRECTOS, can, roles);
  const sinSecciones = opcionesVisibles.length === 0 && accesosVisibles.length === 0;

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
      {sinSecciones ? (
        <p className="text-sm text-gray-500 bg-white rounded-xl border border-gray-100 p-6">
          Tu perfil no tiene secciones habilitadas en este panel.
        </p>
      ) : (
        <>
          {opcionesVisibles.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {opcionesVisibles.map((op) => {
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
          )}

          {accesosVisibles.length > 0 && (
            <div className="mt-6 flex gap-3">
              {accesosVisibles.map((acceso) => (
                <button
                  key={acceso.id}
                  onClick={() => onNavigate(acceso.vista)}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    acceso.primario
                      ? 'bg-brand text-white hover:bg-brand-dark'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {acceso.label}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}