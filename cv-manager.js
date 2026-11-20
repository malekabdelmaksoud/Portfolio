/**
 * cv-manager.js
 * توليد السيرة الذاتية تلقائياً من البروجيات والمهارات (CV Generator)
 * - توليد تلقائي للـ CV من مشاريع الموقع (ProjectsManager) والمهارات
 * - الأدمن (Admin) يمكنه تعديل كل الأقسام وحفظها أو إعادة التوليد من المشاريع
 * - المستخدم العادي (Normal User) له حق المشاهدة والتحميل بصيغة PDF فقط
 */

const CvManager = {
  getDefaultData() {
    // Dynamically pull latest projects and skills from ProjectsManager
    const projects = (typeof ProjectsManager !== "undefined") ? ProjectsManager.getAll() : [];
    
    // Extract dynamic skills
    const baseLanguages = "Java · PHP · C · C# · Python · JavaScript";
    const baseWeb = "HTML · CSS · Angular";
    const baseFrameworks = "Laravel · Symfony · Spring Boot · .NET · Android Studio";
    const baseSystemes = "Maintenance informatique · Câblage réseau · OCS Inventory";

    const elLang = document.getElementById("skillsLangagesList");
    const elWeb = document.getElementById("skillsWebList");
    const elFw = document.getElementById("skillsFrameworksList");
    const elSys = document.getElementById("skillsSystemesList");

    const dynamicLanguages = elLang ? elLang.textContent : baseLanguages;
    const dynamicWeb = elWeb ? elWeb.textContent : baseWeb;
    const dynamicFrameworks = elFw ? elFw.textContent : baseFrameworks;
    const dynamicSystemes = elSys ? elSys.textContent : baseSystemes;

    return {
      personal: {
        name: "Melek Abdelmaksoud",
        title: "Étudiante en Technologie de l'Informatique — Développement Web & Multimédia",
        email: "melekabdelmaksoud72@gmail.com",
        location: "Sfax, Tunisie",
        linkedin: "https://www.linkedin.com/in/melek-abdelmaksoud-518713436/",
        linkedinLabel: "linkedin.com/in/melek-abdelmaksoud",
        github: "https://github.com/malekabdelmaksoud",
        githubLabel: "github.com/malekabdelmaksoud",
        summary: "Étudiante passionnée par le développement web et le génie logiciel à l'ISET de Sidi Bouzid. Rigoureuse, curieuse et dotée d'une grande capacité d'apprentissage, j'ai développé des compétences solides en Java, PHP (Laravel, Symfony), C# et technologies Web à travers mes formations, stages pratiques et projets personnels."
      },
      skills: {
        languages: dynamicLanguages,
        web: dynamicWeb,
        frameworks: dynamicFrameworks,
        systems: dynamicSystemes
      },
      projects: projects.map(p => ({
        id: p.id,
        name: p.name,
        type: p.type,
        description: p.description,
        github: p.github
      })),
      experiences: [
        {
          role: "Stage en Informatique & DMI",
          company: "Hôpital Hédi Chaker · Sfax",
          period: "Juil. – Août 2026",
          description: "Configuration d'une application de soins, prise en main du Dossier Médical Informatisé (DMI) et utilisation d'OCS Inventory pour la gestion du parc informatique."
        },
        {
          role: "Stage en Développement Web",
          company: "Advanced Computer Solutions (ACS)",
          period: "Janv. 2026",
          description: "Immersion professionnelle au sein d'une équipe technique, découverte du cycle de développement web et intégration d'interfaces."
        },
        {
          role: "Stage en Réseaux & Télécoms",
          company: "Netsys Com Support",
          period: "Juin – Juil. 2025",
          description: "Initiation aux opérations de câblage réseau, brassage de baies et découverte des équipements d'infrastructure."
        },
        {
          role: "Stage en Maintenance Informatique",
          company: "CISEN",
          period: "Janv. – Févr. 2025",
          description: "Diagnostic, maintenance préventive et curative matérielle/logicielle, installation et configuration de postes de travail."
        }
      ],
      education: [
        {
          degree: "Licence en Technologie de l'Informatique (DSI / Web)",
          school: "ISET de Sidi Bouzid",
          period: "2024 – Présent",
          description: "Parcours Web & Multimédia : Programmation objet, architectures web, bases de données et conception logicielle."
        },
        {
          degree: "Baccalauréat – Sciences expérimentales",
          school: "Lycée Tayeb Mhiri, Sfax",
          period: "2023 – 2024",
          description: "Formation scientifique développant la logique, la rigueur et l'analyse méthodique."
        }
      ],
      languages: [
        { name: "Arabe", level: "Langue maternelle" },
        { name: "Français", level: "Courant / Professionnel" },
        { name: "Anglais", level: "Technique & Professionnel" },
        { name: "Espagnol", level: "Notions de base" }
      ],
      strengths: ["Travail en équipe", "Autonomie", "Rigueur", "Adaptabilité", "Résolution de problèmes"]
    };
  },

  getData() {
    try {
      const saved = localStorage.getItem("portfolio_cv_custom_data");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (!parsed.projects || parsed.projects.length === 0) {
          parsed.projects = (typeof ProjectsManager !== "undefined") ? ProjectsManager.getAll() : [];
        }
        return parsed;
      }
    } catch (e) {
      console.warn("CV data parse error:", e);
    }
    return this.getDefaultData();
  },

  saveData(data) {
    localStorage.setItem("portfolio_cv_custom_data", JSON.stringify(data));
  },

  syncFromProjects() {
    const data = this.getData();
    if (typeof ProjectsManager !== "undefined") {
      data.projects = ProjectsManager.getAll().map(p => ({
        id: p.id,
        name: p.name,
        type: p.type,
        description: p.description,
        github: p.github
      }));

      // Refresh skills
      const elLang = document.getElementById("skillsLangagesList");
      const elWeb = document.getElementById("skillsWebList");
      const elFw = document.getElementById("skillsFrameworksList");
      const elSys = document.getElementById("skillsSystemesList");

      if (elLang) data.skills.languages = elLang.textContent;
      if (elWeb) data.skills.web = elWeb.textContent;
      if (elFw) data.skills.frameworks = elFw.textContent;
      if (elSys) data.skills.systems = elSys.textContent;

      this.saveData(data);
      this.render();
      if (typeof showToast === "function") {
        showToast("🔄 CV synchronisé automatiquement avec les projets du portfolio !", "success");
      }
    }
  },

  resetToDefault() {
    localStorage.removeItem("portfolio_cv_custom_data");
    this.render();
    if (typeof showToast === "function") {
      showToast("↺ CV réinitialisé avec les données par défaut du portfolio.", "info");
    }
  },

  render(isEditing = false) {
    const container = document.getElementById("cvPrintableArea");
    if (!container) return;

    const data = this.getData();
    const isAdmin = (typeof AuthService !== "undefined" && AuthService.isAdmin());

    // Update Modal Toolbar according to Role
    const toolbarTools = document.getElementById("cvAdminToolbar");
    if (toolbarTools) {
      if (isAdmin) {
        toolbarTools.style.display = "flex";
        toolbarTools.innerHTML = `
          ${isEditing ? `
            <button type="button" class="btn-cv-action save" onclick="saveCvEdits()">💾 Enregistrer</button>
            <button type="button" class="btn-cv-action cancel" onclick="cancelCvEdits()">✕ Annuler</button>
          ` : `
            <button type="button" class="btn-cv-action edit" onclick="toggleCvEditMode(true)">✏️ Modifier le CV</button>
            <button type="button" class="btn-cv-action sync" onclick="CvManager.syncFromProjects()" title="Mettre à jour avec les nouveaux projets">🔄 Actualiser Projets</button>
            <button type="button" class="btn-cv-action reset" onclick="CvManager.resetToDefault()" title="Réinitialiser">↺ Défaut</button>
          `}
        `;
      } else {
        toolbarTools.style.display = "none";
      }
    }

    if (isEditing && isAdmin) {
      // Admin Edit Form View
      container.innerHTML = `
        <div class="cv-edit-wrapper">
          <div class="cv-edit-header-alert">
            👑 <b>Mode Édition Administrateur :</b> Vous pouvez modifier tous les textes et détails du CV ci-dessous. Vos modifications seront enregistrées et visibles par les visiteurs.
          </div>
          
          <form id="cvEditForm" onsubmit="handleCvFormSubmit(event)">
            <h4 class="cv-edit-sec-title">1. Informations Personnelles & En-tête</h4>
            <div class="cv-form-row">
              <div class="cv-form-group">
                <label>Nom complet</label>
                <input type="text" id="cvEditName" value="${data.personal.name}" class="cv-form-input" required>
              </div>
              <div class="cv-form-group">
                <label>Titre professionnel</label>
                <input type="text" id="cvEditTitle" value="${data.personal.title}" class="cv-form-input" required>
              </div>
            </div>

            <div class="cv-form-row">
              <div class="cv-form-group">
                <label>E-mail</label>
                <input type="email" id="cvEditEmail" value="${data.personal.email}" class="cv-form-input" required>
              </div>
              <div class="cv-form-group">
                <label>Ville & Pays</label>
                <input type="text" id="cvEditLocation" value="${data.personal.location}" class="cv-form-input" required>
              </div>
            </div>

            <div class="cv-form-row">
              <div class="cv-form-group">
                <label>Lien LinkedIn</label>
                <input type="url" id="cvEditLinkedin" value="${data.personal.linkedin}" class="cv-form-input">
              </div>
              <div class="cv-form-group">
                <label>Lien GitHub</label>
                <input type="url" id="cvEditGithub" value="${data.personal.github}" class="cv-form-input">
              </div>
            </div>

            <div class="cv-form-group">
              <label>Profil Professionnel (Résumé)</label>
              <textarea id="cvEditSummary" class="cv-form-input" rows="3" required>${data.personal.summary}</textarea>
            </div>

            <h4 class="cv-edit-sec-title">2. Compétences Techniques (Synchronisées)</h4>
            <div class="cv-form-row">
              <div class="cv-form-group">
                <label>Langages de programmation</label>
                <input type="text" id="cvEditLang" value="${data.skills.languages}" class="cv-form-input" required>
              </div>
              <div class="cv-form-group">
                <label>Technologies Web</label>
                <input type="text" id="cvEditWeb" value="${data.skills.web}" class="cv-form-input" required>
              </div>
            </div>
            <div class="cv-form-row">
              <div class="cv-form-group">
                <label>Frameworks & Outils</label>
                <input type="text" id="cvEditFw" value="${data.skills.frameworks}" class="cv-form-input" required>
              </div>
              <div class="cv-form-group">
                <label>Systèmes & Réseaux</label>
                <input type="text" id="cvEditSys" value="${data.skills.systems}" class="cv-form-input" required>
              </div>
            </div>

            <h4 class="cv-edit-sec-title">3. Projets dans le CV (${data.projects.length} projets inclus)</h4>
            <div id="cvEditProjectsList">
              ${data.projects.map((p, idx) => `
                <div class="cv-edit-card-item">
                  <div class="cv-form-row">
                    <div class="cv-form-group" style="flex:1.2">
                      <label>Nom du projet</label>
                      <input type="text" class="cv-form-input cv-proj-name" data-idx="${idx}" value="${p.name}" required>
                    </div>
                    <div class="cv-form-group" style="flex:1">
                      <label>Type / Stack</label>
                      <input type="text" class="cv-form-input cv-proj-type" data-idx="${idx}" value="${p.type}" required>
                    </div>
                  </div>
                  <div class="cv-form-group">
                    <label>Description du projet</label>
                    <textarea class="cv-form-input cv-proj-desc" data-idx="${idx}" rows="2" required>${p.description}</textarea>
                  </div>
                  <div class="cv-form-group">
                    <label>Lien GitHub</label>
                    <input type="url" class="cv-form-input cv-proj-github" data-idx="${idx}" value="${p.github}">
                  </div>
                </div>
              `).join("")}
            </div>

            <div style="margin-top:20px;display:flex;justify-content:flex-end;gap:10px">
              <button type="button" class="btn" style="background:#1a1a1a;color:#ccc;border:1px solid #333;border-radius:8px;padding:9px 16px" onclick="cancelCvEdits()">Annuler</button>
              <button type="submit" class="btn-import-v" style="padding:9px 20px">💾 Enregistrer le CV</button>
            </div>
          </form>
        </div>
      `;
      return;
    }

    // Read-Only Official CV Document View (For Visitors, Regular Users, & PDF Print)
    container.innerHTML = `
      <div class="cv-sheet" id="cvSheetDocument">
        
        <!-- CV Header -->
        <header class="cv-header">
          <div class="cv-header-main">
            <h1 class="cv-name">${data.personal.name}</h1>
            <p class="cv-headline">${data.personal.title}</p>
          </div>
          
          <div class="cv-contact-bar">
            <span>📍 ${data.personal.location}</span>
            <span>✉️ <a href="mailto:${data.personal.email}">${data.personal.email}</a></span>
            <span>🔗 <a href="${data.personal.linkedin}" target="_blank" rel="noopener noreferrer">${data.personal.linkedinLabel || 'LinkedIn'}</a></span>
            <span>🐙 <a href="${data.personal.github}" target="_blank" rel="noopener noreferrer">${data.personal.githubLabel || 'GitHub'}</a></span>
          </div>
        </header>

        <!-- CV Body Columns -->
        <div class="cv-layout">
          
          <!-- Main Left Column -->
          <main class="cv-col-main">
            
            <!-- Profil -->
            <section class="cv-section">
              <h2 class="cv-sec-title"><span>✦</span> Profil Professionnel</h2>
              <p class="cv-summary-text">${data.personal.summary}</p>
            </section>

            <!-- Projets Réalisés (Auto-Generated from Portfolio) -->
            <section class="cv-section">
              <h2 class="cv-sec-title">
                <span>🚀</span> Projets Réalisés & Portefeuille
                <small class="cv-sec-badge">Synchronisé en direct</small>
              </h2>
              <div class="cv-projects-list">
                ${data.projects.map(p => `
                  <article class="cv-project-entry">
                    <div class="cv-entry-head">
                      <strong class="cv-entry-name">${p.name}</strong>
                      <span class="cv-entry-tag">${p.type}</span>
                    </div>
                    <p class="cv-entry-desc">${p.description}</p>
                    ${p.github ? `<a href="${p.github}" target="_blank" rel="noopener noreferrer" class="cv-entry-link">${p.github.replace('https://', '')} ↗</a>` : ''}
                  </article>
                `).join("")}
              </div>
            </section>

            <!-- Expériences & Stages -->
            <section class="cv-section">
              <h2 class="cv-sec-title"><span>💼</span> Expériences & Stages Professionnels</h2>
              <div class="cv-timeline-list">
                ${data.experiences.map(exp => `
                  <article class="cv-timeline-entry">
                    <div class="cv-entry-head">
                      <strong class="cv-entry-name">${exp.role}</strong>
                      <span class="cv-entry-date">${exp.period}</span>
                    </div>
                    <div class="cv-entry-subtitle">${exp.company}</div>
                    <p class="cv-entry-desc">${exp.description}</p>
                  </article>
                `).join("")}
              </div>
            </section>

          </main>

          <!-- Sidebar Right Column -->
          <aside class="cv-col-side">
            
            <!-- Compétences Techniques (Auto-Synchronized) -->
            <section class="cv-section cv-side-section">
              <h2 class="cv-sec-title"><span>⚙️</span> Compétences</h2>
              
              <div class="cv-skill-group">
                <strong class="cv-skill-cat">Langages</strong>
                <p class="cv-skill-values">${data.skills.languages}</p>
              </div>

              <div class="cv-skill-group">
                <strong class="cv-skill-cat">Web</strong>
                <p class="cv-skill-values">${data.skills.web}</p>
              </div>

              <div class="cv-skill-group">
                <strong class="cv-skill-cat">Frameworks & Outils</strong>
                <p class="cv-skill-values">${data.skills.frameworks}</p>
              </div>

              <div class="cv-skill-group">
                <strong class="cv-skill-cat">Systèmes & Réseaux</strong>
                <p class="cv-skill-values">${data.skills.systems}</p>
              </div>
            </section>

            <!-- Formation -->
            <section class="cv-section cv-side-section">
              <h2 class="cv-sec-title"><span>🎓</span> Formation</h2>
              <div class="cv-edu-list">
                ${data.education.map(edu => `
                  <article class="cv-edu-entry">
                    <strong class="cv-edu-degree">${edu.degree}</strong>
                    <div class="cv-edu-school">${edu.school}</div>
                    <span class="cv-edu-date">${edu.period}</span>
                    <p class="cv-edu-desc">${edu.description}</p>
                  </article>
                `).join("")}
              </div>
            </section>

            <!-- Langues -->
            <section class="cv-section cv-side-section">
              <h2 class="cv-sec-title"><span>🌍</span> Langues</h2>
              <ul class="cv-lang-list">
                ${data.languages.map(l => `
                  <li>
                    <span class="cv-lang-name">${l.name}</span>
                    <span class="cv-lang-lvl">${l.level}</span>
                  </li>
                `).join("")}
              </ul>
            </section>

            <!-- Qualités & Soft Skills -->
            <section class="cv-section cv-side-section">
              <h2 class="cv-sec-title"><span>✦</span> Atouts</h2>
              <div class="cv-pills-wrap">
                ${data.strengths.map(s => `<span class="cv-pill">${s}</span>`).join("")}
              </div>
            </section>

          </aside>

        </div>

        <footer class="cv-doc-footer">
          <span>Curriculum Vitae · Melek Abdelmaksoud</span>
          <span>portfolio.melekabdelmaksoud72.workers.dev</span>
        </footer>

      </div>
    `;
  }
};

// ── Global Modal Operations ──
let isCvInEditMode = false;

function openCvModal(e) {
  if (e) e.preventDefault();
  const backdrop = document.getElementById("cvModalBackdrop");
  if (!backdrop) return;

  isCvInEditMode = false;
  CvManager.render(false);
  backdrop.classList.add("active");
  document.body.style.overflow = "hidden";
}

function closeCvModal() {
  const backdrop = document.getElementById("cvModalBackdrop");
  if (backdrop) backdrop.classList.remove("active");
  document.body.style.overflow = "";
  isCvInEditMode = false;
}

function toggleCvEditMode(enable) {
  isCvInEditMode = enable;
  CvManager.render(isCvInEditMode);
}

function cancelCvEdits() {
  toggleCvEditMode(false);
}

function handleCvFormSubmit(e) {
  e.preventDefault();
  const data = CvManager.getData();

  data.personal.name = document.getElementById("cvEditName").value.trim();
  data.personal.title = document.getElementById("cvEditTitle").value.trim();
  data.personal.email = document.getElementById("cvEditEmail").value.trim();
  data.personal.location = document.getElementById("cvEditLocation").value.trim();
  data.personal.linkedin = document.getElementById("cvEditLinkedin").value.trim();
  data.personal.github = document.getElementById("cvEditGithub").value.trim();
  data.personal.summary = document.getElementById("cvEditSummary").value.trim();

  data.skills.languages = document.getElementById("cvEditLang").value.trim();
  data.skills.web = document.getElementById("cvEditWeb").value.trim();
  data.skills.frameworks = document.getElementById("cvEditFw").value.trim();
  data.skills.systems = document.getElementById("cvEditSys").value.trim();

  // Save projects modifications
  const projNames = document.querySelectorAll(".cv-proj-name");
  const projTypes = document.querySelectorAll(".cv-proj-type");
  const projDescs = document.querySelectorAll(".cv-proj-desc");
  const projGits = document.querySelectorAll(".cv-proj-github");

  projNames.forEach((input, i) => {
    if (data.projects[i]) {
      data.projects[i].name = input.value.trim();
      data.projects[i].type = projTypes[i] ? projTypes[i].value.trim() : data.projects[i].type;
      data.projects[i].description = projDescs[i] ? projDescs[i].value.trim() : data.projects[i].description;
      data.projects[i].github = projGits[i] ? projGits[i].value.trim() : data.projects[i].github;
    }
  });

  CvManager.saveData(data);
  toggleCvEditMode(false);
  if (typeof showToast === "function") {
    showToast("💾 Modifications du CV enregistrées avec succès !", "success");
  }
}

function saveCvEdits() {
  const form = document.getElementById("cvEditForm");
  if (form) {
    if (typeof form.requestSubmit === "function") {
      form.requestSubmit();
    } else {
      form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    }
  }
}

function downloadCvPdf() {
  const element = document.getElementById("cvSheetDocument");
  if (!element) {
    window.print();
    return;
  }

  if (typeof html2pdf !== "undefined") {
    if (typeof showToast === "function") {
      showToast("⏳ Génération et téléchargement du PDF...", "info");
    }
    const opt = {
      margin: [6, 8, 6, 8],
      filename: "CV_Melek_Abdelmaksoud.pdf",
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, letterRendering: true },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" }
    };
    html2pdf().set(opt).from(element).save().then(() => {
      if (typeof showToast === "function") {
        showToast("✅ Téléchargement du CV terminé !", "success");
      }
    }).catch(err => {
      console.warn("html2pdf fallback to print:", err);
      window.print();
    });
  } else {
    window.print();
  }
}

function printCvDirect() {
  window.print();
}

// Global Exports
window.CvManager = CvManager;
window.openCvModal = openCvModal;
window.closeCvModal = closeCvModal;
window.toggleCvEditMode = toggleCvEditMode;
window.cancelCvEdits = cancelCvEdits;
window.handleCvFormSubmit = handleCvFormSubmit;
window.saveCvEdits = saveCvEdits;
window.downloadCvPdf = downloadCvPdf;
window.printCvDirect = printCvDirect;
