**# Roadmap ERP Total — Funciones a implementar**

\> ****Fecha:**** 25/09/2026 · ****Premisa:**** ****un solo sistema total**** = ERP de gerencia (Frappe/\`pos_next\`) + web GreenLine (React/Supabase) + la integración entre ambos. **Todo elemento migrado al nuevo sistema debe adaptarse por completo a la arquitectura de Frappe o ser convertido bajo sus líneas; no se aceptan adaptaciones parciales ni soluciones híbridas.

- Actualmente el sistema de Greenline se divide en Drives, Excells, documentos de Word, el sistema Hailey para tiendas y logística, un sistema con subscripción por un año para temas de gestión, una web moderna montada sobre un sistema no funcional, un ERP creado por el desarrollador web en fase inicial y un ERP avanzado pero con falta de funcionaliades por parte de gerencia, mi idea para darle vida a esta fase es la siguiente:

1\. Darle mantenimiento a la web y lo que se requiera. Con apoyo de gerencia verificar si la página se puede montar sobre el servidor propio de Greenline para ahorrar costos y tener todo centralizado. Gerencia puede transferir el dominio.

2\. Reuniones con gerencia, levantamiento de información del ERP que están construyendo para saber que puedo implementar o adoptar yo.

3\. Inicia la fase de capacitación a tiendas, almacen y oficina en ese orden. Mientras que se va capacitando se van haciendo nuevas funcionalidades e implementando. Para los usuarios de este servicio lo único que cambiará será la interfaz (para algunos, dependiendo del rol pueden no haber ningún cambio)

**### 🏷️ Convención de prioridades

| Prioridad | Significado |
|---|---|
| 🔴 P0 | Bloqueante / imprescindible para avanzar |
| 🟠 P1 | Alta prioridad / operación e integración |
| 🟡 P2 | Evolución funcional |
| 🟢 P3 | Optimización, medición y cierre del legado |
| 🔒 Gate | Requiere aprobación o decisión previa |

---

## 🧩 0. Qué ya tenemos implementado**

| Pilar | Ya construido |

|---|---|

| ERP nuevo | 52 workspaces, 111 roles, maestros (items/tiendas/almacenes/clientes/proveedores), 10 POS Profile, datos históricos (precios/ventas/embarques/DUA), 66 KPIs, 308 reportes, suite GPFC, módulo SUNAT ****fail-closed****, auditoría nativa |

| Web GreenLine | Auth OTP/2FA/reset + RBAC granular, auditoría con stats, stock con aprobaciones (modelo), checkout con correos, ****reclamaciones (Libro + panel + correos)****, blog/CMS/imagen (*\*conversión total a Frappe requerida\**), contacto/testimonios, distribuidores (*\*conversión total a Frappe requerida\**), email marketing n8n (tanda 2 lista), 13 pantallas admin, docs de exploración/capacitación |

| Adaptación (§0 Fase 2) | Acceso ✅ · Documentación/capacitación lista 🟡 · Verificación y propuesta de cambios ⬜ (este doc la concreta) |

---

**## 🧱 FASE 0 — Cimientos y decisiones

> Prioridad: P0 · Bloquea todo**

- Respuestas referente a las preguntas hechas hacia gerencia para tener una idea y contexto mayor.

- Levantamiento de características del proyecto, tecnologías usadas y buscar la forma de implementar lo que ya estaba en el ERP Greenline en este ERP creado por gerencia o en su defecto investigar que le falta al nuevo sistema para añadirlo.

- | ****Matrices del levantamiento §3.1 validadas**** | Áreas/responsables/tiendas/usuarios · roles y permisos · catálogo de estados (pedidos, stock, reclamaciones, citas) · mapa de procesos actual→objetivo · inventario de integraciones/canales | Requisito explícito del Fase 2 §3.1; parte ya aportada por la exploración |

- Definir si este ERP va a ser un reemplazo del Hailey actual y además tendrá todas las funciones que se han requerido o han faltado.

- En el GlPago hay correos de paga que permiten enviar correos directamente a bandeja, esos correos nos ayudarían a hacer Mail Marketing. Además de utilizarlo en los envíos que tenemos actualmente de pedidos, reclamos, contacto.

| ****R0.4**** | ****Plan de capacitación en ejecución**** | Más detalle en \`ERP_Gerencia_Exploracion_y_Flujos.md\`

**## ⚙️ FASE 1 — Iniciar la operación en el ERP

> Prioridad: P0–P1 · Adopción**

| ID | Función | Contenido | Dependencias |

|---|---|---|---|

| ****R1.1**** | ****Usuarios y roles operativos**** | Asignar roles del personal roles \`GL-\*\` + \`gl_scope_\*\` correctos; corregir inconsistencias detectadas (tienda mal asignada en 2 cuentas, cuenta de prueba «R17 Verify»); rol para cuentas de trabajo | R0.1 |

| ****R1.2**** | ****Catálogo único de productos**** | De los 231 \`Item\` que hay en la BD del ERP, identificar los 31 son productos web; mapear colores → variantes/atributos; precios en \`Item Price\` (lista «Venta estándar»); definir quién edita desde dónde. Definir si en la tienda también se venderán repuestos y considerar que un técnico especializado tiene que implementarlos | R0.1 |

| ****R1.3**** | ****Inventario operativo**** | Movimientos/kardex por tienda + subalmacenes (Dañado/Repuestos); conteos físicos iniciales; ****verificar/crear aprobaciones de stock entre tiendas**** (pendiente A3.1); reglas de transferencia/devolución/pérdida (§4.4) | R1.2, R0.1 (C2) |

| ****R1.4**** | ****POS en producción**** | Abrir cajas por tienda (ya hay 10 perfiles), cierres (\`POS Closing Entry\`), devoluciones solo en tienda de origen, recibos \`GL PE Recibo 58mm\`; los KPIs «venta de hoy/turnos» pasan de histórico a tiempo real | R1.3, R1.1 |

| ****R1.5**** | ****Postventa en el ERP**** | Activar \`Service Ticket\` / \`Orden de Reparación\` / \`Reclamo al Proveedor\` (modelos en 0) como flujo real | R1.1 |

| ****R1.6**** | ****Datos históricos validados**** | Confirmar con gerencia que embarques/DUA/precios/ventas son «referenciales, no contables» (o corregir); mantener el disclaimer visible | R0.1 |

**## 🔗 FASE 2 — Convergencia Web ↔ ERP

> Prioridad: P1 · Primeras integraciones**

| ID | Función | Contenido | Dependencias |

|---|---|---|---|

| ****R2.1**** | ****Pedidos web → ERP**** | Checkout \`POST /api/pedidos\` → \`Sales Order\` vía adaptador; espejo local + reintentos; mapeo de estados §4.5 ↔ estados Frappe (Draft/Submitted/Cancelled); correos transaccionales con SMTP | R0.2, R1.2 |

| ****R2.2**** | ****Maestros como fuente de verdad**** | El front web ****lee**** items/precios/tiendas del ERP (API o sync programada); se apaga la edición duplicada en el panel web | R1.2, R0.1 |

| ****R2.5**** | ****Identidades mapeadas**** | Tabla de correspondencia roles web ↔ roles \`GL-\*\`; personal que opera tienda/ERP = cuentas ERP; marketing/contenido = cuentas web; definir si el admin web deja de tener usuarios propios o sigue separado (C7) | R0.1, R1.1 |

| ****R2.6**** | ****Blog y Distribuidores: conversión total**** | Migración de los módulos de blog y gestión de distribuidores hacia la arquitectura de Frappe. Edición y gestión centralizada desde el sistema total. | R2.2 |

**## 🚀 FASE 3 — Funciones nuevas del sistema total

> Prioridad: P1–P2 · Capacidades nuevas**

| ID | Función | Contenido | Dependencias |

|---|---|---|---|

| ****R3.1**** | ****Citas de servicio técnico**** | Modelo completo §10: tabla/DocType de citas, estados (SOLICITADA→…→ATENDIDA), formulario público, vista central, auditoría de cambios, notificaciones de solicitud/confirmación; catálogo de tiendas desde el ERP; capacidad 2 técnicos/sucursal, 6 vehículos/día, procedimiento de reprogramación por ausencia; ****sede a decidir en R0.1**** (Supabase §10 vs DocType \`pos_next\`) | R0.1, R2.2 (catálogo tiendas), R0.2 |

| ****R3.2**** | ****Notificaciones del sistema**** | Bandeja/topbar con unread/read (§4.7): stock bajo, movimientos pendientes de aprobación, reclamaciones nuevas, garantías por vencer, pedidos con problemas, confirmaciones de cita; R0.2, R3.1 parcial |

| ****R3.3**** | ****Cálculo de comisiones**** | Reemplazar Google Drive: reglas por sucursal, cálculo automático, trazabilidad, revisión y pago; datos de ventas desde el ERP | R1.4 (ventas reales en ERP) |

| ****R3.4**** | ****Comunidad y fidelización**** | §4.8/2.5: consentimiento explícito/revocable, segmentos, campañas de bienvenida/postcompra/aniversario, referidos, eventos, métricas de conversión; conecta con n8n (R2.4) y con reclamaciones/citas | R2.4 |

| ****R3.5**** | ****Identidad de cliente + QR (§4.2)**** | Registro/login de cliente final, correo con alias individual, activación por correo (sin compartir contraseñas), QR revocable/rotable con vínculo de dispositivo; primero para el web, evaluar si el ERP lo adopta | R0.1, R3.4 |

| ****R3.6**** | ****Facturación electrónica real (gateada)**** | Pendiente de aprobación de gerencia para implementar, probar en serie limitada, monitorear \`Electronic Document Status\`/\`CDR Response\`; mantener fail-closed hasta entonces | R0.1 (gate), R1.4 |

| ****R3.7**** | ****Portal externo de distribuidores (gateada)**** | Solo con visto bueno del propietario (hoy explícitamente «fase futura» en el ERP): acceso de distribuidores a precios/pedidos/estado de cuenta | R0.1 (gate), R2.1 |

**## 📊 FASE 4 — Excelencia, medición y cierre del legado

> Prioridad: P3 · Optimización y cierre**

| ID | Función | Contenido | Dependencias |

|---|---|---|---|

| ****R4.1**** | ****Dashboards unificados por dominio**** | Negocio/gerencia = workspaces ERP (ya están); web analítica + reclamaciones + citas = nuestro admin; regla: ****no duplicar KPIs de ventas**** (C10) | R2.1, R3.1 |

- Conexión con la página de DUA

| ****R4.3**** | ****Observabilidad total**** | Healthcheck + métricas + alertas de nuestros servicios; en el ERP usar \`GL Error Health\`/monitores ya existentes; estado del adaptador (R0.2) visible | R0.2 |

| ****R4.4**** | ****UX del panel (§2.7/§4.13)**** | Tablas operativas, confirmaciones de alto impacto, feedback de carga/éxito/error, limpieza visual del admin interno | paralelo |

| ****R4.5**** | ****Fin del Google Drive/Sheets**** | Migrar todo registro manual restante (comisiones R3.3, cualquier hoja operativa que surviva) y ****apagar los duplicados****: no convivir dos verdades | R1.x, R3.3 |

| ****R4.6**** | ****Informes de gestión**** | Informe mensual planificado vs ejecutado e informe anual consolidado (§3.1) generados desde los datos unificados | R4.1, R4.5 |

---

**## 🗺️ Resumen de dependencias**

\`\`\`

R0.1 decisiones ─┬─> FASE 1 (operación ERP) ──> FASE 2 (convergencia) ──> FASE 3 (citas/notif/comisiones/comunidad)

R0.2 adaptador ──┘                                    │

R0.3 matrices ───┘                                    └─> FASE 4 (dashboards, DUA, fin del legado)

R0.4 capacitación (paralelo continuo)

Paralelos de bajo riesgo: R2.3 reclamaciones (deploy), R2.4 email marketing (n8n)

Gated por propietario: R3.6 SUNAT · R3.7 portal distribuidores

\`\`\`

---

## 🏁 Estado objetivo

> **Un solo sistema total:** ERP de gerencia + Web GreenLine + integraciones, con una única fuente de verdad, procesos trazables, operación centralizada y cierre progresivo de los sistemas heredados.

### Principios rectores

- 🧠 Una única fuente de verdad.
- 🔐 Seguridad y permisos por rol.
- 🔎 Trazabilidad y auditoría.
- 🔄 Integraciones con reintentos y estados controlados.
- 📈 Datos unificados para gestión y medición.
- 🧩 Funcionalidades adaptadas completamente a la arquitectura de Frappe.
- 🧹 Eliminación progresiva de duplicidades y herramientas heredadas.