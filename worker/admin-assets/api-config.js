/* Public API Worker origin. Admin/account routes redirect here so Access can protect them. */
if (typeof window !== "undefined") {
  const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
  window.PORTFOLIO_API_BASE = window.PORTFOLIO_API_BASE ?? (isLocal ? "" : "https://melek-portfolio-api.melekabdelmaksoud72.workers.dev");

  const MODES = ["dark", "light", "atelier"];
  const LABELS = { dark: "🌙 Obsidian", light: "☀️ Daylight", atelier: "✦ Atelier" };
  let saved = "dark";
  try { saved = localStorage.getItem("portfolio-theme") || "dark"; } catch (_) {}
  if (!MODES.includes(saved)) saved = "dark";
  document.documentElement.setAttribute("data-theme", saved);

  document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("page-theme-toggle");
    if (!btn) return;
    const sync = mode => {
      document.documentElement.setAttribute("data-theme", mode);
      btn.textContent = LABELS[mode] || LABELS.dark;
      try { localStorage.setItem("portfolio-theme", mode); } catch (_) {}
    };
    sync(saved);
    btn.addEventListener("click", () => {
      saved = MODES[(MODES.indexOf(saved) + 1) % MODES.length];
      sync(saved);
    });
  });
}
