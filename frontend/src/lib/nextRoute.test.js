import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  FALLBACK_POST_LOGIN,
  sanitizarNext,
  nextDesdeLocation,
  destinoPostLogin,
  loginConNext,
  loginDesdeLocation,
  cambiarPasswordConNext,
  pantallaPostLogin,
} from './nextRoute.js';

const NUL = String.fromCharCode(0);
// Se arma por partes para que el linter no lo confunda con un script.
const URL_SCRIPT = ['javascript', 'alert(1)'].join(':');

test('sanitizarNext: acepta rutas relativas del panel', () => {
  assert.equal(sanitizarNext('/admin'), '/admin');
  assert.equal(sanitizarNext('/admin/citas'), '/admin/citas');
  assert.equal(sanitizarNext('/admin/agenda_citas'), '/admin/agenda_citas');
  assert.equal(sanitizarNext('/fase-2-implementacion'), '/fase-2-implementacion');
  assert.equal(sanitizarNext('/'), '/');
});

test('sanitizarNext: conserva query string y hash', () => {
  assert.equal(
    sanitizarNext('/admin/dashboard-embed?slug=servicio-tecnico'),
    '/admin/dashboard-embed?slug=servicio-tecnico',
  );
  assert.equal(
    sanitizarNext('/admin/productos?tab=stock#fila-3'),
    '/admin/productos?tab=stock#fila-3',
  );
});

test('sanitizarNext: rechaza esquemas y destinos externos', () => {
  assert.equal(sanitizarNext('https://evil.com'), null);
  assert.equal(sanitizarNext('http://evil.com/panel'), null);
  assert.equal(sanitizarNext(URL_SCRIPT), null);
  assert.equal(sanitizarNext('data:text/html,<script>'), null);
  assert.equal(sanitizarNext('mailto:a@b.com'), null);
});

test('sanitizarNext: rechaza open redirect por doble barra o barra invertida', () => {
  assert.equal(sanitizarNext('//evil.com'), null);
  assert.equal(sanitizarNext('//evil.com/admin'), null);
  assert.equal(sanitizarNext('/\\evil.com'), null);
  assert.equal(sanitizarNext('/admin/\\evil.com'), null);
  assert.equal(sanitizarNext('admin/citas'), null);
});

test('sanitizarNext: rechaza entradas vacías o que no son texto', () => {
  assert.equal(sanitizarNext(''), null);
  assert.equal(sanitizarNext('   '), null);
  assert.equal(sanitizarNext(null), null);
  assert.equal(sanitizarNext(undefined), null);
  assert.equal(sanitizarNext(42), null);
  assert.equal(sanitizarNext({}), null);
});

test('sanitizarNext: rechaza saltos de linea y caracteres de control', () => {
  assert.equal(sanitizarNext('/admin\n//evil.com'), null);
  assert.equal(sanitizarNext('/admin\r\nSet-Cookie: x=1'), null);
  assert.equal(sanitizarNext(`/admin${NUL}`), null);
});

test('sanitizarNext: rechaza las rutas que producirian un bucle', () => {
  assert.equal(sanitizarNext('/login'), null);
  assert.equal(sanitizarNext('/login?next=/admin'), null);
  assert.equal(sanitizarNext('/change-password'), null);
  assert.equal(sanitizarNext('/change-password?next=/admin'), null);
});

test('nextDesdeLocation: arma la ruta con query y hash', () => {
  assert.equal(
    nextDesdeLocation({ pathname: '/admin/citas', search: '', hash: '' }),
    '/admin/citas',
  );
  assert.equal(
    nextDesdeLocation({
      pathname: '/admin/dashboard-embed',
      search: '?slug=servicio-tecnico',
      hash: '',
    }),
    '/admin/dashboard-embed?slug=servicio-tecnico',
  );
  assert.equal(
    nextDesdeLocation({ pathname: '/admin/productos', search: '?tab=stock', hash: '#fila-3' }),
    '/admin/productos?tab=stock#fila-3',
  );
});

test('nextDesdeLocation: tolera datos incompletos', () => {
  assert.equal(nextDesdeLocation(null), null);
  assert.equal(nextDesdeLocation(undefined), null);
  assert.equal(nextDesdeLocation({}), null);
  assert.equal(nextDesdeLocation({ pathname: '/admin/citas' }), '/admin/citas');
});

test('destinoPostLogin: cae al hub cuando el destino no es valido', () => {
  assert.equal(destinoPostLogin('/admin/citas'), '/admin/citas');
  assert.equal(destinoPostLogin('//evil.com'), FALLBACK_POST_LOGIN);
  assert.equal(destinoPostLogin(null), FALLBACK_POST_LOGIN);
  assert.equal(destinoPostLogin(''), FALLBACK_POST_LOGIN);
  assert.equal(destinoPostLogin('/login'), FALLBACK_POST_LOGIN);
});

test('loginConNext: arma la URL de login con el destino codificado', () => {
  assert.equal(loginConNext('/admin/citas'), '/login?next=%2Fadmin%2Fcitas');
  assert.equal(
    loginConNext('/admin/dashboard-embed?slug=servicio-tecnico'),
    '/login?next=%2Fadmin%2Fdashboard-embed%3Fslug%3Dservicio-tecnico',
  );
});

test('loginConNext: sin destino valido deja /login a secas', () => {
  assert.equal(loginConNext(null), '/login');
  assert.equal(loginConNext('//evil.com'), '/login');
  assert.equal(loginConNext('/login'), '/login');
});

test('loginDesdeLocation: toma la ubicacion actual como destino', () => {
  assert.equal(
    loginDesdeLocation({ pathname: '/admin/citas', search: '', hash: '' }),
    '/login?next=%2Fadmin%2Fcitas',
  );
  assert.equal(
    loginDesdeLocation({
      pathname: '/admin/dashboard-embed',
      search: '?slug=servicio-tecnico',
      hash: '',
    }),
    '/login?next=%2Fadmin%2Fdashboard-embed%3Fslug%3Dservicio-tecnico',
  );
  assert.equal(loginDesdeLocation(null), '/login');
});

test('pantallaPostLogin: el staff va al panel y respeta el destino', () => {
  const plan = pantallaPostLogin({ next: '/admin/citas' });
  assert.equal(plan.tipo, 'panel');
  assert.equal(plan.destino, '/admin/citas');
});

test('pantallaPostLogin: sin destino valido cae al hub', () => {
  const plan = pantallaPostLogin({});
  assert.equal(plan.tipo, 'panel');
  assert.equal(plan.destino, FALLBACK_POST_LOGIN);
});

test('pantallaPostLogin: el cliente va al sitio publico', () => {
  const plan = pantallaPostLogin({ esCliente: true, next: '/checkout' });
  assert.equal(plan.tipo, 'cliente');
});

test('pantallaPostLogin: con clave temporal pasa por el cambio y conserva destino', () => {
  const plan = pantallaPostLogin({ mustChangePassword: true, next: '/admin/citas' });
  assert.equal(plan.tipo, 'cambio-password');
  assert.equal(plan.destino, '/change-password?next=%2Fadmin%2Fcitas');
});

test('pantallaPostLogin: el cliente manda sobre el cambio de clave', () => {
  const plan = pantallaPostLogin({ esCliente: true, mustChangePassword: true, next: '/checkout' });
  assert.equal(plan.tipo, 'cliente');
});

test('pantallaPostLogin: el cambio de clave sin destino no inventa uno', () => {
  const plan = pantallaPostLogin({ mustChangePassword: true, next: '//evil.com' });
  assert.equal(plan.tipo, 'cambio-password');
  assert.equal(plan.destino, '/change-password?next=%2Fadmin');
});

test('cambiarPasswordConNext: conserva el destino tras cambiar la clave', () => {
  assert.equal(
    cambiarPasswordConNext('/admin/citas'),
    '/change-password?next=%2Fadmin%2Fcitas',
  );
  assert.equal(cambiarPasswordConNext(null), '/change-password');
  assert.equal(cambiarPasswordConNext('/change-password'), '/change-password');
});
