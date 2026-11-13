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
      { data: compras },
      { data: gastos },
      { data: comprasSolicitudes },
      { data: vinculos },
      { data: suministros },
      { data: empresas },
      resOps,
      resOfertas,
    ] = await Promise.all([
      window.sb.from("proyectos").select("*, clientes(nombre), empresas(id, nombre)").order("created_at", { ascending: false }),
      window.sb.from("facturas").select("id, valor, estado, fecha_emision, fecha_vencimiento, numero_factura, proyecto_id, proyectos(nombre, empresa_id)"),
      window.sb.from("compras").select("proyecto_id, valor, fecha"),
      window.sb.from("gastos").select("proyecto_id, valor_total, fecha, tipo"),
      window.sb.from("compras_solicitudes").select("id, proyecto_id, estado, titulo"),
      window.sb.from("proyecto_contratistas").select("proyecto_id, cortes_pago(valor_neto)"),
      window.sb.from("suministros").select("*, clientes(nombre), empresas(nombre)").order("created_at", { ascending: false }),
      window.sb.from("empresas").select("id, nombre").order("nombre"),
      window.sb.from("crm_oportunidades").select("id, titulo, etapa, valor_estimado, probabilidad, empresa_id, created_at, updated_at"),
      window.sb.from("crm_ofertas_preventa").select("id, titulo, estado, prioridad, empresa_id, oportunidad_id, created_at").order("created_at", { ascending: false }),
    ]);
    if (errProyectos) throw errProyectos;
    if (errFacturasTodas) throw errFacturasTodas;

    datosGlobales = {
      proyectos: proyectos || [],
      facturas: facturasTodas || [],
      compras: compras || [],
      gastos: gastos || [],
      comprasSolicitudes: comprasSolicitudes || [],
      vinculos: vinculos || [],
      suministros: suministros || [],
      empresas: empresas || [],
      crmOportunidades: resOps?.error ? [] : resOps?.data || [],
      crmOfertas: resOfertas?.error ? [] : resOfertas?.data || [],
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
      suministros,
      empresas,
      crmOportunidades,
      crmOfertas,
    } = datosGlobales;

    function slideMesEnCifrasYCriticos() {
      const ahora = new Date();
      const mesActual = ahora.getMonth();
      const anioActual = ahora.getFullYear();
      const hoyStr = `${anioActual}-${String(mesActual + 1).padStart(2, "0")}-${String(ahora.getDate()).padStart(2, "0")}`;
      const nombreMes = ahora.toLocaleDateString("es-CO", { month: "long", year: "numeric" });

      const factMes = facturas
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

      const margenMes = factMes - gastosMes;
      const margenPct = factMes > 0 ? ((margenMes / factMes) * 100).toFixed(1) + "%" : "—";
      const porCobrar = facturas
        .filter((f) => ["pendiente", "vencida"].includes(f.estado))
        .reduce((s, f) => s + Number(f.valor || 0), 0);
      const comprasPend = comprasSolicitudes.filter((s) =>
        ["pendiente", "en_comparativo", "presentada"].includes(s.estado)
      ).length;

      const criticos = proyectos.filter(
        (p) => p.estado === "detenido" || (p.estado !== "finalizado" && p.fecha_fin_estimada && p.fecha_fin_estimada < hoyStr)
      );

      const kpiBox = (lbl, val, sub, cls = "text-gray-900") => `
        <div class="rounded-xl border border-gray-200 bg-gray-50 p-4">
          <p class="text-[11px] font-semibold uppercase text-gray-500">${lbl}</p>
          <p class="mt-1 text-xl font-bold tabular-nums ${cls}">${val}</p>
          <p class="mt-0.5 text-[11px] text-gray-400">${sub}</p>
        </div>`;

      const filasCriticos = criticos
        .map((p) => {
          const esDetenido = p.estado === "detenido";
          const esVencido = p.fecha_fin_estimada && p.fecha_fin_estimada < hoyStr;
          const alerta = [esDetenido ? "Detenido" : "", esVencido ? "Fecha fin vencida" : ""].filter(Boolean).join(" · ");
          return `
          <tr class="border-b border-rose-100 bg-rose-50/30">
            <td class="px-3 py-2.5 font-semibold text-gray-900">${escapeHtml(p.nombre)}</td>
            <td class="px-3 py-2.5 text-gray-600">${escapeHtml(p.empresas?.nombre || "—")}</td>
            <td class="px-3 py-2.5">${badgeHtml(ESTADOS_PROYECTO, p.estado)}</td>
            <td class="px-3 py-2.5 font-medium ${esVencido ? "text-rose-600" : "text-gray-700"}">${formatoFecha(p.fecha_fin_estimada)}</td>
            <td class="px-3 py-2.5 tabular-nums">${p.avance_porcentaje || 0}%</td>
            <td class="px-3 py-2.5 font-medium tabular-nums">${formatoMoneda(p.valor_total)}</td>
            <td class="px-3 py-2.5"><span class="inline-flex rounded-full bg-rose-100 px-2.5 py-0.5 text-[11px] font-semibold text-rose-700">${escapeHtml(alerta)}</span></td>
          </tr>`;
        })
        .join("");

      return `
        <div class="mb-5 flex flex-wrap items-baseline justify-between gap-2">
          <h2 class="text-2xl font-bold text-gray-900">Mes en Cifras y Proyectos Críticos</h2>
          <span class="text-sm font-medium capitalize text-gray-500">${nombreMes}</span>
        </div>
        <div class="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
          ${kpiBox("Facturación del mes", formatoMoneda(factMes), "Facturas emitidas", "text-primary")}
          ${kpiBox("Costos / Gastos", formatoMoneda(gastosMes), "Registrados en el mes")}
          ${kpiBox("Margen Bruto", formatoMoneda(margenMes), `Margen: ${margenPct}`, margenMes >= 0 ? "text-emerald-600" : "text-rose-600")}
          ${kpiBox("Por Cobrar", formatoMoneda(porCobrar), "Cartera pendiente / vencida", "text-rose-600")}
          ${kpiBox("Compras por aprobar", comprasPend, "Solicitudes pendientes", comprasPend > 0 ? "text-amber-600" : "text-gray-900")}
        </div>
        <h3 class="mb-3 text-base font-bold text-gray-900 flex items-center gap-2">
          <span class="h-2.5 w-2.5 rounded-full bg-rose-500"></span>
          Proyectos Críticos (${criticos.length})
        </h3>
        <div class="overflow-x-auto rounded-xl border border-rose-200">
          <table class="w-full text-left text-xs">
            <thead class="bg-rose-50 text-[11px] uppercase text-rose-800">
              <tr>
                <th class="px-3 py-2.5">Proyecto</th>
                <th class="px-3 py-2.5">Empresa</th>
                <th class="px-3 py-2.5">Estado</th>
                <th class="px-3 py-2.5">Fin Estimado</th>
                <th class="px-3 py-2.5">Avance</th>
                <th class="px-3 py-2.5">Valor Contrato</th>
                <th class="px-3 py-2.5">Alerta</th>
              </tr>
            </thead>
            <tbody>${filasCriticos || `<tr><td class="px-3 py-6 text-center text-emerald-700 bg-emerald-50/40 font-medium" colspan="7">Sin proyectos detenidos ni vencidos al día de hoy.</td></tr>`}</tbody>
          </table>
        </div>`;
    }

    function slideProyeccionComercial() {
      const etapasInfo = [
        { key: "por_revisar", label: "Por revisar / Contacto inicial", color: "bg-gray-400" },
        { key: "prospecto", label: "Contactado / Prospecto", color: "bg-slate-500" },
        { key: "visita", label: "Visita / Levantamiento", color: "bg-indigo-500" },
        { key: "cotizacion", label: "En Oferta / Cotización", color: "bg-amber-500" },
        { key: "negociacion", label: "Enviado al cliente / Seguimiento", color: "bg-blue-500" },
        { key: "ganada", label: "Cerrado ganado", color: "bg-emerald-500" },
        { key: "perdida", label: "Cerrado perdido", color: "bg-rose-500" },
        { key: "descartada", label: "Descartado", color: "bg-zinc-400" },
      ];
      const etapasActivas = ["por_revisar", "prospecto", "visita", "cotizacion", "negociacion"];
      const opsActivas = crmOportunidades.filter((o) => etapasActivas.includes(o.etapa));
      const pipelineTotal = opsActivas.reduce((s, o) => s + Number(o.valor_estimado || 0), 0);
      const valorPonderado = opsActivas.reduce(
        (s, o) => s + Number(o.valor_estimado || 0) * (Number(o.probabilidad || 0) / 100),
        0
      );
      const opsGanadas = crmOportunidades.filter((o) => o.etapa === "ganada");
      const montoGanado = opsGanadas.reduce((s, o) => s + Number(o.valor_estimado || 0), 0);

      const ofertasEstados = [
        { key: "levantamiento", label: "Levantamiento", cls: "bg-slate-100 text-slate-700" },
        { key: "en_proceso", label: "En proceso", cls: "bg-blue-100 text-blue-700" },
        { key: "finalizado", label: "Finalizado", cls: "bg-amber-100 text-amber-800" },
        { key: "enviado_cliente", label: "Enviado al cliente", cls: "bg-emerald-100 text-emerald-700" },
      ];
      const ofertasActivas = crmOfertas.filter((o) => o.estado !== "enviado_cliente");
      const maxEtapaValor = Math.max(
        1,
        ...etapasInfo.map((et) =>
          crmOportunidades.filter((o) => o.etapa === et.key).reduce((s, o) => s + Number(o.valor_estimado || 0), 0)
        )
      );

      const filasEtapas = etapasInfo
        .map((et) => {
          const items = crmOportunidades.filter((o) => o.etapa === et.key);
          const total = items.reduce((s, o) => s + Number(o.valor_estimado || 0), 0);
          const pond = items.reduce((s, o) => s + Number(o.valor_estimado || 0) * (Number(o.probabilidad || 0) / 100), 0);
          const ancho = total > 0 ? Math.max(4, Math.round((total / maxEtapaValor) * 100)) : 0;
          return `
          <tr class="border-b border-gray-100">
            <td class="px-3 py-2 font-medium text-gray-800 flex items-center gap-2">
              <span class="h-2.5 w-2.5 rounded-full ${et.color}"></span>
              ${et.label}
            </td>
            <td class="px-3 py-2 text-center font-semibold tabular-nums">${items.length}</td>
            <td class="px-3 py-2 font-medium tabular-nums">${formatoMoneda(total)}</td>
            <td class="px-3 py-2 text-emerald-700 font-medium tabular-nums">${formatoMoneda(pond)}</td>
            <td class="px-3 py-2 w-36">
              <div class="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
                <div class="${et.color} h-full rounded-full" style="width:${ancho}%"></div>
              </div>
            </td>
          </tr>`;
        })
        .join("");

      const resumenOfertasBadges = ofertasEstados
        .map((st) => {
          const cnt = crmOfertas.filter((o) => o.estado === st.key).length;
          return `
          <div class="rounded-lg border border-gray-200 px-3 py-2 flex items-center justify-between">
            <span class="inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${st.cls}">${st.label}</span>
            <span class="text-sm font-bold text-gray-900 tabular-nums">${cnt}</span>
          </div>`;
        })
        .join("");

      const listaOfertasActivas = ofertasActivas.slice(0, 6)
        .map((of) => {
          const est = ofertasEstados.find((s) => s.key === of.estado) || { label: of.estado, cls: "bg-gray-100 text-gray-700" };
          return `
          <div class="flex items-center justify-between gap-2 border-b border-gray-100 py-2 last:border-0 text-xs">
            <span class="font-medium text-gray-800 truncate">${escapeHtml(of.titulo || "Oferta sin título")}</span>
            <span class="shrink-0 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${est.cls}">${est.label}</span>
          </div>`;
        })
        .join("");

      return `
        <h2 class="mb-4 text-2xl font-bold text-gray-900">Proyección Comercial (CRM y Ofertas Pre-venta)</h2>
        <div class="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div class="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <p class="text-[11px] font-semibold uppercase text-gray-500">Pipeline Activo</p>
            <p class="mt-1 text-xl font-bold text-gray-900 tabular-nums">${formatoMoneda(pipelineTotal)}</p>
            <p class="text-[11px] text-gray-400">${opsActivas.length} oportunidades activas</p>
          </div>
          <div class="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
            <p class="text-[11px] font-semibold uppercase text-emerald-700">Ingreso Proyectado (Ponderado)</p>
            <p class="mt-1 text-xl font-bold text-emerald-700 tabular-nums">${formatoMoneda(valorPonderado)}</p>
            <p class="text-[11px] text-emerald-600/80">Según % de probabilidad</p>
          </div>
          <div class="rounded-xl border border-blue-200 bg-blue-50/70 p-4">
            <p class="text-[11px] font-semibold uppercase text-blue-700">Cerrado Ganado</p>
            <p class="mt-1 text-xl font-bold text-primary tabular-nums">${formatoMoneda(montoGanado)}</p>
            <p class="text-[11px] text-blue-600/80">${opsGanadas.length} oportunidades ganadas</p>
          </div>
          <div class="rounded-xl border border-amber-200 bg-amber-50/70 p-4">
            <p class="text-[11px] font-semibold uppercase text-amber-800">Ofertas Pre-venta</p>
            <p class="mt-1 text-xl font-bold text-amber-700 tabular-nums">${ofertasActivas.length} <span class="text-xs font-medium text-gray-500">/ ${crmOfertas.length} total</span></p>
            <p class="text-[11px] text-amber-700/80">En elaboración técnica</p>
          </div>
        </div>
        <div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div class="lg:col-span-2 overflow-x-auto rounded-xl border border-gray-200">
            <table class="w-full text-left text-xs">
              <thead class="bg-gray-50 text-[11px] uppercase text-gray-500">
                <tr>
                  <th class="px-3 py-2.5">Etapa del Pipeline</th>
                  <th class="px-3 py-2.5 text-center">Cant.</th>
                  <th class="px-3 py-2.5">Valor Estimado</th>
                  <th class="px-3 py-2.5">Ponderado</th>
                  <th class="px-3 py-2.5">Peso</th>
                </tr>
              </thead>
              <tbody>${filasEtapas}</tbody>
            </table>
          </div>
          <div class="rounded-xl border border-gray-200 p-4 space-y-3">
            <h3 class="text-sm font-bold text-gray-900">Resumen Ofertas Pre-venta</h3>
            <div class="grid grid-cols-1 gap-2">${resumenOfertasBadges}</div>
            <div class="border-t border-gray-100 pt-2">
              <p class="mb-1.5 text-[11px] font-semibold uppercase text-gray-400">En curso recientes</p>
              ${listaOfertasActivas || `<p class="text-xs text-gray-400">Sin ofertas en curso.</p>`}
            </div>
          </div>
        </div>`;
    }

    function slideEstadoProyectos(empresaId, tituloSlide) {
      const lista = proyectos.filter((p) => (empresaId ? p.empresa_id === empresaId : true));
      const filas = lista
        .map((p) => {
          const facturado = facturadoPorProyecto(p.id);
          return `
          <tr class="border-b border-gray-100">
            <td class="px-3 py-2 font-medium">${escapeHtml(p.nombre)}</td>
            <td class="px-3 py-2">${formatoFecha(p.fecha_inicio)}</td>
            <td class="px-3 py-2">${formatoFecha(p.fecha_fin_estimada)}</td>
            <td class="px-3 py-2">${p.avance_porcentaje || 0}%</td>
            <td class="px-3 py-2">${formatoMoneda(p.valor_total)}</td>
            <td class="px-3 py-2">${formatoMoneda(facturado)}</td>
            <td class="px-3 py-2 text-gray-500">${escapeHtml(p.notas || "—")}</td>
          </tr>`;
        })
        .join("");

      const ventas = lista.reduce((a, p) => a + facturadoPorProyecto(p.id), 0);
      const costos = lista.reduce((a, p) => a + costosPorProyecto(p.id), 0);
      const valorTotal = lista.reduce((a, p) => a + Number(p.valor_total || 0), 0);
      const margen = valorTotal > 0 ? ((valorTotal - costos) / valorTotal) * 100 : 0;
      const pendientePorFacturar = valorTotal - ventas;

      const kpiMini = (label, valor) => `
        <div class="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-center">
          <p class="text-[11px] font-medium text-gray-500">${label}</p>
          <p class="text-base font-bold text-gray-900">${valor}</p>
        </div>`;

      return `
        <h2 class="mb-4 text-2xl font-bold text-gray-900">${tituloSlide}</h2>
        <div class="overflow-x-auto rounded-xl border border-gray-200">
          <table class="w-full text-left text-xs">
            <thead class="bg-gray-50 text-[11px] uppercase text-gray-500">
              <tr>
                <th class="px-3 py-2">Proyecto</th><th class="px-3 py-2">Inicio</th><th class="px-3 py-2">Fin Est.</th>
                <th class="px-3 py-2">Avance</th><th class="px-3 py-2">Valor Contrato</th><th class="px-3 py-2">Facturado</th><th class="px-3 py-2">Observaciones</th>
              </tr>
            </thead>
            <tbody>${filas || `<tr><td class="px-3 py-4 text-center text-gray-400" colspan="7">Sin proyectos.</td></tr>`}</tbody>
          </table>
        </div>
        <div class="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
          ${kpiMini("Ventas", formatoMoneda(ventas))}
          ${kpiMini("Costos", formatoMoneda(costos))}
          ${kpiMini("Valor Total Contrato", formatoMoneda(valorTotal))}
          ${kpiMini("Margen", `${margen.toFixed(1)}%`)}
          ${kpiMini("Pendiente por Facturar", formatoMoneda(pendientePorFacturar))}
        </div>`;
    }

    function slideSuministros() {
      const filas = suministros
        .map(
          (s) => `
        <tr class="border-b border-gray-100">
          <td class="px-3 py-2 font-medium">${escapeHtml(s.clientes?.nombre || "—")}</td>
          <td class="px-3 py-2">${escapeHtml(s.oferta || "—")}</td>
          <td class="px-3 py-2">${formatoFecha(s.fecha_notificacion)}</td>
          <td class="px-3 py-2">${formatoFecha(s.fecha_recibo_insumos)}</td>
          <td class="px-3 py-2">${formatoFecha(s.fecha_cierre)}</td>
          <td class="px-3 py-2">${formatoMoneda(s.valor_venta)}</td>
          <td class="px-3 py-2">${s.iva_incluido ? "Con IVA" : "Sin IVA"}</td>
        </tr>`
        )
        .join("");
      return `
        <h2 class="mb-4 text-2xl font-bold text-gray-900">Suministros</h2>
        <div class="overflow-x-auto rounded-xl border border-gray-200">
          <table class="w-full text-left text-xs">
            <thead class="bg-gray-50 text-[11px] uppercase text-gray-500">
              <tr>
                <th class="px-3 py-2">Cliente</th><th class="px-3 py-2">Oferta</th><th class="px-3 py-2">Fecha Notificación</th>
                <th class="px-3 py-2">Fecha Recibo Insumos</th><th class="px-3 py-2">Fecha Cierre</th><th class="px-3 py-2">Valor Venta</th><th class="px-3 py-2">IVA</th>
              </tr>
            </thead>
            <tbody>${filas || `<tr><td class="px-3 py-4 text-center text-gray-400" colspan="7">Sin suministros registrados.</td></tr>`}</tbody>
          </table>
        </div>`;
    }

    function slideFacturacionMensual(empresaId, nombreEmpresa) {
      const anioActual = new Date().getFullYear();
      const facturasEmpresa = facturas.filter(
        (f) =>
          f.estado !== "anulada" &&
          (empresaId ? f.proyectos?.empresa_id === empresaId : true) &&
          new Date(f.fecha_emision + "T00:00:00").getFullYear() === anioActual
      );
      let acumulado = 0;
      const filas = Array.from({ length: 12 }, (_, mes) => {
        const totalMes = facturasEmpresa
          .filter((f) => new Date(f.fecha_emision + "T00:00:00").getMonth() === mes)
          .reduce((a, f) => a + Number(f.valor || 0), 0);
        acumulado += totalMes;
        const nombreMes = new Date(anioActual, mes, 1).toLocaleDateString("es-CO", { month: "long" });
        return `
        <tr class="border-b border-gray-100">
          <td class="px-3 py-2 font-medium capitalize">${nombreMes}</td>
          <td class="px-3 py-2">${formatoMoneda(totalMes)}</td>
          <td class="px-3 py-2 font-semibold text-primary">${formatoMoneda(acumulado)}</td>
        </tr>`;
      }).join("");
      return `
        <h2 class="mb-4 text-2xl font-bold text-gray-900">Facturación Mensual ${nombreEmpresa ? "· " + escapeHtml(nombreEmpresa) : ""} (${anioActual})</h2>
        <div class="overflow-x-auto rounded-xl border border-gray-200">
          <table class="w-full max-w-lg text-left text-xs">
            <thead class="bg-gray-50 text-[11px] uppercase text-gray-500">
              <tr><th class="px-3 py-2">Mes</th><th class="px-3 py-2">Facturado</th><th class="px-3 py-2">Acumulado</th></tr>
            </thead>
            <tbody>${filas}</tbody>
          </table>
        </div>`;
    }

    const slides = [
      {
        titulo: "Portada",
        html: `
          <div class="flex h-full flex-col items-center justify-center text-center">
            <h1 class="text-4xl font-bold text-gray-900">Comité de Proyectos</h1>
            <p class="mt-3 text-lg text-gray-500">${new Date().toLocaleDateString("es-CO", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}</p>
          </div>`,
      },
      { titulo: "Mes en Cifras y Críticos", html: slideMesEnCifrasYCriticos() },
      { titulo: "Estado de Proyectos (Consolidado)", html: slideEstadoProyectos(null, "Estado de Proyectos (Consolidado)") },
    ];

    empresas.forEach((e) => {
      slides.push({ titulo: `Proyectos · ${e.nombre}`, html: slideEstadoProyectos(e.id, `Estado de Proyectos · ${escapeHtml(e.nombre)}`) });
    });

    slides.push({ titulo: "Proyección Comercial", html: slideProyeccionComercial() });
    slides.push({ titulo: "Suministros", html: slideSuministros() });

    empresas.forEach((e) => {
      slides.push({ titulo: `Facturación · ${e.nombre}`, html: slideFacturacionMensual(e.id, e.nombre) });
    });
    if (!empresas.length) {
      slides.push({ titulo: "Facturación Mensual", html: slideFacturacionMensual(null, "") });
    }

    return slides;
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
    document.getElementById("modo-comite").classList.remove("hidden");
    document.getElementById("modo-comite").classList.add("flex");
  }

  function cerrarModoComite() {
    document.getElementById("modo-comite").classList.add("hidden");
    document.getElementById("modo-comite").classList.remove("flex");
  }

  document.getElementById("btn-modo-comite").addEventListener("click", abrirModoComite);
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
