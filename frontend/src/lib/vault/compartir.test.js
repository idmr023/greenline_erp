import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { sha256 } from '@noble/hashes/sha2.js';

import { firmar, generarParAsimetrico, huella } from './asimetrica.js';
import { CODIGOS_COMPARTICION, ErrorComparticion, abrirShare, envolverPara } from './compartir.js';
import {
  CAMPOS_COMPARTICION,
  FORMATO_COMPARTICION,
  VERSION_COMPARTICION,
} from './params.js';
import { aBase64Url, bytesAleatorios, concatenar, igualdadConstante, utf8 } from './random.js';

const VAULT = { vaultId: 'v-1', itemId: 'i-9', revision: 3 };
const EMISOR = 'user-a';
const RECEPTOR = 'user-b';
const EN_UNA_HORA = new Date(Date.now() + 3_600_000).toISOString();

const parA = generarParAsimetrico();
const parB = generarParAsimetrico();
const parC = generarParAsimetrico();

const serializar = (envoltura) => concatenar(envoltura.nonce, envoltura.ciphertext, envoltura.tag);

async function compartir({ datos = new TextEncoder().encode('clave-api: sk-live-123'), ...extra } = {}) {
  return envolverPara({
    datos,
    clavePublicaReceptor: parB.canje.publica,
    claveFirmaEmisor: parA.firma.privada,
    vaultId: VAULT.vaultId,
    itemId: VAULT.itemId,
    emisor: EMISOR,
    receptor: RECEPTOR,
    revision: VAULT.revision,
    expiresAt: EN_UNA_HORA,
    ...extra,
  });
}

async function abrir(share, extra = {}) {
  return abrirShare({ share, parReceptor: parB, publicaEmisor: parA.firma.publica, ...extra });
}

/** Reconstruye la tuple firmada para poder re-firmar una fila manipulada. */
function refirmar(shareBase, cambios = {}) {
  const share = { ...shareBase, ...cambios };
  const valores = {
    formato: share.formato,
    formatVersion: share.formatVersion,
    vaultId: share.vaultId,
    itemId: share.itemId,
    emisor: share.emisor,
    receptor: share.receptor,
    claveReceptor: aBase64Url(share.claveReceptor),
    claveEfimera: aBase64Url(share.claveEfimera),
    wrappedKey: aBase64Url(serializar(share.wrappedKey)),
    payloadHash: aBase64Url(new Uint8Array(sha256(serializar(share.payload)))),
    expiresAt: share.expiresAt,
  };
  const canonico = utf8(JSON.stringify(CAMPOS_COMPARTICION.map((campo) => valores[campo])));
  return { ...share, firma: firmar(canonico, parA.firma.privada) };
}

describe('compartición por elemento §26 (Fase 5.1)', () => {
  test('A comparte y B recibe exactamente el mismo secreto', async () => {
    const secreto = new TextEncoder().encode('IBAN ES91 2100 0418 4502 0005 1332');
    const share = await compartir({ datos: secreto });

    assert.equal(share.formato, FORMATO_COMPARTICION);
    assert.equal(share.formatVersion, VERSION_COMPARTICION);
    assert.equal(share.emisor, EMISOR);
    assert.equal(share.receptor, RECEPTOR);
    assert.equal(share.expiresAt, EN_UNA_HORA);
    assert.ok(share.firma instanceof Uint8Array);
    assert.ok(share.creadoEn);

    const abierto = await abrir(share);
    assert.equal(igualdadConstante(abierto.datos, secreto), true);
    assert.equal(abierto.itemId, VAULT.itemId);
    assert.equal(abierto.revision, VAULT.revision);
    assert.equal(abierto.emisor, EMISOR);
    assert.equal(abierto.expiresAt, EN_UNA_HORA);
  });

  test('R110: la fila no lleva la KEK, la maestra ni el secreto en claro', async () => {
    const secreto = bytesAleatorios(48);
    const share = await compartir({ datos: secreto });

    assert.equal(share.payload.ciphertext.length, secreto.length, 'GCM no cambia la longitud');
    assert.equal(igualdadConstante(share.payload.ciphertext.subarray(0, 48), secreto), false);
    assert.equal(share.wrappedKey.ciphertext.length, 32, 'lo envuelto es la content key, no el secreto');

    // Dos shares del mismo secreto: nonces frescos, nada reutilizado (R8).
    const otro = await compartir({ datos: secreto });
    assert.equal(igualdadConstante(share.payload.nonce, otro.payload.nonce), false);
    assert.equal(igualdadConstante(share.wrappedKey.nonce, otro.wrappedKey.nonce), false);
  });

  test('R113: sólo valida la firma del emisor real y de la fila intacta', async () => {
    const share = await compartir();

    await assert.rejects(
      () => abrirShare({ share, parReceptor: parB, publicaEmisor: parC.firma.publica }),
      (e) => e instanceof ErrorComparticion && e.codigo === CODIGOS_COMPARTICION.firma,
    );

    const firmaRota = Uint8Array.from(share.firma);
    firmaRota[3] ^= 0x01;
    await assert.rejects(
      () => abrir({ ...share, firma: firmaRota }),
      (e) => e.codigo === CODIGOS_COMPARTICION.firma,
    );

    await assert.rejects(
      () => abrir({ ...share, emisor: 'user-a-evil' }),
      (e) => e.codigo === CODIGOS_COMPARTICION.firma,
    );

    await assert.rejects(
      () => abrir({ ...share, itemId: 'i-otro' }),
      (e) => e.codigo === CODIGOS_COMPARTICION.firma,
    );

    await assert.rejects(
      () => abrir({ ...share, expiresAt: new Date(Date.now() + 86_400_000).toISOString() }),
      (e) => e.codigo === CODIGOS_COMPARTICION.firma,
    );

    await assert.rejects(
      () => abrir({ ...share, payload: share.wrappedKey, wrappedKey: share.payload }),
      (e) => e.codigo === CODIGOS_COMPARTICION.firma,
    );
  });

  test('R111: la expiración se exige al crear y al abrir', async () => {
    await assert.rejects(
      () => compartir({ expiresAt: new Date(Date.now() - 1000).toISOString() }),
      (e) => e instanceof ErrorComparticion && e.codigo === CODIGOS_COMPARTICION.expirada,
    );
    await assert.rejects(
      () => compartir({ expiresAt: 'no-es-fecha' }),
      (e) => e.codigo === CODIGOS_COMPARTICION.invalida,
    );

    const share = await compartir({ expiresAt: new Date(Date.now() + 50).toISOString() });
    await assert.rejects(
      () => abrir(share, { ahora: Date.now() + 60_000 }),
      (e) => e.codigo === CODIGOS_COMPARTICION.expirada,
    );
    assert.ok((await abrir(share)).datos instanceof Uint8Array);
  });

  test('R112: la revocación corta el acceso, antes de tocar crypto', async () => {
    const share = await compartir();
    await assert.rejects(
      () => abrir(share, { revocado: true }),
      (e) => e instanceof ErrorComparticion && e.codigo === CODIGOS_COMPARTICION.revocada,
    );
    // Incluso con la fila corrupta, el estado manda: no se llega ni al ECDH.
    await assert.rejects(
      () => abrir({ ...share, claveEfimera: new Uint8Array(32) }, { revocado: true }),
      (e) => e.codigo === CODIGOS_COMPARTICION.revocada,
    );
  });

  test('R114: sólo el receptor designado puede abrir, y con SU clave', async () => {
    const share = await compartir();

    await assert.rejects(
      () => abrirShare({ share, parReceptor: parC, publicaEmisor: parA.firma.publica }),
      (e) => e instanceof ErrorComparticion && e.codigo === CODIGOS_COMPARTICION.receptor,
    );

    assert.ok((await abrir(share)).datos instanceof Uint8Array);
  });

  test('R8: una clave efímera de bajo orden no llega a derivar', async () => {
    const share = refirmar(await compartir(), { claveEfimera: new Uint8Array(32) });
    await assert.rejects(() => abrir(share), /invalid private or public key/);
  });

  test('el AAD ata la revisión: un campo no firmado tampoco se puede tocar', async () => {
    const share = await compartir();
    // `revision` va en el AAD pero NO en la firma: cambiarla deja la firma
    // válida y hace fallar el descifrado (§8.1 como segunda barrera).
    await assert.rejects(
      () => abrir({ ...share, revision: share.revision + 1 }),
      (e) => e.name === 'ErrorDescifrado',
    );
  });

  test('R114: la huella del emisor identifica con quién se comparte', async () => {
    assert.match(huella(parA.firma.publica), /^SHA256:/);
    assert.notEqual(huella(parA.firma.publica), huella(parC.firma.publica));
  });

  test('ids numéricos y string producen la misma tuple', async () => {
    const share = await envolverPara({
      datos: new TextEncoder().encode('secreto'),
      clavePublicaReceptor: parB.canje.publica,
      claveFirmaEmisor: parA.firma.privada,
      vaultId: 10,
      itemId: 42,
      emisor: 7,
      receptor: 9,
      revision: 0,
      expiresAt: EN_UNA_HORA,
    });
    const abierto = await abrir(share);
    assert.equal(abierto.itemId, '42');
    assert.equal(abierto.emisor, '7');
  });

  test('sin compartir consigo mismo y sin campos rotos', async () => {
    await assert.rejects(
      () => envolverPara({
        datos: new Uint8Array([1]),
        clavePublicaReceptor: parB.canje.publica,
        claveFirmaEmisor: parA.firma.privada,
        vaultId: 'v',
        itemId: 'i',
        emisor: 'mismo',
        receptor: 'mismo',
        revision: 1,
        expiresAt: EN_UNA_HORA,
      }),
      (e) => e.codigo === CODIGOS_COMPARTICION.invalida,
    );

    await assert.rejects(() => compartir({ datos: new Uint8Array(0) }), (e) => e.codigo === CODIGOS_COMPARTICION.invalida);
    await assert.rejects(() => compartir({ datos: 'texto en claro' }), (e) => e.codigo === CODIGOS_COMPARTICION.invalida);
    await assert.rejects(() => compartir({ clavePublicaReceptor: new Uint8Array(31) }), /32 bytes/);
    await assert.rejects(() => compartir({ claveFirmaEmisor: new Uint8Array(16) }), (e) => e.codigo === CODIGOS_COMPARTICION.invalida);
    await assert.rejects(() => compartir({ revision: 1.5 }), (e) => e.codigo === CODIGOS_COMPARTICION.invalida);
    await assert.rejects(() => abrir(null), (e) => e.codigo === CODIGOS_COMPARTICION.invalida);
    await assert.rejects(() => abrir({ formato: 'OTRO' }), (e) => e.codigo === CODIGOS_COMPARTICION.invalida);
    await assert.rejects(() => abrir({ formato: FORMATO_COMPARTICION }), (e) => e.codigo === CODIGOS_COMPARTICION.invalida);
  });
});
