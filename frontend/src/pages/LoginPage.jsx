import { useEffect } from 'react';

const SITE_URL = import.meta.env.VITE_SITE_URL
  || (window.location.hostname === 'localhost' ? 'http://localhost:5173' : 'https://www.glperu.com');

export default function LoginPage() {
  useEffect(() => {
    const next = new URLSearchParams(window.location.search).get('next');
    const query = next ? `?next=${encodeURIComponent(next)}` : '';
    window.location.replace(`${SITE_URL.replace(/\/+$/, '')}/login${query}`);
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <p className="text-sm text-gray-500">Redirigiendo al inicio de sesión…</p>
    </div>
  );
}
