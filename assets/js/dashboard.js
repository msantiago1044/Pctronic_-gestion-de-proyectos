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
    if (!cont) return;
    cont.innerHTML = TARJETAS_DISPONIBLES.map(
      (t) => `
      <label class="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2">
        <input type="checkbox" class="chk-tarjeta rounded border-gray-300 text-primary focus:ring-primary" data-id="${t.id}" ${preferencias[t.id] ? "checked" : ""} />
        ${escapeHtml(t.label)}
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

  document.getElementById("btn-personalizar")?.addEventListener("click", () => {
    renderModalPersonalizar();
    const modal = document.getElementById("modal-personalizar");
    modal?.classList.remove("hidden");
    modal?.classList.add("flex");
  });
  document.getElementById("btn-cerrar-personalizar")?.addEventListener("click", () => {
    const modal = document.getElementById("modal-personalizar");
    modal?.classList.add("hidden");
    modal?.classList.remove("flex");
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
          <p class="text-lg font-bold text-gray-900 tabular-nums">${valor}</p>
        </div>
      </div>
    </div>`;
  }

  // --------------------------------------------------------------------
  // Formateadores numéricos y de fechas (convención colombiana)
  // --------------------------------------------------------------------
  function fmtM(valor) {
    const n = Number(valor || 0) / 1e6;
    if (!Number.isFinite(n)) return "$0,0 M";
    const sign = n < 0 ? "-" : "";
    const abs = Math.abs(n);
    const [ent, dec] = abs.toFixed(1).split(".");
    const entFmt = ent.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return `${sign}$${entFmt},${dec} M`;
  }

  function fmtMCorto(valor) {
    const n = Number(valor || 0) / 1e6;
    if (!Number.isFinite(n) || n === 0) return "";
    const sign = n < 0 ? "-" : "";
    const abs = Math.abs(n);
    const [ent, dec] = abs.toFixed(abs >= 100 ? 0 : 1).split(".");
    const entFmt = ent.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return dec !== undefined ? `${sign}$${entFmt},${dec}M` : `${sign}$${entFmt}M`;
  }

  function fmtPct(valor, dec = 1) {
    const n = Number(valor);
    if (!Number.isFinite(n)) return "N/A";
    return `${n.toFixed(dec).replace(".", ",")}%`;
  }

  function formatoMonedaCompacta(valor) {
    const n = Number(valor || 0);
    const abs = Math.abs(n);
    const sign = n < 0 ? "-" : "";
    if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1).replace(".0", "")}MM`;
    if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(abs >= 10e6 ? 0 : 1).replace(".0", "")}M`;
    if (abs >= 1e3) return `${sign}$${Math.round(abs / 1e3)}K`;
    return `${sign}$${Math.round(abs)}`;
  }

  function parseDateISO(fechaStr) {
    if (!fechaStr) return null;
    const s = String(fechaStr).trim();
    if (!s) return null;
    const d = new Date(s.length <= 10 ? s + "T00:00:00" : s);
    return isNaN(d.getTime()) ? null : d;
  }

  function fmtFechaCorta(fechaStr) {
    const d = parseDateISO(fechaStr);
    if (!d) return "—";
    return d.toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" }).replace(".", "");
  }

  function isoLocal(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  // --------------------------------------------------------------------
  // Estado global cargado desde Supabase
  // --------------------------------------------------------------------
  let datosGlobales = {
    proyectos: [],
    facturas: [],
    cortesCliente: [],
    facturasUnificadas: [],
    cronograma: [],
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

  // --------------------------------------------------------------------
  // Reglas de negocio compartidas (Panel Principal + Comité 11 slides)
  // --------------------------------------------------------------------
  function montoFactura(f) {
    const v = Number(f?.valor);
    if (Number.isFinite(v) && v > 0) return v;
    const t = Number(f?.total);
    if (Number.isFinite(t) && t > 0) return t;
    const s = Number(f?.subtotal);
    if (Number.isFinite(s) && s > 0) return s;
    return Number(f?.valor || f?.total || f?.subtotal || 0);
  }

  function valorContratoSinIva(p) {
    const vi = Number(p?.valor_ingreso);
    if (Number.isFinite(vi) && vi > 0) return vi;
    const cd = Number(p?.valor_antes_impuestos || 0);
    if (cd > 0) {
      if (p?.tipo_contrato === "aiu") {
        const aiuPct =
          Number(p.administracion_porcentaje || 0) +
          Number(p.imprevistos_porcentaje || 0) +
          Number(p.utilidad_porcentaje || 0);
        return cd * (1 + aiuPct / 100);
      }
      return cd;
    }
    const vt = Number(p?.valor_total || 0);
    if (vt > 0 && p?.tipo_contrato === "iva") {
      const iva = Number(p.iva_porcentaje ?? 19);
      return vt / (1 + iva / 100);
    }
    return vt;
  }

  function valorCorteCliente(corte, proyecto) {
    const vn = Number(corte?.valor_neto);
    if (Number.isFinite(vn) && vn > 0) return vn;
    const tot = Number(corte?.total);
    if (Number.isFinite(tot) && tot > 0) return tot;
    const sub = Number(corte?.subtotal);
    if (Number.isFinite(sub) && sub > 0) return sub;

    const items = Array.isArray(corte?.cortes_cliente_items) ? corte.cortes_cliente_items : [];
    const cd = items.reduce((s, it) => s + Number(it.cantidad || 0) * Number(it.pu_venta_snapshot || 0), 0);
    if (cd > 0) {
      if (proyecto?.tipo_contrato === "aiu") {
        const aiuPct =
          Number(proyecto.administracion_porcentaje || 0) +
          Number(proyecto.imprevistos_porcentaje || 0) +
          Number(proyecto.utilidad_porcentaje || 0);
        return cd * (1 + aiuPct / 100);
      }
      return cd;
    }
    return Number(corte?.valor_recaudado || 0);
  }

  // Combina `facturas` + `cortes_cliente` en ('facturado','pagado') deduplicando
  // vía `corte_id` (y fallback por proyecto_id + numero_factura) para jamás duplicar.
  function unificarFacturacion(facturas, cortesCliente, proyectos) {
    const proyMap = new Map((proyectos || []).map((p) => [p.id, p]));
    const syncedCorteIds = new Set();
    const numFactSet = new Set();
    const lista = [];

    (facturas || []).forEach((f) => {
      if (f.estado === "anulada") return;
      if (f.corte_id) syncedCorteIds.add(f.corte_id);
      const normNum = String(f.numero_factura || "").trim().toLowerCase();
      if (normNum && f.proyecto_id) numFactSet.add(`${f.proyecto_id}|${normNum}`);
      const proy = f.proyectos || proyMap.get(f.proyecto_id) || null;
      lista.push({
        ...f,
        _origen: "factura",
        valor: montoFactura(f),
        proyectos: proy,
        concepto: f.concepto || f.notas || (f.numero_factura ? `Factura ${f.numero_factura}` : proy?.nombre || "Factura"),
      });
    });

    (cortesCliente || []).forEach((c) => {
      if (!["facturado", "pagado"].includes(c.estado)) return;
      if (syncedCorteIds.has(c.id)) return;
      const normNum = String(c.numero_factura || "").trim().toLowerCase();
      if (normNum && c.proyecto_id && numFactSet.has(`${c.proyecto_id}|${normNum}`)) return;

      const proy = proyMap.get(c.proyecto_id) || null;
      const val = valorCorteCliente(c, proy);
      if (val <= 0 && !c.numero_factura) return;

      lista.push({
        id: `corte_${c.id}`,
        _origen: "corte",
        corte_id: c.id,
        proyecto_id: c.proyecto_id,
        proyectos: proy,
        numero_factura: c.numero_factura || `Corte #${c.numero || ""}`.trim(),
        concepto: c.notas || `Corte #${c.numero || ""} · ${proy?.nombre || "Proyecto"}`,
        fecha_emision: c.fecha_factura || c.fecha || null,
        fecha_vencimiento: c.fecha_factura || c.fecha || null,
        estado: c.estado === "pagado" ? "pagada" : "pendiente",
        valor: val,
      });
    });

    return lista;
  }

  function esProyectoServicioMantenimiento(p) {
    const tipos = Array.isArray(p?.tipo_proyecto)
      ? p.tipo_proyecto
      : typeof p?.tipo_proyecto === "string"
        ? [p.tipo_proyecto]
        : [];
    const joined = tipos.join(" ").toLowerCase();
    return joined.includes("mantenimiento") || joined.includes("servicio");
  }

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

  const facturadoPorProyecto = (proyectoId, fuente = datosGlobales.facturasUnificadas) =>
    (fuente || [])
      .filter((f) => f.proyecto_id === proyectoId && f.estado !== "anulada")
      .reduce((a, f) => a + Number(f.valor || 0), 0);

  function calcularPresupuestoProyecto(p, gastado) {
    const items = datosGlobales.presupuestoItems.filter((i) => i.proyecto_id === p.id && i.tipo === "item");
    const ivaFactor = p.iva_materiales ? 1 + Number(p.iva_porcentaje ?? 19) / 100 : 1;
    const baseCost = (it) => Number(it.cantidad || 0) * Number(it.cu_material || 0) * ivaFactor;

    const sumaItems = items.reduce((s, it) => s + baseCost(it), 0);
    const pptoPapel =
      sumaItems > 0
        ? sumaItems
        : Number(p.presupuesto_total || p.costo_directo || p.valor_antes_impuestos || valorContratoSinIva(p) || 0);

    const faltaPapel = Math.max(0, pptoPapel - gastado);

    let faltaReal = faltaPapel;
    const tieneOverride =
      p.falta_real_override !== null &&
      p.falta_real_override !== undefined &&
      p.falta_real_override !== "" &&
      Number.isFinite(Number(p.falta_real_override));

    if (tieneOverride) {
      faltaReal = Math.max(0, Number(p.falta_real_override));
    } else {
      const tieneItemsReales = items.some(
        (it) =>
          it.costo_real_estimado_total !== null &&
          it.costo_real_estimado_total !== undefined &&
          it.costo_real_estimado_total !== "" &&
          Number.isFinite(Number(it.costo_real_estimado_total))
      );
      if (tieneItemsReales) {
        const costoEstimadoReal = items.reduce((s, it) => {
          const valReal =
            it.costo_real_estimado_total !== null &&
            it.costo_real_estimado_total !== undefined &&
            it.costo_real_estimado_total !== "" &&
            Number.isFinite(Number(it.costo_real_estimado_total))
              ? Number(it.costo_real_estimado_total)
              : baseCost(it);
          return s + valReal;
        }, 0);
        faltaReal = Math.max(0, costoEstimadoReal - gastado);
      }
    }

    return {
      pptoPapel,
      faltaPapel,
      faltaReal,
      tieneAjusteReal: Math.round(faltaReal) !== Math.round(faltaPapel),
    };
  }

  function obtenerCierreEstimado(p, actsProyecto) {
    const fechasFin = (actsProyecto || [])
      .map((a) => a.fecha_fin)
      .filter(Boolean)
      .sort();
    if (fechasFin.length > 0) return fechasFin[fechasFin.length - 1];
    return p.fecha_fin_estimada || null;
  }

  function evaluarSemaforo(p, { pptoPapel, gastado, cierreEstimado, ahora, hoyStr }) {
    const av = Math.min(100, Math.max(0, Number(p.avance_porcentaje || 0)));
    const esDetenido = p.estado === "detenido";
    const esVencido = p.estado !== "finalizado" && Boolean(cierreEstimado) && cierreEstimado < hoyStr;
    const sobrecosto = pptoPapel > 0 && gastado > pptoPapel;

    let pctTiempoTranscurrido = null;
    if (p.estado === "en_curso" && p.fecha_inicio && cierreEstimado) {
      const dIni = parseDateISO(p.fecha_inicio);
      const dFin = parseDateISO(cierreEstimado);
      if (dIni && dFin && dFin > dIni) {
        pctTiempoTranscurrido = Math.min(100, Math.max(0, ((ahora - dIni) / (dFin - dIni)) * 100));
      }
    }

    const atrasoGrave = pctTiempoTranscurrido !== null && pctTiempoTranscurrido >= 80 && av < 50;

    if (esDetenido || esVencido || sobrecosto || atrasoGrave) {
      return {
        key: "critico",
        label: "Crítico",
        pill: `<span class="inline-flex items-center rounded-full comite-pill-critico px-2.5 py-0.5 text-[11px] font-bold whitespace-nowrap">Crítico</span>`,
      };
    }

    const dCierre = parseDateISO(cierreEstimado);
    const diasParaCierre = dCierre ? Math.ceil((dCierre - ahora) / 86400000) : null;
    const cercaVencimiento = p.estado !== "finalizado" && diasParaCierre !== null && diasParaCierre <= 15 && av < 90;
    const pptoAlto = pptoPapel > 0 && gastado / pptoPapel >= 0.85 && av < 85;
    const atrasoModerado = pctTiempoTranscurrido !== null && pctTiempoTranscurrido - av >= 20;

    if (p.estado === "pausado" || cercaVencimiento || pptoAlto || atrasoModerado) {
      return {
        key: "seguimiento",
        label: "Seguimiento",
        pill: `<span class="inline-flex items-center rounded-full comite-pill-seguimiento px-2.5 py-0.5 text-[11px] font-bold whitespace-nowrap">Seguimiento</span>`,
      };
    }

    return {
      key: "al_dia",
      label: "Al día",
      pill: `<span class="inline-flex items-center rounded-full comite-pill-aldia px-2.5 py-0.5 text-[11px] font-bold whitespace-nowrap">Al día</span>`,
    };
  }

  function empresaNombrePorId(empresaId, fallbackObj) {
    if (fallbackObj?.nombre) return fallbackObj.nombre;
    return datosGlobales.empresas.find((e) => e.id === empresaId)?.nombre || "Sin empresa";
  }

  function clasificarEmpresaColor(nombre) {
    const n = (nombre || "").toLowerCase();
    if (n.includes("integra")) return { color: "#0B2545", clsBg: "comite-bg-navy", labelCorto: "Grupo Integra", key: "integra" };
    if (n.includes("pctronic")) return { color: "#169AD6", clsBg: "comite-bg-cyan", labelCorto: "Pctronic", key: "pctronic" };
    return { color: "#64748B", clsBg: "bg-slate-500 text-white", labelCorto: nombre || "Global Solutions", key: "otras" };
  }

  function evaluarProyectoCompleto(p, ahora = new Date()) {
    const hoyStr = isoLocal(ahora);
    const acts = datosGlobales.cronograma.filter((a) => a.proyecto_id === p.id);
    const cierreEstimado = obtenerCierreEstimado(p, acts);
    const gastado = costosPorProyecto(p.id);
    const facturado = facturadoPorProyecto(p.id);
    const valorSinIva = valorContratoSinIva(p);
    const valorTotal = Number(p.valor_total || valorSinIva || 0);
    const pendienteFact = Math.max(0, valorSinIva - facturado);
    const ppto = calcularPresupuestoProyecto(p, gastado);
    const sem = evaluarSemaforo(p, {
      pptoPapel: ppto.pptoPapel,
      gastado,
      cierreEstimado,
      ahora,
      hoyStr,
    });

    const hitosPend = acts
      .filter((a) => Boolean(a.es_hito_facturacion) && !a.hito_facturado)
      .sort((a, b) => (a.fecha_fin || "9999").localeCompare(b.fecha_fin || "9999"));

    const cortesPend = datosGlobales.cortesCliente
      .filter((c) => c.proyecto_id === p.id && c.estado === "pendiente")
      .sort((a, b) => (a.fecha || "9999").localeCompare(b.fecha || "9999"));

    const factPend = datosGlobales.facturasUnificadas
      .filter((f) => f.proyecto_id === p.id && ["pendiente", "vencida"].includes(f.estado))
      .sort((a, b) => (a.fecha_vencimiento || a.fecha_emision || "9999").localeCompare(b.fecha_vencimiento || b.fecha_emision || "9999"));

    let proximoHitoTexto = "Al día";
    if (hitosPend[0]) {
      const h = hitosPend[0];
      const nomH = h.nombre || h.titulo || "Hito de facturación";
      const m = Number(h.monto_facturacion_estimado || 0);
      proximoHitoTexto = `${nomH}${m > 0 ? " · " + fmtM(m) : ""}`;
    } else if (p.proximo_hito_cobro) {
      proximoHitoTexto = String(p.proximo_hito_cobro);
    } else if (cortesPend[0]) {
      const vc = valorCorteCliente(cortesPend[0], p);
      proximoHitoTexto = `Corte #${cortesPend[0].numero || ""} pend.${vc > 0 ? " · " + fmtM(vc) : ""}`;
    } else if (factPend[0]) {
      proximoHitoTexto = `${factPend[0].numero_factura || "Factura pend."} · ${fmtM(factPend[0].valor)}`;
    } else if (pendienteFact > 0) {
      proximoHitoTexto = `Por facturar ${fmtM(pendienteFact)}`;
    }

    let proximaFactTexto = "—";
    if (hitosPend[0]) {
      const h = hitosPend[0];
      const m = Number(h.monto_facturacion_estimado || 0);
      const fechaH = h.fecha_fin ? fmtFechaCorta(h.fecha_fin) : h.nombre || h.titulo || "Hito";
      proximaFactTexto = `${fechaH}${m > 0 ? " · " + fmtM(m) : ""}`;
    } else if (p.proxima_facturacion_texto) {
      proximaFactTexto = String(p.proxima_facturacion_texto);
    } else if (cortesPend[0]) {
      const vc = valorCorteCliente(cortesPend[0], p);
      proximaFactTexto = `${fmtFechaCorta(cortesPend[0].fecha)}${vc > 0 ? " · " + fmtM(vc) : ""}`;
    } else if (factPend[0]) {
      proximaFactTexto = `${fmtFechaCorta(factPend[0].fecha_vencimiento || factPend[0].fecha_emision)} · ${fmtM(factPend[0].valor)}`;
    }

    const empNombre = empresaNombrePorId(p.empresa_id, p.empresas);
    const margenBrutoValor = facturado - gastado;
    const margenBrutoPct = facturado > 0 ? (margenBrutoValor / facturado) * 100 : null;
    const margenEsperadoPct = valorSinIva > 0 ? ((valorSinIva - ppto.pptoPapel) / valorSinIva) * 100 : null;

    return {
      p,
      empNombre,
      valorSinIva,
      valorTotal,
      pptoPapel: ppto.pptoPapel,
      gastado,
      faltaPapel: ppto.faltaPapel,
      faltaReal: ppto.faltaReal,
      tieneAjusteReal: ppto.tieneAjusteReal,
      facturado,
      pendienteFact,
      margenBrutoValor,
      margenBrutoPct,
      margenEsperadoPct,
      cierreEstimado,
      sem,
      proximoHitoTexto,
      proximaFactTexto,
      hitosPend,
      cortesPend,
      factPend,
    };
  }

  // --------------------------------------------------------------------
  // Modal resumen de proyecto (Panel principal)
  // --------------------------------------------------------------------
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

    const ev = evaluarProyectoCompleto(p);
    const margenPct = ev.margenBrutoPct !== null ? fmtPct(ev.margenBrutoPct) : "N/A";
    const sols = datosGlobales.comprasSolicitudes.filter((s) => s.proyecto_id === p.id);
    const solsPend = sols.filter((s) => ["pendiente", "en_comparativo", "presentada"].includes(s.estado)).length;
    const solsOrd = sols.filter((s) => ["aprobada", "ordenada"].includes(s.estado)).length;
    const estadoCompras = sols.length ? `${solsPend} pend. · ${solsOrd} aprob./ord.` : "Sin solicitudes";

    document.getElementById("mpr-titulo").textContent = p.nombre || "Proyecto";
    document.getElementById("mpr-estado").innerHTML = `${badgeHtml(ESTADOS_PROYECTO, p.estado)} ${ev.sem.pill}`;
    document.getElementById("mpr-subtitulo").textContent =
      [p.clientes?.nombre, p.empresas?.nombre, p.ciudad].filter(Boolean).join(" · ") || "Sin cliente asignado";
    document.getElementById("mpr-link-detalle").href = `proyecto-detalle.html?id=${encodeURIComponent(p.id)}`;

    const box = (lbl, val, sub = "", cls = "text-gray-900") => `
      <div class="rounded-xl border border-gray-200 bg-gray-50/70 p-3.5">
        <p class="text-[11px] font-semibold uppercase text-gray-500">${lbl}</p>
        <p class="mt-1 text-base font-bold tabular-nums ${cls}">${val}</p>
        ${sub ? `<p class="mt-0.5 text-[11px] text-gray-400">${sub}</p>` : ""}
      </div>`;

    const av = Number(p.avance_porcentaje || 0);
    document.getElementById("mpr-kpis").innerHTML =
      box("Valor contrato (s/IVA)", formatoMoneda(ev.valorSinIva), p.tipo_contrato === "aiu" ? "Con AIU, antes de IVA" : "IVA pleno") +
      box("Avance físico", `${av}%`, `<div class="barra-progreso mt-1"><span style="width:${av}%"></span></div>`) +
      box("Facturado", formatoMoneda(ev.facturado), "Facturas y cortes facturados") +
      box("Gastado / Falta real", formatoMoneda(ev.gastado), `Falta real: ${fmtM(ev.faltaReal)}`) +
      box(
        "Margen bruto actual",
        formatoMoneda(ev.margenBrutoValor),
        `Margen: ${margenPct}`,
        ev.margenBrutoValor > 0 ? "text-emerald-600" : ev.margenBrutoValor < 0 ? "text-red-600" : "text-gray-900"
      ) +
      box("Estado compras", `<span class="text-sm">${escapeHtml(estadoCompras)}</span>`, `${sols.length} solicitud${sols.length === 1 ? "" : "es"}`);

    const modal = document.getElementById("modal-proyecto-resumen");
    modal.classList.remove("hidden");
    modal.classList.add("flex");
  }

  document.getElementById("btn-cerrar-proyecto-resumen")?.addEventListener("click", cerrarModalProyectoResumen);
  document.getElementById("btn-cerrar-proyecto-resumen-2")?.addEventListener("click", cerrarModalProyectoResumen);

  // --------------------------------------------------------------------
  // Filtrado por empresa (Panel principal)
  // --------------------------------------------------------------------
  function obtenerDatosFiltrados(empresaId) {
    if (!empresaId) {
      return {
        proyectos: datosGlobales.proyectos,
        facturas: datosGlobales.facturasUnificadas,
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
      facturas: datosGlobales.facturasUnificadas.filter((f) => f.proyectos?.empresa_id === empresaId || proyectoIds.has(f.proyecto_id)),
      compras: datosGlobales.compras.filter((c) => proyectoIds.has(c.proyecto_id)),
      gastos: datosGlobales.gastos.filter((g) => proyectoIds.has(g.proyecto_id)),
      comprasSolicitudes: datosGlobales.comprasSolicitudes.filter((s) => proyectoIds.has(s.proyecto_id)),
      crmOportunidades: datosGlobales.crmOportunidades.filter((o) => o.empresa_id === empresaId),
      crmOfertas: datosGlobales.crmOfertas.filter((o) => o.empresa_id === empresaId),
      suministros: datosGlobales.suministros.filter((s) => s.empresa_id === empresaId),
      empresaActual: datosGlobales.empresas.find((e) => e.id === empresaId) || null,
    };
  }

  // --------------------------------------------------------------------
  // Gráficas del Panel Principal
  // --------------------------------------------------------------------
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
          const fd = parseDateISO(f.fecha_emision);
          return fd && fd.getFullYear() === anio && fd.getMonth() === mes;
        })
        .reduce((s, f) => s + Number(f.valor || 0), 0);

      const costos = fuenteCostos
        .filter((c) => {
          if (!c.fecha) return false;
          const cd = parseDateISO(c.fecha);
          return cd && cd.getFullYear() === anio && cd.getMonth() === mes;
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
          <span class="text-[11px] font-semibold capitalize text-gray-600">${escapeHtml(m.label)}</span>
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

    const barraDistribucion =
      totalProy > 0
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

  // --------------------------------------------------------------------
  // Render Panel Principal (sincronizado con Semáforo + Falta Real vs. Papel + Cortes deduplicados)
  // --------------------------------------------------------------------
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

    const ahora = new Date();
    const mesActual = ahora.getMonth();
    const anioActual = ahora.getFullYear();

    const evaluados = proyectos.map((p) => evaluarProyectoCompleto(p, ahora));
    const activos = proyectos.filter((p) => p.estado === "en_curso");
    const valorEnCurso = activos.reduce((acc, p) => acc + valorContratoSinIva(p), 0);

    const facturasPendientes = facturas.filter((f) => ["pendiente", "vencida"].includes(f.estado));
    const totalPendiente = facturasPendientes.reduce((acc, f) => acc + Number(f.valor || 0), 0);

    document.getElementById("kpi-cards").innerHTML =
      kpiCard("kpi-proyectos-activos", "folder_open", "Proyectos Activos", activos.length, "bg-blue-100 text-primary") +
      kpiCard("kpi-valor-ejecucion", "payments", "Valor en Ejecución (s/IVA)", formatoMoneda(valorEnCurso), "bg-green-100 text-green-700") +
      kpiCard("kpi-facturas-pendientes", "receipt_long", "Facturas / Cortes Pendientes", facturasPendientes.length, "bg-amber-100 text-amber-700") +
      kpiCard("kpi-por-cobrar", "account_balance_wallet", "Por Cobrar", formatoMoneda(totalPendiente), "bg-red-100 text-red-700");

    // Resumen Ejecutivo · Mes en cifras (6 tarjetas, incluyendo Falta por gastar Real vs. Papel)
    const facturacionMes = facturas
      .filter((f) => {
        if (!f.fecha_emision || f.estado === "anulada") return false;
        const d = parseDateISO(f.fecha_emision);
        return d && d.getMonth() === mesActual && d.getFullYear() === anioActual;
      })
      .reduce((s, f) => s + Number(f.valor || 0), 0);

    const gastosMes = gastos
      .filter((g) => {
        if (!g.fecha) return false;
        const d = parseDateISO(g.fecha);
        return d && d.getMonth() === mesActual && d.getFullYear() === anioActual;
      })
      .reduce((s, g) => s + Number(g.valor_total || 0), 0);

    const margenMes = facturacionMes - gastosMes;
    const margenMesPct = facturacionMes > 0 ? fmtPct((margenMes / facturacionMes) * 100) : "—";
    const criticos = evaluados.filter((e) => e.sem.key === "critico").length;
    const seguimiento = evaluados.filter((e) => e.sem.key === "seguimiento").length;
    const comprasPendAprob = comprasSolicitudes.filter((s) =>
      ["pendiente", "en_comparativo", "presentada"].includes(s.estado)
    ).length;

    const activosNoCancelados = evaluados.filter((e) => e.p.estado !== "cancelado");
    const faltaRealTotal = activosNoCancelados.reduce((s, e) => s + e.faltaReal, 0);
    const faltaPapelTotal = activosNoCancelados.reduce((s, e) => s + e.faltaPapel, 0);
    const hayDiferenciaRealPapel = Math.round(faltaRealTotal) !== Math.round(faltaPapelTotal);

    const nombreMes = ahora.toLocaleDateString("es-CO", { month: "long", year: "numeric" });
    const subEl = document.getElementById("comite-mes-subtitulo");
    if (subEl) {
      subEl.textContent = empresaActual
        ? `Indicadores · ${empresaActual.nombre} · ${nombreMes}`
        : `Indicadores consolidados · ${nombreMes}`;
    }

    const cardComite = (lbl, val, sub, cls = "text-gray-900", extraBoxCls = "border-gray-100 bg-gray-50/70") => `
      <div class="rounded-lg border ${extraBoxCls} p-3.5">
        <p class="text-[11px] font-semibold uppercase text-gray-500">${lbl}</p>
        <p class="mt-1 text-lg font-bold tabular-nums ${cls}">${val}</p>
        <p class="mt-0.5 text-[11px] text-gray-500">${sub}</p>
      </div>`;

    const cardFaltaReal = `
      <div class="rounded-lg comite-bg-cyan p-3.5 shadow-sm text-white" title="Real: ${escapeHtml(formatoMoneda(faltaRealTotal))} · Papel: ${escapeHtml(formatoMoneda(faltaPapelTotal))}">
        <p class="text-[11px] font-semibold uppercase tracking-wide text-white/90">Falta por gastar Real</p>
        <p class="mt-1 text-lg font-bold tabular-nums text-white">${fmtM(faltaRealTotal)}</p>
        <p class="mt-0.5 text-[11px] text-white/90">
          En papel: <span class="${hayDiferenciaRealPapel ? "line-through opacity-80" : ""}">${fmtM(faltaPapelTotal)}</span>
        </p>
      </div>`;

    document.getElementById("resumen-comite-grid").innerHTML =
      cardComite("Facturación del mes", formatoMoneda(facturacionMes), "Facturas + cortes facturados") +
      cardComite("Costos / Gastos del mes", formatoMoneda(gastosMes), "Gastos registrados") +
      cardComite(
        "Margen bruto estimado",
        formatoMoneda(margenMes),
        `Margen mes: ${margenMesPct}`,
        margenMes > 0 ? "text-emerald-600" : margenMes < 0 ? "text-red-600" : "text-gray-900"
      ) +
      cardFaltaReal +
      cardComite(
        "Semáforo crítico / seguimiento",
        `${criticos} <span class="text-xs font-semibold text-amber-600">/ ${seguimiento} seg.</span>`,
        "Calculado con cronograma y ppto.",
        criticos > 0 ? "text-rose-600" : "text-emerald-600"
      ) +
      cardComite(
        "Compras por aprobar",
        comprasPendAprob,
        "Solicitudes pendientes",
        comprasPendAprob > 0 ? "text-amber-600" : "text-gray-900"
      );

    // Gráficas Ejecutivas
    renderGraficaFacturacionGastos(facturas, gastos, compras);
    renderGraficaComercialSalud(proyectos, crmOportunidades, crmOfertas);

    const filaProyecto = (ev) => {
      const p = ev.p;
      return `
      <tr class="border-b border-gray-50 last:border-0 hover:bg-blue-50/40 cursor-pointer transition-colors" data-proyecto-id="${escapeHtml(p.id)}">
        <td class="px-5 py-3">
          <span class="font-medium text-gray-900 hover:text-primary">${escapeHtml(p.nombre)}</span>
          <p class="text-[11px] text-gray-400">${escapeHtml(ev.empNombre)}</p>
        </td>
        <td class="px-5 py-3">${badgeHtml(ESTADOS_PROYECTO, p.estado)}</td>
        <td class="px-5 py-3">${ev.sem.pill}</td>
        <td class="px-5 py-3">
          <div class="flex items-center gap-2">
            <div class="barra-progreso w-24"><span style="width:${Math.min(100, Math.max(0, Number(p.avance_porcentaje || 0)))}%"></span></div>
            <span class="text-xs text-gray-500 tabular-nums">${Number(p.avance_porcentaje || 0)}%</span>
          </div>
        </td>
        <td class="px-5 py-3 font-medium tabular-nums">${formatoMoneda(p.valor_total)}</td>
      </tr>`;
    };

    const tbodyP = document.getElementById("tabla-proyectos-recientes");
    tbodyP.innerHTML = evaluados.length
      ? evaluados.slice(0, 6).map(filaProyecto).join("")
      : `<tr><td class="px-5 py-6 text-gray-400" colspan="5">${
          empresaActual
            ? "No hay proyectos para esta empresa."
            : 'Aún no has creado proyectos. <a class="text-primary font-semibold" href="proyecto-nuevo.html">Crea el primero →</a>'
        }</td></tr>`;

    const filaFactura = (f) => `
      <tr class="border-b border-gray-50 last:border-0 hover:bg-gray-50">
        <td class="px-5 py-3">
          <a href="proyecto-detalle.html?id=${encodeURIComponent(f.proyecto_id || "")}" class="font-medium text-gray-900 hover:text-primary">${escapeHtml(f.proyectos?.nombre || "—")}</a>
        </td>
        <td class="px-5 py-3">${escapeHtml(f.numero_factura || "—")}</td>
        <td class="px-5 py-3">${formatoFecha(f.fecha_vencimiento || f.fecha_emision)}</td>
        <td class="px-5 py-3 font-medium tabular-nums">${formatoMoneda(f.valor)}</td>
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

  // --------------------------------------------------------------------
  // Carga defensiva de datos desde Supabase (sin fallar si falta una migración)
  // --------------------------------------------------------------------
  async function consultaOpcional(fn, fallback = []) {
    try {
      const res = await fn();
      if (res && !res.error) return res.data || fallback;
      if (res?.error) console.warn("Consulta opcional omitida:", res.error.message || res.error);
      return fallback;
    } catch (err) {
      console.warn("Consulta opcional omitida:", err?.message || err);
      return fallback;
    }
  }

  try {
    if (typeof window.sb?.rpc === "function") {
      Promise.resolve(window.sb.rpc("rpc_dashboard_resumen"))
        .then((res) => {
          if (res && !res.error && res.data) {
            datosGlobales.resumenRpc = res.data;
          }
        })
        .catch(() => {});
    }

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
      cortesCliente,
      cronograma,
      crmOportunidades,
      crmOfertas,
    ] = await Promise.all([
      window.sb.from("proyectos").select("*, clientes(nombre), empresas(id, nombre, logo_url)").order("created_at", { ascending: false }),
      window.sb.from("facturas").select("*, proyectos(id, nombre, empresa_id)"),
      window.sb.from("compras").select("proyecto_id, valor, fecha"),
      window.sb.from("gastos").select("proyecto_id, valor_total, fecha, tipo"),
      window.sb.from("compras_solicitudes").select("id, proyecto_id, estado, titulo"),
      window.sb.from("proyecto_contratistas").select("proyecto_id, cortes_pago(valor_neto)"),
      window.sb.from("presupuesto_items").select("*"),
      window.sb.from("suministros").select("*, clientes(nombre), empresas(id, nombre)").order("created_at", { ascending: false }),
      window.sb.from("empresas").select("id, nombre, logo_url").order("nombre"),
      consultaOpcional(async () => {
        const r = await window.sb
          .from("cortes_cliente")
          .select("*, cortes_cliente_items(cantidad, pu_venta_snapshot)")
          .order("fecha", { ascending: false });
        if (!r.error) return r;
        return window.sb.from("cortes_cliente").select("*").order("fecha", { ascending: false });
      }),
      consultaOpcional(() => window.sb.from("proyecto_cronograma").select("*").order("orden", { ascending: true })),
      consultaOpcional(() => window.sb.from("crm_oportunidades").select("id, titulo, etapa, valor_estimado, probabilidad, empresa_id, created_at, updated_at")),
      consultaOpcional(() => window.sb.from("crm_ofertas_preventa").select("id, titulo, estado, prioridad, empresa_id, oportunidad_id, created_at").order("created_at", { ascending: false })),
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

    const proyectosLista = proyectos || [];
    const facturasLista = facturasTodas || [];
    const cortesLista = cortesCliente || [];

    datosGlobales = {
      proyectos: proyectosLista,
      facturas: facturasLista,
      cortesCliente: cortesLista,
      facturasUnificadas: unificarFacturacion(facturasLista, cortesLista, proyectosLista),
      cronograma: cronograma || [],
      compras: compras || [],
      gastos: gastos || [],
      comprasSolicitudes: comprasSolicitudes || [],
      vinculos: vinculos || [],
      presupuestoItems: presupuestoItems || [],
      suministros: suministros || [],
      empresas: empresas || [],
      crmOportunidades: crmOportunidades || [],
      crmOfertas: crmOfertas || [],
    };

    const selEmpresa = document.getElementById("filtro-empresa-dashboard");
    if (selEmpresa) {
      selEmpresa.innerHTML =
        `<option value="">Todas las empresas</option>` +
        datosGlobales.empresas.map((e) => `<option value="${escapeHtml(e.id)}">${escapeHtml(e.nombre)}</option>`).join("");
    }

    renderDashboard();
  } catch (error) {
    manejarError(error, "No se pudo cargar el panel principal");
  }

  // --------------------------------------------------------------------
  // MODO COMITÉ DE PROYECTOS — Nuevo Formato Ejecutivo de 11 Diapositivas
  // (Basado en Comité de Proyectos · 17 de noviembre 2026)
  // --------------------------------------------------------------------
  let comiteSlideActual = 0;
  let comiteSlides = [];
  let ingresosPeriodo = "7d"; // "7d" | "15d" | "mes"

  function construirSlidesComite() {
    const {
      proyectos,
      facturasUnificadas,
      cortesCliente,
      cronograma,
      suministros,
      empresas,
    } = datosGlobales;

    const ahora = new Date();
    const mesActual = ahora.getMonth();
    const anioActual = ahora.getFullYear();
    const hoyStr = isoLocal(ahora);
    const fechaComite = ahora.toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });
    const nombreMes = ahora.toLocaleDateString("es-CO", { month: "long" });
    const nombreMesCap = nombreMes.charAt(0).toUpperCase() + nombreMes.slice(1);
    const nombreMesUpper = nombreMes.toUpperCase();

    const enMesActual = (fechaStr) => {
      const d = parseDateISO(fechaStr);
      return Boolean(d && d.getMonth() === mesActual && d.getFullYear() === anioActual);
    };

    const badgeEmpresa = (nombre) => {
      const info = clasificarEmpresaColor(nombre);
      return `<span class="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-[11px] font-semibold comite-text-navy whitespace-nowrap">
        <span class="h-2 w-2 rounded-full shrink-0" style="background:${info.color}"></span>
        ${escapeHtml(nombre)}
      </span>`;
    };

    const slideChrome = (num, eyebrow, titulo, subtitulo, bodyHtml, headerExtraHtml = "") => `
      <div class="comite-slide-card rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-7 py-4 bg-white">
          <div class="flex items-center gap-3 min-w-0">
            <span class="h-9 w-1.5 rounded-full comite-bg-cyan shrink-0"></span>
            <div class="min-w-0">
              ${eyebrow ? `<p class="text-[10px] font-bold uppercase tracking-widest comite-text-cyan">${eyebrow}</p>` : ""}
              <h2 class="text-xl font-bold tracking-tight comite-text-navy leading-tight">${titulo}</h2>
              ${subtitulo ? `<p class="text-xs text-slate-500 mt-0.5">${subtitulo}</p>` : ""}
            </div>
          </div>
          <div class="flex flex-wrap items-center gap-2.5">
            ${headerExtraHtml}
            <div class="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
              <img src="assets/img/favicon.svg" alt="Pctronic" class="h-4 w-4" />
              <span class="text-[10px] font-bold tracking-wider comite-text-navy uppercase">Pctronic · Grupo Integra</span>
            </div>
          </div>
        </div>
        <div class="flex-1 comite-bg-canvas px-7 py-5 space-y-5">
          ${bodyHtml}
        </div>
        <div class="flex items-center justify-between border-t border-slate-200 bg-white px-7 py-3 text-[11px] text-slate-500">
          <span>Comité de Proyectos · ${escapeHtml(fechaComite)} · Cifras en millones de pesos (COP)</span>
          <span class="inline-flex items-center justify-center rounded-md comite-bg-navy px-2.5 py-0.5 font-bold text-white tabular-nums">${num}</span>
        </div>
      </div>`;

    // ------------------------------------------------------------------
    // Pre-cálculos consolidados (100% datos reales de Supabase)
    // ------------------------------------------------------------------
    const proyectosActivosTodos = proyectos.filter((p) => p.estado !== "cancelado");
    const todosEvaluados = proyectosActivosTodos.map((p) => evaluarProyectoCompleto(p, ahora));

    const proyectosMantenimientoEval = todosEvaluados.filter((e) => esProyectoServicioMantenimiento(e.p));
    const proyectosGrandesEval = todosEvaluados.filter((e) => !esProyectoServicioMantenimiento(e.p));
    // Si todos los proyectos del entorno fueran mantenimientos, mostramos todos en Slides 04-07 para no dejar tablas vacías.
    const proyectosEvaluados = proyectosGrandesEval.length > 0 ? proyectosGrandesEval : todosEvaluados;

    // Órdenes de Servicios y Mantenimientos (proyectos mantenimiento/servicio + suministros)
    const ordenesServicios = [
      ...proyectosMantenimientoEval.map((e) => {
        const factMesProy = facturasUnificadas
          .filter((f) => f.proyecto_id === e.p.id && enMesActual(f.fecha_emision))
          .reduce((s, f) => s + Number(f.valor || 0), 0);
        return {
          nombre: e.p.nombre || "Servicio / Mantenimiento",
          estado: (ESTADOS_PROYECTO[e.p.estado] || {}).label || e.p.estado || "En curso",
          estadoKey: e.p.estado,
          coordinador: e.p.director_proyecto || e.p.comercial_responsable || "—",
          ocContrato: e.p.numero_contrato || e.p.numero_cotizacion || "—",
          avance: Number(e.p.avance_porcentaje || 0),
          valorSinIva: e.valorSinIva,
          facturadoFecha: e.facturado,
          facturadoMes: factMesProy,
          pendiente: e.pendienteFact,
          gestion: e.p.notas || e.proximoHitoTexto || "—",
        };
      }),
      ...suministros
        .filter((s) => s.estado !== "cancelado")
        .map((s) => {
          const bruto = Number(s.valor_venta || 0);
          const valorSinIva = s.iva_incluido ? bruto / 1.19 : bruto;
          const esCerrado = s.estado === "cerrado";
          const facturadoFecha = esCerrado ? valorSinIva : 0;
          const facturadoMes = esCerrado && enMesActual(s.fecha_cierre || s.created_at) ? valorSinIva : 0;
          const pendiente = s.estado === "en_curso" ? valorSinIva : 0;
          return {
            nombre: s.oferta || "Orden de suministro / servicio",
            estado: esCerrado ? "Cerrado" : "En curso",
            estadoKey: s.estado,
            coordinador: s.clientes?.nombre || "—",
            ocContrato: s.empresas?.nombre || empresaNombrePorId(s.empresa_id) || "—",
            avance: esCerrado ? 100 : 50,
            valorSinIva,
            facturadoFecha,
            facturadoMes,
            pendiente,
            gestion: s.notas || (esCerrado ? "Entregado / cerrado" : "En ejecución"),
          };
        }),
    ];

    const servValorTotalSinIva = ordenesServicios.reduce((s, o) => s + o.valorSinIva, 0);
    const servFacturadoMes = ordenesServicios.reduce((s, o) => s + o.facturadoMes, 0);
    const servPendienteTotal = ordenesServicios.reduce((s, o) => s + o.pendiente, 0);

    // Totales de proyectos (con AIU, antes de IVA)
    const valorContratosTotal = proyectosEvaluados.reduce((s, e) => s + e.valorSinIva, 0);
    const porFacturarTotal = proyectosEvaluados.reduce((s, e) => s + e.pendienteFact, 0);
    const faltaPapelTotal = proyectosEvaluados.reduce((s, e) => s + e.faltaPapel, 0);
    const faltaRealTotal = proyectosEvaluados.reduce((s, e) => s + e.faltaReal, 0);

    // Facturación del mes y anual (unificada y deduplicada)
    const proyMap = new Map(proyectos.map((p) => [p.id, p]));
    const efectuadasMesLista = facturasUnificadas
      .filter((f) => enMesActual(f.fecha_emision))
      .map((f) => {
        const proy = f.proyectos || proyMap.get(f.proyecto_id);
        const empId = proy?.empresa_id;
        return {
          empresaId: empId,
          empresaNombre: empresaNombrePorId(empId, proy?.empresas),
          concepto: `${proy?.nombre || "Proyecto"}${f.numero_factura ? " · " + f.numero_factura : ""}`,
          valor: Number(f.valor || 0),
          fecha: f.fecha_emision,
        };
      });

    // Facturación esperada del mes: hitos de cronograma del mes + cortes pendientes del mes + facturas del mes sin hito duplicado
    const esperadasMesLista = [];
    const proysConHitoMes = new Set();

    cronograma.forEach((act) => {
      if (!act.es_hito_facturacion || !enMesActual(act.fecha_fin)) return;
      const monto = Number(act.monto_facturacion_estimado || 0);
      if (monto <= 0) return;
      const proy = proyMap.get(act.proyecto_id);
      if (!proy || proy.estado === "cancelado") return;
      proysConHitoMes.add(proy.id);
      esperadasMesLista.push({
        empresaId: proy.empresa_id,
        empresaNombre: empresaNombrePorId(proy.empresa_id, proy.empresas),
        concepto: `${proy.nombre} · ${act.nombre || act.titulo || "Hito de facturación"}`,
        valor: monto,
        fecha: act.fecha_fin,
      });
    });

    cortesCliente.forEach((c) => {
      if (c.estado !== "pendiente" || !enMesActual(c.fecha)) return;
      const proy = proyMap.get(c.proyecto_id);
      if (!proy || proy.estado === "cancelado") return;
      if (proysConHitoMes.has(proy.id)) return;
      const vc = valorCorteCliente(c, proy);
      if (vc <= 0) return;
      esperadasMesLista.push({
        empresaId: proy.empresa_id,
        empresaNombre: empresaNombrePorId(proy.empresa_id, proy.empresas),
        concepto: `${proy.nombre} · Corte #${c.numero || ""} (pendiente)`,
        valor: vc,
        fecha: c.fecha,
      });
    });

    facturasUnificadas.forEach((f) => {
      if (!enMesActual(f.fecha_emision) && !enMesActual(f.fecha_vencimiento)) return;
      const proy = f.proyectos || proyMap.get(f.proyecto_id);
      if (proy && proysConHitoMes.has(proy.id)) return;
      esperadasMesLista.push({
        empresaId: proy?.empresa_id,
        empresaNombre: empresaNombrePorId(proy?.empresa_id, proy?.empresas),
        concepto: `${proy?.nombre || "Proyecto"}${f.numero_factura ? " · " + f.numero_factura : ""}`,
        valor: Number(f.valor || 0),
        fecha: f.fecha_emision || f.fecha_vencimiento,
      });
    });

    const esperadaMes = esperadasMesLista.reduce((s, x) => s + x.valor, 0);
    const facturadoMes = efectuadasMesLista.reduce((s, x) => s + x.valor, 0);
    const cumplimientoMesPct = esperadaMes > 0 ? (facturadoMes / esperadaMes) * 100 : facturadoMes > 0 ? 100 : 0;

    const facturadoAnio = facturasUnificadas
      .filter((f) => {
        const d = parseDateISO(f.fecha_emision);
        return d && d.getFullYear() === anioActual;
      })
      .reduce((s, f) => s + Number(f.valor || 0), 0);

    // ------------------------------------------------------------------
    // SLIDE 01 — Portada
    // ------------------------------------------------------------------
    const slide01 = `
      <div class="comite-slide-card rounded-2xl comite-bg-navy text-white shadow-xl overflow-hidden flex flex-col justify-between p-10 sm:p-14 relative">
        <!-- Gráfico decorativo de red corporativa (SVG inline) -->
        <svg class="pointer-events-none absolute right-0 top-0 h-full w-1/2 opacity-20" viewBox="0 0 480 600" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <g stroke="#169AD6" stroke-width="1.5">
            <line x1="120" y1="80" x2="290" y2="140" />
            <line x1="290" y1="140" x2="410" y2="90" />
            <line x1="290" y1="140" x2="360" y2="270" />
            <line x1="120" y1="80" x2="180" y2="250" />
            <line x1="180" y1="250" x2="360" y2="270" />
            <line x1="180" y1="250" x2="110" y2="410" />
            <line x1="360" y1="270" x2="430" y2="390" />
            <line x1="360" y1="270" x2="250" y2="440" />
            <line x1="110" y1="410" x2="250" y2="440" />
            <line x1="250" y1="440" x2="430" y2="390" />
            <line x1="250" y1="440" x2="330" y2="540" />
            <line x1="410" y1="90" x2="460" y2="220" />
            <line x1="460" y1="220" x2="360" y2="270" />
          </g>
          <g fill="#169AD6">
            <circle cx="120" cy="80" r="6" />
            <circle cx="290" cy="140" r="9" />
            <circle cx="410" cy="90" r="5" />
            <circle cx="180" cy="250" r="7" />
            <circle cx="360" cy="270" r="11" fill="#FFFFFF" />
            <circle cx="460" cy="220" r="5" />
            <circle cx="110" cy="410" r="6" />
            <circle cx="250" cy="440" r="8" />
            <circle cx="430" cy="390" r="6" />
            <circle cx="330" cy="540" r="5" />
          </g>
        </svg>

        <div class="relative z-10 flex items-center justify-between">
          <div class="inline-flex items-center gap-3 rounded-full border border-white/20 bg-white/10 px-4 py-2">
            <img src="assets/img/favicon.svg" alt="Pctronic" class="h-6 w-6 rounded bg-white p-0.5" />
            <span class="text-xs font-bold tracking-widest uppercase text-white">PCTRONIC · GRUPO INTEGRA</span>
          </div>
          <span class="text-xs font-semibold uppercase tracking-widest text-white/60">Informe Ejecutivo</span>
        </div>

        <div class="relative z-10 my-auto py-12 max-w-2xl">
          <div class="h-1.5 w-20 rounded-full comite-bg-cyan mb-7"></div>
          <h1 class="text-4xl sm:text-6xl font-bold tracking-tight leading-tight text-white">Comité de Proyectos</h1>
          <p class="mt-5 text-base sm:text-xl text-slate-200 leading-relaxed max-w-xl">
            Estado de proyectos, presupuesto, servicios y facturación consolidada
          </p>
          <div class="mt-9">
            <span class="inline-flex items-center gap-2 rounded-full comite-bg-cyan px-6 py-2.5 text-sm font-bold text-white shadow-lg">
              <span class="material-symbols-outlined text-[18px]" aria-hidden="true">calendar_today</span>
              ${escapeHtml(fechaComite)}
            </span>
          </div>
        </div>

        <div class="relative z-10 flex items-center justify-between border-t border-white/15 pt-5 text-xs text-slate-300">
          <span>Pctronic Seguridad Electrónica · Grupo Integra · Cifras en millones de pesos (COP)</span>
          <span class="inline-flex items-center justify-center rounded-md bg-white/15 px-3 py-1 font-bold text-white tabular-nums">01</span>
        </div>
      </div>`;

    // ------------------------------------------------------------------
    // SLIDE 02 — Resumen ejecutivo · El mes en cifras
    // ------------------------------------------------------------------
    const cntAlDia = proyectosEvaluados.filter((x) => x.sem.key === "al_dia").length;
    const cntSeg = proyectosEvaluados.filter((x) => x.sem.key === "seguimiento").length;
    const cntCrit = proyectosEvaluados.filter((x) => x.sem.key === "critico").length;
    const totSem = Math.max(1, proyectosEvaluados.length);
    const pctAlDia = Math.round((cntAlDia / totSem) * 100);
    const pctSeg = Math.round((cntSeg / totSem) * 100);
    const pctCrit = Math.max(0, 100 - pctAlDia - pctSeg);

    const kpiSlide02 = (lbl, val, sub, exactVal, dark = false) =>
      dark
        ? `<div class="rounded-2xl comite-bg-navy p-5 shadow-sm flex flex-col justify-between" title="${escapeHtml(exactVal)}">
            <p class="text-[11px] font-bold uppercase tracking-wider text-sky-200">${lbl}</p>
            <p class="mt-2 text-2xl sm:text-3xl font-bold tabular-nums text-white">${val}</p>
            <p class="mt-2 text-[11px] text-slate-300">${sub}</p>
          </div>`
        : `<div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex flex-col justify-between" title="${escapeHtml(exactVal)}">
            <p class="text-[11px] font-bold uppercase tracking-wider text-slate-400">${lbl}</p>
            <p class="mt-2 text-2xl sm:text-3xl font-bold tabular-nums comite-text-navy">${val}</p>
            <p class="mt-2 text-[11px] text-slate-500">${sub}</p>
          </div>`;

    const slide02 = slideChrome(
      "02",
      "RESUMEN EJECUTIVO",
      "El mes en cifras",
      `Consolidado general · ${nombreMesCap} ${anioActual}`,
      `
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        ${kpiSlide02("VALOR DE CONTRATOS", fmtM(valorContratosTotal), `${proyectosEvaluados.length} proyectos · con AIU, antes de IVA`, formatoMoneda(valorContratosTotal))}
        ${kpiSlide02("POR FACTURAR", fmtM(porFacturarTotal), "Pendiente en proyectos", formatoMoneda(porFacturarTotal))}
        ${kpiSlide02(`FACTURADO ${nombreMesUpper}`, fmtM(facturadoMes), `${fmtPct(cumplimientoMesPct)} de ${fmtM(esperadaMes)} esperados`, formatoMoneda(facturadoMes))}
        ${kpiSlide02(`ACUMULADO ${anioActual}`, fmtM(facturadoAnio), "Facturación consolidada del año", formatoMoneda(facturadoAnio), true)}
      </div>

      <div class="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex flex-col justify-between">
          <div class="flex items-center justify-between">
            <h3 class="text-xs font-bold uppercase tracking-wider comite-text-navy">SEMÁFORO DE PROYECTOS (${proyectosEvaluados.length})</h3>
          </div>
          <div class="my-4 grid grid-cols-3 gap-2 text-center">
            <div class="rounded-xl bg-emerald-50 border border-emerald-200 p-3">
              <p class="text-xl font-bold text-emerald-700 tabular-nums">${cntAlDia}</p>
              <p class="text-[11px] font-semibold text-emerald-700">Al día</p>
            </div>
            <div class="rounded-xl bg-amber-50 border border-amber-200 p-3">
              <p class="text-xl font-bold text-amber-700 tabular-nums">${cntSeg}</p>
              <p class="text-[11px] font-semibold text-amber-800">En seguimiento</p>
            </div>
            <div class="rounded-xl bg-rose-50 border border-rose-200 p-3">
              <p class="text-xl font-bold text-rose-700 tabular-nums">${cntCrit}</p>
              <p class="text-[11px] font-semibold text-rose-700">Críticos</p>
            </div>
          </div>
          <div class="flex h-3.5 w-full overflow-hidden rounded-full bg-slate-100">
            ${cntAlDia ? `<div class="h-full" style="width:${pctAlDia}%; background:#059669"></div>` : ""}
            ${cntSeg ? `<div class="h-full" style="width:${pctSeg}%; background:#D97706"></div>` : ""}
            ${cntCrit ? `<div class="h-full" style="width:${pctCrit}%; background:#DC2626"></div>` : ""}
          </div>
        </div>

        <div class="rounded-2xl comite-bg-cyan p-5 shadow-sm flex flex-col justify-between text-white" title="Real: ${escapeHtml(formatoMoneda(faltaRealTotal))} · Papel: ${escapeHtml(formatoMoneda(faltaPapelTotal))}">
          <div>
            <p class="text-[11px] font-bold uppercase tracking-wider text-white/90">FALTA POR GASTAR REAL</p>
            <p class="mt-2 text-3xl sm:text-4xl font-bold tabular-nums text-white">${fmtM(faltaRealTotal)}</p>
          </div>
          <div class="mt-4 pt-3 border-t border-white/25 flex items-center justify-between text-xs text-white/95">
            <span>En papel ${fmtM(faltaPapelTotal)}</span>
            ${
              Math.round(faltaPapelTotal - faltaRealTotal) !== 0
                ? `<span class="rounded-full bg-white/20 px-2.5 py-0.5 text-[11px] font-bold">Dif. ${fmtM(faltaPapelTotal - faltaRealTotal)}</span>`
                : ""
            }
          </div>
        </div>

        <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex flex-col justify-between" title="${escapeHtml(formatoMoneda(servPendienteTotal))}">
          <div>
            <p class="text-[11px] font-bold uppercase tracking-wider text-slate-400">MANTENIMIENTOS / SERVICIOS</p>
            <p class="mt-2 text-3xl font-bold tabular-nums comite-text-navy">${fmtM(servPendienteTotal)}</p>
          </div>
          <div class="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
            <span>Pendiente por facturar en ${ordenesServicios.length} ${ordenesServicios.length === 1 ? "orden" : "órdenes"}</span>
            <span class="font-bold comite-text-cyan tabular-nums">Total ${fmtM(servValorTotalSinIva)}</span>
          </div>
        </div>
      </div>`
    );

    // ------------------------------------------------------------------
    // SLIDE 03 — Ingresos de la semana (NUEVA DIAPOSITIVA)
    // ------------------------------------------------------------------
    const fechaCorteIngresos = new Date(ahora);
    let etiquetaPeriodo = "Últimos 7 días";
    if (ingresosPeriodo === "15d") {
      fechaCorteIngresos.setDate(fechaCorteIngresos.getDate() - 15);
      etiquetaPeriodo = "Últimos 15 días";
    } else if (ingresosPeriodo === "mes") {
      fechaCorteIngresos.setDate(1);
      fechaCorteIngresos.setHours(0, 0, 0, 0);
      etiquetaPeriodo = `Este mes (${nombreMesCap})`;
    } else {
      fechaCorteIngresos.setDate(fechaCorteIngresos.getDate() - 7);
      etiquetaPeriodo = "Últimos 7 días";
    }

    const ingresosLista = todosEvaluados
      .filter((e) => {
        const dIni = parseDateISO(e.p.fecha_inicio);
        const dCre = parseDateISO(e.p.created_at);
        const ref = dIni || dCre;
        if (!ref) return false;
        return (dIni && dIni >= fechaCorteIngresos) || (dCre && dCre >= fechaCorteIngresos);
      })
      .sort((a, b) => (b.p.fecha_inicio || b.p.created_at || "").localeCompare(a.p.fecha_inicio || a.p.created_at || ""));

    const totalIngValorSinIva = ingresosLista.reduce((s, e) => s + e.valorSinIva, 0);
    const totalIngPpto = ingresosLista.reduce((s, e) => s + e.pptoPapel, 0);
    const totalIngMargenEsp = totalIngValorSinIva > 0 ? ((totalIngValorSinIva - totalIngPpto) / totalIngValorSinIva) * 100 : null;

    // Agrupar ingresos dinámicamente por empresas activas para las 2 tarjetas de empresa
    const empTotalesIng = new Map();
    empresas.forEach((emp) => empTotalesIng.set(emp.nombre, { nombre: emp.nombre, valor: 0, count: 0 }));
    ingresosLista.forEach((e) => {
      const cur = empTotalesIng.get(e.empNombre) || { nombre: e.empNombre, valor: 0, count: 0 };
      cur.valor += e.valorSinIva;
      cur.count += 1;
      empTotalesIng.set(e.empNombre, cur);
    });
    const empIngArr = [...empTotalesIng.values()].sort((a, b) => b.valor - a.valor);
    const cardEmp1 = empIngArr[0] || { nombre: "Grupo Integra", valor: 0, count: 0 };
    const restoEmp = empIngArr.slice(1);
    const cardEmp2 =
      restoEmp.length > 1
        ? {
            nombre: restoEmp.map((x) => x.nombre).slice(0, 2).join(" · "),
            valor: restoEmp.reduce((s, x) => s + x.valor, 0),
            count: restoEmp.reduce((s, x) => s + x.count, 0),
          }
        : restoEmp[0] || { nombre: "Pctronic · Global Solutions", valor: 0, count: 0 };

    const selectorPeriodoHtml = `
      <div class="comite-no-print inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-[11px] font-semibold">
        ${[
          { id: "7d", lbl: "Últimos 7 días" },
          { id: "15d", lbl: "Últimos 15 días" },
          { id: "mes", lbl: "Este mes" },
        ]
          .map(
            (opt) => `
          <button type="button" data-ingresos-periodo="${opt.id}"
            class="rounded-md px-2.5 py-1 transition-colors ${
              ingresosPeriodo === opt.id ? "comite-bg-navy text-white shadow-sm" : "text-slate-600 hover:bg-white"
            }">${opt.lbl}</button>`
          )
          .join("")}
      </div>`;

    const filas03 = ingresosLista
      .map((e) => {
        const fechaIni = e.p.fecha_inicio || e.p.created_at;
        const mEsp = e.margenEsperadoPct !== null ? fmtPct(e.margenEsperadoPct) : "N/A";
        return `
        <tr class="border-b border-slate-100 last:border-0 hover:bg-slate-50/70">
          <td class="px-3 py-2.5 tabular-nums text-slate-600 whitespace-nowrap">${fmtFechaCorta(fechaIni)}</td>
          <td class="px-3 py-2.5 font-semibold comite-text-navy">${escapeHtml(e.p.nombre)}</td>
          <td class="px-3 py-2.5">${badgeEmpresa(e.empNombre)}</td>
          <td class="px-3 py-2.5 tabular-nums text-right comite-td-cyan" title="${escapeHtml(formatoMoneda(e.valorSinIva))}">${fmtM(e.valorSinIva)}</td>
          <td class="px-3 py-2.5 tabular-nums text-right text-slate-700" title="${escapeHtml(formatoMoneda(e.pptoPapel))}">${fmtM(e.pptoPapel)}</td>
          <td class="px-3 py-2.5 tabular-nums text-right font-semibold ${e.margenEsperadoPct !== null && e.margenEsperadoPct < 0 ? "text-rose-600" : "text-emerald-700"}">${mEsp}</td>
          <td class="px-3 py-2.5 tabular-nums text-slate-600 whitespace-nowrap">${fmtFechaCorta(e.cierreEstimado)}</td>
        </tr>`;
      })
      .join("");

    const slide03 = slideChrome(
      "03",
      "PROYECTOS · TODAS LAS EMPRESAS",
      "Ingresos de la semana",
      `Nuevos proyectos y contratos ingresados · ${etiquetaPeriodo}`,
      `
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div class="rounded-2xl comite-bg-navy p-4 shadow-sm text-white">
          <p class="text-[11px] font-bold uppercase tracking-wider text-sky-200">Proyectos que ingresan</p>
          <p class="mt-1.5 text-3xl font-bold tabular-nums">${ingresosLista.length}</p>
          <p class="mt-1 text-[11px] text-slate-300">${escapeHtml(etiquetaPeriodo)}</p>
        </div>
        <div class="rounded-2xl comite-bg-cyan p-4 shadow-sm text-white" title="${escapeHtml(formatoMoneda(totalIngValorSinIva))}">
          <p class="text-[11px] font-bold uppercase tracking-wider text-white/90">Valor de contratos ingresados</p>
          <p class="mt-1.5 text-2xl sm:text-3xl font-bold tabular-nums">${fmtM(totalIngValorSinIva)}</p>
          <p class="mt-1 text-[11px] text-white/90">Con AIU, antes de IVA</p>
        </div>
        <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" title="${escapeHtml(formatoMoneda(cardEmp1.valor))}">
          <p class="text-[11px] font-bold uppercase tracking-wider text-slate-400 truncate">${escapeHtml(cardEmp1.nombre)}</p>
          <p class="mt-1.5 text-2xl font-bold tabular-nums comite-text-navy">${fmtM(cardEmp1.valor)}</p>
          <p class="mt-1 text-[11px] text-slate-500">${cardEmp1.count} ${cardEmp1.count === 1 ? "proyecto" : "proyectos"}</p>
        </div>
        <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" title="${escapeHtml(formatoMoneda(cardEmp2.valor))}">
          <p class="text-[11px] font-bold uppercase tracking-wider text-slate-400 truncate">${escapeHtml(cardEmp2.nombre)}</p>
          <p class="mt-1.5 text-2xl font-bold tabular-nums comite-text-cyan">${fmtM(cardEmp2.valor)}</p>
          <p class="mt-1 text-[11px] text-slate-500">${cardEmp2.count} ${cardEmp2.count === 1 ? "proyecto" : "proyectos"}</p>
        </div>
      </div>

      <div class="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table class="w-full text-left text-xs">
          <thead class="comite-bg-navy text-[11px] uppercase tracking-wider text-white">
            <tr>
              <th class="px-3 py-3">Inicio</th>
              <th class="px-3 py-3">Proyecto</th>
              <th class="px-3 py-3">Empresa</th>
              <th class="px-3 py-3 text-right comite-th-cyan">Valores con AIU, antes de IVA</th>
              <th class="px-3 py-3 text-right">Ppto. contrato</th>
              <th class="px-3 py-3 text-right">Margen esperado</th>
              <th class="px-3 py-3">Cierre estimado</th>
            </tr>
          </thead>
          <tbody>
            ${
              filas03 ||
              `<tr><td colspan="7" class="px-4 py-8 text-center text-slate-400">No se registraron ingresos de proyectos en ${escapeHtml(etiquetaPeriodo.toLowerCase())}. Puedes cambiar el rango en el selector superior.</td></tr>`
            }
          </tbody>
          <tfoot class="bg-slate-100 font-bold comite-text-navy border-t-2 border-slate-300">
            <tr>
              <td class="px-3 py-3" colspan="3">Total (${ingresosLista.length})</td>
              <td class="px-3 py-3 text-right tabular-nums comite-td-cyan">${fmtM(totalIngValorSinIva)}</td>
              <td class="px-3 py-3 text-right tabular-nums">${fmtM(totalIngPpto)}</td>
              <td class="px-3 py-3 text-right tabular-nums">${totalIngMargenEsp !== null ? fmtPct(totalIngMargenEsp) : "N/A"}</td>
              <td class="px-3 py-3">—</td>
            </tr>
          </tfoot>
        </table>
      </div>`,
      selectorPeriodoHtml
    );

    // ------------------------------------------------------------------
    // SLIDE 04 — Estado de proyectos
    // ------------------------------------------------------------------
    const filas04 = proyectosEvaluados
      .map((x) => {
        const av = Math.min(100, Math.max(0, Number(x.p.avance_porcentaje || 0)));
        const pptoPct = x.pptoPapel > 0 ? Math.round((x.gastado / x.pptoPapel) * 100) : 0;
        return `
        <tr class="border-b border-slate-100 last:border-0 hover:bg-slate-50/70">
          <td class="px-3 py-2.5">${badgeEmpresa(x.empNombre)}</td>
          <td class="px-3 py-2.5 font-semibold comite-text-navy">${escapeHtml(x.p.nombre)}</td>
          <td class="px-3 py-2.5">${x.sem.pill}</td>
          <td class="px-3 py-2.5 min-w-[130px]">
            <div class="flex items-center gap-2">
              <div class="h-2 flex-1 rounded-full bg-slate-200 overflow-hidden">
                <div class="h-full rounded-full comite-bg-cyan" style="width:${av}%"></div>
              </div>
              <span class="text-[11px] font-bold tabular-nums comite-text-navy w-9 text-right">${av}%</span>
            </div>
          </td>
          <td class="px-3 py-2.5 tabular-nums font-semibold ${pptoPct > 100 ? "text-rose-600" : "text-slate-700"}" title="${escapeHtml(formatoMoneda(x.gastado))} de ${escapeHtml(formatoMoneda(x.pptoPapel))}">
            ${pptoPct}%
          </td>
          <td class="px-3 py-2.5 text-slate-700">${escapeHtml(x.proximoHitoTexto)}</td>
          <td class="px-3 py-2.5 tabular-nums text-slate-600 whitespace-nowrap">${fmtFechaCorta(x.cierreEstimado)}</td>
        </tr>`;
      })
      .join("");

    const slide04 = slideChrome(
      "04",
      "PROYECTOS · SEGUIMIENTO OPERATIVO",
      "Estado de proyectos",
      "Semáforo automático (cronograma, avance y presupuesto), próximo hito de cobro y cierre estimado",
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
          <tbody>${filas04 || `<tr><td colspan="7" class="px-4 py-8 text-center text-slate-400">Sin proyectos registrados.</td></tr>`}</tbody>
        </table>
      </div>`
    );

    // ------------------------------------------------------------------
    // SLIDE 05 — Resumen financiero de proyectos
    // ------------------------------------------------------------------
    const tot05 = proyectosEvaluados.reduce(
      (acc, x) => {
        acc.valorSinIva += x.valorSinIva;
        acc.ppto += x.pptoPapel;
        acc.ventas += x.facturado;
        acc.costos += x.gastado;
        acc.pendiente += x.pendienteFact;
        return acc;
      },
      { valorSinIva: 0, ppto: 0, ventas: 0, costos: 0, pendiente: 0 }
    );
    const totMargen05Pct = tot05.ventas > 0 ? ((tot05.ventas - tot05.costos) / tot05.ventas) * 100 : null;

    const filas05 = proyectosEvaluados
      .map((x) => {
        const mLabel = x.margenBrutoPct !== null ? fmtPct(x.margenBrutoPct) : "N/A";
        const mCls =
          x.margenBrutoPct === null
            ? "text-slate-400"
            : x.margenBrutoPct < 0
              ? "text-rose-600 font-bold"
              : "text-emerald-700 font-semibold";
        return `
        <tr class="border-b border-slate-100 last:border-0 hover:bg-slate-50/70">
          <td class="px-3 py-2.5">${badgeEmpresa(x.empNombre)}</td>
          <td class="px-3 py-2.5 font-semibold comite-text-navy">${escapeHtml(x.p.nombre)}</td>
          <td class="px-3 py-2.5 tabular-nums text-right comite-td-cyan" title="${escapeHtml(formatoMoneda(x.valorSinIva))}">${fmtM(x.valorSinIva)}</td>
          <td class="px-3 py-2.5 tabular-nums text-right text-slate-700" title="${escapeHtml(formatoMoneda(x.pptoPapel))}">${fmtM(x.pptoPapel)}</td>
          <td class="px-3 py-2.5 tabular-nums text-right text-slate-700" title="${escapeHtml(formatoMoneda(x.facturado))}">${fmtM(x.facturado)}</td>
          <td class="px-3 py-2.5 tabular-nums text-right text-slate-700" title="${escapeHtml(formatoMoneda(x.gastado))}">${fmtM(x.gastado)}</td>
          <td class="px-3 py-2.5 tabular-nums text-right ${mCls}">${mLabel}</td>
          <td class="px-3 py-2.5 tabular-nums text-right font-semibold comite-text-navy" title="${escapeHtml(formatoMoneda(x.pendienteFact))}">${fmtM(x.pendienteFact)}</td>
          <td class="px-3 py-2.5 text-slate-600 whitespace-nowrap">${escapeHtml(x.proximaFactTexto)}</td>
        </tr>`;
      })
      .join("");

    const slide05 = slideChrome(
      "05",
      "PROYECTOS · ANÁLISIS FINANCIERO",
      "Resumen financiero de proyectos",
      "Contratos (con AIU, antes de IVA), presupuesto, ventas facturadas, costos reales, margen bruto y próxima facturación",
      `
      <div class="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table class="w-full text-left text-xs">
          <thead class="comite-bg-navy text-[11px] uppercase tracking-wider text-white">
            <tr>
              <th class="px-3 py-3">Empresa</th>
              <th class="px-3 py-3">Proyecto</th>
              <th class="px-3 py-3 text-right comite-th-cyan">Valores con AIU, antes de IVA</th>
              <th class="px-3 py-3 text-right">Ppto. contrato</th>
              <th class="px-3 py-3 text-right">Ventas</th>
              <th class="px-3 py-3 text-right">Costos</th>
              <th class="px-3 py-3 text-right">Margen bruto</th>
              <th class="px-3 py-3 text-right">Facturación pendiente</th>
              <th class="px-3 py-3">Próxima facturación</th>
            </tr>
          </thead>
          <tbody>
            ${filas05 || `<tr><td colspan="9" class="px-4 py-8 text-center text-slate-400">Sin proyectos registrados.</td></tr>`}
          </tbody>
          <tfoot class="bg-slate-100 font-bold comite-text-navy border-t-2 border-slate-300">
            <tr>
              <td class="px-3 py-3" colspan="2">Total</td>
              <td class="px-3 py-3 text-right tabular-nums comite-td-cyan">${fmtM(tot05.valorSinIva)}</td>
              <td class="px-3 py-3 text-right tabular-nums">${fmtM(tot05.ppto)}</td>
              <td class="px-3 py-3 text-right tabular-nums">${fmtM(tot05.ventas)}</td>
              <td class="px-3 py-3 text-right tabular-nums">${fmtM(tot05.costos)}</td>
              <td class="px-3 py-3 text-right tabular-nums ${totMargen05Pct !== null && totMargen05Pct < 0 ? "text-rose-600" : "text-emerald-700"}">${totMargen05Pct !== null ? fmtPct(totMargen05Pct) : "N/A"}</td>
              <td class="px-3 py-3 text-right tabular-nums">${fmtM(tot05.pendiente)}</td>
              <td class="px-3 py-3">—</td>
            </tr>
          </tfoot>
        </table>
      </div>`
    );

    // ------------------------------------------------------------------
    // SLIDE 06 — Presupuesto por gastar: papel vs. real (CÁLCULO REAL)
    // ------------------------------------------------------------------
    const pptoTotal06 = proyectosEvaluados.reduce((s, x) => s + x.pptoPapel, 0);
    const gastadoTotal06 = proyectosEvaluados.reduce((s, x) => s + x.gastado, 0);
    const faltaPapel06 = proyectosEvaluados.reduce((s, x) => s + x.faltaPapel, 0);
    const faltaReal06 = proyectosEvaluados.reduce((s, x) => s + x.faltaReal, 0);
    const pctGast06 = pptoTotal06 > 0 ? (gastadoTotal06 / pptoTotal06) * 100 : 0;
    const pctPapel06 = pptoTotal06 > 0 ? (faltaPapel06 / pptoTotal06) * 100 : 0;
    const pctReal06 = pptoTotal06 > 0 ? (faltaReal06 / pptoTotal06) * 100 : 0;

    const kpiWhite = (lbl, val, sub, cls = "comite-text-navy", exact = "") => `
      <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" title="${escapeHtml(exact)}">
        <p class="text-[11px] font-bold uppercase tracking-wider text-slate-400">${lbl}</p>
        <p class="mt-1.5 text-2xl font-bold tabular-nums ${cls}">${val}</p>
        <p class="mt-1 text-[11px] text-slate-500">${sub}</p>
      </div>`;

    const filas06 = proyectosEvaluados
      .map((x) => {
        const dif = Math.max(0, x.faltaPapel - x.faltaReal);
        const base = Math.max(1, x.gastado + x.faltaReal + dif, x.pptoPapel);
        const wGast = Math.min(100, Math.round((x.gastado / base) * 100));
        const wReal = Math.min(100 - wGast, Math.round((x.faltaReal / base) * 100));
        const wDif = Math.max(0, Math.min(100 - wGast - wReal, Math.round((dif / base) * 100)));
        const pctUsado = x.pptoPapel > 0 ? Math.round((x.gastado / x.pptoPapel) * 100) : 0;
        const esMenor = x.faltaReal < x.faltaPapel && x.tieneAjusteReal;

        return `
        <tr class="border-b border-slate-100 last:border-0 hover:bg-slate-50/70">
          <td class="px-3 py-2.5">${badgeEmpresa(x.empNombre)}</td>
          <td class="px-3 py-2.5 font-semibold comite-text-navy">${escapeHtml(x.p.nombre)}</td>
          <td class="px-3 py-2.5 tabular-nums text-right text-slate-700">${fmtM(x.pptoPapel)}</td>
          <td class="px-3 py-2.5 tabular-nums text-right font-medium text-slate-800">${fmtM(x.gastado)}</td>
          <td class="px-3 py-2.5 tabular-nums text-right ${x.tieneAjusteReal ? "line-through text-slate-400 comite-strike" : "text-slate-600"}">${fmtM(x.faltaPapel)}</td>
          <td class="px-3 py-2.5 tabular-nums text-right ${esMenor ? "font-bold comite-text-cyan" : "font-bold comite-text-navy"}" title="${escapeHtml(x.p.nota_falta_real || "")}">${fmtM(x.faltaReal)}</td>
          <td class="px-3 py-2.5 min-w-[200px]">
            <div class="flex items-center gap-2">
              <div class="flex h-3 flex-1 overflow-hidden rounded-full bg-slate-100">
                ${wGast > 0 ? `<div class="comite-bg-navy h-full" style="width:${wGast}%" title="Gastado: ${fmtM(x.gastado)}"></div>` : ""}
                ${wReal > 0 ? `<div class="comite-bg-cyan h-full" style="width:${wReal}%" title="Falta real: ${fmtM(x.faltaReal)}"></div>` : ""}
                ${wDif > 0 ? `<div class="comite-bg-diff h-full" style="width:${wDif}%" title="Diferencia papel vs. real: ${fmtM(dif)}"></div>` : ""}
              </div>
              <span class="text-[11px] font-bold tabular-nums ${pctUsado > 100 ? "text-rose-600" : "comite-text-navy"} w-10 text-right">${pctUsado}%</span>
            </div>
          </td>
        </tr>`;
      })
      .join("");

    const totDif06 = Math.round(faltaReal06) !== Math.round(faltaPapel06);

    const slide06 = slideChrome(
      "06",
      "CONTROL PRESUPUESTAL",
      "Presupuesto por gastar: papel vs. real",
      "Comparativo de presupuesto contractual, ejecutado real, saldo en papel y saldo real proyectado",
      `
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        ${kpiWhite("Presupuesto total", fmtM(pptoTotal06), "Base contractual", "comite-text-navy", formatoMoneda(pptoTotal06))}
        ${kpiWhite("Gastado", fmtM(gastadoTotal06), `${fmtPct(pctGast06)} ejecutado`, "comite-text-navy", formatoMoneda(gastadoTotal06))}
        ${kpiWhite("Falta en papel", fmtM(faltaPapel06), `${fmtPct(pctPapel06)} del presupuesto`, "text-slate-600", formatoMoneda(faltaPapel06))}
        <div class="rounded-2xl comite-bg-cyan p-4 shadow-sm text-white" title="${escapeHtml(formatoMoneda(faltaReal06))}">
          <p class="text-[11px] font-bold uppercase tracking-wider text-white/90">Falta real</p>
          <p class="mt-1.5 text-2xl font-bold tabular-nums">${fmtM(faltaReal06)}</p>
          <p class="mt-1 text-[11px] text-white/90">${fmtPct(pctReal06)} del presupuesto</p>
        </div>
      </div>

      <div class="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table class="w-full text-left text-xs">
          <thead class="comite-bg-navy text-[11px] uppercase tracking-wider text-white">
            <tr>
              <th class="px-3 py-3">Empresa</th>
              <th class="px-3 py-3">Proyecto</th>
              <th class="px-3 py-3 text-right">Ppto. contrato</th>
              <th class="px-3 py-3 text-right">Gastado</th>
              <th class="px-3 py-3 text-right">Falta en papel</th>
              <th class="px-3 py-3 text-right">Falta real</th>
              <th class="px-3 py-3">Composición del ppto. · % usado</th>
            </tr>
          </thead>
          <tbody>${filas06 || `<tr><td colspan="7" class="px-4 py-8 text-center text-slate-400">Sin datos presupuestales.</td></tr>`}</tbody>
          <tfoot class="bg-slate-100 font-bold comite-text-navy border-t-2 border-slate-300">
            <tr>
              <td class="px-3 py-3" colspan="2">Total</td>
              <td class="px-3 py-3 text-right tabular-nums">${fmtM(pptoTotal06)}</td>
              <td class="px-3 py-3 text-right tabular-nums">${fmtM(gastadoTotal06)}</td>
              <td class="px-3 py-3 text-right tabular-nums ${totDif06 ? "line-through text-slate-400 comite-strike" : ""}">${fmtM(faltaPapel06)}</td>
              <td class="px-3 py-3 text-right tabular-nums comite-text-cyan">${fmtM(faltaReal06)}</td>
              <td class="px-3 py-3 text-right tabular-nums">${fmtPct(pctGast06, 0)} usado</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div class="flex flex-wrap items-center justify-end gap-4 text-[11px] font-medium text-slate-600">
        <span class="inline-flex items-center gap-1.5"><span class="h-2.5 w-2.5 rounded-sm comite-bg-navy"></span>Gastado</span>
        <span class="inline-flex items-center gap-1.5"><span class="h-2.5 w-2.5 rounded-sm comite-bg-cyan"></span>Falta real</span>
        <span class="inline-flex items-center gap-1.5"><span class="h-2.5 w-2.5 rounded-sm comite-bg-diff"></span>Diferencia papel vs. real</span>
      </div>`
    );

    // ------------------------------------------------------------------
    // SLIDE 07 — Facturación pendiente por proyecto
    // ------------------------------------------------------------------
    const rankingPend = proyectosEvaluados
      .filter((x) => x.pendienteFact > 0)
      .sort((a, b) => b.pendienteFact - a.pendienteFact);
    const totalPend07 = rankingPend.reduce((s, x) => s + x.pendienteFact, 0);
    const maxPend07 = Math.max(1, ...rankingPend.map((x) => x.pendienteFact));
    const top1 = rankingPend[0] || null;
    const top1Pct = top1 && totalPend07 > 0 ? (top1.pendienteFact / totalPend07) * 100 : 0;

    const pendPorEmpresaMap = new Map();
    rankingPend.forEach((x) => {
      pendPorEmpresaMap.set(x.empNombre, (pendPorEmpresaMap.get(x.empNombre) || 0) + x.pendienteFact);
    });
    const pendPorEmpresa = [...pendPorEmpresaMap.entries()].sort((a, b) => b[1] - a[1]);

    const barras07 = rankingPend
      .slice(0, 10)
      .map((x) => {
        const w = Math.max(4, Math.round((x.pendienteFact / maxPend07) * 100));
        const infoEmp = clasificarEmpresaColor(x.empNombre);
        return `
        <div class="space-y-1">
          <div class="flex items-center justify-between text-xs gap-2">
            <span class="font-semibold comite-text-navy truncate">${escapeHtml(x.p.nombre)} <span class="text-[10px] font-normal text-slate-400">· ${escapeHtml(x.empNombre)}</span></span>
            <span class="font-bold tabular-nums comite-text-navy shrink-0">${fmtM(x.pendienteFact)}</span>
          </div>
          <div class="h-3.5 w-full rounded-full bg-slate-100 overflow-hidden">
            <div class="h-full rounded-full" style="width:${w}%; background:${infoEmp.color}"></div>
          </div>
        </div>`;
      })
      .join("");

    const filasEmp07 = pendPorEmpresa
      .map(([emp, val]) => {
        const pct = totalPend07 > 0 ? (val / totalPend07) * 100 : 0;
        const infoEmp = clasificarEmpresaColor(emp);
        return `
        <div class="flex items-center justify-between border-b border-slate-100 py-2.5 last:border-0 text-xs">
          <div class="flex items-center gap-2 min-w-0">
            <span class="h-2.5 w-2.5 rounded-full shrink-0" style="background:${infoEmp.color}"></span>
            <span class="font-semibold text-slate-700 truncate">${escapeHtml(emp)}</span>
          </div>
          <div class="text-right tabular-nums shrink-0 ml-2">
            <span class="font-bold comite-text-navy">${fmtM(val)}</span>
            <span class="ml-1 text-[11px] text-slate-400">(${fmtPct(pct)})</span>
          </div>
        </div>`;
      })
      .join("");

    const slide07 = slideChrome(
      "07",
      "CARTERA Y PROYECCIÓN",
      "Facturación pendiente por proyecto",
      "Ranking descendente por saldo contractual pendiente, coloreado por empresa",
      `
      <div class="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div class="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3.5">
          <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
            <h3 class="text-sm font-bold comite-text-navy">Saldo pendiente por proyecto</h3>
            <div class="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
              <span class="inline-flex items-center gap-1"><span class="h-2.5 w-2.5 rounded-full" style="background:#0B2545"></span>Grupo Integra</span>
              <span class="inline-flex items-center gap-1"><span class="h-2.5 w-2.5 rounded-full" style="background:#169AD6"></span>Pctronic</span>
              <span class="inline-flex items-center gap-1"><span class="h-2.5 w-2.5 rounded-full" style="background:#64748B"></span>Global Solutions</span>
            </div>
          </div>
          ${barras07 || `<p class="py-10 text-center text-xs text-slate-400">No hay saldos pendientes por facturar.</p>`}
        </div>
        <div class="space-y-4">
          <div class="rounded-2xl comite-bg-navy p-5 text-white shadow-sm">
            <p class="text-[11px] font-bold uppercase tracking-wider text-sky-200">CONCENTRACIÓN</p>
            <p class="mt-2 text-3xl sm:text-4xl font-bold tabular-nums text-white">${fmtPct(top1Pct)}</p>
            <p class="mt-2 text-xs text-slate-200 leading-relaxed">
              ${
                top1
                  ? `${fmtPct(top1Pct)} de lo pendiente está en <strong class="text-white">${escapeHtml(top1.p.nombre)}</strong> (${fmtM(top1.pendienteFact)} de ${fmtM(totalPend07)}).`
                  : "No hay cartera pendiente en proyectos activos."
              }
            </p>
          </div>
          <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 class="text-xs font-bold uppercase tracking-wider comite-text-navy mb-2">PENDIENTE POR EMPRESA</h3>
            ${filasEmp07 || `<p class="text-xs text-slate-400">Sin saldos pendientes.</p>`}
          </div>
        </div>
      </div>`
    );

    // ------------------------------------------------------------------
    // SLIDE 08 — Servicios y mantenimientos
    // ------------------------------------------------------------------
    const servFacturadoFechaTotal = ordenesServicios.reduce((s, o) => s + o.facturadoFecha, 0);

    const badgeEstadoServ = (key, label) => {
      if (key === "finalizado" || key === "cerrado") {
        return `<span class="inline-flex rounded-full comite-pill-aldia px-2.5 py-0.5 text-[10px] font-bold">${escapeHtml(label)}</span>`;
      }
      if (key === "detenido") {
        return `<span class="inline-flex rounded-full comite-pill-critico px-2.5 py-0.5 text-[10px] font-bold">${escapeHtml(label)}</span>`;
      }
      return `<span class="inline-flex rounded-full comite-bg-cyan px-2.5 py-0.5 text-[10px] font-bold">${escapeHtml(label)}</span>`;
    };

    const filas08 = ordenesServicios
      .map(
        (o, idx) => `
        <tr class="border-b border-slate-100 last:border-0 hover:bg-slate-50/70">
          <td class="px-2.5 py-2.5 tabular-nums text-slate-400 font-semibold">${idx + 1}</td>
          <td class="px-2.5 py-2.5 font-semibold comite-text-navy">${escapeHtml(o.nombre)}</td>
          <td class="px-2.5 py-2.5 whitespace-nowrap">${badgeEstadoServ(o.estadoKey, o.estado)}</td>
          <td class="px-2.5 py-2.5 text-slate-700">${escapeHtml(o.coordinador)}</td>
          <td class="px-2.5 py-2.5 text-slate-600">${escapeHtml(o.ocContrato)}</td>
          <td class="px-2.5 py-2.5 tabular-nums font-semibold text-right">${o.avance}%</td>
          <td class="px-2.5 py-2.5 tabular-nums text-right font-medium">${fmtM(o.valorSinIva)}</td>
          <td class="px-2.5 py-2.5 tabular-nums text-right text-emerald-700 font-semibold">${fmtM(o.facturadoFecha)}</td>
          <td class="px-2.5 py-2.5 tabular-nums text-right font-bold ${o.pendiente > 0 ? "comite-text-cyan" : "text-slate-400"}">${fmtM(o.pendiente)}</td>
          <td class="px-2.5 py-2.5 text-slate-600 max-w-[180px] truncate" title="${escapeHtml(o.gestion)}">${escapeHtml(o.gestion)}</td>
        </tr>`
      )
      .join("");

    const slide08 = slideChrome(
      "08",
      "SERVICIOS Y MANTENIMIENTOS",
      "Servicios y mantenimientos",
      "Consolidado de órdenes de mantenimiento, servicios y suministros",
      `
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        ${kpiWhite("Órdenes", `${ordenesServicios.length}`, "Mantenimientos y servicios")}
        ${kpiWhite("Valor de las órdenes sin IVA", fmtM(servValorTotalSinIva), "Monto total contratado", "comite-text-navy", formatoMoneda(servValorTotalSinIva))}
        ${kpiWhite(`Facturado en ${nombreMes}`, fmtM(servFacturadoMes), `Ejecutado en ${nombreMes} ${anioActual}`, "comite-text-cyan", formatoMoneda(servFacturadoMes))}
        <div class="rounded-2xl comite-bg-navy p-4 shadow-sm text-white" title="${escapeHtml(formatoMoneda(servPendienteTotal))}">
          <p class="text-[11px] font-bold uppercase tracking-wider text-sky-200">Pendiente de las órdenes</p>
          <p class="mt-1.5 text-2xl font-bold tabular-nums">${fmtM(servPendienteTotal)}</p>
          <p class="mt-1 text-[11px] text-slate-300">Saldo por facturar</p>
        </div>
      </div>

      <div class="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table class="w-full text-left text-[11px]">
          <thead class="comite-bg-navy uppercase tracking-wider text-white">
            <tr>
              <th class="px-2.5 py-3">#</th>
              <th class="px-2.5 py-3">Mantenimiento</th>
              <th class="px-2.5 py-3">Estado</th>
              <th class="px-2.5 py-3">Coord.</th>
              <th class="px-2.5 py-3">OC / Contrato</th>
              <th class="px-2.5 py-3 text-right">Avance</th>
              <th class="px-2.5 py-3 text-right">Valor</th>
              <th class="px-2.5 py-3 text-right">Facturado a la fecha</th>
              <th class="px-2.5 py-3 text-right">Pendiente</th>
              <th class="px-2.5 py-3">Gestión</th>
            </tr>
          </thead>
          <tbody>
            ${filas08 || `<tr><td colspan="10" class="px-4 py-8 text-center text-slate-400">Sin órdenes de mantenimiento o servicios registradas.</td></tr>`}
          </tbody>
          <tfoot class="bg-slate-100 font-bold comite-text-navy border-t-2 border-slate-300">
            <tr>
              <td class="px-2.5 py-2.5" colspan="6">Total (${ordenesServicios.length} órdenes)</td>
              <td class="px-2.5 py-2.5 text-right tabular-nums">${fmtM(servValorTotalSinIva)}</td>
              <td class="px-2.5 py-2.5 text-right tabular-nums text-emerald-700">${fmtM(servFacturadoFechaTotal)}</td>
              <td class="px-2.5 py-2.5 text-right tabular-nums comite-text-cyan">${fmtM(servPendienteTotal)}</td>
              <td class="px-2.5 py-2.5">—</td>
            </tr>
          </tfoot>
        </table>
      </div>`
    );

    // ------------------------------------------------------------------
    // SLIDE 09 — Facturación de [mes actual]
    // ------------------------------------------------------------------
    const empNombresSet = new Set(empresas.map((e) => e.nombre));
    esperadasMesLista.forEach((x) => empNombresSet.add(x.empresaNombre));
    efectuadasMesLista.forEach((x) => empNombresSet.add(x.empresaNombre));
    const empNombres = [...empNombresSet].filter(Boolean);
    if (empNombres.length === 0) empNombres.push("Consolidado");

    const compEmpresas09 = empNombres.map((nom) => {
      const esp = esperadasMesLista.filter((x) => x.empresaNombre === nom).reduce((s, x) => s + x.valor, 0);
      const fact = efectuadasMesLista.filter((x) => x.empresaNombre === nom).reduce((s, x) => s + x.valor, 0);
      const pct = esp > 0 ? (fact / esp) * 100 : fact > 0 ? 100 : 0;
      return { nombre: nom, esperada: esp, facturada: fact, pct };
    });

    const resumenSubEsperada = compEmpresas09
      .filter((c) => c.esperada > 0)
      .map((c) => `${escapeHtml(c.nombre)} ${fmtM(c.esperada)}`)
      .join(" · ") || `Programada para ${nombreMes}`;

    const resumenSubFacturada = compEmpresas09
      .filter((c) => c.facturada > 0)
      .map((c) => `${escapeHtml(c.nombre)} ${fmtM(c.facturada)}`)
      .join(" · ") || `Emitida en ${nombreMes}`;

    const barras09 = compEmpresas09
      .map((c) => {
        const barColor = c.pct >= 100 ? "#059669" : c.pct >= 50 ? "#D97706" : "#DC2626";
        const textCls = c.pct >= 100 ? "text-emerald-700" : c.pct >= 50 ? "text-amber-700" : "text-rose-600";
        const wFill = Math.min(100, Math.max(0, Math.round(c.pct)));
        return `
        <div class="rounded-xl border border-slate-100 bg-slate-50/70 p-4 space-y-2">
          <div class="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span class="font-bold comite-text-navy">${escapeHtml(c.nombre)}</span>
            <div class="flex items-center gap-3 tabular-nums">
              <span class="text-slate-500">Esperado: <strong class="text-slate-800">${fmtM(c.esperada)}</strong></span>
              <span class="text-slate-500">Facturado: <strong class="comite-text-navy">${fmtM(c.facturada)}</strong></span>
              <span class="font-bold ${textCls}">${fmtPct(c.pct)}</span>
            </div>
          </div>
          <div class="h-4 w-full rounded-full bg-slate-200 overflow-hidden">
            <div class="h-full rounded-full transition-all duration-300" style="width:${wFill}%; background:${barColor}"></div>
          </div>
        </div>`;
      })
      .join("");

    const slide09 = slideChrome(
      "09",
      "FACTURACIÓN MENSUAL",
      `Facturación de ${nombreMes} ${anioActual}`,
      "Cumplimiento mensual consolidado y avance por empresa frente a lo esperado",
      `
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
        ${kpiWhite("FACTURACIÓN ESPERADA", fmtM(esperadaMes), resumenSubEsperada, "comite-text-navy", formatoMoneda(esperadaMes))}
        ${kpiWhite("FACTURACIÓN TOTAL DEL MES", fmtM(facturadoMes), resumenSubFacturada, "comite-text-navy", formatoMoneda(facturadoMes))}
        <div class="rounded-2xl comite-bg-cyan p-4 shadow-sm text-white">
          <p class="text-[11px] font-bold uppercase tracking-wider text-white/90">CUMPLIMIENTO</p>
          <p class="mt-1.5 text-3xl font-bold tabular-nums">${fmtPct(cumplimientoMesPct)}</p>
          <p class="mt-1 text-[11px] text-white/90">Facturado frente a esperado</p>
        </div>
      </div>

      <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h3 class="text-sm font-bold comite-text-navy">Cumplimiento por empresa</h3>
          <div class="flex items-center gap-3 text-[11px] text-slate-500">
            <span class="inline-flex items-center gap-1"><span class="h-2.5 w-2.5 rounded-full" style="background:#059669"></span>≥ 100%</span>
            <span class="inline-flex items-center gap-1"><span class="h-2.5 w-2.5 rounded-full" style="background:#D97706"></span>50% – 99%</span>
            <span class="inline-flex items-center gap-1"><span class="h-2.5 w-2.5 rounded-full" style="background:#DC2626"></span>&lt; 50%</span>
          </div>
        </div>
        ${barras09}
      </div>`
    );

    // ------------------------------------------------------------------
    // SLIDE 10 — Detalle de la facturación de [mes actual]
    // ------------------------------------------------------------------
    const tablaDetalle10 = (lista, emptyMsg) => {
      const totalVal = lista.reduce((s, x) => s + x.valor, 0);
      const rows = lista
        .map(
          (x) => `
          <tr class="border-b border-slate-100 last:border-0">
            <td class="px-3 py-2 text-slate-600 whitespace-nowrap">${escapeHtml(x.empresaNombre)}</td>
            <td class="px-3 py-2 font-medium comite-text-navy">${escapeHtml(x.concepto)}</td>
            <td class="px-3 py-2 text-right font-bold tabular-nums comite-text-navy whitespace-nowrap">${fmtM(x.valor)}</td>
          </tr>`
        )
        .join("");
      return `
        <table class="w-full text-left text-xs">
          <thead class="comite-bg-navy text-[10px] uppercase tracking-wider text-white">
            <tr>
              <th class="px-3 py-2.5">Empresa</th>
              <th class="px-3 py-2.5">Concepto</th>
              <th class="px-3 py-2.5 text-right">Valor</th>
            </tr>
          </thead>
          <tbody>${rows || `<tr><td colspan="3" class="px-3 py-6 text-center text-slate-400">${emptyMsg}</td></tr>`}</tbody>
          <tfoot class="bg-slate-100 font-bold comite-text-navy border-t border-slate-300">
            <tr>
              <td class="px-3 py-2.5" colspan="2">Total</td>
              <td class="px-3 py-2.5 text-right tabular-nums">${fmtM(totalVal)}</td>
            </tr>
          </tfoot>
        </table>`;
    };

    // Por facturar esta semana (hitos de facturación sin facturar y cortes pendientes hasta próximos 7 días)
    const inicioMesStr = `${anioActual}-${String(mesActual + 1).padStart(2, "0")}-01`;
    const finSemana = new Date(ahora);
    finSemana.setDate(finSemana.getDate() + 7);
    const finSemanaStr = isoLocal(finSemana);

    const porFacturarSemana = [];
    cronograma.forEach((act) => {
      if (!act.es_hito_facturacion || act.hito_facturado || !act.fecha_fin) return;
      if (act.fecha_fin >= inicioMesStr && act.fecha_fin <= finSemanaStr) {
        const proy = proyMap.get(act.proyecto_id);
        if (proy?.estado === "cancelado") return;
        const vencidoTag = act.fecha_fin < hoyStr ? " (vencido)" : "";
        porFacturarSemana.push({
          proyecto: proy?.nombre || "Proyecto",
          detalle: `${act.nombre || act.titulo || "Hito de facturación"}${vencidoTag}`,
          fecha: act.fecha_fin,
          valor: Number(act.monto_facturacion_estimado || 0),
        });
      }
    });
    cortesCliente.forEach((c) => {
      if (c.estado !== "pendiente" || !c.fecha) return;
      if (c.fecha <= finSemanaStr) {
        const proy = proyMap.get(c.proyecto_id);
        if (proy?.estado === "cancelado") return;
        porFacturarSemana.push({
          proyecto: proy?.nombre || "Proyecto",
          detalle: `Corte #${c.numero || ""} pendiente`,
          fecha: c.fecha,
          valor: valorCorteCliente(c, proy),
        });
      }
    });
    porFacturarSemana.sort((a, b) => (a.fecha || "9999").localeCompare(b.fecha || "9999"));

    const slide10 = slideChrome(
      "10",
      "FACTURACIÓN MENSUAL · DETALLE",
      `Detalle de la facturación de ${nombreMes} ${anioActual}`,
      "Desglose de conceptos esperados, facturación efectuada y compromisos de la semana",
      `
      <div class="grid grid-cols-1 gap-5 lg:grid-cols-2 items-start">
        <div class="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div class="flex items-center justify-between border-b border-slate-100 px-4 py-3 bg-slate-50">
            <h3 class="text-xs font-bold uppercase tracking-wider comite-text-navy">Facturación esperada (${esperadasMesLista.length})</h3>
            <span class="text-xs font-bold comite-text-navy tabular-nums">${fmtM(esperadaMes)}</span>
          </div>
          <div class="overflow-x-auto">${tablaDetalle10(esperadasMesLista, "Sin facturación esperada registrada para este mes.")}</div>
        </div>

        <div class="space-y-4">
          <div class="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div class="flex items-center justify-between border-b border-slate-100 px-4 py-3 bg-emerald-50/70">
              <h3 class="text-xs font-bold uppercase tracking-wider text-emerald-900">Facturación efectuada (${efectuadasMesLista.length})</h3>
              <span class="text-xs font-bold text-emerald-700 tabular-nums">${fmtM(facturadoMes)}</span>
            </div>
            <div class="overflow-x-auto">${tablaDetalle10(efectuadasMesLista, "Sin facturación efectuada en este mes.")}</div>
          </div>

          <div class="rounded-xl comite-bg-cyan px-5 py-3.5 shadow-sm flex items-center justify-between text-white">
            <span class="text-xs font-bold uppercase tracking-wider">Cumplimiento del mes</span>
            <span class="text-xl font-bold tabular-nums">${fmtPct(cumplimientoMesPct)}</span>
          </div>

          <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div class="flex items-center justify-between mb-2">
              <h3 class="text-xs font-bold uppercase tracking-wider comite-text-navy">Por facturar esta semana</h3>
              <span class="text-[11px] font-semibold text-slate-400">Próximos 7 días</span>
            </div>
            ${
              porFacturarSemana.length
                ? `<ul class="divide-y divide-slate-100 text-xs">
                    ${porFacturarSemana
                      .slice(0, 6)
                      .map(
                        (item) => `
                      <li class="flex items-center justify-between gap-2 py-2">
                        <div class="min-w-0">
                          <p class="font-semibold comite-text-navy truncate">${escapeHtml(item.proyecto)}</p>
                          <p class="text-[11px] text-slate-500 truncate">${escapeHtml(item.detalle)} · ${fmtFechaCorta(item.fecha)}</p>
                        </div>
                        <span class="font-bold comite-text-cyan tabular-nums shrink-0">${item.valor > 0 ? fmtM(item.valor) : "Por definir"}</span>
                      </li>`
                      )
                      .join("")}
                  </ul>`
                : `<p class="text-xs text-slate-400 py-2">No hay hitos de facturación ni cortes pendientes programados para los próximos 7 días.</p>`
            }
          </div>
        </div>
      </div>`
    );

    // ------------------------------------------------------------------
    // SLIDE 11 — Facturación acumulada [año actual]
    // ------------------------------------------------------------------
    const mesesAnio = Array.from({ length: 12 }, (_, m) => {
      const d = new Date(anioActual, m, 1);
      const labelCorto = d.toLocaleDateString("es-CO", { month: "short" }).replace(".", "");
      const labelLargo = d.toLocaleDateString("es-CO", { month: "long" });
      const labelLargoCap = labelLargo.charAt(0).toUpperCase() + labelLargo.slice(1);

      const fm = facturasUnificadas.filter((f) => {
        const fd = parseDateISO(f.fecha_emision);
        return fd && fd.getFullYear() === anioActual && fd.getMonth() === m;
      });

      let pctronic = 0;
      let integra = 0;
      let otras = 0;
      fm.forEach((f) => {
        const proy = f.proyectos || proyMap.get(f.proyecto_id);
        const empNom = empresaNombrePorId(proy?.empresa_id, proy?.empresas);
        const info = clasificarEmpresaColor(empNom);
        const v = Number(f.valor || 0);
        if (info.key === "integra") integra += v;
        else if (info.key === "pctronic") pctronic += v;
        else otras += v;
      });

      return {
        m,
        labelCorto,
        labelLargoCap,
        pctronic,
        integra,
        otras,
        total: pctronic + integra + otras,
      };
    });

    const totPctAnio = mesesAnio.reduce((s, x) => s + x.pctronic, 0);
    const totIntAnio = mesesAnio.reduce((s, x) => s + x.integra, 0);
    const totOtrasAnio = mesesAnio.reduce((s, x) => s + x.otras, 0);
    const totGenAnio = totPctAnio + totIntAnio + totOtrasAnio;
    const tieneOtras = totOtrasAnio > 0;

    const pctPctShare = totGenAnio > 0 ? (totPctAnio / totGenAnio) * 100 : 0;
    const pctIntShare = totGenAnio > 0 ? (totIntAnio / totGenAnio) * 100 : 0;
    const pctOtrasShare = totGenAnio > 0 ? (totOtrasAnio / totGenAnio) * 100 : 0;

    // Tabla de Enero hasta el mes actual (incluyendo cualquier mes posterior si ya tiene facturación registrada)
    const ultimoMesTabla = Math.max(
      mesActual,
      ...mesesAnio.filter((x) => x.total > 0).map((x) => x.m)
    );
    const mesesTabla = mesesAnio.slice(0, ultimoMesTabla + 1);

    const filas11 = mesesTabla
      .map(
        (x) => `
        <tr class="border-b border-slate-100 last:border-0 ${x.m === mesActual ? "bg-sky-50/50" : ""}">
          <td class="px-2.5 py-2 font-semibold comite-text-navy">${escapeHtml(x.labelLargoCap)}</td>
          <td class="px-2.5 py-2 tabular-nums text-right comite-text-cyan font-medium">${fmtM(x.pctronic)}</td>
          <td class="px-2.5 py-2 tabular-nums text-right comite-text-navy font-medium">${fmtM(x.integra)}</td>
          ${tieneOtras ? `<td class="px-2.5 py-2 tabular-nums text-right text-slate-600">${fmtM(x.otras)}</td>` : ""}
          <td class="px-2.5 py-2 tabular-nums text-right font-bold comite-text-navy">${fmtM(x.total)}</td>
        </tr>`
      )
      .join("");

    const maxMesAnio = Math.max(1, ...mesesAnio.map((x) => x.total));
    const barras11 = mesesAnio
      .map((x) => {
        const hInt = x.integra > 0 ? Math.max(3, Math.round((x.integra / maxMesAnio) * 100)) : 0;
        const hPct = x.pctronic > 0 ? Math.max(3, Math.round((x.pctronic / maxMesAnio) * 100)) : 0;
        const hOtr = x.otras > 0 ? Math.max(3, Math.round((x.otras / maxMesAnio) * 100)) : 0;
        const sumH = hInt + hPct + hOtr;
        const escala = sumH > 100 ? 100 / sumH : 1;
        return `
        <div class="flex-1 flex flex-col items-center gap-1 min-w-0">
          <span class="text-[9px] font-bold tabular-nums comite-text-navy h-3.5 leading-tight truncate max-w-full" title="${escapeHtml(fmtM(x.total))}">
            ${x.total > 0 ? fmtMCorto(x.total) : ""}
          </span>
          <div class="w-full h-44 flex flex-col justify-end items-center px-0.5">
            <div class="w-full max-w-[24px] flex flex-col justify-end h-full">
              ${hOtr > 0 ? `<div class="w-full rounded-t-sm" style="height:${Math.round(hOtr * escala)}%; background:#64748B"></div>` : ""}
              ${hPct > 0 ? `<div class="w-full comite-bg-cyan ${hOtr === 0 ? "rounded-t-sm" : ""}" style="height:${Math.round(hPct * escala)}%"></div>` : ""}
              ${hInt > 0 ? `<div class="w-full comite-bg-navy ${hOtr === 0 && hPct === 0 ? "rounded-t-sm" : ""}" style="height:${Math.round(hInt * escala)}%"></div>` : ""}
            </div>
          </div>
          <span class="text-[10px] font-semibold capitalize ${x.m === mesActual ? "comite-text-cyan font-bold" : "text-slate-500"}">${escapeHtml(x.labelCorto)}</span>
        </div>`;
      })
      .join("");

    const slide11 = slideChrome(
      "11",
      "FACTURACIÓN ANUAL",
      `Facturación acumulada ${anioActual}`,
      "Desempeño mensual acumulado por empresa en el año en curso",
      `
      <div class="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div class="lg:col-span-5 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table class="w-full text-left text-[11px]">
            <thead class="comite-bg-navy uppercase text-white">
              <tr>
                <th class="px-2.5 py-2.5">Mes</th>
                <th class="px-2.5 py-2.5 text-right">Pctronic</th>
                <th class="px-2.5 py-2.5 text-right">Grupo Integra</th>
                ${tieneOtras ? `<th class="px-2.5 py-2.5 text-right">Otras</th>` : ""}
                <th class="px-2.5 py-2.5 text-right">Total</th>
              </tr>
            </thead>
            <tbody>${filas11}</tbody>
            <tfoot class="bg-slate-100 font-bold comite-text-navy border-t-2 border-slate-300">
              <tr>
                <td class="px-2.5 py-2.5">Total ${anioActual}</td>
                <td class="px-2.5 py-2.5 text-right tabular-nums comite-text-cyan">${fmtM(totPctAnio)}</td>
                <td class="px-2.5 py-2.5 text-right tabular-nums">${fmtM(totIntAnio)}</td>
                ${tieneOtras ? `<td class="px-2.5 py-2.5 text-right tabular-nums text-slate-600">${fmtM(totOtrasAnio)}</td>` : ""}
                <td class="px-2.5 py-2.5 text-right tabular-nums">${fmtM(totGenAnio)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div class="lg:col-span-7 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex flex-col justify-between">
          <div class="flex flex-wrap items-end justify-between gap-3 border-b border-slate-100 pb-4 mb-4">
            <div>
              <p class="text-[11px] font-bold uppercase tracking-wider text-slate-400">TOTAL ACUMULADO ${anioActual}</p>
              <p class="mt-1 text-3xl sm:text-4xl font-bold tabular-nums comite-text-navy">${fmtM(totGenAnio)}</p>
            </div>
            <div class="flex flex-wrap items-center gap-3 text-xs font-semibold">
              <span class="inline-flex items-center gap-1.5 text-slate-700">
                <span class="h-2.5 w-2.5 rounded-sm comite-bg-cyan"></span>
                Pctronic · ${fmtPct(pctPctShare)}
              </span>
              <span class="inline-flex items-center gap-1.5 text-slate-700">
                <span class="h-2.5 w-2.5 rounded-sm comite-bg-navy"></span>
                Grupo Integra · ${fmtPct(pctIntShare)}
              </span>
              ${
                tieneOtras
                  ? `<span class="inline-flex items-center gap-1.5 text-slate-700">
                      <span class="h-2.5 w-2.5 rounded-sm" style="background:#64748B"></span>
                      Otras · ${fmtPct(pctOtrasShare)}
                    </span>`
                  : ""
              }
            </div>
          </div>
          <div class="flex items-end gap-1.5 border-b border-slate-200 pb-2 pt-2">${barras11}</div>
        </div>
      </div>`
    );

    return [
      { num: "01", titulo: "Portada", html: slide01 },
      { num: "02", titulo: "El mes en cifras", html: slide02 },
      { num: "03", titulo: "Ingresos de la semana", html: slide03 },
      { num: "04", titulo: "Estado de proyectos", html: slide04 },
      { num: "05", titulo: "Resumen financiero", html: slide05 },
      { num: "06", titulo: "Presupuesto: papel vs. real", html: slide06 },
      { num: "07", titulo: "Facturación pendiente", html: slide07 },
      { num: "08", titulo: "Servicios y mantenimientos", html: slide08 },
      { num: "09", titulo: `Facturación de ${nombreMes}`, html: slide09 },
      { num: "10", titulo: `Detalle facturación ${nombreMes}`, html: slide10 },
      { num: "11", titulo: `Facturación acumulada ${anioActual}`, html: slide11 },
    ];
  }

  function poblarSelectorSlides() {
    const sel = document.getElementById("select-comite-slide");
    if (!sel) return;
    sel.innerHTML = comiteSlides
      .map(
        (s, i) =>
          `<option value="${i}">${s.num} / ${String(comiteSlides.length).padStart(2, "0")} · ${escapeHtml(s.titulo)}</option>`
      )
      .join("");
    sel.value = String(comiteSlideActual);
  }

  function sincronizarPrintComite() {
    const printCont = document.getElementById("comite-print-all");
    if (!printCont) return;
    printCont.innerHTML = comiteSlides.map((s) => `<div class="comite-print-slide">${s.html}</div>`).join("");
  }

  function renderSlideComite() {
    const slide = comiteSlides[comiteSlideActual];
    if (!slide) return;
    const cont = document.getElementById("comite-contenido");
    if (cont) {
      cont.innerHTML = slide.html;
      cont.scrollTop = 0;
    }
    const sel = document.getElementById("select-comite-slide");
    if (sel) sel.value = String(comiteSlideActual);
    const ind = document.getElementById("comite-indicador");
    if (ind) ind.textContent = `${slide.num} / ${String(comiteSlides.length).padStart(2, "0")} — ${slide.titulo}`;
    const btnAnt = document.getElementById("btn-comite-anterior");
    const btnSig = document.getElementById("btn-comite-siguiente");
    if (btnAnt) btnAnt.disabled = comiteSlideActual === 0;
    if (btnSig) btnSig.disabled = comiteSlideActual === comiteSlides.length - 1;
  }

  function actualizarBotonFullscreen() {
    const activo = Boolean(document.fullscreenElement || document.webkitFullscreenElement);
    const icon = document.getElementById("comite-fs-icon");
    const lbl = document.getElementById("comite-fs-label");
    if (icon) icon.textContent = activo ? "fullscreen_exit" : "fullscreen";
    if (lbl) lbl.textContent = activo ? "Salir pantalla completa" : "Pantalla completa";
  }

  function entrarFullscreen() {
    try {
      const el = document.documentElement;
      if (el.requestFullscreen) {
        el.requestFullscreen().catch(() => {});
      } else if (el.webkitRequestFullscreen) {
        el.webkitRequestFullscreen();
      }
    } catch (e) {
      /* navegador bloqueó fullscreen; continúa en modo modal pantalla completa */
    }
  }

  function salirFullscreen() {
    try {
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      } else if (document.webkitFullscreenElement && document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      }
    } catch (e) {
      /* no crítico */
    }
  }

  function toggleFullscreenComite() {
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      salirFullscreen();
    } else {
      entrarFullscreen();
    }
  }

  function abrirModoComite() {
    comiteSlides = construirSlidesComite();
    comiteSlideActual = 0;
    poblarSelectorSlides();
    renderSlideComite();
    sincronizarPrintComite();
    const overlay = document.getElementById("modo-comite");
    overlay.classList.remove("hidden");
    overlay.classList.add("flex");
    entrarFullscreen();
    actualizarBotonFullscreen();
  }

  function cerrarModoComite() {
    const overlay = document.getElementById("modo-comite");
    overlay.classList.add("hidden");
    overlay.classList.remove("flex");
    salirFullscreen();
  }

  // Delegación para selector de rango en Slide 03 (sin onclick inline)
  document.getElementById("comite-contenido")?.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-ingresos-periodo]");
    if (!btn) return;
    ingresosPeriodo = btn.dataset.ingresosPeriodo || "7d";
    comiteSlides = construirSlidesComite();
    poblarSelectorSlides();
    renderSlideComite();
    sincronizarPrintComite();
  });

  document.getElementById("btn-modo-comite")?.addEventListener("click", abrirModoComite);
  document.getElementById("btn-imprimir-comite")?.addEventListener("click", () => window.print());
  document.getElementById("btn-cerrar-comite")?.addEventListener("click", cerrarModoComite);
  document.getElementById("btn-comite-fullscreen")?.addEventListener("click", toggleFullscreenComite);
  document.getElementById("select-comite-slide")?.addEventListener("change", (e) => {
    const idx = Number(e.target.value);
    if (Number.isInteger(idx) && idx >= 0 && idx < comiteSlides.length) {
      comiteSlideActual = idx;
      renderSlideComite();
    }
  });
  document.getElementById("btn-comite-anterior")?.addEventListener("click", () => {
    if (comiteSlideActual > 0) {
      comiteSlideActual--;
      renderSlideComite();
    }
  });
  document.getElementById("btn-comite-siguiente")?.addEventListener("click", () => {
    if (comiteSlideActual < comiteSlides.length - 1) {
      comiteSlideActual++;
      renderSlideComite();
    }
  });

  document.addEventListener("fullscreenchange", actualizarBotonFullscreen);
  document.addEventListener("webkitfullscreenchange", actualizarBotonFullscreen);

  document.addEventListener("keydown", (e) => {
    const overlay = document.getElementById("modo-comite");
    if (!overlay || overlay.classList.contains("hidden")) return;
    const tag = (e.target?.tagName || "").toUpperCase();
    const enControl = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";

    if (e.key === "Escape") {
      cerrarModoComite();
      return;
    }
    if (enControl) return;

    if (e.key === "ArrowRight" || e.key === "PageDown") {
      e.preventDefault();
      document.getElementById("btn-comite-siguiente")?.click();
    } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
      e.preventDefault();
      document.getElementById("btn-comite-anterior")?.click();
    } else if (e.key === "f" || e.key === "F") {
      e.preventDefault();
      toggleFullscreenComite();
    }
  });
})();
