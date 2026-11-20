// ── UI Integration for Auth Gate & Admin Project Modals ──
document.addEventListener("DOMContentLoaded", () => {
  initAuthGate();
  initAdminProjectTools();
});

function initAuthGate() {
  const user = AuthService.getCurrentUser();
  const overlay = document.getElementById("authGateOverlay");
  const navContainer = document.getElementById("navUserSlot");

  if (!user) {
    if (overlay) overlay.style.display = "flex";
  } else {
    if (overlay) overlay.style.display = "none";
    if (navContainer) {
      const isAdmin = user.role === "admin";
      navContainer.innerHTML = `
        <div class="user-nav-status">
          <span class="user-click-trigger" onclick="openProfileModal()" title="Voir mon profil & sécurité">
            👤 <b>${user.name}</b> ⚙️
          </span>
          <span class="role-badge ${user.role}">${user.role}</span>
          <button class="btn-nav-logout" onclick="AuthService.logout()">Déconnexion</button>
        </div>
      `;
    }

    if (AuthService.isAdmin()) {
      showAdminFloatingControls();
    }
  }

  // Handle Tab Switch (Login / Register)
  const tabLogin = document.getElementById("tabBtnLogin");
  const tabRegister = document.getElementById("tabBtnRegister");
  const fieldNameGroup = document.getElementById("fieldNameGroup");
  const authSubmitBtn = document.getElementById("authSubmitBtn");
  const authTitle = document.getElementById("authMainTitle");
  const authSubtitle = document.getElementById("authMainSubtitle");
  let mode = "login";

  if (tabLogin && tabRegister) {
    tabLogin.addEventListener("click", () => {
      mode = "login";
      tabLogin.classList.add("active");
      tabRegister.classList.remove("active");
      fieldNameGroup.style.display = "none";
      authSubmitBtn.textContent = "Continue with Email";
      if (authTitle) authTitle.textContent = "Log in to Portfolio";
      if (authSubtitle) authSubtitle.textContent = "Connectez-vous pour explorer le portfolio et les fonctionnalités.";
      clearError();
    });

    tabRegister.addEventListener("click", () => {
      mode = "register";
      tabRegister.classList.add("active");
      tabLogin.classList.remove("active");
      fieldNameGroup.style.display = "block";
      authSubmitBtn.textContent = "Create Account with Email";
      if (authTitle) authTitle.textContent = "Create an Account";
      if (authSubtitle) authSubtitle.textContent = "Inscrivez-vous pour accéder au portfolio personnel de Melek.";
      clearError();
    });
  }

  const authForm = document.getElementById("authMainForm");
  if (authForm) {
    authForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const email = document.getElementById("authEmail").value.trim();
      const password = document.getElementById("authPassword").value;
      const name = document.getElementById("authName") ? document.getElementById("authName").value.trim() : "";
      const errorDiv = document.getElementById("authErrorMsg");

      try {
        let loggedUser;
        if (mode === "login") {
          loggedUser = AuthService.login(email, password);
        } else {
          loggedUser = AuthService.register(name, email, password);
        }
        
        // Hide overlay smoothly immediately
        if (overlay) overlay.style.display = "none";
        
        // Rerender nav and admin tools directly
        initAuthGate();
        ProjectsManager.render();
      } catch (err) {
        if (errorDiv) {
          errorDiv.textContent = err.message;
          errorDiv.style.display = "block";
        }
      }
    });
  }

  function clearError() {
    const errorDiv = document.getElementById("authErrorMsg");
    if (errorDiv) errorDiv.style.display = "none";
  }
}

// ── Admin Floating Controls & Project Modals ──
function showAdminFloatingControls() {
  const container = document.getElementById("adminProjectsActionBar");
  if (!container) return;

  if (AuthService.isAdmin()) {
    container.innerHTML = `
      <button class="admin-proj-top-btn" onclick="openAddProjectModal()">
        <span>👑</span> <span>+ Lier un Repos GitHub</span>
      </button>
    `;
  } else {
    container.innerHTML = "";
  }
}

function initAdminProjectTools() {
  ProjectsManager.render();
}

// ── GitHub OAuth Login (Vercel / Cloudflare Style) ──
function handleGitHubOAuthLogin() {
  const ghUser = prompt("Entrez votre nom d'utilisateur GitHub (ou laissez vide pour continuer en tant que visiteur) :", "malekabdelmaksoud");
  if (ghUser === null) return; // User cancelled

  const cleanUser = ghUser.trim().toLowerCase();
  const isOwner = cleanUser === "malekabdelmaksoud" || cleanUser === "melekabdelmaksoud72";
  let adminPassword = "";

  if (isOwner) {
    adminPassword = prompt("🔐 Ce compte possède les privilèges Administrateur.\nVeuillez saisir votre mot de passe Administrateur :");
    if (!adminPassword) {
      alert("Authentification Administrateur annulée.");
      return;
    }
  }

  try {
    const loggedUser = AuthService.loginWithGitHub(cleanUser, adminPassword);
    const overlay = document.getElementById("authGateOverlay");
    if (overlay) overlay.style.display = "none";
    initAuthGate();
    ProjectsManager.render();

    if (loggedUser.role === "admin") {
      alert("👑 Bienvenue Melek Abdelmaksoud ! Mode Administrateur activé.");
    } else {
      alert(`👋 Bienvenue ${loggedUser.name} ! Vous êtes connecté en mode visiteur.`);
    }
  } catch (err) {
    alert("❌ " + err.message);
  }
}

// ── Vercel / Cloudflare Style GitHub Importer Modal ──
let loadedGithubReposList = [];

const FALLBACK_GITHUB_REPOS = [
  { name: "elearning-platform", language: "Java", updated_at: "2026-02-15" },
  { name: "projet-php", language: "PHP", updated_at: "2026-02-10" },
  { name: "projet-laravel", language: "PHP", updated_at: "2026-01-28" },
  { name: "tp-magasin", language: "Java", updated_at: "2026-01-20" },
  { name: "tp-poo", language: "Java", updated_at: "2026-01-15" },
  { name: "projet-symfony", language: "PHP", updated_at: "2025-12-18" },
  { name: "first-app-csharp", language: "C#", updated_at: "2025-11-20" },
  { name: "Portfolio", language: "JavaScript", updated_at: "2026-02-18" }
];

function openAddProjectModal() {
  document.getElementById("projectModalBackdrop").classList.add("active");
  loadVercelStyleGithubRepos();
}

function closeProjectModal() {
  document.getElementById("projectModalBackdrop").classList.remove("active");
}

async function loadVercelStyleGithubRepos() {
  const container = document.getElementById("vercelReposContainer");
  container.innerHTML = '<div style="text-align:center;padding:26px;color:#888;font-size:13px">⏳ Chargement de vos dépôts GitHub...</div>';

  try {
    const res = await fetch("https://api.github.com/users/malekabdelmaksoud/repos?sort=updated&per_page=30");
    if (!res.ok) throw new Error("Erreur de connexion à GitHub.");
    loadedGithubReposList = await res.json();
    if (!loadedGithubReposList || loadedGithubReposList.length === 0) {
      loadedGithubReposList = FALLBACK_GITHUB_REPOS;
    }
  } catch (err) {
    console.warn("Using fallback GitHub repos:", err);
    loadedGithubReposList = FALLBACK_GITHUB_REPOS;
  }
  renderVercelRepos(loadedGithubReposList);
}

function renderVercelRepos(repos) {
  const container = document.getElementById("vercelReposContainer");
  if (!repos || repos.length === 0) {
    container.innerHTML = '<div style="text-align:center;padding:20px;color:#666">Aucun dépôt trouvé.</div>';
    return;
  }

  const existingIds = ProjectsManager.getAll().map(p => p.name.toLowerCase());

  container.innerHTML = repos.map(r => {
    const isAdded = existingIds.includes(r.name.toLowerCase());
    const lang = r.language || 'Code';

    return `
      <div class="repo-card-vercel">
        <div class="repo-info-v">
          <strong>
            <span>📦</span> ${r.name}
            ${r.fork ? '<span style="font-size:10px;color:#a855f7">(fork)</span>' : ''}
          </strong>
          <span>${lang} • Mis à jour le ${new Date(r.updated_at).toLocaleDateString()}</span>
        </div>
        <div>
          ${isAdded 
            ? '<span style="color:#10b981;font-size:11.5px;font-weight:700">✓ Déjà sur le site</span>' 
            : `<button class="btn-import-v" onclick="importGithubRepoDirect('${r.name}')">Importer ⚡</button>`
          }
        </div>
      </div>
    `;
  }).join("");
}

function filterVercelRepos(val) {
  const q = val.trim().toLowerCase();
  const filtered = loadedGithubReposList.filter(r => r.name.toLowerCase().includes(q) || (r.language && r.language.toLowerCase().includes(q)));
  renderVercelRepos(filtered);
}

async function importGithubRepoDirect(repoName) {
  const container = document.getElementById("vercelReposContainer");
  const originalHtml = container.innerHTML;
  container.innerHTML = `<div style="text-align:center;padding:30px;color:#fff">⚡ Analyse de <b>${repoName}</b> & génération automatique de la description...</div>`;

  try {
    const details = await ProjectsManager.fetchGitHubDetails(repoName);
    const newProj = {
      id: "p_" + Date.now(),
      name: details.name,
      type: details.type,
      description: details.description,
      github: details.github
    };

    ProjectsManager.add(newProj);
    closeProjectModal();
    alert(`🎉 Le projet "${details.name}" a été importé avec succès !\nDescription générée automatiquement.`);
  } catch (err) {
    alert("Erreur lors de l'importation : " + err.message);
    container.innerHTML = originalHtml;
  }
}


// ── Project Edit Modal Logic ──
function openEditProjectModal(id) {
  const proj = ProjectsManager.getAll().find(p => p.id === id);
  if (!proj) return;

  document.getElementById("editProjId").value = proj.id;
  document.getElementById("editProjName").value = proj.name;
  document.getElementById("editProjType").value = proj.type;
  document.getElementById("editProjDesc").value = proj.description;
  document.getElementById("editProjGithub").value = proj.github;

  document.getElementById("editProjectModalBackdrop").classList.add("active");
}

function closeEditProjectModal() {
  document.getElementById("editProjectModalBackdrop").classList.remove("active");
}

function handleEditProjectSave(e) {
  e.preventDefault();
  const id = document.getElementById("editProjId").value;
  const updatedData = {
    name: document.getElementById("editProjName").value.trim(),
    type: document.getElementById("editProjType").value.trim(),
    description: document.getElementById("editProjDesc").value.trim(),
    github: document.getElementById("editProjGithub").value.trim()
  };

  ProjectsManager.update(id, updatedData);
  closeEditProjectModal();
}

function deleteProjectDirect(id) {
  if (confirm("Voulez-vous vraiment supprimer ce projet du portfolio ?")) {
    ProjectsManager.delete(id);
  }
}

// ── Profile Modal & Email OTP Password Reset Logic ──
let activeOtpCode = null;

function openProfileModal() {
  const user = AuthService.getCurrentUser();
  if (!user) return;

  document.getElementById("profName").textContent = user.name;
  document.getElementById("profEmail").textContent = user.email;
  document.getElementById("profRoleBadge").textContent = user.role.toUpperCase();
  document.getElementById("profRoleBadge").className = `role-badge ${user.role}`;
  document.getElementById("profAvatar").textContent = user.name.charAt(0).toUpperCase();

  // Reset password form state
  document.getElementById("stepSendOtp").style.display = "block";
  document.getElementById("stepVerifyOtp").style.display = "none";
  document.getElementById("profOtpNotice").style.display = "none";
  document.getElementById("profErrorMsg").style.display = "none";
  document.getElementById("inputOtpCode").value = "";
  document.getElementById("inputNewPassword").value = "";

  document.getElementById("profileModalBackdrop").classList.add("active");
}

function closeProfileModal() {
  document.getElementById("profileModalBackdrop").classList.remove("active");
}

function sendVerificationEmail() {
  const user = AuthService.getCurrentUser();
  if (!user) return;

  // Generate 6-digit OTP code
  activeOtpCode = Math.floor(100000 + Math.random() * 900000).toString();

  // Display simulated email delivery alert & banner with code
  const notice = document.getElementById("profOtpNotice");
  notice.innerHTML = `
    📧 <b>E-mail de sécurité envoyé à :</b> ${user.email}<br>
    Votre code de vérification est : <strong style="font-size:15px;color:#059669;letter-spacing:1px">${activeOtpCode}</strong>
  `;
  notice.style.display = "block";

  // Advance to step 2
  document.getElementById("stepSendOtp").style.display = "none";
  document.getElementById("stepVerifyOtp").style.display = "block";
}

function handlePasswordUpdate(e) {
  e.preventDefault();
  const enteredOtp = document.getElementById("inputOtpCode").value.trim();
  const newPass = document.getElementById("inputNewPassword").value;
  const errorDiv = document.getElementById("profErrorMsg");

  if (enteredOtp !== activeOtpCode) {
    errorDiv.textContent = "Code de vérification incorrect. Veuillez vérifier le code envoyé.";
    errorDiv.style.display = "block";
    return;
  }

  if (newPass.length < 4) {
    errorDiv.textContent = "Le mot de passe doit comporter au moins 4 caractères.";
    errorDiv.style.display = "block";
    return;
  }

  // Update password in AuthService storage
  const user = AuthService.getCurrentUser();
  const users = AuthService.getUsers();
  const target = users.find(u => u.email.toLowerCase() === user.email.toLowerCase());
  
  if (target) {
    target.password = newPass;
    AuthService.saveUsers(users);
  }

  alert("✅ Mot de passe mis à jour avec succès !");
  closeProfileModal();
}

// ── Global window handlers ──
window.handleGitHubOAuthLogin = handleGitHubOAuthLogin;
window.openAddProjectModal = openAddProjectModal;
window.closeProjectModal = closeProjectModal;
window.importGithubRepoDirect = importGithubRepoDirect;
window.filterVercelRepos = filterVercelRepos;
window.openEditProjectModal = openEditProjectModal;
window.closeEditProjectModal = closeEditProjectModal;
window.handleEditProjectSave = handleEditProjectSave;
window.deleteProjectDirect = deleteProjectDirect;
window.openProfileModal = openProfileModal;
window.closeProfileModal = closeProfileModal;
window.sendVerificationEmail = sendVerificationEmail;
window.handlePasswordUpdate = handlePasswordUpdate;

