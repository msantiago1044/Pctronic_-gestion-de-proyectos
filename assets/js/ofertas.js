// ============================================================================
// OFERTAS PRE-VENTA · Tablero Kanban + Lista + Relevos de Responsable
// Tabla: public.crm_ofertas_preventa
// ============================================================================
(async () => {
  const { session, profile } = await window.pctronicReady;
  if (!session) return;
  const usuarioActualId = session?.user?.id;
  const rolNorm = typeof normalizarRol === "function" ? normalizarRol(profile?.rol) : (profile?.rol || "proyectos");
  const esComercialSolo = rolNorm === "comercial";

  const ESTADOS = {
    levantamiento: { label: "Visita / Levantamiento", color: "bg-slate-500", badge: "bg-slate-100 text-slate-800", comercial: true },
    en_proceso: { label: "En proceso", color: "bg-primary", badge: "bg-blue-100 text-blue-800", comercial: false },
    finalizado: { label: "Finalizado", color: "bg-amber-500", badge: "bg-amber-100 text-amber-800", comercial: false },
    enviado_comercial: { label: "Enviado al Comercial", color: "bg-emerald-500", badge: "bg-emerald-100 text-emerald-800", comercial: true },
  };

  function normalizarEstadoOferta(estado) {
    if (estado === "enviado_cliente") return "enviado_comercial";
    return ESTADOS[estado] ? estado : "levantamiento";
  }

  const PRIORIDADES = {
    urgente: { label: "Urgente", badge: "bg-rose-100 text-rose-800 border-rose-200" },
    alta: { label: "Alta", badge: "bg-amber-100 text-amber-800 border-amber-200" },
    media: { label: "Media", badge: "bg-blue-50 text-blue-700 border-blue-200" },
    baja: { label: "Baja", badge: "bg-gray-100 text-gray-600 border-gray-200" },
  };

  let ofertas = [];
  let clientes = [];
  let empresas = [];
  let perfiles = [];
  let ofertaActual = null;
  let proyectosPorOportunidad = new Map();
  let oportunidadesPorId = new Map();
  let oportunidadesPorOfertaId = new Map();
  let vistaActual = localStorage.getItem("pctronic_ofertas_vista") || "tablero";
  let relevoPendiente = null; // { id, nuevoEstado, origen }
  let envioComercialPendiente = null; // { id, origen }
  let arrastrandoId = null;
  let puenteExcelData = null; // { items, trm_cotizacion, inicio, archivoNombre }
  let puenteArchivoFile = null;

  const nombrePerfil = (id) => perfiles.find((p) => p.id === id)?.nombre_completo || "Sin asignar";

  function obtenerOportunidadDeOferta(o) {
    if (!o) return null;
    return (o.oportunidad_id && oportunidadesPorId.get(o.oportunidad_id)) || oportunidadesPorOfertaId.get(o.id) || null;
  }

  function obtenerComercialSugerido(o) {
    if (!o) return "";
    const linkedOp = obtenerOportunidadDeOferta(o);
    return o.comercial_destino_id || linkedOp?.responsable_id || linkedOp?.creado_por || o.creado_por || "";
  }

  // Resaltar columnas comerciales si el rol es comercial
  if (esComercialSolo) {
    document.querySelectorAll(".kanban-col").forEach((col) => {
      const est = col.dataset.estado;
      if (ESTADOS[est]?.comercial) {
        col.classList.add("ring-1", "ring-primary/30");
      }
    });
  }

  async function cargarOportunidadesVinculadasSeguras() {
    const resExt = await window.sb
      .from("crm_oportunidades")
      .select("id, proyecto_id, oferta_preventa_id, responsable_id, creado_por, etapa, probabilidad, titulo");
    if (!resExt.error) return resExt;
    return window.sb.from("crm_oportunidades").select("id, proyecto_id, oferta_preventa_id, responsable_id, etapa, titulo");
  }

  async function cargarDatos() {
    try {
      const [resOf, resCli, resEmp, resProf, resOps] = await Promise.all([
        window.sb
          .from("crm_ofertas_preventa")
          .select("*, clientes(id, nombre), empresas(id, nombre), profiles:responsable_id(id, nombre_completo)")
          .order("created_at", { ascending: false }),
        window.sb.from("clientes").select("id, nombre").order("nombre"),
        window.sb.from("empresas").select("id, nombre").order("nombre"),
        window.sb.from("profiles").select("id, nombre_completo").order("nombre_completo"),
        cargarOportunidadesVinculadasSeguras(),
      ]);

      if (resOf.error) throw resOf.error;
      if (resCli.error) throw resCli.error;
      if (resEmp.error) throw resEmp.error;
      if (resProf.error) throw resProf.error;
      ofertas = resOf.data || [];
      clientes = resCli.data || [];
      empresas = resEmp.data || [];
      perfiles = resProf.data || [];
      proyectosPorOportunidad = new Map();
      oportunidadesPorId = new Map();
      oportunidadesPorOfertaId = new Map();
      if (!resOps.error && Array.isArray(resOps.data)) {
        resOps.data.forEach((op) => {
          oportunidadesPorId.set(op.id, op);
          if (op.oferta_preventa_id) oportunidadesPorOfertaId.set(op.oferta_preventa_id, op);
          if (op.proyecto_id) {
            proyectosPorOportunidad.set(op.id, op.proyecto_id);
            if (op.oferta_preventa_id) proyectosPorOportunidad.set(`of:${op.oferta_preventa_id}`, op.proyecto_id);
          }
        });
      }

      poblarSelects();
      actualizarKPIs();
      render();
    } catch (err) {
      manejarError(err, "No se pudieron cargar las ofertas de pre-venta");
    }
  }

  function poblarSelects() {
    const optsCli = clientes.map((c) => `<option value="${c.id}">${escapeHtml(c.nombre)}</option>`).join("");
    const optsEmp = empresas.map((e) => `<option value="${e.id}">${escapeHtml(e.nombre)}</option>`).join("");
    const optsProf = perfiles.map((p) => `<option value="${p.id}">${escapeHtml(p.nombre_completo || "Usuario")}</option>`).join("");

    ["drawer-cliente", "nuevo-cliente", "puente-cliente"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = `<option value="">Sin cliente</option>${optsCli}`;
    });
    ["drawer-empresa", "nuevo-empresa", "puente-empresa"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = `<option value="">Sin empresa</option>${optsEmp}`;
    });
    ["drawer-responsable", "nuevo-responsable", "relevo-responsable"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = `<option value="">Sin asignar</option>${optsProf}`;
    });
    ["drawer-comercial-destino", "envio-comercial-destino"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = `<option value="">Selecciona comercial...</option>${optsProf}`;
    });
    const selFiltroResp = document.getElementById("filtro-responsable");
    if (selFiltroResp) selFiltroResp.innerHTML = `<option value="">Responsable: Todos</option>${optsProf}`;
  }

  function actualizarKPIs() {
    const activas = ofertas.filter((o) => ["levantamiento", "en_proceso"].includes(normalizarEstadoOferta(o.estado)));
    const finalizadas = ofertas.filter((o) => normalizarEstadoOferta(o.estado) === "finalizado");
    const enviadas = ofertas.filter((o) => normalizarEstadoOferta(o.estado) === "enviado_comercial");
    const montoEnviadas = enviadas.reduce((s, o) => s + Number(o.valor_estimado || 0), 0);

    document.getElementById("kpi-total").textContent = ofertas.length;
    document.getElementById("kpi-activas").textContent = activas.length;
    document.getElementById("kpi-finalizadas").textContent = finalizadas.length;
    document.getElementById("kpi-enviadas").textContent = enviadas.length;
    document.getElementById("kpi-enviadas-monto").textContent = formatoMoneda(montoEnviadas);
  }

  function getFiltradas() {
    const q = (document.getElementById("filtro-busqueda")?.value || "").trim().toLowerCase();
    const prio = document.getElementById("filtro-prioridad")?.value || "";
    const resp = document.getElementById("filtro-responsable")?.value || "";

    return ofertas.filter((o) => {
      const matchQ =
        !q ||
        (o.titulo || "").toLowerCase().includes(q) ||
        (o.clientes?.nombre || "").toLowerCase().includes(q) ||
        (o.empresas?.nombre || "").toLowerCase().includes(q);
      const matchP = !prio || o.prioridad === prio;
      const matchR = !resp || o.responsable_id === resp;
      return matchQ && matchP && matchR;
    });
  }

  function render() {
    const filtradas = getFiltradas();
    document.getElementById("contador-resultados").textContent = `${filtradas.length} oferta${filtradas.length === 1 ? "" : "s"}`;

    if (vistaActual === "tablero") {
      document.getElementById("vista-tablero").classList.remove("hidden");
      document.getElementById("vista-lista").classList.add("hidden");
      renderTablero(filtradas);
    } else {
      document.getElementById("vista-tablero").classList.add("hidden");
      document.getElementById("vista-lista").classList.remove("hidden");
      renderLista(filtradas);
    }
  }

  function renderTablero(filtradas) {
    Object.keys(ESTADOS).forEach((estado) => {
      const cont = document.getElementById(`cards-${estado}`);
      if (!cont) return;
      const lista = filtradas.filter((o) => normalizarEstadoOferta(o.estado) === estado);
      const subtotal = lista.reduce((s, o) => s + Number(o.valor_estimado || 0), 0);

      const colEl = document.querySelector(`.kanban-col[data-estado="${estado}"]`);
      if (colEl) {
        colEl.querySelector(".col-count").textContent = lista.length;
        colEl.querySelector(".col-subtotal").textContent = formatoMoneda(subtotal);
      }

      if (!lista.length) {
        cont.innerHTML = `<div class="rounded-lg border border-dashed border-gray-200 p-4 text-center text-xs text-gray-400">Sin ofertas</div>`;
        return;
      }

      cont.innerHTML = lista
        .map((o) => {
          const estadoNorm = normalizarEstadoOferta(o.estado);
          const pr = PRIORIDADES[o.prioridad] || PRIORIDADES.media;
          const resp = o.profiles?.nombre_completo || "Sin asignar";
          const inicial = resp.trim().charAt(0).toUpperCase();
          const subs = Array.isArray(o.subtareas) ? o.subtareas : [];
          const hechas = subs.filter((s) => s.hecha).length;
          const excelInfo = obtenerExcelDeOferta(o);
          const proyId = obtenerProyectoIdDeOferta(o);
          const mostrarEnviarComercial = estadoNorm === "en_proceso" || estadoNorm === "finalizado";

          return `
            <div draggable="true" class="card-oferta group rounded-xl border border-gray-200 bg-white p-3.5 shadow-sm hover:shadow-md hover:border-primary/40 transition-all cursor-grab active:cursor-grabbing" data-id="${o.id}">
              <div class="flex items-center justify-between gap-1 mb-2">
                <span class="inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold ${pr.badge}">${pr.label}</span>
                <div class="flex items-center gap-1 flex-wrap justify-end">
                  ${o.plazo_ejecucion ? `<span class="inline-flex items-center gap-0.5 rounded-md bg-sky-50 border border-sky-200 px-1.5 py-0.5 text-[10px] font-medium text-sky-700" title="Plazo de ejecución"><span class="material-symbols-outlined text-[12px]">schedule</span>${escapeHtml(o.plazo_ejecucion)}</span>` : ""}
                  ${excelInfo.path ? `<button type="button" data-action="descargar-excel" data-oferta-id="${o.id}" class="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 hover:bg-emerald-100" title="Descargar ${escapeHtml(excelInfo.nombre || "Cotizacion.xlsx")}"><span class="material-symbols-outlined text-[12px]">download</span> Excel</button>` : ""}
                  ${o.oportunidad_id ? `<span class="inline-flex items-center gap-0.5 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700" title="Vinculada al CRM"><span class="material-symbols-outlined text-[12px]">handshake</span> CRM</span>` : ""}
                  ${proyId ? `<a href="proyecto-detalle.html?id=${encodeURIComponent(proyId)}" class="inline-flex items-center gap-0.5 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white hover:bg-emerald-700" title="Abrir proyecto operativo"><span class="material-symbols-outlined text-[12px]">rocket_launch</span> Ver Proyecto</a>` : ""}
                </div>
              </div>
              <h3 class="text-xs font-bold text-gray-900 group-hover:text-primary line-clamp-2">${escapeHtml(o.titulo)}</h3>
              <p class="mt-1 text-[11px] text-gray-500 truncate">${escapeHtml(o.clientes?.nombre || "Sin cliente")}${o.empresas?.nombre ? " · " + escapeHtml(o.empresas.nombre) : ""}</p>
              ${excelInfo.nombre ? `<p class="mt-1 text-[10px] text-emerald-700 truncate flex items-center gap-1"><span class="material-symbols-outlined text-[12px]">table_view</span>${escapeHtml(excelInfo.nombre)}</p>` : ""}
              <div class="mt-3 flex items-center justify-between border-t border-gray-100 pt-2 text-xs">
                <span class="font-bold text-gray-900">${formatoMoneda(o.valor_estimado)}</span>
                ${subs.length ? `<span class="text-[10px] text-gray-500 flex items-center gap-0.5"><span class="material-symbols-outlined text-[13px]">checklist</span>${hechas}/${subs.length}</span>` : ""}
              </div>
              <div class="mt-2 flex items-center justify-between text-[10px] text-gray-400">
                <span class="flex items-center gap-1"><span class="material-symbols-outlined text-[13px]">event</span>${o.fecha_limite ? formatoFecha(o.fecha_limite) : "Sin fecha"}</span>
                <div class="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-primary font-bold" title="${escapeHtml(resp)}">${inicial}</div>
              </div>
              ${mostrarEnviarComercial ? `
              <div class="mt-2.5 pt-2 border-t border-gray-100">
                <button type="button" data-action="enviar-comercial" data-oferta-id="${o.id}"
                  class="flex w-full items-center justify-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-indigo-700 shadow-sm transition-colors">
                  <span class="material-symbols-outlined text-[14px]">send</span> Enviar al Comercial
                </button>
              </div>` : ""}
              <div class="mt-2 flex items-center justify-between gap-1 border-t border-gray-100 pt-2">
                <button type="button" data-action="duplicar" data-oferta-id="${o.id}"
                  class="inline-flex items-center gap-0.5 rounded-md px-1.5 py-1 text-[10px] font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors" title="Duplicar oferta en Levantamiento">
                  <span class="material-symbols-outlined text-[13px]">content_copy</span> Duplicar
                </button>
                <button type="button" data-action="seguimiento" data-oferta-id="${o.id}"
                  class="inline-flex items-center gap-0.5 rounded-md px-1.5 py-1 text-[10px] font-medium text-blue-600 hover:bg-blue-50 hover:text-blue-800 transition-colors" title="Registrar nota de seguimiento">
                  <span class="material-symbols-outlined text-[13px]">rate_review</span> Seguimiento
                </button>
                ${estadoNorm === "enviado_comercial" ? `
                <button type="button" data-action="enviar-comercial" data-oferta-id="${o.id}"
                  class="inline-flex items-center gap-0.5 rounded-md px-1.5 py-1 text-[10px] font-medium text-emerald-700 hover:bg-emerald-50 transition-colors" title="Notificar o reenviar al comercial">
                  <span class="material-symbols-outlined text-[13px]">send</span> Reenviar
                </button>` : `
                <button type="button" data-action="finalizar" data-oferta-id="${o.id}" ${estadoNorm === "finalizado" ? "disabled" : ""}
                  class="inline-flex items-center gap-0.5 rounded-md px-1.5 py-1 text-[10px] font-medium ${estadoNorm === "finalizado" ? "text-gray-300 cursor-not-allowed" : "text-amber-700 hover:bg-amber-50 hover:text-amber-900"} transition-colors" title="Mover a Finalizado">
                  <span class="material-symbols-outlined text-[13px]">task_alt</span> Finalizar
                </button>`}
              </div>
            </div>`;
        })
        .join("");
    });
  }

  function renderLista(filtradas) {
    const tbody = document.getElementById("lista-tbody");
    if (!tbody) return;
    tbody.innerHTML = filtradas.length
      ? filtradas
          .map((o) => {
            const est = ESTADOS[normalizarEstadoOferta(o.estado)] || ESTADOS.levantamiento;
            const pr = PRIORIDADES[o.prioridad] || PRIORIDADES.media;
            const subs = Array.isArray(o.subtareas) ? o.subtareas : [];
            const hechas = subs.filter((s) => s.hecha).length;
            return `
              <tr class="hover:bg-gray-50 cursor-pointer" data-id="${o.id}">
                <td class="px-4 py-3 font-bold text-gray-900">${escapeHtml(o.titulo)}</td>
                <td class="px-4 py-3 text-gray-600">${escapeHtml(o.clientes?.nombre || "—")}</td>
                <td class="px-4 py-3"><span class="rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${est.badge}">${est.label}</span></td>
                <td class="px-4 py-3"><span class="rounded-md border px-2 py-0.5 text-[10px] font-semibold ${pr.badge}">${pr.label}</span></td>
                <td class="px-4 py-3 text-gray-600">${escapeHtml(o.profiles?.nombre_completo || "Sin asignar")}</td>
                <td class="px-4 py-3 font-semibold text-gray-900">${formatoMoneda(o.valor_estimado)}</td>
                <td class="px-4 py-3 text-gray-500">${o.fecha_limite ? formatoFecha(o.fecha_limite) : "—"}</td>
                <td class="px-4 py-3 text-right text-gray-500">${subs.length ? `${hechas}/${subs.length}` : "—"}</td>
              </tr>`;
          })
          .join("")
      : `<tr><td colspan="8" class="px-4 py-8 text-center text-gray-400">No hay ofertas con los filtros actuales.</td></tr>`;
  }

  // Subtareas, Adjuntos y Relevos en el Drawer
  function renderSubtareas() {
    const lista = Array.isArray(ofertaActual?.subtareas) ? ofertaActual.subtareas : [];
    const hechas = lista.filter((s) => s.hecha).length;
    document.getElementById("drawer-subtareas-count").textContent = `${hechas}/${lista.length}`;
    const cont = document.getElementById("drawer-subtareas-lista");
    cont.innerHTML = lista.length
      ? lista
          .map(
            (s, i) => `
          <div class="flex items-center justify-between gap-2 rounded-lg border border-gray-100 bg-gray-50/70 px-3 py-1.5 text-xs">
            <label class="flex items-center gap-2 flex-1 cursor-pointer">
              <input type="checkbox" data-sub-toggle="${i}" ${s.hecha ? "checked" : ""} class="rounded border-gray-300 text-primary focus:ring-primary" />
              <span class="${s.hecha ? "line-through text-gray-400" : "text-gray-800"}">${escapeHtml(s.texto)}</span>
            </label>
            <button type="button" data-sub-del="${i}" class="text-gray-400 hover:text-red-600"><span class="material-symbols-outlined text-[16px]">delete</span></button>
          </div>`
          )
          .join("")
      : `<p class="text-[11px] text-gray-400">Sin subtareas registradas.</p>`;
  }

  function renderAdjuntos() {
    const lista = Array.isArray(ofertaActual?.adjuntos) ? ofertaActual.adjuntos : [];
    const cont = document.getElementById("drawer-adjuntos-lista");
    cont.innerHTML = lista.length
      ? lista
          .map((a, i) => {
            const href = (typeof urlSegura === "function" ? urlSegura(a.url) : "") || "#";
            return `
          <div class="flex items-center justify-between gap-2 rounded-lg border border-gray-100 bg-gray-50/70 px-3 py-1.5 text-xs">
            <a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" class="flex items-center gap-1.5 font-medium text-primary hover:underline truncate">
              <span class="material-symbols-outlined text-[15px]">link</span> ${escapeHtml(a.nombre)}
            </a>
            <button type="button" data-adj-del="${i}" class="text-gray-400 hover:text-red-600"><span class="material-symbols-outlined text-[16px]">delete</span></button>
          </div>`;
          })
          .join("")
      : `<p class="text-[11px] text-gray-400">Sin enlaces adjuntos.</p>`;
  }

  function renderRelevos() {
    const lista = Array.isArray(ofertaActual?.historial_relevos) ? ofertaActual.historial_relevos : [];
    const cont = document.getElementById("drawer-relevos-lista");
    cont.innerHTML = lista.length
      ? [...lista]
          .reverse()
          .map((r) => {
            const deEst = r.de_estado ? (ESTADOS[normalizarEstadoOferta(r.de_estado)]?.label || r.de_estado) : "Inicio";
            const aEst = ESTADOS[normalizarEstadoOferta(r.a_estado)]?.label || r.a_estado;
            const tituloRelevo = r.de_estado && r.de_estado === r.a_estado ? `Seguimiento · ${aEst}` : `${deEst} → ${aEst}`;
            return `
            <div class="rounded-lg border border-gray-100 bg-gray-50 p-2.5 text-xs">
              <div class="flex items-center justify-between">
                <span class="font-semibold text-gray-800">${escapeHtml(tituloRelevo)}</span>
                <span class="text-[10px] text-gray-400">${formatoFecha(r.fecha)}</span>
              </div>
              <p class="mt-0.5 text-[11px] text-gray-600">Responsable: <b>${escapeHtml(nombrePerfil(r.a_responsable_id))}</b></p>
              ${r.nota ? `<p class="mt-0.5 text-[11px] text-gray-500 italic">"${escapeHtml(r.nota)}"</p>` : ""}
            </div>`;
          })
          .join("")
      : `<p class="text-[11px] text-gray-400">Sin relevos registrados.</p>`;
  }

  function obtenerProyectoIdDeOferta(o) {
    if (!o) return null;
    const linkedOp = obtenerOportunidadDeOferta(o);
    return (
      o.proyecto_id ||
      linkedOp?.proyecto_id ||
      (o.oportunidad_id && proyectosPorOportunidad.get(o.oportunidad_id)) ||
      proyectosPorOportunidad.get(`of:${o.id}`) ||
      null
    );
  }

  function obtenerExcelDeOferta(o) {
    if (!o) return { path: null, nombre: null };
    if (o.archivo_cotizacion_path) {
      return { path: o.archivo_cotizacion_path, nombre: o.archivo_cotizacion_nombre || "Cotizacion.xlsx" };
    }
    const adj = Array.isArray(o.adjuntos) ? o.adjuntos.find((a) => a && a.storage_path) : null;
    if (adj) return { path: adj.storage_path, nombre: adj.nombre || "Cotizacion.xlsx" };
    return { path: null, nombre: null };
  }

  function pintarBloqueExcelOferta(o) {
    const estadoEl = document.getElementById("oferta-excel-estado");
    const btnDesc = document.getElementById("btn-oferta-excel-descargar");
    const btnLbl = document.getElementById("oferta-excel-btn-lbl");
    const trmEl = document.getElementById("oferta-trm");
    const prevEl = document.getElementById("oferta-excel-preview");
    const { path, nombre } = obtenerExcelDeOferta(o);
    if (trmEl) trmEl.value = o?.trm_oferta ?? "";
    if (prevEl) prevEl.textContent = "";
    if (path) {
      if (estadoEl) estadoEl.textContent = `Archivo adjunto: ${nombre}`;
      if (btnDesc) {
        btnDesc.classList.remove("hidden");
        btnDesc.classList.add("inline-flex");
      }
      if (btnLbl) btnLbl.textContent = "Reemplazar Excel";
    } else {
      if (estadoEl) estadoEl.textContent = "Sin archivo Excel adjunto todavía.";
      if (btnDesc) {
        btnDesc.classList.add("hidden");
        btnDesc.classList.remove("inline-flex");
      }
      if (btnLbl) btnLbl.textContent = "Subir Excel";
    }
  }

  function pintarBannerProyectoOferta(o) {
    const infoEl = document.getElementById("drawer-oferta-proy-info");
    const btnEnviar = document.getElementById("btn-oferta-enviar-proyecto");
    const linkProy = document.getElementById("link-oferta-proyecto");
    const proyId = obtenerProyectoIdDeOferta(o);
    if (!infoEl || !btnEnviar || !linkProy) return;
    if (proyId) {
      infoEl.textContent = "Esta oferta ya fue convertida en un proyecto operativo.";
      btnEnviar.classList.add("hidden");
      linkProy.href = `proyecto-detalle.html?id=${proyId}`;
      linkProy.classList.remove("hidden");
      linkProy.classList.add("inline-flex");
    } else {
      infoEl.textContent = "Crea el proyecto operativo en 1 paso importando el Excel de cotización y documentos de cierre.";
      btnEnviar.classList.remove("hidden");
      linkProy.classList.add("hidden");
      linkProy.classList.remove("inline-flex");
    }
  }

  function pintarBannerEnvioComercial(o) {
    const badgeEl = document.getElementById("drawer-envio-comercial-badge");
    const infoEl = document.getElementById("drawer-envio-comercial-info");
    const selComercial = document.getElementById("drawer-comercial-destino");
    const btnEnviar = document.getElementById("btn-enviar-comercial");
    if (!selComercial || !btnEnviar) return;

    const comercialId = obtenerComercialSugerido(o);
    selComercial.value = comercialId || "";

    const estadoNorm = normalizarEstadoOferta(o?.estado);
    const yaEnviada = estadoNorm === "enviado_comercial" || Boolean(o?.enviado_comercial_at);
    if (yaEnviada) {
      if (badgeEl) badgeEl.classList.remove("hidden");
      const destNombre = comercialId ? nombrePerfil(comercialId) : "Comercial";
      const fechaTxt = o?.enviado_comercial_at ? ` el ${formatoFecha(o.enviado_comercial_at)}` : "";
      if (infoEl) {
        infoEl.textContent = `Enviada a ${destNombre}${fechaTxt}. Puedes notificar nuevamente o cambiar el comercial destino si es necesario.`;
      }
      btnEnviar.innerHTML = `<span class="material-symbols-outlined text-[15px]" aria-hidden="true">send</span> Reenviar al Comercial`;
    } else {
      if (badgeEl) badgeEl.classList.add("hidden");
      if (infoEl) {
        infoEl.textContent =
          "Cuando la cotización esté lista, envíala al comercial responsable para que la presente al cliente desde el CRM.";
      }
      btnEnviar.innerHTML = `<span class="material-symbols-outlined text-[15px]" aria-hidden="true">send</span> Enviar al Comercial`;
    }
  }

  function abrirDrawer(id) {
    const o = ofertas.find((x) => x.id === id);
    if (!o) return;
    ofertaActual = JSON.parse(JSON.stringify(o));

    document.getElementById("drawer-titulo").value = o.titulo || "";
    document.getElementById("drawer-estado").value = normalizarEstadoOferta(o.estado);
    document.getElementById("drawer-responsable").value = o.responsable_id || "";
    document.getElementById("drawer-cliente").value = o.cliente_id || "";
    document.getElementById("drawer-empresa").value = o.empresa_id || "";
    document.getElementById("drawer-prioridad").value = o.prioridad || "media";
    document.getElementById("drawer-fecha").value = o.fecha_limite || "";
    document.getElementById("of-plazo").value = o.plazo_ejecucion || "";
    document.getElementById("drawer-descripcion").value = o.descripcion || "";
    document.getElementById("drawer-informe").value = o.informe_levantamiento || "";
    establecerValorMoneda(document.getElementById("drawer-valor"), o.valor_estimado || 0);

    const linkCrm = document.getElementById("drawer-link-crm");
    if (o.oportunidad_id) {
      linkCrm.href = `crm.html?id=${encodeURIComponent(o.oportunidad_id)}`;
      linkCrm.classList.remove("hidden");
      linkCrm.classList.add("inline-flex");
    } else {
      linkCrm.href = "crm.html";
      linkCrm.classList.add("hidden");
      linkCrm.classList.remove("inline-flex");
    }

    pintarBannerEnvioComercial(ofertaActual);
    pintarBannerProyectoOferta(ofertaActual);
    pintarBloqueExcelOferta(ofertaActual);
    renderSubtareas();
    renderAdjuntos();
    renderRelevos();

    document.getElementById("drawer-backdrop").classList.remove("hidden");
    setTimeout(() => document.getElementById("drawer-panel").classList.remove("translate-x-full"), 10);
  }

  function cerrarDrawer() {
    document.getElementById("drawer-panel").classList.add("translate-x-full");
    setTimeout(() => {
      document.getElementById("drawer-backdrop").classList.add("hidden");
      ofertaActual = null;
    }, 200);
  }

  // Envío directo al Comercial (sin bloqueadores artificiales y con fallback seguro si la migración SQL no ha corrido)
  function abrirModalEnviarComercial(id, origen = "kanban") {
    const o = ofertas.find((x) => x.id === id);
    if (!o) return;
    envioComercialPendiente = { id, origen };
    const comercialSugerido = obtenerComercialSugerido(o);
    const resumenEl = document.getElementById("envio-comercial-resumen");
    if (resumenEl) {
      resumenEl.innerHTML = `Vas a enviar la oferta <b>${escapeHtml(o.titulo)}</b> al comercial para que la presente al cliente desde el CRM. Confirma el comercial destinatario:`;
    }
    const selDest = document.getElementById("envio-comercial-destino");
    if (selDest) selDest.value = comercialSugerido || "";
    const notaEl = document.getElementById("envio-comercial-nota");
    if (notaEl) notaEl.value = "";
    document.getElementById("modal-enviar-comercial")?.classList.remove("hidden");
  }

  function cerrarModalEnviarComercial(revertirSelect = true) {
    document.getElementById("modal-enviar-comercial")?.classList.add("hidden");
    if (revertirSelect && envioComercialPendiente?.origen === "drawer" && ofertaActual) {
      document.getElementById("drawer-estado").value = normalizarEstadoOferta(ofertaActual.estado);
    }
    envioComercialPendiente = null;
  }

  async function actualizarEstadoOfertaConFallback(id, { estado, comercialDestinoId, enviadoComercialAt, responsableId, historial, ahoraIso }) {
    const payloadBase = {
      estado,
      responsable_id: responsableId,
      historial_relevos: historial,
      updated_at: ahoraIso,
    };
    const payloadCompleto = {
      ...payloadBase,
      ...(comercialDestinoId !== undefined ? { comercial_destino_id: comercialDestinoId } : {}),
      ...(enviadoComercialAt !== undefined ? { enviado_comercial_at: enviadoComercialAt } : {}),
    };

    const intentar = async (patch) => window.sb.from("crm_ofertas_preventa").update(patch).eq("id", id);

    let res = await intentar(payloadCompleto);
    if (!res.error) return { estadoGuardado: estado };

    const esFaltaColumna = (err) =>
      err && (err.code === "42703" || err.code === "PGRST204" || /comercial_destino_id|enviado_comercial_at|column|schema cache/i.test(String(err.message || "")));
    const esCheckEstado = (err) =>
      err && (err.code === "23514" || /check|constraint|estado/i.test(String(err.message || "")));

    if (esFaltaColumna(res.error)) {
      res = await intentar(payloadBase);
      if (!res.error) return { estadoGuardado: estado };
    }

    if (estado === "enviado_comercial" && esCheckEstado(res.error)) {
      const patchFallback = { ...payloadCompleto, estado: "enviado_cliente" };
      res = await intentar(patchFallback);
      if (!res.error) return { estadoGuardado: "enviado_cliente" };
      if (esFaltaColumna(res.error)) {
        res = await intentar({ ...payloadBase, estado: "enviado_cliente" });
        if (!res.error) return { estadoGuardado: "enviado_cliente" };
      }
    }

    throw res.error;
  }

  async function enviarOfertaAlComercial(id, comercialId, nota = "", { desdeDrawer = false } = {}) {
    const o = ofertas.find((x) => x.id === id);
    if (!o) return;
    const destinoId = comercialId || obtenerComercialSugerido(o) || null;
    const ahoraIso = new Date().toISOString();
    const historial = Array.isArray(o.historial_relevos) ? [...o.historial_relevos] : [];
    historial.push({
      fecha: ahoraIso,
      de_estado: normalizarEstadoOferta(o.estado),
      a_estado: "enviado_comercial",
      de_responsable_id: o.responsable_id || null,
      a_responsable_id: destinoId || o.responsable_id || null,
      nota: nota || "Oferta enviada al Comercial",
      usuario_id: usuarioActualId || null,
    });

    try {
      await actualizarEstadoOfertaConFallback(id, {
        estado: "enviado_comercial",
        comercialDestinoId: destinoId,
        enviadoComercialAt: ahoraIso,
        responsableId: destinoId || o.responsable_id || null,
        historial,
        ahoraIso,
      });

      // Mantener sincronizada la oportunidad CRM en etapa 'cotizacion' (lista para que el comercial la envíe al cliente)
      const linkedOp = obtenerOportunidadDeOferta(o);
      const opId = o.oportunidad_id || linkedOp?.id || null;
      if (opId) {
        const etapasAnteriores = ["por_revisar", "prospecto", "visita", "cotizacion"];
        if (!linkedOp?.etapa || etapasAnteriores.includes(linkedOp.etapa)) {
          try {
            await window.sb
              .from("crm_oportunidades")
              .update({
                etapa: "cotizacion",
                probabilidad: Math.max(Number(linkedOp?.probabilidad || 0), 50),
                updated_at: ahoraIso,
              })
              .eq("id", opId);
          } catch (errCrm) {
            console.warn("No se pudo actualizar etapa CRM al enviar oferta:", errCrm);
          }
        }
        try {
          await window.sb.from("crm_actividades").insert({
            oportunidad_id: opId,
            tipo: "tarea",
            titulo: "Oferta lista enviada por Pre-venta",
            descripcion: nota || `Pre-venta marcó la oferta "${o.titulo}" como Enviada al Comercial.`,
            creado_por: usuarioActualId || null,
          });
        } catch (errAct) {
          /* no bloqueante */
        }
      }

      // Notificación dirigida al comercial responsable
      if (typeof window.PCT_NOTIFICAR === "function") {
        const excelInfo = obtenerExcelDeOferta(o);
        await window.PCT_NOTIFICAR({
          tipo: "oferta_lista",
          titulo: `Oferta lista para cliente: ${o.titulo}`,
          mensaje: `${profile?.nombre_completo || "Pre-venta"} envió la oferta${excelInfo.nombre ? ` (${excelInfo.nombre})` : ""}${nota ? ` · ${nota}` : ""}. Envíala al cliente desde el CRM.`,
          url: opId ? `crm.html?id=${opId}` : `ofertas.html?id=${o.id}`,
          usuario_destino: destinoId || null,
          rol_destino: destinoId ? [] : ["comercial", "jefe_comercial", "super_usuario"],
        });
      }

      cerrarModalEnviarComercial(false);
      mostrarAviso(
        destinoId
          ? `Oferta enviada a ${nombrePerfil(destinoId)} y notificada.`
          : "Oferta marcada como Enviada al Comercial.",
        "exito"
      );
      await cargarDatos();
      if (desdeDrawer && ofertaActual?.id === id) {
        abrirDrawer(id);
      }
    } catch (err) {
      manejarError(err, "No se pudo enviar la oferta al comercial");
    }
  }

  // Relevo al cambiar etapa
  function abrirModalRelevo(id, nuevoEstado, origen = "kanban") {
    const o = ofertas.find((x) => x.id === id);
    if (!o) return;
    const estadoActualNorm = normalizarEstadoOferta(o.estado);
    const nuevoNorm = normalizarEstadoOferta(nuevoEstado);
    if (estadoActualNorm === nuevoNorm) return;

    if (nuevoNorm === "enviado_comercial") {
      abrirModalEnviarComercial(id, origen);
      return;
    }

    relevoPendiente = { id, nuevoEstado: nuevoNorm, origen };

    const deLabel = ESTADOS[estadoActualNorm]?.label || estadoActualNorm;
    const aLabel = ESTADOS[nuevoNorm]?.label || nuevoNorm;
    document.getElementById("relevo-resumen").innerHTML = `Vas a mover <b>${escapeHtml(o.titulo)}</b> de <b>${escapeHtml(deLabel)}</b> a <b>${escapeHtml(aLabel)}</b>. Confirma o asigna el nuevo responsable para registrar el relevo.`;
    document.getElementById("relevo-responsable").value = o.responsable_id || "";
    document.getElementById("relevo-nota").value = "";
    document.getElementById("modal-relevo").classList.remove("hidden");
  }

  function cerrarModalRelevo(revertirSelect = true) {
    document.getElementById("modal-relevo").classList.add("hidden");
    if (revertirSelect && relevoPendiente?.origen === "drawer" && ofertaActual) {
      document.getElementById("drawer-estado").value = normalizarEstadoOferta(ofertaActual.estado);
    }
    relevoPendiente = null;
  }

  async function confirmarRelevo() {
    if (!relevoPendiente) return;
    const { id, nuevoEstado, origen } = relevoPendiente;
    const o = ofertas.find((x) => x.id === id);
    if (!o) return cerrarModalRelevo(false);

    const nuevoResp = document.getElementById("relevo-responsable").value || null;
    const nota = document.getElementById("relevo-nota").value.trim() || null;

    if (nuevoEstado === "enviado_comercial") {
      cerrarModalRelevo(false);
      await enviarOfertaAlComercial(id, nuevoResp, nota || "", { desdeDrawer: origen === "drawer" });
      return;
    }

    const ahoraIso = new Date().toISOString();
    const historial = Array.isArray(o.historial_relevos) ? [...o.historial_relevos] : [];
    historial.push({
      fecha: ahoraIso,
      de_estado: normalizarEstadoOferta(o.estado),
      a_estado: nuevoEstado,
      de_responsable_id: o.responsable_id || null,
      a_responsable_id: nuevoResp,
      nota,
      usuario_id: usuarioActualId || null,
    });

    try {
      await actualizarEstadoOfertaConFallback(id, {
        estado: nuevoEstado,
        responsableId: nuevoResp,
        historial,
        ahoraIso,
      });

      cerrarModalRelevo(false);
      mostrarAviso(`Oferta movida a ${ESTADOS[nuevoEstado]?.label || nuevoEstado}`, "exito");
      await cargarDatos();
      if (origen === "drawer" && ofertaActual?.id === id) {
        abrirDrawer(id);
      }
    } catch (err) {
      manejarError(err, "No se pudo registrar el relevo");
    }
  }

  async function guardarOferta() {
    if (!ofertaActual) return;
    const titulo = document.getElementById("drawer-titulo").value.trim();
    if (!titulo) return mostrarAviso("El título es obligatorio", "error");

    const trmRaw = document.getElementById("oferta-trm")?.value.trim() || "";
    const trmVal = trmRaw === "" ? null : Number(trmRaw);

    const payloadBase = {
      titulo,
      responsable_id: document.getElementById("drawer-responsable").value || null,
      cliente_id: document.getElementById("drawer-cliente").value || null,
      empresa_id: document.getElementById("drawer-empresa").value || null,
      prioridad: document.getElementById("drawer-prioridad").value,
      fecha_limite: document.getElementById("drawer-fecha").value || null,
      plazo_ejecucion: document.getElementById("of-plazo").value.trim() || null,
      valor_estimado: valorMoneda(document.getElementById("drawer-valor")),
      descripcion: document.getElementById("drawer-descripcion").value.trim() || null,
      informe_levantamiento: document.getElementById("drawer-informe").value.trim() || null,
      subtareas: ofertaActual.subtareas || [],
      adjuntos: ofertaActual.adjuntos || [],
      updated_at: new Date().toISOString(),
    };
    const payloadConTrm = Number.isFinite(trmVal) ? { ...payloadBase, trm_oferta: trmVal } : payloadBase;

    try {
      let { error } = await window.sb.from("crm_ofertas_preventa").update(payloadConTrm).eq("id", ofertaActual.id);
      if (error && (error.code === "42703" || error.code === "PGRST204" || /trm_oferta/i.test(String(error.message || "")))) {
        const retry = await window.sb.from("crm_ofertas_preventa").update(payloadBase).eq("id", ofertaActual.id);
        error = retry.error;
      }
      if (error) throw error;
      mostrarAviso("Oferta actualizada.", "exito");
      cerrarDrawer();
      await cargarDatos();
    } catch (err) {
      manejarError(err, "No se pudo guardar la oferta");
    }
  }

  async function subirExcelOferta(file) {
    if (!ofertaActual || !file) return;
    const estadoEl = document.getElementById("oferta-excel-estado");
    const prevEl = document.getElementById("oferta-excel-preview");
    if (estadoEl) estadoEl.textContent = `Subiendo ${file.name}...`;

    try {
      let trmDetectada = null;
      let itemsCount = 0;
      let ventaTotal = 0;
      if (window.PCT?.leerLibroExcel && window.PCT?.parsearPresupuesto) {
        try {
          const libro = await window.PCT.leerLibroExcel(file);
          const parsed = window.PCT.parsearPresupuesto(libro);
          const soloItems = (parsed.items || []).filter((i) => i.tipo === "item");
          itemsCount = soloItems.length;
          ventaTotal = soloItems.reduce((s, i) => s + Number(i.cantidad || 0) * Number(i.pu_venta || 0), 0);
          trmDetectada = parsed.trm_cotizacion || null;
          if (trmDetectada) {
            const trmEl = document.getElementById("oferta-trm");
            if (trmEl && !trmEl.value) trmEl.value = trmDetectada;
          }
          if (prevEl && itemsCount > 0) {
            prevEl.textContent = `Detectados ${itemsCount} ítem(s) · Venta CD: ${formatoMoneda(ventaTotal)}${trmDetectada ? ` · TRM ${trmDetectada}` : ""}`;
          }
        } catch (errParse) {
          console.warn("No se pudo pre-analizar el Excel:", errParse);
        }
      }

      const nombreLimpio = file.name.replace(/[^\w.\-]+/g, "_");
      const storagePath = `ofertas/${ofertaActual.id}/${Date.now()}_${nombreLimpio}`;
      const { error: errUp } = await window.sb.storage.from("documentos").upload(storagePath, file, { upsert: true });
      if (errUp) throw errUp;

      const patch = {
        archivo_cotizacion_path: storagePath,
        archivo_cotizacion_nombre: file.name,
        updated_at: new Date().toISOString(),
      };
      if (trmDetectada) patch.trm_oferta = trmDetectada;

      const { error: errDb } = await window.sb.from("crm_ofertas_preventa").update(patch).eq("id", ofertaActual.id);
      if (errDb) {
        const msg = String(errDb.message || "");
        if (errDb.code === "42703" || errDb.code === "PGRST204" || /archivo_cotizacion|trm_oferta/i.test(msg)) {
          // Fallback seguro en adjuntos JSONB si la migración SQL aún no se ejecuta
          const adjActuales = Array.isArray(ofertaActual.adjuntos) ? ofertaActual.adjuntos.filter((a) => !a.storage_path) : [];
          const urlPub = window.sb.storage.from("documentos").getPublicUrl(storagePath).data.publicUrl;
          adjActuales.push({ id: Date.now(), nombre: file.name, url: urlPub, storage_path: storagePath });
          const { error: errAdj } = await window.sb
            .from("crm_ofertas_preventa")
            .update({ adjuntos: adjActuales, updated_at: new Date().toISOString() })
            .eq("id", ofertaActual.id);
          if (errAdj) throw errAdj;
          ofertaActual.adjuntos = adjActuales;
          renderAdjuntos();
        } else {
          throw errDb;
        }
      } else {
        ofertaActual.archivo_cotizacion_path = storagePath;
        ofertaActual.archivo_cotizacion_nombre = file.name;
        if (trmDetectada) ofertaActual.trm_oferta = trmDetectada;
      }

      pintarBloqueExcelOferta(ofertaActual);
      if (prevEl && itemsCount > 0) {
        prevEl.textContent = `Detectados ${itemsCount} ítem(s) · Venta CD: ${formatoMoneda(ventaTotal)}${trmDetectada ? ` · TRM ${trmDetectada}` : ""}`;
      }
      mostrarAviso("Archivo Excel adjuntado a la oferta.", "exito");
      await cargarDatos();
    } catch (err) {
      manejarError(err, "No se pudo subir el Excel de cotización");
      pintarBloqueExcelOferta(ofertaActual);
    }
  }

  async function descargarExcelOferta(ofertaObj = ofertaActual) {
    if (!ofertaObj) return;
    const { path, nombre } = obtenerExcelDeOferta(ofertaObj);
    if (!path) return;
    try {
      const { data, error } = await window.sb.storage.from("documentos").createSignedUrl(path, 120);
      if (!error && data?.signedUrl) {
        window.open(data.signedUrl, "_blank", "noopener");
        return;
      }
      const { data: blob, error: errDl } = await window.sb.storage.from("documentos").download(path);
      if (errDl) throw errDl;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = nombre || "Cotizacion.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (err) {
      manejarError(err, "No se pudo descargar el archivo Excel");
    }
  }

  function mostrarPreviewPuente(parsed, archivoNombre) {
    const prevEl = document.getElementById("puente-excel-preview");
    if (!prevEl) return;
    if (!parsed || !Array.isArray(parsed.items)) {
      prevEl.classList.add("hidden");
      prevEl.innerHTML = "";
      return;
    }
    const soloItems = parsed.items.filter((i) => i.tipo === "item");
    const caps = parsed.items.length - soloItems.length;
    const totalVenta = soloItems.reduce((s, i) => s + Number(i.cantidad || 0) * Number(i.pu_venta || 0), 0);
    const totalCosto = soloItems.reduce((s, i) => s + Number(i.cantidad || 0) * Number(i.cu_material || 0), 0);
    const conCosto = soloItems.filter((i) => Number(i.cu_material || 0) > 0).length;
    if (parsed.trm_cotizacion) {
      const trmInp = document.getElementById("puente-trm");
      if (trmInp) trmInp.value = parsed.trm_cotizacion;
    }
    if (totalVenta > 0) {
      establecerValorMoneda(document.getElementById("puente-valor"), totalVenta);
    }
    if (parsed.inicio?.proyecto?.tipo_contrato) {
      const tcSel = document.getElementById("puente-tipo-contrato");
      if (tcSel) tcSel.value = parsed.inicio.proyecto.tipo_contrato;
    }
    prevEl.classList.remove("hidden");
    prevEl.innerHTML = `
      <div class="flex flex-wrap items-center justify-between gap-2">
        <span class="font-bold text-indigo-950">📄 ${escapeHtml(archivoNombre || "Excel cargado")}</span>
        <span class="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">${soloItems.length} ítem(s) · ${caps} cap.</span>
      </div>
      <div class="mt-1.5 grid grid-cols-3 gap-2 text-[11px]">
        <div><span class="text-gray-500">Venta (CD):</span> <strong class="text-gray-900">${formatoMoneda(totalVenta)}</strong></div>
        <div><span class="text-gray-500">Costos (${conCosto}):</span> <strong class="text-gray-900">${formatoMoneda(totalCosto)}</strong></div>
        <div><span class="text-gray-500">TRM:</span> <strong class="text-indigo-700">${parsed.trm_cotizacion ? formatoMoneda(parsed.trm_cotizacion) : "No detectada"}</strong></div>
      </div>`;
  }

  async function parsearExcelFilePuente(file) {
    if (!file || !window.PCT?.leerLibroExcel || !window.PCT?.parsearPresupuesto) return null;
    const libro = await window.PCT.leerLibroExcel(file);
    const inicio = window.PCT.parsearInicio?.(libro) || window.PCT.parsearEncabezadoCotizacion?.(libro) || null;
    const pres = window.PCT.parsearPresupuesto(libro);
    return { ...pres, inicio, archivoNombre: file.name };
  }

  async function abrirModalPuenteOferta() {
    if (!ofertaActual) return;
    const proyExistente = obtenerProyectoIdDeOferta(ofertaActual);
    if (proyExistente) {
      mostrarAviso("Esta oferta ya fue convertida en proyecto.", "info");
      return;
    }
    puenteExcelData = null;
    puenteArchivoFile = null;
    document.getElementById("puente-excel").value = "";
    document.getElementById("puente-docs").value = "";
    document.getElementById("puente-docs-lista").textContent = "";
    document.getElementById("puente-excel-preview").classList.add("hidden");

    document.getElementById("puente-nombre").value = document.getElementById("drawer-titulo").value.trim() || ofertaActual.titulo || "";
    document.getElementById("puente-cliente").value = document.getElementById("drawer-cliente").value || ofertaActual.cliente_id || "";
    document.getElementById("puente-empresa").value = document.getElementById("drawer-empresa").value || ofertaActual.empresa_id || "";
    const valorActual = valorMoneda(document.getElementById("drawer-valor")) || Number(ofertaActual.valor_estimado || 0);
    establecerValorMoneda(document.getElementById("puente-valor"), valorActual);
    document.getElementById("puente-trm").value = document.getElementById("oferta-trm")?.value || ofertaActual.trm_oferta || "";
    document.getElementById("puente-tipo-contrato").value = "aiu";
    document.getElementById("puente-categoria").value = "Instalación / Proyecto";

    const banner = document.getElementById("puente-oferta-banner");
    const { path, nombre } = obtenerExcelDeOferta(ofertaActual);
    if (path && banner) {
      banner.classList.remove("hidden");
      banner.textContent = `⏳ Descargando cotización adjunta de Pre-venta (${nombre})...`;
    } else if (banner) {
      banner.classList.add("hidden");
    }

    document.getElementById("modal-puente-proyecto")?.classList.remove("hidden");

    if (path) {
      try {
        const { data: blob, error } = await window.sb.storage.from("documentos").download(path);
        if (error || !blob) throw error || new Error("No se pudo descargar");
        const archivo = new File([blob], nombre || "Cotizacion.xlsx", {
          type: blob.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });
        puenteArchivoFile = archivo;
        puenteExcelData = await parsearExcelFilePuente(archivo);
        if (banner) {
          banner.innerHTML = `✅ <strong>Excel de Pre-venta cargado automáticamente:</strong> ${escapeHtml(nombre)}. Puedes reemplazarlo abajo si tienes una versión final.`;
        }
        mostrarPreviewPuente(puenteExcelData, nombre);
      } catch (err) {
        if (banner) {
          banner.textContent = `ℹ️ Esta oferta tiene "${nombre}" adjunto, pero no se pudo descargar automáticamente. Puedes cargarlo abajo.`;
        }
      }
    }
  }

  function cerrarModalPuenteOferta() {
    document.getElementById("modal-puente-proyecto")?.classList.add("hidden");
    puenteExcelData = null;
    puenteArchivoFile = null;
  }

  async function ejecutarPuenteOferta(e) {
    e.preventDefault();
    if (!ofertaActual) return;
    const nombre = document.getElementById("puente-nombre").value.trim();
    if (!nombre) return mostrarAviso("Escribe el nombre del proyecto.", "error");

    const btn = document.getElementById("btn-puente-submit");
    const textoOrig = btn ? btn.innerHTML : "";
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Creando proyecto...";
    }

    try {
      const clienteId = document.getElementById("puente-cliente").value || null;
      const empresaId = document.getElementById("puente-empresa").value || null;
      const valorBase = valorMoneda(document.getElementById("puente-valor"));
      const trmRaw = document.getElementById("puente-trm").value.trim();
      const trmVal = trmRaw === "" ? null : Number(trmRaw);
      const tipoContrato = document.getElementById("puente-tipo-contrato").value || "aiu";
      const categoria = document.getElementById("puente-categoria").value || "Instalación / Proyecto";
      const hoyLocal = typeof fechaLocalISO === "function" ? fechaLocalISO() : new Date().toISOString().slice(0, 10);

      let proyectoId = null;
      let yaExistia = false;

      // 1. Crear proyecto (intentar RPC si tiene oportunidad_id)
      if (ofertaActual.oportunidad_id && typeof window.sb?.rpc === "function") {
        try {
          const { data: rpcRes, error: rpcErr } = await window.sb.rpc("rpc_convertir_oportunidad_a_proyecto", {
            p_oportunidad_id: ofertaActual.oportunidad_id,
            p_nombre: nombre,
            p_codigo: null,
          });
          if (!rpcErr && rpcRes?.proyecto_id) {
            proyectoId = rpcRes.proyecto_id;
            yaExistia = rpcRes.ya_existia === true;
          }
        } catch (errRpc) { /* fallback a insert directo */ }
      }

      if (yaExistia && proyectoId) {
        cerrarModalPuenteOferta();
        cerrarDrawer();
        await cargarDatos();
        mostrarAviso("Esta oportunidad ya había sido convertida en proyecto. Abriendo proyecto existente...", "info");
        if (window.PCT?.modal) {
          window.PCT.modal({
            titulo: "Proyecto ya existente",
            html: `<p class="text-sm text-gray-700">Esta oportunidad ya había sido convertida previamente en un proyecto operativo. No se modificó ni se duplicó su presupuesto.</p>`,
            botones: [
              { texto: "Cerrar" },
              {
                texto: "Abrir Proyecto →",
                clase: window.PCT.BTN_PRIMARIO,
                onClick: () => {
                  window.location.href = `proyecto-detalle.html?id=${proyectoId}`;
                },
              },
            ],
          });
        } else {
          window.location.href = `proyecto-detalle.html?id=${proyectoId}`;
        }
        return;
      }

      const extraInicio = puenteExcelData?.inicio?.proyecto || {};
      const datosProyecto = {
        nombre,
        cliente_id: clienteId,
        empresa_id: empresaId,
        valor_antes_impuestos: valorBase,
        tipo_contrato: tipoContrato,
        tipo_proyecto: [categoria],
        estado: "sin_iniciar",
        fecha_inicio: hoyLocal,
        fecha_fin_estimada: ofertaActual.fecha_limite || null,
        created_by: usuarioActualId || null,
      };
      if (tipoContrato === "aiu") {
        if (extraInicio.administracion_porcentaje !== undefined) datosProyecto.administracion_porcentaje = extraInicio.administracion_porcentaje;
        if (extraInicio.imprevistos_porcentaje !== undefined) datosProyecto.imprevistos_porcentaje = extraInicio.imprevistos_porcentaje;
        if (extraInicio.utilidad_porcentaje !== undefined) datosProyecto.utilidad_porcentaje = extraInicio.utilidad_porcentaje;
      }
      if (extraInicio.iva_porcentaje !== undefined) datosProyecto.iva_porcentaje = extraInicio.iva_porcentaje;
      if (extraInicio.anticipo_porcentaje !== undefined) datosProyecto.anticipo_porcentaje = extraInicio.anticipo_porcentaje;
      if (extraInicio.numero_cotizacion) datosProyecto.numero_cotizacion = extraInicio.numero_cotizacion;

      if (!proyectoId) {
        const { data: nuevoProy, error: errProy } = await window.sb
          .from("proyectos")
          .insert(datosProyecto)
          .select()
          .single();
        if (errProy) throw errProy;
        proyectoId = nuevoProy.id;
      } else {
        const { error: errUpd } = await window.sb.from("proyectos").update(datosProyecto).eq("id", proyectoId);
        if (errUpd) {
          const esColumnaFaltante =
            errUpd.code === "42703" ||
            errUpd.code === "PGRST204" ||
            /column|schema cache/i.test(String(errUpd.message || ""));
          if (esColumnaFaltante) {
            console.warn("Algunas columnas opcionales del proyecto aún no están migradas:", errUpd);
          } else {
            console.warn("No se pudieron actualizar todos los datos iniciales del proyecto:", errUpd);
            mostrarAviso("El proyecto se creó, pero no se pudieron guardar todos los datos iniciales.", "info");
          }
        }
      }

      if (trmVal && Number.isFinite(trmVal)) {
        try {
          const { error: errTrm } = await window.sb.from("proyectos").update({ trm_cotizacion: trmVal }).eq("id", proyectoId);
          if (errTrm && errTrm.code !== "42703" && errTrm.code !== "PGRST204" && !/trm_cotizacion|column/i.test(String(errTrm.message || ""))) {
            console.warn("No se pudo guardar la TRM de cotización del proyecto:", errTrm);
          }
        } catch (eTrm) { /* silencioso si la columna aún no está migrada */ }
      }

      // 2. Vincular proyecto en la oferta Pre-venta (defensivo si columna proyecto_id aún no está migrada) y en oportunidad CRM
      try {
        await window.sb
          .from("crm_ofertas_preventa")
          .update({ proyecto_id: proyectoId, updated_at: new Date().toISOString() })
          .eq("id", ofertaActual.id);
      } catch (eOfProy) {
        /* silencioso si la columna proyecto_id aún no está migrada */
      }

      if (ofertaActual.oportunidad_id) {
        try {
          await window.sb
            .from("crm_oportunidades")
            .update({
              proyecto_id: proyectoId,
              etapa: "ganada",
              probabilidad: 100,
              updated_at: new Date().toISOString(),
            })
            .eq("id", ofertaActual.oportunidad_id);
        } catch (eOp) { /* no bloqueante */ }
      }

      // 3. Importar Cotización + Presupuesto de costos en 1 solo paso
      let itemsImportados = 0;
      if (puenteExcelData?.items?.length && window.PCT?.insertarItems) {
        itemsImportados = await window.PCT.insertarItems(proyectoId, puenteExcelData.items, 0);
      }

      // 4. Subir documentos de cierre + Excel cotización a Storage y tabla documentos
      const docsInput = document.getElementById("puente-docs");
      const docsCat = document.getElementById("puente-docs-categoria")?.value || "orden_compra";
      const archivosSubir = [...(docsInput?.files || [])].map((f) => ({ file: f, categoria: docsCat }));
      if (puenteArchivoFile) {
        archivosSubir.push({ file: puenteArchivoFile, categoria: "cotizacion" });
      }
      for (const { file, categoria: cat } of archivosSubir) {
        try {
          const ruta = `${proyectoId}/cierre/${Date.now()}_${file.name.replace(/[^\w.\-]+/g, "_")}`;
          const { error: errUp } = await window.sb.storage.from("documentos").upload(ruta, file, { upsert: true });
          if (errUp) continue;
          const url = window.sb.storage.from("documentos").getPublicUrl(ruta).data.publicUrl;
          await window.sb.from("documentos").insert({
            proyecto_id: proyectoId,
            categoria: cat,
            nombre_archivo: file.name,
            url,
            subido_por: usuarioActualId || null,
          });
        } catch (errDoc) {
          console.warn("No se pudo adjuntar documento de cierre:", errDoc);
        }
      }

      // 5. Notificación a proyectos/directivos
      if (typeof window.PCT_NOTIFICAR === "function") {
        await window.PCT_NOTIFICAR({
          tipo: "nuevo_proyecto",
          titulo: `Nuevo proyecto creado: ${nombre}`,
          mensaje: `Enviado desde Ofertas Pre-venta${itemsImportados ? ` con ${itemsImportados} filas importadas` : ""}.`,
          url: `proyecto-detalle.html?id=${proyectoId}`,
          rol_destino: ["super_usuario", "directivo", "proyectos"],
          proyecto_id: proyectoId,
        });
      }

      cerrarModalPuenteOferta();
      cerrarDrawer();
      await cargarDatos();
      mostrarAviso(`¡Proyecto "${nombre}" creado con éxito!`, "exito");
      if (window.PCT?.modal) {
        window.PCT.modal({
          titulo: "¡Proyecto creado en 1 paso!",
          html: `<p class="text-sm text-gray-700">El proyecto <strong>${escapeHtml(nombre)}</strong> ya está listo${itemsImportados ? ` con <strong>${itemsImportados}</strong> renglones de Cotización y Costos cargados` : ""}.</p>`,
          botones: [
            { texto: "Quedarme en Ofertas" },
            {
              texto: "Abrir Proyecto →",
              clase: window.PCT.BTN_PRIMARIO,
              onClick: () => {
                window.location.href = `proyecto-detalle.html?id=${proyectoId}`;
              },
            },
          ],
        });
      }
    } catch (err) {
      manejarError(err, "No se pudo crear el proyecto desde la oferta");
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = textoOrig;
      }
    }
  }

  async function eliminarOferta() {
    if (!ofertaActual) return;
    if (!confirm(`¿Eliminar definitivamente la oferta "${ofertaActual.titulo}"?`)) return;
    const { error } = await window.sb.from("crm_ofertas_preventa").delete().eq("id", ofertaActual.id);
    if (error) return manejarError(error, "No se pudo eliminar la oferta");
    mostrarAviso("Oferta eliminada.", "info");
    cerrarDrawer();
    await cargarDatos();
  }

  async function duplicarOferta(id) {
    const o = ofertas.find((x) => x.id === id);
    if (!o) return;
    try {
      const respId = o.responsable_id || usuarioActualId || null;
      const { error } = await window.sb.from("crm_ofertas_preventa").insert({
        titulo: `${o.titulo} (Copia)`,
        cliente_id: o.cliente_id || null,
        empresa_id: o.empresa_id || null,
        responsable_id: respId,
        estado: "levantamiento",
        prioridad: o.prioridad || "media",
        valor_estimado: Number(o.valor_estimado || 0),
        fecha_limite: o.fecha_limite || null,
        plazo_ejecucion: o.plazo_ejecucion || null,
        descripcion: o.descripcion || null,
        informe_levantamiento: o.informe_levantamiento || null,
        subtareas: Array.isArray(o.subtareas) ? JSON.parse(JSON.stringify(o.subtareas)) : [],
        adjuntos: Array.isArray(o.adjuntos) ? JSON.parse(JSON.stringify(o.adjuntos)) : [],
        historial_relevos: [
          {
            fecha: new Date().toISOString(),
            de_estado: null,
            a_estado: "levantamiento",
            de_responsable_id: null,
            a_responsable_id: respId,
            nota: `Duplicada desde "${o.titulo}"`,
            usuario_id: usuarioActualId || null,
          },
        ],
        creado_por: usuarioActualId || null,
      });
      if (error) throw error;
      mostrarAviso("Oferta duplicada en Levantamiento.", "exito");
      await cargarDatos();
    } catch (err) {
      manejarError(err, "No se pudo duplicar la oferta");
    }
  }

  async function registrarSeguimiento(id) {
    const o = ofertas.find((x) => x.id === id);
    if (!o) return;
    const nota = prompt(`Nota de seguimiento para "${o.titulo}":`);
    if (nota === null) return;
    const notaLimpia = nota.trim();
    if (!notaLimpia) return;

    const historial = Array.isArray(o.historial_relevos) ? [...o.historial_relevos] : [];
    historial.push({
      fecha: new Date().toISOString(),
      de_estado: o.estado,
      a_estado: o.estado,
      de_responsable_id: o.responsable_id || null,
      a_responsable_id: o.responsable_id || null,
      nota: notaLimpia,
      usuario_id: usuarioActualId || null,
    });

    try {
      const { error } = await window.sb
        .from("crm_ofertas_preventa")
        .update({
          historial_relevos: historial,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw error;
      mostrarAviso("Seguimiento registrado.", "exito");
      await cargarDatos();
    } catch (err) {
      manejarError(err, "No se pudo registrar el seguimiento");
    }
  }

  function bindEventos() {
    activarCamposMoneda();

    const btnTablero = document.getElementById("btn-vista-tablero");
    const btnLista = document.getElementById("btn-vista-lista");
    btnTablero?.addEventListener("click", () => {
      vistaActual = "tablero";
      localStorage.setItem("pctronic_ofertas_vista", "tablero");
      btnTablero.className = "flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold bg-primary text-white transition-colors";
      btnLista.className = "flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold text-gray-600 hover:text-gray-900 transition-colors";
      render();
    });
    btnLista?.addEventListener("click", () => {
      vistaActual = "lista";
      localStorage.setItem("pctronic_ofertas_vista", "lista");
      btnLista.className = "flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold bg-primary text-white transition-colors";
      btnTablero.className = "flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold text-gray-600 hover:text-gray-900 transition-colors";
      render();
    });

    document.getElementById("filtro-busqueda")?.addEventListener("input", render);
    document.getElementById("filtro-prioridad")?.addEventListener("change", render);
    document.getElementById("filtro-responsable")?.addEventListener("change", render);

    // Drag & drop Kanban
    const vistaTablero = document.getElementById("vista-tablero");
    vistaTablero?.addEventListener("dragstart", (e) => {
      const card = e.target.closest(".card-oferta");
      if (!card) return;
      arrastrandoId = card.dataset.id;
      e.dataTransfer.setData("text/plain", arrastrandoId);
      card.classList.add("opacity-50");
    });
    vistaTablero?.addEventListener("dragend", (e) => {
      e.target.closest(".card-oferta")?.classList.remove("opacity-50");
      arrastrandoId = null;
      document.querySelectorAll(".kanban-col").forEach((c) => c.classList.remove("ring-2", "ring-primary"));
    });
    vistaTablero?.addEventListener("dragover", (e) => {
      const col = e.target.closest(".kanban-col");
      if (col) {
        e.preventDefault();
        col.classList.add("ring-2", "ring-primary");
      }
    });
    vistaTablero?.addEventListener("dragleave", (e) => {
      const col = e.target.closest(".kanban-col");
      if (col && !col.contains(e.relatedTarget)) col.classList.remove("ring-2", "ring-primary");
    });
    vistaTablero?.addEventListener("drop", (e) => {
      const col = e.target.closest(".kanban-col");
      if (!col) return;
      e.preventDefault();
      col.classList.remove("ring-2", "ring-primary");
      const id = e.dataTransfer.getData("text/plain") || arrastrandoId;
      const nuevoEstado = col.dataset.estado;
      if (id && nuevoEstado) abrirModalRelevo(id, nuevoEstado, "kanban");
    });

    // Acciones rápidas en tarjetas Kanban
    vistaTablero?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-action][data-oferta-id]");
      if (!btn) return;
      e.stopPropagation();
      const { action, ofertaId } = btn.dataset;
      if (action === "duplicar") duplicarOferta(ofertaId);
      else if (action === "seguimiento") registrarSeguimiento(ofertaId);
      else if (action === "finalizar") abrirModalRelevo(ofertaId, "finalizado", "kanban");
      else if (action === "enviar-comercial") abrirModalEnviarComercial(ofertaId, "kanban");
      else if (action === "descargar-excel") {
        const of = ofertas.find((x) => x.id === ofertaId);
        if (of) descargarExcelOferta(of);
      }
    });

    // Abrir drawer al hacer clic en tarjeta o fila
    document.addEventListener("click", (e) => {
      const card = e.target.closest("[data-id]");
      if (card && !e.target.closest("button") && !e.target.closest("a") && !e.target.closest("#drawer-panel")) {
        abrirDrawer(card.dataset.id);
      }
    });

    document.getElementById("btn-drawer-cerrar")?.addEventListener("click", cerrarDrawer);
    document.getElementById("btn-drawer-cancelar")?.addEventListener("click", cerrarDrawer);
    document.getElementById("drawer-backdrop")?.addEventListener("click", cerrarDrawer);
    document.getElementById("btn-drawer-guardar")?.addEventListener("click", guardarOferta);
    document.getElementById("btn-drawer-eliminar")?.addEventListener("click", eliminarOferta);
    document.getElementById("btn-oferta-enviar-proyecto")?.addEventListener("click", abrirModalPuenteOferta);
    document.getElementById("btn-oferta-excel-descargar")?.addEventListener("click", () => descargarExcelOferta(ofertaActual));
    document.getElementById("btn-enviar-comercial")?.addEventListener("click", async () => {
      if (!ofertaActual) return;
      const btn = document.getElementById("btn-enviar-comercial");
      const comercialId = document.getElementById("drawer-comercial-destino")?.value || obtenerComercialSugerido(ofertaActual) || null;
      if (btn) btn.disabled = true;
      try {
        await enviarOfertaAlComercial(ofertaActual.id, comercialId, "", { desdeDrawer: true });
      } finally {
        if (btn) btn.disabled = false;
      }
    });
    document.getElementById("btn-envio-comercial-cerrar")?.addEventListener("click", () => cerrarModalEnviarComercial(true));
    document.getElementById("btn-envio-comercial-cancelar")?.addEventListener("click", () => cerrarModalEnviarComercial(true));
    document.getElementById("btn-envio-comercial-confirmar")?.addEventListener("click", async () => {
      if (!envioComercialPendiente) return;
      const btn = document.getElementById("btn-envio-comercial-confirmar");
      const { id, origen } = envioComercialPendiente;
      const comercialId = document.getElementById("envio-comercial-destino")?.value || null;
      const nota = document.getElementById("envio-comercial-nota")?.value.trim() || "";
      if (btn) btn.disabled = true;
      try {
        await enviarOfertaAlComercial(id, comercialId, nota, { desdeDrawer: origen === "drawer" });
      } finally {
        if (btn) btn.disabled = false;
      }
    });
    document.getElementById("oferta-excel-input")?.addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (file) subirExcelOferta(file);
    });

    // Modal Puente de Cierre Ganado -> Nuevo Proyecto
    document.getElementById("btn-puente-cerrar")?.addEventListener("click", cerrarModalPuenteOferta);
    document.getElementById("btn-puente-cancelar")?.addEventListener("click", cerrarModalPuenteOferta);
    document.getElementById("form-puente-proyecto")?.addEventListener("submit", ejecutarPuenteOferta);
    document.getElementById("puente-excel")?.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        puenteArchivoFile = file;
        puenteExcelData = await parsearExcelFilePuente(file);
        mostrarPreviewPuente(puenteExcelData, file.name);
      } catch (err) {
        puenteExcelData = null;
        puenteArchivoFile = null;
        mostrarAviso(err.message || "No se pudo leer el archivo Excel", "error");
      }
    });
    document.getElementById("puente-docs")?.addEventListener("change", (e) => {
      const files = [...(e.target.files || [])];
      const listaEl = document.getElementById("puente-docs-lista");
      if (listaEl) {
        listaEl.textContent = files.length
          ? `${files.length} archivo(s) seleccionado(s): ${files.map((f) => f.name).join(", ")}`
          : "";
      }
    });

    document.getElementById("drawer-estado")?.addEventListener("change", (e) => {
      if (ofertaActual && e.target.value !== normalizarEstadoOferta(ofertaActual.estado)) {
        abrirModalRelevo(ofertaActual.id, e.target.value, "drawer");
      }
    });

    // Subtareas
    document.getElementById("btn-agregar-subtarea")?.addEventListener("click", () => {
      if (!ofertaActual) return;
      const inp = document.getElementById("nueva-subtarea-txt");
      const txt = inp.value.trim();
      if (!txt) return;
      ofertaActual.subtareas = Array.isArray(ofertaActual.subtareas) ? ofertaActual.subtareas : [];
      ofertaActual.subtareas.push({ id: Date.now(), texto: txt, hecha: false });
      inp.value = "";
      renderSubtareas();
    });
    document.getElementById("drawer-subtareas-lista")?.addEventListener("change", (e) => {
      const idx = e.target.dataset.subToggle;
      if (idx === undefined || !ofertaActual) return;
      ofertaActual.subtareas[Number(idx)].hecha = e.target.checked;
      renderSubtareas();
    });
    document.getElementById("drawer-subtareas-lista")?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-sub-del]");
      if (!btn || !ofertaActual) return;
      ofertaActual.subtareas.splice(Number(btn.dataset.subDel), 1);
      renderSubtareas();
    });

    // Adjuntos
    document.getElementById("btn-agregar-adjunto")?.addEventListener("click", () => {
      if (!ofertaActual) return;
      const nom = document.getElementById("nuevo-adj-nombre").value.trim();
      const url = document.getElementById("nuevo-adj-url").value.trim();
      if (!nom || !/^https?:\/\/.+/i.test(url)) {
        return mostrarAviso("Ingresa un nombre y una URL válida (http:// o https://)", "error");
      }
      ofertaActual.adjuntos = Array.isArray(ofertaActual.adjuntos) ? ofertaActual.adjuntos : [];
      ofertaActual.adjuntos.push({ id: Date.now(), nombre: nom, url });
      document.getElementById("nuevo-adj-nombre").value = "";
      document.getElementById("nuevo-adj-url").value = "";
      renderAdjuntos();
    });
    document.getElementById("drawer-adjuntos-lista")?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-adj-del]");
      if (!btn || !ofertaActual) return;
      ofertaActual.adjuntos.splice(Number(btn.dataset.adjDel), 1);
      renderAdjuntos();
    });

    // Modal Relevo
    document.getElementById("btn-relevo-cerrar")?.addEventListener("click", () => cerrarModalRelevo(true));
    document.getElementById("btn-relevo-cancelar")?.addEventListener("click", () => cerrarModalRelevo(true));
    document.getElementById("btn-relevo-confirmar")?.addEventListener("click", confirmarRelevo);

    // Modal Nueva Oferta
    const modalNuevo = document.getElementById("modal-nuevo");
    document.getElementById("btn-nueva-oferta")?.addEventListener("click", () => {
      document.getElementById("form-nuevo")?.reset();
      modalNuevo?.classList.remove("hidden");
    });
    document.getElementById("btn-modal-nuevo-cerrar")?.addEventListener("click", () => modalNuevo?.classList.add("hidden"));
    document.getElementById("btn-modal-nuevo-cancelar")?.addEventListener("click", () => modalNuevo?.classList.add("hidden"));

    document.getElementById("form-nuevo")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const titulo = document.getElementById("nuevo-titulo").value.trim();
      if (!titulo) return;
      const respId = document.getElementById("nuevo-responsable").value || usuarioActualId || null;
      try {
        const { data, error } = await window.sb
          .from("crm_ofertas_preventa")
          .insert({
            titulo,
            cliente_id: document.getElementById("nuevo-cliente").value || null,
            empresa_id: document.getElementById("nuevo-empresa").value || null,
            responsable_id: respId,
            prioridad: document.getElementById("nuevo-prioridad").value,
            valor_estimado: valorMoneda(document.getElementById("nuevo-valor")),
            fecha_limite: document.getElementById("nuevo-fecha").value || null,
            estado: "levantamiento",
            historial_relevos: [
              {
                fecha: new Date().toISOString(),
                de_estado: null,
                a_estado: "levantamiento",
                de_responsable_id: null,
                a_responsable_id: respId,
                nota: "Oferta creada",
                usuario_id: usuarioActualId || null,
              },
            ],
            creado_por: usuarioActualId || null,
          })
          .select()
          .single();
        if (error) throw error;
        modalNuevo.classList.add("hidden");
        mostrarAviso("Oferta creada.", "exito");
        await cargarDatos();
        if (data?.id) abrirDrawer(data.id);
      } catch (err) {
        manejarError(err, "No se pudo crear la oferta");
      }
    });
  }

  bindEventos();
  await cargarDatos();

  const ofertaIdParam = qs("id");
  if (ofertaIdParam) abrirDrawer(ofertaIdParam);
})();
