import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import { webcrypto, createHash, randomUUID } from "node:crypto";

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
 const response=await worker.fetch(new Request("https://api.test/api/auth/google",{method:"POST",headers:{"content-type":"application/json","Origin":"https://api.test"},body:'{"credential":"test"}'}),environment());
 const data=await response.json();
 assert.equal(response.status,503);
 assert.equal(data.code,"GOOGLE_NOT_CONFIGURED");
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
  const abuseWindows = new Map();
  const DB = { prepare(sql) {
    let params = [];
    return {
      bind(...values) { params = values; return this; },
      async first() {
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
      async all() { return { results: [] }; },
      async run() {
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
      },
      async batch() { return []; }
    };
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
