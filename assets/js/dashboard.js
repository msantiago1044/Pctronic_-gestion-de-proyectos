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
    ["seccion-resumen-comite", "seccion-proyectos-recientes", "seccion-facturas-pendientes"].forEach((id) => {
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

  let datosGlobales = { proyectos: [], facturas: [], compras: [], gastos: [], comprasSolicitudes: [], vinculos: [], suministros: [], empresas: [] };

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
    ] = await Promise.all([
      window.sb.from("proyectos").select("*, clientes(nombre), empresas(id, nombre)").order("created_at", { ascending: false }),
      window.sb.from("facturas").select("id, valor, estado, fecha_emision, fecha_vencimiento, numero_factura, proyecto_id, proyectos(nombre, empresa_id)"),
      window.sb.from("compras").select("proyecto_id, valor"),
      window.sb.from("gastos").select("proyecto_id, valor_total, fecha, tipo"),
      window.sb.from("compras_solicitudes").select("id, proyecto_id, estado, titulo"),
      window.sb.from("proyecto_contratistas").select("proyecto_id, cortes_pago(valor_neto)"),
      window.sb.from("suministros").select("*, clientes(nombre), empresas(nombre)").order("created_at", { ascending: false }),
      window.sb.from("empresas").select("id, nombre").order("nombre"),
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
    };

    const activos = datosGlobales.proyectos.filter((p) => p.estado === "en_curso");
    const valorEnCurso = activos.reduce((acc, p) => acc + Number(p.valor_total || 0), 0);

    const facturasPendientes = datosGlobales.facturas.filter((f) => ["pendiente", "vencida"].includes(f.estado));
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

    const facturacionMes = datosGlobales.facturas
      .filter((f) => {
        if (!f.fecha_emision || f.estado === "anulada") return false;
        const d = new Date(f.fecha_emision + "T00:00:00");
        return d.getMonth() === mesActual && d.getFullYear() === anioActual;
      })
      .reduce((s, f) => s + Number(f.valor || 0), 0);

    const gastosMes = datosGlobales.gastos
      .filter((g) => {
        if (!g.fecha) return false;
        const d = new Date(g.fecha + "T00:00:00");
        return d.getMonth() === mesActual && d.getFullYear() === anioActual;
      })
      .reduce((s, g) => s + Number(g.valor_total || 0), 0);

    const margenMes = facturacionMes - gastosMes;
    const margenMesPct = facturacionMes > 0 ? ((margenMes / facturacionMes) * 100).toFixed(1) + "%" : "—";
    const criticos = datosGlobales.proyectos.filter(
      (p) => p.estado === "detenido" || (p.estado === "en_curso" && p.fecha_fin_estimada && p.fecha_fin_estimada < hoyStr)
    ).length;
    const comprasPendAprob = datosGlobales.comprasSolicitudes.filter((s) =>
      ["pendiente", "en_comparativo", "presentada"].includes(s.estado)
    ).length;

    const nombreMes = ahora.toLocaleDateString("es-CO", { month: "long", year: "numeric" });
    const subEl = document.getElementById("comite-mes-subtitulo");
    if (subEl) subEl.textContent = `Indicadores consolidados · ${nombreMes}`;

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
    tbodyP.innerHTML = datosGlobales.proyectos.length
      ? datosGlobales.proyectos.slice(0, 6).map(filaProyecto).join("")
      : `<tr><td class="px-5 py-6 text-gray-400" colspan="4">Aún no has creado proyectos. <a class="text-primary font-semibold" href="proyecto-nuevo.html">Crea el primero →</a></td></tr>`;

    tbodyP.addEventListener("click", (e) => {
      const tr = e.target.closest("tr[data-proyecto-id]");
      if (tr) abrirResumenProyecto(tr.dataset.proyectoId);
    });

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
    const { proyectos, facturas, suministros, empresas } = datosGlobales;

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
        (f) => (empresaId ? f.proyectos?.empresa_id === empresaId : true) && new Date(f.fecha_emision + "T00:00:00").getFullYear() === anioActual
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
      { titulo: "Estado de Proyectos", html: slideEstadoProyectos(null, "Estado de Proyectos") },
      { titulo: "Suministros", html: slideSuministros() },
    ];

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
