-- ============================================================================
-- §40 — Visibilidad de contraseñas por rol en la bóveda segura
--
-- ESTA MIGRACIÓN VA EN EL REPO HERMANO `greenline`:
--   supabase/migrations/2026XXXXXXXXXX_boveda_roles_visibles.sql
--
-- El panel (este repo) ya la usa:
--   frontend/src/lib/vault/api.js       → columna `roles_visibles`
--   frontend/src/components/admin/AdminBoveda.jsx → selector por rol
--
-- El panel SONEA la columna al arrancar: si no está, esconde el selector y
-- la bóveda sigue funcionando igual (guardar/editar/eliminar). Por eso esta
-- migración es la que hace que la función se pueda usar de verdad.
--
-- SEMÁNTICA DE LA COLUMNA
--   NULL  → sin restricción: todos los roles con acceso a la CATEGORÍA ven
--           la contraseña (comportamiento heredado).
--   '{}'  → restringido a los gestores (ADMIN / DESARROLLADOR_WEB).
--   {...} → restringido a esos roles, MÁS los gestores (que nunca pierden
--           el acceso: si no, un gestor podría dejar un secreto sin nadie
--           que pueda auditarlo).
--
-- IMPORTANTE — POR QUÉ ESTO NO ES SUFICIENTE POR SÍ SOLO
--   La fila cifrada llega al navegador del miembro y la DEK la abre el
--   propio cliente: la contraseña NUNCA pasa por el servidor. Por eso la
--   restricción tiene que imponerla el RLS en la lectura de la fila, no
--   sólo la UI. Si el RLS no filtra, un miembro podría leer el ciphertext
--   por la API, descifrarlo en su navegador y saltarse la UI.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1) La columna
-- ---------------------------------------------------------------------------

alter table greenline_vault_items
  add column if not exists roles_visibles text[];

comment on column greenline_vault_items.roles_visibles is
  'Roles que pueden ver la CONTRASEÑA de este secreto. NULL = sin '
  'restricción (todo el que ve la categoría). ARRAY = sólo esos roles, más '
  'los gestores (ADMIN, DESARROLLADOR_WEB). Aplicado por el RLS.';

-- Un ARRAY vacío se normaliza a NULL: «nadie» no es un estado válido, la
-- lista vacía significa «sólo los gestores» y se guarda como ARRAY vacío
-- (no como NULL, que significaría «sin restricción»).
create or replace function greenline_normaliza_roles_visibles(p_roles text[])
returns text[]
language sql
immutable
as $$
  select case
    when p_roles is null then null
    else coalesce(
      (
        select array_agg(distinct r order by r)
        from unnest(p_roles) as r
        where r is not null and btrim(r) <> ''
      ),
      '{}'::text[]
    )
  end;
$$;

-- ---------------------------------------------------------------------------
-- 2) Función de acceso: ¿ve este usuario la CONTRASEÑA de este ítem?
--
--    ADAPTAR AL ESQUEMA VIGENTE: el bloque de abajo es una PLANTILLA. La
--    tabla de roles y la de asignación por usuario están en el repo hermano
--    y sus nombres no se pueden verificar desde este repo. Lo que sí está
--    confirmado (ver AGENTS.md §2 y `frontend/src/lib/roles.js`):
--
--      • es_admin_panel()  → el usuario es ADMIN
--      • es_blog_admin()   → EDITORA_BLOG
--      • es_distribucion() → DISTRIBUCION
--      • panel_acceso      → grant por rol (además exige `activo`)
--      • `roles` + el rol primario y los `extraRoles` del usuario
--
--    Hay que sustituir `greenline_roles_efectivos(auth.uid())` por la
--    consulta que ya use el RLS vigente para «los roles de este usuario».
--    Si no existe todavía, créala con la misma forma que la política de
--    acceso al panel.
-- ---------------------------------------------------------------------------

create or replace function greenline_boveda_ve_contrasena(p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with eff as (
    select r from unnest(greenline_roles_efectivos(auth.uid())) as r
  )
  select
    case
      -- Sin restricción: manda la CATEGORÍA (que aplica el RLS aparte).
      when p_roles is null then true
      -- Los gestores conservan siempre el acceso.
      when exists (select 1 from eff where r in ('ADMIN', 'DESARROLLADOR_WEB'))
        then true
      else exists (select 1 from eff where r = any (p_roles))
    end;
$$;

-- ---------------------------------------------------------------------------
-- 3) RLS: el filtro de lectura por item
--
--    `greenline_vault_items` tiene (al menos) dos políticas de SELECT:
--      • la del DUEÑO de la bóveda
--      • la de MIEMBRO de la bóveda de equipo
--
--    La de miembro es la que hay que tocar: además de la categoría (§40), la
--    fila sólo se sirve si la contraseña es visible para el rol del usuario.
--
--    ANTES (esquema, ajustar a los nombres reales de la migración vigente):
--
--      create policy "miembros leen items de su bóveda" on greenline_vault_items
--        for select to authenticated
--        using (
--          vault_id in (
--            select vault_id from greenline_vault_members
--            where user_id = auth.uid()
--          )
--          and greenline_boveda_categoria_permitida(categoria)
--        );
--
--    DESPUÉS:
--
--      create policy "miembros leen items de su bóveda" on greenline_vault_items
--        for select to authenticated
--        using (
--          vault_id in (
--            select vault_id from greenline_vault_members
--            where user_id = auth.uid()
--          )
--          and greenline_boveda_categoria_permitida(categoria)
--          and greenline_boveda_ve_contrasena(roles_visibles)
--        );
--
--    IMPORTANTE: la política del dueño NO se toca. El dueño (y los
--    gestores) conservan el acceso completo a su propia bóveda.
--
--    Lee la migración vigente de la bóveda en el repo hermano y aplica el
--    cambio sobre los nombres reales de la tabla de miembros y de la
--    función de categoría. NO copies este bloque a ciegas.
-- ---------------------------------------------------------------------------

commit;
