-- ============================================================================
-- ESCENARIO ÚNICO INTEGRAL DE PRUEBA (CICLO COMPLETO END-TO-END)
-- ----------------------------------------------------------------------------
-- 1. Primero limpia TODOS los proyectos y escenarios de prueba anteriores
--    (UUIDs aaaaaaaa-0000-4000-8000-... y registros [PRUEBA] / CTO-PRU- / SOL-PRU-).
--    NO toca datos reales de producción.
-- 2. Crea UN SOLO flujo 100% articulado de principio a fin:
--      CRM (Oportunidad ganada + bitácora)
--        → Oferta Pre-venta (enviado_comercial + Excel + TRM)
--        → Proyecto AIU (CTO-PRU-001 + documentos + tarifas técnicos)
--        → Cotización + Presupuesto de Costos + Papel vs. Real (ahorro real $800K)
--        → Cronograma (5 tareas + 2 hitos de facturación)
--        → Compras (Solicitud SOL-PRU-001 + Comparativo 3 proveedores + Motivo + 2 OCs)
--        → Avance Diario (2 jornadas · ~61,1% avance físico real)
--        → Mano de Obra (Corte Contratista #1 retención 4% + Técnicos Propios)
--        → Gastos (4 filas enlazadas a OCs + 1 fila enlazada al Corte Contratista)
--        → Cortes Cliente (Corte #1 facturado con amortización anticipo 30%)
--        → Facturación sincronizada por corte_id (FE-PRU-001 + Anticipo FE-PRU-000)
--        → Notificaciones internas
--
-- Prerrequisito: haber ejecutado `sql/migracion_2026-11_comite_mejoras.sql` y
--                `sql/migracion_2026-11_reunion23_permisos_flujos.sql`.
-- Para eliminar TODO este escenario sin tocar datos reales, ejecuta:
--   sql/limpiar_datos_prueba.sql
-- ============================================================================

begin;

-- ============================================================================
-- PASO 0. LIMPIEZA DE TODOS LOS ESCENARIOS DE PRUEBA ANTERIORES
-- ============================================================================
do $$
begin
  if to_regclass('public.notificaciones') is not null then
    delete from public.notificaciones
    where id::text like 'aaaaaaaa-0000-4000-8000-%'
       or proyecto_id::text like 'aaaaaaaa-0000-4000-8000-%'
       or titulo ilike '%[PRUEBA]%'
       or proyecto_id in (
         select id from public.proyectos
         where nombre ilike '[PRUEBA]%' or numero_contrato ilike 'CTO-PRU-%'
       );
  end if;
end $$;

delete from public.documentos
where id::text like 'aaaaaaaa-0000-4000-8000-%'
   or proyecto_id::text like 'aaaaaaaa-0000-4000-8000-%'
   or proyecto_id in (select id from public.proyectos where nombre ilike '[PRUEBA]%' or numero_contrato ilike 'CTO-PRU-%');

delete from public.facturas
where id::text like 'aaaaaaaa-0000-4000-8000-%'
   or numero_factura ilike 'FE-PRU-%'
   or proyecto_id::text like 'aaaaaaaa-0000-4000-8000-%'
   or proyecto_id in (select id from public.proyectos where nombre ilike '[PRUEBA]%' or numero_contrato ilike 'CTO-PRU-%');

delete from public.cortes_cliente_items
where id::text like 'aaaaaaaa-0000-4000-8000-%'
   or corte_id in (
     select id from public.cortes_cliente
     where id::text like 'aaaaaaaa-0000-4000-8000-%'
        or proyecto_id::text like 'aaaaaaaa-0000-4000-8000-%'
        or proyecto_id in (select id from public.proyectos where nombre ilike '[PRUEBA]%' or numero_contrato ilike 'CTO-PRU-%')
   );

delete from public.cortes_cliente
where id::text like 'aaaaaaaa-0000-4000-8000-%'
   or proyecto_id::text like 'aaaaaaaa-0000-4000-8000-%'
   or proyecto_id in (select id from public.proyectos where nombre ilike '[PRUEBA]%' or numero_contrato ilike 'CTO-PRU-%');

delete from public.gastos
where id::text like 'aaaaaaaa-0000-4000-8000-%'
   or proyecto_id::text like 'aaaaaaaa-0000-4000-8000-%'
   or proyecto_id in (select id from public.proyectos where nombre ilike '[PRUEBA]%' or numero_contrato ilike 'CTO-PRU-%');

delete from public.registro_mo_propia
where id::text like 'aaaaaaaa-0000-4000-8000-%'
   or proyecto_id::text like 'aaaaaaaa-0000-4000-8000-%'
   or proyecto_id in (select id from public.proyectos where nombre ilike '[PRUEBA]%' or numero_contrato ilike 'CTO-PRU-%');

delete from public.tarifas_tecnicos
where id::text like 'aaaaaaaa-0000-4000-8000-%'
   or proyecto_id::text like 'aaaaaaaa-0000-4000-8000-%'
   or proyecto_id in (select id from public.proyectos where nombre ilike '[PRUEBA]%' or numero_contrato ilike 'CTO-PRU-%');

delete from public.cortes_mo_items
where id::text like 'aaaaaaaa-0000-4000-8000-%'
   or corte_id in (
     select id from public.cortes_mo
     where id::text like 'aaaaaaaa-0000-4000-8000-%'
        or proyecto_id::text like 'aaaaaaaa-0000-4000-8000-%'
        or proyecto_id in (select id from public.proyectos where nombre ilike '[PRUEBA]%' or numero_contrato ilike 'CTO-PRU-%')
   );

delete from public.cortes_mo
where id::text like 'aaaaaaaa-0000-4000-8000-%'
   or proyecto_id::text like 'aaaaaaaa-0000-4000-8000-%'
   or proyecto_id in (select id from public.proyectos where nombre ilike '[PRUEBA]%' or numero_contrato ilike 'CTO-PRU-%');

delete from public.avance_items
where id::text like 'aaaaaaaa-0000-4000-8000-%'
   or proyecto_id::text like 'aaaaaaaa-0000-4000-8000-%'
   or proyecto_id in (select id from public.proyectos where nombre ilike '[PRUEBA]%' or numero_contrato ilike 'CTO-PRU-%');

delete from public.avance_registros
where id::text like 'aaaaaaaa-0000-4000-8000-%'
   or proyecto_id::text like 'aaaaaaaa-0000-4000-8000-%'
   or proyecto_id in (select id from public.proyectos where nombre ilike '[PRUEBA]%' or numero_contrato ilike 'CTO-PRU-%');

delete from public.proyecto_cronograma
where id::text like 'aaaaaaaa-0000-4000-8000-%'
   or proyecto_id::text like 'aaaaaaaa-0000-4000-8000-%'
   or proyecto_id in (select id from public.proyectos where nombre ilike '[PRUEBA]%' or numero_contrato ilike 'CTO-PRU-%');

delete from public.compras_ordenes
where id::text like 'aaaaaaaa-0000-4000-8000-%'
   or numero_orden ilike 'OC-PRU-%'
   or numero_orden ilike 'PRE-2026-90%'
   or solicitud_id in (
     select id from public.compras_solicitudes
     where id::text like 'aaaaaaaa-0000-4000-8000-%' or numero ilike 'SOL-PRU-%' or titulo ilike '[PRUEBA]%'
   );

delete from public.compras_solicitud_items
where id::text like 'aaaaaaaa-0000-4000-8000-%'
   or solicitud_id in (
     select id from public.compras_solicitudes
     where id::text like 'aaaaaaaa-0000-4000-8000-%' or numero ilike 'SOL-PRU-%' or titulo ilike '[PRUEBA]%'
   );

delete from public.compras_solicitudes
where id::text like 'aaaaaaaa-0000-4000-8000-%'
   or numero ilike 'SOL-PRU-%'
   or titulo ilike '[PRUEBA]%'
   or proyecto_id::text like 'aaaaaaaa-0000-4000-8000-%'
   or proyecto_id in (select id from public.proyectos where nombre ilike '[PRUEBA]%' or numero_contrato ilike 'CTO-PRU-%');

delete from public.crm_actividades
where id::text like 'aaaaaaaa-0000-4000-8000-%'
   or oportunidad_id in (select id from public.crm_oportunidades where id::text like 'aaaaaaaa-0000-4000-8000-%' or titulo ilike '[PRUEBA]%');

delete from public.crm_ofertas_preventa
where id::text like 'aaaaaaaa-0000-4000-8000-%' or titulo ilike '[PRUEBA]%';

delete from public.crm_oportunidades
where id::text like 'aaaaaaaa-0000-4000-8000-%' or titulo ilike '[PRUEBA]%';

delete from public.presupuesto_items
where id::text like 'aaaaaaaa-0000-4000-8000-%'
   or proyecto_id::text like 'aaaaaaaa-0000-4000-8000-%'
   or proyecto_id in (select id from public.proyectos where nombre ilike '[PRUEBA]%' or numero_contrato ilike 'CTO-PRU-%');

delete from public.proyectos
where id::text like 'aaaaaaaa-0000-4000-8000-%' or nombre ilike '[PRUEBA]%' or numero_contrato ilike 'CTO-PRU-%';

delete from public.terceros_contactos where id::text like 'aaaaaaaa-0000-4000-8000-%';
delete from public.terceros where id::text like 'aaaaaaaa-0000-4000-8000-%';
delete from public.contratistas where id::text like 'aaaaaaaa-0000-4000-8000-%';
delete from public.proveedores where id::text like 'aaaaaaaa-0000-4000-8000-%';
delete from public.clientes where id::text like 'aaaaaaaa-0000-4000-8000-%';
delete from public.empresas where id::text like 'aaaaaaaa-0000-4000-8000-%';

-- ============================================================================
-- PASO 1. CATÁLOGO BASE DEL ESCENARIO ÚNICO (1 Empresa · 1 Cliente · 3 Proveedores · 1 Contratista)
-- ============================================================================
insert into public.empresas (id, nombre, nit, direccion, telefono, email)
values
  ('aaaaaaaa-0000-4000-8000-000000000002', '[PRUEBA] Grupo Integra S.A.S.', '901654321-2', 'Calle 84 # 51-20, Barranquilla', '3004445566', 'proyectos@grupointegra-prueba.co');

insert into public.clientes (id, nombre, nit, notas)
values
  ('aaaaaaaa-0000-4000-8000-000000000011', '[PRUEBA] Centro Comercial Altavista', '800222333-4', 'Cliente del escenario integral de ciclo completo');

insert into public.proveedores (id, nombre, nit, categoria, aplica_retencion, porcentaje_retencion, porcentaje_ica, monto_minimo_retencion, notas)
values
  ('aaaaaaaa-0000-4000-8000-000000000021', '[PRUEBA] Distribuidora SAC Seguridad', '900333444-1', 'CCTV y Control de Acceso', true, 2.5, 0.4, 1271000, 'Proveedor evaluado en comparativo'),
  ('aaaaaaaa-0000-4000-8000-000000000022', '[PRUEBA] Melecha Eléctricos S.A.S.', '900555666-2', 'Material Eléctrico y Tubería', true, 2.5, 0.4, 1271000, 'Ganador en infraestructura EMT y cajas'),
  ('aaaaaaaa-0000-4000-8000-000000000023', '[PRUEBA] Hikvision Mayorista Colombia', '901777888-3', 'Equipos Electrónicos', false, 0, 0, 0, 'Autorretenedor · Ganador en cámaras y NVR');

insert into public.contratistas (id, nombre, especialidad, identificacion, tipo_persona, es_declarante_renta, telefono, email)
values
  ('aaaaaaaa-0000-4000-8000-000000000031', '[PRUEBA] Carlos Méndez Instalaciones', 'CCTV, Cableado y Tubería EMT', '72345678', 'persona_natural', true, '3109998877', 'cmendez@prueba.co');

insert into public.terceros (id, nombre, identificacion, es_cliente, es_proveedor, es_contratista, telefono, email, categoria, especialidad, tipo_persona, es_declarante_renta, aplica_retencion, porcentaje_retencion, porcentaje_ica, monto_minimo_retencion, cliente_id, proveedor_id, contratista_id, notas)
values
  ('aaaaaaaa-0000-4000-8000-000000000041', '[PRUEBA] Centro Comercial Altavista', '800222333-4', true, false, false, '3012223344', 'mantenimiento@altavista-prueba.co', null, null, 'empresa', false, false, 0, 0, 0, 'aaaaaaaa-0000-4000-8000-000000000011', null, null, 'Cliente del ciclo completo'),
  ('aaaaaaaa-0000-4000-8000-000000000043', '[PRUEBA] Distribuidora SAC Seguridad', '900333444-1', false, true, false, '3151112233', 'ventas@sac-prueba.co', 'CCTV y Control de Acceso', null, 'empresa', false, true, 2.5, 0.4, 1271000, null, 'aaaaaaaa-0000-4000-8000-000000000021', null, 'Proveedor comparativo'),
  ('aaaaaaaa-0000-4000-8000-000000000044', '[PRUEBA] Melecha Eléctricos S.A.S.', '900555666-2', false, true, false, '3164445566', 'cotizaciones@melecha-prueba.co', 'Material Eléctrico y Tubería', null, 'empresa', false, true, 2.5, 0.4, 1271000, null, 'aaaaaaaa-0000-4000-8000-000000000022', null, 'Proveedor ganador canalización'),
  ('aaaaaaaa-0000-4000-8000-000000000045', '[PRUEBA] Hikvision Mayorista Colombia', '901777888-3', false, true, false, '3177778899', 'canal@hik-prueba.co', 'Equipos Electrónicos', null, 'empresa', false, false, 0, 0, 0, null, 'aaaaaaaa-0000-4000-8000-000000000023', null, 'Proveedor ganador CCTV (autorretenedor)'),
  ('aaaaaaaa-0000-4000-8000-000000000046', '[PRUEBA] Carlos Méndez Instalaciones', '72345678', false, false, true, '3109998877', 'cmendez@prueba.co', null, 'CCTV, Cableado y Tubería EMT', 'persona_natural', true, false, 0, 0, 0, null, null, 'aaaaaaaa-0000-4000-8000-000000000031', 'Contratista persona natural declarante (4%)');

insert into public.terceros_contactos (id, tercero_id, nombre, cargo, tipo_contacto, telefono, email)
values
  ('aaaaaaaa-0000-4000-8000-000000000051', 'aaaaaaaa-0000-4000-8000-000000000041', 'Laura Gómez', 'Jefe de Mantenimiento', 'proyectos', '3012223344', 'lgomez@altavista-prueba.co'),
  ('aaaaaaaa-0000-4000-8000-000000000052', 'aaaaaaaa-0000-4000-8000-000000000043', 'Andrés Ruiz', 'Asesor Comercial', 'comercial', '3151112233', 'aruiz@sac-prueba.co'),
  ('aaaaaaaa-0000-4000-8000-000000000053', 'aaaaaaaa-0000-4000-8000-000000000045', 'Diana Torres', 'Ejecutiva de Canal', 'comercial', '3177778899', 'dtorres@hik-prueba.co');

-- ============================================================================
-- PASO 2. PROYECTO OPERATIVO ÚNICO (AIU · 10% A / 5% I / 10% U · IVA 19% s/U · Anticipo 30%)
--         CD Venta = $14.000.000 · Contrato con AIU antes de IVA = $17.500.000 · Total = $17.766.000
-- ============================================================================
insert into public.proyectos (
  id, nombre, numero_contrato, empresa_id, cliente_id, ciudad, numero_cotizacion,
  estado, fecha_contrato, fecha_inicio, fecha_fin_estimada,
  director_proyecto, coordinador_nombre, comercial_responsable,
  ejecutor_tipo, contratista_principal_id,
  tipo_contrato, administracion_porcentaje, imprevistos_porcentaje, utilidad_porcentaje,
  iva_porcentaje, iva_materiales, anticipo_porcentaje, anticipo_recibido,
  trm_cotizacion, moneda, nota_falta_real,
  proximo_hito_cobro, proxima_facturacion_texto, notas
)
values (
  'aaaaaaaa-0000-4000-8000-000000000101',
  '[PRUEBA] Sistema Integral CCTV y Control de Acceso — Torre Altavista',
  'CTO-PRU-001',
  'aaaaaaaa-0000-4000-8000-000000000002',
  'aaaaaaaa-0000-4000-8000-000000000011',
  'Barranquilla',
  'COT-PRU-2026-01',
  'en_curso',
  current_date - 15,
  current_date - 14,
  current_date + 21,
  'Jose Julio',
  'Jose Julio',
  'Alberto (Comercial)',
  'contratista',
  'aaaaaaaa-0000-4000-8000-000000000031',
  'aiu',
  10, 5, 10,
  19, false, 30, 5250000,
  4200, 'COP',
  'Ahorro real de $800.000 por negociación con Hikvision/Melecha y TRM favorable ($4.050 vs $4.200)',
  'Corte #2 instalación final cámaras y NVR',
  'Esta semana (Fase 2 · $5,3 M)',
  'Escenario único integral articulado: CRM → Oferta Pre-venta → Proyecto → Presupuesto Papel vs Real → Compras (3 proveedores + 2 OCs) → Avance Diario → Mano de Obra (Contratista + Propia) → Gastos → Corte Cliente → Facturación'
);

-- ============================================================================
-- PASO 3. CRM COMERCIAL + BITÁCORA + OFERTA PRE-VENTA (ORIGEN DEL PROYECTO)
-- ============================================================================
insert into public.crm_oportunidades (
  id, titulo, cliente_id, empresa_id, etapa, tipo_servicio, prioridad,
  valor_estimado, costo_estimado, probabilidad, fecha_cierre_estimada,
  descripcion, contacto_nombre, contacto_telefono,
  oferta_preventa_id, proyecto_id
)
values (
  'aaaaaaaa-0000-4000-8000-000000000601',
  '[PRUEBA] Sistema Integral CCTV y Control de Acceso — Torre Altavista',
  'aaaaaaaa-0000-4000-8000-000000000011',
  'aaaaaaaa-0000-4000-8000-000000000002',
  'ganada',
  'cctv',
  'alta',
  17500000,
  9300000,
  100,
  current_date - 15,
  'Oportunidad ganada desde CRM con oferta comercial aprobada y convertida en proyecto operativo CTO-PRU-001.',
  'Laura Gómez',
  '3012223344',
  'aaaaaaaa-0000-4000-8000-000000000701',
  'aaaaaaaa-0000-4000-8000-000000000101'
);

insert into public.crm_ofertas_preventa (
  id, oportunidad_id, proyecto_id, titulo, cliente_id, empresa_id,
  estado, prioridad, valor_estimado, fecha_limite, plazo_ejecucion,
  descripcion, informe_levantamiento,
  archivo_cotizacion_nombre, trm_oferta, enviado_comercial_at,
  subtareas, adjuntos, historial_relevos
)
values (
  'aaaaaaaa-0000-4000-8000-000000000701',
  'aaaaaaaa-0000-4000-8000-000000000601',
  'aaaaaaaa-0000-4000-8000-000000000101',
  '[PRUEBA] Sistema Integral CCTV y Control de Acceso — Torre Altavista',
  'aaaaaaaa-0000-4000-8000-000000000011',
  'aaaaaaaa-0000-4000-8000-000000000002',
  'enviado_comercial',
  'alta',
  17500000,
  current_date - 18,
  '35 días calendario',
  'Oferta económica integral (10 cámaras IP 4MP, 2 NVR 16CH, 50 tramos EMT 3/4" y 10 cajas NEMA 1) bajo modalidad AIU.',
  'Levantamiento completado en Torre Altavista con planos de rutas EMT y puntos PoE validados con Jefe de Mantenimiento.',
  'Cotizacion_Torre_Altavista_v1.xlsx',
  4200,
  now() - interval '17 days',
  '[
    {"texto":"Validar distancias de tubería EMT y puntos PoE","hecha":true},
    {"texto":"Cotizar equipos CCTV en USD con TRM $4.200","hecha":true},
    {"texto":"Enviar oferta final al comercial responsable","hecha":true}
  ]'::jsonb,
  '[
    {"nombre":"Cotizacion_Torre_Altavista_v1.xlsx","url":"https://pctronic.co/docs/cotizacion-altavista-demo"}
  ]'::jsonb,
  '[
    {"fecha":"2026-11-03","de":"Comercial","para":"Pre-venta","nota":"Solicitud de cotización tras visita técnica"},
    {"fecha":"2026-11-06","de":"Pre-venta","para":"Comercial","nota":"Oferta económica finalizada y enviada al comercial"},
    {"fecha":"2026-11-08","de":"Comercial","para":"Proyectos","nota":"Cierre ganado con OC-CLI-2026-881 · Convertido en CTO-PRU-001"}
  ]'::jsonb
);

insert into public.crm_actividades (id, oportunidad_id, tipo, titulo, descripcion, completada, created_at)
values
  ('aaaaaaaa-0000-4000-8000-000000000611', 'aaaaaaaa-0000-4000-8000-000000000601', 'visita', 'Visita técnica Torre Altavista', 'Levantamiento en sitio con Laura Gómez; definidos 10 puntos de cámara y cuarto de rack.', true, now() - interval '20 days'),
  ('aaaaaaaa-0000-4000-8000-000000000612', 'aaaaaaaa-0000-4000-8000-000000000601', 'tarea', 'Oferta recibida desde Pre-venta', 'Pre-venta finalizó Cotizacion_Torre_Altavista_v1.xlsx por $17.500.000 + IVA sobre utilidad.', true, now() - interval '17 days'),
  ('aaaaaaaa-0000-4000-8000-000000000613', 'aaaaaaaa-0000-4000-8000-000000000601', 'correo', 'Oferta enviada al cliente', 'Propuesta formal enviada a Centro Comercial Altavista.', true, now() - interval '16 days'),
  ('aaaaaaaa-0000-4000-8000-000000000614', 'aaaaaaaa-0000-4000-8000-000000000601', 'reunion', 'Cierre ganado y pase a Proyectos', 'Cliente emitió OC-CLI-2026-881 y pagó anticipo del 30%. Proyecto CTO-PRU-001 creado.', true, now() - interval '15 days');

-- Documentos de cierre del proyecto
insert into public.documentos (id, proyecto_id, categoria, nombre_archivo, url)
values
  ('aaaaaaaa-0000-4000-8000-000000000181', 'aaaaaaaa-0000-4000-8000-000000000101', 'orden_compra', 'OC-CLI-2026-881_Altavista.pdf', 'https://pctronic.co/docs/oc-altavista-demo'),
  ('aaaaaaaa-0000-4000-8000-000000000182', 'aaaaaaaa-0000-4000-8000-000000000101', 'cotizacion', 'Cotizacion_Torre_Altavista_v1.xlsx', 'https://pctronic.co/docs/cotizacion-altavista-demo');

-- Tarifas de técnicos propios del proyecto
insert into public.tarifas_tecnicos (id, proyecto_id, cargo, valor_hora, horas_dia)
values
  ('aaaaaaaa-0000-4000-8000-000000000191', 'aaaaaaaa-0000-4000-8000-000000000101', 'Ingeniero de Configuración', 45000, 8),
  ('aaaaaaaa-0000-4000-8000-000000000192', 'aaaaaaaa-0000-4000-8000-000000000101', 'Técnico Instalador Senior', 28000, 8);

-- ============================================================================
-- PASO 4. COTIZACIÓN + PRESUPUESTO DE COSTOS + PAPEL VS. REAL + MANO DE OBRA
--         Ppto. Materiales Papel = $9.300.000 · Costo Real Estimado = $8.500.000 (Ahorro $800.000)
-- ============================================================================
insert into public.presupuesto_items (
  id, proyecto_id, tipo, orden, codigo, referencia, descripcion, marca, unidad,
  cantidad, tiempo_entrega, pu_venta, cu_material,
  costo_real_estimado_total, moneda_costo, costo_origen_usd, nota_ajuste_real,
  cu_mano_obra, pu_contratista
)
values
  ('aaaaaaaa-0000-4000-8000-000000000201', 'aaaaaaaa-0000-4000-8000-000000000101', 'capitulo', 1, '1', null, 'SISTEMA DE CCTV IP Y CONTROL DE ACCESO', null, null, 1, null, 0, 0, null, 'COP', null, null, 0, null),
  ('aaaaaaaa-0000-4000-8000-000000000202', 'aaaaaaaa-0000-4000-8000-000000000101', 'item', 2, '1.1', 'DS-2CD2143G2', 'Cámara Domo IP 4MP PoE Exterior', 'Hikvision', 'Und', 10, '5 días', 520000, 340000, 3050000, 'USD', 80.95, 'Compra negociada con Hikvision + TRM $4.050', 80000, 60000),
  ('aaaaaaaa-0000-4000-8000-000000000203', 'aaaaaaaa-0000-4000-8000-000000000101', 'item', 3, '1.2', 'DS-7616NI-Q2', 'NVR 16 Canales 4K con 2 Bahías SATA', 'Hikvision', 'Und', 2, '5 días', 1800000, 1250000, 2300000, 'USD', 297.62, 'Descuento por volumen + TRM $4.050', 150000, 110000),
  ('aaaaaaaa-0000-4000-8000-000000000204', 'aaaaaaaa-0000-4000-8000-000000000101', 'capitulo', 4, '2', null, 'INFRAESTRUCTURA Y CANALIZACIÓN', null, null, 1, null, 0, 0, null, 'COP', null, null, 0, null),
  ('aaaaaaaa-0000-4000-8000-000000000205', 'aaaaaaaa-0000-4000-8000-000000000101', 'item', 5, '2.1', 'TUB-EMT-34', 'Tubería EMT 3/4" x 3m con accesorios', 'Colmena', 'Tramo', 50, '2 días', 48000, 30000, 1400000, 'COP', null, 'Mejor tarifa Melecha Eléctricos', 25000, 18000),
  ('aaaaaaaa-0000-4000-8000-000000000206', 'aaaaaaaa-0000-4000-8000-000000000101', 'item', 6, '2.2', 'CAJ-PASO-20', 'Caja de paso metálica 20x20x10 NEMA 1', 'Melecha', 'Und', 10, '2 días', 280000, 190000, 1750000, 'COP', null, 'Descuento en comparativo Melecha', 45000, 35000);

-- ============================================================================
-- PASO 5. CRONOGRAMA CON HITOS DE FACTURACIÓN
-- ============================================================================
insert into public.proyecto_cronograma (
  id, proyecto_id, orden, edt, fase, titulo, responsable,
  fecha_inicio, fecha_fin, progreso, estado,
  es_hito_facturacion, monto_facturacion_estimado, hito_facturado, notas
)
values
  ('aaaaaaaa-0000-4000-8000-000000000301', 'aaaaaaaa-0000-4000-8000-000000000101', 1, '1.1', 'pre_inicio', 'Acta de inicio y replanteo en Torre Altavista', 'Jose Julio', current_date - 14, current_date - 12, 100, 'completada', false, null, false, 'Acta firmada con cliente'),
  ('aaaaaaaa-0000-4000-8000-000000000302', 'aaaaaaaa-0000-4000-8000-000000000101', 2, '1.2', 'pre_inicio', 'Compras, comparativo y recepción de materiales', 'Compras', current_date - 11, current_date - 8, 100, 'completada', false, null, false, 'OC-PRU-001 y OC-PRU-002 recibidas en obra'),
  ('aaaaaaaa-0000-4000-8000-000000000303', 'aaaaaaaa-0000-4000-8000-000000000101', 3, '2.1', 'ejecucion', 'Canalización EMT, cajas y montaje Fase 1 (Corte #1)', 'Carlos Méndez', current_date - 7, current_date - 2, 100, 'completada', true, 7652640, true, 'Corte #1 facturado (FE-PRU-001)'),
  ('aaaaaaaa-0000-4000-8000-000000000304', 'aaaaaaaa-0000-4000-8000-000000000101', 4, '2.2', 'ejecucion', 'Instalación final cámaras, NVR #2 y configuración PoE', 'Carlos Méndez', current_date - 1, current_date + 6, 45, 'en_curso', true, 5300000, false, 'Hito de facturación Corte #2 esta semana'),
  ('aaaaaaaa-0000-4000-8000-000000000305', 'aaaaaaaa-0000-4000-8000-000000000101', 5, '3.1', 'post_finalizacion', 'Pruebas integrales, capacitación y acta de entrega final', 'Jose Julio', current_date + 7, current_date + 21, 0, 'pendiente', true, 4813360, false, 'Cierre y liquidación final');

-- ============================================================================
-- PASO 6. COMPRAS: SOLICITUD + COMPARATIVO 3 PROVEEDORES + MOTIVO + 2 OCs
-- ============================================================================
insert into public.compras_solicitudes (
  id, numero, proyecto_id, origen, empresa_id, cliente_id,
  titulo, estado, fecha_solicitud, fecha_aprobacion,
  trm, trm_fuente, moneda_p1, moneda_p2, moneda_p3,
  motivo_seleccion, comentario_comite, notas
)
values (
  'aaaaaaaa-0000-4000-8000-000000000501',
  'SOL-PRU-001',
  'aaaaaaaa-0000-4000-8000-000000000101',
  'proyecto',
  'aaaaaaaa-0000-4000-8000-000000000002',
  'aaaaaaaa-0000-4000-8000-000000000011',
  '[PRUEBA] Equipos CCTV e Infraestructura — Torre Altavista',
  'ordenada',
  current_date - 11,
  now() - interval '10 days',
  4050,
  'api',
  'COP', 'COP', 'COP',
  'Hikvision Mayorista ofrece el mejor precio en cámaras y NVR con garantía directa de 3 años; Melecha ofrece entrega inmediata en Barranquilla para tubería y cajas logrando un ahorro total de $800.000 frente al presupuesto base.',
  'Aprobado en Comité de Compras por cumplimiento de presupuesto y ahorro del 8,6%.',
  'Solicitud integral generada desde el presupuesto de costos del proyecto CTO-PRU-001.'
);

insert into public.compras_solicitud_items (
  id, solicitud_id, presupuesto_item_id, codigo, referencia, descripcion, unidad,
  cantidad_presupuestada, cantidad_solicitada, costo_presupuestado_unit,
  proveedor_1_id, precio_1, proveedor_2_id, precio_2, proveedor_3_id, precio_3,
  proveedor_ganador_id, precio_ganador, descuento_pct, observaciones
)
values
  ('aaaaaaaa-0000-4000-8000-000000000511', 'aaaaaaaa-0000-4000-8000-000000000501', 'aaaaaaaa-0000-4000-8000-000000000202', '1.1', 'DS-2CD2143G2', 'Cámara Domo IP 4MP PoE Exterior', 'Und', 10, 10, 340000, 'aaaaaaaa-0000-4000-8000-000000000021', 325000, 'aaaaaaaa-0000-4000-8000-000000000023', 305000, 'aaaaaaaa-0000-4000-8000-000000000022', 338000, 'aaaaaaaa-0000-4000-8000-000000000023', 305000, 0, 'Mejor precio y garantía directa'),
  ('aaaaaaaa-0000-4000-8000-000000000512', 'aaaaaaaa-0000-4000-8000-000000000501', 'aaaaaaaa-0000-4000-8000-000000000203', '1.2', 'DS-7616NI-Q2', 'NVR 16 Canales 4K con 2 Bahías SATA', 'Und', 2, 2, 1250000, 'aaaaaaaa-0000-4000-8000-000000000021', 1210000, 'aaaaaaaa-0000-4000-8000-000000000023', 1150000, 'aaaaaaaa-0000-4000-8000-000000000022', 1245000, 'aaaaaaaa-0000-4000-8000-000000000023', 1150000, 0, 'Entrega inmediata'),
  ('aaaaaaaa-0000-4000-8000-000000000513', 'aaaaaaaa-0000-4000-8000-000000000501', 'aaaaaaaa-0000-4000-8000-000000000205', '2.1', 'TUB-EMT-34', 'Tubería EMT 3/4" x 3m con accesorios', 'Tramo', 50, 50, 30000, 'aaaaaaaa-0000-4000-8000-000000000021', 31000, 'aaaaaaaa-0000-4000-8000-000000000023', 32000, 'aaaaaaaa-0000-4000-8000-000000000022', 28000, 'aaaaaaaa-0000-4000-8000-000000000022', 28000, 0, 'Menor precio local'),
  ('aaaaaaaa-0000-4000-8000-000000000514', 'aaaaaaaa-0000-4000-8000-000000000501', 'aaaaaaaa-0000-4000-8000-000000000206', '2.2', 'CAJ-PASO-20', 'Caja de paso metálica 20x20x10 NEMA 1', 'Und', 10, 10, 190000, 'aaaaaaaa-0000-4000-8000-000000000021', 188000, 'aaaaaaaa-0000-4000-8000-000000000023', 195000, 'aaaaaaaa-0000-4000-8000-000000000022', 175000, 'aaaaaaaa-0000-4000-8000-000000000022', 175000, 0, 'Descuento por paquete eléctrico');

insert into public.compras_ordenes (
  id, solicitud_id, empresa_id, proveedor_id, numero_orden, tipo,
  subtotal, iva, retenciones, reteiva, total, estado, centro_costo, ciudad, notas
)
values
  ('aaaaaaaa-0000-4000-8000-000000000521', 'aaaaaaaa-0000-4000-8000-000000000501', 'aaaaaaaa-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000023', 'OC-PRU-001', 'orden_compra', 5350000, 1016500, 0, 0, 6366500, 'emitida', 'CTO-PRU-001', 'Barranquilla', 'Orden equipos CCTV · Hikvision Mayorista (autorretenedor)'),
  ('aaaaaaaa-0000-4000-8000-000000000522', 'aaaaaaaa-0000-4000-8000-000000000501', 'aaaaaaaa-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000022', 'OC-PRU-002', 'orden_compra', 3150000, 598500, 91350, 0, 3657150, 'emitida', 'CTO-PRU-001', 'Barranquilla', 'Orden canalización y cajas · Melecha Eléctricos');

-- ============================================================================
-- PASO 7. AVANCE DIARIO (2 JORNADAS · ~61,1% DE AVANCE FÍSICO REAL)
-- ============================================================================
insert into public.avance_registros (id, proyecto_id, fecha, clima, observaciones, novedades)
values
  ('aaaaaaaa-0000-4000-8000-000000000801', 'aaaaaaaa-0000-4000-8000-000000000101', current_date - 6, 'Despejado', 'Tendido de tubería EMT 3/4" y montaje de cajas NEMA 1 en pisos 1 a 4.', 'Sin novedades de seguridad.'),
  ('aaaaaaaa-0000-4000-8000-000000000802', 'aaaaaaaa-0000-4000-8000-000000000101', current_date - 3, 'Nublado', 'Instalación de primeras 5 cámaras IP 4MP y montaje + puesta en marcha de NVR #1.', 'Se entregó avance para Corte #1.');

insert into public.avance_items (id, registro_id, proyecto_id, presupuesto_item_id, cantidad, ejecutor, notas)
values
  ('aaaaaaaa-0000-4000-8000-000000000811', 'aaaaaaaa-0000-4000-8000-000000000801', 'aaaaaaaa-0000-4000-8000-000000000101', 'aaaaaaaa-0000-4000-8000-000000000205', 40, 'contratista', '40 tramos instalados en corredores principales'),
  ('aaaaaaaa-0000-4000-8000-000000000812', 'aaaaaaaa-0000-4000-8000-000000000801', 'aaaaaaaa-0000-4000-8000-000000000101', 'aaaaaaaa-0000-4000-8000-000000000206', 8, 'contratista', '8 cajas de paso fijadas y marcadas'),
  ('aaaaaaaa-0000-4000-8000-000000000813', 'aaaaaaaa-0000-4000-8000-000000000802', 'aaaaaaaa-0000-4000-8000-000000000101', 'aaaaaaaa-0000-4000-8000-000000000202', 5, 'contratista', '5 cámaras exteriores montadas y ponchadas'),
  ('aaaaaaaa-0000-4000-8000-000000000814', 'aaaaaaaa-0000-4000-8000-000000000802', 'aaaaaaaa-0000-4000-8000-000000000101', 'aaaaaaaa-0000-4000-8000-000000000203', 1, 'contratista', 'NVR #1 instalado en rack principal');

-- ============================================================================
-- PASO 8. MANO DE OBRA: CORTE CONTRATISTA #1 (4% RETENCIÓN) + TÉCNICOS PROPIOS
--         Bruto Corte MO #1 = $1.410.000 · Retención 4% = $56.400 · Abonado = $1.000.000
-- ============================================================================
insert into public.cortes_mo (id, proyecto_id, numero, fecha, numero_cuenta_cobro, contratista_id, retencion_porcentaje, notas)
values
  ('aaaaaaaa-0000-4000-8000-000000000851', 'aaaaaaaa-0000-4000-8000-000000000101', 1, current_date - 3, 'CTA-PRU-001', 'aaaaaaaa-0000-4000-8000-000000000031', 4, 'Corte #1 de mano de obra · Canalización + montaje Fase 1');

insert into public.cortes_mo_items (id, corte_id, presupuesto_item_id, cantidad, pu_contratista_snapshot)
values
  ('aaaaaaaa-0000-4000-8000-000000000861', 'aaaaaaaa-0000-4000-8000-000000000851', 'aaaaaaaa-0000-4000-8000-000000000205', 40, 18000),
  ('aaaaaaaa-0000-4000-8000-000000000862', 'aaaaaaaa-0000-4000-8000-000000000851', 'aaaaaaaa-0000-4000-8000-000000000206', 8, 35000),
  ('aaaaaaaa-0000-4000-8000-000000000863', 'aaaaaaaa-0000-4000-8000-000000000851', 'aaaaaaaa-0000-4000-8000-000000000202', 5, 60000),
  ('aaaaaaaa-0000-4000-8000-000000000864', 'aaaaaaaa-0000-4000-8000-000000000851', 'aaaaaaaa-0000-4000-8000-000000000203', 1, 110000);

insert into public.registro_mo_propia (id, proyecto_id, fecha, tecnico, tarifa_id, presupuesto_item_id, dias, horas_dia, horas_extra, valor_total, observaciones)
values
  ('aaaaaaaa-0000-4000-8000-000000000871', 'aaaaaaaa-0000-4000-8000-000000000101', current_date - 3, 'Ing. Luis Herrera', 'aaaaaaaa-0000-4000-8000-000000000191', 'aaaaaaaa-0000-4000-8000-000000000203', 1, 8, 0, 360000, 'Configuración de red VLAN, NVR #1 y acceso remoto'),
  ('aaaaaaaa-0000-4000-8000-000000000872', 'aaaaaaaa-0000-4000-8000-000000000101', current_date - 2, 'Téc. Andrés Mejía', 'aaaaaaaa-0000-4000-8000-000000000192', 'aaaaaaaa-0000-4000-8000-000000000202', 2, 8, 0, 448000, 'Pruebas de enfoque, PoE y verificación de grabación Fase 1');

-- ============================================================================
-- PASO 9. GASTOS DEL PROYECTO (ARTICULADOS A LAS 2 OCs + CORTE CONTRATISTA #1)
--         Materiales = $8.500.000 · Contratista = $1.410.000 (Pagado $1.000.000) · MO Propia = $808.000
--         Total Gastado Real Proyecto = $10.718.000
-- ============================================================================
insert into public.gastos (
  id, proyecto_id, fecha, tipo, proveedor_id, documento,
  presupuesto_item_id, orden_compra_id, corte_mo_id,
  descripcion, cantidad, valor_unitario, observaciones
)
values
  ('aaaaaaaa-0000-4000-8000-000000000401', 'aaaaaaaa-0000-4000-8000-000000000101', current_date - 10, 'Material', 'aaaaaaaa-0000-4000-8000-000000000023', 'OC-PRU-001', 'aaaaaaaa-0000-4000-8000-000000000202', 'aaaaaaaa-0000-4000-8000-000000000521', null, 'Cámara Domo IP 4MP PoE Exterior (OC-PRU-001)', 10, 305000, 'Generado desde OC-PRU-001 · SOL-PRU-001'),
  ('aaaaaaaa-0000-4000-8000-000000000402', 'aaaaaaaa-0000-4000-8000-000000000101', current_date - 10, 'Material', 'aaaaaaaa-0000-4000-8000-000000000023', 'OC-PRU-001', 'aaaaaaaa-0000-4000-8000-000000000203', 'aaaaaaaa-0000-4000-8000-000000000521', null, 'NVR 16 Canales 4K con 2 Bahías SATA (OC-PRU-001)', 2, 1150000, 'Generado desde OC-PRU-001 · SOL-PRU-001'),
  ('aaaaaaaa-0000-4000-8000-000000000403', 'aaaaaaaa-0000-4000-8000-000000000101', current_date - 10, 'Material', 'aaaaaaaa-0000-4000-8000-000000000022', 'OC-PRU-002', 'aaaaaaaa-0000-4000-8000-000000000205', 'aaaaaaaa-0000-4000-8000-000000000522', null, 'Tubería EMT 3/4" x 3m con accesorios (OC-PRU-002)', 50, 28000, 'Generado desde OC-PRU-002 · SOL-PRU-001'),
  ('aaaaaaaa-0000-4000-8000-000000000404', 'aaaaaaaa-0000-4000-8000-000000000101', current_date - 10, 'Material', 'aaaaaaaa-0000-4000-8000-000000000022', 'OC-PRU-002', 'aaaaaaaa-0000-4000-8000-000000000206', 'aaaaaaaa-0000-4000-8000-000000000522', null, 'Caja de paso metálica 20x20x10 NEMA 1 (OC-PRU-002)', 10, 175000, 'Generado desde OC-PRU-002 · SOL-PRU-001'),
  ('aaaaaaaa-0000-4000-8000-000000000405', 'aaaaaaaa-0000-4000-8000-000000000101', current_date - 3, 'Mano de obra contratista', null, 'CTA-PRU-001', null, null, 'aaaaaaaa-0000-4000-8000-000000000851', 'Corte #1 · Carlos Méndez Instalaciones (Bruto $1.410.000 · Ret. 4%)', 1, 1410000, 'Abono parcial registrado [PAGADO_MO:1000000]');

-- ============================================================================
-- PASO 10. CORTES DE CLIENTE (CORTE #1 FACTURADO + AMORTIZACIÓN ANTICIPO 30%)
--          CD = $8.560.000 · AIU 25% = $2.140.000 · Ingreso = $10.700.000
--          IVA s/Utilidad = $162.640 · Bruto = $10.862.640
--          Amortización Anticipo 30% = $3.210.000 · Neto a cobrar = $7.652.640
-- ============================================================================
insert into public.cortes_cliente (id, proyecto_id, numero, fecha, estado, numero_factura, fecha_factura, valor_recaudado, notas)
values
  ('aaaaaaaa-0000-4000-8000-000000000901', 'aaaaaaaa-0000-4000-8000-000000000101', 1, current_date - 2, 'facturado', 'FE-PRU-001', current_date - 2, 4500000, 'Corte #1 de obra (61,1% avance físico) con amortización proporcional de anticipo y abono parcial recaudado.');

insert into public.cortes_cliente_items (id, corte_id, presupuesto_item_id, cantidad, pu_venta_snapshot)
values
  ('aaaaaaaa-0000-4000-8000-000000000911', 'aaaaaaaa-0000-4000-8000-000000000901', 'aaaaaaaa-0000-4000-8000-000000000202', 5, 520000),
  ('aaaaaaaa-0000-4000-8000-000000000912', 'aaaaaaaa-0000-4000-8000-000000000901', 'aaaaaaaa-0000-4000-8000-000000000203', 1, 1800000),
  ('aaaaaaaa-0000-4000-8000-000000000913', 'aaaaaaaa-0000-4000-8000-000000000901', 'aaaaaaaa-0000-4000-8000-000000000205', 40, 48000),
  ('aaaaaaaa-0000-4000-8000-000000000914', 'aaaaaaaa-0000-4000-8000-000000000901', 'aaaaaaaa-0000-4000-8000-000000000206', 8, 280000);

-- ============================================================================
-- PASO 11. FACTURACIÓN SINCRONIZADA POR corte_id + NOTIFICACIONES DEL CICLO
-- ============================================================================
insert into public.facturas (id, proyecto_id, corte_id, numero_factura, valor, fecha_emision, fecha_vencimiento, estado, notas)
values
  ('aaaaaaaa-0000-4000-8000-000000000451', 'aaaaaaaa-0000-4000-8000-000000000101', null, 'FE-PRU-000', 5250000, current_date - 13, current_date + 17, 'pagada', 'Anticipo 30% Contrato CTO-PRU-001 [PRUEBA]'),
  ('aaaaaaaa-0000-4000-8000-000000000452', 'aaaaaaaa-0000-4000-8000-000000000101', 'aaaaaaaa-0000-4000-8000-000000000901', 'FE-PRU-001', 7652640, current_date - 2, current_date + 28, 'pendiente', 'Corte #1 sincronizado automáticamente · Neto tras amortización anticipo 30% [PRUEBA]');

do $$
begin
  if to_regclass('public.notificaciones') is not null then
    insert into public.notificaciones (id, tipo, titulo, mensaje, url, rol_destino, proyecto_id)
    values
      ('aaaaaaaa-0000-4000-8000-000000000951', 'nuevo_proyecto', '[PRUEBA] Nuevo proyecto desde CRM: Torre Altavista', 'Comercial cerró la oportunidad ganada CTO-PRU-001 con cotización y documentos adjuntos.', 'proyecto-detalle.html?id=aaaaaaaa-0000-4000-8000-000000000101', array['super_usuario','directivo','proyectos'], 'aaaaaaaa-0000-4000-8000-000000000101'),
      ('aaaaaaaa-0000-4000-8000-000000000952', 'corte_facturado', '[PRUEBA] Corte #1 facturado (FE-PRU-001)', 'Se sincronizó la factura FE-PRU-001 por $7.652.640 desde Torre Altavista.', 'facturacion.html', array['super_usuario','directivo','jefe_comercial'], 'aaaaaaaa-0000-4000-8000-000000000101');
  end if;
end $$;

commit;
