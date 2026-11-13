// ============================================================================
// PROYECTOS · pestaña CRONOGRAMA (Lista de Tareas + Diagrama de Gantt + PDF).
// Tabla: public.proyecto_cronograma
// ============================================================================
(function (PCT) {
  const FASES = {
    pre_inicio: { label: "Pre-inicio", badge: "bg-slate-100 text-slate-700" },
    ejecucion: { label: "Ejecución", badge: "bg-blue-100 text-blue-800" },
    post_finalizacion: { label: "Post-finalización", badge: "bg-emerald-100 text-emerald-800" },
  };

  const ESTADOS_TAREA = {
    pendiente: { label: "Pendiente", bar: "bg-slate-400", badge: "bg-gray-100 text-gray-700" },
    en_curso: { label: "En curso", bar: "bg-primary", badge: "bg-blue-100 text-blue-800" },
    completada: { label: "Completada", bar: "bg-emerald-500", badge: "bg-emerald-100 text-emerald-800" },
  };

  const PLANTILLA_BASE = [
    { fase: "pre_inicio", titulo: "Visita técnica", dias: 2 },
    { fase: "pre_inicio", titulo: "Acta de inicio", dias: 2 },
    { fase: "pre_inicio", titulo: "Requisición y compra de material", dias: 5 },
    { fase: "pre_inicio", titulo: "Logística", dias: 3 },
    { fase: "ejecucion", titulo: "Tendido de tubería", dias: 7 },
    { fase: "ejecucion", titulo: "Tendido de cableado", dias: 7 },
    { fase: "ejecucion", titulo: "Instalación de equipos", dias: 6 },
    { fase: "ejecucion", titulo: "Configuración y pruebas", dias: 4 },
    { fase: "post_finalizacion", titulo: "Entrega final", dias: 2 },
    { fase: "post_finalizacion", titulo: "Acta de recibo y cierre", dias: 2 },
  ];

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
            <button type="button" id="crono-btn-pdf" class="flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-2 text-xs font-semibold text-white hover:bg-gray-700">
              <span class="material-symbols-outlined text-[16px]">picture_as_pdf</span> Exportar Cronograma PDF
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

      const card = (lbl, val, sub = "") => `
        <div class="rounded-xl border border-gray-200 bg-white p-3.5">
          <p class="text-[11px] font-semibold uppercase text-gray-500">${lbl}</p>
          <p class="mt-0.5 text-lg font-bold text-gray-900">${val}</p>
          ${sub ? `<p class="text-[11px] text-gray-400">${sub}</p>` : ""}
        </div>`;

      root.querySelector("#crono-resumen").innerHTML =
        card("Actividades", total, `${completadas} completada${completadas === 1 ? "" : "s"}`) +
        card("Avance Cronograma", `${promedio}%`, `<div class="barra-progreso mt-1"><span style="width:${promedio}%"></span></div>`) +
        card("Rango Programado", `<span class="text-sm">${rango}</span>`) +
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
                <th class="px-3 py-3 w-10 text-center">#</th>
                <th class="px-3 py-3">Fase</th>
                <th class="px-3 py-3">Actividad</th>
                <th class="px-3 py-3">Responsable</th>
                <th class="px-3 py-3">Inicio</th>
                <th class="px-3 py-3">Fin</th>
                <th class="px-3 py-3 w-28">Avance (%)</th>
                <th class="px-3 py-3">Estado</th>
                <th class="px-3 py-3"></th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              ${tareas
                .map((t, idx) => {
                  const f = FASES[t.fase] || FASES.ejecucion;
                  return `
                    <tr class="hover:bg-gray-50/70" data-tarea-id="${t.id}">
                      <td class="px-3 py-2 text-center font-semibold text-gray-400">${idx + 1}</td>
                      <td class="px-3 py-2 whitespace-nowrap">
                        <span class="rounded-full px-2 py-0.5 text-[10px] font-semibold ${f.badge}">${f.label}</span>
                      </td>
                      <td class="px-3 py-2 font-semibold text-gray-900 min-w-[180px]">${escapeHtml(t.titulo)}</td>
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
      const totalDias = Math.max(1, diffDias(minFecha, maxFecha) + 1);

      const marcadores = [0, 0.25, 0.5, 0.75, 1].map((frac) => {
        const d = sumarDias(minFecha, Math.round(frac * (totalDias - 1)));
        return `<span class="text-[10px] font-medium text-gray-400">${formatoFecha(d)}</span>`;
      }).join("");

      const filas = tareas.map((t) => {
        const f = FASES[t.fase] || FASES.ejecucion;
        const est = ESTADOS_TAREA[t.estado] || ESTADOS_TAREA.pendiente;
        const ini = t.fecha_inicio || minFecha;
        const fin = t.fecha_fin || ini;
        const offsetDias = Math.max(0, diffDias(minFecha, ini));
        const durDias = Math.max(1, diffDias(ini, fin) + 1);
        const leftPct = Math.min(98, (offsetDias / totalDias) * 100);
        const widthPct = Math.max(2, Math.min(100 - leftPct, (durDias / totalDias) * 100));
        const prog = Math.max(0, Math.min(100, PCT.num(t.progreso)));

        return `
          <div class="grid grid-cols-12 items-center border-t border-gray-100 hover:bg-gray-50/70">
            <div class="col-span-4 px-3 py-2.5 pr-4">
              <div class="flex items-center gap-1.5">
                <span class="rounded px-1.5 py-0.5 text-[9px] font-semibold ${f.badge}">${f.label}</span>
                <span class="truncate text-xs font-semibold text-gray-800" title="${escapeHtml(t.titulo)}">${escapeHtml(t.titulo)}</span>
              </div>
              <p class="mt-0.5 text-[10px] text-gray-400">${escapeHtml(t.responsable || "Sin responsable")} · ${prog}%</p>
            </div>
            <div class="col-span-8 relative h-9 px-2 flex items-center border-l border-gray-100">
              <div class="relative w-full h-5 rounded bg-gray-100/70">
                <div class="absolute top-0 bottom-0 rounded ${est.bar} opacity-85 shadow-sm overflow-hidden flex items-center"
                  style="left:${leftPct.toFixed(2)}%; width:${widthPct.toFixed(2)}%;"
                  title="${escapeHtml(t.titulo)}: ${formatoFecha(ini)} → ${formatoFecha(fin)} (${durDias}d · ${prog}%)">
                  <div class="h-full bg-black/20" style="width:${prog}%"></div>
                  <span class="relative z-10 px-1.5 text-[9px] font-bold text-white truncate">${durDias}d</span>
                </div>
              </div>
            </div>
          </div>`;
      }).join("");

      cont.innerHTML = `
        <div class="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div class="grid grid-cols-12 bg-gray-50 border-b border-gray-200">
            <div class="col-span-4 px-3 py-2.5 text-[11px] font-bold uppercase text-gray-500">Actividad / Responsable</div>
            <div class="col-span-8 px-3 py-2.5 border-l border-gray-200 flex justify-between items-center">${marcadores}</div>
          </div>
          <div>${filas}</div>
          <div class="flex flex-wrap items-center gap-4 border-t border-gray-100 bg-gray-50/60 px-4 py-2.5 text-[11px] text-gray-500">
            <span class="flex items-center gap-1.5"><span class="h-2.5 w-2.5 rounded bg-slate-400"></span> Pendiente</span>
            <span class="flex items-center gap-1.5"><span class="h-2.5 w-2.5 rounded bg-primary"></span> En curso</span>
            <span class="flex items-center gap-1.5"><span class="h-2.5 w-2.5 rounded bg-emerald-500"></span> Completada</span>
            <span class="ml-auto text-[10px]">Duración total: ${totalDias} días</span>
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
      PCT.modal({
        titulo: "Nueva actividad de cronograma",
        ancho: "max-w-md",
        html: `
          <div class="space-y-3 text-xs">
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="mb-1 block font-medium text-gray-700">Fase</label>
                <select id="cr-fase" class="w-full rounded-lg border-gray-300 text-xs">
                  ${Object.entries(FASES).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join("")}
                </select>
              </div>
              <div>
                <label class="mb-1 block font-medium text-gray-700">Responsable</label>
                <input type="text" id="cr-resp" value="${escapeHtml(p.director_proyecto || "")}" class="w-full rounded-lg border-gray-300 text-xs" />
              </div>
            </div>
            <div>
              <label class="mb-1 block font-medium text-gray-700">Título de la actividad *</label>
              <input type="text" id="cr-titulo" placeholder="Ej. Instalación de racks de comunicaciones" class="w-full rounded-lg border-gray-300 text-xs" />
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
              const orden = tareas.length ? Math.max(...tareas.map((t) => PCT.num(t.orden))) + 1 : 1;
              const { error } = await window.sb.from("proyecto_cronograma").insert({
                proyecto_id: pid,
                orden,
                fase: el.querySelector("#cr-fase").value,
                titulo,
                responsable: el.querySelector("#cr-resp").value.trim() || null,
                fecha_inicio: el.querySelector("#cr-ini").value || null,
                fecha_fin: el.querySelector("#cr-fin").value || null,
                notas: el.querySelector("#cr-notas").value.trim() || null,
                progreso: 0,
                estado: "pendiente",
              });
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
    };

    const exportarPDF = () => {
      if (!window.jspdf?.jsPDF) {
        return mostrarAviso("Librería PDF no disponible en esta página", "error");
      }
      if (!tareas.length) {
        return mostrarAviso("No hay actividades para exportar", "info");
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

      const filas = tareas.map((t, idx) => [
        String(idx + 1),
        FASES[t.fase]?.label || t.fase,
        t.titulo,
        t.responsable || "—",
        formatoFecha(t.fecha_inicio),
        formatoFecha(t.fecha_fin),
        `${PCT.num(t.progreso)}%`,
        ESTADOS_TAREA[t.estado]?.label || t.estado,
      ]);

      doc.autoTable({
        startY: 26,
        head: [["#", "Fase", "Actividad", "Responsable", "Inicio", "Fin", "Avance", "Estado"]],
        body: filas,
        styles: { fontSize: 8, cellPadding: 2.5 },
        headStyles: { fillColor: [19, 91, 236] },
      });

      const nombreArchivo = `Cronograma_${(p.nombre || "Proyecto").replace(/[^\w\-]+/g, "_")}.pdf`;
      doc.save(nombreArchivo);
      mostrarAviso("Cronograma PDF exportado.", "exito");
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
    root.querySelector("#crono-btn-pdf").addEventListener("click", exportarPDF);

    // Inline editing & delete in Lista view
    root.querySelector("#crono-contenido").addEventListener("change", async (e) => {
      const input = e.target.closest("[data-campo]");
      if (!input) return;
      const tr = input.closest("tr[data-tarea-id]");
      if (!tr) return;
      const id = tr.dataset.tareaId;
      const campo = input.dataset.campo;
      let valor = input.value;
      if (campo === "progreso") {
        valor = Math.max(0, Math.min(100, PCT.num(valor)));
        input.value = valor;
      } else if (valor === "") {
        valor = null;
      }

      const patch = { [campo]: valor };
      if (campo === "estado" && valor === "completada") {
        patch.progreso = 100;
      } else if (campo === "progreso" && valor === 100) {
        patch.estado = "completada";
      }

      const { error } = await window.sb.from("proyecto_cronograma").update(patch).eq("id", id);
      if (error) return manejarError(error, "No se pudo actualizar la actividad");

      const t = tareas.find((x) => x.id === id);
      if (t) Object.assign(t, patch);
      pintarResumen();
      if (patch.progreso !== undefined || patch.estado !== undefined) {
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
