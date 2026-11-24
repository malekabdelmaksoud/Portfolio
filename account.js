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
  let pendingAttachmentText = "";
  let pendingAttachmentName = "";

  const speech = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  let autoSpeak = false;
  let usedVoice = false;
  let voiceSession = false;
  let voiceState = "idle"; // "idle", "listening", "thinking", "speaking", "paused"
  let isSubmittingVoice = false;
  let voiceRestartTimer = null;
  let ttsKeepaliveTimer = null;
  let ttsWatchdogTimer = null;
  let ttsGenerationId = 0;
  let voiceNetworkFailures = 0;
  let cachedVoices = [];
  let selectedModel = "@cf/meta/llama-3.1-8b-instruct";
  let googleSignInPromise = null;
  try { autoSpeak = localStorage.getItem("portfolio-auto-speak") === "1"; } catch (_) {}
  if ($("voice-auto")) {
    $("voice-auto").setAttribute("aria-pressed", autoSpeak ? "true" : "false");
    $("voice-auto").classList.toggle("selected", autoSpeak);
  }

  function refreshVoices() {
    if (!("speechSynthesis" in window)) return;
    try { cachedVoices = speechSynthesis.getVoices() || []; } catch (_) {}
  }
  if ("speechSynthesis" in window) {
    refreshVoices();
    if ("onvoiceschanged" in speechSynthesis) {
      speechSynthesis.onvoiceschanged = refreshVoices;
    }
  }

  function unlockSpeechSynthesis() {
    if (!("speechSynthesis" in window)) return;
    try {
      const unlock = new SpeechSynthesisUtterance("");
      unlock.volume = 0;
      speechSynthesis.speak(unlock);
    } catch (_) {}
  }

  function cancelSpeech() {
    ttsGenerationId++;
    clearInterval(ttsKeepaliveTimer);
    clearTimeout(ttsWatchdogTimer);
    if ("speechSynthesis" in window) {
      try { speechSynthesis.cancel(); } catch (_) {}
    }
  }

  function showStopVocal(show) {
    const btn = $("stop-vocal");
    if (btn) btn.hidden = !show;
  }

  function setVoiceState(state, message) {
    voiceState = state;
    const bar = $("voice-bar");
    const indicator = $("voice-indicator");
    const stateText = $("voice-state-text");
    const pauseBtn = $("voice-pause-btn");
    const resumeBtn = $("voice-resume-btn");
    const micBtn = $("mic-button");
    const toggleBtn = $("voice-session-btn");

    if (toggleBtn) {
      toggleBtn.setAttribute("aria-pressed", voiceSession ? "true" : "false");
      toggleBtn.classList.toggle("selected", voiceSession);
    }

    if (!voiceSession) {
      if (bar) bar.hidden = true;
      if (micBtn) micBtn.classList.remove("recording");
      showStopVocal(false);
      return;
    }

    if (bar) bar.hidden = false;
    if (indicator) {
      indicator.className = "voice-pulse-ring " + (state !== "idle" ? state : "");
    }

    if (micBtn) {
      micBtn.classList.toggle("recording", state === "listening");
    }

    if (pauseBtn && resumeBtn) {
      if (state === "paused") {
        pauseBtn.hidden = true;
        resumeBtn.hidden = false;
      } else {
        pauseBtn.hidden = false;
        resumeBtn.hidden = true;
      }
    }

    showStopVocal(state === "speaking");

    if (stateText) {
      if (message) {
        stateText.textContent = message;
      } else if (state === "listening") {
        stateText.textContent = "🎙 Écoute en cours… Parlez naturellement";
      } else if (state === "thinking") {
        stateText.textContent = "⏳ Melek AI réfléchit…";
      } else if (state === "speaking") {
        stateText.textContent = "🔊 Melek AI parle… (Cliquez sur le micro pour interrompre)";
      } else if (state === "paused") {
        stateText.textContent = "⏸ Mode vocal en pause";
      } else {
        stateText.textContent = "Mode vocal actif";
      }
    }
  }

  function detectBestLanguage(sampleText) {
    const selector = $("voice-lang-select");
    const manualLang = selector ? selector.value : "auto";
    if (manualLang && manualLang !== "auto") return manualLang;

    const text = String(sampleText || "").trim();
    if (/[\u0600-\u06ff]/.test(text)) return "ar-TN";
    if (/\b(ch(now|nou|nawa)|chnoua|kifech|kifach|labes|lebes|bahi|behi|tawa|taw|nheb|n7eb|3lech|alech|3andi|andi|chbik|chnowa|aaychek|yesser|barsha|barcha|mrigel|mrigla)\b/i.test(text)) return "ar-TN";
    if (/[éèêëàâçîïôûù]/i.test(text) || /\b(bonjour|salut|comment|pourquoi|merci|projet|qui|est|sont|faire)\b/i.test(text)) return "fr-FR";
    if (/\b(the|and|with|for|project|skills|experience|hello|what|who|where|how)\b/i.test(text)) return "en-US";

    const navLang = navigator.language || "";
    if (navLang.startsWith("ar")) return "ar-TN";
    if (navLang.startsWith("fr")) return "fr-FR";
    return "en-US";
  }

  function getRecentConversationText() {
    const messages = $("messages") ? [...$("messages").querySelectorAll(".message-text")] : [];
    if (!messages.length) return "";
    return messages.slice(-3).map(m => m.textContent || "").join(" ");
  }

  function startVoiceCapture() {
    if (!speech || !voiceSession || sending || isSubmittingVoice || voiceState === "paused") return;
    if (recognition) {
      try { recognition.onend = null; recognition.onerror = null; recognition.stop(); } catch (_) {}
      recognition = null;
    }
    cancelSpeech();

    try {
      recognition = new speech();
      const sample = ($("chat-input").value || getRecentConversationText() || "");
      const chosenLang = detectBestLanguage(sample);
      recognition.lang = chosenLang;
      recognition.interimResults = true;
      recognition.continuous = false;
      recognition.maxAlternatives = 1;

      let recognizedSpeech = "";
      let fatalError = false;

      recognition.onstart = () => {
        voiceNetworkFailures = 0;
        setVoiceState("listening");
      };

      recognition.onresult = event => {
        let interim = "";
        let finalChunk = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const trans = event.results[i][0]?.transcript || "";
          if (event.results[i].isFinal) {
            finalChunk += trans;
          } else {
            interim += trans;
          }
        }
        if (finalChunk) recognizedSpeech = (recognizedSpeech + " " + finalChunk).trim();
        const display = (recognizedSpeech + (interim ? " " + interim : "")).trim();
        if (display) $("chat-input").value = display;
      };

      recognition.onerror = event => {
        if (["not-allowed", "service-not-allowed", "audio-capture"].includes(event.error)) {
          fatalError = true;
          toast("Microphone non disponible ou permission refusée. Autorisez le micro dans votre navigateur.");
          stopVoiceSession();
          return;
        }
        if (event.error === "network") {
          voiceNetworkFailures++;
          if (voiceNetworkFailures >= 2) {
            fatalError = true;
            toast("Erreur réseau du service vocal du navigateur. Vérifiez votre connexion ou utilisez Chrome/Edge.");
            stopVoiceSession();
            return;
          }
        }
        if (event.error !== "no-speech" && event.error !== "aborted") {
          console.warn("Speech recognition warning:", event.error);
        }
      };

      recognition.onend = () => {
        recognition = null;
        if (fatalError || !voiceSession || voiceState === "paused") return;

        const captured = ($("chat-input").value || recognizedSpeech || "").trim();
        if (captured && !isSubmittingVoice && !sending) {
          $("chat-input").value = captured;
          isSubmittingVoice = true;
          usedVoice = true;
          setVoiceState("thinking");
          $("chat-form").requestSubmit();
        } else if (voiceSession && voiceState !== "paused" && !sending) {
          clearTimeout(voiceRestartTimer);
          voiceRestartTimer = setTimeout(startVoiceCapture, 350);
        }
      };

      recognition.start();
    } catch (err) {
      recognition = null;
      console.warn("Could not start speech recognition:", err);
      if (voiceSession && !sending && voiceState !== "paused") {
        clearTimeout(voiceRestartTimer);
        voiceRestartTimer = setTimeout(startVoiceCapture, 750);
      }
    }
  }

  async function startVoiceSession() {
    if (!speech) {
      toast("La reconnaissance vocale n'est pas supportée sur ce navigateur (recommandé: Chrome ou Edge).");
      return;
    }
    if (!("speechSynthesis" in window)) {
      toast("La synthèse vocale n'est pas disponible sur ce navigateur.");
      return;
    }
    unlockSpeechSynthesis();
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(t => t.stop());
      } catch (err) {
        if (err && (err.name === "NotAllowedError" || err.name === "PermissionDeniedError")) {
          toast("Permission microphone refusée. Autorisez l'accès au micro dans les paramètres du navigateur.");
          return;
        }
        if (err && err.name === "NotFoundError") {
          toast("Aucun microphone détecté sur cet appareil.");
          return;
        }
      }
    }
    voiceNetworkFailures = 0;
    voiceSession = true;
    $("voice-disclosure").hidden = false;
    toast("Mode vocal actif. Parlez naturellement.");
    setVoiceState("listening");
    startVoiceCapture();
  }

  function stopVoiceSession() {
    voiceSession = false;
    clearTimeout(voiceRestartTimer);
    if (recognition) {
      try { recognition.onend = null; recognition.onerror = null; recognition.stop(); } catch (_) {}
      recognition = null;
    }
    cancelSpeech();
    isSubmittingVoice = false;
    setVoiceState("idle");
    showStopVocal(false);
  }

  function pauseVoiceSession() {
    if ("speechSynthesis" in window && speechSynthesis.speaking) {
      speechSynthesis.pause();
    }
    if (recognition) {
      try { recognition.onend = null; recognition.onerror = null; recognition.stop(); } catch (_) {}
      recognition = null;
    }
    clearTimeout(voiceRestartTimer);
    clearInterval(ttsKeepaliveTimer);
    clearTimeout(ttsWatchdogTimer);
    setVoiceState("paused");
  }

  function resumeVoiceSession() {
    unlockSpeechSynthesis();
    if ("speechSynthesis" in window && speechSynthesis.paused) {
      speechSynthesis.resume();
      setVoiceState("speaking");
      return;
    }
    setVoiceState("listening");
    startVoiceCapture();
  }

  const THEME_MODES = ["dark", "light", "atelier"];
  const THEME_LABELS = {
    dark: { icon: "🌙", label: "Obsidian" },
    light: { icon: "☀️", label: "Daylight" },
    atelier: { icon: "✦", label: "Atelier" }
  };

  function applyTheme(theme) {
    const resolved = THEME_MODES.includes(theme) ? theme : (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
    document.documentElement.setAttribute("data-theme", resolved);
    const btn = $("account-theme");
    const hdrBtn = $("page-theme-toggle");
    const info = THEME_LABELS[resolved] || THEME_LABELS.dark;
    if (btn) {
      btn.textContent = info.icon;
      btn.title = "Theme: " + info.label + " (click to switch)";
      btn.setAttribute("aria-label", "Theme: " + info.label);
    }
    if (hdrBtn) {
      hdrBtn.textContent = `${info.icon} ${info.label}`;
      hdrBtn.title = "Theme: " + info.label + " (click to switch)";
      hdrBtn.setAttribute("aria-label", "Theme: " + info.label);
    }
    try { localStorage.setItem("portfolio-theme", resolved); } catch (_) {}
  }
  let accountTheme = "dark";
  try { accountTheme = localStorage.getItem("portfolio-theme") || "dark"; } catch (_) {}
  if (!THEME_MODES.includes(accountTheme)) accountTheme = "dark";
  applyTheme(accountTheme);
  $("account-theme").addEventListener("click", () => {
    const idx = THEME_MODES.indexOf(accountTheme);
    accountTheme = THEME_MODES[(idx + 1) % THEME_MODES.length];
    applyTheme(accountTheme);
  });
  $("page-theme-toggle")?.addEventListener("click", () => {
    const idx = THEME_MODES.indexOf(accountTheme);
    accountTheme = THEME_MODES[(idx + 1) % THEME_MODES.length];
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
    const renderInline = source => {
      const codeTokens = [];
      let line = escapeHTML(source);
      line = line.replace(/`([^`\n]+)`/g, (_, code) => {
        const marker = "\u0000CODE" + codeTokens.length + "\u0000";
        codeTokens.push("<code>" + code + "</code>");
        return marker;
      });
      line = line.replace(/\[([^\]\n]+)\]\(((?:https?:\/\/|\/)[^\s)]+)\)/gi, (_, label, url) => {
        const isPdf = url.includes("/api/cv.pdf") || url.includes("/cv.pdf") || url.endsWith(".pdf");
        if (isPdf) {
          return '<a href="' + url + '" class="cv-download-btn" download="CV_Melek_Abdelmaksoud.pdf" target="_blank" rel="noopener noreferrer">' + label + "</a>";
        }
        return '<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + label + "</a>";
      });
      line = line
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/~~(.+?)~~/g, "<del>$1</del>")
        .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
      return line.replace(/\u0000CODE(\d+)\u0000/g, (_, index) => codeTokens[Number(index)] || "");
    };

    const lines = String(value ?? "").replace(/\r\n?/g, "\n").split("\n");
    const output = [];
    let paragraph = [];
    let listType = "";
    let listItems = [];
    let quoteLines = [];
    let codeLines = [];
    let codeLanguage = "";
    let inCode = false;

    const flushParagraph = () => {
      if (paragraph.length) {
        output.push("<p>" + paragraph.map(renderInline).join("<br>") + "</p>");
        paragraph = [];
      }
    };
    const flushList = () => {
      if (listItems.length) {
        output.push("<" + listType + ">" + listItems.map(item => "<li>" + renderInline(item) + "</li>").join("") + "</" + listType + ">");
        listItems = [];
        listType = "";
      }
    };
    const flushQuote = () => {
      if (quoteLines.length) {
        output.push("<blockquote>" + quoteLines.map(renderInline).join("<br>") + "</blockquote>");
        quoteLines = [];
      }
    };
    const flushBlocks = () => { flushParagraph(); flushList(); flushQuote(); };

    for (const line of lines) {
      const fence = line.match(/^\s*```([a-z0-9_-]*)\s*$/i);
      if (fence) {
        if (!inCode) {
          flushBlocks();
          inCode = true;
          codeLanguage = fence[1] || "code";
          codeLines = [];
        } else {
          const code = codeLines.join("\n");
          output.push('<div class="code-block"><div class="code-toolbar"><span>' + escapeHTML(codeLanguage) + '</span><button type="button" data-copy-code="' + escapeHTML(code) + '">Copy</button></div><pre><code>' + escapeHTML(code) + "</code></pre></div>");
          inCode = false;
          codeLanguage = "";
          codeLines = [];
        }
        continue;
      }
      if (inCode) { codeLines.push(line); continue; }
      if (!line.trim()) { flushBlocks(); continue; }

      const heading = line.match(/^\s*(#{1,6})\s+(.+)$/);
      if (heading) {
        flushBlocks();
        const level = heading[1].length;
        output.push("<h" + level + ">" + renderInline(heading[2]) + "</h" + level + ">");
        continue;
      }
      const quote = line.match(/^\s*>\s?(.*)$/);
      if (quote) {
        flushParagraph();
        flushList();
        quoteLines.push(quote[1]);
        continue;
      }
      const unordered = line.match(/^\s*[-*+]\s+(.+)$/);
      const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
      if (unordered || ordered) {
        flushParagraph();
        flushQuote();
        const nextType = unordered ? "ul" : "ol";
        if (listType && listType !== nextType) flushList();
        listType = nextType;
        listItems.push((unordered || ordered)[1]);
        continue;
      }
      flushList();
      flushQuote();
      paragraph.push(line);
    }
    if (inCode) {
      const code = codeLines.join("\n");
      output.push('<div class="code-block"><div class="code-toolbar"><span>' + escapeHTML(codeLanguage || "code") + '</span><button type="button" data-copy-code="' + escapeHTML(code) + '">Copy</button></div><pre><code>' + escapeHTML(code) + "</code></pre></div>");
    }
    flushBlocks();
    return output.join("");
  }

  function downloadAiGeneratedCv(messageText) {
    const wrapper = document.createElement("div");
    wrapper.className = "ai-cv-pdf-export";
    wrapper.style.cssText = "position:fixed;left:-10000px;top:0;width:794px;padding:42px 48px;background:#fff;color:#172033;z-index:-1;";

    const content = messageText.cloneNode(true);
    content.querySelectorAll("a,button").forEach(node => {
      node.replaceWith(document.createTextNode(node.textContent || ""));
    });
    content.style.cssText = "display:block;max-width:none;width:100%;color:#172033;background:#fff;font:14px/1.7 Arial,sans-serif;overflow:visible;";
    content.querySelectorAll("h1,h2,h3,h4,strong,b").forEach(node => { node.style.color = "#172033"; });
    content.querySelectorAll("p,li,blockquote").forEach(node => { node.style.color = "#334155"; });
    content.querySelectorAll("code,pre").forEach(node => {
      node.style.color = "#172033";
      node.style.background = "#f1f5f9";
      node.style.whiteSpace = "pre-wrap";
    });
    wrapper.append(content);
    document.body.append(wrapper);

    const filename = "Melek_Abdelmaksoud_CV.pdf";
    if (typeof html2pdf === "function") {
      try {
        const task = html2pdf().set({
          margin: [12, 14, 12, 14],
          filename,
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
          pagebreak: { mode: ["css", "legacy"] }
        }).from(wrapper).save();
        Promise.resolve(task).then(() => toast("CV PDF generated from Melek AI’s response."))
          .catch(error => {
            console.warn("AI CV PDF generation failed:", error);
            toast("Could not generate the PDF. Please try again.");
          }).finally(() => wrapper.remove());
        return;
      } catch (error) {
        console.warn("AI CV PDF generation failed:", error);
      }
    }

    wrapper.remove();
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast("Allow pop-ups to print the AI-generated CV as PDF.");
      return;
    }
    printWindow.document.write("<!doctype html><html><head><title>" + filename + "</title><style>body{font:14px/1.7 Arial,sans-serif;color:#172033;padding:28px}h1,h2,h3{color:#172033}a{color:inherit;text-decoration:none}pre,code{white-space:pre-wrap;background:#f1f5f9;padding:3px}</style></head><body>" + content.innerHTML + "</body></html>");
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 350);
  }

  function formatTime(value) {
    if (!value) return "";
    const date = new Date(value.endsWith("Z") ? value : value + "Z");
    return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function keepLatestMessageVisible(node) {
    if (!node) return;
    requestAnimationFrame(() => {
      const workspace = document.querySelector(".workspace");
      if (workspace) workspace.scrollTop = workspace.scrollHeight;
    });
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
    if (role === "assistant") {
      text.addEventListener("click", event => {
        const cvLink = event.target.closest('a[href*="open_cv=1"][href*="download_cv=1"]');
        if (!cvLink) return;
        event.preventDefault();
        downloadAiGeneratedCv(text);
      });
    }
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
    requestAnimationFrame(() => {
      const workspace = document.querySelector(".workspace");
      if (workspace) workspace.scrollTop = workspace.scrollHeight;
    });
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
    $("mode-chat")?.classList.toggle("selected", mode === "chat");
    $("mode-analyze")?.classList.toggle("selected", mode === "analyze");
    $("mode-search")?.classList.toggle("selected", mode === "search");
    if (mode === "chat") $("mode-hint").textContent = "Direct, concise answers";
    else if (mode === "analyze") $("mode-hint").textContent = "Detailed, structured analysis";
    else if (mode === "search") $("mode-hint").textContent = "Real-time web search (100% free)";
    $("mobile-mode").textContent = mode === "chat" ? "Chat" : (mode === "analyze" ? "Analyze" : "Web");
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
        const response = await fetch(base + "/api/assistant", { method: "POST", credentials: "include", headers: { "content-type": "application/json", "accept": "application/json" }, body: JSON.stringify({ question: content, chat_id: active, mode, history: history.slice(-12), model_id: selectedModel }) });
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
      const attachedTranscript = pendingAttachmentText.slice(0, 12000);
      const userVisibleContent = attachedTranscript ? question + "\n\n[Audio / video transcript]\n" + attachedTranscript : question;
      const savedUser = await api("/api/user/chats/" + encodeURIComponent(active), { method: "POST", body: JSON.stringify({ role: "user", content: userVisibleContent }) });
      addMessage("user", userVisibleContent, true, null, savedUser.id);

      const isWebSearch = mode === "search" || /^\/(?:search|web)\b/i.test(question);
      pending = addMessage("assistant", isWebSearch ? "🌐 Searching the web & thinking…" : (mode === "analyze" ? "Analyzing…" : "Thinking…"), false);
      const textEl = pending.querySelector(".message-text");

      const previousMessages = [...$("messages").querySelectorAll(".message")].slice(-12, -2);
      const history = previousMessages.map(node => ({
        role: node.classList.contains("user") ? "user" : "assistant",
        content: node.querySelector(".message-text")?.textContent || ""
      })).filter(item => item.content.trim());
      const context = history.map(item => item.content);
      const response = await fetch(base + "/api/assistant", {
        method: "POST",
        credentials: "include",
        signal: abortController.signal,
        headers: { "content-type": "application/json", "accept": "text/event-stream, application/json" },
        body: JSON.stringify({
          question,
          chat_id: active,
          mode,
          history,
          context,
          model_id: selectedModel,
          stream: true,
          web_search: isWebSearch,
          attachmentText: attachedTranscript,
          attachmentName: pendingAttachmentName
        })
      });

      let answer = "";
      let webSources = [];

      const sourcesHeader = response.headers.get("x-web-sources");
      if (sourcesHeader) {
        try { webSources = JSON.parse(decodeURIComponent(sourcesHeader)); } catch (_) {}
      }

      if (response.headers.get("content-type")?.includes("text/event-stream") && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = "";
        let firstChunk = true;

        const appendStreamLine = line => {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) return;
          const dataStr = trimmed.slice(5).trim();
          if (!dataStr || dataStr === "[DONE]") return;
          let token = "";
          try {
            const parsed = JSON.parse(dataStr);
            token = parsed.response || parsed.text || parsed.choices?.[0]?.delta?.content || "";
          } catch (_) {
            token = dataStr;
          }
          if (!token) return;
          if (firstChunk) {
            answer = "";
            firstChunk = false;
          }
          answer += token;
          textEl.innerHTML = markdown(answer);
          $("messages").scrollTop = $("messages").scrollHeight;
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) appendStreamLine(line);
        }
        buffer += decoder.decode();
        if (buffer.trim()) {
          for (const line of buffer.split(/\r?\n/)) appendStreamLine(line);
        }
        if (!answer.trim()) answer = "No response available.";
      } else {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "The AI service is unavailable.");
        answer = typeof data.answer === "string" ? data.answer : "No response available.";
        if (Array.isArray(data.search_results) && data.search_results.length) {
          webSources = data.search_results;
        }
      }

      if (pending) { pending.remove(); pending = null; }
      const savedAssistant = await api("/api/user/chats/" + encodeURIComponent(active), { method: "POST", body: JSON.stringify({ role: "assistant", content: answer }) });
      const msgNode = addMessage("assistant", answer, true, null, savedAssistant.id);
      pendingAttachmentText = "";
      pendingAttachmentName = "";

      if (webSources && webSources.length > 0) {
        const bodyEl = msgNode.querySelector(".message-body");
        if (bodyEl) {
          const sourcesEl = document.createElement("div");
          sourcesEl.className = "web-sources";
          const title = document.createElement("span");
          title.className = "web-sources-title";
          title.textContent = "🌐 Sources du Web :";
          sourcesEl.append(title);
          for (const s of webSources) {
            const a = document.createElement("a");
            a.className = "source-chip";
            a.href = s.url || "#";
            a.target = "_blank";
            a.rel = "noopener noreferrer";
            a.textContent = (s.title || s.source || "Source").slice(0, 50);
            sourcesEl.append(a);
          }
          bodyEl.append(sourcesEl);
        }
      }
      const shouldSpeak = voiceSession || autoSpeak || usedVoice;
      usedVoice = false;
      sending = false;
      isSubmittingVoice = false;
      if (shouldSpeak) {
        speakText(answer);
      }
      await refreshChats();
    } catch (error) {
      if (pending) pending.remove();
      if (![...$("messages").querySelectorAll(".message")].some(m => m.textContent?.includes(question))) {
        input.value = question;
      }
      sending = false;
      isSubmittingVoice = false;
      if (voiceSession && voiceState !== "paused") {
        setVoiceState("listening");
        clearTimeout(voiceRestartTimer);
        voiceRestartTimer = setTimeout(startVoiceCapture, 500);
      }
      if (error.name !== "AbortError") toast(error.message);
      else toast("Generation stopped.");
    } finally {
      sending = false;
      isSubmittingVoice = false;
      abortController = null;
      $("send-message").disabled = false;
      $("stop-generation").hidden = true;
      input.focus();
      if (voiceSession && !recognition && !speechSynthesis?.speaking && !speechSynthesis?.pending) setTimeout(startVoiceCapture, 350);
    }
  }

  function splitSpeechChunks(text) {
    const sentences = String(text || "").match(/[^.!?؟\n]+[.!?؟\n]*/g) || [text];
    const chunks = [];
    let current = "";
    for (const raw of sentences) {
      const part = raw.trim();
      if (!part) continue;
      if ((current + " " + part).trim().length <= 160) {
        current = (current + " " + part).trim();
      } else {
        if (current) chunks.push(current);
        if (part.length <= 160) {
          current = part;
        } else {
          const words = part.split(/\s+/);
          let buf = "";
          for (const w of words) {
            if ((buf + " " + w).trim().length > 160 && buf) {
              chunks.push(buf);
              buf = w;
            } else {
              buf = (buf + " " + w).trim();
            }
          }
          current = buf;
        }
      }
    }
    if (current) chunks.push(current);
    return chunks;
  }

  function resolveTtsVoice(targetLang) {
    refreshVoices();
    const voices = cachedVoices;
    if (!voices.length) return { voice: null, lang: targetLang === "ar-TN" ? "ar-SA" : targetLang };
    const lower = targetLang.toLowerCase();
    const prefix = lower.slice(0, 2);
    const exact = voices.find(v => v.lang.toLowerCase() === lower);
    if (exact) return { voice: exact, lang: exact.lang };
    if (prefix === "ar") {
      const arFallback = voices.find(v => ["ar-sa", "ar-eg", "ar-ae", "ar-001"].includes(v.lang.toLowerCase())) ||
        voices.find(v => v.lang.toLowerCase().startsWith("ar"));
      if (arFallback) return { voice: arFallback, lang: arFallback.lang };
      return { voice: null, lang: "ar-SA" };
    }
    const prefixMatch = voices.find(v => v.lang.toLowerCase().startsWith(prefix));
    if (prefixMatch) return { voice: prefixMatch, lang: prefixMatch.lang };
    return { voice: null, lang: targetLang };
  }

  function speakText(text) {
    if (!("speechSynthesis" in window)) {
      toast("Synthèse vocale indisponible sur ce navigateur.");
      if (voiceSession && voiceState !== "paused") {
        clearTimeout(voiceRestartTimer);
        voiceRestartTimer = setTimeout(startVoiceCapture, 400);
      }
      return;
    }
    cancelSpeech();
    clearTimeout(voiceRestartTimer);
    const genId = ttsGenerationId;

    const cleanText = String(text || "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/https?:\/\/\S+/g, "")
      .replace(/```[\s\S]*?```/g, "Code source.")
      .replace(/[*_#`~[\]()]/g, "")
      .replace(/[•–—]/g, ", ")
      .replace(/\s+/g, " ")
      .trim();

    if (!cleanText) {
      if (voiceSession && voiceState !== "paused") {
        setVoiceState("listening");
        voiceRestartTimer = setTimeout(startVoiceCapture, 300);
      }
      return;
    }

    const isArabic = /[\u0600-\u06ff]/.test(cleanText);
    const isEnglish = /\b(the|and|with|for|project|skills|experience|hello|this|that)\b/i.test(cleanText);
    const targetLang = isArabic ? "ar-TN" : isEnglish ? "en-US" : "fr-FR";
    const { voice, lang } = resolveTtsVoice(targetLang);
    const chunks = splitSpeechChunks(cleanText);
    let idx = 0;

    function finishSpeaking() {
      if (genId !== ttsGenerationId) return;
      clearInterval(ttsKeepaliveTimer);
      clearTimeout(ttsWatchdogTimer);
      showStopVocal(false);
      if (voiceSession && voiceState !== "paused") {
        setVoiceState("listening");
        clearTimeout(voiceRestartTimer);
        voiceRestartTimer = setTimeout(startVoiceCapture, 350);
      }
    }

    function speakNextChunk() {
      if (genId !== ttsGenerationId) return;
      if (idx >= chunks.length) {
        finishSpeaking();
        return;
      }
      const chunk = chunks[idx++];
      const utterance = new SpeechSynthesisUtterance(chunk);
      utterance.lang = lang;
      if (voice) utterance.voice = voice;
      utterance.rate = 1.0;
      utterance.pitch = 1.0;

      let settled = false;
      const onChunkDone = () => {
        if (settled || genId !== ttsGenerationId) return;
        settled = true;
        clearTimeout(ttsWatchdogTimer);
        speakNextChunk();
      };

      utterance.onstart = () => {
        if (genId !== ttsGenerationId) return;
        setVoiceState("speaking");
        showStopVocal(true);
      };
      utterance.onend = onChunkDone;
      utterance.onerror = () => onChunkDone();

      clearTimeout(ttsWatchdogTimer);
      ttsWatchdogTimer = setTimeout(onChunkDone, Math.max(6000, chunk.length * 110));
      try {
        speechSynthesis.speak(utterance);
      } catch (_) {
        onChunkDone();
      }
    }

    setVoiceState("speaking");
    showStopVocal(true);
    ttsKeepaliveTimer = setInterval(() => {
      if (genId !== ttsGenerationId) {
        clearInterval(ttsKeepaliveTimer);
        return;
      }
      if ("speechSynthesis" in window && speechSynthesis.speaking && !speechSynthesis.paused) {
        try { speechSynthesis.resume(); } catch (_) {}
      }
    }, 4000);

    setTimeout(() => {
      if (genId === ttsGenerationId) speakNextChunk();
    }, 60);
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

  async function transcribeAudioChunk(blob) {
    const form = new FormData();
    form.append("audio", blob, "melek-audio.webm");
    const response = await fetch(base + "/api/transcribe", {
      method: "POST", credentials: "include", headers: { accept: "application/json" }, body: form
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Audio transcription failed.");
    return data;
  }

  function formatTranscriptTime(seconds) {
    const value = Math.max(0, Math.floor(seconds || 0));
    return "[" + String(Math.floor(value / 60)).padStart(2, "0") + ":" + String(value % 60).padStart(2, "0") + "]";
  }

  let micWhisperStream = null;
  let micWhisperRecorder = null;
  let micWhisperParts = [];
  let micWhisperQueue = Promise.resolve();
  let micWhisperOffset = 0;

  async function stopMicWhisperCapture() {
    const button = $("mic-button");
    if (micWhisperRecorder && micWhisperRecorder.state !== "inactive") {
      button.textContent = "⌛";
      button.disabled = true;
      micWhisperRecorder.stop();
      return;
    }
    if (micWhisperStream) micWhisperStream.getTracks().forEach(track => track.stop());
    micWhisperStream = null;
    button.disabled = false;
    button.classList.remove("recording");
    button.textContent = "🎙";
  }

  async function startMicWhisperCapture() {
    const button = $("mic-button");
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      toast("Microphone recording needs a supported browser and HTTPS.");
      return;
    }
    try {
      micWhisperStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
      micWhisperRecorder = new MediaRecorder(micWhisperStream, { mimeType });
      micWhisperParts = [];
      micWhisperQueue = Promise.resolve();
      micWhisperOffset = 0;
      micWhisperRecorder.ondataavailable = event => {
        if (!event.data || event.data.size < 256) return;
        const offset = micWhisperOffset;
        micWhisperOffset += 20;
        micWhisperQueue = micWhisperQueue.then(async () => {
          const result = await transcribeAudioChunk(event.data);
          if (result.text) micWhisperParts.push(formatTranscriptTime(offset) + (result.language ? " [language: " + result.language + "] " : " ") + result.text);
        }).catch(error => micWhisperParts.push("[Transcription issue: " + error.message + "]"));
      };
      micWhisperRecorder.onstop = async () => {
        try {
          await micWhisperQueue;
          const transcript = micWhisperParts.join("\n").trim();
          if (!transcript || !micWhisperParts.some(part => !part.startsWith("[Transcription issue"))) {
            toast(transcript || "No clear speech was recognized.");
          } else {
            pendingAttachmentText = transcript.slice(0, 12000);
            pendingAttachmentName = "Microphone audio transcript";
            $("chat-input").value = /[\u0600-\u06ff]/.test(transcript)
              ? "افهم كلامي وحلّل المطلوب وجاوبني بالتونسي إذا نحكي بالتونسي."
              : /\[language: fr\]/i.test(transcript) ? "Comprends ma demande orale et réponds naturellement en français."
              : "Understand my spoken request and reply naturally in the language I used.";
            $("chat-form").requestSubmit();
          }
        } catch (error) { toast(error.message); }
        finally {
          if (micWhisperStream) micWhisperStream.getTracks().forEach(track => track.stop());
          micWhisperStream = null;
          micWhisperRecorder = null;
          button.disabled = false;
          button.classList.remove("recording");
          button.textContent = "🎙";
        }
      };
      micWhisperRecorder.start(20000);
      button.classList.add("recording");
      button.textContent = "■";
      toast("Recording started. Speak naturally in Arabic, Tunisian, French, English or another language; press the microphone again to send.");
    } catch (error) {
      if (micWhisperStream) micWhisperStream.getTracks().forEach(track => track.stop());
      micWhisperStream = null;
      button.textContent = "🎙";
      toast(error.message || "Microphone permission is required.");
    }
  }

  $("audio-upload-button")?.addEventListener("click", () => $("audio-upload")?.click());
  $("audio-upload")?.addEventListener("change", async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("audio/")) {
      toast("Choose an audio file, or paste the transcript of a YouTube video.");
      event.target.value = "";
      return;
    }
    try {
      toast("Transcribing audio…");
      const result = await transcribeAudioChunk(file);
      pendingAttachmentText = (result.language ? "[Detected language: " + result.language + "]\n" : "") + result.text;
      pendingAttachmentName = file.name;
      $("chat-input").value = /[\u0600-\u06ff]/.test(result.text)
        ? "حلّل التسجيل الصوتي، لخّص أهم الأفكار وجاوبني بالتونسي إذا الكلام تونسي."
        : result.language === "fr" ? "Analyse cet enregistrement, résume les idées principales et explique les points importants."
        : "Analyze this audio recording, summarize its main ideas and explain the important points.";
      $("chat-form").requestSubmit();
    } catch (error) { toast(error.message); }
    finally { event.target.value = ""; }
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
  if ($("mode-search")) $("mode-search").addEventListener("click", () => setMode("search"));
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

  $("mic-button")?.addEventListener("click", () => {
    $("voice-disclosure").hidden = false;
    unlockSpeechSynthesis();
    if (!speech) {
      toast("La reconnaissance vocale n'est pas supportée sur ce navigateur (recommandé: Chrome ou Edge).");
      return;
    }
    // If AI is currently speaking, user tapping mic interrupts AI immediately!
    if (voiceState === "speaking" || ("speechSynthesis" in window && speechSynthesis.speaking)) {
      cancelSpeech();
      setVoiceState("listening");
      startVoiceCapture();
      return;
    }
    if (voiceSession) {
      if (recognition) {
        try { recognition.stop(); } catch (_) {}
      } else {
        startVoiceCapture();
      }
      return;
    }
    startVoiceSession();
  });

  $("voice-session-btn")?.addEventListener("click", () => {
    $("voice-disclosure").hidden = false;
    unlockSpeechSynthesis();
    if (voiceSession) {
      stopVoiceSession();
      toast("Mode vocal désactivé.");
      return;
    }
    startVoiceSession();
  });

  $("voice-lang-select")?.addEventListener("change", () => {
    if (voiceSession && voiceState === "listening") {
      startVoiceCapture();
    }
  });

  $("voice-pause-btn")?.addEventListener("click", () => {
    pauseVoiceSession();
    toast("Mode vocal en pause.");
  });

  $("voice-resume-btn")?.addEventListener("click", () => {
    resumeVoiceSession();
    toast("Mode vocal repris.");
  });

  $("voice-stop-btn")?.addEventListener("click", () => {
    stopVoiceSession();
    toast("Mode vocal arrêté.");
  });

  $("stop-vocal")?.addEventListener("click", () => {
    cancelSpeech();
    showStopVocal(false);
    if (voiceSession && voiceState !== "paused") {
      setVoiceState("listening");
      clearTimeout(voiceRestartTimer);
      voiceRestartTimer = setTimeout(startVoiceCapture, 300);
    }
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
