document.addEventListener("DOMContentLoaded", async () => {
  const { session, profile } = await window.pctronicReady;
  const esSuper = typeof normalizarRol === "function"
    ? normalizarRol(profile?.rol) === "super_usuario"
    : profile?.rol === "super_usuario" || profile?.rol === "admin";

  if (!esSuper) {
    const main = document.querySelector("main");
    if (main) {
      main.innerHTML = `
        <div class="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-500">
          Solo un Super Usuario puede ver y administrar las anotaciones de la plataforma.
        </div>`;
    }
    return;
  }

  const TIPO_BADGES = {
    mejora: { label: "Mejora", clase: "bg-blue-100 text-blue-800" },
    comentario: { label: "Comentario", clase: "bg-gray-100 text-gray-700" },
    error: { label: "Error", clase: "bg-red-100 text-red-800" },
  };

  const PRIORIDAD_BADGES = {
    alta: { label: "Alta", clase: "bg-red-100 text-red-800" },
    media: { label: "Media", clase: "bg-amber-100 text-amber-800" },
    baja: { label: "Baja", clase: "bg-gray-100 text-gray-700" },
  };

  const ESTADO_OPCIONES = [
    { value: "nuevo", label: "Nuevo", clase: "bg-blue-100 text-blue-800" },
    { value: "en_revision", label: "En revisión", clase: "bg-amber-100 text-amber-800" },
    { value: "resuelto", label: "Resuelto", clase: "bg-green-100 text-green-800" },
    { value: "descartado", label: "Descartado", clase: "bg-gray-200 text-gray-700" },
  ];

  const estadoMap = Object.fromEntries(ESTADO_OPCIONES.map((e) => [e.value, e]));

  let registros = [];

  const listaEl = document.getElementById("lista-feedback");
  const filtroBusqueda = document.getElementById("filtro-busqueda");
  const filtroEstado = document.getElementById("filtro-estado");
  const filtroTipo = document.getElementById("filtro-tipo");
  const filtroPrioridad = document.getElementById("filtro-prioridad");
  const btnCopiar = document.getElementById("btn-copiar-enlace");
  const btnActualizar = document.getElementById("btn-actualizar-feedback");

  function actualizarKpis() {
    const total = registros.length;
    const nuevos = registros.filter((r) => r.estado === "nuevo").length;
    const revision = registros.filter((r) => r.estado === "en_revision").length;
    const resueltos = registros.filter((r) => r.estado === "resuelto").length;

    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = String(val);
    };
    setVal("kpi-total", total);
    setVal("kpi-nuevos", nuevos);
    setVal("kpi-revision", revision);
    setVal("kpi-resueltos", resueltos);
  }

  function renderLista() {
    if (!listaEl) return;
    const q = (filtroBusqueda?.value || "").trim().toLowerCase();
    const est = filtroEstado?.value || "";
    const tip = filtroTipo?.value || "";
    const pri = filtroPrioridad?.value || "";

    const filtrados = registros.filter((r) => {
      if (est && r.estado !== est) return false;
      if (tip && r.tipo !== tip) return false;
      if (pri && r.prioridad !== pri) return false;
      if (q) {
        const texto = [
          r.titulo,
          r.mensaje,
          r.usuario_nombre,
          r.usuario_email,
          r.pagina,
          r.notas_admin,
        ]
          .join(" ")
          .toLowerCase();
        if (!texto.includes(q)) return false;
      }
      return true;
    });

    if (!filtrados.length) {
      listaEl.innerHTML = `
        <div class="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
          No hay anotaciones que coincidan con los filtros seleccionados.
        </div>`;
      return;
    }

    listaEl.innerHTML = filtrados
      .map((item) => {
        const tipoCfg = TIPO_BADGES[item.tipo] || TIPO_BADGES.comentario;
        const prioCfg = PRIORIDAD_BADGES[item.prioridad] || PRIORIDAD_BADGES.media;
        const estCfg = estadoMap[item.estado] || ESTADO_OPCIONES[0];
        const autor = item.usuario_nombre || item.usuario_email || "Usuario";
        const tituloHtml = item.titulo
          ? `<h3 class="text-sm font-bold text-gray-900">${escapeHtml(item.titulo)}</h3>`
          : "";

        return `
        <article class="rounded-xl border border-gray-200 bg-white p-4 space-y-3" data-feedback-id="${escapeHtml(item.id)}">
          <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div class="space-y-1.5 min-w-0">
              <div class="flex flex-wrap items-center gap-1.5">
                <span class="rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${tipoCfg.clase}">${escapeHtml(tipoCfg.label)}</span>
                <span class="rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${prioCfg.clase}">Prioridad: ${escapeHtml(prioCfg.label)}</span>
                <span class="rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${estCfg.clase}">${escapeHtml(estCfg.label)}</span>
                ${item.pagina ? `<span class="rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-medium text-indigo-700">${escapeHtml(item.pagina)}</span>` : ""}
              </div>
              ${tituloHtml}
              <p class="text-xs text-gray-500">
                <strong class="text-gray-700">${escapeHtml(autor)}</strong>
                ${item.usuario_email && item.usuario_email !== autor ? `<span>(${escapeHtml(item.usuario_email)})</span>` : ""}
                ${item.usuario_rol ? ` · <span>${escapeHtml(item.usuario_rol)}</span>` : ""}
                · <span>${formatoFecha(item.created_at)}</span>
              </p>
            </div>

            <div class="flex items-center gap-2 shrink-0">
              <select class="feedback-estado-select rounded-lg border-gray-300 text-xs font-medium"
                aria-label="Estado de la anotación" data-id="${escapeHtml(item.id)}">
                ${ESTADO_OPCIONES.map(
                  (opt) => `<option value="${opt.value}" ${item.estado === opt.value ? "selected" : ""}>${opt.label}</option>`
                ).join("")}
              </select>
              <button type="button" class="feedback-delete-btn inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
                data-id="${escapeHtml(item.id)}" title="Eliminar anotación">
                <span class="material-symbols-outlined text-[16px]" aria-hidden="true">delete</span>
                <span>Eliminar</span>
              </button>
            </div>
          </div>

          <div class="rounded-lg bg-gray-50 border border-gray-100 p-3 text-sm text-gray-800 whitespace-pre-wrap break-words">${escapeHtml(item.mensaje)}</div>

          <div class="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div class="flex-1">
              <label class="block text-xs font-semibold text-gray-600 mb-1">Notas de administrador</label>
              <textarea rows="2" class="feedback-nota-input w-full rounded-lg border-gray-300 text-xs focus:border-primary focus:ring-primary"
                data-id="${escapeHtml(item.id)}" placeholder="Escribe seguimiento o decisión interna…">${escapeHtml(item.notas_admin || "")}</textarea>
            </div>
            <button type="button" class="feedback-save-note-btn inline-flex items-center justify-center gap-1 rounded-lg bg-gray-900 px-3 py-2 text-xs font-semibold text-white hover:bg-gray-800 shrink-0"
              data-id="${escapeHtml(item.id)}">
              <span class="material-symbols-outlined text-[16px]" aria-hidden="true">save</span>
              <span>Guardar nota</span>
            </button>
          </div>
        </article>`;
      })
      .join("");
  }

  async function cargarFeedback() {
    const { data, error } = await window.sb
      .from("feedback_plataforma")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) return manejarError(error, "No se pudieron cargar las anotaciones");
    registros = data || [];
    actualizarKpis();
    renderLista();
  }

  if (btnCopiar) {
    btnCopiar.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(window.location.href);
        mostrarAviso("Enlace copiado al portapapeles", "exito");
      } catch (e) {
        mostrarAviso("No se pudo copiar el enlace automáticamente", "error");
      }
    });
  }

  if (btnActualizar) {
    btnActualizar.addEventListener("click", cargarFeedback);
  }

  [filtroBusqueda, filtroEstado, filtroTipo, filtroPrioridad].forEach((el) => {
    if (!el) return;
    const evName = el.tagName === "INPUT" ? "input" : "change";
    el.addEventListener(evName, renderLista);
  });

  if (listaEl) {
    listaEl.addEventListener("change", async (ev) => {
      const sel = ev.target.closest(".feedback-estado-select");
      if (!sel) return;
      const id = sel.dataset.id;
      const nuevoEstado = sel.value;
      const { error } = await window.sb
        .from("feedback_plataforma")
        .update({ estado: nuevoEstado, revisado_por: session?.user?.id || null })
        .eq("id", id);
      if (error) {
        manejarError(error, "No se pudo actualizar el estado");
        cargarFeedback();
        return;
      }
      const item = registros.find((r) => r.id === id);
      if (item) item.estado = nuevoEstado;
      actualizarKpis();
      renderLista();
      mostrarAviso("Estado actualizado", "exito");
    });

    listaEl.addEventListener("click", async (ev) => {
      const saveBtn = ev.target.closest(".feedback-save-note-btn");
      if (saveBtn) {
        const id = saveBtn.dataset.id;
        const card = saveBtn.closest("[data-feedback-id]");
        const textarea = card ? card.querySelector(".feedback-nota-input") : null;
        const notas_admin = textarea ? textarea.value : "";

        saveBtn.disabled = true;
        try {
          const { error } = await window.sb
            .from("feedback_plataforma")
            .update({ notas_admin, revisado_por: session?.user?.id || null })
            .eq("id", id);
          if (error) return manejarError(error, "No se pudo guardar la nota");
          const item = registros.find((r) => r.id === id);
          if (item) item.notas_admin = notas_admin;
          mostrarAviso("Nota guardada", "exito");
        } finally {
          saveBtn.disabled = false;
        }
        return;
      }

      const delBtn = ev.target.closest(".feedback-delete-btn");
      if (delBtn) {
        const id = delBtn.dataset.id;
        if (!window.confirm("¿Eliminar esta anotación de forma permanente?")) return;
        delBtn.disabled = true;
        try {
          const { error } = await window.sb.from("feedback_plataforma").delete().eq("id", id);
          if (error) return manejarError(error, "No se pudo eliminar la anotación");
          registros = registros.filter((r) => r.id !== id);
          actualizarKpis();
          renderLista();
          mostrarAviso("Anotación eliminada", "exito");
        } finally {
          delBtn.disabled = false;
        }
      }
    });
  }

  cargarFeedback();
});
