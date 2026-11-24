-- ============================================================================
-- MIGRACIÓN · Reunión 23 Noviembre 2026 — Permisos por Módulo, Roles y Flujos
-- ----------------------------------------------------------------------------
-- Script 100% aditivo e idempotente (puede ejecutarse múltiples veces sin error).
-- Incluye:
--   1. Roles ampliados (8 roles + compatibilidad legacy) y permisos granulares
--      por módulo (`public.profiles.modulos_permitidos`) + RLS anti-escalamiento.
--   2. Funciones helper RLS actualizadas (`public.es_super_usuario()`,
--      `public.tiene_acceso_escritura()`, `public.mi_rol()`).
--   3. Coordinador de proyecto (`public.proyectos.coordinador_id`,
--      `coordinador_nombre`) + índice de consulta.
--   4. Columnas en Compras y Gastos (`motivo_seleccion`, `orden_compra_id`,
--      `corte_mo_id`) + RLS DELETE para `public.gastos`.
--   5. Flujo de Ofertas Pre-venta (`estado` ampliado con `enviado_comercial`,
--      `comercial_destino_id`, `enviado_comercial_at`, `proyecto_id`) y
--      visibilidad por comercial en `public.crm_oportunidades`.
--   6. Actualización de `public.rpc_proyecto_finanzas(uuid)` incluyendo
--      mano de obra propia (`public.registro_mo_propia`) en `gastado`.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. PROFILES · MÓDULOS PERMITIDOS, ROLES AMPLIADOS Y FUNCIONES HELPER RLS
-- ----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists modulos_permitidos text[] default null;

do $$
declare
  c_name text;
begin
  if to_regclass('public.profiles') is not null then
    for c_name in
      select conname
      from pg_constraint
      where conrelid = 'public.profiles'::regclass
        and contype = 'c'
        and pg_get_constraintdef(oid) ilike '%rol%'
    loop
      execute format('alter table public.profiles drop constraint if exists %I;', c_name);
    end loop;

    alter table public.profiles
      add constraint profiles_rol_check
      check (rol in (
        'super_usuario',
        'directivo',
        'jefe_comercial',
        'comercial',
        'preventa',
        'jefe_compras',
        'compras',
        'proyectos',
        'admin',
        'miembro'
      ));
  end if;
end $$;

create or replace function public.es_super_usuario()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and rol in ('super_usuario', 'admin')
  );
$$;

create or replace function public.tiene_acceso_escritura()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.role() = 'authenticated'
    and exists (
      select 1
      from public.profiles
      where id = auth.uid()
        and rol in (
          'super_usuario',
          'directivo',
          'jefe_comercial',
          'comercial',
          'preventa',
          'jefe_compras',
          'compras',
          'proyectos',
          'admin',
          'miembro'
        )
    );
$$;

create or replace function public.mi_rol()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select case
        when p.rol = 'admin' then 'super_usuario'
        when p.rol = 'miembro' then 'proyectos'
        when p.rol in (
          'super_usuario',
          'directivo',
          'jefe_comercial',
          'comercial',
          'preventa',
          'jefe_compras',
          'compras',
          'proyectos'
        ) then p.rol
        else coalesce(p.rol, 'proyectos')
      end
      from public.profiles p
      where p.id = auth.uid()
      limit 1
    ),
    ''
  );
$$;

-- Políticas RLS de profiles: impiden que un usuario normal modifique su propio rol o modulos_permitidos
alter table public.profiles enable row level security;

drop policy if exists "authenticated_insert" on public.profiles;
drop policy if exists "profiles_insert_policy" on public.profiles;
create policy "profiles_insert_policy" on public.profiles
  for insert to authenticated
  with check (
    public.es_super_usuario()
    or (
      id = auth.uid()
      and coalesce(rol, 'proyectos') not in ('super_usuario', 'admin')
      and modulos_permitidos is null
    )
  );

drop policy if exists "authenticated_update" on public.profiles;
drop policy if exists "usuarios_update_propio_o_admin" on public.profiles;
create policy "usuarios_update_propio_o_admin" on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.es_super_usuario())
  with check (
    public.es_super_usuario()
    or (
      id = auth.uid()
      and rol is not distinct from (select p2.rol from public.profiles p2 where p2.id = auth.uid())
      and modulos_permitidos is not distinct from (select p2.modulos_permitidos from public.profiles p2 where p2.id = auth.uid())
    )
  );

-- Actualizar políticas INSERT/UPDATE de facturas para incluir jefe_comercial
do $$
begin
  if to_regclass('public.facturas') is not null then
    drop policy if exists "facturas_insert_policy" on public.facturas;
    create policy "facturas_insert_policy" on public.facturas
      for insert to authenticated
      with check (
        public.es_super_usuario()
        or exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.rol in ('super_usuario', 'admin', 'directivo', 'jefe_comercial', 'proyectos', 'comercial', 'miembro')
        )
      );

    drop policy if exists "facturas_update_policy" on public.facturas;
    create policy "facturas_update_policy" on public.facturas
      for update to authenticated
      using (
        public.es_super_usuario()
        or exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.rol in ('super_usuario', 'admin', 'directivo', 'jefe_comercial', 'proyectos', 'comercial', 'miembro')
        )
      )
      with check (
        public.es_super_usuario()
        or exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.rol in ('super_usuario', 'admin', 'directivo', 'jefe_comercial', 'proyectos', 'comercial', 'miembro')
        )
      );
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 2. PROYECTOS · COORDINADOR ASIGNADO + ÍNDICE
-- ----------------------------------------------------------------------------
alter table public.proyectos
  add column if not exists coordinador_id uuid references public.profiles(id) on delete set null;

alter table public.proyectos
  add column if not exists coordinador_nombre text default null;

create index if not exists idx_proyectos_coordinador_id
  on public.proyectos (coordinador_id);

-- ----------------------------------------------------------------------------
-- 3. COMPRAS Y GASTOS · MOTIVO DE SELECCIÓN, ENLACES Y RLS DELETE
-- ----------------------------------------------------------------------------
alter table if exists public.compras_solicitudes
  add column if not exists motivo_seleccion text default null;

alter table if exists public.compras_solicitud_items
  add column if not exists motivo_seleccion text default null;

do $$
begin
  if to_regclass('public.gastos') is not null then
    if to_regclass('public.compras_ordenes') is not null then
      alter table public.gastos
        add column if not exists orden_compra_id uuid references public.compras_ordenes(id) on delete set null;
    else
      alter table public.gastos
        add column if not exists orden_compra_id uuid default null;
    end if;

    if to_regclass('public.cortes_mo') is not null then
      alter table public.gastos
        add column if not exists corte_mo_id uuid references public.cortes_mo(id) on delete set null;
    else
      alter table public.gastos
        add column if not exists corte_mo_id uuid default null;
    end if;

    create index if not exists idx_gastos_orden_compra_id
      on public.gastos (orden_compra_id)
      where orden_compra_id is not null;

    create index if not exists idx_gastos_corte_mo_id
      on public.gastos (corte_mo_id)
      where corte_mo_id is not null;

    alter table public.gastos enable row level security;

    drop policy if exists "authenticated_delete" on public.gastos;
    drop policy if exists "solo_admin_delete_gastos" on public.gastos;
    drop policy if exists "solo_super_delete_gastos" on public.gastos;
    create policy "solo_super_delete_gastos" on public.gastos
      for delete to authenticated
      using (public.es_super_usuario());
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 4. OFERTAS PRE-VENTA Y CRM · FLUJO COMERCIAL Y PRIVACIDAD POR COMERCIAL
-- ----------------------------------------------------------------------------
do $$
declare
  c_name text;
begin
  if to_regclass('public.crm_ofertas_preventa') is not null then
    for c_name in
      select conname
      from pg_constraint
      where conrelid = 'public.crm_ofertas_preventa'::regclass
        and contype = 'c'
        and pg_get_constraintdef(oid) ilike '%estado%'
    loop
      execute format('alter table public.crm_ofertas_preventa drop constraint if exists %I;', c_name);
    end loop;

    alter table public.crm_ofertas_preventa
      add constraint crm_ofertas_preventa_estado_check
      check (estado in (
        'levantamiento',
        'en_proceso',
        'finalizado',
        'enviado_comercial',
        'enviado_cliente'
      ));

    alter table public.crm_ofertas_preventa
      add column if not exists comercial_destino_id uuid references public.profiles(id) on delete set null;
    alter table public.crm_ofertas_preventa
      add column if not exists enviado_comercial_at timestamptz default null;
    alter table public.crm_ofertas_preventa
      add column if not exists proyecto_id uuid references public.proyectos(id) on delete set null;

    create index if not exists idx_crm_ofertas_comercial_destino
      on public.crm_ofertas_preventa (comercial_destino_id)
      where comercial_destino_id is not null;
    create index if not exists idx_crm_ofertas_proyecto_id
      on public.crm_ofertas_preventa (proyecto_id)
      where proyecto_id is not null;
  end if;
end $$;

do $$
begin
  if to_regclass('public.crm_oportunidades') is not null then
    alter table public.crm_oportunidades
      add column if not exists creado_por uuid references public.profiles(id) on delete set null;

    create index if not exists idx_crm_oportunidades_creado_por
      on public.crm_oportunidades (creado_por)
      where creado_por is not null;

    alter table public.crm_oportunidades enable row level security;

    drop policy if exists "crm_oportunidades_authenticated_select" on public.crm_oportunidades;
    create policy "crm_oportunidades_authenticated_select" on public.crm_oportunidades
      for select to authenticated
      using (
        public.es_super_usuario()
        or public.mi_rol() in ('super_usuario', 'directivo', 'jefe_comercial', 'preventa')
        or exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.rol in ('super_usuario', 'admin', 'directivo', 'jefe_comercial', 'preventa')
        )
        or responsable_id = auth.uid()
        or creado_por = auth.uid()
      );

    drop policy if exists "crm_oportunidades_authenticated_delete" on public.crm_oportunidades;
    drop policy if exists "solo_admin_delete_crm_oportunidades" on public.crm_oportunidades;
    drop policy if exists "solo_super_delete_crm_oportunidades" on public.crm_oportunidades;
    drop policy if exists "crm_oportunidades_delete_policy" on public.crm_oportunidades;
    create policy "crm_oportunidades_delete_policy" on public.crm_oportunidades
      for delete to authenticated
      using (
        public.es_super_usuario()
        or public.mi_rol() = 'jefe_comercial'
        or (
          etapa = 'perdida'
          and (responsable_id = auth.uid() or creado_por = auth.uid())
        )
      );
  end if;
end $$;

do $$
begin
  if to_regclass('public.proyecto_cronograma') is not null then
    alter table public.proyecto_cronograma enable row level security;

    drop policy if exists "cronograma_delete" on public.proyecto_cronograma;
    drop policy if exists "solo_admin_delete_proyecto_cronograma" on public.proyecto_cronograma;
    drop policy if exists "solo_super_delete_proyecto_cronograma" on public.proyecto_cronograma;
    drop policy if exists "proyecto_cronograma_delete_policy" on public.proyecto_cronograma;
    create policy "proyecto_cronograma_delete_policy" on public.proyecto_cronograma
      for delete to authenticated
      using (
        public.es_super_usuario()
        or public.mi_rol() in ('directivo', 'proyectos')
      );
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 5. RPC FINANZAS DE PROYECTO · INCLUIR MANO DE OBRA PROPIA EN GASTADO
-- ----------------------------------------------------------------------------
alter table if exists public.registro_mo_propia
  add column if not exists valor_total numeric(14,2) default null;

create or replace function public.rpc_proyecto_finanzas(p_proyecto_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cd_cortado numeric(14,2) := 0;
  v_gastos numeric(14,2) := 0;
  v_mo_propia numeric(14,2) := 0;
  v_gastado numeric(14,2) := 0;
begin
  if auth.role() <> 'authenticated' and current_user not in ('postgres', 'service_role') then
    raise exception 'No autenticado';
  end if;

  select coalesce(sum(ci.cantidad * ci.pu_venta_snapshot), 0)
  into v_cd_cortado
  from public.cortes_cliente_items ci
  join public.cortes_cliente c on c.id = ci.corte_id
  where c.proyecto_id = p_proyecto_id
    and c.estado in ('facturado', 'pagado');

  select coalesce(sum(g.valor_total), 0)
  into v_gastos
  from public.gastos g
  where g.proyecto_id = p_proyecto_id;

  if to_regclass('public.registro_mo_propia') is not null then
    select coalesce(sum(
      coalesce(
        rmo.valor_total,
        coalesce(t.valor_hora, 0) * (
          coalesce(rmo.dias, 0) * coalesce(rmo.horas_dia, t.horas_dia, 8)
          + coalesce(rmo.horas_extra, 0) * (1 + coalesce(pr.recargo_hora_extra_porcentaje, 25) / 100.0)
        )
      )
    ), 0)
    into v_mo_propia
    from public.registro_mo_propia rmo
    left join public.tarifas_tecnicos t on t.id = rmo.tarifa_id
    left join public.proyectos pr on pr.id = rmo.proyecto_id
    where rmo.proyecto_id = p_proyecto_id;
  end if;

  v_gastado := coalesce(v_gastos, 0) + coalesce(v_mo_propia, 0);

  return jsonb_build_object(
    'cd_cortado', v_cd_cortado,
    'facturado', v_cd_cortado,
    'gastado', v_gastado,
    'gastos_directos', v_gastos,
    'mo_propia', v_mo_propia
  );
end;
$$;

revoke all on function public.rpc_proyecto_finanzas(uuid) from public, anon;
grant execute on function public.rpc_proyecto_finanzas(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 6. RECARGA DE ESQUEMA EN POSTGREST
-- ----------------------------------------------------------------------------
notify pgrst, 'reload schema';
