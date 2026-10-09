import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { MINIMOS_ARGON2, ARGON2, ARGON2_EXPORT } from './params.js';
import { CODIGOS, crearServicioBoveda } from './servicio.js';
import { saltAleatorio } from './kdf.js';
import { bytesAleatorios } from './random.js';
import { derivarKEKRecuperacion, desenvolverDEKsDeRecuperacion } from './recovery.js';
import { abrirExport, ErrorExport } from './exportar.js';

/** Suelo de §5.1: deriva real pero rápida. */
const PARAMS = Object.freeze({
  ...ARGON2,
  m: MINIMOS_ARGON2.m,
  t: MINIMOS_ARGON2.t,
  p: MINIMOS_ARGON2.p,
});

const MAESTRA = 'clave-maestra-de-prueba-greenline';

const CONTEXTO_DEK = Object.freeze({ vaultId: 'v-1', keyVersion: 1 });
const CONTEXTO_ITEM = Object.freeze({
  vaultId: 'v-1',
  itemId: 'i-1',
  ownerId: 'u-1',
  tenantId: 't-1',
  revision: 1,
  keyVersion: 1,
});

const ITEM = { title: 'Correo', username: 'ana@ejemplo.com', password: 'Secreta-2026!' };

async function desbloqueada() {
  const servicio = crearServicioBoveda();
  await servicio.manejar({
    tipo: 'desbloquear',
    datos: { masterPassword: MAESTRA, salt: saltAleatorio(), parametros: PARAMS },
  });
  return servicio;
}

describe('servicio de bóveda (§9, §15.1, §7)', () => {
  test('sin desbloquear, ninguna operación criptográfica pasa (§9)', async () => {
    const servicio = crearServicioBoveda();
    for (const [tipo, datos] of [
      ['cifrarItem', { item: ITEM, contextoItem: CONTEXTO_ITEM }],
      ['descifrarItem', { envoltura: {}, contextoItem: CONTEXTO_ITEM }],
      ['abrirDEK', { envoltura: {}, contexto: CONTEXTO_DEK }],
      ['verificarMaster', { masterPassword: MAESTRA }],
    ]) {
      await assert.rejects(
        servicio.manejar({ tipo, datos }),
        (e) => e.codigo === CODIGOS.bloqueada,
        `${tipo} debía rechazarse estando bloqueada`,
      );
    }
    const estado = await servicio.estado();
    assert.equal(estado.desbloqueado, false);
    assert.equal(estado.dekAbierta, false);
  });

  test('mensaje desconocido se rechaza', async () => {
    const servicio = crearServicioBoveda();
    await assert.rejects(servicio.manejar({ tipo: 'loQueSea' }), /desconocido/);
    await assert.rejects(servicio.manejar(undefined), /desconocido/);
  });

  test('desbloquear deriva y se niega a desbloquear dos veces', async () => {
    const servicio = crearServicioBoveda();
    const r1 = await servicio.manejar({
      tipo: 'desbloquear',
      datos: { masterPassword: MAESTRA, salt: saltAleatorio(), parametros: PARAMS },
    });
    assert.equal(r1.parametros.nombre, 'argon2id');
    assert.equal(r1.parametros.m, PARAMS.m);

    await assert.rejects(
      servicio.manejar({
        tipo: 'desbloquear',
        datos: { masterPassword: MAESTRA, salt: saltAleatorio(), parametros: PARAMS },
      }),
      (e) => e.codigo === CODIGOS.yaDesbloqueada,
    );
  });

  test('flujo completo: crear bóveda, descifrar, y bloquear lo apaga todo', async () => {
    const servicio = await desbloqueada();

    const creada = await servicio.manejar({
      tipo: 'crearBoveda',
      datos: { item: ITEM, contextoItem: CONTEXTO_ITEM, contextoDEK: CONTEXTO_DEK },
    });
    assert.ok(creada.dek.envoltura.ciphertext.length > 0);
    assert.equal(creada.dek.contexto.keyVersion, 1);
    assert.equal(creada.envoltura.algorithm, 'A256GCM');

    const plano = await servicio.manejar({
      tipo: 'descifrarItem',
      datos: { envoltura: creada.envoltura, contextoItem: CONTEXTO_ITEM },
    });
    const objeto = await servicio.manejar({ tipo: 'deserializarItem', datos: plano });
    assert.deepEqual(objeto, ITEM);

    // Cerrar la DEK deja la bóveda desbloqueada pero sin clave de datos.
    await servicio.manejar({ tipo: 'cerrarDEK' });
    await assert.rejects(
      servicio.manejar({
        tipo: 'cifrarItem',
        datos: { item: ITEM, contextoItem: CONTEXTO_ITEM },
      }),
      (e) => e.codigo === CODIGOS.sinDEK,
    );

    await servicio.manejar({ tipo: 'bloquear' });
    const estado = await servicio.estado();
    assert.equal(estado.desbloqueado, false);
    await assert.rejects(
      servicio.manejar({ tipo: 'descifrarItem', datos: { envoltura: creada.envoltura, contextoItem: CONTEXTO_ITEM } }),
      (e) => e.codigo === CODIGOS.bloqueada,
    );
  });

  test('no se puede crear una bóveda con la DEK ya abierta', async () => {
    const servicio = await desbloqueada();
    await servicio.manejar({
      tipo: 'crearBoveda',
      datos: { item: ITEM, contextoItem: CONTEXTO_ITEM, contextoDEK: CONTEXTO_DEK },
    });
    await assert.rejects(
      servicio.manejar({
        tipo: 'crearBoveda',
        datos: { item: ITEM, contextoItem: CONTEXTO_ITEM, contextoDEK: CONTEXTO_DEK },
      }),
      (e) => e.codigo === CODIGOS.dekAbierta,
    );
  });

  test('abrirDEK con otra keyVersion falla (key-version confusion, R10)', async () => {
    const servicio = await desbloqueada();
    const creada = await servicio.manejar({
      tipo: 'crearBoveda',
      datos: { item: ITEM, contextoItem: CONTEXTO_ITEM, contextoDEK: CONTEXTO_DEK },
    });
    await servicio.manejar({ tipo: 'cerrarDEK' });

    await assert.rejects(
      servicio.manejar({
        tipo: 'abrirDEK',
        datos: { envoltura: creada.dek.envoltura, contexto: { vaultId: 'v-1', keyVersion: 2 } },
      }),
      'la versión de clave reclamada no coincide con la autenticada',
    );

    // Y la versión correcta sí abre.
    await servicio.manejar({
      tipo: 'abrirDEK',
      datos: { envoltura: creada.dek.envoltura, contexto: CONTEXTO_DEK },
    });
    const estado = await servicio.estado();
    assert.equal(estado.dekAbierta, true);
  });

  test('SPlicing entre items de la misma bóveda falla (§8.1)', async () => {
    const servicio = await desbloqueada();
    await servicio.manejar({
      tipo: 'crearBoveda',
      datos: { item: ITEM, contextoItem: CONTEXTO_ITEM, contextoDEK: CONTEXTO_DEK },
    });

    const segundo = await servicio.manejar({
      tipo: 'cifrarItem',
      datos: {
        item: { title: 'Banco', password: 'Otra-Secreta' },
        contextoItem: { ...CONTEXTO_ITEM, itemId: 'i-2' },
      },
    });

    // El ciphertext de i-2 pegado en la fila de i-1 no debe abrirse.
    await assert.rejects(
      servicio.manejar({
        tipo: 'descifrarItem',
        datos: { envoltura: segundo, contextoItem: CONTEXTO_ITEM },
      }),
      'el AAD liga el ciphertext a su itemId',
    );
  });

  test('REPLAY de revisión con la misma bóveda falla (§8.3)', async () => {
    const servicio = await desbloqueada();
    await servicio.manejar({
      tipo: 'crearBoveda',
      datos: { item: ITEM, contextoItem: CONTEXTO_ITEM, contextoDEK: CONTEXTO_DEK },
    });

    const actual = await servicio.manejar({
      tipo: 'cifrarItem',
      datos: { item: { v: 2 }, contextoItem: { ...CONTEXTO_ITEM, revision: 2 } },
    });
    await servicio.manejar({
      tipo: 'descifrarItem',
      datos: { envoltura: actual, contextoItem: { ...CONTEXTO_ITEM, revision: 2 } },
    });
    await assert.rejects(
      servicio.manejar({
        tipo: 'descifrarItem',
        datos: { envoltura: actual, contextoItem: { ...CONTEXTO_ITEM, revision: 1 } },
      }),
      'revisión rebobinada',
    );
  });

  test('verificarMaster (step-up §13) distingue la maestra correcta', async () => {
    const servicio = await desbloqueada();

    const ok = await servicio.manejar({
      tipo: 'verificarMaster',
      datos: { masterPassword: MAESTRA },
    });
    assert.equal(ok.correcta, true);

    const mal = await servicio.manejar({
      tipo: 'verificarMaster',
      datos: { masterPassword: `${MAESTRA}x` },
    });
    assert.equal(mal.correcta, false, 'nunca lanza: devuelve false');

    await assert.rejects(
      servicio.manejar({ tipo: 'verificarMaster', datos: { masterPassword: '' } }),
      /vacía/,
    );
  });

  test('verificarMaster no cambia el estado de desbloqueo', async () => {
    const servicio = await desbloqueada();
    await servicio.manejar({ tipo: 'verificarMaster', datos: { masterPassword: MAESTRA } });
    const estado = await servicio.estado();
    assert.equal(estado.desbloqueado, true);
    assert.equal(estado.dekAbierta, false);
  });

  test('la DEK generada no aparece en el resultado de crearBoveda', async () => {
    const servicio = await desbloqueada();
    const creada = await servicio.manejar({
      tipo: 'crearBoveda',
      datos: { item: ITEM, contextoItem: CONTEXTO_ITEM, contextoDEK: CONTEXTO_DEK },
    });
    const serializado = JSON.stringify(creada, (k, v) =>
      v instanceof Uint8Array ? Array.from(v).slice(0, 0) : v,
    );
    // Ni la DEK ni el plaintext del item pueden reconstruirse desde lo que
    // el worker devuelve para almacenar.
    assert.equal(serializado.includes(ITEM.password), false);
    assert.equal(Object.prototype.hasOwnProperty.call(creada, 'dek') && typeof creada.dek.clave !== 'undefined', false);
    assert.equal(typeof creada.dek.envoltura, 'object');
  });
});

// ---------------------------------------------------------------------------
// Fase 4 — §25 recuperación y §27 cambio de maestra, dentro del worker.
// ---------------------------------------------------------------------------

async function conBovedaCreada() {
  const servicio = crearServicioBoveda();
  const salt = saltAleatorio();
  await servicio.manejar({
    tipo: 'desbloquear',
    datos: { masterPassword: MAESTRA, salt, parametros: PARAMS },
  });
  const creada = await servicio.manejar({
    tipo: 'crearBoveda',
    datos: { item: ITEM, contextoItem: CONTEXTO_ITEM, contextoDEK: CONTEXTO_DEK },
  });
  return { servicio, salt, creada };
}

describe('Fase 4 §27 — cambio de maestra en el worker', () => {
  test('reenvuelve con la maestra nueva y la vieja deja de servir', async () => {
    const { salt, creada } = await conBovedaCreada();
    const saltNuevo = saltAleatorio();
    const NUEVA = 'otra-frase-maestra-completamente-distinta';

    const r = await (async () => {
      const s = crearServicioBoveda();
      await s.manejar({ tipo: 'desbloquear', datos: { masterPassword: MAESTRA, salt, parametros: PARAMS } });
      return s.manejar({
        tipo: 'cambiarMasterPassword',
        datos: {
          masterActual: MAESTRA,
          masterNueva: NUEVA,
          vaultId: 'v-1',
          salt: saltNuevo,
          parametros: PARAMS,
          envolturas: [{ keyVersion: 1, envoltura: creada.dek.envoltura, contexto: CONTEXTO_DEK }],
        },
      });
    })();

    assert.deepEqual(r.salt, saltNuevo);
    assert.equal(r.claves.length, 1);
    assert.equal(r.claves[0].keyVersion, 1);
    // El envoltorio cambió: no se reutiliza el nonce ni el ciphertext.
    assert.notDeepEqual(r.claves[0].envoltura.nonce, creada.dek.envoltura.nonce);

    // Con la maestra NUEVA sí se abre…
    const nueva = crearServicioBoveda();
    await nueva.manejar({ tipo: 'desbloquear', datos: { masterPassword: NUEVA, salt: saltNuevo, parametros: PARAMS } });
    await nueva.manejar({ tipo: 'abrirDEK', datos: { envoltura: r.claves[0].envoltura, contexto: CONTEXTO_DEK } });
    const descifrado = await nueva.manejar({
      tipo: 'descifrarItem',
      datos: { envoltura: creada.envoltura, contextoItem: CONTEXTO_ITEM },
    });
    assert.deepEqual(await nueva.manejar({ tipo: 'deserializarItem', datos: descifrado }), ITEM);

    // …y con la VIEJA ya no.
    const vieja = crearServicioBoveda();
    await vieja.manejar({ tipo: 'desbloquear', datos: { masterPassword: MAESTRA, salt, parametros: PARAMS } });
    await assert.rejects(
      vieja.manejar({ tipo: 'abrirDEK', datos: { envoltura: r.claves[0].envoltura, contexto: CONTEXTO_DEK } }),
    );
  });

  test('R118 — sin la maestra actual correcta no hay cambio', async () => {
    const { salt, creada } = await conBovedaCreada();
    const servicio = crearServicioBoveda();
    await servicio.manejar({ tipo: 'desbloquear', datos: { masterPassword: MAESTRA, salt, parametros: PARAMS } });

    await assert.rejects(
      servicio.manejar({
        tipo: 'cambiarMasterPassword',
        datos: {
          masterActual: 'una-clave-que-no-es',
          masterNueva: 'otra-frase-maestra-completamente-distinta',
          vaultId: 'v-1',
          salt: saltAleatorio(),
          parametros: PARAMS,
          envolturas: [{ keyVersion: 1, envoltura: creada.dek.envoltura, contexto: CONTEXTO_DEK }],
        },
      }),
      (e) => e.codigo === CODIGOS.masterIncorrecta,
    );
  });

  test('estando bloqueada, se niega lo que exige la KEK vigente (§9)', async () => {
    const servicio = crearServicioBoveda();
    await assert.rejects(
      servicio.manejar({
        tipo: 'cambiarMasterPassword',
        datos: { masterActual: MAESTRA, masterNueva: 'x-y-z-abcdefghijklmnop', vaultId: 'v-1', salt: saltAleatorio(), parametros: PARAMS, envolturas: [] },
      }),
      (e) => e.codigo === CODIGOS.bloqueada,
    );
    // `activarRecuperacion` necesita la KEK vigente para abrir las DEKs…
    await assert.rejects(
      servicio.manejar({ tipo: 'activarRecuperacion', datos: { recoveryKey: new Uint8Array(32), salt: saltAleatorio(), vaultId: 'v-1', envolturas: [] } }),
      (e) => e.codigo === CODIGOS.bloqueada,
    );
    // …pero `usarRecuperacion` NO: es justamente lo que se ejecuta cuando
    // la maestra se perdió. Con envolturas vacías falla por eso, no por
    // estar bloqueada — y eso es deliberado (§25).
    await assert.rejects(
      servicio.manejar({ tipo: 'usarRecuperacion', datos: { recoveryKey: new Uint8Array(32), salt: saltAleatorio(), vaultId: 'v-1', masterNueva: 'x', saltNuevo: saltAleatorio(), parametros: PARAMS, envolturas: [] } }),
      (e) => e.codigo !== CODIGOS.bloqueada,
    );
  });
});

describe('Fase 4 §25 — recuperación en el worker', () => {
  test('R106: activar devuelve envolturas que sólo abre la recovery key', async () => {
    const { salt, creada } = await conBovedaCreada();
    const servicio = crearServicioBoveda();
    await servicio.manejar({ tipo: 'desbloquear', datos: { masterPassword: MAESTRA, salt, parametros: PARAMS } });

    const recoveryKey = new Uint8Array(32).fill(7);
    const activada = await servicio.manejar({
      tipo: 'activarRecuperacion',
      datos: { recoveryKey, salt, vaultId: 'v-1', envolturas: [{ keyVersion: 1, envoltura: creada.dek.envoltura }] },
    });

    assert.equal(activada.envolturas.length, 1);
    assert.notDeepEqual(activada.envolturas[0].envoltura.nonce, creada.dek.envoltura.nonce);

    // La recovery key deriva la KEK que abre esas envolturas…
    const kekRec = derivarKEKRecuperacion(recoveryKey, salt);
    const abiertas = await desenvolverDEKsDeRecuperacion(kekRec, activada.envolturas, 'v-1');
    assert.equal(abiertas.length, 1);

    // …y esa DEK descifra el item original: es la MISMA clave.
    const { descifrar } = await import('./aead.js');
    const texto = await descifrar(abiertas[0].dek, creada.envoltura, CONTEXTO_ITEM);
    assert.deepEqual(JSON.parse(new TextDecoder().decode(texto)), ITEM);

    // Una recovery key distinta no abre nada.
    const otraKek = derivarKEKRecuperacion(new Uint8Array(32).fill(9), salt);
    await assert.rejects(() => desenvolverDEKsDeRecuperacion(otraKek, activada.envolturas, 'v-1'));
  });

  test('R109: usarRecuperacion re-bajo una maestra nueva y descifra', async () => {
    const { salt, creada } = await conBovedaCreada();
    const servicio = crearServicioBoveda();
    await servicio.manejar({ tipo: 'desbloquear', datos: { masterPassword: MAESTRA, salt, parametros: PARAMS } });

    const recoveryKey = new Uint8Array(32).fill(7);
    const activada = await servicio.manejar({
      tipo: 'activarRecuperacion',
      datos: { recoveryKey, salt, vaultId: 'v-1', envolturas: [{ keyVersion: 1, envoltura: creada.dek.envoltura }] },
    });

    const saltNuevo = saltAleatorio();
    const NUEVA = 'frase-nueva-tras-la-recuperacion-1234';
    const r = await servicio.manejar({
      tipo: 'usarRecuperacion',
      datos: {
        recoveryKey,
        salt,
        vaultId: 'v-1',
        masterNueva: NUEVA,
        saltNuevo,
        parametros: PARAMS,
        envolturas: activada.envolturas,
      },
    });

    assert.equal(r.claves.length, 1);
    assert.notDeepEqual(r.claves[0].envoltura.nonce, activada.envolturas[0].envoltura.nonce);

    const nueva = crearServicioBoveda();
    await nueva.manejar({ tipo: 'desbloquear', datos: { masterPassword: NUEVA, salt: saltNuevo, parametros: PARAMS } });
    await nueva.manejar({ tipo: 'abrirDEK', datos: { envoltura: r.claves[0].envoltura, contexto: CONTEXTO_DEK } });
    const descifrado = await nueva.manejar({
      tipo: 'descifrarItem',
      datos: { envoltura: creada.envoltura, contextoItem: CONTEXTO_ITEM },
    });
    assert.deepEqual(await nueva.manejar({ tipo: 'deserializarItem', datos: descifrado }), ITEM);
  });
});

// ---------------------------------------------------------------------------
// Fase 4 — §28 el export se arma en el worker: el Argon2id de 64 MiB no
// puede congelar el hilo principal (§15.1 R52).
// ---------------------------------------------------------------------------

describe('Fase 4 §28 — export e import en el worker', () => {
  test('exporta e import en el worker', async () => {
    const { servicio, creada } = await conBovedaCreada();

    // El pipeline del UI: descifrar (worker) y recoger los datos en claro.
    const cifrado = await servicio.manejar({
      tipo: 'descifrarItem',
      datos: { envoltura: creada.envoltura, contextoItem: CONTEXTO_ITEM },
    });
    const datos = await servicio.manejar({ tipo: 'deserializarItem', datos: cifrado });
    assert.deepEqual(datos, ITEM);

    const passphrase = 'passphrase-de-prueba-para-el-export-0123456789';
    const fichero = await servicio.manejar({
      tipo: 'crearExport',
      datos: {
        items: [datos],
        passphrase,
        vaultId: 'v-1',
        creadoEn: '2026-09-29T12:00:00.000Z',
        // Suelo de §5.1: el worker usa los parámetros por defecto en
        // producción; aquí sólo bajamos el coste para que el test no tarde.
        parametros: { ...ARGON2_EXPORT, m: 19456, t: 2, p: 1 },
      },
    });

    assert.equal(fichero.item_count, 1);
    // Ni el contenido ni la passphrase van dentro del fichero: lo único en
    // claro es la cabecera pública de §28.1 (kdf/cipher/nonces).
    assert.deepEqual(Object.keys(fichero), [
      'format', 'format_version', 'created_at', 'item_count',
      'kdf', 'cipher', 'nonce', 'aad', 'ciphertext', 'mac',
    ]);
    const bruto = JSON.stringify(fichero);
    assert.equal(bruto.includes(ITEM.password), false);
    assert.equal(bruto.includes(passphrase), false);

    const abierto = await abrirExport({ exportacion: fichero, passphrase, vaultId: 'v-1' });
    assert.equal(abierto.length, 1);
    assert.deepEqual(abierto[0], ITEM);

    // Otra passphrase no abre nada, y el fallo no se filtra: ni el secreto
    // ni la propia passphrase aparecen en el mensaje (§28.1 R121).
    await assert.rejects(
      () => abrirExport({ exportacion: fichero, passphrase: 'otra-passphrase-distinta-0123', vaultId: 'v-1' }),
      (e) => !e.message.includes(ITEM.password) && !e.message.includes('otra-passphrase'),
    );
  });

  test('argumentos vacíos: falla con ErrorExport antes de tocar Argon2 (§28.1)', async () => {
    const servicio = crearServicioBoveda();
    await assert.rejects(
      () => servicio.manejar({ tipo: 'crearExport', datos: {} }),
      ErrorExport,
    );
  });

  // El test de arriba usa el import directo de `exportar.js`; este entra
  // por la tabla de manejadores del worker, que es lo que usa la página.
  // Si la clave del dispatch no coincide, aquí sale «Mensaje desconocido».
  test('abrirExport entra por el despachador del worker (R52)', async () => {
    const { servicio, creada } = await conBovedaCreada();
    const cifrado = await servicio.manejar({
      tipo: 'descifrarItem',
      datos: { envoltura: creada.envoltura, contextoItem: CONTEXTO_ITEM },
    });
    const datos = await servicio.manejar({ tipo: 'deserializarItem', datos: cifrado });

    const passphrase = 'passphrase-para-el-despachador-0123456789';
    const fichero = await servicio.manejar({
      tipo: 'crearExport',
      datos: {
        items: [datos],
        passphrase,
        vaultId: 'v-1',
        parametros: { ...ARGON2_EXPORT, m: 19456, t: 2, p: 1 },
      },
    });

    const abierto = await servicio.manejar({
      tipo: 'abrirExport',
      datos: { exportacion: fichero, passphrase, vaultId: 'v-1' },
    });
    assert.equal(abierto.length, 1);
    assert.deepEqual(abierto[0], ITEM);

    // El fallo también pasa por el despachador. Con un fichero bien
    // formado y la passphrase equivocada el error es el AEAD genérico de
    // §8, no uno propio del export: ni el secreto ni la passphrase se
    // filtran ni se distingue de un fichero manipulado (§28.1 R121).
    await assert.rejects(
      () =>
        servicio.manejar({
          tipo: 'abrirExport',
          datos: {
            exportacion: fichero,
            passphrase: 'otra-passphrase-distinta-0123',
            vaultId: 'v-1',
          },
        }),
      (e) =>
        e.name === 'ErrorDescifrado' &&
        !e.message.includes(ITEM.password) &&
        !e.message.includes('otra-passphrase'),
    );
  });

  // §15.1 R52: ni crearExport ni abrirExport tocan la KEK ni la DEK, sólo
  // los datos que les llegan y la passphrase de export. Fijado aquí para
  // que nadie les ponga `exigirDesbloqueada()` sin darse cuenta de que
  // rompería el flujo de importación.
  test('export e import no exigen desbloqueo y no abren la bóveda', async () => {
    const servicio = crearServicioBoveda();
    const passphrase = 'passphrase-sin-desbloquear-0123456789';
    const fichero = await servicio.manejar({
      tipo: 'crearExport',
      datos: {
        items: [{ ...ITEM }],
        passphrase,
        vaultId: 'v-1',
        parametros: { ...ARGON2_EXPORT, m: 19456, t: 2, p: 1 },
      },
    });
    const abierto = await servicio.manejar({
      tipo: 'abrirExport',
      datos: { exportacion: fichero, passphrase, vaultId: 'v-1' },
    });
    assert.deepEqual(abierto, [{ ...ITEM }]);

    // Abrir el fichero no ha desbloqueado nada: la bóveda sigue cerrada.
    const estado = await servicio.estado();
    assert.equal(estado.desbloqueado, false);
    assert.equal(estado.dekAbierta, false);
  });

  // Cada nombre que `cliente.js` manda con `pedir(...)` debe existir en la
  // tabla de manejadores: un typo ahí sólo estallaría en el navegador.
  test('los mensajes de Fase 4 están registrados en el despachador', async () => {
    const servicio = crearServicioBoveda();
    for (const tipo of [
      'cambiarMasterPassword',
      'activarRecuperacion',
      'usarRecuperacion',
      'crearExport',
      'abrirExport',
      // --- Fase 3 §11 (KEK por usuario) ---
      'migrarClaveUsuario',
      'reenvolverConPassword',
      'reenvolverDesdeRecuperacion',
      // --- Fase 5.1 ---
      'generarParAsimetrico',
      'abrirPar',
      'envolverPara',
      'abrirShare',
    ]) {
      await assert.rejects(
        servicio.manejar({ tipo, datos: {} }),
        (e) => !/desconocido/i.test(String(e?.message)),
        `${tipo} no está en la tabla de manejadores`,
      );
    }
  });
});

describe('Fase 5.1 — par asimétrico y compartición (§6.2, §26)', () => {
  const CONTEXTO_PAR = { vaultId: 'v-1', keyVersion: 1 };
  const EXPIRA = new Date(Date.now() + 3_600_000).toISOString();

  test('generarParAsimetrico exige desbloqueo y no deja privadas fuera', async () => {
    const bloqueada = crearServicioBoveda();
    await assert.rejects(
      bloqueada.manejar({ tipo: 'generarParAsimetrico', datos: CONTEXTO_PAR }),
      (e) => e.codigo === CODIGOS.bloqueada,
    );

    const servicio = await desbloqueada();
    const par = await servicio.manejar({ tipo: 'generarParAsimetrico', datos: CONTEXTO_PAR });

    assert.deepEqual(Object.keys(par.firma).sort(), ['envoltura', 'publica'], 'sólo envoltura + pública (R7)');
    assert.deepEqual(Object.keys(par.canje).sort(), ['envoltura', 'publica']);
    assert.equal(par.firma.publica.length, 32);
    assert.equal(par.canje.publica.length, 32);
    assert.ok(par.firma.envoltura.ciphertext.length > 0);

    // Ni por estructura ni por JSON escapa material privado (R6).
    assert.equal(JSON.stringify(par).includes('privada'), false);
    await assert.rejects(
      servicio.manejar({ tipo: 'generarParAsimetrico', datos: { vaultId: 'v-1' } }),
      /keyVersion/,
    );
  });

  test('el par se abre, se usa y desaparece al bloquear (R6)', async () => {
    const servicio = await desbloqueada();
    const envueltas = await servicio.manejar({ tipo: 'generarParAsimetrico', datos: CONTEXTO_PAR });

    await assert.rejects(
      servicio.manejar({ tipo: 'abrirShare', datos: {} }),
      (e) => e.codigo === CODIGOS.sinPar,
      'sin par abierto no se comparte nada',
    );

    const abierta = await servicio.manejar({
      tipo: 'abrirPar',
      datos: { envolturas: envueltas, ...CONTEXTO_PAR },
    });
    assert.equal(abierta.publicas.firma.length, 32);
    assert.equal(abierta.publicas.canje.length, 32);

    await servicio.manejar({ tipo: 'bloquear' });
    await servicio.manejar({ tipo: 'desbloquear', datos: { masterPassword: MAESTRA, salt: saltAleatorio(), parametros: PARAMS } });
    await assert.rejects(
      servicio.manejar({ tipo: 'abrirShare', datos: {} }),
      (e) => e.codigo === CODIGOS.sinPar,
      'al bloquear el par se borra de memoria',
    );
  });

  test('R114: una fila cuyas públicas no corresponden a las privadas se rechaza', async () => {
    const servicio = await desbloqueada();
    const envueltas = await servicio.manejar({ tipo: 'generarParAsimetrico', datos: CONTEXTO_PAR });
    const alterada = { ...envueltas, canje: { ...envueltas.canje, publica: bytesAleatorios(32) } };

    await assert.rejects(
      servicio.manejar({ tipo: 'abrirPar', datos: { envolturas: alterada, ...CONTEXTO_PAR } }),
      /no corresponden/,
    );
    // Y no queda a medio abrir: sigue sin par.
    await assert.rejects(
      servicio.manejar({ tipo: 'abrirShare', datos: {} }),
      (e) => e.codigo === CODIGOS.sinPar,
    );
  });

  test('A comparte un ítem con B y B lo recibe sin tocar la DEK de A (§26)', async () => {
    // A: dueña del ítem, con su par y su KEK.
    const duenya = await desbloqueada();
    const creada = await duenya.manejar({
      tipo: 'crearBoveda',
      datos: { item: ITEM, contextoItem: CONTEXTO_ITEM, contextoDEK: CONTEXTO_DEK },
    });
    const parA = await duenya.manejar({ tipo: 'generarParAsimetrico', datos: CONTEXTO_PAR });
    await duenya.manejar({ tipo: 'abrirPar', datos: { envolturas: parA, ...CONTEXTO_PAR } });

    // B: otro usuario, otra máquina, otro salt → otra KEK.
    const receptora = await desbloqueada();
    const parB = await receptora.manejar({ tipo: 'generarParAsimetrico', datos: CONTEXTO_PAR });
    await receptora.manejar({ tipo: 'abrirPar', datos: { envolturas: parB, ...CONTEXTO_PAR } });

    const share = await duenya.manejar({
      tipo: 'envolverPara',
      datos: {
        envolturaItem: creada.envoltura,
        contextoItem: CONTEXTO_ITEM,
        clavePublicaReceptor: parB.canje.publica,
        emisor: 'u-1',
        receptor: 'u-2',
        expiresAt: EXPIRA,
      },
    });
    assert.equal(share.receptor, 'u-2');
    assert.equal(share.expiresAt, EXPIRA);
    assert.ok(share.firma instanceof Uint8Array);
    assert.equal(JSON.stringify({ ...share, payload: {}, wrappedKey: {} }).includes('Secreta-2026'), false);

    // A no puede abrir lo que compartió: la fila es de B (R114).
    await assert.rejects(
      duenya.manejar({ tipo: 'abrirShare', datos: { share, publicaEmisor: parA.firma.publica } }),
      (e) => e.name === 'ErrorComparticion' && e.codigo === 'RECEPTOR_INCORRECTO',
    );

    const abierto = await receptora.manejar({
      tipo: 'abrirShare',
      datos: { share, publicaEmisor: parA.firma.publica },
    });
    const objeto = await receptora.manejar({ tipo: 'deserializarItem', datos: abierto.datos });
    assert.deepEqual(objeto, ITEM);

    // Revocado: el servidor ya no lo sirve y el worker lo corta (R112).
    await assert.rejects(
      receptora.manejar({ tipo: 'abrirShare', datos: { share, publicaEmisor: parA.firma.publica, revocado: true } }),
      (e) => e.name === 'ErrorComparticion' && e.codigo === 'REVOCADA',
    );
  });

  test('sin DEK abierta no se puede compartir (el snapshot sale de la DEK)', async () => {
    const servicio = await desbloqueada();
    const par = await servicio.manejar({ tipo: 'generarParAsimetrico', datos: CONTEXTO_PAR });
    await servicio.manejar({ tipo: 'abrirPar', datos: { envolturas: par, ...CONTEXTO_PAR } });
    await assert.rejects(
      servicio.manejar({
        tipo: 'envolverPara',
        datos: {
          envolturaItem: {},
          contextoItem: CONTEXTO_ITEM,
          clavePublicaReceptor: par.canje.publica,
          emisor: 'u-1',
          receptor: 'u-2',
          expiresAt: EXPIRA,
        },
      }),
      (e) => e.codigo === CODIGOS.sinDEK,
    );
  });

  test('§27: cambiar la maestra reenvuelve también el par asimétrico (R120)', async () => {
    const { salt, creada } = await conBovedaCreada();
    const NUEVA = 'otra-frase-maestra-completamente-distinta';
    const saltNuevo = saltAleatorio();

    const vieja = crearServicioBoveda();
    await vieja.manejar({ tipo: 'desbloquear', datos: { masterPassword: MAESTRA, salt, parametros: PARAMS } });
    const par = await vieja.manejar({ tipo: 'generarParAsimetrico', datos: CONTEXTO_PAR });
    const filaPar = {
      firma: { keyVersion: 1, envoltura: par.firma.envoltura, publica: par.firma.publica },
      canje: { keyVersion: 1, envoltura: par.canje.envoltura, publica: par.canje.publica },
    };

    const r = await vieja.manejar({
      tipo: 'cambiarMasterPassword',
      datos: {
        masterActual: MAESTRA,
        masterNueva: NUEVA,
        vaultId: 'v-1',
        salt: saltNuevo,
        parametros: PARAMS,
        envolturas: [{ keyVersion: 1, envoltura: creada.dek.envoltura, contexto: CONTEXTO_DEK }],
        parAsimetrico: filaPar,
      },
    });

    assert.ok(r.parAsimetrico, 'el par vuelve reenvuelto');
    assert.notDeepEqual(r.parAsimetrico.firma.envoltura.nonce, filaPar.firma.envoltura.nonce);
    assert.notDeepEqual(r.parAsimetrico.canje.envoltura.nonce, filaPar.canje.envoltura.nonce);
    // La pública no cambia: sólo se rota quién protege la privada (R9).
    assert.deepEqual(r.parAsimetrico.firma.publica, filaPar.firma.publica);
    assert.equal(r.parAsimetrico.firma.keyVersion, 1);

    // Con la maestra NUEVA el par abre y las públicas cuadran…
    const nueva = crearServicioBoveda();
    await nueva.manejar({ tipo: 'desbloquear', datos: { masterPassword: NUEVA, salt: saltNuevo, parametros: PARAMS } });
    const abierta = await nueva.manejar({
      tipo: 'abrirPar',
      datos: { envolturas: r.parAsimetrico, ...CONTEXTO_PAR },
    });
    assert.deepEqual(abierta.publicas.firma, filaPar.firma.publica);

    // …y con la VIEJA ya no: no queda ninguna ventana de doble acceso.
    const antes = crearServicioBoveda();
    await antes.manejar({ tipo: 'desbloquear', datos: { masterPassword: MAESTRA, salt, parametros: PARAMS } });
    await assert.rejects(
      antes.manejar({ tipo: 'abrirPar', datos: { envolturas: r.parAsimetrico, ...CONTEXTO_PAR } }),
    );
  });
});

// ---------------------------------------------------------------------------
// Fase 3 §11 — la DEK pasa a estar envuelta bajo la CONTRASEÑA DE PANEL de
// cada usuario (KEK por usuario). El salt y los parámetros NO rotan: son
// los de la bóveda, compartidos por todos los miembros.
// ---------------------------------------------------------------------------

describe('Fase 3 §11 — KEK por usuario (contraseña de panel)', () => {
  const PANEL = 'Panel-Passw0rd-2026!';

  test('migrarClaveUsuario reenvuelve la DEK y el step-up pasa a la contraseña de panel', async () => {
    const { salt, creada } = await conBovedaCreada();
    const servicio = crearServicioBoveda();
    await servicio.manejar({
      tipo: 'desbloquear',
      datos: { masterPassword: MAESTRA, salt, parametros: PARAMS },
    });
    // La DEK se abre antes de migrar: es lo que hace el UI al desbloquear
    // (abrirDEK con la fila legado y DESPUÉS re-envolver).
    await servicio.manejar({
      tipo: 'abrirDEK',
      datos: { envoltura: creada.dek.envoltura, contexto: CONTEXTO_DEK },
    });

    const r = await servicio.manejar({ tipo: 'migrarClaveUsuario', datos: { passwordUsuario: PANEL } });
    assert.equal(r.contexto.keyVersion, CONTEXTO_DEK.keyVersion);
    // Otro envoltorio (nonce nuevo): es otra KEK bajo el MISMO salt.
    assert.notDeepEqual(r.envoltura.nonce, creada.dek.envoltura.nonce);

    // El material del worker ya es el de la contraseña de panel: el step-up
    // (§13) no vuelve a pedir la maestra legado.
    const ok = await servicio.manejar({ tipo: 'verificarMaster', datos: { masterPassword: PANEL } });
    assert.equal(ok.correcta, true);
    const mal = await servicio.manejar({ tipo: 'verificarMaster', datos: { masterPassword: MAESTRA } });
    assert.equal(mal.correcta, false);

    // La fila nueva se abre con la contraseña de panel…
    const nueva = crearServicioBoveda();
    await nueva.manejar({ tipo: 'desbloquear', datos: { masterPassword: PANEL, salt, parametros: PARAMS } });
    await nueva.manejar({ tipo: 'abrirDEK', datos: { envoltura: r.envoltura, contexto: r.contexto } });
    const descifrado = await nueva.manejar({
      tipo: 'descifrarItem',
      datos: { envoltura: creada.envoltura, contextoItem: CONTEXTO_ITEM },
    });
    assert.deepEqual(await nueva.manejar({ tipo: 'deserializarItem', datos: descifrado }), ITEM);

    // …y NO con la maestra legado.
    const vieja = crearServicioBoveda();
    await vieja.manejar({ tipo: 'desbloquear', datos: { masterPassword: MAESTRA, salt, parametros: PARAMS } });
    await assert.rejects(
      vieja.manejar({ tipo: 'abrirDEK', datos: { envoltura: r.envoltura, contexto: r.contexto } }),
    );
  });

  test('migrarClaveUsuario exige la bóveda desbloqueada (§9)', async () => {
    const servicio = crearServicioBoveda();
    await assert.rejects(
      servicio.manejar({ tipo: 'migrarClaveUsuario', datos: { passwordUsuario: PANEL } }),
      (e) => e.codigo === CODIGOS.bloqueada,
    );
  });

  test('reenvolverConPassword no exige desbloqueo y sólo devuelve la envoltura', async () => {
    const { salt, creada } = await conBovedaCreada();
    const servicio = crearServicioBoveda(); // nunca desbloqueado

    const r = await servicio.manejar({
      tipo: 'reenvolverConPassword',
      datos: {
        passwordActual: MAESTRA,
        passwordNueva: PANEL,
        salt,
        parametros: PARAMS,
        envoltura: creada.dek.envoltura,
        contexto: CONTEXTO_DEK,
      },
    });
    assert.notDeepEqual(r.envoltura.nonce, creada.dek.envoltura.nonce);

    // El paso de cambio de contraseña NO desbloquea la bóveda para nada.
    const estado = await servicio.estado();
    assert.equal(estado.desbloqueado, false);
    assert.equal(estado.dekAbierta, false);

    // Abre con la contraseña nueva…
    const nueva = crearServicioBoveda();
    await nueva.manejar({ tipo: 'desbloquear', datos: { masterPassword: PANEL, salt, parametros: PARAMS } });
    await nueva.manejar({ tipo: 'abrirDEK', datos: { envoltura: r.envoltura, contexto: CONTEXTO_DEK } });

    // …y con la vieja no.
    const vieja = crearServicioBoveda();
    await vieja.manejar({ tipo: 'desbloquear', datos: { masterPassword: MAESTRA, salt, parametros: PARAMS } });
    await assert.rejects(
      vieja.manejar({ tipo: 'abrirDEK', datos: { envoltura: r.envoltura, contexto: CONTEXTO_DEK } }),
    );
  });

  test('reenvolverConPassword con la contraseña actual equivocada no produce nada (R120)', async () => {
    const { salt, creada } = await conBovedaCreada();
    const servicio = crearServicioBoveda();
    // La contraseña vieja no abre el envoltorio (fallo AEAD de §7) o, en
    // cualquier caso, la muestra R120 de la envoltura nueva no llega a
    // devolverse: nunca sale una envoltura "re-envuelta" con datos malos.
    await assert.rejects(
      servicio.manejar({
        tipo: 'reenvolverConPassword',
        datos: {
          passwordActual: 'esta-no-es-la-contraseña',
          passwordNueva: PANEL,
          salt,
          parametros: PARAMS,
          envoltura: creada.dek.envoltura,
          contexto: CONTEXTO_DEK,
        },
      }),
    );
  });

  test('reenvolverDesdeRecuperacion funciona sin desbloquear y sin rotar el salt', async () => {
    const { salt, creada } = await conBovedaCreada();
    const recoveryKey = new Uint8Array(32).fill(7);

    // Activa la recovery key (dueño, con la maestra legado todavía).
    const activa = crearServicioBoveda();
    await activa.manejar({
      tipo: 'desbloquear',
      datos: { masterPassword: MAESTRA, salt, parametros: PARAMS },
    });
    const activada = await activa.manejar({
      tipo: 'activarRecuperacion',
      datos: { recoveryKey, salt, vaultId: 'v-1', envolturas: [{ keyVersion: 1, envoltura: creada.dek.envoltura }] },
    });

    // Se ejecuta en una sesión BLOQUEADA: es lo que corre cuando la
    // contraseña de panel se olvidó y sólo queda la recovery key.
    const servicio = crearServicioBoveda();
    const r = await servicio.manejar({
      tipo: 'reenvolverDesdeRecuperacion',
      datos: {
        recoveryKey,
        salt,
        vaultId: 'v-1',
        passwordUsuario: PANEL,
        parametros: PARAMS,
        envolturas: activada.envolturas,
      },
    });
    assert.equal(r.envolturas.length, 1);
    assert.notDeepEqual(r.envolturas[0].envoltura.nonce, activada.envolturas[0].envoltura.nonce);
    const estado = await servicio.estado();
    assert.equal(estado.desbloqueado, false);

    // MISMO salt (no rota: los demás miembros siguen derivando con él) y la
    // DEK se abre con la contraseña de panel.
    const nueva = crearServicioBoveda();
    await nueva.manejar({ tipo: 'desbloquear', datos: { masterPassword: PANEL, salt, parametros: PARAMS } });
    await nueva.manejar({
      tipo: 'abrirDEK',
      datos: { envoltura: r.envolturas[0].envoltura, contexto: CONTEXTO_DEK },
    });
    const descifrado = await nueva.manejar({
      tipo: 'descifrarItem',
      datos: { envoltura: creada.envoltura, contextoItem: CONTEXTO_ITEM },
    });
    assert.deepEqual(await nueva.manejar({ tipo: 'deserializarItem', datos: descifrado }), ITEM);
  });
});
