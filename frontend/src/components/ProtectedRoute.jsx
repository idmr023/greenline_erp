import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Loader2 } from '../lib/icons';

const STAFF_ROLES = [
  'ADMIN', 'EDITORA_BLOG', 'DISTRIBUCION', 'GERENTE_TIENDA',
  'COLABORADOR_TIENDA', 'GERENTE_ALMACEN', 'COLABORADOR_ALMACEN', 'DESARROLLADOR_WEB',
];

const ADMIN_ROLES = ['ADMIN', 'DESARROLLADOR_WEB', 'EDITORA_BLOG', 'DISTRIBUCION'];

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

  if (requiredRoles && !requiredRoles.includes(user.rol)) {
    return <Navigate to="/" replace />;
  }

  return children;
}

export { STAFF_ROLES, ADMIN_ROLES };
