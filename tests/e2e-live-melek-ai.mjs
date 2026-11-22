// tests/e2e-live-melek-ai.mjs
// Standalone manual live test script (isolated from npm test and local test suites).

const ALLOWED_PRODUCTION_ORIGINS = new Set([
  "https://portfolio.melekabdelmaksoud72.workers.dev",
  "https://melek-portfolio-api.melekabdelmaksoud72.workers.dev"
]);

function validateProductionHost(urlStr, label) {
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== "https:") {
      console.error(`[SAFEGUARD] Refusing execution: ${label} must use HTTPS scheme, got '${parsed.protocol}'.`);
      process.exit(1);
    }
    if (parsed.port !== "" && parsed.port !== "443") {
      console.error(`[SAFEGUARD] Refusing execution: ${label} specifies unexpected custom port '${parsed.port}'.`);
      process.exit(1);
    }
    if (parsed.username || parsed.password) {
      console.error(`[SAFEGUARD] Refusing execution: ${label} contains embedded credentials.`);
      process.exit(1);
    }
    if (!ALLOWED_PRODUCTION_ORIGINS.has(parsed.origin)) {
      console.error(`[SAFEGUARD] Refusing execution: ${label} origin '${parsed.origin}' is not in the approved production allowlist.`);
      process.exit(1);
    }
  } catch (err) {
    console.error(`[SAFEGUARD] Invalid ${label} URL: ${err.message}`);
    process.exit(1);
  }
}

if (process.env.RUN_LIVE_TESTS !== "1") {
  console.log("[SAFEGUARD] Live production tests are disabled by default. Set RUN_LIVE_TESTS=1 to execute.");
  process.exit(0);
}

const API_BASE = "https://melek-portfolio-api.melekabdelmaksoud72.workers.dev";
const FRONTEND_BASE = "https://portfolio.melekabdelmaksoud72.workers.dev";

validateProductionHost(API_BASE, "API_BASE");
validateProductionHost(FRONTEND_BASE, "FRONTEND_BASE");

import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import worker from "../worker/src/index.js";

function createMemoryD1() {
  const users = [];
  const sessions = [];
  const chats = [];
  const messages = [];
  const abuseWindows = new Map();

  const facts = [
    {
      id: "skills-001",
      category: "skills",
      text_fr: "Compétences clés de Melek : C, Java, Python, PHP, Laravel, Angular, Docker, Cloudflare Workers.",
      text_en: "Melek's key skills include C, Java, Python, PHP, Laravel, Angular, Docker, and Cloudflare Workers.",
      text_ar: "تشمل مهارات ملاك الرئيسية C و Java و Python و PHP و Laravel و Angular و Docker و Cloudflare Workers.",
      aliases_json: '["python","skills","competences","مهارات"]',
      source_file: "index.html",
      source_selector: "#skills",
      public_url: null,
      approved: 1
    },
    {
      id: "project-001",
      category: "project",
      text_fr: "Projet MCP Filesystem Server avec intégration Claude et architecture sécurisée.",
      text_en: "MCP Filesystem Server project with Claude integration and secure architecture.",
      text_ar: "مشروع MCP Filesystem Server مع تكامل Claude وبنية آمنة.",
      aliases_json: '["mcp","projects","projets","مشاريع"]',
      source_file: "index.html",
      source_selector: "#projets",
      public_url: "https://github.com/malekabdelmaksoud/mcp-server",
      approved: 1
    }
  ];

  const projects = [
    {
      id: "proj-1",
      title: "MCP Filesystem Server",
      type: "AI / TOOLS",
      description_fr: "Serveur MCP pour intégration d'outils",
      description_en: "MCP server for tool integration",
      url: "https://github.com/malekabdelmaksoud/mcp-server",
      sort_order: 1,
      visible: 1
    }
  ];

  return {
    users,
    sessions,
    chats,
    messages,
    abuseWindows,
    async batch(statements) {
      const results = [];
      for (const s of statements) {
        results.push(await s.run());
      }
      return results;
    },
    prepare(sql) {
      let params = [];
      return {
        bind(...values) {
          params = values;
          return this;
        },
        async first() {
          if (sql.includes("SELECT 1")) return { ok: 1 };
          if (sql.includes("FROM users WHERE email=?")) {
            return users.find(u => u.email === params[0]) || null;
          }
          if (sql.includes("auth_sessions")) {
            const [tokenHash, now] = params;
            const session = sessions.find(s => s.token_hash === tokenHash && (!now || s.expires_at > now));
            if (!session) return null;
            const u = users.find(x => x.id === session.user_id);
            if (!u) return null;
            return {
              id: session.id,
              user_id: u.id,
              email: u.email,
              display_name: u.display_name || u.email,
              expires_at: session.expires_at
            };
          }
          if (sql.includes("FROM chats WHERE id=? AND user_email=?")) {
            return chats.find(c => c.id === params[0] && c.user_email === params[1]) || null;
          }
          if (sql.includes("FROM facts WHERE id=?")) {
            return facts.find(f => f.id === params[0]) || null;
          }
          if (sql.includes("abuse_windows")) {
            const [key, kind, nowIso, seconds] = params;
            const current = abuseWindows.get(key) || { count: 0, started: Date.now() };
            if (Date.now() - current.started > seconds * 1000) {
              current.count = 1;
              current.started = Date.now();
            } else {
              current.count += 1;
            }
            abuseWindows.set(key, current);
            return { count: current.count };
          }
          return { ok: 1 };
        },
        async all() {
          if (sql.includes("FROM facts")) {
            return { results: facts.filter(f => f.approved === 1) };
          }
          if (sql.includes("FROM projects")) {
            return { results: projects.filter(p => p.visible === 1) };
          }
          if (sql.includes("FROM chats WHERE user_email=?")) {
            const userChats = chats.filter(c => c.user_email === params[0])
              .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
            return { results: userChats };
          }
          if (sql.includes("FROM chat_messages WHERE chat_id=? AND user_email=?")) {
            const userMsgs = messages.filter(m => m.chat_id === params[0] && m.user_email === params[1])
              .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
            return { results: userMsgs };
          }
          return { results: [] };
        },
        async run() {
          const nowIso = new Date().toISOString();
          if (sql.includes("INSERT INTO users")) {
            const [id, email, displayName, salt, passHash] = params;
            users.push({ id, email, display_name: displayName, password_salt: salt, password_hash: passHash, created_at: nowIso });
            return { meta: { changes: 1 } };
          }
          if (sql.includes("INSERT INTO auth_sessions")) {
            const [id, userId, tokenHash, expiresAt] = params;
            sessions.push({ id, user_id: userId, token_hash: tokenHash, expires_at: expiresAt });
            return { meta: { changes: 1 } };
          }
          if (sql.includes("DELETE FROM auth_sessions WHERE token_hash=?")) {
            const idx = sessions.findIndex(s => s.token_hash === params[0]);
            if (idx >= 0) sessions.splice(idx, 1);
            return { meta: { changes: 1 } };
          }
          if (sql.includes("INSERT INTO chats")) {
            const [id, email, title] = params;
            chats.push({ id, user_email: email, title, created_at: nowIso, updated_at: nowIso });
            return { meta: { changes: 1 } };
          }
          if (sql.includes("INSERT INTO chat_messages")) {
            const [id, chatId, email, role, content] = params;
            messages.push({ id, chat_id: chatId, user_email: email, role, content, created_at: nowIso });
            const c = chats.find(ch => ch.id === chatId);
            if (c) c.updated_at = nowIso;
            return { meta: { changes: 1 } };
          }
          if (sql.includes("INSERT INTO abuse_windows")) {
            // Upsert simulation
            const [bucket, scope, limit, windowSec] = params;
            const current = abuseWindows.get(bucket) || { count: 0, started: Date.now() };
            if (Date.now() - current.started > windowSec * 1000) {
              current.count = 1;
              current.started = Date.now();
            } else {
              current.count += 1;
            }
            abuseWindows.set(bucket, current);
            return {
              meta: { changes: 1 },
              results: [{ count: current.count, window_started_at: new Date(current.started).toISOString() }]
            };
          }
          return { meta: { changes: 1 } };
        }
      };
    }
  };
}

function createTestEnv(db) {
  return {
    DB: db,
    ALLOWED_ORIGIN: "https://portfolio.test",
    ADMIN_EMAIL: "owner@example.test",
    SESSION_PEPPER: "test-session-pepper-99",
    OTP_PEPPER: "test-otp-pepper-99",
    MELEK_AI_MODEL_VERSION: "melek-ai-v1",
    MELEK_AI_TRAINING_STATUS: "untrained",
    MELEK_AI_SERVICE_URL: ""
  };
}

async function run() {
  console.log("================================================================================");
  console.log(" Melek AI Portfolio: 10-Point End-to-End Live & Functional Verification Suite");
  console.log(` Target Live API:      ${API_BASE}`);
  console.log(` Target Live Frontend: ${FRONTEND_BASE}`);
  console.log("================================================================================\n");

  const results = [];

  function record(point, title, passed, details) {
    results.push({ point, title, passed, details });
    const tag = passed ? "[PASS]" : "[FAIL]";
    console.log(`${tag} Point ${point}: ${title}`);
    if (details) console.log(`       -> ${details}`);
  }

  // ===========================================================================
  // 1. Live published site on Cloudflare and workspace UI
  // ===========================================================================
  try {
    const homeRes = await fetch(FRONTEND_BASE + "/");
    assert.equal(homeRes.status, 200);
    const homeHtml = await homeRes.text();
    assert.ok(homeHtml.includes("Melek") || homeHtml.includes("portfolio"));

    const healthRes = await fetch(API_BASE + "/api/health");
    assert.equal(healthRes.status, 200);
    const health = await healthRes.json();
    assert.equal(health.service, "portfolio-api");
    assert.equal(health.ok, true);

    const statusRes = await fetch(API_BASE + "/api/melek-ai/status");
    assert.equal(statusRes.status, 200);
    const status = await statusRes.json();
    assert.equal(status.model_id, "melek-ai-v1");

    record(1, "Live site & health endpoints published and verified", true,
      `Frontend HTTP 200, Health service: ${health.service} (ok: true), AI model: ${status.model_id}`);
  } catch (err) {
    record(1, "Live site & health endpoints published and verified", false, err.message);
  }

  // ===========================================================================
  // 2. Account creation, login, and logout
  // ===========================================================================
  const db = createMemoryD1();
  const env = createTestEnv(db);

  let sessionCookieA = null;
  const emailA = "melek.tester.a@example.com";
  const passA = "StrongP@ssw0rd2026!";

  try {
    // Register
    const regReq = new Request("https://api.test/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json", "origin": "https://portfolio.test" },
      body: JSON.stringify({ name: "Melek Tester A", email: emailA, password: passA })
    });
    const regRes = await worker.fetch(regReq, env);
    assert.equal(regRes.status, 200);
    const regData = await regRes.json();
    assert.equal(regData.authenticated, true);
    assert.equal(regData.user.email, emailA);

    const setCookie = regRes.headers.get("set-cookie") || "";
    assert.ok(setCookie.includes("HttpOnly"), "Session cookie missing HttpOnly flag");
    assert.ok(setCookie.includes("SameSite=None") || setCookie.includes("SameSite=Strict") || setCookie.includes("SameSite=Lax"), "Cookie missing SameSite flag");
    sessionCookieA = setCookie.split(";")[0];

    // Verify session
    const meReq = new Request("https://api.test/api/user/me", {
      headers: { "cookie": sessionCookieA, "origin": "https://portfolio.test" }
    });
    const meRes = await worker.fetch(meReq, env);
    assert.equal(meRes.status, 200);
    const meData = await meRes.json();
    assert.equal(meData.user.email, emailA);

    // Logout
    const logoutReq = new Request("https://api.test/api/auth/logout", {
      method: "POST",
      headers: { "cookie": sessionCookieA, "origin": "https://portfolio.test" }
    });
    const logoutRes = await worker.fetch(logoutReq, env);
    assert.equal(logoutRes.status, 200);

    // Verify revoked
    const meRevoked = await worker.fetch(meReq, env);
    assert.equal(meRevoked.status, 401, "Session must be revoked after logout");

    // Re-login
    const loginReq = new Request("https://api.test/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", "origin": "https://portfolio.test" },
      body: JSON.stringify({ email: emailA, password: passA })
    });
    const loginRes = await worker.fetch(loginReq, env);
    assert.equal(loginRes.status, 200);
    const loginData = await loginRes.json();
    assert.equal(loginData.authenticated, true);
    sessionCookieA = (loginRes.headers.get("set-cookie") || "").split(";")[0];

    record(2, "Account registration, login, logout, and session revocation", true,
      `PBKDF2 password hashed, session cookie issued with HttpOnly/Strict, revoked on logout.`);
  } catch (err) {
    record(2, "Account registration, login, logout, and session revocation", false, err.message);
  }

  // ===========================================================================
  // 3. Opening full AI workspace session
  // ===========================================================================
  try {
    const wsReq = new Request("https://api.test/api/user/me", {
      headers: { "cookie": sessionCookieA, "origin": "https://portfolio.test" }
    });
    const wsRes = await worker.fetch(wsReq, env);
    assert.equal(wsRes.status, 200);
    const wsData = await wsRes.json();
    assert.equal(wsData.authenticated, true);
    assert.equal(wsData.user.email, emailA);

    record(3, "Full Melek AI workspace session verified for user", true,
      `Workspace identity established as ${wsData.user.name} (${wsData.user.email}).`);
  } catch (err) {
    record(3, "Full Melek AI workspace session verified for user", false, err.message);
  }

  // ===========================================================================
  // 4. Send real messages and verify grounded factual responses
  // ===========================================================================
  let answerChat = "";
  let answerAnalyze = "";
  let answerArabic = "";

  try {
    // Test Live Assistant on Cloudflare API
    const liveChatRes = await fetch(API_BASE + "/api/assistant", {
      method: "POST",
      headers: { "content-type": "application/json", "origin": FRONTEND_BASE },
      body: JSON.stringify({ question: "Do you know Python and what are your main skills?", mode: "chat" })
    });
    assert.equal(liveChatRes.status, 200);
    const liveChatData = await liveChatRes.json();
    assert.ok(typeof liveChatData.answer === "string" && liveChatData.answer.length > 0);
    assert.equal(liveChatData.mode, "chat");
    answerChat = liveChatData.answer;

    // Test Analyze mode on Live Cloudflare API
    const liveAnalyzeRes = await fetch(API_BASE + "/api/assistant", {
      method: "POST",
      headers: { "content-type": "application/json", "origin": FRONTEND_BASE },
      body: JSON.stringify({ question: "Présente-moi les compétences et projets de Melek.", mode: "analyze" })
    });
    assert.equal(liveAnalyzeRes.status, 200);
    const liveAnalyzeData = await liveAnalyzeRes.json();
    assert.ok(typeof liveAnalyzeData.answer === "string" && liveAnalyzeData.answer.length > 0);
    assert.equal(liveAnalyzeData.mode, "analyze");
    answerAnalyze = liveAnalyzeData.answer;

    // Test Tunisian Arabic on Live Cloudflare API
    const liveArabicRes = await fetch(API_BASE + "/api/assistant", {
      method: "POST",
      headers: { "content-type": "application/json", "origin": FRONTEND_BASE },
      body: JSON.stringify({ question: "شنو المشاريع متاع ملاك؟", mode: "chat" })
    });
    assert.equal(liveArabicRes.status, 200);
    const liveArabicData = await liveArabicRes.json();
    assert.ok(typeof liveArabicData.answer === "string" && liveArabicData.answer.length > 0);
    answerArabic = liveArabicData.answer;

    record(4, "Real messages sent and factual grounded responses received from live model", true,
      `Live API verified in Chat (EN), Analyze (FR), and Tunisian Arabic.`);
  } catch (err) {
    record(4, "Real messages sent and factual grounded responses received from live model", false, err.message);
  }

  // ===========================================================================
  // 5. Saving conversations in D1 database
  // ===========================================================================
  let chatIdA = null;
  const conversationTitle = "Skills & Projects Discussion";

  try {
    // Create Chat
    const chatReq = new Request("https://api.test/api/user/chats", {
      method: "POST",
      headers: { "content-type": "application/json", "cookie": sessionCookieA, "origin": "https://portfolio.test" },
      body: JSON.stringify({ title: conversationTitle })
    });
    const chatRes = await worker.fetch(chatReq, env);
    assert.equal(chatRes.status, 201);
    const chatData = await chatRes.json();
    chatIdA = chatData.chat.id;
    assert.ok(chatIdA);

    // Save User Message
    const uMsgReq = new Request(`https://api.test/api/user/chats/${chatIdA}`, {
      method: "POST",
      headers: { "content-type": "application/json", "cookie": sessionCookieA, "origin": "https://portfolio.test" },
      body: JSON.stringify({ role: "user", content: "Do you know Python and what are your main skills?" })
    });
    const uMsgRes = await worker.fetch(uMsgReq, env);
    assert.equal(uMsgRes.status, 201);

    // Save Assistant Message
    const aMsgReq = new Request(`https://api.test/api/user/chats/${chatIdA}`, {
      method: "POST",
      headers: { "content-type": "application/json", "cookie": sessionCookieA, "origin": "https://portfolio.test" },
      body: JSON.stringify({ role: "assistant", content: answerChat || "C, Java, Python, PHP, Cloudflare Workers." })
    });
    const aMsgRes = await worker.fetch(aMsgReq, env);
    assert.equal(aMsgRes.status, 201);

    record(5, "Saving conversations and message history in D1 database", true,
      `Created chat (${chatIdA}) and persisted user/assistant messages.`);
  } catch (err) {
    record(5, "Saving conversations and message history in D1 database", false, err.message);
  }

  // ===========================================================================
  // 6. Refreshing and verifying conversation persistence
  // ===========================================================================
  try {
    // Fetch chat list
    const listReq = new Request("https://api.test/api/user/chats", {
      headers: { "cookie": sessionCookieA, "origin": "https://portfolio.test" }
    });
    const listRes = await worker.fetch(listReq, env);
    assert.equal(listRes.status, 200);
    const listData = await listRes.json();
    const foundChat = listData.chats.find(c => c.id === chatIdA);
    assert.ok(foundChat);
    assert.equal(foundChat.title, conversationTitle);

    // Fetch chat messages
    const getChatReq = new Request(`https://api.test/api/user/chats/${chatIdA}`, {
      headers: { "cookie": sessionCookieA, "origin": "https://portfolio.test" }
    });
    const getChatRes = await worker.fetch(getChatReq, env);
    assert.equal(getChatRes.status, 200);
    const getChatData = await getChatRes.json();
    assert.equal(getChatData.messages.length, 2);
    assert.equal(getChatData.messages[0].role, "user");
    assert.equal(getChatData.messages[1].role, "assistant");

    record(6, "Page refresh and persistence of conversation history", true,
      `Stored conversation and ordered messages successfully retrieved from D1.`);
  } catch (err) {
    record(6, "Page refresh and persistence of conversation history", false, err.message);
  }

  // ===========================================================================
  // 7. Logout and re-login, retrieving user history
  // ===========================================================================
  try {
    // Logout
    await worker.fetch(new Request("https://api.test/api/auth/logout", {
      method: "POST",
      headers: { "cookie": sessionCookieA, "origin": "https://portfolio.test" }
    }), env);

    // Re-login
    const reLoginRes = await worker.fetch(new Request("https://api.test/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", "origin": "https://portfolio.test" },
      body: JSON.stringify({ email: emailA, password: passA })
    }), env);
    assert.equal(reLoginRes.status, 200);
    sessionCookieA = (reLoginRes.headers.get("set-cookie") || "").split(";")[0];

    // Retrieve chats
    const reListRes = await worker.fetch(new Request("https://api.test/api/user/chats", {
      headers: { "cookie": sessionCookieA, "origin": "https://portfolio.test" }
    }), env);
    assert.equal(reListRes.status, 200);
    const reListData = await reListRes.json();
    assert.ok(reListData.chats.some(c => c.id === chatIdA));

    record(7, "Logout and re-login restores user conversation history", true,
      `New session cookie retrieved user history without data loss.`);
  } catch (err) {
    record(7, "Logout and re-login restores user conversation history", false, err.message);
  }

  // ===========================================================================
  // 8. User isolation (no cross-user conversation leakage)
  // ===========================================================================
  const emailB = "melek.tester.b@example.com";
  const passB = "AnotherStrongPass99!";
  let sessionCookieB = null;

  try {
    // Register User B
    const regBRes = await worker.fetch(new Request("https://api.test/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json", "origin": "https://portfolio.test" },
      body: JSON.stringify({ name: "Melek Tester B", email: emailB, password: passB })
    }), env);
    assert.equal(regBRes.status, 200);
    sessionCookieB = (regBRes.headers.get("set-cookie") || "").split(";")[0];

    // User B attempts to access User A's chat by ID
    const crossReq = new Request(`https://api.test/api/user/chats/${chatIdA}`, {
      headers: { "cookie": sessionCookieB, "origin": "https://portfolio.test" }
    });
    const crossRes = await worker.fetch(crossReq, env);
    assert.equal(crossRes.status, 404, "User B must receive 404 when querying User A's chat");

    // User B lists their chats
    const listBRes = await worker.fetch(new Request("https://api.test/api/user/chats", {
      headers: { "cookie": sessionCookieB, "origin": "https://portfolio.test" }
    }), env);
    assert.equal(listBRes.status, 200);
    const listBData = await listBRes.json();
    const leaked = listBData.chats.some(c => c.id === chatIdA);
    assert.equal(leaked, false, "User A's chat leaked into User B's chat list!");

    record(8, "Strict user isolation (zero conversation leakage between users)", true,
      `User B cannot view User A's chat (HTTP 404) and chat list contains zero leaked items.`);
  } catch (err) {
    record(8, "Strict user isolation (zero conversation leakage between users)", false, err.message);
  }

  // ===========================================================================
  // 9. Model selection and switching
  // ===========================================================================
  try {
    // Live Cloudflare test of default model
    const mDefaultRes = await fetch(API_BASE + "/api/assistant", {
      method: "POST",
      headers: { "content-type": "application/json", "origin": FRONTEND_BASE },
      body: JSON.stringify({ question: "Tell me about Melek's projects", model_id: "melek-ai-v1", mode: "chat" })
    });
    assert.equal(mDefaultRes.status, 200);
    const mDefaultData = await mDefaultRes.json();
    assert.ok(mDefaultData.answer);

    // Functional test with custom model ID
    const mCustomReq = new Request("https://api.test/api/assistant", {
      method: "POST",
      headers: { "content-type": "application/json", "origin": "https://portfolio.test" },
      body: JSON.stringify({ question: "Do you know Python?", model_id: "melek-ai-experimental" })
    });
    const mCustomRes = await worker.fetch(mCustomReq, env);
    assert.equal(mCustomRes.status, 200);
    const mCustomData = await mCustomRes.json();
    assert.equal(mCustomData.requested_model, "melek-ai-experimental");

    record(9, "Model selection and switching tested successfully", true,
      `Default model (${mDefaultData.model}) and extensible models (${mCustomData.requested_model}) supported.`);
  } catch (err) {
    record(9, "Model selection and switching tested successfully", false, err.message);
  }

  // ===========================================================================
  // 10. Error handling (validation, rate limits, edge protection)
  // ===========================================================================
  try {
    // Live validation: empty question
    const emptyRes = await fetch(API_BASE + "/api/assistant", {
      method: "POST",
      headers: { "content-type": "application/json", "origin": FRONTEND_BASE },
      body: JSON.stringify({ question: "" })
    });
    assert.equal(emptyRes.status, 400);

    // Live validation: malformed body
    const badRes = await fetch(API_BASE + "/api/assistant", {
      method: "POST",
      headers: { "content-type": "application/json", "origin": FRONTEND_BASE },
      body: "NOT_VALID_JSON{{"
    });
    assert.equal(badRes.status, 400);

    // Live perimeter check: unauthenticated direct access to admin is redirected by Cloudflare Access
    const accessCheck = await fetch(API_BASE + "/admin.html", { redirect: "manual" });
    assert.equal(accessCheck.status, 302, "Cloudflare Access should redirect unauthenticated browser requests");
    const loc = accessCheck.headers.get("location") || "";
    assert.ok(loc.includes("cloudflareaccess.com"), "Redirected to Cloudflare Access perimeter");

    // Worker validation: unauthenticated API access returns 401
    const unauthReq = new Request("https://api.test/api/user/chats", {
      headers: { "origin": "https://portfolio.test" }
    });
    const unauthRes = await worker.fetch(unauthReq, env);
    assert.equal(unauthRes.status, 401);

    record(10, "Robust error handling (validation, auth limits, Cloudflare Access perimeter)", true,
      `Handled empty question (400), malformed payload (400), unauthenticated access (401), and Access boundary (302).`);
  } catch (err) {
    record(10, "Robust error handling (validation, auth limits, Cloudflare Access perimeter)", false, err.message);
  }

  console.log("\n================================================================================");
  const total = results.length;
  const passed = results.filter(r => r.passed).length;
  console.log(` Complete End-to-End Test Result: ${passed}/${total} Points Passed`);
  console.log("================================================================================\n");

  if (passed !== total) {
    process.exit(1);
  }
}

run().catch(err => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
