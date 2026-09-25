import { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { versionarHtml, versionarImagen } from '../../lib/images';
import BlogCarrusel from './BlogCarrusel';

function leerImagenes(block) {
  try {
    const raw = JSON.parse(block.getAttribute('data-images') || '[]');
    if (Array.isArray(raw)) {
      return raw
        .filter((img) => img && (typeof img === 'string' ? img : img.src))
        .map((img) => ({
          src: versionarImagen(typeof img === 'string' ? img : img.src || ''),
          alt: (typeof img === 'string' ? '' : img.alt) || '',
        }));
    }
  } catch {
    // Ignorar bloques con JSON inválido
  }
  return [];
}

function hidratarCarruseles(container) {
  if (!container) return [];
  const roots = [];
  container.querySelectorAll('[data-carrusel]').forEach((block) => {
    const images = leerImagenes(block);
    if (images.length === 0) return;
    block.innerHTML = '';
    const root = createRoot(block);
    root.render(<BlogCarrusel images={images} />);
    roots.push(root);
  });
  return roots;
}

export default function BlogContent({ html, className }) {
  const containerRef = useRef(null);

  useEffect(() => {
    const roots = hidratarCarruseles(containerRef.current);
    return () => {
      roots.forEach((r) => r.unmount());
    };
  }, [html]);

  return (
    <div
      ref={containerRef}
      className={className}
      dangerouslySetInnerHTML={{ __html: versionarHtml(html || '') }}
    />
  );
}