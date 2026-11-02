import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { AbilityProvider, useAbility } from '@casl/react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { VaultProvider } from './contexts/VaultContext';
import ProtectedRoute from './components/ProtectedRoute';
import { ADMIN_ROLES, rolesDe, tieneRol } from './lib/roles';
import { puedeEntrarAlPanel } from './lib/permissions';
import { cambiarPasswordConNext, destinoPostLogin } from './lib/nextRoute';
import SEOHead from './components/SEOHead';
import LoginPage from './pages/LoginPage';
import ChangePasswordPage from './pages/ChangePasswordPage';
import PageLoader from './PageLoader';

const SITE_URL = import.meta.env.VITE_SITE_URL
  || (window.location.hostname === 'localhost' ? 'http://localhost:5173' : 'https://www.glperu.com');
const AdminPanel = lazy(() => import('./components/admin/AdminPanel'));
const Fase2Implementacion = lazy(() => import('./pages/Fase2Implementacion'));
// Link de invitaci��n (`<ERP_URL>/activar?token=�?�`): pǧblica, sin sesi��n.
const ActivarPage = lazy(() => import('./pages/ActivarPage'));

/**
 * Raíz del ERP.
 *
 * PÁBLICA: aquí NO se exige sesión. El login sólo lo piden las rutas del
 * panel (`/admin/*`, `/change-password`) vía ProtectedRoute. Sin sesión se
 * muestra la tarjeta de acceso; el equipo entra desde ella y los clientes
 * siguen destinados al sitio principal.
 *
 * Este repositorio solo contiene el panel interno: el sitio público
 * (Home, Shop, ProductPage, ...) vive en el repo del sitio. Al unir ambos
 * repositorios, el App.jsx del sitio público pasa a controlar "/" y esta
 * pieza deja de existir sin que cambie ninguna otra ruta.
 */
function RootPortal() {
  const { user, loading } = useAuth();
  const ability = useAbility();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Destino pedido en la URL (?next=). Sin destino válido, el hub del panel.
  const destino = destinoPostLogin(searchParams.get('next'));
  const esCliente = Boolean(user && tieneRol(['CLIENTE'], rolesDe(user)));

  useEffect(() => {
    if (esCliente) {
      window.location.replace(`${SITE_URL.replace(/\/+$/, '')}${destino === '/admin' ? '/' : destino}`);
    }
  }, [esCliente, destino]);

  if (loading) return <PageLoader />;
  if (user?.mustChangePassword) return <Navigate to={cambiarPasswordConNext(destino)} replace />;
  // Multi-rol: con cualquier rol efectivo de equipo que el servidor dé por
  // visible (algún `menu:*:read`) se entra al panel. Sin ninguna sección
  // visible no se redirige, para no entrar en bucle con el guard de /admin.
  if (user && !tieneRol(['CLIENTE'], rolesDe(user)) && puedeEntrarAlPanel(ability)) {
    return <Navigate to={destino} replace />;
  }

  if (esCliente) return <PageLoader />;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <SEOHead
        title="GreenLine ERP"
        description="Panel interno de administracion de Green Line."
        url="/"
      />
      <div className="w-full max-w-sm bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
        <h1 className="text-xl font-bold text-gray-900">GreenLine ERP</h1>
        <p className="text-sm text-gray-500 mt-2">
          Panel interno de administración de Green Line. Accede con tu cuenta de equipo.
        </p>
        {!esCliente && (
          <div className="mt-5">
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="mt-2 w-full px-4 py-2 bg-brand text-white text-sm font-semibold rounded-lg hover:bg-brand-dark transition-colors"
            >
              Iniciar sesión
            </button>
          </div>
        )}
        <a
          href={SITE_URL}
          className="block mt-3 text-sm text-gray-500 hover:text-gray-700"
        >
          Ir a la tienda
        </a>
      </div>
    </div>
  );
}

/**
 * Publica la ability CASL de la sesión (`useAuth().ability`, montada con los
 * permisos que devuelve el backend) para que `useAbility()`/`<Can>` estén
 * disponibles en todo el árbol.
 */
function Abilities({ children }) {
  const { ability } = useAuth();
  return <AbilityProvider value={ability}>{children}</AbilityProvider>;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Abilities>
          {/* §9: el estado de desbloqueo de la bóveda es independiente de la
              sesión; vive en memoria y muere con el árbol. */}
          <VaultProvider>
            <Routes>
              <Route path="/" element={<RootPortal />} />
              <Route path="/login" element={<LoginPage />} />
              {/* El cambio de contraseña exige sesión (lo arrastra el login
                  cuando la contraseña es temporal). Sin ella se vuelve al
                  login, que devuelve al destino que viniera en ?next=. */}
              <Route
                path="/change-password"
                element={
                  <ProtectedRoute>
                    <ChangePasswordPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/activar"
                element={
                  <Suspense fallback={<PageLoader />}>
                    <ActivarPage />
                  </Suspense>
                }
              />
              {/* Excepción documentada: vista heredada que sigue resolviéndose
                  por rol (ADMIN_ROLES), no por permisos. */}
              <Route
                path="/fase-2-implementacion"
                element={
                  <ProtectedRoute requiredRoles={ADMIN_ROLES}>
                    <Suspense fallback={<PageLoader />}>
                      <Fase2Implementacion />
                    </Suspense>
                  </ProtectedRoute>
                }
              />
              {/* Guard por PERMISOS: el servidor decide qué secciones ve cada
                  sesión; no hay lista de roles que mantener en el cliente.
                  NOTA: no hay ruta separada para /admin/dashboard-embed: esas
                  URLs las resuelve AdminPanel (con sidebar) vía getInitialView,
                  que distingue Dashboard y Servicio Técnico por el ?slug=. */}
              <Route
                path="/admin/*"
                element={
                  <ProtectedRoute guardia={puedeEntrarAlPanel}>
                    <Suspense fallback={<PageLoader />}>
                      <AdminPanel />
                    </Suspense>
                  </ProtectedRoute>
                }
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </VaultProvider>
        </Abilities>
      </AuthProvider>
    </BrowserRouter>
  );
}
