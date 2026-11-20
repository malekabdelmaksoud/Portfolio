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

  if (typeof ProjectsManager !== "undefined" && typeof ProjectsManager.updateSkills === "function") {
    ProjectsManager.updateSkills();
  }
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
    if (isActive) {
      renderChatFromHistory();
      aiChatInput.focus();
    }
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

function renderChatFromHistory() {
  if (typeof ChatStore === "undefined") return;
  const history = ChatStore.getHistory();
  aiChatMessages.innerHTML = "";

  if (history.length === 0) {
    appendAiMessage("👋 Bonjour ! Je suis l'assistant du portfolio de Melek. Je réponds aux questions fréquentes sur ses projets, compétences, expériences et son CV.", "bot", false, null);
    return;
  }

  history.forEach(item => {
    // User content is always rendered as text; only trusted assistant markup is interpreted.
    appendAiMessage(item.text, item.role, item.role === "bot", item.id);
  });
}

function appendAiMessage(text, role, isHtml = false, msgId = null) {
  const msg = document.createElement("div");
  msg.className = `ai-msg ${role}`;
  if (msgId) msg.dataset.msgId = msgId;

  const contentSpan = document.createElement("div");
  if (isHtml) {
    contentSpan.innerHTML = text;
  } else {
    contentSpan.textContent = text;
  }
  msg.appendChild(contentSpan);

  // Message CRUD actions (Edit & Delete for user, Delete for bot)
  if (msgId && typeof ChatStore !== "undefined") {
    const actions = document.createElement("div");
    actions.className = "ai-msg-actions";

    if (role === "user") {
      const editBtn = document.createElement("button");
      editBtn.className = "msg-act-btn";
      editBtn.title = "Modifier la question";
      editBtn.textContent = "✏️";
      editBtn.addEventListener("click", () => editChatMessage(msgId, contentSpan));
      actions.appendChild(editBtn);
    }

    const delBtn = document.createElement("button");
    delBtn.className = "msg-act-btn";
    delBtn.title = "Supprimer du fil";
    delBtn.textContent = "🗑️";
    delBtn.addEventListener("click", () => deleteChatMessage(msgId, msg));
    actions.appendChild(delBtn);

    msg.appendChild(actions);
  }

  aiChatMessages.appendChild(msg);
  aiChatMessages.scrollTop = aiChatMessages.scrollHeight;
  return msg;
}

function editChatMessage(id, contentSpan) {
  if (contentSpan.isContentEditable) return;
  contentSpan.contentEditable = "true";
  contentSpan.focus();
  contentSpan.style.outline = "1.5px solid #6957e8";
  contentSpan.style.borderRadius = "4px";
  contentSpan.style.padding = "2px 4px";
  contentSpan.style.background = "rgba(105,87,232,0.06)";

  const finishEdit = () => {
    contentSpan.contentEditable = "false";
    contentSpan.style.outline = "none";
    contentSpan.style.background = "none";
    const newText = contentSpan.textContent.trim();
    if (newText) {
      ChatStore.updateMessage(id, newText);
      const typing = appendAiMessage("Mise à jour de la réponse...", "bot");
      setTimeout(() => {
        typing.remove();
        const answer = generateAiAnswer(newText);
        const botMsg = ChatStore.addMessage("bot", answer);
        appendAiMessage(answer, "bot", true, botMsg.id);
      }, 350);
    }
  };

  contentSpan.onkeydown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      contentSpan.blur();
    }
  };
  contentSpan.onblur = finishEdit;
}

function deleteChatMessage(id, msgElement) {
  ChatStore.deleteMessage(id);
  msgElement.remove();
}

function handleUserQuery(query) {
  let userMsgId = null;
  if (typeof ChatStore !== "undefined") {
    const saved = ChatStore.addMessage("user", query);
    userMsgId = saved.id;
  }

  appendAiMessage(query, "user", false, userMsgId);
  const typing = appendAiMessage("Réflexion en cours...", "bot");

  setTimeout(() => {
    typing.remove();
    const answer = generateAiAnswer(query);
    let botMsgId = null;
    if (typeof ChatStore !== "undefined") {
      const savedBot = ChatStore.addMessage("bot", answer);
      botMsgId = savedBot.id;
    }
    appendAiMessage(answer, "bot", true, botMsgId);
  }, 350);
}

function generateAiAnswer(rawQuery) {
  if (window.PortfolioAssistant && typeof window.PortfolioAssistant.answer === "function") {
    return window.PortfolioAssistant.answer(rawQuery);
  }
  return "L'assistant est en cours de chargement. Réessayez dans un instant.";
}
