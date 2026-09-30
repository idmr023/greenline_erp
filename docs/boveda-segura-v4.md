# BÓVEDA SEGURA V4
## Especificación Arquitectónica de una Password Vault Zero-Knowledge, Defense-in-Depth y Enterprise Security

### Ficha técnica

- Sistema: Bóveda Segura V4
- Objetivo: almacenamiento y visualización altamente segura de contraseñas, secretos, TOTP, API Keys y credenciales empresariales.
- Paradigma: Zero-Trust, Zero-Knowledge, Defense-in-Depth, Least Privilege y Secure-by-Design.
- Modelo criptográfico: cifrado autenticado, envelope encryption, derivación de claves y separación estricta entre autenticación y cifrado.
- Stack de referencia: Next.js / React, Express / Node.js TypeScript, PostgreSQL / Supabase, Argon2id, Web Crypto API o biblioteca criptográfica auditada, Docker, OWASP ZAP, SonarQube.
- Gestión de secretos de infraestructura: Doppler / AWS Secrets Manager / Azure Key Vault / proveedor equivalente.
- Notarización opcional: Merkle Root + red blockchain para demostrar integridad sin publicar secretos.
- Normativa y referencias: ISO/IEC 27001, OWASP ASVS, OWASP Top 10, NIST Cybersecurity Framework y legislación aplicable de protección de datos.

---

# 1. OBJETIVO DE SEGURIDAD

Bóveda Segura V4 no debe tratarse como una simple tabla de contraseñas con cifrado.

Su objetivo es que un atacante que consiga acceso a la base de datos, backups o almacenamiento de objetos no pueda convertir esos datos directamente en contraseñas utilizables.

El sistema debe proteger:

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

Principio fundamental:

> El servidor debe conocer únicamente la información estrictamente necesaria para autenticar, autorizar y almacenar la bóveda. Los secretos de la bóveda deben permanecer cifrados y no deben aparecer en texto plano en la base de datos.

La visualización de una contraseña debe ser una operación explícita, autenticada, autorizada, temporal y auditable.

---

# 2. MODELO DE AMENAZAS

La arquitectura debe asumir que pueden ocurrir:

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
18. Manipulación de registros de auditoría.

La seguridad debe diseñarse para limitar el impacto incluso cuando una capa haya sido comprometida.

---

# 3. ARQUITECTURA ZERO-KNOWLEDGE

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
              +--------+--------+
              |                 |
              v                 v
       autenticación      Vault Unlock Key
                                |
                                v
                         AES-256-GCM
                                |
                                v
                         Vault Items
                                |
                                v
                            Ciphertext
                                |
                                v
                            Backend
                                |
                                v
                           PostgreSQL
```

La contraseña maestra no debe enviarse innecesariamente al backend ni almacenarse.

Cuando sea viable para el modelo de autenticación utilizado, la derivación de claves y el descifrado deben realizarse en el cliente.

La arquitectura debe documentar claramente qué información puede conocer el servidor y qué información nunca debe conocer.

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
      KDF
       |
       +------------------+
       |                  |
       v                  v
Authentication       Key Material
Verifier             para la bóveda
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

---

# 5. DERIVACIÓN DE CLAVES CON ARGON2ID

Argon2id debe utilizarse para derivar material criptográfico a partir de la contraseña maestra.

La configuración de Argon2id debe:

- utilizar un salt único por usuario/bóveda;
- utilizar parámetros configurables y documentados;
- ser suficientemente costosa para dificultar ataques offline;
- revisarse periódicamente conforme evolucione el hardware;
- evitar parámetros arbitrariamente bajos por razones de rendimiento.

El salt no es secreto y puede almacenarse junto con los metadatos de la bóveda.

No se debe almacenar la contraseña maestra.

---

# 6. JERARQUÍA DE CLAVES

La V4 debe utilizar una arquitectura de claves separadas.

Modelo conceptual:

```text
Master Password
       |
       v
     Argon2id
       |
       v
   Root Key Material
       |
       v
 Key Encryption Key (KEK)
       |
       v
 Data Encryption Key (DEK)
       |
       v
 AES-256-GCM
       |
       v
 Vault Items
```

La Data Encryption Key no debe almacenarse en texto plano.

Debe almacenarse protegida mediante envelope encryption.

Esto permite:

- rotación de claves;
- versionado;
- revocación;
- recuperación controlada;
- migración criptográfica;
- separación de responsabilidades.

---

# 7. ENVELOPE ENCRYPTION

Cada bóveda debe tener una o más claves de datos protegidas mediante una clave superior.

Ejemplo:

```text
KEK
 |
 +--> DEK v1
 |
 +--> DEK v2
 |
 +--> DEK v3
```

Cada registro cifrado debe disponer de metadatos criptográficos suficientes para identificar:

```text
ciphertext_version
algorithm
key_version
nonce
ciphertext
authentication_tag
```

No se deben reutilizar nonces/IV con la misma clave cuando el algoritmo lo prohíba.

La rotación de claves debe ser compatible con versiones anteriores mientras dure la migración.

---

# 8. CIFRADO AUTENTICADO

Para los secretos de la bóveda se debe utilizar un esquema de cifrado autenticado como AES-256-GCM, o una construcción criptográfica moderna equivalente y correctamente implementada.

El objetivo no es únicamente ocultar los datos.

También debe detectarse:

- modificación;
- truncamiento;
- corrupción;
- sustitución;
- manipulación de ciphertext.

Cada elemento cifrado debe validarse criptográficamente antes de ser utilizado.

No implementar criptografía propia.

Debe utilizarse Web Crypto API o una biblioteca criptográfica ampliamente auditada y mantenida.

---

# 9. MODELO DE DATOS DE LA BÓVEDA

La información sensible debe mantenerse separada de los metadatos que puedan manejarse sin descifrar.

Ejemplo conceptual:

```text
vault_items
---------------------------------
id
vault_id
owner_id
tenant_id
item_type
encrypted_blob
crypto_version
key_version
created_at
updated_at
deleted_at
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

El JSON anterior es únicamente conceptual.

En almacenamiento debe existir únicamente su representación cifrada.

No se deben guardar contraseñas en columnas separadas en texto plano.

---

# 10. VISUALIZACIÓN SEGURA DE CONTRASEÑAS

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
Reautenticación / Step-up Authentication
  |
  +--> MFA cuando la política lo requiera
  |
  v
Autorización
  |
  v
Descifrado
  |
  v
Visualización temporal
  |
  +--> ocultar automáticamente
  |
  +--> limpiar estado sensible
  |
  +--> registrar evento
```

La contraseña debe mostrarse únicamente después de una acción explícita.

---

# 11. STEP-UP AUTHENTICATION

No debe asumirse que una sesión válida concede automáticamente permiso para revelar todos los secretos.

Para operaciones de alto riesgo se debe solicitar autenticación reforzada.

Ejemplos:

- mostrar contraseña;
- copiar contraseña;
- revelar TOTP;
- exportar bóveda;
- modificar credenciales críticas;
- cambiar configuración criptográfica;
- generar recovery keys.

Dependiendo de la política, puede requerirse:

```text
Sesión válida
+
reautenticación
+
MFA
```

---

# 12. COPIAR CONTRASEÑAS

La función "Copiar" también debe considerarse una operación sensible.

Requisitos:

- no registrar la contraseña en logs;
- no incluirla en URLs;
- no enviarla a analytics;
- no introducirla en herramientas de observabilidad;
- limpiar el clipboard después de un periodo configurable;
- avisar al usuario cuando corresponda;
- auditar el evento sin registrar el secreto.

Ejemplo de auditoría:

```text
PASSWORD_COPIED
user_id: 123
vault_item_id: 456
timestamp: ...
ip: ...
device: ...
```

Nunca:

```text
password: "MiContraseña123"
```

---

# 13. PROTECCIÓN DEL FRONTEND

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

---

# 14. PREVENCIÓN DE XSS

Una vulnerabilidad XSS en una aplicación de bóveda puede ser especialmente grave porque el atacante podría intentar ejecutar código dentro del contexto de la sesión del usuario.

Por ello:

- CSP estricta;
- sanitización adecuada;
- evitar `dangerouslySetInnerHTML`;
- Trusted Types cuando sean compatibles;
- cookies Secure;
- HttpOnly cuando corresponda;
- SameSite apropiado;
- protección CSRF cuando corresponda;
- dependencias auditadas;
- protección contra supply-chain attacks.

---

# 15. AUTENTICACIÓN

La autenticación debe incorporar:

- Argon2id;
- MFA;
- protección contra credential stuffing;
- rate limiting;
- backoff progresivo;
- bloqueo adaptativo;
- detección de actividad anómala;
- gestión segura de sesiones;
- revocación de sesiones;
- rotación de tokens;
- expiración apropiada.

No se recomienda utilizar una regla rígida de "5 intentos al día" para todos los escenarios.

La política debe considerar:

```text
IP
usuario
dispositivo
historial de intentos
riesgo
tipo de operación
```

---

# 16. MFA

Se debe soportar MFA.

Opciones:

- TOTP;
- WebAuthn / Passkeys;
- llaves de seguridad;
- mecanismos empresariales compatibles.

Para operaciones extremadamente sensibles, WebAuthn/Passkeys puede utilizarse como segundo factor o step-up cuando el entorno lo permita.

Los secretos TOTP también deben almacenarse cifrados.

---

# 17. SESIONES

Las sesiones deben:

- expirar;
- poder revocarse;
- rotarse;
- asociarse a un dispositivo cuando sea apropiado;
- detectar actividad anómala;
- evitar tokens permanentes;
- protegerse contra robo.

No se deben guardar tokens sensibles en lugares accesibles innecesariamente mediante JavaScript.

---

# 18. ROW LEVEL SECURITY

La V4 mantiene RLS como una capa fundamental.

Ejemplo conceptual:

```sql
ALTER TABLE public.vault_items
ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vault_owner_access"
ON public.vault_items
FOR SELECT
USING (
  owner_id = auth.uid()
);
```

Para escenarios multi-tenant:

```text
tenant_id
+
owner_id
+
role
```

deben formar parte del modelo de autorización.

Los índices deben diseñarse a partir de los patrones reales de consulta y verificarse mediante EXPLAIN/EXPLAIN ANALYZE.

No se debe afirmar que RLS sea automáticamente O(1); el rendimiento depende del plan de ejecución y del diseño de índices.

---

# 19. AUDITORÍA FORENSE

La bóveda debe registrar eventos de alto impacto:

- login;
- logout;
- MFA;
- intento fallido;
- creación de secreto;
- modificación;
- eliminación;
- visualización;
- copia;
- exportación;
- recuperación;
- cambio de contraseña maestra;
- cambio de claves;
- creación/revocación de dispositivo;
- cambios administrativos.

Nunca almacenar:

```text
password
master_password
encryption_key
totp_secret
api_key
```

dentro de los logs.

---

# 20. INTEGRIDAD DEL AUDIT LOG

La tabla de auditoría debe tener controles de privilegios.

Adicionalmente, puede utilizarse una cadena de hashes:

```text
Hash(n)
   |
   v
Hash(n+1)
   |
   v
Hash(n+2)
```

Cada registro puede incluir el hash del registro anterior para dificultar modificaciones silenciosas.

Para una versión empresarial, generar periódicamente:

```text
Audit Logs
     |
     v
Merkle Tree
     |
     v
Merkle Root
     |
     v
Almacenamiento externo / blockchain opcional
```

No publicar secretos ni PII en la blockchain.

---

# 21. RECUPERACIÓN DE LA BÓVEDA

La recuperación debe diseñarse antes de implementar el sistema.

No debe existir una función administrativa equivalente a:

```text
"Ver contraseña maestra del usuario"
```

ni:

```text
"Descifrar bóveda desde el panel admin"
```

Se debe definir un mecanismo de recuperación separado.

Opciones:

- Recovery Key;
- dispositivo confiable;
- emergency access;
- claves de recuperación de un solo uso;
- procedimiento empresarial de recuperación;
- esquema de recuperación multifirma para organizaciones.

La recuperación debe documentar claramente qué se recupera y qué información podría quedar inaccesible de forma permanente.

---

# 22. CAMBIO DE CONTRASEÑA MAESTRA

El cambio de contraseña maestra debe contemplar:

```text
Master Password antigua
        |
        v
desbloquear material criptográfico
        |
        v
generar nueva derivación
        |
        v
reproteger claves
        |
        v
nueva Master Key
```

Siempre que la arquitectura lo permita, se debe evitar descifrar y volver a cifrar individualmente millones de registros.

El objetivo es rotar o reenvolver claves de forma eficiente.

---

# 23. EXPORTACIÓN DE LA BÓVEDA

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

Nunca generar una exportación plaintext por defecto.

Si se ofrece exportación plaintext, debe ser una operación excepcional y claramente advertida.

---

# 24. BACKUPS

Los backups deben estar cifrados.

Debe existir:

```text
Backup encryption
+
Access control
+
Key management
+
Retention policy
+
Restore testing
+
Audit
```

Un backup no debe considerarse seguro únicamente porque PostgreSQL esté cifrado.

La seguridad debe cubrir:

```text
Base de datos
Backups
Snapshots
Logs
Objetos
Replicas
Entornos de staging
```

---

# 25. SECRETS MANAGEMENT

Las credenciales de infraestructura nunca deben almacenarse en:

```text
Git
.env
logs
tickets
documentación
Docker images
frontend bundles
```

Debe utilizarse un Secret Manager.

La V4 puede mantener:

```text
Doppler
AWS Secrets Manager
Azure Key Vault
```

según el entorno.

Debe aplicarse rotación y mínimo privilegio.

---

# 26. BACKEND

El backend debe aplicar:

- TypeScript estricto;
- Zod;
- consultas parametrizadas;
- Prisma o driver seguro;
- Helmet;
- CORS restrictivo;
- rate limiting;
- protección CSRF cuando corresponda;
- límites de payload;
- validación de Content-Type;
- manejo centralizado de errores;
- ausencia de stack traces en producción.

Nunca devolver:

```text
password
master key
encryption key
secret key
```

en respuestas API no autorizadas.

---

# 27. API DE LA BÓVEDA

Las operaciones deben estar separadas por nivel de sensibilidad.

Ejemplo:

```text
GET /vault/items
```

puede devolver metadatos mínimos.

Mientras:

```text
POST /vault/items/:id/reveal
```

debe:

1. validar sesión;
2. validar autorización;
3. comprobar step-up;
4. comprobar MFA si corresponde;
5. descifrar;
6. devolver el secreto únicamente al cliente autorizado;
7. registrar el evento;
8. no registrar el contenido.

---

# 28. PROTECCIÓN CONTRA IDOR/BOLA

Nunca confiar únicamente en:

```text
/vault/items/123
```

El backend debe comprobar:

```text
usuario
+
tenant
+
rol
+
ownership
+
RLS
```

Un usuario nunca debe poder acceder a otro elemento simplemente modificando un ID.

---

# 29. GESTIÓN DE DISPOSITIVOS

Se debe permitir:

- registrar dispositivos;
- revocar dispositivos;
- visualizar sesiones;
- detectar dispositivos nuevos;
- invalidar sesiones;
- aplicar políticas de confianza.

Ejemplo:

```text
Chrome - Windows
Último acceso: ...
Ubicación aproximada: ...
Sesión activa: Sí
```

No registrar información de ubicación innecesaria.

---

# 30. DETECCIÓN DE COMPORTAMIENTO ANÓMALO

Eventos que pueden generar alertas:

```text
100 revelaciones en pocos minutos
+
nuevo dispositivo
+
IP inusual
+
múltiples fallos MFA
```

El sistema puede requerir:

```text
Step-up Authentication
+
MFA
+
bloqueo temporal
+
notificación
```

Los criterios deben ser configurables para reducir falsos positivos.

---

# 31. TOTP Y SECRETOS AUXILIARES

Los TOTP deben estar cifrados igual que las contraseñas.

La aplicación puede ofrecer:

```text
Contraseña
TOTP
Copiar
Autocompletar
```

pero nunca debe registrar el código TOTP generado.

---

# 32. AUTOCOMPLETADO

Si se implementa autocompletado:

- comprobar origen/dominio;
- evitar completar en dominios parecidos;
- prevenir ataques de homograph/punycode;
- evitar filtración entre sitios;
- requerir controles explícitos;
- no enviar credenciales a terceros.

El autocompletado debe tratarse como una superficie de ataque independiente.

---

# 33. SEGURIDAD DEL NAVEGADOR

Se deben considerar:

- CSP;
- HSTS;
- X-Content-Type-Options;
- Referrer-Policy;
- Permissions-Policy;
- cookies Secure;
- SameSite;
- protección contra clickjacking;
- Trusted Types cuando corresponda.

---

# 34. DEVSECOPS

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
  +--> Security Tests
  |
  +--> DAST / OWASP ZAP
  |
  +--> Build
  |
  +--> Deploy
```

---

# 35. PRUEBAS ESPECÍFICAS DE LA BÓVEDA

Debe existir una suite específica para comprobar:

### Criptografía

- ciphertext no contiene plaintext;
- modificación del ciphertext falla;
- nonce incorrecto falla;
- key version incorrecta falla;
- claves revocadas no descifran;
- rotación conserva accesibilidad autorizada.

### Autorización

- usuario A no accede a bóveda B;
- tenant A no accede a tenant B;
- IDOR bloqueado;
- RLS bloquea accesos indebidos;
- administrador no obtiene secretos arbitrariamente.

### Visualización

- contraseña oculta por defecto;
- reveal requiere autorización;
- step-up funciona;
- timeout vuelve a ocultarla;
- copiar no genera logs con el secreto;
- logout elimina acceso a secretos.

### Ataques

- SQL Injection;
- XSS;
- CSRF;
- brute force;
- credential stuffing;
- session fixation;
- token replay;
- privilege escalation.

---

# 36. ZERO HARD-CODING

Nunca incluir en el código:

```text
DATABASE_URL
JWT_SECRET
ENCRYPTION_KEY
MASTER_KEY
API_KEY
PRIVATE_KEY
```

Todo secreto de infraestructura debe proceder de un Secret Manager o mecanismo seguro equivalente.

---

# 37. PRINCIPIO DE MÍNIMO PRIVILEGIO

Separar:

```text
Application User
Read User
Write User
Migration User
Audit User
Security Operator
Infrastructure Operator
```

No utilizar una única cuenta con permisos absolutos para toda la plataforma.

---

# 38. ADMINISTRADORES

El administrador debe poder:

- gestionar usuarios;
- bloquear cuentas;
- revocar sesiones;
- consultar auditoría;
- gestionar políticas;
- responder ante incidentes.

Pero no debería poder leer automáticamente:

```text
contraseñas
TOTP
API Keys
notas privadas
```

El acceso administrativo a secretos debe requerir un procedimiento explícito y auditable, y preferentemente estar limitado por diseño criptográfico.

---

# 39. MODELO DE DATOS CRIPTOGRÁFICO

Cada elemento cifrado debería poder asociarse conceptualmente con:

```text
vault_item_id
vault_id
crypto_version
key_version
algorithm
nonce
ciphertext
authentication_tag
created_at
updated_at
```

Nunca almacenar el secreto en texto plano.

---

# 40. POLÍTICA DE VISUALIZACIÓN

La política recomendada es:

```text
REVEAL = HIGH RISK
```

Por tanto:

```text
1. Sesión válida
2. Autorización
3. Step-up
4. MFA si corresponde
5. Descifrado
6. Visualización temporal
7. Auto-hide
8. Auditoría
```

La contraseña nunca debe aparecer:

```text
en logs
en analytics
en URL
en errores
en breadcrumbs
en métricas
en trazas
en archivos temporales
```

---

# 41. SEGURIDAD DE LA MEMORIA

Los secretos deben permanecer en memoria el menor tiempo razonablemente posible.

No debe asumirse que JavaScript permite garantizar un borrado físico perfecto de memoria.

Por ello, la arquitectura debe reducir:

- copias;
- persistencia;
- serializaciones;
- logs;
- almacenamiento local;
- exposición a extensiones;
- exposición a herramientas de debugging.

Esta limitación debe quedar documentada como parte del modelo de amenazas.

---

# 42. SEGURIDAD DE SUPPLY CHAIN

Implementar:

- lockfiles;
- revisión de dependencias;
- Dependabot/Renovate o equivalente;
- escaneo de CVEs;
- SBOM;
- firmas/verificación de artefactos cuando corresponda;
- imágenes Docker mínimas;
- eliminación de paquetes innecesarios.

Una bóveda de contraseñas no debe depender de una cadena de dependencias sin control.

---

# 43. OBSERVABILIDAD SEGURA

Logs y métricas deben diseñarse como una posible superficie de filtración.

Prohibido registrar:

```text
password
master_password
encryption_key
totp_secret
api_key
session_secret
```

Los logs deben utilizar IDs y hashes no reversibles cuando sea necesario correlacionar eventos.

---

# 44. INCIDENT RESPONSE

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
```

Cada incidente debe tener:

```text
detección
contención
revocación
rotación
investigación
recuperación
post-mortem
```

---

# 45. OBJETIVO DE SEGURIDAD ANTE ROBO DE BASE DE DATOS

Si un atacante obtiene:

```text
database.dump
+
backup
+
metadata
```

debe encontrar:

```text
ciphertext
+
nonces
+
versiones criptográficas
+
metadatos mínimos
```

y no:

```text
passwords
TOTP
API keys
master password
encryption keys
```

La seguridad de la bóveda no debe depender exclusivamente de mantener PostgreSQL inaccesible.

---

# 46. MODELO DE SEGURIDAD OPERATIVA

La seguridad debe dividirse en:

```text
Capa 1 — Identidad
Capa 2 — Sesión
Capa 3 — Autorización
Capa 4 — Criptografía
Capa 5 — Base de datos
Capa 6 — Infraestructura
Capa 7 — Auditoría
Capa 8 — DevSecOps
Capa 9 — Respuesta a incidentes
```

La caída de una capa no debe implicar automáticamente el compromiso total de la bóveda.

---

# 47. MEGA PROMPT 1 — IMPLEMENTACIÓN V4

```markdown
Actúa como Tech Lead, Security Architect, Cryptography Engineer y DevSecOps Engineer.

Implementa Bóveda Segura V4 siguiendo estrictamente una arquitectura Zero-Knowledge, Defense-in-Depth, Zero-Trust y Least Privilege.

OBJETIVO PRINCIPAL:

Construir una password vault donde las contraseñas, TOTP, API Keys, notas privadas y secretos empresariales permanezcan cifrados y donde la visualización de secretos sea una operación de alto riesgo, explícita, autenticada, autorizada, temporal y auditable.

REQUISITOS OBLIGATORIOS:

1. Implementar Argon2id para derivación de claves.
2. Separar autenticación de cifrado.
3. Implementar jerarquía de claves.
4. Implementar envelope encryption.
5. Utilizar cifrado autenticado como AES-256-GCM o equivalente seguro.
6. Versionar algoritmos y claves.
7. No almacenar secretos de bóveda en plaintext.
8. No almacenar Master Password.
9. No colocar secretos descifrados en localStorage.
10. No registrar secretos en logs.
11. Implementar RLS.
12. Implementar autorización por usuario/tenant/rol.
13. Implementar protección contra IDOR/BOLA.
14. Implementar MFA.
15. Implementar Step-up Authentication para revelar/copiar/exportar secretos.
16. Implementar auto-hide.
17. Implementar clipboard timeout.
18. Auditar reveal/copy/export sin almacenar el secreto.
19. Implementar recuperación segura.
20. Implementar rotación de claves.
21. Implementar revocación de sesiones.
22. Implementar protección contra brute force y credential stuffing.
23. Implementar CSP y headers de seguridad.
24. Implementar secret scanning.
25. Implementar SAST.
26. Implementar DAST con OWASP ZAP.
27. Implementar dependency scanning.
28. Crear pruebas específicas de criptografía.
29. Crear pruebas específicas de RLS.
30. Crear pruebas específicas de autorización.
31. Crear pruebas específicas de reveal/copy/export.
32. Documentar las limitaciones reales de seguridad del entorno navegador.
33. No implementar criptografía propia.
34. No inventar mecanismos criptográficos.
35. No utilizar claves hardcodeadas.
36. No devolver secretos mediante endpoints que no requieran autorización reforzada.

Antes de modificar código:

- inspecciona la arquitectura existente;
- identifica autenticación;
- identifica base de datos;
- identifica almacenamiento;
- identifica sesiones;
- identifica roles;
- identifica logs;
- identifica secretos;
- identifica posibles fugas;
- genera un plan de migración;
- no rompas funcionalidades existentes sin justificarlo.

Para cada cambio indica:

- amenaza mitigada;
- archivo afectado;
- impacto;
- estrategia de rollback;
- pruebas necesarias.
```

---

# 48. MEGA PROMPT 2 — AUDITORÍA DE SEGURIDAD

```markdown
Actúa como auditor senior de ciberseguridad especializado en password managers.

Audita Bóveda Segura V4 intentando demostrar cómo podría comprometerse.

No te limites a revisar código superficialmente.

Analiza:

- autenticación;
- sesiones;
- MFA;
- Argon2id;
- derivación de claves;
- envelope encryption;
- AES-GCM;
- nonce management;
- key rotation;
- recovery;
- RLS;
- IDOR/BOLA;
- XSS;
- CSRF;
- SQL Injection;
- clipboard;
- localStorage;
- sessionStorage;
- logs;
- analytics;
- errores;
- backups;
- exports;
- admin access;
- supply chain;
- dependencies;
- Docker;
- CI/CD;
- Secret Manager.

Para cada hallazgo proporciona:

SEVERIDAD
AMENAZA
EVIDENCIA
IMPACTO
EXPLOTABILIDAD
REMEDIACIÓN
PRUEBA DE VALIDACIÓN

Nunca declares que el sistema es "100% seguro".

Busca especialmente escenarios donde un atacante consiga:

1. la base de datos;
2. un backup;
3. una cuenta de usuario;
4. una sesión;
5. acceso parcial al backend;
6. acceso administrativo;
7. ejecutar JavaScript en el navegador.

El objetivo es reducir el impacto de cada escenario mediante Defense-in-Depth.
```

---

# 49. MEGA PROMPT 3 — PRUEBAS DE PENETRACIÓN

```markdown
Actúa como penetration tester autorizado.

Realiza pruebas controladas contra Bóveda Segura V4.

Comprueba:

- SQLi;
- XSS;
- CSRF;
- IDOR/BOLA;
- privilege escalation;
- brute force;
- credential stuffing;
- session hijacking;
- token replay;
- insecure direct object references;
- exposición de secretos;
- filtración mediante logs;
- filtración mediante errores;
- exportación no autorizada;
- reveal sin step-up;
- copy sin autorización;
- acceso cross-tenant;
- bypass de RLS;
- manipulación de ciphertext;
- replay de ciphertext;
- key-version confusion;
- nonce reuse;
- abuso de recovery.

No destruyas información real.

Utiliza datos sintéticos.

Genera un reporte reproducible con:

- vulnerabilidad;
- severidad;
- evidencia;
- endpoint;
- request;
- respuesta;
- impacto;
- remediación;
- prueba posterior de corrección.
```

---

# 50. CHECKLIST DE RELEASE

Antes de producción:

```text
[ ] No existen secretos hardcodeados
[ ] No existen passwords plaintext
[ ] Master Password nunca se almacena
[ ] Argon2id configurado
[ ] Salt único
[ ] Envelope encryption implementado
[ ] DEK protegida
[ ] KEK protegida
[ ] AES-GCM correctamente implementado
[ ] Nonces únicos
[ ] Versionado criptográfico
[ ] Rotación de claves
[ ] RLS activo
[ ] IDOR tests
[ ] BOLA tests
[ ] MFA
[ ] Step-up
[ ] Reveal auditado
[ ] Copy auditado
[ ] Export protegido
[ ] Clipboard timeout
[ ] Auto-hide
[ ] No localStorage para secretos
[ ] No secretos en logs
[ ] CSP
[ ] HSTS
[ ] Secure cookies
[ ] Rate limiting
[ ] Brute-force protection
[ ] Dependency scanning
[ ] Secret scanning
[ ] SAST
[ ] DAST
[ ] Backup encryption
[ ] Restore test
[ ] Recovery test
[ ] Session revocation
[ ] Incident response
[ ] Security documentation
```

---

# 51. PRINCIPIO FINAL

Bóveda Segura V4 no debe prometer seguridad absoluta.

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
        |                 |
        +--------+--------+
                 |
                 v
        Sin clave de bóveda
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
Step-up Authentication
  |
  v
MFA
  |
  v
Descifrado autorizado
  |
  v
Visualización temporal
  |
  v
Auto-hide + auditoría
```

La bóveda debe optimizarse no solamente para "guardar contraseñas", sino para minimizar el daño ante robo de base de datos, compromiso de cuenta, compromiso parcial del backend, pérdida de dispositivo y abuso interno.
