// ============================================================================
// Crea el cliente de Supabase que todas las páginas usan para leer/guardar datos.
// Si las credenciales no están configuradas, provee un cliente seguro que previene
// excepciones no controladas e informa claramente en la consola y la interfaz.
// ============================================================================

(function () {
  const cfg = window.PCTRONIC_CONFIG || {};

  const isConfigured = Boolean(
    cfg.SUPABASE_URL &&
      !cfg.SUPABASE_URL.includes("tu-proyecto") &&
      !cfg.SUPABASE_URL.includes("TU-PROYECTO") &&
      cfg.SUPABASE_ANON_KEY &&
      !cfg.SUPABASE_ANON_KEY.includes("tu-llave")
  );

  window.PCTRONIC_IS_CONFIGURED = isConfigured;

  if (!isConfigured) {
    console.warn(
      "[Pctronic Seguridad] Faltan configurar las credenciales de Supabase.\n" +
      "  - Si estás en Vercel: Ve a Settings -> Environment Variables y define SUPABASE_URL y SUPABASE_ANON_KEY.\n" +
      "  - Si estás en desarrollo local: Copia .env.example a .env y ejecuta `node scripts/build.js`."
    );

    // Cliente seguro de reserva para evitar que la aplicación colapse
    window.sb = {
      auth: {
        getSession: async () => ({
          data: { session: null },
          error: new Error("Falta configurar SUPABASE_URL y SUPABASE_ANON_KEY."),
        }),
        signInWithPassword: async () => ({
          data: null,
          error: {
            message:
              "Falta configurar las credenciales de Supabase. Agrégalas en las Variables de Entorno de Vercel o en assets/js/config.js.",
          },
        }),
        signOut: async () => ({ error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
        updateUser: async () => ({
          data: null,
          error: { message: "Falta configurar credenciales de Supabase." },
        }),
      },
      from: () => ({
        select: () => ({
          order: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }),
          eq: () => Promise.resolve({ data: [], error: null }),
        }),
        insert: () =>
          Promise.resolve({
            data: null,
            error: { message: "Falta configurar credenciales de Supabase." },
          }),
        update: () => ({
          eq: () =>
            Promise.resolve({
              data: null,
              error: { message: "Falta configurar credenciales de Supabase." },
            }),
        }),
        delete: () => ({
          eq: () =>
            Promise.resolve({
              data: null,
              error: { message: "Falta configurar credenciales de Supabase." },
            }),
        }),
      }),
      storage: {
        from: () => ({
          upload: async () => ({
            error: { message: "Falta configurar credenciales de Supabase." },
          }),
          getPublicUrl: () => ({ data: { publicUrl: "" } }),
        }),
      },
    };
    return;
  }

  window.sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
})();
