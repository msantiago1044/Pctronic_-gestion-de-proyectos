document.addEventListener("DOMContentLoaded", () => {
  if (!window.PCTRONIC_IS_CONFIGURED) {
    const errorEl = document.getElementById("login-error");
    errorEl.textContent = "⚠️ La app aún no tiene configuradas las credenciales de Supabase. Agrégalas en el panel de Vercel (Settings -> Environment Variables) o en assets/js/config.js.";
    errorEl.classList.remove("hidden");
  }

  document.getElementById("form-login").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const btn = document.getElementById("btn-submit");
    const errorEl = document.getElementById("login-error");
    errorEl.classList.add("hidden");
    btn.disabled = true;
    btn.textContent = "Entrando...";

    const { error } = await window.sb.auth.signInWithPassword({ email, password });

    if (error) {
      console.error("Error de inicio de sesión:", error);

      const mensaje = /failed to fetch|networkerror/i.test(error.message || "")
        ? "No se pudo conectar con el servidor. Verifica tu conexión e inténtalo de nuevo."
        : "Correo o contraseña incorrectos.";

      errorEl.textContent = mensaje;
      errorEl.classList.remove("hidden");
      btn.disabled = false;
      btn.textContent = "Entrar";
      return;
    }
    window.location.href = "dashboard.html";
  });
});
