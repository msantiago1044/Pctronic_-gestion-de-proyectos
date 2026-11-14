document.addEventListener("DOMContentLoaded", async () => {
  const { data: { session } } = await window.sb.auth.getSession();
  window.location.replace(session ? "dashboard.html" : "login.html");
});
