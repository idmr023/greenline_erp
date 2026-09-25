# ERP de Gerencia — Exploración, estructura y flujos (as-is)

> **Fecha:** 25/09/2026 · **Método:** solo lectura (GET + login) sobre la API REST del ERP · **Cuenta:** `mkt@glperu.com` (IVAN)
> **Fuente:** `https://pos.glpago.com` · Credenciales solo en `.env` local (nunca en el repo).
> **Propósito:** documentar el ERP de la directiva para uso propio, capacitación y base del contraste con `docs/Sprint2/cuestionarios&dudas/Fase 2 - Implementación.md`.

---

## 1. Meta y alcance

- Mapear **qué sistema es** (stack, módulos, navegación), **qué datos contiene hoy** y **cómo están diseñados sus flujos operativos**.
- Identificar el **estado real de operación** (configurado vs. en uso) y las **inconsistencias** detectadas.
- **No** se modificó nada en el ERP: cero escrituras (`POST/PUT/DELETE` de negocio).

## 2. Método de exploración y límites de evidencia

| Regla | Detalle |
|---|---|
| Solo lectura | Sesión vía `POST /api/method/login` (cookie) + `GET /api/resource/...` y `GET /api/method/frappe.client.get_count` |
| Evidencia dura | Solo se afirma **existencia** de un DocType cuando la API devolvió **HTTP 200** con datos |
| Control importante | Un DocType **inexistente también devuelve 403** ("no tiene acceso a doctype vía permiso de rol"): por eso los 403 **no** prueban existencia |
| Sin enumeración de esquemas | `DocType`, `Shortcut`, `Card` → 403; la navegación se leyó del campo `content` (JSON de bloques) de cada `Workspace` |
| Fechado | Los conteos son un snapshot del 25/09/2026; el sistema está en despliegue activo |

## 3. Stack y entorno

| Componente | Valor |
|---|---|
| Framework | **Frappe 15.107.2** |
| ERP | **ERPNext 15.108.0** |
| App propia (la clave) | **`pos_next` 1.16.0** — TODA la capa GreenLine (español, workspaces custom, reportes, modelos) |
| Empresa única | `GREENLINE GROUP S.A.C.` (Perú), moneda PEN |
| Base API | `https://pos.glpago.com` (UI en `/app`; API en `/api/resource/...`) |
| Home desk | `/app/configuracion-del-sistema` |
| Escala | 34 módulos · 52 workspaces · 111 roles · 20 usuarios · 308 reportes · 66 Number Cards |

## 4. Mapa de navegación (workspaces)

### 4.1 Árbol de workspaces custom (`pos_next`) — la GreenLine real

Los workspaces custom usan **bloques propios** (`GL Nav …`) + tarjetas/atajos; varias descripciones (párrafos del vendor) son la mejor documentación existente y se reproducen aquí.

**Casa / dirección**
- **Centro de Gestión GreenLine** (raíz) — *«Datos históricos de gestión/referencia. No es verdad de inventario ni contable.»* Secciones: Resumen Gerencial (KPIs históricos: venta/utilidad/embarques/precios), Análisis Histórico de Ventas/Utilidad/Embarques-Precios, Reglas de Descuento, Mantenimiento de Datos Históricos (edición admin con Nota de Corrección + auditoría; trazabilidad libro/hoja/fila de solo lectura).
- **Centro Administrativo GreenLine** (raíz) — *«Datos administrativos de gestión/referencia. No es planilla, contabilidad ni inventario.»* + *«Solo administradores: historial de asignaciones, auditorías y reparaciones… no se edita ni se elimina.»* Secciones: RRHH, Asistencia, Contratos, Referencia de Sueldos, Alquileres de Tiendas, Licencias y Cumplimiento (ITSE/incendio/certificados), Gastos y Renovaciones, Mantenimiento, Usuarios y Permisos, Inicio de Sesión y Seguridad.
  - Hijo: **Gestion de Activos** — celulares, computadoras, SIM, cuentas Office, herramientas, activos de tienda («control administrativo puro: sin contabilidad, sin inventario de mercadería»).
- **Configuracion del Sistema** (raíz) — *«Usuarios, permisos, seguridad de login y mantenimiento. Solo para administradores del sistema.»* (workspace por defecto de mi cuenta).

**Operación comercial**
- **GreenLine Perú** (raíz) — Operación / Postventa / Proveedores y Logística. Atajos: Lote de Importación, Vehículo, Ticket de Servicio, Factura de Venta.
- **Ventas Perú** (raíz) — Atajos: Iniciar POS, Factura de Venta, Precios de Venta.
  - **Ventas POS** (hijo) — «Mantenimiento POS».
  - **Analisis Operativo por Tienda** (hijo) — *«Ventas por tienda, distribuidor y canal online (histórico Excel + ERP). Datos de gestión/referencia; no es verdad de inventario ni contable.»* KPIs en vivo: venta/cantidad de hoy, turnos POS abiertos, tiendas con caja abierta, ranking de tiendas, venta por canal (tiendas/distribuidores/online), mes y año en curso. Atajos: Ranking de Tiendas, Detalle Operativo de Tienda.
- **Postventa** (raíz) — Servicio/Calidad. Atajos: Ticket de Servicio, Orden de Reparación, Reclamo al Proveedor.
- **Gestion de Clientes** (raíz) — *«Clientes minoristas (B2C) con sus vehículos, VIN, facturas y postventa. Los distribuidores se gestionan SOLO en Gestion de Distribuidores.»*
- **Gestion de Distribuidores** (raíz) — *«…fichas comerciales, pedidos, precios, despachos, estado de cuenta y postventa. El portal externo para distribuidores es una fase futura gateada por el propietario.»*

**Cadena de suministro**
- **Cadena de Suministro** (raíz, bloque `GL Nav Cadena`):
  - **Centro de Operaciones de Importación** (hijo).
- **Portal de Proveedores** (raíz) — Catálogo y Precios (Modelo de Fábrica, Precio Mensual) / Pedidos y Documentos (Órdenes de Compra, Envío de Costos).
  - **Portal Logístico** (hijo) — Cotizaciones (Cotización Logística) / Seguimiento de Embarque (Hito de Embarque, Checklist Documental).
- **Inventario y VIN** (raíz) — Identidad y Trazabilidad / Verdad de Inventario (documentos). Atajos: Conteo de Inventario, Vehículo, Entrada de Stock, Número de Serie.
  - **Gestión de Costos** (hijo) → **Rentabilidad Perú** (nieto) — Análisis de Utilidad.

**Tributación / portales / soporte**
- **Tributacion y Facturacion Electronica** (raíz) — *«Facturación electrónica nativa GreenLine. TODO el envío está cerrado por defecto (interruptor global fail-closed). Cada empresa se configura en 'Datos Fiscales y Certificado Digital'; la producción requiere aprobación explícita del propietario.»*
- **Gestion Financiera** (raíz) — *«Panel financiero de referencia sobre la contabilidad nativa de ERPNext. Sin datos inventados: las vistas muestran su estado real (vacío si aún no hay registros).»*
- **GreenLine External Portal**, **Colaboracion Externa**, **Portal de Proveedores**, **Maitrox Customs Review**, **Greenline Mail** (+ hijo **Mail Settings**), **POSNext**, **System Feedback**, **Poco Usado** (basurero/legacy), **Ejemplo-mkt@glperu.com** (workspace de prueba de mi usuario).

### 4.2 Workspaces nativos ERPNext (bajo «Poco Usado»)

Home, Selling, Buying, Stock, Accounting (+ Payables/Receivables/Financial Reports), CRM, Manufacturing, Assets, Projects, Quality, Support, Tools, Website, Users, Build, Integrations, ERPNext Settings, ERPNext Integrations, Welcome Workspace. → Funcionalidad estándar sin personalizar; poco usada por GreenLine.

## 5. Usuarios, roles y permisos

- **111 roles** (80+ `GL-*` del modelo propio) y **20 usuarios** (18 activos), creados con delegación de `wei.wang@glperu.com` (23/09/2026).
- Modelo custom por usuario (campos `gl_*`): `gl_position` (área), `gl_position_level` (`company`), `gl_scope_company` (GREENLINE GROUP S.A.C.), `gl_scope_store` (tienda).
  - Áreas observadas: `grupo_direccion`, `gerente_pais`, `ti_pais` (incluye mi cuenta), `rrhh_gerente`, `almacen_supervisor`, `ventas_ejecutivo` (por tienda).
- **Mi cuenta (`mkt@glperu.com`, username `ivan`)**: `roles: []` (cero roles estándar), `gl_position=ti_pais`, `gl_scope_company=GREENLINE…`, `gl_scope_store=""`. Puedo leer datos de negocio y workspaces, pero **no** enumerar esquemas (`DocType`/`Shortcut`/`Card` → 403). Si gerencia quiere que vea todo, debe asignarme un rol `GL-*`.
- **Workspaces administrativos** describen controles propios: auditoría de asignaciones, historial inmutable, login/seguridad por admin, reportes `User Role Audit`, `Login Identifier Audit`, `Social Login Status`.
- **No evidencié** autenticación por QR ni envío de correo de activación (revisar con gerencia; ver contraste Fase 2 §4.2).

## 6. Modelos de datos: qué hay hoy

### 6.1 Catálogos maestros (con datos)

| DocType | Registros | Notas |
|---|---:|---|
| Item | 231 | Naming `STO-ITEM-.YYYY.-`; campos `gl_*` extensos (VIN/specs batería-motor, `gl_sku_governed`, `gl_completeness_percent`); notas técnicas en chino |
| Customer | 79 | `Cliente Mostrador` + reales; `gl_sales_channel`; incluye campos `gl_rut/gl_giro/gl_comuna` (plantilla heredada de Chile) |
| Supplier | 22 | Fábricas chinas p.ej. 江苏新日 (grupo `Fabrica`), `gl_merged_into` |
| Warehouse | 70 | Árbol: `PE-OPERACIONES`/`PE-TODOS` → `PE-TIENDAS` → 9 tiendas (Ate, Comas, Huancayo, La Molina, Lince, Miraflores, Salamanca, San Miguel, Surco) con subalmacenes Dañado/Repuestos |
| Territory | — | Árbol Perú (departamentos) |
| Price List | ≥2 | `Compra estandar` (buying), `Venta estándar` (selling), PEN |
| Contact / Address | 377 / 64 | — |
| Company | 1 | GREENLINE GROUP S.A.C.; `gl_pos_default_store=PE-LINCE`, `gl_pos_same_store_returns=1` |
| User | 20 | — |

### 6.2 Modelos custom **con datos** (histórico importado + operación piloto)

| DocType | Registros | Contenido |
|---|---:|---|
| Peru Historical Product Price | 477 | Versiones de precios (`price_version=202304`), retail/online PEN, trazabilidad completa de origen (`source_workbook/sheet/row/hash`, p.ej. «秘鲁车型及各产品定价-2.xlsx») |
| Peru Historical Store Sales | 304 | Ventas por mes/tienda/canal (fuente de los KPIs «hoy/turnos/portal») |
| Peru Historical Shipment Ledger | 262 | Embarques: proveedor/fábrica, BL, contenedor, ETD/ETA, FOB/CIF, pagos PEN/USD/RMB; **97 campos** |
| Peru Historical Sales Summary | 108 | Ventas mensuales históricas por canal |
| Peru Historical Profit Summary | 29 | Utilidad mensual; `calculation_basis`: «utilidad bruta = margen de vehículos + utilidad de postventa (40%); **referencia gerencial, no contabilidad**» |
| Company Asset | 60 | Activos con IMEI/SIM/QR, asignación a tienda/empleado, auditorías y garantías |
| Company Account | 12 | Cuentas Office/Gmail con riesgo, 2FA, renovación y responsable |
| **DUA** | **2** | Declaraciones aduaneras (p.ej. `118-2023-10-091428`, Marítima del Callao, SUNAT, `data_status=Confirmed`) con vínculo VIN (`vehicle_count`, `linked_vehicle_count`, `unresolved_vehicle_count`, `conflict_count`) |
| POS Profile | 10 | Un perfil por tienda: almacén propio (p.ej. `PE-LINCE-VENTAS`), print `GL PE Recibo 58mm`, lista `Venta estándar`, control de stock (`validate_stock_on_save=1`), límites de descuento, campos `posa_*` |

### 6.3 Modelos **preparados pero vacíos** (0 registros — verificado con `get_count`)

`Sales Order`, `Sales Invoice`, `POS Invoice`, `Delivery Note`, `Quotation`, `Lead`, `Opportunity`, `Purchase Order`, `Purchase Invoice`, `Payment Entry`, `Journal Entry`, `Employee`, `Stock Reconciliation`, `Service Ticket`, `Repair Order`, `Maintenance Visit`, `Asset`, `Vehicle`, `Shipment`, `POS Closing Entry`, `Store Lease Contract`, `Store Compliance Document`, `Employee Contract Record`, `GreenLine Employee Profile`, `Administrative Expense and Renewal`, `Company Renewal Reminder` (+ `Stock Entry` solo 2, ambos cancelados).

→ Traducción: **el diseño está completo; la operación diaria aún no corre en el ERP** (sigue en Google Drive/Sheets según el Fase 2 §3.1).

## 7. Flujos operativos (estado as-is)

### F1 — Ventas y POS
- **Diseño:** `Ventas Perú → Iniciar POS` con perfil POS por tienda (almacén, listas, recibos e impresora por tienda) → `Factura de Venta` (CPE) → alimenta «Analisis Operativo por Tienda». Devoluciones **solo en la tienda de origen** (`gl_pos_same_store_returns=1`); regla declarada: «SUNAT/CPE sin cambios».
- **Estado:** 10 `POS Profile` configurados; **0 ventas transaccionales**. Los KPIs «venta de hoy / turnos abiertos / caja abierta» provienen de la tabla histórica importada, no de cierres POS reales.
- **Evidencia:** company `gl_pos_*`, POS Profiles, atajos de workspace, conteos en 0.

### F2 — Postventa (tickets, órdenes, reclamos)
- **Diseño:** `Postventa`: Ticket de Servicio → Orden de Reparación; Calidad; `Reclamo al Proveedor`. `GreenLine Perú` enlaza Ticket de Servicio desde Operación.
- **Estado:** `Service Ticket=0`, `Repair Order=0` → **modelos listos, sin uso**. No evidencié agenda de citas ni asignación a técnicos (Fase 2 §4.9 sigue pendiente en el ERP).

### F3 — Importación, aduanas y logística
- **Diseño:** `Cadena de Suministro → Centro de Operaciones de Importación`; `Portal de Proveedores` (Modelo de Fábrica, Precio Mensual, OC, Envío de Costos) y `Portal Logístico` (Cotización Logística, Hito de Embarque, Checklist Documental); `Maitrox Customs Review` (revisión aduanera).
- **Estado:** funciona como **registro histórico**: 262 embarques importados de Excel y **2 DUA confirmados** con vinculación VIN↔DUA y control de conflictos. Reportes dedicados: `VIN DUA Conflicts`, `Sold VIN Without DUA`, `Stock VIN Without DUA`, `Unmapped DUA Models`, `Historical Missing Shipment Data`.
- **Nota:** proveedores/fábricas en chino; montos en USD/RMB/PEN.

### F4 — Inventario y VIN
- **Diseño:** `Inventario y VIN → Conteo de Inventario`, `Entrada de Stock`, `Número de Serie`, `Vehículo`; «Verdad de Inventario (documentos)»; almacenes por tienda con subalmacenes de Dañado/Repuestos; POS con `validate_stock_on_save` y bloqueo de venta sin stock.
- **Estado:** estructura lista, **0 movimientos** (2 `Stock Entry` cancelados). La verdad de inventario hoy es referencial/histórica.

### F5 — Tributación y facturación electrónica
- **Diseño:** módulo propio con **interruptor global fail-closed** (nada se envía a SUNAT por defecto); configuración por empresa en «Datos Fiscales y Certificado Digital»; **producción requiere aprobación explícita del propietario**.
- **Estado:** apagado por diseño. Reportes listos: `Electronic Document Status`, `CDR Response Report`, `Tax Series Readiness`, `Tax Submission Log Report`, `Tax Readiness Report`, `Missing Tax Data Report`, `Comunicacion de Baja Monitor`.

### F6 — Clientes B2C y distribuidores
- **Diseño:** B2C en `Gestion de Clientes` (vehículos, VIN, facturas, postventa); distribuidores/mayoristas en `Gestion de Distribuidores` (fichas, pedidos, precios, despachos, estado de cuenta) con reportes `Dealer *`; **portal externo de distribuidores: fase futura gateada por el propietario**.
- **Estado:** maestros con datos (79 clientes, 22 proveedores); pedidos/estado de cuenta sin operar en ERP.

### F7 — Administración, RRHH y activos
- **Diseño:** `Centro Administrativo GreenLine`: empleados, asistencia, contratos, sueldos (referencia), alquileres de tienda, licencias (ITSE, incendio, certificados), gastos/renovaciones, cuentas de empresa, usuarios y permisos. `Gestion de Activos` con QR/etiquetas e inventarios por tienda.
- **Estado:** modelos e indicadores definidos; **perfiles de empleado en 0** (RRHH aún no se opera aquí); 60 activos y 12 cuentas importados desde el libro histórico.

### F8 — Gerencia: datos históricos y KPIs
- **Diseño:** `Centro de Gestión GreenLine` consolida ventas/utilidad/embarques/precios históricos con «Nota de Corrección» y auditoría de cambios sobre datos importados; **66 Number Cards** y **119 reportes propios** (`pos_next`).
- **Estado:** **es el módulo más vivo** — 961+ registros históricos (precios+ventas+embarques+resúmenes) + dashboards calculando. Advertencia explícita del vendor: *«no es verdad de inventario ni contable»*.

### F9 — Sistema, usuarios y seguridad
- **Diseño:** `Configuracion del Sistema` (solo admins): usuarios, permisos, login, mantenimiento. Auditoría de accesos y roles vía reportes (`User Role Audit`, `Login Identifier Audit`, `Security Risk Accounts`, `Accounts Pending Disable`).
- **Estado:** en uso (20 usuarios, 111 roles). Correos: workspace `Greenline Mail` + `Mail Settings`.

## 8. Indicadores y reportes

- **66 Number Cards** por dominio: operación diaria (18 sobre `Peru Historical Store Sales`: venta/cantidad hoy, turnos POS, caja abierta, ranking, canales), gerencia (ventas/utilidad/margen/cobertura de costo/faltantes BL-contenedor-DUA), administración (empleados, contratos, alquileres, ITSE, activos, cuentas por deshabilitar) + tarjetas ERPNext nativas.
- **308 reportes** (268 Script / 33 Query / 7 Report Builder); **119 en `pos_next`**, destacando:
  - *Control de calidad del piloto:* suite **GPFC** (26 reportes: bugs/recurrentes, mejoras votadas, regresiones por versión, resumen diario del piloto, carga datos vs capacitación vs ingeniería, feedback por módulo/país/tienda).
  - *Datos históricos:* `Historical *` (rankings, matrices año-mes, faltantes de precio/costo/embarque, anomalías de utilidad).
  - *VIN/DUA:* `VIN DUA Conflicts`, `Sold/Stock VIN Without DUA`, `GL Comparacion VIN Haylli` (comparación con Haily).
  - *POS/operación:* `Store Performance Analytics/Detail`, `Cashier Performance Report`, `Sales vs Shifts Report`, `Payments and Cash Control Report`, `Customer 360`.
  - *SUNAT:* ver F5. *RRHH/Activos:* asistencia, contratos, salarios, activos por tienda/empleado.
  - *Observabilidad:* `GL Error Health`, `Resumen Diario Monitor`, `Webhook*` (no verificado).

## 9. Hallazgos, advertencias e inconsistencias

1. **Diseño ≠ operación:** casi todo lo transaccional está en 0. El sistema está listo; la empresa opera aún fuera (Drive/Sheets). Cualquier integración debe partir de esta realidad.
2. **«No es verdad contable/inventario»:** los KPIs de gerencia y operación son **referenciales** (importados de Excel), declarado por el propio vendor en los workspaces. No usarlos como fuente contable.
3. **Alcance de tienda inconsistente** (posible bug de alta): usuario `pe_venta.comas` → `gl_scope_store=PE-HUANCAYO`; `Mary-SAN MIGUEL` → `gl_scope_store=PE-COMAS`.
4. **Cuenta deshabilitada** «R17 Verify» (proceso de verificación de prueba) aún presente.
5. **Mi cuenta sin roles** (`roles: []`): limita la exploración (403 en esquemas); pedir rol si se requiere acceso completo.
6. **Fechas de creación** de usuarios: 23/09/2026 — alta reciente, equipo en configuración.
7. **E-facturación y portal de distribuidores están "gateados por el propietario"** — no intentar habilitar sin decisión explícita de gerencia.
8. **DUA↔VIN con control de conflictos** (`unresolved_vehicle_count`, `conflict_count`): hay 1 lote de datos aduaneros de prueba/real; validar alcance con gerencia antes de tratarlo como verdad.

## 10. Guía rápida de capacitación por perfil

| Perfil | Entrar a… | Para qué |
|---|---|---|
| Dirección / gerencia | Centro de Gestión GreenLine | Ventas, utilidad, embarques, precios históricos (referenciales) |
| Gerente de tienda | Ventas Perú / Ventas POS / Analisis Operativo por Tienda | POS, precios, desempeño de su tienda |
| Administración / RRHH | Centro Administrativo GreenLine | Empleados, contratos, alquileres, licencias, activos |
| Almacén / inventario | Inventario y VIN, Cadena de Suministro | Conteos, entradas, VIN, importación |
| Postventa / servicio | Postventa, GreenLine Perú | Tickets, órdenes, reclamos a proveedor |
| Contabilidad / fiscal | Tributacion y Facturacion Electronica, Gestion Financiera | CPE (fail-closed), paneles de referencia |
| Proveedores / logística | Portal de Proveedores, Portal Logístico | Catálogos, cotizaciones, hitos de embarque |
| Sistemas | Configuracion del Sistema, Greenline Mail | Usuarios, permisos, seguridad, correo |

## 11. Anexo — Reproducibilidad (solo lectura)

```bash
# 1) Login (guarda cookie de sesión)
curl -s -c jar.txt "$ERP_URL/api/method/login" \
  -H 'Content-Type: application/json' \
  -d '{"usr":"...","pwd":"..."}'        # credenciales SOLO desde .env, nunca citadas

# 2) Lecturas (ejemplos usados)
curl -s -b jar.txt "$ERP_URL/api/resource/Item?fields=%5B%22name%22%5D&limit_page_length=1"
curl -s -b jar.txt "$ERP_URL/api/method/frappe.client.get_count?doctype=Sales%20Order"
curl -s -b jar.txt "$ERP_URL/api/resource/Workspace?fields=%5B%22name%22%2C%22label%22%2C%22module%22%2C%22parent_page%22%5D"
curl -s -b jar.txt "$ERP_URL/api/method/frappe.client.get?doctype=User&name=..."   # /api/resource/User/... también funciona
```

- El campo `content` de cada Workspace (JSON de bloques) contiene `header`/`card`/`shortcut`/`paragraph`/`number_card`/`custom_block` → es la fuente de la estructura de §4.
- Los recursos de DocType individual vienen en `.data`; los DocTypes singleton en `.message`.
- **403 ≠ existe**: verificar existencia solo con 200.

---

*Documento generado por exploración de solo lectura. Parte del insumo de «Fase C/E» de la adaptación al ERP (ver contraste en `docs/ERP_Gerencia_Contraste_Fase2.md`).*
