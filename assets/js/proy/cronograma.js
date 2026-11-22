// ============================================================================
// PROYECTOS · pestaña CRONOGRAMA (Lista de Tareas + Diagrama de Gantt + PDF/Excel).
// Tabla: public.proyecto_cronograma
// ============================================================================
(function (PCT) {
  const FASES = {
    pre_inicio: { label: "Pre-inicio", orden: 1, badge: "bg-slate-100 text-slate-700", header: "bg-slate-50 text-slate-800" },
    ejecucion: { label: "Ejecución", orden: 2, badge: "bg-blue-100 text-blue-800", header: "bg-blue-50/70 text-blue-900" },
    post_finalizacion: { label: "Post-finalización", orden: 3, badge: "bg-emerald-100 text-emerald-800", header: "bg-emerald-50/70 text-emerald-900" },
  };

  const ESTADOS_TAREA = {
    pendiente: { label: "Pendiente", bar: "bg-slate-400", badge: "bg-gray-100 text-gray-700" },
    en_curso: { label: "En curso", bar: "bg-primary", badge: "bg-blue-100 text-blue-800" },
    completada: { label: "Completada", bar: "bg-emerald-500", badge: "bg-emerald-100 text-emerald-800" },
  };

  const PLANTILLA_BASE = [
    { edt: "1.1", fase: "pre_inicio", titulo: "Visita técnica", dias: 2 },
    { edt: "1.2", fase: "pre_inicio", titulo: "Acta de inicio", dias: 2 },
    { edt: "1.3", fase: "pre_inicio", titulo: "Requisición y compra de material", dias: 5 },
    { edt: "1.4", fase: "pre_inicio", titulo: "Logística", dias: 3 },
    { edt: "2.1", fase: "ejecucion", titulo: "Tendido de tubería", dias: 7 },
    { edt: "2.2", fase: "ejecucion", titulo: "Tendido de cableado", dias: 7 },
    { edt: "2.3", fase: "ejecucion", titulo: "Instalación de equipos", dias: 6 },
    { edt: "2.4", fase: "ejecucion", titulo: "Configuración y pruebas", dias: 4 },
    { edt: "3.1", fase: "post_finalizacion", titulo: "Entrega final", dias: 2 },
    { edt: "3.2", fase: "post_finalizacion", titulo: "Acta de recibo y cierre", dias: 2 },
  ];

  const MESES_CORTOS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

  const sumarDias = (iso, dias) => {
    const d = new Date((iso || PCT.hoyISO()) + "T00:00:00");
    d.setDate(d.getDate() + dias);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  const diffDias = (isoA, isoB) => {
    const a = new Date(isoA + "T00:00:00");
    const b = new Date(isoB + "T00:00:00");
    return Math.round((b - a) / 86400000);
  };

  const calcularDuracion = (ini, fin) => {
    if (!ini || !fin) return null;
    return Math.max(1, diffDias(ini, fin) + 1);
  };

  const sugerirEdt = (tareas, fase) => {
    const prefijo = String(FASES[fase]?.orden || 2);
    const existentes = tareas.filter((t) => t.fase === fase);
    let maxSub = 0;
    existentes.forEach((t) => {
      const m = String(t.edt || "").match(/^\d+\.(\d+)$/);
      if (m) maxSub = Math.max(maxSub, Number(m[1]));
    });
    return `${prefijo}.${Math.max(maxSub, existentes.length) + 1}`;
  };

  const construirMesesGantt = (minIso, maxIso) => {
    const ini = new Date(minIso + "T00:00:00");
    const fin = new Date(maxIso + "T00:00:00");
    const meses = [];
    let y = ini.getFullYear();
    let m = ini.getMonth();
    const endY = fin.getFullYear();
    const endM = fin.getMonth();
    while (y < endY || (y === endY && m <= endM)) {
      const diasMes = new Date(y, m + 1, 0).getDate();
      meses.push({
        year: y,
        month: m,
        diasMes,
        label: `${MESES_CORTOS[m]} ${y}`,
      });
      m += 1;
      if (m > 11) {
        m = 0;
        y += 1;
      }
    }
    return meses;
  };

  // Mapea una fecha ISO a una posición continua en semanas [0, meses.length * 4]
  const fechaAPosSemana = (iso, meses, esFin) => {
    const d = new Date(iso + "T00:00:00");
    const y = d.getFullYear();
    const m = d.getMonth();
    const day = d.getDate();
    const idxMes = meses.findIndex((item) => item.year === y && item.month === m);
    if (idxMes < 0) {
      const primero = meses[0];
      if (y < primero.year || (y === primero.year && m < primero.month)) return 0;
      return meses.length * 4;
    }
    const diasMes = meses[idxMes].diasMes;
    let semIdx = 0;
    let offsetEnSem = 0;
    let anchoDia = 1 / 7;
    if (day <= 7) {
      semIdx = 0;
      offsetEnSem = (day - 1) / 7;
    } else if (day <= 14) {
      semIdx = 1;
      offsetEnSem = (day - 8) / 7;
    } else if (day <= 21) {
      semIdx = 2;
      offsetEnSem = (day - 15) / 7;
    } else {
      semIdx = 3;
      const diasSem4 = Math.max(1, diasMes - 21);
      offsetEnSem = (day - 22) / diasSem4;
      anchoDia = 1 / diasSem4;
    }
    return idxMes * 4 + semIdx + offsetEnSem + (esFin ? anchoDia : 0);
  };

  PCT.renderCronograma = async (root) => {
    const p = PCT.estado.proyecto;
    const pid = p.id;
    let tareas = [];
    let vista = "lista"; // "lista" | "gantt"

    root.innerHTML = `
      <div class="space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex flex-wrap items-center gap-3">
            <h2 class="text-base font-bold text-gray-900">Cronograma de Obra</h2>
            <div class="inline-flex rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
              <button type="button" id="crono-btn-lista" class="flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold bg-primary text-white">
                <span class="material-symbols-outlined text-[16px]">format_list_bulleted</span> Vista Lista
              </button>
              <button type="button" id="crono-btn-gantt" class="flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold text-gray-600 hover:text-gray-900">
                <span class="material-symbols-outlined text-[16px]">bar_chart</span> Diagrama de Gantt
              </button>
            </div>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <button type="button" id="crono-btn-plantilla" class="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50">
              <span class="material-symbols-outlined text-[16px]">playlist_add</span> Cargar plantilla base
            </button>
            <button type="button" id="crono-btn-nueva" class="flex items-center gap-1.5 rounded-lg border border-primary bg-blue-50 px-3 py-2 text-xs font-semibold text-primary hover:bg-blue-100">
              <span class="material-symbols-outlined text-[16px]">add</span> Nueva actividad
            </button>
            <button type="button" id="crono-btn-excel" class="flex items-center gap-1.5 rounded-lg border border-emerald-600 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100">
              <span class="material-symbols-outlined text-[16px]">table_view</span> Exportar Excel
            </button>
            <button type="button" id="crono-btn-pdf" class="flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-2 text-xs font-semibold text-white hover:bg-gray-700">
              <span class="material-symbols-outlined text-[16px]">picture_as_pdf</span> Exportar PDF
            </button>
          </div>
        </div>

        <div id="crono-resumen" class="grid grid-cols-2 gap-3 sm:grid-cols-4"></div>
        <div id="crono-contenido"></div>
      </div>`;

    const actualizarBotonesVista = () => {
      const bLista = root.querySelector("#crono-btn-lista");
      const bGantt = root.querySelector("#crono-btn-gantt");
      if (vista === "lista") {
        bLista.className = "flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold bg-primary text-white";
        bGantt.className = "flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold text-gray-600 hover:text-gray-900";
      } else {
        bGantt.className = "flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold bg-primary text-white";
        bLista.className = "flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold text-gray-600 hover:text-gray-900";
      }
    };

    const pintarResumen = () => {
      const total = tareas.length;
      const completadas = tareas.filter((t) => t.estado === "completada").length;
      const promedio = total ? Math.round(tareas.reduce((s, t) => s + PCT.num(t.progreso), 0) / total) : 0;
      const fechasIni = tareas.map((t) => t.fecha_inicio).filter(Boolean).sort();
      const fechasFin = tareas.map((t) => t.fecha_fin).filter(Boolean).sort();
      const rango = fechasIni.length && fechasFin.length ? `${formatoFecha(fechasIni[0])} → ${formatoFecha(fechasFin[fechasFin.length - 1])}` : "Sin fechas";
      const hitosFact = tareas.filter((t) => t.es_hito_facturacion && !t.hito_facturado);
      const montoHitos = hitosFact.reduce((s, t) => s + PCT.num(t.monto_facturacion_estimado), 0);

      const card = (lbl, val, sub = "") => `
        <div class="rounded-xl border border-gray-200 bg-white p-3.5">
          <p class="text-[11px] font-semibold uppercase text-gray-500">${lbl}</p>
          <p class="mt-0.5 text-lg font-bold text-gray-900">${val}</p>
          ${sub ? `<p class="text-[11px] text-gray-400">${sub}</p>` : ""}
        </div>`;

      root.querySelector("#crono-resumen").innerHTML =
        card("Actividades", total, `${completadas} completada${completadas === 1 ? "" : "s"}`) +
        card("Avance Cronograma", `${promedio}%`, `<div class="barra-progreso mt-1"><span style="width:${promedio}%"></span></div>`) +
        card("Rango Programado", `<span class="text-sm">${rango}</span>`, hitosFact.length ? `💰 ${hitosFact.length} hito(s) de cobro · ${formatoMoneda(montoHitos)}` : "") +
        card("Fin Contractual", p.fecha_fin_estimada ? formatoFecha(p.fecha_fin_estimada) : "—");
    };

    const pintarLista = () => {
      const cont = root.querySelector("#crono-contenido");
      if (!tareas.length) {
        cont.innerHTML = `
          <div class="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center">
            <span class="material-symbols-outlined text-[40px] text-gray-300">event_note</span>
            <p class="mt-2 text-sm font-semibold text-gray-700">No hay actividades en el cronograma</p>
            <p class="mt-1 text-xs text-gray-500">Haz clic en <b>Cargar plantilla base</b> para generar las fases estándar del proyecto o agrega una actividad manual.</p>
          </div>`;
        return;
      }

      cont.innerHTML = `
        <div class="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table class="w-full text-left text-xs">
            <thead class="bg-gray-50 text-[11px] uppercase text-gray-500">
              <tr>
                <th class="px-3 py-3 w-20 text-center">N° EDT</th>
                <th class="px-3 py-3">Fase</th>
                <th class="px-3 py-3">Actividad</th>
                <th class="px-3 py-3">Responsable</th>
                <th class="px-3 py-3">Inicio</th>
                <th class="px-3 py-3">Fin</th>
                <th class="px-3 py-3 text-center whitespace-nowrap">Duración (días)</th>
                <th class="px-3 py-3 w-28">Avance (%)</th>
                <th class="px-3 py-3">Estado</th>
                <th class="px-3 py-3 whitespace-nowrap">Hito facturación</th>
                <th class="px-3 py-3"></th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              ${tareas
                .map((t, idx) => {
                  const f = FASES[t.fase] || FASES.ejecucion;
                  const dur = calcularDuracion(t.fecha_inicio, t.fecha_fin);
                  const esHito = Boolean(t.es_hito_facturacion);
                  const montoEst = PCT.num(t.monto_facturacion_estimado);
                  return `
                    <tr class="hover:bg-gray-50/70 ${esHito ? "bg-amber-50/40" : ""}" data-tarea-id="${t.id}">
                      <td class="px-3 py-2 text-center">
                        <input type="text" data-campo="edt" value="${escapeHtml(t.edt || "")}" placeholder="${idx + 1}"
                          class="w-16 rounded-md border-gray-200 py-1 px-1.5 text-center font-mono text-xs font-semibold text-gray-700 focus:border-primary focus:ring-primary" />
                      </td>
                      <td class="px-3 py-2 whitespace-nowrap">
                        <span class="rounded-full px-2 py-0.5 text-[10px] font-semibold ${f.badge}">${f.label}</span>
                      </td>
                      <td class="px-3 py-2 font-semibold text-gray-900 min-w-[190px]">
                        <div>${escapeHtml(t.titulo)}</div>
                        ${
                          esHito
                            ? `<span class="mt-0.5 inline-flex items-center gap-1 rounded-full bg-amber-100 border border-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-900">💰 Hito facturación${montoEst > 0 ? ` · ${formatoMoneda(montoEst)}` : ""}${t.hito_facturado ? " · Facturado" : ""}</span>`
                            : ""
                        }
                      </td>
                      <td class="px-3 py-2">
                        <input type="text" data-campo="responsable" value="${escapeHtml(t.responsable || "")}" placeholder="Asignar..."
                          class="w-36 rounded-md border-gray-200 py-1 px-2 text-xs focus:border-primary focus:ring-primary" />
                      </td>
                      <td class="px-3 py-2">
                        <input type="date" data-campo="fecha_inicio" value="${t.fecha_inicio || ""}"
                          class="rounded-md border-gray-200 py-1 px-2 text-xs focus:border-primary focus:ring-primary" />
                      </td>
                      <td class="px-3 py-2">
                        <input type="date" data-campo="fecha_fin" value="${t.fecha_fin || ""}"
                          class="rounded-md border-gray-200 py-1 px-2 text-xs focus:border-primary focus:ring-primary" />
                      </td>
                      <td class="px-3 py-2 text-center tabular-nums font-semibold text-gray-700 whitespace-nowrap">
                        ${dur !== null ? `${dur} d` : "—"}
                      </td>
                      <td class="px-3 py-2">
                        <div class="flex items-center gap-1.5">
                          <input type="number" min="0" max="100" step="5" data-campo="progreso" value="${PCT.num(t.progreso)}"
                            class="w-16 rounded-md border-gray-200 py-1 px-2 text-xs text-right tabular-nums focus:border-primary focus:ring-primary" />
                          <span class="text-gray-400">%</span>
                        </div>
                      </td>
                      <td class="px-3 py-2">
                        <select data-campo="estado" class="rounded-md border-gray-200 py-1 px-2 text-xs focus:border-primary focus:ring-primary">
                          ${Object.entries(ESTADOS_TAREA)
                            .map(([k, v]) => `<option value="${k}" ${t.estado === k ? "selected" : ""}>${v.label}</option>`)
                            .join("")}
                        </select>
                      </td>
                      <td class="px-3 py-2 whitespace-nowrap">
                        <div class="flex items-center gap-2">
                          <label class="inline-flex cursor-pointer items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${esHito ? "border-amber-300 bg-amber-100 text-amber-900" : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50"}">
                            <input type="checkbox" data-campo="es_hito_facturacion" ${esHito ? "checked" : ""} class="rounded border-gray-300 text-amber-600 focus:ring-amber-500" />
                            <span>💰</span>
                          </label>
                          ${
                            esHito
                              ? `<input type="text" inputmode="decimal" data-campo="monto_facturacion_estimado" value="${montoEst > 0 ? formatearMiles(montoEst) : ""}" placeholder="Monto est."
                                  class="input-moneda w-28 rounded-md border-amber-300 bg-white py-1 px-2 text-right text-xs tabular-nums focus:border-primary focus:ring-primary" />`
                              : `<span class="text-[11px] text-gray-300">—</span>`
                          }
                        </div>
                      </td>
                      <td class="px-3 py-2 text-right">
                        <button type="button" data-borrar-tarea class="text-gray-400 hover:text-red-600" title="Eliminar actividad">
                          <span class="material-symbols-outlined text-[18px]">delete</span>
                        </button>
                      </td>
                    </tr>`;
                })
                .join("")}
            </tbody>
          </table>
        </div>`;
      activarCamposMoneda(".input-moneda", cont);
    };

    const pintarGantt = () => {
      const cont = root.querySelector("#crono-contenido");
      const conFechas = tareas.filter((t) => t.fecha_inicio && t.fecha_fin);
      if (!tareas.length || !conFechas.length) {
        cont.innerHTML = `
          <div class="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center text-xs text-gray-500">
            Asigna fechas de inicio y fin a las actividades en la Vista Lista (o carga la plantilla base) para visualizar el Diagrama de Gantt.
          </div>`;
        return;
      }

      const todasIni = conFechas.map((t) => t.fecha_inicio).sort();
      const todasFin = conFechas.map((t) => t.fecha_fin).sort();
      const minFecha = p.fecha_inicio && p.fecha_inicio < todasIni[0] ? p.fecha_inicio : todasIni[0];
      const maxFecha = todasFin[todasFin.length - 1];
      const totalDiasRango = Math.max(1, diffDias(minFecha, maxFecha) + 1);

      const meses = construirMesesGantt(minFecha, maxFecha);
      const totalSemanas = meses.length * 4;
      const anchoTimelinePx = Math.max(560, totalSemanas * 46);

      const headerMeses = meses
        .map(
          (m) => `
          <div class="col-span-4 border-l border-gray-200 px-2 py-1.5 text-center text-[11px] font-bold uppercase tracking-wide text-gray-700 bg-gray-100/80">
            ${m.label}
          </div>`
        )
        .join("");

      const headerSemanas = meses
        .map(() =>
          [1, 2, 3, 4]
            .map(
              (s) => `
              <div class="border-l border-t border-gray-200 py-1 text-center text-[10px] font-semibold text-gray-500 bg-gray-50">
                Sem ${s}
              </div>`
            )
            .join("")
        )
        .join("");

      const gridLineasFondo = Array.from({ length: totalSemanas })
        .map(() => `<div class="border-l border-gray-100 h-full"></div>`)
        .join("");

      // Agrupar tareas por fase manteniendo el orden canónico
      const ordenFases = Object.keys(FASES);
      const fasesPresentes = [
        ...ordenFases.filter((fk) => tareas.some((t) => (t.fase || "ejecucion") === fk)),
        ...Array.from(new Set(tareas.map((t) => t.fase || "ejecucion"))).filter((fk) => !FASES[fk]),
      ];

      let contadorGlobal = 0;
      const bloquesFases = fasesPresentes
        .map((fk) => {
          const f = FASES[fk] || { label: fk, orden: 9, badge: "bg-gray-100 text-gray-700", header: "bg-gray-50 text-gray-800" };
          const grupo = tareas.filter((t) => (t.fase || "ejecucion") === fk);
          const promFase = grupo.length ? Math.round(grupo.reduce((s, t) => s + PCT.num(t.progreso), 0) / grupo.length) : 0;

          const headerFaseHtml = `
            <div class="flex border-t border-gray-200 ${f.header}">
              <div class="w-[300px] shrink-0 px-3 py-2 flex items-center justify-between gap-2">
                <span class="text-xs font-bold uppercase tracking-wide">${f.orden ? `${f.orden}. ` : ""}${escapeHtml(f.label)}</span>
                <span class="text-[10px] font-semibold opacity-75">${grupo.length} act. · ${promFase}%</span>
              </div>
              <div class="flex-1 grid border-l border-gray-200" style="min-width:${anchoTimelinePx}px; grid-template-columns: repeat(${totalSemanas}, minmax(0, 1fr));">
                ${Array.from({ length: totalSemanas }).map(() => `<div class="border-l border-gray-200/50"></div>`).join("")}
              </div>
            </div>`;

          const filasHtml = grupo
            .map((t) => {
              contadorGlobal += 1;
              const est = ESTADOS_TAREA[t.estado] || ESTADOS_TAREA.pendiente;
              const prog = Math.max(0, Math.min(100, PCT.num(t.progreso)));
              const edtLabel = t.edt ? escapeHtml(t.edt) : String(contadorGlobal);
              const tieneFechas = Boolean(t.fecha_inicio && t.fecha_fin);
              const dur = calcularDuracion(t.fecha_inicio, t.fecha_fin);

              const esHito = Boolean(t.es_hito_facturacion);
              const montoHito = PCT.num(t.monto_facturacion_estimado);

              let barraHtml = `<span class="px-3 text-[10px] italic text-gray-400">Sin fechas asignadas</span>`;
              if (tieneFechas) {
                const startPos = fechaAPosSemana(t.fecha_inicio, meses, false);
                const endPos = fechaAPosSemana(t.fecha_fin, meses, true);
                const leftPct = Math.max(0, Math.min(98.5, (startPos / totalSemanas) * 100));
                const widthPct = Math.max(1.5, Math.min(100 - leftPct, ((endPos - startPos) / totalSemanas) * 100));
                const barraAngosta = widthPct < 7;

                barraHtml = `
                  <div class="relative z-10 w-full h-6 flex items-center">
                    <div class="absolute top-0.5 bottom-0.5 rounded-md ${esHito ? "bg-amber-500 ring-2 ring-amber-300" : est.bar} shadow-sm overflow-hidden flex items-center"
                      style="left:${leftPct.toFixed(2)}%; width:${widthPct.toFixed(2)}%;"
                      title="${edtLabel} · ${escapeHtml(t.titulo)}: ${formatoFecha(t.fecha_inicio)} → ${formatoFecha(t.fecha_fin)} (${dur}d · ${prog}%)${esHito ? ` · 💰 Hito facturación${montoHito > 0 ? " " + formatoMoneda(montoHito) : ""}` : ""}">
                      <div class="h-full bg-black/20 transition-all" style="width:${prog}%"></div>
                      ${
                        barraAngosta
                          ? ""
                          : `<span class="relative z-10 px-2 text-[10px] font-bold text-white whitespace-nowrap drop-shadow-sm">${esHito ? "💰 " : ""}${prog}%</span>`
                      }
                    </div>
                    ${
                      barraAngosta
                        ? `<span class="absolute text-[10px] font-bold text-gray-700 whitespace-nowrap" style="left:calc(${(leftPct + widthPct).toFixed(2)}% + 4px);">${esHito ? "💰 " : ""}${prog}%</span>`
                        : ""
                    }
                  </div>`;
              }

              return `
                <div class="flex items-stretch border-t border-gray-100 hover:bg-gray-50/80 ${esHito ? "bg-amber-50/30" : ""}">
                  <div class="w-[300px] shrink-0 px-3 py-2 flex items-center gap-2">
                    <span class="inline-flex min-w-[34px] justify-center rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-gray-700">${edtLabel}</span>
                    <div class="min-w-0 flex-1">
                      <div class="flex items-center gap-1.5">
                        <p class="truncate text-xs font-semibold text-gray-800" title="${escapeHtml(t.titulo)}">${escapeHtml(t.titulo)}</p>
                        ${esHito ? `<span class="shrink-0 rounded-full bg-amber-100 border border-amber-200 px-1.5 py-0.5 text-[9px] font-bold text-amber-900">💰 Hito facturación</span>` : ""}
                      </div>
                      <p class="truncate text-[10px] text-gray-400">${escapeHtml(t.responsable || "Sin responsable")}${dur ? ` · ${dur}d` : ""}${esHito && montoHito > 0 ? ` · ${formatoMoneda(montoHito)}` : ""}</p>
                    </div>
                  </div>
                  <div class="flex-1 relative flex items-center border-l border-gray-200 px-0 py-1.5" style="min-width:${anchoTimelinePx}px;">
                    <div class="absolute inset-0 grid pointer-events-none" style="grid-template-columns: repeat(${totalSemanas}, minmax(0, 1fr));">
                      ${gridLineasFondo}
                    </div>
                    ${barraHtml}
                  </div>
                </div>`;
            })
            .join("");

          return headerFaseHtml + filasHtml;
        })
        .join("");

      cont.innerHTML = `
        <div class="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div class="overflow-x-auto">
            <div class="inline-block min-w-full align-middle">
              <div class="flex bg-gray-50 border-b border-gray-200">
                <div class="w-[300px] shrink-0 px-3 py-2 flex items-center text-[11px] font-bold uppercase text-gray-500">
                  EDT · Actividad / Responsable
                </div>
                <div class="flex-1 grid" style="min-width:${anchoTimelinePx}px; grid-template-columns: repeat(${totalSemanas}, minmax(0, 1fr));">
                  ${headerMeses}
                  ${headerSemanas}
                </div>
              </div>
              <div>${bloquesFases}</div>
            </div>
          </div>
          <div class="flex flex-wrap items-center gap-4 border-t border-gray-100 bg-gray-50/60 px-4 py-2.5 text-[11px] text-gray-500">
            <span class="flex items-center gap-1.5"><span class="h-2.5 w-2.5 rounded bg-slate-400"></span> Pendiente</span>
            <span class="flex items-center gap-1.5"><span class="h-2.5 w-2.5 rounded bg-primary"></span> En curso</span>
            <span class="flex items-center gap-1.5"><span class="h-2.5 w-2.5 rounded bg-emerald-500"></span> Completada</span>
            <span class="flex items-center gap-1.5"><span class="h-2.5 w-2.5 rounded bg-amber-500"></span> 💰 Hito facturación</span>
            <span class="ml-auto text-[10px]">Duración total del rango: ${totalDiasRango} días</span>
          </div>
        </div>`;
    };

    const pintar = () => {
      actualizarBotonesVista();
      pintarResumen();
      if (vista === "lista") pintarLista();
      else pintarGantt();
    };

    const cargar = async () => {
      const { data, error } = await window.sb
        .from("proyecto_cronograma")
        .select("*")
        .eq("proyecto_id", pid)
        .order("orden", { ascending: true })
        .order("fecha_inicio", { ascending: true });
      if (error) return manejarError(error, "No se pudo cargar el cronograma");
      tareas = data || [];
      pintar();
    };

    const cargarPlantillaBase = async () => {
      if (tareas.length) {
        const ok = await PCT.confirmar(
          "Cargar plantilla base",
          "Ya existen actividades en el cronograma. ¿Deseas agregar las actividades estándar al final?",
          "Agregar plantilla"
        );
        if (!ok) return;
      }

      let cursor = p.fecha_inicio || PCT.hoyISO();
      const ordenBase = tareas.length ? Math.max(...tareas.map((t) => PCT.num(t.orden))) + 1 : 1;
      const filas = PLANTILLA_BASE.map((item, idx) => {
        const inicio = cursor;
        const fin = sumarDias(inicio, item.dias - 1);
        cursor = sumarDias(fin, 1);
        return {
          proyecto_id: pid,
          orden: ordenBase + idx,
          edt: item.edt,
          fase: item.fase,
          titulo: item.titulo,
          responsable: p.director_proyecto || null,
          fecha_inicio: inicio,
          fecha_fin: fin,
          progreso: 0,
          estado: "pendiente",
        };
      });

      const { error } = await window.sb.from("proyecto_cronograma").insert(filas);
      if (error) return manejarError(error, "No se pudo cargar la plantilla base");
      mostrarAviso("Plantilla base cargada en el cronograma.", "exito");
      await cargar();
    };

    const abrirModalNueva = () => {
      const edtInicial = sugerirEdt(tareas, "pre_inicio");
      const m = PCT.modal({
        titulo: "Nueva actividad de cronograma",
        ancho: "max-w-md",
        html: `
          <div class="space-y-3 text-xs">
            <div class="grid grid-cols-3 gap-3">
              <div>
                <label class="mb-1 block font-medium text-gray-700">N° EDT</label>
                <input type="text" id="cr-edt" value="${escapeHtml(edtInicial)}" placeholder="Ej. 1.5" class="w-full rounded-lg border-gray-300 font-mono text-xs" />
              </div>
              <div class="col-span-2">
                <label class="mb-1 block font-medium text-gray-700">Fase</label>
                <select id="cr-fase" class="w-full rounded-lg border-gray-300 text-xs">
                  ${Object.entries(FASES).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join("")}
                </select>
              </div>
            </div>
            <div>
              <label class="mb-1 block font-medium text-gray-700">Título de la actividad *</label>
              <input type="text" id="cr-titulo" placeholder="Ej. Instalación de racks de comunicaciones" class="w-full rounded-lg border-gray-300 text-xs" />
            </div>
            <div>
              <label class="mb-1 block font-medium text-gray-700">Responsable</label>
              <input type="text" id="cr-resp" value="${escapeHtml(p.director_proyecto || "")}" class="w-full rounded-lg border-gray-300 text-xs" />
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="mb-1 block font-medium text-gray-700">Fecha inicio</label>
                <input type="date" id="cr-ini" value="${p.fecha_inicio || PCT.hoyISO()}" class="w-full rounded-lg border-gray-300 text-xs" />
              </div>
              <div>
                <label class="mb-1 block font-medium text-gray-700">Fecha fin</label>
                <input type="date" id="cr-fin" value="${sumarDias(p.fecha_inicio || PCT.hoyISO(), 3)}" class="w-full rounded-lg border-gray-300 text-xs" />
              </div>
            </div>
            <div class="rounded-lg border border-amber-200 bg-amber-50/60 p-3 space-y-2">
              <label class="flex cursor-pointer items-center gap-2 font-semibold text-amber-900">
                <input type="checkbox" id="cr-hito-fact" class="rounded border-amber-300 text-amber-600 focus:ring-amber-500" />
                <span>💰 Marcar como Hito de facturación</span>
              </label>
              <div id="cr-monto-fact-wrap" class="hidden">
                <label class="mb-1 block font-medium text-amber-900">Monto estimado a facturar (COP)</label>
                <input type="text" inputmode="decimal" id="cr-monto-fact" placeholder="0" class="input-moneda w-full rounded-lg border-amber-300 bg-white text-xs font-semibold" />
              </div>
            </div>
            <div>
              <label class="mb-1 block font-medium text-gray-700">Notas</label>
              <textarea id="cr-notas" rows="2" class="w-full rounded-lg border-gray-300 text-xs"></textarea>
            </div>
          </div>`,
        botones: [
          { texto: "Cancelar" },
          {
            texto: "Guardar",
            clase: PCT.BTN_PRIMARIO,
            onClick: async ({ el }) => {
              const titulo = el.querySelector("#cr-titulo").value.trim();
              if (!titulo) {
                mostrarAviso("Escribe el título de la actividad", "error");
                return false;
              }
              const fecha_inicio = el.querySelector("#cr-ini").value || null;
              const fecha_fin = el.querySelector("#cr-fin").value || null;
              if (fecha_inicio && fecha_fin && fecha_fin < fecha_inicio) {
                mostrarAviso("La fecha de fin no puede ser anterior a la fecha de inicio.", "error");
                return false;
              }
              const orden = tareas.length ? Math.max(...tareas.map((t) => PCT.num(t.orden))) + 1 : 1;
              const esHito = Boolean(el.querySelector("#cr-hito-fact")?.checked);
              const montoFact = esHito ? valorMoneda(el.querySelector("#cr-monto-fact")) : 0;
              const basePayload = {
                proyecto_id: pid,
                orden,
                edt: el.querySelector("#cr-edt").value.trim() || null,
                fase: el.querySelector("#cr-fase").value,
                titulo,
                responsable: el.querySelector("#cr-resp").value.trim() || null,
                fecha_inicio,
                fecha_fin,
                notas: el.querySelector("#cr-notas").value.trim() || null,
                progreso: 0,
                estado: "pendiente",
              };
              const payloadConHito = esHito
                ? { ...basePayload, es_hito_facturacion: true, monto_facturacion_estimado: montoFact || null }
                : basePayload;
              let { error } = await window.sb.from("proyecto_cronograma").insert(payloadConHito);
              if (error && esHito && (error.code === "42703" || error.code === "PGRST204" || /es_hito_facturacion|monto_facturacion_estimado/i.test(String(error.message || "")))) {
                const retry = await window.sb.from("proyecto_cronograma").insert(basePayload);
                error = retry.error;
                if (!error) {
                  mostrarAviso("Actividad creada (falta ejecutar migración SQL para guardar Hito de facturación).", "info");
                  await cargar();
                  return;
                }
              }
              if (error) {
                manejarError(error, "No se pudo crear la actividad");
                return false;
              }
              mostrarAviso("Actividad agregada.", "exito");
              await cargar();
            },
          },
        ],
      });
      activarCamposMoneda(".input-moneda", m.el);
      const edtInput = m.el.querySelector("#cr-edt");
      const faseSel = m.el.querySelector("#cr-fase");
      let edtEditado = false;
      edtInput?.addEventListener("input", () => {
        edtEditado = true;
      });
      faseSel?.addEventListener("change", () => {
        if (!edtEditado && edtInput) edtInput.value = sugerirEdt(tareas, faseSel.value);
      });
      const chkHito = m.el.querySelector("#cr-hito-fact");
      const wrapMonto = m.el.querySelector("#cr-monto-fact-wrap");
      chkHito?.addEventListener("change", () => {
        wrapMonto?.classList.toggle("hidden", !chkHito.checked);
      });
    };

    const exportarPDF = async () => {
      if (!tareas.length) {
        return mostrarAviso("No hay actividades para exportar", "info");
      }
      if (typeof asegurarJsPDF === "function") {
        try {
          await asegurarJsPDF();
        } catch (err) {
          return manejarError(err, "No se pudo cargar la librería PDF");
        }
      }
      if (!window.jspdf?.jsPDF) {
        return mostrarAviso("Librería PDF no disponible en esta página", "error");
      }
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "letter" });
      doc.setFontSize(14);
      doc.text(`Cronograma de Obra · ${p.nombre}`, 14, 15);
      doc.setFontSize(9);
      doc.setTextColor(100);
      doc.text(
        `Cliente: ${p.clientes?.nombre || "—"}   |   Contrato: ${p.numero_contrato || "—"}   |   Fecha: ${formatoFecha(PCT.hoyISO())}`,
        14,
        21
      );

      const filas = tareas.map((t, idx) => {
        const dur = calcularDuracion(t.fecha_inicio, t.fecha_fin);
        return [
          t.edt || String(idx + 1),
          FASES[t.fase]?.label || t.fase,
          t.titulo,
          t.responsable || "—",
          formatoFecha(t.fecha_inicio),
          formatoFecha(t.fecha_fin),
          dur !== null ? `${dur} d` : "—",
          `${PCT.num(t.progreso)}%`,
          ESTADOS_TAREA[t.estado]?.label || t.estado,
        ];
      });

      doc.autoTable({
        startY: 26,
        head: [["N° EDT", "Fase", "Actividad", "Responsable", "Inicio", "Fin", "Duración (días)", "Avance", "Estado"]],
        body: filas,
        styles: { fontSize: 8, cellPadding: 2.5 },
        headStyles: { fillColor: [19, 91, 236] },
      });

      const nombreArchivo = `Cronograma_${(p.nombre || "Proyecto").replace(/[^\w\-]+/g, "_")}.pdf`;
      doc.save(nombreArchivo);
      mostrarAviso("Cronograma PDF exportado.", "exito");
    };

    const exportarExcel = async () => {
      if (!tareas.length) {
        return mostrarAviso("No hay actividades para exportar", "info");
      }
      if (typeof asegurarXLSX === "function") {
        try {
          await asegurarXLSX();
        } catch (err) {
          return manejarError(err, "No se pudo cargar la librería Excel");
        }
      }
      if (!window.XLSX) {
        return mostrarAviso("Librería Excel no disponible en esta página", "error");
      }

      const encabezado = [
        [`Cronograma de Obra · ${p.nombre || ""}`],
        [`Cliente: ${p.clientes?.nombre || "—"}`, `Contrato: ${p.numero_contrato || "—"}`, `Fecha: ${formatoFecha(PCT.hoyISO())}`],
        [],
        ["N° EDT", "Fase", "Actividad", "Responsable", "Inicio", "Fin", "Duración (días)", "Avance (%)", "Estado"],
      ];

      const filas = tareas.map((t, idx) => {
        const dur = calcularDuracion(t.fecha_inicio, t.fecha_fin);
        return [
          t.edt || String(idx + 1),
          FASES[t.fase]?.label || t.fase,
          t.titulo,
          t.responsable || "—",
          t.fecha_inicio ? formatoFecha(t.fecha_inicio) : "—",
          t.fecha_fin ? formatoFecha(t.fecha_fin) : "—",
          dur !== null ? dur : "—",
          PCT.num(t.progreso),
          ESTADOS_TAREA[t.estado]?.label || t.estado,
        ];
      });

      const ws = window.XLSX.utils.aoa_to_sheet([...encabezado, ...filas]);
      ws["!cols"] = [
        { wch: 10 },
        { wch: 18 },
        { wch: 38 },
        { wch: 24 },
        { wch: 14 },
        { wch: 14 },
        { wch: 16 },
        { wch: 12 },
        { wch: 14 },
      ];
      const wb = window.XLSX.utils.book_new();
      window.XLSX.utils.book_append_sheet(wb, ws, "Cronograma");
      const nombreArchivo = `Cronograma_${(p.nombre || "Proyecto").replace(/[^\w\-]+/g, "_")}.xlsx`;
      window.XLSX.writeFile(wb, nombreArchivo);
      mostrarAviso("Cronograma Excel exportado.", "exito");
    };

    root.querySelector("#crono-btn-lista").addEventListener("click", () => {
      vista = "lista";
      pintar();
    });
    root.querySelector("#crono-btn-gantt").addEventListener("click", () => {
      vista = "gantt";
      pintar();
    });
    root.querySelector("#crono-btn-plantilla").addEventListener("click", cargarPlantillaBase);
    root.querySelector("#crono-btn-nueva").addEventListener("click", abrirModalNueva);
    root.querySelector("#crono-btn-excel").addEventListener("click", exportarExcel);
    root.querySelector("#crono-btn-pdf").addEventListener("click", exportarPDF);

    // Inline editing & delete in Lista view
    root.querySelector("#crono-contenido").addEventListener("change", async (e) => {
      const input = e.target.closest("[data-campo]");
      if (!input) return;
      const tr = input.closest("tr[data-tarea-id]");
      if (!tr) return;
      const id = tr.dataset.tareaId;
      const campo = input.dataset.campo;
      const t = tareas.find((x) => x.id === id);
      let valor = input.value;
      if (campo === "es_hito_facturacion") {
        valor = Boolean(input.checked);
      } else if (campo === "monto_facturacion_estimado") {
        valor = input.value.trim() === "" ? null : valorMoneda(input);
      } else if (campo === "progreso") {
        valor = Math.max(0, Math.min(100, PCT.num(valor)));
        input.value = valor;
      } else if (campo === "edt") {
        valor = valor.trim() || null;
      } else if (valor === "") {
        valor = null;
      }

      if (campo === "fecha_inicio" || campo === "fecha_fin") {
        const ini = campo === "fecha_inicio" ? valor : t?.fecha_inicio;
        const fin = campo === "fecha_fin" ? valor : t?.fecha_fin;
        if (ini && fin && fin < ini) {
          input.value = (t && t[campo]) || "";
          return mostrarAviso("La fecha de fin no puede ser anterior a la fecha de inicio.", "error");
        }
      }

      const patch = { [campo]: valor };
      if (campo === "estado" && valor === "completada") {
        patch.progreso = 100;
      } else if (campo === "progreso" && valor === 100) {
        patch.estado = "completada";
      } else if (campo === "progreso" && valor < 100 && t?.estado === "completada") {
        patch.estado = "en_curso";
      }

      const { error } = await window.sb.from("proyecto_cronograma").update(patch).eq("id", id);
      if (error) {
        const msg = String(error.message || "");
        if (
          (campo === "es_hito_facturacion" || campo === "monto_facturacion_estimado") &&
          (error.code === "42703" || error.code === "PGRST204" || /es_hito_facturacion|monto_facturacion_estimado/i.test(msg))
        ) {
          if (campo === "es_hito_facturacion") input.checked = Boolean(t?.es_hito_facturacion);
          else input.value = t?.monto_facturacion_estimado ? formatearMiles(t.monto_facturacion_estimado) : "";
          return mostrarAviso("Falta ejecutar la migración SQL (migracion_2026-11_comite_mejoras.sql) en Supabase para guardar Hitos de facturación.", "error");
        }
        return manejarError(error, "No se pudo actualizar la actividad");
      }

      if (t) Object.assign(t, patch);
      pintarResumen();
      if (
        patch.progreso !== undefined ||
        patch.estado !== undefined ||
        patch.fecha_inicio !== undefined ||
        patch.fecha_fin !== undefined ||
        patch.es_hito_facturacion !== undefined ||
        patch.monto_facturacion_estimado !== undefined
      ) {
        pintarLista();
      }
      mostrarAviso("Actividad actualizada", "exito");
    });

    root.querySelector("#crono-contenido").addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-borrar-tarea]");
      if (!btn) return;
      const id = btn.closest("tr[data-tarea-id]")?.dataset.tareaId;
      if (!id) return;
      const ok = await PCT.confirmar("Eliminar actividad", "¿Eliminar esta actividad del cronograma?", "Eliminar", true);
      if (!ok) return;
      const { error } = await window.sb.from("proyecto_cronograma").delete().eq("id", id);
      if (error) return manejarError(error, "No se pudo eliminar la actividad");
      mostrarAviso("Actividad eliminada.", "info");
      await cargar();
    });

    await cargar();
  };
})(window.PCT);
