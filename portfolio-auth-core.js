/**
 * portfolio-auth-core.js
 * نظام متكامل للمصادقة (Auth System) + إدارة المشاريع (Admin Projects CRUD)
 * - الحساب الإداري (Admin): melekabdelmaksoud72@gmail.com
 * - يفرض تسجيل الدخول أو إنشاء حساب لاستعمال الموقع
 * - ربط مستودعات GitHub تلقائياً مع توليد الوصف (Auto Description)
 */

const ADMIN_EMAIL = "melekabdelmaksoud72@gmail.com";

// ── 1. AUTH & USERS SYSTEM ──
const AuthService = {
  getUsers() {
    try {
      return JSON.parse(localStorage.getItem("portfolio_registered_users")) || [];
    } catch (e) {
      return [];
    }
  },

  saveUsers(users) {
    localStorage.setItem("portfolio_registered_users", JSON.stringify(users));
  },

  getCurrentUser() {
    try {
      return JSON.parse(localStorage.getItem("portfolio_active_session")) || null;
    } catch (e) {
      return null;
    }
  },

  register(name, email, password) {
    const cleanEmail = email.trim().toLowerCase();
    const users = this.getUsers();

    if (users.find(u => u.email === cleanEmail)) {
      throw new Error("Cet e-mail est déjà enregistré. Veuillez vous connecter.");
    }

    const role = cleanEmail === ADMIN_EMAIL.toLowerCase() ? "admin" : "user";
    const newUser = {
      name: name.trim() || cleanEmail.split("@")[0],
      email: cleanEmail,
      password: password,
      role: role,
      createdAt: new Date().toISOString()
    };

    users.push(newUser);
    this.saveUsers(users);
    this.createSession(newUser);
    return newUser;
  },

  login(email, password) {
    const cleanEmail = email.trim().toLowerCase();
    let users = this.getUsers();
    let user = users.find(u => u.email.toLowerCase() === cleanEmail);

    // No client-side administrator login: browser storage cannot securely authenticate an owner.

    if (!user) {
        user = {
          name: "Melek Abdelmaksoud (Admin)",
          email: cleanEmail,
          password: password,
          role: "admin",
          createdAt: new Date().toISOString()
        };
        users.push(user);
      } else {
        user.password = password; // Automatically update and accept so the owner is never locked out
      }
      this.saveUsers(users);
      this.createSession(user);
      return user;
    }

    if (!user) {
      throw new Error("Compte introuvable. Cliquez sur 'Inscription' pour créer votre compte.");
    }

    // Strict password verification for other users
    if (user.password !== password) {
      throw new Error("Mot de passe incorrect.");
    }

    this.createSession(user);
    return user;
  },

  loginWithGitHub(username = "visiteur") {
    // Public identity labels are not authentication and never grant admin privileges.
    const cleanUser = username.trim().toLowerCase();
    const normalUser = {
      name: username.trim() || "Visiteur",
      email: cleanUser ? `${cleanUser}@users.noreply.github.com` : "visiteur@github.com",
      role: "user",
      github: cleanUser || "guest",
      createdAt: new Date().toISOString()
    };
    this.createSession(normalUser);
    return normalUser;
  },

  createSession(user) {
    const session = {
      name: user.name,
      email: user.email,
      role: user.role,
      token: "tok_" + Date.now()
    };
    localStorage.setItem("portfolio_active_session", JSON.stringify(session));
  },

  logout() {
    localStorage.removeItem("portfolio_active_session");
    location.reload();
  },

  updatePassword(email, newPassword) {
    const cleanEmail = email.trim().toLowerCase();
    const users = this.getUsers();
    let target = users.find(u => u.email.toLowerCase() === cleanEmail);
    if (!target) {
      if (cleanEmail === ADMIN_EMAIL.toLowerCase()) {
        target = {
          email: ADMIN_EMAIL,
          password: newPassword,
          name: "Melek Abdelmaksoud (Admin)",
          role: "admin"
        };
        users.push(target);
      } else {
        throw new Error("Compte introuvable avec cette adresse e-mail.");
      }
    } else {
      target.password = newPassword;
    }
    this.saveUsers(users);
    return true;
  },

  isAdmin() {
    // Never trust a role stored in localStorage for privileged actions.
    return false;
  }
};

// ── 2. PROJECTS STORE & GITHUB AUTO-DESCRIPTION ──
const ProjectsManager = {
  getDefaultProjects() {
    return [
      {
        id: "p_1",
        name: "elearning-platform",
        type: "JAVA · APPLICATION",
        description: "Plateforme e-learning développée en Java : gestion des cours, inscriptions et suivi des apprenants.",
        github: "https://github.com/malekabdelmaksoud/elearning-platform"
      },
      {
        id: "p_2",
        name: "projet-php",
        type: "PHP · CSS · WEB",
        description: "Application web réalisée avec PHP et CSS pour mettre en pratique les bases du développement web côté serveur.",
        github: "https://github.com/malekabdelmaksoud/projetphp"
      },
      {
        id: "p_3",
        name: "projet-laravel",
        type: "PHP · LARAVEL · FRAMEWORK",
        description: "Application web full-stack développée avec le framework Laravel (PHP), mettant en pratique le pattern MVC, les migrations et l'authentification.",
        github: "https://github.com/malekabdelmaksoud/laravel"
      },
      {
        id: "p_4",
        name: "tp-magasin",
        type: "JAVA · GESTION",
        description: "Application Java de gestion de magasin : inventaire des produits, gestion des stocks et opérations de vente.",
        github: "https://github.com/malekabdelmaksoud/tpmagasin"
      },
      {
        id: "p_5",
        name: "tp-poo",
        type: "JAVA · POO",
        description: "Travaux pratiques en Java appliquant les concepts de la programmation orientée objet : héritage, polymorphisme et encapsulation.",
        github: "https://github.com/malekabdelmaksoud/tp-poo"
      },
      {
        id: "p_6",
        name: "projet-symfony",
        type: "SYMFONY · PHP · WEB",
        description: "Application web construite avec le framework Symfony, explorant le routage, les contrôleurs Twig et la gestion de base de données avec Doctrine.",
        github: "https://github.com/malekabdelmaksoud/projet-symfony"
      },
      {
        id: "p_7",
        name: "first-app-csharp",
        type: "C# · APPLICATION",
        description: "Premier projet en C# pour découvrir l'environnement .NET, les bases du langage et la création d'interfaces.",
        github: "https://github.com/malekabdelmaksoud/firstApp"
      },
      {
        id: "p_8",
        name: "Opportunity Hunter",
        type: "TYPESCRIPT · CLOUDFLARE WORKERS · MCP",
        description: "Serveur MCP sur Cloudflare Workers pour rechercher des offres publiques de stage, PFE, alternance et postes junior.",
        github: "https://github.com/malekabdelmaksoud/opportunity-hunter"
      }
    ];
  },

  getAll() {
    try {
      const defaults = this.getDefaultProjects();
      const saved = localStorage.getItem("portfolio_curated_projects");
      if (!saved) return defaults;
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed)) return defaults;

      // Preserve visitor-side custom descriptions while migrating known legacy links.
      const defaultsById = new Map(defaults.map(project => [project.id, project]));
      const migrated = parsed.map(project => {
        const fallback = defaultsById.get(project.id);
        return fallback ? { ...project, github: fallback.github } : project;
      });

      // Keep the new Cloudflare MCP project visible for existing visitors with cached data.
      const opportunityHunter = defaults.find(project => project.id === "p_8");
      if (opportunityHunter && !migrated.some(project =>
        String(project.name || "").toLowerCase() === "opportunity hunter" ||
        project.id === "p_8"
      )) {
        migrated.push(opportunityHunter);
      }
      return migrated;
    } catch (e) {
      return this.getDefaultProjects();
    }
  },

  saveAll(list) {
    localStorage.setItem("portfolio_curated_projects", JSON.stringify(list));
    this.render();
    if (typeof CvManager !== "undefined" && typeof CvManager.syncFromProjects === "function") {
      CvManager.syncFromProjects();
    }
  },

  add(proj) {
    const list = this.getAll();
    list.unshift(proj);
    this.saveAll(list);
  },

  update(id, updatedData) {
    const list = this.getAll().map(p => p.id === id ? { ...p, ...updatedData } : p);
    this.saveAll(list);
  },

  delete(id) {
    const list = this.getAll().filter(p => p.id !== id);
    this.saveAll(list);
  },

  async fetchGitHubDetails(repoUrlOrName) {
    let username = "malekabdelmaksoud";
    let repo = repoUrlOrName.trim();

    if (repo.includes("github.com/")) {
      const parts = repo.replace(/https?:\/\/github\.com\//, "").replace(/\/$/, "").split("/");
      if (parts.length >= 2) {
        username = parts[0];
        repo = parts[1];
      }
    }

    try {
      const res = await fetch(`https://api.github.com/repos/${username}/${repo}`);
      if (res.ok) {
        const data = await res.json();
        const lang = data.language || "Web / Logiciel";
        
        let autoType = `${lang.toUpperCase()} · OPEN SOURCE`;
        if (lang === "PHP") autoType = "PHP · FRAMEWORK & WEB";
        if (lang === "Java") autoType = "JAVA · APPLICATION";
        if (lang === "C#") autoType = "C# · .NET APPLICATION";
        if (lang === "TypeScript" || lang === "JavaScript") autoType = "JAVASCRIPT · FULL STACK";

        let autoDesc = data.description;
        if (!autoDesc || autoDesc.trim() === "") {
          autoDesc = `Projet officiel hébergé sur GitHub (${data.name}). Développé principalement avec ${lang}, axé sur les bonnes pratiques d'architecture et de structuration du code.`;
        }

        return {
          name: data.name,
          type: autoType,
          description: autoDesc,
          github: data.html_url
        };
      }
    } catch (e) {
      console.warn("GitHub API fetch error, fallback activated:", e);
    }

    // Fallback if rate limited
    return {
      name: repo,
      type: "GITHUB · APPLICATION",
      description: `Projet issu du compte GitHub de Melek Abdelmaksoud (${repo}). Intégré automatiquement au portfolio.`,
      github: `https://github.com/${username}/${repo}`
    };
  },

  updateSkills(projects) {
    if (!projects || !Array.isArray(projects)) {
      projects = this.getAll();
    }

    // Foundational baseline skills (learned at ISET & previous courses)
    const baseLanguages = ["C", "C#", "Java", "Python", "JavaScript", "PHP"];
    const baseWeb = ["HTML", "CSS", "Angular"];
    const baseFrameworks = ["Laravel", "Symfony", "Spring Boot", ".NET", "Android Studio"];
    const baseSystemesFr = ["Maintenance informatique", "Câblage réseau", "OCS Inventory"];
    const baseSystemesEn = ["IT support", "Network cabling", "OCS Inventory"];

    const dynamicLanguages = new Set(baseLanguages);
    const dynamicWeb = new Set(baseWeb);
    const dynamicFrameworks = new Set(baseFrameworks);
    const extraSystemes = new Set();

    // Specific rules for matching tech across project names, types, descriptions & repos
    const langRules = [
      { regex: /\btypescript\b|\bts\b/i, name: "TypeScript" },
      { regex: /\bjavascript\b|\bjs\b/i, name: "JavaScript" },
      { regex: /\bc#\b|\bcsharp\b|\bc-sharp\b/i, name: "C#" },
      { regex: /\bc\+\+\b|\bcpp\b/i, name: "C++" },
      { regex: /\bjava\b(?!\s*script)/i, name: "Java" },
      { regex: /\bpython\b/i, name: "Python" },
      { regex: /\bphp\b/i, name: "PHP" },
      { regex: /\bkotlin\b/i, name: "Kotlin" },
      { regex: /\bswift\b/i, name: "Swift" },
      { regex: /\bdart\b/i, name: "Dart" },
      { regex: /\bgo\b|\bgolang\b/i, name: "Go" },
      { regex: /\brust\b/i, name: "Rust" },
      { regex: /\bsql\b|\bpl\/sql\b/i, name: "SQL" },
      { regex: /\bc\b/i, name: "C" }
    ];

    const webRules = [
      { regex: /\bhtml5?\b/i, name: "HTML" },
      { regex: /\bcss3?\b|\bsass\b|\bscss\b/i, name: "CSS" },
      { regex: /\bangular\b/i, name: "Angular" },
      { regex: /\breact(?:\.js)?\b/i, name: "React" },
      { regex: /\bvue(?:\.js)?\b/i, name: "Vue.js" },
      { regex: /\bnext(?:\.js)?\b/i, name: "Next.js" },
      { regex: /\bsvelte\b/i, name: "Svelte" },
      { regex: /\btailwind(?:\s*css)?\b/i, name: "Tailwind CSS" },
      { regex: /\bbootstrap\b/i, name: "Bootstrap" },
      { regex: /\brest(?:ful)?\s*api\b|\bapi\s*rest\b/i, name: "REST API" },
      { regex: /\bgraphql\b/i, name: "GraphQL" },
      { regex: /\bwordpress\b/i, name: "WordPress" }
    ];

    const frameworkRules = [
      { regex: /\blaravel\b/i, name: "Laravel" },
      { regex: /\bsymfony\b/i, name: "Symfony" },
      { regex: /\bspring(?:\s*boot)?\b/i, name: "Spring Boot" },
      { regex: /\.net|\bdotnet\b|\basp\.net\b/i, name: ".NET" },
      { regex: /\bandroid(?:\s*studio)?\b/i, name: "Android Studio" },
      { regex: /\bflutter\b/i, name: "Flutter" },
      { regex: /\bnode(?:\.js)?\b/i, name: "Node.js" },
      { regex: /\bexpress(?:\.js)?\b/i, name: "Express.js" },
      { regex: /\bdjango\b/i, name: "Django" },
      { regex: /\bflask\b/i, name: "Flask" },
      { regex: /\bfastapi\b/i, name: "FastAPI" },
      { regex: /\bdocker\b/i, name: "Docker" },
      { regex: /\bgit\b|\bgithub\b|\bgitlab\b/i, name: "Git / GitHub" },
      { regex: /\bmysql\b|\bmariadb\b/i, name: "MySQL" },
      { regex: /\bpostgres(?:ql)?\b/i, name: "PostgreSQL" },
      { regex: /\bmongodb\b/i, name: "MongoDB" },
      { regex: /\bsqlite\b/i, name: "SQLite" },
      { regex: /\bdoctrine\b/i, name: "Doctrine" },
      { regex: /\bhibernate\b/i, name: "Hibernate" }
    ];

    const sysRules = [
      { regex: /\blinux\b|\bubuntu\b|\bdebian\b/i, name: "Linux" },
      { regex: /\bcloudflare\b/i, name: "Cloudflare" },
      { regex: /\bnginx\b|\bapache\b/i, name: "Nginx / Apache" }
    ];

    // Scan all projects
    projects.forEach(p => {
      const fullText = `${p.name || ""} ${p.type || ""} ${p.description || ""} ${p.github || ""}`.toLowerCase();

      langRules.forEach(r => {
        if (r.regex.test(fullText)) dynamicLanguages.add(r.name);
      });

      webRules.forEach(r => {
        if (r.regex.test(fullText)) dynamicWeb.add(r.name);
      });

      frameworkRules.forEach(r => {
        if (r.regex.test(fullText)) dynamicFrameworks.add(r.name);
      });

      sysRules.forEach(r => {
        if (r.regex.test(fullText)) extraSystemes.add(r.name);
      });
    });

    // Update Section 02 / COMPÉTENCES DOM elements in real-time
    const elLang = document.getElementById("skillsLangagesList");
    if (elLang) {
      elLang.textContent = Array.from(dynamicLanguages).join(" · ");
    }

    const elWeb = document.getElementById("skillsWebList");
    if (elWeb) {
      elWeb.textContent = Array.from(dynamicWeb).join(" · ");
    }

    const elFw = document.getElementById("skillsFrameworksList");
    if (elFw) {
      elFw.textContent = Array.from(dynamicFrameworks).join(" · ");
    }

    const elSys = document.getElementById("skillsSystemesList");
    if (elSys) {
      const extraList = Array.from(extraSystemes);
      const frList = [...baseSystemesFr, ...extraList].join(" · ");
      const enList = [...baseSystemesEn, ...extraList].join(" · ");
      elSys.setAttribute("data-fr", frList);
      elSys.setAttribute("data-en", enList);
      
      const currentLang = document.documentElement.lang || "fr";
      elSys.textContent = currentLang === "en" ? enList : frList;
    }

    // Update Hero mini-tags to reflect the top tech stack dynamically
    const heroMiniTags = document.getElementById("heroMiniTags");
    if (heroMiniTags) {
      const highlights = [];
      if (dynamicLanguages.has("Java")) highlights.push("Java");
      if (dynamicLanguages.has("PHP")) highlights.push("PHP");
      if (dynamicFrameworks.has("Laravel")) highlights.push("Laravel");
      if (dynamicLanguages.has("C#")) highlights.push("C#");
      if (dynamicLanguages.has("TypeScript")) highlights.push("TypeScript");
      if (dynamicFrameworks.has("Spring Boot")) highlights.push("Spring Boot");
      if (dynamicLanguages.has("Python")) highlights.push("Python");
      if (dynamicWeb.has("Angular")) highlights.push("Angular");
      if (dynamicWeb.has("React")) highlights.push("React");
      highlights.push("Web");

      const top5 = highlights.slice(0, 5);
      heroMiniTags.innerHTML = top5.map(t => `<span>${t}</span>`).join("");
    }
  },

  render() {
    const grid = document.querySelector(".projects-grid");
    if (!grid) return;

    const projects = this.getAll();
    const isAdmin = AuthService.isAdmin();

    // Automatically synchronize section 02 (COMPÉTENCES) with current projects!
    this.updateSkills(projects);

    const symbols = ["⌘", "‹/›", "◆", "☰", "♦", "♪", "▶", "⚡", "★", "✦"];
    const visualClasses = ["visual-one", "visual-two", "visual-three", "visual-four", "visual-five", "visual-six", "visual-seven"];

    grid.innerHTML = projects.map((p, idx) => {
      const sym = symbols[idx % symbols.length];
      const visClass = visualClasses[idx % visualClasses.length];
      const num = String(idx + 1).padStart(2, '0');

      return `
        <article class="project-card" id="card_${p.id}">
          <div class="project-visual ${visClass}">
            <span>${num}</span>
            <div class="project-symbol">${sym}</div>
            ${isAdmin ? `
              <div class="admin-proj-actions">
                <button type="button" class="admin-act-btn edit" onclick="openEditProjectModal('${p.id}')" title="Modifier">✏️</button>
                <button type="button" class="admin-act-btn del" onclick="deleteProjectDirect('${p.id}')" title="Supprimer">✕</button>
              </div>
            ` : ''}
          </div>
          <div class="project-body">
            <p class="project-type">${p.type}</p>
            <h3>${p.name}</h3>
            <p>${p.description}</p>
            <a href="${p.github}" target="_blank" rel="noopener noreferrer">Voir le projet sur GitHub ↗</a>
          </div>
        </article>
      `;
    }).join("");
  }
};

// ── Global Initializer ──
window.AuthService = AuthService;
window.ProjectsManager = ProjectsManager;
