# Ideas Descartadas, Decisiones y Trade-offs - Sprint 1 (ERP / Admin)

Decisiones técnicas del Sprint 1 cuyo alcance reside en el **ERP**. El documento completo de la web pública vive en `docs/Sprint1/05-ideas-descartadas-y-tradeoffs.md` (repo web).

---

## Decisiones Arquitectónicas y Trade-offs

- **Autenticación y Roles Estrictos (RLS):**
  - *Trade-off:* Implementar permisos personalizados requería mayor complejidad en las políticas de seguridad de Supabase.
  - *Decisión:* Se estructuraron roles claros (`ADMIN` y `DESARROLLADOR_WEB`) mediante Row Level Security, asegurando que la gestión de inventario y blogs esté protegida ante accesos no autorizados.
