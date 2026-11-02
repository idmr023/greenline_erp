import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { authAPI } from '../lib/api';
import { linkSupabase } from '../lib/supabaseLink';
import { pantallaPostLogin } from '../lib/nextRoute';
import SEOHead from '../components/SEOHead';
import OTPVerify from '../components/auth/OTPVerify';
import TwoFactorSetup from '../components/auth/TwoFactorSetup';
import TwoFactorVerify from '../components/auth/TwoFactorVerify';
import { Lock, Mail, AlertCircle } from '../lib/icons';
import { rolesDe, tieneRol } from '../lib/roles';
import PageLoader from '../PageLoader';
const SITE_URL = import.meta.env.VITE_SITE_URL
  || (window.location.hostname === 'localhost' ? 'http://localhost:5173' : 'https://www.glperu.com');

function rutaCliente(next) {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return '/';
  return next;
}

export default function LoginPage() {
  useEffect(() => {
    const publicUrl = import.meta.env.VITE_SITE_URL
      || (window.location.hostname === 'localhost' ? 'http://localhost:5173' : 'https://www.glperu.com');
    const next = new URLSearchParams(window.location.search).get('next');
    window.location.replace(`${publicUrl.replace(/\/+$/, '')}/login${next ? `?next=${encodeURIComponent(next)}` : ''}`);
  }, []);

  const { user, loading, saveSession, sesionExpirada } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // A dónde volver tras entrar. Viene en la URL (?next=) y lo pone el guard
  // de las rutas protegidas: al entrar se devuelve al panel exactamente
  // donde estaba el usuario. Si no hay o no es válido, se cae al hub.
  const nextPedido = searchParams.get('next');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loadingForm, setLoadingForm] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState('credentials');
  const [tempToken, setTempToken] = useState('');

  // Marca de "hay un login en curso": evita que el efecto de más abajo
  // (sesión ya activa -> saltar el formulario) se adelante a la
  // navegación que hace `completeLogin`.
  const loginEnCurso = useRef(false);

  const completeLogin = async (tokens, user) => {
    const esCliente = user?.tipo === 'CLIENTE'
      || user?.rol === 'CLIENTE'
      || tieneRol(['CLIENTE'], rolesDe(user));
    // Espera también a los permisos de la sesión: /admin no debe montar con
    // la ability CASL vacía (menú parpadeando o vacío).
    loginEnCurso.current = true;
    try {
      await saveSession(tokens, user);
    } catch (err) {
      // Sin sesión guardada no hay nada que navegar: se sigue en el formulario.
      loginEnCurso.current = false;
      throw err;
    }
    if (!esCliente && !user.mustChangePassword) {
      // La sesión de Supabase se vincula aquí, de forma transparente, usando
      // las mismas credenciales. No se debe mostrar un segundo login en /admin.
      await linkSupabase(email, password, tokens.accessToken);
    }
    if (esCliente) {
      const destinoCliente = rutaCliente(searchParams.get('next'));
      const handoff = new URLSearchParams({
        access: tokens.accessToken,
      });
      if (tokens.refreshToken) handoff.set('refresh', tokens.refreshToken);
      const hash = encodeURIComponent(handoff.toString());
      window.location.assign(
        `${SITE_URL.replace(/\/+$/, '')}${destinoCliente}#gl-session=${hash}`,
      );
      return;
    }
    // El destino se arrastra también al cambio de contraseña forzado: si no,
    // quien entra con contraseña temporal se quedaría siempre en el hub.
    const plan = pantallaPostLogin({
      esCliente,
      mustChangePassword: Boolean(user.mustChangePassword),
      next: searchParams.get('next'),
    });
    navigate(plan.destino, { replace: true });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoadingForm(true);
    setError('');

    try {
      const res = await authAPI.login(email, password);

      if (!res.success) {
        setError(res.error || 'Credenciales inválidas');
        return;
      }

      if (res.requires2FASetup) {
        // Staff sin 2FA: hay que activarlo antes de entrar. El backend ya
        // verificó la contraseña y sólo entrega un reto temporal.
        setTempToken(res.tempToken);
        setStep('setup');
        return;
      }

      if (res.requires2FA) {
        setTempToken(res.tempToken);
        setStep('2fa');
        return;
      }

      if (res.requiresOTP) {
        setStep('otp');
        return;
      }

      if (res.accessToken && res.user) {
        await completeLogin(
          { accessToken: res.accessToken, refreshToken: res.refreshToken },
          res.user,
        );
        return;
      }

      setError('Respuesta de sesión inválida');
    } catch (err) {
      setError(err.error || 'Error de conexión');
    } finally {
      setLoadingForm(false);
    }
  };

  // Con sesión ya activa no se muestra el formulario: se va al destino (o
  // al cambio de contraseña si la sesión lo exige). Durante un login en
  // curso manda `completeLogin`, que ya navega al destino.
  useEffect(() => {
    if (loading || !user || loginEnCurso.current) return;
    const plan = pantallaPostLogin({
      esCliente: tieneRol(['CLIENTE'], rolesDe(user)),
      mustChangePassword: Boolean(user.mustChangePassword),
      next: nextPedido,
    });
    if (plan.tipo === 'cliente') {
      window.location.assign(`${SITE_URL.replace(/\/+$/, '')}${rutaCliente(nextPedido)}`);
      return;
    }
    navigate(plan.destino, { replace: true });
  }, [loading, user, nextPedido, navigate]);

  const backToCredentials = () => {
    setStep('credentials');
    setTempToken('');
    setError('');
  };

  // Mientras se restaura la sesión no se pinta el formulario: si la había,
  // el efecto de arriba ya está yendo al destino.
  if (loading) return <PageLoader />;

  if (step === 'setup') {
    return (
      <TwoFactorSetup
        token={tempToken}
        setup={authAPI.setup2FAChallenge}
        confirm={authAPI.confirm2FAChallenge}
        onSuccess={(res) => completeLogin(
          { accessToken: res.accessToken, refreshToken: res.refreshToken },
          res.user,
        )}
        onBack={backToCredentials}
      />
    );
  }

  if (step === '2fa') {
    return (
      <TwoFactorVerify
        tempToken={tempToken}
        onVerified={completeLogin}
        onBack={backToCredentials}
      />
    );
  }

  if (step === 'otp') {
    return (
      <OTPVerify
        email={email}
        onVerified={completeLogin}
        onBack={backToCredentials}
      />
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <SEOHead title="Iniciar Sesión" description="Accede al panel de administración de Green Line." url="/login" />
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8">
          <div className="text-center mb-8">
            <div className="w-12 h-12 bg-brand rounded-xl flex items-center justify-center mx-auto mb-3">
              <Lock className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-xl font-bold text-gray-900">GreenLine</h1>
            <p className="text-sm text-gray-500 mt-1">Inicia sesión en tu cuenta</p>
          </div>

          {sesionExpirada && (
            <div className="flex items-center gap-2 bg-amber-50 text-amber-800 text-sm px-4 py-3 rounded-lg mb-4">
              <AlertCircle className="w-4 h-4 shrink-0" />
              Tu sesión se cerró sola a la hora (1 h por seguridad). Vuelve a
              entrar con tu contraseña y tu código.
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg mb-4">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
                  placeholder="tu@email.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loadingForm}
              className="w-full py-2.5 bg-brand text-white font-semibold rounded-lg hover:bg-brand-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loadingForm ? 'Ingresando...' : 'Iniciar sesión'}
            </button>
          </form>

          <div>
            <p className="text-sm text-gray-500 mt-4 text-center">
              ¿Olvidaste tu contraseña?{' '}
              <a
                href={`${SITE_URL}/restablecer-contrasena`}
                className="text-brand font-medium hover:underline"
              >
                Restablecer
              </a>
            </p>
          </div>

        </div>
      </div>
    </div>
  );
}
