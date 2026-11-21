(() => {
  "use strict";
  const base = String(window.PORTFOLIO_API_BASE || "").replace(/\/$/, "");
  const page = document.body.dataset.authPage;
  const $ = id => document.getElementById(id);
  let turnstileToken = "";

  async function api(path, options = {}) {
    const response = await fetch(base + path, {
      ...options,
      credentials: "include",
      headers: { "content-type": "application/json", accept: "application/json", ...(options.headers || {}) }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "The request could not be completed.");
    return data;
  }

  async function loadTurnstile(elementId) {
    const element = $(elementId);
    if (!element) return;
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
    window.turnstile.render(element, {
      sitekey: config.turnstileSiteKey,
      callback: token => { turnstileToken = token; }
    });
  }

  async function loadGoogle() {
    try {
      const config = await api("/api/auth/config");
      if (!config.googleClientId) return;
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
          try {
            await api("/api/auth/google", { method: "POST", body: JSON.stringify({ credential: response.credential }) });
            location.href = "account.html";
          } catch (error) { $("auth-error").textContent = error.message; }
        }
      });
      window.google.accounts.id.renderButton($("google-signin"), {
        theme: "outline", size: "large", shape: "pill", text: "continue_with", width: 320
      });
    } catch (error) { $("auth-error").textContent = error.message; }
  }

  if (page === "login") {
    $("login-form").addEventListener("submit", async event => {
      event.preventDefault();
      $("auth-error").textContent = "";
      try {
        await api("/api/auth/login", {
          method: "POST",
          body: JSON.stringify({ email: $("login-email").value.trim(), password: $("login-password").value })
        });
        location.href = "account.html";
      } catch (error) { $("auth-error").textContent = error.message; }
    });
    $("forgot-password").addEventListener("click", () => {
      $("reset-panel").hidden = false;
      $("reset-email").value = $("login-email").value.trim();
      loadTurnstile("reset-turnstile").catch(error => { $("reset-error").textContent = error.message; });
    });
    $("reset-request-form").addEventListener("submit", async event => {
      event.preventDefault();
      try {
        await api("/api/auth/password/reset/request", {
          method: "POST",
          body: JSON.stringify({ email: $("reset-email").value.trim(), turnstileToken })
        });
        $("reset-request-form").hidden = true;
        $("reset-verify-form").hidden = false;
        $("reset-code").focus();
      } catch (error) { $("reset-error").textContent = error.message; }
    });
    $("reset-verify-form").addEventListener("submit", async event => {
      event.preventDefault();
      try {
        await api("/api/auth/password/reset/verify", {
          method: "POST",
          body: JSON.stringify({
            email: $("reset-email").value.trim(),
            code: $("reset-code").value.trim(),
            password: $("reset-password").value
          })
        });
        location.href = "login.html";
      } catch (error) { $("reset-error").textContent = error.message; }
    });
  }

  if (page === "register") {
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
        location.href = "account.html";
      } catch (error) { $("auth-error").textContent = error.message; }
    });
  }

  loadGoogle();
})();
