// ============================================================================
// Barra lateral + encabezado + control de acceso (login obligatorio).
// Se incluye en TODAS las páginas protegidas para que se vean idénticas.
// ============================================================================

const NAV_ITEMS = [
  { page: "dashboard", href: "dashboard.html", icon: "dashboard", label: "Panel Principal" },
  {
    group: "comercial",
    label: "Comercial",
    items: [
      { page: "crm", href: "crm.html", icon: "handshake", label: "CRM Comercial" },
      { page: "ofertas", href: "ofertas.html", icon: "assignment", label: "Ofertas Pre-venta" },
    ],
  },
  { page: "proyectos", href: "proyectos.html", icon: "folder_open", label: "Proyectos" },
  { page: "compras", href: "compras.html", icon: "shopping_cart", label: "Compras" },
  { page: "facturacion", href: "facturacion.html", icon: "receipt_long", label: "Facturación" },
  { page: "terceros", href: "terceros.html", icon: "groups", label: "Terceros" },
  { page: "empresas", href: "empresas.html", icon: "domain", label: "Empresas" },
];

const NAV_ITEMS_ADMIN = [
  { page: "usuarios", href: "usuarios.html", icon: "manage_accounts", label: "Usuarios" },
];

const ROLES_CONFIG = {
  super_usuario: {
    label: "Super Usuario",
    pages: ["dashboard", "crm", "ofertas", "proyectos", "compras", "facturacion", "terceros", "empresas", "usuarios"],
    admin: true,
  },
  directivo: {
    label: "Directivo",
    pages: ["dashboard", "crm", "ofertas", "proyectos", "compras", "facturacion", "terceros", "empresas"],
    admin: false,
  },
  comercial: {
    label: "Comercial",
    pages: ["dashboard", "crm", "ofertas", "terceros"],
    admin: false,
  },
  proyectos: {
    label: "Proyectos",
    pages: ["dashboard", "proyectos", "terceros"],
    admin: false,
  },
  compras: {
    label: "Compras",
    pages: ["dashboard", "compras", "terceros"],
    admin: false,
  },
};

function normalizarRol(rolRaw) {
  if (rolRaw === "admin") return "super_usuario";
  if (rolRaw === "miembro" || !rolRaw) return "proyectos";
  return ROLES_CONFIG[rolRaw] ? rolRaw : "proyectos";
}

function logoSvg() {
  return `
    <svg viewBox="0 0 24 24" class="h-8 w-8 text-primary shrink-0" fill="currentColor" aria-hidden="true">
      <path d="M12 2 4 5v6c0 5.25 3.4 10.14 8 11.32C16.6 21.14 20 16.25 20 11V5l-8-3Zm0 2.18 6 2.25V11c0 4.28-2.7 8.24-6 9.28C8.7 19.24 6 15.28 6 11V6.43l6-2.25Z"/>
      <path d="m11 13.59-2.3-2.3-1.4 1.42L11 16.4l6.7-6.7-1.4-1.41L11 13.59Z"/>
    </svg>`;
}

function renderNavLinksHtml(activePage, allowedPages = null) {
  const linkItem = (item) => {
    const active = item.page === activePage;
    return `
      <a href="${item.href}" title="${escapeHtml(item.label)}"
         class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors
           ${active ? "bg-blue-50 text-primary" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"}">
        <span class="material-symbols-outlined shrink-0 text-[20px]">${item.icon}</span>
        <span class="nav-label truncate">${item.label}</span>
      </a>`;
  };

  return NAV_ITEMS.map((entry) => {
    if (entry.group) {
      const visibles = allowedPages
        ? entry.items.filter((sub) => allowedPages.includes(sub.page))
        : entry.items;
      if (!visibles.length) return "";
      return `
        <div class="pt-2 pb-1">
          <p class="nav-label px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">${escapeHtml(entry.label)}</p>
          <div class="space-y-1">${visibles.map(linkItem).join("")}</div>
        </div>`;
    }
    if (allowedPages && !allowedPages.includes(entry.page)) return "";
    return linkItem(entry);
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
  const icono = document.getElementById("btn-toggle-sidebar-icon");
  if (icono) icono.textContent = colapsada ? "chevron_right" : "chevron_left";
}

function renderTopbar(titulo) {
  return `
  <header class="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-gray-200 bg-white px-6">
    <h1 class="text-lg font-bold text-gray-900">${escapeHtml(titulo || "")}</h1>
    <a href="perfil.html" class="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-gray-50" title="Mi perfil">
      <div class="text-right leading-tight hidden sm:block">
        <p id="topbar-nombre" class="text-sm font-semibold text-gray-800">—</p>
        <p id="topbar-rol" class="text-xs text-gray-500">—</p>
      </div>
      <div class="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-primary font-bold text-sm bg-cover bg-center" id="topbar-avatar">
        ?
      </div>
    </a>
  </header>`;
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

  let profile = null;
  try {
    const { data, error } = await window.sb
      .from("profiles")
      .select("nombre_completo, rol, cargo, telefono, avatar_url")
      .eq("id", session.user.id)
      .single();
    if (!error) profile = data;
  } catch (e) {
    console.warn("No se pudo cargar el perfil", e);
  }

  const rolRaw = profile?.rol || "miembro";
  const rolNorm = normalizarRol(rolRaw);
  const rolCfg = ROLES_CONFIG[rolNorm] || ROLES_CONFIG.proyectos;

  window.PCT_ROL_INFO = {
    rolRaw,
    rol: rolNorm,
    label: rolCfg.label,
    pages: rolCfg.pages,
    esSuperUsuario: rolNorm === "super_usuario",
    esDirectivo: rolNorm === "directivo",
    puedeAprobarCompras: rolNorm === "super_usuario" || rolNorm === "directivo",
    puedeEliminar: rolNorm === "super_usuario",
  };

  const navLinksEl = document.getElementById("nav-links");
  if (navLinksEl) {
    navLinksEl.innerHTML = `${renderNavLinksHtml(page, rolCfg.pages)}<div id="nav-admin-slot"></div>`;
  }

  const nombre = profile?.nombre_completo || session.user.email;
  const rol = rolCfg.label;

  const nombreEl = document.getElementById("topbar-nombre");
  const rolEl = document.getElementById("topbar-rol");
  const avatarEl = document.getElementById("topbar-avatar");
  if (nombreEl) nombreEl.textContent = nombre;
  if (rolEl) rolEl.textContent = rol;
  if (avatarEl) {
    const avatarUrl = profile?.avatar_url;
    const esUrlSegura = typeof avatarUrl === "string" && /^(https?:\/\/|data:image\/)/i.test(avatarUrl);
    if (esUrlSegura) {
      avatarEl.textContent = "";
      avatarEl.style.backgroundImage = `url('${avatarUrl.replace(/'/g, "\\'")}')`;
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
      await window.sb.auth.signOut();
      window.location.href = "login.html";
    });
  }

  return { session, profile };
}

// Otras páginas hacen: const { session, profile } = await window.pctronicReady;
window.pctronicReady = inicializarApp();
