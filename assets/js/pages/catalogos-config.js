(() => {
  const CATALOGOS = {
    clientes: {
      tabla: "clientes",
      titulo: "Clientes",
      detalleUrl: (fila) => `cliente-detalle.html?id=${fila.id}`,
      campos: [
        { key: "nombre", label: "Nombre / Razón social", tipo: "text", requerido: true },
        { key: "nit", label: "NIT", tipo: "text" },
        { key: "notas", label: "Notas", tipo: "text" },
      ],
    },
    proveedores: {
      tabla: "proveedores",
      titulo: "Proveedores",
      detalleUrl: (fila) => `proveedor-detalle.html?id=${fila.id}`,
      campos: [
        { key: "nombre", label: "Nombre", tipo: "text", requerido: true },
        { key: "nit", label: "NIT", tipo: "text" },
        { key: "categoria", label: "Categoría", tipo: "text" },
        { key: "notas", label: "Notas", tipo: "text", enTabla: false },
      ],
    },
    contratistas: {
      tabla: "contratistas",
      titulo: "Contratistas",
      campos: [
        { key: "nombre", label: "Nombre / Cuadrilla", tipo: "text", requerido: true },
        {
          key: "tipo_persona",
          label: "Tipo",
          tipo: "select",
          requerido: true,
          opciones: [
            { value: "empresa", label: "Empresa" },
            { value: "persona_natural", label: "Persona Natural" },
          ],
        },
        {
          key: "es_declarante_renta",
          label: "¿Declarante de renta?",
          tipo: "boolean",
          showIf: { key: "tipo_persona", value: "persona_natural" },
          enTabla: false,
        },
        { key: "porcentaje_retencion", label: "Retención", tipo: "porcentaje", calculado: true },
        { key: "identificacion", label: "Identificación / NIT", tipo: "text", enTabla: false },
        { key: "especialidad", label: "Especialidad", tipo: "text" },
        { key: "telefono", label: "Teléfono", tipo: "tel" },
        { key: "email", label: "Correo", tipo: "email", enTabla: false },
      ],
    },
    empresas: {
      tabla: "empresas",
      titulo: "Empresas",
      campos: [
        { key: "nombre", label: "Nombre / Razón social", tipo: "text", requerido: true },
        { key: "nit", label: "NIT", tipo: "text" },
        { key: "direccion", label: "Dirección", tipo: "text" },
        { key: "telefono", label: "Teléfono", tipo: "tel" },
        { key: "email", label: "Correo", tipo: "email" },
      ],
      campoImagen: { key: "logo_url", bucket: "logos", label: "Logo" },
    },
  };

  const DETALLES = {
    clientes: {
      tablaPadre: "clientes",
      tablaHija: "clientes_contactos",
      fk: "cliente_id",
      titulo: "Cliente",
      volverHref: "clientes.html",
      tiposContacto: [
        { value: "contabilidad", label: "Contabilidad" },
        { value: "compras", label: "Compras" },
        { value: "proyectos", label: "Proyectos" },
        { value: "otro", label: "Otro" },
      ],
    },
    proveedores: {
      tablaPadre: "proveedores",
      tablaHija: "proveedores_contactos",
      fk: "proveedor_id",
      titulo: "Proveedor",
      volverHref: "proveedores.html",
      campoExtra: { key: "categoria", label: "Categoría" },
      tiposContacto: [
        { value: "contabilidad", label: "Contabilidad" },
        { value: "comercial", label: "Comercial" },
        { value: "despacho_logistica", label: "Despacho / Logística" },
        { value: "cartera", label: "Cartera" },
        { value: "garantias", label: "Garantías" },
        { value: "otro", label: "Otro" },
      ],
    },
  };

  const catalogo = document.body?.dataset?.catalogo;
  if (catalogo && CATALOGOS[catalogo]) {
    window.CATALOGO_CONFIG = CATALOGOS[catalogo];
  }

  const detalle = document.body?.dataset?.detalle;
  if (detalle && DETALLES[detalle]) {
    window.DETALLE_CONFIG = DETALLES[detalle];
  }
})();
