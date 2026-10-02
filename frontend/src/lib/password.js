import { z } from 'zod';

/**
 * Fortaleza de contraseñas del ERP — UNA sola fuente de verdad:
 *  - `PasswordSchema` (zod) valida antes de enviar.
 *  - `evaluarPassword()` alimenta el medidor visual <PasswordStrength/>.
 *
 * El ERP es más estricto que el backend (exige mayúscula); el backend
 * acepta sin mayúscula para no romper la contraseña estándar del admin.
 */

export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;

export const PASSWORD_REGLAS = [
  { id: 'largo', etiqueta: 'Al menos 12 caracteres', test: (p) => p.length >= PASSWORD_MIN },
  { id: 'mayuscula', etiqueta: 'Al menos una mayúscula', test: (p) => /[A-Z]/.test(p) },
  { id: 'minuscula', etiqueta: 'Al menos una minúscula', test: (p) => /[a-z]/.test(p) },
  { id: 'numero', etiqueta: 'Al menos un número', test: (p) => /[0-9]/.test(p) },
  { id: 'simbolo', etiqueta: 'Al menos un carácter especial', test: (p) => /[^A-Za-z0-9]/.test(p) },
];

export const PasswordSchema = z
  .string()
  .min(PASSWORD_MIN, 'La contraseña debe tener al menos 12 caracteres')
  .max(PASSWORD_MAX, 'La contraseña es demasiado larga')
  .regex(/[A-Z]/, 'Debe contener al menos una mayúscula')
  .regex(/[a-z]/, 'Debe contener al menos una minúscula')
  .regex(/[0-9]/, 'Debe contener al menos un número')
  .regex(/[^A-Za-z0-9]/, 'Debe contener al menos un carácter especial');

/** Estado de cada regla para el medidor. */
export function evaluarPassword(password) {
  const p = String(password ?? '');
  const reglas = PASSWORD_REGLAS.map((r) => ({ ...r, ok: r.test(p) }));
  return {
    reglas,
    ok: p.length <= PASSWORD_MAX && reglas.every((r) => r.ok),
    cumplidas: reglas.filter((r) => r.ok).length,
    total: reglas.length,
  };
}
