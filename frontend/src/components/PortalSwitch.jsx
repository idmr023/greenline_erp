import { ExternalLink } from '../lib/icons';
import { rolesDe, tieneRol } from '../lib/roles';

const SITE_URL = import.meta.env.VITE_SITE_URL || 'https://www.glperu.com';

export default function PortalSwitch({ user, className = '', compact = false }) {
  const esCliente = tieneRol(['CLIENTE'], rolesDe(user));
  const label = esCliente ? 'Volver a la Tienda' : 'Vista Cliente';

  return (
    <a
      href={`${SITE_URL}/`}
      aria-label={label}
      title={compact ? label : undefined}
      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-brand hover:bg-brand/10 transition-colors ${className}`}
    >
      <ExternalLink className="w-4 h-4" />
      <span className={compact ? 'md:hidden' : ''}>{label}</span>
    </a>
  );
}
