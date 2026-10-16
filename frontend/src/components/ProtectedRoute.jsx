import { Navigate, useLocation } from 'react-router-dom';
import { useAbility } from '@casl/react';
import { useAuth } from '../contexts/AuthContext';
import { Loader2 } from '../lib/icons';
import { rolesDe, tieneRol } from '../lib/roles';

/**
 * Guard de sesión + autorización del panel.
 *
 *   requiredRoles → lista de roles permitidos (multi-rol: basta con uno).
 *   guardia       → predicado `(ability) => boolean` basado en PERMISOS.
 *
 * `/admin` usa `guardia={puedeEntrarAlPanel}` para no tener que mantener una
 * lista de roles a mano; `/fase-2-implementacion` conserva `requiredRoles`
 * porque es una vista heredada cuyo acceso se decide por rol (excepción
 * documentada en App.jsx).
 */
export default function ProtectedRoute({ children, requiredRoles = null, guardia = null }) {
  const { user, loading } = useAuth();
  const ability = useAbility();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-6 h-6 text-brand animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Multi-rol: basta con que ALGUNO de los roles efectivos esté permitido.
  if (requiredRoles && !tieneRol(requiredRoles, rolesDe(user))) {
    return <Navigate to="/" replace />;
  }

  if (guardia && !guardia(ability)) {
    return <Navigate to="/" replace />;
  }

  return children;
}
