/**
 * Núcleo criptográfico de la Bóveda Segura V5 (Fase 1).
 *
 * Sólo criptografía de cliente: no hay red, no hay storage, no hay estado.
 * Corresponde a §5 (KDF), §6.1 (jerarquía simétrica), §7 (envelope),
 * §8 (AES-GCM + AAD + nonces + techo por DEK) y §8.3 (anti-replay).
 *
 * La capa asimétrica de §6.2, el estado de desbloqueo de §9 y el step-up de
 * §13 llegan en las fases posteriores.
 */

export {
  FORMATO,
  VERSION_CRYPTO,
  VERSION_KDF,
  ARGON2,
  MINIMOS_ARGON2,
  ETIQUETAS,
  AEAD,
  ALGORITMOS_PERMITIDOS,
  MAX_ITEMS_POR_DEK,
  CAMPOS_AAD,
  CAMPOS_AAD_ENVOLTURA,
} from './params.js';

export {
  bytesAleatorios,
  utf8,
  desdeUtf8,
  borrar,
  concatenar,
  igualdadConstante,
  aBase64,
  desdeBase64,
  aBase64Url,
  desdeBase64Url,
  aBytes,
} from './random.js';

export { construirAAD, construirAADEnvoltura, aadDesdeAlmacenamiento } from './aad.js';

export {
  ErrorDescifrado,
  exigirAlgoritmo,
  comprobarTechoDeClave,
  cifrarConAAD,
  descifrarConAAD,
  cifrar,
  descifrar,
  serializar,
  deserializar,
} from './aead.js';

export { envolverClave, desenvolverClave, confirmarKEK, PROPOSITOS } from './envelope.js';

export {
  validarMasterPassword,
  validarParamsArgon2,
  saltAleatorio,
  derivarIKM,
  derivarMaterial,
  derivarMaterialMaestro,
  parametrosUsados,
} from './kdf.js';

// --- Fase 2: estados y control de acceso (§9, §13, §14) ---

export {
  EVENTO,
  POLITICA_DEFECTO,
  estadoInicialLock,
  limiteMs,
  restanteMs,
  reducirLock,
  evaluarVencimiento,
  vencido,
} from './lock.js';

export {
  MAXIMO_GRANTS,
  TTL_GRANT_MS,
  crearAlmacenGrants,
} from './grants.js';

export {
  AVISO_HISTORIAL_SO,
  RETENCION_DEFECTO_MS,
  copiarAlPortapapeles,
} from './clipboard.js';

export { CODIGOS, ErrorBoveda, crearServicioBoveda } from './servicio.js';
export { crearClienteBoveda } from './cliente.js';

// --- Fase 4: ciclo de vida (§25, §27, §28) ---

export {
  ErrorRecovery,
  generarRecoveryKey,
  formatearRecoveryKey,
  parsearRecoveryKey,
  derivarKEKRecuperacion,
  kekDeRecoveryKey,
  envolverDEKsParaRecuperacion,
  desenvolverDEKsDeRecuperacion,
  confirmarRecoveryKey,
} from './recovery.js';

export {
  ErrorRekey,
  reenvolverDEKs,
  verificarReenvolturas,
  resultadoVerificable,
} from './rekey.js';

export {
  ErrorExport,
  generarPassphraseExport,
  construirAADExport,
  crearExport,
  abrirExport,
  puedeExportar,
  detalleAuditoriaExport,
} from './exportar.js';

export {
  FORMATO_EXPORT,
  VERSION_EXPORT,
  MAX_EXPORTS_POR_HORA,
  MAX_INTENTOS_STEPUP,
  VENTANA_STEPUP_MS,
  ARGON2_EXPORT,
  CAMPOS_AAD_EXPORT,
  LONGITUD_RECOVERY_KEY,
} from './params.js';

export { crearLimitador, limitadorStepUp } from './rateLimit.js';

// --- Fase 5.1: capa asimétrica (§6.2) y compartición por elemento (§26) ---

export {
  LONGITUDES as LONGITUDES_ASIMETRICAS,
  generarParAsimetrico,
  generarEfimera,
  envolverPar,
  abrirPar,
  firmar,
  verificarFirma,
  intercambiarClave,
  huella,
  exigirPublica,
} from './asimetrica.js';

export {
  ErrorComparticion,
  CODIGOS_COMPARTICION,
  envolverPara,
  abrirShare,
} from './compartir.js';

export {
  CAMPOS_AAD_COMPARTICION,
  CAMPOS_COMPARTICION,
  CAMPOS_CLAVE_COMPARTICION,
  FORMATO_COMPARTICION,
  VERSION_COMPARTICION,
} from './params.js';

export {
  cambiarMasterPassword,
  revocarClavesPrevias,
  guardarRecuperacion,
  revocarRecuperacion,
  cargarRecuperacion,
  revocarOtrasSesiones,
  contarEventos,
} from './api.js';
