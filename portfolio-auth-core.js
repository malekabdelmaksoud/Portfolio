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
      return JSON.parse(localStorage.getItem("portfolio_registered_users")) || [
        {
          email: ADMIN_EMAIL,
          password: "admin", // mot de passe par défaut
          name: "Melek Abdelmaksoud (Admin)",
          role: "admin"
        }
      ];
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
    
    // Auto provision / ensure admin account exists
    let user = users.find(u => u.email.toLowerCase() === cleanEmail);

    if (cleanEmail === ADMIN_EMAIL.toLowerCase()) {
      // If admin, create or accept and set role to admin
      if (!user) {
        user = {
          name: "Melek Abdelmaksoud (Admin)",
          email: cleanEmail,
          password: password,
          role: "admin",
          createdAt: new Date().toISOString()
        };
        users.push(user);
        this.saveUsers(users);
      } else {
        // If password was default 'admin' or user entered any password, accept and update password
        if (user.password !== password) {
          user.password = password;
          this.saveUsers(users);
        }
      }
    }

    if (!user) {
      throw new Error("Compte introuvable. Cliquez sur 'Inscription' pour créer votre compte.");
    }

    if (cleanEmail !== ADMIN_EMAIL.toLowerCase() && user.password !== password) {
      throw new Error("Mot de passe incorrect.");
    }

    this.createSession(user);
    return user;
  },

  loginWithGitHub(username = "malekabdelmaksoud") {
    const isOwner = username.toLowerCase() === "malekabdelmaksoud" || username.toLowerCase() === "melekabdelmaksoud72";
    const user = {
      name: isOwner ? "Melek Abdelmaksoud (Admin)" : username,
      email: isOwner ? ADMIN_EMAIL : `${username}@users.noreply.github.com`,
      role: isOwner ? "admin" : "user",
      github: username,
      createdAt: new Date().toISOString()
    };
    this.createSession(user);
    return user;
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

  isAdmin() {
    const user = this.getCurrentUser();
    return user && user.role === "admin";
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
        github: "https://github.com/malekabdelmaksoud/projet-php"
      },
      {
        id: "p_3",
        name: "projet-laravel",
        type: "PHP · LARAVEL · FRAMEWORK",
        description: "Application web full-stack développée avec le framework Laravel (PHP), mettant en pratique le pattern MVC, les migrations et l'authentification.",
        github: "https://github.com/malekabdelmaksoud/projet-laravel"
      },
      {
        id: "p_4",
        name: "tp-magasin",
        type: "JAVA · GESTION",
        description: "Application Java de gestion de magasin : inventaire des produits, gestion des stocks et opérations de vente.",
        github: "https://github.com/malekabdelmaksoud/tp-magasin"
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
        github: "https://github.com/malekabdelmaksoud/first-app-csharp"
      }
    ];
  },

  getAll() {
    try {
      const saved = localStorage.getItem("portfolio_curated_projects");
      return saved ? JSON.parse(saved) : this.getDefaultProjects();
    } catch (e) {
      return this.getDefaultProjects();
    }
  },

  saveAll(list) {
    localStorage.setItem("portfolio_curated_projects", JSON.stringify(list));
    this.render();
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

  render() {
    const grid = document.querySelector(".projects-grid");
    if (!grid) return;

    const projects = this.getAll();
    const isAdmin = AuthService.isAdmin();

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
