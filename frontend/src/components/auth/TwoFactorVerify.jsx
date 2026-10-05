import { useState, useRef, useEffect } from 'react';
import { authAPI } from '../../lib/api';
import EmailFactorVerify from './EmailFactorVerify';
import { ShieldCheck, ArrowLeft, AlertCircle, Loader2, Mail, Lock } from '../../lib/icons';

/**
 * Segundo factor del login. Tres vías sobre el MISMO tempToken:
 *  - `totp`:   el código de la app de autenticación (por defecto).
 *  - `email`:  código de 6 dígitos enviado al correo; se envía SOLO al entrar
 *              en la pestaña (twoFALimiter: 5 peticiones / 5 minutos, cuota
 *              compartida con setup, confirm y respaldo).
 *  - `backup`: uno de los 8 códigos generados al activar (un solo uso).
 */
export default function TwoFactorVerify({ tempToken, onVerified, onBack }) {
  const [modo, setModo] = useState('totp');
  const [emailMasked, setEmailMasked] = useState('');
  const [aviso, setAviso] = useState('');
  const [error, setError] = useState('');
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [respaldo, setRespald] = useState('');
  const [verificando, setVerificando] = useState(false);
  const inputs = useRef([]);
  const correoEnviado = useRef(false);

  // Envío automático al entrar en la pestaña del correo (sólo una vez por
  // reto: el ref sobrevive al doble montaje de <StrictMode>).
  useEffect(() => {
    if (modo !== 'email' || correoEnviado.current) return;
    correoEnviado.current = true;
    (async () => {
      try {
        const res = await authAPI.send2FAEmail(tempToken);
        setEmailMasked(res.emailMasked || '');
        setAviso(res.message || 'Código enviado');
      } catch (err) {
        setError(err.error || err.message || 'No se pudo enviar el código al correo');
      }
    })();
  }, [modo, tempToken]);

  const cambiarModo = (siguiente) => {
    setModo(siguiente);
    setError('');
  };

  const reenviarCorreo = async () => {
    const res = await authAPI.send2FAEmail(tempToken);
    setEmailMasked(res.emailMasked || '');
    setAviso(res.message || 'Código reenviado');
    setError('');
  };

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

  const handleTotp = async (e) => {
    e.preventDefault();
    const joined = code.join('');
    if (joined.length !== 6) {
      setError('Ingresa los 6 dígitos');
      return;
    }

    setVerificando(true);
    setError('');
    try {
      const res = await authAPI.verify2FA(tempToken, joined);
      if (res?.success === false) {
        setError(res.error || 'Código inválido');
        return;
      }
      onVerified({ accessToken: res.accessToken, refreshToken: res.refreshToken }, res.user);
    } catch (err) {
      setError(err.error || err.message || 'Código inválido');
    } finally {
      setVerificando(false);
    }
  };

  const handleRespaldo = async (e) => {
    e.preventDefault();
    const codigo = respaldo.trim();
    if (!codigo) {
      setError('Ingresa un código de respaldo');
      return;
    }

    setVerificando(true);
    setError('');
    try {
      const res = await authAPI.verify2FABackup(tempToken, codigo);
      if (res?.success === false) {
        setError(res.error || 'Código de respaldo inválido');
        return;
      }
      onVerified({ accessToken: res.accessToken, refreshToken: res.refreshToken }, res.user);
    } catch (err) {
      setError(err.error || err.message || 'Código de respaldo inválido');
    } finally {
      setVerificando(false);
    }
  };

  const bloqueError = error && (
    <div className="flex items-center gap-2 bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg mb-4">
      <AlertCircle className="w-4 h-4 shrink-0" />
      {error}
    </div>
  );

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

          {modo === 'email' ? (
            <EmailFactorVerify
              tempToken={tempToken}
              emailMasked={emailMasked}
              aviso={aviso}
              errorExterno={error}
              onVerified={onVerified}
              onResend={reenviarCorreo}
              onBack={() => cambiarModo('totp')}
            />
          ) : modo === 'backup' ? (
            <div className="space-y-4">
              <div className="text-center mb-6">
                <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center mx-auto mb-3">
                  <Lock className="w-6 h-6 text-blue-600" />
                </div>
                <h2 className="text-lg font-bold text-gray-900">Código de respaldo</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Introduce uno de los 8 códigos que guardaste al activar.
                  <br />
                  <span className="font-medium text-gray-700">Cada código sirve una sola vez.</span>
                </p>
              </div>

              {bloqueError}

              <form onSubmit={handleRespaldo} className="space-y-4">
                <input
                  type="text"
                  value={respaldo}
                  onChange={(e) => setRespald(e.target.value.toUpperCase())}
                  placeholder="ABC-123"
                  autoComplete="one-time-code"
                  aria-label="Código de respaldo"
                  className="w-full text-center text-lg font-mono tracking-widest border border-gray-200 rounded-lg py-3 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
                />

                <button
                  type="submit"
                  disabled={verificando || !respaldo.trim()}
                  className="w-full py-2.5 bg-brand text-white font-semibold rounded-lg hover:bg-brand-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {verificando && <Loader2 className="w-4 h-4 animate-spin" />}
                  {verificando ? 'Verificando...' : 'Entrar'}
                </button>
              </form>

              <button
                type="button"
                onClick={() => cambiarModo('totp')}
                className="w-full text-sm text-gray-500 hover:text-gray-700"
              >
                Usar el código de la app
              </button>
            </div>
          ) : (
            <div className="space-y-4">
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

              {bloqueError}

              <form onSubmit={handleTotp} className="space-y-4">
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
                  disabled={verificando || code.some((d) => !d)}
                  className="w-full py-2.5 bg-brand text-white font-semibold rounded-lg hover:bg-brand-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {verificando && <Loader2 className="w-4 h-4 animate-spin" />}
                  {verificando ? 'Verificando...' : 'Verificar código'}
                </button>
              </form>

              <div className="flex items-center justify-between text-sm pt-1">
                <button
                  type="button"
                  onClick={() => cambiarModo('email')}
                  className="flex items-center gap-1 text-brand hover:underline"
                >
                  <Mail className="w-3 h-3" /> Enviar código por correo
                </button>
                <button
                  type="button"
                  onClick={() => cambiarModo('backup')}
                  className="flex items-center gap-1 text-gray-500 hover:text-gray-700"
                >
                  <Lock className="w-3 h-3" /> Usar respaldo
                </button>
              </div>
            </div>
          )}
        </div>

        {modo === 'totp' && (
          <p className="text-center text-xs text-gray-400 mt-4">
            Abre tu app de autenticación (Google Authenticator, Authy, etc.)
          </p>
        )}
      </div>
    </div>
  );
}
