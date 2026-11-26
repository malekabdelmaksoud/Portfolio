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

const DOMAIN_HIGHLIGHTS = {
  elearning: {
    fr: ["Gestion cours & quiz", "Inscriptions multi-rôles", "Persistance Java / SQL"],
    en: ["Course & quiz engine", "Multi-role enrolment", "Java / SQL persistence"]
  },
  laravel: {
    fr: ["Pattern MVC strict", "Middleware Auth & CSRF", "Migrations & Eloquent ORM"],
    en: ["Clean MVC pattern", "Auth & CSRF guards", "Migrations & Eloquent ORM"]
  },
  store: {
    fr: ["Suivi temps réel des SKU", "Alertes seuil de stock", "Modules vente & inventaire"],
    en: ["Real-time SKU tracking", "Low-stock alert rules", "Sales & inventory core"]
  },
  oop: {
    fr: ["Hiérarchies abstraites", "Polymorphisme dynamique", "Contrats & interfaces Java"],
    en: ["Abstract hierarchies", "Dynamic polymorphism", "Java interface contracts"]
  },
  symfony: {
    fr: ["Contrôleurs & attributs", "Vues modulaires Twig 3", "Entités Doctrine ORM"],
    en: ["Attribute controllers", "Modular Twig 3 views", "Doctrine ORM entities"]
  },
  mcp: {
    fr: ["Protocole MCP JSON-RPC", "Déploiement Edge Workers", "Recherche stages & PFE"],
    en: ["JSON-RPC MCP server", "Cloudflare Edge runtime", "Internship & job discovery"]
  },
  dotnet: {
    fr: ["Runtime C# / .NET", "Architecture orientée UI", "Compilation native rapide"],
    en: ["C# / .NET runtime", "Event-driven desktop UI", "Fast native build"]
  },
  php: {
    fr: ["Rendu PHP côté serveur", "Requêtes préparées PDO", "Design CSS3 responsive"],
    en: ["Server-side PHP engine", "Prepared PDO queries", "Responsive CSS3 grid"]
  },
  architecture: {
    fr: ["Architecture modulaire", "Code propre & maintenable", "Prêt pour production"],
    en: ["Modular architecture", "Clean maintainable code", "Production-ready build"]
  }
};

function createArchNodeRow(label, value, toneClass) {
  const row = el("div", "arch-kv-row");
  row.append(el("span", "arch-k", label), el("strong", "arch-v" + (toneClass ? " " + toneClass : ""), value));
  return row;
}

/* Bespoke animated SVG + interactive HTML mini-app showcase builder */
function createBespokeStageCanvas(meta, language) {
  const isEn = language === "en";
  const shell = el("div", "arch-preview arch-preview--" + meta.domainKind);

  if (meta.domainKind === "elearning") {
    const top = el("div", "arch-win-bar");
    top.append(el("span", "arch-win-dots"), el("span", "arch-win-title", "LMS Studio · Core Engine"), el("span", "arch-badge-ok", "LIVE TRACK"));
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
    const ringHero = el("div", "arch-ring-card");
    ringHero.innerHTML = `<svg class="arch-svg-ring" viewBox="0 0 88 88" aria-hidden="true">
      <defs><linearGradient id="lmsRingGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="var(--stage-hue-1, #6366f1)"/><stop offset="100%" stop-color="var(--stage-hue-2, #38bdf8)"/></linearGradient></defs>
      <circle class="ring-track" cx="44" cy="44" r="34"/>
      <circle class="ring-fill" cx="44" cy="44" r="34" stroke="url(#lmsRingGrad)"/>
      <text x="44" y="48" text-anchor="middle" class="ring-val">92%</text>
    </svg>`;
    const ringStats = el("div", "arch-ring-stats");
    [
      [isEn ? "ACTIVE LEARNERS" : "APPRENANTS", "148"],
      [isEn ? "MODULES READY" : "MODULES PRÊTS", "12 / 14"]
    ].forEach(([k, v]) => {
      const box = el("div", "arch-stat-box");
      box.append(el("small", "", k), el("strong", "", v));
      ringStats.append(box);
    });
    ringHero.append(ringStats);

    const progWrap = el("div", "arch-progress-card");
    const pHead = el("div", "arch-phead");
    pHead.append(el("span", "", isEn ? "Java Enterprise Track" : "Parcours Java Avancé"), el("strong", "", "86%"));
    const track = el("div", "arch-pbar");
    const fill = el("i"); fill.style.width = "86%";
    track.append(fill);
    progWrap.append(pHead, track);
    main.append(ringHero, progWrap);
    body.append(nav, main);
    shell.append(top, body);
    return shell;
  }

  if (meta.domainKind === "laravel") {
    const top = el("div", "arch-win-bar");
    top.append(el("span", "arch-win-dots"), el("span", "arch-win-title", "artisan serve · MVC Request Flow"), el("span", "arch-badge-ok", "MVC · AUTH"));
    const svgFlow = el("div", "arch-bezier-flow");
    svgFlow.innerHTML = `<svg class="arch-flow-svg" viewBox="0 0 420 52" aria-hidden="true">
      <path class="flow-path" d="M 28 26 C 95 6, 130 46, 210 26 C 290 6, 325 46, 392 26"/>
      <circle class="flow-dot" r="4" cx="28" cy="26"><animateMotion dur="2.2s" repeatCount="indefinite" path="M 28 26 C 95 6, 130 46, 210 26 C 290 6, 325 46, 392 26"/></circle>
      <circle class="flow-dot dim" r="3" cx="28" cy="26"><animateMotion dur="2.2s" begin="1.1s" repeatCount="indefinite" path="M 28 26 C 95 6, 130 46, 210 26 C 290 6, 325 46, 392 26"/></circle>
      <circle class="flow-node" cx="28" cy="26" r="5"/>
      <circle class="flow-node" cx="210" cy="26" r="5"/>
      <circle class="flow-node" cx="392" cy="26" r="5"/>
    </svg>`;
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
    shell.append(top, svgFlow, pipe, foot);
    return shell;
  }

  if (meta.domainKind === "store") {
    const top = el("div", "arch-win-bar");
    top.append(el("span", "arch-win-dots"), el("span", "arch-win-title", "StoreManager.java · ERP Telemetry"), el("span", "arch-badge-ok", "INVENTORY"));
    const chartWrap = el("div", "arch-spark-card");
    chartWrap.innerHTML = `<div class="arch-spark-head"><span>${isEn ? "STOCK VELOCITY · 30D" : "FLUX STOCK · 30J"}</span><strong class="ok">+24.8%</strong></div>
      <svg class="arch-spark-svg" viewBox="0 0 360 66" preserveAspectRatio="none" aria-hidden="true">
        <defs><linearGradient id="erpArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="var(--stage-hue-2, #10b981)" stop-opacity="0.38"/><stop offset="100%" stop-color="var(--stage-hue-2, #10b981)" stop-opacity="0"/></linearGradient></defs>
        <path class="spark-area" d="M0 54 L48 44 L96 48 L144 30 L192 34 L240 18 L288 22 L360 8 L360 66 L0 66 Z" fill="url(#erpArea)"/>
        <path class="spark-line" d="M0 54 L48 44 L96 48 L144 30 L192 34 L240 18 L288 22 L360 8"/>
        <circle class="spark-pulse" cx="360" cy="8" r="4"/>
      </svg>`;
    const table = el("div", "arch-erp-table");
    const rows = isEn
      ? [["SKU-104", "Mechanical Keyboard", "42 u.", "Optimal"], ["SKU-208", "27\" Studio Display", "06 u.", "Reorder"], ["SKU-312", "USB-C Dock Hub", "19 u.", "Optimal"]]
      : [["SKU-104", "Clavier Mécanique", "42 u.", "En stock"], ["SKU-208", "Écran Studio 27\"", "06 u.", "Alerte"], ["SKU-312", "Station USB-C", "19 u.", "En stock"]];
    rows.forEach(([sku, label, qty, status]) => {
      const r = el("div", "arch-erp-row");
      const low = status === "Alerte" || status === "Reorder";
      r.append(el("code", "", sku), el("span", "arch-erp-name", label), el("em", "", qty), el("b", low ? "warn" : "good", status));
      table.append(r);
    });
    shell.append(top, chartWrap, table);
    return shell;
  }

  if (meta.domainKind === "oop") {
    const top = el("div", "arch-win-bar");
    top.append(el("span", "arch-win-dots"), el("span", "arch-win-title", "UML Hierarchy · OOP Design"), el("span", "arch-badge-ok", "@OVERRIDE"));
    const uml = el("div", "arch-uml-canvas");
    const parent = el("div", "arch-uml-node parent");
    parent.append(el("small", "", "«abstract»"), el("strong", "", "EntiteBase"), el("code", "", "+ afficherProfil(): void"));
    const svgWrap = el("div", "arch-uml-svg-wrap");
    svgWrap.innerHTML = `<svg class="arch-uml-svg" viewBox="0 0 280 34" preserveAspectRatio="none" aria-hidden="true">
      <path class="uml-line" d="M140 0 V17 H62 V34 M140 17 H218 V34"/>
      <circle class="uml-pulse" r="3" cx="140" cy="0"><animateMotion dur="2s" repeatCount="indefinite" path="M140 0 V17 H62 V34"/></circle>
      <circle class="uml-pulse" r="3" cx="140" cy="0"><animateMotion dur="2s" begin="1s" repeatCount="indefinite" path="M140 0 V17 H218 V34"/></circle>
    </svg>`;
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
    const radarSplit = el("div", "arch-mcp-split");
    const radar = el("div", "arch-radar-box");
    radar.innerHTML = `<div class="arch-radar">
      <span class="radar-ring r1"></span>
      <span class="radar-ring r2"></span>
      <span class="radar-sweep"></span>
      <span class="radar-blip b1"></span>
      <span class="radar-blip b2"></span>
      <span class="radar-core">MCP</span>
    </div>`;
    const list = el("div", "arch-erp-table");
    const items = isEn
      ? [["PFE", "Full-Stack · Laravel / Angular", "Tunisia", "Verified"], ["JOB", "TypeScript Edge · Junior", "Remote", "Live"]]
      : [["PFE", "Full-Stack · Laravel / Angular", "Sfax / Tunis", "Vérifié"], ["ALT", "Ingénieur TypeScript & Workers", "Hybride", "Actif"]];
    items.forEach(([tag, role, loc, st]) => {
      const r = el("div", "arch-erp-row");
      r.append(el("code", "", tag), el("span", "arch-erp-name", role), el("em", "", loc), el("b", "good", st));
      list.append(r);
    });
    radarSplit.append(radar, list);
    const req = el("div", "arch-telemetry-strip");
    req.append(el("span", "ok", "200 OK"), el("span", "", "mcp.search_opportunities()"), el("span", "", "CDG Edge · Schema OK"));
    shell.append(top, radarSplit, req);
    return shell;
  }

  if (meta.domainKind === "dotnet") {
    const top = el("div", "arch-win-bar");
    top.append(el("span", "arch-win-dots"), el("span", "arch-win-title", "FirstApp.exe · .NET Desktop"), el("span", "arch-badge-ok", "C# / .NET"));
    const grid = el("div", "arch-two-pane");
    const gauge = el("div", "arch-ring-card");
    gauge.innerHTML = `<svg class="arch-svg-ring" viewBox="0 0 88 88" aria-hidden="true">
      <defs><linearGradient id="netGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#a855f7"/><stop offset="100%" stop-color="#6366f1"/></linearGradient></defs>
      <circle class="ring-track" cx="44" cy="44" r="34"/>
      <circle class="ring-fill" cx="44" cy="44" r="34" stroke="url(#netGrad)"/>
      <text x="44" y="48" text-anchor="middle" class="ring-val">.NET</text>
    </svg>`;
    const kv = el("div", "arch-kv-card");
    kv.append(
      createArchNodeRow("Runtime", ".NET Managed UI"),
      createArchNodeRow("Namespace", "FirstApp.Views"),
      createArchNodeRow("Build", "Release Ready", "ok")
    );
    grid.append(gauge, kv);
    shell.append(top, grid);
    return shell;
  }

  if (meta.domainKind === "php") {
    const top = el("div", "arch-win-bar");
    top.append(el("span", "arch-win-dots"), el("span", "arch-win-title", "localhost:8000/index.php"), el("span", "arch-badge-ok", "PHP 8 · CSS"));
    const grid = el("div", "arch-two-pane");
    const code = el("div", "arch-code-pane");
    ["<?php session_start();", "$stmt = $pdo->prepare('SELECT *');", "require 'views/layout.php'; ?>"].forEach(l => code.append(el("code", "", l)));
    const kv = el("div", "arch-kv-card");
    kv.append(
      createArchNodeRow(isEn ? "Rendering" : "Rendu", "Server-Side PHP"),
      createArchNodeRow("Layout", "Custom CSS3 Grid"),
      createArchNodeRow("Latency", "4.2ms Local", "ok")
    );
    grid.append(code, kv);
    const bar = el("div", "arch-telemetry-strip");
    bar.append(el("span", "ok", "PHP 8 OK"), el("span", "", "PDO Prepared"), el("span", "", "SSR View Ready"));
    shell.append(top, grid, bar);
    return shell;
  }

  /* Dynamic fallback for custom / API-loaded projects */
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

function updateSpotlightStage(projectOrIndex) {
  const showcase = document.getElementById("projectsShowcase");
  const theater = document.getElementById("projectSpotlightStage");
  const railWrap = showcase?.querySelector(".projects-rail-wrap");
  const cards = Array.from(document.querySelectorAll("#projets .project-card"));

  if (!currentRenderedProjects || currentRenderedProjects.length === 0 || cards.length === 0) {
    if (theater) theater.hidden = true;
    if (railWrap) railWrap.hidden = true;
    return;
  }

  const visibleCards = cards.filter(c => c.style.display !== "none");
  if (visibleCards.length === 0) {
    if (theater) theater.hidden = true;
    if (railWrap) railWrap.hidden = true;
    return;
  }
  if (theater) theater.hidden = false;
  if (railWrap) railWrap.hidden = false;

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
  const totalStr = String(currentRenderedProjects.length).padStart(2, "0");
  const accent = DOMAIN_ACCENTS[meta.domainKind] || DOMAIN_ACCENTS.architecture;

  if (showcase) {
    showcase.style.setProperty("--stage-hue-1", accent.h1);
    showcase.style.setProperty("--stage-hue-2", accent.h2);
  }

  cards.forEach((tile, i) => {
    const active = i === idx;
    tile.classList.toggle("is-active", active);
    tile.setAttribute("aria-current", active ? "true" : "false");
    if (active) {
      tile.style.setProperty("--stage-hue-1", accent.h1);
      tile.style.setProperty("--stage-hue-2", accent.h2);
      const rail = tile.parentElement;
      if (rail && rail.scrollWidth > rail.clientWidth + 4) {
        const targetLeft = tile.offsetLeft - (rail.clientWidth - tile.clientWidth) / 2;
        rail.scrollTo({ left: Math.max(0, targetLeft), behavior: "smooth" });
      }
    }
  });

  const stageIndex = document.getElementById("stageIndex");
  const stageGhost = document.getElementById("stageGhostNum");
  const stageCat = document.getElementById("stageCategory");
  const stageRepo = document.getElementById("stageRepoSlug");
  const stageCanvas = document.getElementById("stageCanvas");
  const stageTitle = document.getElementById("stageTitle");
  const stageHighlights = document.getElementById("stageHighlights");
  const stageChips = document.getElementById("stageChips");
  const stageSummary = document.getElementById("stageSummary");
  const stageInspect = document.getElementById("stageInspectBtn");
  const stageGh = document.getElementById("stageGithubLink");

  if (stageIndex) stageIndex.textContent = `${meta.indexLabel} / ${totalStr}`;
  if (stageGhost) stageGhost.textContent = meta.indexLabel;
  if (stageCat) stageCat.textContent = meta.type;
  if (stageRepo) stageRepo.textContent = meta.repoSlug;
  if (stageTitle) stageTitle.textContent = meta.title;
  if (stageSummary) {
    stageSummary.textContent = language === "en"
      ? (project.description_en || project.description || "")
      : (project.description_fr || project.description || "");
  }
  if (stageGh) stageGh.href = meta.url;
  if (stageInspect) stageInspect.onclick = () => window.openProjectPreviewModal(idx);
  if (stageChips) {
    stageChips.replaceChildren(...meta.chips.map(label => el("span", "tech-tag", label)));
  }
  if (stageHighlights) {
    const hSet = DOMAIN_HIGHLIGHTS[meta.domainKind] || DOMAIN_HIGHLIGHTS.architecture;
    const bullets = hSet[language] || hSet.fr;
    stageHighlights.replaceChildren(...bullets.map(text => {
      const item = el("div", "th-item");
      item.append(el("span", "th-dot"), el("span", "", text));
      return item;
    }));
  }
  if (stageCanvas) {
    stageCanvas.classList.remove("is-entering");
    stageCanvas.replaceChildren(createBespokeStageCanvas(meta, language));
    void stageCanvas.offsetWidth;
    stageCanvas.classList.add("is-entering");
  }
  const infoPanel = theater?.querySelector(".theater-info-panel");
  if (infoPanel) {
    infoPanel.classList.remove("is-entering");
    void infoPanel.offsetWidth;
    infoPanel.classList.add("is-entering");
  }
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

  document.querySelectorAll("#projets .project-card").forEach((card, i) => {
    const cats = String(card.dataset.category || "").split(/\s+/).filter(Boolean);
    const visible = activeProjectFilter === "all" || cats.includes(activeProjectFilter);
    card.style.display = visible ? "" : "none";
    if (visible) {
      visibleCount += 1;
      if (firstVisibleIndex === -1) firstVisibleIndex = i;
      if (i === activeSpotlightIndex) currentStillVisible = true;
    }
  });

  updateProjectsCountLabel(visibleCount);
  if (visibleCount === 0) {
    updateSpotlightStage(0);
  } else {
    const nextIdx = currentStillVisible ? activeSpotlightIndex : firstVisibleIndex;
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
    card.addEventListener("mouseenter", () => { window._pauseProjectAuto?.(); updateSpotlightStage(idx); });
    card.addEventListener("focusin", () => updateSpotlightStage(idx));
    card.addEventListener("click", (e) => {
      if (!e.target.closest("a, button")) {
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

  currentRenderedProjects.forEach((project, index) => {
    const meta = getProjectMetadata(project, index);
    const card = document.createElement("article");
    card.className = "project-card kinetic-tile";
    card.dataset.category = meta.categories;
    card.tabIndex = 0;
    if (project.id) card.id = "card_" + project.id;

    const topBar = el("div", "kt-top");
    topBar.append(el("span", "kt-num", meta.indexLabel), el("p", "project-type", meta.type));

    const h3 = el("h3", "", meta.title);
    const descEl = el("p", "ledger-desc", language === "en"
      ? (project.description_en || project.description || "")
      : (project.description_fr || project.description || ""));

    const foot = el("div", "kt-foot");
    const viewBtn = el("button", "kt-inspect", language === "en" ? "Inspect" : "Zoom");
    viewBtn.type = "button";
    viewBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      updateSpotlightStage(index);
      window.openProjectPreviewModal(index);
    });

    const githubLink = el("a", "kt-gh", "GitHub ↗");
    githubLink.href = meta.url;
    githubLink.target = "_blank";
    githubLink.rel = "noopener noreferrer";
    githubLink.addEventListener("click", (e) => e.stopPropagation());

    foot.append(viewBtn, githubLink);

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
      foot.append(adminWrap);
    }

    const progress = el("span", "kt-progress");
    progress.setAttribute("aria-hidden", "true");

    card.append(topBar, h3, descEl, foot, progress);
    card.addEventListener("mouseenter", () => { window._pauseProjectAuto?.(); updateSpotlightStage(index); });
    card.addEventListener("focusin", () => updateSpotlightStage(index));
    card.addEventListener("click", (e) => {
      if (!e.target.closest("a, button")) {
        window._pauseProjectAuto?.();
        updateSpotlightStage(index);
      }
    });

    grid.append(card);
  });

  if (currentRenderedProjects.length === 0) {
    updateProjectsCountLabel(0);
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

/* ── Kinetic 3D Theater Parallax, Swipe, Keyboard & Auto-Showcase ── */
(function initKineticProjectsExperience() {
  const showcase = document.getElementById("projectsShowcase");
  const theater = document.getElementById("projectSpotlightStage");
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

  if (theater && !reducedMotion && window.matchMedia && window.matchMedia("(pointer: fine)").matches) {
    let rafId = null;
    theater.addEventListener("mousemove", (e) => {
      const rect = theater.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width;
      const py = (e.clientY - rect.top) / rect.height;
      const rx = (0.5 - py) * 3.6;
      const ry = (px - 0.5) * 4.4;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        theater.style.setProperty("--mouse-x", `${(px * 100).toFixed(1)}%`);
        theater.style.setProperty("--mouse-y", `${(py * 100).toFixed(1)}%`);
        theater.style.setProperty("--tilt-x", `${rx.toFixed(2)}deg`);
        theater.style.setProperty("--tilt-y", `${ry.toFixed(2)}deg`);
        theater.classList.add("is-tilting");
      });
    });
    theater.addEventListener("mouseleave", () => {
      if (rafId) cancelAnimationFrame(rafId);
      theater.classList.remove("is-tilting");
      theater.style.setProperty("--tilt-x", "0deg");
      theater.style.setProperty("--tilt-y", "0deg");
    });

    // Mobile/tablet swipe on theater
    let startX = 0;
    theater.addEventListener("touchstart", (e) => {
      startX = e.changedTouches[0]?.clientX || 0;
    }, { passive: true });
    theater.addEventListener("touchend", (e) => {
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
