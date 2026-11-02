import { ExternalLink } from '../lib/icons';
import { rolesDe, tieneRol } from '../lib/roles';

const SITE_URL = import.meta.env.VITE_SITE_URL || 'https://www.glperu.com';

export default function PortalSwitch({ user, className = '' }) {
  const esCliente = tieneRol(['CLIENTE'], rolesDe(user));

  return (
    <a
      href={`${SITE_URL}/`}
      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-brand hover:bg-brand/10 transition-colors ${className}`}
    >
      <ExternalLink className="w-4 h-4" />
      {esCliente ? 'Volver a la Tienda' : 'Vista Cliente'}
    </a>
  );
}
