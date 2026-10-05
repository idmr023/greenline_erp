import { useState, useRef, useEffect } from 'react';
import { ShieldCheck, ArrowLeft, AlertCircle, Loader2, Copy, Check } from '../../lib/icons';

/**
 * Activación del 2FA: QR + código secreto manual + códigos de respaldo, y
 * confirmación con el primer TOTP.
 *
 * Se usa en dos flujos con la MISMA pantalla:
 *  - Login (tempToken, purpose '2fa_setup'): al confirmar el backend entrega
 *    la sesión en el acto, porque la contraseña ya se verificó en el paso 1.
 *  - /activar (onboardingToken, purpose 'onboarding'): al confirmar sólo se
 *    activa la cuenta; la página decide el siguiente paso.
 * Por eso `setup` y `confirm` se inyectan como props.
 */
export default function TwoFactorSetup({ token, setup, confirm, onSuccess, onBack }) {
  const [datos, setDatos] = useState(null);
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [cargando, setCargando] = useState(true);
  const [verificando, setVerificando] = useState(false);
  const [error, setError] = useState('');
  const [copiado, setCopiado] = useState('');
  const inputs = useRef([]);
  const setupPedido = useRef(false);

  useEffect(() => {
    // <StrictMode> ejecuta el efecto dos veces en desarrollo: el ref evita
    // pedir el QR dos veces (cada llamada regenera el secreto).
    if (setupPedido.current) return;
    setupPedido.current = true;
    (async () => {
      try {
        const res = await setup(token);
        setDatos(res);
      } catch (err) {
        setError(err.error || err.message || 'No se pudo preparar la activación');
      } finally {
        setCargando(false);
      }
    })();
  }, [token, setup]);

  const copiar = async (texto, clave) => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(clave);
      setTimeout(() => setCopiado((actual) => (actual === clave ? '' : actual)), 2500);
    } catch {
      setError('No se pudo copiar al portapapeles');
    }
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    const joined = code.join('');
    if (joined.length !== 6) {
      setError('Ingresa los 6 dígitos');
      return;
    }

    setVerificando(true);
    setError('');
    try {
      const res = await confirm(token, joined);
      if (res?.success === false) {
        setError(res?.error || 'Código inválido');
        return;
      }
      onSuccess(res);
    } catch (err) {
      setError(err.error || err.message || 'Código inválido');
    } finally {
      setVerificando(false);
    }
  };

  const respaldos = datos?.backupCodes || [];
  const listaRespaldos = respaldos.join('\n');

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-8">
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
            <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center mx-auto mb-3">
              <ShieldCheck className="w-6 h-6 text-blue-600" />
            </div>
            <h2 className="text-lg font-bold text-gray-900">Activa la verificación en dos pasos</h2>
            <p className="text-sm text-gray-500 mt-1">
              Escanea este código con tu app de autenticación
              <br />
              <span className="font-medium text-gray-700">Google Authenticator, Authy, 1Password…</span>
            </p>
          </div>

          {error && (
            <div className="flex items-center gap-2 bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg mb-4">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          {cargando && (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin" /> Preparando la activación…
            </div>
          )}

          {!cargando && datos && (
            <div className="space-y-5">
              <div className="flex justify-center">
                <img
                  src={datos.qrDataUrl}
                  alt="Código QR para activar la verificación en dos pasos"
                  className="w-44 h-44 rounded-lg border border-gray-100"
                />
              </div>

              <div>
                <p className="text-xs text-gray-500 mb-1 text-center">
                  ¿No puedes escanearlo? Introduce la clave manualmente:
                </p>
                <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                  <code className="flex-1 text-center text-sm font-mono break-all text-gray-800">
                    {datos.secret}
                  </code>
                  <button
                    type="button"
                    onClick={() => copiar(datos.secret, 'sec')}
                    className="shrink-0 text-gray-400 hover:text-brand"
                    aria-label="Copiar clave manual"
                  >
                    {copiado === 'sec' ? (
                      <Check className="w-4 h-4 text-green-600" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-100 rounded-lg p-3">
                <p className="text-xs text-amber-800 mb-2">
                  <strong>Códigos de respaldo:</strong> guárdalos en un lugar seguro.
                  Se muestran <strong>sólo una vez</strong> y cada uno sirve una sola vez.
                </p>
                <ul className="grid grid-cols-2 gap-1 text-center">
                  {respaldos.map((c) => (
                    <li
                      key={c}
                      className="bg-white border border-amber-100 rounded py-1 text-xs font-mono text-gray-800"
                    >
                      {c}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => copiar(listaRespaldos, 'all')}
                  className="mt-2 w-full text-xs text-amber-800 hover:underline flex items-center justify-center gap-1"
                >
                  {copiado === 'all' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copiado === 'all' ? 'Copiados' : 'Copiar los 8 códigos'}
                </button>
              </div>

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
                  disabled={verificando || code.some((d) => !d)}
                  className="w-full py-2.5 bg-brand text-white font-semibold rounded-lg hover:bg-brand-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {verificando && <Loader2 className="w-4 h-4 animate-spin" />}
                  {verificando ? 'Activando…' : 'Activar y continuar'}
                </button>
              </form>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-gray-400 mt-4">
          Abre la app de autenticación y comprueba los 6 dígitos antes de continuar
        </p>
      </div>
    </div>
  );
}
