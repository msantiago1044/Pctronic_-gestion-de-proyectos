-- ============================================================================
-- MIGRACIÓN INTEGRAL · Reunión Noviembre 2026
-- ----------------------------------------------------------------------------
-- Incluye:
--   1. Roles (5 roles + compatibilidad legacy) y funciones RLS
--   2. Retenciones en proveedores + Tabla unificada de Terceros y Contactos
--   3. Módulo Operativo de Compras (solicitudes, ítems comparativos, órdenes)
--   4. Cronograma de Proyectos + Ofertas Pre-venta en CRM Comercial
--
-- Script idempotente (puede ejecutarse múltiples veces sin error).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ROLES Y FUNCIONES DE SEGURIDAD (5 roles + legacy)
-- ----------------------------------------------------------------------------
do $$
declare
  c_name text;
begin
  for c_name in
    select conname
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%rol%'
  loop
    execute format('alter table public.profiles drop constraint if exists %I;', c_name);
  end loop;
end $$;

alter table public.profiles
  add constraint profiles_rol_check
  check (rol in ('super_usuario', 'directivo', 'comercial', 'proyectos', 'compras', 'admin', 'miembro'));

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

-- Políticas RLS de profiles
drop policy if exists "authenticated_insert" on public.profiles;
drop policy if exists "profiles_insert_policy" on public.profiles;
create policy "profiles_insert_policy" on public.profiles
  for insert to authenticated
  with check (
    public.es_super_usuario()
    or (id = auth.uid() and coalesce(rol, 'miembro') not in ('super_usuario', 'admin'))
  );

drop policy if exists "authenticated_update" on public.profiles;
drop policy if exists "usuarios_update_propio_o_admin" on public.profiles;
create policy "usuarios_update_propio_o_admin" on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.es_super_usuario())
  with check (
    public.es_super_usuario()
    or (id = auth.uid() and rol = (select p2.rol from public.profiles p2 where p2.id = auth.uid()))
  );

drop policy if exists "authenticated_delete" on public.profiles;
drop policy if exists "solo_admin_delete_profiles" on public.profiles;
create policy "solo_admin_delete_profiles" on public.profiles
  for delete to authenticated
  using (public.es_super_usuario());

-- ----------------------------------------------------------------------------
-- 2. PROVEEDORES (RETENCIONES) + TERCEROS UNIFICADOS
-- ----------------------------------------------------------------------------
alter table public.proveedores add column if not exists aplica_retencion boolean default false;
alter table public.proveedores add column if not exists porcentaje_retencion numeric default 0;
alter table public.proveedores add column if not exists porcentaje_ica numeric default 0;
alter table public.proveedores add column if not exists monto_minimo_retencion numeric default 0;
alter table public.proveedores add column if not exists rut_notas text;

create table if not exists public.terceros (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  identificacion text,
  es_cliente boolean default false,
  es_proveedor boolean default false,
  es_contratista boolean default false,
  telefono text,
  email text,
  direccion text,
  categoria text,
  especialidad text,
  tipo_persona text default 'empresa',
  es_declarante_renta boolean default false,
  aplica_retencion boolean default false,
  porcentaje_retencion numeric default 0,
  porcentaje_ica numeric default 0,
  monto_minimo_retencion numeric default 0,
  cliente_id uuid,
  proveedor_id uuid,
  contratista_id uuid,
  notas text,
  created_at timestamptz default now()
);

create table if not exists public.terceros_contactos (
  id uuid primary key default gen_random_uuid(),
  tercero_id uuid not null references public.terceros(id) on delete cascade,
  nombre text not null,
  cargo text,
  tipo_contacto text,
  telefono text,
  email text,
  created_at timestamptz default now()
);

alter table public.terceros enable row level security;
alter table public.terceros_contactos enable row level security;

drop policy if exists "terceros_auth_select" on public.terceros;
create policy "terceros_auth_select" on public.terceros for select to authenticated using (true);
drop policy if exists "terceros_auth_insert" on public.terceros;
create policy "terceros_auth_insert" on public.terceros for insert to authenticated with check (true);
drop policy if exists "terceros_auth_update" on public.terceros;
create policy "terceros_auth_update" on public.terceros for update to authenticated using (true) with check (true);
drop policy if exists "terceros_super_delete" on public.terceros;
create policy "terceros_super_delete" on public.terceros for delete to authenticated using (public.es_super_usuario());

drop policy if exists "terceros_contactos_auth_select" on public.terceros_contactos;
create policy "terceros_contactos_auth_select" on public.terceros_contactos for select to authenticated using (true);
drop policy if exists "terceros_contactos_auth_insert" on public.terceros_contactos;
create policy "terceros_contactos_auth_insert" on public.terceros_contactos for insert to authenticated with check (true);
drop policy if exists "terceros_contactos_auth_update" on public.terceros_contactos;
create policy "terceros_contactos_auth_update" on public.terceros_contactos for update to authenticated using (true) with check (true);
drop policy if exists "terceros_contactos_auth_delete" on public.terceros_contactos;
create policy "terceros_contactos_auth_delete" on public.terceros_contactos for delete to authenticated using (true);

-- ----------------------------------------------------------------------------
-- 3. MÓDULO OPERATIVO DE COMPRAS
-- ----------------------------------------------------------------------------
create table if not exists public.compras_solicitudes (
  id uuid primary key default gen_random_uuid(),
  numero text,
  proyecto_id uuid references public.proyectos(id) on delete set null,
  origen text not null default 'proyecto' check (origen in ('proyecto', 'suministro', 'manual')),
  empresa_id uuid references public.empresas(id) on delete set null,
  cliente_id uuid references public.clientes(id) on delete set null,
  titulo text not null,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'en_comparativo', 'presentada', 'aprobada', 'rechazada', 'ordenada')),
  solicitado_por uuid,
  aprobado_por uuid,
  fecha_solicitud date default current_date,
  fecha_aprobacion timestamptz,
  notas text,
  created_at timestamptz default now()
);

create table if not exists public.compras_solicitud_items (
  id uuid primary key default gen_random_uuid(),
  solicitud_id uuid not null references public.compras_solicitudes(id) on delete cascade,
  presupuesto_item_id uuid references public.presupuesto_items(id) on delete set null,
  codigo text,
  descripcion text not null,
  unidad text default 'Und',
  cantidad_presupuestada numeric default 0,
  cantidad_solicitada numeric not null default 1,
  costo_presupuestado_unit numeric default 0,
  proveedor_1_id uuid,
  precio_1 numeric,
  proveedor_2_id uuid,
  precio_2 numeric,
  proveedor_3_id uuid,
  precio_3 numeric,
  proveedor_ganador_id uuid,
  precio_ganador numeric,
  observaciones text,
  created_at timestamptz default now()
);

create table if not exists public.compras_ordenes (
  id uuid primary key default gen_random_uuid(),
  solicitud_id uuid not null references public.compras_solicitudes(id) on delete cascade,
  empresa_id uuid references public.empresas(id) on delete set null,
  proveedor_id uuid references public.proveedores(id) on delete set null,
  numero_orden text,
  tipo text not null default 'orden_compra' check (tipo in ('pre_orden', 'orden_compra')),
  subtotal numeric default 0,
  iva numeric default 0,
  retenciones numeric default 0,
  total numeric default 0,
  estado text default 'emitida',
  notas text,
  created_at timestamptz default now()
);

alter table public.compras_solicitudes enable row level security;
alter table public.compras_solicitud_items enable row level security;
alter table public.compras_ordenes enable row level security;

drop policy if exists "compras_sol_select" on public.compras_solicitudes;
create policy "compras_sol_select" on public.compras_solicitudes for select to authenticated using (true);
drop policy if exists "compras_sol_insert" on public.compras_solicitudes;
create policy "compras_sol_insert" on public.compras_solicitudes for insert to authenticated with check (true);
drop policy if exists "compras_sol_update" on public.compras_solicitudes;
create policy "compras_sol_update" on public.compras_solicitudes for update to authenticated using (true) with check (true);
drop policy if exists "compras_sol_delete" on public.compras_solicitudes;
create policy "compras_sol_delete" on public.compras_solicitudes for delete to authenticated using (public.es_super_usuario());

drop policy if exists "compras_items_select" on public.compras_solicitud_items;
create policy "compras_items_select" on public.compras_solicitud_items for select to authenticated using (true);
drop policy if exists "compras_items_insert" on public.compras_solicitud_items;
create policy "compras_items_insert" on public.compras_solicitud_items for insert to authenticated with check (true);
drop policy if exists "compras_items_update" on public.compras_solicitud_items;
create policy "compras_items_update" on public.compras_solicitud_items for update to authenticated using (true) with check (true);
drop policy if exists "compras_items_delete" on public.compras_solicitud_items;
create policy "compras_items_delete" on public.compras_solicitud_items for delete to authenticated using (public.es_super_usuario());

drop policy if exists "compras_ord_select" on public.compras_ordenes;
create policy "compras_ord_select" on public.compras_ordenes for select to authenticated using (true);
drop policy if exists "compras_ord_insert" on public.compras_ordenes;
create policy "compras_ord_insert" on public.compras_ordenes for insert to authenticated with check (true);
drop policy if exists "compras_ord_update" on public.compras_ordenes;
create policy "compras_ord_update" on public.compras_ordenes for update to authenticated using (true) with check (true);
drop policy if exists "compras_ord_delete" on public.compras_ordenes;
create policy "compras_ord_delete" on public.compras_ordenes for delete to authenticated using (public.es_super_usuario());

-- ----------------------------------------------------------------------------
-- 4. CRONOGRAMA DE PROYECTOS + OFERTAS PRE-VENTA (CRM)
-- ----------------------------------------------------------------------------
create table if not exists public.proyecto_cronograma (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  orden int default 0,
  fase text default 'ejecucion' check (fase in ('pre_inicio', 'ejecucion', 'post_finalizacion')),
  titulo text not null,
  responsable text,
  fecha_inicio date,
  fecha_fin date,
  progreso int default 0,
  estado text default 'pendiente' check (estado in ('pendiente', 'en_curso', 'completada')),
  notas text,
  created_at timestamptz default now()
);

alter table public.proyecto_cronograma enable row level security;
drop policy if exists "cronograma_select" on public.proyecto_cronograma;
create policy "cronograma_select" on public.proyecto_cronograma for select to authenticated using (true);
drop policy if exists "cronograma_insert" on public.proyecto_cronograma;
create policy "cronograma_insert" on public.proyecto_cronograma for insert to authenticated with check (true);
drop policy if exists "cronograma_update" on public.proyecto_cronograma;
create policy "cronograma_update" on public.proyecto_cronograma for update to authenticated using (true) with check (true);
drop policy if exists "cronograma_delete" on public.proyecto_cronograma;
create policy "cronograma_delete" on public.proyecto_cronograma for delete to authenticated using (public.es_super_usuario());

create table if not exists public.crm_ofertas_preventa (
  id uuid primary key default gen_random_uuid(),
  oportunidad_id uuid references public.crm_oportunidades(id) on delete set null,
  titulo text not null,
  cliente_id uuid references public.clientes(id) on delete set null,
  empresa_id uuid references public.empresas(id) on delete set null,
  responsable_id uuid references public.profiles(id) on delete set null,
  estado text not null default 'levantamiento' check (estado in ('levantamiento', 'en_proceso', 'finalizado', 'enviado_cliente')),
  prioridad text default 'media',
  valor_estimado numeric default 0,
  fecha_limite date,
  descripcion text,
  informe_levantamiento text,
  subtareas jsonb default '[]'::jsonb,
  adjuntos jsonb default '[]'::jsonb,
  historial_relevos jsonb default '[]'::jsonb,
  creado_por uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.crm_ofertas_preventa enable row level security;
drop policy if exists "ofertas_select" on public.crm_ofertas_preventa;
create policy "ofertas_select" on public.crm_ofertas_preventa for select to authenticated using (true);
drop policy if exists "ofertas_insert" on public.crm_ofertas_preventa;
create policy "ofertas_insert" on public.crm_ofertas_preventa for insert to authenticated with check (true);
drop policy if exists "ofertas_update" on public.crm_ofertas_preventa;
create policy "ofertas_update" on public.crm_ofertas_preventa for update to authenticated using (true) with check (true);
drop policy if exists "ofertas_delete" on public.crm_ofertas_preventa;
create policy "ofertas_delete" on public.crm_ofertas_preventa for delete to authenticated using (public.es_super_usuario());

alter table public.crm_oportunidades add column if not exists oferta_preventa_id uuid;
alter table public.crm_ofertas_preventa add column if not exists plazo_ejecucion text;

do $$
declare
  c_name text;
begin
  for c_name in
    select conname
    from pg_constraint
    where conrelid = 'public.crm_oportunidades'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%etapa%'
  loop
    execute format('alter table public.crm_oportunidades drop constraint if exists %I;', c_name);
  end loop;
end $$;

alter table public.crm_oportunidades
  add constraint crm_oportunidades_etapa_check
  check (etapa in ('prospecto', 'visita', 'cotizacion', 'negociacion', 'ganada', 'perdida', 'descartada', 'por_revisar'));

-- ----------------------------------------------------------------------------
-- 5. RECARGA DE ESQUEMA EN POSTGREST
-- ----------------------------------------------------------------------------
notify pgrst, 'reload schema';
