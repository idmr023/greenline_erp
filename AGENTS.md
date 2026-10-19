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
├── dashboard/         Dashboard Python (Flask) conectado a Google Sheets (ver §4)
│   ├── config/        fuentes.yaml — ENLACES de las hojas (cambiar URL = cambiar fuente)
│   ├── services/      sheets.py — lector de Google Sheets públicos (CSV)
│   ├── app.py         rutas Flask del dashboard
│   ├── templates/     páginas Jinja2 (index, ejemplo KPIs/Chart.js, error)
│   └── README.md      guía para crear dashboards propios sobre la base
├── docs/              documentación, sprints y propuestas del ERP
└── AGENTS.md          este documento
```

**Repo hermano:** el sitio público con la plataforma compartida (`greenline`) vive en otra carpeta y contiene:
- `backend/` — API Express 5 + Prisma 7 + PostgreSQL (despliegue en Render)
- `supabase/` — schema, migraciones SQL y políticas RLS
- `scripts/` de plataforma — security-smoke, apply-audit-rls, bench, sincronización de imágenes
- El frontend público (Home, Tienda, Mi Cuenta) y sus `docs/Sprint1/`

Los scripts de este repo cuyos datos o workflows viven en el sitio lo indican explícitamente (ver §4).

### Módulos del taller (panel + backend hermano)

Los módulos que antes vivían en Google Sheets ya están en la BD del backend hermano y se administran desde el panel:

| Módulo | Componente del panel | API (repo `greenline`) |
|---|---|---|
| Evaluación de incentivos (armadores) | `AdminEvaluaciones.jsx` | `/api/taller` (técnicos, rotaciones, criterios, evaluaciones, puntajes) |
| Registro de garantías | `AdminGarantias.jsx` | `/api/garantias` (CRUD, edición por celda, `/:id/copiar`) |
| Reporte de ensamblado | `AdminEnsamblado.jsx` | `/api/ensamblado` (CRUD + `/resumen`) |
| Préstamo de vehículos a empleados | `AdminPrestamosVehiculo.jsx` | `/api/prestamos-vehiculo` (inspección de ingreso/salida) |

Convenciones de estos módulos:
- **Filtro por mes** (`mes=YYYY-MM`) en historiales, puntajes y resúmenes; helpers en `frontend/src/utils/meses.js`.
- **Rotación de técnicos:** el técnico tiene una tienda base, pero cada registro guarda la tienda donde *ocurrió* el hecho. Los consolidados miran todas las tiendas.
- **Columnas configurables:** las condiciones evaluables son filas de `criterios_armador`; añadir una columna nueva es un INSERT, no un cambio de código.

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
| `npm run dev` | Dev server Vite del panel (sólo localhost) |
| `npm run all` | ERP (Vite `--host`) + dashboard Flask (0.0.0.0:5000) para verlo desde la red Wi-Fi con la IP LAN (`ipconfig`) |
| `npm run build` | Build de producción (`frontend/dist/`) |
| `npm run preview` | Vista previa del build servida por Vite |
| `npm run lint` | Oxlint sobre `frontend/src` + `scripts/auditar-sinks-html.mjs` (falla si hay un `innerHTML` sin `sanitizeHtml`) |
| `npm run lint:html` | Sólo la auditoría de sinks de HTML |
| `npm test` | `node --test` sobre `frontend/src/lib/*.test.js` + `frontend/src/lib/vault/*.test.js` (suite de criptografía de la bóveda, V5; sin `**`: no expande en `sh`/Node 20) |
| `npm run pdf:ceo` | Regenera `docs/Propuesta_CEO/presentacion-ceo.pdf` (requiere `npm i -D puppeteer` local) |
| `npm run emails:limpiar` | `scripts/limpiar-emails.mjs` — limpia/deduplica CSVs de `docs/emails/` |
| `npm run emails:lote` | `scripts/gen-lote-n8n.mjs` — genera la lista embebida del workflow n8n |

### dashboard/ (Python + Flask, Google Sheets)
| Comando (desde `dashboard/`) | Qué hace |
|---|---|
| `py -m venv .venv` | Crea el entorno virtual (una sola vez; Python 3.13+ vía winget) |
| `.venv\Scripts\python -m pip install -r requirements.txt` | Instala dependencias (flask, requests, pyyaml, pandas) |
| `.venv\Scripts\python app.py` | Arranca el dashboard en http://127.0.0.1:5000 |

Las fuentes de datos se editan en `dashboard/config/fuentes.yaml` (enlaces de
Google Sheets compartidos como «Cualquier persona con el enlace puede ver»).
Guía de dashboards propios: `dashboard/README.md`.

### scripts/ (o `node scripts/<archivo>` desde la raíz)
| Script | Qué hace |
|---|---|
| `scripts/gen-lote-n8n.mjs` | Lee `docs/emails/` y reescribe el nodo "Prepare Email Payloads" del workflow n8n. Ese JSON vive en el **repo hermano**: si se omite `--workflow=` se buscan `<raíz>/`, `<raíz>/../`, `<raíz>/../greenline/` y `<raíz>/../../greenline/`. Escribir fuera de este repo exige `--salida=<ruta>` (no se toca el repo hermano sin pedirlo). |
| `scripts/limpiar-emails.mjs` | Limpia/deduplica CSVs de `docs/emails/` (requiere `<entrada.csv>`) |
| `scripts/auditar-sinks-html.mjs` | Recorre `frontend/src` y falla si algún `dangerouslySetInnerHTML`, `.innerHTML =` o `insertAdjacentHTML` no pasa por `utils/sanitizeHtml` (Bóveda Segura V5 §16 / R60) |
| `scripts/generar-pdf-ceo.mjs` | Genera el PDF de `docs/Propuesta_CEO/` (necesita Chromium/Puppeteer) |

### Repo hermano `greenline` (plataforma compartida)
| Comando | Qué hace |
|---|---|
| `npm run lint` / `npm run build` | Oxlint + build del sitio |
| `npm run security-smoke` | Humo de seguridad del backend. El paso de RLS (`backend/scripts/rls-smoke.mjs`) necesita BD: si no la hay se omite y avisa. `SMOKE_RLS_STRICT=1` lo convierte en fallo. |
| `npm test` (en `backend/`) | Vitest del backend |
| `npm run rbac:check` (en `backend/`) | Paridad BD ↔ catálogo de permisos (sólo lectura; sale con 1 si falta algo) |
| `npm run smoke:taller` (en `backend/`) | Humo end-to-end de los módulos del taller contra la BD real: técnicos, rotaciones, condiciones, evaluaciones, puntaje general, garantías (alta/edición por celda/copiar) y ensamblado. Crea datos de prueba y los borra al terminar. |
| `npm run apply-audit-rls` | Audit triggers + RLS de auth |

## 5. Control de Calidad y Verificación
- Antes de proponer cambios mayores en este repo:
  - `npm run lint` — sin errores (los warnings no bloquean).
  - `npm test` — suite de criptografía de `frontend/src/lib/vault/` en verde.
  - `npm run build` (frontend del panel) — debe compilar sin errores.
  - Smoke del SPA: `npm run preview` y comprobar que `/`, `/login`, `/admin` y `/fase-2-implementacion` montan sin errores de runtime.
  - Si se toca `dashboard/`: arrancar `.venv\Scripts\python app.py` y comprobar `/` y `/api/datos/<id>` con una hoja pública.
  - Si se toca lógica que depende del backend/RLS, verificar también en el repo hermano `greenline`: `npm run lint`, `npm run security-smoke`, `npm test` (en `backend/`).
  - Si se tocan los **módulos del taller** (evaluación de incentivos, garantías, ensamblado, préstamos de vehículos): `npm run smoke:taller` (en `backend/`) — levanta el backend contra la BD real, ejercita los endpoints y borra lo que crea. Si cambia el catálogo de permisos: `npm run seed:rbac` y `npm run rbac:check` (en `backend/`), y regenerar el golden con `node scripts/regenerar-golden.mjs`.
- Mantener la concisión y la precisión técnica en las respuestas y documentación.

## 6. Despliegue
- **El panel es una SPA propia:** build `npm run build`, salida `frontend/dist/`, `noindex,nofollow` en `index.html`. Desplegada en **Vercel**.
- **Dashboard Flask:** función Python serverless en el mismo proyecto Vercel, bajo `/dash` (`api/index.py` + `requirements.txt` raíz + rewrites en `vercel.json`). El ERP lo embebe same-origin con `<iframe src="/dash/">`. En local usa `http://127.0.0.1:5000` (ver `dashboard/README.md` §8).
- **Backend (Render)** en el repo hermano; el frontend lo apunta con `VITE_API_URL` (ver `frontend/.env.example`).
- Rotar cualquier secreto que haya llegado a quedar expuesto antes de publicar.
