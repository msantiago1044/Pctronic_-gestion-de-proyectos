-- ============================================================================
-- MIGRACIÓN · Seguridad RLS, Storage, Índices, Triggers y Checks (Noviembre 2026)
-- ----------------------------------------------------------------------------
-- Script idempotente (puede ejecutarse múltiples veces sin error).
-- 1. Asegura funciones helper public.es_super_usuario() y public.tiene_acceso_escritura().
-- 2. Actualiza políticas RLS heredadas que usaban rol = 'admin' a public.es_super_usuario().
-- 3. Restringe DELETE a public.es_super_usuario() en tablas críticas y operativas.
-- 4. Restringe INSERT / UPDATE mediante public.tiene_acceso_escritura() en lugar de true.
-- 5. Asegura políticas de storage.objects para avatars, logos y documentos.
-- 6. Crea índices en claves foráneas frecuentes.
-- 7. Agrega trigger BEFORE UPDATE de updated_at en crm_oportunidades y crm_ofertas_preventa.
-- 8. Agrega CHECK constraints seguros en porcentajes de retención.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. FUNCIONES DE SEGURIDAD
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

-- ----------------------------------------------------------------------------
-- 2. ACTUALIZAR POLÍTICAS RLS DE PROFILES Y PROYECTOS (sin rol = 'admin')
-- ----------------------------------------------------------------------------
drop policy if exists "authenticated_insert" on public.profiles;
drop policy if exists "profiles_insert_policy" on public.profiles;
create policy "profiles_insert_policy" on public.profiles
  for insert to authenticated
  with check (
    public.es_super_usuario()
    or (id = auth.uid() and coalesce(rol, 'proyectos') not in ('super_usuario', 'admin'))
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
drop policy if exists "solo_super_delete_profiles" on public.profiles;
create policy "solo_super_delete_profiles" on public.profiles
  for delete to authenticated
  using (public.es_super_usuario());

drop policy if exists "solo_admin_insert_proyectos" on public.proyectos;
drop policy if exists "authenticated_insert" on public.proyectos;
drop policy if exists "proyectos_insert_policy" on public.proyectos;
create policy "proyectos_insert_policy" on public.proyectos
  for insert to authenticated
  with check (
    (created_by = auth.uid() and public.tiene_acceso_escritura())
    or public.es_super_usuario()
  );

drop policy if exists "authenticated_update" on public.proyectos;
drop policy if exists "proyectos_update_policy" on public.proyectos;
create policy "proyectos_update_policy" on public.proyectos
  for update to authenticated
  using (public.tiene_acceso_escritura())
  with check (public.tiene_acceso_escritura());

-- ----------------------------------------------------------------------------
-- 3. RESTRICCIÓN DE BORRADO (DELETE) A SUPER USUARIO
-- ----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  for t in select unnest(array[
    'gastos', 'facturas', 'compras', 'cortes_cliente', 'cortes_mo', 'empresas', 'clientes',
    'proyectos', 'presupuesto_items', 'documentos', 'avance_registros', 'avance_items',
    'crm_oportunidades', 'crm_actividades', 'suministros', 'terceros_contactos', 'terceros',
    'proyecto_cronograma', 'compras_solicitudes', 'compras_solicitud_items', 'compras_ordenes'
  ])
  loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists "authenticated_delete" on public.%I;', t);
      execute format('drop policy if exists "solo_admin_delete_%s" on public.%I;', t, t);
      execute format('drop policy if exists "solo_super_delete_%s" on public.%I;', t, t);
      execute format('drop policy if exists "%s_authenticated_delete" on public.%I;', t, t);
      execute format(
        'create policy "solo_super_delete_%s" on public.%I for delete to authenticated using (public.es_super_usuario());',
        t, t
      );
    end if;
  end loop;
end $$;

-- Eliminar políticas DELETE específicas heredadas por nombre distinto
drop policy if exists "terceros_super_delete" on public.terceros;
drop policy if exists "terceros_contactos_auth_delete" on public.terceros_contactos;
drop policy if exists "cronograma_delete" on public.proyecto_cronograma;
drop policy if exists "compras_sol_delete" on public.compras_solicitudes;
drop policy if exists "compras_items_delete" on public.compras_solicitud_items;
drop policy if exists "compras_ord_delete" on public.compras_ordenes;

-- ----------------------------------------------------------------------------
-- 4. RESTRICCIÓN DE INSERT / UPDATE CON public.tiene_acceso_escritura()
-- ----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  for t in select unnest(array[
    'empresas', 'clientes', 'clientes_contactos', 'proveedores', 'proveedores_contactos',
    'contratistas', 'tarifas_tecnicos', 'presupuesto_items', 'facturas', 'compras',
    'proyecto_contratistas', 'cortes_pago', 'avance_registros', 'avance_items',
    'cortes_cliente', 'cortes_cliente_items', 'cortes_mo', 'cortes_mo_items',
    'registro_mo_propia', 'gastos', 'cronograma_actividades', 'documentos', 'suministros'
  ])
  loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists "authenticated_insert" on public.%I;', t);
      execute format('drop policy if exists "escritura_insert_%s" on public.%I;', t, t);
      execute format(
        'create policy "escritura_insert_%s" on public.%I for insert to authenticated with check (public.tiene_acceso_escritura());',
        t, t
      );

      execute format('drop policy if exists "authenticated_update" on public.%I;', t);
      execute format('drop policy if exists "escritura_update_%s" on public.%I;', t, t);
      execute format(
        'create policy "escritura_update_%s" on public.%I for update to authenticated using (public.tiene_acceso_escritura()) with check (public.tiene_acceso_escritura());',
        t, t
      );
    end if;
  end loop;
end $$;

-- Políticas INSERT / UPDATE para CRM, Terceros, Cronograma y Compras Operativas
do $$
begin
  if to_regclass('public.crm_oportunidades') is not null then
    drop policy if exists "crm_oportunidades_authenticated_insert" on public.crm_oportunidades;
    create policy "crm_oportunidades_authenticated_insert" on public.crm_oportunidades
      for insert to authenticated with check (public.tiene_acceso_escritura());
    drop policy if exists "crm_oportunidades_authenticated_update" on public.crm_oportunidades;
    create policy "crm_oportunidades_authenticated_update" on public.crm_oportunidades
      for update to authenticated using (public.tiene_acceso_escritura()) with check (public.tiene_acceso_escritura());
  end if;

  if to_regclass('public.crm_actividades') is not null then
    drop policy if exists "crm_actividades_authenticated_insert" on public.crm_actividades;
    create policy "crm_actividades_authenticated_insert" on public.crm_actividades
      for insert to authenticated with check (public.tiene_acceso_escritura());
    drop policy if exists "crm_actividades_authenticated_update" on public.crm_actividades;
    create policy "crm_actividades_authenticated_update" on public.crm_actividades
      for update to authenticated using (public.tiene_acceso_escritura()) with check (public.tiene_acceso_escritura());
  end if;

  if to_regclass('public.crm_ofertas_preventa') is not null then
    drop policy if exists "ofertas_insert" on public.crm_ofertas_preventa;
    create policy "ofertas_insert" on public.crm_ofertas_preventa
      for insert to authenticated with check (public.tiene_acceso_escritura());
    drop policy if exists "ofertas_update" on public.crm_ofertas_preventa;
    create policy "ofertas_update" on public.crm_ofertas_preventa
      for update to authenticated using (public.tiene_acceso_escritura()) with check (public.tiene_acceso_escritura());
  end if;

  if to_regclass('public.terceros') is not null then
    drop policy if exists "terceros_auth_insert" on public.terceros;
    create policy "terceros_auth_insert" on public.terceros
      for insert to authenticated with check (public.tiene_acceso_escritura());
    drop policy if exists "terceros_auth_update" on public.terceros;
    create policy "terceros_auth_update" on public.terceros
      for update to authenticated using (public.tiene_acceso_escritura()) with check (public.tiene_acceso_escritura());
  end if;

  if to_regclass('public.terceros_contactos') is not null then
    drop policy if exists "terceros_contactos_auth_insert" on public.terceros_contactos;
    create policy "terceros_contactos_auth_insert" on public.terceros_contactos
      for insert to authenticated with check (public.tiene_acceso_escritura());
    drop policy if exists "terceros_contactos_auth_update" on public.terceros_contactos;
    create policy "terceros_contactos_auth_update" on public.terceros_contactos
      for update to authenticated using (public.tiene_acceso_escritura()) with check (public.tiene_acceso_escritura());
  end if;

  if to_regclass('public.proyecto_cronograma') is not null then
    drop policy if exists "cronograma_insert" on public.proyecto_cronograma;
    create policy "cronograma_insert" on public.proyecto_cronograma
      for insert to authenticated with check (public.tiene_acceso_escritura());
    drop policy if exists "cronograma_update" on public.proyecto_cronograma;
    create policy "cronograma_update" on public.proyecto_cronograma
      for update to authenticated using (public.tiene_acceso_escritura()) with check (public.tiene_acceso_escritura());
  end if;

  if to_regclass('public.compras_solicitudes') is not null then
    drop policy if exists "compras_sol_insert" on public.compras_solicitudes;
    create policy "compras_sol_insert" on public.compras_solicitudes
      for insert to authenticated with check (public.tiene_acceso_escritura());
    drop policy if exists "compras_sol_update" on public.compras_solicitudes;
    create policy "compras_sol_update" on public.compras_solicitudes
      for update to authenticated using (public.tiene_acceso_escritura()) with check (public.tiene_acceso_escritura());
  end if;

  if to_regclass('public.compras_solicitud_items') is not null then
    drop policy if exists "compras_items_insert" on public.compras_solicitud_items;
    create policy "compras_items_insert" on public.compras_solicitud_items
      for insert to authenticated with check (public.tiene_acceso_escritura());
    drop policy if exists "compras_items_update" on public.compras_solicitud_items;
    create policy "compras_items_update" on public.compras_solicitud_items
      for update to authenticated using (public.tiene_acceso_escritura()) with check (public.tiene_acceso_escritura());
  end if;

  if to_regclass('public.compras_ordenes') is not null then
    drop policy if exists "compras_ord_insert" on public.compras_ordenes;
    create policy "compras_ord_insert" on public.compras_ordenes
      for insert to authenticated with check (public.tiene_acceso_escritura());
    drop policy if exists "compras_ord_update" on public.compras_ordenes;
    create policy "compras_ord_update" on public.compras_ordenes
      for update to authenticated using (public.tiene_acceso_escritura()) with check (public.tiene_acceso_escritura());
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 5. SEGURIDAD EN STORAGE (storage.objects)
-- ----------------------------------------------------------------------------
-- Avatars: solo el propietario (carpeta {uid}/...) o super_usuario puede escribir/borrar
drop policy if exists "avatars_authenticated_write" on storage.objects;
create policy "avatars_authenticated_write" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.es_super_usuario())
  );

drop policy if exists "avatars_authenticated_update" on storage.objects;
create policy "avatars_authenticated_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.es_super_usuario())
  )
  with check (
    bucket_id = 'avatars'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.es_super_usuario())
  );

drop policy if exists "avatars_authenticated_delete" on storage.objects;
create policy "avatars_authenticated_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.es_super_usuario())
  );

-- Logos: solo super_usuario puede crear, actualizar o borrar
drop policy if exists "logos_authenticated_write" on storage.objects;
create policy "logos_authenticated_write" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'logos' and public.es_super_usuario());

drop policy if exists "logos_authenticated_update" on storage.objects;
create policy "logos_authenticated_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'logos' and public.es_super_usuario())
  with check (bucket_id = 'logos' and public.es_super_usuario());

drop policy if exists "logos_authenticated_delete" on storage.objects;
create policy "logos_authenticated_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'logos' and public.es_super_usuario());

-- Documentos: escritura para usuarios autorizados, borrado solo super_usuario
drop policy if exists "documentos_authenticated_write" on storage.objects;
create policy "documentos_authenticated_write" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documentos' and public.tiene_acceso_escritura());

drop policy if exists "documentos_authenticated_update" on storage.objects;
create policy "documentos_authenticated_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'documentos' and public.tiene_acceso_escritura())
  with check (bucket_id = 'documentos' and public.tiene_acceso_escritura());

drop policy if exists "documentos_authenticated_delete" on storage.objects;
create policy "documentos_authenticated_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'documentos' and public.es_super_usuario());

-- ----------------------------------------------------------------------------
-- 6. ÍNDICES DE RENDIMIENTO EN CLAVES FORÁNEAS
-- ----------------------------------------------------------------------------
create index if not exists idx_cortes_cliente_items_presupuesto_item
  on public.cortes_cliente_items (presupuesto_item_id);

create index if not exists idx_cortes_mo_items_presupuesto_item
  on public.cortes_mo_items (presupuesto_item_id);

create index if not exists idx_facturas_proyecto
  on public.facturas (proyecto_id);

create index if not exists idx_compras_proyecto
  on public.compras (proyecto_id);

create index if not exists idx_documentos_proyecto
  on public.documentos (proyecto_id);

create index if not exists idx_proyecto_cronograma_proyecto
  on public.proyecto_cronograma (proyecto_id);

create index if not exists idx_compras_solicitud_items_solicitud
  on public.compras_solicitud_items (solicitud_id);

create index if not exists idx_compras_ordenes_solicitud
  on public.compras_ordenes (solicitud_id);

-- ----------------------------------------------------------------------------
-- 7. TRIGGER BEFORE UPDATE PARA updated_at
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
begin
  if to_regclass('public.crm_oportunidades') is not null then
    drop trigger if exists trg_crm_oportunidades_updated_at on public.crm_oportunidades;
    create trigger trg_crm_oportunidades_updated_at
      before update on public.crm_oportunidades
      for each row execute function public.set_updated_at();
  end if;

  if to_regclass('public.crm_ofertas_preventa') is not null then
    drop trigger if exists trg_crm_ofertas_preventa_updated_at on public.crm_ofertas_preventa;
    create trigger trg_crm_ofertas_preventa_updated_at
      before update on public.crm_ofertas_preventa
      for each row execute function public.set_updated_at();
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 8. CHECK CONSTRAINTS SEGUROS
-- ----------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.terceros') is not null
     and not exists (select 1 from pg_constraint where conname = 'terceros_porcentaje_retencion_check')
     and not exists (select 1 from public.terceros where porcentaje_retencion < 0 or porcentaje_retencion > 100) then
    alter table public.terceros
      add constraint terceros_porcentaje_retencion_check
      check (porcentaje_retencion >= 0 and porcentaje_retencion <= 100);
  end if;

  if to_regclass('public.proveedores') is not null
     and not exists (select 1 from pg_constraint where conname = 'proveedores_porcentaje_retencion_check')
     and not exists (select 1 from public.proveedores where porcentaje_retencion < 0 or porcentaje_retencion > 100) then
    alter table public.proveedores
      add constraint proveedores_porcentaje_retencion_check
      check (porcentaje_retencion >= 0 and porcentaje_retencion <= 100);
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 9. RECARGA DE ESQUEMA EN POSTGREST
-- ----------------------------------------------------------------------------
notify pgrst, 'reload schema';
