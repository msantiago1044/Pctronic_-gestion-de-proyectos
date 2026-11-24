document.addEventListener("DOMContentLoaded", async () => {
  const { session, profile } = await window.pctronicReady;
  const esSuper = profile?.rol === "super_usuario" || profile?.rol === "admin";
  if (!esSuper) {
    document.querySelector("main").innerHTML = `
      <div class="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-500">
        Solo un Super Usuario puede ver y administrar esta página.
      </div>`;
    return;
  }

  const ROLES_OPCIONES = [
    { value: "super_usuario", label: "Super Usuario" },
    { value: "directivo", label: "Directivo" },
    { value: "jefe_comercial", label: "Jefe Comercial" },
    { value: "comercial", label: "Comercial" },
    { value: "preventa", label: "Preventa / Ofertas" },
    { value: "jefe_compras", label: "Jefe de Compras" },
    { value: "compras", label: "Compras" },
    { value: "proyectos", label: "Proyectos (Coordinador)" },
  ];

  const MODULOS_FALLBACK = {
    dashboard: { key: "dashboard", label: "Panel Principal", icon: "dashboard" },
    proyectos: { key: "proyectos", label: "Proyectos", icon: "folder_open" },
    crm: { key: "crm", label: "CRM Comercial", icon: "handshake" },
    ofertas: { key: "ofertas", label: "Ofertas Preventa", icon: "assignment" },
    compras: { key: "compras", label: "Compras", icon: "shopping_cart" },
    facturacion: { key: "facturacion", label: "Facturación", icon: "receipt_long" },
    terceros: { key: "terceros", label: "Terceros (Clientes/Prov./Contratistas)", icon: "groups" },
    empresas: { key: "empresas", label: "Empresas", icon: "domain" },
    suministros: { key: "suministros", label: "Suministros / Servicios", icon: "inventory_2" },
    usuarios: { key: "usuarios", label: "Usuarios", icon: "manage_accounts" },
  };

  const CATALOGO = window.PCT_MODULOS_CATALOGO || MODULOS_FALLBACK;
  const MODULOS_LISTA = Object.values(CATALOGO);
  const MODULOS_ASIGNABLES = MODULOS_LISTA.filter((m) => m.key !== "usuarios");

  const ROLES_CFG = window.PCT_ROLES_CONFIG || {};

  function rolNormalizado(rol) {
    if (rol === "admin") return "super_usuario";
    if (rol === "miembro" || !rol) return "proyectos";
    return ROLES_OPCIONES.some((r) => r.value === rol) ? rol : "proyectos";
  }

  function modulosPorDefectoRol(rol) {
    const norm = rolNormalizado(rol);
    const cfg = ROLES_CFG[norm];
    if (cfg && Array.isArray(cfg.modulos)) return [...cfg.modulos];
    return ["dashboard", "proyectos", "terceros"];
  }

  function modulosActivosDeUsuario(u) {
    const norm = rolNormalizado(u.rol);
    if (norm === "super_usuario") {
      return {
        lista: MODULOS_LISTA.map((m) => m.key),
        personalizado: false,
        esSuperUsuario: true,
      };
    }
    const custom = Array.isArray(u.modulos_permitidos)
      ? u.modulos_permitidos.filter((k) => Boolean(CATALOGO[k]))
      : [];
    if (custom.length > 0) {
      return { lista: custom, personalizado: true, esSuperUsuario: false };
    }
    return { lista: modulosPorDefectoRol(norm), personalizado: false, esSuperUsuario: false };
  }

  function esErrorMigracionPendiente(error) {
    const msg = `${error?.code || ""} ${error?.message || ""} ${error?.details || ""}`.toLowerCase();
    return (
      msg.includes("modulos_permitidos") ||
      msg.includes("profiles_rol_check") ||
      msg.includes("42703") ||
      msg.includes("pgrst204")
    );
  }

  function renderBadgesModulos(u) {
    const info = modulosActivosDeUsuario(u);
    if (info.esSuperUsuario) {
      return `<span class="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">
        <span class="material-symbols-outlined text-[14px]" aria-hidden="true">verified_user</span>
        Acceso total (Super Usuario)
      </span>`;
    }
    const badges = info.lista
      .map((key) => {
        const def = CATALOGO[key];
        const nombreCorto = (def?.label || key).split(" (")[0];
        return `<span class="inline-flex items-center rounded-md bg-blue-50 border border-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-800">${escapeHtml(nombreCorto)}</span>`;
      })
      .join("");
    const etiquetaOrigen = info.personalizado
      ? `<span class="inline-flex items-center rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-semibold text-amber-800">Personalizado</span>`
      : `<span class="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">Por defecto del rol</span>`;
    return `
      <div class="flex flex-wrap items-center gap-1.5">
        ${badges}
        ${etiquetaOrigen}
      </div>`;
  }

  let usuariosCache = [];
  const panelesAbiertos = new Set();

  function renderTabla() {
    const tbody = document.getElementById("tabla-usuarios");
    if (!usuariosCache.length) {
      tbody.innerHTML = `<tr><td class="px-4 py-6 text-center text-gray-400" colspan="4">No hay usuarios registrados.</td></tr>`;
      return;
    }

    tbody.innerHTML = usuariosCache
      .map((u) => {
        const rolActual = rolNormalizado(u.rol);
        const esLegacy = u.rol === "admin" || u.rol === "miembro";
        const infoMod = modulosActivosDeUsuario(u);
        const abierto = panelesAbiertos.has(u.id);
        const checkboxesHtml = MODULOS_ASIGNABLES.map((m) => {
          const marcado = infoMod.lista.includes(m.key);
          return `
            <label class="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-xs text-gray-700 hover:border-primary cursor-pointer">
              <input type="checkbox" class="chk-modulo rounded border-gray-300 text-primary focus:ring-primary"
                data-user-id="${escapeHtml(u.id)}" value="${escapeHtml(m.key)}" ${marcado ? "checked" : ""} />
              <span class="material-symbols-outlined text-[16px] text-gray-400 shrink-0" aria-hidden="true">${escapeHtml(m.icon || "apps")}</span>
              <span class="truncate" title="${escapeHtml(m.label)}">${escapeHtml(m.label)}</span>
            </label>`;
        }).join("");

        return `
          <tr class="border-b border-gray-100 hover:bg-gray-50/50" data-user-row="${escapeHtml(u.id)}">
            <td class="px-4 py-3 font-medium align-top">
              <div class="flex items-center flex-wrap gap-1.5">
                <span>${escapeHtml(u.nombre_completo || "—")}</span>
                ${esLegacy ? `<span class="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">legacy: ${escapeHtml(u.rol)}</span>` : ""}
              </div>
            </td>
            <td class="px-4 py-3 align-top">
              <select class="select-rol rounded-lg border-gray-300 text-xs focus:border-primary focus:ring-primary" data-id="${escapeHtml(u.id)}">
                ${ROLES_OPCIONES.map((opt) => `<option value="${opt.value}" ${rolActual === opt.value ? "selected" : ""}>${escapeHtml(opt.label)}</option>`).join("")}
              </select>
            </td>
            <td class="px-4 py-3 align-top">
              <div class="space-y-2">
                ${renderBadgesModulos(u)}
                ${
                  infoMod.esSuperUsuario
                    ? ""
                    : `<button type="button" data-toggle-modulos="${escapeHtml(u.id)}"
                        class="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors">
                        <span class="material-symbols-outlined text-[14px]" aria-hidden="true">${abierto ? "expand_less" : "tune"}</span>
                        <span>${abierto ? "Ocultar configuración" : "Configurar módulos"}</span>
                      </button>`
                }
              </div>
            </td>
            <td class="px-4 py-3 text-gray-500 align-top whitespace-nowrap">${formatoFecha(u.created_at)}</td>
          </tr>
          ${
            infoMod.esSuperUsuario
              ? ""
              : `<tr class="${abierto ? "" : "hidden"} border-b border-gray-200 bg-gray-50" data-modulos-panel="${escapeHtml(u.id)}">
                  <td colspan="4" class="px-4 py-4">
                    <div class="space-y-3">
                      <div class="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p class="text-xs font-bold text-gray-800">Módulos visibles para ${escapeHtml(u.nombre_completo || "este usuario")}</p>
                          <p class="text-[11px] text-gray-500">Marca exactamente las secciones que puede ver en el menú lateral y abrir directamente. Perfil personal siempre queda disponible.</p>
                        </div>
                        <div class="flex flex-wrap items-center gap-2">
                          <button type="button" data-aplicar-defecto="${escapeHtml(u.id)}"
                            class="rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-[11px] font-medium text-gray-700 hover:bg-gray-100">
                            Marcar del rol
                          </button>
                          <button type="button" data-reset-modulos="${escapeHtml(u.id)}"
                            class="rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-[11px] font-medium text-gray-700 hover:bg-gray-100">
                            Usar por defecto del rol
                          </button>
                          <button type="button" data-guardar-modulos="${escapeHtml(u.id)}"
                            class="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">
                            <span class="material-symbols-outlined text-[15px]" aria-hidden="true">save</span>
                            <span>Guardar módulos</span>
                          </button>
                        </div>
                      </div>
                      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
                        ${checkboxesHtml}
                      </div>
                    </div>
                  </td>
                </tr>`
          }`;
      })
      .join("");
  }

  async function cargar() {
    const { data, error } = await window.sb
      .from("profiles")
      .select("*")
      .order("created_at");
    if (error) return manejarError(error, "No se pudo cargar los usuarios");
    usuariosCache = data || [];
    renderTabla();
  }

  const tbody = document.getElementById("tabla-usuarios");

  tbody.addEventListener("change", async (e) => {
    const sel = e.target.closest(".select-rol");
    if (!sel) return;
    const uid = sel.dataset.id;
    const nuevoRol = sel.value;
    const usuario = usuariosCache.find((x) => x.id === uid);
    if (!usuario) return;

    const rolAnterior = usuario.rol;
    const teniaCustom = Array.isArray(usuario.modulos_permitidos) && usuario.modulos_permitidos.length > 0;
    const optLabel = ROLES_OPCIONES.find((o) => o.value === nuevoRol)?.label || nuevoRol;

    const payload = { rol: nuevoRol };
    let limpiarModulos = false;
    if (nuevoRol === "super_usuario" && teniaCustom) {
      limpiarModulos = true;
    } else if (nuevoRol !== "super_usuario" && teniaCustom) {
      const aplicar = window.confirm(
        `¿Deseas aplicar los módulos por defecto del rol "${optLabel}" para ${usuario.nombre_completo || "este usuario"}?\n\nPulsa Aceptar para usar los módulos del nuevo rol, o Cancelar para conservar sus módulos personalizados.`
      );
      if (aplicar) limpiarModulos = true;
    }

    if (limpiarModulos) payload.modulos_permitidos = null;

    let { error } = await window.sb.from("profiles").update(payload).eq("id", uid);
    if (error && limpiarModulos && esErrorMigracionPendiente(error)) {
      const retry = await window.sb.from("profiles").update({ rol: nuevoRol }).eq("id", uid);
      error = retry.error;
    }

    if (error) {
      sel.value = rolNormalizado(rolAnterior);
      if (esErrorMigracionPendiente(error)) {
        mostrarAviso(
          "Primero ejecuta la migración SQL (sql/migracion_2026-11_reunion23_permisos_flujos.sql) en Supabase para habilitar los nuevos roles.",
          "error"
        );
        return;
      }
      return manejarError(error, "No se pudo actualizar el rol");
    }

    usuario.rol = nuevoRol;
    if (limpiarModulos) usuario.modulos_permitidos = null;
    if (nuevoRol === "super_usuario") panelesAbiertos.delete(uid);
    if (uid === session?.user?.id && typeof window.PCT_INVALIDAR_CACHE_PERFIL === "function") {
      window.PCT_INVALIDAR_CACHE_PERFIL();
    }
    renderTabla();
    mostrarAviso(`Rol actualizado a ${optLabel}.`, "exito");
  });

  tbody.addEventListener("click", async (e) => {
    const btnToggle = e.target.closest("[data-toggle-modulos]");
    if (btnToggle) {
      const uid = btnToggle.dataset.toggleModulos;
      if (panelesAbiertos.has(uid)) panelesAbiertos.delete(uid);
      else panelesAbiertos.add(uid);
      renderTabla();
      return;
    }

    const btnAplicar = e.target.closest("[data-aplicar-defecto]");
    if (btnAplicar) {
      const uid = btnAplicar.dataset.aplicarDefecto;
      const usuario = usuariosCache.find((x) => x.id === uid);
      if (!usuario) return;
      const defaults = new Set(modulosPorDefectoRol(usuario.rol));
      tbody.querySelectorAll(`.chk-modulo[data-user-id="${uid}"]`).forEach((chk) => {
        chk.checked = defaults.has(chk.value);
      });
      mostrarAviso("Módulos del rol marcados. Pulsa «Guardar módulos» para aplicar.", "info");
      return;
    }

    const btnReset = e.target.closest("[data-reset-modulos]");
    if (btnReset) {
      const uid = btnReset.dataset.resetModulos;
      const usuario = usuariosCache.find((x) => x.id === uid);
      if (!usuario) return;
      btnReset.disabled = true;
      try {
        const { error } = await window.sb.from("profiles").update({ modulos_permitidos: null }).eq("id", uid);
        if (error) {
          if (esErrorMigracionPendiente(error)) {
            mostrarAviso(
              "Aún falta ejecutar sql/migracion_2026-11_reunion23_permisos_flujos.sql en Supabase para guardar módulos personalizados.",
              "error"
            );
            return;
          }
          return manejarError(error, "No se pudieron restablecer los módulos");
        }
        usuario.modulos_permitidos = null;
        panelesAbiertos.delete(uid);
        renderTabla();
        mostrarAviso("Usuario restablecido a los módulos por defecto de su rol.", "exito");
      } finally {
        btnReset.disabled = false;
      }
      return;
    }

    const btnGuardar = e.target.closest("[data-guardar-modulos]");
    if (btnGuardar) {
      const uid = btnGuardar.dataset.guardarModulos;
      const usuario = usuariosCache.find((x) => x.id === uid);
      if (!usuario) return;
      const seleccionados = [...tbody.querySelectorAll(`.chk-modulo[data-user-id="${uid}"]:checked`)]
        .map((chk) => chk.value)
        .filter((k) => k !== "usuarios");
      if (!seleccionados.length) {
        mostrarAviso("Selecciona al menos un módulo visible para este usuario.", "error");
        return;
      }

      btnGuardar.disabled = true;
      const textoOrig = btnGuardar.innerHTML;
      btnGuardar.textContent = "Guardando...";
      try {
        const { error } = await window.sb
          .from("profiles")
          .update({ modulos_permitidos: seleccionados })
          .eq("id", uid);
        if (error) {
          if (esErrorMigracionPendiente(error)) {
            mostrarAviso(
              "Aún falta ejecutar sql/migracion_2026-11_reunion23_permisos_flujos.sql en Supabase para habilitar los permisos por módulo.",
              "error"
            );
            return;
          }
          return manejarError(error, "No se pudieron guardar los módulos del usuario");
        }
        usuario.modulos_permitidos = seleccionados;
        panelesAbiertos.delete(uid);
        if (uid === session?.user?.id && typeof window.PCT_INVALIDAR_CACHE_PERFIL === "function") {
          window.PCT_INVALIDAR_CACHE_PERFIL();
        }
        renderTabla();
        mostrarAviso(`Módulos guardados para ${usuario.nombre_completo || "el usuario"}.`, "exito");
      } finally {
        btnGuardar.disabled = false;
        btnGuardar.innerHTML = textoOrig;
      }
    }
  });

  cargar();
});
