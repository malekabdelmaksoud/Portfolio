/* ── Menu Toggle ── */
const menuToggle = document.getElementById("menuToggle");
const navLinks = document.getElementById("navLinks");
const MENU_ICON_OPEN = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>';
const MENU_ICON_CLOSE = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';

function setMenuOpen(opened) {
  if (!navLinks || !menuToggle) return;
  navLinks.classList.toggle("open", opened);
  menuToggle.setAttribute("aria-expanded", String(opened));
  menuToggle.innerHTML = opened ? MENU_ICON_CLOSE : MENU_ICON_OPEN;
}

if (menuToggle && navLinks) {
  menuToggle.addEventListener("click", (e) => {
    e.stopPropagation();
    setMenuOpen(!navLinks.classList.contains("open"));
  });
  navLinks.querySelectorAll("a, .mobile-only-cv").forEach(el => {
    el.addEventListener("click", () => setMenuOpen(false));
  });
  document.addEventListener("click", (e) => {
    if (!navLinks.contains(e.target) && !menuToggle.contains(e.target) && navLinks.classList.contains("open")) {
      setMenuOpen(false);
    }
  });
}

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
  if (menuToggle && navLinks) {
    const isOpen = navLinks.classList.contains("open");
    menuToggle.setAttribute("aria-label", isOpen
      ? (language === "fr" ? "Fermer le menu" : "Close menu")
      : (language === "fr" ? "Ouvrir le menu" : "Open menu"));
  }
  try { localStorage.setItem("portfolio-language", language); } catch (_) {}

  if (typeof ProjectsManager !== "undefined") {
    if (!remotePortfolioProjectsLoaded && typeof ProjectsManager.render === "function") {
      ProjectsManager.render();
    } else if (typeof ProjectsManager.updateSkills === "function") {
      ProjectsManager.updateSkills();
    }
  }
  window.dispatchEvent(new Event("portfolio:languagechange"));
}

document.querySelectorAll(".lang-btn").forEach(button => {
  button.addEventListener("click", () => setLanguage(button.dataset.lang));
});

/* ── 3-Mode Theme Switcher (Obsidian / Daylight / Atelier) ── */
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

/* ── Shared Project Card V2 Metadata, Mockup Builder & Filter ── */
let activeProjectFilter = "all";
let currentRenderedProjects = [];

function getProjectMetadata(project, index) {
  const title = String(project.title || project.name || "Project");
  const type = String(project.type || "PROJECT");
  const url = String(project.url || project.github || "#");
  const blob = `${title} ${type} ${url}`.toLowerCase();

  const categories = [];
  if (/\b(php|laravel|symfony)\b/.test(blob)) categories.push("php", "web");
  if (/\bjava\b(?!script)/.test(blob)) categories.push("java", "desktop");
  if (/\b(typescript|workers|mcp|web|html|css|angular|react)\b/.test(blob)) categories.push("web");
  if (/\b(typescript|workers|mcp)\b/.test(blob)) categories.push("typescript");
  if (/\b(c#|csharp|\.net|dotnet)\b/.test(blob)) categories.push("csharp", "desktop");
  if (categories.length === 0) categories.push("web");

  let emoji = "💡";
  let mockupKind = "browser";
  let badgeShort = type.split("·")[0].trim() || "App";

  if (/\blaravel\b/.test(blob)) {
    emoji = "🚀"; mockupKind = "lms"; badgeShort = "laravel-mvc.app";
  } else if (/\bsymfony\b/.test(blob)) {
    emoji = "⚡"; mockupKind = "lms"; badgeShort = "symfony.twig";
  } else if (/\bphp\b/.test(blob)) {
    emoji = "🌐"; mockupKind = "browser"; badgeShort = "projet-php.local";
  } else if (/\belearning\b/.test(blob)) {
    emoji = "🎓"; mockupKind = "lms"; badgeShort = "elearning.java";
  } else if (/\bmagasin\b|\bstore\b/.test(blob)) {
    emoji = "🛒"; mockupKind = "table"; badgeShort = "StoreManager.java";
  } else if (/\bpoo\b|\boop\b/.test(blob)) {
    emoji = "♦"; mockupKind = "code"; badgeShort = "OOP_Hierarchy.java";
  } else if (/\bhunter\b|\bmcp\b|\bworkers\b|\btypescript\b/.test(blob)) {
    emoji = "🔎"; mockupKind = "code"; badgeShort = "workers-mcp.ts";
  } else if (/\bc#\b|\bfirstapp\b|\b\.net\b/.test(blob)) {
    emoji = "🖥️"; mockupKind = "browser"; badgeShort = "FirstApp.cs";
  } else if (/\bjava\b/.test(blob)) {
    emoji = "☕"; mockupKind = "code"; badgeShort = `${title.slice(0, 14)}.java`;
  }

  const techRules = [
    { regex: /\blaravel\b/i, label: "Laravel", dot: "dot-laravel" },
    { regex: /\bsymfony\b/i, label: "Symfony", dot: "dot-symfony" },
    { regex: /\bangular\b/i, label: "Angular", dot: "dot-angular" },
    { regex: /\btypescript\b/i, label: "TypeScript", dot: "dot-js" },
    { regex: /\bjavascript\b/i, label: "JavaScript", dot: "dot-js" },
    { regex: /\bphp\b/i, label: "PHP", dot: "dot-php" },
    { regex: /\bjava\b(?!script)/i, label: "Java", dot: "dot-java" },
    { regex: /\bpython\b/i, label: "Python", dot: "dot-python" },
    { regex: /\bc#\b|csharp/i, label: "C#", dot: "dot-csharp" },
    { regex: /\bworkers\b/i, label: "Workers", dot: "" },
    { regex: /\bmcp\b/i, label: "MCP", dot: "" },
    { regex: /\.net\b/i, label: ".NET", dot: "" },
    { regex: /\bweb\b/i, label: "Web", dot: "" }
  ];

  const chips = [];
  techRules.forEach(rule => {
    if (rule.regex.test(blob) && chips.length < 3) {
      chips.push({ label: rule.label, dot: rule.dot });
    }
  });
  if (chips.length === 0) chips.push({ label: type.split("·")[0].trim() || "Project", dot: "" });

  const visualClasses = ["visual-one", "visual-two", "visual-three", "visual-four", "visual-five", "visual-six", "visual-seven", "visual-eight"];
  return {
    title,
    type,
    url,
    emoji,
    mockupKind,
    badgeShort,
    chips,
    visualClass: visualClasses[index % visualClasses.length],
    categories: Array.from(new Set(categories)).join(" ")
  };
}

function createMockupNode(meta) {
  const frame = document.createElement("div");
  frame.className = "mockup-frame mockup-" + meta.mockupKind;

  const bar = document.createElement("div");
  bar.className = "mockup-bar";
  bar.append(document.createElement("span"), document.createElement("span"), document.createElement("span"));
  const fileTag = document.createElement("small");
  fileTag.textContent = meta.badgeShort;
  bar.append(fileTag);
  frame.append(bar);

  if (meta.mockupKind === "lms") {
    const content = document.createElement("div");
    content.className = "mockup-content";
    const sidebar = document.createElement("div");
    sidebar.className = "mockup-sidebar";
    sidebar.append(document.createElement("i"), document.createElement("i"), document.createElement("i"));
    const main = document.createElement("div");
    main.className = "mockup-main";
    const kpi = document.createElement("div");
    kpi.className = "mockup-kpi-row";
    meta.chips.slice(0, 3).forEach(ch => {
      const b = document.createElement("b");
      b.textContent = ch.label;
      kpi.append(b);
    });
    const c1 = document.createElement("div"); c1.className = "mockup-chart-bar";
    const f1 = document.createElement("i"); f1.style.width = "84%"; c1.append(f1);
    const c2 = document.createElement("div"); c2.className = "mockup-chart-bar";
    const f2 = document.createElement("i"); f2.style.width = "64%"; c2.append(f2);
    main.append(kpi, c1, c2);
    content.append(sidebar, main);
    frame.append(content);
  } else if (meta.mockupKind === "table") {
    const rows = document.createElement("div");
    rows.className = "mockup-rows";
    rows.append(document.createElement("i"), document.createElement("i"), document.createElement("i"));
    frame.append(rows);
  } else if (meta.mockupKind === "code") {
    const codeBox = document.createElement("div");
    codeBox.className = "mockup-code-lines";
    const lines = meta.categories.includes("typescript")
      ? ["GET /mcp/search?q=PFE", "status: 200 OK", "edge: Cloudflare Workers"]
      : [`class ${meta.title.replace(/[^a-zA-Z0-9]/g, "")} {}`, "extends CoreModule", "@Override run()"];
    lines.forEach(line => {
      const i = document.createElement("i");
      i.textContent = line;
      codeBox.append(i);
    });
    frame.append(codeBox);
  } else {
    const web = document.createElement("div");
    web.className = "mockup-web-hero";
    const pill = document.createElement("div");
    pill.className = "mockup-web-pill";
    pill.textContent = meta.chips.map(c => c.label).join(" · ");
    const wlines = document.createElement("div");
    wlines.className = "mockup-web-lines";
    const l1 = document.createElement("i");
    const l2 = document.createElement("i"); l2.className = "short";
    wlines.append(l1, l2);
    const wbtn = document.createElement("div"); wbtn.className = "mockup-web-btn";
    web.append(pill, wlines, wbtn);
    frame.append(web);
  }
  return frame;
}

function applyProjectFilter(filterValue) {
  activeProjectFilter = filterValue || "all";
  document.querySelectorAll(".filter-tab").forEach(tab => {
    tab.classList.toggle("active", tab.dataset.filter === activeProjectFilter);
  });
  document.querySelectorAll("#projets .project-card").forEach(card => {
    const cats = String(card.dataset.category || "").split(/\s+/).filter(Boolean);
    const visible = activeProjectFilter === "all" || cats.includes(activeProjectFilter);
    card.style.display = visible ? "" : "none";
  });
}

window.openProjectPreviewModal = function(projectOrIndex) {
  const backdrop = document.getElementById("projectPreviewBackdrop");
  if (!backdrop) return;
  let entry = null;
  if (typeof projectOrIndex === "number") {
    entry = currentRenderedProjects[projectOrIndex];
  } else {
    entry = currentRenderedProjects.find(p => String(p.id) === String(projectOrIndex));
  }
  if (!entry) return;

  const language = document.documentElement.lang === "en" ? "en" : "fr";
  const idx = Math.max(0, currentRenderedProjects.indexOf(entry));
  const meta = getProjectMetadata(entry, idx);
  const descText = language === "en"
    ? (entry.description_en || entry.description || "")
    : (entry.description_fr || entry.description || "");

  document.getElementById("ppType").textContent = meta.type;
  document.getElementById("ppTitle").textContent = `${meta.emoji} ${meta.title}`;
  document.getElementById("ppDesc").textContent = descText;
  document.getElementById("ppGithubLink").href = meta.url;

  const visualSlot = document.getElementById("ppVisual");
  visualSlot.className = "pp-visual " + meta.visualClass;
  visualSlot.replaceChildren(createMockupNode(meta));

  const tagsSlot = document.getElementById("ppTags");
  tagsSlot.replaceChildren(...meta.chips.map(ch => {
    const span = document.createElement("span");
    span.className = "b-chip";
    if (ch.dot) {
      const dot = document.createElement("i");
      dot.className = ch.dot;
      span.append(dot);
    }
    span.append(document.createTextNode(ch.label));
    return span;
  }));

  backdrop.classList.add("active");
};

window.closeProjectPreviewModal = function() {
  document.getElementById("projectPreviewBackdrop")?.classList.remove("active");
};

document.getElementById("projectPreviewBackdrop")?.addEventListener("click", (e) => {
  if (e.target.id === "projectPreviewBackdrop") window.closeProjectPreviewModal();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") window.closeProjectPreviewModal();
});

window.renderPortfolioProjectsV2 = function(grid, projectsList, options = {}) {
  if (!grid) return;
  const language = document.documentElement.lang === "en" ? "en" : "fr";
  const isAdmin = Boolean(options.isAdmin);
  currentRenderedProjects = Array.isArray(projectsList) ? projectsList : [];
  grid.replaceChildren();

  currentRenderedProjects.forEach((project, index) => {
    const meta = getProjectMetadata(project, index);
    const card = document.createElement("article");
    card.className = "project-card project-card-v2";
    card.dataset.category = meta.categories;
    if (project.id) card.id = "card_" + project.id;

    const visual = document.createElement("div");
    visual.className = "project-visual " + meta.visualClass;
    const num = document.createElement("span");
    num.textContent = String(index + 1).padStart(2, "0");
    visual.append(createMockupNode(meta), num);

    if (isAdmin && project.id) {
      const adminWrap = document.createElement("div");
      adminWrap.className = "admin-proj-actions";
      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "admin-act-btn edit";
      editBtn.title = "Modifier";
      editBtn.textContent = "✏️";
      editBtn.addEventListener("click", () => {
        if (typeof openEditProjectModal === "function") openEditProjectModal(project.id);
      });
      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "admin-act-btn del";
      delBtn.title = "Supprimer";
      delBtn.textContent = "✕";
      delBtn.addEventListener("click", () => {
        if (typeof deleteProjectDirect === "function") deleteProjectDirect(project.id);
      });
      adminWrap.append(editBtn, delBtn);
      visual.append(adminWrap);
    }

    const body = document.createElement("div");
    body.className = "project-body";

    const typeEl = document.createElement("p");
    typeEl.className = "project-type";
    typeEl.textContent = meta.type;

    const titleRow = document.createElement("div");
    titleRow.className = "pcard-title-row";
    const emojiEl = document.createElement("span");
    emojiEl.className = "pcard-emoji";
    emojiEl.textContent = meta.emoji;
    const h3 = document.createElement("h3");
    h3.textContent = meta.title;
    titleRow.append(emojiEl, h3);

    const descEl = document.createElement("p");
    descEl.textContent = language === "en"
      ? (project.description_en || project.description || "")
      : (project.description_fr || project.description || "");

    const techList = document.createElement("div");
    techList.className = "pcard-tech-list";
    meta.chips.forEach(ch => {
      const chip = document.createElement("span");
      chip.className = "b-chip";
      if (ch.dot) {
        const dot = document.createElement("i");
        dot.className = ch.dot;
        chip.append(dot);
      }
      chip.append(document.createTextNode(ch.label));
      techList.append(chip);
    });

    const actions = document.createElement("div");
    actions.className = "pcard-actions";
    const viewBtn = document.createElement("button");
    viewBtn.type = "button";
    viewBtn.className = "btn-pcard-view";
    viewBtn.textContent = language === "en" ? "View Project →" : "Voir le Projet →";
    viewBtn.addEventListener("click", () => window.openProjectPreviewModal(index));

    const githubLink = document.createElement("a");
    githubLink.className = "btn-pcard-github";
    githubLink.href = meta.url;
    githubLink.target = "_blank";
    githubLink.rel = "noopener noreferrer";
    githubLink.textContent = "GitHub ↗";

    actions.append(viewBtn, githubLink);
    body.append(typeEl, titleRow, descEl, techList, actions);
    card.append(visual, body);
    grid.append(card);
  });

  applyProjectFilter(activeProjectFilter);
};

/* ── Filter Tabs Setup ── */
document.querySelectorAll(".filter-tab").forEach(tab => {
  tab.addEventListener("click", () => applyProjectFilter(tab.dataset.filter));
});

/* ── Language initialization after shared helper is defined ── */
let savedLanguage = "fr";
try { savedLanguage = localStorage.getItem("portfolio-language") || "fr"; } catch (_) {}
setLanguage(savedLanguage);

/* ── Approved API-backed project publishing ── */
const portfolioApiBase = String(window.PORTFOLIO_API_BASE || "").replace(/\/$/, "");
let remotePortfolioProjects = [];
let remotePortfolioProjectsLoaded = false;

function renderRemoteProjects() {
  if (!remotePortfolioProjectsLoaded) return;
  const grid = document.querySelector("#projets .projects-grid");
  if (!grid) return;
  window.renderPortfolioProjectsV2(grid, remotePortfolioProjects, { isAdmin: false });
}

async function loadRemoteProjects() {
  try {
    const response = await fetch(portfolioApiBase + "/api/projects", {
      headers: { Accept: "application/json" },
      credentials: "omit"
    });
    if (!response.ok) return;
    const data = await response.json();
    if (Array.isArray(data.projects)) {
      remotePortfolioProjects = data.projects;
      remotePortfolioProjectsLoaded = true;
      renderRemoteProjects();
    }
  } catch (_) { /* Keep curated static/local project cards when API is unavailable. */ }
}

window.addEventListener("portfolio:languagechange", renderRemoteProjects);
window.refreshRemotePortfolioProjects = loadRemoteProjects;
window.addEventListener("portfolio:projectsimported", loadRemoteProjects);
loadRemoteProjects();

/* ── Footer Year & Header Scroll State ── */
const yearEl = document.getElementById("year");
if (yearEl) yearEl.textContent = new Date().getFullYear();

const header = document.querySelector(".header");
if (header) {
  window.addEventListener("scroll", () => {
    header.classList.toggle("scrolled", window.scrollY > 10);
  }, { passive: true });
}

/* ── Active Navigation Highlight on Scroll ── */
const sectionIds = ["accueil", "projets", "apropos", "competences", "experiences", "contact"];
const navAnchorMap = new Map();
document.querySelectorAll(".nav-links > a[href^='#']").forEach(anchor => {
  navAnchorMap.set(anchor.getAttribute("href").slice(1), anchor);
});
if ("IntersectionObserver" in window && navAnchorMap.size > 0) {
  const navObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = entry.target.id;
        navAnchorMap.forEach((a, key) => a.classList.toggle("active", key === id));
      }
    });
  }, { rootMargin: "-35% 0px -55% 0px" });
  sectionIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) navObserver.observe(el);
  });
}

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
    window.location.assign(aiWorkspaceUrl);
  }
  aiWorkspaceEntry.addEventListener("click", openMelekAI);
  window.addEventListener("portfolio:languagechange", () => {
    const english = document.documentElement.lang === "en";
    aiWorkspaceEntry.setAttribute("aria-label", english ? "Open Melek AI workspace" : "Ouvrir l'espace Melek AI");
    aiWorkspaceClose.setAttribute("aria-label", english ? "Close AI workspace" : "Fermer l'espace IA");
    aiWorkspaceNewTab.textContent = english ? "Open full page ↗" : "Ouvrir en pleine page ↗";
  });
}
