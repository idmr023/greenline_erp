export function formatPrice(value) {
  if (value == null) return 'S/ --';
  return `S/ ${Number(value).toLocaleString('es-PE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export { BANNERS } from './images';

export function formatDate(date) {
  if (!date) return "";

  return new Intl.DateTimeFormat("es-PE", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${date}T00:00:00`));
}

export const inputClass =
  'w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand text-sm';