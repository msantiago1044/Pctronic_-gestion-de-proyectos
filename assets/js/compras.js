// ============================================================================
// COMPRAS OPERATIVO · Solicitudes, Cuadro Comparativo estilo Excel (hasta 3
// proveedores, multimoneda COP/USD + TRM en vivo), Presentación a Comité
// (PDF + correo Gmail + deep-link), Aprobación y Generación de Pre-orden /
// Orden de Compra (consecutivo atómico, retenciones y registro en `gastos`).
// ============================================================================
(async () => {
  const { session } = await window.pctronicReady;

  let solicitudes = [];
  let ordenes = [];
  let proveedores = [];
  let empresas = [];
  let proyectos = [];
  let clientes = [];
  let itemsPrevios = []; // compras_solicitud_items históricos para detectar compras previas

  let solicitudActual = null;
  let itemsActuales = [];
  let nuevoOrigen = "manual";
  let nuevoItems = [];

  const ESTADOS_SOL = {
    pendiente: { label: "Pendiente", clase: "bg-amber-100 text-amber-800" },
    en_comparativo: { label: "En Comparativo", clase: "bg-blue-100 text-blue-800" },
    presentada: { label: "Presentada", clase: "bg-indigo-100 text-indigo-800" },
    aprobada: { label: "Aprobada", clase: "bg-emerald-100 text-emerald-800" },
    ordenada: { label: "Ordenada", clase: "bg-green-100 text-green-800" },
    rechazada: { label: "Rechazada", clase: "bg-red-100 text-red-800" },
  };

  const ORIGEN_LABEL = {
    proyecto: "Proyecto",
    suministro: "Suministro",
    manual: "Manual / Excel",
  };

  // --------------------------------------------------------------------------
  // HELPERS DE FORMATO, MODALES Y COMPATIBILIDAD SUPABASE
  // --------------------------------------------------------------------------
  const hoyLocal = () => {
    if (typeof fechaLocalISO === "function") return fechaLocalISO();
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  function formatoCOP(valor) {
    const n = Math.round(Number(valor || 0));
    if (!Number.isFinite(n)) return "$ 0";
    return n.toLocaleString("es-CO", {
      style: "currency",
      currency: "COP",
      maximumFractionDigits: 0,
    });
  }

  function formatoUSD(valor) {
    const n = Number(valor || 0);
    if (!Number.isFinite(n)) return "US$ 0.00";
    return n.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  function abrirModal(el) {
    if (!el) return;
    el.classList.remove("hidden");
    el.classList.add("flex");
  }

  function cerrarModal(el) {
    if (!el) return;
    el.classList.add("hidden");
    el.classList.remove("flex");
  }

  function esSuperUsuario() {
    return Boolean(
      window.PCT_ROL_INFO?.esSuperUsuario ||
        ["super_usuario", "admin"].includes(window.PCT_ROL_INFO?.rol) ||
        ["super_usuario", "admin"].includes(window.PCT_ROL_INFO?.rolRaw)
    );
  }

  function esErrorColumnaFaltante(error) {
    if (!error) return false;
    const code = String(error.code || "");
    const msg = `${error.message || ""} ${error.details || ""} ${error.hint || ""}`;
    return code === "42703" || code === "PGRST204" || /column|schema cache/i.test(msg);
  }

  async function actualizarSolicitudSeguro(solicitudId, basePayload, extraPayload = {}) {
    const hasExtra = extraPayload && Object.keys(extraPayload).length > 0;
    const payloadCompleto = hasExtra ? { ...basePayload, ...extraPayload } : { ...basePayload };
    const res = await window.sb.from("compras_solicitudes").update(payloadCompleto).eq("id", solicitudId);
    if (!res.error) return res;
    if (hasExtra && esErrorColumnaFaltante(res.error)) {
      // Si el fallo puede ser solo por `motivo_seleccion` aún no migrado, reintentar conservando los demás campos extra
      if ("motivo_seleccion" in extraPayload && Object.keys(extraPayload).length > 1) {
        const extraSinMotivo = { ...extraPayload };
        delete extraSinMotivo.motivo_seleccion;
        const resIntermedio = await window.sb
          .from("compras_solicitudes")
          .update({ ...basePayload, ...extraSinMotivo })
          .eq("id", solicitudId);
        if (!resIntermedio.error) {
          console.warn("La columna motivo_seleccion aún no existe en compras_solicitudes; se guardaron los demás campos.");
          return resIntermedio;
        }
      }
      console.warn("Algunas columnas nuevas de compras_solicitudes aún no existen en BD; guardando campos base.", res.error);
      if (Object.keys(basePayload).length === 0) return { data: null, error: null };
      return window.sb.from("compras_solicitudes").update(basePayload).eq("id", solicitudId);
    }
    return res;
  }

  async function insertarOrdenCompraSeguro(basePayload, extraPayload = {}) {
    const hasExtra = extraPayload && Object.keys(extraPayload).length > 0;
    const payloadCompleto = hasExtra ? { ...basePayload, ...extraPayload } : { ...basePayload };
    const res = await window.sb.from("compras_ordenes").insert(payloadCompleto).select().single();
    if (!res.error) return res;
    if (hasExtra && esErrorColumnaFaltante(res.error)) {
      console.warn("Algunas columnas opcionales de compras_ordenes aún no existen en BD; insertando campos base.", res.error);
      return window.sb.from("compras_ordenes").insert(basePayload).select().single();
    }
    return res;
  }

  async function insertarGastosOrdenSeguro(rowsBase, ordenId) {
    if (!Array.isArray(rowsBase) || !rowsBase.length) return { data: [], error: null };
    const rowsConOc = ordenId ? rowsBase.map((r) => ({ ...r, orden_compra_id: ordenId })) : rowsBase;
    const res = await window.sb.from("gastos").insert(rowsConOc);
    if (!res.error) return res;
    if (ordenId && esErrorColumnaFaltante(res.error)) {
      console.warn("La columna orden_compra_id aún no existe en gastos; insertando gastos sin vínculo de columna.", res.error);
      return window.sb.from("gastos").insert(rowsBase);
    }
    return res;
  }

  async function eliminarGastosDeOrdenSeguro(orden, proyectoId = null) {
    if (!orden) return;
    // 1. Intentar borrar por orden_compra_id si la columna existe
    if (orden.id) {
      const resPorId = await window.sb.from("gastos").delete().eq("orden_compra_id", orden.id);
      if (resPorId.error && !esErrorColumnaFaltante(resPorId.error)) {
        console.warn("Error al eliminar gastos por orden_compra_id:", resPorId.error);
      }
    }
    // 2. Borrar también filas previas vinculadas por documento = numero_orden (esquema histórico)
    const numDoc = orden.numero_orden || orden.numero || "";
    if (numDoc) {
      let query = window.sb.from("gastos").delete().eq("documento", numDoc);
      if (proyectoId) query = query.eq("proyecto_id", proyectoId);
      const resPorDoc = await query;
      if (resPorDoc.error && !esErrorColumnaFaltante(resPorDoc.error)) {
        console.warn("Error al eliminar gastos por documento de orden:", resPorDoc.error);
      }
    }
  }

  async function obtenerConsecutivo(tipo, fallbackFn) {
    if (typeof window.sb?.rpc === "function") {
      try {
        const { data, error } = await window.sb.rpc("rpc_siguiente_consecutivo", { p_tipo: tipo });
        if (!error && typeof data === "string" && data.trim()) {
          return data.trim();
        }
      } catch (e) {
        console.warn("Fallback consecutivo local para", tipo, e);
      }
    }
    return fallbackFn();
  }

  async function registrarNotificacion({ tipo, titulo, mensaje, url, rol_destino, proyecto_id }) {
    try {
      const { error } = await window.sb.from("notificaciones").insert({
        tipo: tipo || "compra_comite",
        titulo,
        mensaje: mensaje || null,
        url: url || null,
        rol_destino: Array.isArray(rol_destino) && rol_destino.length ? rol_destino : ["super_usuario", "directivo"],
        proyecto_id: proyecto_id || null,
        creado_por: session?.user?.id || null,
      });
      if (error) {
        console.warn("No se pudo registrar notificación (tabla pendiente de migración o RLS):", error.message);
      }
    } catch (e) {
      console.warn("Error silencioso al crear notificación:", e);
    }
  }

  // --------------------------------------------------------------------------
  // CARGA DE CATÁLOGOS Y DATOS
  // --------------------------------------------------------------------------
  async function cargarCatalogos() {
    const [pRes, eRes, prRes, cRes] = await Promise.all([
      window.sb.from("proveedores").select("*").order("nombre"),
      window.sb.from("empresas").select("*").order("nombre"),
      window.sb.from("proyectos").select("*").order("nombre"),
      window.sb.from("clientes").select("id, nombre").order("nombre"),
    ]);
    if (pRes.error) return manejarError(pRes.error, "No se pudo cargar los proveedores");
    if (eRes.error) return manejarError(eRes.error, "No se pudo cargar las empresas");
    if (prRes.error) return manejarError(prRes.error, "No se pudo cargar los proyectos");
    if (cRes.error) return manejarError(cRes.error, "No se pudo cargar los clientes");
    proveedores = pRes.data || [];
    empresas = eRes.data || [];
    proyectos = prRes.data || [];
    clientes = cRes.data || [];
  }

  async function cargarDatos() {
    const [sRes, oRes] = await Promise.all([
      window.sb
        .from("compras_solicitudes")
        .select("*, proyectos(*), empresas(id, nombre, nit, direccion, telefono, email, logo_url), clientes(id, nombre)")
        .order("created_at", { ascending: false }),
      window.sb
        .from("compras_ordenes")
        .select("*, compras_solicitudes(numero, titulo)")
        .order("created_at", { ascending: false }),
    ]);

    if (sRes.error) return manejarError(sRes.error, "No se pudo cargar las solicitudes");
    if (oRes.error) return manejarError(oRes.error, "No se pudo cargar las órdenes");

    solicitudes = sRes.data || [];
    ordenes = (oRes.data || []).map((o) => ({
      ...o,
      empresas: empresas.find((e) => e.id === o.empresa_id) || null,
      proveedores: proveedores.find((p) => p.id === o.proveedor_id) || null,
    }));

    if (solicitudActual) {
      const actualizada = solicitudes.find((s) => s.id === solicitudActual.id);
      if (actualizada) solicitudActual = actualizada;
    }

    actualizarKPIs();
    renderSolicitudes();
    renderOrdenes();
  }

  function actualizarKPIs() {
    document.getElementById("kpi-pendientes").textContent = solicitudes.filter((s) => s.estado === "pendiente").length;
    document.getElementById("kpi-comparativo").textContent = solicitudes.filter((s) => ["en_comparativo", "presentada"].includes(s.estado)).length;
    document.getElementById("kpi-aprobadas").textContent = solicitudes.filter((s) => ["aprobada", "ordenada"].includes(s.estado)).length;
    const totalOrd = ordenes.reduce((a, o) => a + Number(o.total || 0), 0);
    document.getElementById("kpi-total-comprado").textContent = formatoCOP(totalOrd);
  }

  function renderSolicitudes() {
    const q = document.getElementById("filtro-busqueda").value.trim().toLowerCase();
    const est = document.getElementById("filtro-estado").value;
    const orig = document.getElementById("filtro-origen").value;

    const lista = solicitudes.filter((s) => {
      if (est && s.estado !== est) return false;
      if (orig && s.origen !== orig) return false;
      if (!q) return true;
      return (
        (s.numero || "").toLowerCase().includes(q) ||
        (s.titulo || "").toLowerCase().includes(q) ||
        (s.proyectos?.nombre || "").toLowerCase().includes(q) ||
        (s.clientes?.nombre || "").toLowerCase().includes(q)
      );
    });

    const puedeEliminar = esSuperUsuario();
    const tbody = document.getElementById("tabla-solicitudes");
    tbody.innerHTML = lista.length
      ? lista
          .map((s) => {
            const yaTieneOrden = s.estado === "ordenada" || ordenes.some((o) => o.solicitud_id === s.id);
            const btnGenerarOc =
              s.estado === "aprobada" && !yaTieneOrden
                ? `<button type="button" data-generar-orden="${s.id}" class="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700" title="Generar Orden de Compra y cargar a Gastos">
                    <span class="material-symbols-outlined text-[15px]" aria-hidden="true">receipt_long</span> Generar OC
                  </button>`
                : "";
            const btnEliminar = puedeEliminar
              ? `<button type="button" data-eliminar-sol="${s.id}" class="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100" title="Eliminar solicitud de compra">
                  <span class="material-symbols-outlined text-[15px]" aria-hidden="true">delete</span> Eliminar
                </button>`
              : "";
            return `
          <tr class="border-b border-gray-50 last:border-0 hover:bg-gray-50">
            <td class="px-4 py-3 font-mono text-xs font-semibold text-gray-700">${escapeHtml(s.numero || "—")}</td>
            <td class="px-4 py-3 font-medium text-gray-900">${escapeHtml(s.titulo)}</td>
            <td class="px-4 py-3"><span class="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">${escapeHtml(ORIGEN_LABEL[s.origen] || s.origen)}</span></td>
            <td class="px-4 py-3 text-gray-600">${escapeHtml(s.proyectos?.nombre || s.clientes?.nombre || "—")}</td>
            <td class="px-4 py-3 text-gray-600">${escapeHtml(s.empresas?.nombre || "—")}</td>
            <td class="px-4 py-3 text-gray-500">${formatoFecha(s.fecha_solicitud)}</td>
            <td class="px-4 py-3">${badgeHtml(ESTADOS_SOL, s.estado)}</td>
            <td class="px-4 py-3 text-right whitespace-nowrap">
              <div class="inline-flex items-center justify-end gap-1.5">
                <button type="button" data-abrir-sol="${s.id}" class="rounded-lg bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-primary hover:bg-blue-100">
                  Comparativo
                </button>
                <button type="button" data-abrir-comite="${s.id}" class="inline-flex items-center gap-1 rounded-lg bg-indigo-50 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100">
                  <span class="material-symbols-outlined text-[15px]" aria-hidden="true">co_present</span> Comité
                </button>
                ${btnGenerarOc}
                ${btnEliminar}
              </div>
            </td>
          </tr>`;
          })
          .join("")
      : `<tr><td class="px-4 py-8 text-center text-gray-400" colspan="8">No hay solicitudes para ese filtro.</td></tr>`;
  }

  function renderOrdenes() {
    const puedeEliminar = esSuperUsuario();
    const tbody = document.getElementById("tabla-ordenes");
    tbody.innerHTML = ordenes.length
      ? ordenes
          .map((o) => {
            const btnEliminar = puedeEliminar
              ? `<button type="button" data-eliminar-orden="${o.id}" class="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-100" title="Eliminar orden de compra y sus gastos vinculados">
                  <span class="material-symbols-outlined text-[15px]" aria-hidden="true">delete</span> Eliminar
                </button>`
              : "";
            return `
          <tr class="border-b border-gray-50 last:border-0 hover:bg-gray-50">
            <td class="px-4 py-3 font-mono text-xs font-semibold">${escapeHtml(o.numero_orden || "—")}</td>
            <td class="px-4 py-3">
              <span class="rounded-full px-2 py-0.5 text-xs font-semibold ${o.tipo === "pre_orden" ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800"}">
                ${o.tipo === "pre_orden" ? "Pre-orden (Siigo)" : "Orden de Compra"}
              </span>
            </td>
            <td class="px-4 py-3 text-gray-700">${escapeHtml(o.empresas?.nombre || "—")}</td>
            <td class="px-4 py-3 font-medium text-gray-900">${escapeHtml(o.proveedores?.nombre || "—")}</td>
            <td class="px-4 py-3 text-right tabular-nums">${formatoCOP(o.subtotal)}</td>
            <td class="px-4 py-3 text-right tabular-nums text-red-600">${formatoCOP(o.retenciones)}</td>
            <td class="px-4 py-3 text-right font-bold tabular-nums">${formatoCOP(o.total)}</td>
            <td class="px-4 py-3 text-gray-500">${formatoFecha(o.created_at)}</td>
            <td class="px-4 py-3 text-right whitespace-nowrap">
              <div class="inline-flex items-center justify-end gap-1.5">
                <button type="button" data-pdf-orden="${o.id}" class="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50">
                  <span class="material-symbols-outlined text-[15px]" aria-hidden="true">picture_as_pdf</span> PDF
                </button>
                ${btnEliminar}
              </div>
            </td>
          </tr>`;
          })
          .join("")
      : `<tr><td class="px-4 py-8 text-center text-gray-400" colspan="9">Aún no se han emitido órdenes de compra.</td></tr>`;
  }

  // Tabs
  document.querySelectorAll(".tab-compras").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll(".tab-compras").forEach((b) => {
        const activo = b.dataset.tab === tab;
        b.className = activo
          ? "tab-compras rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white"
          : "tab-compras rounded-lg border border-gray-300 bg-white px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50";
      });
      document.getElementById("vista-solicitudes").classList.toggle("hidden", tab !== "solicitudes");
      document.getElementById("vista-ordenes").classList.toggle("hidden", tab !== "ordenes");
    });
  });

  document.getElementById("filtro-busqueda").addEventListener("input", renderSolicitudes);
  document.getElementById("filtro-estado").addEventListener("change", renderSolicitudes);
  document.getElementById("filtro-origen").addEventListener("change", renderSolicitudes);

  // --------------------------------------------------------------------------
  // NUEVA SOLICITUD (Manual/Excel o Suministro)
  // --------------------------------------------------------------------------
  const modalNueva = document.getElementById("modal-nueva-sol");
  const modalCmp = document.getElementById("modal-comparativo");
  const modalComite = document.getElementById("modal-comite");
  const modalHist = document.getElementById("modal-historial-item");
  const modalEliminar = document.getElementById("modal-eliminar-compra");
  let pendienteEliminar = null; // { tipo: 'solicitud' | 'orden', id: string }

  function poblarSelectsNueva() {
    document.getElementById("ns-empresa").innerHTML = empresas.map((e) => `<option value="${e.id}">${escapeHtml(e.nombre)}</option>`).join("");
    document.getElementById("ns-proyecto").innerHTML =
      `<option value="">— Sin proyecto —</option>` + proyectos.map((p) => `<option value="${p.id}">${escapeHtml(p.nombre)}</option>`).join("");
    document.getElementById("ns-cliente").innerHTML =
      `<option value="">— Selecciona un cliente —</option>` + clientes.map((c) => `<option value="${c.id}">${escapeHtml(c.nombre)}</option>`).join("");
  }

  function renderNuevoItems() {
    const tbody = document.getElementById("ns-items-tbody");
    tbody.innerHTML = nuevoItems.length
      ? nuevoItems
          .map(
            (it, idx) => `
          <tr class="border-t border-gray-100">
            <td class="p-1.5"><input data-ns-idx="${idx}" data-ns-f="codigo" value="${escapeHtml(it.codigo)}" class="w-full rounded border-gray-300 px-2 py-1 text-xs" /></td>
            <td class="p-1.5"><input data-ns-idx="${idx}" data-ns-f="descripcion" value="${escapeHtml(it.descripcion)}" class="w-full rounded border-gray-300 px-2 py-1 text-xs" /></td>
            <td class="p-1.5"><input data-ns-idx="${idx}" data-ns-f="unidad" value="${escapeHtml(it.unidad)}" class="w-full rounded border-gray-300 px-2 py-1 text-xs" /></td>
            <td class="p-1.5"><input data-ns-idx="${idx}" data-ns-f="cantidad_solicitada" type="number" step="0.01" min="0.01" value="${it.cantidad_solicitada}" class="w-full rounded border-gray-300 px-2 py-1 text-xs text-right" /></td>
            <td class="p-1.5"><input data-ns-idx="${idx}" data-ns-f="costo_presupuestado_unit" type="number" step="1" min="0" value="${it.costo_presupuestado_unit}" class="w-full rounded border-gray-300 px-2 py-1 text-xs text-right" /></td>
            <td class="p-1.5 text-center"><button type="button" data-ns-del="${idx}" class="text-red-500 hover:text-red-700"><span class="material-symbols-outlined text-[16px]" aria-hidden="true">delete</span></button></td>
          </tr>`
          )
          .join("")
      : `<tr><td colspan="6" class="p-4 text-center text-gray-400">Agrega ítems manualmente o carga un archivo Excel.</td></tr>`;
  }

  function abrirModalNueva(origen) {
    nuevoOrigen = origen;
    poblarSelectsNueva();
    document.getElementById("ns-titulo-modal").textContent =
      origen === "suministro" ? "Iniciar Compra de Suministro (sin proyecto)" : "Nueva Solicitud Manual / Plantilla Excel";
    document.getElementById("ns-wrap-proyecto").classList.toggle("hidden", origen === "suministro");
    document.getElementById("ns-wrap-cliente").classList.toggle("hidden", origen !== "suministro");
    document.getElementById("ns-titulo").value = "";
    document.getElementById("ns-notas").value = "";
    nuevoItems = [{ codigo: "", descripcion: "", unidad: "Und", cantidad_solicitada: 1, costo_presupuestado_unit: 0 }];
    renderNuevoItems();
    abrirModal(modalNueva);
  }

  document.getElementById("btn-nueva-manual").addEventListener("click", () => abrirModalNueva("manual"));
  document.getElementById("btn-nueva-suministro").addEventListener("click", () => abrirModalNueva("suministro"));
  document.getElementById("ns-cerrar").addEventListener("click", () => cerrarModal(modalNueva));
  document.getElementById("ns-cancelar").addEventListener("click", () => cerrarModal(modalNueva));

  document.getElementById("ns-agregar-item").addEventListener("click", () => {
    nuevoItems.push({ codigo: "", descripcion: "", unidad: "Und", cantidad_solicitada: 1, costo_presupuestado_unit: 0 });
    renderNuevoItems();
  });

  document.getElementById("ns-items-tbody").addEventListener("input", (e) => {
    const idx = e.target.dataset.nsIdx;
    const f = e.target.dataset.nsF;
    if (idx === undefined || !f) return;
    if (["cantidad_solicitada", "costo_presupuestado_unit"].includes(f)) {
      const val = Number(e.target.value || 0);
      nuevoItems[Number(idx)][f] = Number.isFinite(val) && val >= 0 ? val : 0;
      if (val < 0) e.target.value = "0";
    } else {
      nuevoItems[Number(idx)][f] = e.target.value;
    }
  });

  document.getElementById("ns-items-tbody").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-ns-del]");
    if (!btn) return;
    nuevoItems.splice(Number(btn.dataset.nsDel), 1);
    renderNuevoItems();
  });

  document.getElementById("ns-descargar-plantilla").addEventListener("click", async () => {
    if (typeof asegurarXLSX === "function") await asegurarXLSX();
    descargarPlantillaExcel(
      "plantilla_solicitud_compra.xlsx",
      ["Código", "Descripción", "Unidad", "Cantidad", "Costo Presupuestado"],
      [["CAM-01", "Cámara Bullet IP 4MP", "Und", 10, 320000]]
    );
  });

  document.getElementById("ns-cargar-excel").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    try {
      if (typeof asegurarXLSX === "function") await asegurarXLSX();
      const filas = await leerArchivoExcel(file);
      const parseados = filas
        .map((r) => ({
          codigo: String(r["Código"] || r["Codigo"] || r["codigo"] || "").trim(),
          descripcion: String(r["Descripción"] || r["Descripcion"] || r["descripcion"] || "").trim(),
          unidad: String(r["Unidad"] || r["Und"] || r["unidad"] || "Und").trim(),
          cantidad_solicitada: Math.max(0, Number(r["Cantidad"] || r["Cant"] || r["cantidad"] || 1) || 1),
          costo_presupuestado_unit: Math.max(0, Number(r["Costo Presupuestado"] || r["Costo"] || r["costo"] || 0) || 0),
        }))
        .filter((x) => x.descripcion);
      if (!parseados.length) return mostrarAviso("No se encontraron filas con «Descripción» en el Excel", "error");
      nuevoItems = parseados;
      renderNuevoItems();
      mostrarAviso(`Se cargaron ${parseados.length} ítems del Excel`, "exito");
    } catch (err) {
      manejarError(err, "Error al leer el archivo Excel");
    }
  });

  document.getElementById("ns-guardar").addEventListener("click", async () => {
    const titulo = document.getElementById("ns-titulo").value.trim();
    const empresaId = document.getElementById("ns-empresa").value || null;
    const proyectoId = nuevoOrigen === "suministro" ? null : document.getElementById("ns-proyecto").value || null;
    const clienteId = nuevoOrigen === "suministro" ? document.getElementById("ns-cliente").value || null : null;
    const itemsValidos = nuevoItems.filter((i) => i.descripcion.trim());

    if (!titulo) return mostrarAviso("Ingresa un título para la solicitud", "error");
    if (nuevoOrigen === "suministro" && !clienteId) return mostrarAviso("Selecciona un cliente para el suministro", "error");
    if (!itemsValidos.length) return mostrarAviso("Agrega al menos un ítem válido", "error");

    const numero = await obtenerConsecutivo(
      "solicitud",
      () => `SOL-${new Date().getFullYear()}-${String(solicitudes.length + 1).padStart(4, "0")}`
    );
    try {
      const { data: sol, error } = await window.sb
        .from("compras_solicitudes")
        .insert({
          numero,
          titulo,
          origen: proyectoId ? "proyecto" : nuevoOrigen,
          empresa_id: empresaId,
          proyecto_id: proyectoId,
          cliente_id: clienteId,
          solicitado_por: session.user.id,
          notas: document.getElementById("ns-notas").value.trim() || null,
        })
        .select()
        .single();
      if (error) throw error;

      const rows = itemsValidos.map((i) => ({
        solicitud_id: sol.id,
        codigo: i.codigo || null,
        descripcion: i.descripcion.trim(),
        unidad: i.unidad || "Und",
        cantidad_presupuestada: i.cantidad_solicitada,
        cantidad_solicitada: i.cantidad_solicitada,
        costo_presupuestado_unit: i.costo_presupuestado_unit || 0,
      }));
      const { error: errIt } = await window.sb.from("compras_solicitud_items").insert(rows);
      if (errIt) throw errIt;

      cerrarModal(modalNueva);
      mostrarAviso(`Solicitud ${numero} creada`, "exito");
      await cargarDatos();
      abrirComparativo(sol.id);
    } catch (err) {
      manejarError(err, "No se pudo crear la solicitud");
    }
  });

  // --------------------------------------------------------------------------
  // CUADRO COMPARATIVO (ESTILO EXCEL · MULTIMONEDA · TRM EN VIVO)
  // --------------------------------------------------------------------------
  function getMonedasActuales(sol = solicitudActual, desdeDom = true) {
    if (desdeDom && modalCmp && !modalCmp.classList.contains("hidden")) {
      return {
        1: document.getElementById("cmp-moneda-1")?.value || sol?.moneda_p1 || "COP",
        2: document.getElementById("cmp-moneda-2")?.value || sol?.moneda_p2 || "COP",
        3: document.getElementById("cmp-moneda-3")?.value || sol?.moneda_p3 || "COP",
      };
    }
    return {
      1: sol?.moneda_p1 || "COP",
      2: sol?.moneda_p2 || "COP",
      3: sol?.moneda_p3 || "COP",
    };
  }

  function getTrmActual(sol = solicitudActual, desdeDom = true) {
    if (desdeDom && modalCmp && !modalCmp.classList.contains("hidden")) {
      const el = document.getElementById("cmp-trm");
      const val = el && el.value !== "" ? Number(el.value) : 0;
      return Number.isFinite(val) && val > 0 ? val : 0;
    }
    const val = Number(sol?.trm || 0);
    return Number.isFinite(val) && val > 0 ? val : 0;
  }

  function getIvaPorcentajeActual(sol = solicitudActual) {
    const el = document.getElementById("cmp-iva-porcentaje");
    const raw = el && el.value !== "" ? Number(el.value) : Number(sol?.iva_porcentaje ?? 19);
    return Number.isFinite(raw) && raw >= 0 && raw <= 100 ? raw : 19;
  }

  function opcionesProveedores(selectedId, excludedIds = []) {
    return (
      `<option value="">— Seleccionar proveedor —</option>` +
      proveedores
        .map((p) => {
          const isSelected = p.id === selectedId;
          const isDisabled = !isSelected && excludedIds.includes(p.id);
          return `<option value="${p.id}" ${isSelected ? "selected" : ""} ${isDisabled ? "disabled" : ""}>${escapeHtml(p.nombre)}${isDisabled ? " (ya seleccionado)" : ""}</option>`;
        })
        .join("")
    );
  }

  function sincronizarSelectoresProveedores(evitarToast = false) {
    const s1 = document.getElementById("cmp-prov-1");
    const s2 = document.getElementById("cmp-prov-2");
    const s3 = document.getElementById("cmp-prov-3");
    if (!s1 || !s2 || !s3) return;

    let v1 = s1.value || "";
    let v2 = s2.value || "";
    let v3 = s3.value || "";
    let huboDuplicado = false;

    if (v2 && v2 === v1) {
      v2 = "";
      huboDuplicado = true;
    }
    if (v3 && (v3 === v1 || v3 === v2)) {
      v3 = "";
      huboDuplicado = true;
    }

    s1.innerHTML = opcionesProveedores(v1, [v2, v3].filter(Boolean));
    s2.innerHTML = opcionesProveedores(v2, [v1, v3].filter(Boolean));
    s3.innerHTML = opcionesProveedores(v3, [v1, v2].filter(Boolean));
    s1.value = v1;
    s2.value = v2;
    s3.value = v3;

    if (huboDuplicado && !evitarToast) {
      mostrarAviso("No puedes seleccionar el mismo proveedor en dos columnas", "error");
    }

    const activos = [v1 || null, v2 || null, v3 || null].filter(Boolean);
    itemsActuales.forEach((it) => {
      it.proveedor_1_id = v1 || null;
      it.proveedor_2_id = v2 || null;
      it.proveedor_3_id = v3 || null;
      if (it.proveedor_ganador_id && !activos.includes(it.proveedor_ganador_id)) {
        it.proveedor_ganador_id = null;
        it._ganadorManual = false;
      }
    });
  }

  function actualizarHeaderTrm(trmVal) {
    const badge = document.getElementById("cmp-trm-badge");
    const trmNum = Number(trmVal || 0);
    if (badge) {
      if (trmNum > 0) {
        badge.textContent = `TRM: ${formatoCOP(trmNum)}`;
        badge.classList.remove("hidden");
      } else {
        badge.textContent = "";
        badge.classList.add("hidden");
      }
    }

    const proyBadge = document.getElementById("cmp-trm-proyecto-badge");
    if (!proyBadge) return;
    const trmProy = Number(solicitudActual?.proyectos?.trm_cotizacion || 0);
    if (trmProy > 0) {
      const actualTxt = trmNum > 0 ? formatoCOP(trmNum) : "sin definir";
      proyBadge.textContent = `TRM cotización: ${formatoCOP(trmProy)} vs TRM actual: ${actualTxt}`;
      let colorClase = "bg-blue-50 text-blue-800";
      if (trmNum > 0 && trmNum > trmProy) colorClase = "bg-red-100 text-red-800";
      else if (trmNum > 0 && trmNum <= trmProy) colorClase = "bg-emerald-100 text-emerald-800";
      proyBadge.className = `rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${colorClase}`;
    } else {
      proyBadge.textContent = "";
      proyBadge.classList.add("hidden");
    }
  }

  // Cálculo SIEMPRE en vivo desde los precios actuales de precio_1/2/3 + moneda + TRM + descuento.
  // Evita el bug de precio_ganador obsoleto (stale price).
  function calcularItemComparativo(it, opts = {}) {
    const trm = opts.trm !== undefined ? Number(opts.trm || 0) : getTrmActual();
    const monedas = opts.monedas || getMonedasActuales();

    const leerSlot = (slot) => {
      const pid = it[`proveedor_${slot}_id`];
      const raw = it[`precio_${slot}`];
      const num = pid && raw !== null && raw !== undefined && raw !== "" ? Number(raw) : null;
      if (num === null || !Number.isFinite(num) || num <= 0) return null;
      const moneda = monedas[slot] || "COP";
      const precioCop = moneda === "USD" ? (trm > 0 ? num * trm : 0) : num;
      return { slot, id: pid, precioOrig: num, moneda, precioCop };
    };

    const s1 = leerSlot(1);
    const s2 = leerSlot(2);
    const s3 = leerSlot(3);
    const candidatos = [s1, s2, s3].filter(Boolean);
    const candidatosValidos = candidatos.filter((c) => c.precioCop > 0);

    let mejor = null;
    candidatosValidos.forEach((c) => {
      if (!mejor || c.precioCop < mejor.precioCop) mejor = c;
    });

    let ganadorCand = null;
    if (it._ganadorManual && it.proveedor_ganador_id) {
      ganadorCand = candidatos.find((c) => c.id === it.proveedor_ganador_id) || null;
    } else if (!it._ganadorManual && it._ganadorManual === undefined && it.proveedor_ganador_id) {
      // Compatibilidad cuando se llama fuera de abrirComparativo (ej. directo en Comité)
      ganadorCand = candidatos.find((c) => c.id === it.proveedor_ganador_id) || null;
    }
    if (!ganadorCand) {
      ganadorCand = mejor;
    }

    const ganadorId = ganadorCand?.id || it.proveedor_ganador_id || null;
    const ganadorSlot = ganadorCand?.slot || null;
    const precioGanador = ganadorCand
      ? ganadorCand.precioCop
      : !candidatos.length && Number(it.precio_ganador) > 0
      ? Number(it.precio_ganador)
      : 0;

    const descuentoPct = Math.min(100, Math.max(0, Number(it.descuento_pct || 0)));
    const precioNetoUnit = precioGanador * (1 - descuentoPct / 100);
    const presupUnit = Number(it.costo_presupuestado_unit || 0);
    const cant = Number(it.cantidad_solicitada || 1);
    const presupTotal = presupUnit * cant;
    const subtotalBruto = precioGanador * cant;
    const descuentoMonto = subtotalBruto * (descuentoPct / 100);
    const subtotalNeto = subtotalBruto - descuentoMonto;
    const tieneComparacion = presupTotal > 0 && subtotalNeto > 0;
    const diffTotal = tieneComparacion ? presupTotal - subtotalNeto : 0;
    const pctAhorro = tieneComparacion ? (diffTotal / presupTotal) * 100 : 0;
    const sobrecosto = presupUnit > 0 && precioNetoUnit > presupUnit;

    return {
      slots: { 1: s1, 2: s2, 3: s3 },
      mejor,
      ganadorId,
      ganadorSlot,
      ganadorCand,
      precioGanador,
      descuentoPct,
      precioNetoUnit,
      presupUnit,
      presupTotal,
      subtotalBruto,
      descuentoMonto,
      subtotalNeto,
      tieneComparacion,
      diffTotal,
      pctAhorro,
      sobrecosto,
      candidatos,
    };
  }

  function actualizarResumenComparativo() {
    const prov1Id = document.getElementById("cmp-prov-1")?.value || null;
    const prov2Id = document.getElementById("cmp-prov-2")?.value || null;
    const prov3Id = document.getElementById("cmp-prov-3")?.value || null;
    const monedas = getMonedasActuales();
    const trm = getTrmActual();
    const ivaPct = getIvaPorcentajeActual();

    const nombreProv = (id) => proveedores.find((p) => p.id === id)?.nombre || "Sin asignar";
    const th1 = document.getElementById("th-prov-1");
    const th2 = document.getElementById("th-prov-2");
    const th3 = document.getElementById("th-prov-3");
    if (th1) th1.textContent = `${prov1Id ? nombreProv(prov1Id) : "Proveedor 1"} (${monedas[1]})`;
    if (th2) th2.textContent = `${prov2Id ? nombreProv(prov2Id) : "Proveedor 2"} (${monedas[2]})`;
    if (th3) th3.textContent = `${prov3Id ? nombreProv(prov3Id) : "Proveedor 3"} (${monedas[3]})`;

    const totalItems = itemsActuales.length;
    let totPresup = 0;
    let totGanador = 0;
    let totP1 = 0;
    let totP2 = 0;
    let totP3 = 0;
    let cntP1 = 0;
    let cntP2 = 0;
    let cntP3 = 0;
    let haySobrecosto = false;
    let hayUsdSinTrm = false;

    itemsActuales.forEach((it) => {
      it.proveedor_1_id = prov1Id;
      it.proveedor_2_id = prov2Id;
      it.proveedor_3_id = prov3Id;
      const cant = Number(it.cantidad_solicitada || 1);
      const calc = calcularItemComparativo(it, { trm, monedas });

      totPresup += calc.presupTotal;
      totGanador += calc.subtotalNeto;
      if (calc.sobrecosto) haySobrecosto = true;

      if (calc.slots[1]) {
        cntP1 += 1;
        totP1 += calc.slots[1].precioCop * cant;
        if (monedas[1] === "USD" && trm <= 0) hayUsdSinTrm = true;
      }
      if (calc.slots[2]) {
        cntP2 += 1;
        totP2 += calc.slots[2].precioCop * cant;
        if (monedas[2] === "USD" && trm <= 0) hayUsdSinTrm = true;
      }
      if (calc.slots[3]) {
        cntP3 += 1;
        totP3 += calc.slots[3].precioCop * cant;
        if (monedas[3] === "USD" && trm <= 0) hayUsdSinTrm = true;
      }
    });

    const resumenProvs = [
      { slot: 1, id: prov1Id, nombre: prov1Id ? nombreProv(prov1Id) : "Proveedor 1", moneda: monedas[1], total: totP1, cotizados: cntP1 },
      { slot: 2, id: prov2Id, nombre: prov2Id ? nombreProv(prov2Id) : "Proveedor 2", moneda: monedas[2], total: totP2, cotizados: cntP2 },
      { slot: 3, id: prov3Id, nombre: prov3Id ? nombreProv(prov3Id) : "Proveedor 3", moneda: monedas[3], total: totP3, cotizados: cntP3 },
    ];

    // Solo corona "Más económico" entre proveedores que cotizaron TODOS los ítems
    const completos = resumenProvs
      .filter((x) => x.id && x.total > 0 && totalItems > 0 && x.cotizados === totalItems)
      .sort((a, b) => a.total - b.total);
    const masEconomico = completos[0] || null;

    const tieneAhorro = totPresup > 0 && totGanador > 0;
    const ahorro = tieneAhorro ? totPresup - totGanador : 0;
    const pctAhorro = tieneAhorro ? (ahorro / totPresup) * 100 : 0;
    const ivaMonto = totGanador * (ivaPct / 100);
    const totalConIva = totGanador + ivaMonto;

    document.getElementById("cmp-resumen").innerHTML = `
      <div class="rounded-xl border border-gray-200 bg-white p-3">
        <p class="text-[11px] font-semibold uppercase text-gray-500">Presupuesto Base</p>
        <p class="mt-1 text-base font-bold tabular-nums">${formatoCOP(totPresup)}</p>
      </div>
      <div class="rounded-xl border border-gray-200 bg-white p-3">
        <p class="text-[11px] font-semibold uppercase text-gray-500">SubTotal Selección Ganadora</p>
        <p class="mt-1 text-base font-bold tabular-nums text-primary">${formatoCOP(totGanador)}</p>
      </div>
      <div class="rounded-xl border border-gray-200 bg-white p-3">
        <p class="text-[11px] font-semibold uppercase text-gray-500">${ahorro >= 0 ? "Ahorro Total" : "Sobrecosto Total"}</p>
        <p class="mt-1 text-base font-bold tabular-nums ${!tieneAhorro ? "text-gray-400" : ahorro >= 0 ? "text-emerald-600" : "text-red-600"}">
          ${tieneAhorro ? `${formatoCOP(ahorro)} (${pctAhorro.toFixed(1)}%)` : "—"}
        </p>
      </div>
      <div class="rounded-xl border border-gray-200 bg-white p-3">
        <p class="text-[11px] font-semibold uppercase text-gray-500">Prov. Más Económico (Completo)</p>
        <p class="mt-1 text-xs font-bold text-gray-900 truncate">
          ${masEconomico ? `${escapeHtml(masEconomico.nombre)} (${formatoCOP(masEconomico.total)})` : "Sin cotización completa"}
        </p>
      </div>`;

    // Tarjetas de Total por Proveedor
    const totProvEl = document.getElementById("cmp-totales-proveedores");
    if (totProvEl) {
      totProvEl.innerHTML = resumenProvs
        .map((p) => {
          const esMejor = masEconomico && masEconomico.slot === p.slot;
          const esParcial = p.id && p.cotizados > 0 && p.cotizados < totalItems;
          const badgeEstado = esMejor
            ? `<span class="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">Más económico</span>`
            : esParcial
            ? `<span class="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">Cotización parcial</span>`
            : "";
          return `
            <div class="rounded-xl border ${esMejor ? "border-emerald-400 bg-emerald-50/40" : "border-gray-200 bg-white"} p-3">
              <div class="flex items-center justify-between gap-2">
                <p class="text-xs font-bold text-gray-800 truncate">${escapeHtml(p.nombre)}</p>
                <span class="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-bold text-gray-700">${escapeHtml(p.moneda)}</span>
              </div>
              <div class="mt-1.5 flex items-baseline justify-between gap-2">
                <p class="text-base font-bold tabular-nums ${p.total > 0 ? "text-gray-900" : "text-gray-400"}">${p.total > 0 ? formatoCOP(p.total) : "—"}</p>
                <span class="text-[11px] text-gray-500">${p.cotizados}/${totalItems} ítems</span>
              </div>
              ${badgeEstado ? `<div class="mt-1.5">${badgeEstado}</div>` : ""}
            </div>`;
        })
        .join("");
    }

    // Bloque TOTAL OFERTA estilo Excel
    const boxEl = document.getElementById("cmp-total-oferta-box");
    if (boxEl) {
      const ahorroRowClass = !tieneAhorro
        ? "bg-gray-50 text-gray-600"
        : ahorro >= 0
        ? "bg-emerald-50 text-emerald-800"
        : "bg-red-600 text-white";
      boxEl.innerHTML = `
        <div class="bg-slate-800 px-4 py-2 text-xs font-bold uppercase tracking-wide text-white">Total Oferta Ganadora</div>
        <div class="divide-y divide-gray-100 text-xs">
          <div class="flex items-center justify-between px-4 py-2">
            <span class="text-gray-600">Presupuesto Base Total</span>
            <span class="font-semibold tabular-nums text-gray-900">${formatoCOP(totPresup)}</span>
          </div>
          <div class="flex items-center justify-between px-4 py-2">
            <span class="text-gray-600">SubTotal Oferta Ganadora</span>
            <span class="font-bold tabular-nums text-primary">${formatoCOP(totGanador)}</span>
          </div>
          <div class="flex items-center justify-between px-4 py-2">
            <span class="text-gray-600">IVA (${ivaPct}%)</span>
            <span class="font-semibold tabular-nums text-gray-900">${formatoCOP(ivaMonto)}</span>
          </div>
          <div class="flex items-center justify-between bg-slate-50 px-4 py-2.5">
            <span class="font-bold text-gray-900">Total Oferta (con IVA)</span>
            <span class="text-sm font-bold tabular-nums text-gray-900">${formatoCOP(totalConIva)}</span>
          </div>
          <div class="flex items-center justify-between px-4 py-2.5 font-bold ${ahorroRowClass}">
            <span>${ahorro >= 0 ? "AHORRO TOTAL" : "SOBRECOSTO TOTAL"}</span>
            <span class="text-sm tabular-nums">${tieneAhorro ? `${formatoCOP(ahorro)} (${pctAhorro.toFixed(1)}%)` : "—"}</span>
          </div>
        </div>`;
    }

    // Estado del motivo de selección (obligatorio si se elige un proveedor distinto al más económico)
    const estadoMotivo = actualizarEstadoMotivoComparativo(trm, monedas);

    // Alertas
    const alertas = [];
    if (estadoMotivo.requiereMotivo && !estadoMotivo.motivo) {
      alertas.push(`<div class="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
        <span class="material-symbols-outlined text-[18px]" aria-hidden="true">fact_check</span>
        Elegiste un proveedor distinto al más económico en ${estadoMotivo.count} ítem(s). Debes escribir el <strong>motivo de elección</strong> antes de guardar o presentar a Comité.
      </div>`);
    }
    if (hayUsdSinTrm) {
      alertas.push(`<div class="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
        <span class="material-symbols-outlined text-[18px]" aria-hidden="true">currency_exchange</span>
        Hay precios en USD pero la TRM está en 0. Haz clic en <strong>«TRM hoy»</strong> o ingresa la TRM para convertir a COP.
      </div>`);
    }
    if (haySobrecosto) {
      alertas.push(`<div class="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-800">
        <span class="material-symbols-outlined text-[18px]" aria-hidden="true">warning</span>
        Alerta de sobrecosto: Uno o más ítems superan el costo unitario presupuestado.
      </div>`);
    }
    const itemsRepetidos = itemsActuales.filter(
      (it) =>
        it.presupuesto_item_id &&
        itemsPrevios.some((p) => p.presupuesto_item_id === it.presupuesto_item_id && p.solicitud_id !== solicitudActual.id)
    );
    if (itemsRepetidos.length) {
      alertas.push(`<div class="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
        <span class="material-symbols-outlined text-[18px]" aria-hidden="true">history</span>
        ${itemsRepetidos.length} ítem(s) de esta solicitud ya registran compras en solicitudes anteriores. Revisa el historial en «Presentar Compra (Comité)».
      </div>`);
    }
    document.getElementById("cmp-alertas").innerHTML = alertas.join("");
  }

  function detectarEleccionNoMasEconomica(trm = getTrmActual(), monedas = getMonedasActuales()) {
    const itemsNoMasEconomicos = [];
    itemsActuales.forEach((it) => {
      const calc = calcularItemComparativo(it, { trm, monedas });
      if (
        calc.mejor &&
        calc.ganadorId &&
        calc.ganadorId !== calc.mejor.id &&
        (calc.precioGanador <= 0 || calc.precioGanador > calc.mejor.precioCop + 0.01)
      ) {
        itemsNoMasEconomicos.push({ it, calc });
      }
    });
    return {
      requiereMotivo: itemsNoMasEconomicos.length > 0,
      count: itemsNoMasEconomicos.length,
      items: itemsNoMasEconomicos,
    };
  }

  function actualizarEstadoMotivoComparativo(trm = getTrmActual(), monedas = getMonedasActuales()) {
    const { requiereMotivo, count } = detectarEleccionNoMasEconomica(trm, monedas);
    const wrap = document.getElementById("cmp-motivo-wrap");
    const badge = document.getElementById("cmp-motivo-req-badge");
    const ayuda = document.getElementById("cmp-motivo-ayuda");
    const input = document.getElementById("cmp-motivo-seleccion");
    const motivo = input?.value?.trim() || "";

    if (wrap && badge && ayuda) {
      if (requiereMotivo && !motivo) {
        wrap.className = "rounded-xl border-2 border-red-400 bg-red-50/60 p-3.5";
        badge.textContent = "Obligatorio";
        badge.className = "rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700";
        ayuda.className = "mb-1.5 text-[11px] font-medium text-red-700";
        ayuda.textContent = `Elegiste un proveedor distinto al más económico en ${count} ítem(s). Indica el motivo antes de guardar o presentar a Comité.`;
      } else if (requiereMotivo && motivo) {
        wrap.className = "rounded-xl border border-amber-300 bg-amber-50/50 p-3.5";
        badge.textContent = "Justificado";
        badge.className = "rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800";
        ayuda.className = "mb-1.5 text-[11px] text-amber-800";
        ayuda.textContent = `Motivo registrado para ${count} ítem(s) con proveedor distinto al más económico.`;
      } else {
        wrap.className = "rounded-xl border border-gray-200 bg-gray-50 p-3.5";
        badge.className = "hidden rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700";
        ayuda.className = "mb-1.5 text-[11px] text-gray-500";
        ayuda.textContent =
          "Opcional si se elige el proveedor más económico; obligatorio si seleccionas una opción distinta a la más económica.";
      }
    }
    return { requiereMotivo, count, motivo };
  }

  function actualizarBotonesOrden(estado, solicitudId = solicitudActual?.id) {
    const yaTieneOrden = estado === "ordenada" || (solicitudId ? ordenes.some((o) => o.solicitud_id === solicitudId) : false);
    const configs = [
      { id: "cmp-btn-orden", labelActiva: "Generar Orden / Pre-orden" },
      { id: "comite-btn-generar-orden", labelActiva: "Generar Orden de Compra" },
    ];
    configs.forEach(({ id, labelActiva }) => {
      const btn = document.getElementById(id);
      if (!btn) return;
      if (estado === "aprobada" && !yaTieneOrden) {
        btn.classList.remove("hidden");
        btn.disabled = false;
        btn.className =
          "inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700";
        btn.innerHTML = `<span class="material-symbols-outlined text-[16px]" aria-hidden="true">receipt_long</span> ${labelActiva}`;
      } else if (estado === "ordenada" || yaTieneOrden) {
        btn.classList.remove("hidden");
        btn.disabled = true;
        btn.className =
          "inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-gray-100 px-3.5 py-2 text-xs font-semibold text-gray-500 cursor-not-allowed";
        btn.innerHTML = `<span class="material-symbols-outlined text-[16px]" aria-hidden="true">check_circle</span> OC ya generada`;
      } else {
        btn.classList.add("hidden");
        btn.disabled = false;
      }
    });
  }

  function renderTextoTotalProveedor(slotCalc, cant) {
    if (!slotCalc) return `<span class="text-gray-300">—</span>`;
    if (slotCalc.moneda === "USD") {
      if (slotCalc.precioCop <= 0) {
        return `<span class="text-[10px] font-semibold text-amber-700">Falta TRM</span>`;
      }
      return `<div class="tabular-nums">${formatoCOP(slotCalc.precioCop * cant)}</div>
              <div class="text-[10px] text-gray-500 tabular-nums">${formatoUSD(slotCalc.precioOrig * cant)}</div>`;
    }
    return `<span class="tabular-nums">${formatoCOP(slotCalc.precioCop * cant)}</span>`;
  }

  function clasesCeldaGanador(esGanador) {
    return esGanador ? "bg-amber-100 ring-1 ring-amber-400 border-amber-400 font-semibold text-amber-950" : "";
  }

  function renderTablaComparativo() {
    const tbody = document.getElementById("cmp-tbody");
    const monedas = getMonedasActuales();
    const trm = getTrmActual();

    tbody.innerHTML = itemsActuales
      .map((it, idx) => {
        const calc = calcularItemComparativo(it, { trm, monedas });
        const cant = Number(it.cantidad_solicitada || 1);
        const esG1 = calc.ganadorSlot === 1;
        const esG2 = calc.ganadorSlot === 2;
        const esG3 = calc.ganadorSlot === 3;

        const opcGanador = [
          it.proveedor_1_id ? { id: it.proveedor_1_id, label: proveedores.find((p) => p.id === it.proveedor_1_id)?.nombre } : null,
          it.proveedor_2_id ? { id: it.proveedor_2_id, label: proveedores.find((p) => p.id === it.proveedor_2_id)?.nombre } : null,
          it.proveedor_3_id ? { id: it.proveedor_3_id, label: proveedores.find((p) => p.id === it.proveedor_3_id)?.nombre } : null,
        ].filter(Boolean);

        const diffClase = !calc.tieneComparacion
          ? "text-gray-400"
          : calc.diffTotal >= 0
          ? "bg-emerald-50 text-emerald-700 font-bold"
          : "bg-red-600 text-white font-bold";

        return `
        <tr data-cmp-row="${idx}" class="border-t border-gray-200 ${calc.sobrecosto ? "bg-red-50/30" : "hover:bg-gray-50/60"}">
          <td class="px-2 py-2 border-r border-gray-100 whitespace-nowrap">
            <div class="text-[10px] font-bold text-gray-400 mb-0.5">#${idx + 1}</div>
            <input type="text" data-cmp-idx="${idx}" data-cmp-text="referencia" value="${escapeHtml(it.referencia || it.codigo || "")}" placeholder="Ref."
              class="w-20 rounded border-gray-300 px-1.5 py-1 text-[11px]" />
          </td>
          <td class="px-2 py-2 border-r border-gray-100">
            <div class="font-medium text-gray-900 leading-snug">${escapeHtml(it.descripcion)}</div>
            <div class="text-[10px] text-gray-400">${escapeHtml(it.codigo || "")}${it.codigo ? " · " : ""}${escapeHtml(it.unidad || "Und")}</div>
          </td>
          <td class="px-2 py-2 border-r border-gray-100 text-right tabular-nums font-medium">${cant}</td>

          <!-- Presupuesto Base -->
          <td class="px-2 py-2 text-right tabular-nums text-gray-600 whitespace-nowrap bg-slate-50/50">${formatoCOP(calc.presupUnit)}</td>
          <td class="px-2 py-2 border-r border-gray-200 text-right tabular-nums font-medium text-gray-700 whitespace-nowrap bg-slate-50/50">${formatoCOP(calc.presupTotal)}</td>

          <!-- Proveedor 1 -->
          <td data-cmp-pcell="${idx}-1-u" class="px-1.5 py-2 ${esG1 ? "bg-amber-100" : ""}">
            <input type="number" min="0" step="${monedas[1] === "USD" ? "0.01" : "1"}" data-cmp-idx="${idx}" data-cmp-f="precio_1" value="${it.precio_1 ?? ""}"
              placeholder="${monedas[1]}"
              class="w-24 rounded border-gray-300 px-2 py-1 text-right text-xs tabular-nums ${clasesCeldaGanador(esG1)}" />
          </td>
          <td data-cmp-pcell="${idx}-1-t" class="px-2 py-2 border-r border-gray-200 text-right whitespace-nowrap ${esG1 ? "bg-amber-100 font-semibold text-amber-950" : "text-gray-700"}">
            ${renderTextoTotalProveedor(calc.slots[1], cant)}
          </td>

          <!-- Proveedor 2 -->
          <td data-cmp-pcell="${idx}-2-u" class="px-1.5 py-2 ${esG2 ? "bg-amber-100" : ""}">
            <input type="number" min="0" step="${monedas[2] === "USD" ? "0.01" : "1"}" data-cmp-idx="${idx}" data-cmp-f="precio_2" value="${it.precio_2 ?? ""}"
              placeholder="${monedas[2]}"
              class="w-24 rounded border-gray-300 px-2 py-1 text-right text-xs tabular-nums ${clasesCeldaGanador(esG2)}" />
          </td>
          <td data-cmp-pcell="${idx}-2-t" class="px-2 py-2 border-r border-gray-200 text-right whitespace-nowrap ${esG2 ? "bg-amber-100 font-semibold text-amber-950" : "text-gray-700"}">
            ${renderTextoTotalProveedor(calc.slots[2], cant)}
          </td>

          <!-- Proveedor 3 -->
          <td data-cmp-pcell="${idx}-3-u" class="px-1.5 py-2 ${esG3 ? "bg-amber-100" : ""}">
            <input type="number" min="0" step="${monedas[3] === "USD" ? "0.01" : "1"}" data-cmp-idx="${idx}" data-cmp-f="precio_3" value="${it.precio_3 ?? ""}"
              placeholder="${monedas[3]}"
              class="w-24 rounded border-gray-300 px-2 py-1 text-right text-xs tabular-nums ${clasesCeldaGanador(esG3)}" />
          </td>
          <td data-cmp-pcell="${idx}-3-t" class="px-2 py-2 border-r border-gray-200 text-right whitespace-nowrap ${esG3 ? "bg-amber-100 font-semibold text-amber-950" : "text-gray-700"}">
            ${renderTextoTotalProveedor(calc.slots[3], cant)}
          </td>

          <!-- Ganador & Desc.% -->
          <td class="px-1.5 py-2">
            <select data-cmp-idx="${idx}" data-cmp-ganador="1" class="w-32 rounded border-gray-300 px-1.5 py-1 text-[11px]">
              <option value="" ${!it._ganadorManual ? "selected" : ""}>Auto (mejor)</option>
              ${opcGanador
                .map((g) => `<option value="${g.id}" ${it._ganadorManual && calc.ganadorId === g.id ? "selected" : ""}>${escapeHtml(g.label)}</option>`)
                .join("")}
            </select>
          </td>
          <td class="px-1.5 py-2 border-r border-gray-200">
            <input type="number" min="0" max="100" step="0.1" data-cmp-idx="${idx}" data-cmp-f="descuento_pct" value="${it.descuento_pct ?? 0}"
              class="w-16 rounded border-gray-300 px-1.5 py-1 text-right text-xs tabular-nums" />
          </td>

          <!-- AHORRO (4 columnas) -->
          <td data-cmp-ahorro="${idx}-u" class="px-2 py-2 text-right tabular-nums whitespace-nowrap text-gray-800">
            ${calc.precioNetoUnit > 0 ? formatoCOP(calc.precioNetoUnit) : "—"}
          </td>
          <td data-cmp-ahorro="${idx}-t" class="px-2 py-2 text-right tabular-nums font-semibold whitespace-nowrap text-gray-900">
            ${calc.subtotalNeto > 0 ? formatoCOP(calc.subtotalNeto) : "—"}
          </td>
          <td data-cmp-ahorro="${idx}-d" class="px-2 py-2 text-right tabular-nums whitespace-nowrap ${diffClase}">
            ${calc.tieneComparacion ? formatoCOP(calc.diffTotal) : "—"}
          </td>
          <td data-cmp-ahorro="${idx}-p" class="px-2 py-2 text-right tabular-nums whitespace-nowrap ${diffClase}">
            ${calc.tieneComparacion ? `${calc.pctAhorro.toFixed(1)}%` : "—"}
          </td>
        </tr>`;
      })
      .join("");
  }

  // Actualiza en vivo las celdas calculadas de una fila sin destruir el input activo (conserva el foco al teclear)
  function actualizarFilaComparativoDom(idx) {
    const tr = document.querySelector(`tr[data-cmp-row="${idx}"]`);
    if (!tr) return;
    const it = itemsActuales[idx];
    const monedas = getMonedasActuales();
    const trm = getTrmActual();
    const calc = calcularItemComparativo(it, { trm, monedas });
    const cant = Number(it.cantidad_solicitada || 1);

    tr.className = `border-t border-gray-200 ${calc.sobrecosto ? "bg-red-50/30" : "hover:bg-gray-50/60"}`;

    [1, 2, 3].forEach((slot) => {
      const esG = calc.ganadorSlot === slot;
      const tdU = tr.querySelector(`[data-cmp-pcell="${idx}-${slot}-u"]`);
      const tdT = tr.querySelector(`[data-cmp-pcell="${idx}-${slot}-t"]`);
      const inp = tdU?.querySelector("input");
      if (tdU) tdU.className = `px-1.5 py-2 ${esG ? "bg-amber-100" : ""}`;
      if (inp) {
        inp.className = `w-24 rounded border-gray-300 px-2 py-1 text-right text-xs tabular-nums ${clasesCeldaGanador(esG)}`;
      }
      if (tdT) {
        tdT.className = `px-2 py-2 border-r border-gray-200 text-right whitespace-nowrap ${esG ? "bg-amber-100 font-semibold text-amber-950" : "text-gray-700"}`;
        tdT.innerHTML = renderTextoTotalProveedor(calc.slots[slot], cant);
      }
    });

    const diffClase = !calc.tieneComparacion
      ? "text-gray-400"
      : calc.diffTotal >= 0
      ? "bg-emerald-50 text-emerald-700 font-bold"
      : "bg-red-600 text-white font-bold";

    const tdAu = tr.querySelector(`[data-cmp-ahorro="${idx}-u"]`);
    const tdAt = tr.querySelector(`[data-cmp-ahorro="${idx}-t"]`);
    const tdAd = tr.querySelector(`[data-cmp-ahorro="${idx}-d"]`);
    const tdAp = tr.querySelector(`[data-cmp-ahorro="${idx}-p"]`);
    if (tdAu) tdAu.textContent = calc.precioNetoUnit > 0 ? formatoCOP(calc.precioNetoUnit) : "—";
    if (tdAt) tdAt.textContent = calc.subtotalNeto > 0 ? formatoCOP(calc.subtotalNeto) : "—";
    if (tdAd) {
      tdAd.className = `px-2 py-2 text-right tabular-nums whitespace-nowrap ${diffClase}`;
      tdAd.textContent = calc.tieneComparacion ? formatoCOP(calc.diffTotal) : "—";
    }
    if (tdAp) {
      tdAp.className = `px-2 py-2 text-right tabular-nums whitespace-nowrap ${diffClase}`;
      tdAp.textContent = calc.tieneComparacion ? `${calc.pctAhorro.toFixed(1)}%` : "—";
    }
  }

  async function cargarItemsYHistorialSolicitud(solicitudId) {
    const { data, error } = await window.sb
      .from("compras_solicitud_items")
      .select("*")
      .eq("solicitud_id", solicitudId)
      .order("created_at");
    if (error) throw error;

    const sol = solicitudes.find((s) => s.id === solicitudId);
    const monedasSol = {
      1: sol?.moneda_p1 || "COP",
      2: sol?.moneda_p2 || "COP",
      3: sol?.moneda_p3 || "COP",
    };
    const trmSol = Number(sol?.trm || 0);

    itemsActuales = (data || []).map((it) => {
      const copia = { ...it, _ganadorManual: false };
      const calcAuto = calcularItemComparativo(copia, { trm: trmSol, monedas: monedasSol });
      // Si el ganador guardado difiere del automático más económico, preservar la selección manual
      if (it.proveedor_ganador_id && calcAuto.mejor && it.proveedor_ganador_id !== calcAuto.mejor.id) {
        copia._ganadorManual = true;
      }
      return copia;
    });

    const presupuestoIds = [...new Set(itemsActuales.map((it) => it.presupuesto_item_id).filter(Boolean))];
    if (presupuestoIds.length > 0) {
      const { data: prevData, error: errPrev } = await window.sb
        .from("compras_solicitud_items")
        .select("id, solicitud_id, presupuesto_item_id, cantidad_solicitada, precio_ganador, proveedor_ganador_id, created_at, compras_solicitudes(numero, titulo, estado, fecha_solicitud)")
        .in("presupuesto_item_id", presupuestoIds);
      if (errPrev) throw errPrev;
      itemsPrevios = prevData || [];
    } else {
      itemsPrevios = [];
    }
  }

  async function abrirComparativo(solicitudId) {
    solicitudActual = solicitudes.find((s) => s.id === solicitudId);
    if (!solicitudActual) return;

    try {
      await cargarItemsYHistorialSolicitud(solicitudId);
    } catch (err) {
      return manejarError(err, "No se pudo cargar los ítems de la solicitud");
    }

    document.getElementById("cmp-titulo").textContent = `${solicitudActual.numero || ""} · ${solicitudActual.titulo}`;
    document.getElementById("cmp-subtitulo").textContent =
      `Empresa: ${solicitudActual.empresas?.nombre || "—"} · Origen: ${ORIGEN_LABEL[solicitudActual.origen] || solicitudActual.origen} · ` +
      (solicitudActual.proyectos?.nombre ? `Proyecto: ${solicitudActual.proyectos.nombre}` : `Cliente: ${solicitudActual.clientes?.nombre || "—"}`);
    document.getElementById("cmp-estado-badge").innerHTML = badgeHtml(ESTADOS_SOL, solicitudActual.estado);

    actualizarBotonesOrden(solicitudActual.estado, solicitudActual.id);

    const first = itemsActuales[0] || {};
    document.getElementById("cmp-prov-1").innerHTML = opcionesProveedores(first.proveedor_1_id);
    document.getElementById("cmp-prov-2").innerHTML = opcionesProveedores(first.proveedor_2_id);
    document.getElementById("cmp-prov-3").innerHTML = opcionesProveedores(first.proveedor_3_id);
    sincronizarSelectoresProveedores(true);

    const m1 = document.getElementById("cmp-moneda-1");
    const m2 = document.getElementById("cmp-moneda-2");
    const m3 = document.getElementById("cmp-moneda-3");
    if (m1) m1.value = solicitudActual.moneda_p1 || "COP";
    if (m2) m2.value = solicitudActual.moneda_p2 || "COP";
    if (m3) m3.value = solicitudActual.moneda_p3 || "COP";

    const trmEl = document.getElementById("cmp-trm");
    if (trmEl) trmEl.value = solicitudActual.trm ? String(solicitudActual.trm) : "";
    const trmInfoEl = document.getElementById("cmp-trm-info");
    if (trmInfoEl) {
      trmInfoEl.textContent =
        solicitudActual.trm && solicitudActual.trm_fuente && solicitudActual.trm_fuente !== "manual"
          ? `Fuente guardada: ${solicitudActual.trm_fuente}`
          : "Ingreso manual o consulta TRM oficial de Colombia.";
    }
    actualizarHeaderTrm(solicitudActual.trm);

    const ccEl = document.getElementById("cmp-centro-costo");
    if (ccEl) ccEl.value = solicitudActual.proyectos?.nombre || "";
    const ciudadEl = document.getElementById("cmp-ciudad");
    if (ciudadEl) ciudadEl.value = "Barranquilla";
    const obsOcEl = document.getElementById("cmp-observaciones-oc");
    if (obsOcEl) obsOcEl.value = "";
    const motivoEl = document.getElementById("cmp-motivo-seleccion");
    if (motivoEl) motivoEl.value = solicitudActual.motivo_seleccion || "";
    const notasEl = document.getElementById("cmp-notas");
    if (notasEl) notasEl.value = solicitudActual.notas || "";

    abrirModal(modalCmp);
    actualizarResumenComparativo();
    renderTablaComparativo();
  }

  // Botón TRM hoy (API oficial Colombia datos.gov.co + fallback open.er-api.com)
  async function consultarTrmHoy() {
    const btn = document.getElementById("cmp-btn-trm-hoy");
    const infoEl = document.getElementById("cmp-trm-info");
    const trmEl = document.getElementById("cmp-trm");
    if (btn) btn.disabled = true;
    if (infoEl) infoEl.textContent = "Consultando TRM oficial de Colombia...";

    let trmValor = null;
    let fuente = "";
    let fechaTexto = "";

    try {
      const resGov = await fetch("https://www.datos.gov.co/resource/32sa-8pi3.json?$limit=1&$order=vigenciadesde%20DESC");
      if (resGov.ok) {
        const rows = await resGov.json();
        const valorNum = Number(rows?.[0]?.valor);
        if (Number.isFinite(valorNum) && valorNum > 0) {
          trmValor = Math.round(valorNum * 100) / 100;
          fuente = "datos.gov.co";
          fechaTexto = rows[0].vigenciadesde ? formatoFecha(String(rows[0].vigenciadesde).slice(0, 10)) : hoyLocal();
        }
      }
    } catch (e) {
      console.warn("Error consultando datos.gov.co, intentando fallback:", e);
    }

    if (!trmValor) {
      try {
        const resFb = await fetch("https://open.er-api.com/v6/latest/USD");
        if (resFb.ok) {
          const jsonFb = await resFb.json();
          const copRate = Number(jsonFb?.rates?.COP);
          if (Number.isFinite(copRate) && copRate > 0) {
            trmValor = Math.round(copRate * 100) / 100;
            fuente = "open.er-api.com";
            fechaTexto = formatoFecha(hoyLocal());
          }
        }
      } catch (e) {
        console.warn("Error consultando open.er-api.com:", e);
      }
    }

    if (btn) btn.disabled = false;

    if (!trmValor) {
      if (infoEl) infoEl.textContent = "No se pudo consultar la TRM en línea. Ingrésala manualmente.";
      return mostrarAviso("No se pudo obtener la TRM en línea. Puedes escribirla manualmente.", "error");
    }

    if (trmEl) trmEl.value = String(trmValor);
    if (solicitudActual) {
      solicitudActual.trm = trmValor;
      solicitudActual.trm_fuente = fuente;
    }
    if (infoEl) {
      infoEl.textContent = `TRM actualizada (${fuente} · ${fechaTexto}): ${formatoCOP(trmValor)}`;
    }
    actualizarHeaderTrm(trmValor);
    actualizarResumenComparativo();
    renderTablaComparativo();
    mostrarAviso(`TRM actualizada: ${formatoCOP(trmValor)} (${fuente})`, "exito");
  }

  document.getElementById("cmp-btn-trm-hoy")?.addEventListener("click", consultarTrmHoy);

  document.getElementById("tabla-solicitudes").addEventListener("click", (e) => {
    const btnCmp = e.target.closest("[data-abrir-sol]");
    if (btnCmp) return abrirComparativo(btnCmp.dataset.abrirSol);
    const btnCom = e.target.closest("[data-abrir-comite]");
    if (btnCom) return abrirComitePorId(btnCom.dataset.abrirComite);
    const btnGenOc = e.target.closest("[data-generar-orden]");
    if (btnGenOc) return generarOrdenesDeSolicitud(btnGenOc.dataset.generarOrden);
    const btnDel = e.target.closest("[data-eliminar-sol]");
    if (btnDel) return abrirModalEliminarCompra("solicitud", btnDel.dataset.eliminarSol);
  });

  document.getElementById("cmp-cerrar").addEventListener("click", () => cerrarModal(modalCmp));
  document.getElementById("cmp-btn-cancelar")?.addEventListener("click", () => cerrarModal(modalCmp));
  document.getElementById("cmp-btn-pdf")?.addEventListener("click", () => generarPdfResumenComite());
  document.getElementById("cmp-motivo-seleccion")?.addEventListener("input", () => {
    actualizarResumenComparativo();
  });

  document.querySelectorAll(".cmp-prov-select").forEach((sel) => {
    sel.addEventListener("change", () => {
      sincronizarSelectoresProveedores();
      actualizarResumenComparativo();
      renderTablaComparativo();
    });
  });

  document.querySelectorAll(".cmp-moneda-select").forEach((sel) => {
    sel.addEventListener("change", () => {
      if (solicitudActual) {
        solicitudActual.moneda_p1 = document.getElementById("cmp-moneda-1")?.value || "COP";
        solicitudActual.moneda_p2 = document.getElementById("cmp-moneda-2")?.value || "COP";
        solicitudActual.moneda_p3 = document.getElementById("cmp-moneda-3")?.value || "COP";
      }
      actualizarResumenComparativo();
      renderTablaComparativo();
    });
  });

  document.getElementById("cmp-trm")?.addEventListener("input", (e) => {
    if (!solicitudActual) return;
    const val = Number(e.target.value || 0);
    solicitudActual.trm = Number.isFinite(val) && val >= 0 ? val : 0;
    solicitudActual.trm_fuente = "manual";
    const infoEl = document.getElementById("cmp-trm-info");
    if (infoEl) infoEl.textContent = "TRM ingresada manualmente.";
    actualizarHeaderTrm(solicitudActual.trm);
    itemsActuales.forEach((_, idx) => actualizarFilaComparativoDom(idx));
    actualizarResumenComparativo();
  });

  document.getElementById("cmp-iva-porcentaje")?.addEventListener("input", () => {
    actualizarResumenComparativo();
  });

  document.getElementById("cmp-tbody").addEventListener("input", (e) => {
    const idxStr = e.target.dataset.cmpIdx;
    if (idxStr === undefined) return;
    const idx = Number(idxStr);
    const it = itemsActuales[idx];
    if (!it) return;

    if (e.target.dataset.cmpText === "referencia") {
      it.referencia = e.target.value;
      return;
    }
    const f = e.target.dataset.cmpF;
    if (!f) return;

    if (e.target.value === "") {
      it[f] = f === "descuento_pct" ? 0 : null;
    } else {
      let val = Number(e.target.value);
      if (!Number.isFinite(val) || val < 0) {
        val = 0;
        e.target.value = "0";
      }
      if (f === "descuento_pct" && val > 100) {
        val = 100;
        e.target.value = "100";
      }
      it[f] = val;
    }

    const calc = calcularItemComparativo(it);
    if (!it._ganadorManual) {
      it.proveedor_ganador_id = calc.ganadorId;
    }
    it.precio_ganador = calc.precioGanador || null;

    actualizarFilaComparativoDom(idx);
    actualizarResumenComparativo();
  });

  document.getElementById("cmp-tbody").addEventListener("change", (e) => {
    if (e.target.dataset.cmpGanador) {
      const idx = Number(e.target.dataset.cmpIdx);
      const provId = e.target.value || null;
      const it = itemsActuales[idx];
      if (!it) return;
      if (provId) {
        it._ganadorManual = true;
        it.proveedor_ganador_id = provId;
      } else {
        it._ganadorManual = false;
        it.proveedor_ganador_id = null;
      }
      const calc = calcularItemComparativo(it);
      it.proveedor_ganador_id = calc.ganadorId;
      it.precio_ganador = calc.precioGanador || null;
      actualizarResumenComparativo();
      renderTablaComparativo();
    }
  });

  async function guardarComparativo(nuevoEstado = null, { cerrarAlGuardar = true } = {}) {
    try {
      for (const it of itemsActuales) {
        const invalido = [it.precio_1, it.precio_2, it.precio_3, it.cantidad_solicitada].some(
          (v) => v !== null && v !== undefined && v !== "" && (!Number.isFinite(Number(v)) || Number(v) < 0)
        );
        const descInvalido =
          it.descuento_pct !== null &&
          it.descuento_pct !== undefined &&
          it.descuento_pct !== "" &&
          (!Number.isFinite(Number(it.descuento_pct)) || Number(it.descuento_pct) < 0 || Number(it.descuento_pct) > 100);
        if (invalido || descInvalido) {
          mostrarAviso("Los precios, cantidades y descuentos (0-100%) deben ser válidos", "error");
          return false;
        }
      }

      const trmInput = document.getElementById("cmp-trm");
      const trmVal = trmInput && trmInput.value !== "" ? Number(trmInput.value) : 0;
      if (!Number.isFinite(trmVal) || trmVal < 0) {
        mostrarAviso("La TRM debe ser mayor o igual a 0", "error");
        return false;
      }

      const monedas = getMonedasActuales();
      const motivoEl = document.getElementById("cmp-motivo-seleccion");
      const motivoVal = motivoEl?.value?.trim() || "";
      const { requiereMotivo } = detectarEleccionNoMasEconomica(trmVal, monedas);
      if (requiereMotivo && !motivoVal) {
        actualizarEstadoMotivoComparativo(trmVal, monedas);
        if (motivoEl) {
          motivoEl.scrollIntoView({ behavior: "smooth", block: "center" });
          motivoEl.focus();
        }
        mostrarAviso("Elegiste un proveedor que no es el más económico; indica el motivo de elección.", "error");
        return false;
      }

      const notasVal = document.getElementById("cmp-notas")?.value?.trim() || null;

      const updates = itemsActuales.map((it) => {
        const calc = calcularItemComparativo(it, { trm: trmVal, monedas });
        return {
          id: it.id,
          solicitud_id: it.solicitud_id || solicitudActual.id,
          descripcion: it.descripcion,
          referencia: it.referencia ? String(it.referencia).trim() : null,
          descuento_pct: calc.descuentoPct,
          cantidad_solicitada: Math.max(0, Number(it.cantidad_solicitada || 0)),
          proveedor_1_id: it.proveedor_1_id || null,
          precio_1: it.precio_1 ?? null,
          proveedor_2_id: it.proveedor_2_id || null,
          precio_2: it.precio_2 ?? null,
          proveedor_3_id: it.proveedor_3_id || null,
          precio_3: it.precio_3 ?? null,
          proveedor_ganador_id: calc.ganadorId || null,
          precio_ganador: calc.precioGanador > 0 ? Math.round(calc.precioGanador) : null,
        };
      });

      if (updates.length > 0) {
        const { error } = await window.sb.from("compras_solicitud_items").upsert(updates, { onConflict: "id" });
        if (error) throw error;
      }

      const estadoFinal = nuevoEstado || (solicitudActual.estado === "pendiente" ? "en_comparativo" : solicitudActual.estado);
      const basePayload = { trm: trmVal, notas: notasVal };
      if (estadoFinal !== solicitudActual.estado) basePayload.estado = estadoFinal;
      const extraPayload = {
        moneda_p1: monedas[1],
        moneda_p2: monedas[2],
        moneda_p3: monedas[3],
        trm_fuente: solicitudActual.trm_fuente || "manual",
        motivo_seleccion: motivoVal || null,
      };

      const { error: errSolUpd } = await actualizarSolicitudSeguro(solicitudActual.id, basePayload, extraPayload);
      if (errSolUpd) throw errSolUpd;

      solicitudActual.estado = estadoFinal;
      solicitudActual.trm = trmVal;
      solicitudActual.notas = notasVal;
      solicitudActual.motivo_seleccion = motivoVal || null;
      solicitudActual.moneda_p1 = monedas[1];
      solicitudActual.moneda_p2 = monedas[2];
      solicitudActual.moneda_p3 = monedas[3];

      actualizarHeaderTrm(trmVal);
      document.getElementById("cmp-estado-badge").innerHTML = badgeHtml(ESTADOS_SOL, solicitudActual.estado);
      await cargarDatos();

      if (cerrarAlGuardar) {
        cerrarModal(modalCmp);
      }
      mostrarAviso("Comparativo guardado correctamente", "exito");
      return true;
    } catch (err) {
      manejarError(err, "No se pudo guardar el comparativo");
      return false;
    }
  }

  document.getElementById("cmp-btn-guardar").addEventListener("click", () => guardarComparativo(null, { cerrarAlGuardar: true }));

  // --------------------------------------------------------------------------
  // PRESENTACIÓN A COMITÉ · COMPARATIVO COMPLETO PDF · GMAIL · APROBACIÓN
  // --------------------------------------------------------------------------
  function calcularResumenComite({ desdeDom = false } = {}) {
    const usarDomCmp = desdeDom && modalCmp && !modalCmp.classList.contains("hidden");
    const trm = usarDomCmp ? getTrmActual(solicitudActual, true) : Number(solicitudActual?.trm || 0);
    const monedas = usarDomCmp
      ? getMonedasActuales(solicitudActual, true)
      : {
          1: solicitudActual?.moneda_p1 || "COP",
          2: solicitudActual?.moneda_p2 || "COP",
          3: solicitudActual?.moneda_p3 || "COP",
        };
    const ivaPct = getIvaPorcentajeActual(solicitudActual);

    const nombreProv = (id) => proveedores.find((p) => p.id === id)?.nombre || null;
    const first = itemsActuales[0] || {};
    const provIds = {
      1: (usarDomCmp ? document.getElementById("cmp-prov-1")?.value : null) || first.proveedor_1_id || null,
      2: (usarDomCmp ? document.getElementById("cmp-prov-2")?.value : null) || first.proveedor_2_id || null,
      3: (usarDomCmp ? document.getElementById("cmp-prov-3")?.value : null) || first.proveedor_3_id || null,
    };

    let totPresup = 0;
    let totCompra = 0;
    const accProvs = {
      1: { totalCop: 0, totalOrig: 0, cotizados: 0 },
      2: { totalCop: 0, totalOrig: 0, cotizados: 0 },
      3: { totalCop: 0, totalOrig: 0, cotizados: 0 },
    };

    const filas = itemsActuales.map((it) => {
      const calc = calcularItemComparativo(it, { trm, monedas });
      const cantInicial = Number(it.cantidad_presupuestada || it.cantidad_solicitada || 0);
      const previas = it.presupuesto_item_id
        ? itemsPrevios.filter((p) => p.presupuesto_item_id === it.presupuesto_item_id && p.solicitud_id !== solicitudActual.id)
        : [];
      const compradoAntes = previas.reduce((a, p) => a + Number(p.cantidad_solicitada || 0), 0);
      const pendiente = Math.max(0, cantInicial - compradoAntes);
      const cantSol = Number(it.cantidad_solicitada || 0);
      const totalIt = calc.subtotalNeto;
      totPresup += calc.presupTotal;
      totCompra += totalIt;
      [1, 2, 3].forEach((slot) => {
        const s = calc.slots[slot];
        if (s) {
          accProvs[slot].cotizados += 1;
          accProvs[slot].totalCop += s.precioCop * cantSol;
          accProvs[slot].totalOrig += s.precioOrig * cantSol;
        }
      });
      const provNombre = nombreProv(calc.ganadorId) || "Sin proveedor";
      return { it, calc, cantInicial, previas, compradoAntes, pendiente, cantSol, totalIt, provNombre };
    });

    const totalItems = itemsActuales.length;
    const resumenProvs = [1, 2, 3].map((slot) => ({
      slot,
      id: provIds[slot],
      nombre: provIds[slot] ? nombreProv(provIds[slot]) || `Proveedor ${slot}` : `Proveedor ${slot}`,
      moneda: monedas[slot] || "COP",
      totalCop: accProvs[slot].totalCop,
      totalOrig: accProvs[slot].totalOrig,
      cotizados: accProvs[slot].cotizados,
      completo: Boolean(provIds[slot] && totalItems > 0 && accProvs[slot].cotizados === totalItems && accProvs[slot].totalCop > 0),
    }));
    const completos = resumenProvs.filter((p) => p.completo).sort((a, b) => a.totalCop - b.totalCop);
    const masEconomico = completos[0] || null;

    const ahorro = totPresup > 0 && totCompra > 0 ? totPresup - totCompra : 0;
    const pctAhorro = totPresup > 0 && totCompra > 0 ? (ahorro / totPresup) * 100 : 0;
    const ivaMonto = totCompra * (ivaPct / 100);
    const totalConIva = totCompra + ivaMonto;

    return {
      filas,
      totPresup,
      totCompra,
      ahorro,
      pctAhorro,
      ivaPct,
      ivaMonto,
      totalConIva,
      trm,
      monedas,
      resumenProvs,
      masEconomico,
      totalItems,
    };
  }

  function renderModalComite() {
    if (!solicitudActual) return;
    const res = calcularResumenComite();

    document.getElementById("comite-subtitulo").textContent =
      `${solicitudActual.numero || "—"} · ${solicitudActual.titulo || ""} · ` +
      `${solicitudActual.empresas?.nombre || "—"} · ${solicitudActual.proyectos?.nombre || solicitudActual.clientes?.nombre || "—"}`;
    const badgeEst = document.getElementById("comite-estado-badge");
    if (badgeEst) badgeEst.innerHTML = badgeHtml(ESTADOS_SOL, solicitudActual.estado);

    document.getElementById("comite-tbody").innerHTML = res.filas.length
      ? res.filas
          .map(({ it, calc, cantInicial, previas, compradoAntes, pendiente, cantSol, totalIt, provNombre }) => {
            const tags = [];
            if (calc.descuentoPct > 0) tags.push(`<span class="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">-${calc.descuentoPct}%</span>`);
            if (calc.ganadorCand?.moneda === "USD") tags.push(`<span class="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-800">USD</span>`);
            return `
            <tr class="border-t border-gray-100">
              <td class="px-3 py-2 font-medium text-gray-900">
                <div>${escapeHtml(it.descripcion)}</div>
                ${it.referencia || it.codigo ? `<div class="text-[10px] text-gray-400">${escapeHtml(it.referencia || it.codigo)}</div>` : ""}
              </td>
              <td class="px-3 py-2 text-right tabular-nums">${cantInicial}</td>
              <td class="px-3 py-2 text-right tabular-nums">
                ${
                  previas.length
                    ? `<button type="button" data-ver-hist="${it.presupuesto_item_id}" data-hist-desc="${escapeHtml(it.descripcion)}" class="font-bold text-primary underline">${compradoAntes}</button>`
                    : `<span class="text-gray-400">0</span>`
                }
              </td>
              <td class="px-3 py-2 text-right tabular-nums font-semibold">${pendiente}</td>
              <td class="px-3 py-2 text-right tabular-nums font-bold text-primary">${cantSol}</td>
              <td class="px-3 py-2">
                <div class="flex flex-wrap items-center gap-1">
                  <span>${escapeHtml(provNombre)}</span>
                  ${tags.join("")}
                </div>
              </td>
              <td class="px-3 py-2 text-right tabular-nums">${formatoCOP(calc.precioNetoUnit)}</td>
              <td class="px-3 py-2 text-right tabular-nums font-bold">${formatoCOP(totalIt)}</td>
            </tr>`;
          })
          .join("")
      : `<tr><td colspan="8" class="px-4 py-6 text-center text-gray-400">Esta solicitud aún no tiene ítems.</td></tr>`;

    document.getElementById("comite-kpis").innerHTML = `
      <div class="rounded-lg border border-gray-200 p-3">
        <p class="text-[11px] uppercase text-gray-500">Presupuestado</p>
        <p class="text-base font-bold tabular-nums">${formatoCOP(res.totPresup)}</p>
      </div>
      <div class="rounded-lg border border-gray-200 p-3">
        <p class="text-[11px] uppercase text-gray-500">Total Compra (Neto)</p>
        <p class="text-base font-bold tabular-nums text-primary">${formatoCOP(res.totCompra)}</p>
        <p class="text-[10px] text-gray-500">Con IVA (${res.ivaPct}%): ${formatoCOP(res.totalConIva)}</p>
      </div>
      <div class="rounded-lg border border-gray-200 p-3">
        <p class="text-[11px] uppercase text-gray-500">${res.ahorro >= 0 ? "Ahorro" : "Sobrecosto"}</p>
        <p class="text-base font-bold tabular-nums ${res.ahorro >= 0 ? "text-emerald-600" : "text-red-600"}">
          ${formatoCOP(res.ahorro)} (${res.pctAhorro.toFixed(1)}%)
        </p>
      </div>
      <div class="rounded-lg border border-gray-200 p-3">
        <p class="text-[11px] uppercase text-gray-500">Estado</p>
        <p class="mt-1">${badgeHtml(ESTADOS_SOL, solicitudActual.estado)}</p>
      </div>`;

    const motivoComiteEl = document.getElementById("comite-motivo-seleccion");
    if (motivoComiteEl) motivoComiteEl.value = solicitudActual.motivo_seleccion || "";
    const { requiereMotivo } = detectarEleccionNoMasEconomica(res.trm, res.monedas);
    const motivoAlertaEl = document.getElementById("comite-motivo-alerta");
    if (motivoAlertaEl) motivoAlertaEl.classList.toggle("hidden", !requiereMotivo);
    const motivoWrapEl = document.getElementById("comite-motivo-wrap");
    if (motivoWrapEl) {
      motivoWrapEl.className = requiereMotivo
        ? "rounded-xl border-2 border-amber-400 bg-amber-50 p-3.5 space-y-1.5"
        : "rounded-xl border border-amber-200 bg-amber-50/50 p-3.5 space-y-1.5";
    }

    const correoEl = document.getElementById("comite-correo-aprobador");
    if (correoEl) correoEl.value = solicitudActual.correo_aprobador || "";

    const comentEl = document.getElementById("comite-comentario");
    if (comentEl) comentEl.value = solicitudActual.comentario_comite || "";

    const comentPrevEl = document.getElementById("comite-comentario-previo");
    if (comentPrevEl) {
      if (solicitudActual.comentario_comite) {
        comentPrevEl.textContent = `Último comentario registrado: "${solicitudActual.comentario_comite}"`;
        comentPrevEl.classList.remove("hidden");
      } else {
        comentPrevEl.textContent = "";
        comentPrevEl.classList.add("hidden");
      }
    }

    const puedeAprobar = !!window.PCT_ROL_INFO?.puedeAprobarCompras;
    const bloqueada = solicitudActual.estado === "aprobada" || solicitudActual.estado === "ordenada";
    document.getElementById("comite-btn-aprobar").classList.toggle("hidden", !puedeAprobar || bloqueada);
    document.getElementById("comite-btn-rechazar").classList.toggle("hidden", !puedeAprobar || bloqueada);
    actualizarBotonesOrden(solicitudActual.estado, solicitudActual.id);
    document.getElementById("comite-permiso-msg").textContent =
      solicitudActual.estado === "aprobada"
        ? "Compra aprobada. Haz clic en «Generar Orden de Compra» para emitir el PDF y cargar el gasto al proyecto."
        : solicitudActual.estado === "ordenada"
        ? "Esta solicitud ya cuenta con Orden de Compra emitida."
        : puedeAprobar
        ? "Como Directivo / Super Usuario puedes aprobar o rechazar esta compra."
        : "Solo un Directivo o Super Usuario puede aprobar o rechazar la compra.";

    abrirModal(modalComite);
  }

  async function abrirComitePorId(solicitudId) {
    solicitudActual = solicitudes.find((s) => s.id === solicitudId);
    if (!solicitudActual) return;
    try {
      await cargarItemsYHistorialSolicitud(solicitudId);
      renderModalComite();
    } catch (err) {
      manejarError(err, "No se pudo cargar la presentación de comité");
    }
  }

  async function generarPdfResumenComite() {
    if (!solicitudActual) return;
    if (typeof asegurarJsPDF === "function") await asegurarJsPDF();
    if (!window.jspdf || !window.jspdf.jsPDF) {
      return mostrarAviso("No se pudo cargar jsPDF para generar el PDF", "error");
    }
    const cmpAbierto = modalCmp && !modalCmp.classList.contains("hidden");
    const comiteAbierto = modalComite && !modalComite.classList.contains("hidden");
    const res = calcularResumenComite({ desdeDom: cmpAbierto });
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "pt", format: "letter", orientation: "l" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const m = 24;
    const contentW = pageW - m * 2;
    let y = 24;

    // Encabezado
    doc.setFillColor(19, 91, 236);
    doc.rect(m, y, contentW, 42, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12.5);
    doc.setFont(undefined, "bold");
    doc.text("CUADRO COMPARATIVO Y RESUMEN COMITÉ DE COMPRAS", m + 12, y + 18);
    doc.setFontSize(8.5);
    doc.setFont(undefined, "normal");
    doc.text(`${solicitudActual.empresas?.nombre || "Pctronic"} · ${solicitudActual.numero || "—"}`, m + 12, y + 32);
    doc.setFontSize(9.5);
    doc.setFont(undefined, "bold");
    doc.text(
      `Estado: ${(ESTADOS_SOL[solicitudActual.estado]?.label || solicitudActual.estado || "").toUpperCase()}`,
      pageW - m - 12,
      y + 18,
      { align: "right" }
    );
    doc.setFontSize(8);
    doc.setFont(undefined, "normal");
    doc.text(
      `Fecha solicitud: ${formatoFecha(solicitudActual.fecha_solicitud || hoyLocal())} · Emitido: ${formatoFecha(hoyLocal())}`,
      pageW - m - 12,
      y + 32,
      { align: "right" }
    );
    doc.setTextColor(0, 0, 0);

    y += 54;
    doc.setFontSize(9.5);
    doc.setFont(undefined, "bold");
    doc.text(`Solicitud: ${solicitudActual.titulo || "—"}`, m, y);
    doc.setFont(undefined, "normal");
    doc.setFontSize(8);
    y += 13;
    const metaLinea = [
      `Proyecto / Cliente: ${solicitudActual.proyectos?.nombre || solicitudActual.clientes?.nombre || "—"}`,
      `Origen: ${ORIGEN_LABEL[solicitudActual.origen] || solicitudActual.origen || "—"}`,
      res.trm > 0 ? `TRM aplicada: ${formatoCOP(res.trm)}` : "TRM aplicada: N/A (COP)",
      solicitudActual.proyectos?.trm_cotizacion ? `TRM cotización: ${formatoCOP(solicitudActual.proyectos.trm_cotizacion)}` : null,
    ]
      .filter(Boolean)
      .join("   ·   ");
    doc.text(metaLinea, m, y);

    // Tabla Comparativa Completa (todos los proveedores evaluados lado a lado)
    const fmtCeldaProv = (slotCalc, cant) => {
      if (!slotCalc) return "—";
      if (slotCalc.moneda === "USD") {
        const unitTxt = `U: ${formatoUSD(slotCalc.precioOrig)}`;
        const totTxt =
          slotCalc.precioCop > 0
            ? `T: ${formatoCOP(slotCalc.precioCop * cant)}`
            : `T: ${formatoUSD(slotCalc.precioOrig * cant)} (sin TRM)`;
        return `${unitTxt}\n${totTxt}`;
      }
      return `U: ${formatoCOP(slotCalc.precioOrig)}\nT: ${formatoCOP(slotCalc.precioCop * cant)}`;
    };

    const p1 = res.resumenProvs[0];
    const p2 = res.resumenProvs[1];
    const p3 = res.resumenProvs[2];

    const bodyRows = res.filas.map(({ it, calc, cantSol, totalIt, provNombre }, idx) => {
      const refLinea = it.referencia || it.codigo ? `\n[${it.referencia || it.codigo}]` : "";
      const descTxt = `${it.descripcion || "—"}${refLinea}`;
      const pptoTxt = `${formatoCOP(calc.presupTotal)}\n(U: ${formatoCOP(calc.presupUnit)})`;
      const ganadorTxt = `${provNombre}${calc.descuentoPct > 0 ? `\nDesc: -${calc.descuentoPct}%` : ""}`;
      const netoTxt = `${formatoCOP(totalIt)}\n(U: ${formatoCOP(calc.precioNetoUnit)})`;
      const difTxt = calc.tieneComparacion ? `${formatoCOP(calc.diffTotal)}\n(${calc.pctAhorro.toFixed(1)}%)` : "—";
      return [
        String(idx + 1),
        descTxt,
        `${cantSol} ${it.unidad || "Und"}`,
        pptoTxt,
        fmtCeldaProv(calc.slots[1], cantSol),
        fmtCeldaProv(calc.slots[2], cantSol),
        fmtCeldaProv(calc.slots[3], cantSol),
        ganadorTxt,
        netoTxt,
        difTxt,
      ];
    });

    y += 10;
    doc.autoTable({
      startY: y,
      margin: { left: m, right: m },
      theme: "grid",
      head: [[
        "#",
        "Descripción",
        "Cant.",
        "Ppto. Base Total",
        `${p1.nombre}\n(${p1.moneda})`,
        `${p2.nombre}\n(${p2.moneda})`,
        `${p3.nombre}\n(${p3.moneda})`,
        "Proveedor Ganador",
        "Total Neto Ganador",
        "Diferencia / Ahorro",
      ]],
      body: bodyRows,
      styles: { fontSize: 6.8, cellPadding: 3, overflow: "linebreak", valign: "middle" },
      headStyles: { fillColor: [19, 91, 236], textColor: 255, fontStyle: "bold", halign: "center", fontSize: 6.8 },
      columnStyles: {
        0: { halign: "center", cellWidth: 20 },
        1: { cellWidth: 162 },
        2: { halign: "right", cellWidth: 38 },
        3: { halign: "right", cellWidth: 66 },
        4: { halign: "right", cellWidth: 78 },
        5: { halign: "right", cellWidth: 78 },
        6: { halign: "right", cellWidth: 78 },
        7: { halign: "left", cellWidth: 84 },
        8: { halign: "right", cellWidth: 70 },
        9: { halign: "right", cellWidth: 70 },
      },
      didParseCell: (data) => {
        if (data.section !== "body") return;
        const filaInfo = res.filas[data.row.index];
        if (!filaInfo) return;
        const { calc } = filaInfo;
        const winCol = calc.ganadorSlot ? 3 + calc.ganadorSlot : null;
        if ((winCol && data.column.index === winCol) || data.column.index === 7) {
          data.cell.styles.fillColor = [254, 243, 199];
          data.cell.styles.textColor = [120, 53, 15];
          data.cell.styles.fontStyle = "bold";
        }
        if (data.column.index === 9 && calc.tieneComparacion) {
          data.cell.styles.fontStyle = "bold";
          if (calc.diffTotal >= 0) {
            data.cell.styles.fillColor = [236, 253, 245];
            data.cell.styles.textColor = [6, 95, 70];
          } else {
            data.cell.styles.fillColor = [254, 226, 226];
            data.cell.styles.textColor = [185, 28, 28];
          }
        }
      },
    });

    // Resumen: Total por Proveedor + Totales Oferta Ganadora
    let nextY = doc.lastAutoTable.finalY + 10;
    if (nextY + 110 > pageH - 24) {
      doc.addPage();
      nextY = 28;
    }

    const filasProvResumen = res.resumenProvs
      .filter((p) => p.id || p.totalCop > 0)
      .map((p) => {
        const esMasEcon = res.masEconomico && res.masEconomico.slot === p.slot;
        const estadoTxt = esMasEcon
          ? "Más económico (completo)"
          : p.cotizados > 0 && p.cotizados < res.totalItems
          ? `Cotización parcial (${p.cotizados}/${res.totalItems})`
          : p.completo
          ? `Completo (${p.cotizados}/${res.totalItems})`
          : "Sin cotizar";
        const totalTxt =
          p.totalCop > 0
            ? p.moneda === "USD"
              ? `${formatoCOP(p.totalCop)} (${formatoUSD(p.totalOrig)})`
              : formatoCOP(p.totalCop)
            : "—";
        return [`Prov. ${p.slot}: ${p.nombre}`, p.moneda, `${p.cotizados}/${res.totalItems}`, totalTxt, estadoTxt];
      });

    if (filasProvResumen.length) {
      doc.autoTable({
        startY: nextY,
        margin: { left: m, right: m },
        theme: "grid",
        head: [["Total Evaluado por Proveedor", "Moneda", "Ítems", "Total Evaluado (COP)", "Condición"]],
        body: filasProvResumen,
        styles: { fontSize: 7.5, cellPadding: 3.5 },
        headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: "bold" },
        columnStyles: {
          1: { halign: "center", cellWidth: 48 },
          2: { halign: "center", cellWidth: 48 },
          3: { halign: "right", cellWidth: 165, fontStyle: "bold" },
          4: { cellWidth: 155 },
        },
        didParseCell: (data) => {
          if (data.section === "body" && String(data.row.raw?.[4] || "").includes("Más económico")) {
            data.cell.styles.fillColor = [236, 253, 245];
            data.cell.styles.textColor = [6, 95, 70];
          }
        },
      });
      nextY = doc.lastAutoTable.finalY + 8;
    }

    doc.autoTable({
      startY: nextY,
      margin: { left: m, right: m },
      theme: "grid",
      head: [[
        "Presupuesto Base",
        "SubTotal Ganador (Neto)",
        `IVA (${res.ivaPct}%)`,
        "Total con IVA",
        res.ahorro >= 0 ? "Ahorro Total ($ y %)" : "Sobrecosto Total ($ y %)",
      ]],
      body: [[
        formatoCOP(res.totPresup),
        formatoCOP(res.totCompra),
        formatoCOP(res.ivaMonto),
        formatoCOP(res.totalConIva),
        `${formatoCOP(res.ahorro)} (${res.pctAhorro.toFixed(1)}%)`,
      ]],
      styles: { fontSize: 8.5, halign: "right", cellPadding: 4.5, fontStyle: "bold" },
      headStyles: { fillColor: [241, 245, 249], textColor: [30, 41, 59], fontStyle: "bold", halign: "right" },
      didParseCell: (data) => {
        if (data.section === "body" && data.column.index === 4) {
          if (res.ahorro >= 0) {
            data.cell.styles.fillColor = [236, 253, 245];
            data.cell.styles.textColor = [6, 95, 70];
          } else {
            data.cell.styles.fillColor = [254, 226, 226];
            data.cell.styles.textColor = [185, 28, 28];
          }
        }
      },
    });

    // Caja destacada: Motivo de elección del proveedor + Notas + Comentario Comité
    let endY = doc.lastAutoTable.finalY + 10;
    const motivoActual =
      (comiteAbierto ? document.getElementById("comite-motivo-seleccion")?.value?.trim() : "") ||
      (cmpAbierto ? document.getElementById("cmp-motivo-seleccion")?.value?.trim() : "") ||
      solicitudActual.motivo_seleccion ||
      "";
    const notasActuales =
      (cmpAbierto ? document.getElementById("cmp-notas")?.value?.trim() : "") ||
      solicitudActual.notas ||
      "";
    const comentarioActual =
      (comiteAbierto ? document.getElementById("comite-comentario")?.value?.trim() : "") ||
      solicitudActual.comentario_comite ||
      "";

    const { requiereMotivo } = detectarEleccionNoMasEconomica(res.trm, res.monedas);
    const textoMotivo =
      motivoActual ||
      (requiereMotivo
        ? "Sin justificación registrada (se eligió un proveedor distinto al más económico)."
        : "Se seleccionó la opción más económica evaluada.");
    doc.setFontSize(8);
    const motivoLines = doc.splitTextToSize(textoMotivo, contentW - 20);
    const motivoBoxH = Math.max(36, 22 + motivoLines.length * 10);
    if (endY + motivoBoxH > pageH - 24) {
      doc.addPage();
      endY = 28;
    }
    doc.setDrawColor(245, 158, 11);
    doc.setFillColor(255, 251, 235);
    doc.roundedRect(m, endY, contentW, motivoBoxH, 4, 4, "FD");
    doc.setTextColor(146, 64, 14);
    doc.setFontSize(8.2);
    doc.setFont(undefined, "bold");
    doc.text(
      requiereMotivo
        ? "MOTIVO DE ELECCIÓN DEL PROVEEDOR (Opción distinta a la más económica)"
        : "MOTIVO DE ELECCIÓN DEL PROVEEDOR",
      m + 10,
      endY + 13
    );
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(8);
    doc.setFont(undefined, "normal");
    doc.text(motivoLines, m + 10, endY + 25);
    endY += motivoBoxH + 10;

    const escribirBloqueTexto = (etiqueta, texto) => {
      if (!texto) return;
      doc.setFontSize(8);
      const lines = doc.splitTextToSize(texto, contentW - 108);
      const alto = Math.max(14, lines.length * 10 + 4);
      if (endY + alto > pageH - 24) {
        doc.addPage();
        endY = 28;
      }
      doc.setFont(undefined, "bold");
      doc.text(etiqueta, m, endY);
      doc.setFont(undefined, "normal");
      doc.text(lines, m + 104, endY);
      endY += alto + 4;
    };

    escribirBloqueTexto("Notas del comparativo:", notasActuales);
    escribirBloqueTexto("Comentario Comité:", comentarioActual);

    const nombreArchivo = `Comparativo_Comite_${String(solicitudActual.numero || "solicitud").replace(/[^a-z0-9_-]+/gi, "_")}.pdf`;
    doc.save(nombreArchivo);
    return nombreArchivo;
  }

  document.getElementById("cmp-btn-presentar").addEventListener("click", async () => {
    const nuevoEst = solicitudActual.estado === "pendiente" || solicitudActual.estado === "en_comparativo" ? "presentada" : null;
    const ok = await guardarComparativo(nuevoEst, { cerrarAlGuardar: false });
    if (!ok) return;
    renderModalComite();
  });

  document.getElementById("comite-btn-pdf")?.addEventListener("click", () => generarPdfResumenComite());

  document.getElementById("comite-btn-enviar-correo")?.addEventListener("click", async () => {
    if (!solicitudActual) return;
    const correo = document.getElementById("comite-correo-aprobador")?.value?.trim() || "";
    const motivoComite = document.getElementById("comite-motivo-seleccion")?.value?.trim() || "";
    const res = calcularResumenComite();

    // Guardar correo_aprobador, motivo_seleccion y pasar a "presentada" si aún no lo está
    const estadoNuevo = ["pendiente", "en_comparativo"].includes(solicitudActual.estado) ? "presentada" : solicitudActual.estado;
    const baseUpd = estadoNuevo !== solicitudActual.estado ? { estado: estadoNuevo } : {};
    const extraUpd = { correo_aprobador: correo || null };
    if (motivoComite || solicitudActual.motivo_seleccion) {
      extraUpd.motivo_seleccion = motivoComite || null;
    }
    const { error } = await actualizarSolicitudSeguro(solicitudActual.id, baseUpd, extraUpd);
    if (error) return manejarError(error, "No se pudo actualizar la solicitud para envío a comité");

    solicitudActual.estado = estadoNuevo;
    solicitudActual.correo_aprobador = correo || null;
    if ("motivo_seleccion" in extraUpd) solicitudActual.motivo_seleccion = extraUpd.motivo_seleccion;
    const badgeEst = document.getElementById("comite-estado-badge");
    if (badgeEst) badgeEst.innerHTML = badgeHtml(ESTADOS_SOL, estadoNuevo);
    await cargarDatos();

    // 1. Descargar PDF Comparativo Completo
    const pdfNombre = (await generarPdfResumenComite()) || "Comparativo_Comite.pdf";

    // 2. Registrar notificación interna para directivo / super_usuario
    const urlRelativa = `compras.html?solicitud=${encodeURIComponent(solicitudActual.id)}`;
    await registrarNotificacion({
      tipo: "compra_comite",
      titulo: `Aprobación de compra: ${solicitudActual.numero || ""} · ${solicitudActual.titulo || ""}`,
      mensaje: `${solicitudActual.proyectos?.nombre || solicitudActual.clientes?.nombre || "Compra"} · Total neto: ${formatoCOP(res.totCompra)} (${res.ahorro >= 0 ? "Ahorro" : "Sobrecosto"}: ${formatoCOP(res.ahorro)})`,
      url: urlRelativa,
      rol_destino: ["directivo", "super_usuario"],
      proyecto_id: solicitudActual.proyecto_id || null,
    });

    // 3. Abrir Gmail compose prellenado
    const linkAprobacion = `${window.location.origin}/compras.html?solicitud=${encodeURIComponent(solicitudActual.id)}`;
    const asunto = `Solicitud de Aprobación de Compra · ${solicitudActual.numero || ""} · ${solicitudActual.titulo || ""}`;
    const motivoLinea = solicitudActual.motivo_seleccion ? `• Motivo de elección: ${solicitudActual.motivo_seleccion}\n` : "";
    const cuerpo =
      `Hola,\n\n` +
      `Se presenta para aprobación en Comité la siguiente solicitud de compra:\n\n` +
      `• Solicitud: ${solicitudActual.numero || "—"} — ${solicitudActual.titulo || ""}\n` +
      `• Empresa: ${solicitudActual.empresas?.nombre || "—"}\n` +
      `• Proyecto / Cliente: ${solicitudActual.proyectos?.nombre || solicitudActual.clientes?.nombre || "—"}\n` +
      `• Presupuesto Base: ${formatoCOP(res.totPresup)}\n` +
      `• SubTotal Compra (Neto): ${formatoCOP(res.totCompra)}\n` +
      `• IVA (${res.ivaPct}%): ${formatoCOP(res.ivaMonto)}\n` +
      `• Total Oferta con IVA: ${formatoCOP(res.totalConIva)}\n` +
      `• ${res.ahorro >= 0 ? "Ahorro" : "Sobrecosto"}: ${formatoCOP(res.ahorro)} (${res.pctAhorro.toFixed(1)}%)\n` +
      `${motivoLinea}\n` +
      `Aprueba o rechaza directamente aquí:\n${linkAprobacion}\n\n` +
      `Nota: Adjunta el PDF "${pdfNombre}" descargado automáticamente.`;

    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(correo)}&su=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`;
    window.open(gmailUrl, "_blank", "noopener");
    mostrarAviso("PDF comparativo descargado, notificación creada y borrador abierto en Gmail", "exito");
  });

  document.getElementById("comite-cerrar").addEventListener("click", () => cerrarModal(modalComite));
  document.getElementById("hist-cerrar").addEventListener("click", () => cerrarModal(modalHist));

  document.getElementById("comite-tbody").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-ver-hist]");
    if (!btn) return;
    const pid = btn.dataset.verHist;
    const previas = itemsPrevios.filter((p) => p.presupuesto_item_id === pid && p.solicitud_id !== solicitudActual.id);
    document.getElementById("hist-desc").textContent = btn.dataset.histDesc;
    document.getElementById("hist-contenido").innerHTML = previas
      .map(
        (p) => `
        <div class="rounded-lg border border-gray-200 p-2.5 flex justify-between items-center">
          <div>
            <p class="font-semibold">${escapeHtml(p.compras_solicitudes?.numero || "—")} · ${escapeHtml(p.compras_solicitudes?.titulo || "")}</p>
            <p class="text-gray-500">Fecha: ${formatoFecha(p.compras_solicitudes?.fecha_solicitud)} · Estado: ${escapeHtml(p.compras_solicitudes?.estado || "")}</p>
          </div>
          <div class="text-right">
            <p class="font-bold">Cant: ${p.cantidad_solicitada}</p>
            <p class="text-gray-600">${formatoCOP(p.precio_ganador || 0)} c/u</p>
          </div>
        </div>`
      )
      .join("");
    abrirModal(modalHist);
  });

  async function resolverComite(nuevoEstado) {
    const puedeAprobar = !!window.PCT_ROL_INFO?.puedeAprobarCompras;
    if (!puedeAprobar) {
      return mostrarAviso("No tienes permisos para aprobar o rechazar compras", "error");
    }
    const comentEl = document.getElementById("comite-comentario");
    const comentario = comentEl?.value?.trim() || "";
    const motivoComiteEl = document.getElementById("comite-motivo-seleccion");
    const motivoComite = motivoComiteEl?.value?.trim() || "";
    if (nuevoEstado === "rechazada" && !comentario) {
      if (comentEl) comentEl.focus();
      return mostrarAviso("Ingresa el motivo del rechazo en el comentario de comité", "error");
    }

    const basePayload = {
      estado: nuevoEstado,
      aprobado_por: session.user.id,
      fecha_aprobacion: new Date().toISOString(),
    };
    const extraPayload = {
      comentario_comite: comentario || null,
      motivo_seleccion: motivoComite || null,
    };

    const { error } = await actualizarSolicitudSeguro(solicitudActual.id, basePayload, extraPayload);
    if (error) return manejarError(error, "No se pudo actualizar el estado");

    solicitudActual.estado = nuevoEstado;
    solicitudActual.comentario_comite = comentario || null;
    solicitudActual.motivo_seleccion = motivoComite || null;

    await registrarNotificacion({
      tipo: nuevoEstado === "aprobada" ? "compra_aprobada" : "compra_rechazada",
      titulo: `Compra ${nuevoEstado === "aprobada" ? "aprobada" : "rechazada"}: ${solicitudActual.numero || ""}`,
      mensaje: comentario || solicitudActual.titulo || "",
      url: `compras.html?solicitud=${encodeURIComponent(solicitudActual.id)}`,
      rol_destino: ["compras", "super_usuario"],
      proyecto_id: solicitudActual.proyecto_id || null,
    });

    document.getElementById("cmp-estado-badge").innerHTML = badgeHtml(ESTADOS_SOL, nuevoEstado);
    actualizarBotonesOrden(nuevoEstado, solicitudActual.id);
    await cargarDatos();

    if (nuevoEstado === "aprobada") {
      renderModalComite();
      mostrarAviso("Compra aprobada por comité. Ya puedes generar la Orden de Compra.", "exito");
    } else {
      cerrarModal(modalComite);
      mostrarAviso("Compra rechazada por comité", "info");
    }
  }

  document.getElementById("comite-btn-aprobar").addEventListener("click", () => resolverComite("aprobada"));
  document.getElementById("comite-btn-rechazar").addEventListener("click", () => resolverComite("rechazada"));
  document.getElementById("comite-btn-generar-orden")?.addEventListener("click", () => generarOrdenesDeSolicitud(solicitudActual?.id));

  // --------------------------------------------------------------------------
  // GENERAR ORDEN / PRE-ORDEN + PDF + REGISTRO EN GASTOS
  // --------------------------------------------------------------------------
  async function generarPdfOrdenCompra(orden, empresa, proveedor, itemsOrden) {
    if (typeof asegurarJsPDF === "function") await asegurarJsPDF();
    if (!window.jspdf || !window.jspdf.jsPDF) {
      return mostrarAviso("No se pudo cargar jsPDF para generar el PDF", "error");
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "pt", format: "letter" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const m = 36;
    const contentW = pageW - m * 2;
    let y = 36;

    const esPreOrden = orden.tipo === "pre_orden";
    const empresaNombre = (empresa?.nombre || "GRUPO INTEGRA SAS").toUpperCase();
    const empresaNit = empresa?.nit || "—";
    const numOrden = orden.numero_orden || "OC-0001";
    const fechaEmision = formatoFecha(orden.created_at ? String(orden.created_at).slice(0, 10) : hoyLocal());
    const ciudadOc = orden.ciudad || "Barranquilla";

    // Encabezado principal
    doc.setFillColor(19, 91, 236);
    doc.rect(m, y, contentW, 46, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(13);
    doc.setFont(undefined, "bold");
    doc.text(empresaNombre, m + 12, y + 19);
    doc.setFontSize(9);
    doc.setFont(undefined, "normal");
    doc.text(`NIT: ${empresaNit}`, m + 12, y + 34);

    doc.setFontSize(13);
    doc.setFont(undefined, "bold");
    doc.text(esPreOrden ? "PRE-ORDEN DE COMPRA" : "ORDEN DE COMPRA", pageW - m - 12, y + 19, { align: "right" });
    doc.setFontSize(10);
    doc.text(`No. ${numOrden}`, pageW - m - 12, y + 34, { align: "right" });
    doc.setTextColor(0, 0, 0);

    y += 54;
    if (esPreOrden) {
      doc.setFontSize(8.5);
      doc.setTextColor(180, 83, 9);
      doc.text("Documento interno para transcripción en Siigo (Pctronic)", m, y + 4);
      doc.setTextColor(0, 0, 0);
      y += 14;
    }

    // Cajas EMISOR (izquierda) y PROVEEDOR (derecha)
    const boxGap = 12;
    const boxW = (contentW - boxGap) / 2;
    const boxH = 74;

    doc.setDrawColor(203, 213, 225);
    doc.setFillColor(248, 250, 252);
    doc.rect(m, y, boxW, boxH, "FD");
    doc.rect(m + boxW + boxGap, y, boxW, boxH, "FD");

    // EMISOR
    doc.setFontSize(8.5);
    doc.setFont(undefined, "bold");
    doc.text("EMISOR:", m + 8, y + 14);
    doc.setFont(undefined, "normal");
    doc.text(empresa?.nombre || "GRUPO INTEGRA SAS", m + 8, y + 27, { maxWidth: boxW - 16 });
    doc.text(`NIT: ${empresaNit}`, m + 8, y + 40);
    doc.text(`Dirección: ${empresa?.direccion || "—"}`, m + 8, y + 53, { maxWidth: boxW - 16 });
    doc.text(`Teléfono: ${empresa?.telefono || "—"}`, m + 8, y + 66);

    // PROVEEDOR
    const rx = m + boxW + boxGap + 8;
    doc.setFont(undefined, "bold");
    doc.text("PROVEEDOR:", rx, y + 14);
    doc.setFont(undefined, "normal");
    doc.text(proveedor?.nombre || "—", rx, y + 27, { maxWidth: boxW - 16 });
    doc.text(`NIT: ${proveedor?.nit || proveedor?.identificacion || "—"}`, rx, y + 40);
    doc.text(`Fecha: ${fechaEmision}`, rx, y + 53);
    doc.text(`Ciudad: ${ciudadOc}`, rx, y + 66);

    y += boxH + 14;

    // Tabla de ítems
    let descuentoCalc = 0;
    const bodyRows = itemsOrden.map((it, idx) => {
      const cant = Number(it.cantidad_solicitada || 0);
      const unit = Number(it.precio_ganador || 0);
      const descPct = Math.min(100, Math.max(0, Number(it.descuento_pct || 0)));
      const bruto = cant * unit;
      const descMonto = bruto * (descPct / 100);
      const neto = bruto - descMonto;
      descuentoCalc += descMonto;
      return [
        String(idx + 1),
        it.referencia || it.codigo || "—",
        it.descripcion || "—",
        `${cant} ${it.unidad || "Und"}`,
        formatoCOP(unit),
        descPct > 0 ? `${descPct}% (${formatoCOP(descMonto)})` : formatoCOP(0),
        formatoCOP(neto),
      ];
    });

    doc.autoTable({
      startY: y,
      margin: { left: m, right: m },
      head: [["Item", "Referencia", "Descripción", "Cantidad / Días", "Vr. Unitario", "Descuento", "Vr. Total"]],
      body: bodyRows,
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [19, 91, 236], textColor: 255, fontStyle: "bold" },
      columnStyles: {
        0: { halign: "center", cellWidth: 28 },
        1: { cellWidth: 68 },
        3: { halign: "right", cellWidth: 66 },
        4: { halign: "right", cellWidth: 68 },
        5: { halign: "right", cellWidth: 68 },
        6: { halign: "right", cellWidth: 72 },
      },
    });

    let bottomY = doc.lastAutoTable.finalY + 14;
    if (bottomY + 150 > pageH - 24) {
      doc.addPage();
      bottomY = 40;
    }

    const descuentoTotal = Number(orden.descuento_total ?? descuentoCalc ?? 0);
    const subtotalVal = Number(orden.subtotal || 0);
    const baseGravable = Math.max(0, subtotalVal - descuentoTotal);
    const ivaVal = Number(orden.iva || 0);
    const ivaPctLabel =
      orden.iva_porcentaje ??
      (baseGravable > 0 ? Math.round((ivaVal / baseGravable) * 1000) / 10 : 19);

    const reteivaVal = Number(orden.reteiva || 0);
    const retefuenteVal =
      orden.retefuente !== undefined
        ? Number(orden.retefuente)
        : proveedor?.aplica_retencion && baseGravable >= Number(proveedor?.monto_minimo_retencion || 0)
        ? baseGravable * (Number(proveedor?.porcentaje_retencion || 0) / 100)
        : 0;
    const reteicaVal =
      orden.reteica !== undefined
        ? Number(orden.reteica)
        : proveedor?.aplica_retencion && baseGravable >= Number(proveedor?.monto_minimo_retencion || 0)
        ? baseGravable * (Number(proveedor?.porcentaje_ica || 0) / 100)
        : 0;

    // Caja inferior izquierda: OBSERVACIONES
    const obsW = contentW * 0.58;
    const totW = contentW - obsW - 12;
    const bottomBoxH = 136;

    doc.setDrawColor(203, 213, 225);
    doc.setFillColor(248, 250, 252);
    doc.rect(m, bottomY, obsW, bottomBoxH, "FD");

    doc.setFontSize(8.5);
    doc.setFont(undefined, "bold");
    doc.text("OBSERVACIONES:", m + 8, bottomY + 14);
    doc.setFont(undefined, "normal");
    doc.setFontSize(7.5);
    const correoEmpresa = empresa?.correo || empresa?.email || "";
    const obsLines = [
      `Dirección de entrega: ${empresa?.direccion || "Barranquilla, Atlántico"}`,
      `Recibe: Compras / Almacén · Teléfono: ${empresa?.telefono || "—"}`,
      `Horario de recepción: L-V 9:00am - 12:30pm y 2:00pm - 4:30pm`,
      `Centro de costo: ${orden.centro_costo || "General"}`,
      `• En la factura debe estar relacionado el número de la orden (${numOrden}).`,
      `• Se recibe factura hasta el 25 de cada mes; después de esta fecha se radica el mes siguiente.`,
      correoEmpresa
        ? `• Enviar factura electrónica al correo: ${correoEmpresa}`
        : `• Enviar factura electrónica al correo oficial de facturación de la empresa.`,
    ];
    if (orden.observaciones_oc) obsLines.push(`Nota: ${orden.observaciones_oc}`);
    doc.text(obsLines, m + 8, bottomY + 27, { maxWidth: obsW - 16, lineHeightFactor: 1.25 });

    // Caja inferior derecha: TOTALES
    const tx = m + obsW + 12;
    doc.setFillColor(255, 255, 255);
    doc.rect(tx, bottomY, totW, bottomBoxH, "FD");

    const rowsTot = [
      ["Subtotal", formatoCOP(subtotalVal)],
      [`IVA (${ivaPctLabel}%)`, formatoCOP(ivaVal)],
      ["Descuento", `-${formatoCOP(descuentoTotal)}`],
      ["Retefuente", `-${formatoCOP(retefuenteVal)}`],
      ["ReteICA", `-${formatoCOP(reteicaVal)}`],
      ["ReteIVA", `-${formatoCOP(reteivaVal)}`],
    ];
    let ty = bottomY + 16;
    doc.setFontSize(8.5);
    rowsTot.forEach(([lbl, val]) => {
      doc.setFont(undefined, "normal");
      doc.text(lbl, tx + 8, ty);
      doc.text(val, tx + totW - 8, ty, { align: "right" });
      ty += 16;
    });

    doc.setDrawColor(203, 213, 225);
    doc.line(tx + 6, ty - 6, tx + totW - 6, ty - 6);
    doc.setFontSize(9.5);
    doc.setFont(undefined, "bold");
    doc.text("Total a Pagar", tx + 8, ty + 8);
    doc.text(formatoCOP(orden.total || 0), tx + totW - 8, ty + 8, { align: "right" });

    doc.save(`${numOrden}.pdf`);
  }

  let generandoOrden = false;

  async function generarOrdenesDeSolicitud(solicitudId = solicitudActual?.id) {
    if (generandoOrden) return;
    if (!solicitudId) return;

    const sol = solicitudes.find((s) => s.id === solicitudId) || solicitudActual;
    if (!sol) return;

    if (sol.estado !== "aprobada" && sol.estado !== "ordenada") {
      return mostrarAviso("La solicitud debe estar aprobada por comité antes de generar la Orden de Compra.", "error");
    }

    generandoOrden = true;
    try {
      // Prevenir duplicados consultando órdenes existentes en BD
      const { data: existentes, error: errExist } = await window.sb
        .from("compras_ordenes")
        .select("id, numero_orden")
        .eq("solicitud_id", sol.id);
      if (!errExist && Array.isArray(existentes) && existentes.length > 0) {
        actualizarBotonesOrden("ordenada", sol.id);
        return mostrarAviso("Esta solicitud ya tiene orden(es) de compra generada(s).", "info");
      }
      if (sol.estado === "ordenada") {
        actualizarBotonesOrden("ordenada", sol.id);
        return mostrarAviso("Esta solicitud ya está marcada como ordenada.", "info");
      }

      // Cargar ítems si no están cargados para esta solicitud
      const cmpAbiertoParaEsta = modalCmp && !modalCmp.classList.contains("hidden") && solicitudActual?.id === sol.id;
      if (solicitudActual?.id !== sol.id || !itemsActuales.length) {
        solicitudActual = sol;
        await cargarItemsYHistorialSolicitud(sol.id);
      }

      const trm = getTrmActual(solicitudActual, cmpAbiertoParaEsta);
      const monedas = getMonedasActuales(solicitudActual, cmpAbiertoParaEsta);
      const porProveedor = new Map();
      itemsActuales.forEach((it) => {
        const calc = calcularItemComparativo(it, { trm, monedas });
        if (!calc.ganadorId || !calc.precioGanador) return;
        if (!porProveedor.has(calc.ganadorId)) porProveedor.set(calc.ganadorId, []);
        porProveedor.get(calc.ganadorId).push({
          ...it,
          precio_ganador: Math.round(calc.precioGanador),
          descuento_pct: calc.descuentoPct,
        });
      });

      if (!porProveedor.size) {
        return mostrarAviso("Asigna al menos un proveedor y precio ganador antes de generar la orden", "error");
      }

      const emp = solicitudActual.empresas || {};
      const esPctronic = /pctronic/i.test(emp.nombre || "");
      const tipoOrden = esPctronic ? "pre_orden" : "orden_compra";
      const ivaInputEl = cmpAbiertoParaEsta ? document.getElementById("cmp-iva-porcentaje") : null;
      const ivaRaw = ivaInputEl && ivaInputEl.value !== "" ? Number(ivaInputEl.value) : solicitudActual?.iva_porcentaje ?? 19;
      if (!Number.isFinite(ivaRaw) || ivaRaw < 0 || ivaRaw > 100) {
        return mostrarAviso("La tarifa de IVA debe estar entre 0% y 100%", "error");
      }
      const ivaPct = ivaRaw;

      const centroCosto =
        (cmpAbiertoParaEsta ? document.getElementById("cmp-centro-costo")?.value?.trim() : "") ||
        solicitudActual.proyectos?.nombre ||
        null;
      const ciudad = (cmpAbiertoParaEsta ? document.getElementById("cmp-ciudad")?.value?.trim() : "") || "Barranquilla";
      const observacionesOc =
        (cmpAbiertoParaEsta ? document.getElementById("cmp-observaciones-oc")?.value?.trim() : "") || null;

      const proyectoObj =
        solicitudActual.proyectos ||
        (solicitudActual.proyecto_id ? proyectos.find((p) => p.id === solicitudActual.proyecto_id) : null);
      const incluirIvaEnGasto = ivaPct > 0 && proyectoObj?.iva_materiales !== false;
      const factorIvaGasto = incluirIvaEnGasto ? 1 + ivaPct / 100 : 1;

      let indiceFallback = ordenes.length;
      let erroresGastos = [];
      let gastosInsertados = 0;

      for (const [provId, itemsProv] of porProveedor.entries()) {
        const prov = proveedores.find((p) => p.id === provId) || {};
        const subtotalBruto = Math.round(
          itemsProv.reduce((a, it) => a + Number(it.cantidad_solicitada) * Number(it.precio_ganador), 0)
        );
        const descuentoTotal = Math.round(
          itemsProv.reduce(
            (a, it) =>
              a +
              Number(it.cantidad_solicitada) *
                Number(it.precio_ganador) *
                (Math.min(100, Math.max(0, Number(it.descuento_pct || 0))) / 100),
            0
          )
        );
        const baseGravable = Math.max(0, subtotalBruto - descuentoTotal);
        const iva = Math.round(baseGravable * (ivaPct / 100));
        let retefuente = 0;
        let reteica = 0;
        let reteiva = 0;
        if (prov.aplica_retencion && baseGravable >= Number(prov.monto_minimo_retencion || 0)) {
          retefuente = Math.round(baseGravable * (Number(prov.porcentaje_retencion || 0) / 100));
          reteica = Math.round(baseGravable * (Number(prov.porcentaje_ica || 0) / 100));
          if (iva > 0 && Number(prov.porcentaje_reteiva || 0) > 0) {
            reteiva = Math.round(iva * (Number(prov.porcentaje_reteiva || 0) / 100));
          }
        }
        const retenciones = retefuente + reteica + reteiva;
        const total = baseGravable + iva - retenciones;

        indiceFallback += 1;
        const numeroOrden = await obtenerConsecutivo(
          tipoOrden,
          () => `${esPctronic ? "PRE" : "OC"}-${new Date().getFullYear()}-${String(indiceFallback).padStart(4, "0")}`
        );

        const { data: ord, error } = await insertarOrdenCompraSeguro(
          {
            solicitud_id: solicitudActual.id,
            empresa_id: solicitudActual.empresa_id,
            proveedor_id: provId,
            numero_orden: numeroOrden,
            tipo: tipoOrden,
            subtotal: subtotalBruto,
            iva,
            retenciones,
            total,
          },
          {
            reteiva,
            centro_costo: centroCosto,
            ciudad,
            observaciones_oc: observacionesOc,
          }
        );
        if (error) throw error;

        // Si la solicitud viene de un proyecto, registrar SIEMPRE en `gastos`
        if (solicitudActual.proyecto_id) {
          const gastosRows = itemsProv.map((it) => {
            const descPct = Math.min(100, Math.max(0, Number(it.descuento_pct || 0)));
            const valorSinIva = Number(it.precio_ganador) * (1 - descPct / 100);
            const valorUnitReal = Math.round(valorSinIva * factorIvaGasto);
            return {
              proyecto_id: solicitudActual.proyecto_id,
              fecha: hoyLocal(),
              tipo: "Material",
              proveedor_id: provId,
              documento: numeroOrden,
              presupuesto_item_id: it.presupuesto_item_id || null,
              descripcion: it.descripcion,
              cantidad: Number(it.cantidad_solicitada),
              valor_unitario: valorUnitReal,
              observaciones: `Generado desde ${numeroOrden} (${solicitudActual.numero})${incluirIvaEnGasto ? ` · Incluye IVA ${ivaPct}%` : ""}`,
            };
          });
          const { error: errG } = await insertarGastosOrdenSeguro(gastosRows, ord?.id || null);
          if (errG) {
            console.error("Error al registrar gastos de la orden de compra:", errG);
            erroresGastos.push(`${numeroOrden}: ${errG.message || "Error al guardar gasto"}`);
          } else {
            gastosInsertados += gastosRows.length;
          }
        }

        await generarPdfOrdenCompra(
          { ...ord, iva_porcentaje: ivaPct, descuento_total: descuentoTotal, retefuente, reteica, reteiva },
          emp,
          prov,
          itemsProv
        );
      }

      const { error: errSol } = await window.sb.from("compras_solicitudes").update({ estado: "ordenada" }).eq("id", solicitudActual.id);
      if (errSol) throw errSol;
      solicitudActual.estado = "ordenada";
      document.getElementById("cmp-estado-badge").innerHTML = badgeHtml(ESTADOS_SOL, "ordenada");
      actualizarBotonesOrden("ordenada", solicitudActual.id);

      cerrarModal(modalCmp);
      cerrarModal(modalComite);
      await cargarDatos();

      if (erroresGastos.length > 0) {
        mostrarAviso(
          `Orden generada, pero no se pudo cargar a Gastos del proyecto (${erroresGastos[0]}).`,
          "error"
        );
      } else if (solicitudActual.proyecto_id && gastosInsertados > 0) {
        mostrarAviso("Orden de compra generada y cargada a Gastos del proyecto.", "exito");
      } else {
        mostrarAviso(
          esPctronic ? "Pre-orden generada para transcripción en Siigo" : "Orden de Compra PDF generada exitosamente",
          "exito"
        );
      }
    } catch (err) {
      manejarError(err, "No se pudo generar la orden");
    } finally {
      generandoOrden = false;
    }
  }

  document.getElementById("cmp-btn-orden").addEventListener("click", () => generarOrdenesDeSolicitud(solicitudActual?.id));

  // --------------------------------------------------------------------------
  // ELIMINACIÓN DE COMPRAS (SOLO SUPER USUARIO / ADMIN)
  // --------------------------------------------------------------------------
  function abrirModalEliminarCompra(tipo, id) {
    if (!esSuperUsuario()) {
      return mostrarAviso("Solo el Super Usuario puede eliminar registros de compras.", "error");
    }
    const tituloEl = document.getElementById("del-compra-titulo");
    const msgEl = document.getElementById("del-compra-mensaje");
    if (tipo === "orden") {
      const ord = ordenes.find((o) => o.id === id);
      if (!ord) return;
      pendienteEliminar = { tipo: "orden", id };
      if (tituloEl) tituloEl.textContent = `Eliminar orden ${ord.numero_orden || ""}`;
      if (msgEl) {
        msgEl.textContent =
          `¿Seguro que deseas eliminar la orden ${ord.numero_orden || "sin número"} ` +
          `(${ord.proveedores?.nombre || "sin proveedor"})? También se eliminarán los gastos vinculados en el proyecto y, si no quedan más órdenes, la solicitud volverá a estado «Aprobada».`;
      }
    } else {
      const sol = solicitudes.find((s) => s.id === id);
      if (!sol) return;
      pendienteEliminar = { tipo: "solicitud", id };
      if (tituloEl) tituloEl.textContent = `Eliminar solicitud ${sol.numero || ""}`;
      if (msgEl) {
        msgEl.textContent =
          `¿Seguro que deseas eliminar la solicitud ${sol.numero || "sin número"} («${sol.titulo || ""}»)? ` +
          `Se eliminarán sus ítems del comparativo, sus órdenes de compra asociadas y cualquier gasto vinculado en el proyecto.`;
      }
    }
    abrirModal(modalEliminar);
  }

  async function ejecutarEliminacionCompra() {
    if (!esSuperUsuario() || !pendienteEliminar) return;
    const btnConfirmar = document.getElementById("del-compra-confirmar");
    if (btnConfirmar) btnConfirmar.disabled = true;

    try {
      if (pendienteEliminar.tipo === "orden") {
        const ord = ordenes.find((o) => o.id === pendienteEliminar.id);
        if (!ord) {
          cerrarModal(modalEliminar);
          return;
        }
        const solPadre = solicitudes.find((s) => s.id === ord.solicitud_id);
        await eliminarGastosDeOrdenSeguro(ord, solPadre?.proyecto_id || null);

        const { error: errDelOrd } = await window.sb.from("compras_ordenes").delete().eq("id", ord.id);
        if (errDelOrd) throw errDelOrd;

        if (ord.solicitud_id) {
          const { data: restantes, error: errRem } = await window.sb
            .from("compras_ordenes")
            .select("id")
            .eq("solicitud_id", ord.solicitud_id);
          if (!errRem && (!restantes || restantes.length === 0) && solPadre?.estado === "ordenada") {
            const { error: errRev } = await window.sb
              .from("compras_solicitudes")
              .update({ estado: "aprobada" })
              .eq("id", ord.solicitud_id);
            if (errRev) console.warn("No se pudo revertir el estado de la solicitud a aprobada:", errRev);
          }
        }
        mostrarAviso(`Orden ${ord.numero_orden || ""} eliminada correctamente.`, "exito");
      } else {
        const sol = solicitudes.find((s) => s.id === pendienteEliminar.id);
        if (!sol) {
          cerrarModal(modalEliminar);
          return;
        }
        const { data: ordenesSol } = await window.sb
          .from("compras_ordenes")
          .select("id, numero_orden")
          .eq("solicitud_id", sol.id);
        for (const oc of ordenesSol || []) {
          await eliminarGastosDeOrdenSeguro(oc, sol.proyecto_id || null);
        }

        const { error: errDelSol } = await window.sb.from("compras_solicitudes").delete().eq("id", sol.id);
        if (errDelSol) throw errDelSol;

        if (solicitudActual?.id === sol.id) {
          solicitudActual = null;
          itemsActuales = [];
          cerrarModal(modalCmp);
          cerrarModal(modalComite);
        }
        mostrarAviso(`Solicitud ${sol.numero || ""} eliminada correctamente.`, "exito");
      }

      pendienteEliminar = null;
      cerrarModal(modalEliminar);
      await cargarDatos();
    } catch (err) {
      manejarError(err, "No se pudo eliminar el registro de compra");
    } finally {
      if (btnConfirmar) btnConfirmar.disabled = false;
    }
  }

  document.getElementById("del-compra-cerrar")?.addEventListener("click", () => {
    pendienteEliminar = null;
    cerrarModal(modalEliminar);
  });
  document.getElementById("del-compra-cancelar")?.addEventListener("click", () => {
    pendienteEliminar = null;
    cerrarModal(modalEliminar);
  });
  document.getElementById("del-compra-confirmar")?.addEventListener("click", ejecutarEliminacionCompra);

  document.getElementById("tabla-ordenes").addEventListener("click", async (e) => {
    const btnDel = e.target.closest("[data-eliminar-orden]");
    if (btnDel) return abrirModalEliminarCompra("orden", btnDel.dataset.eliminarOrden);
    const btn = e.target.closest("[data-pdf-orden]");
    if (!btn) return;
    const ord = ordenes.find((o) => o.id === btn.dataset.pdfOrden);
    if (!ord) return;
    const { data: items, error: errItems } = await window.sb
      .from("compras_solicitud_items")
      .select("*")
      .eq("solicitud_id", ord.solicitud_id)
      .eq("proveedor_ganador_id", ord.proveedor_id);
    if (errItems) return manejarError(errItems, "No se pudieron cargar los ítems de la orden");
    await generarPdfOrdenCompra(ord, ord.empresas, ord.proveedores, items || []);
  });

  // Tecla Escape para cerrar el modal superior activo
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (modalEliminar && !modalEliminar.classList.contains("hidden")) {
      pendienteEliminar = null;
      return cerrarModal(modalEliminar);
    }
    if (!modalHist.classList.contains("hidden")) return cerrarModal(modalHist);
    if (!modalComite.classList.contains("hidden")) return cerrarModal(modalComite);
    if (!modalCmp.classList.contains("hidden")) return cerrarModal(modalCmp);
    if (!modalNueva.classList.contains("hidden")) return cerrarModal(modalNueva);
  });

  // Inicialización + soporte de deep-link ?solicitud=<id>
  await cargarCatalogos();
  await cargarDatos();

  const solParam = typeof qs === "function" ? qs("solicitud") : new URLSearchParams(window.location.search).get("solicitud");
  const vistaParam = typeof qs === "function" ? qs("vista") : new URLSearchParams(window.location.search).get("vista");
  if (solParam) {
    const existe = solicitudes.find((s) => s.id === solParam);
    if (existe) {
      if (vistaParam === "comparativo") {
        await abrirComparativo(solParam);
      } else {
        await abrirComitePorId(solParam);
      }
    }
  }
})();
