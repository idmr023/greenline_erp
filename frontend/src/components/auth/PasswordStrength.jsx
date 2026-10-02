import { evaluarPassword } from '../../lib/password';
import { Check, X, Sparkles } from '../../lib/icons';

/**
 * Medidor de fortaleza de contraseña: barra + checklist en vivo.
 * Usa las mismas reglas que PasswordSchema (lib/password.js) — si la
 * checklist está en verde, el formulario puede enviarse.
 */
export default function PasswordStrength({ value }) {
  const { reglas, ok, cumplidas, total } = evaluarPassword(value);
  const pct = value ? Math.round((cumplidas / total) * 100) : 0;
  const barraCls = ok
    ? 'bg-emerald-500'
    : cumplidas >= 3
      ? 'bg-amber-500'
      : 'bg-red-500';
  const etiqueta = ok ? 'Muy segura' : cumplidas >= 3 ? 'Media' : 'Débil';

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3" aria-live="polite">
      <div className="flex items-center gap-2 mb-2">
        <div className="h-1.5 flex-1 rounded-full bg-gray-200 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${barraCls}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span
          className={`text-[11px] font-semibold shrink-0 ${
            ok ? 'text-emerald-600' : cumplidas >= 3 ? 'text-amber-600' : 'text-red-600'
          }`}
        >
          {etiqueta}
        </span>
      </div>

      <ul className="grid grid-cols-1 gap-1">
        {reglas.map((r) => (
          <li
            key={r.id}
            className={`flex items-center gap-1.5 text-[11px] ${
              r.ok ? 'text-emerald-700' : 'text-gray-500'
            }`}
          >
            {r.ok ? (
              <Check className="w-3 h-3 shrink-0" />
            ) : (
              <X className="w-3 h-3 shrink-0 text-gray-400" />
            )}
            {r.etiqueta}
          </li>
        ))}
      </ul>

      <p className="flex items-start gap-1.5 mt-2 text-[11px] text-gray-500 leading-snug">
        <Sparkles className="w-3 h-3 shrink-0 mt-0.5 text-brand" />
        Guárdala en tu gestor de contraseñas (Google te la ofrecerá al guardarla); no la reuses
        en otros sitios.
      </p>
    </div>
  );
}
