# Base de Conocimiento — GreenLine Web ERP

> **Documento de referencia para agentes de IA y desarrolladores.**
> Última actualización: Septiembre 2026.

---

## 1. Visión General

**GreenLine** es una empresa peruana de **movilidad eléctrica** que vende scooters, motos, trimotos, cargueros y cuatrimotos eléctricos. Opera con tiendas físicas en Lima (Lince, Surco), Huancayo y un almacén central, más una red de distribuidores a nivel nacional.

La plataforma **GreenLine Web ERP** es el sistema integral que gestiona:
- Catálogo de productos y e-commerce (sin pasarela de pago — pedidos vía WhatsApp)
- Inventario multi-tienda con flujo de aprobaciones
- Blog y contenido
- Libro de Reclamaciones (obligatorio Ley N° 29571)
- Panel administrativo con RBAC (9 roles)
- Gestión de distribuidores

---

## 2. Stack Tecnológico

```
┌─────────────────────────────────────────────────────┐
│                    FRONTEND                          │
│  React 19 · Vite 8 · Tailwind CSS v4               │
│  react-router-dom v7 · Tiptap (blog editor)         │
│  Leaflet (mapas) · FontAwesome · pdfjs-dist          │
├─────────────────────────────────────────────────────┤
│                    BACKEND                           │
│  Node.js · Express · Prisma ORM                     │
│  BullMQ + Redis (cola de emails)                    │
│  Zod (validación) · JWT (auth) · Argon2 (hashing)   │
├─────────────────────────────────────────────────────┤
│                   BASE DE DATOS                      │
│  Supabase (PostgreSQL) · Row Level Security (RLS)   │
├─────────────────────────────────────────────────────┤
│                 INFRAESTRUCTURA                      │
│  Render (backend + cron keepalive)                  │
│  Supabase (BD + Auth + Storage)                     │
│  Dominio: glperu.com                                │
└─────────────────────────────────────────────────────┘
```

---

## 3. Arquitectura del Sistema

### 3.1 Capas

| Capa | Tecnología | Responsabilidad |
|------|-----------|-----------------|
| **Presentación** | React 19 + Vite + Tailwind | SPA responsiva, ruteo dinámico |
| **Lógica de Negocio** | Frontend contexts + hooks | Carrito, auth, countdown, utilidades |
| **Acceso a Datos** | `frontend/lib/*.js` | Adaptadores Supabase, caché en memoria |
| **API Backend** | Express + Prisma | Auth, pedidos, stock, auditoría, blog |
| **Persistencia** | PostgreSQL (Supabase) | RLS, funciones SQL, vistas materializadas |
| **Cola de Trabajo** | BullMQ + Redis | Envío de emails asíncrono |

### 3.2 Estructura de Directorios

```
greenline/
├── frontend/              # React SPA
│   ├── components/        # UI reutilizable (Navbar, Footer, Modals)
│   ├── contexts/          # AuthContext, CartContext
│   ├── hooks/             # useCountdown, etc.
│   ├── lib/               # Adaptadores Supabase, utilidades
│   ├── pages/             # Páginas (Home, Shop, ProductPage, etc.)
│   └── utils/qr/          # Redirecciones QR de WordPress
├── backend/               # Express API
│   ├── src/routes/        # Endpoints REST
│   ├── src/services/      # Lógica de negocio (stock, email)
│   └── prisma/            # Schema Prisma, migraciones
├── supabase/              # SQL migrations, schema, seed
├── scripts/               # Automatización (sync_image, build, security)
└── docs/                  # Documentación del proyecto
```

### 3.3 Flujo de Datos

```
Usuario → React SPA → Supabase (lectura directa)
                   ↘ Backend Express → Prisma → Supabase
                   ↘ BullMQ → Redis → Worker → SMTP
```

- **Lecturas de productos/tiendas:** Directas desde Supabase (sin backend)
- **Escrituras (pedidos, stock, auth):** Vía Backend Express
- **Emails:** Cola BullMQ → worker asíncrono

---

## 4. Lógica de Negocio

### 4.1 Catálogo de Productos

| Categoría | Descripción |
|-----------|-------------|
| **VMP** | Vehículos de Movilidad Personal (scooters, bicicletas eléctricas) |
| **Motos Eléctricas** | Motocicletas eléctricas con/placa |
| **Trimotos Eléctricas** | Triciclos eléctricos (carga/pasajeros) |
| **Cargueros** | Vehículos de carga eléctrica |
| **Cuatrimotos** | Quads eléctricos |

**Propiedades por producto:**
- Nombre, slug, descripción, precios (original/actual), categoría
- Colores (variantes con stock individual)
- Imágenes (por color, con versionado para caché)
- Ficha técnica (motor, batería, autonomía, dimensiones, etc.)
- Info adicional (JSONB)
- Manuales PDF descargables
- Videos YouTube
- Etiquetas, destacado, disponibilidad

**Reglas de precios:**
- Descuento calculado: `-(1 - precio_actual / precio_original) * 100`
- Badge visual de descuento en tarjetas
- Productos sin precio muestran "Consultar"

### 4.2 Carrito de Compras

- Persiste en `localStorage` (clave: `greenline_cart_v1`)
- Items identificados por `slug:color`
- Cantidad mínima 1, sin decimales
- Mismo producto + mismo color = incrementa cantidad (no duplica)
- Cantidad disponible = 999 (sin límite de stock en UI actual)
- Se limpia tras confirmar pedido

### 4.3 Pedidos (Checkout)

```
Carrito → Formulario de datos → Confirmación → WhatsApp
```

**Flujo:**
1. Cliente llena datos (nombre, DNI, teléfono, email, dirección)
2. Se genera código `GL-<timestamp_base36><random>`
3. Se guarda en Supabase tabla `pedidos`
4. Se envía email de notificación al equipo
5. Se muestra resumen + botón de WhatsApp para confirmación

**Sin pasarela de pago:** El equipo contacta al cliente por WhatsApp para coordinar pago y entrega.

**Validaciones:**
- Nombre: solo letras, mín. 2 caracteres
- DNI: exactamente 8 dígitos
- Teléfono: exactamente 9 dígitos
- Email: debe contener @
- Dirección: mín. 5 caracteres

### 4.4 Usuarios y Roles

| Rol | Nivel | Permisos |
|-----|-------|----------|
| `ADMIN` | SUPER | Acceso total |
| `DESARROLLADOR_WEB` | SUPER | Acceso total + config técnica |
| `EDITORA_BLOG` | CONTENIDO | Gestión de blog |
| `DISTRIBUCION` | CONTENIDO | Gestión de distribuidores |
| `GERENTE_TIENDA` | TIENDA | Stock y ventas de su tienda |
| `COLABORADOR_TIENDA` | TIENDA | Operaciones de su tienda |
| `GERENTE_ALMACEN` | ALMACEN | Stock del almacén central |
| `COLABORADOR_ALMACEN` | ALMACEN | Operaciones del almacén |
| `CLIENTE` | CLIENTE_N | Compras, pedidos, reclamaciones |

**Autenticación:**
- JWT access + refresh tokens
- Clientes: OTP por email
- Staff: Código de puerta + 2FA (TOTP)
- Sesión en `sessionStorage` (se cierra al cerrar pestaña)

### 4.5 Inventario (Stock)

```
┌─────────────┐    ┌──────────────┐    ┌─────────────┐
│  Ingreso    │ →  │  prod_color  │ ←  │  Egreso     │
│  (compra)   │    │  _rel.stock  │    │  (venta)    │
└─────────────┘    └──────────────┘    └─────────────┘
                          ↑
                   ┌──────┴──────┐
                   │Transferencia│
                   │  (entre     │
                   │  tiendas)   │
                   └─────────────┘
```

**Tabla `prod_color_rel`:** Stock total por producto+color (la web lee esto)
**Tabla `prod_color_stock`:** Stock por ubicación (futura, diseñada pero no implementada)
**Trigger `sync_stock_total`:** Recalcula el total = suma de ubicaciones

**Tipos de movimiento:** INGRESO, EGRESO, TRANSFERENCIA, AJUSTE
**Estados:** PENDIENTE, APROBADO, RECHAZADO

### 4.6 Tiendas y Distribuidores

**Tiendas físicas (seed actual):**
- Almacen Central (tipo: almacen)
- GreenLine Tienda Lince (tipo: tienda)
- GreenLine Tienda Surco (tipo: tienda)
- GreenLine Tienda Huancayo (tipo: tienda)

**Propiedades de tienda:** nombre, dirección, ciudad, tipo, activa
**Propiedades de distribuidor:** nombre, RUC, contacto, teléfono, WhatsApp, prioridad, servicio técnico

### 4.7 Blog (Novedades)

- Migrado desde WordPress (campo `wordpress_post_id`)
- Categorías dinámicas extraídas de los posts
- Post destacado como hero
- Búsqueda client-side (título, extracto, categoría, tags)
- Imágenes en WebP (conversión vía Sharp)
- Editor Tiptap en el panel admin

### 4.8 Libro de Reclamaciones

**Obligatorio por Ley N° 29571 y D.S. N° 011-2011-PCM.**

Flujo:
1. Cliente llena formulario (datos personales, producto, detalle)
2. Backend escribe en Google Sheets (auditoría legal)
3. Backend crea registro en Prisma
4. Backend envía email a RRHH y confirmación al cliente
5. Número secuencial asignado por el servidor

**Tipos:** QUEJA (servicio) / RECLAMO (producto/servicio)
**Honeypot:** Campo oculto `empresa` para detectar bots

### 4.9 Redirecciones QR y Legado

**Problema:** WordPress dejó URLs impresas en códigos QR físicos (productos, tiendas, etc.)

**Solución implementada:**
1. `frontend/utils/qr/redirection-export.json` — 100+ redirecciones exportadas de WordPress
2. `frontend/lib/legacyRedirects.js` — Resolución síncrona de rutas viejas → nuevas
3. `src/routes.jsx` — Router con `legacyRedirects` para SPA routing

**Ejemplo:**
```
QR escaneado: glperu.com/tienda/bicicleta-electrica-fl1
                ↓
legacyRedirects.js resuelve: /producto/bicicleta-elctrica-plegable-fl2
                ↓
React Router renderiza: ProductPage.jsx
```

---

## 5. Modelo de Datos (Supabase)

### Tablas Principales

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  categorias  │←────│  productos   │────→│    imagenes  │
└──────────────┘     └──────┬───────┘     └──────────────┘
                            │
                     ┌──────┴───────┐
                     │prod_color_rel│←──── colores
                     └──────┬───────┘
                            │
                     ┌──────┴───────┐
                     │ficha_tecnica │
                     └──────────────┘

┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   tiendas    │←────│     users    │────→│cliente_profiles│
└──────────────┘     └──────┬───────┘     └──────────────┘
                            │
                     ┌──────┴───────┐
                     │stock_moves   │
                     └──────────────┘

┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ greenline_   │     │  pedidos     │     │  otp_codes   │
│ _stores      │     └──────────────┘     └──────────────┘
├──────────────┤
│ greenline_   │     ┌──────────────┐
│ _distributors│     │refresh_tokens│
└──────────────┘     └──────────────┘
```

### Vistas SQL Importantes

| Vista | Propósito |
|-------|-----------|
| `vista_productos_web` | Productos con imágenes, colores y ficha técnica pre-armados |
| `greenline_posts_public` | Posts del blog para el frontend |
| `greenline_stores` | Tiendas con coordenadas y contacto |
| `greenline_distributors` | Distribuidores autorizados |

---

## 6. Infraestructura y Deployment

### 6.1 Render (Backend)

- **Servicio web:** `greenline-backend` (Node.js)
- **Cron keepalive:** `greenline-keepalive` (evita sleep en free tier)
- **Plan actual:** Free (con limitaciones de cold start)
- **Puerto:** 10000
- **Health check:** `/health`

### 6.2 Supabase

- **Base de datos:** PostgreSQL con RLS
- **Auth:** JWT + OTP + 2FA
- **Storage:** Imágenes de blog y assets
- **RLS:** Políticas por rol (es_admin_panel, etc.)

### 6.3 Variables de Entorno Críticas

| Variable | Uso |
|----------|-----|
| `VITE_SUPABASE_URL` | URL de Supabase (frontend) |
| `VITE_SUPABASE_ANON_KEY` | Key anónima de Supabase |
| `DATABASE_URL` | Conexión Prisma (backend) |
| `JWT_SECRET` | Secretos JWT |
| `REDIS_URL` | Cola BullMQ |
| `SMTP_USER/PASS` | Envío de emails |

---

## 7. Comandos Importantes

```bash
# Desarrollo
npm run dev                  # Frontend + backend en paralelo
npm run dev:frontend         # Solo frontend
npm run dev:backend          # Solo backend

# Build y QA
npm run build                # Build de producción
npm run lint                 # Oxlint (análisis estático)
npm run security-smoke       # Pruebas de seguridad

# Imágenes
npm run sync_image           # Sincronizar imágenes locales → Supabase Storage
npm run sync_clean           # Limpiar imágenes huérfanas

# Otros
npm run bench 50             # Benchmark de rendimiento
npm run sonar:report         # Reporte de SonarQube
```

---

## 8. Problemas Conocidos

| # | Problema | Prioridad | Estado |
|---|----------|-----------|--------|
| 1 | RLS de `ficha_tecnica` impide guardar | Alta | Pendiente |
| 2 | Seguridad Supabase fragmentada (3 fuentes) | Alta | Pendiente |
| 3 | Stock limitado a 100 movimientos en cálculo | Alta | Pendiente |
| 4 | Catálogo descarga todos los productos | Alta | Pendiente |
| 5 | Blog descarga contenido de más | Media | Pendiente |
| 6 | Scripts SQL apuntan a archivos inexistentes | Media | Pendiente |
| 7 | `seed.sql` contiene usuarios de prueba | Media | Pendiente |
| 8 | Cache de imágenes en `0` (no aprovecha CDN) | Media | Pendiente |
| 9 | Confeti se ejecuta en cada navegación | Baja | Pendiente |
| 10 | `source_tags` inexistente puede romper blog | Media | Pendiente |

---

## 9. Normas para Agentes de IA

### Hacer
- Respetar el stack (React 19, Vite, Tailwind v4, Supabase)
- Usar `frontend/lib/*.js` para acceso a datos
- Mantener RLS habilitado siempre
- Ejecutar `npm run lint` y `npm run build` antes de commitear
- Seguir nomenclatura: camelCase (variables), PascalCase (componentes)

### No Hacer
- Introducir librerías sin justificación
- Exponer credenciales en código
- Desactivar RLS como solución
- Modificar `supabase/schema.sql` sin crear migración
- Hacer fetch de productos completos cuando solo se necesita uno

### Convenciones
- Componentes en `frontend/components/`
- Páginas en `frontend/pages/`
- Hooks en `frontend/hooks/`
- Utilidades en `frontend/lib/`
- Scripts en `scripts/`
