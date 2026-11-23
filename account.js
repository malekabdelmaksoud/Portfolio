(() => {
  "use strict";
  const base = String(window.PORTFOLIO_API_BASE || "").replace(/\/$/, "");
  const $ = id => document.getElementById(id);
  let active = null;
  let mode = "chat";
  let sending = false;
  let chats = [];
  let searchSequence = 0;
  let abortController = null;

  const speech = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  let autoSpeak = false;
  let usedVoice = false;
  let voiceSession = false;
  let selectedModel = "melek-ai-v1";
  let googleSignInPromise = null;
  try { autoSpeak = localStorage.getItem("portfolio-auto-speak") === "1"; } catch (_) {}
  if ($("voice-auto")) $("voice-auto").setAttribute("aria-pressed", autoSpeak ? "true" : "false");

  function showStopVocal(show) {
    const btn = $("stop-vocal");
    if (btn) btn.hidden = !show;
  }

  function applyTheme(theme) {
    if (theme === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem("portfolio-theme", theme); } catch (_) {}
  }
  let accountTheme = "system";
  try { accountTheme = localStorage.getItem("portfolio-theme") || "system"; } catch (_) {}
  applyTheme(accountTheme);
  $("account-theme").addEventListener("click", () => {
    accountTheme = accountTheme === "system" ? "dark" : accountTheme === "dark" ? "light" : "system";
    applyTheme(accountTheme);
  });

  const api = async (path, options = {}) => {
    const response = await fetch(base + path, {
      ...options,
      credentials: "include",
      headers: { "content-type": "application/json", "accept": "application/json", ...(options.headers || {}) }
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) throw Object.assign(new Error(data.error || "Email sign-in is required."), { auth: true });
    if (!response.ok) throw Object.assign(new Error(data.error || "The server could not complete this request."), { code: data.code || null, status: response.status });
    return data;
  };

  function toast(message) {
    $("toast").textContent = message;
    $("toast").classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => $("toast").classList.remove("show"), 3500);
  }

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  function markdown(value) {
    const text = escapeHTML(value);
    const blocks = text.split(/```([a-z0-9_-]*)\n?([\s\S]*?)```/gi);
    let html = "";
    for (let i = 0; i < blocks.length; i += 3) {
      html += blocks[i].split("\n").map(line =>
        line ? "<p>" + line.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/`([^`]+)`/g, "<code>$1</code>") + "</p>" : ""
      ).join("");
      if (blocks[i + 1] !== undefined) {
        const code = blocks[i + 2] || "";
        html += `<div class="code-block"><div class="code-toolbar"><span>${escapeHTML(blocks[i + 1] || "code")}</span><button type="button" data-copy-code="${escapeHTML(code)}">Copy</button></div><pre><code>${code}</code></pre></div>`;
      }
    }
    return html;
  }

  function formatTime(value) {
    if (!value) return "";
    const date = new Date(value.endsWith("Z") ? value : value + "Z");
    return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function keepLatestMessageVisible(node) {
    if (!node) return;
    requestAnimationFrame(() => node.scrollIntoView({ behavior: "smooth", block: "end", inline: "nearest" }));
  }

  function addMessage(role, content, withActions = true, createdAt = null, messageId = null) {
    const node = document.createElement("article");
    node.className = "message " + (role === "user" ? "user" : "assistant");
    if (messageId) node.dataset.messageId = messageId;
    keepLatestMessageVisible(node);
    const avatar = document.createElement("div");
    avatar.className = "message-avatar";
    avatar.textContent = role === "user" ? "M" : "AI";
    const body = document.createElement("div");
    body.className = "message-body";
    const label = document.createElement("div");
    label.className = "message-role";
    label.textContent = role === "user" ? "You" : "Melek AI";
    const text = document.createElement("div");
    text.className = "message-text";
    text.innerHTML = markdown(content);
    body.append(label, text);
    if (createdAt) {
      const time = document.createElement("time");
      time.className = "message-time";
      time.textContent = formatTime(createdAt);
      body.append(time);
    }
    if (role === "user" && withActions && messageId) {
      const actions = document.createElement("div");
      actions.className = "message-actions";
      const edit = document.createElement("button");
      edit.type = "button";
      edit.textContent = "Edit";
      edit.addEventListener("click", () => editUserMessage(node, content));
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "Delete";
      remove.addEventListener("click", async () => {
        if (!confirm("Delete this message?")) return;
        try {
          await api("/api/user/chats/" + encodeURIComponent(active) + "/messages/" + encodeURIComponent(messageId), { method: "DELETE" });
          await openChat(active);
          await refreshChats();
          toast("Message deleted.");
        } catch (error) { toast(error.message); }
      });
      actions.append(edit, remove);
      body.append(actions);
    }
    if (role === "assistant" && withActions) {
      const actions = document.createElement("div");
      actions.className = "message-actions";
      const copy = document.createElement("button");
      copy.type = "button";
      copy.textContent = "Copy";
      copy.addEventListener("click", () => navigator.clipboard?.writeText(content).then(() => toast("Response copied."), () => toast("Copy unavailable.")));
      const speak = document.createElement("button");
      speak.type = "button";
      speak.textContent = "Play";
      speak.addEventListener("click", () => speakText(content));
      const pause = document.createElement("button");
      pause.type = "button";
      pause.textContent = "Pause";
      pause.addEventListener("click", () => speechSynthesis?.pause());
      const resume = document.createElement("button");
      resume.type = "button";
      resume.textContent = "Resume";
      resume.addEventListener("click", () => speechSynthesis?.resume());
      const stop = document.createElement("button");
      stop.type = "button";
      stop.textContent = "Stop";
      stop.addEventListener("click", () => speechSynthesis?.cancel());
      actions.append(copy, speak, pause, resume, stop);
      if (messageId) {
        const remove = document.createElement("button");
        remove.type = "button";
        remove.textContent = "Delete";
        remove.addEventListener("click", async () => {
          if (!confirm("Delete this message?")) return;
          try {
            await api("/api/user/chats/" + encodeURIComponent(active) + "/messages/" + encodeURIComponent(messageId), { method: "DELETE" });
            node.remove();
            await refreshChats();
            toast("Message deleted.");
          } catch (error) { toast(error.message); }
        });
        actions.append(remove);
      }
      body.append(actions);
    }
    node.append(avatar, body);
    $("messages").append(node);
    node.querySelectorAll("[data-copy-code]").forEach(button => button.addEventListener("click", () => {
      navigator.clipboard?.writeText(button.dataset.copyCode).then(() => toast("Code copied."));
    }));
    $("messages").scrollTop = $("messages").scrollHeight;
    return node;
  }

  function groupFor(value) {
    const d = new Date(String(value).endsWith("Z") ? value : value + "Z");
    const n = new Date();
    const today = new Date(n.getFullYear(), n.getMonth(), n.getDate());
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diff = Math.round((today - day) / 86400000);
    return diff <= 0 ? "Today" : diff === 1 ? "Yesterday" : diff < 7 ? "Previous 7 days" : "Older";
  }

  function renderList() {
    const list = $("chat-list");
    list.replaceChildren();
    const query = $("history-search").value.trim().toLowerCase();
    const filtered = chats.filter(c => (c.title || "").toLowerCase().includes(query));
    if (!filtered.length) {
      const p = document.createElement("p");
      p.className = "list-empty";
      p.textContent = query ? "No results." : "No conversations yet.";
      list.append(p);
      return;
    }
    ["Today","Yesterday","Previous 7 days","Older"].forEach(group => {
      const items = filtered.filter(c => groupFor(c.updated_at) === group);
      if (!items.length) return;
      const heading = document.createElement("div");
      heading.className = "history-group";
      heading.textContent = group;
      list.append(heading);
      items.forEach(chat => {
        const item = document.createElement("div");
        item.setAttribute("role", "button");
        item.tabIndex = 0;
        item.className = "chat-item" + (chat.id === active ? " active" : "");

        const title = document.createElement("span");
        title.className = "chat-name";
        title.textContent = chat.title || "New chat";
        title.title = "Double-cliquez pour renommer";

        const actions = document.createElement("div");
        actions.className = "chat-actions";

        const renameBtn = document.createElement("button");
        renameBtn.type = "button";
        renameBtn.className = "chat-action-btn rename-btn";
        renameBtn.innerHTML = "✏️";
        renameBtn.title = "Renommer";
        renameBtn.setAttribute("aria-label", "Renommer la conversation");

        const deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.className = "chat-action-btn delete-btn";
        deleteBtn.innerHTML = "🗑️";
        deleteBtn.title = "Supprimer";
        deleteBtn.setAttribute("aria-label", "Supprimer la conversation");

        function startInlineEdit() {
          const input = document.createElement("input");
          input.type = "text";
          input.className = "chat-rename-input";
          input.value = chat.title || "New chat";
          input.maxLength = 120;

          title.replaceWith(input);
          actions.hidden = true;
          input.focus();
          input.select();

          let finished = false;
          async function commitEdit() {
            if (finished) return;
            finished = true;
            const newTitle = input.value.trim();
            if (newTitle && newTitle !== chat.title) {
              try {
                await api("/api/user/chats/" + encodeURIComponent(chat.id), {
                  method: "PUT",
                  body: JSON.stringify({ title: newTitle })
                });
                chat.title = newTitle;
                if (active === chat.id) $("conversation-head").textContent = newTitle;
                toast("Nom mis à jour.");
              } catch (error) {
                toast(error.message || "Erreur de renommage");
              }
            }
            title.textContent = chat.title || "New chat";
            input.replaceWith(title);
            actions.hidden = false;
          }

          function cancelEdit() {
            if (finished) return;
            finished = true;
            title.textContent = chat.title || "New chat";
            input.replaceWith(title);
            actions.hidden = false;
          }

          input.addEventListener("click", e => e.stopPropagation());
          input.addEventListener("keydown", e => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.stopPropagation();
              commitEdit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              cancelEdit();
            }
          });
          input.addEventListener("blur", () => commitEdit());
        }

        renameBtn.addEventListener("click", e => {
          e.stopPropagation();
          startInlineEdit();
        });

        title.addEventListener("dblclick", e => {
          e.stopPropagation();
          startInlineEdit();
        });

        deleteBtn.addEventListener("click", async e => {
          e.stopPropagation();
          await deleteChat(chat.id);
        });

        actions.append(renameBtn, deleteBtn);
        item.append(title, actions);

        item.addEventListener("click", () => openChat(chat.id));
        item.addEventListener("keydown", event => {
          if (event.key === "Enter" || event.key === " ") {
            if (event.target === item) {
              event.preventDefault();
              openChat(chat.id);
            }
          }
        });
        list.append(item);
      });
    });
  }

  async function refreshChats() {
    const data = await api("/api/user/chats");
    chats = data.chats || [];
    renderList();
  }

  async function openChat(id) {
    if (window.innerWidth <= 760) $("sidebar").classList.remove("mobile-open");
    const data = await api("/api/user/chats/" + encodeURIComponent(id));
    active = id;
    try { localStorage.setItem("melek_active_chat_id", id); } catch (_) {}
    $("welcome").hidden = true;
    $("conversation").hidden = false;
    $("conversation-head").textContent = data.chat.title || "Conversation";
    $("messages").replaceChildren();
    (data.messages || []).forEach(message => addMessage(message.role, message.content, true, message.created_at, message.id));
    renderList();
    $("messages").scrollTop = $("messages").scrollHeight;
  }

  async function createChat(title = "New chat") {
    const data = await api("/api/user/chats", { method: "POST", body: JSON.stringify({ title }) });
    active = data.chat.id;
    try { localStorage.setItem("melek_active_chat_id", data.chat.id); } catch (_) {}
    $("welcome").hidden = true;
    $("conversation").hidden = false;
    $("conversation-head").textContent = data.chat.title;
    $("messages").replaceChildren();
    await refreshChats();
    return data.chat;
  }

  async function deleteChat(id) {
    if (!confirm("Supprimer cette conversation ?")) return;
    try {
      await api("/api/user/chats/" + encodeURIComponent(id), { method: "DELETE" });
      if (active === id) {
        active = null;
        try { localStorage.removeItem("melek_active_chat_id"); } catch (_) {}
        $("conversation").hidden = true;
        $("welcome").hidden = false;
        $("messages").replaceChildren();
      }
      await refreshChats();
      toast("Conversation supprimée.");
    } catch (err) {
      toast(err.message || "Erreur de suppression.");
    }
  }

  function setMode(next) {
    mode = next;
    $("mode-chat").classList.toggle("selected", mode === "chat");
    $("mode-analyze").classList.toggle("selected", mode === "analyze");
    $("mode-hint").textContent = mode === "chat" ? "Direct, concise answers" : "Detailed, structured analysis";
    $("mobile-mode").textContent = mode === "chat" ? "Chat" : "Analyze";
  }

  async function editUserMessage(node, oldContent) {
    if (sending || !active || !node.dataset.messageId) return;
    const editor = document.createElement("textarea");
    editor.className = "message-edit-input";
    editor.rows = Math.max(2, Math.min(8, oldContent.split("\n").length));
    editor.maxLength = 6000;
    editor.value = oldContent;
    const actions = document.createElement("div");
    actions.className = "message-actions";
    const save = document.createElement("button");
    save.type = "button";
    save.textContent = "Save & regenerate";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Cancel";
    const originalText = node.querySelector(".message-text");
    const originalActions = node.querySelector(".message-actions");
    originalText.hidden = true;
    if (originalActions) originalActions.hidden = true;
    node.querySelector(".message-body").append(editor, actions);
    actions.append(save, cancel);
    editor.focus();
    cancel.addEventListener("click", () => { editor.remove(); actions.remove(); originalText.hidden = false; if (originalActions) originalActions.hidden = false; });
    save.addEventListener("click", async () => {
      const content = editor.value.trim();
      if (!content) return toast("Message cannot be empty.");
      save.disabled = true;
      try {
        const history = [];
        let previous = node.previousElementSibling;
        while (previous) {
          history.unshift({ role: previous.classList.contains("user") ? "user" : "assistant", content: previous.querySelector(".message-text")?.textContent || "" });
          previous = previous.previousElementSibling;
        }
        const response = await fetch(base + "/api/assistant", { method: "POST", credentials: "include", headers: { "content-type": "application/json", "accept": "application/json" }, body: JSON.stringify({ question: content, mode, history: history.slice(-12), model_id: selectedModel }) });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "The AI service is unavailable.");
        const answer = typeof data.answer === "string" ? data.answer : "No response available.";
        await api("/api/user/chats/" + encodeURIComponent(active) + "/messages/" + encodeURIComponent(node.dataset.messageId), { method: "PATCH", body: JSON.stringify({ content }) });
        editor.remove(); actions.remove();
        await api("/api/user/chats/" + encodeURIComponent(active), { method: "POST", body: JSON.stringify({ role: "assistant", content: answer }) });
        await openChat(active);
        await refreshChats();
        toast("Message updated and response regenerated.");
      } catch (error) { toast(error.message || "Could not update message."); await openChat(active); }
    });
  }

  async function sendMessage(event) {
    event.preventDefault();
    const input = $("chat-input");
    const question = input.value.trim();
    if (!question || sending) return;
    sending = true;
    $("send-message").disabled = true;
    $("stop-generation").hidden = false;
    input.value = "";
    input.style.height = "auto";
    abortController = new AbortController();
    let pending = null;
    try {
      if (!active) await createChat(question.slice(0, 64));
      const savedUser = await api("/api/user/chats/" + encodeURIComponent(active), { method: "POST", body: JSON.stringify({ role: "user", content: question }) });
      addMessage("user", question, true, null, savedUser.id);
      pending = addMessage("assistant", mode === "analyze" ? "Analyzing…" : "Thinking…", false);
      const previousMessages = [...$("messages").querySelectorAll(".message")].slice(-12, -2);
      const history = previousMessages.map(node => ({
        role: node.classList.contains("user") ? "user" : "assistant",
        content: node.querySelector(".message-text")?.textContent || ""
      })).filter(item => item.content.trim());
      const response = await fetch(base + "/api/assistant", {
        method: "POST",
        credentials: "include",
        signal: abortController.signal,
        headers: { "content-type": "application/json", "accept": "application/json" },
        body: JSON.stringify({ question, mode, history, model_id: selectedModel })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "The AI service is unavailable.");
      const answer = typeof data.answer === "string" ? data.answer : "No response available.";
      if (pending) { pending.remove(); pending = null; }
      const savedAssistant = await api("/api/user/chats/" + encodeURIComponent(active), { method: "POST", body: JSON.stringify({ role: "assistant", content: answer }) });
      addMessage("assistant", answer, true, null, savedAssistant.id);
      if (autoSpeak || usedVoice) {
        speakText(answer);
        usedVoice = false;
      }
      await refreshChats();
    } catch (error) {
      if (pending) pending.remove();
      if (![...$("messages").querySelectorAll(".message")].some(m => m.textContent?.includes(question))) {
        input.value = question;
      }
      if (error.name !== "AbortError") toast(error.message);
      else toast("Generation stopped.");
    } finally {
      sending = false;
      abortController = null;
      $("send-message").disabled = false;
      $("stop-generation").hidden = true;
      input.focus();
    }
  }

  function speakText(text) {
    if (!("speechSynthesis" in window)) {
      toast("Text-to-speech is unavailable in this browser.");
      return;
    }
    speechSynthesis.cancel();
    const cleanText = text
      .replace(/[*_#`~[\]()]/g, "")
      .replace(/https?:\/\/\S+/g, "")
      .replace(/[•–—]/g, ", ");
    const utterance = new SpeechSynthesisUtterance(cleanText);
    const isArabic = /[\u0600-\u06ff]/.test(text);
    const isEnglish = /\b(the|and|with|for|project|skills|experience)\b/i.test(text);
    utterance.lang = isArabic ? "ar-TN" : isEnglish ? "en-US" : "fr-FR";
    try {
      const voices = speechSynthesis.getVoices();
      const matchVoice = voices.find(v => v.lang.startsWith(utterance.lang.slice(0, 2)));
      if (matchVoice) utterance.voice = matchVoice;
    } catch (_) {}
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.onstart = () => showStopVocal(true);
    utterance.onend = () => {
      showStopVocal(false);
      if (voiceSession) setTimeout(startVoiceCapture, 350);
    };
    utterance.onerror = () => showStopVocal(false);
    speechSynthesis.speak(utterance);
  }

  function showAuth() {
    $("auth-bootstrap")?.remove();
    $("auth-screen").hidden = false;
    $("app-shell").hidden = true;
    loadGoogleSignIn().catch(() => {});
  }

  function showApp() {
    $("auth-bootstrap")?.remove();
    $("auth-screen").hidden = true;
    $("app-shell").hidden = false;
  }

  // Keep one Google Identity Services initialization per page and render its official popup button.
  async function loadGoogleSignIn() {
    const btn = $("google-signin");
    if (!btn) return;
    if (googleSignInPromise) return googleSignInPromise;

    googleSignInPromise = (async () => {
      const fallbackBtn = $("google-fallback-btn");
      try {
        const config = await api("/api/auth/config");
        if (!config.googleClientId) {
          btn.hidden = true;
          $("email-divider").hidden = false;
          throw new Error("Google sign-in is not configured on the server.");
        }

        if (fallbackBtn && !fallbackBtn.dataset.bound) {
          fallbackBtn.dataset.bound = "true";
          fallbackBtn.addEventListener("click", () => {
            $("auth-error").textContent = "";
            if (window.google?.accounts?.id) {
              try { window.google.accounts.id.prompt(); } catch (_) {}
            }
            const oauthParams = new URLSearchParams({
              client_id: config.googleClientId,
              redirect_uri: window.location.origin + window.location.pathname,
              response_type: "id_token",
              scope: "openid email profile",
              nonce: Math.random().toString(36).slice(2)
            });
            const oauthUrl = "https://accounts.google.com/o/oauth2/v2/auth?" + oauthParams.toString();
            const popup = window.open(oauthUrl, "google_login", "width=500,height=600,menubar=no,toolbar=no");
            if (!popup || popup.closed || typeof popup.closed === "undefined") {
              window.location.href = oauthUrl;
            }
          });
        }

        await new Promise((resolve, reject) => {
          if (window.google?.accounts?.id) return resolve();
          const script = document.createElement("script");
          script.src = "https://accounts.google.com/gsi/client";
          script.async = true;
          script.defer = true;
          script.onload = () => window.google?.accounts?.id
            ? resolve()
            : reject(new Error("Google Identity Services did not initialize."));
          script.onerror = () => reject(new Error("Google sign-in could not load. Check network access or browser extensions."));
          document.head.append(script);
        });

        window.google.accounts.id.initialize({
          client_id: config.googleClientId,
          auto_select: false,
          ux_mode: "popup",
          callback: async response => {
            $("auth-error").textContent = "";
            if (!response?.credential) {
              $("auth-error").textContent = "Google did not return a sign-in credential. Please try again.";
              return;
            }
            try {
              await api("/api/auth/google", {
                method: "POST",
                body: JSON.stringify({ credential: response.credential })
              });
              await load();
            } catch (error) {
              $("auth-error").textContent = error.message || "Google sign-in failed.";
            }
          }
        });

        const mount = document.createElement("div");
        mount.id = "google-gis-button";
        btn.append(mount);
        window.google.accounts.id.renderButton(mount, {
          theme: "outline",
          size: "large",
          shape: "pill",
          text: "continue_with",
          width: 320
        });
        setTimeout(() => {
          if (mount.querySelector("iframe") && fallbackBtn) {
            fallbackBtn.hidden = true;
          }
        }, 600);
        $("email-divider").hidden = false;
      } catch (error) {
        console.warn("Google sign-in initialization failed:", error);
        $("email-divider").hidden = false;
      }
    })();

    return googleSignInPromise;
  }

  async function loadModels() {
    const select = $("model-select");
    if (!select) return;
    try {
      const data = await api("/api/models");
      if (Array.isArray(data.models) && data.models.length) {
        select.replaceChildren();
        data.models.forEach(model => {
          const opt = document.createElement("option");
          opt.value = model.id;
          opt.textContent = model.label || model.id;
          if (model.description) opt.title = model.description;
          opt.disabled = model.available === false;
          select.append(opt);
        });
        const saved = localStorage.getItem("melek-ai-model") || data.defaultModel;
        const preferred = data.models.some(m => m.id === saved && m.available !== false) ? saved : data.defaultModel;
        if (preferred) {
          select.value = preferred;
          selectedModel = preferred;
          $("model-version").textContent = "Model version: " + preferred;
        }
      }
    } catch (_) {
      selectedModel = select.value || "melek-ai-v1";
      $("model-version").textContent = "Model version: " + selectedModel;
    }
  }

  async function load() {
    const hashParams = new URLSearchParams(window.location.hash.slice(1));
    const hashToken = hashParams.get("id_token") || hashParams.get("credential");
    if (hashToken) {
      try {
        window.history.replaceState(null, "", window.location.pathname);
        if (window.opener) {
          try {
            window.opener.postMessage({ type: "google_credential", credential: hashToken }, window.location.origin);
            window.close();
            return;
          } catch (_) {}
        }
        await api("/api/auth/google", { method: "POST", body: JSON.stringify({ credential: hashToken }) });
      } catch (err) {
        showAuth();
        $("auth-error").textContent = err.message;
        return;
      }
    }
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get("passwordReset") === "1") {
      toast("Mot de passe réinitialisé avec succès !");
      window.history.replaceState(null, "", window.location.pathname);
    }
    const modelSelect = $("model-select");
    if (modelSelect && !modelSelect.dataset.bound) {
      modelSelect.dataset.bound = "1";
      modelSelect.addEventListener("change", () => {
        const selectedOption = modelSelect.options[modelSelect.selectedIndex];
        if (selectedOption?.disabled) {
          modelSelect.value = "melek-ai-v1";
          selectedModel = "melek-ai-v1";
          return;
        }
        selectedModel = modelSelect.value || "melek-ai-v1";
        $("model-version").textContent = "Model version: " + selectedModel;
        try { localStorage.setItem("melek-ai-model", selectedModel); } catch (_) {}
        toast("Model switched to: " + (selectedOption?.text || selectedModel));
      });
    }
    try {
      const statusResponse = await fetch(base + "/api/melek-ai/status", { credentials: "omit", headers: { accept: "application/json" } });
      if (statusResponse.ok) {
        const status = await statusResponse.json();
        $("model-version").textContent = "Model version: " + (status.model_id || "melek-ai-v1");
        $("training-status").textContent = "Training status: " + (status.training_status || "untrained");
        $("inference-status").textContent = "Inference: " + (status.inference_available ? "available (Workers AI)" : "unavailable");
      }
    } catch (_) {}
    try {
      const me = await api("/api/user/me");
      showApp();
      $("identity").textContent = me.user.email;
      $("status").textContent = "Verified · private history";
      await loadModels();
      await refreshChats();
      // Always resume the most recently updated conversation on sign-in.
      const targetChat = chats[0];
      if (targetChat) await openChat(targetChat.id);
    } catch (error) {
      showAuth();
      $("auth-error").textContent = error.auth ? "Please sign in with your email and password or Google." : error.message;
    }
  }

  document.querySelectorAll("[data-auth-tab]").forEach(button => {
    button.addEventListener("click", () => {
      const register = button.dataset.authTab === "register";
      $("login-form").hidden = register;
      $("register-form").hidden = !register;
      $("auth-login-tab").classList.toggle("active", !register);
      $("auth-register-tab").classList.toggle("active", register);
      $("auth-error").textContent = "";
      (register ? $("register-email") : $("login-email")).focus();
    });
  });

  $("login-form").addEventListener("submit", async event => {
    event.preventDefault();
    $("auth-error").textContent = "";
    try {
      await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: $("login-email").value.trim(),
          password: $("login-password").value
        })
      });
      await load();
    } catch (error) {
      $("auth-error").textContent = error.code === "INVALID_CREDENTIALS"
        ? "Email or password is incorrect. If you first signed in with Google and never created a password, choose “Create account / Set password” and use this same email address."
        : error.message;
    }
  });

  $("register-form").addEventListener("submit", async event => {
    event.preventDefault();
    $("auth-error").textContent = "";
    try {
      await api("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          name: $("register-name").value.trim(),
          email: $("register-email").value.trim(),
          password: $("register-password").value
        })
      });
      await load();
    } catch (error) { $("auth-error").textContent = error.message; }
  });

  $("logout").addEventListener("click", async () => {
    try {
      await api("/api/auth/logout", { method: "POST", body: "{}" });
      active = null;
      chats = [];
      showAuth();
      $("login-email").value = "";
      $("login-password").value = "";
      $("auth-error").textContent = "";
      $("otp-code").value = "";
      $("messages").replaceChildren();
      $("welcome").hidden = false;
      $("conversation").hidden = true;
    } catch (error) { toast(error.message); }
  });

  $("new-chat").addEventListener("click", async () => {
    try {
      active = null;
      await createChat();
      $("chat-input").focus();
    } catch (error) { toast(error.message); }
  });
  $("share-conversation").addEventListener("click", async () => {
    if (!active) return toast("Open a conversation before sharing it.");
    const button = $("share-conversation");
    button.disabled = true;
    try {
      const data = await api("/api/user/chats/" + encodeURIComponent(active) + "/share", { method: "POST", body: "{}" });
      try {
        await navigator.clipboard.writeText(data.url);
        toast("Share link copied. The original prompt is included.");
      } catch (_) {
        window.prompt("Copy this share link:", data.url);
      }
    } catch (error) { toast(error.message); }
    finally { button.disabled = false; }
  });
  $("revoke-share").addEventListener("click", async () => {
    if (!active) return;
    if (!confirm("Revoke all public links for this conversation?")) return;
    try {
      const data = await api("/api/user/chats/" + encodeURIComponent(active) + "/share", { method: "DELETE" });
      toast(data.count ? "Shared links revoked." : "There were no active shared links.");
    } catch (error) { toast(error.message); }
  });
  $("chat-form").addEventListener("submit", sendMessage);
  $("chat-input").addEventListener("keydown", event => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      $("chat-form").requestSubmit();
    }
  });
  $("chat-input").addEventListener("input", () => {
    $("chat-input").style.height = "auto";
    $("chat-input").style.height = Math.min($("chat-input").scrollHeight, 180) + "px";
  });
  $("mode-chat").addEventListener("click", () => setMode("chat"));
  $("mode-analyze").addEventListener("click", () => setMode("analyze"));
  $("stop-generation").addEventListener("click", () => abortController?.abort());
  $("history-search").addEventListener("input", async event => {
    const sequence = ++searchSequence;
    const query = event.target.value.trim();
    if (!query) { await refreshChats(); return; }
    try {
      const data = await api("/api/user/chats?q=" + encodeURIComponent(query));
      if (sequence === searchSequence) { chats = data.chats || []; renderList(); }
    } catch (error) { toast(error.message); }
  });
  $("delete-all").addEventListener("click", async () => {
    if (!confirm("Delete all of your conversation history?")) return;
    await api("/api/user/chats", { method: "DELETE" });
    active = null;
    chats = [];
    $("conversation").hidden = true;
    $("welcome").hidden = false;
    $("messages").replaceChildren();
    renderList();
    toast("History deleted.");
  });
  $("sidebar-toggle").addEventListener("click", () => {
    if (window.innerWidth <= 760) $("sidebar").classList.remove("mobile-open");
    else $("sidebar").classList.toggle("collapsed");
  });
  $("mobile-menu").addEventListener("click", () => $("sidebar").classList.toggle("mobile-open"));
  $("voice-auto").addEventListener("click", () => {
    autoSpeak = !autoSpeak;
    $("voice-auto").setAttribute("aria-pressed", autoSpeak ? "true" : "false");
    $("voice-auto").classList.toggle("selected", autoSpeak);
    try { localStorage.setItem("portfolio-auto-speak", autoSpeak ? "1" : "0"); } catch (_) {}
    toast(autoSpeak ? "Automatic voice replies enabled." : "Automatic voice replies disabled.");
  });
  document.addEventListener("click", event => {
    if (window.innerWidth <= 760 && $("sidebar").classList.contains("mobile-open")) {
      if (!event.target.closest("#sidebar") && !event.target.closest("#mobile-menu")) $("sidebar").classList.remove("mobile-open");
    }
  });
  document.querySelectorAll("[data-prompt]").forEach(button => button.addEventListener("click", () => {
    $("chat-input").value = button.dataset.prompt;
    $("chat-input").focus();
  }));

  function stopVoiceSession() {
    voiceSession = false;
    if (recognition) {
      try { recognition.onend = null; recognition.stop(); } catch (_) {}
      recognition = null;
    }
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    $("mic-button")?.classList.remove("recording");
    const vs = $("voice-session");
    if (vs) {
      vs.classList.remove("selected");
      vs.setAttribute("aria-pressed", "false");
      vs.textContent = "Voice chat";
    }
    showStopVocal(false);
  }

  function startVoiceCapture() {
    if (!speech || !voiceSession || recognition || sending) return;
    try {
      recognition = new speech();
      const text = $("chat-input").value;
      recognition.lang = /[\\u0600-\\u06ff]/.test(text) || (navigator.language || "").startsWith("ar") ? "ar-TN" : /[a-z]/i.test(text) ? "fr-FR" : "en-US";
      recognition.interimResults = true;
      recognition.continuous = false;
      recognition.onstart = () => {
        $("mic-button")?.classList.add("recording");
        const vs = $("voice-session");
        if (vs) vs.textContent = "Listening…";
      };
      recognition.onresult = event => {
        let finalText = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) finalText += event.results[i][0].transcript;
        }
        if (finalText) $("chat-input").value = ($("chat-input").value + " " + finalText).trim();
      };
      recognition.onerror = event => {
        toast("Speech recognition error: " + event.error);
        if (["not-allowed", "service-not-allowed", "audio-capture"].includes(event.error)) stopVoiceSession();
      };
      recognition.onend = () => {
        recognition = null;
        $("mic-button")?.classList.remove("recording");
        if (!voiceSession) return;
        const vs = $("voice-session");
        if ($("chat-input").value.trim()) {
          usedVoice = true;
          if (vs) vs.textContent = "Thinking…";
          $("chat-form").requestSubmit();
        } else {
          if (vs) vs.textContent = "Voice chat on";
          setTimeout(startVoiceCapture, 500);
        }
      };
      recognition.start();
    } catch (error) {
      recognition = null;
      toast("Could not start the microphone: " + (error.message || "permission unavailable"));
      stopVoiceSession();
    }
  }

  $("mic-button").addEventListener("click", () => {
    $("voice-disclosure").hidden = false;
    if (!speech) {
      toast("Speech recognition is unsupported in this browser.");
      return;
    }
    if (recognition) { try { recognition.stop(); } catch (_) {} return; }
    if (voiceSession) {
      startVoiceCapture();
      return;
    }
    voiceSession = true;
    startVoiceCapture();
  });

  $("voice-session")?.addEventListener("click", () => {
    $("voice-disclosure").hidden = false;
    if (voiceSession) {
      stopVoiceSession();
      toast("Voice chat stopped.");
      return;
    }
    if (!speech) {
      toast("Hands-free voice chat needs a browser with speech recognition support (Chrome or Edge).");
      return;
    }
    if (!("speechSynthesis" in window)) {
      toast("Voice replies are unavailable in this browser.");
      return;
    }
    voiceSession = true;
    const vs = $("voice-session");
    if (vs) {
      vs.classList.add("selected");
      vs.setAttribute("aria-pressed", "true");
      vs.textContent = "Voice chat on";
    }
    toast("Voice chat started. Speak naturally; press Voice chat again to stop.");
    startVoiceCapture();
  });

  $("stop-vocal")?.addEventListener("click", () => {
    if ("speechSynthesis" in window) {
      speechSynthesis.cancel();
    }
    showStopVocal(false);
    toast("Voix arrêtée.");
  });

  document.addEventListener("keydown", event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); $("new-chat").click(); }
  });

  window.addEventListener("message", async event => {
    if (event.origin !== window.location.origin) return;
    if (event.data?.type === "google_credential" && event.data.credential) {
      try {
        await api("/api/auth/google", { method: "POST", body: JSON.stringify({ credential: event.data.credential }) });
        await load();
      } catch (err) {
        $("auth-error").textContent = err.message;
      }
    }
  });

  load();
})();
