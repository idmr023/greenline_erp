import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { crearClienteBoveda } from './cliente.js';

function workerFalso() {
  const listeners = { message: [], error: [], messageerror: [] };
  const enviados = [];
  let terminado = false;
  return {
    enviados,
    esTerminado: () => terminado,
    addEventListener(tipo, fn) {
      (listeners[tipo] = listeners[tipo] || []).push(fn);
    },
    postMessage(mensaje) {
      enviados.push(mensaje);
    },
    terminate() {
      terminado = true;
    },
    responder(id, resultado) {
      listeners.message.forEach((fn) => fn({ data: { id, ok: true, resultado } }));
    },
    fallar(id, error) {
      listeners.message.forEach((fn) => fn({ data: { id, ok: false, error } }));
    },
    emitirError(message) {
      listeners.error.forEach((fn) => fn({ message }));
    },
  };
}

function clienteConWorker() {
  const worker = workerFalso();
  const cliente = crearClienteBoveda({ fabricaWorker: () => worker });
  return { worker, cliente };
}

describe('cliente del worker (§9, §15.1)', () => {
  test('cada petición lleva un id correlacionado y sus datos', async () => {
    const { worker, cliente } = clienteConWorker();
    const promesa = cliente.pedir('cifrarItem', { item: { a: 1 }, contextoItem: {} });

    assert.equal(worker.enviados.length, 1);
    const { id, mensaje } = worker.enviados[0];
    assert.equal(typeof id, 'number');
    assert.equal(mensaje.tipo, 'cifrarItem');
    assert.deepEqual(mensaje.datos.item, { a: 1 });

    worker.responder(id, { ok: 'listo' });
    assert.deepEqual(await promesa, { ok: 'listo' });
  });

  test('varias peticiones en vuelo no se pisan', async () => {
    const { worker, cliente } = clienteConWorker();
    const a = cliente.pedir('estado');
    const b = cliente.pedir('bloquear');

    const [idA, idB] = worker.enviados.map((m) => m.id);
    assert.notEqual(idA, idB);

    worker.responder(idB, { desbloqueado: false });
    worker.responder(idA, { desbloqueado: true });

    assert.deepEqual(await a, { desbloqueado: true });
    assert.deepEqual(await b, { desbloqueado: false });
  });

  test('una respuesta con id desconocido se ignora', async () => {
    const { worker, cliente } = clienteConWorker();
    const promesa = cliente.pedir('estado');
    worker.responder(9999, 'basura');
    worker.responder(worker.enviados[0].id, { bien: true });
    assert.deepEqual(await promesa, { bien: true });
  });

  test('un error con código se reconstruye como ErrorBoveda', async () => {
    const { worker, cliente } = clienteConWorker();
    const promesa = cliente.pedir('cifrarItem');
    worker.fallar(worker.enviados[0].id, {
      name: 'ErrorBoveda',
      message: 'La bóveda está bloqueada',
      codigo: 'BLOQUEADA',
    });

    await assert.rejects(promesa, (error) => {
      assert.equal(error.name, 'ErrorBoveda');
      assert.equal(error.codigo, 'BLOQUEADA');
      assert.match(error.message, /bloqueada/);
      return true;
    });
  });

  test('un error sin código se reconstruye como Error genérico', async () => {
    const { worker, cliente } = clienteConWorker();
    const promesa = cliente.pedir('descifrarItem');
    worker.fallar(worker.enviados[0].id, { name: 'ErrorDescifrado', message: 'No se pudo verificar' });

    await assert.rejects(promesa, (error) => {
      assert.equal(error.name, 'ErrorDescifrado');
      assert.ok(error instanceof Error);
      return true;
    });
  });

  test('un fallo global del worker rechaza todo lo pendiente', async () => {
    const { worker, cliente } = clienteConWorker();
    const a = cliente.pedir('estado');
    const b = cliente.pedir('bloquear');

    worker.emitirError('worker caído');

    await assert.rejects(a, /worker caído/);
    await assert.rejects(b, /worker caído/);
  });

  test('destruir rechaza lo pendiente, termina el worker y bloquea más peticiones', async () => {
    const { worker, cliente } = clienteConWorker();
    const pendiente = cliente.pedir('estado');
    const enviadoAntes = worker.enviados.length;

    cliente.destruir();

    await assert.rejects(pendiente, /finalizada/);
    assert.equal(worker.esTerminado(), true);

    await assert.rejects(cliente.pedir('estado'), /destruido/);
    assert.equal(worker.enviados.length, enviadoAntes, 'no se envía nada tras destruir');

    // Doble destruir es inocuo.
    cliente.destruir();
    assert.equal(worker.esTerminado(), true);
  });

  test('los helpers del dominio apuntan al mensaje correcto', async () => {
    const { worker, cliente } = clienteConWorker();
    const pendientes = [];

    const salt = new Uint8Array(16);
    pendientes.push(cliente.desbloquear('maestra', salt, { m: 1 }));
    assert.equal(worker.enviados.at(-1).mensaje.tipo, 'desbloquear');
    assert.equal(worker.enviados.at(-1).mensaje.datos.masterPassword, 'maestra');
    assert.equal(worker.enviados.at(-1).mensaje.datos.salt, salt);

    pendientes.push(cliente.verificarMaster('maestra'));
    assert.equal(worker.enviados.at(-1).mensaje.tipo, 'verificarMaster');

    pendientes.push(cliente.abrirDEK({ a: 1 }, { vaultId: 'v' }));
    assert.equal(worker.enviados.at(-1).mensaje.tipo, 'abrirDEK');

    pendientes.push(cliente.descifrarItem({ n: 1 }, { itemId: 'i' }));
    assert.equal(worker.enviados.at(-1).mensaje.tipo, 'descifrarItem');

    // §28 / §15.1 R52: el Argon2id del export corre en el worker, así que
    // estos dos helpers tienen que apuntar a su mensaje y no a otra cosa.
    pendientes.push(cliente.crearExport({ items: [], passphrase: 'x', vaultId: 'v' }));
    assert.equal(worker.enviados.at(-1).mensaje.tipo, 'crearExport');

    pendientes.push(cliente.abrirExport({ exportacion: {}, passphrase: 'x', vaultId: 'v' }));
    assert.equal(worker.enviados.at(-1).mensaje.tipo, 'abrirExport');

    // §6.2 / §26 (Fase 5.1): el par y la compartición sólo viven en el
    // worker, así que los cuatro helpers tienen que llegar a su mensaje.
    pendientes.push(cliente.generarParAsimetrico({ vaultId: 'v', keyVersion: 1 }));
    assert.equal(worker.enviados.at(-1).mensaje.tipo, 'generarParAsimetrico');

    pendientes.push(cliente.abrirPar({ envolturas: {}, vaultId: 'v', keyVersion: 1 }));
    assert.equal(worker.enviados.at(-1).mensaje.tipo, 'abrirPar');

    pendientes.push(cliente.envolverPara({ itemId: 'i', expiresAt: 'x' }));
    assert.equal(worker.enviados.at(-1).mensaje.tipo, 'envolverPara');

    pendientes.push(cliente.abrirShare({ share: {}, publicaEmisor: new Uint8Array(32) }));
    assert.equal(worker.enviados.at(-1).mensaje.tipo, 'abrirShare');

    cliente.destruir();
    // Todas quedaron en vuelo: destruir debe rechazarlas y ninguna puede
    // quedar como rechazo sin manejar.
    const resultados = await Promise.allSettled(pendientes);
    assert.equal(resultados.every((r) => r.status === 'rejected'), true);
  });
});
