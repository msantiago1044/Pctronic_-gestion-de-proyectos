-- ============================================================================
-- Pctronic - Carga idempotente de cronograma para proyecto Mapei (Voz y Datos)
-- Ejecutar en Supabase SQL Editor.
-- Busca en public.proyectos un registro cuyo nombre coincida con '%mape%',
-- y si aún no tiene actividades en public.proyecto_cronograma, inserta el
-- cronograma completo en las 3 fases (pre_inicio, ejecucion, post_finalizacion)
-- anclado a coalesce(p.fecha_inicio, current_date).
-- ============================================================================

do $$
declare
  v_proyecto_id     uuid;
  v_proyecto_nombre text;
  v_base_fecha      date;
  v_existentes      int;
begin
  select
    p.id,
    p.nombre,
    coalesce(p.fecha_inicio, current_date)
  into
    v_proyecto_id,
    v_proyecto_nombre,
    v_base_fecha
  from public.proyectos p
  where p.nombre ilike '%mape%'
  order by p.fecha_inicio desc nulls last, p.id
  limit 1;

  if v_proyecto_id is null then
    raise notice 'No se encontró ningún proyecto en public.proyectos con nombre ILIKE ''%%mape%%''. No se insertaron actividades.';
    return;
  end if;

  select count(*)
  into v_existentes
  from public.proyecto_cronograma pc
  where pc.proyecto_id = v_proyecto_id;

  if v_existentes > 0 then
    raise notice 'El proyecto "%" (id: %) ya tiene % actividad(es) en public.proyecto_cronograma. No se realizaron inserciones.',
      v_proyecto_nombre, v_proyecto_id, v_existentes;
    return;
  end if;

  insert into public.proyecto_cronograma (
    proyecto_id,
    orden,
    fase,
    titulo,
    responsable,
    fecha_inicio,
    fecha_fin,
    progreso,
    estado,
    notas
  )
  values
    -- FASE 1: PRE-INICIO
    (
      v_proyecto_id,
      1,
      'pre_inicio',
      'Visita técnica y replanteo en sitio',
      'Director de Proyecto',
      v_base_fecha,
      v_base_fecha + 2,
      0,
      'pendiente',
      'Levantamiento de recorridos, ubicación de racks, puntos de voz/datos y validación de acometidas.'
    ),
    (
      v_proyecto_id,
      2,
      'pre_inicio',
      'Acta de inicio y permisos de trabajo',
      'Director de Proyecto',
      v_base_fecha + 2,
      v_base_fecha + 4,
      0,
      'pendiente',
      'Firma de acta de inicio, afiliaciones SST/ARL, permisos de trabajo en alturas y acceso a planta.'
    ),
    (
      v_proyecto_id,
      3,
      'pre_inicio',
      'Requisición y compra de materiales (tubería, cableado UTP, racks, patch panels)',
      'Compras / Administración',
      v_base_fecha + 3,
      v_base_fecha + 7,
      0,
      'pendiente',
      'Solicitud de cotizaciones, aprobación y orden de compra de tubería EMT, cable UTP Cat6/6A, fibra, gabinetes y accesorios.'
    ),
    (
      v_proyecto_id,
      4,
      'pre_inicio',
      'Logística y despacho a obra',
      'Logística / Almacén',
      v_base_fecha + 7,
      v_base_fecha + 9,
      0,
      'pendiente',
      'Verificación de inventario, alistamiento de herramienta y traslado de materiales al sitio del proyecto.'
    ),

    -- FASE 2: EJECUCIÓN
    (
      v_proyecto_id,
      5,
      'ejecucion',
      'Tendido de tubería EMT y canalización',
      'Cuadrilla Técnica',
      v_base_fecha + 10,
      v_base_fecha + 15,
      0,
      'pendiente',
      'Instalación de tubería EMT, bandejas portacables, cajas de paso, curvas y soportes según replanteo.'
    ),
    (
      v_proyecto_id,
      6,
      'ejecucion',
      'Tendido de cableado estructurado UTP/fibra',
      'Cuadrilla Técnica',
      v_base_fecha + 15,
      v_base_fecha + 20,
      0,
      'pendiente',
      'Halado de cableado horizontal UTP y enlaces troncales de fibra óptica respetando radios de curvatura.'
    ),
    (
      v_proyecto_id,
      7,
      'ejecucion',
      'Instalación de gabinetes/racks y patch panels',
      'Técnico Especialista',
      v_base_fecha + 20,
      v_base_fecha + 22,
      0,
      'pendiente',
      'Montaje y fijación de gabinetes de comunicaciones, organizadores horizontales/verticales, PDU y patch panels.'
    ),
    (
      v_proyecto_id,
      8,
      'ejecucion',
      'Ponchado, etiquetado y certificación de puntos',
      'Técnico Especialista',
      v_base_fecha + 22,
      v_base_fecha + 26,
      0,
      'pendiente',
      'Conectorización de jacks RJ45 y patch panels, marquilla normalizada y certificación con equipo analizador de red.'
    ),
    (
      v_proyecto_id,
      9,
      'ejecucion',
      'Instalación de equipos activos',
      'Ingeniero de Soporte / Redes',
      v_base_fecha + 26,
      v_base_fecha + 28,
      0,
      'pendiente',
      'Montaje, conexionado y puesta en marcha de switches, puntos de acceso y patch cords en rack.'
    ),

    -- FASE 3: POST-FINALIZACIÓN
    (
      v_proyecto_id,
      10,
      'post_finalizacion',
      'Pruebas finales y entrega de memorias/planos as-built',
      'Director de Proyecto',
      v_base_fecha + 29,
      v_base_fecha + 31,
      0,
      'pendiente',
      'Validación integral de conectividad, entrega de reportes de certificación, inventario de puntos y planos as-built.'
    ),
    (
      v_proyecto_id,
      11,
      'post_finalizacion',
      'Capacitación y acta de entrega final',
      'Director de Proyecto',
      v_base_fecha + 31,
      v_base_fecha + 33,
      0,
      'pendiente',
      'Socialización de la infraestructura instalada al cliente y firma de acta de recibo a satisfacción.'
    );

  raise notice 'Cronograma insertado correctamente: 11 actividades en 3 fases para el proyecto "%" (id: %), fecha base: %.',
    v_proyecto_nombre, v_proyecto_id, v_base_fecha;
end $$;
