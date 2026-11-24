(async () => {
  const { session, profile } = await window.pctronicReady;

  const esSuperUsuario = Boolean(window.PCT_ROL_INFO?.esSuperUsuario);
  const puedeReasignarCoordinador = Boolean(window.PCT_ROL_INFO?.puedeReasignarCoordinador);
  const puedeVerTodosProyectos = window.PCT_ROL_INFO?.puedeVerTodosProyectos !== false;

  // Crear proyectos es una acción exclusiva del super usuario (el enlace
  // viene oculto por defecto en el HTML; aquí solo se muestra si aplica).
  if (esSuperUsuario) {
    document.getElementById("link-nuevo-proyecto")?.classList.remove("hidden");
    document.getElementById("link-nuevo-proyecto")?.classList.add("flex");
  }

  const filtroCoordEl = document.getElementById("filtro-coordinador");
  const avisoCoordEl = document.getElementById("aviso-filtro-coordinador");

  if (puedeVerTodosProyectos && filtroCoordEl) {
    filtroCoordEl.classList.remove("hidden");
  }
  if (!puedeVerTodosProyectos && avisoCoordEl) {
    avisoCoordEl.textContent =
      "Mostrando los proyectos asignados a tu coordinación (y proyectos pendientes por asignar).";
    avisoCoordEl.classList.remove("hidden");
  }

  let proyectosCache = [];
  let usuariosCache = [];
  let tieneColsCoordinador = true;
  let proyectoAEliminar = null;
  let claveEsperada = "ELIMINAR";

  const normTexto = (s) =>
    String(s ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase();

  function nombreCoordinadorDe(p) {
    const porCol = String(p?.coordinador_nombre || "").trim();
    if (porCol) return porCol;
    if (p?.coordinador_id) {
      const u = usuariosCache.find((x) => x.id === p.coordinador_id);
      if (u?.nombre_completo) return u.nombre_completo.trim();
    }
    const dir = String(p?.director_proyecto || "").trim();
    return dir || "";
  }

  function idCoordinadorDe(p) {
    if (p?.coordinador_id) return p.coordinador_id;
    const nombre = normTexto(p?.coordinador_nombre || p?.director_proyecto);
    if (!nombre) return "";
    const u = usuariosCache.find((x) => normTexto(x.nombre_completo) === nombre);
    return u ? u.id : "";
  }

  function esProyectoVisibleParaUsuario(p) {
    if (puedeVerTodosProyectos) return true;
    const uid = session?.user?.id || "";
    const miNombre = normTexto(profile?.nombre_completo);
    const nombreCoord = normTexto(nombreCoordinadorDe(p));
    const sinAsignar = !p.coordinador_id && !nombreCoord;
    if (sinAsignar) return true;
    if (uid && p.coordinador_id === uid) return true;
    if (miNombre && nombreCoord && nombreCoord === miNombre) return true;
    return false;
  }

  function esErrorColumnaCoordinador(error) {
    const msg = `${error?.code || ""} ${error?.message || ""} ${error?.details || ""}`.toLowerCase();
    return msg.includes("coordinador_id") || msg.includes("coordinador_nombre") || msg.includes("42703") || msg.includes("pgrst204");
  }

  const modalEliminar = document.getElementById("modal-eliminar-proyecto");
  const inpConfirm = document.getElementById("del-proy-confirm-input");
  const btnConfirmEliminar = document.getElementById("btn-confirmar-eliminar-proy");

  function abrirModalEliminar(proy) {
    if (!esSuperUsuario || !proy || !modalEliminar) return;
    proyectoAEliminar = proy;
    const codigo = (proy.numero_contrato || proy.numero_cotizacion || "").trim();
    claveEsperada = codigo || "ELIMINAR";

    const nombreEl = document.getElementById("del-proy-nombre");
    const codigoEl = document.getElementById("del-proy-codigo");
    const claveEl = document.getElementById("del-proy-clave-esperada");
    if (nombreEl) nombreEl.textContent = proy.nombre || "Proyecto sin nombre";
    if (codigoEl) {
      codigoEl.textContent = codigo
        ? `Código / Referencia: ${codigo}${proy.clientes?.nombre ? " · " + proy.clientes.nombre : ""}`
        : proy.clientes?.nombre
          ? `Cliente: ${proy.clientes.nombre}`
          : "Sin código asignado";
    }
    if (claveEl) claveEl.textContent = claveEsperada;
    if (inpConfirm) {
      inpConfirm.value = "";
      inpConfirm.placeholder = `Escribe ${claveEsperada}`;
    }
    if (btnConfirmEliminar) btnConfirmEliminar.disabled = true;
    modalEliminar.classList.remove("hidden");
    setTimeout(() => inpConfirm?.focus(), 30);
  }

  function cerrarModalEliminar() {
    modalEliminar?.classList.add("hidden");
    proyectoAEliminar = null;
    if (inpConfirm) inpConfirm.value = "";
    if (btnConfirmEliminar) btnConfirmEliminar.disabled = true;
  }

  inpConfirm?.addEventListener("input", () => {
    const val = inpConfirm.value.trim().toUpperCase();
    const valido = val === claveEsperada.toUpperCase() || val === "ELIMINAR";
    if (btnConfirmEliminar) btnConfirmEliminar.disabled = !valido;
  });

  document.getElementById("btn-del-proy-cerrar")?.addEventListener("click", cerrarModalEliminar);
  document.getElementById("btn-del-proy-cancelar")?.addEventListener("click", cerrarModalEliminar);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modalEliminar && !modalEliminar.classList.contains("hidden")) {
      cerrarModalEliminar();
    }
  });

  btnConfirmEliminar?.addEventListener("click", async () => {
    if (!esSuperUsuario || !proyectoAEliminar) return;
    const val = (inpConfirm?.value || "").trim().toUpperCase();
    if (val !== claveEsperada.toUpperCase() && val !== "ELIMINAR") return;

    const textoOrig = btnConfirmEliminar.textContent;
    btnConfirmEliminar.disabled = true;
    btnConfirmEliminar.textContent = "Eliminando...";
    try {
      const { error } = await window.sb.from("proyectos").delete().eq("id", proyectoAEliminar.id);
      if (error) {
        manejarError(error, "No se pudo eliminar el proyecto");
        btnConfirmEliminar.disabled = false;
        btnConfirmEliminar.textContent = textoOrig;
        return;
      }
      const nombreEliminado = proyectoAEliminar.nombre;
      cerrarModalEliminar();
      mostrarAviso(`Proyecto "${nombreEliminado}" eliminado permanentemente.`, "exito");
      await cargar();
    } catch (err) {
      manejarError(err, "No se pudo eliminar el proyecto");
      btnConfirmEliminar.disabled = false;
      btnConfirmEliminar.textContent = textoOrig;
    } finally {
      btnConfirmEliminar.textContent = textoOrig;
    }
  });

  async function cargarUsuarios() {
    try {
      const { data, error } = await window.sb
        .from("profiles")
        .select("id, nombre_completo, rol")
        .order("nombre_completo", { ascending: true });
      if (!error && Array.isArray(data)) {
        usuariosCache = data.filter((u) => u && u.id);
      }
    } catch (e) {
      usuariosCache = [];
    }
  }

  function poblarFiltroCoordinador() {
    if (!filtroCoordEl || !puedeVerTodosProyectos) return;
    const valorPrevio = filtroCoordEl.value;
    const nombresUsuarios = new Set(usuariosCache.map((u) => normTexto(u.nombre_completo)).filter(Boolean));
    const nombresLegacy = new Set();
    proyectosCache.forEach((p) => {
      const nombre = nombreCoordinadorDe(p);
      if (nombre && !p.coordinador_id && !nombresUsuarios.has(normTexto(nombre))) {
        nombresLegacy.add(nombre);
      }
    });

    const opts = [
      `<option value="">Coordinador: Todos</option>`,
      `<option value="__sin_asignar__">Sin asignar</option>`,
      ...usuariosCache.map(
        (u) => `<option value="uid:${escapeHtml(u.id)}">${escapeHtml(u.nombre_completo || "Sin nombre")}</option>`
      ),
      ...[...nombresLegacy]
        .sort((a, b) => a.localeCompare(b, "es"))
        .map((nom) => `<option value="txt:${escapeHtml(normTexto(nom))}">${escapeHtml(nom)}</option>`),
    ];
    filtroCoordEl.innerHTML = opts.join("");
    if ([...filtroCoordEl.options].some((o) => o.value === valorPrevio)) {
      filtroCoordEl.value = valorPrevio;
    }
  }

  async function cargar() {
    await cargarUsuarios();

    let res = await window.sb
      .from("proyectos")
      .select(
        "id, nombre, numero_contrato, numero_cotizacion, estado, avance_porcentaje, valor_total, fecha_fin_estimada, director_proyecto, coordinador_id, coordinador_nombre, clientes(nombre)"
      )
      .order("created_at", { ascending: false });

    if (res.error && esErrorColumnaCoordinador(res.error)) {
      tieneColsCoordinador = false;
      res = await window.sb
        .from("proyectos")
        .select(
          "id, nombre, numero_contrato, numero_cotizacion, estado, avance_porcentaje, valor_total, fecha_fin_estimada, director_proyecto, clientes(nombre)"
        )
        .order("created_at", { ascending: false });
    }

    if (res.error) return manejarError(res.error, "No se pudieron cargar los proyectos");
    proyectosCache = res.data || [];
    poblarFiltroCoordinador();
    render();
  }

  async function reasignarCoordinador(proy, nuevoValor, selectEl) {
    if (!puedeReasignarCoordinador || !proy) return;
    if (nuevoValor === "__legacy__") return;

    const usuarioElegido = nuevoValor ? usuariosCache.find((u) => u.id === nuevoValor) : null;
    const nuevoId = usuarioElegido ? usuarioElegido.id : null;
    const nuevoNombre = usuarioElegido ? (usuarioElegido.nombre_completo || "").trim() || null : null;
    const prevId = proy.coordinador_id || null;
    const prevNombre = proy.coordinador_nombre || null;
    const prevDirector = proy.director_proyecto || null;

    if (selectEl) selectEl.disabled = true;
    try {
      let payload = tieneColsCoordinador
        ? {
            coordinador_id: nuevoId,
            coordinador_nombre: nuevoNombre,
            director_proyecto: nuevoNombre,
          }
        : { director_proyecto: nuevoNombre };

      let { error } = await window.sb.from("proyectos").update(payload).eq("id", proy.id);
      if (error && tieneColsCoordinador && esErrorColumnaCoordinador(error)) {
        tieneColsCoordinador = false;
        const retry = await window.sb
          .from("proyectos")
          .update({ director_proyecto: nuevoNombre })
          .eq("id", proy.id);
        error = retry.error;
      }

      if (error) {
        manejarError(error, "No se pudo reasignar el coordinador");
        render();
        return;
      }

      proy.coordinador_id = nuevoId;
      proy.coordinador_nombre = nuevoNombre;
      proy.director_proyecto = nuevoNombre;

      mostrarAviso(
        nuevoNombre
          ? `Coordinador de "${proy.nombre}" actualizado a ${nuevoNombre}.`
          : `Coordinador removido de "${proy.nombre}".`,
        "exito"
      );

      if (nuevoId && nuevoId !== prevId && nuevoId !== session?.user?.id && typeof window.PCT_NOTIFICAR === "function") {
        window.PCT_NOTIFICAR({
          tipo: "nuevo_proyecto",
          titulo: `Proyecto asignado: ${proy.nombre}`,
          mensaje: `Has sido asignado como coordinador del proyecto "${proy.nombre}".`,
          url: `proyecto-detalle.html?id=${proy.id}`,
          usuario_destino: nuevoId,
          proyecto_id: proy.id,
        });
      }

      poblarFiltroCoordinador();
      render();
    } catch (err) {
      proy.coordinador_id = prevId;
      proy.coordinador_nombre = prevNombre;
      proy.director_proyecto = prevDirector;
      manejarError(err, "No se pudo reasignar el coordinador");
      render();
    } finally {
      if (selectEl) selectEl.disabled = false;
    }
  }

  function renderCeldaCoordinador(p) {
    const nombreActual = nombreCoordinadorDe(p);
    const idActual = idCoordinadorDe(p);

    if (!puedeReasignarCoordinador) {
      if (!nombreActual) {
        return `<span class="text-xs text-gray-400 italic">Sin asignar</span>`;
      }
      return `
        <span class="inline-flex items-center gap-1.5 text-xs font-medium text-gray-700">
          <span class="material-symbols-outlined text-[15px] text-gray-400" aria-hidden="true">person</span>
          <span>${escapeHtml(nombreActual)}</span>
        </span>`;
    }

    const tieneLegacy = !idActual && Boolean(nombreActual);
    const opciones = [
      `<option value="">Sin asignar</option>`,
      ...(tieneLegacy
        ? [`<option value="__legacy__" selected>${escapeHtml(nombreActual)} (texto)</option>`]
        : []),
      ...usuariosCache.map(
        (u) =>
          `<option value="${escapeHtml(u.id)}" ${idActual === u.id ? "selected" : ""}>${escapeHtml(
            u.nombre_completo || "Sin nombre"
          )}</option>`
      ),
    ].join("");

    return `
      <select data-cambiar-coordinador="${escapeHtml(p.id)}"
        aria-label="Coordinador de ${escapeHtml(p.nombre)}"
        title="Cambiar coordinador del proyecto"
        class="w-44 rounded-lg border-gray-300 bg-white py-1 pl-2 pr-8 text-xs text-gray-700 focus:border-primary focus:ring-primary">
        ${opciones}
      </select>`;
  }

  function render() {
    const texto = document.getElementById("filtro-busqueda").value.trim().toLowerCase();
    const estado = document.getElementById("filtro-estado").value;
    const coordFiltro = filtroCoordEl ? filtroCoordEl.value : "";

    const filtrados = proyectosCache.filter((p) => {
      if (!esProyectoVisibleParaUsuario(p)) return false;

      const nombreCoord = nombreCoordinadorDe(p);
      const idCoord = idCoordinadorDe(p);

      const coincideTexto =
        !texto ||
        (p.nombre || "").toLowerCase().includes(texto) ||
        (p.numero_contrato || "").toLowerCase().includes(texto) ||
        (p.numero_cotizacion || "").toLowerCase().includes(texto) ||
        (p.clientes?.nombre || "").toLowerCase().includes(texto) ||
        nombreCoord.toLowerCase().includes(texto);

      const coincideEstado = !estado || p.estado === estado;

      let coincideCoord = true;
      if (coordFiltro === "__sin_asignar__") {
        coincideCoord = !idCoord && !nombreCoord;
      } else if (coordFiltro.startsWith("uid:")) {
        const uidBuscado = coordFiltro.slice(4);
        coincideCoord = idCoord === uidBuscado;
      } else if (coordFiltro.startsWith("txt:")) {
        const txtBuscado = coordFiltro.slice(4);
        coincideCoord = normTexto(nombreCoord) === txtBuscado;
      }

      return coincideTexto && coincideEstado && coincideCoord;
    });

    const tbody = document.getElementById("tabla-proyectos");

    if (!filtrados.length) {
      tbody.innerHTML = `<tr><td class="px-5 py-8 text-center text-gray-400" colspan="7">
        No se encontraron proyectos con ese filtro.
      </td></tr>`;
      return;
    }

    tbody.innerHTML = filtrados
      .map(
        (p) => `
      <tr class="cursor-pointer border-b border-gray-50 last:border-0 hover:bg-gray-50" data-id="${escapeHtml(p.id)}">
        <td class="px-5 py-3">
          <span class="font-medium text-gray-900">${escapeHtml(p.nombre)}</span>
          <p class="text-xs text-gray-500">${escapeHtml(p.clientes?.nombre || "Sin cliente asignado")}${p.numero_contrato || p.numero_cotizacion ? ` · ${escapeHtml(p.numero_contrato || p.numero_cotizacion)}` : ""}</p>
        </td>
        <td class="px-5 py-3" data-col-coordinador>${renderCeldaCoordinador(p)}</td>
        <td class="px-5 py-3">${badgeHtml(ESTADOS_PROYECTO, p.estado)}</td>
        <td class="px-5 py-3">
          <div class="flex items-center gap-2">
            <div class="barra-progreso w-24"><span style="width:${p.avance_porcentaje || 0}%"></span></div>
            <span class="text-xs text-gray-500">${p.avance_porcentaje || 0}%</span>
          </div>
        </td>
        <td class="px-5 py-3 font-medium">${formatoMoneda(p.valor_total)}</td>
        <td class="px-5 py-3 text-gray-500">${formatoFecha(p.fecha_fin_estimada)}</td>
        <td class="px-5 py-3 text-right whitespace-nowrap">
          <div class="inline-flex items-center gap-2">
            <span class="text-sm font-semibold text-primary">Ver →</span>
            ${
              esSuperUsuario
                ? `<button type="button" data-eliminar-proyecto="${escapeHtml(p.id)}" title="Eliminar proyecto" aria-label="Eliminar proyecto ${escapeHtml(p.nombre)}"
                    class="rounded-lg p-1.5 text-red-500 hover:bg-red-50 hover:text-red-700 transition-colors">
                    <span class="material-symbols-outlined text-[18px]" aria-hidden="true">delete</span>
                  </button>`
                : ""
            }
          </div>
        </td>
      </tr>`
      )
      .join("");

    tbody.querySelectorAll("[data-cambiar-coordinador]").forEach((sel) => {
      sel.addEventListener("click", (e) => e.stopPropagation());
      sel.addEventListener("mousedown", (e) => e.stopPropagation());
      sel.addEventListener("change", (e) => {
        e.stopPropagation();
        const proy = proyectosCache.find((x) => x.id === sel.dataset.cambiarCoordinador);
        if (proy) reasignarCoordinador(proy, sel.value, sel);
      });
    });

    tbody.querySelectorAll("tr[data-id]").forEach((tr) =>
      tr.addEventListener("click", (e) => {
        if (e.target.closest("[data-cambiar-coordinador]")) return;
        const btnDel = e.target.closest("[data-eliminar-proyecto]");
        if (btnDel) {
          e.stopPropagation();
          const proy = proyectosCache.find((x) => x.id === btnDel.dataset.eliminarProyecto);
          if (proy) abrirModalEliminar(proy);
          return;
        }
        window.location.href = `proyecto-detalle.html?id=${tr.dataset.id}`;
      })
    );
  }

  let debounceTimer;
  const renderDebounced = () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(render, 200);
  };

  document.getElementById("filtro-busqueda").addEventListener("input", renderDebounced);
  document.getElementById("filtro-estado").addEventListener("change", render);
  filtroCoordEl?.addEventListener("change", render);

  cargar();
})();
