// ============================================================================
// COMPRAS OPERATIVO · Solicitudes, Cuadro Comparativo (hasta 3 proveedores),
// Presentación a Comité, Aprobación y Generación de Pre-orden / Orden de Compra
// (con retenciones de proveedor y registro automático en `gastos`).
// ============================================================================
(async () => {
  const { session } = await window.pctronicReady;

  let solicitudes = [];
  let ordenes = [];
  let proveedores = [];
  let empresas = [];
  let proyectos = [];
  let clientes = [];
  let itemsPrevios = []; // todos los compras_solicitud_items para detectar compras previas

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

  async function cargarCatalogos() {
    const [pRes, eRes, prRes, cRes] = await Promise.all([
      window.sb.from("proveedores").select("*").order("nombre"),
      window.sb.from("empresas").select("*").order("nombre"),
      window.sb.from("proyectos").select("id, nombre, cliente_id, empresa_id").order("nombre"),
      window.sb.from("clientes").select("id, nombre").order("nombre"),
    ]);
    proveedores = pRes.data || [];
    empresas = eRes.data || [];
    proyectos = prRes.data || [];
    clientes = cRes.data || [];
  }

  async function cargarDatos() {
    const [sRes, oRes, itRes] = await Promise.all([
      window.sb
        .from("compras_solicitudes")
        .select("*, proyectos(id, nombre), empresas(id, nombre, nit, direccion, telefono, email, logo_url), clientes(id, nombre)")
        .order("created_at", { ascending: false }),
      window.sb
        .from("compras_ordenes")
        .select("*, empresas(nombre, nit, direccion, telefono, email, logo_url), proveedores(nombre, nit, aplica_retencion, porcentaje_retencion, porcentaje_ica, monto_minimo_retencion), compras_solicitudes(numero, titulo)")
        .order("created_at", { ascending: false }),
      window.sb
        .from("compras_solicitud_items")
        .select("id, solicitud_id, presupuesto_item_id, cantidad_solicitada, precio_ganador, proveedor_ganador_id, created_at, compras_solicitudes(numero, titulo, estado, fecha_solicitud)")
        .not("presupuesto_item_id", "is", null),
    ]);

    if (sRes.error) return manejarError(sRes.error, "No se pudo cargar las solicitudes");
    if (oRes.error) return manejarError(oRes.error, "No se pudo cargar las órdenes");

    solicitudes = sRes.data || [];
    ordenes = oRes.data || [];
    itemsPrevios = itRes.data || [];

    actualizarKPIs();
    renderSolicitudes();
    renderOrdenes();
  }

  function actualizarKPIs() {
    document.getElementById("kpi-pendientes").textContent = solicitudes.filter((s) => s.estado === "pendiente").length;
    document.getElementById("kpi-comparativo").textContent = solicitudes.filter((s) => ["en_comparativo", "presentada"].includes(s.estado)).length;
    document.getElementById("kpi-aprobadas").textContent = solicitudes.filter((s) => ["aprobada", "ordenada"].includes(s.estado)).length;
    const totalOrd = ordenes.reduce((a, o) => a + Number(o.total || 0), 0);
    document.getElementById("kpi-total-comprado").textContent = formatoMoneda(totalOrd);
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

    const tbody = document.getElementById("tabla-solicitudes");
    tbody.innerHTML = lista.length
      ? lista
          .map(
            (s) => `
          <tr class="border-b border-gray-50 last:border-0 hover:bg-gray-50">
            <td class="px-4 py-3 font-mono text-xs font-semibold text-gray-700">${escapeHtml(s.numero || "—")}</td>
            <td class="px-4 py-3 font-medium text-gray-900">${escapeHtml(s.titulo)}</td>
            <td class="px-4 py-3"><span class="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">${ORIGEN_LABEL[s.origen] || s.origen}</span></td>
            <td class="px-4 py-3 text-gray-600">${escapeHtml(s.proyectos?.nombre || s.clientes?.nombre || "—")}</td>
            <td class="px-4 py-3 text-gray-600">${escapeHtml(s.empresas?.nombre || "—")}</td>
            <td class="px-4 py-3 text-gray-500">${formatoFecha(s.fecha_solicitud)}</td>
            <td class="px-4 py-3">${badgeHtml(ESTADOS_SOL, s.estado)}</td>
            <td class="px-4 py-3 text-right whitespace-nowrap">
              <button type="button" data-abrir-sol="${s.id}" class="rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-blue-100">
                Abrir Comparativo
              </button>
            </td>
          </tr>`
          )
          .join("")
      : `<tr><td class="px-4 py-8 text-center text-gray-400" colspan="8">No hay solicitudes para ese filtro.</td></tr>`;
  }

  function renderOrdenes() {
    const tbody = document.getElementById("tabla-ordenes");
    tbody.innerHTML = ordenes.length
      ? ordenes
          .map(
            (o) => `
          <tr class="border-b border-gray-50 last:border-0 hover:bg-gray-50">
            <td class="px-4 py-3 font-mono text-xs font-semibold">${escapeHtml(o.numero_orden || "—")}</td>
            <td class="px-4 py-3">
              <span class="rounded-full px-2 py-0.5 text-xs font-semibold ${o.tipo === "pre_orden" ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800"}">
                ${o.tipo === "pre_orden" ? "Pre-orden (Siigo)" : "Orden de Compra"}
              </span>
            </td>
            <td class="px-4 py-3 text-gray-700">${escapeHtml(o.empresas?.nombre || "—")}</td>
            <td class="px-4 py-3 font-medium text-gray-900">${escapeHtml(o.proveedores?.nombre || "—")}</td>
            <td class="px-4 py-3 text-right tabular-nums">${formatoMoneda(o.subtotal)}</td>
            <td class="px-4 py-3 text-right tabular-nums text-red-600">${formatoMoneda(o.retenciones)}</td>
            <td class="px-4 py-3 text-right font-bold tabular-nums">${formatoMoneda(o.total)}</td>
            <td class="px-4 py-3 text-gray-500">${formatoFecha(o.created_at)}</td>
            <td class="px-4 py-3 text-right">
              <button type="button" data-pdf-orden="${o.id}" class="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50">
                <span class="material-symbols-outlined text-[15px]">picture_as_pdf</span> PDF
              </button>
            </td>
          </tr>`
          )
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
            <td class="p-1.5 text-center"><button type="button" data-ns-del="${idx}" class="text-red-500 hover:text-red-700"><span class="material-symbols-outlined text-[16px]">delete</span></button></td>
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
    modalNueva.classList.remove("hidden");
    modalNueva.classList.add("flex");
  }

  document.getElementById("btn-nueva-manual").addEventListener("click", () => abrirModalNueva("manual"));
  document.getElementById("btn-nueva-suministro").addEventListener("click", () => abrirModalNueva("suministro"));
  document.getElementById("ns-cerrar").addEventListener("click", () => modalNueva.classList.add("hidden"));
  document.getElementById("ns-cancelar").addEventListener("click", () => modalNueva.classList.add("hidden"));

  document.getElementById("ns-agregar-item").addEventListener("click", () => {
    nuevoItems.push({ codigo: "", descripcion: "", unidad: "Und", cantidad_solicitada: 1, costo_presupuestado_unit: 0 });
    renderNuevoItems();
  });

  document.getElementById("ns-items-tbody").addEventListener("input", (e) => {
    const idx = e.target.dataset.nsIdx;
    const f = e.target.dataset.nsF;
    if (idx === undefined || !f) return;
    nuevoItems[Number(idx)][f] = ["cantidad_solicitada", "costo_presupuestado_unit"].includes(f)
      ? Number(e.target.value || 0)
      : e.target.value;
  });

  document.getElementById("ns-items-tbody").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-ns-del]");
    if (!btn) return;
    nuevoItems.splice(Number(btn.dataset.nsDel), 1);
    renderNuevoItems();
  });

  document.getElementById("ns-descargar-plantilla").addEventListener("click", () => {
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
      const filas = await leerArchivoExcel(file);
      const parseados = filas
        .map((r) => ({
          codigo: String(r["Código"] || r["Codigo"] || r["codigo"] || "").trim(),
          descripcion: String(r["Descripción"] || r["Descripcion"] || r["descripcion"] || "").trim(),
          unidad: String(r["Unidad"] || r["Und"] || r["unidad"] || "Und").trim(),
          cantidad_solicitada: Number(r["Cantidad"] || r["Cant"] || r["cantidad"] || 1) || 1,
          costo_presupuestado_unit: Number(r["Costo Presupuestado"] || r["Costo"] || r["costo"] || 0) || 0,
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

    const numero = `SOL-${new Date().getFullYear()}-${String(solicitudes.length + 1).padStart(4, "0")}`;
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

      modalNueva.classList.add("hidden");
      mostrarAviso(`Solicitud ${numero} creada`, "exito");
      await cargarDatos();
      abrirComparativo(sol.id);
    } catch (err) {
      manejarError(err, "No se pudo crear la solicitud");
    }
  });

  // --------------------------------------------------------------------------
  // CUADRO COMPARATIVO
  // --------------------------------------------------------------------------
  const modalCmp = document.getElementById("modal-comparativo");

  function opcionesProveedores(selectedId) {
    return (
      `<option value="">— Seleccionar proveedor —</option>` +
      proveedores
        .map((p) => `<option value="${p.id}" ${p.id === selectedId ? "selected" : ""}>${escapeHtml(p.nombre)}</option>`)
        .join("")
    );
  }

  function calcularItemComparativo(it) {
    const p1 = it.proveedor_1_id && it.precio_1 !== null && it.precio_1 !== "" ? Number(it.precio_1) : null;
    const p2 = it.proveedor_2_id && it.precio_2 !== null && it.precio_2 !== "" ? Number(it.precio_2) : null;
    const p3 = it.proveedor_3_id && it.precio_3 !== null && it.precio_3 !== "" ? Number(it.precio_3) : null;
    const candidatos = [
      { slot: 1, id: it.proveedor_1_id, precio: p1 },
      { slot: 2, id: it.proveedor_2_id, precio: p2 },
      { slot: 3, id: it.proveedor_3_id, precio: p3 },
    ].filter((c) => c.id && c.precio !== null && c.precio > 0);

    let mejor = null;
    candidatos.forEach((c) => {
      if (!mejor || c.precio < mejor.precio) mejor = c;
    });

    const ganadorId = it.proveedor_ganador_id || mejor?.id || null;
    const ganadorCand = candidatos.find((c) => c.id === ganadorId) || mejor;
    const precioGanador = it.precio_ganador ? Number(it.precio_ganador) : ganadorCand?.precio || 0;
    const presup = Number(it.costo_presupuestado_unit || 0);
    const cant = Number(it.cantidad_solicitada || 1);
    const diffTotal = presup > 0 && precioGanador > 0 ? (presup - precioGanador) * cant : 0;
    const sobrecosto = presup > 0 && precioGanador > presup;

    return { mejor, ganadorId, precioGanador, diffTotal, sobrecosto, candidatos };
  }

  function actualizarResumenComparativo() {
    const prov1Id = document.getElementById("cmp-prov-1").value || null;
    const prov2Id = document.getElementById("cmp-prov-2").value || null;
    const prov3Id = document.getElementById("cmp-prov-3").value || null;

    const nombreProv = (id) => proveedores.find((p) => p.id === id)?.nombre || "Sin asignar";
    document.getElementById("th-prov-1").textContent = prov1Id ? nombreProv(prov1Id) : "Precio Prov 1";
    document.getElementById("th-prov-2").textContent = prov2Id ? nombreProv(prov2Id) : "Precio Prov 2";
    document.getElementById("th-prov-3").textContent = prov3Id ? nombreProv(prov3Id) : "Precio Prov 3";

    let totPresup = 0;
    let totGanador = 0;
    let totP1 = 0;
    let totP2 = 0;
    let totP3 = 0;
    let haySobrecosto = false;

    itemsActuales.forEach((it) => {
      it.proveedor_1_id = prov1Id;
      it.proveedor_2_id = prov2Id;
      it.proveedor_3_id = prov3Id;
      const cant = Number(it.cantidad_solicitada || 1);
      totPresup += Number(it.costo_presupuestado_unit || 0) * cant;
      if (it.precio_1) totP1 += Number(it.precio_1) * cant;
      if (it.precio_2) totP2 += Number(it.precio_2) * cant;
      if (it.precio_3) totP3 += Number(it.precio_3) * cant;

      const calc = calcularItemComparativo(it);
      totGanador += calc.precioGanador * cant;
      if (calc.sobrecosto) haySobrecosto = true;
    });

    const totalesProv = [
      { id: prov1Id, nombre: nombreProv(prov1Id), total: totP1 },
      { id: prov2Id, nombre: nombreProv(prov2Id), total: totP2 },
      { id: prov3Id, nombre: nombreProv(prov3Id), total: totP3 },
    ].filter((x) => x.id && x.total > 0);
    totalesProv.sort((a, b) => a.total - b.total);
    const masEconomico = totalesProv[0];

    const ahorro = totPresup > 0 && totGanador > 0 ? totPresup - totGanador : 0;
    const pctAhorro = totPresup > 0 && totGanador > 0 ? (ahorro / totPresup) * 100 : 0;

    document.getElementById("cmp-resumen").innerHTML = `
      <div class="rounded-xl border border-gray-200 bg-white p-3">
        <p class="text-[11px] font-semibold uppercase text-gray-500">Presupuesto Base</p>
        <p class="mt-1 text-base font-bold tabular-nums">${formatoMoneda(totPresup)}</p>
      </div>
      <div class="rounded-xl border border-gray-200 bg-white p-3">
        <p class="text-[11px] font-semibold uppercase text-gray-500">Total Selección Ganadora</p>
        <p class="mt-1 text-base font-bold tabular-nums text-primary">${formatoMoneda(totGanador)}</p>
      </div>
      <div class="rounded-xl border border-gray-200 bg-white p-3">
        <p class="text-[11px] font-semibold uppercase text-gray-500">Ahorro / Sobrecosto</p>
        <p class="mt-1 text-base font-bold tabular-nums ${ahorro >= 0 ? "text-emerald-600" : "text-red-600"}">
          ${formatoMoneda(ahorro)} (${pctAhorro.toFixed(1)}%)
        </p>
      </div>
      <div class="rounded-xl border border-gray-200 bg-white p-3">
        <p class="text-[11px] font-semibold uppercase text-gray-500">Prov. Más Económico Global</p>
        <p class="mt-1 text-sm font-bold text-gray-900 truncate">${masEconomico ? `${escapeHtml(masEconomico.nombre)} (${formatoMoneda(masEconomico.total)})` : "—"}</p>
      </div>`;

    const alertas = [];
    if (haySobrecosto) {
      alertas.push(`<div class="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-800">
        <span class="material-symbols-outlined text-[18px]">warning</span>
        Alerta de sobrecosto: Uno o más ítems superan el costo unitario presupuestado.
      </div>`);
    }
    const itemsRepetidos = itemsActuales.filter((it) =>
      it.presupuesto_item_id &&
      itemsPrevios.some((p) => p.presupuesto_item_id === it.presupuesto_item_id && p.solicitud_id !== solicitudActual.id)
    );
    if (itemsRepetidos.length) {
      alertas.push(`<div class="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
        <span class="material-symbols-outlined text-[18px]">history</span>
        ${itemsRepetidos.length} ítem(s) de esta solicitud ya registran compras en solicitudes anteriores. Revisa el historial en «Presentar Compra (Comité)».
      </div>`);
    }
    document.getElementById("cmp-alertas").innerHTML = alertas.join("");
  }

  function renderTablaComparativo() {
    const tbody = document.getElementById("cmp-tbody");
    tbody.innerHTML = itemsActuales
      .map((it, idx) => {
        const calc = calcularItemComparativo(it);
        const esM1 = calc.mejor?.slot === 1;
        const esM2 = calc.mejor?.slot === 2;
        const esM3 = calc.mejor?.slot === 3;

        const opcGanador = [
          it.proveedor_1_id ? { id: it.proveedor_1_id, label: proveedores.find((p) => p.id === it.proveedor_1_id)?.nombre } : null,
          it.proveedor_2_id ? { id: it.proveedor_2_id, label: proveedores.find((p) => p.id === it.proveedor_2_id)?.nombre } : null,
          it.proveedor_3_id ? { id: it.proveedor_3_id, label: proveedores.find((p) => p.id === it.proveedor_3_id)?.nombre } : null,
        ].filter(Boolean);

        return `
        <tr class="border-t border-gray-100 ${calc.sobrecosto ? "bg-red-50/40" : ""}">
          <td class="px-2 py-2">
            <div class="font-medium text-gray-900">${escapeHtml(it.descripcion)}</div>
            <div class="text-[10px] text-gray-400">${escapeHtml(it.codigo || "")} · ${escapeHtml(it.unidad || "Und")}</div>
          </td>
          <td class="px-2 py-2 text-right tabular-nums">${Number(it.cantidad_solicitada)}</td>
          <td class="px-2 py-2 text-right tabular-nums text-gray-600">${formatoMoneda(it.costo_presupuestado_unit)}</td>
          <td class="px-2 py-2">
            <input type="number" min="0" step="1" data-cmp-idx="${idx}" data-cmp-f="precio_1" value="${it.precio_1 ?? ""}"
              class="w-24 rounded border-gray-300 px-2 py-1 text-right text-xs ${esM1 ? "border-emerald-500 bg-emerald-50 font-bold text-emerald-800" : ""}" />
          </td>
          <td class="px-2 py-2">
            <input type="number" min="0" step="1" data-cmp-idx="${idx}" data-cmp-f="precio_2" value="${it.precio_2 ?? ""}"
              class="w-24 rounded border-gray-300 px-2 py-1 text-right text-xs ${esM2 ? "border-emerald-500 bg-emerald-50 font-bold text-emerald-800" : ""}" />
          </td>
          <td class="px-2 py-2">
            <input type="number" min="0" step="1" data-cmp-idx="${idx}" data-cmp-f="precio_3" value="${it.precio_3 ?? ""}"
              class="w-24 rounded border-gray-300 px-2 py-1 text-right text-xs ${esM3 ? "border-emerald-500 bg-emerald-50 font-bold text-emerald-800" : ""}" />
          </td>
          <td class="px-2 py-2">
            <select data-cmp-idx="${idx}" data-cmp-ganador="1" class="w-36 rounded border-gray-300 px-2 py-1 text-xs">
              <option value="">Auto (mejor)</option>
              ${opcGanador.map((g) => `<option value="${g.id}" ${calc.ganadorId === g.id ? "selected" : ""}>${escapeHtml(g.label)}</option>`).join("")}
            </select>
          </td>
          <td class="px-2 py-2 text-right font-semibold tabular-nums ${calc.diffTotal >= 0 ? "text-emerald-600" : "text-red-600"}">
            ${calc.precioGanador > 0 && it.costo_presupuestado_unit > 0 ? formatoMoneda(calc.diffTotal) : "—"}
          </td>
        </tr>`;
      })
      .join("");
  }

  async function abrirComparativo(solicitudId) {
    solicitudActual = solicitudes.find((s) => s.id === solicitudId);
    if (!solicitudActual) return;

    const { data, error } = await window.sb
      .from("compras_solicitud_items")
      .select("*")
      .eq("solicitud_id", solicitudId)
      .order("created_at");
    if (error) return manejarError(error, "No se pudo cargar los ítems de la solicitud");

    itemsActuales = data || [];
    document.getElementById("cmp-titulo").textContent = `${solicitudActual.numero || ""} · ${solicitudActual.titulo}`;
    document.getElementById("cmp-subtitulo").textContent =
      `Empresa: ${solicitudActual.empresas?.nombre || "—"} · Origen: ${ORIGEN_LABEL[solicitudActual.origen]} · ` +
      (solicitudActual.proyectos?.nombre ? `Proyecto: ${solicitudActual.proyectos.nombre}` : `Cliente: ${solicitudActual.clientes?.nombre || "—"}`);
    document.getElementById("cmp-estado-badge").innerHTML = badgeHtml(ESTADOS_SOL, solicitudActual.estado);

    document.getElementById("cmp-btn-orden").classList.toggle("hidden", !["aprobada", "ordenada"].includes(solicitudActual.estado));

    const first = itemsActuales[0] || {};
    document.getElementById("cmp-prov-1").innerHTML = opcionesProveedores(first.proveedor_1_id);
    document.getElementById("cmp-prov-2").innerHTML = opcionesProveedores(first.proveedor_2_id);
    document.getElementById("cmp-prov-3").innerHTML = opcionesProveedores(first.proveedor_3_id);

    actualizarResumenComparativo();
    renderTablaComparativo();
    modalCmp.classList.remove("hidden");
    modalCmp.classList.add("flex");
  }

  document.getElementById("tabla-solicitudes").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-abrir-sol]");
    if (btn) abrirComparativo(btn.dataset.abrirSol);
  });
  document.getElementById("cmp-cerrar").addEventListener("click", () => modalCmp.classList.add("hidden"));

  document.querySelectorAll(".cmp-prov-select").forEach((sel) => {
    sel.addEventListener("change", () => {
      actualizarResumenComparativo();
      renderTablaComparativo();
    });
  });

  document.getElementById("cmp-tbody").addEventListener("input", (e) => {
    const idx = e.target.dataset.cmpIdx;
    const f = e.target.dataset.cmpF;
    if (idx === undefined || !f) return;
    itemsActuales[Number(idx)][f] = e.target.value === "" ? null : Number(e.target.value);
    const calc = calcularItemComparativo(itemsActuales[Number(idx)]);
    itemsActuales[Number(idx)].proveedor_ganador_id = calc.ganadorId;
    itemsActuales[Number(idx)].precio_ganador = calc.precioGanador || null;
    actualizarResumenComparativo();
  });

  document.getElementById("cmp-tbody").addEventListener("change", (e) => {
    if (e.target.dataset.cmpGanador) {
      const idx = Number(e.target.dataset.cmpIdx);
      const provId = e.target.value || null;
      const it = itemsActuales[idx];
      it.proveedor_ganador_id = provId;
      if (provId === it.proveedor_1_id) it.precio_ganador = it.precio_1;
      else if (provId === it.proveedor_2_id) it.precio_ganador = it.precio_2;
      else if (provId === it.proveedor_3_id) it.precio_ganador = it.precio_3;
      else {
        const calc = calcularItemComparativo(it);
        it.proveedor_ganador_id = calc.ganadorId;
        it.precio_ganador = calc.precioGanador || null;
      }
      actualizarResumenComparativo();
      renderTablaComparativo();
    } else if (e.target.dataset.cmpF) {
      renderTablaComparativo();
    }
  });

  async function guardarComparativo(nuevoEstado = null) {
    try {
      for (const it of itemsActuales) {
        const calc = calcularItemComparativo(it);
        const { error } = await window.sb
          .from("compras_solicitud_items")
          .update({
            proveedor_1_id: it.proveedor_1_id || null,
            precio_1: it.precio_1 ?? null,
            proveedor_2_id: it.proveedor_2_id || null,
            precio_2: it.precio_2 ?? null,
            proveedor_3_id: it.proveedor_3_id || null,
            precio_3: it.precio_3 ?? null,
            proveedor_ganador_id: calc.ganadorId || null,
            precio_ganador: calc.precioGanador || null,
          })
          .eq("id", it.id);
        if (error) throw error;
      }
      const estadoFinal = nuevoEstado || (solicitudActual.estado === "pendiente" ? "en_comparativo" : solicitudActual.estado);
      if (estadoFinal !== solicitudActual.estado) {
        const { error } = await window.sb.from("compras_solicitudes").update({ estado: estadoFinal }).eq("id", solicitudActual.id);
        if (error) throw error;
        solicitudActual.estado = estadoFinal;
      }
      document.getElementById("cmp-estado-badge").innerHTML = badgeHtml(ESTADOS_SOL, solicitudActual.estado);
      mostrarAviso("Comparativo guardado", "exito");
      await cargarDatos();
    } catch (err) {
      manejarError(err, "No se pudo guardar el comparativo");
    }
  }

  document.getElementById("cmp-btn-guardar").addEventListener("click", () => guardarComparativo());

  // --------------------------------------------------------------------------
  // PRESENTACIÓN A COMITÉ + APROBACIÓN
  // --------------------------------------------------------------------------
  const modalComite = document.getElementById("modal-comite");
  const modalHist = document.getElementById("modal-historial-item");

  document.getElementById("cmp-btn-presentar").addEventListener("click", async () => {
    await guardarComparativo(solicitudActual.estado === "pendiente" || solicitudActual.estado === "en_comparativo" ? "presentada" : null);

    let totPresup = 0;
    let totCompra = 0;

    document.getElementById("comite-subtitulo").textContent = `${solicitudActual.numero} · ${solicitudActual.titulo}`;
    document.getElementById("comite-tbody").innerHTML = itemsActuales
      .map((it) => {
        const calc = calcularItemComparativo(it);
        const cantInicial = Number(it.cantidad_presupuestada || it.cantidad_solicitada || 0);
        const previas = it.presupuesto_item_id
          ? itemsPrevios.filter((p) => p.presupuesto_item_id === it.presupuesto_item_id && p.solicitud_id !== solicitudActual.id)
          : [];
        const compradoAntes = previas.reduce((a, p) => a + Number(p.cantidad_solicitada || 0), 0);
        const pendiente = Math.max(0, cantInicial - compradoAntes);
        const cantSol = Number(it.cantidad_solicitada || 0);
        const totalIt = cantSol * calc.precioGanador;
        totPresup += cantSol * Number(it.costo_presupuestado_unit || 0);
        totCompra += totalIt;

        const provNombre = proveedores.find((p) => p.id === calc.ganadorId)?.nombre || "Sin proveedor";
        return `
        <tr class="border-t border-gray-100">
          <td class="px-3 py-2 font-medium text-gray-900">${escapeHtml(it.descripcion)}</td>
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
          <td class="px-3 py-2">${escapeHtml(provNombre)}</td>
          <td class="px-3 py-2 text-right tabular-nums">${formatoMoneda(calc.precioGanador)}</td>
          <td class="px-3 py-2 text-right tabular-nums font-bold">${formatoMoneda(totalIt)}</td>
        </tr>`;
      })
      .join("");

    const ahorro = totPresup > 0 ? totPresup - totCompra : 0;
    document.getElementById("comite-kpis").innerHTML = `
      <div class="rounded-lg border border-gray-200 p-3"><p class="text-[11px] uppercase text-gray-500">Presupuestado</p><p class="text-base font-bold">${formatoMoneda(totPresup)}</p></div>
      <div class="rounded-lg border border-gray-200 p-3"><p class="text-[11px] uppercase text-gray-500">Total Compra</p><p class="text-base font-bold text-primary">${formatoMoneda(totCompra)}</p></div>
      <div class="rounded-lg border border-gray-200 p-3"><p class="text-[11px] uppercase text-gray-500">${ahorro >= 0 ? "Ahorro" : "Sobrecosto"}</p><p class="text-base font-bold ${ahorro >= 0 ? "text-emerald-600" : "text-red-600"}">${formatoMoneda(ahorro)}</p></div>
      <div class="rounded-lg border border-gray-200 p-3"><p class="text-[11px] uppercase text-gray-500">Estado</p><p class="mt-1">${badgeHtml(ESTADOS_SOL, solicitudActual.estado)}</p></div>`;

    const puedeAprobar = !!window.PCT_ROL_INFO?.puedeAprobarCompras;
    document.getElementById("comite-btn-aprobar").classList.toggle("hidden", !puedeAprobar || solicitudActual.estado === "aprobada" || solicitudActual.estado === "ordenada");
    document.getElementById("comite-btn-rechazar").classList.toggle("hidden", !puedeAprobar || solicitudActual.estado === "aprobada" || solicitudActual.estado === "ordenada");
    document.getElementById("comite-permiso-msg").textContent = puedeAprobar
      ? "Como Directivo / Super Usuario puedes aprobar o rechazar esta compra."
      : "Solo un Directivo o Super Usuario puede aprobar o rechazar la compra.";

    modalComite.classList.remove("hidden");
    modalComite.classList.add("flex");
  });

  document.getElementById("comite-cerrar").addEventListener("click", () => modalComite.classList.add("hidden"));
  document.getElementById("hist-cerrar").addEventListener("click", () => modalHist.classList.add("hidden"));

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
            <p class="text-gray-600">${formatoMoneda(p.precio_ganador || 0)} c/u</p>
          </div>
        </div>`
      )
      .join("");
    modalHist.classList.remove("hidden");
    modalHist.classList.add("flex");
  });

  async function resolverComite(nuevoEstado) {
    const { error } = await window.sb
      .from("compras_solicitudes")
      .update({
        estado: nuevoEstado,
        aprobado_por: session.user.id,
        fecha_aprobacion: new Date().toISOString(),
      })
      .eq("id", solicitudActual.id);
    if (error) return manejarError(error, "No se pudo actualizar el estado");
    solicitudActual.estado = nuevoEstado;
    modalComite.classList.add("hidden");
    document.getElementById("cmp-estado-badge").innerHTML = badgeHtml(ESTADOS_SOL, nuevoEstado);
    document.getElementById("cmp-btn-orden").classList.toggle("hidden", nuevoEstado !== "aprobada");
    mostrarAviso(nuevoEstado === "aprobada" ? "Compra aprobada" : "Compra rechazada", nuevoEstado === "aprobada" ? "exito" : "info");
    await cargarDatos();
  }

  document.getElementById("comite-btn-aprobar").addEventListener("click", () => resolverComite("aprobada"));
  document.getElementById("comite-btn-rechazar").addEventListener("click", () => resolverComite("rechazada"));

  // --------------------------------------------------------------------------
  // GENERAR ORDEN / PRE-ORDEN + PDF + REGISTRO EN GASTOS
  // --------------------------------------------------------------------------
  async function generarPdfOrdenCompra(orden, empresa, proveedor, itemsOrden) {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      return mostrarAviso("No se pudo cargar jsPDF para generar el PDF", "error");
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "pt", format: "letter" });
    const m = 40;
    let y = 40;

    const esPreOrden = orden.tipo === "pre_orden";
    doc.setFontSize(14);
    doc.setFont(undefined, "bold");
    doc.text(empresa?.nombre || "Empresa", m, y);
    doc.setFontSize(9);
    doc.setFont(undefined, "normal");
    doc.text(`NIT: ${empresa?.nit || "—"} · ${empresa?.direccion || ""} · ${empresa?.telefono || ""}`, m, y + 14);

    y += 38;
    doc.setFontSize(13);
    doc.setFont(undefined, "bold");
    doc.text(esPreOrden ? `PRE-ORDEN DE COMPRA N° ${orden.numero_orden}` : `ORDEN DE COMPRA N° ${orden.numero_orden}`, m, y);
    if (esPreOrden) {
      doc.setFontSize(9);
      doc.setTextColor(180, 83, 9);
      doc.text("Documento interno para transcripción en Siigo (Pctronic)", m, y + 14);
      doc.setTextColor(0);
    }

    y += 30;
    doc.setFontSize(9);
    doc.setFont(undefined, "normal");
    doc.text(`Proveedor: ${proveedor?.nombre || "—"} (NIT: ${proveedor?.nit || "—"})`, m, y);
    doc.text(`Fecha de emisión: ${formatoFecha(new Date().toISOString().slice(0, 10))}`, m, y + 14);

    y += 28;
    doc.autoTable({
      startY: y,
      margin: { left: m, right: m },
      head: [["Código", "Descripción", "Und", "Cant.", "Valor Unit.", "Subtotal"]],
      body: itemsOrden.map((it) => [
        it.codigo || "—",
        it.descripcion,
        it.unidad || "Und",
        String(it.cantidad_solicitada),
        formatoMoneda(it.precio_ganador),
        formatoMoneda(Number(it.cantidad_solicitada) * Number(it.precio_ganador)),
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [19, 91, 236] },
    });

    const finalY = doc.lastAutoTable.finalY + 18;
    doc.setFontSize(10);
    doc.text(`Subtotal: ${formatoMoneda(orden.subtotal)}`, 380, finalY);
    doc.text(`IVA (19%): ${formatoMoneda(orden.iva)}`, 380, finalY + 15);
    doc.text(`Retenciones: -${formatoMoneda(orden.retenciones)}`, 380, finalY + 30);
    doc.setFont(undefined, "bold");
    doc.text(`TOTAL A PAGAR: ${formatoMoneda(orden.total)}`, 380, finalY + 48);

    doc.save(`${orden.numero_orden}.pdf`);
  }

  document.getElementById("cmp-btn-orden").addEventListener("click", async () => {
    const porProveedor = new Map();
    itemsActuales.forEach((it) => {
      const calc = calcularItemComparativo(it);
      if (!calc.ganadorId || !calc.precioGanador) return;
      if (!porProveedor.has(calc.ganadorId)) porProveedor.set(calc.ganadorId, []);
      porProveedor.get(calc.ganadorId).push({ ...it, precio_ganador: calc.precioGanador });
    });

    if (!porProveedor.size) {
      return mostrarAviso("Asigna al menos un proveedor y precio ganador antes de generar la orden", "error");
    }

    const emp = solicitudActual.empresas || {};
    const esPctronic = /pctronic/i.test(emp.nombre || "");
    const tipoOrden = esPctronic ? "pre_orden" : "orden_compra";

    try {
      for (const [provId, itemsProv] of porProveedor.entries()) {
        const prov = proveedores.find((p) => p.id === provId) || {};
        const subtotal = itemsProv.reduce((a, it) => a + Number(it.cantidad_solicitada) * Number(it.precio_ganador), 0);
        const iva = subtotal * 0.19;
        let retenciones = 0;
        if (prov.aplica_retencion && subtotal >= Number(prov.monto_minimo_retencion || 0)) {
          const pctTotal = (Number(prov.porcentaje_retencion || 0) + Number(prov.porcentaje_ica || 0)) / 100;
          retenciones = subtotal * pctTotal;
        }
        const total = subtotal + iva - retenciones;
        const numeroOrden = `${esPctronic ? "PRE" : "OC"}-${new Date().getFullYear()}-${String(ordenes.length + 1).padStart(4, "0")}`;

        const { data: ord, error } = await window.sb
          .from("compras_ordenes")
          .insert({
            solicitud_id: solicitudActual.id,
            empresa_id: solicitudActual.empresa_id,
            proveedor_id: provId,
            numero_orden: numeroOrden,
            tipo: tipoOrden,
            subtotal,
            iva,
            retenciones,
            total,
          })
          .select()
          .single();
        if (error) throw error;

        // Si la solicitud viene de un proyecto, registrar en `gastos`
        if (solicitudActual.proyecto_id) {
          const gastosRows = itemsProv.map((it) => ({
            proyecto_id: solicitudActual.proyecto_id,
            fecha: new Date().toISOString().slice(0, 10),
            tipo: "Material",
            proveedor_id: provId,
            documento: numeroOrden,
            presupuesto_item_id: it.presupuesto_item_id || null,
            descripcion: it.descripcion,
            cantidad: Number(it.cantidad_solicitada),
            valor_unitario: Number(it.precio_ganador),
            observaciones: `Generado desde ${numeroOrden} (${solicitudActual.numero})`,
          }));
          const { error: errG } = await window.sb.from("gastos").insert(gastosRows);
          if (errG) throw errG;
        }

        await generarPdfOrdenCompra(ord, emp, prov, itemsProv);
      }

      await window.sb.from("compras_solicitudes").update({ estado: "ordenada" }).eq("id", solicitudActual.id);
      solicitudActual.estado = "ordenada";
      document.getElementById("cmp-estado-badge").innerHTML = badgeHtml(ESTADOS_SOL, "ordenada");
      mostrarAviso(
        esPctronic ? "Pre-orden generada para transcripción en Siigo" : "Orden de Compra PDF generada",
        "exito"
      );
      await cargarDatos();
    } catch (err) {
      manejarError(err, "No se pudo generar la orden");
    }
  });

  document.getElementById("tabla-ordenes").addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-pdf-orden]");
    if (!btn) return;
    const ord = ordenes.find((o) => o.id === btn.dataset.pdfOrden);
    if (!ord) return;
    const { data: items } = await window.sb
      .from("compras_solicitud_items")
      .select("*")
      .eq("solicitud_id", ord.solicitud_id)
      .eq("proveedor_ganador_id", ord.proveedor_id);
    await generarPdfOrdenCompra(ord, ord.empresas, ord.proveedores, items || []);
  });

  await cargarCatalogos();
  await cargarDatos();
})();
