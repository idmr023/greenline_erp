import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Globe, ExternalLink, RefreshCw, AlertCircle } from '../lib/icons';
import { useAuth } from '../contexts/AuthContext';

// Base del dashboard Flask:
//  - Producción (Vercel): función Python same-origin en `/dash` (ver vercel.json).
//  - Local (vite dev): el Flask de desarrollo en 127.0.0.1:5000.
//  - Override opcional con VITE_DASHBOARD_URL (p. ej. un servicio externo).
const DASHBOARD_BASE_URL = (
  import.meta.env.VITE_DASHBOARD_URL ||
  (import.meta.env.DEV ? 'http://127.0.0.1:5000' : '/dash')
).replace(/\/+$/, '');

export default function DashboardEmbedded({ slugInicial = null }) {
  const { accessToken } = useAuth();
  const [searchParams] = useSearchParams();
  const [iframeSrc, setIframeSrc] = useState(`${DASHBOARD_BASE_URL}/`);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const iframeRef = useRef(null);

  const targetSlug = useMemo(
    () => searchParams.get('slug') || searchParams.get('id') || slugInicial,
    [searchParams, slugInicial],
  );

  useEffect(() => {
    const url = targetSlug
      ? `${DASHBOARD_BASE_URL}/dashboard/${encodeURIComponent(targetSlug)}`
      : `${DASHBOARD_BASE_URL}/`;
    setIframeSrc(url);
    setLoading(true);
    setError(null);
  }, [targetSlug]);

  const handleLoad = () => setLoading(false);
  const handleError = () => {
    setLoading(false);
    setError(`No se pudo cargar el dashboard embebido en ${DASHBOARD_BASE_URL}. Verifica que el servicio Flask esté activo y permita ser embebido (frame-ancestors).`);
  };
  const openInNewTab = () => {
    window.open(iframeSrc, '_blank', 'noopener,noreferrer');
  };
  const reloadIframe = () => {
    setLoading(true);
    setError(null);
    const iframe = document.querySelector('#dashboard-iframe');
    if (iframe) {
      iframe.src = iframeSrc;
    }
  };

  /**
   * El dashboard Flask (embebido) muestra los datos vivos de los módulos del
   * taller (incentivos, garantías, ensamblado) y para eso necesita el token
   * del usuario: se lo entregamos por `postMessage` y el dashboard lo
   * reenvía al backend. El token viaja en memoria, nunca en la URL, y sólo
   * se acepta desde los orígenes que el propio dashboard autoriza.
   */
  const enviarToken = useCallback(() => {
    if (!accessToken) return;
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;
    let destino;
    try {
      destino = new URL(DASHBOARD_BASE_URL, window.location.origin).origin;
    } catch {
      return;
    }
    iframe.contentWindow.postMessage({ tipo: 'gl:taller-token', token: accessToken }, destino);
  }, [accessToken]);

  useEffect(() => {
    enviarToken();
  }, [enviarToken, iframeSrc]);

  return (
    <>
      <Helmet>
        <title>Dashboard | GreenLine ERP</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <div className="flex flex-col h-[calc(100vh-4rem)] bg-gray-100">
        <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Globe className="w-5 h-5 text-brand" />
              <h1 className="text-lg font-semibold text-gray-900">
                Dashboard {targetSlug ? `— ${targetSlug}` : ''}
              </h1>
            </div>
            {targetSlug && (
              <span className="hidden sm:inline-flex px-2.5 py-1 rounded-full text-xs font-medium bg-brand/10 text-brand">
                Vista embebida
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={reloadIframe}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              title="Recargar dashboard"
            >
              <RefreshCw className="w-4 h-4" />
              <span className="hidden sm:inline">Recargar</span>
            </button>
            <button
              onClick={openInNewTab}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              title="Abrir en nueva pestaña"
            >
              <ExternalLink className="w-4 h-4" />
              <span className="hidden sm:inline">Abrir en pestaña</span>
            </button>
            <Link
              to="/admin"
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Volver al panel
            </Link>
          </div>
        </div>

        {error && (
          <div className="mx-4 mt-4 p-4 rounded-lg border border-amber-200 bg-amber-50 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-amber-800 mb-2">{error}</p>
              <div className="flex flex-wrap gap-2">
                <Link
                  to="/admin/dashboard/list"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-700 bg-white border border-amber-300 rounded hover:bg-amber-50"
                >
                  Ir a listado de dashboards
                </Link>
                <a
                  href={DASHBOARD_BASE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-700 bg-white border border-amber-300 rounded hover:bg-amber-50"
                >
                  Abrir Flask directamente
                </a>
              </div>
            </div>
          </div>
        )}

        <div className="flex-1 relative bg-gray-200">
          {loading && !error && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-100/80 z-10">
              <div className="flex flex-col items-center gap-3">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand" />
                <p className="text-sm text-gray-600">Cargando dashboard...</p>
              </div>
            </div>
          )}
          <iframe
            id="dashboard-iframe"
            ref={iframeRef}
            src={iframeSrc}
            title="Dashboard embebido"
            className="w-full h-full border-0"
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-downloads"
            loading="lazy"
            onLoad={() => {
              handleLoad();
              // El iframe acaba de cargar: se le entrega el token del usuario.
              enviarToken();
            }}
            onError={handleError}
          />
        </div>
      </div>
    </>
  );
}
