-- ============================================================================
-- ELIMINAR TODOS LOS DATOS Y ESCENARIOS DE PRUEBA ([PRUEBA])
-- ----------------------------------------------------------------------------
-- Borra de forma segura TODOS los registros creados por sql/seed_datos_prueba.sql
-- (UUIDs con prefijo aaaaaaaa-0000-4000-8000-...) y cualquier escenario/proyecto
-- de prueba etiquetado con [PRUEBA] o CTO-PRU- / SOL-PRU- / FE-PRU-.
-- NO toca datos reales de producción.
-- ============================================================================

begin;

-- 1. Notificaciones de prueba (si la tabla existe)
do $$
begin
  if to_regclass('public.notificaciones') is not null then
    delete from public.notificaciones
    where id::text like 'aaaaaaaa-0000-4000-8000-%'
       or proyecto_id::text like 'aaaaaaaa-0000-4000-8000-%'
       or titulo ilike '%[PRUEBA]%'
       or proyecto_id in (
         select id from public.proyectos
         where nombre ilike '[PRUEBA]%'
            or numero_contrato ilike 'CTO-PRU-%'
       );
  end if;
end $$;

-- 2. Documentos, facturas, cortes, gastos, mano de obra, avance y cronograma de proyectos de prueba
delete from public.documentos
where id::text like 'aaaaaaaa-0000-4000-8000-%'
   or proyecto_id::text like 'aaaaaaaa-0000-4000-8000-%'
   or proyecto_id in (
     select id from public.proyectos
     where nombre ilike '[PRUEBA]%' or numero_contrato ilike 'CTO-PRU-%'
   );

delete from public.facturas
where id::text like 'aaaaaaaa-0000-4000-8000-%'
   or numero_factura ilike 'FE-PRU-%'
   or proyecto_id::text like 'aaaaaaaa-0000-4000-8000-%'
   or proyecto_id in (
     select id from public.proyectos
     where nombre ilike '[PRUEBA]%' or numero_contrato ilike 'CTO-PRU-%'
   );

delete from public.cortes_cliente_items
where id::text like 'aaaaaaaa-0000-4000-8000-%'
   or corte_id in (
     select id from public.cortes_cliente
     where id::text like 'aaaaaaaa-0000-4000-8000-%'
        or proyecto_id::text like 'aaaaaaaa-0000-4000-8000-%'
        or proyecto_id in (
          select id from public.proyectos
          where nombre ilike '[PRUEBA]%' or numero_contrato ilike 'CTO-PRU-%'
        )
   );

delete from public.cortes_cliente
where id::text like 'aaaaaaaa-0000-4000-8000-%'
   or proyecto_id::text like 'aaaaaaaa-0000-4000-8000-%'
   or proyecto_id in (
     select id from public.proyectos
     where nombre ilike '[PRUEBA]%' or numero_contrato ilike 'CTO-PRU-%'
   );

delete from public.gastos
where id::text like 'aaaaaaaa-0000-4000-8000-%'
   or proyecto_id::text like 'aaaaaaaa-0000-4000-8000-%'
   or proyecto_id in (
     select id from public.proyectos
     where nombre ilike '[PRUEBA]%' or numero_contrato ilike 'CTO-PRU-%'
   );

delete from public.registro_mo_propia
where id::text like 'aaaaaaaa-0000-4000-8000-%'
   or proyecto_id::text like 'aaaaaaaa-0000-4000-8000-%'
   or proyecto_id in (
     select id from public.proyectos
     where nombre ilike '[PRUEBA]%' or numero_contrato ilike 'CTO-PRU-%'
   );

delete from public.tarifas_tecnicos
where id::text like 'aaaaaaaa-0000-4000-8000-%'
   or proyecto_id::text like 'aaaaaaaa-0000-4000-8000-%'
   or proyecto_id in (
     select id from public.proyectos
     where nombre ilike '[PRUEBA]%' or numero_contrato ilike 'CTO-PRU-%'
   );

delete from public.cortes_mo_items
where id::text like 'aaaaaaaa-0000-4000-8000-%'
   or corte_id in (
     select id from public.cortes_mo
     where id::text like 'aaaaaaaa-0000-4000-8000-%'
        or proyecto_id::text like 'aaaaaaaa-0000-4000-8000-%'
        or proyecto_id in (
          select id from public.proyectos
          where nombre ilike '[PRUEBA]%' or numero_contrato ilike 'CTO-PRU-%'
        )
   );

delete from public.cortes_mo
where id::text like 'aaaaaaaa-0000-4000-8000-%'
   or proyecto_id::text like 'aaaaaaaa-0000-4000-8000-%'
   or proyecto_id in (
     select id from public.proyectos
     where nombre ilike '[PRUEBA]%' or numero_contrato ilike 'CTO-PRU-%'
   );

delete from public.avance_items
where id::text like 'aaaaaaaa-0000-4000-8000-%'
   or proyecto_id::text like 'aaaaaaaa-0000-4000-8000-%'
   or proyecto_id in (
     select id from public.proyectos
     where nombre ilike '[PRUEBA]%' or numero_contrato ilike 'CTO-PRU-%'
   );

delete from public.avance_registros
where id::text like 'aaaaaaaa-0000-4000-8000-%'
   or proyecto_id::text like 'aaaaaaaa-0000-4000-8000-%'
   or proyecto_id in (
     select id from public.proyectos
     where nombre ilike '[PRUEBA]%' or numero_contrato ilike 'CTO-PRU-%'
   );

delete from public.proyecto_cronograma
where id::text like 'aaaaaaaa-0000-4000-8000-%'
   or proyecto_id::text like 'aaaaaaaa-0000-4000-8000-%'
   or proyecto_id in (
     select id from public.proyectos
     where nombre ilike '[PRUEBA]%' or numero_contrato ilike 'CTO-PRU-%'
   );

-- 3. Compras de prueba (órdenes, ítems y solicitudes)
delete from public.compras_ordenes
where id::text like 'aaaaaaaa-0000-4000-8000-%'
   or numero_orden ilike 'OC-PRU-%'
   or numero_orden ilike 'PRE-2026-90%'
   or solicitud_id in (
     select id from public.compras_solicitudes
     where id::text like 'aaaaaaaa-0000-4000-8000-%'
        or numero ilike 'SOL-PRU-%'
        or titulo ilike '[PRUEBA]%'
   );

delete from public.compras_solicitud_items
where id::text like 'aaaaaaaa-0000-4000-8000-%'
   or solicitud_id in (
     select id from public.compras_solicitudes
     where id::text like 'aaaaaaaa-0000-4000-8000-%'
        or numero ilike 'SOL-PRU-%'
        or titulo ilike '[PRUEBA]%'
   );

delete from public.compras_solicitudes
where id::text like 'aaaaaaaa-0000-4000-8000-%'
   or numero ilike 'SOL-PRU-%'
   or titulo ilike '[PRUEBA]%'
   or proyecto_id::text like 'aaaaaaaa-0000-4000-8000-%'
   or proyecto_id in (
     select id from public.proyectos
     where nombre ilike '[PRUEBA]%' or numero_contrato ilike 'CTO-PRU-%'
   );

-- 4. CRM y Ofertas Pre-venta de prueba
delete from public.crm_actividades
where id::text like 'aaaaaaaa-0000-4000-8000-%'
   or oportunidad_id in (
     select id from public.crm_oportunidades
     where id::text like 'aaaaaaaa-0000-4000-8000-%'
        or titulo ilike '[PRUEBA]%'
   );

delete from public.crm_ofertas_preventa
where id::text like 'aaaaaaaa-0000-4000-8000-%'
   or titulo ilike '[PRUEBA]%';

delete from public.crm_oportunidades
where id::text like 'aaaaaaaa-0000-4000-8000-%'
   or titulo ilike '[PRUEBA]%';

-- 5. Presupuesto y Proyectos de prueba
delete from public.presupuesto_items
where id::text like 'aaaaaaaa-0000-4000-8000-%'
   or proyecto_id::text like 'aaaaaaaa-0000-4000-8000-%'
   or proyecto_id in (
     select id from public.proyectos
     where nombre ilike '[PRUEBA]%' or numero_contrato ilike 'CTO-PRU-%'
   );

delete from public.proyectos
where id::text like 'aaaaaaaa-0000-4000-8000-%'
   or nombre ilike '[PRUEBA]%'
   or numero_contrato ilike 'CTO-PRU-%';

-- 6. Catálogos de prueba (únicamente UUIDs semilla para nunca tocar catálogos reales)
delete from public.terceros_contactos where id::text like 'aaaaaaaa-0000-4000-8000-%';
delete from public.terceros where id::text like 'aaaaaaaa-0000-4000-8000-%';

delete from public.contratistas where id::text like 'aaaaaaaa-0000-4000-8000-%';
delete from public.proveedores where id::text like 'aaaaaaaa-0000-4000-8000-%';
delete from public.clientes where id::text like 'aaaaaaaa-0000-4000-8000-%';
delete from public.empresas where id::text like 'aaaaaaaa-0000-4000-8000-%';

commit;
