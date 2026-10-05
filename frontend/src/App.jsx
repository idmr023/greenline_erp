import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { AbilityProvider } from '@casl/react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { VaultProvider } from './contexts/VaultContext';
import ProtectedRoute from './components/ProtectedRoute';
import { ADMIN_ROLES, PANEL_ROLES, rolesDe, tieneRol } from './lib/roles';
import SEOHead from './components/SEOHead';
import LoginPage from './pages/LoginPage';
import ChangePasswordPage from './pages/ChangePasswordPage';
import PageLoader from './PageLoader';

const AdminPanel = lazy(() => import('./components/admin/AdminPanel'));
const Fase2Implementacion = lazy(() => import('./pages/Fase2Implementacion'));
// Link de invitación (`<ERP_URL>/activar?token=…`): pública, sin sesión.
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
  const navigate = useNavigate();

  if (loading) return <PageLoader />;
  if (user?.mustChangePassword) return <Navigate to="/change-password" replace />;
  // Multi-rol: con cualquier rol efectivo de equipo se entra al panel.
  if (user && !tieneRol(['CLIENTE'], rolesDe(user))) return <Navigate to="/admin" replace />;

  const esCliente = Boolean(user);

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
          {esCliente
            ? 'Este panel es para el equipo interno. Tu cuenta es de cliente: la tienda y tu historial de pedidos estan en el sitio principal.'
            : 'Panel interno de administración de Green Line. Accede con tu cuenta de equipo.'}
        </p>
        {esCliente ? (
          <>
            <a
              href="https://greenlineperu.com"
              className="inline-block mt-5 px-4 py-2 bg-brand text-white text-sm font-semibold rounded-lg hover:bg-brand-dark transition-colors"
            >
              Ir a la tienda
            </a>
            <button
              type="button"
              onClick={() => window.location.assign('/login')}
              className="block w-full mt-2 px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
            >
              Cambiar de cuenta
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="mt-5 w-full px-4 py-2 bg-brand text-white text-sm font-semibold rounded-lg hover:bg-brand-dark transition-colors"
          >
            Iniciar sesión
          </button>
        )}
        <a
          href="https://greenlineperu.com"
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
              <Route path="/change-password" element={<ChangePasswordPage />} />
              <Route
                path="/activar"
                element={
                  <Suspense fallback={<PageLoader />}>
                    <ActivarPage />
                  </Suspense>
                }
              />
              <Route
                path="/admin/*"
                element={
                  <ProtectedRoute requiredRoles={PANEL_ROLES}>
                    <Suspense fallback={<PageLoader />}>
                      <AdminPanel />
                    </Suspense>
                  </ProtectedRoute>
                }
              />
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
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </VaultProvider>
        </Abilities>
      </AuthProvider>
    </BrowserRouter>
  );
}
