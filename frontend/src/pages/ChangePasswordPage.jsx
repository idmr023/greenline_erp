import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { authAPI } from '../lib/api';
import { PasswordSchema } from '../lib/password';
import PasswordStrength from '../components/auth/PasswordStrength';
import { linkSupabase } from '../lib/supabaseLink';
import { Lock, AlertCircle, Loader2 } from '../lib/icons';

export default function ChangePasswordPage() {
  const { user, accessToken, saveSession } = useAuth();
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
    try {
      await authAPI.changePassword(currentPassword, newPassword, accessToken);
    } catch (err) {
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
