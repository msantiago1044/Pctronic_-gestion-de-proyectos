-- ============================================================================
-- MIGRACIÓN · RPCs Transaccionales, Consecutivos Atómicos y Vistas Agregadas
-- (Noviembre 2026)
-- ----------------------------------------------------------------------------
-- Script idempotente (puede ejecutarse múltiples veces sin error).
-- Incluye:
--   1. Secuencias atómicas `seq_compras_solicitud` y `seq_compras_orden` +
--      función `public.rpc_siguiente_consecutivo(p_tipo text)`.
--   2. `public.rpc_proyecto_finanzas(p_proyecto_id uuid)`: totales de
--      cd_cortado y gastado calculados en PostgreSQL.
--   3. `public.rpc_dashboard_resumen()`: conteos y sumas agregadas para
--      el dashboard (proyectos, facturas excluyendo anuladas, gastos,
--      compras pendientes y oportunidades CRM).
--   4. `public.rpc_convertir_oportunidad_a_proyecto(uuid, text, text)`:
--      conversión atómica de oportunidad CRM a proyecto + bitácora.
--   5. Hardening `SECURITY DEFINER SET search_path = public` para
--      `public.recalcular_proyecto(...)` si existe.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. SECUENCIAS Y CONSECUTIVOS ATÓMICOS PARA COMPRAS
-- ----------------------------------------------------------------------------
create sequence if not exists public.seq_compras_solicitud
  start with 1
  increment by 1
  minvalue 1;

create sequence if not exists public.seq_compras_orden
  start with 1
  increment by 1
  minvalue 1;

-- Sincroniza las secuencias con los consecutivos existentes (sin retroceder)
do $$
declare
  v_max_sol bigint := 0;
  v_max_ord bigint := 0;
  v_last bigint;
  v_called boolean;
begin
  select coalesce(max((regexp_match(numero, '(\d+)$'))[1]::bigint), 0)
  into v_max_sol
  from public.compras_solicitudes
  where numero ~ '\d+$';

  select last_value, is_called
  into v_last, v_called
  from public.seq_compras_solicitud;

  if v_max_sol > 0 and (not v_called or v_last < v_max_sol) then
    perform setval('public.seq_compras_solicitud', v_max_sol, true);
  end if;

  select coalesce(max((regexp_match(numero_orden, '(\d+)$'))[1]::bigint), 0)
  into v_max_ord
  from public.compras_ordenes
  where numero_orden ~ '\d+$';

  select last_value, is_called
  into v_last, v_called
  from public.seq_compras_orden;

  if v_max_ord > 0 and (not v_called or v_last < v_max_ord) then
    perform setval('public.seq_compras_orden', v_max_ord, true);
  end if;
end $$;

create or replace function public.rpc_siguiente_consecutivo(p_tipo text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tipo text := lower(trim(coalesce(p_tipo, '')));
  v_num bigint;
  v_prefijo text;
  v_anio text := to_char(current_date, 'YYYY');
  v_seq_txt text;
begin
  if auth.role() <> 'authenticated' and current_user not in ('postgres', 'service_role') then
    raise exception 'No autenticado';
  end if;

  if v_tipo in ('solicitud', 'sol') then
    v_prefijo := 'SOL';
    v_num := nextval('public.seq_compras_solicitud');
  elsif v_tipo in ('orden', 'orden_compra', 'oc') then
    v_prefijo := 'OC';
    v_num := nextval('public.seq_compras_orden');
  elsif v_tipo in ('pre_orden', 'pre') then
    v_prefijo := 'PRE';
    v_num := nextval('public.seq_compras_orden');
  else
    raise exception 'Tipo de consecutivo no válido: %', p_tipo;
  end if;

  v_seq_txt := case
    when v_num < 10000 then lpad(v_num::text, 4, '0')
    else v_num::text
  end;

  return v_prefijo || '-' || v_anio || '-' || v_seq_txt;
end;
$$;

-- ----------------------------------------------------------------------------
-- 2. FINANZAS AGREGADAS POR PROYECTO
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
  where c.proyecto_id = p_proyecto_id;

  select coalesce(sum(g.valor_total), 0)
  into v_gastado
  from public.gastos g
  where g.proyecto_id = p_proyecto_id;

  return jsonb_build_object(
    'cd_cortado', v_cd_cortado,
    'gastado', v_gastado
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- 3. RESUMEN AGREGADO DEL DASHBOARD
-- ----------------------------------------------------------------------------
create or replace function public.rpc_dashboard_resumen()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_proyectos jsonb;
  v_facturas jsonb;
  v_gastos jsonb;
  v_compras jsonb;
  v_crm jsonb;
begin
  if auth.role() <> 'authenticated' and current_user not in ('postgres', 'service_role') then
    raise exception 'No autenticado';
  end if;

  select jsonb_build_object(
    'total', count(*),
    'sin_iniciar', count(*) filter (where estado = 'sin_iniciar'),
    'en_curso', count(*) filter (where estado = 'en_curso'),
    'detenidos', count(*) filter (where estado = 'detenido'),
    'finalizados', count(*) filter (where estado = 'finalizado'),
    'valor_total', coalesce(sum(valor_total), 0),
    'valor_ingreso', coalesce(sum(valor_ingreso), 0),
    'valor_antes_impuestos', coalesce(sum(valor_antes_impuestos), 0)
  )
  into v_proyectos
  from public.proyectos;

  select jsonb_build_object(
    'total', count(*),
    'valor_total', coalesce(sum(valor), 0),
    'pagadas_count', count(*) filter (where estado = 'pagada'),
    'pagadas_valor', coalesce(sum(valor) filter (where estado = 'pagada'), 0),
    'pendientes_count', count(*) filter (where estado in ('pendiente', 'vencida')),
    'pendientes_valor', coalesce(sum(valor) filter (where estado in ('pendiente', 'vencida')), 0),
    'vencidas_count', count(*) filter (where estado = 'vencida'),
    'vencidas_valor', coalesce(sum(valor) filter (where estado = 'vencida'), 0)
  )
  into v_facturas
  from public.facturas
  where estado <> 'anulada';

  select jsonb_build_object(
    'total', count(*),
    'valor_total', coalesce(sum(valor_total), 0)
  )
  into v_gastos
  from public.gastos;

  select jsonb_build_object(
    'total', count(*),
    'pendientes', count(*) filter (where estado in ('pendiente', 'en_comparativo', 'presentada')),
    'aprobadas', count(*) filter (where estado = 'aprobada'),
    'ordenadas', count(*) filter (where estado = 'ordenada')
  )
  into v_compras
  from public.compras_solicitudes;

  select jsonb_build_object(
    'total', count(*),
    'activas', count(*) filter (where etapa not in ('ganada', 'perdida', 'descartada')),
    'ganadas', count(*) filter (where etapa = 'ganada'),
    'perdidas', count(*) filter (where etapa in ('perdida', 'descartada')),
    'valor_pipeline', coalesce(sum(valor_estimado) filter (where etapa not in ('ganada', 'perdida', 'descartada')), 0),
    'valor_ganado', coalesce(sum(valor_estimado) filter (where etapa = 'ganada'), 0)
  )
  into v_crm
  from public.crm_oportunidades;

  return jsonb_build_object(
    'proyectos', v_proyectos,
    'facturas', v_facturas,
    'gastos', v_gastos,
    'compras_pendientes', v_compras,
    'crm_oportunidades', v_crm
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. CONVERSIÓN TRANSACCIONAL DE OPORTUNIDAD CRM A PROYECTO
-- ----------------------------------------------------------------------------
create or replace function public.rpc_convertir_oportunidad_a_proyecto(
  p_oportunidad_id uuid,
  p_nombre text default null,
  p_codigo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_op public.crm_oportunidades%rowtype;
  v_proyecto_id uuid;
  v_nombre text;
  v_codigo text;
begin
  if not public.tiene_acceso_escritura() and current_user not in ('postgres', 'service_role') then
    raise exception 'Sin permisos para convertir oportunidades';
  end if;

  select *
  into v_op
  from public.crm_oportunidades
  where id = p_oportunidad_id
  for update;

  if not found then
    raise exception 'Oportunidad no encontrada: %', p_oportunidad_id;
  end if;

  if v_op.proyecto_id is not null then
    return jsonb_build_object(
      'proyecto_id', v_op.proyecto_id,
      'oportunidad_id', p_oportunidad_id,
      'ya_existia', true
    );
  end if;

  v_nombre := coalesce(nullif(trim(p_nombre), ''), v_op.titulo);
  v_codigo := nullif(trim(p_codigo), '');

  insert into public.proyectos (
    nombre,
    numero_contrato,
    cliente_id,
    empresa_id,
    valor_antes_impuestos,
    estado,
    fecha_inicio,
    fecha_fin_estimada,
    created_by,
    tipo_contrato
  )
  values (
    v_nombre,
    v_codigo,
    v_op.cliente_id,
    v_op.empresa_id,
    coalesce(nullif(v_op.valor_estimado, 0), v_op.costo_estimado, 0),
    'sin_iniciar',
    current_date,
    v_op.fecha_cierre_estimada,
    auth.uid(),
    'aiu'
  )
  returning id into v_proyecto_id;

  update public.crm_oportunidades
  set proyecto_id = v_proyecto_id,
      etapa = 'ganada',
      probabilidad = 100,
      updated_at = now()
  where id = p_oportunidad_id;

  insert into public.crm_actividades (
    oportunidad_id,
    tipo,
    titulo,
    descripcion,
    creado_por
  )
  values (
    p_oportunidad_id,
    'tarea',
    'Convertida en Proyecto Operativo',
    'Se creó el proyecto en la plataforma con ID: ' || v_proyecto_id::text ||
      coalesce(' (Código: ' || v_codigo || ')', '') || '.',
    auth.uid()
  );

  return jsonb_build_object(
    'proyecto_id', v_proyecto_id,
    'oportunidad_id', p_oportunidad_id,
    'ya_existia', false
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. HARDENING DE public.recalcular_proyecto() SI EXISTE
-- ----------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select p.oid, p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'recalcular_proyecto'
  loop
    execute format(
      'alter function public.%I(%s) security definer set search_path = public;',
      r.proname,
      r.args
    );
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 6. PERMISOS DE EJECUCIÓN Y RECARGA DE ESQUEMA
-- ----------------------------------------------------------------------------
revoke all on function public.rpc_siguiente_consecutivo(text) from public, anon;
grant execute on function public.rpc_siguiente_consecutivo(text) to authenticated;

revoke all on function public.rpc_proyecto_finanzas(uuid) from public, anon;
grant execute on function public.rpc_proyecto_finanzas(uuid) to authenticated;

revoke all on function public.rpc_dashboard_resumen() from public, anon;
grant execute on function public.rpc_dashboard_resumen() to authenticated;

revoke all on function public.rpc_convertir_oportunidad_a_proyecto(uuid, text, text) from public, anon;
grant execute on function public.rpc_convertir_oportunidad_a_proyecto(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';
