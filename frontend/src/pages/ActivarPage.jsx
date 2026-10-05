import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { authAPI } from '../lib/api';
import { PasswordSchema } from '../lib/password';
import PasswordStrength from '../components/auth/PasswordStrength';
import TwoFactorSetup from '../components/auth/TwoFactorSetup';
import SEOHead from '../components/SEOHead';
import { Lock, CheckCircle2, AlertCircle, Loader2 } from '../lib/icons';

/**
 * Activación de cuenta desde el link de invitación (`/activar?token=…`):
 *  1. validar el link (sin gastarlo);
 *  2. fijar la contraseña personal;
 *  3. montar el 2FA con el onboardingToken que devuelve el paso 2.
 *
 * No hay "más tarde": las invitaciones son sólo para roles del panel y el
 * login no deja entrar a un staff sin 2FA activo.
 */
export default function ActivarPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') || '';

  const [fase, setFase] = useState(() => (token ? 'cargando' : 'invalida'));
  const [datos, setDatos] = useState(null);
  const [password, setPassword] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [onboardingToken, setOnboardingToken] = useState('');
  const [avisoDatos, setAvisoDatos] = useState('');
  const verificado = useRef(false);

  useEffect(() => {
    // <StrictMode> dobla el efecto en desarrollo: el link sólo se consulta 1 vez.
    if (verificado.current) return;
    verificado.current = true;
    if (!token) return;
    (async () => {
      try {
        const res = await authAPI.inviteGet(token);
        if (!res?.valido) {
          setFase('invalida');
          return;
        }
        setDatos(res);
        setFase('password');
      } catch {
        setFase('invalida');
      }
    })();
  }, [token]);

  useEffect(() => {
    if (fase !== 'listo') return undefined;
    const t = setTimeout(() => navigate('/login', { replace: true }), 3500);
    return () => clearTimeout(t);
  }, [fase, navigate]);

  const submitPassword = async (e) => {
    e.preventDefault();

    if (password !== confirmacion) {
      setError('Las contraseñas no coinciden');
      return;
    }
    const chequeo = PasswordSchema.safeParse(password);
    if (!chequeo.success) {
      setError(chequeo.error.issues[0]?.message || 'La contraseña no es segura');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const res = await authAPI.inviteAccept(token, password);
      if (res?.success === false) {
        setError(res.error || 'No se pudo activar la cuenta');
        return;
      }
      setOnboardingToken(res.onboardingToken);
      if (res.supabaseOk === false) {
        setAvisoDatos(
          'La cuenta de acceso de datos no se pudo crear ahora. Podrás reintentarlo desde el panel.',
        );
      }
      setFase('setup');
    } catch (err) {
      setError(err.error || err.message || 'No se pudo activar la cuenta');
    } finally {
      setLoading(false);
    }
  };

  if (fase === 'cargando') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <SEOHead title="Activar cuenta" description="Activa tu cuenta de GreenLine." url="/activar" />
        <Loader2 className="w-6 h-6 text-brand animate-spin" />
      </div>
    );
  }

  if (fase === 'invalida') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <SEOHead title="Activar cuenta" description="Activa tu cuenta de GreenLine." url="/activar" />
        <div className="w-full max-w-sm bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
          <div className="w-12 h-12 bg-red-50 rounded-xl flex items-center justify-center mx-auto mb-3">
            <AlertCircle className="w-6 h-6 text-red-600" />
          </div>
          <h1 className="text-lg font-bold text-gray-900">Enlace no válido</h1>
          <p className="text-sm text-gray-500 mt-2">
            La invitación ya se usó, expiró o el enlace está incompleto.
            Pide un enlace nuevo al administrador.
          </p>
          <button
            type="button"
            onClick={() => navigate('/login', { replace: true })}
            className="mt-5 w-full py-2.5 bg-brand text-white font-semibold rounded-lg hover:bg-brand-dark transition-colors"
          >
            Ir a iniciar sesión
          </button>
        </div>
      </div>
    );
  }

  if (fase === 'setup') {
    return (
      <TwoFactorSetup
        token={onboardingToken}
        setup={authAPI.onboardingSetup2FA}
        confirm={authAPI.onboardingConfirm2FA}
        onSuccess={() => setFase('listo')}
        onBack={() => navigate('/login', { replace: true })}
      />
    );
  }

  if (fase === 'listo') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <SEOHead title="Cuenta activada" description="Tu cuenta de GreenLine ya está activa." url="/activar" />
        <div className="w-full max-w-sm bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
          <div className="w-12 h-12 bg-green-50 rounded-xl flex items-center justify-center mx-auto mb-3">
            <CheckCircle2 className="w-6 h-6 text-green-600" />
          </div>
          <h1 className="text-lg font-bold text-gray-900">Cuenta lista</h1>
          <p className="text-sm text-gray-500 mt-2">
            Ya puedes iniciar sesión con tu contraseña y el código de tu
            aplicación de autenticación.
          </p>
          <button
            type="button"
            onClick={() => navigate('/login', { replace: true })}
            className="mt-5 w-full py-2.5 bg-brand text-white font-semibold rounded-lg hover:bg-brand-dark transition-colors"
          >
            Ir a iniciar sesión
          </button>
          <p className="text-xs text-gray-400 mt-3">Te llevamos al login en unos segundos…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <SEOHead title="Activar cuenta" description="Crea tu contraseña para acceder a GreenLine." url="/activar" />
      <div className="w-full max-w-sm bg-white rounded-xl shadow-sm border border-gray-100 p-8">
        <div className="text-center mb-6">
          <div className="w-12 h-12 bg-brand rounded-xl flex items-center justify-center mx-auto mb-3">
            <Lock className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">Activa tu cuenta</h1>
          <p className="text-sm text-gray-500 mt-1">
            Estás activando el acceso de
            <br />
            <span className="font-medium text-gray-700">{datos?.email}</span>
          </p>
        </div>

        {error && (
          <div className="flex items-center gap-2 bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg mb-4">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {avisoDatos && (
          <div className="flex items-center gap-2 bg-amber-50 text-amber-800 text-sm px-4 py-3 rounded-lg mb-4">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {avisoDatos}
          </div>
        )}

        <form onSubmit={submitPassword} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="password"
                required
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
                placeholder="••••••••"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Repite la contraseña</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="password"
                required
                autoComplete="new-password"
                value={confirmacion}
                onChange={(e) => setConfirmacion(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
                placeholder="••••••••"
              />
            </div>
            <PasswordStrength value={password} />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-brand text-white font-semibold rounded-lg hover:bg-brand-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading ? 'Activando…' : 'Continuar'}
          </button>
        </form>
      </div>
    </div>
  );
}
