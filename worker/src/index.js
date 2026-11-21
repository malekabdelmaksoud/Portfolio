const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin"
};
const enc = new TextEncoder();
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;
let jwksCache;

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...JSON_HEADERS, ...headers }
  });
}

function normalize(value) {
  return String(value ?? "").normalize("NFKD").toLocaleLowerCase()
    .replace(/[\u0300-\u036f\u064b-\u065f\u0670\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي")
    .replace(/[^\p{L}\p{N}+#]+/gu, " ").trim();
}

function parseJson(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function safeId(value) {
  return /^[a-z0-9][a-z0-9_-]{1,79}$/i.test(value);
}

function allowedOrigin(request, env) {
  const origin = request.headers.get("Origin");
  if (!origin) return true;
  const requestOrigin = new URL(request.url).origin;
  const configured = String(env.ALLOWED_ORIGIN || requestOrigin).split(",").map(value => value.trim().replace(/\/$/, "")).filter(Boolean);
  return configured.includes(origin) || origin === requestOrigin || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin");
  const allowed = allowedOrigin(request, env);
  return allowed && origin ? {
    "access-control-allow-origin": origin,
    "vary": "Origin",
    "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
    "access-control-allow-headers": "Content-Type",
    "access-control-allow-credentials": "true"
  } : {};
}

function withCors(response, cors) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(cors)) headers.set(key, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function readBody(request, max = 16000) {
  const raw = await request.text();
  if (raw.length > max) throw apiError("Request body is too large.", "BODY_TOO_LARGE", 413);
  let body;
  try { body = JSON.parse(raw || "{}"); } catch { throw apiError("A valid JSON body is required.", "INVALID_BODY", 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw apiError("A JSON object body is required.", "INVALID_BODY", 400);
  }
  return body;
}

function apiError(message, code, status = 400) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function parseRepositoryUrl(rawUrl, providerHint) {
  let url;
  try { url = new URL(String(rawUrl || "").trim()); } catch (_) {
    throw apiError("Invalid Repository URL.", "INVALID_REPOSITORY_URL", 400);
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash) {
    throw apiError("Invalid Repository URL.", "INVALID_REPOSITORY_URL", 400);
  }
  const provider = String(providerHint || "").toLowerCase();
  if (url.hostname === "github.com" && (!provider || provider === "github")) {
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length !== 2) throw apiError("Invalid Repository URL.", "INVALID_REPOSITORY_URL", 400);
    const owner = decodeURIComponent(parts[0]).replace(/\.git$/i, "");
    const name = decodeURIComponent(parts[1]).replace(/\.git$/i, "");
    if (!/^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/.test(owner) ||
        !/^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/.test(name)) {
      throw apiError("Invalid Repository URL.", "INVALID_REPOSITORY_URL", 400);
    }
    return { provider: "github", owner, name, fullName: owner + "/" + name, canonical: "https://github.com/" + owner + "/" + name };
  }
  if (url.hostname === "gitlab.com" && (!provider || provider === "gitlab")) {
    const parts = url.pathname.split("/").filter(Boolean).map(part => decodeURIComponent(part).replace(/\.git$/i, ""));
    if (parts.length < 2) throw apiError("Invalid Repository URL.", "INVALID_REPOSITORY_URL", 400);
    if (parts.some(part => !/^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/.test(part))) {
      throw apiError("Invalid Repository URL.", "INVALID_REPOSITORY_URL", 400);
    }
    const fullName = parts.join("/");
    const name = parts[parts.length - 1];
    return { provider: "gitlab", owner: parts.slice(0, -1).join("/"), name, fullName, canonical: "https://gitlab.com/" + fullName };
  }
  throw apiError("Invalid Repository URL.", "INVALID_REPOSITORY_URL", 400);
}

function sanitizeRepositoryText(value, limit = 500) {
  return String(value || "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/[`*~>#]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

async function safeApiFetch(url, env, accept = "application/json") {
  const parsed = new URL(url);
  if (!/^https:$/.test(parsed.protocol) ||
      parsed.username || parsed.password || parsed.port ||
      !["api.github.com", "github.com", "raw.githubusercontent.com", "gitlab.com"].includes(parsed.hostname)) {
    throw apiError("Repository API Failure.", "REPOSITORY_API_FAILURE", 502);
  }
  let response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: { accept, "user-agent": "Melek-Portfolio-Repository-Import" },
      redirect: "manual",
      signal: AbortSignal.timeout(8000)
    });
  } catch (_) {
    throw apiError("GitHub/GitLab API Failure.", "REPOSITORY_API_FAILURE", 502);
  }
  if (response.status >= 300 && response.status < 400) {
    throw apiError("GitHub/GitLab API Failure.", "REPOSITORY_API_FAILURE", 502);
  }
  const length = Number(response.headers.get("content-length") || 0);
  if (length > 250000) throw apiError("GitHub/GitLab API Failure.", "REPOSITORY_API_FAILURE", 502);
  if (!response.ok) throw apiError("GitHub/GitLab API Failure.", "REPOSITORY_API_FAILURE", 502);
  const text = await response.text();
  if (text.length > 250000) throw apiError("GitHub/GitLab API Failure.", "REPOSITORY_API_FAILURE", 502);
  return text;
}

function parseJsonText(text, fallback) {
  try { return JSON.parse(text); } catch { return fallback; }
}

async function fetchGitHubRepository(repo, env) {
  const metadataText = await safeApiFetch(
    "https://api.github.com/repos/" + encodeURIComponent(repo.owner) + "/" + encodeURIComponent(repo.name),
    env,
    "application/vnd.github+json"
  );
  const metadata = parseJsonText(metadataText, null);
  if (!metadata || typeof metadata !== "object") throw apiError("GitHub API Failure.", "GITHUB_API_FAILURE", 502);
  if (metadata.private === true || metadata.visibility === "private" || metadata.visibility === "internal") {
    throw apiError("Private Repository.", "PRIVATE_REPOSITORY", 403);
  }
  const defaultBranch = sanitizeRepositoryText(metadata.default_branch || "main", 100);
  const topicsText = await safeApiFetch(
    "https://api.github.com/repos/" + encodeURIComponent(repo.owner) + "/" + encodeURIComponent(repo.name) + "/topics",
    env,
    "application/vnd.github+json"
  ).catch(() => "[]");
  const topicsJson = parseJsonText(topicsText, {});
  const topics = Array.isArray(topicsJson.names) ? topicsJson.names : [];
  const languagesText = await safeApiFetch(
    "https://api.github.com/repos/" + encodeURIComponent(repo.owner) + "/" + encodeURIComponent(repo.name) + "/languages",
    env,
    "application/vnd.github+json"
  ).catch(() => "{}");
  const languagesJson = parseJsonText(languagesText, {});
  const languages = typeof languagesJson === "object" ? Object.keys(languagesJson).filter(Boolean).slice(0, 12) : [];

  let readme = "";
  for (const name of ["README.md", "README.rst", "README"]) {
    try {
      const text = await safeApiFetch(
        "https://api.github.com/repos/" + encodeURIComponent(repo.owner) + "/" + encodeURIComponent(repo.name) +
          "/contents/" + encodeURIComponent(name) + "?ref=" + encodeURIComponent(defaultBranch),
        env,
        "application/vnd.github.raw+json"
      );
      const json = parseJsonText(text, null);
      if (json && typeof json.content === "string") {
        readme = new TextDecoder().decode(Uint8Array.from(atob(json.content.replace(/\n/g, "")), c => c.charCodeAt(0))).slice(0, 5000);
      } else if (typeof text === "string") {
        readme = text.slice(0, 5000);
      }
      if (readme) break;
    } catch (_) {}
  }

  const manifestEvidence = [];
  for (const file of ["package.json","composer.json","pom.xml","requirements.txt","pyproject.toml"]) {
    try {
      const text = await safeApiFetch(
        "https://api.github.com/repos/" + encodeURIComponent(repo.owner) + "/" + encodeURIComponent(repo.name) +
          "/contents/" + encodeURIComponent(file) + "?ref=" + encodeURIComponent(defaultBranch),
        env,
        "application/vnd.github.raw+json"
      );
      const json = parseJsonText(text, null);
      let content = text;
      if (json && typeof json.content === "string") {
        content = new TextDecoder().decode(Uint8Array.from(atob(json.content.replace(/\n/g, "")), c => c.charCodeAt(0))).slice(0, 5000);
      }
      if (content.trim()) manifestEvidence.push({ file, content: content.slice(0, 5000) });
    } catch (_) {}
  }
  return {
    title: sanitizeRepositoryText(metadata.name || repo.name, 120) || repo.name,
    officialDescription: sanitizeRepositoryText(metadata.description, 700),
    topics: topics.map(x => sanitizeRepositoryText(x, 60)).filter(Boolean).slice(0, 12),
    languages: languages.map(x => sanitizeRepositoryText(x, 40)).filter(Boolean).slice(0, 12),
    readme,
    manifests: manifestEvidence,
    defaultBranch
  };
}

async function fetchGitLabRepository(repo, env) {
  const encodedProject = encodeURIComponent(repo.fullName);
  const metadataText = await safeApiFetch("https://gitlab.com/api/v4/projects/" + encodedProject, env);
  const metadata = parseJsonText(metadataText, null);
  if (!metadata || typeof metadata !== "object") throw apiError("GitLab API Failure.", "GITLAB_API_FAILURE", 502);
  if (metadata.visibility === "private") throw apiError("Private Repository.", "PRIVATE_REPOSITORY", 403);
  if (metadata.visibility === "internal") throw apiError("Internal Repository.", "INTERNAL_REPOSITORY", 403);
  if (metadata.visibility !== "public") throw apiError("Only public repositories can be imported.", "PRIVATE_REPOSITORY", 403);
  const defaultBranch = sanitizeRepositoryText(metadata.default_branch || "main", 100);

  let topics = Array.isArray(metadata.tag_list) ? metadata.tag_list : [];
  const languagesText = await safeApiFetch("https://gitlab.com/api/v4/projects/" + encodedProject + "/languages", env).catch(() => "{}");
  const languagesJson = parseJsonText(languagesText, {});
  const languages = typeof languagesJson === "object" ? Object.keys(languagesJson).slice(0, 12) : [];

  let readme = "";
  for (const name of ["README.md", "README.rst", "README"]) {
    try {
      const text = await safeApiFetch(
        "https://gitlab.com/api/v4/projects/" + encodedProject + "/repository/files/" +
          encodeURIComponent(name) + "/raw?ref=" + encodeURIComponent(defaultBranch),
        env
      );
      if (typeof text === "string" && text.trim()) { readme = text.slice(0, 5000); break; }
    } catch (_) {}
  }

  const manifestEvidence = [];
  for (const file of ["package.json","composer.json","pom.xml","requirements.txt","pyproject.toml"]) {
    try {
      const text = await safeApiFetch(
        "https://gitlab.com/api/v4/projects/" + encodedProject + "/repository/files/" +
          encodeURIComponent(file) + "/raw?ref=" + encodeURIComponent(defaultBranch),
        env
      );
      if (text.trim()) manifestEvidence.push({ file, content: text.slice(0, 5000) });
    } catch (_) {}
  }
  return {
    title: sanitizeRepositoryText(metadata.name || repo.name, 120) || repo.name,
    officialDescription: sanitizeRepositoryText(metadata.description, 700),
    topics: topics.map(x => sanitizeRepositoryText(x, 60)).filter(Boolean).slice(0, 12),
    languages: languages.map(x => sanitizeRepositoryText(x, 40)).filter(Boolean).slice(0, 12),
    readme,
    manifests: manifestEvidence,
    defaultBranch
  };
}

function extractReadmeEvidence(readme, limit = 220) {
  const lines = String(readme || "")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s*/gm, "")
    .replace(/^\s{0,3}(?:[-*_]\s*){3,}\s*$/gm, " ")
    .replace(/^\s*(?:>|[-*+]\s+|\d+[.)]\s+)/gm, "")
    .replace(/[`*~|]/g, "")
    .split(/\r?\n/)
    .map(line => sanitizeRepositoryText(line, 500))
    .filter(line =>
      line &&
      line.length >= 20 &&
      !/^(?:build|ci|coverage|license|table of contents|installation|usage|getting started|contributing)$/i.test(line) &&
      !/\b(?:npm install|pip install|docker run|git clone)\b/i.test(line)
    );
  if (!lines.length) return "";

  const selected = [];
  const seen = new Set();
  for (const line of lines) {
    const key = normalize(line).replace(/\s+/g, " ");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    selected.push(line);
    if (selected.join(" ").length >= limit) break;
  }
  return sanitizeRepositoryText(selected.join(" "), limit);
}

function buildImportedProjectDescription(repo, evidence) {
  const languages = evidence.languages;
  const topics = evidence.topics;
  const manifestNames = evidence.manifests.map(item => item.file);
  const evidenceBits = [];
  const seenEvidence = new Set();
  const addEvidence = value => {
    const cleaned = sanitizeRepositoryText(value, 700);
    if (!cleaned) return;
    const key = normalize(cleaned).replace(/\s+/g, " ");
    if (seenEvidence.has(key)) return;
    seenEvidence.add(key);
    evidenceBits.push(cleaned);
  };
  if (evidence.officialDescription) addEvidence(evidence.officialDescription);
  if (languages.length) addEvidence("Languages: " + languages.join(", "));
  if (topics.length) addEvidence("Topics: " + topics.join(", "));
  if (manifestNames.length) addEvidence("Manifests: " + manifestNames.join(", "));

  const readme = extractReadmeEvidence(evidence.readme, 220);
  if (readme) addEvidence("README: " + readme);

  const detail = evidenceBits.join(". ").replace(/\.+$/g, "").slice(0, 900);
  const fr = detail
    ? repo.title + " est un dépôt public " + (repo.provider === "github" ? "GitHub" : "GitLab") + ". " + detail + "."
    : "Les détails vérifiés du dépôt public " + repo.title + " sont limités. Les fonctionnalités ne peuvent pas être confirmées.";
  const en = detail
    ? repo.title + " is a public " + (repo.provider === "github" ? "GitHub" : "GitLab") + " repository. " + detail + "."
    : "Verified details for the public repository " + repo.title + " are limited. Its features cannot be confirmed.";
  return { fr: sanitizeRepositoryText(fr, 2000), en: sanitizeRepositoryText(en, 2000) };
}

function validateFact(x) {
  if (!x || typeof x !== "object") return "A fact object is required.";
  if (!safeId(x.id)) return "ID must contain 2–80 letters, numbers, underscores or hyphens.";
  if (!["profile","contact","education","skills","experience","project","languages"].includes(x.category)) return "Unsupported fact category.";
  for (const k of ["text_fr","text_en","text_ar"]) {
    if (typeof x[k] !== "string" || !x[k].trim() || x[k].length > 3000) return k + " is required (max 3000 characters).";
  }
  if (!Array.isArray(x.aliases) || x.aliases.length > 40 || x.aliases.some(a => typeof a !== "string" || a.length > 100)) return "Aliases must be up to 40 short strings.";
  if (!x.source || typeof x.source.file !== "string" || typeof x.source.selector !== "string") return "A source file and selector are required.";
  if (x.url && (!/^https:\/\//i.test(x.url) || x.url.length > 500)) return "Links must be HTTPS URLs.";
  if (typeof x.approved !== "boolean") return "Approval must be a boolean.";
  return null;
}

function validateProject(x) {
  if (!x || typeof x !== "object") return "A project object is required.";
  if (!safeId(x.id)) return "Project ID is invalid.";
  for (const k of ["title","type","description_fr","description_en"]) {
    if (typeof x[k] !== "string" || !x[k].trim() || x[k].length > 2000) return k + " is required.";
  }
  if (typeof x.url !== "string" || !/^https:\/\//i.test(x.url) || x.url.length > 500) return "Project URL must be HTTPS.";
  if (typeof x.visible !== "boolean") return "Visibility must be boolean.";
  if (!Number.isInteger(x.sort_order) || x.sort_order < 0 || x.sort_order > 10000) return "Sort order is invalid.";
  return null;
}

function b64url(value) {
  const raw = atob(value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(value));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function randomToken(bytes = 32) {
  return [...crypto.getRandomValues(new Uint8Array(bytes))].map(b => b.toString(16).padStart(2, "0")).join("");
}

function ipFrom(request) {
  return request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() || "unknown";
}

async function verifyAdmin(request, env) {
  if (!env.ACCESS_ISSUER || !env.ACCESS_AUD || !env.ADMIN_EMAIL) throw new Error("Admin authentication is not configured.");
  const token = request.headers.get("CF-Access-Jwt-Assertion");
  if (!token) throw new Error("Cloudflare Access authentication is required.");
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid Access token.");
  const header = JSON.parse(new TextDecoder().decode(b64url(parts[0])));
  if (header.alg !== "RS256" || !header.kid) throw new Error("Unsupported Access token signature.");
  const claims = JSON.parse(new TextDecoder().decode(b64url(parts[1])));
  const issuer = env.ACCESS_ISSUER.replace(/\/$/, "");
  const now = Math.floor(Date.now() / 1000);
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (claims.iss !== issuer || !aud.includes(env.ACCESS_AUD) || !claims.exp || claims.exp <= now || (claims.nbf && claims.nbf > now)) throw new Error("Access token claims are invalid.");
  if (String(claims.email || "").toLowerCase() !== env.ADMIN_EMAIL.toLowerCase()) throw new Error("This account is not allowed to administer the portfolio.");
  if (!jwksCache || jwksCache.expires < Date.now()) {
    const response = await fetch(env.ACCESS_JWKS_URL || issuer + "/cdn-cgi/access/certs");
    if (!response.ok) throw new Error("Could not load Cloudflare Access signing keys.");
    jwksCache = { keys: (await response.json()).keys, expires: Date.now() + 300000 };
  }
  const jwk = jwksCache.keys.find(k => k.kid === header.kid);
  if (!jwk) { jwksCache = null; throw new Error("Unknown Access signing key."); }
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64url(parts[2]), enc.encode(parts[0] + "." + parts[1]));
  if (!valid) throw new Error("Access token signature is invalid.");
  return { email: String(claims.email).toLowerCase(), name: claims.name || claims.email };
}

async function abuseCheck(env, key, kind, limit, seconds) {
  const nowIso = new Date().toISOString();
  const row = await env.DB.prepare(
    "INSERT INTO abuse_windows(key,kind,window_started_at,count,updated_at) " +
    "VALUES(?,?,?,1,CURRENT_TIMESTAMP) " +
    "ON CONFLICT(key) DO UPDATE SET " +
    "kind=excluded.kind," +
    "window_started_at=CASE " +
      "WHEN (strftime('%s', excluded.window_started_at) - strftime('%s', abuse_windows.window_started_at)) >= ? " +
      "THEN excluded.window_started_at " +
      "ELSE abuse_windows.window_started_at " +
    "END," +
    "count=CASE " +
      "WHEN (strftime('%s', excluded.window_started_at) - strftime('%s', abuse_windows.window_started_at)) >= ? " +
      "THEN 1 " +
      "ELSE abuse_windows.count + 1 " +
    "END," +
    "updated_at=CURRENT_TIMESTAMP " +
    "RETURNING count"
  ).bind(key, kind, nowIso, seconds, seconds).first();
  return Boolean(row && Number(row.count) <= limit);
}

async function verifyTurnstile(request, env, body) {
  if (!env.TURNSTILE_SECRET) {
    throw apiError("Turnstile verification is not configured.", "TURNSTILE_NOT_CONFIGURED", 503);
  }
  if (!body.turnstileToken) {
    throw apiError("Turnstile verification is required.", "TURNSTILE_REQUIRED", 400);
  }
  const form = new FormData();
  form.append("secret", env.TURNSTILE_SECRET);
  form.append("response", String(body.turnstileToken));
  form.append("remoteip", ipFrom(request));
  let response;
  try {
    response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: form
    });
  } catch (_) {
    throw apiError("Turnstile verification could not be completed.", "TURNSTILE_FAILED", 502);
  }
  const result = await response.json().catch(() => ({ success: false }));
  if (!response.ok || !result.success) {
    throw apiError("Turnstile verification failed.", "TURNSTILE_FAILED", 400);
  }
}

async function sendOtpEmail(env, email, code) {
  if (!env.RESEND_API_KEY) throw apiError("Email delivery is not configured.", "EMAIL_NOT_CONFIGURED", 503);
  if (!env.EMAIL_FROM) throw apiError("The OTP sender is not configured.", "EMAIL_NOT_CONFIGURED", 503);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "authorization": "Bearer " + env.RESEND_API_KEY, "content-type": "application/json" },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [email],
      subject: "Your Melek Portfolio sign-in code",
      text: `Your one-time sign-in code is ${code}. It expires in 10 minutes and can only be used once.`,
      html: `<p>Your one-time sign-in code is:</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p><p>This code expires in 10 minutes and can only be used once.</p>`
    })
  });
  if (!response.ok) throw apiError("The email provider could not deliver the sign-in code.", "EMAIL_DELIVERY_FAILED", 502);
}

function sessionCookie(token, env, remember = true) {
  const maxAge = remember ? 30 * 24 * 60 * 60 : 24 * 60 * 60;
  return `__Host-portfolio_session=${token}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=${maxAge}`;
}

function clearSessionCookie() {
  return "__Host-portfolio_session=; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=0";
}

function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function bytesToBase64url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlToBytes(value) {
  const base64 = String(value).replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - base64.length % 4) % 4);
  return Uint8Array.from(atob(padded), char => char.charCodeAt(0));
}

async function hashPassword(password, salt) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const saltBytes = base64urlToBytes(salt);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: saltBytes, iterations: 100000, hash: "SHA-256" },
    keyMaterial,
    256
  );
  return bytesToBase64url(new Uint8Array(bits));
}

async function getSession(request, env) {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(/(?:^|;\s*)__Host-portfolio_session=([^;]+)/);
  if (!match) throw new Error("Email sign-in is required.");
  const tokenHash = await sha256Hex(match[1] + ":" + (env.SESSION_PEPPER || ""));
  const now = new Date().toISOString();
  const row = await env.DB.prepare(
    "SELECT s.id,s.user_id,s.expires_at,u.email,u.display_name FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? "
  ).bind(tokenHash, now).first();
  if (!row) throw new Error("Email sign-in is required.");
  await env.DB.prepare("UPDATE auth_sessions SET last_seen_at=CURRENT_TIMESTAMP WHERE id=?").bind(row.id).run();
  return { id: row.user_id, email: String(row.email).toLowerCase(), name: row.display_name || row.email };
}

async function authRoutes(request, env, path, method) {
  if (path === "/api/auth/config" && method === "GET") {
    return json({ turnstileSiteKey: env.TURNSTILE_SITE_KEY || null, googleClientId: env.GOOGLE_CLIENT_ID || null });
  }
  if (path === "/api/auth/register" && method === "POST") {
    const body = await readBody(request, 4000);
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const name = String(body.name || "").trim().slice(0, 120);
    if (!EMAIL_RE.test(email) || email.length > 254) return json({ error: "A valid email address is required.", code: "INVALID_EMAIL" }, 400);
    if (password.length < 8 || password.length > 128) return json({ error: "Password must contain 8 to 128 characters.", code: "INVALID_PASSWORD" }, 400);
    const ip = await sha256Hex(ipFrom(request));
    if (!await abuseCheck(env, "register-ip:" + ip, "register-ip", 10, 3600)) return json({ error: "Too many registration attempts. Try again later.", code: "REGISTER_LIMIT" }, 429);
    const existing = await env.DB.prepare("SELECT id,password_hash FROM users WHERE email=?").bind(email).first();
    if (existing?.password_hash) return json({ error: "An account already exists for this email.", code: "EMAIL_EXISTS" }, 409);
    const saltBytes = crypto.getRandomValues(new Uint8Array(16));
    const salt = bytesToBase64url(saltBytes);
    const passwordHash = await hashPassword(password, salt);
    if (existing) {
      await env.DB.prepare(
        "UPDATE users SET display_name=?,password_salt=?,password_hash=?,last_login_at=CURRENT_TIMESTAMP WHERE id=?"
      ).bind(name || existing.email || email, salt, passwordHash, existing.id).run();
    } else {
      await env.DB.prepare(
        "INSERT INTO users(id,email,display_name,password_salt,password_hash,last_login_at) VALUES(?,?,?,?,?,CURRENT_TIMESTAMP)"
      ).bind(crypto.randomUUID(), email, name || email, salt, passwordHash).run();
    }
    const user = await env.DB.prepare("SELECT id,email,display_name FROM users WHERE email=?").bind(email).first();
    const token = await randomToken(32);
    const tokenHash = await sha256Hex(token + ":" + (env.SESSION_PEPPER || ""));
    const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    await env.DB.prepare("INSERT INTO auth_sessions(id,user_id,token_hash,expires_at) VALUES(?,?,?,?)").bind(crypto.randomUUID(), user.id, tokenHash, expires).run();
    return json({ authenticated: true, user: { email: user.email, name: user.display_name || user.email } }, 200, { "set-cookie": sessionCookie(token, env) });
  }
  if (path === "/api/auth/login" && method === "POST") {
    const body = await readBody(request, 4000);
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    if (!EMAIL_RE.test(email) || !password) return json({ error: "Email and password are required.", code: "INVALID_CREDENTIALS" }, 400);
    const ip = await sha256Hex(ipFrom(request));
    if (!await abuseCheck(env, "login-ip:" + ip, "login-ip", 20, 600)) return json({ error: "Too many login attempts. Try again later.", code: "LOGIN_LIMIT" }, 429);
    const user = await env.DB.prepare("SELECT id,email,display_name,password_salt,password_hash FROM users WHERE email=?").bind(email).first();
    if (!user?.password_salt || !user.password_hash) return json({ error: "Email or password is incorrect.", code: "INVALID_CREDENTIALS" }, 401);
    const candidate = await hashPassword(password, user.password_salt);
    if (!timingSafeEqual(candidate, user.password_hash)) return json({ error: "Email or password is incorrect.", code: "INVALID_CREDENTIALS" }, 401);
    await env.DB.prepare("UPDATE users SET last_login_at=CURRENT_TIMESTAMP WHERE id=?").bind(user.id).run();
    const token = await randomToken(32);
    const tokenHash = await sha256Hex(token + ":" + (env.SESSION_PEPPER || ""));
    const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    await env.DB.prepare("INSERT INTO auth_sessions(id,user_id,token_hash,expires_at) VALUES(?,?,?,?)").bind(crypto.randomUUID(), user.id, tokenHash, expires).run();
    return json({ authenticated: true, user: { email: user.email, name: user.display_name || user.email } }, 200, { "set-cookie": sessionCookie(token, env) });
  }
  if (path === "/api/auth/request" && method === "POST") {
    const body = await readBody(request, 4000);
    await verifyTurnstile(request, env, body);
    const email = String(body.email || "").trim().toLowerCase();
    if (!EMAIL_RE.test(email) || email.length > 254) return json({ error: "A valid email address is required.", code: "INVALID_EMAIL" }, 400);
    const ip = await sha256Hex(ipFrom(request));
    if (!await abuseCheck(env, "email:" + await sha256Hex(email), "otp-email", 5, 3600)) return json({ error: "Too many sign-in requests for this email. Try again later." }, 429);
    if (!await abuseCheck(env, "ip:" + ip, "otp-ip", 10, 600)) return json({ error: "Too many sign-in requests from this network. Try again later." }, 429);
    let randomValue;
    do { randomValue = crypto.getRandomValues(new Uint32Array(1))[0]; } while (randomValue >= 4294000000);
    const code = String(randomValue % 1000000).padStart(6, "0");
    const otpHash = await sha256Hex(code + ":" + email + ":" + (env.OTP_PEPPER || ""));
    const id = crypto.randomUUID();
    const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    await env.DB.prepare("UPDATE otp_challenges SET consumed_at=CURRENT_TIMESTAMP WHERE email=? AND consumed_at IS NULL").bind(email).run();
    await env.DB.prepare("INSERT INTO otp_challenges(id,email,otp_hash,expires_at,ip_hash) VALUES(?,?,?,?,?)").bind(id, email, otpHash, expires, ip).run();
    try {
      await sendOtpEmail(env, email, code);
    } catch (error) {
      await env.DB.prepare("DELETE FROM otp_challenges WHERE id=?").bind(id).run();
      throw error;
    }
    return json({ sent: true, expiresInSeconds: 600 });
  }
  if (path === "/api/auth/verify" && method === "POST") {
    const body = await readBody(request, 4000);
    const email = String(body.email || "").trim().toLowerCase();
    const code = String(body.code || "").replace(/\D/g, "").slice(0, 6);
    if (!EMAIL_RE.test(email) || email.length > 254 || !/^\d{6}$/.test(code)) return json({ error: "Email and six-digit code are required.", code: "INVALID_CREDENTIALS" }, 400);
    const ip = await sha256Hex(ipFrom(request));
    if (!await abuseCheck(env, "verify-email:" + await sha256Hex(email), "verify-email", 10, 600)) return json({ error: "Too many verification attempts. Request a new code." }, 429);
    if (!await abuseCheck(env, "verify-ip:" + ip, "verify-ip", 20, 600)) return json({ error: "Too many verification attempts from this network." }, 429);
    const challenge = await env.DB.prepare("SELECT id,otp_hash,expires_at,attempts,consumed_at,ip_hash FROM otp_challenges WHERE email=? AND consumed_at IS NULL ORDER BY created_at DESC, id DESC LIMIT 1").bind(email).first();
    if (!challenge) return json({ error: "No active sign-in code. Request a new code." }, 400);
    if (challenge.ip_hash !== ip) return json({ error: "This code cannot be verified from this network." }, 403);
    if (Date.now() >= Date.parse(challenge.expires_at)) return json({ error: "This code has expired. Request a new code." }, 400);

    const attempt = await env.DB.prepare(
      "UPDATE otp_challenges SET attempts=attempts+1 WHERE id=? AND consumed_at IS NULL AND attempts < 5 RETURNING attempts"
    ).bind(challenge.id).first();
    if (!attempt) return json({ error: "Too many incorrect attempts. Request a new code." }, 429);

    const hash = await sha256Hex(code + ":" + email + ":" + (env.OTP_PEPPER || ""));
    if (!timingSafeEqual(hash, challenge.otp_hash)) {
      return json({ error: "The sign-in code is incorrect." }, 400);
    }
    const consume = await env.DB.prepare("UPDATE otp_challenges SET consumed_at=CURRENT_TIMESTAMP WHERE id=? AND consumed_at IS NULL").bind(challenge.id).run();
    // D1 result metadata is checked to guarantee single use without relying on a browser state.
    if (consume.meta?.changes === 0) return json({ error: "This code has already been used." }, 400);
    await env.DB.prepare("INSERT INTO users(id,email,last_login_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(email) DO UPDATE SET last_login_at=CURRENT_TIMESTAMP").bind(crypto.randomUUID(), email).run();
    const user = await env.DB.prepare("SELECT id,email,display_name FROM users WHERE email=?").bind(email).first();
    if (!user) throw new Error("Could not create the user session.");
    const token = await randomToken(32);
    const tokenHash = await sha256Hex(token + ":" + (env.SESSION_PEPPER || ""));
    const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    await env.DB.prepare("INSERT INTO auth_sessions(id,user_id,token_hash,expires_at) VALUES(?,?,?,?)").bind(crypto.randomUUID(), user.id, tokenHash, expires).run();
    return json({ authenticated: true, user: { email: user.email, name: user.display_name || user.email } }, 200, { "set-cookie": sessionCookie(token, env) });
  }
  if (path === "/api/auth/google" && method === "POST") {
    if (!env.GOOGLE_CLIENT_ID) return json({ error: "Google sign-in is not configured.", code: "GOOGLE_NOT_CONFIGURED" }, 503);
    const body = await readBody(request, 4000);
    const credential = String(body.credential || "").trim();
    if (!credential) return json({ error: "Google credential is required.", code: "INVALID_GOOGLE_CREDENTIAL" }, 400);
    let verification;
    try {
      verification = await fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(credential), { signal: AbortSignal.timeout(8000) });
    } catch (_) {
      return json({ error: "Google sign-in is temporarily unavailable.", code: "GOOGLE_UNAVAILABLE" }, 502);
    }
    const google = await verification.json().catch(() => ({}));
    if (!verification.ok || google.aud !== env.GOOGLE_CLIENT_ID || !["accounts.google.com", "https://accounts.google.com"].includes(google.iss) || !(google.email_verified === "true" || google.email_verified === true)) {
      return json({ error: "The Google identity could not be verified.", code: "INVALID_GOOGLE_CREDENTIAL" }, 401);
    }
    const email = String(google.email || "").trim().toLowerCase();
    if (!EMAIL_RE.test(email) || email.length > 254) return json({ error: "Google returned an invalid email address.", code: "INVALID_GOOGLE_EMAIL" }, 400);
    const name = String(google.name || email).trim().slice(0, 120);
    await env.DB.prepare(
      "INSERT INTO users(id,email,display_name,last_login_at) VALUES(?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(email) DO UPDATE SET display_name=excluded.display_name,last_login_at=CURRENT_TIMESTAMP"
    ).bind(crypto.randomUUID(), email, name).run();
    const user = await env.DB.prepare("SELECT id,email,display_name FROM users WHERE email=?").bind(email).first();
    if (!user) throw new Error("Could not create the Google user session.");
    const token = await randomToken(32);
    const tokenHash = await sha256Hex(token + ":" + (env.SESSION_PEPPER || ""));
    const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    await env.DB.prepare("INSERT INTO auth_sessions(id,user_id,token_hash,expires_at) VALUES(?,?,?,?)").bind(crypto.randomUUID(), user.id, tokenHash, expires).run();
    return json({ authenticated: true, user: { email: user.email, name: user.display_name || user.email } }, 200, { "set-cookie": sessionCookie(token, env) });
  }
  if (path === "/api/auth/logout" && method === "POST") {
    const cookie = request.headers.get("Cookie") || "";
    const match = cookie.match(/(?:^|;\s*)__Host-portfolio_session=([^;]+)/);
    if (match) {
      const tokenHash = await sha256Hex(match[1] + ":" + (env.SESSION_PEPPER || ""));
      await env.DB.prepare("DELETE FROM auth_sessions WHERE token_hash=?").bind(tokenHash).run();
    }
    return json({ loggedOut: true }, 200, { "set-cookie": clearSessionCookie() });
  }
  return null;
}

const STOP = new Set("a an the and or is are was were what who where when why how can could do does did tell about please your you my of to in on for with from at as this that these le la les un une des du de et ou est sont qui quoi comment pourquoi quand ou dans sur pour avec mon ma mes ton ta tes moi je il elle au aux en par d cette ces شنو شنوّة شنوة شنية شنوما شكون وين وقتاش علاش كيفاش كيف نحب نعرف قولي اعطيني وريني من في على الى إلى عن مع و او أو متاع متاعها متاعو متاعك ملاك ماليك زيد زيدني فسرلي فصلي more details explain elaborate encore details explique plus".split(/\s+/));

function terms(value) {
  return new Set(normalize(value).split(/\s+/).filter(x => x.length > 1 && !STOP.has(x)));
}

function abstentionFor(question) {
  if (/[\u0600-\u06ff]/.test(question)) return "المعلومة هاذي موش موجودة في المعلومات المنشورة والمعتمدة في Portfolio. تنجم تتصل بملاك للتأكد.";
  if (/\b(quel|quelle|quels|quelles|est|sont|dans|avec|pour|qui|comment)\b/i.test(question)) return "Cette information n'est pas disponible dans le contenu public approuvé du portfolio. Contactez Melek pour confirmation.";
  return "This detail is not present in the approved public portfolio information. Please contact Melek for confirmation.";
}

async function rankedFacts(env, question, context = "") {
  const q = terms(question);
  const followUp = /\b(more|details|explain|elaborate|encore|explique|plus)\b|زيد|زيدني|فسرلي|فصلي/i.test(normalize(question));
  const searchTerms = followUp && context ? terms(context + " " + question) : q;
  if (!searchTerms.size) return { searchTerms, selected: [] };
  const { results = [] } = await env.DB.prepare("SELECT id,category,text_fr,text_en,text_ar,aliases_json,source_file,source_selector,public_url FROM facts WHERE approved=1").all();
  const { results: projectRows = [] } = await env.DB.prepare(
    "SELECT id,title,type,description_fr,description_en,url,sort_order FROM projects WHERE visible=1 ORDER BY sort_order,title"
  ).all();
  const projectFacts = projectRows.map(project => ({
    id: project.id,
    category: "project",
    text_fr: project.description_fr || project.title,
    text_en: project.description_en || project.title,
    text_ar: project.description_fr || project.title,
    aliases_json: JSON.stringify([project.title, project.type, project.url]),
    source_file: "D1 projects",
    source_selector: "#" + project.id,
    public_url: project.url
  }));
  const ranked = [...results, ...projectFacts].map(f => {
    const hay = terms([f.text_fr, f.text_en, f.text_ar, ...parseJson(f.aliases_json, [])].join(" "));
    const matched = [...searchTerms].filter(t => hay.has(t));
    return { fact: f, coverage: matched.length / searchTerms.size };
  }).filter(x => x.coverage >= 0.5).sort((a, b) => b.coverage - a.coverage);
  const selected = [];
  const seen = new Set();
  for (const row of ranked) {
    if (!seen.has(row.fact.id)) { selected.push(row.fact); seen.add(row.fact.id); }
    if (selected.length >= 3) break;
  }
  return { searchTerms, selected };
}

class MelekInferenceAdapter {
  constructor(env) { this.env = env; }

  async status() {
    const base = String(this.env.MELEK_AI_SERVICE_URL || "").replace(/\/$/, "");
    const result = {
      experimental: true,
      model_id: this.env.MELEK_AI_MODEL_VERSION || "melek-ai-v1",
      training_status: this.env.MELEK_AI_TRAINING_STATUS || "untrained",
      trained_from_scratch: false,
      inference_available: false,
      third_party_fallback_disabled: true
    };
    if (!base || result.training_status !== "trained") return result;
    try {
      const headers = {};
      if (this.env.MELEK_AI_SERVICE_TOKEN) headers.authorization = "Bearer " + this.env.MELEK_AI_SERVICE_TOKEN;
      const response = await fetch(base + "/status", { headers, signal: AbortSignal.timeout(5000) });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.trained_from_scratch === true) {
        result.trained_from_scratch = true;
        result.inference_available = data.inference_available === true;
        result.model_id = data.model_id || result.model_id;
        result.parameter_count = Number.isInteger(data.parameter_count) ? data.parameter_count : null;
      }
    } catch (_) {}
    return result;
  }

  async run(prompt, mode, maxTokens) {
    const base = String(this.env.MELEK_AI_SERVICE_URL || "").replace(/\/$/, "");
    if (!base) throw Object.assign(new Error("Melek AI is in development and no independently trained checkpoint is connected."), { code: "MELEK_AI_NOT_CONNECTED" });
    const allowed = /^https:\/\//i.test(base) || /^http:\/\/(localhost|127\.0\.0\.1)(:|\/)/i.test(base);
    if (!allowed) throw Object.assign(new Error("Melek AI service URL is invalid."), { code: "MELEK_AI_SERVICE_INVALID" });
    const headers = { "content-type": "application/json", "accept": "application/json" };
    if (this.env.MELEK_AI_SERVICE_TOKEN) headers.authorization = "Bearer " + this.env.MELEK_AI_SERVICE_TOKEN;
    let response;
    try {
      response = await fetch(base + "/generate", {
        method: "POST",
        headers,
        body: JSON.stringify({ prompt, mode, max_tokens: maxTokens }),
        signal: AbortSignal.timeout(30000)
      });
    } catch (_) {
      throw Object.assign(new Error("Melek AI is temporarily unavailable."), { code: "MELEK_AI_UNAVAILABLE" });
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(data.error || "Melek AI inference failed."), { code: "MELEK_AI_UNAVAILABLE" });
    if (data.trained_from_scratch !== true || typeof data.text !== "string") {
      throw Object.assign(new Error("The inference service did not return a verified Melek AI checkpoint."), { code: "MELEK_AI_INVALID_CHECKPOINT" });
    }
    return { answer: data.text.trim(), model: data.model_id || this.env.MELEK_AI_MODEL_VERSION || "melek-ai-v1" };
  }
}

async function assistant(request, env) {
  let body;
  try { body = await readBody(request, 8000); } catch { return json({ error: "Invalid request body." }, 400); }
  const question = String(body.question || "").trim().slice(0, 800);
  if (!question) return json({ error: "A question is required." }, 400);
  const mode = body.mode === "analyze" ? "analyze" : "chat";
  const context = Array.isArray(body.context)
    ? body.context.slice(-4).filter(x => typeof x === "string").map(x => x.slice(0, 300)).join(" ")
    : "";
  const ip = await sha256Hex(ipFrom(request));
  if (!await abuseCheck(env, "assistant-ip:" + ip, "assistant-ip", 30, 60)) {
    return json({ error: "The shared assistant is receiving too many requests. Please wait one minute and retry.", code: "BURST_LIMIT" }, 429);
  }

  const { searchTerms, selected } = await rankedFacts(env, question, context);
  if (!searchTerms.size) return json({ answer: /[\u0600-\u06ff]/.test(question) ? "اسأل سؤال واضح ومحدد." : "Please ask a specific question.", mode, sources: [] });
  if (!selected.length) return json({ answer: abstentionFor(question), mode, sources: [] });

  const arabic = /[\u0600-\u06ff]/.test(question);
  const english = /\b(what|who|where|when|which|tell|show|experience|skills|projects|education|do|does|can|could|is|are|your|about|how|please)\b/i.test(question);
  const field = arabic ? "text_ar" : english ? "text_en" : "text_fr";
  const factsText = selected.map((fact, index) =>
    `${index + 1}. ${fact[field]}\nSource: ${fact.source_file} — ${fact.source_selector}`
  ).join("\n\n");
  const system = mode === "analyze"
    ? `You are Melek AI in Analyze mode. Use only the approved portfolio facts below. Provide a structured, technical analysis with concise sections and evidence. Do not invent personal information or claim expertise not supported by facts. Do not expose hidden chain-of-thought or private reasoning. Maximum 1400 tokens.`
    : `You are Melek AI in Chat mode. Use only the approved portfolio facts below. Respond naturally, conversationally and concisely. Do not invent personal information or claim expertise not supported by facts. Maximum 700 tokens.`;

  try {
    const adapter = new MelekInferenceAdapter(env);
    const result = await adapter.run(
      system + "\n\nAPPROVED FACTS:\n" + factsText + "\n\nQUESTION:\n" + question,
      mode,
      mode === "analyze" ? 1400 : 700
    );
    return json({
      answer: result.answer,
      mode,
      model: result.model,
      sources: selected.map(f => ({ id: f.id, category: f.category, source: f.source_file }))
    });
  } catch (error) {
    if (error.code === "MELEK_AI_NOT_CONNECTED") {
      const groundedAnswer = selected.map(fact => fact[field]).filter(Boolean).join("\n\n");
      return json({
        answer: groundedAnswer,
        mode,
        model: "approved-facts-only",
        sources: selected.map(f => ({ id: f.id, category: f.category, source: f.source_file })),
        experimental_inference: false
      });
    }
    return json({
      error: error.message || "Melek AI is temporarily unavailable.",
      code: error.code || "MELEK_AI_UNAVAILABLE",
      mode,
      retryable: true,
      conversation_preserved: true,
      sources: selected.map(f => ({ id: f.id, category: f.category, source: f.source_file }))
    }, 503);
  }
}

async function userChatRoute(request, env, path, method, identity) {
  const chatMatch = path.match(/^\/api\/user\/chats\/([0-9a-f-]{36})$/i);
  if (path === "/api/user/me" && method === "GET") return json({ authenticated: true, user: identity });
  if (path === "/api/user/chats" && method === "GET") {
    const url = new URL(request.url);
    const query = (url.searchParams.get("q") || "").trim().slice(0, 120);
    const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") || 100)));
    const offset = Math.min(1000, Math.max(0, Number(url.searchParams.get("offset") || 0)));
    const pattern = "%" + query.replace(/[%_]/g, "_") + "%";
    const { results = [] } = query
      ? await env.DB.prepare("SELECT DISTINCT c.id,c.title,c.created_at,c.updated_at FROM chats c LEFT JOIN chat_messages m ON m.chat_id=c.id AND m.user_email=c.user_email WHERE c.user_email=? AND (c.title LIKE ? ESCAPE '_' OR m.content LIKE ? ESCAPE '_') ORDER BY c.updated_at DESC LIMIT ? OFFSET ?").bind(identity.email, pattern, pattern, limit, offset).all()
      : await env.DB.prepare("SELECT id,title,created_at,updated_at FROM chats WHERE user_email=? ORDER BY updated_at DESC LIMIT ? OFFSET ?").bind(identity.email, limit, offset).all();
    return json({ chats: results, pagination: { limit, offset } });
  }
  if (path === "/api/user/chats" && method === "POST") {
    const body = await readBody(request, 2000);
    const title = String(body.title || "New conversation").trim().slice(0, 120) || "New conversation";
    const id = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO chats(id,user_email,title) VALUES(?,?,?)").bind(id, identity.email, title).run();
    return json({ chat: { id, title } }, 201);
  }
  if (chatMatch && method === "PUT") {
    const body = await readBody(request, 2000);
    const title = String(body.title || "").trim().slice(0, 120);
    if (!title) return json({ error: "A conversation title is required." }, 400);
    const result = await env.DB.prepare("UPDATE chats SET title=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_email=?").bind(title, chatMatch[1], identity.email).run();
    if (!result.meta?.changes) return json({ error: "Chat not found." }, 404);
    return json({ saved: true, id: chatMatch[1], title });
  }
  if (chatMatch && method === "GET") {
    const url = new URL(request.url);
    const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit") || 500)));
    const offset = Math.min(10000, Math.max(0, Number(url.searchParams.get("offset") || 0)));
    const chat = await env.DB.prepare("SELECT id,title,created_at,updated_at FROM chats WHERE id=? AND user_email=?").bind(chatMatch[1], identity.email).first();
    if (!chat) return json({ error: "Chat not found." }, 404);
    const { results = [] } = await env.DB.prepare("SELECT id,role,content,created_at FROM chat_messages WHERE chat_id=? AND user_email=? ORDER BY created_at,id LIMIT ? OFFSET ?").bind(chat.id, identity.email, limit, offset).all();
    return json({ chat, messages: results, pagination: { limit, offset } });
  }
  if (chatMatch && method === "POST") {
    const body = await readBody(request, 8000);
    const role = body.role;
    const content = String(body.content || "").trim();
    if (!["user","assistant"].includes(role) || !content || content.length > 6000) return json({ error: "Message role or content is invalid." }, 400);
    const exists = await env.DB.prepare("SELECT id FROM chats WHERE id=? AND user_email=?").bind(chatMatch[1], identity.email).first();
    if (!exists) return json({ error: "Chat not found." }, 404);
    const id = crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO chat_messages(id,chat_id,user_email,role,content) VALUES(?,?,?,?,?)").bind(id, chatMatch[1], identity.email, role, content),
      env.DB.prepare("UPDATE chats SET updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_email=?").bind(chatMatch[1], identity.email)
    ]);
    return json({ saved: true, id }, 201);
  }
  if (chatMatch && method === "DELETE") {
    const chat = await env.DB.prepare("SELECT id FROM chats WHERE id=? AND user_email=?").bind(chatMatch[1], identity.email).first();
    if (!chat) return json({ error: "Chat not found." }, 404);
    await env.DB.batch([
      env.DB.prepare("DELETE FROM chat_messages WHERE chat_id=? AND user_email=?").bind(chatMatch[1], identity.email),
      env.DB.prepare("DELETE FROM chats WHERE id=? AND user_email=?").bind(chatMatch[1], identity.email)
    ]);
    return json({ deleted: true });
  }
  if (path === "/api/user/chats" && method === "DELETE") {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM chat_messages WHERE user_email=?").bind(identity.email),
      env.DB.prepare("DELETE FROM chats WHERE user_email=?").bind(identity.email)
    ]);
    return json({ deleted: true });
  }
  return json({ error: "Not found." }, 404);
}

async function adminRoute(request, env, path, method) {
  const actor = await verifyAdmin(request, env);
  if (path === "/api/admin/session" && method === "GET") return json({ authenticated: true, user: actor });
  if (path === "/api/admin/projects/import" && method === "POST") {
    let body;
    try { body = await readBody(request, 4000); } catch (_) {
      throw apiError("Invalid Repository URL.", "INVALID_REPOSITORY_URL", 400);
    }
    const repo = parseRepositoryUrl(body.url, body.provider);
    let evidence;
    if (repo.provider === "github") evidence = await fetchGitHubRepository(repo, env);
    else evidence = await fetchGitLabRepository(repo, env);
    const digest = await sha256Hex("repository:" + repo.canonical);
    const id = "import-" + repo.provider + "-" + digest.slice(0, 32);
    const existing = await env.DB.prepare("SELECT id,url,title FROM projects WHERE id=? OR url=? LIMIT 1").bind(id, repo.canonical).first();
    if (existing) throw apiError("Duplicate Project.", "DUPLICATE_PROJECT", 409);
    const description = buildImportedProjectDescription({ ...repo, title: evidence.title }, evidence);
    const maxRow = await env.DB.prepare("SELECT COALESCE(MAX(sort_order),0) AS max_order FROM projects").first();
    const sortOrder = Number(maxRow?.max_order || 0) + 10;
    const languages = evidence.languages.slice(0, 4);
    const type = languages.length
      ? (repo.provider === "github" ? "GitHub" : "GitLab") + " · " + languages.join(" / ")
      : (repo.provider === "github" ? "GitHub · Repository" : "GitLab · Repository");
    try {
      const insert = await env.DB.prepare(
        "INSERT INTO projects(id,title,type,description_fr,description_en,url,visible,sort_order,updated_at) VALUES(?,?,?,?,?,?,1,?,CURRENT_TIMESTAMP)"
      ).bind(id, evidence.title, type, description.fr, description.en, repo.canonical, sortOrder).run();
      if (!insert.meta?.changes) throw apiError("Database Failure.", "DATABASE_FAILURE", 500);
    } catch (error) {
      if (error.code) throw error;
      const combined = [error?.message, error?.cause?.message, String(error)].filter(Boolean).join(" ");
      if (/UNIQUE constraint failed|PRIMARY KEY|SQLITE_CONSTRAINT|duplicate/i.test(combined)) {
        throw apiError("Duplicate Project.", "DUPLICATE_PROJECT", 409);
      }
      throw apiError("Database Failure.", "DATABASE_FAILURE", 500);
    }
    return json({
      saved: true,
      project: {
        id, title: evidence.title, type,
        description_fr: description.fr,
        description_en: description.en,
        url: repo.canonical,
        visible: true,
        sort_order: sortOrder
      }
    }, 201);
  }
  if (path === "/api/admin/facts" && method === "GET") {
    const { results = [] } = await env.DB.prepare("SELECT * FROM facts ORDER BY category,id").all();
    return json({ facts: results.map(f => ({
      ...f,
      aliases: parseJson(f.aliases_json, []),
      approved: !!f.approved,
      source: { file: f.source_file, selector: f.source_selector },
      url: f.public_url || ""
    })) });
  }
  if (path === "/api/admin/facts" && method === "POST") {
    const x = await readBody(request);
    const error = validateFact(x);
    if (error) return json({ error }, 400);
    await env.DB.prepare("INSERT INTO facts(id,category,text_fr,text_en,text_ar,aliases_json,source_file,source_selector,public_url,approved,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)").bind(x.id,x.category,x.text_fr.trim(),x.text_en.trim(),x.text_ar.trim(),JSON.stringify(x.aliases),x.source.file,x.source.selector,x.url || null,x.approved ? 1 : 0).run();
    return json({ saved: true, id: x.id }, 201);
  }
  const factMatch = path.match(/^\/api\/admin\/facts\/([a-z0-9_-]+)$/i);
  if (factMatch && method === "PUT") {
    if (!safeId(factMatch[1])) return json({ error: "Invalid ID." }, 400);
    const x = await readBody(request); x.id = factMatch[1];
    const error = validateFact(x);
    if (error) return json({ error }, 400);
    const result = await env.DB.prepare("UPDATE facts SET category=?,text_fr=?,text_en=?,text_ar=?,aliases_json=?,source_file=?,source_selector=?,public_url=?,approved=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(x.category,x.text_fr.trim(),x.text_en.trim(),x.text_ar.trim(),JSON.stringify(x.aliases),x.source.file,x.source.selector,x.url || null,x.approved ? 1 : 0,x.id).run();
    if (!result.meta?.changes) return json({ error: "Fact not found." }, 404);
    return json({ saved: true, id: x.id });
  }
  if (factMatch && method === "DELETE") {
    const result = await env.DB.prepare("DELETE FROM facts WHERE id=?").bind(factMatch[1]).run();
    return result.meta?.changes ? json({ deleted: true }) : json({ error: "Fact not found." }, 404);
  }
  if (path === "/api/admin/projects" && method === "GET") {
    const { results = [] } = await env.DB.prepare("SELECT * FROM projects ORDER BY sort_order,title").all();
    return json({ projects: results.map(p => ({ ...p, visible: !!p.visible })) });
  }
  if (path === "/api/admin/projects" && method === "POST") {
    const x = await readBody(request);
    const error = validateProject(x);
    if (error) return json({ error }, 400);
    await env.DB.prepare("INSERT INTO projects(id,title,type,description_fr,description_en,url,visible,sort_order,updated_at) VALUES(?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)").bind(x.id,x.title.trim(),x.type.trim(),x.description_fr.trim(),x.description_en.trim(),x.url,x.visible ? 1 : 0,x.sort_order).run();
    return json({ saved: true, id: x.id }, 201);
  }
  const projectMatch = path.match(/^\/api\/admin\/projects\/([a-z0-9_-]+)$/i);
  if (projectMatch && method === "PUT") {
    const x = await readBody(request); x.id = projectMatch[1];
    const error = validateProject(x);
    if (error) return json({ error }, 400);
    const result = await env.DB.prepare("UPDATE projects SET title=?,type=?,description_fr=?,description_en=?,url=?,visible=?,sort_order=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(x.title.trim(),x.type.trim(),x.description_fr.trim(),x.description_en.trim(),x.url,x.visible ? 1 : 0,x.sort_order,x.id).run();
    if (!result.meta?.changes) return json({ error: "Project not found." }, 404);
    return json({ saved: true, id: x.id });
  }
  if (projectMatch && method === "DELETE") {
    const result = await env.DB.prepare("DELETE FROM projects WHERE id=?").bind(projectMatch[1]).run();
    return result.meta?.changes ? json({ deleted: true }) : json({ error: "Project not found." }, 404);
  }
  return json({ error: "Not found." }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    const cors = corsHeaders(request, env);
    if (method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (!allowedOrigin(request, env)) return json({ error: "Origin not allowed." }, 403);
    try {
      if (path === "/api/health" && method === "GET") {
        await env.DB.prepare("SELECT 1").first();
        return withCors(json({ ok: true, service: "portfolio-api", assistant: "melek-ai-experimental", auth: "native-email-otp", admin: "cloudflare-access" }), cors);
      }
      if (path === "/api/melek-ai/status" && method === "GET") return withCors(json(await new MelekInferenceAdapter(env).status()), cors);
      if (path.startsWith("/api/auth/")) {
        const result = await authRoutes(request, env, path, method);
        if (result) return withCors(result, cors);
      }
      if (path === "/api/assistant" && method === "POST") return withCors(await assistant(request, env), cors);
      if (path === "/api/projects" && method === "GET") {
        const { results = [] } = await env.DB.prepare("SELECT id,title,type,description_fr,description_en,url,sort_order FROM projects WHERE visible=1 ORDER BY sort_order,title").all();
        return withCors(json({ projects: results }), cors);
      }
      if (path.startsWith("/api/user/")) {
        const identity = await getSession(request, env);
        return withCors(await userChatRoute(request, env, path, method, identity), cors);
      }
      if (path.startsWith("/api/admin/")) return withCors(await adminRoute(request, env, path, method), cors);
      return withCors(json({ error: "Not found." }, 404), cors);
    } catch (error) {
      const message = String(error?.message || "The server could not complete this request.");
      if (error?.code) {
        const status = Number.isInteger(error.status) ? error.status : (error.code === "DATABASE_FAILURE" ? 500 : 400);
        return withCors(json({ error: message, code: error.code }, status), cors);
      }
      const status = /sign-in|authentication|access token|token|signing keys|not allowed to administer/i.test(message) ? 401 : 500;
      return withCors(json({ error: status === 401 ? message : "The server could not complete this request." }, status), cors);
    }
  }
};
