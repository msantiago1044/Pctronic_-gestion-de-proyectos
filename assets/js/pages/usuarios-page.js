document.addEventListener("DOMContentLoaded", async () => {
  const { profile } = await window.pctronicReady;
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
    { value: "comercial", label: "Comercial" },
    { value: "proyectos", label: "Proyectos" },
    { value: "compras", label: "Compras" },
  ];

  function rolNormalizado(rol) {
    if (rol === "admin") return "super_usuario";
    if (rol === "miembro" || !rol) return "proyectos";
    return rol;
  }

  async function cargar() {
    const { data, error } = await window.sb
      .from("profiles")
      .select("id, nombre_completo, rol, created_at")
      .order("created_at");
    if (error) return manejarError(error, "No se pudo cargar los usuarios");

    document.getElementById("tabla-usuarios").innerHTML = data
      .map((u) => {
        const rolActual = rolNormalizado(u.rol);
        const esLegacy = u.rol === "admin" || u.rol === "miembro";
        return `
      <tr class="border-b border-gray-50 last:border-0">
        <td class="px-4 py-3 font-medium">
          ${escapeHtml(u.nombre_completo || "—")}
          ${esLegacy ? `<span class="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">legacy: ${escapeHtml(u.rol)}</span>` : ""}
        </td>
        <td class="px-4 py-3">
          <select class="select-rol rounded-lg border-gray-300 text-xs" data-id="${escapeHtml(u.id)}">
            ${ROLES_OPCIONES.map((opt) => `<option value="${opt.value}" ${rolActual === opt.value ? "selected" : ""}>${opt.label}</option>`).join("")}
          </select>
        </td>
        <td class="px-4 py-3 text-gray-500">${formatoFecha(u.created_at)}</td>
      </tr>`;
      })
      .join("");

    document.querySelectorAll(".select-rol").forEach((sel) =>
      sel.addEventListener("change", async () => {
        const { error } = await window.sb.from("profiles").update({ rol: sel.value }).eq("id", sel.dataset.id);
        if (error) return manejarError(error, "No se pudo actualizar el rol");
        mostrarAviso("Rol actualizado", "exito");
      })
    );
  }
  cargar();
});
