# Contraste: «Fase 2 - Implementación» vs. ERP de Gerencia (Frappe/`pos_next`)

> **Fecha:** 25/09/2026 · **Método:** comparación documental (solo lectura) · **Fuentes:** `docs/Sprint2/cuestionarios&dudas/Fase 2 - Implementación.md` (1258 líneas) + `docs/ERP_Gerencia_Exploracion_y_Flujos.md` (exploración del 25/09/2026 sobre `pos.glpago.com`).
> **Leyenda de estados:** 🟢 Cubierto por el ERP · 🟡 Parcial / preparado sin operar · 🔴 Ausente · ⚪ No aplica al ERP (sigue en el web propio).

---

## 1. Contexto: el supuesto del Fase 2 cambió

El Fase 2 asumía que Greenline **construiría su propio ERP** (React + Supabase/Prisma, Principio 3) y su §0 ya anticipaba la convergencia:

> *«El ERP que estaba desarrollando y el que está desarrollando la empresa se volverán uno solo.»* (§0.4)

Hoy existe **ese ERP de la empresa**: Frappe 15 + ERPNext 15 + app `pos_next` 1.16.0, con 52 workspaces, 111 roles, 308 reportes y 66 KPIs. El §0 se cumple en su tramo **«1. Acceso»** y **«2. Adaptación»** (esta exploración + documentación) — faltan **«3. Verificación»** (con gerencia) y **«4. Propuesta de cambios»** (ya con modelo conocido).

**Consecuencia principal:** las capacidades del Fase 2 ya no se construyen «a ciegas»; se **reparten**: dominio de negocio → ERP; experiencia web/comunidad/reclamaciones/citas → lado GreenLine (nuestro stack), conectado al ERP.

## 2. Matriz capacidad por capacidad (§4)

| # | Capacidad (Fase 2) | Estado en ERP | Evidencia | Implicancia |
|---|---|---|---|---|
| 4.1 | Seguridad y permisos (roles, scopes por tienda) | 🟢 | 111 roles (80+ `GL-*`), permisos por DocType, campos `gl_scope_company/store`, workspaces admin-only, reportes `User Role Audit` | El modelo es **Frappe** (Rol/Permiso), no tokens `stock:approve` de §4.1 → mapear roles Fase 2 ↔ `GL-*` antes de integrar. Nuestro RBAC Supabase sigue para el web. |
| 4.2 | Usuarios independientes por área + **QR** | 🟡 / 🔴 | Cuentas individuales ✅ (20 usuarios con área+alcance); QR ❌ no evidenciado; correo de activación no verificado | Identidad individual ya resuelta en ERP. **QR + alias `correo+usuario` = lado web/externo** (su §4.2 es sobre nuestro panel). |
| 4.3 | Auditoría inmutable | 🟡 | Auditoría nativa Frappe + explícita en workspaces («el historial no se edita ni se elimina», Nota de Corrección + auditoría de cambios), reportes `Attendance Correction Audit`, `Login Identifier Audit` | **Dominio ERP: ya cubierto**. Nuestro `audit_logs`+trigger queda para tablas web (reclamaciones, blog, citas). |
| 4.4 | Inventario, stock y aprobaciones | 🟡 | 70 almacenes (árbol por tienda), 231 items, `validate_stock_on_save`, bloqueo de venta sin stock, `Stock Reconciliation=0`, movimientos=0 | Estructura y reglas listas; **operación en 0**. No duplicar: cuando arranque, el kardex nativo es la verdad. Aprobaciones entre tiendas: verificar si `pos_next` las tiene o es gap. |
| 4.5 | Flujo de pedidos y entregas | 🔴/🟡 | `Sales Order/Delivery Note/Sales Invoice=0`; modelo nativo disponible | Estado actual: **no pasa por el ERP**. Justifica la propuesta elegida: **checkout web → Sales Order vía REST**. Los 10 estados custom de §4.5 no existen en Frappe (Draft/Submitted/Cancelled) → definir mapeo. |
| 4.6 | Dashboard operativo | 🟢/🟡 | 66 Number Cards + 308 reportes + workspaces con KPIs; «venta de hoy, turnos POS, ranking tiendas» | **Operación/gerencia: cubierto** (con disclaimer «no es verdad contable»). Dashboard **web** (tráfico, reclamaciones, citas, comunidad) sigue pendiente en nuestro lado. Evitar duplicar KPIs de ventas. |
| 4.7 | Notificaciones internas | 🟡 | Workspace `Greenline Mail` + `Mail Settings`; motor de alertas nativo de Frappe no verificado en detalle | Infra de correo presente. Bandeja/badge topbar + alertas de stock/reclamación **web** siguen en nuestro alcance. |
| 4.8 | Comunidad y fidelización | 🔴 | Sin modelos de comunidad/consentimiento/campañas observados | **Gap total esperado** (no es dominio ERP). Cliente ERP puede aportar segmentos (`gl_sales_channel`), pero comunidad/campañas/consentimiento = **web** (§4.8, 2.5). |
| 4.9 | Citas de servicio técnico (base) | 🟡 | `Service Ticket=0`, `Repair Order=0`; **no hay modelo de cita/agenda** | El ERP tiene *postventa*, no *citas*. La base de citas (modelo, estados, formulario, vista central — §4.9/§10) **queda en el lado que decida gerencia**: tabla `citas` Supabase (plan §10) o DocType en `pos_next`, con webhook/REST hacia el otro. |
| 4.10 | Contratos API estandarizados | ⚪ | Frappe expone su REST (`/api/resource`, `get_count`, cookie/API key) — ya lo usamos con éxito | Aplica a **nuestro** backend. Al integrar: respetar contrato Frappe en un adaptador, no exponer su formato crudo al front. |
| 4.11 | Paginación backend estándar | ⚪ | Frappe usa `limit_page_length`/`limit_start`; nuestro estándar es `{data,total,page,limit}` | Punto de traducción obligatorio en la capa de integración. |
| 4.12 | Validación, seguridad, calidad (Zod/Helmet/rate limit) | ⚪ | Propio de nuestro stack; en ERP: permisos + sesión/API key | Sigue 100% en nuestro backend. Refuerzo: secretos solo en env, rate limit en login. |
| 4.13 | UX operativa del panel interno | ⚪ | La UX del ERP es Frappe desk (ajena a nosotros) | Aplica a nuestro `/admin` (incl. AdminReclamaciones). No «arreglar» la UX de Frappe. |

## 3. Roadmap §6 (2.1–2.7): qué se mueve, qué queda

| Fase | Contenido | En el nuevo mundo |
|---|---|---|
| **2.1 Base operacional** | levantamiento, matriz usuarios/roles/tiendas, auditoría, permisos, endpoints, paginación, healthcheck, QR | 🟡 **parcialmente hecho por el ERP** (roles/auditoría/estructura ya existen allá) + esta exploración avanza el «levantamiento». Queda: matriz de responsables **validada por gerencia**, nuestro estándar API/paginación, healthcheck web, **QR**. |
| **2.2 Inventario y movimiento** | stock general/tienda, movimientos, aprobaciones, kardex | 🔴→🟢 **trasladado al ERP** (estructura lista, operación en 0). Nuestro trabajo: **habilitar operación** (capacitar, migrar registro manual de Drive), no reescribir stock en Supabase. |
| **2.3 Pedidos y entregas** | estados, validación de stock, entregas, correos | 🟡 **integración**: web → `Sales Order` ERP. Correos transaccionales: decidir si ERP (nativo) o nuestro `enqueueEmail` (ya operativo con SMTP). |
| **2.4 Dashboard y notificaciones** | KPIs, filtros por sede, bandeja, alertas | 🟢 KPIs de negocio → ERP. 🔴 Web/citas/reclamaciones + bandeja topbar → nosotros. |
| **2.5 Comunidad y fidelización** | consentimiento, segmentos, campañas, referidos | 🔴 **100% web** (nada de esto en el ERP; el email marketing por campaña ya lo tenemos en n8n). |
| **2.6 Base de citas** | modelo, catálogo, estados, formulario, vista central, auditoría | 🟡 **decisión de sede** (ver §5 de este doc): Supabase `citas` (plan §10) vs DocType `pos_next`. |
| **2.7 UX y refinamiento** | tablas, confirmaciones, feedback | ⚪ **web** (nuestro admin). |

## 4. Temas puntuales del Fase 2

- **§3.1 Levantamiento** (áreas, tiendas, técnicos, canales, servidores, comisiones en Drive): la exploración entrega **parte** (estructura, tiendas, usuarios, roles, modelos). Faltan datos **operativos** que solo tiene la empresa: horarios, técnicos por sucursal, proceso real de pedidos postventa, hosting propio, comisiones.
- **§10 Citas (Apps Script → ERP):** el ERP **no** tiene sistema de citas; el plan §10 (tabla Supabase `citas` + endpoints + componentes React) sigue siendo la propuesta vigente salvo que gerencia mande construirlo en `pos_next`. El vínculo «tienda» ya existe como catálogo en el ERP (9 tiendas + almacenes).
- **§9 Riesgos:** R1 (diseñar sin dominio) → **mitigado** por esta exploración; R5 (cuentas compartidas/QR) → el ERP ya usa cuentas individuales, el riesgo queda en el web; R8 (microservicios prematuros) → el ERP unificado **debilita** la urgencia de fragmentar; R6/R7 (citas sin responsables, comunidad como lista) → sin cambios.
- **§0 flujo preliminar:** accedido ✅ · adaptado/capacitado 🟡 (documentación lista, equipo por capacitar) · verificado ⬜ (con gerencia) · propuesta de cambios ⬜ (tras contraste y decisiones).

## 5. Qué NO duplicar (el ERP ya lo cubre)

1. **KPIs de ventas, utilidad, embarques y precios** → workspace Centro de Gestión / Analisis Operativo por Tienda.
2. **Auditoría de usuarios, asistencia, asignaciones y correcciones de datos históricos** → nativa + workspaces admin.
3. **Estructura de almacenes/tiendas/items/clientes/proveedores** → maestros ERP (fuente de verdad al integrar).
4. **Tickets/órdenes de postventa y reclamos a proveedores** → modelos ERP (cuando arranquen).
5. **Series/CPE SUNAT** → módulo nativo fail-closed (no improvisar otra conexión).
6. **Rol/permiso por tienda del personal ERP** → `GL-*` + `gl_scope_*`; no inventar roles paralelos para gente que opera el ERP.

## 6. Brechas asumibles del lado GreenLine (yo / web)

| Brecha | Origen en Fase 2 | Propuesta |
|---|---|---|
| **Reclamaciones (Libro)** | §4.3/§7 entidades + flujo de reclamaciones | ✅ ya construido (tablas + RLS + panel + correos); pendiente deploy/PR |
| **Integración pedidos web → ERP** | §4.5/2.3 | **Primera propuesta elegida**: `POST /api/pedidos` → `Sales Order` ERP (REST, con adaptador de contrato y reintentos) |
| **Citas de servicio técnico (base)** | §4.9/§10 | Modelo en Supabase según §10, con catálogo de tiendas **importado desde el ERP** |
| **Comunidad, fidelización y email marketing** | §4.8/2.5 | Web + n8n/Resend (tanda 2 lista) |
| **Dashboard web (tráfico, contenido, citas, reclamaciones)** | §4.6 | Nuestro admin; los de negocio se leen del ERP |
| **Auth QR / identidad web** | §4.2 | Lado web; el ERP no lo ofrece hoy |
| **UX del panel interno + API estándar/paginación** | §4.10–4.13 | Nuestro backend/frontend (no aplica al ERP) |
| **Documentación y capacitación** | §3.1 entregables | ✅ `ERP_Gerencia_Exploracion_y_Flujos.md` (guía por perfil incluida) |

## 7. Decisiones que dependen de gerencia (gates)

1. **Autoridad de verdad:** ¿los maestros/precios/stock viven en el ERP y el web se suscribe? (Recomendado: sí; hoy conviven con Drive/Sheets.)
2. **Sede de las citas** (ERP vs Supabase) y quién las opera.
3. **Habilitar operación transaccional** en el ERP (POS, stock, pedidos) — está diseñado pero en 0.
4. **E-facturación** (interruptor fail-closed, aprobación del propietario) y **portal de distribuidores** (gateado) — no tocar sin su visto bueno.
5. **Rol para mi cuenta** (`roles: []`) para exploración/capacitación completa.
6. **Correos transaccionales:** motor ERP vs nuestro SMTP (ya verificado en prod).

## 8. Recomendación de secuencia

1. Presentar esta documentación a gerencia = cerrar **«Verificación»** del §0 + entregar parte del levantamiento §3.1.
2. Ejecutar la **integración pedidos web → Sales Order** (primer caso real de convergencia, bajo riesgo: solo `POST` de creación).
3. Decidir **sede de citas** y arrancar la base §10 conectada al catálogo de tiendas del ERP.
4. Una vez que el ERP **opere** (POS/stock), migrar registro manual de Drive → módulos del ERP y apagar duplicados (la comunidad y reclamaciones se quedan en el web).

## 9. Salvedades del contraste

- Evidencia al 25/09/2026, **solo lectura**, cuenta sin roles estándar: posibles módulos/permisos no visibles desde `mkt@glperu.com` (403 no distingue «sin permiso» de «inexistente»).
- No se verificaron: motor de notificaciones de Frappe, plantillas de correo, webhooks, ni si `pos_next` tiene aprobaciones de stock entre tiendas.
- Los conteos «en 0» prueban que **hoy** no hay operación, no que no la haya mañana: el sistema está en despliegue activo.
