(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const base = String(window.PORTFOLIO_API_BASE || "").replace(/\\/$/, "");
  let turnstileToken = "";
  const api = async (path, options = {}) => {
    const response = await fetch(base + path, { ...options, credentials: "include", headers: { "content-type": "application/json", "accept": "application/json", ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(data.error || "The server could not complete this request."), { code: data.code || null, status: response.status });
    return data;
  };
  async function loadTurnstile() {
    const config = await api("/api/auth/config");
    if (!config.turnstileSiteKey) return;
    await new Promise((resolve, reject) => {
      if (window.turnstile) return resolve();
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
      script.async = true; script.defer = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error("Security verification could not load."));
      document.head.append(script);
    });
    window.turnstile.render("reset-turnstile-wrap", { sitekey: config.turnstileSiteKey, callback: token => { turnstileToken = token; }, "expired-callback": () => { turnstileToken = ""; } });
  }
  $("reset-request-form").addEventListener("submit", async event => {
    event.preventDefault(); $("reset-error").textContent = "";
    try {
      await api("/api/auth/password/reset/request", { method: "POST", body: JSON.stringify({ email: $("reset-email").value.trim(), turnstileToken }) });
      $("reset-request-form").hidden = true; $("reset-verify-form").hidden = false; $("reset-code").focus();
      $("reset-error").textContent = "If this account exists, a reset code has been sent. Check your inbox.";
    } catch (error) { $("reset-error").textContent = error.code === "EMAIL_NOT_CONFIGURED" ? "Password reset email is not configured yet. The site owner must configure the email provider." : error.message; }
  });
  $("reset-verify-form").addEventListener("submit", async event => {
    event.preventDefault(); $("reset-error").textContent = "";
    try {
      await api("/api/auth/password/reset/verify", { method: "POST", body: JSON.stringify({ email: $("reset-email").value.trim(), code: $("reset-code").value.trim(), password: $("reset-password").value }) });
      location.href = "/account.html?passwordReset=1";
    } catch (error) { $("reset-error").textContent = error.message; }
  });
  loadTurnstile().catch(error => { $("reset-error").textContent = error.message; });
})();