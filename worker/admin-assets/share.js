(() => {
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const token = new URLSearchParams(location.search).get("token") || "";
  const messages = $("messages");
  $("copy-link").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(location.href); $("copy-link").textContent = "Copied"; }
    catch (_) { $("copy-link").textContent = "Copy unavailable"; }
  });
  if (!/^[A-Za-z0-9_-]{32,64}$/.test(token)) { $("title").textContent = "Invalid share link"; $("error").textContent = "This shared conversation link is invalid."; return; }
  fetch("/api/share/" + encodeURIComponent(token), { headers: { "accept": "application/json" }, cache: "no-store" })
    .then(async response => { const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || "Conversation unavailable."); return data; })
    .then(data => {
      $("title").textContent = data.title || "Shared conversation";
      if (data.prompt) { $("prompt").textContent = data.prompt; $("prompt-card").hidden = false; }
      for (const message of (Array.isArray(data.messages) ? data.messages : [])) {
        const node = document.createElement("article");
        node.className = "message " + (message.role === "user" ? "user" : "assistant");
        node.innerHTML = '<div class="avatar">' + (message.role === "user" ? "U" : "AI") + '</div><div class="content"><div class="role">' + (message.role === "user" ? "User" : "Melek AI") + '</div><div class="text">' + esc(message.content) + '</div></div>';
        messages.append(node);
      }
    })
    .catch(error => { $("title").textContent = "Conversation unavailable"; $("error").textContent = error.message; $("copy-link").hidden = true; });
})();