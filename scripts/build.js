// ============================================================================
// Script de compilación / preparación para Vercel y entornos de despliegue
// ----------------------------------------------------------------------------
// Lee las variables de entorno (SUPABASE_URL, SUPABASE_ANON_KEY, NOMBRE_EMPRESA)
// y genera de forma segura `assets/js/config.js` sin exponer credenciales en Git.
// ============================================================================

const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const configPath = path.join(rootDir, "assets", "js", "config.js");
const envPath = path.join(rootDir, ".env");

// 1. Cargar .env local si existe (desarrollo local)
if (fs.existsSync(envPath)) {
  try {
    const envContent = fs.readFileSync(envPath, "utf8");
    envContent.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) return;
      const idx = trimmed.indexOf("=");
      const key = trimmed.slice(0, idx).trim();
      const rawVal = trimmed.slice(idx + 1).trim();
      const val = rawVal.replace(/^["']|["']$/g, "");
      if (!process.env[key]) {
        process.env[key] = val;
      }
    });
    console.log("[Build] Archivo .env local cargado correctamente.");
  } catch (err) {
    console.warn("[Build] Aviso: No se pudo leer .env local:", err.message);
  }
}

// 2. Extraer variables requeridas
const supabaseUrl =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  "";

const supabaseAnonKey =
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  "";

const nombreEmpresa =
  process.env.NOMBRE_EMPRESA ||
  process.env.NEXT_PUBLIC_NOMBRE_EMPRESA ||
  "Pctronic Seguridad Electrónica";

// 3. Generar contenido para assets/js/config.js
if (supabaseUrl && supabaseAnonKey) {
  const fileContent = `// ============================================================================
// CONFIGURACIÓN — Generado automáticamente en el build de despliegue
// ============================================================================

window.PCTRONIC_CONFIG = {
  SUPABASE_URL: ${JSON.stringify(supabaseUrl)},
  SUPABASE_ANON_KEY: ${JSON.stringify(supabaseAnonKey)},
  NOMBRE_EMPRESA: ${JSON.stringify(nombreEmpresa)},
};
`;

  fs.writeFileSync(configPath, fileContent, "utf8");
  console.log("[Build] assets/js/config.js generado exitosamente desde variables de entorno.");
} else {
  console.warn(
    "[Build] ATENCIÓN: SUPABASE_URL o SUPABASE_ANON_KEY no están definidas en el entorno.\n" +
    "         Recuerda agregarlas en Vercel: Project Settings -> Environment Variables."
  );

  // Si no existe config.js, crear una plantilla base segura
  if (!fs.existsSync(configPath)) {
    const fallbackContent = `// ============================================================================
// CONFIGURACIÓN BASE (Faltan variables de entorno)
// ============================================================================

window.PCTRONIC_CONFIG = {
  SUPABASE_URL: "",
  SUPABASE_ANON_KEY: "",
  NOMBRE_EMPRESA: ${JSON.stringify(nombreEmpresa)},
};
`;
    fs.writeFileSync(configPath, fallbackContent, "utf8");
    console.log("[Build] Creada plantilla base en assets/js/config.js");
  }
}
