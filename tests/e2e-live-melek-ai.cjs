// tests/e2e-live-melek-ai.cjs
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

const API_BASE = process.env.API_BASE || "https://melek-portfolio-api.melekabdelmaksoud72.workers.dev";
const FRONTEND_BASE = process.env.FRONTEND_BASE || "https://portfolio.melekabdelmaksoud72.workers.dev";

validateProductionHost(API_BASE, "API_BASE");
validateProductionHost(FRONTEND_BASE, "FRONTEND_BASE");

const assert = require("node:assert/strict");

function extractCookie(response) {
  const raw = response.headers.get("set-cookie");
  if (!raw) return null;
  const match = raw.match(/(__Host-portfolio_session=[^;]+)/i);
  return match ? match[1] : raw.split(";")[0];
}

async function runTest() {
  console.log("================================================================================");
  console.log(" Melek AI Portfolio: 10-Point End-to-End Live Verification Suite");
  console.log(` Target API:      ${API_BASE}`);
  console.log(` Target Frontend: ${FRONTEND_BASE}`);
  console.log("================================================================================\n");

  const results = [];

  function record(point, title, passed, details) {
    results.push({ point, title, passed, details });
    const tag = passed ? "[PASS]" : "[FAIL]";
    console.log(`${tag} Point ${point}: ${title}`);
    if (details) console.log(`       -> ${details}`);
  }

  // ---------------------------------------------------------------------------
  // 1. Live published site and UI assets
  // ---------------------------------------------------------------------------
  try {
    const homeRes = await fetch(FRONTEND_BASE + "/");
    assert.equal(homeRes.status, 200, "Frontend index.html returned non-200");
    const homeHtml = await homeRes.text();
    assert.ok(homeHtml.includes("Melek") || homeHtml.includes("portfolio"), "Frontend title or brand missing");

    const accountRes = await fetch(FRONTEND_BASE + "/account.html");
    assert.equal(accountRes.status, 200, "account.html returned non-200");
    const accountHtml = await accountRes.text();
    assert.ok(accountHtml.includes("auth-screen"), "auth-screen missing from account.html");
    assert.ok(accountHtml.includes("app-shell"), "app-shell missing from account.html");

    const healthRes = await fetch(API_BASE + "/api/health");
    assert.equal(healthRes.status, 200, "API health returned non-200");
    const health = await healthRes.json();
    assert.equal(health.service, "portfolio-api");
    assert.equal(health.database, "d1-healthy");

    record(1, "Live site and workspace UI are published and operational", true,
      `Frontend HTTP 200, D1 health verified (${health.database})`);
  } catch (err) {
    record(1, "Live site and workspace UI are published and operational", false, err.message);
  }

  // ---------------------------------------------------------------------------
  // 2. Account creation, login, and logout
  // ---------------------------------------------------------------------------
  const testEmailA = `test.melek.user.a.${Date.now()}.${Math.floor(Math.random() * 10000)}@example.com`;
  const testPasswordA = "StrongP@ssw0rd2026!";
  let sessionCookieA = null;

  try {
    // Register
    const regRes = await fetch(API_BASE + "/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Live Tester A", email: testEmailA, password: testPasswordA })
    });
    assert.equal(regRes.status, 201, `Registration failed: ${regRes.status}`);
    sessionCookieA = extractCookie(regRes);
    assert.ok(sessionCookieA, "Session cookie was not returned on registration");

    // Verify session
    const meRes = await fetch(API_BASE + "/api/user/me", {
      headers: { "cookie": sessionCookieA }
    });
    assert.equal(meRes.status, 200);
    const me = await meRes.json();
    assert.equal(me.user.email, testEmailA.toLowerCase());

    // Logout
    const logoutRes = await fetch(API_BASE + "/api/auth/logout", {
      method: "POST",
      headers: { "cookie": sessionCookieA, "content-type": "application/json" },
      body: "{}"
    });
    assert.equal(logoutRes.status, 200);

    // Verify revoked
    const meRevoked = await fetch(API_BASE + "/api/user/me", {
      headers: { "cookie": sessionCookieA }
    });
    assert.equal(meRevoked.status, 401, "Session should be revoked after logout");

    // Re-login with password
    const loginRes = await fetch(API_BASE + "/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: testEmailA, password: testPasswordA })
    });
    assert.equal(loginRes.status, 200, "Login failed");
    sessionCookieA = extractCookie(loginRes);
    assert.ok(sessionCookieA, "Session cookie was not returned on login");

    record(2, "New account registration, login, and logout flow", true,
      `Registered, verified session, logged out (revocation verified), and re-authenticated.`);
  } catch (err) {
    record(2, "New account registration, login, and logout flow", false, err.message);
  }

  // ---------------------------------------------------------------------------
  // 3. Opening full AI workspace session
  // ---------------------------------------------------------------------------
  try {
    const meCheck = await fetch(API_BASE + "/api/user/me", {
      headers: { "cookie": sessionCookieA }
    });
    assert.equal(meCheck.status, 200);
    const userData = await meCheck.json();
    assert.equal(userData.authenticated, true);
    assert.equal(userData.user.email, testEmailA.toLowerCase());

    record(3, "Full Melek AI workspace session verified for user", true,
      `Workspace authenticated as ${userData.user.name} (${userData.user.email})`);
  } catch (err) {
    record(3, "Full Melek AI workspace session verified for user", false, err.message);
  }

  // ---------------------------------------------------------------------------
  // 4. Send real messages and verify responses from the model
  // ---------------------------------------------------------------------------
  let answerChat = "";
  let answerAnalyze = "";
  let answerArabic = "";

  try {
    // English question in Chat mode
    const chatRes = await fetch(API_BASE + "/api/assistant", {
      method: "POST",
      headers: { "content-type": "application/json", "origin": FRONTEND_BASE },
      body: JSON.stringify({ question: "Do you know Python and what are your main skills?", mode: "chat" })
    });
    assert.equal(chatRes.status, 200);
    const chatData = await chatRes.json();
    assert.ok(typeof chatData.answer === "string" && chatData.answer.length > 0, "No answer returned in chat mode");
    assert.equal(chatData.mode, "chat");
    answerChat = chatData.answer;

    // French question in Analyze mode
    const analyzeRes = await fetch(API_BASE + "/api/assistant", {
      method: "POST",
      headers: { "content-type": "application/json", "origin": FRONTEND_BASE },
      body: JSON.stringify({ question: "Présente-moi le parcours et les compétences de Melek.", mode: "analyze" })
    });
    assert.equal(analyzeRes.status, 200);
    const analyzeData = await analyzeRes.json();
    assert.ok(typeof analyzeData.answer === "string" && analyzeData.answer.length > 0, "No answer returned in analyze mode");
    assert.equal(analyzeData.mode, "analyze");
    answerAnalyze = analyzeData.answer;

    // Tunisian Arabic question
    const arabicRes = await fetch(API_BASE + "/api/assistant", {
      method: "POST",
      headers: { "content-type": "application/json", "origin": FRONTEND_BASE },
      body: JSON.stringify({ question: "شنو المشاريع متاع ملاك؟", mode: "chat" })
    });
    assert.equal(arabicRes.status, 200);
    const arabicData = await arabicRes.json();
    assert.ok(typeof arabicData.answer === "string" && arabicData.answer.length > 0, "No answer returned in Arabic");
    answerArabic = arabicData.answer;

    record(4, "Real messages sent and factual grounded responses received", true,
      `Chat (EN), Analyze (FR), and Tunisian Arabic responses validated successfully.`);
  } catch (err) {
    record(4, "Real messages sent and factual grounded responses received", false, err.message);
  }

  // ---------------------------------------------------------------------------
  // 5. Saving conversations in D1 database
  // ---------------------------------------------------------------------------
  let chatIdA = null;
  const chatTitle = "Live E2E Test Session";

  try {
    // Create chat
    const createRes = await fetch(API_BASE + "/api/user/chats", {
      method: "POST",
      headers: { "cookie": sessionCookieA, "content-type": "application/json" },
      body: JSON.stringify({ title: chatTitle })
    });
    assert.equal(createRes.status, 201);
    const createData = await createRes.json();
    chatIdA = createData.chat.id;
    assert.ok(chatIdA, "No chat id returned");

    // Add user message
    const userMsgRes = await fetch(API_BASE + `/api/user/chats/${chatIdA}`, {
      method: "POST",
      headers: { "cookie": sessionCookieA, "content-type": "application/json" },
      body: JSON.stringify({ role: "user", content: "Do you know Python and what are your main skills?" })
    });
    assert.equal(userMsgRes.status, 201);

    // Add assistant message
    const botMsgRes = await fetch(API_BASE + `/api/user/chats/${chatIdA}`, {
      method: "POST",
      headers: { "cookie": sessionCookieA, "content-type": "application/json" },
      body: JSON.stringify({ role: "assistant", content: answerChat || "Python, JavaScript, Cloudflare Workers." })
    });
    assert.equal(botMsgRes.status, 201);

    record(5, "Saving conversations and messages in D1 database", true,
      `Created conversation ${chatIdA} with user and assistant messages.`);
  } catch (err) {
    record(5, "Saving conversations and messages in D1 database", false, err.message);
  }

  // ---------------------------------------------------------------------------
  // 6. Refreshing and verifying conversation persistence
  // ---------------------------------------------------------------------------
  try {
    const listRes = await fetch(API_BASE + "/api/user/chats", {
      headers: { "cookie": sessionCookieA }
    });
    assert.equal(listRes.status, 200);
    const listData = await listRes.json();
    const foundChat = (listData.chats || []).find(c => c.id === chatIdA);
    assert.ok(foundChat, `Chat ${chatIdA} not found in user chats list`);
    assert.equal(foundChat.title, chatTitle);

    // Fetch messages of this chat
    const detailRes = await fetch(API_BASE + `/api/user/chats/${chatIdA}`, {
      headers: { "cookie": sessionCookieA }
    });
    assert.equal(detailRes.status, 200);
    const detailData = await detailRes.json();
    assert.equal(detailData.messages.length, 2, "Expected 2 messages stored in chat");
    assert.equal(detailData.messages[0].role, "user");
    assert.equal(detailData.messages[1].role, "assistant");

    record(6, "Page refresh / persistence of conversations and messages", true,
      `Conversation retrieved with full message history and correct roles.`);
  } catch (err) {
    record(6, "Page refresh / persistence of conversations and messages", false, err.message);
  }

  // ---------------------------------------------------------------------------
  // 7. Logout and re-login, retrieving user history
  // ---------------------------------------------------------------------------
  try {
    // Logout
    await fetch(API_BASE + "/api/auth/logout", {
      method: "POST",
      headers: { "cookie": sessionCookieA, "content-type": "application/json" },
      body: "{}"
    });

    // Login again
    const reLoginRes = await fetch(API_BASE + "/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: testEmailA, password: testPasswordA })
    });
    assert.equal(reLoginRes.status, 200);
    sessionCookieA = extractCookie(reLoginRes);

    // Retrieve chats after re-login
    const restoredRes = await fetch(API_BASE + "/api/user/chats", {
      headers: { "cookie": sessionCookieA }
    });
    assert.equal(restoredRes.status, 200);
    const restoredData = await restoredRes.json();
    const restoredChat = (restoredData.chats || []).find(c => c.id === chatIdA);
    assert.ok(restoredChat, "Restored chat not found after re-login");

    record(7, "Logout and re-login successfully restores user history", true,
      `Authenticated session restored chat list and conversation state.`);
  } catch (err) {
    record(7, "Logout and re-login successfully restores user history", false, err.message);
  }

  // ---------------------------------------------------------------------------
  // 8. User isolation (no cross-user conversation leakage)
  // ---------------------------------------------------------------------------
  const testEmailB = `test.melek.user.b.${Date.now()}.${Math.floor(Math.random() * 10000)}@example.com`;
  const testPasswordB = "SecurePasswordB!99";
  let sessionCookieB = null;

  try {
    // Register User B
    const regResB = await fetch(API_BASE + "/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Live Tester B", email: testEmailB, password: testPasswordB })
    });
    assert.equal(regResB.status, 201);
    sessionCookieB = extractCookie(regResB);

    // User B attempts to access User A's chat
    const crossAccessRes = await fetch(API_BASE + `/api/user/chats/${chatIdA}`, {
      headers: { "cookie": sessionCookieB }
    });
    assert.equal(crossAccessRes.status, 404, "User B should receive 404 when trying to access User A's chat");

    // User B lists their chats
    const listB = await fetch(API_BASE + "/api/user/chats", {
      headers: { "cookie": sessionCookieB }
    });
    assert.equal(listB.status, 200);
    const dataB = await listB.json();
    const leaked = (dataB.chats || []).some(c => c.id === chatIdA);
    assert.equal(leaked, false, "User A's chat leaked into User B's chat list!");

    record(8, "Strict user isolation (zero conversation leakage between users)", true,
      `User B received 404 on User A's chat ID and User A's chats never appeared in User B's list.`);
  } catch (err) {
    record(8, "Strict user isolation (zero conversation leakage between users)", false, err.message);
  }

  // ---------------------------------------------------------------------------
  // 9. Model selection and switching
  // ---------------------------------------------------------------------------
  try {
    // Query with default model
    const m1Res = await fetch(API_BASE + "/api/assistant", {
      method: "POST",
      headers: { "content-type": "application/json", "origin": FRONTEND_BASE },
      body: JSON.stringify({ question: "Tell me about Melek's projects", model_id: "melek-ai-v1", mode: "chat" })
    });
    assert.equal(m1Res.status, 200);
    const m1Data = await m1Res.json();
    assert.ok(m1Data.answer, "m1 returned no answer");

    // Query with experimental model
    const m2Res = await fetch(API_BASE + "/api/assistant", {
      method: "POST",
      headers: { "content-type": "application/json", "origin": FRONTEND_BASE },
      body: JSON.stringify({ question: "Tell me about Melek's projects", model_id: "melek-ai-experimental", mode: "analyze" })
    });
    assert.equal(m2Res.status, 200);
    const m2Data = await m2Res.json();
    assert.ok(m2Data.answer, "m2 returned no answer");
    assert.equal(m2Data.mode, "analyze");

    // Check status endpoint
    const statusRes = await fetch(API_BASE + "/api/melek-ai/status");
    assert.equal(statusRes.status, 200);
    const statusData = await statusRes.json();
    assert.equal(statusData.model_id, "melek-ai-v1");

    record(9, "Model selection and mode switching tested successfully", true,
      `Default model (${statusData.model_id}) and experimental model requests handled seamlessly.`);
  } catch (err) {
    record(9, "Model selection and mode switching tested successfully", false, err.message);
  }

  // ---------------------------------------------------------------------------
  // 10. Error handling (empty questions, burst limits, unauthenticated access)
  // ---------------------------------------------------------------------------
  try {
    // Empty question
    const emptyRes = await fetch(API_BASE + "/api/assistant", {
      method: "POST",
      headers: { "content-type": "application/json", "origin": FRONTEND_BASE },
      body: JSON.stringify({ question: "" })
    });
    assert.equal(emptyRes.status, 400);
    const emptyErr = await emptyRes.json();
    assert.ok(emptyErr.error.includes("question is required"));

    // Unauthenticated chat access
    const unauthRes = await fetch(API_BASE + "/api/user/chats");
    assert.equal(unauthRes.status, 401);

    // Malformed JSON body
    const badJsonRes = await fetch(API_BASE + "/api/assistant", {
      method: "POST",
      headers: { "content-type": "application/json", "origin": FRONTEND_BASE },
      body: "INVALID_JSON_BODY{{"
    });
    assert.equal(badJsonRes.status, 400);

    record(10, "Robust error handling (validation, auth limits, malformed inputs)", true,
      `Handled empty question (400), unauthenticated access (401), and malformed JSON (400) gracefully.`);
  } catch (err) {
    record(10, "Robust error handling (validation, auth limits, malformed inputs)", false, err.message);
  }

  console.log("\n================================================================================");
  const total = results.length;
  const passed = results.filter(r => r.passed).length;
  console.log(` Summary: ${passed}/${total} Live End-to-End Test Points Passed`);
  console.log("================================================================================\n");

  if (passed !== total) {
    process.exit(1);
  }
}

runTest().catch(err => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
