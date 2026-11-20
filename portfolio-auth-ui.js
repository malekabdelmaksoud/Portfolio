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
  // A personal portfolio is public content: never block visitors behind a client-side login.
  // Client-side roles are not a security boundary and must not grant administrative access.
  const overlay = document.getElementById("authGateOverlay");
  const navContainer = document.getElementById("navUserSlot");
  if (overlay) overlay.style.display = "none";
  if (navContainer) navContainer.replaceChildren();
  // Remove legacy browser-only credentials and sessions from earlier versions.
  try {
    localStorage.removeItem("portfolio_registered_users");
    localStorage.removeItem("portfolio_active_session");
    localStorage.removeItem("portfolio_resend_api_key");
  } catch (error) {
    console.warn("Could not clear legacy portfolio session data.", error);
  }
  const user = null;

  if (false && user) {
    if (overlay) overlay.style.display = "none";
    if (navContainer) {
      const isAdmin = user.role === "admin";
      navContainer.innerHTML = `
        <div class="user-nav-status">
          <button type="button" class="btn-cv-quick-nav" onclick="openCvModal(event)" title="Consulter et télécharger le CV">📄 CV (PDF)</button>
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

// ── Multi-Platform Git Importer (Real Cloudflare & Vercel OAuth Flow) ──
let currentGitPlatform = localStorage.getItem("portfolio_last_git_platform") || "github";
let loadedGitReposList = [];

const FALLBACK_GITHUB_REPOS = [
  { name: "opportunity-hunter", language: "TypeScript", updated_at: "2026-11-19" },
  { name: "spring-boot-student-project", language: "Java", updated_at: "2026-11-18" },
  { name: "firstappmobile", language: "Java", updated_at: "2026-11-18" },
  { name: "projet-symfony", language: "PHP", updated_at: "2026-11-18" },
  { name: "tp-poo", language: "Java", updated_at: "2026-11-18" },
  { name: "Portfolio", language: "HTML", updated_at: "2026-11-18" },
  { name: "laravel", language: "PHP", updated_at: "2026-10-30" },
  { name: "projetphp", language: "CSS", updated_at: "2026-10-19" },
  { name: "elearning-platform", language: "Java", updated_at: "2026-10-19" },
  { name: "firstApp", language: "C#", updated_at: "2026-01-16" },
  { name: "tpmagasin", language: "Java", updated_at: "2025-10-28" }
];

function authorizeWithPlatform(platform) {
  currentGitPlatform = platform;
  localStorage.setItem("portfolio_last_git_platform", platform);

  const btnGh = document.getElementById("btnConnectGithub");
  const btnGl = document.getElementById("btnConnectGitlab");
  const icon = document.getElementById("modalProviderIcon");

  if (platform === "github") {
    if (btnGh) btnGh.classList.add("active");
    if (btnGl) btnGl.classList.remove("active");
    if (icon) icon.textContent = "🐙";
    
    // Ouvre la page officielle des autorisations GitHub Apps (où GitHub demande l'accès à tous les dépôts ou une sélection)
    const githubAppUrl = "https://github.com/settings/installations";
    window.open(githubAppUrl, "_blank", "width=850,height=800,menubar=no,toolbar=no");
    showToast("🔗 Ouverture de la page officielle d'autorisation GitHub...", "info");
  } else {
    if (btnGl) btnGl.classList.add("active");
    if (btnGh) btnGh.classList.remove("active");
    if (icon) icon.textContent = "🦊";
    
    const gitlabAppUrl = "https://gitlab.com/-/profile/applications";
    window.open(gitlabAppUrl, "_blank", "width=850,height=800,menubar=no,toolbar=no");
    showToast("🔗 Ouverture de la page officielle d'autorisation GitLab...", "info");
  }

  loadGitReposForActivePlatform();
}

function changeGitAccountPrompt() {
  const current = currentGitPlatform === "github" 
    ? (localStorage.getItem("portfolio_last_github_user") || "malekabdelmaksoud")
    : (localStorage.getItem("portfolio_last_gitlab_user") || "malekabdelmaksoud");
    
  const newAccount = prompt(`Entrez le compte ${currentGitPlatform.toUpperCase()} à connecter :`, current);
  if (newAccount && newAccount.trim()) {
    const key = currentGitPlatform === "github" ? "portfolio_last_github_user" : "portfolio_last_gitlab_user";
    localStorage.setItem(key, newAccount.trim());
    loadGitReposForActivePlatform();
    showToast(`Compte mis à jour : ${newAccount.trim()}`, "success");
  }
}

function openAddProjectModal() {
  document.getElementById("projectModalBackdrop").classList.add("active");
  loadGitReposForActivePlatform();
}

function closeProjectModal() {
  document.getElementById("projectModalBackdrop").classList.remove("active");
}

async function loadGitReposForActivePlatform() {
  const container = document.getElementById("vercelReposContainer");
  const activeLabel = document.getElementById("gitActiveAccountLabel");
  const btnGh = document.getElementById("btnConnectGithub");
  const btnGl = document.getElementById("btnConnectGitlab");
  const icon = document.getElementById("modalProviderIcon");

  if (currentGitPlatform === "github") {
    if (btnGh) btnGh.classList.add("active");
    if (btnGl) btnGl.classList.remove("active");
    if (icon) icon.textContent = "🐙";
    const username = localStorage.getItem("portfolio_last_github_user") || "malekabdelmaksoud";
    if (activeLabel) activeLabel.innerHTML = `Compte connecté : <b>GitHub (${username})</b>`;
    container.innerHTML = `<div style="text-align:center;padding:26px;color:#888;font-size:13px">⏳ Chargement de vos dépôts autorisés (${username})...</div>`;

    try {
      const res = await fetch(`https://api.github.com/users/${username}/repos?sort=updated&per_page=100`);
      if (!res.ok) throw new Error("Compte GitHub introuvable ou limite atteinte.");
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
      if (username.toLowerCase() === "malekabdelmaksoud") {
        loadedGitReposList = FALLBACK_GITHUB_REPOS.map(r => ({ ...r, platform: "GitHub", private: false, html_url: `https://github.com/malekabdelmaksoud/${r.name}` }));
      } else {
        container.innerHTML = `<div style="text-align:center;padding:26px;color:#ef4444;font-size:13px">⚠️ Aucun dépôt trouvé pour ce compte.</div>`;
        return;
      }
    }
  } else {
    // GitLab Platform
    if (btnGl) btnGl.classList.add("active");
    if (btnGh) btnGh.classList.remove("active");
    if (icon) icon.textContent = "🦊";
    const username = localStorage.getItem("portfolio_last_gitlab_user") || "malekabdelmaksoud";
    if (activeLabel) activeLabel.innerHTML = `Compte connecté : <b>GitLab (${username})</b>`;
    container.innerHTML = `<div style="text-align:center;padding:26px;color:#888;font-size:13px">⏳ Chargement des projets GitLab (${username})...</div>`;

    try {
      const userRes = await fetch(`https://gitlab.com/api/v4/users?username=${username}`);
      const users = await userRes.json();
      if (!users || users.length === 0) throw new Error("Utilisateur GitLab introuvable.");

      const userId = users[0].id;
      const projRes = await fetch(`https://gitlab.com/api/v4/users/${userId}/projects?order_by=updated_at&per_page=50`);
      const projects = await projRes.json();
      if (!projects || projects.length === 0) {
        container.innerHTML = `<div style="text-align:center;padding:26px;color:#888;font-size:13px">ℹ️ Aucun projet trouvé sur GitLab pour <b>${username}</b>.</div>`;
        return;
      }
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
      container.innerHTML = `<div style="text-align:center;padding:26px;color:#888;font-size:13px">ℹ️ Aucun projet public trouvé sur GitLab pour <b>${username}</b>.</div>`;
      return;
    }
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

async function dispatchSecurityEmail() {
  // Public static portfolios must never send credentials directly from the browser.
  return { success: false, reason: "server_side_email_auth_required" };
}

function saveEmailApiKey() {
  try { localStorage.removeItem("portfolio_resend_api_key"); } catch (error) {}
  showToast("La configuration e-mail côté navigateur est désactivée. Utilisez un service côté serveur.", "info");
}

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

  const emailSection = document.getElementById("profAdminEmailSection");
  if (emailSection) {
    emailSection.style.display = user.role === "admin" ? "block" : "none";
    const apiKeyInput = document.getElementById("inputResendApiKey");
    if (apiKeyInput) apiKeyInput.value = localStorage.getItem("portfolio_resend_api_key") || "";
  }

  // Admin directly changes password without waiting for OTP; Regular user needs Admin-sent OTP
  const isAdmin = user.role === "admin";
  const passSubtitle = document.getElementById("profPassSubtitle");
  const stepAdminDirect = document.getElementById("stepAdminDirectPass");
  const stepSendOtp = document.getElementById("stepSendOtp");
  const stepVerifyOtp = document.getElementById("stepVerifyOtp");
  const notice = document.getElementById("profOtpNotice");
  const errorDiv = document.getElementById("profErrorMsg");

  if (notice) notice.style.display = "none";
  if (errorDiv) errorDiv.style.display = "none";
  if (document.getElementById("inputOtpCode")) document.getElementById("inputOtpCode").value = "";
  if (document.getElementById("inputNewPassword")) document.getElementById("inputNewPassword").value = "";
  if (document.getElementById("inputAdminDirectPassword")) document.getElementById("inputAdminDirectPassword").value = "";

  if (isAdmin) {
    if (passSubtitle) passSubtitle.textContent = "👑 Compte Administrateur : Vous pouvez changer votre mot de passe directement sans code de vérification.";
    if (stepAdminDirect) stepAdminDirect.style.display = "block";
    if (stepSendOtp) stepSendOtp.style.display = "none";
    if (stepVerifyOtp) stepVerifyOtp.style.display = "none";
  } else {
    if (passSubtitle) passSubtitle.textContent = "🔒 Par mesure de sécurité, un code de vérification est envoyé directement à votre adresse e-mail.";
    if (stepAdminDirect) stepAdminDirect.style.display = "none";
    if (stepSendOtp) stepSendOtp.style.display = "block";
    if (stepVerifyOtp) stepVerifyOtp.style.display = "none";
  }

  document.getElementById("profileModalBackdrop").classList.add("active");
}

function closeProfileModal() {
  document.getElementById("profileModalBackdrop").classList.remove("active");
}

function handleAdminPasswordDirectUpdate(e) {
  e.preventDefault();
  const newPass = document.getElementById("inputAdminDirectPassword").value;
  const errorDiv = document.getElementById("profErrorMsg");

  if (!newPass || newPass.length < 4) {
    errorDiv.textContent = "Le mot de passe doit comporter au moins 4 caractères.";
    errorDiv.style.display = "block";
    return;
  }

  const user = AuthService.getCurrentUser();
  if (user) {
    AuthService.updatePassword(user.email, newPass);
  }

  showToast("👑 Mot de passe Administrateur mis à jour avec succès !", "success");
  closeProfileModal();
}

async function sendVerificationEmail() {
  const user = AuthService.getCurrentUser();
  if (!user) return;

  // Generate 6-digit OTP code
  activeOtpCode = Math.floor(100000 + Math.random() * 900000).toString();

  showToast(`⏳ Envoi du code de sécurité à ${user.email}...`, "info");
  const result = await dispatchSecurityEmail(user.email, activeOtpCode);

  const notice = document.getElementById("profOtpNotice");
  if (result.success) {
    showToast(`📨 Code de sécurité envoyé à : ${user.email}`, "success");
    notice.innerHTML = `
      <div style="background:#ecfdf5;border:1px solid #6ee7b7;border-radius:10px;padding:12px 14px;color:#065f46">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <span style="font-size:16px">📩</span>
          <strong style="font-size:13px">Code de sécurité envoyé par e-mail !</strong>
        </div>
        <div style="font-size:12px;line-height:1.5">
          Un e-mail contenant votre code de vérification confidentiel à 6 chiffres a été expédié à :<br>
          <b style="color:#047857">${user.email}</b>
        </div>
        <div style="font-size:11px;color:#059669;margin-top:6px;border-top:1px dashed #a7f3d0;padding-top:6px">
          🔒 Veuillez vérifier votre <b>boîte de réception</b> ou dossier <b>Spam</b> et saisir le code reçu ci-dessous.
        </div>
      </div>
    `;
  } else {
    showToast(`⚠️ Service d'e-mail non connecté`, "error");
    notice.innerHTML = `
      <div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:10px;padding:12px 14px;color:#991b1b">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <span style="font-size:16px">⚠️</span>
          <strong style="font-size:13px">Clé d'envoi d'e-mails non configurée</strong>
        </div>
        <div style="font-size:11.5px;line-height:1.5">
          L'envoi automatique d'e-mails réels vers <b>${user.email}</b> nécessite d'enregistrer une clé d'envoi gratuite (Brevo ou Resend) dans la section d'administration ci-dessous.
        </div>
      </div>
    `;
  }
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
    errorDiv.textContent = "Code de vérification incorrect. Veuillez vérifier le code envoyé par e-mail.";
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
  if (user) {
    AuthService.updatePassword(user.email, newPass);
  }

  showToast("✅ Mot de passe mis à jour avec succès !", "success");
  closeProfileModal();
}

// ── Forgot Password Flow (from Login Gate) ──
let forgotOtpCode = null;
let forgotTargetEmail = null;

function openForgotView(e) {
  if (e) e.preventDefault();
  const mainCont = document.getElementById("authMainContainer");
  const forgotCont = document.getElementById("authForgotContainer");
  const emailInput = document.getElementById("authEmail");
  const forgotEmailInput = document.getElementById("forgotInputEmail");

  if (emailInput && forgotEmailInput && emailInput.value.trim()) {
    forgotEmailInput.value = emailInput.value.trim();
  }

  // Reset forgot view state
  const banner = document.getElementById("forgotBannerNotice");
  const adminSec = document.getElementById("forgotAdminSection");
  const userSec = document.getElementById("forgotUserSection");
  const errorDiv = document.getElementById("forgotErrorMsg");
  const submitBtn = document.getElementById("forgotSubmitBtn");

  if (banner) banner.style.display = "none";
  if (adminSec) adminSec.style.display = "none";
  if (userSec) userSec.style.display = "none";
  if (errorDiv) errorDiv.style.display = "none";
  if (submitBtn) submitBtn.textContent = "Continuer";

  forgotOtpCode = null;
  forgotTargetEmail = null;

  if (mainCont) mainCont.style.display = "none";
  if (forgotCont) forgotCont.style.display = "block";
}

function backToLoginView(e) {
  if (e) e.preventDefault();
  const mainCont = document.getElementById("authMainContainer");
  const forgotCont = document.getElementById("authForgotContainer");
  if (forgotCont) forgotCont.style.display = "none";
  if (mainCont) mainCont.style.display = "block";
}

async function handleForgotRequest(e) {
  e.preventDefault();
  const email = document.getElementById("forgotInputEmail").value.trim().toLowerCase();
  const errorDiv = document.getElementById("forgotErrorMsg");
  const banner = document.getElementById("forgotBannerNotice");
  const adminSec = document.getElementById("forgotAdminSection");
  const userSec = document.getElementById("forgotUserSection");
  const submitBtn = document.getElementById("forgotSubmitBtn");

  errorDiv.style.display = "none";

  const isAdmin = email === ADMIN_EMAIL.toLowerCase() || email === "malekabdelmaksoud";
  const users = AuthService.getUsers();
  const account = users.find(u => u.email.toLowerCase() === email);

  if (!isAdmin && !account) {
    errorDiv.textContent = "Aucun compte trouvé avec cet e-mail. Veuillez vérifier l'adresse ou vous inscrire.";
    errorDiv.style.display = "block";
    return;
  }

  forgotTargetEmail = email;

  // Step 1: Detect user vs admin
  if (adminSec.style.display !== "block" && userSec.style.display !== "block") {
    if (isAdmin) {
      adminSec.style.display = "block";
      userSec.style.display = "none";
      banner.style.display = "none";
      submitBtn.textContent = "⚡ Enregistrer le nouveau mot de passe";
      const passField = document.getElementById("forgotAdminNewPass");
      if (passField) {
        passField.value = "";
        passField.focus();
      }
    } else {
      forgotOtpCode = Math.floor(100000 + Math.random() * 900000).toString();

      showToast(`⏳ Envoi du code de sécurité à ${email}...`, "info");
      const result = await dispatchSecurityEmail(email, forgotOtpCode);

      if (result.success) {
        showToast(`📨 Code de sécurité envoyé à : ${email}`, "success");
        banner.innerHTML = `
          <div style="background:#064e3b;border:1px solid #059669;border-radius:10px;padding:12px 14px;color:#ecfdf5;text-align:left">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
              <span style="font-size:16px">📩</span>
              <strong style="font-size:13px;color:#34d399">Code de sécurité envoyé par e-mail !</strong>
            </div>
            <div style="font-size:12px;line-height:1.5;color:#d1fae5">
              Un e-mail contenant votre code confidentiel à 6 chiffres a été expédié à :<br>
              <b style="color:#6ee7b7">${email}</b>
            </div>
            <div style="font-size:11px;color:#a7f3d0;margin-top:6px;border-top:1px dashed #047857;padding-top:6px">
              🔒 Veuillez consulter votre <b>boîte de réception</b> ou dossier <b>Spam</b> et saisir le code reçu.
            </div>
          </div>
        `;
      } else {
        showToast(`⚠️ Service d'envoi non configuré`, "error");
        banner.innerHTML = `
          <div style="background:#451a03;border:1px solid #b45309;border-radius:10px;padding:12px 14px;color:#fef3c7;text-align:left">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
              <span style="font-size:16px">⚠️</span>
              <strong style="font-size:13px;color:#f59e0b">Service d'envoi d'e-mails non configuré</strong>
            </div>
            <div style="font-size:11.5px;line-height:1.5;color:#fde68a">
              L'envoi automatique d'e-mails vers <b>${email}</b> nécessite l'enregistrement d'une clé API gratuite (Brevo ou Resend) par l'administrateur. Veuillez contacter l'administrateur : <b>melekabdelmaksoud72@gmail.com</b>
            </div>
          </div>
        `;
      }

      banner.style.display = "block";
      userSec.style.display = "block";
      adminSec.style.display = "none";
      submitBtn.textContent = "Confirmer et réinitialiser";
      const otpField = document.getElementById("forgotUserOtpCode");
      if (otpField) {
        otpField.value = "";
        otpField.focus();
      }
    }
    return;
  }

  // Step 2: Process Reset
  if (isAdmin && adminSec.style.display === "block") {
    const newPass = document.getElementById("forgotAdminNewPass").value;
    if (!newPass || newPass.length < 4) {
      errorDiv.textContent = "Le mot de passe doit comporter au moins 4 caractères.";
      errorDiv.style.display = "block";
      return;
    }
    AuthService.updatePassword(ADMIN_EMAIL, newPass);
    showToast("👑 Mot de passe Administrateur réinitialisé avec succès !", "success");
    
    // Auto fill login & back
    backToLoginView();
    const loginEmail = document.getElementById("authEmail");
    const loginPass = document.getElementById("authPassword");
    if (loginEmail) loginEmail.value = ADMIN_EMAIL;
    if (loginPass) loginPass.value = newPass;
    return;
  }

  if (!isAdmin && userSec.style.display === "block") {
    const enteredOtp = document.getElementById("forgotUserOtpCode").value.trim();
    const newPass = document.getElementById("forgotUserNewPass").value;

    if (enteredOtp !== forgotOtpCode) {
      errorDiv.textContent = "Code de vérification incorrect. Veuillez vérifier le code reçu par e-mail.";
      errorDiv.style.display = "block";
      return;
    }

    if (!newPass || newPass.length < 4) {
      errorDiv.textContent = "Le mot de passe doit comporter au moins 4 caractères.";
      errorDiv.style.display = "block";
      return;
    }

    AuthService.updatePassword(forgotTargetEmail, newPass);
    showToast("✅ Mot de passe réinitialisé avec succès ! Connectez-vous.", "success");

    // Auto fill login & back
    backToLoginView();
    const loginEmail = document.getElementById("authEmail");
    const loginPass = document.getElementById("authPassword");
    if (loginEmail) loginEmail.value = forgotTargetEmail;
    if (loginPass) loginPass.value = newPass;
    return;
  }
}

// ── Global window handlers ──
window.showToast = showToast;
window.authorizeWithPlatform = authorizeWithPlatform;
window.changeGitAccountPrompt = changeGitAccountPrompt;
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
window.handleAdminPasswordDirectUpdate = handleAdminPasswordDirectUpdate;
window.openForgotView = openForgotView;
window.backToLoginView = backToLoginView;
window.handleForgotRequest = handleForgotRequest;
window.saveEmailApiKey = saveEmailApiKey;

