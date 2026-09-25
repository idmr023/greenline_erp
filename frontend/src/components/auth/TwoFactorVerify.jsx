import { useState, useRef, useEffect } from 'react';
import { authAPI } from '../../lib/api';
import { ShieldCheck, ArrowLeft, AlertCircle, Loader2 } from '../../lib/icons';

export default function TwoFactorVerify({ tempToken, onVerified, onBack }) {
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputs = useRef([]);

  useEffect(() => { inputs.current[0]?.focus(); }, []);

  const handleChange = (index, value) => {
    if (!/^\d*$/.test(value)) return;
    const next = [...code];
    next[index] = value.slice(-1);
    setCode(next);
    if (value && index < 5) inputs.current[index + 1]?.focus();
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      inputs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted) {
      const next = pasted.split('').concat(Array(6).fill('')).slice(0, 6);
      setCode(next);
      inputs.current[Math.min(pasted.length, 5)]?.focus();
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const joined = code.join('');
    if (joined.length !== 6) { setError('Ingresa los 6 dígitos'); return; }

    setLoading(true);
    setError('');
    try {
      const res = await authAPI.verify2FA(tempToken, joined);
      if (!res.success) { setError(res.error || 'Código inválido'); return; }
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
          <button onClick={onBack} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6">
            <ArrowLeft className="w-4 h-4" /> Volver
          </button>

          <div className="text-center mb-6">
            <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center mx-auto mb-3">
              <ShieldCheck className="w-6 h-6 text-blue-600" />
            </div>
            <h2 className="text-lg font-bold text-gray-900">Autenticación de dos factores</h2>
            <p className="text-sm text-gray-500 mt-1">
              Ingresa el código de 6 dígitos de tu<br />
              <span className="font-medium text-gray-700">aplicación de autenticación</span>
            </p>
          </div>

          {error && (
            <div className="flex items-center gap-2 bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg mb-4">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex justify-center gap-2">
              {code.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => { inputs.current[i] = el; }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleChange(i, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(i, e)}
                  onPaste={handlePaste}
                  className="w-11 h-12 text-center text-lg font-bold border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
                />
              ))}
            </div>

            <button
              type="submit"
              disabled={loading || code.some((d) => !d)}
              className="w-full py-2.5 bg-brand text-white font-semibold rounded-lg hover:bg-brand-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? 'Verificando...' : 'Verificar código'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-400 mt-4">
          Abre tu app de autenticación (Google Authenticator, Authy, etc.)
        </p>
      </div>
    </div>
  );
}
