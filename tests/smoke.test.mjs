import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";

const ROOT = path.resolve(import.meta.dirname, "..");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
};

let server;
let baseUrl = "";

function esRecursoLocal(ref) {
  if (!ref) return false;
  const trimmed = ref.trim();
  return (
    trimmed.length > 0 &&
    !/^(https?:)?\/\//i.test(trimmed) &&
    !/^(data|blob|mailto|tel|javascript):/i.test(trimmed) &&
    !trimmed.startsWith("#")
  );
}

before(async () => {
  server = http.createServer((req, res) => {
    const reqUrl = new URL(req.url || "/", "http://127.0.0.1");
    let relPath = decodeURIComponent(reqUrl.pathname).replace(/^\/+/, "");
    if (!relPath) relPath = "index.html";

    const absPath = path.resolve(ROOT, relPath);
    if (!absPath.startsWith(ROOT + path.sep) && absPath !== ROOT) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    if (!fs.existsSync(absPath) || fs.statSync(absPath).isDirectory()) {
      res.writeHead(404);
      res.end("Not Found");
      return;
    }

    const ext = path.extname(absPath).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
    fs.createReadStream(absPath).pipe(res);
  });

  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });
});

after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
});

const htmlFiles = fs
  .readdirSync(ROOT)
  .filter((f) => f.endsWith(".html"))
  .sort();

test("smoke: existen las 22 páginas HTML en la raíz del repositorio", () => {
  assert.equal(htmlFiles.length, 22, `Se esperaban 22 archivos HTML y se encontraron ${htmlFiles.length}`);
});

for (const file of htmlFiles) {
  test(`smoke HTTP/CSP/SRI: ${file}`, async () => {
    const res = await fetch(`${baseUrl}/${file}`);
    assert.equal(res.status, 200, `${file} debe responder 200 OK`);

    const html = await res.text();

    // 1. Debe incluir el CSS compilado de Tailwind (excepto index.html que es redirector puro)
    if (file !== "index.html") {
      assert.ok(
        html.includes("assets/css/tailwind.min.css"),
        `${file} debe incluir assets/css/tailwind.min.css`
      );
    }

    // 2. No debe contener ningún <script> inline sin atributo src (CSP)
    const inlineScripts = [...html.matchAll(/<script\b(?![^>]*\bsrc\s*=)[^>]*>/gi)];
    assert.equal(
      inlineScripts.length,
      0,
      `${file} contiene ${inlineScripts.length} etiqueta(s) <script> inline sin src`
    );

    // 3. Todos los <script> dentro de <head> deben usar defer
    const headMatch = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i);
    assert.ok(headMatch, `${file} debe tener etiqueta <head>`);
    const headScripts = [...headMatch[1].matchAll(/<script\b[^>]*>/gi)].map((m) => m[0]);
    for (const tag of headScripts) {
      assert.match(tag, /\bdefer\b/i, `${file}: script en <head> sin defer -> ${tag}`);
    }

    // 4. @supabase/supabase-js debe incluir integrity="sha384-..." (SRI)
    const supaScripts = [...html.matchAll(/<script\b[^>]*@supabase\/supabase-js[^>]*>/gi)].map((m) => m[0]);
    assert.ok(supaScripts.length > 0, `${file} debe cargar @supabase/supabase-js`);
    for (const tag of supaScripts) {
      assert.match(
        tag,
        /\bintegrity\s*=\s*["']sha384-[A-Za-z0-9+/=]+["']/i,
        `${file}: @supabase/supabase-js sin atributo integrity="sha384-..."`
      );
    }

    // 5. Todos los <script src="..."> y <link href="..."> locales deben existir en disco y responder 200 OK
    const assetRefs = new Set();
    for (const m of html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)) {
      if (esRecursoLocal(m[1])) assetRefs.add(m[1]);
    }
    for (const m of html.matchAll(/<link\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi)) {
      if (esRecursoLocal(m[1])) assetRefs.add(m[1]);
    }

    for (const ref of assetRefs) {
      const cleanPath = ref.split("?")[0].split("#")[0].replace(/^\/+/, "");
      const diskPath = path.resolve(ROOT, cleanPath);
      assert.ok(fs.existsSync(diskPath), `${file}: recurso local inexistente en disco -> ${ref}`);

      const assetRes = await fetch(`${baseUrl}/${cleanPath}`);
      assert.equal(assetRes.status, 200, `${file}: recurso local ${ref} no respondió 200 OK`);
    }
  });
}
