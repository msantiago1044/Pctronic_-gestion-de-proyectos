// ============================================================================
// TERCEROS · Directorio unificado (Clientes, Proveedores y Contratistas).
// Sincroniza automáticamente con las tablas legacy `clientes`, `proveedores`
// y `contratistas` para mantener la integridad de todas las llaves foráneas.
// ============================================================================
(async () => {
  await window.pctronicReady;

  let cache = [];
  let filtroTipo = "todos";
  let editandoId = null;

  const modal = document.getElementById("modal-tercero");
  const form = document.getElementById("form-tercero");
  const chkCliente = document.getElementById("t-es-cliente");
  const chkProveedor = document.getElementById("t-es-proveedor");
  const chkContratista = document.getElementById("t-es-contratista");
  const secProveedor = document.getElementById("sec-proveedor");
  const secContratista = document.getElementById("sec-contratista");

  function actualizarSeccionesCondicionales() {
    secProveedor.classList.toggle("hidden", !chkProveedor.checked);
    secContratista.classList.toggle("hidden", !chkContratista.checked);
  }
  chkProveedor.addEventListener("change", actualizarSeccionesCondicionales);
  chkContratista.addEventListener("change", actualizarSeccionesCondicionales);

  function abrirModal(tercero = null) {
    editandoId = tercero ? tercero.id : null;
    document.getElementById("modal-titulo").textContent = tercero ? "Editar tercero" : "Nuevo tercero";
    document.getElementById("t-nombre").value = tercero?.nombre || "";
    document.getElementById("t-identificacion").value = tercero?.identificacion || "";
    document.getElementById("t-telefono").value = tercero?.telefono || "";
    document.getElementById("t-email").value = tercero?.email || "";
    document.getElementById("t-direccion").value = tercero?.direccion || "";
    chkCliente.checked = !!tercero?.es_cliente;
    chkProveedor.checked = !!tercero?.es_proveedor;
    chkContratista.checked = !!tercero?.es_contratista;

    document.getElementById("t-categoria").value = tercero?.categoria || "";
    document.getElementById("t-aplica-retencion").checked = !!tercero?.aplica_retencion;
    document.getElementById("t-porcentaje-retencion").value = tercero?.porcentaje_retencion ?? 0;
    document.getElementById("t-porcentaje-ica").value = tercero?.porcentaje_ica ?? 0;
    document.getElementById("t-monto-minimo").value = tercero?.monto_minimo_retencion ?? 0;

    document.getElementById("t-especialidad").value = tercero?.especialidad || "";
    document.getElementById("t-tipo-persona").value = tercero?.tipo_persona || "empresa";
    document.getElementById("t-declarante-renta").checked = !!tercero?.es_declarante_renta;
    document.getElementById("t-notas").value = tercero?.notas || "";

    actualizarSeccionesCondicionales();
    modal.classList.remove("hidden");
    modal.classList.add("flex");
  }

  function cerrarModal() {
    modal.classList.add("hidden");
    modal.classList.remove("flex");
    editandoId = null;
  }

  document.getElementById("btn-nuevo").addEventListener("click", () => abrirModal(null));
  document.getElementById("modal-cerrar").addEventListener("click", cerrarModal);
  document.getElementById("modal-cancelar").addEventListener("click", cerrarModal);

  async function sincronizarExistentes(silencioso = false) {
    try {
      const [cliRes, provRes, contRes, tercRes] = await Promise.all([
        window.sb.from("clientes").select("*"),
        window.sb.from("proveedores").select("*"),
        window.sb.from("contratistas").select("*"),
        window.sb.from("terceros").select("*"),
      ]);
      if (cliRes.error) throw cliRes.error;
      if (provRes.error) throw provRes.error;
      if (contRes.error) throw contRes.error;
      if (tercRes.error) throw tercRes.error;

      const existentes = tercRes.data || [];
      const porClienteId = new Set(existentes.map((t) => t.cliente_id).filter(Boolean));
      const porProveedorId = new Set(existentes.map((t) => t.proveedor_id).filter(Boolean));
      const porContratistaId = new Set(existentes.map((t) => t.contratista_id).filter(Boolean));
      const porNombre = new Map(existentes.map((t) => [String(t.nombre || "").trim().toLowerCase(), t]));

      let importados = 0;
      const loteInsertar = [];
      const nuevosPorNombre = new Map();

      for (const c of cliRes.data || []) {
        if (porClienteId.has(c.id)) continue;
        const key = String(c.nombre || "").trim().toLowerCase();
        const match = porNombre.get(key);
        if (match && !match.cliente_id) {
          const { error: errUpd } = await window.sb.from("terceros").update({ es_cliente: true, cliente_id: c.id }).eq("id", match.id);
          if (errUpd) throw errUpd;
          match.es_cliente = true;
          match.cliente_id = c.id;
          porClienteId.add(c.id);
          importados++;
        } else if (!match) {
          const pend = nuevosPorNombre.get(key);
          if (pend) {
            pend.es_cliente = true;
            pend.cliente_id = c.id;
            if (!pend.notas && c.notas) pend.notas = c.notas;
          } else {
            const nuevo = {
              nombre: c.nombre,
              identificacion: c.nit || null,
              es_cliente: true,
              cliente_id: c.id,
              notas: c.notas || null,
            };
            nuevosPorNombre.set(key, nuevo);
            loteInsertar.push(nuevo);
          }
          porClienteId.add(c.id);
        }
      }

      for (const p of provRes.data || []) {
        if (porProveedorId.has(p.id)) continue;
        const key = String(p.nombre || "").trim().toLowerCase();
        const match = porNombre.get(key);
        if (match && !match.proveedor_id) {
          const { error: errUpd } = await window.sb
            .from("terceros")
            .update({
              es_proveedor: true,
              proveedor_id: p.id,
              categoria: match.categoria || p.categoria || null,
              aplica_retencion: !!p.aplica_retencion,
              porcentaje_retencion: Number(p.porcentaje_retencion || 0),
              porcentaje_ica: Number(p.porcentaje_ica || 0),
              monto_minimo_retencion: Number(p.monto_minimo_retencion || 0),
            })
            .eq("id", match.id);
          if (errUpd) throw errUpd;
          match.es_proveedor = true;
          match.proveedor_id = p.id;
          porProveedorId.add(p.id);
          importados++;
        } else if (!match) {
          const pend = nuevosPorNombre.get(key);
          if (pend) {
            pend.es_proveedor = true;
            pend.proveedor_id = p.id;
            pend.categoria = pend.categoria || p.categoria || null;
            pend.aplica_retencion = !!p.aplica_retencion;
            pend.porcentaje_retencion = Number(p.porcentaje_retencion || 0);
            pend.porcentaje_ica = Number(p.porcentaje_ica || 0);
            pend.monto_minimo_retencion = Number(p.monto_minimo_retencion || 0);
            if (!pend.notas && p.notas) pend.notas = p.notas;
          } else {
            const nuevo = {
              nombre: p.nombre,
              identificacion: p.nit || null,
              es_proveedor: true,
              proveedor_id: p.id,
              categoria: p.categoria || null,
              aplica_retencion: !!p.aplica_retencion,
              porcentaje_retencion: Number(p.porcentaje_retencion || 0),
              porcentaje_ica: Number(p.porcentaje_ica || 0),
              monto_minimo_retencion: Number(p.monto_minimo_retencion || 0),
              notas: p.notas || null,
            };
            nuevosPorNombre.set(key, nuevo);
            loteInsertar.push(nuevo);
          }
          porProveedorId.add(p.id);
        }
      }

      for (const k of contRes.data || []) {
        if (porContratistaId.has(k.id)) continue;
        const key = String(k.nombre || "").trim().toLowerCase();
        const match = porNombre.get(key);
        if (match && !match.contratista_id) {
          const { error: errUpd } = await window.sb
            .from("terceros")
            .update({
              es_contratista: true,
              contratista_id: k.id,
              especialidad: match.especialidad || k.especialidad || null,
              tipo_persona: k.tipo_persona || "empresa",
              es_declarante_renta: !!k.es_declarante_renta,
              telefono: match.telefono || k.telefono || null,
              email: match.email || k.email || null,
            })
            .eq("id", match.id);
          if (errUpd) throw errUpd;
          match.es_contratista = true;
          match.contratista_id = k.id;
          porContratistaId.add(k.id);
          importados++;
        } else if (!match) {
          const pend = nuevosPorNombre.get(key);
          if (pend) {
            pend.es_contratista = true;
            pend.contratista_id = k.id;
            pend.especialidad = pend.especialidad || k.especialidad || null;
            pend.tipo_persona = k.tipo_persona || "empresa";
            pend.es_declarante_renta = !!k.es_declarante_renta;
            pend.telefono = pend.telefono || k.telefono || null;
            pend.email = pend.email || k.email || null;
          } else {
            const nuevo = {
              nombre: k.nombre,
              identificacion: k.identificacion || null,
              es_contratista: true,
              contratista_id: k.id,
              especialidad: k.especialidad || null,
              tipo_persona: k.tipo_persona || "empresa",
              es_declarante_renta: !!k.es_declarante_renta,
              telefono: k.telefono || null,
              email: k.email || null,
            };
            nuevosPorNombre.set(key, nuevo);
            loteInsertar.push(nuevo);
          }
          porContratistaId.add(k.id);
        }
      }

      if (loteInsertar.length > 0) {
        const { data: insertados, error: errIns } = await window.sb.from("terceros").insert(loteInsertar).select();
        if (errIns) throw errIns;
        importados += (insertados || []).length;
      }

      if (!silencioso) {
        mostrarAviso(
          importados > 0
            ? `Se sincronizaron ${importados} registros desde Clientes, Proveedores y Contratistas.`
            : "Todos los catálogos ya estaban sincronizados.",
          "exito"
        );
      }
      if (importados > 0) await cargar(false);
    } catch (err) {
      if (!silencioso) manejarError(err, "No se pudo sincronizar catálogos");
    }
  }

  async function cargar(intentarSyncInicial = true) {
    const { data, error } = await window.sb.from("terceros").select("*").order("nombre");
    if (error) return manejarError(error, "No se pudo cargar los terceros");
    cache = data || [];
    if (intentarSyncInicial && cache.length === 0) {
      await sincronizarExistentes(true);
      return;
    }
    render();
  }

  function filtrar() {
    const texto = document.getElementById("filtro-busqueda").value.trim().toLowerCase();
    return cache.filter((t) => {
      if (filtroTipo === "cliente" && !t.es_cliente) return false;
      if (filtroTipo === "proveedor" && !t.es_proveedor) return false;
      if (filtroTipo === "contratista" && !t.es_contratista) return false;
      if (!texto) return true;
      return (
        (t.nombre || "").toLowerCase().includes(texto) ||
        (t.identificacion || "").toLowerCase().includes(texto) ||
        (t.categoria || "").toLowerCase().includes(texto) ||
        (t.especialidad || "").toLowerCase().includes(texto)
      );
    });
  }

  function render() {
    const lista = filtrar();
    const tbody = document.getElementById("tabla-terceros");
    const puedeEliminar = !!window.PCT_ROL_INFO?.puedeEliminar;

    tbody.innerHTML = lista.length
      ? lista
          .map((t) => {
            const badges = [
              t.es_cliente ? `<span class="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-800">Cliente</span>` : "",
              t.es_proveedor ? `<span class="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">Proveedor</span>` : "",
              t.es_contratista ? `<span class="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">Contratista</span>` : "",
            ]
              .filter(Boolean)
              .join(" ");

            const detalles = [];
            if (t.es_proveedor && t.categoria) detalles.push(`Cat: ${escapeHtml(t.categoria)}`);
            if (t.es_proveedor && t.aplica_retencion) detalles.push(`Rte: ${Number(t.porcentaje_retencion || 0)}%`);
            if (t.es_contratista && t.especialidad) detalles.push(`Esp: ${escapeHtml(t.especialidad)}`);

            return `
          <tr class="border-b border-gray-50 last:border-0 hover:bg-gray-50 cursor-pointer" data-row-id="${t.id}">
            <td class="px-4 py-3 font-medium text-gray-900">${escapeHtml(t.nombre)}</td>
            <td class="px-4 py-3 text-gray-600">${escapeHtml(t.identificacion || "—")}</td>
            <td class="px-4 py-3"><div class="flex flex-wrap gap-1">${badges || `<span class="text-xs text-gray-400">Sin rol</span>`}</div></td>
            <td class="px-4 py-3 text-xs text-gray-600">
              <div>${escapeHtml(t.telefono || "—")}</div>
              <div class="text-gray-400">${escapeHtml(t.email || "")}</div>
            </td>
            <td class="px-4 py-3 text-xs text-gray-600">${detalles.join(" · ") || "—"}</td>
            <td class="px-4 py-3 text-right whitespace-nowrap" onclick="event.stopPropagation()">
              <button type="button" data-editar="${t.id}" class="rounded px-2 py-1 text-xs font-medium text-primary hover:bg-blue-50">Editar</button>
              ${puedeEliminar ? `<button type="button" data-eliminar="${t.id}" class="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50">Eliminar</button>` : ""}
            </td>
          </tr>`;
          })
          .join("")
      : `<tr><td class="px-4 py-8 text-center text-gray-400" colspan="6">No hay terceros para ese filtro.</td></tr>`;
  }

  document.getElementById("tabla-terceros").addEventListener("click", async (e) => {
    const btnEdit = e.target.closest("[data-editar]");
    if (btnEdit) {
      const t = cache.find((x) => x.id === btnEdit.dataset.editar);
      if (t) abrirModal(t);
      return;
    }
    const btnDel = e.target.closest("[data-eliminar]");
    if (btnDel) {
      const t = cache.find((x) => x.id === btnDel.dataset.eliminar);
      if (!t || !confirm(`¿Eliminar a «${t.nombre}» de Terceros?`)) return;
      const { error } = await window.sb.from("terceros").delete().eq("id", t.id);
      if (error) return manejarError(error, "No se pudo eliminar el tercero");
      mostrarAviso("Tercero eliminado", "exito");
      cargar(false);
      return;
    }
    const tr = e.target.closest("tr[data-row-id]");
    if (tr) window.location.href = `tercero-detalle.html?id=${tr.dataset.rowId}`;
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const nombre = document.getElementById("t-nombre").value.trim();
    if (!nombre) return mostrarAviso("El nombre es obligatorio", "error");
    if (!chkCliente.checked && !chkProveedor.checked && !chkContratista.checked) {
      return mostrarAviso("Selecciona al menos un rol (Cliente, Proveedor o Contratista)", "error");
    }

    const pctRet = Number(document.getElementById("t-porcentaje-retencion").value || 0);
    const pctIca = Number(document.getElementById("t-porcentaje-ica").value || 0);
    const montoMin = Number(document.getElementById("t-monto-minimo").value || 0);
    if (!Number.isFinite(pctRet) || pctRet < 0 || pctRet > 100) {
      return mostrarAviso("El porcentaje de retención debe estar entre 0 y 100", "error");
    }
    if (!Number.isFinite(pctIca) || pctIca < 0 || pctIca > 100) {
      return mostrarAviso("El porcentaje de ICA debe estar entre 0 y 100", "error");
    }
    if (!Number.isFinite(montoMin) || montoMin < 0) {
      return mostrarAviso("El monto mínimo de retención debe ser mayor o igual a 0", "error");
    }

    const existente = editandoId ? cache.find((x) => x.id === editandoId) : null;
    const payload = {
      nombre,
      identificacion: document.getElementById("t-identificacion").value.trim() || null,
      telefono: document.getElementById("t-telefono").value.trim() || null,
      email: document.getElementById("t-email").value.trim() || null,
      direccion: document.getElementById("t-direccion").value.trim() || null,
      es_cliente: chkCliente.checked,
      es_proveedor: chkProveedor.checked,
      es_contratista: chkContratista.checked,
      categoria: document.getElementById("t-categoria").value.trim() || null,
      aplica_retencion: document.getElementById("t-aplica-retencion").checked,
      porcentaje_retencion: pctRet,
      porcentaje_ica: pctIca,
      monto_minimo_retencion: montoMin,
      especialidad: document.getElementById("t-especialidad").value.trim() || null,
      tipo_persona: document.getElementById("t-tipo-persona").value || "empresa",
      es_declarante_renta: document.getElementById("t-declarante-renta").checked,
      notas: document.getElementById("t-notas").value.trim() || null,
      cliente_id: existente?.cliente_id || null,
      proveedor_id: existente?.proveedor_id || null,
      contratista_id: existente?.contratista_id || null,
    };

    try {
      // Sincronizar con tablas legacy (clientes, proveedores, contratistas)
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

      if (editandoId) {
        const { error } = await window.sb.from("terceros").update(payload).eq("id", editandoId);
        if (error) throw error;
        mostrarAviso("Tercero actualizado", "exito");
      } else {
        const { error } = await window.sb.from("terceros").insert(payload);
        if (error) throw error;
        mostrarAviso("Tercero creado", "exito");
      }

      cerrarModal();
      cargar(false);
    } catch (err) {
      manejarError(err, "No se pudo guardar el tercero");
    }
  });

  document.querySelectorAll(".pill-filtro").forEach((btn) => {
    btn.addEventListener("click", () => {
      filtroTipo = btn.dataset.filtro;
      document.querySelectorAll(".pill-filtro").forEach((b) => {
        const activo = b.dataset.filtro === filtroTipo;
        b.className = activo
          ? "pill-filtro rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-white"
          : "pill-filtro rounded-full border border-gray-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50";
      });
      render();
    });
  });

  document.getElementById("filtro-busqueda").addEventListener("input", render);
  document.getElementById("btn-sincronizar").addEventListener("click", () => sincronizarExistentes(false));
  document.getElementById("btn-exportar").addEventListener("click", async () => {
    const lista = filtrar();
    if (!lista.length) return mostrarAviso("No hay terceros para exportar", "error");
    if (typeof asegurarXLSX === "function") await asegurarXLSX();
    const cols = ["Nombre", "NIT/ID", "Cliente", "Proveedor", "Contratista", "Teléfono", "Email", "Categoría", "Especialidad"];
    const filas = lista.map((t) => [
      t.nombre,
      t.identificacion || "",
      t.es_cliente ? "Sí" : "No",
      t.es_proveedor ? "Sí" : "No",
      t.es_contratista ? "Sí" : "No",
      t.telefono || "",
      t.email || "",
      t.categoria || "",
      t.especialidad || "",
    ]);
    descargarPlantillaExcel("terceros.xlsx", cols, filas);
  });

  cargar(true);
})();
