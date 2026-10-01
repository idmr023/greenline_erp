import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Loader2 } from '../lib/icons';
import { rolesDe, tieneRol } from '../lib/roles';

// Los roles viven en lib/roles.js (fuente única): aquí sólo se decide si la
// sesión y el rol permiten seguir. Ver lib/roles.js para el mapa completo.
export default function ProtectedRoute({ children, requiredRoles = null }) {
  const { user, loading } = useAuth();
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

  return children;
}

