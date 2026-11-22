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
    const fallback = $("google-fallback-btn");
    const host = $("google-signin");
    if (fallback) fallback.addEventListener("click", () => {
      if (window.google?.accounts?.id) {
        window.google.accounts.id.prompt(notification => {
          if (notification.isNotDisplayed?.()) {
            const reason = notification.getNotDisplayedReason?.() || "browser_blocked";
            $("auth-error").textContent = "Google sign-in could not open (" + reason + "). Allow Google sign-in pop-ups/cookies, then try again.";
          } else if (notification.isSkippedMoment?.()) {
            $("auth-error").textContent = "Google sign-in was closed before completion. Please try again.";
          }
        });
      } else {
        $("auth-error").textContent = "Google sign-in is still loading or blocked by the browser. Reload the page and allow accounts.google.com.";
      }
    });
    try {
      const config = await api("/api/auth/config");
      if (!config.googleClientId) {
        $("auth-error").textContent = "Google sign-in is not configured on the server.";
        return;
      }
      await new Promise((resolve, reject) => {
        if (window.google?.accounts?.id) return resolve();
        const script = document.createElement("script");
        script.src = "https://accounts.google.com/gsi/client";
        script.async = true;
        script.defer = true;
        script.onload = () => window.google?.accounts?.id ? resolve() : reject(new Error("Google Identity Services did not initialize."));
        script.onerror = () => reject(new Error("Google sign-in script was blocked. Check browser extensions or network access."));
        document.head.append(script);
      });
      window.google.accounts.id.initialize({
        client_id: config.googleClientId,
        auto_select: false,
        ux_mode: "popup",
        callback: async response => {
          if (!response?.credential) {
            $("auth-error").textContent = "Google did not return a sign-in credential. Please try again.";
            return;
          }
          try {
            const result = await api("/api/auth/google", {
              method: "POST",
              body: JSON.stringify({ credential: response.credential })
            });
            if (!result.authenticated) throw new Error("Google sign-in was not completed.");
            location.replace("account.html");
          } catch (error) {
            $("auth-error").textContent = error.message || "Google sign-in failed. Please try again.";
          }
        }
      });
      if (!host) throw new Error("Google sign-in button container is missing.");
      const mount = document.createElement("div");
      mount.id = "google-gis-button";
      host.append(mount);
      window.google.accounts.id.renderButton(mount, {
        theme: "filled_black", size: "large", shape: "pill",
        text: page === "register" ? "signup_with" : "signin_with",
        width: Math.min(320, Math.max(220, host.clientWidth || 320)),
        logo_alignment: "left"
      });
      if (fallback) fallback.hidden = true;
    } catch (error) {
      if ($("auth-error")) $("auth-error").textContent = error.message || "Google sign-in could not be started.";
    }
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
      const email = encodeURIComponent($("login-email").value.trim());
      location.href = "password-reset.html" + (email ? "?email=" + email : "");
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
        $("reset-error").textContent = "";
      } catch (error) {
        if (error.code === "EMAIL_NOT_CONFIGURED") {
          $("reset-error").textContent = "L'envoi d'e-mail n'est pas encore configuré sur le serveur. Si vous possédez un compte Google (@gmail.com), connectez-vous directement via le bouton 'Continuer avec Google'.";
        } else {
          $("reset-error").textContent = error.message;
        }
      }
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
