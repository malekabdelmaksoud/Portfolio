/* ── Menu Toggle ── */
const menuToggle = document.getElementById("menuToggle");
const navLinks = document.getElementById("navLinks");
const MENU_ICON_OPEN = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>';
const MENU_ICON_CLOSE = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
function setMenuOpen(opened) {
  navLinks.classList.toggle("open", opened);
  menuToggle.setAttribute("aria-expanded", String(opened));
  menuToggle.innerHTML = opened ? MENU_ICON_CLOSE : MENU_ICON_OPEN;
}
menuToggle.addEventListener("click", (e) => {
  e.stopPropagation();
  setMenuOpen(!navLinks.classList.contains("open"));
});
document.querySelectorAll(".nav-links a").forEach(a => a.addEventListener("click", () => {
  setMenuOpen(false);
}));

/* ── Close menu on outside click ── */
document.addEventListener("click", (e) => {
  if (!navLinks.contains(e.target) && !menuToggle.contains(e.target) && navLinks.classList.contains("open")) {
    setMenuOpen(false);
  }
});

/* ── Language Switcher ── */
function setLanguage(language) {
  document.documentElement.lang = language;
  document.querySelectorAll("[data-fr][data-en]").forEach(element => {
    const value = element.dataset[language];
    if (value !== undefined) element.textContent = value;
  });
  document.querySelectorAll(".lang-btn").forEach(button => {
    const active = button.dataset.lang === language;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  /* Update menu toggle aria-label per language */
  const isOpen = navLinks.classList.contains("open");
  menuToggle.setAttribute("aria-label", isOpen
    ? (language === "fr" ? "Fermer le menu" : "Close menu")
    : (language === "fr" ? "Ouvrir le menu" : "Open menu"));
  try { localStorage.setItem("portfolio-language", language); } catch (e) {}

  if (typeof ProjectsManager !== "undefined" && typeof ProjectsManager.updateSkills === "function") {
    ProjectsManager.updateSkills();
  }
  window.dispatchEvent(new Event("portfolio:languagechange"));
}
document.querySelectorAll(".lang-btn").forEach(button => {
  button.addEventListener("click", () => setLanguage(button.dataset.lang));
});
const THEME_MODES = ["dark", "light", "atelier"];
const THEME_META = {
  dark: { icon: "🌙", label: "Obsidian" },
  light: { icon: "☀️", label: "Daylight" },
  atelier: { icon: "✦", label: "Atelier" }
};

function applyTheme(theme) {
  const resolved = THEME_MODES.includes(theme)
    ? theme
    : (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
  document.documentElement.setAttribute("data-theme", resolved);
  const meta = THEME_META[resolved] || THEME_META.dark;
  const toggle = document.getElementById("theme-toggle");
  if (toggle) {
    toggle.innerHTML = `<span class="theme-icon" aria-hidden="true">${meta.icon}</span><span class="theme-label">${meta.label}</span>`;
    toggle.setAttribute("aria-label", `Mode: ${meta.label} (cliquer pour changer)`);
    toggle.setAttribute("title", `Mode: ${meta.label} — Obsidian / Daylight / Atelier`);
    toggle.dataset.mode = resolved;
  }
  document.querySelectorAll("[data-theme-mode]").forEach(btn => {
    const active = btn.dataset.themeMode === resolved;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-pressed", active ? "true" : "false");
  });
  try { localStorage.setItem("portfolio-theme", resolved); } catch (_) {}
}
let savedTheme = "dark";
try { savedTheme = localStorage.getItem("portfolio-theme") || "dark"; } catch (_) {}
if (!THEME_MODES.includes(savedTheme)) savedTheme = "dark";
applyTheme(savedTheme);
document.getElementById("theme-toggle")?.addEventListener("click", () => {
  const current = localStorage.getItem("portfolio-theme") || "dark";
  const idx = THEME_MODES.indexOf(current);
  applyTheme(THEME_MODES[(idx + 1) % THEME_MODES.length]);
});
document.querySelectorAll("[data-theme-mode]").forEach(btn => {
  btn.addEventListener("click", () => applyTheme(btn.dataset.themeMode));
});
let savedLanguage = "fr";
try { savedLanguage = localStorage.getItem("portfolio-language") || "fr"; } catch (e) {}
setLanguage(savedLanguage);

/* ── Approved API-backed project publishing ── */
const portfolioApiBase = String(window.PORTFOLIO_API_BASE || "").replace(/\/$/, "");
let remotePortfolioProjects = [];
let remotePortfolioProjectsLoaded = false;
function renderRemoteProjects() {
  if (!remotePortfolioProjectsLoaded) return;
  const grid = document.querySelector("#projets .projects-grid");
  if (!grid) return;
  const language = document.documentElement.lang === "en" ? "en" : "fr";
  grid.replaceChildren();
  remotePortfolioProjects.forEach((project, index) => {
    const card = document.createElement("article"); card.className = "project-card";
    const visual = document.createElement("div"); visual.className = "project-visual visual-" + ["one","two","three","four","five","six","seven"][index % 7];
    const number = document.createElement("span"); number.textContent = String(index + 1).padStart(2,"0");
    const symbol = document.createElement("div"); symbol.className = "project-symbol"; symbol.textContent = "↗"; visual.append(number,symbol);
    const body = document.createElement("div"); body.className = "project-body";
    const type = document.createElement("p"); type.className = "project-type"; type.textContent = project.type;
    const title = document.createElement("h3"); title.textContent = project.title;
    const description = document.createElement("p"); description.textContent = language === "en" ? project.description_en : project.description_fr;
    const link = document.createElement("a"); link.href = project.url; link.target = "_blank"; link.rel = "noopener noreferrer";
    link.textContent = language === "en" ? "View project ↗" : "Voir le projet ↗";
    body.append(type,title,description,link); card.append(visual,body); grid.append(card);
  });
}
async function loadRemoteProjects() {
  try {
    const response = await fetch(portfolioApiBase + "/api/projects", {headers:{Accept:"application/json"},credentials:"omit"});
    if (!response.ok) return;
    const data = await response.json();
    if (Array.isArray(data.projects)) { remotePortfolioProjects = data.projects; remotePortfolioProjectsLoaded = true; renderRemoteProjects(); }
  } catch (_) { /* Keep static project cards until the API is deployed. */ }
}
window.addEventListener("portfolio:languagechange", renderRemoteProjects);
window.refreshRemotePortfolioProjects = loadRemoteProjects;
window.addEventListener("portfolio:projectsimported", loadRemoteProjects);
loadRemoteProjects();

/* ── Footer Year ── */
document.getElementById("year").textContent = new Date().getFullYear();

/* ── Scroll-based header shadow ── */
const header = document.querySelector(".header");
window.addEventListener("scroll", () => {
  header.classList.toggle("scrolled", window.scrollY > 10);
}, { passive: true });

/* ── Fade-in sections on scroll ── */
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add("visible");
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.1 });

document.querySelectorAll(".section, .hero").forEach(section => {
  section.classList.add("fade-in");
  observer.observe(section);
});

/* ── Full-screen Melek AI workspace launcher ── */
const aiWorkspaceEntry = document.getElementById("aiChatToggle");
const aiWorkspaceOverlay = document.getElementById("aiWorkspaceOverlay");
const aiWorkspaceFrame = document.getElementById("aiWorkspaceFrame");
const aiWorkspaceClose = document.getElementById("aiWorkspaceClose");
const aiWorkspaceNewTab = document.getElementById("aiWorkspaceNewTab");
const aiWorkspaceUrl = portfolioApiBase + "/account.html";

if (aiWorkspaceEntry && aiWorkspaceOverlay && aiWorkspaceFrame && aiWorkspaceClose) {
  aiWorkspaceNewTab.href = aiWorkspaceUrl;

  function openMelekAI() {
    if (!aiWorkspaceFrame.getAttribute("src")) aiWorkspaceFrame.src = aiWorkspaceUrl;
    aiWorkspaceOverlay.hidden = false;
    aiWorkspaceOverlay.setAttribute("aria-hidden", "false");
    document.body.classList.add("ai-workspace-open");
    aiWorkspaceEntry.setAttribute("aria-expanded", "true");
    aiWorkspaceClose.focus();
  }

  function closeMelekAI() {
    aiWorkspaceOverlay.hidden = true;
    aiWorkspaceOverlay.setAttribute("aria-hidden", "true");
    document.body.classList.remove("ai-workspace-open");
    aiWorkspaceEntry.setAttribute("aria-expanded", "false");
    aiWorkspaceEntry.focus();
  }

  aiWorkspaceEntry.addEventListener("click", openMelekAI);
  aiWorkspaceClose.addEventListener("click", closeMelekAI);
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !aiWorkspaceOverlay.hidden) closeMelekAI();
  });

  window.addEventListener("portfolio:languagechange", () => {
    const english = document.documentElement.lang === "en";
    aiWorkspaceEntry.setAttribute("aria-label", english ? "Open Melek AI workspace" : "Ouvrir l'espace Melek AI");
    aiWorkspaceClose.setAttribute("aria-label", english ? "Close AI workspace" : "Fermer l'espace IA");
    aiWorkspaceNewTab.textContent = english ? "Open full page ↗" : "Ouvrir en pleine page ↗";
  });
}
