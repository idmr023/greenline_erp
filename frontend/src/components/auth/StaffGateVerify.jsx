import { useState } from 'react';
import { authAPI } from '../../lib/api';
import { Lock, ArrowLeft, AlertCircle, Loader2 } from '../../lib/icons';

export default function StaffGateVerify({ tempToken, onVerified, onRequires2FA, onBack }) {
  const [gate, setGate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    const code = gate.trim();
    if (!code) {
      setError('Ingresa el código de acceso');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const res = await authAPI.verifyGate(tempToken, code);
      if (!res.success) {
        setError(res.error || 'Código de acceso incorrecto');
        return;
      }
      if (res.requires2FA) {
        onRequires2FA(res.tempToken);
        return;
      }
      onVerified({ accessToken: res.accessToken, refreshToken: res.refreshToken }, res.user);
    } catch (err) {
      setError(err.error || 'Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6"
          >
            <ArrowLeft className="w-4 h-4" /> Volver
          </button>

          <div className="text-center mb-6">
            <div className="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center mx-auto mb-3">
              <Lock className="w-6 h-6 text-amber-600" />
            </div>
            <h2 className="text-lg font-bold text-gray-900">Código de acceso staff</h2>
            <p className="text-sm text-gray-500 mt-1">
              Ingresa el código de acceso compartido del equipo
            </p>
          </div>

          {error && (
            <div className="flex items-center gap-2 bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg mb-4">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="staff-gate" className="block text-sm font-medium text-gray-700 mb-1">
                Código de acceso
              </label>
              <input
                id="staff-gate"
                type="password"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                value={gate}
                onChange={(e) => setGate(e.target.value.replace(/\D/g, '').slice(0, 12))}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm text-center tracking-[0.3em] font-semibold focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
                placeholder="••••••"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !gate.trim()}
              className="w-full py-2.5 bg-brand text-white font-semibold rounded-lg hover:bg-brand-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? 'Verificando...' : 'Continuar'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
