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
import AdminBoveda from './AdminBoveda';
import AdminUsuarios from './AdminUsuarios';
import { LayoutDashboard, Package, Palette, MessageSquareQuote, ShoppingCart, LogOut, ShieldCheck, Lock, Mail, Loader2, AlertCircle, Activity, FileText, Gift, MapPin, Users } from '../../lib/icons';
import { toggleTemaAniversario, temaAniversarioActivo } from '../../lib/aniversario';
import { ADMIN_ROLES, PANEL_ROLES, ROLES_BLOG, ROLES_DISTRIBUCION, ROLES_MAXIMOS, USUARIOS_ROLES, tieneRol } from '../../lib/roles';

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
  BOVEDA: 'boveda',
  USUARIOS: 'usuarios',
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
  { key: VIEWS.EMAILS, label: 'Email Logs', icon: Activity, soloRoles: ADMIN_ROLES },
  { key: VIEWS.METRICAS, label: 'Métricas', icon: Activity, soloRoles: ROLES_MAXIMOS },
  // Bóveda Segura V5: la ABRE todo el staff (§40 — ver y copiar es de todos);
  // escribir dentro la decide AdminBoveda con ROLES_MAXIMOS, que es lo que
  // el RLS acepta en greenline_vault_items.
  { key: VIEWS.BOVEDA, label: 'Bóveda', icon: Lock, soloRoles: PANEL_ROLES },
  // Usuarios (backend /api/users, RBAC usuarios:*): ver y gestionar cuentas,
  // rol (permisos), alta/baja y el correo con el que cada quien fija su clave.
  { key: VIEWS.USUARIOS, label: 'Usuarios', icon: Users, soloRoles: USUARIOS_ROLES },
];

/** Secciones que los colaboradores ven en /admin (§40 mínimo privilegio). */
const NAV_STAFF = [VIEWS.DASHBOARD, VIEWS.PEDIDOS, VIEWS.CONTACTOS, VIEWS.RECLAMACIONES, VIEWS.BOVEDA];

/**
 * Menú visible para un rol. Las reglas, en orden:
 *  - EDITORA_BLOG sólo blog; DISTRIBUCION sólo distribuidores (ya era así).
 *    Ambos además abren la Bóveda en modo lectura (§40 / D2).
 *  - Autoridad máxima (ADMIN_ROLES): todo lo que sus `soloRoles` permitan.
 *  - El resto de colaboradores: sólo las secciones operativas de NAV_STAFF.
 */
function navVisibleDe(user) {
  if (!user) return [];
  if (tieneRol(ROLES_BLOG, user.rol)) {
    return NAV_ITEMS.filter((i) => i.key === VIEWS.BLOG || i.key === VIEWS.BOVEDA);
  }
  if (tieneRol(ROLES_DISTRIBUCION, user.rol)) {
    return NAV_ITEMS.filter(
      (i) => i.key === VIEWS.DISTRIBUIDORES || i.key === VIEWS.USUARIOS || i.key === VIEWS.BOVEDA,
    );
  }
  const base = tieneRol(ADMIN_ROLES, user.rol)
    ? NAV_ITEMS
    : NAV_ITEMS.filter((i) => NAV_STAFF.includes(i.key));
  // Los ítems con `soloRoles` sólo aparecen para esos roles (§40).
  return base.filter((i) => !i.soloRoles || tieneRol(i.soloRoles, user.rol));
}

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
    let candidata = VIEWS.DASHBOARD;
    if (path.includes('/admin/distribuidores')) candidata = VIEWS.DISTRIBUIDORES;
    else if (path.includes('/admin/blog')) candidata = VIEWS.BLOG;
    else if (path.includes('/admin/productos')) candidata = VIEWS.PRODUCTOS;
    else if (path.includes('/admin/colores')) candidata = VIEWS.COLORES;
    else if (path.includes('/admin/testimonios')) candidata = VIEWS.TESTIMONIOS;
    else if (path.includes('/admin/pedidos')) candidata = VIEWS.PEDIDOS;
    else if (path.includes('/admin/contactos')) candidata = VIEWS.CONTACTOS;
    else if (path.includes('/admin/reclamaciones')) candidata = VIEWS.RECLAMACIONES;
    else if (path.includes('/admin/emails')) candidata = VIEWS.EMAILS;
    else if (path.includes('/admin/metricas')) candidata = VIEWS.METRICAS;
    else if (path.includes('/admin/usuarios')) candidata = VIEWS.USUARIOS;
    else if (path.includes('/admin/dashboard')) candidata = VIEWS.DASHBOARD;

    if (user) {
      if (tieneRol(ROLES_BLOG, user.rol)) candidata = VIEWS.BLOG;
      else if (tieneRol(ROLES_DISTRIBUCION, user.rol)) candidata = VIEWS.DISTRIBUIDORES;
    }

    // Una URL directa no debe abrir una sección que el rol no ve (§40).
    const permitidas = navVisibleDe(user).map((i) => i.key);
    if (permitidas.length === 0) return VIEWS.DASHBOARD;
    return permitidas.includes(candidata) ? candidata : permitidas[0];
  };

  const [view, setView] = useState(getInitialView);
  const [editingId, setEditingId] = useState(null);
  const [supabaseReady, setSupabaseReady] = useState(false);
  const [hasSupabaseSession, setHasSupabaseSession] = useState(false);
  const [grants, setGrants] = useState([]);
  const [grantsLoading, setGrantsLoading] = useState(false);

  const canGrant = user ? tieneRol(ROLES_MAXIMOS, user.rol) : false;

  const canManageAniv = user ? tieneRol(ROLES_MAXIMOS, user.rol) : false;
  const [anivOn, setAnivOn] = useState(() => temaAniversarioActivo());
  const handleAnivToggle = () => setAnivOn(toggleTemaAniversario());

  const visibleNav = navVisibleDe(user);

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
        {view === VIEWS.EMAILS && <AdminEmails />}
        {view === VIEWS.METRICAS && <AdminMetrics />}
        {view === VIEWS.BOVEDA && <AdminBoveda />}
        {view === VIEWS.USUARIOS && <AdminUsuarios />}
      </main>
    </div>
  );
}