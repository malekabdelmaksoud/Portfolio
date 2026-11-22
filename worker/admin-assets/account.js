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
  let turnstileToken = "";
  const speech = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  let autoSpeak = false;
  let usedVoice = false;
  let selectedModel = "melek-ai-v1";
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
    if (!response.ok) throw new Error(data.error || "The server could not complete this request.");
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

  function addMessage(role, content, withActions = true, createdAt = null) {
    const node = document.createElement("article");
    node.className = "message " + (role === "user" ? "user" : "assistant");
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
        const button = document.createElement("div");
        button.setAttribute("role", "button");
        button.tabIndex = 0;
        button.className = "chat-item" + (chat.id === active ? " active" : "");
        const title = document.createElement("span");
        title.className = "chat-name";
        title.textContent = chat.title || "New chat";
        const menu = document.createElement("button");
        menu.type = "button";
        menu.className = "chat-menu";
        menu.textContent = "···";
        menu.title = "Conversation options";
        menu.addEventListener("click", async event => {
          event.stopPropagation();
          const action = prompt("Type rename or delete:", "rename");
          if (action === "rename") {
            const next = prompt("New title:", chat.title);
            if (next?.trim()) {
              try {
                await api("/api/user/chats/" + encodeURIComponent(chat.id), { method: "PUT", body: JSON.stringify({ title: next.trim() }) });
                await refreshChats();
                if (active === chat.id) $("conversation-head").textContent = next.trim();
              } catch (error) { toast(error.message); }
            }
          } else if (action === "delete") await deleteChat(chat.id);
        });
        button.append(title, menu);
        button.addEventListener("click", () => openChat(chat.id));
        button.addEventListener("keydown", event => {
          if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openChat(chat.id); }
        });
        list.append(button);
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
    (data.messages || []).forEach(message => addMessage(message.role, message.content, true, message.created_at));
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
    if (!confirm("Permanently delete this conversation?")) return;
    await api("/api/user/chats/" + encodeURIComponent(id), { method: "DELETE" });
    if (active === id) {
      active = null;
      try { localStorage.removeItem("melek_active_chat_id"); } catch (_) {}
      $("conversation").hidden = true;
      $("welcome").hidden = false;
      $("messages").replaceChildren();
    }
    await refreshChats();
    toast("Conversation deleted.");
  }

  function setMode(next) {
    mode = next;
    $("mode-chat").classList.toggle("selected", mode === "chat");
    $("mode-analyze").classList.toggle("selected", mode === "analyze");
    $("mode-hint").textContent = mode === "chat" ? "Direct, concise answers" : "Detailed, structured analysis";
    $("mobile-mode").textContent = mode === "chat" ? "Chat" : "Analyze";
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
      await api("/api/user/chats/" + encodeURIComponent(active), { method: "POST", body: JSON.stringify({ role: "user", content: question }) });
      addMessage("user", question);
      pending = addMessage("assistant", mode === "analyze" ? "Analyzing…" : "Thinking…", false);
      const context = [...$("messages").querySelectorAll(".message")].slice(-8, -1).map(node => node.querySelector(".message-text")?.textContent || "");
      const response = await fetch(base + "/api/assistant", {
        method: "POST",
        credentials: "include",
        signal: abortController.signal,
        headers: { "content-type": "application/json", "accept": "application/json" },
        body: JSON.stringify({ question, mode, context, model_id: selectedModel })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "The AI service is unavailable.");
      const answer = typeof data.answer === "string" ? data.answer : "No response available.";
      if (pending) { pending.remove(); pending = null; }
      await api("/api/user/chats/" + encodeURIComponent(active), { method: "POST", body: JSON.stringify({ role: "assistant", content: answer }) });
      addMessage("assistant", answer);
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
    utterance.onend = () => showStopVocal(false);
    utterance.onerror = () => showStopVocal(false);
    speechSynthesis.speak(utterance);
  }

  function showAuth() {
    $("auth-screen").hidden = false;
    $("app-shell").hidden = true;
  }

  function showApp() {
    $("auth-screen").hidden = true;
    $("app-shell").hidden = false;
  }

  async function loadTurnstile() {
    try {
      const config = await api("/api/auth/config");
      if (!config.turnstileSiteKey) return;
      await new Promise((resolve, reject) => {
        if (window.turnstile) return resolve();
        const script = document.createElement("script");
        script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
        script.onload = resolve;
        script.onerror = () => reject(new Error("Turnstile could not load."));
        document.head.append(script);
      });
      window.turnstile.render("turnstile-wrap", {
        sitekey: config.turnstileSiteKey,
        callback: token => { turnstileToken = token; },
        "expired-callback": () => { turnstileToken = ""; }
      });
    } catch (error) { toast(error.message); }
  }

  async function loadGoogleSignIn() {
    try {
      const config = await api("/api/auth/config");
      if (!config.googleClientId) {
        $("google-signin").hidden = true;
        $("email-divider").hidden = false;
        return;
      }
      await new Promise((resolve, reject) => {
        if (window.google?.accounts?.id) return resolve();
        const script = document.createElement("script");
        script.src = "https://accounts.google.com/gsi/client";
        script.async = true;
        script.defer = true;
        script.onload = resolve;
        script.onerror = () => reject(new Error("Google sign-in could not load."));
        document.head.append(script);
      });
      window.google.accounts.id.initialize({
        client_id: config.googleClientId,
        callback: async response => {
          $("auth-error").textContent = "";
          try {
            await api("/api/auth/google", { method: "POST", body: JSON.stringify({ credential: response.credential }) });
            await load();
          } catch (error) { $("auth-error").textContent = error.message; }
        }
      });
      window.google.accounts.id.renderButton($("google-signin"), {
        theme: "outline",
        size: "large",
        shape: "pill",
        text: "continue_with",
        width: 320
      });
      $("email-divider").hidden = false;
    } catch (error) {
      $("google-signin").hidden = true;
      $("auth-error").textContent = error.message;
    }
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
        $("inference-status").textContent = "Inference: " + (status.inference_available ? "available" : "approved-facts-only");
      }
    } catch (_) {}
    await loadTurnstile();
    await loadGoogleSignIn();
    try {
      const me = await api("/api/user/me");
      showApp();
      $("identity").textContent = me.user.email;
      $("status").textContent = "Verified · private history";
      await loadModels();
      await refreshChats();
      let lastActiveId = null;
      try { lastActiveId = localStorage.getItem("melek_active_chat_id"); } catch (_) {}
      const targetChat = (lastActiveId && chats.find(c => c.id === lastActiveId)) || chats[0];
      if (targetChat) await openChat(targetChat.id);
    } catch (error) {
      showAuth();
      $("auth-error").textContent = error.auth ? "Enter your email to receive a sign-in code." : error.message;
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
    } catch (error) { $("auth-error").textContent = error.message; }
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

  $("otp-request-form").addEventListener("submit", async event => {
    event.preventEvent = true;
    event.preventDefault();
    const email = $("otp-email").value.trim();
    $("auth-error").textContent = "";
    try {
      await api("/api/auth/request", { method: "POST", body: JSON.stringify({ email, turnstileToken }) });
      $("otp-request-form").hidden = true;
      $("otp-verify-form").hidden = false;
      $("otp-code").focus();
    } catch (error) { $("auth-error").textContent = error.message; }
  });
  $("otp-verify-form").addEventListener("submit", async event => {
    event.preventDefault();
    const email = $("otp-email").value.trim();
    const code = $("otp-code").value.trim();
    $("auth-error").textContent = "";
    try {
      await api("/api/auth/verify", { method: "POST", body: JSON.stringify({ email, code }) });
      await load();
    } catch (error) { $("auth-error").textContent = error.message; }
  });
  $("otp-back").addEventListener("click", () => {
    $("otp-verify-form").hidden = true;
    $("otp-request-form").hidden = false;
    $("otp-code").value = "";
  });

  $("reset-request-form").addEventListener("submit", async event => {
    event.preventDefault();
    const email = $("reset-email").value.trim();
    $("reset-error").textContent = "";
    try {
      await api("/api/auth/password/reset/request", {
        method: "POST",
        body: JSON.stringify({ email, turnstileToken })
      });
      $("reset-request-form").hidden = true;
      $("reset-verify-form").hidden = false;
      $("reset-code").focus();
    } catch (error) { $("reset-error").textContent = error.message; }
  });

  $("reset-verify-form").addEventListener("submit", async event => {
    event.preventDefault();
    $("reset-error").textContent = "";
    try {
      await api("/api/auth/password/reset/verify", {
        method: "POST",
        body: JSON.stringify({
          email: $("reset-email").value.trim(),
          code: $("reset-code").value.trim(),
          password: $("reset-password").value
        })
      });
      $("reset-password").value = "";
      $("reset-code").value = "";
      $("reset-request-form").hidden = false;
      $("reset-verify-form").hidden = true;
      $("password-reset").open = false;
      $("login-email").value = $("reset-email").value.trim();
      $("login-password").value = "";
      $("auth-error").textContent = "Password reset successfully. Sign in with your new password.";
    } catch (error) { $("reset-error").textContent = error.message; }
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
      $("otp-request-form").hidden = false;
      $("otp-verify-form").hidden = true;
      $("otp-email").value = "";
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

  $("mic-button").addEventListener("click", () => {
    $("voice-disclosure").hidden = false;
    if (!speech) {
      toast("Speech recognition is unsupported in this browser.");
      return;
    }
    if (recognition) { recognition.stop(); return; }
    recognition = new speech();
    recognition.lang = /[\u0600-\u06ff]/.test($("chat-input").value) ? "ar-TN" : "fr-FR";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.onstart = () => { $("mic-button").classList.add("recording"); toast("Recording started."); };
    recognition.onresult = event => {
      let finalText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) finalText += event.results[i][0].transcript;
      }
      if (finalText) $("chat-input").value = ($("chat-input").value + " " + finalText).trim();
    };
    recognition.onerror = event => toast("Speech recognition error: " + event.error);
    recognition.onend = () => {
      recognition = null;
      $("mic-button").classList.remove("recording");
      $("chat-input").focus();
      if ($("chat-input").value.trim()) {
        usedVoice = true;
        $("chat-form").requestSubmit();
      }
    };
    recognition.start();
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

  load();
})();
