import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useVault } from '../contexts/VaultContext';
import { authAPI } from '../lib/api';
import { PasswordSchema } from '../lib/password';
import PasswordStrength from '../components/auth/PasswordStrength';
import { linkSupabase, refreshSupabaseSession } from '../lib/supabaseLink';
import { reenvolverTodasLasClavesPropias } from '../lib/vault/api';
import { destinoPostLogin } from '../lib/nextRoute';
import { Lock, AlertCircle, Loader2 } from '../lib/icons';

export default function ChangePasswordPage() {
  const { user, accessToken, saveSession } = useAuth();
  const { obtenerCliente } = useVault();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // A dónde seguir tras cambiar la clave: lo arrastra el login (?next=) para
  // no perder la vista de la que venía el usuario.
  const destino = destinoPostLogin(searchParams.get('next'));
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [loading, setLoading] = useState(false);

  const fuerte = PasswordSchema.safeParse(newPassword).success;

  const submit = async (event) => {
    event.preventDefault();
    if (newPassword !== confirmation) {
      setError('Las contraseñas nuevas no coinciden');
      return;
    }

    const chequeo = PasswordSchema.safeParse(newPassword);
    if (!chequeo.success) {
      setError(chequeo.error.issues[0]?.message || 'La contraseña no es segura');
      return;
    }
    setLoading(true);
    setError('');

    // Vincular Supabase ANTES de tocar la bóveda: en el flujo de cambio
    // forzado (mustChangePassword) el LoginPage omite linkSupabase, así
    // que las queries de bóveda correrían con el rol `anon` — que la
    // migración revoca por completo (42501 "permission denied for table
    // greenline_vaults"). Con la contraseña actual (que el usuario ya
    // escribió) se crea la sesión y todo pasa como `authenticated`.
    try {
      await linkSupabase(user.email, currentPassword, accessToken);
    } catch (err) {
      setLoading(false);
      setError(`No se pudo validar la sesión de la bóveda: ${err?.message || 'error de conexión'}`);
      return;
    }

    // §11 — reenvuelve TODAS las envolturas propias (todas las bóvedas) y el
    // par asimétrico con la contraseña nueva ANTES de que el backend la
    // acepte (save-first): si el re-envoltorio falla, NADA ha cambiado
    // todavía; si el backend falla después, se revierte todo.
    let reenvuelto = null;
    try {
      reenvuelto = await reenvolverTodasLasClavesPropias({
        passwordActual: currentPassword,
        passwordNueva: newPassword,
        cliente: obtenerCliente(),
      });
    } catch (err) {
      if (/JWT issued at future/i.test(err?.message || '')) {
        try {
          await refreshSupabaseSession();
          await new Promise((resolve) => setTimeout(resolve, 5000));
          reenvuelto = await reenvolverTodasLasClavesPropias({
            passwordActual: currentPassword,
            passwordNueva: newPassword,
            cliente: obtenerCliente(),
          });
        } catch (retryError) {
          setLoading(false);
          setError(
            `Supabase rechazó temporalmente la sesión de la bóveda. Reintenta en unos segundos: ${retryError?.message || 'error de conexión'}`,
          );
          return;
        }
      } else {
        // Nada abierto con la contraseña actual (incorrecta o daño previo):
        // no se escribe nada y el cambio de contraseña no continúa.
        setLoading(false);
        setError(err?.message || 'No se pudieron re-envolver las claves de la bóveda.');
        return;
      }
    }

    try {
      await authAPI.changePassword(currentPassword, newPassword, accessToken);
    } catch (err) {
      // El backend no aceptó el cambio: se revierte el re-envoltorio (se
      // vuelve a envolver con las contraseñas invertidas) para que las
      // filas sigan cuadrando con la contraseña que sigue vigente.
      if (reenvuelto && (reenvuelto.guardadas > 0 || reenvuelto.par)) {
        try {
          await reenvolverTodasLasClavesPropias({
            passwordActual: newPassword,
            passwordNueva: currentPassword,
            cliente: obtenerCliente(),
          });
        } catch { /* el error real es el del backend */ }
      }
      const detalle = Array.isArray(err?.details?.body) ? err.details.body[0] : null;
      setError(detalle || err?.error || err?.message || 'No se pudo cambiar la contraseña');
      setLoading(false);
      return;
    }

    // La contraseña ya cambió: nada de lo siguiente debe impedir el paso al
    // panel. Si el vínculo con Supabase falla, se reintenta en el próximo
    // login (AdminPanel ofrece reintentar) y no se bloquea la navegación.
    try {
      await linkSupabase(user.email, newPassword, accessToken);
    } catch { /* best-effort */ }

    await saveSession(
      { accessToken, refreshToken: null },
      { ...user, mustChangePassword: false },
    );
    setLoading(false);

    // Alguna clave no abrió con la contraseña actual (daño histórico): el
    // cambio ya está hecho, pero el usuario debe enterarse ANTES de seguir.
    if (reenvuelto?.fallidas?.length) {
      const hechas = [];
      if (reenvuelto.guardadas > 0) hechas.push(`${reenvuelto.guardadas} bóveda(s)`);
      if (reenvuelto.par) hechas.push('el par asimétrico');
      const listo = hechas.length
        ? `Se re-envolvió ${hechas.join(' y ')}`
        : 'No había claves propias que re-envolver';
      setAviso(
        `${listo}, pero ${reenvuelto.fallidas.length} clave(s) NO abrieron con la contraseña actual ` +
          'y quedaron sin actualizar. Si alguna bóveda no desbloquea, pide reparación antes de seguir.',
      );
      return;
    }
    navigate(destino, { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm bg-white rounded-xl shadow-sm border border-gray-100 p-8">
        <div className="text-center mb-6">
          <div className="w-12 h-12 bg-brand rounded-xl flex items-center justify-center mx-auto mb-3">
            <Lock className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">Cambia tu contraseña</h1>
          <p className="text-sm text-gray-500 mt-1">
            Por seguridad, debes reemplazar la contraseña temporal antes de continuar.
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Si usas la bóveda segura, su clave se re-envuelve con la contraseña nueva en tu
            navegador — después desbloquearás con ella.
          </p>
        </div>
        {error && (
          <div className="flex items-center gap-2 bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg mb-4">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}
        {aviso && (
          <div className="flex items-start gap-2 bg-amber-50 text-amber-800 text-sm px-4 py-3 rounded-lg mb-4">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            {aviso}
          </div>
        )}
        {aviso ? (
          <button
            type="button"
            onClick={() => navigate(destino, { replace: true })}
            className="w-full py-2.5 bg-brand text-white font-semibold rounded-lg"
          >
            Continuar
          </button>
        ) : (
        <form onSubmit={submit} className="space-y-4">
          <input
            type="password"
            required
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm"
            placeholder="Contraseña temporal"
          />
          <input
            type="password"
            required
            minLength={12}
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm"
            placeholder="Nueva contraseña"
          />

          <input
            type="password"
            required
            minLength={12}
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm"
            placeholder="Repite la nueva contraseña"
          />

          <PasswordStrength value={newPassword} />
          <button
            type="submit"
            disabled={loading || !fuerte}
            className="w-full py-2.5 bg-brand text-white font-semibold rounded-lg disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Guardar contraseña'}
          </button>
        </form>
        )}
      </div>
    </div>
  );
}
