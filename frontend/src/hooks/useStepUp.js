import { useCallback, useState } from 'react';
import { useVault } from '../contexts/VaultContext';
import { limitadorStepUp } from '../lib/vault/rateLimit';

/**
 * Step-up de bóveda — Bóveda Segura V5 §13 / R38–R43.
 *
 * `autorizar(masterPassword)` hace el ciclo completo:
 *
 *   1. revalida la maestra en el worker (§13, comparación constante);
 *   2. emite un grant de un solo uso ligado a sub + proposito + itemRef;
 *   3. lo consume inmediatamente;
 *   4. devuelve true sólo si los tres pasos pasaron.
 *
 * El llamante (SecretField) recibe un «sí/no» y nada más: ni el token ni
 * el material derivado llegan a React.
 *
 * **Límite de velocidad (§52)** — reveal, copy, export y cambio de maestra
 * comparten una ventana deslizante por (sub, propósito). Se consume ANTES
 * de Argon2id: un techo de intentos que llega después de derivar no corta
 * nada. Una denegación no cuenta como intento, para que el límite no se
 * autoalimente. `limpiar()` no rebaja la ventana: si el usuario pudiera
 * resetearla rebotando el diálogo, el límite sería decoración.
 *
 * **Alcance** — hoy la verificación es local. §13.1 exige que el step-up
 * se valide además en servidor (`POST /auth/step-up` con `jti`, TTL y
 * binding al item); ese endpoint pertenece a la Fase 3 y aquí sólo se deja
 * el punto de enganche (`transporte`). Mientras no exista, R43 prohíbe
 * considerar esto suficiente para operaciones que requieran step-up
 * servidor — por eso `validadoEnServidor` queda en `false` y el checklist
 * de §52 no puede marcarse con este módulo.
 */
export function useStepUp({ proposito, itemRef = null, transporte = null } = {}) {
  const { grants, sub, verificarMaster } = useVault();
  const [verificando, setVerificando] = useState(false);
  const [error, setError] = useState(null);
  const [ultimoOk, setUltimoOk] = useState(false);

  const autorizar = useCallback(
    async (masterPassword) => {
      if (typeof proposito !== 'string' || proposito === '') {
        setError('Step-up sin propósito definido');
        setUltimoOk(false);
        return false;
      }
      if (!sub) {
        setError('No hay sesión de cuenta activa');
        setUltimoOk(false);
        return false;
      }

      // §52 — techo de intentos por (sub, propósito). Antes de Argon2id.
      const claveLimite = `${sub}:${proposito}`;
      if (!limitadorStepUp.consumir(claveLimite)) {
        setError(
          `Demasiados intentos de verificación. Vuelve a probar en un minuto (${proposito}).`,
        );
        setUltimoOk(false);
        return false;
      }

      setVerificando(true);
      setError(null);
      try {
        const correcta = await verificarMaster(masterPassword);
        if (!correcta) {
          setError('La contraseña de usuario no es correcta.');
          setUltimoOk(false);
          return false;
        }

        // Si hay transporte de servidor, se exige además (§13.1). Si no lo
        // hay, se deja constancia explícita en vez de fingir que basta.
        if (transporte) {
          const remoto = await transporte({ proposito, itemRef });
          if (!remoto?.ok) {
            setError(remoto?.mensaje || 'El step-up del servidor rechazó la operación.');
            setUltimoOk(false);
            return false;
          }
        }

        const grant = grants.emitir({ sub, proposito, itemRef });
        const concedido = grants.consumir(grant, { sub, proposito, itemRef });
        setUltimoOk(concedido);
        if (!concedido) setError('La autorización caducó. Inténtalo de nuevo.');
        return concedido;
      } catch (err) {
        setError(err?.message || 'No se pudo autorizar la operación.');
        setUltimoOk(false);
        return false;
      } finally {
        setVerificando(false);
      }
    },
    [proposito, itemRef, sub, verificarMaster, grants, transporte],
  );

  const limpiar = useCallback(() => {
    setError(null);
    setUltimoOk(false);
  }, []);

  return {
    autorizar,
    verificando,
    error,
    ultimoOk,
    limpiar,
    proposito,
    /** §52 — intentos que quedan en la ventana actual (0 = bloqueado). */
    intentosRestantes:
      sub && proposito ? limitadorStepUp.restantes(`${sub}:${proposito}`) : null,
    /** §13.1 — ¿el servidor validó el step-up? Ver §52 del documento V5. */
    validadoEnServidor: transporte !== null,
  };
}

export default useStepUp;
