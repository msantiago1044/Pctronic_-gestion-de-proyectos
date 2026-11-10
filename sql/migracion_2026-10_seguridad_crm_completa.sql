-- ============================================================================
-- MIGRACIÓN · Seguridad RLS y Mejoras CRM Comercial (Octubre 2026)
-- ----------------------------------------------------------------------------
-- Esta migración aplica los ajustes críticos de seguridad y robustez:
-- 1. Añade columnas de contacto directo y teléfono a `crm_oportunidades`.
-- 2. Permite a usuarios autenticados crear proyectos si created_by = auth.uid() o rol = 'admin'.
-- 3. Protege la tabla `profiles` para que en INSERT los usuarios no administradores
--    no puedan asignarse a sí mismos el rol 'admin'.
-- 4. Restringe el borrado (DELETE) en tablas sensibles únicamente a usuarios 'admin':
--    gastos, facturas, compras, cortes_cliente, cortes_mo, empresas, clientes.
--
-- CÓMO APLICAR:
-- 1. Abre el panel de tu proyecto en Supabase (https://supabase.com/dashboard).
-- 2. Dirígete a la sección "SQL Editor" en el menú lateral izquierdo.
-- 3. Pega todo el contenido de este script y haz clic en "Run".
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. MEJORAS CRM: COLUMNAS DE CONTACTO Y TELÉFONO
-- ----------------------------------------------------------------------------
alter table public.crm_oportunidades add column if not exists contacto_nombre text;
alter table public.crm_oportunidades add column if not exists contacto_telefono text;

-- ----------------------------------------------------------------------------
-- 2. RLS PROYECTOS: PERMISOS PARA INSERTAR
-- ----------------------------------------------------------------------------
-- Permite insertar proyectos si el usuario se asigna como creador o si es administrador.
drop policy if exists "solo_admin_insert_proyectos" on public.proyectos;
drop policy if exists "authenticated_insert" on public.proyectos;
drop policy if exists "proyectos_insert_policy" on public.proyectos;

create policy "proyectos_insert_policy" on public.proyectos
  for insert to authenticated
  with check (
    created_by = auth.uid() or
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.rol = 'admin')
  );

-- ----------------------------------------------------------------------------
-- 3. RLS PROFILES: SEGURIDAD EN INSERT
-- ----------------------------------------------------------------------------
-- Garantiza que un usuario no administrador no pueda registrar un perfil con rol 'admin'.
drop policy if exists "authenticated_insert" on public.profiles;
drop policy if exists "profiles_insert_policy" on public.profiles;

create policy "profiles_insert_policy" on public.profiles
  for insert to authenticated
  with check (
    -- Si es administrador, puede crear cualquier perfil
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.rol = 'admin')
    or
    -- Si es un usuario nuevo registrándose, solo su propio UID y con rol distinto de admin (o default 'miembro')
    (id = auth.uid() and coalesce(rol, 'miembro') <> 'admin')
  );

-- ----------------------------------------------------------------------------
-- 4. RESTRICCIÓN DE BORRADO (DELETE) EN TABLAS CRÍTICAS
-- ----------------------------------------------------------------------------
-- Eliminar políticas abiertas 'authenticated_delete' y restringir a solo administradores.
do $$
declare
  t text;
begin
  for t in select unnest(array[
    'gastos', 'facturas', 'compras', 'cortes_cliente', 'cortes_mo', 'empresas', 'clientes'
  ])
  loop
    execute format('drop policy if exists "authenticated_delete" on public.%I;', t);
    execute format('drop policy if exists "solo_admin_delete_%s" on public.%I;', t, t);
    execute format(
      'create policy "solo_admin_delete_%s" on public.%I for delete to authenticated using (' ||
      '  exists (select 1 from public.profiles p where p.id = auth.uid() and p.rol = ''admin'')' ||
      ');',
      t, t
    );
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 5. NOTIFICAR RECARGA DE ESQUEMA EN POSTGREST
-- ----------------------------------------------------------------------------
notify pgrst, 'reload schema';
