/* ── Menu Toggle ── */
const menuToggle = document.getElementById("menuToggle");
const navLinks = document.getElementById("navLinks");
menuToggle.addEventListener("click", () => {
  const opened = navLinks.classList.toggle("open");
  menuToggle.setAttribute("aria-expanded", String(opened));
  menuToggle.textContent = opened ? "✕" : "☰";
});
document.querySelectorAll(".nav-links a").forEach(a => a.addEventListener("click", () => {
  navLinks.classList.remove("open");
  menuToggle.setAttribute("aria-expanded", "false");
  menuToggle.textContent = "☰";
}));

/* ── Close menu on outside click ── */
document.addEventListener("click", (e) => {
  if (!navLinks.contains(e.target) && !menuToggle.contains(e.target) && navLinks.classList.contains("open")) {
    navLinks.classList.remove("open");
    menuToggle.setAttribute("aria-expanded", "false");
    menuToggle.textContent = "☰";
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
function applyTheme(theme) {
  if (theme === "system") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", theme);
  }
  const toggle = document.getElementById("theme-toggle");
  if (toggle) toggle.setAttribute("aria-label", theme === "dark" ? "Switch to light theme" : theme === "light" ? "Use system theme" : "Switch to dark theme");
  try { localStorage.setItem("portfolio-theme", theme); } catch (_) {}
}
let savedTheme = "system";
try { savedTheme = localStorage.getItem("portfolio-theme") || "system"; } catch (_) {}
applyTheme(savedTheme);
document.getElementById("theme-toggle")?.addEventListener("click", () => {
  const current = localStorage.getItem("portfolio-theme") || "system";
  applyTheme(current === "system" ? "dark" : current === "dark" ? "light" : "system");
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
const aiWorkspaceUrl = portfolioApiBase + "/login.html";

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
