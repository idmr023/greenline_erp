# Detalle de Tareas Completadas - Sprint 1 (ERP / Admin) (Greenline Web ERP)

Secciones del detalle técnico del Sprint 1 cuyo desarrollo reside en el ámbito **ERP** (panel de administración, con soporte del backend y Supabase/RLS que viven en el repo web). Las rutas de archivo de este documento son relativas al repo web. El detalle de la web pública vive en `docs/Sprint1/03-tareas-completadas.md` (repo web).

---

## 7. Seguridad, Autenticación y Roles (Supabase RLS)
- **Roles y Permisos:**
  - Restricción y configuración de roles `ADMIN` y `DESARROLLADOR_WEB` para garantizar que únicamente usuarios autorizados puedan editar, crear productos o manipular configuraciones críticas.
- **Políticas de Seguridad RLS:**
  - Aplicación y auditoría de políticas Row Level Security en las tablas de Supabase mediante scripts automatizados (`scripts/aplicar-audit-rls.mjs`, `scripts/security-smoke.mjs`).

---

## 8.3 Catálogo de Setiembre y producto GreenLine X6
- **Alta del producto GreenLine X6** en `supabase/seed.sql` (id 36, motor 1200W / 1600W máx, 72V/28AH, 50 km/h, autonomía 50–60 km, carga 150 kg, 184×75×114 cm) con ficha técnica, información adicional y colores (Rojo, Plateado, Negro).
- **Script re-ejecutable** (SQL editor de Supabase) para insertar/actualizar el X6 sin duplicar por slug, pendiente de imágenes por `/admin`.
- **Mapeo de vídeos y manuales por modelo:** actualizaciones por regex de `video_id` en el seed (incluye X6/X6PRO, MX6) y asignación de `manual_pdf` (Manual X6, Manual de uso X6 Pro, Manual de uso MX6, etc.).

---

## 8.8 Libro de Reclamaciones (legal, BD y admin)
- **Almacenamiento en base de datos**: los reclamos se persisten (Supabase) además de enviarse a la hoja de cálculo (`backend/src/routes/reclamaciones.routes.js`).
- **Vista en `/admin`**: módulo `AdminReclamaciones.jsx` dentro del Admin Panel para gestionar los reclamos registrados.
- **Aviso legal de plazo**: el correo de confirmación al consumidor indica respuesta en **máximo 15 días hábiles** (aprobado por dirección).
- **Remitente dedicado**: los correos del Libro de Reclamaciones usan `RECLAMACIONES_EMAIL_FROM` / SMTP dedicados vía `.env` (correo de Mayra como sender principal).
