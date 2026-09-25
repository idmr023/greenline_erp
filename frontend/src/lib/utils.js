export function formatPrice(value) {
  if (value == null) return 'S/ --';
  return `S/ ${Number(value).toLocaleString('es-PE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export { BANNERS } from './images';