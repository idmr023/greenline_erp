import { useState, useEffect, useCallback } from 'react';
import { useAbility } from '@casl/react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { authAPI } from '../../lib/api';
import { PANEL_ROLES } from '../../lib/roles';
import AdminDashboard from './AdminDashboard';
import AdminProductos from './AdminProductos';
import AdminProductoForm from './AdminProductoForm';
import AdminColores from './AdminColores';
import AdminTestimonios from './AdminTestimonios';
import AdminPedidos from './AdminPedidos';
import AdminBlog from './AdminBlog';
import AdminMetrics from './AdminMetrics';
import AdminDistribuidores from './AdminDistribuidores';
import AdminContactos from './AdminContactos';
import AdminReclamaciones from './AdminReclamaciones';
import AdminCitas from './AdminCitas';
import AdminEmails from './AdminEmails';
import AdminBoveda from './AdminBoveda';
import AdminUsuarios from './AdminUsuarios';
import { LayoutDashboard, Package, Palette, MessageSquareQuote, ShoppingCart, LogOut, ShieldCheck, Lock, Mail, Loader2, Activity, FileText, Gift, MapPin, Users, Wrench } from '../../lib/icons';
import { toggleTemaAniversario, temaAniversarioActivo } from '../../lib/aniversario';

const VIEWS = {
  DASHBOARD: 'dashboard',
  PRODUCTOS: 'productos',
  PRODUCTO_FORM: 'producto_form',
  COLORES: 'colores',
  TESTIMONIOS: 'testimonios',
  PEDIDOS: 'pedidos',
  METRICAS: 'metricas',
  BLOG: 'blog',
  DISTRIBUIDORES: 'distribuidores',
  CONTACTOS: 'contactos',
  RECLAMACIONES: 'reclamaciones',
  CITAS: 'citas',
  EMAILS: 'emails',
  BOVEDA: 'boveda',
  USUARIOS: 'usuarios',
};

/**
 * Secciones del panel. `perm` es el asunto CASL de la sección: la ability
 * llega de `GET /auth/permissions` (matriz única del backend) y aquí sólo se
 * pregunta `can('read', item.perm)`. Ni listas de roles ni casos por rol.
 */
const NAV_ITEMS = [
  { key: VIEWS.DASHBOARD, label: 'Dashboard', icon: LayoutDashboard, perm: 'menu:dashboard' },
  { key: VIEWS.PRODUCTOS, label: 'Productos', icon: Package, perm: 'menu:productos' },
  { key: VIEWS.COLORES, label: 'Colores', icon: Palette, perm: 'menu:colores' },
  { key: VIEWS.BLOG, label: 'Blog', icon: FileText, perm: 'menu:blog' },
  { key: VIEWS.DISTRIBUIDORES, label: 'Distribuidores', icon: MapPin, perm: 'menu:distribuidores' },
  { key: VIEWS.TESTIMONIOS, label: 'Testimonios', icon: MessageSquareQuote, perm: 'menu:testimonios' },
  { key: VIEWS.PEDIDOS, label: 'Pedidos', icon: ShoppingCart, perm: 'menu:pedidos' },
  { key: VIEWS.CONTACTOS, label: 'Contactos', icon: Mail, perm: 'menu:contactos' },
  { key: VIEWS.RECLAMACIONES, label: 'Reclamaciones', icon: FileText, perm: 'menu:reclamaciones' },
  // Citas de servicio técnico (§10): la agenda por tienda; las tiendas
  // se enteran por correo, aquí sólo administra el equipo central.
  { key: VIEWS.CITAS, label: 'Citas', icon: Wrench, perm: 'menu:citas' },
  { key: VIEWS.EMAILS, label: 'Email Logs', icon: Activity, perm: 'menu:emails' },
  { key: VIEWS.METRICAS, label: 'Métricas', icon: Activity, perm: 'menu:metricas' },
  // Bóveda Segura V5: la ABRE todo el staff (§40 — ver y copiar es de todos);
  // escribir dentro la decide AdminBoveda con `boveda:write`, que es lo que
  // el RLS acepta en greenline_vault_items.
  { key: VIEWS.BOVEDA, label: 'Bóveda', icon: Lock, perm: 'menu:boveda' },
  // Usuarios (backend /api/users, RBAC usuarios:*): ver y gestionar cuentas,
  // rol (permisos), alta/baja y el correo con el que cada quien fija su clave.
  { key: VIEWS.USUARIOS, label: 'Usuarios', icon: Users, perm: 'menu:usuarios' },
];

/**
 * Secciones visibles para la ability de ESTA sesión. La unión multi-rol ya
 * la resolvió el servidor al construir la matriz; el cliente sólo filtra.
 */
function navVisibleDe(ability) {
  return NAV_ITEMS.filter((i) => ability.can('read', i.perm));
}

export default function AdminPanel() {
  const { logout, accessToken } = useAuth();
  const ability = useAbility();

  const getInitialView = () => {
    const path = window.location.pathname;
    let candidata = VIEWS.DASHBOARD;
    if (path.includes('/admin/distribuidores')) candidata = VIEWS.DISTRIBUIDORES;
    else if (path.includes('/admin/blog')) candidata = VIEWS.BLOG;
    else if (path.includes('/admin/productos')) candidata = VIEWS.PRODUCTOS;
    else if (path.includes('/admin/colores')) candidata = VIEWS.COLORES;
    else if (path.includes('/admin/testimonios')) candidata = VIEWS.TESTIMONIOS;
    else if (path.includes('/admin/pedidos')) candidata = VIEWS.PEDIDOS;
    else if (path.includes('/admin/contactos')) candidata = VIEWS.CONTACTOS;
    else if (path.includes('/admin/reclamaciones')) candidata = VIEWS.RECLAMACIONES;
    else if (path.includes('/admin/citas')) candidata = VIEWS.CITAS;
    else if (path.includes('/admin/emails')) candidata = VIEWS.EMAILS;
    else if (path.includes('/admin/metricas')) candidata = VIEWS.METRICAS;
    else if (path.includes('/admin/usuarios')) candidata = VIEWS.USUARIOS;
    else if (path.includes('/admin/dashboard')) candidata = VIEWS.DASHBOARD;

    // Una URL directa no debe abrir una sección que la sesión no ve (§40).
    // El primer ítem permitido además resuelve la landing de quien sólo ve
    // blog o distribuidores, sin casos especiales por rol.
    const permitidas = navVisibleDe(ability).map((i) => i.key);
    if (permitidas.length === 0) return VIEWS.DASHBOARD;
    return permitidas.includes(candidata) ? candidata : permitidas[0];
  };

  const [view, setView] = useState(getInitialView);
  const [editingId, setEditingId] = useState(null);
  const [supabaseReady, setSupabaseReady] = useState(false);
  const [hasSupabaseSession, setHasSupabaseSession] = useState(false);
  const [grants, setGrants] = useState([]);
  const [grantsLoading, setGrantsLoading] = useState(false);

  const canGrant = ability.can('acceso', 'panel');

  const canManageAniv = ability.can('update', 'config');
  const [anivOn, setAnivOn] = useState(() => temaAniversarioActivo());
  const handleAnivToggle = () => setAnivOn(toggleTemaAniversario());

  const visibleNav = navVisibleDe(ability);

  // Rótulo del sidebar según el perfil de permisos de la sesión.
  const subtitulo = canGrant
    ? 'Admin Panel'
    : ability.can('read', 'menu:blog')
      ? 'Editar Blog'
      : ability.can('read', 'menu:distribuidores')
        ? 'Distribuidores'
        : 'Admin Panel';

  const refreshGrants = useCallback(async () => {
    setGrantsLoading(true);
    try {
      const res = await authAPI.panelGrants(accessToken);
      setGrants(res.roles.map((r) => r.rol));
    } catch {
      // El administrador no puede leer los accesos: ignorar
    } finally {
      setGrantsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setHasSupabaseSession(!!data.session);
      setSupabaseReady(true);
    });
  }, []);

  useEffect(() => {
    if (canGrant) refreshGrants();
  }, [canGrant, refreshGrants]);

  const toggleGrant = async (rol, activo) => {
    try {
      await authAPI.setPanelGrant({ rol, activo }, accessToken);
      await refreshGrants();
    } catch {
      // Error de red o sin permisos: ignorar
    }
  };

  const navigateTo = (target, id = null) => {
    setEditingId(id);
    setView(target);
    const newPath = target === VIEWS.DASHBOARD ? '/admin' : `/admin/${target}`;
    window.history.pushState({}, '', newPath);
  };

  if (!supabaseReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-6 h-6 text-brand animate-spin" />
      </div>
    );
  }

  if (!hasSupabaseSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-sm bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
          <div className="text-2xl mb-3">!</div>
          <h1 className="text-lg font-bold text-gray-900">No se pudo conectar el panel</h1>
          <p className="text-sm text-gray-500 mt-2">
            Cierra sesión y vuelve a ingresar. La conexión con el panel de datos
            se realiza automáticamente durante el inicio de sesión.
          </p>
          <button
            type="button"
            onClick={() => window.location.assign('/login')}
            className="mt-5 w-full py-2.5 bg-brand text-white font-semibold rounded-lg hover:bg-brand-dark transition-colors"
          >
            Volver a iniciar sesión
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col shrink-0">
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-brand rounded-lg flex items-center justify-center">
              <span className="text-white text-xs font-bold">GL</span>
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900">GreenLine</p>
              <p className="text-[10px] text-gray-400">{subtitulo}</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {visibleNav.map((item) => {
            const Icon = item.icon;
            const active = view === item.key || (item.key === VIEWS.PRODUCTOS && view === VIEWS.PRODUCTO_FORM);
            return (
              <button
                key={item.key}
                onClick={() => navigateTo(item.key)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                  active
                    ? 'bg-brand/10 text-brand font-semibold'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </button>
            );
          })}
        </nav>

        {canGrant && (
          <div className="mx-3 mb-3 p-3 rounded-lg bg-gray-50 border border-gray-100">
            <div className="flex items-center gap-2 mb-1">
              <ShieldCheck className="w-4 h-4 text-brand" />
              <p className="text-xs font-bold text-gray-700">Acceso al panel</p>
            </div>
            <p className="text-[10px] text-gray-400 mb-2">Roles con permiso de escritura</p>
            <div className="space-y-1">
              {PANEL_ROLES.map((rol) => {
                const active = grants.includes(rol);
                const locked = rol === 'ADMIN';
                return (
                  <div key={rol} className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-gray-600">{rol}</span>
                    <button
                      type="button"
                      disabled={grantsLoading || locked}
                      onClick={() => toggleGrant(rol, !active)}
                      className={`relative w-9 h-5 rounded-full transition-colors ${
                        active ? 'bg-brand' : 'bg-gray-300'
                      } ${locked ? 'opacity-60 cursor-not-allowed' : 'hover:opacity-80'}`}
                      title={locked ? 'El administrador siempre tiene acceso' : (active ? 'Revocar acceso' : 'Conceder acceso')}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                          active ? 'translate-x-4' : ''
                        }`}
                      />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {canManageAniv && (
          <div className="mx-3 mb-3 p-3 rounded-lg bg-rose-50 border border-rose-100">
            <div className="flex items-center gap-2 mb-1">
              <Gift className="w-4 h-4 text-rose-500" />
              <p className="text-xs font-bold text-gray-700">Tema aniversario</p>
            </div>
            <p className="text-[10px] text-gray-400 mb-2">Solo administradores y desarrolladores</p>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-gray-600">{anivOn ? 'Activado' : 'Desactivado'}</span>
              <button
                type="button"
                onClick={handleAnivToggle}
                className={`relative w-9 h-5 rounded-full transition-colors ${
                  anivOn ? 'bg-rose-500' : 'bg-gray-300'
                } hover:opacity-80`}
                title={anivOn ? 'Desactivar tema de aniversario' : 'Activar tema de aniversario'}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                    anivOn ? 'translate-x-4' : ''
                  }`}
                />
              </button>
            </div>
          </div>
        )}

        <div className="p-3 border-t border-gray-100">
          <button
            onClick={logout}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {view === VIEWS.DASHBOARD && <AdminDashboard onNavigate={navigateTo} />}
        {view === VIEWS.PRODUCTOS && (
          <AdminProductos
            onEdit={(id) => navigateTo(VIEWS.PRODUCTO_FORM, id)}
            onNew={() => navigateTo(VIEWS.PRODUCTO_FORM)}
          />
        )}
        {view === VIEWS.PRODUCTO_FORM && (
          <AdminProductoForm
            productoId={editingId}
            onBack={() => navigateTo(VIEWS.PRODUCTOS)}
            onSaved={() => navigateTo(VIEWS.PRODUCTOS)}
          />
        )}
        {view === VIEWS.COLORES && <AdminColores />}
        {view === VIEWS.BLOG && <AdminBlog />}
        {view === VIEWS.DISTRIBUIDORES && <AdminDistribuidores />}
        {view === VIEWS.TESTIMONIOS && <AdminTestimonios />}
        {view === VIEWS.PEDIDOS && <AdminPedidos />}
        {view === VIEWS.CONTACTOS && <AdminContactos />}
        {view === VIEWS.RECLAMACIONES && <AdminReclamaciones />}
        {view === VIEWS.CITAS && <AdminCitas />}
        {view === VIEWS.EMAILS && <AdminEmails />}
        {view === VIEWS.METRICAS && <AdminMetrics />}
        {view === VIEWS.BOVEDA && <AdminBoveda />}
        {view === VIEWS.USUARIOS && <AdminUsuarios />}
      </main>
    </div>
  );
}