import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  EVENTO,
  POLITICA_DEFECTO,
  estadoInicialLock,
  evaluarVencimiento,
  limiteMs,
  reducirLock,
  restanteMs,
  vencido,
} from './lock.js';

const H = 60 * 60_000;

describe('auto-lock (§9 R26–R28)', () => {
  test('arranca bloqueada y se activa al desbloquear', () => {
    let lock = estadoInicialLock(0);
    assert.equal(lock.estado, 'bloqueada');
    assert.equal(vencido(lock, 10 * H, POLITICA_DEFECTO), false, 'no se bloquea dos veces');

    lock = reducirLock(lock, { tipo: EVENTO.desbloqueado, ahora: 1000 });
    assert.equal(lock.estado, 'activa');
    assert.equal(lock.modo, 'estandar');
    assert.equal(lock.ultimoActividad, 1000);
  });

  test('la inactividad vence a los 15 min por defecto (R26)', () => {
    const t0 = 1_000_000;
    let lock = reducirLock(estadoInicialLock(), { tipo: EVENTO.desbloqueado, ahora: t0 });

    assert.equal(vencido(lock, t0 + 14 * 60_000, POLITICA_DEFECTO), false);
    assert.equal(vencido(lock, t0 + 15 * 60_000, POLITICA_DEFECTO), true);
    assert.equal(limiteMs(lock, POLITICA_DEFECTO), 15 * 60_000);
  });

  test('la actividad reinicia el reloj (R27)', () => {
    const t0 = 1_000_000;
    let lock = reducirLock(estadoInicialLock(), { tipo: EVENTO.desbloqueado, ahora: t0 });

    lock = reducirLock(lock, { tipo: EVENTO.actividad, ahora: t0 + 10 * 60_000 });
    assert.equal(vencido(lock, t0 + 20 * 60_000, POLITICA_DEFECTO), false);
    assert.equal(vencido(lock, t0 + 25 * 60_000, POLITICA_DEFECTO), true);
  });

  test('modo crítico acorta el límite a 5 min y se recupera', () => {
    const t0 = 0;
    let lock = reducirLock(estadoInicialLock(), { tipo: EVENTO.desbloqueado, ahora: t0 });
    assert.equal(limiteMs(lock, POLITICA_DEFECTO), 15 * 60_000);

    lock = reducirLock(lock, { tipo: EVENTO.modoCritico, ahora: t0 + 1000 });
    assert.equal(lock.modo, 'critico');
    assert.equal(limiteMs(lock, POLITICA_DEFECTO), 5 * 60_000);
    assert.equal(vencido(lock, t0 + 6 * 60_000, POLITICA_DEFECTO), true);

    lock = reducirLock(lock, { tipo: EVENTO.modoEstandar, ahora: t0 + 6 * 60_000 });
    assert.equal(lock.modo, 'estandar');
    assert.equal(limiteMs(lock, POLITICA_DEFECTO), 15 * 60_000);
  });

  test('bloquear limpia el estado de actividad (R25)', () => {
    const activa = reducirLock(estadoInicialLock(), { tipo: EVENTO.desbloqueado, ahora: 9999 });
    const bloqueada = reducirLock(activa, { tipo: EVENTO.bloqueado });
    assert.equal(bloqueada.estado, 'bloqueada');
    assert.equal(bloqueada.ultimoActividad, 0);
    assert.equal(bloqueada.modo, 'estandar');
  });

  test('la actividad y los modos se ignoran estando bloqueada', () => {
    const bloqueada = estadoInicialLock();
    assert.equal(reducirLock(bloqueada, { tipo: EVENTO.actividad, ahora: 5 }), bloqueada);
    assert.equal(reducirLock(bloqueada, { tipo: EVENTO.modoCritico, ahora: 5 }), bloqueada);
  });

  test('evaluarVencimiento devuelve el lock ya bloqueado cuando vence', () => {
    const t0 = 0;
    const activa = reducirLock(estadoInicialLock(), { tipo: EVENTO.desbloqueado, ahora: t0 });
    assert.equal(evaluarVencimiento(activa, t0 + 1000, POLITICA_DEFECTO), activa);

    const vencida = evaluarVencimiento(activa, t0 + 16 * 60_000, POLITICA_DEFECTO);
    assert.equal(vencida.estado, 'bloqueada');
  });

  test('restanteMs nunca es negativo y es 0 si está bloqueada', () => {
    const t0 = 0;
    const activa = reducirLock(estadoInicialLock(), { tipo: EVENTO.desbloqueado, ahora: t0 });
    assert.equal(restanteMs(activa, t0, POLITICA_DEFECTO), 15 * 60_000);
    assert.equal(restanteMs(activa, t0 + 20 * 60_000, POLITICA_DEFECTO), 0);
    assert.equal(restanteMs(estadoInicialLock(), t0 + 1, POLITICA_DEFECTO), 0);
  });

  test('una política distinta se respeta', () => {
    const personalizada = { inactividadMs: 1000, criticoMs: 200 };
    const lock = reducirLock(estadoInicialLock(), { tipo: EVENTO.desbloqueado, ahora: 0 });
    assert.equal(vencido(lock, 999, personalizada), false);
    assert.equal(vencido(lock, 1000, personalizada), true);
  });
});
