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
          <span>👤 ${user.name}</span>
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
  if (document.getElementById("adminFloatingBar")) return;

  const bar = document.createElement("div");
  bar.id = "adminFloatingBar";
  bar.className = "admin-floating-add";
  bar.innerHTML = `
    <span>👑 <b>Admin Mode Actif</b></span>
    <button class="btn-admin-add" onclick="openAddProjectModal()">+ Lier Repos GitHub</button>
  `;
  document.body.appendChild(bar);
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
