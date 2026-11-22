(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const base = String(window.PORTFOLIO_API_BASE || "").replace(/\/$/, "");
  const params = new URLSearchParams(location.search);
  const challengeId = params.get("challenge") || "", token = params.get("token") || "";
  const api = async (path, options = {}) => {
    const response = await fetch(base + path, { ...options, credentials: "include", headers: { "content-type": "application/json", "accept": "application/json", ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(data.error || "Request failed."), { status: response.status, code: data.code });
    return data;
  };
  let signedIn = false;
  async function checkSession() {
    if (!challengeId || token.length < 32) { $("phone-status").textContent = "This QR link is invalid."; return; }
    try {
      const me = await api("/api/user/me");
      signedIn = !!me.authenticated;
      $("approve-qr").hidden = !signedIn;
      $("phone-status").textContent = signedIn ? "Signed in as " + me.user.email + ". Confirm only if this is your computer." : "Sign in with Google on this phone to approve.";
    } catch (_) { signedIn = false; $("phone-status").textContent = "Sign in with Google on this phone to approve."; }
    if (!signedIn) await setupGoogle();
  }
  async function setupGoogle() {
    try {
      const config = await api("/api/auth/config");
      if (!config.googleClientId) throw new Error("Google sign-in is not configured.");
      await new Promise((resolve, reject) => {
        if (window.google?.accounts?.id) return resolve();
        const script = document.createElement("script"); script.src = "https://accounts.google.com/gsi/client"; script.async = true; script.defer = true;
        script.onload = resolve; script.onerror = () => reject(new Error("Google sign-in could not load."));
        document.head.append(script);
      });
      window.google.accounts.id.initialize({ client_id: config.googleClientId, auto_select: false, ux_mode: "popup", callback: async response => {
        try {
          await api("/api/auth/google", { method: "POST", body: JSON.stringify({ credential: response.credential }) });
          signedIn = true; $("phone-google").hidden = true; $("approve-qr").hidden = false;
          $("phone-status").textContent = "Google verified. Confirm this sign-in on your phone.";
        } catch (e) { $("phone-status").textContent = e.message; }
      }});
      window.google.accounts.id.renderButton($("phone-google"), { theme: "outline", size: "large", shape: "pill", text: "signin_with" });
    } catch (e) { $("phone-status").textContent = e.message; }
  }
  $("approve-qr").addEventListener("click", async () => {
    $("approve-qr").disabled = true; $("phone-status").textContent = "Approving…";
    try {
      await api("/api/auth/qr/approve", { method: "POST", body: JSON.stringify({ challengeId, token }) });
      $("phone-status").textContent = "Approved. Return to your computer; it will sign in automatically.";
      $("approve-qr").hidden = true;
    } catch (e) { $("phone-status").textContent = e.message; $("approve-qr").disabled = false; }
  });
  checkSession();
})();