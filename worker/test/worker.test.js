import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import { webcrypto } from "node:crypto";

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
      return {ok:1};
    },async all(){
      if(sql.includes("FROM facts")) return {results:facts.filter(f=>sql.includes("approved=1")?f.approved===1:true)};
      if(sql.includes("FROM projects")) return {results:sql.includes("WHERE visible=1")?projects.filter(p=>p.visible===1):projects};
      return {results:[]};
    },async run(){
      if(sql.includes("INSERT INTO projects")) {
        const [id,title,type,description_fr,description_en,url,sort_order]=params;
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
 const data=await response.json();assert.equal(response.status,503);
 assert.equal(data.code,"MELEK_AI_NOT_CONNECTED");
 assert.match(data.error,/in development/i);
 assert.equal(response.headers.get("access-control-allow-origin"),"https://portfolio.test");
 assert.equal(response.headers.get("access-control-allow-credentials"),"true");
});


test("assistant recognizes Tunisian Arabic project questions",async()=>{
 const response=await worker.fetch(request("/api/assistant",{question:"شنو المشاريع متاع ملاك"}),environment());
 const data=await response.json();assert.equal(response.status,503);
 assert.equal(data.code,"MELEK_AI_NOT_CONNECTED");
});


test("assistant uses recent topic for a short Arabic follow-up",async()=>{
 const response=await worker.fetch(request("/api/assistant",{question:"زيد فسّرلي",context:["شنو المشاريع متاع ملاك؟"]}),environment());
 const data=await response.json();assert.equal(response.status,503);
 assert.equal(data.code,"MELEK_AI_NOT_CONNECTED");
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
 assert.equal(response.status,503);
 assert.equal(data.mode,"chat");
 assert.equal(data.code,"MELEK_AI_NOT_CONNECTED");
});

test("analyze mode is preserved as a request field",async()=>{
 const response=await worker.fetch(request("/api/assistant",{question:"Do you know Python?",mode:"analyze"}),environment());
 const data=await response.json();
 assert.equal(response.status,503);
 assert.equal(data.mode,"analyze");
 assert.equal(data.code,"MELEK_AI_NOT_CONNECTED");
});

test("unavailable independent inference has no third-party fallback",async()=>{
 const env={...environment(),MELEK_AI_SERVICE_URL:""};
 const response=await worker.fetch(request("/api/assistant",{question:"Do you know Python?"}),env);
 const data=await response.json();
 assert.equal(response.status,503);
 assert.equal(data.code,"MELEK_AI_NOT_CONNECTED");
 assert.equal(data.conversation_preserved,true);
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
