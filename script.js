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
  window.dispatchEvent(new Event("portfolio:languagechange"));
}
document.querySelectorAll(".lang-btn").forEach(button => {
  button.addEventListener("click", () => setLanguage(button.dataset.lang));
});
let savedLanguage = "fr";
try { savedLanguage = localStorage.getItem("portfolio-language") || "fr"; } catch (e) {}
setLanguage(savedLanguage);

/* ── Approved API-backed project publishing ── */
const portfolioApiBase = String(window.PORTFOLIO_API_BASE || "").replace(/\/$/, "");
let remotePortfolioProjects = [];
function renderRemoteProjects() {
  if (!remotePortfolioProjects.length) return;
  const grid = document.querySelector("#projets .projects-grid");
  if (!grid) return;
  const language = document.documentElement.lang === "en" ? "en" : "fr";
  grid.replaceChildren();
  remotePortfolioProjects.forEach((project, index) => {
    const card = document.createElement("article"); card.className = "project-card";
    const visual = document.createElement("div"); visual.className = "project-visual visual-" + ["one","two","three","four","five","six","seven"][index % 7];
    const number = document.createElement("span"); number.textContent = String(index + 1).padStart(2,"0");
    const symbol = document.createElement("div"); symbol.className = "project-symbol"; symbol.textContent = "↗"; visual.append(number,symbol);
    const body = document.createElement("div"); body.className = "project-body";
    const type = document.createElement("p"); type.className = "project-type"; type.textContent = project.type;
    const title = document.createElement("h3"); title.textContent = project.title;
    const description = document.createElement("p"); description.textContent = language === "en" ? project.description_en : project.description_fr;
    const link = document.createElement("a"); link.href = project.url; link.target = "_blank"; link.rel = "noopener noreferrer";
    link.textContent = language === "en" ? "View project ↗" : "Voir le projet ↗";
    body.append(type,title,description,link); card.append(visual,body); grid.append(card);
  });
}
async function loadRemoteProjects() {
  try {
    const response = await fetch(portfolioApiBase + "/api/projects", {headers:{Accept:"application/json"},credentials:"omit"});
    if (!response.ok) return;
    const data = await response.json();
    if (Array.isArray(data.projects) && data.projects.length) { remotePortfolioProjects = data.projects; renderRemoteProjects(); }
  } catch (_) { /* Keep static project cards until the API is deployed. */ }
}
window.addEventListener("portfolio:languagechange", renderRemoteProjects);
loadRemoteProjects();

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

/* Accessible browser voice controls — optional and capability-detected. */
let assistantRecognition = null;
let lastAssistantSpeech = "";
function addAssistantVoiceControls() {
  const form = aiChatForm;
  if (!form || document.getElementById("aiChatVoiceBtn")) return;
  const mic = document.createElement("button");
  mic.type = "button"; mic.id = "aiChatVoiceBtn"; mic.className = "ai-voice-btn";
  mic.title = "Dicter une question"; mic.setAttribute("aria-label", "Dicter une question"); mic.textContent = "🎙️";
  const speak = document.createElement("button");
  speak.type = "button"; speak.id = "aiChatSpeakBtn"; speak.className = "ai-voice-btn";
  speak.title = "Écouter la dernière réponse"; speak.setAttribute("aria-label", "Écouter la dernière réponse"); speak.textContent = "🔊";
  form.insertBefore(mic, form.querySelector("#aiChatSend"));
  const actions = aiChatPopup.querySelector(".ai-chat-actions");
  if (actions) actions.insertBefore(speak, actions.firstChild);
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    mic.disabled = true; mic.title = "La dictée vocale n'est pas prise en charge par ce navigateur";
    mic.setAttribute("aria-label", mic.title);
  } else {
    mic.addEventListener("click", () => {
      try {
        if (assistantRecognition) { assistantRecognition.stop(); assistantRecognition = null; mic.textContent = "🎙️"; return; }
        assistantRecognition = new SpeechRecognition();
        assistantRecognition.lang = document.documentElement.lang === "en" ? "en-US" : (document.documentElement.lang === "ar" || /^ar/i.test(navigator.language || "") ? "ar-TN" : "fr-FR");
        assistantRecognition.interimResults = false;
        assistantRecognition.maxAlternatives = 1;
        assistantRecognition.onresult = event => {
          const transcript = event.results?.[0]?.[0]?.transcript || "";
          if (transcript) { aiChatInput.value = transcript; aiChatInput.focus(); }
        };
        assistantRecognition.onerror = () => { mic.textContent = "🎙️"; assistantRecognition = null; };
        assistantRecognition.onend = () => { mic.textContent = "🎙️"; assistantRecognition = null; };
        assistantRecognition.start(); mic.textContent = "⏹️";
      } catch (_) { mic.textContent = "🎙️"; assistantRecognition = null; }
    });
  }
  speak.addEventListener("click", () => {
    if (!lastAssistantSpeech || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(lastAssistantSpeech);
    utterance.lang = document.documentElement.lang === "en" ? "en-US" : (document.documentElement.lang === "ar" ? "ar-TN" : "fr-FR");
    window.speechSynthesis.speak(utterance);
  });
  const clear = document.createElement("button");
  clear.type = "button"; clear.id = "aiChatClearBtn"; clear.className = "ai-voice-btn";
  clear.title = "Effacer la conversation"; clear.setAttribute("aria-label", clear.title); clear.textContent = "🗑️";
  if (actions) actions.insertBefore(clear, actions.firstChild);
  clear.addEventListener("click", () => {
    if (!window.confirm("Effacer l'historique de cette conversation sur cet appareil ?")) return;
    if (typeof ChatStore !== "undefined") ChatStore.clearHistory();
    aiChatMessages.innerHTML = "";
    appendAiMessage("👋 Bonjour ! Posez-moi vos questions sur les projets, compétences, études et expériences de Melek.", "bot");
    lastAssistantSpeech = "";
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  });
}
addAssistantVoiceControls();


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
    appendAiMessage(item.text, item.role, false, item.id);
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
  if (role === "bot") lastAssistantSpeech = contentSpan.textContent || "";
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
        generateAiAnswer(newText).then(answer => {
          const botMsg = ChatStore.addMessage("bot", answer);
          appendAiMessage(answer, "bot", false, botMsg.id);
        });
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

  (async () => {
    const answer = await generateAiAnswer(query);
    typing.remove();
    let botMsgId = null;
    if (typeof ChatStore !== "undefined") {
      const savedBot = ChatStore.addMessage("bot", answer);
      botMsgId = savedBot.id;
    }
    appendAiMessage(answer, "bot", false, botMsgId);
  })();
}

async function generateAiAnswer(rawQuery) {
  try {
    const response = await fetch(portfolioApiBase + "/api/assistant", {
      method: "POST", credentials: "omit",
      headers: {"content-type":"application/json","accept":"application/json"},
      body: JSON.stringify({question:String(rawQuery || "").slice(0,800)})
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Service indisponible.");
    return typeof data.answer === "string" ? data.answer : "Aucune réponse disponible.";
  } catch (_) {
    return "L'assistant fondé sur les informations approuvées n'est pas encore connecté au serveur. Réessayez après la configuration du service.";
  }
}
