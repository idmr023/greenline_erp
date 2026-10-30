# Instrucciones para GitHub Copilot — Greenline ERP (panel interno)

> Archivo de configuración de comportamiento. Aplica a todo el workspace salvo que exista un
> `copilot-instructions.md` más específico en un subdirectorio.

---

## 1. Estilo de respuesta (ESTRICTO — prioridad máxima)

Estas reglas mandan sobre cualquier otra instrucción del repositorio. Aplícate siempre.

- **Code only, no explanation.** Entrega el código o el resultado. Cero párrafos explicativos,
  cero preámbulos ("Aquí tienes…", "Hecho…", "Claro…"), cero resúmenes finales.
- **Bullets over paragraphs.** Usa listas con viñetas. Un concepto = un bullet.
- **No explanations unless asked.** Si el usuario no pregunta explícitamente ("¿por qué?",
  "explica", "analiza", "justifica"), NO expliques. Si dudas entre explicar y callar, **calla**.
- **No inventar.** No inventes APIs, nombres de archivo, funciones, props, endpoints, variables de
  entorno o reglas de negocio que no hayas verificado en el código. Si no estás seguro, dilo en una
  línea o lee el archivo.
- **No pedir permiso de forma redundante.** Si la tarea está clara, ejecútala. Sólo pregunta cuando
  la respuesta cambie el resultado de forma irreversible.
- **Sin preámbulo ni epílogo.** Tu primera línea es el código, el comando o el bullet. Tu última
  línea es también contenido, no un "¡Listo!" ni un "Espero que te sirva".
- **Respuestas cortas.** Default: ≤ 10 líneas. Si el usuario pide detalle, entonces sí.
- **Un mensaje por tarea.** No te fragmentes en varios mensajes con "voy a hacer X... ahora Y...".
- **Idioma:** español, salvo que el usuario escriba en otro idioma o pida inglés.
- **Formato:** bloques de código con el lenguaje correcto. Bullets con `-`. Tablas sólo para
  comparar 3+ elementos.

### Qué NO hacer

| No | Sí |
|---|---|
| Explicar un cambio que ya es evidente en el diff | El diff, y listo |
| Describir lo que hace el código existente | Sólo el código nuevo/modificado |
| "Seré conciso" y luego escribir 5 párrafos | Escribir 5 bullets |
| Inventar tests o archivos para "completar" la tarea | Implementar lo pedido |
| Refactorizar de más | Diff mínimo y quirúrgico |
| Repetir la pregunta del usuario | Responderla |
| Añadir emojis, iconos decorativos o texto motivacional | Nada de eso |
| Comentarios dentro del código | Salvo que el usuario los pida o que el código existente ya los use |

### Comentarios en el código

- **No añadas comentarios** explicativos en el código salvo que el usuario los pida.
- Si el código circundante ya está comentado, mantén el estilo y el idioma (es-AR) existentes.
- Prefiere los nombres autoexplicativos a los comentarios.
- Un comentario, si es imprescindible, explica **por qué**, no **qué**.

---

## 2. Contexto técnico

### Qué es este repo

Panel interno de administración de Greenline (ERP):

```
greenline_erp/
├── frontend/          SPA React 19 + Vite 8 (el panel)
│   ├── src/components/ UI
│   ├── src/pages/      páginas
│   ├── src/lib/        utilidades (incluye vault/ — bóveda V5)
│   ├── src/utils/      helpers (sanitizeHtml, meses.js…)
│   ├── src/contexts/   contextos de auth/permisos
│   ├── public/         favicon, PWA icons, robots.txt
│   └── vite.config.js  alias '@' → src
├── api/                función serverless Vercel (dashboard Flask bajo /dash)
├── dashboard/          Dashboard Python (Flask) sobre Google Sheets
│   ├── config/         fuentes.yaml — enlaces de las hojas
│   ├── services/       sheets.py — lector CSV de hojas públicas
│   ├── templates/      Jinja2
│   └── app.py          rutas Flask
├── docs/               documentación, sprints, propuestas CEO, emails
├── scripts/            utilidades del ERP
├── vercel.json         rewrites (/dash → api/index.py)
└── requirements.txt    deps del dashboard (raíz, para Vercel)
```

**Repo hermano (sitio público + backend):** `C:/Users/Marketing/greenline` — ahí vive el backend
(Express 5 + Prisma + PostgreSQL), el schema, las migraciones y las políticas RLS de Supabase.

- Este repo **no** duplica endpoints ni lógica de servidor: consume la API vía
  `frontend/src/lib/api.js` (`VITE_API_URL`).
- Este repo **no** tiene comandos de `sync_image` ni de `generate-manuales`: son del hermano.
- Los scripts de este repo que tocan el repo hermano (p. ej. `scripts/gen-lote-n8n.mjs` que
  reescribe el workflow n8n) **exigen `--salida=<ruta>`** para escribir fuera de este repo.
  No modifiques el repo hermano sin que te lo pidan.

### Stack (no cambiar sin justificación explícita + verificar en `frontend/package.json`)

- React 19, Vite 8, Tailwind CSS v4, Supabase JS, WebAuthn (`@simplewebauthn/browser`)
- Dashboard: Python 3.13+, Flask, requests, pyyaml, pandas
- Tests: `node --test` sobre `frontend/src/lib/*.test.js` y `frontend/src/lib/vault/*.test.js`
- Lint: Oxlint sobre `frontend/src` + `scripts/auditar-sinks-html.mjs`

No introduzcas librerías de terceros sin:
1. Justificación explícita.
2. Verificar que no está ya en `frontend/package.json`.
3. `npm audit --omit=dev --audit-level=high` en verde (es quality gate de CI).

### Convenciones

- **camelCase** para variables y funciones; **PascalCase** para componentes React y archivos de
  páginas/componentes. Existing style wins.
- **Separación de responsabilidades:** UI en `frontend/src/components/`, páginas en
  `frontend/src/pages/`, contextos en `frontend/src/contexts/`, utilidades en `frontend/src/lib/`
  y `frontend/src/utils/`.
- **Entrada de la SPA:** `frontend/src/main.jsx` → `frontend/src/App.jsx`
  (router: `/`, `/login`, `/admin/*`, `/fase-2-implementacion`).
- **Consultas y mutaciones** siempre vía `frontend/src/lib/supabase.js` (Supabase JS) o
  `frontend/src/lib/api.js` (REST del backend). Nunca `fetch` directo a Supabase ni SQL inline.
- **Filtro por mes** (`mes=YYYY-MM`) en historiales, puntajes y resúmenes. Helper:
  `frontend/src/utils/meses.js`.
- **Módulos del taller** (incentivos, garantías, ensamblado, préstamos de vehículos): las
  condiciones evaluables son **filas** de `criterios_armador` → añadir una columna es un INSERT,
  no un cambio de código. El técnico tiene tienda base, pero cada registro guarda la tienda donde
  ocurrió el hecho; los consolidados miran todas las tiendas.
- **Variables de entorno:** `.env` sólo en `.gitignore`; `.env.example` es la plantilla. Nunca
  escribas un secreto en el repo.
- **Comentarios y textos de UI en español (es-AR).** Los identificadores de código, en inglés.
- **`lib/icons.jsx` es un archivo COMPARTIDO por sincronización** (`npm run sync:shared`, desde el repo hermano): lo define el sitio público y acá se **sobrescribe** la copia.
  - Si este repo importa un icono que el canónico no exporta, el build falla con `MISSING_EXPORT`. **Eso no es "un icono duplicado": no borres el export.**
  - Icono nuevo → agregarlo en `greenline/frontend/lib/icons.jsx` y sincronizar. Nunca sólo en el panel.
  - Alias con el mismo dibujo (`Image`/`ImageIcon`, `Gauge`/`LayoutDashboard`, `Shield`/`ShieldCheck`, `Table`/`TableIcon`…) son intencionales: no los "limpies".
  - `npm test` corre `frontend/src/lib/icons.test.js`, que valida exports faltantes y duplicados con el archivo y el nombre exactos.

---

## 3. Seguridad (no negociable)

- **Nunca** escribas credenciales, API keys, tokens o secretos en el código, en commits, en
  logs ni en `console.log`. Los `.env` sólo viven en `.gitignore`; `.env.example` es la plantilla.
- **RLS:** el schema, las migraciones y las políticas viven en el **repo hermano**
  (`greenline/supabase/`). Toda consulta del panel a Supabase debe pasar por las políticas
  existentes; denegado por defecto sobre tablas de auth.
- **XSS:** cualquier HTML dinámico pasa por `frontend/src/utils/sanitizeHtml`. El linter falla si
  aparece un `dangerouslySetInnerHTML`, `.innerHTML =` o `insertAdjacentHTML` sin sanitizar.
  Esto es un requisito de la Bóveda Segura V5 (§16 / R60) — no es negociable.
- **Bóveda Segura V5 (`frontend/src/lib/vault/`):** criptografía con envelope encryption.
  No reimplementes primitives, no cambies el formato de sobre, no aflojes la verificación.
  La suite `npm test` es la quality gate de este módulo.
- **Auth:** respeta los roles y permisos del catálogo existente. No amplíes permisos de forma
  silenciosa ni los hornees en el frontend. El panel es `noindex,nofollow`.
- **Dashboard Flask:** las hojas de Google son públicas por enlace. No expongas datos sensibles en
  las plantillas, ni las expongas a internet sin revisar.
- Si una credencial quedó expuesta en un commit, **no la borres del historial sin avisar**: dilo
  primero y rotar la credencial.

---

## 4. Verificación (obligatoria antes de dar algo por terminado)

Ejecuta, en este orden, lo que corresponda al cambio:

```bash
npm run lint       # oxlint frontend/src + auditoría de sinks HTML
npm test           # node --test: frontend/src/lib/*.test.js + lib/vault/*.test.js
npm run build      # build del panel (frontend/dist/)
```

Reglas:

- Si un comando falla por tu cambio → **arréglalo** antes de responder.
- Si un comando falla por algo previo (no relacionado) → dilo en **una línea** y sigue.
- Si no puedes ejecutar un comando (sin BD, sin red, sin `.venv`) → dilo explícitamente; no digas
  "verificado".
- No añadas dependencias para "hacer pasar" un test.

Comandos adicionales según el área tocada:

| Área | Comando |
|---|---|
| Lint de HTML aislado | `npm run lint:html` |
| Sólo la bóveda V5 | `npm run test:vault` |
| Dashboard Flask | `.venv\Scripts\python app.py` → smoke con `dashboard/smoke.py` |
| PDF del CEO | `npm run pdf:ceo` (necesita `npm i -D puppeteer`) |
| Módulos del taller (repo hermano) | `cd ../greenline/backend && npm run smoke:taller` |
| RBAC / catálogo de permisos (repo hermano) | `cd ../greenline/backend && npm run seed:rbac && npm run rbac:check` |

---

## 5. Git

- **Ramas:** `develop` es la rama de trabajo. `main` es la de despliegue.
  - Los PR contra `main` **deben** salir de `develop`. Un PR de otra rama a `main` está bloqueado
    por el check `verify` de CI.
  - `auto-pr-develop-main.yml` hace el merge `develop → main` automáticamente. No lo hagas a mano.
- **Commits:** Conventional Commits (`feat:`, `fix:`, `ci:`, `docs:`, `refactor:`, `chore:`,
  `test:`) con scope cuando aplique: `feat(taller): ...`, `fix(auth): ...`.
- **Un commit = un cambio coherente.** No mezcles refactor con feature.
- **Nunca** hagas `git push --force`, `git commit --amend` sobre historia publicada, ni borres
  ramas remotas sin que te lo pidan.
- **No commitees** secretos, `.env`, `node_modules`, `frontend/dist/`, `dashboard/.venv/`,
  `__pycache__/`.

---

## 6. Límites de alcance

- Cambia **lo mínimo** que resuelve el pedido. Nada de refactors oportunistas.
- Si el pedido es ambiguo, elige la interpretación más conservadora y consígnala en una línea.
  No pares a preguntar por preferencias cosméticas.
- Si descubres un bug **fuera** del alcance: no lo arregles en el mismo cambio. Anótalo en una
  línea al final ("Fuera de alcance: ...").
- No modifiques el **repo hermano** (`greenline`) sin que te lo pidan: su schema, sus migraciones
  y su RLS son la fuente de verdad y requieren coordinación.
- No toques `.github/workflows/` sin que te lo pidan: la CI es el quality gate.
- No modifiques `vercel.json` ni el schema de Supabase sin que te lo pidan: afectan a producción.

---

## 7. Referencias internas

- `AGENTS.md` (raíz) — directrices completas para agentes de IA.
- `ARQUITECTURA.md` — arquitectura del ERP y del dashboard.
- `KNOWLEDGE_BASE.md` — conocimiento acumulado del dominio.
- `docs/sprints/` — sprints y estado del trabajo.
- `docs/Propuesta_CEO/` — propuesta y presentación ejecutiva.
- `dashboard/README.md` — guía para crear dashboards propios.
- `frontend/.env.example` — credenciales requeridas del panel.
- `../greenline/AGENTS.md` — directrices del repo hermano (backend, schema, RLS).
