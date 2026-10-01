import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
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

/**
 * Raíz del ERP.
 *
 * Este repositorio solo contiene el panel interno: el sitio público
 * (Home, Shop, ProductPage, ...) vive en el repo del sitio. Al unir ambos
 * repositorios, el App.jsx del sitio público pasa a controlar "/" y esta
 * pieza deja de existir sin que cambie ninguna otra ruta.
 */
function RootPortal() {
  const { user, loading } = useAuth();

  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.mustChangePassword) return <Navigate to="/change-password" replace />;
  // Multi-rol: con cualquier rol efectivo de equipo se entra al panel.
  if (!tieneRol(['CLIENTE'], rolesDe(user))) return <Navigate to="/admin" replace />;

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
          Este panel es para el equipo interno. Tu cuenta es de cliente:
          la tienda y tu historial de pedidos estan en el sitio principal.
        </p>
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
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        {/* §9: el estado de desbloqueo de la bóveda es independiente de la
            sesión; vive en memoria y muere con el árbol. */}
        <VaultProvider>
          <Routes>
            <Route path="/" element={<RootPortal />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/change-password" element={<ChangePasswordPage />} />
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
      </AuthProvider>
    </BrowserRouter>
  );
}
