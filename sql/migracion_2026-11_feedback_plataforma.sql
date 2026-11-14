-- ============================================================================
-- MIGRACIÓN · Módulo de Feedback de Plataforma y Anotaciones Super Admin
-- ----------------------------------------------------------------------------
-- Script idempotente (puede ejecutarse múltiples veces sin error).
-- Crea la tabla public.feedback_plataforma, índices, trigger updated_at y RLS:
--   - INSERT: cualquier usuario autenticado con acceso de escritura (su propio registro).
--   - SELECT / UPDATE / DELETE: únicamente Super Usuario (public.es_super_usuario()).
-- ============================================================================

create table if not exists public.feedback_plataforma (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid references public.profiles(id) on delete set null default auth.uid(),
  usuario_nombre text not null default '',
  usuario_email text not null default '',
  usuario_rol text not null default '',
  pagina text not null default '',
  url text not null default '',
  tipo text not null default 'mejora' check (tipo in ('mejora', 'comentario', 'error')),
  prioridad text not null default 'media' check (prioridad in ('baja', 'media', 'alta')),
  titulo text not null default '',
  mensaje text not null,
  estado text not null default 'nuevo' check (estado in ('nuevo', 'en_revision', 'resuelto', 'descartado')),
  notas_admin text not null default '',
  revisado_por uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_feedback_plataforma_created_at
  on public.feedback_plataforma (created_at desc);

create index if not exists idx_feedback_plataforma_estado
  on public.feedback_plataforma (estado);

create or replace function public.feedback_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_feedback_plataforma_updated_at on public.feedback_plataforma;
create trigger trg_feedback_plataforma_updated_at
  before update on public.feedback_plataforma
  for each row execute function public.feedback_set_updated_at();

alter table public.feedback_plataforma enable row level security;

drop policy if exists "feedback_insert_authenticated" on public.feedback_plataforma;
create policy "feedback_insert_authenticated" on public.feedback_plataforma
  for insert to authenticated
  with check (
    public.tiene_acceso_escritura()
    and (usuario_id is null or usuario_id = auth.uid())
  );

drop policy if exists "feedback_select_super" on public.feedback_plataforma;
create policy "feedback_select_super" on public.feedback_plataforma
  for select to authenticated
  using (public.es_super_usuario());

drop policy if exists "feedback_update_super" on public.feedback_plataforma;
create policy "feedback_update_super" on public.feedback_plataforma
  for update to authenticated
  using (public.es_super_usuario())
  with check (public.es_super_usuario());

drop policy if exists "feedback_delete_super" on public.feedback_plataforma;
create policy "feedback_delete_super" on public.feedback_plataforma
  for delete to authenticated
  using (public.es_super_usuario());

notify pgrst, 'reload schema';
