import { test } from 'node:test';
import assert from 'node:assert/strict';

import { mensajeDeError, esFalloDeServidor } from './apiErrors.js';

test('un 401 devuelve el mensaje del backend (el código no vale)', () => {
  assert.equal(
    mensajeDeError({ status: 401, error: 'Código 2FA inválido' }),
    'Código 2FA inválido',
  );
  // Sin mensaje del backend: genérico, pero nunca "error del servidor".
  assert.equal(mensajeDeError({ status: 401 }), 'Código inválido');
});

test('un 5xx NO se disfraza de código inválido', () => {
  const mensaje = mensajeDeError({ status: 500, error: 'Error interno del servidor' });
  assert.equal(mensaje, 'El servidor no pudo responder en este momento. Intenta en un momento.');
  assert.ok(!/inválido/i.test(mensaje), 'no debe insinuar que el código es incorrecto');
});

test('un 429 pide esperar (reintentar ahora no sirve)', () => {
  const mensaje = mensajeDeError({ status: 429, error: 'Demasiados intentos de 2FA' });
  assert.equal(mensaje, 'Demasiados intentos de 2FA');
  assert.ok(!/inválido/i.test(mensaje));
});

test('un 408 (timeout) sí se puede reintentar', () => {
  assert.equal(
    mensajeDeError({ status: 408 }),
    'El servidor tardó demasiado en responder. Intenta de nuevo.',
  );
});

test('sin status (red caída) usa el fallback del llamador', () => {
  assert.equal(
    mensajeDeError({ message: 'Failed to fetch' }, 'No se pudo verificar el código.'),
    'No se pudo verificar el código.',
  );
  assert.equal(mensajeDeError(null, 'fallback'), 'fallback');
});

test('el fallback del llamador manda si no hay error del backend', () => {
  assert.equal(mensajeDeError({}, 'Código inválido o expirado'), 'Código inválido o expirado');
});

test('esFalloDeServidor distingue lo que NO es culpa del código', () => {
  assert.equal(esFalloDeServidor({ status: 500 }), true);
  assert.equal(esFalloDeServidor({ status: 429 }), true);
  assert.equal(esFalloDeServidor({ status: 408 }), true);
  assert.equal(esFalloDeServidor({ status: 401 }), false);
  assert.equal(esFalloDeServidor(null), false);
});
