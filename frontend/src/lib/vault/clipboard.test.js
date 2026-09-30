import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  AVISO_HISTORIAL_SO,
  RETENCION_DEFECTO_MS,
  copiarAlPortapapeles,
} from './clipboard.js';

const SECRETO = 'MiContraseña-Súper-Secreta-2026!';

function entornoFalso() {
  const escrituras = [];
  let pendiente = null;
  let cancelado = 0;
  return {
    escrituras,
    ahora: () => 1_000_000, // reloj fijo: restanteMs() es determinista
    escribir: async (texto) => { escrituras.push(texto); },
    vaciar: () => { escrituras.push(''); },
    programar: (fn, ms) => { pendiente = { fn, ms }; return 42; },
    cancelar: () => { cancelado += 1; pendiente = null; },
    disparar: () => {
      const p = pendiente;
      pendiente = null;
      if (p) p.fn();
    },
    msProgramado: () => pendiente?.ms ?? null,
    cancelaciones: () => cancelado,
  };
}

describe('portapapeles (§14 / R44–R49)', () => {
  test('escribe el secreto y programa el borrado', async () => {
    const entorno = entornoFalso();
    const control = await copiarAlPortapapeles(SECRETO, entorno);

    assert.deepEqual(entorno.escrituras, [SECRETO]);
    assert.equal(entorno.msProgramado(), RETENCION_DEFECTO_MS);
    assert.equal(control.restanteMs(), RETENCION_DEFECTO_MS);
    assert.equal(control.aviso, AVISO_HISTORIAL_SO);
    control.limpiar();
  });

  test('al vencer el temporizador se vacía el portapapeles y se avisa', async () => {
    const entorno = entornoFalso();
    let avisoLlamado = 0;
    await copiarAlPortapapeles(SECRETO, { ...entorno, alVencer: () => { avisoLlamado += 1; } });

    entorno.disparar();
    assert.equal(entorno.escrituras.at(-1), '', 'última escritura = vacío');
    assert.equal(avisoLlamado, 1);
  });

  test('limpiar() es idempotente y cancela el temporizador (R45)', async () => {
    const entorno = entornoFalso();
    const control = await copiarAlPortapapeles(SECRETO, entorno);

    control.limpiar();
    control.limpiar();
    control.limpiar();

    assert.equal(entorno.cancelaciones(), 1, 'sólo se cancela el primer temporizador');
    assert.equal(entorno.escrituras.filter((w) => w === '').length, 1, 'sólo un vaciado');
    assert.equal(control.restanteMs(), 0);
  });

  test('acepta una retención personalizada', async () => {
    const entorno = entornoFalso();
    await copiarAlPortapapeles(SECRETO, { ...entorno, retencionMs: 5000 });
    assert.equal(entorno.msProgramado(), 5000);
  });

  test('rechaza texto vacío y retenciones inválidas', async () => {
    const entorno = entornoFalso();
    await assert.rejects(copiarAlPortapapeles('', entorno), /nada que copiar/i);
    await assert.rejects(copiarAlPortapapeles(undefined, entorno), /nada que copiar/i);
    await assert.rejects(copiarAlPortapapeles(SECRETO, { ...entorno, retencionMs: 0 }), /retencionMs/);
    await assert.rejects(copiarAlPortapapeles(SECRETO, { ...entorno, retencionMs: -5 }), /retencionMs/);
    await assert.rejects(copiarAlPortapapeles(SECRETO, { ...entorno, retencionMs: NaN }), /retencionMs/);
    assert.deepEqual(entorno.escrituras, [], 'no se escribe nada si la validación falla');
  });

  test('el aviso menciona el historial del sistema (R47)', () => {
    assert.match(AVISO_HISTORIAL_SO, /historial/i);
    assert.match(AVISO_HISTORIAL_SO, /borrar/i);
    assert.ok(AVISO_HISTORIAL_SO.length > 40, 'no es un aviso de adorno');
  });

  test('sin API de portapapeles devuelve un error claro (contexto no seguro)', async () => {
    // Sin `navigator` global (Node) debe fallar el escritor por defecto.
    await assert.rejects(copiarAlPortapapeles(SECRETO), /portapapeles no está disponible/);
  });
});
