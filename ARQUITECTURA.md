# Arquitectura Técnica - Greenline Web ERP

Este documento describe la arquitectura de software, el flujo de datos y la organización de componentes del sistema **Greenline Web ERP**.

> **Alcance (actualizado).** Se conserva como referencia histórica del monolito
> original. Hoy la plataforma se reparte en **dos repos**:
>
> - **`greenline_erp` (este repo)** = sólo la SPA del panel (`frontend/`), desplegada en **Vercel**.
>   No contiene `backend/`, `supabase/` ni `monitoring/`.
> - **`greenline` (repo hermano)** = sitio público + `backend/` (Express/Prisma, **Render**) +
>   `supabase/` + los scripts de plataforma (`security-smoke`, `apply-audit-rls`, `sync_image`…).
>
> Ver `AGENTS.md` §0 y §4 para la estructura vigente y los comandos reales.

---

## 1. Visión General del Sistema
Greenline Web ERP es una aplicación web moderna construida como una Single Page Application (SPA) en el frontend conectada a una base de datos relacional y servicios backend gestionados en **Supabase**.

---

## 2. Estructura de Directorios

```text
greenline/
├── frontend/           # Código fuente principal de la aplicación React
│   ├── components/     # Componentes reutilizables de UI (Navbar, Footer, Modals, Cards)
│   ├── contexts/       # Contextos globales de React (AuthContext, CartContext)
│   ├── hooks/          # Custom hooks (ej. useCountdown)
│   ├── lib/            # Adaptadores, servicios y utilidades (Supabase, API, productos, imágenes)
│   ├── pages/          # Páginas principales (Home, ProductPage, LibroReclamaciones, Shops, etc.)
│   └── utils/          # Funciones auxiliares de procesamiento y redirección
├── backend/            # Lógica y scripts de soporte / backend
├── supabase/           # Migraciones SQL, esquemas, políticas RLS y semillas
├── scripts/            # Scripts Node.js de automatización (sincronización de imágenes, build, seguridad)
└── docs/               # Documentación oficial del proyecto (Sprint 1, etc.)
```

---

## 3. Capas de la Arquitectura

### A. Capa de Presentación (Frontend - React 19 + Vite)
- **Ruteo:** Gestionado mediante `react-router-dom` v7 (`src/routes.jsx`). Incluye componentes de redirección inteligente (`legacyRedirects`) para continuidad de enlaces QR físicos.
- **Estilos:** Tailwind CSS v4 para diseño responsivo y moderno.
- **Componentes Modulares:** Estructura modularizada para páginas de e-commerce, carritos, blog basado en Tiptap, y formularios de atención al cliente.

### B. Capa de Datos y Seguridad (Supabase & PostgreSQL)
- **Cliente Supabase:** Configurado en `frontend/lib/supabase.js`.
- **Row Level Security (RLS):** Políticas de seguridad a nivel de fila en PostgreSQL para restringir operaciones de escritura, actualización y lectura según los roles del usuario (`ADMIN`, `DESARROLLADOR_WEB`).
- **Esquemas relacionales:** Tablas normalizadas para gestión de productos, inventario, tiendas, testimonios y reclamaciones.

### C. Capa de Automatización y Utilidades (Node.js & Sharp)
- Procesamiento y optimización de imágenes mediante bibliotecas como `sharp`.
- Scripts de sincronización estática (`npm run sync_image`) para mantener la independencia y velocidad del sitio web frente a la base de datos.

---

## 4. Seguridad y Buenas Prácticas
- Validación estricta de variables de entorno y secretos.
- Auditorías automatizadas de políticas RLS y scripts de prueba de humo de seguridad (`security-smoke.mjs`).
- Restricción de permisos en paneles administrativos para evitar vulnerabilidades de escalamiento de privilegios.
