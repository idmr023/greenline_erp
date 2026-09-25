# Cuestionario de Evaluación — ERP Actual y Estrategia Tecnológica

**Dirigido a:** Gerencia
**Elaborado por:** Ivan Manrique — Área de Tecnología
**Fecha:** 24 de septiembre de 2026
**Clasificación:** Documento interno de uso directivo

---

## 1. Propósito del documento

La empresa opera actualmente un ERP propio sobre la plataforma **Frappe/ERPNext** (personalizada con módulos propios tipo POS/finanzas, accesible en el dominio corporativo). El objetivo de este cuestionario es recabar, de manera formal, el contexto y los criterios que guiaron esa adopción, así como el estado real de soporte, control y continuidad del sistema, con el fin de **tomar una decisión informada sobre la estrategia tecnológica de los próximos meses**.

Las respuestas alimentarán una evaluación comparativa entre dos escenarios estratégicos:

- **Escenario A — Operación inmediata:** se continúa sobre el ERP actual; se capacita al equipo responsable y se refuerzan los controles de código, datos y accesos.

- **Escenario B — Control tecnológico total:** transición gradual hacia una plataforma desarrollada internamente, conservando la misma lógica y funcionalidades de negocio, con edición y control total del código para los colaboradores.

---

## 2. Bloque I — Contexto de la decisión técnica

1. **¿Por qué se eligió ERPNext/Frappe como base del ERP?** ¿Se evaluaron otros frameworks o lenguajes de programación o se usó por su facilidad para construir en tipo bloques?

## 3. Bloque II — Supervisión, soporte y calidad

2. **¿El desarrollo cuenta con supervisión de un especialista** en Frappe/ERPNext o fue desarrollado de forma autodidacta?
3. **¿En qué versión** de Frappe/ERPNext se encuentra instalado el sistema? ¿Se aplican actualizaciones de seguridad y de versión? ¿Existe una política definida para ello?
4. **¿Cómo se prueban los cambios** antes de llevarlos a producción? ¿Hay entornos de pruebas, registros de pruebas o un proceso formal de aprobación?

## 4. Bloque III — Control, propiedad y dependencia

5. **¿El código personalizado** (módulos propios tipo POS/finanzas) **está versionado en un repositorio** con historial accesible a la empresa? ¿Podría entregarse una copia completa del código custom hoy?
6. **¿Quién posee y quién conoce** las credenciales de acceso (hosting, base de datos, servidor, plataforma)? ¿Están centralizadas en la empresa o en cuentas personales?
7. **¿Existen integraciones o servicios externos** (pasarelas de pago, APIs, proveedores) con claves o contratos a nombre de personas particulares?
8. **¿Cuál es el plan de respaldo (backup) de la base de datos?** Frecuencia, retención y ¿se ha probado alguna vez la restauración?

## 5. Bloque V — Riesgos y continuidad del negocio

9. **¿Existe documentación técnica y de usuario** del sistema (arquitectura, manual de uso, procedimientos)?

## 6. Bloque VI — Estrategia y decisión

10. **¿Cuál es la preferencia del comité entre el Escenario A y el Escenario B** (o una combinación por fases)? ¿Qué criterio pesa más: velocidad inmediata, control total o costo?
11. **¿Cuál es el horizonte temporal esperado** del ERP actual (seguirá 1 año, 3 años, indefinidamente)?
12. **¿Qué condición mínima exigiría el comité** para aprobar una eventual transición tecnológica (sin interrupción del servicio, auditoría contable intacta, plazo máximo, otro)?
13. **Presupuesto o restricciones** que deban considerarse en cualquier escenario.
14. **Comentarios o información adicional** que considere relevante para la evaluación.