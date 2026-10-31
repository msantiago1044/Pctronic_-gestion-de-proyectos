-- ============================================================================
-- MIGRACIÓN · Seguridad y Endurecimiento RLS (Octubre 2026)
-- ----------------------------------------------------------------------------
-- 1. Corrige la escalada de privilegios en la tabla `profiles`:
--    - Los usuarios solo pueden editar su propio nombre y datos básicos.
--    - Solo los administradores pueden cambiar roles (`rol`) o editar otros perfiles.
-- 2. Asegura el bucket `documentos` (planos, contratos, pólizas):
--    - Pasa el bucket a privado (public = false).
--    - Requiere autenticación para descargar y leer documentos sensibles.
--
-- CÓMO APLICAR:
-- Supabase -> SQL Editor -> Pegar todo este script -> Click en "Run".
-- ============================================================================

-- 1. RESTRICCIÓN DE ACTUALIZACIÓN EN PERFILES (PROFILES)
drop policy if exists "authenticated_update" on public.profiles;
drop policy if exists "usuarios_update_propio_o_admin" on public.profiles;

create policy "usuarios_update_propio_o_admin" on public.profiles
  for update to authenticated
  using (
    -- Puede actualizar si es su propio registro o si es admin
    id = auth.uid() or
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.rol = 'admin')
  )
  with check (
    -- Si es admin, puede cambiar cualquier campo (incluyendo rol)
    (exists (select 1 from public.profiles p where p.id = auth.uid() and p.rol = 'admin'))
    or
    -- Si es usuario normal, solo su propio perfil y NO puede alterar su rol
    (id = auth.uid() and rol = (select p2.rol from public.profiles p2 where p2.id = auth.uid()))
  );

drop policy if exists "authenticated_delete" on public.profiles;
drop policy if exists "solo_admin_delete_profiles" on public.profiles;

create policy "solo_admin_delete_profiles" on public.profiles
  for delete to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.rol = 'admin')
  );

-- 2. PROTECCIÓN DE DOCUMENTOS PRIVADOS DEL PROYECTO
-- Asegura que el bucket de documentos no sea público para usuarios no autenticados
update storage.buckets
set public = false
where id = 'documentos';

drop policy if exists "documentos_public_read" on storage.objects;
drop policy if exists "documentos_authenticated_read" on storage.objects;

create policy "documentos_authenticated_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'documentos');

-- 3. RECARGA DE ESQUEMA EN POSTGREST
notify pgrst, 'reload schema';
