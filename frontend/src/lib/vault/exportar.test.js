import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  abrirExport,
  construirAADExport,
  crearExport,
  detalleAuditoriaExport,
  ErrorExport,
  generarPassphraseExport,
  puedeExportar,
} from './exportar.js';
import { AEAD, ARGON2_EXPORT, FORMATO_EXPORT, MAX_EXPORTS_POR_HORA, VERSION_EXPORT } from './params.js';

const VAULT = '11111111-1111-4111-8111-111111111111';
/** Suelo de §5.1: los tests no necesitan 64 MiB, pero tampoco pueden
 *  bajar del mínimo que la spec prohíbe. */
const PARAMS_TEST = { ...ARGON2_EXPORT, m: 19456, t: 2, p: 1 };

const ITEMS = [
  { id: 'a', tipo: 'password', usuario: 'ana', secreto: 'hunter2' },
  { id: 'b', tipo: 'nota', contenido: 'renewal key 0xDEADBEEF' },
];

describe('export §28.1 — R121 passphrase propia', () => {
  it('genera una passphrase aleatoria de 256 bits', () => {
    const a = generarPassphraseExport();
    const b = generarPassphraseExport();
    assert.notEqual(a, b);
    assert.ok(a.length >= 40, `demasiado corta: ${a.length}`);
  });

  it('rechaza passphrases cortas', async () => {
    await assert.rejects(
      () => crearExport({ items: ITEMS, passphrase: 'corta', vaultId: VAULT, parametros: PARAMS_TEST }),
      ErrorExport,
    );
  });
});

describe('export §28.1 — formato', () => {
  it('produce exactamente el esquema de §28.1', async () => {
    const exportacion = await crearExport({
      items: ITEMS,
      passphrase: generarPassphraseExport(),
      vaultId: VAULT,
      creadoEn: '2026-09-29T12:00:00.000Z',
      parametros: PARAMS_TEST,
    });

    assert.deepEqual(Object.keys(exportacion), [
      'format', 'format_version', 'created_at', 'item_count',
      'kdf', 'cipher', 'nonce', 'aad', 'ciphertext', 'mac',
    ]);
    assert.equal(exportacion.format, FORMATO_EXPORT);
    assert.equal(exportacion.format_version, VERSION_EXPORT);
    assert.equal(exportacion.item_count, ITEMS.length);
    assert.equal(exportacion.cipher, AEAD.algId);
    assert.equal(exportacion.kdf.name, 'argon2id');
    assert.equal(exportacion.created_at, '2026-09-29T12:00:00.000Z');
    assert.equal(exportacion.kdf.m, PARAMS_TEST.m);
    // Ningún campo en claro revela el contenido.
    assert.ok(!JSON.stringify(exportacion).includes('hunter2'));
    assert.ok(!JSON.stringify(exportacion).includes('DEADBEEF'));
  });

  it('el AAD canónico es determinista y depende del vault', () => {
    const base = { vaultId: VAULT, creadoEn: '2026-09-29T12:00:00.000Z', itemCount: 2 };
    assert.deepEqual(construirAADExport(base), construirAADExport(base));
    assert.notDeepEqual(
      construirAADExport(base),
      construirAADExport({ ...base, vaultId: '22222222-2222-4222-8222-222222222222' }),
    );
    assert.throws(() => construirAADExport({ ...base, vaultId: '' }), ErrorExport);
    assert.throws(() => construirAADExport({ ...base, itemCount: -1 }), ErrorExport);
    assert.throws(() => construirAADExport({ ...base, creadoEn: '' }), ErrorExport);
  });
});

describe('export §28 — roundtrip y rechazos', () => {
  it('abre el fichero con la passphrase correcta', async () => {
    const passphrase = generarPassphraseExport();
    const exportacion = await crearExport({ items: ITEMS, passphrase, vaultId: VAULT, parametros: PARAMS_TEST });
    const abiertos = await abrirExport({ exportacion, passphrase, vaultId: VAULT });
    assert.deepEqual(abiertos, ITEMS);
  });

  it('passphrase incorrecta ⇒ no revela nada', async () => {
    const passphrase = generarPassphraseExport();
    const exportacion = await crearExport({ items: ITEMS, passphrase, vaultId: VAULT, parametros: PARAMS_TEST });
    await assert.rejects(() =>
      abrirExport({ exportacion, passphrase: generarPassphraseExport(), vaultId: VAULT }),
    );
  });

  it('vaultId alterado ⇒ el AAD no coincide', async () => {
    const passphrase = generarPassphraseExport();
    const exportacion = await crearExport({ items: ITEMS, passphrase, vaultId: VAULT, parametros: PARAMS_TEST });
    await assert.rejects(
      () => abrirExport({ exportacion, passphrase, vaultId: '22222222-2222-4222-8222-222222222222' }),
      ErrorExport,
    );
  });

  it('R122 — sólo versiones conocidas', async () => {
    const passphrase = generarPassphraseExport();
    const exportacion = await crearExport({ items: ITEMS, passphrase, vaultId: VAULT, parametros: PARAMS_TEST });
    await assert.rejects(
      () => abrirExport({ exportacion: { ...exportacion, format_version: 99 }, passphrase, vaultId: VAULT }),
      /Versión de export no soportada/,
    );
    await assert.rejects(
      () => abrirExport({ exportacion: { ...exportacion, format: 'OTRA_COSA' }, passphrase, vaultId: VAULT }),
      /Formato desconocido/,
    );
    await assert.rejects(
      () => abrirExport({ exportacion: { ...exportacion, cipher: 'ROT13' }, passphrase, vaultId: VAULT }),
      /Cipher no permitido/,
    );
    await assert.rejects(
      () => abrirExport({ exportacion: { ...exportacion, kdf: undefined }, passphrase, vaultId: VAULT }),
      ErrorExport,
    );
  });

  it('un ciphertext recortado no descifra', async () => {
    const passphrase = generarPassphraseExport();
    const exportacion = await crearExport({ items: ITEMS, passphrase, vaultId: VAULT, parametros: PARAMS_TEST });
    await assert.rejects(() =>
      abrirExport({
        exportacion: { ...exportacion, ciphertext: exportacion.ciphertext.slice(0, -4) },
        passphrase,
        vaultId: VAULT,
      }),
    );
  });
});

describe('export §28 — R124/R125', () => {
  it('el límite por hora corta a las 3', () => {
    assert.equal(puedeExportar(0), true);
    assert.equal(puedeExportar(2), true);
    assert.throws(() => puedeExportar(MAX_EXPORTS_POR_HORA), ErrorExport);
    assert.throws(() => puedeExportar(10), ErrorExport);
    assert.throws(() => puedeExportar(NaN), ErrorExport);
  });

  it('la auditoría lleva formato y recuento, nunca el contenido', () => {
    const detalle = detalleAuditoriaExport({ item_count: 42, destino: 'descarga' });
    const obj = JSON.parse(detalle);
    assert.equal(obj.formato, FORMATO_EXPORT);
    assert.equal(obj.items, 42);
    assert.equal(obj.destino, 'descarga');
    assert.ok(!detalle.includes('hunter2'));
    assert.ok(!detalle.includes('passphrase'));
  });
});
