# Pctronic — Sistema de gestión de proyectos

App web de Pctronic Seguridad Electrónica (instalaciones CCTV, control de acceso, alarmas, cableado).
Dueño y usuario principal: Jose. **No es programador**: explica los cambios en español, simple, y avisa
siempre qué debe hacer él después (subir a GitHub, correr SQL en Supabase, etc.).

## Stack y despliegue

- Frontend: HTML + CSS + JavaScript planos. **Sin frameworks complejos.** Tailwind por CDN.
- Librerías por CDN: supabase-js v2, SheetJS (xlsx), jsPDF + jspdf-autotable. ExcelJS 4.4.0 + JSZip 3.10.1
  se cargan **solo al exportar** (`PCT.cargarExcelJS`), porque SheetJS gratis no conserva formato ni logo.
- Backend: Supabase (Postgres + Auth + Storage + RLS). No hay servidor propio.
- Despliegue: push a GitHub (rama `main`) → Vercel publica automáticamente.
  - En Vercel: Configurar las variables `SUPABASE_URL` y `SUPABASE_ANON_KEY` en **Project Settings → Environment Variables**. Durante el build (`npm run build`), `scripts/build.js` genera `assets/js/config.js` de forma segura.
  - Supabase se actualiza con `sql/schema.sql` (montaje inicial) o `sql/migracion_*.sql` en el SQL Editor.
- Seguridad de credenciales: El repositorio no almacena llaves privadas ni URLs hardcodeadas en texto plano para proteger el repositorio público de GitHub. La llave `service_role` jamás va en el repo ni en el frontend.

## Estructura

- `*.html` una página por vista; `assets/js/<pagina>.js` su lógica; `assets/js/layout.js` barra lateral,
  login obligatorio y `window.pctronicReady` (→ `{session, profile}`, `profile.rol` = `admin|miembro`).
- `assets/js/util.js` formato de moneda/fechas, `mostrarAviso`, `manejarError`, campos de moneda.
- **Proyectos** (el núcleo, en rediseño): `proyecto-nuevo.html`, `proyecto-detalle.html` y los módulos
  `assets/js/proy/*.js`, todos colgados de `window.PCT`:
  `core.js` (estado, carga, cálculos, modal) · `importar.js` (Excel: cotización de Pctronic y plantilla v7,
  + plantilla de cotización descargable) · `inicio.js` (datos y parámetros) · `presupuesto.js` (pestañas
  **Cotización** y **Presupuesto de costos**) · `avance.js` (avance diario) · `cortes.js` (Cortes cliente +
  `PCT.editorCorte` y `PCT.pdfActa`, compartidos) · `manoobra.js` (contrato y cortes del contratista, pagos,
  técnicos propios) · `documentos.js`.
  Cada pestaña se redibuja al abrirse.
- **Nombres**: en pantalla se dice **Cotización** (precios al cliente) y **Presupuesto de costos** (costos
  internos). Nunca "Presupuesto" a secas para lo que paga el cliente. En la BD sigue siendo una sola tabla
  `presupuesto_items` (no se renombró para no romper nada).
- `sql/schema.sql` esquema completo. **Hace DROP + CREATE de todo** (solo para montar una base desde cero).
  Los cambios nuevos van además en `sql/migracion_*.sql` que no borran nada (`add column if not exists`);
  a Jose se le pide correr solo la migración.
- `docs/PCT_Plantilla_Proyecto_v7.xlsx` plantilla de Excel que es la **especificación funcional** de Proyectos
  (hoja GUÍA APP = tablas y reglas de negocio). Léela antes de construir una fase nueva. Su hoja PRESUPUESTO
  equivale en la app a Cotización + Presupuesto de costos.
- **Formato real de la cotización de Pctronic** (hoja "Cotizador"): encabezado (Referencia, Descripción = nombre
  del proyecto, Fecha, Validez, Cliente, Ciudad, Atención, Correo, Teléfono, Cotización No.), ítems con columnas
  `# · REFERENCIA · DESCRIPCIÓN · CANT. · UNIDAD · TIEMPO DE ENTREGA · MARCA · Precio Unitario · Subtotal ·
  Observaciones`, agrupados por secciones (Suministro, Instalación → capítulos), y abajo dos totales sobre el
  mismo subtotal: "TOTAL OFERTA SUMINISTROS" (IVA pleno) y "TOTAL OFERTA AIU INSTALACION" (A, I, U, IVA sobre U).
  Trae solo precios de venta, no costos. Al importarla en Nuevo proyecto se pregunta con cuál oferta aceptó el
  cliente (`tipo_contrato` = `aiu` | `iva`). Puede traer filas `#REF!`: se ignoran.
  El cotizador completo (ej. Mapei) trae además, a la derecha de la columna J, columnas internas de costo
  (Costo, Moneda, Ref Fabricante, Descripcion, **Tipo**, Margen, TRM...): la tabla se corta en la primera
  columna vacía después de "Descripción" para no mezclarlas. Títulos de sección: uno solo → capítulo; dos
  seguidos → capítulo + subcapítulo (y los siguientes sueltos, subcapítulos). Si el IVA pleno dice
  "Total Propuesta Suministros + IVA" y no trae columna "TOTAL", la fórmula busca los subtotales de cada
  sección y los suma (así funciona el Excel de Mapei). Si no se detectan totales, calcula:
  `costo_directo = sum(cant × unitario)`, `iva = costo_directo × 19%`, `total = costo_directo + iva`.
  Acepta también el formato viejo (`ITEM · DESCRIPCIÓN · CANT · UNIDAD · VR. UNITARIO · VR. TOTAL`).
- **Margen bruto del proyecto**:
  - Contrato AIU: utilidad pactada menos retención en la fuente asumida.
  - Contrato IVA pleno: valor contratado sin IVA menos costos directos presupuestados.
  - Margen bruto actual (lo que va ganando el proyecto hoy): valor ejecutado (avance físico real aplicado
    al valor del contrato) menos costos reales acumulados (cortes de contratistas aprobados + gastos registrados).
- **Control de costos en compras**: al registrar una compra para un proyecto, se puede marcar qué ítem
  del presupuesto cubre. Si la compra supera el costo presupuestado de ese ítem, la app avisa para que no
  haya sorpresas al final.
- **Fase 2: Cortes cliente y Mano de obra (completada)**:
  - Pestaña **Cortes cliente**: cortes parciales al cliente según avance. Cada corte tiene número consecutivo,
    fecha, porcentaje acumulado anterior y actual, amortización de anticipo (si el proyecto tiene anticipo),
    retención en garantía (si aplica) y saldo neto a cobrar. Al aprobar un corte, genera automáticamente la
    factura en borrador (con fecha de vencimiento según días de crédito) y permite descargar el **Acta de Corte en PDF**
    (con logo de la empresa ejecutora, firmas de contratista/interventor/cliente).
  - Pestaña **Mano de obra**: contrato con contratistas (valor pactado, anticipo, retención según tipo de persona:
    natural declarante 4 %, no declarante 6 %, empresa 0 %) y sus cortes parciales según avance reportado.
    Los técnicos propios de nómina se registran aquí también por día/horas trabajadas usando la tabla `tarifas_tecnicos`.
    Al aprobar un corte del contratista, genera automáticamente el gasto en Compras/Costos.
  - Componentes compartidos en `cortes.js`:
    - `PCT.editorCorte({ titulo, tipo, consecutivo, items, anticipo, retencion, alGuardar })`: modal reutilizable
      para editar cortes (cliente o contratista).
    - `PCT.pdfActa({ empresa, proyecto, corte, items, firmas })`: generador del PDF oficial del acta.

## Decisiones tomadas

- **Nombres**: Cotización y Presupuesto de costos. No confundir con "Presupuesto" a secas.
- **Tipos de contrato**: `aiu` (instalaciones grandes) o `iva` (suministros puros o proyectos sin AIU).
- **ExcelJS**: se carga dinámicamente con `PCT.cargarExcelJS()` solo cuando el usuario da click en exportar.
  No pesa en la carga inicial de ninguna página.
- **Auditoría de seguridad**: Bucket `documentos` privado para evitar fuga de contratos y planos; restricción
  de escalamiento de privilegios en `profiles` para que solo administradores modifiquen roles; configuración
  inyectable mediante variables de entorno en Vercel.
