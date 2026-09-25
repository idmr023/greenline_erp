import { BRAND } from './config';

/** Número de aniversario según año actual (fundado en 2017). */
export function aniversarioNumero(year = new Date().getFullYear()) {
  const n = year - BRAND.founded;
  return n >= 1 ? n : 1;
}

/** Rango de fechas en que está ACTIVO el tema aniversario (septiembre). */
export const ANIVERSARIO_START = { month: 8, day: 1 }; // SEP 1 (mes 0-based)
export const ANIVERSARIO_END = { month: 8, day: 30 }; // SEP 30

export function isAniversarioActivo(date = new Date()) {
  const m = date.getMonth();
  const d = date.getDate();
  const s = ANIVERSARIO_START;
  const e = ANIVERSARIO_END;
  if (s.month === e.month) {
    return m === s.month && d >= s.day && d <= e.day;
  }
  // cruce de año (p.ej. dic->ene), por robustez
  return (
    m > s.month ||
    m < e.month ||
    (m === s.month && d >= s.day) ||
    (m === e.month && d <= e.day)
  );
}

/** Toggle manual guardado en localStorage. Si está definido, tiene prioridad. */
export function getTemaAniversarioManual() {
  try {
    const raw = localStorage.getItem('greenline_aniversario');
    if (raw === 'true') return true;
    if (raw === 'false') return false;
  } catch {
    /* ignore */
  }
  return null;
}

export function setTemaAniversarioManual(value) {
  try {
    localStorage.setItem('greenline_aniversario', String(value));
  } catch {
    /* ignore */
  }
}

/** Alterna el tema manual (on/off) y notifica a los componentes vía evento global. */
export function toggleTemaAniversario() {
  const next = !temaAniversarioActivo();
  setTemaAniversarioManual(next);
  try {
    window.dispatchEvent(new Event('greenline:aniversario'));
  } catch {
    /* ignore */
  }
  return next;
}

/** Decisión final: manual si existe, si no por fechas. */
export function temaAniversarioActivo() {
  const manual = getTemaAniversarioManual();
  if (manual !== null) return manual;
  return isAniversarioActivo();
}

export const CONFETTI_COLORS = ['#009000', '#006400', '#2eb82e', '#ffffff', '#ffd400'];

/** Serpentinas con animación determinista (caen en espiral).
 *  Verde de marca, blanco y amarillo eléctrico. */
export const SERPENTINAS = [
  { color: '#ffffff', left: '6%', delay: 0, duration: 11 },
  { color: '#2eb82e', left: '22%', delay: 4, duration: 13 },
  { color: '#ffd400', left: '38%', delay: 8, duration: 12 },
  { color: '#006400', left: '54%', delay: 12, duration: 14 },
  { color: '#4ade80', left: '70%', delay: 16, duration: 11 },
  { color: '#ffd400', left: '84%', delay: 20, duration: 13 },
  { color: '#ffffff', left: '12%', delay: 24, duration: 12 },
];
