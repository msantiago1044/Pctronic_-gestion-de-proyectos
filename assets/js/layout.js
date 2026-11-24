// ============================================================================
// Barra lateral + encabezado + control de acceso (login obligatorio).
// Se incluye en TODAS las páginas protegidas para que se vean idénticas.
// ============================================================================

const MODULOS_CATALOGO = {
  dashboard: {
    key: "dashboard",
    label: "Panel Principal",
    icon: "dashboard",
    defaultHref: "dashboard.html",
    pages: ["dashboard"],
    files: ["dashboard.html"],
  },
  proyectos: {
    key: "proyectos",
    label: "Proyectos",
    icon: "folder_open",
    defaultHref: "proyectos.html",
    pages: ["proyectos"],
    files: ["proyectos.html", "proyecto-nuevo.html", "proyecto-detalle.html"],
  },
  crm: {
    key: "crm",
    label: "CRM Comercial",
    icon: "handshake",
    defaultHref: "crm.html",
    pages: ["crm"],
    files: ["crm.html"],
  },
  ofertas: {
    key: "ofertas",
    label: "Ofertas Preventa",
    icon: "assignment",
    defaultHref: "ofertas.html",
    pages: ["ofertas"],
    files: ["ofertas.html"],
  },
  compras: {
    key: "compras",
    label: "Compras",
    icon: "shopping_cart",
    defaultHref: "compras.html",
    pages: ["compras"],
    files: ["compras.html"],
  },
  facturacion: {
    key: "facturacion",
    label: "Facturación",
    icon: "receipt_long",
    defaultHref: "facturacion.html",
    pages: ["facturacion"],
    files: ["facturacion.html"],
  },
  terceros: {
    key: "terceros",
    label: "Terceros (Clientes/Prov./Contratistas)",
    icon: "groups",
    defaultHref: "terceros.html",
    pages: ["terceros", "clientes", "proveedores", "contratistas"],
    files: [
      "terceros.html",
      "tercero-detalle.html",
      "clientes.html",
      "cliente-detalle.html",
      "proveedores.html",
      "proveedor-detalle.html",
      "contratistas.html",
    ],
  },
  empresas: {
    key: "empresas",
    label: "Empresas",
    icon: "domain",
    defaultHref: "empresas.html",
    pages: ["empresas"],
    files: ["empresas.html"],
  },
  suministros: {
    key: "suministros",
    label: "Suministros / Servicios",
    icon: "inventory_2",
    defaultHref: "suministros.html",
    pages: ["suministros"],
    files: ["suministros.html"],
  },
  usuarios: {
    key: "usuarios",
    label: "Usuarios",
    icon: "manage_accounts",
    defaultHref: "usuarios.html",
    pages: ["usuarios"],
    files: ["usuarios.html"],
  },
};

window.PCT_MODULOS_CATALOGO = MODULOS_CATALOGO;

const NAV_ITEMS = [
  { page: "dashboard", href: "dashboard.html", icon: "dashboard", label: "Panel Principal" },
  {
    group: "comercial",
    label: "Comercial",
    icon: "storefront",
    items: [
      { page: "crm", href: "crm.html", icon: "handshake", label: "CRM Comercial" },
      { page: "ofertas", href: "ofertas.html", icon: "assignment", label: "Ofertas Pre-venta" },
    ],
  },
  { page: "proyectos", href: "proyectos.html", icon: "folder_open", label: "Proyectos" },
  { page: "compras", href: "compras.html", icon: "shopping_cart", label: "Compras" },
  { page: "suministros", href: "suministros.html", icon: "inventory_2", label: "Suministros" },
  { page: "facturacion", href: "facturacion.html", icon: "receipt_long", label: "Facturación" },
  { page: "terceros", href: "terceros.html", icon: "groups", label: "Terceros" },
  { page: "empresas", href: "empresas.html", icon: "domain", label: "Empresas" },
];

const NAV_ITEMS_ADMIN = [
  { page: "usuarios", href: "usuarios.html", icon: "manage_accounts", label: "Usuarios" },
];

function expandirModulos(modulos, incluirAdminExtras = false) {
  const pages = new Set();
  const files = new Set();
  (Array.isArray(modulos) ? modulos : []).forEach((key) => {
    const def = MODULOS_CATALOGO[key];
    if (!def) return;
    def.pages.forEach((p) => pages.add(p));
    def.files.forEach((f) => files.add(f));
  });
  if (incluirAdminExtras) {
    pages.add("comentarios-admin");
    files.add("comentarios-admin.html");
  }
  return { pages: Array.from(pages), files: Array.from(files) };
}

function construirRolConfig(label, modulos, admin = false) {
  const { pages, files } = expandirModulos(modulos, admin);
  return { label, modulos, pages, files, admin };
}

const ROLES_CONFIG = {
  super_usuario: construirRolConfig(
    "Super Usuario",
    ["dashboard", "proyectos", "crm", "ofertas", "compras", "facturacion", "terceros", "empresas", "suministros", "usuarios"],
    true
  ),
  directivo: construirRolConfig(
    "Directivo",
    ["dashboard", "proyectos", "crm", "ofertas", "compras", "facturacion", "terceros", "empresas", "suministros"],
    false
  ),
  jefe_comercial: construirRolConfig(
    "Jefe Comercial",
    ["dashboard", "crm", "ofertas", "facturacion", "terceros"],
    false
  ),
  comercial: construirRolConfig(
    "Comercial",
    ["dashboard", "crm", "ofertas", "terceros"],
    false
  ),
  preventa: construirRolConfig(
    "Preventa / Ofertas",
    ["dashboard", "ofertas", "crm", "terceros"],
    false
  ),
  jefe_compras: construirRolConfig(
    "Jefe de Compras",
    ["dashboard", "compras", "suministros", "terceros", "proyectos"],
    false
  ),
  compras: construirRolConfig(
    "Compras",
    ["dashboard", "compras", "suministros", "terceros"],
    false
  ),
  proyectos: construirRolConfig(
    "Proyectos",
    ["dashboard", "proyectos", "terceros"],
    false
  ),
};

window.PCT_ROLES_CONFIG = ROLES_CONFIG;

function normalizarRol(rolRaw) {
  if (rolRaw === "admin") return "super_usuario";
  if (rolRaw === "miembro" || !rolRaw) return "proyectos";
  return ROLES_CONFIG[rolRaw] ? rolRaw : "proyectos";
}

function primeraPaginaPermitida(modulosActivos, archivoActual = "") {
  for (const key of modulosActivos || []) {
    const def = MODULOS_CATALOGO[key];
    if (def?.defaultHref && def.defaultHref.toLowerCase() !== String(archivoActual || "").toLowerCase()) {
      return def.defaultHref;
    }
  }
  return "perfil.html";
}

function logoSvg() {
  return `
    <svg viewBox="0 0 24 24" class="h-8 w-8 text-primary shrink-0" fill="currentColor" aria-hidden="true">
      <path d="M12 2 4 5v6c0 5.25 3.4 10.14 8 11.32C16.6 21.14 20 16.25 20 11V5l-8-3Zm0 2.18 6 2.25V11c0 4.28-2.7 8.24-6 9.28C8.7 19.24 6 15.28 6 11V6.43l6-2.25Z"/>
      <path d="m11 13.59-2.3-2.3-1.4 1.42L11 16.4l6.7-6.7-1.4-1.41L11 13.59Z"/>
    </svg>`;
}

function grupoNavAbierto(groupKey, activePage, items) {
  if (items.some((sub) => sub.page === activePage)) return true;
  try {
    const val = localStorage.getItem(`pctronic_nav_group_${groupKey}`);
    return val === null ? true : val === "1";
  } catch (e) {
    return true;
  }
}

function renderNavLinksHtml(activePage, allowedPages = null) {
  const linkItem = (item, esSubitem = false) => {
    const active = item.page === activePage;
    return `
      <a href="${item.href}" title="${escapeHtml(item.label)}"
         class="flex items-center gap-3 rounded-lg ${esSubitem ? "px-2.5 py-2 text-[13px]" : "px-3 py-2.5 text-sm"} font-medium transition-colors
           ${active ? "bg-blue-50 text-primary" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"}">
        <span class="material-symbols-outlined shrink-0 ${esSubitem ? "text-[18px]" : "text-[20px]"}">${item.icon}</span>
        <span class="nav-label truncate">${item.label}</span>
      </a>`;
  };

  return NAV_ITEMS.map((entry) => {
    if (entry.group) {
      const visibles = allowedPages
        ? entry.items.filter((sub) => allowedPages.includes(sub.page))
        : entry.items;
      if (!visibles.length) return "";
      const tieneActivo = visibles.some((sub) => sub.page === activePage);
      const abierto = grupoNavAbierto(entry.group, activePage, visibles);
      return `
        <div class="nav-group-wrap space-y-1">
          <button type="button" data-nav-group="${escapeHtml(entry.group)}" aria-expanded="${abierto ? "true" : "false"}"
             title="${escapeHtml(entry.label)}"
             class="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors
               ${tieneActivo ? "text-primary bg-blue-50/50" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"}">
            <span class="flex items-center gap-3 min-w-0">
              <span class="material-symbols-outlined shrink-0 text-[20px]">${entry.icon || "folder"}</span>
              <span class="nav-label truncate">${escapeHtml(entry.label)}</span>
            </span>
            <span class="nav-label material-symbols-outlined shrink-0 text-[18px] text-gray-400 transition-transform duration-150 ${abierto ? "rotate-180" : ""}" data-nav-chevron="${escapeHtml(entry.group)}">expand_more</span>
          </button>
          <div data-nav-sublist="${escapeHtml(entry.group)}" class="nav-sublist space-y-1 pl-3 ml-4 border-l border-gray-200 ${abierto ? "" : "hidden"}">
            ${visibles.map((sub) => linkItem(sub, true)).join("")}
          </div>
        </div>`;
    }
    if (allowedPages && !allowedPages.includes(entry.page)) return "";
    return linkItem(entry, false);
  }).join("");
}

function renderSidebar(activePage) {
  return `
  <aside id="app-aside" class="fixed inset-y-0 left-0 z-30 flex w-64 flex-col border-r border-gray-200 bg-white transition-[width] duration-150">
    <div class="flex items-center gap-3 px-5 py-5 border-b border-gray-100">
      ${logoSvg()}
      <div class="sidebar-brand-text leading-tight">
        <p class="text-sm font-bold text-gray-900">Pctronic</p>
        <p class="text-xs text-gray-500">Seguridad Electrónica</p>
      </div>
    </div>
    <nav class="flex-1 space-y-1 overflow-y-auto overflow-x-hidden px-3 py-4" id="nav-links">
      ${renderNavLinksHtml(activePage, null)}
      <div id="nav-admin-slot"></div>
    </nav>
    <div class="border-t border-gray-100 p-3 space-y-1">
      <button id="btn-toggle-sidebar" title="Ocultar / mostrar barra lateral"
        class="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900">
        <span class="material-symbols-outlined shrink-0 text-[20px]" id="btn-toggle-sidebar-icon">chevron_left</span>
        <span class="nav-label truncate">Ocultar barra</span>
      </button>
      <button id="btn-logout" title="Cerrar Sesión"
        class="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900">
        <span class="material-symbols-outlined shrink-0 text-[20px]">logout</span>
        <span class="nav-label truncate">Cerrar Sesión</span>
      </button>
    </div>
  </aside>`;
}

// --------------------------------------------------------------------
// Colapsar / mostrar la barra lateral (se recuerda entre sesiones).
// --------------------------------------------------------------------
const SIDEBAR_COLLAPSE_KEY = "pctronic_sidebar_colapsado";

function sidebarColapsadaGuardada() {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSE_KEY) === "1";
  } catch (e) {
    return false;
  }
}

function guardarEstadoSidebar(colapsada) {
  try {
    localStorage.setItem(SIDEBAR_COLLAPSE_KEY, colapsada ? "1" : "0");
  } catch (e) {
    /* almacenamiento no disponible; no es crítico */
  }
}

function aplicarEstadoSidebar(colapsada) {
  const aside = document.getElementById("app-aside");
  const wrapper = document.querySelector(".lg\\:pl-64");
  if (!aside) return;
  aside.classList.toggle("w-64", !colapsada);
  aside.classList.toggle("w-[72px]", colapsada);
  if (wrapper) {
    wrapper.classList.toggle("lg:pl-64", !colapsada);
    wrapper.classList.toggle("lg:pl-[72px]", colapsada);
  }
  aside.querySelectorAll(".nav-label, .sidebar-brand-text").forEach((el) => el.classList.toggle("hidden", colapsada));
  aside.querySelectorAll(".nav-sublist").forEach((el) => {
    el.classList.toggle("pl-3", !colapsada);
    el.classList.toggle("ml-4", !colapsada);
    el.classList.toggle("border-l", !colapsada);
  });
  const icono = document.getElementById("btn-toggle-sidebar-icon");
  if (icono) icono.textContent = colapsada ? "chevron_right" : "chevron_left";
}

function renderTopbar(titulo) {
  return `
  <header class="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-gray-200 bg-white px-6">
    <h1 class="text-lg font-bold text-gray-900">${escapeHtml(titulo || "")}</h1>
    <div class="flex items-center gap-2">
      <div class="relative" id="notif-wrap">
        <button type="button" id="btn-notif-mostrar" aria-label="Mostrar avisos" title="Avisos ocultos — clic para mostrar"
          class="hidden flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors">
          <span class="material-symbols-outlined text-[18px]" aria-hidden="true">notifications_off</span>
          <span class="hidden sm:inline">Mostrar avisos</span>
        </button>
        <button type="button" id="btn-notif-bell" aria-label="Notificaciones" aria-expanded="false" title="Notificaciones"
          class="relative flex h-9 w-9 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors">
          <span class="material-symbols-outlined text-[22px]" aria-hidden="true">notifications</span>
          <span id="notif-badge" class="hidden absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center leading-none">0</span>
        </button>
        <div id="notif-popover" class="hidden absolute right-0 mt-2 w-80 sm:w-96 rounded-xl border border-gray-200 bg-white shadow-xl z-50 overflow-hidden">
          <div class="flex items-center justify-between border-b border-gray-100 px-4 py-3 bg-gray-50/70">
            <span class="text-xs font-bold uppercase tracking-wider text-gray-700">Notificaciones</span>
            <button type="button" id="btn-notif-marcar-todas" class="text-[11px] font-semibold text-primary hover:underline">
              Marcar todas como leídas
            </button>
          </div>
          <div id="notif-lista" class="max-h-80 overflow-y-auto divide-y divide-gray-100">
            <p class="px-4 py-6 text-center text-xs text-gray-400">Sin notificaciones recientes.</p>
          </div>
          <div class="flex items-center justify-between border-t border-gray-100 bg-gray-50/70 px-4 py-2">
            <span class="text-[11px] text-gray-400">¿Pantalla limpia?</span>
            <button type="button" id="btn-notif-ocultar"
              class="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-200 hover:text-gray-900 transition-colors">
              <span class="material-symbols-outlined text-[15px]" aria-hidden="true">notifications_off</span>
              <span>Ocultar avisos</span>
            </button>
          </div>
        </div>
      </div>
      <a href="perfil.html" class="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-gray-50" title="Mi perfil">
        <div class="text-right leading-tight hidden sm:block">
          <p id="topbar-nombre" class="text-sm font-semibold text-gray-800">—</p>
          <p id="topbar-rol" class="text-xs text-gray-500">—</p>
        </div>
        <div class="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-primary font-bold text-sm bg-cover bg-center" id="topbar-avatar">
          ?
        </div>
      </a>
    </div>
  </header>`;
}

function sanitizarUrlNotif(rawUrl) {
  const s = String(rawUrl || "").trim();
  if (!s) return "";
  if (/^[a-z0-9_\-]+\.html([?#][^\s<>'"]*)?$/i.test(s)) return s;
  if (typeof urlSegura === "function") return urlSegura(s);
  return "";
}

function tiempoRelativoNotif(fechaIso) {
  if (!fechaIso) return "";
  const d = new Date(fechaIso);
  if (isNaN(d.getTime())) return "";
  const diffSeg = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (diffSeg < 60) return "Hace un momento";
  const mins = Math.floor(diffSeg / 60);
  if (mins < 60) return `Hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Hace ${hrs} h`;
  const dias = Math.floor(hrs / 24);
  if (dias < 30) return `Hace ${dias} d`;
  return typeof formatoFecha === "function" ? formatoFecha(fechaIso) : d.toLocaleDateString("es-CO");
}

window.PCT_NOTIFICAR = async function ({ tipo = "info", titulo, mensaje = "", url = null, rol_destino = null, usuario_destino = null, proyecto_id = null } = {}) {
  if (!titulo || !window.sb) return;
  try {
    const { data: sessionData } = await window.sb.auth.getSession();
    const uid = sessionData?.session?.user?.id || null;
    const roles = Array.isArray(rol_destino)
      ? rol_destino
      : rol_destino
        ? [rol_destino]
        : usuario_destino
          ? []
          : ["super_usuario", "directivo", "proyectos"];
    const { error } = await window.sb.from("notificaciones").insert({
      tipo,
      titulo: String(titulo).slice(0, 200),
      mensaje: String(mensaje || "").slice(0, 500),
      url: url || null,
      rol_destino: roles,
      usuario_destino: usuario_destino || null,
      proyecto_id: proyecto_id || null,
      leida_por: [],
      creado_por: uid,
    });
    if (error) return;
  } catch (e) {
    // Silencioso si la tabla `notificaciones` aún no ha sido migrada
  }
};

const NOTIF_HIDE_KEY = "pctronic_ocultar_notificaciones";
const FEEDBACK_HIDE_KEY = "pctronic_ocultar_mejoras";

function leerFlagLocalStorage(key) {
  try {
    return localStorage.getItem(key) === "1";
  } catch (e) {
    return false;
  }
}

function guardarFlagLocalStorage(key, activo) {
  try {
    localStorage.setItem(key, activo ? "1" : "0");
  } catch (e) {
    /* almacenamiento no disponible */
  }
}

function inicializarNotificaciones({ session, rolNorm }) {
  const wrap = document.getElementById("notif-wrap");
  const btn = document.getElementById("btn-notif-bell");
  const btnMostrar = document.getElementById("btn-notif-mostrar");
  const btnOcultar = document.getElementById("btn-notif-ocultar");
  const badge = document.getElementById("notif-badge");
  const popover = document.getElementById("notif-popover");
  const listaEl = document.getElementById("notif-lista");
  const btnMarcarTodas = document.getElementById("btn-notif-marcar-todas");
  if (!wrap || !btn || !badge || !popover || !listaEl || !session?.user?.id) return;

  const uid = session.user.id;
  let items = [];
  let tablaDisponible = true;
  let avisosOcultos = leerFlagLocalStorage(NOTIF_HIDE_KEY);

  const aplicarVisibilidadAvisos = () => {
    btn.classList.toggle("hidden", avisosOcultos);
    if (btnMostrar) btnMostrar.classList.toggle("hidden", !avisosOcultos);
    if (avisosOcultos) {
      popover.classList.add("hidden");
      btn.setAttribute("aria-expanded", "false");
      badge.classList.add("hidden");
    }
  };

  aplicarVisibilidadAvisos();

  btnOcultar?.addEventListener("click", (e) => {
    e.stopPropagation();
    avisosOcultos = true;
    guardarFlagLocalStorage(NOTIF_HIDE_KEY, true);
    aplicarVisibilidadAvisos();
    if (typeof mostrarAviso === "function") {
      mostrarAviso("Avisos ocultos. Usa «Mostrar avisos» arriba para restaurarlos.", "info");
    }
  });

  btnMostrar?.addEventListener("click", (e) => {
    e.stopPropagation();
    avisosOcultos = false;
    guardarFlagLocalStorage(NOTIF_HIDE_KEY, false);
    aplicarVisibilidadAvisos();
    pintar();
    cargar();
  });

  const esNoLeida = (n) => !Array.isArray(n.leida_por) || !n.leida_por.includes(uid);

  const iconoPorTipo = (tipo) => {
    const mapa = {
      nuevo_proyecto: "rocket_launch",
      corte_facturado: "receipt_long",
      compra: "shopping_cart",
      oferta: "assignment",
      alerta: "warning",
    };
    return mapa[tipo] || "notifications";
  };

  const pintar = () => {
    const noLeidas = items.filter(esNoLeida).length;
    if (!avisosOcultos && noLeidas > 0) {
      badge.textContent = noLeidas > 9 ? "9+" : String(noLeidas);
      badge.classList.remove("hidden");
    } else {
      badge.textContent = "0";
      badge.classList.add("hidden");
    }

    if (!items.length) {
      listaEl.innerHTML = `<p class="px-4 py-6 text-center text-xs text-gray-400">No tienes notificaciones por ahora.</p>`;
      return;
    }

    listaEl.innerHTML = items
      .map((n) => {
        const unread = esNoLeida(n);
        const href = sanitizarUrlNotif(n.url);
        return `
          <div data-notif-id="${escapeHtml(n.id)}" data-notif-url="${escapeHtml(href)}"
            class="flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors ${unread ? "bg-blue-50/60 hover:bg-blue-50" : "bg-white hover:bg-gray-50"}">
            <div class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${unread ? "bg-primary text-white" : "bg-gray-100 text-gray-500"}">
              <span class="material-symbols-outlined text-[15px]" aria-hidden="true">${iconoPorTipo(n.tipo)}</span>
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex items-center justify-between gap-2">
                <p class="text-xs font-semibold text-gray-900 truncate">${escapeHtml(n.titulo || "Notificación")}</p>
                ${unread ? `<span class="h-2 w-2 shrink-0 rounded-full bg-primary" title="No leída"></span>` : ""}
              </div>
              ${n.mensaje ? `<p class="mt-0.5 text-[11px] text-gray-600 line-clamp-2">${escapeHtml(n.mensaje)}</p>` : ""}
              <p class="mt-1 text-[10px] text-gray-400">${escapeHtml(tiempoRelativoNotif(n.created_at))}</p>
            </div>
          </div>`;
      })
      .join("");
  };

  const cargar = async () => {
    if (!tablaDisponible) return;
    try {
      const { data, error } = await window.sb
        .from("notificaciones")
        .select("id, created_at, tipo, titulo, mensaje, url, rol_destino, usuario_destino, proyecto_id, leida_por, creado_por")
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) {
        tablaDisponible = false;
        items = [];
        pintar();
        return;
      }
      const raw = data || [];
      items = raw
        .filter((n) => {
          const roles = Array.isArray(n.rol_destino) ? n.rol_destino : [];
          if (n.usuario_destino && n.usuario_destino === uid) return true;
          if (roles.length && (roles.includes(rolNorm) || (rolNorm === "super_usuario" && roles.includes("admin")))) return true;
          return !n.usuario_destino && roles.length === 0;
        })
        .slice(0, 20);
      pintar();
    } catch (e) {
      tablaDisponible = false;
      items = [];
      pintar();
    }
  };

  const marcarLeida = async (notif) => {
    if (!notif || !esNoLeida(notif) || !tablaDisponible) return;
    const nuevoArr = Array.from(new Set([...(Array.isArray(notif.leida_por) ? notif.leida_por : []), uid]));
    notif.leida_por = nuevoArr;
    pintar();
    try {
      if (typeof window.sb?.rpc === "function") {
        const { error: rpcErr } = await window.sb.rpc("rpc_marcar_notificacion_leida", { p_id: notif.id });
        if (!rpcErr) return;
      }
      await window.sb.from("notificaciones").update({ leida_por: nuevoArr }).eq("id", notif.id);
    } catch (e) {
      /* silencioso */
    }
  };

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const abierto = popover.classList.toggle("hidden") === false;
    btn.setAttribute("aria-expanded", abierto ? "true" : "false");
    if (abierto) cargar();
  });

  btnMarcarTodas?.addEventListener("click", async (e) => {
    e.stopPropagation();
    const pendientes = items.filter(esNoLeida);
    if (!pendientes.length || !tablaDisponible) return;
    const actualizaciones = pendientes.map((n) => {
      const nuevoArr = Array.from(new Set([...(Array.isArray(n.leida_por) ? n.leida_por : []), uid]));
      n.leida_por = nuevoArr;
      return { id: n.id, leida_por: nuevoArr };
    });
    pintar();
    try {
      if (typeof window.sb?.rpc === "function") {
        const { error: rpcErr } = await window.sb.rpc("rpc_marcar_todas_notificaciones_leidas");
        if (!rpcErr) return;
      }
      await Promise.all(
        actualizaciones.map((a) => window.sb.from("notificaciones").update({ leida_por: a.leida_por }).eq("id", a.id))
      );
    } catch (err) {
      /* silencioso */
    }
  });

  listaEl.addEventListener("click", async (e) => {
    const row = e.target.closest("[data-notif-id]");
    if (!row) return;
    const notif = items.find((x) => String(x.id) === String(row.dataset.notifId));
    const url = row.dataset.notifUrl;
    if (notif) await marcarLeida(notif);
    popover.classList.add("hidden");
    btn.setAttribute("aria-expanded", "false");
    if (url) window.location.href = url;
  });

  document.addEventListener("click", (e) => {
    if (!popover.classList.contains("hidden") && !wrap.contains(e.target)) {
      popover.classList.add("hidden");
      btn.setAttribute("aria-expanded", "false");
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !popover.classList.contains("hidden")) {
      popover.classList.add("hidden");
      btn.setAttribute("aria-expanded", "false");
    }
  });

  cargar();
}

async function inicializarApp() {
  const page = document.body.dataset.page || "";
  const titulo = document.body.dataset.title || "";

  const {
    data: { session },
  } = await window.sb.auth.getSession();

  if (!session) {
    if (page !== "login") {
      document.body.style.display = "none";
      window.location.href = "login.html";
    }
    return { session: null, profile: null };
  }

  if (page === "login") {
    window.location.href = "dashboard.html";
    return { session, profile: null };
  }

  const sidebarEl = document.getElementById("app-sidebar");
  const topbarEl = document.getElementById("app-topbar");
  if (sidebarEl) sidebarEl.innerHTML = renderSidebar(page);
  if (topbarEl) topbarEl.innerHTML = renderTopbar(titulo);

  let colapsada = sidebarColapsadaGuardada();
  aplicarEstadoSidebar(colapsada);
  const btnToggleSidebar = document.getElementById("btn-toggle-sidebar");
  if (btnToggleSidebar) {
    btnToggleSidebar.addEventListener("click", () => {
      colapsada = !colapsada;
      aplicarEstadoSidebar(colapsada);
      guardarEstadoSidebar(colapsada);
    });
  }
  if (sidebarEl) {
    sidebarEl.addEventListener("click", (ev) => {
      const btn = ev.target.closest("[data-nav-group]");
      if (!btn) return;
      const groupKey = btn.dataset.navGroup;
      const sublist = sidebarEl.querySelector(`[data-nav-sublist="${groupKey}"]`);
      const chevron = sidebarEl.querySelector(`[data-nav-chevron="${groupKey}"]`);
      if (!sublist) return;
      const ahoraAbierto = sublist.classList.toggle("hidden") === false;
      btn.setAttribute("aria-expanded", ahoraAbierto ? "true" : "false");
      if (chevron) chevron.classList.toggle("rotate-180", ahoraAbierto);
      try {
        localStorage.setItem(`pctronic_nav_group_${groupKey}`, ahoraAbierto ? "1" : "0");
      } catch (e) { /* sin localStorage */ }
    });
  }

  const PROFILE_CACHE_KEY = "pct_profile_cache_v2";
  const PROFILE_CACHE_TTL_MS = 3 * 60 * 1000;
  window.PCT_INVALIDAR_CACHE_PERFIL = () => {
    try {
      sessionStorage.removeItem(PROFILE_CACHE_KEY);
      sessionStorage.removeItem("pct_profile_cache");
    } catch (e) { /* noop */ }
  };

  let profile = null;
  try {
    const rawCache = sessionStorage.getItem(PROFILE_CACHE_KEY);
    if (rawCache) {
      const parsed = JSON.parse(rawCache);
      if (parsed && parsed.uid === session.user.id && Date.now() - parsed.ts < PROFILE_CACHE_TTL_MS) {
        profile = parsed.data;
      }
    }
  } catch (e) { /* sin sessionStorage */ }

  if (!profile) {
    try {
      const { data, error } = await window.sb
        .from("profiles")
        .select("*")
        .eq("id", session.user.id)
        .single();
      if (!error && data) {
        profile = data;
        try {
          sessionStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify({ uid: session.user.id, ts: Date.now(), data }));
        } catch (e) { /* sin sessionStorage */ }
      }
    } catch (e) {
      console.warn("No se pudo cargar el perfil", e);
    }
  }

  const rolRaw = profile?.rol || "miembro";
  const rolNorm = normalizarRol(rolRaw);
  const rolCfg = ROLES_CONFIG[rolNorm] || ROLES_CONFIG.proyectos;
  const esSuperUsuario = rolNorm === "super_usuario";
  const esDirectivo = rolNorm === "directivo";

  const modulosPersonalizadosRaw = !esSuperUsuario && Array.isArray(profile?.modulos_permitidos)
    ? profile.modulos_permitidos.filter((m) => Boolean(MODULOS_CATALOGO[m]))
    : [];
  const usaModulosPersonalizados = modulosPersonalizadosRaw.length > 0;
  const modulosActivos = usaModulosPersonalizados ? modulosPersonalizadosRaw : rolCfg.modulos;
  const expandido = expandirModulos(modulosActivos, esSuperUsuario);
  const allowedPages = expandido.pages;
  const allowedFiles = expandido.files;

  window.PCT_ROL_INFO = {
    rolRaw,
    rol: rolNorm,
    label: rolCfg.label,
    modulos: modulosActivos,
    pages: allowedPages,
    files: allowedFiles,
    usaModulosPersonalizados,
    esSuperUsuario,
    esDirectivo,
    puedeAprobarCompras: esSuperUsuario || esDirectivo,
    puedeEliminar: esSuperUsuario,
    puedeEliminarCompras: esSuperUsuario,
    puedeVerTodosProyectos: rolNorm !== "proyectos",
    puedeReasignarCoordinador: esSuperUsuario || esDirectivo,
    puedeVerTodoCRM: esSuperUsuario || esDirectivo || rolNorm === "jefe_comercial" || rolNorm === "preventa",
  };

  // Guardia de ruta por rol / módulos permitidos
  const paginasLibres = new Set(["perfil", "index", "login", ""]);
  const archivoActual = (window.location.pathname.split("/").pop() || "").toLowerCase();
  const esArchivoLibre = ["perfil.html", "index.html", "login.html", ""].includes(archivoActual);
  const esPaginaAdmin = page === "usuarios" || archivoActual === "usuarios.html";
  const paginaPermitida = esPaginaAdmin
    ? Boolean(rolCfg.admin)
    : paginasLibres.has(page) ||
      esArchivoLibre ||
      allowedPages.includes(page) ||
      (archivoActual && allowedFiles.includes(archivoActual));

  if (!paginaPermitida) {
    document.body.style.display = "none";
    window.location.href = primeraPaginaPermitida(modulosActivos, archivoActual);
    return new Promise(() => {});
  }

  const navLinksEl = document.getElementById("nav-links");
  if (navLinksEl) {
    navLinksEl.innerHTML = `${renderNavLinksHtml(page, allowedPages)}<div id="nav-admin-slot"></div>`;
    aplicarEstadoSidebar(colapsada);
  }

  const nombre = profile?.nombre_completo || session.user.email;
  const rol = rolCfg.label;

  const nombreEl = document.getElementById("topbar-nombre");
  const rolEl = document.getElementById("topbar-rol");
  const avatarEl = document.getElementById("topbar-avatar");
  if (nombreEl) nombreEl.textContent = nombre;
  if (rolEl) rolEl.textContent = rol;
  if (avatarEl) {
    const avatarUrl = typeof profile?.avatar_url === "string" ? profile.avatar_url.trim() : "";
    const esDataImg = /^data:image\/(png|jpeg|jpg|webp|gif);base64,[a-z0-9+/=]+$/i.test(avatarUrl);
    const urlHttps = typeof urlSegura === "function" ? urlSegura(avatarUrl) : "";
    const esHttps = /^https:\/\//i.test(urlHttps);
    const urlFinal = esDataImg ? avatarUrl : esHttps ? urlHttps : "";
    if (urlFinal) {
      avatarEl.textContent = "";
      avatarEl.style.backgroundImage = `url('${urlFinal.replace(/['"\\()\r\n]/g, "\\$&")}')`;
    } else {
      avatarEl.style.backgroundImage = "";
      avatarEl.textContent = (nombre || "?").trim().charAt(0).toUpperCase();
    }
  }

  if (rolCfg.admin) {
    const slot = document.getElementById("nav-admin-slot");
    if (slot) {
      slot.innerHTML = NAV_ITEMS_ADMIN.map((item) => {
        const active = item.page === page;
        return `
        <a href="${item.href}" title="${escapeHtml(item.label)}"
           class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors
             ${active ? "bg-blue-50 text-primary" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"}">
          <span class="material-symbols-outlined shrink-0 text-[20px]">${item.icon}</span>
          <span class="nav-label truncate">${item.label}</span>
        </a>`;
      }).join("");
    }
  }

  aplicarEstadoSidebar(colapsada);

  const btnLogout = document.getElementById("btn-logout");
  if (btnLogout) {
    btnLogout.addEventListener("click", async () => {
      window.PCT_INVALIDAR_CACHE_PERFIL();
      await window.sb.auth.signOut();
      window.location.href = "login.html";
    });
  }

  if (session && page !== "login" && page !== "index") {
    inicializarNotificaciones({ session, rolNorm });
    montarBurbujaFeedback({ session, profile, page, title: titulo, rolNorm });
  }

  return { session, profile };
}

function montarBurbujaFeedback({ session, profile, page, title, rolNorm }) {
  if (!session || document.getElementById("feedback-bubble-btn") || document.getElementById("feedback-drawer")) {
    return;
  }

  const moduloActual = title || page || "Plataforma";

  const bubbleWrap = document.createElement("div");
  bubbleWrap.id = "feedback-bubble-wrap";
  bubbleWrap.className = "fixed right-0 top-1/2 -translate-y-1/2 z-40 flex flex-col items-end gap-1";

  const hideBtn = document.createElement("button");
  hideBtn.type = "button";
  hideBtn.id = "feedback-hide-btn";
  hideBtn.setAttribute("aria-label", "Ocultar pestaña de Mejoras");
  hideBtn.title = "Ocultar pestaña de Mejoras";
  hideBtn.className =
    "flex h-5 w-5 items-center justify-center rounded-full bg-gray-900 text-white opacity-75 hover:opacity-100 shadow transition-opacity";
  hideBtn.innerHTML = `<span class="material-symbols-outlined text-[13px]" aria-hidden="true">close</span>`;

  const bubbleBtn = document.createElement("button");
  bubbleBtn.type = "button";
  bubbleBtn.id = "feedback-bubble-btn";
  bubbleBtn.setAttribute("aria-label", "Enviar comentario o mejora de la plataforma");
  bubbleBtn.title = "Enviar mejora o comentario";
  bubbleBtn.className =
    "rounded-l-2xl bg-primary text-white shadow-lg hover:bg-blue-700 transition-all px-2.5 py-3 flex flex-col items-center gap-1";
  bubbleBtn.innerHTML = `
    <span class="material-symbols-outlined text-[20px]" aria-hidden="true">rate_review</span>
    <span class="text-[11px] font-semibold tracking-tight">Mejoras</span>
  `;

  bubbleWrap.appendChild(hideBtn);
  bubbleWrap.appendChild(bubbleBtn);

  const restoreBtn = document.createElement("button");
  restoreBtn.type = "button";
  restoreBtn.id = "feedback-restore-btn";
  restoreBtn.setAttribute("aria-label", "Mostrar pestaña de Mejoras");
  restoreBtn.title = "Mostrar pestaña de Mejoras";
  restoreBtn.className =
    "hidden fixed right-0 top-1/2 -translate-y-1/2 z-40 rounded-l-lg border border-gray-200 bg-white text-gray-500 shadow hover:bg-primary hover:text-white transition-all p-1.5 opacity-75 hover:opacity-100";
  restoreBtn.innerHTML = `<span class="material-symbols-outlined text-[16px]" aria-hidden="true">chevron_left</span>`;

  const drawer = document.createElement("div");
  drawer.id = "feedback-drawer";
  drawer.className = "fixed inset-0 z-50 hidden";
  drawer.setAttribute("role", "dialog");
  drawer.setAttribute("aria-modal", "true");
  drawer.setAttribute("aria-labelledby", "feedback-drawer-title");
  drawer.innerHTML = `
    <div id="feedback-backdrop" class="fixed inset-0 bg-gray-900/40 backdrop-blur-[1px]"></div>
    <div class="fixed inset-y-0 right-0 flex max-w-full pl-10">
      <div class="w-screen max-w-md bg-white shadow-2xl border-l border-gray-200 flex flex-col">
        <div class="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <div class="flex items-center gap-2.5 min-w-0">
            <span class="material-symbols-outlined text-primary text-[22px]" aria-hidden="true">rate_review</span>
            <div class="min-w-0">
              <h2 id="feedback-drawer-title" class="text-base font-bold text-gray-900 truncate">Comentarios y Mejoras</h2>
              <p class="text-xs text-gray-500 truncate">Envía sugerencias o reporta un detalle</p>
            </div>
          </div>
          <button type="button" id="feedback-close-btn" aria-label="Cerrar panel"
            class="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors">
            <span class="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <form id="feedback-form" class="flex-1 overflow-y-auto p-5 space-y-4">
          <div class="flex items-center justify-between rounded-lg bg-blue-50 border border-blue-100 px-3 py-2 text-xs text-blue-900">
            <span class="font-medium">Módulo actual:</span>
            <span class="rounded-full bg-white px-2.5 py-0.5 font-semibold text-primary border border-blue-200 truncate max-w-[220px]">
              ${escapeHtml(moduloActual)}
            </span>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label for="feedback-tipo" class="block text-xs font-semibold text-gray-700 mb-1">Tipo</label>
              <select id="feedback-tipo" name="tipo"
                class="w-full rounded-lg border-gray-300 text-sm focus:border-primary focus:ring-primary">
                <option value="mejora">Mejora / Sugerencia</option>
                <option value="comentario">Comentario general</option>
                <option value="error">Reportar problema</option>
              </select>
            </div>
            <div>
              <label for="feedback-prioridad" class="block text-xs font-semibold text-gray-700 mb-1">Prioridad</label>
              <select id="feedback-prioridad" name="prioridad"
                class="w-full rounded-lg border-gray-300 text-sm focus:border-primary focus:ring-primary">
                <option value="media" selected>Media</option>
                <option value="baja">Baja</option>
                <option value="alta">Alta</option>
              </select>
            </div>
          </div>

          <div>
            <label for="feedback-titulo" class="block text-xs font-semibold text-gray-700 mb-1">Título (opcional)</label>
            <input type="text" id="feedback-titulo" name="titulo" maxlength="140"
              placeholder="Ej. Filtro por fecha en cotizaciones"
              class="w-full rounded-lg border-gray-300 text-sm focus:border-primary focus:ring-primary" />
          </div>

          <div>
            <label for="feedback-mensaje" class="block text-xs font-semibold text-gray-700 mb-1">
              Detalle <span class="text-red-500">*</span>
            </label>
            <textarea id="feedback-mensaje" name="mensaje" rows="5" required maxlength="2000"
              placeholder="Describe tu sugerencia, comentario o el problema que encontraste…"
              class="w-full rounded-lg border-gray-300 text-sm focus:border-primary focus:ring-primary"></textarea>
            <p class="mt-1 text-[11px] text-gray-400">Máximo 2000 caracteres. Solo visible para el administrador.</p>
          </div>

          <div class="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
            <button type="button" id="feedback-cancel-btn"
              class="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Cancelar
            </button>
            <button type="submit" id="feedback-submit-btn"
              class="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
              <span class="material-symbols-outlined text-[18px]" aria-hidden="true">send</span>
              <span>Enviar</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  `;

  document.body.appendChild(bubbleWrap);
  document.body.appendChild(restoreBtn);
  document.body.appendChild(drawer);

  const aplicarVisibilidadMejoras = (oculto) => {
    bubbleWrap.classList.toggle("hidden", oculto);
    restoreBtn.classList.toggle("hidden", !oculto);
  };
  aplicarVisibilidadMejoras(leerFlagLocalStorage(FEEDBACK_HIDE_KEY));

  hideBtn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    guardarFlagLocalStorage(FEEDBACK_HIDE_KEY, true);
    aplicarVisibilidadMejoras(true);
  });

  restoreBtn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    guardarFlagLocalStorage(FEEDBACK_HIDE_KEY, false);
    aplicarVisibilidadMejoras(false);
  });

  const form = document.getElementById("feedback-form");
  const backdrop = document.getElementById("feedback-backdrop");
  const closeBtn = document.getElementById("feedback-close-btn");
  const cancelBtn = document.getElementById("feedback-cancel-btn");
  const submitBtn = document.getElementById("feedback-submit-btn");
  const tituloInput = document.getElementById("feedback-titulo");
  const mensajeInput = document.getElementById("feedback-mensaje");

  const abrirDrawer = () => {
    drawer.classList.remove("hidden");
    setTimeout(() => {
      if (tituloInput) tituloInput.focus();
    }, 30);
  };

  const cerrarDrawer = () => {
    drawer.classList.add("hidden");
  };

  bubbleBtn.addEventListener("click", abrirDrawer);
  if (closeBtn) closeBtn.addEventListener("click", cerrarDrawer);
  if (cancelBtn) cancelBtn.addEventListener("click", cerrarDrawer);
  if (backdrop) backdrop.addEventListener("click", cerrarDrawer);

  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && !drawer.classList.contains("hidden")) {
      cerrarDrawer();
    }
  });

  if (form) {
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const tipo = document.getElementById("feedback-tipo")?.value || "mejora";
      const prioridad = document.getElementById("feedback-prioridad")?.value || "media";
      const tituloVal = (tituloInput?.value || "").trim();
      const mensajeVal = (mensajeInput?.value || "").trim();

      if (!mensajeVal) {
        if (typeof mostrarAviso === "function") {
          mostrarAviso("Por favor escribe el detalle de tu comentario.", "error");
        }
        return;
      }

      if (submitBtn) submitBtn.disabled = true;
      try {
        const { error } = await window.sb.from("feedback_plataforma").insert({
          usuario_id: session.user.id,
          usuario_nombre: profile?.nombre_completo || session.user.email || "",
          usuario_email: session.user.email || "",
          usuario_rol: rolNorm || "",
          pagina: page || "",
          url: `${window.location.pathname}${window.location.search}`,
          tipo,
          prioridad,
          titulo: tituloVal,
          mensaje: mensajeVal,
        });
        if (error) {
          if (typeof manejarError === "function") {
            manejarError(error, "No se pudo enviar tu comentario");
          } else if (typeof mostrarAviso === "function") {
            mostrarAviso("No se pudo enviar tu comentario.", "error");
          }
          return;
        }

        if (typeof mostrarAviso === "function") {
          mostrarAviso("¡Gracias! Tu comentario fue enviado al administrador.", "exito");
        }
        form.reset();
        cerrarDrawer();
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }
}

// Otras páginas hacen: const { session, profile } = await window.pctronicReady;
window.pctronicReady = inicializarApp();
