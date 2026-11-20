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
  const authTitle = document.getElementById("authFormTitle");
  let mode = "login";

  if (tabLogin && tabRegister) {
    tabLogin.addEventListener("click", () => {
      mode = "login";
      tabLogin.classList.add("active");
      tabRegister.classList.remove("active");
      fieldNameGroup.style.display = "none";
      authSubmitBtn.textContent = "Se connecter";
      authTitle.textContent = "Connexion Requise";
      clearError();
    });

    tabRegister.addEventListener("click", () => {
      mode = "register";
      tabRegister.classList.add("active");
      tabLogin.classList.remove("active");
      fieldNameGroup.style.display = "block";
      authSubmitBtn.textContent = "Créer mon compte";
      authTitle.textContent = "Inscription Utilisateur";
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

function openAddProjectModal() {
  document.getElementById("projectModalTitle").textContent = "Lier un Dépôt GitHub (Auto Description)";
  document.getElementById("projEditId").value = "";
  document.getElementById("repoInput").value = "";
  document.getElementById("projName").value = "";
  document.getElementById("projType").value = "";
  document.getElementById("projDesc").value = "";
  document.getElementById("projGithub").value = "";
  document.getElementById("githubFetchGroup").style.display = "block";
  document.getElementById("projectModalBackdrop").classList.add("active");
}

function openEditProjectModal(id) {
  const p = ProjectsManager.getAll().find(item => item.id === id);
  if (!p) return;

  document.getElementById("projectModalTitle").textContent = "Modifier le Projet";
  document.getElementById("projEditId").value = p.id;
  document.getElementById("projName").value = p.name;
  document.getElementById("projType").value = p.type;
  document.getElementById("projDesc").value = p.description;
  document.getElementById("projGithub").value = p.github;
  document.getElementById("githubFetchGroup").style.display = "none";
  document.getElementById("projectModalBackdrop").classList.add("active");
}

function closeProjectModal() {
  document.getElementById("projectModalBackdrop").classList.remove("active");
}

async function handleFetchGitHubAuto() {
  const query = document.getElementById("repoInput").value.trim();
  if (!query) {
    alert("Veuillez saisir le nom ou l'URL du dépôt GitHub !");
    return;
  }

  const spinner = document.getElementById("repoFetchSpinner");
  if (spinner) spinner.style.display = "block";

  try {
    const details = await ProjectsManager.fetchGitHubDetails(query);
    document.getElementById("projName").value = details.name;
    document.getElementById("projType").value = details.type;
    document.getElementById("projDesc").value = details.description;
    document.getElementById("projGithub").value = details.github;
  } catch (err) {
    alert(err.message);
  } finally {
    if (spinner) spinner.style.display = "none";
  }
}

function saveProjectFromModal(e) {
  e.preventDefault();
  const id = document.getElementById("projEditId").value;
  const name = document.getElementById("projName").value.trim();
  const type = document.getElementById("projType").value.trim() || "PROJET · APPLICATION";
  const desc = document.getElementById("projDesc").value.trim();
  const github = document.getElementById("projGithub").value.trim();

  if (!name || !desc) {
    alert("Veuillez renseigner le nom et la description du projet !");
    return;
  }

  if (id) {
    // Update existing
    ProjectsManager.update(id, { name, type, description: desc, github });
  } else {
    // Add new
    const newProject = {
      id: "p_" + Date.now(),
      name,
      type,
      description: desc,
      github: github || `https://github.com/malekabdelmaksoud/${name}`
    };
    ProjectsManager.add(newProject);
  }

  closeProjectModal();
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

