# Fase 2: Acceso, Adaptación y Capacitación

Este documento define la estructura, tiempos y metodologías de las primeras subfases de la Fase 2 dentro del Sprint 2. El enfoque busca una transición técnica fluida y una adopción efectiva por parte de los usuarios finales: vendedores, jefes de tienda y personal de almacén y oficinas.

---

## Contexto: las 4 subfases de la Fase 2

La Fase 2 se divide en cuatro subfases:

| # | Subfase | Duración | Estado |
|---|---------|----------|--------|
| 1 | Acceso | 1 día | Definida en este documento |
| 2 | Adaptación | 1 día | Definida en este documento |
| 3 | Elaboración y capacitación de tiendas, almacén y oficinas | 1 semana | Definida en este documento |
| 4 | Mejora continua | Permanente | Ya definida (ver `Fase 2 - Implementación.md`) |

Este documento detalla tiempos y metodologías de las subfases 1 a 3. La subfase 4 funciona como receptor de todo lo detectado en las anteriores: bugs, fricciones de UX y mejoras detectadas se backlogan allí.

**Duración total estimada de las subfases 1 a 3: 9 días hábiles** (1 día + 1 día + 1 semana).

---

## 1. Subfase 1: Acceso

**Duración:** 1 día
**Objetivo:** Obtener credenciales y validar la entrada al entorno del ERP de la directiva (producción o pruebas).

Al inicio de esta subfase aún no se conoce el stack del sistema (lenguaje, arquitectura ni módulos); el acceso es únicamente de observación y validación.

### Actividades

- Recepción de usuarios, contraseñas y accesos a bases de datos o paneles de administración.
- Verificación de permisos y roles: asegurar que se tiene la visibilidad completa que corresponde al perfil asignado.
- Validación de seguridad y accesibilidad desde diferentes redes (oficina, casa, datos móviles).
- Registro de credenciales en un gestor de contraseñas seguro; nunca en texto plano ni en chats.

### Entregables

- Sesión iniciada y verificada en todos los módulos a los que se tiene acceso.
- Alcance de permisos documentado (qué se ve y qué no).
- Checklist de accesos cerrado (qué credencial abre qué recurso).

---

## 2. Subfase 2: Adaptación

**Duración:** 1 día (dedicación exclusiva al sistema)
**Objetivo:** Auditoría funcional en solitario y mapeo completo del sistema.

### Actividades

- **Revisión exclusiva:** navegación profunda por todos los módulos del sistema sin interrupciones.
- **Control de calidad (QA) inicial:** verificación de los flujos principales (ventas, inventario) e identificación de enlaces rotos, errores de interfaz o fallos de lógica.
- **Documentación de mejoras:** toma de nota de fricciones de experiencia de usuario (UX) y cuellos de botella técnicos, clasificándolas para integrarlas al backlog de la **Subfase 4 (Mejora continua)**.

### Entregables

- Inventario de módulos, flujos y pantallas del sistema.
- Lista de defectos detectados (bugs) con severidad.
- Backlog inicial de mejoras para la Subfase 4.

---

## 3. Subfase 3: Elaboración y Capacitación

**Duración:** 1 semana
**Objetivo:** Preparar los materiales y desplegar en sitio (tiendas, almacén y oficinas) la formación de los perfiles no técnicos en el uso de la herramienta.

Esta subfase tiene dos momentos:

1. **Elaboración** de materiales y preparación logística (inicios de la semana).
2. **Capacitación** presencial, visita a cada tienda para enseñar a vendedores y jefes de tienda (resto de la semana).

### 3.1. Perfiles objetivo

- Vendedores de tienda.
- Jefes de tienda.
- Personal de almacén.
- Personal de oficinas (según aplique).

### 3.2. Elaboración de materiales

- Guía rápida (playbook) por rol: los 5 a 7 pasos clave que cada perfil usará a diario.
- Presentación visual (PowerPoint o similar) de 15 a 20 minutos con capturas de pantalla reales del sistema.
- Credenciales de prueba o modo supervisado para la práctica.
- Formulario permanente de buzón de ideas / reporte de incidencias (ver sección 4).
- Video de respaldo pregrabado navegando el sistema (respaldo ante caída de internet).

### 3.3. Metodología de capacitación: modelo "Tell, Show, Do, Review"

Para perfiles no técnicos, la retención mejora combinando lo visual con lo interactivo. El esquema se estructura bajo buenas prácticas de andragogía (enseñanza para adultos). Sesión sugerida: **60 a 75 minutos por grupo.**

1. **Fase teórica / visual — "Tell & Show" (15 a 20 min):**
   - **Bienvenida y propósito:** explicar *por qué* el sistema les hará el trabajo más fácil; no enfocarse en lo técnico, sino en el beneficio diario.
   - **Lista de funcionalidades clave:** qué pueden hacer ahora que antes era difícil.
   - **Recorrido visual:** capturas de pantalla señalizando dónde hacer clic para las tareas más comunes, proyectado en vivo sobre el sistema real.

2. **Fase práctica — "Do" / Hands-on (30 a 40 min):**
   - **Entorno seguro:** cada colaborador ingresa al sistema (credenciales de prueba o bajo supervisión) y ejecuta un flujo real: registrar una venta, buscar stock, consultar un pedido.
   - Acompañamiento uno a uno para corregir errores en tiempo real.

3. **Cierre y retroalimentación — "Review" (10 a 15 min):**
   - **Q&A:** sección abierta para resolver miedos y dudas.
   - **Buzón de ideas (asíncrono):** presentación del formulario permanente. Si mañana o en una semana se les ocurre una mejora o encuentran algo incómodo, ese es el canal oficial para que la idea llegue al responsable del proyecto.

### 3.4. Plan de visitas

- Calendario de visitas por sucursal (San Miguel, La Molina y demás tiendas/oficinas).
- Cada visita: sesión grupal + práctica individual + registro de dudas.
- Si la tienda no puede detenerse: micro-sesiones de 15 minutos por turnos, sin cerrar la tienda (ver contingencias).

---

## 4. Gestión de incidencias (ticketing)

Para evitar que los reportes de errores se pierdan en chats o correos, se implementa un sistema de tickets centralizado y escalable.

- **Flujo del usuario:** el colaborador accede a un formulario ultra simplificado (el mismo Forms del buzón de ideas o una herramienta tipo Trello / Jira Service Desk) con solo 3 campos:
  1. Qué intentaba hacer.
  2. Qué falló (con opción de subir captura de pantalla).
  3. Urgencia (crítico / normal / bajo).
- **Flujo de desarrollo:** cada reporte entra a una única cola asignada al responsable del proyecto.
- **Triaje:** revisión diaria de la cola, priorizando *bugs críticos* (caídas del sistema, bloqueos de ventas) sobre *mejoras menores* (cambios de color, botones).
- **Cierre:** cada ticket recibe respuesta o estado visible para el reportero.

---

## 5. Gestión de la resistencia al cambio

Ante colaboradores que no quieran usar el nuevo sistema, se aplican tácticas de gestión del cambio (modelo ADKAR de Prosci):

1. **Identificar el "WIIFM" (*What's In It For Me?*):** la resistencia suele nacer del miedo a trabajar el doble. Demostrar en vivo cómo el sistema ahorra tiempo específico: *"Con esto ya no tienes que contar el stock a mano: el sistema lo hace en 2 clics"*.
2. **Escucha activa sin estar a la defensiva:** si un usuario dice *"el anterior era mejor"*, no discutir la tecnología. Preguntar: *"¿Qué es exactamente lo que extrañas del otro sistema?"*. A menudo es un atajo o una vista específica que se anota para la Subfase 4.
3. **Encontrar a los "champions":** en cada tienda habrá alguien que entienda el sistema más rápido. Identificarlo y convertirlo en aliado. Cuando el personal resistente vea a su propio compañero usarlo con éxito, la fricción disminuye.
4. **No forzar la perfección inmediata:** permitir errores los primeros días sin penalización; el enfoque es el aprendizaje, no la auditoría del desempeño.

---

## 6. Plan de contingencia

Todo despliegue en entorno físico requiere respaldos ante escenarios de falla:

| Riesgo / escenario | Acción de contingencia |
| --- | --- |
| Fallo de internet o caída del sistema durante la capacitación en tienda | Tener la presentación descargada en local y un video pregrabado navegando el sistema para continuar con la teoría. La práctica se reprograma. |
| La tienda tiene demasiados clientes y no pueden detenerse para la capacitación | Dividir al personal: capacitar primero al jefe de tienda y un vendedor para que repliquen, o hacer micro-sesiones de 15 minutos por turnos sin cerrar la tienda. |
| El sistema de tickets / formulario falla o es ignorado | Establecer temporalmente un grupo cerrado de WhatsApp unidireccional o un número de contacto solo para emergencias críticas (*showstoppers*), hasta restablecer el canal oficial. |
| Un error crítico (bug) bloquea las ventas en vivo después de la capacitación | Protocolo de *rollback* o procedimiento manual temporal (papel / Excel) para no detener la operación comercial mientras se corrige el código. |
| El acceso (Subfase 1) se demora más de lo previsto | Ajustar el calendario: subfases 1 y 2 son secuenciales e inamovibles entre sí; la capacitación se corre, pero no se inicia sin haber completado la adaptación. |

---

## 7. Criterios de éxito y entregables por subfase

| Subfase | Criterio de cierre |
|---------|-------------------|
| 1 — Acceso | Credenciales recibidas, sesión verificada en todos los módulos y permisos documentados. |
| 2 — Adaptación | Inventario de módulos completado, bugs registrados con severidad y backlog de mejoras de la Subfase 4 alimentado. |
| 3 — Capacitación | Todas las tiendas, el almacén y las oficinas visitados; cada perfil ejecutó al menos un flujo real en el sistema; buzón de ideas / tickets operativo y conocido por todos. |

---

## 8. Nota sobre la Subfase 4: Mejora continua

La mejora continua ya está definida en `Fase 2 - Implementación.md`. Todo lo detectado en las subfases 1 a 3 (bugs, fricciones de UX, peticiones de los usuarios y del buzón de ideas) se backloga ahí para su priorización y ejecución posterior.
