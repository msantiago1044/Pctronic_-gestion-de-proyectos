// ============================================================================
// PROYECTOS · pestaña CORTES CLIENTE (hoja CORTES CLIENTE de la plantilla v7)
// y piezas compartidas con los cortes del contratista (Mano de obra):
//   · PCT.editorCorte: ventana para crear/editar un corte. Propone, por ítem, lo
//     ejecutado en el Avance diario que aún no se ha cortado; el usuario ajusta.
//   · PCT.pdfActa: PDF del acta (cliente) o del corte (contratista).
// Acta cliente: CD del corte → A, I, U, IVA sobre U → total → amortización del
// anticipo → neto a facturar (PCT.acta en core.js). Cortes ilimitados.
// ============================================================================
(function (PCT) {
  const CLASE_INPUT = "block w-full rounded-lg border-gray-300 text-sm shadow-sm focus:border-primary focus:ring-primary";
  const BTN_SEC = "rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50";

  PCT.ESTADOS_CORTE =
    typeof ESTADOS_CORTE !== "undefined"
      ? ESTADOS_CORTE
      : {
          pendiente: { label: "Pendiente", clase: "bg-amber-100 text-amber-800" },
          facturado: { label: "Facturado", clase: "bg-blue-100 text-blue-800" },
          pagado: { label: "Pagado", clase: "bg-green-100 text-green-800" },
        };

  // Filas del acta de cliente para un costo directo dado
  PCT.filasActa = (cd, p = PCT.estado.proyecto) => {
    const a = PCT.acta(cd, p);
    const aiu = p.tipo_contrato === "aiu";
    return [
      ["Costo directo del corte", a.cd],
      ...(aiu
        ? [
            [`Administración (${PCT.num(p.administracion_porcentaje)}%)`, a.admin],
            [`Imprevistos (${PCT.num(p.imprevistos_porcentaje)}%)`, a.imprev],
            [`Utilidad (${PCT.num(p.utilidad_porcentaje)}%)`, a.util],
            [`IVA sobre utilidad (${PCT.num(p.iva_porcentaje)}%)`, a.iva],
          ]
        : [[`IVA (${PCT.num(p.iva_porcentaje)}%)`, a.iva]]),
      ["TOTAL ACTA", a.total, "fuerte"],
      [`Amortización anticipo (${PCT.num(p.anticipo_porcentaje)}%)`, a.amortizacion],
      ["NETO A FACTURAR", a.neto, "fuerte"],
    ];
  };

  PCT.htmlResumen = (filas) => `
    <dl class="text-sm">
      ${filas
        .map(
          ([t, v, estilo]) =>
            `<div class="flex items-baseline justify-between gap-3 py-1 ${estilo === "fuerte" ? "border-t border-gray-200 pt-1.5 font-bold text-gray-900" : "text-gray-600"}"><dt>${t}</dt><dd class="tabular-nums">${formatoMoneda(v)}</dd></div>`
        )
        .join("")}
    </dl>`;

  // --------------------------------------------------------------------
  // Editor de corte (compartido)
  // --------------------------------------------------------------------
  // filas: [{ item, ejecutado, cortadoOtros, precio, sinPrecio }]
  //   ejecutado    = lo ejecutado (avance diario) que puede cortarse
  //   cortadoOtros = lo ya cortado en OTROS cortes
  // iniciales: Map itemId → cantidad con la que arranca cada ítem
  // resumen(valor) → html del resumen (acta / valor del corte)
  // onGuardar({ fecha, cantidades: Map, el }) → guarda; si lanza error no cierra
  PCT.editorCorte = ({ titulo, fecha, extraHtml = "", filas, iniciales = new Map(), resumen, textoGuardar = "Guardar corte", onGuardar }) =>
    new Promise((resolve) => {
      const cant = new Map(filas.map((f) => [f.item.id, PCT.num(iniciales.get(f.item.id))]));
      const pendiente = (f) => PCT.num(f.ejecutado) - PCT.num(f.cortadoOtros);
      let soloPendientes = true;

      const m = PCT.modal({
        titulo,
        ancho: "max-w-6xl",
        html: `
          <div class="space-y-3">
            <div class="flex flex-wrap items-end gap-3">
              <div><label class="mb-1 block text-xs font-medium text-gray-700">Fecha del corte</label><input id="ec-fecha" type="date" value="${fecha}" class="${CLASE_INPUT}" /></div>
              ${extraHtml}
              <div class="ml-auto flex flex-wrap items-center gap-2">
                <label class="flex items-center gap-1.5 text-xs text-gray-600"><input id="ec-solo" type="checkbox" checked class="rounded border-gray-300 text-primary focus:ring-primary" /> Solo ítems con algo por cortar</label>
                <button type="button" id="ec-llenar" class="${BTN_SEC}">Llenar con lo pendiente</button>
                <button type="button" id="ec-cero" class="${BTN_SEC}">Todo en 0</button>
              </div>
            </div>
            <div class="max-h-[48vh] overflow-auto rounded-lg border border-gray-200">
              <table class="min-w-full text-xs">
                <thead class="sticky top-0 bg-gray-50 text-left text-[10px] font-semibold uppercase text-gray-500">
                  <tr><th class="px-2 py-2">#</th><th class="px-2 py-2">Descripción</th><th class="px-2 py-2">Und</th><th class="px-2 py-2 text-right">Contratado</th><th class="px-2 py-2 text-right">Ejecutado</th><th class="px-2 py-2 text-right">Cortado antes</th><th class="px-2 py-2 text-right">Pendiente</th><th class="px-2 py-2 text-right">PU</th><th class="px-2 py-2 text-right">Este corte</th><th class="px-2 py-2 text-right">Valor</th></tr>
                </thead>
                <tbody id="ec-filas"></tbody>
              </table>
            </div>
            <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
              <p class="text-xs text-gray-500">«Pendiente» = lo ejecutado en el Avance diario que aún no se ha cortado. Puedes cortar más o menos de lo pendiente (por ejemplo, mayores cantidades acordadas).</p>
              <div id="ec-resumen" class="rounded-lg bg-gray-50 p-3"></div>
            </div>
          </div>`,
        botones: [
          { texto: "Cancelar", onClick: () => resolve(false) },
          {
            texto: textoGuardar,
            clase: PCT.BTN_PRIMARIO,
            onClick: async ({ el }) => {
              const f = el.querySelector("#ec-fecha").value;
              if (!f) {
                mostrarAviso("Pon la fecha del corte.", "error");
                return false;
              }
              const vals = [...cant.values()];
              if (vals.some((v) => v < 0)) {
                mostrarAviso("Las cantidades no pueden ser negativas.", "error");
                return false;
              }
              if (!vals.some((v) => v > 0)) {
                mostrarAviso("El corte debe tener al menos una cantidad mayor a 0.", "error");
                return false;
              }
              try {
                const res = await onGuardar({ fecha: f, cantidades: cant, el });
                if (res === false) return false;
                resolve(true);
              } catch (err) {
                manejarError(err, "No se pudo guardar el corte");
                return false;
              }
            },
          },
        ],
      });
      const el = m.el;
      const tbody = el.querySelector("#ec-filas");

      const pintarResumen = () => {
        const valor = filas.reduce((s, f) => s + PCT.num(cant.get(f.item.id)) * PCT.num(f.precio), 0);
        el.querySelector("#ec-resumen").innerHTML = resumen(valor);
      };

      const pintar = () => {
        const visibles = filas.filter((f) => !soloPendientes || Math.abs(pendiente(f)) > 0.0001 || cant.get(f.item.id) !== 0);
        tbody.innerHTML = visibles.length
          ? visibles
              .map((f) => {
                const i = f.item;
                const c = cant.get(i.id);
                const pend = pendiente(f);
                return `<tr data-id="${i.id}" class="border-t border-gray-100 ${i.es_adicional ? "bg-amber-50/60" : ""}">
                  <td class="px-2 py-1 text-gray-500">${escapeHtml(i.codigo || "")}</td>
                  <td class="px-2 py-1 text-gray-800"><span class="line-clamp-2">${escapeHtml(i.descripcion)}</span>${i.es_adicional ? ` <span class="rounded bg-amber-100 px-1 text-[10px] font-semibold text-amber-800">ADICIONAL</span>` : ""}${f.sinPrecio ? ` <span class="rounded bg-red-100 px-1 text-[10px] font-semibold text-red-700">SIN PRECIO</span>` : ""}</td>
                  <td class="px-2 py-1 text-gray-500">${escapeHtml(i.unidad || "")}</td>
                  <td class="px-2 py-1 text-right tabular-nums">${PCT.fmtCant(i.cantidad)}</td>
                  <td class="px-2 py-1 text-right tabular-nums">${PCT.fmtCant(f.ejecutado)}</td>
                  <td class="px-2 py-1 text-right tabular-nums">${PCT.fmtCant(f.cortadoOtros)}</td>
                  <td class="px-2 py-1 text-right tabular-nums ${pend < 0 ? "text-amber-700" : ""}">${PCT.fmtCant(pend)}</td>
                  <td class="px-2 py-1 text-right tabular-nums text-gray-600">${f.sinPrecio ? `<span class="text-red-500">—</span>` : formatoMoneda(f.precio)}</td>
                  <td class="w-24 px-1 py-1"><input data-cant type="number" step="0.01" min="0" value="${c || ""}" placeholder="0" class="w-full rounded border border-gray-200 px-1.5 py-1 text-right text-xs tabular-nums focus:border-primary focus:ring-1 focus:ring-primary ${c > pend + 0.0001 ? "text-amber-700" : ""}" /></td>
                  <td class="px-2 py-1 text-right tabular-nums text-gray-700" data-valor>${formatoMoneda(c * PCT.num(f.precio))}</td>
                </tr>`;
              })
              .join("")
          : `<tr><td colspan="10" class="py-8 text-center text-gray-400">No hay nada ejecutado pendiente por cortar. Registra avance en «Avance diario» o quita el filtro para cortar a mano.</td></tr>`;
        pintarResumen();
      };

      tbody.addEventListener("input", (e) => {
        if (!e.target.matches("[data-cant]")) return;
        const tr = e.target.closest("tr[data-id]");
        const f = filas.find((x) => x.item.id === tr.dataset.id);
        const raw = Math.round(PCT.num(e.target.value) * 100) / 100;
        const v = Math.max(0, raw);
        if (raw < 0) e.target.value = "0";
        cant.set(f.item.id, v);
        tr.querySelector("[data-valor]").textContent = formatoMoneda(v * PCT.num(f.precio));
        e.target.classList.toggle("text-amber-700", v > pendiente(f) + 0.0001);
        pintarResumen();
      });
      el.querySelector("#ec-solo").addEventListener("change", (e) => {
        soloPendientes = e.target.checked;
        pintar();
      });
      el.querySelector("#ec-llenar").addEventListener("click", () => {
        filas.forEach((f) => cant.set(f.item.id, Math.max(0, Math.round(pendiente(f) * 100) / 100)));
        pintar();
      });
      el.querySelector("#ec-cero").addEventListener("click", () => {
        filas.forEach((f) => cant.set(f.item.id, 0));
        pintar();
      });
      pintar();
    });

  // --------------------------------------------------------------------
  // PDF del acta / corte
  // --------------------------------------------------------------------
  // filas: [{ codigo, descripcion, unidad, contratado, precio, anterior, actual }]
  PCT.pdfActa = async ({ titulo, subtitulo, proyecto: p, corte, filas, encabezadoPrecio = "PU", resumen, firmas, adjuntos = [], nombreArchivo }) => {
    if (typeof asegurarJsPDF === "function") {
      try {
        await asegurarJsPDF();
      } catch (e) {
        return mostrarAviso("No se pudo cargar el generador de PDF (revisa tu conexión).", "error");
      }
    }
    if (!window.jspdf?.jsPDF) return mostrarAviso("No se pudo cargar el generador de PDF (revisa tu conexión).", "error");
    const doc = new window.jspdf.jsPDF({ unit: "pt", format: "letter", orientation: "landscape" });
    const ancho = doc.internal.pageSize.getWidth();
    const alto = doc.internal.pageSize.getHeight();
    const M = 36;
    let y = 32;

    // Franja superior ejecutiva
    doc.setFillColor(0, 112, 192);
    doc.rect(0, 0, ancho, 6, "F");

    const emp = p.empresas || {};
    if (emp.logo_url && typeof imagenABase64 === "function") {
      const logo = await imagenABase64(emp.logo_url);
      if (logo) {
        try {
          doc.addImage(logo, M, y - 4, 92, 40, undefined, "FAST");
        } catch (e) {
          /* logo en formato no soportado: se omite */
        }
      }
    }
    doc.setTextColor(15, 23, 42);
    doc.setFont(undefined, "bold");
    doc.setFontSize(13.5);
    doc.text(emp.nombre || window.PCTRONIC_CONFIG?.NOMBRE_EMPRESA || "Pctronic Seguridad Electrónica", ancho - M, y + 4, { align: "right" });
    doc.setFont(undefined, "normal");
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    const datosEmp = [emp.nit ? `NIT ${emp.nit}` : "", emp.direccion || "", [emp.telefono, emp.email].filter(Boolean).join(" · ")].filter(Boolean);
    datosEmp.forEach((t, i) => doc.text(t, ancho - M, y + 16 + i * 10, { align: "right" }));
    y += 48;

    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.75);
    doc.line(M, y, ancho - M, y);
    y += 16;

    doc.setTextColor(15, 23, 42);
    doc.setFont(undefined, "bold");
    doc.setFontSize(13);
    doc.text(titulo, M, y);
    if (subtitulo) {
      doc.setFont(undefined, "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(71, 85, 105);
      doc.text(subtitulo, M, y + 13);
      y += 22;
    } else {
      y += 12;
    }

    doc.autoTable({
      startY: y,
      margin: { left: M, right: M, bottom: 42 },
      theme: "grid",
      styles: {
        fontSize: 8,
        cellPadding: { top: 3.5, right: 6, bottom: 3.5, left: 6 },
        lineColor: [226, 232, 240],
        lineWidth: 0.4,
        fillColor: [248, 250, 252],
        textColor: [15, 23, 42],
      },
      body: [
        ["Proyecto", p.nombre || "—", "Corte N°", String(corte.numero)],
        ["Cliente", p.clientes?.nombre || "—", "Fecha del corte", corte.fecha ? formatoFecha(corte.fecha) : "—"],
        ["Contrato", p.numero_contrato || "—", "Cotización", p.numero_cotizacion || "—"],
        ...(corte.extra || []),
      ],
      columnStyles: {
        0: { fontStyle: "bold", cellWidth: 85, textColor: [71, 85, 105], fillColor: [241, 245, 249] },
        1: { cellWidth: "auto" },
        2: { fontStyle: "bold", cellWidth: 95, textColor: [71, 85, 105], fillColor: [241, 245, 249] },
        3: { cellWidth: 165 },
      },
    });
    y = doc.lastAutoTable.finalY + 10;

    const n = (v) => PCT.fmtCant(v);
    doc.autoTable({
      startY: y,
      margin: { left: M, right: M, bottom: 42 },
      styles: {
        fontSize: 7.5,
        cellPadding: { top: 3.5, right: 4, bottom: 3.5, left: 4 },
        valign: "middle",
        lineColor: [226, 232, 240],
        lineWidth: 0.35,
        textColor: [15, 23, 42],
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      headStyles: { fillColor: [0, 112, 192], textColor: 255, fontStyle: "bold", halign: "center" },
      head: [["#", "Descripción", "Und", "Cant. contrato", encabezadoPrecio, "Cortado anterior", "Este corte", "Acumulado", "Valor este corte"]],
      body: filas.map((f) => [
        f.codigo || "", f.descripcion, f.unidad || "", n(f.contratado), formatoMoneda(f.precio), n(f.anterior), n(f.actual), n(PCT.num(f.anterior) + PCT.num(f.actual)), formatoMoneda(PCT.num(f.actual) * PCT.num(f.precio)),
      ]),
      columnStyles: {
        0: { cellWidth: 38 }, 1: { cellWidth: "auto" }, 2: { cellWidth: 34, halign: "center" },
        3: { halign: "right", cellWidth: 58 }, 4: { halign: "right", cellWidth: 70 }, 5: { halign: "right", cellWidth: 58 },
        6: { halign: "right", cellWidth: 52 }, 7: { halign: "right", cellWidth: 56 }, 8: { halign: "right", cellWidth: 82, fontStyle: "bold" },
      },
    });
    y = doc.lastAutoTable.finalY + 12;

    const alturaResumenEst = 24 + (resumen?.length || 0) * 18;
    if (y + alturaResumenEst > alto - 52) {
      doc.addPage();
      y = 40;
    }

    const anchoCaja = 290;
    doc.autoTable({
      startY: y,
      margin: { left: ancho - M - anchoCaja, right: M, bottom: 42 },
      theme: "grid",
      styles: {
        fontSize: 8.5,
        cellPadding: { top: 4.5, right: 8, bottom: 4.5, left: 8 },
        lineColor: [203, 213, 225],
        lineWidth: 0.45,
        textColor: [30, 41, 59],
      },
      headStyles: {
        fillColor: [241, 245, 249],
        textColor: [51, 65, 85],
        fontStyle: "bold",
        fontSize: 8,
      },
      head: [["Resumen financiero", "Valor"]],
      body: resumen.map(([t, v]) => [t, formatoMoneda(v)]),
      columnStyles: { 0: { cellWidth: 190 }, 1: { halign: "right", cellWidth: 100 } },
      didParseCell: (d) => {
        if (d.section === "head" && d.column.index === 1) {
          d.cell.styles.halign = "right";
        }
        if (d.section === "body" && resumen[d.row.index]?.[2] === "fuerte") {
          d.cell.styles.fontStyle = "bold";
          d.cell.styles.fontSize = 9.5;
          d.cell.styles.fillColor = [235, 242, 252];
          d.cell.styles.textColor = [0, 82, 155];
        }
      },
    });
    y = doc.lastAutoTable.finalY + 46;

    if (y > alto - 84) {
      doc.addPage();
      y = 76;
    }

    const dibujarFirma = (firma, xFirma) => {
      doc.setDrawColor(100, 116, 139);
      doc.setLineWidth(0.75);
      doc.line(xFirma, y, xFirma + 230, y);
      if (firma && typeof firma === "object") {
        doc.setTextColor(15, 23, 42);
        doc.setFont(undefined, "bold");
        doc.setFontSize(8.5);
        doc.text(firma.titulo || "", xFirma, y + 12);
        doc.setFont(undefined, "normal");
        doc.setFontSize(8.5);
        doc.text(firma.nombre || "", xFirma, y + 23);
        if (firma.detalle) {
          doc.setFontSize(7.5);
          doc.setTextColor(100, 116, 139);
          doc.text(firma.detalle, xFirma, y + 33);
        }
      } else {
        doc.setTextColor(15, 23, 42);
        doc.setFont(undefined, "normal");
        doc.setFontSize(8.5);
        doc.text(String(firma || ""), xFirma, y + 12);
      }
    };

    dibujarFirma(firmas?.[0], M);
    dibujarFirma(firmas?.[1], ancho - M - 230);

    if (adjuntos.length) {
      y += 44;
      if (y > alto - 60) {
        doc.addPage();
        y = 44;
      }
      doc.setTextColor(15, 23, 42);
      doc.setFont(undefined, "bold");
      doc.setFontSize(8.5);
      doc.text("Soportes adjuntos", M, y);
      doc.setFont(undefined, "normal");
      doc.setFontSize(8);
      doc.setTextColor(0, 112, 192);
      adjuntos.forEach((a, i) => doc.textWithLink(`• ${a.nombre_archivo}`, M, y + 12 + i * 11, { url: a.url }));
    }

    const totalPaginas = doc.getNumberOfPages();
    for (let i = 1; i <= totalPaginas; i++) {
      doc.setPage(i);
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.5);
      doc.line(M, alto - 30, ancho - M, alto - 30);
      doc.setFont(undefined, "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text(`${titulo}${p.nombre ? " · " + p.nombre : ""}`, M, alto - 18);
      doc.text(`Página ${i} de ${totalPaginas}`, ancho - M, alto - 18, { align: "right" });
    }

    doc.save(nombreArchivo);
  };

  // --------------------------------------------------------------------
  // Pestaña CORTES CLIENTE
  // --------------------------------------------------------------------
  PCT.renderCortes = async (root) => {
    const p = () => PCT.estado.proyecto;
    const pid = PCT.estado.proyecto.id;
    let cortes = [];
    let lineas = []; // cortes_cliente_items
    let docs = []; // documentos con corte_id

    const soloItems = () => PCT.estado.items.filter((i) => i.tipo === "item");
    const itemPorId = (id) => PCT.estado.items.find((i) => i.id === id);
    const lineasDe = (corteId) => lineas.filter((l) => l.corte_id === corteId);
    const cdDe = (corteId) => lineasDe(corteId).reduce((s, l) => s + PCT.num(l.cantidad) * PCT.num(l.pu_venta_snapshot), 0);

    const cargar = async () => {
      const c = await window.sb.from("cortes_cliente").select("*").eq("proyecto_id", pid).order("numero", { ascending: true });
      if (c.error) throw c.error;
      cortes = c.data || [];
      const ids = cortes.map((x) => x.id);
      if (!ids.length) {
        lineas = [];
        docs = [];
        return;
      }
      const [l, d] = await Promise.all([
        window.sb.from("cortes_cliente_items").select("*").in("corte_id", ids),
        window.sb.from("documentos").select("*").in("corte_id", ids).order("created_at", { ascending: true }),
      ]);
      if (l.error) throw l.error;
      if (d.error) throw d.error;
      lineas = l.data || [];
      docs = d.data || [];
    };

    const sumarDiasISO = (iso, dias) => {
      if (!iso) return null;
      const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
      if (isNaN(d.getTime())) return null;
      d.setDate(d.getDate() + dias);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    };

    const esErrorColumnaCorteId = (err) =>
      Boolean(
        err &&
          (err.code === "42703" ||
            err.code === "PGRST204" ||
            /corte_id|column/i.test(String(err.message || "")))
      );

    const anularFacturaDeCorte = async (corteId) => {
      if (!corteId) return { ok: true, error: null };
      try {
        const resBuscar = await window.sb
          .from("facturas")
          .select("id, estado")
          .eq("corte_id", corteId)
          .maybeSingle();
        if (resBuscar.error) {
          if (esErrorColumnaCorteId(resBuscar.error)) return { ok: true, error: null };
          console.warn("No se pudo consultar la factura asociada al corte:", resBuscar.error);
          return { ok: false, error: resBuscar.error };
        }
        if (resBuscar.data?.id && resBuscar.data.estado !== "anulada") {
          const { error: errAnular } = await window.sb
            .from("facturas")
            .update({ estado: "anulada" })
            .eq("id", resBuscar.data.id);
          if (errAnular) {
            console.warn("No se pudo anular la factura asociada al corte:", errAnular);
            return { ok: false, error: errAnular };
          }
        }
        return { ok: true, error: null };
      } catch (errAnul) {
        console.warn("No se pudo anular la factura asociada al corte:", errAnul);
        return { ok: false, error: errAnul };
      }
    };

    const sincronizarCorteAFacturacion = async (corteActualizado, estadoAnterior, cdOverride = null) => {
      if (!corteActualizado) return { ok: false, error: new Error("Corte inválido") };
      if (!["facturado", "pagado"].includes(corteActualizado.estado)) {
        return await anularFacturaDeCorte(corteActualizado.id);
      }
      try {
        const proy = p();
        const cd = cdOverride !== null ? cdOverride : cdDe(corteActualizado.id);
        const acta = PCT.acta(cd, proy);
        const numeroFactura = (corteActualizado.numero_factura || "").trim() || `CORTE-${corteActualizado.numero}`;
        const fechaEmision =
          corteActualizado.fecha_factura ||
          corteActualizado.fecha ||
          (typeof fechaLocalISO === "function" ? fechaLocalISO() : PCT.hoyISO());
        const diasCredito = PCT.num(proy.dias_credito) > 0 ? PCT.num(proy.dias_credito) : 30;
        const fechaVencimiento = sumarDiasISO(fechaEmision, diasCredito);
        const valorFactura = Math.round((acta.neto > 0 ? acta.neto : acta.total) * 100) / 100;
        const estadoFactura = corteActualizado.estado === "pagado" ? "pagada" : "pendiente";
        const notasFactura = `Corte #${corteActualizado.numero} - ${proy.nombre || ""} | Subtotal: ${formatoMoneda(acta.ingreso)} · IVA: ${formatoMoneda(acta.iva)} · Total acta: ${formatoMoneda(acta.total)} · Neto: ${formatoMoneda(acta.neto)}`;

        const payloadBase = {
          proyecto_id: pid,
          numero_factura: numeroFactura,
          valor: valorFactura,
          fecha_emision: fechaEmision,
          fecha_vencimiento: fechaVencimiento,
          estado: estadoFactura,
          notas: notasFactura,
        };

        let synced = false;
        let lastError = null;
        const resBuscar = await window.sb.from("facturas").select("id").eq("corte_id", corteActualizado.id).maybeSingle();
        const errCol = esErrorColumnaCorteId(resBuscar.error);

        if (!errCol && !resBuscar.error) {
          if (resBuscar.data?.id) {
            const { error: errUpd } = await window.sb.from("facturas").update(payloadBase).eq("id", resBuscar.data.id);
            if (!errUpd) {
              synced = true;
            } else {
              lastError = errUpd;
            }
          } else {
            const payloadConCorte = { ...payloadBase, corte_id: corteActualizado.id };
            const { error: errUps } = await window.sb.from("facturas").upsert(payloadConCorte, { onConflict: "corte_id" });
            if (!errUps) {
              synced = true;
            } else {
              lastError = errUps;
              const { error: errIns } = await window.sb.from("facturas").insert(payloadConCorte);
              if (!errIns) {
                synced = true;
                lastError = null;
              } else {
                lastError = errIns;
              }
            }
          }
        } else if (!errCol && resBuscar.error) {
          lastError = resBuscar.error;
        }

        if (!synced) {
          const resFallback = await window.sb
            .from("facturas")
            .select("id")
            .eq("proyecto_id", pid)
            .eq("numero_factura", numeroFactura)
            .maybeSingle();
          if (resFallback.error) {
            lastError = resFallback.error;
          } else if (resFallback.data?.id) {
            const { error: errFbUpd } = await window.sb
              .from("facturas")
              .update(payloadBase)
              .eq("id", resFallback.data.id);
            if (!errFbUpd) {
              synced = true;
              lastError = null;
            } else {
              lastError = errFbUpd;
            }
          } else {
            const { error: errFbIns } = await window.sb.from("facturas").insert(payloadBase);
            if (!errFbIns) {
              synced = true;
              lastError = null;
            } else {
              lastError = errFbIns;
            }
          }
        }

        if (!synced) {
          console.warn("No se pudo sincronizar el corte con Facturación:", lastError);
          return { ok: false, error: lastError || new Error("No se pudo sincronizar con Facturación") };
        }

        const esRecienFacturado = estadoAnterior !== "facturado" && estadoAnterior !== "pagado";
        if (esRecienFacturado && typeof window.PCT_NOTIFICAR === "function") {
          window.PCT_NOTIFICAR({
            tipo: "corte_facturado",
            titulo: `Corte #${corteActualizado.numero} facturado`,
            mensaje: `${proy.nombre || "Proyecto"} · ${numeroFactura} (${formatoMoneda(valorFactura)})`,
            url: `proyecto-detalle.html?id=${pid}&tab=cortes`,
            rol_destino: ["super_usuario", "directivo", "proyectos"],
            proyecto_id: pid,
          });
        }
        return { ok: true, error: null };
      } catch (errSync) {
        console.warn("No se pudo sincronizar el corte con Facturación:", errSync);
        return { ok: false, error: errSync };
      }
    };

    const refrescar = async () => {
      await Promise.all([cargar(), PCT.recargarEjec(), PCT.recargarFinanzas()]);
      pintar();
      PCT.emit("proyecto");
    };

    const confirmarSinGastosSiAplica = async () => {
      if (Number(PCT.estado.finanzas?.gastado || 0) > 0) return true;
      return await PCT.confirmar(
        "Proyecto sin compras ni gastos registrados",
        "Atención: Este proyecto aún tiene $0 en compras y gastos registrados. ¿Seguro que deseas continuar y facturar este corte?",
        "Continuar de todos modos"
      );
    };

    root.innerHTML = `
      <div class="space-y-5">
        <div id="cc-kpis" class="${PCT.CLASE_PANEL_KPIS}"></div>
        <div class="rounded-xl border border-gray-200 bg-white p-5">
          <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 class="text-base font-bold text-gray-900">Cortes al cliente</h3>
              <p class="text-xs text-gray-500">Cada corte propone lo ejecutado en el Avance diario que aún no se ha cortado. Ábrelo para registrar la factura, el estado y los soportes, o descargar el acta en PDF.</p>
            </div>
            <button id="cc-nuevo" class="flex items-center gap-1 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"><span class="material-symbols-outlined text-[18px]">add</span> Nuevo corte</button>
          </div>
          <div class="overflow-x-auto">
            <table class="min-w-full text-sm">
              <thead class="bg-gray-50 text-left text-[11px] font-semibold uppercase text-gray-500">
                <tr><th class="px-3 py-2">N°</th><th class="px-3 py-2">Fecha</th><th class="px-3 py-2 text-right">Costo directo</th><th class="px-3 py-2 text-right">Total acta</th><th class="px-3 py-2 text-right">Amortización</th><th class="px-3 py-2 text-right">Neto a facturar</th><th class="px-3 py-2 text-right">Acumulado cobrado</th><th class="px-3 py-2 text-right">Saldo contrato</th><th class="px-3 py-2">Estado</th><th class="px-3 py-2">Factura</th><th class="px-3 py-2 text-right">Recaudado</th><th class="px-3 py-2"></th></tr>
              </thead>
              <tbody id="cc-lista"></tbody>
              <tfoot id="cc-total" class="bg-gray-50 text-xs font-bold text-gray-800"></tfoot>
            </table>
          </div>
        </div>
      </div>`;

    const pintar = () => {
      // KPIs financieros completos
      const proy = p();
      const valorContrato = PCT.num(proy.valor_total);
      const anticipoPactado = PCT.contrato(proy).anticipo;
      const anticipoRecibido = PCT.num(proy.anticipo_recibido);
      const baseAnticipo = anticipoRecibido > 0 ? anticipoRecibido : anticipoPactado;

      const actas = cortes.map((c) => ({ c, a: PCT.acta(cdDe(c.id), proy) }));
      const acumuladoCortadoBruto = actas.reduce((s, x) => s + x.a.total, 0);
      const acumuladoCortadoNeto = actas.reduce((s, x) => s + x.a.neto, 0);
      const totalAmortizado = actas.reduce((s, x) => s + Math.abs(PCT.num(x.a.amortizacion)), 0);
      const anticipoPendiente = Math.max(0, baseAnticipo - totalAmortizado);
      const actasFacturadas = actas.filter((x) => x.c.estado !== "pendiente");
      const facturadoBruto = actasFacturadas.reduce((s, x) => s + x.a.total, 0);
      const facturadoNeto = actasFacturadas.reduce((s, x) => s + x.a.neto, 0);
      const recaudado = cortes.reduce((s, c) => s + PCT.num(c.valor_recaudado), 0);
      const saldoContrato = Math.max(0, valorContrato - acumuladoCortadoBruto);
      const porRecaudar = Math.max(0, facturadoNeto - recaudado);
      const sinCortar = soloItems().reduce((s, i) => s + Math.max(0, PCT.num(PCT.ejecItem(i.id).pendiente_cortar_cliente)) * PCT.num(i.pu_venta), 0);

      root.querySelector("#cc-kpis").innerHTML =
        PCT.tarjetaKpi(
          "Valor del contrato",
          formatoMoneda(valorContrato),
          `${proy.tipo_contrato === "aiu" ? "Esquema AIU" : "IVA pleno"}${baseAnticipo > 0 ? ` · Anticipo ${formatoMoneda(baseAnticipo)}` : ""}`
        ) +
        PCT.tarjetaKpi(
          "Acumulado cobrado / facturado",
          formatoMoneda(facturadoNeto > 0 ? facturadoNeto : acumuladoCortadoNeto),
          `Neto facturado ${formatoMoneda(facturadoNeto)} · Bruto facturado ${formatoMoneda(facturadoBruto)} · Cortado total ${formatoMoneda(acumuladoCortadoBruto)} (${cortes.length} cortes)`
        ) +
        PCT.tarjetaKpi(
          "Saldo pendiente del contrato",
          formatoMoneda(saldoContrato),
          `Por recaudar (neto) ${formatoMoneda(porRecaudar)} · Recaudado ${formatoMoneda(recaudado)}`,
          saldoContrato > 0 ? "text-gray-900" : "text-green-600"
        ) +
        PCT.tarjetaKpi(
          "Amortización de anticipo",
          formatoMoneda(totalAmortizado),
          baseAnticipo > 0
            ? `Pendiente por amortizar ${formatoMoneda(anticipoPendiente)} de ${formatoMoneda(baseAnticipo)}`
            : `${PCT.num(proy.anticipo_porcentaje)}% sobre actas`
        ) +
        PCT.tarjetaKpi("Ejecutado sin cortar", formatoMoneda(sinCortar), "Costo directo, antes de AIU", sinCortar > 0 ? "text-amber-700" : "text-gray-900");

      // Lista con acumulados corridos
      let acumBruto = 0;
      let acumAmort = 0;
      let acumNeto = 0;
      const tbody = root.querySelector("#cc-lista");
      tbody.innerHTML = actas.length
        ? actas
            .map(({ c, a }) => {
              acumBruto += a.total;
              acumAmort += Math.abs(PCT.num(a.amortizacion));
              acumNeto += a.neto;
              const saldoFila = Math.max(0, valorContrato - acumBruto);
              return `<tr data-id="${c.id}" class="cursor-pointer border-t border-gray-100 hover:bg-gray-50">
                <td class="px-3 py-2 font-semibold">${c.numero}</td>
                <td class="px-3 py-2 whitespace-nowrap">${formatoFecha(c.fecha)}</td>
                <td class="px-3 py-2 text-right tabular-nums">${formatoMoneda(a.cd)}</td>
                <td class="px-3 py-2 text-right tabular-nums">${formatoMoneda(a.total)}</td>
                <td class="px-3 py-2 text-right tabular-nums text-gray-500">${formatoMoneda(a.amortizacion)}</td>
                <td class="px-3 py-2 text-right font-semibold tabular-nums">${formatoMoneda(a.neto)}</td>
                <td class="px-3 py-2 text-right tabular-nums">
                  <div class="font-semibold text-gray-800">${formatoMoneda(acumNeto)}</div>
                  <div class="text-[10px] text-gray-400">Bruto ${formatoMoneda(acumBruto)}${acumAmort > 0 ? ` · Amort. ${formatoMoneda(acumAmort)}` : ""}</div>
                </td>
                <td class="px-3 py-2 text-right tabular-nums text-gray-700">${formatoMoneda(saldoFila)}</td>
                <td class="px-3 py-2">${badgeHtml(PCT.ESTADOS_CORTE, c.estado)}</td>
                <td class="px-3 py-2 text-xs text-gray-600">${escapeHtml(c.numero_factura || "—")}${c.fecha_factura ? `<br /><span class="text-gray-400">${formatoFecha(c.fecha_factura)}</span>` : ""}</td>
                <td class="px-3 py-2 text-right tabular-nums">${formatoMoneda(c.valor_recaudado)}</td>
                <td class="whitespace-nowrap px-3 py-2 text-right">
                  <button data-acc="ver" class="text-xs font-semibold text-primary hover:underline">Abrir</button>
                  <button data-acc="pdf" title="Acta en PDF" class="ml-2 text-gray-400 hover:text-gray-800"><span class="material-symbols-outlined text-[18px] align-middle">picture_as_pdf</span></button>
                </td>
              </tr>`;
            })
            .join("")
        : `<tr><td colspan="12" class="py-10 text-center text-gray-400">Aún no hay cortes. Usa «Nuevo corte» cuando quieras cobrar lo ejecutado.</td></tr>`;
      const t = actas.reduce((s, { a }) => ({ cd: s.cd + a.cd, total: s.total + a.total, am: s.am + a.amortizacion, neto: s.neto + a.neto }), { cd: 0, total: 0, am: 0, neto: 0 });
      root.querySelector("#cc-total").innerHTML = actas.length
        ? `<tr><td colspan="2" class="px-3 py-2 uppercase">Acumulado</td><td class="px-3 py-2 text-right tabular-nums">${formatoMoneda(t.cd)}</td><td class="px-3 py-2 text-right tabular-nums">${formatoMoneda(t.total)}</td><td class="px-3 py-2 text-right tabular-nums">${formatoMoneda(t.am)}</td><td class="px-3 py-2 text-right tabular-nums">${formatoMoneda(t.neto)}</td><td class="px-3 py-2 text-right tabular-nums">${formatoMoneda(t.neto)}</td><td class="px-3 py-2 text-right tabular-nums">${formatoMoneda(saldoContrato)}</td><td></td><td></td><td class="px-3 py-2 text-right tabular-nums">${formatoMoneda(recaudado)}</td><td></td></tr>`
        : "";
    };

    // ---- crear / editar cantidades ----
    const abrirEditor = async (corte = null) => {
      const propias = corte ? new Map(lineasDe(corte.id).map((l) => [l.presupuesto_item_id, PCT.num(l.cantidad)])) : new Map();
      const filas = soloItems().map((i) => {
        const e = PCT.ejecItem(i.id);
        const cortadoOtros = PCT.num(e.cant_cortada_cliente) - PCT.num(propias.get(i.id));
        return { item: i, ejecutado: PCT.num(e.cant_ejecutada), cortadoOtros, precio: PCT.num(i.pu_venta) };
      });
      const iniciales = corte
        ? propias
        : new Map(filas.map((f) => [f.item.id, Math.max(0, Math.round((f.ejecutado - f.cortadoOtros) * 100) / 100)]));
      const numero = corte ? corte.numero : (cortes.length ? Math.max(...cortes.map((c) => c.numero)) : 0) + 1;

      const ok = await PCT.editorCorte({
        titulo: corte ? `Corte N° ${numero} · editar cantidades` : `Nuevo corte N° ${numero}`,
        fecha: corte?.fecha || PCT.hoyISO(),
        filas,
        iniciales,
        resumen: (cd) => PCT.htmlResumen(PCT.filasActa(cd, p())),
        onGuardar: async ({ fecha, cantidades }) => {
          if (!corte) {
            const seguir = await confirmarSinGastosSiAplica();
            if (!seguir) return false;
          }
          let corteId = corte?.id;
          let esNuevo = false;
          if (corte) {
            const { error } = await window.sb.from("cortes_cliente").update({ fecha }).eq("id", corte.id);
            if (error) throw error;
          } else {
            const { data, error } = await window.sb.from("cortes_cliente").insert({ proyecto_id: pid, numero, fecha }).select().single();
            if (error) throw error;
            corteId = data.id;
            esNuevo = true;
          }
          try {
            const existentes = new Map(lineasDe(corteId).map((l) => [l.presupuesto_item_id, l]));
            const upserts = [];
            const borrar = [];
            cantidades.forEach((v, itemId) => {
              const ex = existentes.get(itemId);
              if (!v) {
                if (ex) borrar.push(ex.id);
                return;
              }
              upserts.push({
                corte_id: corteId,
                presupuesto_item_id: itemId,
                cantidad: v,
                // el precio queda congelado en el corte
                pu_venta_snapshot: ex ? ex.pu_venta_snapshot : PCT.num(itemPorId(itemId)?.pu_venta),
              });
            });
            if (borrar.length) {
              const { error } = await window.sb.from("cortes_cliente_items").delete().in("id", borrar);
              if (error) throw error;
            }
            if (upserts.length) {
              const { error } = await window.sb.from("cortes_cliente_items").upsert(upserts, { onConflict: "corte_id,presupuesto_item_id" });
              if (error) throw error;
            }
          } catch (err) {
            if (esNuevo && corteId) {
              try {
                await window.sb.from("cortes_cliente").delete().eq("id", corteId);
              } catch (errRollback) {
                console.error("Error al revertir corte cliente:", errRollback);
              }
            }
            throw err;
          }
        },
      });
      if (ok) {
        await refrescar();
        let syncOk = true;
        if (corte && ["facturado", "pagado"].includes(corte.estado)) {
          const actualizado = cortes.find((c) => c.id === corte.id);
          if (actualizado) {
            const syncRes = await sincronizarCorteAFacturacion(actualizado, corte.estado);
            syncOk = Boolean(syncRes?.ok);
          }
        }
        mostrarAviso(
          corte
            ? syncOk
              ? "Corte actualizado."
              : "Corte guardado (no se pudo sincronizar automáticamente con Facturación)."
            : `Corte N° ${numero} creado.`,
          syncOk ? "exito" : "info"
        );
      }
    };

    // ---- PDF ----
    const descargarPdf = async (corte) => {
      const proy = p();
      const anteriores = new Map();
      cortes
        .filter((c) => c.numero < corte.numero)
        .forEach((c) => lineasDe(c.id).forEach((l) => anteriores.set(l.presupuesto_item_id, (anteriores.get(l.presupuesto_item_id) || 0) + PCT.num(l.cantidad))));
      const filas = lineasDe(corte.id)
        .map((l) => ({ l, i: itemPorId(l.presupuesto_item_id) }))
        .filter((x) => x.i)
        .sort((a, b) => PCT.num(a.i.orden) - PCT.num(b.i.orden))
        .map(({ l, i }) => ({ codigo: i.codigo, descripcion: i.descripcion + (i.es_adicional ? " (ADICIONAL)" : ""), unidad: i.unidad, contratado: i.cantidad, precio: l.pu_venta_snapshot, anterior: anteriores.get(i.id) || 0, actual: l.cantidad }));

      // Acumulados corridos hasta este corte (inclusive)
      const actasHasta = cortes.filter((c) => c.numero <= corte.numero).map((c) => PCT.acta(cdDe(c.id), proy));
      const acumBrutoPdf = actasHasta.reduce((s, a) => s + a.total, 0);
      const acumNetoPdf = actasHasta.reduce((s, a) => s + a.neto, 0);
      const acumAmortPdf = actasHasta.reduce((s, a) => s + Math.abs(PCT.num(a.amortizacion)), 0);
      const valorContrato = PCT.num(proy.valor_total);
      const saldoPendientePdf = Math.max(0, valorContrato - acumBrutoPdf);
      const baseAnticipo = PCT.num(proy.anticipo_recibido) > 0 ? PCT.num(proy.anticipo_recibido) : PCT.contrato(proy).anticipo;
      const anticipoPendientePdf = Math.max(0, baseAnticipo - acumAmortPdf);

      const resumenPdf = [
        ...PCT.filasActa(cdDe(corte.id), proy),
        ["Acumulado cobrado (bruto actas)", acumBrutoPdf],
        ["Acumulado cobrado (neto)", acumNetoPdf],
        ["Amortizado acumulado", acumAmortPdf],
        ...(baseAnticipo > 0 ? [["Anticipo pendiente por amortizar", anticipoPendientePdf]] : []),
        ["Saldo pendiente del contrato", saldoPendientePdf, "fuerte"],
      ];

      await PCT.pdfActa({
        titulo: `ACTA DE CORTE DE OBRA N° ${corte.numero}`,
        subtitulo: corte.numero_factura ? `Factura ${corte.numero_factura}${corte.fecha_factura ? " del " + formatoFecha(corte.fecha_factura) : ""}` : "",
        proyecto: proy,
        corte,
        filas,
        encabezadoPrecio: "PU venta",
        resumen: resumenPdf,
        firmas: ["Recibido / aprobado por el cliente", `Elaborado por ${proy.empresas?.nombre || "Pctronic"}`],
        adjuntos: docs.filter((d) => d.corte_id === corte.id),
        nombreArchivo: `Acta_corte_${corte.numero}_${(proy.nombre || "proyecto").replace(/[^\w\-]+/g, "_")}.pdf`,
      });
    };

    // ---- detalle: factura, estado, soportes ----
    const abrirDetalle = (corte) => {
      const esUltimo = corte.numero === Math.max(...cortes.map((c) => c.numero));
      const adj = docs.filter((d) => d.corte_id === corte.id);
      const m = PCT.modal({
        titulo: `Corte N° ${corte.numero} · ${formatoFecha(corte.fecha)}`,
        ancho: "max-w-3xl",
        html: `
          <div class="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div>
              <h4 class="mb-2 text-xs font-bold uppercase text-gray-500">Acta</h4>
              ${PCT.htmlResumen(PCT.filasActa(cdDe(corte.id), p()))}
              <p class="mt-2 text-xs text-gray-400">${lineasDe(corte.id).length} ítems en este corte.</p>
            </div>
            <div class="space-y-3">
              <h4 class="text-xs font-bold uppercase text-gray-500">Facturación</h4>
              <div><label class="mb-1 block text-xs font-medium">Estado</label><select id="cd-estado" class="${CLASE_INPUT}">${Object.entries(PCT.ESTADOS_CORTE).map(([k, v]) => `<option value="${k}" ${corte.estado === k ? "selected" : ""}>${v.label}</option>`).join("")}</select></div>
              <div class="grid grid-cols-2 gap-3">
                <div><label class="mb-1 block text-xs font-medium">N° de factura</label><input id="cd-factura" value="${escapeHtml(corte.numero_factura || "")}" class="${CLASE_INPUT}" /></div>
                <div><label class="mb-1 block text-xs font-medium">Fecha de factura</label><input id="cd-ffactura" type="date" value="${corte.fecha_factura || ""}" class="${CLASE_INPUT}" /></div>
              </div>
              <div><label class="mb-1 block text-xs font-medium">Valor recaudado</label><input id="cd-recaudado" inputmode="numeric" class="input-moneda ${CLASE_INPUT}" /></div>
              <div><label class="mb-1 block text-xs font-medium">Notas</label><textarea id="cd-notas" rows="2" class="${CLASE_INPUT}">${escapeHtml(corte.notas || "")}</textarea></div>
            </div>
          </div>
          <div class="mt-5">
            <div class="mb-2 flex items-center justify-between">
              <h4 class="text-xs font-bold uppercase text-gray-500">Factura y soportes</h4>
              <label class="cursor-pointer text-xs font-semibold text-primary hover:underline">+ Subir archivo<input id="cd-archivo" type="file" class="hidden" /></label>
            </div>
            <ul class="divide-y divide-gray-100 rounded-lg border border-gray-100 text-sm">${
              adj.length
                ? adj
                    .map((d) => {
                      const href = typeof urlSegura === "function" ? urlSegura(d.url) : d.url;
                      return `<li class="flex items-center justify-between px-3 py-2">${
                        href
                          ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener" class="truncate text-primary hover:underline">${escapeHtml(d.nombre_archivo)}</a>`
                          : `<span class="truncate text-gray-500">${escapeHtml(d.nombre_archivo)}</span>`
                      }<button data-borrar-doc="${d.id}" class="text-gray-400 hover:text-red-600" title="Quitar"><span class="material-symbols-outlined text-[18px]">delete</span></button></li>`;
                    })
                    .join("")
                : `<li class="px-3 py-3 text-xs text-gray-400">Sin archivos. Sube la factura o los soportes del corte; salen listados en el acta.</li>`
            }</ul>
          </div>`,
        botones: [
          ...(esUltimo
            ? [{
                texto: "Eliminar corte",
                clase: "mr-auto rounded-lg px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50",
                onClick: async () => {
                  const ok = await PCT.confirmar("Eliminar corte", `¿Eliminar el corte N° ${corte.numero}? Lo cortado vuelve a quedar pendiente por cortar.`, "Eliminar", true);
                  if (!ok) return false;
                  let facturaAsociadaId = null;
                  try {
                    const resFac = await window.sb
                      .from("facturas")
                      .select("id, estado")
                      .eq("corte_id", corte.id)
                      .maybeSingle();
                    if (!resFac.error && resFac.data?.id && resFac.data.estado !== "anulada") {
                      facturaAsociadaId = resFac.data.id;
                    }
                  } catch (eFac) { /* silencioso si la columna corte_id aún no existe */ }
                  const { error } = await window.sb.from("cortes_cliente").delete().eq("id", corte.id);
                  if (error) {
                    manejarError(error, "No se pudo eliminar el corte");
                    return false;
                  }
                  if (facturaAsociadaId) {
                    try {
                      const { error: errAnul } = await window.sb
                        .from("facturas")
                        .update({ estado: "anulada" })
                        .eq("id", facturaAsociadaId);
                      if (errAnul) console.warn("No se pudo anular la factura del corte eliminado:", errAnul);
                    } catch (eAnul) {
                      console.warn("No se pudo anular la factura del corte eliminado:", eAnul);
                    }
                  }
                  await refrescar();
                  mostrarAviso("Corte eliminado.", "exito");
                },
              }]
            : []),
          { texto: "Editar cantidades", onClick: () => abrirEditor(corte) },
          { texto: "Acta PDF", onClick: () => (descargarPdf(corte), false) },
          {
            texto: "Guardar",
            clase: PCT.BTN_PRIMARIO,
            onClick: async ({ el }) => {
              const estadoAnterior = corte.estado;
              const datos = {
                estado: el.querySelector("#cd-estado").value,
                numero_factura: el.querySelector("#cd-factura").value.trim() || null,
                fecha_factura: el.querySelector("#cd-ffactura").value || null,
                valor_recaudado: valorMoneda(el.querySelector("#cd-recaudado")),
                notas: el.querySelector("#cd-notas").value.trim() || null,
              };
              const esFacturable = ["facturado", "pagado"].includes(datos.estado);
              if (esFacturable && (datos.estado === "facturado" || estadoAnterior === "pendiente")) {
                const seguir = await confirmarSinGastosSiAplica();
                if (!seguir) return false;
              }
              const { error } = await window.sb.from("cortes_cliente").update(datos).eq("id", corte.id);
              if (error) {
                manejarError(error, "No se pudo guardar el corte");
                return false;
              }
              const syncRes = await sincronizarCorteAFacturacion({ ...corte, ...datos }, estadoAnterior);
              await refrescar();
              if (esFacturable) {
                mostrarAviso(
                  syncRes?.ok
                    ? "Corte guardado y sincronizado con Facturación."
                    : "Corte guardado (no se pudo sincronizar automáticamente con Facturación).",
                  syncRes?.ok ? "exito" : "info"
                );
              } else {
                mostrarAviso(
                  syncRes?.ok
                    ? "Corte guardado."
                    : "Corte guardado (no se pudo sincronizar automáticamente con Facturación).",
                  syncRes?.ok ? "exito" : "info"
                );
              }
            },
          },
        ],
      });
      activarCamposMoneda(".input-moneda", m.el);
      establecerValorMoneda(m.el.querySelector("#cd-recaudado"), corte.valor_recaudado || 0);

      m.el.querySelector("#cd-archivo").addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          const ruta = `${pid}/cortes/${corte.numero}/${Date.now()}_${file.name.replace(/[^\w.\-]+/g, "_")}`;
          const { error: errSubida } = await window.sb.storage.from("documentos").upload(ruta, file, { upsert: true });
          if (errSubida) throw errSubida;
          const url = window.sb.storage.from("documentos").getPublicUrl(ruta).data.publicUrl;
          const { error } = await window.sb.from("documentos").insert({ proyecto_id: pid, categoria: "corte", corte_id: corte.id, nombre_archivo: file.name, url, subido_por: PCT.usuarioId || null });
          if (error) throw error;
          m.cerrar();
          await cargar();
          abrirDetalle(cortes.find((c) => c.id === corte.id));
          mostrarAviso("Archivo subido.", "exito");
        } catch (err) {
          manejarError(err, "No se pudo subir el archivo");
        }
      });
      m.el.addEventListener("click", async (e) => {
        const b = e.target.closest("[data-borrar-doc]");
        if (!b) return;
        const { error } = await window.sb.from("documentos").delete().eq("id", b.dataset.borrarDoc);
        if (error) return manejarError(error, "No se pudo quitar el archivo");
        m.cerrar();
        await cargar();
        abrirDetalle(cortes.find((c) => c.id === corte.id));
      });
    };

    root.querySelector("#cc-nuevo").addEventListener("click", () => abrirEditor(null));
    root.querySelector("#cc-lista").addEventListener("click", (e) => {
      const tr = e.target.closest("tr[data-id]");
      if (!tr) return;
      const corte = cortes.find((c) => c.id === tr.dataset.id);
      if (e.target.closest('[data-acc="pdf"]')) return descargarPdf(corte);
      abrirDetalle(corte);
    });

    root.querySelector("#cc-lista").innerHTML = `<tr><td colspan="12" class="py-6"><div class="skeleton h-10 rounded"></div></td></tr>`;
    try {
      await cargar();
    } catch (err) {
      return manejarError(err, "No se pudieron cargar los cortes");
    }
    pintar();
  };
})(window.PCT);
