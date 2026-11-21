/* Public API Worker origin. Admin/account routes redirect here so Access can protect them. */
if (typeof window !== "undefined") {
  const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
  window.PORTFOLIO_API_BASE = window.PORTFOLIO_API_BASE ?? (isLocal ? "" : "https://melek-portfolio-api.melekabdelmaksoud72.workers.dev");
}
