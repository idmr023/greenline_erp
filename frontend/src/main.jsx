import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HelmetProvider } from 'react-helmet-async';
import * as Sentry from '@sentry/react';
import './index.css';
import App from './App.jsx';

// Error tracking (Sentry). Sin VITE_SENTRY_DSN es no-op: local/dev sin costo.
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.1,
  });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Sentry.ErrorBoundary
      fallback={
        <div style={{ maxWidth: 560, margin: '10vh auto', textAlign: 'center', fontFamily: 'system-ui' }}>
          <h1>Algo salio mal</h1>
          <p>Recarga la pagina. Si el problema continua, contacta al equipo de sistemas.</p>
          <button onClick={() => window.location.reload()}>Recargar</button>
        </div>
      }
    >
      <HelmetProvider>
        <App />
      </HelmetProvider>
    </Sentry.ErrorBoundary>
  </StrictMode>,
);
