-- ============================================================================
-- MIGRACIÓN · CRM Comercial (Octubre 2026)
-- ----------------------------------------------------------------------------
-- Crea las tablas del CRM Comercial estilo Asana para Pctronic:
-- 1. `crm_oportunidades`: Oportunidades y cotizaciones en el embudo comercial.
-- 2. `crm_actividades`: Bitácora y seguimiento (llamadas, minutas, visitas, notas).
-- Permite convertir en 1 clic una oportunidad ganada en un Proyecto operativo.
--
-- CÓMO APLICAR:
-- Supabase -> SQL Editor -> Pegar este script -> Click en "Run".
-- ============================================================================

-- 1. TABLA DE OPORTUNIDADES COMERCIALES
create table if not exists public.crm_oportunidades (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  cliente_id uuid references public.clientes(id) on delete set null,
  contacto_id uuid references public.clientes_contactos(id) on delete set null,
  empresa_id uuid references public.empresas(id) on delete set null,
  responsable_id uuid references public.profiles(id) on delete set null,
  etapa text not null default 'prospecto' check (etapa in ('prospecto', 'visita', 'cotizacion', 'negociacion', 'ganada', 'perdida')),
  tipo_servicio text not null default 'cctv' check (tipo_servicio in ('cctv', 'control_acceso', 'incendio', 'cableado', 'alarmas', 'integral', 'otro')),
  prioridad text not null default 'media' check (prioridad in ('baja', 'media', 'alta', 'urgente')),
  valor_estimado numeric(15,2) not null default 0,
  costo_estimado numeric(15,2) not null default 0,
  probabilidad integer not null default 20 check (probabilidad >= 0 and probabilidad <= 100),
  fecha_cierre_estimada date,
  descripcion text,
  motivo_perdida text,
  proyecto_id uuid references public.proyectos(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. TABLA DE ACTIVIDADES Y SEGUIMIENTO (BITÁCORA)
create table if not exists public.crm_actividades (
  id uuid primary key default gen_random_uuid(),
  oportunidad_id uuid not null references public.crm_oportunidades(id) on delete cascade,
  tipo text not null default 'nota' check (tipo in ('nota', 'llamada', 'reunion', 'visita', 'correo', 'tarea')),
  titulo text not null,
  descripcion text,
  completada boolean not null default true,
  creado_por uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- 3. ÍNDICES DE RENDIMIENTO
create index if not exists idx_crm_oportunidades_etapa on public.crm_oportunidades(etapa);
create index if not exists idx_crm_oportunidades_cliente on public.crm_oportunidades(cliente_id);
create index if not exists idx_crm_oportunidades_responsable on public.crm_oportunidades(responsable_id);
create index if not exists idx_crm_actividades_oportunidad on public.crm_actividades(oportunidad_id);

-- 4. POLÍTICAS DE SEGURIDAD RLS
alter table public.crm_oportunidades enable row level security;
alter table public.crm_actividades enable row level security;

drop policy if exists "crm_oportunidades_authenticated_select" on public.crm_oportunidades;
create policy "crm_oportunidades_authenticated_select" on public.crm_oportunidades for select to authenticated using (true);

drop policy if exists "crm_oportunidades_authenticated_insert" on public.crm_oportunidades;
create policy "crm_oportunidades_authenticated_insert" on public.crm_oportunidades for insert to authenticated with check (true);

drop policy if exists "crm_oportunidades_authenticated_update" on public.crm_oportunidades;
create policy "crm_oportunidades_authenticated_update" on public.crm_oportunidades for update to authenticated using (true) with check (true);

drop policy if exists "crm_oportunidades_authenticated_delete" on public.crm_oportunidades;
create policy "crm_oportunidades_authenticated_delete" on public.crm_oportunidades for delete to authenticated using (true);

drop policy if exists "crm_actividades_authenticated_select" on public.crm_actividades;
create policy "crm_actividades_authenticated_select" on public.crm_actividades for select to authenticated using (true);

drop policy if exists "crm_actividades_authenticated_insert" on public.crm_actividades;
create policy "crm_actividades_authenticated_insert" on public.crm_actividades for insert to authenticated with check (true);

drop policy if exists "crm_actividades_authenticated_update" on public.crm_actividades;
create policy "crm_actividades_authenticated_update" on public.crm_actividades for update to authenticated using (true) with check (true);

drop policy if exists "crm_actividades_authenticated_delete" on public.crm_actividades;
create policy "crm_actividades_authenticated_delete" on public.crm_actividades for delete to authenticated using (true);

-- 5. RECARGA DEL ESQUEMA EN POSTGREST
notify pgrst, 'reload schema';
