import { useState, useRef, useEffect } from 'react';
import { Mail, AlertCircle, Loader2, RefreshCw } from '../../lib/icons';
import { authAPI } from '../../lib/api';

/**
 * Segundo factor por correo: pide el código de 6 dígitos que llegó al email
 * enmascarado. El envío automático lo dispara TwoFactorVerify al entrar en
 * esta pestaña; aquí sólo se reenvía a petición (el límite es de 5 cada
 * 5 minutos y lo comparte con el resto de retos del 2FA).
 */
export default function EmailFactorVerify({ tempToken, emailMasked, aviso, errorExterno, onVerified, onResend, onBack }) {
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [reenviando, setReenviando] = useState(false);
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
    if (joined.length !== 6) {
      setError('Ingresa los 6 dígitos');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const res = await authAPI.verify2FAEmail(tempToken, joined);
      if (res?.success === false) {
        setError(res.error || 'Código inválido');
        return;
      }
      onVerified(res);
    } catch (err) {
      setError(err.error || err.message || 'Código inválido o expirado');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setReenviando(true);
    setError('');
    try {
      await onResend();
    } catch (err) {
      setError(err.error || err.message || 'No se pudo reenviar el código');
    } finally {
      setReenviando(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="text-center mb-6">
        <div className="w-12 h-12 bg-green-50 rounded-xl flex items-center justify-center mx-auto mb-3">
          <Mail className="w-6 h-6 text-green-600" />
        </div>
        <h2 className="text-lg font-bold text-gray-900">Código de verificación</h2>
        <p className="text-sm text-gray-500 mt-1">
          {aviso ? (
            <span>{aviso}</span>
          ) : (
            <>
              Enviamos un código de 6 dígitos a
              {emailMasked && (
                <>
                  <br />
                  <span className="font-medium text-gray-700">{emailMasked}</span>
                </>
              )}
            </>
          )}
        </p>
      </div>

      {(error || errorExterno) && (
        <div className="flex items-center gap-2 bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error || errorExterno}
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
              aria-label={`Dígito ${i + 1} del código`}
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

      <div className="flex items-center justify-between text-sm">
        <button
          type="button"
          onClick={onBack}
          className="text-gray-500 hover:text-gray-700"
        >
          Usar el código de la app
        </button>
        <button
          type="button"
          onClick={handleResend}
          disabled={reenviando}
          className="flex items-center gap-1 text-brand hover:underline disabled:opacity-50"
        >
          {reenviando ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          Reenviar código
        </button>
      </div>

      <p className="text-center text-xs text-gray-400">El código expira en 5 minutos</p>
    </div>
  );
}
