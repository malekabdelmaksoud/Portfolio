// ── Auth & Role System (Admin: melekabdelmaksoud72@gmail.com) ──
const ADMIN_EMAIL = "melekabdelmaksoud72@gmail.com";

const AuthSystem = {
  getCurrentUser() {
    try {
      return JSON.parse(localStorage.getItem("portfolio_user")) || null;
    } catch (e) {
      return null;
    }
  },
  isAdmin() {
    const user = this.getCurrentUser();
    return user && user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase();
  },
  login(email, name = "") {
    const cleanEmail = email.trim().toLowerCase();
    const user = {
      email: cleanEmail,
      name: name.trim() || cleanEmail.split("@")[0],
      role: cleanEmail === ADMIN_EMAIL.toLowerCase() ? "admin" : "user",
      loginAt: new Date().toISOString()
    };
    localStorage.setItem("portfolio_user", JSON.stringify(user));
    return user;
  },
  logout() {
    localStorage.removeItem("portfolio_user");
  }
};

// ── Dynamic Projects Store (with GitHub API Integration) ──
const ProjectsStore = {
  getDefaultProjects() {
    return [
      {
        id: "proj_1",
        name: "elearning-platform",
        type: "JAVA · APPLICATION",
        description: "Plateforme e-learning développée en Java : gestion des cours, inscriptions et suivi des apprenants.",
        github: "https://github.com/malekabdelmaksoud/elearning-platform"
      },
      {
        id: "proj_2",
        name: "projet-php",
        type: "PHP · CSS · WEB",
        description: "Application web réalisée avec PHP et CSS pour mettre en pratique les bases du développement web côté serveur.",
        github: "https://github.com/malekabdelmaksoud/projet-php"
      },
      {
        id: "proj_3",
        name: "projet-laravel",
        type: "PHP · LARAVEL · FRAMEWORK",
        description: "Application web full-stack développée avec le framework Laravel (PHP), appliquant le pattern MVC, migrations et authentification.",
        github: "https://github.com/malekabdelmaksoud/projet-laravel"
      },
      {
        id: "proj_4",
        name: "tp-magasin",
        type: "JAVA · GESTION",
        description: "Application Java de gestion de magasin : inventaire des produits, gestion des stocks et opérations de vente.",
        github: "https://github.com/malekabdelmaksoud/tp-magasin"
      },
      {
        id: "proj_5",
        name: "tp-poo",
        type: "JAVA · POO",
        description: "Travaux pratiques en Java appliquant les concepts de la programmation orientée objet : héritage, polymorphisme et encapsulation.",
        github: "https://github.com/malekabdelmaksoud/tp-poo"
      },
      {
        id: "proj_6",
        name: "projet-symfony",
        type: "SYMFONY · PHP · WEB",
        description: "Application web construite avec le framework Symfony, explorant le routage, les contrôleurs Twig et la gestion de base de données avec Doctrine.",
        github: "https://github.com/malekabdelmaksoud/projet-symfony"
      },
      {
        id: "proj_7",
        name: "first-app-csharp",
        type: "C# · APPLICATION",
        description: "Premier projet en C# pour découvrir l'environnement .NET, les bases du langage et la création d'interfaces.",
        github: "https://github.com/malekabdelmaksoud/first-app-csharp"
      }
    ];
  },
  getProjects() {
    try {
      const stored = localStorage.getItem("portfolio_dynamic_projects");
      return stored ? JSON.parse(stored) : this.getDefaultProjects();
    } catch (e) {
      return this.getDefaultProjects();
    }
  },
  saveProjects(projects) {
    localStorage.setItem("portfolio_dynamic_projects", JSON.stringify(projects));
    this.renderInPortfolio();
  },
  addProject(project) {
    const list = this.getProjects();
    list.unshift(project);
    this.saveProjects(list);
  },
  deleteProject(id) {
    const list = this.getProjects().filter(p => p.id !== id);
    this.saveProjects(list);
  },
  renderInPortfolio() {
    const grid = document.querySelector(".projects-grid");
    if (!grid) return;
    const projects = this.getProjects();
    const isAdmin = AuthSystem.isAdmin();

    const symbols = ["⌘", "‹/›", "◆", "☰", "♦", "♪", "▶", "⚡", "★", "✦"];
    const visualClasses = ["visual-one", "visual-two", "visual-three", "visual-four", "visual-five", "visual-six", "visual-seven"];

    grid.innerHTML = projects.map((p, idx) => {
      const sym = symbols[idx % symbols.length];
      const visClass = visualClasses[idx % visualClasses.length];
      const num = String(idx + 1).padStart(2, '0');
      return `
        <article class="project-card" data-proj-id="${p.id}">
          <div class="project-visual ${visClass}">
            <span>${num}</span>
            <div class="project-symbol">${sym}</div>
            ${isAdmin ? `<button class="admin-del-proj" onclick="ProjectsStore.deleteProject('${p.id}')" title="Supprimer le projet">✕</button>` : ''}
          </div>
          <div class="project-body">
            <p class="project-type">${p.type || 'PROJET · GITHUB'}</p>
            <h3>${p.name}</h3>
            <p>${p.description}</p>
            <a href="${p.github}" target="_blank" rel="noopener noreferrer">Voir le projet sur GitHub ↗</a>
          </div>
        </article>
      `;
    }).join("");
  }
};

// ── Fetch GitHub Repo Details Automatically ──
async function fetchGithubRepoData(repoUrlOrName) {
  let user = "malekabdelmaksoud";
  let repo = repoUrlOrName.trim();

  if (repo.includes("github.com/")) {
    const parts = repo.replace(/https?:\/\/github\.com\//, "").replace(/\/$/, "").split("/");
    if (parts.length >= 2) {
      user = parts[0];
      repo = parts[1];
    }
  }

  try {
    const res = await fetch(`https://api.github.com/repos/${user}/${repo}`);
    if (!res.ok) throw new Error("Dépôt introuvable sur GitHub.");
    const data = await res.json();

    // Auto generate type based on language
    const lang = data.language || "Code";
    let autoType = `${lang.toUpperCase()} · OPEN-SOURCE`;
    if (lang === "PHP") autoType = "PHP · WEB FRAMEWORK";
    if (lang === "Java") autoType = "JAVA · APPLICATION";
    if (lang === "C#") autoType = "C# · .NET APPLICATION";

    return {
      name: data.name,
      type: autoType,
      description: data.description || `Projet open-source développé en ${lang}. Consultez le code et les fonctionnalités sur GitHub.`,
      github: data.html_url
    };
  } catch (err) {
    // Fallback if rate limited or private
    return {
      name: repo,
      type: "GITHUB · REPOSITORY",
      description: `Projet issu du profil GitHub ${user}.`,
      github: `https://github.com/${user}/${repo}`
    };
  }
}

// ── Global Initializer ──
document.addEventListener("DOMContentLoaded", () => {
  ProjectsStore.renderInPortfolio();
});
