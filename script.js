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
  } else {
    syncStaticSpotlight();
  }
  window.dispatchEvent(new Event("portfolio:languagechange"));
}

document.querySelectorAll(".lang-btn").forEach(button => {
  button.addEventListener("click", () => setLanguage(button.dataset.lang));
});

/* ── 3-Mode Theme Switcher (Obsidian / Daylight / Atelier) with Crisp Vector Icons ── */
const THEME_MODES = ["dark", "light", "atelier"];
const THEME_META = {
  dark: {
    label: "Obsidian",
    svg: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>'
  },
  light: {
    label: "Daylight",
    svg: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2m-7.07-15.07 1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2m-15.07 7.07 1.41-1.41m11.32-11.32 1.41-1.41"/></svg>'
  },
  atelier: {
    label: "Atelier",
    svg: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>'
  }
};

function applyTheme(theme) {
  const resolved = THEME_MODES.includes(theme)
    ? theme
    : (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
  document.documentElement.setAttribute("data-theme", resolved);
  const meta = THEME_META[resolved] || THEME_META.dark;
  const toggle = document.getElementById("theme-toggle");
  if (toggle) {
    toggle.innerHTML = `<span class="theme-icon" aria-hidden="true">${meta.svg}</span><span class="theme-label">${meta.label}</span>`;
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

/* ── Safe DOM Element Helper ── */
function el(tag, className, textContent) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (textContent !== undefined) node.textContent = textContent;
  return node;
}

/* ── Shared Project Metadata, Bespoke Architectural Canvas & Workbench Controller ── */
let activeProjectFilter = "all";
let currentRenderedProjects = [];
let activeSpotlightIndex = 0;

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

  let domainKind = "architecture";
  if (/\belearning\b/.test(blob)) domainKind = "elearning";
  else if (/\blaravel\b/.test(blob)) domainKind = "laravel";
  else if (/\bsymfony\b/.test(blob)) domainKind = "symfony";
  else if (/\bmagasin\b|\bstore\b/.test(blob)) domainKind = "store";
  else if (/\bpoo\b|\boop\b/.test(blob)) domainKind = "oop";
  else if (/\bhunter\b|\bmcp\b|\bworkers\b/.test(blob)) domainKind = "mcp";
  else if (/\bc#\b|\bfirstapp\b|\b\.net\b/.test(blob)) domainKind = "dotnet";
  else if (/\bphp\b/.test(blob)) domainKind = "php";

  const techRules = [
    { regex: /\blaravel\b/i, label: "Laravel" },
    { regex: /\bsymfony\b/i, label: "Symfony" },
    { regex: /\bangular\b/i, label: "Angular" },
    { regex: /\btypescript\b/i, label: "TypeScript" },
    { regex: /\bjavascript\b/i, label: "JavaScript" },
    { regex: /\bphp\b/i, label: "PHP" },
    { regex: /\bjava\b(?!script)/i, label: "Java" },
    { regex: /\bpython\b/i, label: "Python" },
    { regex: /\bc#\b|csharp/i, label: "C#" },
    { regex: /\bworkers\b/i, label: "Cloudflare Workers" },
    { regex: /\bmcp\b/i, label: "MCP" },
    { regex: /\.net\b/i, label: ".NET" },
    { regex: /\bdoctrine\b/i, label: "Doctrine" },
    { regex: /\bweb\b/i, label: "Web" }
  ];

  const chips = [];
  techRules.forEach(rule => {
    if (rule.regex.test(blob) && chips.length < 3) {
      chips.push(rule.label);
    }
  });
  if (chips.length === 0) chips.push(type.split("·")[0].trim() || "Software");

  let repoSlug = title;
  const ghMatch = url.match(/github\.com\/([^/?#]+\/[^/?#]+)/i);
  if (ghMatch) repoSlug = ghMatch[1];

  return {
    index,
    indexLabel: String(index + 1).padStart(2, "0"),
    title,
    type,
    url,
    repoSlug,
    domainKind,
    chips,
    categories: Array.from(new Set(categories)).join(" ")
  };
}

const DOMAIN_ACCENTS = {
  elearning: { h1: "#6366f1", h2: "#38bdf8" },
  laravel:   { h1: "#f43f5e", h2: "#a855f7" },
  store:     { h1: "#f59e0b", h2: "#10b981" },
  oop:       { h1: "#818cf8", h2: "#c084fc" },
  symfony:   { h1: "#10b981", h2: "#38bdf8" },
  mcp:       { h1: "#06b6d4", h2: "#818cf8" },
  dotnet:    { h1: "#a855f7", h2: "#6366f1" },
  php:       { h1: "#8b5cf6", h2: "#38bdf8" },
  architecture: { h1: "#818cf8", h2: "#38bdf8" }
};

function createArchNodeRow(label, value, toneClass) {
  const row = el("div", "arch-kv-row");
  row.append(el("span", "arch-k", label), el("strong", "arch-v" + (toneClass ? " " + toneClass : ""), value));
  return row;
}

/* Bespoke domain-tailored architectural preview builder (shared by Live Stage & Modal) */
function createBespokeStageCanvas(meta, language) {
  const isEn = language === "en";
  const shell = el("div", "arch-preview arch-preview--" + meta.domainKind);

  if (meta.domainKind === "elearning") {
    const top = el("div", "arch-win-bar");
    top.append(el("span", "arch-win-dots"), el("span", "arch-win-title", "LMS Studio · Core Engine"), el("span", "arch-badge-ok", "JAVA SE"));
    const body = el("div", "arch-split-lms");

    const nav = el("div", "arch-lms-rail");
    nav.append(el("div", "arch-rail-head", isEn ? "CURRICULUM" : "PROGRAMME"));
    const modules = isEn
      ? [["01", "OOP Foundations", true], ["02", "Collections & Generics", true], ["03", "JDBC Persistence", false]]
      : [["01", "Bases POO Java", true], ["02", "Collections & Flux", true], ["03", "Persistance JDBC", false]];
    modules.forEach(([num, name, active]) => {
      const item = el("div", "arch-rail-item" + (active ? " done" : ""));
      item.append(el("em", "", num), el("span", "", name));
      nav.append(item);
    });

    const main = el("div", "arch-lms-main");
    const metricRow = el("div", "arch-stat-grid");
    [
      [isEn ? "LEARNERS" : "APPRENANTS", "148"],
      [isEn ? "MODULES" : "MODULES", "12"],
      [isEn ? "COMPLETION" : "COMPLÉTION", "92%"]
    ].forEach(([k, v]) => {
      const box = el("div", "arch-stat-box");
      box.append(el("small", "", k), el("strong", "", v));
      metricRow.append(box);
    });
    const progWrap = el("div", "arch-progress-card");
    const pHead = el("div", "arch-phead");
    pHead.append(el("span", "", isEn ? "Java Enterprise Track" : "Parcours Java Avancé"), el("strong", "", "86%"));
    const track = el("div", "arch-pbar");
    const fill = el("i"); fill.style.width = "86%";
    track.append(fill);
    progWrap.append(pHead, track);
    main.append(metricRow, progWrap);
    body.append(nav, main);
    shell.append(top, body);
    return shell;
  }

  if (meta.domainKind === "laravel") {
    const top = el("div", "arch-win-bar");
    top.append(el("span", "arch-win-dots"), el("span", "arch-win-title", "artisan serve · localhost:8000"), el("span", "arch-badge-ok", "MVC · AUTH"));
    const pipe = el("div", "arch-pipeline");
    [
      ["routes/web.php", "GET /dashboard"],
      ["AuthController", "Middleware · Auth"],
      ["Eloquent ORM", "Schema Migrations"],
      ["Blade Engine", "Responsive UI"]
    ].forEach(([node, sub], idx) => {
      const card = el("div", "arch-pipe-node" + (idx === 1 ? " focus" : ""));
      card.append(el("strong", "", node), el("small", "", sub));
      pipe.append(card);
    });
    const foot = el("div", "arch-telemetry-strip");
    foot.append(
      el("span", "ok", "200 OK"),
      el("span", "", "Laravel MVC"),
      el("span", "", isEn ? "Migrations Synced" : "Migrations synchronisées"),
      el("span", "", "CSRF Active")
    );
    shell.append(top, pipe, foot);
    return shell;
  }

  if (meta.domainKind === "store") {
    const top = el("div", "arch-win-bar");
    top.append(el("span", "arch-win-dots"), el("span", "arch-win-title", "StoreManager.java · ERP Stock"), el("span", "arch-badge-ok", "INVENTORY"));
    const kpis = el("div", "arch-stat-grid");
    [
      [isEn ? "CATALOG SKUS" : "RÉFÉRENCES", "84"],
      [isEn ? "IN STOCK" : "EN STOCK", "1,240"],
      [isEn ? "LOW STOCK" : "ALERTES", "03"]
    ].forEach(([k, v]) => {
      const box = el("div", "arch-stat-box");
      box.append(el("small", "", k), el("strong", "", v));
      kpis.append(box);
    });
    const table = el("div", "arch-erp-table");
    const rows = isEn
      ? [["SKU-104", "Mechanical Keyboard", "42 u.", "Optimal"], ["SKU-208", "27\" Studio Display", "06 u.", "Reorder"], ["SKU-312", "USB-C Dock Hub", "19 u.", "Optimal"]]
      : [["SKU-104", "Clavier Mécanique", "42 u.", "En stock"], ["SKU-208", "Écran Studio 27\"", "06 u.", "Alerte"], ["SKU-312", "Station USB-C", "19 u.", "En stock"]];
    rows.forEach(([sku, label, qty, status]) => {
      const r = el("div", "arch-erp-row");
      const low = status === "Alerte" || status === "Reorder";
      r.append(
        el("code", "", sku),
        el("span", "arch-erp-name", label),
        el("em", "", qty),
        el("b", low ? "warn" : "good", status)
      );
      table.append(r);
    });
    shell.append(top, kpis, table);
    return shell;
  }

  if (meta.domainKind === "oop") {
    const top = el("div", "arch-win-bar");
    top.append(el("span", "arch-win-dots"), el("span", "arch-win-title", "UML Hierarchy · OOP Design"), el("span", "arch-badge-ok", "@OVERRIDE"));
    const uml = el("div", "arch-uml-canvas");
    const parent = el("div", "arch-uml-node parent");
    parent.append(el("small", "", "«abstract»"), el("strong", "", "EntiteBase"), el("code", "", "+ afficherProfil(): void"));
    const svgWrap = el("div", "arch-uml-svg-wrap");
    svgWrap.innerHTML = '<svg class="arch-uml-svg" viewBox="0 0 260 28" preserveAspectRatio="none" aria-hidden="true"><path class="uml-line" d="M130 0 V14 H55 V28 M130 14 H205 V28"/><circle class="uml-pulse" r="2.6" cx="130" cy="0"><animateMotion dur="2.2s" repeatCount="indefinite" path="M130 0 V14 H55 V28"/></circle><circle class="uml-pulse" r="2.6" cx="130" cy="0"><animateMotion dur="2.2s" begin="1.1s" repeatCount="indefinite" path="M130 0 V14 H205 V28"/></circle></svg>';
    const branch = el("div", "arch-uml-branch");
    const c1 = el("div", "arch-uml-node");
    c1.append(el("small", "", "extends EntiteBase"), el("strong", "", "Etudiant"), el("code", "", "@Override + afficherProfil()"));
    const c2 = el("div", "arch-uml-node");
    c2.append(el("small", "", "implements Evaluable"), el("strong", "", "ModuleCours"), el("code", "", "+ calculerMoyenne(): double"));
    branch.append(c1, c2);
    uml.append(parent, svgWrap, branch);
    shell.append(top, uml);
    return shell;
  }

  if (meta.domainKind === "symfony") {
    const top = el("div", "arch-win-bar");
    top.append(el("span", "arch-win-dots"), el("span", "arch-win-title", "Symfony 6 · Controller & Twig"), el("span", "arch-badge-ok", "DOCTRINE ORM"));
    const grid = el("div", "arch-two-pane");
    const left = el("div", "arch-code-pane");
    ["#[Route('/app', name: 'app_home')]", "public function index(Repo $repo):", "  return $this->render('index.html.twig');"].forEach(l => {
      left.append(el("code", "", l));
    });
    const right = el("div", "arch-kv-card");
    right.append(
      createArchNodeRow("Template", "Twig v3 Engine"),
      createArchNodeRow("Mapping", "Doctrine Entity"),
      createArchNodeRow("Router", "Attribute Routes", "ok")
    );
    grid.append(left, right);
    const bar = el("div", "arch-telemetry-strip");
    bar.append(el("span", "ok", "200 OK"), el("span", "", "GET /catalog"), el("span", "", "Doctrine: 3 req · 2.1ms"), el("span", "", "Twig 3"));
    shell.append(top, grid, bar);
    return shell;
  }

  if (meta.domainKind === "mcp") {
    const top = el("div", "arch-win-bar");
    top.append(el("span", "arch-win-dots"), el("span", "arch-win-title", "Cloudflare Workers · MCP Protocol"), el("span", "arch-badge-ok", "EDGE 11ms"));
    const req = el("div", "arch-code-pane compact");
    req.append(
      el("code", "", "TOOL CALL  mcp.search_opportunities({ query: \"PFE Full-Stack\", limit: 12 })"),
      el("code", "", "STATUS     200 OK · Edge Node CDG · Schema Validated")
    );
    const list = el("div", "arch-erp-table");
    const items = isEn
      ? [["PFE", "Full-Stack Developer · Laravel / Angular", "Tunisia", "Verified"], ["JOB", "TypeScript Edge Engineer · Junior", "Remote", "Live"]]
      : [["PFE", "Développeur Full-Stack · Laravel / Angular", "Sfax / Tunis", "Vérifié"], ["ALT", "Ingénieur TypeScript & Workers", "Hybride", "Actif"]];
    items.forEach(([tag, role, loc, st]) => {
      const r = el("div", "arch-erp-row");
      r.append(el("code", "", tag), el("span", "arch-erp-name", role), el("em", "", loc), el("b", "good", st));
      list.append(r);
    });
    shell.append(top, req, list);
    return shell;
  }

  if (meta.domainKind === "dotnet") {
    const top = el("div", "arch-win-bar");
    top.append(el("span", "arch-win-dots"), el("span", "arch-win-title", "FirstApp.exe · .NET Desktop"), el("span", "arch-badge-ok", "C# / .NET"));
    const grid = el("div", "arch-two-pane");
    const nav = el("div", "arch-lms-rail");
    [isEn ? "Overview" : "Vue générale", isEn ? "Components" : "Composants", isEn ? "Runtime" : "Exécution"].forEach((t, idx) => {
      const row = el("div", "arch-rail-item" + (idx === 0 ? " done" : ""));
      row.append(el("em", "", "0" + (idx + 1)), el("span", "", t));
      nav.append(row);
    });
    const kv = el("div", "arch-kv-card");
    kv.append(
      createArchNodeRow("Runtime", ".NET Managed UI"),
      createArchNodeRow("Namespace", "FirstApp.Views"),
      createArchNodeRow("Build", "Release Ready", "ok")
    );
    grid.append(nav, kv);
    shell.append(top, grid);
    return shell;
  }

  if (meta.domainKind === "php") {
    const top = el("div", "arch-win-bar");
    top.append(el("span", "arch-win-dots"), el("span", "arch-win-title", "localhost:8000/index.php"), el("span", "arch-badge-ok", "PHP 8 · CSS"));
    const grid = el("div", "arch-two-pane");
    const code = el("div", "arch-code-pane");
    ["session_start();", "$stmt = $pdo->prepare('SELECT ...');", "require 'views/layout.php';"].forEach(l => code.append(el("code", "", l)));
    const kv = el("div", "arch-kv-card");
    kv.append(
      createArchNodeRow(isEn ? "Rendering" : "Rendu", "Server-Side PHP"),
      createArchNodeRow("Layout", "Custom CSS3 Grid"),
      createArchNodeRow("Latency", "4.2ms Local", "ok")
    );
    grid.append(code, kv);
    shell.append(top, grid);
    return shell;
  }

  /* Clean Dynamic Fallback for Custom / API-Loaded Projects */
  const top = el("div", "arch-win-bar");
  top.append(el("span", "arch-win-dots"), el("span", "arch-win-title", meta.repoSlug), el("span", "arch-badge-ok", meta.chips[0] || "APP"));
  const grid = el("div", "arch-two-pane");
  const code = el("div", "arch-code-pane");
  [
    `module: "${meta.title}"`,
    `stack:  [${meta.chips.map(c => `"${c}"`).join(", ")}]`,
    `status: "production-verified"`
  ].forEach(line => code.append(el("code", "", line)));
  const kv = el("div", "arch-kv-card");
  kv.append(
    createArchNodeRow(isEn ? "Category" : "Catégorie", meta.type),
    createArchNodeRow("Stack", meta.chips.join(" · ")),
    createArchNodeRow("Repository", "GitHub", "ok")
  );
  grid.append(code, kv);
  shell.append(top, grid);
  return shell;
}

function rebuildCoverflowDock(visibleIndices) {
  const dock = document.getElementById("coverflowDockPills");
  if (!dock) return;
  dock.replaceChildren();
  visibleIndices.forEach(idx => {
    const project = currentRenderedProjects[idx];
    if (!project) return;
    const meta = getProjectMetadata(project, idx);
    const pill = document.createElement("button");
    pill.type = "button";
    pill.className = "cf-dock-pill" + (idx === activeSpotlightIndex ? " is-active" : "");
    pill.dataset.idx = String(idx);
    pill.setAttribute("role", "tab");
    pill.setAttribute("aria-selected", idx === activeSpotlightIndex ? "true" : "false");
    pill.append(el("em", "", meta.indexLabel), el("span", "", meta.title));
    pill.addEventListener("click", () => {
      window._pauseProjectAuto?.();
      updateSpotlightStage(idx);
    });
    dock.append(pill);
  });
}

function updateSpotlightStage(projectOrIndex) {
  const showcase = document.getElementById("projectsShowcase");
  const viewport = showcase?.querySelector(".projects-coverflow-viewport");
  const dock = showcase?.querySelector(".coverflow-dock");
  const cards = Array.from(document.querySelectorAll("#projets .project-card"));

  if (!currentRenderedProjects || currentRenderedProjects.length === 0 || cards.length === 0) {
    if (viewport) viewport.hidden = true;
    if (dock) dock.hidden = true;
    return;
  }

  const visibleCards = cards.filter(c => c.style.display !== "none");
  if (visibleCards.length === 0) {
    if (viewport) viewport.hidden = true;
    if (dock) dock.hidden = true;
    return;
  }
  if (viewport) viewport.hidden = false;
  if (dock) dock.hidden = false;

  let idx = typeof projectOrIndex === "number"
    ? Math.max(0, Math.min(currentRenderedProjects.length - 1, projectOrIndex))
    : Math.max(0, currentRenderedProjects.findIndex(p => String(p.id) === String(projectOrIndex)));

  if (cards[idx] && cards[idx].style.display === "none") {
    idx = cards.findIndex(c => c.style.display !== "none");
    if (idx < 0) idx = 0;
  }

  activeSpotlightIndex = idx;
  const project = currentRenderedProjects[idx];
  if (!project) return;

  const language = document.documentElement.lang === "en" ? "en" : "fr";
  const meta = getProjectMetadata(project, idx);
  const accent = DOMAIN_ACCENTS[meta.domainKind] || DOMAIN_ACCENTS.architecture;

  if (showcase) {
    showcase.style.setProperty("--stage-hue-1", accent.h1);
    showcase.style.setProperty("--stage-hue-2", accent.h2);
  }

  const visibleIndices = cards.reduce((arr, c, i) => {
    if (c.style.display !== "none") arr.push(i);
    return arr;
  }, []);
  const activePos = Math.max(0, visibleIndices.indexOf(idx));
  const totalVisible = visibleIndices.length;

  cards.forEach((card, i) => {
    const pos = visibleIndices.indexOf(i);
    if (pos === -1) {
      card.classList.remove("is-active", "is-near", "is-far");
      return;
    }
    let diff = pos - activePos;
    if (totalVisible > 2) {
      if (diff > totalVisible / 2) diff -= totalVisible;
      if (diff < -totalVisible / 2) diff += totalVisible;
    }
    const abs = Math.abs(diff);
    const isActive = diff === 0;
    const isFar = abs > 2;

    card.style.setProperty("--cf-offset", String(diff));
    card.style.setProperty("--cf-abs", String(abs));
    card.style.zIndex = String(30 - abs * 5);

    const cardMeta = getProjectMetadata(currentRenderedProjects[i], i);
    const cardAccent = DOMAIN_ACCENTS[cardMeta.domainKind] || DOMAIN_ACCENTS.architecture;
    card.style.setProperty("--stage-hue-1", cardAccent.h1);
    card.style.setProperty("--stage-hue-2", cardAccent.h2);

    const stageSlot = card.querySelector("[data-arch-slot]");
    if (stageSlot && (!stageSlot.hasChildNodes() || stageSlot.dataset.lang !== language)) {
      stageSlot.replaceChildren(createBespokeStageCanvas(cardMeta, language));
      stageSlot.dataset.lang = language;
    }

    card.classList.toggle("is-active", isActive);
    card.classList.toggle("is-near", abs === 1 || abs === 2);
    card.classList.toggle("is-far", isFar);
    card.setAttribute("aria-current", isActive ? "true" : "false");
  });

  document.querySelectorAll("#coverflowDockPills .cf-dock-pill").forEach(pill => {
    const active = Number(pill.dataset.idx) === idx;
    pill.classList.toggle("is-active", active);
    pill.setAttribute("aria-selected", active ? "true" : "false");
  });
}

function updateProjectsCountLabel(visibleCount) {
  const label = document.getElementById("projectsCountLabel");
  if (!label) return;
  const isEn = document.documentElement.lang === "en";
  const padded = String(visibleCount).padStart(2, "0");
  label.textContent = isEn
    ? `${padded} ${visibleCount === 1 ? "project shown" : "curated works"}`
    : `${padded} ${visibleCount === 1 ? "projet affiché" : "projets sélectionnés"}`;
}

function applyProjectFilter(filterValue) {
  activeProjectFilter = filterValue || "all";
  document.querySelectorAll(".filter-tab").forEach(tab => {
    tab.classList.toggle("active", tab.dataset.filter === activeProjectFilter);
  });
  let firstVisibleIndex = -1;
  let visibleCount = 0;
  let currentStillVisible = false;
  const visibleIndices = [];

  document.querySelectorAll("#projets .project-card").forEach((card, i) => {
    const cats = String(card.dataset.category || "").split(/\s+/).filter(Boolean);
    const visible = activeProjectFilter === "all" || cats.includes(activeProjectFilter);
    card.style.display = visible ? "" : "none";
    if (visible) {
      visibleCount += 1;
      visibleIndices.push(i);
      if (firstVisibleIndex === -1) firstVisibleIndex = i;
      if (i === activeSpotlightIndex) currentStillVisible = true;
    }
  });

  updateProjectsCountLabel(visibleCount);
  if (visibleCount === 0) {
    rebuildCoverflowDock([]);
    updateSpotlightStage(0);
  } else {
    const nextIdx = currentStillVisible ? activeSpotlightIndex : firstVisibleIndex;
    activeSpotlightIndex = nextIdx;
    rebuildCoverflowDock(visibleIndices);
    updateSpotlightStage(nextIdx);
  }
}

function syncStaticSpotlight() {
  const staticCards = Array.from(document.querySelectorAll("#projets .project-card"));
  if (staticCards.length === 0) return;
  currentRenderedProjects = staticCards.map((card, idx) => {
    const titleEl = card.querySelector("h3");
    const typeEl = card.querySelector(".project-type");
    const descEl = card.querySelector("p:not(.project-type)");
    const linkEl = card.querySelector("a[href]");
    const idAttr = card.id ? card.id.replace(/^card_/, "") : `p_${idx + 1}`;
    card.addEventListener("click", (e) => {
      if (idx !== activeSpotlightIndex) {
        e.preventDefault();
        e.stopPropagation();
        window._pauseProjectAuto?.();
        updateSpotlightStage(idx);
      }
    });
    return {
      id: idAttr,
      title: titleEl ? titleEl.textContent : "Project",
      type: typeEl ? typeEl.textContent : "PROJECT",
      description: descEl ? descEl.textContent : "",
      url: linkEl ? linkEl.href : "#"
    };
  });
  updateProjectsCountLabel(currentRenderedProjects.length);
  rebuildCoverflowDock(currentRenderedProjects.map((_, i) => i));
  updateSpotlightStage(0);
}

window.openProjectPreviewModal = function(projectOrIndex) {
  const backdrop = document.getElementById("projectPreviewBackdrop");
  if (!backdrop) return;
  let idx = 0;
  if (typeof projectOrIndex === "number") {
    idx = projectOrIndex;
  } else {
    idx = Math.max(0, currentRenderedProjects.findIndex(p => String(p.id) === String(projectOrIndex)));
  }
  const entry = currentRenderedProjects[idx];
  if (!entry) return;

  const language = document.documentElement.lang === "en" ? "en" : "fr";
  const meta = getProjectMetadata(entry, idx);
  const descText = language === "en"
    ? (entry.description_en || entry.description || "")
    : (entry.description_fr || entry.description || "");

  document.getElementById("ppType").textContent = meta.type;
  document.getElementById("ppTitle").textContent = meta.title;
  document.getElementById("ppDesc").textContent = descText;
  document.getElementById("ppGithubLink").href = meta.url;

  const visualSlot = document.getElementById("ppVisual");
  visualSlot.className = "pp-visual";
  visualSlot.replaceChildren(createBespokeStageCanvas(meta, language));

  const tagsSlot = document.getElementById("ppTags");
  tagsSlot.replaceChildren(...meta.chips.map(label => el("span", "tech-tag", label)));

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
  const totalStr = String(currentRenderedProjects.length).padStart(2, "0");

  currentRenderedProjects.forEach((project, index) => {
    const meta = getProjectMetadata(project, index);
    const card = document.createElement("article");
    card.className = "project-card coverflow-card";
    card.dataset.category = meta.categories;
    card.tabIndex = 0;
    if (project.id) card.id = "card_" + project.id;

    const beam = el("div", "cf-card-beam");
    beam.setAttribute("aria-hidden", "true");
    const inner = el("div", "cf-card-inner");

    const topBar = el("div", "cf-card-top");
    const indexEl = el("span", "cf-index", `${meta.indexLabel} / ${totalStr}`);
    const typeEl = el("p", "project-type", meta.type);
    const chipsWrap = el("div", "ledger-chips");
    meta.chips.forEach(ch => chipsWrap.append(el("span", "tech-tag", ch)));
    topBar.append(indexEl, typeEl, chipsWrap);

    const stageSlot = el("div", "cf-card-stage");
    stageSlot.dataset.archSlot = "true";
    stageSlot.dataset.lang = language;
    stageSlot.append(createBespokeStageCanvas(meta, language));

    const body = el("div", "cf-card-body");
    const h3 = el("h3", "", meta.title);
    const descEl = el("p", "ledger-desc", language === "en"
      ? (project.description_en || project.description || "")
      : (project.description_fr || project.description || ""));

    const actions = el("div", "ledger-actions");
    const viewBtn = el("button", "btn-pcard-view", language === "en" ? "Inspect" : "Vue complète");
    viewBtn.type = "button";
    viewBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      updateSpotlightStage(index);
      window.openProjectPreviewModal(index);
    });

    const githubLink = el("a", "btn-pcard-github", "GitHub ↗");
    githubLink.href = meta.url;
    githubLink.target = "_blank";
    githubLink.rel = "noopener noreferrer";
    githubLink.addEventListener("click", (e) => e.stopPropagation());

    actions.append(viewBtn, githubLink);

    if (isAdmin && project.id) {
      const adminWrap = el("div", "admin-proj-actions");
      const editBtn = el("button", "admin-act-btn edit", "Edit");
      editBtn.type = "button";
      editBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (typeof openEditProjectModal === "function") openEditProjectModal(project.id);
      });
      const delBtn = el("button", "admin-act-btn del", "×");
      delBtn.type = "button";
      delBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (typeof deleteProjectDirect === "function") deleteProjectDirect(project.id);
      });
      adminWrap.append(editBtn, delBtn);
      actions.append(adminWrap);
    }

    body.append(h3, descEl, actions);
    inner.append(topBar, stageSlot, body);
    card.append(beam, inner);

    card.addEventListener("click", (e) => {
      if (index !== activeSpotlightIndex) {
        e.preventDefault();
        e.stopPropagation();
        window._pauseProjectAuto?.();
        updateSpotlightStage(index);
      }
    });

    grid.append(card);
  });

  if (currentRenderedProjects.length === 0) {
    updateProjectsCountLabel(0);
    rebuildCoverflowDock([]);
    updateSpotlightStage(0);
    return;
  }

  activeSpotlightIndex = Math.min(activeSpotlightIndex, currentRenderedProjects.length - 1);
  applyProjectFilter(activeProjectFilter);
};

/* ── Filter Tabs Setup ── */
document.querySelectorAll(".filter-tab").forEach(tab => {
  tab.addEventListener("click", () => applyProjectFilter(tab.dataset.filter));
});

/* ── Kinetic 3D Coverflow Controls, Touch Swipe, Keyboard & Auto-Showcase ── */
(function initKineticProjectsExperience() {
  const showcase = document.getElementById("projectsShowcase");
  const viewport = showcase?.querySelector(".projects-coverflow-viewport");
  const prevBtn = document.getElementById("stagePrevBtn");
  const nextBtn = document.getElementById("stageNextBtn");
  const autoBtn = document.getElementById("stageAutoToggle");
  const reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function getVisibleIndices() {
    const rows = Array.from(document.querySelectorAll("#projets .project-card"));
    return rows.reduce((acc, row, idx) => {
      if (row.style.display !== "none") acc.push(idx);
      return acc;
    }, []);
  }

  function stepProject(delta) {
    const visible = getVisibleIndices();
    if (visible.length <= 1) return;
    const pos = Math.max(0, visible.indexOf(activeSpotlightIndex));
    const nextIdx = visible[(pos + delta + visible.length) % visible.length];
    updateSpotlightStage(nextIdx);
  }

  let autoEnabled = !reducedMotion;
  let userPausedUntil = 0;
  let pointerInside = false;

  function pauseAutoTemporarily() {
    userPausedUntil = Date.now() + 9000;
  }
  window._pauseProjectAuto = pauseAutoTemporarily;

  prevBtn?.addEventListener("click", () => { pauseAutoTemporarily(); stepProject(-1); });
  nextBtn?.addEventListener("click", () => { pauseAutoTemporarily(); stepProject(1); });

  function syncAutoBtn() {
    if (!autoBtn) return;
    autoBtn.classList.toggle("is-playing", autoEnabled);
    autoBtn.setAttribute("aria-pressed", String(autoEnabled));
  }

  autoBtn?.addEventListener("click", () => {
    autoEnabled = !autoEnabled;
    userPausedUntil = 0;
    syncAutoBtn();
  });

  if (showcase) {
    showcase.addEventListener("mouseenter", () => { pointerInside = true; });
    showcase.addEventListener("mouseleave", () => { pointerInside = false; });
    showcase.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft") { pauseAutoTemporarily(); stepProject(-1); }
      else if (e.key === "ArrowRight") { pauseAutoTemporarily(); stepProject(1); }
    });
  }

  // Mobile horizontal swipe gesture
  if (viewport) {
    let startX = 0;
    viewport.addEventListener("touchstart", (e) => {
      startX = e.changedTouches[0]?.clientX || 0;
    }, { passive: true });
    viewport.addEventListener("touchend", (e) => {
      const endX = e.changedTouches[0]?.clientX || 0;
      const dx = endX - startX;
      if (Math.abs(dx) > 42) {
        pauseAutoTemporarily();
        stepProject(dx < 0 ? 1 : -1);
      }
    }, { passive: true });
  }

  if (!reducedMotion) {
    setInterval(() => {
      if (!autoEnabled || pointerInside || Date.now() < userPausedUntil) return;
      const modalOpen = document.getElementById("projectPreviewBackdrop")?.classList.contains("active");
      if (modalOpen || document.hidden) return;
      const rect = showcase?.getBoundingClientRect();
      if (!rect || rect.bottom < 80 || rect.top > window.innerHeight - 80) return;
      stepProject(1);
    }, 5200);
  }
  syncAutoBtn();
})();

/* ── Initialize static spotlight immediately on first load ── */
syncStaticSpotlight();

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
    const elNode = document.getElementById(id);
    if (elNode) navObserver.observe(elNode);
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
