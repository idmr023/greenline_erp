import { supabase } from './supabase';

/**
 * Sube una imagen al backend y la devuelve como URL pública.
 * El backend la guarda en la carpeta del artículo:
 *   - Fuente viva: Supabase Storage assets/imagenes/articulos/<slug>/
 *   - Espejo local: public/assets/imagenes/articulos/<slug>/
 *
 * @param {File} file - Archivo de imagen (jpeg/png/webp/gif)
 * @param {string} slug - Slug del artículo (crea la carpeta si no existe)
 * @returns {Promise<string>} URL pública del storage
 */
export async function subirImagenBlog(file, slug) {
  if (!file) throw new Error('No se proporcionó ninguna imagen');
  if (!slug) throw new Error('El slug del artículo es obligatorio');

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('Sesión no válida. Inicia sesión de nuevo.');
  }

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
  const formData = new FormData();
  formData.append('image', file);
  formData.append('slug', slug);

  const res = await fetch(`${apiUrl}/blog/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}` },
    body: formData,
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || res.statusText);
  }

  return data.url;
}