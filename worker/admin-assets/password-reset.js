(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const base = String(window.PORTFOLIO_API_BASE || "").replace(/\/$/, "");
  let codeTurnstileToken = "", resetTurnstileToken = "", turnstileLoadPromise = null, qrTimer = null;

  const api = async (path, options = {}) => {
    const response = await fetch(base + path, {
      ...options,
      credentials: "include",
      headers: {
        "content-type": "application/json",
        "accept": "application/json",
        ...(options.headers || {})
      }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw Object.assign(new Error(data.error || "The server could not complete this request."), {
        code: data.code || null,
        status: response.status
      });
    }
    return data;
  };

  const body = value => JSON.stringify(value);
  const searchParams = new URLSearchParams(window.location.search);
  const resetToken = (searchParams.get("token") || "").trim();
  const targetEmail = (searchParams.get("email") || "").trim().toLowerCase();

  // --------------------------------------------------------------------------
  // FLOW A: TOKEN PRESENT -> SET NEW PASSWORD
  // --------------------------------------------------------------------------
  if (resetToken && targetEmail) {
    if ($("recovery-options-view")) $("recovery-options-view").hidden = true;
    if ($("set-password-view")) $("set-password-view").hidden = false;
    if ($("display-reset-email")) $("display-reset-email").value = targetEmail;

    async function validateToken() {
      try {
        await api(`/api/auth/password/reset/validate?token=${encodeURIComponent(resetToken)}&email=${encodeURIComponent(targetEmail)}`);
        if ($("token-validating")) $("token-validating").hidden = true;
        if ($("set-password-form")) $("set-password-form").hidden = false;
        if ($("new-password")) $("new-password").focus();
      } catch (err) {
        if ($("token-validating")) $("token-validating").hidden = true;
        const errMsg = err.code === "RESET_EXPIRED"
          ? "This password reset link has expired (links expire in 10 minutes). Please request a new link."
          : (err.message || "This password reset link is invalid or has already been used.");
        if ($("set-password-error")) $("set-password-error").textContent = errMsg;
        if ($("token-invalid-actions")) $("token-invalid-actions").hidden = false;
      }
    }

    const setPwdForm = $("set-password-form");
    if (setPwdForm) {
      setPwdForm.addEventListener("submit", async event => {
        event.preventDefault();
        const errEl = $("set-password-error");
        if (errEl) errEl.textContent = "";

        const password = $("new-password")?.value || "";
        const confirmPassword = $("confirm-password")?.value || "";

        if (password.length < 8) {
          if (errEl) errEl.textContent = "Password must contain at least 8 characters.";
          return;
        }
        if (password !== confirmPassword) {
          if (errEl) errEl.textContent = "Passwords do not match. Please re-enter.";
          return;
        }

        const submitBtn = $("set-password-submit-btn");
        if (submitBtn) submitBtn.disabled = true;

        try {
          await api("/api/auth/password/reset/verify", {
            method: "POST",
            body: body({
              email: targetEmail,
              token: resetToken,
              password,
              confirmPassword
            })
          });

          setPwdForm.hidden = true;
          if ($("set-password-success")) $("set-password-success").hidden = false;
          setTimeout(() => {
            window.location.href = "/account.html?passwordReset=1";
          }, 2000);
        } catch (err) {
          if (errEl) errEl.textContent = err.message || "Failed to update password.";
          if (submitBtn) submitBtn.disabled = false;
        }
      });
    }

    validateToken();
    return;
  }

  // --------------------------------------------------------------------------
  // FLOW B: NO TOKEN -> RECOVERY OPTIONS (Google, Email Code, QR, Reset Link)
  // --------------------------------------------------------------------------
  const emailFromLogin = searchParams.get("email");
  if (emailFromLogin && $("code-email")) $("code-email").value = emailFromLogin.slice(0, 254);
  if (emailFromLogin && $("reset-email")) $("reset-email").value = emailFromLogin.slice(0, 254);

  const error = message => {
    const el = $("reset-error");
    if (el) el.textContent = message || "";
  };

  function setMethod(method) {
    document.querySelectorAll("[data-method]").forEach(button => {
      button.classList.toggle("active", button.dataset.method === method);
    });
    ["email", "qr", "reset"].forEach(name => {
      const panel = $(name + "-panel");
      if (panel) panel.hidden = name !== method;
    });
    error("");
    if (qrTimer) { clearInterval(qrTimer); qrTimer = null; }
  }

  document.querySelectorAll("[data-method]").forEach(button => {
    button.addEventListener("click", () => setMethod(button.dataset.method));
  });

  if (searchParams.get("method") === "reset") {
    setMethod("reset");
  }

  async function loadTurnstile(containerId, setToken) {
    const config = await api("/api/auth/config").catch(() => ({}));
    if (!config.turnstileSiteKey || !$(containerId)) return;
    if (!turnstileLoadPromise) {
      turnstileLoadPromise = new Promise((resolve, reject) => {
        if (window.turnstile) return resolve();
        const script = document.createElement("script");
        script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
        script.async = true; script.defer = true;
        script.onload = resolve;
        script.onerror = () => reject(new Error("Security verification could not load."));
        document.head.append(script);
      });
    }
    await turnstileLoadPromise;
    window.turnstile.render(containerId, {
      sitekey: config.turnstileSiteKey,
      callback: token => setToken(token),
      "expired-callback": () => setToken("")
    });
  }

  // Google OAuth Flow
  async function loadGoogleSignIn() {
    const config = await api("/api/auth/config").catch(() => ({}));
    if (!config.googleClientId) return;
    const fallbackBtn = $("google-fallback-btn");
    if (fallbackBtn) {
      fallbackBtn.onclick = () => {
        const authUrl = "https://accounts.google.com/o/oauth2/v2/auth?" + new URLSearchParams({
          client_id: config.googleClientId,
          redirect_uri: window.location.origin + "/account.html",
          response_type: "id_token",
          scope: "openid email profile",
          nonce: Math.random().toString(36).slice(2)
        });
        const popup = window.open(authUrl, "google-auth", "width=500,height=600");
        if (!popup || popup.closed) window.location.href = authUrl;
      };
    }
  }

  // Handle postMessage from Google popup if opened
  window.addEventListener("message", event => {
    if (event.origin !== window.location.origin) return;
    if (event.data?.type === "GOOGLE_AUTH_SUCCESS" && event.data.idToken) {
      api("/api/auth/google", { method: "POST", body: body({ idToken: event.data.idToken }) })
        .then(() => { window.location.href = "/account.html"; })
        .catch(err => error(err.message));
    }
  });

  // Tab 1: Email Code
  const emailReqForm = $("email-code-request");
  if (emailReqForm) {
    emailReqForm.addEventListener("submit", async event => {
      event.preventDefault(); error("");
      try {
        const email = $("code-email").value.trim();
        await api("/api/auth/request", { method: "POST", body: body({ email, turnstileToken: codeTurnstileToken }) });
        emailReqForm.hidden = true;
        if ($("email-code-verify")) $("email-code-verify").hidden = false;
        if ($("email-code")) $("email-code").focus();
        error("If this address can receive mail, a sign-in code has been sent. Check your inbox.");
      } catch (e) {
        error(e.code === "EMAIL_NOT_CONFIGURED" ? "Email delivery is not configured on this server yet. Site owner must set RESEND_API_KEY." : e.message);
      }
    });
  }

  const emailVerifyForm = $("email-code-verify");
  if (emailVerifyForm) {
    emailVerifyForm.addEventListener("submit", async event => {
      event.preventDefault(); error("");
      try {
        await api("/api/auth/verify", { method: "POST", body: body({ email: $("code-email").value.trim(), code: $("email-code").value.trim() }) });
        window.location.href = "/account.html";
      } catch (e) { error(e.message); }
    });
  }

  // Tab 2: Phone QR Code
  const qrBtn = $("create-qr");
  if (qrBtn) {
    qrBtn.addEventListener("click", async () => {
      error("");
      if ($("qr-wrap")) $("qr-wrap").hidden = true;
      if (qrTimer) clearInterval(qrTimer);
      try {
        const challenge = await api("/api/auth/qr/create", { method: "POST", body: "{}" });
        const link = window.location.origin + "/qr-approve.html?challenge=" + encodeURIComponent(challenge.challengeId) + "&token=" + encodeURIComponent(challenge.token);
        await new Promise((resolve, reject) => {
          if (window.QRCode) return resolve();
          const script = document.createElement("script");
          script.src = "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";
          script.onload = () => window.QRCode ? resolve() : reject(new Error("QR generator could not load."));
          script.onerror = () => reject(new Error("QR generator could not load. Check your connection."));
          document.head.append(script);
        });
        if ($("qr-image")) {
          $("qr-image").replaceChildren();
          new QRCode($("qr-image"), { text: link, width: 220, height: 220, correctLevel: QRCode.CorrectLevel.M });
        }
        if ($("qr-wrap")) $("qr-wrap").hidden = false;
        if ($("qr-status")) $("qr-status").textContent = "Waiting for phone confirmation… This QR expires in two minutes.";
        qrTimer = setInterval(async () => {
          try {
            const result = await api("/api/auth/qr/poll", { method: "POST", body: body({ challengeId: challenge.challengeId, token: challenge.token }) });
            if (result.authenticated) {
              clearInterval(qrTimer);
              qrTimer = null;
              window.location.href = "/account.html";
            }
          } catch (e) {
            clearInterval(qrTimer);
            qrTimer = null;
            if ($("qr-status")) $("qr-status").textContent = e.status === 410 ? "QR expired. Generate a new code." : e.message;
          }
        }, 1800);
      } catch (e) { error(e.message); }
    });
  }

  // Tab 3: Reset Link Request
  const resetReqForm = $("reset-request-form");
  if (resetReqForm) {
    resetReqForm.addEventListener("submit", async event => {
      event.preventDefault(); error("");
      const submitBtn = $("reset-submit-btn");
      if (submitBtn) submitBtn.disabled = true;

      try {
        const email = $("reset-email").value.trim();
        await api("/api/auth/password/reset/request", {
          method: "POST",
          body: body({ email, turnstileToken: resetTurnstileToken })
        });
        resetReqForm.hidden = true;
        if ($("reset-sent-notice")) $("reset-sent-notice").hidden = false;
      } catch (e) {
        if (e.code === "EMAIL_NOT_CONFIGURED") {
          error("Email delivery is not configured on this server yet. Site owner must set RESEND_API_KEY. You can sign in directly with Google above.");
        } else {
          error(e.message || "Failed to send reset link.");
        }
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  loadTurnstile("code-turnstile", token => { codeTurnstileToken = token; }).catch(e => error(e.message));
  loadTurnstile("reset-turnstile", token => { resetTurnstileToken = token; }).catch(e => error(e.message));
  loadGoogleSignIn().catch(() => {});
})();
