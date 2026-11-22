(async () => {
  await window.pctronicReady;

  const esSuperUsuario = Boolean(window.PCT_ROL_INFO?.esSuperUsuario);

  // Crear proyectos es una acción exclusiva del super usuario (el enlace
  // viene oculto por defecto en el HTML; aquí solo se muestra si aplica).
  if (esSuperUsuario) {
    document.getElementById("link-nuevo-proyecto")?.classList.remove("hidden");
    document.getElementById("link-nuevo-proyecto")?.classList.add("flex");
  }

  let proyectosCache = [];
  let proyectoAEliminar = null;
  let claveEsperada = "ELIMINAR";

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

  async function cargar() {
    const { data, error } = await window.sb
      .from("proyectos")
      .select("id, nombre, numero_contrato, numero_cotizacion, estado, avance_porcentaje, valor_total, fecha_fin_estimada, clientes(nombre)")
      .order("created_at", { ascending: false });

    if (error) return manejarError(error, "No se pudieron cargar los proyectos");
    proyectosCache = data || [];
    render();
  }

  function render() {
    const texto = document.getElementById("filtro-busqueda").value.trim().toLowerCase();
    const estado = document.getElementById("filtro-estado").value;

    const filtrados = proyectosCache.filter((p) => {
      const coincideTexto =
        !texto ||
        p.nombre.toLowerCase().includes(texto) ||
        (p.numero_contrato || "").toLowerCase().includes(texto) ||
        (p.numero_cotizacion || "").toLowerCase().includes(texto) ||
        (p.clientes?.nombre || "").toLowerCase().includes(texto);
      const coincideEstado = !estado || p.estado === estado;
      return coincideTexto && coincideEstado;
    });

    const tbody = document.getElementById("tabla-proyectos");

    if (!filtrados.length) {
      tbody.innerHTML = `<tr><td class="px-5 py-8 text-center text-gray-400" colspan="6">
        No se encontraron proyectos con ese filtro.
      </td></tr>`;
      return;
    }

    tbody.innerHTML = filtrados
      .map(
        (p) => `
      <tr class="cursor-pointer border-b border-gray-50 last:border-0 hover:bg-gray-50" data-id="${p.id}">
        <td class="px-5 py-3">
          <span class="font-medium text-gray-900">${escapeHtml(p.nombre)}</span>
          <p class="text-xs text-gray-500">${escapeHtml(p.clientes?.nombre || "Sin cliente asignado")}${p.numero_contrato || p.numero_cotizacion ? ` · ${escapeHtml(p.numero_contrato || p.numero_cotizacion)}` : ""}</p>
        </td>
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
                ? `<button type="button" data-eliminar-proyecto="${p.id}" title="Eliminar proyecto" aria-label="Eliminar proyecto ${escapeHtml(p.nombre)}"
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

    tbody.querySelectorAll("tr[data-id]").forEach((tr) =>
      tr.addEventListener("click", (e) => {
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

  cargar();
})();
