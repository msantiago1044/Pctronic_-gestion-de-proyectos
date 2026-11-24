// ============================================================================
// PROYECTOS · pestaña GASTOS (vista consolidada de todo el dinero que sale:
// Compras OCs, gastos manuales, pagos de cortes contratista y técnicos propios).
// ============================================================================
(function (PCT) {
  const TIPOS_GASTO_MANUAL = [
    { id: "Material", badge: "bg-blue-100 text-blue-800" },
    { id: "Equipo", badge: "bg-indigo-100 text-indigo-800" },
    { id: "Suministro", badge: "bg-cyan-100 text-cyan-800" },
    { id: "Alquiler", badge: "bg-amber-100 text-amber-800" },
    { id: "Transporte", badge: "bg-purple-100 text-purple-800" },
    { id: "Mano de obra contratista", badge: "bg-emerald-100 text-emerald-800" },
  ];

  const TIPOS_GASTO = [
    ...TIPOS_GASTO_MANUAL,
    { id: "Mano de obra propia", badge: "bg-slate-200 text-slate-800" },
  ];

  const badgeTipo = (tipo) => {
    const info = TIPOS_GASTO.find((t) => t.id === tipo) || { id: tipo || "Otro", badge: "bg-gray-100 text-gray-700" };
    return `<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${info.badge}">${escapeHtml(info.id)}</span>`;
  };

  PCT.renderGastos = async (root) => {
    const pid = PCT.estado.proyecto.id;
    let gastos = [];
    let moPropia = [];
    let cortesMo = [];
    let cortesMoItems = [];
    let proveedores = [];
    let filtroTipo = "";
    let busqueda = "";

    root.innerHTML = `
      <div class="space-y-5">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 class="text-base font-bold text-gray-900">Control de Gastos del Proyecto</h2>
            <p class="text-xs text-gray-500">Vista unificada de órdenes de compra, gastos manuales, pagos a contratistas y técnicos propios.</p>
          </div>
          <button type="button" id="btn-nuevo-gasto" class="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 shadow-sm">
            <span class="material-symbols-outlined text-[18px]">add</span> Registrar gasto manual
          </button>
        </div>

        <div id="gastos-kpis" class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"></div>

        <div id="gastos-cortes-mo-resumen" class="hidden"></div>

        <div class="rounded-xl border border-gray-200 bg-white p-4">
          <p class="mb-3 text-xs font-bold uppercase tracking-wider text-gray-500">Desglose por tipo de gasto</p>
          <div id="gastos-desglose" class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"></div>
        </div>

        <div class="flex flex-wrap items-center justify-between gap-3">
          <div id="gastos-filtros" class="flex flex-wrap gap-2"></div>
          <div class="relative w-64">
            <span class="material-symbols-outlined absolute left-3 top-2 text-[18px] text-gray-400">search</span>
            <input type="search" id="gastos-busqueda" placeholder="Buscar descripción, doc, proveedor..."
              class="w-full rounded-lg border-gray-300 pl-9 py-1.5 text-xs focus:border-primary focus:ring-primary" />
          </div>
        </div>

        <div class="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table class="w-full text-left text-sm">
            <thead class="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th class="px-4 py-3">Fecha</th>
                <th class="px-4 py-3">Tipo</th>
                <th class="px-4 py-3">Proveedor / Técnico</th>
                <th class="px-4 py-3">Documento</th>
                <th class="px-4 py-3">Descripción / Ítem</th>
                <th class="px-4 py-3 text-right">Cant.</th>
                <th class="px-4 py-3 text-right">V. Unitario</th>
                <th class="px-4 py-3 text-right">V. Total</th>
                <th class="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody id="gastos-tabla"></tbody>
          </table>
        </div>
      </div>`;

    const construirFilasMoPropia = () =>
      moPropia.map((r) => {
        const tarifa =
          (PCT.estado.tarifas || []).find((t) => t.id === r.tarifa_id) || r.tarifas_tecnicos || null;
        const valorTotal = PCT.calcValorMoPropia(r, PCT.estado.tarifas, PCT.estado.proyecto);
        const horas = PCT.calcHorasMoPropia(r, PCT.estado.tarifas);
        const valorUnit = horas > 0 ? Math.round(valorTotal / horas) : PCT.num(tarifa?.valor_hora);
        const detalleHoras =
          `${PCT.fmtCant(r.dias)} d · ${PCT.fmtCant(horas)} h` +
          (PCT.num(r.horas_extra) > 0 ? ` (+${PCT.fmtCant(r.horas_extra)} h extra)` : "");
        return {
          id: `mo-propia-${r.id}`,
          fecha: r.fecha,
          created_at: r.created_at,
          tipo: "Mano de obra propia",
          proveedor_texto: `${r.tecnico || "Técnico propio"}${tarifa?.cargo ? ` (${tarifa.cargo})` : ""}`,
          documento: "MO Propia",
          presupuesto_items: r.presupuesto_items || null,
          descripcion: r.observaciones ? `${r.observaciones} · ${detalleHoras}` : `Jornada técnica propia · ${detalleHoras}`,
          cantidad: horas,
          valor_unitario: valorUnit,
          valor_total: valorTotal,
          observaciones: r.observaciones || "",
          _esMoPropia: true,
          _sufijoCant: " h",
        };
      });

    const pintar = () => {
      const filasMoPropia = construirFilasMoPropia();
      const todos = [...gastos, ...filasMoPropia].sort((a, b) => {
        const fa = String(a.fecha || "");
        const fb = String(b.fecha || "");
        if (fa !== fb) return fb.localeCompare(fa);
        return String(b.created_at || "").localeCompare(String(a.created_at || ""));
      });

      const totalGastosTabla = gastos.reduce((s, g) => s + PCT.num(g.valor_total), 0);
      const totalMoPropia = filasMoPropia.reduce((s, g) => s + PCT.num(g.valor_total), 0);
      const totalGastado = totalGastosTabla + totalMoPropia;

      const { base, adic } = PCT.resumenPresupuesto();
      const presupuestoCostos = base.costo + adic.costo;
      const contrato = PCT.contrato();
      const mg = PCT.margenActual(PCT.estado.proyecto, {
        ...PCT.estado.finanzas,
        gastado: totalGastado,
      });

      const pctEjecCosto = presupuestoCostos > 0 ? totalGastado / presupuestoCostos : null;
      const colorMg = mg.margen > 0 ? "text-emerald-600" : mg.margen < 0 ? "text-red-600" : "text-gray-900";
      const subGastado =
        totalMoPropia > 0
          ? `${todos.length} reg. · Compras/Gastos ${formatoMoneda(totalGastosTabla)} · MO propia ${formatoMoneda(totalMoPropia)}`
          : `${todos.length} registro${todos.length === 1 ? "" : "s"}`;

      root.querySelector("#gastos-kpis").innerHTML = `
        <div class="rounded-xl border border-gray-200 bg-white p-4">
          <p class="text-[11px] font-semibold uppercase text-gray-500">Total Gastado</p>
          <p class="mt-1 text-xl font-bold tabular-nums text-gray-900">${formatoMoneda(totalGastado)}</p>
          <p class="mt-1 text-xs text-gray-400">${subGastado}</p>
        </div>
        <div class="rounded-xl border border-gray-200 bg-white p-4">
          <p class="text-[11px] font-semibold uppercase text-gray-500">Presupuesto de Costos</p>
          <p class="mt-1 text-xl font-bold tabular-nums text-gray-900">${formatoMoneda(presupuestoCostos)}</p>
          <p class="mt-1 text-xs ${pctEjecCosto !== null && pctEjecCosto > 1 ? "text-red-600 font-semibold" : "text-gray-400"}">
            ${pctEjecCosto !== null ? `${PCT.fmtPct(pctEjecCosto)} ejecutado` : "Sin presupuesto cargado"}
          </p>
        </div>
        <div class="rounded-xl border border-gray-200 bg-white p-4">
          <p class="text-[11px] font-semibold uppercase text-gray-500">Margen Bruto Actual</p>
          <p class="mt-1 text-xl font-bold tabular-nums ${colorMg}">${formatoMoneda(mg.margen)}</p>
          <p class="mt-1 text-xs text-gray-400">Facturado ${formatoMoneda(mg.facturado)}${mg.pct !== null ? ` · ${PCT.fmtPct(mg.pct)}` : ""}</p>
        </div>
        <div class="rounded-xl border border-gray-200 bg-white p-4">
          <p class="text-[11px] font-semibold uppercase text-gray-500">Ingreso Neto Contrato</p>
          <p class="mt-1 text-xl font-bold tabular-nums text-gray-900">${formatoMoneda(contrato.ingreso)}</p>
          <p class="mt-1 text-xs text-gray-400">Total contrato ${formatoMoneda(contrato.total)}</p>
        </div>`;

      // Estado de cortes de contratista pendientes de pago
      const TIPO_GASTO_MO = "Mano de obra contratista";
      const esGastoDeCorte = (g, corte) => {
        if (!g || !corte) return false;
        if (g.corte_mo_id && g.corte_mo_id === corte.id) return true;
        if (g.corte_mo_id && g.corte_mo_id !== corte.id) return false;
        const esTipoMo =
          g.tipo === TIPO_GASTO_MO ||
          String(g.categoria || "").toLowerCase().replace(/\s+/g, "_") === "mano_obra" ||
          String(g.categoria || "").toLowerCase().includes("mano de obra");
        if (!esTipoMo) return false;
        const reNum = new RegExp(`corte\\s*(?:n[°º]?\\s*)?${corte.numero}(?:\\b|\\s|$)`, "i");
        return (
          reNum.test(String(g.descripcion || "")) ||
          String(g.documento || "").trim().toLowerCase() === `corte ${corte.numero}`
        );
      };
      const extraerPagadoDeGasto = (g) => {
        const obs = String(g?.observaciones || "");
        const m = obs.match(/\[PAGADO_MO:(\d+(?:\.\d+)?)\]/);
        if (m) return PCT.num(m[1]);
        if (/pendiente de pago/i.test(obs)) return 0;
        return PCT.num(g?.valor_total);
      };

      const resumenCortesEl = root.querySelector("#gastos-cortes-mo-resumen");
      const resumenCortes = cortesMo.map((c) => {
        const bruto = cortesMoItems
          .filter((l) => l.corte_id === c.id)
          .reduce((s, l) => s + PCT.num(l.cantidad) * PCT.num(l.pu_contratista_snapshot), 0);
        const pagado = gastos
          .filter((g) => esGastoDeCorte(g, c))
          .reduce((s, g) => s + extraerPagadoDeGasto(g), 0);
        const saldo = Math.max(0, bruto - pagado);
        return { corte: c, bruto, pagado, saldo };
      });
      const cortesPendientes = resumenCortes.filter((x) => x.saldo > 0.5);
      if (cortesPendientes.length > 0) {
        const totalSaldoPend = cortesPendientes.reduce((s, x) => s + x.saldo, 0);
        resumenCortesEl.className = "rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-2";
        resumenCortesEl.innerHTML = `
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex items-center gap-2 text-amber-900">
              <span class="material-symbols-outlined text-[18px]" aria-hidden="true">pending_actions</span>
              <p class="text-xs font-bold">
                ${cortesPendientes.length} corte${cortesPendientes.length === 1 ? "" : "s"} de contratista con saldo pendiente de pago
              </p>
            </div>
            <span class="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold tabular-nums text-amber-900">
              Saldo pendiente: ${formatoMoneda(totalSaldoPend)}
            </span>
          </div>
          <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            ${cortesPendientes
              .map(
                ({ corte, bruto, pagado, saldo }) => `
              <div class="rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs">
                <div class="flex items-center justify-between gap-2">
                  <span class="font-bold text-gray-900">Corte N° ${corte.numero}</span>
                  <span class="text-[11px] text-gray-500">${formatoFecha(corte.fecha)}</span>
                </div>
                <p class="mt-0.5 text-[11px] text-gray-600 truncate">${escapeHtml(corte.contratistas?.nombre || PCT.estado.proyecto?.contratista?.nombre || "Contratista")}${corte.numero_cuenta_cobro ? ` · Doc. ${escapeHtml(corte.numero_cuenta_cobro)}` : ""}</p>
                <div class="mt-1 flex items-center justify-between text-[11px]">
                  <span class="text-gray-500">Corte ${formatoMoneda(bruto)} · Pagado ${formatoMoneda(pagado)}</span>
                  <span class="font-bold tabular-nums text-amber-800">Saldo ${formatoMoneda(saldo)}</span>
                </div>
              </div>`
              )
              .join("")}
          </div>
          <p class="text-[11px] text-amber-800">
            Los pagos de cortes de contratista se incorporan automáticamente a esta tabla cuando los registras en la pestaña <strong>Mano de obra</strong>.
          </p>`;
      } else {
        resumenCortesEl.className = "hidden";
        resumenCortesEl.innerHTML = "";
      }

      root.querySelector("#gastos-desglose").innerHTML = TIPOS_GASTO.map((t) => {
        const sub = todos.filter((g) => g.tipo === t.id).reduce((s, g) => s + PCT.num(g.valor_total), 0);
        const pct = totalGastado > 0 ? (sub / totalGastado) * 100 : 0;
        return `
          <div class="rounded-lg border border-gray-100 bg-gray-50/70 p-2.5">
            <span class="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${t.badge}">${escapeHtml(t.id)}</span>
            <p class="mt-1.5 text-sm font-bold tabular-nums text-gray-900">${formatoMoneda(sub)}</p>
            <p class="text-[10px] text-gray-400">${pct.toFixed(1)}% del gasto</p>
          </div>`;
      }).join("");

      root.querySelector("#gastos-filtros").innerHTML = [["", "Todos"], ...TIPOS_GASTO.map((t) => [t.id, t.id])]
        .map(
          ([v, l]) =>
            `<button type="button" data-tipo="${escapeHtml(v)}" class="rounded-full border px-3 py-1 text-xs font-semibold ${
              filtroTipo === v ? "border-primary bg-blue-50 text-primary" : "border-gray-300 text-gray-600 hover:bg-gray-50"
            }">${escapeHtml(l)}</button>`
        )
        .join("");

      const q = busqueda.trim().toLowerCase();
      const lista = todos.filter((g) => {
        if (filtroTipo && g.tipo !== filtroTipo) return false;
        if (!q) return true;
        const txt = [
          g.descripcion,
          g.documento,
          g.proveedores?.nombre,
          g.proveedor_texto,
          g.presupuesto_items?.descripcion,
          g.observaciones,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return txt.includes(q);
      });

      root.querySelector("#gastos-tabla").innerHTML = lista.length
        ? lista
            .map((g) => {
              const prov = g.proveedores?.nombre || g.proveedor_texto || "—";
              const desc = g.descripcion || g.presupuesto_items?.descripcion || "—";
              const itemLink = g.presupuesto_items?.descripcion && g.descripcion ? `<div class="text-[11px] text-gray-400">Ítem: ${escapeHtml(g.presupuesto_items.descripcion)}</div>` : "";
              const esOc = !g._esMoPropia && Boolean(g.orden_compra_id || /^(OC|PRE)-/i.test(g.documento || ""));
              const docBadge = esOc
                ? `<span class="ml-1 inline-flex rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-primary">OC</span>`
                : "";
              const puedeEliminarGasto = Boolean(window.PCT_ROL_INFO?.esSuperUsuario);
              const accionCell = g._esMoPropia
                ? `<span class="inline-flex rounded bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500" title="Edita o elimina este registro en la pestaña Mano de obra">Mano de obra</span>`
                : puedeEliminarGasto
                  ? `<button type="button" data-borrar-gasto class="text-gray-400 hover:text-red-600" title="Eliminar gasto">
                      <span class="material-symbols-outlined text-[18px]">delete</span>
                    </button>`
                  : "";
              return `
                <tr class="border-t border-gray-100 ${g._esMoPropia ? "bg-slate-50/50" : "hover:bg-gray-50/60"}" data-id="${escapeHtml(g.id)}">
                  <td class="whitespace-nowrap px-4 py-2.5 text-xs text-gray-600">${formatoFecha(g.fecha)}</td>
                  <td class="whitespace-nowrap px-4 py-2.5">${badgeTipo(g.tipo)}</td>
                  <td class="px-4 py-2.5 text-xs font-medium text-gray-800">${escapeHtml(prov)}</td>
                  <td class="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">${escapeHtml(g.documento || "—")}${docBadge}</td>
                  <td class="px-4 py-2.5 text-xs text-gray-700">${escapeHtml(desc)}${itemLink}</td>
                  <td class="px-4 py-2.5 text-right text-xs tabular-nums text-gray-600">${PCT.fmtCant(g.cantidad ?? 1)}${g._sufijoCant || ""}</td>
                  <td class="px-4 py-2.5 text-right text-xs tabular-nums text-gray-600">${formatoMoneda(g.valor_unitario)}</td>
                  <td class="px-4 py-2.5 text-right text-xs font-bold tabular-nums text-gray-900">${formatoMoneda(g.valor_total)}</td>
                  <td class="px-4 py-2.5 text-right whitespace-nowrap">${accionCell}</td>
                </tr>`;
            })
            .join("")
        : `<tr><td colspan="9" class="px-4 py-8 text-center text-gray-400">No hay gastos registrados con los filtros actuales.</td></tr>`;
    };

    const cargarMoPropiaSeguro = async () => {
      try {
        let res = await window.sb
          .from("registro_mo_propia")
          .select("*, tarifas_tecnicos(cargo, valor_hora, horas_dia), presupuesto_items(descripcion)")
          .eq("proyecto_id", pid)
          .order("fecha", { ascending: false })
          .order("created_at", { ascending: false });
        if (res.error) {
          res = await window.sb
            .from("registro_mo_propia")
            .select("*")
            .eq("proyecto_id", pid)
            .order("fecha", { ascending: false });
        }
        return res.error ? [] : res.data || [];
      } catch (e) {
        return [];
      }
    };

    const cargarCortesMoSeguro = async () => {
      try {
        let resC = await window.sb
          .from("cortes_mo")
          .select("id, numero, fecha, numero_cuenta_cobro, retencion_porcentaje, contratistas(nombre)")
          .eq("proyecto_id", pid)
          .order("numero", { ascending: true });
        if (resC.error) {
          resC = await window.sb
            .from("cortes_mo")
            .select("id, numero, fecha, numero_cuenta_cobro, retencion_porcentaje")
            .eq("proyecto_id", pid)
            .order("numero", { ascending: true });
        }
        if (resC.error || !Array.isArray(resC.data) || !resC.data.length) {
          return { cortes: [], items: [] };
        }
        const ids = resC.data.map((c) => c.id);
        const resIt = await window.sb
          .from("cortes_mo_items")
          .select("corte_id, cantidad, pu_contratista_snapshot")
          .in("corte_id", ids);
        return {
          cortes: resC.data,
          items: resIt.error ? [] : resIt.data || [],
        };
      } catch (e) {
        return { cortes: [], items: [] };
      }
    };

    const cargar = async () => {
      const [resG, resP, resMoPropia, resCortes] = await Promise.all([
        window.sb
          .from("gastos")
          .select("*, proveedores(nombre), presupuesto_items(descripcion)")
          .eq("proyecto_id", pid)
          .order("fecha", { ascending: false })
          .order("created_at", { ascending: false }),
        proveedores.length
          ? Promise.resolve({ data: proveedores, error: null })
          : window.sb.from("proveedores").select("id, nombre").order("nombre"),
        cargarMoPropiaSeguro(),
        cargarCortesMoSeguro(),
      ]);
      if (resG.error) throw resG.error;
      if (resP.error) throw resP.error;
      gastos = resG.data || [];
      proveedores = resP.data || [];
      moPropia = resMoPropia || [];
      cortesMo = resCortes.cortes || [];
      cortesMoItems = resCortes.items || [];
      pintar();
    };

    const abrirModalNuevo = () => {
      const itemsPpto = (PCT.estado.items || []).filter((i) => i.tipo === "item");
      const { el } = PCT.modal({
        titulo: "Registrar gasto manual",
        ancho: "max-w-lg",
        html: `
          <div class="space-y-3 text-xs">
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="mb-1 block font-medium text-gray-700">Fecha *</label>
                <input type="date" id="g-fecha" value="${PCT.hoyISO()}" class="w-full rounded-lg border-gray-300 text-xs" />
              </div>
              <div>
                <label class="mb-1 block font-medium text-gray-700">Tipo *</label>
                <select id="g-tipo" class="w-full rounded-lg border-gray-300 text-xs">
                  ${TIPOS_GASTO_MANUAL.map((t) => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.id)}</option>`).join("")}
                </select>
              </div>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="mb-1 block font-medium text-gray-700">Proveedor (catálogo)</label>
                <select id="g-prov-id" class="w-full rounded-lg border-gray-300 text-xs">
                  <option value="">Otro / especificar abajo</option>
                  ${proveedores.map((p) => `<option value="${p.id}">${escapeHtml(p.nombre)}</option>`).join("")}
                </select>
              </div>
              <div>
                <label class="mb-1 block font-medium text-gray-700">Proveedor (texto libre)</label>
                <input type="text" id="g-prov-txt" placeholder="Nombre si no está en catálogo" class="w-full rounded-lg border-gray-300 text-xs" />
              </div>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="mb-1 block font-medium text-gray-700">N° Factura / Documento</label>
                <input type="text" id="g-doc" placeholder="Ej. FAC-1024 / OC-45" class="w-full rounded-lg border-gray-300 text-xs" />
              </div>
              <div>
                <label class="mb-1 block font-medium text-gray-700">Ítem del presupuesto (opcional)</label>
                <select id="g-item-id" class="w-full rounded-lg border-gray-300 text-xs">
                  <option value="">Sin vincular</option>
                  ${itemsPpto.map((i) => `<option value="${i.id}">${escapeHtml((i.codigo ? i.codigo + " · " : "") + i.descripcion)}</option>`).join("")}
                </select>
              </div>
            </div>
            <div>
              <label class="mb-1 block font-medium text-gray-700">Descripción *</label>
              <input type="text" id="g-desc" placeholder="Detalle del gasto o compra" class="w-full rounded-lg border-gray-300 text-xs" />
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="mb-1 block font-medium text-gray-700">Cantidad</label>
                <input type="number" id="g-cant" min="0.01" step="0.01" value="1" class="w-full rounded-lg border-gray-300 text-xs" />
              </div>
              <div>
                <label class="mb-1 block font-medium text-gray-700">Valor unitario (COP) *</label>
                <input type="text" id="g-vunit" inputmode="decimal" placeholder="0" class="input-moneda w-full rounded-lg border-gray-300 text-xs font-semibold" />
              </div>
            </div>
            <div>
              <label class="mb-1 block font-medium text-gray-700">Observaciones</label>
              <textarea id="g-obs" rows="2" class="w-full rounded-lg border-gray-300 text-xs" placeholder="Notas adicionales..."></textarea>
            </div>
          </div>`,
        botones: [
          { texto: "Cancelar" },
          {
            texto: "Guardar gasto",
            clase: PCT.BTN_PRIMARIO,
            onClick: async ({ el: modalEl }) => {
              const fecha = modalEl.querySelector("#g-fecha").value || PCT.hoyISO();
              const tipo = modalEl.querySelector("#g-tipo").value;
              const proveedor_id = modalEl.querySelector("#g-prov-id").value || null;
              const proveedor_texto = modalEl.querySelector("#g-prov-txt").value.trim() || null;
              const documento = modalEl.querySelector("#g-doc").value.trim() || null;
              const presupuesto_item_id = modalEl.querySelector("#g-item-id").value || null;
              const descripcion = modalEl.querySelector("#g-desc").value.trim();
              const cantidad = PCT.num(modalEl.querySelector("#g-cant").value);
              const valor_unitario = valorMoneda(modalEl.querySelector("#g-vunit"));
              const observaciones = modalEl.querySelector("#g-obs").value.trim() || null;

              if (!descripcion) {
                mostrarAviso("Escribe una descripción del gasto", "error");
                return false;
              }
              if (cantidad <= 0) {
                mostrarAviso("La cantidad debe ser mayor a 0", "error");
                return false;
              }
              if (valor_unitario <= 0) {
                mostrarAviso("El valor unitario debe ser mayor a 0", "error");
                return false;
              }

              const { error } = await window.sb.from("gastos").insert({
                proyecto_id: pid,
                fecha,
                tipo,
                proveedor_id,
                proveedor_texto,
                documento,
                presupuesto_item_id,
                descripcion,
                cantidad,
                valor_unitario,
                observaciones,
              });
              if (error) {
                manejarError(error, "No se pudo registrar el gasto");
                return false;
              }
              mostrarAviso("Gasto registrado.", "exito");
              await Promise.all([cargar(), PCT.recargarFinanzas()]);
              PCT.emit("ejec");
            },
          },
        ],
      });
      if (typeof activarCamposMoneda === "function") activarCamposMoneda();
      el.querySelector("#g-desc")?.focus();
    };

    root.querySelector("#btn-nuevo-gasto").addEventListener("click", abrirModalNuevo);
    root.querySelector("#gastos-filtros").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-tipo]");
      if (!btn) return;
      filtroTipo = btn.dataset.tipo;
      pintar();
    });
    const pintarDebounced = PCT.debounce(pintar, 200);
    root.querySelector("#gastos-busqueda").addEventListener("input", (e) => {
      busqueda = e.target.value;
      pintarDebounced();
    });
    root.querySelector("#gastos-tabla").addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-borrar-gasto]");
      if (!btn) return;
      const id = btn.closest("tr").dataset.id;
      const ok = await PCT.confirmar("Eliminar gasto", "¿Eliminar este registro de gasto?", "Eliminar", true);
      if (!ok) return;
      const { data, error } = await window.sb.from("gastos").delete().eq("id", id).select("id");
      if (error) return manejarError(error, "No se pudo eliminar el gasto");
      if (!data || data.length === 0) {
        return mostrarAviso("No tienes permisos para eliminar este gasto.", "error");
      }
      mostrarAviso("Gasto eliminado.", "info");
      try {
        await Promise.all([cargar(), PCT.recargarFinanzas()]);
        PCT.emit("ejec");
      } catch (err) {
        manejarError(err, "No se pudieron recargar los gastos");
      }
    });

    try {
      await cargar();
    } catch (err) {
      manejarError(err, "No se pudieron cargar los gastos");
    }
  };
})(window.PCT);
