import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { authAPI } from '../../lib/api';
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
import AdminEmails from './AdminEmails';
import { LayoutDashboard, Package, Palette, MessageSquareQuote, ShoppingCart, LogOut, ShieldCheck, Lock, Mail, Loader2, AlertCircle, Activity, FileText, Gift, MapPin } from '../../lib/icons';
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
  EMAILS: 'emails',
};

const NAV_ITEMS = [
  { key: VIEWS.DASHBOARD, label: 'Dashboard', icon: LayoutDashboard },
  { key: VIEWS.PRODUCTOS, label: 'Productos', icon: Package },
  { key: VIEWS.COLORES, label: 'Colores', icon: Palette },
  { key: VIEWS.BLOG, label: 'Blog', icon: FileText },
  { key: VIEWS.DISTRIBUIDORES, label: 'Distribuidores', icon: MapPin },
  { key: VIEWS.TESTIMONIOS, label: 'Testimonios', icon: MessageSquareQuote },
  { key: VIEWS.PEDIDOS, label: 'Pedidos', icon: ShoppingCart },
  { key: VIEWS.CONTACTOS, label: 'Contactos', icon: Mail },
  { key: VIEWS.RECLAMACIONES, label: 'Reclamaciones', icon: FileText },
  { key: VIEWS.EMAILS, label: 'Email Logs', icon: Activity },
  { key: VIEWS.METRICAS, label: 'Métricas', icon: Activity },
];

const PANEL_GRANT_ROLES = ['ADMIN', 'DESARROLLADOR_WEB'];

// Solo administradores y desarrolladores web pueden activar/desactivar el tema aniversario.
const ANIV_ROLES = ['ADMIN', 'DESARROLLADOR_WEB'];

// Solo gestión de blog (pueden editar/eliminar cualquier artículo del blog).
const BLOG_ROLES = ['EDITORA_BLOG'];

// Solo gestión de distribuidores.
const DISTRIBUCION_ROLES = ['DISTRIBUCION'];

const STAFF_ROLES = [
  'ADMIN', 'DESARROLLADOR_WEB', 'EDITORA_BLOG', 'DISTRIBUCION',
  'GERENTE_TIENDA', 'COLABORADOR_TIENDA', 'GERENTE_ALMACEN', 'COLABORADOR_ALMACEN',
];

function AdminSupabaseLogin({ accessToken, userEmail, onLinked }) {
  const [email, setEmail] = useState(userEmail || '');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const trySignIn = async (mail, pass) => {
    const res = await supabase.auth.signInWithPassword({ email: mail, password: pass });
    return res.error ? res.error : null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    let err = await trySignIn(email, password);

    if (err) {
      // Primera vez: crear/actualizar la cuenta Supabase con la misma credencial
      try {
        await authAPI.supabaseSync(password, accessToken);
      } catch (syncErr) {
        const detail = syncErr?.details?.body?.[0];
        setError(detail || syncErr?.error || syncErr?.message || 'No se pudo vincular el acceso de datos');
        setLoading(false);
        return;
      }
      err = await trySignIn(email, password);
    }

    setLoading(false);

    if (err) {
      setError(err.message || 'No se pudo iniciar sesión en el panel de datos');
      return;
    }

    onLinked();
  };

  return (
    <div className="w-full max-w-sm">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8">
        <div className="text-center mb-6">
          <div className="w-12 h-12 bg-brand rounded-xl flex items-center justify-center mx-auto mb-3">
            <ShieldCheck className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-lg font-bold text-gray-900">Acceso al panel de datos</h1>
          <p className="text-sm text-gray-500 mt-1">
            Usa las mismas credenciales de tu cuenta de GreenLine
          </p>
        </div>

        {error && (
          <div className="flex items-center gap-2 bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg mb-4">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
                placeholder="tu@email.com"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
                placeholder="••••••••"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-brand text-white font-semibold rounded-lg hover:bg-brand-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Conectando...
              </>
            ) : (
              'Iniciar sesión'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function AdminPanel() {
  const { user, logout, accessToken } = useAuth();

  const getInitialView = () => {
    const path = window.location.pathname;
    if (path.includes('/admin/distribuidores')) return VIEWS.DISTRIBUIDORES;
    if (path.includes('/admin/blog')) return VIEWS.BLOG;
    if (path.includes('/admin/productos')) return VIEWS.PRODUCTOS;
    if (path.includes('/admin/colores')) return VIEWS.COLORES;
    if (path.includes('/admin/testimonios')) return VIEWS.TESTIMONIOS;
    if (path.includes('/admin/pedidos')) return VIEWS.PEDIDOS;
    if (path.includes('/admin/contactos')) return VIEWS.CONTACTOS;
    if (path.includes('/admin/reclamaciones')) return VIEWS.RECLAMACIONES;
    if (path.includes('/admin/emails')) return VIEWS.EMAILS;
    if (path.includes('/admin/metricas')) return VIEWS.METRICAS;
    if (path.includes('/admin/dashboard')) return VIEWS.DASHBOARD;

    if (user) {
      if (BLOG_ROLES.includes(user.rol)) return VIEWS.BLOG;
      if (DISTRIBUCION_ROLES.includes(user.rol)) return VIEWS.DISTRIBUIDORES;
    }
    return VIEWS.DASHBOARD;
  };

  const [view, setView] = useState(getInitialView);
  const [editingId, setEditingId] = useState(null);
  const [supabaseReady, setSupabaseReady] = useState(false);
  const [hasSupabaseSession, setHasSupabaseSession] = useState(false);
  const [grants, setGrants] = useState([]);
  const [grantsLoading, setGrantsLoading] = useState(false);

  const canGrant = user ? PANEL_GRANT_ROLES.includes(user.rol) : false;

  const canManageAniv = user ? ANIV_ROLES.includes(user.rol) : false;
  const [anivOn, setAnivOn] = useState(() => temaAniversarioActivo());
  const handleAnivToggle = () => setAnivOn(toggleTemaAniversario());

  // Los roles de blog solo ven la gestión de blog (sin Dashboard ni catálogo).
  // DISTRIBUCION solo ve la sección de distribuidores.
  // El resto (ADMIN/DESARROLLADOR_WEB) ve el panel completo.
  let visibleNav = NAV_ITEMS;
  if (user && BLOG_ROLES.includes(user.rol)) {
    visibleNav = NAV_ITEMS.filter((i) => i.key === VIEWS.BLOG);
  } else if (user && DISTRIBUCION_ROLES.includes(user.rol)) {
    visibleNav = NAV_ITEMS.filter((i) => i.key === VIEWS.DISTRIBUIDORES);
  }

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
        <AdminSupabaseLogin accessToken={accessToken} userEmail={user?.email} onLinked={() => setHasSupabaseSession(true)} />
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
              <p className="text-[10px] text-gray-400">{user?.rol === 'EDITORA_BLOG' ? 'Editar Blog' : user?.rol === 'DISTRIBUCION' ? 'Distribuidores' : 'Admin Panel'}</p>
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
              {STAFF_ROLES.map((rol) => {
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
        {view === VIEWS.EMAILS && <AdminEmails />}
        {view === VIEWS.METRICAS && <AdminMetrics />}
      </main>
    </div>
  );
}