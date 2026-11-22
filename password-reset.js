(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const base = String(window.PORTFOLIO_API_BASE || "").replace(/\/$/, "");
  let codeTurnstileToken = "", resetTurnstileToken = "", turnstileLoadPromise = null, qrTimer = null;
  const api = async (path, options = {}) => {
    const response = await fetch(base + path, { ...options, credentials: "include", headers: { "content-type": "application/json", "accept": "application/json", ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(data.error || "The server could not complete this request."), { code: data.code || null, status: response.status });
    return data;
  };
  const body = value => JSON.stringify(value);
  const error = message => { $("reset-error").textContent = message || ""; };
  function setMethod(method) {
    document.querySelectorAll("[data-method]").forEach(button => button.classList.toggle("active", button.dataset.method === method));
    ["email","qr","reset"].forEach(name => { $(name + "-panel").hidden = name !== method; });
    error("");
    if (qrTimer) { clearInterval(qrTimer); qrTimer = null; }
  }
  document.querySelectorAll("[data-method]").forEach(button => button.addEventListener("click", () => setMethod(button.dataset.method)));
  async function loadTurnstile(containerId, setToken) {
    const config = await api("/api/auth/config");
    if (!config.turnstileSiteKey) return;
    if (!turnstileLoadPromise) {
      turnstileLoadPromise = new Promise((resolve, reject) => {
        if (window.turnstile) return resolve();
        const script = document.createElement("script");
        script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js"; script.async = true; script.defer = true;
        script.onload = resolve; script.onerror = () => reject(new Error("Security verification could not load."));
        document.head.append(script);
      });
    }
    await turnstileLoadPromise;
    window.turnstile.render(containerId, { sitekey: config.turnstileSiteKey, callback: token => setToken(token), "expired-callback": () => setToken("") });
  }
  $("email-code-request").addEventListener("submit", async event => {
    event.preventDefault(); error("");
    try {
      const email = $("code-email").value.trim();
      await api("/api/auth/request", { method: "POST", body: body({ email, turnstileToken: codeTurnstileToken }) });
      $("email-code-request").hidden = true; $("email-code-verify").hidden = false; $("email-code").focus();
      error("If this address can receive mail, a sign-in code has been sent. Check your inbox.");
    } catch (e) { error(e.code === "EMAIL_NOT_CONFIGURED" ? "Email delivery is not configured yet. The site owner must connect the email provider." : e.message); }
  });
  $("email-code-verify").addEventListener("submit", async event => {
    event.preventDefault(); error("");
    try {
      await api("/api/auth/verify", { method: "POST", body: body({ email: $("code-email").value.trim(), code: $("email-code").value.trim() }) });
      location.href = "/account.html";
    } catch (e) { error(e.message); }
  });
  $("reset-request-form").addEventListener("submit", async event => {
    event.preventDefault(); error("");
    try {
      await api("/api/auth/password/reset/request", { method: "POST", body: body({ email: $("reset-email").value.trim(), turnstileToken: resetTurnstileToken }) });
      $("reset-request-form").hidden = true; $("reset-verify-form").hidden = false; $("reset-code").focus();
      error("If this account has a password, a reset code has been sent. Check your inbox.");
    } catch (e) { error(e.code === "EMAIL_NOT_CONFIGURED" ? "Email delivery is not configured yet. The site owner must connect the email provider." : e.message); }
  });
  $("reset-verify-form").addEventListener("submit", async event => {
    event.preventDefault(); error("");
    try {
      await api("/api/auth/password/reset/verify", { method: "POST", body: body({ email: $("reset-email").value.trim(), code: $("reset-code").value.trim(), password: $("reset-password").value }) });
      location.href = "/account.html?passwordReset=1";
    } catch (e) { error(e.message); }
  });
  $("create-qr").addEventListener("click", async () => {
    error(""); $("qr-wrap").hidden = true;
    if (qrTimer) clearInterval(qrTimer);
    try {
      const challenge = await api("/api/auth/qr/create", { method: "POST", body: "{}" });
      qrChallenge = challenge;
      const link = location.origin + "/qr-approve.html?challenge=" + encodeURIComponent(challenge.challengeId) + "&token=" + encodeURIComponent(challenge.token);
      await new Promise((resolve, reject) => {
        if (window.QRCode) return resolve();
        const script = document.createElement("script");
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";
        script.onload = () => window.QRCode ? resolve() : reject(new Error("QR generator could not load."));
        script.onerror = () => reject(new Error("QR generator could not load. Check your connection."));
        document.head.append(script);
      });
      $("qr-image").replaceChildren();
      new QRCode($("qr-image"), { text: link, width: 220, height: 220, correctLevel: QRCode.CorrectLevel.M });
      $("qr-wrap").hidden = false; $("qr-status").textContent = "Waiting for phone confirmation… This QR expires in two minutes.";
      qrTimer = setInterval(async () => {
        try {
          const result = await api("/api/auth/qr/poll", { method: "POST", body: body({ challengeId: challenge.challengeId, token: challenge.token }) });
          if (result.authenticated) { clearInterval(qrTimer); qrTimer = null; location.href = "/account.html"; }
        } catch (e) {
          clearInterval(qrTimer); qrTimer = null; $("qr-status").textContent = e.status === 410 ? "QR expired. Generate a new code." : e.message;
        }
      }, 1800);
    } catch (e) { error(e.message); }
  });
  loadTurnstile("code-turnstile", token => { codeTurnstileToken = token; }).catch(e => error(e.message));
  loadTurnstile("reset-turnstile", token => { resetTurnstileToken = token; }).catch(e => error(e.message));
})();