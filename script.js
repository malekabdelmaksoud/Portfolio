/* ── Menu Toggle ── */
const menuToggle = document.getElementById("menuToggle");
const navLinks = document.getElementById("navLinks");
menuToggle.addEventListener("click", () => {
  const opened = navLinks.classList.toggle("open");
  menuToggle.setAttribute("aria-expanded", String(opened));
  menuToggle.textContent = opened ? "✕" : "☰";
});
document.querySelectorAll(".nav-links a").forEach(a => a.addEventListener("click", () => {
  navLinks.classList.remove("open");
  menuToggle.setAttribute("aria-expanded", "false");
  menuToggle.textContent = "☰";
}));

/* ── Close menu on outside click ── */
document.addEventListener("click", (e) => {
  if (!navLinks.contains(e.target) && !menuToggle.contains(e.target) && navLinks.classList.contains("open")) {
    navLinks.classList.remove("open");
    menuToggle.setAttribute("aria-expanded", "false");
    menuToggle.textContent = "☰";
  }
});

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
  /* Update menu toggle aria-label per language */
  const isOpen = navLinks.classList.contains("open");
  menuToggle.setAttribute("aria-label", isOpen
    ? (language === "fr" ? "Fermer le menu" : "Close menu")
    : (language === "fr" ? "Ouvrir le menu" : "Open menu"));
  try { localStorage.setItem("portfolio-language", language); } catch (e) {}
}
document.querySelectorAll(".lang-btn").forEach(button => {
  button.addEventListener("click", () => setLanguage(button.dataset.lang));
});
let savedLanguage = "fr";
try { savedLanguage = localStorage.getItem("portfolio-language") || "fr"; } catch (e) {}
setLanguage(savedLanguage);

/* ── Footer Year ── */
document.getElementById("year").textContent = new Date().getFullYear();

/* ── Scroll-based header shadow ── */
const header = document.querySelector(".header");
window.addEventListener("scroll", () => {
  header.classList.toggle("scrolled", window.scrollY > 10);
}, { passive: true });

/* ── Fade-in sections on scroll ── */
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add("visible");
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.1 });

document.querySelectorAll(".section, .hero").forEach(section => {
  section.classList.add("fade-in");
  observer.observe(section);
});

/* ── Interactive In-Browser AI Assistant ── */
const aiChatToggle = document.getElementById("aiChatToggle");
const aiChatPopup = document.getElementById("aiChatPopup");
const aiChatClose = document.getElementById("aiChatClose");
const aiChatForm = document.getElementById("aiChatForm");
const aiChatInput = document.getElementById("aiChatInput");
const aiChatMessages = document.getElementById("aiChatMessages");

if (aiChatToggle && aiChatPopup) {
  aiChatToggle.addEventListener("click", () => {
    const isActive = aiChatPopup.classList.toggle("active");
    aiChatPopup.setAttribute("aria-hidden", String(!isActive));
    if (isActive) aiChatInput.focus();
  });

  aiChatClose.addEventListener("click", () => {
    aiChatPopup.classList.remove("active");
    aiChatPopup.setAttribute("aria-hidden", "true");
  });

  document.querySelectorAll(".quick-q").forEach(btn => {
    btn.addEventListener("click", () => {
      const q = btn.dataset.q;
      if (q) handleUserQuery(q);
    });
  });

  aiChatForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const query = aiChatInput.value.trim();
    if (!query) return;
    aiChatInput.value = "";
    handleUserQuery(query);
  });
}

function appendAiMessage(text, role, isHtml = false) {
  const msg = document.createElement("div");
  msg.className = `ai-msg ${role}`;
  if (isHtml) {
    msg.innerHTML = text;
  } else {
    msg.textContent = text;
  }
  aiChatMessages.appendChild(msg);
  aiChatMessages.scrollTop = aiChatMessages.scrollHeight;
  return msg;
}

function handleUserQuery(query) {
  appendAiMessage(query, "user");
  const typing = appendAiMessage("Réflexion en cours...", "bot");

  setTimeout(() => {
    typing.remove();
    const answer = generateAiAnswer(query);
    appendAiMessage(answer, "bot", true);
  }, 400);
}

function generateAiAnswer(rawQuery) {
  const q = rawQuery.toLowerCase();

  if (q.includes("cv") || q.includes("curriculum") || q.includes("télécharger") || q.includes("download") || q.includes("resume")) {
    return '📄 Vous pouvez télécharger directement le CV de Melek en cliquant ici : <br><a href="CV_Melek_Abdelmaksoud.pdf" download="CV_Melek_Abdelmaksoud.pdf" style="display:inline-block;margin-top:6px;padding:5px 12px;background:#6957e8;color:#fff;border-radius:20px;text-decoration:none;">⬇ Télécharger CV (PDF)</a>';
  }

  if (q.includes("projet") || q.includes("project") || q.includes("réalisation") || q.includes("travaux")) {
    return `🚀 <b>Projets phares de Melek Abdelmaksoud :</b><br>
    • <b>Elearning Platform</b> (Java) : Gestion des cours et suivi des apprenants.<br>
    • <b>Projet PHP</b> (PHP, CSS) : Application web dynamique côté serveur.<br>
    • <b>Application Laravel</b> (Laravel, PHP) : Architecture MVC, migrations et auth.<br>
    • <b>Gestion de Magasin</b> (Java) : Stocks, inventaire et ventes.<br>
    • <b>Projet Symfony</b> (Symfony, PHP) : Routage Twig et Doctrine ORM.<br>
    • <b>Première Application C#</b> (C#, .NET) : Interfaces desktop.<br>
    🔗 Consultez les dépôts sur <a href="https://github.com/malekabdelmaksoud" target="_blank">son profil GitHub ↗</a>.`;
  }

  if (q.includes("compétence") || q.includes("skill") || q.includes("technologie") || q.includes("langage") || q.includes("stack")) {
    return `🛠️ <b>Compétences techniques :</b><br>
    • <b>Langages :</b> Java, PHP, C, C#, Python, JavaScript<br>
    • <b>Web & Frameworks :</b> HTML5, CSS3, Laravel, Symfony, Spring Boot, Angular<br>
    • <b>Outils & Systèmes :</b> Git/GitHub, OCS Inventory, Maintenance & Câblage réseau<br>
    • <b>Soft skills :</b> Travail en équipe, autonomie, leadership, adaptabilité.`;
  }

  if (q.includes("stage") || q.includes("expérience") || q.includes("experience") || q.includes("travail") || q.includes("hopital")) {
    return `💼 <b>Expériences et stages :</b><br>
    • <b>Hôpital Hédi Chaker (2026) :</b> Configuration application de soins, DMI et OCS Inventory.<br>
    • <b>ACS (2026) :</b> Stage développement web.<br>
    • <b>Netsys Com Support (2025) :</b> Câblage réseau et équipements.<br>
    • <b>CISEN (2025) :</b> Maintenance matérielle et logicielle des ordinateurs.`;
  }

  if (q.includes("formation") || q.includes("étude") || q.includes("diplome") || q.includes("diplôme") || q.includes("iset")) {
    return `🎓 <b>Formation académique :</b><br>
    • <b>Licence en Technologie de l'Informatique</b> (Développement Web & Multimédia) — <i>ISET de Sidi Bouzid (2024 – Présent)</i><br>
    • <b>Baccalauréat Sciences Expérimentales</b> — <i>Lycée Tayeb Mhiri, Sfax (2023 – 2024)</i>`;
  }

  if (q.includes("contact") || q.includes("email") || q.includes("mail") || q.includes("téléphone") || q.includes("linkedin") || q.includes("joindre")) {
    return `📬 <b>Coordonnées de Melek :</b><br>
    • <b>Email :</b> <a href="mailto:melekabdelmaksoud72@gmail.com">melekabdelmaksoud72@gmail.com</a><br>
    • <b>LinkedIn :</b> <a href="https://www.linkedin.com/in/melek-abdelmaksoud-518713436/" target="_blank">Profil LinkedIn ↗</a><br>
    • <b>GitHub :</b> <a href="https://github.com/malekabdelmaksoud" target="_blank">github.com/malekabdelmaksoud ↗</a><br>
    • <b>Localisation :</b> Sfax, Tunisie`;
  }

  if (q.includes("qui") || q.includes("présentation") || q.includes("about") || q.includes("melek")) {
    return `👩‍💻 <b>Melek Abdelmaksoud</b> est étudiante en Licence en Technologie de l'Informatique (Développement Web et Multimédia) à l'ISET de Sidi Bouzid. Passionnée par le développement full-stack, elle recherche activement un stage PFE pour mettre en œuvre ses compétences.`;
  }

  return `🤖 Je peux vous renseigner sur les <b>projets</b>, les <b>compétences</b>, la <b>formation</b>, les <b>stages</b> ou vous fournir le <b>CV</b> de Melek en un clic ! Que souhaitez-vous savoir ?`;
}

