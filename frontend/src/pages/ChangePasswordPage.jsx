import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useVault } from '../contexts/VaultContext';
import { authAPI } from '../lib/api';
import { PasswordSchema } from '../lib/password';
import PasswordStrength from '../components/auth/PasswordStrength';
import { linkSupabase } from '../lib/supabaseLink';
import { cargarBoveda, guardarClavePropia } from '../lib/vault/api';
import { Lock, AlertCircle, Loader2 } from '../lib/icons';

export default function ChangePasswordPage() {
  const { user, accessToken, saveSession } = useAuth();
  const { obtenerCliente } = useVault();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
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
    } catch {
      // Sin sesión de datos no hay nada que re-envolver; el backend
      // rechazará el cambio más abajo si la contraseña actual es mala.
      // (Si la contraseña actual es correcta pero Supabase no está
      // sincronizado, linkSupabase ya hace el sync y reintenta.)
    }

    // §11 — la bóveda se desbloquea con la contraseña de PANEL, así que al
    // cambiarla hay que re-envolver la DEK con la nueva ANTES de que el
    // backend la acepte (save-first): si el re-envoltorio falla, NADA ha
    // cambiado todavía; si el backend falla después, se revierte la fila.
    let clave = null; // fila propia cargada antes de re-envolver
    let reenvuelta = null; // envoltura bajo la contraseña NUEVA
    let salt = null; // salt de bóveda (no rota con el cambio de panel)
    let parametros = null; // snapshot KDF de la bóveda

    // Leer la bóveda. Si no hay sesión de Supabase (o los permisos no
    // alcanzan), se trata como "sin bóveda": no hay nada que re-envolver y
    // el cambio de contraseña del panel sigue igual.
    let b = null;
    try {
      b = await cargarBoveda();
    } catch (err) {
      const sinSesion = err?.name === 'ErrorRls'
        || /permission denied|row-level security|No hay sesión/i.test(err?.message || '');
      if (!sinSesion) {
        setLoading(false);
        setError(
          `No se pudo leer la bóveda: ${err?.message || 'error de conexión'}`,
        );
        return;
      }
    }

    clave = b?.bovedaId ? b.clavePropia : null;
    if (clave) {
      salt = b.salt;
      parametros = b.parametros;
      let abrir;
      try {
        abrir = await obtenerCliente().reenvolverConPassword({
          passwordActual: currentPassword,
          passwordNueva: newPassword,
          salt,
          parametros,
          envoltura: clave.envoltura,
          contexto: clave.contexto,
        });
      } catch {
        // Abrir con la contraseña vieja falló: o la contraseña actual es
        // incorrecta o la muestra R120 no cuadra — en cualquier caso NO
        // se toca nada (ni servidor ni fila).
        setLoading(false);
        setError('La contraseña actual no es correcta.');
        return;
      }
      reenvuelta = abrir.envoltura;
      try {
        await guardarClavePropia({
          vaultId: clave.contexto.vaultId,
          keyVersion: clave.contexto.keyVersion,
          envoltura: reenvuelta,
        });
      } catch (err) {
        setLoading(false);
        setError(
          `No se pudo guardar la clave re-envuelta de la bóveda: ${err?.message || 'error guardándola'}`,
        );
        return;
      }
    }

    try {
      await authAPI.changePassword(currentPassword, newPassword, accessToken);
    } catch (err) {
      // El backend no aceptó el cambio: la fila ya está bajo la contraseña
      // nueva, así que se revierte para que siga cuadrando con el panel.
      if (clave && reenvuelta) {
        try {
          const { envoltura } = await obtenerCliente().reenvolverConPassword({
            passwordActual: newPassword,
            passwordNueva: currentPassword,
            salt,
            parametros,
            envoltura: reenvuelta,
            contexto: clave.contexto,
          });
          await guardarClavePropia({
            vaultId: clave.contexto.vaultId,
            keyVersion: clave.contexto.keyVersion,
            envoltura,
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
    navigate('/admin', { replace: true });
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
      </div>
    </div>
  );
}
