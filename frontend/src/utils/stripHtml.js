/**
 * Limpia etiquetas HTML de un string y normaliza espacios.
 * Útil para texto proveniente de Supabase / base de datos.
 */
export default function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[^\S\r\n]+/g, ' ')
    .replace(/\n\s*\n/g, '\n\n')
    .trim();
}

/**
 * Extrae el tipo de batería limpio de un texto largo de Supabase.
 * "de GRAFENO de 72 voltios y 35 amperios..." → "Plomo Grafeno"
 */
export function cleanBateria(raw) {
  if (!raw) return null;
  const low = raw.toLowerCase();
  if (/litio/.test(low)) return 'Litio';
  if (/grafen/.test(low)) return 'Plomo Grafeno';
  if (/plomo/.test(low)) return 'Plomo Ácido';
  if (raw.length <= 20) return raw;
  return null;
}

/**
 * Extrae watts limpio del campo motor.
 * "2000 Watts" → "2000W", "de 72 voltios y 22 amperios..." → null
 */
export function cleanWatts(motor) {
  if (!motor) return null;
  const match = motor.match(/(\d{2,4})\s*[Ww]/);
  return match ? `${match[1]}W` : null;
}
