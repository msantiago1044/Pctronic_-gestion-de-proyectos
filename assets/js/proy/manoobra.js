// ============================================================================
// PROYECTOS · pestaña MANO DE OBRA (hoja MANO DE OBRA de la plantilla v7).
//   1) Contrato del contratista: por ítem, PU de mano de obra presupuestado
//      (cu_mano_obra) y PU pactado con el contratista (pu_contratista) → ahorro.
//   2) Cortes del contratista: se proponen desde lo que el Avance diario marcó
//      como ejecutado por 'contratista' y aún no se le ha cortado (esté pagado
//      o no). Valor = Σ cant × PU contratista; retención según el contratista
//      (persona natural declarante 4 %, no declarante 6 %, empresa 0 %).
//      Los PAGOS se registran como gastos (tipo 'Mano de obra contratista',
//      con corte_mo_id): Gastos sigue siendo la única fuente del dinero que sale.
//   3) Técnicos propios: una fila por técnico y día. Valor = valor_hora ×
//      (días × horas_día + horas_extra × (1 + recargo)).
// ============================================================================
(function (PCT) {
  const CLASE_INPUT = "block w-full rounded-lg border-gray-300 text-sm shadow-sm focus:border-primary focus:ring-primary";
  const CELDA = "w-full rounded border border-transparent bg-transparent px-1.5 py-1 text-right text-xs tabular-nums hover:border-gray-300 focus:border-primary focus:bg-white focus:ring-1 focus:ring-primary";
  const TIPO_GASTO_MO = "Mano de obra contratista";

  PCT.renderManoObra = async (root) => {
    const p = () => PCT.estado.proyecto;
    const pid = PCT.estado.proyecto.id;
    let cortes = []; // cortes_mo
    let lineas = []; // cortes_mo_items
    let pagos = []; // gastos de mano de obra contratista
    let propia = []; // registro_mo_propia

    const promesasGuardadoPendientes = new Set();
    const versionEdicionItem = new Map();

    const soloItems = () => PCT.estado.items.filter((i) => i.tipo === "item");
    const itemPorId = (id) => PCT.estado.items.find((i) => i.id === id);
    const lineasDe = (corteId) => lineas.filter((l) => l.corte_id === corteId);
    const brutoDe = (corteId) => lineasDe(corteId).reduce((s, l) => s + PCT.num(l.cantidad) * PCT.num(l.pu_contratista_snapshot), 0);
    const contratista = () => (p().contratista_principal_id ? { id: p().contratista_principal_id, ...(p().contratista || {}) } : null);

    const esErrorColumnaCorteMoId = (err) =>
      Boolean(
        err &&
          (err.code === "42703" ||
            err.code === "PGRST204" ||
            /corte_mo_id|column/i.test(String(err.message || "")))
      );

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

    const gastosDeCorte = (corte) => (corte ? pagos.filter((g) => esGastoDeCorte(g, corte)) : []);

    const extraerPagadoDeGasto = (g) => {
      const obs = String(g?.observaciones || "");
      const m = obs.match(/\[PAGADO_MO:(\d+(?:\.\d+)?)\]/);
      if (m) return PCT.num(m[1]);
      if (/pendiente de pago/i.test(obs)) return 0;
      return PCT.num(g?.valor_total);
    };

    const esGastoSincronizado = (g) => /\[PAGADO_MO:\d+(?:\.\d+)?\]|pendiente de pago/i.test(String(g?.observaciones || ""));

    const pagadoDe = (corteId) => {
      const corte = cortes.find((x) => x.id === corteId);
      if (!corte) return pagos.filter((g) => g.corte_mo_id === corteId).reduce((s, g) => s + extraerPagadoDeGasto(g), 0);
      return gastosDeCorte(corte).reduce((s, g) => s + extraerPagadoDeGasto(g), 0);
    };

    const calcCorte = (c) => {
      const bruto = brutoDe(c.id);
      const retencion = bruto * (PCT.num(c.retencion_porcentaje) / 100);
      const pagado = pagadoDe(c.id);
      return { bruto, retencion, neto: bruto - retencion, pagado, saldo: Math.max(0, bruto - pagado) };
    };

    const buscarGastosDeCorteEnBD = async (corte) => {
      const resDirecto = await window.sb
        .from("gastos")
        .select("*")
        .eq("proyecto_id", pid)
        .eq("corte_mo_id", corte.id)
        .order("created_at", { ascending: true });
      if (!resDirecto.error) {
        if ((resDirecto.data || []).length > 0) {
          return { rows: resDirecto.data, soportaCorteMoId: true };
        }
        // Revisar también registros sin corte_mo_id por fallback de migración
        const resFallback = await window.sb
          .from("gastos")
          .select("*")
          .eq("proyecto_id", pid)
          .eq("tipo", TIPO_GASTO_MO)
          .order("created_at", { ascending: true });
        if (resFallback.error) return { rows: [], soportaCorteMoId: true, error: resFallback.error };
        const matched = (resFallback.data || []).filter((g) => esGastoDeCorte(g, corte));
        return { rows: matched, soportaCorteMoId: true };
      }
      if (!esErrorColumnaCorteMoId(resDirecto.error)) {
        return { rows: [], soportaCorteMoId: false, error: resDirecto.error };
      }
      const resFb = await window.sb
        .from("gastos")
        .select("*")
        .eq("proyecto_id", pid)
        .eq("tipo", TIPO_GASTO_MO)
        .order("created_at", { ascending: true });
      if (resFb.error) return { rows: [], soportaCorteMoId: false, error: resFb.error };
      return { rows: (resFb.data || []).filter((g) => esGastoDeCorte(g, corte)), soportaCorteMoId: false };
    };

    // Sincronización idempotente de un corte de contratista hacia public.gastos
    // (1 único registro por corte para evitar duplicados al registrar pagos posteriores).
    const sincronizarCorteAGastos = async (corte, bruto, opts = {}) => {
      if (!corte?.id) return { ok: false, error: new Error("Corte inválido") };
      try {
        const k = contratista();
        const retPct = PCT.num(corte.retencion_porcentaje);
        const brutoRed = Math.round(PCT.num(bruto) * 100) / 100;
        const { rows: existentes, soportaCorteMoId, error: errBusq } = await buscarGastosDeCorteEnBD(corte);
        if (errBusq) {
          console.warn("No se pudo consultar gastos del corte de contratista:", errBusq);
          return { ok: false, error: errBusq };
        }

        const pagadoPrevio = existentes.reduce((s, g) => s + extraerPagadoDeGasto(g), 0);
        const pagadoNuevo = opts.resetPagado
          ? 0
          : Math.max(0, Math.round((pagadoPrevio + PCT.num(opts.pagoAdicional)) * 100) / 100);
        const valorGasto = Math.max(brutoRed, pagadoNuevo);
        const retVal = brutoRed * (retPct / 100);
        const netoGirar = brutoRed - retVal;
        const fechaRef = opts.fechaPago || corte.fecha || PCT.hoyISO();

        let estadoTxt = `Corte causado (pendiente de pago)`;
        if (pagadoNuevo > 0.5 && pagadoNuevo + 0.5 < brutoRed) {
          estadoTxt = `Pago parcial (${formatoFecha(fechaRef)}) · Pagado: ${formatoMoneda(pagadoNuevo)}`;
        } else if (pagadoNuevo > 0.5) {
          estadoTxt = `Pagado (${formatoFecha(fechaRef)}) · Pagado: ${formatoMoneda(pagadoNuevo)}`;
        }
        const obsDetalle = retPct
          ? `${estadoTxt} · Retención ${retPct}%: ${formatoMoneda(retVal)} · Neto a girar: ${formatoMoneda(netoGirar)} [PAGADO_MO:${pagadoNuevo}]`
          : `${estadoTxt} [PAGADO_MO:${pagadoNuevo}]`;

        const payloadBase = {
          proyecto_id: pid,
          fecha: fechaRef,
          tipo: TIPO_GASTO_MO,
          proveedor_texto: k?.nombre || null,
          documento: corte.numero_cuenta_cobro || `Corte ${corte.numero}`,
          descripcion: `Corte N° ${corte.numero} mano de obra contratista`,
          cantidad: 1,
          valor_unitario: valorGasto,
          observaciones: obsDetalle,
        };

        if (existentes.length > 0) {
          const principal = existentes[0];
          const updatePayload = soportaCorteMoId ? { ...payloadBase, corte_mo_id: corte.id } : payloadBase;
          let { error: errUpd } = await window.sb.from("gastos").update(updatePayload).eq("id", principal.id);
          if (errUpd && soportaCorteMoId && esErrorColumnaCorteMoId(errUpd)) {
            const retry = await window.sb.from("gastos").update(payloadBase).eq("id", principal.id);
            errUpd = retry.error;
          }
          if (errUpd) return { ok: false, error: errUpd };
          // Si existían registros duplicados previos para el mismo corte, consolidarlos en uno solo
          if (existentes.length > 1) {
            const extraIds = existentes.slice(1).map((g) => g.id);
            await window.sb.from("gastos").delete().in("id", extraIds);
          }
        } else {
          const insertPayload = soportaCorteMoId ? { ...payloadBase, corte_mo_id: corte.id } : payloadBase;
          let { error: errIns } = await window.sb.from("gastos").insert(insertPayload);
          if (errIns && soportaCorteMoId && esErrorColumnaCorteMoId(errIns)) {
            const retry = await window.sb.from("gastos").insert(payloadBase);
            errIns = retry.error;
          }
          if (errIns) return { ok: false, error: errIns };
        }

        await PCT.recargarFinanzas();
        PCT.emit("finanzas");
        PCT.emit("proyecto");
        PCT.emit("ejec");
        return { ok: true, error: null };
      } catch (errSync) {
        console.warn("No se pudo sincronizar el corte de contratista a Gastos:", errSync);
        return { ok: false, error: errSync };
      }
    };

    const eliminarGastosDeCorte = async (corte) => {
      try {
        const { rows } = await buscarGastosDeCorteEnBD(corte);
        if (rows.length) {
          const { data, error } = await window.sb
            .from("gastos")
            .delete()
            .in("id", rows.map((g) => g.id))
            .select("id");
          if (error) return { ok: false, error };
          if (!data || data.length === 0) return { ok: false, error: null, sinPermiso: true };
        }
        return { ok: true, error: null };
      } catch (err) {
        return { ok: false, error: err };
      }
    };

    const tarifaPorId = (id) => PCT.estado.tarifas.find((t) => t.id === id);
    const valorPropia = (r) => {
      const t = tarifaPorId(r.tarifa_id);
      if (!t) return 0;
      const horasDia = r.horas_dia === null || r.horas_dia === undefined ? PCT.num(t.horas_dia) : PCT.num(r.horas_dia);
      const recargo = 1 + PCT.num(p().recargo_hora_extra_porcentaje) / 100;
      return PCT.num(t.valor_hora) * (PCT.num(r.dias) * horasDia + PCT.num(r.horas_extra) * recargo);
    };
    const horasPropia = (r) => {
      const t = tarifaPorId(r.tarifa_id);
      const horasDia = r.horas_dia === null || r.horas_dia === undefined ? PCT.num(t?.horas_dia) : PCT.num(r.horas_dia);
      return PCT.num(r.dias) * horasDia + PCT.num(r.horas_extra);
    };

    const cargar = async () => {
      const [c, g, r] = await Promise.all([
        window.sb.from("cortes_mo").select("*").eq("proyecto_id", pid).order("numero", { ascending: true }),
        window.sb.from("gastos").select("*").eq("proyecto_id", pid).eq("tipo", TIPO_GASTO_MO).order("fecha", { ascending: true }),
        window.sb.from("registro_mo_propia").select("*").eq("proyecto_id", pid).order("fecha", { ascending: false }).order("created_at", { ascending: false }),
      ]);
      if (c.error) throw c.error;
      if (g.error) throw g.error;
      if (r.error) throw r.error;
      cortes = c.data || [];
      pagos = g.data || [];
      propia = r.data || [];
      const ids = cortes.map((x) => x.id);
      if (!ids.length) {
        lineas = [];
        return;
      }
      const l = await window.sb.from("cortes_mo_items").select("*").in("corte_id", ids);
      if (l.error) throw l.error;
      lineas = l.data || [];
    };

    let esperarGuardadosPendientes = async () => {};

    const refrescar = async () => {
      await esperarGuardadosPendientes();
      await Promise.all([cargar(), PCT.recargarEjec(), PCT.recargarFinanzas()]);
      pintarTodo();
      PCT.emit("finanzas");
      PCT.emit("proyecto");
    };

    root.innerHTML = `
      <div class="space-y-5">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 class="text-base font-bold text-gray-900">Mano de Obra y Contratistas</h2>
            <p class="text-xs text-gray-500">Contrato unitario del contratista, cortes parciales sincronizados con Gastos y registro de técnicos propios.</p>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <button type="button" id="mo-descargar-plantilla" class="flex items-center gap-1.5 rounded-lg border border-emerald-600 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100">
              <span class="material-symbols-outlined text-[16px]">download</span> Descargar plantilla contratista (.xlsx)
            </button>
            <button type="button" id="mo-importar-excel" class="flex items-center gap-1.5 rounded-lg border border-primary bg-blue-50 px-3 py-2 text-xs font-semibold text-primary hover:bg-blue-100">
              <span class="material-symbols-outlined text-[16px]">upload_file</span> Importar Excel contratista
            </button>
            <input type="file" id="mo-archivo-excel" accept=".xlsx,.xls,.csv" class="hidden" />
          </div>
        </div>

        <div id="mo-kpis" class="${PCT.CLASE_PANEL_KPIS}"></div>

        <div class="rounded-xl border border-gray-200 bg-white p-5">
          <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 class="text-base font-bold text-gray-900">Cortes del contratista</h3>
              <p id="mo-contratista" class="text-xs text-gray-500"></p>
            </div>
            <button id="mo-nuevo" type="button" class="flex items-center gap-1 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"><span class="material-symbols-outlined text-[18px]">add</span> Nuevo corte</button>
          </div>
          <div class="overflow-x-auto">
            <table class="min-w-full text-sm">
              <thead class="bg-gray-50 text-left text-[11px] font-semibold uppercase text-gray-500">
                <tr><th class="px-3 py-2">N°</th><th class="px-3 py-2">Fecha</th><th class="px-3 py-2">Cuenta de cobro</th><th class="px-3 py-2 text-right">Valor corte</th><th class="px-3 py-2 text-right">Retención</th><th class="px-3 py-2 text-right">Neto a girar</th><th class="px-3 py-2 text-right">Pagado</th><th class="px-3 py-2 text-right">Saldo</th><th class="px-3 py-2"></th></tr>
              </thead>
              <tbody id="mo-cortes"></tbody>
              <tfoot id="mo-cortes-total" class="bg-gray-50 text-xs font-bold text-gray-800"></tfoot>
            </table>
          </div>
        </div>

        <div class="rounded-xl border border-gray-200 bg-white p-5">
          <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 class="text-base font-bold text-gray-900">Contrato del contratista</h3>
              <p class="text-xs text-gray-500">Por cada ítem: cantidades, Ppto. MO Unit., PU Contratista y ahorro unitario y total. Haz clic en un precio para editarlo o impórtalo desde Excel.</p>
            </div>
          </div>
          <div class="max-h-[560px] overflow-auto rounded-lg border border-gray-100">
            <table class="min-w-full text-sm">
              <thead class="sticky top-0 z-10 bg-gray-50 text-left text-[11px] font-semibold uppercase text-gray-500">
                <tr><th class="px-2 py-2">#</th><th class="px-2 py-2">Descripción</th><th class="px-2 py-2">Und</th><th class="px-2 py-2 text-right">Cant.</th><th class="px-2 py-2 text-right">Ppto. MO Unit.</th><th class="px-2 py-2 text-right">PU Contratista</th><th class="px-2 py-2 text-right">Ppto. MO Total</th><th class="px-2 py-2 text-right">Total Contratista</th><th class="px-2 py-2 text-right">Ahorro Unit.</th><th class="px-2 py-2 text-right">Ahorro Total</th><th class="px-2 py-2 text-right">Ejecutado</th><th class="px-2 py-2 text-right">Cortado</th><th class="px-2 py-2 text-right">Por cortar</th></tr>
              </thead>
              <tbody id="mo-contrato"></tbody>
              <tfoot id="mo-contrato-total" class="sticky bottom-0 bg-gray-50 text-xs font-bold text-gray-800"></tfoot>
            </table>
          </div>
        </div>

        <div class="rounded-xl border border-gray-200 bg-white p-5">
          <div class="mb-3">
            <h3 class="text-base font-bold text-gray-900">Técnicos propios</h3>
            <p class="text-xs text-gray-500">Una fila por técnico y día. El valor hora y las horas por día salen de las tarifas de la pestaña Inicio; deja «Horas/día» vacío para usar las del cargo.</p>
          </div>
          <form id="mo-form-propia" class="mb-3 grid grid-cols-2 gap-2 rounded-lg bg-gray-50 p-3 md:grid-cols-12 md:items-end"></form>
          <div class="overflow-x-auto">
            <table class="min-w-full text-sm">
              <thead class="bg-gray-50 text-left text-[11px] font-semibold uppercase text-gray-500">
                <tr><th class="px-2 py-2">Fecha</th><th class="px-2 py-2">Técnico</th><th class="px-2 py-2">Cargo</th><th class="px-2 py-2">Ítem / actividad</th><th class="px-2 py-2 text-right">Días</th><th class="px-2 py-2 text-right">Horas/día</th><th class="px-2 py-2 text-right">Horas extra</th><th class="px-2 py-2 text-right">Horas</th><th class="px-2 py-2 text-right">Valor</th><th class="px-2 py-2">Observaciones</th><th></th></tr>
              </thead>
              <tbody id="mo-propia"></tbody>
              <tfoot id="mo-propia-total" class="bg-gray-50 text-xs font-bold text-gray-800"></tfoot>
            </table>
          </div>
        </div>
      </div>`;

    // ------------------------------------------------------------------
    // KPIs
    // ------------------------------------------------------------------
    const pintarKpis = () => {
      let ppto = 0;
      let contrato = 0;
      let ahorro = 0; // solo donde ya hay PU contratista
      let pptoConPrecio = 0;
      let conPrecio = 0;
      let ejecutadoContratista = 0;
      soloItems()
        .filter((i) => !i.es_adicional)
        .forEach((i) => {
          const totPpto = PCT.num(i.cantidad) * PCT.num(i.cu_mano_obra);
          ppto += totPpto;
          if (i.pu_contratista !== null && i.pu_contratista !== undefined) {
            const totContr = PCT.num(i.cantidad) * PCT.num(i.pu_contratista);
            contrato += totContr;
            ahorro += totPpto - totContr;
            pptoConPrecio += totPpto;
            conPrecio += 1;
          }
        });
      soloItems().forEach((i) => (ejecutadoContratista += PCT.num(PCT.ejecItem(i.id).cant_ejecutada_contratista) * PCT.num(i.pu_contratista)));
      const tot = cortes
        .map(calcCorte)
        .reduce(
          (s, x) => ({ bruto: s.bruto + x.bruto, ret: s.ret + x.retencion, neto: s.neto + x.neto, pagado: s.pagado + x.pagado }),
          { bruto: 0, ret: 0, neto: 0, pagado: 0 }
        );
      const saldoPorPagar = Math.max(0, tot.bruto - tot.pagado);
      const saldoContrato = Math.max(0, contrato - tot.bruto);
      const costoPropia = propia.reduce((s, r) => s + valorPropia(r), 0);
      root.querySelector("#mo-kpis").innerHTML =
        PCT.tarjetaKpi("Presupuesto MO", formatoMoneda(ppto), "Cant. × Ppto. MO Unit.") +
        PCT.tarjetaKpi("Contrato Contratista", formatoMoneda(contrato), `${conPrecio} ítems con precio pactado`) +
        PCT.tarjetaKpi(
          "Ahorro MO",
          formatoMoneda(ahorro),
          !conPrecio ? "Aún sin precios del contratista" : pptoConPrecio ? `${PCT.fmtPct(ahorro / pptoConPrecio)} vs presupuesto MO` : `${conPrecio} ítems con precio, sin Ppto. MO`,
          ahorro > 0 ? "text-green-600" : ahorro < 0 ? "text-red-600" : "text-gray-900"
        ) +
        PCT.tarjetaKpi("Acumulado Cortado", formatoMoneda(tot.bruto), `${cortes.length} cortes · ejecutado ${formatoMoneda(ejecutadoContratista)}`) +
        PCT.tarjetaKpi("Retenciones Acumuladas", formatoMoneda(tot.ret), `Neto a girar ${formatoMoneda(tot.neto)}`) +
        PCT.tarjetaKpi("Total Pagado", formatoMoneda(tot.pagado), "Sincronizado con Gastos") +
        PCT.tarjetaKpi(
          "Saldo Pendiente",
          formatoMoneda(saldoPorPagar),
          `Por pagar · Contrato pendiente ${formatoMoneda(saldoContrato)}`,
          saldoPorPagar > 0 ? "text-amber-700" : "text-green-600"
        ) +
        PCT.tarjetaKpi("Técnicos Propios", formatoMoneda(costoPropia), `${PCT.fmtCant(propia.reduce((s, r) => s + horasPropia(r), 0))} horas`);
    };

    // ------------------------------------------------------------------
    // Cortes del contratista
    // ------------------------------------------------------------------
    const pintarCortes = () => {
      const k = contratista();
      root.querySelector("#mo-contratista").innerHTML = k
        ? `Contratista: <b>${escapeHtml(k.nombre || "")}</b> · retención ${PCT.num(k.porcentaje_retencion)}%. Cada corte propone lo que él ejecutó (Avance diario) y aún no se le ha cortado.`
        : `<span class="text-amber-700">Este proyecto no tiene contratista asignado. Asígnalo en la pestaña <b>Inicio</b> para poder hacerle cortes.</span>`;
      const tbody = root.querySelector("#mo-cortes");
      const filas = cortes.map((c) => ({ c, x: calcCorte(c) }));
      tbody.innerHTML = filas.length
        ? filas
            .map(
              ({ c, x }) => `<tr data-id="${c.id}" class="cursor-pointer border-t border-gray-100 hover:bg-gray-50">
                <td class="px-3 py-2 font-semibold">${c.numero}</td>
                <td class="px-3 py-2">${formatoFecha(c.fecha)}</td>
                <td class="px-3 py-2 text-xs text-gray-600">${escapeHtml(c.numero_cuenta_cobro || "—")}</td>
                <td class="px-3 py-2 text-right tabular-nums">${formatoMoneda(x.bruto)}</td>
                <td class="px-3 py-2 text-right tabular-nums text-gray-500">${formatoMoneda(x.retencion)} <span class="text-[10px]">(${PCT.num(c.retencion_porcentaje)}%)</span></td>
                <td class="px-3 py-2 text-right font-semibold tabular-nums">${formatoMoneda(x.neto)}</td>
                <td class="px-3 py-2 text-right tabular-nums">${formatoMoneda(x.pagado)}</td>
                <td class="px-3 py-2 text-right tabular-nums ${x.saldo > 0.5 ? "text-amber-700" : "text-green-600"}">${x.saldo > 0.5 ? formatoMoneda(x.saldo) : "Pagado"}</td>
                <td class="whitespace-nowrap px-3 py-2 text-right">
                  <button data-acc="ver" class="text-xs font-semibold text-primary hover:underline">Abrir</button>
                  <button data-acc="pdf" title="Corte en PDF" class="ml-2 text-gray-400 hover:text-gray-800"><span class="material-symbols-outlined text-[18px] align-middle">picture_as_pdf</span></button>
                </td>
              </tr>`
            )
            .join("")
        : `<tr><td colspan="9" class="py-8 text-center text-gray-400">Aún no hay cortes al contratista.</td></tr>`;
      const t = filas.reduce((s, { x }) => ({ bruto: s.bruto + x.bruto, ret: s.ret + x.retencion, neto: s.neto + x.neto, pagado: s.pagado + x.pagado, saldo: s.saldo + x.saldo }), { bruto: 0, ret: 0, neto: 0, pagado: 0, saldo: 0 });
      root.querySelector("#mo-cortes-total").innerHTML = filas.length
        ? `<tr><td colspan="3" class="px-3 py-2 uppercase">Total</td><td class="px-3 py-2 text-right tabular-nums">${formatoMoneda(t.bruto)}</td><td class="px-3 py-2 text-right tabular-nums">${formatoMoneda(t.ret)}</td><td class="px-3 py-2 text-right tabular-nums">${formatoMoneda(t.neto)}</td><td class="px-3 py-2 text-right tabular-nums">${formatoMoneda(t.pagado)}</td><td class="px-3 py-2 text-right tabular-nums">${formatoMoneda(t.saldo)}</td><td></td></tr>`
        : "";
    };

    const resumenCorte = (bruto, retPct) => {
      const ret = bruto * (PCT.num(retPct) / 100);
      return PCT.htmlResumen([
        ["Valor del corte (PU contratista)", bruto],
        [`Retención (${PCT.num(retPct)}%)`, -ret],
        ["NETO A GIRAR AL CONTRATISTA", bruto - ret, "fuerte"],
      ]);
    };

    const abrirEditor = async (corte = null) => {
      await esperarGuardadosPendientes();
      const k = contratista();
      if (!corte && !k) return mostrarAviso("Asigna primero el contratista del proyecto en la pestaña Inicio.", "error");
      const propias = corte ? new Map(lineasDe(corte.id).map((l) => [l.presupuesto_item_id, PCT.num(l.cantidad)])) : new Map();
      const snap = corte ? new Map(lineasDe(corte.id).map((l) => [l.presupuesto_item_id, PCT.num(l.pu_contratista_snapshot)])) : new Map();
      const filas = soloItems().map((i) => {
        const e = PCT.ejecItem(i.id);
        const sinPrecio = i.pu_contratista === null || i.pu_contratista === undefined;
        return {
          item: i,
          ejecutado: PCT.num(e.cant_ejecutada_contratista),
          cortadoOtros: PCT.num(e.cant_cortada_mo) - PCT.num(propias.get(i.id)),
          precio: snap.has(i.id) ? snap.get(i.id) : PCT.num(i.pu_contratista),
          sinPrecio: sinPrecio && !snap.has(i.id),
        };
      });
      const iniciales = corte ? propias : new Map(filas.map((f) => [f.item.id, Math.max(0, Math.round((f.ejecutado - f.cortadoOtros) * 100) / 100)]));
      const numero = corte ? corte.numero : (cortes.length ? Math.max(...cortes.map((c) => c.numero)) : 0) + 1;
      const retPct = corte ? corte.retencion_porcentaje : PCT.num(k?.porcentaje_retencion);

      let corteGuardado = null;
      let brutoGuardado = 0;

      const ok = await PCT.editorCorte({
        titulo: corte ? `Corte al contratista N° ${numero} · editar cantidades` : `Nuevo corte al contratista N° ${numero}`,
        fecha: corte?.fecha || PCT.hoyISO(),
        extraHtml: `<div><label class="mb-1 block text-xs font-medium text-gray-700">N° cuenta de cobro</label><input id="ec-cuenta" value="${escapeHtml(corte?.numero_cuenta_cobro || "")}" class="${CLASE_INPUT}" /></div>`,
        filas,
        iniciales,
        resumen: (bruto) => resumenCorte(bruto, retPct),
        onGuardar: async ({ fecha, cantidades, el }) => {
          const sinPrecio = filas.filter((f) => f.sinPrecio && cantidades.get(f.item.id));
          if (sinPrecio.length) {
            throw new Error(`Hay ${sinPrecio.length} ítem(s) con cantidad pero sin PU contratista (${sinPrecio.map((f) => f.item.codigo || f.item.descripcion.slice(0, 20)).join(", ")}). Ponles precio en «Contrato del contratista».`);
          }
          const cuenta = el.querySelector("#ec-cuenta").value.trim() || null;
          let corteId = corte?.id;
          let esNuevo = false;
          if (corte) {
            const { error } = await window.sb.from("cortes_mo").update({ fecha, numero_cuenta_cobro: cuenta }).eq("id", corte.id);
            if (error) throw error;
            corteGuardado = { ...corte, fecha, numero_cuenta_cobro: cuenta };
          } else {
            const { data, error } = await window.sb
              .from("cortes_mo")
              .insert({ proyecto_id: pid, numero, fecha, numero_cuenta_cobro: cuenta, contratista_id: k.id, retencion_porcentaje: retPct })
              .select()
              .single();
            if (error) throw error;
            corteId = data.id;
            corteGuardado = data;
            esNuevo = true;
          }
          try {
            const existentes = new Map(lineasDe(corteId).map((l) => [l.presupuesto_item_id, l]));
            const upserts = [];
            const borrar = [];
            let totalBruto = 0;
            cantidades.forEach((v, itemId) => {
              const ex = existentes.get(itemId);
              if (!v) {
                if (ex) borrar.push(ex.id);
                return;
              }
              const puSnap = ex ? PCT.num(ex.pu_contratista_snapshot) : PCT.num(itemPorId(itemId)?.pu_contratista);
              totalBruto += PCT.num(v) * puSnap;
              upserts.push({
                corte_id: corteId,
                presupuesto_item_id: itemId,
                cantidad: v,
                pu_contratista_snapshot: puSnap,
              });
            });
            if (borrar.length) {
              const { error } = await window.sb.from("cortes_mo_items").delete().in("id", borrar);
              if (error) throw error;
            }
            if (upserts.length) {
              const { error } = await window.sb.from("cortes_mo_items").upsert(upserts, { onConflict: "corte_id,presupuesto_item_id" });
              if (error) throw error;
            }
            brutoGuardado = totalBruto;
          } catch (err) {
            if (esNuevo && corteId) {
              try {
                await window.sb.from("cortes_mo").delete().eq("id", corteId);
              } catch (errRollback) {
                console.error("Error al revertir corte de mano de obra:", errRollback);
              }
            }
            throw err;
          }
        },
      });
      if (ok) {
        let syncOk = true;
        if (corteGuardado) {
          const syncRes = await sincronizarCorteAGastos(corteGuardado, brutoGuardado);
          syncOk = Boolean(syncRes?.ok);
        }
        await refrescar();
        mostrarAviso(
          corte
            ? syncOk
              ? "Corte actualizado y sincronizado en Gastos."
              : "Corte actualizado (no se pudo sincronizar automáticamente en Gastos)."
            : syncOk
            ? `Corte N° ${numero} creado y cargado automáticamente en Gastos.`
            : `Corte N° ${numero} creado (no se pudo sincronizar automáticamente en Gastos).`,
          syncOk ? "exito" : "info"
        );
      }
    };

    const fmtTipoPersona = (c, retPct) => {
      const tp = String(c?.tipo_persona || "").trim().toLowerCase();
      if (tp === "empresa" || tp === "juridica" || tp === "persona juridica") return "Empresa";
      if (tp === "natural" || tp === "persona natural") {
        return c?.es_declarante_renta ? "Persona natural declarante" : "Persona natural no declarante";
      }
      if (c?.tipo_persona) return c.tipo_persona;
      if (retPct === 0) return "Empresa";
      if (retPct === 4) return "Persona natural declarante";
      if (retPct === 6) return "Persona natural no declarante";
      return "—";
    };

    const descargarPdf = async (corte) => {
      const anteriores = new Map();
      cortes
        .filter((c) => c.numero < corte.numero)
        .forEach((c) => lineasDe(c.id).forEach((l) => anteriores.set(l.presupuesto_item_id, (anteriores.get(l.presupuesto_item_id) || 0) + PCT.num(l.cantidad))));
      const filas = lineasDe(corte.id)
        .map((l) => ({ l, i: itemPorId(l.presupuesto_item_id) }))
        .filter((x) => x.i)
        .sort((a, b) => PCT.num(a.i.orden) - PCT.num(b.i.orden))
        .map(({ l, i }) => ({ codigo: i.codigo, descripcion: i.descripcion, unidad: i.unidad, contratado: i.cantidad, precio: l.pu_contratista_snapshot, anterior: anteriores.get(i.id) || 0, actual: l.cantidad }));
      const x = calcCorte(corte);
      let k = contratista();
      const cid = corte.contratista_id || k?.id;
      if (cid && (k?.identificacion === undefined || k?.tipo_persona === undefined || k?.especialidad === undefined)) {
        const { data: kFull, error: errK } = await window.sb
          .from("contratistas")
          .select("id, nombre, identificacion, especialidad, tipo_persona, es_declarante_renta, porcentaje_retencion")
          .eq("id", cid)
          .maybeSingle();
        if (errK) return manejarError(errK, "No se pudo consultar el contratista");
        if (kFull) k = { ...(k || {}), ...kFull };
      }
      const retPct = PCT.num(corte.retencion_porcentaje);
      const tipoPersona = fmtTipoPersona(k, retPct);
      const amortizacion = PCT.num(corte.amortizacion_anticipo || 0);
      const netoPagar = x.bruto - amortizacion - x.retencion;
      const empNombre = p().empresas?.nombre || window.PCTRONIC_CONFIG?.NOMBRE_EMPRESA || "Pctronic";
      await PCT.pdfActa({
        titulo: `CORTE DE MANO DE OBRA N° ${corte.numero}`,
        subtitulo: `Contratista: ${k?.nombre || "—"}${corte.numero_cuenta_cobro ? " · Cuenta de cobro " + corte.numero_cuenta_cobro : ""}`,
        proyecto: p(),
        corte: {
          ...corte,
          extra: [
            ["Contratista", k?.nombre || "—", "NIT / CC", k?.identificacion || "—"],
            ["Especialidad", k?.especialidad || "—", "Tipo de persona", tipoPersona],
            ["Cuenta de cobro", corte.numero_cuenta_cobro || "—", "Retención aplicada", `${retPct}%`],
          ],
        },
        filas,
        encabezadoPrecio: "PU contratista",
        resumen: [
          ["Valor bruto corte", x.bruto],
          ["Amortización anticipo", -amortizacion],
          [`Retención en la fuente (${retPct}%)`, -x.retencion],
          ["Neto a pagar", netoPagar, "fuerte"],
        ],
        firmas: [
          { titulo: "Contratista", nombre: k?.nombre || "—", detalle: k?.identificacion ? `NIT / CC ${k.identificacion}` : "" },
          { titulo: "Aprobado por", nombre: empNombre, detalle: p().empresas?.nit ? `NIT ${p().empresas.nit}` : "" },
        ],
        nombreArchivo: `Corte_contratista_${corte.numero}_${(p().nombre || "proyecto").replace(/[^\w\-]+/g, "_")}.pdf`,
      });
    };

    const abrirDetalle = (corte) => {
      const x = calcCorte(corte);
      const esUltimo = corte.numero === Math.max(...cortes.map((c) => c.numero));
      const gastosCorte = gastosDeCorte(corte);
      const ret = PCT.num(corte.retencion_porcentaje);

      const listaPagosHtml = () => {
        if (x.pagado <= 0.5) {
          return `<li class="px-3 py-3 text-xs text-gray-400">Sin pagos registrados. El costo del corte ya se refleja en Gastos sin duplicarse al pagar.</li>`;
        }
        return gastosCorte
          .filter((g) => extraerPagadoDeGasto(g) > 0.5)
          .map((g) => {
            const montoPagado = extraerPagadoDeGasto(g);
            const esSync = esGastoSincronizado(g);
            const puedeQuitarPago = esSync || Boolean(window.PCT_ROL_INFO?.esSuperUsuario);
            return `<li class="flex items-center justify-between gap-2 px-3 py-2">
              <span class="text-xs text-gray-600">${formatoFecha(g.fecha)}${g.documento ? " · " + escapeHtml(g.documento) : ""}${esSync ? " · Sincronizado en Gastos" : ""}</span>
              <span class="tabular-nums font-medium">${formatoMoneda(montoPagado)}</span>
              ${
                puedeQuitarPago
                  ? `<button data-borrar-pago="${g.id}" data-es-sync="${esSync ? "1" : "0"}" class="text-gray-400 hover:text-red-600" title="${esSync ? "Reiniciar pago registrado" : "Quitar pago"}"><span class="material-symbols-outlined text-[18px]">delete</span></button>`
                  : ""
              }
            </li>`;
          })
          .join("");
      };

      const m = PCT.modal({
        titulo: `Corte al contratista N° ${corte.numero} · ${formatoFecha(corte.fecha)}`,
        ancho: "max-w-3xl",
        html: `
          <div class="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div>
              <h4 class="mb-2 text-xs font-bold uppercase text-gray-500">Valor</h4>
              ${resumenCorte(x.bruto, ret)}
              <p class="mt-2 text-xs text-gray-400">${lineasDe(corte.id).length} ítems en este corte.</p>
              <div class="mt-3"><label class="mb-1 block text-xs font-medium">N° cuenta de cobro</label><input id="md-cuenta" value="${escapeHtml(corte.numero_cuenta_cobro || "")}" class="${CLASE_INPUT}" /></div>
            </div>
            <div>
              <h4 class="mb-2 text-xs font-bold uppercase text-gray-500">Pagos <span class="font-normal normal-case text-gray-400">(sincronizados en Gastos)</span></h4>
              <ul class="divide-y divide-gray-100 rounded-lg border border-gray-100 text-sm">${listaPagosHtml()}</ul>
              <div class="mt-2 flex justify-between text-sm"><span class="text-gray-500">Saldo por pagar (valor bruto)</span><b class="tabular-nums ${x.saldo > 0.5 ? "text-amber-700" : "text-green-600"}">${formatoMoneda(Math.max(0, x.saldo))}</b></div>
              ${x.saldo > 0.5 ? `
              <div class="mt-3 space-y-2 rounded-lg bg-gray-50 p-3">
                <p class="text-xs font-semibold text-gray-700">Registrar pago</p>
                <div class="grid grid-cols-2 gap-2">
                  <div><label class="mb-1 block text-[11px]">Fecha</label><input id="md-pfecha" type="date" value="${PCT.hoyISO()}" class="${CLASE_INPUT}" /></div>
                  <div><label class="mb-1 block text-[11px]">Valor bruto que se paga</label><input id="md-pvalor" inputmode="numeric" class="input-moneda ${CLASE_INPUT}" /></div>
                </div>
                <p id="md-pneto" class="text-[11px] text-gray-500"></p>
                <button id="md-pagar" type="button" class="w-full rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white hover:bg-green-700">Registrar pago</button>
              </div>` : ""}
            </div>
          </div>`,
        botones: [
          ...(esUltimo && Boolean(window.PCT_ROL_INFO?.esSuperUsuario)
            ? [{
                texto: "Eliminar corte",
                clase: "mr-auto rounded-lg px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50",
                onClick: async () => {
                  if (x.pagado > 0.5) {
                    mostrarAviso("Este corte tiene pagos registrados: quítalos primero.", "error");
                    return false;
                  }
                  const ok = await PCT.confirmar("Eliminar corte", `¿Eliminar el corte N° ${corte.numero} al contratista? Lo cortado vuelve a quedar por cortar y se retirará su registro de Gastos.`, "Eliminar", true);
                  if (!ok) return false;
                  const resG = await eliminarGastosDeCorte(corte);
                  if (!resG?.ok) {
                    if (resG?.error) manejarError(resG.error, "No se pudo retirar el gasto sincronizado del corte");
                    else mostrarAviso("No tienes permisos para eliminar los gastos sincronizados de este corte.", "error");
                    return false;
                  }
                  const { data, error } = await window.sb.from("cortes_mo").delete().eq("id", corte.id).select("id");
                  if (error) {
                    manejarError(error, "No se pudo eliminar el corte");
                    return false;
                  }
                  if (!data || data.length === 0) {
                    mostrarAviso("No tienes permisos para eliminar este corte.", "error");
                    return false;
                  }
                  await refrescar();
                  mostrarAviso("Corte eliminado.", "exito");
                },
              }]
            : []),
          { texto: "Editar cantidades", onClick: () => abrirEditor(corte) },
          { texto: "PDF", onClick: () => (descargarPdf(corte), false) },
          {
            texto: "Guardar",
            clase: PCT.BTN_PRIMARIO,
            onClick: async ({ el }) => {
              const nuevaCuenta = el.querySelector("#md-cuenta").value.trim() || null;
              const { error } = await window.sb.from("cortes_mo").update({ numero_cuenta_cobro: nuevaCuenta }).eq("id", corte.id);
              if (error) {
                manejarError(error, "No se pudo guardar");
                return false;
              }
              await sincronizarCorteAGastos({ ...corte, numero_cuenta_cobro: nuevaCuenta }, x.bruto);
              await refrescar();
            },
          },
        ],
      });

      const inpValor = m.el.querySelector("#md-pvalor");
      if (inpValor) {
        activarCamposMoneda(".input-moneda", m.el);
        establecerValorMoneda(inpValor, Math.round(x.saldo));
        const neto = () => {
          const v = valorMoneda(inpValor);
          m.el.querySelector("#md-pneto").textContent = `Neto a girar al contratista: ${formatoMoneda(v * (1 - ret / 100))} · retención ${formatoMoneda(v * (ret / 100))}. Actualiza el registro único del corte en Gastos sin duplicarlo.`;
        };
        inpValor.addEventListener("input", neto);
        neto();
        m.el.querySelector("#md-pagar").addEventListener("click", async () => {
          const valor = valorMoneda(inpValor);
          const fecha = m.el.querySelector("#md-pfecha").value;
          if (valor <= 0 || !fecha) return mostrarAviso("Pon la fecha y un valor mayor que cero.", "error");
          const syncRes = await sincronizarCorteAGastos(corte, x.bruto, { pagoAdicional: valor, fechaPago: fecha });
          if (!syncRes?.ok) return manejarError(syncRes?.error, "No se pudo registrar el pago");
          m.cerrar();
          await refrescar();
          mostrarAviso("Pago registrado y actualizado en Gastos.", "exito");
        });
      }
      m.el.addEventListener("click", async (e) => {
        const b = e.target.closest("[data-borrar-pago]");
        if (!b) return;
        const esSync = b.dataset.esSync === "1";
        const ok = await PCT.confirmar(
          esSync ? "Reiniciar pago" : "Quitar pago",
          esSync
            ? "¿Reiniciar el pago registrado de este corte? El costo causado del corte se conservará en Gastos como pendiente de pago."
            : "¿Quitar este pago? También se borra de Gastos.",
          esSync ? "Reiniciar pago" : "Quitar",
          true
        );
        if (!ok) return;
        if (esSync) {
          const syncRes = await sincronizarCorteAGastos(corte, x.bruto, { resetPagado: true });
          if (!syncRes?.ok) return manejarError(syncRes?.error, "No se pudo reiniciar el pago");
        } else {
          const { data, error } = await window.sb.from("gastos").delete().eq("id", b.dataset.borrarPago).select("id");
          if (error) return manejarError(error, "No se pudo quitar el pago");
          if (!data || data.length === 0) {
            return mostrarAviso("No tienes permisos para eliminar este pago.", "error");
          }
          await sincronizarCorteAGastos(corte, x.bruto);
        }
        m.cerrar();
        await refrescar();
      });
    };

    root.querySelector("#mo-nuevo").addEventListener("click", async () => {
      await esperarGuardadosPendientes();
      await abrirEditor(null);
    });
    root.querySelector("#mo-cortes").addEventListener("click", async (e) => {
      const tr = e.target.closest("tr[data-id]");
      if (!tr) return;
      const corte = cortes.find((c) => c.id === tr.dataset.id);
      if (!corte) return;
      if (e.target.closest('[data-acc="pdf"]')) return descargarPdf(corte);
      await esperarGuardadosPendientes();
      abrirDetalle(corte);
    });

    // ------------------------------------------------------------------
    // Contrato del contratista (Ppto. MO Unit., PU Contratista y Ahorros)
    // ------------------------------------------------------------------
    const claseAhorro = (v) => (v > 0 ? "text-green-600 font-semibold" : v < 0 ? "text-red-600 font-semibold" : "text-gray-600");

    const calcularTotalesContrato = () => {
      const t = { ppto: 0, contr: 0, ahorro: 0 };
      soloItems().forEach((i) => {
        if (i.es_adicional) return;
        const q = PCT.num(i.cantidad);
        const tienePc = i.pu_contratista !== null && i.pu_contratista !== undefined;
        const totPpto = q * PCT.num(i.cu_mano_obra);
        const totContr = tienePc ? q * PCT.num(i.pu_contratista) : null;
        const ahorro = totContr === null ? null : totPpto - totContr;
        t.ppto += totPpto;
        t.contr += totContr || 0;
        t.ahorro += ahorro || 0;
      });
      return t;
    };

    const pintarTotalesContrato = () => {
      const tfoot = root.querySelector("#mo-contrato-total");
      if (!PCT.estado.items.length) {
        tfoot.innerHTML = "";
        return;
      }
      const t = calcularTotalesContrato();
      tfoot.innerHTML = `<tr><td colspan="6" class="px-2 py-2 text-right uppercase">Total contrato (sin adicionales)</td><td class="px-2 py-2 text-right tabular-nums">${formatoMoneda(t.ppto)}</td><td class="px-2 py-2 text-right tabular-nums">${formatoMoneda(t.contr)}</td><td></td><td class="px-2 py-2 text-right tabular-nums ${t.ahorro > 0 ? "text-green-600" : t.ahorro < 0 ? "text-red-600" : ""}">${formatoMoneda(t.ahorro)}</td><td colspan="3"></td></tr>`;
    };

    const actualizarCeldasFilaContrato = (tr, i) => {
      if (!tr || !i) return;
      const q = PCT.num(i.cantidad);
      const tienePc = i.pu_contratista !== null && i.pu_contratista !== undefined;
      const cuMo = PCT.num(i.cu_mano_obra);
      const puContr = tienePc ? PCT.num(i.pu_contratista) : null;
      const totPpto = q * cuMo;
      const totContr = tienePc ? q * puContr : null;
      const ahorroUnit = tienePc ? cuMo - puContr : null;
      const ahorroTot = totContr === null ? null : totPpto - totContr;

      const cTotPpto = tr.querySelector('[data-col="tot-ppto"]');
      const cTotContr = tr.querySelector('[data-col="tot-contr"]');
      const cAhUnit = tr.querySelector('[data-col="ahorro-unit"]');
      const cAhTot = tr.querySelector('[data-col="ahorro-tot"]');
      if (cTotPpto) cTotPpto.textContent = formatoMoneda(totPpto);
      if (cTotContr) cTotContr.textContent = totContr === null ? "—" : formatoMoneda(totContr);
      if (cAhUnit) {
        cAhUnit.textContent = ahorroUnit === null ? "—" : formatoMoneda(ahorroUnit);
        cAhUnit.className = `px-2 py-1 text-right text-xs tabular-nums ${ahorroUnit === null ? "text-gray-400" : claseAhorro(ahorroUnit)}`;
      }
      if (cAhTot) {
        cAhTot.textContent = ahorroTot === null ? "—" : formatoMoneda(ahorroTot);
        cAhTot.className = `px-2 py-1 text-right text-xs tabular-nums ${ahorroTot === null ? "text-gray-400" : claseAhorro(ahorroTot)}`;
      }
    };

    const pintarContrato = () => {
      const tbody = root.querySelector("#mo-contrato");
      const items = PCT.estado.items;
      if (!items.length) {
        tbody.innerHTML = `<tr><td colspan="13" class="py-8 text-center text-gray-400">Primero llena la pestaña Cotización.</td></tr>`;
        root.querySelector("#mo-contrato-total").innerHTML = "";
        return;
      }
      tbody.innerHTML = items
        .map((i) => {
          if (i.tipo !== "item") {
            return `<tr class="${i.tipo === "capitulo" ? "bg-blue-100/70 font-bold" : "bg-blue-50/70 font-semibold"}"><td class="px-2 py-1.5 text-xs">${escapeHtml(i.codigo || "")}</td><td colspan="12" class="px-2 py-1.5 text-xs">${escapeHtml(i.descripcion)}</td></tr>`;
          }
          const q = PCT.num(i.cantidad);
          const tienePc = i.pu_contratista !== null && i.pu_contratista !== undefined;
          const cuMo = PCT.num(i.cu_mano_obra);
          const puContr = tienePc ? PCT.num(i.pu_contratista) : null;
          const totPpto = q * cuMo;
          const totContr = tienePc ? q * puContr : null;
          const ahorroUnit = tienePc ? cuMo - puContr : null;
          const ahorroTot = totContr === null ? null : totPpto - totContr;
          const e = PCT.ejecItem(i.id);
          const porCortar = PCT.num(e.pendiente_cortar_mo);
          return `<tr data-id="${i.id}" class="border-t border-gray-100 ${i.es_adicional ? "bg-amber-50/60" : ""}">
            <td class="px-2 py-1 text-xs text-gray-500">${escapeHtml(i.codigo || "")}</td>
            <td class="min-w-[240px] px-2 py-1 text-xs text-gray-800"><span class="line-clamp-2" title="${escapeHtml(i.descripcion)}">${escapeHtml(i.descripcion)}</span></td>
            <td class="px-2 py-1 text-xs text-gray-500">${escapeHtml(i.unidad || "")}</td>
            <td class="px-2 py-1 text-right text-xs font-medium tabular-nums">${PCT.fmtCant(q)}</td>
            <td class="w-28 px-1 py-1"><input data-f="cu_mano_obra" inputmode="decimal" value="${cuMo ? formatearMiles(cuMo) : ""}" placeholder="0" class="input-moneda ${CELDA}" /></td>
            <td class="w-28 px-1 py-1"><input data-f="pu_contratista" inputmode="decimal" value="${tienePc ? formatearMiles(puContr) : ""}" placeholder="—" class="input-moneda ${CELDA}" /></td>
            <td data-col="tot-ppto" class="px-2 py-1 text-right text-xs tabular-nums">${formatoMoneda(totPpto)}</td>
            <td data-col="tot-contr" class="px-2 py-1 text-right text-xs tabular-nums">${totContr === null ? "—" : formatoMoneda(totContr)}</td>
            <td data-col="ahorro-unit" class="px-2 py-1 text-right text-xs tabular-nums ${ahorroUnit === null ? "text-gray-400" : claseAhorro(ahorroUnit)}">${ahorroUnit === null ? "—" : formatoMoneda(ahorroUnit)}</td>
            <td data-col="ahorro-tot" class="px-2 py-1 text-right text-xs tabular-nums ${ahorroTot === null ? "text-gray-400" : claseAhorro(ahorroTot)}">${ahorroTot === null ? "—" : formatoMoneda(ahorroTot)}</td>
            <td class="px-2 py-1 text-right text-xs tabular-nums">${PCT.fmtCant(e.cant_ejecutada_contratista)}</td>
            <td class="px-2 py-1 text-right text-xs tabular-nums">${PCT.fmtCant(e.cant_cortada_mo)}</td>
            <td class="px-2 py-1 text-right text-xs tabular-nums ${porCortar > 0 ? "font-semibold text-amber-700" : "text-gray-400"}">${PCT.fmtCant(porCortar)}</td>
          </tr>`;
        })
        .join("");
      activarCamposMoneda(".input-moneda", tbody);
      pintarTotalesContrato();
    };

    const guardarPrecioItem = (inp) => {
      const tr = inp?.closest("tr[data-id]");
      if (!tr || !inp.dataset.f) return null;
      const item = itemPorId(tr.dataset.id);
      if (!item) return null;
      const campo = inp.dataset.f;
      const valor = campo === "pu_contratista" && inp.value.trim() === "" ? null : valorMoneda(inp);
      const valorPrevio = item[campo] === undefined ? null : item[campo];
      if (valor === valorPrevio) return null;

      // Actualización optimista inmediata para evitar condiciones de carrera al crear cortes
      const claveVer = `${item.id}:${campo}`;
      const verActual = (versionEdicionItem.get(claveVer) || 0) + 1;
      versionEdicionItem.set(claveVer, verActual);
      item[campo] = valor;
      actualizarCeldasFilaContrato(tr, item);
      pintarTotalesContrato();
      pintarKpis();

      const promesa = (async () => {
        const { error } = await window.sb.from("presupuesto_items").update({ [campo]: valor }).eq("id", item.id);
        if (error) {
          if (versionEdicionItem.get(claveVer) === verActual) {
            item[campo] = valorPrevio;
            pintarContrato();
            pintarKpis();
          }
          manejarError(error, "No se pudo guardar el precio");
        }
      })();
      promesasGuardadoPendientes.add(promesa);
      promesa.finally(() => promesasGuardadoPendientes.delete(promesa));
      return promesa;
    };

    esperarGuardadosPendientes = async () => {
      const activo = document.activeElement;
      const contTabla = root.querySelector("#mo-contrato");
      if (activo && contTabla && contTabla.contains(activo) && activo.matches("input[data-f]")) {
        guardarPrecioItem(activo);
        activo.blur();
      }
      while (promesasGuardadoPendientes.size > 0) {
        await Promise.allSettled([...promesasGuardadoPendientes]);
      }
    };

    root.querySelector("#mo-contrato").addEventListener("change", (e) => {
      const inp = e.target;
      if (!inp.matches("input[data-f]")) return;
      guardarPrecioItem(inp);
    });

    // ------------------------------------------------------------------
    // Plantilla Excel contratista + Importación masiva desde Excel
    // ------------------------------------------------------------------
    const parsearNumeroExcel = (val) => {
      if (val === null || val === undefined) return null;
      if (typeof val === "number") return Number.isFinite(val) && val >= 0 ? Math.round(val * 100) / 100 : null;
      let s = String(val)
        .replace(/COP/gi, "")
        .replace(/\$/g, "")
        .replace(/\s+/g, "")
        .trim();
      if (!s || s === "-" || s === "—") return null;
      if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) {
        s = s.replace(/\./g, "").replace(",", ".");
      } else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) {
        s = s.replace(/,/g, "");
      } else if (s.includes(",") && !s.includes(".")) {
        s = s.replace(",", ".");
      } else {
        s = s.replace(/[^\d.-]/g, "");
      }
      const n = Number(s);
      return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
    };

    const descargarPlantillaExcel = async () => {
      await esperarGuardadosPendientes();
      const items = soloItems();
      if (!items.length) {
        return mostrarAviso("Primero carga ítems en la pestaña Cotización para generar la plantilla.", "info");
      }
      if (typeof asegurarXLSX === "function") {
        try {
          await asegurarXLSX();
        } catch (err) {
          return manejarError(err, "No se pudo cargar la librería Excel");
        }
      }
      if (!window.XLSX) return mostrarAviso("Librería Excel no disponible en esta página.", "error");

      const encabezado = ["Código/Ref", "Descripción", "Cantidad", "Unidad", "Ppto MO Unitario", "PU Contratista"];
      const filas = items.map((i) => [
        i.codigo || i.referencia || "",
        i.descripcion || "",
        PCT.num(i.cantidad),
        i.unidad || "",
        PCT.num(i.cu_mano_obra) || 0,
        i.pu_contratista !== null && i.pu_contratista !== undefined ? PCT.num(i.pu_contratista) : "",
      ]);

      const ws = window.XLSX.utils.aoa_to_sheet([encabezado, ...filas]);
      ws["!cols"] = [
        { wch: 14 },
        { wch: 46 },
        { wch: 12 },
        { wch: 10 },
        { wch: 18 },
        { wch: 18 },
      ];
      const wb = window.XLSX.utils.book_new();
      window.XLSX.utils.book_append_sheet(wb, ws, "Contrato_Contratista");
      const nombreArchivo = `Plantilla_Contratista_${(p().nombre || "Proyecto").replace(/[^\w\-]+/g, "_")}.xlsx`;
      window.XLSX.writeFile(wb, nombreArchivo);
      mostrarAviso("Plantilla contratista (.xlsx) descargada.", "exito");
    };

    const importarExcelContratista = async (file) => {
      if (!file) return;
      await esperarGuardadosPendientes();
      const items = soloItems();
      if (!items.length) {
        return mostrarAviso("No hay ítems en la cotización del proyecto para actualizar.", "error");
      }
      if (typeof asegurarXLSX === "function") {
        try {
          await asegurarXLSX();
        } catch (err) {
          return manejarError(err, "No se pudo cargar la librería Excel");
        }
      }
      if (!window.XLSX) return mostrarAviso("Librería Excel no disponible en esta página.", "error");

      try {
        const buffer = await file.arrayBuffer();
        const wb = window.XLSX.read(buffer, { type: "array" });
        const primeraHoja = wb.SheetNames[0];
        if (!primeraHoja) return mostrarAviso("El archivo Excel no contiene hojas.", "error");
        const aoa = window.XLSX.utils.sheet_to_json(wb.Sheets[primeraHoja], { header: 1, defval: "" });
        if (!aoa.length) return mostrarAviso("El archivo Excel está vacío.", "error");

        // Detectar fila de encabezados (hasta las primeras 15 filas)
        let filaHeader = -1;
        let colRef = 0;
        let colDesc = 1;
        let colPpto = 4;
        let colContr = 5;

        const maxScan = Math.min(15, aoa.length);
        for (let r = 0; r < maxScan; r++) {
          const rowNorm = (aoa[r] || []).map((c) => PCT.norm(c));
          const idxDesc = rowNorm.findIndex((c) => /descrip|actividad|concepto/.test(c));
          const idxContr = rowNorm.findIndex((c) => /contrat|pu\s*contr|tarifa|pactad/.test(c));
          const idxPpto = rowNorm.findIndex((c) => /ppto|presup|cu\s*mo|mano\s*de\s*obra|mo\s*unit/.test(c));
          if (idxDesc !== -1 || idxContr !== -1 || idxPpto !== -1) {
            filaHeader = r;
            const idxRef = rowNorm.findIndex((c) => /codigo|ref|item|^#$/.test(c));
            colRef = idxRef !== -1 ? idxRef : 0;
            colDesc = idxDesc !== -1 ? idxDesc : 1;
            colPpto = idxPpto !== -1 ? idxPpto : 4;
            colContr = idxContr !== -1 ? idxContr : 5;
            break;
          }
        }

        const inicioDatos = filaHeader >= 0 ? filaHeader + 1 : 1;

        // Índices para emparejamiento por Descripción y por Código/Referencia
        const porDesc = new Map();
        const porRef = new Map();
        items.forEach((it) => {
          const nd = PCT.norm(it.descripcion);
          if (nd && !porDesc.has(nd)) porDesc.set(nd, it);
          const nc = PCT.norm(it.codigo);
          if (nc && !porRef.has(nc)) porRef.set(nc, it);
          const nr = PCT.norm(it.referencia);
          if (nr && !porRef.has(nr)) porRef.set(nr, it);
        });

        const usados = new Set();
        const actualizaciones = [];
        let ordenFila = 0;

        for (let r = inicioDatos; r < aoa.length; r++) {
          const row = aoa[r] || [];
          const refRaw = String(row[colRef] ?? "").trim();
          const descRaw = String(row[colDesc] ?? "").trim();
          const descNorm = PCT.norm(descRaw);
          const refNorm = PCT.norm(refRaw);

          if (!refRaw && !descRaw && row.every((c) => String(c ?? "").trim() === "")) continue;
          if (/^total\b|^subtotal\b/i.test(descNorm) || /^total\b/i.test(refNorm)) continue;

          const pptoVal = colPpto >= 0 ? parsearNumeroExcel(row[colPpto]) : null;
          const contrVal = colContr >= 0 ? parsearNumeroExcel(row[colContr]) : null;

          let target = null;
          if (descNorm && porDesc.has(descNorm) && !usados.has(porDesc.get(descNorm).id)) {
            target = porDesc.get(descNorm);
          } else if (refNorm && porRef.has(refNorm) && !usados.has(porRef.get(refNorm).id)) {
            target = porRef.get(refNorm);
          } else if (ordenFila < items.length && !usados.has(items[ordenFila].id)) {
            target = items[ordenFila];
          }
          ordenFila += 1;

          if (!target) continue;
          if (pptoVal === null && contrVal === null) continue;

          const patch = {};
          if (pptoVal !== null) patch.cu_mano_obra = pptoVal;
          if (contrVal !== null) patch.pu_contratista = contrVal;
          usados.add(target.id);
          actualizaciones.push({ item: target, patch });
        }

        if (!actualizaciones.length) {
          return mostrarAviso("No se encontraron precios válidos para actualizar en el Excel.", "info");
        }

        // Guardar en lotes controlados en Supabase
        let exitosos = 0;
        let primerError = null;
        const TAM_LOTE = 10;
        for (let i = 0; i < actualizaciones.length; i += TAM_LOTE) {
          const lote = actualizaciones.slice(i, i + TAM_LOTE);
          const resultados = await Promise.all(
            lote.map(async ({ item, patch }) => {
              const { error } = await window.sb.from("presupuesto_items").update(patch).eq("id", item.id);
              if (error) return { ok: false, error };
              Object.assign(item, patch);
              return { ok: true };
            })
          );
          resultados.forEach((res) => {
            if (res.ok) exitosos += 1;
            else if (!primerError) primerError = res.error;
          });
        }

        pintarContrato();
        pintarKpis();

        if (primerError && exitosos === 0) {
          return manejarError(primerError, "No se pudieron importar los precios");
        }
        if (primerError) {
          mostrarAviso(`Se actualizaron ${exitosos} de ${actualizaciones.length} ítem(s). Algunos registros fallaron.`, "info");
        } else {
          mostrarAviso(`Excel importado: ${exitosos} ítem${exitosos === 1 ? "" : "s"} actualizado${exitosos === 1 ? "" : "s"}.`, "exito");
        }
      } catch (err) {
        manejarError(err, "No se pudo leer el archivo Excel del contratista");
      }
    };

    root.querySelector("#mo-descargar-plantilla").addEventListener("click", descargarPlantillaExcel);
    const inputArchivoExcel = root.querySelector("#mo-archivo-excel");
    root.querySelector("#mo-importar-excel").addEventListener("click", () => inputArchivoExcel.click());
    inputArchivoExcel.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (file) await importarExcelContratista(file);
    });

    // ------------------------------------------------------------------
    // Técnicos propios
    // ------------------------------------------------------------------
    const pintarFormPropia = () => {
      const tarifas = PCT.estado.tarifas;
      const nombres = [...new Set(propia.map((r) => r.tecnico))];
      root.querySelector("#mo-form-propia").innerHTML = tarifas.length
        ? `
          <div class="md:col-span-2"><label class="mb-1 block text-[11px] font-medium text-gray-700">Fecha</label><input id="mp-fecha" type="date" value="${PCT.hoyISO()}" class="${CLASE_INPUT}" /></div>
          <div class="md:col-span-2"><label class="mb-1 block text-[11px] font-medium text-gray-700">Técnico</label><input id="mp-tecnico" list="mp-nombres" placeholder="Nombre" class="${CLASE_INPUT}" /><datalist id="mp-nombres">${nombres.map((n) => `<option value="${escapeHtml(n)}"></option>`).join("")}</datalist></div>
          <div class="md:col-span-2"><label class="mb-1 block text-[11px] font-medium text-gray-700">Cargo</label><select id="mp-cargo" class="${CLASE_INPUT}">${tarifas.map((t) => `<option value="${t.id}">${escapeHtml(t.cargo)}</option>`).join("")}</select></div>
          <div class="md:col-span-2"><label class="mb-1 block text-[11px] font-medium text-gray-700">Ítem / actividad <span class="font-normal text-gray-400">(opcional)</span></label><select id="mp-item" class="${CLASE_INPUT}"><option value="">—</option>${soloItems().map((i) => `<option value="${i.id}">${escapeHtml(((i.codigo ? i.codigo + " · " : "") + i.descripcion).slice(0, 70))}</option>`).join("")}</select></div>
          <div><label class="mb-1 block text-[11px] font-medium text-gray-700">Días</label><input id="mp-dias" type="number" step="0.5" min="0" value="1" class="${CLASE_INPUT}" /></div>
          <div><label class="mb-1 block text-[11px] font-medium text-gray-700">Horas/día</label><input id="mp-horas" type="number" step="0.5" min="0" placeholder="cargo" class="${CLASE_INPUT}" /></div>
          <div><label class="mb-1 block text-[11px] font-medium text-gray-700">H. extra</label><input id="mp-extra" type="number" step="0.5" min="0" value="0" class="${CLASE_INPUT}" /></div>
          <div><button type="submit" class="w-full rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700">Agregar</button></div>
          <div class="col-span-2 md:col-span-12"><input id="mp-obs" placeholder="Observaciones (opcional)" class="${CLASE_INPUT}" /></div>`
        : `<p class="col-span-full text-sm text-amber-700">No hay tarifas de técnicos. Agrégalas en la pestaña <b>Inicio</b> para poder registrar horas.</p>`;
    };

    const pintarPropia = () => {
      const tbody = root.querySelector("#mo-propia");
      tbody.innerHTML = propia.length
        ? propia
            .map((r) => {
              const t = tarifaPorId(r.tarifa_id);
              const it = r.presupuesto_item_id ? itemPorId(r.presupuesto_item_id) : null;
              return `<tr data-id="${r.id}" class="border-t border-gray-100">
                <td class="px-2 py-1.5 text-xs">${formatoFecha(r.fecha)}</td>
                <td class="px-2 py-1.5 text-xs font-medium text-gray-800">${escapeHtml(r.tecnico)}</td>
                <td class="px-2 py-1.5 text-xs text-gray-600">${escapeHtml(t?.cargo || "(cargo eliminado)")}</td>
                <td class="px-2 py-1.5 text-xs text-gray-600"><span class="line-clamp-1">${it ? escapeHtml((it.codigo ? it.codigo + " · " : "") + it.descripcion) : "—"}</span></td>
                <td class="px-2 py-1.5 text-right text-xs tabular-nums">${PCT.fmtCant(r.dias)}</td>
                <td class="px-2 py-1.5 text-right text-xs tabular-nums">${r.horas_dia === null ? `<span class="text-gray-400">${PCT.fmtCant(t?.horas_dia)}</span>` : PCT.fmtCant(r.horas_dia)}</td>
                <td class="px-2 py-1.5 text-right text-xs tabular-nums">${PCT.fmtCant(r.horas_extra)}</td>
                <td class="px-2 py-1.5 text-right text-xs tabular-nums">${PCT.fmtCant(horasPropia(r))}</td>
                <td class="px-2 py-1.5 text-right text-xs font-semibold tabular-nums">${formatoMoneda(valorPropia(r))}</td>
                <td class="px-2 py-1.5 text-xs text-gray-500"><span class="line-clamp-1">${escapeHtml(r.observaciones || "")}</span></td>
                <td class="px-2 py-1.5 text-right"><button data-borrar class="text-gray-400 hover:text-red-600" title="Quitar"><span class="material-symbols-outlined text-[18px]">delete</span></button></td>
              </tr>`;
            })
            .join("")
        : `<tr><td colspan="11" class="py-6 text-center text-gray-400">Sin horas registradas.</td></tr>`;
      root.querySelector("#mo-propia-total").innerHTML = propia.length
        ? `<tr><td colspan="7" class="px-2 py-2 text-right uppercase">Total</td><td class="px-2 py-2 text-right tabular-nums">${PCT.fmtCant(propia.reduce((s, r) => s + horasPropia(r), 0))}</td><td class="px-2 py-2 text-right tabular-nums">${formatoMoneda(propia.reduce((s, r) => s + valorPropia(r), 0))}</td><td colspan="2"></td></tr>`
        : "";
    };

    root.querySelector("#mo-form-propia").addEventListener("submit", async (e) => {
      e.preventDefault();
      const q = (s) => root.querySelector(s);
      const tecnico = q("#mp-tecnico").value.trim();
      if (!tecnico) return mostrarAviso("Escribe el nombre del técnico.", "error");
      const horas = q("#mp-horas").value.trim();
      const fila = {
        proyecto_id: pid,
        fecha: q("#mp-fecha").value || PCT.hoyISO(),
        tecnico,
        tarifa_id: q("#mp-cargo").value || null,
        presupuesto_item_id: q("#mp-item").value || null,
        dias: PCT.num(q("#mp-dias").value),
        horas_dia: horas === "" ? null : PCT.num(horas),
        horas_extra: PCT.num(q("#mp-extra").value),
        observaciones: q("#mp-obs").value.trim() || null,
      };
      const { error } = await window.sb.from("registro_mo_propia").insert(fila);
      if (error) return manejarError(error, "No se pudo registrar");
      await Promise.all([cargar(), PCT.recargarFinanzas()]);
      pintarFormPropia();
      pintarPropia();
      pintarKpis();
      PCT.emit("finanzas");
      PCT.emit("proyecto");
      PCT.emit("ejec");
      mostrarAviso("Horas registradas.", "exito");
    });
    root.querySelector("#mo-propia").addEventListener("click", async (e) => {
      const b = e.target.closest("[data-borrar]");
      if (!b) return;
      const { data, error } = await window.sb
        .from("registro_mo_propia")
        .delete()
        .eq("id", b.closest("tr").dataset.id)
        .select("id");
      if (error) return manejarError(error, "No se pudo quitar");
      if (!data || data.length === 0) {
        return mostrarAviso("No tienes permisos para eliminar este registro.", "error");
      }
      await Promise.all([cargar(), PCT.recargarFinanzas()]);
      pintarPropia();
      pintarKpis();
      PCT.emit("finanzas");
      PCT.emit("proyecto");
      PCT.emit("ejec");
    });

    const pintarTodo = () => {
      pintarKpis();
      pintarCortes();
      pintarContrato();
      pintarPropia();
    };

    try {
      await Promise.all([cargar(), PCT.recargarTarifas()]);
    } catch (err) {
      return manejarError(err, "No se pudo cargar la mano de obra");
    }
    pintarFormPropia();
    pintarTodo();
  };
})(window.PCT);
