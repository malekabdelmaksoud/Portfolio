// ── Modern In-App Toast Notification (Zero browser alert() popups) ──
function showToast(message, type = "success") {
  let toast = document.getElementById("portfolioToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "portfolioToast";
    document.body.appendChild(toast);
  }
  toast.className = `portfolio-toast ${type} show`;
  const icon = type === "error" ? "⚠️" : (type === "info" ? "ℹ️" : "✅");
  toast.innerHTML = `<span style="font-size:16px">${icon}</span> <span>${message}</span>`;

  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => {
    toast.classList.remove("show");
  }, 3500);
}

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
      authSubmitBtn.textContent = "Se connecter";
      if (authTitle) authTitle.textContent = "Log in to Portfolio";
      if (authSubtitle) authSubtitle.textContent = "Connectez-vous pour explorer le portfolio et les fonctionnalités.";
      clearError();
    });

    tabRegister.addEventListener("click", () => {
      mode = "register";
      tabRegister.classList.add("active");
      tabLogin.classList.remove("active");
      fieldNameGroup.style.display = "block";
      authSubmitBtn.textContent = "Créer mon compte";
      if (authTitle) authTitle.textContent = "Créer un compte";
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
        showToast(loggedUser.role === "admin" ? "👑 Bienvenue Melek Abdelmaksoud (Admin) !" : `👋 Bienvenue ${loggedUser.name} !`, "success");
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

// ── Multi-Platform Git Importer (GitHub & GitLab + Private Repos Support) ──
let currentGitPlatform = localStorage.getItem("portfolio_last_git_platform") || "github";
let loadedGitReposList = [];

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

function togglePrivateTokenBox() {
  const box = document.getElementById("privateTokenBox");
  const icon = document.getElementById("tokenToggleIcon");
  const tokenInput = document.getElementById("gitTokenInput");
  const status = document.getElementById("tokenActiveStatus");

  const isVisible = box.style.display === "block";
  box.style.display = isVisible ? "none" : "block";
  if (icon) icon.textContent = isVisible ? "▼" : "▲";

  if (!isVisible) {
    const key = currentGitPlatform === "github" ? "portfolio_github_token" : "portfolio_gitlab_token";
    const saved = localStorage.getItem(key) || "";
    if (tokenInput) tokenInput.value = saved;
    if (status) status.style.display = saved ? "block" : "none";
  }
}

function saveAndApplyGitToken() {
  const tokenInput = document.getElementById("gitTokenInput");
  const val = (tokenInput ? tokenInput.value.trim() : "");
  const key = currentGitPlatform === "github" ? "portfolio_github_token" : "portfolio_gitlab_token";

  if (val) {
    localStorage.setItem(key, val);
    showToast("🔑 Token enregistré ! Chargement de vos dépôts privés et publics...", "success");
  } else {
    localStorage.removeItem(key);
  }

  const status = document.getElementById("tokenActiveStatus");
  if (status) status.style.display = val ? "block" : "none";

  loadGitReposForActivePlatform();
}

function clearGitToken() {
  const key = currentGitPlatform === "github" ? "portfolio_github_token" : "portfolio_gitlab_token";
  localStorage.removeItem(key);
  const tokenInput = document.getElementById("gitTokenInput");
  if (tokenInput) tokenInput.value = "";
  const status = document.getElementById("tokenActiveStatus");
  if (status) status.style.display = "none";
  showToast("Token supprimé.", "info");
  loadGitReposForActivePlatform();
}

function switchGitPlatform(platform) {
  currentGitPlatform = platform;
  localStorage.setItem("portfolio_last_git_platform", platform);

  const btnGh = document.getElementById("btnPlatformGithub");
  const btnGl = document.getElementById("btnPlatformGitlab");
  const icon = document.getElementById("modalProviderIcon");
  const accInput = document.getElementById("gitAccountInput");
  const status = document.getElementById("tokenActiveStatus");
  const tokenInput = document.getElementById("gitTokenInput");

  const tokenKey = platform === "github" ? "portfolio_github_token" : "portfolio_gitlab_token";
  const savedToken = localStorage.getItem(tokenKey) || "";
  if (tokenInput) tokenInput.value = savedToken;
  if (status) status.style.display = savedToken ? "block" : "none";

  if (platform === "github") {
    if (btnGh) btnGh.classList.add("active");
    if (btnGl) btnGl.classList.remove("active");
    if (icon) icon.textContent = "🐙";
    if (accInput) {
      accInput.placeholder = "Nom d'utilisateur GitHub (ex: malekabdelmaksoud)";
      accInput.value = localStorage.getItem("portfolio_last_github_user") || "malekabdelmaksoud";
    }
  } else {
    if (btnGl) btnGl.classList.add("active");
    if (btnGh) btnGh.classList.remove("active");
    if (icon) icon.textContent = "🦊";
    if (accInput) {
      accInput.placeholder = "Nom d'utilisateur GitLab (ex: malekabdelmaksoud)";
      accInput.value = localStorage.getItem("portfolio_last_gitlab_user") || "malekabdelmaksoud";
    }
  }

  loadGitReposForActivePlatform();
}

function openAddProjectModal() {
  document.getElementById("projectModalBackdrop").classList.add("active");
  switchGitPlatform(currentGitPlatform);
}

function closeProjectModal() {
  document.getElementById("projectModalBackdrop").classList.remove("active");
}

async function loadGitReposForActivePlatform() {
  const container = document.getElementById("vercelReposContainer");
  const accInput = document.getElementById("gitAccountInput");
  const username = (accInput ? accInput.value.trim() : "") || "malekabdelmaksoud";
  const activeLabel = document.getElementById("gitActiveAccountLabel");

  if (currentGitPlatform === "github") {
    const ghToken = localStorage.getItem("portfolio_github_token");

    if (ghToken) {
      // Authenticated with Token -> returns ALL public AND private repos
      if (activeLabel) activeLabel.innerHTML = `Compte actif : <b>GitHub (Accès Privé 🔒 Actif)</b>`;
      container.innerHTML = `<div style="text-align:center;padding:26px;color:#888;font-size:13px">⏳ Chargement de tous vos dépôts GitHub (Publics + Privés)...</div>`;

      try {
        const res = await fetch("https://api.github.com/user/repos?sort=updated&per_page=100&affiliation=owner", {
          headers: {
            "Authorization": `Bearer ${ghToken}`,
            "Accept": "application/vnd.github+json"
          }
        });
        if (!res.ok) throw new Error("Token GitHub invalide ou expiré.");
        const list = await res.json();
        loadedGitReposList = list.map(r => ({
          id: r.id,
          name: r.name,
          platform: "GitHub",
          private: r.private === true,
          language: r.language || "Code",
          updated_at: r.updated_at,
          html_url: r.html_url,
          description: r.description
        }));
      } catch (err) {
        showToast("⚠️ " + err.message, "error");
        fetchGithubPublic(username, container);
        return;
      }
    } else {
      localStorage.setItem("portfolio_last_github_user", username);
      if (activeLabel) activeLabel.innerHTML = `Compte actif : <b>GitHub (${username})</b>`;
      fetchGithubPublic(username, container);
      return;
    }
  } else {
    // GitLab Platform
    const glToken = localStorage.getItem("portfolio_gitlab_token");

    if (glToken) {
      if (activeLabel) activeLabel.innerHTML = `Compte actif : <b>GitLab (Accès Privé 🔒 Actif)</b>`;
      container.innerHTML = `<div style="text-align:center;padding:26px;color:#888;font-size:13px">⏳ Chargement de tous vos projets GitLab (Publics + Privés)...</div>`;

      try {
        const res = await fetch("https://gitlab.com/api/v4/projects?membership=true&order_by=updated_at&per_page=100", {
          headers: { "PRIVATE-TOKEN": glToken }
        });
        if (!res.ok) throw new Error("Token GitLab invalide.");
        const projects = await res.json();
        loadedGitReposList = projects.map(p => ({
          id: p.id,
          name: p.name,
          platform: "GitLab",
          private: p.visibility === "private",
          language: "GitLab Project",
          updated_at: p.last_activity_at,
          html_url: p.web_url,
          description: p.description
        }));
      } catch (err) {
        showToast("⚠️ " + err.message, "error");
        fetchGitlabPublic(username, container, activeLabel);
        return;
      }
    } else {
      fetchGitlabPublic(username, container, activeLabel);
      return;
    }
  }

  renderVercelRepos(loadedGitReposList);
}

async function fetchGithubPublic(username, container) {
  container.innerHTML = `<div style="text-align:center;padding:26px;color:#888;font-size:13px">⏳ Chargement des dépôts GitHub publics (<b>${username}</b>)...</div>`;
  try {
    const res = await fetch(`https://api.github.com/users/${username}/repos?sort=updated&per_page=50`);
    if (!res.ok) throw new Error("Compte GitHub introuvable ou limite atteinte.");
    const list = await res.json();
    loadedGitReposList = list.map(r => ({
      id: r.id,
      name: r.name,
      platform: "GitHub",
      private: false,
      language: r.language || "Code",
      updated_at: r.updated_at,
      html_url: r.html_url,
      description: r.description
    }));
  } catch (err) {
    if (username.toLowerCase() === "malekabdelmaksoud") {
      loadedGitReposList = FALLBACK_GITHUB_REPOS.map(r => ({ ...r, platform: "GitHub", private: false, html_url: `https://github.com/malekabdelmaksoud/${r.name}` }));
    } else {
      container.innerHTML = `<div style="text-align:center;padding:26px;color:#ef4444;font-size:13px">⚠️ Compte GitHub introuvable ou aucun dépôt public disponible.</div>`;
      return;
    }
  }
  renderVercelRepos(loadedGitReposList);
}

async function fetchGitlabPublic(username, container, activeLabel) {
  localStorage.setItem("portfolio_last_gitlab_user", username);
  if (activeLabel) activeLabel.innerHTML = `Compte actif : <b>GitLab (${username})</b>`;
  container.innerHTML = `<div style="text-align:center;padding:26px;color:#888;font-size:13px">⏳ Chargement des projets GitLab publics (<b>${username}</b>)...</div>`;

  try {
    const userRes = await fetch(`https://gitlab.com/api/v4/users?username=${username}`);
    const users = await userRes.json();
    if (!users || users.length === 0) throw new Error("Utilisateur GitLab introuvable.");

    const userId = users[0].id;
    const projRes = await fetch(`https://gitlab.com/api/v4/users/${userId}/projects?order_by=updated_at&per_page=50`);
    const projects = await projRes.json();
    if (!projects || projects.length === 0) {
      container.innerHTML = `<div style="text-align:center;padding:26px;color:#888;font-size:13px">ℹ️ Aucun projet public trouvé sur GitLab pour <b>${username}</b>.</div>`;
      return;
    }
    loadedGitReposList = projects.map(p => ({
      id: p.id,
      name: p.name,
      platform: "GitLab",
      private: false,
      language: "GitLab Project",
      updated_at: p.last_activity_at,
      html_url: p.web_url,
      description: p.description
    }));
  } catch (err) {
    container.innerHTML = `<div style="text-align:center;padding:26px;color:#888;font-size:13px">ℹ️ Aucun projet public trouvé sur GitLab pour <b>${username}</b>.</div>`;
    return;
  }
  renderVercelRepos(loadedGitReposList);
}

function renderVercelRepos(repos) {
  const container = document.getElementById("vercelReposContainer");
  if (!repos || repos.length === 0) {
    container.innerHTML = '<div style="text-align:center;padding:26px;color:#666">Aucun dépôt trouvé pour ce compte.</div>';
    return;
  }

  const existingIds = ProjectsManager.getAll().map(p => p.name.toLowerCase());

  container.innerHTML = repos.map(r => {
    const isAdded = existingIds.includes(r.name.toLowerCase());
    const lang = r.language || 'Code';
    const platIcon = r.platform === 'GitLab' ? '🦊 GitLab' : '🐙 GitHub';
    const privBadge = r.private 
      ? '<span style="background:rgba(234,179,8,0.15);color:#eab308;border:1px solid rgba(234,179,8,0.3);padding:1px 6px;border-radius:4px;font-size:10px;font-weight:700;margin-left:6px">🔒 Privé</span>' 
      : '';

    return `
      <div class="repo-card-vercel">
        <div class="repo-info-v">
          <strong>
            <span>📦</span> ${r.name}
            <span style="font-size:10.5px;color:#888;font-weight:500;margin-left:6px">${platIcon}</span>
            ${privBadge}
          </strong>
          <span>${lang} • Mis à jour le ${new Date(r.updated_at).toLocaleDateString()}</span>
        </div>
        <div>
          ${isAdded 
            ? '<span style="color:#10b981;font-size:11.5px;font-weight:700">✓ Déjà sur le site</span>' 
            : `<button class="btn-import-v" onclick="importGitRepoDirect('${r.name.replace(/'/g, "\\'")}', '${r.platform}', '${r.html_url}', '${lang}', '${(r.description || '').replace(/'/g, "\\'")}', ${r.private === true})">Importer ⚡</button>`
          }
        </div>
      </div>
    `;
  }).join("");
}

function filterVercelRepos(val) {
  const q = val.trim().toLowerCase();
  const filtered = loadedGitReposList.filter(r => r.name.toLowerCase().includes(q) || (r.language && r.language.toLowerCase().includes(q)));
  renderVercelRepos(filtered);
}

async function importGitRepoDirect(name, platform, htmlUrl, lang, rawDesc, isPrivate = false) {
  const container = document.getElementById("vercelReposContainer");
  const originalHtml = container.innerHTML;
  container.innerHTML = `<div style="text-align:center;padding:30px;color:#fff">⚡ Analyse de <b>${name}</b> (${platform}) & génération automatique...</div>`;

  try {
    let cleanLang = lang || "Logiciel";
    let autoType = `${cleanLang.toUpperCase()} · ${isPrivate ? 'PROJET PRIVÉ' : platform.toUpperCase()}`;
    if (cleanLang === "PHP") autoType = isPrivate ? "PHP · PROJET PRIVÉ" : "PHP · FRAMEWORK & WEB";
    if (cleanLang === "Java") autoType = isPrivate ? "JAVA · PROJET PRIVÉ" : "JAVA · APPLICATION";
    if (cleanLang === "C#") autoType = isPrivate ? "C# · PROJET PRIVÉ" : "C# · .NET APPLICATION";
    if (cleanLang === "TypeScript" || cleanLang === "JavaScript") autoType = isPrivate ? "FULL STACK · PROJET PRIVÉ" : "FULL STACK · APPLICATION";

    let autoDesc = rawDesc && rawDesc.trim() 
      ? rawDesc.trim() 
      : `Projet ${isPrivate ? 'privé' : 'officiel'} hébergé sur ${platform} (${name}). Développé principalement avec ${cleanLang}, structuré selon les standards modernes d'architecture logicielle.`;

    const newProj = {
      id: "p_" + Date.now(),
      name: name,
      type: autoType,
      description: autoDesc,
      github: htmlUrl
    };

    ProjectsManager.add(newProj);
    closeProjectModal();
    showToast(`🎉 Le projet "${name}" ${isPrivate ? '(Privé 🔒)' : ''} a été importé avec succès !`, "success");
  } catch (err) {
    showToast("Erreur lors de l'importation : " + err.message, "error");
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
  showToast("💾 Projet mis à jour avec succès !", "success");
}

function deleteProjectDirect(id) {
  ProjectsManager.delete(id);
  showToast("🗑️ Projet supprimé du portfolio.", "info");
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

  // Show Admin GitHub section only for admin
  const ghSection = document.getElementById("profAdminGithubSection");
  if (ghSection) {
    ghSection.style.display = user.role === "admin" ? "block" : "none";
  }

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

  // Display simulated email delivery banner with code
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

  showToast("✅ Mot de passe mis à jour avec succès !", "success");
  closeProfileModal();
}

// ── Global window handlers ──
window.showToast = showToast;
window.togglePrivateTokenBox = togglePrivateTokenBox;
window.saveAndApplyGitToken = saveAndApplyGitToken;
window.clearGitToken = clearGitToken;
window.switchGitPlatform = switchGitPlatform;
window.loadGitReposForActivePlatform = loadGitReposForActivePlatform;
window.openAddProjectModal = openAddProjectModal;
window.closeProjectModal = closeProjectModal;
window.importGitRepoDirect = importGitRepoDirect;
window.importGithubRepoDirect = importGitRepoDirect;
window.filterVercelRepos = filterVercelRepos;
window.openEditProjectModal = openEditProjectModal;
window.closeEditProjectModal = closeEditProjectModal;
window.handleEditProjectSave = handleEditProjectSave;
window.deleteProjectDirect = deleteProjectDirect;
window.openProfileModal = openProfileModal;
window.closeProfileModal = closeProfileModal;
window.sendVerificationEmail = sendVerificationEmail;
window.handlePasswordUpdate = handlePasswordUpdate;

