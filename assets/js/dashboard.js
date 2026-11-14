(async () => {
  await window.pctronicReady;

  // --------------------------------------------------------------------
  // Tarjetas personalizables (agregar / quitar), recordado por navegador.
  // --------------------------------------------------------------------
  const DASHBOARD_PREFS_KEY = "pctronic_dashboard_tarjetas";
  const TARJETAS_DISPONIBLES = [
    { id: "kpi-proyectos-activos", label: "Proyectos Activos" },
    { id: "kpi-valor-ejecucion", label: "Valor en Ejecución" },
    { id: "kpi-facturas-pendientes", label: "Facturas Pendientes (cantidad)" },
    { id: "kpi-por-cobrar", label: "Por Cobrar" },
    { id: "seccion-resumen-comite", label: "Resumen Ejecutivo (Mes en cifras)" },
    { id: "seccion-graficas", label: "Gráficas Ejecutivas" },
    { id: "seccion-proyectos-recientes", label: "Tabla: Proyectos recientes" },
    { id: "seccion-facturas-pendientes", label: "Tabla: Facturas pendientes" },
  ];

  function leerPreferencias() {
    try {
      const guardado = JSON.parse(localStorage.getItem(DASHBOARD_PREFS_KEY) || "{}");
      const prefs = {};
      TARJETAS_DISPONIBLES.forEach((t) => (prefs[t.id] = guardado[t.id] !== false));
      return prefs;
    } catch (e) {
      const prefs = {};
      TARJETAS_DISPONIBLES.forEach((t) => (prefs[t.id] = true));
      return prefs;
    }
  }

  function guardarPreferencias(prefs) {
    try {
      localStorage.setItem(DASHBOARD_PREFS_KEY, JSON.stringify(prefs));
    } catch (e) {
      /* almacenamiento no disponible; no es crítico */
    }
  }

  let preferencias = leerPreferencias();

  function aplicarPreferencias() {
    ["kpi-proyectos-activos", "kpi-valor-ejecucion", "kpi-facturas-pendientes", "kpi-por-cobrar"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.classList.toggle("hidden", !preferencias[id]);
    });
    ["seccion-resumen-comite", "seccion-graficas", "seccion-proyectos-recientes", "seccion-facturas-pendientes"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.classList.toggle("hidden", !preferencias[id]);
    });
  }

  function renderModalPersonalizar() {
    const cont = document.getElementById("lista-personalizar");
    cont.innerHTML = TARJETAS_DISPONIBLES.map(
      (t) => `
      <label class="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2">
        <input type="checkbox" class="chk-tarjeta rounded border-gray-300 text-primary focus:ring-primary" data-id="${t.id}" ${preferencias[t.id] ? "checked" : ""} />
        ${t.label}
      </label>`
    ).join("");
    cont.querySelectorAll(".chk-tarjeta").forEach((chk) =>
      chk.addEventListener("change", () => {
        preferencias[chk.dataset.id] = chk.checked;
        guardarPreferencias(preferencias);
        aplicarPreferencias();
      })
    );
  }

  document.getElementById("btn-personalizar").addEventListener("click", () => {
    renderModalPersonalizar();
    document.getElementById("modal-personalizar").classList.remove("hidden");
    document.getElementById("modal-personalizar").classList.add("flex");
  });
  document.getElementById("btn-cerrar-personalizar").addEventListener("click", () => {
    document.getElementById("modal-personalizar").classList.add("hidden");
    document.getElementById("modal-personalizar").classList.remove("flex");
  });

  function kpiCard(id, icon, label, valor, color) {
    return `
    <div class="rounded-xl border border-gray-200 bg-white p-4" id="${id}">
      <div class="flex items-center gap-3">
        <div class="flex h-10 w-10 items-center justify-center rounded-lg ${color}">
          <span class="material-symbols-outlined text-[20px]">${icon}</span>
        </div>
        <div>
          <p class="text-xs font-medium text-gray-500">${label}</p>
          <p class="text-lg font-bold text-gray-900">${valor}</p>
        </div>
      </div>
    </div>`;
  }

  let datosGlobales = {
    proyectos: [],
    facturas: [],
    compras: [],
    gastos: [],
    comprasSolicitudes: [],
    vinculos: [],
    presupuestoItems: [],
    suministros: [],
    empresas: [],
    crmOportunidades: [],
    crmOfertas: [],
  };

  const costosPorProyecto = (proyectoId) => {
    const gastosProy = datosGlobales.gastos.filter((g) => g.proyecto_id === proyectoId);
    if (gastosProy.length > 0) {
      return gastosProy.reduce((a, g) => a + Number(g.valor_total || 0), 0);
    }
    const c = datosGlobales.compras.filter((c) => c.proyecto_id === proyectoId).reduce((a, c) => a + Number(c.valor || 0), 0);
    const v = datosGlobales.vinculos.filter((v) => v.proyecto_id === proyectoId);
    const pagC = v.reduce((a, vi) => a + (vi.cortes_pago || []).reduce((a2, cp) => a2 + Number(cp.valor_neto || 0), 0), 0);
    return c + pagC;
  };

  const facturadoPorProyecto = (proyectoId) =>
    datosGlobales.facturas
      .filter((f) => f.proyecto_id === proyectoId && f.estado !== "anulada")
      .reduce((a, f) => a + Number(f.valor || 0), 0);

  function cerrarModalProyectoResumen() {
    const modal = document.getElementById("modal-proyecto-resumen");
    if (modal) {
      modal.classList.add("hidden");
      modal.classList.remove("flex");
    }
  }

  function abrirResumenProyecto(proyectoId) {
    const p = datosGlobales.proyectos.find((x) => x.id === proyectoId);
    if (!p) return;

    const facturado = facturadoPorProyecto(p.id);
    const gastado = costosPorProyecto(p.id);
    const margen = facturado - gastado;
    const margenPct = facturado > 0 ? ((margen / facturado) * 100).toFixed(1) + "%" : "—";
    const sols = datosGlobales.comprasSolicitudes.filter((s) => s.proyecto_id === p.id);
    const solsPend = sols.filter((s) => ["pendiente", "en_comparativo", "presentada"].includes(s.estado)).length;
    const solsOrd = sols.filter((s) => ["aprobada", "ordenada"].includes(s.estado)).length;
    const estadoCompras = sols.length ? `${solsPend} pend. · ${solsOrd} aprob./ord.` : "Sin solicitudes";

    document.getElementById("mpr-titulo").textContent = p.nombre || "Proyecto";
    document.getElementById("mpr-estado").innerHTML = badgeHtml(ESTADOS_PROYECTO, p.estado);
    document.getElementById("mpr-subtitulo").textContent = [p.clientes?.nombre, p.empresas?.nombre, p.ciudad].filter(Boolean).join(" · ") || "Sin cliente asignado";
    document.getElementById("mpr-link-detalle").href = `proyecto-detalle.html?id=${p.id}`;

    const box = (lbl, val, sub = "", cls = "text-gray-900") => `
      <div class="rounded-xl border border-gray-200 bg-gray-50/70 p-3.5">
        <p class="text-[11px] font-semibold uppercase text-gray-500">${lbl}</p>
        <p class="mt-1 text-base font-bold tabular-nums ${cls}">${val}</p>
        ${sub ? `<p class="mt-0.5 text-[11px] text-gray-400">${sub}</p>` : ""}
      </div>`;

    const av = Number(p.avance_porcentaje || 0);
    document.getElementById("mpr-kpis").innerHTML =
      box("Valor contrato", formatoMoneda(p.valor_total), p.tipo_contrato === "aiu" ? "Esquema AIU" : "IVA pleno") +
      box("Avance físico", `${av}%`, `<div class="barra-progreso mt-1"><span style="width:${av}%"></span></div>`) +
      box("Facturado", formatoMoneda(facturado), "Facturas emitidas") +
      box("Gastado", formatoMoneda(gastado), "Costos / gastos reales") +
      box("Margen bruto actual", formatoMoneda(margen), `Margen: ${margenPct}`, margen > 0 ? "text-emerald-600" : margen < 0 ? "text-red-600" : "text-gray-900") +
      box("Estado compras", `<span class="text-sm">${estadoCompras}</span>`, `${sols.length} solicitud${sols.length === 1 ? "" : "es"}`);

    const modal = document.getElementById("modal-proyecto-resumen");
    modal.classList.remove("hidden");
    modal.classList.add("flex");
  }

  document.getElementById("btn-cerrar-proyecto-resumen")?.addEventListener("click", cerrarModalProyectoResumen);
  document.getElementById("btn-cerrar-proyecto-resumen-2")?.addEventListener("click", cerrarModalProyectoResumen);

  function formatoMonedaCompacta(valor) {
    const n = Number(valor || 0);
    const abs = Math.abs(n);
    const sign = n < 0 ? "-" : "";
    if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1).replace(".0", "")}MM`;
    if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(abs >= 10e6 ? 0 : 1).replace(".0", "")}M`;
    if (abs >= 1e3) return `${sign}$${Math.round(abs / 1e3)}K`;
    return `${sign}$${Math.round(abs)}`;
  }

  function obtenerDatosFiltrados(empresaId) {
    if (!empresaId) {
      return {
        proyectos: datosGlobales.proyectos,
        facturas: datosGlobales.facturas,
        compras: datosGlobales.compras,
        gastos: datosGlobales.gastos,
        comprasSolicitudes: datosGlobales.comprasSolicitudes,
        crmOportunidades: datosGlobales.crmOportunidades,
        crmOfertas: datosGlobales.crmOfertas,
        suministros: datosGlobales.suministros,
        empresaActual: null,
      };
    }
    const proyectos = datosGlobales.proyectos.filter((p) => p.empresa_id === empresaId);
    const proyectoIds = new Set(proyectos.map((p) => p.id));
    return {
      proyectos,
      facturas: datosGlobales.facturas.filter((f) => f.proyectos?.empresa_id === empresaId || proyectoIds.has(f.proyecto_id)),
      compras: datosGlobales.compras.filter((c) => proyectoIds.has(c.proyecto_id)),
      gastos: datosGlobales.gastos.filter((g) => proyectoIds.has(g.proyecto_id)),
      comprasSolicitudes: datosGlobales.comprasSolicitudes.filter((s) => proyectoIds.has(s.proyecto_id)),
      crmOportunidades: datosGlobales.crmOportunidades.filter((o) => o.empresa_id === empresaId),
      crmOfertas: datosGlobales.crmOfertas.filter((o) => o.empresa_id === empresaId),
      suministros: datosGlobales.suministros.filter((s) => s.empresa_id === empresaId),
      empresaActual: datosGlobales.empresas.find((e) => e.id === empresaId) || null,
    };
  }

  function renderGraficaFacturacionGastos(facturas, gastos, compras) {
    const cont = document.getElementById("grafica-facturacion-gastos");
    if (!cont) return;

    const ahora = new Date();
    const usarGastos = gastos.length > 0;
    const fuenteCostos = usarGastos ? gastos : compras;

    const meses = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1);
      const anio = d.getFullYear();
      const mes = d.getMonth();
      const label = d.toLocaleDateString("es-CO", { month: "short" }).replace(".", "");

      const facturacion = facturas
        .filter((f) => {
          if (!f.fecha_emision || f.estado === "anulada") return false;
          const fd = new Date(f.fecha_emision + "T00:00:00");
          return fd.getFullYear() === anio && fd.getMonth() === mes;
        })
        .reduce((s, f) => s + Number(f.valor || 0), 0);

      const costos = fuenteCostos
        .filter((c) => {
          if (!c.fecha) return false;
          const cd = new Date(c.fecha + "T00:00:00");
          return cd.getFullYear() === anio && cd.getMonth() === mes;
        })
        .reduce((s, c) => s + Number(usarGastos ? c.valor_total : c.valor || 0), 0);

      meses.push({ anio, mes, label, facturacion, costos });
    }

    const maxVal = Math.max(1, ...meses.flatMap((m) => [m.facturacion, m.costos]));
    const totalFact = meses.reduce((s, m) => s + m.facturacion, 0);
    const totalCostos = meses.reduce((s, m) => s + m.costos, 0);
    const balance = totalFact - totalCostos;

    const barrasHtml = meses
      .map((m) => {
        const hFact = m.facturacion > 0 ? Math.max(4, Math.round((m.facturacion / maxVal) * 100)) : 0;
        const hCost = m.costos > 0 ? Math.max(4, Math.round((m.costos / maxVal) * 100)) : 0;
        return `
        <div class="flex-1 flex flex-col items-center gap-1.5 min-w-0">
          <div class="relative w-full h-44 flex items-end justify-center gap-1.5 px-1">
            <div class="group relative flex-1 max-w-[22px] h-full flex flex-col justify-end items-center">
              <span class="mb-1 text-[9px] font-semibold text-gray-500 tabular-nums truncate max-w-full">${m.facturacion > 0 ? formatoMonedaCompacta(m.facturacion) : ""}</span>
              <div class="w-full rounded-t-md bg-primary transition-all duration-300 hover:bg-blue-700" style="height:${hFact}%"></div>
              <div class="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 z-10 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-[10px] font-medium text-white opacity-0 shadow-md transition-opacity group-hover:opacity-100">
                Fact.: ${formatoMoneda(m.facturacion)}
              </div>
            </div>
            <div class="group relative flex-1 max-w-[22px] h-full flex flex-col justify-end items-center">
              <span class="mb-1 text-[9px] font-semibold text-gray-500 tabular-nums truncate max-w-full">${m.costos > 0 ? formatoMonedaCompacta(m.costos) : ""}</span>
              <div class="w-full rounded-t-md bg-amber-500 transition-all duration-300 hover:bg-amber-600" style="height:${hCost}%"></div>
              <div class="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 z-10 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-[10px] font-medium text-white opacity-0 shadow-md transition-opacity group-hover:opacity-100">
                Costos: ${formatoMoneda(m.costos)}
              </div>
            </div>
          </div>
          <span class="text-[11px] font-semibold capitalize text-gray-600">${m.label}</span>
        </div>`;
      })
      .join("");

    cont.innerHTML = `
      <div class="relative pt-2">
        <div class="pointer-events-none absolute inset-x-0 top-2 bottom-7 flex flex-col justify-between">
          <div class="border-b border-dashed border-gray-100 flex justify-end"><span class="text-[9px] text-gray-400 pr-1">${formatoMonedaCompacta(maxVal)}</span></div>
          <div class="border-b border-dashed border-gray-100 flex justify-end"><span class="text-[9px] text-gray-400 pr-1">${formatoMonedaCompacta(maxVal / 2)}</span></div>
          <div class="border-b border-gray-200 flex justify-end"><span class="text-[9px] text-gray-400 pr-1">$0</span></div>
        </div>
        <div class="relative flex items-end gap-2 pl-2 pr-8">
          ${barrasHtml}
        </div>
      </div>
      <div class="mt-4 grid grid-cols-3 gap-2 border-t border-gray-100 pt-3 text-center">
        <div>
          <p class="text-[10px] font-semibold uppercase text-gray-400">Facturado 6M</p>
          <p class="text-xs font-bold text-primary tabular-nums">${formatoMoneda(totalFact)}</p>
        </div>
        <div>
          <p class="text-[10px] font-semibold uppercase text-gray-400">Costos / Gastos 6M</p>
          <p class="text-xs font-bold text-amber-600 tabular-nums">${formatoMoneda(totalCostos)}</p>
        </div>
        <div>
          <p class="text-[10px] font-semibold uppercase text-gray-400">Balance 6M</p>
          <p class="text-xs font-bold tabular-nums ${balance >= 0 ? "text-emerald-600" : "text-rose-600"}">${formatoMoneda(balance)}</p>
        </div>
      </div>`;
  }

  function renderGraficaComercialSalud(proyectos, crmOportunidades, crmOfertas) {
    const cont = document.getElementById("grafica-comercial-salud");
    if (!cont) return;

    const etapasActivas = ["por_revisar", "prospecto", "visita", "cotizacion", "negociacion"];
    const opsActivas = crmOportunidades.filter((o) => etapasActivas.includes(o.etapa));
    const pipelineActivo = opsActivas.reduce((s, o) => s + Number(o.valor_estimado || 0), 0);
    const valorPonderado = opsActivas.reduce(
      (s, o) => s + Number(o.valor_estimado || 0) * (Number(o.probabilidad || 0) / 100),
      0
    );
    const ofertasEnCurso = crmOfertas.filter((o) => o.estado !== "enviado_cliente").length;

    const estadosCfg = [
      { key: "en_curso", label: "En Curso", bar: "bg-primary", dot: "bg-primary", text: "text-blue-700" },
      { key: "sin_iniciar", label: "Sin Iniciar", bar: "bg-amber-400", dot: "bg-amber-400", text: "text-amber-700" },
      { key: "detenido", label: "Detenido", bar: "bg-rose-500", dot: "bg-rose-500", text: "text-rose-700" },
      { key: "finalizado", label: "Finalizado", bar: "bg-emerald-500", dot: "bg-emerald-500", text: "text-emerald-700" },
    ];

    const totalProy = proyectos.length;
    const distribucion = estadosCfg.map((cfg) => {
      const items = proyectos.filter((p) => p.estado === cfg.key);
      const count = items.length;
      const pct = totalProy > 0 ? Math.round((count / totalProy) * 100) : 0;
      const valor = items.reduce((s, p) => s + Number(p.valor_total || 0), 0);
      return { ...cfg, count, pct, valor };
    });

    const barraDistribucion = totalProy > 0
      ? distribucion
          .filter((d) => d.count > 0)
          .map(
            (d) =>
              `<div class="${d.bar} h-full transition-all duration-300" style="width:${(d.count / totalProy) * 100}%" title="${d.label}: ${d.count} (${d.pct}%)"></div>`
          )
          .join("")
      : `<div class="w-full h-full bg-gray-200"></div>`;

    cont.innerHTML = `
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div class="rounded-lg border border-gray-100 bg-gray-50/70 p-3">
          <p class="text-[11px] font-semibold uppercase text-gray-500">Pipeline Activo</p>
          <p class="mt-1 text-base font-bold text-gray-900 tabular-nums">${formatoMoneda(pipelineActivo)}</p>
          <p class="mt-0.5 text-[11px] text-gray-400">${opsActivas.length} oportunidad${opsActivas.length === 1 ? "" : "es"}</p>
        </div>
        <div class="rounded-lg border border-emerald-100 bg-emerald-50/60 p-3">
          <p class="text-[11px] font-semibold uppercase text-emerald-700">Valor Ponderado</p>
          <p class="mt-1 text-base font-bold text-emerald-700 tabular-nums">${formatoMoneda(valorPonderado)}</p>
          <p class="mt-0.5 text-[11px] text-emerald-600/80">Proyección ponderada</p>
        </div>
        <div class="rounded-lg border border-blue-100 bg-blue-50/60 p-3">
          <p class="text-[11px] font-semibold uppercase text-blue-700">Ofertas Pre-venta</p>
          <p class="mt-1 text-base font-bold text-primary tabular-nums">${ofertasEnCurso} <span class="text-xs font-medium text-gray-500">/ ${crmOfertas.length} total</span></p>
          <p class="mt-0.5 text-[11px] text-blue-600/80">En levantamiento / proceso</p>
        </div>
      </div>

      <div class="border-t border-gray-100 pt-4">
        <div class="mb-2 flex items-center justify-between">
          <p class="text-xs font-bold text-gray-800">Salud de Proyectos por Estado</p>
          <span class="text-xs font-medium text-gray-500">${totalProy} proyecto${totalProy === 1 ? "" : "s"}</span>
        </div>
        <div class="flex h-3 w-full overflow-hidden rounded-full bg-gray-100">
          ${barraDistribucion}
        </div>
        <div class="mt-3 grid grid-cols-2 gap-2.5">
          ${distribucion
            .map(
              (d) => `
            <div class="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2">
              <div class="flex items-center gap-2 min-w-0">
                <span class="h-2.5 w-2.5 shrink-0 rounded-full ${d.dot}"></span>
                <div class="min-w-0">
                  <p class="text-xs font-semibold text-gray-800 truncate">${d.label}</p>
                  <p class="text-[10px] text-gray-400 tabular-nums truncate">${formatoMoneda(d.valor)}</p>
                </div>
              </div>
              <div class="text-right shrink-0 ml-2">
                <p class="text-xs font-bold ${d.text} tabular-nums">${d.count}</p>
                <p class="text-[10px] text-gray-400 tabular-nums">${d.pct}%</p>
              </div>
            </div>`
            )
            .join("")}
        </div>
      </div>`;
  }

  function renderDashboard() {
    const empresaId = document.getElementById("filtro-empresa-dashboard")?.value || "";
    const {
      proyectos,
      facturas,
      compras,
      gastos,
      comprasSolicitudes,
      crmOportunidades,
      crmOfertas,
      empresaActual,
    } = obtenerDatosFiltrados(empresaId);

    const activos = proyectos.filter((p) => p.estado === "en_curso");
    const valorEnCurso = activos.reduce((acc, p) => acc + Number(p.valor_total || 0), 0);

    const facturasPendientes = facturas.filter((f) => ["pendiente", "vencida"].includes(f.estado));
    const totalPendiente = facturasPendientes.reduce((acc, f) => acc + Number(f.valor || 0), 0);

    document.getElementById("kpi-cards").innerHTML =
      kpiCard("kpi-proyectos-activos", "folder_open", "Proyectos Activos", activos.length, "bg-blue-100 text-primary") +
      kpiCard("kpi-valor-ejecucion", "payments", "Valor en Ejecución", formatoMoneda(valorEnCurso), "bg-green-100 text-green-700") +
      kpiCard("kpi-facturas-pendientes", "receipt_long", "Facturas Pendientes", facturasPendientes.length, "bg-amber-100 text-amber-700") +
      kpiCard("kpi-por-cobrar", "account_balance_wallet", "Por Cobrar", formatoMoneda(totalPendiente), "bg-red-100 text-red-700");

    // Resumen Ejecutivo · Mes en cifras
    const ahora = new Date();
    const mesActual = ahora.getMonth();
    const anioActual = ahora.getFullYear();
    const hoyStr = `${anioActual}-${String(mesActual + 1).padStart(2, "0")}-${String(ahora.getDate()).padStart(2, "0")}`;

    const facturacionMes = facturas
      .filter((f) => {
        if (!f.fecha_emision || f.estado === "anulada") return false;
        const d = new Date(f.fecha_emision + "T00:00:00");
        return d.getMonth() === mesActual && d.getFullYear() === anioActual;
      })
      .reduce((s, f) => s + Number(f.valor || 0), 0);

    const gastosMes = gastos
      .filter((g) => {
        if (!g.fecha) return false;
        const d = new Date(g.fecha + "T00:00:00");
        return d.getMonth() === mesActual && d.getFullYear() === anioActual;
      })
      .reduce((s, g) => s + Number(g.valor_total || 0), 0);

    const margenMes = facturacionMes - gastosMes;
    const margenMesPct = facturacionMes > 0 ? ((margenMes / facturacionMes) * 100).toFixed(1) + "%" : "—";
    const criticos = proyectos.filter(
      (p) => p.estado === "detenido" || (p.estado !== "finalizado" && p.fecha_fin_estimada && p.fecha_fin_estimada < hoyStr)
    ).length;
    const comprasPendAprob = comprasSolicitudes.filter((s) =>
      ["pendiente", "en_comparativo", "presentada"].includes(s.estado)
    ).length;

    const nombreMes = ahora.toLocaleDateString("es-CO", { month: "long", year: "numeric" });
    const subEl = document.getElementById("comite-mes-subtitulo");
    if (subEl) {
      subEl.textContent = empresaActual
        ? `Indicadores · ${empresaActual.nombre} · ${nombreMes}`
        : `Indicadores consolidados · ${nombreMes}`;
    }

    const cardComite = (lbl, val, sub, cls = "text-gray-900") => `
      <div class="rounded-lg border border-gray-100 bg-gray-50/70 p-3.5">
        <p class="text-[11px] font-semibold uppercase text-gray-500">${lbl}</p>
        <p class="mt-1 text-lg font-bold tabular-nums ${cls}">${val}</p>
        <p class="mt-0.5 text-[11px] text-gray-400">${sub}</p>
      </div>`;

    document.getElementById("resumen-comite-grid").innerHTML =
      cardComite("Facturación del mes", formatoMoneda(facturacionMes), "Facturas emitidas") +
      cardComite("Costos / Gastos del mes", formatoMoneda(gastosMes), "Gastos registrados") +
      cardComite("Margen bruto estimado", formatoMoneda(margenMes), `Margen mes: ${margenMesPct}`, margenMes > 0 ? "text-emerald-600" : margenMes < 0 ? "text-red-600" : "text-gray-900") +
      cardComite("Proyectos críticos / detenidos", criticos, "Detenidos o vencidos", criticos > 0 ? "text-rose-600" : "text-gray-900") +
      cardComite("Compras por aprobar", comprasPendAprob, "Solicitudes pendientes", comprasPendAprob > 0 ? "text-amber-600" : "text-gray-900");

    // Gráficas Ejecutivas
    renderGraficaFacturacionGastos(facturas, gastos, compras);
    renderGraficaComercialSalud(proyectos, crmOportunidades, crmOfertas);

    const filaProyecto = (p) => `
      <tr class="border-b border-gray-50 last:border-0 hover:bg-blue-50/40 cursor-pointer transition-colors" data-proyecto-id="${p.id}">
        <td class="px-5 py-3">
          <span class="font-medium text-gray-900 hover:text-primary">${escapeHtml(p.nombre)}</span>
        </td>
        <td class="px-5 py-3">${badgeHtml(ESTADOS_PROYECTO, p.estado)}</td>
        <td class="px-5 py-3">
          <div class="flex items-center gap-2">
            <div class="barra-progreso w-24"><span style="width:${p.avance_porcentaje || 0}%"></span></div>
            <span class="text-xs text-gray-500">${p.avance_porcentaje || 0}%</span>
          </div>
        </td>
        <td class="px-5 py-3 font-medium">${formatoMoneda(p.valor_total)}</td>
      </tr>`;

    const tbodyP = document.getElementById("tabla-proyectos-recientes");
    tbodyP.innerHTML = proyectos.length
      ? proyectos.slice(0, 6).map(filaProyecto).join("")
      : `<tr><td class="px-5 py-6 text-gray-400" colspan="4">${empresaActual ? "No hay proyectos para esta empresa." : 'Aún no has creado proyectos. <a class="text-primary font-semibold" href="proyecto-nuevo.html">Crea el primero →</a>'}</td></tr>`;

    const filaFactura = (f) => `
      <tr class="border-b border-gray-50 last:border-0 hover:bg-gray-50">
        <td class="px-5 py-3">
          <a href="proyecto-detalle.html?id=${f.proyecto_id}" class="font-medium text-gray-900 hover:text-primary">${escapeHtml(f.proyectos?.nombre || "—")}</a>
        </td>
        <td class="px-5 py-3">${escapeHtml(f.numero_factura || "—")}</td>
        <td class="px-5 py-3">${formatoFecha(f.fecha_vencimiento)}</td>
        <td class="px-5 py-3 font-medium">${formatoMoneda(f.valor)}</td>
      </tr>`;

    const tbodyF = document.getElementById("tabla-facturas-pendientes");
    tbodyF.innerHTML = facturasPendientes.length
      ? facturasPendientes.slice(0, 6).map(filaFactura).join("")
      : `<tr><td class="px-5 py-6 text-gray-400" colspan="4">No hay facturas pendientes por cobrar.</td></tr>`;

    aplicarPreferencias();
  }

  document.getElementById("tabla-proyectos-recientes")?.addEventListener("click", (e) => {
    const tr = e.target.closest("tr[data-proyecto-id]");
    if (tr) abrirResumenProyecto(tr.dataset.proyectoId);
  });

  document.getElementById("filtro-empresa-dashboard")?.addEventListener("change", renderDashboard);

  try {
    const [
      { data: proyectos, error: errProyectos },
      { data: facturasTodas, error: errFacturasTodas },
      { data: compras, error: errCompras },
      { data: gastos, error: errGastos },
      { data: comprasSolicitudes, error: errComprasSolicitudes },
      { data: vinculos, error: errVinculos },
      { data: presupuestoItems, error: errPresupuestoItems },
      { data: suministros, error: errSuministros },
      { data: empresas, error: errEmpresas },
      resOps,
      resOfertas,
    ] = await Promise.all([
      window.sb.from("proyectos").select("*, clientes(nombre), empresas(id, nombre)").order("created_at", { ascending: false }),
      window.sb.from("facturas").select("id, valor, estado, fecha_emision, fecha_vencimiento, numero_factura, proyecto_id, proyectos(nombre, empresa_id)"),
      window.sb.from("compras").select("proyecto_id, valor, fecha"),
      window.sb.from("gastos").select("proyecto_id, valor_total, fecha, tipo"),
      window.sb.from("compras_solicitudes").select("id, proyecto_id, estado, titulo"),
      window.sb.from("proyecto_contratistas").select("proyecto_id, cortes_pago(valor_neto)"),
      window.sb.from("presupuesto_items").select("proyecto_id, tipo, cantidad, cu_material"),
      window.sb.from("suministros").select("*, clientes(nombre), empresas(nombre)").order("created_at", { ascending: false }),
      window.sb.from("empresas").select("id, nombre").order("nombre"),
      window.sb.from("crm_oportunidades").select("id, titulo, etapa, valor_estimado, probabilidad, empresa_id, created_at, updated_at"),
      window.sb.from("crm_ofertas_preventa").select("id, titulo, estado, prioridad, empresa_id, oportunidad_id, created_at").order("created_at", { ascending: false }),
    ]);
    if (errProyectos) throw errProyectos;
    if (errFacturasTodas) throw errFacturasTodas;
    if (errCompras) throw errCompras;
    if (errGastos) throw errGastos;
    if (errComprasSolicitudes) throw errComprasSolicitudes;
    if (errVinculos) throw errVinculos;
    if (errPresupuestoItems) throw errPresupuestoItems;
    if (errSuministros) throw errSuministros;
    if (errEmpresas) throw errEmpresas;
    if (resOps?.error) throw resOps.error;
    if (resOfertas?.error) throw resOfertas.error;

    datosGlobales = {
      proyectos: proyectos || [],
      facturas: facturasTodas || [],
      compras: compras || [],
      gastos: gastos || [],
      comprasSolicitudes: comprasSolicitudes || [],
      vinculos: vinculos || [],
      presupuestoItems: presupuestoItems || [],
      suministros: suministros || [],
      empresas: empresas || [],
      crmOportunidades: resOps?.data || [],
      crmOfertas: resOfertas?.data || [],
    };

    const selEmpresa = document.getElementById("filtro-empresa-dashboard");
    if (selEmpresa) {
      selEmpresa.innerHTML =
        `<option value="">Todas las empresas</option>` +
        datosGlobales.empresas.map((e) => `<option value="${e.id}">${escapeHtml(e.nombre)}</option>`).join("");
    }

    renderDashboard();
  } catch (error) {
    manejarError(error, "No se pudo cargar el panel principal");
  }

  // --------------------------------------------------------------------
  // MODO COMITÉ DE GERENCIA — presentación de pantalla completa, con las
  // mismas secciones de las diapositivas que se presentan cada martes.
  // --------------------------------------------------------------------
  let comiteSlideActual = 0;
  let comiteSlides = [];

  function construirSlidesComite() {
    const {
      proyectos,
      facturas,
      gastos,
      comprasSolicitudes,
      presupuestoItems,
      suministros,
      empresas,
      crmOportunidades,
      crmOfertas,
    } = datosGlobales;

    const ahora = new Date();
    const mesActual = ahora.getMonth();
    const anioActual = ahora.getFullYear();
    const hoyStr = `${anioActual}-${String(mesActual + 1).padStart(2, "0")}-${String(ahora.getDate()).padStart(2, "0")}`;
    const fechaComite = ahora.toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" });
    const fechaPortada = ahora.toLocaleDateString("es-CO", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
    const nombreMes = ahora.toLocaleDateString("es-CO", { month: "long" });
    const nombreMesCap = nombreMes.charAt(0).toUpperCase() + nombreMes.slice(1);

    const fmtM = (valor) => {
      const n = Number(valor || 0) / 1e6;
      return `$${n.toLocaleString("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} M`;
    };

    const empresaNombre = (empresaId, fallbackObj) => {
      if (fallbackObj?.nombre) return fallbackObj.nombre;
      return empresas.find((e) => e.id === empresaId)?.nombre || "Sin empresa";
    };

    const esGrupoIntegra = (nombre) => (nombre || "").toLowerCase().includes("integra");
    const colorEmpresa = (nombre) => (esGrupoIntegra(nombre) ? "#0095D9" : "#0A2240");
    const badgeEmpresa = (nombre) => {
      const integra = esGrupoIntegra(nombre);
      return `<span class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
        integra ? "bg-sky-50 text-[#0095D9] border border-sky-200" : "bg-slate-100 text-[#0A2240] border border-slate-200"
      }"><span class="h-1.5 w-1.5 rounded-full" style="background:${colorEmpresa(nombre)}"></span>${escapeHtml(nombre)}</span>`;
    };

    const presupuestoPorProyecto = (p) => {
      const items = presupuestoItems.filter((i) => i.proyecto_id === p.id && i.tipo === "item");
      if (items.length > 0) {
        const ivaFactor = p.iva_materiales ? 1 + Number(p.iva_porcentaje || 19) / 100 : 1;
        return items.reduce((s, i) => s + Number(i.cantidad || 0) * Number(i.cu_material || 0) * ivaFactor, 0);
      }
      return Number(p.costo_directo || p.valor_total || 0);
    };

    const semaforoProyecto = (p) => {
      const gastado = costosPorProyecto(p.id);
      const ppto = presupuestoPorProyecto(p);
      const esDetenido = p.estado === "detenido";
      const esVencido = p.estado !== "finalizado" && p.fecha_fin_estimada && p.fecha_fin_estimada < hoyStr;
      const sobrecosto = ppto > 0 && gastado > ppto;

      if (esDetenido || esVencido || sobrecosto) {
        return {
          key: "critico",
          label: "Crítico",
          pill: `<span class="inline-flex items-center gap-1.5 rounded-full bg-rose-100 border border-rose-200 px-2.5 py-0.5 text-[11px] font-semibold text-rose-700"><span class="h-1.5 w-1.5 rounded-full bg-rose-500"></span>Crítico</span>`,
        };
      }

      const diasParaCierre = p.fecha_fin_estimada
        ? Math.ceil((new Date(p.fecha_fin_estimada + "T00:00:00") - ahora) / 86400000)
        : null;
      const cercaVencimiento = p.estado !== "finalizado" && diasParaCierre !== null && diasParaCierre <= 15;
      const pptoAlto = ppto > 0 && gastado / ppto >= 0.85;

      if (p.estado === "pausado" || cercaVencimiento || pptoAlto) {
        return {
          key: "seguimiento",
          label: "En seguimiento",
          pill: `<span class="inline-flex items-center gap-1.5 rounded-full bg-amber-100 border border-amber-200 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800"><span class="h-1.5 w-1.5 rounded-full bg-amber-500"></span>En seguimiento</span>`,
        };
      }

      return {
        key: "al_dia",
        label: "Al día",
        pill: `<span class="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 border border-emerald-200 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700"><span class="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>Al día</span>`,
      };
    };

    const proximaFacturaProyecto = (proyectoId) => {
      const pend = facturas
        .filter((f) => f.proyecto_id === proyectoId && ["pendiente", "vencida"].includes(f.estado))
        .sort((a, b) => (a.fecha_vencimiento || "9999").localeCompare(b.fecha_vencimiento || "9999"));
      return pend[0] || null;
    };

    const slideChrome = (num, titulo, subtitulo, bodyHtml) => `
      <div class="mx-auto max-w-6xl rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden flex flex-col min-h-[560px]">
        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-7 py-5 bg-white">
          <div class="flex items-center gap-3">
            <span class="h-8 w-1.5 rounded-full comite-bg-cyan"></span>
            <div>
              <h2 class="text-xl font-bold tracking-tight comite-text-navy">${titulo}</h2>
              ${subtitulo ? `<p class="text-xs text-slate-500 mt-0.5">${subtitulo}</p>` : ""}
            </div>
          </div>
          <span class="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold tracking-wide comite-text-navy uppercase">Pctronic · Grupo Integra</span>
        </div>
        <div class="flex-1 bg-[#F8FAFC] px-7 py-6 space-y-5">
          ${bodyHtml}
        </div>
        <div class="flex items-center justify-between border-t border-slate-200 bg-white px-7 py-3 text-[11px] text-slate-500">
          <span>Comité de Proyectos · ${escapeHtml(fechaComite)} · Cifras en millones de pesos (COP)</span>
          <span class="inline-flex items-center justify-center rounded-md comite-bg-navy px-2.5 py-0.5 font-bold text-white tabular-nums">${num}</span>
        </div>
      </div>`;

    // Pre-cálculos consolidados
    const proyectosActivosLista = proyectos.filter((p) => p.estado !== "cancelado");
    const valorContratosTotal = proyectosActivosLista.reduce((s, p) => s + Number(p.valor_total || 0), 0);
    const totalFacturadoProyectos = proyectosActivosLista.reduce((s, p) => s + facturadoPorProyecto(p.id), 0);
    const porFacturarTotal = Math.max(0, valorContratosTotal - totalFacturadoProyectos);

    const facturasValidas = facturas.filter((f) => f.estado !== "anulada");
    const facturadoMes = facturasValidas
      .filter((f) => {
        if (!f.fecha_emision) return false;
        const d = new Date(f.fecha_emision + "T00:00:00");
        return d.getMonth() === mesActual && d.getFullYear() === anioActual;
      })
      .reduce((s, f) => s + Number(f.valor || 0), 0);

    const facturadoAnio = facturasValidas
      .filter((f) => f.fecha_emision && new Date(f.fecha_emision + "T00:00:00").getFullYear() === anioActual)
      .reduce((s, f) => s + Number(f.valor || 0), 0);

    const proyectosEvaluados = proyectosActivosLista.map((p) => {
      const ppto = presupuestoPorProyecto(p);
      const gastado = costosPorProyecto(p.id);
      const facturado = facturadoPorProyecto(p.id);
      const valorTotal = Number(p.valor_total || 0);
      const pendienteFact = Math.max(0, valorTotal - facturado);
      const faltaPapel = Math.max(0, ppto - gastado);
      const solsAbiertas = comprasSolicitudes.filter(
        (s) => s.proyecto_id === p.id && ["pendiente", "en_comparativo", "presentada", "aprobada"].includes(s.estado)
      ).length;
      const sem = semaforoProyecto(p);
      const proxFact = proximaFacturaProyecto(p.id);
      const empNombre = empresaNombre(p.empresa_id, p.empresas);
      return {
        p,
        empNombre,
        ppto,
        gastado,
        facturado,
        valorTotal,
        pendienteFact,
        faltaPapel,
        faltaReal: faltaPapel,
        solsAbiertas,
        sem,
        proxFact,
        margen: facturado - gastado,
      };
    });

    // ------------------------------------------------------------------
    // 01 · Portada
    // ------------------------------------------------------------------
    const slide01 = `
      <div class="mx-auto max-w-6xl rounded-2xl comite-bg-navy text-white shadow-lg overflow-hidden flex flex-col justify-between min-h-[560px] p-10 sm:p-14 relative">
        <div class="flex items-center justify-between">
          <span class="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-xs font-bold tracking-widest uppercase">
            <span class="h-2 w-2 rounded-full comite-bg-cyan"></span>
            PCTRONIC · GRUPO INTEGRA
          </span>
          <span class="text-xs font-semibold text-white/60">Presentación Ejecutiva</span>
        </div>
        <div class="my-auto py-12 max-w-2xl">
          <div class="h-1.5 w-16 rounded-full comite-bg-cyan mb-6"></div>
          <h1 class="text-4xl sm:text-5xl font-bold tracking-tight leading-tight">Comité de Proyectos</h1>
          <p class="mt-4 text-base sm:text-lg text-slate-200 leading-relaxed">
            Seguimiento consolidado de ejecución, presupuesto, facturación, suministros y proyección comercial.
          </p>
          <div class="mt-8">
            <span class="inline-flex items-center gap-2 rounded-full comite-bg-cyan px-5 py-2 text-sm font-semibold text-white shadow-md capitalize">
              <span class="material-symbols-outlined text-[18px]" aria-hidden="true">calendar_today</span>
              ${escapeHtml(fechaPortada)}
            </span>
          </div>
        </div>
        <div class="flex items-center justify-between border-t border-white/15 pt-5 text-xs text-slate-300">
          <span>Comité de Proyectos · ${escapeHtml(fechaComite)} · Cifras en millones de pesos (COP)</span>
          <span class="inline-flex items-center justify-center rounded-md bg-white/15 px-2.5 py-0.5 font-bold text-white">01</span>
        </div>
      </div>`;

    // ------------------------------------------------------------------
    // 02 · El mes en cifras
    // ------------------------------------------------------------------
    const cntAlDia = proyectosEvaluados.filter((x) => x.sem.key === "al_dia").length;
    const cntSeg = proyectosEvaluados.filter((x) => x.sem.key === "seguimiento").length;
    const cntCrit = proyectosEvaluados.filter((x) => x.sem.key === "critico").length;
    const totSem = Math.max(1, proyectosEvaluados.length);
    const pctAlDia = Math.round((cntAlDia / totSem) * 100);
    const pctSeg = Math.round((cntSeg / totSem) * 100);
    const pctCrit = Math.max(0, 100 - pctAlDia - pctSeg);

    const faltaRealTotal = proyectosEvaluados.reduce((s, x) => s + x.faltaReal, 0);
    const sumEnCurso = suministros.filter((s) => s.estado === "en_curso");
    const sumTotalVal = suministros.reduce((s, x) => s + Number(x.valor_venta || 0), 0);
    const sumEnCursoVal = sumEnCurso.reduce((s, x) => s + Number(x.valor_venta || 0), 0);

    const navyCard = (lbl, val, sub, exactVal) => `
      <div class="rounded-2xl comite-bg-navy p-5 shadow-sm flex flex-col justify-between" title="${escapeHtml(exactVal)}">
        <p class="text-[11px] font-semibold uppercase tracking-wider text-sky-200">${lbl}</p>
        <p class="mt-2 text-2xl sm:text-3xl font-bold tabular-nums text-white">${val}</p>
        <p class="mt-2 text-[11px] text-slate-300">${sub}</p>
      </div>`;

    const slide02 = slideChrome(
      "02",
      "El mes en cifras",
      `Panorama ejecutivo consolidado · ${nombreMesCap} ${anioActual}`,
      `
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        ${navyCard("Valor de contratos", fmtM(valorContratosTotal), `${proyectosActivosLista.length} proyectos activos`, formatoMoneda(valorContratosTotal))}
        ${navyCard("Por facturar", fmtM(porFacturarTotal), "Saldo contractual pendiente", formatoMoneda(porFacturarTotal))}
        ${navyCard(`Facturado ${nombreMes}`, fmtM(facturadoMes), `Emitido en ${nombreMes} ${anioActual}`, formatoMoneda(facturadoMes))}
        ${navyCard(`Acumulado ${anioActual}`, fmtM(facturadoAnio), `Facturación total año ${anioActual}`, formatoMoneda(facturadoAnio))}
      </div>
      <div class="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex flex-col justify-between">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-bold comite-text-navy">Semáforo de proyectos</h3>
            <span class="text-xs font-semibold text-slate-400">${proyectosEvaluados.length} total</span>
          </div>
          <div class="my-4 grid grid-cols-3 gap-2 text-center">
            <div class="rounded-xl bg-emerald-50 border border-emerald-100 p-2.5">
              <p class="text-lg font-bold text-emerald-700 tabular-nums">${cntAlDia}</p>
              <p class="text-[11px] font-semibold text-emerald-700">Al día</p>
            </div>
            <div class="rounded-xl bg-amber-50 border border-amber-100 p-2.5">
              <p class="text-lg font-bold text-amber-700 tabular-nums">${cntSeg}</p>
              <p class="text-[11px] font-semibold text-amber-800">En seguimiento</p>
            </div>
            <div class="rounded-xl bg-rose-50 border border-rose-100 p-2.5">
              <p class="text-lg font-bold text-rose-700 tabular-nums">${cntCrit}</p>
              <p class="text-[11px] font-semibold text-rose-700">Críticos</p>
            </div>
          </div>
          <div>
            <div class="flex h-3 w-full overflow-hidden rounded-full bg-slate-100">
              ${cntAlDia ? `<div class="bg-emerald-500 h-full" style="width:${pctAlDia}%"></div>` : ""}
              ${cntSeg ? `<div class="bg-amber-500 h-full" style="width:${pctSeg}%"></div>` : ""}
              ${cntCrit ? `<div class="bg-rose-500 h-full" style="width:${pctCrit}%"></div>` : ""}
            </div>
          </div>
        </div>

        <div class="rounded-2xl comite-bg-cyan p-5 shadow-sm flex flex-col justify-between text-white" title="${escapeHtml(formatoMoneda(faltaRealTotal))}">
          <div>
            <p class="text-[11px] font-semibold uppercase tracking-wider text-white/85">Falta por gastar real</p>
            <p class="mt-2 text-3xl font-bold tabular-nums">${fmtM(faltaRealTotal)}</p>
          </div>
          <p class="mt-4 text-xs text-white/90">Presupuesto disponible por ejecutar en proyectos activos (excluyendo costos ya registrados).</p>
        </div>

        <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex flex-col justify-between" title="${escapeHtml(formatoMoneda(sumTotalVal))}">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-bold comite-text-navy">Mantenimientos / Suministros</h3>
            <span class="rounded-full bg-sky-50 px-2.5 py-0.5 text-[11px] font-semibold comite-text-cyan">${suministros.length} reg.</span>
          </div>
          <div class="my-3">
            <p class="text-2xl font-bold comite-text-navy tabular-nums">${fmtM(sumTotalVal)}</p>
            <p class="text-xs text-slate-500 mt-1">Valor total registrado</p>
          </div>
          <div class="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-xs">
            <span class="font-medium text-slate-600">En curso (${sumEnCurso.length})</span>
            <span class="font-bold comite-text-cyan tabular-nums">${fmtM(sumEnCursoVal)}</span>
          </div>
        </div>
      </div>`
    );

    // ------------------------------------------------------------------
    // 03 · Estado de proyectos
    // ------------------------------------------------------------------
    const filas03 = proyectosEvaluados
      .map((x) => {
        const av = Math.min(100, Math.max(0, Number(x.p.avance_porcentaje || 0)));
        const pptoPct = x.ppto > 0 ? Math.round((x.gastado / x.ppto) * 100) : 0;
        const hito = x.proxFact
          ? `${escapeHtml(x.proxFact.numero_factura || "Pendiente")} · ${fmtM(x.proxFact.valor)}`
          : x.pendienteFact > 0
            ? `Por facturar ${fmtM(x.pendienteFact)}`
            : "Al día";
        return `
        <tr class="border-b border-slate-100 last:border-0 hover:bg-slate-50/70">
          <td class="px-3 py-2.5">${badgeEmpresa(x.empNombre)}</td>
          <td class="px-3 py-2.5 font-semibold comite-text-navy">${escapeHtml(x.p.nombre)}</td>
          <td class="px-3 py-2.5">${x.sem.pill}</td>
          <td class="px-3 py-2.5 min-w-[130px]">
            <div class="flex items-center gap-2">
              <div class="h-2 flex-1 rounded-full bg-slate-100 overflow-hidden">
                <div class="h-full rounded-full comite-bg-cyan" style="width:${av}%"></div>
              </div>
              <span class="text-[11px] font-bold tabular-nums text-slate-700 w-9 text-right">${av}%</span>
            </div>
          </td>
          <td class="px-3 py-2.5 tabular-nums text-slate-700" title="${escapeHtml(formatoMoneda(x.gastado))}">
            <span class="font-semibold">${pptoPct}%</span>
            <span class="text-[11px] text-slate-400">(${fmtM(x.gastado)})</span>
          </td>
          <td class="px-3 py-2.5 text-slate-700">${hito}</td>
          <td class="px-3 py-2.5 tabular-nums text-slate-600">${formatoFecha(x.p.fecha_fin_estimada)}</td>
        </tr>`;
      })
      .join("");

    const slide03 = slideChrome(
      "03",
      "Estado de proyectos",
      "Seguimiento operativo, avance físico, uso de presupuesto y próximo hito de cobro",
      `
      <div class="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table class="w-full text-left text-xs">
          <thead class="comite-bg-navy text-[11px] uppercase tracking-wider text-white">
            <tr>
              <th class="px-3 py-3">Empresa</th>
              <th class="px-3 py-3">Proyecto</th>
              <th class="px-3 py-3">Semáforo</th>
              <th class="px-3 py-3">% Avance</th>
              <th class="px-3 py-3">Ppto. usado</th>
              <th class="px-3 py-3">Próximo hito de cobro</th>
              <th class="px-3 py-3">Cierre estimado</th>
            </tr>
          </thead>
          <tbody>${filas03 || `<tr><td colspan="7" class="px-4 py-8 text-center text-slate-400">Sin proyectos registrados.</td></tr>`}</tbody>
        </table>
      </div>`
    );

    // ------------------------------------------------------------------
    // 04 · Resumen financiero de proyectos
    // ------------------------------------------------------------------
    const tot04 = proyectosEvaluados.reduce(
      (acc, x) => {
        acc.ppto += x.ppto;
        acc.ventas += x.facturado;
        acc.costos += x.gastado;
        acc.valorTotal += x.valorTotal;
        acc.pendiente += x.pendienteFact;
        return acc;
      },
      { ppto: 0, ventas: 0, costos: 0, valorTotal: 0, pendiente: 0 }
    );
    const totMargen04 = tot04.ventas - tot04.costos;
    const totMargenPct04 = tot04.ventas > 0 ? ((totMargen04 / tot04.ventas) * 100).toFixed(1) + "%" : "—";

    const filas04 = proyectosEvaluados
      .map((x) => {
        const mPct = x.facturado > 0 ? ((x.margen / x.facturado) * 100).toFixed(1) + "%" : "—";
        const prox = x.proxFact ? `${formatoFecha(x.proxFact.fecha_vencimiento)} (${fmtM(x.proxFact.valor)})` : "—";
        return `
        <tr class="border-b border-slate-100 last:border-0 hover:bg-slate-50/70">
          <td class="px-3 py-2.5">${badgeEmpresa(x.empNombre)}</td>
          <td class="px-3 py-2.5 font-semibold comite-text-navy">${escapeHtml(x.p.nombre)}</td>
          <td class="px-3 py-2.5 tabular-nums text-slate-700" title="${escapeHtml(formatoMoneda(x.ppto))}">${fmtM(x.ppto)}</td>
          <td class="px-3 py-2.5 tabular-nums text-slate-700" title="${escapeHtml(formatoMoneda(x.facturado))}">${fmtM(x.facturado)}</td>
          <td class="px-3 py-2.5 tabular-nums text-slate-700" title="${escapeHtml(formatoMoneda(x.gastado))}">${fmtM(x.gastado)}</td>
          <td class="px-3 py-2.5 tabular-nums font-semibold ${x.margen >= 0 ? "text-emerald-700" : "text-rose-600"}" title="${escapeHtml(formatoMoneda(x.margen))}">
            ${fmtM(x.margen)} <span class="text-[10px] font-normal text-slate-400">(${mPct})</span>
          </td>
          <td class="px-3 py-2.5 tabular-nums font-semibold comite-text-navy" title="${escapeHtml(formatoMoneda(x.valorTotal))}">${fmtM(x.valorTotal)}</td>
          <td class="px-3 py-2.5 tabular-nums font-semibold comite-text-cyan" title="${escapeHtml(formatoMoneda(x.pendienteFact))}">${fmtM(x.pendienteFact)}</td>
          <td class="px-3 py-2.5 text-slate-600 whitespace-nowrap">${prox}</td>
        </tr>`;
      })
      .join("");

    const slide04 = slideChrome(
      "04",
      "Resumen financiero de proyectos",
      "Comparativo de presupuesto, ventas facturadas, costos reales, margen bruto y cartera pendiente",
      `
      <div class="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table class="w-full text-left text-xs">
          <thead class="comite-bg-navy text-[11px] uppercase tracking-wider text-white">
            <tr>
              <th class="px-3 py-3">Empresa</th>
              <th class="px-3 py-3">Proyecto</th>
              <th class="px-3 py-3">Ppto. contrato</th>
              <th class="px-3 py-3">Ventas</th>
              <th class="px-3 py-3">Costos</th>
              <th class="px-3 py-3">Margen bruto</th>
              <th class="px-3 py-3">Valor total contrato</th>
              <th class="px-3 py-3">Facturación pendiente</th>
              <th class="px-3 py-3">Próxima facturación</th>
            </tr>
          </thead>
          <tbody>
            ${filas04 || `<tr><td colspan="9" class="px-4 py-8 text-center text-slate-400">Sin proyectos registrados.</td></tr>`}
          </tbody>
          <tfoot class="bg-slate-100 font-bold comite-text-navy border-t-2 border-slate-300">
            <tr>
              <td class="px-3 py-3" colspan="2">TOTAL CONSOLIDADO</td>
              <td class="px-3 py-3 tabular-nums">${fmtM(tot04.ppto)}</td>
              <td class="px-3 py-3 tabular-nums">${fmtM(tot04.ventas)}</td>
              <td class="px-3 py-3 tabular-nums">${fmtM(tot04.costos)}</td>
              <td class="px-3 py-3 tabular-nums ${totMargen04 >= 0 ? "text-emerald-700" : "text-rose-600"}">${fmtM(totMargen04)} (${totMargenPct04})</td>
              <td class="px-3 py-3 tabular-nums">${fmtM(tot04.valorTotal)}</td>
              <td class="px-3 py-3 tabular-nums comite-text-cyan">${fmtM(tot04.pendiente)}</td>
              <td class="px-3 py-3">—</td>
            </tr>
          </tfoot>
        </table>
      </div>`
    );

    // ------------------------------------------------------------------
    // 05 · Presupuesto por gastar (papel vs. real)
    // ------------------------------------------------------------------
    const pptoTotal05 = proyectosEvaluados.reduce((s, x) => s + x.ppto, 0);
    const gastadoTotal05 = proyectosEvaluados.reduce((s, x) => s + x.gastado, 0);
    const faltaPapel05 = proyectosEvaluados.reduce((s, x) => s + x.faltaPapel, 0);
    const faltaReal05 = proyectosEvaluados.reduce((s, x) => s + x.faltaReal, 0);

    const kpiWhite = (lbl, val, sub, cls = "comite-text-navy", exact = "") => `
      <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" title="${escapeHtml(exact)}">
        <p class="text-[11px] font-semibold uppercase tracking-wider text-slate-400">${lbl}</p>
        <p class="mt-1.5 text-2xl font-bold tabular-nums ${cls}">${val}</p>
        <p class="mt-1 text-[11px] text-slate-500">${sub}</p>
      </div>`;

    const filas05 = proyectosEvaluados
      .map((x) => {
        const base = Math.max(1, x.ppto, x.gastado);
        const pctGast = Math.min(100, Math.round((x.gastado / base) * 100));
        const pctFalta = Math.max(0, 100 - pctGast);
        const pctUsado = x.ppto > 0 ? Math.round((x.gastado / x.ppto) * 100) : 0;
        return `
        <tr class="border-b border-slate-100 last:border-0">
          <td class="px-3 py-2.5">${badgeEmpresa(x.empNombre)}</td>
          <td class="px-3 py-2.5 font-semibold comite-text-navy">${escapeHtml(x.p.nombre)}</td>
          <td class="px-3 py-2.5 tabular-nums">${fmtM(x.ppto)}</td>
          <td class="px-3 py-2.5 tabular-nums font-medium">${fmtM(x.gastado)}</td>
          <td class="px-3 py-2.5 tabular-nums text-slate-600">${fmtM(x.faltaPapel)}</td>
          <td class="px-3 py-2.5 tabular-nums font-bold comite-text-cyan">${fmtM(x.faltaReal)}</td>
          <td class="px-3 py-2.5 min-w-[190px]">
            <div class="flex items-center gap-2">
              <div class="flex h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                <div class="comite-bg-navy h-full" style="width:${pctGast}%"></div>
                <div class="comite-bg-cyan h-full opacity-40" style="width:${pctFalta}%"></div>
              </div>
              <span class="text-[11px] font-bold tabular-nums ${pctUsado > 100 ? "text-rose-600" : "text-slate-700"} w-10 text-right">${pctUsado}%</span>
            </div>
          </td>
        </tr>`;
      })
      .join("");

    const slide05 = slideChrome(
      "05",
      "Presupuesto por gastar (papel vs. real)",
      "Control de ejecución presupuestal y saldo disponible por proyecto",
      `
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        ${kpiWhite("Presupuesto total", fmtM(pptoTotal05), "Base contractual", "comite-text-navy", formatoMoneda(pptoTotal05))}
        ${kpiWhite("Gastado", fmtM(gastadoTotal05), "Costos y gastos registrados", "text-slate-800", formatoMoneda(gastadoTotal05))}
        ${kpiWhite("Falta en papel", fmtM(faltaPapel05), "Presupuesto menos gastado", "text-slate-700", formatoMoneda(faltaPapel05))}
        <div class="rounded-2xl comite-bg-cyan p-4 shadow-sm text-white" title="${escapeHtml(formatoMoneda(faltaReal05))}">
          <p class="text-[11px] font-semibold uppercase tracking-wider text-white/85">Falta real</p>
          <p class="mt-1.5 text-2xl font-bold tabular-nums">${fmtM(faltaReal05)}</p>
          <p class="mt-1 text-[11px] text-white/90">Disponible real por ejecutar</p>
        </div>
      </div>
      <div class="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table class="w-full text-left text-xs">
          <thead class="comite-bg-navy text-[11px] uppercase tracking-wider text-white">
            <tr>
              <th class="px-3 py-3">Empresa</th>
              <th class="px-3 py-3">Proyecto</th>
              <th class="px-3 py-3">Presupuesto</th>
              <th class="px-3 py-3">Gastado</th>
              <th class="px-3 py-3">Falta papel</th>
              <th class="px-3 py-3">Falta real</th>
              <th class="px-3 py-3">Composición del ppto. · % usado</th>
            </tr>
          </thead>
          <tbody>${filas05 || `<tr><td colspan="7" class="px-4 py-8 text-center text-slate-400">Sin datos presupuestales.</td></tr>`}</tbody>
        </table>
      </div>`
    );

    // ------------------------------------------------------------------
    // 06 · Facturación pendiente por proyecto
    // ------------------------------------------------------------------
    const rankingPend = proyectosEvaluados
      .filter((x) => x.pendienteFact > 0)
      .sort((a, b) => b.pendienteFact - a.pendienteFact);
    const totalPend06 = rankingPend.reduce((s, x) => s + x.pendienteFact, 0);
    const maxPend06 = Math.max(1, ...(rankingPend.map((x) => x.pendienteFact)));
    const top3Pend = rankingPend.slice(0, 3).reduce((s, x) => s + x.pendienteFact, 0);
    const concentracionPct = totalPend06 > 0 ? ((top3Pend / totalPend06) * 100).toFixed(1) : "0.0";

    const pendPorEmpresaMap = new Map();
    rankingPend.forEach((x) => {
      pendPorEmpresaMap.set(x.empNombre, (pendPorEmpresaMap.get(x.empNombre) || 0) + x.pendienteFact);
    });
    const pendPorEmpresa = [...pendPorEmpresaMap.entries()].sort((a, b) => b[1] - a[1]);

    const barras06 = rankingPend
      .slice(0, 10)
      .map((x) => {
        const w = Math.max(4, Math.round((x.pendienteFact / maxPend06) * 100));
        return `
        <div class="space-y-1">
          <div class="flex items-center justify-between text-xs">
            <span class="font-semibold comite-text-navy truncate pr-2">${escapeHtml(x.p.nombre)} <span class="text-[10px] font-normal text-slate-400">· ${escapeHtml(x.empNombre)}</span></span>
            <span class="font-bold tabular-nums comite-text-navy shrink-0">${fmtM(x.pendienteFact)}</span>
          </div>
          <div class="h-3 w-full rounded-full bg-slate-100 overflow-hidden">
            <div class="h-full rounded-full" style="width:${w}%; background:${colorEmpresa(x.empNombre)}"></div>
          </div>
        </div>`;
      })
      .join("");

    const filasEmp06 = pendPorEmpresa
      .map(([emp, val]) => {
        const pct = totalPend06 > 0 ? ((val / totalPend06) * 100).toFixed(1) : "0.0";
        return `
        <div class="flex items-center justify-between border-b border-slate-100 py-2.5 last:border-0 text-xs">
          <div class="flex items-center gap-2">
            <span class="h-2.5 w-2.5 rounded-full" style="background:${colorEmpresa(emp)}"></span>
            <span class="font-semibold text-slate-700">${escapeHtml(emp)}</span>
          </div>
          <div class="text-right tabular-nums">
            <span class="font-bold comite-text-navy">${fmtM(val)}</span>
            <span class="ml-1 text-[11px] text-slate-400">(${pct}%)</span>
          </div>
        </div>`;
      })
      .join("");

    const slide06 = slideChrome(
      "06",
      "Facturación pendiente por proyecto",
      "Ranking de saldo por facturar coloreado por empresa y análisis de concentración",
      `
      <div class="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div class="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3.5">
          <div class="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <h3 class="text-sm font-bold comite-text-navy">Ranking por saldo pendiente (Top 10)</h3>
            <div class="flex items-center gap-3 text-[11px] text-slate-500">
              <span class="inline-flex items-center gap-1"><span class="h-2 w-2 rounded-full comite-bg-navy"></span>Pctronic</span>
              <span class="inline-flex items-center gap-1"><span class="h-2 w-2 rounded-full comite-bg-cyan"></span>Grupo Integra</span>
            </div>
          </div>
          ${barras06 || `<p class="py-8 text-center text-xs text-slate-400">No hay saldos pendientes por facturar.</p>`}
        </div>
        <div class="space-y-4">
          <div class="rounded-2xl comite-bg-navy p-5 text-white shadow-sm">
            <p class="text-[11px] font-semibold uppercase tracking-wider text-sky-200">Concentración % (Top 3)</p>
            <p class="mt-2 text-3xl font-bold tabular-nums">${concentracionPct}%</p>
            <p class="mt-2 text-xs text-slate-300">Los 3 proyectos principales concentran ${fmtM(top3Pend)} de ${fmtM(totalPend06)} pendientes.</p>
          </div>
          <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 class="text-sm font-bold comite-text-navy mb-2">Pendiente por empresa</h3>
            ${filasEmp06 || `<p class="text-xs text-slate-400">Sin saldos pendientes.</p>`}
          </div>
        </div>
      </div>`
    );

    // ------------------------------------------------------------------
    // 07 · Servicios y mantenimientos / Suministros
    // ------------------------------------------------------------------
    const sumCerrados = suministros.filter((s) => s.estado === "cerrado");
    const sumPendVal = sumEnCurso.reduce((s, x) => s + Number(x.valor_venta || 0), 0);
    const sumCerrVal = sumCerrados.reduce((s, x) => s + Number(x.valor_venta || 0), 0);

    const estadoSumBadge = (est) => {
      if (est === "cerrado") return `<span class="inline-flex rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">Cerrado</span>`;
      if (est === "cancelado") return `<span class="inline-flex rounded-full bg-slate-200 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700">Cancelado</span>`;
      return `<span class="inline-flex rounded-full bg-sky-100 px-2.5 py-0.5 text-[11px] font-semibold text-[#0095D9]">En curso</span>`;
    };

    const filas07 = suministros
      .map((s, idx) => {
        const val = Number(s.valor_venta || 0);
        const pend = s.estado === "en_curso" ? val : 0;
        const empNom = s.empresas?.nombre || empresaNombre(s.empresa_id);
        return `
        <tr class="border-b border-slate-100 last:border-0">
          <td class="px-3 py-2.5 tabular-nums text-slate-400 font-semibold">${idx + 1}</td>
          <td class="px-3 py-2.5 font-semibold comite-text-navy">${escapeHtml(s.oferta || "Suministro / Mantenimiento")}</td>
          <td class="px-3 py-2.5">${estadoSumBadge(s.estado)}</td>
          <td class="px-3 py-2.5 text-slate-700">${escapeHtml(s.clientes?.nombre || "—")}</td>
          <td class="px-3 py-2.5">${badgeEmpresa(empNom)}</td>
          <td class="px-3 py-2.5 tabular-nums font-medium">${fmtM(val)}</td>
          <td class="px-3 py-2.5 tabular-nums font-bold ${pend > 0 ? "comite-text-cyan" : "text-slate-400"}">${fmtM(pend)}</td>
        </tr>`;
      })
      .join("");

    const slide07 = slideChrome(
      "07",
      "Servicios y mantenimientos / Suministros",
      "Seguimiento de ventas de equipos, insumos y contratos de servicio",
      `
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        ${kpiWhite("Total registros", `${suministros.length}`, "Suministros y servicios")}
        ${kpiWhite("Valor total", fmtM(sumTotalVal), "Monto acumulado", "comite-text-navy", formatoMoneda(sumTotalVal))}
        ${kpiWhite("En curso / Pendiente", fmtM(sumPendVal), `${sumEnCurso.length} en ejecución`, "comite-text-cyan", formatoMoneda(sumPendVal))}
        ${kpiWhite("Cerrados", fmtM(sumCerrVal), `${sumCerrados.length} finalizados`, "text-emerald-700", formatoMoneda(sumCerrVal))}
      </div>
      <div class="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table class="w-full text-left text-xs">
          <thead class="comite-bg-navy text-[11px] uppercase tracking-wider text-white">
            <tr>
              <th class="px-3 py-3">#</th>
              <th class="px-3 py-3">Concepto</th>
              <th class="px-3 py-3">Estado</th>
              <th class="px-3 py-3">Cliente</th>
              <th class="px-3 py-3">Empresa</th>
              <th class="px-3 py-3">Valor</th>
              <th class="px-3 py-3">Pendiente</th>
            </tr>
          </thead>
          <tbody>${filas07 || `<tr><td colspan="7" class="px-4 py-8 text-center text-slate-400">Sin suministros o servicios registrados.</td></tr>`}</tbody>
        </table>
      </div>`
    );

    // ------------------------------------------------------------------
    // 08 · Facturación del mes
    // ------------------------------------------------------------------
    const enMesActual = (fechaStr) => {
      if (!fechaStr) return false;
      const d = new Date(fechaStr + "T00:00:00");
      return d.getMonth() === mesActual && d.getFullYear() === anioActual;
    };

    const facturasMes = facturasValidas.filter((f) => enMesActual(f.fecha_emision) || enMesActual(f.fecha_vencimiento));
    const esperadaMes = facturasMes.reduce((s, f) => s + Number(f.valor || 0), 0);
    const efectuadaMes = facturasValidas
      .filter((f) => enMesActual(f.fecha_emision) && !["pendiente", "vencida"].includes(f.estado))
      .reduce((s, f) => s + Number(f.valor || 0), 0);
    const totalMesFact = facturadoMes > 0 ? facturadoMes : efectuadaMes;
    const cumplimientoMes = esperadaMes > 0 ? Math.min(100, Math.round((totalMesFact / esperadaMes) * 100)) : totalMesFact > 0 ? 100 : 0;

    const compEmpresas = (empresas.length ? empresas : [{ id: null, nombre: "Consolidado" }]).map((e) => {
      const fEmp = facturasMes.filter((f) => !e.id || f.proyectos?.empresa_id === e.id);
      const esp = fEmp.reduce((s, f) => s + Number(f.valor || 0), 0);
      const real = facturasValidas
        .filter((f) => (!e.id || f.proyectos?.empresa_id === e.id) && enMesActual(f.fecha_emision))
        .reduce((s, f) => s + Number(f.valor || 0), 0);
      return { nombre: e.nombre, esperada: esp, real };
    });
    const maxComp08 = Math.max(1, ...compEmpresas.flatMap((c) => [c.esperada, c.real]));

    const barras08 = compEmpresas
      .map((c) => {
        const wEsp = Math.round((c.esperada / maxComp08) * 100);
        const wReal = Math.round((c.real / maxComp08) * 100);
        return `
        <div class="space-y-2 rounded-xl border border-slate-100 bg-slate-50/70 p-4">
          <div class="flex items-center justify-between text-xs font-bold comite-text-navy">
            <span>${escapeHtml(c.nombre)}</span>
            <span class="tabular-nums text-slate-500">Esperada ${fmtM(c.esperada)} · Facturada ${fmtM(c.real)}</span>
          </div>
          <div class="space-y-1.5">
            <div class="flex items-center gap-2 text-[11px]">
              <span class="w-20 text-slate-500">Esperada</span>
              <div class="h-3 flex-1 rounded-full bg-slate-200 overflow-hidden">
                <div class="comite-bg-navy h-full rounded-full" style="width:${wEsp}%"></div>
              </div>
              <span class="w-16 text-right font-semibold tabular-nums">${fmtM(c.esperada)}</span>
            </div>
            <div class="flex items-center gap-2 text-[11px]">
              <span class="w-20 text-slate-500">Facturada</span>
              <div class="h-3 flex-1 rounded-full bg-slate-200 overflow-hidden">
                <div class="comite-bg-cyan h-full rounded-full" style="width:${wReal}%"></div>
              </div>
              <span class="w-16 text-right font-semibold tabular-nums comite-text-cyan">${fmtM(c.real)}</span>
            </div>
          </div>
        </div>`;
      })
      .join("");

    const slide08 = slideChrome(
      "08",
      `Facturación del mes · ${nombreMesCap} ${anioActual}`,
      "Comparativo de meta esperada vs. facturación emitida por empresa",
      `
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
        ${kpiWhite("Facturación esperada", fmtM(esperadaMes), `Programada para ${nombreMes}`, "comite-text-navy", formatoMoneda(esperadaMes))}
        ${kpiWhite("Facturación total del mes", fmtM(totalMesFact), `Emitida en ${nombreMes}`, "comite-text-navy", formatoMoneda(totalMesFact))}
        <div class="rounded-2xl comite-bg-cyan p-4 shadow-sm text-white">
          <p class="text-[11px] font-semibold uppercase tracking-wider text-white/85">Cumplimiento</p>
          <p class="mt-1.5 text-3xl font-bold tabular-nums">${cumplimientoMes}%</p>
          <p class="mt-1 text-[11px] text-white/90">Ejecución frente a lo esperado</p>
        </div>
      </div>
      <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
        <h3 class="text-sm font-bold comite-text-navy">Comparativo por empresa</h3>
        ${barras08}
      </div>`
    );

    // ------------------------------------------------------------------
    // 09 · Detalle de facturación del mes
    // ------------------------------------------------------------------
    const pendientesMes = facturasMes.filter((f) => ["pendiente", "vencida"].includes(f.estado));
    const efectuadasMes = facturasValidas.filter((f) => enMesActual(f.fecha_emision) && !["pendiente", "vencida"].includes(f.estado));

    const tablaFacturas09 = (lista, emptyMsg) => {
      const rows = lista
        .map(
          (f) => `
          <tr class="border-b border-slate-100 last:border-0">
            <td class="px-3 py-2 font-semibold comite-text-navy">${escapeHtml(f.numero_factura || "S/N")}</td>
            <td class="px-3 py-2 text-slate-700">${escapeHtml(f.proyectos?.nombre || "—")}</td>
            <td class="px-3 py-2 text-slate-500">${escapeHtml(empresaNombre(f.proyectos?.empresa_id))}</td>
            <td class="px-3 py-2 tabular-nums text-slate-600">${formatoFecha(f.fecha_emision || f.fecha_vencimiento)}</td>
            <td class="px-3 py-2 font-bold tabular-nums text-right">${fmtM(f.valor)}</td>
          </tr>`
        )
        .join("");
      return `
        <table class="w-full text-left text-xs">
          <thead class="bg-slate-50 text-[11px] uppercase text-slate-500 border-b border-slate-200">
            <tr>
              <th class="px-3 py-2">Factura</th>
              <th class="px-3 py-2">Proyecto</th>
              <th class="px-3 py-2">Empresa</th>
              <th class="px-3 py-2">Fecha</th>
              <th class="px-3 py-2 text-right">Valor</th>
            </tr>
          </thead>
          <tbody>${rows || `<tr><td colspan="5" class="px-3 py-6 text-center text-slate-400">${emptyMsg}</td></tr>`}</tbody>
        </table>`;
    };

    const sumPendMes09 = pendientesMes.reduce((s, f) => s + Number(f.valor || 0), 0);
    const sumEfecMes09 = efectuadasMes.reduce((s, f) => s + Number(f.valor || 0), 0);

    const slide09 = slideChrome(
      "09",
      `Detalle de facturación del mes · ${nombreMesCap}`,
      "Desglose de facturas pendientes por emitir/cobrar vs. facturación efectuada",
      `
      <div class="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div class="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div class="flex items-center justify-between border-b border-slate-100 px-4 py-3 bg-amber-50/70">
            <h3 class="text-sm font-bold text-amber-900">Facturación pendiente del mes (${pendientesMes.length})</h3>
            <span class="text-sm font-bold text-amber-800 tabular-nums">${fmtM(sumPendMes09)}</span>
          </div>
          <div class="overflow-x-auto">${tablaFacturas09(pendientesMes, "Sin facturas pendientes en el mes.")}</div>
        </div>
        <div class="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div class="flex items-center justify-between border-b border-slate-100 px-4 py-3 bg-emerald-50/70">
            <h3 class="text-sm font-bold text-emerald-900">Facturación efectuada del mes (${efectuadasMes.length})</h3>
            <span class="text-sm font-bold text-emerald-700 tabular-nums">${fmtM(sumEfecMes09)}</span>
          </div>
          <div class="overflow-x-auto">${tablaFacturas09(efectuadasMes, "Sin facturas efectuadas en el mes.")}</div>
        </div>
      </div>`
    );

    // ------------------------------------------------------------------
    // 10 · Facturación acumulada del año + Proyección Comercial (CRM + Ofertas)
    // ------------------------------------------------------------------
    const mesesAnio = Array.from({ length: 12 }, (_, m) => {
      const label = new Date(anioActual, m, 1).toLocaleDateString("es-CO", { month: "short" }).replace(".", "");
      const fm = facturasValidas.filter((f) => {
        if (!f.fecha_emision) return false;
        const d = new Date(f.fecha_emision + "T00:00:00");
        return d.getFullYear() === anioActual && d.getMonth() === m;
      });
      let pctronic = 0;
      let integra = 0;
      let otros = 0;
      fm.forEach((f) => {
        const empNom = empresaNombre(f.proyectos?.empresa_id);
        const v = Number(f.valor || 0);
        if (esGrupoIntegra(empNom)) integra += v;
        else if (empNom.toLowerCase().includes("pctronic")) pctronic += v;
        else otros += v;
      });
      return { m, label, pctronic: pctronic + otros, integra, total: pctronic + integra + otros };
    });

    const maxMesAnio = Math.max(1, ...mesesAnio.map((x) => x.total));
    const totPctAnio = mesesAnio.reduce((s, x) => s + x.pctronic, 0);
    const totIntAnio = mesesAnio.reduce((s, x) => s + x.integra, 0);
    const totGenAnio = totPctAnio + totIntAnio;

    const filas10 = mesesAnio
      .map(
        (x) => `
        <tr class="border-b border-slate-100 last:border-0">
          <td class="px-2.5 py-1.5 font-semibold capitalize text-slate-700">${x.label}</td>
          <td class="px-2.5 py-1.5 tabular-nums text-right">${fmtM(x.pctronic)}</td>
          <td class="px-2.5 py-1.5 tabular-nums text-right comite-text-cyan">${fmtM(x.integra)}</td>
          <td class="px-2.5 py-1.5 tabular-nums text-right font-bold comite-text-navy">${fmtM(x.total)}</td>
        </tr>`
      )
      .join("");

    const barras10 = mesesAnio
      .map((x) => {
        const hPct = Math.round((x.pctronic / maxMesAnio) * 100);
        const hInt = Math.round((x.integra / maxMesAnio) * 100);
        return `
        <div class="flex-1 flex flex-col items-center gap-1 min-w-0">
          <div class="w-full h-36 flex flex-col justify-end items-center px-0.5">
            <div class="w-full max-w-[20px] flex flex-col justify-end h-full">
              <div class="w-full comite-bg-cyan rounded-t-sm" style="height:${hInt}%"></div>
              <div class="w-full comite-bg-navy ${hInt === 0 ? "rounded-t-sm" : ""}" style="height:${hPct}%"></div>
            </div>
          </div>
          <span class="text-[10px] font-semibold capitalize text-slate-500">${x.label}</span>
        </div>`;
      })
      .join("");

    const etapasActivas = ["por_revisar", "prospecto", "visita", "cotizacion", "negociacion"];
    const opsActivas = crmOportunidades.filter((o) => etapasActivas.includes(o.etapa));
    const pipelineTotal = opsActivas.reduce((s, o) => s + Number(o.valor_estimado || 0), 0);
    const valorPonderado = opsActivas.reduce((s, o) => s + Number(o.valor_estimado || 0) * (Number(o.probabilidad || 0) / 100), 0);
    const montoGanado = crmOportunidades.filter((o) => o.etapa === "ganada").reduce((s, o) => s + Number(o.valor_estimado || 0), 0);
    const ofertasActivas = crmOfertas.filter((o) => o.estado !== "enviado_cliente");

    const slide10 = slideChrome(
      "10",
      `Facturación acumulada ${anioActual} y Proyección Comercial`,
      "Desempeño mensual por empresa y resumen del pipeline CRM + Ofertas Pre-venta",
      `
      <div class="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div class="lg:col-span-5 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table class="w-full text-left text-[11px]">
            <thead class="comite-bg-navy uppercase text-white">
              <tr>
                <th class="px-2.5 py-2">Mes</th>
                <th class="px-2.5 py-2 text-right">Pctronic</th>
                <th class="px-2.5 py-2 text-right">Grupo Integra</th>
                <th class="px-2.5 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>${filas10}</tbody>
            <tfoot class="bg-slate-100 font-bold comite-text-navy border-t border-slate-300">
              <tr>
                <td class="px-2.5 py-2">TOTAL</td>
                <td class="px-2.5 py-2 text-right tabular-nums">${fmtM(totPctAnio)}</td>
                <td class="px-2.5 py-2 text-right tabular-nums comite-text-cyan">${fmtM(totIntAnio)}</td>
                <td class="px-2.5 py-2 text-right tabular-nums">${fmtM(totGenAnio)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div class="lg:col-span-7 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex flex-col justify-between">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-sm font-bold comite-text-navy">Facturación mensual apilada (${anioActual})</h3>
            <div class="flex items-center gap-3 text-[11px] text-slate-500">
              <span class="inline-flex items-center gap-1"><span class="h-2.5 w-2.5 rounded-sm comite-bg-navy"></span>Pctronic</span>
              <span class="inline-flex items-center gap-1"><span class="h-2.5 w-2.5 rounded-sm comite-bg-cyan"></span>Grupo Integra</span>
            </div>
          </div>
          <div class="flex items-end gap-1.5 border-b border-slate-200 pb-2">${barras10}</div>
          <div class="mt-4 rounded-xl bg-slate-50 border border-slate-200 p-4">
            <div class="flex items-center justify-between mb-3">
              <h4 class="text-xs font-bold uppercase tracking-wider comite-text-navy">Proyección Comercial (CRM + Ofertas Pre-venta)</h4>
              <span class="text-[11px] font-semibold text-slate-500">${opsActivas.length} op. activas</span>
            </div>
            <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <p class="text-[10px] font-semibold uppercase text-slate-400">Pipeline activo</p>
                <p class="text-sm font-bold comite-text-navy tabular-nums">${fmtM(pipelineTotal)}</p>
              </div>
              <div>
                <p class="text-[10px] font-semibold uppercase text-slate-400">Ponderado</p>
                <p class="text-sm font-bold text-emerald-700 tabular-nums">${fmtM(valorPonderado)}</p>
              </div>
              <div>
                <p class="text-[10px] font-semibold uppercase text-slate-400">Cerrado ganado</p>
                <p class="text-sm font-bold comite-text-cyan tabular-nums">${fmtM(montoGanado)}</p>
              </div>
              <div>
                <p class="text-[10px] font-semibold uppercase text-slate-400">Ofertas pre-venta</p>
                <p class="text-sm font-bold text-amber-700 tabular-nums">${ofertasActivas.length} / ${crmOfertas.length}</p>
              </div>
            </div>
          </div>
        </div>
      </div>`
    );

    return [
      { titulo: "Portada", html: slide01 },
      { titulo: "El mes en cifras", html: slide02 },
      { titulo: "Estado de proyectos", html: slide03 },
      { titulo: "Resumen financiero de proyectos", html: slide04 },
      { titulo: "Presupuesto por gastar", html: slide05 },
      { titulo: "Facturación pendiente por proyecto", html: slide06 },
      { titulo: "Servicios y suministros", html: slide07 },
      { titulo: "Facturación del mes", html: slide08 },
      { titulo: "Detalle de facturación del mes", html: slide09 },
      { titulo: "Facturación acumulada y CRM", html: slide10 },
    ];
  }

  function renderSlideComite() {
    const slide = comiteSlides[comiteSlideActual];
    if (!slide) return;
    document.getElementById("comite-contenido").innerHTML = slide.html;
    document.getElementById("comite-indicador").textContent = `${comiteSlideActual + 1} / ${comiteSlides.length} — ${slide.titulo}`;
    document.getElementById("btn-comite-anterior").disabled = comiteSlideActual === 0;
    document.getElementById("btn-comite-siguiente").disabled = comiteSlideActual === comiteSlides.length - 1;
  }

  function abrirModoComite() {
    comiteSlides = construirSlidesComite();
    comiteSlideActual = 0;
    renderSlideComite();
    const printCont = document.getElementById("comite-print-all");
    if (printCont) {
      printCont.innerHTML = comiteSlides
        .map((s) => `<div class="comite-print-slide">${s.html}</div>`)
        .join("");
    }
    document.getElementById("modo-comite").classList.remove("hidden");
    document.getElementById("modo-comite").classList.add("flex");
  }

  function cerrarModoComite() {
    document.getElementById("modo-comite").classList.add("hidden");
    document.getElementById("modo-comite").classList.remove("flex");
  }

  document.getElementById("btn-modo-comite").addEventListener("click", abrirModoComite);
  document.getElementById("btn-imprimir-comite")?.addEventListener("click", () => window.print());
  document.getElementById("btn-cerrar-comite").addEventListener("click", cerrarModoComite);
  document.getElementById("btn-comite-anterior").addEventListener("click", () => {
    if (comiteSlideActual > 0) {
      comiteSlideActual--;
      renderSlideComite();
    }
  });
  document.getElementById("btn-comite-siguiente").addEventListener("click", () => {
    if (comiteSlideActual < comiteSlides.length - 1) {
      comiteSlideActual++;
      renderSlideComite();
    }
  });
  document.addEventListener("keydown", (e) => {
    if (document.getElementById("modo-comite").classList.contains("hidden")) return;
    if (e.key === "Escape") cerrarModoComite();
    if (e.key === "ArrowRight") document.getElementById("btn-comite-siguiente").click();
    if (e.key === "ArrowLeft") document.getElementById("btn-comite-anterior").click();
  });
})();
