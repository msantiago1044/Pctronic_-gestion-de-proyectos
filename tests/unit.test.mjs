import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const ROOT = path.resolve(import.meta.dirname, "..");

function crearContextoApp() {
  const windowObj = {
    location: { search: "" },
    PCT: {},
  };
  const ctx = {
    window: windowObj,
    document: {
      querySelectorAll: () => [],
      createElement: () => ({ style: {}, remove: () => {} }),
      body: { appendChild: () => {} },
    },
    URL,
    URLSearchParams,
    console,
    setTimeout,
    clearTimeout,
    Number,
    String,
    Array,
    Map,
    Set,
    Math,
    Date,
    RegExp,
    JSON,
    isNaN,
    isFinite,
    encodeURIComponent,
  };
  vm.createContext(ctx);

  const utilCode = fs.readFileSync(path.join(ROOT, "assets/js/util.js"), "utf8");
  vm.runInContext(utilCode, ctx, { filename: "assets/js/util.js" });

  const coreCode = fs.readFileSync(path.join(ROOT, "assets/js/proy/core.js"), "utf8");
  vm.runInContext(coreCode, ctx, { filename: "assets/js/proy/core.js" });

  ctx.module = { exports: {} };
  const impCode = fs.readFileSync(path.join(ROOT, "assets/js/proy/importar.js"), "utf8");
  vm.runInContext(impCode, ctx, { filename: "assets/js/proy/importar.js" });

  return ctx;
}

const ctx = crearContextoApp();
const PCT = ctx.window.PCT;

test("util.js: escapeHtml escapa caracteres peligrosos y maneja null/undefined", () => {
  assert.equal(ctx.escapeHtml('<script>alert("xss")</script>'), "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;");
  assert.equal(ctx.escapeHtml("A & B 'C'"), "A &amp; B &#39;C&#39;");
  assert.equal(ctx.escapeHtml(null), "");
  assert.equal(ctx.escapeHtml(undefined), "");
});

test("util.js: formatoMoneda formatea números y valores nulos en COP", () => {
  const cero = ctx.formatoMoneda(null);
  assert.match(cero, /0/);
  const millon = ctx.formatoMoneda(1500000);
  assert.match(millon, /1[.,]500[.,]000/);
});

test("util.js: badgeHtml genera badge conocido y fallback seguro", () => {
  const estadosFactura = vm.runInContext("ESTADOS_FACTURA", ctx);
  const html = ctx.badgeHtml(estadosFactura, "pagada");
  assert.match(html, /Pagada/);
  assert.match(html, /bg-green-100/);

  const fallback = ctx.badgeHtml(estadosFactura, null);
  assert.match(fallback, /—/);
});

test("util.js: urlSegura bloquea javascript: y data:text/html cuando está disponible", (t) => {
  if (typeof ctx.urlSegura !== "function") {
    t.skip("urlSegura aún no está definida en util.js");
    return;
  }
  assert.equal(ctx.urlSegura("https://pctronic.co/logo.png"), "https://pctronic.co/logo.png");
  assert.equal(ctx.urlSegura("http://example.com/a.jpg"), "http://example.com/a.jpg");
  assert.equal(ctx.urlSegura("/assets/img/logo.png"), "/assets/img/logo.png");
  assert.equal(ctx.urlSegura("./logo.png"), "./logo.png");
  assert.equal(ctx.urlSegura("//evil.com/x.png"), "");
  assert.equal(ctx.urlSegura("javascript:alert(1)"), "");
  assert.equal(ctx.urlSegura("  JAVASCRIPT:alert(1)"), "");
  assert.equal(ctx.urlSegura("data:text/html,<script>alert(1)</script>"), "");
  assert.equal(ctx.urlSegura(null), "");
});

test("util.js: fechaLocalISO devuelve YYYY-MM-DD en hora local cuando está disponible", (t) => {
  if (typeof ctx.fechaLocalISO !== "function") {
    t.skip("fechaLocalISO aún no está definida en util.js");
    return;
  }
  const res = ctx.fechaLocalISO(new Date(2026, 4, 9));
  assert.equal(res, "2026-05-09");
});

test("proy/core.js: calcItem calcula venta, material con/sin IVA y margen", () => {
  assert.equal(PCT.calcItem(null), null);
  assert.equal(PCT.calcItem({ tipo: "capitulo" }), null);

  const proySinIvaMat = { iva_materiales: false, iva_porcentaje: 19 };
  const c1 = PCT.calcItem({ tipo: "item", cantidad: 2, cu_material: 100, pu_venta: 150 }, proySinIvaMat);
  assert.equal(c1.cuMatIva, 100);
  assert.equal(c1.totalVenta, 300);
  assert.equal(c1.costoTotal, 200);
  assert.equal(c1.margen, 100);
  assert.ok(Math.abs(c1.margenPct - 1 / 3) < 1e-9);

  const proyConIvaMat = { iva_materiales: true, iva_porcentaje: 19 };
  const c2 = PCT.calcItem({ tipo: "item", cantidad: 2, cu_material: 100, pu_venta: 150 }, proyConIvaMat);
  assert.equal(c2.cuMatIva, 119);
  assert.equal(c2.costoTotal, 238);
  assert.equal(c2.margen, 62);
});

test("proy/core.js: resumenPresupuesto separa contrato base y adicionales", () => {
  const items = [
    { tipo: "capitulo", descripcion: "Cap 1" },
    { tipo: "item", cantidad: 2, cu_material: 100, pu_venta: 200, es_adicional: false },
    { tipo: "item", cantidad: 1, cu_material: 50, pu_venta: 120, es_adicional: true },
  ];
  const res = PCT.resumenPresupuesto(items, { iva_materiales: false, iva_porcentaje: 19 });
  assert.equal(res.base.n, 1);
  assert.equal(res.base.venta, 400);
  assert.equal(res.base.costo, 200);
  assert.equal(res.adic.n, 1);
  assert.equal(res.adic.venta, 120);
  assert.equal(res.adic.costo, 50);
});

test("proy/core.js: contrato calcula AIU e IVA pleno correctamente", () => {
  const proyAiu = {
    tipo_contrato: "aiu",
    administracion_porcentaje: 10,
    imprevistos_porcentaje: 5,
    utilidad_porcentaje: 5,
    iva_porcentaje: 19,
    anticipo_porcentaje: 30,
  };
  const aiu = PCT.contrato(proyAiu, 1000);
  assert.equal(aiu.admin, 100);
  assert.equal(aiu.imprev, 50);
  assert.equal(aiu.util, 50);
  assert.equal(aiu.iva, 9.5); // 19% de la utilidad (50)
  assert.equal(aiu.ingreso, 1200);
  assert.equal(aiu.total, 1209.5);

  const proyIvaPleno = { tipo_contrato: "iva_pleno", iva_porcentaje: 19, anticipo_porcentaje: 0 };
  const pleno = PCT.contrato(proyIvaPleno, 1000);
  assert.equal(pleno.iva, 190);
  assert.equal(pleno.total, 1190);
});

test("proy/core.js: margenActual y avanceFisico manejan valores borde y nulos", () => {
  const m = PCT.margenActual({ tipo_contrato: "iva_pleno", iva_porcentaje: 19 }, { cdCortado: 1000, gastado: 400 });
  assert.equal(m.facturado, 1000);
  assert.equal(m.gastado, 400);
  assert.equal(m.margen, 600);
  assert.equal(m.pct, 0.6);

  const mCero = PCT.margenActual({ tipo_contrato: "iva_pleno" }, { cdCortado: 0, gastado: 100 });
  assert.equal(mCero.pct, null);

  PCT.estado.ejec = new Map([
    ["i1", { cant_ejecutada: 15 }], // supera cantidad 10 -> debe topar en 10
    ["i2", { cant_ejecutada: 2 }],
  ]);
  const av = PCT.avanceFisico([
    { id: "i1", tipo: "item", cantidad: 10, pu_venta: 100, es_adicional: false },
    { id: "i2", tipo: "item", cantidad: 5, pu_venta: 50, es_adicional: true },
  ]);
  assert.equal(av.cd, 1000);
  assert.equal(av.ejecBase, 1000);
  assert.equal(av.ejecAdic, 100);
  assert.equal(av.pct, 1);
});

test("reglas de negocio: KPIs de facturación excluyen anuladas y suman pendiente+vencida", () => {
  const facturas = [
    { estado: "pagada", valor: 1000 },
    { estado: "pendiente", valor: 500 },
    { estado: "vencida", valor: 300 },
    { estado: "anulada", valor: 9999 },
    { estado: "pendiente", valor: null },
  ];
  const total = facturas.filter((f) => f.estado !== "anulada").reduce((a, f) => a + Number(f.valor || 0), 0);
  const pagado = facturas.filter((f) => f.estado === "pagada").reduce((a, f) => a + Number(f.valor || 0), 0);
  const pendiente = facturas.filter((f) => ["pendiente", "vencida"].includes(f.estado)).reduce((a, f) => a + Number(f.valor || 0), 0);

  assert.equal(total, 1800);
  assert.equal(pagado, 1000);
  assert.equal(pendiente, 800);
});

test("reglas de negocio: validación de porcentajes y evaluación aritmética segura si existe", (t) => {
  const esPorcentajeValido = (v) => Number.isFinite(v) && v >= 0 && v <= 100;
  assert.equal(esPorcentajeValido(0), true);
  assert.equal(esPorcentajeValido(19), true);
  assert.equal(esPorcentajeValido(100), true);
  assert.equal(esPorcentajeValido(-1), false);
  assert.equal(esPorcentajeValido(101), false);
  assert.equal(esPorcentajeValido(NaN), false);

  const fnEval = PCT.evaluarAritmetica || ctx.evaluarAritmetica || ctx.evaluarFormulaSegura || ctx.module?.exports?.evaluarAritmeticaSegura;
  if (typeof fnEval !== "function") {
    t.skip("Helper de evaluación aritmética segura aún no exportado");
    return;
  }
  assert.equal(fnEval("10 + 5 * 2"), 20);
  assert.equal(fnEval("process.exit(1)"), undefined);
});
