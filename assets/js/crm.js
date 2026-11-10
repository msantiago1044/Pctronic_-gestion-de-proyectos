// ============================================================================
// CRM COMERCIAL · Pctronic Seguridad Electrónica (Estilo Asana)
// ----------------------------------------------------------------------------
// Pipeline comercial, visitas técnicas, cotizaciones y conversión a Proyectos.
// ============================================================================

(async () => {
  const { session, profile } = await window.pctronicReady;
  if (!session) return;
  const usuarioActualId = session?.user?.id;

  // 1. Constantes y Configuración de Etapas y Servicios
  const ETAPAS = {
    prospecto: { label: "Prospecto / Lead", color: "bg-slate-500", badge: "bg-slate-100 text-slate-800" },
    visita: { label: "Visita Técnica", color: "bg-indigo-500", badge: "bg-indigo-100 text-indigo-800" },
    cotizacion: { label: "Cotización Enviada", color: "bg-amber-500", badge: "bg-amber-100 text-amber-800" },
    negociacion: { label: "Negociación", color: "bg-blue-500", badge: "bg-blue-100 text-blue-800" },
    ganada: { label: "Ganada", color: "bg-emerald-500", badge: "bg-emerald-100 text-emerald-800" },
    perdida: { label: "Perdida", color: "bg-rose-500", badge: "bg-rose-100 text-rose-800" },
  };

  const SERVICIOS = {
    cctv: { label: "CCTV", badge: "bg-blue-50 text-blue-700 border-blue-200" },
    control_acceso: { label: "Acceso", badge: "bg-purple-50 text-purple-700 border-purple-200" },
    incendio: { label: "Incendio", badge: "bg-red-50 text-red-700 border-red-200" },
    cableado: { label: "Redes / Voz y Datos", badge: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    alarmas: { label: "Alarmas", badge: "bg-amber-50 text-amber-700 border-amber-200" },
    integral: { label: "Integral", badge: "bg-indigo-50 text-indigo-700 border-indigo-200" },
    otro: { label: "Otro", badge: "bg-gray-50 text-gray-700 border-gray-200" },
  };

  const ICONOS_ACTIVIDAD = {
    nota: "sticky_note_2",
    llamada: "phone_in_talk",
    visita: "domain",
    reunion: "groups",
    correo: "mail",
    tarea: "check_circle",
  };

  // 2. Estado local
  let oportunidades = [];
  let clientes = [];
  let perfiles = [];
  let oportunidadActual = null;
  let vistaActual = localStorage.getItem("pctronic_crm_vista") || "tablero";

  // 3. Cargar datos desde Supabase
  async function cargarDatos() {
    try {
      const [resOps, resCli, resProf] = await Promise.all([
        window.sb
          .from("crm_oportunidades")
          .select(`
            *,
            contacto_nombre,
            contacto_telefono,
            clientes(id, nombre),
            profiles:responsable_id(id, nombre_completo, avatar_url),
            proyectos:proyecto_id(id, nombre)
          `)
          .order("created_at", { ascending: false }),
        window.sb.from("clientes").select("id, nombre").order("nombre"),
        window.sb.from("profiles").select("id, nombre_completo").order("nombre_completo"),
      ]);

      if (resOps.error) throw resOps.error;
      oportunidades = resOps.data || [];
      clientes = resCli.data || [];
      perfiles = resProf.data || [];

      poblarSelects();
      actualizarKPIs();
      render();
    } catch (err) {
      manejarError(err, "No se pudieron cargar las oportunidades comerciales");
    }
  }

  // 4. Poblar desplegables de clientes y comerciales
  function poblarSelects() {
    const optsClientes = clientes.map((c) => `<option value="${c.id}">${escapeHtml(c.nombre)}</option>`).join("");
    const optsPerfiles = perfiles.map((p) => `<option value="${p.id}">${escapeHtml(p.nombre_completo || "Usuario")}</option>`).join("");

    const selDrawerCli = document.getElementById("drawer-cliente");
    const selNuevoCli = document.getElementById("nuevo-cliente");
    if (selDrawerCli) selDrawerCli.innerHTML = '<option value="">Sin cliente asignado</option>' + optsClientes;
    if (selNuevoCli) selNuevoCli.innerHTML = '<option value="">Selecciona cliente...</option>' + optsClientes;

    const selDrawerResp = document.getElementById("drawer-responsable");
    const selNuevoResp = document.getElementById("nuevo-responsable");
    const selFiltroResp = document.getElementById("filtro-responsable");
    if (selDrawerResp) selDrawerResp.innerHTML = '<option value="">Sin asignar</option>' + optsPerfiles;
    if (selNuevoResp) selNuevoResp.innerHTML = '<option value="">Sin asignar</option>' + optsPerfiles;
    if (selFiltroResp) selFiltroResp.innerHTML = '<option value="">Comercial: Todos</option>' + optsPerfiles;
  }

  // 5. Cálculo de métricas comerciales (KPIs)
  function actualizarKPIs() {
    const ahora = new Date();
    const mesActual = ahora.getMonth();
    const anioActual = ahora.getFullYear();

    let pipelinePonderado = 0;
    let activasCount = 0;
    let ganadasCount = 0;
    let perdidasCount = 0;
    let ganadasMesMonto = 0;

    oportunidades.forEach((op) => {
      const valor = Number(op.valor_estimado || 0);
      const prob = Number(op.probabilidad || 0);

      if (["prospecto", "visita", "cotizacion", "negociacion"].includes(op.etapa)) {
        activasCount++;
        pipelinePonderado += valor * (prob / 100);
      } else if (op.etapa === "ganada") {
        ganadasCount++;
        const d = new Date(op.updated_at || op.created_at);
        if (d.getMonth() === mesActual && d.getFullYear() === anioActual) {
          ganadasMesMonto += valor;
        }
      } else if (op.etapa === "perdida") {
        perdidasCount++;
      }
    });

    const totalCerradas = ganadasCount + perdidasCount;
    const tasaConversion = totalCerradas > 0 ? Math.round((ganadasCount / totalCerradas) * 100) : 0;

    document.getElementById("kpi-pipeline").textContent = formatoMoneda(pipelinePonderado);
    document.getElementById("kpi-activas").textContent = activasCount;
    document.getElementById("kpi-conversion").textContent = `${tasaConversion}%`;
    document.getElementById("kpi-ganadas-mes").textContent = formatoMoneda(ganadasMesMonto);
  }

  // 6. Filtrado y renderizado de vistas
  function getFiltradas() {
    const texto = (document.getElementById("filtro-busqueda")?.value || "").trim().toLowerCase();
    const serv = document.getElementById("filtro-servicio")?.value || "";
    const resp = document.getElementById("filtro-responsable")?.value || "";

    return oportunidades.filter((op) => {
      const coincideTexto =
        !texto ||
        op.titulo.toLowerCase().includes(texto) ||
        (op.clientes?.nombre || "").toLowerCase().includes(texto) ||
        (op.contacto_nombre || "").toLowerCase().includes(texto) ||
        (op.contacto_telefono || "").toLowerCase().includes(texto) ||
        (op.contacto_id || "").toLowerCase().includes(texto);
      const coincideServ = !serv || op.tipo_servicio === serv;
      const coincideResp = !resp || op.responsable_id === resp;
      return coincideTexto && coincideServ && coincideResp;
    });
  }

  function render() {
    const filtradas = getFiltradas();
    document.getElementById("contador-resultados").textContent = `${filtradas.length} oportunidad${filtradas.length === 1 ? "" : "es"}`;

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

  // Helper para URL de WhatsApp
  function obtenerUrlWhatsApp(telefono, titulo) {
    if (!telefono) return null;
    const telLimpio = String(telefono).replace(/\D/g, "");
    if (!telLimpio) return null;
    const telFinal = telLimpio.length === 10 ? `57${telLimpio}` : telLimpio;
    const msg = encodeURIComponent(`Hola, te contacto de Pctronic respecto a la propuesta: ${titulo || ""}`);
    return `https://wa.me/${telFinal}?text=${msg}`;
  }

  // 7. Render Vista Tablero (Kanban Asana)
  function renderTablero(filtradas) {
    Object.keys(ETAPAS).forEach((etapa) => {
      const contenedor = document.getElementById(`cards-${etapa}`);
      if (!contenedor) return;

      const opsEtapa = filtradas.filter((o) => o.etapa === etapa);
      const subtotal = opsEtapa.reduce((acc, cur) => acc + Number(cur.valor_estimado || 0), 0);

      // Actualizar contador y subtotal de la columna
      const colEl = document.querySelector(`.kanban-col[data-etapa="${etapa}"]`);
      if (colEl) {
        colEl.querySelector(".col-count").textContent = opsEtapa.length;
        colEl.querySelector(".col-subtotal").textContent = formatoMoneda(subtotal);
      }

      if (opsEtapa.length === 0) {
        contenedor.innerHTML = `
          <div class="rounded-lg border border-dashed border-gray-200 p-4 text-center text-xs text-gray-400">
            Sin oportunidades
          </div>`;
        return;
      }

      contenedor.innerHTML = opsEtapa
        .map((op) => {
          const srv = SERVICIOS[op.tipo_servicio] || SERVICIOS.otro;
          const respNombre = op.profiles?.nombre_completo || "—";
          const inicial = respNombre.trim().charAt(0).toUpperCase();
          const diasCreado = Math.floor((new Date() - new Date(op.created_at)) / (1000 * 60 * 60 * 24));
          const fechaReferencia = new Date(op.updated_at || op.created_at);
          const diasSinCambio = Math.floor((new Date() - fechaReferencia) / (1000 * 60 * 60 * 24));
          const esEstancada = ["visita", "cotizacion", "negociacion"].includes(op.etapa) && diasSinCambio >= 5;

          const tel = op.contacto_telefono || "";
          const urlWa = obtenerUrlWhatsApp(tel, op.titulo);

          return `
          <div draggable="true" class="card-oportunidad group relative rounded-xl border border-gray-200 bg-white p-3.5 shadow-sm hover:shadow-md hover:border-primary/40 transition-all cursor-grab active:cursor-grabbing" data-id="${op.id}">
            <div class="flex items-center justify-between gap-1 mb-2">
              <span class="inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold ${srv.badge}">
                ${srv.label}
              </span>
              <div class="flex items-center gap-1">
                ${esEstancada ? `
                  <span class="inline-flex items-center gap-0.5 rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-[10px] font-bold" title="Sin actualización hace ${diasSinCambio} días">
                    ⚠️ Inactiva ${diasSinCambio}d
                  </span>` : ""}
                ${op.proyecto_id ? `
                  <span class="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-[10px] font-bold" title="Vinculado a Proyecto">
                    <span class="material-symbols-outlined text-[12px]">rocket_launch</span> Proyecto
                  </span>` : ""}
              </div>
            </div>

            <h3 class="text-xs font-bold text-gray-900 group-hover:text-primary transition-colors line-clamp-2">
              ${escapeHtml(op.titulo)}
            </h3>

            <div class="flex items-center justify-between mt-1">
              <p class="text-[11px] text-gray-500 truncate flex-1">
                ${escapeHtml(op.clientes?.nombre || "Sin cliente")}
              </p>
              ${urlWa ? `
                <a href="${urlWa}" target="_blank" rel="noopener noreferrer" class="btn-wa flex items-center justify-center text-emerald-600 hover:text-emerald-700 p-1 rounded hover:bg-emerald-50 transition-colors" title="Contactar por WhatsApp (${escapeHtml(tel)})">
                  <svg class="h-4 w-4 fill-current" viewBox="0 0 24 24"><path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0 0 12.04 2m.01 1.67c2.2 0 4.26.86 5.82 2.42a8.225 8.225 0 0 1 2.41 5.83c0 4.54-3.7 8.24-8.24 8.24-1.48 0-2.93-.4-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.196 8.196 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.24-8.24m4.52 11.64c-.25-.13-1.47-.72-1.7-.81-.23-.08-.39-.12-.56.13-.17.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.13-1.06-.39-2.03-1.25-.75-.67-1.26-1.5-1.41-1.75-.15-.25-.02-.39.11-.51.11-.11.25-.29.37-.43.12-.15.17-.25.25-.42.08-.17.04-.31-.02-.44-.06-.12-.56-1.34-.76-1.84-.2-.49-.4-.42-.56-.43h-.47c-.17 0-.44.06-.67.31-.23.25-.88.86-.88 2.1 0 1.23.9 2.43 1.02 2.6.13.16 1.77 2.7 4.29 3.79.6.26 1.07.41 1.44.53.6.19 1.15.17 1.58.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.15-1.18-.06-.12-.22-.19-.47-.32"/></svg>
                </a>` : ""}
            </div>

            <div class="mt-3 flex items-baseline justify-between border-t border-gray-100 pt-2">
              <span class="text-xs font-bold text-gray-900">${formatoMoneda(op.valor_estimado)}</span>
              <span class="text-[10px] font-semibold ${op.probabilidad >= 70 ? 'text-emerald-600' : 'text-gray-500'}">
                ${op.probabilidad || 20}% prob.
              </span>
            </div>

            <div class="mt-2.5 flex items-center justify-between text-[11px] text-gray-400 pt-1">
              <span class="flex items-center gap-1 text-[10px]">
                <span class="material-symbols-outlined text-[13px]">calendar_today</span>
                ${op.fecha_cierre_estimada ? formatoFecha(op.fecha_cierre_estimada) : `${diasCreado}d`}
              </span>
              <div class="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-primary text-[10px] font-bold" title="${escapeHtml(respNombre)}">
                ${inicial}
              </div>
            </div>
          </div>`;
        })
        .join("");
    });
  }

  // 8. Render Vista Lista (Agrupada por Secciones estilo Asana)
  function renderLista(filtradas) {
    const contenedor = document.getElementById("lista-secciones");
    if (!contenedor) return;

    contenedor.innerHTML = Object.entries(ETAPAS)
      .map(([etapaKey, etapaInfo]) => {
        const opsEtapa = filtradas.filter((o) => o.etapa === etapaKey);
        const subtotal = opsEtapa.reduce((acc, cur) => acc + Number(cur.valor_estimado || 0), 0);

        return `
        <div class="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
          <div class="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
            <div class="flex items-center gap-2">
              <span class="h-2.5 w-2.5 rounded-full ${etapaInfo.color}"></span>
              <h3 class="text-xs font-bold uppercase tracking-wider text-gray-800">${etapaInfo.label}</h3>
              <span class="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-gray-600 border border-gray-200">${opsEtapa.length}</span>
            </div>
            <div class="flex items-center gap-4">
              <span class="text-xs font-bold text-gray-700">${formatoMoneda(subtotal)}</span>
              <button type="button" data-add-etapa="${etapaKey}" class="btn-col-add text-xs font-semibold text-primary hover:underline flex items-center gap-1">
                <span class="material-symbols-outlined text-[14px]">add</span> Añadir
              </button>
            </div>
          </div>

          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs">
              <thead class="bg-gray-50/50 text-[10px] uppercase text-gray-400 border-b border-gray-100">
                <tr>
                  <th class="px-4 py-2.5">Oportunidad</th>
                  <th class="px-4 py-2.5">Cliente</th>
                  <th class="px-4 py-2.5">Servicio</th>
                  <th class="px-4 py-2.5">Valor Oferta</th>
                  <th class="px-4 py-2.5">Probabilidad</th>
                  <th class="px-4 py-2.5">Responsable</th>
                  <th class="px-4 py-2.5">Fecha Cierre</th>
                  <th class="px-4 py-2.5 text-right"></th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-50">
                ${
                  opsEtapa.length === 0
                    ? `<tr><td colspan="8" class="px-4 py-6 text-center text-gray-400">No hay oportunidades en esta sección.</td></tr>`
                    : opsEtapa
                        .map((op) => {
                          const srv = SERVICIOS[op.tipo_servicio] || SERVICIOS.otro;
                          const fechaReferencia = new Date(op.updated_at || op.created_at);
                          const diasSinCambio = Math.floor((new Date() - fechaReferencia) / (1000 * 60 * 60 * 24));
                          const esEstancada = ["visita", "cotizacion", "negociacion"].includes(op.etapa) && diasSinCambio >= 5;
                          const tel = op.contacto_telefono || "";
                          const urlWa = obtenerUrlWhatsApp(tel, op.titulo);

                          return `
                        <tr class="hover:bg-gray-50/80 cursor-pointer transition-colors" data-id="${op.id}">
                          <td class="px-4 py-3 font-bold text-gray-900">
                            <div class="flex items-center gap-1.5">
                              <span>${escapeHtml(op.titulo)}</span>
                              ${esEstancada ? `
                                <span class="rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-[9px] font-bold" title="Sin actualización hace ${diasSinCambio} días">
                                  ⚠️ Inactiva ${diasSinCambio}d
                                </span>` : ""}
                            </div>
                          </td>
                          <td class="px-4 py-3 text-gray-600">
                            <div class="flex items-center gap-2">
                              <span>${escapeHtml(op.clientes?.nombre || "—")}</span>
                              ${urlWa ? `
                                <a href="${urlWa}" target="_blank" rel="noopener noreferrer" class="btn-wa text-emerald-600 hover:text-emerald-700" title="Contactar por WhatsApp (${escapeHtml(tel)})">
                                  <svg class="h-3.5 w-3.5 fill-current inline" viewBox="0 0 24 24"><path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0 0 12.04 2m.01 1.67c2.2 0 4.26.86 5.82 2.42a8.225 8.225 0 0 1 2.41 5.83c0 4.54-3.7 8.24-8.24 8.24-1.48 0-2.93-.4-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.196 8.196 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.24-8.24m4.52 11.64c-.25-.13-1.47-.72-1.7-.81-.23-.08-.39-.12-.56.13-.17.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.13-1.06-.39-2.03-1.25-.75-.67-1.26-1.5-1.41-1.75-.15-.25-.02-.39.11-.51.11-.11.25-.29.37-.43.12-.15.17-.25.25-.42.08-.17.04-.31-.02-.44-.06-.12-.56-1.34-.76-1.84-.2-.49-.4-.42-.56-.43h-.47c-.17 0-.44.06-.67.31-.23.25-.88.86-.88 2.1 0 1.23.9 2.43 1.02 2.6.13.16 1.77 2.7 4.29 3.79.6.26 1.07.41 1.44.53.6.19 1.15.17 1.58.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.15-1.18-.06-.12-.22-.19-.47-.32"/></svg>
                                </a>` : ""}
                            </div>
                          </td>
                          <td class="px-4 py-3">
                            <span class="rounded-md border px-2 py-0.5 text-[10px] font-semibold ${srv.badge}">${srv.label}</span>
                          </td>
                          <td class="px-4 py-3 font-bold text-gray-900">${formatoMoneda(op.valor_estimado)}</td>
                          <td class="px-4 py-3 font-semibold text-gray-600">${op.probabilidad || 20}%</td>
                          <td class="px-4 py-3 text-gray-600">${escapeHtml(op.profiles?.nombre_completo || "—")}</td>
                          <td class="px-4 py-3 text-gray-500">${formatoFecha(op.fecha_cierre_estimada)}</td>
                          <td class="px-4 py-3 text-right">
                            <span class="text-primary font-semibold hover:underline">Ver detalle →</span>
                          </td>
                        </tr>`;
                        })
                        .join("")
                }
              </tbody>
            </table>
          </div>
        </div>`;
      })
      .join("");
  }

  // 9. Abrir Slide-over Drawer (Panel Lateral Derecho estilo Asana)
  async function abrirDrawer(id) {
    const op = oportunidades.find((o) => o.id === id);
    if (!op) return;
    oportunidadActual = op;

    // Rellenar campos del formulario
    document.getElementById("drawer-titulo").value = op.titulo || "";
    document.getElementById("drawer-etapa").value = op.etapa || "prospecto";
    document.getElementById("drawer-cliente").value = op.cliente_id || "";
    document.getElementById("drawer-contacto").value = op.contacto_nombre || op.contacto_id || "";
    document.getElementById("drawer-telefono").value = op.contacto_telefono || "";
    document.getElementById("drawer-responsable").value = op.responsable_id || "";
    document.getElementById("drawer-servicio").value = op.tipo_servicio || "cctv";
    document.getElementById("drawer-prioridad").value = op.prioridad || "media";
    document.getElementById("drawer-fecha").value = op.fecha_cierre_estimada || "";
    document.getElementById("drawer-descripcion").value = op.descripcion || "";
    document.getElementById("drawer-motivo-perdida").value = op.motivo_perdida || "";

    establecerValorMoneda(document.getElementById("drawer-valor"), op.valor_estimado || 0);
    establecerValorMoneda(document.getElementById("drawer-costo"), op.costo_estimado || 0);

    const prob = op.probabilidad || 20;
    document.getElementById("drawer-probabilidad").value = prob;
    document.getElementById("drawer-probabilidad-badge").textContent = `${prob}%`;

    actualizarMargenLabel();
    actualizarEstadoBanners(op);

    // Cargar historial de actividades
    await cargarActividades(op.id);

    // Mostrar Drawer con animación
    const drawer = document.getElementById("drawer-panel");
    const backdrop = document.getElementById("drawer-backdrop");
    backdrop.classList.remove("hidden");
    setTimeout(() => {
      drawer.classList.remove("translate-x-full");
    }, 10);
  }

  function cerrarDrawer() {
    const drawer = document.getElementById("drawer-panel");
    const backdrop = document.getElementById("drawer-backdrop");
    drawer.classList.add("translate-x-full");
    setTimeout(() => {
      backdrop.classList.add("hidden");
      oportunidadActual = null;
    }, 200);
  }

  function actualizarMargenLabel() {
    const valor = valorMoneda(document.getElementById("drawer-valor"));
    const costo = valorMoneda(document.getElementById("drawer-costo"));
    const label = document.getElementById("drawer-margen-label");

    if (valor > 0 && costo > 0) {
      const margen = Math.round(((valor - costo) / valor) * 100);
      label.textContent = `Margen proyectado: ${margen}% (Ganancia: ${formatoMoneda(valor - costo)})`;
      label.className = margen >= 30 ? "text-[10px] text-emerald-600 font-bold mt-0.5" : "text-[10px] text-amber-600 font-bold mt-0.5";
    } else {
      label.textContent = "Margen proyectado: —";
      label.className = "text-[10px] text-gray-400 mt-0.5";
    }
  }

  function actualizarEstadoBanners(op) {
    const bannerGanada = document.getElementById("drawer-banner-ganada");
    const contPerdida = document.getElementById("drawer-contenedor-perdida");
    const btnConvertir = document.getElementById("btn-convertir-proyecto");
    const infoProyecto = document.getElementById("drawer-proyecto-info");

    if (op.etapa === "ganada") {
      bannerGanada.classList.remove("hidden");
      if (op.proyecto_id) {
        btnConvertir.classList.add("hidden");
        infoProyecto.innerHTML = `
          ✅ <strong>Proyecto creado:</strong> Ya está en ejecución como 
          <a href="proyecto-detalle.html?id=${op.proyecto_id}" class="underline font-bold text-emerald-900">
            ${escapeHtml(op.proyectos?.nombre || "Ver Proyecto")} →
          </a>`;
      } else {
        btnConvertir.classList.remove("hidden");
        infoProyecto.textContent = "Esta cotización ha sido adjudicada. Puedes pasarla a ejecución operativa en el módulo de Proyectos con un solo clic.";
      }
    } else {
      bannerGanada.classList.add("hidden");
    }

    if (op.etapa === "perdida") {
      contPerdida.classList.remove("hidden");
    } else {
      contPerdida.classList.add("hidden");
    }
  }

  // 10. Cargar y registrar actividades (Bitácora Asana)
  async function cargarActividades(oportunidadId) {
    const feed = document.getElementById("drawer-actividades-feed");
    feed.innerHTML = '<p class="text-xs text-gray-400 text-center py-2">Cargando bitácora…</p>';

    const { data, error } = await window.sb
      .from("crm_actividades")
      .select("*, profiles:creado_por(nombre_completo)")
      .eq("oportunidad_id", oportunidadId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      feed.innerHTML = '<p class="text-xs text-rose-500 text-center">Error al cargar bitácora</p>';
      return;
    }

    if (!data || data.length === 0) {
      feed.innerHTML = '<p class="text-xs text-gray-400 text-center py-2">Sin notas o seguimientos registrados aún.</p>';
      return;
    }

    feed.innerHTML = data
      .map((act) => {
        const icono = ICONOS_ACTIVIDAD[act.tipo] || "event_note";
        const autor = act.profiles?.nombre_completo || "Usuario";
        return `
        <div class="flex items-start gap-3 rounded-lg border border-gray-100 bg-white p-3 shadow-sm text-xs">
          <div class="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary flex-shrink-0">
            <span class="material-symbols-outlined text-[16px]">${icono}</span>
          </div>
          <div class="flex-1 space-y-1">
            <div class="flex items-center justify-between">
              <span class="font-bold text-gray-800">${escapeHtml(act.titulo)}</span>
              <span class="text-[10px] text-gray-400">${formatoFecha(act.created_at)}</span>
            </div>
            ${act.descripcion ? `<p class="text-gray-600 text-[11px] whitespace-pre-line leading-relaxed">${escapeHtml(act.descripcion)}</p>` : ""}
            <p class="text-[10px] text-gray-400">Por ${escapeHtml(autor)}</p>
          </div>
        </div>`;
      })
      .join("");
  }

  async function agregarActividad() {
    if (!oportunidadActual) return;
    const tipo = document.getElementById("actividad-tipo").value;
    const titulo = document.getElementById("actividad-titulo").value.trim();
    const descripcion = document.getElementById("actividad-descripcion").value.trim();

    if (!titulo) {
      mostrarAviso("Escribe un título breve para la actividad", "error");
      return;
    }

    const btn = document.getElementById("btn-agregar-actividad");
    const textoOrig = btn ? btn.textContent : "";
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Registrando...";
    }

    try {
      const { error } = await window.sb.from("crm_actividades").insert({
        oportunidad_id: oportunidadActual.id,
        tipo,
        titulo,
        descripcion: descripcion || null,
        creado_por: usuarioActualId || null,
      });

      if (error) throw error;

      document.getElementById("actividad-titulo").value = "";
      document.getElementById("actividad-descripcion").value = "";
      mostrarAviso("Actividad registrada", "exito");
      cargarActividades(oportunidadActual.id);
    } catch (err) {
      manejarError(err, "No se pudo registrar la actividad");
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = textoOrig;
      }
    }
  }

  // 11. Guardar Cambios en la Oportunidad
  async function guardarOportunidad() {
    if (!oportunidadActual) return;

    const titulo = document.getElementById("drawer-titulo").value.trim();
    if (!titulo) return mostrarAviso("El título no puede estar vacío", "error");

    const btn = document.getElementById("btn-drawer-guardar");
    const textoOrig = btn ? btn.textContent : "";
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Guardando...";
    }

    try {
      const etapa = document.getElementById("drawer-etapa").value;
      const cliente_id = document.getElementById("drawer-cliente").value || null;
      const contactoRaw = document.getElementById("drawer-contacto").value.trim();
      const contacto_telefono = document.getElementById("drawer-telefono")?.value.trim() || null;
      const responsable_id = document.getElementById("drawer-responsable").value || null;
      const tipo_servicio = document.getElementById("drawer-servicio").value;
      const prioridad = document.getElementById("drawer-prioridad").value;
      const fecha_cierre_estimada = document.getElementById("drawer-fecha").value || null;
      const descripcion = document.getElementById("drawer-descripcion").value.trim() || null;
      const motivo_perdida = document.getElementById("drawer-motivo-perdida").value.trim() || null;
      const valor_estimado = valorMoneda(document.getElementById("drawer-valor"));
      const costo_estimado = valorMoneda(document.getElementById("drawer-costo"));
      const probabilidad = Number(document.getElementById("drawer-probabilidad").value);

      const esUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(contactoRaw);
      const contacto_id = esUuid ? contactoRaw : null;
      const contacto_nombre = esUuid ? null : (contactoRaw || null);

      const { error } = await window.sb
        .from("crm_oportunidades")
        .update({
          titulo,
          etapa,
          cliente_id,
          contacto_id,
          contacto_nombre,
          contacto_telefono,
          responsable_id,
          tipo_servicio,
          prioridad,
          fecha_cierre_estimada,
          descripcion,
          motivo_perdida,
          valor_estimado,
          costo_estimado,
          probabilidad,
          updated_at: new Date().toISOString(),
        })
        .eq("id", oportunidadActual.id);

      if (error) throw error;

      mostrarAviso("Oportunidad actualizada con éxito", "exito");
      cerrarDrawer();
      cargarDatos();
    } catch (err) {
      manejarError(err, "No se pudo guardar la oportunidad");
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = textoOrig;
      }
    }
  }

  // 12. Convertir en Proyecto Operativo (1 clic)
  async function convertirEnProyecto() {
    if (!oportunidadActual) return;

    const op = oportunidadActual;
    const confirmar = confirm(
      `¿Deseas crear un nuevo Proyecto en ejecución para "${op.titulo}" por valor de ${formatoMoneda(op.valor_estimado)}?`
    );
    if (!confirmar) return;

    const btn = document.getElementById("btn-convertir-proyecto");
    const textoOrig = btn ? btn.textContent : "";
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Creando proyecto...";
    }

    try {
      // 1. Insertar el proyecto operativo (NO enviar valor_total: es columna GENERATED)
      const { data: nuevoProyecto, error: errProy } = await window.sb
        .from("proyectos")
        .insert({
          nombre: op.titulo,
          cliente_id: op.cliente_id,
          empresa_id: op.empresa_id || null,
          valor_antes_impuestos: op.costo_estimado || op.valor_estimado || 0,
          estado: "sin_iniciar",
          fecha_inicio: new Date().toISOString().slice(0, 10),
          fecha_fin_estimada: op.fecha_cierre_estimada || null,
          created_by: usuarioActualId || null,
          tipo_contrato: "aiu",
        })
        .select()
        .single();

      if (errProy) throw errProy;

      // 2. Asociar el proyecto creado a la oportunidad
      await window.sb
        .from("crm_oportunidades")
        .update({
          proyecto_id: nuevoProyecto.id,
          etapa: "ganada",
          probabilidad: 100,
          updated_at: new Date().toISOString(),
        })
        .eq("id", op.id);

      // 3. Registrar actividad en la bitácora
      await window.sb.from("crm_actividades").insert({
        oportunidad_id: op.id,
        tipo: "tarea",
        titulo: "🚀 Convertida en Proyecto Operativo",
        descripcion: `Se inició el proyecto en la plataforma con ID: ${nuevoProyecto.id}. Listo para carga de cotización y ejecución.`,
        creado_por: usuarioActualId || null,
      });

      mostrarAviso("¡Proyecto creado exitosamente!", "exito");
      cerrarDrawer();
      await cargarDatos();

      // Preguntar si desea ir al proyecto
      if (confirm("¡Oportunidad convertida con éxito! ¿Deseas abrir la ficha del Proyecto ahora?")) {
        window.location.href = `proyecto-detalle.html?id=${nuevoProyecto.id}`;
      }
    } catch (err) {
      manejarError(err, "Error al convertir la oportunidad en proyecto");
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = textoOrig;
      }
    }
  }

  // 13. Eliminar oportunidad
  async function eliminarOportunidad() {
    if (!oportunidadActual) return;
    if (!confirm(`¿Eliminar definitivamente la oportunidad "${oportunidadActual.titulo}"?`)) return;

    const { error } = await window.sb.from("crm_oportunidades").delete().eq("id", oportunidadActual.id);
    if (error) return manejarError(error, "No se pudo eliminar");

    mostrarAviso("Oportunidad eliminada", "info");
    cerrarDrawer();
    cargarDatos();
  }

  // Manejador Drag & Drop para cambiar etapa
  let arrastrandoId = null;

  async function cambiarEtapaOportunidad(id, nuevaEtapa) {
    const op = oportunidades.find((o) => o.id === id);
    if (!op || op.etapa === nuevaEtapa) return;

    const etapaAnterior = op.etapa;
    const etapaNombre = ETAPAS[nuevaEtapa]?.label || nuevaEtapa;

    // Actualización optimista en memoria
    op.etapa = nuevaEtapa;
    op.updated_at = new Date().toISOString();
    if (nuevaEtapa === "ganada") op.probabilidad = 100;
    else if (nuevaEtapa === "perdida") op.probabilidad = 0;
    else if (nuevaEtapa === "cotizacion" && op.probabilidad < 50) op.probabilidad = 50;
    else if (nuevaEtapa === "negociacion" && op.probabilidad < 70) op.probabilidad = 70;

    actualizarKPIs();
    render();

    try {
      const updateData = {
        etapa: nuevaEtapa,
        probabilidad: op.probabilidad,
        updated_at: op.updated_at,
      };

      const { error: errUpdate } = await window.sb
        .from("crm_oportunidades")
        .update(updateData)
        .eq("id", id);

      if (errUpdate) throw errUpdate;

      // Registrar actividad automática en bitácora
      await window.sb.from("crm_actividades").insert({
        oportunidad_id: id,
        tipo: "tarea",
        titulo: `Etapa cambiada a ${etapaNombre}`,
        descripcion: `Movida desde "${ETAPAS[etapaAnterior]?.label || etapaAnterior}"`,
        creado_por: usuarioActualId || null,
      });

      mostrarAviso(`Oportunidad movida a ${etapaNombre}`, "exito");
    } catch (err) {
      // Revertir en memoria
      op.etapa = etapaAnterior;
      actualizarKPIs();
      render();
      manejarError(err, "No se pudo actualizar la etapa de la oportunidad");
    }
  }

  // 14. Eventos de la Interfaz
  function bindEventos() {
    activarCamposMoneda();

    // Alternar vistas Tablero / Lista
    const btnTablero = document.getElementById("btn-vista-tablero");
    const btnLista = document.getElementById("btn-vista-lista");

    btnTablero?.addEventListener("click", () => {
      vistaActual = "tablero";
      localStorage.setItem("pctronic_crm_vista", "tablero");
      btnTablero.className = "flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold bg-primary text-white transition-colors";
      btnLista.className = "flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold text-gray-600 hover:text-gray-900 transition-colors";
      render();
    });

    btnLista?.addEventListener("click", () => {
      vistaActual = "lista";
      localStorage.setItem("pctronic_crm_vista", "lista");
      btnLista.className = "flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold bg-primary text-white transition-colors";
      btnTablero.className = "flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold text-gray-600 hover:text-gray-900 transition-colors";
      render();
    });

    // Filtros
    document.getElementById("filtro-busqueda")?.addEventListener("input", render);
    document.getElementById("filtro-servicio")?.addEventListener("change", render);
    document.getElementById("filtro-responsable")?.addEventListener("change", render);

    // Eventos Drag & Drop en el tablero Kanban
    const vistaTablero = document.getElementById("vista-tablero");

    vistaTablero?.addEventListener("dragstart", (e) => {
      const card = e.target.closest(".card-oportunidad");
      if (!card) return;
      arrastrandoId = card.dataset.id;
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", arrastrandoId);
      card.classList.add("opacity-50", "rotate-1");
    });

    vistaTablero?.addEventListener("dragend", (e) => {
      const card = e.target.closest(".card-oportunidad");
      if (card) card.classList.remove("opacity-50", "rotate-1");
      arrastrandoId = null;
      document.querySelectorAll(".kanban-col").forEach((col) => {
        col.classList.remove("ring-2", "ring-primary", "bg-blue-50/60");
      });
    });

    vistaTablero?.addEventListener("dragover", (e) => {
      const col = e.target.closest(".kanban-col");
      if (col) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        col.classList.add("ring-2", "ring-primary", "bg-blue-50/60");
      }
    });

    vistaTablero?.addEventListener("dragleave", (e) => {
      const col = e.target.closest(".kanban-col");
      if (col && !col.contains(e.relatedTarget)) {
        col.classList.remove("ring-2", "ring-primary", "bg-blue-50/60");
      }
    });

    vistaTablero?.addEventListener("drop", (e) => {
      const col = e.target.closest(".kanban-col");
      if (!col) return;
      e.preventDefault();
      col.classList.remove("ring-2", "ring-primary", "bg-blue-50/60");

      const id = e.dataTransfer.getData("text/plain") || arrastrandoId;
      const nuevaEtapa = col.dataset.etapa;
      if (id && nuevaEtapa) {
        cambiarEtapaOportunidad(id, nuevaEtapa);
      }
    });

    // Click en tarjetas o filas de lista para abrir Drawer
    document.addEventListener("click", (e) => {
      const card = e.target.closest("[data-id]");
      if (card && !e.target.closest("button") && !e.target.closest("a") && !e.target.closest("#drawer-panel")) {
        abrirDrawer(card.dataset.id);
      }
    });

    // Botones "+ Añadir oportunidad" en columnas
    document.addEventListener("click", (e) => {
      const btnAdd = e.target.closest("[data-add-etapa]");
      if (btnAdd) {
        const etapa = btnAdd.dataset.addEtapa;
        const selEtapa = document.getElementById("nuevo-etapa");
        if (selEtapa) selEtapa.value = etapa;
        document.getElementById("modal-nuevo")?.classList.remove("hidden");
      }
    });

    // Controles del Drawer
    document.getElementById("btn-drawer-cerrar")?.addEventListener("click", cerrarDrawer);
    document.getElementById("btn-drawer-cancelar")?.addEventListener("click", cerrarDrawer);
    document.getElementById("drawer-backdrop")?.addEventListener("click", cerrarDrawer);
    document.getElementById("btn-drawer-guardar")?.addEventListener("click", guardarOportunidad);
    document.getElementById("btn-drawer-eliminar")?.addEventListener("click", eliminarOportunidad);
    document.getElementById("btn-convertir-proyecto")?.addEventListener("click", convertirEnProyecto);

    // Botones rápidos Ganada / Perdida en Drawer
    document.getElementById("btn-drawer-ganada")?.addEventListener("click", () => {
      document.getElementById("drawer-etapa").value = "ganada";
      document.getElementById("drawer-probabilidad").value = 100;
      document.getElementById("drawer-probabilidad-badge").textContent = "100%";
      actualizarEstadoBanners({ etapa: "ganada", proyecto_id: oportunidadActual?.proyecto_id });
    });

    document.getElementById("btn-drawer-perdida")?.addEventListener("click", () => {
      document.getElementById("drawer-etapa").value = "perdida";
      document.getElementById("drawer-probabilidad").value = 0;
      document.getElementById("drawer-probabilidad-badge").textContent = "0%";
      actualizarEstadoBanners({ etapa: "perdida" });
    });

    document.getElementById("drawer-etapa")?.addEventListener("change", (e) => {
      actualizarEstadoBanners({ etapa: e.target.value, proyecto_id: oportunidadActual?.proyecto_id });
    });

    document.getElementById("drawer-valor")?.addEventListener("input", actualizarMargenLabel);
    document.getElementById("drawer-costo")?.addEventListener("input", actualizarMargenLabel);

    document.getElementById("drawer-probabilidad")?.addEventListener("input", (e) => {
      document.getElementById("drawer-probabilidad-badge").textContent = `${e.target.value}%`;
    });

    // Registrar actividad en bitácora
    document.getElementById("btn-agregar-actividad")?.addEventListener("click", agregarActividad);

    // Botón Plantilla Levantamiento CCTV
    document.getElementById("btn-plantilla-cctv")?.addEventListener("click", () => {
      const descEl = document.getElementById("actividad-descripcion");
      const tipoEl = document.getElementById("actividad-tipo");
      const tituloEl = document.getElementById("actividad-titulo");
      if (tipoEl) tipoEl.value = "visita";
      if (tituloEl && !tituloEl.value.trim()) tituloEl.value = "Levantamiento técnico en sitio";
      const plantilla = `• Cámaras interiores: \n• Cámaras exteriores: \n• Tubería EMT/PVC estimada (m): \n• Cable UTP estimado (m): \n• Switch PoE / Rack / UPS: \n• Obra civil / Altura especial: `;
      if (descEl) {
        descEl.value = descEl.value ? `${descEl.value}\n\n${plantilla}` : plantilla;
        descEl.focus();
      }
    });

    // Modal Crear Oportunidad
    const modalNuevo = document.getElementById("modal-nuevo");
    document.getElementById("btn-nueva-oportunidad")?.addEventListener("click", () => {
      document.getElementById("form-nuevo")?.reset();
      modalNuevo?.classList.remove("hidden");
    });
    document.getElementById("btn-modal-nuevo-cerrar")?.addEventListener("click", () => {
      modalNuevo?.classList.add("hidden");
    });
    document.getElementById("btn-modal-nuevo-cancelar")?.addEventListener("click", () => {
      modalNuevo?.classList.add("hidden");
    });

    document.getElementById("form-nuevo")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const submitBtn = e.target.querySelector('button[type="submit"]');
      const textoOrig = submitBtn ? submitBtn.textContent : "";
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Creando oportunidad...";
      }

      try {
        const titulo = document.getElementById("nuevo-titulo").value.trim();
        const cliente_id = document.getElementById("nuevo-cliente").value;
        const contacto_nombre = document.getElementById("nuevo-contacto")?.value.trim() || null;
        const contacto_telefono = document.getElementById("crear-op-telefono")?.value.trim() || null;
        const etapa = document.getElementById("nuevo-etapa").value;
        const tipo_servicio = document.getElementById("nuevo-servicio").value;
        const valor_estimado = valorMoneda(document.getElementById("nuevo-valor"));
        const responsable_id = document.getElementById("nuevo-responsable").value || usuarioActualId || null;
        const fecha_cierre_estimada = document.getElementById("nuevo-fecha").value || null;

        const { data, error } = await window.sb
          .from("crm_oportunidades")
          .insert({
            titulo,
            cliente_id,
            contacto_nombre,
            contacto_telefono,
            etapa,
            tipo_servicio,
            valor_estimado,
            responsable_id,
            fecha_cierre_estimada,
            probabilidad: etapa === "cotizacion" ? 50 : etapa === "negociacion" ? 70 : 20,
          })
          .select()
          .single();

        if (error) throw error;

        modalNuevo.classList.add("hidden");
        mostrarAviso("Oportunidad creada exitosamente", "exito");
        await cargarDatos();
        if (data?.id) abrirDrawer(data.id);
      } catch (err) {
        manejarError(err, "No se pudo crear la oportunidad");
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = textoOrig;
        }
      }
    });
  }

  // Inicialización
  bindEventos();
  await cargarDatos();
})();
