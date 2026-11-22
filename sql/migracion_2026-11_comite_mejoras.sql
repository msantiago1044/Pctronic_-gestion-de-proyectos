-- ============================================================================
-- MIGRACIÓN · Mejoras Comité Noviembre 2026
-- ----------------------------------------------------------------------------
-- Script aditivo y 100% idempotente (puede ejecutarse múltiples veces sin error).
-- Incluye:
--   1. Funciones helper RLS (`public.es_super_usuario()`, `public.tiene_acceso_escritura()`,
--      `public.mi_rol()`).
--   2. Columnas en `public.proyectos` (TRM cotización, moneda, override falta real,
--      próxima facturación / hito de cobro).
--   3. Columnas en `public.presupuesto_items` (costo real estimado, moneda, USD, nota).
--   4. Columnas en `public.compras_solicitudes` (multimoneda por proveedor, fuente TRM,
--      correo aprobador y comentario de comité).
--   5. Columnas en `public.proyecto_cronograma` (hitos de facturación).
--   6. Enlace `public.facturas.corte_id` + índice único + políticas RLS
--      INSERT/UPDATE para sincronización desde `cortes_cliente`.
--   7. Columnas en `public.crm_ofertas_preventa` (archivo cotización y TRM oferta).
--   8. Tabla `public.notificaciones` + índices + políticas RLS por rol / usuario
--      + RPCs atómicas para marcar notificaciones como leídas.
--   9. Actualización de `public.rpc_proyecto_finanzas(uuid)` filtrando cortes en
--      estado ('facturado', 'pagado') para coincidir con `assets/js/proy/core.js`.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. FUNCIONES HELPER DE SEGURIDAD Y ROLES
-- ----------------------------------------------------------------------------
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
        and rol in ('super_usuario', 'directivo', 'comercial', 'proyectos', 'compras', 'admin', 'miembro')
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
        else coalesce(p.rol, 'proyectos')
      end
      from public.profiles p
      where p.id = auth.uid()
      limit 1
    ),
    ''
  );
$$;

-- ----------------------------------------------------------------------------
-- 2. PROYECTOS · TRM de cotización, moneda, falta real y próxima facturación
-- ----------------------------------------------------------------------------
alter table public.proyectos
  add column if not exists trm_cotizacion numeric(12,2) default null;
alter table public.proyectos
  add column if not exists moneda text default 'COP';
alter table public.proyectos
  add column if not exists falta_real_override numeric(14,2) default null;
alter table public.proyectos
  add column if not exists nota_falta_real text default null;
alter table public.proyectos
  add column if not exists proxima_facturacion_texto text default null;
alter table public.proyectos
  add column if not exists proximo_hito_cobro text default null;

-- ----------------------------------------------------------------------------
-- 3. PRESUPUESTO_ITEMS · Costo real estimado y soporte USD
-- ----------------------------------------------------------------------------
alter table public.presupuesto_items
  add column if not exists costo_real_estimado_total numeric(14,2) default null;
alter table public.presupuesto_items
  add column if not exists moneda_costo text default 'COP';
alter table public.presupuesto_items
  add column if not exists costo_origen_usd numeric(14,2) default null;
alter table public.presupuesto_items
  add column if not exists nota_ajuste_real text default null;

-- ----------------------------------------------------------------------------
-- 4. COMPRAS_SOLICITUDES · Multimoneda, fuente TRM, correo y comentario comité
-- ----------------------------------------------------------------------------
alter table public.compras_solicitudes
  add column if not exists moneda_p1 text default 'COP';
alter table public.compras_solicitudes
  add column if not exists moneda_p2 text default 'COP';
alter table public.compras_solicitudes
  add column if not exists moneda_p3 text default 'COP';
alter table public.compras_solicitudes
  add column if not exists trm_fuente text default 'manual';
alter table public.compras_solicitudes
  add column if not exists correo_aprobador text default null;
alter table public.compras_solicitudes
  add column if not exists comentario_comite text default null;

-- ----------------------------------------------------------------------------
-- 5. PROYECTO_CRONOGRAMA · Hitos de facturación
-- ----------------------------------------------------------------------------
alter table public.proyecto_cronograma
  add column if not exists es_hito_facturacion boolean default false;
alter table public.proyecto_cronograma
  add column if not exists monto_facturacion_estimado numeric(14,2) default null;
alter table public.proyecto_cronograma
  add column if not exists hito_facturado boolean default false;

-- ----------------------------------------------------------------------------
-- 6. FACTURAS · Enlace con cortes_cliente + índice único + RLS INSERT/UPDATE
-- ----------------------------------------------------------------------------
alter table public.facturas
  add column if not exists corte_id uuid references public.cortes_cliente(id) on delete set null;

drop index if exists public.idx_facturas_corte_id_unique;
create unique index if not exists idx_facturas_corte_id_unique
  on public.facturas (corte_id);

alter table public.facturas enable row level security;

drop policy if exists "authenticated_insert" on public.facturas;
drop policy if exists "escritura_insert_facturas" on public.facturas;
drop policy if exists "facturas_insert_policy" on public.facturas;
create policy "facturas_insert_policy" on public.facturas
  for insert to authenticated
  with check (
    public.es_super_usuario()
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.rol in ('super_usuario', 'admin', 'directivo', 'proyectos', 'comercial', 'miembro')
    )
  );

drop policy if exists "authenticated_update" on public.facturas;
drop policy if exists "escritura_update_facturas" on public.facturas;
drop policy if exists "facturas_update_policy" on public.facturas;
create policy "facturas_update_policy" on public.facturas
  for update to authenticated
  using (
    public.es_super_usuario()
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.rol in ('super_usuario', 'admin', 'directivo', 'proyectos', 'comercial', 'miembro')
    )
  )
  with check (
    public.es_super_usuario()
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.rol in ('super_usuario', 'admin', 'directivo', 'proyectos', 'comercial', 'miembro')
    )
  );

-- ----------------------------------------------------------------------------
-- 7. CRM_OFERTAS_PREVENTA · Archivo de cotización y TRM de oferta
-- ----------------------------------------------------------------------------
alter table public.crm_ofertas_preventa
  add column if not exists archivo_cotizacion_path text default null;
alter table public.crm_ofertas_preventa
  add column if not exists archivo_cotizacion_nombre text default null;
alter table public.crm_ofertas_preventa
  add column if not exists trm_oferta numeric(12,2) default null;

-- ----------------------------------------------------------------------------
-- 8. NOTIFICACIONES · Centro de avisos internos por rol o usuario
-- ----------------------------------------------------------------------------
create table if not exists public.notificaciones (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  tipo text not null default 'nuevo_proyecto',
  titulo text not null,
  mensaje text,
  url text,
  rol_destino text[] not null default array['super_usuario','directivo','proyectos'],
  usuario_destino uuid references auth.users(id) on delete cascade,
  proyecto_id uuid references public.proyectos(id) on delete cascade,
  leida_por uuid[] not null default '{}'::uuid[],
  creado_por uuid references auth.users(id) on delete set null
);

create index if not exists idx_notificaciones_created_at
  on public.notificaciones (created_at desc);

create index if not exists idx_notificaciones_usuario_destino
  on public.notificaciones (usuario_destino)
  where usuario_destino is not null;

alter table public.notificaciones enable row level security;

drop policy if exists "notificaciones_select_policy" on public.notificaciones;
create policy "notificaciones_select_policy" on public.notificaciones
  for select to authenticated
  using (
    usuario_destino = auth.uid()
    or (
      usuario_destino is null
      and (
        public.mi_rol() = any(rol_destino)
        or exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.rol = any(rol_destino)
        )
      )
    )
    or creado_por = auth.uid()
    or public.es_super_usuario()
  );

drop policy if exists "notificaciones_insert_policy" on public.notificaciones;
create policy "notificaciones_insert_policy" on public.notificaciones
  for insert to authenticated
  with check (public.tiene_acceso_escritura());

drop policy if exists "notificaciones_update_leida_policy" on public.notificaciones;
create policy "notificaciones_update_leida_policy" on public.notificaciones
  for update to authenticated
  using (
    public.es_super_usuario()
    or creado_por = auth.uid()
  )
  with check (
    public.es_super_usuario()
    or creado_por = auth.uid()
  );

drop policy if exists "notificaciones_delete_policy" on public.notificaciones;
create policy "notificaciones_delete_policy" on public.notificaciones
  for delete to authenticated
  using (public.es_super_usuario());

create or replace function public.rpc_marcar_notificacion_leida(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_rol text := public.mi_rol();
  v_filas integer := 0;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  update public.notificaciones n
  set leida_por = array_append(coalesce(n.leida_por, '{}'::uuid[]), v_uid)
  where n.id = p_id
    and not (v_uid = any(coalesce(n.leida_por, '{}'::uuid[])))
    and (
      n.usuario_destino = v_uid
      or (
        n.usuario_destino is null
        and (
          v_rol = any(n.rol_destino)
          or exists (
            select 1
            from public.profiles p
            where p.id = v_uid
              and p.rol = any(n.rol_destino)
          )
        )
      )
      or n.creado_por = v_uid
      or public.es_super_usuario()
    );

  get diagnostics v_filas = row_count;
  return v_filas > 0;
end;
$$;

revoke all on function public.rpc_marcar_notificacion_leida(uuid) from public, anon;
grant execute on function public.rpc_marcar_notificacion_leida(uuid) to authenticated;

create or replace function public.rpc_marcar_todas_notificaciones_leidas()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_rol text := public.mi_rol();
  v_filas integer := 0;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  update public.notificaciones n
  set leida_por = array_append(coalesce(n.leida_por, '{}'::uuid[]), v_uid)
  where not (v_uid = any(coalesce(n.leida_por, '{}'::uuid[])))
    and (
      n.usuario_destino = v_uid
      or (
        n.usuario_destino is null
        and (
          v_rol = any(n.rol_destino)
          or exists (
            select 1
            from public.profiles p
            where p.id = v_uid
              and p.rol = any(n.rol_destino)
          )
        )
      )
      or n.creado_por = v_uid
      or public.es_super_usuario()
    );

  get diagnostics v_filas = row_count;
  return v_filas;
end;
$$;

revoke all on function public.rpc_marcar_todas_notificaciones_leidas() from public, anon;
grant execute on function public.rpc_marcar_todas_notificaciones_leidas() to authenticated;

-- ----------------------------------------------------------------------------
-- 9. ACTUALIZACIÓN DE public.rpc_proyecto_finanzas(uuid)
--    Suma únicamente cortes_cliente en estado ('facturado', 'pagado'),
--    coincidiendo con la lógica de `assets/js/proy/core.js`.
-- ----------------------------------------------------------------------------
create or replace function public.rpc_proyecto_finanzas(p_proyecto_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cd_cortado numeric(14,2) := 0;
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
  into v_gastado
  from public.gastos g
  where g.proyecto_id = p_proyecto_id;

  return jsonb_build_object(
    'cd_cortado', v_cd_cortado,
    'facturado', v_cd_cortado,
    'gastado', v_gastado
  );
end;
$$;

revoke all on function public.rpc_proyecto_finanzas(uuid) from public, anon;
grant execute on function public.rpc_proyecto_finanzas(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 10. RECARGA DE ESQUEMA EN POSTGREST
-- ----------------------------------------------------------------------------
notify pgrst, 'reload schema';
