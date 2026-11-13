// ============================================================================
// TERCERO DETALLE · Edición del tercero (con sincronización a tablas legacy)
// y gestión de contactos (`terceros_contactos`).
// ============================================================================
(async () => {
  await window.pctronicReady;

  const id = qs("id");
  if (!id) {
    window.location.href = "terceros.html";
    return;
  }

  let tercero = null;
  let contactos = [];
  let editandoContactoId = null;

  const chkCli = document.getElementById("d-es-cliente");
  const chkProv = document.getElementById("d-es-proveedor");
  const chkCont = document.getElementById("d-es-contratista");
  const secProv = document.getElementById("d-sec-proveedor");
  const secCont = document.getElementById("d-sec-contratista");

  function toggleSecciones() {
    secProv.classList.toggle("hidden", !chkProv.checked);
    secCont.classList.toggle("hidden", !chkCont.checked);
  }
  chkProv.addEventListener("change", toggleSecciones);
  chkCont.addEventListener("change", toggleSecciones);

  async function cargarTercero() {
    const { data, error } = await window.sb.from("terceros").select("*").eq("id", id).single();
    if (error) return manejarError(error, "No se pudo cargar el tercero");
    tercero = data;

    document.getElementById("detalle-nombre").textContent = tercero.nombre;
    document.getElementById("d-nombre").value = tercero.nombre || "";
    document.getElementById("d-identificacion").value = tercero.identificacion || "";
    document.getElementById("d-telefono").value = tercero.telefono || "";
    document.getElementById("d-email").value = tercero.email || "";
    document.getElementById("d-direccion").value = tercero.direccion || "";
    document.getElementById("d-notas").value = tercero.notas || "";

    chkCli.checked = !!tercero.es_cliente;
    chkProv.checked = !!tercero.es_proveedor;
    chkCont.checked = !!tercero.es_contratista;

    document.getElementById("d-categoria").value = tercero.categoria || "";
    document.getElementById("d-aplica-retencion").checked = !!tercero.aplica_retencion;
    document.getElementById("d-porcentaje-retencion").value = tercero.porcentaje_retencion ?? 0;
    document.getElementById("d-porcentaje-ica").value = tercero.porcentaje_ica ?? 0;
    document.getElementById("d-monto-minimo").value = tercero.monto_minimo_retencion ?? 0;

    document.getElementById("d-especialidad").value = tercero.especialidad || "";
    document.getElementById("d-tipo-persona").value = tercero.tipo_persona || "empresa";
    document.getElementById("d-declarante-renta").checked = !!tercero.es_declarante_renta;

    toggleSecciones();
  }

  document.getElementById("btn-guardar-tercero").addEventListener("click", async () => {
    const nombre = document.getElementById("d-nombre").value.trim();
    if (!nombre) return mostrarAviso("El nombre es obligatorio", "error");
    if (!chkCli.checked && !chkProv.checked && !chkCont.checked) {
      return mostrarAviso("Debe tener al menos un rol activo", "error");
    }

    const payload = {
      nombre,
      identificacion: document.getElementById("d-identificacion").value.trim() || null,
      telefono: document.getElementById("d-telefono").value.trim() || null,
      email: document.getElementById("d-email").value.trim() || null,
      direccion: document.getElementById("d-direccion").value.trim() || null,
      notas: document.getElementById("d-notas").value.trim() || null,
      es_cliente: chkCli.checked,
      es_proveedor: chkProv.checked,
      es_contratista: chkCont.checked,
      categoria: document.getElementById("d-categoria").value.trim() || null,
      aplica_retencion: document.getElementById("d-aplica-retencion").checked,
      porcentaje_retencion: Number(document.getElementById("d-porcentaje-retencion").value || 0),
      porcentaje_ica: Number(document.getElementById("d-porcentaje-ica").value || 0),
      monto_minimo_retencion: Number(document.getElementById("d-monto-minimo").value || 0),
      especialidad: document.getElementById("d-especialidad").value.trim() || null,
      tipo_persona: document.getElementById("d-tipo-persona").value || "empresa",
      es_declarante_renta: document.getElementById("d-declarante-renta").checked,
      cliente_id: tercero.cliente_id || null,
      proveedor_id: tercero.proveedor_id || null,
      contratista_id: tercero.contratista_id || null,
    };

    try {
      if (payload.es_cliente) {
        const cliData = { nombre: payload.nombre, nit: payload.identificacion, notas: payload.notas };
        if (payload.cliente_id) {
          const { error } = await window.sb.from("clientes").update(cliData).eq("id", payload.cliente_id);
          if (error) throw error;
        } else {
          const { data, error } = await window.sb.from("clientes").insert(cliData).select("id").single();
          if (error) throw error;
          payload.cliente_id = data.id;
        }
      }
      if (payload.es_proveedor) {
        const provData = {
          nombre: payload.nombre,
          nit: payload.identificacion,
          categoria: payload.categoria,
          notas: payload.notas,
          aplica_retencion: payload.aplica_retencion,
          porcentaje_retencion: payload.porcentaje_retencion,
          porcentaje_ica: payload.porcentaje_ica,
          monto_minimo_retencion: payload.monto_minimo_retencion,
        };
        if (payload.proveedor_id) {
          const { error } = await window.sb.from("proveedores").update(provData).eq("id", payload.proveedor_id);
          if (error) throw error;
        } else {
          const { data, error } = await window.sb.from("proveedores").insert(provData).select("id").single();
          if (error) throw error;
          payload.proveedor_id = data.id;
        }
      }
      if (payload.es_contratista) {
        const contData = {
          nombre: payload.nombre,
          especialidad: payload.especialidad,
          identificacion: payload.identificacion,
          tipo_persona: payload.tipo_persona,
          es_declarante_renta: payload.es_declarante_renta,
          telefono: payload.telefono,
          email: payload.email,
        };
        if (payload.contratista_id) {
          const { error } = await window.sb.from("contratistas").update(contData).eq("id", payload.contratista_id);
          if (error) throw error;
        } else {
          const { data, error } = await window.sb.from("contratistas").insert(contData).select("id").single();
          if (error) throw error;
          payload.contratista_id = data.id;
        }
      }

      const { data, error } = await window.sb.from("terceros").update(payload).eq("id", id).select().single();
      if (error) throw error;
      tercero = data;
      document.getElementById("detalle-nombre").textContent = tercero.nombre;
      mostrarAviso("Cambios guardados", "exito");
    } catch (err) {
      manejarError(err, "No se pudo guardar los cambios");
    }
  });

  // Contactos
  const modalC = document.getElementById("modal-contacto");
  function abrirModalContacto(c = null) {
    editandoContactoId = c ? c.id : null;
    document.getElementById("modal-contacto-titulo").textContent = c ? "Editar contacto" : "Nuevo contacto";
    document.getElementById("c-nombre").value = c?.nombre || "";
    document.getElementById("c-cargo").value = c?.cargo || "";
    document.getElementById("c-tipo").value = c?.tipo_contacto || "comercial";
    document.getElementById("c-telefono").value = c?.telefono || "";
    document.getElementById("c-email").value = c?.email || "";
    modalC.classList.remove("hidden");
    modalC.classList.add("flex");
  }
  function cerrarModalContacto() {
    modalC.classList.add("hidden");
    modalC.classList.remove("flex");
    editandoContactoId = null;
  }

  document.getElementById("btn-nuevo-contacto").addEventListener("click", () => abrirModalContacto(null));
  document.getElementById("c-cancelar").addEventListener("click", cerrarModalContacto);

  async function cargarContactos() {
    const { data, error } = await window.sb
      .from("terceros_contactos")
      .select("*")
      .eq("tercero_id", id)
      .order("created_at");
    if (error) return manejarError(error, "No se pudo cargar los contactos");
    contactos = data || [];
    const tbody = document.getElementById("tabla-contactos");
    tbody.innerHTML = contactos.length
      ? contactos
          .map(
            (c) => `
          <tr class="border-b border-gray-50 last:border-0">
            <td class="px-4 py-3 font-medium">${escapeHtml(c.nombre)}</td>
            <td class="px-4 py-3 text-gray-600">${escapeHtml(c.cargo || "—")}</td>
            <td class="px-4 py-3"><span class="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">${escapeHtml(c.tipo_contacto || "otro")}</span></td>
            <td class="px-4 py-3 text-gray-600">${escapeHtml(c.telefono || "—")}</td>
            <td class="px-4 py-3 text-gray-600">${escapeHtml(c.email || "—")}</td>
            <td class="px-4 py-3 text-right whitespace-nowrap">
              <button type="button" data-edit-c="${c.id}" class="rounded px-2 py-1 text-xs font-medium text-primary hover:bg-blue-50">Editar</button>
              <button type="button" data-del-c="${c.id}" class="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50">Eliminar</button>
            </td>
          </tr>`
          )
          .join("")
      : `<tr><td class="px-4 py-6 text-center text-gray-400" colspan="6">Sin contactos registrados.</td></tr>`;
  }

  document.getElementById("tabla-contactos").addEventListener("click", async (e) => {
    const btnE = e.target.closest("[data-edit-c]");
    if (btnE) {
      const c = contactos.find((x) => x.id === btnE.dataset.editC);
      if (c) abrirModalContacto(c);
      return;
    }
    const btnD = e.target.closest("[data-del-c]");
    if (btnD) {
      if (!confirm("¿Eliminar este contacto?")) return;
      const { error } = await window.sb.from("terceros_contactos").delete().eq("id", btnD.dataset.delC);
      if (error) return manejarError(error, "No se pudo eliminar el contacto");
      mostrarAviso("Contacto eliminado", "exito");
      cargarContactos();
    }
  });

  document.getElementById("c-guardar").addEventListener("click", async () => {
    const nombre = document.getElementById("c-nombre").value.trim();
    if (!nombre) return mostrarAviso("El nombre del contacto es obligatorio", "error");
    const payload = {
      tercero_id: id,
      nombre,
      cargo: document.getElementById("c-cargo").value.trim() || null,
      tipo_contacto: document.getElementById("c-tipo").value || "otro",
      telefono: document.getElementById("c-telefono").value.trim() || null,
      email: document.getElementById("c-email").value.trim() || null,
    };
    const res = editandoContactoId
      ? await window.sb.from("terceros_contactos").update(payload).eq("id", editandoContactoId)
      : await window.sb.from("terceros_contactos").insert(payload);
    if (res.error) return manejarError(res.error, "No se pudo guardar el contacto");
    mostrarAviso("Contacto guardado", "exito");
    cerrarModalContacto();
    cargarContactos();
  });

  await cargarTercero();
  await cargarContactos();
})();
