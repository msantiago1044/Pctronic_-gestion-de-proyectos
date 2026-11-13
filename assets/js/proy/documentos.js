// ============================================================================
// PROYECTOS · pestaña DOCUMENTOS (contratos, planos, pólizas, soportes...).
// Los archivos viven en el bucket de Supabase "documentos".
// ============================================================================
(function (PCT) {
  const CATEGORIAS = {
    contrato: "Contrato",
    cotizacion: "Cotización final",
    planos: "Planos",
    polizas: "Pólizas",
    orden_compra: "Orden de compra",
    acta_entrega: "Acta de entrega",
    corte: "Corte / soporte",
    otro: "Otro",
  };

  PCT.renderDocumentos = async (root) => {
    const pid = PCT.estado.proyecto.id;
    let docs = [];
    let filtro = "";

    root.innerHTML = `
      <div class="space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <p class="text-sm text-gray-500">Contrato, cotización final, planos, pólizas, órdenes de compra, actas y demás archivos o enlaces Drive del proyecto.</p>
          <div class="flex flex-wrap items-center gap-2">
            <button type="button" id="btn-vincular-drive" class="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
              <span class="material-symbols-outlined text-[18px] text-primary">add_link</span> Vincular enlace / carpeta de Google Drive
            </button>
            <label class="flex cursor-pointer items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
              <span class="material-symbols-outlined text-[18px]">upload</span> Subir documento
              <input type="file" id="doc-input" class="hidden" />
            </label>
          </div>
        </div>
        <div id="doc-filtros" class="flex flex-wrap gap-2"></div>
        <div class="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table class="w-full text-left text-sm">
            <thead class="bg-gray-50 text-xs uppercase text-gray-500"><tr><th class="px-4 py-3">Archivo</th><th class="px-4 py-3">Categoría</th><th class="px-4 py-3">Subido</th><th class="px-4 py-3"></th></tr></thead>
            <tbody id="doc-tabla"></tbody>
          </table>
        </div>
      </div>`;

    const abrirDocumento = async (d) => {
      try {
        let ruta = d.url || "";
        // Si es un enlace externo (Google Drive u otro) que no apunta al bucket de Supabase Storage, abrir directo
        if ((ruta.startsWith("http://") || ruta.startsWith("https://")) && !ruta.includes("/documentos/")) {
          window.open(ruta, "_blank", "noopener");
          return;
        }
        if (ruta.includes("/documentos/")) {
          ruta = ruta.split("/documentos/")[1];
        } else if (ruta.startsWith("http://") || ruta.startsWith("https://")) {
          const urlObj = new URL(ruta);
          const partes = urlObj.pathname.split("/documentos/");
          if (partes.length > 1) {
            ruta = partes[1];
          }
        }
        // Quitar posibles query parameters de la ruta si los tiene
        ruta = ruta.split("?")[0];

        const { data, error } = await window.sb.storage
          .from("documentos")
          .createSignedUrl(decodeURIComponent(ruta), 3600);

        if (!error && data?.signedUrl) {
          window.open(data.signedUrl, "_blank", "noopener");
        } else {
          console.warn("Fallo al crear URL firmada, haciendo fallback a URL directa:", error);
          window.open(d.url, "_blank", "noopener");
        }
      } catch (err) {
        console.error("Error al abrir documento:", err);
        window.open(d.url, "_blank", "noopener");
      }
    };

    const pintar = () => {
      root.querySelector("#doc-filtros").innerHTML = [["", "Todos"], ...Object.entries(CATEGORIAS)]
        .map(
          ([v, l]) =>
            `<button data-cat="${v}" class="rounded-full border px-3 py-1 text-xs font-semibold ${
              filtro === v ? "border-primary bg-blue-50 text-primary" : "border-gray-300 text-gray-600 hover:bg-gray-50"
            }">${l}</button>`
        )
        .join("");
      const lista = filtro ? docs.filter((d) => d.categoria === filtro) : docs;
      root.querySelector("#doc-tabla").innerHTML = lista.length
        ? lista
            .map(
              (d) => `<tr class="border-t border-gray-100" data-id="${d.id}">
                <td class="px-4 py-2.5">
                  <button type="button" data-abrir-doc="${d.id}" class="inline-flex items-center gap-1.5 text-left font-medium text-primary hover:underline">
                    ${(d.url || "").startsWith("http") && !(d.url || "").includes("/documentos/")
                      ? `<span class="material-symbols-outlined text-[16px] text-emerald-600" title="Enlace externo / Drive">link</span>`
                      : `<span class="material-symbols-outlined text-[16px] text-gray-400">description</span>`}
                    ${escapeHtml(d.nombre_archivo)}
                  </button>
                </td>
                <td class="px-4 py-2.5"><span class="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold">${CATEGORIAS[d.categoria] || d.categoria}</span></td>
                <td class="px-4 py-2.5 text-xs text-gray-500">${formatoFecha(d.created_at)}</td>
                <td class="px-4 py-2.5 text-right"><button data-borrar class="text-gray-400 hover:text-red-600" title="Eliminar"><span class="material-symbols-outlined text-[18px]">delete</span></button></td>
              </tr>`
            )
            .join("")
        : `<tr><td colspan="4" class="px-4 py-8 text-center text-gray-400">No hay documentos en esta categoría.</td></tr>`;
    };

    const cargar = async () => {
      const { data, error } = await window.sb.from("documentos").select("*").eq("proyecto_id", pid).order("created_at", { ascending: false });
      if (error) return manejarError(error, "No se pudieron cargar los documentos");
      docs = data || [];
      pintar();
    };

    root.querySelector("#doc-filtros").addEventListener("click", (e) => {
      const b = e.target.closest("[data-cat]");
      if (!b) return;
      filtro = b.dataset.cat;
      pintar();
    });

    root.querySelector("#doc-tabla").addEventListener("click", async (e) => {
      const btnAbrir = e.target.closest("[data-abrir-doc]");
      if (btnAbrir) {
        const id = btnAbrir.dataset.abrirDoc;
        const d = docs.find((x) => String(x.id) === String(id));
        if (d) abrirDocumento(d);
        return;
      }

      const b = e.target.closest("[data-borrar]");
      if (!b) return;
      const id = b.closest("tr").dataset.id;
      const ok = await PCT.confirmar("Eliminar documento", "¿Eliminar este documento del proyecto?", "Eliminar", true);
      if (!ok) return;
      const { error } = await window.sb.from("documentos").delete().eq("id", id);
      if (error) return manejarError(error, "No se pudo eliminar");
      cargar();
    });

    root.querySelector("#btn-vincular-drive").addEventListener("click", () => {
      PCT.modal({
        titulo: "Vincular enlace o carpeta de Google Drive",
        ancho: "max-w-md",
        html: `
          <div class="space-y-3 text-xs">
            <div>
              <label class="mb-1 block font-medium text-gray-700">Nombre descriptivo *</label>
              <input type="text" id="drive-nombre" placeholder="Ej. Carpeta Planos Drive / Contrato Firmado" class="w-full rounded-lg border-gray-300 text-xs" />
            </div>
            <div>
              <label class="mb-1 block font-medium text-gray-700">URL de Google Drive o enlace externo *</label>
              <input type="url" id="drive-url" placeholder="https://drive.google.com/drive/folders/..." class="w-full rounded-lg border-gray-300 text-xs" />
            </div>
            <div>
              <label class="mb-1 block font-medium text-gray-700">Categoría</label>
              <select id="drive-categoria" class="w-full rounded-lg border-gray-300 text-xs">
                ${Object.entries(CATEGORIAS).map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}
              </select>
            </div>
          </div>`,
        botones: [
          { texto: "Cancelar" },
          {
            texto: "Guardar enlace",
            clase: PCT.BTN_PRIMARIO,
            onClick: async ({ el }) => {
              const nombre_archivo = el.querySelector("#drive-nombre").value.trim();
              const url = el.querySelector("#drive-url").value.trim();
              const categoria = el.querySelector("#drive-categoria").value;
              if (!nombre_archivo) {
                mostrarAviso("Escribe un nombre descriptivo para el enlace", "error");
                return false;
              }
              if (!/^https?:\/\/.+/i.test(url)) {
                mostrarAviso("Ingresa una URL válida que comience con http:// o https://", "error");
                return false;
              }
              const { error } = await window.sb.from("documentos").insert({
                proyecto_id: pid,
                categoria,
                nombre_archivo,
                url,
                subido_por: PCT.usuarioId || null,
              });
              if (error) {
                manejarError(error, "No se pudo guardar el enlace");
                return false;
              }
              mostrarAviso("Enlace vinculado al proyecto.", "exito");
              cargar();
            },
          },
        ],
      });
    });

    root.querySelector("#doc-input").addEventListener("change", (e) => {
      const file = e.target.files[0];
      e.target.value = "";
      if (!file) return;
      PCT.modal({
        titulo: "Subir documento",
        ancho: "max-w-sm",
        html: `<p class="mb-3 truncate text-sm text-gray-500">${escapeHtml(file.name)}</p>
          <label class="mb-1 block text-xs font-medium text-gray-700">Categoría</label>
          <select id="doc-categoria" class="w-full rounded-lg border-gray-300 text-sm">${Object.entries(CATEGORIAS)
            .map(([v, l]) => `<option value="${v}">${l}</option>`)
            .join("")}</select>`,
        botones: [
          { texto: "Cancelar" },
          {
            texto: "Subir",
            clase: PCT.BTN_PRIMARIO,
            onClick: async ({ el }) => {
              const categoria = el.querySelector("#doc-categoria").value;
              const ruta = `${pid}/${Date.now()}_${file.name.replace(/[^\w.\-]+/g, "_")}`;
              const { error: errSubida } = await window.sb.storage.from("documentos").upload(ruta, file, { upsert: true });
              if (errSubida) {
                manejarError(errSubida, "No se pudo subir el documento");
                return false;
              }
              const url = window.sb.storage.from("documentos").getPublicUrl(ruta).data.publicUrl;
              const { error } = await window.sb.from("documentos").insert({
                proyecto_id: pid, categoria, nombre_archivo: file.name, url, subido_por: PCT.usuarioId || null,
              });
              if (error) {
                manejarError(error, "El archivo se subió pero no se pudo registrar");
                return false;
              }
              mostrarAviso("Documento subido.", "exito");
              cargar();
            },
          },
        ],
      });
    });

    await cargar();
  };
})(window.PCT);
