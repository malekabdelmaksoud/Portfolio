import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
function environment(){
 const facts=[{id:"skills-001",category:"skills",text_fr:"Langages mentionnés : C, Java, Python et PHP.",text_en:"Listed programming languages include C, Java, Python and PHP.",text_ar:"لغات البرمجة المذكورة تشمل C و Java و Python و PHP.",aliases_json:'["python","java","programming"]',source_file:"index.html",source_selector:"#skillsLangagesList",public_url:null,approved:1},
 {id:"private-001",category:"profile",text_fr:"Secret private draft.",text_en:"Secret private draft.",text_ar:"مسودة خاصة سرية.",aliases_json:'["secret"]',source_file:"draft.md",source_selector:"#private",public_url:null,approved:0}];
 const DB={prepare(sql){return{bind(){return this;},async first(){return{ok:1};},async all(){if(sql.includes("FROM facts"))return{results:facts.filter(f=>sql.includes("approved=1")?f.approved===1:true)};return{results:[]};},async run(){return{meta:{changes:1}};}};}};
 return{DB,ALLOWED_ORIGIN:"https://portfolio.test",ADMIN_EMAIL:"owner@example.test"};
}
const request=(path,body,origin="https://portfolio.test")=>new Request("https://api.test"+path,{method:"POST",headers:{"content-type":"application/json",Origin:origin},body:JSON.stringify(body)});

function base64url(value){return Buffer.from(value).toString("base64url");}
async function accessToken(){
 const pair=await crypto.subtle.generateKey({name:"RSASSA-PKCS1-v1_5",modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:"SHA-256"},true,["sign","verify"]);
 const jwk=await crypto.subtle.exportKey("jwk",pair.publicKey);jwk.kid="test-key";jwk.alg="RS256";jwk.use="sig";
 const header=base64url(JSON.stringify({alg:"RS256",kid:"test-key"}));
 const payload=base64url(JSON.stringify({iss:"https://access.test",aud:["visitor-aud"],exp:Math.floor(Date.now()/1000)+300,email:"visitor@example.test"}));
 const signingInput=header+"."+payload;
 const signature=await crypto.subtle.sign("RSASSA-PKCS1-v1_5",pair.privateKey,new TextEncoder().encode(signingInput));
 return{token:signingInput+"."+base64url(signature),jwk};
}

test("health endpoint checks D1 and reports authenticated assistant mode",async()=>{
 const r=await worker.fetch(new Request("https://api.test/api/health"),environment());assert.equal(r.status,200);
 const d=await r.json();assert.equal(d.ok,true);assert.equal(d.assistant,"authenticated-llm");
});
test("assistant endpoint requires a verified Access identity",async()=>{
 const r=await worker.fetch(request("/api/assistant",{question:"What is Python?"}),environment());assert.equal(r.status,401);
 assert.match((await r.json()).error,/sign-in is not configured/i);
});
test("model catalogue requires a verified Access identity",async()=>{
 const r=await worker.fetch(new Request("https://api.test/api/models"),environment());assert.equal(r.status,401);
});
test("untrusted browser origin is rejected",async()=>{
 const r=await worker.fetch(request("/api/assistant",{question:"Python"},"https://attacker.test"),environment());assert.equal(r.status,403);
});
test("public projects endpoint exposes only visible projects",async()=>{
 const projects=[{id:"visible",visible:1},{id:"hidden",visible:0}];
 const env=environment();env.DB.prepare=(sql)=>({bind(){return this;},async all(){return{results:projects.filter(p=>sql.includes("WHERE visible=1")?p.visible===1:true)};}});
 const r=await worker.fetch(new Request("https://api.test/api/projects"),env);assert.equal(r.status,200);assert.deepEqual((await r.json()).projects.map(x=>x.id),["visible"]);
});
test("admin API refuses requests without Cloudflare Access identity",async()=>{
 const r=await worker.fetch(new Request("https://api.test/api/admin/facts"),environment());assert.equal(r.status,401);
});
test("per-user chat endpoints require a verified email Access identity",async()=>{
 const r=await worker.fetch(new Request("https://api.test/api/user/chats"),environment());assert.equal(r.status,401);
 assert.match((await r.json()).error,/sign-in is not configured/i);
});

test("original MelekGPT can be selected through its authenticated private inference adapter",async()=>{
 const {token,jwk}=await accessToken();
 const previousFetch=globalThis.fetch;
 globalThis.fetch=async input=>{
  const url=String(input);
  if(url==="https://access.test/certs")return new Response(JSON.stringify({keys:[jwk]}),{status:200});
  if(url==="https://melek-model.test/v1/chat/completions")return new Response(JSON.stringify({choices:[{message:{content:"MelekGPT test response"}}]}),{status:200});
  throw new Error("Unexpected network request: "+url);
 };
 try{
  const env={...environment(),ACCESS_ISSUER:"https://access.test",ACCESS_USER_AUD:"visitor-aud",ACCESS_JWKS_URL:"https://access.test/certs",MELEK_AI_URL:"https://melek-model.test/v1/chat/completions",MELEK_AI_TOKEN:"test-secret"};
  const req=new Request("https://api.test/api/assistant",{method:"POST",headers:{"content-type":"application/json",Origin:"https://portfolio.test","CF-Access-Jwt-Assertion":token},body:JSON.stringify({question:"Explain a simple algorithm",model:"melek-gpt-local"})});
  const response=await worker.fetch(req,env);
  assert.equal(response.status,200);
  const data=await response.json();
  assert.equal(data.model,"melek-gpt-local");
  assert.equal(data.answer,"MelekGPT test response");
 }finally{globalThis.fetch=previousFetch;}
});
