-- ============================================================================
-- ELIMINAR TODOS LOS DATOS DE PRUEBA ([PRUEBA])
-- Borra únicamente los registros creados por sql/seed_datos_prueba.sql
-- (UUIDs con prefijo aaaaaaaa-0000-4000-8000-...). No toca datos reales.
-- ============================================================================

delete from public.compras_ordenes where id::text like 'aaaaaaaa-0000-4000-8000-%';
delete from public.compras_solicitud_items where id::text like 'aaaaaaaa-0000-4000-8000-%';
delete from public.compras_solicitudes where id::text like 'aaaaaaaa-0000-4000-8000-%';

delete from public.crm_ofertas_preventa where id::text like 'aaaaaaaa-0000-4000-8000-%';
delete from public.crm_oportunidades where id::text like 'aaaaaaaa-0000-4000-8000-%';

delete from public.facturas where id::text like 'aaaaaaaa-0000-4000-8000-%';
delete from public.gastos where id::text like 'aaaaaaaa-0000-4000-8000-%';
delete from public.proyecto_cronograma where id::text like 'aaaaaaaa-0000-4000-8000-%';
delete from public.presupuesto_items where id::text like 'aaaaaaaa-0000-4000-8000-%';
delete from public.proyectos where id::text like 'aaaaaaaa-0000-4000-8000-%';

delete from public.terceros_contactos where id::text like 'aaaaaaaa-0000-4000-8000-%';
delete from public.terceros where id::text like 'aaaaaaaa-0000-4000-8000-%';

delete from public.contratistas where id::text like 'aaaaaaaa-0000-4000-8000-%';
delete from public.proveedores where id::text like 'aaaaaaaa-0000-4000-8000-%';
delete from public.clientes where id::text like 'aaaaaaaa-0000-4000-8000-%';
delete from public.empresas where id::text like 'aaaaaaaa-0000-4000-8000-%';
