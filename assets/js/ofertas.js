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
    levantamiento: { label: "Levantamiento", color: "bg-slate-500", badge: "bg-slate-100 text-slate-800", comercial: true },
    en_proceso: { label: "En proceso", color: "bg-primary", badge: "bg-blue-100 text-blue-800", comercial: false },
    finalizado: { label: "Finalizado", color: "bg-amber-500", badge: "bg-amber-100 text-amber-800", comercial: false },
    enviado_cliente: { label: "Enviado al cliente", color: "bg-emerald-500", badge: "bg-emerald-100 text-emerald-800", comercial: true },
  };

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
  let vistaActual = localStorage.getItem("pctronic_ofertas_vista") || "tablero";
  let relevoPendiente = null; // { id, nuevoEstado, origen }
  let arrastrandoId = null;

  const nombrePerfil = (id) => perfiles.find((p) => p.id === id)?.nombre_completo || "Sin asignar";

  // Resaltar columnas comerciales si el rol es comercial
  if (esComercialSolo) {
    document.querySelectorAll(".kanban-col").forEach((col) => {
      const est = col.dataset.estado;
      if (ESTADOS[est]?.comercial) {
        col.classList.add("ring-1", "ring-primary/30");
      }
    });
  }

  async function cargarDatos() {
    try {
      const [resOf, resCli, resEmp, resProf] = await Promise.all([
        window.sb
          .from("crm_ofertas_preventa")
          .select("*, clientes(id, nombre), empresas(id, nombre), profiles:responsable_id(id, nombre_completo)")
          .order("created_at", { ascending: false }),
        window.sb.from("clientes").select("id, nombre").order("nombre"),
        window.sb.from("empresas").select("id, nombre").order("nombre"),
        window.sb.from("profiles").select("id, nombre_completo").order("nombre_completo"),
      ]);

      if (resOf.error) throw resOf.error;
      ofertas = resOf.data || [];
      clientes = resCli.data || [];
      empresas = resEmp.data || [];
      perfiles = resProf.data || [];

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

    ["drawer-cliente", "nuevo-cliente"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = `<option value="">Sin cliente</option>${optsCli}`;
    });
    ["drawer-empresa", "nuevo-empresa"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = `<option value="">Sin empresa</option>${optsEmp}`;
    });
    ["drawer-responsable", "nuevo-responsable", "relevo-responsable"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = `<option value="">Sin asignar</option>${optsProf}`;
    });
    const selFiltroResp = document.getElementById("filtro-responsable");
    if (selFiltroResp) selFiltroResp.innerHTML = `<option value="">Responsable: Todos</option>${optsProf}`;
  }

  function actualizarKPIs() {
    const activas = ofertas.filter((o) => ["levantamiento", "en_proceso"].includes(o.estado));
    const finalizadas = ofertas.filter((o) => o.estado === "finalizado");
    const enviadas = ofertas.filter((o) => o.estado === "enviado_cliente");
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
      const lista = filtradas.filter((o) => o.estado === estado);
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
          const pr = PRIORIDADES[o.prioridad] || PRIORIDADES.media;
          const resp = o.profiles?.nombre_completo || "Sin asignar";
          const inicial = resp.trim().charAt(0).toUpperCase();
          const subs = Array.isArray(o.subtareas) ? o.subtareas : [];
          const hechas = subs.filter((s) => s.hecha).length;

          return `
            <div draggable="true" class="card-oferta group rounded-xl border border-gray-200 bg-white p-3.5 shadow-sm hover:shadow-md hover:border-primary/40 transition-all cursor-grab active:cursor-grabbing" data-id="${o.id}">
              <div class="flex items-center justify-between gap-1 mb-2">
                <span class="inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold ${pr.badge}">${pr.label}</span>
                ${o.oportunidad_id ? `<span class="inline-flex items-center gap-0.5 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700" title="Vinculada al CRM"><span class="material-symbols-outlined text-[12px]">handshake</span> CRM</span>` : ""}
              </div>
              <h3 class="text-xs font-bold text-gray-900 group-hover:text-primary line-clamp-2">${escapeHtml(o.titulo)}</h3>
              <p class="mt-1 text-[11px] text-gray-500 truncate">${escapeHtml(o.clientes?.nombre || "Sin cliente")}${o.empresas?.nombre ? " · " + escapeHtml(o.empresas.nombre) : ""}</p>
              <div class="mt-3 flex items-center justify-between border-t border-gray-100 pt-2 text-xs">
                <span class="font-bold text-gray-900">${formatoMoneda(o.valor_estimado)}</span>
                ${subs.length ? `<span class="text-[10px] text-gray-500 flex items-center gap-0.5"><span class="material-symbols-outlined text-[13px]">checklist</span>${hechas}/${subs.length}</span>` : ""}
              </div>
              <div class="mt-2 flex items-center justify-between text-[10px] text-gray-400">
                <span class="flex items-center gap-1"><span class="material-symbols-outlined text-[13px]">event</span>${o.fecha_limite ? formatoFecha(o.fecha_limite) : "Sin fecha"}</span>
                <div class="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-primary font-bold" title="${escapeHtml(resp)}">${inicial}</div>
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
            const est = ESTADOS[o.estado] || ESTADOS.levantamiento;
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
          .map(
            (a, i) => `
          <div class="flex items-center justify-between gap-2 rounded-lg border border-gray-100 bg-gray-50/70 px-3 py-1.5 text-xs">
            <a href="${escapeHtml(a.url)}" target="_blank" rel="noopener noreferrer" class="flex items-center gap-1.5 font-medium text-primary hover:underline truncate">
              <span class="material-symbols-outlined text-[15px]">link</span> ${escapeHtml(a.nombre)}
            </a>
            <button type="button" data-adj-del="${i}" class="text-gray-400 hover:text-red-600"><span class="material-symbols-outlined text-[16px]">delete</span></button>
          </div>`
          )
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
            const deEst = r.de_estado ? (ESTADOS[r.de_estado]?.label || r.de_estado) : "Inicio";
            const aEst = ESTADOS[r.a_estado]?.label || r.a_estado;
            return `
            <div class="rounded-lg border border-gray-100 bg-gray-50 p-2.5 text-xs">
              <div class="flex items-center justify-between">
                <span class="font-semibold text-gray-800">${escapeHtml(deEst)} → ${escapeHtml(aEst)}</span>
                <span class="text-[10px] text-gray-400">${formatoFecha(r.fecha)}</span>
              </div>
              <p class="mt-0.5 text-[11px] text-gray-600">Responsable: <b>${escapeHtml(nombrePerfil(r.a_responsable_id))}</b></p>
              ${r.nota ? `<p class="mt-0.5 text-[11px] text-gray-500 italic">"${escapeHtml(r.nota)}"</p>` : ""}
            </div>`;
          })
          .join("")
      : `<p class="text-[11px] text-gray-400">Sin relevos registrados.</p>`;
  }

  function abrirDrawer(id) {
    const o = ofertas.find((x) => x.id === id);
    if (!o) return;
    ofertaActual = JSON.parse(JSON.stringify(o));

    document.getElementById("drawer-titulo").value = o.titulo || "";
    document.getElementById("drawer-estado").value = o.estado || "levantamiento";
    document.getElementById("drawer-responsable").value = o.responsable_id || "";
    document.getElementById("drawer-cliente").value = o.cliente_id || "";
    document.getElementById("drawer-empresa").value = o.empresa_id || "";
    document.getElementById("drawer-prioridad").value = o.prioridad || "media";
    document.getElementById("drawer-fecha").value = o.fecha_limite || "";
    document.getElementById("drawer-descripcion").value = o.descripcion || "";
    document.getElementById("drawer-informe").value = o.informe_levantamiento || "";
    establecerValorMoneda(document.getElementById("drawer-valor"), o.valor_estimado || 0);

    const linkCrm = document.getElementById("drawer-link-crm");
    if (o.oportunidad_id) {
      linkCrm.classList.remove("hidden");
      linkCrm.classList.add("inline-flex");
    } else {
      linkCrm.classList.add("hidden");
      linkCrm.classList.remove("inline-flex");
    }

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

  // Relevo obligatorio al cambiar etapa
  function abrirModalRelevo(id, nuevoEstado, origen = "kanban") {
    const o = ofertas.find((x) => x.id === id);
    if (!o || o.estado === nuevoEstado) return;
    relevoPendiente = { id, nuevoEstado, origen };

    const deLabel = ESTADOS[o.estado]?.label || o.estado;
    const aLabel = ESTADOS[nuevoEstado]?.label || nuevoEstado;
    document.getElementById("relevo-resumen").innerHTML = `Vas a mover <b>${escapeHtml(o.titulo)}</b> de <b>${deLabel}</b> a <b>${aLabel}</b>. Confirma o asigna el nuevo responsable para registrar el relevo.`;
    document.getElementById("relevo-responsable").value = o.responsable_id || "";
    document.getElementById("relevo-nota").value = "";
    document.getElementById("modal-relevo").classList.remove("hidden");
  }

  function cerrarModalRelevo(revertirSelect = true) {
    document.getElementById("modal-relevo").classList.add("hidden");
    if (revertirSelect && relevoPendiente?.origen === "drawer" && ofertaActual) {
      document.getElementById("drawer-estado").value = ofertaActual.estado;
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

    const historial = Array.isArray(o.historial_relevos) ? [...o.historial_relevos] : [];
    historial.push({
      fecha: new Date().toISOString(),
      de_estado: o.estado,
      a_estado: nuevoEstado,
      de_responsable_id: o.responsable_id || null,
      a_responsable_id: nuevoResp,
      nota,
      usuario_id: usuarioActualId || null,
    });

    try {
      const { error } = await window.sb
        .from("crm_ofertas_preventa")
        .update({
          estado: nuevoEstado,
          responsable_id: nuevoResp,
          historial_relevos: historial,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (error) throw error;

      // Si pasa a Enviado al cliente y tiene oportunidad vinculada, actualizar etapa en CRM
      if (nuevoEstado === "enviado_cliente" && o.oportunidad_id) {
        await window.sb
          .from("crm_oportunidades")
          .update({ etapa: "negociacion", updated_at: new Date().toISOString() })
          .eq("id", o.oportunidad_id);
      }

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

    try {
      const { error } = await window.sb
        .from("crm_ofertas_preventa")
        .update({
          titulo,
          responsable_id: document.getElementById("drawer-responsable").value || null,
          cliente_id: document.getElementById("drawer-cliente").value || null,
          empresa_id: document.getElementById("drawer-empresa").value || null,
          prioridad: document.getElementById("drawer-prioridad").value,
          fecha_limite: document.getElementById("drawer-fecha").value || null,
          valor_estimado: valorMoneda(document.getElementById("drawer-valor")),
          descripcion: document.getElementById("drawer-descripcion").value.trim() || null,
          informe_levantamiento: document.getElementById("drawer-informe").value.trim() || null,
          subtareas: ofertaActual.subtareas || [],
          adjuntos: ofertaActual.adjuntos || [],
          updated_at: new Date().toISOString(),
        })
        .eq("id", ofertaActual.id);

      if (error) throw error;
      mostrarAviso("Oferta actualizada.", "exito");
      cerrarDrawer();
      await cargarDatos();
    } catch (err) {
      manejarError(err, "No se pudo guardar la oferta");
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

    document.getElementById("drawer-estado")?.addEventListener("change", (e) => {
      if (ofertaActual && e.target.value !== ofertaActual.estado) {
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
