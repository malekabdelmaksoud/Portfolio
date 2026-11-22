import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import { webcrypto, createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function environment() {
  const facts=[
    {id:"skills-001",category:"skills",text_fr:"Langages mentionnés : C, Java, Python et PHP.",text_en:"Listed programming languages include C, Java, Python and PHP.",text_ar:"لغات البرمجة المذكورة تشمل C و Java و Python و PHP.",aliases_json:'["python","java","programming"]',source_file:"index.html",source_selector:"#skillsLangagesList",public_url:null,approved:1},
    {id:"project-001",category:"project",text_fr:"Projet Laravel publié sur le portfolio.",text_en:"Laravel project published in the portfolio.",text_ar:"مشروع Laravel منشور في ملف الأعمال.",aliases_json:'["project","projets","مشاريع","المشاريع"]',source_file:"index.html",source_selector:"#projets .project-card",public_url:"https://github.com/example/project",approved:1},
    {id:"private-001",category:"profile",text_fr:"Secret private draft.",text_en:"Secret private draft.",text_ar:"مسودة خاصة سرية.",aliases_json:'["secret"]',source_file:"draft.md",source_selector:"#private",public_url:null,approved:0}
  ];
  const projects=[{id:"project-001",title:"Demo",type:"WEB",description_fr:"Projet public",description_en:"Public project",url:"https://github.com/example/demo",sort_order:1,visible:1},{id:"hidden-001",title:"Hidden",type:"WEB",description_fr:"Brouillon",description_en:"Draft",url:"https://github.com/example/hidden",sort_order:2,visible:0}];
  const DB={prepare(sql){
    let params=[];
    return {bind(...values){params=values;return this;},async first(){
      if(sql.includes("SELECT 1")) return {ok:1};
      if(sql.includes("SELECT COALESCE(MAX")) return {max_order:projects.reduce((max,p)=>Math.max(max,p.sort_order||0),0)};
      if(sql.includes("SELECT id,url,title FROM projects")) {
        const [id,url]=params;
        return projects.find(p=>p.id===id||p.url===url)||null;
      }
      if(sql.includes("FROM projects WHERE id=? AND")) return projects.find(p=>p.id===params[0]&&p.url===params[1])||null;
      if(sql.includes("FROM facts")) return facts.find(f=>f.id===params[0])||null;
      if(sql.includes("abuse_windows")) return {count:1};
      return {ok:1};
    },async all(){
      if(sql.includes("FROM facts")) return {results:facts.filter(f=>sql.includes("approved=1")?f.approved===1:true)};
      if(sql.includes("FROM projects")) return {results:sql.includes("WHERE visible=1")?projects.filter(p=>p.visible===1):projects};
      return {results:[]};
    },async run(){
      if(sql.includes("INSERT INTO projects")) {
        const [id,title,type,description_fr,description_en,url,sort_order]=params;
        if(projects.some(p=>p.id===id)) {
          throw new Error("D1_ERROR: UNIQUE constraint failed: projects.id");
        }
        if(projects.some(p=>p.url===url)) {
          throw new Error("D1_ERROR: UNIQUE constraint failed: projects.url");
        }
        projects.push({id,title,type,description_fr,description_en,url,visible:1,sort_order});
      }
      return {meta:{changes:1}};
    },async batch(){return [];}};
  }};
  return {DB,ALLOWED_ORIGIN:"https://portfolio.test",ADMIN_EMAIL:"owner@example.test"};
}
const request=(path,body,origin="https://portfolio.test")=>new Request("https://api.test"+path,{method:"POST",headers:{"content-type":"application/json",Origin:origin},body:JSON.stringify(body)});

let mockAdminSigning;
async function getMockAdminSigning() {
 if(mockAdminSigning) return mockAdminSigning;
 const pair=await webcrypto.subtle.generateKey(
   {name:"RSASSA-PKCS1-v1_5",modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:"SHA-256"},
   true,
   ["sign","verify"]
 );
 const jwk=await webcrypto.subtle.exportKey("jwk",pair.publicKey);
 jwk.kid="test-key";
 jwk.use="sig";
 jwk.alg="RS256";
 mockAdminSigning={pair,jwk};
 return mockAdminSigning;
}

async function adminEnvironment(envOverrides={},email="owner@example.test") {
 const env=environment();
 env.ACCESS_ISSUER="https://team.cloudflareaccess.test";
 env.ACCESS_AUD="admin-aud";
 env.ADMIN_EMAIL="owner@example.test";
 env.ACCESS_JWKS_URL="https://team.cloudflareaccess.test/certs";
 Object.assign(env,envOverrides);
 const {pair,jwk}=await getMockAdminSigning();
 const encode=value=>Buffer.from(typeof value==="string"?value:JSON.stringify(value)).toString("base64url");
 const header=encode({alg:"RS256",kid:"test-key",typ:"JWT"});
 const claims=encode({iss:env.ACCESS_ISSUER,aud:[env.ACCESS_AUD],exp:Math.floor(Date.now()/1000)+3600,nbf:Math.floor(Date.now()/1000)-10,email,name:"Owner"});
 const signingInput=header+"."+claims;
 const signature=await webcrypto.subtle.sign(
   {name:"RSASSA-PKCS1-v1_5"},
   pair.privateKey,
   new TextEncoder().encode(signingInput)
 );
 const token=signingInput+"."+Buffer.from(signature).toString("base64url");
 env.__jwks={keys:[jwk]};
 env.__token=token;
 env.__claimsEmail=email;
 return env;
}

function adminRequest(env,path,body) {
 return new Request("https://api.test"+path,{
   method:"POST",
   headers:{
     "content-type":"application/json",
     "origin":"https://portfolio.test",
     "CF-Access-Jwt-Assertion":env.__token
   },
   body:JSON.stringify(body||{})
 });
}

test("health endpoint checks D1 and reports the native auth and Melek AI modes",async()=>{
 const response=await worker.fetch(new Request("https://api.test/api/health"),environment());
 const data=await response.json();
 assert.equal(response.status,200);assert.equal(data.assistant,"melek-ai-experimental");
 assert.equal(data.auth,"native-email-otp");
});

test("assistant clearly reports that Melek AI is not connected",async()=>{
 const response=await worker.fetch(request("/api/assistant",{question:"Do you know Python?"}),environment());
 const data=await response.json();assert.equal(response.status,200);
 assert.equal(data.model,"approved-facts-only");
 assert.match(data.answer,/C, Java, Python and PHP/i);
 assert.equal(response.headers.get("access-control-allow-origin"),"https://portfolio.test");
 assert.equal(response.headers.get("access-control-allow-credentials"),"true");
});


test("assistant recognizes Tunisian Arabic project questions",async()=>{
 const response=await worker.fetch(request("/api/assistant",{question:"شنو المشاريع متاع ملاك"}),environment());
 const data=await response.json();assert.equal(response.status,200);
 assert.equal(data.model,"approved-facts-only");
 assert.match(data.answer,/مشروع/i);
});


test("assistant uses recent topic for a short Arabic follow-up",async()=>{
 const response=await worker.fetch(request("/api/assistant",{question:"زيد فسّرلي",context:["شنو المشاريع متاع ملاك؟"]}),environment());
 const data=await response.json();assert.equal(response.status,200);
 assert.equal(data.model,"approved-facts-only");
});

test("assistant never returns an unapproved fact",async()=>{
 const response=await worker.fetch(request("/api/assistant",{question:"Tell me the secret private draft"}),environment());
 const data=await response.json();assert.equal(response.status,200);
 assert.match(data.answer,/not present|approved/i);assert.equal(data.sources.length,0);
});

test("assistant abstains when there is no matching approved evidence",async()=>{
 const response=await worker.fetch(request("/api/assistant",{question:"What is the moon made of?"}),environment());
 const data=await response.json();assert.equal(data.sources.length,0);assert.match(data.answer,/not present/i);
});


test("assistant abstains in Tunisian Arabic when evidence is missing",async()=>{
 const response=await worker.fetch(request("/api/assistant",{question:"شنو رقم جواز سفر ملاك؟"}),environment());
 const data=await response.json();assert.equal(data.sources.length,0);
 assert.match(data.answer,/المعلومة هاذي موش موجودة/);
});

test("public projects endpoint exposes only visible projects",async()=>{
 const response=await worker.fetch(new Request("https://api.test/api/projects"),environment());
 const data=await response.json();assert.equal(data.projects.length,1);assert.equal(data.projects[0].id,"project-001");
});

test("untrusted browser origin is rejected",async()=>{
 const response=await worker.fetch(request("/api/assistant",{question:"Python"},"https://attacker.test"),environment());
 assert.equal(response.status,403);
});

test("CSRF protection: mutating requests strictly reject missing Origin, null Origin, untrusted origins, and spoofed subdomains", async () => {
  const env = authEnvironment();
  const token = "a".repeat(64);
  const userId = randomUUID();
  env.__users.push({ id: userId, email: "csrf.test@example.test", display_name: "CSRF Tester" });
  env.__sessions.push({ id: randomUUID(), user_id: userId, token_hash: sha256(token + ":"), expires_at: new Date(Date.now() + 86400000).toISOString() });

  const makeReq = (originHeader) => {
    const headers = {
      "content-type": "application/json",
      "Cookie": "__Host-portfolio_session=" + token
    };
    if (originHeader !== undefined) headers["Origin"] = originHeader;
    return new Request("https://api.test/api/user/chats", {
      method: "POST",
      headers,
      body: JSON.stringify({ title: "CSRF Chat" })
    });
  };

  // 1. Missing Origin on mutating request -> 403
  const missingRes = await worker.fetch(makeReq(undefined), env);
  assert.equal(missingRes.status, 403);
  const missingData = await missingRes.json();
  assert.equal(missingData.error, "Origin not allowed.");

  // 2. Origin: null (sandboxed iframe / redirect) -> 403
  const nullRes = await worker.fetch(makeReq("null"), env);
  assert.equal(nullRes.status, 403);

  // 3. Untrusted origin -> 403
  const attackerRes = await worker.fetch(makeReq("https://attacker.test"), env);
  assert.equal(attackerRes.status, 403);

  // 4. Untrusted subdomain (e.g. evil.portfolio.test) -> 403
  const subRes = await worker.fetch(makeReq("https://evil.portfolio.test"), env);
  assert.equal(subRes.status, 403);

  // 5. Suffix spoofing (e.g. portfolio.test.attacker.com) -> 403
  const suffixRes = await worker.fetch(makeReq("https://portfolio.test.attacker.com"), env);
  assert.equal(suffixRes.status, 403);

  // 6. Valid allowed origin -> 201 (success)
  const validRes = await worker.fetch(makeReq("https://portfolio.test"), env);
  assert.equal(validRes.status, 201);
  const validData = await validRes.json();
  assert.ok(validData.chat.id);

  // 7. Non-mutating GET without Origin is allowed (browser direct navigation)
  const getRes = await worker.fetch(new Request("https://api.test/api/health"), env);
  assert.equal(getRes.status, 200);
});

test("OPTIONS preflight handling and CORS headers strict verification", async () => {
  const env = authEnvironment();
  env.ALLOWED_ORIGIN = "https://portfolio.test";

  // 1. Authorized origin preflight -> 204 with correct CORS headers
  const authPreflight = await worker.fetch(new Request("https://api.test/api/user/chats", {
    method: "OPTIONS",
    headers: { "Origin": "https://portfolio.test" }
  }), env);
  assert.equal(authPreflight.status, 204);
  assert.equal(authPreflight.headers.get("access-control-allow-origin"), "https://portfolio.test");
  assert.equal(authPreflight.headers.get("access-control-allow-credentials"), "true");
  assert.ok(authPreflight.headers.get("access-control-allow-methods").includes("POST"));

  // 2. Unauthorized origin preflight -> 403 Forbidden with NO CORS allow header
  const unauthPreflight = await worker.fetch(new Request("https://api.test/api/user/chats", {
    method: "OPTIONS",
    headers: { "Origin": "https://unauthorized.test" }
  }), env);
  assert.equal(unauthPreflight.status, 403);
  assert.equal(unauthPreflight.headers.get("access-control-allow-origin"), null);

  // 3. Preflight with Origin: null -> 403 Forbidden
  const nullPreflight = await worker.fetch(new Request("https://api.test/api/user/chats", {
    method: "OPTIONS",
    headers: { "Origin": "null" }
  }), env);
  assert.equal(nullPreflight.status, 403);
  assert.equal(nullPreflight.headers.get("access-control-allow-origin"), null);

  // 4. Preflight with missing Origin -> 403 Forbidden
  const missingPreflight = await worker.fetch(new Request("https://api.test/api/user/chats", {
    method: "OPTIONS"
  }), env);
  assert.equal(missingPreflight.status, 403);
  assert.equal(missingPreflight.headers.get("access-control-allow-origin"), null);
});

test("allowedOrigin in production rejects localhost, 127.0.0.1, and empty ALLOWED_ORIGIN", async () => {
  const prodEnv = authEnvironment({
    ENVIRONMENT: "production",
    ALLOWED_ORIGIN: "https://portfolio.melekabdelmaksoud72.workers.dev"
  });

  // Localhost rejected in production
  const localRes = await worker.fetch(new Request("https://api.test/api/user/chats", {
    method: "POST",
    headers: { "Origin": "http://localhost:3000", "content-type": "application/json" },
    body: "{}"
  }), prodEnv);
  assert.equal(localRes.status, 403);

  // 127.0.0.1 rejected in production
  const ipRes = await worker.fetch(new Request("https://api.test/api/user/chats", {
    method: "POST",
    headers: { "Origin": "http://127.0.0.1:8787", "content-type": "application/json" },
    body: "{}"
  }), prodEnv);
  assert.equal(ipRes.status, 403);

  // Case A: Empty ALLOWED_ORIGIN in production rejects all, including Same-Origin
  const emptyEnv = authEnvironment({
    ENVIRONMENT: "production",
    ALLOWED_ORIGIN: ""
  });
  const emptyRes = await worker.fetch(new Request("https://api.test/api/user/chats", {
    method: "POST",
    headers: { "Origin": "https://portfolio.melekabdelmaksoud72.workers.dev", "content-type": "application/json" },
    body: "{}"
  }), emptyEnv);
  assert.equal(emptyRes.status, 403, "Case A: Empty ALLOWED_ORIGIN must reject even with valid origin");

  // Case A (Same-Origin variant): Production + ALLOWED_ORIGIN empty + origin===requestOrigin
  const sameOriginEmptyRes = await worker.fetch(new Request("https://api.test/api/user/chats", {
    method: "POST",
    headers: { "Origin": "https://api.test", "content-type": "application/json" },
    body: "{}"
  }), emptyEnv);
  assert.equal(sameOriginEmptyRes.status, 403, "Case A: Empty ALLOWED_ORIGIN must reject even Same-Origin");

  // Case B: Missing (undefined) ALLOWED_ORIGIN in production rejects all
  const missingEnv = authEnvironment({
    ENVIRONMENT: "production"
  });
  delete missingEnv.ALLOWED_ORIGIN;
  const missingAllowedRes = await worker.fetch(new Request("https://api.test/api/user/chats", {
    method: "POST",
    headers: { "Origin": "https://api.test", "content-type": "application/json" },
    body: "{}"
  }), missingEnv);
  assert.equal(missingAllowedRes.status, 403, "Case B: Missing ALLOWED_ORIGIN must reject in production");

  // Case C: Valid ALLOWED_ORIGIN in production allows configured origin and returns Access-Control-Allow-Origin
  const validProdEnv = authEnvironment({
    ENVIRONMENT: "production",
    ALLOWED_ORIGIN: "https://portfolio.melekabdelmaksoud72.workers.dev"
  });
  const validOriginRes = await worker.fetch(new Request("https://api.test/api/assistant", {
    method: "POST",
    headers: { "Origin": "https://portfolio.melekabdelmaksoud72.workers.dev", "content-type": "application/json" },
    body: JSON.stringify({ question: "test" })
  }), validProdEnv);
  assert.notEqual(validOriginRes.status, 403, "Case C: Valid ALLOWED_ORIGIN must allow configured origin");
  assert.equal(
    validOriginRes.headers.get("access-control-allow-origin"),
    "https://portfolio.melekabdelmaksoud72.workers.dev",
    "Access-Control-Allow-Origin must match the allowed origin"
  );
  assert.equal(validOriginRes.headers.get("access-control-allow-credentials"), "true");

  // Case D: Development environment allows localhost and reflects in Access-Control-Allow-Origin
  const devEnv = authEnvironment({
    ENVIRONMENT: "development",
    ALLOWED_ORIGIN: "http://localhost:3000"
  });
  const devLocalRes = await worker.fetch(new Request("https://api.test/api/assistant", {
    method: "POST",
    headers: { "Origin": "http://localhost:3000", "content-type": "application/json" },
    body: JSON.stringify({ question: "test" })
  }), devEnv);
  assert.notEqual(devLocalRes.status, 403, "Case D: Development must allow localhost");
  assert.equal(
    devLocalRes.headers.get("access-control-allow-origin"),
    "http://localhost:3000",
    "Development allowed localhost must reflect in Access-Control-Allow-Origin"
  );

  // Fail-Closed: ENVIRONMENT="prod" with localhost -> 403
  const prodShortEnv = authEnvironment({
    ENVIRONMENT: "prod",
    ALLOWED_ORIGIN: "https://portfolio.melekabdelmaksoud72.workers.dev"
  });
  const prodShortRes = await worker.fetch(new Request("https://api.test/api/user/chats", {
    method: "POST",
    headers: { "Origin": "http://localhost:3000", "content-type": "application/json" },
    body: "{}"
  }), prodShortEnv);
  assert.equal(prodShortRes.status, 403, 'ENVIRONMENT="prod" must reject localhost as fail-closed production');

  // Fail-Closed: ENVIRONMENT="staging" with localhost -> 403
  const stagingEnv = authEnvironment({
    ENVIRONMENT: "staging",
    ALLOWED_ORIGIN: "https://portfolio.melekabdelmaksoud72.workers.dev"
  });
  const stagingRes = await worker.fetch(new Request("https://api.test/api/user/chats", {
    method: "POST",
    headers: { "Origin": "http://localhost:3000", "content-type": "application/json" },
    body: "{}"
  }), stagingEnv);
  assert.equal(stagingRes.status, 403, 'ENVIRONMENT="staging" must reject localhost as fail-closed production');

  // Fail-Closed: Missing ENVIRONMENT (undefined) with localhost -> 403
  const missingEnvEnv = authEnvironment({
    ALLOWED_ORIGIN: "https://portfolio.melekabdelmaksoud72.workers.dev"
  });
  delete missingEnvEnv.ENVIRONMENT;
  const missingEnvRes = await worker.fetch(new Request("https://api.test/api/user/chats", {
    method: "POST",
    headers: { "Origin": "http://localhost:3000", "content-type": "application/json" },
    body: "{}"
  }), missingEnvEnv);
  assert.equal(missingEnvRes.status, 403, "Missing ENVIRONMENT must reject localhost as fail-closed production");

  // Case E (already tested above): Production + localhost → 403

  // Case F: Public GET without Origin header succeeds in production
  const getRes = await worker.fetch(new Request("https://api.test/api/health"), prodEnv);
  assert.equal(getRes.status, 200, "Case F: Public GET without Origin must work in production");
});

test("CSRF protection is universally enforced across all 15 mutating routes (POST, PUT, DELETE)", async () => {
  const env = authEnvironment();
  const dummyChatId = "11111111-2222-3333-4444-555555555555";
  const mutatingRoutes = [
    { method: "POST", path: "/api/assistant" },
    { method: "POST", path: "/api/auth/register" },
    { method: "POST", path: "/api/auth/login" },
    { method: "POST", path: "/api/auth/request" },
    { method: "POST", path: "/api/auth/verify" },
    { method: "POST", path: "/api/auth/google" },
    { method: "POST", path: "/api/auth/password/reset/request" },
    { method: "POST", path: "/api/auth/password/reset/verify" },
    { method: "POST", path: "/api/auth/logout" },
    { method: "POST", path: "/api/user/chats" },
    { method: "PUT", path: `/api/user/chats/${dummyChatId}` },
    { method: "POST", path: `/api/user/chats/${dummyChatId}` },
    { method: "DELETE", path: `/api/user/chats/${dummyChatId}` },
    { method: "DELETE", path: "/api/user/chats" },
    { method: "POST", path: "/api/admin/projects/import" }
  ];

  for (const { method, path } of mutatingRoutes) {
    // 1. Missing Origin must return 403
    const missingRes = await worker.fetch(new Request("https://api.test" + path, {
      method,
      headers: { "content-type": "application/json" },
      body: method === "DELETE" ? undefined : "{}"
    }), env);
    assert.equal(missingRes.status, 403, `Route ${method} ${path} did not reject missing Origin`);

    // 2. Origin: null must return 403
    const nullRes = await worker.fetch(new Request("https://api.test" + path, {
      method,
      headers: { "Origin": "null", "content-type": "application/json" },
      body: method === "DELETE" ? undefined : "{}"
    }), env);
    assert.equal(nullRes.status, 403, `Route ${method} ${path} did not reject Origin: null`);

    // 3. Attacker Origin must return 403
    const attackerRes = await worker.fetch(new Request("https://api.test" + path, {
      method,
      headers: { "Origin": "https://attacker.test", "content-type": "application/json" },
      body: method === "DELETE" ? undefined : "{}"
    }), env);
    assert.equal(attackerRes.status, 403, `Route ${method} ${path} did not reject untrusted Origin`);
  }
});

test("admin API refuses requests without Cloudflare Access identity",async()=>{
 const response=await worker.fetch(new Request("https://api.test/api/admin/facts"),environment());
 assert.equal(response.status,401);
});

test("per-user chat endpoints require a native verified session",async()=>{
 const response=await worker.fetch(new Request("https://api.test/api/user/chats"),environment());
 assert.equal(response.status,401);
 const data=await response.json();
 assert.match(data.error,/Email sign-in is required/i);
});

test("auth config does not expose Turnstile secret",async()=>{
 const env={...environment(),TURNSTILE_SITE_KEY:"0x-test-public-site-key",TURNSTILE_SECRET:"secret"};
 const response=await worker.fetch(new Request("https://api.test/api/auth/config"),env);
 const data=await response.json();
 assert.equal(response.status,200);
 assert.equal(data.turnstileSiteKey,"0x-test-public-site-key");
 assert.doesNotMatch(JSON.stringify(data),/secret/i);
});

test("API origin is allowed and Google sign-in fails closed when unconfigured",async()=>{
 const response=await worker.fetch(new Request("https://api.test/api/auth/google",{method:"POST",headers:{"content-type":"application/json","Origin":"https://portfolio.test"},body:'{"credential":"test"}'}),environment());
 const data=await response.json();
 assert.equal(response.status,503);
 assert.equal(data.code,"GOOGLE_NOT_CONFIGURED");
});

test("configured Google sign-in rejects expired or mismatched identities",async()=>{
 const env={...environment(),GOOGLE_CLIENT_ID:"google-client.test",SESSION_PEPPER:"test-pepper"};
 const oldFetch=globalThis.fetch;
 globalThis.fetch=async()=>new Response(JSON.stringify({
 aud:"different-client",
 iss:"accounts.google.com",
 email:"visitor@example.test",
 email_verified:"true",
 sub:"google-sub-1",
 exp:String(Math.floor(Date.now()/1000)+3600)
 }),{status:200,headers:{"content-type":"application/json"}});
 try {
 const response=await worker.fetch(authRequest("/api/auth/google",{credential:"test-credential"}),env);
 const data=await response.json();
 assert.equal(response.status,401);
 assert.equal(data.code,"INVALID_GOOGLE_CREDENTIAL");
 } finally { globalThis.fetch=oldFetch; }
});

test("separate login and registration pages support password manager fields",async()=>{
 const login=readFileSync(resolve(process.cwd(),"..","login.html"),"utf8");
 const register=readFileSync(resolve(process.cwd(),"..","register.html"),"utf8");
 assert.match(login,/autocomplete="username"/);
 assert.match(login,/autocomplete="current-password"/);
 assert.match(login,/forgot-password/);
 assert.match(register,/autocomplete="new-password"/);
 assert.match(register,/login\.html/);
});

test("email password registration and login create a private session",async()=>{
 const env=authEnvironment({SESSION_PEPPER:"test-pepper"});
 const registered=await worker.fetch(authRequest("/api/auth/register",{name:"Visitor","email":"visitor@example.test",password:"StrongPass123"}),env);
 const registeredData=await registered.json();
 assert.equal(registered.status,200,JSON.stringify(registeredData));
 assert.equal(registeredData.authenticated,true);
 assert.equal(env.__users[0].email,"visitor@example.test");
 const loggedOut=await worker.fetch(authRequest("/api/auth/login",{email:"visitor@example.test",password:"wrongpass"}),env);
 assert.equal(loggedOut.status,401);
 const loggedIn=await worker.fetch(authRequest("/api/auth/login",{email:"visitor@example.test",password:"StrongPass123"}),env);
 const loggedInData=await loggedIn.json();
 assert.equal(loggedIn.status,200);
 assert.equal(loggedInData.authenticated,true);
 assert.match(loggedIn.headers.get("set-cookie")||"",/HttpOnly/);
});

test("password reset verifies a private code and replaces the password",async()=>{
 const env=authEnvironment({SESSION_PEPPER:"test-pepper",OTP_PEPPER:"reset-pepper"});
 const registered=await worker.fetch(authRequest("/api/auth/register",{name:"Reset User",email:"reset@example.test",password:"OldPassword123"}),env);
 assert.equal(registered.status,200);
 env.__resetChallenges.push({
  id:"reset-1",
  email:"reset@example.test",
  code_hash:sha256("123456:reset@example.test:reset-pepper"),
  expires_at:new Date(Date.now()+900000).toISOString(),
  attempts:0,
  consumed_at:null,
  ip_hash:sha256("203.0.113.5")
 });
 const response=await worker.fetch(authRequest("/api/auth/password/reset/verify",{email:"reset@example.test",code:"123456",password:"NewPassword123"}),env);
 const data=await response.json();
 assert.equal(response.status,200);
 assert.equal(data.reset,true);
 const login=await worker.fetch(authRequest("/api/auth/login",{email:"reset@example.test",password:"NewPassword123"}),env);
 assert.equal(login.status,200);
});

test("Melek AI status reports development truthfully",async()=>{
 const response=await worker.fetch(new Request("https://api.test/api/melek-ai/status"),environment());
 const data=await response.json();
 assert.equal(response.status,200);
 assert.equal(data.experimental,true);
 assert.equal(data.trained_from_scratch,false);
 assert.equal(data.inference_available,false);
 assert.equal(data.third_party_fallback_disabled,true);
});

test("chat mode is preserved as a request field",async()=>{
 const response=await worker.fetch(request("/api/assistant",{question:"Do you know Python?",mode:"chat"}),environment());
 const data=await response.json();
 assert.equal(response.status,200);
 assert.equal(data.mode,"chat");
 assert.equal(data.model,"approved-facts-only");
});

test("analyze mode is preserved as a request field",async()=>{
 const response=await worker.fetch(request("/api/assistant",{question:"Do you know Python?",mode:"analyze"}),environment());
 const data=await response.json();
 assert.equal(response.status,200);
 assert.equal(data.mode,"analyze");
 assert.equal(data.model,"approved-facts-only");
});

test("unavailable independent inference has no third-party fallback",async()=>{
 const env={...environment(),MELEK_AI_SERVICE_URL:""};
 const response=await worker.fetch(request("/api/assistant",{question:"Do you know Python?"}),env);
 const data=await response.json();
 assert.equal(response.status,200);
 assert.equal(data.model,"approved-facts-only");
 assert.doesNotMatch(JSON.stringify(data),/@cf\/|GLM|Llama|OpenAI|Gemini/i);
});

test("model selection is preserved and extensible in assistant requests",async()=>{
 const response=await worker.fetch(request("/api/assistant",{question:"Do you know Python?",model_id:"melek-ai-custom"}),environment());
 const data=await response.json();
 assert.equal(response.status,200);
 assert.equal(data.requested_model,"melek-ai-custom");
});

test("repository import rejects external URLs from an authenticated admin",async()=>{
 const env=await adminEnvironment();
 const oldFetch=globalThis.fetch;
 globalThis.fetch=async url=>url.includes("/certs")?new Response(JSON.stringify(env.__jwks),{status:200,headers:{"content-type":"application/json"}}):new Response("{}",{status:404});
 try {
 const response=await worker.fetch(adminRequest(env,"/api/admin/projects/import",{provider:"github",url:"https://example.com/owner/repo"}),env);
 const data=await response.json();
 assert.equal(response.status,400);
 assert.equal(data.code,"INVALID_REPOSITORY_URL");
 } finally {globalThis.fetch=oldFetch;}
});

test("repository import rejects non-admin users",async()=>{
 const env=await adminEnvironment({}, "visitor@example.test");
 const oldFetch=globalThis.fetch;
 globalThis.fetch=async()=>new Response(JSON.stringify(env.__jwks),{status:200,headers:{"content-type":"application/json"}});
 try {
 const response=await worker.fetch(adminRequest(env,"/api/admin/projects/import",{provider:"github",url:"https://github.com/owner/public-repo"}),env);
 assert.equal(response.status,401);
 } finally {globalThis.fetch=oldFetch;}
});

test("GitHub private repository is rejected",async()=>{
 const env=await adminEnvironment();
 const oldFetch=globalThis.fetch;
 globalThis.fetch=async url=>{
 if(url.includes("/certs")) return new Response(JSON.stringify(env.__jwks),{status:200,headers:{"content-type":"application/json"}});
 if(url.includes("/repos/owner/public-repo")&&!url.includes("/topics")&&!url.includes("/languages")&&!url.includes("/contents")) return new Response(JSON.stringify({name:"public-repo",private:true,visibility:"private",default_branch:"main",description:"Private"}),{status:200,headers:{"content-type":"application/json"}});
 return new Response("{}",{status:404});
 };
 try {
 const response=await worker.fetch(adminRequest(env,"/api/admin/projects/import",{provider:"github",url:"https://github.com/owner/public-repo"}),env);
 const data=await response.json();
 assert.equal(response.status,403);
 assert.equal(data.code,"PRIVATE_REPOSITORY");
 } finally {globalThis.fetch=oldFetch;}
});

test("GitLab private and internal repositories are rejected",async()=>{
 for(const visibility of ["private","internal"]) {
 const env=await adminEnvironment();
 const oldFetch=globalThis.fetch;
 globalThis.fetch=async url=>{
  if(url.includes("/certs")) return new Response(JSON.stringify(env.__jwks),{status:200,headers:{"content-type":"application/json"}});
  if(url.includes("/api/v4/projects/group%2Frepo")) return new Response(JSON.stringify({name:"repo",visibility,default_branch:"main",description:"Restricted"}),{status:200,headers:{"content-type":"application/json"}});
  return new Response("{}",{status:404});
 };
 try {
  const response=await worker.fetch(adminRequest(env,"/api/admin/projects/import",{provider:"gitlab",url:"https://gitlab.com/group/repo"}),env);
  const data=await response.json();
  assert.equal(response.status,403);
  assert.equal(data.code,visibility==="internal"?"INTERNAL_REPOSITORY":"PRIVATE_REPOSITORY");
 } finally {globalThis.fetch=oldFetch;}
 }
});

test("public GitHub repository is imported once with metadata evidence",async()=>{
 const env=await adminEnvironment();
 const oldFetch=globalThis.fetch;
 let readmeRequested=false;
 globalThis.fetch=async url=>{
 if(url.includes("/certs")) return new Response(JSON.stringify(env.__jwks),{status:200,headers:{"content-type":"application/json"}});
 if(url.endsWith("/repos/owner/demo")) return new Response(JSON.stringify({name:"demo",private:false,visibility:"public",default_branch:"main",description:"A public demo application."}),{status:200,headers:{"content-type":"application/json"}});
 if(url.includes("/topics")) return new Response(JSON.stringify({names:["javascript","portfolio"]}),{status:200,headers:{"content-type":"application/json"}});
 if(url.includes("/languages")) return new Response(JSON.stringify({JavaScript:100}),{status:200,headers:{"content-type":"application/json"}});
 if(url.includes("/contents/README.md")) {
   readmeRequested=true;
   const encoded=Buffer.from("# Demo\n\nGITHUB_README_EVIDENCE_MARKER provides a public demo application with verified sample evidence.").toString("base64");
   return new Response(JSON.stringify({content:encoded}),{status:200,headers:{"content-type":"application/json"}});
  }
 if(url.includes("/contents/")) return new Response("{}",{status:404});
 return new Response("{}",{status:404});
 };
 try {
 const first=await worker.fetch(adminRequest(env,"/api/admin/projects/import",{provider:"github",url:"https://github.com/owner/demo"}),env);
 const firstData=await first.json();
 assert.equal(first.status,201);
 assert.equal(firstData.saved,true);
 assert.match(firstData.project.description_en,/public demo application/i);
 assert.match(firstData.project.description_en,/GITHUB_README_EVIDENCE_MARKER/);
 assert.equal(readmeRequested,true);
 const duplicate=await worker.fetch(adminRequest(env,"/api/admin/projects/import",{provider:"github",url:"https://github.com/owner/demo"}),env);
 const duplicateData=await duplicate.json();
 assert.equal(duplicate.status,409);
 assert.equal(duplicateData.code,"DUPLICATE_PROJECT");
 } finally {globalThis.fetch=oldFetch;}
});

test("imported GitHub project appears in public projects and assistant retrieval",async()=>{
 const env=await adminEnvironment();
 const oldFetch=globalThis.fetch;
 globalThis.fetch=async url=>{
  if(url.includes("/certs")) return new Response(JSON.stringify(env.__jwks),{status:200,headers:{"content-type":"application/json"}});
  if(url.endsWith("/repos/owner/demo")) return new Response(JSON.stringify({name:"demo",private:false,visibility:"public",default_branch:"main",description:"A public demo application."}),{status:200,headers:{"content-type":"application/json"}});
  if(url.includes("/topics")) return new Response(JSON.stringify({names:["javascript"]}),{status:200,headers:{"content-type":"application/json"}});
  if(url.includes("/languages")) return new Response(JSON.stringify({JavaScript:100}),{status:200,headers:{"content-type":"application/json"}});
  return new Response("{}",{status:404});
 };
 try {
  const imported=await worker.fetch(adminRequest(env,"/api/admin/projects/import",{provider:"github",url:"https://github.com/owner/demo"}),env);
  assert.equal(imported.status,201);
  const publicResponse=await worker.fetch(new Request("https://api.test/api/projects"),env);
  const publicData=await publicResponse.json();
  assert.ok(publicData.projects.some(p=>p.url==="https://github.com/owner/demo"));
  const assistantResponse=await worker.fetch(request("/api/assistant",{question:"What is the demo project?"}),env);
  const assistantData=await assistantResponse.json();
  assert.ok(assistantData.sources?.some(source=>source.category==="project"&&source.id.startsWith("import-github-")));
 } finally {globalThis.fetch=oldFetch;}
});

test("public GitLab repository is imported with public visibility evidence",async()=>{
 const env=await adminEnvironment();
 const oldFetch=globalThis.fetch;
 let readmeRequested=false;
 globalThis.fetch=async url=>{
 if(url.includes("/certs")) return new Response(JSON.stringify(env.__jwks),{status:200,headers:{"content-type":"application/json"}});
 if(url.includes("/repository/files/README.md/raw")) {
  readmeRequested=true;
  return new Response("# Demo\n\nGLAB_README_EVIDENCE_MARKER provides a public PHP project with verified README evidence.",{status:200,headers:{"content-type":"text/plain"}});
 }
 if(url.includes("/repository/files/")) return new Response("{}",{status:404});
 if(url.includes("/api/v4/projects/group%2Fdemo")) {
  if(url.endsWith("/languages")) return new Response(JSON.stringify({PHP:70}),{status:200,headers:{"content-type":"application/json"}});
  return new Response(JSON.stringify({name:"demo",visibility:"public",default_branch:"main",description:"A public PHP project.",tag_list:["php"]}),{status:200,headers:{"content-type":"application/json"}});
 }
 return new Response("{}",{status:404});
 };
 try {
 const response=await worker.fetch(adminRequest(env,"/api/admin/projects/import",{provider:"gitlab",url:"https://gitlab.com/group/demo"}),env);
 const data=await response.json();
 assert.equal(response.status,201);
 assert.equal(data.project.url,"https://gitlab.com/group/demo");
 assert.match(data.project.description_en,/public PHP project/i);
 assert.match(data.project.description_en,/PHP/);
 assert.match(data.project.description_en,/php/);
 assert.match(data.project.description_en,/GLAB_README_EVIDENCE_MARKER/);
 assert.equal(readmeRequested,true);
 } finally {globalThis.fetch=oldFetch;}
});

test("public GitLab repository imports when README.md is unavailable",async()=>{
 const env=await adminEnvironment();
 const oldFetch=globalThis.fetch;
 globalThis.fetch=async url=>{
  if(url.includes("/certs")) return new Response(JSON.stringify(env.__jwks),{status:200,headers:{"content-type":"application/json"}});
  if(url.includes("/repository/files/")) return new Response("{}",{status:404});
  if(url.includes("/api/v4/projects/group%2Fno-readme")) {
   if(url.endsWith("/languages")) return new Response(JSON.stringify({JavaScript:90}),{status:200,headers:{"content-type":"application/json"}});
   return new Response(JSON.stringify({name:"no-readme",visibility:"public",default_branch:"main",description:"A public JavaScript project.",tag_list:["javascript"]}),{status:200,headers:{"content-type":"application/json"}});
  }
  if(url.includes("/repository/files/")) return new Response("{}",{status:404});
  return new Response("{}",{status:404});
 };
 try {
  const response=await worker.fetch(adminRequest(env,"/api/admin/projects/import",{provider:"gitlab",url:"https://gitlab.com/group/no-readme"}),env);
  const data=await response.json();
  assert.equal(response.status,201);
  assert.equal(data.project.url,"https://gitlab.com/group/no-readme");
  assert.match(data.project.description_en,/public JavaScript project/i);
  assert.match(data.project.description_en,/Languages: JavaScript/i);
 } finally {globalThis.fetch=oldFetch;}
});

test("provider API failures do not create a project",async()=>{
 const env=await adminEnvironment();
 const oldFetch=globalThis.fetch;
 globalThis.fetch=async url=>{
 if(url.includes("/certs")) return new Response(JSON.stringify(env.__jwks),{status:200,headers:{"content-type":"application/json"}});
 return new Response("{}",{status:503});
 };
 try {
 const response=await worker.fetch(adminRequest(env,"/api/admin/projects/import",{provider:"github",url:"https://github.com/owner/broken"}),env);
 const data=await response.json();
 assert.equal(response.status,502);
 assert.equal(data.code,"REPOSITORY_API_FAILURE");
 } finally {globalThis.fetch=oldFetch;}
});

test("import endpoint rejects requests without Cloudflare Access",async()=>{
 const response=await worker.fetch(new Request("https://api.test/api/admin/projects/import",{method:"POST",headers:{"content-type":"application/json","origin":"https://portfolio.test"},body:JSON.stringify({provider:"github",url:"https://github.com/owner/repo"})}),environment());
 assert.equal(response.status,401);
});

test("frontend import sends credentials and has no inline repository import handler",async()=>{
 const fs=await import("node:fs");
 const ui=fs.readFileSync(new URL("../../portfolio-auth-ui.js",import.meta.url),"utf8");
 assert.match(ui,/credentials:\s*"include"/);
 assert.doesNotMatch(ui,/onclick=["'][^"']*importGitRepoDirect/);
 assert.doesNotMatch(ui,/p_\s*\+\s*Date\.now/);
});

test("import rejects duplicate URL with 409 DUPLICATE_PROJECT on second import",async()=>{
 const env=await adminEnvironment();
 const oldFetch=globalThis.fetch;
 globalThis.fetch=async url=>{
  if(url.includes("/certs")) return new Response(JSON.stringify(env.__jwks),{status:200,headers:{"content-type":"application/json"}});
  if(url.endsWith("/repos/owner/dup-test")) return new Response(JSON.stringify({name:"dup-test",private:false,visibility:"public",default_branch:"main",description:"A unique repository."}),{status:200,headers:{"content-type":"application/json"}});
  if(url.includes("/topics")) return new Response(JSON.stringify({names:["javascript"]}),{status:200,headers:{"content-type":"application/json"}});
  if(url.includes("/languages")) return new Response(JSON.stringify({JavaScript:100}),{status:200,headers:{"content-type":"application/json"}});
  return new Response("{}",{status:404});
 };
 try {
  const first=await worker.fetch(adminRequest(env,"/api/admin/projects/import",{provider:"github",url:"https://github.com/owner/dup-test"}),env);
  assert.equal(first.status,201);
  const second=await worker.fetch(adminRequest(env,"/api/admin/projects/import",{provider:"github",url:"https://github.com/owner/dup-test"}),env);
  assert.equal(second.status,409);
  const data=await second.json();
  assert.equal(data.code,"DUPLICATE_PROJECT");
 } finally {globalThis.fetch=oldFetch;}
});

test("import rejects existing old project URL with 409 and preserves original project",async()=>{
 const env=await adminEnvironment();
 const oldFetch=globalThis.fetch;
 globalThis.fetch=async url=>{
  if(url.includes("/certs")) return new Response(JSON.stringify(env.__jwks),{status:200,headers:{"content-type":"application/json"}});
  if(url.endsWith("/repos/example/demo")) return new Response(JSON.stringify({name:"demo",private:false,visibility:"public",default_branch:"main",description:"Duplicate demo repo."}),{status:200,headers:{"content-type":"application/json"}});
  if(url.includes("/topics")) return new Response(JSON.stringify({names:[]}),{status:200,headers:{"content-type":"application/json"}});
  if(url.includes("/languages")) return new Response(JSON.stringify({JavaScript:100}),{status:200,headers:{"content-type":"application/json"}});
  return new Response("{}",{status:404});
 };
 try {
  // https://github.com/example/demo is already seeded as 'project-001'
  const response=await worker.fetch(adminRequest(env,"/api/admin/projects/import",{provider:"github",url:"https://github.com/example/demo"}),env);
  assert.equal(response.status,409);
  const data=await response.json();
  assert.equal(data.code,"DUPLICATE_PROJECT");

  // Verify original project-001 is completely untouched
  const publicRes=await worker.fetch(new Request("https://api.test/api/projects"),env);
  const publicData=await publicRes.json();
  const original=publicData.projects.find(p=>p.id==="project-001");
  assert.ok(original);
  assert.equal(original.title,"Demo");
  assert.equal(original.url,"https://github.com/example/demo");
  assert.equal(original.type,"WEB");
 } finally {globalThis.fetch=oldFetch;}
});

test("concurrent import operations for same URL succeed once and return 409 on race",async()=>{
 const env=await adminEnvironment();
 const oldFetch=globalThis.fetch;
 globalThis.fetch=async url=>{
  if(url.includes("/certs")) return new Response(JSON.stringify(env.__jwks),{status:200,headers:{"content-type":"application/json"}});
  if(url.endsWith("/repos/owner/race-test")) return new Response(JSON.stringify({name:"race-test",private:false,visibility:"public",default_branch:"main",description:"Concurrency test repo."}),{status:200,headers:{"content-type":"application/json"}});
  if(url.includes("/topics")) return new Response(JSON.stringify({names:[]}),{status:200,headers:{"content-type":"application/json"}});
  if(url.includes("/languages")) return new Response(JSON.stringify({TypeScript:100}),{status:200,headers:{"content-type":"application/json"}});
  return new Response("{}",{status:404});
 };
 try {
  // Launch two concurrent import requests for the identical repository
  const [resA,resB]=await Promise.all([
   worker.fetch(adminRequest(env,"/api/admin/projects/import",{provider:"github",url:"https://github.com/owner/race-test"}),env),
   worker.fetch(adminRequest(env,"/api/admin/projects/import",{provider:"github",url:"https://github.com/owner/race-test"}),env)
  ]);
  const statuses=[resA.status,resB.status].sort();
  assert.deepEqual(statuses,[201,409]);

  const failed=resA.status===409?await resA.json():await resB.json();
  assert.equal(failed.code,"DUPLICATE_PROJECT");

  // Ensure only one project was inserted into the database
  const publicRes=await worker.fetch(new Request("https://api.test/api/projects"),env);
  const publicData=await publicRes.json();
  const matching=publicData.projects.filter(p=>p.url==="https://github.com/owner/race-test");
  assert.equal(matching.length,1);
 } finally {globalThis.fetch=oldFetch;}
});

test("database UNIQUE constraint violation converts to 409 DUPLICATE_PROJECT instead of 500",async()=>{
 const env=await adminEnvironment();
 const oldFetch=globalThis.fetch;
 globalThis.fetch=async url=>{
  if(url.includes("/certs")) return new Response(JSON.stringify(env.__jwks),{status:200,headers:{"content-type":"application/json"}});
  if(url.endsWith("/repos/owner/constraint-test")) return new Response(JSON.stringify({name:"constraint-test",private:false,visibility:"public",default_branch:"main",description:"Constraint test repo."}),{status:200,headers:{"content-type":"application/json"}});
  if(url.includes("/topics")) return new Response(JSON.stringify({names:[]}),{status:200,headers:{"content-type":"application/json"}});
  if(url.includes("/languages")) return new Response(JSON.stringify({Python:100}),{status:200,headers:{"content-type":"application/json"}});
  return new Response("{}",{status:404});
 };
 // Override DB.prepare run to simulate a direct UNIQUE constraint violation from SQLite/D1 engine
 const originalPrepare=env.DB.prepare.bind(env.DB);
 env.DB.prepare=function(sql){
  const stmt=originalPrepare(sql);
  if(sql.includes("INSERT INTO projects")) {
   return {
    bind(...vals){stmt.bind(...vals);return this;},
    async run(){
     throw new Error("D1_ERROR: UNIQUE constraint failed: projects.url");
    }
   };
  }
  return stmt;
 };
 try {
  const response=await worker.fetch(adminRequest(env,"/api/admin/projects/import",{provider:"github",url:"https://github.com/owner/constraint-test"}),env);
  assert.equal(response.status,409);
  const data=await response.json();
  assert.equal(data.code,"DUPLICATE_PROJECT");
  assert.equal(data.error,"Duplicate Project.");
 } finally {globalThis.fetch=oldFetch;}
});

// --- Native email OTP auth (regression tests for the P0 login blockers) ---

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function authEnvironment(overrides = {}) {
  const otpChallenges = [];
  const passwordResetChallenges = [];
  const users = [];
  const sessions = [];
  const chats = [];
  const chatMessages = [];
  const abuseWindows = new Map();
  const DB = { prepare(sql) {
    let params = [];
    return {
      bind(...values) { params = values; return this; },
      async first() {
        if (sql.includes("FROM chats WHERE id=? AND user_email=?")) {
          return chats.find(c => c.id === params[0] && c.user_email === params[1]) || null;
        }
        if (sql.includes("abuse_windows")) {
          // Accurate SQL UPSERT simulation with RETURNING count
          const [key, kind, nowIso, seconds] = params;
          const nowMs = Date.parse(nowIso);
          let entry = abuseWindows.get(key);
          if (!entry) {
            entry = { key, kind, window_started_at: nowIso, count: 1 };
            abuseWindows.set(key, entry);
            return { count: 1 };
          }
          const startedMs = Date.parse(entry.window_started_at);
          const diffSec = (nowMs - startedMs) / 1000;
          if (diffSec >= Number(seconds)) {
            entry.window_started_at = nowIso;
            entry.count = 1;
            entry.kind = kind;
          } else {
            entry.count += 1;
          }
          return { count: entry.count };
        }
        if (sql.includes("UPDATE otp_challenges SET attempts=attempts+1")) {
          const challenge = otpChallenges.find(c => c.id === params[0] && !c.consumed_at && c.attempts < 5);
          if (!challenge) return null;
          challenge.attempts += 1;
          return { attempts: challenge.attempts };
        }
        if (sql.includes("FROM otp_challenges")) {
          return otpChallenges.find(c => c.email === params[0] && !c.consumed_at) || null;
        }
        if (sql.includes("FROM password_reset_challenges")) {
          return passwordResetChallenges.find(c => c.email === params[0] && !c.consumed_at) || null;
        }
        if (sql.includes("UPDATE password_reset_challenges SET attempts=attempts+1")) {
          const challenge = passwordResetChallenges.find(c => c.id === params[0] && !c.consumed_at && c.attempts < 5);
          if (!challenge) return null;
          challenge.attempts += 1;
          return { attempts: challenge.attempts };
        }
        if (sql.includes("FROM users")) return users.find(u => u.email === params[0]) || null;
        if (sql.includes("auth_sessions")) {
          const [tokenHash, now] = params;
          const session = sessions.find(s => s.token_hash === tokenHash && (!now || s.expires_at > now));
          if (!session) return null;
          const user = users.find(u => u.id === session.user_id);
          if (!user) return null;
          return { id: session.id, user_id: user.id, expires_at: session.expires_at, email: user.email, display_name: user.display_name };
        }
        return null;
      },
      async all() {
        if (sql.includes("FROM chats WHERE user_email=?")) {
          return { results: chats.filter(c => c.user_email === params[0]) };
        }
        if (sql.includes("FROM chat_messages WHERE chat_id=? AND user_email=?")) {
          return { results: chatMessages.filter(m => m.chat_id === params[0] && m.user_email === params[1]) };
        }
        return { results: [] };
      },
      async run() {
        if (sql.includes("INSERT INTO chats")) {
          chats.push({ id: params[0], user_email: params[1], title: params[2], created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
          return { meta: { changes: 1 } };
        }
        if (sql.includes("INSERT INTO chat_messages")) {
          chatMessages.push({ id: params[0], chat_id: params[1], user_email: params[2], role: params[3], content: params[4], created_at: new Date().toISOString() });
          return { meta: { changes: 1 } };
        }
        if (sql.includes("UPDATE chats")) {
          const chatId = sql.includes("updated_at=CURRENT_TIMESTAMP WHERE id=?") ? params[0] : params[1];
          const userEmail = sql.includes("updated_at=CURRENT_TIMESTAMP WHERE id=?") ? params[1] : params[2];
          const chat = chats.find(c => c.id === chatId && c.user_email === userEmail);
          if (chat) {
            if (sql.includes("title=?")) chat.title = params[0];
            chat.updated_at = new Date().toISOString();
            return { meta: { changes: 1 } };
          }
          return { meta: { changes: 0 } };
        }
        if (sql.includes("UPDATE otp_challenges SET consumed_at=CURRENT_TIMESTAMP WHERE email=?")) {
          let count = 0;
          for (const c of otpChallenges) {
            if (c.email === params[0] && !c.consumed_at) {
              c.consumed_at = new Date().toISOString();
              count++;
            }
          }
          return { meta: { changes: count } };
        } else if (sql.includes("DELETE FROM otp_challenges WHERE id=?")) {
          const idx = otpChallenges.findIndex(c => c.id === params[0]);
          if (idx !== -1) {
            otpChallenges.splice(idx, 1);
            return { meta: { changes: 1 } };
          }
          return { meta: { changes: 0 } };
        } else if (sql.includes("INSERT INTO otp_challenges")) {
          otpChallenges.push({ id: params[0], email: params[1], otp_hash: params[2], expires_at: params[3], attempts: 0, consumed_at: null, ip_hash: params[4] });
        } else if (sql.includes("INSERT INTO password_reset_challenges")) {
          passwordResetChallenges.push({ id: params[0], email: params[1], code_hash: params[2], expires_at: params[3], attempts: 0, consumed_at: null, ip_hash: params[4] });
        } else if (sql.includes("UPDATE password_reset_challenges SET consumed_at")) {
          const challenge = passwordResetChallenges.find(c => c.id === params[0] && !c.consumed_at);
          if (!challenge) return { meta: { changes: 0 } };
          challenge.consumed_at = "2026-01-01 00:00:00";
          return { meta: { changes: 1 } };
        } else if (sql.includes("UPDATE users SET password_salt=?")) {
          const user = users.find(u => u.id === params[2]);
          if (user) {
            user.password_salt = params[0];
            user.password_hash = params[1];
          }
        } else if (sql.includes("UPDATE otp_challenges SET attempts")) {
          const challenge = otpChallenges.find(c => c.id === params[0]);
          if (challenge) challenge.attempts += 1;
        } else if (sql.includes("UPDATE otp_challenges SET consumed_at")) {
          const challenge = otpChallenges.find(c => c.id === params[0] && !c.consumed_at);
          if (!challenge) return { meta: { changes: 0 } };
          challenge.consumed_at = "2026-01-01 00:00:00";
          return { meta: { changes: 1 } };
        } else if (sql.includes("INSERT INTO users")) {
          if (!users.some(u => u.email === params[1])) {
            if (params.length >= 5) users.push({ id: params[0], email: params[1], display_name: params[2], password_salt: params[3], password_hash: params[4] });
            else users.push({ id: params[0], email: params[1], display_name: null });
          }
        } else if (sql.includes("INSERT INTO auth_sessions")) {
          sessions.push({ id: params[0], user_id: params[1], token_hash: params[2], expires_at: params[3] });
        } else if (sql.includes("DELETE FROM auth_sessions WHERE token_hash=?")) {
          const idx = sessions.findIndex(s => s.token_hash === params[0]);
          if (idx !== -1) {
            sessions.splice(idx, 1);
            return { meta: { changes: 1 } };
          }
          return { meta: { changes: 0 } };
        } else if (sql.includes("UPDATE auth_sessions SET last_seen_at")) {
          return { meta: { changes: 1 } };
        }
        return { meta: { changes: 1 } };
      }
    };
  },
  async batch(statements) {
    const results = [];
    for (const s of statements) results.push(await s.run());
    return results;
  }};
  return { DB, ALLOWED_ORIGIN: "https://portfolio.test", ADMIN_EMAIL: "owner@example.test", OTP_PEPPER: "", ...overrides, __challenges: otpChallenges, __resetChallenges: passwordResetChallenges, __users: users, __sessions: sessions, __abuseWindows: abuseWindows };
}

const authRequest = (path, body) => new Request("https://api.test" + path, {
  method: "POST",
  headers: { "content-type": "application/json", Origin: "https://portfolio.test", "CF-Connecting-IP": "203.0.113.5" },
  body: JSON.stringify(body)
});

function seedChallenge(env, email, code, overrides = {}) {
  const challenge = {
    id: randomUUID(),
    email,
    otp_hash: sha256(code + ":" + email + ":" + (env.OTP_PEPPER || "")),
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    attempts: 0,
    consumed_at: null,
    ip_hash: sha256("203.0.113.5"),
    ...overrides
  };
  env.__challenges.push(challenge);
  return challenge;
}

test("auth request reports missing Turnstile configuration as 503, fail-closed",async()=>{
 const env=authEnvironment({RESEND_API_KEY:"test-key",EMAIL_FROM:"no-reply@example.test"});
 const response=await worker.fetch(authRequest("/api/auth/request",{email:"melek@gmail.com",turnstileToken:"tok"}),env);
 const data=await response.json();
 assert.equal(response.status,503);
 assert.equal(data.code,"TURNSTILE_NOT_CONFIGURED");
 assert.equal(env.__challenges.length,0);
});

test("auth request accepts a standard email when Turnstile is configured and verified",async()=>{
 const env=authEnvironment({TURNSTILE_SECRET:"turnstile-secret",RESEND_API_KEY:"test-key",EMAIL_FROM:"no-reply@example.test"});
 const oldFetch=globalThis.fetch;let resendCalled=false;
 globalThis.fetch=async(url)=>{
  if(String(url).includes("turnstile")) return new Response(JSON.stringify({success:true}),{status:200,headers:{"content-type":"application/json"}});
  if(String(url).includes("resend")){resendCalled=true;return new Response(JSON.stringify({id:"email-1"}),{status:200,headers:{"content-type":"application/json"}});}
  return new Response("{}",{status:404});
 };
 try {
  const response=await worker.fetch(authRequest("/api/auth/request",{email:"melek@gmail.com",turnstileToken:"valid-tok"}),env);
  const data=await response.json();
  assert.equal(response.status,200);
  assert.equal(data.sent,true);
  assert.equal(resendCalled,true);
  assert.equal(env.__challenges.length,1);
  assert.equal(env.__challenges[0].email,"melek@gmail.com");
 } finally {globalThis.fetch=oldFetch;}
});

test("auth request accepts single-label TLD domains such as x@y.io",async()=>{
 const env=authEnvironment({TURNSTILE_SECRET:"turnstile-secret",RESEND_API_KEY:"test-key",EMAIL_FROM:"no-reply@example.test"});
 const oldFetch=globalThis.fetch;
 globalThis.fetch=async(url)=>{
  if(String(url).includes("turnstile")) return new Response(JSON.stringify({success:true}),{status:200,headers:{"content-type":"application/json"}});
  return new Response(JSON.stringify({id:"email-1"}),{status:200,headers:{"content-type":"application/json"}});
 };
 try {
  const response=await worker.fetch(authRequest("/api/auth/request",{email:"x@y.io",turnstileToken:"valid-tok"}),env);
  assert.equal(response.status,200);
 } finally {globalThis.fetch=oldFetch;}
});

test("auth request rejects an invalid email with 400 instead of 500",async()=>{
 const env=authEnvironment({TURNSTILE_SECRET:"turnstile-secret",RESEND_API_KEY:"test-key",EMAIL_FROM:"no-reply@example.test"});
 const oldFetch=globalThis.fetch;
 globalThis.fetch=async()=>new Response(JSON.stringify({success:true}),{status:200,headers:{"content-type":"application/json"}});
 try {
  const response=await worker.fetch(authRequest("/api/auth/request",{email:"melek",turnstileToken:"valid-tok"}),env);
  const data=await response.json();
  assert.equal(response.status,400);
  assert.equal(data.code,"INVALID_EMAIL");
 } finally {globalThis.fetch=oldFetch;}
});

test("auth request reports missing email delivery as 503, not 500",async()=>{
 const env=authEnvironment({TURNSTILE_SECRET:"turnstile-secret"});
 const oldFetch=globalThis.fetch;
 globalThis.fetch=async()=>new Response(JSON.stringify({success:true}),{status:200,headers:{"content-type":"application/json"}});
 try {
  const response=await worker.fetch(authRequest("/api/auth/request",{email:"melek@gmail.com",turnstileToken:"valid-tok"}),env);
  const data=await response.json();
  assert.equal(response.status,503);
  assert.equal(data.code,"EMAIL_NOT_CONFIGURED");
 } finally {globalThis.fetch=oldFetch;}
});

test("auth request requires a Turnstile token when Turnstile is configured",async()=>{
 const env=authEnvironment({TURNSTILE_SECRET:"turnstile-secret"});
 const response=await worker.fetch(authRequest("/api/auth/request",{email:"melek@gmail.com"}),env);
 const data=await response.json();
 assert.equal(response.status,400);
 assert.equal(data.code,"TURNSTILE_REQUIRED");
});

test("auth request maps a failed Turnstile check to 400",async()=>{
 const env=authEnvironment({TURNSTILE_SECRET:"turnstile-secret",RESEND_API_KEY:"test-key",EMAIL_FROM:"no-reply@example.test"});
 const oldFetch=globalThis.fetch;
 globalThis.fetch=async()=>new Response(JSON.stringify({success:false}),{status:200,headers:{"content-type":"application/json"}});
 try {
  const response=await worker.fetch(authRequest("/api/auth/request",{email:"melek@gmail.com",turnstileToken:"bad"}),env);
  const data=await response.json();
  assert.equal(response.status,400);
  assert.equal(data.code,"TURNSTILE_FAILED");
 } finally {globalThis.fetch=oldFetch;}
});

test("auth request maps unreachable Turnstile service to 502",async()=>{
 const env=authEnvironment({TURNSTILE_SECRET:"turnstile-secret",RESEND_API_KEY:"test-key",EMAIL_FROM:"no-reply@example.test"});
 const oldFetch=globalThis.fetch;
 globalThis.fetch=async()=>{throw new Error("Network timeout connecting to Cloudflare Turnstile");};
 try {
  const response=await worker.fetch(authRequest("/api/auth/request",{email:"melek@gmail.com",turnstileToken:"tok"}),env);
  const data=await response.json();
  assert.equal(response.status,502);
  assert.equal(data.code,"TURNSTILE_FAILED");
 } finally {globalThis.fetch=oldFetch;}
});

test("atomic rate limiting enforces max limit and returns 429",async()=>{
 const env=authEnvironment({TURNSTILE_SECRET:"turnstile-secret",RESEND_API_KEY:"test-key",EMAIL_FROM:"no-reply@example.test"});
 const oldFetch=globalThis.fetch;
 globalThis.fetch=async(url)=>{
  if(String(url).includes("turnstile")) return new Response(JSON.stringify({success:true}),{status:200,headers:{"content-type":"application/json"}});
  return new Response(JSON.stringify({id:"email-1"}),{status:200,headers:{"content-type":"application/json"}});
 };
 try {
  // Limit for otp-email is 5 per 3600 seconds
  for(let i=0;i<5;i++){
   const res=await worker.fetch(authRequest("/api/auth/request",{email:"ratelimit@example.test",turnstileToken:"tok"}),env);
   assert.equal(res.status,200);
  }
  // 6th attempt must be rejected with 429
  const res6=await worker.fetch(authRequest("/api/auth/request",{email:"ratelimit@example.test",turnstileToken:"tok"}),env);
  assert.equal(res6.status,429);
  const data=await res6.json();
  assert.match(data.error,/Too many sign-in requests/i);
 } finally {globalThis.fetch=oldFetch;}
});

test("atomic rate limiting resets counter to 1 when window expires",async()=>{
 const env=authEnvironment({TURNSTILE_SECRET:"turnstile-secret",RESEND_API_KEY:"test-key",EMAIL_FROM:"no-reply@example.test"});
 const oldFetch=globalThis.fetch;
 globalThis.fetch=async(url)=>{
  if(String(url).includes("turnstile")) return new Response(JSON.stringify({success:true}),{status:200,headers:{"content-type":"application/json"}});
  return new Response(JSON.stringify({id:"email-1"}),{status:200,headers:{"content-type":"application/json"}});
 };
 try {
  // 5 requests to reach limit
  for(let i=0;i<5;i++){
   const res=await worker.fetch(authRequest("/api/auth/request",{email:"window@example.test",turnstileToken:"tok"}),env);
   assert.equal(res.status,200);
  }
  // Confirm rejected
  const rej=await worker.fetch(authRequest("/api/auth/request",{email:"window@example.test",turnstileToken:"tok"}),env);
  assert.equal(rej.status,429);

  // Manually expire the window by shifting window_started_at by 3601 seconds in the past
  for(const [k,v] of env.__abuseWindows.entries()){
   v.window_started_at=new Date(Date.now()-3601*1000).toISOString();
  }

  // Next request must reset window and succeed with 200
  const afterExp=await worker.fetch(authRequest("/api/auth/request",{email:"window@example.test",turnstileToken:"tok"}),env);
  assert.equal(afterExp.status,200);
 } finally {globalThis.fetch=oldFetch;}
});

test("atomic rate limiting prevents limit bypass under concurrent requests",async()=>{
 const env=authEnvironment({TURNSTILE_SECRET:"turnstile-secret",RESEND_API_KEY:"test-key",EMAIL_FROM:"no-reply@example.test"});
 const oldFetch=globalThis.fetch;
 globalThis.fetch=async(url)=>{
  if(String(url).includes("turnstile")) return new Response(JSON.stringify({success:true}),{status:200,headers:{"content-type":"application/json"}});
  return new Response(JSON.stringify({id:"email-1"}),{status:200,headers:{"content-type":"application/json"}});
 };
 try {
  // Send 10 concurrent requests for an email with limit=5
  const promises=Array.from({length:10},()=>
   worker.fetch(authRequest("/api/auth/request",{email:"concurrency@example.test",turnstileToken:"tok"}),env)
  );
  const responses=await Promise.all(promises);
  const statuses=responses.map(r=>r.status);
  const passed=statuses.filter(s=>s===200).length;
  const rejected=statuses.filter(s=>s===429).length;

  // Exactly 5 pass, exactly 5 rejected. No bypass allowed!
  assert.equal(passed,5);
  assert.equal(rejected,5);
 } finally {globalThis.fetch=oldFetch;}
});

test("auth verify rejects a wrong code with 400 and counts the attempt",async()=>{
 const env=authEnvironment();
 const challenge=seedChallenge(env,"melek@gmail.com","654321");
 const response=await worker.fetch(authRequest("/api/auth/verify",{email:"melek@gmail.com",code:"123456"}),env);
 const data=await response.json();
 assert.equal(response.status,400);
 assert.match(data.error,/incorrect/i);
 assert.equal(challenge.attempts,1);
});

test("auth verify accepts the correct code and sets an HttpOnly session cookie",async()=>{
 const env=authEnvironment();
 seedChallenge(env,"melek@gmail.com","123456");
 const response=await worker.fetch(authRequest("/api/auth/verify",{email:"melek@gmail.com",code:"123456"}),env);
 const data=await response.json();
 assert.equal(response.status,200);
 assert.equal(data.authenticated,true);
 const cookie=response.headers.get("set-cookie")||"";
 assert.match(cookie,/__Host-portfolio_session=[0-9a-f]{64}/);
 assert.match(cookie,/HttpOnly/);
 assert.equal(env.__sessions.length,1);
});

test("auth routes reject malformed JSON bodies with 400 instead of 500",async()=>{
 const env=authEnvironment();
 const response=await worker.fetch(new Request("https://api.test/api/auth/request",{method:"POST",headers:{"content-type":"application/json",Origin:"https://portfolio.test"},body:"{not json"}),env);
 const data=await response.json();
 assert.equal(response.status,400);
 assert.equal(data.code,"INVALID_BODY");
});

test("auth request invalidates previously issued unconsumed OTP challenges for the same email",async()=>{
 const env=authEnvironment({TURNSTILE_SECRET:"turnstile-secret",RESEND_API_KEY:"test-key",EMAIL_FROM:"no-reply@example.test"});
 const oldFetch=globalThis.fetch;
 globalThis.fetch=async(url)=>{
  if(String(url).includes("turnstile")) return new Response(JSON.stringify({success:true}),{status:200,headers:{"content-type":"application/json"}});
  return new Response(JSON.stringify({id:"email-1"}),{status:200,headers:{"content-type":"application/json"}});
 };
 try {
  // First OTP request
  const res1=await worker.fetch(authRequest("/api/auth/request",{email:"repeat@example.test",turnstileToken:"tok"}),env);
  assert.equal(res1.status,200);
  assert.equal(env.__challenges.length,1);
  const challenge1=env.__challenges[0];
  assert.equal(challenge1.consumed_at,null);

  // Second OTP request for the exact same email
  const res2=await worker.fetch(authRequest("/api/auth/request",{email:"repeat@example.test",turnstileToken:"tok"}),env);
  assert.equal(res2.status,200);
  assert.equal(env.__challenges.length,2);
  const challenge2=env.__challenges[1];

  // Previous challenge must now be invalidated/consumed
  assert.notEqual(challenge1.consumed_at,null);
  assert.equal(challenge2.consumed_at,null);
 } finally {globalThis.fetch=oldFetch;}
});

test("auth request cleans up challenge record if email delivery fails",async()=>{
 const env=authEnvironment({TURNSTILE_SECRET:"turnstile-secret",RESEND_API_KEY:"test-key",EMAIL_FROM:"no-reply@example.test"});
 const oldFetch=globalThis.fetch;
 globalThis.fetch=async(url)=>{
  if(String(url).includes("turnstile")) return new Response(JSON.stringify({success:true}),{status:200,headers:{"content-type":"application/json"}});
  if(String(url).includes("resend")) return new Response("Service Unavailable",{status:502});
  return new Response("{}",{status:404});
 };
 try {
  const response=await worker.fetch(authRequest("/api/auth/request",{email:"faildelivery@example.test",turnstileToken:"tok"}),env);
  assert.equal(response.status,502);
  // Challenge must be removed so no un-sent OTP remains in the database
  assert.equal(env.__challenges.length,0);
 } finally {globalThis.fetch=oldFetch;}
});

test("auth verify enforces atomic attempt limit under concurrent verification guesses",async()=>{
 const env=authEnvironment();
 const challenge=seedChallenge(env,"concurrenthash@example.test","888888");

 // Send 10 concurrent requests with wrong codes
 const promises=Array.from({length:10},(_,i)=>
  worker.fetch(authRequest("/api/auth/verify",{email:"concurrenthash@example.test",code:"00000" + i}),env)
 );
 const responses=await Promise.all(promises);
 const statuses=responses.map(r=>r.status);
 const wrongGuesses=statuses.filter(s=>s===400).length;
 const blockedAttempts=statuses.filter(s=>s===429).length;

 // Exactly 5 guesses evaluated, 5 rejected by atomic attempt limit
 assert.equal(wrongGuesses,5);
 assert.equal(blockedAttempts,5);
 assert.equal(challenge.attempts,5);
});

test("auth verify prevents concurrent replay of the same valid code",async()=>{
 const env=authEnvironment();
 seedChallenge(env,"replay@example.test","555555");

 // Send 2 concurrent requests with the identical valid code
 const [resA,resB]=await Promise.all([
  worker.fetch(authRequest("/api/auth/verify",{email:"replay@example.test",code:"555555"}),env),
  worker.fetch(authRequest("/api/auth/verify",{email:"replay@example.test",code:"555555"}),env)
 ]);
 const statuses=[resA.status,resB.status].sort();
 assert.deepEqual(statuses,[200,400]);

 const failRes=resA.status===400?await resA.json():await resB.json();
 assert.match(failRes.error,/already been used/i);
});

test("auth logout invalidates session and prevents subsequent access",async()=>{
 const env=authEnvironment();
 const userId=randomUUID();
 const token="a".repeat(64);
 const tokenHash=sha256(token + ":" + (env.SESSION_PEPPER || ""));
 env.__users.push({id:userId,email:"logout@example.test",display_name:"Logout User"});
 env.__sessions.push({id:randomUUID(),user_id:userId,token_hash:tokenHash,expires_at:new Date(Date.now()+86400000).toISOString()});

 // Verify session is active
 const meReq=new Request("https://api.test/api/user/me",{
  headers:{Origin:"https://portfolio.test",Cookie:"__Host-portfolio_session=" + token}
 });
 const meRes=await worker.fetch(meReq,env);
 assert.equal(meRes.status,200);

 // Execute logout
 const logoutReq=new Request("https://api.test/api/auth/logout",{
  method:"POST",
  headers:{Origin:"https://portfolio.test",Cookie:"__Host-portfolio_session=" + token}
 });
 const logoutRes=await worker.fetch(logoutReq,env);
 assert.equal(logoutRes.status,200);
 const clearCookie=logoutRes.headers.get("set-cookie")||"";
 assert.match(clearCookie,/Max-Age=0/);

 // Session must be deleted from memory/DB
 assert.equal(env.__sessions.length,0);

 // Subsequent call to /api/user/me must now return 401
 const meRes2=await worker.fetch(meReq,env);
 assert.equal(meRes2.status,401);
});

// --- Zero Trust Access JWT, Isolation & Models Tests ---

async function createAccessJwtToken(envOverrides = {}, claimsOverrides = {}) {
  const env = authEnvironment();
  env.ACCESS_ISSUER = "https://team.cloudflareaccess.test";
  env.ACCESS_USER_AUD = "user-aud-12345";
  env.ACCESS_AUD = "admin-aud-67890";
  env.ADMIN_EMAIL = "admin@example.test";
  env.ACCESS_JWKS_URL = "https://team.cloudflareaccess.test/certs";
  Object.assign(env, envOverrides);

  const { pair, jwk } = await getMockAdminSigning();
  const encode = value => Buffer.from(typeof value === "string" ? value : JSON.stringify(value)).toString("base64url");
  const header = encode({ alg: "RS256", kid: "test-key", typ: "JWT" });
  const now = Math.floor(Date.now() / 1000);
  const claims = encode({
    iss: env.ACCESS_ISSUER,
    aud: [env.ACCESS_USER_AUD],
    exp: now + 3600,
    nbf: now - 10,
    email: "user@example.test",
    name: "Regular User",
    ...claimsOverrides
  });
  const signingInput = header + "." + claims;
  const signature = await webcrypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5" },
    pair.privateKey,
    new TextEncoder().encode(signingInput)
  );
  const token = signingInput + "." + Buffer.from(signature).toString("base64url");
  env.__jwks = { keys: [jwk] };
  env.__token = token;
  return { env, token, jwk };
}

test("valid Cloudflare Access JWT authenticates user on /api/user/me", async () => {
  const { env, token } = await createAccessJwtToken();
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async url => url.includes("/certs")
    ? new Response(JSON.stringify(env.__jwks), { status: 200, headers: { "content-type": "application/json" } })
    : new Response("{}", { status: 404 });
  try {
    const response = await worker.fetch(new Request("https://api.test/api/user/me", {
      headers: { "origin": "https://portfolio.test", "CF-Access-Jwt-Assertion": token }
    }), env);
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.authenticated, true);
    assert.equal(typeof data.user.id, "string");
    assert.ok(data.user.id.length > 0);
    assert.equal(data.user.email, "user@example.test");
    assert.equal(data.user.name, "user@example.test");
  } finally { globalThis.fetch = oldFetch; }
});

test("Cloudflare Access user identity matches native session data contract and operates chats without id errors", async () => {
  const { env, token } = await createAccessJwtToken();
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async url => url.includes("/certs")
    ? new Response(JSON.stringify(env.__jwks), { status: 200, headers: { "content-type": "application/json" } })
    : new Response("{}", { status: 404 });
  try {
    // 1. Verify Access /api/user/me returns identical contract shape { id, email, name }
    const accessMeRes = await worker.fetch(new Request("https://api.test/api/user/me", {
      headers: { "origin": "https://portfolio.test", "CF-Access-Jwt-Assertion": token }
    }), env);
    assert.equal(accessMeRes.status, 200);
    const accessMe = await accessMeRes.json();
    assert.equal(accessMe.authenticated, true);
    assert.deepEqual(Object.keys(accessMe.user).sort(), ["email", "id", "name"]);

    // 2. Access user creates a chat
    const createRes = await worker.fetch(new Request("https://api.test/api/user/chats", {
      method: "POST",
      headers: { "origin": "https://portfolio.test", "content-type": "application/json", "CF-Access-Jwt-Assertion": token },
      body: JSON.stringify({ title: "Access User Chat" })
    }), env);
    assert.equal(createRes.status, 201);
    const { chat } = await createRes.json();
    assert.ok(chat.id);
    assert.equal(chat.title, "Access User Chat");

    // 3. Access user appends a message
    const msgRes = await worker.fetch(new Request("https://api.test/api/user/chats/" + chat.id, {
      method: "POST",
      headers: { "origin": "https://portfolio.test", "content-type": "application/json", "CF-Access-Jwt-Assertion": token },
      body: JSON.stringify({ role: "user", content: "Hello from Access session" })
    }), env);
    assert.equal(msgRes.status, 201);

    // 4. Access user reads the chat and messages
    const getRes = await worker.fetch(new Request("https://api.test/api/user/chats/" + chat.id, {
      headers: { "origin": "https://portfolio.test", "CF-Access-Jwt-Assertion": token }
    }), env);
    assert.equal(getRes.status, 200);
    const chatData = await getRes.json();
    assert.equal(chatData.chat.title, "Access User Chat");
    assert.equal(chatData.messages.length, 1);
    assert.equal(chatData.messages[0].content, "Hello from Access session");
  } finally { globalThis.fetch = oldFetch; }
});

test("expired Cloudflare Access JWT is rejected with 401", async () => {
  const now = Math.floor(Date.now() / 1000);
  const { env, token } = await createAccessJwtToken({}, { exp: now - 60 });
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async url => url.includes("/certs")
    ? new Response(JSON.stringify(env.__jwks), { status: 200, headers: { "content-type": "application/json" } })
    : new Response("{}", { status: 404 });
  try {
    const response = await worker.fetch(new Request("https://api.test/api/user/me", {
      headers: { "origin": "https://portfolio.test", "CF-Access-Jwt-Assertion": token }
    }), env);
    assert.equal(response.status, 401);
  } finally { globalThis.fetch = oldFetch; }
});

test("Cloudflare Access JWT with mismatched audience is rejected with 401", async () => {
  const { env, token } = await createAccessJwtToken({}, { aud: ["wrong-aud"] });
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async url => url.includes("/certs")
    ? new Response(JSON.stringify(env.__jwks), { status: 200, headers: { "content-type": "application/json" } })
    : new Response("{}", { status: 404 });
  try {
    const response = await worker.fetch(new Request("https://api.test/api/user/me", {
      headers: { "origin": "https://portfolio.test", "CF-Access-Jwt-Assertion": token }
    }), env);
    assert.equal(response.status, 401);
  } finally { globalThis.fetch = oldFetch; }
});

test("Cloudflare Access JWT with mismatched issuer is rejected with 401", async () => {
  const { env, token } = await createAccessJwtToken({}, { iss: "https://imposter.cloudflareaccess.test" });
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async url => url.includes("/certs")
    ? new Response(JSON.stringify(env.__jwks), { status: 200, headers: { "content-type": "application/json" } })
    : new Response("{}", { status: 404 });
  try {
    const response = await worker.fetch(new Request("https://api.test/api/user/me", {
      headers: { "origin": "https://portfolio.test", "CF-Access-Jwt-Assertion": token }
    }), env);
    assert.equal(response.status, 401);
  } finally { globalThis.fetch = oldFetch; }
});

test("Cloudflare Access JWT with tampered signature is rejected with 401", async () => {
  const { env, token } = await createAccessJwtToken();
  const parts = token.split(".");
  const tampered = parts[0] + "." + parts[1] + ".tamperedSignature";
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async url => url.includes("/certs")
    ? new Response(JSON.stringify(env.__jwks), { status: 200, headers: { "content-type": "application/json" } })
    : new Response("{}", { status: 404 });
  try {
    const response = await worker.fetch(new Request("https://api.test/api/user/me", {
      headers: { "origin": "https://portfolio.test", "CF-Access-Jwt-Assertion": tampered }
    }), env);
    assert.equal(response.status, 401);
  } finally { globalThis.fetch = oldFetch; }
});

test("invalid Access JWT cannot be bypassed using an expired session cookie", async () => {
  const env = authEnvironment();
  env.ACCESS_ISSUER = "https://team.cloudflareaccess.test";
  env.ACCESS_USER_AUD = "user-aud-12345";
  env.ACCESS_JWKS_URL = "https://team.cloudflareaccess.test/certs";

  const userId = randomUUID();
  const token = "b".repeat(64);
  const tokenHash = sha256(token + ":" + (env.SESSION_PEPPER || ""));
  env.__users.push({ id: userId, email: "olduser@example.test", display_name: "Old User" });
  env.__sessions.push({ id: randomUUID(), user_id: userId, token_hash: tokenHash, expires_at: new Date(Date.now() - 3600000).toISOString() });

  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("{}", { status: 404 });
  try {
    const response = await worker.fetch(new Request("https://api.test/api/user/me", {
      headers: {
        "origin": "https://portfolio.test",
        "CF-Access-Jwt-Assertion": "invalid.jwt.token",
        "Cookie": "__Host-portfolio_session=" + token
      }
    }), env);
    assert.equal(response.status, 401);
  } finally { globalThis.fetch = oldFetch; }
});

test("/api/models requires authentication and returns models list with defaultModel", async () => {
  const env = authEnvironment();
  const userId = randomUUID();
  const token = "c".repeat(64);
  const tokenHash = sha256(token + ":" + (env.SESSION_PEPPER || ""));
  env.__users.push({ id: userId, email: "modeluser@example.test", display_name: "Model User" });
  env.__sessions.push({ id: randomUUID(), user_id: userId, token_hash: tokenHash, expires_at: new Date(Date.now() + 86400000).toISOString() });

  // Unauthenticated request must return 401
  const unauthRes = await worker.fetch(new Request("https://api.test/api/models", {
    headers: { origin: "https://portfolio.test" }
  }), env);
  assert.equal(unauthRes.status, 401);

  // Authenticated request returns models array and defaultModel
  const authRes = await worker.fetch(new Request("https://api.test/api/models", {
    headers: { origin: "https://portfolio.test", Cookie: "__Host-portfolio_session=" + token }
  }), env);
  assert.equal(authRes.status, 200);
  const data = await authRes.json();
  assert.ok(Array.isArray(data.models));
  assert.ok(data.models.length >= 1);
  assert.ok(data.defaultModel);
  assert.equal(data.available, true);

  // Without env.AI, Workers AI models must be available: false
  const workersAiModel = data.models.find(m => m.id.startsWith("@cf/"));
  if (workersAiModel) {
    assert.equal(workersAiModel.available, false);
  }
  // Without MELEK_AI_SERVICE_URL and training status, experimental must be false
  const experimental = data.models.find(m => m.id === "melek-ai-experimental");
  if (experimental) {
    assert.equal(experimental.available, false);
  }
  // The default model must be one of the available models
  const defaultModelObj = data.models.find(m => m.id === data.defaultModel);
  assert.ok(defaultModelObj);
  assert.equal(defaultModelObj.available, true);
});

test("strict conversation isolation in D1 between different users", async () => {
  const env = authEnvironment();
  const userA = { id: randomUUID(), email: "user.a@example.test", token: "1".repeat(64) };
  const userB = { id: randomUUID(), email: "user.b@example.test", token: "2".repeat(64) };
  env.__users.push(
    { id: userA.id, email: userA.email, display_name: "User A" },
    { id: userB.id, email: userB.email, display_name: "User B" }
  );
  env.__sessions.push(
    { id: randomUUID(), user_id: userA.id, token_hash: sha256(userA.token + ":"), expires_at: new Date(Date.now() + 86400000).toISOString() },
    { id: randomUUID(), user_id: userB.id, token_hash: sha256(userB.token + ":"), expires_at: new Date(Date.now() + 86400000).toISOString() }
  );

  // User A creates a chat
  const createReq = new Request("https://api.test/api/user/chats", {
    method: "POST",
    headers: { "origin": "https://portfolio.test", "content-type": "application/json", "Cookie": "__Host-portfolio_session=" + userA.token },
    body: JSON.stringify({ title: "User A Private Chat" })
  });
  const createRes = await worker.fetch(createReq, env);
  assert.equal(createRes.status, 201);
  const { chat: { id: chatAId } } = await createRes.json();

  // User B lists their chats - must NOT see User A's chat
  const listBReq = new Request("https://api.test/api/user/chats", {
    headers: { "origin": "https://portfolio.test", "Cookie": "__Host-portfolio_session=" + userB.token }
  });
  const listBRes = await worker.fetch(listBReq, env);
  assert.equal(listBRes.status, 200);
  const listBData = await listBRes.json();
  assert.equal(listBData.chats.length, 0);

  // User B attempts direct read access to User A's chat ID - must receive 404
  const accessCrossReq = new Request("https://api.test/api/user/chats/" + chatAId, {
    headers: { "origin": "https://portfolio.test", "Cookie": "__Host-portfolio_session=" + userB.token }
  });
  const accessCrossRes = await worker.fetch(accessCrossReq, env);
  assert.equal(accessCrossRes.status, 404);

  // User B attempts to rename/modify User A's chat - must receive 404
  const modifyCrossReq = new Request("https://api.test/api/user/chats/" + chatAId, {
    method: "PUT",
    headers: { "origin": "https://portfolio.test", "content-type": "application/json", "Cookie": "__Host-portfolio_session=" + userB.token },
    body: JSON.stringify({ title: "Hijacked Title" })
  });
  const modifyCrossRes = await worker.fetch(modifyCrossReq, env);
  assert.equal(modifyCrossRes.status, 404);

  // User B attempts to append a message to User A's chat - must receive 404
  const msgCrossReq = new Request("https://api.test/api/user/chats/" + chatAId, {
    method: "POST",
    headers: { "origin": "https://portfolio.test", "content-type": "application/json", "Cookie": "__Host-portfolio_session=" + userB.token },
    body: JSON.stringify({ role: "user", content: "Injected unauthorized message" })
  });
  const msgCrossRes = await worker.fetch(msgCrossReq, env);
  assert.equal(msgCrossRes.status, 404);

  // User B attempts to delete User A's chat - must receive 404
  const deleteCrossReq = new Request("https://api.test/api/user/chats/" + chatAId, {
    method: "DELETE",
    headers: { "origin": "https://portfolio.test", "Cookie": "__Host-portfolio_session=" + userB.token }
  });
  const deleteCrossRes = await worker.fetch(deleteCrossReq, env);
  assert.equal(deleteCrossRes.status, 404);

  // User B attempts bulk delete on /api/user/chats - must NOT delete User A's chats
  const bulkDeleteBReq = new Request("https://api.test/api/user/chats", {
    method: "DELETE",
    headers: { "origin": "https://portfolio.test", "Cookie": "__Host-portfolio_session=" + userB.token }
  });
  const bulkDeleteBRes = await worker.fetch(bulkDeleteBReq, env);
  assert.equal(bulkDeleteBRes.status, 200);

  // User A verifies their chat still exists, unchanged in title and content
  const verifyAReq = new Request("https://api.test/api/user/chats/" + chatAId, {
    headers: { "origin": "https://portfolio.test", "Cookie": "__Host-portfolio_session=" + userA.token }
  });
  const verifyARes = await worker.fetch(verifyAReq, env);
  assert.equal(verifyARes.status, 200);
  const verifyAData = await verifyARes.json();
  assert.equal(verifyAData.chat.title, "User A Private Chat");
  assert.equal(verifyAData.messages.length, 0);
});

test("conversation creation, message appending, and persistence after refresh in D1 mock", async () => {
  const env = authEnvironment();
  const userId = randomUUID();
  const token = "3".repeat(64);
  env.__users.push({ id: userId, email: "persister@example.test", display_name: "Persist User" });
  env.__sessions.push({ id: randomUUID(), user_id: userId, token_hash: sha256(token + ":"), expires_at: new Date(Date.now() + 86400000).toISOString() });

  const headers = { "origin": "https://portfolio.test", "content-type": "application/json", "Cookie": "__Host-portfolio_session=" + token };

  // 1. Create chat
  const createRes = await worker.fetch(new Request("https://api.test/api/user/chats", {
    method: "POST", headers, body: JSON.stringify({ title: "Persisted Discussion" })
  }), env);
  assert.equal(createRes.status, 201);
  const { chat: { id: chatId } } = await createRes.json();

  // 2. Append user message
  const userMsgRes = await worker.fetch(new Request(`https://api.test/api/user/chats/${chatId}`, {
    method: "POST", headers, body: JSON.stringify({ role: "user", content: "Hello Melek AI!" })
  }), env);
  assert.equal(userMsgRes.status, 201);

  // 3. Append assistant message
  const assistantMsgRes = await worker.fetch(new Request(`https://api.test/api/user/chats/${chatId}`, {
    method: "POST", headers, body: JSON.stringify({ role: "assistant", content: "Hello! How can I help you today?" })
  }), env);
  assert.equal(assistantMsgRes.status, 201);

  // 4. Simulate page refresh: Fetch chat list and verify conversation exists with ordered messages
  const refreshListRes = await worker.fetch(new Request("https://api.test/api/user/chats", {
    headers: { "origin": "https://portfolio.test", "Cookie": "__Host-portfolio_session=" + token }
  }), env);
  assert.equal(refreshListRes.status, 200);
  const listData = await refreshListRes.json();
  assert.equal(listData.chats.length, 1);
  assert.equal(listData.chats[0].title, "Persisted Discussion");

  const getChatRes = await worker.fetch(new Request(`https://api.test/api/user/chats/${chatId}`, {
    headers: { "origin": "https://portfolio.test", "Cookie": "__Host-portfolio_session=" + token }
  }), env);
  assert.equal(getChatRes.status, 200);
  const chatData = await getChatRes.json();
  assert.equal(chatData.messages.length, 2);
  assert.equal(chatData.messages[0].role, "user");
  assert.equal(chatData.messages[0].content, "Hello Melek AI!");
  assert.equal(chatData.messages[1].role, "assistant");
  assert.equal(chatData.messages[1].content, "Hello! How can I help you today?");
});

test("auth lifecycle worker integration test (in-memory API): register, refresh, session expiry, login, OTP verify, and logout", async () => {
  const env = authEnvironment();
  const email = "lifecycle.user@example.test";
  const password = "StrongP@ssword2026!";

  // 1. Register new user
  const regRes = await worker.fetch(new Request("https://api.test/api/auth/register", {
    method: "POST",
    headers: { origin: "https://portfolio.test", "content-type": "application/json" },
    body: JSON.stringify({ name: "Lifecycle Tester", email, password })
  }), env);
  assert.equal(regRes.status, 200);
  const regCookieHeader = regRes.headers.get("set-cookie") || "";
  const regCookie = regCookieHeader.match(/(__Host-portfolio_session=[^;]+)/)[1];
  assert.ok(regCookie);

  // 2. Refresh simulation: Check session validity on /api/user/me
  const meRes = await worker.fetch(new Request("https://api.test/api/user/me", {
    headers: { origin: "https://portfolio.test", Cookie: regCookie }
  }), env);
  assert.equal(meRes.status, 200);
  const meData = await meRes.json();
  assert.equal(meData.authenticated, true);
  assert.equal(meData.user.email, email);
  assert.equal(meData.user.name, "Lifecycle Tester");

  // 3. Session expiry simulation: expire session in D1 mock
  for (const s of env.__sessions) {
    s.expires_at = new Date(Date.now() - 5000).toISOString();
  }
  const expiredRes = await worker.fetch(new Request("https://api.test/api/user/me", {
    headers: { origin: "https://portfolio.test", Cookie: regCookie }
  }), env);
  assert.equal(expiredRes.status, 401);

  // 4. Re-login with email & password
  const loginRes = await worker.fetch(new Request("https://api.test/api/auth/login", {
    method: "POST",
    headers: { origin: "https://portfolio.test", "content-type": "application/json" },
    body: JSON.stringify({ email, password })
  }), env);
  assert.equal(loginRes.status, 200);
  const loginCookieHeader = loginRes.headers.get("set-cookie") || "";
  const loginCookie = loginCookieHeader.match(/(__Host-portfolio_session=[^;]+)/)[1];
  assert.ok(loginCookie);

  // 5. Verify session after re-login
  const meAfterLogin = await worker.fetch(new Request("https://api.test/api/user/me", {
    headers: { origin: "https://portfolio.test", Cookie: loginCookie }
  }), env);
  assert.equal(meAfterLogin.status, 200);

  // 6. Logout
  const logoutRes = await worker.fetch(new Request("https://api.test/api/auth/logout", {
    method: "POST",
    headers: { origin: "https://portfolio.test", Cookie: loginCookie }
  }), env);
  assert.equal(logoutRes.status, 200);
  const logoutData = await logoutRes.json();
  assert.equal(logoutData.loggedOut, true);

  // Verify revoked session returns 401
  const meAfterLogout = await worker.fetch(new Request("https://api.test/api/user/me", {
    headers: { origin: "https://portfolio.test", Cookie: loginCookie }
  }), env);
  assert.equal(meAfterLogout.status, 401);

  // 7. OTP Flow: Seed challenge and verify
  seedChallenge(env, email, "654321");
  const otpVerifyRes = await worker.fetch(authRequest("/api/auth/verify", { email, code: "654321" }), env);
  assert.equal(otpVerifyRes.status, 200);
  const otpCookieHeader = otpVerifyRes.headers.get("set-cookie") || "";
  const otpCookie = otpCookieHeader.match(/(__Host-portfolio_session=[^;]+)/)[1];
  assert.ok(otpCookie);

  // Verify session established via OTP
  const meAfterOtp = await worker.fetch(new Request("https://api.test/api/user/me", {
    headers: { origin: "https://portfolio.test", Cookie: otpCookie }
  }), env);
  assert.equal(meAfterOtp.status, 200);
  const otpMeData = await meAfterOtp.json();
  assert.equal(otpMeData.user.email, email);
});
