# BÓVEDA SEGURA V5
## Especificación Arquitectónica de una Password Vault Zero-Knowledge, Defense-in-Depth y Enterprise Security

### Ficha técnica

- Sistema: Bóveda Segura V5
- Documento anterior: `docs/boveda-segura-v4.md` (se mantiene sin cambios como referencia histórica).
- Objetivo: almacenamiento y visualización altamente segura de contraseñas, secretos, TOTP, API Keys y credenciales empresariales.
- Paradigma: Zero-Trust, Zero-Knowledge declarado con límites explícitos, Defense-in-Depth, Least Privilege y Secure-by-Design.
- Modelo criptográfico: cifrado autenticado con AAD contextual, envelope encryption, derivación de claves con domain separation, capa asimétrica para compartir/recuperación y separación estricta entre sesión, autenticación y cifrado.
- Stack de referencia: Next.js / React, Express / Node.js TypeScript, PostgreSQL / Supabase, Argon2id, Web Crypto API o biblioteca criptográfica auditada, Docker, OWASP ZAP, SonarQube.
- Gestión de secretos de infraestructura: Doppler / AWS Secrets Manager / Azure Key Vault / proveedor equivalente.
- Notarización opcional: Merkle Root + red blockchain o transparency log para demostrar integridad sin publicar secretos.
- Normativa y referencias: ISO/IEC 27001, OWASP ASVS, OWASP Top 10, NIST Cybersecurity Framework, NIST SP 800-63B y legislación aplicable de protección de datos.

---

## Changelog V4 → V5

La V5 no reescribe la V4 por capricho: corrige problemas que, de implementarse tal cual la V4, producirían una falsa sensación de seguridad.

| # | Cambio V5 | Hallazgo V4 que motiva el cambio |
|---|---|---|
| 1 | **AAD contextual obligatorio** en todo ciphertext (§8) | V4 §7–§8 (L218–271) promete detectar "sustitución" sin definir `additionalData`; con GCM sin AAD un atacante recorta/pega ciphertext entre ítems sin que falle la autenticación |
| 2 | **Declaración de límites del Zero-Knowledge** y elección explícita OPAQUE/PAKE vs verifier (§3, §4) | V4 §4/§15 (L118–155, L461–490) enuncia la separación sin definirla: en la práctica se envía material derivado de la master password y el robo de la DB permite cracking offline |
| 3 | **Capa asimétrica (X25519/Ed25519)** para compartir, emergencia y anclas (§6, §26) | V4 §6–§7 es puramente simétrica (KEK→DEK): es **imposible** compartir un ítem con otro usuario o hacer recovery multifirma sin romper el modelo |
| 4 | **HKDF-SHA-256 con labels de domain separation + key confirmation** (§5) | V4 §5 (L157–173) no fija parámetros de Argon2id ni evita que la misma salida se reutilice para auth y cifrado |
| 5 | **Sesión ≠ Desbloqueo** como estado independiente (§9) | V4 nunca dice que un accessToken robado sea insuficiente para descifrar; sin eso, cualquier XSS = bóveda completa |
| 6 | **Step-up validado en servidor** (token single-use, TTL, binding a ítem+acción) (§13) | V4 §11/§27 (L361–L387, L806–L835) no exige verificación server-side; un chequeo sólo en cliente se bypasea con DevTools |
| 7 | **Límite de nonces por DEK + re-key forzado + alternativa nonce-misuse-resistant** (§8) | V4 §7 (L245) sólo dice "no reutilizar nonces" sin el techo de ~2³² mensajes por clave GCM |
| 8 | **Ancla externa obligatoria** para el hash-chain de auditoría (§24) | V4 §20 (L595–630) usa una cadena de hashes reescribible en su totalidad por quien controla la tabla |
| 9 | **Recovery anti-escrow** como restricción explícita (§25) | V4 §21 (L632–661) lista opciones sin prohibir que el servidor/administrador guarde la clave de recuperación (eso rompe el ZK) |
| 10 | **Política de fuerza de master password + k-anonymity (HIBP)** (§17) | V4 no la tiene: una master password débil anula toda la jerarquía criptográfica |
| 11 | **Riesgo residual de clipboard de sistema** (historial Win+V, cloud clipboard) (§14) | V4 §12 (L389–420) asume que "limpiar el clipboard" es suficiente; en la práctica el SO conserva historial |
| 12 | **CSP nonce-based + Trusted Types + integridad del artefacto desplegado** (§16, §44) | V4 §14 (L442–459) no cubre el escenario de que el **propio origen sirva JS manipulado** (compromiso de build/CDN) |
| 13 | **Scrubbing obligatorio de APM** (Sentry `beforeSend`) y `no-store` en respuestas de secretos (§21, §45) | V4 §43 lo dice de forma genérica sin mecanismo verificable |
| 14 | **RLS adaptado a identidad dual** (JWT propio del backend ↔ `auth.uid()` de Supabase) y riesgo de service-role key (§20) | V4 §18 (L525–559) sólo muestra `auth.uid()`, incompatible con backends que autentican con JWT propio |
| 15 | **Threat model con disponibilidad/integridad** (ransomware, borrado, extorsión) (§2, §29) | V4 §2 es casi exclusivamente confidencialidad |
| 16 | **Sección de Limitaciones declaradas** (§53) | V4 termina sin enumerar qué **no** protege (memoria JS, keylogging, extensiones, historial de portapapeles) |
| 17 | **Compartir bóvedas, emergency access y break-glass** (§26, §41) | Ausentes en V4 pese a ser un requisito de ERP multi-tenant |
| 18 | **Mega-prompts y checklist actualizados** con los 17 puntos anteriores | V4 §47–§50 no pedían AAD, capa asimétrica, unlock-vs-session ni scrubbing |

### Correcciones aplicadas durante la implementación (Fase 1)

La Fase 1 obligó a corregir tres afirmaciones de este propio documento. Se dejan registradas: una especificación que no se corrige contra la realidad deja de ser útil.

| Incidencia | Corrección |
|---|---|
| §5.3 exigía enviar un `key confirmation` al servidor | Un MAC bajo la KEK almacenado en el servidor sería **un segundo oráculo de fuerza bruta offline** de la master password. La confirmación es ahora local y transient (§5.3). |
| §47 afirmaba que con la Opción A o C "no debe poder hacer fuerza bruta offline" | Falso: los `wrapped_keys` almacenados son el oráculo. Añadidos §3.1.1 y L13 en §53. |
| §5 no fijaba parámetros ni advertía el coste de Argon2id en JavaScript | Fijados `m=64 MiB / t=3 / p=4` con el suelo de §5.1 verificado por test, y añadida L14 (~1,3 s en JS puro → Web Worker obligatorio, §15.1). |
| §13/§13.1 daban a entender que el step-up server-side controla el descifrado | Añadido §13.2: en una bóveda client-side el cliente **ya puede** descifrar; el step-up decide *mostrar*, no *descifrar*. La garantía sobre quién lee la bóveda la dan RLS + auditoría. |
| §25 no especificaba el formato legible de la recovery key | Implementado con separador `.`: `-` y `_` forman parte del alfabeto base64url y harían ambigua la transcripción (el separador sería indistinguible del dato). |
| §27 R117 pedía conservar la KEK anterior sin decir dónde | Resuelto con `proposito='dek_previa'` en `wrapped_keys` + `prev_kdf_*` en `vaults` y ventana de 7 días; el propósito va en el AAD (§7 R10), así que una envoltura vieja no puede hacerse pasar por vigente. |
| §26 dibuja «DEK_del_item» como material a compartir | **No existe una DEK por item**: la bóveda tiene una sola DEK compartida por todos (`servicio.js`, `dekActiva`). Envolverla equivaldría a compartir la bóveda entera y obligaría a abrir `greenline_vault_items` a terceros (riesgo IDOR de §22). F5.1 compartirá con una **content key efímera por compartición** sobre un snapshot re-cifrado del item: el receptor ve únicamente ese secreto y la DEK de la bóveda no se toca. |
| §8 exige un error único al descifrar, pero el export cifra con su propio AEAD | El fallo de passphrase en un export bien formado devuelve `ErrorDescifrado` (el genérico de §8), no un `ErrorExport` propio: no se distingue entre passphrase mala y fichero manipulado (§28.1 R121). `ErrorExport` se reserva para errores de formato, donde aún no hay ciphertext que autenticar. |

**Estado de la implementación en este repo:**

| Fase | Estado | Dónde |
|---|---|---|
| 0 — Fundación (XSS, fail-closed, Sentry, CSP/headers, lint) | ✅ completada | `frontend/src/utils/sanitizeHtml.js`, `lib/sentryScrub.js`, `lib/api.js`, `vite.config.js`, `vercel.json`, `scripts/auditar-sinks-html.mjs` |
| 1 — Núcleo criptográfico | ✅ completada | `frontend/src/lib/vault/` (`params`, `aad`, `aead`, `envelope`, `kdf`) |
| 2 — Sesión vs desbloqueo, step-up, reveal, clipboard | ✅ completada | `vault/servicio.js`, `vault/worker.js`, `vault/cliente.js`, `vault/lock.js`, `vault/grants.js`, `vault/clipboard.js`, `contexts/VaultContext.jsx`, `hooks/useStepUp.js`, `components/vault/SecretField.jsx` |
| 3 (cliente) — API de datos + UI | ✅ completada | `vault/api.js`, `components/admin/AdminBoveda.jsx` |
| 3 (datos) — tablas + RLS | ✅ aplicada | `greenline/supabase/migrations/20260930120000_boveda_segura_v5_completa.sql` (§1) |
| 4 — Recuperación, cambio de maestra, export | ✅ completada (cliente) | `vault/recovery.js`, `vault/rekey.js`, `vault/exportar.js`, `servicio.js` (5 mensajes: `cambiarMasterPassword`, `activarRecuperacion`, `usarRecuperacion`, `crearExport`, `abrirExport`), `AdminBoveda.jsx` |
| 4 (datos) — re-wrap atómico | ✅ aplicada | `greenline/supabase/migrations/20260930120000_boveda_segura_v5_completa.sql` (§2: `proposito`, ventana R117, RPC `vault_rekey` y `vault_revocar_anteriores`) |
| 4/5 (datos) — roles por categoría, invitaciones, membresías, par asimétrico y equipo | ✅ aplicada | `greenline/supabase/migrations/20260930120000_boveda_segura_v5_completa.sql` (§3 roles + categorías + invitaciones · §4 par Ed25519/X25519 y `greenline_vault_shares` de F5.1 · §5 D1/D2/D3: lee todo el staff, escribe sólo `ADMIN`/`DESARROLLADOR_WEB`) — migración **única** desde el 30 sep 2026: reemplaza a las cinco anteriores |
| 4 (refuerzos §52/§13) — rate limit de step-up, step-up en export y activación de recovery, import R122 | ✅ completada | `vault/rateLimit.js`, `hooks/useStepUp.js`, `AdminBoveda.jsx` (paneles de mantenimiento), `servicio.js` (`abrirExport`) |
| 5.1 — Capa asimétrica X25519/Ed25519 + compartición por elemento (§26, §6.2) | ⬜ pendiente | Decidido: `@noble/curves` (pin exacto, R155) y content key efímera por item (ver corrección de §26 arriba) |
| 5.2 — Ancla externa del audit log (§24) | ⬜ pendiente | Decidido: Merkle root firmado publicado como fichero en el repo del sitio público (R100) + `scripts/verificar-ancla.mjs` (R101) |
| 5.3 — Break-glass con doble control (§41) | ⬜ pendiente | Requiere ruta nueva en `greenline/backend/src/routes/` — hoy el backend **no** tiene ninguna ruta de bóveda |

**Pendientes declarados (no son limitaciones de §53, son requisitos aún sin implementar):** R67 — contador de intentos de step-up compartido entre login y step-up **en servidor** (el límite de este repo es por pestaña, memoria volátil) · §17.2 — bloqueo y backoff de la maestra · Trusted Types en la CSP · `Cache-Control: no-store` en las respuestas de bóveda · CI con la suite §38 en verde · separación de roles R150.

Verificación en verde: `npm run lint` = 0 · `npm test` = **139/139** (10 corridas seguidas sin fallo; antes de corregirlo, `aead.test.js` «todos los fallos usan el mismo error» parpadeaba 1 de cada 3 por rechazos sin manejar) · `npm run build` = 0 · smoke de preview = 200 en `/`, `/login`, `/admin`, `/admin/blog` y `/fase-2-implementacion`.

---

# 1. OBJETIVO DE SEGURIDAD

Bóveda Segura V5 no debe tratarse como una simple tabla de contraseñas con cifrado.

Su objetivo es que un atacante que consiga acceso a la base de datos, backups o almacenamiento de objetos no pueda convertir esos datos directamente en contraseñas utilizables.

La V5 protege:

- contraseñas
- nombres de usuario
- URLs
- notas privadas
- códigos TOTP
- API Keys
- tokens
- credenciales empresariales
- claves de recuperación
- metadatos sensibles
- claves criptográficas
- credenciales de infraestructura alojadas en la bóveda

Principio fundamental:

> El servidor debe conocer únicamente la información estrictamente necesaria para autenticar, autorizar y almacenar la bóveda. Los secretos de la bóveda deben permanecer cifrados y no deben aparecer en texto plano en la base de datos.

La visualización de una contraseña debe ser una operación explícita, autenticada, autorizada, temporal y auditable.

Objetivos secundarios igual de obligatorios (ausentes en V4):

- **Integridad:** un atacante con acceso de escritura no puede modificar, intercambiar ni rebobinar secretos sin ser detectado.
- **Disponibilidad:** un atacante con acceso de escritura no puede dejar a los usuarios sin sus secretos de forma irreversible.
- **No repudio de la bóveda:** cada reveal, copia, export y recuperación queda atribuible e inalterable a posteriori.

---

# 2. MODELO DE AMENAZAS

La arquitectura debe asumir que pueden ocurrir:

### Confidencialidad

1. Robo de una copia de PostgreSQL.
2. Robo de backups.
3. Compromiso de una cuenta de usuario.
4. Compromiso parcial del backend.
5. Exposición accidental de logs.
6. Ataques de fuerza bruta.
7. Credential stuffing.
8. IDOR/BOLA.
9. SQL Injection.
10. XSS.
11. CSRF cuando corresponda.
12. Robo de sesión.
13. Compromiso de un administrador.
14. Filtración de secretos de infraestructura.
15. Acceso indebido a herramientas de observabilidad.
16. Pérdida o robo del dispositivo del usuario.
17. Intentos de extracción masiva de secretos.
18. **Ejecución de JavaScript malicioso inyectado por compromiso del build, del CDN o de una dependencia** (el origen entrega código que exfiltra la master password mientras el usuario la teclea).
19. **Extensión de navegador maliciosa o comprometida** con acceso al DOM de la bóveda.
20. **Historial de portapapeles del sistema** (Win+V, clipboard de la nube, gestores de clipboard de terceros).
21. **Keylogger / pantalla compartida / grabación remota** (fuerza bruta sobre el usuario, no sobre el sistema).

### Integridad

22. **Manipulación de ciphertext** (modificación, truncamiento, sustitución entre ítems, replay de versiones antiguas).
23. **Sustitución de metadatos** (cambiar `owner_id`/`tenant_id` sin tocar el blob).
24. **Reescritura completa del audit log** por un atacante con privilegios de base de datos.
25. **Malleabilidad del payload de reveal** (respuesta alterada en tránsito o por proxy).

### Disponibilidad

26. **Borrado o cifrado de la bóveda como extorsión** (ransomware sobre la base de datos): el atacante no obtiene secretos pero destruye el acceso legítimo.
27. **Corrupción de backups** o de claves de recoverey.
28. **DoS** sobre los endpoints de reveal/desbloqueo.

### Abuso interno

29. Operador con acceso a base de datos intentando reconstruir secretos.
30. Administrador intentando leer bóvedas ajenas.
31. Exportación masiva no autorizada por una cuenta legítima.

Cada capa debe limitar el impacto incluso cuando una de ellas haya sido comprometida. La V5 exige además que el modelo declare qué amenazas **no** cubre (§53).

---

# 3. ARQUITECTURA ZERO-KNOWLEDGE Y SUS LÍMITES

La bóveda debe aproximarse a un modelo Zero-Knowledge.

Flujo conceptual:

```text
                    USUARIO
                       |
                 Master Password
                       |
                       v
                    Argon2id
                       |
                       v
              Clave derivada localmente
                       |
        +--------------+--------------+
        |                             |
        v                             v
  Auth Key Material            HKDF (labels)
  (verifier / OPAQUE)                |
                                     v
                              Vault Unlock Key
                                     |
                                     v
                              Envoltura de DEKs
                                     |
                                     v
                              AES-256-GCM + AAD
                                     |
                                     v
                              Vault Items (ciphertext)
                                     |
                                     v
                                Backend
                                     |
                                     v
                               PostgreSQL
```

La contraseña maestra no debe enviarse innecesariamente al backend ni almacenarse.

Cuando sea viable para el modelo de autenticación utilizado, la derivación de claves y el descifrado deben realizarse en el cliente.

## 3.1 Elección obligatoria del modelo de autenticación

La V5 exige que el equipo **elija por escrito una de estas opciones antes de escribir código**, porque la elección define cuánto de "zero-knowledge" es real:

```text
Opción A — OPAQUE (o PAKE equivalente)
  El servidor nunca ve material derivado de la master password.
  Robo de la base de datos NO permite cracking offline.
  Complejidad de implementación alta; usar librería auditada.

Opción B — Verifier derivado (Argon2id sobre Auth Key)
  El servidor almacena un verifier calculado a partir de la misma
  master password. Robo de DB + parámetros SÍ permite fuerza bruta
  offline sobre la master password.
  Requiere: master password de alta entropía (§17) + rate limiting
  + declarar el riesgo en §53.

Opción C — Cuenta y master password separadas (RECOMENDADA para GreenLine)
  La cuenta (email + contraseña + MFA) sólo autentica la sesión.
  La master password de la bóveda NUNCA sale del cliente ni se usa
  para autenticar: sólo derive claves localmente.
  El servidor no recibe material derivado de la master password.
```

> Si no se documenta la opción elegida, el sistema **no** puede llamarse zero-knowledge.

## 3.1.1 Lo que NINGUNA opción impide (corrección sobre la V4 y sobre la primera redacción de la V5)

Las envolturas de las DEKs viven en la base de datos y están cifradas con una KEK derivada de la master password. Eso convierte a los propios datos almacenados en un **oráculo de fuerza bruta offline**:

```text
wrapped_keys (robaros con la DB)
      +
parámetros y salt de Argon2id
      +
una suposición de master password
      |
      v
derivar KEK -> intentar desenvolver -> ¿funciona?
```

Ninguna opción de §3.1 cambia ese hecho:

- **Opción A (OPAQUE):** impide que el servidor obtenga en el login un secreto equivalente a la contraseña, pero el ciphertext almacenado sigue permitiendo adivinar la master password offline.
- **Opción B (verifier):** además, el verifier del login da un segundo oráculo más barato todavía.
- **Opción C (cuenta y master separadas):** impide que la master password llegue jamás al servidor ni se use como credencial de login, y elimina cualquier oráculo derivado del proceso de autenticación — pero **no** elimina el que ya proporcionan los `wrapped_keys` guardados.

**Conclusión operativa:** la defensa real contra el ataque offline no es el protocolo de autenticación, es la **entropía de la master password** (§17.1). Con una contraseña de 4 palabras aleatorias o de 16+ caracteres, el ataque offline deja de ser viable; con una contraseña débil, da igual cuál de las tres opciones se elija.

Por eso §53 declaró esto como limitación y por eso §17.1 es obligatorio, no recomendado.

## 3.2 Matriz de conocimiento del servidor

La arquitectura debe documentar exactamente esta tabla:

```text
| Información                          | Conoce el servidor |
|--------------------------------------|--------------------|
| email / id de usuario                | Sí                 |
| hash de la contraseña de la cuenta   | Sí (Argon2id)      |
| tokens de sesión                     | Sí (o hash)        |
| salt Argon2id de la bóveda           | Sí (no es secreto) |
| parámetros KDF                       | Sí                 |
| ciphertext, nonces, versiones        | Sí                 |
| owner_id / tenant_id / item_type     | Sí                 |
| Master password                      | NO                 |
| Vault Unlock Key                     | NO                 |
| DEK en claro                         | NO                 |
| Contenido de los items (title/pass)  | NO                 |
| TOTP secrets                         | NO                 |
```

---

# 4. SEPARACIÓN ENTRE AUTENTICACIÓN Y CIFRADO

Nunca debe utilizarse directamente:

```text
Master Password = Encryption Key
```

Debe existir una separación conceptual entre:

```text
Master Password
       |
       v
   Argon2id + HKDF
       |
       +------------------+--------------------+
       |                  |                    |
       v                  v                    v
  Auth Key          Vault Unlock Key     Recovery Material
  (verifier /       (para la bóveda)     (§25)
   OPAQUE)
```

La autenticación responde:

```text
¿Quién eres?
```

La criptografía responde:

```text
¿Puedes desbloquear esta bóveda?
```

Estas funciones no deben quedar acopladas innecesariamente.

## 4.1 Reglas duras

- R1: La contraseña de la cuenta y la master password de la bóveda **deben poder ser distintas** y, si el modelo elegido lo permite, **deben serlo por defecto**.
- R2: El paso de autenticación **no** debe enviar al servidor ninguna cadena derivada por Argon2id de la master password salvo que se haya elegido la Opción B de §3.1 y esté declarado en §53.
- R3: Ningún endpoint de autenticación debe aceptar la master password como parámetro.
- R4: Un verifier, si existe, debe compararse con comparación constante en tiempo (`timing-safeEqual`) y estar rate-limitado por cuenta, IP y dispositivo.
- R5: El cambio de master password (§27) no debe reutilizar el flujo de login.

---

# 5. DERIVACIÓN DE CLAVES CON ARGON2ID

Argon2id debe utilizarse para derivar material criptográfico a partir de la contraseña maestra.

## 5.1 Parámetros mínimos obligatorios

La V5 deja de decir "parámetros configurables" sin más. Deben fijarse y versionarse:

```text
Argon2id
  memory (m):        >= 64 MiB   (mínimo absoluto: 19 MiB / OWASP)
  iterations (t):    >= 3        (mínimo absoluto: 2)
  parallelism (p):   >= 4
  salt:              16 bytes aleatorios, únicos por bóveda
  output:            64 bytes
  version:           Argon2 v0x13
  encoding:          ARGON2ID_VERSION + m + t + p + salt en claro junto al ciphertext
```

- Los parámetros se almacenan **con la bóveda** y viajan al cliente en el bootstrap.
- Un aumento de parámetros debe poder migrarse sin re-cifrar los items (re-derivar y re-envolver las DEKs, §27).
- Está prohibido bajar parámetros por razones de rendimiento sin documentar el motivo y el riesgo.
- En navegadores, Argon2id corre en **Web Worker** (§15) para no bloquear el hilo principal; el worker debe terminar tras derivar y su memoria no debe persistir.

## 5.2 HKDF con domain separation

A partir de la salida de Argon2id, **nunca** se usa directamente como clave. Se expande con HKDF-SHA-256 usando etiquetas fijas y versionadas:

```text
IKM  = Argon2id(master_password, salt, m, t, p)

auth_key = HKDF-SHA256(IKM, salt=local_salt, info="greenline-vault/v1/auth")
kek      = HKDF-SHA256(IKM, salt=local_salt, info="greenline-vault/v1/kek")
recovery = HKDF-SHA256(IKM, salt=local_salt, info="greenline-vault/v1/recovery")
```

Esto garantiza que:

- comprometer una clave no revele las demás;
- un verifier de auth no sirve para descifrar;
- el versionado (`v1`) permite migraciones sin colisiones semánticas.

## 5.3 Key confirmation (corregida en la V5)

La confirmación de clave sirve para que el cliente detecte una master password incorrecta **antes** de tocar el resto de la bóveda. Se hace intentando desenvolver un envoltorio de prueba con la KEK derivada:

```text
KEK derivada
   |
   v
desenvolverClave(KEK, envoltura_de_prueba, contexto)
   |
   +--> funciona  -> kek correcta, continuar
   +--> falla     -> master password incorrecta, abortar sin descargar nada
```

> **Prohibido** guardar en el servidor un confirmation value (MAC o envoltorio) derivado de la master password. Bajo la Opción C de §3.1 eso añadiría un segundo oráculo de fuerza bruta offline al que ya existente en los `wrapped_keys`, y bajo cualquier opción convertiría al servidor en custodio de material derivado de la maestra, que es justo lo que §3 excluye.

La confirmación es **local y transient**: no viaja en la red y no se persiste. La sincronización de versión criptográfica entre cliente y servidor se hace declarando `crypto_version` y `kdf_version` en el bootstrap, no con un MAC.

## 5.4 Otras reglas

- El salt no es secreto y puede almacenarse junto con los metadatos de la bóveda.
- No se debe almacenar la contraseña maestra.
- El salt de la bóveda **no** debe confundirse con el salt del hash de la contraseña de la cuenta: deben ser distintos.

---

# 6. JERARQUÍA DE CLAVES

La V5 utiliza una arquitectura de claves separadas **y añade la capa asimétrica que V4 no tenía**.

## 6.1 Capa simétrica (protección del propio usuario)

```text
Master Password
       |
       v
   Argon2id + HKDF
       |
       v
    Root Key Material
       |
       v
  Key Encryption Key (KEK)
       |
       +--> DEK v1  --+
       +--> DEK v2  --+--> AES-256-GCM + AAD --> Vault Items
       +--> DEK v3  --+
```

- La DEK **no** se almacena en texto plano: se almacena envuelta por la KEK (envelope encryption).
- Esto permite rotación, versionado, revocación, recuperación controlada, migración criptográfica y separación de responsabilidades.

## 6.2 Capa asimétrica (obligatoria para multiusuario)

Cada bóveda (y cada usuario) genera además un par de claves **X25519** para cifrado y **Ed25519** para firma:

```text
User Key Pair
   |
   +--> X25519 (encryption)  --> ECDH + HKDF + AES-256-GCM
   |                              para envolver DEKs hacia otros usuarios
   |
   +--> Ed25519 (signing)    --> firmas sobre:
                                  - anclas de auditoría (§24)
                                  - invitaciones/compartición (§26)
                                  - aprobaciones de break-glass (§41)
```

Sin esta capa, con la jerarquía puramente simétrica de la V4:

- **no se puede** compartir un ítem con otro usuario sin enviarle la KEK (lo cual rompe el modelo);
- **no se puede** hacer emergency access ni recovery multifirma;
- **no se puede** demostrar la autoría de una aprobación administrativa.

Reglas:

- R6: La clave privada se genera en cliente, se protege con la KEK del usuario y **nunca** sale en claro.
- R7: La clave pública puede almacenarse en claro.
- R8: El material efímero de ECDH debe ser de un solo uso (nunca reutilizar nonces en el envelope asimétrico).
- R9: Rotar el par asimétrico no debe obligar a re-cifrar toda la bóveda, sólo los envelopes destinados a ese usuario.

---

# 7. ENVELOPE ENCRYPTION

Cada bóveda debe tener una o más claves de datos protegidas mediante una clave superior.

Ejemplo:

```text
KEK v1 (derivada de la master password vigente)
  |
  +--> envuelve DEK v1
  +--> envuelve DEK v2
  +--> envuelve DEK v3
```

Cada registro cifrado debe disponer de metadatos criptográficos suficientes para identificar:

```text
ciphertext_version
algorithm
key_version
nonce
ciphertext
authentication_tag
aad (o los campos canónicos con los que se reconstruye)
```

No se deben reutilizar nonces/IV con la misma clave cuando el algoritmo lo prohíba.

La rotación de claves debe ser compatible con versiones anteriores mientras dure la migración.

## 7.1 Reglas de envelope

- R10: El envoltorio de cada DEK debe incluir su propio `key_version` **dentro** del AAD del envoltorio (evita *key-version confusion*).
- R11: Debe existir un registro de claves (`wrapped_keys`) con `key_id`, `key_version`, `algorithm`, `wrapped_dek`, `created_at`, `revoked_at`.
- R12: Una DEK revocada **no** debe desbloquear items nuevos; los items existentes deben poder migrarse a la nueva versión.
- R13: El cambio de master password reenvuelve DEKs (§27); no re-cifra items.

---

# 8. CIFRADO AUTENTICADO, AAD Y GESTIÓN DE NONCES

Para los secretos de la bóveda se debe utilizar un esquema de cifrado autenticado como AES-256-GCM o XChaCha20-Poly1305, correctamente implementado.

El objetivo no es únicamente ocultar los datos. También debe detectarse:

- modificación
- truncamiento
- corrupción
- sustitución
- **replay de versiones antiguas**
- **trasplante de ciphertext entre ítems** (*ciphertext splicing*)

No implementar criptografía propia. Debe utilizarse Web Crypto API o una biblioteca criptográfica ampliamente auditada y mantenida.

## 8.1 AAD contextual (OBLIGATORIO — nuevo en V5)

**Esta es la corrección más importante de la V5.** Con AES-GCM sin `additionalData`, un atacante que roba la base de datos puede copiar el ciphertext del ítem A sobre la fila del ítem B y la autenticación seguirá siendo válida: el dato "autenticado" no está ligado a su contexto.

Todo ciphertext debe autenticar un encabezado canónico construido **exactamente igual en cliente y servidor**:

```text
AAD = "GLV5"                    // dominio/versión del formato
    + "|" + vault_id
    + "|" + item_id
    + "|" + owner_id
    + "|" + key_version
    + "|" + algorithm
    + "|" + nonce_b64
```

Reglas:

- R14: El AAD se serializa de forma canónica (orden fijo de campos, UTF-8, sin espacios) y su texto literal debe estar en el repo como constante compartida.
- R15: Si **cualquiera** de esos campos cambia en la fila, el descifrado debe fallar.
- R16: La sustitución de ciphertext entre dos ítems **debe** provocar fallo de autenticación; esto tiene prueba obligatoria en §38.
- R17: Los metadatos que alteran la autorización (`owner_id`, `tenant_id`) también deben formar parte del AAD, o en su defecto validarse en servidor **y** tener prueba de integridad.

## 8.2 Nonces: límites cuantitativos

V4 sólo decía "no reutilizar nonces". V5 fija techos:

```text
AES-256-GCM con IV aleatorio de 96 bits:
  límite práctico por clave:  2^32 mensajes
  techo operativo impuesto:   100.000 items por DEK
  al alcanzar el techo:       rotación obligatoria de DEK

XChaCha20-Poly1305 con nonce de 192 bits:
  tolera volúmenes mucho mayores
  recomendado si la librería ya está disponible
```

Reglas:

- R18: El contador de items por `key_version` se almacena y se comprueba antes de cifrar.
- R19: Está prohibido derivar el nonce desde un contador predecible sin una construcción auditada.
- R20: Si se detecta reutilización de nonce con la misma clave, se declara incidente (§46) y se rota la DEK.
- R21: Un cifrado con `algorithm` desconocido o fuera de la lista blanca debe rechazarse, no intentarse.

## 8.3 Protección contra replay

El AAD enlaza el ciphertext a su fila, pero no impide que alguien restaure una **versión antigua** válida. Para ello:

- R22: Cada ítem lleva un contador `revision` incluido en el AAD.
- R23: El servidor descarta escrituras cuya `revision` no sea estrictamente mayor que la almacenada (con margen de concurrencia controlado).
- R24: Las respuestas de reveal deben incluir la `revision` vigente para que el cliente la verifique.

---

# 9. SESIÓN VS DESBLOQUEO DE LA BÓVEDA (NUEVA EN V5)

Este es el requisito que más alto impacto tiene y que V4 no plantea.

**Regla central:**

> Un token de sesión válido **nunca** debe ser suficiente para descifrar la bóveda. La capacidad de descifrar reside exclusivamente en la Vault Unlock Key derivada en cliente a partir de la master password, que vive únicamente en memoria.

```text
ESTADO A — Sesión
  dónde: cookie HttpOnly + estado en memoria
  quién lo emite: backend
  sirve para: llamar a la API, listar metadatos, auditar
  NO sirve para: descifrar nada

ESTADO B — Desbloqueo de bóveda
  dónde: memoria del Web Worker, nunca en storage
  quién lo emite: nadie (lo deriva el cliente)
  sirve para: envolver/desenvolver DEKs, revelar secretos
  caduca por: inactividad, cierre de pestaña, logout, revocación
```

Requisitos:

- R25: La Unlock Key se guarda en una variable dentro de un Web Worker o de un closure, **nunca** en `localStorage`, `sessionStorage`, IndexedDB, cookies, estado global de React ni Redux/Zustand persistente.
- R26: Auto-lock por inactividad configurable (default 15 minutos sin interacción, 5 minutos en ítems marcados como críticos).
- R27: Auto-lock al ocultar la pestaña/`visibilitychange`, al cerrar la pestaña y en `logout`.
- R28: El refresh de sesión (§19) **no** debe desbloquear la bóveda; tras refrescar, si la Unlock Key ya no está en memoria, se vuelve a pedir la master password.
- R29: Revocar una sesión en el servidor **no** puede borrar la Unlock Key de la memoria del cliente, por lo que la protección real contra robo de dispositivo es el bloqueo del equipo y el auto-lock (declararlo en §53).
- R30: Ninguna función del servidor puede devolver material que permita descifrar sin Unlock Key presente.

---

# 10. MODELO DE DATOS DE LA BÓVEDA

La información sensible debe mantenerse separada de los metadatos que puedan manejarse sin descifrar.

```text
vaults
---------------------------------
id
owner_id
tenant_id
kdf_name            (argon2id)
kdf_salt
kdf_m, kdf_t, kdf_p
kdf_version
pub_key_x25519      (clave pública, claro)
pub_key_ed25519     (clave pública, claro)
crypto_suite_version
created_at
updated_at
locked_at

vault_items
---------------------------------
id
vault_id
owner_id
tenant_id
item_type
revision            (contador anti-replay, §8.3)
encrypted_blob
aad_header          (campos canónicos usados como AAD)
crypto_version
key_version
nonce
created_at
updated_at
deleted_at

wrapped_keys
---------------------------------
id
vault_id
key_version
algorithm
wrapped_dek
aad_header
created_at
revoked_at

vault_shares              (§26)
---------------------------------
id
item_id / vault_id
grantee_user_id
grantee_pubkey_x25519
wrapped_key
grantor_signature_ed25519
expires_at
revoked_at
```

El contenido cifrado puede contener:

```json
{
  "title": "Correo corporativo",
  "username": "usuario@example.com",
  "password": "********",
  "url": "https://example.com",
  "notes": "********",
  "totp_secret": "********"
}
```

El JSON anterior es únicamente conceptual. En almacenamiento debe existir únicamente su representación cifrada. No se deben guardar contraseñas en columnas separadas en texto plano.

## 10.1 Fuga por metadatos

Los metadatos no cifrados también filtran. Debe evaluarse qué es visible sin descifrar:

```text
visible sin clave:   nº de items, tipo, fechas, tamaño del blob, tenant
no visible:          título, usuario, URL, notas, contraseña, TOTP
opcional a proteger: tipo de item (p. ej. "banking") → subirlo al blob
```

- R31: El `item_type` debe estar en el blob si su valor aumenta materialmente el impacto de una fuga de metadatos.
- R32: Los tamaños de blob pueden requerir padding si el patrón de longitud es identificable.
- R33: La búsqueda en la bóveda se hace **en cliente** tras descifrar; no se debe crear un índice de texto plano del contenido en el servidor.

---

# 11. MODELO DE DATOS CRIPTOGRÁFICO

Cada elemento cifrado debe poder asociarse conceptualmente con:

```text
vault_item_id
vault_id
owner_id
tenant_id
revision
crypto_version
key_version
algorithm
nonce
ciphertext
authentication_tag
aad_header
created_at
updated_at
```

Nunca almacenar el secreto en texto plano.

Cada campo tiene una función verificable:

| Campo | Protege contra |
|---|---|
| `key_version` | usar clave equivocada/revocada |
| `algorithm` | downgrade a algoritmo débil |
| `revision` | replay de versiones antiguas |
| `aad_header` | splicing entre ítems y alteración de metadatos |
| `nonce` | colisión (sujeto a §8.2) |

---

# 12. VISUALIZACIÓN SEGURA DE CONTRASEÑAS

La visualización de contraseñas es una de las funciones más sensibles de toda la aplicación.

La interfaz debe comenzar mostrando:

```text
••••••••••••••••
```

Nunca debe mostrar una contraseña automáticamente.

Para visualizarla:

```text
Usuario
  |
  v
Selecciona "Mostrar"
  |
  v
¿Bóveda desbloqueada? --no--> pedir master password (§9)
  |
  v
Reautenticación / Step-up Authentication (§13, validada en servidor)
  |
  +--> MFA cuando la política lo requiera
  |
  v
Autorización (usuario + tenant + rol + ownership + RLS)
  |
  v
Comprobación anti-automatización y rate limit (§21)
  |
  v
Descifrado en cliente con AAD vigente (§8)
  |
  v
Visualización temporal
  |
  +--> ocultar automáticamente (default 15 s)
  +--> limpiar estado sensible
  +--> registrar evento SIN el secreto (§23)
```

La contraseña debe mostrarse únicamente después de una acción explícita.

Requisitos de presentación:

- R34: El componente de revelado debe ser un componente aislado, sin props innecesarias y sin renderizar el secreto en el árbol de React hasta el momento del reveal.
- R35: Tras el timeout, el estado debe ponerse a `null` (no `''`), y el componente debe desmontarse.
- R36: El `title`, `aria-label`, atributos `data-*` y cualquier placeholder **nunca** deben contener el valor.
- R37: No debe permitirse el reveal múltiple masivo sin step-up explícito por lote (§33).

---

# 13. STEP-UP AUTHENTICATION

No debe asumirse que una sesión válida concede automáticamente permiso para revelar todos los secretos.

Para operaciones de alto riesgo se debe solicitar autenticación reforzada. Ejemplos:

- mostrar contraseña;
- copiar contraseña;
- revelar TOTP;
- exportar bóveda;
- modificar credenciales críticas;
- cambiar configuración criptográfica;
- generar recovery keys;
- compartir un ítem (§26);
- revocar o eliminar la bóveda;
- invocar break-glass administrativo (§41).

Dependiendo de la política, puede requerirse:

```text
Sesión válida
+
reautenticación
+
MFA
```

## 13.1 El step-up se valida en el SERVIDOR (nuevo en V5)

V4 describía el flujo pero no exigía dónde se verifica. V5 lo fija:

```text
Cliente                      Servidor
   |                             |
   | POST /auth/step-up         |
   |  {purpose, item_id}        |
   |---------------------------->|
   |                     valida contraseña/MFA
   |                     emite step-up token
   |  {step_up_token, ttl}      |
   |<----------------------------|
   |                             |
   | POST /vault/items/:id/reveal
   |  Authorization: Bearer <session>
   |  X-Step-Up: <step_up_token> |
   |---------------------------->|
   |                     valida: firma, exp, jti no usado,
   |                     purpose=reveal, item_id coincide,
   |                     sub coincide con la sesión
   |                     registra jti como consumido
   |  {ciphertext...}           |
   |<----------------------------|
```

Requisitos:

- R38: El step-up token debe ser de **un solo uso** (`jti` registrado en servidor) con TTL corto (30–120 s).
- R39: Debe llevar claims `sub`, `purpose`, `acr`/`amr` y, si aplica, el hash del `item_id`.
- R40: Reutilizar un token de step-up para otra acción o para otro ítem debe rechazarse.
- R41: El descifrado real ocurre en cliente con la Unlock Key; el step-up sólo autoriza la **entrega** de material.
- R42: El fallo de step-up debe contar hacia el mismo sistema de backoff que el login (§17) para evitar fuerza bruta sobre la reautenticación.
- R43: Un chequeo de step-up implementado únicamente en el cliente **no cumple** este documento.

## 13.2 Alcance real del step-up en una bóveda client-side (aclaración de la Fase 2)

Al implementar §13 en una bóveda verdaderamente zero-knowledge aparece una tensión que V4 ni siquiera planteaba y que conviene dejar escrita antes de que alguien la descubra en producción:

```text
Si el cliente ya tiene:
   ciphertext de todos los items  +  DEK envuelta  +  KEK derivada localmente
entonces el cliente PUEDE descifrar sin pedir permiso a nadie.
```

Un endpoint servidor de step-up **no puede impedir** que el cliente descifre: para hacerlo tendría que retener el material, y retenerlo rompería el modelo de §3. Por tanto:

| Qué protege el step-up server-side (§13.1) | Qué protege el step-up local (este §13.2) |
|---|---|
| Que una *llamada a la API* no obtenga material adicional (blobs nuevos, export masivo, rotación de claves) | Que una *persona distinta* ante un navegador desbloqueado no revele secretos |
| Reutilización de tokens, binding a ítem, límite de frecuencia en servidor | Teclado sin vigilancia, pantalla compartida, alguien que se acerca al escritorio |
| Auditoría firmada por el servidor | Auditoría local (§23), con el mismo valor que cualquier evento de cliente |

**Resultado práctico:**

- R38–R43 siguen siendo obligatorios **para todo lo que atraviesa la red** (export, rotación, compartición, recuperación, endpoints de material).
- Para el reveal local, el step-up local (revalidar la maestra en el worker, comparación en tiempo constante y grant de un solo uso) es el control correcto y es lo que implementa `useStepUp` — con `validadoEnServidor: false` explícito, para que el checklist de §52 no se marque por error.
- La garantía real sobre quién puede *leer* la bóveda la da **RLS + auditoría** (§20, §23), no el step-up.

> En resumen: en una bóveda client-side el step-up **no autoriza el descifrado** (ya es posible), autoriza la **decisión de mostrar**. No confundir ambas cosas.

---

# 14. COPIAR CONTRASEÑAS

La función "Copiar" también debe considerarse una operación sensible.

Requisitos:

- no registrar la contraseña en logs;
- no incluirla en URLs;
- no enviarla a analytics;
- no introducirla en herramientas de observabilidad;
- limpiar el clipboard después de un periodo configurable;
- avisar al usuario cuando corresponda;
- auditar el evento sin registrar el secreto;
- tratar la copia con el **mismo** step-up que el reveal (R44).

Ejemplo de auditoría:

```text
PASSWORD_COPIED
user_id: 123
vault_item_id: 456
revision: 7
step_up_jti: ...
timestamp: ...
ip: ...
device: ...
```

Nunca:

```text
password: "MiContraseña123"
```

## 14.1 Límites reales del clipboard (nuevo en V5)

```text
navigator.clipboard.writeText(pw)
   |
   +--> requiere contexto seguro (HTTPS) y permiso
   +--> el SO lo copia a memoria compartida entre procesos
   +--> Windows conserva HISTORIAL (Win+V) salvo que el usuario lo vacíe
   +--> gestores de clipboard / clipboard en la nube pueden sincronizarlo
   +--> otras aplicaciones con acceso al portapapeles pueden leerlo
   +--> el borrado programado NO garantiza que no haya copias previas
```

Requisitos:

- R45: Nunca copiar al portapapeles **sin** step-up previo.
- R46: El borrado tras el timeout debe hacerse con `navigator.clipboard.writeText('')` o `ClipboardItem` efímero, **sin** presentarlo como garantía.
- R47: La UI debe avisar de que el sistema puede conservar un historial y cómo vaciarlo.
- R48: Debe existir un ajuste para desactivar la función de copia en entornos de alto riesgo.
- R49: El riesgo residual del historial del SO debe estar en §53.

---

# 15. PROTECCIÓN DEL FRONTEND Y DE LA MEMORIA

La contraseña descifrada debe permanecer en memoria el menor tiempo posible.

Buenas prácticas:

- evitar persistencia innecesaria;
- no usar localStorage para secretos descifrados;
- no usar sessionStorage para secretos salvo justificación explícita;
- no incluir secretos en Redux/Zustand u otros estados globales persistentes;
- no incluir secretos en URLs;
- no incluir secretos en errores;
- no incluir secretos en logs;
- minimizar copias innecesarias en memoria;
- ocultar inmediatamente después del timeout.

La interfaz debe utilizar componentes aislados para la visualización de secretos.

## 15.1 Tratamiento de la memoria en JavaScript (nuevo en V5)

```text
JS String  -> inmutable, no se puede sobreescribir
              (copias en el heap hasta que el GC decida)
Uint8Array -> sí se puede rellenar con zeros explícitamente
```

- R50: El material derivado y el plaintext deben viajar como `Uint8Array`/`DataView` y sólo convertirse a `string` en el último momento del render.
- R51: Antes de soltar el material, sobreescribir con `fill(0)`. Documentar que esto es **mejora, no garantía** (§53).
- R52: Argon2id, HKDF y AES deben ejecutarse en un **Web Worker** dedicado, que se termina (`worker.terminate()`) al auto-lock y al logout.
- R53: No serializar el estado de bóveda a JSON para `postMessage` si contiene material derivado en claro; pasar `Uint8Array` transferibles.
- R54: Desactivar el guardado de formularios del navegador en los campos de master password (`autocomplete="off"` / `"new-password"`).
- R55: No usar `console.log`, `console.error`, `JSON.stringify` ni devtools de React sobre objetos que contengan la Unlock Key o plaintext.
- R56: El estado sensible no debe quedar en `performance.memory`, en snapshots de error ni en extensiones de React DevTools.

---

# 16. PREVENCIÓN DE XSS Y SUPERFICIE DE EJECUCIÓN

Una vulnerabilidad XSS en una aplicación de bóveda puede ser catastrófica: el atacante ejecuta código en el contexto que posee la Unlock Key y puede keyloggear la master password o exfiltrar los plaintext en el momento del reveal.

Por ello:

- CSP estricta (nonce-based, `strict-dynamic`, sin `'unsafe-inline'` ni `'unsafe-eval'`);
- sanitización obligatoria de **todo** HTML de terceros o de usuarios con DOMPurify u homólogo;
- evitar `dangerouslySetInnerHTML` salvo que el valor pase por el sanitizer en el mismo punto;
- Trusted Types (`require-trusted-types-for 'script'`) cuando el navegador lo soporte;
- cookies Secure, HttpOnly cuando corresponda, SameSite apropiado;
- protección CSRF cuando corresponda (§19 fija el modelo de sesión);
- dependencias auditadas y protección contra supply-chain attacks;
- **sin scripts de terceros en las rutas de la bóveda** (CDN, widgets, hotjar, analytics, chat);
- `frame-ancestors 'none'` para impedir clickjacking sobre el diálogo de reveal;
- Integrity Subresource (SRI) o, preferentemente, todo el bundle auto-hospedado.

Requisitos nuevos:

- R57: Toda ruta `/admin` y `/vault` debe servirse con CSP más restrictiva que la pública, generada por nonce por render (o por hash de bundle con `strict-dynamic`).
- R58: Un informe de CSP (`report-uri`/`report-to`) debe alimentar una alerta de seguridad.
- R59: Si el origen entrega código manipulado (compromiso de build), la bóveda está perdida: por eso §44 exige integridad del artefacto desplegado y reproducibilidad.
- R60: Ninguna entrada de usuario, ni siquiera del blog o de un campo "nota", puede llegar a `innerHTML` sin sanitizar. Aplica **incluso** en rutas que no son de bóveda si comparten origen con ella.

---

# 17. AUTENTICACIÓN

La autenticación de la **cuenta** (que no de la bóveda, §4.1) debe incorporar:

- Argon2id con parámetros de §5.1 para el hash de la contraseña de cuenta;
- MFA (§18);
- protección contra credential stuffing;
- rate limiting;
- backoff progresivo;
- bloqueo adaptativo;
- detección de actividad anómala;
- gestión segura de sesiones (§19);
- revocación de sesiones;
- rotación de tokens;
- expiración apropiada.

No se debe utilizar una regla rígida de "5 intentos al día" para todos los escenarios. La política debe considerar:

```text
IP
usuario
dispositivo
historial de intentos
riesgo
tipo de operación
```

## 17.1 Política de la master password (nueva en V5)

Toda la jerarquía criptográfica es tan fuerte como la master password. V5 exige:

- R61: Mínimo **14 caracteres** de longitud, recomendado **16+** o una passphrase de 4+ palabras aleatorias.
- R62: Comprobación k-anonymity contra Have I Been Pwned (API de rangos, enviando sólo los 5 primeros caracteres del SHA-1) **en cliente**, nunca la contraseña.
- R63: Comprobación de diccionario/patrones comunes en cliente.
- R64: Evaluación de entropía estimada con umbral configurable; si falla, sólo se permite con confirmación explícita y queda registrado en auditoría.
- R65: La master password **no** puede coincidir con la contraseña de la cuenta si el modelo lo permite detectar sin revelar ninguna de las dos.
- R66: El feedback de fuerza no debe ejecutar llamadas de red con la contraseña o derivados no hasheados.

## 17.2 Bloqueo y backoff

- R67: El login y el step-up comparten contadores de intento por cuenta.
- R68: Tras N fallos, exigir un factor adicional en lugar de bloquear indefinidamente (evita DoS sobre cuentas).
- R69: Todo bloqueo, desbloqueo y reset debe quedar en auditoría (§23).

---

# 18. MFA

Se debe soportar MFA. Opciones:

- TOTP;
- WebAuthn / Passkeys;
- llaves de seguridad;
- mecanismos empresariales compatibles.

Para operaciones extremadamente sensibles, WebAuthn/Passkeys puede utilizarse como segundo factor o step-up cuando el entorno lo permita.

Los secretos TOTP también deben almacenarse cifrados.

Requisitos adicionales:

- R70: Queda **prohibido** usar como step-up un segundo factor que resida en la misma bóveda (p. ej. exigir un TOTP cuyo secreto está dentro de la bóveda que se está revelando) — es circular e inseguro si la master password está comprometida. Usar passkey, dispositivo separado o la master password.
- R71: Los códigos de recuperación del MFA deben generarse una vez, mostrarse una vez y guardarse cifrados o fuera del sistema.
- R72: Quitar o cambiar el MFA es una operación de step-up + auditoría + notificación al canal del usuario.
- R73: Debe quedar explícito que el MFA protege la **cuenta**, no la bóveda: quien tiene la master password y la bóveda desbloqueada no necesita MFA. Esta limitación va en §53.

---

# 19. SESIONES

Las sesiones deben: expirar, poder revocarse, rotarse, asociarse a un dispositivo cuando sea apropiado, detectar actividad anómala, evitar tokens permanentes y protegerse contra robo.

## 19.1 Modelo de sesión fijado por V5

V4 decía "cuando corresponda" para CSRF y no decidía el modelo. V5 lo decide:

```text
ACCESS TOKEN
  - JWT corto (10–15 min)
  - en memoria (React state) o cookie HttpOnly si el backend lo soporta
  - Authorization: Bearer

REFRESH TOKEN
  - cookie Secure + HttpOnly + SameSite=Strict + __Host- prefix
  - rotación en cada uso, detección de reutilización → revocar familia
  - nunca en localStorage/sessionStorage
```

- R74: Con el refresh token en cookie HttpOnly, el CSRF pasa a ser pertinente: exigir `Origin`/`Sec-Fetch-Site` verificados y token anti-CSRF en mutaciones si el esquema lo requiere.
- R75: La reutilización de un refresh token ya usado debe revocar toda la familia de sesiones del usuario.
- R76: Cerrar sesión debe revocar en servidor **y** limpiar el estado de bóveda de memoria (§9).
- R77: Revocar una sesión desde el panel de dispositivos debe surtir efecto en el siguiente request, no al expirar.
- R78: Los tokens sensibles no deben quedar accesibles a JavaScript innecesariamente (§9 R25).
- R79: Cambiar la master password o detectar actividad anómala debe revocar todas las sesiones (§27, §33).

---

# 20. ROW LEVEL SECURITY E IDENTIDAD DUAL

La V5 mantiene RLS como una capa fundamental.

Ejemplo conceptual para Supabase:

```sql
ALTER TABLE public.vault_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vault_owner_access"
ON public.vault_items
FOR ALL
USING (
  owner_id = auth.uid()
  AND tenant_id = current_setting('app.current_tenant', true)
)
WITH CHECK (
  owner_id = auth.uid()
  AND tenant_id = current_setting('app.current_tenant', true)
);
```

Para escenarios multi-tenant: `tenant_id + owner_id + role` deben formar parte del modelo de autorización.

Los índices deben diseñarse a partir de los patrones reales de consulta y verificarse mediante EXPLAIN/EXPLAIN ANALYZE. No se debe afirmar que RLS sea automáticamente O(1); el rendimiento depende del plan de ejecución y del diseño de índices.

## 20.1 Identidad dual (nueva en V5)

Cuando el backend autentica con **JWT propio** y los datos viven en **Supabase** con `auth.uid()`, `auth.uid()` estará vacío o será distinto y la política fallará de dos maneras:

```text
FAIL CLOSED  -> la app deja de funcionar  (visible)
FAIL OPEN    -> se usa service_role key o bypass  (INVISIBLE Y CRÍTICO)
```

Requisitos:

- R80: Debe existir un mecanismo explícito que mapee la sesión del backend a `auth.uid()` (JWT exchange, ficha de sesión Supabase firmada, o API intermedia que nunca exponga la service-role key al cliente).
- R81: **La service-role key jamás debe estar en el bundle del frontend**, en una env accesible a Vite (`VITE_*`) ni en el código del cliente.
- R82: Todas las políticas de bóveda deben comprobarse en CI con la suite §38 (usuario A vs usuario B, tenant A vs tenant B).
- R83: Debe existir test de que una conexión con rol anónimo no lee ni escribe `vault_items`, `wrapped_keys` ni `vault_shares`.
- R84: Prohibido `SECURITY DEFINER` sin revisión explícita: muchas funciones saltan el RLS.
- R85: Vistas, triggers y jobs de mantenimiento que tocan `vault_items` deben auditarse por capacidad de bypassear RLS.
- R86: La política debe aplicarse también a `UPDATE`/`DELETE` (no sólo `SELECT`, como en el ejemplo simplificado de V4).

---

# 21. API DE LA BÓVEDA

Las operaciones deben estar separadas por nivel de sensibilidad.

Ejemplo:

```text
GET /vault/items                    -> metadatos mínimos (título está dentro del blob)
GET /vault/items/:id                -> blob cifrado + AAD + revision
POST /vault/items/:id/reveal        -> paso de step-up, NO devuelve el secreto si la bóveda es client-side
POST /auth/step-up                  -> emite step_up_token
POST /vault/export                  -> export cifrado (§28)
POST /vault/recovery/generate       -> genera recovery key (§25)
```

El endpoint `reveal` debe:

1. validar sesión;
2. validar autorización (usuario + tenant + rol + ownership + RLS);
3. comprobar step-up token (firma, exp, jti, purpose, item_id);
4. comprobar MFA si corresponde;
5. aplicar rate limit y anti-automatización;
6. entregar el material autorizado (típicamente el blob y la DEK envuelta) **únicamente** al cliente autorizado;
7. registrar el evento;
8. no registrar el contenido;
9. responder con `Cache-Control: no-store, no-cache, must-revalidate, private` y `Pragma: no-cache`;
10. no ser cacheable por proxies ni por el Service Worker.

Requisitos:

- R87: Todo endpoint de secretos responde `no-store`.
- R88: Rate limit por usuario+IP+acción en reveal, copia, export y step-up (p. ej. 10/min con burst y backoff).
- R89: Límite de paginación y de volumen descargable por sesión (contra extracción masiva).
- R90: Respuestas con secretos no deben aparecer en logs de acceso, en APM ni en respuestas de error.
- R91: Si el descifrado ocurre en cliente, el servidor no debe ofrecer ningún endpoint equivalente "de conveniencia".

---

# 22. PROTECCIÓN CONTRA IDOR/BOLA

Nunca confiar únicamente en:

```text
/vault/items/123
```

El backend debe comprobar:

```text
usuario + tenant + rol + ownership + RLS + revision vigente
```

Un usuario nunca debe poder acceder a otro elemento simplemente modificando un ID.

Requisitos adicionales:

- R92: Las respuestas de error ante objeto inexistente y ante objeto ajeno deben ser **indistinguibles** (mismo status y mensaje) para no permitir enumeración.
- R93: Los IDs deben ser UUIDs o identificadores no enumerables; un ID secuencial no es un control de seguridad, sólo incomoda.
- R94: Los batch/bulk (export, delete masivo, share) deben validar cada elemento individualmente, no sólo el primero.
- R95: La autorización se evalúa **antes** de descargar el blob (evita exfiltración por volumen aunque el descifrado falle).

---

# 23. AUDITORÍA FORENSE

La bóveda debe registrar eventos de alto impacto:

- login;
- logout;
- MFA;
- intento fallido;
- desbloqueo y auto-lock de la bóveda;
- creación de secreto;
- modificación;
- eliminación;
- visualización (reveal);
- copia;
- exportación;
- importación;
- compartir / revocar compartición;
- recuperación;
- cambio de contraseña maestra;
- cambio de claves (re-wrap);
- creación/revocación de dispositivo;
- cambio de política;
- break-glass administrativo;
- cambios administrativos.

Nunca almacenar dentro de los logs:

```text
password
master_password
encryption_key
wrapped_dek
totp_secret
api_key
step_up_token
plaintext de cualquier item
```

Requisitos:

- R96: El evento se registra **antes** de entregar el material (o se registra el intento y el resultado por separado) para que no haya ventana sin rastro.
- R97: Los campos del evento se definen por esquema (allowlist); prohibido loguear objetos arbitrarios o `JSON.stringify(payload)`.
- R98: La IP se almacena con la política de minimización de datos aplicada (¶ §40 de privacidad) y con retención definida.
- R99: El usuario debe poder consultar la auditoría de su propia bóveda desde la UI.

---

# 24. INTEGRIDAD DEL AUDIT LOG

La tabla de auditoría debe tener controles de privilegios.

Adicionalmente, se utiliza una cadena de hashes:

```text
Hash(n) = H(prev_hash || evento_canonico || timestamp)
   |
   v
Hash(n+1)
   |
   v
Hash(n+2)
```

Cada registro incluye el hash del registro anterior para dificultar modificaciones silenciosas.

**Corrección V5:** una cadena interna **no basta**. Quien puede reescribir la tabla reescribe la cadena completa y recalcula todos los hashes. Se exige ancla externa:

```text
Audit Logs (últimos N eventos)
     |
     v
  Merkle Tree
     |
     v
  Merkle Root
     |
     +--> firma Ed25519 con clave de anclaje (§6.2)
     |
     +--> publicación periódica (cada 15–60 min) a:
            - object storage inmutable / WORM
            - transparency log
            - blockchain (opcional)
```

Requisitos:

- R100: El anclaje debe ser periódico y su ausencia debe generar alerta (no es opcional "si hay tiempo").
- R101: Debe existir una utilidad de verificación que, dada una exportación de auditoría del usuario, compruebe la cadena y la firma de la última ancla.
- R102: Los roles con acceso de escritura a la tabla de auditoría deben ser distintos de los que tienen acceso a `vault_items`.
- R103: Se recomienda `REVOKE UPDATE, DELETE` sobre la tabla de auditoría para el rol de aplicación, usando sólo `INSERT` y `SELECT`.
- R104: No publicar secretos ni PII en la blockchain: sólo hashes/roots.

---

# 25. RECUPERACIÓN DE LA BÓVEDA

La recuperación debe diseñarse antes de implementar el sistema.

No debe existir una función administrativa equivalente a:

```text
"Ver contraseña maestra del usuario"
ni
"Descifrar bóveda desde el panel admin"
```

## 25.1 Restricción anti-escrow (nueva en V5)

> **Ningún componente del servidor, ni ninguna cuenta administrativa, debe ser capaz de obtener o derivar material que permita descifrar la bóveda.** Si el mecanismo de recuperación otorga eso al servidor, el sistema no es zero-knowledge y debe declararse así en §53.

Un mecanismo que incumple esto:

```text
PROHIBIDO:  "guardamos una copia de la KEK cifrada con una clave maestra del servidor"
PROHIBIDO:  "el admin puede reenvolver las DEKs del usuario"
PERMITIDO:  "el usuario genera una recovery key localmente y nunca sale del dispositivo salvo para guardárla"
```

## 25.2 Opciones aceptadas

- Recovery Key generada en cliente (256 bits), descargable/imprimible, **nunca** transmitida al servidor;
- clave de recuperación de un solo uso, guardada fuera del sistema;
- dispositivo confiable registrado (envoltura de DEK hacia la clave pública del dispositivo);
- emergency access hacia otro usuario mediante envoltura asimétrica (§6.2) con **delay + notificación + aprobación**;
- Shamir Secret Sharing con umbral (p. ej. 2 de 3) para organizaciones;
- procedimiento empresarial documentado con dual control.

## 25.3 Requisitos

- R105: La recovery key se genera con CSPRNG en cliente y se deriva una KEK de recuperación con HKDF `info="greenline-vault/v1/recovery"`.
- R106: Al activar la recuperación se reenvuelven las DEKs vigentes bajo esa KEK de recuperación en `wrapped_keys` con `key_version` propio.
- R107: Usar la recovery key debe revocarse tras el primer uso (o permitir sólo un re-wrap) y quedar en auditoría.
- R108: La recuperación debe documentar **qué se recupera** (items) y **qué queda permanentemente inaccesible** (p. ej. historial, claves asimétricas viejas, shares).
- R109: Tras recuperar, se exige cambiar la master password y revocar todas las sesiones.

---

# 26. COMPARTIR BÓVEDAS Y ACCESO DE EMERGENCIA (NUEVA EN V5)

Requisito ausente en V4 y necesario en un ERP multiusuario.

```text
Usuario A (propietario)
   |  quiere compartir item X con Usuario B
   v
Obtiene pub_key_x25519 de B (registro público verificable)
   |
   v
DEK_del_item (o DEK de la bóveda)
   |
   +--> ECDH(eph_priv_A, pub_B) -> HKDF -> wrapped_key
   |
   +--> firma Ed25519 de A sobre (item_id, pub_B, wrapped_key, expires_at)
   |
   v
vault_shares
```

Requisitos:

- R110: **Nunca** compartir enviando la master password ni la KEK del propietario.
- R111: La compartición debe ser por elemento o por bóveda, con expiración y revocación.
- R112: Revocar obliga a que B ya no pueda resolver el wrapped key; no garantiza que B no haya descifrado antes — declararlo en §53.
- R113: Toda compartición, revocación y uso de share va a auditoría firmada.
- R114: Las claves públicas deben poder verificarse contra la identidad (fingerprint mostrado en UI, confirmación en canal secundario para comparticiones sensibles).
- R115: Un emergency access debe imponer un delay (p. ej. 24–72 h) con notificación al propietario y cancelación posible.

---

# 27. CAMBIO DE CONTRASEÑA MAESTRA

El cambio de contraseña maestra debe contemplar:

```text
Master Password antigua
        |
        v
Unlock Key actual presente en memoria  (o pedirla)
        |
        v
derivar IKM nueva con Argon2id(salt nuevo, params)
        |
        v
HKDF -> nueva KEK
        |
        v
desenvolver cada DEK vigente con la KEK antigua
        |
        v
re-envolver cada DEK con la KEK nueva   <- operación ATÓMICA
        |
        v
rotar salt + parámetros en vaults
        |
        v
revoke all sessions + notificación
        |
        v
auditar
```

Siempre que la arquitectura lo permita, se debe evitar descifrar y volver a cifrar individualmente millones de registros. El objetivo es rotar o reenvolver claves de forma eficiente.

Requisitos:

- R116: El re-wrap debe ser transaccional: o se actualizan todos los `wrapped_keys` y el salt, o no cambia nada. Nunca un estado mixto (nueva contraseña + DEKs viejas) que deje la bóveda inaccesible.
- R117: Debe conservarse temporalmente la KEK antigua versionada hasta confirmar que todos los clientes completaron la migración, con ventana y revocación posterior.
- R118: Exige step-up con MFA (§13).
- R119: Tras el cambio: revocar todas las sesiones, notificar por canal independiente, y dejar constancia en auditoría con `prev_hash`.
- R120: El cliente debe verificar tras el re-wrap que puede re-descifrar una muestra de items antes de confirmar el cambio (rollback automático si falla).

---

# 28. EXPORTACIÓN DE LA BÓVEDA

La exportación es una operación crítica.

Debe:

- requerir step-up authentication;
- requerir MFA según política;
- mostrar advertencia;
- registrar el evento;
- generar formato cifrado;
- evitar exportaciones automáticas;
- aplicar límites;
- permitir revocar sesiones posteriores.

Nunca generar una exportación plaintext por defecto. Si se ofrece exportación plaintext, debe ser una operación excepcional y claramente advertida.

## 28.1 Formato de export cifrado (nueva en V5)

```json
{
  "format": "GL-VAULT-EXPORT",
  "format_version": 1,
  "created_at": "ISO-8601",
  "item_count": 42,
  "kdf": { "name": "argon2id", "m": 65536, "t": 3, "p": 4, "salt": "b64", "version": 1 },
  "cipher": "AES-256-GCM",
  "nonce": "b64",
  "aad": "b64",
  "ciphertext": "b64",
  "mac": "b64"
}
```

Requisitos:

- R121: El export **nunca** reutiliza la master password actual como clave de export: se genera una passphrase de export aleatoria (o se pide una específica) con su propio KDF.
- R122: El formato debe ser versionado e importable por versiones anteriores del mismo formato.
- R123: El plaintext de export no debe pasar por `localStorage`, descargas automáticas sin permiso ni URLs.
- R124: El evento de export incluye número de items, formato y destino, no el contenido.
- R125: Debe existir límite de exports por ventana de tiempo (p. ej. 3/hora) con step-up.
- R126: Si se permite CSV/plaintext, exige doble confirmación, aviso persistente y marca de "export inseguro" en auditoría.

---

# 29. BACKUPS Y DISPONIBILIDAD

Los backups deben estar cifrados.

Debe existir:

```text
Backup encryption
+ Access control
+ Key management
+ Retention policy
+ Restore testing
+ Audit
```

Un backup no debe considerarse seguro únicamente porque PostgreSQL esté cifrado. La seguridad debe cubrir: base de datos, backups, snapshots, logs, objetos, réplicas y entornos de staging.

**Nueva en V5 — disponibilidad:** el modelo de amenazas incluye que un atacante con acceso de escritura **borre o cifre** la bóveda.

- R127: Restauración probada en calendario (no menos de trimestral), con verificación de que el ciphertext restaurado sigue descifrable por los clientes.
- R128: Los clientes deben tener una vía propia de export cifrado periódico (backup del usuario) como contramedida frente a ransomware de la base.
- R129: Separar los backups de las credenciales de acceso a la base: si cae una, no deben caer las otras.
- R130: Definir RPO/RTO y comprobarlos.

---

# 30. SECRETS MANAGEMENT

Las credenciales de infraestructura nunca deben almacenarse en:

```text
Git
.env
logs
tickets
documentación
Docker images
frontend bundles
variables VITE_* del frontend
```

Debe utilizarse un Secret Manager (Doppler / AWS Secrets Manager / Azure Key Vault según el entorno), con rotación y mínimo privilegio.

- R131: Cualquier variable que Vite exponga (`VITE_*`) es **pública** por definición; ningún secreto de bóveda puede vivir ahí (incluida la service-role key, §20 R81).
- R132: Rotación programada y revocación inmediata ante fuga.

---

# 31. BACKEND

El backend debe aplicar: TypeScript estricto; Zod; consultas parametrizadas; Prisma o driver seguro; Helmet; CORS restrictivo; rate limiting; protección CSRF cuando corresponda; límites de payload; validación de Content-Type; manejo centralizado de errores; ausencia de stack traces en producción.

Nunca devolver `password`, `master key`, `encryption key` ni `secret key` en respuestas API no autorizadas.

Requisitos V5:

- R133: `Cache-Control: no-store` en toda respuesta que toque material de bóveda (§21).
- R134: Comparaciones de verifier con `timing-safeEqual`.
- R135: Los errores de validación no deben reflejar el cuerpo recibido si puede contener un secreto.
- R136: Logs de acceso con allowlist de campos; prohibido imprimir `req.body` completo en rutas de bóveda.
- R137: Límite de payload coherente con el tamaño máximo de item (p. ej. 64–256 KB), para evitar DoS por blob gigante.
- R138: El backend no debe tener ninguna ruta que reciba o devuelva la master password o la Unlock Key.

---

# 32. GESTIÓN DE DISPOSITIVOS

Se debe permitir: registrar dispositivos, revocar dispositivos, visualizar sesiones, detectar dispositivos nuevos, invalidar sesiones y aplicar políticas de confianza.

```text
Chrome - Windows
Último acceso: ...
Sesión activa: Sí
Dispositivo registrado: Sí
Bóveda desbloqueada recientemente: Sí
```

No registrar información de ubicación innecesaria.

- R139: Revocar un dispositivo debe invalidar su refresh token y su familia.
- R140: Un dispositivo nuevo que intente desbloquear la bóveda debe poder quedar sujeto a una política de confianza o a paso extra de verificación.

---

# 33. DETECCIÓN DE COMPORTAMIENTO ANÓMALO

Eventos que pueden generar alertas:

```text
N revelaciones en pocos minutos
+ nuevo dispositivo
+ IP inusual
+ múltiples fallos MFA
+ export reciente masivo
+ intentos de step-up repetidos
+ accesos cross-tenant bloqueados
```

El sistema puede requerir step-up, MFA, bloqueo temporal o notificación. Los criterios deben ser configurables para reducir falsos positivos.

- R141: Las alertas al usuario deben ir por un canal independiente de la sesión comprometida (email).
- R142: La detección debe poder disparar revocación de sesiones con un clic desde la UI del usuario.

---

# 34. TOTP Y SECRETOS AUXILIARES

Los TOTP deben estar cifrados igual que las contraseñas.

La aplicación puede ofrecer `Contraseña`, `TOTP`, `Copiar`, `Autocompletar`, pero nunca debe registrar el código TOTP generado.

- R143: El secret TOTP y los códigos generados no aparecen en logs, métricas, DOM beyond del componente de reveal, ni en el atributo `value` del input tras copiar.
- R144: El reloj y la ventana de validez se calculan en cliente; no se pide al servidor que genere códigos (rompería el modelo).

---

# 35. AUTOCOMPLETADO

Si se implementa autocompletado:

- comprobar origen/dominio;
- evitar completar en dominios parecidos;
- prevenir ataques de homograph/punycode;
- evitar filtración entre sitios;
- requerir controles explícitos;
- no enviar credenciales a terceros.

El autocompletado debe tratarse como una superficie de ataque independiente.

- R145: Normalizar el hostname con IDNA y mostrar el dominio canónico antes de autocompletar.
- R146: Bloquear autocompletado en dominios con TLDs sospechosos o distancias de edición 1 del dominio real.

---

# 36. SEGURIDAD DEL NAVEGADOR Y HEADERS

Se deben considerar:

- CSP estricta con nonce / `strict-dynamic` (§16);
- HSTS con `preload` y `max-age` largo;
- `X-Content-Type-Options: nosniff`;
- `Referrer-Policy: no-referrer` en rutas de bóveda;
- `Permissions-Policy` sin cámara/micrófono/geolocalización de más;
- cookies `Secure`, `HttpOnly`, `SameSite`, prefijo `__Host-`;
- `frame-ancestors 'none'`;
- Trusted Types cuando corresponda;
- `Cross-Origin-Opener-Policy: same-origin`;
- `X-Frame-Options: DENY` en rutas de bóveda (defensa en profundidad junto a `frame-ancestors`).

Estos headers deben configurarse donde se sirva la SPA (CDN/hosting) **y** verificarse en CI.

---

# 37. DEVSECOPS

Pipeline mínimo:

```text
Commit
  |
  +--> Secret Scan
  |
  +--> SAST
  |
  +--> Dependency Scan
  |
  +--> Unit Tests
  |
  +--> Integration Tests
  |
  +--> RLS Tests
  |
  +--> Crypto Tests (AAD, nonce, key-version, replay)
  |
  +--> Security Tests
  |
  +--> DAST / OWASP ZAP
  |
  +--> Build reproducible + firma de artefacto
  |
  +--> Deploy con verificación de integridad
```

- R147: El build debe poder reproducirse (mismo commit → mismo hash) o al menos publicarse con firma y hash verificable en el despliegue.
- R148: Los secretos de CI viven en el Secret Manager del proveedor, nunca en el repo.

---

# 38. PRUEBAS ESPECÍFICAS DE LA BÓVEDA

Debe existir una suite específica para comprobar.

### Criptografía

- ciphertext no contiene plaintext;
- modificación del ciphertext falla;
- **modificación de un byte del AAD falla** (§8.1);
- **copiar el ciphertext del ítem A a la fila del ítem B falla** (splicing);
- **restaurar la revisión anterior de un ítem es rechazada** (replay);
- nonce incorrecto falla;
- key version incorrecta falla;
- algoritmo fuera de lista blanca se rechaza;
- claves revocadas no descifran;
- re-wrap conserva accesibilidad;
- el techo de items por DEK dispara rotación (§8.2);
- HKDF con labels distintos produce claves distintas (domain separation).

### Autorización

- usuario A no accede a bóveda B;
- tenant A no accede a tenant B;
- IDOR bloqueado y con respuesta indistinguible (R92);
- RLS bloquea accesos indebidos con rol anónimo y con rol de aplicación;
- administrador no obtiene secretos arbitrariamente;
- service-role key ausente del bundle de producción.

### Sesión y desbloqueo

- un accessToken robado **no** descifra nada (§9);
- la Unlock Key no aparece en `localStorage`, `sessionStorage`, cookies, IndexedDB ni en el estado de React DevTools;
- auto-lock por inactividad y por cierre de pestaña;
- logout limpia la Unlock Key;
- refresh de sesión no mantiene el desbloqueo si se limpió.

### Step-up

- reveal sin step-up → 401/403;
- step-up caducado → rechazado;
- step-up de un solo uso reutilizado → rechazado;
- step-up para item A usado en item B → rechazado;
- step-up con `purpose` distinto → rechazado;
- copia sin step-up → rechazada.

### Visualización

- contraseña oculta por defecto;
- timeout vuelve a ocultarla y limpia el estado;
- copiar no genera logs con el secreto;
- logout elimina acceso a secretos;
- el secreto no aparece en atributos DOM ni en títulos.

### Ataques

- SQL Injection; XSS; CSRF; brute force; credential stuffing;
- session fixation; token replay; privilege escalation;
- replay de refresh token → revocación de familia;
- extracción masiva limitada por rate limit;
- export abusivo bloqueado.

---

# 39. ZERO HARD-CODING

Nunca incluir en el código: `DATABASE_URL`, `JWT_SECRET`, `ENCRYPTION_KEY`, `MASTER_KEY`, `API_KEY`, `PRIVATE_KEY`, `SERVICE_ROLE_KEY`, `SUPABASE_SERVICE_KEY`.

Todo secreto de infraestructura debe proceder de un Secret Manager o mecanismo seguro equivalente. Ver R131 sobre `VITE_*`.

---

# 40. PRINCIPIO DE MÍNIMO PRIVILEGIO

Separar:

```text
Application User
Read User
Write User
Migration User
Audit Insert User   (sólo INSERT en auditoría)
Audit Read User
Security Operator
Infrastructure Operator
```

No utilizar una única cuenta con permisos absolutos para toda la plataforma.

---

# 41. ADMINISTRADORES Y BREAK-GLASS (AMPLIADO EN V5)

El administrador debe poder: gestionar usuarios, bloquear cuentas, revocar sesiones, consultar auditoría, gestionar políticas y responder ante incidentes.

**No** debe poder leer automáticamente contraseñas, TOTP, API Keys ni notas privadas.

Nuevo en V5 — procedimiento break-glass:

```text
1. Solicitud con motivo obligatorio
2. Segundo aprobador (dual control) o WebAuthn de alta garantía
3. Ventana temporal (p. ej. 15 min) con alcance limitado a 1 bóveda
4. Notificación inmediata al propietario
5. Registro firmado en auditoría (Ed25519)
6. Revocación automática al expirar la ventana
```

Y aun así: **si la bóveda es client-side, el administrador no puede descifrar nada** — la limitación es criptográfica, no de permisos. Eso es el objetivo (§38 de V4 y §1 R4).

- R149: Toda consulta administrativa sobre auditoría ajena requiere step-up y queda registrada.
- R150: El rol de seguridad y el de infraestructura no deben ser la misma cuenta.

---

# 42. POLÍTICA DE VISUALIZACIÓN

La política recomendada es `REVEAL = HIGH RISK`.

```text
1. Sesión válida
2. Bóveda desbloqueada (§9)
3. Autorización
4. Step-up server-side (§13)
5. MFA si corresponde
6. Rate limit y anti-automatización
7. Descifrado en cliente con AAD vigente
8. Visualización temporal
9. Auto-hide
10. Auditoría sin el secreto
```

La contraseña nunca debe aparecer en: logs, analytics, URLs, errores, breadcrumbs, métricas, trazas, archivos temporales, historial de portapapeles del SO (limitación declarada en §53), ni en respuestas cacheadas.

---

# 43. SEGURIDAD DE LA MEMORIA

Los secretos deben permanecer en memoria el menor tiempo razonablemente posible.

No debe asumirse que JavaScript permite garantizar un borrado físico perfecto de memoria (§15.1, §53).

Por ello, la arquitectura debe reducir: copias, persistencia, serializaciones, logs, almacenamiento local, exposición a extensiones y exposición a herramientas de debugging.

Esta limitación debe quedar documentada como parte del modelo de amenazas.

---

# 44. SEGURIDAD DE SUPPLY CHAIN E INTEGRIDAD DEL BUILD

Implementar: lockfiles; revisión de dependencias; Dependabot/Renovate o equivalente; escaneo de CVEs; SBOM; firmas/verificación de artefactos; imágenes Docker mínimas; eliminación de paquetes innecesarios.

Una bóveda de contraseñas no debe depender de una cadena de dependencias sin control.

Nuevo en V5 — integridad del artefacto desplegado (mitiga amenaza A18):

- R151: Sin scripts de terceros en rutas de bóveda (§16).
- R152: El bundle debe auto-hospedarse; si se usa CDN, con SRI.
- R153: El proceso de build debe quedar registrado (commit, hash, quien lo lanzó).
- R154: Dependencias críticas de crypto (noble, argon2) deben fijarse por versión exacta en lockfile y revisarse en PR.
- R155: Cualquier dependencia nueva en la superficie de bóveda exige justificación escrita (qué hace, por qué no basta Web Crypto, alternativas descartadas).

---

# 45. OBSERVABILIDAD SEGURA

Logs y métricas deben diseñarse como una posible superficie de filtración.

Prohibido registrar: `password`, `master_password`, `encryption_key`, `wrapped_dek`, `totp_secret`, `api_key`, `session_secret`, `step_up_token`, plaintext de items.

Los logs deben utilizar IDs y hashes no reversibles cuando sea necesario correlacionar eventos.

Requisitos verificables:

- R156: APM (Sentry u otro) con `beforeSend` / `beforeBreadcrumb` que **elimine** rutas de bóveda, bodies, headers `Authorization`/`X-Step-Up` y cualquier campo de allowlist prohibida.
- R157: `tracesSampleRate` y captura de replay/screenshots desactivados en rutas de bóveda.
- R158: Prohibido `beforeSend` que devuelva el evento "casi limpio": la limpieza debe ser por allowlist, no por denylist.
- R159: Test automatizado que dispara un error dentro de un reveal y comprueba que el secreto no llega al transport de logs.

---

# 46. INCIDENT RESPONSE

Debe existir un procedimiento para:

```text
Compromiso de usuario
Compromiso de sesión
Compromiso de backend
Compromiso de base de datos
Compromiso de Secret Manager
Robo de dispositivo
Filtración de backup
Manipulación de audit logs
Reutilización de nonce detectada (§8.2)
Fuga de la service-role key (§20)
Compromiso del build / entrega de JS manipulado (A18)
```

Cada incidente debe tener: detección, contención, revocación, rotación, investigación, recuperación y post-mortem.

- R160: Ante compromiso del cliente (master password posiblemente keyloggeada), el runbook exige: revocar sesiones, pedir cambio de master password, re-envolver DEKs y recomendar rotación de las contraseñas almacenadas que estaban dentro.
- R161: Ante reutilización de nonce: rotar DEK, re-cifrar items afectados, declarar pérdida de confidencialidad de esos items (no basta con rotar).

---

# 47. OBJETIVO DE SEGURIDAD ANTE ROBO DE BASE DE DATOS

Si un atacante obtiene `database.dump + backup + metadata`, debe encontrar:

```text
ciphertext
+ nonces
+ AAD headers
+ versiones criptográficas
+ salts y parámetros KDF
+ metadatos mínimos
```

y no:

```text
passwords
TOTP
API keys
master password
encryption keys
DEKs en claro
```

Con la Opción A o C de §3.1 el atacante no obtiene ningún secreto derivado del **proceso de autenticación**, y con la Opción C la master password jamás llega al servidor ni se usa como credencial.

Pero **sí** puede hacer fuerza bruta offline: las `wrapped_keys` de arriba son el oráculo (§3.1.1). Lo que vuelve inviable el ataque no es el protocolo elegido, es la **entropía de la master password** (§17.1). Con una maestra de baja entropía, un robo de base de datos escala a bóveda completa sin que el backend haya sufrido ninguna brecha de autenticación.

La seguridad de la bóveda no debe depender exclusivamente de mantener PostgreSQL inaccesible.

---

# 48. MODELO DE SEGURIDAD OPERATIVA

```text
Capa 1 — Identidad
Capa 2 — Sesión
Capa 3 — Desbloqueo de bóveda (§9)
Capa 4 — Autorización
Capa 5 — Criptografía (AAD, envelope, domain separation)
Capa 6 — Base de datos (RLS)
Capa 7 — Infraestructura
Capa 8 — Auditoría con ancla externa
Capa 9 — DevSecOps + integridad del build
Capa 10 — Respuesta a incidentes
```

La caída de una capa no debe implicar automáticamente el compromiso total de la bóveda.

---

# 49. MEGA PROMPT 1 — IMPLEMENTACIÓN V5

```markdown
Actúa como Tech Lead, Security Architect, Cryptography Engineer y DevSecOps Engineer.

Implementa Bóveda Segura V5 siguiendo estrictamente una arquitectura
Zero-Knowledge (con sus límites declarados), Defense-in-Depth, Zero-Trust
y Least Privilege, conforme a boveda-segura-v5.md.

ANTES DE ESCRIBIR CÓDIGO, decide y documenta:

  - Opción A/B/C de §3.1 (modelo de autenticación).
  - Algoritmo: AES-256-GCM o XChaCha20-Poly1305 (§8).
  - Parámetros Argon2id y versión de la codificación (§5.1).
  - Cómo se mapea la sesión del backend a auth.uid() (§20.1).
  - Si se implementa la capa asimétrica §6.2 en la primera entrega o
    queda como fase 2 (indicarlo explícitamente).

OBJETIVO PRINCIPAL:

Construir una password vault donde las contraseñas, TOTP, API Keys, notas
privadas y secretos empresariales permanezcan cifrados y donde la
visualización de secretos sea una operación de alto riesgo, explícita,
autenticada, autorizada, temporal y auditable.

REQUISITOS OBLIGATORIOS:

Criptografía
 1. Argon2id con parámetros ≥ a §5.1, en Web Worker.
 2. HKDF-SHA-256 con labels versionados y domain separation (§5.2).
 3. Key confirmation antes de descargar la bóveda (§5.3).
 4. Separar autenticación de cifrado (§4) sin enviar material derivado
    de la master password salvo Opción B declarada.
 5. Jerarquía de claves KEK → DEK versionadas (§6.1).
 6. Envelope encryption con AAD en el envoltorio (R10).
 7. AES-256-GCM o XChaCha20-Poly1305 con AAD contextual CANÓNICO
    (vault_id, item_id, owner_id, key_version, algorithm, nonce) — §8.1.
 8. Contador `revision` en AAD anti-replay (§8.3).
 9. Techo de items por DEK con re-key forzado (§8.2).
10. Capa asimétrica X25519/Ed25519 para compartir/recuperar (§6.2).
11. Versionar algoritmos y claves; rechazar algoritmos fuera de lista.
12. No almacenar secretos ni DEKs en plaintext.
13. No almacenar la Master Password.

Estados
14. Sesión y Desbloqueo como estados independientes (§9): un token
    robado NO descifra nada.
15. Unlock Key sólo en memoria de un worker; nunca en storage ni en
    estado global persistente.
16. Auto-lock por inactividad, cierre de pestaña y logout.
17. No secretos descifrados en localStorage/sessionStorage/IndexedDB.

Acceso
18. Step-up validado EN SERVIDOR: token single-use con jti, TTL corto,
    purpose y binding al item_id (§13.1).
19. MFA (§18) y protección de la cuenta (§17) con k-anonymity HIBP.
20. RLS activo y testeado para identidad dual (§20.1); service-role key
    fuera del bundle del cliente.
21. IDOR/BOLA bloqueado con respuestas indistinguibles (R92).
22. Rate limit en reveal, copia, export y step-up (R88).
23. Cache-Control: no-store en respuestas de material de bóveda (R87).

Presentación
24. Reveal explícito + auto-hide + limpieza de estado (§12).
25. Copia con step-up y aviso de historial del SO (§14.1).
26. Auditoría de reveal/copy/export sin registrar el secreto (§23).

Recuperación y ciclo de vida
27. Recovery key generada en cliente, anti-escrow (§25).
28. Cambio de maestra transaccional con re-wrap y revocación de
    sesiones (§27).
29. Rotación de claves y export cifrado versionado (§28).

Aplicación
30. CSP nonce/strict-dynamic + Trusted Types + sin terceros en rutas de
    bóveda (§16).
31. Sanitizado de TODO HTML de usuario (DOMPurify) antes de cualquier
    innerHTML (R60).
32. Headers de navegador (§36) verificados en CI.
33. Scrubbing de APM por allowlist con test (R156, R159).
34. Secret scanning, SAST, DAST, dependency scanning (§37).
35. Pruebas específicas §38: AAD splicing, replay, unlock-vs-session,
    step-up binding, RLS con rol anónimo.
36. Documentar las limitaciones reales en §53.
37. No implementar criptografía propia.
38. No inventar mecanismos criptográficos.
39. No usar claves hardcodeadas ni secretos en VITE_*.
40. No devolver secretos mediante endpoints sin autorización reforzada.

Antes de modificar código:
 - inspecciona la arquitectura existente;
 - identifica autenticación, base de datos, almacenamiento, sesiones,
   roles, logs, secretos y posibles fugas;
 - genera un plan de migración;
 - no rompas funcionalidades existentes sin justificarlo.

Para cada cambio indica:
 - amenaza mitigada (referencia a § del V5);
 - archivo afectado;
 - impacto;
 - estrategia de rollback;
 - pruebas necesarias.
```

---

# 50. MEGA PROMPT 2 — AUDITORÍA DE SEGURIDAD

```markdown
Actúa como auditor senior de ciberseguridad especializado en password managers.

Audita Bóveda Segura V5 intentando demostrar cómo podría comprometerse.
No te limites a revisar código superficialmente.

Parte obligatoria: verifica cada requisito R1–R161 del documento y marca
CUMPLE / NO CUMPLE / NO APLICA con evidencia (archivo:línea).

Analiza:
- autenticación (y la opción §3.1 elegida);
- sesiones y refresh rotation;
- MFA y su circularidad (R70);
- Argon2id y sus parámetros reales;
- HKDF y domain separation;
- envelope encryption;
- AAD: reconstruir el AAD esperado y compararlo byte a byte (§8.1);
- nonces y techo por DEK (§8.2);
- revision / anti-replay (§8.3);
- key rotation y re-wrap transaccional;
- sesion vs desbloqueo (§9);
- step-up server-side, single-use y binding (§13.1);
- recovery anti-escrow (§25);
- compartir y emergency access (§26);
- RLS e identidad dual (§20.1);
- IDOR/BOLA;
- XSS, CSP, Trusted Types, sanitizado;
- CSRF y el modelo de sesión elegido;
- clipboard y sus límites reales;
- storage, estado de React, Web Worker;
- logs, APM con scrubbing, errores;
- backups y disponibilidad;
- exports;
- admin / break-glass;
- supply chain e integridad del build;
- CI/CD, Docker, Secret Manager.

Para cada hallazgo proporciona:
SEVERIDAD / AMENAZA / EVIDENCIA (archivo:línea) / IMPACTO /
EXPLOTABILIDAD / REMEDIACIÓN / PRUEBA DE VALIDACIÓN

Nunca declares que el sistema es "100% seguro".
Comprueba además que §53 (Limitaciones declaradas) refleja lo que el
código realmente NO protege: si el código no mitiga algo que §53 dice
mitigar, es un hallazgo.

Busca especialmente escenarios donde un atacante consiga:
1. la base de datos; 2. un backup; 3. una cuenta de usuario;
4. una sesión; 5. acceso parcial al backend; 6. acceso administrativo;
7. ejecutar JavaScript en el navegador; 8. comprometer el build.
```

---

# 51. MEGA PROMPT 3 — PRUEBAS DE PENETRACIÓN

```markdown
Actúa como penetration tester autorizado.

Realiza pruebas controladas contra Bóveda Segura V5 con datos sintéticos.

Comprueba:
- SQLi; XSS; CSRF; IDOR/BOLA; privilege escalation;
- brute force; credential stuffing; session hijacking;
- token replay; reutilización de refresh token (familia revocada);
- exposición de secretos; filtración mediante logs y errores;
- exportación no autorizada o masiva;
- reveal sin step-up; step-up reutilizado; step-up cross-item;
- copia sin autorización;
- acceso cross-tenant; bypass de RLS con rol anónimo;
- manipulación de ciphertext (mutación de un byte);
- SPlicing: mover el blob del item A a la fila del item B;
- REPLAY: restaurar una revisión anterior de un item;
- key-version confusion (firmar con v1 y reclamar v2);
- nonce reuse bajo el techo de §8.2;
- abuso de recovery y de recovery reuse (R107);
- extracción masiva vía paginación o endpoints bulk;
- robo de sesión + intento de descifrado (§9) — debe ser imposible;
- inyección de script en el bundle (integridad del build, A18).

No destruyas información real. Utiliza datos sintéticos.

Genera un reporte reproducible con:
vulnerabilidad / severidad / evidencia / endpoint / request / respuesta /
impacto / remediación / prueba posterior de corrección.
```

---

# 52. CHECKLIST DE RELEASE

Antes de producción:

```text
CRIPTOGRAFÍA
[ ] No existen secretos hardcodeados
[ ] No existen passwords plaintext
[ ] Master Password nunca se almacena ni se envía al servidor (salvo Opción B declarada)
[ ] Argon2id con parámetros >= §5.1 y versionados
[ ] Salt único por bóveda (distinto del de la cuenta)
[ ] HKDF con labels de domain separation
[ ] Key confirmation implementado
[ ] Envelope encryption con AAD en el envoltorio
[ ] DEK y KEK protegidas, jamás en claro en storage
[ ] AES-GCM/XChaCha20 con AAD CANÓNICO obligatorio (§8.1)
[ ] AAD incluye vault_id, item_id, owner_id, key_version, algorithm, nonce
[ ] Contador revision en AAD (anti-replay)
[ ] Nonces únicos y techo de items por DEK con re-key
[ ] Lista blanca de algoritmos; algoritmo desconocido rechazado
[ ] Versionado criptográfico completo
[ ] Rotación de claves probada
[ ] Capa asimétrica X25519/Ed25519 (o fase 2 documentada)

ESTADOS Y ACCESO
[ ] Sesión y Desbloqueo son estados independientes (§9)
[ ] Token robado NO descifra (test §38)
[ ] Unlock Key sólo en memoria de worker; ausente de todo storage
[ ] Auto-lock por inactividad, pestaña y logout
[ ] MFA activo y sin circularidad (R70)
[ ] Step-up server-side, single-use, TTL corto, binding a item+purpose
[ ] Copia exige step-up
[ ] Rate limit en reveal/copy/export/step-up
[ ] Cache-Control: no-store en respuestas de bóveda
[ ] IDOR tests + respuestas indistinguibles
[ ] BOLA tests
[ ] Reveal auditado sin el secreto
[ ] Export protegido y cifrado por defecto

DATOS Y ACCESO
[ ] RLS activo (SELECT/UPDATE/DELETE) y testeado con rol anónimo
[ ] Service-role key ausente del bundle del cliente
[ ] Mapeo backend-JWT -> auth.uid() documentado y funcionando
[ ] Cambio de maestra transaccional + revocación de sesiones
[ ] Recovery generada en cliente, anti-escrow, one-shot
[ ] Session revocation efectiva en el siguiente request
[ ] Replay de refresh token revoca la familia

APLICACIÓN
[ ] CSP nonce/strict-dynamic sin unsafe-inline/eval
[ ] Trusted Types donde el navegador lo soporte
[ ] Sin scripts de terceros en rutas de bóveda
[ ] TODO HTML de usuario sanitizado (DOMPurify) antes de innerHTML
[ ] Headers: HSTS, nosniff, Referrer-Policy, Permissions-Policy, COOP
[ ] Secure + HttpOnly + SameSite cookies; prefijo __Host-
[ ] frame-ancestors 'none' en rutas de bóveda
[ ] Sin secretos en VITE_*

OPERACIÓN
[ ] No secretos en logs ni en APM (scrubbing por allowlist + test)
[ ] Ancla externa del audit log funcionando y alertando
[ ] Backup encryption + restore test
[ ] Recovery test
[ ] Incident response con runbooks de R160/R161
[ ] Dependabot/renovate + lockfiles + SBOM
[ ] SAST + secret scan + DAST (OWASP ZAP)
[ ] Build reproducible o artefacto firmado y verificado
[ ] §53 Limitaciones declaradas revisadas contra el código
[ ] Suite §38 en verde en CI
```

---

# 53. LIMITACIONES DECLARADAS (NUEVA EN V5)

Esta sección es obligatoria. Un documento de seguridad que no dice qué no protege induce a error.

```text
L1. MEMORIA EN JAVASCRIPT
    No se puede garantizar el borrado de strings en el heap.
    Se sobreescriben Uint8Array, pero las copias intermedias
    pueden persistir hasta que el GC las recoja.

L2. XSS = COMPROMISO TOTAL MIENTRAS LA BÓVEDA ESTÁ DESBLOQUEADA
    Un atacante con ejecución de JS en el origen puede leer la master
    password mientras se teclea y el plaintext mientras se muestra.
    Se reduce con CSP, Trusted Types y sanitizado; no se elimina.

L3. JAVASCRIPT SERVIDO POR EL PROPIO ORIGEN
    Si el build o el hosting entregan código manipulado, la bóveda
    está comprometida. Se mitiga con integridad del build (§44),
    no con controles de aplicación.

L4. EXTENSIONES DEL NAVEGADOR
    Una extensión con permisos sobre la página puede leer el DOM.

L5. HISTORIAL DEL PORTAPAPELES
    El SO (Win+V, clipboard en la nube) puede conservar copias que la
    aplicación no puede borrar.

L6. DISPOSITIVO COMPROMETIDO
    Keylogger, RAT o pantalla compartida capturan la master password
    en origen. Ninguna criptografía lo compensa.

L7. EL MFA PROTEGE LA CUENTA, NO LA BÓVEDA
    Con la Unlock Key en memoria y un dispositivo con sesión abierta,
    el MFA no vuelve a intervenir hasta el próximo lock.

L8. LA REVOCACIÓN NO BORRA EL PASADO
    Revocar la compartición de un ítem impide nuevas aperturas; no
    garantiza que el receptor no haya descifrado y conservado copia.

L9. SISTEMAS DE IDENTIDAD DUPLICA
    Backend JWT + Supabase: si el mapeo (§20.1) se configura mal,
    RLS puede quedar inactivo. Sólo lo detecta la suite §38.

L10. ROBO DE BASE DE DATOS SIN CLAVE, PERO CON ESCRITURA
     El atacante no lee, pero sí puede borrar o cifrar (ransomware).
     Se mitiga con backups y export del usuario (§29), no con crypto.

L11. METADATOS VISIBLES
     Número y tipo de items, fechas y tamaños pueden filtrar
     información sin descifrar nada (§10.1).

L12. TRUST DEL SERVIDOR PARA PASOS FUERA DE CRYPTO
     La auditoría, el rate limiting y la revocación dependen de un
     servidor que puede estar comprometido; sólo la capa criptográfica
     es independiente de él.

L13. ATAQUE OFFLINE CONTRA LAS DEK ENVUELTAS
     Los `wrapped_keys` son un oráculo de fuerza bruta offline sobre la
     master password (§3.1.1). Ni OPAQUE ni la separación cuenta/master
     lo eliminan. Sólo la entropía de la maestra lo vuelve inviable:
     una maestra débil anula la arquitectura entera.

L14. ARGON2ID EJECUTADO EN JAVASCRIPT PURO
     `@noble/hashes` no lleva WASM, así que Argon2id de 64 MiB / t=3
     tarda ~1,3 s en el cliente y debe correr en un Web Worker (§15.1).
     Un atacante con implementación nativa es más rápido en `t`, aunque
     el coste de memoria `m` —la defensa real frente a GPU/ASIC— es el
     mismo para ambos. Si el equipo necesita más margen, subir `m` o
     pasar a WASM con `wasm-unsafe-eval` en la CSP es una decisión
     explícita, no un detalle de rendimiento.

L15. STEP-UP RETIRADO EN REVEAL/COPIA (DESVIACIÓN DEL EQUIPO)
     §13, R37 y R44 exigían volver a pedir la contraseña para revelar o
     copiar un secreto. El panel ERP usa `stepUp={false}` en todos los
     `SecretField`: con la bóveda desbloqueada, revelar y copiar no
     preguntan nada. La protección restante es el auto-lock y la ventana
     crítica de §9 R27. Decisión explícita del equipo (2026-10), no una
     omisión de implementación.
```

---

# 54. PRINCIPIO FINAL

Bóveda Segura V5 no debe prometer seguridad absoluta.

Debe diseñarse bajo un principio más realista y técnicamente defendible:

> Cada capa debe reducir la probabilidad de compromiso y, cuando una capa sea comprometida, limitar la cantidad de información que el atacante puede obtener.

El objetivo final es:

```text
             COMPROMISO
                 |
        +--------+--------+
        |                 |
      Backend          Database
        |                 |
        v                 v
   Ciphertext          Ciphertext
   + AAD headers       + AAD headers
        |                 |
        +--------+--------+
                 |
                 v
      Sin Unlock Key en el cliente
      Y sin verifier crackeable (Opción A/C)
                 |
                 v
         Secretos protegidos
```

Y para el usuario legítimo:

```text
Sesión
  |
  v
Autorización
  |
  v
Bóveda desbloqueada (Unlock Key en memoria)
  |
  v
Step-up Authentication (server-side)
  |
  v
MFA si corresponde
  |
  v
Descifrado autorizado en cliente (AAD vigente)
  |
  v
Visualización temporal
  |
  v
Auto-hide + auditoría anclada
```

La bóveda debe optimizarse no solamente para "guardar contraseñas", sino para minimizar el daño ante robo de base de datos, compromiso de cuenta, compromiso parcial del backend, pérdida de dispositivo, abuso interno y compromiso del propio build.

---
---

# PARTE B — HALLAZGOS

# ANEXO I — HALLAZGOS DE LA V4

Matriz de vulnerabilidades detectadas en `docs/boveda-segura-v4.md`, con la sección de la V5 que las corrige.

```text
Severidad: ALTA = impacto directo en la confidencialidad/integridad de la bóveda
           MEDIA = debilidad que facilita otro ataque o deja un control incompleto
           BAJA  = ambigüedad, omisión o falta de verificabilidad
```

| ID | Sev | V4 (líneas) | Hallazgo | Impacto | V5 |
|----|-----|-------------|----------|---------|----|
| F-01 | ALTA | §7–§8 (L218–271) | AES-GCM sin AAD: no se define `additionalData` ni encabezado canónico | Un atacante con la DB **pega el ciphertext del ítem A en la fila del ítem B** y la autenticación pasa; §8 prometía detectar "sustitución" y no la detecta. Igual con metadatos `owner_id`/`tenant_id` alterados | §8.1, R14–R17, test de splicing §38 |
| F-02 | ALTA | §4/§15 (L118–155, L461–490) | Zero-Knowledge enunciado pero no definido: no se especifica el mecanismo de autenticación ni qué material recibe el servidor | Contradicción con §3: si se envía algo derivado de la master password, el robo de la DB permite fuerza bruta **offline**. El documento promete "zero-knowledge" sin declarar la excepción | §3.1 (Opciones A/B/C), §4.1, §53 |
| F-03 | ALTA | §6/§7/§21 (L175–249, L632–661) | Sólo criptografía simétrica (KEK→DEK); **no existe ninguna clave asimétrica** | Imposible compartir un ítem con otro usuario, hacer emergency access ni recovery multifirma sin enviar la KEK (rompe el modelo). Fatal para un ERP multi-tenant | §6.2, §25.2, §26 |
| F-04 | MEDIA | §5 (L157–173) | Argon2id sin parámetros mínimos (m/t/p), sin versión de codificación, sin HKDF posterior ni labels de domain separation, sin key confirmation | KDF demasiado barato en un cliente que sí cumple, o parámetros inconsistentes entre plataformas; misma salida reutilizada para auth y cifrado | §5.1–§5.3, R1–R12 |
| F-05 | ALTA | §17/§11 (L509–523, L361–387) | Sesión y desbloqueo no se distinguen: V4 nunca dice que un token robado sea insuficiente para descifrar | Un accessToken filtrado o un XSS basta para obtener todo; no hay segundo estado con TTL propio | §9 (nueva), R25–R30, test §38 |
| F-06 | ALTA | §11/§27 (L361–387, L806–835) | Step-up descrito como flujo pero **sin requisito de validación server-side**, ni TTL, ni single-use, ni binding a ítem/acción | Cualquier chequeo implementado en el cliente se bypasea con DevTools o reutilizando un token | §13.1, R38–R43 |
| F-07 | MEDIA | §7 (L245) | "No reutilizar nonces" sin techo cuantitativo | AES-GCM con IV aleatorio de 96 bits: límite práctico ~2³² mensajes por clave; una bóveda a largo plazo puede acercarse sin darse cuenta | §8.2, R18–R21 |
| F-08 | MEDIA | §21 (L632–661) | Recovery sin regla anti-escrow: lista opciones pero no prohíbe que el servidor o un admin guarde el material de recuperación | Un "recovery" server-side anula el zero-knowledge y crea backdoor administrativa | §25.1, R105–R109 |
| F-09 | MEDIA | §20 (L595–630) | Hash-chain sin ancla externa obligatoria (la cadena se describe como "puede utilizarse") | Quien reescribe la tabla reescribe la cadena completa y recalcula todos los hashes: integridad aparente | §24, R100–R104 |
| F-10 | MEDIA | §22 (L663–687) | Cambio de maestra sin atomicidad, sin verificación post-migración ni revocación de sesiones | Estado mixto (salt nuevo + DEKs envueltas con KEK vieja) = bóveda inaccesible permanente | §27, R116–R120 |
| F-11 | MEDIA | §15 (L461–490) | Sin política de fuerza de la master password ni chequeo k-anonymity | Toda la jerarquía criptográfica cae si la master password es débil o está filtrada; no hay control que lo avise | §17.1, R61–R66 |
| F-12 | MEDIA | §12 (L389–420) | "Limpiar el clipboard" presentado como control suficiente; sin mencionar historial del SO ni límites de JS | Win+V, clipboard en la nube y apps con acceso al portapapeles conservan la copia | §14.1, R45–R49, §53 L5 |
| F-13 | MEDIA | §14 (L442–459) | CSP genérica; sin nonce/strict-dynamic, sin Trusted Types obligatorios y **sin abordar JS servido por el propio origen** | Compromiso del build/CDN o dependencia maliciosa ejecuta código en el origen con acceso a la Unlock Key | §16, §44, R57–R60, R151–R155 |
| F-14 | MEDIA | §20/§43 | Auditoría y observabilidad sin mecanismo de limpieza verificable del APM | Breadcrumbs/traces de Sentry capturan bodies y estado de React con secretos | §24, §45, R156–R159 |
| F-15 | MEDIA | §18 (L525–559) | Ejemplo RLS con `auth.uid()` incompatible con backends que autentican con JWT propio; sin abordar service-role key | Si `auth.uid()` está vacío la política falla y hay fuerte tentación de bypassear con service-role key → RLS inactivo sin que se note | §20.1, R80–R86 |
| F-16 | MEDIA | §2/§45 (L45–70, L1239–1275) | Modelo de amenazas casi exclusivamente de confidencialidad; **sin amenaza de disponibilidad** | Ransomware/borrado de la bóveda: el atacante no gana secretos pero destruye el servicio; V4 no lo contempla ni lo mitiga | §2, §29, R127–R130 |
| F-17 | BAJA | §14/§17 (L442–459, L509–523) | CSRF "cuando corresponda" repetido sin decidir el modelo de sesión | El implementador elige a ciegas entre cookie y Bearer, y el resultado determina si CSRF aplica | §19.1, R74–R79 |
| F-18 | MEDIA | §10/§40 (L316–359, L1118–1152) | Reveal sin requisitos de respuesta HTTP, anti-automatización ni rate limit | Extracción masiva por scripting con una sesión válida; respuestas cacheables en proxies | §21, R87–R91, §42 |
| F-19 | MEDIA | §13/§41 (L422–440, L1154–1171) | Memoria: no distingue `string` inmutable de `Uint8Array`, no exige Web Worker ni auto-lock por inactividad | Material derivado retenido en el heap y en el estado de React durante toda la sesión | §9, §15.1, R50–R56 |
| F-20 | BAJA | §23 (L689–707) | Export "cifrado" sin formato, sin parámetros KDF propios; CSV no desaconsejado explícitamente | Export que hereda la debilidad de la master password actual, o CSV en claro por defecto por camino fácil | §28.1, R121–R126 |
| F-21 | MEDIA | §42 (L1174–1189) | Supply chain de dependencias, pero **sin integridad del artefacto desplegado** | Compromiso del build entrega JS que exfiltra al usuario; no está en el modelo de amenazas | §44, R151–R155, §53 L3 |
| F-22 | MEDIA | §38 (L1073–1095) | Administradores sin break-glass con doble control, ventana temporal ni registro de la propia consulta | Abuso interno sin fricción ni rastro atribuible | §41, R149–R150 |
| F-23 | ALTA | global | **Sin sección de limitaciones declaradas**: el documento no enumera qué NO protege | Falsa sensación de seguridad; una auditoría no puede contrastar promesa vs realidad | §53 (L1–L12) |
| F-24 | MEDIA | §16 (L492–507) | MFA sin distinguir "protege la cuenta" de "protege la bóveda"; sin códigos de recuperación; sin prohibir el factor circular | Factor circular (TOTP dentro de la bóveda que se está abriendo) inutiliza el step-up | §18, R70–R73, §53 L7 |
| F-25 | MEDIA | §47–§49 (L1297–1489) | Los mega-prompts no piden AAD, capa asimétrica, unlock-vs-session ni scrubbing | Un modelo que implemente "según V4" reproduciría F-01…F-22 | §49–§51 actualizados |
| F-26 | MEDIA | §18/§20 | Auditoría de RLS sólo con `SELECT` en el ejemplo; sin tests con rol anónimo ni revocación | Políticas de UPDATE/DELETE omitidas → borrado o alteración sin control | R83, R86, §38 |
| F-27 | BAJA | §9 (L273–314) | Metadatos (`item_type`, tamaños) expuestos sin análisis de fuga ni padding; búsqueda no definida | Inferencia de contenido sin descifrar; tentación de índice de texto plano en servidor | §10.1, R31–R33 |
| F-28 | MEDIA | §35 (L995–1035) | Suite de pruebas sin splicing, replay, step-up binding, unlock-vs-session ni ancla de auditoría | Los huecos de F-01, F-05 y F-06 pasarían desapercibidos en CI | §38 ampliado |

---

# ANEXO II — BRECHAS FRENTE A GREENLINE ERP

Estado real del repositorio contrastado con los requisitos de la V5.

> **Contexto:** este repo es el **panel SPA** (React 19 + Vite 8 + Supabase). El backend Express vive en el repo hermano `greenline`. RLS y migraciones SQL también (`supabase/`). Las políticas del §20 se aplican allí; aquí se aplica la capa cliente.

## II.1 Bloqueantes de seguridad (ordenados por prioridad)

| ID | Requisito V5 | Estado actual (evidencia) | Gravedad | Acción |
|----|--------------|---------------------------|----------|--------|
| R-01 | §16 — XSS / sanitizado | `frontend/src/components/blog/BlogContent.jsx:51` renderiza `versionarHtml(html)` con `dangerouslySetInnerHTML` **sin sanitizar**; `BlogBlocksEditor.jsx:215,227` igual; `AdminBlog.jsx:43` parsea con `wrapper.innerHTML`. **No hay DOMPurify ni ninguna librería de sanitizado** en `frontend/package.json` | ALTA | Instalar `dompurify` + `isomorphic-dompurify`, envolver en `sanitizeHtml()` en `frontend/src/utils/`, aplicar en los 4 puntos. Cualquier XSS en este origen rompe la V5 por §53 L2 |
| R-02 | §9 — Sesión ≠ Desbloqueo | No existe estado de bóveda; **tampoco existe step-up**: grep `step-up\|stepUp\|reauth` → 0 resultados en `frontend/src` | ALTA | Crear `VaultContext` con Unlock Key en worker y `useStepUp()` |
| R-03 | §4.1 R3 — no enviar la master password | `frontend/src/lib/api.js:125–130` `supabaseSync(password, accessToken)` envía la contraseña al backend; llamado desde `LoginPage.jsx:20` y `AdminPanel.jsx:86` | ALTA | Evaluar Opción C de §3.1: separar contraseña de cuenta de master password de bóveda. Documentar la decisión si se mantiene |
| R-04 | §19.1 — modelo de sesión | `AuthContext.jsx:14–26` guarda `{accessToken, refreshToken}` en **JSON plano en `sessionStorage`** (clave `gl_auth`), accesible a cualquier XSS del origen | ALTA | Mover refresh token a cookie `Secure`+`HttpOnly`+`SameSite=Strict`+`__Host-` gestionada por el backend; access token en memoria |
| R-05 | §45 — observabilidad segura | `frontend/src/main.jsx:9–15` inicializa Sentry con `tracesSampleRate: 0.1` y **sin `beforeSend` ni `beforeBreadcrumb`** | MEDIA | Añadir scrubbing por allowlist; desactivar replay/traces en rutas de bóveda; test R159 |
| R-06 | §20.1 — identidad dual | `blogUpload.js:27–31` usa Bearer de **Supabase**; `api.js:82–84` usa Bearer del **backend**; `AuthContext.jsx:46` `signOut().catch(()=>{})` (best-effort) | MEDIA | Definir una única fuente de verdad de sesión; documentar el mapeo a `auth.uid()` |
| R-07 | §39 — zero hard-coding | `api.js:1` `API_URL` cae a `http://localhost:3000/api` si falta la env; `supabase.js:8–9` usa placeholders con warning en consola | MEDIA | Fail-closed: abortar el arranque si `VITE_API_URL` no está definida en producción |
| R-08 | §20 — RLS | **No existe ninguna tabla ni política de bóveda.** El DDL de V4 (`docs/boveda-segura-v4.md:531–541`) no está aplicado; las políticas viven en `greenline/supabase/` | ALTA | Migración nueva en el repo hermano + suite de tests RLS (R82, R83). Requiere coordinación con el repo hermano |
| R-09 | §5, §8, §44 — capa crypto | `frontend/package.json:12–40` **no tiene ninguna librería criptográfica ni sanitizadora**; grep `crypto.subtle\|AES\|argon` → 0 en el código | ALTA | Añadir `@noble/hashes`, `@noble/ciphers`, `@noble/curves` (y valorar `argon2-browser` si noble no cubre Argon2id) con justificación escrita R155 |
| R-10 | §36 — headers | `vercel.json:1–11` define framework/rewrites pero **no configura ningún header de seguridad** (CSP, HSTS, nosniff, frame-ancestors) | MEDIA | Bloque `headers` en `vercel.json` + verificación en CI |
| R-11 | §12, §14 — reveal y clipboard | Inputs `type="password"` en `LoginPage.jsx:171`, `StaffGateVerify.jsx:74`, `AdminPanel.jsx:147` sin toggle; **no hay componente de reveal ni uso de `navigator.clipboard.writeText`** | MEDIA | Construir `SecretField` con auto-hide, timeout y copia con step-up |
| R-12 | §37 — DevSecOps | `.oxlintrc.json` sólo activa reglas de hooks de React; sin secret scan, SAST ni DAST. Sólo hay `oxlint@^1.75.0` como tooling de calidad | MEDIA | Añadir reglas de seguridad al lint y etapas al pipeline (§37) |

## II.2 Fases de implementación sugeridas

```text
FASE 0 — Fundación (sin dependencias del backend)
  F0.1  dompurify + envolver los 4 puntos de innerHTML   [R-01]
  F0.2  Fail-closed de VITE_API_URL                      [R-07]
  F0.3  Scrubbing de Sentry con allowlist                [R-05]
  F0.4  Headers de seguridad en vercel.json              [R-10]
  F0.5  Reglas de seguridad en oxlint                    [R-12]

FASE 1 — Núcleo criptográfico cliente (§5, §6, §7, §8)
  F1.1  Dependencias noble + justificación (R155)
  F1.2  Argon2id en Web Worker con parámetros §5.1
  F1.3  HKDF con labels versionados (§5.2)
  F1.4  AES-256-GCM con AAD canónico (§8.1) + revision (§8.3)
  F1.5  Envelope wrap/unwrap de DEKs (§7)
  F1.6  Suite de pruebas §38 (cripto): splicing, replay, AAD

FASE 2 — Estados y control de acceso (§9, §12, §13)
  F2.1  VaultContext: Unlock Key en memoria + auto-lock
  F2.2  Componente SecretField con reveal/auto-hide
  F2.3  Endpoint y hook de step-up server-side
  F2.4  Copia con step-up y aviso de historial del SO

FASE 3 — Datos y API (§10, §21, §28)
  F3.1  Migración de tablas vault_items / wrapped_keys (repo hermano)
  F3.2  RLS + tests con rol anónimo                   [R-08]
  F3.3  Endpoints de bóveda con no-store y rate limit
  F3.4  UI de bóveda (listado, detalle, alta/baja)

FASE 4 — Ciclo de vida (§25, §27, §28)
  F4.1  Recovery key en cliente anti-escrow
  F4.2  Cambio de maestra con re-wrap transaccional
  F4.3  Export cifrado versionado

FASE 5 — Multiusuario (§26) y operación (§24, §41)
  F5.1  Capa asimétrica X25519/Ed25519 + compartición
  F5.2  Ancla externa del audit log
  F5.3  Break-glass con doble control
```

## II.3 Decisiones pendientes (bloquean Fase 1)

```text
D1. Opción A/B/C de §3.1 para la autenticación de la bóveda.
    Dado que el panel ya tiene contraseña de cuenta + 2FA, la
    recomendada es la C: master password distinta que nunca sale
    del cliente.

D2. ¿La bóveda convive en este panel o es un módulo aparte?
    Afecta a CSP, rutas y al alcance de Fase 3.

D3. ¿Quién implementa el backend (repo hermano `greenline`)?
    R-03, R-04, R-08 y F3.3 no pueden cerrarse desde este repo.

D4. Algoritmo: AES-256-GCM (Web Crypto nativo) o XChaCha20-Poly1305
    (requiere librería). Recomendación: AES-256-GCM por ser nativo
    y estar en §8.1, con AAD obligatorio.
```

---

**Nota final:** este documento no certifica seguridad. Su valor está en que cada requisito es verificable y cada limitación está declarada. La V5 existe porque la V4, bien escrita, omitía controles que un atacante explotaría sin levantar sospechas.

