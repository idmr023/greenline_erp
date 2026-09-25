# Instrucciones para Agentes de IA y Desarrolladores (GreenLine ERP)

Este documento establece las directrices técnicas, convenciones y normas operativas para cualquier agente de inteligencia artificial o desarrollador que colabore en el repositorio **GreenLine ERP** (panel interno de administración).

---

## 0. Estructura del repositorio

```
greenline_erp/
├── frontend/          SPA React 19 + Vite 8 (app del panel)
│   ├── src/           components/ contexts/ lib/ pages/ utils/
│   ├── public/        favicon, PWA icons, robots.txt
│   ├── .env.example   credenciales requeridas (copiar a .env)
│   ├── package.json   dependencias y scripts del panel
│   └── vite.config.js alias '@' -> src; fs.allow para imports ?raw de docs/
├── scripts/           utilidades del ERP (ver §4)
├── docs/              documentación, sprints y propuestas del ERP
└── AGENTS.md          este documento
```

**Repo hermano:** el sitio público con la plataforma compartida (`greenline`) vive en otra carpeta y contiene:
- `backend/` — API Express 5 + Prisma 7 + PostgreSQL (despliegue en Render)
- `supabase/` — schema, migraciones SQL y políticas RLS
- `scripts/` de plataforma — security-smoke, apply-audit-rls, bench, sincronización de imágenes
- El frontend público (Home, Tienda, Mi Cuenta) y sus `docs/Sprint1/`

Los scripts de este repo cuyos datos o workflows viven en el sitio lo indican explícitamente (ver §4).

---

## 1. Convenciones de Código y Estilo
- **Frameworks y Librerías:** Respetar el stack establecido (React 19, Vite 8, Tailwind CSS v4, Supabase). No introducir librerías de terceros sin justificación explícita y verificación en `frontend/package.json`.
- **Componentes y Modularidad:** Mantener la separación de responsabilidades entre componentes de UI (`frontend/src/components/`), páginas (`frontend/src/pages/`), contextos (`frontend/src/contexts/`) y utilidades (`frontend/src/lib/` y `frontend/src/utils/`).
- **Entrada de la SPA:** `frontend/src/main.jsx` → `frontend/src/App.jsx` (router: `/`, `/login`, `/admin/*`, `/fase-2-implementacion`).
- **Nomenclatura:** Seguir el estándar existente en el proyecto (camelCase para variables/funciones, PascalCase para componentes React y archivos de páginas/componentes).

## 2. Base de Datos, Supabase y Backend
- Las consultas y mutaciones del panel se hacen a través de `frontend/src/lib/supabase.js` (Supabase JS) y `frontend/src/lib/api.js` (API REST del backend, `VITE_API_URL`).
- El schema, las migraciones y las políticas RLS viven en el **repo hermano** `greenline` (carpeta `supabase/`). Fuente única de verdad del RLS del panel: `supabase/migrations/20260914160000_unificacion_seguridad_seguridad_reportes.sql`; denegado por defecto sobre tablas de auth: `supabase/rls-auth-tablas.sql`.
- El backend (auth JWT/OTP/2FA/TOTP, blog, métricas, stock, reclamaciones) vive en `greenline/backend/`. No duplicar endpoints ni lógica de servidor en este repo.
- No exponer credenciales, claves de API o secretos en el código fuente. Los `.env` van sólo en `.gitignore` (nunca al repo); usar `.env.example` como plantilla.

## 3. Gestión de Imágenes y Assets
- El ERP no almacena el catálogo de imágenes: sirve rutas y metadatos desde la API/Supabase.
- La sincronización de assets estáticos (`npm run sync_image`) y la indexación de manuales (`npm run generate-manuales`) pertenecen al **repo del sitio público**; aquí no existen esos comandos.

## 4. Comandos

### Raíz del repo (este repo)
| Comando | Qué hace |
|---|---|
| `npm run dev` | Dev server Vite del panel |
| `npm run build` | Build de producción (`frontend/dist/`) |
| `npm run preview` | Vista previa del build servida por Vite |
| `npm run lint` | Oxlint sobre `frontend/src` |
| `npm run pdf:ceo` | Regenera `docs/Propuesta_CEO/presentacion-ceo.pdf` (requiere `npm i -D puppeteer` local) |
| `npm run emails:limpiar` | `scripts/limpiar-emails.mjs` — limpia/deduplica CSVs de `docs/emails/` |
| `npm run emails:lote` | `scripts/gen-lote-n8n.mjs` — genera la lista embebida del workflow n8n |

### scripts/ (o `node scripts/<archivo>` desde la raíz)
| Script | Qué hace |
|---|---|
| `scripts/gen-lote-n8n.mjs` | Lee `docs/emails/` y reescribe el nodo "Prepare Email Payloads" del workflow n8n. Ese JSON vive en el **repo hermano**: si se omite `--workflow=` se buscan `<raíz>/`, `<raíz>/../`, `<raíz>/../greenline/` y `<raíz>/../../greenline/`. Escribir fuera de este repo exige `--salida=<ruta>` (no se toca el repo hermano sin pedirlo). |
| `scripts/limpiar-emails.mjs` | Limpia/deduplica CSVs de `docs/emails/` (requiere `<entrada.csv>`) |
| `scripts/generar-pdf-ceo.mjs` | Genera el PDF de `docs/Propuesta_CEO/` (necesita Chromium/Puppeteer) |

### Repo hermano `greenline` (plataforma compartida)
| Comando | Qué hace |
|---|---|
| `npm run lint` / `npm run build` | Oxlint + build del sitio |
| `npm run security-smoke` | Humo de seguridad del backend (sin BD) |
| `npm test` (en `backend/`) | Vitest del backend |
| `npm run apply-audit-rls` | Audit triggers + RLS de auth |

## 5. Control de Calidad y Verificación
- Antes de proponer cambios mayores en este repo:
  - `npm run lint` — sin errores (los warnings no bloquean).
  - `npm run build` (frontend del panel) — debe compilar sin errores.
  - Smoke del SPA: `npm run preview` y comprobar que `/`, `/login`, `/admin` y `/fase-2-implementacion` montan sin errores de runtime.
  - Si se toca lógica que depende del backend/RLS, verificar también en el repo hermano `greenline`: `npm run lint`, `npm run security-smoke`, `npm test` (en `backend/`).
- Mantener la concisión y la precisión técnica en las respuestas y documentación.

## 6. Despliegue
- **El panel es una SPA propia:** build `npm run build`, salida `frontend/dist/`, `noindex,nofollow` en `index.html`.
- **Backend (Render)** en el repo hermano; el frontend lo apunta con `VITE_API_URL` (ver `frontend/.env.example`).
- El hosting definitivo del ERP está por definir; en local se sirve con `npm run dev`.
- Rotar cualquier secreto que haya llegado a quedar expuesto antes de publicar.
