-- ============================================================================
-- PAQUETE DE DATOS DE PRUEBA (IDEMPOTENTE Y FÁCIL DE ELIMINAR)
-- Todos los registros usan UUIDs con prefijo aaaaaaaa-0000-4000-8000-...
-- y etiqueta [PRUEBA] para distinguirlos de datos reales.
-- Para eliminar TODO este paquete sin tocar datos reales, ejecuta:
--   sql/limpiar_datos_prueba.sql
-- ============================================================================

-- 1. EMPRESAS DE PRUEBA
insert into public.empresas (id, nombre, nit, direccion, telefono, email)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', '[PRUEBA] Pctronic Seguridad Electrónica', '900123456-1', 'Cra 45 # 72-10, Barranquilla', '3001112233', 'compras@pctronic-prueba.co'),
  ('aaaaaaaa-0000-4000-8000-000000000002', '[PRUEBA] Grupo Integra S.A.S.', '901654321-2', 'Calle 84 # 51-20, Barranquilla', '3004445566', 'proyectos@grupointegra-prueba.co')
on conflict (id) do nothing;

-- 2. CLIENTES, PROVEEDORES Y CONTRATISTAS DE PRUEBA
insert into public.clientes (id, nombre, nit, notas)
values
  ('aaaaaaaa-0000-4000-8000-000000000011', '[PRUEBA] Centro Comercial Altavista', '800222333-4', 'Cliente de prueba para proyectos AIU y CRM'),
  ('aaaaaaaa-0000-4000-8000-000000000012', '[PRUEBA] Logística Bodega Norte S.A.S.', '900888777-5', 'Cliente de prueba para suministros e incendio')
on conflict (id) do nothing;

insert into public.proveedores (id, nombre, nit, categoria, aplica_retencion, porcentaje_retencion, porcentaje_ica, monto_minimo_retencion, notas)
values
  ('aaaaaaaa-0000-4000-8000-000000000021', '[PRUEBA] Distribuidora SAC Seguridad', '900333444-1', 'CCTV y Control de Acceso', true, 2.5, 0.4, 1271000, 'Proveedor frecuente de cámaras e incendio'),
  ('aaaaaaaa-0000-4000-8000-000000000022', '[PRUEBA] Melecha Eléctricos S.A.S.', '900555666-2', 'Material Eléctrico y Tubería', true, 2.5, 0.4, 1271000, 'Proveedor de tubería EMT, cableado y cajas de paso'),
  ('aaaaaaaa-0000-4000-8000-000000000023', '[PRUEBA] Hikvision Mayorista Colombia', '901777888-3', 'Equipos Electrónicos', false, 0, 0, 0, 'Autorretenedor')
on conflict (id) do nothing;

insert into public.contratistas (id, nombre, especialidad, identificacion, tipo_persona, es_declarante_renta, telefono, email)
values
  ('aaaaaaaa-0000-4000-8000-000000000031', '[PRUEBA] Carlos Méndez Instalaciones', 'Cableado y Tubería EMT', '72345678', 'persona_natural', true, '3109998877', 'cmendez@prueba.co')
on conflict (id) do nothing;

-- 3. TERCEROS UNIFICADOS DE PRUEBA
insert into public.terceros (id, nombre, identificacion, es_cliente, es_proveedor, es_contratista, telefono, email, categoria, especialidad, tipo_persona, es_declarante_renta, aplica_retencion, porcentaje_retencion, porcentaje_ica, monto_minimo_retencion, cliente_id, proveedor_id, contratista_id, notas)
values
  ('aaaaaaaa-0000-4000-8000-000000000041', '[PRUEBA] Centro Comercial Altavista', '800222333-4', true, false, false, '3012223344', 'mantenimiento@altavista-prueba.co', null, null, 'empresa', false, false, 0, 0, 0, 'aaaaaaaa-0000-4000-8000-000000000011', null, null, 'Cliente de prueba'),
  ('aaaaaaaa-0000-4000-8000-000000000042', '[PRUEBA] Logística Bodega Norte S.A.S.', '900888777-5', true, false, false, '3025556677', 'compras@bodeganorte-prueba.co', null, null, 'empresa', false, false, 0, 0, 0, 'aaaaaaaa-0000-4000-8000-000000000012', null, null, 'Cliente de prueba'),
  ('aaaaaaaa-0000-4000-8000-000000000043', '[PRUEBA] Distribuidora SAC Seguridad', '900333444-1', false, true, false, '3151112233', 'ventas@sac-prueba.co', 'CCTV y Control de Acceso', null, 'empresa', false, true, 2.5, 0.4, 1271000, null, 'aaaaaaaa-0000-4000-8000-000000000021', null, 'Proveedor de prueba con retenciones'),
  ('aaaaaaaa-0000-4000-8000-000000000044', '[PRUEBA] Melecha Eléctricos S.A.S.', '900555666-2', false, true, false, '3164445566', 'cotizaciones@melecha-prueba.co', 'Material Eléctrico y Tubería', null, 'empresa', false, true, 2.5, 0.4, 1271000, null, 'aaaaaaaa-0000-4000-8000-000000000022', null, 'Proveedor de prueba'),
  ('aaaaaaaa-0000-4000-8000-000000000045', '[PRUEBA] Hikvision Mayorista Colombia', '901777888-3', false, true, false, '3177778899', 'canal@hik-prueba.co', 'Equipos Electrónicos', null, 'empresa', false, false, 0, 0, 0, null, 'aaaaaaaa-0000-4000-8000-000000000023', null, 'Autorretenedor'),
  ('aaaaaaaa-0000-4000-8000-000000000046', '[PRUEBA] Carlos Méndez Instalaciones', '72345678', false, false, true, '3109998877', 'cmendez@prueba.co', null, 'Cableado y Tubería EMT', 'persona_natural', true, false, 0, 0, 0, null, null, 'aaaaaaaa-0000-4000-8000-000000000031', 'Contratista persona natural declarante')
on conflict (id) do nothing;

insert into public.terceros_contactos (id, tercero_id, nombre, cargo, tipo_contacto, telefono, email)
values
  ('aaaaaaaa-0000-4000-8000-000000000051', 'aaaaaaaa-0000-4000-8000-000000000041', 'Laura Gómez', 'Jefe de Mantenimiento', 'proyectos', '3012223344', 'lgomez@altavista-prueba.co'),
  ('aaaaaaaa-0000-4000-8000-000000000052', 'aaaaaaaa-0000-4000-8000-000000000043', 'Andrés Ruiz', 'Asesor Comercial', 'comercial', '3151112233', 'aruiz@sac-prueba.co')
on conflict (id) do nothing;

-- 4. PROYECTOS DE PRUEBA
insert into public.proyectos (id, nombre, numero_contrato, empresa_id, cliente_id, ciudad, numero_cotizacion, estado, fecha_contrato, fecha_inicio, fecha_fin_estimada, director_proyecto, comercial_responsable, ejecutor_tipo, contratista_principal_id, tipo_contrato, administracion_porcentaje, imprevistos_porcentaje, utilidad_porcentaje, iva_porcentaje, anticipo_porcentaje, avance_porcentaje, notas)
values
  ('aaaaaaaa-0000-4000-8000-000000000101', '[PRUEBA] CCTV y Control de Acceso Altavista', 'CTO-PRU-001', 'aaaaaaaa-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000011', 'Barranquilla', 'COT-PRU-2026-01', 'en_curso', current_date - 20, current_date - 15, current_date + 45, 'Jose', 'Alonso', 'contratista', 'aaaaaaaa-0000-4000-8000-000000000031', 'aiu', 10, 5, 10, 19, 30, 35, 'Proyecto de prueba AIU con presupuesto, cronograma, compras y gastos'),
  ('aaaaaaaa-0000-4000-8000-000000000102', '[PRUEBA] Detección de Incendio Bodega Norte', 'CTO-PRU-002', 'aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000012', 'Cartagena', 'COT-PRU-2026-02', 'detenido', current_date - 10, current_date - 5, current_date + 30, 'Jose', 'Alonso', 'personal_propio', null, 'iva', 0, 0, 0, 19, 0, 10, 'Proyecto de prueba IVA pleno en estado crítico/detenido para Comité')
on conflict (id) do nothing;

-- 5. PRESUPUESTO DE ÍTEMS (COTIZACIÓN + COSTOS)
insert into public.presupuesto_items (id, proyecto_id, tipo, orden, codigo, referencia, descripcion, marca, unidad, cantidad, tiempo_entrega, pu_venta, cu_material)
values
  ('aaaaaaaa-0000-4000-8000-000000000201', 'aaaaaaaa-0000-4000-8000-000000000101', 'capitulo', 1, '1', null, 'SISTEMA DE CCTV IP', null, null, 1, null, 0, 0),
  ('aaaaaaaa-0000-4000-8000-000000000202', 'aaaaaaaa-0000-4000-8000-000000000101', 'item', 2, '1.1', 'DS-2CD2143G2', 'Cámara Domo IP 4MP PoE Exterior', 'Hikvision', 'Und', 12, '5 días', 480000, 310000),
  ('aaaaaaaa-0000-4000-8000-000000000203', 'aaaaaaaa-0000-4000-8000-000000000101', 'item', 3, '1.2', 'DS-7616NI-Q2', 'NVR 16 Canales 4K con 2 Bahías SATA', 'Hikvision', 'Und', 1, '5 días', 1650000, 1120000),
  ('aaaaaaaa-0000-4000-8000-000000000204', 'aaaaaaaa-0000-4000-8000-000000000101', 'capitulo', 4, '2', null, 'INFRAESTRUCTURA Y CANALIZACIÓN', null, null, 1, null, 0, 0),
  ('aaaaaaaa-0000-4000-8000-000000000205', 'aaaaaaaa-0000-4000-8000-000000000101', 'item', 5, '2.1', 'TUB-EMT-34', 'Tubería EMT 3/4" x 3m con accesorios', 'Colmena', 'Tramo', 40, '2 días', 42000, 26500),
  ('aaaaaaaa-0000-4000-8000-000000000206', 'aaaaaaaa-0000-4000-8000-000000000101', 'item', 6, '2.2', 'CAJ-PASO-20', 'Caja de paso metálica 20x20x10 NEMA 1', 'Melecha', 'Und', 8, '2 días', 295000, 210000),
  ('aaaaaaaa-0000-4000-8000-000000000207', 'aaaaaaaa-0000-4000-8000-000000000102', 'capitulo', 1, '1', null, 'DETECCIÓN DE INCENDIO', null, null, 1, null, 0, 0),
  ('aaaaaaaa-0000-4000-8000-000000000208', 'aaaaaaaa-0000-4000-8000-000000000102', 'item', 2, '1.1', 'NFW-50X', 'Panel de detección direccionable 50 puntos', 'Notifier', 'Und', 1, '8 días', 5400000, 3900000)
on conflict (id) do nothing;

-- 6. CRONOGRAMA DE PROYECTO DE PRUEBA
insert into public.proyecto_cronograma (id, proyecto_id, orden, fase, titulo, responsable, fecha_inicio, fecha_fin, progreso, estado)
values
  ('aaaaaaaa-0000-4000-8000-000000000301', 'aaaaaaaa-0000-4000-8000-000000000101', 1, 'pre_inicio', 'Acta de inicio y visita técnica', 'Jose', current_date - 15, current_date - 12, 100, 'completada'),
  ('aaaaaaaa-0000-4000-8000-000000000302', 'aaaaaaaa-0000-4000-8000-000000000101', 2, 'pre_inicio', 'Compra y logística de materiales', 'Marta', current_date - 11, current_date - 3, 75, 'en_curso'),
  ('aaaaaaaa-0000-4000-8000-000000000303', 'aaaaaaaa-0000-4000-8000-000000000101', 3, 'ejecucion', 'Tendido de tubería EMT y cajas de paso', 'Carlos Méndez', current_date - 2, current_date + 10, 40, 'en_curso'),
  ('aaaaaaaa-0000-4000-8000-000000000304', 'aaaaaaaa-0000-4000-8000-000000000101', 4, 'ejecucion', 'Instalación de cámaras y NVR', 'Carlos Méndez', current_date + 11, current_date + 25, 0, 'pendiente'),
  ('aaaaaaaa-0000-4000-8000-000000000305', 'aaaaaaaa-0000-4000-8000-000000000101', 5, 'post_finalizacion', 'Pruebas, capacitación y acta de entrega', 'Jose', current_date + 26, current_date + 35, 0, 'pendiente')
on conflict (id) do nothing;

-- 7. GASTOS Y FACTURAS DE PRUEBA
insert into public.gastos (id, proyecto_id, fecha, tipo, proveedor_id, documento, presupuesto_item_id, descripcion, cantidad, valor_unitario, observaciones)
values
  ('aaaaaaaa-0000-4000-8000-000000000401', 'aaaaaaaa-0000-4000-8000-000000000101', current_date - 8, 'Material', 'aaaaaaaa-0000-4000-8000-000000000022', 'FV-1045', 'aaaaaaaa-0000-4000-8000-000000000205', 'Compra parcial tubería EMT 3/4"', 20, 24800, 'Gasto de prueba compra 1'),
  ('aaaaaaaa-0000-4000-8000-000000000402', 'aaaaaaaa-0000-4000-8000-000000000101', current_date - 4, 'Mano de obra contratista', null, 'CTA-01', null, 'Anticipo cuadrilla instalación tubería', 1, 950000, 'Gasto de prueba mano de obra')
on conflict (id) do nothing;

insert into public.facturas (id, proyecto_id, numero_factura, valor, fecha_emision, fecha_vencimiento, estado, notas)
values
  ('aaaaaaaa-0000-4000-8000-000000000451', 'aaaaaaaa-0000-4000-8000-000000000101', 'FE-PRU-101', 3500000, current_date - 12, current_date + 18, 'pagada', 'Anticipo 30% [PRUEBA]'),
  ('aaaaaaaa-0000-4000-8000-000000000452', 'aaaaaaaa-0000-4000-8000-000000000101', 'FE-PRU-102', 2800000, current_date - 2, current_date + 28, 'pendiente', 'Corte avance #1 [PRUEBA]')
on conflict (id) do nothing;

-- 8. COMPRAS OPERATIVO DE PRUEBA (SOLICITUDES, COMPARATIVO Y ORDEN)
insert into public.compras_solicitudes (id, numero, proyecto_id, origen, empresa_id, cliente_id, titulo, estado, fecha_solicitud, notas)
values
  ('aaaaaaaa-0000-4000-8000-000000000501', 'SOL-PRU-001', 'aaaaaaaa-0000-4000-8000-000000000101', 'proyecto', 'aaaaaaaa-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000011', '[PRUEBA] Cámaras y NVR Altavista (Compra #2)', 'en_comparativo', current_date - 1, 'Lista para comparar precios entre 3 proveedores'),
  ('aaaaaaaa-0000-4000-8000-000000000502', 'SOL-PRU-002', 'aaaaaaaa-0000-4000-8000-000000000101', 'proyecto', 'aaaaaaaa-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000011', '[PRUEBA] Cajas de paso y saldo tubería', 'presentada', current_date - 2, 'Lista para presentar en Comité y aprobar'),
  ('aaaaaaaa-0000-4000-8000-000000000503', 'SOL-PRU-003', null, 'suministro', 'aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000012', '[PRUEBA] Suministro directo lectores biométricos', 'ordenada', current_date - 5, 'Compra directa de suministro sin proyecto')
on conflict (id) do nothing;

insert into public.compras_solicitud_items (id, solicitud_id, presupuesto_item_id, codigo, descripcion, unidad, cantidad_presupuestada, cantidad_solicitada, costo_presupuestado_unit, proveedor_1_id, precio_1, proveedor_2_id, precio_2, proveedor_3_id, precio_3, proveedor_ganador_id, precio_ganador)
values
  ('aaaaaaaa-0000-4000-8000-000000000511', 'aaaaaaaa-0000-4000-8000-000000000501', 'aaaaaaaa-0000-4000-8000-000000000202', '1.1', 'Cámara Domo IP 4MP PoE Exterior', 'Und', 12, 12, 310000, 'aaaaaaaa-0000-4000-8000-000000000021', 295000, 'aaaaaaaa-0000-4000-8000-000000000023', 289000, null, null, 'aaaaaaaa-0000-4000-8000-000000000023', 289000),
  ('aaaaaaaa-0000-4000-8000-000000000512', 'aaaaaaaa-0000-4000-8000-000000000501', 'aaaaaaaa-0000-4000-8000-000000000203', '1.2', 'NVR 16 Canales 4K con 2 Bahías SATA', 'Und', 1, 1, 1120000, 'aaaaaaaa-0000-4000-8000-000000000021', 1180000, 'aaaaaaaa-0000-4000-8000-000000000023', 1150000, null, null, 'aaaaaaaa-0000-4000-8000-000000000023', 1150000),
  ('aaaaaaaa-0000-4000-8000-000000000513', 'aaaaaaaa-0000-4000-8000-000000000502', 'aaaaaaaa-0000-4000-8000-000000000206', '2.2', 'Caja de paso metálica 20x20x10 NEMA 1', 'Und', 8, 8, 210000, 'aaaaaaaa-0000-4000-8000-000000000022', 192000, 'aaaaaaaa-0000-4000-8000-000000000021', 205000, null, null, 'aaaaaaaa-0000-4000-8000-000000000022', 192000),
  ('aaaaaaaa-0000-4000-8000-000000000514', 'aaaaaaaa-0000-4000-8000-000000000503', null, 'SUM-01', 'Lector biométrico ZKTeco ProFace X', 'Und', 4, 4, 1450000, 'aaaaaaaa-0000-4000-8000-000000000021', 1380000, null, null, null, null, 'aaaaaaaa-0000-4000-8000-000000000021', 1380000)
on conflict (id) do nothing;

insert into public.compras_ordenes (id, solicitud_id, empresa_id, proveedor_id, numero_orden, tipo, subtotal, iva, retenciones, total, estado, notas)
values
  ('aaaaaaaa-0000-4000-8000-000000000521', 'aaaaaaaa-0000-4000-8000-000000000503', 'aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000021', 'PRE-2026-9001', 'pre_orden', 5520000, 1048800, 160080, 6408720, 'emitida', 'Pre-orden de prueba para transcribir en Siigo')
on conflict (id) do nothing;

-- 9. CRM COMERCIAL Y OFERTAS PRE-VENTA DE PRUEBA
insert into public.crm_oportunidades (id, titulo, cliente_id, empresa_id, etapa, tipo_servicio, prioridad, valor_estimado, costo_estimado, probabilidad, fecha_cierre_estimada, descripcion, contacto_nombre, contacto_telefono, oferta_preventa_id)
values
  ('aaaaaaaa-0000-4000-8000-000000000601', '[PRUEBA] Ampliación Control de Acceso Torre B', 'aaaaaaaa-0000-4000-8000-000000000011', 'aaaaaaaa-0000-4000-8000-000000000002', 'cotizacion', 'control_acceso', 'alta', 28500000, 19500000, 60, current_date + 15, 'Oportunidad vinculada a Ofertas Pre-venta', 'Laura Gómez', '3012223344', 'aaaaaaaa-0000-4000-8000-000000000701'),
  ('aaaaaaaa-0000-4000-8000-000000000602', '[PRUEBA] Barreras Vehiculares Parqueadero', 'aaaaaaaa-0000-4000-8000-000000000012', 'aaaaaaaa-0000-4000-8000-000000000001', 'por_revisar', 'control_acceso', 'media', 18000000, 12000000, 20, current_date + 30, 'Lead entrante pendiente de llamada', 'Carlos Torres', '3025556677', null),
  ('aaaaaaaa-0000-4000-8000-000000000603', '[PRUEBA] Circuito Cerrado Perimetral Fase 2', 'aaaaaaaa-0000-4000-8000-000000000011', 'aaaaaaaa-0000-4000-8000-000000000002', 'negociacion', 'cctv', 'alta', 42000000, 29000000, 75, current_date + 7, 'Oferta enviada al cliente en seguimiento', 'Laura Gómez', '3012223344', 'aaaaaaaa-0000-4000-8000-000000000702')
on conflict (id) do nothing;

insert into public.crm_ofertas_preventa (id, oportunidad_id, titulo, cliente_id, empresa_id, estado, prioridad, valor_estimado, fecha_limite, descripcion, informe_levantamiento, subtareas, historial_relevos)
values
  ('aaaaaaaa-0000-4000-8000-000000000701', 'aaaaaaaa-0000-4000-8000-000000000601', '[PRUEBA] Ampliación Control de Acceso Torre B', 'aaaaaaaa-0000-4000-8000-000000000011', 'aaaaaaaa-0000-4000-8000-000000000002', 'en_proceso', 'alta', 28500000, current_date + 3, 'Cotización de 6 puertas con electroimán y lectoras RFID', 'Levantamiento realizado con planos de Torre B', '[{"texto":"Validar distancias de cableado UTP","hecha":true},{"texto":"Cotizar electroimanes 600lbs con SAC","hecha":false}]'::jsonb, '[{"fecha":"2026-11-10","de":"Comercial","para":"Alonso (Pre-venta)","nota":"Enviado con informe de visita"}]'::jsonb),
  ('aaaaaaaa-0000-4000-8000-000000000702', 'aaaaaaaa-0000-4000-8000-000000000603', '[PRUEBA] Circuito Cerrado Perimetral Fase 2', 'aaaaaaaa-0000-4000-8000-000000000011', 'aaaaaaaa-0000-4000-8000-000000000002', 'finalizado', 'alta', 42000000, current_date + 1, 'Oferta económica lista para enviar al cliente', 'Informe fotográfico de postes perimetrales', '[{"texto":"Revisar margen AIU","hecha":true}]'::jsonb, '[]'::jsonb),
  ('aaaaaaaa-0000-4000-8000-000000000703', null, '[PRUEBA] Levantamiento Alarma Bodega Sur', 'aaaaaaaa-0000-4000-8000-000000000012', 'aaaaaaaa-0000-4000-8000-000000000001', 'levantamiento', 'media', 9500000, current_date + 5, 'Pendiente visita de campo para conteo de sensores', '', '[]'::jsonb, '[]'::jsonb)
on conflict (id) do nothing;
